//! `metallic-platform seed`: fictitious demo data so the web app can run against the real API.
//!
//! Every name here is invented. Emails use `example.com`, images use the reserved `metallic.example` domain.
//! Ids are fixed, so running the seed twice changes nothing. Credits and items go through the economy ledger with
//! fixed idempotency keys like every other money movement. Refused in production.

use sqlx::PgConnection;

use crate::{
    AppState, crypto, economy,
    identity::AgeBand,
    problem::{ApiResult, Problem},
    social,
};

/// Fixed id range for seed rows (well below ids the generator hands out today).
const BASE: i64 = 1_000_000_000_000_000;

pub const FIRST_PARTY_USER: i64 = BASE + 1;

struct DemoUser {
    n: i64,
    username: &'static str,
    display: &'static str,
    band: AgeBand,
    birth: &'static str,
    bio: &'static str,
}

const USERS: &[DemoUser] = &[
    DemoUser {
        n: 1,
        username: "Metallic",
        display: "Metallic",
        band: AgeBand::Adult,
        birth: "1990-01-01",
        bio: "Official Metallic account.",
    },
    DemoUser {
        n: 2,
        username: "nova_pilot",
        display: "Nova Pilot",
        band: AgeBand::Adult,
        birth: "1996-04-12",
        bio: "Speedrunner. Obby fan. Always up for a race.",
    },
    DemoUser {
        n: 3,
        username: "quartz_fox",
        display: "Quartz Fox",
        band: AgeBand::Adult,
        birth: "1993-09-30",
        bio: "I build tycoons and break them.",
    },
    DemoUser {
        n: 4,
        username: "ember_lane",
        display: "Ember Lane",
        band: AgeBand::Adult,
        birth: "1999-02-17",
        bio: "Horror games at night only.",
    },
    DemoUser {
        n: 5,
        username: "pixel_otter",
        display: "Pixel Otter",
        band: AgeBand::Adult,
        birth: "2001-07-03",
        bio: "Puzzles, parkour and snacks.",
    },
    DemoUser {
        n: 6,
        username: "rivet_jay",
        display: "Rivet Jay",
        band: AgeBand::Age16To17,
        birth: "2009-11-21",
        bio: "Racing and building.",
    },
    DemoUser {
        n: 7,
        username: "tiny_comet",
        display: "Tiny Comet",
        band: AgeBand::Under13,
        birth: "2016-05-09",
        bio: "",
    },
];

struct DemoGame {
    n: i64,
    name: &'static str,
    slug: &'static str,
    genres: &'static [&'static str],
    label: &'static str,
    first_party: bool,
    creator: i64,
    max_players: i32,
    visits: i64,
    playing: i32,
    up: i32,
    down: i32,
    age_days: i32,
    description: &'static str,
}

