-- M2 hardening after security review.

-- Issuing a ticket expires the account's other unredeemed tickets (no slot squatting); index that lookup.
CREATE INDEX join_tickets_user_open_idx ON matchmaker.join_tickets (user_id) WHERE redeemed_at IS NULL;

-- The token minted by the last rotation, encrypted with the data key, kept only while the previous token is still
-- valid: a rotate call made with the previous token (a lost response) gets this same token back instead of minting
-- another one.
ALTER TABLE matchmaker.hosts ADD COLUMN pending_token_enc bytea;
