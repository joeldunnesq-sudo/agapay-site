-- Named-clergy authorization for the pastoral-care tickler.
-- Role templates are snapshots, so existing active priest/rector memberships
-- receive the new grants explicitly while new invitations get them from code.

INSERT OR IGNORE INTO membership_capabilities
  (id, membership_id, capability, granted_by_user_id, granted_at)
SELECT
  'cap_pastoral_own_' || lower(hex(randomblob(12))),
  id,
  'sacraments.pastoral.manage_own',
  NULL,
  datetime('now')
FROM parish_memberships
WHERE status = 'active' AND role_template IN ('priest', 'rector');

INSERT OR IGNORE INTO membership_capabilities
  (id, membership_id, capability, granted_by_user_id, granted_at)
SELECT
  'cap_pastoral_coverage_' || lower(hex(randomblob(12))),
  id,
  'sacraments.pastoral.coverage',
  NULL,
  datetime('now')
FROM parish_memberships
WHERE status = 'active' AND role_template = 'rector';
