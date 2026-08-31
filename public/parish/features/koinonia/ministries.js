'use strict';

// Parish dashboard koinonia: ministries.
// Classic script; preserve global names used by the dashboard and inline actions.

function toggleKoinoniaMinistryComposer(show) {
  const form = document.getElementById('koinoniaMinistryComposer');
  if (!form) return;
  form.hidden = !show;
  if (show) requestAnimationFrame(() => form.elements.displayName?.focus());
}

function koinoniaGeneralInterestRequest() {
  return parishFeatureRequests.find((item) => item?.featureId === 'ministry-service') || null;
}

function koinoniaMinistryAvatar(ministry, className = '') {
  const image = ministry.hasImage ? `<img data-koinonia-ministry-image="${escapeAttr(ministry.id)}" alt="" />` : '';
  return `<span class="koinonia-ministry-list-mark ${className}">${image}<b>${escapeHtml((ministry.displayName || 'M').slice(0, 1))}</b></span>`;
}

async function hydrateKoinoniaMinistryImages() {
  const images = [...document.querySelectorAll('[data-koinonia-ministry-image]')];
  await Promise.all(
    images.map(async (image) => {
      const ministryId = image.dataset.koinoniaMinistryImage;
      try {
        let objectUrl = koinoniaMinistryImageUrls.get(ministryId);
        if (!objectUrl) {
          const response = await fetch(directoryAdminApi('/ministries/' + encodeURIComponent(ministryId) + '/image'), {
            headers: authHeaders(),
            cache: 'no-store',
          });
          if (!response.ok) return;
          objectUrl = URL.createObjectURL(await response.blob());
          koinoniaMinistryImageUrls.set(ministryId, objectUrl);
        }
        if (image.isConnected) {
          image.src = objectUrl;
          image.parentElement?.classList.add('has-image');
        }
      } catch {}
    })
  );
}

function renderKoinoniaMinistries() {
  const state = koinoniaMinistriesState;
  const active = state.ministries.filter((item) => item.ministry?.status === 'active');
  const memberCount = state.ministries.reduce((sum, item) => sum + (item.participants?.length || 0), 0);
  const pendingCount = state.ministries.reduce(
    (sum, item) =>
      sum +
      (item.requests || []).filter((request) => ['submitted', 'under_review', 'returned'].includes(request.status))
        .length,
    0
  );
  const general = koinoniaGeneralInterestRequest();
  const generalCount = Math.max(0, Number(general?.count || 0));
  const setText = (id, value) => {
    const node = document.getElementById(id);
    if (node) node.textContent = String(value);
  };
  setText('koinoniaActiveMinistries', active.length);
  setText('koinoniaMinistryMembers', memberCount);
  setText('koinoniaMinistryRequests', pendingCount + generalCount);
  const generalTarget = document.getElementById('koinoniaGeneralInterest');
  if (generalTarget) {
    generalTarget.hidden = !generalCount;
    generalTarget.innerHTML = generalCount
      ? `<span class="koinonia-general-interest-mark">✦</span><div><strong>${generalCount} parishioner${generalCount === 1 ? '' : 's'} ${generalCount === 1 ? 'is' : 'are'} ready to serve</strong><p>This private Koinonia signal is not tied to a specific ministry. Publish opportunities or follow up with the parish after services.</p></div><button type="button" onclick="acknowledgeKoinoniaGeneralInterest()">Acknowledge</button>`
      : '';
  }
  const list = document.getElementById('koinoniaMinistryList');
  if (list)
    list.innerHTML = state.ministries.length
      ? state.ministries
          .map((item) => {
            const ministry = item.ministry || item;
            const requests = (item.requests || []).filter((request) =>
              ['submitted', 'under_review', 'returned'].includes(request.status)
            ).length;
            const selected = ministry.id === state.selectedId;
            return `<button type="button" class="koinonia-ministry-list-item${selected ? ' is-selected' : ''}" onclick="selectKoinoniaMinistry('${escapeAttr(ministry.id)}')">${koinoniaMinistryAvatar(ministry)}<span><strong>${escapeHtml(ministry.displayName)}</strong><small>${escapeHtml(contentCategoryLabel(ministry.category))} · ${(item.participants || []).length} member${(item.participants || []).length === 1 ? '' : 's'}</small></span>${requests ? `<em>${requests} new</em>` : `<i>${escapeHtml(contentCategoryLabel(ministry.status))}</i>`}</button>`;
          })
          .join('')
      : '<div class="communications-empty"><strong>Create your first ministry</strong><p>Build teams for worship, formation, hospitality, outreach, and parish life.</p><button class="btn btn-gold" type="button" onclick="toggleKoinoniaMinistryComposer(true)">Create ministry</button></div>';
  renderKoinoniaMinistryDetail();
  void hydrateKoinoniaMinistryImages();
}

