-- Configurable Wedding and Baptism preparation plans.
--
-- Parish templates are copied into request-scoped snapshots. Editing a
-- template therefore changes future requests only; an active family's or
-- couple's requirements remain stable. Binary documents live in the private
-- SACRAMENT_DOCUMENTS R2 bucket. D1 stores metadata and review state only.

CREATE TABLE IF NOT EXISTS sacrament_preparation_templates (
  id                 TEXT PRIMARY KEY,
  parish_id          TEXT NOT NULL,
  sacrament_type     TEXT NOT NULL CHECK (sacrament_type IN ('baptism', 'wedding')),
  title              TEXT NOT NULL,
  introduction       TEXT,
  canonical_note     TEXT,
  version            INTEGER NOT NULL DEFAULT 1,
  active             INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (parish_id, sacrament_type)
);

CREATE TABLE IF NOT EXISTS sacrament_preparation_template_items (
  id                 TEXT PRIMARY KEY,
  template_id        TEXT NOT NULL REFERENCES sacrament_preparation_templates(id) ON DELETE CASCADE,
  title              TEXT NOT NULL,
  description        TEXT,
  item_type          TEXT NOT NULL CHECK (item_type IN ('information', 'confirmation', 'document', 'clergy_review')),
  required           INTEGER NOT NULL DEFAULT 1 CHECK (required IN (0, 1)),
  sort_order         INTEGER NOT NULL DEFAULT 0,
  active             INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sacrament_preparation_template_items
  ON sacrament_preparation_template_items(template_id, active, sort_order);

CREATE TABLE IF NOT EXISTS sacrament_preparation_request_plans (
  request_id              TEXT PRIMARY KEY REFERENCES sacrament_requests(id) ON DELETE CASCADE,
  parish_id               TEXT NOT NULL,
  sacrament_type          TEXT NOT NULL CHECK (sacrament_type IN ('baptism', 'wedding')),
  source_template_id      TEXT REFERENCES sacrament_preparation_templates(id) ON DELETE SET NULL,
  source_template_version INTEGER NOT NULL,
  title                   TEXT NOT NULL,
  introduction            TEXT,
  canonical_note          TEXT,
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sacrament_preparation_request_plans_parish
  ON sacrament_preparation_request_plans(parish_id, sacrament_type, created_at DESC);

CREATE TABLE IF NOT EXISTS sacrament_preparation_request_items (
  id                      TEXT PRIMARY KEY,
  request_id              TEXT NOT NULL REFERENCES sacrament_preparation_request_plans(request_id) ON DELETE CASCADE,
  source_template_item_id TEXT REFERENCES sacrament_preparation_template_items(id) ON DELETE SET NULL,
  title                   TEXT NOT NULL,
  description             TEXT,
  item_type               TEXT NOT NULL CHECK (item_type IN ('information', 'confirmation', 'document', 'clergy_review')),
  required                INTEGER NOT NULL DEFAULT 1 CHECK (required IN (0, 1)),
  sort_order              INTEGER NOT NULL DEFAULT 0,
  status                  TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'submitted', 'approved', 'needs_attention', 'waived')),
  parishioner_note        TEXT,
  reviewer_note           TEXT,
  completed_at            TEXT,
  reviewed_at             TEXT,
  reviewed_by             TEXT,
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (request_id, source_template_item_id)
);

CREATE INDEX IF NOT EXISTS idx_sacrament_preparation_request_items
  ON sacrament_preparation_request_items(request_id, sort_order);

CREATE TABLE IF NOT EXISTS sacrament_preparation_documents (
  id                 TEXT PRIMARY KEY,
  parish_id          TEXT NOT NULL,
  template_id        TEXT REFERENCES sacrament_preparation_templates(id) ON DELETE CASCADE,
  request_id         TEXT REFERENCES sacrament_requests(id) ON DELETE CASCADE,
  request_item_id    TEXT REFERENCES sacrament_preparation_request_items(id) ON DELETE CASCADE,
  document_role      TEXT NOT NULL CHECK (document_role IN ('guide', 'supporting')),
  uploaded_by_type   TEXT NOT NULL CHECK (uploaded_by_type IN ('parish', 'donor')),
  uploaded_by_email  TEXT,
  display_name       TEXT NOT NULL,
  storage_key        TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  sanitized_filename TEXT NOT NULL,
  mime_type          TEXT NOT NULL,
  file_size          INTEGER NOT NULL,
  sha256             TEXT NOT NULL,
  review_status      TEXT NOT NULL DEFAULT 'not_required' CHECK (review_status IN ('not_required', 'pending', 'accepted', 'rejected')),
  reviewer_note      TEXT,
  reviewed_by        TEXT,
  reviewed_at        TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at         TEXT,
  CHECK (
    (document_role = 'guide' AND template_id IS NOT NULL AND request_id IS NULL AND request_item_id IS NULL AND uploaded_by_type = 'parish')
    OR
    (document_role = 'supporting' AND template_id IS NULL AND request_id IS NOT NULL AND request_item_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_sacrament_preparation_documents_template
  ON sacrament_preparation_documents(template_id, deleted_at, created_at);

CREATE INDEX IF NOT EXISTS idx_sacrament_preparation_documents_request
  ON sacrament_preparation_documents(request_id, request_item_id, deleted_at, created_at);

CREATE INDEX IF NOT EXISTS idx_sacrament_preparation_documents_parish
  ON sacrament_preparation_documents(parish_id, deleted_at, created_at);
