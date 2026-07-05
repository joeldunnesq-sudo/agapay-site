-- Migration: 0011_tax_exemptions
--
-- AGAPAY subscription sales-tax exemption workflow. Applies ONLY to
-- AGAPAY's own platform-account subscription billing (Giving, Parish+,
-- Learn, Stewardship). Never applies to donations, donor Customers, or
-- Parish+ bookstore purchasers -- those are structurally separate Stripe
-- Customer namespaces (donations/bookstore run on the parish's connected
-- account; see src/handlers/donor.js).
--
-- Four tables:
--   tax_exemptions            -- the authoritative legal/administrative claim
--   tax_exemption_stripe_syncs -- one row per Stripe Customer that needs the
--                                  exemption state applied (a parish can have
--                                  TWO platform Customers: registration.stripeCustomerId
--                                  for Giving/Parish+ and registration.stewardshipStripeCustomerId
--                                  for Stewardship -- see src/handlers/stewardship.js)
--   tax_exemption_documents   -- metadata only; binary content lives in the
--                                  private TAX_EXEMPTION_DOCS R2 bucket, never in D1
--   tax_exemption_audit_log   -- append-only; no UPDATE statements should ever
--                                  target this table from application code
--
-- Plus a dedicated tax_exemption_notes table for free-form admin notes,
-- kept separate from the immutable audit log so the admin UI can list
-- human commentary distinctly from system events.
--
-- This migration is purely additive: new tables plus nullable ALTER TABLE
-- ADD COLUMN statements on the existing `registrations` table. No existing
-- row is rewritten, no existing column is altered or dropped. Safe to apply
-- to production ahead of the corresponding Worker code deploy.

CREATE TABLE IF NOT EXISTS tax_exemptions (
  id TEXT PRIMARY KEY,
  registration_reference TEXT NOT NULL,
  parish_id TEXT,

  jurisdiction TEXT NOT NULL,          -- two-letter state code, 'FEDERAL', or 'OTHER'
  exemption_type TEXT NOT NULL,
  certificate_number TEXT,
  effective_date TEXT,
  expiration_date TEXT,

  -- pending | approved | rejected | replacement_required | expired | revoked | superseded
  status TEXT NOT NULL DEFAULT 'pending',
  -- free-text internal triage note for admins, distinct from the full
  -- notes table -- e.g. 'multistate, needs manual review'.
  internal_review_status TEXT,

  authorized_representative_name TEXT NOT NULL,
  authorized_representative_title TEXT NOT NULL,
  certified_at TEXT NOT NULL,

  approved_at TEXT,
  approved_by TEXT,

  rejected_at TEXT,
  rejected_by TEXT,
  rejection_reason TEXT,

  replacement_requested_at TEXT,
  replacement_requested_by TEXT,
  replacement_reason TEXT,
  -- Whether Stripe should remain exempt while a replacement is pending.
  -- Default 0 (no grace period): the safer default recommended in the
  -- Phase 2 plan is that the exemption stops applying to Stripe the moment
  -- replacement is requested, rather than staying exempt until the new
  -- document clears review. Joel can flip this per-claim if a grace period
  -- is genuinely warranted for a specific parish.
  keep_active_during_replacement INTEGER NOT NULL DEFAULT 0,

  revoked_at TEXT,
  revoked_by TEXT,
  revocation_reason TEXT,

  -- Points at the prior tax_exemptions row this one supersedes (e.g. a
  -- renewal after expiration, or a corrected resubmission). Nullable.
  supersedes_tax_exemption_id TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (registration_reference) REFERENCES registrations(reference),
  FOREIGN KEY (supersedes_tax_exemption_id) REFERENCES tax_exemptions(id)
);

CREATE INDEX IF NOT EXISTS idx_tax_exemptions_registration_reference ON tax_exemptions(registration_reference);
CREATE INDEX IF NOT EXISTS idx_tax_exemptions_parish_id ON tax_exemptions(parish_id);
CREATE INDEX IF NOT EXISTS idx_tax_exemptions_status ON tax_exemptions(status);
CREATE INDEX IF NOT EXISTS idx_tax_exemptions_expiration_date ON tax_exemptions(expiration_date);
CREATE INDEX IF NOT EXISTS idx_tax_exemptions_supersedes ON tax_exemptions(supersedes_tax_exemption_id);
CREATE INDEX IF NOT EXISTS idx_tax_exemptions_created_at ON tax_exemptions(created_at);

-- D1/SQLite has no partial-unique-index predicate issue here (SQLite DOES
-- support partial indexes), so we can actually enforce "at most one
-- APPROVED exemption per registration" at the database level rather than
-- application logic alone:
CREATE UNIQUE INDEX IF NOT EXISTS uq_tax_exemptions_one_approved_per_registration
  ON tax_exemptions(registration_reference)
  WHERE status = 'approved';

