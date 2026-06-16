const donorStore = {
  email: "agapayDonorEmail",
  token: "agapayDonorToken",
  donor: "agapayDonorProfile",
  cachePrefix: "agapayDonorCache"
};

function donorSession() {
  return {
    email: localStorage.getItem(donorStore.email) || "",
    token: localStorage.getItem(donorStore.token) || ""
  };
}

function donorAuthHeaders(extra = {}) {
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

function isDonorUnauthorized(err) {
  return err?.status === 401 || String(err?.message || "").toLowerCase() === "unauthorized";
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
    || (String(value || "julian").toLowerCase().includes("gregorian") ? "Revised Julian / Gregorian" : "Julian / Old Calendar");
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
  window.location.href = "/donor/login";
}

function showGuestDonorDashboard() {
  setDonorStatus("");
  setText("profileName", "Faithful Account");
  setText("profileMeta", "Sign in to load live giving history");
  setText("greeting", "Welcome, Faithful Member");
  setText("desktopGreeting", "Welcome, Faithful Member");
  setText("myAgapayGreetingName", "Faithful Member");
  setText("myAgapayDefaultParish", "Choose a church in Settings");
  setText("myAgapayLearnFeast", "Open calendar");
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
        <a class="activity-amount" href="/donor/login">Log in</a>
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
  return `/donor/give?${params.toString()}`;
}

function quickDonorGiftUrl(giftType, parish, extra = {}) {
  return donorGiftUrl(giftType, parish, { quick: "1", ...extra });
}

function normalizeDonorGiftType(value) {
  const normalized = String(value || "stewardship").toLowerCase();
  const aliases = {
    alms: "campaign",
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
    title: "Support an active alms campaign.",
    detailsTitle: "Alms Campaign Offering",
    intro: "Give directly toward parish-approved needs, relief efforts, sickness support, or other alms campaigns.",
    context: "Your gift will be prepared as an alms campaign offering for the selected parish."
  },
  feast: {
    eyebrow: "Quick Feast Offering",
    title: "Mark the feast with an offering.",
    detailsTitle: "Feast Day Offering",
    intro: "Make a feast day offering based on your parish calendar.",
    context: "Your gift will be prepared as a feast day offering for the selected parish."
  }
};

function donorNavIcon(kind) {
  const icons = {
    home: '<svg viewBox="0 0 38 38" aria-hidden="true"><line x1="19" y1="2" x2="19" y2="5"/><line x1="17" y1="3.5" x2="21" y2="3.5"/><path d="M19 5 C15 7 13 11 14 14 C15 16 17 17 19 17 C21 17 23 16 24 14 C25 11 23 7 19 5Z"/><line x1="10" y1="6" x2="10" y2="8"/><path d="M10 8 C8 9.5 7 12 7.5 14 C8 15.5 9 16 10 16 C11 16 12 15.5 12.5 14 C13 12 12 9.5 10 8Z"/><line x1="28" y1="6" x2="28" y2="8"/><path d="M28 8 C26 9.5 25 12 25.5 14 C26 15.5 27 16 28 16 C29 16 30 15.5 30.5 14 C31 12 30 9.5 28 8Z"/><rect x="4" y="17" width="30" height="14" rx="1"/><path d="M16 31 L16 25 Q19 22 22 25 L22 31"/></svg>',
    give: '<svg viewBox="0 0 28 28" aria-hidden="true"><rect x="3" y="7" width="22" height="16" rx="3"/><path d="M3 11h22"/><circle class="icon-dot" cx="8" cy="17" r="1.5"/><path d="M12 17h8"/></svg>',
    calendar: '<svg viewBox="0 0 28 28" aria-hidden="true"><rect x="3" y="5" width="22" height="20" rx="3"/><path d="M3 11h22"/><path d="M9 3v4M19 3v4"/><path d="M8 16h4M8 20h8"/></svg>',
    history: '<svg viewBox="0 0 28 28" aria-hidden="true"><path d="M4 22h20"/><path d="M6 22V14l3-2v10"/><path d="M12 22V10l3-2v14"/><path d="M18 22V6l3-2v18"/></svg>',
    commemorations: '<svg viewBox="0 0 28 28" aria-hidden="true"><path d="M4 16c0-5 2-8 5-9 1.5-.5 3-.5 5-.5s3.5 0 5 .5c3 1 5 4 5 9"/><path d="M4 16c0 3 2 5 10 5s10-2 10-5"/><path d="M10 13c1-2 2-3 4-3s3 1 4 3"/><line x1="14" y1="7" x2="14" y2="10"/><line x1="12" y1="8" x2="16" y2="8"/></svg>',
    profile: '<svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="3.25"/><path d="M14 3.5v3"/><path d="M14 21.5v3"/><path d="M3.5 14h3"/><path d="M21.5 14h3"/><path d="m6.58 6.58 2.12 2.12"/><path d="m19.3 19.3 2.12 2.12"/><path d="m21.42 6.58-2.12 2.12"/><path d="m8.7 19.3-2.12 2.12"/><circle cx="14" cy="14" r="8.25"/></svg>'
  };
  return icons[kind] || icons.home;
}

function donorNavKind(href) {
  const path = String(href || "");
  if (path.includes("/settings")) return "profile";
  if (path.includes("/offerings")) return "history";
  if (path.includes("/calendar")) return "calendar";
  if (path.includes("/commemorations")) return "commemorations";
  if (path.includes("/give")) return "give";
  return "home";
}

function applyDonorNavIcons() {
  document.querySelectorAll(".nav a, .mobile-tabbar a").forEach((link) => {
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

function updateQuickGiveLinks(parish) {
  const parishLink = document.getElementById("quickGiveParish");
  const parishIcon = document.getElementById("quickGiveParishIcon");
  const desktopParishIcon = document.getElementById("desktopParishIcon");
  const candleLink = document.getElementById("quickGiveCandle");
  const memorialLink = document.getElementById("quickGiveMemorial");
  const campaignLink = document.getElementById("quickGiveCampaigns");
  const desktopParishLink = document.getElementById("desktopQuickParish");
  const desktopCandleLink = document.getElementById("desktopQuickCandle");
  const desktopMemorialLink = document.getElementById("desktopQuickMemorial");
  const desktopCampaignLink = document.getElementById("desktopQuickCampaigns");
  if (parishLink) parishLink.href = quickDonorGiftUrl("stewardship", parish);
  if (desktopParishLink) desktopParishLink.href = quickDonorGiftUrl("stewardship", parish);
  if (parishIcon) parishIcon.innerHTML = communityIconSvg(parish?.type);
  if (desktopParishIcon) desktopParishIcon.innerHTML = communityIconSvg(parish?.type);
  if (candleLink) candleLink.href = quickDonorGiftUrl("candles", parish);
  if (desktopCandleLink) desktopCandleLink.href = quickDonorGiftUrl("candles", parish);
  if (memorialLink) memorialLink.href = quickDonorGiftUrl("commemoration", parish);
  if (desktopMemorialLink) desktopMemorialLink.href = quickDonorGiftUrl("commemoration", parish);
  if (campaignLink) campaignLink.href = quickDonorGiftUrl("campaign", parish);
  if (desktopCampaignLink) desktopCampaignLink.href = quickDonorGiftUrl("campaign", parish);
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
  return campaign?.name || campaign?.campaignName || "Parish Alms Campaign";
}

function campaignGoalCents(campaign) {
  return Number(campaign?.goalCents || campaign?.targetCents || campaign?.goalAmountCents || 0);
}

function campaignRaisedCents(campaign) {
  return Number(campaign?.raisedCents || campaign?.amountCents || campaign?.currentCents || 0);
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

function renderActiveCampaigns(parish) {
  const targets = [document.getElementById("activeCampaigns"), document.getElementById("desktopActiveCampaigns")].filter(Boolean);
  if (!targets.length) return;
  const campaign = activeParishCampaigns(parish)[0];
  if (!campaign) {
    const empty = `
      <article class="campaign-card campaign-empty">
        <span class="campaign-pill">Campaigns</span>
        <h3>No Active Campaigns</h3>
        <p>${parish?.name ? "This church does not have an active alms campaign right now." : "Sign in and select a church to see parish-approved alms campaigns here."}</p>
      </article>
    `;
    targets.forEach((target) => { target.innerHTML = empty; });
    return;
  }

  const goalCents = Number(campaign.goalCents || campaign.targetCents || campaign.goalAmountCents || 0);
  const raisedCents = Number(campaign.raisedCents || campaign.amountCents || campaign.currentCents || 0);
  const percent = goalCents > 0 ? Math.min(100, Math.round((raisedCents / goalCents) * 100)) : 0;
  const label = campaign.category || campaign.type || (campaign.feastId ? "Liturgical" : "Alms");
  const link = donorGiftUrl("campaign", parish, { campaign: campaign.id || campaign.feastId || campaign.name });
  const html = `
    <a class="campaign-card ${campaign.feastId ? "campaign-gold" : "campaign-navy"}" href="${escapeHtml(link)}">
      <div class="campaign-meta">
        <span class="campaign-pill">${escapeHtml(label)}</span>
        <span>${parish?.name ? escapeHtml(parish.name) : "AGAPAY"}</span>
      </div>
      <h3>${escapeHtml(campaign.name || "Parish Alms Campaign")}</h3>
      ${campaign.description ? `<p class="campaign-description">${escapeHtml(campaign.description)}</p>` : ""}
      ${goalCents > 0 ? `<div class="campaign-track"><span style="width:${percent}%"></span></div><p><strong>${money(raisedCents)}</strong> of ${money(goalCents)} <span>${percent}%</span></p>` : ""}
    </a>
  `;
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
      if (target.link) target.link.href = "/donor/give?giftType=feast";
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

function renderDonorCalendarFeasts(parish) {
  const api = window.AGAPAYLiturgicalCalendar;
  const grid = document.getElementById("calendarGrid");
  if (!grid || !api) return;

  const calendar = parish?.liturgicalCalendar || donorProfile()?.defaultParish?.liturgicalCalendar || donorProfile()?.liturgicalCalendar || "julian";
  const year = new Date().getFullYear();
  const label = api.calendarLabel(calendar);
  const feasts = api.liturgicalFeastsForYear(year, calendar);
  const next = api.nextLiturgicalFeast(calendar, new Date());
  const pascha = api.orthodoxPascha(year);
  const highlighted = feasts
    .filter((feast) => ["great", "major", "holy-week", "bright-week", "fast"].includes(feast.rank))
    .slice(0, 24);

  setText("calendarModePill", label);
  setText("nextFeastDate", calendarShortDateIso(next?.date));
  setText("nextFeastName", next?.name || "No feast found.");
  setText("paschaDate", calendarShortDateIso(pascha?.iso));
  setText("calendarShortName", calendar === "gregorian" ? "New" : "Old");
  setText("calendarFullName", label);

  grid.innerHTML = highlighted.map((feast) => `
    <div class="day">
      <span class="day-number">${calendarShortDateIso(feast.date)}</span>
      <div class="feast ${feast.rank === "great" || feast.rank === "holy-week" ? "major" : ""}">
        ${escapeHtml(feast.name)}
      </div>
    </div>
  `).join("");
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
        : (campaign.description || "Parish-approved alms campaign."),
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
    <div class="list-item">
      <div class="list-main">
        <strong>${escapeHtml(prompt.title)}</strong>
        <span>${escapeHtml(prompt.description)}</span>
      </div>
      <a class="btn btn-ghost btn-sm" href="${escapeHtml(prompt.href)}">Give</a>
    </div>
  `).join("");
}

async function loadDonorCalendarPage() {
  const session = donorSession();
  if (!session.email || !session.token) {
    renderDonorCalendarFeasts(null);
    renderDonorCalendarPrompts(null);
    return;
  }
  try {
    const data = await donorApi("/api/donor/dashboard");
    setDonorProfile(data.donor);
    renderDonorCalendarFeasts(data.parish || null);
    renderDonorCalendarPrompts(data.parish || null);
  } catch (err) {
    if (isDonorUnauthorized(err)) {
      clearDonorSession();
      renderDonorCalendarFeasts(null);
      renderDonorCalendarPrompts(null);
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
    setDonorStatus("Signed in. Opening your donor dashboard...", "success");
    window.location.href = "/donor/";
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
      setDonorStatus("Email already verified. Please log in to open your donor dashboard.", "success");
      setTimeout(() => { window.location.href = "/donor/login"; }, 900);
      return;
    }
    saveDonorSession(data);
    setDonorStatus("Email verified. Opening your donor dashboard...", "success");
    setTimeout(() => { window.location.href = "/donor"; }, 900);
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

function renderMyAgapayDashboard(data) {
  const donor = data?.donor || {};
  const summary = data?.summary || {};
  const parish = data?.parish || null;
  const recentOfferings = Array.isArray(data?.recentOfferings) ? data.recentOfferings : [];
  const monthCents = summary.parishNetMonthCents ?? summary.monthCents;
  const ytdCents = summary.parishNetYtdCents ?? summary.ytdCents;
  const latestOffering = recentOfferings[0] || null;
  const feast = parish ? nextFeastForCalendar(parish.calendar) : null;

  setText("myAgapayGreetingName", donorDisplayName(donor));
  setText("myAgapayDefaultParish", parish?.name || "Choose a church in Settings");
  setText("myAgapayLearnFeast", feast?.name || "Open calendar");
  setText("myAgapayRecurringCount", `${summary.recurringCount || 0} Active`);
  setText("myAgapayRecentAmount", latestOffering ? money(latestOffering.amountCents) : money(ytdCents));
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
    href: "/donor/offerings"
  }));

  const fallbackActivities = [
    {
      glyph: "L",
      title: "AGAPAY Learn is ready",
      meta: "Open your Orthodox homeschool dashboard",
      value: "View",
      href: "/learn/app"
    },
    {
      glyph: "C",
      title: `${summary.commemorationCount || 0} commemorations recorded`,
      meta: "Names submitted through AGAPAY",
      value: "View",
      href: "/donor/commemorations"
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

  renderPledgeTracker(data.donor);
  updateQuickGiveLinks(parish);
  renderActiveCampaigns(parish);
  renderNextFeast(parish);

  const recent = document.getElementById("recentOfferings");
  if (recent) recent.innerHTML = offeringRows(recentOfferings);
  const desktopRecent = document.getElementById("desktopRecentOfferings");
  if (desktopRecent) desktopRecent.innerHTML = offeringRows(recentOfferings);
}

async function loadDonorDashboardPage() {
  const session = donorSession();
  if (!session.email || !session.token) {
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
    setDonorStatus("Log in to update donor settings.", "error");
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
    setDonorStatus("Saving donor settings...");
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

function renderOfferingsPayload(payload = {}, fallbackDashboard = null, statusText = "Live data") {
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
  setText("offeringsYtd", money(summary.parishNetYtdCents ?? summary.ytdCents));
  setText("offeringsRecurring", String(summary.recurringCount || 0));
  setText("offeringsReceiptCount", String(summary.offeringCount || offerings.length || 0));
  setText("offeringsStatus", offerings.length ? statusText : "No data yet");
  renderRecurringManagement(offerings);
  renderDonorOfferings();
  return { offerings, summary };
}

async function loadDonorOfferingsPage() {
  const session = donorSession();
  if (!session.email || !session.token) {
    const list = document.getElementById("offeringList");
    if (list) list.innerHTML = '<div class="notice">Sign in to view your live offering history.</div>';
    setText("offeringsStatus", "Sign in");
    return;
  }

  const cachedDashboard = readDonorCache("dashboard");
  const cachedOfferings = readDonorCache("offerings");
  if (cachedOfferings || cachedDashboard) {
    renderOfferingsPayload(cachedOfferings || {}, cachedDashboard, "Refreshing...");
  }

  try {
    const [offeringsResult, dashboardResult] = await Promise.allSettled([
      donorApi("/api/donor/offerings"),
      donorApi("/api/donor/dashboard")
    ]);

    if (offeringsResult.status === "rejected" && isDonorUnauthorized(offeringsResult.reason)) {
      throw offeringsResult.reason;
    }
    if (dashboardResult.status === "rejected" && isDonorUnauthorized(dashboardResult.reason)) {
      throw dashboardResult.reason;
    }

    const dashboardData = dashboardResult.status === "fulfilled" ? dashboardResult.value : cachedDashboard;
    const offeringsData = offeringsResult.status === "fulfilled" ? offeringsResult.value : cachedOfferings;
    if (!offeringsData && !dashboardData) throw offeringsResult.reason || dashboardResult.reason || new Error("Unable to load offerings");
    if (dashboardData?.donor) setDonorProfile(dashboardData.donor);
    if (dashboardResult.status === "fulfilled") writeDonorCache("dashboard", dashboardData);
    const rendered = renderOfferingsPayload(offeringsData || {}, dashboardData, "Live data");
    writeDonorCache("offerings", rendered);
  } catch (err) {
    if (isDonorUnauthorized(err)) {
      clearDonorSession();
      const list = document.getElementById("offeringList");
      if (list) list.innerHTML = '<div class="notice">Session expired. Please sign in again.</div>';
      setText("offeringsStatus", "Sign in");
      return;
    }
    const list = document.getElementById("offeringList");
    if (list) list.innerHTML = `<div class="notice">${escapeHtml(err.message)} Sign in from the donor home page first.</div>`;
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
        <a class="btn btn-gold btn-sm" href="/donor/give?frequency=monthly">Start recurring gift</a>
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
    window.location.href = "/donor/login";
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

function renderCommemorationsPayload(payload = {}, fallbackDashboard = null) {
  const entries = Array.isArray(payload.entries) && payload.entries.length
    ? payload.entries
    : fallbackDashboard?.recentCommemorations || [];
  const list = document.getElementById("commemorationList");
  if (list) {
    list.innerHTML = entries.length
      ? commemorationRows(entries)
      : '<div class="notice">No commemoration submissions have been recorded yet. Paid commemoration gifts will appear here after checkout completes.</div>';
  }
  return { entries };
}

async function loadDonorCommemorationsPage() {
  const session = donorSession();
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

function selectedDonorPaymentMethod(frequency = "once") {
  const value = document.querySelector('input[name="paymentMethod"]:checked')?.value || "card";
  return value === "ach" ? "ach" : "card";
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
    setDonorStatus("Preparing commemoration checkout...");
    const session = donorSession();
    const donor = donorProfile();
    const name = donor.donorName || donor.householdName || session.email.split("@")[0];
    const [firstName, ...rest] = name.split(/\s+/);
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
        inMemoriam: document.getElementById("commemorationIntentionNote")?.value || "",
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
  try {
    setDonorStatus("Preparing checkout...");
    const frequency = document.getElementById("frequency")?.value || "once";
    const paymentMethod = selectedDonorPaymentMethod(frequency);
    if (frequency !== "once" && paymentMethod === "ach") {
      setDonorStatus("Bank account gifts are available for one-time gifts. Choose card or wallet for recurring giving.", "error");
      return;
    }
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
        fund: normalizedGiftType === "fund" ? (selectedFund?.name || document.getElementById("fund")?.value || "") : "",
        fundId: normalizedGiftType === "fund" ? (selectedFund?.id || document.getElementById("fund")?.value || "") : "",
        campaign: normalizedGiftType === "campaign" ? campaignLabel(campaign) : "",
        campaignId: normalizedGiftType === "campaign" ? (campaign?.id || campaign?.feastId || document.getElementById("campaign")?.value || "") : "",
        campaignDescription: normalizedGiftType === "campaign" ? campaign?.description || "" : "",
        namesLiving: livingNames,
        namesDeparted: departedNames,
        inMemoriam: intentionNote,
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
    window.history.replaceState(null, "", "/donor");
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
  window.history.replaceState(null, "", "/donor");
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
  document.querySelectorAll('.sidebar-footer a[href="/"], .sidebar-footer a[href="/give"], .sidebar-footer a[href="/giving"]').forEach((link) => {
    link.setAttribute("hx-boost", "false");
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
    if (greeting) greeting.textContent = "Welcome, Faithful Member";
    if (desktopGreeting) desktopGreeting.textContent = "Welcome, Faithful Member";
  }
  renderActiveCampaigns(null);
  renderNextFeast(null);
  updateQuickGiveLinks(null);
  updateDonorAuthState();
  const emailInput = document.getElementById("donorEmail");
  if (emailInput && donorSession().email) emailInput.value = donorSession().email;
  initDonorPasswordResetPage();
});


// ── PLEDGE TRACKER ────────────────────────────────────────────────────────
function renderPledgeTracker(donor) {
  if (!donor) return;
  const pledgeCents = Number(donor.pledgeAmountCents || 0);
  const pledgeYear  = String(new Date().getFullYear());
  const ytdCents    = (() => {
    // Read YTD from the already-rendered metric text
    const el = document.getElementById("metricYtd");
    if (!el) return 0;
    const raw = el.textContent.replace(/[^0-9.]/g, "");
    return Math.round(parseFloat(raw || "0") * 100);
  })();

  // Mobile tracker
  const mobileCard = document.getElementById("pledgeTrackerCard");
  if (mobileCard) {
    if (!pledgeCents) { mobileCard.hidden = true; return; }
    mobileCard.hidden = false;
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
    if (editLink) editLink.href = "/donor/settings#pledge";
  }

  // Desktop tracker
  const desktopCard = document.getElementById("desktopPledgeTracker");
  if (desktopCard) {
    if (!pledgeCents) { desktopCard.hidden = true; return; }
    desktopCard.hidden = false;
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
