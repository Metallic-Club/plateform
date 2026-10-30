-- games: games, places, genres, media, ratings, favourites, play sessions and history; discovery: curated rows.

CREATE SCHEMA games;

CREATE TABLE games.genres (
    id          text PRIMARY KEY CHECK (id ~ '^[a-z][a-z0-9_]{1,31}$'),
    name        text NOT NULL,
    description text NOT NULL,
    position    smallint NOT NULL
);

CREATE TABLE games.games (
    id               bigint PRIMARY KEY,
    owner_kind       text NOT NULL CHECK (owner_kind IN ('user', 'group')),
    owner_id         bigint NOT NULL,
    -- Copy of the owner's display name for listing and search; the identity module stays the source of truth.
    creator_name     text NOT NULL,
    name             text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 50),
    description      text NOT NULL DEFAULT '' CHECK (char_length(description) <= 4000),
    genres           text[] NOT NULL DEFAULT '{}' CHECK (cardinality(genres) <= 3),
    content_label    text CHECK (content_label IN ('everyone', 'mild', 'moderate', 'restricted')),
    status           text NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'private', 'friends', 'public', 'under_review', 'removed')),
    max_players      integer NOT NULL DEFAULT 20 CHECK (max_players BETWEEN 1 AND 200),
    platforms        text[] NOT NULL DEFAULT '{windows}',
    is_first_party   boolean NOT NULL DEFAULT false,
    start_place_id   bigint,
    icon_url         text NOT NULL,
    thumbnail_url    text NOT NULL,
    visits           bigint NOT NULL DEFAULT 0,
    -- Players online at the last snapshot (worker job, every minute); used for popularity sorting.
    playing_snapshot integer NOT NULL DEFAULT 0,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    search           tsvector GENERATED ALWAYS AS (
                         setweight(to_tsvector('simple', name), 'A')
                         || setweight(to_tsvector('simple', creator_name), 'B')
                         || setweight(to_tsvector('simple', description), 'C')
                     ) STORED
);
CREATE INDEX games_public_idx ON games.games (status, playing_snapshot DESC) WHERE status = 'public';
CREATE INDEX games_genres_idx ON games.games USING gin (genres);
CREATE INDEX games_search_idx ON games.games USING gin (search);
CREATE INDEX games_name_trgm_idx ON games.games USING gin ((lower(name)) gin_trgm_ops);
CREATE INDEX games_owner_idx ON games.games (owner_kind, owner_id);

CREATE TABLE games.places (
    id              bigint PRIMARY KEY,
    game_id         bigint NOT NULL REFERENCES games.games (id) ON DELETE CASCADE,
    name            text NOT NULL,
    live_version_id bigint
);
CREATE INDEX places_game_idx ON games.places (game_id);

CREATE TABLE games.place_versions (
    id           bigint PRIMARY KEY,
    place_id     bigint NOT NULL REFERENCES games.places (id) ON DELETE CASCADE,
    asset_hash   text NOT NULL,
    published_by bigint NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE games.game_media (
    game_id   bigint NOT NULL REFERENCES games.games (id) ON DELETE CASCADE,
    kind      text NOT NULL CHECK (kind IN ('screenshot', 'video')),
    url       text NOT NULL,
    position  smallint NOT NULL,
    PRIMARY KEY (game_id, kind, position)
);

CREATE TABLE games.ratings (
    user_id    bigint NOT NULL,
    game_id    bigint NOT NULL REFERENCES games.games (id) ON DELETE CASCADE,
    vote       smallint NOT NULL CHECK (vote IN (-1, 1)),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, game_id)
);

CREATE TABLE games.rating_totals (
    game_id bigint PRIMARY KEY REFERENCES games.games (id) ON DELETE CASCADE,
    up      integer NOT NULL DEFAULT 0 CHECK (up >= 0),
    down    integer NOT NULL DEFAULT 0 CHECK (down >= 0)
);

CREATE TABLE games.favorites (
    user_id    bigint NOT NULL,
    game_id    bigint NOT NULL REFERENCES games.games (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, game_id)
);
CREATE INDEX favorites_user_idx ON games.favorites (user_id, created_at DESC, game_id DESC);
CREATE INDEX favorites_game_idx ON games.favorites (game_id);

-- One row per player per server visit, written from game-server heartbeats. Monthly partitions arrive at
-- stage B (spec section 11). user_id becomes NULL when the account is deleted (anonymised, kept for stats).
CREATE TABLE games.play_sessions (
    id         bigint PRIMARY KEY,
    user_id    bigint,
    game_id    bigint NOT NULL,
    server_id  bigint NOT NULL,
    started_at timestamptz NOT NULL DEFAULT now(),
    ended_at   timestamptz
);
CREATE INDEX play_sessions_open_idx ON games.play_sessions (server_id, user_id) WHERE ended_at IS NULL;
CREATE INDEX play_sessions_game_idx ON games.play_sessions (game_id, started_at);

CREATE TABLE games.play_history (
    user_id        bigint NOT NULL,
    game_id        bigint NOT NULL REFERENCES games.games (id) ON DELETE CASCADE,
    last_played_at timestamptz NOT NULL,
    -- Seconds rather than minutes so short sessions add up; the API reports whole minutes.
    seconds        bigint NOT NULL DEFAULT 0 CHECK (seconds >= 0),
    hidden         boolean NOT NULL DEFAULT false,
    PRIMARY KEY (user_id, game_id)
);
CREATE INDEX play_history_user_idx ON games.play_history (user_id, last_played_at DESC, game_id DESC);

CREATE SCHEMA discovery;

-- Curated "Featured" row, picked by staff.
CREATE TABLE discovery.featured (
    game_id  bigint PRIMARY KEY,
    position smallint NOT NULL
);

INSERT INTO games.genres (id, name, description, position) VALUES
    ('obby', 'Obby & Parkour', 'Jump, climb, beat the course.', 1),
    ('shooter', 'Shooter', 'First and third person combat.', 2),
    ('roleplay', 'Roleplay', 'Be someone else for a while.', 3),
    ('simulator', 'Simulator', 'Grow, collect and upgrade.', 4),
    ('tycoon', 'Tycoon', 'Build a business from nothing.', 5),
    ('horror', 'Horror', 'Dark places and jump scares.', 6),
    ('racing', 'Racing', 'Fast cars, tight corners.', 7),
    ('sports', 'Sports', 'Ball games and competitions.', 8),
    ('fighting', 'Fighting', 'Close combat, one on one or in teams.', 9),
    ('survival', 'Survival', 'Gather, craft, last the night.', 10),
    ('puzzle', 'Puzzle', 'Think your way through.', 11),
    ('building', 'Building', 'Make things, alone or together.', 12),
    ('adventure', 'Adventure', 'Explore worlds and follow a story.', 13),
    ('strategy', 'Strategy', 'Plan ahead and outsmart others.', 14),
    ('party', 'Party', 'Quick rounds with friends.', 15),
    ('social', 'Social', 'Hang out and meet people.', 16)
ON CONFLICT DO NOTHING;