const GAMES: &[DemoGame] = &[
    DemoGame {
        n: 101,
        name: "Skyline Sprint",
        slug: "skyline-sprint",
        genres: &["obby"],
        label: "everyone",
        first_party: true,
        creator: 1,
        max_players: 24,
        visits: 1_840_000,
        playing: 3120,
        up: 41_200,
        down: 2_900,
        age_days: 120,
        description: "Rooftop parkour across a city that rebuilds itself every round.",
    },
    DemoGame {
        n: 102,
        name: "Rust Bucket Rally",
        slug: "rust-bucket-rally",
        genres: &["racing"],
        label: "everyone",
        first_party: false,
        creator: 3,
        max_players: 12,
        visits: 960_000,
        playing: 1480,
        up: 18_300,
        down: 2_100,
        age_days: 90,
        description: "Scrapyard karts, magnet boosts and a finish line that moves.",
    },
    DemoGame {
        n: 103,
        name: "Copper Coast Tycoon",
        slug: "copper-coast-tycoon",
        genres: &["tycoon", "simulator"],
        label: "everyone",
        first_party: false,
        creator: 3,
        max_players: 8,
        visits: 2_310_000,
        playing: 2650,
        up: 30_500,
        down: 4_800,
        age_days: 200,
        description: "Start with one dock and grow a harbour empire.",
    },
    DemoGame {
        n: 104,
        name: "Hollow Lantern",
        slug: "hollow-lantern",
        genres: &["horror", "adventure"],
        label: "moderate",
        first_party: false,
        creator: 4,
        max_players: 6,
        visits: 540_000,
        playing: 870,
        up: 9_800,
        down: 1_200,
        age_days: 60,
        description: "Keep the lantern lit. Something in the mill does not like light.",
    },
    DemoGame {
        n: 105,
        name: "Gearball League",
        slug: "gearball-league",
        genres: &["sports"],
        label: "everyone",
        first_party: true,
        creator: 1,
        max_players: 16,
        visits: 1_120_000,
        playing: 1930,
        up: 22_100,
        down: 1_700,
        age_days: 150,
        description: "Five-a-side football with rocket boots.",
    },
    DemoGame {
        n: 106,
        name: "Bolt Brigade",
        slug: "bolt-brigade",
        genres: &["shooter"],
        label: "moderate",
        first_party: false,
        creator: 2,
        max_players: 20,
        visits: 1_470_000,
        playing: 2240,
        up: 25_600,
        down: 5_300,
        age_days: 75,
        description: "Team arena with foam blasters and grappling hooks.",
    },
    DemoGame {
        n: 107,
        name: "Moonwell Village",
        slug: "moonwell-village",
        genres: &["roleplay", "social"],
        label: "everyone",
        first_party: false,
        creator: 5,
        max_players: 30,
        visits: 3_050_000,
        playing: 4210,
        up: 52_000,
        down: 6_100,
        age_days: 320,
        description: "Run the bakery, the post office or the lighthouse.",
    },
    DemoGame {
        n: 108,
        name: "Magnet Miners",
        slug: "magnet-miners",
        genres: &["simulator"],
        label: "everyone",
        first_party: false,
        creator: 3,
        max_players: 12,
        visits: 780_000,
        playing: 990,
        up: 12_400,
        down: 1_900,
        age_days: 45,
        description: "Dig, upgrade your magnet, dig deeper.",
    },
    DemoGame {
        n: 109,
        name: "Tin Tower Defense",
        slug: "tin-tower-defense",
        genres: &["strategy"],
        label: "everyone",
        first_party: false,
        creator: 2,
        max_players: 4,
        visits: 430_000,
        playing: 610,
        up: 7_900,
        down: 800,
        age_days: 30,
        description: "Wind-up towers against a parade of clockwork beetles.",
    },
    DemoGame {
        n: 110,
        name: "Prism Puzzle Lab",
        slug: "prism-puzzle-lab",
        genres: &["puzzle"],
        label: "everyone",
        first_party: true,
        creator: 1,
        max_players: 4,
        visits: 260_000,
        playing: 340,
        up: 5_600,
        down: 300,
        age_days: 10,
        description: "Bend light through glass rooms with a friend.",
    },
    DemoGame {
        n: 111,
        name: "Scrapyard Survival",
        slug: "scrapyard-survival",
        genres: &["survival"],
        label: "mild",
        first_party: false,
        creator: 4,
        max_players: 10,
        visits: 690_000,
        playing: 1120,
        up: 11_000,
        down: 2_600,
        age_days: 100,
        description: "Build shelter from junk before the storm rolls in.",
    },
    DemoGame {
        n: 112,
        name: "Chrome Canyon Quest",
        slug: "chrome-canyon-quest",
        genres: &["adventure"],
        label: "everyone",
        first_party: false,
        creator: 5,
        max_players: 8,
        visits: 350_000,
        playing: 420,
        up: 6_200,
        down: 700,
        age_days: 8,
        description: "Map the canyon, find the five lost beacons.",
    },
    DemoGame {
        n: 113,
        name: "Block Party Bash",
        slug: "block-party-bash",
        genres: &["party"],
        label: "everyone",
        first_party: false,
        creator: 2,
        max_players: 16,
        visits: 1_620_000,
        playing: 2010,
        up: 27_300,
        down: 3_400,
        age_days: 180,
        description: "Twenty quick minigames, one champion.",
    },
    DemoGame {
        n: 114,
        name: "Forge & Frame",
        slug: "forge-and-frame",
        genres: &["building"],
        label: "everyone",
        first_party: false,
        creator: 3,
        max_players: 12,
        visits: 410_000,
        playing: 560,
        up: 8_100,
        down: 900,
        age_days: 5,
        description: "Weld, bolt and paint your dream machine, then race it.",
    },
    DemoGame {
        n: 115,
        name: "Arena of Alloys",
        slug: "arena-of-alloys",
        genres: &["fighting"],
        label: "mild",
        first_party: false,
        creator: 4,
        max_players: 8,
        visits: 720_000,
        playing: 880,
        up: 10_300,
        down: 2_200,
        age_days: 130,
        description: "Pick a metal, learn its moves, climb the ladder.",
    },
    DemoGame {
        n: 116,
        name: "Hangout Harbor",
        slug: "hangout-harbor",
        genres: &["social"],
        label: "everyone",
        first_party: false,
        creator: 5,
        max_players: 40,
        visits: 1_980_000,
        playing: 2780,
        up: 33_800,
        down: 4_000,
        age_days: 260,
        description: "Boats, fishing and a stage for open mic night.",
    },
];

