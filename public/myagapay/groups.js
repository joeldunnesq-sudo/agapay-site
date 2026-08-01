let ministryGroupsState = { groups: [], activeGroupId: "", messages: [], catchUp: {}, pendingAttachment: null };
let initialGroupId = new URLSearchParams(window.location.search).get("group") || "";
let groupMediaRecorder = null;
let groupRecordingStream = null;
let groupRecordingStartedAt = 0;
let groupRecordingCancelled = false;
const groupAttachmentObjectUrls = new Map();
const groupVoicePlayers = new Map();

function groupsEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function groupsHeaders() {
  return window.MyAgapayShell?.authHeaders({ "Content-Type": "application/json" }) || {};
}

function groupMessageTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function groupDuration(value) {
  const total = Math.max(0, Math.round(Number(value) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function groupStatus(message) {
  const status = document.getElementById("groupsStatus");
  if (!status) return;
  status.hidden = !message;
  status.textContent = message || "";
}

function renderGroupMessageContent(message) {
  const caption = message.body ? `<p>${groupsEscape(message.body)}</p>` : "";
  if (message.messageType === "voice") {
    const bars = Array.from({ length: 36 }, () => "<span></span>").join("");
    return `<div class="group-voice-note" data-voice-message="${groupsEscape(message.id)}">
      <button type="button" class="group-voice-toggle" onclick="toggleGroupVoiceMessage('${groupsEscape(message.id)}')" aria-label="Play voice message">▶</button>
      <div class="group-voice-waveform" role="img" aria-label="Voice message waveform">${bars}</div>
      <time class="group-voice-duration">${groupsEscape(groupDuration(message.attachmentDurationSeconds))}</time>
    </div>${caption}`;
  }
  if (message.messageType === "image") {
    return `<div class="group-photo-message"><img data-group-photo="${groupsEscape(message.id)}" data-attachment-url="${groupsEscape(message.attachmentUrl)}" alt="Photo shared by ${groupsEscape(message.authorName)}" /><span>Loading photo…</span></div>${caption}`;
  }
  return caption;
}

function releaseGroupAttachmentUrls() {
  groupVoicePlayers.forEach(({ audio }) => audio?.pause());
  groupVoicePlayers.clear();
  groupAttachmentObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  groupAttachmentObjectUrls.clear();
}

async function fetchPrivateGroupAttachment(url) {
  const response = await fetch(url, { headers: window.MyAgapayShell?.authHeaders() || {}, cache: "no-store" });
  if (window.MyAgapayShell?.handleUnauthorized(response)) return null;
  if (!response.ok) throw new Error("Unable to load this private attachment.");
  return response.blob();
}

async function hydrateGroupPhotos() {
  const photos = [...document.querySelectorAll("[data-group-photo]")];
  await Promise.all(photos.map(async (image) => {
    try {
      const blob = await fetchPrivateGroupAttachment(image.dataset.attachmentUrl);
      if (!blob || !image.isConnected) return;
      const objectUrl = URL.createObjectURL(blob);
      groupAttachmentObjectUrls.set(`image:${image.dataset.groupPhoto}`, objectUrl);
      image.src = objectUrl;
      image.nextElementSibling?.remove();
    } catch {
      if (image.nextElementSibling) image.nextElementSibling.textContent = "Photo unavailable";
    }
  }));
}

function renderDecodedWaveform(messageId, audioBuffer) {
  const container = document.querySelector(`[data-voice-message="${CSS.escape(messageId)}"] .group-voice-waveform`);
  if (!container) return;
  const bars = [...container.querySelectorAll("span")];
  const samples = audioBuffer.getChannelData(0);
  const bucketSize = Math.max(1, Math.floor(samples.length / bars.length));
  bars.forEach((bar, index) => {
    let peak = 0;
    const start = index * bucketSize;
    const end = Math.min(samples.length, start + bucketSize);
    for (let cursor = start; cursor < end; cursor += 1) peak = Math.max(peak, Math.abs(samples[cursor]));
    bar.style.setProperty("--wave-peak", String(Math.max(0.16, Math.min(1, peak * 2.4))));
  });
}

async function loadGroupVoicePlayer(message) {
  if (groupVoicePlayers.has(message.id)) return groupVoicePlayers.get(message.id);
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
  audio.addEventListener("timeupdate", () => {
    const waveform = document.querySelector(`[data-voice-message="${CSS.escape(message.id)}"] .group-voice-waveform`);
    if (waveform && audio.duration) waveform.style.setProperty("--voice-progress", `${(audio.currentTime / audio.duration) * 100}%`);
  });
  audio.addEventListener("ended", () => {
    const button = document.querySelector(`[data-voice-message="${CSS.escape(message.id)}"] .group-voice-toggle`);
    if (button) { button.textContent = "▶"; button.setAttribute("aria-label", "Play voice message"); }
  });
  return player;
}

async function toggleGroupVoiceMessage(messageId) {
  const message = ministryGroupsState.messages.find(({ id }) => id === messageId);
  const button = document.querySelector(`[data-voice-message="${CSS.escape(messageId)}"] .group-voice-toggle`);
  if (!message || !button) return;
  button.disabled = true;
  try {
    const player = await loadGroupVoicePlayer(message);
    if (!player) return;
    groupVoicePlayers.forEach(({ audio }, id) => {
      if (id === messageId) return;
      audio.pause();
      const otherButton = document.querySelector(`[data-voice-message="${CSS.escape(id)}"] .group-voice-toggle`);
      if (otherButton) { otherButton.textContent = "▶"; otherButton.setAttribute("aria-label", "Play voice message"); }
    });
    if (player.audio.paused) {
      await player.audio.play();
      button.textContent = "❚❚";
      button.setAttribute("aria-label", "Pause voice message");
    } else {
      player.audio.pause();
      button.textContent = "▶";
      button.setAttribute("aria-label", "Play voice message");
    }
  } catch (error) {
    groupStatus(error.message || "Unable to play this voice message.");
  } finally {
    button.disabled = false;
  }
}

function renderGroupsList() {
  const list = document.getElementById("groupsList");
  if (!list) return;
  if (!ministryGroupsState.groups.length) {
    list.innerHTML = '<div class="groups-empty"><strong>No active groups</strong><p>When you join a parish ministry, its private message board will appear here.</p></div>';
    return;
  }
  list.innerHTML = ministryGroupsState.groups.map((group) => `
    <button type="button" class="group-list-item${group.id === ministryGroupsState.activeGroupId ? " is-active" : ""}" data-group-id="${groupsEscape(group.id)}" onclick="openMinistryGroup('${groupsEscape(group.id)}')">
      <span><strong>${groupsEscape(group.name)}</strong><small>${group.role === "leader" ? "Leader" : "Member"}${group.messageCount ? ` · ${group.messageCount} messages` : ""}</small></span>
      ${group.unreadCount ? `<em>${Number(group.unreadCount)} new</em>` : ""}
    </button>
  `).join("");
}

function renderGroupThread(group, messages) {
  const panel = document.getElementById("groupThreadPanel");
  if (!panel) return;
  panel.innerHTML = `
    <div class="group-thread-head"><div><span class="eyebrow">Private group</span><h2>${groupsEscape(group.name)}</h2><p>${groupsEscape(group.description || "Messages for current ministry members and leaders.")}</p></div><div class="group-thread-actions">${group.role === "leader" ? `<button type="button" class="groups-refresh" onclick="toggleGroupCatchUp('${groupsEscape(group.id)}',this)" aria-expanded="false">Who’s caught up</button>` : ""}<button type="button" class="groups-refresh" onclick="openMinistryGroup('${groupsEscape(group.id)}')">Refresh messages</button></div></div>
    <div class="group-message-list" id="groupMessageList">${messages.length ? messages.map(message => `
      <article class="group-message ${message.mine ? "is-outgoing" : "is-incoming"} is-${groupsEscape(message.messageType || "text")}${message.read ? "" : " is-unread"}"><div><strong>${message.mine ? "You" : groupsEscape(message.authorName)}</strong><time>${groupsEscape(groupMessageTime(message.createdAt))}</time></div>${renderGroupMessageContent(message)}</article>
    `).join("") : '<div class="group-thread-empty"><strong>No messages yet</strong><p>Start the conversation for your ministry.</p></div>'}</div>
    ${group.role === "leader" ? `<section class="group-catch-up" id="groupCatchUp-${groupsEscape(group.id)}" hidden></section>` : ""}
    <form class="group-compose" onsubmit="postMinistryGroupMessage(event)">
      <label for="groupMessageBody">Post a message</label>
      <textarea id="groupMessageBody" maxlength="8000" rows="4" required placeholder="Write a message to your group..."></textarea>
      <div class="group-attachment-preview" id="groupAttachmentPreview" hidden></div>
      <div class="group-compose-actions">
        <div><button type="button" class="group-attach-button" onclick="toggleGroupVoiceRecording(this)" aria-label="Record a voice message">🎤 <span>Voice</span></button><button type="button" class="group-attach-button" onclick="chooseGroupPhoto()" aria-label="Attach a photo">📷 <span>Photo</span></button><input id="groupPhotoInput" type="file" accept="image/jpeg,image/png,image/webp" onchange="selectGroupPhoto(event)" hidden /></div>
        <button type="submit" id="groupMessageSubmit">Post message</button>
      </div>
    </form>
  `;
  renderGroupAttachmentPreview();
  void hydrateGroupPhotos();
  const messageList = document.getElementById("groupMessageList");
  if (messageList) messageList.scrollTop = messageList.scrollHeight;
}

function renderGroupCatchUp(panel, data) {
  const members = data.members || [];
  if (!data.latestMessage) {
    panel.innerHTML = '<strong>Who’s caught up</strong><p>Post the first message to begin tracking the latest-message read status.</p>';
    return;
  }
  panel.innerHTML = `<div class="group-catch-up-head"><div><strong>Who’s caught up</strong><small>${Number(data.caughtUpCount || 0)} of ${Number(data.memberCount || 0)} read the latest message</small></div><time>${groupsEscape(groupMessageTime(data.latestMessage.createdAt))}</time></div><ul>${members.map(member => {
    const label = !member.accountLinked ? 'No linked account' : member.caughtUp ? 'Caught up' : 'Not yet';
    return `<li><span><strong>${groupsEscape(member.displayName)}</strong><small>${member.role === 'leader' ? 'Leader' : 'Member'}</small></span><em class="${member.caughtUp ? 'is-caught-up' : ''}">${label}</em></li>`;
  }).join('')}</ul>`;
}

async function toggleGroupCatchUp(groupId, button) {
  const panel = document.getElementById(`groupCatchUp-${groupId}`);
  if (!panel) return;
  if (!panel.hidden) { panel.hidden = true; button?.setAttribute('aria-expanded','false'); return; }
  panel.hidden = false;
  button?.setAttribute('aria-expanded','true');
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
    panel.innerHTML = `<p>${groupsEscape(error.message || 'Unable to load member read status.')}</p>`;
  }
}

function attachmentBodyHeader(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
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
  if (groupMediaRecorder?.state === "recording") {
    groupRecordingCancelled = true;
    groupMediaRecorder.stop();
  }
  stopGroupRecordingStream();
  releasePendingAttachment();
  renderGroupAttachmentPreview();
}

function renderGroupAttachmentPreview() {
  const preview = document.getElementById("groupAttachmentPreview");
  const textarea = document.getElementById("groupMessageBody");
  const submit = document.getElementById("groupMessageSubmit");
  if (!preview || !textarea || !submit) return;
  const pending = ministryGroupsState.pendingAttachment;
  if (!pending) {
    preview.hidden = true;
    preview.innerHTML = "";
    textarea.required = true;
    textarea.placeholder = "Write a message to your group...";
    submit.textContent = "Post message";
    return;
  }
  preview.hidden = false;
  textarea.required = false;
  if (pending.type === "image") {
    textarea.placeholder = "Add an optional caption...";
    submit.textContent = "Send photo";
    preview.innerHTML = `<img src="${groupsEscape(pending.previewUrl)}" alt="Selected group photo" /><span><strong>${groupsEscape(pending.fileName || "Selected photo")}</strong><small>${Math.ceil(pending.blob.size / 1024)} KB</small></span><button type="button" onclick="clearGroupAttachment()" aria-label="Remove selected photo">×</button>`;
  } else {
    textarea.placeholder = "Add optional text to this voice message...";
    submit.textContent = "Send voice note";
    preview.innerHTML = `<span class="group-recording-ready">🎤</span><span><strong>Voice note ready</strong><small>${groupsEscape(groupDuration(pending.durationSeconds))}</small></span><button type="button" onclick="clearGroupAttachment()" aria-label="Remove voice note">×</button>`;
  }
}

function chooseGroupPhoto() {
  document.getElementById("groupPhotoInput")?.click();
}

function selectGroupPhoto(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    groupStatus("Group photos must be JPG, PNG, or WebP images.");
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    groupStatus("Group photos must be 10MB or smaller.");
    return;
  }
  clearGroupAttachment();
  ministryGroupsState.pendingAttachment = { type: "image", blob: file, fileName: file.name, previewUrl: URL.createObjectURL(file), durationSeconds: null };
  renderGroupAttachmentPreview();
  groupStatus("");
}

function recordedBlobDuration(blob, fallbackSeconds) {
  return new Promise((resolve) => {
    const audio = document.createElement("audio");
    const url = URL.createObjectURL(blob);
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      URL.revokeObjectURL(url);
      resolve(Math.max(1, Math.round(value || fallbackSeconds || 1)));
    };
    const timeout = setTimeout(() => finish(fallbackSeconds), 2000);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => finish(Number.isFinite(audio.duration) ? audio.duration : fallbackSeconds);
    audio.onerror = () => finish(fallbackSeconds);
    audio.src = url;
  });
}

