-- Preserve historical asset terms, opening balances and forward corrections.
ALTER TABLE accounting_fixed_assets ADD COLUMN original_acquisition_date TEXT;
ALTER TABLE accounting_fixed_assets ADD COLUMN ledger_start_date TEXT;
ALTER TABLE accounting_fixed_assets ADD COLUMN opening_through_date TEXT;
ALTER TABLE accounting_fixed_assets ADD COLUMN opening_depreciation INTEGER NOT NULL DEFAULT 0 CHECK(opening_depreciation>=0);
ALTER TABLE accounting_fixed_assets ADD COLUMN opening_line_id TEXT REFERENCES accounting_journal_lines(id);

DROP TRIGGER accounting_asset_postings_no_reverse;
DROP TRIGGER accounting_asset_movements_no_update;
DROP TRIGGER accounting_asset_movements_no_delete;
-- A reversed charge can be corrected on the same date. Version/operation keys,
-- not an irreversible date uniqueness constraint, prevent duplicate postings.
CREATE TABLE accounting_asset_movements_next (
 id TEXT PRIMARY KEY, asset_id TEXT NOT NULL REFERENCES accounting_fixed_assets(id),
 kind TEXT NOT NULL CHECK(kind IN ('depreciation','disposal')), through_date TEXT NOT NULL,
 depreciation INTEGER NOT NULL CHECK(depreciation>=0), accumulated INTEGER NOT NULL CHECK(accumulated>=0),
 proceeds INTEGER NOT NULL DEFAULT 0 CHECK(proceeds>=0), gain_loss INTEGER NOT NULL DEFAULT 0,
 journal_id TEXT NOT NULL UNIQUE REFERENCES accounting_journal_entries(id),
 operation_key TEXT NOT NULL UNIQUE, request_hash TEXT NOT NULL, asset_version INTEGER NOT NULL DEFAULT 0,
 created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT(datetime('now'))
);
INSERT INTO accounting_asset_movements_next(id,asset_id,kind,through_date,depreciation,accumulated,proceeds,gain_loss,journal_id,operation_key,request_hash,created_by,created_at)
 SELECT id,asset_id,kind,through_date,depreciation,accumulated,proceeds,gain_loss,journal_id,operation_key,request_hash,created_by,created_at FROM accounting_asset_movements;
DROP TABLE accounting_asset_movements;
ALTER TABLE accounting_asset_movements_next RENAME TO accounting_asset_movements;
CREATE INDEX accounting_asset_movements_history ON accounting_asset_movements(asset_id,through_date,asset_version);
CREATE TRIGGER accounting_asset_movements_no_update BEFORE UPDATE ON accounting_asset_movements
 BEGIN SELECT RAISE(ABORT,'Asset movements are append-only'); END;
CREATE TRIGGER accounting_asset_movements_no_delete BEFORE DELETE ON accounting_asset_movements
 BEGIN SELECT RAISE(ABORT,'Asset movements are append-only'); END;

CREATE TABLE accounting_asset_reversals (
 id TEXT PRIMARY KEY, movement_id TEXT NOT NULL UNIQUE REFERENCES accounting_asset_movements(id),
 reversal_journal_id TEXT NOT NULL UNIQUE REFERENCES accounting_journal_entries(id),
 entry_date TEXT NOT NULL, reason TEXT NOT NULL, operation_key TEXT NOT NULL UNIQUE,
 request_hash TEXT NOT NULL, actor_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT(datetime('now'))
);
CREATE TRIGGER accounting_asset_reversals_no_update BEFORE UPDATE ON accounting_asset_reversals
 BEGIN SELECT RAISE(ABORT,'Asset corrections are append-only'); END;
CREATE TRIGGER accounting_asset_reversals_no_delete BEFORE DELETE ON accounting_asset_reversals
 BEGIN SELECT RAISE(ABORT,'Asset corrections are append-only'); END;
CREATE TABLE accounting_asset_cancellations (
 asset_id TEXT PRIMARY KEY REFERENCES accounting_fixed_assets(id), entry_date TEXT NOT NULL,
 reason TEXT NOT NULL, operation_key TEXT NOT NULL UNIQUE, request_hash TEXT NOT NULL,
 actor_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT(datetime('now'))
);
CREATE TRIGGER accounting_asset_cancellations_no_update BEFORE UPDATE ON accounting_asset_cancellations
 BEGIN SELECT RAISE(ABORT,'Asset cancellations are append-only'); END;
