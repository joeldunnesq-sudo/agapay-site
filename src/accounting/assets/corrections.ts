import type { PortabilityDatabase } from '../../portability/contracts.js';
import type { LedgerServiceActor } from '../ledger/service.js';
import { reverseJournalEntry, createJournalDraft } from '../ledger/service.js';
import { ValidationError } from '../errors.js';
import { date } from './schedule.js';
import { getAsset, hash, permitted, text } from './service.js';

interface Movement {
  id: string;
  kind: string;
  through_date: string;
  journal_id: string;
  depreciation: number;
  asset_version: number;
}
export interface AssetCorrectionInput {
  expectedVersion: number;
  movementId: string;
  entryDate: string;
  reason: string;
  operationKey: string;
}
export async function latestAssetMovement(db: PortabilityDatabase, id: string) {
  return db
    .prepare(
      `SELECT m.* FROM accounting_asset_movements m JOIN accounting_journal_entries e ON e.id=m.journal_id
 WHERE m.asset_id=? AND NOT EXISTS(SELECT 1 FROM accounting_asset_reversals r WHERE r.movement_id=m.id)
 ORDER BY m.asset_version DESC,m.through_date DESC,e.entry_number DESC LIMIT 1`
    )
    .bind(id)
    .first<Movement>();
}
async function chronologicalDate(db: PortabilityDatabase, id: string, entryDate: string, ledgerStart: string) {
  const through = date(entryDate);
  const last = await db
    .prepare(
      `SELECT MAX(day) latest FROM (SELECT through_date day FROM accounting_asset_movements WHERE asset_id=?
 UNION ALL SELECT r.entry_date FROM accounting_asset_reversals r JOIN accounting_asset_movements m ON m.id=r.movement_id WHERE m.asset_id=?)`
    )
    .bind(id, id)
    .first<{ latest: string | null }>();
  if (through < ledgerStart || (last?.latest && through < last.latest))
    throw new ValidationError(
      'A correction must be dated on or after the latest asset activity and ledger recognition.'
    );
  return through;
}
export async function previewAssetCorrection(
  db: PortabilityDatabase,
  actor: LedgerServiceActor,
  id: string,
  input: AssetCorrectionInput
) {
  permitted(actor);
  const asset = await getAsset(db, actor, id),
    latest = await latestAssetMovement(db, id);
  if (asset.status === 'cancelled' || asset.version !== input.expectedVersion)
    throw new ValidationError('Reload the asset before correcting it.');
  if (!latest || latest.id !== input.movementId)
    throw new ValidationError('Correct the latest unreversed asset posting first.');
  const entryDate = await chronologicalDate(db, id, input.entryDate, asset.ledger_start_date || asset.acquisition_date),
    reason = text(input.reason, 'Correction reason', 1600, true);
  const lines =
    (
      await db
        .prepare(
          `SELECT account_id accountId,fund_id fundId,description,debit_amount creditAmount,credit_amount debitAmount
 FROM accounting_journal_lines WHERE journal_entry_id=? ORDER BY line_number`
        )
        .bind(latest.journal_id)
        .all<{
          accountId: string;
          fundId: string;
          description: string | null;
          debitAmount: number;
          creditAmount: number;
        }>()
    ).results || [];
  return {
    asset,
    movement: latest,
    entryDate,
    reason,
    lines,
    statusAfter: 'active',
    depreciationReversed: latest.depreciation,
  };
}
export async function correctAssetPosting(
  db: PortabilityDatabase,
  actor: LedgerServiceActor,
  id: string,
  input: AssetCorrectionInput
) {
  permitted(actor, 'accounting.configure');
  permitted(actor, 'accounting.journals.reverse');
  permitted(actor, 'accounting.journals.create');
  permitted(actor, 'accounting.journals.post');
  const operationKey = text(input.operationKey, 'Operation key', 100, true),
    requestHash = await hash({ id, ...input, operationKey });
  const prior = await db
    .prepare('SELECT reversal_journal_id,request_hash FROM accounting_asset_reversals WHERE operation_key=?')
    .bind(operationKey)
    .first<{ reversal_journal_id: string; request_hash: string }>();
  if (prior) {
    if (prior.request_hash !== requestHash)
      throw new ValidationError('Correction key was used with different details.');
    return { journalId: prior.reversal_journal_id, replayed: true };
  }
  const preview = await previewAssetCorrection(db, actor, id, input);
  const draft = await db
    .prepare(
      "SELECT id FROM accounting_journal_entries WHERE source_type='reversal' AND source_id=? AND status='draft'"
    )
    .bind(preview.movement.journal_id)
    .first<{ id: string }>();
  if (draft) {
    const lines =
      (
        await db
          .prepare(
            'SELECT account_id accountId,fund_id fundId,description,debit_amount debitAmount,credit_amount creditAmount FROM accounting_journal_lines WHERE journal_entry_id=? ORDER BY line_number'
          )
          .bind(draft.id)
          .all()
      ).results || [];
    if (
      lines.length !== preview.lines.length ||
      lines.some((line, i) => Object.entries(preview.lines[i]).some(([key, value]) => line[key] !== value))
    )
      throw new ValidationError(
        'The prepared reversal draft changed. Review and void it before starting a new correction.'
      );
  }
  // Reserve the reversal draft first, so its ID can be stored by the same batch.
  // reverseJournalEntry reuses only this exact, verified draft on retries.
  const reversal =
    draft ||
    (await createJournalDraft(db, {
      actor,
      entryDate: preview.entryDate,
      description: `Reversal: asset ${preview.asset.tag}`,
      sourceType: 'reversal',
      sourceId: preview.movement.journal_id,
      lines: preview.lines,
    }));
  const result = await reverseJournalEntry(db, {
    actor,
    journalEntryId: preview.movement.journal_id,
    entryDate: preview.entryDate,
    reason: preview.reason,
    idempotencyKey: `asset-correction:${operationKey}`,
    requestHash,
    preFinalizationStatements: [
      db
        .prepare(
          'INSERT INTO accounting_asset_correction_guards(journal_id,asset_id,expected_version,operation_key) VALUES(?,?,?,?)'
        )
        .bind(preview.movement.journal_id, id, preview.asset.version, operationKey),
    ],
    additionalStatements: [
      db
        .prepare(
          "UPDATE accounting_fixed_assets SET version=CASE WHEN version=? THEN version+1 ELSE NULL END,status='active',disposal_date=NULL WHERE id=?"
        )
        .bind(preview.asset.version, id),
      db
        .prepare(
          'INSERT INTO accounting_asset_reversals(id,movement_id,reversal_journal_id,entry_date,reason,operation_key,request_hash,actor_id) VALUES(?,?,?,?,?,?,?,?)'
        )
        .bind(
          crypto.randomUUID(),
          preview.movement.id,
          reversal.id,
          preview.entryDate,
          preview.reason,
          operationKey,
          requestHash,
          actor.id
        ),
      db
        .prepare('INSERT INTO accounting_asset_audit(id,asset_id,action,actor_id,detail) VALUES(?,?,?,?,?)')
        .bind(
          crypto.randomUUID(),
          id,
          'posting_corrected',
          actor.id,
          JSON.stringify({
            movementId: preview.movement.id,
            journalId: reversal.id,
            date: preview.entryDate,
            reason: preview.reason,
          })
        ),
      db.prepare('DELETE FROM accounting_asset_correction_guards WHERE journal_id=?').bind(preview.movement.journal_id),
    ],
  });
  return { journalId: result!.id, replayed: false };
}
export async function cancelAssetRegistration(
  db: PortabilityDatabase,
  actor: LedgerServiceActor,
  id: string,
  input: Omit<AssetCorrectionInput, 'movementId'>
) {
  permitted(actor, 'accounting.configure');
  const operationKey = text(input.operationKey, 'Operation key', 100, true),
    reason = text(input.reason, 'Cancellation reason', 1600, true),
    entryDate = date(input.entryDate);
  const requestHash = await hash({ id, operationKey, reason, entryDate, expectedVersion: input.expectedVersion });
  const prior = await db
    .prepare('SELECT request_hash FROM accounting_asset_cancellations WHERE asset_id=? OR operation_key=?')
    .bind(id, operationKey)
    .first<{ request_hash: string }>();
  if (prior) {
    if (prior.request_hash !== requestHash)
      throw new ValidationError('Registration was already cancelled with different details.');
    return { cancelled: true, replayed: true };
  }
  const asset = await getAsset(db, actor, id);
  if (asset.version !== input.expectedVersion)
    throw new ValidationError('Reload the asset before cancelling its registration.');
  if (await latestAssetMovement(db, id))
    throw new ValidationError('Reverse the asset postings, latest first, before cancelling this registration.');
  await chronologicalDate(db, id, entryDate, asset.ledger_start_date || asset.acquisition_date);
  await db.batch([
    db
      .prepare('UPDATE accounting_fixed_assets SET version=CASE WHEN version=? THEN version+1 ELSE NULL END WHERE id=?')
      .bind(asset.version, id),
    db
      .prepare(
        'INSERT INTO accounting_asset_cancellations(asset_id,entry_date,reason,operation_key,request_hash,actor_id) VALUES(?,?,?,?,?,?)'
      )
      .bind(id, entryDate, reason, operationKey, requestHash, actor.id),
    db
      .prepare('INSERT INTO accounting_asset_audit(id,asset_id,action,actor_id,detail) VALUES(?,?,?,?,?)')
      .bind(crypto.randomUUID(), id, 'registration_cancelled', actor.id, JSON.stringify({ date: entryDate, reason })),
  ]);
  return { cancelled: true, replayed: false };
}