async function toggleGroupVoiceRecording(button) {
  if (groupMediaRecorder?.state === "recording") {
    groupRecordingCancelled = false;
    button.disabled = true;
    groupMediaRecorder.stop();
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    groupStatus("Voice recording is not supported in this browser.");
    return;
  }
  clearGroupAttachment();
  try {
    groupRecordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    groupRecordingCancelled = false;
    const preferredType = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((type) => MediaRecorder.isTypeSupported(type));
    const chunks = [];
    groupMediaRecorder = preferredType
      ? new MediaRecorder(groupRecordingStream, { mimeType: preferredType })
      : new MediaRecorder(groupRecordingStream);
    const recorder = groupMediaRecorder;
    groupRecordingStartedAt = performance.now();
    const startedAt = groupRecordingStartedAt;
    groupMediaRecorder.addEventListener("dataavailable", (event) => { if (event.data.size) chunks.push(event.data); });
    groupMediaRecorder.addEventListener("stop", async () => {
      const elapsed = (performance.now() - startedAt) / 1000;
      const contentType = recorder.mimeType || chunks[0]?.type || "audio/webm";
      const blob = new Blob(chunks, { type: contentType });
      stopGroupRecordingStream();
      button.disabled = false;
      button.innerHTML = "🎤 <span>Voice</span>";
      button.classList.remove("is-recording");
      if (groupRecordingCancelled) { groupRecordingCancelled = false; return; }
      if (!blob.size) {
        groupStatus("The voice recording was empty. Please try again.");
        renderGroupAttachmentPreview();
        return;
      }
      const durationSeconds = await recordedBlobDuration(blob, elapsed);
      ministryGroupsState.pendingAttachment = { type: "voice", blob, durationSeconds, previewUrl: "" };
      renderGroupAttachmentPreview();
      groupStatus("");
    }, { once: true });
    groupMediaRecorder.start(250);
    button.textContent = "■ Stop";
    button.classList.add("is-recording");
    groupStatus("Recording voice note… tap Stop when finished.");
  } catch (error) {
    stopGroupRecordingStream();
    groupStatus(error?.name === "NotAllowedError" ? "Microphone access is needed to record a voice note." : "Unable to start voice recording.");
  }
}

