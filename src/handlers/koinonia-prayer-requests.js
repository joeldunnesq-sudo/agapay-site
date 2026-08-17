import {
  d1All,
  d1First,
  d1Run,
  generateSecret,
  getBearerToken,
  hasProductionStore,
  json,
  missingProductionStoreResponse,
  rateLimit,
  unauthorized,
} from "../lib/core.js";
import { hasModuleAccess, prayerRequestsEnabledFor } from "../lib/entitlements.js";
import { verifiedHouseholdAccess } from "./koinonia-access.js";
import { findRegistrationByParishId, verifyParishDashboardBearer } from "./parish.js";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "Vary": "Authorization, X-AGAPAY-Donor-Email",
};
const MEMBER_STATUSES = new Set(["answered", "archived"]);
const ADMIN_STATUSES = new Set(["pending", "active", "answered", "flagged", "declined", "archived"]);
const VISIBILITIES = new Set(["parish_members", "clergy_only"]);
const NOTIFICATION_MODES = new Set(["immediate", "daily_digest", "off"]);
const DEFAULT_PASTORAL_NOTICE = "Prayer requests are shared with care. If you or someone else is in immediate danger, contact local emergency services.";

export class PrayerRequestAccessError extends Error {
  constructor(message = "You don't have access to this prayer request.", status = 403) {
    super(message);
    this.name = "PrayerRequestAccessError";
    this.status = status;
  }
}

function privateJson(payload, init = {}) {
  return json(payload, { ...init, headers: { ...PRIVATE_HEADERS, ...(init.headers || {}) } });
}

function database(env) {
  return env.AGAPAY_DB || env.DB || null;
}

function settingsFromRow(row = {}) {
  return {
    approvalRequired: row.approval_required == null ? true : Boolean(row.approval_required),
    allowAnonymous: row.allow_anonymous == null ? true : Boolean(row.allow_anonymous),
    autoArchiveDays: Math.min(365, Math.max(7, Number(row.auto_archive_days || 30))),
    notificationMode: NOTIFICATION_MODES.has(row.notification_mode) ? row.notification_mode : "immediate",
    pastoralNotice: String(row.pastoral_notice || DEFAULT_PASTORAL_NOTICE),
  };
}

export async function getPrayerSettings(env, parishId) {
  const row = await d1First(env, "SELECT * FROM koinonia_prayer_settings WHERE parish_id = ?1", parishId);
  return settingsFromRow(row || {});
}

async function auditPrayer(env, { parishId, requestId, actorType, actorPersonId = null, action, detail = "" }) {
  await d1Run(env, `
    INSERT INTO koinonia_prayer_activity
      (id, parish_id, request_id, actor_type, actor_person_id, action, detail, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
  `, generateSecret("prayer_activity"), parishId, requestId, actorType, actorPersonId,
    String(action || "updated").slice(0, 80), String(detail || "").slice(0, 500), Date.now());
}

function prayerRequestFromRow(row = {}, context = null, { admin = false } = {}) {
  const mine = Boolean(context?.personId && row.submitted_by_person_id === context.personId);
  const anonymous = Boolean(row.anonymous_to_parish);
  const actualName = row.requester_name || "Parish member";
  return {
    id: row.id || "",
    parishId: row.parish_id || "",
    body: row.body || "",
    visibility: row.visibility || "parish_members",
    anonymous,
    status: row.status || "pending",
    requesterName: admin ? actualName : (anonymous && !mine ? "Anonymous" : actualName),
    actualRequesterName: admin ? actualName : undefined,
    submittedByPersonId: admin ? row.submitted_by_person_id || "" : undefined,
    mine,
    prayedByMe: Boolean(row.prayed_by_me),
    prayerCount: Math.max(0, Number(row.prayer_count || 0)),
    reportCount: admin ? Math.max(0, Number(row.report_count || 0)) : undefined,
    moderationNote: admin ? row.moderation_note || "" : undefined,
    declineReason: mine || admin ? row.decline_reason || "" : undefined,
    createdAt: Number(row.created_at || 0),
    updatedAt: Number(row.updated_at || 0),
    publishedAt: row.published_at == null ? null : Number(row.published_at),
    expiresAt: row.expires_at == null ? null : Number(row.expires_at),
    answeredAt: row.answered_at == null ? null : Number(row.answered_at),
    revision: Number(row.revision || 1),
  };
}