function renderKoinoniaMinistryDetail() {
  const target = document.getElementById('koinoniaMinistryDetail');
  if (!target) return;
  const detail = koinoniaMinistriesState.ministries.find(
    (item) => (item.ministry || item).id === koinoniaMinistriesState.selectedId
  );
  if (!detail) {
    target.innerHTML =
      '<div class="koinonia-ministry-empty"><span>✦</span><strong>Select a ministry</strong><p>Choose a team to see its members, add a parishioner, and review requests.</p></div>';
    return;
  }
  const ministry = detail.ministry;
  const requests = (detail.requests || []).filter((request) =>
    ['submitted', 'under_review', 'returned'].includes(request.status)
  );
  const participants = detail.participants || [];
  const editing = koinoniaMinistriesState.editingId === ministry.id;
  target.innerHTML = `
      <header class="koinonia-ministry-detail-head"><div class="koinonia-ministry-detail-identity">${koinoniaMinistryAvatar(ministry, 'is-large')}<div><span>${escapeHtml(contentCategoryLabel(ministry.category))}</span><h3>${escapeHtml(ministry.displayName)}</h3><p>${escapeHtml(ministry.shortDescription || 'A parish ministry team.')}</p></div></div><div class="koinonia-ministry-detail-actions"><em class="is-${escapeAttr(ministry.status)}">${escapeHtml(contentCategoryLabel(ministry.status))}</em><button type="button" onclick="toggleKoinoniaMinistryEditor('${escapeAttr(ministry.id)}',${editing ? 'false' : 'true'})">${editing ? 'Close editor' : 'Edit group'}</button></div></header>
      ${
        editing
          ? `<form class="koinonia-ministry-editor" onsubmit="updateKoinoniaMinistry(event,'${escapeAttr(ministry.id)}')">
        <div class="koinonia-ministry-editor-head"><div><span class="eyebrow">Group settings</span><h4>Edit ministry</h4><p>Update how this ministry appears and who may discover or join it.</p></div></div>
        <input type="hidden" name="expectedVersion" value="${escapeAttr(ministry.version || '')}" />
        <div class="koinonia-ministry-form-grid">
          <label>Ministry name<input name="displayName" maxlength="160" required value="${escapeAttr(ministry.displayName || '')}" /></label>
          <label>Category<select name="category">${['liturgical', 'educational', 'charitable', 'hospitality', 'youth', 'fellowship', 'outreach', 'administrative', 'maintenance', 'bookstore', 'committee', 'other'].map((value) => `<option value="${value}"${ministry.category === value ? ' selected' : ''}>${escapeHtml(contentCategoryLabel(value))}</option>`).join('')}</select></label>
          <label class="is-wide">Subtitle<textarea name="shortDescription" maxlength="300" rows="2" placeholder="A short line shown beneath the ministry name.">${escapeHtml(ministry.shortDescription || '')}</textarea></label>
          <label class="is-wide">Full description<textarea name="detailedDescription" maxlength="1200" rows="4" placeholder="Describe the ministry, its work, and how parishioners participate.">${escapeHtml(ministry.detailedDescription || '')}</textarea></label>
          <label>Status<select name="status">${['active', 'draft', 'paused', 'archived'].map((value) => `<option value="${value}"${ministry.status === value ? ' selected' : ''}>${escapeHtml(contentCategoryLabel(value))}</option>`).join('')}</select></label>
          <label>Join requests<select name="requestPolicy"><option value="request_interest"${ministry.requestPolicy === 'request_interest' ? ' selected' : ''}>Welcome requests</option><option value="closed"${ministry.requestPolicy === 'closed' ? ' selected' : ''}>Closed for now</option><option value="administrator_assignment_only"${ministry.requestPolicy === 'administrator_assignment_only' ? ' selected' : ''}>Invitation only</option></select></label>
          <label>Visibility<select name="visibility"><option value="parish_members"${ministry.visibility === 'parish_members' ? ' selected' : ''}>All parish members</option><option value="participants_only"${ministry.visibility === 'participants_only' ? ' selected' : ''}>Participants only</option><option value="staff_only"${ministry.visibility === 'staff_only' ? ' selected' : ''}>Parish staff only</option><option value="hidden"${ministry.visibility === 'hidden' ? ' selected' : ''}>Hidden</option></select></label>
          <label>Display order<input name="displayOrder" type="number" min="0" max="9999" value="${escapeAttr(String(ministry.displayOrder ?? 100))}" /></label>
        </div>
        <div class="koinonia-ministry-form-actions"><button class="btn btn-ghost" type="button" onclick="toggleKoinoniaMinistryEditor('${escapeAttr(ministry.id)}',false)">Cancel</button><button class="btn btn-gold" type="submit">Save changes</button></div>
      </form>`
          : ''
      }
      <section class="koinonia-ministry-image-tools"><div><strong>Group photo</strong><p>Shown beside this ministry name in Koinonia and group chats.</p></div><label class="btn btn-gold">${ministry.hasImage ? 'Replace photo' : 'Choose photo'}<input type="file" accept="image/jpeg,image/png,image/webp" onchange="uploadKoinoniaMinistryImage(event,'${escapeAttr(ministry.id)}')" hidden /></label>${ministry.hasImage ? `<button type="button" class="btn btn-ghost" onclick="removeKoinoniaMinistryImage('${escapeAttr(ministry.id)}')">Remove photo</button>` : ''}</section>
      <section class="koinonia-ministry-detail-section"><div class="koinonia-panel-head"><div><span class="eyebrow">Team roster</span><h4>${participants.length} member${participants.length === 1 ? '' : 's'}</h4><p>Published memberships appear beneath each person's name in the private parish directory.</p></div></div>
        <form class="koinonia-member-search" onsubmit="searchKoinoniaMinistryPeople(event,'${escapeAttr(ministry.id)}')"><label for="koinoniaMemberSearch">Invite a My AGAPAY parishioner into this group</label><div><input id="koinoniaMemberSearch" name="query" required minlength="2" placeholder="Search by name or email" /><button type="submit">Search</button></div><div id="koinoniaMemberSearchResults"></div></form>
        <div class="koinonia-ministry-roster">${
          participants.length
            ? participants
                .map((person) => {
                  const badgeShown = person.approvedPublication && person.publicationPreference === 'directory';
                  return `<article><span>${escapeHtml((person.displayName || 'P').slice(0, 1))}</span><div><strong>${escapeHtml(person.displayName)}</strong><small>${escapeHtml(contentCategoryLabel(person.participationType))} · ${badgeShown ? 'Directory badge shown' : 'Directory badge hidden'}</small></div><div class="koinonia-ministry-roster-actions"><button class="is-directory" type="button" onclick="setKoinoniaMinistryDirectoryBadge('${escapeAttr(ministry.id)}','${escapeAttr(person.id)}',${badgeShown ? 'false' : 'true'})">${badgeShown ? 'Hide badge' : 'Show badge'}</button><button type="button" onclick="removeKoinoniaMinistryMember('${escapeAttr(ministry.id)}','${escapeAttr(person.id)}')">Remove</button></div></article>`;
                })
                .join('')
            : '<p>No parishioners have been added yet.</p>'
        }</div>
      </section>
      <section class="koinonia-ministry-detail-section"><div class="koinonia-panel-head"><div><span class="eyebrow">Incoming interest</span><h4>${requests.length ? `${requests.length} waiting` : 'All caught up'}</h4></div></div><div class="koinonia-ministry-request-list">${requests.length ? requests.map((request) => `<article><span>✦</span><div><strong>${escapeHtml(request.displayName || 'Parishioner')}</strong><small>Wants to join as ${escapeHtml(contentCategoryLabel(request.interestType))}</small>${request.memberNote ? `<p>${escapeHtml(request.memberNote)}</p>` : ''}</div><div><button type="button" onclick="reviewKoinoniaMinistryRequest('${escapeAttr(request.id)}','approve')">Approve</button><button class="is-secondary" type="button" onclick="reviewKoinoniaMinistryRequest('${escapeAttr(request.id)}','deny')">Decline</button></div></article>`).join('') : '<div class="koinonia-ministry-caught-up"><span>✓</span><p>No ministry-specific requests need a response.</p></div>'}</div></section>
      <section class="koinonia-ministry-danger"><div><strong>Delete ministry group</strong><p>This permanently erases the group, its memberships, requests, messages, photos, and voice notes.</p></div><button type="button" onclick="deleteKoinoniaMinistry('${escapeAttr(ministry.id)}','${escapeAttr(ministry.displayName)}')">Delete group</button></section>`;
  void hydrateKoinoniaMinistryImages();
}

