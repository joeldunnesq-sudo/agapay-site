// Generated from src/handlers/stewardship-meeting-storage.ts by npm run build:server. Do not edit.
import { d1All, d1First, d1Run } from '../lib/core.js';
import '../lib/entitlements.js';
import './parish.js';
import './admin.js';
import '../lib/core.js';
import { displayToCents, newId } from './stewardship-http.js';
import './stewardship-presentation.js';
import './stewardship-packet-presentation.js';
import './stewardship-financials.js';
import './stewardship-communications.js';
import './stewardship-shared.js';
import './stewardship-shared.js';
import './stewardship-billing.js';
import './stewardship.js';
import './stewardship-meeting-api.js';
import './stewardship-meeting-pages.js';
import './stewardship-metrics-page.js';
async function loadMeetingSubRecords(env, meetingId) {
  return Promise.all([
    d1All(env, 'SELECT * FROM stewardship_agenda_items WHERE annual_meeting_id = ? ORDER BY sort_order', meetingId),
    d1All(env, 'SELECT * FROM stewardship_reports WHERE annual_meeting_id = ? ORDER BY sort_order', meetingId),
    d1First(env, 'SELECT * FROM stewardship_financial_summaries WHERE annual_meeting_id = ?', meetingId),
    d1All(
      env,
      'SELECT * FROM stewardship_restricted_fund_snapshots WHERE annual_meeting_id = ? ORDER BY sort_order',
      meetingId
    ),
    d1All(env, 'SELECT * FROM stewardship_nominees WHERE annual_meeting_id = ? ORDER BY sort_order', meetingId),
    d1All(env, 'SELECT * FROM stewardship_resolutions WHERE annual_meeting_id = ? ORDER BY sort_order', meetingId),
  ]);
}
async function deleteMeetingSubRecords(env, meetingId) {
  await Promise.all([
    d1Run(env, 'DELETE FROM stewardship_agenda_items WHERE annual_meeting_id = ?', meetingId),
    d1Run(env, 'DELETE FROM stewardship_reports WHERE annual_meeting_id = ?', meetingId),
    d1Run(env, 'DELETE FROM stewardship_financial_summaries WHERE annual_meeting_id = ?', meetingId),
    d1Run(env, 'DELETE FROM stewardship_restricted_fund_snapshots WHERE annual_meeting_id = ?', meetingId),
    d1Run(env, 'DELETE FROM stewardship_nominees WHERE annual_meeting_id = ?', meetingId),
    d1Run(env, 'DELETE FROM stewardship_resolutions WHERE annual_meeting_id = ?', meetingId),
  ]);
}
async function saveMeetingSubRecords(env, meetingId, form) {
  const now = /* @__PURE__ */ new Date().toISOString();
  const agendaTitles = [].concat(form.agenda_title || []);
  const agendaDurations = [].concat(form.agenda_duration || []);
  for (let i = 0; i < agendaTitles.length; i++) {
    if (!agendaTitles[i]?.trim()) continue;
    await d1Run(
      env,
      `
      INSERT INTO stewardship_agenda_items (id, annual_meeting_id, title, duration_minutes, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
      await newId(),
      meetingId,
      agendaTitles[i].trim(),
      parseInt(agendaDurations[i]) || null,
      i,
      now
    );
  }
  const rTypes = [].concat(form.report_type || []);
  const rTitles = [].concat(form.report_title || []);
  const rBodies = [].concat(form.report_body || []);
  const rSignedBy = [].concat(form.report_signed_by || []);
  for (let i = 0; i < rTitles.length; i++) {
    if (!rTitles[i]?.trim()) continue;
    await d1Run(
      env,
      `
      INSERT INTO stewardship_reports (id, annual_meeting_id, report_type, title, body, created_by, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      await newId(),
      meetingId,
      rTypes[i] || 'custom',
      rTitles[i].trim(),
      rBodies[i] || '',
      rSignedBy[i]?.trim() || null,
      i,
      now,
      now
    );
  }
  if (form.fin_income || form.fin_expense) {
    const income = displayToCents(form.fin_income);
    const expense = displayToCents(form.fin_expense);
    await d1Run(
      env,
      `
      INSERT INTO stewardship_financial_summaries
        (id, annual_meeting_id, total_income_cents, total_expense_cents, net_cents, notes, snapshot_taken_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      await newId(),
      meetingId,
      income,
      expense,
      income - expense,
      form.fin_notes || null,
      now,
      now,
      now
    );
  }
  const fNames = [].concat(form.fund_name || []);
  const fBegin = [].concat(form.fund_begin || []);
  const fReceived = [].concat(form.fund_received || []);
  const fDisbursed = [].concat(form.fund_disbursed || []);
  const fEnding = [].concat(form.fund_ending || []);
  for (let i = 0; i < fNames.length; i++) {
    if (!fNames[i]?.trim()) continue;
    await d1Run(
      env,
      `
      INSERT INTO stewardship_restricted_fund_snapshots
        (id, annual_meeting_id, fund_name, beginning_balance_cents, total_received_cents,
         total_disbursed_cents, ending_balance_cents, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      await newId(),
      meetingId,
      fNames[i].trim(),
      displayToCents(fBegin[i]),
      displayToCents(fReceived[i]),
      displayToCents(fDisbursed[i]),
      displayToCents(fEnding[i]),
      i,
      now
    );
  }
  const nNames = [].concat(form.nominee_name || []);
  const nPositions = [].concat(form.nominee_position || []);
  const nBios = [].concat(form.nominee_bio || []);
  const nNominatedBy = [].concat(form.nominee_nominated_by || []);
  for (let i = 0; i < nNames.length; i++) {
    if (!nNames[i]?.trim()) continue;
    await d1Run(
      env,
      `
      INSERT INTO stewardship_nominees (id, annual_meeting_id, full_name, position, bio, nominated_by, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
      await newId(),
      meetingId,
      nNames[i].trim(),
      nPositions[i] || null,
      nBios[i]?.trim() || null,
      nNominatedBy[i]?.trim() || null,
      i,
      now
    );
  }
  const resTitles = [].concat(form.resolution_title || []);
  const resResolved = [].concat(form.resolution_resolved || []);
  for (let i = 0; i < resTitles.length; i++) {
    if (!resTitles[i]?.trim()) continue;
    await d1Run(
      env,
      `
      INSERT INTO stewardship_resolutions (id, annual_meeting_id, title, resolved_text, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
      await newId(),
      meetingId,
      resTitles[i].trim(),
      resResolved[i] || null,
      i,
      now
    );
  }
}
export { deleteMeetingSubRecords, loadMeetingSubRecords, saveMeetingSubRecords };
