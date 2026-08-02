// src/handlers/parish-sacraments.js
// Parish-side sacrament requests, availability, and commemorations.

import {
  givingFeatureAccess,
} from "../lib/entitlements.js";
import {
  htmlEscape,
} from "../lib/parish-notifications.js";
import { agapayEmailHtml, sendEmail } from "../lib/email.js";
import {
  SCHEDULABLE_SACRAMENT_TYPES,
  isSchedulableOfferingKey,
} from "../lib/sacrament-availability.js";
import {
  d1All,
  d1First,
  d1Run,
  findRegistrationByParishId,
  generateSecret,
  getBearerToken,
  hasParishPlusAccess,
  hasProductionStore,
  json,
  missingProductionStoreResponse,
  normalizeSacramentPriests,
  rateLimit,
  requireAdmin,
  sacramentsEnabledFor,
  saveRegistrationRecord,
  unauthorized,
  verifyParishDashboardBearer,
} from "./parish.js";
import {
  loadCommemorationEntries,
  weekWindow,
} from "./parish-commemorations.js";
import { syncSacramentRequestToGoogleCalendar } from "../sacraments/google-calendar.js";

// POST /api/admin/sacraments/enabled
// Body: { parishId: string, enabled: boolean }
// Admin-only soft-rollout control -- deliberately NOT exposed on the
// parish's own self-service dashboard PATCH route.
export async function handleAdminSetSacramentsEnabled(request, env) {
  if (!(await requireAdmin(request, env))) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  let body = {};
  try { body = await request.json(); } catch { body = {}; }
  const parishId = String(body?.parishId || "").trim();
  if (!parishId) return json({ error: "parishId is required." }, { status: 400 });
  const enabled = Boolean(body?.enabled);

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish not found." }, { status: 404 });

  const registration = { ...found.registration, sacramentsEnabled: enabled };
  await saveRegistrationRecord(env, found.key, registration);

  return json({ ok: true, parishId, sacramentsEnabled: enabled });
}

const SACRAMENT_STATUSES = new Set(["requested", "acknowledged", "scheduled", "completed", "declined", "cancelled"]);

export function sacramentTypeLabel(type) {
  return {
    house_blessing: "House Blessing",
    baptism: "Baptism",
    chrismation: "Chrismation",
    wedding: "Wedding",
    funeral: "Funeral",
    memorial_service: "Memorial Service",
    confession: "Confession",
    home_visit: "Home Visit",
    office_visit: "Office Visit",
    anointing: "Holy Unction",
    counseling: "Pastoral Counseling",
    other: "Other Request"
  }[type] || type;
}

function publicBaptismDetails(row) {
  if (!row) return null;
  return {
    candidateName: row.candidate_name,
    candidateDob: row.candidate_dob || "",
    candidateIsAdult: !!row.candidate_is_adult,
    parentNames: row.parent_names || "",
    patronSaint: row.patron_saint || "",
    godparent1Name: row.godparent_1_name || "",
    godparent1HomeParish: row.godparent_1_home_parish || "",
    godparent1OrthodoxAttested: !!row.godparent_1_orthodox_attested,
    godparent2Name: row.godparent_2_name || "",
    godparent2HomeParish: row.godparent_2_home_parish || "",
    godparent2OrthodoxAttested: !!row.godparent_2_orthodox_attested,
  };
}

function publicWeddingDetails(row) {
  if (!row) return null;
  return {
    partyAName: row.party_a_name,
    partyAOrthodox: !!row.party_a_orthodox,
    partyAPriorMarriage: !!row.party_a_prior_marriage,
    partyBName: row.party_b_name,
    partyBOrthodox: !!row.party_b_orthodox,
    partyBPriorMarriage: !!row.party_b_prior_marriage,
    koumbaroName: row.koumbaro_name || "",
    koumbaroHomeParish: row.koumbaro_home_parish || "",
    marriageLicenseStatus: row.marriage_license_status || "not_started",
    premaritalCounselComplete: !!row.premarital_counsel_complete,
  };
}

