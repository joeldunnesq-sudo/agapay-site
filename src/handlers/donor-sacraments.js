import {
  SCHEDULABLE_SACRAMENT_TYPES,
  computeAvailableSlots,
  isSchedulableOfferingKey,
  isSlotStillOpen,
} from '../lib/sacrament-availability.js';
import {
  d1All,
  d1First,
  d1Run,
  generateSecret,
  hasProductionStore,
  json,
  missingProductionStoreResponse,
  normalizeEmail,
  rateLimit,
  unauthorized,
} from '../lib/core.js';
import { agapayEmailHtml, sendEmail } from '../lib/email.js';
import { hasModuleAccess, sacramentsEnabledFor } from '../lib/entitlements.js';
import { htmlEscape } from '../lib/format.js';
import { syncSacramentRequestToGoogleCalendar } from '../sacraments/google-calendar.js';
import { attachPreparationToRequests } from '../sacraments/preparation.js';
import { findRegistrationByParishId, requireDonor } from './parish.js';
import { sacramentTypeLabel } from './parish-sacraments.js';

const SACRAMENT_TYPES = new Set([
  'house_blessing',
  'baptism',
  'chrismation',
  'wedding',
  'funeral',
  'memorial_service',
  'confession',
  'home_visit',
  'office_visit',
  'anointing',
  'counseling',
  'other',
]);
const SACRAMENT_ACTIVE_STATUSES = new Set(['requested', 'acknowledged', 'scheduled']);

function publicSacramentRequest(row = {}) {
  return {
    id: row.id,
    parishId: row.parish_id,
    sacramentType: row.sacrament_type,
    otherTypeLabel: row.other_type_label || '',
    status: row.status,
    requestedDate: row.requested_date || '',
    requestedTimeWindow: row.requested_time_window || '',
    participantNames: row.participant_names || '',
    locationType: row.location_type || '',
    locationAddress: row.location_address || '',
    notes: row.notes || '',
    phone: row.phone || '',
    confirmedDate: row.confirmed_date || '',
    confirmedTime: row.confirmed_time || '',
    clergyAssigned: row.clergy_assigned || '',
    declineReason: row.status === 'declined' ? row.decline_reason || '' : '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // parish_notes is intentionally omitted — internal to the parish only.
  };
}

function donorSacramentOfferings(registration = {}) {
  const defaults = ['house_blessing', 'confession', 'counseling', 'baptism', 'wedding'];
  const priests =
    Array.isArray(registration.sacramentPriests) && registration.sacramentPriests.length
      ? registration.sacramentPriests
      : [{ serviceTypes: defaults, customServices: [] }];
  const types = new Set();
  const customById = new Map();
  for (const priest of priests) {
    const serviceTypes = Array.isArray(priest?.serviceTypes) ? priest.serviceTypes : defaults;
    serviceTypes.forEach((type) => types.add(String(type || '')));
    (Array.isArray(priest?.customServices) ? priest.customServices : []).forEach((service) => {
      const id = String(service?.id || '').trim();
      const label = String(service?.label || '').trim();
      const mode = service?.mode === 'schedule' ? 'schedule' : 'request';
      if (id && label) customById.set(id, { id, label, mode });
    });
  }
  return { types: [...types], custom: [...customById.values()] };
}

// Structured detail for baptism/chrismation and wedding requests. Lives in
// satellite tables keyed on sacrament_requests.id — see
// migration_sacrament_details.sql. Every other sacrament type has no detail
// row, which is fine; attachSacramentDetails() just returns null for them.

function publicBaptismDetails(row) {
  if (!row) return null;
  return {
    candidateName: row.candidate_name,
    candidateDob: row.candidate_dob || '',
    candidateIsAdult: !!row.candidate_is_adult,
    parentNames: row.parent_names || '',
    patronSaint: row.patron_saint || '',
    godparent1Name: row.godparent_1_name || '',
    godparent1HomeParish: row.godparent_1_home_parish || '',
    godparent1OrthodoxAttested: !!row.godparent_1_orthodox_attested,
    godparent2Name: row.godparent_2_name || '',
    godparent2HomeParish: row.godparent_2_home_parish || '',
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
    koumbaroName: row.koumbaro_name || '',
    koumbaroHomeParish: row.koumbaro_home_parish || '',
    marriageLicenseStatus: row.marriage_license_status || 'not_started',
    premaritalCounselComplete: !!row.premarital_counsel_complete,
  };
}