async function uploadKoinoniaMinistryImage(event, ministryId) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    setStatus('Ministry images must be JPG, PNG, or WebP.', 'error');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    setStatus('Ministry images must be 5MB or smaller.', 'error');
    return;
  }
  try {
    const response = await fetch(directoryAdminApi('/ministries/' + encodeURIComponent(ministryId) + '/image'), {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': file.type },
      body: file,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || payload.error || 'Unable to save this group image.');
    const previous = koinoniaMinistryImageUrls.get(ministryId);
    if (previous) URL.revokeObjectURL(previous);
    koinoniaMinistryImageUrls.delete(ministryId);
    koinoniaMinistriesState.loaded = false;
    await loadKoinoniaMinistries(true);
    setStatus('Ministry group image updated.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

async function removeKoinoniaMinistryImage(ministryId) {
  if (!window.confirm('Remove this ministry group image?')) return;
  try {
    const response = await fetch(directoryAdminApi('/ministries/' + encodeURIComponent(ministryId) + '/image'), {
      method: 'DELETE',
      headers: authHeaders(),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || payload.error || 'Unable to remove this group image.');
    const previous = koinoniaMinistryImageUrls.get(ministryId);
    if (previous) URL.revokeObjectURL(previous);
    koinoniaMinistryImageUrls.delete(ministryId);
    koinoniaMinistriesState.loaded = false;
    await loadKoinoniaMinistries(true);
    setStatus('Ministry group image removed.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

async function deleteKoinoniaMinistry(ministryId, ministryName) {
  if (
    !window.confirm(
      `Permanently delete ${ministryName}? All group messages, photos, voice notes, memberships, and requests will be erased. This cannot be undone.`
    )
  )
    return;
  try {
    const response = await fetch(directoryAdminApi('/ministries/' + encodeURIComponent(ministryId)), {
      method: 'DELETE',
      headers: authHeaders(),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || payload.error || 'Unable to delete this ministry group.');
    const previous = koinoniaMinistryImageUrls.get(ministryId);
    if (previous) URL.revokeObjectURL(previous);
    koinoniaMinistryImageUrls.delete(ministryId);
    koinoniaMinistriesState = { ...koinoniaMinistriesState, loaded: false, selectedId: '', editingId: '' };
    await loadKoinoniaMinistries(true);
    setStatus(`${ministryName} and its group messages were permanently deleted.`, 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

async function loadKoinoniaMinistries(force = false) {
  if (!currentParish?.parishId || (koinoniaMinistriesState.loaded && !force)) {
    if (koinoniaMinistriesState.loaded) renderKoinoniaMinistries();
    return;
  }
  const list = document.getElementById('koinoniaMinistryList');
  if (list) list.innerHTML = '<p class="sw-tool-loading">Loading ministries…</p>';
  try {
    const response = await fetch(directoryAdminApi('/ministries'), { headers: authHeaders(), cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || payload.error || 'Unable to load ministries.');
    const details = await Promise.all(
      (payload.ministries || []).map(async (ministry) => {
        const detailResponse = await fetch(directoryAdminApi('/ministries/' + encodeURIComponent(ministry.id)), {
          headers: authHeaders(),
          cache: 'no-store',
        });
        const detailPayload = await detailResponse.json().catch(() => ({}));
        return detailResponse.ok ? detailPayload.ministry : { ministry, participants: [], leaders: [], requests: [] };
      })
    );
    koinoniaMinistriesState = {
      ...koinoniaMinistriesState,
      loaded: true,
      ministries: details,
      selectedId: koinoniaMinistriesState.selectedId || details[0]?.ministry?.id || '',
    };
    renderKoinoniaMinistries();
  } catch (error) {
    if (list)
      list.innerHTML = `<div class="communications-empty"><strong>Ministries are unavailable</strong><p>${escapeHtml(error.message)}</p><button class="btn btn-gold" type="button" onclick="loadKoinoniaMinistries(true)">Try again</button></div>`;
  }
}

function selectKoinoniaMinistry(id) {
  koinoniaMinistriesState.selectedId = id;
  koinoniaMinistriesState.editingId = '';
  renderKoinoniaMinistries();
}

function toggleKoinoniaMinistryEditor(ministryId, show) {
  koinoniaMinistriesState.editingId = show ? ministryId : '';
  renderKoinoniaMinistryDetail();
  if (show)
    requestAnimationFrame(() => document.querySelector('.koinonia-ministry-editor input[name="displayName"]')?.focus());
}

async function updateKoinoniaMinistry(event, ministryId) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = 'Saving…';
  try {
    const patch = Object.fromEntries(new FormData(form));
    patch.displayOrder = Number(patch.displayOrder || 100);
    const response = await fetch(directoryAdminApi('/ministries/' + encodeURIComponent(ministryId)), {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || payload.error || 'Unable to update this ministry.');
    koinoniaMinistriesState = { ...koinoniaMinistriesState, loaded: false, selectedId: ministryId, editingId: '' };
    await loadKoinoniaMinistries(true);
    setStatus('Ministry details updated.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
    button.disabled = false;
    button.textContent = 'Save changes';
  }
}

async function createKoinoniaMinistry(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const raw = Object.fromEntries(new FormData(form));
    const response = await fetch(directoryAdminApi('/ministries'), {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(raw),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || payload.error || 'Unable to create this ministry.');
    form.reset();
    toggleKoinoniaMinistryComposer(false);
    koinoniaMinistriesState.loaded = false;
    koinoniaMinistriesState.selectedId = payload.ministry?.ministry?.id || '';
    await loadKoinoniaMinistries(true);
    setStatus('Ministry created and ready for its team.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    button.disabled = false;
  }
}

async function searchKoinoniaMinistryPeople(event, ministryId) {
  event.preventDefault();
  const form = event.currentTarget;
  const target = form.querySelector('#koinoniaMemberSearchResults');
  const query = form.elements.query.value.trim();
  target.innerHTML = '<p class="sw-tool-loading">Finding parishioners…</p>';
  try {
    const response = await fetch(directoryAdminApi('/ministry-people?q=' + encodeURIComponent(query) + '&limit=12'), {
      headers: authHeaders(),
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || payload.error || 'Unable to search parishioners.');
    const existing = new Set(
      (koinoniaMinistriesState.ministries.find((item) => item.ministry.id === ministryId)?.participants || []).map(
        (item) => item.personId
      )
    );
    const people = (payload.people || []).filter((person) => !person.personId || !existing.has(person.personId));
    target.innerHTML = people.length
      ? people
          .map(
            (person) =>
              `<button type="button" onclick="addKoinoniaMinistryMember('${escapeAttr(ministryId)}','${escapeAttr(person.candidateId || person.personId)}')"><span>${escapeHtml((person.displayName || 'P').slice(0, 1))}</span><span><strong>${escapeHtml(person.displayName || 'Parishioner')}</strong><small>${person.email ? escapeHtml(person.email) : 'Add to this ministry group'}</small></span><em>Invite ＋</em></button>`
          )
          .join('')
      : '<p class="koinonia-search-empty">No available parishioners match that name or email.</p>';
  } catch (error) {
    target.innerHTML = `<p class="koinonia-search-empty">${escapeHtml(error.message)}</p>`;
  }
}

async function addKoinoniaMinistryMember(ministryId, candidateId) {
  try {
    const response = await fetch(directoryAdminApi('/ministries/' + encodeURIComponent(ministryId) + '/participants'), {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateId, participationType: 'member', publish: true }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || payload.error || 'Unable to add this parishioner.');
    koinoniaMinistriesState.loaded = false;
    await loadKoinoniaMinistries(true);
    setStatus('Parishioner added. Their ministry badge is now visible in the private parish directory.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

async function removeKoinoniaMinistryMember(ministryId, participantId) {
  if (!window.confirm('Remove this parishioner from the ministry group?')) return;
  try {
    const response = await fetch(
      directoryAdminApi(
        '/ministries/' + encodeURIComponent(ministryId) + '/participants-remove/' + encodeURIComponent(participantId)
      ),
      {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ reasonCode: 'parish_admin_removed' }),
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || payload.error || 'Unable to remove this parishioner.');
    koinoniaMinistriesState.loaded = false;
    await loadKoinoniaMinistries(true);
    setStatus('Parishioner removed from the ministry group.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

async function setKoinoniaMinistryDirectoryBadge(ministryId, participantId, visible) {
  try {
    const response = await fetch(
      directoryAdminApi(
        '/ministries/' +
          encodeURIComponent(ministryId) +
          '/participants-publication/' +
          encodeURIComponent(participantId)
      ),
      {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ preference: visible ? 'directory' : 'hidden', approvedPublication: visible }),
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || payload.error || 'Unable to update the Directory badge.');
    koinoniaMinistriesState.loaded = false;
    await loadKoinoniaMinistries(true);
    setStatus(
      visible
        ? 'Ministry badge shown in the private parish directory.'
        : 'Ministry badge hidden from the private parish directory.',
      'success'
    );
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

async function reviewKoinoniaMinistryRequest(requestId, decision) {
  try {
    const response = await fetch(
      directoryAdminApi('/reviews/ministry_interest/' + encodeURIComponent(requestId) + '/decision'),
      {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          reviewerNote:
            decision === 'approve' ? 'Welcomed through Koinonia Ministries.' : 'Reviewed through Koinonia Ministries.',
        }),
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || payload.error || 'Unable to review this request.');
    koinoniaMinistriesState.loaded = false;
    await loadKoinoniaMinistries(true);
    setStatus(decision === 'approve' ? 'Parishioner welcomed to the ministry.' : 'Request reviewed.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

async function acknowledgeKoinoniaGeneralInterest() {
  const request = koinoniaGeneralInterestRequest();
  if (!request) return;
  activeParishFeatureRequest = request;
  await dismissParishFeatureRequest(false);
  parishFeatureRequests = parishFeatureRequests.filter((item) => item.featureId !== 'ministry-service');
  renderKoinoniaMinistries();
}

async function saveKoinoniaCalendar(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const status = document.getElementById('koinoniaCalendarStatus');
  const value = document.getElementById('koinoniaCalendarUrl')?.value.trim() || '';
  button.disabled = true;
  if (status) status.textContent = 'Checking and saving…';
  try {
    const response = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId), {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ koinoniaCalendarUrl: value }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Unable to save this calendar link.');
    currentParish.koinoniaCalendarUrl = payload.parish?.koinoniaCalendarUrl || value;
    if (status)
      status.textContent = currentParish.koinoniaCalendarUrl
        ? 'Calendar verified and saved.'
        : 'Calendar sync link removed.';
    setStatus('Koinonia calendar connection saved.', 'success');
  } catch (error) {
    if (status) status.textContent = error.message;
    setStatus(error.message, 'error');
  } finally {
    button.disabled = false;
  }
}
