// Generated from src/handlers/stewardship-meeting-api.ts by npm run build:server. Do not edit.
import { d1All, d1First, d1Run, hasProductionStore, json, missingProductionStoreResponse } from '../lib/core.js';
import '../lib/entitlements.js';
import './parish.js';
import './admin.js';
import '../lib/core.js';
import {
  apiFormFromMeetingPayload,
  isMissingStewardshipSchema,
  newId,
  parseJsonBody,
  publicMeeting,
  publicMeetingDetails,
} from './stewardship-http.js';
import './stewardship-presentation.js';
import './stewardship-packet-presentation.js';
import './stewardship-financials.js';
import './stewardship-communications.js';
import { STEWARDSHIP_COMING_SOON } from './stewardship-shared.js';
import {
  requireParishApiContext,
  stewardshipPublicStatus,
  hasStewardshipToolAccess,
  stewardshipComingSoonJson,
} from './stewardship-shared.js';
import './stewardship-billing.js';
import './stewardship.js';
import './stewardship-meeting-pages.js';
import './stewardship-metrics-page.js';
import {
  loadMeetingSubRecords,
  deleteMeetingSubRecords,
  saveMeetingSubRecords,
} from './stewardship-meeting-storage.js';
async function handleParishStewardshipMeetings(request, env, parishId) {
  try {
    if (!hasProductionStore(env)) return missingProductionStoreResponse();
    const ctx = await requireParishApiContext(request, env, parishId);
    if (!ctx.ok) return ctx.response;
    const { registration } = ctx;
    if (STEWARDSHIP_COMING_SOON) return stewardshipComingSoonJson();
    if (!hasStewardshipToolAccess(registration)) {
      return json(
        { error: 'Stewardship subscription required.', stewardship: stewardshipPublicStatus(registration) },
        { status: 402 }
      );
    }
    if (request.method === 'GET') {
      let meetings = [];
      try {
        meetings = await d1All(
          env,
          `
          SELECT *
          FROM stewardship_annual_meetings
          WHERE parish_id = ?
          ORDER BY fiscal_year DESC, created_at DESC
          LIMIT 50
        `,
          registration.parishId
        );
      } catch (error) {
        if (!isMissingStewardshipSchema(error)) throw error;
        return json(
          { ok: false, error: 'Stewardship database tables are not installed yet.', setupRequired: true },
          { status: 503 }
        );
      }
      return json({ ok: true, meetings: (meetings || []).map(publicMeeting) });
    }
    if (request.method !== 'POST') {
      return json(
        { error: `Method not allowed: ${request.method} is not supported on /stewardship/meetings (use GET or POST)` },
        { status: 405 }
      );
    }
    const body = await parseJsonBody(request);
    if (!body) return json({ error: 'Invalid JSON body' }, { status: 400 });
    const form = apiFormFromMeetingPayload(body);
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
      form.signature_line_count,
      form.note_line_count,
      form.action === 'ready' ? 'ready' : 'draft',
      null,
      now,
      now
    );
    await saveMeetingSubRecords(env, meetingId, form);
    const created = await d1First(
      env,
      'SELECT * FROM stewardship_annual_meetings WHERE id = ? AND parish_id = ?',
      meetingId,
      registration.parishId
    );
    const [agendaItems, reports, financialSummary, restrictedFunds, nominees, resolutions] =
      await loadMeetingSubRecords(env, meetingId);
    return json({
      ok: true,
      meeting: publicMeetingDetails(
        created,
        agendaItems,
        reports,
        financialSummary,
        restrictedFunds,
        nominees,
        resolutions
      ),
    });
  } catch (err) {
    return json({ error: 'Stewardship meetings request failed: ' + (err?.message || String(err)) }, { status: 500 });
  }
}
async function handleParishStewardshipMeetingDetail(request, env, parishId, meetingId) {
  try {
    if (!hasProductionStore(env)) return missingProductionStoreResponse();
    const ctx = await requireParishApiContext(request, env, parishId);
    if (!ctx.ok) return ctx.response;
    const { registration } = ctx;
    if (STEWARDSHIP_COMING_SOON) return stewardshipComingSoonJson();
    if (!hasStewardshipToolAccess(registration)) {
      return json(
        { error: 'Stewardship subscription required.', stewardship: stewardshipPublicStatus(registration) },
        { status: 402 }
      );
    }
    const meeting = await d1First(
      env,
      'SELECT * FROM stewardship_annual_meetings WHERE id = ? AND parish_id = ?',
      meetingId,
      registration.parishId
    );
    if (!meeting) return json({ error: 'Meeting not found' }, { status: 404 });
    if (request.method === 'GET') {
      const [agendaItems2, reports2, financialSummary2, restrictedFunds2, nominees2, resolutions2] =
        await loadMeetingSubRecords(env, meetingId);
      return json({
        ok: true,
        meeting: publicMeetingDetails(
          meeting,
          agendaItems2,
          reports2,
          financialSummary2,
          restrictedFunds2,
          nominees2,
          resolutions2
        ),
      });
    }
    if (request.method !== 'PATCH') return json({ error: 'Method not allowed' }, { status: 405 });
    const body = await parseJsonBody(request);
    if (!body) return json({ error: 'Invalid JSON body' }, { status: 400 });
    const form = apiFormFromMeetingPayload(body);
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
      form.signature_line_count,
      form.note_line_count,
      form.action === 'ready' ? 'ready' : 'draft',
      now,
      meetingId,
      registration.parishId
    );
    await deleteMeetingSubRecords(env, meetingId);
    await saveMeetingSubRecords(env, meetingId, form);
    const updated = await d1First(
      env,
      'SELECT * FROM stewardship_annual_meetings WHERE id = ? AND parish_id = ?',
      meetingId,
      registration.parishId
    );
    const [agendaItems, reports, financialSummary, restrictedFunds, nominees, resolutions] =
      await loadMeetingSubRecords(env, meetingId);
    return json({
      ok: true,
      meeting: publicMeetingDetails(
        updated,
        agendaItems,
        reports,
        financialSummary,
        restrictedFunds,
        nominees,
        resolutions
      ),
    });
  } catch (err) {
    return json({ error: 'Stewardship meeting request failed: ' + (err?.message || String(err)) }, { status: 500 });
  }
}
export { handleParishStewardshipMeetingDetail, handleParishStewardshipMeetings };