async function archiveExpiredPrayerRequests(env, parishId, asOf = Date.now()) {
  await d1Run(env, `
    UPDATE koinonia_prayer_requests
    SET status = 'archived', archived_at = ?1, updated_at = ?1, revision = revision + 1
    WHERE parish_id = ?2 AND status = 'active' AND visibility = 'parish_members'
      AND expires_at IS NOT NULL AND expires_at <= ?1
  `, asOf, parishId);
}

async function memberFeatureContext(request, env) {
  const access = await verifiedHouseholdAccess(request, env);
  if (access.response) return access;
  const found = await findRegistrationByParishId(env, access.context.parishId);
  if (!found?.registration || !prayerRequestsEnabledFor(found.registration)) {
    return {
      context: null,
      response: privateJson({ error: "Prayer Requests are not available for this parish." }, { status: 403 }),
    };
  }
  return access;
}

export async function listMemberPrayerRequests(env, context, { mine = false, asOf = Date.now() } = {}) {
  await archiveExpiredPrayerRequests(env, context.parishId, asOf);
  const scope = mine
    ? "request.submitted_by_person_id = ?2"
    : "request.visibility = 'parish_members' AND request.status IN ('active', 'answered')";
  const rows = await d1All(env, `
    SELECT request.*, person.preferred_name AS requester_name,
      (SELECT COUNT(*) FROM koinonia_prayer_acknowledgements acknowledgement
        WHERE acknowledgement.request_id = request.id) AS prayer_count,
      EXISTS (SELECT 1 FROM koinonia_prayer_acknowledgements acknowledgement
        WHERE acknowledgement.request_id = request.id AND acknowledgement.person_id = ?2) AS prayed_by_me
    FROM koinonia_prayer_requests request
    LEFT JOIN directory_people person ON person.id = request.submitted_by_person_id
    WHERE request.parish_id = ?1 AND ${scope}
    ORDER BY CASE request.status WHEN 'active' THEN 0 WHEN 'pending' THEN 1 WHEN 'answered' THEN 2 ELSE 3 END,
      COALESCE(request.published_at, request.created_at) DESC
    LIMIT 150
  `, context.parishId, context.personId);
  return rows.map((row) => prayerRequestFromRow(row, context));
}

export async function createPrayerRequest(request, env, context) {
  const body = await request.json().catch(() => ({}));
  const text = String(body.body || "").trim().slice(0, 2000);
  const visibility = VISIBILITIES.has(body.visibility) ? body.visibility : "parish_members";
  if (text.length < 10) throw new PrayerRequestAccessError("Please share at least a few words for your prayer request.", 422);
  const settings = await getPrayerSettings(env, context.parishId);
  const anonymous = settings.allowAnonymous && Boolean(body.anonymous);
  const now = Date.now();
  const status = visibility === "clergy_only" || !settings.approvalRequired ? "active" : "pending";
  const publishedAt = status === "active" && visibility === "parish_members" ? now : null;
  const expiresAt = publishedAt ? now + settings.autoArchiveDays * 86400000 : null;
  const id = generateSecret("prayer_request");
  await d1Run(env, `
    INSERT INTO koinonia_prayer_requests
      (id, parish_id, household_id, submitted_by_person_id, body, visibility,
       anonymous_to_parish, status, created_at, updated_at, published_at, expires_at, revision)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9, ?10, ?11, 1)
  `, id, context.parishId, context.householdId || null, context.personId, text, visibility,
    anonymous ? 1 : 0, status, now, publishedAt, expiresAt);
  await auditPrayer(env, {
    parishId: context.parishId,
    requestId: id,
    actorType: "member",
    actorPersonId: context.personId,
    action: "submitted",
    detail: `${visibility}:${status}`,
  });
  const row = await d1First(env, `
    SELECT request.*, person.preferred_name AS requester_name, 0 AS prayer_count, 0 AS prayed_by_me
    FROM koinonia_prayer_requests request
    LEFT JOIN directory_people person ON person.id = request.submitted_by_person_id
    WHERE request.id = ?1 AND request.parish_id = ?2
  `, id, context.parishId);
  return { ok: true, request: prayerRequestFromRow(row, context), approvalRequired: status === "pending" };
}

