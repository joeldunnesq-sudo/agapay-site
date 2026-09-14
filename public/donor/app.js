const donorStore = {
  email: window.AGAPAYDonorSession.storageKeys.email,
  token: window.AGAPAYDonorSession.storageKeys.token,
  donor: window.AGAPAYDonorSession.storageKeys.profile,
  cachePrefix: "agapayDonorCache",
  shellVersion: "agapayDonorShellVersion"
};

const DONOR_SHELL_VERSION = "2026-08-01-atomic-page-hydration";

async function refreshStaleDashboardShell() {
  if (!("serviceWorker" in navigator) || !("caches" in window)) return;
  if (!location.pathname.startsWith("/myagapay") && !location.pathname.startsWith("/donor")) return;
  if (localStorage.getItem(donorStore.shellVersion) === DONOR_SHELL_VERSION) return;

  localStorage.setItem(donorStore.shellVersion, DONOR_SHELL_VERSION);
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("agapay-static-")).map((key) => caches.delete(key)));
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.update().catch(() => null)));
  } catch {
    // Cache refresh should never block the dashboard.
  }
  if (navigator.serviceWorker.controller) location.reload();
}

refreshStaleDashboardShell();

function donorSession() {
  return window.AGAPAYDonorSession.session();
}

function donorAuthHeaders(extra = {}) {
  return window.AGAPAYDonorSession.authHeaders({ "Content-Type": "application/json", ...extra });
}

async function donorApi(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: options.headers || donorAuthHeaders()
  });
  const publicAuthRequest = [
    "/api/donor/login",
    "/api/donor/signup",
    "/api/donor/verify",
    "/api/donor/password-reset-request",
    "/api/donor/password-reset-confirm"
  ].some((route) => String(path).startsWith(route));
  if (!publicAuthRequest && window.MyAgapayShell?.handleUnauthorized?.(res)) {
    return new Promise(() => {});
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || data.detail || "AGAPAY request failed");
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function setDonorStatus(message, tone = "info") {
  ["donorStatus", "desktopDonorStatus"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const isBookstoreToast = id === "donorStatus" && document.body?.classList.contains("donor-bookstore-page");
    if (isBookstoreToast) {
      window.clearTimeout(el.bookstoreToastTimer);
      window.clearTimeout(el.bookstoreToastCleanupTimer);
      el.textContent = message || "";
      el.className = message ? `notice ${tone} bookstore-toast` : "notice bookstore-toast";
      el.setAttribute("role", tone === "error" ? "alert" : "status");
      el.setAttribute("aria-live", tone === "error" ? "assertive" : "polite");
      if (!message) {
        el.classList.remove("is-visible");
        el.hidden = true;
        el.style.display = "none";
        return;
      }
      el.hidden = false;
      el.style.display = "block";
      window.requestAnimationFrame(() => el.classList.add("is-visible"));
      if (tone !== "error") {
        el.bookstoreToastTimer = window.setTimeout(() => {
          el.classList.remove("is-visible");
          el.bookstoreToastCleanupTimer = window.setTimeout(() => {
            el.hidden = true;
            el.style.display = "none";
          }, 240);
        }, 2800);
      }
      return;
    }
    el.textContent = message || "";
    el.className = message ? `notice ${tone}` : "notice";
    el.style.display = message ? "block" : "none";
  });
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function setHtml(id, value) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = value;
}

function isDonorUnauthorized(err) {
  return err?.status === 401 || String(err?.message || "").toLowerCase() === "unauthorized";
}

function redirectToMyAgapayLogin(reason = "expired") {
  if (window.MyAgapayShell?.redirectToLogin) {
    window.MyAgapayShell.redirectToLogin(reason);
    return true;
  }
  clearDonorSession();
  const next = `${window.location.pathname}${window.location.search || ""}`;
  const loginUrl = new URL("/myagapay/login", window.location.origin);
  loginUrl.searchParams.set("next", next);
  if (reason) loginUrl.searchParams.set("reason", reason);
  window.location.replace(loginUrl.toString());
  return true;
}

function donorLoginReturnPath() {
  const params = new URLSearchParams(window.location.search);
  const next = params.get("next") || "/myagapay/";

  // Keep My AGAPAY PWA navigation inside its installed scope.
  // /donor/* is legacy/out-of-scope and can cause Android to open a browser header.
  return next.startsWith("/myagapay/")
    ? next
    : "/myagapay/";
}

function donorCacheEmail() {
  return String(donorSession().email || donorProfile()?.email || "").trim().toLowerCase();
}

function donorCacheKey(name) {
  return `${donorStore.cachePrefix}:${donorCacheEmail()}:${name}`;
}

function readDonorCache(name, { maxAgeMs = 0 } = {}) {
  const email = donorCacheEmail();
  if (!email) return null;
  try {
    const cached = JSON.parse(localStorage.getItem(donorCacheKey(name)) || "null");
    if (cached?.email !== email) return null;
    if (maxAgeMs > 0) {
      const savedAt = new Date(cached.savedAt || 0).getTime();
      if (!Number.isFinite(savedAt) || Date.now() - savedAt > maxAgeMs) return null;
    }
    return cached.data;
  } catch {
    return null;
  }
}

function writeDonorCache(name, data) {
  const email = donorCacheEmail();
  if (!email || !data) return;
  try {
    localStorage.setItem(donorCacheKey(name), JSON.stringify({
      email,
      savedAt: new Date().toISOString(),
      data
    }));
  } catch {
    // Cache is only for instant paint; ignore storage pressure or privacy mode.
  }
}

function clearDonorCache(name) {
  try {
    localStorage.removeItem(donorCacheKey(name));
  } catch {
    // Cache cleanup must never block the live dashboard.
  }
}

function money(cents) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format((Number(cents) || 0) / 100);
}

function donorInitials(donor) {
  const source = donor?.householdName || donor?.donorName || donor?.email || "Faithful Member";
  const words = String(source).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "FM";
  if (words.length === 1 && words[0].includes("@")) return words[0].slice(0, 2).toUpperCase();
  return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

function donorDisplayName(donor) {
  if (donor?.householdName) return donor.householdName;
  if (donor?.donorName) return donor.donorName;
  if (donor?.email) return donor.email.split("@")[0];
  return "Faithful Member";
}

function shortDate(value) {
  if (!value) return "No date";
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    const [year, month, day] = String(value).split("-").map((part) => Number(part));
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(year, month - 1, day));
  }
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function calendarLabel(value) {
  return window.AGAPAYLiturgicalCalendar?.calendarLabel(value)
    || (String(value || "julian").toLowerCase().includes("gregorian") ? "Revised-Julian" : "Julian");
}

function nextFeastForCalendar(calendar) {
  return window.AGAPAYLiturgicalCalendar?.nextLiturgicalFeast(calendar, new Date()) || null;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function donorProfile() {
  return window.AGAPAYDonorSession.profile();
}

function setDonorProfile(donor) {
  if (!donor) return;
  window.AGAPAYDonorSession.setProfile(donor);
  const name = donor.householdName || donor.donorName || donor.email || "AGAPAY faithful";
  const profileName = document.getElementById("profileName");
  const profileMeta = document.getElementById("profileMeta");
  if (profileName) profileName.textContent = name;
  if (profileMeta) profileMeta.textContent = donor.defaultParishId ? `${donor.email} - ${donor.defaultParishId}` : donor.email || "Faithful account loaded";
  setText("donorHomeTopbarName", donorDisplayName(donor));
  document.querySelectorAll(".mobile-avatar, .desktop-avatar").forEach((avatar) => {
    avatar.textContent = donorInitials(donor);
  });
  const greeting = document.getElementById("greeting");
  if (greeting) greeting.textContent = `Welcome, ${donorDisplayName(donor)}`;
  const desktopGreeting = document.getElementById("desktopGreeting");
  if (desktopGreeting) desktopGreeting.textContent = `Welcome, ${donorDisplayName(donor)}`;
  updateDonorAuthState();
}

function updateDonorAuthState() {
  const session = donorSession();
  const signedIn = Boolean(session.email && session.token);
  document.querySelectorAll("[data-auth-guest]").forEach((el) => {
    el.hidden = signedIn;
  });
  document.querySelectorAll("[data-auth-required]").forEach((el) => {
    el.hidden = !signedIn;
  });
}

function saveDonorSession(data) {
  window.AGAPAYDonorSession.saveSession(data);
  if (data?.donor) setDonorProfile(data.donor);
  updateDonorAuthState();
}

function clearDonorSession() {
  window.AGAPAYDonorSession.clearSession();
  updateDonorAuthState();
}

function logoutDonor() {
  clearDonorSession();
  window.location.href = "/myagapay/login";
}

function closeDonorAccountMenus() {
  document.querySelectorAll("[data-donor-account-toggle]").forEach((button) => {
    button.setAttribute("aria-expanded", "false");
  });
  document.querySelectorAll(".donor-home-account-dropdown").forEach((panel) => {
    panel.hidden = true;
  });
}

function showGuestDonorDashboard() {
  setDonorStatus("");
  setText("profileName", "Faithful Account");
  setText("profileMeta", "Sign in to load live giving history");
  setText("donorHomeTopbarName", "Faithful Member");
  setText("greeting", "Welcome, Faithful Member");
  setText("desktopGreeting", "Welcome, Faithful Member");
  setText("myAgapayGreetingName", "Faithful Member");
  setText("myAgapayDefaultParish", "Choose a church in Settings");
  setText("myAgapayLearnPlanner", "Ready");
  setText("myAgapayLearnTerm", "Set up term");
  setHtml("myAgapayLearnTier", "Limited Free");
  setText("myAgapayGivingParish", "Choose church");
  setText("myAgapayRecurringCount", "0 Active");
  setText("myAgapayRecentAmount", "$0");
  setText("myAgapayGivingMonth", "$0");
  setText("myAgapaySnapshotMonth", "$0");
  setText("myAgapaySnapshotRecurring", "0");
  setText("myAgapaySnapshotCommemorations", "0");
  setText("donorParishName", "");
  setText("desktopParishName", "Sign in to load your church, giving history, and saved offering preferences.");
  setText("metricMonth", "$0");
  setText("metricYtd", "$0");
  setText("metricOfferings", "0");
  setText("metricCommemorations", "0");
  setText("metricRecurring", "0");
  setText("desktopMetricMonth", "$0");
  setText("desktopMetricYtd", "$0");
  setText("desktopMetricOfferings", "0");
  setText("desktopMetricCommemorations", "0");
  const recent = document.getElementById("recentOfferings");
  if (recent) recent.innerHTML = "";
  const desktopRecent = document.getElementById("desktopRecentOfferings");
  if (desktopRecent) desktopRecent.innerHTML = "";
  const myAgapayActivity = document.getElementById("myAgapayActivity");
  if (myAgapayActivity) {
    myAgapayActivity.innerHTML = `
      <div class="my-agapay-activity-item">
        <span class="activity-dot">+</span>
        <div><strong>Sign in to load your AGAPAY activity</strong><span>Your giving, learning, and organization updates will appear here.</span></div>
        <a class="activity-amount" href="/myagapay/login">Log in</a>
      </div>
    `;
  }
  renderActiveCampaigns(null, { confirmed: true });
  renderNextFeast(null, { confirmed: true });
  renderActiveFunds(null, { confirmed: true });
  updateQuickGiveLinks(null);
  updateDonorAuthState();
}

async function loadPublicParishes(selectId = "parish") {
  const select = document.getElementById(selectId);
  if (!select) return [];
  const cached = readDonorCache("parishes");
  if (Array.isArray(cached?.parishes) && cached.parishes.length) {
    window.agapayPublicParishes = cached.parishes;
    const donor = donorProfile();
    renderParishOptions(select, cached.parishes, donor.defaultParishId || select.value);
    if (selectId === "parish" && typeof toggleGiftDetailFields === "function") toggleGiftDetailFields();
  }
  try {
    const parishes = await fetchPublicParishes();
    window.agapayPublicParishes = parishes;
    writeDonorCache("parishes", { parishes });
    if (parishes.length) {
      const donor = donorProfile();
      renderParishOptions(select, parishes, donor.defaultParishId || select.value);
    }
    if (selectId === "parish" && typeof toggleGiftDetailFields === "function") toggleGiftDetailFields();
    return parishes;
  } catch {
    return [];
  }
}

async function fetchPublicParishes() {
  const parishes = [];
  let cursor = "";
  do {
    const params = new URLSearchParams({ limit: "250" });
    if (cursor) params.set("cursor", cursor);
    const data = await donorApi(`/api/parishes?${params.toString()}`, { headers: { Accept: "application/json" } });
    parishes.push(...(data.parishes || []));
    cursor = data.cursor || "";
  } while (cursor);
  return parishes;
}

function parishOptionLabel(parish) {
  const place = [parish.city, parish.state].filter(Boolean).join(", ");
  const type = parish.type ? `${parish.type.charAt(0).toUpperCase()}${parish.type.slice(1)}` : "Church";
  return [parish.name, place, type].filter(Boolean).join(" - ");
}

function renderParishOptions(select, parishes, selectedValue = "", query = "") {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  const filtered = parishes.filter((parish) => {
    const haystack = [parish.name, parish.city, parish.state, parish.type, parish.jurisdictionLabel, parish.jurisdiction]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return !normalizedQuery || haystack.includes(normalizedQuery);
  });
  const placeholder = select.dataset.placeholder || "Choose your parish";
  const options = [`<option value="">${escapeHtml(placeholder)}</option>`].concat(
    filtered.map((parish) => `<option value="${escapeHtml(parish.id)}">${escapeHtml(parishOptionLabel(parish))}</option>`)
  );
  select.innerHTML = options.join("");
  if (selectedValue && filtered.some((parish) => parish.id === selectedValue)) select.value = selectedValue;
}

function filterParishSelect(searchId, selectId) {
  const select = document.getElementById(selectId);
  const search = document.getElementById(searchId);
  if (!select || !search) return;
  renderParishOptions(select, window.agapayPublicParishes || [], select.value, search.value);
}

function donorGiftUrl(giftType, parish, extra = {}) {
  const params = new URLSearchParams({ giftType: normalizeDonorGiftType(giftType) });
  if (parish?.id) params.set("parish", parish.id);
  Object.entries(extra).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return `/myagapay/giving/give?${params.toString()}`;
}

function quickDonorGiftUrl(giftType, parish, extra = {}) {
  return donorGiftUrl(giftType, parish, { quick: "1", ...extra });
}

function normalizeDonorGiftType(value) {
  const normalized = String(value || "stewardship").toLowerCase();
  const aliases = {
    alms: "feast",
    candle: "candles",
    love: "commemoration",
    memorial: "commemoration",
    memorials: "commemoration",
    funds: "fund"
  };
  return aliases[normalized] || normalized;
}

function isGivingPlusGiftType(value) {
  return ["fund", "candles", "commemoration", "campaign", "feast"].includes(normalizeDonorGiftType(value));
}

function parishHasGivingPlus(parish) {
  return Boolean(parish?.givingPlusEnabled);
}

function isGeneralDonorFund(fund = {}) {
  return [fund.id, fund.code, fund.reportCode, fund.name]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase())
    .some((value) => ["general", "stewardship", "general operating fund", "general stewardship"].includes(value));
}

