const exchangeState = { listings: [], activeListingId: "", activeThreadId: "", threads: [], messages: [], mineOnly: false };
const exchangeObjectUrls = new Map();
let requestedExchangeListingId = new URLSearchParams(window.location.search).get("listing") || "";
let requestedExchangeThreadId = new URLSearchParams(window.location.search).get("thread") || "";

function exchangeEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function exchangeHeaders(extra = { "Content-Type": "application/json" }) {
  return window.MyAgapayShell?.authHeaders(extra) || extra;
}

function exchangeStatus(message, state = "") {
  const target = document.getElementById("exchangeStatus");
  if (!target) return;
  target.hidden = !message;
  target.textContent = message || "";
  if (state) target.dataset.state = state;
  else delete target.dataset.state;
}

function exchangeCategoryLabel(value) {
  return ({ household_goods: "Household goods", furniture: "Furniture", clothing: "Clothing", books: "Books", children_baby: "Children & baby", tools: "Tools", services: "Services", other: "Other" })[value] || "Other";
}

function exchangeMoney(cents) {
  return cents == null ? "Free / not listed" : new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(Number(cents) / 100);
}

function exchangeDate(value, withTime = false) {
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, withTime
    ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
    : { month: "short", day: "numeric", year: "numeric" }).format(date);
}

async function exchangeFetch(path, options = {}) {
  const response = await fetch(path, { ...options, headers: exchangeHeaders(), cache: "no-store" });
  if (window.MyAgapayShell?.handleUnauthorized(response)) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Unable to load Koinonia Exchange.");
  return payload;
}

function releaseExchangeObjectUrls() {
  exchangeObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  exchangeObjectUrls.clear();
}

async function privateExchangePhoto(url) {
  const response = await fetch(url, { headers: exchangeHeaders({}), cache: "no-store" });
  if (window.MyAgapayShell?.handleUnauthorized(response)) return null;
  if (!response.ok) throw new Error("Unable to load this private listing photo.");
  return response.blob();
}

async function hydrateExchangePhotos() {
  const images = [...document.querySelectorAll("[data-exchange-photo]")];
  await Promise.all(images.map(async (image) => {
    try {
      const blob = await privateExchangePhoto(image.dataset.photoUrl);
      if (!blob || !image.isConnected) return;
      const objectUrl = URL.createObjectURL(blob);
      exchangeObjectUrls.set(`${image.dataset.exchangePhoto}:${Math.random()}`, objectUrl);
      image.src = objectUrl;
      image.closest(".exchange-photo-frame")?.classList.add("is-loaded");
    } catch {
      image.closest(".exchange-photo-frame")?.classList.add("is-unavailable");
    }
  }));
}

function exchangePhotoHtml(listing, size = "card") {
  const photo = listing.photos?.[0];
  return `<span class="exchange-photo-frame is-${size}">${photo ? `<img data-exchange-photo="${exchangeEscape(photo.id)}" data-photo-url="${exchangeEscape(photo.url)}" alt="Photo for ${exchangeEscape(listing.title)}" />` : '<span aria-hidden="true">⇄</span>'}</span>`;
}