struct DemoItem {
    n: i64,
    name: &'static str,
    category: &'static str,
    price: Option<i64>,
    limited: Option<i32>,
    description: &'static str,
}

const ITEMS: &[DemoItem] = &[
    DemoItem {
        n: 201,
        name: "Chrome Visor",
        category: "face_accessory",
        price: Some(120),
        limited: None,
        description: "Reflects the sky.",
    },
    DemoItem {
        n: 202,
        name: "Rivet Cap",
        category: "hat",
        price: Some(0),
        limited: None,
        description: "A starter classic.",
    },
    DemoItem {
        n: 203,
        name: "Copper Crown",
        category: "hat",
        price: Some(950),
        limited: Some(500),
        description: "Only 500 ever made.",
    },
    DemoItem {
        n: 204,
        name: "Spark Mohawk",
        category: "hair",
        price: Some(80),
        limited: None,
        description: "Stays up in any weather.",
    },
    DemoItem {
        n: 205,
        name: "Calm Smile",
        category: "face",
        price: Some(0),
        limited: None,
        description: "Friendly default face.",
    },
    DemoItem {
        n: 206,
        name: "Gear Scarf",
        category: "neck",
        price: Some(60),
        limited: None,
        description: "Knitted from soft wire.",
    },
    DemoItem {
        n: 207,
        name: "Jet Pack Mk I",
        category: "back",
        price: Some(400),
        limited: None,
        description: "Decorative. Mostly.",
    },
    DemoItem {
        n: 208,
        name: "Tool Belt",
        category: "waist",
        price: Some(45),
        limited: None,
        description: "Holds everything but your keys.",
    },
    DemoItem {
        n: 209,
        name: "Graphite Hoodie",
        category: "shirt",
        price: Some(0),
        limited: None,
        description: "Starter hoodie.",
    },
    DemoItem {
        n: 210,
        name: "Cargo Trousers",
        category: "pants",
        price: Some(0),
        limited: None,
        description: "Many pockets.",
    },
    DemoItem {
        n: 211,
        name: "Mag Boots",
        category: "shoes",
        price: Some(150),
        limited: None,
        description: "Stick to any metal floor.",
    },
    DemoItem {
        n: 212,
        name: "Victory Spin",
        category: "emote",
        price: Some(75),
        limited: None,
        description: "For podium moments.",
    },
    DemoItem {
        n: 213,
        name: "Shoulder Drone",
        category: "shoulder",
        price: Some(300),
        limited: None,
        description: "A small friend that hums.",
    },
    DemoItem {
        n: 214,
        name: "Titan Starter Pack",
        category: "bundle",
        price: None,
        limited: None,
        description: "Not for sale. Given at events.",
    },
];

/// Starter items every demo user owns, and what each equips.
const STARTER_ITEMS: [i64; 4] = [202, 205, 209, 210];
const EXTRA_ITEMS: &[(i64, &[i64])] = &[(2, &[201, 211, 213]), (3, &[204, 206]), (4, &[208])];

fn uid(n: i64) -> i64 {
    BASE + n
}

fn cdn(kind: &str, slug: &str) -> String {
    format!("https://cdn.metallic.example/demo/{kind}/{slug}.webp")
}

/// Loads the demo data. `password` is the demo accounts' password.
pub async fn run(state: &AppState, password: &str) -> ApiResult<()> {
    if state.config.environment == crate::config::Environment::Prod {
        return Err(Problem::forbidden(
            "seed_refused",
            "The seed command does not run in production",
        ));
    }
    let mut tx = state.db.begin().await?;
    let pw_hash = crypto::hash_password(password);
    for u in USERS {
        insert_user(&mut tx, state, u, &pw_hash).await?;
    }
    insert_social(&mut tx).await?;
    insert_games(&mut tx).await?;
    insert_catalog(&mut tx, state).await?;
    tx.commit().await?;
    Ok(())
}

