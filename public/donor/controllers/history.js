function offeringRows(offerings) {
  if (!offerings.length) return '<div class="notice">No offerings have been recorded for this donor account yet.</div>';
  const groups = new Map();
  offerings.forEach((item) => {
    const date = new Date(item.createdAt || item.updatedAt || 0);
    const key = Number.isNaN(date.getTime()) ? "Earlier" : date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  return [...groups.entries()].map(([month, items]) => `
    <section class="giving-receipt-month">
      <header><span>${escapeHtml(month)}</span><strong>${money(items.filter(donorOfferingIsComplete).reduce((sum, item) => sum + Number(item.amountCents || 0), 0))}</strong></header>
      <div class="giving-receipt-list">${items.map((item) => {
        const status = item.paymentStatus || item.status || "recorded";
        const detail = item.coverFees
          ? `You covered ${money(item.totalFeeCents || Math.max(0, Number(item.chargeCents || 0) - Number(item.amountCents || 0)))} in processing fees`
          : `Parish received ${money(item.parishNetCents ?? item.amountCents)}`;
        return `
          <article class="giving-receipt-row">
            <span class="giving-receipt-date">${shortDate(item.createdAt || item.updatedAt)}</span>
            <span class="giving-receipt-copy">
              <strong>${escapeHtml(item.fund || item.campaign || item.title || item.giftType || "Parish offering")}</strong>
              <small>${escapeHtml(item.parishName || item.parishId || "Parish")} · ${escapeHtml(detail)}</small>
            </span>
            <span class="status-pill ${status === "pending" || status === "unpaid" ? "pending" : ""}">${escapeHtml(status)}</span>
            <span class="giving-receipt-amount"><strong>${money(item.amountCents)}</strong><small>${item.frequency && item.frequency !== "once" ? escapeHtml(item.frequency) : "one-time"}</small></span>
          </article>`;
      }).join("")}</div>
    </section>`).join("");
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

function donorOfferingIsComplete(item = {}) {
  const status = String(item.paymentStatus || item.status || "recorded").toLowerCase();
  return !["unpaid", "pending", "failed", "canceled", "cancelled", "expired"].includes(status);
}

function renderDonorGivingStory(offerings = []) {
  const now = new Date();
  const complete = offerings.filter(donorOfferingIsComplete);
  const thisYear = complete.filter((item) => {
    const date = new Date(item.createdAt || item.updatedAt || 0);
    return !Number.isNaN(date.getTime()) && date.getFullYear() === now.getFullYear();
  });
  const feeCovered = thisYear.filter(item => item.coverFees).length;
  const activeMonths = new Set(thisYear.map(item => String(item.createdAt || item.updatedAt || "").slice(0, 7)).filter(Boolean));
  const total = thisYear.reduce((sum, item) => sum + Number(item.amountCents || 0), 0);
  const monthlyAverage = activeMonths.size ? Math.round(total / activeMonths.size) : 0;
  setText("historyGiftCount", String(thisYear.length));
  setText("historyMonthlyAverage", money(monthlyAverage));
  setText("historyFeesCovered", String(feeCovered));

  const months = [];
  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    months.push({
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      label: date.toLocaleDateString("en-US", { month: "short" }),
      cents: 0
    });
  }
  const monthMap = new Map(months.map(month => [month.key, month]));
  complete.forEach((item) => {
    const key = String(item.createdAt || item.updatedAt || "").slice(0, 7);
    if (monthMap.has(key)) monthMap.get(key).cents += Number(item.amountCents || 0);
  });
  const maxMonth = Math.max(1, ...months.map(month => month.cents));
  const trend = document.getElementById("myHistoryTrend");
  if (trend) {
    trend.innerHTML = `<div class="history-story-bars">${months.map(month => `
      <div title="${escapeHtml(month.label)} · ${money(month.cents)}">
        <span><i style="height:${Math.max(month.cents ? 10 : 2, Math.round(month.cents / maxMonth * 100))}%"></i></span>
        <small>${escapeHtml(month.label)}</small>
      </div>`).join("")}</div>`;
  }

  const fundTotals = new Map();
  thisYear.forEach((item) => {
    const fund = item.fund || item.campaign || item.title || "Parish offering";
    fundTotals.set(fund, (fundTotals.get(fund) || 0) + Number(item.amountCents || 0));
  });
  const funds = [...fundTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxFund = Math.max(1, ...funds.map(([, cents]) => cents));
  const fundPane = document.getElementById("myHistoryFunds");
  if (fundPane) {
    fundPane.innerHTML = funds.length ? funds.map(([fund, cents], index) => `
      <div class="history-story-fund-row">
        <span>${index + 1}</span>
        <div><strong>${escapeHtml(fund)}</strong><i><b style="width:${Math.max(4, Math.round(cents / maxFund * 100))}%"></b></i></div>
        <em>${money(cents)}</em>
      </div>`).join("") : '<p class="form-help">Your giving destinations will appear after your first completed gift.</p>';
  }

  const rhythm = document.getElementById("myHistoryRhythm");
  if (rhythm) {
    const recurring = thisYear.filter(item => item.frequency && item.frequency !== "once").length;
    const topFund = funds[0]?.[0] || "No fund yet";
    const latest = thisYear[0];
    rhythm.innerHTML = `
      <div class="history-rhythm-grid">
        <div><span>Most-supported fund</span><strong>${escapeHtml(topFund)}</strong></div>
        <div><span>Recurring gifts</span><strong>${recurring}</strong></div>
        <div><span>Active giving months</span><strong>${activeMonths.size}</strong></div>
        <div><span>Latest completed gift</span><strong>${latest ? shortDate(latest.createdAt || latest.updatedAt) : "None yet"}</strong></div>
      </div>`;
  }
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
  const period = window.donorHistoryPeriod || "all";
  const activities = window.donorHistoryActivities || [];
  const filtered = activities.filter((item) => {
    const matchesProduct = filter === "all" || item.product === filter;
    const itemYear = new Date(item.date || 0).getFullYear();
    const matchesPeriod = period === "all" || String(itemYear) === String(period);
    return matchesProduct && matchesPeriod;
  });
  list.innerHTML = historyActivityRows(filtered);
  setText("historyTimelineCount", `${filtered.length} activit${filtered.length === 1 ? "y" : "ies"}`);
  renderProductFilterState();
}

function renderHistorySummary(activities = [], summary = {}) {
  const productCount = new Set(activities.map((item) => item.product)).size;
  setText("historyProductsCount", String(productCount));
  setText("historyLatestActivity", activities[0] ? productActivityLabel(activities[0].product) : "None");
  setText("offeringsReceiptCount", `${summary.offeringCount || (window.donorOfferings || []).length || 0} receipts`);
  const period = document.getElementById("historyPeriodFilter");
  if (period) {
    const selected = window.donorHistoryPeriod || "all";
    const years = [...new Set(activities.map(item => new Date(item.date || 0).getFullYear()).filter(year => Number.isFinite(year) && year > 2000))].sort((a, b) => b - a);
    period.innerHTML = '<option value="all">All activity</option>' + years.map(year => `<option value="${year}" ${String(year) === String(selected) ? "selected" : ""}>${year}</option>`).join("");
  }
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
  renderDonorGivingStory(offerings);
  renderRecurringHomeCard(summary);
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
  loadGivingStatements();

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

function setHistoryPeriodFilter(period = "all") {
  window.donorHistoryPeriod = period;
  renderAgapayHistoryTimeline();
}