async function attachSacramentDetailsForParish(env, row) {
  const base = parishSacramentRequestRow(row);
  if (!row) return base;
  if (row.sacrament_type === "baptism" || row.sacrament_type === "chrismation") {
    const detail = await d1First(env, "SELECT * FROM sacrament_baptism_details WHERE request_id = ?", row.id).catch(() => null);
    return { ...base, baptismDetails: publicBaptismDetails(detail) };
  }
  if (row.sacrament_type === "wedding") {
    const detail = await d1First(env, "SELECT * FROM sacrament_wedding_details WHERE request_id = ?", row.id).catch(() => null);
    return { ...base, weddingDetails: publicWeddingDetails(detail) };
  }
  return base;
}

// Batched version of attachSacramentDetailsForParish for lists -- fetches
// baptism/chrismation and wedding detail rows with at most two IN(...)
// queries total, instead of one extra D1 round-trip per matching row
// (which made the parish Sacraments tab slow to load once a parish had more
// than a handful of baptism/wedding requests).
async function attachSacramentDetailsForParishBatch(env, rows = []) {
  const baptismRows = rows.filter((r) => r.sacrament_type === "baptism" || r.sacrament_type === "chrismation");
  const weddingRows = rows.filter((r) => r.sacrament_type === "wedding");

  const baptismDetailsById = new Map();
  if (baptismRows.length) {
    const placeholders = baptismRows.map(() => "?").join(",");
    const details = await d1All(env,
      `SELECT * FROM sacrament_baptism_details WHERE request_id IN (${placeholders})`,
      ...baptismRows.map((r) => r.id)
    ).catch(() => []);
    for (const detail of details) baptismDetailsById.set(detail.request_id, detail);
  }

  const weddingDetailsById = new Map();
  if (weddingRows.length) {
    const placeholders = weddingRows.map(() => "?").join(",");
    const details = await d1All(env,
      `SELECT * FROM sacrament_wedding_details WHERE request_id IN (${placeholders})`,
      ...weddingRows.map((r) => r.id)
    ).catch(() => []);
    for (const detail of details) weddingDetailsById.set(detail.request_id, detail);
  }

  return rows.map((row) => {
    const base = parishSacramentRequestRow(row);
    if (row.sacrament_type === "baptism" || row.sacrament_type === "chrismation") {
      return { ...base, baptismDetails: publicBaptismDetails(baptismDetailsById.get(row.id) || null) };
    }
    if (row.sacrament_type === "wedding") {
      return { ...base, weddingDetails: publicWeddingDetails(weddingDetailsById.get(row.id) || null) };
    }
    return base;
  });
}

function parishSacramentRequestRow(row = {}) {
  return {
    id: row.id,
    donorEmail: row.donor_email,
    sacramentType: row.sacrament_type,
    otherTypeLabel: row.other_type_label || "",
    status: row.status,
    requestedDate: row.requested_date || "",
    requestedTimeWindow: row.requested_time_window || "",
    participantNames: row.participant_names || "",
    locationType: row.location_type || "",
    locationAddress: row.location_address || "",
    notes: row.notes || "",
    phone: row.phone || "",
    confirmedDate: row.confirmed_date || "",
    confirmedTime: row.confirmed_time || "",
    clergyAssigned: row.clergy_assigned || "",
    parishNotes: row.parish_notes || "",
    declineReason: row.decline_reason || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// GET /api/parish/dashboard/:parishId/sacraments
// Sacraments & Services is an AGAPAY Parish + feature: viewing/managing
// requests requires the parish to have active AGAPAY Parish + access.
// This mirrors the donor-side gate in handleDonorSacraments — the feature
// becomes available on both ends automatically the moment a parish
// subscribes (or is comped), with no separate enablement step.
export async function handleParishSacraments(request, env, parishId) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "parish-dashboard", { limit: 80, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });

  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return unauthorized();
  }

  if (!sacramentsEnabledFor(found.registration)) {
    return json({
      error: hasParishPlusAccess(found.registration)
        ? "Sacraments & Services is coming soon for your parish."
        : "Sacraments & Services requires AGAPAY Parish +.",
      stewardshipRequired: !hasParishPlusAccess(found.registration),
      comingSoon: hasParishPlusAccess(found.registration)
    }, { status: 402 });
  }

  let rows = [];
  try {
    rows = await d1All(env,
      "SELECT * FROM sacrament_requests WHERE parish_id = ? ORDER BY created_at DESC LIMIT 200",
      parishId
    );
  } catch (error) {
    if (!/sacrament_requests|no such table/i.test(String(error?.message || error || ""))) throw error;
    return json({ ok: false, error: "Sacrament requests are not installed yet.", setupRequired: true }, { status: 503 });
  }

  const requestsWithDetails = await attachSacramentDetailsForParishBatch(env, rows || []);
  return json({ ok: true, requests: requestsWithDetails });
}

