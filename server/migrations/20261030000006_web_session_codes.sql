-- One-time codes that turn a native app's sign-in into a website session (plateform #7, section 4).
-- The Launcher holds OAuth tokens; its web view has a separate cookie jar, so it asks for a code with its
-- access token and opens /auth/launcher-handoff?code=..., which redeems it server-side for a session cookie.
-- Codes live 60 seconds, are single use and are stored only as a SHA-256 hash.
CREATE TABLE identity.web_session_codes (
    code_hash  bytea PRIMARY KEY,
    user_id    bigint NOT NULL REFERENCES identity.users (id) ON DELETE CASCADE,
    client_id  text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    used_at    timestamptz
);

CREATE INDEX web_session_codes_expires_idx ON identity.web_session_codes (expires_at);
