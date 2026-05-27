const donorStore = {
  email: "agapayDonorEmail",
  token: "agapayDonorToken",
  donor: "agapayDonorProfile"
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
    "X-AgaPay-Donor-Email": session.email,
    ...extra
  };
}

async function donorApi(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: options.headers || donorAuthHeaders()
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.detail || "AgaPay request failed");
  return data;
}

function setDonorStatus(message, tone = "info") {
  const el = document.getElementById("donorStatus");
  if (!el) return;
  el.textContent = message || "";
  el.className = message ? `notice ${tone}` : "notice";
  el.style.display = message ? "block" : "none";
}

function money(cents) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format((Number(cents) || 0) / 100);
}

function shortDate(value) {
  if (!value) return "No date";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
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
  const name = donor.householdName || donor.donorName || donor.email || "AgaPay donor";
  const profileName = document.getElementById("profileName");
  const profileMeta = document.getElementById("profileMeta");
  if (profileName) profileName.textContent = name;
  if (profileMeta) profileMeta.textContent = donor.defaultParishId ? `${donor.email} - ${donor.defaultParishId}` : donor.email || "Donor account loaded";
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
  updateDonorAuthState();
}

async function loadPublicParishes(selectId = "parish") {
  const select = document.getElementById(selectId);
  if (!select) return [];
  try {
    const data = await donorApi("/api/parishes", { headers: { Accept: "application/json" } });
    const parishes = data.parishes || [];
    if (parishes.length) {
      select.innerHTML = parishes.map((parish) => `<option value="${escapeHtml(parish.id)}">${escapeHtml(parish.name)}</option>`).join("");
      const donor = donorProfile();
      if (donor.defaultParishId) select.value = donor.defaultParishId;
    }
    return parishes;
  } catch {
    return [];
  }
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
      body: JSON.stringify({ donorName, householdName: donorName, email, password, parishId })
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
    setDonorStatus("Account created. Check your email to verify your AgaPay account.", "success");
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
    setDonorStatus("Sign up or log in to see live giving history.");
    return;
  }
  try {
    const data = await donorApi("/api/donor/dashboard");
    setDonorProfile(data.donor);
    const summary = data.summary || {};
    const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    setText("metricYtd", money(summary.ytdCents));
    setText("metricOfferings", String(summary.offeringCount || 0));
    setText("metricCommemorations", String(summary.commemorationCount || 0));
    setText("metricRecurring", String(summary.recurringCount || 0));
    setText("homeDataStatus", "Live data");
    const recent = document.getElementById("recentOfferings");
    if (recent) recent.innerHTML = offeringRows(data.recentOfferings || []);
  } catch (err) {
    setDonorStatus(err.message, "error");
  }
}

function offeringRows(offerings) {
  if (!offerings.length) return '<div class="notice">No offerings have been recorded for this donor account yet.</div>';
  return offerings.map((item) => `
    <div class="list-item">
      <div class="list-main">
        <strong>${escapeHtml(item.fund || item.campaign || item.title || item.giftType || "AgaPay offering")}</strong>
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
  try {
    setDonorStatus("Preparing checkout...");
    const data = await donorApi("/api/create-checkout-session", {
      method: "POST",
      body: JSON.stringify({
        parishId: document.getElementById("parish")?.value,
        giftType: document.getElementById("giftType")?.value,
        amount: document.getElementById("amount")?.value,
        frequency: document.getElementById("frequency")?.value || "once",
        firstName: firstName || "AgaPay",
        lastName: rest.join(" "),
        email: session.email,
        coverFees: true
      })
    });
    if (data.url) window.location.href = data.url;
    else setDonorStatus(data.message || "Checkout is not available yet.", "error");
  } catch (err) {
    setDonorStatus(err.message, "error");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const saved = donorProfile();
  document.body.removeAttribute("hx-boost");
  document.querySelectorAll(".nav").forEach((nav) => {
    nav.setAttribute("hx-boost", "false");
    nav.removeAttribute("hx-target");
  });
  document.querySelectorAll('.sidebar-footer a[href="/"], .sidebar-footer a[href="/give"]').forEach((link) => {
    link.setAttribute("hx-boost", "false");
  });
  if (saved.email) {
    setDonorProfile(saved);
  } else {
    const profileName = document.getElementById("profileName");
    const profileMeta = document.getElementById("profileMeta");
    const greeting = document.getElementById("greeting");
    if (profileName) profileName.textContent = "Donor Account";
    if (profileMeta) profileMeta.textContent = "Sign in to load live giving history";
    if (greeting) greeting.textContent = "Welcome to your donor dashboard";
  }
  updateDonorAuthState();
  const emailInput = document.getElementById("donorEmail");
  if (emailInput && donorSession().email) emailInput.value = donorSession().email;
});
