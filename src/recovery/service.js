import { portabilityBudget, portabilityBudgetUsage, recoveryBudget } from '../portability/budget.js';
import { retainFinancialEvidence } from './retention.js';
import { syncConfigurationMirrors } from './configuration.js';
import { sha256 } from '../portability/archive.js';
import {
  query,
  rows,
  fail,
  requireRecovery,
  publicSnapshot,
  booksFor,
  writePart,
  readPart,
  captureDatabase,
  TTL,
} from './storage.js';
import { freeze, assertFrozen, unfreeze } from './locks.js';
import { captureFiles, validateFiles, applyFiles } from './files.js';
import { planDatabase, applyDatabase, validateLedger } from './database.js';

export const DISCLOSURE =
  'Restore replaces parish-owned records with a dated snapshot. Access credentials, subscription/billing, shared identities, audit history, and external provider records stay current. Payments are never refunded or repeated by restore. Recovery is blocked when payment/source activity, shared references, or database structure changed. Writes pause during snapshot creation and restoration. A verified safety copy is saved before restore. Restore points expire after seven days; downloaded export ZIPs cannot be imported as restore points.';
const idPattern = /^[a-f0-9-]{36}$/;
const publicOp = (o) =>
  o
    ? {
        id: o.id,
        scope: o.scope,
        kind: o.kind,
        status: o.status,
        phase: o.phase,
        targetId: o.target_id,
        safetyId: o.safety_id,
        rollingBack: !!o.rollback,
        errorCode: o.error_code,
        canCancel: ['freeze', 'central', 'books', 'files', 'publish', 'validate'].includes(o.phase),
      }
    : null;

export async function recoveryStatus(env, parishId, scope) {
  env = portabilityBudget(env);
  if (!['parish', 'accounting'].includes(scope)) fail('invalid_scope', 'Choose parish or accounting recovery.');
  const disclosure =
    scope === 'accounting'
      ? DISCLOSURE.replace('parish-owned records', 'accounting records and attachments only')
      : DISCLOSURE;
  const enabled = env.PARISH_RECOVERY_ENABLED === 'true';
  if (!enabled)
    return {
      enabled: false,
      snapshots: [],
      operation: null,
      disclosure,
    };
  await requireRecovery(env, parishId);
  const snapshots = await rows(
    env.AGAPAY_DB,
    "SELECT * FROM parish_recovery_snapshots WHERE parish_id=? AND scope=? AND status='ready' AND expires_at>? ORDER BY created_at DESC LIMIT 10",
    parishId,
    scope,
    Date.now()
  );
  const operation = await query(
    env.AGAPAY_DB,
    "SELECT * FROM parish_recovery_operations WHERE parish_id=? AND status IN ('running','paused') ORDER BY created_at DESC LIMIT 1",
    parishId
  ).first();
  return {
    enabled: true,
    snapshots: snapshots.map(publicSnapshot),
    operation: publicOp(operation),
    disclosure,
  };
}

async function snapshot(env, parishId, id, scope, pinned = false) {
  if (!idPattern.test(id || '')) fail('snapshot_not_found', 'Select an available restore point.');
  const s = await query(
    env.AGAPAY_DB,
    "SELECT * FROM parish_recovery_snapshots WHERE id=? AND parish_id=? AND scope=? AND status='ready' AND expires_at>?",
    id,
    parishId,
    scope,
    pinned ? 0 : Date.now()
  ).first();
  if (!s) fail('snapshot_not_found', 'The selected restore point is unavailable or expired.');
  return s;
}

