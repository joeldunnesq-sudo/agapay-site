import type {
  AdminAppPayload,
  AdminAppMonth,
  AdminAppScholarship,
  AdminAppModeration,
  AdminAppFeedback,
  AdminAppError,
} from './app-contracts.js';
import type { AdminAppBindings } from './app.js';
declare const escapeAttr: AdminAppBindings['escapeAttr'];
declare const escapeHtml: AdminAppBindings['escapeHtml'];
declare const jsAttr: AdminAppBindings['jsAttr'];
declare const readable: AdminAppBindings['readable'];
declare const shortDate: AdminAppBindings['shortDate'];
declare const authHeaders: AdminAppBindings['authHeaders'];
declare const handleAuthFailure: AdminAppBindings['handleAuthFailure'];
declare const setStatus: AdminAppBindings['setStatus'];
declare let latestLearnAdmin: AdminAppBindings['latestLearnAdmin'];
declare const renderProductOverview: AdminAppBindings['renderProductOverview'];
declare const moneyShort: AdminAppBindings['moneyShort'];
declare const field: AdminAppBindings['field'];
declare const token: AdminAppBindings['token'];

function renderLearnGrowthBars(monthly: AdminAppMonth[] = []) {
  const maxValue = Math.max(
    ...monthly.map((item) =>
      Math.max(Number(item.newSubscriptions || 0), Number(item.cancellations || 0), Number(item.active || 0))
    ),
    1
  );
  return monthly
    .map((item, index) => {
      const activeHeight = Math.max(item.active ? 5 : 3, Math.round((Number(item.active || 0) / maxValue) * 130));
      const newHeight = Math.max(
        item.newSubscriptions ? 5 : 0,
        Math.round((Number(item.newSubscriptions || 0) / maxValue) * 130)
      );
      const cancelHeight = Math.max(
        item.cancellations ? 5 : 0,
        Math.round((Number(item.cancellations || 0) / maxValue) * 130)
      );
      return `
          <div class="growth-bar-wrap" title="${escapeAttr(`${item.label}: ${item.newSubscriptions || 0} new / ${item.cancellations || 0} cancelled / ${item.active || 0} net active`)}">
            <div class="growth-bar-stack" style="animation-delay:${index * 0.04}s">
              ${cancelHeight ? `<div class="growth-bar danger" style="height:${cancelHeight}px;"></div>` : ''}
              ${newHeight ? `<div class="growth-bar alt" style="height:${newHeight}px;"></div>` : ''}
              <div class="growth-bar" style="height:${activeHeight}px;"></div>
            </div>
            <div class="growth-label">${escapeHtml(item.label)}</div>
          </div>
        `;
    })
    .join('');
}

function renderLearnScholarships(scholarships: AdminAppScholarship[] = []) {
  const list = document.getElementById('learnScholarshipList');
  if (!list) return;
  if (!scholarships.length) {
    list.innerHTML = '<div class="revenue-empty">No Learn scholarship codes have been generated yet.</div>';
    return;
  }
  list.innerHTML = scholarships
    .map(
      (item) => `
        <div class="learn-scholarship-row">
          <div>
            <strong>${escapeHtml(item.code || '')}</strong>
            <span>${escapeHtml(item.label || 'AGAPAY Learn scholarship')} · ${escapeHtml(String(item.percentOff || 0))}% off · ${escapeHtml(String(item.maxRedemptions || 1))} redemption${Number(item.maxRedemptions || 1) === 1 ? '' : 's'}</span>
          </div>
          <button class="secondary btn-sm" onclick="copyLearnText('${jsAttr(item.code || '')}', 'Scholarship code copied.')">Copy</button>
        </div>
      `
    )
    .join('');
}

