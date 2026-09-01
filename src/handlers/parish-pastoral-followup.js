import { recordAuditEvent } from '../lib/audit-log.js';
import { hasModuleAccess } from '../lib/entitlements.js';
import {
  getBearerToken,
  hasProductionStore,
  json,
  missingProductionStoreResponse,
  normalizeEmail,
  rateLimit,
  unauthorized,
} from '../lib/core.js';
import { findRegistrationByParishId, normalizeSacramentPriests, verifyParishDashboardBearer } from './parish.js';
import {
  PastoralFollowUpError,
  createPastoralFollowup,
  listPastoralFollowupCandidates,
  listPastoralFollowups,
  recordPastoralContact,
  updatePastoralFollowup,
} from '../sacraments/pastoral-followup.js';
import {
  listMemorialMarkers,
  recordRepose,
  scheduleMemorialService,
  updateMemorialMarker,
} from '../sacraments/memorial-followup.js';
import { syncSacramentRequestToGoogleCalendar } from '../sacraments/google-calendar.js';
import { agapayEmailHtml, sendEmail } from '../lib/email.js';
import { htmlEscape } from '../lib/parish-notifications.js';

async function requireContext(request, env, parishId) {
  if (!hasProductionStore(env)) return { response: missingProductionStoreResponse() };
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return { response: json({ error: 'Parish dashboard record not found.' }, { status: 404 }) };
  if (!(await verifyParishDashboardBearer(found.registration, getBearerToken(request)))) {
    return { response: unauthorized() };
  }
  if (!hasModuleAccess(found.registration, 'sacraments')) {
    return {
      response: json({ error: 'Sacraments & Services requires the Sacraments add-on or Parish.' }, { status: 402 }),
    };
  }
  return { found };
}

function actor(registration = {}) {
  return registration.priestEmail || registration.treasurerEmail || registration.email || 'parish-dashboard';
}

function configuredPriest(registration, name, email) {
  const normalizedEmail = normalizeEmail(email);
  return normalizeSacramentPriests(registration).find((priest) =>
    normalizedEmail ? normalizeEmail(priest.email) === normalizedEmail : priest.name === String(name || '').trim()
  );
}

async function bodyJson(request) {
  try {
    return await request.json();
  } catch {
    throw new PastoralFollowUpError('Invalid JSON body.', 400);
  }
}

async function audit(env, request, parishId, registration, fields) {
  await recordAuditEvent(env, request, {
    actorType: 'parish',
    actorUserId: actor(registration),
    organizationId: parishId,
    targetType: 'sacrament_pastoral_followup',
    ...fields,
  });
}

async function notifyPriestOfRepose(env, registration, result) {
  if (!result.assignedPriestEmail) return;
  const rows = result.markers
    .map((marker) => `<li><strong>${htmlEscape(marker.markerLabel)}</strong> — ${htmlEscape(marker.targetDate)}</li>`)
    .join('');
  await sendEmail(env, {
    from: env.AGAPAY_FROM_EMAIL || 'AGAPAY <onboarding@agapay.app>',
    to: [result.assignedPriestEmail],
    reply_to: registration.priestEmail || registration.email || env.AGAPAY_REPLY_TO_EMAIL || 'support@agapay.app',
    subject: `Memorial observances for ${result.personName}`,
    html: agapayEmailHtml(
      env.AGAPAY_APP_URL || 'https://agapay.app',
      'Memorial observances recorded',
      `<p>${htmlEscape(result.personName)} was recorded as reposed on <strong>${htmlEscape(result.reposedOn)}</strong>.</p><ul>${rows}</ul><p>Open Sacraments &amp; Services → Follow-up to arrange each observance.</p>`
    ),
    text: [
      `${result.personName} was recorded as reposed on ${result.reposedOn}.`,
      '',
      ...result.markers.map((marker) => `- ${marker.markerLabel}: ${marker.targetDate}`),
      '',
      'Open Sacraments & Services → Follow-up to arrange each observance.',
    ].join('\n'),
  });
}

