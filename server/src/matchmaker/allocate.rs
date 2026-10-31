//! Matchmaker placement for `createJoinTicket` (multiplayer spec 8.3 "Allocation"): the fullest live server of the
//! place with room, in the requested region first; otherwise a new server on a host with spare capacity, which the
//! host agent starts when its next heartbeat response carries the `start` order.
//!
//! Race safety: quick joins for one place serialize on a transaction-scoped advisory lock, so two joins can never
//! both decide to allocate. Every placement then takes the server row lock (`FOR UPDATE`) and recounts players plus
//! pending reservations (unredeemed, unexpired tickets bound to the server) before binding a ticket, so explicit
//! `serverId` joins, follows and quick joins cannot overfill a server. Allocation locks all candidate host rows in
//! one statement, in id order (no deadlock between allocations preferring different hosts), and recounts each host's
//! servers before inserting. Lock order everywhere: the caller's ticket rows, place advisory lock, server rows, host
//! rows. `connectJoinTicket` binds unbound tickets with the same reservation count ([`has_room`]).

use std::collections::HashSet;

use sqlx::{PgConnection, Postgres, Transaction};

use crate::{ids::IdGenerator, problem::ApiResult};

/// Servers with at least this many slots keep one slot free for friends: quick join stops one short of full;
/// follows (and joins to a server where the viewer has a friend) may use it.
pub const RESERVE_FROM_SIZE: i32 = 8;
/// What a `pending` answer tells the client to wait before asking again.
pub const PENDING_RETRY_SECS: i64 = 2;
/// What a `no_capacity` answer tells the client to wait.
pub const NO_CAPACITY_RETRY_SECS: i64 = 10;

pub fn reserve(max_players: i32) -> i32 {
    i32::from(max_players >= RESERVE_FROM_SIZE)
}

const PENDING: &str = "SELECT count(DISTINCT t.user_id) FROM matchmaker.join_tickets t \
    WHERE t.server_id = $1 AND t.redeemed_at IS NULL AND t.expires_at > clock_timestamp() \
    AND t.user_id <> $2 AND NOT (t.user_id = ANY($3))";

/// SQL condition on an unaliased `matchmaker.servers` row: it has room for the viewer bound to `viewer` (a
/// placeholder such as `$3`): already in it, or players plus pending reservations (other accounts' unredeemed,
/// unexpired tickets bound to it) below `max_players`. Unbound tickets never had a friend reserve, so none here.
pub fn room_for(viewer: &str) -> String {
    format!(
        "({viewer} = ANY(player_ids) OR cardinality(player_ids) + (SELECT count(DISTINCT t.user_id) \
         FROM matchmaker.join_tickets t WHERE t.server_id = servers.id AND t.redeemed_at IS NULL \
         AND t.expires_at > clock_timestamp() AND t.user_id <> {viewer} AND NOT (t.user_id = ANY(player_ids))) \
         < max_players)"
    )
}

/// Recounts [`room_for`] on a server row the caller has already locked, so concurrent binds see each other.
pub async fn has_room(conn: &mut PgConnection, server: i64, viewer: i64) -> ApiResult<bool> {
    Ok(sqlx::query_scalar::<_, bool>(sqlx::AssertSqlSafe(format!(
        "SELECT {} FROM matchmaker.servers WHERE id = $1",
        room_for("$2")
    )))
    .bind(server)
    .bind(viewer)
    .fetch_optional(conn)
    .await?
    .unwrap_or(false))
}

#[derive(sqlx::FromRow)]
struct Candidate {
    id: i64,
    region: String,
    status: String,
    max_players: i32,
    player_ids: Vec<i64>,
    pending: i64,
}

impl Candidate {
    fn occupied(&self) -> i64 {
        self.player_ids.len() as i64 + self.pending
    }
    fn room(&self, keep_reserve: bool) -> i64 {
        let reserve = if keep_reserve {
            reserve(self.max_players)
        } else {
            0
        };
        i64::from(self.max_players - reserve) - self.occupied()
    }
}

#[derive(sqlx::FromRow)]
struct SlotRow {
    region: String,
    place_id: i64,
    status: String,
    desired: String,
    joinable: bool,
    max_players: i32,
    player_ids: Vec<i64>,
    fresh: bool,
    host_ok: bool,
}

/// Outcome of a locked capacity check on one server.
pub enum Room {
    /// Not live (unknown, stopped, silent, wrong game).
    Gone,
    /// Live but full, draining or closed to joins.
    Full,
    /// A slot is held for this transaction: bind the ticket before committing.
    Held { region: String, place: i64 },
}

