-- Extend the existing contribution register; do not copy legacy totals or post journals.
CREATE TABLE outside_gift_details (
  gift_id TEXT PRIMARY KEY REFERENCES manual_income_entries(id) ON DELETE RESTRICT,
  parish_id TEXT NOT NULL,
  giver_reference_id TEXT,
  giver_name TEXT NOT NULL DEFAULT '',
  giver_email TEXT NOT NULL DEFAULT '',
  fund_id TEXT NOT NULL,
  giving_kind TEXT NOT NULL CHECK (giving_kind IN ('pledge','other')),
  pledge_year INTEGER,
  record_state TEXT NOT NULL DEFAULT 'active' CHECK(record_state IN ('active','void')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
  request_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  duplicate_reason TEXT NOT NULL DEFAULT '',
  accounting_entity_id TEXT,
  accounting_entry_id TEXT,
  accounting_line_id TEXT,
  accounting_linked_by TEXT,
  accounting_linked_at TEXT,
  updated_by TEXT NOT NULL,
  void_reason TEXT,
  voided_at TEXT,
  CHECK ((giving_kind='pledge' AND pledge_year IS NOT NULL AND pledge_year BETWEEN 1900 AND 2199 AND giver_reference_id IS NOT NULL) OR (giving_kind='other' AND pledge_year IS NULL)),
  UNIQUE(parish_id, request_key)
);
CREATE INDEX outside_gifts_parish ON outside_gift_details(parish_id, record_state, gift_id);
CREATE INDEX outside_gifts_duplicate ON outside_gift_details(parish_id, content_hash, record_state);
CREATE INDEX outside_gifts_pledge ON outside_gift_details(parish_id, giving_kind, pledge_year, record_state);
CREATE INDEX outside_gifts_accounting ON outside_gift_details(parish_id, accounting_entity_id, accounting_line_id);
CREATE TABLE outside_gift_audit (
  id TEXT PRIMARY KEY,
  gift_id TEXT NOT NULL REFERENCES outside_gift_details(gift_id) ON DELETE RESTRICT,
  parish_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('created','corrected','voided','accounting_linked','accounting_unlinked')),
  actor_id TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(gift_id, revision)
);
CREATE INDEX outside_gift_audit_parish ON outside_gift_audit(parish_id, gift_id, revision);
