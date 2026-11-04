// Reviewed parish onboarding decisions and immutable review history.
// prettier-ignore
export const ONBOARDING_PORTABILITY_SCHEMA: Readonly<Partial<Record<string,readonly string[]>>> = Object.freeze({
  "accounting_onboarding_reviews": [
    "choice",
    "evidence_hash",
    "note",
    "reviewed_at",
    "reviewed_by",
    "task_id",
    "version"
  ],
  "accounting_onboarding_audit": [
    "actor_id",
    "choice",
    "created_at",
    "evidence_hash",
    "id",
    "note",
    "task_id"
  ]
});
