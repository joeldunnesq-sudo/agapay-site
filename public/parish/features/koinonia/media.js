'use strict';

// Parish dashboard koinonia: media.
// Classic script; preserve global names used by the dashboard and inline actions.

function renderTeachingAdminList() {
  const list = document.getElementById('teachingAdminList');
  if (!list) return;
  const rows = communicationsState.teaching || [];
  if (!rows.length) {
    list.innerHTML =
      '<div class="communications-empty"><strong>No teaching posts yet</strong><p>Save a reflection or audio teaching as a draft to begin.</p></div>';
    return;
  }
  list.innerHTML = rows
    .map(
      (item) => `
      <article class="communications-row${item.pinned ? ' is-pinned' : ''}">
        <div class="communications-row-copy"><div class="communications-row-meta"><span class="communications-status is-${escapeAttr(item.status)}">${announcementStatusLabel(item.status)}</span><span>${escapeHtml(contentCategoryLabel(item.category || 'homilies'))}</span>${item.audioUrl ? `<span class="communications-audio-label">▶ ${item.audioSource === 'external' ? 'Linked audio' : 'Audio'}</span>` : '<span>Text</span>'}${item.pinned ? `<span>${item.status === 'published' ? 'Pinned for parishioners' : 'Will pin when published'}</span>` : ''}<span>${escapeHtml(shortDate(item.publishedAt || item.updatedAt || item.createdAt))}</span></div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.body)}</p></div>
        <div class="communications-row-actions">
          ${item.status === 'published' ? `<span class="btn btn-ghost btn-sm" aria-label="${Number(item.readCount || 0)} readers">${Number(item.readCount || 0)} read</span>` : ''}
          ${item.status !== 'archived' ? `<button class="btn btn-ghost btn-sm" type="button" onclick="chooseTeachingAudioUpload('${escapeAttr(item.id)}',this)">${item.audioUrl ? 'Replace audio file' : 'Upload audio file'}</button>` : ''}
          ${item.status !== 'archived' && (!item.audioUrl || item.audioSource === 'external') ? `<button class="btn btn-ghost btn-sm" type="button" onclick="setTeachingAudioLink('${escapeAttr(item.id)}',this)">${item.audioUrl ? 'Replace audio link' : 'Add audio link'}</button>` : ''}
          ${item.status === 'published' ? `<button class="btn btn-ghost btn-sm" type="button" onclick="toggleTeachingPin('${escapeAttr(item.id)}',${item.pinned ? 'false' : 'true'},this)">${item.pinned ? 'Unpin' : 'Pin in My AGAPAY'}</button>` : ''}
          ${item.status !== 'archived' ? `<button class="btn btn-ghost btn-sm" type="button" onclick="editTeachingPost('${escapeAttr(item.id)}')">Edit</button>` : ''}
          ${item.status === 'draft' ? `<button class="btn btn-gold btn-sm" type="button" onclick="publishTeachingPost('${escapeAttr(item.id)}',this)">${item.pinned ? 'Publish pinned audio' : 'Publish'}</button>` : ''}
          ${item.status !== 'archived' ? `<button class="btn btn-danger btn-sm" type="button" onclick="archiveTeachingPost('${escapeAttr(item.id)}',this)">Archive</button>` : ''}
          <button class="btn btn-danger btn-sm" type="button" onclick="deleteTeachingPost('${escapeAttr(item.id)}',this)">Delete permanently</button>
        </div>
      </article>
    `
    )
    .join('');
}

function formatVideoDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${minutes}:${String(secs).padStart(2, '0')}`;
}

function renderVideoAdminList() {
  const list = document.getElementById('videoAdminList');
  if (!list) return;
  const rows = communicationsState.videos || [];
  list.innerHTML = rows.length
    ? rows
        .map(
          (item) => `
      <article class="communications-row${item.pinned ? ' is-pinned' : ''}">
        <div class="communications-row-copy"><div class="communications-row-meta"><span class="communications-status is-${escapeAttr(item.status)}">${announcementStatusLabel(item.status)}</span>${item.pinned ? '<span>📌 Featured</span>' : ''}<span class="video-processing-state">${item.readyToStream ? `Ready · ${formatVideoDuration(item.durationSeconds)}` : `Stream: ${escapeHtml(item.streamState || 'processing')}`}</span></div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description || 'No description')}</p></div>
        <div class="communications-row-actions">
          ${item.status === 'published' ? `<span class="btn btn-ghost btn-sm">${Number(item.watchCount || 0)} watched</span>` : ''}
          ${item.status !== 'archived' ? `<button class="btn btn-ghost btn-sm" type="button" onclick="editVideoPost('${escapeAttr(item.id)}')">Edit</button>` : ''}
          ${item.status === 'draft' ? `<button class="btn btn-gold btn-sm" type="button" ${item.readyToStream ? '' : 'disabled'} onclick="publishVideoPost('${escapeAttr(item.id)}',this)">${item.readyToStream ? 'Publish' : 'Processing…'}</button>` : ''}
          ${item.status !== 'archived' ? `<button class="btn btn-danger btn-sm" type="button" onclick="archiveVideo('${escapeAttr(item.id)}',this)">Archive</button>` : ''}
          <button class="btn btn-danger btn-sm" type="button" onclick="deleteVideo('${escapeAttr(item.id)}',this)">Delete permanently</button>
        </div>
      </article>`
        )
        .join('')
    : '<div class="communications-empty"><strong>No native videos yet</strong><p>Upload a recording to begin private Stream processing.</p></div>';
  if (rows.some((item) => item.status === 'draft' && !item.readyToStream && item.streamState !== 'error')) {
    window.clearTimeout(renderVideoAdminList.pollTimer);
    renderVideoAdminList.pollTimer = window.setTimeout(() => loadCommunicationsTab(true), 8000);
  }
}

function renderYouTubeAdminList() {
  const list = document.getElementById('youtubeAdminList');
  if (!list) return;
  const rows = communicationsState.youtube || [];
  const channel = communicationsState.youtubeChannel;
  const channelRow = channel
    ? `<article class="communications-row is-pinned"><div class="communications-row-copy"><div class="communications-row-meta"><span>Automatically synced channel</span></div><h3>${escapeHtml(channel.channelTitle || 'YouTube channel')}</h3><p>Every public upload is available through the embedded channel playlist in Koinonia.</p></div><div class="communications-row-actions"><a class="btn btn-ghost btn-sm" href="${escapeAttr(channel.channelUrl)}" target="_blank" rel="noopener">View channel</a><button class="btn btn-danger btn-sm" type="button" onclick="removeYouTubeChannel(this)">Disconnect</button></div></article>`
    : '';
  const curatedRows = rows
    .map(
      (item) =>
        `<article class="communications-row${item.pinned ? ' is-pinned' : ''}"><img class="communications-row-image" src="${escapeAttr(item.thumbnailUrl)}" alt="" loading="lazy" /><div class="communications-row-copy"><div class="communications-row-meta"><span>${item.pinned ? 'Pinned for parishioners' : 'Individually curated'}</span></div><h3>${escapeHtml(item.title)}</h3></div><div class="communications-row-actions"><button class="btn btn-ghost btn-sm" type="button" onclick="toggleYouTubeVideoPin('${escapeAttr(item.id)}',${item.pinned ? 'false' : 'true'},this)">${item.pinned ? 'Unpin' : 'Pin in My AGAPAY'}</button><button class="btn btn-danger btn-sm" type="button" onclick="removeYouTubeVideo('${escapeAttr(item.id)}',this)">Remove</button></div></article>`
    )
    .join('');
  list.innerHTML =
    channelRow + curatedRows ||
    '<div class="communications-empty"><strong>No YouTube channel connected</strong><p>Connect the parish channel once to keep Koinonia video up to date automatically.</p></div>';
}

async function uploadTeachingAudio(teachingId, file) {
  if (file.size > 50 * 1024 * 1024) throw new Error('Teaching audio must be 50MB or smaller.');
  const response = await fetch(communicationsApi('/teaching/' + encodeURIComponent(teachingId) + '/audio'), {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': file.type },
    body: file,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Unable to upload the teaching audio (HTTP ${response.status}).`);
  return data.post;
}