async function groupsFetch(path, options = {}) {
  const response = await fetch(path, { ...options, headers: groupsHeaders(), cache: "no-store" });
  if (window.MyAgapayShell?.handleUnauthorized(response)) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Unable to load your groups.");
  return data;
}

async function loadGroups() {
  const status = document.getElementById("groupsStatus");
  try {
    const data = await groupsFetch("/api/donor/groups");
    if (!data) return;
    ministryGroupsState.groups = data.groups || [];
    status.hidden = true;
    renderGroupsList();
    if (initialGroupId && ministryGroupsState.groups.some(({ id }) => id === initialGroupId)) {
      const requestedGroupId = initialGroupId;
      initialGroupId = "";
      await openMinistryGroup(requestedGroupId);
    }
    if (ministryGroupsState.activeGroupId && !ministryGroupsState.groups.some(({ id }) => id === ministryGroupsState.activeGroupId)) {
      ministryGroupsState.activeGroupId = "";
      document.getElementById("groupThreadPanel").innerHTML = '<div class="group-thread-empty"><strong>Group unavailable</strong><p>Your active ministry memberships changed.</p></div>';
    }
  } catch (error) {
    status.hidden = false;
    status.textContent = error.message || "Unable to load your groups.";
  }
}

async function openMinistryGroup(groupId) {
  const status = document.getElementById("groupsStatus");
  try {
    const data = await groupsFetch(`/api/donor/groups/${encodeURIComponent(groupId)}/messages`);
    if (!data) return;
    if (ministryGroupsState.activeGroupId && ministryGroupsState.activeGroupId !== groupId) clearGroupAttachment();
    releaseGroupAttachmentUrls();
    ministryGroupsState.activeGroupId = groupId;
    ministryGroupsState.messages = data.messages || [];
    renderGroupsList();
    const membership = ministryGroupsState.groups.find(({ id }) => id === groupId);
    renderGroupThread({ ...data.group, role: membership?.role || "participant" }, ministryGroupsState.messages);
    const unread = ministryGroupsState.messages.filter(message => !message.read);
    if (unread.length) {
      await Promise.all(unread.map(message => groupsFetch(`/api/donor/groups/${encodeURIComponent(groupId)}/messages/${encodeURIComponent(message.id)}/read`, { method: "POST" }).catch(() => null)));
      const group = ministryGroupsState.groups.find(({ id }) => id === groupId);
      if (group) group.unreadCount = 0;
      ministryGroupsState.messages.forEach(message => { message.read = true; });
      renderGroupsList();
    }
    status.hidden = true;
  } catch (error) {
    status.hidden = false;
    status.textContent = error.message || "Unable to open this group.";
  }
}

