'use strict';

// Parish dashboard koinonia: koinonia.
// Classic script; preserve global names used by the dashboard and inline actions.

const KOINONIA_NATIVE_VIDEO_UPLOADS_VISIBLE = false;

let communicationsState = {
  loaded: false,
  announcements: [],
  teaching: [],
  videos: [],
  youtube: [],
  youtubeChannel: null,
  blog: null,
  readers: {},
};

function syncKoinoniaVideoAdminAvailability() {
  document.querySelectorAll('[data-native-video-upload]').forEach((element) => {
    element.hidden = !KOINONIA_NATIVE_VIDEO_UPLOADS_VISIBLE;
  });
  const management = document.querySelector('[data-native-video-management]');
  if (management) {
    management.hidden = !KOINONIA_NATIVE_VIDEO_UPLOADS_VISIBLE && !(communicationsState.videos || []).length;
    management.classList.toggle('is-list-only', !KOINONIA_NATIVE_VIDEO_UPLOADS_VISIBLE);
  }
}

let koinoniaMinistriesState = { loaded: false, ministries: [], selectedId: '', editingId: '', people: [] };

let prayerAdminState = { loaded: false, requests: [], settings: null, metrics: {}, filter: 'review', selectedId: '' };

const koinoniaMinistryImageUrls = new Map();

let koinoniaStudioView = 'overview';

function communicationsApi(path = '') {
  return '/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/communications' + path;
}

function prayerAdminApi(path = '') {
  return '/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/prayer-requests' + path;
}

function announcementStatusLabel(status) {
  return status === 'published' ? 'Published' : status === 'archived' ? 'Archived' : 'Draft';
}

