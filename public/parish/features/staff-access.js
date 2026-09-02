'use strict';

let parishStaffAccessState = {
  parishId: '',
  loading: false,
  loaded: false,
  error: '',
  memberships: [],
  invitations: [],
  latestInvite: null,
};

const PARISH_STAFF_ROLES = [
  ['rector', 'Rector', 'Full parish oversight, clergy coverage, settings, and accounting approval'],
  ['priest', 'Priest', 'Pastoral work, sacrament follow-up, giving reports, and parish access'],
  ['deacon', 'Deacon', 'Parish workspace and giving visibility'],
  ['treasurer', 'Treasurer', 'Giving, reconciliation, reports, and accounting administration'],
  ['bookkeeper', 'Bookkeeper', 'Day-to-day accounting entry and reconciliation'],
  ['secretary', 'Parish secretary', 'General parish work, giving visibility, and staff invitations'],
  ['administrator', 'Parish administrator', 'Parish settings and staff-access administration'],
  ['council_member', 'Council member', 'Read-only accounting, budget, and parish visibility'],
  ['bookstore_manager', 'Commerce manager', 'Products, orders, refunds, and commerce reporting'],
  ['volunteer', 'Volunteer', 'Basic parish workspace access'],
];

function parishStaffAccessApi(path = '') {
  return `/api/parish/dashboard/${encodeURIComponent(currentParish?.parishId || '')}/memberships${path}`;
}

function parishStaffRoleLabel(value) {
  return PARISH_STAFF_ROLES.find(([role]) => role === value)?.[1] || String(value || 'Staff').replaceAll('_', ' ');
}

function parishStaffDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function renderParishStaffAccess() {
  const root = document.getElementById('parishStaffAccessManager');
  if (!root) return;
  const state = parishStaffAccessState;
  if (state.loading && !state.loaded) {
    root.innerHTML = '<div class="staff-access-loading">Loading staff access…</div>';
    return;
  }
  if (state.error && !state.loaded) {
    root.innerHTML = `<div class="staff-access-error"><strong>Staff access could not be loaded</strong><span>${escapeHtml(state.error)}</span><button class="btn btn-ghost" type="button" onclick="loadParishStaffAccess(true)">Try again</button></div>`;
    return;
  }
  const active = state.memberships.filter((member) => member.status === 'active');
  const pending = state.invitations.filter(
    (invite) => invite.status === 'pending' && (!invite.expiresAt || new Date(invite.expiresAt).getTime() > Date.now())
  );
  root.innerHTML = `<section class="staff-access-shell" aria-labelledby="staffAccessTitle">
      <div class="staff-access-intro">
        <div><span>People &amp; sign-in</span><h3 id="staffAccessTitle">Give each staff member personal access</h3><p>Invite clergy and staff by email. Each person creates their own password and completes MFA when required, so the parish office never has to distribute temporary passwords.</p></div>
        <div class="staff-access-security"><b aria-hidden="true">✓</b><span><strong>Safer and easier to cover</strong><small>Named accounts improve the audit trail. Parish-wide work remains visible to authorized staff so an absence does not strand a care list.</small></span></div>
      </div>
      <div class="staff-access-grid">
        <form class="staff-access-invite" onsubmit="inviteParishStaff(event)">
          <div class="staff-access-step"><b>1</b><span><strong>Invite someone</strong><small>They receive a secure, one-use setup link.</small></span></div>
          <label><span>Email address</span><input class="form-control" name="email" type="email" autocomplete="email" placeholder="staff@example.org" required /></label>
          <label><span>Responsibility</span><select class="form-control" name="roleTemplate" onchange="updateParishStaffRoleHelp(this)" required>${PARISH_STAFF_ROLES.map(([value, label]) => `<option value="${escapeAttr(value)}">${escapeHtml(label)}</option>`).join('')}</select><small data-role-help>${escapeHtml(PARISH_STAFF_ROLES[0][2])}</small></label>
          <button class="btn btn-gold" type="submit">Send personal invitation</button>
          <span class="staff-access-form-status" role="status" aria-live="polite"></span>
          ${state.latestInvite ? `<div class="staff-access-copy"><strong>${state.latestInvite.emailStatus === 'sent' ? 'Invitation emailed' : 'Invitation created—email delivery is unavailable'}</strong><span>${state.latestInvite.emailStatus === 'sent' ? 'You can also copy the secure link if they need it.' : 'Copy this link and send it to the intended person through a trusted channel.'}</span><button class="btn btn-ghost" type="button" onclick="copyParishStaffInvite()">Copy secure setup link</button></div>` : ''}
        </form>
        <div class="staff-access-roster">
          <div class="staff-access-roster-head"><div><span>Access roster</span><strong>${active.length} active · ${pending.length} pending</strong></div><button class="sac-admin-text-btn" type="button" onclick="loadParishStaffAccess(true)">Refresh</button></div>
          ${active.length ? `<div class="staff-access-list">${active.map((member) => `<article><i class="active" aria-hidden="true"></i><div><strong>${escapeHtml(member.displayName || member.email || 'Staff member')}</strong><span>${escapeHtml(member.email || 'Personal account')} · ${escapeHtml(parishStaffRoleLabel(member.roleTemplate))}</span></div><em>Active</em></article>`).join('')}</div>` : '<div class="staff-access-empty"><strong>No personal staff accounts yet</strong><span>Invite the first person using the form. The existing parish login continues to work.</span></div>'}
          ${pending.length ? `<div class="staff-access-pending"><span>Waiting for acceptance</span>${pending.map((invite) => `<article><i aria-hidden="true"></i><div><strong>${escapeHtml(invite.email)}</strong><span>${escapeHtml(parishStaffRoleLabel(invite.roleTemplate))} · expires ${escapeHtml(parishStaffDate(invite.expiresAt))}</span></div><button class="sac-admin-text-btn" type="button" onclick="revokeParishStaffInvitation('${escapeAttr(invite.id)}')">Revoke</button></article>`).join('')}</div>` : ''}
        </div>
      </div>
      <div class="staff-access-steps" aria-label="Staff invitation steps"><div><b>1</b><span><strong>Parish sends invitation</strong><small>Choose an email and responsibility here.</small></span></div><div><b>2</b><span><strong>Staff creates a password</strong><small>The secure link is personal and expires after 14 days.</small></span></div><div><b>3</b><span><strong>AGAPAY handles MFA</strong><small>When required, setup continues before dashboard access opens.</small></span></div></div>
    </section>`;
}

