// src/handlers/stewardship-packet-presentation.js
// Annual-meeting packet preview and PDF-ready rendering.

import { absoluteWebsiteUrl } from './parish.js';
import {
  escAttr,
  escHtml,
  packetLineCount,
  registrationAddressLine,
  stewardshipSessionScript,
} from './stewardship-http.js';

export function packetPreviewHtml(
  registration,
  meeting,
  agendaItems,
  reports,
  financialSummary,
  restrictedFunds,
  nominees,
  resolutions,
  isPdf,
  env
) {
  // A meeting saved before its Financial Summary section was filled in has no
  // row in stewardship_financial_summaries at all — d1First then returns null
  // rather than an empty object, which crashed every property access below.
  financialSummary = financialSummary || {};
  const base = absoluteWebsiteUrl(env.AGAPAY_PUBLIC_URL);
  const parishName = meeting.parish_name_override || registration.parishName || registration.name || 'Parish';
  const jurisdiction = meeting.jurisdiction || registration.jurisdiction || '';
  const address = meeting.address || registrationAddressLine(registration) || '';
  const location = meeting.location || '';
  const fiscalYear = meeting.fiscal_year || new Date().getFullYear();
  const meetingDate = meeting.meeting_date
    ? new Date(meeting.meeting_date + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'Date TBD';
  const meetingTime = meeting.meeting_time
    ? new Date('2000-01-01T' + meeting.meeting_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : '';
  const signatureLineCount = packetLineCount(meeting.signature_line_count, 24, { min: 1 });
  const noteLineCount = packetLineCount(meeting.note_line_count, 12);

  const fmt = (cents) =>
    cents
      ? '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : '$0.00';

  // ── Sections ──────────────────────────────────────────────────────────────

  const noticeSection = `
    <section class="pk-section pk-page-break">
      <div class="pk-section-rule"><span>Notice</span></div>
      <h2 class="pk-section-heading">Notice of Annual Parish Meeting</h2>
      <p class="pk-body">Notice is hereby given that the Annual Parish Meeting of <strong>${escHtml(parishName)}</strong> will be held on <strong>${meetingDate}</strong>${meetingTime ? ' at ' + meetingTime : ''}${location ? ' at ' + escHtml(location) : ''}.</p>
      <p class="pk-body">The purpose of the meeting is to receive annual reports, review the financial statement, elect parish council members, consider resolutions, and transact such other business as may properly come before the meeting.</p>
      <p class="pk-body pk-body--muted">In the name of the Father, and of the Son, and of the Holy Spirit.</p>
    </section>`;

  const agendaSection = agendaItems?.length
    ? `
    <section class="pk-section">
      <div class="pk-section-rule"><span>Order of Business</span></div>
      <h2 class="pk-section-heading">Agenda</h2>
      <ol class="pk-agenda">
        ${agendaItems
          .map(
            (item) => `
          <li class="pk-agenda-item">
            <span class="pk-agenda-title">${escHtml(item.title)}</span>
            ${item.duration_minutes ? `<span class="pk-agenda-dur">${item.duration_minutes}&thinsp;min</span>` : ''}
          </li>`
          )
          .join('')}
      </ol>
    </section>`
    : '';

  const reportsSection = reports?.length
    ? `
    <section class="pk-section pk-page-break">
      <div class="pk-section-rule"><span>Reports</span></div>
      ${reports
        .map(
          (r, i) => `
        <div class="pk-report${i > 0 ? ' pk-report--border' : ''}">
          <h2 class="pk-report-heading">${escHtml(r.title)}</h2>
          <div class="pk-report-body">
            ${
              r.body
                ? r.body
                    .split(/\n+/)
                    .filter((p) => p.trim())
                    .map((p) => `<p class="pk-body">${escHtml(p)}</p>`)
                    .join('')
                : `<p class="pk-body pk-body--placeholder">[Report content will appear here.]</p>`
            }
          </div>
          ${r.created_by ? `<p class="pk-report-sig">${escHtml(r.created_by)}</p>` : ''}
        </div>`
        )
        .join('')}
    </section>`
    : '';

  const finSection = financialSummary
    ? (() => {
        const income = financialSummary.total_income_cents || 0;
        const expense = financialSummary.total_expense_cents || 0;
        const net = financialSummary.net_cents ?? income - expense;
        const netSign = net >= 0 ? 'surplus' : 'deficit';
        return `
    <section class="pk-section pk-page-break">
      <div class="pk-section-rule"><span>Financials</span></div>
      <h2 class="pk-section-heading">Financial Summary &mdash; Fiscal Year ${fiscalYear}</h2>
      <table class="pk-fin-table">
        <tbody>
          <tr class="pk-fin-row">
            <th class="pk-fin-label">Total Income</th>
            <td class="pk-fin-value pk-fin-income">${fmt(income)}</td>
          </tr>
          <tr class="pk-fin-row">
            <th class="pk-fin-label">Total Expenses</th>
            <td class="pk-fin-value pk-fin-expense">${fmt(expense)}</td>
          </tr>
          <tr class="pk-fin-row pk-fin-net">
            <th class="pk-fin-label">Net ${net >= 0 ? 'Surplus' : 'Deficit'}</th>
            <td class="pk-fin-value pk-fin-net-${netSign}">${fmt(Math.abs(net))}</td>
          </tr>
        </tbody>
      </table>
      ${financialSummary.notes ? `<p class="pk-body pk-fin-notes">${escHtml(financialSummary.notes)}</p>` : ''}
    </section>`;
      })()
    : '';

  const fundsSection = restrictedFunds?.length
    ? `
    <section class="pk-section">
      <div class="pk-section-rule"><span>Restricted Funds</span></div>
      <h2 class="pk-section-heading">Restricted Fund Report</h2>
      <div class="pk-table-wrap">
        <table class="pk-table">
          <thead>
            <tr>
              <th class="pk-th">Fund</th>
              <th class="pk-th pk-th-right">Beginning</th>
              <th class="pk-th pk-th-right">Received</th>
              <th class="pk-th pk-th-right">Disbursed</th>
              <th class="pk-th pk-th-right">Ending</th>
            </tr>
          </thead>
          <tbody>
            ${restrictedFunds
              .map(
                (f) => `
              <tr class="pk-tr">
                <td class="pk-td pk-fund-name">${escHtml(f.fund_name)}</td>
                <td class="pk-td pk-td-right">${fmt(f.beginning_balance_cents)}</td>
                <td class="pk-td pk-td-right pk-fin-income">${fmt(f.total_received_cents)}</td>
                <td class="pk-td pk-td-right pk-fin-expense">${fmt(f.total_disbursed_cents)}</td>
                <td class="pk-td pk-td-right pk-fin-net-surplus">${fmt(f.ending_balance_cents)}</td>
              </tr>
              ${f.notes ? `<tr class="pk-tr pk-tr-notes"><td colspan="5" class="pk-td pk-td-notes">${escHtml(f.notes)}</td></tr>` : ''}`
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </section>`
    : '';

  const nomineesSection = nominees?.length
    ? `
    <section class="pk-section">
      <div class="pk-section-rule"><span>Elections</span></div>
      <h2 class="pk-section-heading">Parish Council Nominations</h2>
      <div class="pk-nominees">
        ${nominees
          .map(
            (n) => `
          <div class="pk-nominee">
            <strong class="pk-nominee-name">${escHtml(n.full_name)}</strong>
            ${n.position ? `<span class="pk-nominee-role">${escHtml(n.position)}</span>` : ''}
            ${n.bio ? `<p class="pk-nominee-bio">${escHtml(n.bio)}</p>` : ''}
            ${n.nominated_by ? `<p class="pk-nominee-meta">Nominated by ${escHtml(n.nominated_by)}</p>` : ''}
          </div>`
          )
          .join('')}
      </div>
    </section>`
    : '';

  const resolutionsSection = resolutions?.length
    ? `
    <section class="pk-section pk-page-break">
      <div class="pk-section-rule"><span>Resolutions</span></div>
      <h2 class="pk-section-heading">Proposed Resolutions</h2>
      ${resolutions
        .map(
          (r, i) => `
        <div class="pk-resolution">
          <h3 class="pk-resolution-title">Resolution ${i + 1}${r.title ? ': ' + escHtml(r.title) : ''}</h3>
          ${
            r.body
              ? `<div class="pk-resolution-body">${r.body
                  .split(/\n+/)
                  .filter(Boolean)
                  .map((p) => `<p class="pk-body">${escHtml(p)}</p>`)
                  .join('')}</div>`
              : ''
          }
          ${r.resolved_text ? `<blockquote class="pk-resolved">RESOLVED, THAT ${escHtml(r.resolved_text)}</blockquote>` : ''}
        </div>`
        )
        .join('')}
    </section>`
    : '';

  const signinSection = `
    <section class="pk-section pk-page-break">
      <div class="pk-section-rule"><span>Sign-In</span></div>
      <h2 class="pk-section-heading">Meeting Sign-In Sheet</h2>
      <p class="pk-body pk-body--muted">Please print and bring to the annual meeting.</p>
      <div class="pk-table-wrap">
        <table class="pk-table pk-signin-table">
          <thead><tr><th class="pk-th pk-th-num">#</th><th class="pk-th">Name (Print)</th><th class="pk-th">Signature</th><th class="pk-th">Email</th></tr></thead>
          <tbody>
            ${Array.from({ length: signatureLineCount }, (_, i) => `<tr class="pk-tr pk-signin-row"><td class="pk-td pk-td-num">${i + 1}</td><td class="pk-td"></td><td class="pk-td"></td><td class="pk-td"></td></tr>`).join('')}
          </tbody>
        </table>
      </div>
    </section>`;

  const minutesSection = `
    <section class="pk-section pk-page-break">
      <div class="pk-section-rule"><span>Minutes</span></div>
      <h2 class="pk-section-heading">Minutes Template</h2>
      <p class="pk-body"><strong>Minutes of the Annual Meeting of ${escHtml(parishName)}</strong></p>
      <p class="pk-body">Date: ${meetingDate}&ensp;&ensp;Location: ${escHtml(location || '[Location]')}</p>
      <p class="pk-body">The meeting was called to order at _____________. Members present: _____________.</p>
      <p class="pk-body">The Rector opened the meeting in prayer.</p>
      <div class="pk-minutes-lines">
        ${Array.from({ length: noteLineCount }, () => '<div class="pk-minutes-line"></div>').join('')}
      </div>
      <div class="pk-sig-block">
        <div class="pk-sig-line"><div class="pk-sig-under"></div><span>President / Chair</span></div>
        <div class="pk-sig-line"><div class="pk-sig-under"></div><span>Recording Secretary</span></div>
        <div class="pk-sig-line"><div class="pk-sig-under"></div><span>Date</span></div>
      </div>
    </section>`;

  // ── Toolbar (preview only) ────────────────────────────────────────────────
  const toolbar = isPdf
    ? ''
    : `
    <div class="pk-toolbar" data-no-print>
      <a href="/parish/dashboard" class="pk-toolbar-btn pk-toolbar-back" onclick="window.close(); return true;">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="10 3 5 8 10 13"/></svg>
        Back to editor
      </a>
      <div class="pk-toolbar-actions">
        <button class="pk-toolbar-btn" onclick="window.print()">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="10" height="4" rx="1"/><rect x="3" y="9" width="10" height="5" rx="1"/><line x1="5" y1="11" x2="11" y2="11"/><line x1="5" y1="13" x2="9" y2="13"/></svg>
          Print
        </button>
        <a class="pk-toolbar-btn pk-toolbar-primary" href="/parish/stewardship/annual-meetings/${escAttr(meeting.id)}/pdf" target="_blank">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 12l2 2 7-9"/><line x1="8" y1="2" x2="8" y2="10"/><polyline points="5 7 8 10 11 7"/></svg>
          Download PDF
        </a>
      </div>
    </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escHtml(meeting.title || parishName + ' Annual Meeting')} &mdash; AGAPAY Stewardship</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
  <style>
    /* ── Reset ── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    /* ── Tokens ── */
    :root {
      --pk-navy:   #061522;
      --pk-navy2:  #0b2130;
      --pk-gold:   #b18a3e;
      --pk-gold-l: #c8a24a;
      --pk-cream:  #f6f1e8;
      --pk-paper:  #fffdf8;
      --pk-ink:    #171715;
      --pk-muted:  #6f6a60;
      --pk-line:   #ddd5c5;
      --pk-red:    #8a2929;
      --pk-green:  #2e6b4a;
      --pk-serif:  "Cormorant Garamond", Georgia, serif;
      --pk-sans:   "DM Sans", system-ui, sans-serif;
    }

    /* ── Page ── */
    html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body {
      background: var(--pk-cream);
      color: var(--pk-ink);
      font-family: var(--pk-sans);
      font-size: 14px;
      line-height: 1.65;
      -webkit-font-smoothing: antialiased;
    }
    @media print {
      body { background: white; font-size: 11px; }
      [data-no-print] { display: none !important; }
      .pk-page-break { page-break-before: always; }
    }

    /* ── Toolbar ── */
    .pk-toolbar {
      position: sticky;
      top: 0;
      z-index: 40;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: .75rem 1.5rem;
      border-bottom: 1px solid var(--pk-line);
      background: rgba(246,241,232,0.94);
      backdrop-filter: blur(10px);
    }
    .pk-toolbar-actions { display: flex; gap: .5rem; }
    .pk-toolbar-btn {
      display: inline-flex;
      align-items: center;
      gap: .4rem;
      height: 36px;
      padding: 0 .9rem;
      border: 1px solid var(--pk-line);
      border-radius: 6px;
      background: white;
      color: var(--pk-ink);
      cursor: pointer;
      font: 500 .8rem var(--pk-sans);
      text-decoration: none;
      transition: border-color .15s;
    }
    .pk-toolbar-btn svg { width: 14px; height: 14px; }
    .pk-toolbar-btn:hover { border-color: var(--pk-gold); }
    .pk-toolbar-back { color: var(--pk-muted); }
    .pk-toolbar-primary {
      border-color: var(--pk-gold);
      background: var(--pk-gold);
      color: white;
      font-weight: 600;
    }
    .pk-toolbar-primary:hover { background: var(--pk-navy); border-color: var(--pk-navy); color: var(--pk-cream); }

    /* ── Packet container ── */
    .pk-container {
      max-width: 820px;
      margin: 0 auto;
      padding: 2rem 2rem 4rem;
    }
    @media (max-width: 640px) { .pk-container { padding: 1rem 1rem 3rem; } }

    /* ── Cover page ── */
    .pk-cover {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 80vh;
      padding: 4rem 2rem;
      text-align: center;
      border: 1px solid rgba(177,138,62,.3);
      border-radius: 4px;
      margin-bottom: 3rem;
      background:
        radial-gradient(ellipse 70% 50% at 50% -10%, rgba(177,138,62,.18), transparent),
        linear-gradient(180deg, var(--pk-navy), var(--pk-navy2));
      color: var(--pk-cream);
    }
    @media print { .pk-cover { min-height: 100vh; margin-bottom: 0; } }
    .pk-cover-cross {
      width: 44px;
      height: 55px;
      margin-bottom: 2.5rem;
      display: block;
    }
    .pk-cover-jurisdiction {
      font-size: .72rem;
      font-weight: 600;
      letter-spacing: .18em;
      text-transform: uppercase;
      color: rgba(246,241,232,.65);
      margin-bottom: 1.1rem;
    }
    .pk-cover-parish {
      font-family: var(--pk-serif);
      font-size: clamp(2.4rem, 6vw, 4rem);
      font-weight: 500;
      line-height: 1;
      margin-bottom: 1.5rem;
    }
    .pk-cover-rule {
      width: 48px;
      height: 1px;
      background: rgba(177,138,62,.55);
      margin: 0 auto 1.5rem;
    }
    .pk-cover-title {
      font-family: var(--pk-serif);
      font-size: clamp(1.4rem, 3.5vw, 2rem);
      font-weight: 400;
      font-style: italic;
      color: rgba(246,241,232,.88);
      margin-bottom: .5rem;
    }
    .pk-cover-year {
      font-size: .78rem;
      font-weight: 600;
      letter-spacing: .14em;
      text-transform: uppercase;
      color: var(--pk-gold-l);
      margin-bottom: 2rem;
    }
    .pk-cover-details {
      font-size: .85rem;
      color: rgba(246,241,232,.72);
      line-height: 1.8;
    }
    .pk-cover-agapay {
      margin-top: 3rem;
      font-size: .65rem;
      letter-spacing: .16em;
      text-transform: uppercase;
      color: rgba(246,241,232,.34);
    }

    /* ── Sections ── */
    .pk-section { margin-bottom: 2.5rem; }
    .pk-section-rule {
      display: flex;
      align-items: center;
      gap: .75rem;
      margin-bottom: 1.25rem;
    }
    .pk-section-rule::before,
    .pk-section-rule::after {
      content: "";
      flex: 1;
      height: 1px;
      background: var(--pk-line);
    }
    .pk-section-rule span {
      color: var(--pk-gold);
      font-size: .65rem;
      font-weight: 700;
      letter-spacing: .18em;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .pk-section-heading {
      font-family: var(--pk-serif);
      font-size: 1.75rem;
      font-weight: 500;
      color: var(--pk-navy);
      margin-bottom: .9rem;
      line-height: 1.1;
    }

    /* ── Body text ── */
    .pk-body { margin-bottom: .65rem; }
    .pk-body--muted { color: var(--pk-muted); font-style: italic; }
    .pk-body--placeholder { color: var(--pk-muted); font-style: italic; }

    /* ── Agenda ── */
    .pk-agenda { list-style: none; counter-reset: agenda; }
    .pk-agenda-item {
      counter-increment: agenda;
      display: grid;
      grid-template-columns: 2rem 1fr auto;
      align-items: baseline;
      gap: .5rem;
      padding: .6rem 0;
      border-bottom: 1px solid var(--pk-line);
    }
    .pk-agenda-item::before {
      content: counter(agenda) ".";
      font-family: var(--pk-serif);
      font-size: 1rem;
      color: var(--pk-gold);
    }
    .pk-agenda-title { font-weight: 500; }
    .pk-agenda-dur { font-size: .78rem; color: var(--pk-muted); white-space: nowrap; }

    /* ── Reports ── */
    .pk-report { margin-bottom: 2rem; }
    .pk-report--border { padding-top: 1.5rem; border-top: 1px solid var(--pk-line); }
    .pk-report-heading {
      font-family: var(--pk-serif);
      font-size: 1.45rem;
      font-weight: 500;
      color: var(--pk-navy);
      margin-bottom: .65rem;
    }
    .pk-report-sig {
      margin-top: 1rem;
      padding-top: .5rem;
      border-top: 1px solid var(--pk-line);
      color: var(--pk-muted);
      font-size: .82rem;
    }

    /* ── Financial table ── */
    .pk-fin-table { width: 100%; border-collapse: collapse; margin-bottom: .75rem; }
    .pk-fin-row { border-bottom: 1px solid var(--pk-line); }
    .pk-fin-label {
      padding: .75rem 0;
      text-align: left;
      font-weight: 500;
      color: var(--pk-muted);
      font-size: .88rem;
    }
    .pk-fin-value {
      padding: .75rem 0;
      text-align: right;
      font-family: var(--pk-serif);
      font-size: 1.3rem;
      font-weight: 500;
      font-variant-numeric: tabular-nums;
    }
    .pk-fin-net .pk-fin-label,
    .pk-fin-net .pk-fin-value { font-weight: 700; font-size: 1.05rem; border-top: 2px solid var(--pk-line); }
    .pk-fin-income { color: var(--pk-green); }
    .pk-fin-expense { color: var(--pk-red); }
    .pk-fin-net-surplus { color: var(--pk-green); }
    .pk-fin-net-deficit { color: var(--pk-red); }
    .pk-fin-notes { color: var(--pk-muted); font-size: .88rem; font-style: italic; }

    /* ── Generic table ── */
    .pk-table-wrap { overflow-x: auto; }
    .pk-table { width: 100%; border-collapse: collapse; min-width: 480px; }
    .pk-th {
      padding: .5rem .75rem;
      border-bottom: 2px solid var(--pk-line);
      text-align: left;
      font-size: .7rem;
      font-weight: 700;
      letter-spacing: .1em;
      text-transform: uppercase;
      color: var(--pk-muted);
    }
    .pk-th-right, .pk-td-right { text-align: right; }
    .pk-th-num, .pk-td-num { text-align: center; width: 2.5rem; }
    .pk-tr { border-bottom: 1px solid var(--pk-line); }
    .pk-tr-notes td { background: rgba(246,241,232,.6); }
    .pk-td { padding: .65rem .75rem; vertical-align: top; font-size: .9rem; }
    .pk-td-notes { font-size: .8rem; color: var(--pk-muted); font-style: italic; padding: .3rem .75rem .6rem; }
    .pk-fund-name { font-weight: 500; }

    /* ── Nominees ── */
    .pk-nominees { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1rem; }
    .pk-nominee {
      padding: 1rem;
      border: 1px solid var(--pk-line);
      border-radius: 6px;
      background: var(--pk-paper);
    }
    .pk-nominee-name { display: block; font-family: var(--pk-serif); font-size: 1.25rem; font-weight: 500; margin-bottom: .2rem; }
    .pk-nominee-role { display: block; font-size: .8rem; font-weight: 600; color: var(--pk-gold); text-transform: uppercase; letter-spacing: .08em; margin-bottom: .4rem; }
    .pk-nominee-bio { font-size: .88rem; color: var(--pk-muted); margin-top: .4rem; }
    .pk-nominee-meta { font-size: .78rem; color: var(--pk-muted); margin-top: .35rem; }

    /* ── Resolutions ── */
    .pk-resolution { margin-bottom: 1.5rem; padding-bottom: 1.5rem; border-bottom: 1px solid var(--pk-line); }
    .pk-resolution:last-child { border-bottom: none; }
    .pk-resolution-title {
      font-family: var(--pk-serif);
      font-size: 1.2rem;
      font-weight: 500;
      color: var(--pk-navy);
      margin-bottom: .5rem;
    }
    .pk-resolved {
      margin-top: .75rem;
      padding: .75rem 1rem;
      border-left: 3px solid var(--pk-gold);
      background: rgba(177,138,62,.06);
      font-style: italic;
      font-size: .92rem;
      color: var(--pk-navy);
      border-radius: 0 4px 4px 0;
    }

    /* ── Sign-in sheet ── */
    .pk-signin-table { min-width: 560px; }
    .pk-signin-row td { height: 2.4rem; }

    /* ── Minutes template ── */
    .pk-minutes-lines { margin: 1.5rem 0; }
    .pk-minutes-line { height: 2rem; border-bottom: 1px solid var(--pk-line); margin-bottom: .1rem; }
    .pk-sig-block { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2rem; margin-top: 2.5rem; }
    .pk-sig-line { display: flex; flex-direction: column; gap: .3rem; }
    .pk-sig-under { height: 1px; background: var(--pk-ink); }
    .pk-sig-line span { font-size: .72rem; color: var(--pk-muted); }

    /* ── Footer ── */
    .pk-footer {
      margin-top: 3rem;
      padding-top: 1rem;
      border-top: 1px solid var(--pk-line);
      text-align: center;
      color: var(--pk-muted);
      font-size: .72rem;
    }
  </style>
</head>
<body>
  ${toolbar}
  <div class="pk-container">

    <!-- ── Cover ── -->
    <div class="pk-cover${isPdf ? ' pk-page-break' : ''}">
      <svg class="pk-cover-cross" viewBox="0 0 240 300" role="img" aria-label="Gold Orthodox budded cross" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="pkCrossGold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#f7e7b4"/>
            <stop offset="0.48" stop-color="#b78b32"/>
            <stop offset="1" stop-color="#6e4c14"/>
          </linearGradient>
          <filter id="pkCrossShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1.2" stdDeviation="1.2" flood-color="#4c330d" flood-opacity="0.22"/>
          </filter>
        </defs>
        <path
          d="m 120,6.5 c -10.67737,0 -19.33309,8.65572 -19.33309,19.33309 0,3.59159 0.96899,6.96328 2.67524,9.84489 -10.67736,0 -19.33308,8.65572 -19.33308,19.3331 0,9.1766 6.4058,16.8551 14.98136,18.8337 l 0,14.4106 -25.46831,0 C 71.54356,79.67988 63.86503,73.27408 54.68841,73.27408 c -10.67736,0 -19.33308,8.6557 -19.33308,19.3331 -2.88161,-1.7063 -6.2533,-2.6753 -9.84489,-2.6753 -10.67737,0 -19.33309,8.6557 -19.33309,19.3331 0,10.6774 8.65572,19.3331 19.33309,19.3331 3.59159,0 6.96328,-0.969 9.84489,-2.6753 0,10.6774 8.65572,19.3331 19.33308,19.3331 9.17662,0 16.85515,-6.4058 18.83371,-14.9813 l 25.46831,0 0,95.8807 c -8.57556,1.9785 -14.98136,9.657 -14.98136,18.8337 0,10.6773 8.65572,19.333 19.33308,19.333 -1.70625,2.8817 -2.67524,6.2533 -2.67524,9.8449 0,10.6774 8.65572,19.3331 19.33309,19.3331 10.67736,0 19.33308,-8.6557 19.33308,-19.3331 0,-3.5916 -0.96898,-6.9632 -2.67524,-9.8449 10.67737,0 19.33308,-8.6557 19.33308,-19.333 0,-9.1767 -6.4058,-16.8552 -14.98135,-18.8337 l 0,-95.8807 25.4683,0 c 1.97857,8.5755 9.65709,14.9813 18.83371,14.9813 10.67737,0 19.33309,-8.6557 19.33309,-19.3331 2.8816,1.7063 6.25329,2.6753 9.84489,2.6753 10.67736,0 19.33308,-8.6557 19.33308,-19.3331 0,-10.6774 -8.65572,-19.3331 -19.33308,-19.3331 -3.5916,0 -6.96329,0.969 -9.84489,2.6753 0,-10.6774 -8.65572,-19.3331 -19.33309,-19.3331 -9.17662,0 -16.85514,6.4058 -18.83371,14.9813 l -25.4683,0 0,-14.4106 c 8.57555,-1.9786 14.98135,-9.6571 14.98135,-18.8337 0,-10.67738 -8.65571,-19.3331 -19.33308,-19.3331 1.70626,-2.88161 2.67524,-6.2533 2.67524,-9.84489 C 139.33308,15.15572 130.67736,6.5 120,6.5 z"
          fill="none"
          stroke="url(#pkCrossGold)"
          stroke-width="7"
          stroke-linejoin="round"
          filter="url(#pkCrossShadow)"
        />
        <path
          d="M120 54v190M104 79h32M75 109h90M103 203l36 16"
          fill="none"
          stroke="url(#pkCrossGold)"
          stroke-width="7"
          stroke-linecap="square"
          stroke-linejoin="round"
        />
        <text x="45" y="118" font-family="Georgia, 'Times New Roman', serif" font-size="24" font-weight="700" fill="#b78b32" letter-spacing="1.5">IC</text>
        <text x="171" y="118" font-family="Georgia, 'Times New Roman', serif" font-size="24" font-weight="700" fill="#b78b32" letter-spacing="1.5">XC</text>
      </svg>
      ${jurisdiction ? `<p class="pk-cover-jurisdiction">${escHtml(jurisdiction)}</p>` : ''}
      <h1 class="pk-cover-parish">${escHtml(parishName)}</h1>
      <div class="pk-cover-rule"></div>
      <h2 class="pk-cover-title">${escHtml(meeting.title || fiscalYear + ' Annual Parish Meeting')}</h2>
      <p class="pk-cover-year">Fiscal Year ${fiscalYear}</p>
      <div class="pk-cover-details">
        ${meetingDate !== 'Date TBD' ? `<p>${meetingDate}${meetingTime ? ' &middot; ' + meetingTime : ''}</p>` : ''}
        ${location ? `<p>${escHtml(location)}</p>` : ''}
        ${address ? `<p>${escHtml(address)}</p>` : ''}
      </div>
      <p class="pk-cover-agapay">Generated by AGAPAY Stewardship &middot; agapay.app</p>
    </div>

    ${noticeSection}
    ${agendaSection}
    ${reportsSection}
    ${finSection}
    ${fundsSection}
    ${nomineesSection}
    ${resolutionsSection}
    ${signinSection}
    ${minutesSection}

    <div class="pk-footer">
      Generated by AGAPAY Stewardship &middot; agapay.app &middot; ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
    </div>
  </div>

  ${!isPdf ? `<script>if (window.location.hash === '#print') window.print();</script>` : ''}
  ${!isPdf ? stewardshipSessionScript() : ''}
</body>
</html>`;
}

// ─── Utility: dashboard nav (matches existing pattern) ───────────────────────
