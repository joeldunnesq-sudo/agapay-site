// Generated from src/handlers/stewardship-http.ts by npm run build:server. Do not edit.
import { generateSecret } from '../lib/core.js';
function dashboardNav(registration, activeSection, base) {
  const parishName = registration.parishName || registration.name || 'Parish';
  return `<nav class="dashboard-nav">
    <div class="nav-brand">
      <a href="/parish"><img src="${base}/mark.png" alt="AGAPAY" class="nav-mark" /></a>
      <span class="nav-parish-name">${escHtml(parishName)}</span>
    </div>
    <ul class="nav-links">
      <li class="${activeSection === 'home' ? 'active' : ''}"><a href="/parish">Dashboard</a></li>
      <li class="${activeSection === 'giving' ? 'active' : ''}"><a href="/parish/give">Giving</a></li>
      <li class="${activeSection === 'commemorations' ? 'active' : ''}"><a href="/parish/commemorations">Commemorations</a></li>
      <li class="${activeSection === 'campaigns' ? 'active' : ''}"><a href="/parish/campaigns">Campaigns</a></li>
      <li class="${activeSection === 'stewardship' ? 'active' : ''}"><a href="/parish/stewardship">Stewardship</a></li>
      <li class="${activeSection === 'settings' ? 'active' : ''}"><a href="/parish/settings">Settings</a></li>
    </ul>
  </nav>`;
}
function registrationAddressLine(registration = {}) {
  return [
    registration.addressLine1,
    registration.addressLine2,
    [registration.city, registration.state, registration.postalCode].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ');
}
function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function escAttr(s) {
  return String(s || '')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function stewardshipSessionScript() {
  return `<script>
    (function () {
      var qs = window.location.search || "";
      if (!qs) return;
      function withSession(value) {
        try {
          var url = new URL(value, window.location.origin);
          if (url.origin !== window.location.origin || !url.pathname.startsWith("/parish/stewardship")) return value;
          var current = new URLSearchParams(qs);
          if (!url.searchParams.get("parishId") && current.get("parishId")) url.searchParams.set("parishId", current.get("parishId"));
          if (!url.searchParams.get("t") && current.get("t")) url.searchParams.set("t", current.get("t"));
          return url.pathname + url.search + url.hash;
        } catch {
          return value;
        }
      }
      document.querySelectorAll("a[href^='/parish/stewardship']").forEach(function (link) {
        link.setAttribute("href", withSession(link.getAttribute("href")));
      });
      document.querySelectorAll("form[action^='/parish/stewardship']").forEach(function (form) {
        form.setAttribute("action", withSession(form.getAttribute("action")));
      });
    })();
  <\/script>`;
}
function centsToDisplay(cents) {
  if (!cents) return '';
  return (cents / 100).toFixed(2);
}
function displayToCents(s) {
  const n = parseFloat(String(s || '').replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? 0 : Math.round(n * 100);
}
function newId() {
  return generateSecret(16);
}
function parseRepeatedField(formData, key) {
  const raw = formData.getAll ? formData.getAll(key) : [];
  return Array.isArray(raw) ? raw : [raw].filter(Boolean);
}
async function parseFormBody(request) {
  const text = await request.text();
  const params = new URLSearchParams(text);
  const result = {};
  for (const [key, value] of params.entries()) {
    if (key.endsWith('[]')) {
      const bare = key.slice(0, -2);
      if (!result[bare]) result[bare] = [];
      result[bare].push(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}
async function parseJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
function centsFromApi(value) {
  if (value === null || value === void 0 || value === '') return 0;
  return Math.round(Number(value) * 100) || 0;
}
function packetLineCount(value, fallback, { min = 0, max = 200 } = {}) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}
function apiFormFromMeetingPayload(payload = {}) {
  const agendaItems = Array.isArray(payload.agendaItems) ? payload.agendaItems : [];
  const reports = Array.isArray(payload.reports) ? payload.reports : [];
  const restrictedFunds = Array.isArray(payload.restrictedFunds) ? payload.restrictedFunds : [];
  const nominees = Array.isArray(payload.nominees) ? payload.nominees : [];
  const resolutions = Array.isArray(payload.resolutions) ? payload.resolutions : [];
  const financialSummary = payload.financialSummary || {};
  return {
    title: payload.title || 'Annual Meeting',
    fiscal_year: payload.fiscalYear || payload.fiscal_year || /* @__PURE__ */ new Date().getFullYear(),
    meeting_date: payload.meetingDate || payload.meeting_date || '',
    meeting_time: payload.meetingTime || payload.meeting_time || '',
    location: payload.location || '',
    parish_name_override: payload.parishNameOverride || payload.parish_name_override || '',
    jurisdiction: payload.jurisdiction || '',
    address: payload.address || '',
    signature_line_count: packetLineCount(payload.signatureLineCount ?? payload.signature_line_count, 24, { min: 1 }),
    note_line_count: packetLineCount(payload.noteLineCount ?? payload.note_line_count, 12),
    action: payload.status === 'ready' || payload.action === 'ready' ? 'ready' : 'save',
    agenda_id: agendaItems.map((item) => item.id || ''),
    agenda_title: agendaItems.map((item) => item.title || ''),
    agenda_duration: agendaItems.map((item) => item.durationMinutes || item.duration_minutes || ''),
    report_id: reports.map((item) => item.id || ''),
    report_type: reports.map((item) => item.reportType || item.report_type || 'stewardship'),
    report_title: reports.map((item) => item.title || ''),
    report_body: reports.map((item) => item.body || ''),
    report_signed_by: reports.map((item) => item.createdBy || item.created_by || item.signedBy || item.signed_by || ''),
    fin_income: financialSummary.totalIncome ?? financialSummary.total_income ?? '',
    fin_expense: financialSummary.totalExpense ?? financialSummary.total_expense ?? '',
    fin_notes: financialSummary.notes || '',
    fund_id: restrictedFunds.map((item) => item.id || ''),
    fund_name: restrictedFunds.map((item) => item.fundName || item.fund_name || ''),
    fund_begin: restrictedFunds.map((item) => item.beginningBalance ?? item.beginning_balance ?? ''),
    fund_received: restrictedFunds.map((item) => item.totalReceived ?? item.total_received ?? ''),
    fund_disbursed: restrictedFunds.map((item) => item.totalDisbursed ?? item.total_disbursed ?? ''),
    fund_ending: restrictedFunds.map((item) => item.endingBalance ?? item.ending_balance ?? ''),
    nominee_id: nominees.map((item) => item.id || ''),
    nominee_name: nominees.map((item) => item.fullName || item.full_name || ''),
    nominee_position: nominees.map((item) => item.position || ''),
    nominee_bio: nominees.map((item) => item.bio || ''),
    nominee_nominated_by: nominees.map((item) => item.nominatedBy || item.nominated_by || ''),
    resolution_id: resolutions.map((item) => item.id || ''),
    resolution_title: resolutions.map((item) => item.title || ''),
    resolution_resolved: resolutions.map((item) => item.resolvedText || item.resolved_text || item.body || ''),
  };
}
function publicMeeting(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title || '',
    fiscalYear: Number(row.fiscal_year) || /* @__PURE__ */ new Date().getFullYear(),
    meetingDate: row.meeting_date || '',
    meetingTime: row.meeting_time || '',
    location: row.location || '',
    parishNameOverride: row.parish_name_override || '',
    jurisdiction: row.jurisdiction || '',
    address: row.address || '',
    signatureLineCount: packetLineCount(row.signature_line_count, 24, { min: 1 }),
    noteLineCount: packetLineCount(row.note_line_count, 12),
    status: row.status || 'draft',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  };
}
function publicMeetingDetails(meeting, agendaItems, reports, financialSummary, restrictedFunds, nominees, resolutions) {
  return {
    ...publicMeeting(meeting),
    agendaItems: (agendaItems || []).map((item) => ({
      id: item.id,
      title: item.title || '',
      description: item.description || '',
      durationMinutes: item.duration_minutes || '',
    })),
    reports: (reports || []).map((item) => ({
      id: item.id,
      reportType: item.report_type || 'stewardship',
      title: item.title || '',
      body: item.body || '',
      createdBy: item.created_by || '',
    })),
    financialSummary: financialSummary
      ? {
          totalIncomeCents: financialSummary.total_income_cents || 0,
          totalExpenseCents: financialSummary.total_expense_cents || 0,
          netCents: financialSummary.net_cents || 0,
          notes: financialSummary.notes || '',
        }
      : {
          totalIncomeCents: 0,
          totalExpenseCents: 0,
          netCents: 0,
          notes: '',
        },
    restrictedFunds: (restrictedFunds || []).map((item) => ({
      id: item.id,
      fundName: item.fund_name || '',
      beginningBalanceCents: item.beginning_balance_cents || 0,
      totalReceivedCents: item.total_received_cents || 0,
      totalDisbursedCents: item.total_disbursed_cents || 0,
      endingBalanceCents: item.ending_balance_cents || 0,
      notes: item.notes || '',
    })),
    nominees: (nominees || []).map((item) => ({
      id: item.id,
      fullName: item.full_name || '',
      position: item.position || '',
      bio: item.bio || '',
      nominatedBy: item.nominated_by || '',
    })),
    resolutions: (resolutions || []).map((item) => ({
      id: item.id,
      title: item.title || '',
      body: item.body || '',
      resolvedText: item.resolved_text || '',
    })),
  };
}
function isMissingStewardshipSchema(error) {
  return /stewardship_annual_meetings|no such table|not found/i.test(String(error?.message || error || ''));
}
export {
  apiFormFromMeetingPayload,
  centsFromApi,
  centsToDisplay,
  dashboardNav,
  displayToCents,
  escAttr,
  escHtml,
  isMissingStewardshipSchema,
  newId,
  packetLineCount,
  parseFormBody,
  parseJsonBody,
  parseRepeatedField,
  publicMeeting,
  publicMeetingDetails,
  registrationAddressLine,
  stewardshipSessionScript,
};
