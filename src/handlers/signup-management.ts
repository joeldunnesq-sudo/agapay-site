import type {
  SignupEnvironment,
  SignupContext,
  SignupRow,
  SignupRequest,
} from './koinonia-signups-composition-contracts.js';

import '../lib/content-reads.js';

import { d1All, d1Batch, d1First, d1Run, generateSecret } from '../lib/core.js';

import '../lib/entitlements.js';

import { sendSignupPublishedPush } from '../lib/push-notifications.js';

import './koinonia-access.js';

import './parish.js';
import { SHEET_CATEGORIES, SHEET_STATUSES, SignupAccessError } from './koinonia-signups-shared.js';
import {
  auditSignup,
  requireMinistryManager,
  requireSheetManager,
  requireSlotManager,
} from './koinonia-signups-shared.js';
import './koinonia-signups.js';
import './signup-commitments.js';
export async function createSheet(request: Request, env: SignupEnvironment, context: SignupContext) {
  const body = await (request.json().catch(() => ({})) as Promise<SignupRequest>);
  const ministryId = String(body.ministryId || '').trim();
  const title = String(body.title || '')
    .trim()
    .slice(0, 180);
  const category = SHEET_CATEGORIES.has(body.category!) ? body.category : 'general';
  const description = String(body.description || '')
    .trim()
    .slice(0, 2000);
  if (!ministryId || !title) throw new SignupAccessError('Ministry and title are required.', 422);
  await requireMinistryManager(env, { parishId: context.parishId, ministryId, personId: context.personId });
  const now = Date.now();
  const id = generateSecret('koinonia_sheet');
  await d1Run(
    env,
    `
    INSERT INTO koinonia_signup_sheets
      (id, parish_id, ministry_id, title, description, category, status, visibility,
       created_by_person_id, updated_by_person_id, created_at, updated_at, revision)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'draft', 'parish_members', ?7, ?7, ?8, ?8, 1)
  `,
    id,
    context.parishId,
    ministryId,
    title,
    description,
    category,
    context.personId,
    now
  );
  await auditSignup(env, context, { sheetId: id, action: 'sheet_created', summary: title });
  return { ok: true, sheetId: id };
}
export async function updateSheetStatus(
  request: Request,
  env: SignupEnvironment,
  ctx: Pick<ExecutionContext, 'waitUntil'> | null,
  context: SignupContext,
  sheetId: string
) {
  const current = await requireSheetManager(env, context, sheetId);
  const body = await (request.json().catch(() => ({})) as Promise<SignupRequest>);
  if (!SHEET_STATUSES.has(body.status!)) throw new SignupAccessError('Invalid status.', 422);
  const now = Date.now();
  await d1Run(
    env,
    `
    UPDATE koinonia_signup_sheets
    SET status = ?1, archived_at = CASE WHEN ?1 = 'archived' THEN ?2 ELSE NULL END,
        published_at = CASE WHEN ?1 = 'open' AND published_at IS NULL THEN ?2 ELSE published_at END,
        updated_by_person_id = ?3, updated_at = ?2, revision = revision + 1
    WHERE id = ?4 AND parish_id = ?5
  `,
    body.status,
    now,
    context.personId,
    sheetId,
    context.parishId
  );
  await auditSignup(env, context, { sheetId, action: 'status_changed', summary: body.status! });
  if (body.status === 'open' && current.published_at == null && ctx?.waitUntil) {
    const ministry = await d1First<SignupRow>(
      env,
      'SELECT display_name FROM directory_ministries WHERE id = ?1 AND parish_id = ?2',
      current.ministry_id,
      context.parishId
    );
    ctx.waitUntil(
      sendSignupPublishedPush(env, {
        parishId: context.parishId,
        publishedByPersonId: context.personId,
        sheetId,
        sheetTitle: current.title,
        ministryName: ministry?.display_name || '',
      }).catch((error) => console.error('signup_published_push_failed', error?.message || String(error)))
    );
  }
  return { ok: true, sheetId, status: body.status };
}

export async function updateSheet(request: Request, env: SignupEnvironment, context: SignupContext, sheetId: string) {
  await requireSheetManager(env, context, sheetId);
  const body = await (request.json().catch(() => ({})) as Promise<SignupRequest>);
  const title = String(body.title || '')
    .trim()
    .slice(0, 180);
  const category = SHEET_CATEGORIES.has(body.category!) ? body.category : 'general';
  const description = String(body.description || '')
    .trim()
    .slice(0, 2000);
  if (!title) throw new SignupAccessError('Signup title is required.', 422);
  await d1Run(
    env,
    `
    UPDATE koinonia_signup_sheets
    SET title = ?1, category = ?2, description = ?3, updated_by_person_id = ?4,
        updated_at = ?5, revision = revision + 1
    WHERE id = ?6 AND parish_id = ?7
  `,
    title,
    category,
    description,
    context.personId,
    Date.now(),
    sheetId,
    context.parishId
  );
  await auditSignup(env, context, { sheetId, action: 'sheet_edited', summary: title });
  return { ok: true, sheetId };
}

