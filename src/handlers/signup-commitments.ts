import type {
  SignupEnvironment,
  SignupContext,
  SignupRow,
  SignupRequest,
} from './koinonia-signups-composition-contracts.js';

import { markContentRead } from '../lib/content-reads.js';

import { d1All, d1Batch, d1First, d1Run, generateSecret } from '../lib/core.js';

import '../lib/entitlements.js';

import { sendSignupReminderPush } from '../lib/push-notifications.js';

import './koinonia-access.js';

import './parish.js';
import { CONTENT_TYPE, SignupAccessError } from './koinonia-signups-shared.js';
import { database, auditSignup, requireMinistryManager, requireSheetManager } from './koinonia-signups-shared.js';
import './koinonia-signups.js';
import './signup-management.js';

export async function claimSignupSlot(
  request: Request,
  env: SignupEnvironment,
  ctx: Pick<ExecutionContext, 'waitUntil'> | null,
  context: SignupContext,
  slotId: string
) {
  const body = await (request.json().catch(() => ({})) as Promise<SignupRequest>);
  const comment = String(body.comment || '')
    .trim()
    .slice(0, 300);
  const slot = await d1First<SignupRow>(
    env,
    `
    SELECT slot.*, sheet.status AS sheet_status, sheet.title AS sheet_title,
      sheet.parish_id AS sheet_parish_id, ministry.display_name AS ministry_name
    FROM koinonia_signup_slots slot
    JOIN koinonia_signup_sheets sheet ON sheet.id = slot.sheet_id
    JOIN directory_ministries ministry ON ministry.id = sheet.ministry_id
    WHERE slot.id = ?1 AND slot.parish_id = ?2
  `,
    slotId,
    context.parishId
  );
  if (!slot || slot.sheet_parish_id !== context.parishId) throw new SignupAccessError('Slot not found.', 404);
  if (slot.sheet_status !== 'open') throw new SignupAccessError('This signup sheet is not currently open.', 409);
  if (slot.slot_date != null) {
    const conflict = await d1First<SignupRow>(
      env,
      `SELECT other.id,s.title,other.slot_date FROM koinonia_signup_entries e JOIN koinonia_signup_slots other ON other.id=e.slot_id JOIN koinonia_signup_sheets s ON s.id=other.sheet_id WHERE e.parish_id=? AND e.person_id=? AND e.status='confirmed' AND other.id<>? AND other.slot_date IS NOT NULL AND ABS(other.slot_date-?)<7200000 LIMIT 1`,
      context.parishId,
      context.personId,
      slotId,
      Number(slot.slot_date)
    );
    if (conflict) throw new SignupAccessError(`This overlaps with your commitment to ${conflict.title}.`, 409);
  }
  const existing = await d1First<SignupRow>(
    env,
    `
    SELECT id FROM koinonia_signup_entries
    WHERE slot_id = ?1 AND person_id = ?2 AND status = 'confirmed'
  `,
    slotId,
    context.personId
  );
  if (existing) throw new SignupAccessError("You've already signed up for this slot.", 409);
  const now = Date.now();
  const id = generateSecret('koinonia_entry');
  let result;
  try {
    result = await d1Run(
      env,
      `
      INSERT INTO koinonia_signup_entries
        (id, slot_id, parish_id, household_id, person_id, comment, status, created_at, updated_at)
      SELECT ?1, slot.id, ?2, ?3, ?4, ?5, 'confirmed', ?6, ?6
      FROM koinonia_signup_slots slot
      WHERE slot.id = ?7 AND slot.parish_id = ?2
        AND (SELECT COUNT(*) FROM koinonia_signup_entries entry
             WHERE entry.slot_id = slot.id AND entry.status = 'confirmed') < slot.needed_count
    `,
      id,
      context.parishId,
      context.householdId || null,
      context.personId,
      comment,
      now,
      slotId
    );
  } catch {
    throw new SignupAccessError("You've already signed up for this slot.", 409);
  }
  if (Number(result?.meta?.changes || 0) !== 1) throw new SignupAccessError('This slot is already full.', 409);
  await d1Run(
    env,
    `
    UPDATE koinonia_signup_waitlist SET status = 'claimed', updated_at = ?1
    WHERE parish_id = ?2 AND slot_id = ?3 AND person_id = ?4 AND status IN ('waiting', 'offered')
  `,
    now,
    context.parishId,
    slotId,
    context.personId
  );
  await auditSignup(env, context, { sheetId: slot.sheet_id, slotId, action: 'slot_claimed', summary: slot.label });
  if (ctx?.waitUntil) {
    ctx.waitUntil(
      sendSignupReminderPush(env, {
        parishId: context.parishId,
        personId: context.personId,
        sheetId: slot.sheet_id,
        sheetTitle: slot.sheet_title,
        slotLabel: slot.label,
        slotDate: slot.slot_date == null ? null : Number(slot.slot_date),
        ministryName: slot.ministry_name,
      })
        .then((summary) =>
          console.log(
            'signup_push_delivery',
            JSON.stringify({ parishId: context.parishId, slotId, entryId: id, ...summary })
          )
        )
        .catch((error: unknown) =>
          console.error(
            'signup_push_delivery_failed',
            (error as { message?: unknown } | null)?.message || String(error)
          )
        )
    );
  }
  return { ok: true, entryId: id };
}
export async function cancelEntry(
  env: SignupEnvironment,
  ctx: Pick<ExecutionContext, 'waitUntil'> | null,
  context: SignupContext,
  entryId: string
) {
  const entry = await d1First<SignupRow>(
    env,
    `
    SELECT entry.*, slot.sheet_id, slot.label, slot.slot_date, sheet.title sheet_title,
      ministry.display_name ministry_name
    FROM koinonia_signup_entries entry
    JOIN koinonia_signup_slots slot ON slot.id = entry.slot_id
    JOIN koinonia_signup_sheets sheet ON sheet.id = slot.sheet_id
    JOIN directory_ministries ministry ON ministry.id = sheet.ministry_id
    WHERE entry.id = ?1 AND entry.parish_id = ?2
  `,
    entryId,
    context.parishId
  );
  if (!entry) throw new SignupAccessError('Signup entry not found.', 404);
  if (entry.person_id !== context.personId) throw new SignupAccessError('You can only cancel your own signup.', 403);
  const cancelledAt = Date.now();
  await d1Batch(env, [
    {
      sql: `UPDATE koinonia_signup_entries SET status = 'cancelled', updated_at = ?1 WHERE id = ?2 AND parish_id = ?3 AND status = 'confirmed'`,
      params: [cancelledAt, entryId, context.parishId],
    },
    {
      sql: `UPDATE koinonia_signup_coverage_requests SET status = 'cancelled', updated_at = ?1 WHERE entry_id = ?2 AND parish_id = ?3 AND status = 'open'`,
      params: [cancelledAt, entryId, context.parishId],
    },
  ]);
  await auditSignup(env, context, {
    sheetId: entry.sheet_id,
    slotId: entry.slot_id,
    action: 'signup_cancelled',
    summary: entry.label,
  });
  const waiting = await d1First<SignupRow>(
    env,
    "SELECT * FROM koinonia_signup_waitlist WHERE parish_id=? AND slot_id=? AND status='waiting' ORDER BY created_at LIMIT 1",
    context.parishId,
    entry.slot_id
  );
  if (waiting) {
    await d1Run(
      env,
      "UPDATE koinonia_signup_waitlist SET status='offered',updated_at=? WHERE id=?",
      Date.now(),
      waiting.id
    );
    if (ctx?.waitUntil)
      ctx.waitUntil(
        sendSignupReminderPush(env, {
          parishId: context.parishId,
          personId: waiting.person_id,
          sheetId: entry.sheet_id,
          sheetTitle: entry.sheet_title,
          slotLabel: entry.label,
          slotDate: entry.slot_date,
          ministryName: entry.ministry_name,
          reminderLabel: 'A signup spot opened',
        }).catch((error: unknown) =>
          console.error(
            'signup_waitlist_push_failed',
            (error as { message?: unknown } | null)?.message || String(error)
          )
        )
      );
  }
  return { ok: true };
}
export async function markSlotRead(env: SignupEnvironment, context: SignupContext, slotId: string) {
  const slot = await d1First<SignupRow>(
    env,
    `
    SELECT slot.id, sheet.status,
      (EXISTS (
        SELECT 1 FROM directory_ministry_leaders leader
        WHERE leader.parish_id = sheet.parish_id AND leader.ministry_id = sheet.ministry_id
          AND leader.person_id = ?3 AND leader.active = 1
      ) OR EXISTS (
        SELECT 1 FROM directory_ministry_participants participant
        WHERE participant.parish_id = sheet.parish_id AND participant.ministry_id = sheet.ministry_id
          AND participant.person_id = ?3 AND participant.status = 'active'
      )) AS can_manage
    FROM koinonia_signup_slots slot
    JOIN koinonia_signup_sheets sheet ON sheet.id = slot.sheet_id
    WHERE slot.id = ?1 AND slot.parish_id = ?2
  `,
    slotId,
    context.parishId,
    context.personId
  );
  if (!slot || (!['open', 'closed'].includes(slot.status) && Number(slot.can_manage || 0) !== 1)) {
    throw new SignupAccessError('Slot not found.', 404);
  }
  await markContentRead(database(env)!, {
    parishId: context.parishId,
    contentType: CONTENT_TYPE,
    contentId: slotId,
    donorId: context.donorId,
  });
  return { ok: true };
}
export async function joinSignupWaitlist(env: SignupEnvironment, context: SignupContext, slotId: string) {
  const slot = await d1First<SignupRow>(
    env,
    `SELECT slot.id,slot.sheet_id,slot.label,s.ministry_id FROM koinonia_signup_slots slot JOIN koinonia_signup_sheets s ON s.id=slot.sheet_id WHERE slot.id=? AND slot.parish_id=? AND s.status='open'`,
    slotId,
    context.parishId
  );
  if (!slot) throw new SignupAccessError('Slot not found.', 404);
  const id = generateSecret('signup_waitlist'),
    now = Date.now();
  try {
    await d1Run(
      env,
      "INSERT INTO koinonia_signup_waitlist(id,parish_id,slot_id,person_id,status,created_at,updated_at) VALUES(?,?,?,?,'waiting',?,?)",
      id,
      context.parishId,
      slotId,
      context.personId,
      now,
      now
    );
  } catch {
    throw new SignupAccessError('You are already on this waitlist.', 409);
  }
  await auditSignup(env, context, { sheetId: slot.sheet_id, slotId, action: 'waitlist_joined', summary: slot.label });
  return { ok: true, waitlistId: id };
}