async function attachSacramentDetails(env, row) {
  const base = publicSacramentRequest(row);
  if (!row) return base;
  let detailed = base;
  if (row.sacrament_type === 'baptism' || row.sacrament_type === 'chrismation') {
    const detail = await d1First(env, 'SELECT * FROM sacrament_baptism_details WHERE request_id = ?', row.id).catch(
      () => null
    );
    detailed = { ...base, baptismDetails: publicBaptismDetails(detail) };
  }
  if (row.sacrament_type === 'wedding') {
    const detail = await d1First(env, 'SELECT * FROM sacrament_wedding_details WHERE request_id = ?', row.id).catch(
      () => null
    );
    detailed = { ...base, weddingDetails: publicWeddingDetails(detail) };
  }
  const [prepared] = await attachPreparationToRequests(env, [detailed]);
  return prepared;
}

// Batched version for lists -- at most two IN(...) queries total instead of
// one extra D1 round-trip per baptism/wedding row. See the matching helper
// in src/handlers/parish.js for why this matters (N+1 was slow to load).
async function attachSacramentDetailsBatch(env, rows = []) {
  const baptismRows = rows.filter((r) => r.sacrament_type === 'baptism' || r.sacrament_type === 'chrismation');
  const weddingRows = rows.filter((r) => r.sacrament_type === 'wedding');

  const baptismDetailsById = new Map();
  if (baptismRows.length) {
    const placeholders = baptismRows.map(() => '?').join(',');
    const details = await d1All(
      env,
      `SELECT * FROM sacrament_baptism_details WHERE request_id IN (${placeholders})`,
      ...baptismRows.map((r) => r.id)
    ).catch(() => []);
    for (const detail of details) baptismDetailsById.set(detail.request_id, detail);
  }

  const weddingDetailsById = new Map();
  if (weddingRows.length) {
    const placeholders = weddingRows.map(() => '?').join(',');
    const details = await d1All(
      env,
      `SELECT * FROM sacrament_wedding_details WHERE request_id IN (${placeholders})`,
      ...weddingRows.map((r) => r.id)
    ).catch(() => []);
    for (const detail of details) weddingDetailsById.set(detail.request_id, detail);
  }

  const detailedRows = rows.map((row) => {
    const base = publicSacramentRequest(row);
    if (row.sacrament_type === 'baptism' || row.sacrament_type === 'chrismation') {
      return { ...base, baptismDetails: publicBaptismDetails(baptismDetailsById.get(row.id) || null) };
    }
    if (row.sacrament_type === 'wedding') {
      return { ...base, weddingDetails: publicWeddingDetails(weddingDetailsById.get(row.id) || null) };
    }
    return base;
  });
  return attachPreparationToRequests(env, detailedRows);
}