async fn insert_user(
    conn: &mut PgConnection,
    state: &AppState,
    u: &DemoUser,
    pw_hash: &str,
) -> ApiResult<()> {
    let id = uid(u.n);
    let email = format!("{}@example.com", u.username.to_lowercase());
    let exists: bool =
        sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM identity.users WHERE id = $1)")
            .bind(id)
            .fetch_one(&mut *conn)
            .await?;
    if exists {
        return Ok(());
    }
    sqlx::query("INSERT INTO identity.persons (id) VALUES ($1) ON CONFLICT DO NOTHING")
        .bind(id)
        .execute(&mut *conn)
        .await?;
    sqlx::query(
        "INSERT INTO identity.users (id, username, display_name, bio, email_ciphertext, email_hash, email_verified_at, \
             birth_date_ciphertext, age_band, status, person_id, is_first_party, created_at) \
         VALUES ($1, $2, $3, $4, $5, $6, now() - interval '30 days', $7, $8, 'active', $1, $9, now() - interval '400 days')",
    )
    .bind(id)
    .bind(u.username)
    .bind(u.display)
    .bind(u.bio)
    .bind(crypto::encrypt(&state.secrets.data_key, "email", email.as_bytes()))
    .bind(crypto::email_hash(&state.secrets.hmac_key, &email))
    .bind(crypto::encrypt(&state.secrets.data_key, "birth_date", u.birth.as_bytes()))
    .bind(u.band.as_str())
    .bind(u.n == 1)
    .execute(&mut *conn)
    .await?;
    sqlx::query("INSERT INTO identity.credentials (user_id, password_hash) VALUES ($1, $2) ON CONFLICT DO NOTHING")
        .bind(id)
        .bind(pw_hash)
        .execute(&mut *conn)
        .await?;
    social::create_default_settings(conn, id, u.band).await?;
    if u.band == AgeBand::Adult && u.n != 1 {
        social::replace_social_links(conn, id, &[("youtube".into(), format!("@{}", u.username))])
            .await?;
    }
    Ok(())
}

async fn insert_social(conn: &mut PgConnection) -> ApiResult<()> {
    for (a, b) in [(2, 3), (2, 4), (2, 5), (3, 4)] {
        if !social::are_friends(&mut *conn, uid(a), uid(b)).await? {
            social::make_friends(conn, uid(a), uid(b)).await?;
        }
    }
    sqlx::query("INSERT INTO social.friend_requests (id, from_user, to_user) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING")
        .bind(BASE + 900)
        .bind(uid(6))
        .bind(uid(2))
        .execute(&mut *conn)
        .await?;
    Ok(())
}

async fn insert_games(conn: &mut PgConnection) -> ApiResult<()> {
    for (i, (code, name)) in [
        ("us-east", "US East"),
        ("eu-central", "Europe"),
        ("sa-east", "South America"),
    ]
    .iter()
    .enumerate()
    {
        sqlx::query("INSERT INTO matchmaker.regions (code, name, probe_url, position) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING")
            .bind(code)
            .bind(name)
            .bind(format!("https://probe-{code}.metallic.example/ping"))
            .bind(i as i16 + 1)
            .execute(&mut *conn)
            .await?;
    }
    for g in GAMES {
        let id = BASE + g.n;
        let place = BASE + 1000 + g.n;
        let creator = USERS
            .iter()
            .find(|u| u.n == g.creator)
            .map_or("Metallic", |u| u.display);
        let platforms: Vec<String> = if g.n % 3 == 0 {
            vec!["windows".into(), "macos".into()]
        } else {
            vec![
                "windows".into(),
                "macos".into(),
                "linux".into(),
                "android".into(),
                "ios".into(),
            ]
        };
        let genres: Vec<String> = g.genres.iter().map(|s| (*s).to_owned()).collect();
        let inserted = sqlx::query(
            "INSERT INTO games.games (id, owner_kind, owner_id, creator_name, name, description, genres, content_label, status, \
                 max_players, platforms, is_first_party, start_place_id, icon_url, thumbnail_url, visits, playing_snapshot, \
                 created_at, updated_at) \
             VALUES ($1, 'user', $2, $3, $4, $5, $6, $7, 'public', $8, $9, $10, $11, $12, $13, $14, $15, \
                 now() - make_interval(days => $16), now() - make_interval(days => $16 / 3)) \
             ON CONFLICT (id) DO NOTHING",
        )
        .bind(id)
        .bind(uid(g.creator))
        .bind(creator)
        .bind(g.name)
        .bind(g.description)
        .bind(&genres)
        .bind(g.label)
        .bind(g.max_players)
        .bind(&platforms)
        .bind(g.first_party)
        .bind(place)
        .bind(cdn("icons", g.slug))
        .bind(cdn("thumbnails", g.slug))
        .bind(g.visits)
        .bind(g.playing)
        .bind(g.age_days)
        .execute(&mut *conn)
        .await?;
        if inserted.rows_affected() == 0 {
            continue;
        }
        sqlx::query("INSERT INTO games.places (id, game_id, name) VALUES ($1, $2, 'Start')")
            .bind(place)
            .bind(id)
            .execute(&mut *conn)
            .await?;
        for pos in 0..3i16 {
            sqlx::query("INSERT INTO games.game_media (game_id, kind, url, position) VALUES ($1, 'screenshot', $2, $3)")
                .bind(id)
                .bind(cdn("screenshots", &format!("{}-{}", g.slug, pos + 1)))
                .bind(pos)
                .execute(&mut *conn)
                .await?;
        }
        sqlx::query("INSERT INTO games.rating_totals (game_id, up, down) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING")
            .bind(id)
            .bind(g.up)
            .bind(g.down)
            .execute(&mut *conn)
            .await?;
    }
    for (pos, n) in [101, 107, 104, 112].iter().enumerate() {
        sqlx::query("INSERT INTO discovery.featured (game_id, position) VALUES ($1, $2) ON CONFLICT DO NOTHING")
            .bind(BASE + n)
            .bind(pos as i16 + 1)
            .execute(&mut *conn)
            .await?;
    }
    // nova_pilot's library: favourites and play history.
    for (n, days) in [(101, 1), (107, 3)] {
        sqlx::query("INSERT INTO games.favorites (user_id, game_id, created_at) VALUES ($1, $2, now() - make_interval(days => $3)) ON CONFLICT DO NOTHING")
            .bind(uid(2))
            .bind(BASE + n)
            .bind(days)
            .execute(&mut *conn)
            .await?;
    }
    for (n, hours, seconds) in [
        (101, 2, 5400),
        (102, 26, 1800),
        (113, 50, 3600),
        (110, 80, 900),
    ] {
        sqlx::query(
            "INSERT INTO games.play_history (user_id, game_id, last_played_at, seconds) \
             VALUES ($1, $2, now() - make_interval(hours => $3), $4) ON CONFLICT DO NOTHING",
        )
        .bind(uid(2))
        .bind(BASE + n)
        .bind(hours)
        .bind(seconds as i64)
        .execute(&mut *conn)
        .await?;
    }
    Ok(())
}

