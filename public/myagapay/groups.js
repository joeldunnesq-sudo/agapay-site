let ministryGroupsState = { groups: [], activeGroupId: "", messages: [], catchUp: {}, pendingAttachment: null, activeTab: "overview", signupSheets: [], signupTemplates: [], activeSignup: null };
let initialGroupId = new URLSearchParams(window.location.search).get("group") || "";
let groupMediaRecorder = null;
let groupRecordingStream = null;
let groupRecordingStartedAt = 0;
let groupRecordingCancelled = false;
const groupAttachmentObjectUrls = new Map();
const groupVoicePlayers = new Map();
const groupComposerIcons = Object.freeze({
  voice: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/></svg>',
  photo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"/><circle cx="12" cy="13" r="3"/></svg>',
  stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>'
});

function groupComposerButton(icon, label) {
  return `${groupComposerIcons[icon]}<span>${label}</span>`;
}

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
  if (["voice", "image"].includes(message.messageType) && !message.attachmentUrl) {
    return `<p class="group-attachment-expired">${groupsEscape(message.body || (message.messageType === "voice" ? "Voice message (no longer available)" : "Photo (no longer available)"))}</p>`;
  }
  if (message.messageType === "voice") {
    const bars = Array.from({ length: 36 }, () => "<span></span>").join("");
    return `<div class="group-voice-note" data-voice-message="${groupsEscape(message.id)}">
      <button type="button" class="group-voice-toggle" onclick="toggleGroupVoiceMessage('${groupsEscape(message.id)}')" aria-label="Play voice message">${groupComposerIcons.play}</button>
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

async function hydrateMinistryGroupImages() {
  const images = [...document.querySelectorAll("[data-ministry-group-image]")];
  await Promise.all(images.map(async (image) => {
    try {
      const blob = await fetchPrivateGroupAttachment(image.dataset.imageUrl);
      if (!blob || !image.isConnected) return;
      const objectUrl = URL.createObjectURL(blob);
      const key = `ministry:${image.dataset.ministryGroupImage}:${Math.random()}`;
      groupAttachmentObjectUrls.set(key, objectUrl);
      image.src = objectUrl;
      image.closest(".ministry-group-avatar")?.classList.add("has-image");
    } catch { /* Keep the ministry initial fallback. */ }
  }));
}

function ministryGroupAvatar(group, size = "list") {
  const image = group.hasImage && group.imageUrl
    ? `<img data-ministry-group-image="${groupsEscape(group.id)}" data-image-url="${groupsEscape(group.imageUrl)}" alt="" />`
    : "";
  return `<span class="ministry-group-avatar is-${groupsEscape(size)}">${image}<b>${groupsEscape((group.name || "M").slice(0, 1))}</b></span>`;
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
    if (button) { button.innerHTML = groupComposerIcons.play; button.setAttribute("aria-label", "Play voice message"); }
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
      if (otherButton) { otherButton.innerHTML = groupComposerIcons.play; otherButton.setAttribute("aria-label", "Play voice message"); }
    });
    if (player.audio.paused) {
      await player.audio.play();
      button.innerHTML = groupComposerIcons.pause;
      button.setAttribute("aria-label", "Pause voice message");
    } else {
      player.audio.pause();
      button.innerHTML = groupComposerIcons.play;
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
      ${ministryGroupAvatar(group)}<span class="group-list-copy"><strong>${groupsEscape(group.name)}</strong><small>${group.role === "leader" ? "Leader" : "Member"}${group.messageCount ? ` · ${group.messageCount} messages` : ""}</small></span>
      ${group.unreadCount ? `<em>${Number(group.unreadCount)} new</em>` : ""}
    </button>
  `).join("");
  void hydrateMinistryGroupImages();
}

function renderGroupThread(group, messages) {
  const panel = document.getElementById("groupThreadPanel");
  if (!panel) return;
  const isLeader = group.role === "leader";
  const activeTab = ministryGroupsState.activeTab;
  const messagesOpen = activeTab === "messages";
  panel.innerHTML = `
    <div class="group-thread-head"><button type="button" class="group-thread-back" onclick="closeMinistryGroup()" aria-label="Back to ministry groups"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg><span>Groups</span></button><div class="group-thread-identity">${ministryGroupAvatar(group, "header")}<div><span class="eyebrow">Ministry workspace</span><h2>${groupsEscape(group.name)}</h2><p>${groupsEscape(group.description || "Messages and service coordination for this ministry.")}</p></div></div><div class="group-thread-actions">${group.role === "leader" ? `<button type="button" class="groups-refresh" data-message-action onclick="toggleGroupCatchUp('${groupsEscape(group.id)}',this)" aria-expanded="false"${messagesOpen ? "" : " hidden"}>Who’s caught up</button>` : ""}<button type="button" class="groups-refresh" data-message-action onclick="openMinistryGroup('${groupsEscape(group.id)}')"${messagesOpen ? "" : " hidden"}>Refresh messages</button></div></div>
    <nav class="group-workspace-tabs" aria-label="${groupsEscape(group.name)} tools">${[["overview","Overview"],["messages","Messages"],["signups","Signups"],["schedule","Schedule"],["commerce","Meals & Events"],["members","Members"],["resources","Resources"]].map(([tab,label])=>`<button type="button" data-group-tab="${tab}" class="${activeTab===tab?"is-active":""}" onclick="switchGroupWorkspace('${tab}')" aria-selected="${activeTab===tab}">${label}</button>`).join("")}</nav>
    <div class="group-message-list" id="groupMessageList" data-group-workspace="messages"${messagesOpen ? "" : " hidden"}>${messages.length ? messages.map(message => `
      <article class="group-message ${message.mine ? "is-outgoing" : "is-incoming"} is-${groupsEscape(message.messageType || "text")}${message.read ? "" : " is-unread"}"><div><strong>${message.mine ? "You" : groupsEscape(message.authorName)}</strong><time>${groupsEscape(groupMessageTime(message.createdAt))}</time></div>${renderGroupMessageContent(message)}</article>
    `).join("") : '<div class="group-thread-empty"><strong>No messages yet</strong><p>Start the conversation for your ministry.</p></div>'}</div>
    ${isLeader ? `<section class="group-catch-up" id="groupCatchUp-${groupsEscape(group.id)}" data-group-workspace="messages" hidden></section>` : ""}
    <form class="group-compose" data-group-workspace="messages" onsubmit="postMinistryGroupMessage(event)"${messagesOpen ? "" : " hidden"}>
      <label for="groupMessageBody">Post a message</label>
      <textarea id="groupMessageBody" maxlength="8000" rows="2" required placeholder="Write a message to your group..."></textarea>
      <div class="group-attachment-preview" id="groupAttachmentPreview" hidden></div>
      <div class="group-compose-actions">
        <div><button type="button" class="group-attach-button" onclick="toggleGroupVoiceRecording(this)" aria-label="Record a voice message">${groupComposerButton("voice", "Voice")}</button><button type="button" class="group-attach-button" onclick="chooseGroupPhoto()" aria-label="Attach a photo">${groupComposerButton("photo", "Photo")}</button><input id="groupPhotoInput" type="file" accept="image/jpeg,image/png,image/webp" onchange="selectGroupPhoto(event)" hidden /></div>
        <button type="submit" id="groupMessageSubmit">Post message</button>
      </div>
      <small class="group-thread-retention">Voice notes and photos are removed after 30 days. Conversation history remains available.</small>
    </form>
    ${["overview","signups","schedule","commerce","members","resources"].map(tab=>`<section class="group-signups-workspace group-${tab}-workspace" id="group${tab[0].toUpperCase()+tab.slice(1)}Workspace" data-group-workspace="${tab}"${activeTab===tab?"":" hidden"}><div class="group-signups-loading">Loading ${groupsEscape(group.name)} ${tab}…</div></section>`).join("")}
  `;
  renderGroupAttachmentPreview();
  void hydrateGroupPhotos();
  void hydrateMinistryGroupImages();
  const messageList = document.getElementById("groupMessageList");
  if (messageList) messageList.scrollTop = messageList.scrollHeight;
  if (!messagesOpen) void loadActiveGroupWorkspace(activeTab);
}