export async function deleteSheet(env: SignupEnvironment, context: SignupContext, sheetId: string) {
  await requireSheetManager(env, context, sheetId);
  const confirmed = await d1First<SignupRow>(
    env,
    `
    SELECT COUNT(*) AS count
    FROM koinonia_signup_entries entry
    JOIN koinonia_signup_slots slot ON slot.id = entry.slot_id
    WHERE slot.sheet_id = ?1 AND entry.parish_id = ?2 AND entry.status = 'confirmed'
  `,
    sheetId,
    context.parishId
  );
  if (Number(confirmed?.count || 0) > 0) {
    throw new SignupAccessError(
      'This signup has confirmed commitments. Close or archive it instead of deleting it.',
      409
    );
  }
  await d1Run(env, 'DELETE FROM koinonia_signup_sheets WHERE id = ?1 AND parish_id = ?2', sheetId, context.parishId);
  await auditSignup(env, context, { sheetId, action: 'sheet_deleted' });
  return { ok: true, sheetId };
}
export async function addSlot(request: Request, env: SignupEnvironment, context: SignupContext, sheetId: string) {
  await requireSheetManager(env, context, sheetId);
  const body = await (request.json().catch(() => ({})) as Promise<SignupRequest>);
  const label = String(body.label || '')
    .trim()
    .slice(0, 180);
  const neededCount = Number(body.neededCount ?? 1);
  const slotDate = body.slotDate == null || body.slotDate === '' ? null : Number(body.slotDate);
  const notes = String(body.notes || '')
    .trim()
    .slice(0, 500);
  const displayOrder = Number.isFinite(Number(body.displayOrder)) ? Math.trunc(Number(body.displayOrder)) : 100;
  if (!label) throw new SignupAccessError('Slot label is required.', 422);
  if (!Number.isInteger(neededCount) || neededCount < 1 || neededCount > 100)
    throw new SignupAccessError('Needed count must be between 1 and 100.', 422);
  if (slotDate != null && (!Number.isFinite(slotDate) || slotDate < 0))
    throw new SignupAccessError('Slot date is invalid.', 422);
  const now = Date.now();
  const id = generateSecret('koinonia_slot');
  await d1Run(
    env,
    `
    INSERT INTO koinonia_signup_slots
      (id, sheet_id, parish_id, label, notes, needed_count, slot_date, display_order, created_at, updated_at, revision)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9, 1)
  `,
    id,
    sheetId,
    context.parishId,
    label,
    notes,
    neededCount,
    slotDate,
    displayOrder,
    now
  );
  await auditSignup(env, context, { sheetId, slotId: id, action: 'slot_added', summary: label });
  return { ok: true, slotId: id };
}

export async function updateSlot(request: Request, env: SignupEnvironment, context: SignupContext, slotId: string) {
  const managedSlot = await requireSlotManager(env, context, slotId);
  const body = await (request.json().catch(() => ({})) as Promise<SignupRequest>);
  const label = String(body.label || '')
    .trim()
    .slice(0, 180);
  const notes = String(body.notes || '')
    .trim()
    .slice(0, 500);
  const neededCount = Number(body.neededCount ?? 1);
  const slotDate = body.slotDate == null || body.slotDate === '' ? null : Number(body.slotDate);
  if (!label) throw new SignupAccessError('Slot label is required.', 422);
  if (!Number.isInteger(neededCount) || neededCount < 1 || neededCount > 100)
    throw new SignupAccessError('People needed must be between 1 and 100.', 422);
  if (slotDate != null && (!Number.isFinite(slotDate) || slotDate < 0))
    throw new SignupAccessError('Slot date is invalid.', 422);
  const confirmed = await d1First<SignupRow>(
    env,
    "SELECT COUNT(*) AS count FROM koinonia_signup_entries WHERE slot_id = ?1 AND status = 'confirmed'",
    slotId
  );
  if (neededCount < Number(confirmed?.count || 0))
    throw new SignupAccessError('People needed cannot be lower than the number already signed up.', 409);
  await d1Run(
    env,
    `
    UPDATE koinonia_signup_slots
    SET label = ?1, notes = ?2, needed_count = ?3, slot_date = ?4,
        updated_at = ?5, revision = revision + 1
    WHERE id = ?6 AND parish_id = ?7
  `,
    label,
    notes,
    neededCount,
    slotDate,
    Date.now(),
    slotId,
    context.parishId
  );
  await auditSignup(env, context, { sheetId: managedSlot.sheet_id, slotId, action: 'slot_edited', summary: label });
  return { ok: true, slotId };
}