export async function startRecovery(env, parishId, actorHash, body) {
  env = portabilityBudget(env);
  await requireRecovery(env, parishId);
  const { scope, kind, requestKey } = body;
  if (
    !['parish', 'accounting'].includes(scope) ||
    !['backup', 'restore'].includes(kind) ||
    !/^[\w-]{16,100}$/.test(requestKey || '')
  )
    fail('invalid_request', 'A scope and unique request key are required.');
  if (kind === 'backup' && body.snapshotId)
    fail('invalid_request', 'A new backup cannot target another restore point.');
  const prior = await query(
    env.AGAPAY_DB,
    'SELECT * FROM parish_recovery_operations WHERE parish_id=? AND request_key=?',
    parishId,
    requestKey
  ).first();
  if (prior) {
    if (
      prior.scope !== scope ||
      prior.kind !== kind ||
      prior.actor_hash !== actorHash ||
      prior.target_id !== (body.snapshotId || null)
    )
      fail('request_conflict', 'This request key belongs to a different operation.');
    return publicOp(prior);
  }
  if (
    await query(
      env.AGAPAY_DB,
      "SELECT 1 FROM parish_recovery_operations WHERE parish_id=? AND status IN ('running','paused')",
      parishId
    ).first()
  )
    fail('recovery_busy', 'Finish or resume the active recovery operation first.');
  if (
    await query(
      env.AGAPAY_DB,
      "SELECT 1 FROM parish_portability_jobs WHERE parish_id=? AND status IN ('preparing','deleting')",
      parishId
    ).first()
  )
    fail('recovery_busy', 'Wait for the current parish export or closure operation to finish.');
  const recent = await query(
    env.AGAPAY_DB,
    'SELECT COUNT(*) n FROM parish_recovery_snapshots WHERE parish_id=? AND created_at>?',
    parishId,
    Date.now() - 86400000
  ).first();
  if (recent.n >= 20) fail('recovery_limit', 'The daily restore-point limit has been reached.');
  if (kind === 'restore') {
    if (body.confirmation !== `RESTORE ${scope.toUpperCase()}` || body.acknowledged !== true)
      fail('restore_confirmation_required', 'Review the dated restore point and type the confirmation phrase.');
    if (!env.PARISH_RETAINED_DATA)
      fail('recovery_retention_unavailable', 'Restricted financial recovery storage is not configured.');
    const target = await snapshot(env, parishId, body.snapshotId, scope);
    // Verify all components before creating a workspace lock.
    for (const part of ['central', 'books', 'files']) await readPart(env, target, part);
  }
  if (scope === 'accounting' && !(await booksFor(env, parishId)))
    fail('accounting_unavailable', 'Accounting is not activated for this parish.');
  const id = crypto.randomUUID(),
    safetyId = crypto.randomUUID(),
    at = Date.now();
  await env.AGAPAY_DB.batch([
    query(
      env.AGAPAY_DB,
      "INSERT INTO parish_recovery_snapshots(id,parish_id,scope,kind,status,created_at,expires_at,actor_hash) VALUES(?,?,?,?,'preparing',?,?,?)",
      safetyId,
      parishId,
      scope,
      kind === 'backup' ? 'manual' : 'safety',
      at,
      at + TTL,
      actorHash
    ),
    query(
      env.AGAPAY_DB,
      "INSERT INTO parish_recovery_operations(id,parish_id,scope,kind,status,phase,target_id,safety_id,actor_hash,request_key,created_at,updated_at) VALUES(?,?,?,?,'running','freeze',?,?,?,?,?,?)",
      id,
      parishId,
      scope,
      kind,
      body.snapshotId || null,
      safetyId,
      actorHash,
      requestKey,
      at,
      at
    ),
  ]);
  return publicOp(await query(env.AGAPAY_DB, 'SELECT * FROM parish_recovery_operations WHERE id=?', id).first());
}

async function savePart(env, op, name, value) {
  const part = await writePart(env, op.safety_id, name, value);
  const saved = await query(
    env.AGAPAY_DB,
    'SELECT manifest_json FROM parish_recovery_snapshots WHERE id=?',
    op.safety_id
  ).first();
  const manifest = JSON.parse(
    saved.manifest_json || JSON.stringify({ version: 1, parishId: op.parish_id, scope: op.scope, parts: [] })
  );
  manifest.parts = manifest.parts.filter((p) => p.part !== name).concat(part);
  const text = JSON.stringify(manifest);
  await query(
    env.AGAPAY_DB,
    'UPDATE parish_recovery_snapshots SET manifest_json=?,manifest_sha256=? WHERE id=?',
    text,
    await sha256(text),
    op.safety_id
  ).run();
}

