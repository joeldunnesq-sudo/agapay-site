-- Grant the migration privilege to existing treasurer identities only.
-- Role templates cover new grants; these statements keep already-created
-- platform memberships and Accounting PIN profiles aligned.

INSERT OR IGNORE INTO membership_capabilities(
  id,membership_id,capability,granted_by_user_id,granted_at
)
SELECT
  'cap_migration_'||lower(hex(randomblob(12))),
  pm.id,
  'accounting.migration.import',
  NULL,
  datetime('now')
FROM parish_memberships pm
WHERE pm.role_template='treasurer' AND pm.status='active';

UPDATE accounting_staff_profiles
SET capabilities_json=json_insert(
      CASE WHEN json_valid(capabilities_json) THEN capabilities_json ELSE '[]' END,
      '$[#]',
      'accounting.migration.import'
    ),
    updated_at=datetime('now')
WHERE role_template='treasurer'
  AND status='active'
  AND NOT EXISTS(
    SELECT 1
    FROM json_each(CASE WHEN json_valid(capabilities_json) THEN capabilities_json ELSE '[]' END)
    WHERE value='accounting.migration.import'
  );