// PATCH /api/parish/dashboard/:parishId/sacraments/:requestId
// Body: { status?, confirmedDate?, confirmedTime?, clergyAssigned?, parishNotes?, declineReason? }
export async function handleParishSacramentUpdate(request, env, parishId, requestId) {
  if (request.method !== "PATCH") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "parish-dashboard-write", { limit: 40, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });

  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return unauthorized();
  }

  if (!sacramentsEnabledFor(found.registration)) {
    return json({
      error: hasParishPlusAccess(found.registration)
        ? "Sacraments & Services is coming soon for your parish."
        : "Sacraments & Services requires AGAPAY Parish +.",
      stewardshipRequired: !hasParishPlusAccess(found.registration),
      comingSoon: hasParishPlusAccess(found.registration)
    }, { status: 402 });
  }

  const existing = await d1First(env, "SELECT * FROM sacrament_requests WHERE id = ? AND parish_id = ?", requestId, parishId);
  if (!existing) return json({ error: "Request not found." }, { status: 404 });

  let body = {};
  try { body = await request.json(); } catch { body = {}; }

  const nextStatus = SACRAMENT_STATUSES.has(body.status) ? body.status : existing.status;
  const confirmedDate = body.confirmedDate !== undefined ? String(body.confirmedDate || "").trim().slice(0, 10) : existing.confirmed_date;
  const confirmedTime = body.confirmedTime !== undefined ? String(body.confirmedTime || "").trim().slice(0, 40) : existing.confirmed_time;
  const clergyAssigned = body.clergyAssigned !== undefined ? String(body.clergyAssigned || "").trim().slice(0, 200) : existing.clergy_assigned;
  const parishNotes = body.parishNotes !== undefined ? String(body.parishNotes || "").trim().slice(0, 2000) : existing.parish_notes;
  const declineReason = body.declineReason !== undefined ? String(body.declineReason || "").trim().slice(0, 500) : existing.decline_reason;

  const now = new Date().toISOString();
  await d1Run(env, `
    UPDATE sacrament_requests SET
      status = ?, confirmed_date = ?, confirmed_time = ?, clergy_assigned = ?,
      parish_notes = ?, decline_reason = ?, updated_at = ?
    WHERE id = ? AND parish_id = ?
  `,
    nextStatus, confirmedDate || null, confirmedTime || null, clergyAssigned || null,
    parishNotes || null, declineReason || null, now, requestId, parishId
  );

  const updated = await d1First(env, "SELECT * FROM sacrament_requests WHERE id = ?", requestId);

  // Calendar sync is intentionally best-effort: the parish request save is
  // authoritative and must succeed even if Google is temporarily unavailable.
  const calendarSync = await syncSacramentRequestToGoogleCalendar(env, found.registration, updated, existing);

  // Notify the donor of a meaningful status change — best-effort, never blocks the save.
  if (nextStatus !== existing.status) {
    try {
      await notifyDonorOfSacramentStatusChange(env, found.registration, updated);
    } catch { /* notification failure never blocks the update */ }
  }

  return json({ ok: true, request: await attachSacramentDetailsForParish(env, updated), calendarSync });
}

