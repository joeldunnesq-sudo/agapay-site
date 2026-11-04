-- Independent reporting labels; funds and posted journal amounts remain intact.
CREATE TABLE accounting_dimensions (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('department','project')),
 code TEXT NOT NULL,name TEXT NOT NULL,is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN(0,1)),
 version INTEGER NOT NULL DEFAULT 1,created_by TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT(datetime('now')),
 UNIQUE(kind,code)
);
CREATE TABLE accounting_journal_line_dimensions (
 line_id TEXT PRIMARY KEY REFERENCES accounting_journal_lines(id),
 department_id TEXT REFERENCES accounting_dimensions(id),project_id TEXT REFERENCES accounting_dimensions(id),
 version INTEGER NOT NULL DEFAULT 1,updated_by TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT(datetime('now'))
);
CREATE INDEX accounting_dimension_line_report ON accounting_journal_line_dimensions(department_id,project_id,line_id);
CREATE TABLE accounting_budget_dimension_allocations (
 id TEXT PRIMARY KEY,budget_line_id TEXT NOT NULL REFERENCES accounting_budget_lines(id) ON DELETE CASCADE,
 department_id TEXT REFERENCES accounting_dimensions(id),project_id TEXT REFERENCES accounting_dimensions(id),
 basis_points INTEGER NOT NULL CHECK(basis_points>0 AND basis_points<=10000),sort_order INTEGER NOT NULL
);
CREATE INDEX accounting_dimension_budget_report ON accounting_budget_dimension_allocations(budget_line_id);
CREATE TABLE accounting_dimension_audit (
 id TEXT PRIMARY KEY,entity_type TEXT NOT NULL,entity_id TEXT NOT NULL,action TEXT NOT NULL,
 actor_id TEXT NOT NULL,detail TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT(datetime('now'))
);
CREATE TRIGGER accounting_dimension_audit_no_update BEFORE UPDATE ON accounting_dimension_audit
 BEGIN SELECT RAISE(ABORT,'Dimension audit is append-only'); END;
CREATE TRIGGER accounting_dimension_audit_no_delete BEFORE DELETE ON accounting_dimension_audit
 BEGIN SELECT RAISE(ABORT,'Dimension audit is append-only'); END;
CREATE TRIGGER accounting_dimension_line_types BEFORE INSERT ON accounting_journal_line_dimensions BEGIN
 SELECT CASE WHEN NEW.department_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM accounting_dimensions WHERE id=NEW.department_id AND kind='department' AND is_active=1)
 THEN RAISE(ABORT,'Choose an active department') END;
 SELECT CASE WHEN NEW.project_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM accounting_dimensions WHERE id=NEW.project_id AND kind='project' AND is_active=1)
 THEN RAISE(ABORT,'Choose an active project') END;
END;
CREATE TRIGGER accounting_dimension_line_types_update BEFORE UPDATE ON accounting_journal_line_dimensions BEGIN
 SELECT CASE WHEN NEW.department_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM accounting_dimensions WHERE id=NEW.department_id AND kind='department' AND (is_active=1 OR id=OLD.department_id))
 THEN RAISE(ABORT,'Choose an active department') END;
 SELECT CASE WHEN NEW.project_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM accounting_dimensions WHERE id=NEW.project_id AND kind='project' AND (is_active=1 OR id=OLD.project_id))
 THEN RAISE(ABORT,'Choose an active project') END;
END;
CREATE TRIGGER accounting_dimension_budget_insert BEFORE INSERT ON accounting_budget_dimension_allocations BEGIN
 SELECT CASE WHEN (SELECT b.status FROM accounting_budgets b JOIN accounting_budget_lines l ON l.budget_id=b.id WHERE l.id=NEW.budget_line_id)!='draft'
 THEN RAISE(ABORT,'Only draft budget allocations can change') END;
 SELECT CASE WHEN NEW.department_id IS NULL AND NEW.project_id IS NULL THEN RAISE(ABORT,'Choose a department or project') END;
 SELECT CASE WHEN NEW.department_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM accounting_dimensions WHERE id=NEW.department_id AND kind='department' AND is_active=1)
 THEN RAISE(ABORT,'Choose an active department') END;
 SELECT CASE WHEN NEW.project_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM accounting_dimensions WHERE id=NEW.project_id AND kind='project' AND is_active=1)
 THEN RAISE(ABORT,'Choose an active project') END;
 SELECT CASE WHEN NEW.basis_points+COALESCE((SELECT SUM(basis_points) FROM accounting_budget_dimension_allocations WHERE budget_line_id=NEW.budget_line_id),0)>10000
 THEN RAISE(ABORT,'Budget allocation exceeds 100 percent') END;
END;
CREATE TRIGGER accounting_dimension_budget_no_update BEFORE UPDATE ON accounting_budget_dimension_allocations
 BEGIN SELECT RAISE(ABORT,'Replace draft allocations as one reviewed set'); END;
CREATE TRIGGER accounting_dimension_budget_delete BEFORE DELETE ON accounting_budget_dimension_allocations
 WHEN (SELECT b.status FROM accounting_budgets b JOIN accounting_budget_lines l ON l.budget_id=b.id WHERE l.id=OLD.budget_line_id)!='draft'
 BEGIN SELECT RAISE(ABORT,'Submitted, approved and locked budget allocations are immutable'); END;
