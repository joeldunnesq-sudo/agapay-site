// Generated from src/accounting/assets/posting.ts by npm run build:server. Do not edit.
import { createJournalDraft, postJournalEntry } from '../ledger/service.js';
import { ValidationError } from '../errors.js';
import { accumulatedAt, cents, date, monthEnd } from './schedule.js';
import { assetAccount, getAsset, hash, permitted, text } from './service.js';
async function previewAssetOperation(db, actor, id, kind, input) {
  permitted(actor);
  const asset = await getAsset(db, actor, id),
    through = date(input.throughDate);
  if (asset.status !== 'active') throw new ValidationError('Asset is already disposed.');
  if (input.expectedVersion !== asset.version) throw new ValidationError('Asset changed. Reload and preview again.');
  if (through < asset.in_service_date) throw new ValidationError('Posting date must be on or after in-service date.');
  if (kind === 'depreciation' && monthEnd(through) !== through)
    throw new ValidationError('Choose a month-end date for depreciation.');
  const existing = await db
    .prepare(
      'SELECT COALESCE(SUM(depreciation),0) amount,MAX(through_date) latest FROM accounting_asset_movements WHERE asset_id=?'
    )
    .bind(id)
    .first();
  if (existing?.latest && through < existing.latest)
    throw new ValidationError('Date precedes an existing asset posting.');
  const target = accumulatedAt(asset, through),
    depreciation = target - (existing?.amount || 0);
  if (depreciation < 0) throw new ValidationError('Depreciation is inconsistent. Review the asset ledger.');
  const lines = [];
  const line = (accountId, debitAmount, creditAmount, description) => {
    if (debitAmount || creditAmount) {
      if (!accountId) throw new ValidationError('An asset posting account is missing.');
      lines.push({ accountId, fundId: asset.fund_id, debitAmount, creditAmount, description });
    }
  };
  line(asset.expense_account_id, depreciation, 0, 'Depreciation');
  line(asset.accumulated_account_id, 0, depreciation, 'Accumulated depreciation');
  let proceeds = 0,
    gainLoss = 0;
  if (kind === 'disposal') {
    proceeds = cents(input.proceeds ?? 0, 'Disposal proceeds');
    gainLoss = proceeds - (asset.cost - target);
    if (proceeds) {
      const cash = await assetAccount(db, String(input.cashAccountId || ''), 'asset', 'debit');
      if (Number(cash.account_number) < 1e3 || Number(cash.account_number) >= 1100)
        throw new ValidationError('Choose a cash/bank account numbered 1000–1099.');
      line(input.cashAccountId, proceeds, 0, 'Disposal proceeds');
    }
    line(asset.accumulated_account_id, target, 0, 'Remove accumulated depreciation');
    line(asset.cost_account_id, 0, asset.cost, 'Remove asset cost');
    if (gainLoss > 0) {
      await assetAccount(db, String(input.gainAccountId || ''), 'revenue', 'credit');
      line(input.gainAccountId, 0, gainLoss, 'Gain on disposal');
    }
    if (gainLoss < 0) {
      await assetAccount(db, String(input.lossAccountId || ''), 'expense', 'debit');
      line(input.lossAccountId, -gainLoss, 0, 'Loss on disposal');
    }
  } else if (!depreciation) throw new ValidationError('No depreciation is due through this date.');
  return {
    asset,
    kind,
    throughDate: through,
    depreciation,
    accumulated: target,
    netBookValue: kind === 'disposal' ? 0 : asset.cost - target,
    proceeds,
    gainLoss,
    lines,
  };
}
async function postAssetOperation(db, actor, id, kind, input) {
  permitted(actor, 'accounting.configure');
  permitted(actor, 'accounting.journals.create');
  permitted(actor, 'accounting.journals.post');
  const key = text(input.operationKey, 'Operation key', 100, true);
  const requestHash = await hash({
    id,
    kind,
    input: {
      expectedVersion: input.expectedVersion,
      throughDate: input.throughDate,
      proceeds: input.proceeds ?? 0,
      cashAccountId: input.cashAccountId || '',
      gainAccountId: input.gainAccountId || '',
      lossAccountId: input.lossAccountId || '',
    },
  });
  const prior = await db
    .prepare('SELECT journal_id,request_hash FROM accounting_asset_movements WHERE operation_key=?')
    .bind(key)
    .first();
  if (prior) {
    if (prior.request_hash !== requestHash) throw new ValidationError('Operation key was used with different details.');
    return { journalId: prior.journal_id, replayed: true };
  }
  const preview = await previewAssetOperation(db, actor, id, kind, input);
  const sourceId = `${id}:${(await hash({ key, requestHash })).slice(0, 40)}`;
  const existingDraft = await db
    .prepare('SELECT id,version,status FROM accounting_journal_entries WHERE source_type=? AND source_id=?')
    .bind(`asset_${kind}`, sourceId)
    .first();
  if (existingDraft) {
    const saved =
      (
        await db
          .prepare(
            'SELECT account_id,fund_id,debit_amount,credit_amount,description FROM accounting_journal_lines WHERE journal_entry_id=? ORDER BY line_number'
          )
          .bind(existingDraft.id)
          .all()
      ).results || [];
    const expected = preview.lines.map((l) => ({
      account_id: l.accountId,
      fund_id: l.fundId,
      debit_amount: l.debitAmount,
      credit_amount: l.creditAmount,
      description: l.description,
    }));
    if (existingDraft.status !== 'draft' || JSON.stringify(saved) !== JSON.stringify(expected))
      throw new ValidationError('The prepared asset draft changed. Review it and start a new asset preview.');
  }
  const journal =
    existingDraft ||
    (await createJournalDraft(db, {
      actor,
      entryDate: preview.throughDate,
      description: `${kind === 'disposal' ? 'Dispose' : 'Depreciate'} ${preview.asset.tag} · ${preview.asset.name}`,
      sourceType: `asset_${kind}`,
      sourceId,
      lines: preview.lines,
    }));
  await postJournalEntry(db, {
    actor,
    journalEntryId: journal.id,
    idempotencyKey: `asset:${key}`,
    requestHash,
    expectedVersion: journal.version,
    additionalStatements: [
      db
        .prepare(
          `UPDATE accounting_fixed_assets SET version=CASE WHEN version=? AND status='active' THEN version+1 ELSE NULL END,
  status=?,disposal_date=? WHERE id=?`
        )
        .bind(
          preview.asset.version,
          kind === 'disposal' ? 'disposed' : 'active',
          kind === 'disposal' ? preview.throughDate : null,
          id
        ),
      db
        .prepare(
          `INSERT INTO accounting_asset_movements(id,asset_id,kind,through_date,depreciation,accumulated,proceeds,gain_loss,journal_id,operation_key,request_hash,created_by)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`
        )
        .bind(
          crypto.randomUUID(),
          id,
          kind,
          preview.throughDate,
          preview.depreciation,
          preview.accumulated,
          preview.proceeds,
          preview.gainLoss,
          journal.id,
          key,
          requestHash,
          actor.id
        ),
      db.prepare('INSERT INTO accounting_asset_audit(id,asset_id,action,actor_id,detail) VALUES(?,?,?,?,?)').bind(
        crypto.randomUUID(),
        id,
        kind,
        actor.id,
        JSON.stringify({
          journalId: journal.id,
          date: preview.throughDate,
          depreciation: preview.depreciation,
          proceeds: preview.proceeds,
          gainLoss: preview.gainLoss,
        })
      ),
    ],
  });
  return { journalId: journal.id, replayed: false };
}
export { postAssetOperation, previewAssetOperation };