// GET  /api/donor/sacraments        — list the signed-in donor's own requests
//   ?parishId= also returns { available } for that parish's AGAPAY Parish + status,
//   so the frontend knows whether to show the "Request a sacrament" form at all.
// POST /api/donor/sacraments        — submit a new request
export async function handleDonorSacraments(request, env) {
  const donor = await requireDonor(request, env);
  if (!donor) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  if (request.method === 'GET') {
    const rows = await d1All(
      env,
      'SELECT * FROM sacrament_requests WHERE donor_email = ? ORDER BY created_at DESC LIMIT 100',
      normalizeEmail(donor.email)
    ).catch(() => []);

    // Sacraments & Services is an AGAPAY Parish + feature, currently in
    // soft rollout — only tell the donor it's available if their home
    // parish both has active AGAPAY Parish + access AND has been enabled by
    // an AGAPAY admin. This is purely informational for the GET (so the UI
    // can show/hide the "new request" form); it never blocks viewing
    // requests already on file, even from a parish no longer enabled.
    let available = false;
    let offerings = donorSacramentOfferings();
    const parishId = String(request.headers.get('X-AGAPAY-Parish-Id') || donor.defaultParishId || '').trim();
    if (parishId) {
      const found = await findRegistrationByParishId(env, parishId);
      available = Boolean(found && sacramentsEnabledFor(found.registration));
      if (found) offerings = donorSacramentOfferings(found.registration);
    }

    const requestsWithDetails = await attachSacramentDetailsBatch(env, rows || []);
    return json({ requests: requestsWithDetails, available, parishId, offerings });
  }

  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });

  const limited = await rateLimit(request, env, 'donor-sacrament-request', { limit: 10, windowSeconds: 3600 });
  if (limited) return limited;

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parishId = String(body.parishId || donor.defaultParishId || '').trim();
  if (!parishId) {
    return json(
      {
        error: 'Choose a parish before submitting a request.',
        detail: 'Set a home parish in Settings, or include parishId.',
      },
      { status: 400 }
    );
  }
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: 'Parish not found.' }, { status: 404 });

  // Gate: Sacraments & Services requires both active AGAPAY Parish + access
  // (paid subscription, trial, or a comp grant) AND an admin having flipped
  // on the soft-rollout flag for this specific parish.
  if (!sacramentsEnabledFor(found.registration)) {
    return json(
      {
        error: 'This parish has not enabled Sacraments & Services.',
        detail: hasModuleAccess(found.registration, 'sacraments')
          ? 'Your parish can enable online requests in its dashboard settings.'
          : 'Online requests require the Sacraments add-on or Parish.',
      },
      { status: 402 }
    );
  }

  const sacramentType = String(body.sacramentType || '').trim();
  if (!SACRAMENT_TYPES.has(sacramentType)) {
    return json({ error: 'Choose a valid sacrament or service type.' }, { status: 400 });
  }
  if (sacramentType !== 'other' && !donorSacramentOfferings(found.registration).types.includes(sacramentType)) {
    return json({ error: 'This priest is not currently accepting that request online.' }, { status: 400 });
  }
  const otherTypeLabel =
    sacramentType === 'other'
      ? String(body.otherTypeLabel || '')
          .trim()
          .slice(0, 120)
      : '';
  if (sacramentType === 'other' && !otherTypeLabel) {
    return json({ error: "Describe what you're requesting." }, { status: 400 });
  }

  const locationType = ['church', 'home', 'other'].includes(body.locationType) ? body.locationType : 'church';
  const locationAddress = String(body.locationAddress || '')
    .trim()
    .slice(0, 400);
  if (
    (sacramentType === 'house_blessing' || sacramentType === 'home_visit' || locationType === 'home') &&
    !locationAddress
  ) {
    return json({ error: 'An address is required for a house blessing or home visit.' }, { status: 400 });
  }

  const requestedDate = String(body.requestedDate || '')
    .trim()
    .slice(0, 10);
  const requestedTimeWindow = String(body.requestedTimeWindow || '')
    .trim()
    .slice(0, 200);
  const notes = String(body.notes || '')
    .trim()
    .slice(0, 2000);
  const phone = String(body.phone || '')
    .trim()
    .slice(0, 40);

  const baptismDetails =
    sacramentType === 'baptism' || sacramentType === 'chrismation' ? body.baptismDetails || {} : null;
  const weddingDetails = sacramentType === 'wedding' ? body.weddingDetails || {} : null;

  if (baptismDetails && !String(baptismDetails.candidateName || '').trim()) {
    return json({ error: 'Candidate name is required.' }, { status: 400 });
  }
  if (
    weddingDetails &&
    (!String(weddingDetails.partyAName || '').trim() || !String(weddingDetails.partyBName || '').trim())
  ) {
    return json({ error: "Both parties' names are required." }, { status: 400 });
  }

  // Fall back to a derived label so existing dashboard views that only know
  // about participant_names (not yet updated to read the detail tables)
  // still show something sensible.
  let participantNames = String(body.participantNames || '')
    .trim()
    .slice(0, 1000);
  if (!participantNames && baptismDetails) {
    participantNames = String(baptismDetails.candidateName || '')
      .trim()
      .slice(0, 1000);
  }
  if (!participantNames && weddingDetails) {
    participantNames = `${weddingDetails.partyAName || ''} & ${weddingDetails.partyBName || ''}`.trim().slice(0, 1000);
  }

  const id = generateSecret('sac');
  const now = new Date().toISOString();

  await d1Run(
    env,
    `
    INSERT INTO sacrament_requests
      (id, parish_id, donor_email, sacrament_type, other_type_label, status,
       requested_date, requested_time_window, participant_names,
       location_type, location_address, notes, phone, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'requested', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    id,
    parishId,
    normalizeEmail(donor.email),
    sacramentType,
    otherTypeLabel || null,
    requestedDate || null,
    requestedTimeWindow || null,
    participantNames || null,
    locationType,
    locationAddress || null,
    notes || null,
    phone || null,
    now,
    now
  );

  if (baptismDetails) {
    await d1Run(
      env,
      `
      INSERT INTO sacrament_baptism_details
        (request_id, candidate_name, candidate_dob, candidate_is_adult,
         parent_names, patron_saint,
         godparent_1_name, godparent_1_home_parish, godparent_1_orthodox_attested,
         godparent_2_name, godparent_2_home_parish, godparent_2_orthodox_attested)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      id,
      String(baptismDetails.candidateName || '')
        .trim()
        .slice(0, 200),
      String(baptismDetails.candidateDob || '')
        .trim()
        .slice(0, 10) || null,
      baptismDetails.candidateIsAdult ? 1 : 0,
      String(baptismDetails.parentNames || '')
        .trim()
        .slice(0, 400) || null,
      String(baptismDetails.patronSaint || '')
        .trim()
        .slice(0, 200) || null,
      String(baptismDetails.godparent1Name || '')
        .trim()
        .slice(0, 200) || null,
      String(baptismDetails.godparent1HomeParish || '')
        .trim()
        .slice(0, 200) || null,
      baptismDetails.godparent1OrthodoxAttested ? 1 : 0,
      String(baptismDetails.godparent2Name || '')
        .trim()
        .slice(0, 200) || null,
      String(baptismDetails.godparent2HomeParish || '')
        .trim()
        .slice(0, 200) || null,
      baptismDetails.godparent2OrthodoxAttested ? 1 : 0
    );
  }

  if (weddingDetails) {
    await d1Run(
      env,
      `
      INSERT INTO sacrament_wedding_details
        (request_id, party_a_name, party_a_orthodox, party_a_prior_marriage,
         party_b_name, party_b_orthodox, party_b_prior_marriage,
         koumbaro_name, koumbaro_home_parish,
         marriage_license_status, premarital_counsel_complete)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      id,
      String(weddingDetails.partyAName || '')
        .trim()
        .slice(0, 200),
      weddingDetails.partyAOrthodox ? 1 : 0,
      weddingDetails.partyAPriorMarriage ? 1 : 0,
      String(weddingDetails.partyBName || '')
        .trim()
        .slice(0, 200),
      weddingDetails.partyBOrthodox ? 1 : 0,
      weddingDetails.partyBPriorMarriage ? 1 : 0,
      String(weddingDetails.koumbaroName || '')
        .trim()
        .slice(0, 200) || null,
      String(weddingDetails.koumbaroHomeParish || '')
        .trim()
        .slice(0, 200) || null,
      ['not_started', 'applied', 'obtained'].includes(weddingDetails.marriageLicenseStatus)
        ? weddingDetails.marriageLicenseStatus
        : 'not_started',
      weddingDetails.premaritalCounselComplete ? 1 : 0
    );
  }

  // Best-effort notification to the parish — never blocks the request itself.
  try {
    await notifyParishOfNewSacramentRequest(env, {
      request,
      registration: found.registration,
      donor,
      sacramentType,
      otherTypeLabel,
      participantNames,
      requestedDate,
      requestedTimeWindow,
      locationAddress,
      notes,
      phone,
    });
  } catch {
    /* notification failure never blocks the request */
  }

  const row = await d1First(env, 'SELECT * FROM sacrament_requests WHERE id = ?', id);
  return json({ ok: true, request: await attachSacramentDetails(env, row) });
}

/**
 * Best-effort "new sacrament request" email to the parish/priest. Shared by
 * the regular request POST above and the native availability booking
 * endpoint below -- `booked` swaps the copy from "requested" to "booked and
 * confirmed" since a booking skips the acknowledge/schedule review step.
 */
async function notifyParishOfNewSacramentRequest(
  env,
  {
    request,
    registration,
    donor,
    sacramentType,
    otherTypeLabel,
    participantNames,
    requestedDate,
    requestedTimeWindow,
    locationAddress,
    notes,
    phone,
    booked = false,
    confirmedDate = '',
    confirmedTime = '',
  }
) {
  const to = [
    registration.priestEmail,
    registration.treasurerEmail,
    registration.email,
    registration.contactEmail,
  ].filter(Boolean);
  if (!to.length) return;

  const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
  const typeLabel = otherTypeLabel || sacramentTypeLabel(sacramentType);
  const heading = booked ? 'New Sacrament Booking' : 'New Sacrament Request';
  const verb = booked ? 'booked' : 'requested';
  const when = booked && confirmedDate ? `${confirmedDate}${confirmedTime ? ` at ${confirmedTime}` : ''}` : '';

  await sendEmail(env, {
    from: env.AGAPAY_FROM_EMAIL || 'AGAPAY <onboarding@agapay.app>',
    to: [...new Set(to.map((a) => String(a).trim().toLowerCase()))],
    reply_to: env.AGAPAY_REPLY_TO_EMAIL || 'support@agapay.app',
    subject: booked ? `New booking: ${typeLabel} on ${confirmedDate}` : `New request: ${typeLabel}`,
    html: agapayEmailHtml(
      appUrl,
      heading,
      `
      <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#171715;">A parishioner has ${verb} <strong>${htmlEscape(typeLabel)}</strong> through AGAPAY${when ? ` for <strong>${htmlEscape(when)}</strong>` : ''}.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;line-height:1.6;">
        <tr><td style="padding:6px 10px 6px 0;color:#595959;width:140px;vertical-align:top;"><strong>${booked ? 'Booked by' : 'Requested by'}</strong></td><td style="padding:6px 0;">${htmlEscape(donor.donorName || donor.email)}</td></tr>
        <tr><td style="padding:6px 10px 6px 0;color:#595959;vertical-align:top;"><strong>Contact</strong></td><td style="padding:6px 0;"><a href="mailto:${htmlEscape(donor.email)}" style="color:#0A365B;">${htmlEscape(donor.email)}</a>${phone ? ' · ' + htmlEscape(phone) : ''}</td></tr>
        ${participantNames ? `<tr><td style="padding:6px 10px 6px 0;color:#595959;vertical-align:top;"><strong>For</strong></td><td style="padding:6px 0;">${htmlEscape(participantNames)}</td></tr>` : ''}
        ${!booked && requestedDate ? `<tr><td style="padding:6px 10px 6px 0;color:#595959;vertical-align:top;"><strong>Preferred date</strong></td><td style="padding:6px 0;">${htmlEscape(requestedDate)}</td></tr>` : ''}
        ${!booked && requestedTimeWindow ? `<tr><td style="padding:6px 10px 6px 0;color:#595959;vertical-align:top;"><strong>Preferred time</strong></td><td style="padding:6px 0;">${htmlEscape(requestedTimeWindow)}</td></tr>` : ''}
        ${locationAddress ? `<tr><td style="padding:6px 10px 6px 0;color:#595959;vertical-align:top;"><strong>Location</strong></td><td style="padding:6px 0;">${htmlEscape(locationAddress)}</td></tr>` : ''}
        ${notes ? `<tr><td style="padding:6px 10px 6px 0;color:#595959;vertical-align:top;"><strong>Notes</strong></td><td style="padding:6px 0;white-space:pre-wrap;">${htmlEscape(notes)}</td></tr>` : ''}
      </table>
      <p style="margin:18px 0 0;font-size:13px;color:#6F6A60;">${booked ? 'This slot was booked automatically from your published availability.' : 'Review and respond to this request'} from your parish dashboard, under Sacraments &amp; Services.</p>
    `
    ),
    text: `${booked ? 'New sacrament booking' : 'New sacrament request'}: ${typeLabel}${when ? ' (' + when + ')' : ''}\nFrom: ${donor.donorName || donor.email} <${donor.email}>${phone ? ' / ' + phone : ''}\n${participantNames ? 'For: ' + participantNames + '\n' : ''}${!booked && requestedDate ? 'Preferred date: ' + requestedDate + '\n' : ''}${notes ? '\nNotes:\n' + notes : ''}`,
  });
}

// GET /api/donor/sacraments/availability?parishId=&sacramentType=
// Real-time open slots for the "schedulable" types, computed natively (no
// third-party calendar). Empty slots (no error) means the donor UI should
// fall back to the free-text preferred-date/time fields.
export async function handleDonorSacramentAvailability(request, env) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, { status: 405 });
  const donor = await requireDonor(request, env);
  if (!donor) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const url = new URL(request.url);
  const parishId = String(url.searchParams.get('parishId') || donor.defaultParishId || '').trim();
  const offeringKey = String(url.searchParams.get('sacramentType') || '').trim();
  if (!parishId || !isSchedulableOfferingKey(offeringKey)) {
    return json({ slots: [], timezone: '' });
  }

  const found = await findRegistrationByParishId(env, parishId);
  if (!found || !sacramentsEnabledFor(found.registration)) {
    return json({ slots: [], timezone: '' });
  }
  const offerings = donorSacramentOfferings(found.registration);
  const isBuiltInOffering = offerings.types.includes(offeringKey) && SCHEDULABLE_SACRAMENT_TYPES.has(offeringKey);
  const isCustomScheduledOffering = offerings.custom.some(
    (service) => service.id === offeringKey && service.mode === 'schedule'
  );
  if (!isBuiltInOffering && !isCustomScheduledOffering) {
    return json({ slots: [], timezone: found.registration.timezone || '' });
  }

  const result = await computeAvailableSlots(env, {
    parishId,
    sacramentType: offeringKey,
    timezone: found.registration.timezone || '',
  });
  return json(result);
}

// POST /api/donor/sacraments/book
// Books a real open slot directly -- for configured schedulable service types.
// only. Skips the requested->acknowledged->scheduled review step entirely:
// the row is created as status='scheduled' with confirmed_date/confirmed_time
// already set, since the slot was only offered because it was open.
export async function handleDonorSacramentBook(request, env) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const donor = await requireDonor(request, env);
  if (!donor) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const limited = await rateLimit(request, env, 'donor-sacrament-request', { limit: 10, windowSeconds: 3600 });
  if (limited) return limited;

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parishId = String(body.parishId || donor.defaultParishId || '').trim();
  if (!parishId) {
    return json({ error: 'Choose a parish before booking.' }, { status: 400 });
  }
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: 'Parish not found.' }, { status: 404 });
  if (!sacramentsEnabledFor(found.registration)) {
    return json({ error: 'Sacraments & Services is not enabled for this parish.' }, { status: 402 });
  }

  const sacramentType = String(body.sacramentType || '').trim();
  const schedulingType = String(body.schedulingType || sacramentType).trim();
  const offerings = donorSacramentOfferings(found.registration);
  const customOffering =
    offerings.custom.find((service) => service.id === schedulingType && service.mode === 'schedule') || null;
  const builtInOffering =
    SCHEDULABLE_SACRAMENT_TYPES.has(sacramentType) &&
    schedulingType === sacramentType &&
    offerings.types.includes(sacramentType);
  if (!isSchedulableOfferingKey(schedulingType) || (!builtInOffering && !customOffering)) {
    return json({ error: "This sacrament type can't be self-booked." }, { status: 400 });
  }
  if (customOffering && sacramentType !== 'other') {
    return json({ error: 'This custom offering is not valid for online booking.' }, { status: 400 });
  }
  const otherTypeLabel = customOffering?.label || '';
  const date = String(body.date || '').trim();
  const time = String(body.time || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return json({ error: 'Choose a valid date and time.' }, { status: 400 });
  }

  const locationType = ['church', 'home', 'other'].includes(body.locationType) ? body.locationType : 'church';
  const locationAddress = String(body.locationAddress || '')
    .trim()
    .slice(0, 400);
  if ((sacramentType === 'home_visit' || locationType === 'home') && !locationAddress) {
    return json({ error: 'An address is required for a home visit.' }, { status: 400 });
  }
  const participantNames = String(body.participantNames || '')
    .trim()
    .slice(0, 1000);
  const phone = String(body.phone || '')
    .trim()
    .slice(0, 40);
  const notes = String(body.notes || '')
    .trim()
    .slice(0, 2000);
  const priestName = String(body.priestName || '')
    .trim()
    .slice(0, 120);

  // Soft pre-check (nice error message on the common case) -- the real,
  // race-safe guarantee is the DB-level unique index caught below.
  const stillOpen = await isSlotStillOpen(env, { parishId, date, time, priestName });
  if (!stillOpen) {
    return json({ error: 'That time was just taken — please pick another.', slotTaken: true }, { status: 409 });
  }

  const id = generateSecret('sac');
  const now = new Date().toISOString();
  try {
    await d1Run(
      env,
      `
      INSERT INTO sacrament_requests
        (id, parish_id, donor_email, sacrament_type, other_type_label, status,
         requested_date, participant_names, location_type, location_address,
         notes, phone, confirmed_date, confirmed_time, clergy_assigned, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'scheduled', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      id,
      parishId,
      normalizeEmail(donor.email),
      sacramentType,
      otherTypeLabel || null,
      date,
      participantNames || null,
      locationType,
      locationAddress || null,
      notes || null,
      phone || null,
      date,
      time,
      priestName || null,
      now,
      now
    );
  } catch (error) {
    if (/UNIQUE constraint failed/i.test(String(error?.message || error || ''))) {
      return json({ error: 'That time was just taken — please pick another.', slotTaken: true }, { status: 409 });
    }
    throw error;
  }

  // Best-effort notification to the parish — never blocks the booking itself.
  try {
    await notifyParishOfNewSacramentRequest(env, {
      request,
      registration: found.registration,
      donor,
      sacramentType,
      otherTypeLabel,
      participantNames,
      locationAddress,
      notes,
      phone,
      booked: true,
      confirmedDate: date,
      confirmedTime: time,
    });
  } catch {
    /* notification failure never blocks the booking */
  }

  const row = await d1First(env, 'SELECT * FROM sacrament_requests WHERE id = ?', id);
  const calendarSync = await syncSacramentRequestToGoogleCalendar(env, found.registration, row);
  return json({ ok: true, request: await attachSacramentDetails(env, row), calendarSync });
}