async function notifyDonorOfSacramentStatusChange(env, registration, row) {
  const typeLabel = row.other_type_label || sacramentTypeLabel(row.sacrament_type);
  const statusCopy = {
    acknowledged: `${registration.parishName || "Your parish"} has received your request for ${typeLabel} and will be in touch to schedule.`,
    scheduled: `Your ${typeLabel} has been scheduled${row.confirmed_date ? ` for ${row.confirmed_date}` : ""}${row.confirmed_time ? ` at ${row.confirmed_time}` : ""}.`,
    completed: `Your ${typeLabel} request has been marked complete.`,
    declined: `${registration.parishName || "The parish"} was unable to fulfill your request for ${typeLabel}${row.decline_reason ? `: ${row.decline_reason}` : "."}`,
  }[row.status];
  if (!statusCopy) return;

  const appUrl = env.AGAPAY_APP_URL || "https://agapay.app";

  // Mirror this into donor_notifications so it also surfaces in the My AGAPAY dashboard,
  // not just email — matches the existing pledge-nudge notification pattern.
  try {
    await d1Run(env, `
      INSERT INTO donor_notifications (id, donor_email, parish_id, type, fiscal_year, message, sent_at)
      VALUES (?, ?, ?, 'sacrament_status', ?, ?, ?)
    `,
      generateSecret("notif"), row.donor_email, row.parish_id,
      new Date().getFullYear(), statusCopy, new Date().toISOString()
    );
  } catch { /* non-fatal if the table isn't present */ }

  await sendEmail(env, {
    from: env.AGAPAY_FROM_EMAIL || "AGAPAY <onboarding@agapay.app>",
    to: [row.donor_email],
    reply_to: registration.priestEmail || registration.email || env.AGAPAY_REPLY_TO_EMAIL || "support@agapay.app",
    subject: `Update on your ${typeLabel} request`,
    html: agapayEmailHtml(appUrl, "Sacrament Request Update", `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#171715;">${htmlEscape(statusCopy)}</p>
      <p style="margin:0;font-size:13px;color:#6F6A60;">View this request any time from your My AGAPAY dashboard.</p>
    `),
    text: statusCopy
  });
}

// ─── Native availability booking (no third-party calendar) ─────────────────

async function requireSacramentsParishContext(request, env, parishId) {
  if (!hasProductionStore(env)) return { ok: false, response: missingProductionStoreResponse() };
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return { ok: false, response: json({ error: "Parish dashboard record not found" }, { status: 404 }) };
  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return { ok: false, response: unauthorized() };
  }
  if (!sacramentsEnabledFor(found.registration)) {
    return { ok: false, response: json({ error: "Sacraments & Services is not enabled for this parish." }, { status: 402 }) };
  }
  return { ok: true, registration: found.registration, key: found.key };
}

function isValidTimezone(tz) {
  try { new Intl.DateTimeFormat(undefined, { timeZone: tz }); return true; } catch { return false; }
}

// GET /api/parish/dashboard/:parishId/sacraments/availability
export async function handleParishSacramentAvailability(request, env, parishId) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "parish-dashboard", { limit: 80, windowSeconds: 300 });
  if (limited) return limited;
  const ctx = await requireSacramentsParishContext(request, env, parishId);
  if (!ctx.ok) return ctx.response;

  const rules = await d1All(env,
    "SELECT * FROM parish_availability_rules WHERE parish_id = ? ORDER BY sacrament_type, day_of_week, start_time",
    parishId
  ).catch(() => []);
  const blackouts = await d1All(env,
    "SELECT * FROM parish_availability_blackouts WHERE parish_id = ? ORDER BY date",
    parishId
  ).catch(() => []);

  return json({
    ok: true,
    timezone: ctx.registration.timezone || "",
    rules: rules.map((r) => ({
      id: r.id, sacramentType: r.sacrament_type, dayOfWeek: r.day_of_week,
      startTime: r.start_time, endTime: r.end_time, slotMinutes: r.slot_minutes,
      priestName: r.priest_name || "", priestEmail: r.priest_email || ""
    })),
    blackouts: blackouts.map((b) => ({
      id: b.id, date: b.date, startDate: b.date, endDate: b.end_date || b.date, reason: b.reason || "",
      priestName: b.priest_name || "", priestEmail: b.priest_email || ""
    }))
  });
}