async function uploadGroupMessageAttachment(attachment, body) {
  if (attachment.blob.size > 10 * 1024 * 1024) throw new Error(`${attachment.type === "voice" ? "Voice messages" : "Group photos"} must be 10MB or smaller.`);
  const headers = window.MyAgapayShell?.authHeaders({
    "Content-Type": attachment.blob.type,
    "X-AGAPAY-Message-Body-B64": attachmentBodyHeader(body),
  }) || { "Content-Type": attachment.blob.type, "X-AGAPAY-Message-Body-B64": attachmentBodyHeader(body) };
  if (attachment.type === "voice") headers["X-AGAPAY-Attachment-Duration-Seconds"] = String(Math.max(1, Math.round(attachment.durationSeconds || 0)));
  const response = await fetch(`/api/donor/groups/${encodeURIComponent(ministryGroupsState.activeGroupId)}/messages/attachment?type=${encodeURIComponent(attachment.type)}`, {
    method: "POST",
    headers,
    body: attachment.blob,
  });
  if (window.MyAgapayShell?.handleUnauthorized(response)) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Unable to send this attachment.");
  return data;
}

async function postMinistryGroupMessage(event) {
  event.preventDefault();
  const body = document.getElementById("groupMessageBody")?.value || "";
  const attachment = ministryGroupsState.pendingAttachment;
  const button = event.currentTarget.querySelector('button[type="submit"]');
  if (button) button.disabled = true;
  try {
    if (attachment) {
      const uploaded = await uploadGroupMessageAttachment(attachment, body);
      if (!uploaded) return;
    }
    else await groupsFetch(`/api/donor/groups/${encodeURIComponent(ministryGroupsState.activeGroupId)}/messages`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
    releasePendingAttachment();
    delete ministryGroupsState.catchUp[ministryGroupsState.activeGroupId];
    await openMinistryGroup(ministryGroupsState.activeGroupId);
    await loadGroups();
  } catch (error) {
    const status = document.getElementById("groupsStatus");
    status.hidden = false;
    status.textContent = error.message || "Unable to post your message.";
  } finally {
    if (button) button.disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", loadGroups);