// POST /api/donor/sacraments/:id/cancel — donor withdraws their own pending request
export async function handleDonorSacramentCancel(request, env, requestId) {
  // No rollout-allowlist check needed here: a request can only exist in the
  // table if it was created via handleDonorSacraments' POST gate, which
  // already restricts creation to allowlisted parishes. Cancelling an
  // existing request is safe regardless of the parish's current rollout status.
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const donor = await requireDonor(request, env);
  if (!donor) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const row = await d1First(
    env,
    'SELECT * FROM sacrament_requests WHERE id = ? AND donor_email = ?',
    requestId,
    normalizeEmail(donor.email)
  );
  if (!row) return json({ error: 'Request not found.' }, { status: 404 });
  if (!SACRAMENT_ACTIVE_STATUSES.has(row.status)) {
    return json({ error: 'This request can no longer be cancelled.' }, { status: 409 });
  }

  const now = new Date().toISOString();
  await d1Run(env, "UPDATE sacrament_requests SET status = 'cancelled', updated_at = ? WHERE id = ?", now, requestId);
  const updated = await d1First(env, 'SELECT * FROM sacrament_requests WHERE id = ?', requestId);
  const found = await findRegistrationByParishId(env, row.parish_id);
  const calendarSync = found?.registration
    ? await syncSacramentRequestToGoogleCalendar(env, found.registration, updated, row)
    : { status: 'parish_not_found' };
  return json({ ok: true, request: await attachSacramentDetails(env, updated), calendarSync });
}
