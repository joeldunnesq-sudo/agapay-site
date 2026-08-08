const signupsState = { sheets: [], ministries: [], activeSheetId: "" };
let requestedSignupSheetId = new URLSearchParams(window.location.search).get("sheet") || "";

function signupsEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function signupsHeaders() {
  return window.MyAgapayShell?.authHeaders({ "Content-Type": "application/json" }) || {};
}

function signupsDate(value, includeTime = true) {
  if (value == null) return "Flexible date";
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return "Date to be confirmed";
  return new Intl.DateTimeFormat(undefined, includeTime
    ? { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
    : { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function signupCategoryLabel(value) {
  return ({ meal_train: "Meal train", cleaning: "Cleaning", event: "Event", volunteer: "Volunteer", general: "General" })[value] || "General";
}

function signupStatus(message, state = "") {
  const target = document.getElementById("signupsStatus");
  if (!target) return;
  target.hidden = !message;
  target.textContent = message || "";
  if (state) target.dataset.state = state;
  else delete target.dataset.state;
}

async function signupsFetch(path, options = {}) {
  const response = await fetch(path, { ...options, headers: signupsHeaders(), cache: "no-store" });
  if (window.MyAgapayShell?.handleUnauthorized(response)) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Unable to load Koinonia Signups.");
  return payload;
}

function syncSignupUrl(sheetId = "") {
  const url = new URL(window.location.href);
  if (sheetId) url.searchParams.set("sheet", sheetId);
  else url.searchParams.delete("sheet");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function renderSignupSheets() {
  const target = document.getElementById("signupSheets");
  if (!target) return;
  if (!signupsState.sheets.length) {
    target.innerHTML = '<div class="koinonia-empty-state"><strong>No signup sheets yet</strong><p>Open ministry signup sheets will appear here.</p></div>';
    return;
  }
  target.innerHTML = signupsState.sheets.map((sheet) => `
    <button type="button" class="signup-sheet-card${sheet.id === signupsState.activeSheetId ? " is-active" : ""}" onclick="openSignupSheet('${signupsEscape(sheet.id)}')">
      <span class="signup-sheet-card-head"><em class="is-${signupsEscape(sheet.status)}">${signupsEscape(sheet.status)}</em>${sheet.unreadSlotCount ? `<b>${Number(sheet.unreadSlotCount)} new</b>` : ""}</span>
      <strong>${signupsEscape(sheet.title)}</strong>
      <small>${signupsEscape(sheet.ministryName)} · ${signupsEscape(signupCategoryLabel(sheet.category))}</small>
      <span class="signup-sheet-card-foot"><span>${Number(sheet.slotCount)} slot${Number(sheet.slotCount) === 1 ? "" : "s"}</span><span>${Number(sheet.openingCount)} open</span></span>
    </button>
  `).join("");
}

function signupEntryHtml(entry) {
  return `<li><span><strong>${entry.mine ? "You" : signupsEscape(entry.personName)}</strong>${entry.comment ? `<small>${signupsEscape(entry.comment)}</small>` : ""}</span>${entry.mine ? `<span><button type="button" onclick="requestSignupCoverage('${signupsEscape(entry.id)}')">Need coverage</button><button type="button" onclick="cancelSignupEntry('${signupsEscape(entry.id)}')">Cancel</button></span>` : ""}</li>`;
}

function renderSignupDetail(sheet, slots) {
  const target = document.getElementById("signupDetail");
  if (!target) return;
  target.innerHTML = `
    <div class="signup-detail-head"><button class="koinonia-detail-back" type="button" onclick="closeSignupSheet()">← Signups</button><span class="eyebrow">${signupsEscape(sheet.ministryName)}</span><h2>${signupsEscape(sheet.title)}</h2><p>${signupsEscape(sheet.description || "Choose a slot below to help this ministry.")}</p><div class="signup-detail-meta"><span>${signupsEscape(signupCategoryLabel(sheet.category))}</span><span class="is-${signupsEscape(sheet.status)}">${signupsEscape(sheet.status)}</span></div></div>
    <div class="signup-slot-list">${slots.length ? slots.map((slot) => {
      const full = slot.filledCount >= slot.neededCount;
      const mine = slot.entries.some((entry) => entry.mine);
      return `<article class="signup-slot-card${slot.read ? "" : " is-unread"}"><div class="signup-slot-date"><span>${signupsEscape(signupsDate(slot.slotDate))}</span><em>${Number(slot.filledCount)} of ${Number(slot.neededCount)} filled</em></div><h3>${signupsEscape(slot.label)}</h3>${slot.notes ? `<p>${signupsEscape(slot.notes)}</p>` : ""}<ul>${slot.entries.map(signupEntryHtml).join("")}</ul>${sheet.status === "open" && !mine && !full ? `<button class="btn btn-primary" type="button" onclick="claimSignupSlot('${signupsEscape(slot.id)}')">Claim this slot</button>` : full && !mine ? `<button class="btn btn-ghost" type="button" onclick="joinSignupWaitlist('${signupsEscape(slot.id)}')">Join waitlist</button>` : ""}</article>`;
    }).join("") : '<div class="koinonia-empty-state"><strong>No slots yet</strong><p>A ministry leader can add the first signup slot.</p></div>'}</div>
  `;
}

function populateSignupMinistries() {
  const select = document.getElementById("signupMinistry");
  if (!select) return;
  select.innerHTML = signupsState.ministries.map((ministry) => `<option value="${signupsEscape(ministry.id)}">${signupsEscape(ministry.name)}</option>`).join("");
}

async function loadSignups() {
  try {
    const data = await signupsFetch("/api/donor/koinonia/signups");
    if (!data) return;
    signupsState.sheets = data.sheets || [];
    signupsState.ministries = data.ministries || [];
    populateSignupMinistries();
    renderSignupSheets();
    signupStatus("");
    if (requestedSignupSheetId && signupsState.sheets.some(({ id }) => id === requestedSignupSheetId)) {
      const sheetId = requestedSignupSheetId;
      requestedSignupSheetId = "";
      await openSignupSheet(sheetId);
    }
  } catch (error) {
    signupStatus(error.message || "Unable to load signup sheets.", "error");
  }
}

async function openSignupSheet(sheetId) {
  try {
    const data = await signupsFetch(`/api/donor/koinonia/signups/${encodeURIComponent(sheetId)}`);
    if (!data) return;
    signupsState.activeSheetId = sheetId;
    syncSignupUrl(sheetId);
    document.body.classList.add("is-koinonia-detail-open");
    renderSignupSheets();
    renderSignupDetail(data.sheet, data.slots || []);
    await Promise.all((data.slots || []).filter((slot) => !slot.read).map((slot) => signupsFetch(`/api/donor/koinonia/signups/slots/${encodeURIComponent(slot.id)}/read`, { method: "POST" }).catch(() => null)));
    const summary = signupsState.sheets.find(({ id }) => id === sheetId);
    if (summary) summary.unreadSlotCount = 0;
    renderSignupSheets();
    signupStatus("");
  } catch (error) {
    signupStatus(error.message || "Unable to open this signup sheet.", "error");
  }
}

function closeSignupSheet() {
  signupsState.activeSheetId = "";
  syncSignupUrl();
  document.body.classList.remove("is-koinonia-detail-open");
  renderSignupSheets();
  document.getElementById("signupDetail").innerHTML = '<div class="koinonia-empty-state"><strong>Choose a signup sheet</strong><p>Open a sheet to see available slots and current commitments.</p></div>';
}

async function claimSignupSlot(slotId) {
  try {
    await signupsFetch(`/api/donor/koinonia/signups/slots/${encodeURIComponent(slotId)}/claim`, { method: "POST", body: "{}" });
    await loadSignups();
    await openSignupSheet(signupsState.activeSheetId);
    signupStatus("You’re signed up. Thank you for helping.", "success");
  } catch (error) {
    signupStatus(error.message || "Unable to claim this slot.", "error");
  }
}

async function cancelSignupEntry(entryId) {
  try {
    await signupsFetch(`/api/donor/koinonia/signups/entries/${encodeURIComponent(entryId)}/cancel`, { method: "POST", body: "{}" });
    await loadSignups();
    await openSignupSheet(signupsState.activeSheetId);
    signupStatus("Your signup was cancelled.", "success");
  } catch (error) {
    signupStatus(error.message || "Unable to cancel this signup.", "error");
  }
}
async function joinSignupWaitlist(slotId){try{await signupsFetch(`/api/donor/koinonia/signups/slots/${encodeURIComponent(slotId)}/waitlist`,{method:"POST",body:"{}"});signupStatus("You’re on the waitlist. We’ll let you know if space opens.","success");}catch(error){signupStatus(error.message||"Unable to join the waitlist.","error");}}
async function requestSignupCoverage(entryId){const note=window.prompt("Optional note for the ministry coordinator:","");if(note===null)return;try{await signupsFetch(`/api/donor/koinonia/signups/entries/${encodeURIComponent(entryId)}/coverage`,{method:"POST",body:JSON.stringify({note})});signupStatus("Coverage request sent to the ministry.","success");}catch(error){signupStatus(error.message||"Unable to request coverage.","error");}}

document.addEventListener("DOMContentLoaded", loadSignups);