function groupSignupCategoryLabel(value) {
  return ({ meal_train:"Meal train", cleaning:"Cleaning", event:"Event", volunteer:"Volunteer", general:"General" })[value] || "General";
}

function groupSignupCategoryOptions(selected = "general") {
  return ["meal_train", "cleaning", "event", "volunteer", "general"].map((value) => `<option value="${value}"${value === selected ? " selected" : ""}>${groupSignupCategoryLabel(value)}</option>`).join("");
}

function groupSignupLocalDate(value) {
  if (value == null) return "";
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function groupSignupDisplayDate(value) {
  if (value == null) return "Flexible date";
  const date = new Date(Number(value));
  return Number.isNaN(date.getTime()) ? "Date to be confirmed" : date.toLocaleString(undefined, { weekday:"short", month:"short", day:"numeric", hour:"numeric", minute:"2-digit" });
}

async function switchGroupWorkspace(tab) {
  if (!['overview','messages','signups','schedule','commerce','members','resources'].includes(tab)) return;
  ministryGroupsState.activeTab = tab;
  document.querySelectorAll('[data-group-workspace]').forEach((element) => { element.hidden = element.dataset.groupWorkspace !== tab; });
  document.querySelectorAll('[data-group-tab]').forEach((button) => {
    const active = button.dataset.groupTab === tab;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('[data-message-action]').forEach((button) => { button.hidden = tab !== 'messages'; });
  if (tab !== 'messages') await loadActiveGroupWorkspace(tab);
}

async function loadActiveGroupWorkspace(tab) {
  if(tab==='signups') return loadGroupSignupManager();
  const id=ministryGroupsState.activeGroupId; const target=document.querySelector(`[data-group-workspace="${tab}"]`); if(!id||!target)return;
  try {
    if(tab==='overview'){const d=await groupsFetch(`/api/donor/groups/${encodeURIComponent(id)}/overview`);target.innerHTML=`<div class="ministry-overview-hero"><span class="eyebrow">At a glance</span><h3>Your ministry today</h3><p>Everything that needs attention, gathered in one place.</p></div><div class="ministry-overview-grid"><button onclick="switchGroupWorkspace('schedule')"><span>Next event</span><strong>${groupsEscape(d.event?.title||'Nothing scheduled')}</strong><small>${d.event?groupsEscape(groupSignupDisplayDate(d.event.starts_at)):'Create a ministry event'}</small></button><button onclick="switchGroupWorkspace('signups')"><span>Open need</span><strong>${groupsEscape(d.signup?.title||'No open signup')}</strong><small>${d.signup?`${Number(d.signup.openings)} openings`:'Create a signup form'}</small></button><button onclick="switchGroupWorkspace('messages')"><span>Latest message</span><strong>${groupsEscape((d.latestMessage?.body||'No messages yet').slice(0,80))}</strong><small>Open conversation</small></button><button onclick="switchGroupWorkspace('resources')"><span>Latest resource</span><strong>${groupsEscape(d.resource?.title||'No resources yet')}</strong><small>Open shared library</small></button></div>${(d.coverageRequests||[]).length?`<section class="ministry-coverage"><span class="eyebrow">Help requested</span><h3>Can you cover?</h3>${d.coverageRequests.map(request=>`<article><span><strong>${groupsEscape(request.requester_name||'A teammate')} needs coverage</strong><small>${groupsEscape(request.title)} · ${groupsEscape(request.label)} · ${groupsEscape(groupSignupDisplayDate(request.slot_date))}</small>${request.note?`<p>${groupsEscape(request.note)}</p>`:''}</span><button type="button" onclick="acceptMinistryCoverage('${groupsEscape(request.id)}')">I can cover</button></article>`).join('')}</section>`:''}<section class="ministry-my-commitments"><h3>My commitments</h3>${(d.myCommitments||[]).length?(d.myCommitments||[]).map(c=>`<a href="/myagapay/signups?sheet=${encodeURIComponent(c.sheetId||c.sheet_id||'')}"><strong>${groupsEscape(c.title)}</strong><span>${groupsEscape(c.label)} · ${groupsEscape(groupSignupDisplayDate(c.slot_date))}</span></a>`).join(''):'<p>You have no upcoming commitments for this ministry.</p>'}</section>`;}
    if(tab==='schedule'){const [d,m]=await Promise.all([groupsFetch(`/api/donor/groups/${encodeURIComponent(id)}/schedule`),groupsFetch(`/api/donor/groups/${encodeURIComponent(id)}/members`)]);renderMinistrySchedule(target,d.events||[],m.members||[],ministryGroupsState.groups.find(group=>group.id===id));}
    if(tab==='commerce'){const d=await groupsFetch(`/api/donor/groups/${encodeURIComponent(id)}/commerce`);renderMinistryCommerce(target,d.items||[],d.parishId||'');}
    if(tab==='members'){const d=await groupsFetch(`/api/donor/groups/${encodeURIComponent(id)}/members`);renderMinistryMembers(target,d.members||[]);}
    if(tab==='resources'){const d=await groupsFetch(`/api/donor/groups/${encodeURIComponent(id)}/resources`);renderMinistryResources(target,d.resources||[]);}
  } catch(error){target.innerHTML=`<div class="group-signups-empty"><strong>Unable to load ${groupsEscape(tab)}</strong><p>${groupsEscape(error.message)}</p></div>`;}
}

async function acceptMinistryCoverage(requestId){if(!confirm('Take this serving commitment?'))return;await groupsFetch(`/api/donor/koinonia/signups/coverage/${encodeURIComponent(requestId)}/accept`,{method:'POST',body:'{}'});groupStatus('Thank you — this commitment is now yours.');await loadActiveGroupWorkspace('overview');}

function ministryCurrentSunday(){const now=new Date();const date=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()));date.setUTCDate(date.getUTCDate()-date.getUTCDay());return date.toISOString().slice(0,10);}
function delegatedHeadcountPanel(group){if(!group?.headcountDelegated||group.role!=='leader')return '';return `<section class="ministry-headcount-entry"><div><span class="eyebrow">Delegated by parish staff</span><h3>Weekly parish attendance</h3><p>Record the total Sunday headcount. This updates the parish-wide Stewardship Health trend.</p></div><form onsubmit="recordDelegatedHeadcount(event)"><label>Sunday<input type="date" name="weekOf" value="${ministryCurrentSunday()}" required /></label><label>Headcount<input type="number" name="headcount" min="0" step="1" placeholder="0" required /></label><button type="submit">Save attendance</button></form><p class="ministry-headcount-status" id="ministryHeadcountStatus" role="status"></p></section>`;}
function renderMinistrySchedule(target,events,members,group){target.innerHTML=`${delegatedHeadcountPanel(group)}<div class="group-signups-head"><div><span class="eyebrow">Ministry calendar</span><h3>Schedule</h3><p>Plan meetings and serving dates, then record who attended.</p></div></div><details class="group-signup-create"><summary>+ Add an event</summary><form onsubmit="createMinistryEvent(event)"><label>Event name<input name="title" required maxlength="180" placeholder="Coffee Hour preparation" /></label><label>Starts<input type="datetime-local" name="startsAt" required /></label><label>Location<input name="location" maxlength="240" placeholder="Parish hall" /></label><label>Repeat weekly<select name="repeatCount"><option value="1">One time</option><option value="4">4 weeks</option><option value="8">8 weeks</option><option value="12">12 weeks</option></select></label><label class="is-wide">Details<textarea name="description" rows="2"></textarea></label><button class="btn btn-gold" type="submit">Add to schedule</button></form></details><div class="ministry-event-list">${events.length?events.map(e=>`<article><div><span class="eyebrow">${groupsEscape(groupSignupDisplayDate(e.starts_at))}</span><h3>${groupsEscape(e.title)}</h3><p>${groupsEscape(e.location||'Location to be confirmed')}${e.description?` · ${groupsEscape(e.description)}`:''}</p></div><div class="ministry-event-actions"><details><summary>Attendance (${Number(e.attendance_count||0)})</summary><div>${members.map(m=>`<button type="button" onclick="recordMinistryAttendance('${groupsEscape(e.id)}','${groupsEscape(m.personId)}','present')">✓ ${groupsEscape(m.name)}</button>`).join('')}</div></details><button class="group-signup-delete" onclick="deleteMinistryEvent('${groupsEscape(e.id)}')">Delete</button></div></article>`).join(''):'<div class="group-signups-empty"><strong>No upcoming events</strong><p>Add the next meeting or serving date.</p></div>'}</div>`;}
async function recordDelegatedHeadcount(event){event.preventDefault();const form=event.currentTarget;const button=form.querySelector('button');const status=document.getElementById('ministryHeadcountStatus');const data=new FormData(form);button.disabled=true;try{const saved=await groupsFetch(`/api/donor/groups/${encodeURIComponent(ministryGroupsState.activeGroupId)}/headcount`,{method:'PATCH',body:JSON.stringify({weekOf:data.get('weekOf'),headcount:Number(data.get('headcount'))})});status.textContent=`Saved ${Number(saved.headcount).toLocaleString()} for ${groupsEscape(saved.weekOf)}.`;status.className='ministry-headcount-status is-success';groupStatus('Parish attendance was updated.');}catch(error){status.textContent=error.message||'Unable to save attendance.';status.className='ministry-headcount-status is-error';}finally{button.disabled=false;}}
async function createMinistryEvent(event){event.preventDefault();const d=new FormData(event.currentTarget);await groupsFetch(`/api/donor/groups/${encodeURIComponent(ministryGroupsState.activeGroupId)}/schedule`,{method:'POST',body:JSON.stringify({title:d.get('title'),startsAt:new Date(d.get('startsAt')).getTime(),location:d.get('location'),description:d.get('description'),repeatCount:Number(d.get('repeatCount'))})});groupStatus('Event added to the ministry schedule.');await loadActiveGroupWorkspace('schedule');}
async function deleteMinistryEvent(id){if(!confirm('Delete this ministry event?'))return;await groupsFetch(`/api/donor/groups/${encodeURIComponent(ministryGroupsState.activeGroupId)}/schedule/${encodeURIComponent(id)}`,{method:'DELETE'});await loadActiveGroupWorkspace('schedule');}
async function recordMinistryAttendance(eventId,personId,status){await groupsFetch(`/api/donor/groups/${encodeURIComponent(ministryGroupsState.activeGroupId)}/schedule/${encodeURIComponent(eventId)}/attendance`,{method:'PATCH',body:JSON.stringify({personId,status})});groupStatus('Attendance recorded.');await loadActiveGroupWorkspace('schedule');}

function renderMinistryMembers(target,members){const mine=members.find(m=>m.mine);target.innerHTML=`<div class="group-signups-head"><div><span class="eyebrow">Serving together</span><h3>Members</h3><p>Everyone currently assigned by the parish to this ministry.</p></div></div><form class="ministry-availability" onsubmit="saveMinistryAvailability(event)"><label>My availability or serving notes<input name="availabilityNote" maxlength="300" value="${groupsEscape(mine?.availabilityNote||'')}" placeholder="Available first and third Sundays" /></label><button type="submit">Save</button></form><div class="ministry-member-grid">${members.map(m=>`<article><span>${groupsEscape((m.name||'M').slice(0,1))}</span><div><strong>${groupsEscape(m.name)}</strong><small>${groupsEscape(m.role)}${m.mine?' · You':''}</small><p>${groupsEscape(m.availabilityNote||'No availability note')}</p></div></article>`).join('')}</div>`;}
async function saveMinistryAvailability(event){event.preventDefault();const d=new FormData(event.currentTarget);await groupsFetch(`/api/donor/groups/${encodeURIComponent(ministryGroupsState.activeGroupId)}/members/availability`,{method:'PATCH',body:JSON.stringify({availabilityNote:d.get('availabilityNote')})});groupStatus('Your availability was saved.');await loadActiveGroupWorkspace('members');}

function renderMinistryResources(target,resources){target.innerHTML=`<div class="group-signups-head"><div><span class="eyebrow">Shared library</span><h3>Resources</h3><p>Keep checklists, instructions, training, and useful links close at hand.</p></div></div><details class="group-signup-create"><summary>+ Share a resource</summary><form onsubmit="createMinistryResource(event)"><label>Title<input name="title" required maxlength="180" /></label><label>Type<select name="resourceType"><option value="checklist">Checklist</option><option value="document">Document</option><option value="training">Training</option><option value="link">Link</option></select></label><label class="is-wide">Link<input name="url" type="url" placeholder="https://" /></label><label class="is-wide">Notes<textarea name="notes" rows="3"></textarea></label><button class="btn btn-gold" type="submit">Share resource</button></form></details><div class="ministry-resource-grid">${resources.length?resources.map(r=>`<article><span>${groupsEscape(r.resource_type)}</span><h3>${groupsEscape(r.title)}</h3><p>${groupsEscape(r.notes||'')}</p><div>${r.url?`<a href="${groupsEscape(r.url)}" target="_blank" rel="noopener">Open resource ↗</a>`:''}<button class="group-signup-delete" onclick="deleteMinistryResource('${groupsEscape(r.id)}')">Delete</button></div></article>`).join(''):'<div class="group-signups-empty"><strong>No shared resources</strong><p>Add the ministry’s first checklist or useful link.</p></div>'}</div>`;}
async function createMinistryResource(event){event.preventDefault();const d=Object.fromEntries(new FormData(event.currentTarget));await groupsFetch(`/api/donor/groups/${encodeURIComponent(ministryGroupsState.activeGroupId)}/resources`,{method:'POST',body:JSON.stringify(d)});groupStatus('Resource shared.');await loadActiveGroupWorkspace('resources');}
async function deleteMinistryResource(id){if(!confirm('Delete this shared resource?'))return;await groupsFetch(`/api/donor/groups/${encodeURIComponent(ministryGroupsState.activeGroupId)}/resources/${encodeURIComponent(id)}`,{method:'DELETE'});await loadActiveGroupWorkspace('resources');}

// Meals & Events (ministry-delegated commerce)
// Lets an active ministry leader create priced festal-event listings (feast
// day dinners, festival plates) without parish-dashboard credentials, and
// generates a per-listing QR code -- reusing the exact qrcode-generator +
// brand-badge pattern the parish dashboard already uses for the Bookstore
// guest checkout QR (see public/parish/app.js renderBookstoreGuestCheckout).
// Duplicated here rather than shared, since groups.js and parish/app.js are
// separate non-module <script> includes with no import mechanism between them.
const ministryCommerceMoney = cents => (Number(cents || 0) / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
let ministryCommerceQrSvgByVariant = {};
let ministryCommerceMarkDataUriPromise = null;

function ministryCommerceMarkDataUri() {
  if (ministryCommerceMarkDataUriPromise) return ministryCommerceMarkDataUriPromise;
  ministryCommerceMarkDataUriPromise = fetch('/mark.png')
    .then(res => res.blob())
    .then(blob => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    }))
    .catch(() => { ministryCommerceMarkDataUriPromise = null; return ''; });
  return ministryCommerceMarkDataUriPromise;
}

