import type { GroupUiPresentation } from './groups-presentation.js';
declare const renderGroupWorkspaceError: GroupUiPresentation['renderGroupWorkspaceError'];
declare const renderGroupMessageContent: GroupUiPresentation['renderGroupMessageContent'];
declare const renderDecodedWaveform: GroupUiPresentation['renderDecodedWaveform'];
declare const renderMinistrySchedule: GroupUiPresentation['renderMinistrySchedule'];
declare const renderMinistryMembers: GroupUiPresentation['renderMinistryMembers'];
declare const renderMinistryResources: GroupUiPresentation['renderMinistryResources'];
declare const renderMinistryCommerce: GroupUiPresentation['renderMinistryCommerce'];
declare const renderGroupSignupManager: GroupUiPresentation['renderGroupSignupManager'];
declare const renderGroupCatchUp: GroupUiPresentation['renderGroupCatchUp'];
import type {
  GroupUiGroup,
  GroupUiMessage,
  GroupUiSignup,
  GroupUiPayload,
  GroupUiAttachment,
  GroupUiState,
} from './groups-contracts.js';
// eslint-disable-next-line prefer-const -- Preserve the original writable classic binding.
let ministryGroupsState: GroupUiState = {
  groups: [],
  activeGroupId: '',
  messages: [],
  catchUp: {},
  pendingAttachment: null,
  activeTab: 'overview',
  signupSheets: [],
  signupTemplates: [],
  activeSignup: null,
};
let initialGroupId = new URLSearchParams(window.location.search).get('group') || '';
let groupMediaRecorder: MediaRecorder | null = null;
let groupRecordingStream: MediaStream | null = null;
let groupRecordingStartedAt = 0;
let groupRecordingCancelled = false;
const groupAttachmentObjectUrls = new Map<string, string>();
const groupVoicePlayers = new Map<string, { audio: HTMLAudioElement }>();
const groupComposerIcons = Object.freeze({
  voice:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/></svg>',
  photo:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"/><circle cx="12" cy="13" r="3"/></svg>',
  stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>',
});

function groupComposerButton(icon: keyof typeof groupComposerIcons, label: string) {
  return `${groupComposerIcons[icon]}<span>${label}</span>`;
}