function isCandleDonorFund(fund = {}) {
  return [fund.id, fund.code, fund.reportCode, fund.name]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase())
    .some((value) => ["candle", "candles", "candles / vigil lights", "candle fund"].includes(value));
}

function parishCanUseGiftType(parish, value) {
  const giftType = normalizeDonorGiftType(value);
  if (giftType === "stewardship") return true;
  if (giftType === "candles") return Boolean(parish?.candlesEnabled);
  if (giftType === "fund") {
    return Boolean(parish?.designatedFundsEnabled)
      && (parish?.funds || []).some((fund) => fund && !isGeneralDonorFund(fund) && !isCandleDonorFund(fund));
  }
  return parishHasGivingPlus(parish) && ["commemoration", "campaign", "feast"].includes(giftType);
}

function ensureGivingPlusPaywall() {
  let dialog = document.getElementById("givingPlusPaywall");
  if (dialog) return dialog;
  dialog = document.createElement("dialog");
  dialog.id = "givingPlusPaywall";
  dialog.className = "giving-plus-paywall";
  dialog.innerHTML = `
    <div class="giving-plus-paywall-inner">
      <button class="giving-plus-paywall-close" type="button" aria-label="Close" onclick="closeGivingPlusPaywall()">×</button>
      <span class="giving-plus-paywall-badge">Give + feature</span>
      <h2 id="givingPlusPaywallTitle">Help your parish offer more ways to give</h2>
      <p id="givingPlusPaywallCopy">Give includes a General Operating Fund, one designated fund, and candles. Give + unlocks unlimited funds, campaigns, commemorations, and festal alms.</p>
      <div class="giving-plus-paywall-actions">
        <button class="btn btn-ghost" type="button" onclick="closeGivingPlusPaywall()">Not now</button>
        <button class="btn btn-gold" id="givingPlusEncourageButton" type="button" onclick="requestParishGivingPlusUpgrade(this)">Encourage my parish</button>
      </div>
      <p class="giving-plus-paywall-status" id="givingPlusPaywallStatus" aria-live="polite"></p>
    </div>`;
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeGivingPlusPaywall();
  });
  document.body.appendChild(dialog);
  return dialog;
}

