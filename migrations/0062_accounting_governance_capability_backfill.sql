-- Governance health was added after named Accounting staff profiles and
-- platform memberships already existed. Role templates cover new identities;
-- explicitly backfill the read-only health grant for the two roles that are
-- allowed to receive it without silently re-expanding every stored role.

INSERT OR IGNORE INTO membership_capabilities(
  id,membership_id,capability,granted_by_user_id,granted_at
)
SELECT
  'cap_integrity_view_'||lower(hex(randomblob(12))),
  pm.id,
  'accounting.integrity.view',
  NULL,
  datetime('now')
FROM parish_memberships pm
WHERE pm.role_template IN ('treasurer','bookkeeper')
  AND pm.status='active';

UPDATE accounting_staff_profiles
SET capabilities_json=json_insert(
      CASE WHEN json_valid(capabilities_json) THEN capabilities_json ELSE '[]' END,
      '$[#]',
      'accounting.integrity.view'
    ),
    updated_at=datetime('now')
WHERE role_template IN ('treasurer','bookkeeper')
  AND status='active'
  AND NOT EXISTS(
    SELECT 1
    FROM json_each(CASE WHEN json_valid(capabilities_json) THEN capabilities_json ELSE '[]' END)
    WHERE value='accounting.integrity.view'
  );