function renderLearnCommunityModeration(moderation: AdminAppModeration = {}) {
  const list = document.getElementById('learnCommunityModeration');
  if (!list) return;
  const counts = moderation.counts || {};
  const resources = moderation.resources || [];
  list.innerHTML = `
        <div class="learn-moderation-summary">
          <span><strong>${Number(counts.pending || 0)}</strong> Pending</span>
          <span><strong>${Number(counts.flagged || 0)}</strong> Flagged</span>
          <span><strong>${Number(counts.approved || 0)}</strong> Approved</span>
          <span><strong>${Number(counts.hidden || 0)}</strong> Hidden</span>
        </div>
        <div class="learn-moderation-list">${
          resources
            .map((item) => {
              const flags = Array.isArray(item.flags) ? item.flags : [];
              const curated = item.vetted || item.source === 'agapay-curated';
              return `<article class="learn-moderation-row ${flags.length ? 'is-flagged' : ''}">
            <div class="learn-moderation-copy"><span class="learn-moderation-status">${escapeHtml(readable(item.status || 'pending'))}${curated ? ' · AGAPAY CURATED' : ''}${flags.length ? ` · ${flags.length} flag${flags.length === 1 ? '' : 's'}` : ''}</span><strong>${escapeHtml(item.title || 'Untitled resource')}</strong><a href="${escapeHtml(item.url || '#')}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.url || '')}</a><small>${escapeHtml(item.description || '')}</small><small>${curated ? 'Published by' : 'Submitted by'} ${escapeHtml(item.submittedBy || 'Unknown')} · ${escapeHtml(shortDate(item.createdAt))}</small>${flags.length ? `<div class="learn-flag-reasons">${flags.map((flag) => `<span>${escapeHtml(flag.reason || 'Flagged for review')}</span>`).join('')}</div>` : ''}</div>
            <div class="learn-moderation-actions">${curated ? `<button class="secondary btn-sm" onclick="editLearnCuratedResource('${jsAttr(item.id || '')}')">Edit</button>` : ''}<button class="gold btn-sm" onclick="moderateLearnCommunity('${jsAttr(item.id || '')}','approved',this)">Approve</button><button class="secondary btn-sm" onclick="moderateLearnCommunity('${jsAttr(item.id || '')}','hidden',this)">Hide</button><button class="danger btn-sm" onclick="moderateLearnCommunity('${jsAttr(item.id || '')}','removed',this)">Remove</button></div>
          </article>`;
            })
            .join('') || '<div class="revenue-empty">No community submissions are waiting for review.</div>'
        }</div>`;
}

function renderLearnFeedbackQueue(feedback: AdminAppFeedback = {}) {
  const list = document.getElementById('learnFeedbackQueue');
  if (!list) return;
  const counts = feedback.counts || {};
  const suggestions = feedback.suggestions || [];
  list.innerHTML = `
        <div class="learn-moderation-summary">
          <span><strong>${Number(counts.new || 0)}</strong> New</span>
          <span><strong>${Number(counts['seen-considered'] || 0)}</strong> Seen</span>
          <span><strong>${Number(counts.archived || 0)}</strong> Archived</span>
          <span><strong>${Number(counts.total || 0)}</strong> Total</span>
        </div>
        <div class="learn-feedback-list">${
          suggestions
            .map((item) => {
              const isNew = (item.status || 'new') === 'new';
              const notification = item.userNotification || {};
              return `<article class="learn-feedback-row ${isNew ? 'is-new' : ''}">
            <div class="learn-moderation-copy">
              <span class="learn-moderation-status">${escapeHtml(readable(item.status || 'new'))}${notification.status ? ` · Notification: ${escapeHtml(readable(notification.status))}` : ''}</span>
              <strong>${escapeHtml(item.subject || 'Learn Dashboard suggestion')}</strong>
              <p>${escapeHtml(item.message || '')}</p>
              <small>${escapeHtml(item.submittedBy || 'Unknown household')} · ${escapeHtml(item.familyName || 'AGAPAY Learn')} · ${escapeHtml(item.page || 'dashboard')} · ${escapeHtml(shortDate(item.createdAt))}</small>
              ${item.consideredBy ? `<small>Considered by ${escapeHtml(item.consideredBy)} · ${escapeHtml(shortDate(item.consideredAt))}</small>` : ''}
            </div>
            <div class="learn-moderation-actions">
              ${isNew ? `<button class="gold btn-sm" onclick="acknowledgeLearnFeedback('${jsAttr(item.id || '')}',this)">Seen & considered</button>` : '<span class="learn-feedback-done">Done</span>'}
            </div>
          </article>`;
            })
            .join('') || '<div class="revenue-empty">No Learn dashboard suggestions have been submitted yet.</div>'
        }</div>`;
}

