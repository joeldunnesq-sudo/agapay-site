const prayerState = { requests: [], settings: null, mineOnly: false, filter: "all", reportRequestId: "" };
// Font Awesome Free hands-praying icon (CC BY 4.0), adapted for inline currentColor use.
const PRAYER_HANDS_ICON = '<svg class="prayer-hands-icon" viewBox="0 0 640 512" aria-hidden="true" focusable="false"><path fill="currentColor" d="M224 296c0 13.3-10.7 24-24 24s-24-10.7-24-24V183.4l88.2-119.7c13.1-17.8 9.3-42.8-8.5-55.9s-42.8-9.3-55.9 8.5l-93.3 126.6A136.1 136.1 0 0 0 80 223.6v110.7l-58.1 19.4A32 32 0 0 0 0 384v96a32 32 0 0 0 40.8 30.7l154.4-44.1A128 128 0 0 0 288 343.5V224a32 32 0 0 0-64 0v72Zm192 0v-72a32 32 0 0 0-64 0v119.6a128 128 0 0 0 92.8 123.1l154.4 44.1A32 32 0 0 0 640 480v-96a32 32 0 0 0-21.9-30.4L560 334.2V223.5a136.1 136.1 0 0 0-26.5-80.7L440.2 16.3c-13.1-17.8-38.1-21.6-55.9-8.5s-21.6 38.1-8.5 55.9L464 183.4V296c0 13.3-10.7 24-24 24s-24-10.7-24-24Z"/></svg>';

function prayerEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function prayerHeaders(extra = { "Content-Type": "application/json" }) {
  return window.MyAgapayShell?.authHeaders(extra) || extra;
}

async function prayerFetch(path, options = {}) {
  const response = await fetch(path, { ...options, headers: prayerHeaders(), cache: "no-store" });
  if (window.MyAgapayShell?.handleUnauthorized(response)) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Unable to load Prayer Requests.");
  return payload;
}

function prayerStatus(message, state = "") {
  const target = document.getElementById("prayerStatus");
  if (!target) return;
  target.hidden = !message;
  target.textContent = message || "";
  if (state) target.dataset.state = state;
  else delete target.dataset.state;
}

