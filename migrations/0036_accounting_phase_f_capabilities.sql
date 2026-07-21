-- Backfill Phase F's granular close permissions from established accounting grants.
-- Separate statements keep the migration within Cloudflare D1 compound-query limits.
INSERT OR IGNORE INTO membership_capabilities(id,membership_id,capability,granted_by_user_id,granted_at)
SELECT 'cap_phasef_'||lower(hex(randomblob(12))),membership_id,'accounting.close.view',NULL,datetime('now') FROM membership_capabilities WHERE capability='accounting.view';
INSERT OR IGNORE INTO membership_capabilities(id,membership_id,capability,granted_by_user_id,granted_at)
SELECT 'cap_phasef_'||lower(hex(randomblob(12))),membership_id,'accounting.close.create',NULL,datetime('now') FROM membership_capabilities WHERE capability='accounting.close_period';
INSERT OR IGNORE INTO membership_capabilities(id,membership_id,capability,granted_by_user_id,granted_at)
SELECT 'cap_phasef_'||lower(hex(randomblob(12))),membership_id,'accounting.close.validate',NULL,datetime('now') FROM membership_capabilities WHERE capability='accounting.close_period';
INSERT OR IGNORE INTO membership_capabilities(id,membership_id,capability,granted_by_user_id,granted_at)
SELECT 'cap_phasef_'||lower(hex(randomblob(12))),membership_id,'accounting.close.adjust',NULL,datetime('now') FROM membership_capabilities WHERE capability='accounting.adjust';
INSERT OR IGNORE INTO membership_capabilities(id,membership_id,capability,granted_by_user_id,granted_at)
SELECT 'cap_phasef_'||lower(hex(randomblob(12))),membership_id,'accounting.close.review',NULL,datetime('now') FROM membership_capabilities WHERE capability='accounting.close_period';
INSERT OR IGNORE INTO membership_capabilities(id,membership_id,capability,granted_by_user_id,granted_at)
SELECT 'cap_phasef_'||lower(hex(randomblob(12))),membership_id,'accounting.close.approve',NULL,datetime('now') FROM membership_capabilities WHERE capability='accounting.close_period';
INSERT OR IGNORE INTO membership_capabilities(id,membership_id,capability,granted_by_user_id,granted_at)
SELECT 'cap_phasef_'||lower(hex(randomblob(12))),membership_id,'accounting.close.complete',NULL,datetime('now') FROM membership_capabilities WHERE capability='accounting.close_period';
INSERT OR IGNORE INTO membership_capabilities(id,membership_id,capability,granted_by_user_id,granted_at)
SELECT 'cap_phasef_'||lower(hex(randomblob(12))),membership_id,'accounting.close.reopen',NULL,datetime('now') FROM membership_capabilities WHERE capability='accounting.reopen_period';
INSERT OR IGNORE INTO membership_capabilities(id,membership_id,capability,granted_by_user_id,granted_at)
SELECT 'cap_phasef_'||lower(hex(randomblob(12))),membership_id,'accounting.year_end.view',NULL,datetime('now') FROM membership_capabilities WHERE capability='accounting.reports';
INSERT OR IGNORE INTO membership_capabilities(id,membership_id,capability,granted_by_user_id,granted_at)
SELECT 'cap_phasef_'||lower(hex(randomblob(12))),membership_id,'accounting.year_end.execute',NULL,datetime('now') FROM membership_capabilities WHERE capability='accounting.close_period';
INSERT OR IGNORE INTO membership_capabilities(id,membership_id,capability,granted_by_user_id,granted_at)
SELECT 'cap_phasef_'||lower(hex(randomblob(12))),membership_id,'accounting.accountant_exports.generate',NULL,datetime('now') FROM membership_capabilities WHERE capability='accounting.export';
INSERT OR IGNORE INTO membership_capabilities(id,membership_id,capability,granted_by_user_id,granted_at)
SELECT 'cap_phasef_'||lower(hex(randomblob(12))),membership_id,'accounting.audit_exports.generate',NULL,datetime('now') FROM membership_capabilities WHERE capability='accounting.audit';
INSERT OR IGNORE INTO membership_capabilities(id,membership_id,capability,granted_by_user_id,granted_at)
SELECT 'cap_phasef_'||lower(hex(randomblob(12))),membership_id,'accounting.retention.manage',NULL,datetime('now') FROM membership_capabilities WHERE capability='accounting.configure';
INSERT OR IGNORE INTO membership_capabilities(id,membership_id,capability,granted_by_user_id,granted_at)
SELECT 'cap_phasef_'||lower(hex(randomblob(12))),membership_id,'accounting.legal_hold.manage',NULL,datetime('now') FROM membership_capabilities WHERE capability='accounting.configure';
