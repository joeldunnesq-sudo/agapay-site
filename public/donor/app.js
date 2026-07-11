const donorStore = {
  email: "agapayDonorEmail",
  token: "agapayDonorToken",
  donor: "agapayDonorProfile",
  cachePrefix: "agapayDonorCache",
  shellVersion: "agapayDonorShellVersion"
};

const DONOR_SHELL_VERSION = "2026-06-26-pledge-tracker";

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
  return {
    email: localStorage.getItem(donorStore.email) || "",
    token: localStorage.getItem(donorStore.token) || ""
  };
}

function donorAuthHeaders(extra = {}) {
  if (window.MyAgapayShell?.authHeaders) {
    return window.MyAgapayShell.authHeaders({ "Content-Type": "application/json", ...extra });
  }
  const session = donorSession();
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.token}`,
    "X-AGAPAY-Donor-Email": session.email,
    ...extra
  };
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

function readDonorCache(name) {
  const email = donorCacheEmail();
  if (!email) return null;
  try {
    const cached = JSON.parse(localStorage.getItem(donorCacheKey(name)) || "null");
    return cached?.email === email ? cached.data : null;
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
  try {
    return JSON.parse(localStorage.getItem(donorStore.donor) || "{}");
  } catch {
    return {};
  }
}

function setDonorProfile(donor) {
  if (!donor) return;
  localStorage.setItem(donorStore.donor, JSON.stringify(donor));
  if (donor.email) localStorage.setItem(donorStore.email, donor.email);
  const name = donor.householdName || donor.donorName || donor.email || "AGAPAY faithful";
  const profileName = document.getElementById("profileName");
  const profileMeta = document.getElementById("profileMeta");
  if (profileName) profileName.textContent = name;
  if (profileMeta) profileMeta.textContent = donor.defaultParishId ? `${donor.email} - ${donor.defaultParishId}` : donor.email || "Faithful account loaded";
  setText("donorHomeTopbarName", donorDisplayName(donor));
  document.querySelectorAll(".mobile-avatar, .desktop-avatar, .donor-home-mini-avatar").forEach((avatar) => {
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
  if (data?.token) localStorage.setItem(donorStore.token, data.token);
  if (data?.donor) setDonorProfile(data.donor);
  updateDonorAuthState();
}

function clearDonorSession() {
  localStorage.removeItem(donorStore.token);
  localStorage.removeItem(donorStore.donor);
  localStorage.removeItem(donorStore.email);
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
  renderActiveCampaigns(null);
  renderNextFeast(null);
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

const donorGiftTypeCopy = {
  stewardship: {
    eyebrow: "Quick Parish Offering",
    title: "Give to your parish.",
    detailsTitle: "Parish Offering",
    intro: "Tithe, steward, or make a general parish offering in one clean flow.",
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
    intro: "Make an alms offering tied to the Church calendar and routed to the parish Benevolence Fund.",
    context: "Your gift will be routed to the parish Benevolence Fund for the poor and needy."
  }
};

function donorNavIcon(kind) {
  const sharedKind = kind === "giving" ? "give" : kind === "marketplace" ? "market" : kind;
  if (window.MyAgapayShell?.icons?.[sharedKind]) return window.MyAgapayShell.icons[sharedKind];
  const givingHandIcon = '<svg viewBox="0 0 28 28" aria-hidden="true"><path d="M8 15V8.5a1.8 1.8 0 0 1 3.6 0V15"/><path d="M11.6 15V6.5a1.8 1.8 0 0 1 3.6 0V15"/><path d="M15.2 15V8a1.8 1.8 0 0 1 3.6 0v8"/><path d="M18.8 16v-4.2a1.8 1.8 0 0 1 3.6 0V17c0 4.4-3 7-7.6 7H14a8 8 0 0 1-8-8v-2a1.8 1.8 0 0 1 2.4 0L10 16"/><path d="M6.5 21.5c1.6 1.6 3.8 2.5 6.2 2.5"/></svg>';
  const icons = {
    home: '<svg viewBox="0 0 38 38" aria-hidden="true"><line x1="19" y1="2" x2="19" y2="5"/><line x1="17" y1="3.5" x2="21" y2="3.5"/><path d="M19 5 C15 7 13 11 14 14 C15 16 17 17 19 17 C21 17 23 16 24 14 C25 11 23 7 19 5Z"/><line x1="10" y1="6" x2="10" y2="8"/><path d="M10 8 C8 9.5 7 12 7.5 14 C8 15.5 9 16 10 16 C11 16 12 15.5 12.5 14 C13 12 12 9.5 10 8Z"/><line x1="28" y1="6" x2="28" y2="8"/><path d="M28 8 C26 9.5 25 12 25.5 14 C26 15.5 27 16 28 16 C29 16 30 15.5 30.5 14 C31 12 30 9.5 28 8Z"/><rect x="4" y="17" width="30" height="14" rx="1"/><path d="M16 31 L16 25 Q19 22 22 25 L22 31"/></svg>',
    give: givingHandIcon,
    giving: givingHandIcon,
    learn: '<svg viewBox="0 0 28 28" aria-hidden="true"><path d="M5 6.5A4.5 4.5 0 0 1 9.5 2H23v20H9.5A4.5 4.5 0 0 0 5 26z"/><path d="M5 6.5V26"/><path d="M10 7h8"/><path d="M10 11h7"/></svg>',
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

// Sacraments is wired but not yet generally available. Its entry point is shown
// only for demo/internal parishes (currently St. Fiacre) and stays hidden for
// every real parish until the feature is fully launched.
const DEMO_PARISH_IDS = ["st-fiacre"];

function isDemoParishId(id) {
  return DEMO_PARISH_IDS.includes(String(id || "").toLowerCase());
}

function syncSacramentsEntry(parish) {
  const demo = isDemoParishId(parish?.id);
  document.querySelectorAll("[data-sacraments-entry]").forEach((el) => {
    el.hidden = !demo;
  });
}

function updateQuickGiveLinks(parish) {
  const parishLink = document.getElementById("quickGiveParish");
  const parishIcon = document.getElementById("quickGiveParishIcon");
  const desktopParishIcon = document.getElementById("desktopParishIcon");
  const candleLink = document.getElementById("quickGiveCandle");
  const memorialLink = document.getElementById("quickGiveMemorial");
  const feastLink = document.getElementById("quickGiveFeast");
  const campaignLink = document.getElementById("quickGiveCampaigns");
  const desktopParishLink = document.getElementById("desktopQuickParish");
  const desktopCandleLink = document.getElementById("desktopQuickCandle");
  const desktopMemorialLink = document.getElementById("desktopQuickMemorial");
  const desktopFeastLink = document.getElementById("desktopQuickFeast");
  const desktopCampaignLink = document.getElementById("desktopQuickCampaigns");
  if (parishLink) parishLink.href = quickDonorGiftUrl("stewardship", parish);
  if (desktopParishLink) desktopParishLink.href = quickDonorGiftUrl("stewardship", parish);
  if (parishIcon) parishIcon.innerHTML = communityIconSvg(parish?.type);
  if (desktopParishIcon) desktopParishIcon.innerHTML = communityIconSvg(parish?.type);
  if (candleLink) candleLink.href = quickDonorGiftUrl("candles", parish);
  if (desktopCandleLink) desktopCandleLink.href = quickDonorGiftUrl("candles", parish);
  if (memorialLink) memorialLink.href = quickDonorGiftUrl("commemoration", parish);
  if (desktopMemorialLink) desktopMemorialLink.href = quickDonorGiftUrl("commemoration", parish);
  if (feastLink) feastLink.href = quickDonorGiftUrl("feast", parish);
  if (desktopFeastLink) desktopFeastLink.href = quickDonorGiftUrl("feast", parish);
  if (campaignLink) campaignLink.href = quickDonorGiftUrl("campaign", parish);
  if (desktopCampaignLink) desktopCampaignLink.href = quickDonorGiftUrl("campaign", parish);
  syncSacramentsEntry(parish);
}

function activeParishCampaigns(parish) {
  const campaigns = [
    ...(Array.isArray(parish?.campaigns) ? parish.campaigns : []),
    ...(Array.isArray(parish?.feastCampaigns) ? parish.feastCampaigns : [])
  ];
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
  return activeParishCampaigns(selectedPublicParish()).find((campaign) => {
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
    const campaigns = activeParishCampaigns(parish);
    campaignSelect.innerHTML = campaigns.length
      ? campaigns.map((campaign) => `<option value="${escapeHtml(campaign.id || campaign.feastId || campaign.name || campaign.campaignName)}">${escapeHtml(campaignLabel(campaign))}</option>`).join("")
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

function renderActiveCampaigns(parish) {
  const targets = [document.getElementById("activeCampaigns"), document.getElementById("desktopActiveCampaigns")].filter(Boolean);
  if (!targets.length) return;
  const campaign = activeParishCampaigns(parish)[0];
  if (!campaign) {
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

function renderActiveFunds(parish) {
  const targets = [document.getElementById("activeFunds"), document.getElementById("desktopActiveFunds")].filter(Boolean);
  if (!targets.length) return;
  const funds = (Array.isArray(parish?.funds) ? parish.funds : [])
    .filter((fund) => fund && fund.active !== false && String(fund.status || "active").toLowerCase() !== "archived")
    .slice(0, 4);
  if (!funds.length) {
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

function renderNextFeast(parish) {
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

function calendarShortDateIso(value) {
  if (!value) return "--";
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    const [year, month, day] = String(value).split("-").map((part) => Number(part));
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(year, month - 1, day));
  }
  return shortDate(value);
}

function annualIsoFromParishDate(value, year) {
  const raw = String(value || "").trim();
  const iso = /^\d{4}-(\d{2})-(\d{2})$/.exec(raw);
  const short = /^(\d{1,2})[/-](\d{1,2})$/.exec(raw);
  const month = iso ? Number(iso[1]) : short ? Number(short[1]) : 0;
  const day = iso ? Number(iso[2]) : short ? Number(short[2]) : 0;
  if (!month || !day) return "";
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parishPatronalFeastForYear(parish, year, calendar, feasts) {
  if (!parish) return null;
  const selected = String(parish.patronalFeast || parish.parishPatronalFeast || parish.patronalFeastId || "").trim();
  const customName = String(parish.parishPatronalFeastName || parish.patronalFeastName || "").trim();
  const parishName = parish.name || parish.parishName || "Your parish";
  if (selected) {
    const match = feasts.find((feast) => feast.id === selected || feast.name === selected);
    if (match) return { ...match, rank: "patronal", name: customName || match.name };
  }

  const customDate = annualIsoFromParishDate(parish.parishPatronalFeastDate || parish.patronalFeastDate, year);
  if (!customDate) return null;
  const [civilYear, civilMonth, civilDay] = customDate.split("-").map(Number);
  return {
    id: "parish-patronal-feast",
    name: customName || `${parishName} Patronal Feast`,
    type: "parish",
    rank: "patronal",
    calendar,
    date: customDate,
    displayDate: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(civilYear, civilMonth - 1, civilDay))
  };
}

const donorCalendarState = {
  liturgicalDay: null,
  calendar: "julian",
  date: ""
};

function todayIsoLocal() {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

function longDateParts(value) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))
    ? new Date(`${value}T12:00:00`)
    : new Date();
  return {
    weekday: new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(date),
    monthDay: new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric" }).format(date),
    year: new Intl.DateTimeFormat("en-US", { year: "numeric" }).format(date),
    dayNum: new Intl.DateTimeFormat("en-US", { day: "numeric" }).format(date),
    monthYear: new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(date)
  };
}

function liturgicalRankLabel(rank = "") {
  const key = String(rank || "").toLowerCase();
  if (key.includes("great")) return "Great Feast";
  if (key.includes("major")) return "Major Feast";
  if (key.includes("holy-week")) return "Holy Week";
  if (key.includes("bright-week")) return "Bright Week";
  if (key.includes("fast")) return "Fast";
  if (key.includes("season")) return "Season";
  return "";
}

function isFastRule(rule = "") {
  return /fast/i.test(String(rule || "")) && !/no fast/i.test(String(rule || ""));
}

function toneOfWeekLabel(tone = "") {
  const text = String(tone || "").trim();
  if (!text) return "";
  const number = text.match(/\b(\d+)\b/);
  return number ? `Tone of the Week ${number[1]}` : text.replace(/^Tone\b/i, "Tone of the Week");
}

function saintDisplayTitle(day = {}) {
  const stories = Array.isArray(day.saintStories) ? day.saintStories : [];
  const names = Array.isArray(day.saints) ? day.saints : [];
  return stories[0]?.name || stories[0]?.title || names[0] || "Lives of the Saints";
}

function saintStoryModalHtml(saints = [], unavailableMessage = "") {
  if (unavailableMessage) return `<div class="donor-saint-empty">${escapeHtml(unavailableMessage)}</div>`;
  if (!saints.length) return `<div class="donor-saint-empty">No saint life is listed for this day yet. Please try again later.</div>`;
  return saints.map((saint) => {
    const paragraphs = String(saint.storyText || "").split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
    return `
      <article class="donor-saint-story">
        <div class="donor-saint-story-head">
          ${saint.iconUrl ? `<img src="${escapeHtml(saint.iconUrl)}" alt="" />` : `<span>✥</span>`}
          <div>
            <h3>${escapeHtml(saint.name || saint.title || "Saint of the Day")}</h3>
            ${saint.reposeCentury ? `<small>${escapeHtml(saint.reposeCentury)}</small>` : ""}
            ${saint.feastRank ? `<small>${escapeHtml(saint.feastRank)}</small>` : ""}
          </div>
        </div>
        ${paragraphs.length ? paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("") : `<p>A life-story text is not listed for this commemoration.</p>`}
      </article>
    `;
  }).join("");
}

function renderDonorTodayInChurch(parish, payload) {
  const calendar = parish?.liturgicalCalendar || donorProfile()?.defaultParish?.liturgicalCalendar || donorProfile()?.liturgicalCalendar || "julian";
  const date = payload?.date || todayIsoLocal();
  const parts = longDateParts(date);
  const today = payload?.today || {};
  const feast = payload?.feast || null;
  const feastTitle = today.feastTitle || feast?.name || (parts.weekday === "Sunday" ? "The Lord's Day" : "Today in the Church");
  const fastingRule = today.fastingRule || (feast?.rank === "fast" ? "Fast" : "No Fast");
  const saintTitle = saintDisplayTitle(today);
  const stories = Array.isArray(today.saintStories) ? today.saintStories : [];
  const saintNames = Array.isArray(today.saints) ? today.saints : [];
  const firstStory = stories[0] || {};
  const giveHref = donorGiftUrl("feast", parish, { feast: feastTitle });
  donorCalendarState.liturgicalDay = today;
  donorCalendarState.calendar = calendar;
  donorCalendarState.date = date;

  setText("todayWeekday", parts.weekday.slice(0, 3));
  setText("todayMonthDay", parts.dayNum);
  setText("todayYear", parts.monthYear);
  setText("todayCalendarLabel", `${calendarLabel(calendar)} calendar`);
  setText("todayFeastTitle", feastTitle);
  setText("todayFeastNote", today.sourceConnected === false
    ? "Daily readings and saint lives are temporarily unavailable, but feast highlights still follow your Church calendar."
    : [today.epistleRef && `Epistle: ${today.epistleRef}`, today.gospelRef && `Gospel: ${today.gospelRef}`].filter(Boolean).join(" · ") || "Daily readings, saints, and fasting notes follow the Orthodox calendar.");
  setText("saintPreviewName", saintTitle);
  setText("saintPreviewNote", saintNames.length > 1
    ? `${saintNames.length} commemorations listed for today.`
    : firstStory.reposeCentury || "Open the life for today's commemoration.");

  const saintIcon = document.getElementById("saintPreviewIcon");
  if (saintIcon) {
    if (firstStory.iconUrl) {
      saintIcon.innerHTML = `<img src="${escapeHtml(firstStory.iconUrl)}" alt="" />`;
    } else {
      saintIcon.textContent = "✥";
    }
  }
  const chips = document.getElementById("todayChips");
  if (chips) {
    chips.innerHTML = [
      liturgicalRankLabel(today.feastRank || feast?.rank),
      fastingRule,
      toneOfWeekLabel(today.tone),
      saintNames.length ? `${saintNames.length} saint${saintNames.length === 1 ? "" : "s"}` : ""
    ].filter(Boolean).map((chip) => `<span class="${isFastRule(chip) ? "is-fast" : ""}">${escapeHtml(chip)}</span>`).join("");
  }
  const give = document.getElementById("todayGiveLink");
  if (give) give.href = giveHref;
  const saintCard = document.getElementById("saintPreviewCard");
  if (saintCard) {
    saintCard.dataset.date = date;
    saintCard.dataset.calendar = calendar;
    saintCard.dataset.saintTitle = saintTitle;
    saintCard.disabled = false;
  }
}

async function loadDonorLiturgicalDay(parish) {
  const calendar = parish?.liturgicalCalendar || donorProfile()?.defaultParish?.liturgicalCalendar || donorProfile()?.liturgicalCalendar || "julian";
  const date = todayIsoLocal();
  try {
    const res = await fetch(`/api/donor/liturgical-day?date=${encodeURIComponent(date)}&calendar=${encodeURIComponent(calendar)}`, {
      headers: { Accept: "application/json" }
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || "Unable to load today's liturgical day.");
    renderDonorTodayInChurch(parish, payload);
  } catch (err) {
    const api = window.AGAPAYLiturgicalCalendar;
    const feast = api?.liturgicalFeastsForYear(new Date().getFullYear(), calendar).find((item) => item.date === date) || null;
    renderDonorTodayInChurch(parish, {
      ok: true,
      date,
      calendar,
      feast,
      today: {
        civilDate: date,
        calendarType: calendar,
        feastTitle: feast?.name || "",
        feastRank: feast?.rank || "",
        fastingRule: feast?.rank === "fast" ? "Fast" : "No Fast",
        saints: feast?.name ? [feast.name] : [],
        saintStories: [],
        sourceConnected: false
      }
    });
  }
}

function showDonorSaintModal(title, subtitle, bodyHtml) {
  setText("donorSaintModalTitle", title || "Saint of the Day");
  setText("donorSaintModalSubtitle", subtitle || "Today's commemoration");
  setHtml("donorSaintModalBody", bodyHtml || "");
  const modal = document.getElementById("donorSaintModal");
  if (modal) modal.hidden = false;
}

function closeDonorSaintModal() {
  const modal = document.getElementById("donorSaintModal");
  if (modal) modal.hidden = true;
}

async function openDonorSaintOfDay(button) {
  const date = button?.dataset.date || donorCalendarState.date || todayIsoLocal();
  const calendar = button?.dataset.calendar || donorCalendarState.calendar || "julian";
  const previousText = button?.textContent || "";
  const isPreviewCard = button?.id === "saintPreviewCard";
  if (button) {
    button.disabled = true;
    if (!isPreviewCard) button.textContent = "Loading...";
  }
  try {
    let day = donorCalendarState.liturgicalDay || {};
    if (!Array.isArray(day.saintStories) || !day.saintStories.length) {
      const res = await fetch(`/api/donor/liturgical-day?date=${encodeURIComponent(date)}&calendar=${encodeURIComponent(calendar)}`, {
        headers: { Accept: "application/json" }
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Unable to load saint life.");
      day = payload.today || {};
      donorCalendarState.liturgicalDay = day;
    }
    const saints = Array.isArray(day.saintStories) ? day.saintStories : [];
    const saintNames = Array.isArray(day.saints) ? day.saints : [];
    showDonorSaintModal(
      saintDisplayTitle(day),
      `Saint of the Day · ${shortDate(date)}`,
      saintStoryModalHtml(saints, day.sourceConnected === false ? "Lives of the Saints are unavailable right now. Please try again later." : (!saints.length && saintNames.length ? saintNames.join("; ") : ""))
    );
  } catch (error) {
    showDonorSaintModal("Saint of the Day Unavailable", "Orthocal.info", saintStoryModalHtml([], error.message || "Lives of the Saints are unavailable right now."));
  } finally {
    if (button) {
      button.disabled = false;
      if (!isPreviewCard) button.textContent = previousText || button.textContent || "Open saint";
    }
  }
}

document.addEventListener("click", (event) => {
  const modal = document.getElementById("donorSaintModal");
  if (modal && !modal.hidden && event.target === modal) closeDonorSaintModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeDonorSaintModal();
});

function renderDonorCalendarFeasts(parish) {
  const api = window.AGAPAYLiturgicalCalendar;
  const grid = document.getElementById("calendarGrid");
  if (!grid || !api) return;

  const calendar = parish?.liturgicalCalendar || donorProfile()?.defaultParish?.liturgicalCalendar || donorProfile()?.liturgicalCalendar || "julian";
  const year = new Date().getFullYear();
  const label = api.calendarLabel(calendar);
  const feasts = api.liturgicalFeastsForYear(year, calendar);
  const patronalFeast = parishPatronalFeastForYear(parish, year, calendar, feasts);
  const next = api.nextLiturgicalFeast(calendar, new Date());
  const pascha = api.orthodoxPascha(year);
  const highlightMap = new Map(
    feasts
      .filter((feast) => ["great", "major", "holy-week", "bright-week", "fast"].includes(feast.rank))
      .map((feast) => [feast.id || `${feast.date}-${feast.name}`, feast])
  );
  if (patronalFeast) highlightMap.set(patronalFeast.id || `${patronalFeast.date}-${patronalFeast.name}`, patronalFeast);
  const highlighted = Array.from(highlightMap.values())
    .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || String(a.name || "").localeCompare(String(b.name || "")))
    .slice(0, 40);

  setText("calendarModePill", label);
  setText("nextFeastDate", calendarShortDateIso(next?.date));
  setText("nextFeastName", next?.name || "No feast found.");
  setText("paschaDate", calendarShortDateIso(pascha?.date));
  setText("calendarShortName", calendar === "gregorian" ? "Revised-Julian" : "Julian");
  setText("calendarFullName", label);

  if (!highlighted.length) {
    grid.innerHTML = '<div class="cal-timeline-empty">Feast highlights will appear once your parish calendar loads.</div>';
    return;
  }

  // Map rank → visual class + pill label
  const rankMeta = (rank) => {
    switch (rank) {
      case "great":
      case "holy-week":   return { cls: "great",  label: "Great Feast" };
      case "bright-week": return { cls: "bright", label: "Bright Week" };
      case "fast":        return { cls: "fast",   label: "Fast" };
      case "patronal":    return { cls: "patronal", label: "Patronal" };
      default:             return { cls: "major",  label: "Major" };
    }
  };
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  // Group feasts by month (dates are YYYY-MM-DD strings, already chronological)
  const byMonth = new Map();
  highlighted.forEach((feast) => {
    const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(String(feast.date || ""));
    const monthIdx = m ? Number(m[1]) - 1 : 0;
    const day = m ? String(Number(m[2])) : "";
    if (!byMonth.has(monthIdx)) byMonth.set(monthIdx, []);
    byMonth.get(monthIdx).push({ ...feast, _day: day, _mon: MONTHS_SHORT[monthIdx] });
  });

  const sections = Array.from(byMonth.keys()).sort((a, b) => a - b).map((monthIdx) => {
    const rows = byMonth.get(monthIdx).map((feast) => {
      const meta = rankMeta(feast.rank);
      return `
        <div class="cal-feast-row ${meta.cls}">
          <div class="cal-feast-date">
            <div class="cal-feast-date-day">${escapeHtml(feast._day)}</div>
            <div class="cal-feast-date-mon">${escapeHtml(feast._mon)}</div>
          </div>
          <div class="cal-feast-name">${escapeHtml(feast.name)}</div>
          <span class="cal-feast-rank ${meta.cls}">${escapeHtml(meta.label)}</span>
        </div>`;
    }).join("");
    return `<div class="cal-month"><div class="cal-month-label">${MONTHS[monthIdx]}</div>${rows}</div>`;
  }).join("");

  grid.innerHTML = sections;
}

function renderDonorCalendarPrompts(parish) {
  const target = document.getElementById("suggestedGivingPrompts");
  if (!target) return;
  if (!parish) {
    target.innerHTML = `
      <div class="notice">
        Sign in and select your church to load real campaign and fund prompts.
      </div>
    `;
    return;
  }

  const prompts = [];
  const nextFeast = nextFeastForCalendar(parish.liturgicalCalendar);
  if (nextFeast?.name) {
    prompts.push({
      title: `${nextFeast.name} Offering`,
      description: `Support ${parish.name || "your church"} for the upcoming feast.`,
      href: donorGiftUrl("feast", parish, { feast: nextFeast.name })
    });
  }

  activeParishCampaigns(parish).slice(0, 2).forEach((campaign) => {
    const goalCents = campaignGoalCents(campaign);
    const raisedCents = campaignRaisedCents(campaign);
    const percent = goalCents > 0 ? Math.min(100, Math.round((raisedCents / goalCents) * 100)) : 0;
    prompts.push({
      title: campaignLabel(campaign),
      description: goalCents > 0
        ? `${money(raisedCents)} of ${money(goalCents)} raised (${percent}%).`
        : (campaign.description || "Parish-approved campaign."),
      href: donorGiftUrl("campaign", parish, { campaign: campaign.id || campaign.feastId || campaign.name })
    });
  });

  (Array.isArray(parish.funds) ? parish.funds : []).slice(0, 2).forEach((fund) => {
    prompts.push({
      title: fund.name || "Designated Fund",
      description: fund.description || "Give toward this parish fund.",
      href: donorGiftUrl("fund", parish, { fund: fund.id || fund.name })
    });
  });

  if (!prompts.length) {
    target.innerHTML = `
      <div class="notice">
        This church has no active campaigns or designated funds listed yet.
      </div>
    `;
    return;
  }

  target.innerHTML = prompts.slice(0, 4).map((prompt) => `
    <a class="cal-prompt" href="${escapeHtml(prompt.href)}">
      <span class="cal-prompt-icon"><svg viewBox="0 0 24 24"><path d="M12 2s5 5.5 5 10a5 5 0 0 1-10 0c0-4.5 5-10 5-10z"/><path d="M9 21h6"/></svg></span>
      <span class="cal-prompt-body">
        <span class="cal-prompt-title">${escapeHtml(prompt.title)}</span>
        <span class="cal-prompt-note">${escapeHtml(prompt.description)}</span>
      </span>
      <span class="cal-prompt-arrow"><svg viewBox="0 0 24 24" fill="none"><polyline points="9 18 15 12 9 6"/></svg></span>
    </a>
  `).join("");
}

async function loadDonorCalendarPage() {
  const session = donorSession();
  if (!session.email || !session.token) {
    renderDonorCalendarFeasts(null);
    renderDonorCalendarPrompts(null);
    loadDonorLiturgicalDay(null);
    return;
  }
  try {
    const data = await donorApi("/api/donor/dashboard");
    setDonorProfile(data.donor);
    renderDonorCalendarFeasts(data.parish || null);
    renderDonorCalendarPrompts(data.parish || null);
    loadDonorLiturgicalDay(data.parish || null);
  } catch (err) {
    if (isDonorUnauthorized(err)) {
      clearDonorSession();
      renderDonorCalendarFeasts(null);
      renderDonorCalendarPrompts(null);
      loadDonorLiturgicalDay(null);
      return;
    }
    setDonorStatus(err.message, "error");
  }
}

function applyDonorGiveParams() {
  const params = new URLSearchParams(window.location.search);
  const parish = params.get("parish");
  const giftType = normalizeDonorGiftType(params.get("giftType"));
  const isQuick = params.get("quick") === "1";
  const parishSelect = document.getElementById("parish");
  const giftTypeSelect = document.getElementById("giftType");
  if (parish && parishSelect) parishSelect.value = parish;
  if (giftType && giftTypeSelect) giftTypeSelect.value = giftType;
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
      document.getElementById("amount")?.focus({ preventScroll: true });
    });
  }
}

function toggleCandleIntentionFields() {
  toggleGiftDetailFields();
}

function toggleGiftDetailFields() {
  const giftType = normalizeDonorGiftType(document.getElementById("giftType")?.value);
  populateGiftOptionFields();
  const candleFields = document.getElementById("candleIntentionFields");
  const commemorationFields = document.getElementById("commemorationIntentionFields");
  const fundFields = document.getElementById("fundFields");
  const campaignFields = document.getElementById("campaignFields");
  if (candleFields) candleFields.hidden = giftType !== "candles";
  if (commemorationFields) commemorationFields.hidden = giftType !== "commemoration";
  if (fundFields) fundFields.hidden = giftType !== "fund";
  if (campaignFields) campaignFields.hidden = giftType !== "campaign";
  renderCampaignChoicePreview(giftType === "campaign" ? selectedCampaign() : null);
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
  if (!donorName || !email || !password) {
    setDonorStatus("Enter your name, email, and password.", "error");
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
        email,
        password,
        parishId,
        addressLine1: document.getElementById("addressLine1")?.value.trim() || "",
        addressLine2: document.getElementById("addressLine2")?.value.trim() || "",
        city: document.getElementById("city")?.value.trim() || "",
        state: document.getElementById("state")?.value.trim() || "",
        postalCode: document.getElementById("postalCode")?.value.trim() || "",
        country: document.getElementById("country")?.value.trim() || "US",
        ...(window.agapaySecurityPayload ? window.agapaySecurityPayload() : {})
      })
    });
    localStorage.setItem(donorStore.email, email);
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

function renderDonorDashboardPayload(data) {
  if (!data) return;
  if (window.MyAgapayShell?.applyMyAgapayReleaseFlags) {
    window.MyAgapayShell.applyMyAgapayReleaseFlags(data.featureFlags?.myAgapay || {});
  }
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

  renderPledgeTracker(data.donor, summary);
  updateQuickGiveLinks(parish);
  renderActiveCampaigns(parish);
  renderNextFeast(parish);
  renderActiveFunds(parish);

  const recent = document.getElementById("recentOfferings");
  if (recent) recent.innerHTML = offeringRows(recentOfferings);
  const desktopRecent = document.getElementById("desktopRecentOfferings");
  if (desktopRecent) desktopRecent.innerHTML = offeringRows(recentOfferings);
}

async function loadDonorDashboardPage() {
  const session = donorSession();
  if (!session.email || !session.token) {
    if (redirectToMyAgapayLogin("signin-required")) return;
    showGuestDonorDashboard();
    return;
  }
  const cachedDashboard = readDonorCache("dashboard");
  if (cachedDashboard) renderDonorDashboardPayload(cachedDashboard);
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
    if (pledgeEl) pledgeEl.value = donor.pledgeAmountCents ? (donor.pledgeAmountCents / 100).toFixed(0) : "";
    setValue("settingsAddressLine1", donor.addressLine1);
    setValue("settingsAddressLine2", donor.addressLine2);
    setValue("settingsCity", donor.city);
    setValue("settingsState", donor.state);
    setValue("settingsPostalCode", donor.postalCode);
    setValue("settingsCountry", donor.country || "US");
    const parishName = document.getElementById("settingsParishName");
    if (parishName) parishName.textContent = data.parish?.name || "Choose a parish below";
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
    if (data.donor?.email) localStorage.setItem(donorStore.email, data.donor.email);
    setDonorProfile(data.donor);
    document.getElementById("currentPassword").value = "";
    document.getElementById("newPassword").value = "";
    setDonorStatus("Donor settings saved.", "success");
    await loadDonorSettingsPage();
  } catch (err) {
    setDonorStatus(err.message, "error");
  }
}

function offeringRows(offerings) {
  if (!offerings.length) return '<div class="notice">No offerings have been recorded for this donor account yet.</div>';
  return offerings.map((item) => `
    <div class="list-item">
      <div class="list-main">
        <strong>${escapeHtml(item.fund || item.campaign || item.title || item.giftType || "AGAPAY offering")}</strong>
        <span>${escapeHtml(item.parishName || item.parishId || "Parish")} - ${shortDate(item.createdAt)}</span>
        <span>${item.coverFees ? "Fees covered" : `Parish received ${money(item.parishNetCents ?? item.amountCents)}`}</span>
        <span class="status-pill ${item.paymentStatus === "pending" ? "pending" : ""}">${escapeHtml(item.paymentStatus || item.status || "recorded")}</span>
      </div>
      <div class="list-amount">${money(item.amountCents)}<small>${item.coverFees ? `charged ${money(item.chargeCents || item.amountCents)}` : `fees ${money(item.totalFeeCents || 0)}`}</small></div>
    </div>
  `).join("");
}

function activityDate(item = {}) {
  return item.createdAt || item.updatedAt || item.completedAt || item.submittedAt || "";
}

function productActivityLabel(product) {
  return {
    give: "Give",
    bookstore: "Bookstore",
    services: "Services",
    learn: "Learn"
  }[product] || "AGAPAY";
}

function productFromOffering(item = {}) {
  return item.giftType === "commemoration" || item.giftType === "sacrament" ? "services" : "give";
}

function buildHistoryActivities({ offerings = [], bookstore = {}, dashboard = null } = {}) {
  const activities = [];
  offerings.forEach((item) => {
    const product = productFromOffering(item);
    activities.push({
      product,
      title: item.fund || item.campaign || item.title || item.giftType || "Parish offering",
      subtitle: item.parishName || item.parishId || "Parish",
      meta: `${money(item.amountCents)} · ${item.frequency && item.frequency !== "once" ? item.frequency : "one-time"}${item.coverFees ? " · fees covered" : ""}`,
      status: item.paymentStatus || item.status || "recorded",
      amountCents: item.amountCents,
      date: activityDate(item)
    });
  });

  const orders = Array.isArray(bookstore?.orders) ? bookstore.orders : [];
  orders.forEach((order) => {
    const category = order.itemCategoryLabel || BOOKSTORE_CATEGORY_LABELS[order.itemCategory] || "Bookstore item";
    activities.push({
      product: "bookstore",
      title: order.itemDescription || order.title || "Bookstore order",
      subtitle: category,
      meta: `${formatCentsAsDollars(order.totalChargedCents || order.subtotalCents || 0)}${order.quantity ? ` · quantity ${order.quantity}` : ""}`,
      status: BOOKSTORE_STATUS_LABELS[order.status] || order.status || "ordered",
      amountCents: Number(order.totalChargedCents || order.subtotalCents || 0),
      date: activityDate(order)
    });
  });

  const commemorations = Array.isArray(dashboard?.recentCommemorations) ? dashboard.recentCommemorations : [];
  commemorations.forEach((entry) => {
    activities.push({
      product: "services",
      title: entry.names || entry.title || "Commemoration submitted",
      subtitle: entry.parishName || entry.parishId || "Commemorations",
      meta: entry.kind || entry.type || "Prayer list",
      status: entry.status || "recorded",
      amountCents: 0,
      date: activityDate(entry)
    });
  });

  let learnPlan = {};
  try {
    learnPlan = JSON.parse(localStorage.getItem("agapay.learn.plan") || "{}");
  } catch {
    learnPlan = {};
  }
  if (learnPlan.termName || learnPlan.currentTerm || learnPlan.updatedAt) {
    activities.push({
      product: "learn",
      title: learnPlan.termName || learnPlan.currentTerm || "Learn planner updated",
      subtitle: "AGAPAY Learn",
      meta: learnPlan.studentName || learnPlan.householdName || "Homeschool planning",
      status: "saved",
      amountCents: 0,
      date: learnPlan.updatedAt || learnPlan.createdAt || new Date().toISOString()
    });
  }

  return activities
    .filter((item) => item.date || item.title)
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
}

function historyActivityRows(activities = []) {
  if (!activities.length) {
    return '<div class="notice">No AGAPAY activity has been recorded for this account yet.</div>';
  }
  return activities.map((item) => `
    <article class="history-activity-row history-product-${escapeHtml(item.product)}">
      <span class="history-activity-icon" aria-hidden="true">${productActivityLabel(item.product).slice(0, 1)}</span>
      <div class="history-activity-main">
        <div class="history-activity-head">
          <span class="history-product-pill">${productActivityLabel(item.product)}</span>
          <span>${shortDate(item.date)}</span>
        </div>
        <strong>${escapeHtml(item.title)}</strong>
        <span>${escapeHtml(item.subtitle || "")}</span>
        <small>${escapeHtml(item.meta || "")}</small>
      </div>
      <div class="history-activity-side">
        ${item.amountCents ? `<strong>${money(item.amountCents)}</strong>` : ""}
        <span class="status-pill">${escapeHtml(item.status || "recorded")}</span>
      </div>
    </article>
  `).join("");
}

function renderProductFilterState() {
  const filter = window.donorHistoryFilter || "all";
  document.querySelectorAll("[data-history-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.historyFilter === filter);
  });
}

function renderAgapayHistoryTimeline() {
  const list = document.getElementById("agapayHistoryTimeline");
  if (!list) return;
  const filter = window.donorHistoryFilter || "all";
  const activities = window.donorHistoryActivities || [];
  const filtered = filter === "all" ? activities : activities.filter((item) => item.product === filter);
  list.innerHTML = historyActivityRows(filtered);
  renderProductFilterState();
}

function renderHistorySummary(activities = [], summary = {}) {
  const productCount = new Set(activities.map((item) => item.product)).size;
  setText("historyProductsCount", String(productCount));
  setText("historyLatestActivity", activities[0] ? productActivityLabel(activities[0].product) : "None");
  setText("offeringsReceiptCount", `${summary.offeringCount || (window.donorOfferings || []).length || 0} receipts`);
}

function renderOfferingsPayload(payload = {}, fallbackDashboard = null, statusText = "Live data", productPayloads = {}) {
  let offerings = Array.isArray(payload.offerings) ? payload.offerings : [];
  let summary = payload.summary || fallbackDashboard?.summary || {};
  if (!offerings.length && Array.isArray(fallbackDashboard?.recentOfferings)) {
    offerings = fallbackDashboard.recentOfferings;
  }
  offerings = offerings
    .map((item) => ({
      ...item,
      amountCents: Number(item.amountCents || 0),
      parishNetCents: Number(item.parishNetCents ?? item.amountCents ?? 0),
      giftAmountCents: Number(item.giftAmountCents ?? item.amountCents ?? 0),
      chargeCents: Number(item.chargeCents ?? item.amountCents ?? 0),
      totalFeeCents: Number(item.totalFeeCents || 0),
      paymentStatus: item.paymentStatus || item.status || "recorded",
      createdAt: item.createdAt || item.updatedAt || ""
    }))
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

  window.donorOfferings = offerings;
  window.donorHistoryActivities = buildHistoryActivities({
    offerings,
    bookstore: productPayloads.bookstore || readDonorCache("bookstore") || {},
    dashboard: fallbackDashboard
  });
  setText("offeringsYtd", money(summary.parishNetYtdCents ?? summary.ytdCents));
  setText("offeringsRecurring", String(summary.recurringCount || 0));
  setText("offeringsStatus", offerings.length ? statusText : "No data yet");
  renderHistorySummary(window.donorHistoryActivities, summary);
  renderAgapayHistoryTimeline();
  renderRecurringManagement(offerings);
  renderDonorOfferings();
  return { offerings, summary };
}

async function loadDonorOfferingsPage() {
  const session = donorSession();
  if (!session.email || !session.token) {
    const list = document.getElementById("offeringList");
    if (list) list.innerHTML = '<div class="notice">Sign in to view your live offering history.</div>';
    const timeline = document.getElementById("agapayHistoryTimeline");
    if (timeline) timeline.innerHTML = '<div class="notice">Sign in to view your AGAPAY activity.</div>';
    setText("offeringsStatus", "Sign in");
    return;
  }

  const cachedDashboard = readDonorCache("dashboard");
  const cachedOfferings = readDonorCache("offerings");
  if (cachedOfferings || cachedDashboard) {
    renderOfferingsPayload(cachedOfferings || {}, cachedDashboard, "Refreshing...");
  }

  try {
    const profileParishId = donorProfile()?.defaultParishId || "";
    const [offeringsResult, dashboardResult, bookstoreResult] = await Promise.allSettled([
      donorApi("/api/donor/offerings"),
      donorApi("/api/donor/dashboard"),
      profileParishId
        ? donorApi("/api/donor/bookstore", { headers: donorAuthHeaders({ "X-AGAPAY-Parish-Id": profileParishId }) })
        : Promise.resolve(readDonorCache("bookstore") || {})
    ]);

    if (offeringsResult.status === "rejected" && isDonorUnauthorized(offeringsResult.reason)) {
      throw offeringsResult.reason;
    }
    if (dashboardResult.status === "rejected" && isDonorUnauthorized(dashboardResult.reason)) {
      throw dashboardResult.reason;
    }
    if (bookstoreResult.status === "rejected" && isDonorUnauthorized(bookstoreResult.reason)) {
      throw bookstoreResult.reason;
    }

    const dashboardData = dashboardResult.status === "fulfilled" ? dashboardResult.value : cachedDashboard;
    const offeringsData = offeringsResult.status === "fulfilled" ? offeringsResult.value : cachedOfferings;
    const bookstoreData = bookstoreResult.status === "fulfilled" ? bookstoreResult.value : readDonorCache("bookstore");
    if (!offeringsData && !dashboardData) throw offeringsResult.reason || dashboardResult.reason || new Error("Unable to load offerings");
    if (dashboardData?.donor) setDonorProfile(dashboardData.donor);
    if (dashboardResult.status === "fulfilled") writeDonorCache("dashboard", dashboardData);
    if (bookstoreResult.status === "fulfilled" && bookstoreData) writeDonorCache("bookstore", bookstoreData);
    const rendered = renderOfferingsPayload(offeringsData || {}, dashboardData, "Live data", { bookstore: bookstoreData });
    writeDonorCache("offerings", rendered);
  } catch (err) {
    if (isDonorUnauthorized(err)) {
      clearDonorSession();
      const list = document.getElementById("offeringList");
      if (list) list.innerHTML = '<div class="notice">Session expired. Please sign in again.</div>';
      const timeline = document.getElementById("agapayHistoryTimeline");
      if (timeline) timeline.innerHTML = '<div class="notice">Session expired. Please sign in again.</div>';
      setText("offeringsStatus", "Sign in");
      return;
    }
    const list = document.getElementById("offeringList");
    if (list) list.innerHTML = `<div class="notice">${escapeHtml(err.message)} Sign in from the donor home page first.</div>`;
    const timeline = document.getElementById("agapayHistoryTimeline");
    if (timeline) timeline.innerHTML = `<div class="notice">${escapeHtml(err.message)} Sign in from the donor home page first.</div>`;
    setText("offeringsStatus", "Unavailable");
  }
}

function renderDonorOfferings() {
  const list = document.getElementById("offeringList");
  if (!list) return;
  const query = (document.getElementById("search")?.value || "").toLowerCase();
  const filter = document.getElementById("typeFilter")?.value || "all";
  const rows = (window.donorOfferings || []).filter((item) => {
    const matchesType = filter === "all"
      || item.giftType === filter
      || item.frequency === filter
      || item.paymentStatus === filter
      || (filter === "recurring" && item.frequency && item.frequency !== "once");
    return matchesType && JSON.stringify(item).toLowerCase().includes(query);
  });
  list.innerHTML = offeringRows(rows);
}

function recurringManagementItems(offerings = []) {
  const seen = new Set();
  return offerings
    .filter((item) => item.parishId && item.stripeCustomerId && item.frequency && item.frequency !== "once")
    .map((item) => ({
      parishId: item.parishId,
      parishName: item.parishName || item.parishId || "Parish",
      title: item.fund || item.campaign || item.title || item.giftType || "Recurring gift",
      amountCents: Number(item.amountCents || 0),
      frequency: item.frequency || "recurring",
      createdAt: item.createdAt || ""
    }))
    .filter((item) => {
      const key = item.parishId;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function renderRecurringManagement(offerings = []) {
  const list = document.getElementById("recurringManagementList");
  if (!list) return;
  const items = recurringManagementItems(offerings);
  setText("recurringManageStatus", items.length ? `${items.length} parish${items.length === 1 ? "" : "es"}` : "No recurring gifts");
  if (!items.length) {
    list.innerHTML = `
      <div class="recurring-management-empty">
        <strong>No recurring gifts yet.</strong>
        <span>When you create a recurring offering, you will be able to manage, change, or cancel it here.</span>
        <a class="btn btn-gold btn-sm" href="/myagapay/giving/give?frequency=monthly">Start recurring gift</a>
      </div>
    `;
    return;
  }
  list.innerHTML = items.map((item) => {
    const encodedParishId = encodeURIComponent(item.parishId);
    return `
    <article class="recurring-management-row">
      <div>
        <strong>${escapeHtml(item.parishName)}</strong>
        <span>${escapeHtml(item.title)} · ${money(item.amountCents)} · ${escapeHtml(item.frequency)}</span>
      </div>
      <button class="btn btn-gold btn-sm" type="button" onclick="openDonorRecurringPortal(decodeURIComponent('${encodedParishId}'), this)">Manage</button>
    </article>
  `;
  }).join("");
}

async function openDonorRecurringPortal(parishId = "", button = null) {
  const session = donorSession();
  if (!session.email || !session.token) {
    setDonorStatus("Log in to manage recurring giving.", "error");
    window.location.href = "/myagapay/login";
    return;
  }
  const win = window.open("", "_blank");
  if (button) button.disabled = true;
  setDonorStatus("Opening secure recurring gift management...");
  try {
    const data = await donorApi("/api/donor/subscription-portal", {
      method: "POST",
      body: JSON.stringify({ parishId })
    });
    if (win) {
      win.location.href = data.portalUrl;
    } else {
      window.location.href = data.portalUrl;
    }
    setDonorStatus("Recurring gift management opened.", "success");
  } catch (err) {
    if (win) win.close();
    setDonorStatus(err.message || "Unable to open recurring gift management.", "error");
  } finally {
    if (button) button.disabled = false;
  }
}

function filterOfferings(type) {
  const el = document.getElementById("typeFilter");
  if (el) el.value = type;
  renderDonorOfferings();
}

function searchOfferings() {
  renderDonorOfferings();
}

function setHistoryProductFilter(product = "all") {
  window.donorHistoryFilter = product;
  renderAgapayHistoryTimeline();
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
    const note = document.getElementById("commemorationIntentionNote")?.value || "";
    if (!includeGift) {
      setDonorStatus("Submitting commemoration...");
      const data = await donorApi("/api/donor/commemorations", {
        method: "POST",
        body: JSON.stringify({
          parishId,
          namesLiving: living.join("\n"),
          namesDeparted: departed.join("\n"),
          note
        })
      });
      renderCommemorationsPayload(data);
      document.getElementById("commemorationLivingNames").value = "";
      document.getElementById("commemorationDepartedNames").value = "";
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
  const selectedFund = (window.agapayPublicParishes || [])
    .find((parish) => parish.id === document.getElementById("parish")?.value)
    ?.funds?.find((fund) => [fund.id, fund.name].filter(Boolean).map(String).includes(document.getElementById("fund")?.value));
  const campaign = selectedCampaign();
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
        fund: normalizedGiftType === "feast" ? "Benevolence Fund" : normalizedGiftType === "fund" ? (selectedFund?.name || document.getElementById("fund")?.value || "") : "",
        fundId: normalizedGiftType === "feast" ? "benevolence" : normalizedGiftType === "fund" ? (selectedFund?.id || document.getElementById("fund")?.value || "") : "",
        campaign: normalizedGiftType === "campaign" ? campaignLabel(campaign) : "",
        campaignId: normalizedGiftType === "campaign" ? (campaign?.id || campaign?.feastId || document.getElementById("campaign")?.value || "") : "",
        campaignDescription: normalizedGiftType === "campaign" ? campaign?.description || "" : "",
        namesLiving: livingNames,
        namesDeparted: departedNames,
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
  renderActiveCampaigns(null);
  renderNextFeast(null);
  updateQuickGiveLinks(null);
  updateDonorAuthState();
  checkDonorNotifications();
  const emailInput = document.getElementById("donorEmail");
  if (emailInput && donorSession().email) emailInput.value = donorSession().email;
  initDonorPasswordResetPage();
});


// ── PLEDGE TRACKER ────────────────────────────────────────────────────────
function renderPledgeTracker(donor, summary) {
  if (!donor) return;
  const pledgeCents = Number(donor.pledgeAmountCents || 0);
  const pledgeYear  = String(new Date().getFullYear());
  // Pledge progress counts parish offerings (tithe/stewardship) only — not designated
  // funds, campaigns, candles, or commemorations. See donorSummaryFromOfferings.
  const ytdCents    = Number(summary?.stewardshipYtdCents || 0);

  // Mobile tracker
  const mobileCard = document.getElementById("pledgeTrackerCard");
  if (mobileCard) {
    mobileCard.hidden = false;
    const activeState = document.getElementById("pledgeActiveState");
    const emptyState  = document.getElementById("pledgeEmptyState");
    if (!pledgeCents) {
      if (activeState) activeState.hidden = true;
      if (emptyState) emptyState.hidden = false;
    } else {
      if (activeState) activeState.hidden = false;
      if (emptyState) emptyState.hidden = true;
      const pct  = Math.min(100, Math.round((ytdCents / pledgeCents) * 100));
      const fill = document.getElementById("pledgeBarFill");
      const track = document.getElementById("pledgeBarTrack");
      if (fill)  { setTimeout(() => { fill.style.width = pct + "%"; }, 120); fill.classList.toggle("pledge-complete", pct >= 100); }
      if (track) track.setAttribute("aria-valuenow", pct);
      const label = document.getElementById("pledgeTrackerLabel");
      if (label) label.textContent = pledgeYear + " Annual Pledge";
      const raised = document.getElementById("pledgeRaised");
      if (raised) raised.textContent = money(ytdCents) + " given";
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
    desktopCard.hidden = false;
    const activeState = document.getElementById("desktopPledgeActiveState");
    const emptyState  = document.getElementById("desktopPledgeEmptyState");
    if (!pledgeCents) {
      if (activeState) activeState.hidden = true;
      if (emptyState) emptyState.hidden = false;
    } else {
      if (activeState) activeState.hidden = false;
      if (emptyState) emptyState.hidden = true;
      const pct  = Math.min(100, Math.round((ytdCents / pledgeCents) * 100));
      const fill = document.getElementById("desktopPledgeBarFill");
      const track = document.getElementById("desktopPledgeBarTrack");
      if (fill)  { setTimeout(() => { fill.style.width = pct + "%"; }, 120); fill.classList.toggle("pledge-complete", pct >= 100); }
      if (track) track.setAttribute("aria-valuenow", pct);
      const title = document.getElementById("desktopPledgeTitle");
      if (title) title.textContent = pledgeYear + " Annual Pledge";
      const raised = document.getElementById("desktopPledgeRaised");
      if (raised) raised.textContent = money(ytdCents) + " given";
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

// ── SACRAMENTS & SERVICES ────────────────────────────────
// Part of AGAPAY Parish + — automatically available to donors
// whose home parish has active Parish + access. See
// handleDonorSacraments in src/handlers/donor.js for the server-side gate.

const SACRAMENT_TYPE_LABELS = {
  house_blessing: "House Blessing",
  baptism: "Baptism",
  chrismation: "Chrismation",
  wedding: "Wedding",
  funeral: "Funeral",
  memorial_service: "Memorial Service",
  confession: "Confession",
  home_visit: "Home Visit",
  office_visit: "Office Visit",
  other: "Other Request"
};

const SACRAMENT_STATUS_LABELS = {
  requested: "Requested",
  acknowledged: "Received by Parish",
  scheduled: "Scheduled",
  completed: "Completed",
  declined: "Declined",
  cancelled: "Cancelled"
};

const SACRAMENT_STATUS_TONE = {
  requested: "pending",
  acknowledged: "pending",
  scheduled: "success",
  completed: "success",
  declined: "wine",
  cancelled: "muted"
};

function sacramentTypeLabel(type, otherLabel) {
  if (type === "other" && otherLabel) return otherLabel;
  return SACRAMENT_TYPE_LABELS[type] || type;
}

function sacramentLocationHint(sacramentType) {
  return sacramentType === "house_blessing" || sacramentType === "home_visit";
}

const SAC_SCHEDULABLE_TYPES = ["house_blessing", "confession", "home_visit", "office_visit"];
let sacramentSelectedSlot = null;

function toggleSacramentAddressField() {
  const typeEl = document.getElementById("sacramentType");
  const locationRow = document.getElementById("sacramentLocationRow");
  const addressGroup = document.getElementById("sacramentAddressGroup");
  const otherGroup = document.getElementById("sacramentOtherLabelGroup");
  const type = typeEl?.value || "";
  const needsAddress = sacramentLocationHint(type);
  if (locationRow) locationRow.style.display = type ? "" : "none";
  if (addressGroup) addressGroup.style.display = needsAddress ? "" : (document.getElementById("sacramentLocationType")?.value === "home" ? "" : "none");
  if (otherGroup) otherGroup.style.display = type === "other" ? "" : "none";
  updateSacramentSchedulingUI();
}

// Real-time availability (native, no third-party calendar) for the three
// "schedulable" sacrament types. Falls back to the free-text preferred
// date/time fields if the parish hasn't configured any windows yet.
function updateSacramentSchedulingUI() {
  const type = document.getElementById("sacramentType")?.value || "";
  const freeText = document.getElementById("sacramentFreeTextFields");
  const slotGroup = document.getElementById("sacramentSlotPickerGroup");
  sacramentSelectedSlot = null;
  const dateInput = document.getElementById("sacramentSlotDate");
  const timeInput = document.getElementById("sacramentSlotTime");
  if (dateInput) dateInput.value = "";
  if (timeInput) timeInput.value = "";
  const note = document.getElementById("sacramentSlotSelectedNote");
  if (note) note.textContent = "";

  if (!SAC_SCHEDULABLE_TYPES.includes(type)) {
    if (freeText) freeText.style.display = "contents";
    if (slotGroup) slotGroup.style.display = "none";
    return;
  }
  loadSacramentSlots(type);
}

async function loadSacramentSlots(type) {
  const freeText = document.getElementById("sacramentFreeTextFields");
  const slotGroup = document.getElementById("sacramentSlotPickerGroup");
  const picker = document.getElementById("sacramentSlotPicker");
  const parishId = document.getElementById("sacramentParishId")?.value || donorProfile()?.defaultParishId || "";
  if (!parishId) return;

  if (slotGroup) slotGroup.style.display = "";
  if (picker) picker.innerHTML = '<p class="form-help">Loading availability…</p>';

  try {
    const data = await donorApi(`/api/donor/sacraments/availability?parishId=${encodeURIComponent(parishId)}&sacramentType=${encodeURIComponent(type)}`);
    const slots = Array.isArray(data.slots) ? data.slots : [];
    if (!slots.length) {
      // No online scheduling set up for this type yet -- fall back to free text.
      if (freeText) freeText.style.display = "contents";
      if (slotGroup) slotGroup.style.display = "none";
      return;
    }
    if (freeText) freeText.style.display = "none";
    renderSacramentSlots(slots);
  } catch {
    // Availability lookup failing shouldn't block the donor -- fall back to free text.
    if (freeText) freeText.style.display = "contents";
    if (slotGroup) slotGroup.style.display = "none";
  }
}

function renderSacramentSlots(slots) {
  const picker = document.getElementById("sacramentSlotPicker");
  if (!picker) return;
  const byDate = new Map();
  for (const slot of slots) {
    if (!byDate.has(slot.date)) byDate.set(slot.date, []);
    byDate.get(slot.date).push(slot);
  }
  picker.innerHTML = Array.from(byDate.entries()).map(([date, daySlots]) => {
    const dayLabel = new Date(date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    const chips = daySlots.map((s) => {
      const timeLabel = s.label.split(", ").pop();
      return `<button type="button" class="sac-slot-chip" data-date="${escapeHtml(s.date)}" data-time="${escapeHtml(s.time)}" onclick="selectSacramentSlot('${s.date}','${s.time}', this)">${escapeHtml(timeLabel)}</button>`;
    }).join("");
    return `<div class="sac-slot-day"><div class="sac-slot-day-label">${escapeHtml(dayLabel)}</div><div class="sac-slot-chips">${chips}</div></div>`;
  }).join("");
}

function selectSacramentSlot(date, time, btn) {
  sacramentSelectedSlot = { date, time };
  const dateInput = document.getElementById("sacramentSlotDate");
  const timeInput = document.getElementById("sacramentSlotTime");
  if (dateInput) dateInput.value = date;
  if (timeInput) timeInput.value = time;
  document.querySelectorAll(".sac-slot-chip").forEach((el) => el.classList.remove("selected"));
  if (btn) btn.classList.add("selected");
  const note = document.getElementById("sacramentSlotSelectedNote");
  if (note) {
    const label = new Date(date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    note.textContent = `Selected: ${label} at ${btn ? btn.textContent : time}`;
  }
}

function toggleSacramentAddressFieldByLocation() {
  const addressGroup = document.getElementById("sacramentAddressGroup");
  const locationType = document.getElementById("sacramentLocationType")?.value || "church";
  const sacramentType = document.getElementById("sacramentType")?.value || "";
  if (addressGroup) {
    addressGroup.style.display = (locationType === "home" || sacramentLocationHint(sacramentType)) ? "" : "none";
  }
}

async function loadDonorSacramentsPage() {
  const session = donorSession();
  const list = document.getElementById("sacramentList");
  const formCard = document.getElementById("sacramentFormCard");
  const unavailableNotice = document.getElementById("sacramentUnavailableNotice");
  primeCommemorationParishDisplay();

  if (!session.email || !session.token) {
    if (list) list.innerHTML = '<div class="notice">Sign in to view your requests.</div>';
    return;
  }

  const donor = donorProfile();
  const parishId = donor?.defaultParishId || "";
  renderCommemorationParish(donorDefaultParish());
  const parishInput = document.getElementById("sacramentParishId");
  if (parishInput) parishInput.value = parishId;

  if (!parishId) {
    if (formCard) formCard.style.display = "none";
    if (unavailableNotice) {
      unavailableNotice.style.display = "block";
      unavailableNotice.textContent = "Choose your parish in Settings before requesting a sacrament or service.";
    }
    if (list) list.innerHTML = "";
    return;
  }

  const cached = readDonorCache("sacraments");
  if (cached) renderSacramentsPayload(cached);

  try {
    const data = await donorApi("/api/donor/sacraments", {
      headers: donorAuthHeaders({ "X-AGAPAY-Parish-Id": parishId })
    });
    writeDonorCache("sacraments", data);
    renderSacramentsPayload(data);
  } catch (err) {
    if (isDonorUnauthorized(err)) {
      clearDonorSession();
      if (list) list.innerHTML = '<div class="notice">Session expired. Please sign in again.</div>';
      return;
    }
    if (!cached) {
      if (list) list.innerHTML = `<div class="notice">${escapeHtml(err.message)}</div>`;
    }
  }
}

function renderSacramentsPayload(payload = {}) {
  const formCard = document.getElementById("sacramentFormCard");
  const unavailableNotice = document.getElementById("sacramentUnavailableNotice");
  const list = document.getElementById("sacramentList");

  const available = payload.available !== false; // default to showing the form while first loading
  if (formCard) formCard.style.display = available ? "" : "none";
  if (unavailableNotice) {
    unavailableNotice.style.display = available ? "none" : "block";
    unavailableNotice.textContent = "Your parish has not enabled Sacraments & Services yet. This feature is part of AGAPAY Parish +.";
  }

  const requests = Array.isArray(payload.requests) ? payload.requests : [];
  if (list) {
    list.innerHTML = requests.length
      ? requests.map(sacramentRequestRow).join("")
      : '<div class="notice">No requests submitted yet.</div>';
  }
  return payload;
}

function sacramentRequestRow(row) {
  const typeLabel = sacramentTypeLabel(row.sacramentType, row.otherTypeLabel);
  const statusLabel = SACRAMENT_STATUS_LABELS[row.status] || row.status;
  const tone = SACRAMENT_STATUS_TONE[row.status] || "pending";
  const canCancel = ["requested", "acknowledged", "scheduled"].includes(row.status);

  const scheduledLine = row.status === "scheduled" && (row.confirmedDate || row.confirmedTime)
    ? `<div class="sac-row-meta"><strong>Scheduled:</strong> ${escapeHtml([row.confirmedDate, row.confirmedTime].filter(Boolean).join(" at "))}${row.clergyAssigned ? ` · ${escapeHtml(row.clergyAssigned)}` : ""}</div>`
    : "";
  const declinedLine = row.status === "declined" && row.declineReason
    ? `<div class="sac-row-meta">${escapeHtml(row.declineReason)}</div>`
    : "";
  const requestedLine = row.requestedDate || row.requestedTimeWindow
    ? `<div class="sac-row-meta">Preferred: ${escapeHtml([row.requestedDate, row.requestedTimeWindow].filter(Boolean).join(" · "))}</div>`
    : "";

  return `<div class="sac-row">
    <div class="sac-row-top">
      <span class="sac-row-type">${escapeHtml(typeLabel)}</span>
      <span class="status-pill ${tone}">${escapeHtml(statusLabel)}</span>
    </div>
    ${requestedLine}
    ${scheduledLine}
    ${declinedLine}
    ${canCancel ? `<button type="button" class="btn btn-ghost btn-sm" onclick="cancelSacramentRequest('${row.id}', this)">Cancel request</button>` : ""}
  </div>`;
}

async function submitSacramentRequest(event) {
  event.preventDefault();
  const parishId = document.getElementById("sacramentParishId")?.value || donorProfile()?.defaultParishId || "";
  const sacramentType = document.getElementById("sacramentType")?.value || "";
  if (!parishId) {
    setDonorStatus("Choose your parish in Settings before submitting a request.", "error");
    return;
  }
  if (!sacramentType) {
    setDonorStatus("Choose what you're requesting.", "error");
    return;
  }
  const otherTypeLabel = document.getElementById("sacramentOtherLabel")?.value || "";
  if (sacramentType === "other" && !otherTypeLabel.trim()) {
    setDonorStatus("Describe what you're requesting.", "error");
    return;
  }
  const locationType = document.getElementById("sacramentLocationType")?.value || "church";
  const locationAddress = document.getElementById("sacramentAddress")?.value || "";
  if ((locationType === "home" || sacramentLocationHint(sacramentType)) && !locationAddress.trim()) {
    setDonorStatus("An address is required for a house blessing or home visit.", "error");
    return;
  }

  const slotPickerShown = document.getElementById("sacramentSlotPickerGroup")?.style.display !== "none";
  const isBooking = SAC_SCHEDULABLE_TYPES.includes(sacramentType) && slotPickerShown;
  if (isBooking && !sacramentSelectedSlot) {
    setDonorStatus("Pick an open time to book.", "error");
    return;
  }

  const participantNames = document.getElementById("sacramentParticipants")?.value || "";
  const phone = document.getElementById("sacramentPhone")?.value || donorProfile()?.contactPhone || "";
  const notes = document.getElementById("sacramentNotes")?.value || "";

  const body = isBooking
    ? {
        parishId, sacramentType, locationType, locationAddress,
        date: sacramentSelectedSlot.date, time: sacramentSelectedSlot.time,
        participantNames, phone, notes
      }
    : {
        parishId, sacramentType, otherTypeLabel, locationType, locationAddress,
        requestedDate: document.getElementById("sacramentDate")?.value || "",
        requestedTimeWindow: document.getElementById("sacramentTimeWindow")?.value || "",
        participantNames, phone, notes
      };

  const submitBtn = event.target.querySelector('button[type="submit"]');
  try {
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = isBooking ? "Booking..." : "Sending..."; }
    setDonorStatus(isBooking ? "Booking your slot..." : "Sending your request...");
    await donorApi(isBooking ? "/api/donor/sacraments/book" : "/api/donor/sacraments", { method: "POST", body: JSON.stringify(body) });
    setDonorStatus(isBooking ? "Booked! You'll see it confirmed below." : "Request sent. Your parish will follow up to confirm.", "success");
    event.target.reset();
    toggleSacramentAddressField();
    await loadDonorSacramentsPage();
  } catch (err) {
    if (err.data?.slotTaken) {
      setDonorStatus("That time was just taken by someone else — pick another.", "error");
      loadSacramentSlots(sacramentType);
    } else {
      setDonorStatus(err.message, "error");
    }
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Send request"; }
  }
}

async function cancelSacramentRequest(id, btn) {
  if (!id) return;
  if (!confirm("Cancel this request? This can't be undone.")) return;
  try {
    if (btn) { btn.disabled = true; btn.textContent = "Cancelling..."; }
    await donorApi(`/api/donor/sacraments/${encodeURIComponent(id)}/cancel`, { method: "POST" });
    setDonorStatus("Request cancelled.", "success");
    await loadDonorSacramentsPage();
  } catch (err) {
    setDonorStatus(err.message, "error");
    if (btn) { btn.disabled = false; btn.textContent = "Cancel request"; }
  }
}

// ------------------------------------------------------------------
// Parish Bookstore Payments — pay for books, prayer ropes, icons, candles, and
// other devotional items directly from My AGAPAY. Stripe shows sales tax
// during checkout when it applies for the parish's state and tax settings.
// See handleDonorBookstore in src/handlers/bookstore.js for the server side.
// ------------------------------------------------------------------

const BOOKSTORE_CATEGORY_LABELS = {
  book: "Book",
  prayer_rope: "Prayer Rope",
  icon: "Icon",
  candle: "Candle",
  jewelry: "Jewelry / Cross",
  incense: "Incense",
  cd_dvd: "CD / DVD",
  other: "Other Item"
};

const BOOKSTORE_STATUS_LABELS = {
  checkout_created: "Awaiting payment",
  completed: "Paid",
  failed: "Payment failed",
  expired: "Checkout expired",
  refunded: "Refunded"
};

const BOOKSTORE_STATUS_TONE = {
  checkout_created: "pending",
  completed: "success",
  failed: "wine",
  expired: "muted",
  refunded: "muted"
};

const BOOKSTORE_FULFILLMENT_LABELS = {
  pending: "Awaiting pickup",
  ready: "Ready for pickup",
  picked_up: "Picked up",
  shipped: "Shipped",
  fulfilled: "Fulfilled",
  cancelled: "Cancelled",
  none: ""
};

const BOOKSTORE_FALLBACK_FIELDS = [
  { category: "book", label: "Book", fields: [
    { key: "title", label: "Title", required: true, maxLength: 180 },
    { key: "author", label: "Author", required: false, maxLength: 120 },
    { key: "isbn", label: "ISBN / barcode", required: false, maxLength: 32 }
  ] },
  { category: "prayer_rope", label: "Prayer Rope", fields: [
    { key: "description", label: "Description", required: true, maxLength: 180 },
    { key: "color", label: "Color", required: false, maxLength: 80 }
  ] },
  { category: "icon", label: "Icon", fields: [
    { key: "saint_or_feast", label: "Saint or feast", required: true, maxLength: 160 },
    { key: "size", label: "Size", required: false, maxLength: 80 }
  ] },
  { category: "candle", label: "Candle", fields: [{ key: "description", label: "Description", required: true, maxLength: 160 }] },
  { category: "jewelry", label: "Jewelry / Cross", fields: [{ key: "description", label: "Description", required: true, maxLength: 180 }] },
  { category: "incense", label: "Incense", fields: [{ key: "description", label: "Description", required: true, maxLength: 160 }] },
  { category: "cd_dvd", label: "CD / DVD", fields: [{ key: "title", label: "Title", required: true, maxLength: 180 }] },
  { category: "other", label: "Other Item", fields: [{ key: "description", label: "Description", required: true, maxLength: 180 }] }
];

function formatCentsAsDollars(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

let bookstoreItemFieldsSchema = null;
let bookstoreProducts = [];
let bookstoreCart = [];

async function loadBookstoreItemFieldsSchema() {
  if (bookstoreItemFieldsSchema) return bookstoreItemFieldsSchema;
  try {
    const res = await fetch("/api/donor/bookstore/item-fields");
    const data = await res.json().catch(() => ({}));
    bookstoreItemFieldsSchema = Array.isArray(data.categories) && data.categories.length ? data.categories : BOOKSTORE_FALLBACK_FIELDS;
  } catch {
    bookstoreItemFieldsSchema = BOOKSTORE_FALLBACK_FIELDS;
  }
  const select = document.getElementById("bookstoreCategory");
  if (select && bookstoreItemFieldsSchema.length) {
    select.innerHTML = '<option value="">Choose...</option>' +
      bookstoreItemFieldsSchema.map(c => `<option value="${escapeHtml(c.category)}">${escapeHtml(c.label)}</option>`).join("");
  }
  return bookstoreItemFieldsSchema;
}

function renderBookstoreItemFields() {
  const container = document.getElementById("bookstoreItemFields");
  const category = document.getElementById("bookstoreCategory")?.value || "";
  if (!container) return;
  if (!category || !bookstoreItemFieldsSchema) {
    container.innerHTML = '<p style="color:#6F6A60;font-size:13.5px;margin:0;">Choose an item type above to continue.</p>';
    return;
  }
  const entry = bookstoreItemFieldsSchema.find(c => c.category === category);
  const fields = entry?.fields || [];
  const scanButton = category === "book"
    ? `<button type="button" class="btn btn-ghost btn-sm bookstore-scan-btn" onclick="openBookstoreScanner()">
         <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M11 5v14M17 5v14"/></svg>
         Scan book barcode
       </button>`
    : "";
  container.innerHTML = scanButton + fields.map(field => {
    const inputId = `bookstoreField_${field.key}`;
    if (field.type === "select") {
      const options = field.options.map(opt => `<option value="${escapeHtml(opt)}">${escapeHtml(opt.charAt(0).toUpperCase() + opt.slice(1))}</option>`).join("");
      return `<div style="margin-bottom:8px;"><label class="form-label" for="${inputId}">${escapeHtml(field.label)}</label>
        <select class="form-input" id="${inputId}" data-field-key="${escapeHtml(field.key)}" ${field.required ? "required" : ""}>
          <option value="">${field.required ? "Choose..." : "Not specified"}</option>${options}
        </select></div>`;
    }
    return `<div style="margin-bottom:8px;"><label class="form-label" for="${inputId}">${escapeHtml(field.label)}</label>
      <input class="form-input" id="${inputId}" data-field-key="${escapeHtml(field.key)}" type="text" maxlength="${field.maxLength || 150}" ${field.required ? "required" : ""} /></div>`;
  }).join("");
}

function bookstoreProductById(productId, variantId = "") {
  return bookstoreProducts.find(product => product.id === productId && (!variantId || product.variantId === variantId))
    || bookstoreProducts.find(product => product.variantId === variantId)
    || null;
}

function renderBookstoreProducts(products = []) {
  const container = document.getElementById("bookstoreProductCatalog");
  if (!container) return;
  if (!products.length) {
    container.innerHTML = '<div class="notice">No parish products yet. Enter or scan an item below and it will be added to the parish catalog after checkout starts.</div>';
    return;
  }

  const openLabels = new Set(Array.from(container.querySelectorAll("details.bookstore-category-group[open]")).map(el => el.dataset.category));

  const groups = new Map();
  products.forEach(product => {
    const label = product.categoryLabel || "Other items";
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(product);
  });

  container.innerHTML = Array.from(groups.entries()).map(([label, items], idx) => {
    const cartQtyInCategory = items.reduce((sum, product) => {
      const cartItem = bookstoreCart.find(ci => ci.productId === product.id && ci.variantId === (product.variantId || ""));
      return sum + (cartItem ? Number(cartItem.quantity || 1) : 0);
    }, 0);
    const isOpen = openLabels.has(label) || cartQtyInCategory > 0 || (openLabels.size === 0 && idx === 0);
    const badge = cartQtyInCategory
      ? `<span class="bookstore-category-count">${cartQtyInCategory} in cart</span>`
      : `<span class="bookstore-category-tally">${items.length} item${items.length === 1 ? "" : "s"}</span>`;

    const cardsHtml = items.map(product => {
      const cartItem = bookstoreCart.find(ci => ci.productId === product.id && ci.variantId === (product.variantId || ""));
      const qtyBadge = cartItem ? `<span class="bookstore-product-card-qty">${Number(cartItem.quantity || 1)}</span>` : "";
      const initial = escapeHtml((product.categoryLabel || product.name || "?").trim().charAt(0).toUpperCase() || "?");
      return `
      <button type="button" class="bookstore-product-card" onclick="addBookstoreProductToCart('${escapeHtml(product.id)}','${escapeHtml(product.variantId || "")}')">
        ${qtyBadge}
        <span class="bookstore-product-badge" aria-hidden="true">${initial}</span>
        <strong>${escapeHtml(product.name)}</strong>
        <small>${escapeHtml(product.description || product.categoryLabel || "Bookstore item")}</small>
        <span class="bookstore-product-meta"><span class="bookstore-category-pill">${escapeHtml(product.categoryLabel || "Item")}</span><span class="bookstore-price">${formatCentsAsDollars(product.priceCents)}</span></span>
      </button>
    `;
    }).join("");

    return `
      <details class="bookstore-category-group" data-category="${escapeHtml(label)}"${isOpen ? " open" : ""}>
        <summary class="bookstore-category-summary">
          <span class="bookstore-category-name">${escapeHtml(label)}</span>
          ${badge}
        </summary>
        <div class="bookstore-product-grid">${cardsHtml}</div>
      </details>
    `;
  }).join("");
}

function renderBookstoreCart() {
  const list = document.getElementById("bookstoreCartList");
  const total = document.getElementById("bookstoreCartTotal");
  const count = document.getElementById("bookstoreCartCount");
  const subtotal = bookstoreCart.reduce((sum, item) => sum + (Number(item.unitPriceCents || 0) * Number(item.quantity || 1)), 0);
  if (total) total.textContent = formatCentsAsDollars(subtotal);
  if (count) count.textContent = String(bookstoreCart.reduce((sum, item) => sum + Number(item.quantity || 1), 0));
  if (bookstoreProducts.length) renderBookstoreProducts(bookstoreProducts);
  if (!list) return;
  if (!bookstoreCart.length) {
    list.innerHTML = '<div class="notice">Your cart is empty.</div>';
    return;
  }
  list.innerHTML = bookstoreCart.map((item, index) => `
    <div class="bookstore-cart-row">
      <div class="bookstore-cart-row-top">
        <div><strong>${escapeHtml(item.name)}</strong><br><small>${escapeHtml(item.categoryLabel || "Bookstore item")} · ${formatCentsAsDollars(item.unitPriceCents)} each</small></div>
        <button type="button" class="btn btn-ghost btn-sm" onclick="removeBookstoreCartItem(${index})">Remove</button>
      </div>
      <div class="bookstore-qty-controls" aria-label="Quantity for ${escapeHtml(item.name)}">
        <button type="button" onclick="changeBookstoreCartQuantity(${index}, -1)">-</button>
        <span>${Number(item.quantity || 1)}</span>
        <button type="button" onclick="changeBookstoreCartQuantity(${index}, 1)">+</button>
        <small>${formatCentsAsDollars(Number(item.unitPriceCents || 0) * Number(item.quantity || 1))}</small>
      </div>
    </div>
  `).join("");
}

function addBookstoreProductToCart(productId, variantId = "") {
  const product = bookstoreProductById(productId, variantId);
  if (!product) return;
  const existing = bookstoreCart.find(item => item.productId === product.id && item.variantId === product.variantId);
  if (existing) existing.quantity = Math.min(50, Number(existing.quantity || 1) + 1);
  else bookstoreCart.push({
    type: "product",
    productId: product.id,
    variantId: product.variantId,
    name: product.name,
    categoryLabel: product.categoryLabel,
    unitPriceCents: product.priceCents,
    quantity: 1
  });
  renderBookstoreCart();
  setDonorStatus(`${product.name} added to your cart.`, "success");
}

function changeBookstoreCartQuantity(index, delta) {
  const item = bookstoreCart[index];
  if (!item) return;
  item.quantity = Math.max(1, Math.min(50, Number(item.quantity || 1) + delta));
  renderBookstoreCart();
}

function removeBookstoreCartItem(index) {
  bookstoreCart.splice(index, 1);
  renderBookstoreCart();
}

function clearManualBookstoreEntry() {
  const category = document.getElementById("bookstoreCategory");
  const quantity = document.getElementById("bookstoreQuantity");
  const price = document.getElementById("bookstorePrice");
  if (category) category.value = "";
  if (quantity) quantity.value = "1";
  if (price) price.value = "";
  const fields = document.getElementById("bookstoreItemFields");
  if (fields) fields.innerHTML = '<p style="color:#6F6A60;font-size:13.5px;margin:0;">Choose an item type above to enter a custom item.</p>';
}

function addManualBookstoreItem() {
  const itemCategory = document.getElementById("bookstoreCategory")?.value || "";
  if (!itemCategory) {
    setDonorStatus("Choose an item type before adding it to the cart.", "error");
    return;
  }
  const entry = (bookstoreItemFieldsSchema || BOOKSTORE_FALLBACK_FIELDS).find(c => c.category === itemCategory);
  const specifics = {};
  let missingRequired = false;
  document.querySelectorAll('#bookstoreItemFields [data-field-key]').forEach(el => {
    const key = el.getAttribute("data-field-key");
    const value = (el.value || "").trim();
    if (el.hasAttribute("required") && !value) missingRequired = true;
    if (value) specifics[key] = value;
  });
  if (missingRequired) {
    setDonorStatus("Fill in the required fields before adding this item.", "error");
    return;
  }
  const quantity = Number(document.getElementById("bookstoreQuantity")?.value) || 1;
  const unitPrice = Number(document.getElementById("bookstorePrice")?.value || 0);
  if (!unitPrice || unitPrice <= 0) {
    setDonorStatus("Enter a valid price before adding this item.", "error");
    return;
  }
  const name = itemCategory === "book"
    ? [specifics.title, specifics.author ? `by ${specifics.author}` : ""].filter(Boolean).join(" ")
    : (specifics.saint_or_feast || specifics.description || specifics.title || entry?.label || "Bookstore item");
  bookstoreCart.push({
    type: "manual",
    name,
    categoryLabel: entry?.label || BOOKSTORE_CATEGORY_LABELS[itemCategory] || "Item",
    itemCategory,
    specifics,
    unitPrice,
    unitPriceCents: Math.round(unitPrice * 100),
    quantity: Math.max(1, Math.min(50, quantity)),
    source: specifics.isbn ? "scan_and_go" : "manual_entry"
  });
  renderBookstoreCart();
  clearManualBookstoreEntry();
  setDonorStatus(`${name} added to your cart.`, "success");
}

// ------------------------------------------------------------------
// Book barcode scanning — scoped to the Book category only, since ISBNs
// are the one item type with a real, standardized barcode and a free
// public lookup (Open Library). Uses the native BarcodeDetector API when
// the browser supports it, falls back to the ZXing library otherwise.
// Any failure — no camera, permission denied, library didn't load, no
// match found — just closes the scanner and leaves manual Title/Author
// entry exactly as it was; scanning is additive, never a dead end.
// ------------------------------------------------------------------
let bookstoreScannerStream = null;
let bookstoreScannerRAF = null;
let bookstoreZXingReader = null;

async function openBookstoreScanner() {
  const overlay = document.getElementById("bookstoreScannerOverlay");
  const video = document.getElementById("bookstoreScannerVideo");
  const status = document.getElementById("bookstoreScannerStatus");
  if (!overlay || !video) return;
  overlay.hidden = false;
  if (status) status.textContent = "Point your camera at the barcode on the back of the book.";

  try {
    bookstoreScannerStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" }
    });
  } catch {
    if (status) status.textContent = "Couldn't access your camera. You can still enter the title and author below.";
    setTimeout(closeBookstoreScanner, 1800);
    return;
  }
  video.srcObject = bookstoreScannerStream;
  await video.play().catch(() => {});

  if ("BarcodeDetector" in window) {
    try {
      const supported = await window.BarcodeDetector.getSupportedFormats();
      if (supported.includes("ean_13")) {
        const detector = new window.BarcodeDetector({ formats: ["ean_13"] });
        scanWithBarcodeDetector(detector, video);
        return;
      }
    } catch { /* fall through to ZXing */ }
  }
  scanWithZXing(video, status);
}

function scanWithBarcodeDetector(detector, video) {
  const tick = async () => {
    if (!bookstoreScannerStream) return;
    try {
      const codes = await detector.detect(video);
      if (codes.length) {
        handleBarcodeDetected(codes[0].rawValue);
        return;
      }
    } catch { /* keep trying */ }
    bookstoreScannerRAF = requestAnimationFrame(tick);
  };
  bookstoreScannerRAF = requestAnimationFrame(tick);
}

function scanWithZXing(video, status) {
  if (typeof ZXing === "undefined") {
    if (status) status.textContent = "Barcode scanning isn't available on this device. Enter the title and author below.";
    setTimeout(closeBookstoreScanner, 2200);
    return;
  }
  try {
    bookstoreZXingReader = new ZXing.BrowserMultiFormatReader();
    bookstoreZXingReader.decodeFromVideoElement(video, (result, err) => {
      if (result?.text) handleBarcodeDetected(result.text);
    });
  } catch {
    if (status) status.textContent = "Barcode scanning isn't available on this device. Enter the title and author below.";
    setTimeout(closeBookstoreScanner, 2200);
  }
}

async function handleBarcodeDetected(rawValue) {
  const isbn = String(rawValue || "").replace(/[^0-9Xx]/g, "");
  if (isbn.length !== 10 && isbn.length !== 13) return; // not a book ISBN, keep scanning

  const status = document.getElementById("bookstoreScannerStatus");
  if (status) status.textContent = "Found it — looking up the title...";
  closeBookstoreScanner();

  try {
    const parishId = document.getElementById("bookstoreParishId")?.value || donorProfile()?.defaultParishId || "";
    const data = await donorApi(`/api/donor/bookstore/isbn-lookup?isbn=${encodeURIComponent(isbn)}`, {
      headers: donorAuthHeaders({ "X-AGAPAY-Parish-Id": parishId })
    });
    if (data.found && data.product?.id) {
      const product = data.product;
      if (!bookstoreProductById(product.id, product.variantId)) {
        bookstoreProducts.push(product);
        renderBookstoreProducts(bookstoreProducts);
      }
      addBookstoreProductToCart(product.id, product.variantId || "");
      setDonorStatus(`${product.name} found in the parish catalog and added to your cart.`, "success");
    } else if (data.found) {
      const category = document.getElementById("bookstoreCategory");
      if (category) {
        category.value = "book";
        renderBookstoreItemFields();
      }
      const titleInput = document.getElementById("bookstoreField_title");
      const authorInput = document.getElementById("bookstoreField_author");
      const isbnInput = document.getElementById("bookstoreField_isbn");
      if (titleInput) titleInput.value = data.title || "";
      if (authorInput) authorInput.value = data.author || "";
      if (isbnInput) isbnInput.value = data.isbn || isbn;
      setDonorStatus("Title filled in from the barcode. Enter the price, then add it to your cart.", "success");
    } else {
      setDonorStatus("Couldn't find that book — enter the title and author below.", "info");
    }
  } catch {
    setDonorStatus("Couldn't look up that book — enter the title and author below.", "info");
  }
}

function closeBookstoreScanner() {
  const overlay = document.getElementById("bookstoreScannerOverlay");
  const video = document.getElementById("bookstoreScannerVideo");
  if (overlay) overlay.hidden = true;
  if (bookstoreScannerRAF) cancelAnimationFrame(bookstoreScannerRAF);
  bookstoreScannerRAF = null;
  if (bookstoreZXingReader) {
    try { bookstoreZXingReader.reset(); } catch {}
    bookstoreZXingReader = null;
  }
  if (bookstoreScannerStream) {
    bookstoreScannerStream.getTracks().forEach(track => track.stop());
    bookstoreScannerStream = null;
  }
  if (video) video.srcObject = null;
}

async function loadDonorBookstorePage() {
  const session = donorSession();
  const list = document.getElementById("bookstoreOrderList");
  primeCommemorationParishDisplay();
  loadBookstoreItemFieldsSchema();


  if (!session.email || !session.token) {
    if (list) list.innerHTML = '<div class="notice">Sign in to view your orders.</div>';
    return;
  }

  const donor = donorProfile();
  const parishId = donor?.defaultParishId || "";
  const parishName = donor?.defaultParish?.name || donor?.defaultParishName || "YOUR PARISH";
  setText("bookstoreHeroTitle", `PAY FOR YOUR ITEMS AT THE ${parishName} BOOKSTORE.`);
  setText("bookstoreHeroDescription", "Shop at your parish bookstore, then use your phone to pay for the items you enter below.");
  const parishInput = document.getElementById("bookstoreParishId");
  if (parishInput) parishInput.value = parishId;

  if (!parishId) {
    const formCard = document.getElementById("bookstoreFormCard");
    if (formCard) formCard.style.display = "none";
    if (list) list.innerHTML = '<div class="notice">Choose your parish in Settings before ordering from the bookstore.</div>';
    return;
  }

  handleBookstoreCheckoutReturn();

  const cached = readDonorCache("bookstore");
  if (cached) renderBookstorePayload(cached);

  try {
    const data = await donorApi("/api/donor/bookstore", {
      headers: donorAuthHeaders({ "X-AGAPAY-Parish-Id": parishId })
    });
    writeDonorCache("bookstore", data);
    renderBookstorePayload(data);
  } catch (err) {
    if (isDonorUnauthorized(err)) {
      clearDonorSession();
      if (list) list.innerHTML = '<div class="notice">Session expired. Please sign in again.</div>';
      return;
    }
    if (!cached) {
      if (list) list.innerHTML = `<div class="notice">${escapeHtml(err.message)}</div>`;
    }
  }
}

function renderBookstorePayload(payload = {}) {
  const list = document.getElementById("bookstoreOrderList");
  const form = document.getElementById("bookstoreForm");
  const unavailableNotice = document.getElementById("bookstoreUnavailableNotice");

  const available = payload.available !== false; // default to showing the form while first loading
  if (form) form.style.display = available ? "" : "none";
  bookstoreProducts = Array.isArray(payload.products) ? payload.products : [];
  renderBookstoreProducts(bookstoreProducts);
  renderBookstoreCart();
  if (unavailableNotice) {
    unavailableNotice.style.display = available ? "none" : "block";
    unavailableNotice.innerHTML = available ? "" : `
      <p style="margin:0 0 8px;">Your parish hasn't activated Bookstore Payments yet.</p>
      <p style="margin:0 0 12px;">Bookstore Payments are part of the AGAPAY Parish+ premium add-on. You can request this feature and AGAPAY will let your parish know donors are interested.</p>
      <button type="button" class="btn btn-ghost btn-sm" onclick="requestBookstoreFeature(this)">Request this feature for my parish</button>
    `;
  }

  const orders = Array.isArray(payload.orders) ? payload.orders : [];
  if (list) {
    list.innerHTML = orders.length
      ? orders.map(bookstoreOrderRow).join("")
      : '<div class="notice">No orders yet.</div>';
  }
  return payload;
}

async function requestBookstoreFeature(btn) {
  const parishId = document.getElementById("bookstoreParishId")?.value || donorProfile()?.defaultParishId || "";
  if (!parishId) return;
  if (btn) { btn.disabled = true; btn.textContent = "Sending..."; }
  try {
    const data = await donorApi("/api/donor/bookstore/request-feature", {
      method: "POST",
      body: JSON.stringify({ parishId })
    });
    if (btn) btn.textContent = data.alreadySent ? "Already asked recently" : "Request sent!";
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = "Request this feature for my parish"; }
    setDonorStatus(err.message, "error");
  }
}

function bookstoreOrderRow(row) {
  const statusLabel = BOOKSTORE_STATUS_LABELS[row.status] || row.status;
  const tone = BOOKSTORE_STATUS_TONE[row.status] || "muted";
  const categoryLabel = row.itemCategoryLabel || BOOKSTORE_CATEGORY_LABELS[row.itemCategory] || "Item";
  const isPaid = row.paymentStatus === "paid";
  const items = Array.isArray(row.items) ? row.items : [];
  const fulfillmentLabel = BOOKSTORE_FULFILLMENT_LABELS[row.fulfillmentStatus] || "";
  const dateLabel = shortDate(row.createdAt);

  // Paid orders expand into a real line-item receipt. Unpaid/failed/expired
  // checkouts have no confirmed items worth itemizing, so they stay flat.
  if (!isPaid || !items.length) {
    return `<div class="sac-row">
      <div class="sac-row-top">
        <span class="sac-row-type">${escapeHtml(row.itemDescription)}</span>
        <span class="status-pill ${tone}">${escapeHtml(statusLabel)}</span>
      </div>
      <div class="sac-row-meta">${escapeHtml(categoryLabel)} &times; ${row.quantity} &middot; ${formatCentsAsDollars(row.totalChargedCents || row.subtotalCents)}${row.pickupNote ? ` &middot; ${escapeHtml(row.pickupNote)}` : ""}</div>
    </div>`;
  }

  const itemLines = items.map((item) => `
    <li class="bk-receipt-line">
      <span class="bk-receipt-line-name">${escapeHtml(item.name)}${item.quantity > 1 ? ` <em>&times;${item.quantity}</em>` : ""}</span>
      <span class="bk-receipt-line-amt">${formatCentsAsDollars(item.totalCents)}</span>
    </li>`).join("");

  return `<div class="bk-receipt">
    <button type="button" class="bk-receipt-head" onclick="this.closest('.bk-receipt').classList.toggle('is-open')" aria-expanded="false">
      <div class="bk-receipt-summary">
        <span class="sac-row-type">${escapeHtml(row.itemDescription)}</span>
        <span class="sac-row-meta">${escapeHtml(categoryLabel)} &middot; ${dateLabel}${fulfillmentLabel ? ` &middot; ${escapeHtml(fulfillmentLabel)}` : ""}</span>
      </div>
      <div class="bk-receipt-head-right">
        <span class="bk-receipt-total">${formatCentsAsDollars(row.totalChargedCents || row.subtotalCents)}</span>
        <span class="status-pill ${tone}">${escapeHtml(statusLabel)}</span>
        <svg class="bk-receipt-caret" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m3 5 3 3 3-3"/></svg>
      </div>
    </button>
    <div class="bk-receipt-body">
      <div class="bk-receipt-body-inner">
        <ul class="bk-receipt-lines">${itemLines}</ul>
        <div class="bk-receipt-totals">
          <span>Subtotal</span><span>${formatCentsAsDollars(row.subtotalCents)}</span>
          ${row.taxCents ? `<span>Tax</span><span>${formatCentsAsDollars(row.taxCents)}</span>` : ""}
          <span class="bk-receipt-total-row">Total paid</span><span class="bk-receipt-total-row">${formatCentsAsDollars(row.totalChargedCents || row.subtotalCents)}</span>
        </div>
        ${row.pickupNote ? `<p class="bk-receipt-note">Note to parish: ${escapeHtml(row.pickupNote)}</p>` : ""}
      </div>
    </div>
  </div>`;
}

async function submitBookstoreOrder(event) {
  event.preventDefault();
  const session = donorSession();
  if (!session.email || !session.token) {
    setDonorStatus("Sign in from the donor home page before checking out.", "error");
    return;
  }

  const parishId = document.getElementById("bookstoreParishId")?.value || donorProfile()?.defaultParishId || "";
  if (!parishId) {
    setDonorStatus("Choose your parish in Settings first.", "error");
    return;
  }

  if (!bookstoreCart.length) {
    setDonorStatus("Add at least one item to your cart before checkout.", "error");
    return;
  }
  const pickupNote = document.getElementById("bookstorePickupNote")?.value || "";
  const coverFees = document.getElementById("bookstoreCoverFees")?.checked !== false;
  const items = bookstoreCart.map(item => item.type === "product"
    ? {
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity
      }
    : {
        itemCategory: item.itemCategory,
        specifics: item.specifics,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        source: item.source || "manual_entry"
      });

  try {
    setDonorStatus("Preparing checkout...");
    const data = await donorApi("/api/donor/bookstore", {
      method: "POST",
      body: JSON.stringify({
        parishId,
        items,
        pickupNote,
        coverFees,
        email: session.email
      })
    });
    if (data.url) window.location.href = data.url;
    else setDonorStatus(data.message || "Checkout is not available yet.", "error");
  } catch (err) {
    setDonorStatus(err.message, "error");
  }
}

function handleBookstoreCheckoutReturn() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("order_success") === "1") {
    setDonorStatus("Payment received — thank you! Your parish will let you know when your item is ready.", "success");
    window.history.replaceState({}, "", "/myagapay/bookstore");
  } else if (params.get("order_canceled") === "1") {
    setDonorStatus("Checkout canceled. Your order was not charged.", "info");
    window.history.replaceState({}, "", "/myagapay/bookstore");
  }
}
