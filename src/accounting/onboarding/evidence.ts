import type { PortabilityDatabase } from '../../portability/contracts.js';
import type { LedgerServiceActor } from '../ledger/service.js';
import { ValidationError, CapabilityDeniedError } from '../errors.js';
export interface OnboardingReview {
  task_id: string;
  choice: string;
  note: string;
  evidence_hash: string;
  version: number;
  reviewed_by: string;
  reviewed_at: string;
}
export const onboardingChoices: Record<string, readonly string[]> = {
  fiscal: ['reviewed'],
  accounts: ['reviewed'],
  funds: ['reviewed'],
  records: ['importing', 'new_books', 'existing_books'],
  assets: ['reviewed', 'none', 'deferred'],
};
export function onboardingAccess(actor: LedgerServiceActor, manage = false) {
  if (!actor?.id || !actor.capabilities.includes(manage ? 'accounting.configure' : 'accounting.view'))
    throw new CapabilityDeniedError();
}
export async function onboardingEvidence(db: PortabilityDatabase) {
  const queries: Record<string, string> = {
    fiscal: 'SELECT id,start_date,end_date,is_current FROM accounting_fiscal_years ORDER BY id',
    accounts:
      'SELECT id,account_number,name,is_active,normal_balance,parent_account_id FROM accounting_accounts ORDER BY id',
    funds:
      'SELECT id,code,name,is_active,restriction_type,giving_source_type,giving_source_id FROM accounting_funds ORDER BY id',
    records: 'SELECT id,status,effective_date FROM accounting_opening_balance_batches ORDER BY id',
    assets: 'SELECT id,version,status,cost,opening_depreciation FROM accounting_fixed_assets ORDER BY id',
  };
  const result: Record<string, string> = {};
  for (const [key, sql] of Object.entries(queries)) {
    const rows = (await db.prepare(sql).all()).results || [];
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(rows)));
    result[key] = Array.from(new Uint8Array(digest), (v) => v.toString(16).padStart(2, '0')).join('');
  }
  return result;
}
export async function onboardingReviews(db: PortabilityDatabase) {
  return (
    (await db.prepare('SELECT * FROM accounting_onboarding_reviews ORDER BY task_id').all<OnboardingReview>())
      .results || []
  );
}
export async function saveOnboardingReview(
  db: PortabilityDatabase,
  actor: LedgerServiceActor,
  taskId: string,
  input: { choice: string; note: string; expectedVersion: number; evidenceHash: string }
) {
  onboardingAccess(actor, true);
  if (!onboardingChoices[taskId]?.includes(input.choice))
    throw new ValidationError('Choose a supported review decision.');
  const note = String(input.note || '').trim();
  if (!note || note.length > 1200) throw new ValidationError('Explain the review or decision in 1–1,200 characters.');
  const evidence = await onboardingEvidence(db);
  if (input.evidenceHash !== evidence[taskId])
    throw new ValidationError('The underlying records changed. Reload and review the latest details.');
  const prior = await db
    .prepare('SELECT version FROM accounting_onboarding_reviews WHERE task_id=?')
    .bind(taskId)
    .first<{ version: number }>();
  if ((prior?.version || 0) !== input.expectedVersion)
    throw new ValidationError('Another operator updated this review. Reload before saving.');
  await db.batch([
    prior
      ? db
          .prepare(
            "UPDATE accounting_onboarding_reviews SET choice=?,note=?,evidence_hash=?,version=CASE WHEN version=? THEN version+1 ELSE NULL END,reviewed_by=?,reviewed_at=datetime('now') WHERE task_id=?"
          )
          .bind(input.choice, note, input.evidenceHash, prior.version, actor.id, taskId)
      : db
          .prepare(
            'INSERT INTO accounting_onboarding_reviews(task_id,choice,note,evidence_hash,reviewed_by) VALUES(?,?,?,?,?)'
          )
          .bind(taskId, input.choice, note, input.evidenceHash, actor.id),
    db
      .prepare(
        'INSERT INTO accounting_onboarding_audit(id,task_id,choice,note,evidence_hash,actor_id) VALUES(?,?,?,?,?,?)'
      )
      .bind(crypto.randomUUID(), taskId, input.choice, note, input.evidenceHash, actor.id),
  ]);
  return db
    .prepare('SELECT * FROM accounting_onboarding_reviews WHERE task_id=?')
    .bind(taskId)
    .first<OnboardingReview>();
}