CREATE TRIGGER accounting_asset_cancellations_no_delete BEFORE DELETE ON accounting_asset_cancellations
 BEGIN SELECT RAISE(ABORT,'Asset cancellations are append-only'); END;

-- Ephemeral authorization, inserted and removed in the same posting batch.
CREATE TABLE accounting_asset_correction_guards (
 journal_id TEXT PRIMARY KEY REFERENCES accounting_journal_entries(id),
 asset_id TEXT NOT NULL REFERENCES accounting_fixed_assets(id),
 expected_version INTEGER NOT NULL, operation_key TEXT NOT NULL
);
CREATE TRIGGER accounting_asset_postings_no_reverse BEFORE UPDATE OF status ON accounting_journal_entries
 WHEN NEW.status='reversed' AND (
 EXISTS(SELECT 1 FROM accounting_asset_movements WHERE journal_id=OLD.id)
 OR EXISTS(SELECT 1 FROM accounting_asset_reversals WHERE reversal_journal_id=OLD.id)
 OR EXISTS(SELECT 1 FROM accounting_fixed_assets a JOIN accounting_journal_lines l ON l.id=a.acquisition_line_id OR l.id=a.opening_line_id
 WHERE l.journal_entry_id=OLD.id AND NOT EXISTS(SELECT 1 FROM accounting_asset_cancellations c WHERE c.asset_id=a.id)))
 AND NOT EXISTS(SELECT 1 FROM accounting_asset_correction_guards g
 JOIN accounting_fixed_assets a ON a.id=g.asset_id AND a.version=g.expected_version
 JOIN accounting_asset_movements m ON m.journal_id=g.journal_id AND m.asset_id=a.id
 WHERE g.journal_id=OLD.id)
 BEGIN SELECT RAISE(ABORT,'Use the asset correction workflow for this asset-linked entry'); END;

DROP TRIGGER accounting_fixed_assets_allocation;
CREATE TRIGGER accounting_fixed_assets_allocation BEFORE INSERT ON accounting_fixed_assets BEGIN
 SELECT CASE WHEN NOT EXISTS (
 SELECT 1 FROM accounting_journal_lines l JOIN accounting_journal_entries e ON e.id=l.journal_entry_id
 WHERE l.id=NEW.acquisition_line_id AND e.status='posted' AND l.account_id=NEW.cost_account_id
 AND l.fund_id=NEW.fund_id AND e.entry_date=NEW.acquisition_date
 AND l.debit_amount>=NEW.cost+COALESCE((SELECT SUM(cost) FROM accounting_fixed_assets a
 WHERE a.acquisition_line_id=l.id AND NOT EXISTS(SELECT 1 FROM accounting_asset_cancellations c WHERE c.asset_id=a.id)),0))
 THEN RAISE(ABORT,'Asset cost exceeds available posted acquisition amount') END;
 SELECT CASE WHEN NEW.opening_depreciation>0 AND NOT EXISTS (
 SELECT 1 FROM accounting_journal_lines l JOIN accounting_journal_entries e ON e.id=l.journal_entry_id
 WHERE l.id=NEW.opening_line_id AND e.status='posted' AND l.account_id=NEW.accumulated_account_id
 AND l.fund_id=NEW.fund_id AND l.credit_amount>=NEW.opening_depreciation+COALESCE((SELECT SUM(opening_depreciation) FROM accounting_fixed_assets a
 WHERE a.opening_line_id=l.id AND NOT EXISTS(SELECT 1 FROM accounting_asset_cancellations c WHERE c.asset_id=a.id)),0))
 THEN RAISE(ABORT,'Opening depreciation exceeds available posted credit') END;
END;
CREATE TRIGGER accounting_fixed_assets_opening_immutable BEFORE UPDATE ON accounting_fixed_assets
 WHEN NEW.original_acquisition_date IS NOT OLD.original_acquisition_date OR NEW.ledger_start_date IS NOT OLD.ledger_start_date
 OR NEW.opening_through_date IS NOT OLD.opening_through_date OR NEW.opening_depreciation!=OLD.opening_depreciation OR NEW.opening_line_id IS NOT OLD.opening_line_id
 BEGIN SELECT RAISE(ABORT,'Registered opening balances are immutable'); END;
