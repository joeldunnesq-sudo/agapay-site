// Generated from src/handlers/koinonia-signups.ts by npm run build:server. Do not edit.
import '../lib/content-reads.js';
import { d1All, hasProductionStore, missingProductionStoreResponse, rateLimit } from '../lib/core.js';
import '../lib/entitlements.js';
import '../lib/push-notifications.js';
import './koinonia-access.js';
import './parish.js';
import './koinonia-signups-shared.js';
import {
  privateJson,
  database,
  featureContext,
  listManagedMinistries,
  listSheets,
  getSheet,
  errorResponse,
} from './koinonia-signups-shared.js';
import {
  createSheet,
  updateSheetStatus,
  updateSheet,
  deleteSheet,
  addSlot,
  updateSlot,
  deleteSlot,
  listSignupHistory,
  listSignupTemplates,
  saveSignupTemplate,
  createFromSignupTemplate,
} from './signup-management.js';
import {
  claimSignupSlot,
  cancelEntry,
  markSlotRead,
  joinSignupWaitlist,
  requestSignupCoverage,
  acceptSignupCoverage,
  completeSignupEntry,
} from './signup-commitments.js';
import { SignupAccessError } from './koinonia-signups-shared.js';
import {
  updateSheet as updateSheet2,
  deleteSheet as deleteSheet2,
  updateSlot as updateSlot2,
  deleteSlot as deleteSlot2,
} from './signup-management.js';
import {
  claimSignupSlot as claimSignupSlot2,
  requestSignupCoverage as requestSignupCoverage2,
  sendScheduledSignupReminders,
} from './signup-commitments.js';
async function listUpcomingSignupCommitments(env, context, currentTime = Date.now()) {
  const windowEnd = currentTime + 7 * 24 * 60 * 60 * 1e3;
  const rows = await d1All(
    env,
    `
    SELECT entry.id AS entry_id, sheet.id AS sheet_id, sheet.title AS sheet_title,
      ministry.display_name AS ministry_name, slot.id AS slot_id, slot.label,
      slot.notes, slot.slot_date
    FROM koinonia_signup_entries entry
    JOIN koinonia_signup_slots slot ON slot.id = entry.slot_id AND slot.parish_id = entry.parish_id
    JOIN koinonia_signup_sheets sheet ON sheet.id = slot.sheet_id AND sheet.parish_id = entry.parish_id
    JOIN directory_ministries ministry ON ministry.id = sheet.ministry_id AND ministry.parish_id = sheet.parish_id
    WHERE entry.parish_id = ?1 AND entry.person_id = ?2
      AND entry.status = 'confirmed' AND sheet.status IN ('open', 'closed')
      AND slot.slot_date IS NOT NULL AND slot.slot_date >= ?3 AND slot.slot_date <= ?4
    ORDER BY slot.slot_date ASC, sheet.title ASC, slot.display_order ASC
  `,
    context.parishId,
    context.personId,
    currentTime,
    windowEnd
  );
  return rows.map((row) => ({
    entryId: row.entry_id,
    sheetId: row.sheet_id,
    sheetTitle: row.sheet_title,
    ministryName: row.ministry_name || '',
    slotId: row.slot_id,
    label: row.label || '',
    notes: row.notes || '',
    slotDate: Number(row.slot_date),
  }));
}
async function listSignupInboxActions(env, context, currentTime = Date.now()) {
  const windowEnd = currentTime + 14 * 24 * 60 * 60 * 1e3;
  const [waitlistRows, coverageRows] = await Promise.all([
    d1All(
      env,
      `
      SELECT waitlist.id AS waitlist_id, slot.id AS slot_id, slot.label, slot.slot_date,
        sheet.id AS sheet_id, sheet.title AS sheet_title, ministry.display_name AS ministry_name
      FROM koinonia_signup_waitlist waitlist
      JOIN koinonia_signup_slots slot ON slot.id = waitlist.slot_id AND slot.parish_id = waitlist.parish_id
      JOIN koinonia_signup_sheets sheet ON sheet.id = slot.sheet_id AND sheet.parish_id = waitlist.parish_id
      JOIN directory_ministries ministry ON ministry.id = sheet.ministry_id AND ministry.parish_id = sheet.parish_id
      WHERE waitlist.parish_id = ?1 AND waitlist.person_id = ?2 AND waitlist.status = 'offered'
        AND sheet.status = 'open' AND (slot.slot_date IS NULL OR slot.slot_date <= ?3)
      ORDER BY COALESCE(slot.slot_date, ?4) ASC, waitlist.updated_at ASC
      LIMIT 6
    `,
      context.parishId,
      context.personId,
      windowEnd,
      windowEnd
    ),
    d1All(
      env,
      `
      SELECT coverage.id AS coverage_request_id, coverage.note, requester.preferred_name AS requester_name,
        slot.id AS slot_id, slot.label, slot.slot_date, sheet.id AS sheet_id,
        sheet.title AS sheet_title, ministry.display_name AS ministry_name
      FROM koinonia_signup_coverage_requests coverage
      JOIN koinonia_signup_entries entry ON entry.id = coverage.entry_id AND entry.status = 'confirmed'
      JOIN koinonia_signup_slots slot ON slot.id = entry.slot_id AND slot.parish_id = coverage.parish_id
      JOIN koinonia_signup_sheets sheet ON sheet.id = slot.sheet_id AND sheet.parish_id = coverage.parish_id
      JOIN directory_ministries ministry ON ministry.id = sheet.ministry_id AND ministry.parish_id = coverage.parish_id
      LEFT JOIN directory_people requester ON requester.id = coverage.requester_person_id AND requester.parish_id = coverage.parish_id
      WHERE coverage.parish_id = ?1 AND coverage.status = 'open' AND coverage.requester_person_id <> ?2
        AND sheet.status IN ('open', 'closed') AND (slot.slot_date IS NULL OR slot.slot_date <= ?3)
        AND (
          EXISTS (SELECT 1 FROM directory_ministry_leaders leader WHERE leader.parish_id = sheet.parish_id AND leader.ministry_id = sheet.ministry_id AND leader.person_id = ?2 AND leader.active = 1)
          OR EXISTS (SELECT 1 FROM directory_ministry_participants participant WHERE participant.parish_id = sheet.parish_id AND participant.ministry_id = sheet.ministry_id AND participant.person_id = ?2 AND participant.status = 'active')
        )
      ORDER BY COALESCE(slot.slot_date, ?4) ASC, coverage.created_at ASC
      LIMIT 6
    `,
      context.parishId,
      context.personId,
      windowEnd,
      windowEnd
    ),
  ]);
  return [
    ...waitlistRows.map((row) => ({
      id: row.waitlist_id,
      kind: 'waitlist',
      slotId: row.slot_id,
      sheetId: row.sheet_id,
      title: 'A waitlist spot opened for you',
      detail: `${row.sheet_title} · ${row.label}`,
      ministryName: row.ministry_name || '',
      slotDate: row.slot_date == null ? null : Number(row.slot_date),
    })),
    ...coverageRows.map((row) => ({
      id: row.coverage_request_id,
      kind: 'coverage',
      sheetId: row.sheet_id,
      title: `${row.requester_name || 'A ministry member'} needs coverage`,
      detail: `${row.sheet_title} · ${row.label}`,
      reason: row.note || '',
      ministryName: row.ministry_name || '',
      slotDate: row.slot_date == null ? null : Number(row.slot_date),
    })),
  ]
    .sort((left, right) => (left.slotDate ?? windowEnd) - (right.slotDate ?? windowEnd))
    .slice(0, 6);
}
async function handleDonorKoinoniaSignups(request, env, ctx = null) {
  if (!hasProductionStore(env) || !database(env)) return missingProductionStoreResponse();
  const limited = await rateLimit(request, env, 'koinonia-signups', { limit: 80, windowSeconds: 300 });
  if (limited) return limited;
  try {
    const access = await featureContext(request, env);
    if (access.response) return access.response;
    const context = access.context;
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api\/donor\/koinonia\/signups\/?/, '');
    const parts = path ? path.split('/').map(decodeURIComponent) : [];
    if (!parts.length && request.method === 'GET') {
      const [sheets, ministries] = await Promise.all([listSheets(env, context), listManagedMinistries(env, context)]);
      return privateJson({ ok: true, sheets, ministries });
    }
    if (!parts.length && request.method === 'POST')
      return privateJson(await createSheet(request, env, context), { status: 201 });
    if (parts.length === 2 && parts[0] === 'templates' && request.method === 'GET')
      return privateJson(await listSignupTemplates(env, context, parts[1]));
    if (parts.length === 3 && parts[0] === 'templates' && parts[2] === 'create' && request.method === 'POST')
      return privateJson(await createFromSignupTemplate(request, env, context, parts[1]), { status: 201 });
    if (parts.length === 1 && parts[0] === 'upcoming' && request.method === 'GET') {
      const [signups, actions] = await Promise.all([
        listUpcomingSignupCommitments(env, context),
        listSignupInboxActions(env, context),
      ]);
      return privateJson({ ok: true, signups, actions });
    }
    if (parts.length === 1 && request.method === 'GET')
      return privateJson({ ok: true, ...(await getSheet(env, context, parts[0])) });
    if (parts.length === 1 && request.method === 'PATCH')
      return privateJson(await updateSheet(request, env, context, parts[0]));
    if (parts.length === 1 && request.method === 'DELETE')
      return privateJson(await deleteSheet(env, context, parts[0]));
    if (parts.length === 2 && parts[1] === 'status' && request.method === 'PATCH')
      return privateJson(await updateSheetStatus(request, env, ctx, context, parts[0]));
    if (parts.length === 2 && parts[1] === 'slots' && request.method === 'POST')
      return privateJson(await addSlot(request, env, context, parts[0]), { status: 201 });
    if (parts.length === 2 && parts[1] === 'template' && request.method === 'POST')
      return privateJson(await saveSignupTemplate(request, env, context, parts[0]), { status: 201 });
    if (parts.length === 2 && parts[1] === 'history' && request.method === 'GET')
      return privateJson(await listSignupHistory(env, context, parts[0]));
    if (parts.length === 2 && parts[0] === 'slots' && request.method === 'PATCH')
      return privateJson(await updateSlot(request, env, context, parts[1]));
    if (parts.length === 2 && parts[0] === 'slots' && request.method === 'DELETE')
      return privateJson(await deleteSlot(env, context, parts[1]));
    if (parts.length === 3 && parts[0] === 'slots' && parts[2] === 'claim' && request.method === 'POST')
      return privateJson(await claimSignupSlot(request, env, ctx, context, parts[1]), { status: 201 });
    if (parts.length === 3 && parts[0] === 'slots' && parts[2] === 'waitlist' && request.method === 'POST')
      return privateJson(await joinSignupWaitlist(env, context, parts[1]), { status: 201 });
    if (parts.length === 3 && parts[0] === 'slots' && parts[2] === 'read' && request.method === 'POST')
      return privateJson(await markSlotRead(env, context, parts[1]));
    if (parts.length === 3 && parts[0] === 'entries' && parts[2] === 'cancel' && request.method === 'POST')
      return privateJson(await cancelEntry(env, ctx, context, parts[1]));
    if (parts.length === 3 && parts[0] === 'entries' && parts[2] === 'coverage' && request.method === 'POST')
      return privateJson(await requestSignupCoverage(request, env, ctx, context, parts[1]), { status: 201 });
    if (parts.length === 3 && parts[0] === 'coverage' && parts[2] === 'accept' && request.method === 'POST')
      return privateJson(await acceptSignupCoverage(env, ctx, context, parts[1]));
    if (parts.length === 3 && parts[0] === 'entries' && parts[2] === 'complete' && request.method === 'PATCH')
      return privateJson(await completeSignupEntry(request, env, ctx, context, parts[1]));
    return privateJson({ error: 'Method not allowed' }, { status: 405 });
  } catch (error) {
    return errorResponse(error);
  }
}
export {
  SignupAccessError,
  claimSignupSlot2 as claimSignupSlot,
  deleteSheet2 as deleteSheet,
  deleteSlot2 as deleteSlot,
  handleDonorKoinoniaSignups,
  listSignupInboxActions,
  listUpcomingSignupCommitments,
  requestSignupCoverage2 as requestSignupCoverage,
  sendScheduledSignupReminders,
  updateSheet2 as updateSheet,
  updateSlot2 as updateSlot,
};
