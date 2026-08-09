const signupsState = { sheets: [], ministries: [], activeSheetId: "", pendingAction: null };
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
  return `<li><span class="signup-entry-copy"><strong>${entry.mine ? "You" : signupsEscape(entry.personName)}</strong>${entry.comment ? `<small>${signupsEscape(entry.comment)}</small>` : ""}</span>${entry.mine ? `<span class="signup-entry-actions"><button class="is-coverage${entry.coverageRequested ? " is-requested" : ""}" type="button" data-coverage-note="${signupsEscape(entry.coverageNote || "")}" onclick="openSignupCoverageModal('${signupsEscape(entry.id)}', this.dataset.coverageNote)">${entry.coverageRequested ? "Update request" : "Need coverage"}</button><button class="is-cancel" type="button" onclick="cancelSignupEntry('${signupsEscape(entry.id)}')">Cancel</button></span>` : ""}</li>`;
}

function renderSignupDetail(sheet, slots) {
  const target = document.getElementById("signupDetail");
  if (!target) return;
  target.innerHTML = `
    <div class="signup-detail-head"><button class="koinonia-detail-back" type="button" onclick="closeSignupSheet()">← Signups</button><span class="eyebrow">${signupsEscape(sheet.ministryName)}</span><h2>${signupsEscape(sheet.title)}</h2><p>${signupsEscape(sheet.description || "Choose a slot below to help this ministry.")}</p><div class="signup-detail-meta"><span>${signupsEscape(signupCategoryLabel(sheet.category))}</span><span class="is-${signupsEscape(sheet.status)}">${signupsEscape(sheet.status)}</span></div></div>
    <div class="signup-slot-list">${slots.length ? slots.map((slot) => {
      const full = slot.filledCount >= slot.neededCount;
      const mine = slot.entries.some((entry) => entry.mine);
      return `<article class="signup-slot-card${slot.read ? "" : " is-unread"}"><div class="signup-slot-date"><span>${signupsEscape(signupsDate(slot.slotDate))}</span><em>${Number(slot.filledCount)} of ${Number(slot.neededCount)} filled</em></div><h3>${signupsEscape(slot.label)}</h3>${slot.notes ? `<p>${signupsEscape(slot.notes)}</p>` : ""}<ul>${slot.entries.map(signupEntryHtml).join("")}</ul>${sheet.status === "open" && !mine && !full ? `<button class="btn btn-primary" type="button" data-slot-label="${signupsEscape(slot.label)}" onclick="openSignupClaimModal('${signupsEscape(slot.id)}', this.dataset.slotLabel)">Claim this slot</button>` : full && !mine ? `<button class="btn btn-ghost" type="button" onclick="joinSignupWaitlist('${signupsEscape(slot.id)}')">Join waitlist</button>` : ""}</article>`;
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

function openSignupActionModal(action) {
  const dialog = document.getElementById("signupActionDialog");
  const form = document.getElementById("signupActionForm");
  const text = document.getElementById("signupActionText");
  if (!dialog || !form || !text) return;
  signupsState.pendingAction = action;
  document.getElementById("signupActionSymbol").textContent = action.kind === "coverage" ? "♡" : "✓";
  document.getElementById("signupActionEyebrow").textContent = action.kind === "coverage" ? "Ask your ministry team" : "Signup details";
  document.getElementById("signupActionTitle").textContent = action.kind === "coverage" ? "Request coverage" : `Claim ${action.label || "this slot"}`;
  document.getElementById("signupActionDescription").textContent = action.kind === "coverage"
    ? "Tell your ministry teammates why you need help. Your reason will be included with the request."
    : "Add a detail so the ministry team knows what you plan to bring or do.";
  document.getElementById("signupActionLabel").textContent = action.kind === "coverage" ? "Why do you need coverage?" : "What are you bringing or helping with?";
  document.getElementById("signupActionHint").textContent = action.kind === "coverage" ? "Required · shared only with assigned ministry members" : "Optional · for example, “vegetable lasagna.”";
  document.getElementById("signupActionSubmit").textContent = action.kind === "coverage" ? "Send request" : "Claim this slot";
  text.required = action.kind === "coverage";
  text.minLength = action.kind === "coverage" ? 5 : 0;
  text.placeholder = action.kind === "coverage" ? "For example: I’ll be out of town and need someone to take this shift." : "For example: Vegetable lasagna";
  text.value = action.currentNote || "";
  form.onsubmit = submitSignupActionModal;
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
  window.setTimeout(() => text.focus(), 50);
}

function openSignupClaimModal(slotId, label = "") {
  openSignupActionModal({ kind: "claim", id: slotId, label });
}

function openSignupCoverageModal(entryId, currentNote = "") {
  openSignupActionModal({ kind: "coverage", id: entryId, currentNote });
}

function closeSignupActionModal() {
  const dialog = document.getElementById("signupActionDialog");
  signupsState.pendingAction = null;
  if (!dialog) return;
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

async function submitSignupActionModal(event) {
  event.preventDefault();
  const action = signupsState.pendingAction;
  const text = document.getElementById("signupActionText");
  const submit = document.getElementById("signupActionSubmit");
  if (!action || !text || !submit || !text.reportValidity()) return;
  const submitLabel = action.kind === "coverage" ? "Send request" : "Claim this slot";
  submit.disabled = true;
  submit.textContent = action.kind === "coverage" ? "Sending…" : "Claiming…";
  try {
    if (action.kind === "coverage") await requestSignupCoverage(action.id, text.value);
    else await claimSignupSlot(action.id, text.value);
    closeSignupActionModal();
  } catch (error) {
    signupStatus(error.message || "Unable to complete this signup action.", "error");
  } finally {
    submit.disabled = false;
    submit.textContent = submitLabel;
  }
}

async function claimSignupSlot(slotId, comment = "") {
  try {
    await signupsFetch(`/api/donor/koinonia/signups/slots/${encodeURIComponent(slotId)}/claim`, { method: "POST", body: JSON.stringify({ comment }) });
    await loadSignups();
    await openSignupSheet(signupsState.activeSheetId);
    signupStatus("You’re signed up. Thank you for helping.", "success");
  } catch (error) {
    throw new Error(error.message || "Unable to claim this slot.");
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
async function requestSignupCoverage(entryId,note){try{await signupsFetch(`/api/donor/koinonia/signups/entries/${encodeURIComponent(entryId)}/coverage`,{method:"POST",body:JSON.stringify({note})});await openSignupSheet(signupsState.activeSheetId);signupStatus("Your coverage request was sent to the assigned ministry team.","success");}catch(error){throw new Error(error.message||"Unable to request coverage.");}}

document.addEventListener("DOMContentLoaded", loadSignups);