/// Locks one server and checks it can take `viewer` with a ticket of `kind` (`play`, `edit`, `test`), counting
/// pending reservations. `keep_reserve` leaves the friend slot free. A server of another kind is `Gone`.
pub async fn hold_slot(
    tx: &mut Transaction<'_, Postgres>,
    server: i64,
    game: i64,
    viewer: i64,
    kind: &str,
    keep_reserve: bool,
) -> ApiResult<Room> {
    let row: Option<SlotRow> = sqlx::query_as(
        "SELECT region, place_id, status, desired, joinable, max_players, player_ids, \
         last_heartbeat_at > now() - interval '30 seconds' AS fresh, \
         (host_id IS NULL OR EXISTS (SELECT 1 FROM matchmaker.hosts h WHERE h.id = host_id \
            AND h.status = 'active' AND h.last_seen_at > now() - interval '30 seconds')) AS host_ok \
         FROM matchmaker.servers WHERE id = $1 AND game_id = $2 AND kind = $3 AND status <> 'stopped' \
         FOR UPDATE",
    )
    .bind(server)
    .bind(game)
    .bind(kind)
    .fetch_optional(&mut **tx)
    .await?;
    let Some(SlotRow {
        region,
        place_id: place,
        status,
        desired,
        joinable,
        max_players: max,
        player_ids: players,
        fresh,
        host_ok,
    }) = row
    else {
        return Ok(Room::Gone);
    };
    if !fresh || !host_ok || status == "starting" {
        return Ok(Room::Gone);
    }
    if status != "running" || desired != "run" || !joinable {
        return Ok(Room::Full);
    }
    if players.contains(&viewer) {
        return Ok(Room::Held { region, place });
    }
    let pending: i64 = sqlx::query_scalar(PENDING)
        .bind(server)
        .bind(viewer)
        .bind(&players)
        .fetch_one(&mut **tx)
        .await?;
    let reserve = if keep_reserve { reserve(max) } else { 0 };
    if players.len() as i64 + pending < i64::from(max - reserve) {
        Ok(Room::Held { region, place })
    } else {
        Ok(Room::Full)
    }
}

/// Everything a quick join needs.
pub struct QuickJoin<'a> {
    pub game: i64,
    pub place: i64,
    pub viewer: i64,
    pub region: Option<&'a str>,
    pub friends: &'a HashSet<i64>,
    pub hidden: &'a HashSet<i64>,
    /// Size of a newly allocated server (the game's `max_players`).
    pub new_server_players: i32,
}

pub enum Placement {
    /// A slot on a running server is held in this transaction.
    Ready { server: i64, region: String },
    /// A server for this place is starting (possibly allocated just now): ask again shortly.
    Pending,
    /// Host agents are registered but none is active, live and has room.
    NoCapacity,
    /// No host agent ever registered (legacy deployment): issue an unbound ticket as before.
    NoHost,
}

/// Quick-join placement (no `serverId`, no `followUserId`). Commits nothing itself; the caller commits after
/// binding the ticket (Ready) or to persist an allocation (Pending).
pub async fn quick_place(
    tx: &mut Transaction<'_, Postgres>,
    ids: &IdGenerator,
    q: &QuickJoin<'_>,
) -> ApiResult<Placement> {
    sqlx::query("SELECT pg_advisory_xact_lock(hashtext('matchmaker.place'), hashtext($1::text))")
        .bind(q.place)
        .execute(&mut **tx)
        .await?;
    let candidates: Vec<Candidate> = sqlx::query_as(
        "SELECT s.id, s.region, s.status, s.max_players, s.player_ids, \
         (SELECT count(DISTINCT t.user_id) FROM matchmaker.join_tickets t WHERE t.server_id = s.id \
            AND t.redeemed_at IS NULL AND t.expires_at > clock_timestamp() AND t.user_id <> $3 \
            AND NOT (t.user_id = ANY(s.player_ids))) AS pending \
         FROM matchmaker.servers s WHERE s.game_id = $1 AND s.place_id = $2 AND s.desired = 'run' AND s.kind = 'play' \
         AND ((s.status = 'running' AND s.joinable AND s.last_heartbeat_at > now() - interval '30 seconds') \
           OR (s.status = 'starting' AND s.host_id IS NOT NULL AND s.started_at > now() - interval '60 seconds')) \
         AND (s.host_id IS NULL OR EXISTS (SELECT 1 FROM matchmaker.hosts h WHERE h.id = s.host_id \
            AND h.status = 'active' AND h.last_seen_at > now() - interval '30 seconds')) \
         ORDER BY s.id LIMIT 500",
    )
    .bind(q.game)
    .bind(q.place)
    .bind(q.viewer)
    .fetch_all(&mut **tx)
    .await?;

    let mut running: Vec<&Candidate> = candidates
        .iter()
        .filter(|c| {
            c.status == "running"
                && c.room(true) > 0
                && !c.player_ids.iter().any(|p| q.hidden.contains(p))
        })
        .collect();
    let friends_in = |c: &Candidate| {
        c.player_ids
            .iter()
            .filter(|p| q.friends.contains(p))
            .count()
    };
    // Requested region first, then friends, then the fullest (fill servers before spreading players out).
    running.sort_by(|a, b| {
        let region = |c: &Candidate| q.region.is_some_and(|r| r == c.region);
        region(b)
            .cmp(&region(a))
            .then_with(|| friends_in(b).cmp(&friends_in(a)))
            .then_with(|| b.occupied().cmp(&a.occupied()))
            .then_with(|| a.id.cmp(&b.id))
    });
    for c in running.iter().take(5) {
        if let Room::Held { region, .. } =
            hold_slot(tx, c.id, q.game, q.viewer, "play", true).await?
        {
            return Ok(Placement::Ready {
                server: c.id,
                region,
            });
        }
    }
    if candidates
        .iter()
        .any(|c| c.status == "starting" && c.room(false) > 0)
    {
        return Ok(Placement::Pending);
    }
    allocate(tx, ids, q).await
}