async function loadParishStaffAccess(force = false) {
  if (!currentParish?.parishId) return;
  if (parishStaffAccessState.parishId !== currentParish.parishId) {
    parishStaffAccessState = {
      ...parishStaffAccessState,
      parishId: currentParish.parishId,
      loaded: false,
      memberships: [],
      invitations: [],
      latestInvite: null,
    };
  }
  if (parishStaffAccessState.loading || (parishStaffAccessState.loaded && !force)) {
    renderParishStaffAccess();
    return;
  }
  parishStaffAccessState.loading = true;
  parishStaffAccessState.error = '';
  renderParishStaffAccess();
  try {
    const response = await fetch(parishStaffAccessApi(), { headers: authHeaders() });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Unable to load staff access.');
    parishStaffAccessState = {
      ...parishStaffAccessState,
      loading: false,
      loaded: true,
      memberships: data.memberships || [],
      invitations: data.invitations || [],
    };
  } catch (error) {
    parishStaffAccessState = {
      ...parishStaffAccessState,
      loading: false,
      error: error.message || 'Unable to load staff access.',
    };
  }
  renderParishStaffAccess();
}

function updateParishStaffRoleHelp(select) {
  const help = select?.closest('label')?.querySelector('[data-role-help]');
  if (help) help.textContent = PARISH_STAFF_ROLES.find(([value]) => value === select.value)?.[2] || '';
}

async function inviteParishStaff(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const status = form.querySelector('.staff-access-form-status');
  if (button) button.disabled = true;
  if (status) status.textContent = 'Creating secure invitation…';
  try {
    const email = form.elements.email.value.trim();
    const response = await fetch(parishStaffAccessApi('/invitations'), {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, roleTemplate: form.elements.roleTemplate.value }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Unable to create the invitation.');
    parishStaffAccessState.latestInvite = {
      email,
      emailStatus: data.emailStatus || 'failed',
      url: `${window.location.origin}/give/login?invite=${encodeURIComponent(data.token)}`,
    };
    form.reset();
    await loadParishStaffAccess(true);
    setStatus(
      data.emailStatus === 'sent'
        ? `Invitation sent to ${email}.`
        : 'Invitation created. Copy the secure link to share it.',
      'success'
    );
  } catch (error) {
    if (status) status.textContent = error.message;
    setStatus(error.message, 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

async function copyParishStaffInvite() {
  const url = parishStaffAccessState.latestInvite?.url || '';
  if (!url) return;
  await navigator.clipboard.writeText(url);
  setStatus('Secure staff setup link copied.', 'success');
}

async function revokeParishStaffInvitation(invitationId) {
  if (!confirm('Revoke this pending staff invitation? Its secure link will stop working.')) return;
  try {
    const response = await fetch(parishStaffAccessApi('/invitations/' + encodeURIComponent(invitationId)), {
      method: 'DELETE',
      headers: authHeaders(),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Unable to revoke the invitation.');
    await loadParishStaffAccess(true);
    setStatus('Staff invitation revoked.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

window.ParishFeatureRegistry.register('staff-access', {
  load: loadParishStaffAccess,
});
