'use strict';

// Campaign management owns its editor draft, listing, uploads, and updates.
// Read the live shared parish only inside actions after the core initializes.
// Giving's editable catalogs, authentication, and entitlement checks stay in core.
/* global currentParish:writable, authHeaders */
/* exported openNewCampaignForm, editCampaign, closeCampaignEditor,
  handleCoverUpload, removeCoverPhoto, handlePhotosUpload, removeCampPhoto,
  saveCampaign, postCampaignUpdate */

let editingCampaignId = null;
let campaignCoverUrl = '';
let campaignPhotos = [];

function renderCampaignList(parish) {
  const pane = document.getElementById('campaignListPane');
  if (!pane) return;
  const campaigns = parish?.campaigns || [];
  if (!campaigns.length) {
    pane.innerHTML =
      '<div class="empty-state"><div class="empty-state-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg></div><h3>No campaigns yet</h3><p>Create your first campaign to start a dedicated fundraising page donors can share.</p></div>';
    return;
  }
  const usd = (c) =>
    (Number(c || 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const statusMap = {
    active: { label: 'Active', cls: 'status-active' },
    completed: { label: 'Completed', cls: 'status-completed' },
    paused: { label: 'Paused', cls: 'status-paused' },
  };
  pane.innerHTML = campaigns
    .map((c) => {
      const raised = Number(c.raisedCents || 0),
        goal = Number(c.goalCents || 0);
      const pct = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;
      const slug = c.slug || slugifyCampaign(c.name);
      const pageUrl = campaignPublicUrl(parish.parishId, slug);
      const s = statusMap[c.status] || statusMap.active;
      const campaignId = String(c.id || '')
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'");
      return (
        '<div class="campaign-list-item" style="border:1px solid var(--line);border-radius:10px;padding:1rem 1.1rem;margin-bottom:10px;background:var(--paper);">' +
        '<div style="display:flex;align-items:flex-start;gap:8px;">' +
        '<div style="flex:1;min-width:0;">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">' +
        '<strong style="font-size:0.95rem;color:var(--ink)">' +
        escCamp(c.name) +
        '</strong>' +
        '<span class="' +
        s.cls +
        '" style="display:inline-flex;align-items:center;gap:5px;font-size:0.65rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;padding:0.2rem 0.6rem;border-radius:100px;">' +
        s.label +
        '</span>' +
        '</div>' +
        '<div style="width:100%;height:6px;background:var(--gold-soft,rgba(200,162,74,0.15));border-radius:100px;overflow:hidden;margin:4px 0 2px;">' +
        '<div style="height:100%;width:' +
        pct +
        '%;background:linear-gradient(90deg,#C8A24A,#e8c56a);border-radius:100px;transition:width 0.8s ease;"></div></div>' +
        '<div style="display:flex;justify-content:space-between;font-size:0.75rem;color:var(--stone);">' +
        '<span>' +
        usd(raised) +
        ' raised' +
        (goal ? ' of ' + usd(goal) : '') +
        '</span>' +
        '<span>' +
        (c.giftCount || 0) +
        ' gift' +
        ((c.giftCount || 0) !== 1 ? 's' : '') +
        '</span></div>' +
        '</div>' +
        '<div style="display:flex;gap:6px;flex-shrink:0;margin-left:12px;">' +
        '<a href="' +
        pageUrl +
        '" target="_blank" class="btn btn-ghost btn-sm" title="View public page">&#8599; View</a>' +
        '<button class="btn btn-ghost btn-sm" onclick="editCampaign(\'' +
        campaignId +
        '\')" title="Edit">Edit</button>' +
        '</div></div></div>'
      );
    })
    .join('');
}

function slugifyCampaign(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function campaignPublicUrl(parishId, campaignSlug) {
  const parishSegment = slugifyCampaign(parishId);
  const campaignSegment = slugifyCampaign(campaignSlug).replace(/-campaign$/, '');
  return '/give/' + encodeURIComponent(parishSegment) + '/' + encodeURIComponent(campaignSegment) + '-campaign';
}

function escCamp(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function openNewCampaignForm() {
  editingCampaignId = null;
  campaignCoverUrl = '';
  campaignPhotos = [];
  const titleEl = document.getElementById('campaignEditorTitle');
  if (titleEl) titleEl.textContent = 'New Campaign';
  const set = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.value = v || '';
  };
  set('campName', '');
  set('campGoal', '');
  set('campEndsAt', '');
  set('campDescription', '');
  set('updateBody', '');
  const statusEl = document.getElementById('campStatus');
  if (statusEl) statusEl.value = 'active';
  const preview = document.getElementById('campCoverPreview');
  if (preview) preview.hidden = true;
  const placeholder = document.getElementById('campCoverPlaceholder');
  if (placeholder) placeholder.hidden = false;
  const grid = document.getElementById('campPhotosGrid');
  if (grid) grid.innerHTML = '';
  const statusSpan = document.getElementById('campSaveStatus');
  if (statusSpan) statusSpan.textContent = '';
  const updateStatus = document.getElementById('updatePostStatus');
  if (updateStatus) updateStatus.textContent = '';
  const updateCard = document.getElementById('campaignUpdateCard');
  if (updateCard) updateCard.hidden = true;
  const editorCard = document.getElementById('campaignEditorCard');
  if (editorCard) {
    editorCard.hidden = false;
    editorCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function editCampaign(campaignId) {
  if (!currentParish) return;
  const c = (currentParish.campaigns || []).find((x) => x.id === campaignId);
  if (!c) return;
  editingCampaignId = campaignId;
  campaignCoverUrl = c.coverPhotoUrl || '';
  campaignPhotos = (c.photos || []).map((p) => (typeof p === 'string' ? { url: p, key: '' } : p));
  const titleEl = document.getElementById('campaignEditorTitle');
  if (titleEl) titleEl.textContent = 'Edit Campaign';
  const set = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.value = v || '';
  };
  set('campName', c.name);
  set('campGoal', c.goalCents ? String(Math.round(c.goalCents / 100)) : '');
  set('campEndsAt', c.endsAt ? c.endsAt.substring(0, 10) : '');
  set('campDescription', c.description);
  set('updateBody', '');
  const statusEl = document.getElementById('campStatus');
  if (statusEl) statusEl.value = c.status || 'active';
  const statusSpan = document.getElementById('campSaveStatus');
  if (statusSpan) statusSpan.textContent = '';
  const updateStatus = document.getElementById('updatePostStatus');
  if (updateStatus) updateStatus.textContent = '';
  const preview = document.getElementById('campCoverPreview');
  const placeholder = document.getElementById('campCoverPlaceholder');
  const coverImg = document.getElementById('campCoverImg');
  if (campaignCoverUrl && preview && placeholder && coverImg) {
    coverImg.src = campaignCoverUrl;
    preview.hidden = false;
    placeholder.hidden = true;
  } else if (preview && placeholder) {
    preview.hidden = true;
    placeholder.hidden = false;
  }
  renderCampPhotosGrid();
  const editorCard = document.getElementById('campaignEditorCard');
  const updateCard = document.getElementById('campaignUpdateCard');
  if (editorCard) {
    editorCard.hidden = false;
    editorCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  if (updateCard) updateCard.hidden = false;
}

function closeCampaignEditor() {
  const editorCard = document.getElementById('campaignEditorCard');
  if (editorCard) editorCard.hidden = true;
  const updateCard = document.getElementById('campaignUpdateCard');
  if (updateCard) updateCard.hidden = true;
  editingCampaignId = null;
}

async function uploadCampaignPhoto(file, campaignId) {
  const parishId = currentParish?.parishId;
  if (!parishId) throw new Error('No parish loaded');
  const qs = campaignId ? '?campaign=' + encodeURIComponent(campaignId) : '';
  const res = await fetch('/api/parish/dashboard/' + encodeURIComponent(parishId) + '/campaign-upload' + qs, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': file.type },
    body: file,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data;
}

async function handleCoverUpload(input) {
  const file = input.files?.[0];
  if (!file) return;
  const zone = document.getElementById('campCoverUploadZone');
  if (zone) zone.style.opacity = '0.6';
  try {
    const result = await uploadCampaignPhoto(file, editingCampaignId);
    campaignCoverUrl = result.url;
    const img = document.getElementById('campCoverImg');
    if (img) img.src = campaignCoverUrl;
    const preview = document.getElementById('campCoverPreview');
    if (preview) preview.hidden = false;
    const placeholder = document.getElementById('campCoverPlaceholder');
    if (placeholder) placeholder.hidden = true;
  } catch (e) {
    alert('Cover upload failed: ' + e.message);
  } finally {
    if (zone) zone.style.opacity = '';
    input.value = '';
  }
}

function removeCoverPhoto(e) {
  e.stopPropagation();
  campaignCoverUrl = '';
  const img = document.getElementById('campCoverImg');
  if (img) img.src = '';
  const preview = document.getElementById('campCoverPreview');
  if (preview) preview.hidden = true;
  const placeholder = document.getElementById('campCoverPlaceholder');
  if (placeholder) placeholder.hidden = false;
}

async function handlePhotosUpload(input) {
  const files = Array.from(input.files || []);
  if (!files.length) return;
  for (const file of files) {
    try {
      const r = await uploadCampaignPhoto(file, editingCampaignId);
      campaignPhotos.push({ url: r.url, key: r.key });
    } catch (e) {
      alert('Photo upload failed: ' + e.message);
    }
  }
  renderCampPhotosGrid();
  input.value = '';
}

function renderCampPhotosGrid() {
  const grid = document.getElementById('campPhotosGrid');
  if (!grid) return;
  grid.innerHTML = campaignPhotos
    .map(
      (p, i) =>
        '<div style="position:relative;"><img src="' +
        p.url +
        '" alt="Photo ' +
        (i + 1) +
        '" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:6px;" />' +
        '<button type="button" onclick="removeCampPhoto(' +
        i +
        ')" style="position:absolute;top:4px;right:4px;background:rgba(6,21,34,0.72);border:none;color:#fff;border-radius:50%;width:22px;height:22px;cursor:pointer;font-size:0.75rem;line-height:1;">&#10005;</button></div>'
    )
    .join('');
}

function removeCampPhoto(i) {
  campaignPhotos.splice(i, 1);
  renderCampPhotosGrid();
}

async function saveCampaign() {
  if (!currentParish) return;
  const statusSpan = document.getElementById('campSaveStatus');
  const btn = document.getElementById('saveCampaignBtn');
  const name = (document.getElementById('campName')?.value || '').trim();
  if (!name) {
    if (statusSpan) statusSpan.textContent = 'Campaign name is required.';
    return;
  }
  const goalVal = (document.getElementById('campGoal')?.value || '').trim();
  const campaignData = {
    id: editingCampaignId || 'camp_' + crypto.randomUUID().replace(/-/g, '').substring(0, 10),
    name,
    slug: slugifyCampaign(name),
    goalCents: goalVal ? Math.round(Number(goalVal) * 100) : 0,
    description: (document.getElementById('campDescription')?.value || '').trim(),
    status: document.getElementById('campStatus')?.value || 'active',
    endsAt: document.getElementById('campEndsAt')?.value || '',
    coverPhotoUrl: campaignCoverUrl,
    photos: campaignPhotos.map((p) => ({ url: p.url, key: p.key })),
    createdAt: editingCampaignId
      ? (currentParish.campaigns || []).find((c) => c.id === editingCampaignId)?.createdAt || new Date().toISOString()
      : new Date().toISOString(),
    updates: editingCampaignId
      ? (currentParish.campaigns || []).find((c) => c.id === editingCampaignId)?.updates || []
      : [],
  };
  let campaigns = [...(currentParish.campaigns || [])];
  campaigns = editingCampaignId
    ? campaigns.map((c) => (c.id === editingCampaignId ? campaignData : c))
    : [...campaigns, campaignData];
  if (btn) {
    btn.disabled = true;
    btn.classList.add('loading');
  }
  if (statusSpan) statusSpan.textContent = 'Saving…';
  try {
    const res = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId), {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaigns }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Save failed');
    currentParish = { ...currentParish, campaigns: data.campaigns || campaigns };
    editingCampaignId = campaignData.id;
    renderCampaignList(currentParish);
    const updateCard = document.getElementById('campaignUpdateCard');
    if (updateCard) updateCard.hidden = false;
    const slug = campaignData.slug;
    const pageUrl = campaignPublicUrl(currentParish.parishId, slug);
    if (statusSpan)
      statusSpan.innerHTML =
        '✓ Saved — <a href="' + pageUrl + '" target="_blank" style="color:var(--gold)">View campaign page ↗</a>';
  } catch (e) {
    if (statusSpan) statusSpan.textContent = 'Error: ' + e.message;
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('loading');
    }
  }
}

async function postCampaignUpdate() {
  if (!currentParish || !editingCampaignId) return;
  const body = (document.getElementById('updateBody')?.value || '').trim();
  const statusSpan = document.getElementById('updatePostStatus');
  if (!body) {
    if (statusSpan) statusSpan.textContent = 'Write something first.';
    return;
  }
  const campaign = (currentParish.campaigns || []).find((c) => c.id === editingCampaignId);
  if (!campaign) return;
  const newUpdate = {
    id: 'upd_' + crypto.randomUUID().replace(/-/g, '').substring(0, 10),
    date: new Date().toISOString(),
    body,
  };
  const updates = [newUpdate, ...(campaign.updates || [])];
  const campaigns = (currentParish.campaigns || []).map((c) => (c.id === editingCampaignId ? { ...c, updates } : c));
  if (statusSpan) statusSpan.textContent = 'Posting…';
  try {
    const res = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId), {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaigns }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    currentParish = { ...currentParish, campaigns: data.campaigns || campaigns };
    const bodyEl = document.getElementById('updateBody');
    if (bodyEl) bodyEl.value = '';
    if (statusSpan) statusSpan.textContent = '✓ Update posted';
    setTimeout(() => {
      if (statusSpan) statusSpan.textContent = '';
    }, 3000);
  } catch (e) {
    if (statusSpan) statusSpan.textContent = 'Error: ' + e.message;
  }
}

window.ParishFeatureRegistry.register('campaigns', {
  load: () => renderCampaignList(currentParish),
  refresh: () => renderCampaignList(currentParish),
});