function groupsEscape(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function groupsHeaders() {
  return window.MyAgapayShell?.authHeaders({ 'Content-Type': 'application/json' }) || {};
}

function groupMessageTime(value: unknown) {
  const date = new Date(value as string | number);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function groupDuration(value: unknown) {
  const total = Math.max(0, Math.round(Number(value) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function groupStatus(message: string) {
  const status = document.getElementById('groupsStatus');
  if (!status) return;
  status.hidden = !message;
  status.textContent = message || '';
}

function releaseGroupAttachmentUrls() {
  groupVoicePlayers.forEach(({ audio }) => audio?.pause());
  groupVoicePlayers.clear();
  groupAttachmentObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  groupAttachmentObjectUrls.clear();
}

async function fetchPrivateGroupAttachment(url: string | undefined) {
  const response = await fetch(url as string, {
    headers: window.MyAgapayShell?.authHeaders() || {},
    cache: 'no-store',
  });
  if (window.MyAgapayShell?.handleUnauthorized(response)) return null;
  if (!response.ok) throw new Error('Unable to load this private attachment.');
  return response.blob();
}

async function hydrateGroupPhotos() {
  const photos = [...document.querySelectorAll<HTMLImageElement>('[data-group-photo]')];
  await Promise.all(
    photos.map(async (image) => {
      try {
        const blob = await fetchPrivateGroupAttachment(image.dataset.attachmentUrl);
        if (!blob || !image.isConnected) return;
        const objectUrl = URL.createObjectURL(blob);
        groupAttachmentObjectUrls.set(`image:${image.dataset.groupPhoto}`, objectUrl);
        image.src = objectUrl;
        image.nextElementSibling?.remove();
      } catch {
        if (image.nextElementSibling) image.nextElementSibling.textContent = 'Photo unavailable';
      }
    })
  );
}

async function hydrateMinistryGroupImages() {
  const images = [...document.querySelectorAll<HTMLImageElement>('[data-ministry-group-image]')];
  await Promise.all(
    images.map(async (image) => {
      try {
        const blob = await fetchPrivateGroupAttachment(image.dataset.imageUrl);
        if (!blob || !image.isConnected) return;
        const objectUrl = URL.createObjectURL(blob);
        const key = `ministry:${image.dataset.ministryGroupImage}:${Math.random()}`;
        groupAttachmentObjectUrls.set(key, objectUrl);
        image.src = objectUrl;
        image.closest('.ministry-group-avatar')?.classList.add('has-image');
      } catch {
        /* Keep the ministry initial fallback. */
      }
    })
  );
}

function ministryGroupAvatar(group: Partial<GroupUiGroup>, size: string = 'list') {
  const image =
    group.hasImage && group.imageUrl
      ? `<img data-ministry-group-image="${groupsEscape(group.id)}" data-image-url="${groupsEscape(group.imageUrl)}" alt="" />`
      : '';
  return `<span class="ministry-group-avatar is-${groupsEscape(size)}">${image}<b>${groupsEscape((group.name || 'M').slice(0, 1))}</b></span>`;
}

async function loadGroupVoicePlayer(message: GroupUiMessage) {
  if (groupVoicePlayers.has(message.id)) return groupVoicePlayers.get(message.id)!;
  const blob = await fetchPrivateGroupAttachment(message.attachmentUrl);
  if (!blob) return null;
  const objectUrl = URL.createObjectURL(blob);
  groupAttachmentObjectUrls.set(`voice:${message.id}`, objectUrl);
  const audio = new Audio(objectUrl);
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (AudioContextClass) {
    const audioContext = new AudioContextClass();
    try {
      const decoded = await audioContext.decodeAudioData((await blob.arrayBuffer()).slice(0));
      renderDecodedWaveform(message.id, decoded);
    } finally {
      await audioContext.close().catch(() => {});
    }
  }
  const player = { audio };
  groupVoicePlayers.set(message.id, player);
  audio.addEventListener('timeupdate', () => {
    const waveform = document.querySelector<HTMLElement>(
      `[data-voice-message="${CSS.escape(message.id)}"] .group-voice-waveform`
    );
    if (waveform && audio.duration)
      waveform.style.setProperty('--voice-progress', `${(audio.currentTime / audio.duration) * 100}%`);
  });
  audio.addEventListener('ended', () => {
    const button = document.querySelector<HTMLButtonElement>(
      `[data-voice-message="${CSS.escape(message.id)}"] .group-voice-toggle`
    );
    if (button) {
      button.innerHTML = groupComposerIcons.play;
      button.setAttribute('aria-label', 'Play voice message');
    }
  });
  return player;
}

async function toggleGroupVoiceMessage(messageId: string) {
  const message = ministryGroupsState.messages.find(({ id }) => id === messageId);
  const button = document.querySelector<HTMLButtonElement>(
    `[data-voice-message="${CSS.escape(messageId)}"] .group-voice-toggle`
  );
  if (!message || !button) return;
  button.disabled = true;
  try {
    const player = await loadGroupVoicePlayer(message);
    if (!player) return;
    groupVoicePlayers.forEach(({ audio }, id) => {
      if (id === messageId) return;
      audio.pause();
      const otherButton = document.querySelector<HTMLElement>(
        `[data-voice-message="${CSS.escape(id)}"] .group-voice-toggle`
      );
      if (otherButton) {
        otherButton.innerHTML = groupComposerIcons.play;
        otherButton.setAttribute('aria-label', 'Play voice message');
      }
    });
    if (player.audio.paused) {
      await player.audio.play();
      button.innerHTML = groupComposerIcons.pause;
      button.setAttribute('aria-label', 'Pause voice message');
    } else {
      player.audio.pause();
      button.innerHTML = groupComposerIcons.play;
      button.setAttribute('aria-label', 'Play voice message');
    }
  } catch (error) {
    groupStatus((error as Error).message || 'Unable to play this voice message.');
  } finally {
    button.disabled = false;
  }
}

function renderGroupsList() {
  const list = document.getElementById('groupsList');
  if (!list) return;
  if (!ministryGroupsState.groups.length) {
    list.innerHTML =
      '<div class="groups-empty"><strong>No active groups</strong><p>When you join a parish ministry, its private message board will appear here.</p></div>';
    return;
  }
  list.innerHTML = ministryGroupsState.groups
    .map(
      (group) => `
    <button type="button" class="group-list-item${group.id === ministryGroupsState.activeGroupId ? ' is-active' : ''}" data-group-id="${groupsEscape(group.id)}" onclick="openMinistryGroup('${groupsEscape(group.id)}')">
      ${ministryGroupAvatar(group)}<span class="group-list-copy"><strong>${groupsEscape(group.name)}</strong><small>${group.role === 'leader' ? 'Leader' : 'Member'}${group.messageCount ? ` · ${group.messageCount} messages` : ''}</small></span>
      ${group.unreadCount ? `<em>${Number(group.unreadCount)} new</em>` : ''}
    </button>
  `
    )
    .join('');
  void hydrateMinistryGroupImages();
}

function renderGroupThread(group: Partial<GroupUiGroup>, messages: GroupUiMessage[]) {
  const panel = document.getElementById('groupThreadPanel');
  if (!panel) return;
  const isLeader = group.role === 'leader';
  const activeTab = ministryGroupsState.activeTab;
  const messagesOpen = activeTab === 'messages';
  panel.innerHTML = `
    <div class="group-thread-head"><div class="ministry-home-back-row"><a class="koinonia-page-back" href="/myagapay/parish-life" data-parish-life-back>← Back to Koinonia</a><button type="button" class="group-thread-back" onclick="closeMinistryGroup()" aria-label="Back to ministry groups"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg><span>All ministries</span></button></div><div class="group-thread-identity">${ministryGroupAvatar(group, 'header')}<div><span class="eyebrow">Serving together</span><h2>${groupsEscape(group.name)}</h2><p>${groupsEscape(group.description || 'Messages and service coordination for this ministry.')}</p></div></div><div class="group-thread-actions">${group.role === 'leader' ? `<button type="button" class="groups-refresh" data-message-action onclick="toggleGroupCatchUp('${groupsEscape(group.id)}',this)" aria-expanded="false"${messagesOpen ? '' : ' hidden'}>Who’s caught up</button>` : ''}<button type="button" class="groups-refresh" data-message-action onclick="openMinistryGroup('${groupsEscape(group.id)}')"${messagesOpen ? '' : ' hidden'}>Refresh messages</button></div></div>
    <nav class="group-workspace-tabs" aria-label="${groupsEscape(group.name)} tools">${[
      ['overview', 'Home'],
      ['schedule', 'Schedule'],
      ['messages', 'Conversation'],
      ['signups', 'Signups'],
      ['commerce', 'Meals & Events'],
      ['members', 'Members'],
      ['resources', 'Resources'],
    ]
      .map(
        ([tab, label]) =>
          `<button type="button" data-group-tab="${tab}" class="${activeTab === tab ? 'is-active' : ''}" onclick="switchGroupWorkspace('${tab}')" aria-pressed="${activeTab === tab}">${label}</button>`
      )
      .join('')}</nav>
    <div class="group-message-list" id="groupMessageList" data-group-workspace="messages"${messagesOpen ? '' : ' hidden'}>${
      messages.length
        ? messages
            .map(
              (message) => `
      <article class="group-message ${message.mine ? 'is-outgoing' : 'is-incoming'} is-${groupsEscape(message.messageType || 'text')}${message.read ? '' : ' is-unread'}"><div><strong>${message.mine ? 'You' : groupsEscape(message.authorName)}</strong><time>${groupsEscape(groupMessageTime(message.createdAt))}</time></div>${renderGroupMessageContent(message)}</article>
    `
            )
            .join('')
        : '<div class="group-thread-empty"><strong>No messages yet</strong><p>Start the conversation for your ministry.</p></div>'
    }</div>
    ${isLeader ? `<section class="group-catch-up" id="groupCatchUp-${groupsEscape(group.id)}" data-group-workspace="messages" hidden></section>` : ''}
    <form class="group-compose" data-group-workspace="messages" onsubmit="postMinistryGroupMessage(event)"${messagesOpen ? '' : ' hidden'}>
      <label for="groupMessageBody">Post a message</label>
      <textarea id="groupMessageBody" maxlength="8000" rows="2" required placeholder="Write a message to your group..."></textarea>
      <div class="group-attachment-preview" id="groupAttachmentPreview" hidden></div>
      <div class="group-compose-actions">
        <div><button type="button" class="group-attach-button" onclick="toggleGroupVoiceRecording(this)" aria-label="Record a voice message">${groupComposerButton('voice', 'Voice')}</button><button type="button" class="group-attach-button" onclick="chooseGroupPhoto()" aria-label="Attach a photo">${groupComposerButton('photo', 'Photo')}</button><input id="groupPhotoInput" type="file" accept="image/jpeg,image/png,image/webp" onchange="selectGroupPhoto(event)" hidden /></div>
        <button type="submit" id="groupMessageSubmit">Post message</button>
      </div>
      <small class="group-thread-retention">Voice notes and photos are removed after 30 days. Conversation history remains available.</small>
    </form>
    ${['overview', 'signups', 'schedule', 'commerce', 'members', 'resources'].map((tab) => `<section class="group-signups-workspace group-${tab}-workspace" id="group${tab[0].toUpperCase() + tab.slice(1)}Workspace" data-group-workspace="${tab}"${activeTab === tab ? '' : ' hidden'}><div class="group-signups-loading">Loading ${groupsEscape(group.name)} ${tab}…</div></section>`).join('')}
  `;
  renderGroupAttachmentPreview();
  void hydrateGroupPhotos();
  void hydrateMinistryGroupImages();
  const messageList = document.getElementById('groupMessageList');
  if (messageList) messageList.scrollTop = messageList.scrollHeight;
  if (!messagesOpen) void loadActiveGroupWorkspace(activeTab);
}

function groupSignupCategoryLabel(value: unknown) {
  return (
    (
      {
        meal_train: 'Meal train',
        cleaning: 'Cleaning',
        event: 'Event',
        volunteer: 'Volunteer',
        general: 'General',
      } as Record<string, string>
    )[value as string] || 'General'
  );
}

function groupSignupCategoryOptions(selected: string = 'general') {
  return ['meal_train', 'cleaning', 'event', 'volunteer', 'general']
    .map(
      (value) =>
        `<option value="${value}"${value === selected ? ' selected' : ''}>${groupSignupCategoryLabel(value)}</option>`
    )
    .join('');
}

function groupSignupLocalDate(value: unknown) {
  if (value == null) return '';
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function groupSignupDisplayDate(value: unknown) {
  if (value == null) return 'Flexible date';
  const date = new Date(Number(value));
  return Number.isNaN(date.getTime())
    ? 'Date to be confirmed'
    : date.toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
}

async function switchGroupWorkspace(tab: string) {
  if (!['overview', 'messages', 'signups', 'schedule', 'commerce', 'members', 'resources'].includes(tab)) return;
  ministryGroupsState.activeTab = tab;
  setGroupThreadMode(Boolean(ministryGroupsState.activeGroupId));
  window.scrollTo(0, 0);
  document.querySelectorAll<HTMLElement>('[data-group-workspace]').forEach((element) => {
    element.hidden = element.classList.contains('group-catch-up') || element.dataset.groupWorkspace !== tab;
  });
  document.querySelectorAll<HTMLElement>('[data-group-tab]').forEach((button) => {
    const active = button.dataset.groupTab === tab;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  document.querySelectorAll<HTMLElement>('[data-message-action]').forEach((button) => {
    button.hidden = tab !== 'messages';
  });
  if (tab !== 'messages') await loadActiveGroupWorkspace(tab);
  else {
    const list = document.getElementById('groupMessageList');
    if (list) list.scrollTop = list.scrollHeight;
  }
}

async function loadActiveGroupWorkspace(tab: string) {
  if (tab === 'signups') return loadGroupSignupManager();
  const id = ministryGroupsState.activeGroupId;
  const target = document.querySelector<HTMLElement>(`[data-group-workspace="${tab}"]`);
  if (!id || !target) return;
  try {
    if (tab === 'overview') {
      const [data, people] = await Promise.all([
        groupsFetch(`/api/donor/groups/${encodeURIComponent(id)}/overview`),
        groupsFetch(`/api/donor/groups/${encodeURIComponent(id)}/members`).catch(() => null),
      ]);
      if (ministryGroupsState.activeGroupId !== id || !target.isConnected) return;
      window.MinistryHome.render(target, data!, {
        group: ministryGroupsState.groups.find((group) => group.id === id) || { name: 'Your ministry' },
        members: people?.members || null,
        messages: ministryGroupsState.messages,
        escape: groupsEscape,
        formatDate: groupSignupDisplayDate,
      });
    }
    if (tab === 'schedule') {
      const [d, m] = await Promise.all([
        groupsFetch(`/api/donor/groups/${encodeURIComponent(id)}/schedule`),
        groupsFetch(`/api/donor/groups/${encodeURIComponent(id)}/members`),
      ]);
      renderMinistrySchedule(
        target,
        d!.events || [],
        m!.members || [],
        ministryGroupsState.groups.find((group) => group.id === id)
      );
    }
    if (tab === 'commerce') {
      const d = await groupsFetch(`/api/donor/groups/${encodeURIComponent(id)}/commerce`);
      renderMinistryCommerce(target, d!.items || [], d!.parishId || '');
    }
    if (tab === 'members') {
      const d = await groupsFetch(`/api/donor/groups/${encodeURIComponent(id)}/members`);
      renderMinistryMembers(target, d!.members || []);
    }
    if (tab === 'resources') {
      const d = await groupsFetch(`/api/donor/groups/${encodeURIComponent(id)}/resources`);
      renderMinistryResources(target, d!.resources || []);
    }
  } catch (error) {
    renderGroupWorkspaceError(target, tab, (error as Error).message);
  }
}

async function acceptMinistryCoverage(requestId: string) {
  if (!confirm('Take this serving commitment?')) return;
  await groupsFetch(`/api/donor/koinonia/signups/coverage/${encodeURIComponent(requestId)}/accept`, {
    method: 'POST',
    body: '{}',
  });
  groupStatus('Thank you — this commitment is now yours.');
  await loadActiveGroupWorkspace('overview');
}

function ministryCurrentSunday() {
  const now = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date.toISOString().slice(0, 10);
}
function delegatedHeadcountPanel(group: GroupUiGroup | undefined) {
  if (!group?.headcountDelegated || group.role !== 'leader') return '';
  return `<section class="ministry-headcount-entry"><div><span class="eyebrow">Delegated by parish staff</span><h3>Weekly parish attendance</h3><p>Record the total Sunday headcount. This updates the parish-wide Stewardship Health trend.</p></div><form onsubmit="recordDelegatedHeadcount(event)"><label>Sunday<input type="date" name="weekOf" value="${ministryCurrentSunday()}" required /></label><label>Headcount<input type="number" name="headcount" min="0" step="1" placeholder="0" required /></label><button type="submit">Save attendance</button></form><p class="ministry-headcount-status" id="ministryHeadcountStatus" role="status"></p></section>`;
}
async function recordDelegatedHeadcount(event: SubmitEvent) {
  event.preventDefault();
  const form = event.currentTarget as HTMLFormElement;
  const button = form.querySelector<HTMLButtonElement>('button');
  const status = document.getElementById('ministryHeadcountStatus');
  const data = new FormData(form);
  button!.disabled = true;
  try {
    const saved = await groupsFetch(
      `/api/donor/groups/${encodeURIComponent(ministryGroupsState.activeGroupId)}/headcount`,
      {
        method: 'PATCH',
        body: JSON.stringify({ weekOf: data.get('weekOf'), headcount: Number(data.get('headcount')) }),
      }
    );
    status!.textContent = `Saved ${Number(saved!.headcount).toLocaleString()} for ${groupsEscape(saved!.weekOf)}.`;
    status!.className = 'ministry-headcount-status is-success';
    groupStatus('Parish attendance was updated.');
  } catch (error) {
    status!.textContent = (error as Error).message || 'Unable to save attendance.';
    status!.className = 'ministry-headcount-status is-error';
  } finally {
    button!.disabled = false;
  }
}
async function createMinistryEvent(event: SubmitEvent) {
  event.preventDefault();
  const d = new FormData(event.currentTarget as HTMLFormElement);
  await groupsFetch(`/api/donor/groups/${encodeURIComponent(ministryGroupsState.activeGroupId)}/schedule`, {
    method: 'POST',
    body: JSON.stringify({
      title: d.get('title'),
      startsAt: new Date(d.get('startsAt') as string).getTime(),
      location: d.get('location'),
      description: d.get('description'),
      repeatCount: Number(d.get('repeatCount')),
    }),
  });
  groupStatus('Event added to the ministry schedule.');
  await loadActiveGroupWorkspace('schedule');
}
async function deleteMinistryEvent(id: string) {
  if (!confirm('Delete this ministry event?')) return;
  await groupsFetch(
    `/api/donor/groups/${encodeURIComponent(ministryGroupsState.activeGroupId)}/schedule/${encodeURIComponent(id)}`,
    { method: 'DELETE' }
  );
  await loadActiveGroupWorkspace('schedule');
}
async function recordMinistryAttendance(eventId: string, personId: string, status: string) {
  await groupsFetch(
    `/api/donor/groups/${encodeURIComponent(ministryGroupsState.activeGroupId)}/schedule/${encodeURIComponent(eventId)}/attendance`,
    { method: 'PATCH', body: JSON.stringify({ personId, status }) }
  );
  groupStatus('Attendance recorded.');
  await loadActiveGroupWorkspace('schedule');
}
async function saveMinistryAvailability(event: SubmitEvent) {
  event.preventDefault();
  const d = new FormData(event.currentTarget as HTMLFormElement);
  await groupsFetch(`/api/donor/groups/${encodeURIComponent(ministryGroupsState.activeGroupId)}/members/availability`, {
    method: 'PATCH',
    body: JSON.stringify({ availabilityNote: d.get('availabilityNote') }),
  });
  groupStatus('Your availability was saved.');
  await loadActiveGroupWorkspace('members');
}
async function createMinistryResource(event: SubmitEvent) {
  event.preventDefault();
  const d = Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement));
  await groupsFetch(`/api/donor/groups/${encodeURIComponent(ministryGroupsState.activeGroupId)}/resources`, {
    method: 'POST',
    body: JSON.stringify(d),
  });
  groupStatus('Resource shared.');
  await loadActiveGroupWorkspace('resources');
}
async function deleteMinistryResource(id: string) {
  if (!confirm('Delete this shared resource?')) return;
  await groupsFetch(
    `/api/donor/groups/${encodeURIComponent(ministryGroupsState.activeGroupId)}/resources/${encodeURIComponent(id)}`,
    { method: 'DELETE' }
  );
  await loadActiveGroupWorkspace('resources');
}

// Meals & Events (ministry-delegated commerce)
// Lets an active ministry leader create priced festal-event listings (feast
// day dinners, festival plates) without parish-dashboard credentials, and
// generates a per-listing QR code -- reusing the exact qrcode-generator +
// brand-badge pattern the parish dashboard already uses for the Bookstore
// guest checkout QR (see public/parish/app.js renderBookstoreGuestCheckout).
// Duplicated here rather than shared, since groups.js and parish/app.js are
// separate non-module <script> includes with no import mechanism between them.
const ministryCommerceMoney = (cents: unknown) =>
  (Number(cents || 0) / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD' });
// eslint-disable-next-line prefer-const -- Preserve the original writable classic binding.
let ministryCommerceQrSvgByVariant: Record<string, string> = {};
let ministryCommerceMarkDataUriPromise: Promise<string> | null = null;

function ministryCommerceMarkDataUri() {
  if (ministryCommerceMarkDataUriPromise) return ministryCommerceMarkDataUriPromise;
  ministryCommerceMarkDataUriPromise = fetch('/mark.png')
    .then((res) => res.blob())
    .then(
      (blob) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        })
    )
    .catch(() => {
      ministryCommerceMarkDataUriPromise = null;
      return '';
    });
  return ministryCommerceMarkDataUriPromise;
}

function ministryCommerceQrUrl(parishId: string, variantId: string) {
  if (!parishId || !variantId) return '';
  return `${window.location.origin}/events/${encodeURIComponent(parishId)}?item=${encodeURIComponent(variantId)}`;
}

async function loadGroupSignupManager() {
  const target = document.getElementById('groupSignupsWorkspace');
  if (!target) return;
  try {
    const [data, templateData] = await Promise.all([
      groupsFetch('/api/donor/koinonia/signups'),
      groupsFetch(`/api/donor/koinonia/signups/templates/${encodeURIComponent(ministryGroupsState.activeGroupId)}`),
    ]);
    if (!data) return;
    ministryGroupsState.signupSheets = (data.sheets || []).filter(
      ({ ministryId }) => ministryId === ministryGroupsState.activeGroupId
    );
    ministryGroupsState.signupTemplates = templateData?.templates || [];
    renderGroupSignupManager();
  } catch (error) {
    target.innerHTML = `<div class="group-signups-empty"><strong>Unable to load signups</strong><p>${groupsEscape((error as Error).message)}</p></div>`;
  }
}

async function openGroupSignup(sheetId: string) {
  try {
    const data = await groupsFetch(`/api/donor/koinonia/signups/${encodeURIComponent(sheetId)}`);
    if (!data) return;
    ministryGroupsState.activeSignup = data as GroupUiSignup;
    renderGroupSignupManager();
  } catch (error) {
    groupStatus((error as Error).message || 'Unable to open this signup form.');
  }
}

function closeGroupSignup() {
  ministryGroupsState.activeSignup = null;
  renderGroupSignupManager();
}

function groupSignupPayload(form: HTMLFormElement) {
  const data = new FormData(form);
  const rawDate = String(data.get('slotDate') || '');
  return {
    title: data.get('title'),
    category: data.get('category'),
    description: data.get('description'),
    label: data.get('label'),
    neededCount: Number(data.get('neededCount')),
    slotDate: rawDate ? new Date(rawDate).getTime() : null,
    notes: data.get('notes'),
  };
}

async function createGroupSignup(event: SubmitEvent) {
  event.preventDefault();
  const button = (event.currentTarget as HTMLFormElement).querySelector<HTMLButtonElement>('[type="submit"]');
  button!.disabled = true;
  try {
    const payload = groupSignupPayload(event.currentTarget as HTMLFormElement);
    const created = await groupsFetch('/api/donor/koinonia/signups', {
      method: 'POST',
      body: JSON.stringify({
        ministryId: ministryGroupsState.activeGroupId,
        title: payload.title,
        category: payload.category,
        description: payload.description,
      }),
    });
    await loadGroupSignupManager();
    await openGroupSignup(created!.sheetId!);
    groupStatus('Draft created. Add the signup slots, then open it to the parish.');
  } catch (error) {
    groupStatus((error as Error).message || 'Unable to create this signup form.');
  } finally {
    button!.disabled = false;
  }
}

async function updateGroupSignup(event: SubmitEvent, sheetId: string) {
  event.preventDefault();
  const button = (event.currentTarget as HTMLFormElement).querySelector<HTMLButtonElement>('[type="submit"]');
  button!.disabled = true;
  try {
    const payload = groupSignupPayload(event.currentTarget as HTMLFormElement);
    await groupsFetch(`/api/donor/koinonia/signups/${encodeURIComponent(sheetId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    await openGroupSignup(sheetId);
    await loadGroups();
    groupStatus('Signup form saved.');
  } catch (error) {
    groupStatus((error as Error).message || 'Unable to save this signup form.');
  } finally {
    button!.disabled = false;
  }
}

async function setGroupSignupStatus(sheetId: string, status: string) {
  try {
    await groupsFetch(`/api/donor/koinonia/signups/${encodeURIComponent(sheetId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    if (status === 'archived') {
      ministryGroupsState.activeSignup = null;
      await loadGroupSignupManager();
    } else await openGroupSignup(sheetId);
    groupStatus(status === 'open' ? 'Signup is now open to the parish.' : `Signup ${status}.`);
  } catch (error) {
    groupStatus((error as Error).message || 'Unable to update signup status.');
  }
}

async function deleteGroupSignup(sheetId: string) {
  if (!window.confirm('Delete this signup form? This cannot be undone.')) return;
  try {
    await groupsFetch(`/api/donor/koinonia/signups/${encodeURIComponent(sheetId)}`, { method: 'DELETE' });
    ministryGroupsState.activeSignup = null;
    await loadGroupSignupManager();
    groupStatus('Signup form deleted.');
  } catch (error) {
    groupStatus((error as Error).message || 'Unable to delete this signup form.');
  }
}

async function addGroupSignupSlot(event: SubmitEvent, sheetId: string) {
  event.preventDefault();
  const button = (event.currentTarget as HTMLFormElement).querySelector<HTMLButtonElement>('[type="submit"]');
  button!.disabled = true;
  try {
    await groupsFetch(`/api/donor/koinonia/signups/${encodeURIComponent(sheetId)}/slots`, {
      method: 'POST',
      body: JSON.stringify(groupSignupPayload(event.currentTarget as HTMLFormElement)),
    });
    await openGroupSignup(sheetId);
    groupStatus('Signup slot added.');
  } catch (error) {
    groupStatus((error as Error).message || 'Unable to add this signup slot.');
  } finally {
    button!.disabled = false;
  }
}

async function updateGroupSignupSlot(event: SubmitEvent, slotId: string) {
  event.preventDefault();
  const button = (event.currentTarget as HTMLFormElement).querySelector<HTMLButtonElement>('[type="submit"]');
  button!.disabled = true;
  try {
    await groupsFetch(`/api/donor/koinonia/signups/slots/${encodeURIComponent(slotId)}`, {
      method: 'PATCH',
      body: JSON.stringify(groupSignupPayload(event.currentTarget as HTMLFormElement)),
    });
    await openGroupSignup(ministryGroupsState.activeSignup!.sheet.id);
    groupStatus('Signup slot saved.');
  } catch (error) {
    groupStatus((error as Error).message || 'Unable to save this signup slot.');
  } finally {
    button!.disabled = false;
  }
}

async function deleteGroupSignupSlot(slotId: string) {
  if (!window.confirm('Delete this empty signup slot?')) return;
  try {
    const sheetId = ministryGroupsState.activeSignup!.sheet.id;
    await groupsFetch(`/api/donor/koinonia/signups/slots/${encodeURIComponent(slotId)}`, { method: 'DELETE' });
    await openGroupSignup(sheetId);
    groupStatus('Signup slot deleted.');
  } catch (error) {
    groupStatus((error as Error).message || 'Unable to delete this signup slot.');
  }
}
async function saveGroupSignupTemplate(sheetId: string) {
  const name = prompt('Template name:', ministryGroupsState.activeSignup?.sheet?.title || '');
  if (!name) return;
  await groupsFetch(`/api/donor/koinonia/signups/${encodeURIComponent(sheetId)}/template`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  groupStatus('Reusable template saved.');
  await loadGroupSignupManager();
}
async function createGroupSignupFromTemplate(templateId: string, defaultTitle: string) {
  const title = prompt('Title for the new signup:', defaultTitle);
  if (!title) return;
  const date = prompt('Optional first date and time (YYYY-MM-DD HH:MM):', '');
  const startsAt = date ? new Date(date).getTime() : null;
  const result = await groupsFetch(`/api/donor/koinonia/signups/templates/${encodeURIComponent(templateId)}/create`, {
    method: 'POST',
    body: JSON.stringify({ title, startsAt }),
  });
  await loadGroupSignupManager();
  await openGroupSignup(result!.sheetId!);
  groupStatus('Draft created from template.');
}
async function showGroupSignupHistory(sheetId: string) {
  const d = await groupsFetch(`/api/donor/koinonia/signups/${encodeURIComponent(sheetId)}/history`);
  alert(
    (d!.activity || [])
      .map(
        (a) =>
          `${new Date(a.created_at).toLocaleString()} — ${a.actor_name || 'Ministry member'}: ${String(a.action).replaceAll('_', ' ')}${a.summary ? ` (${a.summary})` : ''}`
      )
      .join('\n') || 'No activity yet.'
  );
}
async function completeGroupSignupEntry(entryId: string) {
  await groupsFetch(`/api/donor/koinonia/signups/entries/${encodeURIComponent(entryId)}/complete`, {
    method: 'PATCH',
    body: JSON.stringify({ attended: true, sendThanks: true }),
  });
  await openGroupSignup(ministryGroupsState.activeSignup!.sheet.id);
  groupStatus('Service marked complete and a thank-you was sent.');
}

function setGroupThreadMode(open: boolean) {
  document.body.classList.toggle('is-ministry-open', Boolean(open));
  document.body.classList.toggle('is-group-thread-open', Boolean(open) && ministryGroupsState.activeTab === 'messages');
}

function syncGroupThreadUrl(groupId: string = '') {
  const url = new URL(window.location.href);
  if (groupId) url.searchParams.set('group', groupId);
  else url.searchParams.delete('group');
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

function closeMinistryGroup() {
  clearGroupAttachment();
  releaseGroupAttachmentUrls();
  ministryGroupsState.activeGroupId = '';
  ministryGroupsState.messages = [];
  ministryGroupsState.activeTab = 'overview';
  ministryGroupsState.signupSheets = [];
  ministryGroupsState.activeSignup = null;
  setGroupThreadMode(false);
  syncGroupThreadUrl();
  renderGroupsList();
  const panel = document.getElementById('groupThreadPanel');
  if (panel)
    panel.innerHTML =
      '<div class="group-thread-empty"><strong>Select a group</strong><p>Choose one of your ministries to read and post messages.</p></div>';
}

async function toggleGroupCatchUp(groupId: string, button: HTMLButtonElement) {
  const panel = document.getElementById(`groupCatchUp-${groupId}`);
  if (!panel) return;
  if (!panel.hidden) {
    panel.hidden = true;
    button?.setAttribute('aria-expanded', 'false');
    return;
  }
  panel.hidden = false;
  button?.setAttribute('aria-expanded', 'true');
  if (ministryGroupsState.catchUp[groupId]) {
    renderGroupCatchUp(panel, ministryGroupsState.catchUp[groupId]);
    return;
  }
  panel.innerHTML = '<p>Checking the latest message...</p>';
  try {
    const data = await groupsFetch(`/api/donor/groups/${encodeURIComponent(groupId)}/caught-up`);
    if (!data) return;
    ministryGroupsState.catchUp[groupId] = data;
    renderGroupCatchUp(panel, data);
  } catch (error) {
    panel.replaceChildren();
    const message = document.createElement('p');
    message.textContent = (error as Error).message || 'Unable to load member read status.';
    panel.append(message);
  }
}

function attachmentBodyHeader(value: unknown) {
  const bytes = new TextEncoder().encode(String(value || ''));
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function releasePendingAttachment() {
  const pending = ministryGroupsState.pendingAttachment;
  if (pending?.previewUrl) URL.revokeObjectURL(pending.previewUrl);
  ministryGroupsState.pendingAttachment = null;
}

function stopGroupRecordingStream() {
  groupRecordingStream?.getTracks().forEach((track) => track.stop());
  groupRecordingStream = null;
  groupMediaRecorder = null;
  groupRecordingStartedAt = 0;
}

function clearGroupAttachment() {
  if (groupMediaRecorder?.state === 'recording') {
    groupRecordingCancelled = true;
    groupMediaRecorder.stop();
  }
  stopGroupRecordingStream();
  releasePendingAttachment();
  renderGroupAttachmentPreview();
}

function renderGroupAttachmentPreview() {
  const preview = document.getElementById('groupAttachmentPreview');
  const textarea = document.getElementById('groupMessageBody') as HTMLTextAreaElement | null;
  const submit = document.getElementById('groupMessageSubmit');
  if (!preview || !textarea || !submit) return;
  const pending = ministryGroupsState.pendingAttachment;
  if (!pending) {
    preview.hidden = true;
    preview.innerHTML = '';
    textarea.required = true;
    textarea.placeholder = 'Write a message to your group...';
    submit.textContent = 'Post message';
    return;
  }
  preview.hidden = false;
  textarea.required = false;
  if (pending.type === 'image') {
    textarea.placeholder = 'Add an optional caption...';
    submit.textContent = 'Send photo';
    preview.innerHTML = `<img src="${groupsEscape(pending.previewUrl)}" alt="Selected group photo" /><span><strong>${groupsEscape(pending.fileName || 'Selected photo')}</strong><small>${Math.ceil(pending.blob.size / 1024)} KB</small></span><button type="button" onclick="clearGroupAttachment()" aria-label="Remove selected photo">×</button>`;
  } else {
    textarea.placeholder = 'Add optional text to this voice message...';
    submit.textContent = 'Send voice note';
    preview.innerHTML = `<span class="group-recording-ready">${groupComposerIcons.voice}</span><span><strong>Voice note ready</strong><small>${groupsEscape(groupDuration(pending.durationSeconds))}</small></span><button type="button" onclick="clearGroupAttachment()" aria-label="Remove voice note">×</button>`;
  }
}

function chooseGroupPhoto() {
  document.getElementById('groupPhotoInput')?.click();
}

function selectGroupPhoto(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  (event.target as HTMLInputElement).value = '';
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    groupStatus('Group photos must be JPG, PNG, or WebP images.');
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    groupStatus('Group photos must be 10MB or smaller.');
    return;
  }
  clearGroupAttachment();
  ministryGroupsState.pendingAttachment = {
    type: 'image',
    blob: file,
    fileName: file.name,
    previewUrl: URL.createObjectURL(file),
    durationSeconds: null,
  };
  renderGroupAttachmentPreview();
  groupStatus('');
}

function recordedBlobDuration(blob: Blob, fallbackSeconds: number) {
  return new Promise<number>((resolve) => {
    const audio = document.createElement('audio');
    const url = URL.createObjectURL(blob);
    let settled = false;
    const finish = (value: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      URL.revokeObjectURL(url);
      resolve(Math.max(1, Math.round(value || fallbackSeconds || 1)));
    };
    const timeout = setTimeout(() => finish(fallbackSeconds), 2000);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => finish(Number.isFinite(audio.duration) ? audio.duration : fallbackSeconds);
    audio.onerror = () => finish(fallbackSeconds);
    audio.src = url;
  });
}

async function toggleGroupVoiceRecording(button: HTMLButtonElement) {
  if (groupMediaRecorder?.state === 'recording') {
    groupRecordingCancelled = false;
    button.disabled = true;
    groupMediaRecorder.stop();
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    groupStatus('Voice recording is not supported in this browser.');
    return;
  }
  clearGroupAttachment();
  try {
    groupRecordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    groupRecordingCancelled = false;
    const preferredType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((type) =>
      MediaRecorder.isTypeSupported(type)
    );
    const chunks: Blob[] = [];
    groupMediaRecorder = preferredType
      ? new MediaRecorder(groupRecordingStream, { mimeType: preferredType })
      : new MediaRecorder(groupRecordingStream);
    const recorder = groupMediaRecorder;
    groupRecordingStartedAt = performance.now();
    const startedAt = groupRecordingStartedAt;
    groupMediaRecorder.addEventListener('dataavailable', (event) => {
      if (event.data.size) chunks.push(event.data);
    });
    groupMediaRecorder.addEventListener(
      'stop',
      async () => {
        const elapsed = (performance.now() - startedAt) / 1000;
        const contentType = recorder.mimeType || chunks[0]?.type || 'audio/webm';
        const blob = new Blob(chunks, { type: contentType });
        stopGroupRecordingStream();
        button.disabled = false;
        button.innerHTML = groupComposerButton('voice', 'Voice');
        button.classList.remove('is-recording');
        if (groupRecordingCancelled) {
          groupRecordingCancelled = false;
          return;
        }
        if (!blob.size) {
          groupStatus('The voice recording was empty. Please try again.');
          renderGroupAttachmentPreview();
          return;
        }
        const durationSeconds = await recordedBlobDuration(blob, elapsed);
        ministryGroupsState.pendingAttachment = { type: 'voice', blob, durationSeconds, previewUrl: '' };
        renderGroupAttachmentPreview();
        groupStatus('');
      },
      { once: true }
    );
    groupMediaRecorder.start(250);
    button.innerHTML = groupComposerButton('stop', 'Stop');
    button.classList.add('is-recording');
    groupStatus('Recording voice note… tap Stop when finished.');
  } catch (error) {
    stopGroupRecordingStream();
    groupStatus(
      (error as Error)?.name === 'NotAllowedError'
        ? 'Microphone access is needed to record a voice note.'
        : 'Unable to start voice recording.'
    );
  }
}

async function groupsFetch(path: string, options: RequestInit = {}) {
  const response = await fetch(path, { ...options, headers: groupsHeaders(), cache: 'no-store' });
  if (window.MyAgapayShell?.handleUnauthorized(response)) return null;
  const data = (await response.json().catch(() => ({}))) as GroupUiPayload;
  if (!response.ok) throw new Error(data.error || 'Unable to load your groups.');
  return data;
}

async function loadGroups() {
  const status = document.getElementById('groupsStatus');
  try {
    const data = await groupsFetch('/api/donor/groups');
    if (!data) return;
    ministryGroupsState.groups = data.groups || [];
    status!.hidden = true;
    renderGroupsList();
    if (initialGroupId && ministryGroupsState.groups.some(({ id }) => id === initialGroupId)) {
      const requestedGroupId = initialGroupId;
      initialGroupId = '';
      await openMinistryGroup(requestedGroupId);
    }
    if (
      ministryGroupsState.activeGroupId &&
      !ministryGroupsState.groups.some(({ id }) => id === ministryGroupsState.activeGroupId)
    ) {
      ministryGroupsState.activeGroupId = '';
      setGroupThreadMode(false);
      syncGroupThreadUrl();
      document.getElementById('groupThreadPanel')!.innerHTML =
        '<div class="group-thread-empty"><strong>Group unavailable</strong><p>Your active ministry memberships changed.</p></div>';
    }
  } catch (error) {
    status!.hidden = false;
    status!.textContent = (error as Error).message || 'Unable to load your groups.';
  }
}

async function openMinistryGroup(groupId: string) {
  const status = document.getElementById('groupsStatus');
  try {
    const data = await groupsFetch(`/api/donor/groups/${encodeURIComponent(groupId)}/messages`);
    if (!data) return;
    if (ministryGroupsState.activeGroupId && ministryGroupsState.activeGroupId !== groupId) {
      clearGroupAttachment();
      ministryGroupsState.activeTab = 'overview';
      ministryGroupsState.signupSheets = [];
      ministryGroupsState.activeSignup = null;
    }
    releaseGroupAttachmentUrls();
    ministryGroupsState.activeGroupId = groupId;
    ministryGroupsState.messages = data.messages || [];
    setGroupThreadMode(true);
    syncGroupThreadUrl(groupId);
    renderGroupsList();
    const membership = ministryGroupsState.groups.find(({ id }) => id === groupId);
    renderGroupThread({ ...data.group, role: membership?.role || 'participant' }, ministryGroupsState.messages);
    const unread = ministryGroupsState.messages.filter((message) => !message.read);
    if (unread.length) {
      await Promise.all(
        unread.map((message) =>
          groupsFetch(
            `/api/donor/groups/${encodeURIComponent(groupId)}/messages/${encodeURIComponent(message.id)}/read`,
            { method: 'POST' }
          ).catch(() => null)
        )
      );
      const group = ministryGroupsState.groups.find(({ id }) => id === groupId);
      if (group) group.unreadCount = 0;
      ministryGroupsState.messages.forEach((message) => {
        message.read = true;
      });
      renderGroupsList();
    }
    status!.hidden = true;
  } catch (error) {
    status!.hidden = false;
    status!.textContent = (error as Error).message || 'Unable to open this group.';
  }
}

async function uploadGroupMessageAttachment(attachment: GroupUiAttachment, body: string) {
  if (attachment.blob.size > 10 * 1024 * 1024)
    throw new Error(`${attachment.type === 'voice' ? 'Voice messages' : 'Group photos'} must be 10MB or smaller.`);
  const headers = window.MyAgapayShell?.authHeaders({
    'Content-Type': attachment.blob.type,
    'X-AGAPAY-Attachment-Bytes': String(attachment.blob.size),
    'X-AGAPAY-Message-Body-B64': attachmentBodyHeader(body),
  }) || {
    'Content-Type': attachment.blob.type,
    'X-AGAPAY-Attachment-Bytes': String(attachment.blob.size),
    'X-AGAPAY-Message-Body-B64': attachmentBodyHeader(body),
  };
  if (attachment.type === 'voice')
    headers['X-AGAPAY-Attachment-Duration-Seconds'] = String(Math.max(1, Math.round(attachment.durationSeconds || 0)));
  const response = await fetch(
    `/api/donor/groups/${encodeURIComponent(ministryGroupsState.activeGroupId)}/messages/attachment?type=${encodeURIComponent(attachment.type)}`,
    {
      method: 'POST',
      headers,
      body: attachment.blob,
    }
  );
  if (window.MyAgapayShell?.handleUnauthorized(response)) return null;
  const data = (await response.json().catch(() => ({}))) as GroupUiPayload;
  if (!response.ok) throw new Error(data.error || 'Unable to send this attachment.');
  return data;
}

async function postMinistryGroupMessage(event: SubmitEvent) {
  event.preventDefault();
  const body = (document.getElementById('groupMessageBody') as HTMLTextAreaElement | null)?.value || '';
  const attachment = ministryGroupsState.pendingAttachment;
  const button = (event.currentTarget as HTMLFormElement).querySelector<HTMLButtonElement>('button[type="submit"]');
  if (button) button.disabled = true;
  try {
    if (attachment) {
      const uploaded = await uploadGroupMessageAttachment(attachment, body);
      if (!uploaded) return;
    } else
      await groupsFetch(`/api/donor/groups/${encodeURIComponent(ministryGroupsState.activeGroupId)}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      });
    releasePendingAttachment();
    delete ministryGroupsState.catchUp[ministryGroupsState.activeGroupId];
    await openMinistryGroup(ministryGroupsState.activeGroupId);
    await loadGroups();
  } catch (error) {
    const status = document.getElementById('groupsStatus');
    status!.hidden = false;
    status!.textContent = (error as Error).message || 'Unable to post your message.';
  } finally {
    if (button) button.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', loadGroups);

export type GroupUiBindings = {
  loadActiveGroupWorkspace: typeof loadActiveGroupWorkspace;
  groupStatus: typeof groupStatus;
  groupsFetch: typeof groupsFetch;
  groupsEscape: typeof groupsEscape;
  groupComposerIcons: typeof groupComposerIcons;
  groupDuration: typeof groupDuration;
  delegatedHeadcountPanel: typeof delegatedHeadcountPanel;
  groupSignupDisplayDate: typeof groupSignupDisplayDate;
  ministryCommerceQrUrl: typeof ministryCommerceQrUrl;
  ministryCommerceQrSvgByVariant: typeof ministryCommerceQrSvgByVariant;
  ministryCommerceMarkDataUri: typeof ministryCommerceMarkDataUri;
  ministryGroupsState: typeof ministryGroupsState;
  ministryCommerceMoney: typeof ministryCommerceMoney;
  groupSignupCategoryOptions: typeof groupSignupCategoryOptions;
  groupSignupCategoryLabel: typeof groupSignupCategoryLabel;
  groupSignupLocalDate: typeof groupSignupLocalDate;
  groupMessageTime: typeof groupMessageTime;
};