/// Allocates a new `starting` server on the best host: the requested region first, then the fewest servers.
async fn allocate(
    tx: &mut Transaction<'_, Postgres>,
    ids: &IdGenerator,
    q: &QuickJoin<'_>,
) -> ApiResult<Placement> {
    let hosts: Vec<(i64, String)> = sqlx::query_as(
        "SELECT h.id, h.region FROM matchmaker.hosts h WHERE h.status = 'active' AND h.registered_at IS NOT NULL \
         AND h.last_seen_at > now() - interval '30 seconds' \
         ORDER BY (h.region = $1) DESC, \
           (SELECT count(*) FROM matchmaker.servers s WHERE s.host_id = h.id AND s.status <> 'stopped'), h.id \
         LIMIT 20",
    )
    .bind(q.region.unwrap_or(""))
    .fetch_all(&mut **tx)
    .await?;
    if hosts.is_empty() {
        // A fleet that is draining or silent is out of capacity; only a deployment that never had a host agent
        // falls back to the legacy unbound ticket.
        let fleet: bool = sqlx::query_scalar(
            "SELECT EXISTS (SELECT 1 FROM matchmaker.hosts WHERE registered_at IS NOT NULL AND status <> 'disabled')",
        )
        .fetch_one(&mut **tx)
        .await?;
        return Ok(if fleet {
            Placement::NoCapacity
        } else {
            Placement::NoHost
        });
    }
    // Lock every candidate host in one statement, in id order, then recount under the locks. A fixed lock order means
    // concurrent allocations for different places and regions (each preferring other hosts) cannot deadlock; they
    // serialize on the hosts they share.
    let candidates: Vec<i64> = hosts.iter().map(|h| h.0).collect();
    let locked: Vec<(i64, i32, i32)> = sqlx::query_as(
        "SELECT id, least(max_servers, coalesce(cap_servers, max_servers)), \
         least(max_players, coalesce(cap_players, max_players)) \
         FROM matchmaker.hosts WHERE id = ANY($1) AND status = 'active' ORDER BY id FOR UPDATE",
    )
    .bind(&candidates)
    .fetch_all(&mut **tx)
    .await?;
    for (host, region) in hosts {
        let Some(&(_, max_servers, max_players)) = locked.iter().find(|l| l.0 == host) else {
            continue;
        };
        let (servers, players): (i64, i64) = sqlx::query_as(
            "SELECT count(*), coalesce(sum(max_players), 0)::bigint FROM matchmaker.servers \
             WHERE host_id = $1 AND status <> 'stopped'",
        )
        .bind(host)
        .fetch_one(&mut **tx)
        .await?;
        if servers >= i64::from(max_servers)
            || players + i64::from(q.new_server_players) > i64::from(max_players)
        {
            continue;
        }
        sqlx::query(
            "INSERT INTO matchmaker.servers (id, game_id, place_id, region, status, max_players, joinable, host_id) \
             VALUES ($1, $2, $3, $4, 'starting', $5, false, $6)",
        )
        .bind(ids.next())
        .bind(q.game)
        .bind(q.place)
        .bind(&region)
        .bind(q.new_server_players)
        .bind(host)
        .execute(&mut **tx)
        .await?;
        return Ok(Placement::Pending);
    }
    Ok(Placement::NoCapacity)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reserve_only_on_larger_servers() {
        assert_eq!(reserve(2), 0);
        assert_eq!(reserve(7), 0);
        assert_eq!(reserve(8), 1);
        assert_eq!(reserve(200), 1);
        let c = Candidate {
            id: 1,
            region: "us-central".into(),
            status: "running".into(),
            max_players: 10,
            player_ids: (1..=7).collect(),
            pending: 2,
        };
        assert_eq!(c.room(true), 0, "the last slot stays free for friends");
        assert_eq!(c.room(false), 1);
    }
}
