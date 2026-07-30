-- Separate calculated AGAPAY restricted-fund activity from assets that are
-- maintained outside AGAPAY (investments, endowments, real property, etc.).
-- Legacy manually entered restricted-fund rows are preserved as external
-- records and normalized by the application when next edited.
ALTER TABLE stewardship_authoritative_financial_snapshots
  ADD COLUMN external_assets_json TEXT NOT NULL DEFAULT '[]';

ALTER TABLE stewardship_financial_snapshot_revisions
  ADD COLUMN external_assets_json TEXT NOT NULL DEFAULT '[]';

UPDATE stewardship_authoritative_financial_snapshots
   SET external_assets_json = restricted_funds_json
 WHERE external_assets_json = '[]'
   AND restricted_funds_json IS NOT NULL
   AND restricted_funds_json <> '[]';

UPDATE stewardship_financial_snapshot_revisions
   SET external_assets_json = restricted_funds_json
 WHERE external_assets_json = '[]'
   AND restricted_funds_json IS NOT NULL
   AND restricted_funds_json <> '[]';