function prayerDate(value) {
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  const currentDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const requestDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysAgo = Math.round((currentDay.getTime() - requestDay.getTime()) / 86400000);
  if (daysAgo === 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  if (daysAgo > 1 && daysAgo < 7) return `${daysAgo} days ago`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function prayerStatusLabel(request) {
  if (request.visibility === "clergy_only" && !["archived", "declined"].includes(request.status)) return "Clergy only";
  return ({ pending: "Awaiting review", active: "Parish only", answered: "Answered", flagged: "Under review", declined: "Declined", archived: "Archived" })[request.status] || request.status;
}

function visiblePrayerRequests() {
  if (prayerState.filter === "all") return prayerState.requests;
  return prayerState.requests.filter((request) => request.status === prayerState.filter);
}

function renderPrayerRequests() {
  const target = document.getElementById("prayerRequestList");
  if (!target) return;
  const requests = visiblePrayerRequests();
  if (!requests.length) {
    target.innerHTML = `<div class="koinonia-empty-state prayer-empty-state"><span aria-hidden="true">${PRAYER_HANDS_ICON}</span><strong>${prayerState.mineOnly ? "You have no requests in this view" : "No prayer requests in this view"}</strong><p>${prayerState.mineOnly ? "Share a request whenever you would like your parish to pray with you." : "Choose another filter or return later."}</p>${prayerState.mineOnly ? '<button class="btn btn-gold" type="button" onclick="openPrayerComposer()">Share a request</button>' : ""}</div>`;
    return;
  }
  target.innerHTML = requests.map((request) => {
    const statusClass = `is-${prayerEscape(request.status)}`;
    const name = request.mine ? (request.anonymous ? "You · anonymous to parishioners" : "You") : request.requesterName;
    const canPray = request.visibility === "parish_members" && ["active", "answered"].includes(request.status);
    const canAnswer = request.mine && request.status === "active";
    const canArchive = request.mine && ["pending", "active", "flagged"].includes(request.status);
    const canReport = !request.mine && request.visibility === "parish_members" && ["active", "answered"].includes(request.status);
    return `<article class="prayer-request-card ${statusClass}">
      <header><span class="prayer-request-avatar" aria-hidden="true">${request.anonymous && !request.mine ? "A" : prayerEscape(String(name || "P").slice(0, 1).toUpperCase())}</span><div><strong>${prayerEscape(name)}</strong><small>${prayerEscape(prayerDate(request.createdAt))}</small></div><em>${prayerEscape(prayerStatusLabel(request))}</em></header>
      <p>${prayerEscape(request.body)}</p>
      ${request.status === "declined" && request.declineReason ? `<aside><strong>Parish response</strong><span>${prayerEscape(request.declineReason)}</span></aside>` : ""}
      <footer><span>${canPray ? `${request.prayerCount} parishioner${request.prayerCount === 1 ? "" : "s"} prayed` : "Shared with your parish"}</span><div>${canReport ? `<button class="prayer-report-link" type="button" onclick="openPrayerReport('${prayerEscape(request.id)}')">Report</button>` : ""}${canArchive ? `<button class="prayer-secondary-action" type="button" onclick="archivePrayerRequest('${prayerEscape(request.id)}')">Withdraw</button>` : ""}${canAnswer ? `<button class="prayer-secondary-action" type="button" onclick="markPrayerAnswered('${prayerEscape(request.id)}')">Mark answered</button>` : ""}${canPray ? `<button class="prayer-prayed-button${request.prayedByMe ? " is-prayed" : ""}" type="button" aria-pressed="${request.prayedByMe ? "true" : "false"}" onclick="togglePrayer('${prayerEscape(request.id)}')"><span aria-hidden="true">${PRAYER_HANDS_ICON}</span>${request.prayedByMe ? "Prayed" : "I prayed"}</button>` : ""}</div></footer>
    </article>`;
  }).join("");
}

async function loadPrayerRequests() {
  try {
    const query = prayerState.mineOnly ? "?mine=1" : "";
    const payload = await prayerFetch(`/api/donor/koinonia/prayer-requests${query}`);
    if (!payload) return;
    prayerState.requests = payload.requests || [];
    prayerState.settings = payload.settings || prayerState.settings;
    const notice = document.getElementById("prayerPastoralNotice");
    if (notice && prayerState.settings?.pastoralNotice) notice.textContent = prayerState.settings.pastoralNotice;
    const anonymous = document.getElementById("prayerAnonymousOption");
    if (anonymous) anonymous.hidden = prayerState.settings?.allowAnonymous === false;
    renderPrayerRequests();
    prayerStatus("");
  } catch (error) {
    prayerStatus(error.message || "Unable to load prayer requests.", "error");
  }
}

function setPrayerFilter(filter, button) {
  prayerState.filter = ["all", "active", "answered"].includes(filter) ? filter : "all";
  document.querySelectorAll("[data-prayer-filter]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
  renderPrayerRequests();
}

function toggleMyPrayerRequests(button) {
  prayerState.mineOnly = !prayerState.mineOnly;
  button?.setAttribute("aria-pressed", String(prayerState.mineOnly));
  void loadPrayerRequests();
}

function openPrayerComposer() {
  const dialog = document.getElementById("prayerComposerDialog");
  if (!dialog) return;
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
  window.setTimeout(() => document.getElementById("prayerRequestBody")?.focus(), 50);
}

function closePrayerComposer() {
  const dialog = document.getElementById("prayerComposerDialog");
  if (!dialog) return;
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
  document.getElementById("prayerComposerForm")?.reset();
}

async function submitPrayerRequest(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const button = document.getElementById("prayerSubmitButton");
  const body = document.getElementById("prayerRequestBody")?.value.trim() || "";
  const visibility = form.elements.prayerVisibility?.value || "parish_members";
  const anonymous = Boolean(document.getElementById("prayerAnonymous")?.checked);
  if (button) { button.disabled = true; button.textContent = "Sharing…"; }
  try {
    const payload = await prayerFetch("/api/donor/koinonia/prayer-requests", { method: "POST", body: JSON.stringify({ body, visibility, anonymous }) });
    closePrayerComposer();
    prayerState.mineOnly = true;
    const mineButton = document.getElementById("prayerMineFilter");
    if (mineButton) mineButton.setAttribute("aria-pressed", "true");
    await loadPrayerRequests();
    prayerStatus(payload?.approvalRequired ? "Your request was sent to the parish for review." : (visibility === "clergy_only" ? "Your request was shared privately with the parish dashboard team." : "Your request is now on the parish prayer list."), "success");
  } catch (error) {
    prayerStatus(error.message || "Unable to share this prayer request.", "error");
  } finally {
    if (button) { button.disabled = false; button.textContent = "Share request"; }
  }
}

async function togglePrayer(requestId) {
  try {
    const payload = await prayerFetch(`/api/donor/koinonia/prayer-requests/${encodeURIComponent(requestId)}/pray`, { method: "POST", body: "{}" });
    const request = prayerState.requests.find((item) => item.id === requestId);
    if (request && payload) {
      request.prayedByMe = Boolean(payload.prayed);
      request.prayerCount = Number(payload.prayerCount || 0);
      renderPrayerRequests();
    }
  } catch (error) {
    prayerStatus(error.message || "Unable to record your prayer.", "error");
  }
}

async function updateOwnPrayer(requestId, status) {
  await prayerFetch(`/api/donor/koinonia/prayer-requests/${encodeURIComponent(requestId)}`, { method: "PATCH", body: JSON.stringify({ status }) });
  await loadPrayerRequests();
}

async function markPrayerAnswered(requestId) {
  try {
    await updateOwnPrayer(requestId, "answered");
    prayerStatus("Your request is now marked answered. Thanks be to God.", "success");
  } catch (error) {
    prayerStatus(error.message || "Unable to mark this request answered.", "error");
  }
}

async function archivePrayerRequest(requestId) {
  if (!window.confirm("Withdraw this prayer request from the active list?")) return;
  try {
    await updateOwnPrayer(requestId, "archived");
    prayerStatus("Your prayer request was withdrawn.", "success");
  } catch (error) {
    prayerStatus(error.message || "Unable to withdraw this request.", "error");
  }
}

function openPrayerReport(requestId) {
  prayerState.reportRequestId = requestId;
  const dialog = document.getElementById("prayerReportDialog");
  if (!dialog) return;
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function closePrayerReport() {
  prayerState.reportRequestId = "";
  const dialog = document.getElementById("prayerReportDialog");
  if (!dialog) return;
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
  document.getElementById("prayerReportForm")?.reset();
}

async function submitPrayerReport(event) {
  event.preventDefault();
  const requestId = prayerState.reportRequestId;
  if (!requestId) return;
  const button = document.getElementById("prayerReportButton");
  const reason = document.getElementById("prayerReportReason")?.value || "Needs parish review";
  if (button) button.disabled = true;
  try {
    await prayerFetch(`/api/donor/koinonia/prayer-requests/${encodeURIComponent(requestId)}/report`, { method: "POST", body: JSON.stringify({ reason }) });
    closePrayerReport();
    prayerStatus("Your report was sent privately to the parish dashboard team.", "success");
    await loadPrayerRequests();
  } catch (error) {
    prayerStatus(error.message || "Unable to send this report.", "error");
  } finally {
    if (button) button.disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  void prayerFetch("/api/donor/koinonia/community-tools/prayers/opened", { method: "POST", body: "{}" }).catch(() => null);
  void loadPrayerRequests();
});