function closeGivingPlusPaywall() {
  const dialog = document.getElementById("givingPlusPaywall");
  if (!dialog) return;
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

function openGivingPlusPaywall(event, parish, giftType = "") {
  event?.preventDefault();
  const selectedParish = parish || selectedPublicParish() || window.agapaySelectedGivingParish || null;
  window.agapaySelectedGivingParish = selectedParish;
  const dialog = ensureGivingPlusPaywall();
  const status = document.getElementById("givingPlusPaywallStatus");
  const button = document.getElementById("givingPlusEncourageButton");
  const label = donorGiftTypeCopy[normalizeDonorGiftType(giftType)]?.detailsTitle || "This giving option";
  const copy = document.getElementById("givingPlusPaywallCopy");
  if (copy) {
    const starterOption = ["fund", "candles"].includes(normalizeDonorGiftType(giftType));
    copy.textContent = starterOption
      ? `${selectedParish?.name || "This parish"} can offer ${label.toLowerCase()} on Give, but this option has not been configured or is currently paused.`
      : `${label} is available with Give +. Give includes General Operating, one designated fund, and candle giving.`;
  }
  if (status) status.textContent = selectedParish
    ? "You can privately let parish leadership know that you want more giving options."
    : "Choose your home parish before sending an upgrade request.";
  if (button) {
    button.disabled = !selectedParish;
    button.textContent = "Encourage my parish";
  }
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
  return false;
}

async function requestParishGivingPlusUpgrade(button) {
  const status = document.getElementById("givingPlusPaywallStatus");
  if (button) {
    button.disabled = true;
    button.textContent = "Sending…";
  }
  if (status) status.textContent = "Sending your request…";
  try {
    const result = await donorApi("/api/donor/giving-plus-feature-request", { method: "POST" });
    if (status) status.textContent = result.message || "Your parish will see your request in its dashboard.";
    if (button) button.textContent = "Request sent";
  } catch (error) {
    if (status) status.textContent = error.message || "Unable to send your request.";
    if (button) {
      button.disabled = false;
      button.textContent = "Try again";
    }
  }
}

function setGivingTierTilesLoading() {
  document.body.classList.add("giving-tier-pending");
  document.querySelectorAll("[data-giving-tier-region]").forEach((region) => region.setAttribute("aria-busy", "true"));
  document.querySelectorAll("[data-giving-plus-gift]").forEach((tile) => {
    tile.classList.remove("giving-tier-locked");
    tile.classList.add("giving-tier-loading");
    tile.setAttribute("aria-busy", "true");
    tile.setAttribute("aria-disabled", "true");
    tile.setAttribute("tabindex", "-1");
    tile.setAttribute("aria-label", `${tile.textContent.trim()} — checking availability`);
    tile.onclick = (event) => event.preventDefault();
  });
}

function updateGivingTierTiles(parish) {
  if (parish) window.agapaySelectedGivingParish = parish;
  document.body.classList.remove("giving-tier-pending");
  document.querySelectorAll("[data-giving-tier-region]").forEach((region) => region.removeAttribute("aria-busy"));
  document.querySelectorAll("[data-giving-plus-gift]").forEach((tile) => {
    const giftType = tile.getAttribute("data-giving-plus-gift") || "";
    const allowed = parishCanUseGiftType(parish, giftType);
    tile.classList.remove("giving-tier-loading");
    tile.classList.toggle("giving-tier-locked", !allowed);
    tile.removeAttribute("aria-busy");
    tile.removeAttribute("aria-disabled");
    tile.removeAttribute("tabindex");
    tile.setAttribute("aria-label", !allowed
      ? `${tile.textContent.trim()} — not currently available`
      : tile.textContent.trim());
    tile.href = allowed ? quickDonorGiftUrl(giftType, parish) : "#giving-plus";
    tile.onclick = allowed ? null : (event) => openGivingPlusPaywall(event, parish, giftType);
  });
}

const donorGiftTypeCopy = {
  stewardship: {
    eyebrow: "Quick Tithes",
    title: "Give your tithes.",
    detailsTitle: "Tithes",
    intro: "Make a one-time tithe or establish a recurring rhythm of parish support in one clean flow.",
    context: "Your gift will be prepared as a parish offering. Use Designated Fund if this should go to a specific parish fund."
  },
  fund: {
    eyebrow: "Quick Designated Fund",
    title: "Give to a designated fund.",
    detailsTitle: "Designated Fund Offering",
    intro: "Support building, clergy, education, icons, or another parish-approved fund.",
    context: "Your gift will be prepared as a designated fund offering. Add the fund name in the Stripe note if needed while this donor flow is being expanded."
  },
  candles: {
    eyebrow: "Quick Candle Offering",
    title: "Offer a candle.",
    detailsTitle: "Candle Offering",
    intro: "Make a candle offering for prayer intentions without moving through the full giving menu.",
    context: "Your gift will be prepared as a candle offering. Add living or departed names below for the parish prayer list."
  },
  commemoration: {
    eyebrow: "Quick Memorial Offering",
    title: "Give for memorials and commemorations.",
    detailsTitle: "Memorial Offering",
    intro: "Make an offering connected to memorials, proskomedia, and parish commemoration needs.",
    context: "List the living and departed names below so the parish receives them in the commemoration queue."
  },
  campaign: {
    eyebrow: "Quick Campaign Offering",
    title: "Support an active campaign.",
    detailsTitle: "Campaign Offering",
    intro: "Give directly toward parish-approved needs, relief efforts, building work, or other focused campaigns.",
    context: "Your gift will be prepared as a campaign offering for the selected parish."
  },
  feast: {
    eyebrow: "Quick Festal Alms",
    title: "Mark the feast with alms.",
    detailsTitle: "Festal Alms Offering",
    intro: "Make an alms offering tied to the Church calendar and the parish's chosen destination fund.",
    context: "Your parish chooses the fund that receives gifts for each Major Feast Alms campaign."
  }
};

let donorGiftAmountEdited = false;
let activeDonorGiftType = "";

function markDonorGiftAmountEdited() {
  donorGiftAmountEdited = true;
}

function syncDonorCommemorationAmount(kind, options = {}) {
  const amountInput = document.getElementById("amount");
  if (!amountInput) return;
  const nextDefault = kind === "molieben_panikhida" ? "25" : "1";
  const previousDefault = amountInput.dataset.commemorationDefault || "";
  const shouldApply = options.force || !donorGiftAmountEdited || !amountInput.value || amountInput.value === previousDefault;
  amountInput.dataset.commemorationDefault = nextDefault;
  if (shouldApply) amountInput.value = nextDefault;
}

function donorNavIcon(kind) {
  const sharedKind = kind === "giving" ? "give" : kind === "marketplace" ? "market" : kind;
  if (window.MyAgapayShell?.icons?.[sharedKind]) return window.MyAgapayShell.icons[sharedKind];
  const givingHandIcon = '<svg viewBox="0 0 28 28" aria-hidden="true"><path d="M8 15V8.5a1.8 1.8 0 0 1 3.6 0V15"/><path d="M11.6 15V6.5a1.8 1.8 0 0 1 3.6 0V15"/><path d="M15.2 15V8a1.8 1.8 0 0 1 3.6 0v8"/><path d="M18.8 16v-4.2a1.8 1.8 0 0 1 3.6 0V17c0 4.4-3 7-7.6 7H14a8 8 0 0 1-8-8v-2a1.8 1.8 0 0 1 2.4 0L10 16"/><path d="M6.5 21.5c1.6 1.6 3.8 2.5 6.2 2.5"/></svg>';
  const icons = {
    home: '<svg viewBox="0 0 38 38" aria-hidden="true"><line x1="19" y1="2" x2="19" y2="5"/><line x1="17" y1="3.5" x2="21" y2="3.5"/><path d="M19 5 C15 7 13 11 14 14 C15 16 17 17 19 17 C21 17 23 16 24 14 C25 11 23 7 19 5Z"/><line x1="10" y1="6" x2="10" y2="8"/><path d="M10 8 C8 9.5 7 12 7.5 14 C8 15.5 9 16 10 16 C11 16 12 15.5 12.5 14 C13 12 12 9.5 10 8Z"/><line x1="28" y1="6" x2="28" y2="8"/><path d="M28 8 C26 9.5 25 12 25.5 14 C26 15.5 27 16 28 16 C29 16 30 15.5 30.5 14 C31 12 30 9.5 28 8Z"/><rect x="4" y="17" width="30" height="14" rx="1"/><path d="M16 31 L16 25 Q19 22 22 25 L22 31"/></svg>',
    give: givingHandIcon,
    giving: givingHandIcon,
    learn: '<svg viewBox="0 0 28 28" aria-hidden="true"><path d="M5 6.5A4.5 4.5 0 0 1 9.5 2H23v20H9.5A4.5 4.5 0 0 0 5 26z"/><path d="M5 6.5V26"/><path d="M10 7h8"/><path d="M10 11h7"/></svg>',
    bookstore: '<svg viewBox="0 0 28 28" aria-hidden="true"><path d="M5 22.5A3 3 0 0 1 8 19.5h16"/><path d="M8 3h16v22H8a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z"/><path d="M10.5 8h8"/><path d="M10.5 12h7"/></svg>',
    marketplace: '<svg viewBox="0 0 28 28" aria-hidden="true"><path d="M7 9h14l-1.2 15H8.2z"/><path d="M10 9a4 4 0 0 1 8 0"/><path d="M10.5 15h7"/></svg>',
    directory: '<svg viewBox="0 0 28 28" aria-hidden="true"><path d="M14 3.5l9 6.75V24H5V10.25z"/><path d="M10.5 24v-8h7v8"/><path d="M9.5 12h9"/><path d="M14 7.5v8.5"/></svg>',
    calendar: '<svg viewBox="0 0 28 28" aria-hidden="true"><rect x="3" y="5" width="22" height="20" rx="3"/><path d="M3 11h22"/><path d="M9 3v4M19 3v4"/><path d="M8 16h4M8 20h8"/></svg>',
    history: '<svg viewBox="0 0 28 28" aria-hidden="true"><path d="M4 22h20"/><path d="M6 22V14l3-2v10"/><path d="M12 22V10l3-2v14"/><path d="M18 22V6l3-2v18"/></svg>',
    commemorations: '<svg viewBox="0 0 28 28" aria-hidden="true"><path d="M4 16c0-5 2-8 5-9 1.5-.5 3-.5 5-.5s3.5 0 5 .5c3 1 5 4 5 9"/><path d="M4 16c0 3 2 5 10 5s10-2 10-5"/><path d="M10 13c1-2 2-3 4-3s3 1 4 3"/><line x1="14" y1="7" x2="14" y2="10"/><line x1="12" y1="8" x2="16" y2="8"/></svg>',
    account: '<svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="9" r="4"/><path d="M5.5 24a8.5 8.5 0 0 1 17 0"/></svg>',
    billing: '<svg viewBox="0 0 28 28" aria-hidden="true"><rect x="3" y="7" width="22" height="14" rx="3"/><path d="M3 12h22"/><path d="M8 17h5"/></svg>',
    profile: '<svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="9" r="4"/><path d="M5.5 24a8.5 8.5 0 0 1 17 0"/></svg>'
  };
  return icons[kind] || icons.home;
}

function donorNavKind(href) {
  const path = String(href || "");
  if (path.includes("#giving-dashboard")) return "give";
  if (path.includes("/myagapay/giving")) return "give";
  if (path.includes("/bookstore")) return "bookstore";
  if (path.includes("/learn")) return "learn";
  if (path.includes("/marketplace")) return "marketplace";
  if (path.includes("/directory")) return "directory";
  if (path.includes("#billing")) return "billing";
  if (path.includes("/settings")) return "account";
  if (path.includes("/offerings")) return "history";
  if (path.includes("/calendar")) return "calendar";
  if (path.includes("/commemorations")) return "commemorations";
  if (path.includes("/give")) return "give";
  return "home";
}

function applyDonorNavIcons() {
  document.querySelectorAll(".nav a, .mobile-tabbar a, .my-agapay-tabbar a").forEach((link) => {
    if (link.closest("[data-myagapay-global-nav]")) return;
    const existing = link.querySelector("svg");
    if (!existing) return;
    const wrapper = document.createElement("span");
    wrapper.innerHTML = donorNavIcon(donorNavKind(link.getAttribute("href")));
    existing.replaceWith(wrapper.firstElementChild);
  });
}

function communityIconSvg(type) {
  const normalized = String(type || "parish").toLowerCase();
  if (normalized === "monastery") {
    return '<svg viewBox="0 0 38 38" aria-hidden="true"><rect x="4" y="14" width="30" height="18" rx="1"/><rect x="14" y="6" width="10" height="14" rx="1"/><line x1="19" y1="2" x2="19" y2="6"/><line x1="16.5" y1="3.5" x2="21.5" y2="3.5"/><line x1="16" y1="5.5" x2="22" y2="5.5"/><path d="M15 32 L15 25 Q19 21 23 25 L23 32"/><rect x="7" y="18" width="5" height="6" rx="2.5"/><rect x="26" y="18" width="5" height="6" rx="2.5"/></svg>';
  }
  if (normalized === "mission") {
    return '<svg viewBox="0 0 38 38" aria-hidden="true"><line x1="19" y1="2" x2="19" y2="6"/><line x1="16.5" y1="3.5" x2="21.5" y2="3.5"/><line x1="16" y1="5.5" x2="22" y2="5.5"/><path d="M19 6 C10 10 8 17 11 22 C13 26 16 27 19 27 C22 27 25 26 27 22 C30 17 28 10 19 6Z"/><line x1="12" y1="27" x2="26" y2="27"/><line x1="13" y1="29" x2="25" y2="29"/></svg>';
  }
  return '<svg viewBox="0 0 38 38" aria-hidden="true"><line x1="19" y1="2" x2="19" y2="5"/><line x1="17" y1="3.5" x2="21" y2="3.5"/><path d="M19 5 C15 7 13 11 14 14 C15 16 17 17 19 17 C21 17 23 16 24 14 C25 11 23 7 19 5Z"/><line x1="10" y1="6" x2="10" y2="8"/><path d="M10 8 C8 9.5 7 12 7.5 14 C8 15.5 9 16 10 16 C11 16 12 15.5 12.5 14 C13 12 12 9.5 10 8Z"/><line x1="28" y1="6" x2="28" y2="8"/><path d="M28 8 C26 9.5 25 12 25.5 14 C26 15.5 27 16 28 16 C29 16 30 15.5 30.5 14 C31 12 30 9.5 28 8Z"/><rect x="4" y="17" width="30" height="14" rx="1"/><path d="M16 31 L16 25 Q19 22 22 25 L22 31"/></svg>';
}

function syncSacramentsEntry(parish) {
  const available = Boolean(parish?.sacramentsEnabled);
  document.querySelectorAll("[data-sacraments-entry]").forEach((el) => {
    el.hidden = !available;
  });
}

function updateQuickGiveLinks(parish, { syncGivingTier = true } = {}) {
  const tithesLink = document.getElementById("quickGiveTithes");
  const parishIcon = document.getElementById("quickGiveParishIcon");
  const desktopParishIcon = document.getElementById("desktopParishIcon");
  const desktopTithesLink = document.getElementById("desktopQuickTithes");
  if (tithesLink) tithesLink.href = quickDonorGiftUrl("stewardship", parish);
  if (desktopTithesLink) desktopTithesLink.href = quickDonorGiftUrl("stewardship", parish);
  if (parishIcon) parishIcon.innerHTML = communityIconSvg(parish?.type);
  if (desktopParishIcon) desktopParishIcon.innerHTML = communityIconSvg(parish?.type);
  if (syncGivingTier) updateGivingTierTiles(parish);
  syncSacramentsEntry(parish);
}

function activeParishCampaigns(parish) {
  const campaigns = Array.isArray(parish?.campaigns) ? parish.campaigns : [];
  return campaigns.filter((campaign) => {
    const status = String(campaign?.status || (campaign?.enabled === false ? "hidden" : "active")).toLowerCase();
    return campaign && !["hidden", "paused", "cancelled", "ended", "inactive"].includes(status);
  });
}

function activeParishFeastCampaigns(parish) {
  const campaigns = Array.isArray(parish?.feastCampaigns) ? parish.feastCampaigns : [];
  return campaigns.filter((campaign) => {
    const status = String(campaign?.status || (campaign?.enabled === false ? "hidden" : "active")).toLowerCase();
    return campaign && !["hidden", "paused", "cancelled", "ended", "inactive"].includes(status);
  });
}

function selectedPublicParish() {
  const selected = document.getElementById("parish")?.value || "";
  return (window.agapayPublicParishes || []).find((parish) => parish.id === selected) || null;
}

function campaignLabel(campaign) {
  return campaign?.name || campaign?.campaignName || "Parish Campaign";
}

function campaignGoalCents(campaign) {
  return Number(campaign?.goalCents || campaign?.targetCents || campaign?.goalAmountCents || 0);
}

function campaignRaisedCents(campaign) {
  return Number(campaign?.raisedCents || campaign?.amountCents || campaign?.currentCents || 0);
}

function campaignImageUrl(campaign) {
  const photos = Array.isArray(campaign?.photos) ? campaign.photos : [];
  const firstPhoto = photos.find(Boolean);
  return campaign?.coverPhotoUrl
    || campaign?.coverUrl
    || campaign?.imageUrl
    || campaign?.photoUrl
    || (typeof firstPhoto === "string" ? firstPhoto : firstPhoto?.url)
    || "";
}

function selectedCampaign() {
  const selected = document.getElementById("campaign")?.value || "";
  if (!selected) return null;
  const giftType = normalizeDonorGiftType(document.getElementById("giftType")?.value);
  const campaigns = giftType === "feast"
    ? activeParishFeastCampaigns(selectedPublicParish())
    : activeParishCampaigns(selectedPublicParish());
  return campaigns.find((campaign) => {
    const keys = [campaign.id, campaign.feastId, campaign.name, campaign.campaignName].filter(Boolean).map(String);
    return keys.includes(selected);
  }) || null;
}

function populateGiftOptionFields() {
  const parish = selectedPublicParish();
  const fundSelect = document.getElementById("fund");
  if (fundSelect) {
    const current = fundSelect.value;
    const funds = Array.isArray(parish?.funds) ? parish.funds : [];
    fundSelect.innerHTML = funds.length
      ? funds.map((fund) => `<option value="${escapeHtml(fund.id || fund.name)}">${escapeHtml(fund.name || fund.id || "Designated fund")}</option>`).join("")
      : '<option value="">No designated funds listed</option>';
    if (current && Array.from(fundSelect.options).some((option) => option.value === current)) fundSelect.value = current;
  }

  const campaignSelect = document.getElementById("campaign");
  if (campaignSelect) {
    const current = campaignSelect.value;
    const giftType = normalizeDonorGiftType(document.getElementById("giftType")?.value);
    const campaigns = giftType === "feast" ? activeParishFeastCampaigns(parish) : activeParishCampaigns(parish);
    campaignSelect.innerHTML = campaigns.length
      ? campaigns.map((campaign) => `<option value="${escapeHtml(campaign.id || campaign.feastId || campaign.name || campaign.campaignName)}">${escapeHtml(campaignLabel(campaign))}${campaign.patronal ? " · Parish feast day" : ""}</option>`).join("")
      : '<option value="">No active campaigns</option>';
    if (current && Array.from(campaignSelect.options).some((option) => option.value === current)) campaignSelect.value = current;
  }
}

function renderCampaignChoicePreview(campaign) {
  const target = document.getElementById("campaignPreview");
  if (!target) return;
  if (!campaign) {
    target.innerHTML = '<p class="form-help">No active parish campaign is available for this church right now.</p>';
    return;
  }
  const goalCents = campaignGoalCents(campaign);
  const raisedCents = campaignRaisedCents(campaign);
  const percent = goalCents > 0 ? Math.min(100, Math.round((raisedCents / goalCents) * 100)) : 0;
  target.innerHTML = `
    <div class="gift-option-preview">
      <strong>${escapeHtml(campaignLabel(campaign))}</strong>
      ${campaign.description ? `<span>${escapeHtml(campaign.description)}</span>` : ""}
      ${goalCents > 0 ? `<div class="campaign-track"><span style="width:${percent}%"></span></div><small>${money(raisedCents)} of ${money(goalCents)} raised (${percent}%)</small>` : "<small>No public goal set yet.</small>"}
    </div>
  `;
}

function donorSlugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function campaignShareUrl(parish, campaign) {
  const parishId = parish?.id;
  if (!parishId || !campaign) return "";
  const slug = campaign.slug || donorSlugify(campaign.name || campaign.campaignName || campaign.id || "");
  if (!slug) return "";
  const origin = String(window.location.origin || "").replace(/\/+$/, "");
  return `${origin}/give/${encodeURIComponent(parishId)}/${slug}-campaign`;
}

async function shareCampaign(event, btn) {
  if (event) { event.preventDefault(); event.stopPropagation(); }
  const url = btn?.getAttribute("data-share-url") || "";
  const title = btn?.getAttribute("data-share-title") || "Parish Campaign";
  if (!url) return;
  if (navigator.share) {
    try {
      await navigator.share({ title, text: `Support ${title} through AGAPAY`, url });
      return;
    } catch (err) {
      if (err && err.name === "AbortError") return;
    }
  }
  const label = btn.querySelector("span");
  try {
    await navigator.clipboard.writeText(url);
    if (label) {
      const prev = label.textContent;
      label.textContent = "Link copied";
      setTimeout(() => { label.textContent = prev; }, 1800);
    }
  } catch {
    window.prompt("Copy this campaign link", url);
  }
}

function renderActiveCampaigns(parish, { confirmed = false } = {}) {
  const targets = [document.getElementById("activeCampaigns"), document.getElementById("desktopActiveCampaigns")].filter(Boolean);
  if (!targets.length) return;
  const campaign = activeParishCampaigns(parish)[0];
  if (!campaign) {
    if (!confirmed) return;
    const empty = `
      <article class="campaign-card campaign-empty">
        <span class="campaign-pill">Campaigns</span>
        <h3>No Active Campaigns</h3>
        <p>${parish?.name ? "This church does not have an active campaign right now." : "Sign in and select a church to see parish-approved campaigns here."}</p>
      </article>
    `;
    targets.forEach((target) => { target.innerHTML = empty; });
    return;
  }

  const goalCents = Number(campaign.goalCents || campaign.targetCents || campaign.goalAmountCents || 0);
  const raisedCents = Number(campaign.raisedCents || campaign.amountCents || campaign.currentCents || 0);
  const percent = goalCents > 0 ? Math.min(100, Math.floor((raisedCents / goalCents) * 100)) : 0;
  const link = donorGiftUrl("campaign", parish, { campaign: campaign.id || campaign.feastId || campaign.name });
  const imageUrl = campaignImageUrl(campaign);
  const description = campaign.description || "Support this parish-approved campaign.";
  // Show the donor their own contribution to this campaign (server attaches
  // donorGivenCents only for an authenticated donor, so this stays hidden in
  // the signed-out/public view). A $0 state gently invites a first gift.
  const hasDonorContext = typeof campaign.donorGivenCents === "number";
  const givenCents = Number(campaign.donorGivenCents || 0);
  const giftCount = Number(campaign.donorGiftCount || 0);
  const cygHeart = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
  const youGaveBlock = !hasDonorContext ? "" : (givenCents > 0
    ? `<div class="campaign-you-gave has-given"><span class="cyg-icon">${cygHeart}</span><span class="cyg-body"><span class="cyg-label">Your giving to this campaign</span><span class="cyg-amount">${money(givenCents)}</span>${giftCount > 1 ? `<span class="cyg-sub">across ${giftCount} gifts</span>` : ""}</span></div>`
    : `<div class="campaign-you-gave no-given"><span class="cyg-icon">${cygHeart}</span><span class="cyg-body"><span class="cyg-label">You haven't given to this campaign yet</span><span class="cyg-sub">Be part of it &mdash; every gift helps.</span></span></div>`);
  const shareUrl = campaignShareUrl(parish, campaign);
  const shareBtn = shareUrl
    ? `<button type="button" class="campaign-share-btn" onclick="shareCampaign(event, this)" data-share-url="${escapeHtml(shareUrl)}" data-share-title="${escapeHtml(campaign.name || "Parish Campaign")}" aria-label="Share this campaign" style="position:absolute;top:10px;right:10px;z-index:2;display:inline-flex;align-items:center;gap:6px;padding:7px 13px;border:0;border-radius:999px;background:rgba(6,21,34,.82);color:#fff;font:600 12px/1 'DM Sans',system-ui,sans-serif;cursor:pointer;-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);box-shadow:0 2px 8px rgba(6,21,34,.28);"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"/></svg><span>Share</span></button>`
    : "";
  const html = `
    <div class="campaign-card-shell" style="position:relative;">
      <a class="campaign-card campaign-media-card" href="${escapeHtml(link)}">
        <div class="campaign-media-thumb">
          ${imageUrl
            ? `<img src="${escapeHtml(imageUrl)}" alt="" loading="lazy" />`
            : `<span>${escapeHtml((campaign.name || "Campaign").slice(0, 1))}</span>`}
        </div>
        <div class="campaign-media-body">
          <h3>${escapeHtml(campaign.name || "Parish Campaign")}</h3>
          ${goalCents > 0 ? `<div class="campaign-track"><span style="width:${percent}%"></span></div>` : ""}
          ${goalCents > 0 ? `<div class="campaign-progress-row"><strong>${money(raisedCents)} raised</strong><span>${percent}% of ${money(goalCents)}</span></div>` : ""}
          <p class="campaign-description">${escapeHtml(description)}</p>
          ${youGaveBlock}
        </div>
      </a>
      ${shareBtn}
    </div>
  `;
  targets.forEach((target) => { target.innerHTML = html; });
}

function fundLabel(fund) {
  return fund?.name || fund?.label || fund?.id || "Designated fund";
}

function renderActiveFunds(parish, { confirmed = false } = {}) {
  const targets = [document.getElementById("activeFunds"), document.getElementById("desktopActiveFunds")].filter(Boolean);
  if (!targets.length) return;
  if (parish && !parishHasGivingPlus(parish)) {
    const starterFunds = Array.isArray(parish.funds) && parish.funds.length
      ? parish.funds.slice(0, 2)
      : [{ name: "General Operating Fund", description: "Support your parish's day-to-day mission." }];
    const html = starterFunds.map((starterFund) => {
      const general = isGeneralDonorFund(starterFund);
      return `
      <article class="active-funds-card">
        <div>
          <span class="campaign-pill">${general ? "General fund" : "Designated fund"}</span>
          <h3>${escapeHtml(fundLabel(starterFund))}</h3>
          <p>${escapeHtml(starterFund.description || "Support your parish's day-to-day mission.")}</p>
        </div>
        <div class="starter-fund-actions">
          <a href="${escapeHtml(quickDonorGiftUrl(general ? "stewardship" : "fund", parish, general ? { frequency: "once" } : { fund: starterFund.id || starterFund.name }))}">${general ? "One-time" : "Give"}</a>
          ${general ? `<a href="${escapeHtml(quickDonorGiftUrl("stewardship", parish, { frequency: "monthly" }))}">Recurring</a>` : ""}
        </div>
      </article>`;
    }).join("");
    targets.forEach((target) => { target.innerHTML = html; });
    return;
  }
  const funds = (Array.isArray(parish?.funds) ? parish.funds : [])
    .filter((fund) => fund && !isCandleDonorFund(fund) && fund.active !== false && String(fund.status || "active").toLowerCase() !== "archived")
    .slice(0, 4);
  if (!funds.length) {
    if (!confirmed) return;
    const empty = `
      <article class="active-funds-card active-funds-empty">
        <span class="campaign-pill">Funds</span>
        <h3>No Active Funds</h3>
        <p>${parish?.name ? "This church has not listed designated funds yet." : "Sign in and select a church to see its active giving funds."}</p>
      </article>
    `;
    targets.forEach((target) => { target.innerHTML = empty; });
    return;
  }
  const html = funds.map((fund) => {
    const label = fundLabel(fund);
    const description = fund.description || fund.note || "Give directly to this parish fund.";
    const link = donorGiftUrl("fund", parish, { fund: fund.id || fund.name || label });
    return `
      <article class="active-funds-card">
        <div>
          <span class="campaign-pill">Fund</span>
          <h3>${escapeHtml(label)}</h3>
          <p>${escapeHtml(description)}</p>
        </div>
        <a href="${escapeHtml(link)}">Donate</a>
      </article>
    `;
  }).join("");
  targets.forEach((target) => { target.innerHTML = html; });
}

function renderNextFeast(parish, { confirmed = false } = {}) {
  const targets = [
    {
      name: document.getElementById("nextFeastName"),
      date: document.getElementById("nextFeastDate"),
      calendar: document.getElementById("nextFeastCalendar"),
      link: document.getElementById("nextFeastLink")
    },
    {
      name: document.getElementById("desktopNextFeastName"),
      date: document.getElementById("desktopNextFeastDate"),
      calendar: document.getElementById("desktopNextFeastCalendar"),
      link: document.getElementById("desktopNextFeastLink")
    }
  ].filter((target) => target.name && target.date && target.calendar);
  if (!targets.length) return;
  if (!parish) {
    if (!confirmed) return;
    targets.forEach((target) => {
      target.calendar.textContent = "Next Feast Day:";
      target.name.textContent = "Next feast day";
      target.date.textContent = "Sign in and select a church to see the next feast for its calendar.";
      if (target.link) target.link.href = "/myagapay/giving/give?giftType=feast";
    });
    return;
  }
  const feast = nextFeastForCalendar(parish.liturgicalCalendar);
  targets.forEach((target) => {
    target.calendar.textContent = "Next Feast Day:";
    target.name.textContent = feast?.name || "Next feast day";
    target.date.textContent = feast?.date
      ? `${shortDate(feast.date)} for ${parish.name || "your church"}`
      : `Based on ${calendarLabel(parish.liturgicalCalendar)}`;
    if (target.link) target.link.href = donorGiftUrl("feast", parish, { feast: feast?.name });
  });
}

function renderHomeParishWidgetsLoading() {
  const campaignLoading = '<article class="campaign-card campaign-empty sw-tool-loading"><span class="campaign-pill">Campaigns</span><h3>Loading parish campaigns…</h3><p>Checking the giving opportunities available through your parish.</p></article>';
  [document.getElementById("activeCampaigns"), document.getElementById("desktopActiveCampaigns")]
    .filter(Boolean)
    .forEach((target) => { target.innerHTML = campaignLoading; });

  const fundsLoading = '<article class="active-funds-card active-funds-empty sw-tool-loading"><span class="campaign-pill">Funds</span><h3>Loading parish funds…</h3><p>Checking the funds available through your parish.</p></article>';
  [document.getElementById("activeFunds"), document.getElementById("desktopActiveFunds")]
    .filter(Boolean)
    .forEach((target) => { target.innerHTML = fundsLoading; });

  [
    [document.getElementById("nextFeastName"), document.getElementById("nextFeastDate")],
    [document.getElementById("desktopNextFeastName"), document.getElementById("desktopNextFeastDate")]
  ].forEach(([name, date]) => {
    if (name) name.textContent = "Loading parish feast…";
    if (date) date.textContent = "Checking your parish calendar.";
  });
}

function applyDonorGiveParams() {
  const params = new URLSearchParams(window.location.search);
  const parish = params.get("parish");
  const giftType = normalizeDonorGiftType(params.get("giftType"));
  const frequency = params.get("frequency");
  const isQuick = params.get("quick") === "1";
  const parishSelect = document.getElementById("parish");
  const giftTypeSelect = document.getElementById("giftType");
  if (parish && parishSelect) parishSelect.value = parish;
  if (giftType && giftTypeSelect) giftTypeSelect.value = giftType;
  setDonorGiftFrequency(frequency || document.getElementById("frequency")?.value || "once");
  toggleGiftDetailFields();
  if (params.get("campaign") && document.getElementById("campaign")) {
    document.getElementById("campaign").value = params.get("campaign");
    renderCampaignChoicePreview(selectedCampaign());
  }
  if (params.get("fund") && document.getElementById("fund")) {
    document.getElementById("fund").value = params.get("fund");
  }
  if (!isQuick) return;

  const copy = donorGiftTypeCopy[giftType] || donorGiftTypeCopy.stewardship;
  document.body.classList.add("quick-give-mode");
  setText("giveEyebrow", copy.eyebrow);
  setText("giveTitle", copy.title);
  setText("giveIntro", copy.intro);
  setText("giftDetailsTitle", copy.detailsTitle);
  const context = document.getElementById("quickGiveContext");
  if (context) {
    context.textContent = copy.context;
    context.hidden = false;
  }
  const giftTypeField = document.getElementById("giftTypeField");
  if (giftTypeField) giftTypeField.hidden = true;
  const changeLink = document.getElementById("changeGiftLink");
  if (changeLink) changeLink.hidden = false;
  const card = document.getElementById("giftDetailsCard");
  if (card) {
    window.requestAnimationFrame(() => {
      card.scrollIntoView({ behavior: "smooth", block: "start" });
      const firstField = giftType === "commemoration"
        ? document.querySelector('input[name="commemorationKind"]:checked')
        : document.getElementById("amount");
      firstField?.focus({ preventScroll: true });
    });
  }
}

function setDonorGiftFrequency(value = "once") {
  const frequencyInput = document.getElementById("frequency");
  const recurringSelect = document.getElementById("recurringFrequency");
  const recurringField = document.getElementById("recurringFrequencyField");
  if (!frequencyInput) return;
  const recurringValues = new Set(["weekly", "biweekly", "monthly"]);
  const requested = String(value || "once").toLowerCase();
  const recurring = requested === "recurring" || recurringValues.has(requested);
  if (recurringValues.has(requested) && recurringSelect) recurringSelect.value = requested;
  const cadence = recurringSelect?.value || "monthly";
  frequencyInput.value = recurring ? cadence : "once";
  if (recurringField) recurringField.hidden = !recurring;
  document.querySelectorAll("[data-gift-frequency-mode]").forEach((button) => {
    const active = button.dataset.giftFrequencyMode === (recurring ? "recurring" : "once");
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function toggleCandleIntentionFields() {
  toggleGiftDetailFields();
}

function toggleGiftDetailFields() {
  const giftTypeSelect = document.getElementById("giftType");
  let giftType = normalizeDonorGiftType(giftTypeSelect?.value);
  const giftTypeChanged = giftType !== activeDonorGiftType;
  const parish = selectedPublicParish();
  updateGivingTierTiles(parish);
  if (giftTypeSelect) {
    Array.from(giftTypeSelect.options).forEach((option) => {
      option.disabled = isGivingPlusGiftType(option.value) && !parishCanUseGiftType(parish, option.value);
    });
  }
  if (isGivingPlusGiftType(giftType) && !parishCanUseGiftType(parish, giftType)) {
    const lockedGiftType = giftType;
    giftType = "stewardship";
    if (giftTypeSelect) giftTypeSelect.value = giftType;
    openGivingPlusPaywall(null, parish, lockedGiftType);
  }
  populateGiftOptionFields();
  const candleFields = document.getElementById("candleIntentionFields");
  const commemorationKindFields = document.getElementById("commemorationKindFields");
  const commemorationFields = document.getElementById("commemorationIntentionFields");
  const fundFields = document.getElementById("fundFields");
  const campaignFields = document.getElementById("campaignFields");
  if (candleFields) candleFields.hidden = giftType !== "candles";
  if (commemorationKindFields) commemorationKindFields.hidden = giftType !== "commemoration";
  if (commemorationFields) commemorationFields.hidden = giftType !== "commemoration";
  if (fundFields) fundFields.hidden = giftType !== "fund";
  if (campaignFields) campaignFields.hidden = !["campaign", "feast"].includes(giftType);
  if (giftType === "commemoration") {
    const kind = document.querySelector('input[name="commemorationKind"]:checked')?.value || "proskomedia_liturgy";
    syncDonorCommemorationAmount(kind, { force: giftTypeChanged && !donorGiftAmountEdited });
  }
  activeDonorGiftType = giftType;
  renderCampaignChoicePreview(["campaign", "feast"].includes(giftType) ? selectedCampaign() : null);
}

async function loginFromDashboard() {
  const email = document.getElementById("donorEmail")?.value.trim();
  const password = document.getElementById("donorPassword")?.value;
  if (!email || !password) {
    setDonorStatus("Enter your donor email and password.", "error");
    return;
  }
  setDonorStatus("Loading donor account...");
  try {
    const data = await donorApi("/api/donor/login", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    saveDonorSession(data);
    setDonorStatus("Donor account loaded.", "success");
    if (typeof loadDonorDashboardPage === "function") await loadDonorDashboardPage();
    if (typeof loadDonorOfferingsPage === "function") await loadDonorOfferingsPage();
    if (typeof loadDonorCommemorationsPage === "function") await loadDonorCommemorationsPage();
  } catch (err) {
    setDonorStatus(err.message, "error");
  }
}

async function loginFromPage(event) {
  event.preventDefault();
  const email = document.getElementById("donorEmail")?.value.trim();
  const password = document.getElementById("donorPassword")?.value;
  if (!email || !password) {
    setDonorStatus("Enter your email and password.", "error");
    return;
  }
  setDonorStatus("Signing you in...");
  try {
    const data = await donorApi("/api/donor/login", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    saveDonorSession(data);
    setDonorStatus("Signed in. Opening My AGAPAY...", "success");
    window.location.href = donorLoginReturnPath();
  } catch (err) {
    clearDonorSession();
    const message = isDonorUnauthorized(err)
      ? "We could not sign you in with that email and password. Check your password or use Forgot password."
      : err.message;
    setDonorStatus(message, "error");
  }
}

function showDonorAuthForm(formId) {
  ["donorLoginForm", "donorResetRequestForm", "donorResetConfirmForm"].forEach((id) => {
    const form = document.getElementById(id);
    if (form) form.hidden = id !== formId;
  });
}

function showDonorLogin() {
  showDonorAuthForm("donorLoginForm");
  setDonorStatus("", "");
}

function showDonorPasswordReset() {
  const email = document.getElementById("donorEmail")?.value.trim();
  const resetEmail = document.getElementById("donorResetEmail");
  if (email && resetEmail) resetEmail.value = email;
  showDonorAuthForm("donorResetRequestForm");
  setDonorStatus("", "");
}

async function requestDonorPasswordReset(event) {
  event.preventDefault();
  const email = document.getElementById("donorResetEmail")?.value.trim();
  if (!email) {
    setDonorStatus("Enter your email address.", "error");
    return;
  }
  setDonorStatus("Sending reset link...");
  try {
    const data = await donorApi("/api/donor/password-reset-request", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    setDonorStatus("If that email is verified, a reset link has been sent.", "success");
    if (data.resetUrl) {
      const actions = document.getElementById("donorResetRequestForm")?.querySelector(".donor-auth-actions");
      if (actions) {
        const link = document.getElementById("donorTestResetLink") || document.createElement("a");
        link.id = "donorTestResetLink";
        link.href = data.resetUrl;
        link.textContent = "Open test reset link";
        link.className = "btn btn-ghost";
        if (!link.parentElement) actions.appendChild(link);
      }
    }
  } catch (err) {
    setDonorStatus(err.message, "error");
  }
}

async function confirmDonorPasswordReset(event) {
  event.preventDefault();
  const email = document.getElementById("donorResetConfirmEmail")?.value.trim();
  const token = document.getElementById("donorResetToken")?.value.trim();
  const newPassword = document.getElementById("donorNewPassword")?.value;
  const confirmPassword = document.getElementById("donorConfirmPassword")?.value;
  if (!email || !token || !newPassword) {
    setDonorStatus("Enter your email and new password.", "error");
    return;
  }
  if (newPassword !== confirmPassword) {
    setDonorStatus("Passwords do not match.", "error");
    return;
  }
  setDonorStatus("Updating password...");
  try {
    await donorApi("/api/donor/password-reset-confirm", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ email, token, newPassword, confirmPassword })
    });
    clearDonorSession();
    const loginEmail = document.getElementById("donorEmail");
    if (loginEmail) loginEmail.value = email;
    showDonorAuthForm("donorLoginForm");
    setDonorStatus("Password updated. Please log in with your new password.", "success");
  } catch (err) {
    setDonorStatus(err.message, "error");
  }
}

function initDonorPasswordResetPage() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token") || "";
  const email = params.get("email") || "";
  if (!token && params.get("reset") !== "1") return;
  const tokenField = document.getElementById("donorResetToken");
  const emailField = document.getElementById("donorResetConfirmEmail");
  if (tokenField) tokenField.value = token;
  if (emailField) emailField.value = email;
  showDonorAuthForm(token ? "donorResetConfirmForm" : "donorResetRequestForm");
}

function initDonorLoginPageControls() {
  if (window.__agapayDonorLoginControlsReady) return;
  const loginForm = document.getElementById("donorLoginForm");
  const resetRequestForm = document.getElementById("donorResetRequestForm");
  const resetConfirmForm = document.getElementById("donorResetConfirmForm");
  if (!loginForm && !resetRequestForm && !resetConfirmForm) return;
  window.__agapayDonorLoginControlsReady = true;

  loginForm?.addEventListener("submit", loginFromPage);
  resetRequestForm?.addEventListener("submit", requestDonorPasswordReset);
  resetConfirmForm?.addEventListener("submit", confirmDonorPasswordReset);

  document.querySelectorAll("[data-donor-auth-view]").forEach((button) => {
    button.addEventListener("click", () => {
      const view = button.getAttribute("data-donor-auth-view");
      if (view === "reset") showDonorPasswordReset();
      if (view === "login") showDonorLogin();
    });
  });
}

window.loginFromPage = loginFromPage;
window.showDonorLogin = showDonorLogin;
window.showDonorPasswordReset = showDonorPasswordReset;
window.requestDonorPasswordReset = requestDonorPasswordReset;
window.confirmDonorPasswordReset = confirmDonorPasswordReset;

document.addEventListener("DOMContentLoaded", () => {
  initDonorLoginPageControls();
  initDonorPasswordResetPage();
});

async function signupFromPage(event) {
  event.preventDefault();
  const donorName = document.getElementById("donorName")?.value.trim();
  const email = document.getElementById("donorEmail")?.value.trim();
  const password = document.getElementById("donorPassword")?.value;
  const parishId = document.getElementById("parish")?.value || "";
  const termsAccepted = document.getElementById("agreeTerms")?.checked === true;
  if (!donorName || !email || !password) {
    setDonorStatus("Enter your name, email, and password.", "error");
    return;
  }
  if (!termsAccepted) {
    setDonorStatus("Agree to the Terms of Service before creating your account.", "error");
    return;
  }
  setDonorStatus("Creating your donor account...");
  try {
    const data = await donorApi("/api/donor/signup", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        donorName,
        householdName: donorName,
        next: new URLSearchParams(window.location.search).get("next") || "",
        email,
        password,
        parishId,
        addressLine1: document.getElementById("addressLine1")?.value.trim() || "",
        addressLine2: document.getElementById("addressLine2")?.value.trim() || "",
        city: document.getElementById("city")?.value.trim() || "",
        state: document.getElementById("state")?.value.trim() || "",
        postalCode: document.getElementById("postalCode")?.value.trim() || "",
        country: document.getElementById("country")?.value.trim() || "US",
        termsAccepted,
        ...(window.agapaySecurityPayload ? window.agapaySecurityPayload() : {})
      })
    });
    window.AGAPAYDonorSession.saveSession({ donor: data.donor }, email);
    setDonorProfile(data.donor);
    if (data.verificationUrl) {
      setDonorStatus("Account created. Email is not configured, so a test verification link is shown below.", "success");
      const box = document.getElementById("verificationLinkBox");
      const link = document.getElementById("verificationLink");
      if (box && link) {
        link.href = data.verificationUrl;
        link.textContent = "Open test verification link";
        box.style.display = "block";
      }
      return;
    }
    setDonorStatus("Account created. Check your email to verify your AGAPAY account.", "success");
    const next = document.getElementById("signupNextStep");
    if (next) next.style.display = "block";
  } catch (err) {
    setDonorStatus(err.message, "error");
  }
}