function ministryCommerceBrandQrSvg(svg, logoHref) {
  const badge = `
    <g class="agapay-qr-badge" aria-hidden="true">
      <circle cx="50%" cy="50%" r="10.5%" fill="#FFFDF9" stroke="#C8A24A" stroke-width="1.4"/>
      ${logoHref ? `<image href="${logoHref}" x="41.5%" y="41.5%" width="17%" height="17%" preserveAspectRatio="xMidYMid meet"/>` : ''}
    </g>`;
  return svg.replace('</svg>', `${badge}</svg>`);
}

function ministryCommerceQrUrl(parishId, variantId) {
  if (!parishId || !variantId) return '';
  return `${window.location.origin}/events/${encodeURIComponent(parishId)}?item=${encodeURIComponent(variantId)}`;
}

async function renderMinistryCommerceQr(parishId, variantId) {
  const target = document.getElementById(`commerceQr-${CSS.escape(variantId)}`);
  const url = ministryCommerceQrUrl(parishId, variantId);
  if (!target || !url || typeof qrcode === 'undefined') return;
  const qr = qrcode(0, 'H');
  qr.addData(url);
  qr.make();
  const rawSvg = qr.createSvgTag(4, 3)
    .replace(/<svg /, '<svg role="img" aria-label="Payment QR code" ')
    .replace(/fill="#000000"/g, 'fill="#061522"');
  ministryCommerceQrSvgByVariant[variantId] = ministryCommerceBrandQrSvg(rawSvg, '');
  target.innerHTML = ministryCommerceQrSvgByVariant[variantId];
  const logoHref = await ministryCommerceMarkDataUri();
  if (logoHref) {
    ministryCommerceQrSvgByVariant[variantId] = ministryCommerceBrandQrSvg(rawSvg, logoHref);
    if (target.isConnected) target.innerHTML = ministryCommerceQrSvgByVariant[variantId];
  }
}

function ministryCommerceDownloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

async function downloadMinistryCommerceQr(parishId, variantId, itemName, extension) {
  if (!ministryCommerceQrSvgByVariant[variantId] || !ministryCommerceQrSvgByVariant[variantId].includes('<image ')) {
    await renderMinistryCommerceQr(parishId, variantId);
  }
  const svg = ministryCommerceQrSvgByVariant[variantId];
  if (!svg) { groupStatus('QR code is not ready yet.'); return; }
  const withNs = svg.includes('xmlns=') ? svg : svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
  const filenameBase = String(itemName || 'event').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'event';
  if (extension === 'svg') {
    ministryCommerceDownloadBlob(`${filenameBase}-qr.svg`, new Blob([withNs], { type: 'image/svg+xml;charset=utf-8' }));
    groupStatus('QR code SVG downloaded.');
    return;
  }
  const image = new Image();
  const svgUrl = URL.createObjectURL(new Blob([withNs], { type: 'image/svg+xml;charset=utf-8' }));
  image.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200; canvas.height = 1200;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 1200, 1200);
    context.drawImage(image, 0, 0, 1200, 1200);
    URL.revokeObjectURL(svgUrl);
    canvas.toBlob(blob => {
      if (!blob) { groupStatus('Unable to create the QR code PNG.'); return; }
      ministryCommerceDownloadBlob(`${filenameBase}-qr.png`, blob);
      groupStatus('QR code PNG downloaded.');
    }, 'image/png');
  };
  image.onerror = () => { URL.revokeObjectURL(svgUrl); groupStatus('Unable to render the QR code PNG.'); };
  image.src = svgUrl;
}

