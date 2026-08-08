import { getReadContentIds, markContentRead } from "../lib/content-reads.js";
import {
  d1All,
  d1Batch,
  d1First,
  d1Run,
  generateSecret,
  hasProductionStore,
  json,
  missingProductionStoreResponse,
  rateLimit,
} from "../lib/core.js";
import { signupsEnabledFor } from "../lib/entitlements.js";
import { sendSignupReminderPush } from "../lib/push-notifications.js";
import { verifiedHouseholdAccess } from "./koinonia-access.js";
import { findRegistrationByParishId } from "./parish.js";

const CONTENT_TYPE = "signup_slot";
const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "Vary": "Authorization, X-AGAPAY-Donor-Email",
};
const SHEET_CATEGORIES = new Set(["meal_train", "cleaning", "event", "volunteer", "general"]);
const SHEET_STATUSES = new Set(["draft", "open", "closed", "archived"]);

export class SignupAccessError extends Error {
  constructor(message = "You don't have access to manage this signup sheet.", status = 403) {
    super(message);
    this.name = "SignupAccessError";
    this.status = status;
  }
}

function privateJson(payload, init = {}) {
  return json(payload, { ...init, headers: { ...PRIVATE_HEADERS, ...(init.headers || {}) } });
}

function database(env) {
  return env.AGAPAY_DB || env.DB || null;
}
async function auditSignup(env,context,{sheetId=null,slotId=null,action,summary=""}){await d1Run(env,"INSERT INTO koinonia_signup_activity(id,parish_id,sheet_id,slot_id,actor_person_id,action,summary,created_at) VALUES(?,?,?,?,?,?,?,?)",generateSecret("signup_activity"),context.parishId,sheetId,slotId,context.personId,action,String(summary).slice(0,500),Date.now());}

function sheetFromRow(row = {}) {
  return {
    id: row.id || "",
    parishId: row.parish_id || "",
    ministryId: row.ministry_id || "",
    ministryName: row.ministry_name || "",
    title: row.title || "",
    description: row.description || "",
    category: row.category || "general",
    status: row.status || "draft",
    visibility: row.visibility || "parish_members",
    canManage: Number(row.can_manage || 0) === 1,
    slotCount: Number(row.slot_count || 0),
    openingCount: Number(row.opening_count || 0),
    unreadSlotCount: Number(row.unread_slot_count || 0),
    createdAt: Number(row.created_at || 0),
    updatedAt: Number(row.updated_at || 0),
  };
}

function slotFromRow(row = {}) {
  return {
    id: row.id || "",
    sheetId: row.sheet_id || "",
    label: row.label || "",
    notes: row.notes || "",
    neededCount: Number(row.needed_count || 1),
    filledCount: Number(row.filled_count || 0),
    slotDate: row.slot_date == null ? null : Number(row.slot_date),
    displayOrder: Number(row.display_order || 100),
    read: Boolean(row.read),
  };
}

function entryFromRow(row = {}) {
  return {
    id: row.id || "",
    slotId: row.slot_id || "",
    personId: row.person_id || "",
    personName: row.person_name || "Parish member",
    comment: row.comment || "",
    mine: Boolean(row.mine),
    completed: Number(row.completed || 0) === 1,
    attended: row.attended == null ? null : Number(row.attended) === 1,
    thanked: row.thanked_at != null,
    createdAt: Number(row.created_at || 0),
  };
}

async function featureContext(request, env) {
  const access = await verifiedHouseholdAccess(request, env);
  if (access.response) return access;
  const found = await findRegistrationByParishId(env, access.context.parishId);
  if (!found?.registration || !signupsEnabledFor(found.registration)) {
    return {
      context: null,
      response: privateJson({ error: "Koinonia Signups are not available for this parish." }, { status: 403 }),
    };
  }
  return access;
}

async function ministryManagerRow(env, { parishId, ministryId, personId }) {
  return d1First(env, `
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
  `, parishId, ministryId, personId);
}

async function requireMinistryManager(env, values) {
  const row = await ministryManagerRow(env, values);
  if (!row) throw new SignupAccessError("Only people assigned to this ministry can manage its signup forms.");
  return row;
}

async function requireSheetManager(env, context, sheetId) {
  const sheet = await d1First(env, `
    SELECT * FROM koinonia_signup_sheets WHERE id = ?1 AND parish_id = ?2
  `, sheetId, context.parishId);
  if (!sheet) throw new SignupAccessError("Signup sheet not found.", 404);
  await requireMinistryManager(env, {
    parishId: context.parishId,
    ministryId: sheet.ministry_id,
    personId: context.personId,
  });
  return sheet;
}

async function listManagedMinistries(env, context) {
  const rows = await d1All(env, `
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
  `, context.parishId, context.personId);
  return rows.map((row) => ({ id: row.id, name: row.display_name || "Ministry", category: row.category || "other" }));
}

