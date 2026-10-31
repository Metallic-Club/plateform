-- M2 (multiplayer spec section 8): per-host credentials, the host agent's register/heartbeat with outbound-only
-- orders, matchmaker allocation, edge connection facts and signed-ticket ids. Additive: legacy shared-secret servers
-- keep host_id NULL and their existing behaviour.

-- A machine that runs metallic-host (agent), metallic-edge and metallic-server containers. Only SHA-256 hashes of its
-- bearer tokens are stored; a token is printed once by `metallic-platform host add` or returned once by rotation.
CREATE TABLE matchmaker.hosts (
    id                    bigint PRIMARY KEY,
    name                  text NOT NULL UNIQUE CHECK (name ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
    region                text NOT NULL REFERENCES matchmaker.regions (code),
    token_hash            bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
    -- After a rotation the previous token keeps working for 10 minutes.
    prev_token_hash       bytea CHECK (octet_length(prev_token_hash) = 32),
    prev_token_expires_at timestamptz,
    rotate_requested      boolean NOT NULL DEFAULT false,
    -- Admin limits (`host add`); the agent's reported capacity can only lower them.
    max_servers           integer NOT NULL CHECK (max_servers BETWEEN 1 AND 1000),
    max_players           integer NOT NULL CHECK (max_players BETWEEN 1 AND 100000),
    status                text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'draining', 'disabled')),
    created_at            timestamptz NOT NULL DEFAULT now(),
    -- From the agent's register and heartbeats. Addresses are never logged or listed publicly.
    registered_at         timestamptz,
    last_seen_at          timestamptz,
    agent_version         text CHECK (agent_version ~ '^[A-Za-z0-9][A-Za-z0-9.+_-]{0,63}$'),
    engine_version        text CHECK (engine_version ~ '^[A-Za-z0-9][A-Za-z0-9.+_-]{0,63}$'),
    protocol_major        integer CHECK (protocol_major > 0),
    engine_builds         text[] NOT NULL DEFAULT '{}' CHECK (cardinality(engine_builds) <= 16),
    cap_cores             integer CHECK (cap_cores BETWEEN 1 AND 4096),
    cap_memory_mib        bigint CHECK (cap_memory_mib BETWEEN 1 AND 67108864),
    cap_servers           integer CHECK (cap_servers BETWEEN 1 AND 1000),
    cap_players           integer CHECK (cap_players BETWEEN 1 AND 100000),
    edge_port             integer CHECK (edge_port BETWEEN 1 AND 65535),
    edge_cert_sha256      text CHECK (edge_cert_sha256 ~ '^[a-f0-9]{64}$'),
    edge_cert_sha256_next text CHECK (edge_cert_sha256_next ~ '^[a-f0-9]{64}$'),
    public_host           text CHECK (public_host ~ '^[A-Za-z0-9.:-]{1,253}$'),
    observed_address      text CHECK (observed_address ~ '^[A-Fa-f0-9.:]{2,45}$'),
    load_cpu              real CHECK (load_cpu BETWEEN 0 AND 100),
    load_memory_mib       bigint CHECK (load_memory_mib >= 0),
    load_up_mbps          real CHECK (load_up_mbps >= 0)
);

-- `status = 'starting'` now also means "allocated by the matchmaker, waiting for the host agent to start it".
-- `desired` is what the backend wants; the agent learns it from heartbeat orders (the backend never connects out).
ALTER TABLE matchmaker.servers
    ADD COLUMN host_id     bigint REFERENCES matchmaker.hosts (id),
    ADD COLUMN desired     text NOT NULL DEFAULT 'run' CHECK (desired IN ('run', 'drain', 'stop')),
    ADD COLUMN kind        text NOT NULL DEFAULT 'play' CHECK (kind IN ('play', 'edit', 'test')),
    ADD COLUMN tick_p99_ms real CHECK (tick_p99_ms >= 0),
    ADD COLUMN exit_code   integer;
CREATE INDEX servers_host_idx ON matchmaker.servers (host_id) WHERE status <> 'stopped';
CREATE INDEX servers_place_idx ON matchmaker.servers (place_id) WHERE status IN ('starting', 'running');

-- Ticket id (`jti`, 16 random bytes) and kind of the signed form. Older rows have no jti.
ALTER TABLE matchmaker.join_tickets
    ADD COLUMN jti  bytea CHECK (octet_length(jti) = 16),
    ADD COLUMN kind text NOT NULL DEFAULT 'play' CHECK (kind IN ('play', 'edit', 'test'));
CREATE UNIQUE INDEX join_tickets_jti_idx ON matchmaker.join_tickets (jti) WHERE jti IS NOT NULL;
-- Pending reservations per server (allocation counts unredeemed tickets bound to a server).
CREATE INDEX join_tickets_server_idx ON matchmaker.join_tickets (server_id) WHERE redeemed_at IS NULL;
