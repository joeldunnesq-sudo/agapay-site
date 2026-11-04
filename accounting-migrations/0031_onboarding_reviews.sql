-- Explicit onboarding reviews are distinct from the existence of seeded records.
CREATE TABLE accounting_onboarding_reviews (
 task_id TEXT PRIMARY KEY CHECK(task_id IN ('fiscal','accounts','funds','records','assets')),
 choice TEXT NOT NULL,note TEXT NOT NULL,evidence_hash TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1,reviewed_by TEXT NOT NULL,reviewed_at TEXT NOT NULL DEFAULT(datetime('now'))
);
CREATE TABLE accounting_onboarding_audit (
 id TEXT PRIMARY KEY,task_id TEXT NOT NULL,choice TEXT NOT NULL,note TEXT NOT NULL,evidence_hash TEXT NOT NULL,
 actor_id TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT(datetime('now'))
);
CREATE TRIGGER accounting_onboarding_audit_no_update BEFORE UPDATE ON accounting_onboarding_audit BEGIN SELECT RAISE(ABORT,'Onboarding review history is immutable'); END;
CREATE TRIGGER accounting_onboarding_audit_no_delete BEFORE DELETE ON accounting_onboarding_audit BEGIN SELECT RAISE(ABORT,'Onboarding review history is immutable'); END;
