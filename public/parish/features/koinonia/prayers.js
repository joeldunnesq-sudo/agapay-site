'use strict';

// Parish dashboard koinonia: prayers.
// Classic script; preserve global names used by the dashboard and inline actions.

function parishPrayerStatusLabel(status) {
  return (
    {
      pending: 'Awaiting review',
      active: 'Active',
      answered: 'Answered',
      flagged: 'Reported',
      declined: 'Declined',
      archived: 'Archived',
    }[status] || contentCategoryLabel(status)
  );
}

function parishPrayerDate(value) {
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function filteredParishPrayerRequests() {
  const rows = prayerAdminState.requests || [];
  if (prayerAdminState.filter === 'review')
    return rows.filter((item) => ['pending', 'flagged'].includes(item.status) || Number(item.reportCount || 0) > 0);
  if (prayerAdminState.filter === 'active')
    return rows.filter((item) => item.status === 'active' && item.visibility === 'parish_members');
  if (prayerAdminState.filter === 'clergy')
    return rows.filter((item) => item.visibility === 'clergy_only' && !['declined', 'archived'].includes(item.status));
  if (prayerAdminState.filter === 'answered') return rows.filter((item) => item.status === 'answered');
  return rows;
}

function renderParishPrayerRequests() {
  const metrics = prayerAdminState.metrics || {};
  const setMetric = (id, value) => {
    const node = document.getElementById(id);
    if (node) node.textContent = String(Math.max(0, Number(value || 0)));
  };
  setMetric('prayerMetricPending', metrics.awaitingReview);
  setMetric('prayerMetricActive', metrics.active);
  setMetric('prayerMetricClergy', metrics.clergyOnly);
  setMetric('prayerMetricAnswered', metrics.answered);
  const settings = prayerAdminState.settings || {};
  const approval = document.getElementById('prayerApprovalRequired');
  const anonymous = document.getElementById('prayerAnonymousAllowed');
  const days = document.getElementById('prayerArchiveDays');
  const notice = document.getElementById('prayerPastoralNoticeInput');
  if (approval) approval.checked = settings.approvalRequired !== false;
  if (anonymous) anonymous.checked = settings.allowAnonymous !== false;
  if (days) days.value = String(settings.autoArchiveDays || 30);
  if (notice) notice.value = settings.pastoralNotice || '';
  const target = document.getElementById('prayerAdminList');
  if (!target) return;
  const rows = filteredParishPrayerRequests();
  if (!rows.length) {
    target.innerHTML =
      '<div class="prayer-admin-empty"><strong>All caught up</strong><p>No prayer requests match this view.</p></div>';
    return;
  }
  target.innerHTML = rows
    .map((item) => {
      const name = item.actualRequesterName || item.requesterName || 'Parishioner';
      const reported = Number(item.reportCount || 0);
      const classes = `${item.status === 'flagged' ? ' is-flagged' : ''}${item.visibility === 'clergy_only' ? ' is-clergy' : ''}`;
      const quickApprove = ['pending', 'flagged'].includes(item.status)
        ? `<button class="is-primary" type="button" onclick="quickApproveParishPrayer('${escapeAttr(item.id)}')">Approve</button>`
        : '';
      return `<article class="prayer-admin-row${classes}"><span class="prayer-admin-avatar" aria-hidden="true">${escapeHtml(name.slice(0, 1).toUpperCase())}</span><div class="prayer-admin-row-copy"><div class="prayer-admin-row-meta"><strong>${escapeHtml(name)}</strong><span>${escapeHtml(parishPrayerStatusLabel(item.status))}</span><span>${item.visibility === 'clergy_only' ? 'Clergy only' : 'Parish community'}</span>${item.anonymous ? '<span>Anonymous to parishioners</span>' : ''}${reported ? `<span class="is-alert">${reported} report${reported === 1 ? '' : 's'}</span>` : ''}</div><p>${escapeHtml(item.body)}</p><small>${escapeHtml(parishPrayerDate(item.createdAt))} · ${Number(item.prayerCount || 0)} parishioner${Number(item.prayerCount || 0) === 1 ? '' : 's'} prayed</small></div><div class="prayer-admin-row-actions">${quickApprove}<button type="button" onclick="openParishPrayerReview('${escapeAttr(item.id)}')">Review</button></div></article>`;
    })
    .join('');
}

function setParishPrayerFilter(filter, button) {
  prayerAdminState.filter = ['review', 'active', 'clergy', 'answered', 'all'].includes(filter) ? filter : 'review';
  document
    .querySelectorAll('[data-prayer-admin-filter]')
    .forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
  renderParishPrayerRequests();
}

async function loadParishPrayerRequests(force = false) {
  if (!currentParish?.parishId || (prayerAdminState.loaded && !force)) {
    if (prayerAdminState.loaded) renderParishPrayerRequests();
    return;
  }
  const target = document.getElementById('prayerAdminList');
  if (target) target.innerHTML = '<p class="sw-tool-loading">Loading prayer requests…</p>';
  try {
    const response = await fetch(prayerAdminApi(), { headers: authHeaders(), cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Unable to load prayer requests.');
    prayerAdminState = {
      ...prayerAdminState,
      loaded: true,
      requests: payload.requests || [],
      settings: payload.settings || {},
      metrics: payload.metrics || {},
    };
    renderParishPrayerRequests();
  } catch (error) {
    if (target)
      target.innerHTML = `<div class="prayer-admin-empty"><strong>Unable to load requests</strong><p>${escapeHtml(error.message)}</p></div>`;
  }
}

async function patchParishPrayerRequest(requestId, changes) {
  const response = await fetch(prayerAdminApi('/' + encodeURIComponent(requestId)), {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Unable to update this prayer request.');
  prayerAdminState.loaded = false;
  await loadParishPrayerRequests(true);
  return payload;
}

async function quickApproveParishPrayer(requestId) {
  const item = prayerAdminState.requests.find((row) => row.id === requestId);
  if (!item) return;
  try {
    await patchParishPrayerRequest(requestId, {
      status: 'active',
      visibility: 'parish_members',
      expectedRevision: item.revision,
    });
    setStatus('Prayer request approved and published to the parish.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

function openParishPrayerReview(requestId) {
  const item = prayerAdminState.requests.find((row) => row.id === requestId);
  const dialog = document.getElementById('prayerAdminReviewDialog');
  if (!item || !dialog) return;
  prayerAdminState.selectedId = requestId;
  dialog.dataset.revision = String(item.revision || 1);
  document.getElementById('prayerAdminReviewName').textContent =
    `${item.actualRequesterName || item.requesterName || 'Parishioner'}${item.anonymous ? ' · anonymous to parishioners' : ''}`;
  document.getElementById('prayerAdminReviewBody').textContent = item.body || '';
  document.getElementById('prayerAdminReviewStatus').value = item.status;
  document.getElementById('prayerAdminReviewVisibility').value = item.visibility;
  document.getElementById('prayerAdminReviewNote').value = item.moderationNote || '';
  document.getElementById('prayerAdminDeclineReason').value = item.declineReason || '';
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

function closeParishPrayerReview() {
  const dialog = document.getElementById('prayerAdminReviewDialog');
  prayerAdminState.selectedId = '';
  if (!dialog) return;
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
}

async function submitParishPrayerReview(event) {
  event.preventDefault();
  const dialog = document.getElementById('prayerAdminReviewDialog');
  const requestId = prayerAdminState.selectedId;
  const button = event.currentTarget.querySelector('button[type="submit"]');
  if (!dialog || !requestId) return;
  if (button) {
    button.disabled = true;
    button.classList.add('loading');
  }
  try {
    await patchParishPrayerRequest(requestId, {
      status: document.getElementById('prayerAdminReviewStatus').value,
      visibility: document.getElementById('prayerAdminReviewVisibility').value,
      moderationNote: document.getElementById('prayerAdminReviewNote').value,
      declineReason: document.getElementById('prayerAdminDeclineReason').value,
      expectedRevision: Number(dialog.dataset.revision || 0),
    });
    closeParishPrayerReview();
    setStatus('Prayer request decision saved.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    if (button) {
      button.disabled = false;
      button.classList.remove('loading');
    }
  }
}

async function saveParishPrayerSettings(event) {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type="submit"]');
  if (button) {
    button.disabled = true;
    button.classList.add('loading');
  }
  try {
    const response = await fetch(prayerAdminApi('/settings'), {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        approvalRequired: Boolean(document.getElementById('prayerApprovalRequired').checked),
        allowAnonymous: Boolean(document.getElementById('prayerAnonymousAllowed').checked),
        autoArchiveDays: Number(document.getElementById('prayerArchiveDays').value || 30),
        pastoralNotice: document.getElementById('prayerPastoralNoticeInput').value,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Unable to save Prayer Request safeguards.');
    prayerAdminState.settings = payload.settings || prayerAdminState.settings;
    renderParishPrayerRequests();
    setStatus('Prayer Request safeguards saved.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    if (button) {
      button.disabled = false;
      button.classList.remove('loading');
    }
  }
}
