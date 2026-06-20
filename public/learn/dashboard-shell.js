import {
  toBooksViewModel,
  toCoOpViewModel,
  toCommunityViewModel,
  toDashboardViewModel,
  toFormationViewModel,
  toPlannerViewModel,
  toPrintCenterViewModel,
  toReportsViewModel,
  toSetupViewModel
} from "./dashboard-view-models.js";

const pageKey = document.body.dataset.learnPage || "dashboard";
const root = document.getElementById("learnRoot");

function html(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function cssVars() {
  return [
    "--ink:#1b2c45",
    "--navy:#102a4c",
    "--navy2:#0a1c38",
    "--cream:#f3ead4",
    "--paper:#fdf9ef",
    "--paper2:#f8f0dd",
    "--line:#e7dcc0",
    "--gold:#b5942f",
    "--gold2:#c9a227",
    "--goldsoft:#dac88f",
    "--muted:#8a7c5e",
    "--burgundy:#6e2f2a",
    "--olive:#4a5a31",
    "--slate:#34507a"
  ].join(";");
}

function check(complete) {
  return `<span style="width:23px;height:23px;flex:none;border-radius:50%;border:1.4px solid ${complete ? "var(--navy)" : "var(--gold)"};background:${complete ? "var(--navy)" : "transparent"};color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;">${complete ? "✓" : ""}</span>`;
}

function panel(title, content, options = {}) {
  const icon = options.icon || "✥";
  const style = options.style || "";
  const headingStyle = options.largeTitle
    ? "font-family:'Cormorant Garamond',serif;font-size:28px;line-height:1.05;color:var(--ink);letter-spacing:0;text-transform:none;font-weight:700;"
    : "color:var(--gold);font-size:12px;letter-spacing:.15em;font-weight:600;";
  return `
    <section style="background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:18px;box-shadow:0 1px 3px rgba(20,40,70,.04);${style}">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--line);">
        <div style="display:flex;align-items:center;gap:9px;${headingStyle}"><span style="font-size:${options.largeTitle ? "21px" : "17px"};color:var(--gold);">${icon}</span>${html(title)}</div>
        ${options.action ? `<div style="font-size:13px;color:var(--muted);">${options.action}</div>` : ""}
      </div>
      ${content}
    </section>
  `;
}

function bar(value, color = "var(--gold)") {
  return `<span style="display:block;height:6px;border-radius:99px;background:#e9dfc7;overflow:hidden;"><span style="display:block;height:100%;width:${Number(value) || 0}%;background:${color};border-radius:99px;"></span></span>`;
}

function emptyState(label) {
  return `<div style="padding:18px;border:1px dashed var(--line);border-radius:10px;color:var(--muted);font-style:italic;background:rgba(255,255,255,.22);">${html(label)}</div>`;
}

function softColor(color, alpha = "22") {
  const value = String(color || "#b5942f").trim();
  return value.startsWith("#") && value.length === 7 ? `${value}${alpha}` : "var(--paper2)";
}

function pageIntroIcon(id) {
  const icons = {
    dashboard: '<path d="M4 12.5 12 5l8 7.5V21H4z"/><path d="M9 21v-6h6v6"/><path d="M12 5V2"/><path d="M10 4h4"/>',
    planner: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/><path d="M8 14h3M13 14h3M8 17h3"/>',
    formation: '<path d="M10 9h4M12 6v7"/><path d="M4 22V11l8-5 8 5v11"/><path d="M8 22v-4a4 4 0 0 1 8 0v4"/><path d="M12 2v3"/>',
    books: '<path d="M12 7v14"/><path d="M4 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 3 1.35A4 4 0 0 1 15 3h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-5a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
    reports: '<path d="M4 21V3h12l4 4v14z"/><path d="M16 3v5h5"/><path d="M8 16v-3M12 16V9M16 16v-5"/>',
    "print-center": '<path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/>',
    community: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="3.4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.3a4 4 0 0 1 0 7.4"/>',
    "co-op": '<path d="M4 20V9l8-5 8 5v11"/><path d="M8 20v-5h8v5"/><path d="M7 12h2M15 12h2"/><path d="M12 4V2"/>',
    onboarding: '<path d="M12.2 2h-.4a2 2 0 0 0-2 2 1.7 1.7 0 0 1-2.6 1.5 2 2 0 0 0-2.7.7l-.2.4a2 2 0 0 0 .7 2.7A1.7 1.7 0 0 1 5 12a1.7 1.7 0 0 1-1 1.6 2 2 0 0 0-.7 2.7l.2.4a2 2 0 0 0 2.7.7A1.7 1.7 0 0 1 9 18.9a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2 1.7 1.7 0 0 1 2.6-1.5 2 2 0 0 0 2.7-.7l.2-.4a2 2 0 0 0-.7-2.7A1.7 1.7 0 0 1 19 12a1.7 1.7 0 0 1 1-1.6 2 2 0 0 0 .7-2.7l-.2-.4a2 2 0 0 0-2.7-.7A1.7 1.7 0 0 1 14.2 4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>'
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.8c.25 2.3.72 2.78 3 3-2.28.25-2.75.72-3 3-.25-2.28-.72-2.75-3-3 2.28-.22 2.75-.7 3-3z" fill="currentColor" stroke="none"/><g fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round">${icons[id] || icons.dashboard}</g></svg>`;
}

function pageIntroMeta(id) {
  const meta = {
    dashboard: {
      kicker: "AGAPAY LEARN",
      description: "A peaceful command center for today’s Church rhythm, household learning, term progress, and gentle adjustments.",
      quote: "Of all holy works, the education of children is the most holy.",
      ref: "St. Theophan the Recluse"
    },
    planner: {
      kicker: "HOUSEHOLD PLANNING",
      description: "Plan the week by household rhythm and Form, so large families stay organized without repeating the same work everywhere.",
      quote: "The soul of a child is like soft wax. If you impress right principles upon it while it is tender, no one will be able to efface them.",
      ref: "St. John Chrysostom"
    },
    formation: {
      kicker: "ORTHODOX FORMATION",
      description: "Keep readings, prayers, catechesis, hymns, saints, feasts, and beauty tied to the living rhythm of the Church.",
      quote: "We must not only teach our children to read and write, but we must also teach them to know God.",
      ref: "St. Kosmas Aitolos"
    },
    books: {
      kicker: "LIVING BOOKS",
      description: "Track read-alouds, library choices, copywork sources, and Orthodox living-book suggestions for the whole household.",
      quote: "A word of advice is a seed. If the soil is good, it will bring forth fruit.",
      ref: "Elder Thaddeus of Vitovnica"
    },
    reports: {
      kicker: "RECORDS & PROGRESS",
      description: "Turn lessons, narrations, attendance, and books into calm records when you need to review or export progress.",
      quote: "If good foundations are laid early, children will grow up to be great.",
      ref: "St. John Chrysostom"
    },
    "print-center": {
      kicker: "PRINT CENTER",
      description: "Generate simple household plans and printable resources with clear Free and Family-plan access.",
      quote: "With us everything should be secondary compared to our concern with children, and their upbringing in the instruction and teaching of the Lord.",
      ref: "St. John Chrysostom"
    },
    community: {
      kicker: "COMING SOON",
      description: "A curated Orthodox homeschool resource exchange will come after the core planner is settled.",
      quote: "As each has received a gift, use it to serve one another.",
      ref: "1 Peter 4:10"
    },
    "co-op": {
      kicker: "CO-OP",
      description: "Future shared planning for Orthodox homeschool groups, classes, meetings, and records.",
      quote: "Where two or three are gathered together in My name, there am I.",
      ref: "Matthew 18:20"
    },
    onboarding: {
      kicker: "SETUP",
      description: "Shape the household profile, children, Forms, books, term dates, subjects, and Church rhythm that power Learn.",
      quote: "Prepare your work outside; get everything ready.",
      ref: "Proverbs 24:27"
    }
  };
  return meta[id] || meta.dashboard;
}

function pageIntro(vm) {
  const meta = pageIntroMeta(vm.page.id);
  const subtitle = vm.page.subtitle ? vm.page.subtitle : meta.description;
  return `
    <section class="learn-page-intro" aria-labelledby="learn-page-heading">
      <div class="learn-page-intro-heading">
        <span class="learn-page-intro-icon">${pageIntroIcon(vm.page.id)}</span>
        <div>
          <div class="learn-page-intro-kicker">${html(meta.kicker)}</div>
          <h1 id="learn-page-heading">${html(vm.page.title)}</h1>
        </div>
      </div>
      <p class="learn-page-intro-description">${html(subtitle)}</p>
      <div class="learn-page-intro-quote">
        <span aria-hidden="true">“</span>
        <p>${html(meta.quote)} <strong>${html(meta.ref)}</strong></p>
      </div>
    </section>
  `;
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function isLearnFamilyPlan() {
  return localStorage.getItem("agapay.learn.plan") === "family";
}

function printCount() {
  return Number(localStorage.getItem("agapay.learn.printCount") || 0);
}

function setPrintCount(value) {
  localStorage.setItem("agapay.learn.printCount", String(Math.max(0, value)));
}

function learnAccountEmail() {
  try {
    const donor = JSON.parse(localStorage.getItem("agapayDonorProfile") || "{}");
    return localStorage.getItem("agapayDonorEmail") || donor.email || "";
  } catch {
    return localStorage.getItem("agapayDonorEmail") || "";
  }
}

function learnRequestHeaders(extra = {}) {
  const headers = { Accept: "application/json", ...extra };
  const token = localStorage.getItem("agapayDonorToken") || "";
  const email = learnAccountEmail();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (email) headers["X-AGAPAY-Donor-Email"] = email;
  return headers;
}

let learnCheckoutOpening = false;

async function openLearnCheckout() {
  if (learnCheckoutOpening) return;
  learnCheckoutOpening = true;
  document.querySelectorAll("[data-dialog-checkout], [data-print-upgrade]").forEach((button) => {
    button.disabled = true;
    button.dataset.previousText = button.textContent || "";
    button.textContent = "Opening Stripe...";
  });
  try {
    const payload = await apiPost("/api/learn/billing/checkout", { plan: "family" });
    if (payload.url) {
      window.location.href = payload.url;
      return;
    }
    throw new Error("Stripe checkout did not return a checkout URL.");
  } catch (error) {
    learnCheckoutOpening = false;
    document.querySelectorAll("[data-dialog-checkout], [data-print-upgrade]").forEach((button) => {
      button.disabled = false;
      button.textContent = button.dataset.previousText || "Upgrade";
    });
    showLearnDialog("Checkout Setup Needed", error.message || "Stripe checkout is not configured yet.", [
      { label: "Stripe route", value: "/api/learn/billing/checkout" }
    ], { upgrade: false });
  }
}

function showLearnDialog(title, message, rows = [], options = {}) {
  const existing = document.querySelector("[data-learn-dialog]");
  if (existing) existing.remove();
  const dialog = document.createElement("div");
  dialog.dataset.learnDialog = "true";
  dialog.style.cssText = "position:fixed;inset:0;z-index:80;background:rgba(10,20,40,.54);display:flex;align-items:center;justify-content:center;padding:clamp(10px,3vw,24px);";
  const contentHtml = options.contentHtml || "";
  const width = options.width || "520px";
  const upgradeButton = options.upgrade
    ? `<button type="button" data-dialog-checkout style="border:1px solid #b5942f;background:#14294a;color:#f3ead4;border-radius:9px;padding:10px 16px;font-family:inherit;">Upgrade</button>`
    : "";
  dialog.innerHTML = `<div style="width:min(${width},100%);max-height:min(760px,92vh);overflow:auto;background:#f3ead4;border:1px solid #b5942f;border-radius:16px;box-shadow:0 20px 60px rgba(10,20,40,.35);padding:clamp(16px,4vw,24px);color:#14294a;"><div style="display:flex;justify-content:space-between;gap:12px;align-items:start;position:sticky;top:-24px;background:#f3ead4;padding-top:2px;padding-bottom:12px;z-index:2;"><div><h2 style="font-family:'Cormorant Garamond',serif;font-size:clamp(25px,7vw,31px);line-height:1.02;margin:0;color:#14294a;">${html(title)}</h2><p style="color:#33405a;line-height:1.45;margin:8px 0 0;">${html(message)}</p></div><button type="button" data-dialog-close aria-label="Close dialog" style="border:1px solid rgba(20,41,74,.18);background:#fffaf0;color:#14294a;border-radius:999px;width:44px;height:44px;display:grid;place-items:center;font-size:24px;line-height:1;cursor:pointer;flex:none;">×</button></div>${contentHtml}${rows.map((row) => `<div style="border-top:1px solid rgba(181,148,47,.28);padding:9px 0;"><small style="color:#9b7420;letter-spacing:.12em;text-transform:uppercase;">${html(row.label)}</small><strong style="display:block;">${html(row.value)}</strong></div>`).join("")}<div style="position:sticky;bottom:-24px;background:#f3ead4;display:flex;justify-content:flex-end;gap:10px;margin-top:16px;padding-top:12px;padding-bottom:2px;"><button type="button" data-dialog-close style="border:1px solid rgba(20,41,74,.22);background:#fffaf0;border-radius:10px;padding:12px 18px;min-height:44px;font-family:inherit;color:#14294a;font-weight:700;">Close</button>${upgradeButton}</div></div>`;
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog || event.target.closest("[data-dialog-close]")) dialog.remove();
    if (event.target.closest("[data-dialog-checkout]")) openLearnCheckout();
  });
  document.body.append(dialog);
}

function saintStoryDialogHtml(saints = [], unavailableMessage = "") {
  if (unavailableMessage) {
    return `<div style="border-top:1px solid rgba(181,148,47,.28);padding:14px 0;color:#33405a;line-height:1.5;">${html(unavailableMessage)}</div>`;
  }
  if (!saints.length) {
    return `<div style="border-top:1px solid rgba(181,148,47,.28);padding:14px 0;color:#33405a;line-height:1.5;">No saint life is listed for this day yet. Please try again later.</div>`;
  }
  return saints.map((saint) => {
    const paragraphs = String(saint.storyText || "").split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
    return `<article style="border-top:1px solid rgba(181,148,47,.28);padding:16px 0;display:grid;gap:8px;">
      <div style="display:flex;gap:12px;align-items:flex-start;">
        ${saint.iconUrl ? `<img src="${html(saint.iconUrl)}" alt="" style="width:64px;height:64px;border-radius:12px;object-fit:cover;border:1px solid rgba(181,148,47,.34);">` : `<span style="width:48px;height:48px;border-radius:50%;background:#14294a;color:#f3ead4;display:grid;place-items:center;flex:none;font-size:23px;">✥</span>`}
        <span><strong style="display:block;font-family:'Cormorant Garamond',serif;font-size:24px;line-height:1.05;color:#14294a;">${html(saint.name || saint.title || "Saint of the Day")}</strong>${saint.reposeCentury ? `<small style="display:block;margin-top:4px;color:#9b7420;font-weight:800;">${html(saint.reposeCentury)}</small>` : ""}${saint.feastRank ? `<small style="display:block;margin-top:4px;color:#9b7420;letter-spacing:.08em;text-transform:uppercase;">${html(saint.feastRank)}</small>` : ""}</span>
      </div>
      ${paragraphs.length ? paragraphs.map((paragraph) => `<p style="margin:0;color:#33405a;line-height:1.58;">${html(paragraph)}</p>`).join("") : `<p style="margin:0;color:#33405a;line-height:1.58;">A life-story text is not listed for this commemoration.</p>`}
    </article>`;
  }).join("");
}

function saintMatchKey(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/\([^)]*\b[1-2]?[0-9]{2,3}\b[^)]*\)/g, "")
    .replace(/\b(st|saint|ven|venerable|holy|apostle|holy apostle|our holy)\.?\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function orderSaintsForCard(saints = [], cardTitle = "") {
  const titleKey = saintMatchKey(cardTitle);
  if (!titleKey || !Array.isArray(saints) || saints.length < 2) return saints;
  const matchedIndex = saints.findIndex((saint) => {
    const nameKey = saintMatchKey(saint?.name || saint?.title || "");
    return nameKey && (nameKey === titleKey || nameKey.includes(titleKey) || titleKey.includes(nameKey));
  });
  if (matchedIndex <= 0) return saints;
  return [saints[matchedIndex], ...saints.slice(0, matchedIndex), ...saints.slice(matchedIndex + 1)];
}

function saintCardTitle(today = {}) {
  const firstStoryTitle = today.saintStories?.[0]?.name || today.saintStories?.[0]?.title || "";
  if (firstStoryTitle) return firstStoryTitle;
  if (today.saintNames?.[0]) return today.saintNames[0];
  const title = String(today.title || "").trim();
  return title || "Lives of the Saints";
}

function sidebar(vm) {
  const active = vm.page.id;
  return `
    <aside class="learn-product-sidebar" data-learn-sidebar>
      <div class="learn-product-sidebar-scroll">
        <a class="learn-product-back" href="/myagapay" aria-label="Back to My AGAPAY">
          <span aria-hidden="true">←</span>
          <strong>My AGAPAY</strong>
        </a>
        <div class="learn-product-profile">
          <strong>${html(vm.shell.familyName || "Faithful Household")}</strong>
          <span>${html(vm.shell.familyMeta || "AGAPAY Learn")}</span>
        </div>
        <div class="learn-product-label">AGAPAY Learn</div>
        <nav class="learn-product-nav" aria-label="AGAPAY Learn">
        ${vm.shell.nav.map((item) => `
          <a class="${item.id === active ? "is-active" : ""}" href="${item.href}" ${item.id === active ? 'aria-current="page"' : ""}>
            <span class="learn-product-nav-icon">${item.icon}</span>
            <span>${html(item.label)}</span>
          </a>
        `).join("")}
        </nav>
      </div>
    </aside>
  `;
}

function globalProductNav(activeProduct = "learn") {
  return `
    <nav class="learn-product-tabbar" aria-label="My AGAPAY navigation">
      <a class="${activeProduct === "home" ? "is-active" : ""}" href="/myagapay">
        <svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></svg>
        <span>My AGAPAY</span>
      </a>
      <a class="${activeProduct === "giving" ? "is-active" : ""}" href="/myagapay/giving">
        <svg viewBox="0 0 24 24"><path d="M7 13V7.5a1.5 1.5 0 0 1 3 0V13"/><path d="M10 13V5.5a1.5 1.5 0 0 1 3 0V13"/><path d="M13 13V6.5a1.5 1.5 0 0 1 3 0V14"/><path d="M16 14V10a1.5 1.5 0 0 1 3 0v5c0 4-2.6 6-6.3 6H12a7 7 0 0 1-7-7v-1.5a1.5 1.5 0 0 1 2 0V13"/></svg>
        <span>Giving</span>
      </a>
      <a class="${activeProduct === "learn" ? "is-active" : ""}" href="/myagapay/learn">
        <svg viewBox="0 0 24 24"><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H20v17H7.5A3.5 3.5 0 0 0 4 22z"/><path d="M4 5.5V22"/><path d="M8 6h8"/><path d="M8 10h7"/></svg>
        <span>Learn</span>
      </a>
      <a href="/marketplace">
        <svg viewBox="0 0 24 24"><path d="M6 8h12l-1 13H7z"/><path d="M9 8a3 3 0 0 1 6 0"/><path d="M9 13h6"/></svg>
        <span>Market</span>
      </a>
      <a href="/myagapay/account">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M5 21a7 7 0 0 1 14 0"/></svg>
        <span>Account</span>
      </a>
    </nav>
  `;
}

function topbar(vm) {
  const title = vm.page.ornament ? `<span style="color:#c9a227;font-size:22px;margin:0 14px;">❦</span>${html(vm.page.title)}<span style="color:#c9a227;font-size:22px;margin:0 14px;">❦</span>` : html(vm.page.title);
  return `
    <header class="learn-product-topbar">
      <button class="learn-menu-button" type="button" data-learn-menu-toggle aria-label="Open Learn navigation" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
      <a class="learn-mobile-brand learn-utility-brand" href="/myagapay" aria-label="Open My AGAPAY">
        <img src="/mark.png" alt="" />
        <span><strong>AGAPAY</strong><small>Love how you Give + Learn + Live</small></span>
      </a>
      <div class="learn-page-title-utility" style="flex:1;min-width:0;line-height:1.1;">
        <div style="font-family:'Cormorant Garamond',serif;font-size:38px;font-weight:600;color:var(--ink);display:flex;align-items:center;">${title}</div>
        ${vm.page.subtitle ? `<div style="font-size:14.5px;color:var(--muted);margin-top:2px;">${html(vm.page.subtitle)}</div>` : ""}
      </div>
      <div class="learn-utility-actions" style="display:flex;align-items:center;gap:18px;flex:none;">
        <div style="display:flex;align-items:center;gap:7px;color:var(--gold);font-size:15px;"><span style="font-size:18px;">☼</span><span style="color:var(--ink);letter-spacing:.02em;">${html(vm.shell.timeLabel)}</span></div>
        <span style="color:var(--goldsoft);font-size:18px;">✥</span>
        <a class="learn-quick-action" href="/myagapay/learn/setup">Quick Action</a>
        <a class="learn-account-utility" href="/myagapay/learn/setup">
          <span class="learn-account-utility-avatar">${html(vm.shell.accountInitials || "FM")}</span>
          <span style="text-align:left;line-height:1.2;">
            <span style="display:block;font-weight:600;color:var(--ink);font-size:15.5px;">${html(vm.shell.accountName || "Faithful Member")}</span>
            <span style="display:block;color:var(--muted);font-size:12.5px;">View Account</span>
          </span>
          <span style="font-size:16px;color:var(--muted);">⌄</span>
        </a>
      </div>
    </header>
  `;
}

function shell(vm, body) {
  return `
    <div class="learn-product-shell" style="${cssVars()};">
      ${sidebar(vm)}
      <div class="learn-sidebar-scrim" data-learn-sidebar-scrim></div>
      <main class="learn-product-main scroll">
        ${topbar(vm)}
        <div class="learn-product-content">${pageIntro(vm)}${body}</div>
        ${globalProductNav("learn")}
      </main>
    </div>
  `;
}

function renderGraceModePanel(vm) {
  const currentMode = vm.graceMode?.active ? vm.graceMode.mode || "light" : "full";
  const modes = [
    {
      id: "full",
      title: "Full Rhythm",
      subtitle: "Keep the complete plan for an ordinary, steady week.",
      detail: "Nothing is reduced. Best for settled weeks when the household has normal capacity."
    },
    {
      id: "light",
      title: "Light Day",
      subtitle: "Keep the essentials and soften the rest.",
      detail: "Protects prayer, readings, catechesis, and a gentle household stream while reducing lower-priority lessons."
    },
    {
      id: "minimum viable",
      title: "Minimum Viable",
      subtitle: "A faithful tiny plan for hard days.",
      detail: "Keeps the smallest meaningful rhythm: prayer, one shared learning touchpoint, and the next right thing."
    },
    {
      id: "feast only",
      title: "Feast Only",
      subtitle: "Let the Church year carry the day.",
      detail: "Centers the feast, readings, prayers, and family worship when schoolwork should yield to holy time."
    }
  ];
  return `
    <section data-grace-mode-panel style="background:linear-gradient(135deg,#fffaf0 0%,#f7edd6 100%);border:1px solid rgba(181,148,47,.34);border-radius:16px;padding:18px 20px;box-shadow:0 1px 3px rgba(20,40,70,.05);">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:14px;flex-wrap:wrap;">
        <div>
          <div style="color:var(--gold);font-size:12px;letter-spacing:.18em;font-weight:700;text-transform:uppercase;">Grace Mode</div>
          <h2 style="font-family:'Cormorant Garamond',serif;font-size:30px;line-height:1.05;margin:4px 0 4px;color:var(--ink);">Choose today's household rhythm.</h2>
          <p style="margin:0;color:#4c5870;line-height:1.45;max-width:720px;">Adjust the day without abandoning the plan. AGAPAY keeps what matters most and gently moves the rest into reserve.</p>
        </div>
        <span data-grace-mode-status style="color:var(--muted);font-size:13px;min-height:20px;"></span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,minmax(160px,1fr));gap:10px;">
        ${modes.map((mode) => {
          const active = mode.id === currentMode;
          return `<button type="button" data-grace-mode="${html(mode.id)}" aria-pressed="${active ? "true" : "false"}" style="text-align:left;border:1px solid ${active ? "var(--gold)" : "var(--line)"};border-radius:13px;background:${active ? "var(--navy)" : "rgba(255,255,255,.58)"};color:${active ? "#fffaf0" : "var(--ink)"};padding:13px;cursor:pointer;font-family:inherit;min-height:146px;box-shadow:${active ? "0 10px 24px rgba(6,21,34,.16)" : "none"};">
            <span style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
              <strong style="font-family:'Cormorant Garamond',serif;font-size:22px;line-height:1;">${html(mode.title)}</strong>
              <span style="width:22px;height:22px;border-radius:50%;border:1px solid ${active ? "rgba(255,250,240,.65)" : "var(--gold)"};display:grid;place-items:center;color:${active ? "var(--gold2)" : "var(--gold)"};">${active ? "✓" : ""}</span>
            </span>
            <span style="display:block;font-weight:700;font-size:13px;line-height:1.3;margin-bottom:7px;color:${active ? "#f5df9d" : "var(--gold)"};">${html(mode.subtitle)}</span>
            <span style="display:block;font-size:13px;line-height:1.38;color:${active ? "rgba(255,250,240,.84)" : "#4c5870"};">${html(mode.detail)}</span>
          </button>`;
        }).join("")}
      </div>
    </section>
  `;
}

function renderTermProgressPanel(vm) {
  const term = vm.termProgress || {};
  const progress = Number(term.percent || 0);
  return `
    <section style="background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:18px 20px;display:grid;grid-template-columns:minmax(220px,.8fr) 1fr;gap:18px;align-items:center;box-shadow:0 1px 3px rgba(20,40,70,.04);">
      <div>
        <div style="color:var(--gold);font-size:12px;letter-spacing:.18em;font-weight:700;text-transform:uppercase;">Current Term</div>
        <h2 style="font-family:'Cormorant Garamond',serif;font-size:28px;line-height:1.05;margin:5px 0 4px;color:var(--ink);">${html(term.label || "Current Term")}</h2>
        <p style="margin:0;color:var(--muted);line-height:1.4;">${term.currentWeek && term.totalWeeks ? `Week ${html(term.currentWeek)} of ${html(term.totalWeeks)}` : "Set term dates in Setup"}${term.dateRange ? ` · ${html(term.dateRange)}` : ""}</p>
      </div>
      <div>
        <div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:8px;color:#33405a;font-size:13px;"><span>Term progress</span><strong>${html(progress)}%</strong></div>
        ${bar(progress, "var(--gold)")}
      </div>
    </section>
  `;
}

function renderTodayLearnContext(vm) {
  const term = vm.termProgress || {};
  const progress = Number(term.percent || 0);
  const currentMode = vm.graceMode?.active ? vm.graceMode.mode || "light" : "full";
  const modes = [
    { id: "full", title: "Full", detail: "Keep the complete plan for a steady week." },
    { id: "light", title: "Light", detail: "Keep essentials and soften lower-priority work." },
    { id: "minimum viable", title: "Minimum", detail: "Prayer, one shared touchpoint, and the next right thing." },
    { id: "feast only", title: "Feast", detail: "Let the Church year carry the day." }
  ];
  return `
    <div style="display:grid;grid-template-columns:repeat(2,minmax(220px,1fr));gap:12px;margin-top:18px;width:100%;">
      <section style="border:1px solid var(--line);border-radius:14px;background:rgba(255,252,245,.72);padding:14px;">
        <div style="color:var(--gold);font-size:11px;letter-spacing:.16em;font-weight:800;text-transform:uppercase;">Current Term</div>
        <h3 style="font-family:'Cormorant Garamond',serif;font-size:25px;line-height:1.05;margin:5px 0 4px;color:var(--ink);">${html(term.label || "Current Term")}</h3>
        <p style="margin:0 0 10px;color:var(--muted);line-height:1.35;">${term.currentWeek && term.totalWeeks ? `Week ${html(term.currentWeek)} of ${html(term.totalWeeks)}` : "Set term dates in Setup"}${term.dateRange ? ` · ${html(term.dateRange)}` : ""}</p>
        <div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:7px;color:#33405a;font-size:13px;"><span>Term progress</span><strong>${html(progress)}%</strong></div>
        ${bar(progress, "var(--gold)")}
      </section>
      <section style="border:1px solid rgba(181,148,47,.34);border-radius:14px;background:linear-gradient(135deg,#fffaf0 0%,#f7edd6 100%);padding:14px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px;">
          <span><span style="display:block;color:var(--gold);font-size:11px;letter-spacing:.16em;font-weight:800;text-transform:uppercase;">Grace Mode</span><strong style="font-family:'Cormorant Garamond',serif;font-size:25px;">Today’s rhythm</strong></span>
          <span data-grace-mode-status style="color:var(--muted);font-size:12px;min-height:18px;"></span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(2,minmax(110px,1fr));gap:8px;">
          ${modes.map((mode) => {
            const active = mode.id === currentMode;
            return `<button type="button" data-grace-mode="${html(mode.id)}" aria-pressed="${active ? "true" : "false"}" title="${html(mode.detail)}" style="border:1px solid ${active ? "var(--gold)" : "var(--line)"};border-radius:11px;background:${active ? "var(--navy)" : "rgba(255,255,255,.62)"};color:${active ? "#fffaf0" : "var(--ink)"};padding:10px;text-align:left;cursor:pointer;font-family:inherit;min-height:84px;"><strong style="display:block;font-family:'Cormorant Garamond',serif;font-size:20px;line-height:1;">${html(mode.title)}</strong><small style="display:block;margin-top:5px;line-height:1.25;color:${active ? "rgba(255,250,240,.82)" : "var(--muted)"};">${html(mode.detail)}</small></button>`;
          }).join("")}
        </div>
      </section>
    </div>
  `;
}

function renderDashboard(vm) {
  const today = vm.todayInChurch;
  const todayArtworkUrl = today.iconUrl || "/images/learn/today-in-the-church.jpg";
  const displayedSaintTitle = saintCardTitle(today);
  const churchIconPanel = `<div class="learn-today-art-panel"><img src="${html(todayArtworkUrl)}" alt="Illustrated Orthodox homeschool planner open to today" loading="lazy"></div>`;
  const saintPreview = displayedSaintTitle && displayedSaintTitle !== "Lives of the Saints"
    ? `${today.saintNames?.length > 1 ? `${today.saintNames.length} commemorations` : "Open the life"} for today.`
    : today.saintNames?.length
    ? today.saintNames.slice(0, 2).join("; ") + (today.saintNames.length > 2 ? ` + ${today.saintNames.length - 2} more` : "")
    : "Open the lives commemorated today.";
  const saintIcon = today.saintStories?.find((saint) => saint.iconUrl)?.iconUrl || "";
  const displayedSaintKey = saintMatchKey(displayedSaintTitle);
  const displayedSaintStory = today.saintStories?.find((saint) => {
    const key = saintMatchKey(saint?.name || saint?.title || "");
    return key && displayedSaintKey && (key === displayedSaintKey || key.includes(displayedSaintKey) || displayedSaintKey.includes(key));
  });
  const saintCentury = displayedSaintStory?.reposeCentury || today.saintStories?.find((saint) => saint.reposeCentury)?.reposeCentury || "";
  const saintCard = `<button type="button" data-saint-of-day data-date="${html(today.civilDate)}" data-calendar="${html(today.calendarType)}" style="margin-top:14px;width:100%;text-align:left;border:1px solid rgba(181,148,47,.34);background:linear-gradient(135deg,#fffaf0,#f7edd6);border-radius:13px;padding:13px;display:flex;gap:12px;align-items:center;cursor:pointer;font-family:inherit;color:var(--ink);box-shadow:0 1px 2px rgba(20,40,70,.04);">
    ${saintIcon ? `<img src="${html(saintIcon)}" alt="" style="width:52px;height:52px;border-radius:12px;object-fit:cover;border:1px solid var(--goldsoft);flex:none;">` : `<span style="width:48px;height:48px;border-radius:50%;background:var(--navy);color:#f3ead4;display:grid;place-items:center;flex:none;font-size:23px;">✥</span>`}
    <span style="min-width:0;line-height:1.25;"><span style="display:block;color:var(--gold);font-size:10.5px;letter-spacing:.13em;font-weight:800;text-transform:uppercase;">Saint of the Day</span><strong style="display:block;font-family:'Cormorant Garamond',serif;font-size:22px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${html(displayedSaintTitle)}</strong>${saintCentury ? `<span style="display:block;color:var(--gold);font-size:12px;font-weight:800;margin:2px 0 1px;">${html(saintCentury)}</span>` : ""}<small style="display:block;color:var(--muted);line-height:1.35;">${html(saintPreview)}</small></span>
    <span style="margin-left:auto;color:var(--gold);font-size:20px;flex:none;">→</span>
  </button>`;
  const body = `
    <section data-screen-label="Dashboard" style="display:flex;flex-direction:column;gap:22px;">
      <div style="background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:22px;display:flex;gap:24px;box-shadow:0 1px 3px rgba(20,40,70,.04);flex-wrap:wrap;">
        ${churchIconPanel}
        <div style="flex:1;min-width:240px;display:flex;flex-direction:column;gap:6px;">
          <div style="color:var(--gold);font-size:12px;letter-spacing:.18em;font-weight:600;">${html(today.kicker)}</div>
          <div style="font-family:'Cormorant Garamond',serif;font-size:30px;font-weight:600;color:var(--ink);line-height:1.1;">${html(today.title)}</div>
          <div style="display:flex;gap:30px;flex-wrap:wrap;margin-top:12px;">
            <div style="display:flex;flex-direction:column;gap:14px;">
              <div style="display:flex;gap:10px;"><span style="color:var(--gold);font-size:17px;margin-top:2px;">▣</span><span><span style="display:block;color:var(--gold);font-size:10.5px;letter-spacing:.13em;font-weight:600;">LITURGICAL DATE</span><span style="font-size:16px;">${html(today.liturgicalDateLabel)}</span></span></div>
              <div style="display:flex;gap:10px;"><span style="color:var(--gold);font-size:17px;margin-top:2px;">✥</span><span><span style="display:block;color:var(--gold);font-size:10.5px;letter-spacing:.13em;font-weight:600;">TONE OF WEEK</span><span style="font-size:16px;">${html(today.toneLabel)}</span></span></div>
            </div>
            <div style="display:flex;gap:10px;"><span style="color:var(--gold);font-size:17px;margin-top:2px;">♙</span><span><span style="display:block;color:var(--gold);font-size:10.5px;letter-spacing:.13em;font-weight:600;">FASTING RULE</span><span style="font-size:16px;display:block;">${html(today.fastingRule)}</span><span style="color:var(--muted);font-size:13px;font-style:italic;">${html(today.fastingNote)}</span></span></div>
            <div style="display:grid;grid-template-columns:repeat(2,minmax(130px,1fr));gap:14px;flex:1 1 300px;min-width:min(100%,300px);">
              <div><span style="display:block;color:var(--gold);font-size:10.5px;letter-spacing:.13em;font-weight:600;">EPISTLE READING</span><span style="font-size:16px;">${html(today.epistleRef)}</span></div>
              <div><span style="display:block;color:var(--gold);font-size:10.5px;letter-spacing:.13em;font-weight:600;">GOSPEL READING</span><span style="font-size:16px;">${html(today.gospelRef)}</span></div>
            </div>
          </div>
          ${saintCard}
        </div>
        <div style="flex:1;min-width:220px;border-left:1px solid var(--line);padding-left:22px;">
          <div style="color:var(--gold);font-size:11px;letter-spacing:.16em;font-weight:600;">${html(today.troparionLabel)}</div>
          <p style="margin:6px 0 16px;font-size:15.5px;line-height:1.5;color:#33405a;">${html(today.troparionText)}</p>
          <div style="color:var(--gold);font-size:11px;letter-spacing:.16em;font-weight:600;">${html(today.kontakionLabel)}</div>
          <p style="margin:6px 0 0;font-size:15.5px;line-height:1.5;color:#33405a;">${html(today.kontakionText)}</p>
        </div>
        ${renderTodayLearnContext(vm)}
      </div>
      <div style="background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:18px 22px;box-shadow:0 1px 3px rgba(20,40,70,.04);">
        <div style="display:flex;align-items:center;gap:9px;margin-bottom:14px;"><span style="color:var(--gold);font-size:16px;">✥</span><span style="color:var(--gold);font-size:12px;letter-spacing:.18em;font-weight:600;">CHURCH RHYTHMS</span></div>
        <div style="display:flex;gap:14px;flex-wrap:wrap;">
          ${vm.churchRhythms.map((r) => `<div style="flex:1;min-width:170px;display:flex;align-items:center;gap:12px;">${check(r.complete)}<span style="line-height:1.25;"><span style="display:block;font-size:16px;color:var(--ink);font-weight:500;">${html(r.label)}</span><span style="display:block;font-size:13px;color:var(--muted);">${html(r.sub)}</span></span></div>`).join("")}
        </div>
      </div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start;">
        <div style="flex:1.25 1 240px;background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:18px;box-shadow:0 1px 3px rgba(20,40,70,.04);">
          <div style="display:flex;align-items:center;gap:9px;margin-bottom:14px;"><span style="color:var(--gold);font-size:17px;">⌂</span><span style="color:var(--gold);font-size:12px;letter-spacing:.15em;font-weight:600;">HOUSEHOLD STREAM</span></div>
          <div style="display:flex;flex-direction:column;gap:10px;">
            ${vm.householdStream.length ? vm.householdStream.map((s) => `<div style="display:flex;align-items:center;gap:12px;background:var(--paper2);border:1px solid var(--line);border-radius:10px;padding:11px 13px;"><span style="width:38px;height:38px;border-radius:50%;background:#f1e6c9;color:var(--gold);display:flex;align-items:center;justify-content:center;font-size:18px;">${html(s.icon)}</span><div style="flex:1;min-width:0;line-height:1.2;"><span style="display:block;font-weight:600;font-size:15.5px;color:var(--ink);">${html(s.title)}</span><span style="display:block;font-size:12.5px;color:var(--muted);">${html(s.sub)}</span></div><span style="color:var(--muted);font-size:13px;flex:none;">${html(s.time)}</span>${check(s.complete)}</div>`).join("") : `<div style="color:var(--muted);font-style:italic;">Finish Setup to build your household stream.</div>`}
          </div>
        </div>
        ${vm.childColumns.map((col) => `<div style="flex:1 1 185px;background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:14px;box-shadow:0 1px 3px rgba(20,40,70,.04);"><div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--line);"><span style="width:34px;height:34px;border-radius:50%;background:${col.color};color:#f3ead4;display:flex;align-items:center;justify-content:center;font-size:16px;">${html(col.initial)}</span><div style="line-height:1.15;"><span style="display:block;font-size:10px;letter-spacing:.12em;color:var(--gold);font-weight:600;">${html(col.tag)}</span><span style="display:block;font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:600;color:var(--ink);">${html(col.name)} <span style="color:var(--muted);font-size:13px;font-family:'EB Garamond',serif;">• Age ${html(col.age)}</span></span></div></div><div style="display:flex;flex-direction:column;gap:8px;">${col.tasks.map((t) => `<div style="display:flex;align-items:center;gap:9px;background:var(--paper2);border:1px solid var(--line);border-radius:9px;padding:9px 10px;"><div style="flex:1;min-width:0;line-height:1.15;"><span style="display:block;font-weight:600;font-size:14px;color:var(--ink);">${html(t.title)}</span><span style="display:block;font-size:11.5px;color:var(--muted);">${html(t.sub)}</span></div><span style="color:var(--muted);font-size:11.5px;flex:none;">${html(t.time)}</span>${check(t.complete)}</div>`).join("")}</div></div>`).join("")}
        <div style="flex:1.05 1 210px;background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:18px;box-shadow:0 1px 3px rgba(20,40,70,.04);">
          <div style="display:flex;align-items:center;gap:9px;margin-bottom:14px;"><span style="color:var(--gold);font-size:16px;">✥</span><span style="color:var(--gold);font-size:12px;letter-spacing:.15em;font-weight:600;">THIS WEEK</span></div>
          <div style="display:flex;flex-direction:column;gap:16px;">${vm.thisWeek.map((w) => `<div style="display:flex;align-items:center;gap:13px;"><span style="width:44px;height:44px;border-radius:50%;background:${w.color};color:#f3ead4;display:flex;align-items:center;justify-content:center;font-size:20px;">${html(w.icon)}</span><div style="line-height:1.2;"><span style="display:block;font-family:'Cormorant Garamond',serif;font-size:23px;font-weight:600;color:var(--ink);">${html(w.big)}</span><span style="display:block;font-size:13.5px;color:#3a4256;font-weight:500;">${html(w.label)}</span><span style="display:block;font-size:12.5px;color:var(--muted);">${html(w.sub)}</span></div></div>`).join("")}<a href="/myagapay/learn/planner" style="margin-top:4px;width:100%;background:var(--paper2);border:1px solid var(--line);border-radius:10px;padding:11px;display:flex;align-items:center;justify-content:center;gap:8px;font-size:15px;color:var(--ink);font-weight:500;text-decoration:none;">View Full Week <span style="color:var(--gold);">→</span></a></div>
        </div>
      </div>
    </section>
  `;
  return shell(vm, body);
}

function renderPlanner(vm) {
  const controls = `
    <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center;">
      <div style="display:flex;gap:4px;background:var(--paper);border:1px solid var(--line);border-radius:11px;padding:5px;min-width:min(100%,390px);">
        ${vm.plannerTabs.map((tab) => `<a href="${tab.href}" style="flex:1;text-align:center;text-decoration:none;border:none;border-radius:8px;padding:8px 0;font-family:inherit;font-size:15px;cursor:pointer;${tab.active ? "background:var(--navy);color:#fff;" : "background:transparent;color:var(--ink);"}">${html(tab.label)}</a>`).join("")}
      </div>
      <div style="display:flex;align-items:center;gap:10px;background:var(--paper);border:1px solid var(--line);border-radius:11px;padding:7px 12px;">
        <div style="text-align:center;line-height:1.15;min-width:150px;"><span style="display:block;font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:600;color:var(--ink);">${html(vm.week.label)}</span><span style="display:block;font-size:12.5px;color:var(--gold);font-style:italic;">${html(vm.week.seasonLabel)}</span></div>
      </div>
      <div style="display:flex;align-items:center;gap:4px;background:var(--paper);border:1px solid var(--line);border-radius:11px;padding:5px;">
        ${vm.termTabs.map((tab) => `<a href="${tab.href}" style="text-decoration:none;border-radius:8px;padding:8px 24px;font-size:15px;${tab.active ? "background:var(--navy);color:#fff;" : "color:var(--ink);"}">${html(tab.label)}</a>`).join("")}
      </div>
    </div>
  `;
  const content = vm.activeView === "day"
    ? renderPlannerDay(vm)
    : vm.activeView === "month"
      ? renderPlannerMonth(vm)
      : vm.activeView === "term"
        ? renderPlannerTerm(vm)
        : vm.activeView === "year"
          ? renderPlannerYear(vm)
          : renderPlannerWeek(vm);
  const body = `
    <section data-screen-label="Planner" style="display:flex;flex-direction:column;gap:18px;">
      ${controls}
      ${content}
    </section>
  `;
  return shell(vm, body);
}

function statusPill(status) {
  const normalized = String(status || "").toLowerCase();
  const color = normalized === "completed" ? "var(--navy)" : normalized === "deferred" ? "var(--burgundy)" : normalized === "reduced" ? "var(--gold)" : "var(--muted)";
  return `<span style="border:1px solid ${color};color:${color};border-radius:999px;padding:2px 8px;font-size:11px;text-transform:capitalize;">${html(status || "planned")}</span>`;
}

function renderPlannerWeek(vm) {
  const dayCount = Math.max(vm.week.days.length, 1);
  return `
    <div style="background:var(--paper);border:1px solid var(--line);border-radius:14px;overflow:auto;box-shadow:0 1px 3px rgba(20,40,70,.04);">
      <div style="min-width:980px;">
        <div style="display:grid;grid-template-columns:168px repeat(${dayCount}, minmax(112px,1fr));border-bottom:1px solid var(--line);">
          <div style="padding:14px;color:var(--gold);font-size:12px;letter-spacing:.15em;font-weight:600;">WEEK</div>
          ${vm.week.days.map((day) => `<div style="padding:12px;border-left:1px solid var(--line);text-align:center;${day.isSunday ? "background:#f9f1df;" : ""}"><div style="color:${day.isSunday ? "var(--burgundy)" : "var(--gold)"};font-size:16px;">${day.isSunday ? "☩" : "✥"}</div><strong style="font-size:13px;color:var(--ink);">${html(day.weekday || day.weekdayLong)}</strong><small style="display:block;color:var(--muted);">${html(day.shortDate || day.date)}</small><small style="display:block;color:var(--ink);line-height:1.2;">${html(day.isSunday ? "Church & Rest" : day.feast)}</small></div>`).join("")}
        </div>
        ${vm.week.householdRows.map((row) => `<div style="display:grid;grid-template-columns:168px repeat(${dayCount}, minmax(112px,1fr));border-bottom:1px solid var(--line);"><div style="padding:12px 14px;"><strong>${html(row.title)}</strong><small style="display:block;color:var(--muted);">${html(row.sub)}</small>${row.graceModeApplied ? `<small style="display:block;color:var(--gold);">Grace adjusted</small>` : ""}</div>${vm.week.days.map((day, index) => `<div style="padding:9px;border-left:1px solid var(--line);${day.isSunday ? "background:#fbf5e8;" : ""}"><div style="background:var(--paper2);border:1px solid var(--line);border-radius:9px;padding:10px;text-align:center;color:var(--ink);min-height:46px;display:flex;align-items:center;justify-content:center;gap:6px;">${day.isSunday ? "—" : row.minutes[index] ? `${html(row.minutes[index])}m ${check(row.statuses[index] === "completed")}` : "—"}</div></div>`).join("")}</div>`).join("")}
      </div>
    </div>
    <div style="display:flex;gap:14px;flex-wrap:wrap;">
      <div style="flex:1 1 620px;background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:18px;">
        <div style="color:var(--gold);font-size:12px;letter-spacing:.15em;font-weight:600;margin-bottom:12px;">FORM PLANS</div>
        ${vm.week.formRows.length ? vm.week.formRows.map((form) => `<div style="display:grid;grid-template-columns:42px 150px 1fr;gap:12px;align-items:start;border-top:1px solid var(--line);padding:12px 0;"><span style="width:38px;height:38px;border-radius:50%;background:${form.color};color:#f3ead4;display:flex;align-items:center;justify-content:center;">${html(form.initials.slice(0, 2).join(""))}</span><span><strong style="display:block;">${html(form.formLabel)}</strong><small style="color:var(--muted);">${html(form.childNames.join(", "))}</small></span><span style="color:var(--muted);display:grid;gap:5px;">${form.items.slice(0, 4).map((item) => `<span>${html(item.title)}${item.sub ? ` · ${html(item.sub)}` : ""}</span>`).join("")}${form.items.length > 4 ? `<small style="color:var(--gold);">+ ${form.items.length - 4} more lessons</small>` : ""}</span></div>`).join("") : emptyState("Add children and subjects in Setup to generate Form plans.")}
      </div>
      <aside style="flex:0 1 330px;background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:18px;">
        <div style="color:var(--gold);font-size:12px;letter-spacing:.15em;font-weight:600;margin-bottom:12px;">TERM AT A GLANCE</div>
        <strong style="font-family:'Cormorant Garamond',serif;font-size:22px;">${html(vm.term.cycleTitle)}</strong>
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px;">${vm.term.settings.length ? vm.term.settings.map((item) => `<span style="padding:8px 0;border-top:1px solid var(--line);">${html(item)}</span>`).join("") : emptyState("Set cycle planning in Setup.")}</div>
      </aside>
    </div>
  `;
}

function renderPlannerDay(vm) {
  const day = vm.day.selected || {};
  const dayLinks = vm.week.days.map((item) => `<a href="/myagapay/learn/planner?view=day&date=${encodeURIComponent(item.date)}" style="text-decoration:none;color:var(--ink);border:1px solid ${item.date === day.date ? "var(--gold)" : "var(--line)"};background:${item.date === day.date ? "#fbf2dd" : "var(--paper)"};border-radius:10px;padding:10px;text-align:center;min-width:92px;"><strong style="display:block;color:${item.isSunday ? "var(--burgundy)" : "var(--gold)"};">${html(item.weekday)}</strong><small>${html(item.shortDate)}</small></a>`).join("");
  const household = day.isSunday ? emptyState("Sunday is reserved for worship, rest, and family rhythm. No school blocks are scheduled.") : vm.day.householdBlocks.map((block) => `<div style="display:grid;grid-template-columns:1fr 70px 100px;gap:12px;align-items:center;padding:12px 0;border-top:1px solid var(--line);"><span><strong>${html(block.title)}</strong><small style="display:block;color:var(--muted);">${html(block.sub)}</small></span><span>${html(block.minutes)}m</span>${statusPill(block.status)}</div>`).join("");
  const forms = day.isSunday ? "" : vm.day.formBlocks.map((form) => `<div style="border:1px solid var(--line);border-radius:10px;background:var(--paper2);padding:12px;display:grid;gap:10px;"><div style="display:flex;gap:10px;align-items:center;"><span style="width:34px;height:34px;border-radius:50%;background:${form.color};color:#f3ead4;display:flex;align-items:center;justify-content:center;">${html(form.initials.slice(0, 2).join(""))}</span><span><strong>${html(form.formLabel)}</strong><small style="display:block;color:var(--muted);">${html(form.childNames.join(", "))}</small></span></div>${form.items.map((item) => `<div style="display:grid;grid-template-columns:1fr 60px 90px;gap:10px;align-items:center;border-top:1px solid var(--line);padding-top:8px;"><span><strong>${html(item.title)}</strong><small style="display:block;color:var(--muted);">${html(item.sub)}</small></span><span>${html(item.minutes)}m</span>${statusPill(item.status)}</div>`).join("")}</div>`).join("");
  return `
    <div style="display:flex;gap:8px;overflow:auto;padding-bottom:2px;">${dayLinks}</div>
    <div style="display:grid;grid-template-columns:1.1fr .9fr;gap:16px;align-items:start;">
      ${panel("Daily Plan", `<h2 style="font-family:'Cormorant Garamond',serif;font-size:28px;margin:0;">${html(day.weekdayLong || day.weekday)} · ${html(day.shortDate || day.date)}</h2><p style="margin:6px 0 14px;color:var(--muted);">${html(day.feast)} · ${html(day.fasting)}</p>${household}`, { icon: day.isSunday ? "☩" : "▣" })}
      ${panel("Form Work", day.isSunday ? `<div style="color:var(--muted);line-height:1.45;">No Form work is scheduled on Sunday.</div>` : `<div style="display:grid;gap:10px;">${forms || emptyState("No Form blocks for this day.")}</div>`, { icon: "◎" })}
    </div>
    ${panel("Church Notes", `<div style="display:grid;grid-template-columns:repeat(3,minmax(180px,1fr));gap:12px;"><div><small style="color:var(--gold);letter-spacing:.12em;">EPISTLE</small><strong style="display:block;">${html(day.epistle || "Set readings source")}</strong></div><div><small style="color:var(--gold);letter-spacing:.12em;">GOSPEL</small><strong style="display:block;">${html(day.gospel || "Set readings source")}</strong></div><div><small style="color:var(--gold);letter-spacing:.12em;">TONE</small><strong style="display:block;">${html(day.tone || "Tone")}</strong></div></div>`, { icon: "✥" })}
  `;
}

function adjacentMonthKey(monthKey, delta) {
  const [year, month] = String(monthKey || "").split("-").map(Number);
  const date = new Date(Date.UTC(Number.isFinite(year) ? year : new Date().getUTCFullYear(), (Number.isFinite(month) ? month : 1) - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

function renderPlannerMonth(vm) {
  const month = vm.month || {};
  const dayCells = (month.days || []).map((day) => {
    const muted = !day.inMonth;
    const fastBg = day.isFastDay ? "rgba(110,47,42,.12)" : day.isSunday ? "rgba(181,148,47,.14)" : "var(--paper2)";
    const border = day.isToday ? "var(--gold)" : day.isFastDay ? "rgba(110,47,42,.38)" : "var(--line)";
    const plans = [...(day.householdPlan || []), ...(day.formPlan || [])].slice(0, 3);
    return `<article style="min-height:150px;border:1px solid ${border};border-radius:12px;background:${muted ? "rgba(248,240,221,.46)" : fastBg};padding:10px;display:flex;flex-direction:column;gap:7px;box-shadow:${day.isToday ? "inset 0 0 0 1px rgba(181,148,47,.45)" : "none"};opacity:${muted ? ".58" : "1"};">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
        <span style="font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:700;color:${day.isFastDay ? "var(--burgundy)" : "var(--ink)"};">${html(day.dayNumber)}</span>
        ${day.isToday ? `<span style="border:1px solid var(--gold);border-radius:999px;padding:2px 7px;font-size:10px;color:var(--gold);font-weight:700;">TODAY</span>` : ""}
      </div>
      <strong style="font-size:12.5px;line-height:1.18;color:${day.isFastDay ? "var(--burgundy)" : "var(--ink)"};">${html(day.feast)}</strong>
      ${day.isFastDay ? `<span style="border:1px solid rgba(110,47,42,.35);background:#fff8f3;color:var(--burgundy);border-radius:999px;padding:4px 7px;font-size:11px;font-weight:700;width:max-content;max-width:100%;">${html(day.fastingType || day.fasting)}</span>` : `<span style="color:var(--muted);font-size:11px;">${html(day.fastingType || "No fasting prescribed")}</span>`}
      <div style="display:grid;gap:4px;margin-top:auto;">${plans.length ? plans.map((plan) => `<span style="font-size:11.5px;color:#33405a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${html(plan.title)}${plan.minutes ? ` · ${html(plan.minutes)}m` : ""}</span>`).join("") : `<span style="font-size:11.5px;color:var(--muted);font-style:italic;">Quiet household rhythm</span>`}</div>
    </article>`;
  }).join("");
  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:16px;align-items:start;">
      <div style="background:var(--paper);border:1px solid var(--line);border-radius:16px;padding:16px;box-shadow:0 1px 3px rgba(20,40,70,.04);">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;flex-wrap:wrap;">
          <div>
            <div style="color:var(--gold);font-size:12px;letter-spacing:.15em;font-weight:700;text-transform:uppercase;">Household Month</div>
            <h2 style="font-family:'Cormorant Garamond',serif;font-size:34px;line-height:1;margin:5px 0 0;color:var(--ink);">${html(month.label)}</h2>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <a href="/myagapay/learn/planner?view=month&month=${encodeURIComponent(adjacentMonthKey(month.key, -1))}" style="border:1px solid var(--line);border-radius:9px;padding:9px 12px;color:var(--ink);text-decoration:none;background:var(--paper2);">← Previous</a>
            <button type="button" data-planner-month-print="${html(month.key)}" style="border:1px solid var(--gold);background:var(--navy);color:#fff;border-radius:9px;padding:9px 14px;font-family:inherit;font-weight:700;cursor:pointer;">Print Month</button>
            <a href="/myagapay/learn/planner?view=month&month=${encodeURIComponent(adjacentMonthKey(month.key, 1))}" style="border:1px solid var(--line);border-radius:9px;padding:9px 12px;color:var(--ink);text-decoration:none;background:var(--paper2);">Next →</a>
          </div>
        </div>
        <div style="overflow:auto;padding-bottom:4px;">
          <div style="display:grid;grid-template-columns:repeat(7,minmax(92px,1fr));gap:8px;min-width:760px;">
            ${(month.weekdays || []).map((day) => `<div style="color:var(--gold);font-size:11px;letter-spacing:.12em;font-weight:700;text-align:center;text-transform:uppercase;">${html(day)}</div>`).join("")}
            ${dayCells}
          </div>
        </div>
      </div>
      <aside style="display:flex;flex-direction:column;gap:14px;">
        ${panel("Month Notes", `<div style="display:grid;gap:12px;"><div><small style="color:var(--gold);letter-spacing:.12em;">FAST DAYS</small><strong style="display:block;font-family:'Cormorant Garamond',serif;font-size:30px;color:var(--burgundy);">${html(month.fastDays)}</strong><span style="color:var(--muted);">Marked in red with fasting type.</span></div><div><small style="color:var(--gold);letter-spacing:.12em;">FEAST MARKERS</small><strong style="display:block;font-family:'Cormorant Garamond',serif;font-size:30px;color:var(--ink);">${html(month.feastDays)}</strong><span style="color:var(--muted);">Major rhythms shown from the liturgical calendar.</span></div><div style="border-top:1px solid var(--line);padding-top:12px;color:#33405a;line-height:1.45;">Use this as Stephanie's fridge calendar: plan the month, see fast days at a glance, then print a clean household copy.</div></div>`, { icon: "▣" })}
        ${panel("Legend", `<div style="display:grid;gap:10px;"><span style="display:flex;gap:9px;align-items:center;"><i style="width:18px;height:18px;border-radius:5px;background:rgba(110,47,42,.12);border:1px solid rgba(110,47,42,.38);"></i> Fast day</span><span style="display:flex;gap:9px;align-items:center;"><i style="width:18px;height:18px;border-radius:5px;background:rgba(181,148,47,.14);border:1px solid var(--line);"></i> Sunday / feast rhythm</span><span style="display:flex;gap:9px;align-items:center;"><i style="width:18px;height:18px;border-radius:5px;background:var(--paper2);border:1px solid var(--gold);"></i> Today</span></div>`, { icon: "✥" })}
      </aside>
    </div>
  `;
}

function renderPlannerTerm(vm) {
  const weekCells = Array.from({ length: Number(vm.term.summary.weeks || 12) }, (_, index) => `<div style="text-align:center;color:var(--ink);font-size:13px;">${index + 1}</div>`).join("");
  const pacingRows = vm.term.pacingRows.map((row) => `<div style="display:grid;grid-template-columns:150px repeat(12,1fr);min-width:920px;border-top:1px solid var(--line);align-items:stretch;"><div style="padding:12px;display:flex;gap:9px;align-items:flex-start;"><span style="width:28px;height:28px;border-radius:50%;background:${html(row.color)};color:#f3ead4;display:flex;align-items:center;justify-content:center;font-size:13px;">✥</span><span><strong>${html(row.label)}</strong><small style="display:block;color:var(--muted);">${html(row.subtitle)}</small></span></div><div style="grid-column:span 12;display:grid;grid-template-columns:repeat(12,1fr);position:relative;border-left:1px solid var(--line);background:linear-gradient(90deg,rgba(231,220,192,.32) 1px,transparent 1px);background-size:calc(100% / 12) 100%;">${row.segments.map((segment) => `<div style="grid-column:${segment.start} / span ${segment.span};margin:7px 4px;border:1px solid ${html(segment.color)};border-radius:8px;background:${softColor(segment.color, "26")};display:flex;align-items:center;justify-content:center;text-align:center;padding:8px;font-size:13px;color:var(--ink);box-shadow:inset 0 0 0 1px rgba(255,255,255,.32);"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${html(segment.color)};margin-right:6px;"></span>${html(segment.title)}</div>`).join("")}</div></div>`).join("");
  return `
    <div style="display:grid;grid-template-columns:repeat(4,minmax(160px,1fr));gap:12px;">${vm.term.setupCards.map((card) => `<div style="background:var(--paper);border:1px solid ${html(card.color)};border-radius:12px;padding:14px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.35);"><small style="color:var(--gold);letter-spacing:.12em;text-transform:uppercase;">${html(card.title)}</small><strong style="display:block;font-family:'Cormorant Garamond',serif;font-size:22px;margin:8px 0;color:var(--ink);">${html(card.value)}</strong><span style="color:var(--muted);line-height:1.35;">${html(card.detail)}</span></div>`).join("")}</div>
    <div style="background:var(--paper);border:1px solid var(--line);border-radius:14px;overflow:auto;">
      <div style="min-width:920px;">
        <div style="display:grid;grid-template-columns:150px repeat(12,1fr);padding:12px 0;border-bottom:1px solid var(--line);"><div style="padding-left:12px;color:var(--gold);font-size:12px;letter-spacing:.15em;">TERM PACING</div>${weekCells}</div>
        ${pacingRows || emptyState("Add pacing rows in Setup.")}
      </div>
    </div>
    <div style="display:grid;grid-template-columns:.9fr repeat(${Math.max(vm.term.childTracks.length, 1)}, minmax(150px,1fr));gap:12px;">
      ${panel("Household Stream", vm.term.householdSummary.map((item) => `<div style="padding:8px 0;border-top:1px solid var(--line);">${html(item)}</div>`).join(""), { icon: "⌂" })}
      ${vm.term.childTracks.map((child) => panel(`${child.name} · Age ${child.age}`, `<div style="display:grid;gap:8px;">${child.tracks.map((track) => `<div style="border-top:1px solid var(--line);padding:8px 0;">${html(track)}</div>`).join("") || emptyState("No tracks configured.")}</div>`, { icon: child.initial, style: "min-width:0;" })).join("")}
    </div>
    ${vm.term.graceReserve?.length ? panel("Grace Mode Reserve", `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;">${vm.term.graceReserve.map((item) => `<div style="border:1px solid ${html(item.color)};border-radius:10px;background:${softColor(item.color, "18")};padding:12px;"><strong style="display:block;color:var(--ink);">${html(item.title)}</strong><small style="display:block;color:var(--muted);line-height:1.35;margin-top:4px;">${html(item.note)}</small></div>`).join("")}</div>`, { icon: "✥" }) : ""}
  `;
}

function renderPlannerYear(vm) {
  return `
    <div style="display:grid;grid-template-columns:1fr 320px;gap:16px;align-items:start;">
      ${panel("School Year & Cycle", `<h2 style="font-family:'Cormorant Garamond',serif;font-size:28px;margin:0;">${html(vm.year.schoolYear)}</h2><p style="color:var(--muted);">${html(vm.year.dateRange)}</p><strong>${html(vm.year.cycleTitle)}</strong><p style="line-height:1.45;color:#33405a;">${html(vm.year.cycleYear)}</p><div style="display:grid;grid-template-columns:repeat(3,minmax(160px,1fr));gap:10px;margin-top:12px;">${vm.year.terms.map((term) => `<div style="border:1px solid ${term.active ? "var(--gold)" : "var(--line)"};border-radius:10px;background:${term.active ? "#fbf2dd" : "var(--paper2)"};padding:12px;"><strong>${html(term.label)}</strong><small style="display:block;color:var(--muted);">${term.active ? "Current term" : "Planned"}</small></div>`).join("")}</div>`, { icon: "▣" })}
      ${panel("Upcoming Feasts", vm.year.upcomingFeasts.map((feast) => `<div style="padding:10px 0;border-top:1px solid var(--line);"><strong>${html(feast.title)}</strong><small style="display:block;color:var(--muted);">${html(feast.date)} · ${html(feast.fasting)}</small></div>`).join("") || emptyState("No feasts loaded."), { icon: "✥" })}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      ${panel("Cycle Frameworks", vm.year.frameworks.map((item) => `<div style="padding:10px 0;border-top:1px solid var(--line);"><small style="color:var(--gold);letter-spacing:.12em;text-transform:uppercase;">${html(item.type)}</small><strong style="display:block;">${html(item.label)}</strong></div>`).join(""), { icon: "◎" })}
      ${panel("Season Topics", vm.year.topics.map((topic) => `<div style="padding:10px 0;border-top:1px solid var(--line);"><small style="color:var(--gold);letter-spacing:.12em;text-transform:uppercase;">${html(topic.season)} · ${html(topic.type)}</small><strong style="display:block;">${html(topic.title)}</strong></div>`).join(""), { icon: "☰" })}
    </div>
    ${panel("Curriculum Packages", `<div style="display:grid;grid-template-columns:repeat(2,minmax(220px,1fr));gap:12px;">${vm.year.curriculumPackages.map((pkg) => `<div style="border:1px solid var(--line);border-radius:10px;background:var(--paper2);padding:12px;"><small style="color:var(--gold);">${html(pkg.vendor)}</small><strong style="display:block;margin:4px 0;">${html(pkg.title)}</strong><span style="color:var(--muted);line-height:1.35;">${html(pkg.summary)}</span></div>`).join("")}</div>`, { icon: "✥" })}
  `;
}

function renderFormation(vm) {
  const rhythms = vm.rhythms.length ? vm.rhythms.map((item) => `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid var(--line);">${check(item.complete)}<div><strong>${html(item.title)}</strong><small style="display:block;color:var(--muted);">${html(item.note)}</small></div></div>`).join("") : emptyState("Add formation rhythms in Setup.");
  const readings = vm.today.readingTasks?.length ? `<div style="display:grid;gap:8px;margin:12px 0 4px;">${vm.today.readingTasks.map((reading) => `<button type="button" data-reading-check aria-pressed="false" style="display:flex;align-items:center;gap:10px;text-align:left;border:1px solid var(--line);border-radius:10px;background:var(--paper2);padding:9px 11px;font-family:inherit;color:var(--ink);cursor:pointer;"><span data-reading-mark style="width:20px;height:20px;border-radius:50%;border:1.5px solid var(--gold);display:grid;place-items:center;color:var(--gold);font-size:12px;"></span><span><strong>${html(reading.label)}</strong><small style="display:block;color:var(--muted);">${html(reading.ref)}</small></span></button>`).join("")}</div>` : `<p style="margin:10px 0 0;color:#33405a;line-height:1.45;">${html(vm.today.readings)}</p>`;
  const memory = vm.recitation.length ? vm.recitation.map((item) => `<div style="padding:10px 0;border-top:1px solid var(--line);display:grid;grid-template-columns:1fr 110px;gap:14px;align-items:center;"><div><strong>${html(item.title)}</strong><small style="display:block;color:var(--muted);">${html(item.status)}</small></div><div>${bar(item.progress, "var(--navy)")}<small style="color:var(--muted);">${item.progress}%</small></div></div>`).join("") : emptyState("No memory tracks configured yet.");
  const enrich = vm.enrichment.length ? vm.enrichment.map((item) => `<div style="display:flex;justify-content:space-between;gap:12px;padding:11px 0;border-top:1px solid var(--line);"><span><strong>${html(item.type)}:</strong> ${html(item.title)}</span><span style="color:var(--muted);">${html(item.minutes)}</span></div>`).join("") : emptyState("Add enrichment blocks in Setup.");
  const feasts = vm.feasts.length ? vm.feasts.slice(0, 2).map((feast) => `<div style="border-top:1px solid var(--line);padding:11px 0;"><strong>${html(feast.title)}</strong><small style="display:block;color:var(--muted);margin-top:4px;">${html(feast.date)}${feast.fasting ? ` · ${html(feast.fasting)}` : ""}</small></div>`).join("") : emptyState("No upcoming feasts loaded.");
  const body = `
    <section data-screen-label="Formation" style="display:flex;flex-direction:column;gap:18px;">
      <div style="display:grid;grid-template-columns:minmax(300px,1.2fr) minmax(270px,.9fr) minmax(230px,.7fr);gap:16px;align-items:start;">
        ${panel("Church Rhythms", `<div style="display:grid;grid-template-columns:120px 1fr;gap:18px;"><div style="border:1px solid var(--line);border-radius:10px;background:linear-gradient(180deg,#f8f0dd,#efe0ba);min-height:180px;display:flex;align-items:center;justify-content:center;color:var(--gold);font-size:54px;">✥</div><div><h2 style="font-family:'Cormorant Garamond',serif;font-size:26px;margin:0 0 8px;">${html(vm.today.title)}</h2><p style="margin:0;color:var(--muted);line-height:1.4;">${html(vm.today.date)} · ${html(vm.today.fasting)}</p>${readings}${rhythms}</div></div>`, { icon: "☩", style: "grid-column:span 2;" })}
        ${panel("This Week in the Church", `<div style="display:flex;flex-direction:column;gap:13px;"><strong style="font-family:'Cormorant Garamond',serif;font-size:22px;">${html(vm.today.title)}</strong><span style="color:var(--muted);">${html(vm.today.saint)}</span><p style="margin:0;line-height:1.45;color:#33405a;">${html(vm.today.troparion)}</p><a href="/myagapay/learn/planner" style="color:var(--ink);text-decoration:none;border:1px solid var(--line);border-radius:10px;padding:10px;text-align:center;background:var(--paper2);">View Full Calendar →</a></div>`, { icon: "✥" })}
      </div>
      <div style="display:grid;grid-template-columns:repeat(5,minmax(170px,1fr));gap:16px;">
        ${panel("Catechesis", `<div style="display:grid;gap:10px;"><small style="color:var(--gold);letter-spacing:.12em;text-transform:uppercase;">Current Lesson Cycle</small><strong style="font-family:'Cormorant Garamond',serif;font-size:23px;">${html(vm.catechesis.title)}</strong><span style="color:#33405a;line-height:1.45;">${html(vm.catechesis.currentLesson)}</span>${vm.catechesis.progress ? `<span style="border:1px solid var(--line);border-radius:999px;padding:6px 10px;width:max-content;background:var(--paper2);">${html(vm.catechesis.progress)}</span>` : ""}<p style="margin:0;color:var(--muted);line-height:1.45;">${html(vm.catechesis.topic)}</p></div>`, { icon: "✥" })}
        ${panel("Recitation & Memory Work", memory, { icon: "☰" })}
        ${panel("Hymn Study", vm.hymns.length ? vm.hymns.map((hymn) => `<div style="padding:11px 0;border-top:1px solid var(--line);"><strong>${html(hymn.title)}</strong><small style="display:block;color:var(--muted);">${html(hymn.tone)} · ${html(hymn.source)}</small></div>`).join("") : emptyState("Add hymn study in Setup."), { icon: "♫" })}
        ${panel("Enrichment", enrich, { icon: "✣" })}
        ${panel("Saints & Feasts", feasts, { icon: "✥" })}
      </div>
    </section>`;
  return shell(vm, body);
}

function bookCover(book = {}, icon = "☰") {
  const title = String(book.title || "Book").split(/\s+/).slice(0, 3).join(" ");
  return `<div style="width:58px;height:82px;flex:none;border-radius:7px;border:1.5px solid var(--goldsoft);background:linear-gradient(145deg,var(--navy),#1b2c4a 58%,#6e2f2a);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08),0 8px 18px rgba(20,40,70,.14);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#f7e8bd;padding:7px;gap:5px;"><span style="font-size:17px;color:var(--gold2);">${icon}</span><small style="font-size:10px;line-height:1.05;">${html(title)}</small></div>`;
}

function renderBooks(vm) {
  const filters = ["All Books", "Read-Alouds", "Independent", "Formation"];
  const readAlouds = vm.readAlouds.length ? vm.readAlouds : [];
  const libraryRows = vm.library.map((book) => `<div style="display:grid;grid-template-columns:2.1fr 1.1fr 1fr .55fr .7fr 1fr 36px;gap:10px;align-items:center;padding:11px 4px;border-bottom:1px solid var(--line);font-size:13.5px;"><span style="display:flex;align-items:center;gap:9px;min-width:0;">${bookCover(book, "☰")}<span style="min-width:0;"><strong style="display:block;color:var(--ink);font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${html(book.title)}</strong><small style="display:block;color:var(--muted);">${html(book.assignment || "")}</small></span></span><span>${html(book.author)}</span><span>${html(book.category)}</span><span>${html(book.ages || "—")}</span><span style="color:var(--gold);">${book.orthodox ? "Orthodox" : "—"}</span><span>${bar(book.progress)}<small style="color:var(--gold);font-weight:700;">${html(book.progress)}%</small></span><span style="color:var(--gold);">→</span></div>`).join("");
  const suggestionsPanel = vm.suggestions.length
    ? panel("Suggested Orthodox Living Books", vm.suggestions.map((s) => `<div style="display:flex;gap:12px;padding:12px 0;border-top:1px solid var(--line);"><span style="width:38px;height:38px;border-radius:50%;background:${s.color};color:#f3ead4;display:flex;align-items:center;justify-content:center;">✥</span><div><strong style="font-family:'Cormorant Garamond',serif;font-size:18px;">${html(s.title)}</strong><small style="display:block;color:var(--muted);line-height:1.3;">${html(s.subtitle)}</small></div></div>`).join(""), { icon: "✥" })
    : "";
  const pacingPanel = vm.pacing.weeks.length
    ? panel("Book Pacing", `<strong style="font-family:'Cormorant Garamond',serif;font-size:22px;">${html(vm.pacing.title)}</strong><small style="display:block;color:var(--muted);margin:4px 0 12px;">${html(vm.pacing.subtitle)}${vm.pacing.chaptersPerWeek ? ` · ${html(vm.pacing.chaptersPerWeek)} chapters / week` : ""}</small>${vm.pacing.weeks.map((week) => `<div style="display:grid;grid-template-columns:60px 1fr 60px;gap:8px;border-top:1px solid var(--line);padding:8px 0;font-size:13px;"><span>Week ${html(week.week)}</span><strong>${html(week.chapters)}</strong><span>${html(week.pages)}</span></div>`).join("")}`, { icon: "♙" })
    : panel("Book Pacing", emptyState("Add a book with start and end chapters in Setup to generate pacing."), { icon: "♙" });
  const copyworkPanel = vm.copywork.length
    ? panel("Copywork Sources", vm.copywork.map((source) => `<div style="padding:9px 0;border-top:1px solid var(--line);"><strong>${html(source.title)}</strong><small style="display:block;color:var(--muted);">${html(source.detail)}</small></div>`).join(""), { icon: "✒" })
    : "";
  const body = `
    <section data-screen-label="Books" style="display:flex;flex-direction:column;gap:18px;">
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;">
        ${filters.map((filter) => `<button type="button" style="display:flex;align-items:center;gap:8px;background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:10px 14px;cursor:pointer;font-family:inherit;font-size:14px;color:var(--ink);"><span style="color:var(--gold);">☰</span>${html(filter)}<span style="color:var(--gold);">⌄</span></button>`).join("")}
        <div style="flex:1;"></div>
        <label style="display:flex;align-items:center;gap:9px;background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:10px 14px;min-width:min(260px,100%);"><span style="color:var(--gold);">⌕</span><input placeholder="Search books..." style="border:none;background:none;outline:none;font-family:inherit;font-size:14px;color:var(--ink);width:100%;"></label>
      </div>
      <div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap;">
        <div style="flex:1 1 620px;min-width:0;display:flex;flex-direction:column;gap:16px;">
          ${panel("Current Read-Alouds", `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;">${readAlouds.length ? readAlouds.map((book) => `<article style="display:flex;gap:13px;background:var(--paper2);border:1px solid var(--line);border-radius:11px;padding:13px;min-width:0;">${bookCover(book, "☰")}<div style="flex:1;min-width:0;display:flex;flex-direction:column;"><strong style="font-family:'Cormorant Garamond',serif;font-size:19px;line-height:1.12;color:var(--ink);">${html(book.title)}</strong><span style="font-size:12.5px;color:#3a4256;font-style:italic;">${html(book.assignment || book.stream || "Household")}</span><span style="font-size:12.5px;color:var(--muted);margin-top:2px;">${html(book.author)}</span><div style="margin-top:auto;padding-top:11px;">${bar(book.progress)}<small style="display:block;color:var(--gold);font-weight:700;margin-top:4px;">${html(book.progress)}% complete</small></div></div></article>`).join("") : emptyState("Add read-alouds in Setup.")}</div>`, { icon: "☰", action: "View all read-alouds →" })}
          ${panel("Household Library", `<div style="overflow:auto;"><div style="min-width:780px;"><div style="display:grid;grid-template-columns:2.1fr 1.1fr 1fr .55fr .7fr 1fr 36px;gap:10px;padding:0 4px 10px;border-bottom:1px solid var(--line);font-size:10px;letter-spacing:.1em;color:var(--muted);font-weight:700;text-transform:uppercase;"><span>Title</span><span>Author</span><span>Category</span><span>Ages</span><span>Orthodox</span><span>Progress</span><span></span></div>${libraryRows || emptyState("Add books in Setup.")}</div></div>`, { icon: "⌂" })}
        </div>
        <aside style="flex:0 1 340px;display:flex;flex-direction:column;gap:16px;">
          ${suggestionsPanel}
          ${pacingPanel}
          ${copyworkPanel}
        </aside>
      </div>
    </section>`;
  return shell(vm, body);
}

function renderReports(vm) {
  const exportButtons = vm.exports.map((item) => {
    const label = item.label || item.title || "Learn Report";
    return `<button type="button" data-report-export="${html(label)}" style="border:1px solid var(--line);background:var(--paper2);border-radius:10px;padding:12px;font-family:inherit;color:var(--ink);display:grid;gap:5px;text-align:left;cursor:pointer;"><strong>${html(label)}</strong><small style="color:var(--muted);">${html(item.format)}</small></button>`;
  }).join("");
  const subjectRows = vm.subjectProgress.length ? vm.subjectProgress.map((row) => `<tr style="border-top:1px solid var(--line);"><td style="padding:10px;font-weight:700;">${html(row.subjectTitle)}</td><td style="padding:10px;">${html(row.childName)}</td><td style="padding:10px;">${html(row.formLabel)}</td><td style="padding:10px;">${html(row.source || row.subjectType)}</td><td style="padding:10px;">${html(row.completed)} / ${html(row.total)} ${html(row.progressionType)}</td><td style="padding:10px;min-width:130px;">${bar(row.percent, row.color)}<small>${html(row.percent)}%</small></td><td style="padding:10px;text-transform:capitalize;color:var(--gold);">${html(row.status)}</td></tr>`).join("") : `<tr><td colspan="7" style="padding:18px;color:var(--muted);">Add subject ranges and Done Through progress in Setup to generate state-reporting rows.</td></tr>`;
  const body = `
    <section data-screen-label="Reports" style="display:flex;flex-direction:column;gap:18px;">
      <div style="display:grid;grid-template-columns:repeat(4,minmax(170px,1fr));gap:14px;">${vm.stats.map((stat) => `<div style="background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:18px;display:flex;gap:13px;align-items:center;"><span style="width:44px;height:44px;border-radius:50%;background:${stat.color};color:#f3ead4;display:flex;align-items:center;justify-content:center;">✥</span><span><small style="display:block;color:var(--gold);letter-spacing:.12em;text-transform:uppercase;">${html(stat.label)}</small><strong style="font-family:'Cormorant Garamond',serif;font-size:25px;">${html(stat.value)}</strong><small style="display:block;color:var(--muted);">${html(stat.sub)}</small></span></div>`).join("")}</div>
      <div style="display:grid;grid-template-columns:1fr 360px;gap:16px;align-items:start;">
        ${panel("Child Progress Overview", vm.children.map((child) => `<div style="display:grid;grid-template-columns:42px 1fr 150px;gap:12px;align-items:center;padding:12px 0;border-top:1px solid var(--line);"><span style="width:38px;height:38px;border-radius:50%;background:${child.color};color:#f3ead4;display:flex;align-items:center;justify-content:center;">${html(child.initial)}</span><div><strong>${html(child.name)}</strong><small style="display:block;color:var(--muted);">${html(child.grade)} · Age ${html(child.age)} · ${html(child.summary)}</small><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px;"><span><small style="color:var(--muted);">Lessons ${html(child.lessons.done)} / ${html(child.lessons.total)}</small>${bar(child.lessons.percent, child.color)}</span><span><small style="color:var(--muted);">Read-aloud ${html(child.readAloud.percent)}%</small>${bar(child.readAloud.percent, child.color)}</span></div></div><span style="text-transform:capitalize;color:var(--gold);">${html(child.status)}</span></div>`).join(""), { icon: "✥" })}
        ${panel("Year-End Report Preview", `<div style="border:1px solid var(--line);background:#fffaf0;border-radius:10px;min-height:260px;padding:26px;text-align:center;"><div style="color:var(--gold);font-size:32px;">✥</div><h2 style="font-family:'Cormorant Garamond',serif;margin:12px 0 4px;">${html(vm.pdf.title)}</h2><p>${html(vm.pdf.familyName)}</p><small style="display:block;color:var(--muted);">Generated from Learn setup progress, narrations, lessons, and attendance.</small><div style="text-align:left;margin-top:18px;color:#34405a;font-size:13px;">${vm.pdf.summary.map((line) => `<div style="border-top:1px solid var(--line);padding:8px 0;">${html(line)}</div>`).join("")}</div></div><button type="button" data-report-pdf style="margin-top:12px;width:100%;background:var(--navy);color:#fff;border:none;border-radius:10px;padding:11px;font-family:inherit;cursor:pointer;">Print Beautiful Report</button>`, { icon: "☰" })}
      </div>
      ${panel("State Reporting Subject Progress", `<div style="overflow:auto;"><table style="width:100%;border-collapse:collapse;font-size:14px;"><thead><tr style="color:var(--gold);font-size:11px;letter-spacing:.12em;text-transform:uppercase;"><th style="text-align:left;padding:8px;">Subject</th><th style="text-align:left;padding:8px;">Student</th><th style="text-align:left;padding:8px;">Form</th><th style="text-align:left;padding:8px;">Source</th><th style="text-align:left;padding:8px;">Progress</th><th style="text-align:left;padding:8px;">Complete</th><th style="text-align:left;padding:8px;">Status</th></tr></thead><tbody>${subjectRows}</tbody></table></div>`, { icon: "▤" })}
      ${panel("Narration Log", `<div style="overflow:auto;"><table style="width:100%;border-collapse:collapse;font-size:14px;"><tbody>${vm.narrations.map((log) => `<tr style="border-top:1px solid var(--line);"><td style="padding:10px;">${html(log.date)}</td><td style="padding:10px;">${html(log.child)}</td><td style="padding:10px;">${html(log.source)}</td><td style="padding:10px;text-transform:capitalize;">${html(log.type)}</td><td style="padding:10px;color:var(--muted);">${html(log.note)}</td></tr>`).join("")}</tbody></table></div>`, { icon: "✒" })}
      ${panel("Compliance-Friendly Exports", `<div style="display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:12px;">${exportButtons}</div>`, { icon: "▤" })}
    </section>`;
  return shell(vm, body);
}

function renderCommunity(vm) {
  return shell(vm, `
    <section data-screen-label="Community" style="display:grid;gap:18px;">
      <div style="background:linear-gradient(135deg,#fffaf0 0%,#f5ead1 100%);border:1px solid rgba(181,148,47,.34);border-radius:18px;padding:28px;display:grid;grid-template-columns:1fr 220px;gap:24px;align-items:center;box-shadow:0 1px 3px rgba(20,40,70,.04);">
        <div>
          <div style="color:var(--gold);font-size:12px;letter-spacing:.18em;font-weight:700;text-transform:uppercase;">Coming Soon</div>
          <h2 style="font-family:'Cormorant Garamond',serif;font-size:42px;line-height:1;margin:8px 0;color:var(--ink);">${html(vm.title || "Community is coming soon")}</h2>
          <p style="font-size:17px;line-height:1.5;color:#33405a;max-width:760px;margin:0;">${html(vm.subtitle || "A curated Orthodox homeschool resource exchange is planned after the core Learn workflow is settled.")}</p>
          ${vm.detail ? `<p style="color:var(--muted);line-height:1.45;margin:12px 0 0;max-width:720px;">${html(vm.detail)}</p>` : ""}
        </div>
        <div style="border:1px solid var(--line);border-radius:16px;background:rgba(255,255,255,.6);min-height:190px;display:grid;place-items:center;color:var(--gold);font-size:58px;">✥</div>
      </div>
      ${panel("Launch Focus", `<div style="display:grid;grid-template-columns:repeat(3,minmax(180px,1fr));gap:12px;"><div style="border:1px solid var(--line);border-radius:12px;background:var(--paper2);padding:14px;"><strong>Planner first</strong><small style="display:block;color:var(--muted);margin-top:5px;line-height:1.35;">Keep the household planning flow reliable before adding social features.</small></div><div style="border:1px solid var(--line);border-radius:12px;background:var(--paper2);padding:14px;"><strong>Curated resources</strong><small style="display:block;color:var(--muted);margin-top:5px;line-height:1.35;">Community sharing will launch with moderation and resource categories.</small></div><div style="border:1px solid var(--line);border-radius:12px;background:var(--paper2);padding:14px;"><strong>Family-safe</strong><small style="display:block;color:var(--muted);margin-top:5px;line-height:1.35;">The future feature will be built around trust, not an open feed.</small></div></div>`, { icon: "✥" })}
    </section>
  `);
  const chip = (label, active = false, attr = "data-community-filter") => `<button type="button" ${attr}="${html(label)}" style="border:1px solid ${active ? "var(--gold)" : "var(--line)"};background:${active ? "var(--navy)" : "var(--paper)"};color:${active ? "#f3ead4" : "var(--ink)"};border-radius:9px;padding:8px 12px;font-family:inherit;cursor:pointer;">${html(label)}</button>`;
  const body = `
    <section data-screen-label="Community" style="display:flex;flex-direction:column;gap:18px;">
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;">
        <label style="display:flex;align-items:center;gap:9px;background:var(--paper);border:1px solid var(--line);border-radius:11px;padding:11px 15px;flex:1;min-width:220px;max-width:420px;"><span style="color:var(--gold);font-size:17px;">⌕</span><input data-community-search placeholder="Search resources, tags, posters..." style="border:none;background:none;outline:none;font-family:inherit;font-size:15px;color:var(--ink);width:100%;" /></label>
        <div style="display:flex;gap:4px;background:var(--paper);border:1px solid var(--line);border-radius:9px;padding:4px;">${vm.sortOptions.map((label, index) => chip(label, index === 0, "data-community-sort")).join("")}</div>
        <div style="flex:1;"></div>
        <button type="button" data-community-share style="display:flex;align-items:center;gap:9px;background:var(--navy);border:1px solid var(--gold);border-radius:11px;padding:12px 18px;cursor:pointer;font-family:inherit;font-size:15px;color:#f3ead4;font-weight:500;"><span style="color:var(--gold2);font-size:18px;">+</span> Share a Resource</button>
      </div>
      <div style="display:flex;gap:9px;flex-wrap:wrap;align-items:center;">${vm.categories.map((category, index) => chip(category, index === 0)).join("")}</div>
      <div data-community-count style="display:flex;align-items:center;gap:8px;color:var(--muted);font-size:13.5px;"><span style="color:var(--gold);">✥</span> Showing ${vm.resources.length} resources shared by Orthodox homeschool families</div>
      <div data-community-grid style="display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:16px;">
        ${vm.resources.map((resource) => `<article data-community-card data-category="${html(resource.category)}" data-search="${html(`${resource.title} ${resource.category} ${resource.desc} ${resource.poster} ${resource.tags.join(" ")}`.toLowerCase())}" style="background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:11px;box-shadow:0 1px 3px rgba(20,40,70,.04);position:relative;">
          <div style="height:122px;border:1px solid var(--line);border-radius:10px;background:linear-gradient(135deg,${softColor(resource.color, "33")},var(--paper2));display:flex;align-items:center;justify-content:center;color:${html(resource.color)};font-size:42px;position:relative;">✥${resource.pinned ? `<span style="position:absolute;top:9px;left:9px;display:flex;align-items:center;gap:5px;background:var(--gold);color:#1b2c45;font-size:10.5px;font-weight:700;letter-spacing:.05em;padding:4px 9px;border-radius:6px;">✥ PINNED</span>` : ""}<span style="position:absolute;top:9px;right:9px;display:flex;align-items:center;gap:5px;background:rgba(243,234,212,.92);color:var(--ink);font-size:11px;font-weight:600;padding:4px 9px;border-radius:6px;">${html(resource.category)}</span></div>
          <strong style="font-family:'Cormorant Garamond',serif;font-size:20px;line-height:1.15;">${html(resource.title)}</strong>
          <p style="font-size:13px;color:#3a4256;line-height:1.4;flex:1;margin:0;">${html(resource.desc)}</p>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">${resource.tags.map((tag) => `<span style="font-size:11.5px;color:var(--gold);background:var(--paper2);border:1px solid var(--line);border-radius:6px;padding:3px 8px;">#${html(tag)}</span>`).join("")}</div>
          <div style="display:flex;align-items:center;gap:9px;padding-top:10px;border-top:1px solid var(--line);"><span style="width:28px;height:28px;flex:none;border-radius:50%;background:${html(resource.posterColor)};color:#f3ead4;display:flex;align-items:center;justify-content:center;font-family:'Cormorant Garamond',serif;font-size:13px;font-weight:600;border:1.5px solid var(--goldsoft);">${html(resource.posterInitial)}</span><span style="flex:1;min-width:0;font-size:12.5px;color:var(--muted);">${html(resource.poster)}</span><a href="${html(resource.url)}" target="_blank" rel="noreferrer" style="color:var(--gold);font-size:16px;text-decoration:none;">↗</a></div>
          <div style="display:flex;align-items:center;gap:9px;"><button type="button" data-community-vote style="display:flex;align-items:center;gap:6px;background:var(--paper2);border:1px solid var(--line);border-radius:8px;padding:6px 11px;cursor:pointer;font-family:inherit;font-size:13px;color:var(--ink);">↑ <span>${resource.votes}</span></button><button type="button" data-community-save style="display:flex;align-items:center;gap:6px;background:var(--paper2);border:1px solid var(--line);border-radius:8px;padding:6px 11px;cursor:pointer;font-family:inherit;font-size:13px;color:var(--gold);">♡ Save</button><button type="button" data-community-add style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;background:none;border:1px solid var(--line);border-radius:8px;padding:6px 10px;cursor:pointer;font-family:inherit;font-size:13px;color:var(--ink);white-space:nowrap;">+ Add to Library</button></div>
        </article>`).join("")}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        ${panel(vm.history.label, `<strong style="font-family:'Cormorant Garamond',serif;font-size:22px;">${html(vm.history.title)}</strong><small style="display:block;color:var(--gold);margin:4px 0;">${html(vm.history.year)}</small><p style="line-height:1.45;color:#33405a;">${html(vm.history.summary)}</p><small style="color:var(--muted);">${html(vm.history.source)}</small>`, { icon: "☼" })}
        ${panel("Sharing Guidance", vm.guidance.map((item) => `<div style="padding:9px 0;border-top:1px solid var(--line);">${html(item)}</div>`).join(""), { icon: "✥" })}
      </div>
      <div data-community-share-panel hidden style="position:fixed;inset:0;z-index:75;background:rgba(10,20,40,.55);align-items:center;justify-content:center;padding:24px;">
        <div style="background:var(--cream);border:1px solid var(--gold);border-radius:16px;width:min(520px,100%);box-shadow:0 20px 60px rgba(10,20,40,.4);">
          <div style="padding:20px 24px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:12px;"><div><h2 style="font-family:'Cormorant Garamond',serif;margin:0;font-size:26px;">Share a Resource</h2><small style="color:var(--muted);">Bless another homeschool family with what has helped yours.</small></div><button type="button" data-community-share-close style="border:none;background:none;color:var(--muted);font-size:22px;cursor:pointer;">x</button></div>
          <div style="padding:22px 24px;display:grid;gap:12px;">${setupInput("Title", "community.title")}${setupInput("Link", "community.url")}${setupInput("Category", "community.category")}${setupInput("Tags", "community.tags")}<label style="display:grid;gap:5px;color:var(--gold);font-size:12px;letter-spacing:.12em;text-transform:uppercase;">Description<textarea name="community.desc" rows="3" style="border:1px solid var(--line);border-radius:9px;padding:10px;background:var(--paper2);font-family:inherit;color:var(--ink);"></textarea></label></div>
          <div style="padding:16px 24px;border-top:1px solid var(--line);display:flex;justify-content:flex-end;gap:11px;"><button type="button" data-community-share-close style="background:var(--paper);border:1px solid var(--line);border-radius:9px;padding:11px 20px;cursor:pointer;font-family:inherit;color:var(--ink);">Cancel</button><button type="button" data-community-submit style="background:var(--navy);border:1px solid var(--gold);border-radius:9px;padding:11px 22px;cursor:pointer;font-family:inherit;color:#f3ead4;">Share with Community</button></div>
        </div>
      </div>
    </section>`;
  return shell(vm, body);
}

function renderCoOp(vm) {
  const body = `
    <section data-screen-label="Co-op" style="display:flex;flex-direction:column;gap:18px;">
      ${panel("Co-op Coming Soon", `<div style="display:grid;grid-template-columns:130px 1fr;gap:22px;align-items:center;"><div style="height:132px;border:1px solid var(--line);border-radius:12px;background:linear-gradient(180deg,#f8f0dd,#efe0ba);display:flex;align-items:center;justify-content:center;color:var(--gold);font-size:54px;">◎</div><div><small style="color:var(--gold);letter-spacing:.16em;text-transform:uppercase;">Future Learn Add-On</small><h2 style="font-family:'Cormorant Garamond',serif;font-size:34px;margin:8px 0 6px;">Co-op tools are coming soon</h2><p style="margin:0;color:#34405a;line-height:1.5;max-width:760px;">For launch, AGAPAY Learn is focused on household setup, planning, calendar rhythms, print packs, reports, books, and revenue-ready subscription limits. Co-op creation, invitations, shared schedules, and member management will return after the core product is generating traction.</p></div></div>`, { icon: "◎" })}
      <div style="display:grid;grid-template-columns:repeat(3,minmax(180px,1fr));gap:16px;">
        ${panel("Planned Later", `<div style="padding:8px 0;border-top:1px solid var(--line);">Create or join a co-op</div><div style="padding:8px 0;border-top:1px solid var(--line);">Invite AGAPAY member families</div><div style="padding:8px 0;border-top:1px solid var(--line);">Shared schedules and rotation</div>`, { icon: "▣" })}
        ${panel("Launch Focus", `<div style="padding:8px 0;border-top:1px solid var(--line);">Parent setup flow</div><div style="padding:8px 0;border-top:1px solid var(--line);">Planner and print center</div><div style="padding:8px 0;border-top:1px solid var(--line);">Reports and paid household limits</div>`, { icon: "✥" })}
        ${panel("Status", `<strong style="font-family:'Cormorant Garamond',serif;font-size:26px;">Coming Soon</strong><small style="display:block;color:var(--muted);margin-top:6px;">This tab is intentionally parked for the first revenue-focused launch.</small>`, { icon: "♢" })}
      </div>
    </section>`;
  return shell(vm, body);
}

function setupInput(label, name, value = "", options = {}) {
  const type = options.type || "text";
  const step = options.step ? ` step="${html(options.step)}"` : "";
  return `<label style="display:grid;gap:5px;color:var(--gold);font-size:12px;letter-spacing:.12em;text-transform:uppercase;">${html(label)}<input name="${html(name)}" type="${html(type)}"${step} value="${html(value)}" style="min-width:0;border:1px solid var(--line);border-radius:9px;padding:10px;background:var(--paper2);font-family:inherit;color:var(--ink);" /></label>`;
}

function setupSelect(label, name, value, options) {
  return `<label style="display:grid;gap:5px;color:var(--gold);font-size:12px;letter-spacing:.12em;text-transform:uppercase;">${html(label)}<select name="${html(name)}" style="min-width:0;border:1px solid var(--line);border-radius:9px;padding:10px;background:var(--paper2);font-family:inherit;color:var(--ink);">${options.map((option) => { const optionValue = typeof option === "object" && option !== null && "value" in option ? option.value : option; const optionLabel = typeof option === "object" && option !== null && "label" in option ? option.label : option; return `<option value="${html(optionValue)}" ${optionValue === value ? "selected" : ""}>${html(optionLabel)}</option>`; }).join("")}</select></label>`;
}

function setupTermOptions(terms = [], fallbackTerm = {}) {
  const source = terms.length ? terms : [fallbackTerm];
  return source.map((term, index) => ({
    value: term.id || `term_${index + 1}`,
    label: term.label || `Term ${index + 1}`
  }));
}

function termSetupRow(term = {}, index = 0) {
  const termId = term.id || `term_${index + 1}`;
  return `<div data-setup-row="terms" data-id="${html(termId)}" style="display:grid;grid-template-columns:1fr .75fr .75fr auto auto;gap:10px;align-items:end;border:1px solid var(--line);border-radius:12px;background:var(--paper2);padding:12px;"><input type="hidden" name="id" value="${html(termId)}" />${setupInput("Term name", "label", term.label || `Term ${index + 1}`)}${setupInput("Start", "startDate", term.startDate || "", { type: "date" })}${setupInput("End", "endDate", term.endDate || "", { type: "date" })}<button type="button" data-close-term="${html(termId)}" style="align-self:end;border:1px solid var(--gold);background:#fbf2dd;color:var(--ink);border-radius:9px;padding:10px 12px;font-family:inherit;font-weight:700;">Close Term</button>${setupRemoveButton()}</div>`;
}

function setupRemoveButton() {
  return `<button type="button" data-setup-remove-row aria-label="Remove row" style="align-self:end;border:1px solid var(--line);background:var(--paper);color:var(--burgundy);border-radius:9px;padding:10px 12px;font-family:inherit;">Remove</button>`;
}

const formOptions = [
  "Little Ones",
  "Form I",
  "Form II",
  "Form III",
  "Form IV",
  "Form V"
];

const homeschoolMethodOptions = [
  "Charlotte Mason",
  "Orthodox Classical",
  "Eclectic"
];

const subjectTypeOptions = [
  { value: "morning-time", label: "Morning Time" },
  { value: "catechesis", label: "Catechesis" },
  { value: "enrichment-recitation", label: "Enrichment & Recitation" },
  { value: "tales", label: "Tales" },
  { value: "literature", label: "Literature" },
  { value: "language-arts", label: "Language Arts" },
  { value: "history", label: "History" },
  { value: "geography", label: "Geography" },
  { value: "math", label: "Math" },
  { value: "sciences-nature", label: "Sciences & Nature" },
  { value: "custom", label: "Custom" }
];

const graceModeOptions = [
  { value: "keep", label: "Keep in Grace Mode" },
  { value: "reduce first", label: "Reduce first" },
  { value: "bump if needed", label: "Defer if needed" }
];

const planningModeOptions = [
  { value: "family", label: "Family-Based" },
  { value: "forms", label: "Forms-Based" }
];

const weeklyFrequencyOptions = [
  { value: "daily", label: "Daily" },
  { value: "4x", label: "4x / week" },
  { value: "3x", label: "3x / week" },
  { value: "2x", label: "2x / week" },
  { value: "1x", label: "1x / week" },
  { value: "as-needed", label: "As needed" }
];

const colorChoices = [
  "#14294a",
  "#6e2f2a",
  "#4a5a31",
  "#b5942f",
  "#4b3158",
  "#34507a",
  "#7f3f2a",
  "#2f5f5b",
  "#7b496f",
  "#8a6a2f",
  "#3f4f73",
  "#9a3f45"
];

function setupColorSelect(label, name, value = colorChoices[0]) {
  const resolved = /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : colorChoices[0];
  return `<label class="learn-color-field" style="display:grid;gap:5px;color:var(--gold);font-size:12px;letter-spacing:.12em;text-transform:uppercase;">${html(label)}<span style="display:flex;gap:8px;align-items:center;"><input name="${html(name)}" type="color" value="${html(resolved)}" list="learnColorChoices" style="width:44px;height:40px;flex:0 0 auto;border:1px solid var(--line);border-radius:9px;padding:3px;background:var(--paper2);"><input name="${html(name)}Hex" type="text" value="${html(resolved)}" pattern="#[0-9A-Fa-f]{6}" style="min-width:0;flex:1;border:1px solid var(--line);border-radius:9px;padding:10px;background:var(--paper2);font-family:inherit;color:var(--ink);"><span data-color-preview style="width:34px;height:34px;border-radius:50%;background:${html(resolved)};border:1px solid var(--goldsoft);"></span></span><datalist id="learnColorChoices">${colorChoices.map((color) => `<option value="${html(color)}"></option>`).join("")}</datalist></label>`;
}

function childSetupRow(child = {}) {
  return `<div data-setup-row="children" data-id="${html(child.id || "")}" style="display:grid;grid-template-columns:44px 1.05fr .62fr .8fr .9fr auto;gap:10px;align-items:end;border:1px solid var(--line);border-radius:12px;background:var(--paper2);padding:12px;"><span style="width:38px;height:38px;border-radius:50%;background:${html(child.color || colorChoices[0])};color:#f3ead4;display:flex;align-items:center;justify-content:center;font-family:'Cormorant Garamond',serif;font-size:18px;">${html((child.firstName || child.name || "C").charAt(0))}</span>${setupInput("Child name", "firstName", child.firstName || child.name || "")}${setupInput("Age", "ageYears", child.age || "", { type: "number" })}${setupSelect("Form", "formLabel", child.formLabel || child.form || "", formOptions)}${setupColorSelect("Color", "color", child.color || colorChoices[0])}${setupRemoveButton()}</div>`;
}

function subjectSetupRow(subject = {}, children = [], terms = [], currentTermId = "") {
  return `<div data-setup-row="subjects" data-id="${html(subject.id || "")}" style="display:grid;grid-template-columns:1fr .8fr .75fr 1fr .55fr .55fr .55fr .55fr .65fr auto;gap:10px;align-items:end;border:1px solid var(--line);border-radius:12px;background:var(--paper2);padding:12px;">${setupInput("Subject / skill", "title", subject.title || "")}${setupSelect("School-day area", "subjectType", subject.subjectType || subject.type || "language-arts", subjectTypeOptions)}${setupSelect("Planning Mode", "planningMode", subject.planningMode || "forms", planningModeOptions)}${setupInput("Book / curriculum / source", "resource", subject.resource || "")}${setupSelect("Track by", "progressionType", subject.progressionType || "lessons", ["lessons", "chapters", "pages", "units"])}${setupInput("Start", "startNumber", subject.startNumber || "", { type: "number" })}${setupInput("Done", "currentNumber", subject.currentNumber || subject.startNumber || "", { type: "number" })}${setupInput("End", "endNumber", subject.endNumber || "", { type: "number" })}${setupInput("Minutes", "minutes", subject.minutes || "", { type: "number" })}${setupRemoveButton()}<div style="grid-column:1 / -1;display:grid;grid-template-columns:repeat(8,minmax(120px,1fr));gap:10px;">${setupSelect("Term", "termId", subject.termId || currentTermId, setupTermOptions(terms, { id: currentTermId, label: "Current Term" }))}${setupSelect("Form", "formLabel", subject.formLabel || "", [{ value: "", label: "All Forms" }, ...formOptions])}${setupSelect("Frequency", "weeklyFrequency", subject.weeklyFrequency || subject.cadenceLabel || "daily", weeklyFrequencyOptions)}${setupSelect("Specific child", "childId", subject.childId || "", [{ value: "", label: "Use Planning Mode" }, ...children.map((child) => ({ value: child.id, label: child.name }))])}${setupInput("Credits", "credits", subject.credits || "", { type: "number", step: "0.25" })}${setupInput("Final mark", "finalGradeOverride", subject.finalGradeOverride || "")}${setupColorSelect("Planner Color", "color", subject.color || colorChoices[0])}${setupSelect("Grace Mode behavior", "gracePriority", subject.gracePriority || "keep", graceModeOptions)}${setupInput("Grace Mode note", "graceNote", subject.graceNote || "Deferred gracefully to the reserve list.")}</div></div>`;
}

function bookSetupRow(book = {}, terms = [], currentTermId = "") {
  return `<div data-setup-row="books" data-id="${html(book.id || "")}" style="display:grid;grid-template-columns:1.1fr .9fr .7fr .75fr .55fr .55fr .55fr .75fr auto;gap:10px;align-items:end;border:1px solid var(--line);border-radius:12px;background:var(--paper2);padding:12px;">${setupInput("Title", "title", book.title || "")}${setupInput("Author", "author", book.author || "")}${setupInput("Category", "category", book.category || "")}${setupSelect("Planning Mode", "planningMode", book.planningMode || (book.formLabel ? "forms" : "family"), planningModeOptions)}${setupInput("Start Ch.", "startChapter", book.startChapter || "", { type: "number" })}${setupInput("Done Ch.", "currentChapter", book.currentChapter || book.startChapter || "", { type: "number" })}${setupInput("End Ch.", "endChapter", book.endChapter || book.totalChapters || "", { type: "number" })}${setupColorSelect("Planner Color", "color", book.color || colorChoices[2])}${setupRemoveButton()}<div style="grid-column:1 / -1;display:grid;grid-template-columns:repeat(5,minmax(120px,1fr));gap:10px;">${setupSelect("Term", "termId", book.termId || currentTermId, setupTermOptions(terms, { id: currentTermId, label: "Current Term" }))}${setupSelect("Form", "formLabel", book.formLabel || "", [{ value: "", label: "All Forms" }, ...formOptions])}${setupSelect("Frequency", "weeklyFrequency", book.weeklyFrequency || "daily", weeklyFrequencyOptions)}${setupSelect("Audience", "audienceLabel", book.audienceLabel || "Household", ["Household", "Morning Basket", "Independent", "Read-Aloud"])}${setupInput("Minutes", "minutes", book.minutes || "20", { type: "number" })}${setupInput("Grace Note", "graceNote", book.graceNote || "Reading moved into the reserve basket.")}</div></div>`;
}

function formationSetupRow(material = {}, terms = [], currentTermId = "") {
  return `<div data-setup-row="formationMaterials" data-id="${html(material.id || "")}" style="display:grid;grid-template-columns:1.1fr .75fr 1fr .75fr .65fr .75fr .8fr auto;gap:10px;align-items:end;border:1px solid var(--line);border-radius:12px;background:var(--paper2);padding:12px;">${setupInput("Material", "title", material.title || "")}${setupSelect("Preset", "materialType", material.materialType || "Catechesis", ["Catechesis", "Art Study", "Poetry", "Music Study"])}${setupInput("Source", "source", material.source || "")}${setupSelect("Planning Mode", "planningMode", material.planningMode || "family", planningModeOptions)}${setupSelect("Frequency", "weeklyFrequency", material.weeklyFrequency || material.cadence || "1x", weeklyFrequencyOptions)}${setupSelect("Term", "termId", material.termId || currentTermId, setupTermOptions(terms, { id: currentTermId, label: "Current Term" }))}${setupInput("Minutes", "minutes", material.minutes || "", { type: "number" })}${setupColorSelect("Term Color", "color", material.color || colorChoices[3])}${setupRemoveButton()}</div>`;
}

function formationRhythmSetupRow(rhythm = {}) {
  return `<div data-setup-row="formationRhythms" data-id="${html(rhythm.id || "")}" style="display:grid;grid-template-columns:1fr 1.15fr .65fr .45fr auto;gap:10px;align-items:end;border:1px solid var(--line);border-radius:12px;background:var(--paper2);padding:12px;">${setupInput("Rhythm", "title", rhythm.title || "")}${setupInput("Note", "note", rhythm.note || "")}${setupSelect("Frequency", "weeklyFrequency", rhythm.weeklyFrequency || rhythm.cadenceLabel || rhythm.cadence || "daily", weeklyFrequencyOptions)}${setupInput("Minutes", "minutes", rhythm.minutes || rhythm.minutesPlanned || "", { type: "number" })}${setupRemoveButton()}</div>`;
}

function formationRecitationSetupRow(track = {}) {
  return `<div data-setup-row="formationRecitation" data-id="${html(track.id || "")}" style="display:grid;grid-template-columns:1fr .75fr .75fr .65fr .55fr .45fr auto;gap:10px;align-items:end;border:1px solid var(--line);border-radius:12px;background:var(--paper2);padding:12px;">${setupInput("Memory Work", "title", track.title || "")}${setupInput("Source", "sourceKind", track.sourceKind || track.source || "")}${setupSelect("Planning Mode", "planningMode", track.planningMode || "family", planningModeOptions)}${setupSelect("Frequency", "weeklyFrequency", track.weeklyFrequency || "daily", weeklyFrequencyOptions)}${setupInput("Minutes", "minutes", track.minutes || "", { type: "number" })}${setupSelect("Status", "status", track.status || "memorizing", ["planned", "memorizing", "memorized"])}${setupInput("Progress %", "progressPercent", track.progressPercent ?? track.progress ?? "", { type: "number" })}${setupRemoveButton()}</div>`;
}

function formationEnrichmentSetupRow(block = {}) {
  return `<div data-setup-row="formationEnrichment" data-id="${html(block.id || "")}" style="display:grid;grid-template-columns:.85fr 1fr .75fr .65fr .45fr .75fr auto;gap:10px;align-items:end;border:1px solid var(--line);border-radius:12px;background:var(--paper2);padding:12px;">${setupSelect("Formation card", "blockType", block.blockType || block.type || "Art Study", ["Recitation & Memory Work", "Hymn Study", "Art Study", "Nature Study", "Poetry", "Music Study", "Composer", "Timeline", "Saints & Feasts"])}${setupInput("Title", "title", block.title || "")}${setupSelect("Planning Mode", "planningMode", block.planningMode || "family", planningModeOptions)}${setupSelect("Frequency", "weeklyFrequency", block.weeklyFrequency || block.cadenceLabel || block.cadence || "1x", weeklyFrequencyOptions)}${setupInput("Minutes", "minutesPlanned", block.minutesPlanned || block.minutes || "", { type: "number" })}${setupColorSelect("Planner Color", "color", block.color || colorChoices[2])}${setupRemoveButton()}</div>`;
}

function churchRhythmSetupPanel(vm) {
  const formation = vm.formationSetup || {};
  const sectionStyle = "border:1px solid var(--line);border-radius:13px;background:rgba(255,252,245,.64);padding:14px;display:grid;gap:12px;";
  const sectionTitle = (title, subtitle = "") => `<div><strong style="display:block;font-family:var(--sans);font-size:15px;color:var(--ink);">${html(title)}</strong>${subtitle ? `<small style="display:block;color:var(--muted);line-height:1.35;margin-top:2px;">${html(subtitle)}</small>` : ""}</div>`;
  return `
    <div style="display:grid;gap:14px;">
      <p style="margin:0;color:var(--muted);line-height:1.45;">This is the household's daily Church anchor. It lives above school subjects because it shapes the day before lesson planning begins.</p>
      <div style="${sectionStyle}">
        ${sectionTitle("Daily rhythm items", "Prayer, Gospel, Epistle, saints, feasts, and fasting notes.")}
        <div data-setup-list="formationRhythms" style="display:grid;gap:10px;">${(formation.churchRhythms?.length ? formation.churchRhythms : [{}]).map((rhythm) => formationRhythmSetupRow(rhythm)).join("")}</div>
        <button type="button" data-setup-add-row="formationRhythms" style="border:1px solid var(--line);background:var(--paper2);border-radius:10px;padding:10px 16px;font-family:inherit;">Add Church Rhythm</button>
      </div>
    </div>`;
}

function formationSetupPanel(vm) {
  const formation = vm.formationSetup || {};
  const sectionStyle = "border:1px solid var(--line);border-radius:13px;background:rgba(255,252,245,.64);padding:14px;display:grid;gap:12px;";
  const sectionTitle = (title, subtitle = "") => `<div><strong style="display:block;font-family:var(--sans);font-size:15px;color:var(--ink);">${html(title)}</strong>${subtitle ? `<small style="display:block;color:var(--muted);line-height:1.35;margin-top:2px;">${html(subtitle)}</small>` : ""}</div>`;
  const categoryTiles = [
    { title: "Recitation & Memory Work", detail: "Creeds, prayers, psalms, Scripture, poetry, and speeches." },
    { title: "Hymn Study", detail: "Troparia, kontakia, festal hymns, and music study." },
    { title: "Saints & Feasts", detail: "Household-highlighted commemorations and seasonal focus." },
    { title: "Enrichment", detail: "Art, poetry, music, nature, composer, and timeline work." },
    { title: "Formation Materials", detail: "Books, PDFs, links, icons, and term resources." }
  ];
  return `
    <div style="display:grid;gap:14px;">
      <p style="margin:0;color:var(--muted);line-height:1.45;">Choose whether each item is shared by the whole family or assigned by Form, then set how often it appears and how long it usually takes.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;">
        ${categoryTiles.map((tile) => `<span style="border:1px solid var(--line);border-radius:10px;background:var(--paper2);padding:10px;"><strong>${html(tile.title)}</strong><small style="display:block;color:var(--muted);">${html(tile.detail)}</small></span>`).join("")}
      </div>
      <div style="${sectionStyle}">
        ${sectionTitle("Recitation & Memory Work", "Creeds, prayers, psalms, and scripture memory.")}
        <div data-setup-list="formationRecitation" style="display:grid;gap:10px;">${(formation.recitationTracks?.length ? formation.recitationTracks : [{}]).map((track) => formationRecitationSetupRow(track)).join("")}</div>
        <button type="button" data-setup-add-row="formationRecitation" style="border:1px solid var(--line);background:var(--paper2);border-radius:10px;padding:10px 16px;font-family:inherit;">Add Memory Work</button>
      </div>
      <div style="${sectionStyle}">
        ${sectionTitle("Enrichment", "Art, poetry, music, nature study, composer, and timeline work.")}
        <div data-setup-list="formationEnrichment" style="display:grid;gap:10px;">${(formation.enrichmentBlocks?.length ? formation.enrichmentBlocks : [{}]).map((block) => formationEnrichmentSetupRow(block)).join("")}</div>
        <button type="button" data-setup-add-row="formationEnrichment" style="border:1px solid var(--line);background:var(--paper2);border-radius:10px;padding:10px 16px;font-family:inherit;">Add Enrichment</button>
      </div>
      <div style="${sectionStyle}">
        ${sectionTitle("Formation Materials", "Optional term materials that seed catechesis, art, poetry, music, saints, and other Formation cards.")}
        <div data-setup-list="formationMaterials" style="display:grid;gap:10px;">${(vm.formationMaterials?.length ? vm.formationMaterials : [{}]).map((material) => formationSetupRow(material, vm.terms, vm.schoolYear.currentTermId || vm.term.id)).join("")}</div>
        <button type="button" data-setup-add-row="formationMaterials" style="border:1px solid var(--line);background:var(--paper2);border-radius:10px;padding:10px 16px;font-family:inherit;">Add Formation Material</button>
      </div>
    </div>`;
}

function setupStepTarget(step) {
  const text = `${step.id || ""} ${step.title || ""}`.toLowerCase();
  if (text.includes("child") || text.includes("form")) return "learnSetupChildren";
  if (text.includes("stream")) return "learnSetupFormation";
  if (text.includes("language") || text.includes("math") || text.includes("science") || text.includes("subject") || text.includes("curriculum")) return "learnSetupSubjects";
  if (text.includes("literature") || text.includes("book") || text.includes("read")) return "learnSetupBooks";
  if (text.includes("church rhythm")) return "learnSetupChurchRhythm";
  if (text.includes("formation") || text.includes("catechesis") || text.includes("enrichment")) return "learnSetupFormation";
  return "learnSetupHousehold";
}

function setupStepState(step) {
  const status = String(step.status || "").toLowerCase();
  if (["complete", "completed", "done"].includes(status)) return "is-complete";
  if (status === "active") return "is-active";
  return "is-needed";
}

function setupProgressCard(step) {
  return `<button type="button" class="learn-setup-step ${setupStepState(step)}" data-setup-progress-target="${setupStepTarget(step)}"><small>${html(step.status)}</small><strong>${html(step.title)}</strong><span>${html(step.summary)}</span></button>`;
}

function renderSetup(vm) {
  const currentTermId = vm.schoolYear.currentTermId || vm.term.id || vm.terms?.[0]?.id || "term_1";
  const body = `
    <form data-setup-form data-screen-label="Set Up" style="display:flex;flex-direction:column;gap:18px;">
      ${panel("Setup Progress", `<h2 style="font-family:'Cormorant Garamond',serif;margin:0 0 8px;font-size:28px;">Step ${vm.progress.current} of ${vm.progress.total}</h2>${bar((vm.progress.current / vm.progress.total) * 100, "var(--navy)")}<p style="color:var(--muted);">Next: ${html(vm.progress.next)}</p><div class="learn-setup-progress-grid">${vm.steps.map(setupProgressCard).join("")}</div>`, { icon: "⚙" })}
      ${panel("A Typical Orthodox School Day", `<div style="display:grid;grid-template-columns:repeat(4,minmax(170px,1fr));gap:12px;"><div style="border:1px solid var(--line);border-radius:12px;background:var(--paper2);padding:13px;"><strong>1. Household + Forms</strong><small style="display:block;color:var(--muted);margin-top:5px;line-height:1.35;">Set the year, terms, children, and Forms before adding lessons.</small></div><div style="border:1px solid var(--line);border-radius:12px;background:var(--paper2);padding:13px;"><strong>2. Church Rhythm</strong><small style="display:block;color:var(--muted);margin-top:5px;line-height:1.35;">Prayer, Gospel, Epistle, saints, feasts, and fasting shape the day.</small></div><div style="border:1px solid var(--line);border-radius:12px;background:var(--paper2);padding:13px;"><strong>3. Enrichment</strong><small style="display:block;color:var(--muted);margin-top:5px;line-height:1.35;">Memory work, art, poetry, music, nature, and formation materials.</small></div><div style="border:1px solid var(--line);border-radius:12px;background:var(--paper2);padding:13px;"><strong>4. Form Work</strong><small style="display:block;color:var(--muted);margin-top:5px;line-height:1.35;">Tales, literature, language arts, history, geography, math, and sciences.</small></div></div>`, { icon: "✥" })}
      <span id="learnSetupHousehold" class="learn-setup-anchor"></span>
      ${panel("Household", `<p style="margin:0 0 12px;color:var(--muted);line-height:1.45;">Set the household identity and the broad school-year preferences. Terms, children, and Forms are managed immediately below so the setup flow stays easy to scan.</p><div style="display:grid;grid-template-columns:1.1fr .9fr .9fr;gap:12px;">${setupInput("Household name", "household.name", vm.household.name)}${setupInput("Parish", "household.parishName", vm.household.parish)}${setupSelect("Method", "household.primaryMethod", vm.household.method || "Charlotte Mason", homeschoolMethodOptions)}${setupInput("School year", "schoolYear.label", vm.schoolYear.label)}${setupInput("Year start", "schoolYear.startDate", vm.schoolYear.startDate, { type: "date" })}${setupInput("Year end", "schoolYear.endDate", vm.schoolYear.endDate, { type: "date" })}${setupSelect("Current term", "schoolYear.currentTermId", currentTermId, setupTermOptions(vm.terms, vm.term))}${setupSelect("Church calendar", "preferences.calendarType", vm.preferences.calendarType, vm.calendarOptions)}${setupSelect("Evaluation", "preferences.evaluationModel", vm.preferences.evaluationModel, vm.evaluationModels)}<input name="preferences.graceModeActive" type="hidden" value="${vm.preferences.graceModeActive ? "true" : "false"}" /><input name="preferences.graceModeDefault" type="hidden" value="${html(vm.preferences.graceModeDefault || "light")}" /></div>`, { icon: "⌂", largeTitle: true })}
      <span id="learnSetupChildren" class="learn-setup-anchor"></span>
      ${panel("Children & Forms", `<p style="margin:0 0 12px;color:var(--muted);">Assign each child a Form and color. Forms are the grouping layer for Planner and Print, especially for larger households.</p><div data-setup-list="children" style="display:grid;gap:10px;">${(vm.children.length ? vm.children : [{}]).map((child) => childSetupRow(child)).join("")}</div><button type="button" data-setup-add-row="children" style="margin-top:12px;width:100%;border:1px solid var(--line);background:var(--paper2);border-radius:10px;padding:10px;font-family:inherit;">Add Child</button>`, { icon: "◎", largeTitle: true })}
      ${panel("Terms", `<p style="margin:0 0 12px;color:var(--muted);line-height:1.45;">Term 4 / Summer is available for year-round homeschoolers. Assign subjects, books, and formation materials to the term where they belong.</p><div style="display:flex;justify-content:flex-end;margin-bottom:10px;"><button type="button" data-setup-add-row="terms" style="border:1px solid var(--line);background:var(--paper2);border-radius:10px;padding:10px 16px;font-family:inherit;">Add Term</button></div><div data-setup-list="terms" style="display:grid;gap:10px;">${(vm.terms?.length ? vm.terms : [vm.term]).map((term, index) => termSetupRow(term, index)).join("")}</div>`, { icon: "◷", largeTitle: true })}
      <span id="learnSetupChurchRhythm" class="learn-setup-anchor"></span>
      ${panel("Church Rhythm", churchRhythmSetupPanel(vm), { icon: "☩", largeTitle: true })}
      <span id="learnSetupFormation" class="learn-setup-anchor"></span>
      ${panel("Enrichment", formationSetupPanel(vm), { icon: "✥", largeTitle: true })}
      <span id="learnSetupBooks" class="learn-setup-anchor"></span>
      ${panel("Literature", `<p style="margin:0 0 12px;color:var(--muted);">Add living books, read-alouds, stories, plays, history reads, folk stories, myths, and great tales. Assign each book to the term and Form where it belongs.</p><div data-setup-list="books" style="display:grid;gap:10px;">${(vm.books.length ? vm.books : [{}]).map((book) => bookSetupRow(book, vm.terms, currentTermId)).join("")}</div><button type="button" data-setup-add-row="books" style="margin-top:12px;border:1px solid var(--line);background:var(--paper2);border-radius:10px;padding:10px 16px;font-family:inherit;">Add Literature</button>`, { icon: "☰" })}
      <span id="learnSetupSubjects" class="learn-setup-anchor"></span>
      ${panel("Form Subjects", `<p style="margin:0 0 12px;color:var(--muted);">Use one list for term-based subject work. Each row can be assigned by Form, child, term, range, credits, final mark, and Grace Mode behavior.</p><div style="display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:10px;margin-bottom:12px;"><span style="border:1px solid var(--line);border-radius:10px;background:rgba(255,252,245,.64);padding:14px;"><strong style="display:block;font-family:var(--sans);font-size:15px;color:var(--ink);">Tales & Literature</strong><small style="display:block;color:var(--muted);line-height:1.35;margin-top:2px;">Living books, stories, plays, folk tales, myths, and great tales.</small></span><span style="border:1px solid var(--line);border-radius:10px;background:rgba(255,252,245,.64);padding:14px;"><strong style="display:block;font-family:var(--sans);font-size:15px;color:var(--ink);">Language Arts</strong><small style="display:block;color:var(--muted);line-height:1.35;margin-top:2px;">Reading, narration, copywork, dictation, grammar, composition, and rhetoric.</small></span><span style="border:1px solid var(--line);border-radius:10px;background:rgba(255,252,245,.64);padding:14px;"><strong style="display:block;font-family:var(--sans);font-size:15px;color:var(--ink);">History & Geography</strong><small style="display:block;color:var(--muted);line-height:1.35;margin-top:2px;">Books, maps, PDFs, links, narrations, and term projects.</small></span><span style="border:1px solid var(--line);border-radius:10px;background:rgba(255,252,245,.64);padding:14px;"><strong style="display:block;font-family:var(--sans);font-size:15px;color:var(--ink);">Math, Sciences & Nature</strong><small style="display:block;color:var(--muted);line-height:1.35;margin-top:2px;">Lesson ranges, experiments, nature study, and progress tracking.</small></span></div><div data-setup-list="subjects" style="display:grid;gap:10px;">${(vm.subjects.length ? vm.subjects : [{}]).map((subject) => subjectSetupRow(subject, vm.children, vm.terms, currentTermId)).join("")}</div><button type="button" data-setup-add-row="subjects" style="margin-top:12px;border:1px solid var(--line);background:var(--paper2);border-radius:10px;padding:10px 16px;font-family:inherit;">Add Form Subject</button>`, { icon: "✎" })}
      ${panel("Co-op", `<div style="border:1px solid var(--line);border-radius:12px;background:var(--paper2);padding:14px;display:flex;align-items:center;justify-content:space-between;gap:16px;"><div><strong style="font-family:'Cormorant Garamond',serif;font-size:24px;">Coming Soon</strong><p style="margin:4px 0 0;color:var(--muted);line-height:1.4;">Co-op creation and member management are intentionally deferred so Learn can launch with the household planner, reports, print packs, and paid limits first.</p></div><span style="border:1px solid var(--gold);border-radius:999px;color:var(--gold);padding:7px 12px;white-space:nowrap;">Future add-on</span></div>`, { icon: "◎" })}
      <div style="position:sticky;bottom:12px;z-index:5;display:flex;justify-content:space-between;gap:12px;align-items:center;border:1px solid var(--line);border-radius:14px;background:rgba(253,249,239,.96);padding:12px 14px;box-shadow:0 8px 24px rgba(18,38,67,.12);">
        <span data-setup-status style="color:var(--muted);">Setup saves to the household profile and D1-backed Learn records.</span>
        <button type="submit" style="border:none;background:var(--navy);color:#fff;border-radius:10px;padding:12px 20px;font-family:inherit;font-weight:700;">Save Setup</button>
      </div>
    </form>`;
  return shell(vm, body);
}

function renderPrintCenter(vm) {
  const householdTemplates = vm.templates.filter((template) => template.audience === "mom" || template.audience === "household");
  const childTemplates = vm.templates.filter((template) => template.audience === "child");
  const freePlan = !isLearnFamilyPlan();
  const remaining = Math.max(0, vm.billing.printLimit - printCount());
  const accessBadge = (template) => `<span style="width:max-content;border:1px solid ${template.premium ? "var(--gold)" : "var(--line)"};background:${template.premium ? "#fbf2dd" : "#edf6ef"};color:${template.premium ? "var(--gold)" : "#365f3b"};border-radius:999px;padding:4px 9px;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">${template.premium ? "Family Plan" : "Free"}</span>`;
  const templateCard = (template) => `<article data-print-template="${html(template.id)}" data-print-premium="${template.premium ? "true" : "false"}" style="border:1px solid ${template.premium ? "var(--gold)" : "var(--line)"};border-radius:10px;background:${template.premium && freePlan ? "#fff8e8" : "var(--paper2)"};padding:14px;display:flex;flex-direction:column;gap:8px;box-shadow:${template.premium && freePlan ? "inset 0 0 0 1px rgba(181,148,47,.18)" : "none"};"><div style="display:flex;justify-content:space-between;gap:10px;align-items:start;"><small style="display:block;color:var(--gold);letter-spacing:.12em;text-transform:uppercase;">${html(template.type)}</small>${accessBadge(template)}</div><strong style="display:block;">${html(template.title)}</strong><span style="display:block;color:var(--muted);line-height:1.35;">${html(template.description)}</span><button type="button" data-print-generate="${html(template.id)}" style="margin-top:auto;border:1px solid ${template.premium && freePlan ? "var(--gold)" : "var(--line)"};background:${template.premium && freePlan ? "#f3ead4" : "var(--navy)"};color:${template.premium && freePlan ? "var(--ink)" : "#fff"};border-radius:9px;padding:9px 12px;font-family:inherit;cursor:pointer;font-weight:700;">${template.premium && freePlan ? "Upgrade to Print" : "Generate PDF"}</button></article>`;
  const body = `
    <section data-screen-label="Print Center" style="display:flex;flex-direction:column;gap:18px;">
      <div style="border:1px solid ${freePlan && (vm.billing.childCount > 2 || remaining === 0) ? "var(--gold)" : "var(--line)"};background:var(--paper);border-radius:14px;padding:16px;display:flex;align-items:center;justify-content:space-between;gap:16px;">
        <div><strong style="font-family:'Cormorant Garamond',serif;font-size:23px;">${freePlan ? "Free Print Access" : "Family Plan Active"}</strong><small style="display:block;color:var(--muted);margin-top:3px;">${freePlan ? `${remaining} of ${vm.billing.printLimit} basic household prints remaining. Family plan unlocks child sheets, term packs, and larger households.` : "Unlimited Learn printing is unlocked for this household."}</small></div>
        ${freePlan ? `<button type="button" data-print-upgrade style="background:var(--navy);color:#fff;border:1px solid var(--gold);border-radius:10px;padding:11px 18px;font-family:inherit;cursor:pointer;">Upgrade Family Plan</button>` : `<span style="color:var(--gold);font-weight:700;">Unlocked</span>`}
      </div>
      <div style="display:grid;grid-template-columns:1fr 330px;gap:16px;align-items:start;">
        ${panel("Print Packs", `<div style="display:grid;grid-template-columns:repeat(2,minmax(220px,1fr));gap:12px;">${householdTemplates.map(templateCard).join("")}</div>`, { icon: "▤" })}
        ${panel("Draft Job", `<strong style="font-family:'Cormorant Garamond',serif;font-size:24px;">${html(vm.job.status)}</strong><div style="margin-top:8px;color:var(--muted);line-height:1.55;">${html(vm.term.label)}<br>${html(vm.term.week)}<br>${html(vm.job.range)} · ${html(vm.job.format)}</div><button type="button" data-print-generate="weekly-pack" style="margin-top:14px;width:100%;background:var(--navy);color:#fff;border:none;border-radius:10px;padding:11px;font-family:inherit;cursor:pointer;">Generate Print Pack</button>`, { icon: "✒" })}
      </div>
      <div style="display:grid;grid-template-columns:1fr 420px;gap:16px;align-items:start;">
        ${panel("Child Sheets", `<div style="display:grid;grid-template-columns:repeat(2,minmax(190px,1fr));gap:10px;">${childTemplates.map((template) => `<article data-print-template="${html(template.id)}" data-print-premium="${template.premium ? "true" : "false"}" style="border:1px solid ${template.premium ? "var(--gold)" : "var(--line)"};border-radius:10px;background:${template.premium && freePlan ? "#fff8e8" : "var(--paper2)"};padding:11px;display:grid;grid-template-columns:34px 1fr;gap:10px;align-items:flex-start;"><span style="width:34px;height:34px;border-radius:50%;background:${template.color};color:#f3ead4;display:flex;align-items:center;justify-content:center;">${html(template.child.charAt(0) || "C")}</span><span><span style="display:flex;justify-content:space-between;gap:8px;align-items:start;"><strong>${html(template.title)}</strong>${accessBadge(template)}</span><small style="display:block;color:var(--muted);">${html(template.description)}</small><button type="button" data-print-generate="${html(template.id)}" style="margin-top:9px;border:1px solid ${freePlan ? "var(--gold)" : "var(--line)"};background:${freePlan ? "#f3ead4" : "var(--navy)"};color:${freePlan ? "var(--ink)" : "#fff"};border-radius:8px;padding:7px 10px;font-family:inherit;cursor:pointer;font-weight:700;">${freePlan ? "Upgrade to Print" : "Generate PDF"}</button></span></article>`).join("")}</div>`, { icon: "◎" })}
        ${panel("Print Preview", `<div style="border:1px solid var(--line);border-radius:10px;background:#fffaf0;padding:22px;min-height:420px;"><div style="text-align:center;color:var(--gold);font-size:30px;">✥</div><h2 style="font-family:'Cormorant Garamond',serif;text-align:center;margin:8px 0 4px;">${html(vm.document.title)}</h2><p style="text-align:center;color:var(--muted);margin:0 0 16px;">${html(vm.document.subtitle)}</p>${vm.document.sections.map((section) => `<div style="margin-top:14px;"><strong style="color:var(--gold);letter-spacing:.12em;text-transform:uppercase;font-size:12px;">${html(section.title)}</strong>${section.items.map((item) => `<div style="display:flex;justify-content:space-between;gap:12px;border-top:1px solid var(--line);padding:8px 0;"><span><strong>${html(item.label)}</strong><small style="display:block;color:var(--muted);">${html(item.detail)}</small></span><span>${html(item.minutes)}m</span></div>`).join("")}</div>`).join("")}</div>`, { icon: "☰" })}
      </div>
      ${panel("Available Outputs", `<div style="display:grid;grid-template-columns:repeat(2,minmax(220px,1fr));gap:14px;"><div><strong>Household</strong>${vm.outputs.household.map((item) => `<div style="padding:8px 0;border-top:1px solid var(--line);">${html(item)}</div>`).join("")}</div><div><strong>Child</strong>${vm.outputs.child.map((item) => `<div style="padding:8px 0;border-top:1px solid var(--line);">${html(item)}</div>`).join("")}</div></div>`, { icon: "✥" })}
    </section>`;
  return shell(vm, body);
}

async function apiGet(path) {
  const response = await fetch(path, {
    headers: learnRequestHeaders()
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) throw new Error(payload.error || `Request failed with ${response.status}`);
  return payload;
}

async function apiPost(path, body) {
  let response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: learnRequestHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(body)
    });
  } catch {
    throw new Error("Unable to reach AGAPAY Learn. Please refresh, confirm you are still logged in, and try again.");
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) throw new Error(payload.error || `Request failed with ${response.status}`);
  return payload;
}

function rowValue(row, name) {
  const control = row.querySelector(`[name="${name}"]`);
  if (!control) return "";
  if (control.type === "checkbox") return control.checked;
  return control.value.trim();
}

function collectRows(form, rowType, mapper) {
  return [...form.querySelectorAll(`[data-setup-row="${rowType}"]`)]
    .map((row, index) => mapper(row, index))
    .filter(Boolean);
}

async function openSaintOfDay(button) {
  const date = button.dataset.date || "";
  const calendar = button.dataset.calendar || localStorage.getItem("agapay.learn.calendar") || "julian";
  const previousText = button.querySelector("small")?.textContent || "";
  button.disabled = true;
  button.style.cursor = "wait";
  const small = button.querySelector("small");
  if (small) small.textContent = "Loading the lives of the saints...";
  try {
    const payload = await apiGet(`/api/learn/saints?date=${encodeURIComponent(date)}&calendar=${encodeURIComponent(calendar)}`);
    const unavailable = payload.sourceConnected === false
      ? payload.message || "Lives of the Saints are unavailable right now. Please try again later."
      : "";
    const cardSaintTitle = button.querySelector("strong")?.textContent || "";
    const orderedSaints = orderSaintsForCard(payload.saints || [], cardSaintTitle);
    const firstSaintTitle = orderedSaints?.[0]?.name
      || orderedSaints?.[0]?.title
      || cardSaintTitle
      || "Saint of the Day";
    showLearnDialog(
      firstSaintTitle,
      payload.date ? `Saint of the Day · ${payload.date}` : "Today's commemoration",
      [{ label: "Attribution", value: "Lives of the Saints courtesy of Orthocal.info" }],
      {
        width: "760px",
        contentHtml: saintStoryDialogHtml(orderedSaints, unavailable)
      }
    );
  } catch (error) {
    showLearnDialog("Saint of the Day Unavailable", error.message || "Lives of the Saints are unavailable right now. Please try again later.", [
      { label: "Source", value: "Orthocal.info" }
    ]);
  } finally {
    button.disabled = false;
    button.style.cursor = "pointer";
    if (small) small.textContent = previousText;
  }
}

function wireDashboard() {
  root.querySelectorAll("[data-saint-of-day]").forEach((button) => {
    button.addEventListener("click", () => openSaintOfDay(button));
  });

  root.querySelectorAll("[data-grace-mode]").forEach((button) => {
    button.addEventListener("click", async () => {
      const mode = button.dataset.graceMode || "light";
      const status = root.querySelector("[data-grace-mode-status]");
      const calendar = localStorage.getItem("agapay.learn.calendar") || "julian";
      if (status) {
        status.style.color = "var(--muted)";
        status.textContent = "Saving rhythm...";
      }
      root.querySelectorAll("[data-grace-mode]").forEach((item) => {
        item.disabled = true;
        item.style.cursor = "wait";
      });
      try {
        const saved = await apiPost(`/api/learn/grace-mode?calendar=${encodeURIComponent(calendar)}`, {
          mode,
          active: mode !== "full"
        });
        root.innerHTML = renderDashboard(toDashboardViewModel(saved));
        wireDashboard();
        const nextStatus = root.querySelector("[data-grace-mode-status]");
        if (nextStatus) nextStatus.textContent = "Rhythm saved.";
      } catch (error) {
        if (status) {
          status.style.color = "var(--burgundy)";
          status.textContent = error.message;
        }
        root.querySelectorAll("[data-grace-mode]").forEach((item) => {
          item.disabled = false;
          item.style.cursor = "pointer";
        });
      }
    });
  });
}

function setupPayloadFromForm(form) {
  const get = (name) => form.elements[name]?.value?.trim() || "";
  const isChecked = (name) => form.elements[name]?.type === "hidden"
    ? get(name) === "true"
    : Boolean(form.elements[name]?.checked);
  const terms = collectRows(form, "terms", (row, index) => {
    const label = rowValue(row, "label");
    if (!label) return null;
    return {
      id: rowValue(row, "id") || row.dataset.id || `term_${index + 1}`,
      label,
      startDate: rowValue(row, "startDate"),
      endDate: rowValue(row, "endDate"),
      paceMode: "steady"
    };
  });
  const currentTermId = get("schoolYear.currentTermId") || terms[0]?.id || "term_1";
  const currentTerm = terms.find((term) => term.id === currentTermId) || terms[0] || {};
  return {
    household: {
      name: get("household.name"),
      parishName: get("household.parishName"),
      primaryMethod: get("household.primaryMethod")
    },
    schoolYear: {
      label: get("schoolYear.label"),
      startDate: get("schoolYear.startDate"),
      endDate: get("schoolYear.endDate"),
      currentTermId
    },
    term: {
      id: currentTerm.id || currentTermId,
      label: currentTerm.label || "Term 1",
      startDate: currentTerm.startDate || "",
      endDate: currentTerm.endDate || "",
      paceMode: "steady"
    },
    terms,
    preferences: {
      calendarType: get("preferences.calendarType"),
      evaluationModel: get("preferences.evaluationModel"),
      graceModeDefault: get("preferences.graceModeDefault"),
      paceMode: "steady",
      graceModeActive: isChecked("preferences.graceModeActive")
    },
    children: collectRows(form, "children", (row) => {
      const firstName = rowValue(row, "firstName");
      if (!firstName) return null;
      return {
        id: row.dataset.id || "",
        firstName,
        gradeLabel: rowValue(row, "formLabel"),
        formLabel: rowValue(row, "formLabel"),
        ageYears: rowValue(row, "ageYears"),
        color: rowValue(row, "color")
      };
    }),
    streams: collectRows(form, "streams", (row) => {
      const title = rowValue(row, "title");
      if (!title) return null;
      return {
        id: row.dataset.id || "",
        title,
        streamType: rowValue(row, "streamType"),
        cadenceLabel: rowValue(row, "cadenceLabel"),
        dailyMinutes: {
          mon: rowValue(row, "monMinutes"),
          tue: rowValue(row, "tueMinutes"),
          wed: rowValue(row, "wedMinutes"),
          thu: rowValue(row, "thuMinutes"),
          fri: rowValue(row, "friMinutes")
        }
      };
    }),
    subjects: collectRows(form, "subjects", (row) => {
      const title = rowValue(row, "title");
      if (!title) return null;
      return {
        id: row.dataset.id || "",
        title,
        subjectType: rowValue(row, "subjectType"),
        planningMode: rowValue(row, "planningMode"),
        weeklyFrequency: rowValue(row, "weeklyFrequency"),
        cadenceLabel: rowValue(row, "weeklyFrequency"),
        formLabel: rowValue(row, "formLabel"),
        resource: rowValue(row, "resource"),
        minutes: rowValue(row, "minutes"),
        childId: rowValue(row, "childId"),
        progressionType: rowValue(row, "progressionType"),
        startNumber: rowValue(row, "startNumber"),
        currentNumber: rowValue(row, "currentNumber"),
        endNumber: rowValue(row, "endNumber"),
        credits: rowValue(row, "credits"),
        finalGradeOverride: rowValue(row, "finalGradeOverride"),
        color: rowValue(row, "color"),
        termId: rowValue(row, "termId") || currentTermId,
        gracePriority: rowValue(row, "gracePriority"),
        graceNote: rowValue(row, "graceNote")
      };
    }),
    books: collectRows(form, "books", (row) => {
      const title = rowValue(row, "title");
      if (!title) return null;
      return {
        id: row.dataset.id || "",
        title,
        author: rowValue(row, "author"),
        category: rowValue(row, "category"),
        planningMode: rowValue(row, "planningMode"),
        weeklyFrequency: rowValue(row, "weeklyFrequency"),
        minutes: rowValue(row, "minutes"),
        formLabel: rowValue(row, "formLabel"),
        audienceLabel: rowValue(row, "audienceLabel"),
        startChapter: rowValue(row, "startChapter"),
        currentChapter: rowValue(row, "currentChapter"),
        endChapter: rowValue(row, "endChapter"),
        color: rowValue(row, "color"),
        termId: rowValue(row, "termId") || currentTermId,
        graceNote: rowValue(row, "graceNote")
      };
    }),
    formation: {
      churchRhythms: collectRows(form, "formationRhythms", (row) => {
        const title = rowValue(row, "title");
        if (!title) return null;
        return {
          id: row.dataset.id || "",
          title,
          note: rowValue(row, "note"),
          weeklyFrequency: rowValue(row, "weeklyFrequency"),
          cadenceLabel: rowValue(row, "weeklyFrequency"),
          minutes: rowValue(row, "minutes")
        };
      }),
      catechesis: {
        title: get("formation.catechesis.title"),
        currentLesson: get("formation.catechesis.currentLesson"),
        planningMode: get("formation.catechesis.planningMode"),
        weeklyFrequency: get("formation.catechesis.weeklyFrequency"),
        minutes: get("formation.catechesis.minutes"),
        lessonNumber: get("formation.catechesis.lessonNumber"),
        totalLessons: get("formation.catechesis.totalLessons"),
        doctrinalTopic: get("formation.catechesis.doctrinalTopic"),
        source: get("formation.catechesis.source")
      },
      recitationTracks: collectRows(form, "formationRecitation", (row) => {
        const title = rowValue(row, "title");
        if (!title) return null;
        return {
          id: row.dataset.id || "",
          title,
          sourceKind: rowValue(row, "sourceKind"),
          planningMode: rowValue(row, "planningMode"),
          weeklyFrequency: rowValue(row, "weeklyFrequency"),
          minutes: rowValue(row, "minutes"),
          status: rowValue(row, "status"),
          progressPercent: rowValue(row, "progressPercent")
        };
      }),
      hymnStudies: collectRows(form, "formationHymns", (row) => {
        const title = rowValue(row, "title");
        if (!title) return null;
        return {
          id: row.dataset.id || "",
          title,
          tone: rowValue(row, "tone"),
          source: rowValue(row, "source"),
          planningMode: rowValue(row, "planningMode"),
          weeklyFrequency: rowValue(row, "weeklyFrequency"),
          minutes: rowValue(row, "minutes"),
          status: rowValue(row, "status")
        };
      }),
      enrichmentBlocks: collectRows(form, "formationEnrichment", (row) => {
        const title = rowValue(row, "title");
        if (!title) return null;
        return {
          id: row.dataset.id || "",
          blockType: rowValue(row, "blockType"),
          title,
          planningMode: rowValue(row, "planningMode"),
          weeklyFrequency: rowValue(row, "weeklyFrequency"),
          cadenceLabel: rowValue(row, "weeklyFrequency"),
          minutesPlanned: rowValue(row, "minutesPlanned"),
          color: rowValue(row, "color")
        };
      }),
      feasts: collectRows(form, "formationFeasts", (row) => {
        const title = rowValue(row, "title");
        if (!title) return null;
        return {
          id: row.dataset.id || "",
          civilDate: rowValue(row, "civilDate"),
          title,
          fastingRule: rowValue(row, "fastingRule"),
          planningMode: rowValue(row, "planningMode"),
          minutes: rowValue(row, "minutes"),
          note: rowValue(row, "note")
        };
      })
    },
    formationMaterials: collectRows(form, "formationMaterials", (row) => {
      const title = rowValue(row, "title");
      if (!title) return null;
      return {
        id: row.dataset.id || "",
        title,
        materialType: rowValue(row, "materialType"),
        source: rowValue(row, "source"),
        planningMode: rowValue(row, "planningMode"),
        weeklyFrequency: rowValue(row, "weeklyFrequency"),
        cadenceLabel: rowValue(row, "weeklyFrequency"),
        minutes: rowValue(row, "minutes"),
        termId: rowValue(row, "termId") || currentTermId,
        color: rowValue(row, "color")
      };
    }),
    coOp: {
      enabled: false,
      status: "coming-soon"
    }
  };
}

function currentSetupChildren(form) {
  return collectRows(form, "children", (row, index) => ({
    id: row.dataset.id || `new-child-${index}`,
    name: rowValue(row, "firstName") || `Child ${index + 1}`
  }));
}

function currentSetupTerms(form) {
  return collectRows(form, "terms", (row, index) => ({
    id: rowValue(row, "id") || row.dataset.id || `term_${index + 1}`,
    label: rowValue(row, "label") || `Term ${index + 1}`
  }));
}

function setupChildCount(form) {
  return form.querySelectorAll('[data-setup-row="children"]').length;
}

function syncSetupChildLimit(form) {
  const button = form.querySelector('[data-setup-add-row="children"]');
  if (!button) return;
  const freeLimitReached = !isLearnFamilyPlan() && setupChildCount(form) >= 2;
  button.dataset.upgradeRequired = freeLimitReached ? "true" : "false";
  button.textContent = freeLimitReached ? "Upgrade to add another child" : "Add Child";
  button.style.background = freeLimitReached ? "var(--navy)" : "var(--paper2)";
  button.style.color = freeLimitReached ? "#fff" : "var(--ink)";
  button.style.borderColor = freeLimitReached ? "var(--gold)" : "var(--line)";
}

function setupBlankRow(type, form) {
  const terms = currentSetupTerms(form);
  const currentTermId = form.elements["schoolYear.currentTermId"]?.value || terms[0]?.id || "term_1";
  if (type === "children") return childSetupRow({});
  if (type === "terms") return termSetupRow({}, terms.length);
  if (type === "subjects") return subjectSetupRow({}, currentSetupChildren(form), terms, currentTermId);
  if (type === "books") return bookSetupRow({}, terms, currentTermId);
  if (type === "formationMaterials") return formationSetupRow({}, terms, currentTermId);
  if (type === "formationRhythms") return formationRhythmSetupRow({});
  if (type === "formationRecitation") return formationRecitationSetupRow({});
  if (type === "formationEnrichment") return formationEnrichmentSetupRow({});
  return "";
}

function syncSetupTermSelects(form) {
  const terms = currentSetupTerms(form);
  if (!terms.length) return;
  form.querySelectorAll('select[name="schoolYear.currentTermId"], select[name="termId"]').forEach((select) => {
    const currentValue = select.value;
    select.innerHTML = setupTermOptions(terms, terms[0])
      .map((option) => `<option value="${html(option.value)}" ${option.value === currentValue ? "selected" : ""}>${html(option.label)}</option>`)
      .join("");
    if (![...select.options].some((option) => option.value === currentValue)) select.value = terms[0].id;
  });
}

function wireSetupPage() {
  const form = root.querySelector("[data-setup-form]");
  if (!form) return;
  form.addEventListener("input", (event) => {
    const colorField = event.target.closest(".learn-color-field");
    if (!colorField) return;
    const colorInput = colorField.querySelector('input[type="color"]');
    const textInput = colorField.querySelector('input[type="text"]');
    const preview = colorField.querySelector("[data-color-preview]");
    if (event.target === colorInput && textInput) textInput.value = colorInput.value;
    if (event.target === textInput && /^#[0-9a-f]{6}$/i.test(textInput.value) && colorInput) colorInput.value = textInput.value;
    const value = /^#[0-9a-f]{6}$/i.test(textInput?.value || "") ? textInput.value : colorInput?.value;
    if (preview && value) preview.style.background = value;
    if (event.target.closest('[data-setup-row="terms"]')) syncSetupTermSelects(form);
    if (event.target.closest('[data-setup-row="children"]')) syncSetupChildLimit(form);
  });
  form.addEventListener("click", (event) => {
    const closeButton = event.target.closest("[data-close-term]");
    if (closeButton) {
      const termId = closeButton.dataset.closeTerm || closeButton.closest("[data-setup-row]")?.dataset.id || "";
      const status = form.querySelector("[data-setup-status]");
      const originalText = closeButton.textContent;
      closeButton.disabled = true;
      closeButton.textContent = "Closing...";
      if (status) {
        status.style.color = "var(--muted)";
        status.textContent = "Saving setup before closing term...";
      }
      (async () => {
        try {
          const payload = setupPayloadFromForm(form);
          const calendar = payload.preferences.calendarType || "julian";
          await apiPost("/api/learn/setup", payload);
          const closed = await apiPost(`/api/learn/terms/${encodeURIComponent(termId)}/close`, {});
          localStorage.setItem("agapay.learn.calendar", calendar);
          if (status) {
            status.style.color = "var(--gold)";
            status.textContent = `${closed.term?.label || "Term"} closed with ${closed.academicRecords?.length || 0} academic records.`;
          }
          closeButton.textContent = "Closed";
        } catch (error) {
          if (status) {
            status.style.color = "var(--burgundy)";
            status.textContent = error.message;
          }
          closeButton.disabled = false;
          closeButton.textContent = originalText;
        }
      })();
      return;
    }
    const removeButton = event.target.closest("[data-setup-remove-row]");
    if (removeButton) {
      const row = removeButton.closest("[data-setup-row]");
      const list = row?.parentElement;
      const removedType = row?.dataset.setupRow;
      if (row && list && list.querySelectorAll("[data-setup-row]").length > 1) {
        row.remove();
        if (removedType === "terms") syncSetupTermSelects(form);
        if (removedType === "children") syncSetupChildLimit(form);
      }
      return;
    }
    const addButton = event.target.closest("[data-setup-add-row]");
    if (addButton) {
      const type = addButton.dataset.setupAddRow;
      if (type === "children" && addButton.dataset.upgradeRequired === "true") {
        showLearnDialog("Upgrade to Add Another Child", "The free AGAPAY Learn plan includes up to two children. Upgrade to the Family plan to add unlimited children, child sheets, term packs, and larger-household planning.", [
          { label: "Free plan", value: "Up to 2 children" },
          { label: "Family plan", value: "Unlimited children" }
        ], { upgrade: true });
        return;
      }
      const list = form.querySelector(`[data-setup-list="${type}"]`);
      if (list) {
        list.insertAdjacentHTML("beforeend", setupBlankRow(type, form));
        if (type === "terms") syncSetupTermSelects(form);
        if (type === "children") syncSetupChildLimit(form);
      }
    }
  });
  syncSetupChildLimit(form);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = form.querySelector("[data-setup-status]");
    const submit = form.querySelector("button[type='submit']");
    const payload = setupPayloadFromForm(form);
    status.textContent = "Saving setup...";
    submit.disabled = true;
    try {
      const saved = await apiPost("/api/learn/setup", payload);
      const calendar = payload.preferences.calendarType || "julian";
      const savedAt = saved.savedAt ? ` at ${new Date(saved.savedAt).toLocaleTimeString()}` : "";
      localStorage.setItem("agapay.learn.calendar", calendar);
      root.innerHTML = renderSetup(toSetupViewModel(saved, { calendar }));
      wireSetupPage();
      const nextStatus = root.querySelector("[data-setup-status]");
      if (nextStatus) nextStatus.textContent = `Setup saved${savedAt}.`;
    } catch (error) {
      status.textContent = error.message;
      status.style.color = "var(--burgundy)";
    } finally {
      if (submit?.isConnected) submit.disabled = false;
    }
  });
}

function wirePlanner(vm) {
  if (vm.activeView) localStorage.setItem("agapay.learn.plannerView", vm.activeView);
  if (vm.month?.key) localStorage.setItem("agapay.learn.plannerMonth", vm.month.key);
  root.querySelector("[data-planner-month-print]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const month = button.dataset.plannerMonthPrint || vm.month?.key || new Date().toISOString().slice(0, 7);
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Generating...";
    try {
      const calendar = localStorage.getItem("agapay.learn.calendar") || "julian";
      const response = await fetch(`/api/learn/print/print_mom_month?calendar=${encodeURIComponent(calendar)}&month=${encodeURIComponent(month)}`, {
        method: "POST",
        headers: learnRequestHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ month })
      });
      const contentType = response.headers.get("content-type") || "";
      if (!response.ok || !contentType.includes("application/pdf")) {
        const payload = contentType.includes("application/json") ? await response.json().catch(() => ({})) : {};
        throw new Error(payload.error || "Unable to generate the month calendar. Please try again.");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const fileMatch = disposition.match(/filename="([^"]+)"/i);
      downloadBlob(fileMatch?.[1] || `agapay-learn-${month}-calendar.pdf`, blob);
    } catch (error) {
      showLearnDialog("Month Calendar Could Not Be Generated", error.message || "Please refresh and try again.", []);
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  });
}

function updateActiveButton(buttons, activeButton) {
  buttons.forEach((button) => {
    const active = button === activeButton;
    button.style.background = active ? "var(--navy)" : "var(--paper)";
    button.style.color = active ? "#f3ead4" : "var(--ink)";
    button.style.borderColor = active ? "var(--gold)" : "var(--line)";
  });
}

function wireCommunity() {
  const search = root.querySelector("[data-community-search]");
  const cards = [...root.querySelectorAll("[data-community-card]")];
  const count = root.querySelector("[data-community-count]");
  const filterButtons = [...root.querySelectorAll("[data-community-filter]")];
  let activeCategory = "All";

  const applyFilters = () => {
    const query = (search?.value || "").trim().toLowerCase();
    let shown = 0;
    cards.forEach((card) => {
      const matchesCategory = activeCategory === "All" || card.dataset.category === activeCategory;
      const matchesSearch = !query || (card.dataset.search || "").includes(query);
      const visible = matchesCategory && matchesSearch;
      card.hidden = !visible;
      if (visible) shown += 1;
    });
    if (count) count.innerHTML = `<span style="color:var(--gold);">✥</span> Showing ${shown} resources shared by Orthodox homeschool families`;
  };

  search?.addEventListener("input", applyFilters);
  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activeCategory = button.dataset.communityFilter || "All";
      updateActiveButton(filterButtons, button);
      applyFilters();
    });
  });

  root.querySelectorAll("[data-community-sort]").forEach((button) => {
    button.addEventListener("click", () => updateActiveButton([...root.querySelectorAll("[data-community-sort]")], button));
  });

  root.addEventListener("click", (event) => {
    const vote = event.target.closest("[data-community-vote]");
    if (vote) {
      const value = vote.querySelector("span");
      value.textContent = String((Number(value.textContent) || 0) + 1);
      return;
    }
    const save = event.target.closest("[data-community-save]");
    if (save) {
      save.textContent = save.textContent.includes("Saved") ? "♡ Save" : "✓ Saved";
      save.style.background = save.textContent.includes("Saved") ? "var(--paper2)" : "#fbf2dd";
      return;
    }
    if (event.target.closest("[data-community-add]")) {
      showLearnDialog("Added to Library", "This resource has been queued for the household library. Persistent community library syncing will use the same D1-backed profile store as setup.");
    }
  });

  const panelEl = root.querySelector("[data-community-share-panel]");
  root.querySelector("[data-community-share]")?.addEventListener("click", () => {
    if (panelEl) {
      panelEl.hidden = false;
      panelEl.style.display = "flex";
    }
  });
  root.querySelectorAll("[data-community-share-close]").forEach((button) => {
    button.addEventListener("click", () => {
      if (panelEl) {
        panelEl.hidden = true;
        panelEl.style.display = "none";
      }
    });
  });
  root.querySelector("[data-community-submit]")?.addEventListener("click", () => {
    const title = root.querySelector('[name="community.title"]')?.value?.trim();
    const url = root.querySelector('[name="community.url"]')?.value?.trim();
    const category = root.querySelector('[name="community.category"]')?.value?.trim() || "Community";
    if (!title || !url) {
      showLearnDialog("Resource needs a title and link", "Add a title and a URL before sharing this resource.");
      return;
    }
    showLearnDialog("Resource Shared", `${title} has been added to this community view for review.`);
    if (panelEl) {
      panelEl.hidden = true;
      panelEl.style.display = "none";
    }
    const grid = root.querySelector("[data-community-grid]");
    if (grid) {
      const searchText = `${title} ${category}`.toLowerCase();
      grid.insertAdjacentHTML("afterbegin", `<article data-community-card data-category="${html(category)}" data-search="${html(searchText)}" style="background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:11px;"><div style="height:92px;border:1px solid var(--line);border-radius:10px;background:linear-gradient(135deg,#f6edd6,var(--paper2));display:flex;align-items:center;justify-content:center;color:var(--gold);font-size:36px;">✥</div><strong style="font-family:'Cormorant Garamond',serif;font-size:20px;">${html(title)}</strong><p style="font-size:13px;color:#3a4256;line-height:1.4;margin:0;">Newly shared by this household.</p><a href="${html(url)}" target="_blank" rel="noreferrer" style="color:var(--gold);text-decoration:none;">Open resource ↗</a></article>`);
    }
  });
}

function wireReports(vm) {
  const reportTemplateId = (label = "Year-End Report") => {
    const lower = String(label || "").toLowerCase();
    if (lower.includes("transcript")) return "transcript";
    if (lower.includes("report card")) return "report-card";
    if (lower.includes("subject")) return "subject-progress-report";
    return "year-end-report";
  };
  const exportReport = async (label = vm.pdf.title, button = null) => {
    const title = label || "Year-End Report";
    const originalText = button?.textContent;
    if (button) {
      button.disabled = true;
      button.textContent = "Generating...";
    }
    try {
      const response = await fetch(`/api/learn/print/${encodeURIComponent(reportTemplateId(title))}`, {
        method: "POST",
        headers: learnRequestHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ label: title })
      });
      const contentType = response.headers.get("content-type") || "";
      if (!response.ok || !contentType.includes("application/pdf")) {
        const payload = contentType.includes("application/json") ? await response.json().catch(() => ({})) : {};
        throw new Error(payload.error || "Unable to generate the report PDF. Please try again.");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const fileMatch = disposition.match(/filename="([^"]+)"/i);
      downloadBlob(fileMatch?.[1] || `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "learn-report"}.pdf`, blob);
    } catch (error) {
      showLearnDialog("Report Could Not Be Generated", error.message || "Please refresh and try again.", []);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = originalText;
      }
    }
  };
  root.querySelector("[data-report-pdf]")?.addEventListener("click", (event) => exportReport(vm.pdf.title, event.currentTarget));
  root.querySelectorAll("[data-report-export]").forEach((button) => {
    button.addEventListener("click", () => exportReport(button.dataset.reportExport || "Learn Report", button));
  });
}

