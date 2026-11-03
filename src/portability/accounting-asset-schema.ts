// Reviewed asset subledger boundary for export and recovery.
// prettier-ignore
export const ASSET_PORTABILITY_SCHEMA: Readonly<Partial<Record<string, readonly string[]>>> = Object.freeze({
  "accounting_fixed_assets": ["accumulated_account_id","acquisition_date","acquisition_line_id","cost","cost_account_id","created_at","created_by","disposal_date","expense_account_id","fund_id","id","in_service_date","insurance_value","life_months","location","method","name","notes","request_hash","salvage","serial_number","status","tag","version"],
  "accounting_asset_movements": ["accumulated","asset_id","created_at","created_by","depreciation","gain_loss","id","journal_id","kind","operation_key","proceeds","request_hash","through_date"],
  "accounting_asset_audit": ["action","actor_id","asset_id","created_at","detail","id"],
});