async function verifyDonorEmail() {
  const params = new URLSearchParams(window.location.search);
  const email = params.get("email") || donorSession().email;
  const token = params.get("token") || "";
  if (!email || !token) {
    setDonorStatus("This verification link is missing information. Please sign up again to request a new link.", "error");
    return;
  }
  setDonorStatus("Verifying your email...");
  try {
    const data = await donorApi("/api/donor/verify", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ email, token })
    });
    if (!data.token) {
      setDonorStatus("Email already verified. Please log in to open My AGAPAY.", "success");
      setTimeout(() => { window.location.href = "/myagapay/login"; }, 900);
      return;
    }
    saveDonorSession(data);
    setDonorStatus("Email verified. Opening My AGAPAY...", "success");
    setTimeout(() => { window.location.href = "/myagapay"; }, 900);
  } catch (err) {
    clearDonorSession();
    setDonorStatus(err.message, "error");
  }
}

function cacheDonorDashboardPayload(data) {
  if (!data) return;
  writeDonorCache("dashboard", data);
  if (data.recentOfferings) {
    writeDonorCache("offerings", {
      offerings: data.recentOfferings,
      summary: data.summary || {}
    });
  }
  if (data.recentCommemorations) {
    writeDonorCache("commemorations", { entries: data.recentCommemorations });
  }
}

