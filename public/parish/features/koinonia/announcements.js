'use strict';

// Parish dashboard koinonia: announcements.
// Classic script; preserve global names used by the dashboard and inline actions.

function openKoinoniaComposer(view) {
  setKoinoniaStudioView(view);
  const targetId =
    view === 'announcements'
      ? 'announcementTitle'
      : view === 'audio'
        ? 'teachingTitle'
        : view === 'video'
          ? 'videoTitle'
          : view === 'news'
            ? 'parishBlogSourceUrl'
            : '';
  if (!targetId) return;
  requestAnimationFrame(() => {
    const target = document.getElementById(targetId);
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target?.focus({ preventScroll: true });
  });
}

function renderKoinoniaOverview() {
  const announcements = communicationsState.announcements || [];
  const audio = communicationsState.teaching || [];
  const videos = communicationsState.videos || [];
  const youtube = communicationsState.youtube || [];
  const publishedAnnouncements = announcements.filter((item) => item.status === 'published').length;
  const announcementDrafts = announcements.filter((item) => item.status === 'draft').length;
  const publishedAudio = audio.filter((item) => item.status === 'published').length;
  const audioDrafts = audio.filter((item) => item.status === 'draft').length;
  const publishedVideo = videos.filter((item) => item.status === 'published').length + youtube.length;
  const setText = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  };
  setText('koinoniaPublishedAnnouncements', String(publishedAnnouncements));
  setText('koinoniaAnnouncementDrafts', `${announcementDrafts} draft${announcementDrafts === 1 ? '' : 's'}`);
  setText('koinoniaPublishedAudio', String(publishedAudio));
  setText('koinoniaAudioDrafts', `${audioDrafts} draft${audioDrafts === 1 ? '' : 's'}`);
  setText('koinoniaPublishedVideo', String(publishedVideo));
  setText('koinoniaVideoDrafts', `${youtube.length} YouTube video${youtube.length === 1 ? '' : 's'}`);
  setText('koinoniaBlogStatus', communicationsState.blog?.enabled ? 'Connected' : 'Not connected');
  setText('koinoniaBlogDetail', communicationsState.blog?.feedUrl ? 'Feed validated' : 'Optional news source');
  const calendarInput = document.getElementById('koinoniaCalendarUrl');
  const calendarStatus = document.getElementById('koinoniaCalendarStatus');
  if (calendarInput && document.activeElement !== calendarInput)
    calendarInput.value = currentParish?.koinoniaCalendarUrl || '';
  if (calendarStatus)
    calendarStatus.textContent = currentParish?.koinoniaCalendarUrl
      ? 'Public calendar link saved.'
      : 'No calendar sync link saved.';

  const recent = [
    ...announcements.map((item) => ({ ...item, kind: 'Announcement', icon: '▤', view: 'announcements' })),
    ...audio.map((item) => ({ ...item, kind: 'Audio', icon: '♪', view: 'audio' })),
    ...videos.map((item) => ({ ...item, kind: 'Video', icon: '▶', view: 'video' })),
  ]
    .sort(
      (left, right) =>
        new Date(right.updatedAt || right.publishedAt || right.createdAt || 0) -
        new Date(left.updatedAt || left.publishedAt || left.createdAt || 0)
    )
    .slice(0, 6);
  const target = document.getElementById('koinoniaRecentContent');
  if (!target) return;
  target.innerHTML = recent.length
    ? recent
        .map(
          (item) => `
      <button type="button" onclick="setKoinoniaStudioView('${escapeAttr(item.view)}')">
        <span class="koinonia-recent-icon">${item.icon}</span>
        <span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.kind)} · ${escapeHtml(announcementStatusLabel(item.status))} · ${escapeHtml(shortDate(item.updatedAt || item.publishedAt || item.createdAt))}</small></span>
        <em>Open →</em>
      </button>`
        )
        .join('')
    : '<div class="communications-empty"><strong>Your studio is ready</strong><p>Publish the first announcement, audio post, or video for your parish.</p></div>';
}