export async function togglePrayerAcknowledgement(env, context, requestId) {
  const row = await d1First(env, `
    SELECT id FROM koinonia_prayer_requests
    WHERE id = ?1 AND parish_id = ?2 AND visibility = 'parish_members'
      AND status IN ('active', 'answered')
  `, requestId, context.parishId);
  if (!row) throw new PrayerRequestAccessError("Prayer request not found.", 404);
  const existing = await d1First(env, `
    SELECT 1 AS found FROM koinonia_prayer_acknowledgements
    WHERE request_id = ?1 AND parish_id = ?2 AND person_id = ?3
  `, requestId, context.parishId, context.personId);
  if (existing) {
    await d1Run(env, `DELETE FROM koinonia_prayer_acknowledgements WHERE request_id = ?1 AND parish_id = ?2 AND person_id = ?3`, requestId, context.parishId, context.personId);
  } else {
    await d1Run(env, `
      INSERT OR IGNORE INTO koinonia_prayer_acknowledgements (request_id, parish_id, person_id, created_at)
      VALUES (?1, ?2, ?3, ?4)
    `, requestId, context.parishId, context.personId, Date.now());
  }
  const count = await d1First(env, `SELECT COUNT(*) AS count FROM koinonia_prayer_acknowledgements WHERE request_id = ?1 AND parish_id = ?2`, requestId, context.parishId);
  return { ok: true, prayed: !existing, prayerCount: Math.max(0, Number(count?.count || 0)) };
}

export async function updateOwnPrayerRequest(request, env, context, requestId) {
  const existing = await d1First(env, `
    SELECT * FROM koinonia_prayer_requests
    WHERE id = ?1 AND parish_id = ?2 AND submitted_by_person_id = ?3
  `, requestId, context.parishId, context.personId);
  if (!existing) throw new PrayerRequestAccessError("Prayer request not found.", 404);
  const body = await request.json().catch(() => ({}));
  const status = MEMBER_STATUSES.has(body.status) ? body.status : "";
  if (!status) throw new PrayerRequestAccessError("Choose answered or archived.", 422);
  if (status === "answered" && !["active", "answered"].includes(existing.status)) {
    throw new PrayerRequestAccessError("Only an active request can be marked answered.", 409);
  }
  const now = Date.now();
  await d1Run(env, `
    UPDATE koinonia_prayer_requests
    SET status = ?1, answered_at = CASE WHEN ?1 = 'answered' THEN ?2 ELSE answered_at END,
        archived_at = CASE WHEN ?1 = 'archived' THEN ?2 ELSE archived_at END,
        updated_at = ?2, revision = revision + 1
    WHERE id = ?3 AND parish_id = ?4 AND submitted_by_person_id = ?5
  `, status, now, requestId, context.parishId, context.personId);
  await auditPrayer(env, { parishId: context.parishId, requestId, actorType: "member", actorPersonId: context.personId, action: status });
  return { ok: true, requestId, status };
}

export async function reportPrayerRequest(request, env, context, requestId) {
  const prayer = await d1First(env, `
    SELECT id, submitted_by_person_id FROM koinonia_prayer_requests
    WHERE id = ?1 AND parish_id = ?2 AND visibility = 'parish_members' AND status IN ('active', 'answered')
  `, requestId, context.parishId);
  if (!prayer) throw new PrayerRequestAccessError("Prayer request not found.", 404);
  if (prayer.submitted_by_person_id === context.personId) throw new PrayerRequestAccessError("Use My requests to manage your own prayer request.", 422);
  const body = await request.json().catch(() => ({}));
  const reason = String(body.reason || "Needs parish review").trim().slice(0, 300);
  const now = Date.now();
  await d1Run(env, `
    INSERT OR IGNORE INTO koinonia_prayer_reports
      (id, request_id, parish_id, reporter_person_id, reason, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6)
  `, generateSecret("prayer_report"), requestId, context.parishId, context.personId, reason, now);
  const count = await d1First(env, `
    SELECT COUNT(*) AS count FROM koinonia_prayer_reports
    WHERE request_id = ?1 AND parish_id = ?2 AND resolved_at IS NULL
  `, requestId, context.parishId);
  const reportCount = Math.max(0, Number(count?.count || 0));
  if (reportCount >= 3) {
    await d1Run(env, `
      UPDATE koinonia_prayer_requests
      SET status = 'flagged', updated_at = ?1, revision = revision + 1
      WHERE id = ?2 AND parish_id = ?3 AND status IN ('active', 'answered')
    `, now, requestId, context.parishId);
  }
  await auditPrayer(env, { parishId: context.parishId, requestId, actorType: "member", actorPersonId: context.personId, action: "reported" });
  return { ok: true, reportCount, heldForReview: reportCount >= 3 };
}

async function requireParishPrayerAccess(request, env, parishId) {
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return { response: json({ error: "Parish dashboard record not found" }, { status: 404 }) };
  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) return { response: unauthorized() };
  if (!hasModuleAccess(found.registration, "communications")) {
    return { response: json({ error: "Prayer Requests requires the Parish tier." }, { status: 402 }) };
  }
  return { found, response: null };
}