function learnTermSummary(dashboard) {
  const term = dashboard?.termProgress || {};
  const percent = Number(term.percent || 0);
  const currentWeek = Number(term.currentWeek || 0);
  const totalWeeks = Number(term.totalWeeks || 0);
  if (currentWeek > 0 && totalWeeks > 0) {
    return `${Math.max(0, Math.min(100, Math.round(percent)))}% complete`;
  }
  return "Set up term";
}

function learnPlannerSummary(dashboard) {
  const term = dashboard?.termProgress || {};
  if (Number(term.currentWeek || 0) > 0 && Number(term.totalWeeks || 0) > 0) {
    return term.label || "Current term active";
  }
  return "Ready";
}

function renderLearnTierStatus(billing) {
  const familyAccess = Boolean(billing?.fullAccess || billing?.plan === "family");
  const tier = document.getElementById("myAgapayLearnTier");
  if (!tier) return;
  tier.classList.toggle("status-good", familyAccess);
  if (familyAccess) {
    tier.textContent = "Ready";
    return;
  }
  tier.innerHTML = `<span class="learn-tier-limited">Limited Free</span><button type="button" class="learn-upgrade-mini" data-myagapay-learn-upgrade>Upgrade now</button>`;
}

function renderLearnSubscriptionSettings(payload = {}) {
  const billing = payload.billing || {};
  const fullAccess = Boolean(payload.fullAccess || payload.plan === "family");
  const status = String(billing.status || (fullAccess ? "active" : "free")).toLowerCase();
  const cancelPending = Boolean(billing.cancelAtPeriodEnd || billing.cancelledAt);
  const currentPeriodEnd = billing.currentPeriodEnd ? shortDate(billing.currentPeriodEnd) : "";

  const statusPill = document.getElementById("learnBillingStatusPill");
  if (statusPill) {
    statusPill.textContent = cancelPending ? "Cancelling" : fullAccess ? "Family Plan" : "Limited Free";
    statusPill.classList.toggle("pending", cancelPending);
  }
  setText("learnBillingPlan", fullAccess ? "AGAPAY Learn Family access is active." : "Limited Free access is active.");
  setText("learnBillingRenewal", cancelPending
    ? `Cancels at period end${currentPeriodEnd ? ` (${currentPeriodEnd})` : ""}.`
    : fullAccess && currentPeriodEnd
      ? `Renews through Stripe on ${currentPeriodEnd}.`
      : fullAccess
        ? "Full access is enabled for this account."
        : "Upgrade to unlock unlimited children, printing, and full reports.");
  setText("learnBillingHelp", cancelPending
    ? "Your Learn subscription has been scheduled for cancellation. You can keep using Learn until Stripe completes the billing-period change."
    : fullAccess
      ? "Canceling stops future renewal through Stripe. Your current My AGAPAY login remains active."
      : "The free plan supports up to two children and limited printing.");

  const cancelButton = document.getElementById("learnCancelSubscriptionButton");
  if (cancelButton) {
    cancelButton.hidden = !billing.stripeSubscriptionId || !fullAccess || cancelPending;
  }
  const upgradeLink = document.getElementById("learnBillingUpgradeLink");
  if (upgradeLink) {
    upgradeLink.hidden = fullAccess && !cancelPending;
  }
}

async function loadLearnSubscriptionSettings() {
  if (!document.getElementById("learnSubscriptionCard")) return;
  try {
    const data = await donorApi("/api/learn/billing/status");
    renderLearnSubscriptionSettings(data);
  } catch (err) {
    setText("learnBillingStatusPill", "Unavailable");
    setText("learnBillingPlan", "AGAPAY Learn billing could not be loaded.");
    setText("learnBillingRenewal", err.message || "Please try again later.");
    const cancelButton = document.getElementById("learnCancelSubscriptionButton");
    if (cancelButton) cancelButton.hidden = true;
  }
}

async function cancelLearnSubscription(button) {
  if (!confirm("Cancel your AGAPAY Learn subscription at the end of the current billing period?")) return;
  const original = button?.textContent || "Cancel Learn subscription";
  if (button) {
    button.disabled = true;
    button.textContent = "Cancelling...";
  }
  try {
    const data = await donorApi("/api/learn/billing/cancel", { method: "POST" });
    renderLearnSubscriptionSettings({ fullAccess: true, plan: "family", billing: data.billing });
    setDonorStatus(data.message || "AGAPAY Learn subscription cancellation scheduled.", "success");
  } catch (err) {
    setDonorStatus(err.message || "Unable to cancel AGAPAY Learn subscription.", "error");
    if (button) {
      button.disabled = false;
      button.textContent = original;
    }
  }
}

async function renderMyAgapayLearnCard() {
  const session = donorSession();
  if (!session.email || !session.token) return;
  setText("myAgapayLearnPlanner", "Loading...");
  setText("myAgapayLearnTerm", "Loading...");
  setHtml("myAgapayLearnTier", "Checking...");

  const [dashboardResult, billingResult] = await Promise.allSettled([
    donorApi("/api/learn/dashboard"),
    donorApi("/api/learn/billing/status")
  ]);

  if (dashboardResult.status === "fulfilled") {
    const dashboard = dashboardResult.value?.dashboard || {};
    setText("myAgapayLearnPlanner", learnPlannerSummary(dashboard));
    setText("myAgapayLearnTerm", learnTermSummary(dashboard));
  } else {
    setText("myAgapayLearnPlanner", "Ready");
    setText("myAgapayLearnTerm", "Set up term");
  }

  if (billingResult.status === "fulfilled") {
    renderLearnTierStatus(billingResult.value);
  } else {
    renderLearnTierStatus({ plan: "free", fullAccess: false });
  }
}

async function openMyAgapayLearnCheckout(button) {
  const original = button?.textContent || "Upgrade now";
  if (button) {
    button.disabled = true;
    button.textContent = "Opening...";
  }
  try {
    if (window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true) {
      window.open("https://agapay.app/learn/pricing?source=myagapay-app", "_blank", "noopener,noreferrer");
      return;
    }
    const data = await donorApi("/api/learn/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ plan: "family" })
    });
    if (data.url) {
      window.location.href = data.url;
      return;
    }
    throw new Error("Stripe checkout did not return a checkout link.");
  } catch (err) {
    setDonorStatus(err.message || "Unable to open Learn checkout.", "error");
    if (button) {
      button.disabled = false;
      button.textContent = original;
    }
  }
}

function renderMyAgapayDashboard(data) {
  const donor = data?.donor || {};
  const summary = data?.summary || {};
  const parish = data?.parish || null;
  const recentOfferings = Array.isArray(data?.recentOfferings) ? data.recentOfferings : [];
  const monthCents = summary.parishNetMonthCents ?? summary.monthCents;
  const ytdCents = summary.parishNetYtdCents ?? summary.ytdCents;
  const latestOffering = recentOfferings[0] || null;

  setText("myAgapayGreetingName", donorDisplayName(donor));
  setText("myAgapayDefaultParish", parish?.name || "Choose a church in Settings");
  renderMyAgapayLearnCard();
  setText("myAgapayGivingParish", parish?.name || "Choose church");
  setText("myAgapayRecurringCount", `${summary.recurringCount || 0} Active`);
  setText("myAgapayRecentAmount", latestOffering ? money(latestOffering.amountCents) : "No gifts yet");
  setText("myAgapayGivingMonth", money(monthCents));
  setText("myAgapaySnapshotMonth", money(monthCents));
  setText("myAgapaySnapshotRecurring", String(summary.recurringCount || 0));
  setText("myAgapaySnapshotCommemorations", String(summary.commemorationCount || 0));

  const activity = document.getElementById("myAgapayActivity");
  if (!activity) return;

  const offeringActivities = recentOfferings.slice(0, 4).map((offering) => ({
    glyph: "G",
    title: `Donation to ${offering.parishName || parish?.name || "your parish"}`,
    meta: `${offering.giftType || "Offering"} - ${shortDate(offering.createdAt)}`,
    value: money(offering.amountCents),
    href: "/myagapay/giving/history"
  }));

  const fallbackActivities = [
    {
      glyph: "L",
      title: "AGAPAY Learn is ready",
      meta: "Open your Orthodox homeschool dashboard",
      value: "View",
      href: "/myagapay/learn"
    },
    {
      glyph: "C",
      title: `${summary.commemorationCount || 0} commemorations recorded`,
      meta: "Names submitted through AGAPAY",
      value: "View",
      href: "/myagapay/giving/commemorations"
    }
  ];

  const activities = offeringActivities.length
    ? offeringActivities.concat(fallbackActivities).slice(0, 5)
    : fallbackActivities;

  activity.innerHTML = activities.map((item) => `
    <div class="my-agapay-activity-item">
      <span class="activity-dot">${escapeHtml(item.glyph)}</span>
      <div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.meta)}</span></div>
      <a class="activity-amount" href="${escapeHtml(item.href)}">${escapeHtml(item.value)}</a>
    </div>
  `).join("");
}