function contentCategoryLabel(category) {
  return String(category || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function setKoinoniaStudioView(view = 'overview') {
  const allowed = new Set([
    'overview',
    'bulletins',
    'announcements',
    'audio',
    'video',
    'ministries',
    'prayers',
    'news',
  ]);
  koinoniaStudioView = allowed.has(view) ? view : 'overview';
  document.querySelectorAll('[data-koinonia-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.koinoniaPanel !== koinoniaStudioView;
  });
  document.querySelectorAll('[data-koinonia-view]').forEach((button) => {
    const active = button.dataset.koinoniaView === koinoniaStudioView;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });
  if (koinoniaStudioView === 'overview') renderKoinoniaOverview();
  if (koinoniaStudioView === 'bulletins') void loadBulletins();
  if (koinoniaStudioView === 'ministries') loadKoinoniaMinistries();
  if (koinoniaStudioView === 'prayers') loadParishPrayerRequests();
}

async function loadCommunicationsTab(force = false) {
  syncKoinoniaVideoAdminAvailability();
  if (!currentParish) return;
  if (!currentParish.parishLifeAvailable) return;
  const included = moduleIncluded('communications');
  const workspace = document.getElementById('communicationsWorkspace');
  const paywall = document.getElementById('communicationsPaywall');
  const disabledNotice = document.getElementById('communicationsDisabledNotice');
  const badge = document.getElementById('communicationsNavBadge');
  const toggle = document.getElementById('communicationsEnabledSwitch');
  const enabled = Boolean(currentParish.communicationsEnabled);
  if (workspace) workspace.hidden = !included;
  if (paywall) paywall.hidden = included;
  if (disabledNotice) disabledNotice.hidden = !included || enabled;
  if (badge) badge.hidden = included;
  if (toggle) {
    toggle.checked = enabled;
    toggle.disabled = !included;
    const label = toggle.closest('label')?.querySelector('em');
    if (label) label.textContent = enabled ? 'On' : 'Off';
  }
  [
    ['signupsEnabledSwitch', 'signupsEnabled'],
    ['exchangeEnabledSwitch', 'exchangeEnabled'],
    ['prayerRequestsEnabledSwitch', 'prayerRequestsEnabled'],
  ].forEach(([id, field]) => {
    const input = document.getElementById(id);
    if (!input) return;
    const subfeatureEnabled = Boolean(currentParish[field]);
    input.checked = subfeatureEnabled;
    input.disabled = !included || !enabled;
    const label = input.closest('label')?.querySelector('em');
    if (label) label.textContent = subfeatureEnabled ? 'On' : 'Off';
  });
  syncModuleStatusNavigation('communications', included, enabled);
  if (!included || (communicationsState.loaded && !force)) return;
  const [announcementResponse, teachingResponse, videoResponse, blogResponse] = await Promise.all([
    fetch(communicationsApi(), { headers: authHeaders(), cache: 'no-store' }),
    fetch(communicationsApi('/teaching'), { headers: authHeaders(), cache: 'no-store' }),
    fetch(communicationsApi('/video'), { headers: authHeaders(), cache: 'no-store' }),
    fetch(communicationsApi('/blog'), { headers: authHeaders(), cache: 'no-store' }),
  ]);
  const [data, teachingData, videoData, blogData] = await Promise.all([
    announcementResponse.json(),
    teachingResponse.json(),
    videoResponse.json(),
    blogResponse.json(),
  ]);
  if (!announcementResponse.ok) {
    setStatus(data.error || 'Unable to load announcements.', 'error');
    return;
  }
  if (!teachingResponse.ok) {
    setStatus(teachingData.error || 'Unable to load teaching posts.', 'error');
    return;
  }
  if (!videoResponse.ok) {
    setStatus(videoData.error || 'Unable to load video posts.', 'error');
    return;
  }
  if (!blogResponse.ok) {
    setStatus(blogData.error || 'Unable to load the priest’s blog settings.', 'error');
    return;
  }
  communicationsState = {
    loaded: true,
    announcements: data.announcements || [],
    teaching: teachingData.posts || [],
    videos: videoData.videos || [],
    youtube: videoData.youtube || [],
    youtubeChannel: videoData.youtubeChannel || null,
    blog: blogData.blog || null,
    readers: communicationsState.readers || {},
  };
  syncKoinoniaVideoAdminAvailability();
  const youtubeChannelUrl = document.getElementById('youtubeChannelUrl');
  if (youtubeChannelUrl) youtubeChannelUrl.value = communicationsState.youtubeChannel?.channelUrl || '';
  const blogEnabled = document.getElementById('parishBlogEnabled');
  const blogSourceUrl = document.getElementById('parishBlogSourceUrl');
  const blogFeedStatus = document.getElementById('parishBlogFeedStatus');
  if (blogEnabled) blogEnabled.checked = Boolean(communicationsState.blog?.enabled);
  if (blogSourceUrl) blogSourceUrl.value = communicationsState.blog?.sourceUrl || '';
  if (blogFeedStatus)
    blogFeedStatus.textContent = communicationsState.blog?.feedUrl
      ? `Validated feed: ${communicationsState.blog.feedUrl}`
      : 'No blog feed configured.';
  renderCommunicationsList();
  renderTeachingAdminList();
  renderVideoAdminList();
  renderYouTubeAdminList();
  renderKoinoniaOverview();
  if (koinoniaStudioView === 'ministries') loadKoinoniaMinistries(true);
  if (koinoniaStudioView === 'prayers') loadParishPrayerRequests(true);
  setKoinoniaStudioView(koinoniaStudioView);
}

async function saveParishBlogSettings(event) {
  event.preventDefault();
  if (!currentParish || !moduleIncluded('communications')) return;
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  if (button) {
    button.disabled = true;
    button.classList.add('loading');
  }
  try {
    const response = await fetch(communicationsApi('/blog'), {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled: Boolean(document.getElementById('parishBlogEnabled')?.checked),
        sourceUrl: document.getElementById('parishBlogSourceUrl')?.value.trim() || '',
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Unable to save the priest’s blog.');
    communicationsState.loaded = false;
    await loadCommunicationsTab(true);
    setStatus(
      data.blog?.enabled
        ? 'The priest’s newest blog posts will appear in Koinonia.'
        : 'The priest’s blog is hidden from Koinonia.',
      'success'
    );
  } catch (error) {
    setStatus(error.message || 'Unable to save the priest’s blog.', 'error');
  } finally {
    if (button) {
      button.disabled = false;
      button.classList.remove('loading');
    }
  }
}

async function toggleCommunicationsFeature(input) {
  if (!currentParish || !moduleIncluded('communications')) return;
  const enabled = Boolean(input?.checked);
  const previous = Boolean(currentParish.communicationsEnabled);
  if (input) input.disabled = true;
  try {
    const response = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId), {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ communicationsEnabled: enabled }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || payload.detail || 'Unable to update Koinonia.');
    currentParish = { ...currentParish, ...(payload.parish || {}) };
    currentParish.communicationsEnabled = Boolean(payload.parish?.communicationsEnabled ?? enabled);
    communicationsState.loaded = false;
    setStatus(
      currentParish.communicationsEnabled
        ? 'Parish publishing is live in Koinonia.'
        : 'Parish publishing is hidden; the Koinonia calendar remains available.',
      'success'
    );
    await loadCommunicationsTab(true);
  } catch (error) {
    currentParish.communicationsEnabled = previous;
    if (input) input.checked = previous;
    setStatus(error.message, 'error');
    await loadCommunicationsTab();
  } finally {
    if (input) input.disabled = false;
  }
}

async function toggleKoinoniaSubfeature(feature, input) {
  const fields = { signups: 'signupsEnabled', exchange: 'exchangeEnabled', prayers: 'prayerRequestsEnabled' };
  const labels = { signups: 'Parish Signups', exchange: 'Parish Exchange', prayers: 'Prayer Requests' };
  const field = fields[feature];
  if (!field || !currentParish || !moduleIncluded('communications')) return;
  const previous = Boolean(currentParish[field]);
  if (!currentParish.communicationsEnabled) {
    if (input) input.checked = previous;
    setStatus(`Turn on Koinonia before enabling ${labels[feature]}.`, 'error');
    return;
  }
  const enabled = Boolean(input?.checked);
  if (input) input.disabled = true;
  try {
    const response = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId), {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: enabled }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || payload.detail || `Unable to update ${labels[feature]}.`);
    currentParish = {
      ...currentParish,
      ...(payload.parish || {}),
      [field]: Boolean(payload.parish?.[field] ?? enabled),
    };
    setStatus(`${labels[feature]} ${currentParish[field] ? 'is available' : 'is hidden'} in Koinonia.`, 'success');
    await loadCommunicationsTab();
  } catch (error) {
    currentParish[field] = previous;
    if (input) input.checked = previous;
    setStatus(error.message, 'error');
    await loadCommunicationsTab();
  } finally {
    if (input) input.disabled = false;
  }
}

window.ParishFeatureRegistry.register('koinonia', {
  load: loadCommunicationsTab,
  refresh: () => loadCommunicationsTab(true),
});
