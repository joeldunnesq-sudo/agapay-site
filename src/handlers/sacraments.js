// ============================================================
// Sacrament Request routes
//
// Wire into src/worker.js by importing and calling from your existing
// router. These functions assume the same patterns as the rest of
// AGAPAY: `env.DB` is the agapay-production D1 binding, and `ctx.user`
// / `ctx.parishId` come from your existing auth middleware.
//
// TODO before shipping:
//   1. Replace `checkFastingWindow()` with a call into your real
//      Meeus-algorithm feast/fast engine — this is a stub with a
//      hardcoded 2026 fasting calendar so the flow works end to end.
//   2. Wire document upload to your R2 bucket (label + r2_key only
//      get written here; actual PUT happens wherever your existing
//      file upload endpoint lives).
//   3. Hook `notifyPriestOfNewRequest()` / `notifyFamilyOfStatusChange()`
//      into Resend, matching your existing email patterns.
// ============================================================

function newId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function nowIso() {
  return new Date().toISOString();
}

// --- Fasting calendar stub -----------------------------------------
// Replace with your real engine. Structure kept intentionally simple:
// an array of { start, end, name } windows, inclusive, ISO dates.
const FASTING_WINDOWS_2026 = [
  { start: '2026-02-16', end: '2026-04-04', name: 'Great Lent & Holy Week' },
  { start: '2026-08-01', end: '2026-08-14', name: 'Dormition Fast' },
  { start: '2026-11-15', end: '2026-12-24', name: 'Nativity Fast' },
];

function checkFastingWindow(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  for (const w of FASTING_WINDOWS_2026) {
    if (d >= new Date(w.start) && d <= new Date(w.end)) {
      return w.name;
    }
  }
  return null;
}

// Weddings are the sacrament where fasting-window flags matter most
// (canonically restricted); baptism/chrismation are typically fine
// during fasts, so only flag weddings by default. Easy to change.
function shouldCheckFasting(sacramentType) {
  return sacramentType === 'wedding';
}

// --- Create a new sacrament request ---------------------------------
export async function createSacramentRequest(request, env, ctx) {
  const body = await request.json();
  const {
    sacrament_type,
    family_id,
    requester_notes,
    proposed_date,
    details, // shape depends on sacrament_type — see below
  } = body;

  const validTypes = [
    'baptism', 'chrismation', 'wedding', 'funeral',
    'confession', 'house_blessing', 'counsel',
  ];
  if (!validTypes.includes(sacrament_type)) {
    return Response.json({ error: 'Invalid sacrament_type' }, { status: 400 });
  }

  const id = newId('sreq');
  let fastingFlag = 0;
  let fastingNote = null;

  if (proposed_date && shouldCheckFasting(sacrament_type)) {
    const hit = checkFastingWindow(proposed_date);
    if (hit) {
      fastingFlag = 1;
      fastingNote = `Falls within the ${hit}`;
    }
  }

  await env.DB.prepare(
    `INSERT INTO sacrament_requests
     (id, parish_id, family_id, requested_by_user_id, sacrament_type,
      status, proposed_date, fasting_flag, fasting_flag_note,
      requester_notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'submitted', ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, ctx.parishId, family_id ?? null, ctx.user.id, sacrament_type,
    proposed_date ?? null, fastingFlag, fastingNote,
    requester_notes ?? null, nowIso(), nowIso()
  ).run();

  // Type-specific detail row
  if (sacrament_type === 'baptism' || sacrament_type === 'chrismation') {
    await env.DB.prepare(
      `INSERT INTO sacrament_baptism_details
       (request_id, candidate_name, candidate_dob, candidate_is_adult,
        parent_names, patron_saint,
        godparent_1_name, godparent_1_home_parish, godparent_1_orthodox_attested,
        godparent_2_name, godparent_2_home_parish, godparent_2_orthodox_attested)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      details.candidate_name, details.candidate_dob ?? null,
      details.candidate_is_adult ? 1 : 0,
      details.parent_names ?? null, details.patron_saint ?? null,
      details.godparent_1_name ?? null, details.godparent_1_home_parish ?? null,
      details.godparent_1_orthodox_attested ? 1 : 0,
      details.godparent_2_name ?? null, details.godparent_2_home_parish ?? null,
      details.godparent_2_orthodox_attested ? 1 : 0
    ).run();
  } else if (sacrament_type === 'wedding') {
    await env.DB.prepare(
      `INSERT INTO sacrament_wedding_details
       (request_id, party_a_name, party_a_orthodox, party_a_prior_marriage,
        party_b_name, party_b_orthodox, party_b_prior_marriage,
        koumbaro_name, koumbaro_home_parish,
        marriage_license_status, premarital_counsel_complete)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      details.party_a_name, details.party_a_orthodox ? 1 : 0,
      details.party_a_prior_marriage ? 1 : 0,
      details.party_b_name, details.party_b_orthodox ? 1 : 0,
      details.party_b_prior_marriage ? 1 : 0,
      details.koumbaro_name ?? null, details.koumbaro_home_parish ?? null,
      details.marriage_license_status ?? 'not_started',
      details.premarital_counsel_complete ? 1 : 0
    ).run();
  } else if (sacrament_type === 'funeral') {
    await env.DB.prepare(
      `INSERT INTO sacrament_funeral_details
       (request_id, deceased_name, date_of_repose, urgent_contact_phone, funeral_home)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(
      id, details.deceased_name, details.date_of_repose ?? null,
      details.urgent_contact_phone, details.funeral_home ?? null
    ).run();
  }
  // confession / house_blessing / counsel: no detail table — these
  // stay on the Tier 1 embed-widget path and shouldn't hit this
  // endpoint at all in the UI, but it's harmless if they do.

  await logEvent(env, id, 'submitted', ctx.user.id, null);

  // TODO: await notifyPriestOfNewRequest(env, ctx.parishId, id, sacrament_type);

  return Response.json({ id, status: 'submitted', fasting_flag: !!fastingFlag, fasting_flag_note: fastingNote });
}