function renderDonorDashboardPayload(data, { renderPledge = true, syncGivingTier = true } = {}) {
  if (!data) return;
  setDonorProfile(data.donor);
  const summary = data.summary || {};
  const parish = data.parish || null;
  const recentOfferings = data.recentOfferings || [];
  renderMyAgapayDashboard(data);

  setText("metricMonth", money(summary.parishNetMonthCents ?? summary.monthCents));
  setText("metricYtd", money(summary.parishNetYtdCents ?? summary.ytdCents));
  setText("metricOfferings", String(summary.offeringCount || 0));
  setText("metricCommemorations", String(summary.commemorationCount || 0));
  setText("metricRecurring", String(summary.recurringCount || 0));
  setText("donorParishName", parish?.name || "Choose a church in Settings");
  setText("desktopMetricMonth", money(summary.parishNetMonthCents ?? summary.monthCents));
  setText("desktopMetricYtd", money(summary.parishNetYtdCents ?? summary.ytdCents));
  setText("desktopMetricOfferings", String(summary.offeringCount || 0));
  setText("desktopMetricCommemorations", String(summary.commemorationCount || 0));
  setText("desktopParishName", parish?.name || "Choose a church in Settings to personalize your dashboard.");
  renderRecurringHomeCard(summary);

  if (renderPledge) renderPledgeTracker(data.donor, summary, parish);
  updateQuickGiveLinks(parish, { syncGivingTier });
  renderActiveCampaigns(parish, { confirmed: true });
  renderNextFeast(parish, { confirmed: true });
  renderActiveFunds(parish, { confirmed: true });

  const recent = document.getElementById("recentOfferings");
  if (recent) recent.innerHTML = offeringRows(recentOfferings);
  const desktopRecent = document.getElementById("desktopRecentOfferings");
  if (desktopRecent) desktopRecent.innerHTML = offeringRows(recentOfferings);
}

function renderRecurringHomeCard(summary = {}) {
  const hasRecurring = Number(summary.recurringCount || 0) > 0;
  ["desktop", "mobile", "history"].forEach((layout) => {
    const button = document.getElementById(`${layout}RecurringHomeAction`);
    const copy = document.getElementById(`${layout}RecurringHomeCopy`);
    if (!button || !copy) return;
    if (hasRecurring) {
      button.type = "button";
      button.innerHTML = `${layout === "mobile" ? "Manage" : "Manage recurring giving"} <span aria-hidden="true">→</span>`;
      button.onclick = () => openDonorRecurringPortal("", button);
      copy.textContent = layout === "mobile"
        ? "Update a recurring offering or payment method securely."
        : "Review recurring offerings, update payment details, or make changes securely through Stripe.";
    } else {
      button.type = "button";
      button.innerHTML = `Start recurring giving <span aria-hidden="true">→</span>`;
      button.onclick = () => { window.location.href = "/myagapay/giving/give?frequency=monthly"; };
      copy.textContent = "Set up a dependable monthly offering to support your parish.";
    }
  });
}

async function requestDonorAccountDeletion(event) {
  event.preventDefault();
  const button = document.getElementById("deleteAccountButton");
  const status = document.getElementById("deleteAccountStatus");
  const confirmation = document.getElementById("deletionConfirmation")?.value || "";
  const currentPassword = document.getElementById("deletionCurrentPassword")?.value || "";
  if (confirmation !== "DELETE") {
    if (status) status.textContent = "Type DELETE exactly to continue.";
    return;
  }
  if (!confirm("Request permanent deletion of your My AGAPAY account and associated personal data?")) return;
  if (button) { button.disabled = true; button.textContent = "Submitting request…"; }
  try {
    const data = await donorApi("/api/donor/account-deletion", {
      method: "POST",
      body: JSON.stringify({ currentPassword, confirmation, source: "myagapay-account-settings" })
    });
    if (status) status.textContent = data.message || "Your account deletion request was received.";
    clearDonorSession();
    window.setTimeout(() => { window.location.href = "/account-deletion?requested=1"; }, 900);
  } catch (err) {
    if (status) status.textContent = err.message || "Unable to submit the deletion request.";
    if (button) { button.disabled = false; button.textContent = "Request account deletion"; }
  }
}

function primeDonorDashboardParishUi() {
  if (!document.body.classList.contains("showing-giving-dashboard")) return;
  // Do not paint personalized dashboard cache on navigation. Even a recent,
  // correctly keyed cache can become wrong immediately after a parish,
  // pledge, campaign, fund, or publication change. The page-level hydration
  // shield keeps this honest loading state visible until the live snapshot is
  // rendered atomically.
  setGivingTierTilesLoading();
  renderHomeParishWidgetsLoading();
}

async function loadDonorDashboardPage() {
  const session = donorSession();
  if (!session.email || !session.token) {
    if (redirectToMyAgapayLogin("signin-required")) return;
    showGuestDonorDashboard();
    return;
  }
  try {
    const data = await donorApi("/api/donor/dashboard");
    cacheDonorDashboardPayload(data);
    renderDonorDashboardPayload(data);
    setDonorStatus("");
  } catch (err) {
    if (isDonorUnauthorized(err)) {
      if (redirectToMyAgapayLogin("session-expired")) return;
      clearDonorSession();
      showGuestDonorDashboard();
      return;
    }
    clearDonorCache("dashboard");
    ["pledgeTrackerCard", "desktopPledgeTracker"].forEach((id) => {
      const card = document.getElementById(id);
      if (card) card.hidden = true;
    });
    setDonorStatus(err.message, "error");
  }
}

async function loadDonorSettingsPage() {
  await loadPublicParishes("defaultParishId");
  const session = donorSession();
  if (!session.email || !session.token) {
    setDonorStatus("Log in to update My AGAPAY account settings.", "error");
    return;
  }
  try {
    const data = await donorApi("/api/donor/dashboard");
    setDonorProfile(data.donor);
    const donor = data.donor || {};
    const setValue = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.value = value || "";
    };
    setValue("settingsName", donor.donorName || donor.householdName);
    setValue("settingsEmail", donor.email);
    setValue("settingsPhone", donor.contactPhone);
    setValue("defaultParishId", donor.defaultParishId);
    const pledgeEl = document.getElementById("pledgeAmount");
    if (pledgeEl) pledgeEl.value = donor.pledgeAmountCents ? (donor.pledgeAmountCents / 100).toFixed(2) : "";
    const pledgeCadence = donor.pledgeCadence === "monthly" ? "monthly" : "annual";
    const pledgeCadenceEl = document.querySelector(`input[name="pledgeCadence"][value="${pledgeCadence}"]`);
    if (pledgeCadenceEl) pledgeCadenceEl.checked = true;
    updatePledgeCadenceHelp();
    setValue("settingsAddressLine1", donor.addressLine1);
    setValue("settingsAddressLine2", donor.addressLine2);
    setValue("settingsCity", donor.city);
    setValue("settingsState", donor.state);
    setValue("settingsPostalCode", donor.postalCode);
    setValue("settingsCountry", donor.country || "US");
    const parishName = document.getElementById("settingsParishName");
    if (parishName) parishName.textContent = data.parish?.name || "Choose a parish below";
    const directorySettingsCard = document.getElementById("directorySettingsCard");
    if (directorySettingsCard) directorySettingsCard.hidden = data.parish?.directoryEnabled !== true;
    await loadLearnSubscriptionSettings();
    await loadGivingStatements();
  } catch (err) {
    setDonorStatus(err.message, "error");
    await loadLearnSubscriptionSettings();
    await loadGivingStatements();
  }
}

