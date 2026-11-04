import { ONBOARDING_PORTABILITY_SCHEMA } from './accounting-onboarding-schema.js';
// Reviewed reporting metadata and immutable council package snapshots.
// prettier-ignore
export const READINESS_PORTABILITY_SCHEMA: Readonly<Partial<Record<string, readonly string[]>>> = Object.freeze({
  ...ONBOARDING_PORTABILITY_SCHEMA,
  "accounting_dimensions": [
    "code",
    "created_at",
    "created_by",
    "id",
    "is_active",
    "kind",
    "name",
    "version"
  ],
  "accounting_journal_line_dimensions": [
    "department_id",
    "line_id",
    "project_id",
    "updated_at",
    "updated_by",
    "version"
  ],
  "accounting_budget_dimension_allocations": [
    "basis_points",
    "budget_line_id",
    "department_id",
    "id",
    "project_id",
    "sort_order"
  ],
  "accounting_dimension_audit": [
    "action",
    "actor_id",
    "created_at",
    "detail",
    "entity_id",
    "entity_type",
    "id"
  ],
  "accounting_report_packages": [
    "created_at",
    "created_by",
    "id",
    "is_active",
    "name",
    "report_ids",
    "version"
  ],
  "accounting_report_package_runs": [
    "budget_id",
    "created_at",
    "created_by",
    "end_date",
    "id",
    "operation_key",
    "package_id",
    "request_hash",
    "snapshot_json",
    "start_date"
  ]
});