export async function requestSignupCoverage(
  request: Request,
  env: SignupEnvironment,
  ctx: Pick<ExecutionContext, 'waitUntil'> | null,
  context: SignupContext,
  entryId: string
) {
  const entry = await d1First<SignupRow>(
    env,
    `
    SELECT entry.id, entry.slot_id, slot.sheet_id, slot.label, slot.slot_date,
      sheet.title, sheet.ministry_id, ministry.display_name AS ministry_name
    FROM koinonia_signup_entries entry
    JOIN koinonia_signup_slots slot ON slot.id = entry.slot_id
    JOIN koinonia_signup_sheets sheet ON sheet.id = slot.sheet_id
    JOIN directory_ministries ministry ON ministry.id = sheet.ministry_id
    WHERE entry.id = ?1 AND entry.parish_id = ?2 AND entry.person_id = ?3 AND entry.status = 'confirmed'
  `,
    entryId,
    context.parishId,
    context.personId
  );
  if (!entry) throw new SignupAccessError('Commitment not found.', 404);
  const body = await (request.json().catch(() => ({})) as Promise<SignupRequest>);
  const note = String(body.note || '')
    .trim()
    .slice(0, 300);
  if (note.length < 5)
    throw new SignupAccessError('Please include a short reason so your ministry team knows how to help.', 400);
  const now = Date.now();
  const existing = await d1First<SignupRow>(
    env,
    `SELECT id FROM koinonia_signup_coverage_requests WHERE parish_id = ?1 AND entry_id = ?2 AND status = 'open'`,
    context.parishId,
    entryId
  );
  const id = existing?.id || generateSecret('signup_coverage');
  if (existing) {
    await d1Run(
      env,
      `UPDATE koinonia_signup_coverage_requests SET note = ?1, updated_at = ?2 WHERE id = ?3 AND parish_id = ?4 AND status = 'open'`,
      note,
      now,
      id,
      context.parishId
    );
  } else {
    await d1Run(
      env,
      `INSERT INTO koinonia_signup_coverage_requests(id,parish_id,entry_id,requester_person_id,status,note,created_at,updated_at) VALUES(?1,?2,?3,?4,'open',?5,?6,?6)`,
      id,
      context.parishId,
      entryId,
      context.personId,
      note,
      now
    );
  }
  const recipients = await d1All<SignupRow>(
    env,
    `
    SELECT DISTINCT person_id FROM (
      SELECT person_id FROM directory_ministry_leaders WHERE parish_id = ?1 AND ministry_id = ?2 AND active = 1
      UNION
      SELECT person_id FROM directory_ministry_participants WHERE parish_id = ?1 AND ministry_id = ?2 AND status = 'active'
    ) WHERE person_id <> ?3
  `,
    context.parishId,
    entry.ministry_id,
    context.personId
  );
  await auditSignup(env, context, {
    sheetId: entry.sheet_id,
    slotId: entry.slot_id,
    action: existing ? 'coverage_request_updated' : 'coverage_requested',
    summary: entry.label,
  });
  if (ctx?.waitUntil && recipients.length) {
    ctx.waitUntil(
      Promise.all(
        recipients.map(({ person_id: personId }) =>
          sendSignupReminderPush(env, {
            parishId: context.parishId,
            personId,
            sheetId: entry.sheet_id,
            sheetTitle: entry.title,
            slotLabel: entry.label,
            slotDate: entry.slot_date == null ? null : Number(entry.slot_date),
            ministryName: entry.ministry_name,
            reminderLabel: 'Coverage requested',
          })
        )
      ).catch((error: unknown) =>
        console.error(
          'signup_coverage_request_push_failed',
          (error as { message?: unknown } | null)?.message || String(error)
        )
      )
    );
  }
  return { ok: true, coverageRequestId: id, recipientCount: recipients.length };
}
export async function acceptSignupCoverage(
  env: SignupEnvironment,
  ctx: Pick<ExecutionContext, 'waitUntil'> | null,
  context: SignupContext,
  requestId: string
) {
  const request = await d1First<SignupRow>(
    env,
    `SELECT coverage.*,entry.slot_id,slot.sheet_id,slot.label,slot.slot_date,s.title,s.ministry_id,m.display_name ministry_name FROM koinonia_signup_coverage_requests coverage JOIN koinonia_signup_entries entry ON entry.id=coverage.entry_id AND entry.status='confirmed' JOIN koinonia_signup_slots slot ON slot.id=entry.slot_id JOIN koinonia_signup_sheets s ON s.id=slot.sheet_id JOIN directory_ministries m ON m.id=s.ministry_id WHERE coverage.id=? AND coverage.parish_id=? AND coverage.status='open'`,
    requestId,
    context.parishId
  );
  if (!request) throw new SignupAccessError('Coverage request is no longer available.', 404);
  if (request.requester_person_id === context.personId)
    throw new SignupAccessError('You already own this commitment.', 409);
  await requireMinistryManager(env, {
    parishId: context.parishId,
    ministryId: request.ministry_id,
    personId: context.personId,
  });
  if (request.slot_date != null) {
    const conflict = await d1First<SignupRow>(
      env,
      `SELECT s.title FROM koinonia_signup_entries e JOIN koinonia_signup_slots slot ON slot.id=e.slot_id JOIN koinonia_signup_sheets s ON s.id=slot.sheet_id WHERE e.parish_id=? AND e.person_id=? AND e.status='confirmed' AND e.id<>? AND slot.slot_date IS NOT NULL AND ABS(slot.slot_date-?)<7200000 LIMIT 1`,
      context.parishId,
      context.personId,
      request.entry_id,
      Number(request.slot_date)
    );
    if (conflict) throw new SignupAccessError(`This overlaps with your commitment to ${conflict.title}.`, 409);
  }
  const now = Date.now();
  try {
    await d1Batch(env, [
      {
        sql: "UPDATE koinonia_signup_entries SET person_id=?,household_id=?,updated_at=? WHERE id=? AND parish_id=? AND status='confirmed'",
        params: [context.personId, context.householdId || null, now, request.entry_id, context.parishId],
      },
      {
        sql: "UPDATE koinonia_signup_coverage_requests SET replacement_person_id=?,status='accepted',updated_at=? WHERE id=? AND parish_id=? AND status='open'",
        params: [context.personId, now, requestId, context.parishId],
      },
      {
        sql: "UPDATE koinonia_signup_waitlist SET status='claimed',updated_at=? WHERE slot_id=? AND person_id=? AND status IN ('waiting','offered')",
        params: [now, request.slot_id, context.personId],
      },
    ]);
  } catch {
    throw new SignupAccessError('This coverage request was just taken or conflicts with another signup.', 409);
  }
  await auditSignup(env, context, {
    sheetId: request.sheet_id,
    slotId: request.slot_id,
    action: 'coverage_accepted',
    summary: request.label,
  });
  if (ctx?.waitUntil) {
    const notifications = [
      sendSignupReminderPush(env, {
        parishId: context.parishId,
        personId: request.requester_person_id,
        sheetId: request.sheet_id,
        sheetTitle: request.title,
        slotLabel: request.label,
        slotDate: Number(request.slot_date) || null,
        ministryName: request.ministry_name,
        reminderLabel: 'Coverage found',
      }),
      sendSignupReminderPush(env, {
        parishId: context.parishId,
        personId: context.personId,
        sheetId: request.sheet_id,
        sheetTitle: request.title,
        slotLabel: request.label,
        slotDate: Number(request.slot_date) || null,
        ministryName: request.ministry_name,
        reminderLabel: 'Serving commitment confirmed',
      }),
    ];
    ctx.waitUntil(
      Promise.all(notifications).catch((error: unknown) =>
        console.error('signup_coverage_push_failed', (error as { message?: unknown } | null)?.message || String(error))
      )
    );
  }
  return { ok: true, entryId: request.entry_id };
}
export async function completeSignupEntry(
  request: Request,
  env: SignupEnvironment,
  ctx: Pick<ExecutionContext, 'waitUntil'> | null,
  context: SignupContext,
  entryId: string
) {
  const e = await d1First<SignupRow>(
    env,
    `SELECT e.id,e.person_id,slot.id slot_id,slot.sheet_id,slot.label,slot.slot_date,s.title,m.display_name ministry_name FROM koinonia_signup_entries e JOIN koinonia_signup_slots slot ON slot.id=e.slot_id JOIN koinonia_signup_sheets s ON s.id=slot.sheet_id JOIN directory_ministries m ON m.id=s.ministry_id WHERE e.id=? AND e.parish_id=?`,
    entryId,
    context.parishId
  );
  if (!e) throw new SignupAccessError('Commitment not found.', 404);
  await requireSheetManager(env, context, e.sheet_id);
  const b = await (request.json().catch(() => ({})) as Promise<SignupRequest>),
    now = Date.now(),
    sendThanks = b.sendThanks !== false;
  await d1Run(
    env,
    `INSERT INTO koinonia_signup_service_records(entry_id,parish_id,completed,attended,completed_by_person_id,completed_at,thanked_at) VALUES(?,?,1,?,?,?,?) ON CONFLICT(entry_id) DO UPDATE SET completed=1,attended=excluded.attended,completed_by_person_id=excluded.completed_by_person_id,completed_at=excluded.completed_at,thanked_at=excluded.thanked_at`,
    entryId,
    context.parishId,
    b.attended === false ? 0 : 1,
    context.personId,
    now,
    sendThanks ? now : null
  );
  await auditSignup(env, context, {
    sheetId: e.sheet_id,
    slotId: e.slot_id,
    action: 'service_completed',
    summary: sendThanks ? 'Completed and thanked' : 'Completed',
  });
  if (sendThanks && ctx?.waitUntil)
    ctx.waitUntil(
      sendSignupReminderPush(env, {
        parishId: context.parishId,
        personId: e.person_id,
        sheetId: e.sheet_id,
        sheetTitle: e.title,
        slotLabel: e.label,
        slotDate: Number(e.slot_date) || null,
        ministryName: e.ministry_name,
        reminderLabel: 'Thank you for serving',
      }).catch((error: unknown) =>
        console.error('signup_thank_you_push_failed', (error as { message?: unknown } | null)?.message || String(error))
      )
    );
  return { ok: true };
}