async function loadGivingStatements() {
  const wrap = document.getElementById("givingStatementsList");
  if (!wrap) return;
  try {
    const data = await donorApi("/api/donor/giving-statements");
    const statements = data.statements || [];
    if (!statements.length) {
      wrap.innerHTML = '<p class="form-help">No giving statements yet. A parish will generate one after they run their annual statement batch.</p>';
      return;
    }
    const byYear = new Map();
    for (const s of statements) {
      if (!byYear.has(s.fiscalYear)) byYear.set(s.fiscalYear, []);
      byYear.get(s.fiscalYear).push(s);
    }
    const years = Array.from(byYear.keys()).sort((a, b) => b - a);
    wrap.innerHTML = years.map((year) => `
      <div class="section-divider"><span>${year}</span></div>
      <div class="giving-statement-rows">
        ${byYear.get(year).map((s) => `
          <div class="giving-statement-row" style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--hairline, #e5e5e5);">
            <div>
              <div style="font-weight:600;">${escapeHtml(s.parishName)}</div>
              <div class="form-help" style="margin:0;">${(s.totalCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} · ${s.giftCount} gift${s.giftCount === 1 ? "" : "s"}</div>
            </div>
            <button class="btn btn-ghost btn-sm" onclick="downloadGivingStatement('${s.id}', ${s.fiscalYear})">Download PDF</button>
          </div>`).join("")}
      </div>`).join("");
  } catch (err) {
    wrap.innerHTML = `<p class="form-help">${escapeHtml(err.message)}</p>`;
  }
}

async function downloadGivingStatement(id, fiscalYear) {
  try {
    const session = donorSession();
    const res = await fetch(`/api/donor/giving-statements/${encodeURIComponent(id)}/download`, {
      headers: { Authorization: `Bearer ${session.token}`, "X-AGAPAY-Donor-Email": session.email }
    });
    if (!res.ok) throw new Error("Unable to download that statement.");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fiscalYear}-giving-statement.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (err) {
    setDonorStatus(err.message, "error");
  }
}

async function saveDonorSettings(event) {
  event.preventDefault();
  const body = {
    donorName: document.getElementById("settingsName")?.value.trim(),
    householdName: document.getElementById("settingsName")?.value.trim(),
    email: document.getElementById("settingsEmail")?.value.trim(),
    contactPhone: document.getElementById("settingsPhone")?.value.trim(),
    defaultParishId: document.getElementById("defaultParishId")?.value,
    pledgeAmountCents: Math.round((parseFloat(document.getElementById("pledgeAmount")?.value || "0") || 0) * 100),
    pledgeCadence: document.querySelector('input[name="pledgeCadence"]:checked')?.value === "monthly" ? "monthly" : "annual",
    pledgeYear: String(new Date().getFullYear()),
    addressLine1: document.getElementById("settingsAddressLine1")?.value.trim() || "",
    addressLine2: document.getElementById("settingsAddressLine2")?.value.trim() || "",
    city: document.getElementById("settingsCity")?.value.trim() || "",
    state: document.getElementById("settingsState")?.value.trim() || "",
    postalCode: document.getElementById("settingsPostalCode")?.value.trim() || "",
    country: document.getElementById("settingsCountry")?.value.trim() || "US",
    currentPassword: document.getElementById("currentPassword")?.value,
    newPassword: document.getElementById("newPassword")?.value
  };
  if (!body.donorName || !body.email) {
    setDonorStatus("Name and email are required.", "error");
    return;
  }
  if (body.newPassword && body.newPassword.length < 8) {
    setDonorStatus("New password must be at least 8 characters.", "error");
    return;
  }
  try {
    setDonorStatus("Saving My AGAPAY account settings...");
    const data = await donorApi("/api/donor/dashboard", {
      method: "PATCH",
      body: JSON.stringify(body)
    });
    setDonorProfile(data.donor);
    document.getElementById("currentPassword").value = "";
    document.getElementById("newPassword").value = "";
    setDonorStatus("Donor settings saved.", "success");
    await loadDonorSettingsPage();
  } catch (err) {
    setDonorStatus(err.message, "error");
  }
}

function updatePledgeCadenceHelp() {
  const cadence = document.querySelector('input[name="pledgeCadence"]:checked')?.value === "monthly" ? "monthly" : "annual";
  setText("pledgeAmountLabel", cadence === "monthly" ? "Monthly pledge amount" : "Annual pledge amount");
  setText("pledgeCadenceHelp", cadence === "monthly"
    ? "Your monthly stewardship pledge in dollars. Your dashboard compares it with this month's stewardship giving."
    : "Your annual stewardship pledge in dollars. Your dashboard compares it with this year's stewardship giving.");
}

function commemorationWeekStart(date = new Date()) {
  const end = new Date(date);
  const start = new Date(end);
  start.setDate(start.getDate() - 7);
  return start;
}

function isCurrentWeekCommemoration(item, weekStart = commemorationWeekStart(), now = new Date()) {
  const created = new Date(item?.createdAt || item?.updatedAt || 0);
  return !Number.isNaN(created.getTime()) && created >= weekStart && created <= now;
}

function commemorationEntriesForDisplay(entries) {
  const now = new Date();
  const weekStart = commemorationWeekStart(now);
  const year = now.getFullYear();
  const sorted = [...entries].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  return {
    thisWeek: sorted.filter((item) => isCurrentWeekCommemoration(item, weekStart, now)),
    thisYear: sorted.filter((item) => !isCurrentWeekCommemoration(item, weekStart, now) && new Date(item.createdAt || 0).getFullYear() === year),
    older: sorted.filter((item) => !isCurrentWeekCommemoration(item, weekStart, now) && new Date(item.createdAt || 0).getFullYear() !== year)
  };
}

function commemorationRow(item, tone = "pending") {
  const living = (item.living || []).join(", ") || "None";
  const departed = (item.departed || []).join(", ") || "None";
  const parish = item.parishName
    || (window.agapayPublicParishes || []).find((entry) => entry.id === item.parishId)?.name
    || item.parishId
    || donorProfile()?.defaultParishId
    || "Parish";
  return `<div class="list-item"><div class="list-main"><strong>${escapeHtml(item.giftType || "Commemoration")}</strong><span>${escapeHtml(parish)} - ${shortDate(item.createdAt)}</span><span>Living: ${escapeHtml(living)}</span><span>Departed: ${escapeHtml(departed)}</span><span class="status-pill ${tone}">${tone === "success" ? "submitted this week" : "queued for Saturday"}</span></div></div>`;
}

function commemorationSection(title, entries, tone) {
  if (!entries.length) return "";
  return `<div class="section-gap"><div class="form-label" style="margin-bottom:10px;">${escapeHtml(title)}</div>${entries.map((item) => commemorationRow(item, tone)).join("")}</div>`;
}

function commemorationRows(entries) {
  if (!entries.length) return '<div class="notice">No commemoration submissions have been recorded yet.</div>';
  const grouped = commemorationEntriesForDisplay(entries);
  return [
    commemorationSection("Submitted this week", grouped.thisWeek, "success"),
    commemorationSection("Earlier this year", grouped.thisYear, "pending"),
    commemorationSection("Older commemorations", grouped.older, "pending")
  ].join("") || '<div class="notice">No commemoration submissions have been recorded yet.</div>';
}

function donorDefaultParish() {
  const donor = donorProfile();
  if (!donor?.defaultParishId) return null;
  return (window.agapayPublicParishes || []).find((parish) => parish.id === donor.defaultParishId) || donor.defaultParish || null;
}

function primeCommemorationParishDisplay() {
  const donor = donorProfile();
  const parish =
    donorDefaultParish()
    || (donor?.defaultParishId ? { id: donor.defaultParishId, name: donor.defaultParishName || donor.defaultParishId } : null);
  renderCommemorationParish(parish);
}

function renderCommemorationParish(parish) {
  const display = document.getElementById("commemorationParishDisplay");
  const hidden = document.getElementById("commemorationParishId");
  if (display) {
    display.textContent = parish
      ? [parish.name, [parish.city, parish.state].filter(Boolean).join(", ")].filter(Boolean).join(" - ")
      : "Choose your parish in Settings before submitting commemorations.";
  }
  if (hidden) hidden.value = parish?.id || "";
}

function commemorationNameCount(list) {
  return (Array.isArray(list) ? list : []).reduce((sum, entry) =>
    sum + (Array.isArray(entry.living) ? entry.living.length : 0)
        + (Array.isArray(entry.departed) ? entry.departed.length : 0), 0);
}

function renderCandleList(candleOfferings) {
  const el = document.getElementById("candleList");
  if (!el) return;
  if (!candleOfferings.length) {
    el.innerHTML = '<div class="notice">No candle offerings yet. Offer a candle above and its intentions join your parish prayer list.</div>';
    return;
  }
  el.innerHTML = candleOfferings.slice(0, 8).map((offering) => {
    const names = [
      ...(Array.isArray(offering.living) ? offering.living : []),
      ...(Array.isArray(offering.departed) ? offering.departed : [])
    ];
    const when = typeof shortDate === "function" ? shortDate(offering.createdAt || offering.date) : "";
    const parish = offering.parishName || offering.parishId || "Parish";
    const cents = offering.amountCents || offering.giftAmountCents;
    const amount = cents && typeof money === "function" ? money(cents) : "";
    return `<div class="commem-candle-row">
      <span class="commem-candle-flame" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 3c0 0-4 3-4 8s4 5 4 5 4 0 4-5-4-8-4-8z" fill="#DABB70"/><path d="M12 16v5" stroke="#8a6a2a" stroke-width="1.6" stroke-linecap="round"/></svg></span>
      <span class="commem-candle-main"><strong>${names.length ? escapeHtml(names.join(", ")) : "Candle offering"}</strong><small>${escapeHtml(parish)}${when ? " &middot; " + escapeHtml(when) : ""}</small></span>
      ${amount ? `<span class="commem-candle-amt">${amount}</span>` : ""}
    </div>`;
  }).join("");
}

function renderCommemorationInsights(entries, dashboard) {
  if (!document.getElementById("commemMetricNames")) return;
  const offerings = Array.isArray(dashboard?.offerings) ? dashboard.offerings : [];
  const summary = dashboard?.summary || {};
  const candleOfferings = offerings.filter((o) => /candle/i.test(String(o.giftType || o.type || "")));
  const totalNames = Number.isFinite(summary.commemorationCount) && summary.commemorationCount > 0
    ? summary.commemorationCount
    : commemorationNameCount(entries);
  const now = new Date();
  const thisYear = now.getFullYear();
  const inThisYear = (ts) => { const d = new Date(ts); return !isNaN(d) && d.getFullYear() === thisYear; };
  const namesThisYear = commemorationNameCount(entries.filter((e) => inThisYear(e.createdAt || e.submittedAt || e.date)));
  const allDates = [...offerings, ...entries]
    .map((x) => new Date(x.createdAt || x.submittedAt || x.date))
    .filter((d) => !isNaN(d));
  const sinceYear = allDates.length ? Math.min(...allDates.map((d) => d.getFullYear())) : thisYear;
  setText("commemMetricNames", String(totalNames));
  setText("commemMetricCandles", String(candleOfferings.length));
  setText("commemMetricYear", String(namesThisYear));
  setText("commemMetricSince", String(sinceYear));
  renderCandleList(candleOfferings);
}

function renderCommemorationsPayload(payload = {}, fallbackDashboard = null) {
  const entries = Array.isArray(payload.entries) && payload.entries.length
    ? payload.entries
    : fallbackDashboard?.recentCommemorations || [];
  const list = document.getElementById("commemorationList");
  if (list) {
    list.innerHTML = entries.length
      ? commemorationRows(entries)
      : '<div class="notice">No commemoration submissions have been recorded yet.</div>';
  }
  renderCommemorationInsights(entries, fallbackDashboard);
  return { entries };
}

async function loadDonorCommemorationsPage() {
  const session = donorSession();
  toggleCommemorationGiftFields();
  primeCommemorationParishDisplay();
  const list = document.getElementById("commemorationList");
  if (!session.email || !session.token) {
    if (list) list.innerHTML = '<div class="notice">Sign in to view your commemoration history.</div>';
    return;
  }

  const cachedParishes = readDonorCache("parishes");
  if (Array.isArray(cachedParishes?.parishes)) {
    window.agapayPublicParishes = cachedParishes.parishes;
    primeCommemorationParishDisplay();
  }
  const cachedDashboard = readDonorCache("dashboard");
  const cachedCommemorations = readDonorCache("commemorations");
  if (cachedDashboard?.donor) setDonorProfile(cachedDashboard.donor);
  if (cachedDashboard?.parish) renderCommemorationParish(cachedDashboard.parish);
  if (cachedCommemorations || cachedDashboard) renderCommemorationsPayload(cachedCommemorations || {}, cachedDashboard);

  try {
    const [parishesResult, dashboardResult, commemorationsResult] = await Promise.allSettled([
      fetchPublicParishes(),
      donorApi("/api/donor/dashboard"),
      donorApi("/api/donor/commemorations")
    ]);

    if (dashboardResult.status === "rejected" && isDonorUnauthorized(dashboardResult.reason)) throw dashboardResult.reason;
    if (commemorationsResult.status === "rejected" && isDonorUnauthorized(commemorationsResult.reason)) throw commemorationsResult.reason;

    if (parishesResult.status === "fulfilled") {
      window.agapayPublicParishes = parishesResult.value || [];
      writeDonorCache("parishes", { parishes: window.agapayPublicParishes });
      primeCommemorationParishDisplay();
    }

    const dashboard = dashboardResult.status === "fulfilled" ? dashboardResult.value : cachedDashboard;
    if (dashboard?.donor) setDonorProfile(dashboard.donor);
    renderCommemorationParish(dashboard?.parish || donorDefaultParish());
    if (dashboardResult.status === "fulfilled") writeDonorCache("dashboard", dashboard);

    const commemorations = commemorationsResult.status === "fulfilled" ? commemorationsResult.value : cachedCommemorations;
    if (!commemorations && !dashboard) throw commemorationsResult.reason || dashboardResult.reason || new Error("Unable to load commemorations");
    const rendered = renderCommemorationsPayload(commemorations || {}, dashboard);
    writeDonorCache("commemorations", rendered);
  } catch (err) {
    if (isDonorUnauthorized(err)) {
      clearDonorSession();
      if (list) list.innerHTML = '<div class="notice">Session expired. Please sign in again.</div>';
      return;
    }
    renderCommemorationParish(donorDefaultParish());
    if (list) list.innerHTML = `<div class="notice">${escapeHtml(err.message)} Sign in from the donor home page first.</div>`;
  }
}

function linesFromField(id) {
  return (document.getElementById(id)?.value || "").split(/\n+/).map((value) => value.trim()).filter(Boolean);
}

function toggleCommemorationGiftFields() {
  const includeGift = document.getElementById("commemorationIncludeGift")?.checked === true;
  ["commemorationAmountField", "commemorationCoverFeesField", "commemorationPaymentField"].forEach((id) => {
    const field = document.getElementById(id);
    if (field) field.hidden = !includeGift;
  });
  const submit = document.getElementById("commemorationSubmitButton");
  if (submit) submit.textContent = includeGift ? "Continue to checkout" : "Submit commemoration";
}

function selectedDonorPaymentMethod(frequency = "once") {
  return "card";
}

async function submitCommemoration(event) {
  event.preventDefault();
  const living = linesFromField("commemorationLivingNames");
  const departed = linesFromField("commemorationDepartedNames");
  const parishId = document.getElementById("commemorationParishId")?.value || donorProfile()?.defaultParishId || "";
  const amount = document.getElementById("amount")?.value || "5";
  const commemorationKind = document.querySelector('input[name="commemorationServiceKind"]:checked')?.value || "proskomedia_liturgy";
  if (!living.length && !departed.length) {
    setDonorStatus("Add at least one living or departed name.", "error");
    return;
  }
  if (!parishId) {
    setDonorStatus("Choose your parish in Settings before submitting commemorations.", "error");
    return;
  }
  try {
    const session = donorSession();
    const donor = donorProfile();
    if (!session.email || !session.token) {
      setDonorStatus("Sign in from the donor home page before submitting commemorations.", "error");
      return;
    }
    const name = donor.donorName || donor.householdName || session.email.split("@")[0];
    const [firstName, ...rest] = name.split(/\s+/);
    const includeGift = document.getElementById("commemorationIncludeGift")?.checked === true;
    const rawNote = document.getElementById("commemorationIntentionNote")?.value || "";
    const liturgyDate = document.getElementById("commemorationLiturgyDate")?.value || "";
    const note = [liturgyDate ? `Requested Liturgy date: ${liturgyDate}` : "", rawNote].filter(Boolean).join("\n");
    if (!includeGift) {
      setDonorStatus("Submitting commemoration...");
      const data = await donorApi("/api/donor/commemorations", {
        method: "POST",
        body: JSON.stringify({
          parishId,
          namesLiving: living.join("\n"),
          namesDeparted: departed.join("\n"),
          commemorationKind,
          note
        })
      });
      renderCommemorationsPayload(data);
      document.getElementById("commemorationLivingNames").value = "";
      document.getElementById("commemorationDepartedNames").value = "";
      const liturgyDateInput = document.getElementById("commemorationLiturgyDate");
      if (liturgyDateInput) liturgyDateInput.value = "";
      document.getElementById("commemorationIntentionNote").value = "";
      setDonorStatus("Commemoration submitted. Thank you for sending these names.", "success");
      return;
    }

    setDonorStatus("Preparing commemoration checkout...");
    const data = await donorApi("/api/create-checkout-session", {
      method: "POST",
      body: JSON.stringify({
        parishId,
        giftType: "commemoration",
        amount,
        frequency: "once",
        firstName: firstName || "AGAPAY",
        lastName: rest.join(" "),
        email: session.email,
        namesLiving: living.join("\n"),
        namesDeparted: departed.join("\n"),
        commemorationKind,
        inMemoriam: note,
        paymentMethod: selectedDonorPaymentMethod("once"),
        coverFees: document.getElementById("coverFees")?.checked !== false,
        ...(window.agapaySecurityPayload ? window.agapaySecurityPayload() : {})
      })
    });
    if (data.url) window.location.href = data.url;
    else setDonorStatus(data.message || "Checkout is not available yet.", "error");
  } catch (err) {
    setDonorStatus(err.message, "error");
  }
}

async function startDonorCheckout(event) {
  event.preventDefault();
  const session = donorSession();
  const donor = donorProfile();
  if (!session.email || !session.token) {
    setDonorStatus("Sign in from the donor home page before starting checkout.", "error");
    return;
  }
  const name = donor.donorName || donor.householdName || session.email.split("@")[0];
  const [firstName, ...rest] = name.split(/\s+/);
  const giftType = document.getElementById("giftType")?.value;
  const normalizedGiftType = normalizeDonorGiftType(giftType);
  const parish = (window.agapayPublicParishes || [])
    .find((item) => item.id === document.getElementById("parish")?.value);
  if (!parishHasGivingPlus(parish) && isGivingPlusGiftType(normalizedGiftType)) {
    openGivingPlusPaywall(null, parish, normalizedGiftType);
    return;
  }
  const selectedFund = parish
    ?.funds?.find((fund) => [fund.id, fund.name].filter(Boolean).map(String).includes(document.getElementById("fund")?.value));
  const campaign = selectedCampaign();
  const feastDestinationId = campaign?.destinationFundId || "benevolence-fund";
  const feastDestinationFund = normalizedGiftType === "feast"
    ? (Array.isArray(parish?.funds) ? parish.funds : []).find((fund) =>
      [fund?.id, fund?.code, fund?.name].filter(Boolean).map(String).includes(String(feastDestinationId))
    )
    : null;
  const livingNames = normalizedGiftType === "candles"
    ? document.getElementById("candleLivingNames")?.value || ""
    : normalizedGiftType === "commemoration"
      ? document.getElementById("commemorationLivingNames")?.value || ""
      : "";
  const departedNames = normalizedGiftType === "candles"
    ? document.getElementById("candleDepartedNames")?.value || ""
    : normalizedGiftType === "commemoration"
      ? document.getElementById("commemorationDepartedNames")?.value || ""
      : "";
  const intentionNote = normalizedGiftType === "candles"
    ? document.getElementById("candleIntentionNote")?.value || ""
    : normalizedGiftType === "commemoration"
      ? document.getElementById("commemorationIntentionNote")?.value || ""
      : "";
  const commemorationKind = normalizedGiftType === "commemoration"
    ? document.querySelector('input[name="commemorationKind"]:checked')?.value || "proskomedia_liturgy"
    : "";
  // Same "give anonymously" + "message of encouragement" opportunity the
  // public campaign slug page offers, so a My AGAPAY gift surfaces on that
  // page the same way a public-page gift would.
  const publicAnonymous = normalizedGiftType === "campaign"
    ? Boolean(document.getElementById("campaignAnonymous")?.checked)
    : false;
  const publicComment = normalizedGiftType === "campaign"
    ? String(document.getElementById("campaignPublicComment")?.value || "").trim().slice(0, 280)
    : "";
  try {
    setDonorStatus("Preparing checkout...");
    const frequency = document.getElementById("frequency")?.value || "once";
    const paymentMethod = selectedDonorPaymentMethod(frequency);
    const data = await donorApi("/api/create-checkout-session", {
      method: "POST",
      body: JSON.stringify({
        parishId: document.getElementById("parish")?.value,
        giftType,
        amount: document.getElementById("amount")?.value,
        frequency,
        firstName: firstName || "AGAPAY",
        lastName: rest.join(" "),
        email: session.email,
        fund: normalizedGiftType === "feast" ? (feastDestinationFund?.name || "Benevolence Fund") : normalizedGiftType === "fund" ? (selectedFund?.name || document.getElementById("fund")?.value || "") : "",
        fundId: normalizedGiftType === "feast" ? (feastDestinationFund?.id || feastDestinationFund?.code || "benevolence-fund") : normalizedGiftType === "fund" ? (selectedFund?.id || document.getElementById("fund")?.value || "") : "",
        campaign: ["campaign", "feast"].includes(normalizedGiftType) ? campaignLabel(campaign) : "",
        campaignId: ["campaign", "feast"].includes(normalizedGiftType) ? (campaign?.id || campaign?.feastId || document.getElementById("campaign")?.value || "") : "",
        campaignDescription: ["campaign", "feast"].includes(normalizedGiftType) ? campaign?.description || "" : "",
        namesLiving: livingNames,
        namesDeparted: departedNames,
        commemorationKind,
        inMemoriam: intentionNote,
        publicAnonymous,
        publicComment,
        paymentMethod,
        coverFees: document.getElementById("coverFees")?.checked !== false,
        ...(window.agapaySecurityPayload ? window.agapaySecurityPayload() : {})
      })
    });
    if (data.url) window.location.href = data.url;
    else setDonorStatus(data.message || "Checkout is not available yet.", "error");
  } catch (err) {
    setDonorStatus(err.message, "error");
  }
}

async function handleDonorCheckoutReturn() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("gift_success") !== "1") return false;

  const sessionId = params.get("session_id");
  if (!sessionId) {
    setDonorStatus("Your payment was successful. We are still waiting for Stripe's final confirmation.", "success");
    window.history.replaceState(null, "", "/myagapay");
    return true;
  }

  setDonorStatus("Confirming your offering...");
  try {
    const data = await donorApi(`/api/checkout-session-status?session_id=${encodeURIComponent(sessionId)}`, {
      method: "GET"
    });
    if (data.paymentStatus === "paid" || data.status === "completed") {
      setDonorStatus("Payment successful. Your offering has been recorded in your dashboard.", "success");
    } else {
      setDonorStatus(`Stripe returned payment status: ${data.paymentStatus || data.status || "processing"}.`, "info");
    }
  } catch (err) {
    setDonorStatus("Your payment was successful. Stripe confirmation is still processing, so your history may update shortly.", "success");
    console.warn("AGAPAY donor checkout confirmation warning:", err);
  }
  window.history.replaceState(null, "", "/myagapay");
  return true;
}

