// Generated from src/handlers/stewardship-meeting-pages.ts by npm run build:server. Do not edit.
import { d1First, d1Run, hasProductionStore, json, missingProductionStoreResponse, unauthorized } from '../lib/core.js';
import '../lib/entitlements.js';
import { absoluteWebsiteUrl } from './parish.js';
import './admin.js';
import '../lib/core.js';
import { newId, packetLineCount, parseFormBody } from './stewardship-http.js';
import { annualMeetingFormHtml } from './stewardship-presentation.js';
import { packetPreviewHtml } from './stewardship-packet-presentation.js';
import './stewardship-financials.js';
import './stewardship-communications.js';
import { STEWARDSHIP_COMING_SOON } from './stewardship-shared.js';
import { requireParishContext, hasStewardshipToolAccess, stewardshipComingSoonHtml } from './stewardship-shared.js';
import './stewardship-billing.js';
import { handleStewardshipHome } from './stewardship.js';
import './stewardship-meeting-api.js';
import './stewardship-metrics-page.js';
import {
  loadMeetingSubRecords,
  deleteMeetingSubRecords,
  saveMeetingSubRecords,
} from './stewardship-meeting-storage.js';
async function handleStewardshipMeetingList(request, env) {
  return handleStewardshipHome(request, env);
}
async function handleStewardshipMeetingNew(request, env) {
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const ctx = await requireParishContext(request, env);
  if (!ctx.ok) return ctx.response;
  const { registration } = ctx;
  if (STEWARDSHIP_COMING_SOON) {
    return new Response(stewardshipComingSoonHtml(registration, env), {
      status: request.method === 'GET' ? 200 : 409,
      headers: { 'Content-Type': 'text/html;charset=utf-8' },
    });
  }
  if (!hasStewardshipToolAccess(registration)) {
    return Response.redirect(absoluteWebsiteUrl(env.AGAPAY_PUBLIC_URL) + '/parish/stewardship', 303);
  }
  if (request.method === 'GET') {
    return new Response(annualMeetingFormHtml(registration, null, [], [], null, [], [], [], env), {
      headers: { 'Content-Type': 'text/html;charset=utf-8' },
    });
  }
  const form = await parseFormBody(request);
  const meetingId = await newId();
  const now = /* @__PURE__ */ new Date().toISOString();
  await d1Run(
    env,
    `
    INSERT INTO stewardship_annual_meetings
      (id, parish_id, title, fiscal_year, meeting_date, meeting_time, location,
       parish_name_override, jurisdiction, address, signature_line_count, note_line_count,
       status, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    meetingId,
    registration.parishId,
    form.title || 'Annual Meeting',
    parseInt(form.fiscal_year) || /* @__PURE__ */ new Date().getFullYear(),
    form.meeting_date || null,
    form.meeting_time || null,
    form.location || null,
    form.parish_name_override || null,
    form.jurisdiction || null,
    form.address || null,
    packetLineCount(form.signature_line_count, 24, { min: 1 }),
    packetLineCount(form.note_line_count, 12),
    form.action === 'ready' ? 'ready' : 'draft',
    ctx.userEmail || null,
    now,
    now
  );
  await saveMeetingSubRecords(env, meetingId, form);
  return Response.redirect(
    absoluteWebsiteUrl(env.AGAPAY_PUBLIC_URL) + '/parish/stewardship/annual-meetings/' + meetingId,
    303
  );
}
async function handleStewardshipMeetingEdit(request, env, meetingId) {
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const ctx = await requireParishContext(request, env);
  if (!ctx.ok) return ctx.response;
  const { registration } = ctx;
  if (STEWARDSHIP_COMING_SOON) {
    return new Response(stewardshipComingSoonHtml(registration, env), {
      status: request.method === 'GET' ? 200 : 409,
      headers: { 'Content-Type': 'text/html;charset=utf-8' },
    });
  }
  if (!hasStewardshipToolAccess(registration)) {
    return Response.redirect(absoluteWebsiteUrl(env.AGAPAY_PUBLIC_URL) + '/parish/stewardship', 303);
  }
  const meeting = await d1First(
    env,
    'SELECT * FROM stewardship_annual_meetings WHERE id = ? AND parish_id = ?',
    meetingId,
    registration.parishId
  );
  if (!meeting) return json({ error: 'Not found' }, { status: 404 });
  if (request.method === 'GET') {
    const [agendaItems, reports, financialSummary, restrictedFunds, nominees, resolutions] =
      await loadMeetingSubRecords(env, meetingId);
    return new Response(
      annualMeetingFormHtml(
        registration,
        meeting,
        agendaItems,
        reports,
        financialSummary,
        restrictedFunds,
        nominees,
        resolutions,
        env
      ),
      { headers: { 'Content-Type': 'text/html;charset=utf-8' } }
    );
  }
  const form = await parseFormBody(request);
  const now = /* @__PURE__ */ new Date().toISOString();
  await d1Run(
    env,
    `
    UPDATE stewardship_annual_meetings SET
      title = ?, fiscal_year = ?, meeting_date = ?, meeting_time = ?, location = ?,
      parish_name_override = ?, jurisdiction = ?, address = ?,
      signature_line_count = ?, note_line_count = ?, status = ?, updated_at = ?
    WHERE id = ? AND parish_id = ?
  `,
    form.title || meeting.title,
    parseInt(form.fiscal_year) || meeting.fiscal_year,
    form.meeting_date || null,
    form.meeting_time || null,
    form.location || null,
    form.parish_name_override || null,
    form.jurisdiction || null,
    form.address || null,
    packetLineCount(form.signature_line_count, meeting.signature_line_count || 24, { min: 1 }),
    packetLineCount(form.note_line_count, meeting.note_line_count ?? 12),
    form.action === 'ready' ? 'ready' : form.action === 'save' ? 'draft' : meeting.status,
    now,
    meetingId,
    registration.parishId
  );
  await deleteMeetingSubRecords(env, meetingId);
  await saveMeetingSubRecords(env, meetingId, form);
  return Response.redirect(
    absoluteWebsiteUrl(env.AGAPAY_PUBLIC_URL) + '/parish/stewardship/annual-meetings/' + meetingId,
    303
  );
}
async function handleStewardshipMeetingPreview(request, env, meetingId) {
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const ctx = await requireParishContext(request, env);
  if (!ctx.ok) return ctx.response;
  const { registration } = ctx;
  if (STEWARDSHIP_COMING_SOON) {
    return new Response(stewardshipComingSoonHtml(registration, env), {
      headers: { 'Content-Type': 'text/html;charset=utf-8' },
    });
  }
  if (!hasStewardshipToolAccess(registration)) {
    return Response.redirect(absoluteWebsiteUrl(env.AGAPAY_PUBLIC_URL) + '/parish/stewardship', 303);
  }
  const meeting = await d1First(
    env,
    'SELECT * FROM stewardship_annual_meetings WHERE id = ? AND parish_id = ?',
    meetingId,
    registration.parishId
  );
  if (!meeting) return json({ error: 'Not found' }, { status: 404 });
  const [agendaItems, reports, financialSummary, restrictedFunds, nominees, resolutions] = await loadMeetingSubRecords(
    env,
    meetingId
  );
  return new Response(
    packetPreviewHtml(
      registration,
      meeting,
      agendaItems,
      reports,
      financialSummary,
      restrictedFunds,
      nominees,
      resolutions,
      false,
      env
    ),
    { headers: { 'Content-Type': 'text/html;charset=utf-8' } }
  );
}
async function handleStewardshipMeetingPdf(request, env, meetingId) {
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const ctx = await requireParishContext(request, env);
  if (!ctx.ok) return ctx.response;
  const { registration } = ctx;
  if (STEWARDSHIP_COMING_SOON) {
    return new Response(stewardshipComingSoonHtml(registration, env), {
      status: 409,
      headers: { 'Content-Type': 'text/html;charset=utf-8' },
    });
  }
  if (!hasStewardshipToolAccess(registration)) {
    return unauthorized('Stewardship subscription required');
  }
  const meeting = await d1First(
    env,
    'SELECT * FROM stewardship_annual_meetings WHERE id = ? AND parish_id = ?',
    meetingId,
    registration.parishId
  );
  if (!meeting) return json({ error: 'Not found' }, { status: 404 });
  const [agendaItems, reports, financialSummary, restrictedFunds, nominees, resolutions] = await loadMeetingSubRecords(
    env,
    meetingId
  );
  await d1Run(
    env,
    `
    INSERT INTO stewardship_generated_packets (id, annual_meeting_id, generated_by, generated_at)
    VALUES (?, ?, ?, ?)
  `,
    await newId(),
    meetingId,
    ctx.userEmail || null,
    /* @__PURE__ */ new Date().toISOString()
  );
  await d1Run(
    env,
    "UPDATE stewardship_annual_meetings SET status = 'generated', updated_at = ? WHERE id = ?",
    /* @__PURE__ */ new Date().toISOString(),
    meetingId
  );
  const html = packetPreviewHtml(
    registration,
    meeting,
    agendaItems,
    reports,
    financialSummary,
    restrictedFunds,
    nominees,
    resolutions,
    true,
    env
  );
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html;charset=utf-8',
      'Content-Disposition': `inline; filename="annual-meeting-${meeting.fiscal_year}.html"`,
    },
  });
}
export {
  handleStewardshipMeetingEdit,
  handleStewardshipMeetingList,
  handleStewardshipMeetingNew,
  handleStewardshipMeetingPdf,
  handleStewardshipMeetingPreview,
};
