-- Retire the temporary deterministic rows created before the immutable posted
-- history was detected. They never received journal activity. Clear their
-- source identities first because that pair is unique in the ledger catalog.
UPDATE accounting_funds
SET giving_enabled=0,
    is_active=0,
    archived_at=COALESCE(archived_at,datetime('now')),
    giving_source_type=NULL,
    giving_source_id=NULL,
    version=version+1,
    updated_at=datetime('now')
WHERE id IN (
  'fund_operational_a344f661d4e7be6ced03',
  'fund_operational_de1132c9957934c14e3d',
  'fund_operational_30b1ab12710151c9a170',
  'fund_operational_92f8582ca6b3a8548c86',
  'fund_operational_d5cf40fb429d1da54fa5',
  'fund_operational_5dd65731511eae0c196e',
  'fund_operational_47d4f1f9d36334fbc670'
);

-- One-time, idempotent publication of the repaired St. Fiacre Funds & Alms
-- catalog to its isolated production accounting database. These IDs already
-- own posted journal history, so they remain canonical.
WITH catalog(id,source_id) AS (
  VALUES
    ('fund_giving_stewardship','stewardship'),
    ('fund_giving_candle','candle'),
    ('fund_giving_building','building'),
    ('fund_giving_alms','alms'),
    ('fund_giving_campaign','campaign'),
    ('fund_giving_iconography','iconography'),
    ('fund_giving_memorial','memorial')
)
UPDATE accounting_funds
SET giving_source_type='fund',
    giving_source_id=(SELECT source_id FROM catalog WHERE catalog.id=accounting_funds.id),
    giving_enabled=1,
    is_active=1,
    archived_at=NULL,
    giving_metadata_json='{}',
    version=version+1,
    updated_at=datetime('now')
WHERE id IN (SELECT id FROM catalog);