export async function deleteSlot(env: SignupEnvironment, context: SignupContext, slotId: string) {
  const managedSlot = await requireSlotManager(env, context, slotId);
  const confirmed = await d1First<SignupRow>(
    env,
    "SELECT COUNT(*) AS count FROM koinonia_signup_entries WHERE slot_id = ?1 AND status = 'confirmed'",
    slotId
  );
  if (Number(confirmed?.count || 0) > 0)
    throw new SignupAccessError('This slot has confirmed commitments and cannot be deleted.', 409);
  await d1Run(env, 'DELETE FROM koinonia_signup_slots WHERE id = ?1 AND parish_id = ?2', slotId, context.parishId);
  await auditSignup(env, context, {
    sheetId: managedSlot.sheet_id,
    slotId,
    action: 'slot_deleted',
    summary: managedSlot.label,
  });
  return { ok: true, slotId };
}
export async function listSignupHistory(env: SignupEnvironment, context: SignupContext, sheetId: string) {
  await requireSheetManager(env, context, sheetId);
  return {
    activity: await d1All<SignupRow>(
      env,
      `SELECT a.*,p.preferred_name actor_name FROM koinonia_signup_activity a LEFT JOIN directory_people p ON p.id=a.actor_person_id WHERE a.parish_id=? AND a.sheet_id=? ORDER BY a.created_at DESC LIMIT 100`,
      context.parishId,
      sheetId
    ),
  };
}
export async function listSignupTemplates(env: SignupEnvironment, context: SignupContext, ministryId: string) {
  await requireMinistryManager(env, { ...context, ministryId });
  return {
    templates: await d1All<SignupRow>(
      env,
      'SELECT * FROM koinonia_signup_templates WHERE parish_id=? AND ministry_id=? ORDER BY updated_at DESC',
      context.parishId,
      ministryId
    ),
  };
}
export async function saveSignupTemplate(
  request: Request,
  env: SignupEnvironment,
  context: SignupContext,
  sheetId: string
) {
  const sheet = await requireSheetManager(env, context, sheetId);
  const b = await (request.json().catch(() => ({})) as Promise<SignupRequest>);
  const slots = await d1All<SignupRow>(
    env,
    'SELECT label,notes,needed_count,display_order FROM koinonia_signup_slots WHERE sheet_id=? AND parish_id=? ORDER BY display_order',
    sheetId,
    context.parishId
  );
  const id = generateSecret('signup_template'),
    now = Date.now();
  await d1Run(
    env,
    'INSERT INTO koinonia_signup_templates(id,parish_id,ministry_id,name,title,description,category,slots_json,created_by_person_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
    id,
    context.parishId,
    sheet.ministry_id,
    String(b.name || sheet.title).slice(0, 180),
    sheet.title,
    sheet.description || '',
    sheet.category,
    JSON.stringify(slots),
    context.personId,
    now,
    now
  );
  return { ok: true, templateId: id };
}
export async function createFromSignupTemplate(
  request: Request,
  env: SignupEnvironment,
  context: SignupContext,
  templateId: string
) {
  const t = await d1First<SignupRow>(
    env,
    'SELECT * FROM koinonia_signup_templates WHERE id=? AND parish_id=?',
    templateId,
    context.parishId
  );
  if (!t) throw new SignupAccessError('Template not found.', 404);
  await requireMinistryManager(env, { ...context, ministryId: t.ministry_id });
  const b = await (request.json().catch(() => ({})) as Promise<SignupRequest>),
    now = Date.now(),
    sheetId = generateSecret('koinonia_sheet'),
    baseDate = Number(b.startsAt) || null;
  const slots = JSON.parse(t.slots_json || '[]') as SignupRow[];
  const statements: { sql: string; params: unknown[] }[] = [
    {
      sql: `INSERT INTO koinonia_signup_sheets(id,parish_id,ministry_id,title,description,category,status,visibility,created_by_person_id,updated_by_person_id,created_at,updated_at) VALUES(?,?,?,?,?,?,'draft','parish_members',?,?,?,?)`,
      params: [
        sheetId,
        context.parishId,
        t.ministry_id,
        String(b.title || t.title).slice(0, 180),
        t.description,
        t.category,
        context.personId,
        context.personId,
        now,
        now,
      ],
    },
  ];
  slots.forEach((s, i) =>
    statements.push({
      sql: `INSERT INTO koinonia_signup_slots(id,sheet_id,parish_id,label,notes,needed_count,slot_date,display_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`,
      params: [
        generateSecret('koinonia_slot'),
        sheetId,
        context.parishId,
        s.label,
        s.notes || '',
        s.needed_count || 1,
        baseDate,
        Number(s.display_order) || 100 + i,
        now,
        now,
      ],
    })
  );
  await d1Batch(env, statements);
  await auditSignup(env, context, { sheetId, action: 'created_from_template', summary: t.name });
  return { ok: true, sheetId };
}
