-- Priests share the parish pastoral-care coverage queue so illness or absence
-- never hides assigned follow-ups from another configured priest.

INSERT OR IGNORE INTO membership_capabilities
  (id, membership_id, capability, granted_by_user_id, granted_at)
SELECT
  'cap_pastoral_coverage_' || lower(hex(randomblob(12))),
  id,
  'sacraments.pastoral.coverage',
  NULL,
  datetime('now')
FROM parish_memberships
WHERE status = 'active' AND role_template = 'priest';
