-- ============================================================
-- Phase 6 -- Audit log foundation (docs/SOFT_LAUNCH_READINESS.md).
--
-- Durable, append-only record of privileged/security-sensitive actions,
-- separate from src/lib/logging.js (ephemeral console logs for Cloudflare
-- log ingestion) and separate from the existing per-registration
-- notesHistory/appendAdminAudit trail in src/handlers/parish.js (which
-- stays where it is -- this table is a cross-record index on top, not a
-- replacement).
--
-- This table is INSERT-only. No code should ever UPDATE or DELETE a row.
-- See src/lib/audit-log.js for the only intended write path.
--
-- Apply with:
-- wrangler d1 execute agapay-production --remote --file=./migrations/0014_audit_log.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id                   TEXT PRIMARY KEY,
  actor_user_id        TEXT,                          -- admin actor display name today; a real user id once Phase 9/10 land
  actor_type           TEXT NOT NULL DEFAULT 'admin',  -- admin | parish | donor | system
  actor_role           TEXT,
  action               TEXT NOT NULL,                  -- e.g. 'registration.status_changed', 'admin.index_rebuild'
  target_type          TEXT,                           -- e.g. 'registration', 'settlement_profile'
  target_id            TEXT,
  organization_id      TEXT,                           -- parish/organization reference, when applicable
  household_id         TEXT,
  request_id           TEXT,
  ip_hash              TEXT,                           -- sha256Hex(clientIp(request)) -- never the raw IP
  reason               TEXT,
  before_summary_json  TEXT,                           -- small, non-sensitive summary only -- never a full record dump
  after_summary_json   TEXT,
  metadata_json        TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_target ON audit_log(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_organization ON audit_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor_user_id);