export async function listParishPrayerRequests(env, parishId) {
  await archiveExpiredPrayerRequests(env, parishId);
  const rows = await d1All(env, `
    SELECT request.*, person.preferred_name AS requester_name,
      (SELECT COUNT(*) FROM koinonia_prayer_acknowledgements acknowledgement
        WHERE acknowledgement.request_id = request.id) AS prayer_count,
      (SELECT COUNT(*) FROM koinonia_prayer_reports report
        WHERE report.request_id = request.id AND report.resolved_at IS NULL) AS report_count
    FROM koinonia_prayer_requests request
    LEFT JOIN directory_people person ON person.id = request.submitted_by_person_id
    WHERE request.parish_id = ?1
    ORDER BY CASE request.status WHEN 'flagged' THEN 0 WHEN 'pending' THEN 1 WHEN 'active' THEN 2 WHEN 'answered' THEN 3 ELSE 4 END,
      request.created_at DESC
    LIMIT 250
  `, parishId);
  const requests = rows.map((row) => prayerRequestFromRow(row, null, { admin: true }));
  return {
    requests,
    metrics: {
      awaitingReview: requests.filter((item) => ["pending", "flagged"].includes(item.status)).length,
      active: requests.filter((item) => item.status === "active" && item.visibility === "parish_members").length,
      clergyOnly: requests.filter((item) => item.visibility === "clergy_only" && !["archived", "declined"].includes(item.status)).length,
      answered: requests.filter((item) => item.status === "answered").length,
      reported: requests.filter((item) => item.reportCount > 0).length,
    },
  };
}

export async function updateParishPrayerRequest(request, env, parishId, requestId) {
  const existing = await d1First(env, `SELECT * FROM koinonia_prayer_requests WHERE id = ?1 AND parish_id = ?2`, requestId, parishId);
  if (!existing) throw new PrayerRequestAccessError("Prayer request not found.", 404);
  const body = await request.json().catch(() => ({}));
  const expectedRevision = Number(body.expectedRevision || 0);
  if (expectedRevision && expectedRevision !== Number(existing.revision || 1)) {
    throw new PrayerRequestAccessError("This request changed while you were reviewing it. Refresh and try again.", 409);
  }
  const visibility = VISIBILITIES.has(body.visibility) ? body.visibility : existing.visibility;
  const status = ADMIN_STATUSES.has(body.status) ? body.status : existing.status;
  const moderationNote = body.moderationNote === undefined ? existing.moderation_note : String(body.moderationNote || "").trim().slice(0, 1000);
  const declineReason = body.declineReason === undefined ? existing.decline_reason : String(body.declineReason || "").trim().slice(0, 500);
  const settings = await getPrayerSettings(env, parishId);
  const now = Date.now();
  const publishedAt = status === "active" && visibility === "parish_members" ? (existing.published_at || now) : null;
  const expiresAt = publishedAt ? (Number(existing.expires_at || 0) > now ? Number(existing.expires_at) : now + settings.autoArchiveDays * 86400000) : null;
  const answeredAt = status === "answered" ? (existing.answered_at || now) : existing.answered_at;
  const archivedAt = status === "archived" ? (existing.archived_at || now) : existing.archived_at;
  await d1Run(env, `
    UPDATE koinonia_prayer_requests
    SET visibility = ?1, status = ?2, moderation_note = ?3, decline_reason = ?4,
        published_at = ?5, expires_at = ?6, answered_at = ?7, archived_at = ?8,
        updated_at = ?9, revision = revision + 1
    WHERE id = ?10 AND parish_id = ?11
  `, visibility, status, moderationNote || null, declineReason || null, publishedAt, expiresAt,
    answeredAt, archivedAt, now, requestId, parishId);
  if (!["flagged", "pending"].includes(status)) {
    await d1Run(env, `UPDATE koinonia_prayer_reports SET resolved_at = ?1 WHERE request_id = ?2 AND parish_id = ?3 AND resolved_at IS NULL`, now, requestId, parishId);
  }
  await auditPrayer(env, { parishId, requestId, actorType: "parish_dashboard", action: status, detail: visibility });
  return { ok: true, requestId, status, visibility };
}

