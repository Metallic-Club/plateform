-- identity: accounts, credentials, sessions, native-app tokens, email tokens, names, persons and alt links.
-- Design spec section 8. Personal data (email, birth date) is stored encrypted plus a keyed hash for lookups.
-- Modules own their schema; no foreign keys or joins cross schemas.

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE SCHEMA identity;

CREATE TABLE identity.persons (
    id              bigint PRIMARY KEY,
    created_at      timestamptz NOT NULL DEFAULT now(),
    banned_until    timestamptz,
    ban_reason_code text
);

CREATE TABLE identity.users (
    id                      bigint PRIMARY KEY,
    username                citext NOT NULL UNIQUE,
    display_name            text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 32),
    display_name_changed_at timestamptz,
    bio                     text NOT NULL DEFAULT '' CHECK (char_length(bio) <= 1000),
    email_ciphertext        bytea,
    email_hash              bytea,
    email_verified_at       timestamptz,
    birth_date_ciphertext   bytea,
    age_band                text NOT NULL CHECK (age_band IN ('under_13', '13_15', '16_17', 'adult', 'unknown')),
    age_assurance_level     text NOT NULL DEFAULT 'self_declared'
                            CHECK (age_assurance_level IN ('none', 'self_declared', 'estimated', 'verified')),
    status                  text NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'limited', 'suspended', 'banned', 'pending_deletion')),
    -- Why the account is limited: parent_consent (under 13), signup_review (sign-up burst from one network).
    status_reason           text,
    -- Under 13: the parent's address, encrypted, so the consent email can be sent again.
    parent_email_ciphertext bytea,
    delete_after            timestamptz,
    person_id               bigint NOT NULL REFERENCES identity.persons (id),
    is_first_party          boolean NOT NULL DEFAULT false,
    avatar_headshot_url     text,
    created_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX users_email_hash_idx ON identity.users (email_hash) WHERE email_hash IS NOT NULL;
CREATE INDEX users_person_idx ON identity.users (person_id);
CREATE INDEX users_delete_after_idx ON identity.users (delete_after) WHERE delete_after IS NOT NULL;
CREATE INDEX users_username_trgm_idx ON identity.users USING gin ((lower(username::text)) gin_trgm_ops);
CREATE INDEX users_display_name_trgm_idx ON identity.users USING gin ((lower(display_name)) gin_trgm_ops);

CREATE TABLE identity.credentials (
    user_id       bigint PRIMARY KEY REFERENCES identity.users (id) ON DELETE CASCADE,
    password_hash text NOT NULL,
    updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE identity.mfa_factors (
    id                    bigint PRIMARY KEY,
    user_id               bigint NOT NULL REFERENCES identity.users (id) ON DELETE CASCADE,
    kind                  text NOT NULL CHECK (kind IN ('totp', 'webauthn')),
    secret_ciphertext     bytea,
    credential_public_key bytea,
    created_at            timestamptz NOT NULL DEFAULT now(),
    last_used_at          timestamptz
);
CREATE INDEX mfa_factors_user_idx ON identity.mfa_factors (user_id);

-- Browser sessions. Only the SHA-256 of the cookie value is stored.
CREATE TABLE identity.sessions (
    id_hash      bytea PRIMARY KEY,
    user_id      bigint NOT NULL REFERENCES identity.users (id) ON DELETE CASCADE,
    created_at   timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    expires_at   timestamptz NOT NULL,
    ip_hmac      bytea,
    user_agent   text CHECK (char_length(user_agent) <= 256),
    revoked_at   timestamptz
);
CREATE INDEX sessions_user_idx ON identity.sessions (user_id);
CREATE INDEX sessions_expires_idx ON identity.sessions (expires_at);

-- RFC 8628 device authorizations.
CREATE TABLE identity.device_authorizations (
    device_code_hash bytea PRIMARY KEY,
    user_code        text NOT NULL UNIQUE CHECK (user_code ~ '^[BCDFGHJKLMNPQRSTVWXZ]{8}$'),
    client_id        text NOT NULL,
    scopes           text[] NOT NULL,
    status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'consumed')),
    user_id          bigint REFERENCES identity.users (id) ON DELETE CASCADE,
    interval_secs    integer NOT NULL DEFAULT 5,
    created_at       timestamptz NOT NULL DEFAULT now(),
    expires_at       timestamptz NOT NULL,
    last_polled_at   timestamptz
);
CREATE INDEX device_authorizations_expires_idx ON identity.device_authorizations (expires_at);

-- Short-lived bearer tokens for native apps. A family groups every token from one sign-in.
CREATE TABLE identity.access_tokens (
    token_hash bytea PRIMARY KEY,
    family_id  bigint NOT NULL,
    user_id    bigint NOT NULL REFERENCES identity.users (id) ON DELETE CASCADE,
    client_id  text NOT NULL,
    scopes     text[] NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz
);
CREATE INDEX access_tokens_family_idx ON identity.access_tokens (family_id);
CREATE INDEX access_tokens_expires_idx ON identity.access_tokens (expires_at);

