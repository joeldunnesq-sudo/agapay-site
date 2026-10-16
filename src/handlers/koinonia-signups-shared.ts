import type { SignupEnvironment, SignupContext, SignupRow } from './koinonia-signups-composition-contracts.js';

import { getReadContentIds } from '../lib/content-reads.js';

import { d1All, d1First, d1Run, generateSecret, json } from '../lib/core.js';

import { signupsEnabledFor } from '../lib/entitlements.js';

import '../lib/push-notifications.js';

import { verifiedHouseholdAccess } from './koinonia-access.js';

import { findRegistrationByParishId } from './parish.js';
import './koinonia-signups.js';
import './signup-management.js';
import './signup-commitments.js';
export const CONTENT_TYPE = 'signup_slot';
export const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  Vary: 'Authorization, X-AGAPAY-Donor-Email',
};
export const SHEET_CATEGORIES = new Set(['meal_train', 'cleaning', 'event', 'volunteer', 'general']);
export const SHEET_STATUSES = new Set(['draft', 'open', 'closed', 'archived']);

export class SignupAccessError extends Error {
  declare status: number;
  constructor(message = "You don't have access to manage this signup sheet.", status = 403) {
    super(message);
    this.name = 'SignupAccessError';
    this.status = status;
  }
}
export function privateJson(payload: unknown, init: import('../lib/http-responses.js').JsonResponseInit = {}) {
  return json(payload, { ...init, headers: { ...PRIVATE_HEADERS, ...(init.headers || {}) } });
}
export function database(env: SignupEnvironment) {
  return env.AGAPAY_DB || env.DB || null;
}
export async function auditSignup(
  env: SignupEnvironment,
  context: SignupContext,
  {
    sheetId = null,
    slotId = null,
    action,
    summary = '',
  }: { sheetId?: string | null; slotId?: string | null; action: string; summary?: string }
) {
  await d1Run(
    env,
    'INSERT INTO koinonia_signup_activity(id,parish_id,sheet_id,slot_id,actor_person_id,action,summary,created_at) VALUES(?,?,?,?,?,?,?,?)',
    generateSecret('signup_activity'),
    context.parishId,
    sheetId,
    slotId,
    context.personId,
    action,
    String(summary).slice(0, 500),
    Date.now()
  );
}
export function sheetFromRow(row: Partial<SignupRow> = {}) {
  return {
    id: row.id || '',
    parishId: row.parish_id || '',
    ministryId: row.ministry_id || '',
    ministryName: row.ministry_name || '',
    title: row.title || '',
    description: row.description || '',
    category: row.category || 'general',
    status: row.status || 'draft',
    visibility: row.visibility || 'parish_members',
    canManage: Number(row.can_manage || 0) === 1,
    slotCount: Number(row.slot_count || 0),
    openingCount: Number(row.opening_count || 0),
    unreadSlotCount: Number(row.unread_slot_count || 0),
    createdAt: Number(row.created_at || 0),
    publishedAt: row.published_at == null ? null : Number(row.published_at),
    updatedAt: Number(row.updated_at || 0),
  };
}
export function slotFromRow(row: Partial<SignupRow> = {}) {
  return {
    id: row.id || '',
    sheetId: row.sheet_id || '',
    label: row.label || '',
    notes: row.notes || '',
    neededCount: Number(row.needed_count || 1),
    filledCount: Number(row.filled_count || 0),
    slotDate: row.slot_date == null ? null : Number(row.slot_date),
    displayOrder: Number(row.display_order || 100),
    read: Boolean(row.read),
  };
}
export function entryFromRow(row: Partial<SignupRow> = {}) {
  return {
    id: row.id || '',
    slotId: row.slot_id || '',
    personId: row.person_id || '',
    personName: row.person_name || 'Parish member',
    comment: row.comment || '',
    mine: Boolean(row.mine),
    completed: Number(row.completed || 0) === 1,
    attended: row.attended == null ? null : Number(row.attended) === 1,
    thanked: row.thanked_at != null,
    coverageRequested: Number(row.coverage_requested || 0) === 1,
    coverageNote: row.coverage_note || '',
    createdAt: Number(row.created_at || 0),
  };
}
export async function featureContext(request: Request, env: SignupEnvironment) {
  const access = await verifiedHouseholdAccess(request, env);
  if (access.response) return access;
  const found = await findRegistrationByParishId(env, access.context.parishId);
  if (!found?.registration || !signupsEnabledFor(found.registration)) {
    return {
      context: null,
      response: privateJson({ error: 'Parish Signups are not available for this parish.' }, { status: 403 }),
    };
  }
  return access;
}
export async function ministryManagerRow(
  env: SignupEnvironment,
  { parishId, ministryId, personId }: { parishId: string; ministryId: string; personId: string }
) {
  return d1First<SignupRow>(
    env,
    `
    SELECT ministry.id
    FROM directory_ministries ministry
    WHERE ministry.parish_id = ?1 AND ministry.id = ?2 AND ministry.status = 'active'
      AND (
        EXISTS (SELECT 1 FROM directory_ministry_participants participant
          WHERE participant.parish_id = ministry.parish_id AND participant.ministry_id = ministry.id
            AND participant.person_id = ?3 AND participant.status = 'active')
        OR EXISTS (SELECT 1 FROM directory_ministry_leaders leader
          WHERE leader.parish_id = ministry.parish_id AND leader.ministry_id = ministry.id
            AND leader.person_id = ?3 AND leader.active = 1)
      )
    LIMIT 1
  `,
    parishId,
    ministryId,
    personId
  );
}
export async function requireMinistryManager(
  env: SignupEnvironment,
  values: { parishId: string; ministryId: string; personId: string }
) {
  const row = await ministryManagerRow(env, values);
  if (!row) throw new SignupAccessError('Only people assigned to this ministry can manage its signup forms.');
  return row;
}
export async function requireSheetManager(env: SignupEnvironment, context: SignupContext, sheetId: string) {
  const sheet = await d1First<SignupRow>(
    env,
    `
    SELECT * FROM koinonia_signup_sheets WHERE id = ?1 AND parish_id = ?2
  `,
    sheetId,
    context.parishId
  );
  if (!sheet) throw new SignupAccessError('Signup sheet not found.', 404);
  await requireMinistryManager(env, {
    parishId: context.parishId,
    ministryId: sheet.ministry_id,
    personId: context.personId,
  });
  return sheet;
}
export async function listManagedMinistries(env: SignupEnvironment, context: SignupContext) {
  const rows = await d1All<SignupRow>(
    env,
    `
    SELECT DISTINCT ministry.id, ministry.display_name, ministry.category
    FROM directory_ministries ministry
    WHERE ministry.parish_id = ?1 AND ministry.status = 'active'
      AND (
        EXISTS (SELECT 1 FROM directory_ministry_participants participant
          WHERE participant.parish_id = ministry.parish_id AND participant.ministry_id = ministry.id
            AND participant.person_id = ?2 AND participant.status = 'active')
        OR EXISTS (SELECT 1 FROM directory_ministry_leaders leader
          WHERE leader.parish_id = ministry.parish_id AND leader.ministry_id = ministry.id
            AND leader.person_id = ?2 AND leader.active = 1)
      )
    ORDER BY ministry.display_name ASC
  `,
    context.parishId,
    context.personId
  );
  return rows.map((row) => ({ id: row.id, name: row.display_name || 'Ministry', category: row.category || 'other' }));
}
export async function listSheets(env: SignupEnvironment, context: SignupContext) {
  const rows = await d1All<SignupRow>(
    env,
    `
    SELECT sheet.*, ministry.display_name AS ministry_name,
      (EXISTS (
        SELECT 1 FROM directory_ministry_leaders leader
        WHERE leader.parish_id = sheet.parish_id AND leader.ministry_id = sheet.ministry_id
          AND leader.person_id = ?2 AND leader.active = 1
      ) OR EXISTS (
        SELECT 1 FROM directory_ministry_participants participant
        WHERE participant.parish_id = sheet.parish_id AND participant.ministry_id = sheet.ministry_id
          AND participant.person_id = ?2 AND participant.status = 'active'
      )) AS can_manage,
      (SELECT COUNT(*) FROM koinonia_signup_slots slot WHERE slot.sheet_id = sheet.id) AS slot_count,
      COALESCE((
        SELECT SUM(MAX(0, slot.needed_count - (
          SELECT COUNT(*) FROM koinonia_signup_entries entry
          WHERE entry.slot_id = slot.id AND entry.status = 'confirmed'
        )))
        FROM koinonia_signup_slots slot WHERE slot.sheet_id = sheet.id
      ), 0) AS opening_count
    FROM koinonia_signup_sheets sheet
    JOIN directory_ministries ministry
      ON ministry.id = sheet.ministry_id AND ministry.parish_id = sheet.parish_id
    WHERE sheet.parish_id = ?1
      AND (sheet.status IN ('open', 'closed') OR EXISTS (
        SELECT 1 FROM directory_ministry_leaders leader
        WHERE leader.parish_id = sheet.parish_id AND leader.ministry_id = sheet.ministry_id
          AND leader.person_id = ?2 AND leader.active = 1
      ) OR EXISTS (
        SELECT 1 FROM directory_ministry_participants participant
        WHERE participant.parish_id = sheet.parish_id AND participant.ministry_id = sheet.ministry_id
          AND participant.person_id = ?2 AND participant.status = 'active'
      ))
    ORDER BY CASE sheet.status WHEN 'open' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,
      sheet.updated_at DESC
    LIMIT 100
  `,
    context.parishId,
    context.personId
  );
  const slotRows = rows.length
    ? await d1All<SignupRow>(
        env,
        `
    SELECT id, sheet_id FROM koinonia_signup_slots
    WHERE parish_id = ?1 AND sheet_id IN (${rows.map((_, index) => `?${index + 2}`).join(', ')})
  `,
        context.parishId,
        ...rows.map(({ id }) => id)
      )
    : [];
  const readIds = await getReadContentIds(database(env)!, {
    parishId: context.parishId,
    contentType: CONTENT_TYPE,
    donorId: context.donorId,
    contentIds: slotRows.map(({ id }) => id),
  });
  const readSet = new Set(readIds);
  const unreadBySheet = new Map();
  slotRows.forEach((slot) => {
    if (!readSet.has(slot.id)) unreadBySheet.set(slot.sheet_id, (unreadBySheet.get(slot.sheet_id) || 0) + 1);
  });
  return rows.map((row) => sheetFromRow({ ...row, unread_slot_count: unreadBySheet.get(row.id) || 0 }));
}
export async function getSheet(env: SignupEnvironment, context: SignupContext, sheetId: string) {
  const sheet = await d1First<SignupRow>(
    env,
    `
    SELECT sheet.*, ministry.display_name AS ministry_name,
      (EXISTS (
        SELECT 1 FROM directory_ministry_leaders leader
        WHERE leader.parish_id = sheet.parish_id AND leader.ministry_id = sheet.ministry_id
          AND leader.person_id = ?3 AND leader.active = 1
      ) OR EXISTS (
        SELECT 1 FROM directory_ministry_participants participant
        WHERE participant.parish_id = sheet.parish_id AND participant.ministry_id = sheet.ministry_id
          AND participant.person_id = ?3 AND participant.status = 'active'
      )) AS can_manage
    FROM koinonia_signup_sheets sheet
    JOIN directory_ministries ministry
      ON ministry.id = sheet.ministry_id AND ministry.parish_id = sheet.parish_id
    WHERE sheet.id = ?1 AND sheet.parish_id = ?2
  `,
    sheetId,
    context.parishId,
    context.personId
  );
  if (!sheet || (!['open', 'closed'].includes(sheet.status) && Number(sheet.can_manage || 0) !== 1)) {
    throw new SignupAccessError('Signup sheet not found.', 404);
  }
  const slotRows = await d1All<SignupRow>(
    env,
    `
    SELECT slot.*, (
      SELECT COUNT(*) FROM koinonia_signup_entries entry
      WHERE entry.slot_id = slot.id AND entry.status = 'confirmed'
    ) AS filled_count
    FROM koinonia_signup_slots slot
    WHERE slot.sheet_id = ?1 AND slot.parish_id = ?2
    ORDER BY slot.display_order ASC, slot.slot_date ASC, slot.created_at ASC
  `,
    sheetId,
    context.parishId
  );
  const readIds = await getReadContentIds(database(env)!, {
    parishId: context.parishId,
    contentType: CONTENT_TYPE,
    donorId: context.donorId,
    contentIds: slotRows.map(({ id }) => id),
  });
  const readSet = new Set(readIds);
  const slots = await Promise.all(
    slotRows.map(async (row) => {
      const entries = await d1All<SignupRow>(
        env,
        `
      SELECT entry.*, person.preferred_name AS person_name,
        service.completed, service.attended, service.thanked_at,
        EXISTS(SELECT 1 FROM koinonia_signup_coverage_requests coverage WHERE coverage.entry_id = entry.id AND coverage.parish_id = entry.parish_id AND coverage.status = 'open') AS coverage_requested,
        (SELECT coverage.note FROM koinonia_signup_coverage_requests coverage WHERE coverage.entry_id = entry.id AND coverage.parish_id = entry.parish_id AND coverage.status = 'open' ORDER BY coverage.updated_at DESC LIMIT 1) AS coverage_note
      FROM koinonia_signup_entries entry
      LEFT JOIN directory_people person ON person.id = entry.person_id
      LEFT JOIN koinonia_signup_service_records service ON service.entry_id = entry.id
      WHERE entry.slot_id = ?1 AND entry.parish_id = ?2 AND entry.status = 'confirmed'
      ORDER BY entry.created_at ASC
    `,
        row.id,
        context.parishId
      );
      return {
        ...slotFromRow({ ...row, read: readSet.has(row.id) }),
        entries: entries.map((entry) => entryFromRow({ ...entry, mine: entry.person_id === context.personId })),
      };
    })
  );
  return { sheet: sheetFromRow(sheet), slots };
}
export async function requireSlotManager(env: SignupEnvironment, context: SignupContext, slotId: string) {
  const slot = await d1First<SignupRow>(
    env,
    `
    SELECT slot.*, sheet.ministry_id
    FROM koinonia_signup_slots slot
    JOIN koinonia_signup_sheets sheet ON sheet.id = slot.sheet_id AND sheet.parish_id = slot.parish_id
    WHERE slot.id = ?1 AND slot.parish_id = ?2
  `,
    slotId,
    context.parishId
  );
  if (!slot) throw new SignupAccessError('Signup slot not found.', 404);
  await requireMinistryManager(env, {
    parishId: context.parishId,
    ministryId: slot.ministry_id,
    personId: context.personId,
  });
  return slot;
}
export function errorResponse(error: unknown) {
  if (error instanceof SignupAccessError) return privateJson({ error: error.message }, { status: error.status });
  throw error;
}