export async function handleParishPastoralFollowUp(request, env, parishId, subpath = '', ctx = null) {
  const limited = await rateLimit(
    request,
    env,
    request.method === 'GET' ? 'parish-dashboard' : 'parish-dashboard-write',
    { limit: request.method === 'GET' ? 80 : 40, windowSeconds: 300 }
  );
  if (limited) return limited;
  const context = await requireContext(request, env, parishId);
  if (context.response) return context.response;
  const registration = context.found.registration;
  const parts = String(subpath || '')
    .split('/')
    .filter(Boolean)
    .map(decodeURIComponent);

  try {
    if (!parts.length && request.method === 'GET') {
      return json({
        ok: true,
        followups: await listPastoralFollowups(env, parishId),
        memorials: await listMemorialMarkers(env, parishId),
        priests: normalizeSacramentPriests(registration),
      });
    }
    if (parts[0] === 'candidates' && parts.length === 1 && request.method === 'GET') {
      const search = new URL(request.url).searchParams.get('q') || '';
      return json({ ok: true, people: await listPastoralFollowupCandidates(env, parishId, search) });
    }
    if (!parts.length && request.method === 'POST') {
      const body = await bodyJson(request);
      const priest = configuredPriest(registration, body.assignedPriestName, body.assignedPriestEmail);
      if (!priest) throw new PastoralFollowUpError('Choose a priest configured for Sacraments & Services.');
      const followup = await createPastoralFollowup(env, {
        ...body,
        parishId,
        actor: actor(registration),
        assignedPriestName: priest.name,
        assignedPriestEmail: priest.email,
      });
      await audit(env, request, parishId, registration, {
        action: 'sacrament.pastoral_followup_created',
        targetId: followup.id,
        after: {
          personId: followup.personId,
          assignedPriestEmail: followup.assignedPriestEmail,
          nextDueOn: followup.nextDueOn,
        },
      });
      return json({ ok: true, followup }, { status: 201 });
    }
    if (parts[0] && parts.length === 1 && request.method === 'PATCH') {
      const body = await bodyJson(request);
      let priestFields = {};
      if (body.assignedPriestName !== undefined || body.assignedPriestEmail !== undefined) {
        const priest = configuredPriest(registration, body.assignedPriestName, body.assignedPriestEmail);
        if (!priest) throw new PastoralFollowUpError('Choose a priest configured for Sacraments & Services.');
        priestFields = { assignedPriestName: priest.name, assignedPriestEmail: priest.email };
      }
      const followup = await updatePastoralFollowup(env, {
        ...body,
        ...priestFields,
        id: parts[0],
        parishId,
        actor: actor(registration),
      });
      await audit(env, request, parishId, registration, {
        action: body.action === 'close' ? 'sacrament.pastoral_followup_closed' : 'sacrament.pastoral_followup_updated',
        targetId: followup.id,
        after: {
          status: followup.status,
          closureOutcome: followup.closureOutcome,
          assignedPriestEmail: followup.assignedPriestEmail,
          nextDueOn: followup.nextDueOn,
        },
      });
      return json({ ok: true, followup });
    }
    if (parts[0] && parts[1] === 'repose' && parts.length === 2 && request.method === 'POST') {
      const body = await bodyJson(request);
      const result = await recordRepose(env, {
        ...body,
        followupId: parts[0],
        parishId,
        actor: actor(registration),
      });
      await audit(env, request, parishId, registration, {
        action: 'sacrament.pastoral_repose_recorded',
        targetId: parts[0],
        after: {
          personId: result.personId,
          reposedOn: result.reposedOn,
          memorialMarkerCount: result.markers.length,
        },
      });
      if (ctx?.waitUntil) {
        ctx.waitUntil(
          notifyPriestOfRepose(env, registration, result).catch((error) =>
            console.error(
              JSON.stringify({ message: 'pastoral_repose_notification_failed', error: error?.message || String(error) })
            )
          )
        );
      }
      return json({ ok: true, ...result }, { status: 201 });
    }
    if (parts[0] === 'memorials' && parts[1] && parts.length === 2 && request.method === 'PATCH') {
      const body = await bodyJson(request);
      const marker = await updateMemorialMarker(env, {
        ...body,
        markerId: parts[1],
        parishId,
        actor: actor(registration),
      });
      await audit(env, request, parishId, registration, {
        action: 'sacrament.memorial_marker_updated',
        targetId: marker.id,
        targetType: 'sacrament_memorial_marker',
        after: { status: marker.status, scheduledFor: marker.scheduledFor },
      });
      return json({ ok: true, marker });
    }
    if (
      parts[0] === 'memorials' &&
      parts[1] &&
      parts[2] === 'schedule' &&
      parts.length === 3 &&
      request.method === 'POST'
    ) {
      const body = await bodyJson(request);
      const result = await scheduleMemorialService(env, {
        ...body,
        markerId: parts[1],
        parishId,
        actor: actor(registration),
      });
      const calendarSync = await syncSacramentRequestToGoogleCalendar(env, registration, result.request);
      await audit(env, request, parishId, registration, {
        action: 'sacrament.memorial_service_scheduled',
        targetId: result.marker.id,
        targetType: 'sacrament_memorial_marker',
        after: {
          serviceRequestId: result.request.id,
          scheduledFor: result.marker.scheduledFor,
          assignedPriestEmail: result.marker.assignedPriestEmail,
        },
      });
      return json({ ok: true, marker: result.marker, requestId: result.request.id, calendarSync }, { status: 201 });
    }
    if (parts[0] && parts[1] === 'contacts' && parts.length === 2 && request.method === 'POST') {
      const body = await bodyJson(request);
      const followup = await recordPastoralContact(env, {
        ...body,
        followupId: parts[0],
        parishId,
        actor: actor(registration),
      });
      await audit(env, request, parishId, registration, {
        action: 'sacrament.pastoral_contact_logged',
        targetId: followup.id,
        after: {
          contactType: body.contactType,
          contactedAt: body.contactedAt,
          status: followup.status,
          closureOutcome: followup.closureOutcome,
          nextDueOn: followup.nextDueOn,
        },
      });
      return json({ ok: true, followup }, { status: 201 });
    }
    return json({ error: 'Pastoral follow-up route not found.' }, { status: 404 });
  } catch (error) {
    if (error instanceof PastoralFollowUpError) {
      return json({ error: error.message }, { status: error.status });
    }
    if (/sacrament_(pastoral_followups|memorial_)|no such table/i.test(String(error?.message || error || ''))) {
      return json({ error: 'Pastoral follow-up is not installed yet.', setupRequired: true }, { status: 503 });
    }
    throw error;
  }
}
