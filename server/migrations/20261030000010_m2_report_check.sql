-- M2 follow-ups (#23): host-reported players must have redeemed a ticket for that server.

-- A user newly reported in a host's server is accepted only with a ticket redeemed there recently; index that lookup.
CREATE INDEX join_tickets_server_redeemed_idx ON matchmaker.join_tickets (server_id, user_id, redeemed_at)
    WHERE redeemed_at IS NOT NULL;

-- Reported players dropped for lack of such a ticket, per host (shown by `host list`; never the user ids).
ALTER TABLE matchmaker.hosts ADD COLUMN unverified_players bigint NOT NULL DEFAULT 0;