function renderCommunicationsList() {
  const list = document.getElementById('communicationsList');
  if (!list) return;
  const rows = communicationsState.announcements || [];
  if (!rows.length) {
    list.innerHTML =
      '<div class="communications-empty"><strong>No announcements yet</strong><p>Save your first draft to begin.</p></div>';
    return;
  }
  list.innerHTML = rows
    .map(
      (item) => `
      <article class="communications-row${item.pinned ? ' is-pinned' : ''}">
        ${item.heroImageUrl ? `<img class="communications-row-image" src="${escapeAttr(item.heroImageUrl)}" alt="" loading="lazy" />` : ''}
        <div class="communications-row-copy"><div class="communications-row-meta"><span class="communications-status is-${escapeAttr(item.status)}">${announcementStatusLabel(item.status)}</span><span>${escapeHtml(contentCategoryLabel(item.category || 'general'))}</span>${item.pinned ? '<span>📌 Pinned</span>' : ''}<span>${escapeHtml(shortDate(item.publishedAt || item.updatedAt || item.createdAt))}</span></div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.body)}</p></div>
        <div class="communications-row-actions">
          ${item.status === 'published' ? `<button class="btn btn-ghost btn-sm" type="button" onclick="toggleAnnouncementReaders('${escapeAttr(item.id)}',this)">${Number(item.readCount || 0)} read</button>` : ''}
          ${item.status !== 'archived' ? `<button class="btn btn-ghost btn-sm" type="button" onclick="editAnnouncement('${escapeAttr(item.id)}')">Edit</button>` : ''}
          ${item.status === 'draft' ? `<button class="btn btn-gold btn-sm" type="button" onclick="publishAnnouncement('${escapeAttr(item.id)}',this)">Publish</button>` : ''}
          ${item.status !== 'archived' ? `<button class="btn btn-danger btn-sm" type="button" onclick="archiveAnnouncement('${escapeAttr(item.id)}',this)">Archive</button>` : ''}
          <button class="btn btn-danger btn-sm" type="button" onclick="deleteAnnouncement('${escapeAttr(item.id)}',this)">Delete</button>
        </div>
        <div class="communications-readers" id="communicationsReaders-${escapeAttr(item.id)}" hidden></div>
      </article>
    `
    )
    .join('');
}