export async function savePrayerSettings(request, env, parishId) {
  const body = await request.json().catch(() => ({}));
  const current = await getPrayerSettings(env, parishId);
  const autoArchiveDays = Math.min(365, Math.max(7, Math.round(Number(body.autoArchiveDays ?? current.autoArchiveDays) || current.autoArchiveDays)));
  const notificationMode = NOTIFICATION_MODES.has(body.notificationMode) ? body.notificationMode : current.notificationMode;
  const pastoralNotice = String(body.pastoralNotice ?? current.pastoralNotice).trim().slice(0, 500) || DEFAULT_PASTORAL_NOTICE;
  const settings = {
    approvalRequired: Boolean(body.approvalRequired ?? current.approvalRequired),
    allowAnonymous: Boolean(body.allowAnonymous ?? current.allowAnonymous),
    autoArchiveDays,
    notificationMode,
    pastoralNotice,
  };
  const now = Date.now();
  await d1Run(env, `
    INSERT INTO koinonia_prayer_settings
      (parish_id, approval_required, allow_anonymous, auto_archive_days, notification_mode, pastoral_notice, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
    ON CONFLICT(parish_id) DO UPDATE SET
      approval_required = excluded.approval_required,
      allow_anonymous = excluded.allow_anonymous,
      auto_archive_days = excluded.auto_archive_days,
      notification_mode = excluded.notification_mode,
      pastoral_notice = excluded.pastoral_notice,
      updated_at = excluded.updated_at
  `, parishId, settings.approvalRequired ? 1 : 0, settings.allowAnonymous ? 1 : 0,
    settings.autoArchiveDays, settings.notificationMode, settings.pastoralNotice, now);
  return { ok: true, settings };
}

function errorResponse(error) {
  if (error instanceof PrayerRequestAccessError) return privateJson({ error: error.message }, { status: error.status });
  throw error;
}

export async function handleDonorKoinoniaPrayerRequests(request, env) {
  if (!hasProductionStore(env) || !database(env)) return missingProductionStoreResponse();
  const limited = await rateLimit(request, env, "koinonia-prayer-requests", { limit: 100, windowSeconds: 300 });
  if (limited) return limited;
  try {
    const access = await memberFeatureContext(request, env);
    if (access.response) return access.response;
    const context = access.context;
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api\/donor\/koinonia\/prayer-requests\/?/, "");
    const parts = path ? path.split("/").map(decodeURIComponent) : [];
    if (!parts.length && request.method === "GET") {
      const [requests, settings] = await Promise.all([
        listMemberPrayerRequests(env, context, { mine: url.searchParams.get("mine") === "1" }),
        getPrayerSettings(env, context.parishId),
      ]);
      return privateJson({ ok: true, requests, settings });
    }
    if (!parts.length && request.method === "POST") return privateJson(await createPrayerRequest(request, env, context), { status: 201 });
    if (parts.length === 1 && request.method === "PATCH") return privateJson(await updateOwnPrayerRequest(request, env, context, parts[0]));
    if (parts.length === 2 && parts[1] === "pray" && request.method === "POST") return privateJson(await togglePrayerAcknowledgement(env, context, parts[0]));
    if (parts.length === 2 && parts[1] === "report" && request.method === "POST") return privateJson(await reportPrayerRequest(request, env, context, parts[0]));
    return privateJson({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function handleParishPrayerRequests(request, env, parishId, subpath = "") {
  if (!hasProductionStore(env) || !database(env)) return missingProductionStoreResponse();
  const limited = await rateLimit(request, env, request.method === "GET" ? "parish-dashboard" : "parish-dashboard-write", {
    limit: request.method === "GET" ? 80 : 40,
    windowSeconds: 300,
  });
  if (limited) return limited;
  const access = await requireParishPrayerAccess(request, env, parishId);
  if (access.response) return access.response;
  try {
    const normalized = String(subpath || "").replace(/^\/+|\/+$/g, "");
    if (!normalized && request.method === "GET") {
      const [data, settings] = await Promise.all([listParishPrayerRequests(env, parishId), getPrayerSettings(env, parishId)]);
      return privateJson({ ok: true, enabled: prayerRequestsEnabledFor(access.found.registration), ...data, settings });
    }
    if (normalized === "settings" && request.method === "GET") return privateJson({ ok: true, settings: await getPrayerSettings(env, parishId) });
    if (normalized === "settings" && request.method === "PATCH") return privateJson(await savePrayerSettings(request, env, parishId));
    if (normalized && !normalized.includes("/") && request.method === "PATCH") return privateJson(await updateParishPrayerRequest(request, env, parishId, decodeURIComponent(normalized)));
    return privateJson({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    return errorResponse(error);
  }
}