export async function sendScheduledSignupReminders(env: SignupEnvironment, asOf: number = Date.now()) {
  if (!database(env)) return { sent: 0 };
  const entries = await d1All<SignupRow>(
    env,
    `SELECT e.id entry_id,e.parish_id,e.person_id,slot.slot_date,slot.label,s.id sheet_id,s.title,m.display_name ministry_name FROM koinonia_signup_entries e JOIN koinonia_signup_slots slot ON slot.id=e.slot_id JOIN koinonia_signup_sheets s ON s.id=slot.sheet_id JOIN directory_ministries m ON m.id=s.ministry_id WHERE e.status='confirmed' AND s.status IN ('open','closed') AND slot.slot_date BETWEEN ? AND ?`,
    asOf,
    asOf + 7 * 86400000 + 3600000
  );
  let sent = 0;
  for (const e of entries) {
    const delta = e.slot_date - asOf;
    const type = delta <= 36 * 3600000 ? 'one_day' : 'one_week';
    const exists = await d1First<SignupRow>(
      env,
      'SELECT 1 found FROM koinonia_signup_notification_log WHERE entry_id=? AND notification_type=?',
      e.entry_id,
      type
    );
    if (exists) continue;
    await sendSignupReminderPush(env, {
      parishId: e.parish_id,
      personId: e.person_id,
      sheetId: e.sheet_id,
      sheetTitle: e.title,
      slotLabel: e.label,
      slotDate: Number(e.slot_date),
      ministryName: e.ministry_name,
      reminderLabel: type === 'one_day' ? 'Serving tomorrow' : 'Upcoming signup',
    });
    await d1Run(
      env,
      'INSERT INTO koinonia_signup_notification_log(entry_id,notification_type,sent_at) VALUES(?,?,?)',
      e.entry_id,
      type,
      asOf
    );
    sent += 1;
  }
  return { sent };
}
