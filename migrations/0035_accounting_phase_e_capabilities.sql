-- Backfill Phase E's narrowly scoped capabilities from the older broad grants.
-- Kept as separate statements because Cloudflare D1 limits compound SELECT size
-- during remote migration execution.
INSERT OR IGNORE INTO membership_capabilities(id,membership_id,capability,granted_by_user_id,granted_at)
SELECT 'cap_phasee_'||lower(hex(randomblob(12))),membership_id,'accounting.bank_accounts.view',NULL,datetime('now') FROM membership_capabilities WHERE capability='bank.view';
INSERT OR IGNORE INTO membership_capabilities(id,membership_id,capability,granted_by_user_id,granted_at)
SELECT 'cap_phasee_'||lower(hex(randomblob(12))),membership_id,'accounting.reconciliation.view',NULL,datetime('now') FROM membership_capabilities WHERE capability='bank.view';
INSERT OR IGNORE INTO membership_capabilities(id,membership_id,capability,granted_by_user_id,granted_at)
SELECT 'cap_phasee_'||lower(hex(randomblob(12))),membership_id,'accounting.bank_accounts.manage',NULL,datetime('now') FROM membership_capabilities WHERE capability='bank.manage_accounts';
INSERT OR IGNORE INTO membership_capabilities(id,membership_id,capability,granted_by_user_id,granted_at)
SELECT 'cap_phasee_'||lower(hex(randomblob(12))),membership_id,'accounting.bank_imports.manage',NULL,datetime('now') FROM membership_capabilities WHERE capability='bank.manage_accounts';
INSERT OR IGNORE INTO membership_capabilities(id,membership_id,capability,granted_by_user_id,granted_at)
SELECT 'cap_phasee_'||lower(hex(randomblob(12))),membership_id,'accounting.reconciliation.create',NULL,datetime('now') FROM membership_capabilities WHERE capability='bank.reconcile';
INSERT OR IGNORE INTO membership_capabilities(id,membership_id,capability,granted_by_user_id,granted_at)
SELECT 'cap_phasee_'||lower(hex(randomblob(12))),membership_id,'accounting.reconciliation.match',NULL,datetime('now') FROM membership_capabilities WHERE capability='bank.reconcile';
INSERT OR IGNORE INTO membership_capabilities(id,membership_id,capability,granted_by_user_id,granted_at)
SELECT 'cap_phasee_'||lower(hex(randomblob(12))),membership_id,'accounting.reconciliation.adjust',NULL,datetime('now') FROM membership_capabilities WHERE capability='bank.reconcile';
INSERT OR IGNORE INTO membership_capabilities(id,membership_id,capability,granted_by_user_id,granted_at)
SELECT 'cap_phasee_'||lower(hex(randomblob(12))),membership_id,'accounting.reconciliation.complete',NULL,datetime('now') FROM membership_capabilities WHERE capability='accounting.reconcile';
INSERT OR IGNORE INTO membership_capabilities(id,membership_id,capability,granted_by_user_id,granted_at)
SELECT 'cap_phasee_'||lower(hex(randomblob(12))),membership_id,'accounting.reconciliation.reopen',NULL,datetime('now') FROM membership_capabilities WHERE capability='accounting.reopen_period';
INSERT OR IGNORE INTO membership_capabilities(id,membership_id,capability,granted_by_user_id,granted_at)
SELECT 'cap_phasee_'||lower(hex(randomblob(12))),membership_id,'accounting.integrations.view',NULL,datetime('now') FROM membership_capabilities WHERE capability='donations.view';
INSERT OR IGNORE INTO membership_capabilities(id,membership_id,capability,granted_by_user_id,granted_at)
SELECT 'cap_phasee_'||lower(hex(randomblob(12))),membership_id,'accounting.integrations.post',NULL,datetime('now') FROM membership_capabilities WHERE capability='accounting.post';
INSERT OR IGNORE INTO membership_capabilities(id,membership_id,capability,granted_by_user_id,granted_at)
SELECT 'cap_phasee_'||lower(hex(randomblob(12))),membership_id,'accounting.integrations.review',NULL,datetime('now') FROM membership_capabilities WHERE capability='accounting.adjust';
INSERT OR IGNORE INTO membership_capabilities(id,membership_id,capability,granted_by_user_id,granted_at)
SELECT 'cap_phasee_'||lower(hex(randomblob(12))),membership_id,'accounting.integrations.configure',NULL,datetime('now') FROM membership_capabilities WHERE capability='accounting.configure';
INSERT OR IGNORE INTO membership_capabilities(id,membership_id,capability,granted_by_user_id,granted_at)
SELECT 'cap_phasee_'||lower(hex(randomblob(12))),membership_id,'accounting.integrations.backfill',NULL,datetime('now') FROM membership_capabilities WHERE capability='accounting.configure';
INSERT OR IGNORE INTO membership_capabilities(id,membership_id,capability,granted_by_user_id,granted_at)
SELECT 'cap_phasee_'||lower(hex(randomblob(12))),membership_id,'accounting.commerce.view',NULL,datetime('now') FROM membership_capabilities WHERE capability='commerce.manage';
INSERT OR IGNORE INTO membership_capabilities(id,membership_id,capability,granted_by_user_id,granted_at)
SELECT 'cap_phasee_'||lower(hex(randomblob(12))),membership_id,'accounting.commerce.configure',NULL,datetime('now') FROM membership_capabilities WHERE capability='commerce.manage';
INSERT OR IGNORE INTO membership_capabilities(id,membership_id,capability,granted_by_user_id,granted_at)
SELECT 'cap_phasee_'||lower(hex(randomblob(12))),membership_id,'accounting.commerce.post',NULL,datetime('now') FROM membership_capabilities WHERE capability='commerce.manage';
INSERT OR IGNORE INTO membership_capabilities(id,membership_id,capability,granted_by_user_id,granted_at)
SELECT 'cap_phasee_'||lower(hex(randomblob(12))),membership_id,'accounting.commerce.review',NULL,datetime('now') FROM membership_capabilities WHERE capability='commerce.manage';
INSERT OR IGNORE INTO membership_capabilities(id,membership_id,capability,granted_by_user_id,granted_at)
SELECT 'cap_phasee_'||lower(hex(randomblob(12))),membership_id,'accounting.commerce.backfill',NULL,datetime('now') FROM membership_capabilities WHERE capability='commerce.manage';
INSERT OR IGNORE INTO membership_capabilities(id,membership_id,capability,granted_by_user_id,granted_at)
SELECT 'cap_phasee_'||lower(hex(randomblob(12))),membership_id,'accounting.commerce.reports.view',NULL,datetime('now') FROM membership_capabilities WHERE capability='commerce.manage';
