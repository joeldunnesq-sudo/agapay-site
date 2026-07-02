-- ============================================================
-- Sacrament detail tables — extends the EXISTING sacrament_requests
-- table (already live in production) with structured, queryable
-- fields for baptism/chrismation and wedding requests.
--
-- Does NOT modify sacrament_requests itself. Both tables are 1:1
-- children keyed on sacrament_requests.id, populated only when
-- sacrament_type is baptism/chrismation or wedding respectively.
--
-- Apply with:
-- wrangler d1 execute agapay-production --remote --file=./migration_sacrament_details.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS sacrament_baptism_details (
  request_id                    TEXT PRIMARY KEY
                                   REFERENCES sacrament_requests(id) ON DELETE CASCADE,
  candidate_name                TEXT NOT NULL,
  candidate_dob                 TEXT,
  candidate_is_adult            INTEGER NOT NULL DEFAULT 0,
  parent_names                  TEXT,
  patron_saint                  TEXT,

  godparent_1_name              TEXT,
  godparent_1_home_parish       TEXT,
  godparent_1_orthodox_attested INTEGER NOT NULL DEFAULT 0,

  godparent_2_name              TEXT,
  godparent_2_home_parish       TEXT,
  godparent_2_orthodox_attested INTEGER NOT NULL DEFAULT 0
);

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
                                 )) DEFAULT 'not_started',
  premarital_counsel_complete   INTEGER NOT NULL DEFAULT 0
);
