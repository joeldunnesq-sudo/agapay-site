CREATE TABLE accounting_report_packages (
 id TEXT PRIMARY KEY,name TEXT NOT NULL,report_ids TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1,is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN(0,1)),
 created_by TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT(datetime('now'))
);
CREATE TABLE accounting_report_package_runs (
 id TEXT PRIMARY KEY,package_id TEXT NOT NULL REFERENCES accounting_report_packages(id),
 start_date TEXT NOT NULL,end_date TEXT NOT NULL,budget_id TEXT REFERENCES accounting_budgets(id),
 snapshot_json TEXT NOT NULL,operation_key TEXT NOT NULL UNIQUE,request_hash TEXT NOT NULL,
 created_by TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT(datetime('now'))
);
CREATE TRIGGER accounting_report_package_runs_no_update BEFORE UPDATE ON accounting_report_package_runs BEGIN SELECT RAISE(ABORT,'Report package snapshots are immutable'); END;
CREATE TRIGGER accounting_report_package_runs_no_delete BEFORE DELETE ON accounting_report_package_runs BEGIN SELECT RAISE(ABORT,'Report package snapshots are immutable'); END;