function chooseTeachingAudioUpload(teachingId, button) {
  const picker = document.createElement('input');
  picker.type = 'file';
  picker.accept = 'audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/x-wav,audio/ogg,audio/webm';
  picker.addEventListener(
    'change',
    async () => {
      const file = picker.files?.[0];
      if (!file) return;
      if (button) {
        button.disabled = true;
        button.classList.add('loading');
      }
      try {
        await uploadTeachingAudio(teachingId, file);
        await loadCommunicationsTab(true);
        setStatus('Teaching audio uploaded.', 'success');
      } catch (error) {
        setStatus(error.message, 'error');
      } finally {
        if (button) {
          button.disabled = false;
          button.classList.remove('loading');
        }
      }
    },
    { once: true }
  );
  picker.click();
}

async function setTeachingAudioLink(teachingId, button) {
  const item = communicationsState.teaching.find((row) => row.id === teachingId);
  if (!item) return;
  const currentLink = item.audioSource === 'external' ? item.audioUrl : '';
  const audioUrl = prompt('Public HTTPS audio link', currentLink || '');
  if (audioUrl === null) return;
  if (!audioUrl.trim()) {
    setStatus('Enter the direct HTTPS link to the audio recording.', 'error');
    return;
  }
  if (button) {
    button.disabled = true;
    button.classList.add('loading');
  }
  try {
    await patchTeachingPost(teachingId, { audioUrl: audioUrl.trim() });
    setStatus('Audio link saved. Parishioners can now play this post in My AGAPAY.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    if (button) {
      button.disabled = false;
      button.classList.remove('loading');
    }
  }
}