-- Rotating refresh tokens. Using one twice (used_at already set) revokes the whole family.
CREATE TABLE identity.refresh_tokens (
    token_hash  bytea PRIMARY KEY,
    family_id   bigint NOT NULL,
    user_id     bigint NOT NULL REFERENCES identity.users (id) ON DELETE CASCADE,
    client_id   text NOT NULL,
    scopes      text[] NOT NULL,
    parent_hash bytea,
    created_at  timestamptz NOT NULL DEFAULT now(),
    expires_at  timestamptz NOT NULL,
    used_at     timestamptz,
    revoked_at  timestamptz
);
CREATE INDEX refresh_tokens_family_idx ON identity.refresh_tokens (family_id);
CREATE INDEX refresh_tokens_user_idx ON identity.refresh_tokens (user_id);

CREATE TABLE identity.email_tokens (
    token_hash        bytea PRIMARY KEY,
    user_id           bigint NOT NULL REFERENCES identity.users (id) ON DELETE CASCADE,
    purpose           text NOT NULL CHECK (purpose IN ('verify', 'reset', 'parent_consent')),
    -- For parent_consent: keyed hash of the parent's address.
    target_email_hash bytea,
    created_at        timestamptz NOT NULL DEFAULT now(),
    expires_at        timestamptz NOT NULL,
    used_at           timestamptz
);
CREATE INDEX email_tokens_user_idx ON identity.email_tokens (user_id, purpose);

CREATE TABLE identity.username_history (
    user_id      bigint NOT NULL REFERENCES identity.users (id) ON DELETE CASCADE,
    old_username citext NOT NULL,
    new_username citext NOT NULL,
    changed_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX username_history_user_idx ON identity.username_history (user_id);

-- Names that cannot be taken right now. hold_until NULL = held for good (reserved, brand, staff).
-- After hold_until the name stays held until release_after, a random time in the following days (anti-sniping).
CREATE TABLE identity.name_holds (
    name_lower     citext PRIMARY KEY,
    reason         text NOT NULL CHECK (reason IN ('rename', 'deletion', 'reserved', 'brand', 'staff')),
    holder_user_id bigint,
    created_at     timestamptz NOT NULL DEFAULT now(),
    hold_until     timestamptz,
    release_after  timestamptz,
    CHECK ((hold_until IS NULL) = (release_after IS NULL))
);

CREATE TABLE identity.account_links (
    user_id      bigint NOT NULL REFERENCES identity.users (id) ON DELETE CASCADE,
    person_id    bigint NOT NULL REFERENCES identity.persons (id),
    link_kind    text NOT NULL CHECK (link_kind IN ('same_email', 'declared', 'phone', 'payment', 'install', 'ip_review')),
    strength     text NOT NULL CHECK (strength IN ('strong', 'weak')),
    created_at   timestamptz NOT NULL DEFAULT now(),
    confirmed_by bigint,
    PRIMARY KEY (user_id, person_id, link_kind)
);

-- Sign-up signals for alt detection. Keyed hashes only, never raw IPs; kept 180 days.
CREATE TABLE identity.signup_signals (
    user_id         bigint NOT NULL REFERENCES identity.users (id) ON DELETE CASCADE,
    ip_hmac         bytea,
    install_id_hmac bytea,
    asn             integer,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX signup_signals_ip_idx ON identity.signup_signals (ip_hmac, created_at);

CREATE TABLE identity.parental_consents (
    child_user_id     bigint NOT NULL REFERENCES identity.users (id) ON DELETE CASCADE,
    parent_email_hash bytea NOT NULL,
    method            text NOT NULL,
    granted_at        timestamptz NOT NULL DEFAULT now(),
    revoked_at        timestamptz,
    settings_json     jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX parental_consents_child_idx ON identity.parental_consents (child_user_id);

-- Names Metallic keeps for itself (spec 9.2 name sniping). More can be added as rows without a deploy.
INSERT INTO identity.name_holds (name_lower, reason) VALUES
    ('metallic', 'brand'), ('metallicstudio', 'brand'), ('metallic_studio', 'brand'), ('metallicplayer', 'brand'),
    ('metallic_official', 'brand'), ('studio', 'reserved'), ('launcher', 'reserved'), ('player', 'reserved'),
    ('admin', 'staff'), ('administrator', 'staff'), ('moderator', 'staff'), ('mod', 'staff'), ('staff', 'staff'),
    ('support', 'staff'), ('help', 'reserved'), ('system', 'reserved'), ('root', 'reserved'), ('api', 'reserved'),
    ('www', 'reserved'), ('official', 'reserved'), ('security', 'staff'), ('safety', 'staff'), ('trust', 'staff'),
    ('everyone', 'reserved'), ('null', 'reserved'), ('undefined', 'reserved'), ('anonymous', 'reserved')
ON CONFLICT DO NOTHING;