function syncExchangeUrl(listingId = "", threadId = "") {
  const url = new URL(window.location.href);
  if (listingId) url.searchParams.set("listing", listingId); else url.searchParams.delete("listing");
  if (threadId) url.searchParams.set("thread", threadId); else url.searchParams.delete("thread");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function renderExchangeListings() {
  const target = document.getElementById("exchangeListings");
  if (!target) return;
  releaseExchangeObjectUrls();
  if (!exchangeState.listings.length) {
    target.innerHTML = `<div class="koinonia-empty-state"><strong>${exchangeState.mineOnly ? "You have no listings yet" : "No active listings"}</strong><p>${exchangeState.mineOnly ? "Post an offer or request when you’re ready." : "Be the first parishioner to share an offer or request."}</p></div>`;
    return;
  }
  target.innerHTML = exchangeState.listings.map((listing) => `
    <button type="button" class="exchange-listing-card${listing.id === exchangeState.activeListingId ? " is-active" : ""}" onclick="openExchangeListing('${exchangeEscape(listing.id)}')">
      ${exchangePhotoHtml(listing)}
      <span class="exchange-listing-copy"><span class="exchange-listing-flags"><em class="is-${exchangeEscape(listing.listingType)}">${listing.listingType === "offer" ? "Offer" : "Request"}</em>${listing.status !== "active" ? `<em>${exchangeEscape(listing.status)}</em>` : ""}</span><strong>${exchangeEscape(listing.title)}</strong><small>${exchangeEscape(exchangeCategoryLabel(listing.category))} · ${exchangeEscape(listing.posterName)}</small><b>${exchangeEscape(exchangeMoney(listing.priceCents))}</b></span>
    </button>
  `).join("");
  void hydrateExchangePhotos();
}

function exchangeThreadListHtml(threads) {
  if (!threads.length) return '<div class="koinonia-empty-state"><strong>No conversations yet</strong><p>When a parishioner messages about this listing, the conversation will appear here.</p></div>';
  return `<div class="exchange-thread-list">${threads.map((thread) => `<button type="button" onclick="openExchangeThread('${exchangeEscape(thread.id)}')"><span><strong>${exchangeEscape(thread.requesterName)}</strong><small>${exchangeEscape(exchangeDate(thread.updatedAt, true))}</small></span><em>${exchangeEscape(thread.status)}</em></button>`).join("")}</div>`;
}

function renderExchangeDetail(listing) {
  const target = document.getElementById("exchangeDetail");
  if (!target) return;
  const action = listing.mine
    ? `<div class="exchange-owner-actions">${listing.status === "active" ? `<button class="btn btn-primary" type="button" onclick="completeExchangeListing('${exchangeEscape(listing.id)}')">Mark completed</button><button class="btn btn-ghost" type="button" onclick="loadExchangeThreads('${exchangeEscape(listing.id)}')">View conversations</button>` : ""}</div>`
    : listing.status === "active" ? `<button class="btn btn-gold exchange-message-poster" type="button" onclick="startExchangeThread('${exchangeEscape(listing.id)}')">Message poster in AGAPAY</button>` : "";
  target.innerHTML = `
    <div class="exchange-detail-head"><button class="koinonia-detail-back" type="button" onclick="closeExchangeDetail()">← Exchange</button>${exchangePhotoHtml(listing, "detail")}<div class="exchange-detail-flags"><em class="is-${exchangeEscape(listing.listingType)}">${listing.listingType === "offer" ? "Offer" : "Request"}</em><em>${exchangeEscape(exchangeCategoryLabel(listing.category))}</em>${listing.mine ? "<em>Your listing</em>" : ""}</div><h2>${exchangeEscape(listing.title)}</h2><p>${exchangeEscape(listing.description || "No additional description was provided.")}</p><dl><div><dt>Posted by</dt><dd>${listing.mine ? "You" : exchangeEscape(listing.posterName)}</dd></div><div><dt>Price</dt><dd>${exchangeEscape(exchangeMoney(listing.priceCents))}</dd></div>${listing.expiresAt ? `<div><dt>Expires</dt><dd>${exchangeEscape(exchangeDate(listing.expiresAt))}</dd></div>` : ""}</dl>${action}<small class="exchange-safety-note">Keep contact in this in-app conversation. AGAPAY does not reveal phone numbers or email addresses and does not process payment.</small></div>
    <section class="exchange-conversation-panel" id="exchangeConversationPanel">${listing.mine ? '<div class="koinonia-empty-state"><strong>Private conversations</strong><p>Select View conversations to see messages about this listing.</p></div>' : '<div class="koinonia-empty-state"><strong>Interested?</strong><p>Message the poster privately without sharing your email or phone number.</p></div>'}</section>
  `;
  void hydrateExchangePhotos();
}

function renderExchangeMessages(thread, messages) {
  const panel = document.getElementById("exchangeConversationPanel");
  if (!panel) return;
  const otherName = thread.mine ? "Listing poster" : thread.requesterName;
  panel.innerHTML = `
    <div class="exchange-thread-head"><div><span class="eyebrow">Private conversation</span><h3>${exchangeEscape(thread.listingTitle)}</h3><p>Conversation with ${exchangeEscape(otherName || "a parish member")}</p></div><span>${exchangeEscape(thread.status)}</span></div>
    <div class="exchange-message-list" id="exchangeMessageList">${messages.length ? messages.map((message) => `<article class="exchange-message ${message.mine ? "is-mine" : "is-theirs"}${message.read ? "" : " is-unread"}"><strong>${message.mine ? "You" : exchangeEscape(message.senderName)}</strong><p>${exchangeEscape(message.body)}</p><time>${exchangeEscape(exchangeDate(message.createdAt, true))}</time></article>`).join("") : '<div class="koinonia-empty-state"><strong>No messages yet</strong><p>Start the conversation below.</p></div>'}</div>
    ${thread.status === "open" && thread.listingStatus === "active" ? `<form class="exchange-message-form" onsubmit="sendExchangeMessage(event,'${exchangeEscape(thread.id)}')"><label for="exchangeMessageBody">Message</label><textarea id="exchangeMessageBody" maxlength="2000" rows="3" required placeholder="Ask about condition, timing, payment, or pickup…"></textarea><button class="btn btn-gold" type="submit">Send privately</button></form>` : '<p class="exchange-thread-closed">This conversation is closed.</p>'}
  `;
  const list = document.getElementById("exchangeMessageList");
  if (list) list.scrollTop = list.scrollHeight;
}

function toggleExchangeComposer(open) {
  const panel = document.getElementById("exchangeComposer");
  if (!panel) return;
  panel.hidden = !open;
  if (open) panel.querySelector("input,select")?.focus();
}

function toggleMyExchangeListings(button) {
  exchangeState.mineOnly = !exchangeState.mineOnly;
  button?.setAttribute("aria-pressed", String(exchangeState.mineOnly));
  button?.classList.toggle("is-active", exchangeState.mineOnly);
  void loadExchangeListings();
}

async function loadExchangeListings() {
  const type = document.getElementById("exchangeTypeFilter")?.value || "";
  const category = document.getElementById("exchangeCategoryFilter")?.value || "";
  const query = new URLSearchParams();
  if (type) query.set("type", type);
  if (category) query.set("category", category);
  if (exchangeState.mineOnly) query.set("mine", "1");
  try {
    const data = await exchangeFetch(`/api/donor/koinonia/exchange/listings?${query}`);
    if (!data) return;
    exchangeState.listings = data.listings || [];
    renderExchangeListings();
    exchangeStatus("");
    if (requestedExchangeListingId && exchangeState.listings.some(({ id }) => id === requestedExchangeListingId)) {
      const listingId = requestedExchangeListingId;
      requestedExchangeListingId = "";
      await openExchangeListing(listingId);
      if (requestedExchangeThreadId) {
        const threadId = requestedExchangeThreadId;
        requestedExchangeThreadId = "";
        await openExchangeThread(threadId);
      }
    }
  } catch (error) {
    exchangeStatus(error.message || "Unable to load Exchange listings.", "error");
  }
}

async function openExchangeListing(listingId) {
  const listing = exchangeState.listings.find(({ id }) => id === listingId);
  if (!listing) return;
  exchangeState.activeListingId = listingId;
  exchangeState.activeThreadId = "";
  syncExchangeUrl(listingId);
  document.body.classList.add("is-koinonia-detail-open");
  renderExchangeListings();
  renderExchangeDetail(listing);
}

function closeExchangeDetail() {
  exchangeState.activeListingId = "";
  exchangeState.activeThreadId = "";
  syncExchangeUrl();
  document.body.classList.remove("is-koinonia-detail-open");
  renderExchangeListings();
  document.getElementById("exchangeDetail").innerHTML = '<div class="koinonia-empty-state"><strong>Select a listing</strong><p>Open a listing to see its details and start a private conversation.</p></div>';
}

async function uploadExchangePhoto(listingId, file) {
  const response = await fetch(`/api/donor/koinonia/exchange/listings/${encodeURIComponent(listingId)}/photos`, {
    method: "POST",
    headers: exchangeHeaders({ "Content-Type": file.type, "X-AGAPAY-Attachment-Bytes": String(file.size) }),
    body: file,
  });
  if (window.MyAgapayShell?.handleUnauthorized(response)) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Unable to upload a listing photo.");
  return payload;
}

async function createExchangeListing(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const files = [...(document.getElementById("exchangePhotos")?.files || [])];
  if (files.length > 5) { exchangeStatus("Choose up to 5 listing photos.", "error"); return; }
  const invalid = files.find((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024);
  if (invalid) { exchangeStatus("Listing photos must be JPG, PNG, or WebP and 10MB or smaller.", "error"); return; }
  if (button) button.disabled = true;
  try {
    const price = document.getElementById("exchangePrice").value;
    const expires = document.getElementById("exchangeExpires").value;
    const data = await exchangeFetch("/api/donor/koinonia/exchange/listings", {
      method: "POST",
      body: JSON.stringify({
        listingType: document.getElementById("exchangeListingType").value,
        category: document.getElementById("exchangeCategory").value,
        title: document.getElementById("exchangeTitle").value,
        description: document.getElementById("exchangeDescription").value,
        priceCents: price === "" ? null : Math.round(Number(price) * 100),
        expiresAt: expires ? new Date(`${expires}T23:59:59`).getTime() : null,
      }),
    });
    if (!data) return;
    for (const file of files) await uploadExchangePhoto(data.listingId, file);
    form.reset();
    setDefaultExchangeExpiry();
    toggleExchangeComposer(false);
    exchangeState.mineOnly = false;
    const mineButton = document.getElementById("exchangeMineFilter");
    mineButton?.setAttribute("aria-pressed", "false");
    mineButton?.classList.remove("is-active");
    document.getElementById("exchangeTypeFilter").value = "";
    document.getElementById("exchangeCategoryFilter").value = "";
    await loadExchangeListings();
    await openExchangeListing(data.listingId);
    exchangeStatus("Your listing is live in the parish Exchange.", "success");
  } catch (error) {
    exchangeStatus(error.message || "Unable to create this listing.", "error");
  } finally {
    if (button) button.disabled = false;
  }
}

async function completeExchangeListing(listingId) {
  try {
    const data = await exchangeFetch(`/api/donor/koinonia/exchange/listings/${encodeURIComponent(listingId)}/complete`, { method: "POST", body: "{}" });
    if (!data) return;
    exchangeState.mineOnly = true;
    const mineButton = document.getElementById("exchangeMineFilter");
    mineButton?.setAttribute("aria-pressed", "true");
    mineButton?.classList.add("is-active");
    await loadExchangeListings();
    await openExchangeListing(listingId);
    exchangeStatus(`Listing completed. ${Number(data.threadsClosed || 0)} open conversation${Number(data.threadsClosed || 0) === 1 ? " was" : "s were"} closed.`, "success");
  } catch (error) {
    exchangeStatus(error.message || "Unable to complete this listing.", "error");
  }
}

async function startExchangeThread(listingId) {
  try {
    const data = await exchangeFetch(`/api/donor/koinonia/exchange/listings/${encodeURIComponent(listingId)}/threads`, { method: "POST", body: "{}" });
    if (!data) return;
    await openExchangeThread(data.threadId);
  } catch (error) {
    exchangeStatus(error.message || "Unable to start this conversation.", "error");
  }
}

async function loadExchangeThreads(listingId) {
  try {
    const data = await exchangeFetch(`/api/donor/koinonia/exchange/listings/${encodeURIComponent(listingId)}/threads`);
    if (!data) return;
    exchangeState.threads = data.threads || [];
    document.getElementById("exchangeConversationPanel").innerHTML = exchangeThreadListHtml(exchangeState.threads);
  } catch (error) {
    exchangeStatus(error.message || "Unable to load listing conversations.", "error");
  }
}

async function openExchangeThread(threadId) {
  try {
    const data = await exchangeFetch(`/api/donor/koinonia/exchange/threads/${encodeURIComponent(threadId)}/messages`);
    if (!data) return;
    exchangeState.activeThreadId = threadId;
    exchangeState.messages = data.messages || [];
    syncExchangeUrl(exchangeState.activeListingId || data.thread.listingId, threadId);
    renderExchangeMessages(data.thread, exchangeState.messages);
    await Promise.all(exchangeState.messages.filter((message) => !message.mine && !message.read).map((message) => exchangeFetch(`/api/donor/koinonia/exchange/threads/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(message.id)}/read`, { method: "POST", body: "{}" }).catch(() => null)));
  } catch (error) {
    exchangeStatus(error.message || "Unable to open this conversation.", "error");
  }
}

async function sendExchangeMessage(event, threadId) {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type="submit"]');
  const body = document.getElementById("exchangeMessageBody")?.value || "";
  if (button) button.disabled = true;
  try {
    await exchangeFetch(`/api/donor/koinonia/exchange/threads/${encodeURIComponent(threadId)}/messages`, { method: "POST", body: JSON.stringify({ body }) });
    await openExchangeThread(threadId);
    exchangeStatus("Message sent privately.", "success");
  } catch (error) {
    exchangeStatus(error.message || "Unable to send this message.", "error");
  } finally {
    if (button) button.disabled = false;
  }
}

function setDefaultExchangeExpiry() {
  const input = document.getElementById("exchangeExpires");
  if (!input || input.value) return;
  const date = new Date();
  date.setDate(date.getDate() + 30);
  input.value = date.toISOString().slice(0, 10);
}

document.addEventListener("DOMContentLoaded", () => {
  setDefaultExchangeExpiry();
  void loadExchangeListings();
});

window.addEventListener("beforeunload", releaseExchangeObjectUrls);
