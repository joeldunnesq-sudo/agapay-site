const donorStore = {
  email: "agapayDonorEmail",
  token: "agapayDonorToken",
  donor: "agapayDonorProfile"
};

const donorMajorFeasts = [
  { name: "Theophany", gregorian: "01-06", julian: "01-19" },
  { name: "Meeting of the Lord", gregorian: "02-02", julian: "02-15" },
  { name: "Annunciation", gregorian: "03-25", julian: "04-07" },
  { name: "Transfiguration", gregorian: "08-06", julian: "08-19" },
  { name: "Dormition of the Theotokos", gregorian: "08-15", julian: "08-28" },
  { name: "Nativity of the Theotokos", gregorian: "09-08", julian: "09-21" },
  { name: "Elevation of the Cross", gregorian: "09-14", julian: "09-27" },
  { name: "Entrance of the Theotokos", gregorian: "11-21", julian: "12-04" },
  { name: "Nativity of Christ", gregorian: "12-25", julian: "01-07" }
];

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
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function monthDayDate(year, monthDay) {
  const [month, day] = String(monthDay || "01-01").split("-").map((value) => Number(value));
  return new Date(year, month - 1, day);
}

function calendarLabel(value) {
  return String(value || "julian").toLowerCase().includes("gregorian")
    ? "Revised Julian / Gregorian"
    : "Julian / Old Calendar";
}

