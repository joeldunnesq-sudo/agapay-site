'use strict';

/* global currentParish, stewardshipApi, authHeaders, escapeHtml, setStatus */
/* exported checkNudgeEligibility, sendNudges */

// Pledge eligibility and donor nudge preview, sending, and modal state.
// Read shared parish identity and authentication only when actions run.

// ── Pledge nudge modal ───────────────────────────────────────────────────
let nudgePreviewData = null;

async function checkNudgeEligibility() {
  if (!currentParish) return;
  const btn = document.getElementById('nudgeBtn');
  if (!btn) return;
  try {
    const res = await fetch(stewardshipApi('/nudge?year=' + new Date().getFullYear()), { headers: authHeaders() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.thresholdActive) {
      // Too early in the year — no one can be 3 months behind yet
      btn.disabled = true;
      btn.title = 'No donors are 3+ months behind on their pledge yet.';
      btn.querySelector('svg + span, svg').nextSibling && (btn.lastChild.textContent = ' Nudge donors (none behind)');
      // Rebuild label safely
      const svg = btn.querySelector('svg');
      btn.innerHTML = '';
      if (svg) btn.appendChild(svg);
      btn.appendChild(document.createTextNode(' Nudge donors (none behind)'));
      return;
    }
    const count = (data.behind || []).length;
    if (count === 0) {
      btn.disabled = true;
      btn.title = 'All pledging donors are on track — no nudges needed.';
      const svg = btn.querySelector('svg');
      btn.innerHTML = '';
      if (svg) btn.appendChild(svg);
      btn.appendChild(document.createTextNode(' All donors on track'));
    } else {
      btn.disabled = false;
      btn.title = count + ' donor' + (count !== 1 ? 's are' : ' is') + ' at least 3 months behind on their pledge.';
      btn.onclick = () => openNudgeModal();
      const svg = btn.querySelector('svg');
      btn.innerHTML = '';
      if (svg) btn.appendChild(svg);
      btn.appendChild(document.createTextNode(' Nudge ' + count + ' behind-schedule donor' + (count !== 1 ? 's' : '')));
      btn.classList.add('sw-nudge-btn--ready');
    }
  } catch {
    // Silent — leave button disabled
  }
}

async function openNudgeModal() {
  if (!currentParish) return;
  const modal = document.getElementById('nudgeAdminModal');
  if (!modal) {
    buildNudgeModal();
  }
  const m = document.getElementById('nudgeAdminModal');
  const body = document.getElementById('nudgeAdminBody');
  if (body) body.innerHTML = '<p class="sw-loading">Checking pledges…</p>';
  m.hidden = false;

  try {
    const res = await fetch(stewardshipApi('/nudge?year=' + new Date().getFullYear()), { headers: authHeaders() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Unable to load pledge data');
    nudgePreviewData = data;
    renderNudgePreview(data);
  } catch (e) {
    if (body) body.innerHTML = '<p class="muted">' + escapeHtml(e.message) + '</p>';
  }
}

function buildNudgeModal() {
  const el = document.createElement('div');
  el.id = 'nudgeAdminModal';
  el.className = 'sw-nudge-admin-modal-backdrop';
  el.hidden = true;
  el.innerHTML =
    '<div class="sw-nudge-admin-modal">' +
    '<div class="sw-nudge-admin-header">' +
    '<h3>Nudge Behind-Schedule Donors</h3>' +
    '<button class="sw-nudge-admin-close" type="button" onclick="closeNudgeModal()" aria-label="Close">×</button>' +
    '</div>' +
    '<div class="sw-nudge-admin-body" id="nudgeAdminBody"><p class="sw-loading">Loading…</p></div>' +
    '<div class="sw-nudge-admin-footer" id="nudgeAdminFooter" hidden>' +
    '<p class="sw-nudge-admin-note">A gentle pastoral message will appear in each donor’s My AGAPAY dashboard the next time they log in.</p>' +
    '<button class="sw-nudge-send-btn" type="button" id="nudgeSendBtn" onclick="sendNudges(this)">Send nudges</button>' +
    '</div>' +
    '</div>';
  el.addEventListener('click', (e) => {
    if (e.target === el) closeNudgeModal();
  });
  document.body.appendChild(el);
}

function renderNudgePreview(data) {
  const body = document.getElementById('nudgeAdminBody');
  const footer = document.getElementById('nudgeAdminFooter');
  if (!body) return;
  const behind = data.behind || [];
  const fmt = (c) =>
    '$' + ((c || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  if (!behind.length) {
    body.innerHTML =
      '<p class="sw-nudge-none">All pledging donors are on track for ' +
      (data.year || new Date().getFullYear()) +
      '. No nudges needed.</p>';
    if (footer) footer.hidden = true;
    return;
  }
  body.innerHTML =
    '<p class="sw-nudge-summary">' +
    behind.length +
    ' donor' +
    (behind.length !== 1 ? 's are' : ' is') +
    ' behind schedule for ' +
    (data.year || new Date().getFullYear()) +
    '.</p>' +
    '<div class="sw-nudge-list">' +
    behind
      .map(
        (d) =>
          '<div class="sw-nudge-row-preview">' +
          '<span class="sw-nudge-email">' +
          escapeHtml(d.donorEmail) +
          '</span>' +
          '<span class="sw-nudge-amounts">' +
          '<span>Pledged: ' +
          fmt(d.pledgeCents) +
          '</span>' +
          '<span>Given: ' +
          fmt(d.givenCents) +
          '</span>' +
          '<span class="sw-nudge-behind">Behind: ' +
          fmt(d.expectedCents - d.givenCents) +
          '</span>' +
          '</span>' +
          '</div>'
      )
      .join('') +
    '</div>';
  if (footer) footer.hidden = false;
}

async function sendNudges(btn) {
  if (!currentParish || !nudgePreviewData?.behind?.length) return;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Sending…';
  }
  try {
    const res = await fetch(stewardshipApi('/nudge?year=' + (nudgePreviewData.year || new Date().getFullYear())), {
      method: 'POST',
      headers: authHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to send nudges');
    const body = document.getElementById('nudgeAdminBody');
    const footer = document.getElementById('nudgeAdminFooter');
    if (body)
      body.innerHTML =
        '<p class="sw-nudge-none">✓ ' +
        (data.sent || 0) +
        ' nudge' +
        (data.sent !== 1 ? 's' : '') +
        ' sent. Donors will see the message the next time they log into My AGAPAY.</p>';
    if (footer) footer.hidden = true;
  } catch (e) {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Send nudges';
    }
    setStatus(e.message, 'error');
  }
}

function closeNudgeModal() {
  const m = document.getElementById('nudgeAdminModal');
  if (m) m.hidden = true;
  nudgePreviewData = null;
}
