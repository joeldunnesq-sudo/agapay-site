-- Resumable technical provisioning only. Never store CSVs, PINs or balances here.
ALTER TABLE accounting_provisioning_operations ADD COLUMN options_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE accounting_provisioning_operations ADD COLUMN progress_step TEXT NOT NULL DEFAULT 'queued';
ALTER TABLE accounting_provisioning_operations ADD COLUMN progress_current INTEGER NOT NULL DEFAULT 0;
ALTER TABLE accounting_provisioning_operations ADD COLUMN provider_id TEXT;
ALTER TABLE accounting_provisioning_operations ADD COLUMN wizard_completed_at TEXT;
