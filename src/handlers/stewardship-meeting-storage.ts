import type {
  StewardshipEnvironment,
  StewardshipForm,
  MeetingItem,
  MeetingFinancialSummary,
} from './stewardship-composition-contracts.js';

// src/handlers/stewardship.js
// AGAPAY Stewardship module — Parish-tier annual meeting packet builder.
// All routes live under /parish/stewardship/*.
// Parish auth is already verified by requireAdmin / requireParish helpers in parish.js
// before these handlers are called.

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
export async function loadMeetingSubRecords(env: StewardshipEnvironment, meetingId: string) {
  return Promise.all([
    d1All<MeetingItem>(
      env,
      'SELECT * FROM stewardship_agenda_items WHERE annual_meeting_id = ? ORDER BY sort_order',
      meetingId
    ),
    d1All<MeetingItem>(
      env,
      'SELECT * FROM stewardship_reports WHERE annual_meeting_id = ? ORDER BY sort_order',
      meetingId
    ),
    d1First<MeetingFinancialSummary>(
      env,
      'SELECT * FROM stewardship_financial_summaries WHERE annual_meeting_id = ?',
      meetingId
    ),
    d1All<MeetingItem>(
      env,
      'SELECT * FROM stewardship_restricted_fund_snapshots WHERE annual_meeting_id = ? ORDER BY sort_order',
      meetingId
    ),
    d1All<MeetingItem>(
      env,
      'SELECT * FROM stewardship_nominees WHERE annual_meeting_id = ? ORDER BY sort_order',
      meetingId
    ),
    d1All<MeetingItem>(
      env,
      'SELECT * FROM stewardship_resolutions WHERE annual_meeting_id = ? ORDER BY sort_order',
      meetingId
    ),
  ]);
}
export async function deleteMeetingSubRecords(env: StewardshipEnvironment, meetingId: string) {
  await Promise.all([
    d1Run(env, 'DELETE FROM stewardship_agenda_items WHERE annual_meeting_id = ?', meetingId),
    d1Run(env, 'DELETE FROM stewardship_reports WHERE annual_meeting_id = ?', meetingId),
    d1Run(env, 'DELETE FROM stewardship_financial_summaries WHERE annual_meeting_id = ?', meetingId),
    d1Run(env, 'DELETE FROM stewardship_restricted_fund_snapshots WHERE annual_meeting_id = ?', meetingId),
    d1Run(env, 'DELETE FROM stewardship_nominees WHERE annual_meeting_id = ?', meetingId),
    d1Run(env, 'DELETE FROM stewardship_resolutions WHERE annual_meeting_id = ?', meetingId),
  ]);
}
export async function saveMeetingSubRecords(env: StewardshipEnvironment, meetingId: string, form: StewardshipForm) {
  const now = new Date().toISOString();

  // Agenda items
  const agendaTitles = ([] as string[]).concat(form.agenda_title || []);
  const agendaDurations = ([] as (string | number)[]).concat(form.agenda_duration || []);
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
      parseInt(agendaDurations[i] as string) || null,
      i,
      now
    );
  }

  // Reports
  const rTypes = ([] as string[]).concat(form.report_type || []);
  const rTitles = ([] as string[]).concat(form.report_title || []);
  const rBodies = ([] as string[]).concat(form.report_body || []);
  const rSignedBy = ([] as string[]).concat(form.report_signed_by || []);
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

  // Financial summary
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

  // Restricted funds
  const fNames = ([] as string[]).concat(form.fund_name || []);
  const fBegin = ([] as (string | number)[]).concat(form.fund_begin || []);
  const fReceived = ([] as (string | number)[]).concat(form.fund_received || []);
  const fDisbursed = ([] as (string | number)[]).concat(form.fund_disbursed || []);
  const fEnding = ([] as (string | number)[]).concat(form.fund_ending || []);
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

  // Nominees
  const nNames = ([] as string[]).concat(form.nominee_name || []);
  const nPositions = ([] as string[]).concat(form.nominee_position || []);
  const nBios = ([] as string[]).concat(form.nominee_bio || []);
  const nNominatedBy = ([] as string[]).concat(form.nominee_nominated_by || []);
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

  // Resolutions
  const resTitles = ([] as string[]).concat(form.resolution_title || []);
  const resResolved = ([] as string[]).concat(form.resolution_resolved || []);
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
