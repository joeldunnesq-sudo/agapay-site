CREATE TABLE IF NOT EXISTS accounting_draft_revisions (
 id TEXT PRIMARY KEY, journal_entry_id TEXT NOT NULL, version INTEGER NOT NULL,
 description TEXT NOT NULL, memo TEXT, entry_date TEXT NOT NULL, lines_json TEXT NOT NULL,
 actor_type TEXT NOT NULL, actor_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT(datetime('now')),
 FOREIGN KEY(journal_entry_id) REFERENCES accounting_journal_entries(id), UNIQUE(journal_entry_id,version)
);
CREATE TABLE IF NOT EXISTS accounting_attachment_metadata (
 id TEXT PRIMARY KEY, journal_entry_id TEXT NOT NULL, display_name TEXT NOT NULL, media_type TEXT,
 storage_status TEXT NOT NULL DEFAULT 'placeholder', created_at TEXT NOT NULL DEFAULT(datetime('now')),
 FOREIGN KEY(journal_entry_id) REFERENCES accounting_journal_entries(id), CHECK(storage_status='placeholder')
);
CREATE INDEX IF NOT EXISTS idx_accounting_entries_search ON accounting_journal_entries(status,entry_date,source_type);
CREATE INDEX IF NOT EXISTS idx_accounting_lines_entry_account_fund ON accounting_journal_lines(journal_entry_id,account_id,fund_id);