async function copyMinistryCommerceLink(parishId, variantId) {
  const url = ministryCommerceQrUrl(parishId, variantId);
  if (!url) return;
  try { await navigator.clipboard.writeText(url); groupStatus('Payment link copied.'); }
  catch { groupStatus(url); }
}

function renderMinistryCommerce(target, items, parishId) {
  ministryGroupsState.commerceParishId = parishId;
  ministryGroupsState.commerceItems = items;
  target.innerHTML = `<div class="group-signups-head"><div><span class="eyebrow">Feast days &amp; fundraisers</span><h3>Meals &amp; Events</h3><p>Price a dinner, festival plate, or fundraiser item. Each listing gets its own QR code you can print and post — guests can pay without installing the app.</p></div></div>
    <details class="group-signup-create" id="ministryCommerceCreatePanel"><summary>+ Add an item</summary>
      <form id="ministryCommerceCreateForm" onsubmit="createMinistryCommerceItemUI(event)">
        <label>Listing type<select name="offeringKind" required><option value="event">Event</option><option value="meal">Meal</option></select></label>
        <label>Item name<input name="name" required maxlength="180" placeholder="Adult dinner plate" /></label>
        <label>Price<div class="money-input"><i>$</i><input name="priceCents" type="number" min="0.01" step="0.01" required placeholder="18.00" /></div></label>
        <label>Event date<input name="eventDate" type="date" required /></label>
        <label>Start time<input name="eventStartTime" type="time" /></label>
        <label>End time<input name="eventEndTime" type="time" /></label>
        <label>Location<input name="eventLocation" maxlength="200" placeholder="Parish Hall" /></label>
        <label>Quantity available<input name="stockQuantity" type="number" min="0" step="1" placeholder="e.g. 60" /></label>
        <label>Limit per order <small>(optional)</small><input name="maxQuantityPerOrder" type="number" min="1" step="1" placeholder="e.g. 6" /></label>
        <label>Publication<select name="status"><option value="active">Publish now</option><option value="draft">Save as draft</option></select></label>
        <label class="is-wide">Description<textarea name="description" rows="2" maxlength="600" placeholder="Roast lamb, rice pilaf, salad, and bread"></textarea></label>
        <label class="is-wide ministry-commerce-calendar-check"><input name="showOnCalendar" type="checkbox" checked /><span>Show on the parish calendar when published</span></label>
        <p class="ministry-commerce-duplicate-note" id="ministryCommerceDuplicateNote" hidden>Duplicating <strong id="ministryCommerceDuplicateSource"></strong> — pick a new date before saving.</p>
        <button class="btn btn-gold" type="submit">Create listing &amp; get QR code</button>
      </form>
    </details>
    <div id="ministryCommerceNewQr"></div>
    <div class="ministry-commerce-grid">${items.length ? items.map(item => `<article class="ministry-commerce-card">
      <div><span class="eyebrow">${item.offeringKind === 'meal' ? 'Meal' : 'Event'} · ${item.eventDate ? groupsEscape(item.eventDate) : 'No date set'}${item.eventStartTime ? ` · ${groupsEscape(item.eventStartTime)}` : ''}${item.eventLocation ? ` · ${groupsEscape(item.eventLocation)}` : ''}</span><h3>${groupsEscape(item.name)}</h3><p>${groupsEscape(item.description || '')}</p><p><strong>${ministryCommerceMoney(item.priceCents)}</strong>${item.trackInventory ? ` · ${Number(item.stockQuantity || 0)} available` : ''} · <em>${item.status === 'active' ? 'Published' : item.status === 'draft' ? 'Draft' : 'Archived'}</em> · ${item.showOnCalendar ? 'On parish calendar' : 'Calendar hidden'}</p></div>
      <details class="ministry-commerce-qr-toggle" ontoggle="if(this.open) renderMinistryCommerceQr('${groupsEscape(parishId)}','${groupsEscape(item.variantId)}')">
        <summary>Show payment QR code</summary>
        <div class="ministry-commerce-qr-panel">
          <div id="commerceQr-${groupsEscape(item.variantId)}" class="ministry-commerce-qr-image" aria-live="polite"></div>
          <div class="ministry-commerce-qr-actions">
            <button type="button" onclick="copyMinistryCommerceLink('${groupsEscape(parishId)}','${groupsEscape(item.variantId)}')">Copy link</button>
            <button type="button" onclick="downloadMinistryCommerceQr('${groupsEscape(parishId)}','${groupsEscape(item.variantId)}','${groupsEscape(item.name)}','png')">Download PNG</button>
            <button type="button" onclick="downloadMinistryCommerceQr('${groupsEscape(parishId)}','${groupsEscape(item.variantId)}','${groupsEscape(item.name)}','svg')">Download SVG</button>
          </div>
        </div>
      </details>
      <div class="ministry-commerce-card-actions">
        <button type="button" onclick="duplicateMinistryCommerceItem('${groupsEscape(item.id)}')">Duplicate for next year</button>
        <button type="button" onclick="toggleMinistryCommerceCalendar('${groupsEscape(item.id)}',${item.showOnCalendar ? 'false' : 'true'})">${item.showOnCalendar ? 'Hide from calendar' : 'Show on calendar'}</button>
        <button class="group-signup-delete" onclick="toggleMinistryCommerceItemStatus('${groupsEscape(item.id)}','${item.status === 'active' ? 'archived' : 'active'}')">${item.status === 'active' ? 'Archive' : 'Publish'}</button>
      </div>
    </article>`).join('') : '<div class="group-signups-empty"><strong>No listings yet</strong><p>Add your first dinner plate or fundraiser item above.</p></div>'}</div>`;
}

function duplicateMinistryCommerceItem(productId) {
  const source = (ministryGroupsState.commerceItems || []).find(item => item.id === productId);
  if (!source) return;
  const panel = document.getElementById('ministryCommerceCreatePanel');
  const form = document.getElementById('ministryCommerceCreateForm');
  if (!panel || !form) return;
  panel.open = true;
  form.elements.name.value = source.name || '';
  form.elements.offeringKind.value = source.offeringKind === 'meal' ? 'meal' : 'event';
  form.elements.priceCents.value = source.priceCents ? (source.priceCents / 100).toFixed(2) : '';
  form.elements.eventDate.value = ''; // force picking a new date, not last year's
  form.elements.eventStartTime.value = source.eventStartTime || '';
  form.elements.eventEndTime.value = source.eventEndTime || '';
  form.elements.eventLocation.value = source.eventLocation || '';
  form.elements.stockQuantity.value = source.stockQuantity || '';
  form.elements.maxQuantityPerOrder.value = source.maxQuantityPerOrder || '';
  form.elements.description.value = source.description || '';
  form.elements.status.value = 'draft';
  form.elements.showOnCalendar.checked = source.showOnCalendar !== false;
  const note = document.getElementById('ministryCommerceDuplicateNote');
  const noteSource = document.getElementById('ministryCommerceDuplicateSource');
  if (note && noteSource) { noteSource.textContent = source.name; note.hidden = false; }
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  form.elements.eventDate.focus();
}