async function listSheets(env, context) {
  const rows = await d1All(env, `
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
  `, context.parishId, context.personId);
  const slotRows = rows.length ? await d1All(env, `
    SELECT id, sheet_id FROM koinonia_signup_slots
    WHERE parish_id = ?1 AND sheet_id IN (${rows.map((_, index) => `?${index + 2}`).join(", ")})
  `, context.parishId, ...rows.map(({ id }) => id)) : [];
  const readIds = await getReadContentIds(database(env), {
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

async function getSheet(env, context, sheetId) {
  const sheet = await d1First(env, `
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
  `, sheetId, context.parishId, context.personId);
  if (!sheet || (!["open", "closed"].includes(sheet.status) && Number(sheet.can_manage || 0) !== 1)) {
    throw new SignupAccessError("Signup sheet not found.", 404);
  }
  const slotRows = await d1All(env, `
    SELECT slot.*, (
      SELECT COUNT(*) FROM koinonia_signup_entries entry
      WHERE entry.slot_id = slot.id AND entry.status = 'confirmed'
    ) AS filled_count
    FROM koinonia_signup_slots slot
    WHERE slot.sheet_id = ?1 AND slot.parish_id = ?2
    ORDER BY slot.display_order ASC, slot.slot_date ASC, slot.created_at ASC
  `, sheetId, context.parishId);
  const readIds = await getReadContentIds(database(env), {
    parishId: context.parishId,
    contentType: CONTENT_TYPE,
    donorId: context.donorId,
    contentIds: slotRows.map(({ id }) => id),
  });
  const readSet = new Set(readIds);
  const slots = await Promise.all(slotRows.map(async (row) => {
    const entries = await d1All(env, `
      SELECT entry.*, person.preferred_name AS person_name,
        service.completed, service.attended, service.thanked_at
      FROM koinonia_signup_entries entry
      LEFT JOIN directory_people person ON person.id = entry.person_id
      LEFT JOIN koinonia_signup_service_records service ON service.entry_id = entry.id
      WHERE entry.slot_id = ?1 AND entry.parish_id = ?2 AND entry.status = 'confirmed'
      ORDER BY entry.created_at ASC
    `, row.id, context.parishId);
    return {
      ...slotFromRow({ ...row, read: readSet.has(row.id) }),
      entries: entries.map((entry) => entryFromRow({ ...entry, mine: entry.person_id === context.personId })),
    };
  }));
  return { sheet: sheetFromRow(sheet), slots };
}

export async function listUpcomingSignupCommitments(env, context, currentTime = Date.now()) {
  const windowEnd = currentTime + (7 * 24 * 60 * 60 * 1000);
  const rows = await d1All(env, `
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
  `, context.parishId, context.personId, currentTime, windowEnd);
  return rows.map((row) => ({
    entryId: row.entry_id,
    sheetId: row.sheet_id,
    sheetTitle: row.sheet_title,
    ministryName: row.ministry_name || "",
    slotId: row.slot_id,
    label: row.label || "",
    notes: row.notes || "",
    slotDate: Number(row.slot_date),
  }));
}

async function createSheet(request, env, context) {
  const body = await request.json().catch(() => ({}));
  const ministryId = String(body.ministryId || "").trim();
  const title = String(body.title || "").trim().slice(0, 180);
  const category = SHEET_CATEGORIES.has(body.category) ? body.category : "general";
  const description = String(body.description || "").trim().slice(0, 2000);
  if (!ministryId || !title) throw new SignupAccessError("Ministry and title are required.", 422);
  await requireMinistryManager(env, { parishId: context.parishId, ministryId, personId: context.personId });
  const now = Date.now();
  const id = generateSecret("koinonia_sheet");
  await d1Run(env, `
    INSERT INTO koinonia_signup_sheets
      (id, parish_id, ministry_id, title, description, category, status, visibility,
       created_by_person_id, updated_by_person_id, created_at, updated_at, revision)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'draft', 'parish_members', ?7, ?7, ?8, ?8, 1)
  `, id, context.parishId, ministryId, title, description, category, context.personId, now);
  await auditSignup(env,context,{sheetId:id,action:"sheet_created",summary:title});
  return { ok: true, sheetId: id };
}

async function updateSheetStatus(request, env, context, sheetId) {
  await requireSheetManager(env, context, sheetId);
  const body = await request.json().catch(() => ({}));
  if (!SHEET_STATUSES.has(body.status)) throw new SignupAccessError("Invalid status.", 422);
  const now = Date.now();
  await d1Run(env, `
    UPDATE koinonia_signup_sheets
    SET status = ?1, archived_at = CASE WHEN ?1 = 'archived' THEN ?2 ELSE NULL END,
        updated_by_person_id = ?3, updated_at = ?2, revision = revision + 1
    WHERE id = ?4 AND parish_id = ?5
  `, body.status, now, context.personId, sheetId, context.parishId);
  await auditSignup(env, context, { sheetId, action: "status_changed", summary: body.status });
  return { ok: true, sheetId, status: body.status };
}

export async function updateSheet(request, env, context, sheetId) {
  await requireSheetManager(env, context, sheetId);
  const body = await request.json().catch(() => ({}));
  const title = String(body.title || "").trim().slice(0, 180);
  const category = SHEET_CATEGORIES.has(body.category) ? body.category : "general";
  const description = String(body.description || "").trim().slice(0, 2000);
  if (!title) throw new SignupAccessError("Signup title is required.", 422);
  await d1Run(env, `
    UPDATE koinonia_signup_sheets
    SET title = ?1, category = ?2, description = ?3, updated_by_person_id = ?4,
        updated_at = ?5, revision = revision + 1
    WHERE id = ?6 AND parish_id = ?7
  `, title, category, description, context.personId, Date.now(), sheetId, context.parishId);
  await auditSignup(env, context, { sheetId, action: "sheet_edited", summary: title });
  return { ok: true, sheetId };
}

export async function deleteSheet(env, context, sheetId) {
  await requireSheetManager(env, context, sheetId);
  const confirmed = await d1First(env, `
    SELECT COUNT(*) AS count
    FROM koinonia_signup_entries entry
    JOIN koinonia_signup_slots slot ON slot.id = entry.slot_id
    WHERE slot.sheet_id = ?1 AND entry.parish_id = ?2 AND entry.status = 'confirmed'
  `, sheetId, context.parishId);
  if (Number(confirmed?.count || 0) > 0) {
    throw new SignupAccessError("This signup has confirmed commitments. Close or archive it instead of deleting it.", 409);
  }
  await d1Run(env, "DELETE FROM koinonia_signup_sheets WHERE id = ?1 AND parish_id = ?2", sheetId, context.parishId);
  await auditSignup(env, context, { sheetId, action: "sheet_deleted" });
  return { ok: true, sheetId };
}

async function addSlot(request, env, context, sheetId) {
  await requireSheetManager(env, context, sheetId);
  const body = await request.json().catch(() => ({}));
  const label = String(body.label || "").trim().slice(0, 180);
  const neededCount = Number(body.neededCount ?? 1);
  const slotDate = body.slotDate == null || body.slotDate === "" ? null : Number(body.slotDate);
  const notes = String(body.notes || "").trim().slice(0, 500);
  const displayOrder = Number.isFinite(Number(body.displayOrder)) ? Math.trunc(Number(body.displayOrder)) : 100;
  if (!label) throw new SignupAccessError("Slot label is required.", 422);
  if (!Number.isInteger(neededCount) || neededCount < 1 || neededCount > 100) throw new SignupAccessError("Needed count must be between 1 and 100.", 422);
  if (slotDate != null && (!Number.isFinite(slotDate) || slotDate < 0)) throw new SignupAccessError("Slot date is invalid.", 422);
  const now = Date.now();
  const id = generateSecret("koinonia_slot");
  await d1Run(env, `
    INSERT INTO koinonia_signup_slots
      (id, sheet_id, parish_id, label, notes, needed_count, slot_date, display_order, created_at, updated_at, revision)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9, 1)
  `, id, sheetId, context.parishId, label, notes, neededCount, slotDate, displayOrder, now);
  await auditSignup(env, context, { sheetId, slotId: id, action: "slot_added", summary: label });
  return { ok: true, slotId: id };
}

async function requireSlotManager(env, context, slotId) {
  const slot = await d1First(env, `
    SELECT slot.*, sheet.ministry_id
    FROM koinonia_signup_slots slot
    JOIN koinonia_signup_sheets sheet ON sheet.id = slot.sheet_id AND sheet.parish_id = slot.parish_id
    WHERE slot.id = ?1 AND slot.parish_id = ?2
  `, slotId, context.parishId);
  if (!slot) throw new SignupAccessError("Signup slot not found.", 404);
  await requireMinistryManager(env, { parishId: context.parishId, ministryId: slot.ministry_id, personId: context.personId });
  return slot;
}

export async function updateSlot(request, env, context, slotId) {
  const managedSlot = await requireSlotManager(env, context, slotId);
  const body = await request.json().catch(() => ({}));
  const label = String(body.label || "").trim().slice(0, 180);
  const notes = String(body.notes || "").trim().slice(0, 500);
  const neededCount = Number(body.neededCount ?? 1);
  const slotDate = body.slotDate == null || body.slotDate === "" ? null : Number(body.slotDate);
  if (!label) throw new SignupAccessError("Slot label is required.", 422);
  if (!Number.isInteger(neededCount) || neededCount < 1 || neededCount > 100) throw new SignupAccessError("People needed must be between 1 and 100.", 422);
  if (slotDate != null && (!Number.isFinite(slotDate) || slotDate < 0)) throw new SignupAccessError("Slot date is invalid.", 422);
  const confirmed = await d1First(env, "SELECT COUNT(*) AS count FROM koinonia_signup_entries WHERE slot_id = ?1 AND status = 'confirmed'", slotId);
  if (neededCount < Number(confirmed?.count || 0)) throw new SignupAccessError("People needed cannot be lower than the number already signed up.", 409);
  await d1Run(env, `
    UPDATE koinonia_signup_slots
    SET label = ?1, notes = ?2, needed_count = ?3, slot_date = ?4,
        updated_at = ?5, revision = revision + 1
    WHERE id = ?6 AND parish_id = ?7
  `, label, notes, neededCount, slotDate, Date.now(), slotId, context.parishId);
  await auditSignup(env, context, { sheetId: managedSlot.sheet_id, slotId, action: "slot_edited", summary: label });
  return { ok: true, slotId };
}

export async function deleteSlot(env, context, slotId) {
  const managedSlot = await requireSlotManager(env, context, slotId);
  const confirmed = await d1First(env, "SELECT COUNT(*) AS count FROM koinonia_signup_entries WHERE slot_id = ?1 AND status = 'confirmed'", slotId);
  if (Number(confirmed?.count || 0) > 0) throw new SignupAccessError("This slot has confirmed commitments and cannot be deleted.", 409);
  await d1Run(env, "DELETE FROM koinonia_signup_slots WHERE id = ?1 AND parish_id = ?2", slotId, context.parishId);
  await auditSignup(env, context, { sheetId: managedSlot.sheet_id, slotId, action: "slot_deleted", summary: managedSlot.label });
  return { ok: true, slotId };
}

export async function claimSignupSlot(request, env, ctx, context, slotId) {
  const body = await request.json().catch(() => ({}));
  const comment = String(body.comment || "").trim().slice(0, 300);
  const slot = await d1First(env, `
    SELECT slot.*, sheet.status AS sheet_status, sheet.title AS sheet_title,
      sheet.parish_id AS sheet_parish_id, ministry.display_name AS ministry_name
    FROM koinonia_signup_slots slot
    JOIN koinonia_signup_sheets sheet ON sheet.id = slot.sheet_id
    JOIN directory_ministries ministry ON ministry.id = sheet.ministry_id
    WHERE slot.id = ?1 AND slot.parish_id = ?2
  `, slotId, context.parishId);
  if (!slot || slot.sheet_parish_id !== context.parishId) throw new SignupAccessError("Slot not found.", 404);
  if (slot.sheet_status !== "open") throw new SignupAccessError("This signup sheet is not currently open.", 409);
  if(slot.slot_date!=null){const conflict=await d1First(env,`SELECT other.id,s.title,other.slot_date FROM koinonia_signup_entries e JOIN koinonia_signup_slots other ON other.id=e.slot_id JOIN koinonia_signup_sheets s ON s.id=other.sheet_id WHERE e.parish_id=? AND e.person_id=? AND e.status='confirmed' AND other.id<>? AND other.slot_date IS NOT NULL AND ABS(other.slot_date-?)<7200000 LIMIT 1`,context.parishId,context.personId,slotId,Number(slot.slot_date));if(conflict)throw new SignupAccessError(`This overlaps with your commitment to ${conflict.title}.`,409);}
  const existing = await d1First(env, `
    SELECT id FROM koinonia_signup_entries
    WHERE slot_id = ?1 AND person_id = ?2 AND status = 'confirmed'
  `, slotId, context.personId);
  if (existing) throw new SignupAccessError("You've already signed up for this slot.", 409);
  const now = Date.now();
  const id = generateSecret("koinonia_entry");
  let result;
  try {
    result = await d1Run(env, `
      INSERT INTO koinonia_signup_entries
        (id, slot_id, parish_id, household_id, person_id, comment, status, created_at, updated_at)
      SELECT ?1, slot.id, ?2, ?3, ?4, ?5, 'confirmed', ?6, ?6
      FROM koinonia_signup_slots slot
      WHERE slot.id = ?7 AND slot.parish_id = ?2
        AND (SELECT COUNT(*) FROM koinonia_signup_entries entry
             WHERE entry.slot_id = slot.id AND entry.status = 'confirmed') < slot.needed_count
    `, id, context.parishId, context.householdId || null, context.personId, comment, now, slotId);
  } catch {
    throw new SignupAccessError("You've already signed up for this slot.", 409);
  }
  if (Number(result?.meta?.changes || 0) !== 1) throw new SignupAccessError("This slot is already full.", 409);
  await auditSignup(env,context,{sheetId:slot.sheet_id,slotId,action:"slot_claimed",summary:slot.label});
  if (ctx?.waitUntil) {
    ctx.waitUntil(sendSignupReminderPush(env, {
      parishId: context.parishId,
      personId: context.personId,
      sheetId: slot.sheet_id,
      sheetTitle: slot.sheet_title,
      slotLabel: slot.label,
      slotDate: slot.slot_date == null ? null : Number(slot.slot_date),
      ministryName: slot.ministry_name,
    }).then((summary) => console.log("signup_push_delivery", JSON.stringify({ parishId: context.parishId, slotId, entryId: id, ...summary })))
      .catch((error) => console.error("signup_push_delivery_failed", error?.message || String(error))));
  }
  return { ok: true, entryId: id };
}

async function cancelEntry(env, ctx, context, entryId) {
  const entry = await d1First(env, `
    SELECT entry.*, slot.sheet_id, slot.label, slot.slot_date, sheet.title sheet_title,
      ministry.display_name ministry_name
    FROM koinonia_signup_entries entry
    JOIN koinonia_signup_slots slot ON slot.id = entry.slot_id
    JOIN koinonia_signup_sheets sheet ON sheet.id = slot.sheet_id
    JOIN directory_ministries ministry ON ministry.id = sheet.ministry_id
    WHERE entry.id = ?1 AND entry.parish_id = ?2
  `, entryId, context.parishId);
  if (!entry) throw new SignupAccessError("Signup entry not found.", 404);
  if (entry.person_id !== context.personId) throw new SignupAccessError("You can only cancel your own signup.", 403);
  await d1Run(env, `
    UPDATE koinonia_signup_entries SET status = 'cancelled', updated_at = ?1
    WHERE id = ?2 AND parish_id = ?3 AND status = 'confirmed'
  `, Date.now(), entryId, context.parishId);
  await auditSignup(env, context, { sheetId: entry.sheet_id, slotId: entry.slot_id, action: "signup_cancelled", summary: entry.label });
  const waiting = await d1First(env, "SELECT * FROM koinonia_signup_waitlist WHERE parish_id=? AND slot_id=? AND status='waiting' ORDER BY created_at LIMIT 1", context.parishId, entry.slot_id);
  if (waiting) {
    await d1Run(env, "UPDATE koinonia_signup_waitlist SET status='offered',updated_at=? WHERE id=?", Date.now(), waiting.id);
    if (ctx?.waitUntil) ctx.waitUntil(sendSignupReminderPush(env, {
      parishId: context.parishId, personId: waiting.person_id, sheetId: entry.sheet_id,
      sheetTitle: entry.sheet_title, slotLabel: entry.label, slotDate: entry.slot_date,
      ministryName: entry.ministry_name, reminderLabel: "A signup spot opened",
    }).catch((error) => console.error("signup_waitlist_push_failed", error?.message || String(error))));
  }
  return { ok: true };
}

async function markSlotRead(env, context, slotId) {
  const slot = await d1First(env, `
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
  `, slotId, context.parishId, context.personId);
  if (!slot || (!["open", "closed"].includes(slot.status) && Number(slot.can_manage || 0) !== 1)) {
    throw new SignupAccessError("Slot not found.", 404);
  }
  await markContentRead(database(env), {
    parishId: context.parishId,
    contentType: CONTENT_TYPE,
    contentId: slotId,
    donorId: context.donorId,
  });
  return { ok: true };
}

async function joinSignupWaitlist(env,context,slotId){const slot=await d1First(env,`SELECT slot.id,slot.sheet_id,slot.label,s.ministry_id FROM koinonia_signup_slots slot JOIN koinonia_signup_sheets s ON s.id=slot.sheet_id WHERE slot.id=? AND slot.parish_id=? AND s.status='open'`,slotId,context.parishId);if(!slot)throw new SignupAccessError("Slot not found.",404);const id=generateSecret("signup_waitlist"),now=Date.now();try{await d1Run(env,"INSERT INTO koinonia_signup_waitlist(id,parish_id,slot_id,person_id,status,created_at,updated_at) VALUES(?,?,?,?,'waiting',?,?)",id,context.parishId,slotId,context.personId,now,now);}catch{throw new SignupAccessError("You are already on this waitlist.",409);}await auditSignup(env,context,{sheetId:slot.sheet_id,slotId,action:"waitlist_joined",summary:slot.label});return{ok:true,waitlistId:id};}
async function requestSignupCoverage(request,env,context,entryId){const entry=await d1First(env,`SELECT e.id,e.slot_id,slot.sheet_id,slot.label FROM koinonia_signup_entries e JOIN koinonia_signup_slots slot ON slot.id=e.slot_id WHERE e.id=? AND e.parish_id=? AND e.person_id=? AND e.status='confirmed'`,entryId,context.parishId,context.personId);if(!entry)throw new SignupAccessError("Commitment not found.",404);const b=await request.json().catch(()=>({})),id=generateSecret("signup_coverage"),now=Date.now();await d1Run(env,"INSERT INTO koinonia_signup_coverage_requests(id,parish_id,entry_id,requester_person_id,status,note,created_at,updated_at) VALUES(?,?,?,?,'open',?,?,?)",id,context.parishId,entryId,context.personId,String(b.note||"").slice(0,300),now,now);await auditSignup(env,context,{sheetId:entry.sheet_id,slotId:entry.slot_id,action:"coverage_requested",summary:entry.label});return{ok:true,coverageRequestId:id};}
async function acceptSignupCoverage(env,ctx,context,requestId){const request=await d1First(env,`SELECT coverage.*,entry.slot_id,slot.sheet_id,slot.label,slot.slot_date,s.title,s.ministry_id,m.display_name ministry_name FROM koinonia_signup_coverage_requests coverage JOIN koinonia_signup_entries entry ON entry.id=coverage.entry_id AND entry.status='confirmed' JOIN koinonia_signup_slots slot ON slot.id=entry.slot_id JOIN koinonia_signup_sheets s ON s.id=slot.sheet_id JOIN directory_ministries m ON m.id=s.ministry_id WHERE coverage.id=? AND coverage.parish_id=? AND coverage.status='open'`,requestId,context.parishId);if(!request)throw new SignupAccessError("Coverage request is no longer available.",404);if(request.requester_person_id===context.personId)throw new SignupAccessError("You already own this commitment.",409);await requireMinistryManager(env,{parishId:context.parishId,ministryId:request.ministry_id,personId:context.personId});if(request.slot_date!=null){const conflict=await d1First(env,`SELECT s.title FROM koinonia_signup_entries e JOIN koinonia_signup_slots slot ON slot.id=e.slot_id JOIN koinonia_signup_sheets s ON s.id=slot.sheet_id WHERE e.parish_id=? AND e.person_id=? AND e.status='confirmed' AND e.id<>? AND slot.slot_date IS NOT NULL AND ABS(slot.slot_date-?)<7200000 LIMIT 1`,context.parishId,context.personId,request.entry_id,Number(request.slot_date));if(conflict)throw new SignupAccessError(`This overlaps with your commitment to ${conflict.title}.`,409);}const now=Date.now();try{await d1Batch(env,[{sql:"UPDATE koinonia_signup_entries SET person_id=?,household_id=?,updated_at=? WHERE id=? AND parish_id=? AND status='confirmed'",params:[context.personId,context.householdId||null,now,request.entry_id,context.parishId]},{sql:"UPDATE koinonia_signup_coverage_requests SET replacement_person_id=?,status='accepted',updated_at=? WHERE id=? AND parish_id=? AND status='open'",params:[context.personId,now,requestId,context.parishId]},{sql:"UPDATE koinonia_signup_waitlist SET status='claimed',updated_at=? WHERE slot_id=? AND person_id=? AND status IN ('waiting','offered')",params:[now,request.slot_id,context.personId]}]);}catch{throw new SignupAccessError("This coverage request was just taken or conflicts with another signup.",409);}await auditSignup(env,context,{sheetId:request.sheet_id,slotId:request.slot_id,action:"coverage_accepted",summary:request.label});if(ctx?.waitUntil){const notifications=[sendSignupReminderPush(env,{parishId:context.parishId,personId:request.requester_person_id,sheetId:request.sheet_id,sheetTitle:request.title,slotLabel:request.label,slotDate:Number(request.slot_date)||null,ministryName:request.ministry_name,reminderLabel:"Coverage found"}),sendSignupReminderPush(env,{parishId:context.parishId,personId:context.personId,sheetId:request.sheet_id,sheetTitle:request.title,slotLabel:request.label,slotDate:Number(request.slot_date)||null,ministryName:request.ministry_name,reminderLabel:"Serving commitment confirmed"})];ctx.waitUntil(Promise.all(notifications).catch(error=>console.error("signup_coverage_push_failed",error?.message||String(error))));}return{ok:true,entryId:request.entry_id};}
async function completeSignupEntry(request,env,ctx,context,entryId){const e=await d1First(env,`SELECT e.id,e.person_id,slot.id slot_id,slot.sheet_id,slot.label,slot.slot_date,s.title,m.display_name ministry_name FROM koinonia_signup_entries e JOIN koinonia_signup_slots slot ON slot.id=e.slot_id JOIN koinonia_signup_sheets s ON s.id=slot.sheet_id JOIN directory_ministries m ON m.id=s.ministry_id WHERE e.id=? AND e.parish_id=?`,entryId,context.parishId);if(!e)throw new SignupAccessError("Commitment not found.",404);await requireSheetManager(env,context,e.sheet_id);const b=await request.json().catch(()=>({})),now=Date.now(),sendThanks=b.sendThanks!==false;await d1Run(env,`INSERT INTO koinonia_signup_service_records(entry_id,parish_id,completed,attended,completed_by_person_id,completed_at,thanked_at) VALUES(?,?,1,?,?,?,?) ON CONFLICT(entry_id) DO UPDATE SET completed=1,attended=excluded.attended,completed_by_person_id=excluded.completed_by_person_id,completed_at=excluded.completed_at,thanked_at=excluded.thanked_at`,entryId,context.parishId,b.attended===false?0:1,context.personId,now,sendThanks?now:null);await auditSignup(env,context,{sheetId:e.sheet_id,slotId:e.slot_id,action:"service_completed",summary:sendThanks?"Completed and thanked":"Completed"});if(sendThanks&&ctx?.waitUntil)ctx.waitUntil(sendSignupReminderPush(env,{parishId:context.parishId,personId:e.person_id,sheetId:e.sheet_id,sheetTitle:e.title,slotLabel:e.label,slotDate:Number(e.slot_date)||null,ministryName:e.ministry_name,reminderLabel:"Thank you for serving"}).catch(error=>console.error("signup_thank_you_push_failed",error?.message||String(error))));return{ok:true};}
async function listSignupHistory(env,context,sheetId){await requireSheetManager(env,context,sheetId);return{activity:await d1All(env,`SELECT a.*,p.preferred_name actor_name FROM koinonia_signup_activity a LEFT JOIN directory_people p ON p.id=a.actor_person_id WHERE a.parish_id=? AND a.sheet_id=? ORDER BY a.created_at DESC LIMIT 100`,context.parishId,sheetId)};}
async function listSignupTemplates(env,context,ministryId){await requireMinistryManager(env,{...context,ministryId});return{templates:await d1All(env,"SELECT * FROM koinonia_signup_templates WHERE parish_id=? AND ministry_id=? ORDER BY updated_at DESC",context.parishId,ministryId)};}
async function saveSignupTemplate(request,env,context,sheetId){const sheet=await requireSheetManager(env,context,sheetId);const b=await request.json().catch(()=>({}));const slots=await d1All(env,"SELECT label,notes,needed_count,display_order FROM koinonia_signup_slots WHERE sheet_id=? AND parish_id=? ORDER BY display_order",sheetId,context.parishId);const id=generateSecret("signup_template"),now=Date.now();await d1Run(env,"INSERT INTO koinonia_signup_templates(id,parish_id,ministry_id,name,title,description,category,slots_json,created_by_person_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",id,context.parishId,sheet.ministry_id,String(b.name||sheet.title).slice(0,180),sheet.title,sheet.description||"",sheet.category,JSON.stringify(slots),context.personId,now,now);return{ok:true,templateId:id};}
async function createFromSignupTemplate(request,env,context,templateId){const t=await d1First(env,"SELECT * FROM koinonia_signup_templates WHERE id=? AND parish_id=?",templateId,context.parishId);if(!t)throw new SignupAccessError("Template not found.",404);await requireMinistryManager(env,{...context,ministryId:t.ministry_id});const b=await request.json().catch(()=>({})),now=Date.now(),sheetId=generateSecret("koinonia_sheet"),baseDate=Number(b.startsAt)||null;const slots=JSON.parse(t.slots_json||"[]");const statements=[{sql:`INSERT INTO koinonia_signup_sheets(id,parish_id,ministry_id,title,description,category,status,visibility,created_by_person_id,updated_by_person_id,created_at,updated_at) VALUES(?,?,?,?,?,?,'draft','parish_members',?,?,?,?)`,params:[sheetId,context.parishId,t.ministry_id,String(b.title||t.title).slice(0,180),t.description,t.category,context.personId,context.personId,now,now]}];slots.forEach((s,i)=>statements.push({sql:`INSERT INTO koinonia_signup_slots(id,sheet_id,parish_id,label,notes,needed_count,slot_date,display_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`,params:[generateSecret("koinonia_slot"),sheetId,context.parishId,s.label,s.notes||"",s.needed_count||1,baseDate,Number(s.display_order)||100+i,now,now]}));await d1Batch(env,statements);await auditSignup(env,context,{sheetId,action:"created_from_template",summary:t.name});return{ok:true,sheetId};}

function errorResponse(error) {
  if (error instanceof SignupAccessError) return privateJson({ error: error.message }, { status: error.status });
  throw error;
}

export async function sendScheduledSignupReminders(env,asOf=Date.now()){
  if(!database(env))return{sent:0};const entries=await d1All(env,`SELECT e.id entry_id,e.parish_id,e.person_id,slot.slot_date,slot.label,s.id sheet_id,s.title,m.display_name ministry_name FROM koinonia_signup_entries e JOIN koinonia_signup_slots slot ON slot.id=e.slot_id JOIN koinonia_signup_sheets s ON s.id=slot.sheet_id JOIN directory_ministries m ON m.id=s.ministry_id WHERE e.status='confirmed' AND s.status IN ('open','closed') AND slot.slot_date BETWEEN ? AND ?`,asOf,asOf+7*86400000+3600000);let sent=0;for(const e of entries){const delta=e.slot_date-asOf;const type=delta<=36*3600000?'one_day':'one_week';const exists=await d1First(env,"SELECT 1 found FROM koinonia_signup_notification_log WHERE entry_id=? AND notification_type=?",e.entry_id,type);if(exists)continue;await sendSignupReminderPush(env,{parishId:e.parish_id,personId:e.person_id,sheetId:e.sheet_id,sheetTitle:e.title,slotLabel:e.label,slotDate:Number(e.slot_date),ministryName:e.ministry_name,reminderLabel:type==='one_day'?'Serving tomorrow':'Upcoming signup'});await d1Run(env,"INSERT INTO koinonia_signup_notification_log(entry_id,notification_type,sent_at) VALUES(?,?,?)",e.entry_id,type,asOf);sent+=1;}return{sent};
}

export async function handleDonorKoinoniaSignups(request, env, ctx = null) {
  if (!hasProductionStore(env) || !database(env)) return missingProductionStoreResponse();
  const limited = await rateLimit(request, env, "koinonia-signups", { limit: 80, windowSeconds: 300 });
  if (limited) return limited;
  try {
    const access = await featureContext(request, env);
    if (access.response) return access.response;
    const context = access.context;
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api\/donor\/koinonia\/signups\/?/, "");
    const parts = path ? path.split("/").map(decodeURIComponent) : [];

    if (!parts.length && request.method === "GET") {
      const [sheets, ministries] = await Promise.all([listSheets(env, context), listManagedMinistries(env, context)]);
      return privateJson({ ok: true, sheets, ministries });
    }
    if (!parts.length && request.method === "POST") return privateJson(await createSheet(request, env, context), { status: 201 });
    if(parts.length===2&&parts[0]==="templates"&&request.method==="GET") return privateJson(await listSignupTemplates(env,context,parts[1]));
    if(parts.length===3&&parts[0]==="templates"&&parts[2]==="create"&&request.method==="POST") return privateJson(await createFromSignupTemplate(request,env,context,parts[1]),{status:201});
    if (parts.length === 1 && parts[0] === "upcoming" && request.method === "GET") {
      return privateJson({ ok: true, signups: await listUpcomingSignupCommitments(env, context) });
    }
    if (parts.length === 1 && request.method === "GET") return privateJson({ ok: true, ...(await getSheet(env, context, parts[0])) });
    if (parts.length === 1 && request.method === "PATCH") return privateJson(await updateSheet(request, env, context, parts[0]));
    if (parts.length === 1 && request.method === "DELETE") return privateJson(await deleteSheet(env, context, parts[0]));
    if (parts.length === 2 && parts[1] === "status" && request.method === "PATCH") return privateJson(await updateSheetStatus(request, env, context, parts[0]));
    if (parts.length === 2 && parts[1] === "slots" && request.method === "POST") return privateJson(await addSlot(request, env, context, parts[0]), { status: 201 });
    if(parts.length===2&&parts[1]==="template"&&request.method==="POST") return privateJson(await saveSignupTemplate(request,env,context,parts[0]),{status:201});
    if(parts.length===2&&parts[1]==="history"&&request.method==="GET") return privateJson(await listSignupHistory(env,context,parts[0]));
    if (parts.length === 2 && parts[0] === "slots" && request.method === "PATCH") return privateJson(await updateSlot(request, env, context, parts[1]));
    if (parts.length === 2 && parts[0] === "slots" && request.method === "DELETE") return privateJson(await deleteSlot(env, context, parts[1]));
    if (parts.length === 3 && parts[0] === "slots" && parts[2] === "claim" && request.method === "POST") return privateJson(await claimSignupSlot(request, env, ctx, context, parts[1]), { status: 201 });
    if(parts.length===3&&parts[0]==="slots"&&parts[2]==="waitlist"&&request.method==="POST") return privateJson(await joinSignupWaitlist(env,context,parts[1]),{status:201});
    if (parts.length === 3 && parts[0] === "slots" && parts[2] === "read" && request.method === "POST") return privateJson(await markSlotRead(env, context, parts[1]));
    if (parts.length === 3 && parts[0] === "entries" && parts[2] === "cancel" && request.method === "POST") return privateJson(await cancelEntry(env, ctx, context, parts[1]));
    if(parts.length===3&&parts[0]==="entries"&&parts[2]==="coverage"&&request.method==="POST") return privateJson(await requestSignupCoverage(request,env,context,parts[1]),{status:201});
    if(parts.length===3&&parts[0]==="coverage"&&parts[2]==="accept"&&request.method==="POST") return privateJson(await acceptSignupCoverage(env,ctx,context,parts[1]));
    if(parts.length===3&&parts[0]==="entries"&&parts[2]==="complete"&&request.method==="PATCH") return privateJson(await completeSignupEntry(request,env,ctx,context,parts[1]));
    return privateJson({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    return errorResponse(error);
  }
}