-- tax_exemption_stripe_syncs: one row per Stripe Customer that must receive
-- the exemption state for a given claim. A parish's approved exemption may
-- need to reach BOTH registration.stripeCustomerId (customer_role
-- 'giving_parish_plus') and registration.stewardshipStripeCustomerId
-- (customer_role 'stewardship') -- these succeed/fail independently.
CREATE TABLE IF NOT EXISTS tax_exemption_stripe_syncs (
  id TEXT PRIMARY KEY,
  tax_exemption_id TEXT NOT NULL,
  registration_reference TEXT NOT NULL,
  stripe_customer_id TEXT NOT NULL,
  customer_role TEXT NOT NULL,          -- giving_parish_plus | stewardship

  desired_tax_exempt_status TEXT NOT NULL,   -- 'exempt' | 'none'
  previous_tax_exempt_status TEXT,           -- what Stripe reported before this sync
  -- 1 if AGAPAY's review flow made this change; 0 if we detected the
  -- Customer was already in the desired/some other state independent of
  -- our own action (reconciliation case).
  agapay_owned_change INTEGER NOT NULL DEFAULT 1,

  -- not_started | pending | succeeded | failed | reconciliation_required
  sync_status TEXT NOT NULL DEFAULT 'not_started',
  stripe_request_id TEXT,
  idempotency_key TEXT,
  last_error TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  attempted_at TEXT,
  synced_at TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (tax_exemption_id) REFERENCES tax_exemptions(id),
  FOREIGN KEY (registration_reference) REFERENCES registrations(reference),
  UNIQUE (tax_exemption_id, stripe_customer_id)
);

CREATE INDEX IF NOT EXISTS idx_tax_exemption_stripe_syncs_tax_exemption_id ON tax_exemption_stripe_syncs(tax_exemption_id);
CREATE INDEX IF NOT EXISTS idx_tax_exemption_stripe_syncs_registration_reference ON tax_exemption_stripe_syncs(registration_reference);
CREATE INDEX IF NOT EXISTS idx_tax_exemption_stripe_syncs_stripe_customer_id ON tax_exemption_stripe_syncs(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_tax_exemption_stripe_syncs_sync_status ON tax_exemption_stripe_syncs(sync_status);
CREATE INDEX IF NOT EXISTS idx_tax_exemption_stripe_syncs_customer_role ON tax_exemption_stripe_syncs(customer_role);

CREATE TABLE IF NOT EXISTS tax_exemption_documents (
  id TEXT PRIMARY KEY,
  tax_exemption_id TEXT NOT NULL,
  registration_reference TEXT NOT NULL,

  storage_key TEXT NOT NULL UNIQUE,     -- random R2 object key, see src/lib/tax-exemption-storage.js
  original_filename TEXT NOT NULL,      -- metadata only -- never used as storage_key or in any path
  sanitized_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,

  uploaded_by_user_id TEXT,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_current INTEGER NOT NULL DEFAULT 1,
  replaces_document_id TEXT,
  archived_at TEXT,
  deleted_at TEXT,

  FOREIGN KEY (tax_exemption_id) REFERENCES tax_exemptions(id),
  FOREIGN KEY (registration_reference) REFERENCES registrations(reference),
  FOREIGN KEY (replaces_document_id) REFERENCES tax_exemption_documents(id)
);

CREATE INDEX IF NOT EXISTS idx_tax_exemption_documents_tax_exemption_id ON tax_exemption_documents(tax_exemption_id);
CREATE INDEX IF NOT EXISTS idx_tax_exemption_documents_registration_reference ON tax_exemption_documents(registration_reference);

-- Append-only. No application code should ever UPDATE a row in this table.
CREATE TABLE IF NOT EXISTS tax_exemption_audit_log (
  id TEXT PRIMARY KEY,
  tax_exemption_id TEXT,
  document_id TEXT,
  registration_reference TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_type TEXT NOT NULL,             -- admin | parish | system
  actor_user_id TEXT,
  metadata_json TEXT,                   -- small structured context only -- never file
                                         -- contents, tokens, full Stripe objects, full
                                         -- certificate numbers, or raw auth headers
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tax_exemption_audit_log_registration_reference ON tax_exemption_audit_log(registration_reference);
CREATE INDEX IF NOT EXISTS idx_tax_exemption_audit_log_tax_exemption_id ON tax_exemption_audit_log(tax_exemption_id);
CREATE INDEX IF NOT EXISTS idx_tax_exemption_audit_log_created_at ON tax_exemption_audit_log(created_at);

-- Dedicated human-note history, separate from the immutable system audit
-- log above.
CREATE TABLE IF NOT EXISTS tax_exemption_notes (
  id TEXT PRIMARY KEY,
  tax_exemption_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tax_exemption_id) REFERENCES tax_exemptions(id)
);

CREATE INDEX IF NOT EXISTS idx_tax_exemption_notes_tax_exemption_id ON tax_exemption_notes(tax_exemption_id);

-- Promoted/cached columns on registrations. tax_exemptions remains
-- authoritative -- these three columns exist purely so the existing
-- /api/parishes and /api/admin/registrations D1 keyset-pagination filters
-- can filter/sort by exemption status without a join, the same reason
-- stripe_account_id is already promoted on this table.
ALTER TABLE registrations ADD COLUMN tax_exemption_status TEXT;
ALTER TABLE registrations ADD COLUMN tax_exemption_expiration_date TEXT;
ALTER TABLE registrations ADD COLUMN current_tax_exemption_id TEXT;

CREATE INDEX IF NOT EXISTS idx_registrations_tax_exemption_status ON registrations(tax_exemption_status);
CREATE INDEX IF NOT EXISTS idx_registrations_tax_exemption_expiration_date ON registrations(tax_exemption_expiration_date);
