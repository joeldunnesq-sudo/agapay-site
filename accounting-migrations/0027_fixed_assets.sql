-- Asset subledger. Amounts are integer cents; posted journals remain authoritative.
CREATE TABLE accounting_fixed_assets (
 id TEXT PRIMARY KEY, tag TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
 acquisition_line_id TEXT NOT NULL REFERENCES accounting_journal_lines(id),
 acquisition_date TEXT NOT NULL, in_service_date TEXT NOT NULL,
 cost INTEGER NOT NULL CHECK(cost > 0), salvage INTEGER NOT NULL CHECK(salvage >= 0 AND salvage <= cost),
 life_months INTEGER NOT NULL CHECK(life_months BETWEEN 1 AND 1200),
 method TEXT NOT NULL CHECK(method IN ('straight_line','none')),
 cost_account_id TEXT NOT NULL REFERENCES accounting_accounts(id),
 accumulated_account_id TEXT REFERENCES accounting_accounts(id),
 expense_account_id TEXT REFERENCES accounting_accounts(id),
 fund_id TEXT NOT NULL REFERENCES accounting_funds(id),
 location TEXT NOT NULL DEFAULT '', serial_number TEXT NOT NULL DEFAULT '',
 insurance_value INTEGER NOT NULL DEFAULT 0 CHECK(insurance_value >= 0), notes TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disposed')),
 disposal_date TEXT, version INTEGER NOT NULL DEFAULT 1,
 request_hash TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX accounting_fixed_assets_acquisition ON accounting_fixed_assets(acquisition_line_id);
CREATE TRIGGER accounting_fixed_assets_allocation BEFORE INSERT ON accounting_fixed_assets BEGIN
 SELECT CASE WHEN NOT EXISTS (
   SELECT 1 FROM accounting_journal_lines l JOIN accounting_journal_entries e ON e.id=l.journal_entry_id
   WHERE l.id=NEW.acquisition_line_id AND e.status='posted' AND l.account_id=NEW.cost_account_id
    AND l.fund_id=NEW.fund_id AND e.entry_date=NEW.acquisition_date
    AND l.debit_amount >= NEW.cost + COALESCE((SELECT SUM(cost) FROM accounting_fixed_assets WHERE acquisition_line_id=l.id),0)
 ) THEN RAISE(ABORT,'Asset cost exceeds available posted acquisition amount') END;
END;
CREATE TRIGGER accounting_fixed_assets_terms BEFORE UPDATE ON accounting_fixed_assets
 WHEN NEW.cost != OLD.cost OR NEW.salvage != OLD.salvage OR NEW.life_months != OLD.life_months
 OR NEW.method != OLD.method OR NEW.acquisition_line_id != OLD.acquisition_line_id
 OR NEW.in_service_date != OLD.in_service_date OR NEW.cost_account_id != OLD.cost_account_id
 OR NEW.fund_id != OLD.fund_id OR NEW.accumulated_account_id IS NOT OLD.accumulated_account_id
 OR NEW.expense_account_id IS NOT OLD.expense_account_id OR NEW.acquisition_date != OLD.acquisition_date
 BEGIN SELECT RAISE(ABORT,'Registered financial terms are immutable'); END;
CREATE TABLE accounting_asset_movements (
 id TEXT PRIMARY KEY, asset_id TEXT NOT NULL REFERENCES accounting_fixed_assets(id),
 kind TEXT NOT NULL CHECK(kind IN ('depreciation','disposal')), through_date TEXT NOT NULL,
 depreciation INTEGER NOT NULL CHECK(depreciation >= 0), accumulated INTEGER NOT NULL CHECK(accumulated >= 0),
 proceeds INTEGER NOT NULL DEFAULT 0 CHECK(proceeds >= 0), gain_loss INTEGER NOT NULL DEFAULT 0,
 journal_id TEXT NOT NULL UNIQUE REFERENCES accounting_journal_entries(id),
 operation_key TEXT NOT NULL UNIQUE, request_hash TEXT NOT NULL,
 created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')),
 UNIQUE(asset_id,kind,through_date)
);
CREATE TRIGGER accounting_asset_movements_no_update BEFORE UPDATE ON accounting_asset_movements
 BEGIN SELECT RAISE(ABORT,'Asset movements are append-only'); END;
CREATE TRIGGER accounting_asset_movements_no_delete BEFORE DELETE ON accounting_asset_movements
 BEGIN SELECT RAISE(ABORT,'Asset movements are append-only'); END;
CREATE TABLE accounting_asset_audit (
 id TEXT PRIMARY KEY, asset_id TEXT NOT NULL REFERENCES accounting_fixed_assets(id),
 action TEXT NOT NULL, actor_id TEXT NOT NULL, detail TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TRIGGER accounting_asset_audit_no_update BEFORE UPDATE ON accounting_asset_audit
 BEGIN SELECT RAISE(ABORT,'Asset audit is append-only'); END;
CREATE TRIGGER accounting_asset_audit_no_delete BEFORE DELETE ON accounting_asset_audit
 BEGIN SELECT RAISE(ABORT,'Asset audit is append-only'); END;
-- Prevent general-ledger reversals from leaving the asset subledger inconsistent.
CREATE TRIGGER accounting_asset_postings_no_reverse BEFORE UPDATE OF status ON accounting_journal_entries
 WHEN NEW.status='reversed' AND (EXISTS(SELECT 1 FROM accounting_asset_movements WHERE journal_id=OLD.id)
 OR EXISTS(SELECT 1 FROM accounting_fixed_assets a JOIN accounting_journal_lines l ON l.id=a.acquisition_line_id WHERE l.journal_entry_id=OLD.id))
 BEGIN SELECT RAISE(ABORT,'This entry is linked to the asset register; an asset correction is required'); END;
