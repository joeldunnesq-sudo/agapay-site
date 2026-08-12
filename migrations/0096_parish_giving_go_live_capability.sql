-- Grant the deterministic P1-3 Go-Live authority only to existing active
-- treasurer memberships. New treasurer invitations receive the same
-- capability from ROLE_TEMPLATES in src/lib/authorization.js.
INSERT OR IGNORE INTO membership_capabilities (
  id, membership_id, capability, granted_by_user_id, granted_at
)
SELECT
  'cap_go_live_' || m.id,
  m.id,
  'parish.giving.go_live',
  NULL,
  datetime('now')
FROM parish_memberships m
WHERE m.role_template = 'treasurer'
  AND m.status = 'active';