document.addEventListener("DOMContentLoaded", () => {
  const saved = donorProfile();
  applyDonorNavIcons();
  document.body.removeAttribute("hx-boost");
  document.querySelectorAll(".nav").forEach((nav) => {
    nav.setAttribute("hx-boost", "false");
    nav.removeAttribute("hx-target");
  });
  document.querySelectorAll('.sidebar-footer a[href="/"], .sidebar-footer a[href="/give"], .sidebar-footer a[href="/give"]').forEach((link) => {
    link.setAttribute("hx-boost", "false");
  });
  document.addEventListener("click", (event) => {
    const accountToggle = event.target.closest("[data-donor-account-toggle]");
    const accountMenu = event.target.closest("[data-donor-account-menu]");
    if (accountToggle) {
      const menu = accountToggle.closest("[data-donor-account-menu]");
      const dropdown = menu?.querySelector(".donor-home-account-dropdown");
      const open = accountToggle.getAttribute("aria-expanded") !== "true";
      closeDonorAccountMenus();
      accountToggle.setAttribute("aria-expanded", String(open));
      if (dropdown) dropdown.hidden = !open;
      return;
    }
    if (!accountMenu) closeDonorAccountMenus();
    if (event.target.closest("[data-donor-logout]")) {
      logoutDonor();
      return;
    }

    const upgradeButton = event.target.closest("[data-myagapay-learn-upgrade]");
    if (!upgradeButton) return;
    event.preventDefault();
    openMyAgapayLearnCheckout(upgradeButton);
  });
  if (saved.email) {
    setDonorProfile(saved);
  } else {
    const profileName = document.getElementById("profileName");
    const profileMeta = document.getElementById("profileMeta");
    const greeting = document.getElementById("greeting");
    const desktopGreeting = document.getElementById("desktopGreeting");
    if (profileName) profileName.textContent = "Faithful Account";
    if (profileMeta) profileMeta.textContent = "Sign in to load live giving history";
    setText("donorHomeTopbarName", "Faithful Member");
    if (greeting) greeting.textContent = "Welcome, Faithful Member";
    if (desktopGreeting) desktopGreeting.textContent = "Welcome, Faithful Member";
  }
  primeDonorDashboardParishUi();
  updateDonorAuthState();
  checkDonorNotifications();
  const emailInput = document.getElementById("donorEmail");
  if (emailInput && donorSession().email) emailInput.value = donorSession().email;
  initDonorPasswordResetPage();
});


// ── PLEDGE TRACKER ────────────────────────────────────────────────────────
function renderPledgeTracker(donor, summary, parish) {
  if (!donor) return;
  const trackerEnabled = parish?.pledgeTrackerEnabled === true;
  const pledgeCents = Number(donor.pledgeAmountCents || 0);
  const cadence = donor.pledgeCadence === "monthly" ? "monthly" : "annual";
  const pledgeYear  = String(new Date().getFullYear());
  // Pledge progress counts parish offerings (tithe/stewardship) only — not designated
  // funds, campaigns, candles, or commemorations. See donorSummaryFromOfferings.
  const ytdCents    = Number(summary?.stewardshipYtdCents || 0);
  const trackedCents = cadence === "monthly" ? Number(summary?.stewardshipMonthCents || 0) : ytdCents;
  const periodTitle = cadence === "monthly"
    ? new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" }) + " Pledge"
    : pledgeYear + " Annual Pledge";

  // Mobile tracker
  const mobileCard = document.getElementById("pledgeTrackerCard");
  if (mobileCard) {
    mobileCard.hidden = !parish;
    const activeState = document.getElementById("pledgeActiveState");
    const emptyState  = document.getElementById("pledgeEmptyState");
    const lockedState = document.getElementById("pledgeLockedState");
    if (lockedState) lockedState.hidden = trackerEnabled;
    if (!trackerEnabled) {
      if (activeState) activeState.hidden = true;
      if (emptyState) emptyState.hidden = true;
    } else
    if (!pledgeCents) {
      if (activeState) activeState.hidden = true;
      if (emptyState) emptyState.hidden = false;
    } else {
      if (activeState) activeState.hidden = false;
      if (emptyState) emptyState.hidden = true;
      const pct  = Math.min(100, Math.round((trackedCents / pledgeCents) * 100));
      const fill = document.getElementById("pledgeBarFill");
      const track = document.getElementById("pledgeBarTrack");
      if (fill)  { setTimeout(() => { fill.style.width = pct + "%"; }, 120); fill.classList.toggle("pledge-complete", pct >= 100); }
      if (track) track.setAttribute("aria-valuenow", pct);
      const label = document.getElementById("pledgeTrackerLabel");
      if (label) label.textContent = periodTitle;
      const raised = document.getElementById("pledgeRaised");
      if (raised) raised.textContent = money(trackedCents) + " given";
      const pctEl = document.getElementById("pledgePct");
      if (pctEl)  pctEl.textContent = pct + "%";
      const goal = document.getElementById("pledgeGoal");
      if (goal)   goal.textContent = "of " + money(pledgeCents) + " pledge";
      const editLink = mobileCard.querySelector(".pledge-tracker-edit");
      if (editLink) editLink.href = "/myagapay/account#pledge";
    }
  }

  // Desktop tracker
  const desktopCard = document.getElementById("desktopPledgeTracker");
  if (desktopCard) {
    desktopCard.hidden = !parish;
    const activeState = document.getElementById("desktopPledgeActiveState");
    const emptyState  = document.getElementById("desktopPledgeEmptyState");
    const lockedState = document.getElementById("desktopPledgeLockedState");
    if (lockedState) lockedState.hidden = trackerEnabled;
    if (!trackerEnabled) {
      if (activeState) activeState.hidden = true;
      if (emptyState) emptyState.hidden = true;
    } else
    if (!pledgeCents) {
      if (activeState) activeState.hidden = true;
      if (emptyState) emptyState.hidden = false;
    } else {
      if (activeState) activeState.hidden = false;
      if (emptyState) emptyState.hidden = true;
      const pct  = Math.min(100, Math.round((trackedCents / pledgeCents) * 100));
      const fill = document.getElementById("desktopPledgeBarFill");
      const track = document.getElementById("desktopPledgeBarTrack");
      if (fill)  { setTimeout(() => { fill.style.width = pct + "%"; }, 120); fill.classList.toggle("pledge-complete", pct >= 100); }
      if (track) track.setAttribute("aria-valuenow", pct);
      const title = document.getElementById("desktopPledgeTitle");
      if (title) title.textContent = periodTitle;
      const raised = document.getElementById("desktopPledgeRaised");
      if (raised) raised.textContent = money(trackedCents) + " given";
      const pctEl = document.getElementById("desktopPledgePct");
      if (pctEl)  pctEl.textContent = pct + "%";
      const goal = document.getElementById("desktopPledgeGoal");
      if (goal)   goal.textContent = "of " + money(pledgeCents) + " pledge";
    }
  }
}


// ── Pledge nudge notifications ────────────────────────────────────────────────

let _nudgeQueue = [];
let _nudgeCurrent = null;

async function checkDonorNotifications() {
  const session = donorSession();
  if (!session.email || !session.token) return;
  try {
    const data = await donorApi("/api/donor/notifications");
    const notifications = data.notifications || [];
    if (!notifications.length) return;
    _nudgeQueue = notifications;
    showNextNudge();
  } catch {
    // Silent — never block the dashboard for a failed notification fetch
  }
}

function showNextNudge() {
  if (!_nudgeQueue.length) return;
  _nudgeCurrent = _nudgeQueue.shift();
  const modal     = document.getElementById("pledgeNudgeModal");
  const parishEl  = document.getElementById("nudgeModalParish");
  const messageEl = document.getElementById("nudgeModalMessage");
  const figuresEl = document.getElementById("nudgeModalFigures");
  const giveBtn   = document.getElementById("nudgeModalGiveBtn");
  const dismissBtn = document.getElementById("nudgeModalDismissBtn");
  if (!modal) return;

  const fmt = (cents) => "$" + ((cents || 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const year       = _nudgeCurrent.fiscalYear;
  const pledge     = _nudgeCurrent.pledgeCents;
  const given      = _nudgeCurrent.givenCents;
  const remaining  = Math.max(0, pledge - given);
  const parishId   = _nudgeCurrent.parishId;

  if (parishEl)  parishEl.textContent  = parishId || "Your parish";
  if (messageEl) messageEl.textContent = _nudgeCurrent.message || "";

  if (figuresEl) {
    figuresEl.innerHTML =
      '<div class="nudge-figure"><span>' + year + ' Pledge</span><strong>' + fmt(pledge) + '</strong></div>' +
      '<div class="nudge-figure"><span>Given so far</span><strong>' + fmt(given) + '</strong></div>' +
      '<div class="nudge-figure nudge-figure--remaining"><span>Remaining</span><strong>' + fmt(remaining) + '</strong></div>';
  }

  if (giveBtn) {
    giveBtn.href = "/myagapay?parish=" + encodeURIComponent(parishId) + "&giftType=stewardship";
  }

  if (dismissBtn) {
    dismissBtn.onclick = () => dismissNudge(_nudgeCurrent.id);
  }

  modal.hidden = false;
  document.body.style.overflow = "hidden";

  // Also close on backdrop click
  modal.addEventListener("click", (e) => {
    if (e.target === modal) dismissNudge(_nudgeCurrent?.id);
  }, { once: true });
}

async function dismissNudge(id) {
  const modal = document.getElementById("pledgeNudgeModal");
  if (modal) { modal.hidden = true; document.body.style.overflow = ""; }
  if (id) {
    try {
      await donorApi("/api/donor/notifications/" + encodeURIComponent(id) + "/dismiss", { method: "POST" });
    } catch { /* silent */ }
  }
  // Show next nudge if any
  if (_nudgeQueue.length) {
    setTimeout(showNextNudge, 300);
  }
}