function renderParishSupportTickets(data: AdminAppPayload = {}) {
  const list = document.getElementById('parishSupportTicketQueue');
  if (!list) return;
  const counts = data.counts || {};
  const tickets = data.tickets || [];
  list.innerHTML = `
        <div class="learn-moderation-summary"><span><strong>${Number(counts.new || 0)}</strong> New</span><span><strong>${Number(counts.in_progress || 0)}</strong> In progress</span><span><strong>${Number(counts.resolved || 0)}</strong> Resolved</span><span><strong>${Number(counts.total || 0)}</strong> Total</span></div>
        <div class="learn-feedback-list">${
          tickets
            .map(
              (ticket) => `<article class="learn-feedback-row ${(ticket.status || 'new') === 'new' ? 'is-new' : ''}">
          <div class="learn-moderation-copy"><span class="learn-moderation-status">${escapeHtml(readable(ticket.status || 'new'))} · ${escapeHtml(readable(ticket.type || 'help'))} · ${escapeHtml(ticket.source === 'myagapay' ? 'My AGAPAY' : 'Parish dashboard')}${ticket.email?.status ? ` · Email: ${escapeHtml(readable(ticket.email.status))}` : ''}</span><strong>${escapeHtml(ticket.subject || 'Parish support ticket')}</strong><p>${escapeHtml(ticket.message || '')}</p><small>${escapeHtml(ticket.parishName || ticket.parishId || 'Parish')} · ${escapeHtml(ticket.page || 'dashboard')} · ${escapeHtml(ticket.submittedBy || 'No reply address')} · ${escapeHtml(shortDate(ticket.createdAt))}</small>${ticket.adminNote ? `<small>Note: ${escapeHtml(ticket.adminNote)} · ${escapeHtml(ticket.updatedBy || 'Admin')}</small>` : ''}</div>
          <div class="learn-moderation-actions"><select id="support-status-${jsAttr(ticket.id)}"><option value="new" ${ticket.status === 'new' ? 'selected' : ''}>New</option><option value="in_progress" ${ticket.status === 'in_progress' ? 'selected' : ''}>In progress</option><option value="resolved" ${ticket.status === 'resolved' ? 'selected' : ''}>Resolved</option><option value="closed" ${ticket.status === 'closed' ? 'selected' : ''}>Closed</option></select><button class="gold btn-sm" onclick="updateParishSupportTicket('${jsAttr(ticket.id)}',this)">Save</button></div>
        </article>`
            )
            .join('') || '<div class="revenue-empty">No parish support tickets have been submitted yet.</div>'
        }</div>`;
}

async function loadParishSupportTickets() {
  const list = document.getElementById('parishSupportTicketQueue');
  if (list) list.innerHTML = '<div class="revenue-empty">Loading parish support tickets…</div>';
  try {
    const response = await fetch('/api/admin/parish-support-tickets', { headers: authHeaders() });
    const result = (await response.json().catch(() => ({}))) as AdminAppPayload;
    if (handleAuthFailure(response, result)) return;
    if (!response.ok) throw new Error(result.error || 'Unable to load parish support tickets.');
    renderParishSupportTickets(result);
  } catch (error) {
    if (list)
      list.innerHTML = `<div class="revenue-empty">${escapeHtml((error as AdminAppError).message || 'Unable to load parish support tickets.')}</div>`;
  }
}

async function updateParishSupportTicket(ticketId: string, button?: HTMLButtonElement) {
  const select = document.getElementById(`support-status-${ticketId}`);
  if (!select) return;
  button!.disabled = true;
  try {
    const response = await fetch(`/api/admin/parish-support-tickets/${encodeURIComponent(ticketId)}`, {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ status: (select as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value }),
    });
    const result = (await response.json().catch(() => ({}))) as AdminAppPayload;
    if (handleAuthFailure(response, result)) return;
    if (!response.ok) throw new Error(result.error || 'Unable to update ticket.');
    setStatus('Support ticket updated.', 'success');
    await loadParishSupportTickets();
  } catch (error) {
    setStatus((error as AdminAppError).message || 'Unable to update ticket.', 'error');
  } finally {
    button!.disabled = false;
  }
}

