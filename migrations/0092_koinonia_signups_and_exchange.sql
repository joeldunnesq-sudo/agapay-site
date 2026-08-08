-- 0092_koinonia_signups_and_exchange.sql
-- Koinonia Signups (ministry-owned sign-up sheets: trapeza, cleaning, showers, etc.)
-- and Koinonia Exchange (parish-scoped classifieds: offer / request, no AGAPAY payments).
--
-- Conventions follow directory_ministries / directory_ministry_participants
-- (migration 0031): TEXT primary keys via generateSecret(), parish_id scoping
-- on every table, CHECK-constrained enums, revision counters, epoch-ms
-- INTEGER timestamps (Date.now()), created_by/updated_by user ids.

-- ─── Signups ──────────────────────────────────────────────────────────────
-- A sheet is always owned by a ministry (ministry_id NOT NULL) — the ministry
-- initiates the signup. Creation/edit rights are enforced in the handler via
-- active ministry participant or leader assignments, not re-modeled here.

CREATE TABLE IF NOT EXISTS koinonia_signup_sheets (
  id                  TEXT    PRIMARY KEY,
  parish_id           TEXT    NOT NULL,
  ministry_id         TEXT    NOT NULL REFERENCES directory_ministries(id) ON DELETE CASCADE,
  title               TEXT    NOT NULL,
  description         TEXT,
  category             TEXT    NOT NULL DEFAULT 'general'
                          CHECK (category IN (
                            'meal_train', 'cleaning', 'event', 'volunteer', 'general'
                          )),
  status              TEXT    NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft', 'open', 'closed', 'archived')),
  visibility          TEXT    NOT NULL DEFAULT 'parish_members'
                          CHECK (visibility IN ('parish_members', 'ministry_participants_only')),
  created_by_person_id TEXT   NOT NULL,
  updated_by_person_id TEXT   NOT NULL,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL,
  archived_at         INTEGER,
  revision            INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_koinonia_signup_sheets_parish_status
  ON koinonia_signup_sheets(parish_id, status, visibility, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_koinonia_signup_sheets_ministry
  ON koinonia_signup_sheets(ministry_id, status);

CREATE TABLE IF NOT EXISTS koinonia_signup_slots (
  id             TEXT    PRIMARY KEY,
  sheet_id       TEXT    NOT NULL REFERENCES koinonia_signup_sheets(id) ON DELETE CASCADE,
  parish_id      TEXT    NOT NULL,
  label          TEXT    NOT NULL,
  notes          TEXT,
  needed_count   INTEGER NOT NULL DEFAULT 1 CHECK (needed_count > 0),
  slot_date      INTEGER,
  display_order  INTEGER NOT NULL DEFAULT 100,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  revision       INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_koinonia_signup_slots_sheet
  ON koinonia_signup_slots(sheet_id, display_order, slot_date);

CREATE TABLE IF NOT EXISTS koinonia_signup_entries (
  id             TEXT    PRIMARY KEY,
  slot_id        TEXT    NOT NULL REFERENCES koinonia_signup_slots(id) ON DELETE CASCADE,
  parish_id      TEXT    NOT NULL,
  household_id   TEXT,
  person_id      TEXT    NOT NULL,
  comment        TEXT,
  status         TEXT    NOT NULL DEFAULT 'confirmed'
                    CHECK (status IN ('confirmed', 'cancelled')),
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

-- A person can only hold one active (confirmed) claim per slot; they can
-- cancel and re-claim, but not double-book themselves.
CREATE UNIQUE INDEX IF NOT EXISTS uq_koinonia_signup_entry_active
  ON koinonia_signup_entries(slot_id, person_id)
  WHERE status = 'confirmed';

CREATE INDEX IF NOT EXISTS idx_koinonia_signup_entries_slot
  ON koinonia_signup_entries(slot_id, status);

CREATE INDEX IF NOT EXISTS idx_koinonia_signup_entries_person
  ON koinonia_signup_entries(parish_id, person_id, status);

-- ─── Exchange (offer / request classifieds, no payments) ───────────────────

CREATE TABLE IF NOT EXISTS koinonia_exchange_listings (
  id                    TEXT    PRIMARY KEY,
  parish_id             TEXT    NOT NULL,
  household_id          TEXT,
  posted_by_person_id   TEXT    NOT NULL,
  listing_type          TEXT    NOT NULL CHECK (listing_type IN ('offer', 'request')),
  category              TEXT    NOT NULL DEFAULT 'other'
                          CHECK (category IN (
                            'household_goods', 'furniture', 'clothing', 'books',
                            'children_baby', 'tools', 'services', 'other'
                          )),
  title                 TEXT    NOT NULL,
  description           TEXT,
  price_cents           INTEGER, -- NULL = free / not applicable. Informational only — AGAPAY never processes payment on these.
  status                TEXT    NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'completed', 'expired', 'removed')),
  expires_at            INTEGER,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL,
  completed_at          INTEGER,
  revision              INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_koinonia_exchange_listings_parish_status
  ON koinonia_exchange_listings(parish_id, status, listing_type, category, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_koinonia_exchange_listings_poster
  ON koinonia_exchange_listings(parish_id, posted_by_person_id, status);

CREATE TABLE IF NOT EXISTS koinonia_exchange_photos (
  id             TEXT    PRIMARY KEY,
  listing_id     TEXT    NOT NULL REFERENCES koinonia_exchange_listings(id) ON DELETE CASCADE,
  storage_key    TEXT    NOT NULL,
  display_order  INTEGER NOT NULL DEFAULT 100,
  created_at     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_koinonia_exchange_photos_listing
  ON koinonia_exchange_photos(listing_id, display_order);

-- One thread per (listing, interested person) so a popular listing can carry
-- several parallel conversations without them crossing.
CREATE TABLE IF NOT EXISTS koinonia_exchange_threads (
  id                    TEXT    PRIMARY KEY,
  listing_id            TEXT    NOT NULL REFERENCES koinonia_exchange_listings(id) ON DELETE CASCADE,
  parish_id             TEXT    NOT NULL,
  requester_person_id   TEXT    NOT NULL,
  status                TEXT    NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL,
  closed_at             INTEGER,
  closed_reason         TEXT CHECK (closed_reason IN ('listing_completed', 'manual', NULL)),
  revision              INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_koinonia_exchange_thread_per_requester
  ON koinonia_exchange_threads(listing_id, requester_person_id);

CREATE INDEX IF NOT EXISTS idx_koinonia_exchange_threads_listing
  ON koinonia_exchange_threads(listing_id, status);

CREATE INDEX IF NOT EXISTS idx_koinonia_exchange_threads_requester
  ON koinonia_exchange_threads(parish_id, requester_person_id, status);

CREATE TABLE IF NOT EXISTS koinonia_exchange_messages (
  id                TEXT    PRIMARY KEY,
  thread_id         TEXT    NOT NULL REFERENCES koinonia_exchange_threads(id) ON DELETE CASCADE,
  parish_id         TEXT    NOT NULL,
  sender_person_id  TEXT    NOT NULL,
  body              TEXT,
  message_type      TEXT    NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'image')),
  attachment_url    TEXT,
  created_at        INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_koinonia_exchange_messages_thread
  ON koinonia_exchange_messages(thread_id, created_at);
