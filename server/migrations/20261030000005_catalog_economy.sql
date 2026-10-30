-- catalog: avatar items, inventory, avatars, outfits.
-- economy: double-entry, append-only currency ledger (spec 9.5). The database itself enforces the rules:
--   * ledger_transactions and ledger_entries reject UPDATE, DELETE and TRUNCATE;
--   * the entries of a transaction must sum to zero in one currency, checked at commit (deferred trigger);
--   * balances change only through the entry trigger, in the same database transaction as the entries.

CREATE SCHEMA catalog;

CREATE TABLE catalog.items (
    id                bigint PRIMARY KEY,
    creator_kind      text NOT NULL CHECK (creator_kind IN ('user', 'group')),
    creator_id        bigint NOT NULL,
    creator_name      text NOT NULL,
    creator_first_party boolean NOT NULL DEFAULT false,
    category          text NOT NULL CHECK (category IN ('hat', 'hair', 'face', 'face_accessory', 'neck', 'shoulder', 'back',
                                                        'waist', 'shirt', 'pants', 'shoes', 'body', 'emote', 'bundle')),
    name              text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 50),
    description       text NOT NULL DEFAULT '' CHECK (char_length(description) <= 1000),
    thumbnail_url     text NOT NULL,
    asset_hash        text,
    -- Price in credits; NULL when not for sale.
    price             bigint CHECK (price >= 0),
    on_sale           boolean NOT NULL DEFAULT false,
    limited_supply    integer CHECK (limited_supply >= 1),
    limited_remaining integer CHECK (limited_remaining >= 0),
    status            text NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'under_review', 'active', 'removed')),
    sales_count       bigint NOT NULL DEFAULT 0,
    created_at        timestamptz NOT NULL DEFAULT now(),
    CHECK ((limited_supply IS NULL) = (limited_remaining IS NULL)),
    CHECK (limited_remaining IS NULL OR limited_remaining <= limited_supply)
);
CREATE INDEX items_category_idx ON catalog.items (category, created_at DESC) WHERE status = 'active';
CREATE INDEX items_name_trgm_idx ON catalog.items USING gin ((lower(name)) gin_trgm_ops);

-- One row per owned copy. Written only by the economy module (see economy::grant_item).
CREATE TABLE catalog.inventory (
    id               bigint PRIMARY KEY,
    user_id          bigint NOT NULL,
    item_id          bigint NOT NULL REFERENCES catalog.items (id),
    serial           integer,
    source           text NOT NULL CHECK (source IN ('starter', 'purchase', 'gift', 'reward', 'promotion')),
    acquired_at      timestamptz NOT NULL DEFAULT now(),
    trade_lock_until timestamptz,
    UNIQUE (item_id, serial)
);
CREATE INDEX inventory_user_idx ON catalog.inventory (user_id, acquired_at DESC, id DESC);

CREATE TABLE catalog.avatars (
    user_id                bigint PRIMARY KEY,
    body_colors            jsonb NOT NULL,
    equipped_inventory_ids bigint[] NOT NULL DEFAULT '{}',
    headshot_url           text,
    full_body_url          text,
    updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE catalog.outfits (
    id            bigint PRIMARY KEY,
    user_id       bigint NOT NULL,
    name          text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 50),
    body_colors   jsonb NOT NULL,
    inventory_ids bigint[] NOT NULL DEFAULT '{}'
);
CREATE INDEX outfits_user_idx ON catalog.outfits (user_id);

CREATE SCHEMA economy;

CREATE TABLE economy.ledger_accounts (
    id         bigint PRIMARY KEY,
    owner_kind text NOT NULL CHECK (owner_kind IN ('user', 'game', 'creator', 'platform', 'system')),
    owner_id   bigint NOT NULL,
    currency   text NOT NULL CHECK (currency IN ('credits')),
    bucket     text NOT NULL CHECK (bucket IN ('available', 'escrow', 'giftable_hold', 'mint', 'revenue')),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (owner_kind, owner_id, currency, bucket)
);