function canUsePrint(vm, template) {
  if (isLearnFamilyPlan()) return true;
  if (template?.premium) {
    showLearnDialog("Family Plan Required", "Child sheets, term packs, and premium print templates are available on the Learn Family plan.", [], { upgrade: true });
    return false;
  }
  if (printCount() >= vm.billing.printLimit) {
    showLearnDialog("Print Limit Reached", `The free plan includes ${vm.billing.printLimit} basic household prints. Upgrade to keep generating print packs.`, [], { upgrade: true });
    return false;
  }
  return true;
}

function wirePrintCenter(vm) {
  root.querySelector("[data-print-upgrade]")?.addEventListener("click", openLearnCheckout);
  root.querySelectorAll("[data-print-generate]").forEach((button) => {
    button.addEventListener("click", async () => {
      const templateId = button.dataset.printGenerate;
      const template = vm.templates.find((item) => item.id === templateId) || vm.templates.find((item) => item.id === "weekly-pack") || { id: "weekly-pack", title: "Weekly Print Pack", audience: "household", premium: false };
      if (!canUsePrint(vm, template)) return;
      const title = template?.title || "Weekly Print Pack";
      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = "Generating...";
      try {
        const calendar = localStorage.getItem("agapay.learn.calendar") || "julian";
        const response = await fetch(`/api/learn/print/${encodeURIComponent(templateId)}?calendar=${encodeURIComponent(calendar)}`, {
          method: "POST",
          headers: learnRequestHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({
            childId: template.childId || "",
            termId: template.termId || ""
          })
        });
        const contentType = response.headers.get("content-type") || "";
        if (!response.ok || !contentType.includes("application/pdf")) {
          const payload = contentType.includes("application/json") ? await response.json().catch(() => ({})) : {};
          throw new Error(payload.error || "Unable to generate the PDF. Please try again.");
        }
        const blob = await response.blob();
        const disposition = response.headers.get("content-disposition") || "";
        const fileMatch = disposition.match(/filename="([^"]+)"/i);
        downloadBlob(fileMatch?.[1] || `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "learn-print-pack"}.pdf`, blob);
        const serverCount = Number(response.headers.get("x-agapay-learn-print-count"));
        if (!isLearnFamilyPlan()) setPrintCount(Number.isFinite(serverCount) ? serverCount : printCount() + 1);
      } catch (error) {
        showLearnDialog("Print Could Not Be Generated", error.message || "Please refresh and try again.", []);
      } finally {
        button.disabled = false;
        button.textContent = originalText;
      }
    });
  });
}

