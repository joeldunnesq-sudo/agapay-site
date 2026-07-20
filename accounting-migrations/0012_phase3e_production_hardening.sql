-- Phase 3E: production health, integrity scans, protective controls, and recovery evidence.
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS accounting_integrity_scans(
 id TEXT PRIMARY KEY,scan_type TEXT NOT NULL,scope TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'queued',
 started_at TEXT,completed_at TEXT,last_checkpoint TEXT,checks_total INTEGER NOT NULL DEFAULT 0,
 checks_passed INTEGER NOT NULL DEFAULT 0,checks_warned INTEGER NOT NULL DEFAULT 0,checks_failed INTEGER NOT NULL DEFAULT 0,
 critical_failures INTEGER NOT NULL DEFAULT 0,scanner_version TEXT NOT NULL,schema_version TEXT,
 correlation_id TEXT,created_at TEXT NOT NULL DEFAULT(datetime('now')),updated_at TEXT NOT NULL DEFAULT(datetime('now')),
 CHECK(scan_type IN('incremental','full','post_migration','post_restore','pre_close','post_close','manual','canary')),
 CHECK(status IN('queued','running','paused','completed','completed_with_warnings','failed','canceled'))
);
CREATE INDEX IF NOT EXISTS idx_integrity_scans_status ON accounting_integrity_scans(status,created_at);

CREATE TABLE IF NOT EXISTS accounting_integrity_findings(
 id TEXT PRIMARY KEY,scan_id TEXT NOT NULL,health_scope TEXT NOT NULL,health_code TEXT NOT NULL,
 status TEXT NOT NULL,severity TEXT NOT NULL,affected_module TEXT NOT NULL,safe_summary TEXT NOT NULL,
 recommended_action TEXT NOT NULL,details_json TEXT,source_reference_type TEXT,source_reference_id TEXT,
 detected_at TEXT NOT NULL DEFAULT(datetime('now')),last_checked_at TEXT NOT NULL DEFAULT(datetime('now')),
 resolved_at TEXT,correlation_id TEXT,created_at TEXT NOT NULL DEFAULT(datetime('now')),updated_at TEXT NOT NULL DEFAULT(datetime('now')),
 FOREIGN KEY(scan_id) REFERENCES accounting_integrity_scans(id),
 CHECK(status IN('healthy','warning','degraded','blocked','recovering','unknown')),
 CHECK(severity IN('informational','warning','error','critical'))
);
CREATE INDEX IF NOT EXISTS idx_integrity_findings_active ON accounting_integrity_findings(status,severity,health_scope);
CREATE INDEX IF NOT EXISTS idx_integrity_findings_scan ON accounting_integrity_findings(scan_id,health_code);

CREATE TABLE IF NOT EXISTS accounting_protective_state(
 id TEXT PRIMARY KEY DEFAULT 'primary',state TEXT NOT NULL DEFAULT 'normal',reason_code TEXT,
 safe_summary TEXT,activated_by TEXT,activated_at TEXT,released_by TEXT,released_at TEXT,
 source_scan_id TEXT,version INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL DEFAULT(datetime('now')),
 FOREIGN KEY(source_scan_id) REFERENCES accounting_integrity_scans(id),
 CHECK(state IN('normal','degraded_read_only','posting_blocked','recovering'))
);
INSERT OR IGNORE INTO accounting_protective_state(id) VALUES('primary');

CREATE TABLE IF NOT EXISTS accounting_schema_expectations(
 object_type TEXT NOT NULL,object_name TEXT NOT NULL,required_definition_fragment TEXT,
 introduced_version TEXT NOT NULL,is_critical INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT(datetime('now')),PRIMARY KEY(object_type,object_name),
 CHECK(object_type IN('table','index','trigger','column'))
);
INSERT OR IGNORE INTO accounting_schema_expectations(object_type,object_name,introduced_version) VALUES
('table','accounting_journal_entries','1C'),('table','accounting_journal_lines','1C'),
('table','accounting_posting_idempotency','1C'),('table','accounting_integrity_scans','3E'),
('table','accounting_integrity_findings','3E'),('table','accounting_protective_state','3E'),
('index','idx_accounting_lines_account','1C'),('index','idx_accounting_lines_fund','1C'),
('index','idx_integrity_findings_active','3E'),('trigger','accounting_posted_entry_immutable','1C'),
('trigger','accounting_posted_lines_no_update','1C'),('trigger','accounting_close_snapshot_immutable_update','3D');

CREATE TABLE IF NOT EXISTS accounting_recovery_verifications(
 id TEXT PRIMARY KEY,verification_type TEXT NOT NULL,status TEXT NOT NULL,artifact_reference TEXT,
 artifact_checksum TEXT,manifest_checksum TEXT,schema_valid INTEGER NOT NULL DEFAULT 0,
 trial_balance_hash TEXT,source_links_valid INTEGER NOT NULL DEFAULT 0,reconciliations_valid INTEGER NOT NULL DEFAULT 0,
 close_snapshots_valid INTEGER NOT NULL DEFAULT 0,verified_by TEXT NOT NULL,verified_at TEXT NOT NULL DEFAULT(datetime('now')),
 expires_at TEXT,correlation_id TEXT,details_json TEXT,
 CHECK(verification_type IN('backup','restore','migration_preflight','post_restore')),
 CHECK(status IN('pending','verified','failed','expired'))
);
CREATE INDEX IF NOT EXISTS idx_recovery_verifications_status ON accounting_recovery_verifications(status,verified_at);

CREATE TABLE IF NOT EXISTS accounting_operational_alerts(
 id TEXT PRIMARY KEY,alert_code TEXT NOT NULL,severity TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',
 safe_summary TEXT NOT NULL,recommended_action TEXT NOT NULL,source_type TEXT,source_id TEXT,
 correlation_id TEXT,opened_at TEXT NOT NULL DEFAULT(datetime('now')),acknowledged_by TEXT,
 acknowledged_at TEXT,resolved_at TEXT,version INTEGER NOT NULL DEFAULT 1,
 CHECK(severity IN('informational','warning','error','critical')),
 CHECK(status IN('open','acknowledged','resolved','suppressed'))
);
CREATE INDEX IF NOT EXISTS idx_operational_alerts_open ON accounting_operational_alerts(status,severity,opened_at);

CREATE INDEX IF NOT EXISTS idx_journal_entries_period_status_date ON accounting_journal_entries(accounting_period_id,status,posting_date);
CREATE INDEX IF NOT EXISTS idx_journal_entries_source_status ON accounting_journal_entries(source_type,source_id,status);
CREATE INDEX IF NOT EXISTS idx_integration_events_health ON accounting_integration_source_events(status,posting_status,occurred_at);
CREATE INDEX IF NOT EXISTS idx_reconciliation_health ON accounting_reconciliation_sessions(status,statement_end_date,difference);
CREATE INDEX IF NOT EXISTS idx_close_health ON accounting_close_sessions(status,accounting_period_id,completed_at);