function nextFeastForCalendar(calendar) {
  const key = String(calendar || "julian").toLowerCase().includes("gregorian") ? "gregorian" : "julian";
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const candidates = donorMajorFeasts
    .map((feast) => ({ ...feast, date: monthDayDate(start.getFullYear(), feast[key]) }))
    .map((feast) => feast.date < start ? { ...feast, date: monthDayDate(start.getFullYear() + 1, feast[key]) } : feast)
    .sort((a, b) => a.date - b.date);
  return candidates[0];
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
  document.querySelectorAll(".mobile-avatar").forEach((avatar) => {
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
  renderActiveCampaigns(null);
  renderNextFeast(null);
  updateQuickGiveLinks(null);
  updateDonorAuthState();
}

async function loadPublicParishes(selectId = "parish") {
  const select = document.getElementById(selectId);
  if (!select) return [];
  try {
    const data = await donorApi("/api/parishes", { headers: { Accept: "application/json" } });
    const parishes = data.parishes || [];
    window.agapayPublicParishes = parishes;
    if (parishes.length) {
      const donor = donorProfile();
      renderParishOptions(select, parishes, donor.defaultParishId || select.value);
    }
    return parishes;
  } catch {
    return [];
  }
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
    context: "After checkout, use the Commemorations page to submit living or departed names to the parish queue."
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
    profile: '<svg viewBox="0 0 28 28" aria-hidden="true"><path d="M14 24.5C14 24.5 5 18 5 11.5C5 8.5 7.5 6 10.5 6C12.5 6 13.5 7 14 8C14.5 7 15.5 6 17.5 6C20.5 6 23 8.5 23 11.5C23 18 14 24.5 14 24.5Z"/></svg>'
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
    <a class="campaign-card ${campaign.feastId ? "campaign-gold" : "campaign-green"}" href="${escapeHtml(link)}">
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

function applyDonorGiveParams() {
  const params = new URLSearchParams(window.location.search);
  const parish = params.get("parish");
  const giftType = normalizeDonorGiftType(params.get("giftType"));
  const isQuick = params.get("quick") === "1";
  const parishSelect = document.getElementById("parish");
  const giftTypeSelect = document.getElementById("giftType");
  if (parish && parishSelect) parishSelect.value = parish;
  if (giftType && giftTypeSelect) giftTypeSelect.value = giftType;
  toggleCandleIntentionFields();
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
  const giftType = normalizeDonorGiftType(document.getElementById("giftType")?.value);
  const fields = document.getElementById("candleIntentionFields");
  if (!fields) return;
  fields.hidden = giftType !== "candles";
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
    window.location.href = "/donor";
  } catch (err) {
    clearDonorSession();
    setDonorStatus(err.message, "error");
  }
}

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

async function loadDonorDashboardPage() {
  const session = donorSession();
  if (!session.email || !session.token) {
    showGuestDonorDashboard();
    return;
  }
  try {
    const data = await donorApi("/api/donor/dashboard");
    setDonorProfile(data.donor);
    const summary = data.summary || {};
    const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    setText("metricMonth", money(summary.monthCents));
    setText("metricYtd", money(summary.ytdCents));
    setText("metricOfferings", String(summary.offeringCount || 0));
    setText("metricCommemorations", String(summary.commemorationCount || 0));
    setText("metricRecurring", String(summary.recurringCount || 0));
    setText("donorParishName", data.parish?.name || "Choose a church in Settings");
    setText("desktopMetricMonth", money(summary.monthCents));
    setText("desktopMetricYtd", money(summary.ytdCents));
    setText("desktopMetricOfferings", String(summary.offeringCount || 0));
    setText("desktopMetricCommemorations", String(summary.commemorationCount || 0));
    setText("desktopParishName", data.parish?.name || "Choose a church in Settings to personalize your dashboard.");
    updateQuickGiveLinks(data.parish);
    renderActiveCampaigns(data.parish);
    renderNextFeast(data.parish);
    const recent = document.getElementById("recentOfferings");
    if (recent) recent.innerHTML = offeringRows(data.recentOfferings || []);
    const desktopRecent = document.getElementById("desktopRecentOfferings");
    if (desktopRecent) desktopRecent.innerHTML = offeringRows(data.recentOfferings || []);
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
        <span class="status-pill ${item.paymentStatus === "pending" ? "pending" : ""}">${escapeHtml(item.paymentStatus || item.status || "recorded")}</span>
      </div>
      <div class="list-amount">${money(item.amountCents)}</div>
    </div>
  `).join("");
}

async function loadDonorOfferingsPage() {
  try {
    const data = await donorApi("/api/donor/offerings");
    window.donorOfferings = data.offerings || [];
    const summary = data.summary || {};
    const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    setText("offeringsYtd", money(summary.ytdCents));
    setText("offeringsRecurring", String(summary.recurringCount || 0));
    setText("offeringsReceiptCount", String(summary.offeringCount || 0));
    setText("offeringsStatus", "Live data");
    renderDonorOfferings();
  } catch (err) {
    const list = document.getElementById("offeringList");
    if (list) list.innerHTML = `<div class="notice">${escapeHtml(err.message)} Sign in from the donor home page first.</div>`;
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

function filterOfferings(type) {
  const el = document.getElementById("typeFilter");
  if (el) el.value = type;
  renderDonorOfferings();
}

function searchOfferings() {
  renderDonorOfferings();
}

function commemorationRows(entries) {
  if (!entries.length) return '<div class="notice">No commemoration submissions have been recorded yet.</div>';
  return entries.map((item) => {
    const living = (item.living || []).join(", ") || "None";
    const departed = (item.departed || []).join(", ") || "None";
    return `<div class="list-item"><div class="list-main"><strong>${escapeHtml(item.giftType || "Commemoration")}</strong><span>${escapeHtml(item.parishId || "Parish")} - ${shortDate(item.createdAt)}</span><span>Living: ${escapeHtml(living)}</span><span>Departed: ${escapeHtml(departed)}</span><span class="status-pill pending">queued for Saturday</span></div></div>`;
  }).join("");
}

async function loadDonorCommemorationsPage() {
  await loadPublicParishes("parish");
  try {
    const data = await donorApi("/api/donor/commemorations");
    const list = document.getElementById("commemorationList");
    if (list) list.innerHTML = commemorationRows(data.entries || []);
  } catch (err) {
    const list = document.getElementById("commemorationList");
    if (list) list.innerHTML = `<div class="notice">${escapeHtml(err.message)} Sign in from the donor home page first.</div>`;
  }
}

function linesFromField(id) {
  return (document.getElementById(id)?.value || "").split(/\n+/).map((value) => value.trim()).filter(Boolean);
}

async function submitCommemoration(event) {
  event.preventDefault();
  const living = linesFromField("living");
  const departed = linesFromField("departed");
  if (!living.length && !departed.length) {
    setDonorStatus("Add at least one living or departed name.", "error");
    return;
  }
  try {
    await donorApi("/api/donor/commemorations", {
      method: "POST",
      body: JSON.stringify({
        parishId: document.getElementById("parish")?.value,
        giftType: document.getElementById("offering")?.value || "commemoration",
        namesLiving: living.join("\n"),
        namesDeparted: departed.join("\n"),
        note: document.getElementById("note")?.value || ""
      })
    });
    event.target.reset();
    setDonorStatus("Names added to the parish commemoration queue.", "success");
    await loadDonorCommemorationsPage();
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
  const includeCandleIntentions = normalizeDonorGiftType(giftType) === "candles";
  try {
    setDonorStatus("Preparing checkout...");
    const data = await donorApi("/api/create-checkout-session", {
      method: "POST",
      body: JSON.stringify({
        parishId: document.getElementById("parish")?.value,
        giftType,
        amount: document.getElementById("amount")?.value,
        frequency: document.getElementById("frequency")?.value || "once",
        firstName: firstName || "AGAPAY",
        lastName: rest.join(" "),
        email: session.email,
        namesLiving: includeCandleIntentions ? document.getElementById("candleLivingNames")?.value || "" : "",
        namesDeparted: includeCandleIntentions ? document.getElementById("candleDepartedNames")?.value || "" : "",
        inMemoriam: includeCandleIntentions ? document.getElementById("candleIntentionNote")?.value || "" : "",
        coverFees: true,
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
});
