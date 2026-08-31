import { json, getBearerToken, resolveParishDashboardSession, rateLimit } from '../lib/core.js';
import { findRegistrationByParishId } from './parish.js';
import { givingFeatureAccess } from '../lib/entitlements.js';
import { subscriptionEntitlementActive } from '../lib/subscriptions.js';
import {
  OutsideGiftError,
  outsideGiftInput,
  outsideDigest,
  outsideContent,
  outsideGiver,
  outsideGiftRow,
  outsideGiftDto,
  loadOutsideGiftRows,
  auditStatement,
} from '../lib/outside-gifts.js';
import { validateOutsidePledge } from '../lib/outside-pledges.js';
import { outsideAccountingAction } from './outside-gift-accounting.js';

const reply = (body, status = 200) =>
  json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store', Vary: 'Authorization', 'X-Robots-Tag': 'noindex, nofollow' },
  });
async function bodyJson(request) {
  if (!request.headers.get('Content-Type')?.includes('application/json'))
    throw new OutsideGiftError('Send a JSON request.', 415);
  const reader = request.body?.getReader();
  if (!reader) throw new OutsideGiftError('A request body is required.');
  let text = '',
    length = 0;
  const decoder = new TextDecoder();
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    length += chunk.value.byteLength;
    if (length > 16384) {
      await reader.cancel();
      throw new OutsideGiftError('This request is too large.', 413);
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
  try {
    const body = JSON.parse(text + decoder.decode());
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw new OutsideGiftError('Invalid JSON request.');
  }
}
async function createGift(db, registration, actor, body) {
  const parishId = registration.parishId;
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(body.requestKey || ''))
    throw new OutsideGiftError('A unique save request is required. Reload the form.');
  if (body.confirmedNotDuplicate !== true)
    throw new OutsideGiftError('Confirm this gift is not already recorded, including in an aggregate collection.');
  const input = outsideGiftInput(body, registration);
  const giver = await outsideGiver(db, parishId, input.giverReferenceId);
  await validateOutsidePledge(db, parishId, input, giver);
  const { fundName: _fundName, ...identity } = input;
  const hash = await outsideDigest(JSON.stringify(identity));
  const contentHash = await outsideDigest(outsideContent(input));
  const existing = await db
    .prepare('SELECT gift_id,request_hash FROM outside_gift_details WHERE parish_id=? AND request_key=?')
    .bind(parishId, body.requestKey)
    .first();
  if (existing) {
    if (existing.request_hash !== hash)
      throw new OutsideGiftError('That save request was already used for different details.', 409);
    return { row: await outsideGiftRow(db, parishId, existing.gift_id), replayed: true };
  }
  const duplicateReason = String(body.duplicateReason || '')
    .trim()
    .slice(0, 500);
  const duplicates = await db
    .prepare(
      `SELECT m.id FROM manual_income_entries m JOIN outside_gift_details d ON d.gift_id=m.id WHERE d.parish_id=? AND d.record_state='active' AND d.content_hash=? LIMIT 1`
    )
    .bind(parishId, contentHash)
    .first();
  if (duplicates && duplicateReason.length < 8)
    throw new OutsideGiftError(
      'An identical outside gift exists. If this is a separate gift, explain why before saving.',
      409,
      'outside_gift_duplicate'
    );
  const now = new Date().toISOString();
  const row = {
    id: 'outside_' + crypto.randomUUID(),
    parish_id: parishId,
    entry_date: input.entryDate,
    amount_cents: input.amountCents,
    source: input.source,
    source_label: input.sourceLabel,
    fund_code: input.fundName,
    batch_reference: input.reference,
    notes: input.notes,
    contribution_eligible: 1,
    entered_by: actor,
    created_at: now,
    updated_at: now,
    giver_reference_id: input.giverReferenceId || null,
    fund_id: input.fundId,
    revision: 1,
    record_state: 'active',
    updated_by: actor,
  };
  Object.assign(row, {
    giver_name: giver.name,
    giver_email: giver.email,
    giving_kind: input.givingKind,
    pledge_year: input.pledgeYear,
  });
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO manual_income_entries(id,parish_id,entry_date,source,source_label,amount_cents,fund_code,batch_reference,contribution_eligible,notes,entered_by,created_at,updated_at)
        SELECT ?,?,?,?,?,?,?,?,1,?,?,?,? WHERE ? OR NOT EXISTS(SELECT 1 FROM outside_gift_details WHERE parish_id=? AND record_state='active' AND content_hash=?)`
        )
        .bind(
          row.id,
          parishId,
          input.entryDate,
          input.source,
          input.sourceLabel,
          input.amountCents,
          input.fundName,
          input.reference,
          input.notes,
          actor,
          now,
          now,
          duplicateReason.length >= 8 ? 1 : 0,
          parishId,
          contentHash
        ),
      db
        .prepare(
          `INSERT INTO outside_gift_details(gift_id,parish_id,giver_reference_id,giver_name,giver_email,fund_id,request_key,request_hash,content_hash,duplicate_reason,updated_by,giving_kind,pledge_year) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`
        )
        .bind(
          row.id,
          parishId,
          row.giver_reference_id,
          giver.name,
          giver.email,
          row.fund_id,
          body.requestKey,
          hash,
          contentHash,
          duplicateReason,
          actor,
          input.givingKind,
          input.pledgeYear
        ),
      auditStatement(db, row, 'created', actor, duplicateReason, now),
    ]);
  } catch (error) {
    const concurrent = await db
      .prepare('SELECT gift_id,request_hash FROM outside_gift_details WHERE parish_id=? AND request_key=?')
      .bind(parishId, body.requestKey)
      .first();
    if (concurrent?.request_hash === hash)
      return { row: await outsideGiftRow(db, parishId, concurrent.gift_id), replayed: true };
    if (/constraint/i.test(error.message || ''))
      throw new OutsideGiftError(
        'Another save recorded this gift. Refresh before trying again.',
        409,
        'outside_gift_duplicate'
      );
    throw error;
  }
  return { row: await outsideGiftRow(db, parishId, row.id), replayed: false };
}

async function changeGift(db, registration, actor, id, action, body) {
  const row = await outsideGiftRow(db, registration.parishId, id);
  if (!row) throw new OutsideGiftError('Gift not found.', 404);
  const reason = String(body.reason || '')
    .trim()
    .slice(0, 500);
  if (reason.length < 8) throw new OutsideGiftError('Explain this correction or void (at least 8 characters).');
  if (row.revision !== body.revision || row.record_state !== 'active')
    throw new OutsideGiftError('This record changed. Refresh before editing.', 409);
  if (row.accounting_line_id)
    throw new OutsideGiftError(
      'Ask an authorized treasurer to unlink this gift from Accounting before correcting or voiding it. Unlinking does not reverse the ledger entry.',
      409
    );
  const input = action === 'void' ? null : outsideGiftInput(body, registration);
  const giver = input ? await outsideGiver(db, registration.parishId, input.giverReferenceId) : null;
  if (input) await validateOutsidePledge(db, registration.parishId, input, giver);
  const now = new Date().toISOString();
  const next = { ...row, revision: row.revision + 1, updated_by: actor, updated_at: now };
  if (input)
    Object.assign(next, {
      entry_date: input.entryDate,
      source: input.source,
      source_label: input.sourceLabel,
      amount_cents: input.amountCents,
      fund_code: input.fundName,
      fund_id: input.fundId,
      giver_reference_id: input.giverReferenceId || null,
      batch_reference: input.reference,
      notes: input.notes,
    });
  else Object.assign(next, { record_state: 'void', contribution_eligible: 0, void_reason: reason, voided_at: now });
  if (giver)
    Object.assign(next, {
      giver_name: giver.name,
      giver_email: giver.email,
      giving_kind: input.givingKind,
      pledge_year: input.pledgeYear,
    });
  const contentHash = input ? await outsideDigest(outsideContent(input)) : null;
  if (input) {
    const duplicate = await db
      .prepare(
        "SELECT gift_id FROM outside_gift_details WHERE parish_id=? AND gift_id<>? AND record_state='active' AND content_hash=? LIMIT 1"
      )
      .bind(registration.parishId, id, contentHash)
      .first();
    if (duplicate)
      throw new OutsideGiftError(
        'This correction matches another active gift. Review both records instead of creating a duplicate.',
        409
      );
  }
  const results = await db.batch([
    db
      .prepare(
        `UPDATE outside_gift_details SET giving_kind=?,pledge_year=?,giver_reference_id=?,giver_name=?,giver_email=?,fund_id=?,record_state=?,revision=?,updated_by=?,void_reason=?,voided_at=?,content_hash=COALESCE(?,content_hash) WHERE gift_id=? AND parish_id=? AND revision=? AND record_state='active' AND accounting_line_id IS NULL
        AND (? IS NULL OR NOT EXISTS(SELECT 1 FROM outside_gift_details other WHERE other.parish_id=? AND other.gift_id<>? AND other.record_state='active' AND other.content_hash=?))`
      )
      .bind(
        next.giving_kind,
        next.pledge_year,
        next.giver_reference_id,
        next.giver_name,
        next.giver_email,
        next.fund_id,
        next.record_state,
        next.revision,
        actor,
        next.void_reason || null,
        next.voided_at || null,
        contentHash,
        id,
        registration.parishId,
        row.revision,
        contentHash,
        registration.parishId,
        id,
        contentHash
      ),
    auditStatement(db, next, action === 'void' ? 'voided' : 'corrected', actor, reason, now),
    db
      .prepare(
        `UPDATE manual_income_entries SET entry_date=?,source=?,source_label=?,amount_cents=?,fund_code=?,batch_reference=?,notes=?,contribution_eligible=?,updated_at=? WHERE id=? AND parish_id=? AND EXISTS(SELECT 1 FROM outside_gift_audit WHERE gift_id=? AND revision=? AND created_at=?)`
      )
      .bind(
        next.entry_date,
        next.source,
        next.source_label,
        next.amount_cents,
        next.fund_code,
        next.batch_reference,
        next.notes,
        next.contribution_eligible,
        now,
        id,
        registration.parishId,
        id,
        next.revision,
        now
      ),
  ]);
  if (results[0].meta.changes !== 1) throw new OutsideGiftError('This record changed. Refresh before editing.', 409);
  return outsideGiftRow(db, registration.parishId, id);
}

export async function handleParishOutsideGifts(request, env, parishId, suffix = '') {
  if (!['GET', 'POST'].includes(request.method)) return reply({ error: 'Method not allowed.' }, 405);
  const limited = await rateLimit(request, env, 'outside-gifts', { limit: 60, windowSeconds: 300 });
  if (limited) return limited;
  try {
    const registration = (await findRegistrationByParishId(env, parishId))?.registration;
    const session = await resolveParishDashboardSession(registration, getBearerToken(request));
    if (!session) return reply({ error: 'Authentication required.' }, 401);
    if (!givingFeatureAccess(registration, 'givers') || !subscriptionEntitlementActive(registration))
      return reply({ error: 'An active giving plan is required.' }, 403);
    const db = env.AGAPAY_DB;
    if (!db?.batch) return reply({ error: 'Outside gifts require the contribution database.' }, 503);
    const [id, action, ...extra] = suffix.replace(/^\//, '').split('/').map(decodeURIComponent);
    if (extra.length) return reply({ error: 'Not found.' }, 404);
    const body = request.method === 'POST' ? await bodyJson(request) : null;
    if (request.method === 'GET' && id === 'givers' && !action) {
      const q = String(new URL(request.url).searchParams.get('q') || '')
        .trim()
        .slice(0, 100)
        .toLowerCase();
      const email =
        "lower(trim(COALESCE(NULLIF(json_extract(data,'$.email'),''),json_extract(data,'$.donorEmail'),'')))";
      const name =
        "lower(COALESCE(json_extract(data,'$.donorName'),'') || ' ' || COALESCE(json_extract(data,'$.firstName'),'') || ' ' || COALESCE(json_extract(data,'$.lastName'),''))";
      const result = await db
        .prepare(
          `SELECT id,data FROM donor_offerings WHERE parish_id=? AND (payment_status IN ('paid','succeeded') OR status IN ('paid','complete','completed')) AND (instr(${email},?)>0 OR instr(${name},?)>0) GROUP BY CASE WHEN ${email}<>'' THEN ${email} ELSE id END ORDER BY MAX(created_at) DESC LIMIT 101`
        )
        .bind(parishId, q, q)
        .all();
      const givers = result.results.slice(0, 100).map((row) => {
        const g = JSON.parse(row.data);
        return {
          referenceId: row.id,
          name: [g.firstName, g.lastName].filter(Boolean).join(' ') || g.donorName || 'Unnamed giver',
          email: g.email || g.donorEmail || '',
        };
      });
      return reply({ givers, hasMore: result.results.length > 100 });
    }
    if (action === 'accounting' || action === 'unlink')
      return await outsideAccountingAction(request, env, registration, id, action, body);
    if (request.method === 'GET' && action) return reply({ error: 'Not found.' }, 404);
    if (request.method === 'GET' && id) {
      const row = await outsideGiftRow(db, parishId, id);
      if (!row) return reply({ error: 'Gift not found.' }, 404);
      const audit = await db
        .prepare(
          'SELECT revision,action,actor_id,reason,snapshot_json,created_at FROM outside_gift_audit WHERE parish_id=? AND gift_id=? ORDER BY revision DESC LIMIT 100'
        )
        .bind(parishId, id)
        .all();
      return reply({ gift: await outsideGiftDto(db, row, registration), audit: audit.results });
    }
    if (request.method === 'GET') {
      const params = new URL(request.url).searchParams;
      const year = params.get('year') || new Date().getFullYear().toString();
      if (!/^(19|20|21)\d{2}$/.test(year)) throw new OutsideGiftError('Choose a valid year.');
      const rows = await loadOutsideGiftRows(db, parishId, {
        start: year + '-01-01',
        end: year + '-12-31',
        includeVoided: true,
        limit: 1000,
      });
      const gifts = [];
      for (const row of rows) gifts.push(await outsideGiftDto(db, row, registration));
      return reply({ gifts, year, complete: true });
    }
    const actor = 'parish_session:' + session.id;
    if (!id) {
      const result = await createGift(db, registration, actor, body);
      return reply(
        { gift: await outsideGiftDto(db, result.row, registration), replayed: result.replayed },
        result.replayed ? 200 : 201
      );
    }
    if (!['correct', 'void'].includes(action)) return reply({ error: 'Not found.' }, 404);
    const row = await changeGift(db, registration, actor, id, action, body);
    return reply({ gift: await outsideGiftDto(db, row, registration) });
  } catch (error) {
    if (error instanceof OutsideGiftError) return reply({ error: error.message, code: error.code }, error.status);
    if (/constraint|unique/i.test(error.message || ''))
      return reply({ error: 'The gift changed during this save. Refresh before trying again.' }, 409);
    console.error(JSON.stringify({ message: 'Outside gift request failed', parishId, errorType: error.name }));
    return reply(
      {
        error:
          'Unable to confirm this operation. Refresh to check the record or retry the same save; do not create a second entry.',
      },
      503
    );
  }
}