async function createMinistryCommerceItemUI(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const d = new FormData(form);
  const priceCents = Math.round(Number(d.get('priceCents') || 0) * 100);
  const body = {
    offeringKind: d.get('offeringKind'),
    name: d.get('name'),
    description: d.get('description'),
    priceCents,
    eventDate: d.get('eventDate'),
    eventStartTime: d.get('eventStartTime'),
    eventEndTime: d.get('eventEndTime'),
    eventLocation: d.get('eventLocation'),
    stockQuantity: d.get('stockQuantity') ? Number(d.get('stockQuantity')) : 0,
    maxQuantityPerOrder: d.get('maxQuantityPerOrder') ? Number(d.get('maxQuantityPerOrder')) : null,
    showOnCalendar: d.get('showOnCalendar') === 'on',
    status: d.get('status')
  };
  const result = await groupsFetch(`/api/donor/groups/${encodeURIComponent(ministryGroupsState.activeGroupId)}/commerce`, { method: 'POST', body: JSON.stringify(body) });
  if (!result) return;
  groupStatus(body.status === 'draft' ? `${body.name} was saved as a draft.` : `${body.name} is live and appears on the parish calendar.`);
  form.reset();
  form.elements.showOnCalendar.checked = true;
  await loadActiveGroupWorkspace('commerce');
  // Auto-open the new item's QR right away, so a leader creating a listing
  // gets the printable code immediately without hunting for it in the list.
  requestAnimationFrame(() => {
    const qrTarget = document.getElementById(`commerceQr-${result.variantId}`);
    const details = qrTarget?.closest('details');
    if (details) { details.open = true; details.scrollIntoView({ behavior: 'smooth', block: 'center' }); renderMinistryCommerceQr(result.parishId, result.variantId); }
  });
}

async function toggleMinistryCommerceItemStatus(productId, nextStatus) {
  await groupsFetch(`/api/donor/groups/${encodeURIComponent(ministryGroupsState.activeGroupId)}/commerce/${encodeURIComponent(productId)}`, { method: 'PATCH', body: JSON.stringify({ status: nextStatus }) });
  groupStatus(nextStatus === 'archived' ? 'Listing archived.' : 'Listing published.');
  await loadActiveGroupWorkspace('commerce');
}

async function toggleMinistryCommerceCalendar(productId, showOnCalendar) {
  await groupsFetch(`/api/donor/groups/${encodeURIComponent(ministryGroupsState.activeGroupId)}/commerce/${encodeURIComponent(productId)}`, { method: 'PATCH', body: JSON.stringify({ showOnCalendar: Boolean(showOnCalendar) }) });
  groupStatus(showOnCalendar ? 'Listing added to the parish calendar.' : 'Listing hidden from the parish calendar.');
  await loadActiveGroupWorkspace('commerce');
}

function renderGroupSignupManager() {
  const target = document.getElementById("groupSignupsWorkspace");
  const group = ministryGroupsState.groups.find(({ id }) => id === ministryGroupsState.activeGroupId);
  if (!target || !group) return;
  if (ministryGroupsState.activeSignup) {
    renderGroupSignupDetail(target, ministryGroupsState.activeSignup.sheet, ministryGroupsState.activeSignup.slots || []);
    return;
  }
  target.innerHTML = `
    <div class="group-signups-head"><div><span class="eyebrow">Leader tools</span><h3>Signup forms</h3><p>Create and manage the ways parishioners can serve ${groupsEscape(group.name)}.</p></div></div>
    <details class="group-signup-create"><summary>+ Create a signup form</summary><form onsubmit="createGroupSignup(event)">
      <label>Title<input name="title" maxlength="180" required placeholder="Sunday coffee hour" /></label>
      <label>Category<select name="category">${groupSignupCategoryOptions()}</select></label>
      <label class="is-wide">Description<textarea name="description" maxlength="2000" rows="3" placeholder="Help parishioners understand what they are signing up to do."></textarea></label>
      <div class="group-signup-form-actions is-wide"><button class="btn btn-gold" type="submit">Create draft</button></div>
    </form></details>
    ${ministryGroupsState.signupTemplates.length?`<div class="group-signup-templates"><span class="eyebrow">Reusable templates</span>${ministryGroupsState.signupTemplates.map(t=>`<button onclick="createGroupSignupFromTemplate('${groupsEscape(t.id)}','${groupsEscape(t.title)}')"><strong>${groupsEscape(t.name)}</strong><small>Use template</small></button>`).join('')}</div>`:''}
    <div class="group-signup-list">${ministryGroupsState.signupSheets.length ? ministryGroupsState.signupSheets.map((sheet) => `
      <button type="button" class="group-signup-row" onclick="openGroupSignup('${groupsEscape(sheet.id)}')"><span><em class="is-${groupsEscape(sheet.status)}">${groupsEscape(sheet.status)}</em><strong>${groupsEscape(sheet.title)}</strong><small>${groupsEscape(groupSignupCategoryLabel(sheet.category))} · ${Number(sheet.slotCount)} slot${Number(sheet.slotCount) === 1 ? "" : "s"} · ${Number(sheet.openingCount)} open</small></span><b aria-hidden="true">›</b></button>
    `).join("") : '<div class="group-signups-empty"><strong>No signup forms yet</strong><p>Create a draft, add the needed slots, then open it to the parish.</p></div>'}</div>`;
}