function renderLearnAdmin(data: AdminAppPayload = {}) {
  const pane = document.getElementById('learnAdminPane');
  if (!pane) return;
  const subscriptions = data.subscriptions || {};
  const counts = subscriptions.counts || {};
  latestLearnAdmin = data || {};
  renderProductOverview();

  // Update Learn hero header
  const learnHeaderSubs = document.getElementById('learnHeaderSubs');
  const learnHeaderMrr = document.getElementById('learnHeaderMrr');
  const learnActive = Number(counts.active || 0) + Number(counts.trialing || 0) + Number(counts.freeForever || 0);
  if (learnHeaderSubs) learnHeaderSubs.textContent = String(learnActive || '0');
  const newFeedbackCount = Number(data.feedback?.counts?.new || 0);
  if (learnHeaderMrr)
    learnHeaderMrr.textContent = `${moneyShort(subscriptions.monthlyRecurringCents || 0)}/mo · ${counts.cancelled || 0} cancelled · ${newFeedbackCount} new suggestion${newFeedbackCount === 1 ? '' : 's'}`;

  pane.innerHTML = `
        <article class="revenue-card">
          <div class="revenue-card-head">
            <div>
              <span>Learn monthly revenue</span>
              <h3>${moneyShort(subscriptions.monthlyRecurringCents || 0)}</h3>
            </div>
            <small>${escapeHtml(String(subscriptions.year || new Date().getFullYear()))}</small>
          </div>
          <div class="revenue-fee-stats">
            <div><strong>${counts.active || 0}</strong><span>Active</span></div>
            <div><strong>${counts.trialing || 0}</strong><span>Trialing</span></div>
            <div><strong>${counts.cancelled || 0}</strong><span>Cancelled</span></div>
          </div>
          <p>Revenue is normalized to monthly value from active Learn billing records.</p>
        </article>
        <article class="revenue-card">
          <div class="revenue-card-head">
            <div>
              <span>Scholarships</span>
              <h3>${(data.scholarships || []).length}</h3>
            </div>
            <small>${data.stripeConfigured ? 'Stripe live' : 'Tracking only'}</small>
          </div>
          <div class="revenue-fee-stats">
            <div><strong>${counts.freeForever || 0}</strong><span>Full access</span></div>
            <div><strong>${counts.pastDue || 0}</strong><span>Past due</span></div>
            <div><strong>${subscriptions.totalRecords || 0}</strong><span>Records</span></div>
          </div>
          <p>${data.stripeConfigured ? 'New scholarship codes are created as Stripe promotion codes.' : 'Set STRIPE_SECRET_KEY to create live Stripe promotion codes.'}</p>
        </article>
        <article class="growth-chart-card learn-admin-chart">
          <div class="growth-chart-title">Learn Growth <span>Net active / new / cancellations</span></div>
          <div class="growth-bars">${renderLearnGrowthBars(subscriptions.monthly || [])}</div>
          <div class="growth-note">Current-year Learn subscription movement.</div>
        </article>
        <article class="growth-chart-card">
          <div class="growth-chart-title">Recent Learn Accounts <span>Latest billing records</span></div>
          <div class="learn-admin-recent">
            ${
              (subscriptions.recent || [])
                .map(
                  (item) => `
              <div class="revenue-row">
                <div>
                  <strong>${escapeHtml(item.email || 'Unknown household')}</strong>
                  <span>${escapeHtml(item.plan || 'family')} · ${escapeHtml(readable(item.status || 'active'))}</span>
                </div>
                <b>${escapeHtml(shortDate(item.updatedAt || item.createdAt))}</b>
              </div>
            `
                )
                .join('') || '<div class="revenue-empty">No Learn billing records yet.</div>'
            }
          </div>
        </article>
      `;
  renderLearnScholarships(data.scholarships || []);
  renderLearnFeedbackQueue(data.feedback || {});
  renderLearnCommunityModeration(data.communityModeration || {});
}

async function acknowledgeLearnFeedback(feedbackId: string, btn?: HTMLButtonElement | null) {
  if (!feedbackId) return;
  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }
  try {
    const response = await fetch(`/api/admin/learn/feedback/${encodeURIComponent(feedbackId)}`, {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ status: 'seen-considered' }),
    });
    const result = (await response.json().catch(() => ({}))) as AdminAppPayload;
    if (handleAuthFailure(response, result)) return;
    if (!response.ok) throw new Error(result.error || 'Unable to acknowledge suggestion');
    const notice =
      result.feedback?.userNotification?.status === 'sent'
        ? 'Suggestion marked seen and considered. Thank-you notification sent.'
        : `Suggestion marked seen and considered. Notification status: ${readable(result.feedback?.userNotification?.status || 'unknown')}.`;
    setStatus(notice, 'success');
    await loadLearnAdmin();
  } catch (err) {
    setStatus((err as AdminAppError).message, 'error');
  } finally {
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }
}

async function moderateLearnCommunity(resourceId: string, status: string, btn?: HTMLButtonElement | null) {
  if (!resourceId) return;
  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }
  try {
    const response = await fetch(`/api/admin/learn/community/${encodeURIComponent(resourceId)}`, {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ status }),
    });
    const result = (await response.json().catch(() => ({}))) as AdminAppPayload;
    if (handleAuthFailure(response, result)) return;
    if (!response.ok) throw new Error(result.error || 'Unable to update community resource');
    setStatus(`Community resource marked ${status}.`, 'success');
    await loadLearnAdmin();
  } catch (err) {
    setStatus((err as AdminAppError).message, 'error');
  } finally {
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }
}

