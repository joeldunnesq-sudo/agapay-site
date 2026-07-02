-- ============================================================
-- Sacrament Requests migration
-- Target DB: agapay-production (24f514a6-6904-425b-a4c8-b3584b23c0be)
-- Apply with: wrangler d1 execute agapay-production --remote --file=./migration_sacrament_requests.sql
-- ============================================================

-- Core request record. One row per request, regardless of sacrament type.
-- Type-specific detail lives in the child tables below (1:1 with request id).
CREATE TABLE IF NOT EXISTS sacrament_requests (
  id                  TEXT PRIMARY KEY,
  parish_id           TEXT NOT NULL,
  family_id           TEXT,
  requested_by_user_id TEXT NOT NULL,

  sacrament_type      TEXT NOT NULL CHECK (sacrament_type IN (
                         'baptism', 'chrismation', 'wedding', 'funeral',
                         'confession', 'house_blessing', 'counsel'
                       )),

  -- Two lanes live in one status vocabulary:
  -- Tier 1 (confession/house_blessing/counsel) mostly skip straight to 'scheduled'.
  -- Tier 2 (baptism/wedding/funeral) walk the full path.
  status              TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN (
                         'submitted', 'under_review', 'info_requested',
                         'date_proposed', 'scheduled', 'completed',
                         'declined', 'cancelled'
                       )),

  proposed_date       TEXT,   -- ISO date, priest or family proposes
  confirmed_date      TEXT,   -- ISO date, locked once scheduled

  -- Result of checking proposed/confirmed date against the feast/fasting engine.
  -- Not a hard block — the priest always has final say (economia) — just a flag.
  fasting_flag        INTEGER NOT NULL DEFAULT 0,
  fasting_flag_note   TEXT,   -- e.g. "Falls within the Dormition Fast"

  priest_notes        TEXT,   -- internal, not shown to requester
  requester_notes     TEXT,   -- from the family, shown both directions

  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sacrament_requests_parish
  ON sacrament_requests(parish_id, status);
CREATE INDEX IF NOT EXISTS idx_sacrament_requests_family
  ON sacrament_requests(family_id);
CREATE INDEX IF NOT EXISTS idx_sacrament_requests_type_status
  ON sacrament_requests(sacrament_type, status);


-- ------------------------------------------------------------
-- Baptism / Chrismation intake
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sacrament_baptism_details (
  request_id                    TEXT PRIMARY KEY
                                   REFERENCES sacrament_requests(id) ON DELETE CASCADE,
  candidate_name                TEXT NOT NULL,
  candidate_dob                 TEXT,
  candidate_is_adult            INTEGER NOT NULL DEFAULT 0,
  parent_names                  TEXT,   -- free text, only relevant if candidate is a minor
  patron_saint                  TEXT,

  godparent_1_name              TEXT,
  godparent_1_home_parish       TEXT,
  godparent_1_orthodox_attested INTEGER NOT NULL DEFAULT 0,

  godparent_2_name              TEXT,
  godparent_2_home_parish       TEXT,
  godparent_2_orthodox_attested INTEGER NOT NULL DEFAULT 0
);


-- ------------------------------------------------------------
-- Wedding intake
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sacrament_wedding_details (
  request_id                    TEXT PRIMARY KEY
                                   REFERENCES sacrament_requests(id) ON DELETE CASCADE,
  party_a_name                  TEXT NOT NULL,
  party_a_orthodox              INTEGER NOT NULL DEFAULT 0,
  party_a_prior_marriage        INTEGER NOT NULL DEFAULT 0,

  party_b_name                  TEXT NOT NULL,
  party_b_orthodox              INTEGER NOT NULL DEFAULT 0,
  party_b_prior_marriage        INTEGER NOT NULL DEFAULT 0,

  koumbaro_name                 TEXT,
  koumbaro_home_parish          TEXT,

  marriage_license_status       TEXT CHECK (marriage_license_status IN (
                                   'not_started', 'applied', 'obtained'
                                 )),
  premarital_counsel_complete   INTEGER NOT NULL DEFAULT 0
);


-- ------------------------------------------------------------
-- Funeral intake — deliberately minimal. This is a fast-path, not a form.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sacrament_funeral_details (
  request_id           TEXT PRIMARY KEY
                          REFERENCES sacrament_requests(id) ON DELETE CASCADE,
  deceased_name         TEXT NOT NULL,
  date_of_repose        TEXT,
  urgent_contact_phone  TEXT NOT NULL,
  funeral_home          TEXT
);


-- ------------------------------------------------------------
-- Uploaded documents (certificates, licenses, letters of good standing)
-- Actual file bytes live in R2; this row just tracks the key + metadata.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sacrament_request_documents (
  id            TEXT PRIMARY KEY,
  request_id    TEXT NOT NULL REFERENCES sacrament_requests(id) ON DELETE CASCADE,
  label         TEXT NOT NULL,   -- e.g. "Marriage license", "Letter of good standing"
  r2_key        TEXT NOT NULL,
  uploaded_by   TEXT,
  uploaded_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sacrament_documents_request
  ON sacrament_request_documents(request_id);


-- ------------------------------------------------------------
-- Audit trail — every status change / note / date proposal gets a row.
-- Powers a simple timeline view on both the parish and family sides.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sacrament_request_events (
  id            TEXT PRIMARY KEY,
  request_id    TEXT NOT NULL REFERENCES sacrament_requests(id) ON DELETE CASCADE,
  event_type    TEXT NOT NULL,   -- 'submitted' | 'status_change' | 'note' | 'date_proposed' | 'document_added'
  actor_user_id TEXT,
  note          TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sacrament_events_request
  ON sacrament_request_events(request_id, created_at);