// --- List requests for a parish (priest/admin view) ------------------
export async function listSacramentRequests(request, env, ctx) {
  const url = new URL(request.url);
  const statusFilter = url.searchParams.get('status');
  const typeFilter = url.searchParams.get('type');

  let query = `SELECT * FROM sacrament_requests WHERE parish_id = ?`;
  const binds = [ctx.parishId];
  if (statusFilter) {
    query += ` AND status = ?`;
    binds.push(statusFilter);
  }
  if (typeFilter) {
    query += ` AND sacrament_type = ?`;
    binds.push(typeFilter);
  }
  query += ` ORDER BY created_at DESC LIMIT 100`;

  const { results } = await env.DB.prepare(query).bind(...binds).all();
  return Response.json({ requests: results });
}

// --- Update status / propose date (priest action) ---------------------
export async function updateSacramentRequest(request, env, ctx) {
  const { id } = ctx.params;
  const body = await request.json();
  const { status, proposed_date, confirmed_date, priest_notes } = body;

  const updates = [];
  const binds = [];

  if (status) { updates.push('status = ?'); binds.push(status); }
  if (proposed_date !== undefined) { updates.push('proposed_date = ?'); binds.push(proposed_date); }
  if (confirmed_date !== undefined) { updates.push('confirmed_date = ?'); binds.push(confirmed_date); }
  if (priest_notes !== undefined) { updates.push('priest_notes = ?'); binds.push(priest_notes); }
  updates.push('updated_at = ?'); binds.push(nowIso());

  binds.push(id, ctx.parishId);

  await env.DB.prepare(
    `UPDATE sacrament_requests SET ${updates.join(', ')} WHERE id = ? AND parish_id = ?`
  ).bind(...binds).run();

  await logEvent(env, id, 'status_change', ctx.user.id,
    status ? `Status changed to ${status}` : 'Request updated');

  // TODO: await notifyFamilyOfStatusChange(env, id, status);

  return Response.json({ ok: true });
}

async function logEvent(env, requestId, eventType, actorUserId, note) {
  await env.DB.prepare(
    `INSERT INTO sacrament_request_events (id, request_id, event_type, actor_user_id, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(newId('sevt'), requestId, eventType, actorUserId ?? null, note, nowIso()).run();
}