async function validateAll(env, op, books, target, safety) {
  const central = await readPart(env, target, 'central'),
    bookData = await readPart(env, target, 'books'),
    files = await readPart(env, target, 'files');
  const currentFiles = await readPart(env, safety, 'files');
  for (const [db, kind, data] of [
    ...(op.scope === 'parish' ? [[env.AGAPAY_DB, 'central', central]] : []),
    [books, 'books', bookData],
  ]) {
    const before = portabilityBudgetUsage(env).operations;
    const plan = await planDatabase(db, kind, op.parish_id, data);
    const work = portabilityBudgetUsage(env).operations - before + (plan?.statementCount || 0);
    const mirrors = kind === 'central' ? 5 * (currentFiles.mirrors || []).length : 0;
    if (work + mirrors > 650)
      fail(
        'recovery_transaction_too_large',
        'This restore exceeds the per-step self-service limit. Contact support; no records or files have been replaced.'
      );
  }
  await validateFiles(env, op.parish_id, op.scope, files, currentFiles);
}

export async function advanceRecovery(env, parishId, id, action = 'advance') {
  env = portabilityBudget(env);
  await requireRecovery(env, parishId);
  if (!idPattern.test(id || '')) fail('recovery_not_found', 'Recovery operation not found.');
  let op = await query(
    env.AGAPAY_DB,
    'SELECT * FROM parish_recovery_operations WHERE id=? AND parish_id=?',
    id,
    parishId
  ).first();
  if (!op) fail('recovery_not_found', 'Recovery operation not found.');
  if (['completed', 'cancelled'].includes(op.status)) return publicOp(op);
  const token = crypto.randomUUID();
  const held = await query(
    env.AGAPAY_DB,
    "UPDATE parish_recovery_operations SET lease_token=?,lease_until=? WHERE id=? AND lease_until<? AND status IN ('running','paused')",
    token,
    Date.now() + 600000,
    id,
    Date.now()
  ).run();
  if (held.meta.changes !== 1) fail('recovery_busy', 'A recovery step is still running. Retry shortly.');
  // Another invocation may have finished a checkpoint between our initial read
  // and acquiring the lease. Never execute a stale cancellation or phase.
  op = await query(env.AGAPAY_DB, 'SELECT * FROM parish_recovery_operations WHERE id=?', id).first();
  const next = async (phase) => {
    await query(
      env.AGAPAY_DB,
      "UPDATE parish_recovery_operations SET phase=?,status='running',error_code=NULL,updated_at=? WHERE id=? AND lease_token=?",
      phase,
      Date.now(),
      id,
      token
    ).run();
  };
  try {
    const books = await booksFor(env, parishId);
    if (action === 'rollback') {
      if (op.kind !== 'restore' || publicOp(op).canCancel || op.phase === 'unlock')
        fail(
          'rollback_not_available',
          'Use cancellation before replacement or select the safety copy after completion.'
        );
      await assertFrozen(env, op, books);
      await snapshot(env, parishId, op.safety_id, op.scope, true);
      await query(
        env.AGAPAY_DB,
        "UPDATE parish_recovery_operations SET rollback=1,phase='restore_files',status='running',error_code=NULL,updated_at=? WHERE id=?",
        Date.now(),
        id
      ).run();
    } else if (action === 'cancel') {
      if (!publicOp(op).canCancel)
        fail(
          'restore_already_started',
          'Replacement has started. Resume recovery; cancellation would leave inconsistent records.'
        );
      if (op.phase !== 'freeze') await unfreeze(env, op, books);
      else {
        // A freeze may have succeeded before its checkpoint was saved.
        const locked = await query(
          env.AGAPAY_DB,
          'SELECT 1 FROM parish_recovery_locks WHERE operation_id=?',
          id
        ).first();
        if (locked) await unfreeze(env, op, books);
      }
      await query(
        env.AGAPAY_DB,
        "UPDATE parish_recovery_operations SET status='cancelled',updated_at=? WHERE id=?",
        Date.now(),
        id
      ).run();
    } else if (op.phase === 'freeze') {
      await freeze(env, op, books);
      await query(
        env.AGAPAY_DB,
        'UPDATE parish_recovery_snapshots SET created_at=? WHERE id=?',
        Date.now(),
        op.safety_id
      ).run();
      await next('central');
    } else if (op.phase === 'unlock') {
      await unfreeze(env, op, books);
      await query(
        env.AGAPAY_DB,
        "UPDATE parish_recovery_operations SET status='completed',updated_at=? WHERE id=?",
        Date.now(),
        id
      ).run();
    } else {
      await assertFrozen(env, op, books);
      if (op.phase === 'central') {
        await savePart(
          env,
          op,
          'central',
          op.scope === 'parish' ? await captureDatabase(env.AGAPAY_DB, 'central', parishId) : null
        );
        await next('books');
      } else if (op.phase === 'books') {
        const data = await captureDatabase(books, 'books', parishId);
        validateLedger(data);
        await savePart(env, op, 'books', data);
        await next('files');
      } else if (op.phase === 'files') {
        await savePart(env, op, 'files', await captureFiles(env, parishId, op.scope));
        await next('publish');
      } else if (op.phase === 'publish') {
        const s = await query(
          env.AGAPAY_DB,
          'SELECT * FROM parish_recovery_snapshots WHERE id=?',
          op.safety_id
        ).first();
        for (const part of ['central', 'books', 'files']) await readPart(env, s, part);
        await query(
          env.AGAPAY_DB,
          "UPDATE parish_recovery_snapshots SET status='ready',verified_at=? WHERE id=?",
          Date.now(),
          op.safety_id
        ).run();
        await next(op.kind === 'backup' ? 'unlock' : 'validate');
      } else {
        const target = await snapshot(env, parishId, op.rollback ? op.safety_id : op.target_id, op.scope, true),
          safety = await snapshot(env, parishId, op.safety_id, op.scope, true);
        if (op.phase === 'validate') {
          await validateAll(env, op, books, target, safety);
          await retainFinancialEvidence(env, op, safety);
          await next('restore_files');
        } else if (op.phase === 'restore_files') {
          let current = await readPart(env, safety, 'files');
          if (op.rollback) {
            const original = await snapshot(env, parishId, op.target_id, op.scope, true),
              prior = await readPart(env, original, 'files');
            current = { files: [...current.files, ...prior.files], legacy: [...current.legacy, ...prior.legacy] };
          }
          await applyFiles(env, op, await readPart(env, target, 'files'), current);
          await next('restore_books');
        } else if (op.phase === 'restore_books') {
          const data = await readPart(env, target, 'books');
          await applyDatabase(books, 'books', op, data, await planDatabase(books, 'books', parishId, data));
          await next(op.scope === 'parish' ? 'restore_central' : 'verify');
        } else if (op.phase === 'restore_central') {
          const data = await readPart(env, target, 'central');
          await applyDatabase(
            env.AGAPAY_DB,
            'central',
            op,
            data,
            await planDatabase(env.AGAPAY_DB, 'central', parishId, data)
          );
          await syncConfigurationMirrors(env, parishId, (await readPart(env, safety, 'files')).mirrors);
          await next('verify');
        } else if (op.phase === 'verify') {
          for (const [part, db] of [
            ['central', op.scope === 'parish' ? env.AGAPAY_DB : null],
            ['books', books],
          ]) {
            const data = await readPart(env, target, part),
              plan = await planDatabase(db, part, parishId, data);
            if (plan?.changes.length)
              fail(
                'recovery_verification_failed',
                'The restored records do not match the selected snapshot. The workspace remains locked.'
              );
          }
          const wanted = await readPart(env, target, 'files'),
            actual = await captureFiles(env, parishId, op.scope);
          const fingerprints = (value) =>
            JSON.stringify({
              files: value.files.map((f) => [f.binding, f.key, f.hash]).sort(),
              legacy: value.legacy.map((r) => [r.key, r.hash]).sort(),
            });
          if (fingerprints(wanted) !== fingerprints(actual))
            fail('recovery_verification_failed', 'File or legacy verification has not completed. Resume shortly.');
          await next('unlock');
        } else fail('recovery_phase_unknown', 'The recovery checkpoint requires operator review.');
      }
    }
  } catch (error) {
    const reset = recoveryBudget(env);
    try {
      await query(
        env.AGAPAY_DB,
        "UPDATE parish_recovery_operations SET status='paused',error_code=?,updated_at=? WHERE id=?",
        error.code || 'recovery_step_failed',
        Date.now(),
        id
      ).run();
    } finally {
      reset();
    }
    throw error;
  } finally {
    const reset = recoveryBudget(env);
    try {
      await query(
        env.AGAPAY_DB,
        'UPDATE parish_recovery_operations SET lease_until=0,lease_token=NULL WHERE id=? AND lease_token=?',
        id,
        token
      ).run();
    } finally {
      reset();
    }
  }
  op = await query(env.AGAPAY_DB, 'SELECT * FROM parish_recovery_operations WHERE id=?', id).first();
  return publicOp(op);
}
