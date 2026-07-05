-- Migration: 0013_tax_exemption_upload_tokens
--
-- Phase 3B correction: registration-time document upload no longer travels
-- as base64 inside POST /api/registrations. Instead, when a registration
-- includes an exemption claim, the server creates the pending claim (no
-- binary) and returns a short-lived, narrowly-scoped upload token bound to
-- that exact tax_exemptions row. The browser then uploads the file
-- separately via multipart/form-data to a claim-scoped route that verifies
-- this token. This avoids sending large files inside JSON and avoids
-- needing a parish dashboard bearer token that doesn't exist yet
-- immediately after registration.
--
-- Additive only: two nullable columns on the existing tax_exemptions table.

ALTER TABLE tax_exemptions ADD COLUMN upload_token_hash TEXT;
ALTER TABLE tax_exemptions ADD COLUMN upload_token_expires_at TEXT;

CREATE INDEX IF NOT EXISTS idx_tax_exemptions_upload_token_hash ON tax_exemptions(upload_token_hash);
