-- social: friends, requests, blocks, settings, social links. Presence lives in Valkey/memory, not here.

CREATE SCHEMA social;

-- One row per friendship, ordered pair so each friendship exists once.
CREATE TABLE social.friendships (
    user_low  bigint NOT NULL,
    user_high bigint NOT NULL,
    since     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_low, user_high),
    CHECK (user_low < user_high)
);
CREATE INDEX friendships_high_idx ON social.friendships (user_high);

CREATE TABLE social.friend_requests (
    id         bigint PRIMARY KEY,
    from_user  bigint NOT NULL,
    to_user    bigint NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (from_user, to_user),
    CHECK (from_user <> to_user)
);
CREATE INDEX friend_requests_to_idx ON social.friend_requests (to_user, created_at DESC);
CREATE INDEX friend_requests_from_idx ON social.friend_requests (from_user, created_at DESC);

CREATE TABLE social.blocks (
    blocker    bigint NOT NULL,
    blocked    bigint NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (blocker, blocked),
    CHECK (blocker <> blocked)
);
CREATE INDEX blocks_blocked_idx ON social.blocks (blocked);

CREATE TABLE social.user_settings (
    user_id                 bigint PRIMARY KEY,
    theme                   text NOT NULL DEFAULT 'graphite' CHECK (theme IN ('system', 'graphite', 'titanium', 'light')),
    language                text NOT NULL DEFAULT 'en' CHECK (language ~ '^[a-z]{2}(-[A-Z]{2})?$'),
    presence_visibility     text NOT NULL CHECK (presence_visibility IN ('everyone', 'friends', 'nobody')),
    join_policy             text NOT NULL CHECK (join_policy IN ('everyone', 'friends', 'nobody')),
    friend_requests         text NOT NULL CHECK (friend_requests IN ('everyone', 'friends_of_friends', 'nobody')),
    social_links_visibility text NOT NULL CHECK (social_links_visibility IN ('everyone', 'friends', 'nobody')),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE social.social_links (
    user_id     bigint NOT NULL,
    platform    text NOT NULL CHECK (platform IN ('discord', 'youtube', 'twitch', 'tiktok', 'x', 'bluesky', 'instagram', 'github')),
    handle      text NOT NULL CHECK (char_length(handle) BETWEEN 1 AND 64),
    external_id text,
    verified_at timestamptz,
    position    smallint NOT NULL,
    PRIMARY KEY (user_id, platform)
);