async function toggleAnnouncementReaders(id, button) {
  const panel = document.getElementById('communicationsReaders-' + id);
  if (!panel) return;
  if (!panel.hidden) {
    panel.hidden = true;
    button?.setAttribute('aria-expanded', 'false');
    return;
  }
  button?.setAttribute('aria-expanded', 'true');
  panel.hidden = false;
  const cached = communicationsState.readers[id];
  if (cached) {
    renderAnnouncementReaders(panel, cached);
    return;
  }
  panel.innerHTML = '<p>Loading readers...</p>';
  try {
    const response = await fetch(communicationsApi('/' + encodeURIComponent(id) + '/readers'), {
      headers: authHeaders(),
      cache: 'no-store',
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to load readers.');
    communicationsState.readers[id] = data;
    renderAnnouncementReaders(panel, data);
  } catch (error) {
    panel.innerHTML = `<p>${escapeHtml(error.message || 'Unable to load readers.')}</p>`;
  }
}

function renderAnnouncementReaders(panel, data) {
  const readers = data.readers || [];
  panel.innerHTML = readers.length
    ? `<strong>${readers.length} parishioner${readers.length === 1 ? '' : 's'} read this</strong><ul>${readers.map((reader) => `<li><span>${escapeHtml(reader.displayName || reader.donorId || 'Parishioner')}</span><time>${escapeHtml(new Date(reader.readAt).toLocaleString())}</time></li>`).join('')}</ul>`
    : '<strong>No readers yet</strong><p>Readers will appear here after opening this announcement in My AGAPAY.</p>';
}

function insertAnnouncementFormatting(kind, targetId = 'announcementBody') {
  const textarea = document.getElementById(targetId);
  if (!textarea) return;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = textarea.value.slice(start, end);
  const examples = {
    bold: 'important words',
    italic: 'emphasized words',
    link: 'parish website',
    list: 'first item\nsecond item',
  };
  const value = selected || examples[kind] || '';
  let replacement = value;
  if (kind === 'bold') replacement = `**${value}**`;
  if (kind === 'italic') replacement = `*${value}*`;
  if (kind === 'link') replacement = `[${value}](https://)`;
  if (kind === 'list')
    replacement = value
      .split(/\r?\n/)
      .map((line) => `- ${line.replace(/^\s*-\s*/, '')}`)
      .join('\n');
  textarea.setRangeText(replacement, start, end, 'select');
  textarea.focus();
}

function insertTeachingFormatting(kind) {
  const textarea = document.getElementById('teachingBody');
  if (!textarea) return;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = textarea.value.slice(start, end);
  const examples = {
    bold: 'important words',
    italic: 'emphasized words',
    link: 'parish website',
    list: 'first item\nsecond item',
  };
  const value = selected || examples[kind] || '';
  let replacement = value;
  if (kind === 'bold') replacement = `**${value}**`;
  if (kind === 'italic') replacement = `*${value}*`;
  if (kind === 'link') replacement = `[${value}](https://)`;
  if (kind === 'list')
    replacement = value
      .split(/\r?\n/)
      .map((line) => `- ${line.replace(/^\s*-\s*/, '')}`)
      .join('\n');
  textarea.setRangeText(replacement, start, end, 'select');
  textarea.focus();
}

async function uploadAnnouncementHero(announcementId, file) {
  const response = await fetch(communicationsApi('/' + encodeURIComponent(announcementId) + '/hero-image'), {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': file.type },
    body: file,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to upload the announcement image.');
  return data.announcement;
}

async function createAnnouncementDraft(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const heroImage = document.getElementById('announcementHeroImage')?.files?.[0] || null;
  const button = form.querySelector('button[type="submit"]');
  if (button) {
    button.disabled = true;
    button.classList.add('loading');
  }
  try {
    const response = await fetch(communicationsApi(), {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: document.getElementById('announcementTitle').value,
        body: document.getElementById('announcementBody').value,
        category: document.getElementById('announcementCategory').value,
        pinned: document.getElementById('announcementPinned').checked,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to save announcement.');
    if (heroImage) await uploadAnnouncementHero(data.announcement.id, heroImage);
    form.reset();
    await loadCommunicationsTab(true);
    setStatus(
      heroImage ? 'Announcement and hero image saved as a draft.' : 'Announcement saved as a draft.',
      'success'
    );
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    if (button) {
      button.disabled = false;
      button.classList.remove('loading');
    }
  }
}

async function patchAnnouncement(id, changes) {
  const response = await fetch(communicationsApi('/' + encodeURIComponent(id)), {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to update announcement.');
  await loadCommunicationsTab(true);
  return data.announcement;
}

function editAnnouncement(id) {
  const item = communicationsState.announcements.find((row) => row.id === id);
  const dialog = document.getElementById('announcementEditDialog');
  if (!item || !dialog || item.status === 'archived') return;
  dialog.dataset.announcementId = id;
  document.getElementById('announcementEditTitle').value = item.title || '';
  document.getElementById('announcementEditCategory').value = item.category || 'general';
  document.getElementById('announcementEditBody').value = item.body || '';
  document.getElementById('announcementEditPinned').checked = Boolean(item.pinned);
  document.getElementById('announcementEditHeroImage').value = '';
  document.getElementById('announcementEditHeroCurrent').textContent = item.heroImageUrl
    ? 'A hero image is currently attached. Choose a file only to replace it.'
    : 'No hero image is attached. Choose a file to add one.';
  document.getElementById('announcementEditStatus').textContent =
    item.status === 'published'
      ? 'This announcement is published. Saved changes appear immediately in My AGAPAY.'
      : 'This announcement is still a draft.';
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  window.setTimeout(() => document.getElementById('announcementEditTitle')?.focus(), 40);
}

function closeAnnouncementEditor() {
  const dialog = document.getElementById('announcementEditDialog');
  if (!dialog) return;
  delete dialog.dataset.announcementId;
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
  document.getElementById('announcementEditForm')?.reset();
}

async function saveAnnouncementEdit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const dialog = document.getElementById('announcementEditDialog');
  const id = dialog?.dataset.announcementId || '';
  const button = form.querySelector('button[type="submit"]');
  if (!id) return;
  if (button) {
    button.disabled = true;
    button.classList.add('loading');
  }
  try {
    await patchAnnouncement(id, {
      title: document.getElementById('announcementEditTitle').value,
      category: document.getElementById('announcementEditCategory').value,
      body: document.getElementById('announcementEditBody').value,
      pinned: document.getElementById('announcementEditPinned').checked,
    });
    const heroImage = document.getElementById('announcementEditHeroImage').files?.[0];
    if (heroImage) {
      await uploadAnnouncementHero(id, heroImage);
      await loadCommunicationsTab(true);
    }
    closeAnnouncementEditor();
    setStatus('Announcement updated.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    if (button) {
      button.disabled = false;
      button.classList.remove('loading');
    }
  }
}

async function publishAnnouncement(id, button) {
  if (!confirm('Publish this announcement to every parishioner in My AGAPAY?')) return;
  if (button) {
    button.disabled = true;
    button.classList.add('loading');
  }
  try {
    await patchAnnouncement(id, { status: 'published' });
    setStatus('Announcement published.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    if (button) {
      button.disabled = false;
      button.classList.remove('loading');
    }
  }
}

async function archiveAnnouncement(id, button) {
  if (!confirm('Archive this announcement? It will leave the donor feed but remain in this list.')) return;
  if (button) {
    button.disabled = true;
    button.classList.add('loading');
  }
  try {
    const response = await fetch(communicationsApi('/' + encodeURIComponent(id) + '/archive'), {
      method: 'POST',
      headers: authHeaders(),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to archive announcement.');
    await loadCommunicationsTab(true);
    setStatus('Announcement archived.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    if (button) {
      button.disabled = false;
      button.classList.remove('loading');
    }
  }
}

async function deleteAnnouncement(id, button) {
  const item = communicationsState.announcements.find((row) => row.id === id);
  if (
    !confirm(
      `Permanently delete “${item?.title || 'this announcement'}”? Its read history and attached hero image will also be removed. This cannot be undone.`
    )
  )
    return;
  if (button) {
    button.disabled = true;
    button.classList.add('loading');
  }
  try {
    const response = await fetch(communicationsApi('/' + encodeURIComponent(id)), {
      method: 'DELETE',
      headers: authHeaders(),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Unable to delete announcement.');
    await loadCommunicationsTab(true);
    setStatus('Announcement permanently deleted.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    if (button) {
      button.disabled = false;
      button.classList.remove('loading');
    }
  }
}