async function createTeachingDraft(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const audio = document.getElementById('teachingAudio')?.files?.[0] || null;
  const audioUrl = document.getElementById('teachingAudioUrl')?.value.trim() || '';
  const button = form.querySelector('button[type="submit"]');
  if (button) {
    button.disabled = true;
    button.classList.add('loading');
  }
  try {
    if (audio && audioUrl) throw new Error('Choose either an audio file or an audio link, not both.');
    const response = await fetch(communicationsApi('/teaching'), {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: document.getElementById('teachingTitle').value,
        body: document.getElementById('teachingBody').value,
        category: document.getElementById('teachingCategory').value,
        audioUrl,
        pinned: Boolean(document.getElementById('teachingPinned')?.checked),
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to save teaching post.');
    if (audio) {
      try {
        await uploadTeachingAudio(data.post.id, audio);
      } catch (error) {
        form.reset();
        await loadCommunicationsTab(true);
        throw error;
      }
    }
    form.reset();
    await loadCommunicationsTab(true);
    setStatus(
      audio
        ? 'Teaching post and audio saved as a draft.'
        : audioUrl
          ? 'Teaching post and audio link saved as a draft.'
          : 'Teaching post saved as a draft.',
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

async function patchTeachingPost(id, changes) {
  const response = await fetch(communicationsApi('/teaching/' + encodeURIComponent(id)), {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to update teaching post.');
  await loadCommunicationsTab(true);
  return data.post;
}

async function editTeachingPost(id) {
  const item = communicationsState.teaching.find((row) => row.id === id);
  if (!item) return;
  const title = prompt('Teaching title', item.title);
  if (title === null) return;
  const body = prompt('Teaching reflection', item.body);
  if (body === null) return;
  try {
    await patchTeachingPost(id, { title, body });
    setStatus('Teaching post updated.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

async function publishTeachingPost(id, button) {
  if (!confirm('Publish this teaching post to every parishioner in My AGAPAY?')) return;
  if (button) {
    button.disabled = true;
    button.classList.add('loading');
  }
  try {
    await patchTeachingPost(id, { status: 'published' });
    setStatus('Teaching post published.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    if (button) {
      button.disabled = false;
      button.classList.remove('loading');
    }
  }
}

async function archiveTeachingPost(id, button) {
  if (!confirm('Archive this teaching post? It will leave Parish Life but remain in this list.')) return;
  if (button) {
    button.disabled = true;
    button.classList.add('loading');
  }
  try {
    const response = await fetch(communicationsApi('/teaching/' + encodeURIComponent(id) + '/archive'), {
      method: 'POST',
      headers: authHeaders(),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to archive teaching post.');
    await loadCommunicationsTab(true);
    setStatus('Teaching post archived.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    if (button) {
      button.disabled = false;
      button.classList.remove('loading');
    }
  }
}

async function deleteTeachingPost(id, button) {
  const item = communicationsState.teaching.find((row) => row.id === id);
  const hostedNotice = item?.audioSource === 'upload' ? ' The uploaded audio file will also be removed.' : '';
  if (!confirm(`Permanently delete “${item?.title || 'this teaching post'}”?${hostedNotice} This cannot be undone.`))
    return;
  if (button) {
    button.disabled = true;
    button.classList.add('loading');
  }
  try {
    const response = await fetch(communicationsApi('/teaching/' + encodeURIComponent(id)), {
      method: 'DELETE',
      headers: authHeaders(),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Unable to delete teaching post.');
    await loadCommunicationsTab(true);
    setStatus('Teaching post permanently deleted.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    if (button) {
      button.disabled = false;
      button.classList.remove('loading');
    }
  }
}

function uploadVideoDirectly(uploadUrl, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', uploadUrl);
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    });
    xhr.addEventListener('load', () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('Stream rejected the video upload.'))
    );
    xhr.addEventListener('error', () => reject(new Error('The video upload was interrupted.')));
    const form = new FormData();
    form.append('file', file, file.name);
    xhr.send(form);
  });
}

async function createVideoUpload(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const file = document.getElementById('videoFile')?.files?.[0];
  const button = form.querySelector('button[type="submit"]');
  const progress = document.getElementById('videoUploadProgress');
  const fill = document.getElementById('videoUploadProgressFill');
  const label = document.getElementById('videoUploadProgressLabel');
  if (!file) return setStatus('Choose a recorded video first.', 'error');
  if (file.size > 200 * 1024 * 1024) return setStatus('This uploader accepts videos up to 200MB.', 'error');
  if (button) {
    button.disabled = true;
    button.classList.add('loading');
  }
  if (progress) progress.hidden = false;
  try {
    const response = await fetch(communicationsApi('/video/upload-url'), {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: document.getElementById('videoTitle').value,
        description: document.getElementById('videoDescription').value,
        pinned: document.getElementById('videoPinned').checked,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to prepare the private upload.');
    await uploadVideoDirectly(data.uploadUrl, file, (percent) => {
      if (fill) fill.style.width = `${percent}%`;
      if (label) label.textContent = `Uploading directly to Stream · ${percent}%`;
    });
    if (label) label.textContent = 'Upload complete · Stream is processing adaptive quality versions';
    form.reset();
    await loadCommunicationsTab(true);
    setStatus('Video uploaded privately. Publish becomes available when Stream processing is ready.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    if (button) {
      button.disabled = false;
      button.classList.remove('loading');
    }
  }
}

async function patchVideoPost(id, changes) {
  const response = await fetch(communicationsApi('/video/' + encodeURIComponent(id)), {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to update the video.');
  await loadCommunicationsTab(true);
  return data.post;
}

async function editVideoPost(id) {
  const item = communicationsState.videos.find((row) => row.id === id);
  if (!item) return;
  const title = prompt('Video title', item.title);
  if (title === null) return;
  const description = prompt('Video description', item.description || '');
  if (description === null) return;
  const pinned = confirm('Feature this video above newer uploads?');
  try {
    await patchVideoPost(id, { title, description, pinned });
    setStatus('Video details updated.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

async function publishVideoPost(id, button) {
  if (!confirm('Publish this private video to parishioners in My AGAPAY?')) return;
  if (button) button.disabled = true;
  try {
    await patchVideoPost(id, { status: 'published' });
    setStatus('Private video published.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

async function archiveVideo(id, button) {
  if (!confirm('Archive this video? It will no longer be playable in My AGAPAY.')) return;
  if (button) button.disabled = true;
  try {
    const response = await fetch(communicationsApi('/video/' + encodeURIComponent(id) + '/archive'), {
      method: 'POST',
      headers: authHeaders(),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to archive video.');
    await loadCommunicationsTab(true);
    setStatus('Video archived.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

async function deleteVideo(id, button) {
  const item = communicationsState.videos.find((row) => row.id === id);
  if (
    !confirm(
      `Permanently delete “${item?.title || 'this video'}”? Its hosted video and watch history will also be removed. This cannot be undone.`
    )
  )
    return;
  if (button) {
    button.disabled = true;
    button.classList.add('loading');
  }
  try {
    const response = await fetch(communicationsApi('/video/' + encodeURIComponent(id)), {
      method: 'DELETE',
      headers: authHeaders(),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Unable to delete video.');
    await loadCommunicationsTab(true);
    setStatus('Video permanently deleted.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    if (button) {
      button.disabled = false;
      button.classList.remove('loading');
    }
  }
}

async function addYouTubeVideo(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  if (button) button.disabled = true;
  try {
    const response = await fetch(communicationsApi('/video/youtube'), {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        youtubeUrl: document.getElementById('youtubeVideoUrl').value,
        pinned: Boolean(document.getElementById('youtubeVideoPinned')?.checked),
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to validate that YouTube video.');
    form.reset();
    await loadCommunicationsTab(true);
    setStatus('YouTube video added to Media.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

async function toggleTeachingPin(id, pinned, button) {
  if (button) button.disabled = true;
  try {
    await patchTeachingPost(id, { pinned });
    setStatus(pinned ? 'Audio pinned in My AGAPAY.' : 'Audio unpinned.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

async function saveYouTubeChannel(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  if (button) button.disabled = true;
  try {
    const response = await fetch(communicationsApi('/video/youtube-channel'), {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelUrl: document.getElementById('youtubeChannelUrl').value }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to connect that YouTube channel.');
    await loadCommunicationsTab(true);
    setStatus('YouTube channel connected. New public uploads will appear automatically.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

async function removeYouTubeChannel(button) {
  if (!confirm('Disconnect this YouTube channel? Individually curated videos will remain.')) return;
  if (button) button.disabled = true;
  try {
    const response = await fetch(communicationsApi('/video/youtube-channel'), {
      method: 'DELETE',
      headers: authHeaders(),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to disconnect the YouTube channel.');
    await loadCommunicationsTab(true);
    setStatus('YouTube channel disconnected.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

async function removeYouTubeVideo(id, button) {
  if (!confirm('Remove this YouTube link from Media?')) return;
  if (button) button.disabled = true;
  try {
    const response = await fetch(communicationsApi('/video/youtube/' + encodeURIComponent(id)), {
      method: 'DELETE',
      headers: authHeaders(),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to remove YouTube video.');
    await loadCommunicationsTab(true);
    setStatus('YouTube link removed.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

async function toggleYouTubeVideoPin(id, pinned, button) {
  if (button) button.disabled = true;
  try {
    const response = await fetch(communicationsApi('/video/youtube/' + encodeURIComponent(id) + '/pin'), {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to update the pinned video.');
    await loadCommunicationsTab(true);
    setStatus(pinned ? 'Video pinned in My AGAPAY.' : 'Video unpinned.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    if (button) button.disabled = false;
  }
}