// POST /api/parish/dashboard/:parishId/sacraments/availability/rules
export async function handleParishAvailabilityRuleCreate(request, env, parishId) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "parish-dashboard-write", { limit: 40, windowSeconds: 300 });
  if (limited) return limited;
  const ctx = await requireSacramentsParishContext(request, env, parishId);
  if (!ctx.ok) return ctx.response;
  if (!ctx.registration.timezone) {
    return json({ error: "Set your parish's timezone before adding availability." }, { status: 400 });
  }

  let body = {};
  try { body = await request.json(); } catch { body = {}; }
  const sacramentType = String(body.sacramentType || "").trim();
  const requestedPriestName = String(body.priestName || "").trim().slice(0, 120);
  const configuredPriest = normalizeSacramentPriests(ctx.registration).find((priest) => priest.name === requestedPriestName);
  const configuredCustomOffering = configuredPriest?.customServices?.some((service) =>
    service.id === sacramentType && service.mode === "schedule"
  );
  if (!isSchedulableOfferingKey(sacramentType)
    || (!SCHEDULABLE_SACRAMENT_TYPES.has(sacramentType) && !configuredCustomOffering)) {
    return json({ error: "Choose an offering configured for online scheduling." }, { status: 400 });
  }
  const dayOfWeek = Number(body.dayOfWeek);
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    return json({ error: "Choose a valid day of the week." }, { status: 400 });
  }
  const startTime = String(body.startTime || "").trim();
  const endTime = String(body.endTime || "").trim();
  if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime) || startTime >= endTime) {
    return json({ error: "Enter a valid start and end time, with the end after the start." }, { status: 400 });
  }
  const slotMinutes = Math.max(5, Math.min(240, parseInt(body.slotMinutes, 10) || 30));
  const priestName = requestedPriestName;
  const priestEmail = String(body.priestEmail || "").trim().slice(0, 180);

  const id = generateSecret("avail");
  await d1Run(env, `
    INSERT INTO parish_availability_rules
      (id, parish_id, sacrament_type, day_of_week, start_time, end_time, slot_minutes, active, priest_name, priest_email, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, datetime('now'), datetime('now'))
  `, id, parishId, sacramentType, dayOfWeek, startTime, endTime, slotMinutes, priestName || null, priestEmail || null);

  return json({ ok: true, id });
}

// DELETE /api/parish/dashboard/:parishId/sacraments/availability/rules/:ruleId
export async function handleParishAvailabilityRuleDelete(request, env, parishId, ruleId) {
  if (request.method !== "DELETE") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "parish-dashboard-write", { limit: 40, windowSeconds: 300 });
  if (limited) return limited;
  const ctx = await requireSacramentsParishContext(request, env, parishId);
  if (!ctx.ok) return ctx.response;

  await d1Run(env, "DELETE FROM parish_availability_rules WHERE id = ? AND parish_id = ?", ruleId, parishId);
  return json({ ok: true });
}

// POST /api/parish/dashboard/:parishId/sacraments/availability/blackouts
export async function handleParishAvailabilityBlackoutCreate(request, env, parishId) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "parish-dashboard-write", { limit: 40, windowSeconds: 300 });
  if (limited) return limited;
  const ctx = await requireSacramentsParishContext(request, env, parishId);
  if (!ctx.ok) return ctx.response;

  let body = {};
  try { body = await request.json(); } catch { body = {}; }
  const startDate = String(body.startDate || body.date || "").trim();
  const endDate = String(body.endDate || startDate).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return json({ error: "Choose a valid start and end date." }, { status: 400 });
  }
  if (endDate < startDate) {
    return json({ error: "The end date must be on or after the start date." }, { status: 400 });
  }
  const reason = String(body.reason || "").trim().slice(0, 200);
  const priestName = String(body.priestName || "").trim().slice(0, 120);
  const priestEmail = String(body.priestEmail || "").trim().slice(0, 180);

  const id = generateSecret("blackout");
  await d1Run(env, `
    INSERT INTO parish_availability_blackouts (id, parish_id, date, end_date, reason, priest_name, priest_email, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `, id, parishId, startDate, endDate, reason || null, priestName || null, priestEmail || null);

  return json({ ok: true, id });
}

// DELETE /api/parish/dashboard/:parishId/sacraments/availability/blackouts/:blackoutId
export async function handleParishAvailabilityBlackoutDelete(request, env, parishId, blackoutId) {
  if (request.method !== "DELETE") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "parish-dashboard-write", { limit: 40, windowSeconds: 300 });
  if (limited) return limited;
  const ctx = await requireSacramentsParishContext(request, env, parishId);
  if (!ctx.ok) return ctx.response;

  await d1Run(env, "DELETE FROM parish_availability_blackouts WHERE id = ? AND parish_id = ?", blackoutId, parishId);
  return json({ ok: true });
}

export async function handleParishCommemorations(request, env, parishId) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "parish-dashboard", { limit: 80, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });

  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return unauthorized();
  }
  if (!givingFeatureAccess(found.registration, "commemorations")) {
    return json({ error: "Commemorations are available with Giving Plus." }, { status: 403 });
  }

  const { start, end } = weekWindow();
  const entries = await loadCommemorationEntries(env, parishId, start, end);
  return json({
    week: {
      start: start.toISOString(),
      end: end.toISOString()
    },
    entries
  });
}