async fn insert_catalog(conn: &mut PgConnection, state: &AppState) -> ApiResult<()> {
    for it in ITEMS {
        sqlx::query(
            "INSERT INTO catalog.items (id, creator_kind, creator_id, creator_name, creator_first_party, category, name, description, \
                 thumbnail_url, price, on_sale, limited_supply, limited_remaining, created_at) \
             VALUES ($1, 'user', $2, 'Metallic', true, $3, $4, $5, $6, $7, $8, $9, $9, now() - make_interval(days => $10)) \
             ON CONFLICT (id) DO NOTHING",
        )
        .bind(BASE + it.n)
        .bind(FIRST_PARTY_USER)
        .bind(it.category)
        .bind(it.name)
        .bind(it.description)
        .bind(cdn("items", &it.name.to_lowercase().replace(' ', "-")))
        .bind(it.price)
        .bind(it.price.is_some())
        .bind(it.limited)
        .bind((300 - it.n) as i32)
        .execute(&mut *conn)
        .await?;
    }
    for u in USERS.iter().filter(|u| u.n != 1) {
        let user = uid(u.n);
        let extra = EXTRA_ITEMS
            .iter()
            .find(|e| e.0 == u.n)
            .map_or(&[][..], |e| e.1);
        let mut worn = Vec::new();
        for n in STARTER_ITEMS.iter().chain(extra) {
            let source = if STARTER_ITEMS.contains(n) {
                "starter"
            } else {
                "reward"
            };
            let inv = economy::grant_item(
                conn,
                &state.ids,
                user,
                BASE + n,
                source,
                &format!("seed:item:{user}:{n}"),
            )
            .await?;
            worn.push(inv);
        }
        let credits = if u.band == AgeBand::Under13 {
            50
        } else {
            1_250
        };
        economy::grant_credits(
            conn,
            &state.ids,
            user,
            credits,
            "reward",
            "Welcome credits",
            &format!("seed:credits:{user}"),
        )
        .await?
        .map_err(|_| Problem::internal())?;
        sqlx::query(
            "INSERT INTO catalog.avatars (user_id, body_colors, equipped_inventory_ids) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO NOTHING",
        )
        .bind(user)
        .bind(serde_json::json!({ "head": "#E0B48C", "torso": "#3A3D44", "arms": "#E0B48C", "legs": "#2B2D33" }))
        .bind(&worn)
        .execute(&mut *conn)
        .await?;
    }
    Ok(())
}