function renderGroupSignupDetail(target, sheet, slots) {
  const statusButtons = `${sheet.status === "draft" ? `<button type="button" onclick="setGroupSignupStatus('${groupsEscape(sheet.id)}','open')">Open to parish</button>` : ""}${sheet.status === "open" ? `<button type="button" onclick="setGroupSignupStatus('${groupsEscape(sheet.id)}','closed')">Close signups</button>` : ""}${sheet.status === "closed" ? `<button type="button" onclick="setGroupSignupStatus('${groupsEscape(sheet.id)}','open')">Reopen</button>` : ""}${sheet.status !== "archived" ? `<button type="button" onclick="setGroupSignupStatus('${groupsEscape(sheet.id)}','archived')">Archive</button>` : ""}`;
  target.innerHTML = `
    <div class="group-signup-detail-head"><button type="button" onclick="closeGroupSignup()">← All forms</button><div><span class="eyebrow">${groupsEscape(sheet.status)} signup</span><h3>${groupsEscape(sheet.title)}</h3></div><a href="/myagapay/signups?sheet=${encodeURIComponent(sheet.id)}">Preview parish view ↗</a></div>
    <form class="group-signup-edit-form" onsubmit="updateGroupSignup(event,'${groupsEscape(sheet.id)}')">
      <label>Title<input name="title" maxlength="180" required value="${groupsEscape(sheet.title)}" /></label>
      <label>Category<select name="category">${groupSignupCategoryOptions(sheet.category)}</select></label>
      <label class="is-wide">Description<textarea name="description" maxlength="2000" rows="3">${groupsEscape(sheet.description || "")}</textarea></label>
      <div class="group-signup-form-actions is-wide"><button class="btn btn-primary" type="submit">Save form</button><div>${statusButtons}<button type="button" onclick="saveGroupSignupTemplate('${groupsEscape(sheet.id)}')">Save as template</button><button type="button" onclick="showGroupSignupHistory('${groupsEscape(sheet.id)}')">History</button></div><button class="group-signup-delete" type="button" onclick="deleteGroupSignup('${groupsEscape(sheet.id)}')">Delete form</button></div>
    </form>
    <div class="group-signup-slots-head"><div><span class="eyebrow">Signup choices</span><h3>Slots</h3></div><small>Edit what is needed, how many people can help, and when.</small></div>
    <div class="group-signup-slot-editor">${slots.length ? slots.map((slot) => `
      <form onsubmit="updateGroupSignupSlot(event,'${groupsEscape(slot.id)}')"><div class="group-signup-slot-summary"><strong>${groupsEscape(slot.label)}</strong><span>${groupsEscape(groupSignupDisplayDate(slot.slotDate))} · ${Number(slot.filledCount)} of ${Number(slot.neededCount)} filled</span></div><div class="group-signup-slot-fields"><label>What is needed<input name="label" maxlength="180" required value="${groupsEscape(slot.label)}" /></label><label>People needed<input name="neededCount" type="number" min="${Math.max(1, Number(slot.filledCount) || 1)}" max="100" required value="${Number(slot.neededCount)}" /></label><label>Date and time<input name="slotDate" type="datetime-local" value="${groupsEscape(groupSignupLocalDate(slot.slotDate))}" /></label><label>Notes<input name="notes" maxlength="500" value="${groupsEscape(slot.notes || "")}" /></label></div>${slot.entries?.length ? `<div class="group-signup-servants"><span class="eyebrow">Serving</span>${slot.entries.map(entry => `<div><span><strong>${groupsEscape(entry.personName)}</strong>${entry.comment ? `<small>${groupsEscape(entry.comment)}</small>` : ""}</span>${entry.completed ? `<em>${entry.attended ? "Served" : "Excused"}${entry.thanked ? " · Thanked" : ""}</em>` : `<button type="button" onclick="completeGroupSignupEntry('${groupsEscape(entry.id)}')">Mark served + thank</button>`}</div>`).join("")}</div>` : ""}<div class="group-signup-slot-actions"><button type="submit">Save slot</button><button class="group-signup-delete" type="button" onclick="deleteGroupSignupSlot('${groupsEscape(slot.id)}')"${Number(slot.filledCount) ? " disabled title=\"A slot with commitments cannot be deleted\"" : ""}>Delete</button></div></form>
    `).join("") : '<div class="group-signups-empty"><strong>No slots yet</strong><p>Add the first way a parishioner can help.</p></div>'}</div>
    <form class="group-signup-add-slot" onsubmit="addGroupSignupSlot(event,'${groupsEscape(sheet.id)}')"><div><span class="eyebrow">Add another choice</span><h3>New slot</h3></div><label>What is needed<input name="label" maxlength="180" required placeholder="Set up coffee and refreshments" /></label><label>People needed<input name="neededCount" type="number" min="1" max="100" value="1" required /></label><label>Date and time<input name="slotDate" type="datetime-local" /></label><label>Notes<input name="notes" maxlength="500" placeholder="Optional details" /></label><button class="btn btn-gold" type="submit">Add slot</button></form>`;
}

async function loadGroupSignupManager() {
  const target = document.getElementById("groupSignupsWorkspace");
  if (!target) return;
  try {
    const [data,templateData] = await Promise.all([groupsFetch("/api/donor/koinonia/signups"),groupsFetch(`/api/donor/koinonia/signups/templates/${encodeURIComponent(ministryGroupsState.activeGroupId)}`)]);
    if (!data) return;
    ministryGroupsState.signupSheets = (data.sheets || []).filter(({ ministryId }) => ministryId === ministryGroupsState.activeGroupId);
    ministryGroupsState.signupTemplates = templateData?.templates || [];
    renderGroupSignupManager();
  } catch (error) {
    target.innerHTML = `<div class="group-signups-empty"><strong>Unable to load signups</strong><p>${groupsEscape(error.message)}</p></div>`;
  }
}

async function openGroupSignup(sheetId) {
  try {
    const data = await groupsFetch(`/api/donor/koinonia/signups/${encodeURIComponent(sheetId)}`);
    if (!data) return;
    ministryGroupsState.activeSignup = data;
    renderGroupSignupManager();
  } catch (error) { groupStatus(error.message || "Unable to open this signup form."); }
}

function closeGroupSignup() {
  ministryGroupsState.activeSignup = null;
  renderGroupSignupManager();
}

function groupSignupPayload(form) {
  const data = new FormData(form);
  const rawDate = String(data.get("slotDate") || "");
  return { title:data.get("title"), category:data.get("category"), description:data.get("description"), label:data.get("label"), neededCount:Number(data.get("neededCount")), slotDate:rawDate ? new Date(rawDate).getTime() : null, notes:data.get("notes") };
}

async function createGroupSignup(event) {
  event.preventDefault();
  const button = event.currentTarget.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    const payload = groupSignupPayload(event.currentTarget);
    const created = await groupsFetch("/api/donor/koinonia/signups", { method:"POST", body:JSON.stringify({ ministryId:ministryGroupsState.activeGroupId, title:payload.title, category:payload.category, description:payload.description }) });
    await loadGroupSignupManager();
    await openGroupSignup(created.sheetId);
    groupStatus("Draft created. Add the signup slots, then open it to the parish.");
  } catch (error) { groupStatus(error.message || "Unable to create this signup form."); }
  finally { button.disabled = false; }
}

async function updateGroupSignup(event, sheetId) {
  event.preventDefault();
  const button = event.currentTarget.querySelector('[type="submit"]');
  button.disabled = true;
  try { const payload = groupSignupPayload(event.currentTarget); await groupsFetch(`/api/donor/koinonia/signups/${encodeURIComponent(sheetId)}`, { method:"PATCH", body:JSON.stringify(payload) }); await openGroupSignup(sheetId); await loadGroups(); groupStatus("Signup form saved."); }
  catch (error) { groupStatus(error.message || "Unable to save this signup form."); }
  finally { button.disabled = false; }
}

