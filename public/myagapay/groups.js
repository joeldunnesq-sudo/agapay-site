let ministryGroupsState = { groups: [], activeGroupId: "", messages: [], catchUp: {} };
let initialGroupId = new URLSearchParams(window.location.search).get("group") || "";

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
      <article class="group-message${message.read ? "" : " is-unread"}"><div><strong>${groupsEscape(message.authorName)}</strong><time>${groupsEscape(groupMessageTime(message.createdAt))}</time></div><p>${groupsEscape(message.body)}</p></article>
    `).join("") : '<div class="group-thread-empty"><strong>No messages yet</strong><p>Start the conversation for your ministry.</p></div>'}</div>
    ${group.role === "leader" ? `<section class="group-catch-up" id="groupCatchUp-${groupsEscape(group.id)}" hidden></section>` : ""}
    <form class="group-compose" onsubmit="postMinistryGroupMessage(event)"><label for="groupMessageBody">Post a message</label><textarea id="groupMessageBody" maxlength="8000" rows="4" required placeholder="Write a message to your group..."></textarea><button type="submit">Post message</button></form>
  `;
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

async function postMinistryGroupMessage(event) {
  event.preventDefault();
  const body = document.getElementById("groupMessageBody")?.value || "";
  const button = event.currentTarget.querySelector('button[type="submit"]');
  if (button) button.disabled = true;
  try {
    await groupsFetch(`/api/donor/groups/${encodeURIComponent(ministryGroupsState.activeGroupId)}/messages`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
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
