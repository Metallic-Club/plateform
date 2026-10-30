-- matchmaker: regions, running servers (registered and kept alive by game-server heartbeats) and join tickets.
-- Spec section 8 keeps hot server state in Valkey; P1 keeps it in these rows (a heartbeat every 5 s per server is
-- small). Hosts and the host agent arrive in P2.

CREATE SCHEMA matchmaker;

CREATE TABLE matchmaker.regions (
    code      text PRIMARY KEY CHECK (code ~ '^[a-z]{2,8}-[a-z]{2,12}$'),
    name      text NOT NULL,
    probe_url text NOT NULL,
    active    boolean NOT NULL DEFAULT true,
    position  smallint NOT NULL
);

CREATE TABLE matchmaker.servers (
    id                bigint PRIMARY KEY,
    game_id           bigint NOT NULL,
    place_id          bigint NOT NULL,
    region            text NOT NULL REFERENCES matchmaker.regions (code),
    status            text NOT NULL DEFAULT 'running' CHECK (status IN ('starting', 'running', 'draining', 'stopped')),
    max_players       integer NOT NULL CHECK (max_players BETWEEN 1 AND 200),
    player_ids        bigint[] NOT NULL DEFAULT '{}',
    joinable          boolean NOT NULL DEFAULT true,
    started_at        timestamptz NOT NULL DEFAULT now(),
    last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
    stopped_at        timestamptz
);
CREATE INDEX servers_live_idx ON matchmaker.servers (game_id, last_heartbeat_at) WHERE status IN ('starting', 'running', 'draining');

-- Single-use, 60-second tickets bound to user and place (and server once chosen). Only the hash is stored.
CREATE TABLE matchmaker.join_tickets (
    ticket_hash bytea PRIMARY KEY,
    user_id     bigint NOT NULL,
    game_id     bigint NOT NULL,
    place_id    bigint NOT NULL,
    server_id   bigint,
    region      text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    expires_at  timestamptz NOT NULL,
    redeemed_at timestamptz
);
CREATE INDEX join_tickets_expires_idx ON matchmaker.join_tickets (expires_at);