CREATE TABLE economy.ledger_transactions (
    id                   bigint PRIMARY KEY,
    kind                 text NOT NULL CHECK (kind IN ('purchase', 'reward', 'item_purchase', 'item_sale', 'gift_sent',
                                                       'gift_received', 'game_purchase', 'game_earning', 'refund',
                                                       'reversal', 'adjustment', 'item_grant', 'hold_release')),
    idempotency_key      text NOT NULL UNIQUE CHECK (char_length(idempotency_key) BETWEEN 8 AND 200),
    initiated_by         bigint,
    reference_kind       text,
    reference_id         bigint,
    description          text NOT NULL DEFAULT '',
    item_id              bigint,
    counterparty_user_id bigint,
    created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE economy.ledger_entries (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    transaction_id bigint NOT NULL REFERENCES economy.ledger_transactions (id),
    account_id     bigint NOT NULL REFERENCES economy.ledger_accounts (id),
    amount         bigint NOT NULL CHECK (amount <> 0)
);
CREATE INDEX ledger_entries_account_idx ON economy.ledger_entries (account_id, transaction_id DESC);
CREATE INDEX ledger_entries_transaction_idx ON economy.ledger_entries (transaction_id);

CREATE TABLE economy.balances (
    account_id bigint PRIMARY KEY REFERENCES economy.ledger_accounts (id),
    amount     bigint NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION economy.forbid_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'economy.% is append-only', TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
END
$$;

CREATE TRIGGER ledger_transactions_append_only BEFORE UPDATE OR DELETE ON economy.ledger_transactions
    FOR EACH ROW EXECUTE FUNCTION economy.forbid_change();
CREATE TRIGGER ledger_transactions_no_truncate BEFORE TRUNCATE ON economy.ledger_transactions
    FOR EACH STATEMENT EXECUTE FUNCTION economy.forbid_change();
CREATE TRIGGER ledger_entries_append_only BEFORE UPDATE OR DELETE ON economy.ledger_entries
    FOR EACH ROW EXECUTE FUNCTION economy.forbid_change();
CREATE TRIGGER ledger_entries_no_truncate BEFORE TRUNCATE ON economy.ledger_entries
    FOR EACH STATEMENT EXECUTE FUNCTION economy.forbid_change();

-- Checked at commit so a transaction can insert its entries one by one.
CREATE FUNCTION economy.check_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    total      numeric;
    currencies integer;
BEGIN
    SELECT coalesce(sum(e.amount), 0), count(DISTINCT a.currency)
      INTO total, currencies
      FROM economy.ledger_entries e
      JOIN economy.ledger_accounts a ON a.id = e.account_id
     WHERE e.transaction_id = NEW.transaction_id;
    IF total <> 0 THEN
        RAISE EXCEPTION 'ledger transaction % does not sum to zero', NEW.transaction_id USING ERRCODE = 'check_violation';
    END IF;
    IF currencies > 1 THEN
        RAISE EXCEPTION 'ledger transaction % mixes currencies', NEW.transaction_id USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER ledger_entries_balanced AFTER INSERT ON economy.ledger_entries
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION economy.check_balanced();

CREATE FUNCTION economy.apply_entry() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO economy.balances (account_id, amount, updated_at)
    VALUES (NEW.account_id, NEW.amount, now())
    ON CONFLICT (account_id) DO UPDATE
        SET amount = economy.balances.amount + EXCLUDED.amount, updated_at = now();
    RETURN NEW;
END
$$;

CREATE TRIGGER ledger_entries_apply AFTER INSERT ON economy.ledger_entries
    FOR EACH ROW EXECUTE FUNCTION economy.apply_entry();

-- Balances may only change from inside the entry trigger (trigger depth 2), never by a direct statement.
CREATE FUNCTION economy.guard_balances() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF pg_trigger_depth() < 2 THEN
        RAISE EXCEPTION 'economy.balances changes only through ledger entries' USING ERRCODE = 'restrict_violation';
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END
$$;

CREATE TRIGGER balances_guard BEFORE INSERT OR UPDATE OR DELETE ON economy.balances
    FOR EACH ROW EXECUTE FUNCTION economy.guard_balances();
CREATE TRIGGER balances_no_truncate BEFORE TRUNCATE ON economy.balances
    FOR EACH STATEMENT EXECUTE FUNCTION economy.forbid_change();