function clearLearnCuratedResourceForm() {
  const idField = document.getElementById('learnCuratedResourceId') as HTMLInputElement | null;
  if (idField) idField.value = '';
  [
    'learnCuratedTitle',
    'learnCuratedUrl',
    'learnCuratedCategory',
    'learnCuratedResourceType',
    'learnCuratedMediaType',
    'learnCuratedAgeRange',
    'learnCuratedTags',
    'learnCuratedDescription',
  ].forEach((id) => {
    const field = document.getElementById(id);
    if (field) (field as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value = '';
  });
  const pinned = document.getElementById('learnCuratedPinned') as HTMLInputElement | null;
  if (pinned) pinned.checked = false;
  const submit = document.getElementById('learnCuratedResourceSubmit') as HTMLButtonElement | null;
  if (submit) submit.textContent = 'Publish curated resource';
  const status = document.getElementById('learnCuratedResourceStatus');
  if (status) {
    status.textContent = '';
    status.className = 'payment-status';
  }
}

function editLearnCuratedResource(resourceId: string) {
  const resources = latestLearnAdmin?.communityModeration?.resources || [];
  const item = resources.find((resource) => resource.id === resourceId);
  if (!item) {
    setStatus('Unable to find that curated resource. Refresh and try again.', 'error');
    return;
  }
  const setValue = (id: string, value: unknown) => {
    const field = document.getElementById(id);
    if (field) (field as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value = (value || '') as string;
  };
  setValue('learnCuratedResourceId', item.id);
  setValue('learnCuratedTitle', item.title);
  setValue('learnCuratedUrl', item.url);
  setValue('learnCuratedCategory', item.category);
  setValue('learnCuratedResourceType', item.resourceType);
  setValue('learnCuratedMediaType', item.mediaType);
  setValue('learnCuratedAgeRange', item.ageRange);
  setValue('learnCuratedTags', Array.isArray(item.tags) ? item.tags.join(', ') : item.tags);
  setValue('learnCuratedDescription', item.description);
  const pinned = document.getElementById('learnCuratedPinned') as HTMLInputElement | null;
  if (pinned) pinned.checked = Boolean(item.pinned);
  const submit = document.getElementById('learnCuratedResourceSubmit') as HTMLButtonElement | null;
  if (submit) submit.textContent = 'Save curated resource';
  const status = document.getElementById('learnCuratedResourceStatus');
  if (status) {
    status.textContent = `Editing: ${item.title || 'Curated resource'}`;
    status.className = 'payment-status';
  }
  (document.getElementById('learnCuratedTitle') as HTMLInputElement | null)?.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
  });
}

async function createLearnCuratedResource(btn?: HTMLButtonElement | null) {
  const status = document.getElementById('learnCuratedResourceStatus');
  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }
  if (status) {
    status.textContent = 'Publishing curated resource...';
    status.className = 'payment-status';
  }
  try {
    const payload = {
      action: 'update',
      title: (document.getElementById('learnCuratedTitle') as HTMLInputElement | null)?.value || '',
      url: (document.getElementById('learnCuratedUrl') as HTMLInputElement | null)?.value || '',
      category: (document.getElementById('learnCuratedCategory') as HTMLInputElement | null)?.value || '',
      resourceType: (document.getElementById('learnCuratedResourceType') as HTMLInputElement | null)?.value || '',
      mediaType: (document.getElementById('learnCuratedMediaType') as HTMLInputElement | null)?.value || '',
      ageRange: (document.getElementById('learnCuratedAgeRange') as HTMLInputElement | null)?.value || '',
      tags: (document.getElementById('learnCuratedTags') as HTMLInputElement | null)?.value || '',
      description: (document.getElementById('learnCuratedDescription') as HTMLTextAreaElement | null)?.value || '',
      pinned: Boolean((document.getElementById('learnCuratedPinned') as HTMLInputElement | null)?.checked),
    };
    const resourceId = (document.getElementById('learnCuratedResourceId') as HTMLInputElement | null)?.value || '';
    const response = await fetch(
      resourceId ? `/api/admin/learn/community/${encodeURIComponent(resourceId)}` : '/api/admin/learn/community',
      {
        method: resourceId ? 'PATCH' : 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      }
    );
    const result = (await response.json().catch(() => ({}))) as AdminAppPayload;
    if (handleAuthFailure(response, result)) return;
    if (!response.ok)
      throw new Error(
        result.error || (resourceId ? 'Unable to save curated resource' : 'Unable to publish curated resource')
      );
    clearLearnCuratedResourceForm();
    if (status) {
      status.textContent = `${resourceId ? 'Saved' : 'Published'}: ${result.resource?.title || payload.title}`;
      status.className = 'payment-status success';
    }
    setStatus(
      resourceId ? 'AGAPAY curated Learn resource saved.' : 'AGAPAY curated Learn resource published.',
      'success'
    );
    await loadLearnAdmin();
  } catch (err) {
    if (status) {
      status.textContent = (err as AdminAppError).message;
      status.className = 'payment-status error';
    }
    setStatus((err as AdminAppError).message, 'error');
  } finally {
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }
}