async function setGroupSignupStatus(sheetId, status) {
  try { await groupsFetch(`/api/donor/koinonia/signups/${encodeURIComponent(sheetId)}/status`, { method:"PATCH", body:JSON.stringify({ status }) }); if (status === "archived") { ministryGroupsState.activeSignup = null; await loadGroupSignupManager(); } else await openGroupSignup(sheetId); groupStatus(status === "open" ? "Signup is now open to the parish." : `Signup ${status}.`); }
  catch (error) { groupStatus(error.message || "Unable to update signup status."); }
}

async function deleteGroupSignup(sheetId) {
  if (!window.confirm("Delete this signup form? This cannot be undone.")) return;
  try { await groupsFetch(`/api/donor/koinonia/signups/${encodeURIComponent(sheetId)}`, { method:"DELETE" }); ministryGroupsState.activeSignup = null; await loadGroupSignupManager(); groupStatus("Signup form deleted."); }
  catch (error) { groupStatus(error.message || "Unable to delete this signup form."); }
}

async function addGroupSignupSlot(event, sheetId) {
  event.preventDefault();
  const button = event.currentTarget.querySelector('[type="submit"]');
  button.disabled = true;
  try { await groupsFetch(`/api/donor/koinonia/signups/${encodeURIComponent(sheetId)}/slots`, { method:"POST", body:JSON.stringify(groupSignupPayload(event.currentTarget)) }); await openGroupSignup(sheetId); groupStatus("Signup slot added."); }
  catch (error) { groupStatus(error.message || "Unable to add this signup slot."); }
  finally { button.disabled = false; }
}

async function updateGroupSignupSlot(event, slotId) {
  event.preventDefault();
  const button = event.currentTarget.querySelector('[type="submit"]');
  button.disabled = true;
  try { await groupsFetch(`/api/donor/koinonia/signups/slots/${encodeURIComponent(slotId)}`, { method:"PATCH", body:JSON.stringify(groupSignupPayload(event.currentTarget)) }); await openGroupSignup(ministryGroupsState.activeSignup.sheet.id); groupStatus("Signup slot saved."); }
  catch (error) { groupStatus(error.message || "Unable to save this signup slot."); }
  finally { button.disabled = false; }
}

async function deleteGroupSignupSlot(slotId) {
  if (!window.confirm("Delete this empty signup slot?")) return;
  try { const sheetId = ministryGroupsState.activeSignup.sheet.id; await groupsFetch(`/api/donor/koinonia/signups/slots/${encodeURIComponent(slotId)}`, { method:"DELETE" }); await openGroupSignup(sheetId); groupStatus("Signup slot deleted."); }
  catch (error) { groupStatus(error.message || "Unable to delete this signup slot."); }
}
async function saveGroupSignupTemplate(sheetId){const name=prompt("Template name:",ministryGroupsState.activeSignup?.sheet?.title||"");if(!name)return;await groupsFetch(`/api/donor/koinonia/signups/${encodeURIComponent(sheetId)}/template`,{method:"POST",body:JSON.stringify({name})});groupStatus("Reusable template saved.");await loadGroupSignupManager();}
async function createGroupSignupFromTemplate(templateId,defaultTitle){const title=prompt("Title for the new signup:",defaultTitle);if(!title)return;const date=prompt("Optional first date and time (YYYY-MM-DD HH:MM):","");const startsAt=date?new Date(date).getTime():null;const result=await groupsFetch(`/api/donor/koinonia/signups/templates/${encodeURIComponent(templateId)}/create`,{method:"POST",body:JSON.stringify({title,startsAt})});await loadGroupSignupManager();await openGroupSignup(result.sheetId);groupStatus("Draft created from template.");}
async function showGroupSignupHistory(sheetId){const d=await groupsFetch(`/api/donor/koinonia/signups/${encodeURIComponent(sheetId)}/history`);alert((d.activity||[]).map(a=>`${new Date(a.created_at).toLocaleString()} — ${a.actor_name||'Ministry member'}: ${String(a.action).replaceAll('_',' ')}${a.summary?` (${a.summary})`:''}`).join('\n')||'No activity yet.');}
async function completeGroupSignupEntry(entryId){await groupsFetch(`/api/donor/koinonia/signups/entries/${encodeURIComponent(entryId)}/complete`,{method:"PATCH",body:JSON.stringify({attended:true,sendThanks:true})});await openGroupSignup(ministryGroupsState.activeSignup.sheet.id);groupStatus("Service marked complete and a thank-you was sent.");}

function setGroupThreadMode(open) {
  document.body.classList.toggle("is-group-thread-open", Boolean(open));
}

function syncGroupThreadUrl(groupId = "") {
  const url = new URL(window.location.href);
  if (groupId) url.searchParams.set("group", groupId);
  else url.searchParams.delete("group");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function closeMinistryGroup() {
  clearGroupAttachment();
  releaseGroupAttachmentUrls();
  ministryGroupsState.activeGroupId = "";
  ministryGroupsState.messages = [];
  ministryGroupsState.activeTab = "overview";
  ministryGroupsState.signupSheets = [];
  ministryGroupsState.activeSignup = null;
  setGroupThreadMode(false);
  syncGroupThreadUrl();
  renderGroupsList();
  const panel = document.getElementById("groupThreadPanel");
  if (panel) panel.innerHTML = '<div class="group-thread-empty"><strong>Select a group</strong><p>Choose one of your ministries to read and post messages.</p></div>';
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
    panel.replaceChildren();
    const message = document.createElement('p');
    message.textContent = error.message || 'Unable to load member read status.';
    panel.append(message);
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
    preview.innerHTML = `<span class="group-recording-ready">${groupComposerIcons.voice}</span><span><strong>Voice note ready</strong><small>${groupsEscape(groupDuration(pending.durationSeconds))}</small></span><button type="button" onclick="clearGroupAttachment()" aria-label="Remove voice note">×</button>`;
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
      button.innerHTML = groupComposerButton("voice", "Voice");
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
    button.innerHTML = groupComposerButton("stop", "Stop");
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
      setGroupThreadMode(false);
      syncGroupThreadUrl();
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
    if (ministryGroupsState.activeGroupId && ministryGroupsState.activeGroupId !== groupId) {
      clearGroupAttachment();
      ministryGroupsState.activeTab = "overview";
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
    "X-AGAPAY-Attachment-Bytes": String(attachment.blob.size),
    "X-AGAPAY-Message-Body-B64": attachmentBodyHeader(body),
  }) || {
    "Content-Type": attachment.blob.type,
    "X-AGAPAY-Attachment-Bytes": String(attachment.blob.size),
    "X-AGAPAY-Message-Body-B64": attachmentBodyHeader(body),
  };
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