function wireFormation() {
  root.querySelectorAll("[data-reading-check]").forEach((button) => {
    button.addEventListener("click", () => {
      const active = button.getAttribute("aria-pressed") !== "true";
      button.setAttribute("aria-pressed", String(active));
      button.style.background = active ? "#fbf2dd" : "var(--paper2)";
      button.style.borderColor = active ? "var(--gold)" : "var(--line)";
      const mark = button.querySelector("[data-reading-mark]");
      if (mark) mark.textContent = active ? "✓" : "";
    });
  });
}

async function mount() {
  if (new URLSearchParams(window.location.search).get("learn_billing") === "success") {
    localStorage.setItem("agapay.learn.plan", "family");
  }
  try {
    const billing = await apiGet("/api/learn/billing/status");
    if (billing.plan === "family" || billing.fullAccess) localStorage.setItem("agapay.learn.plan", "family");
  } catch {
    // Billing status is advisory for the shell; route-level saves still enforce limits.
  }
  const calendar = localStorage.getItem("agapay.learn.calendar") || "julian";
  root.innerHTML = `<div style="padding:32px;font-family:Georgia,serif;color:#1b2c45;">Loading AGAPAY Learn...</div>`;
  if (pageKey === "dashboard") {
    const raw = await apiGet(`/api/learn/dashboard?calendar=${encodeURIComponent(calendar)}`);
    root.innerHTML = renderDashboard(toDashboardViewModel(raw));
    wireDashboard();
    return;
  }
  if (pageKey === "planner") {
    const params = new URLSearchParams(window.location.search);
    const view = params.get("view") || localStorage.getItem("agapay.learn.plannerView") || "week";
    const month = params.get("month") || localStorage.getItem("agapay.learn.plannerMonth") || new Date().toISOString().slice(0, 7);
    const raw = await apiGet(`/api/learn/planner?calendar=${encodeURIComponent(calendar)}&view=${encodeURIComponent(view)}&month=${encodeURIComponent(month)}`);
    const vm = toPlannerViewModel(raw);
    root.innerHTML = renderPlanner(vm);
    wirePlanner(vm);
    return;
  }
  if (pageKey === "formation") {
    const raw = await apiGet(`/api/learn/formation?calendar=${encodeURIComponent(calendar)}`);
    root.innerHTML = renderFormation(toFormationViewModel(raw));
    wireFormation();
    return;
  }
  if (pageKey === "books") {
    const raw = await apiGet("/api/learn/books");
    root.innerHTML = renderBooks(toBooksViewModel(raw));
    return;
  }
  if (pageKey === "reports") {
    const raw = await apiGet("/api/learn/reports");
    const vm = toReportsViewModel(raw);
    root.innerHTML = renderReports(vm);
    wireReports(vm);
    return;
  }
  if (pageKey === "print-center") {
    const raw = await apiGet(`/api/learn/print-center?calendar=${encodeURIComponent(calendar)}`);
    const vm = toPrintCenterViewModel(raw);
    root.innerHTML = renderPrintCenter(vm);
    wirePrintCenter(vm);
    return;
  }
  if (pageKey === "community") {
    const raw = await apiGet("/api/learn/community");
    root.innerHTML = renderCommunity(toCommunityViewModel(raw));
    return;
  }
  if (pageKey === "co-op") {
    const raw = await apiGet("/api/learn/co-op");
    root.innerHTML = renderCoOp(toCoOpViewModel(raw));
    return;
  }
  if (pageKey === "onboarding") {
    const raw = await apiGet("/api/learn/setup");
    root.innerHTML = renderSetup(toSetupViewModel(raw, { calendar }));
    wireSetupPage();
    return;
  }
  root.innerHTML = `<div style="padding:32px;font-family:Georgia,serif;color:#1b2c45;">This Learn route has not been migrated to the Claude shell yet.</div>`;
}

mount().catch((error) => {
  root.innerHTML = `<section style="padding:32px;font-family:Georgia,serif;color:#6e2f2a;"><strong>Unable to load AGAPAY Learn</strong><p>${html(error.message)}</p></section>`;
});

document.addEventListener("click", (event) => {
  const progressTarget = event.target.closest("[data-setup-progress-target]");
  if (progressTarget) {
    const target = document.getElementById(progressTarget.dataset.setupProgressTarget);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      target.classList.add("learn-setup-focus");
      window.setTimeout(() => target.classList.remove("learn-setup-focus"), 1500);
    }
    return;
  }

  const toggle = event.target.closest("[data-learn-menu-toggle]");
  const scrim = event.target.closest("[data-learn-sidebar-scrim]");
  const navLink = event.target.closest(".learn-product-nav a");
  if (!toggle && !scrim && !navLink) return;

  const open = toggle ? !document.body.classList.contains("learn-menu-open") : false;
  document.body.classList.toggle("learn-menu-open", open);
  document.querySelector("[data-learn-menu-toggle]")?.setAttribute("aria-expanded", String(open));
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  document.body.classList.remove("learn-menu-open");
  document.querySelector("[data-learn-menu-toggle]")?.setAttribute("aria-expanded", "false");
});