async function loadLearnAdmin(btn?: HTMLButtonElement | null) {
  if (!token()) {
    setStatus('Log in to load AGAPAY Learn admin.', 'error');
    return;
  }
  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }
  try {
    const response = await fetch('/api/admin/learn/summary', { headers: authHeaders() });
    const result = (await response.json().catch(() => ({}))) as AdminAppPayload;
    if (handleAuthFailure(response, result)) return;
    if (!response.ok) throw new Error(result.error || 'Unable to load AGAPAY Learn admin');
    renderLearnAdmin(result.learn || {});
  } catch (err) {
    setStatus((err as AdminAppError).message, 'error');
  } finally {
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }
}

async function copyLearnText(value: string, message: string | undefined = 'Copied.') {
  try {
    await navigator.clipboard.writeText(value);
    setStatus(message, 'success');
  } catch {
    setStatus(value, 'info');
  }
}

async function createLearnScholarship(btn?: HTMLButtonElement | null) {
  const status = document.getElementById('learnScholarshipStatus');
  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }
  if (status) {
    status.textContent = 'Generating scholarship code...';
    status.className = 'payment-status';
  }
  try {
    const payload = {
      label:
        (document.getElementById('learnScholarshipLabel') as HTMLInputElement | null)?.value ||
        'AGAPAY Learn scholarship',
      percentOff: (document.getElementById('learnScholarshipPercent') as HTMLInputElement | null)?.value || 100,
      maxRedemptions: (document.getElementById('learnScholarshipMax') as HTMLInputElement | null)?.value || 1,
      code: (document.getElementById('learnScholarshipCode') as HTMLInputElement | null)?.value || '',
    };
    const response = await fetch('/api/admin/learn/scholarships', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    const result = (await response.json().catch(() => ({}))) as AdminAppPayload;
    if (handleAuthFailure(response, result)) return;
    if (!response.ok) throw new Error(result.error || 'Unable to generate scholarship code');
    if (status) {
      status.textContent = `Scholarship code ready: ${result.scholarship?.code || ''}`;
      status.className = 'payment-status success';
    }
    (document.getElementById('learnScholarshipCode') as HTMLInputElement | null)!.value = '';
    await copyLearnText(result.scholarship?.code || '', 'Scholarship code copied.');
    await loadLearnAdmin();
  } catch (err) {
    if (status) {
      status.textContent = (err as AdminAppError).message;
      status.className = 'payment-status error';
    }
    setStatus((err as AdminAppError).message, 'error');
  } finally {
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }
}
export type AdminAppPart2 = {
  renderLearnGrowthBars: typeof renderLearnGrowthBars;
  renderLearnScholarships: typeof renderLearnScholarships;
  renderLearnCommunityModeration: typeof renderLearnCommunityModeration;
  renderLearnFeedbackQueue: typeof renderLearnFeedbackQueue;
  renderParishSupportTickets: typeof renderParishSupportTickets;
  loadParishSupportTickets: typeof loadParishSupportTickets;
  updateParishSupportTicket: typeof updateParishSupportTicket;
  renderLearnAdmin: typeof renderLearnAdmin;
  acknowledgeLearnFeedback: typeof acknowledgeLearnFeedback;
  moderateLearnCommunity: typeof moderateLearnCommunity;
  clearLearnCuratedResourceForm: typeof clearLearnCuratedResourceForm;
  editLearnCuratedResource: typeof editLearnCuratedResource;
  createLearnCuratedResource: typeof createLearnCuratedResource;
  loadLearnAdmin: typeof loadLearnAdmin;
  copyLearnText: typeof copyLearnText;
  createLearnScholarship: typeof createLearnScholarship;
};
