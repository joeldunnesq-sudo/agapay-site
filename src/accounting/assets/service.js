// Generated from src/accounting/assets/service.ts by npm run build:server. Do not edit.
import { CapabilityDeniedError, ValidationError } from '../errors.js';
import { accumulatedAt, cents, date, depreciationSchedule } from './schedule.js';
function permitted(actor, capability = 'accounting.view') {
  if (!actor?.id || !actor.capabilities?.includes(capability)) throw new CapabilityDeniedError();
}
async function hash(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return [...new Uint8Array(bytes)].map((v) => v.toString(16).padStart(2, '0')).join('');
}
function text(value, label, max = 160, required = false) {
  const result = String(value ?? '').trim();
  if (result.length > max || (required && !result))
    throw new ValidationError(`${label} is required and must fit ${max} characters.`);
  return result;
}
async function getAsset(db, actor, id) {
  permitted(actor);
  const asset = await db.prepare('SELECT * FROM accounting_fixed_assets WHERE id=?').bind(id).first();
  if (!asset) throw new ValidationError('Asset not found.');
  return asset;
}
async function assetAccount(db, id, category, normalBalance) {
  const account = await db
    .prepare(
      `SELECT a.*,t.category FROM accounting_accounts a JOIN accounting_account_types t
 ON t.id=a.account_type_id WHERE a.id=? AND a.is_active=1 AND a.archived_at IS NULL AND a.is_posting_account=1`
    )
    .bind(id)
    .first();
  if (!account || account.category !== category || (normalBalance && account.normal_balance !== normalBalance))
    throw new ValidationError(`Choose an active ${normalBalance || ''} ${category} posting account.`);
  return account;
}
async function acquisitionLines(db, actor) {
  permitted(actor);
  return (
    (
      await db
        .prepare(
          `SELECT l.id,l.account_id,l.fund_id,l.debit_amount,e.id journal_id,e.entry_date,e.entry_number,
 e.description,a.name account_name,f.name fund_name,l.debit_amount-COALESCE((SELECT SUM(cost) FROM accounting_fixed_assets WHERE acquisition_line_id=l.id),0) available
 FROM accounting_journal_lines l JOIN accounting_journal_entries e ON e.id=l.journal_entry_id
 JOIN accounting_accounts a ON a.id=l.account_id JOIN accounting_account_types t ON t.id=a.account_type_id
 JOIN accounting_funds f ON f.id=l.fund_id WHERE e.status='posted' AND l.debit_amount>0
 AND t.category='asset' AND a.normal_balance='debit' AND a.cash_flow_classification='investing'
 ORDER BY e.entry_date DESC,l.id LIMIT 500`
        )
        .all()
    ).results || []
  );
}
async function registerAsset(db, actor, input) {
  permitted(actor, 'accounting.configure');
  const key = text(input.operationKey, 'Operation key', 100, true);
  const values = {
    tag: text(input.tag, 'Asset tag', 80, true),
    name: text(input.name, 'Asset name', 160, true),
    acquisitionLineId: text(input.acquisitionLineId, 'Acquisition line', 100, true),
    inServiceDate: date(input.inServiceDate),
    cost: cents(input.cost, 'Cost', true),
    salvage: cents(input.salvage, 'Salvage value'),
    lifeMonths: input.lifeMonths,
    method: input.method,
    accumulatedAccountId: text(input.accumulatedAccountId, 'Accumulated depreciation account', 100),
    expenseAccountId: text(input.expenseAccountId, 'Depreciation expense account', 100),
    location: text(input.location, 'Location'),
    serialNumber: text(input.serialNumber, 'Serial number'),
    insuranceValue: cents(input.insuranceValue ?? 0, 'Insurance value'),
    notes: text(input.notes, 'Notes', 4e3),
  };
  if (
    values.salvage > values.cost ||
    !Number.isInteger(values.lifeMonths) ||
    values.lifeMonths < 1 ||
    values.lifeMonths > 1200 ||
    !['straight_line', 'none'].includes(values.method)
  )
    throw new ValidationError('Check salvage value, method and useful life (1–1200 months).');
  const id = `asset_${(await hash(key)).slice(0, 40)}`,
    requestHash = await hash(values);
  const prior = await db.prepare('SELECT * FROM accounting_fixed_assets WHERE id=?').bind(id).first();
  if (prior) {
    if (prior.request_hash !== requestHash)
      throw new ValidationError('Operation key was already used with different asset details.');
    return prior;
  }
  const line = await db
    .prepare(
      `SELECT l.*,e.entry_date FROM accounting_journal_lines l JOIN accounting_journal_entries e
 ON e.id=l.journal_entry_id WHERE l.id=? AND e.status='posted'`
    )
    .bind(values.acquisitionLineId)
    .first();
  if (!line) throw new ValidationError('Choose a posted acquisition debit. Record the purchase or in-kind gift first.');
  const costAccount = await assetAccount(db, line.account_id, 'asset', 'debit');
  if (costAccount.cash_flow_classification !== 'investing' || Number(costAccount.account_number) < 1100)
    throw new ValidationError('The cost account must be classified as investing, not a cash or operating account.');
  if (values.inServiceDate < line.entry_date) throw new ValidationError('In-service date cannot precede acquisition.');
  if (values.method === 'straight_line') {
    const contra = await assetAccount(db, values.accumulatedAccountId, 'asset', 'credit');
    if (contra.cash_flow_classification !== 'operating')
      throw new ValidationError(
        'Classify accumulated depreciation as operating to add back noncash depreciation in cash flow.'
      );
    await assetAccount(db, values.expenseAccountId, 'expense', 'debit');
  }
  await db.batch([
    db
      .prepare(
        `INSERT INTO accounting_fixed_assets(id,tag,name,acquisition_line_id,acquisition_date,in_service_date,cost,salvage,
  life_months,method,cost_account_id,accumulated_account_id,expense_account_id,fund_id,location,serial_number,insurance_value,notes,request_hash,created_by)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .bind(
        id,
        values.tag,
        values.name,
        values.acquisitionLineId,
        line.entry_date,
        values.inServiceDate,
        values.cost,
        values.salvage,
        values.lifeMonths,
        values.method,
        line.account_id,
        values.method === 'none' ? null : values.accumulatedAccountId,
        values.method === 'none' ? null : values.expenseAccountId,
        line.fund_id,
        values.location,
        values.serialNumber,
        values.insuranceValue,
        values.notes,
        requestHash,
        actor.id
      ),
    db
      .prepare('INSERT INTO accounting_asset_audit(id,asset_id,action,actor_id,detail) VALUES(?,?,?,?,?)')
      .bind(crypto.randomUUID(), id, 'registered', actor.id, JSON.stringify(values)),
  ]);
  return getAsset(db, actor, id);
}
async function assetDetail(db, actor, id) {
  const asset = await getAsset(db, actor, id);
  const [movements, source, audit] = await Promise.all([
    db.prepare('SELECT * FROM accounting_asset_movements WHERE asset_id=? ORDER BY through_date,id').bind(id).all(),
    db
      .prepare('SELECT journal_entry_id FROM accounting_journal_lines WHERE id=?')
      .bind(asset.acquisition_line_id)
      .first(),
    db.prepare('SELECT * FROM accounting_asset_audit WHERE asset_id=? ORDER BY created_at,id').bind(id).all(),
  ]);
  return {
    asset,
    movements: movements.results || [],
    schedule: depreciationSchedule(asset),
    source,
    audit: audit.results || [],
  };
}
async function assetRegister(db, actor, asOf) {
  permitted(actor);
  date(asOf);
  const data = await db
    .prepare(
      `SELECT a.*,COALESCE((SELECT SUM(depreciation) FROM accounting_asset_movements m
 WHERE m.asset_id=a.id AND m.through_date<=?),0) posted_depreciation FROM accounting_fixed_assets a
 WHERE a.acquisition_date<=? ORDER BY a.tag LIMIT 5001`
    )
    .bind(asOf, asOf)
    .all();
  if ((data.results || []).length > 5e3)
    throw new ValidationError('Asset register exceeds 5,000 rows. Contact support for a full export.');
  const rows = (data.results || []).map((a) => {
    const disposed = !!a.disposal_date && a.disposal_date <= asOf;
    const accumulated = a.posted_depreciation;
    return {
      ...a,
      asOf,
      status: disposed ? 'disposed' : 'active',
      postedDepreciation: accumulated,
      scheduledDepreciation: accumulatedAt(a, disposed ? a.disposal_date : asOf),
      netBookValue: disposed ? 0 : a.cost - accumulated,
    };
  });
  const active = rows.filter((a) => a.status === 'active');
  const totals = {
    cost: active.reduce((s, a) => s + a.cost, 0),
    accumulated: active.reduce((s, a) => s + a.postedDepreciation, 0),
    netBookValue: active.reduce((s, a) => s + a.netBookValue, 0),
  };
  for (const [label, value] of Object.entries(totals)) cents(value, `Register ${label}`);
  const balances =
    (
      await db
        .prepare(
          `WITH mapped AS (
 SELECT DISTINCT cost_account_id account_id,fund_id,'cost' kind FROM accounting_fixed_assets WHERE acquisition_date<=?
 UNION SELECT DISTINCT accumulated_account_id,fund_id,'accumulated' FROM accounting_fixed_assets WHERE acquisition_date<=? AND accumulated_account_id IS NOT NULL)
 SELECT mapped.kind,COALESCE(SUM(CASE WHEN e.id IS NOT NULL THEN l.debit_amount-l.credit_amount ELSE 0 END),0) amount
 FROM mapped LEFT JOIN accounting_journal_lines l ON l.account_id=mapped.account_id AND l.fund_id=mapped.fund_id
 LEFT JOIN accounting_journal_entries e ON e.id=l.journal_entry_id AND e.status IN ('posted','reversed') AND e.posting_date<=?
 GROUP BY mapped.kind`
        )
        .bind(asOf, asOf, asOf)
        .all()
    ).results || [];
  const ledgerCost = balances.find((r) => r.kind === 'cost')?.amount || 0,
    ledgerAccumulated = -(balances.find((r) => r.kind === 'accumulated')?.amount || 0);
  const reconciliation = {
    ledgerCost,
    ledgerAccumulated,
    costDifference: ledgerCost - totals.cost,
    accumulatedDifference: ledgerAccumulated - totals.accumulated,
    balanced: ledgerCost === totals.cost && ledgerAccumulated === totals.accumulated,
  };
  return {
    asOf,
    rows,
    totals,
    reconciliation,
    policy:
      'Monthly straight-line; full in-service and disposal months. Scheduled values are estimates until explicitly posted.',
  };
}
async function updateAssetMetadata(db, actor, id, input) {
  permitted(actor, 'accounting.configure');
  const a = await getAsset(db, actor, id);
  if (input.expectedVersion !== a.version) throw new ValidationError('Asset changed. Reload before saving.');
  const location = text(input.location, 'Location'),
    serial = text(input.serialNumber, 'Serial number'),
    notes = text(input.notes, 'Notes', 4e3),
    insurance = cents(input.insuranceValue, 'Insurance value');
  await db.batch([
    db
      .prepare(
        'UPDATE accounting_fixed_assets SET version=CASE WHEN version=? THEN version+1 ELSE NULL END,location=?,serial_number=?,insurance_value=?,notes=? WHERE id=?'
      )
      .bind(a.version, location, serial, insurance, notes, id),
    db
      .prepare('INSERT INTO accounting_asset_audit(id,asset_id,action,actor_id,detail) VALUES(?,?,?,?,?)')
      .bind(
        crypto.randomUUID(),
        id,
        'metadata_updated',
        actor.id,
        JSON.stringify({ location, serial, insurance, notes })
      ),
  ]);
  return getAsset(db, actor, id);
}
export {
  acquisitionLines,
  assetAccount,
  assetDetail,
  assetRegister,
  getAsset,
  hash,
  permitted,
  registerAsset,
  text,
  updateAssetMetadata,
};
