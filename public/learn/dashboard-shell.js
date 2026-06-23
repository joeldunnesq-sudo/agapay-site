import {
  toBooksViewModel,
  toCoOpViewModel,
  toCommunityViewModel,
  toDashboardViewModel,
  toFormationViewModel,
  toPlannerViewModel,
  toPrintCenterViewModel,
  toSetupViewModel
} from "./dashboard-view-models.js?v=20260621c";

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
    "--cream:#f6f1e8",
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

function completionCheck(item, scope, label) {
  return `<button type="button" data-learn-completion data-completion-id="${html(item.id)}" data-completion-scope="${html(scope)}" aria-pressed="${item.complete ? "true" : "false"}" aria-label="${html(`${item.complete ? "Mark incomplete" : "Mark complete"}: ${label}`)}" style="width:27px;height:27px;flex:none;border-radius:50%;border:1.5px solid ${item.complete ? "var(--navy)" : "var(--gold)"};background:${item.complete ? "var(--navy)" : "transparent"};color:#fff;display:grid;place-items:center;font-size:14px;cursor:pointer;padding:0;">${item.complete ? "✓" : ""}</button>`;
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
      kicker: "COMING SOON",
      description: "Beautiful academic records, report cards, progress summaries, and transcripts are planned for a future Learn release.",
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
    <section class="learn-page-intro learn-page-intro--dashboard" aria-labelledby="learn-page-heading">
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
  if (window.MyAgapayShell?.authHeaders) return window.MyAgapayShell.authHeaders(extra);
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
    .replace(/\b(st|saint|ven|venerable|holy|apostle|evangelist|martyr|great|our holy|righteous|blessed|elder|prophet|hieromartyr|new martyr)\.?\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function saintMatchScore(a = "", b = "") {
  const aTokens = saintMatchKey(a).split(/\s+/).filter((token) => token.length > 2);
  const bTokens = saintMatchKey(b).split(/\s+/).filter((token) => token.length > 2);
  if (!aTokens.length || !bTokens.length) return 0;
  const aSet = new Set(aTokens);
  const bSet = new Set(bTokens);
  let score = 0;
  aSet.forEach((token) => {
    if (bSet.has(token)) score += 3;
    else if ([...bSet].some((other) => other.includes(token) || token.includes(other))) score += 1;
  });
  return score / Math.max(aSet.size, bSet.size);
}

function saintPrecedence(value = "") {
  const text = String(value || "").toLowerCase();
  if (/\b(lord|theotokos|mother of god|cross|resurrection|nativity|theophany|pascha|pentecost|transfiguration|ascension|annunciation|dormition)\b/.test(text)) return 100;
  if (/\b(apostle|evangelist|forerunner|baptist)\b/.test(text)) return 90;
  if (/\b(prophet|hierarch|bishop|equal[- ]to[- ]the[- ]apostles)\b/.test(text)) return 80;
  if (/\b(great martyr|new martyr|hieromartyr|martyr|confessor)\b/.test(text)) return 70;
  if (/\b(righteous|ancestor|forefather|foremother)\b/.test(text)) return 60;
  if (/\b(venerable|abbot|abbess|monk|nun|elder|wonderworker)\b/.test(text)) return 50;
  return 40;
}

function orderSaintsByPrecedence(saints = []) {
  return [...saints].sort((a, b) => {
    const aTitle = typeof a === "string" ? a : a?.name || a?.title || "";
    const bTitle = typeof b === "string" ? b : b?.name || b?.title || "";
    return saintPrecedence(bTitle) - saintPrecedence(aTitle);
  });
}

function orderSaintsForCard(saints = [], cardTitle = "") {
  const precedenceOrdered = orderSaintsByPrecedence(saints);
  const titleKey = saintMatchKey(cardTitle);
  if (!titleKey || !Array.isArray(precedenceOrdered) || precedenceOrdered.length < 2) return precedenceOrdered;
  let matchedIndex = precedenceOrdered.findIndex((saint) => {
    const nameKey = saintMatchKey(saint?.name || saint?.title || "");
    return nameKey && (nameKey === titleKey || nameKey.includes(titleKey) || titleKey.includes(nameKey));
  });
  if (matchedIndex < 0) {
    let bestScore = 0;
    precedenceOrdered.forEach((saint, index) => {
      const score = Math.max(
        saintMatchScore(cardTitle, saint?.name || ""),
        saintMatchScore(cardTitle, saint?.title || "")
      );
      if (score > bestScore) {
        bestScore = score;
        matchedIndex = index;
      }
    });
    if (bestScore < 0.45) matchedIndex = -1;
  }
  if (matchedIndex <= 0) return precedenceOrdered;
  return [precedenceOrdered[matchedIndex], ...precedenceOrdered.slice(0, matchedIndex), ...precedenceOrdered.slice(matchedIndex + 1)];
}

function forceDisplayedSaintFirst(saints = [], cardTitle = "") {
  const ordered = orderSaintsForCard(saints, cardTitle);
  if (!cardTitle || !Array.isArray(ordered) || !ordered.length) return ordered;
  const first = ordered[0] || {};
  const score = Math.max(
    saintMatchScore(cardTitle, first.name || ""),
    saintMatchScore(cardTitle, first.title || "")
  );
  if (score >= 0.45) return ordered;
  return [{
    name: cardTitle,
    title: cardTitle,
    storyText: "",
    sourceLabel: "Orthocal.info"
  }, ...ordered];
}

function saintCardTitle(today = {}) {
  const firstName = today.saintNames?.[0] || "";
  if (firstName) {
    const orderedStories = orderSaintsForCard(today.saintStories || [], firstName);
    return orderedStories?.[0]?.name || orderedStories?.[0]?.title || firstName;
  }
  const firstStoryTitle = today.saintStories?.[0]?.name || today.saintStories?.[0]?.title || "";
  if (firstStoryTitle) return firstStoryTitle;
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
            ${item.comingSoon ? '<small class="learn-nav-soon">Soon</small>' : ""}
          </a>
        `).join("")}
        </nav>
      </div>
    </aside>
  `;
}

function globalProductNav(activeProduct = "learn") {
  if (window.MyAgapayShell?.productNav) {
    return window.MyAgapayShell.productNav(activeProduct, "learn-product-tabbar");
  }
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
        <span><strong>AGAPAY Learn</strong><small>Love how you learn</small></span>
      </a>
      <div class="learn-page-title-utility" style="flex:1;min-width:0;line-height:1.1;">
        <div style="font-family:'Cormorant Garamond',serif;font-size:38px;font-weight:600;color:var(--ink);display:flex;align-items:center;">${title}</div>
        ${vm.page.subtitle ? `<div style="font-size:14.5px;color:var(--muted);margin-top:2px;">${html(vm.page.subtitle)}</div>` : ""}
      </div>
      <div class="learn-utility-actions" style="display:flex;align-items:center;gap:18px;flex:none;">
        <a class="learn-quick-action" href="/myagapay/learn/setup?simple=1">Quick Setup</a>
        <div class="learn-account-menu" data-learn-account-menu>
          <button class="learn-account-utility" type="button" data-learn-account-toggle aria-haspopup="true" aria-expanded="false">
            <span class="learn-account-utility-avatar">${html(vm.shell.accountInitials || "FM")}</span>
            <span class="learn-account-utility-copy">
              <span>${html(vm.shell.accountName || "Faithful Member")}</span>
              <small>View Account</small>
            </span>
            <span class="learn-account-utility-caret">⌄</span>
          </button>
          <div class="learn-account-dropdown" role="menu" hidden>
            <a href="/myagapay/account" role="menuitem">Global Dashboard Settings</a>
            <a href="/myagapay" role="menuitem">Back to My AGAPAY</a>
            <button type="button" data-learn-logout role="menuitem">Log out</button>
          </div>
        </div>
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
      detail: "Protects prayer, readings, catechesis, and gentle family-based learning while reducing lower-priority lessons."
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
  const orderedSaintStories = forceDisplayedSaintFirst(today.saintStories || [], displayedSaintTitle);
  const churchIconPanel = `<div class="learn-today-art-panel"><img src="${html(todayArtworkUrl)}" alt="Illustrated Orthodox homeschool planner open to today" loading="lazy"></div>`;
  const saintPreview = displayedSaintTitle && displayedSaintTitle !== "Lives of the Saints"
    ? `${today.saintNames?.length > 1 ? `${today.saintNames.length} commemorations` : "Open the life"} for today.`
    : today.saintNames?.length
    ? today.saintNames.slice(0, 2).join("; ") + (today.saintNames.length > 2 ? ` + ${today.saintNames.length - 2} more` : "")
    : "Open the lives commemorated today.";
  const saintIcon = orderedSaintStories?.find((saint) => saint.iconUrl)?.iconUrl || "";
  const displayedSaintKey = saintMatchKey(displayedSaintTitle);
  const displayedSaintStory = orderedSaintStories?.find((saint) => {
    const key = saintMatchKey(saint?.name || saint?.title || "");
    return key && displayedSaintKey && (key === displayedSaintKey || key.includes(displayedSaintKey) || displayedSaintKey.includes(key));
  });
  const saintCentury = displayedSaintStory?.reposeCentury || orderedSaintStories?.find((saint) => saint.reposeCentury)?.reposeCentury || "";
  const saintCard = `<button type="button" data-saint-of-day data-saint-title="${html(displayedSaintTitle)}" data-date="${html(today.civilDate)}" data-calendar="${html(today.calendarType)}" style="margin-top:14px;width:100%;text-align:left;border:1px solid rgba(181,148,47,.34);background:linear-gradient(135deg,#fffaf0,#f7edd6);border-radius:13px;padding:13px;display:flex;gap:12px;align-items:center;cursor:pointer;font-family:inherit;color:var(--ink);box-shadow:0 1px 2px rgba(20,40,70,.04);">
    ${saintIcon ? `<img src="${html(saintIcon)}" alt="" style="width:52px;height:52px;border-radius:12px;object-fit:cover;border:1px solid var(--goldsoft);flex:none;">` : `<span style="width:48px;height:48px;border-radius:50%;background:var(--navy);color:#f3ead4;display:grid;place-items:center;flex:none;font-size:23px;">✥</span>`}
    <span style="min-width:0;line-height:1.25;"><span style="display:block;color:var(--gold);font-size:10.5px;letter-spacing:.13em;font-weight:800;text-transform:uppercase;">Saint of the Day</span><strong style="display:block;font-family:'Cormorant Garamond',serif;font-size:22px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${html(displayedSaintTitle)}</strong>${saintCentury ? `<span style="display:block;color:var(--gold);font-size:12px;font-weight:800;margin:2px 0 1px;">${html(saintCentury)}</span>` : ""}<small style="display:block;color:var(--muted);line-height:1.35;">${html(saintPreview)}</small></span>
    <span style="margin-left:auto;color:var(--gold);font-size:20px;flex:none;">→</span>
  </button>`;
  const householdGroups = vm.householdStream.reduce((groups, item) => {
    const label = item.group || "Everyone Together";
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(item);
    return groups;
  }, new Map());
  const togetherThisWeek = householdGroups.size ? [...householdGroups.entries()].map(([group, items]) => `<section><div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin:2px 0 8px;"><strong style="color:var(--ink);font-family:'Cormorant Garamond',serif;font-size:18px;">${html(group)}</strong><span style="font-size:11px;color:var(--muted);">${items.filter((item) => item.complete).length}/${items.length} complete</span></div><div style="display:flex;flex-direction:column;gap:9px;">${items.map((item) => `<div style="display:flex;align-items:center;gap:12px;background:var(--paper2);border:1px solid var(--line);border-radius:10px;padding:11px 13px;"><span style="width:38px;height:38px;border-radius:50%;background:#f1e6c9;color:var(--gold);display:flex;align-items:center;justify-content:center;font-size:18px;">${html(item.icon)}</span><a href="${html(item.href)}" style="flex:1;min-width:0;line-height:1.2;text-decoration:none;color:inherit;"><span style="display:block;font-weight:600;font-size:15.5px;color:var(--ink);">${html(item.title)}</span><span style="display:block;font-size:12.5px;color:var(--muted);">${html(item.sub)}</span></a><span style="color:var(--muted);font-size:13px;flex:none;">${html(item.time)}</span>${completionCheck(item, "weekly", item.title)}</div>`).join("")}</div></section>`).join("") : `<div style="color:var(--muted);font-style:italic;">Run Quick Setup or add Enrichment in Advanced Setup to build this week together.</div>`;
  const body = `
    <section data-screen-label="Dashboard" style="display:flex;flex-direction:column;gap:22px;">
      <div style="background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:22px;display:flex;gap:24px;box-shadow:0 1px 3px rgba(20,40,70,.04);flex-wrap:wrap;">
        ${churchIconPanel}
        <div class="learn-today-main">
          <div style="color:var(--gold);font-size:12px;letter-spacing:.18em;font-weight:600;">${html(today.kicker)}</div>
          <div style="font-family:'Cormorant Garamond',serif;font-size:30px;font-weight:600;color:var(--ink);line-height:1.1;">${html(displayedSaintTitle)}</div>
          <div class="learn-today-meta-grid">
            <div style="display:flex;gap:10px;"><span style="color:var(--gold);font-size:17px;margin-top:2px;">▣</span><span><span style="display:block;color:var(--gold);font-size:10.5px;letter-spacing:.13em;font-weight:600;">LITURGICAL DATE</span><span style="font-size:16px;display:block;">${html(today.liturgicalDateLabel)}</span>${today.annoMundiLabel ? `<span style="color:var(--muted);font-size:13px;font-style:italic;">${html(today.annoMundiLabel)}</span>` : ""}</span></div>
            <div style="display:flex;flex-direction:column;gap:12px;">
              <div style="display:flex;gap:10px;"><span style="color:var(--gold);font-size:17px;margin-top:2px;">✥</span><span><span style="display:block;color:var(--gold);font-size:10.5px;letter-spacing:.13em;font-weight:600;">TONE OF WEEK</span><span style="font-size:16px;">${html(today.toneLabel)}</span></span></div>
              <div style="display:flex;gap:10px;"><span style="color:var(--gold);font-size:17px;margin-top:2px;">♙</span><span><span style="display:block;color:var(--gold);font-size:10.5px;letter-spacing:.13em;font-weight:600;">FASTING RULE</span><span style="font-size:16px;display:block;">${html(today.fastingRule)}</span><span style="color:var(--muted);font-size:13px;font-style:italic;">${html(today.fastingNote)}</span></span></div>
            </div>
            <div class="learn-today-readings">
              <div><span style="display:block;color:var(--gold);font-size:10.5px;letter-spacing:.13em;font-weight:600;">EPISTLE READING</span><span style="font-size:16px;">${html(today.epistleRef)}</span></div>
              <div><span style="display:block;color:var(--gold);font-size:10.5px;letter-spacing:.13em;font-weight:600;">GOSPEL READING</span><span style="font-size:16px;">${html(today.gospelRef)}</span></div>
            </div>
          </div>
          ${saintCard}
        </div>
        <div class="learn-today-hymns">
          <div style="color:var(--gold);font-size:11px;letter-spacing:.16em;font-weight:600;">${html(today.troparionLabel)}</div>
          <p style="margin:6px 0 16px;font-size:15.5px;line-height:1.5;color:#33405a;">${html(today.troparionText)}</p>
          <div style="color:var(--gold);font-size:11px;letter-spacing:.16em;font-weight:600;">${html(today.kontakionLabel)}</div>
          <p style="margin:6px 0 0;font-size:15.5px;line-height:1.5;color:#33405a;">${html(today.kontakionText)}</p>
        </div>
        ${renderTodayLearnContext(vm)}
      </div>
      <div style="background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:18px 22px;box-shadow:0 1px 3px rgba(20,40,70,.04);">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;"><span style="display:flex;align-items:center;gap:9px;"><span style="color:var(--gold);font-size:16px;">✥</span><span style="color:var(--gold);font-size:12px;letter-spacing:.18em;font-weight:600;">DAILY CHURCH RHYTHMS</span></span><small style="color:var(--muted);">Resets each day</small></div>
        <div style="display:flex;gap:14px;flex-wrap:wrap;">
          ${vm.churchRhythms.map((r) => `<div style="flex:1;min-width:170px;display:flex;align-items:center;gap:12px;">${completionCheck(r, "daily", r.label)}<span style="line-height:1.25;"><span style="display:block;font-size:16px;color:var(--ink);font-weight:500;">${html(r.label)}</span><span style="display:block;font-size:13px;color:var(--muted);">${html(r.sub)}</span></span></div>`).join("")}
        </div>
      </div>
      <div class="learn-week-overview" style="display:grid;grid-template-columns:minmax(0,1.65fr) minmax(260px,.75fr);gap:16px;align-items:stretch;">
        <div style="background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:18px;box-shadow:0 1px 3px rgba(20,40,70,.04);">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;"><span style="display:flex;align-items:center;gap:9px;"><span style="color:var(--gold);font-size:17px;">⌂</span><span style="color:var(--gold);font-size:12px;letter-spacing:.15em;font-weight:600;">TOGETHER THIS WEEK</span></span><small style="color:var(--muted);">Resets Sunday</small></div>
          <div style="display:flex;flex-direction:column;gap:13px;">${togetherThisWeek}</div>
        </div>
        <div style="background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:18px;box-shadow:0 1px 3px rgba(20,40,70,.04);">
          <div style="display:flex;align-items:center;gap:9px;margin-bottom:14px;"><span style="color:var(--gold);font-size:16px;">✥</span><span style="color:var(--gold);font-size:12px;letter-spacing:.15em;font-weight:600;">WEEK AT A GLANCE</span></div>
          <div style="display:flex;flex-direction:column;gap:16px;">${vm.thisWeek.map((w) => `<div style="display:flex;align-items:center;gap:13px;"><span style="width:44px;height:44px;border-radius:50%;background:${w.color};color:#f3ead4;display:flex;align-items:center;justify-content:center;font-size:20px;">${html(w.icon)}</span><div style="line-height:1.2;"><span style="display:block;font-family:'Cormorant Garamond',serif;font-size:23px;font-weight:600;color:var(--ink);">${html(w.big)}</span><span style="display:block;font-size:13.5px;color:#3a4256;font-weight:500;">${html(w.label)}</span><span style="display:block;font-size:12.5px;color:var(--muted);">${html(w.sub)}</span></div></div>`).join("")}<a href="/myagapay/learn/planner" style="margin-top:4px;width:100%;background:var(--paper2);border:1px solid var(--line);border-radius:10px;padding:11px;display:flex;align-items:center;justify-content:center;gap:8px;font-size:15px;color:var(--ink);font-weight:500;text-decoration:none;">View Full Week <span style="color:var(--gold);">→</span></a></div>
        </div>
      </div>
      <section style="display:grid;gap:12px;"><div style="display:flex;align-items:end;justify-content:space-between;gap:12px;flex-wrap:wrap;"><div><div style="color:var(--gold);font-size:11px;letter-spacing:.16em;font-weight:800;text-transform:uppercase;">Forms & Children</div><h2 style="font-family:'Cormorant Garamond',serif;font-size:28px;line-height:1;margin:5px 0 0;color:var(--ink);">Individual work this week</h2></div><small style="color:var(--muted);">${vm.childColumns.length} ${vm.childColumns.length === 1 ? "learner" : "learners"}</small></div><div class="learn-child-week-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:14px;align-items:start;">${vm.childColumns.map((col) => `<article style="background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:14px;box-shadow:0 1px 3px rgba(20,40,70,.04);"><div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--line);"><span style="width:34px;height:34px;border-radius:50%;background:${col.color};color:#f3ead4;display:flex;align-items:center;justify-content:center;font-size:16px;">${html(col.initial)}</span><div style="line-height:1.15;"><span style="display:block;font-size:10px;letter-spacing:.12em;color:var(--gold);font-weight:600;">${html(col.tag)}</span><span style="display:block;font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:600;color:var(--ink);">${html(col.name)} <span style="color:var(--muted);font-size:13px;font-family:'EB Garamond',serif;">• Age ${html(col.age)}</span></span></div></div><div style="display:flex;flex-direction:column;gap:8px;">${col.tasks.map((t) => `<div style="display:flex;align-items:center;gap:9px;background:var(--paper2);border:1px solid var(--line);border-radius:9px;padding:9px 10px;"><a href="/myagapay/learn/planner" style="flex:1;min-width:0;line-height:1.15;text-decoration:none;color:inherit;"><span style="display:block;font-weight:600;font-size:14px;color:var(--ink);">${html(t.title)}</span><span style="display:block;font-size:11.5px;color:var(--muted);">${html(t.sub)}</span></a><span style="color:var(--muted);font-size:11.5px;flex:none;">${html(t.time)}</span>${completionCheck(t, "weekly", `${col.name}: ${t.title}`)}</div>`).join("")}</div></article>`).join("")}</div></section>
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
      ${vm.activeView === "year" ? "" : `<div style="display:flex;align-items:center;gap:4px;background:var(--paper);border:1px solid var(--line);border-radius:11px;padding:5px;overflow:auto;max-width:100%;">${vm.termTabs.map((tab) => `<a href="${tab.href}" aria-current="${tab.active ? "page" : "false"}" style="text-decoration:none;border-radius:8px;padding:8px 24px;font-size:15px;white-space:nowrap;${tab.active ? "background:var(--navy);color:#fff;" : "color:var(--ink);"}">${html(tab.label)}</a>`).join("")}</div>`}
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
      ${renderFamilyPlanningEditor(vm)}
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
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px;">${vm.term.settings.length ? vm.term.settings.map((item) => `<span style="padding:8px 0;border-top:1px solid var(--line);">${html(item)}</span>`).join("") : emptyState("Add term dates and subject plans in Setup.")}</div>
      </aside>
    </div>
  `;
}

function renderPlannerDay(vm) {
  const day = vm.day.selected || {};
  const dayLinks = vm.week.days.map((item) => `<a href="/myagapay/learn/planner?view=day&date=${encodeURIComponent(item.date)}&term=${encodeURIComponent(vm.term.activeTerm)}&termId=${encodeURIComponent(vm.term.activeTermId)}" style="text-decoration:none;color:var(--ink);border:1px solid ${item.date === day.date ? "var(--gold)" : "var(--line)"};background:${item.date === day.date ? "#fbf2dd" : "var(--paper)"};border-radius:10px;padding:10px;text-align:center;min-width:92px;"><strong style="display:block;color:${item.isSunday ? "var(--burgundy)" : "var(--gold)"};">${html(item.weekday)}</strong><small>${html(item.shortDate)}</small></a>`).join("");
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

function renderFamilyPlanningEditor(vm) {
  return `<form data-family-planning-form id="family-planner" style="display:grid;gap:12px;scroll-margin-top:110px;">${panel("Family Planner & Meals", familyPlanningSetupPanel({ familyPlanning: vm.familyPlanning, household: vm.familyPlanning.household, children: vm.familyPlanning.children }), { icon: "▣", largeTitle: true })}<div class="learn-family-planner-save"><span data-family-planning-status>Appointments, name days, meals, recipes, and groceries save independently from school setup.</span><button type="submit">Save Family Planner</button></div></form>`;
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
    const familyItems = [
      ...(day.nameDays || []).map((entry) => ({ title: `Name day · ${entry.personName}` })),
      ...(day.events || []).map((entry) => ({ title: entry.title })),
      ...(day.meal?.dinner ? [{ title: `Dinner · ${day.meal.dinner}` }] : [])
    ];
    const plans = [...familyItems, ...(day.householdPlan || []), ...(day.formPlan || [])].slice(0, 4);
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
            <a href="/myagapay/learn/planner?view=month&month=${encodeURIComponent(adjacentMonthKey(month.key, -1))}&term=${encodeURIComponent(vm.term.activeTerm)}&termId=${encodeURIComponent(vm.term.activeTermId)}" style="border:1px solid var(--line);border-radius:9px;padding:9px 12px;color:var(--ink);text-decoration:none;background:var(--paper2);">← Previous</a>
            <button type="button" data-planner-month-print="${html(month.key)}" style="border:1px solid var(--gold);background:var(--navy);color:#fff;border-radius:9px;padding:9px 14px;font-family:inherit;font-weight:700;cursor:pointer;">Print Month</button>
            <a href="/myagapay/learn/planner?view=month&month=${encodeURIComponent(adjacentMonthKey(month.key, 1))}&term=${encodeURIComponent(vm.term.activeTerm)}&termId=${encodeURIComponent(vm.term.activeTermId)}" style="border:1px solid var(--line);border-radius:9px;padding:9px 12px;color:var(--ink);text-decoration:none;background:var(--paper2);">Next →</a>
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
      ${panel("Family-Based Learning", vm.term.householdSummary.map((item) => `<div style="padding:8px 0;border-top:1px solid var(--line);">${html(item)}</div>`).join(""), { icon: "⌂" })}
      ${vm.term.childTracks.map((child) => panel(`${child.name} · Age ${child.age}`, `<div style="display:grid;gap:8px;">${child.tracks.map((track) => `<div style="border-top:1px solid var(--line);padding:8px 0;">${html(track)}</div>`).join("") || emptyState("No tracks configured.")}</div>`, { icon: child.initial, style: "min-width:0;" })).join("")}
    </div>
    ${vm.term.graceReserve?.length ? panel("Grace Mode Reserve", `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;">${vm.term.graceReserve.map((item) => `<div style="border:1px solid ${html(item.color)};border-radius:10px;background:${softColor(item.color, "18")};padding:12px;"><strong style="display:block;color:var(--ink);">${html(item.title)}</strong><small style="display:block;color:var(--muted);line-height:1.35;margin-top:4px;">${html(item.note)}</small></div>`).join("")}</div>`, { icon: "✥" }) : ""}
  `;
}

function renderPlannerYear(vm) {
  return `
    <div style="display:grid;grid-template-columns:1fr 320px;gap:16px;align-items:start;">
      ${panel("School Year & Terms", `<h2 style="font-family:'Cormorant Garamond',serif;font-size:28px;margin:0;">${html(vm.year.schoolYear)}</h2><p style="color:var(--muted);">${html(vm.year.dateRange)}</p><div style="display:grid;grid-template-columns:repeat(3,minmax(160px,1fr));gap:10px;margin-top:12px;">${vm.year.terms.map((term) => `<div style="border:1px solid ${term.active ? "var(--gold)" : "var(--line)"};border-radius:10px;background:${term.active ? "#fbf2dd" : "var(--paper2)"};padding:12px;"><strong>${html(term.label)}</strong><small style="display:block;color:var(--muted);">${term.active ? "Current term" : "Planned"}</small></div>`).join("")}</div>`, { icon: "▣" })}
      ${panel("Upcoming Feasts", vm.year.upcomingFeasts.map((feast) => `<div style="padding:10px 0;border-top:1px solid var(--line);"><strong>${html(feast.title)}</strong><small style="display:block;color:var(--muted);">${html(feast.date)} · ${html(feast.fasting)}</small></div>`).join("") || emptyState("No feasts loaded."), { icon: "✥" })}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      ${panel("Planning Structure", `<div style="padding:10px 0;border-top:1px solid var(--line);"><small style="color:var(--gold);letter-spacing:.12em;text-transform:uppercase;">Adaptive setup</small><strong style="display:block;">Use Forms or grade levels, with family-based work shared once.</strong></div>`, { icon: "◎" })}
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

function renderCommunityLegacy(vm) {
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
      ${panel("Co-op Coming Soon", `<div style="display:grid;grid-template-columns:130px 1fr;gap:22px;align-items:center;"><div style="height:132px;border:1px solid var(--line);border-radius:12px;background:linear-gradient(180deg,#f8f0dd,#efe0ba);display:flex;align-items:center;justify-content:center;color:var(--gold);font-size:54px;">◎</div><div><small style="color:var(--gold);letter-spacing:.16em;text-transform:uppercase;">Future Learn Add-On</small><h2 style="font-family:'Cormorant Garamond',serif;font-size:34px;margin:8px 0 6px;">Co-op tools are coming soon</h2><p style="margin:0;color:#34405a;line-height:1.5;max-width:760px;">For launch, AGAPAY Learn is focused on setup, Today, planning, Church rhythms, formation, books, Grace Mode, and printable household plans. Co-op creation, invitations, and shared schedules will come in a later release.</p></div></div>`, { icon: "◎" })}
      <div style="display:grid;grid-template-columns:repeat(3,minmax(180px,1fr));gap:16px;">
        ${panel("Planned Later", `<div style="padding:8px 0;border-top:1px solid var(--line);">Create or join a co-op</div><div style="padding:8px 0;border-top:1px solid var(--line);">Invite AGAPAY member families</div><div style="padding:8px 0;border-top:1px solid var(--line);">Shared schedules and rotation</div>`, { icon: "▣" })}
        ${panel("Launch Focus", `<div style="padding:8px 0;border-top:1px solid var(--line);">Simple and Advanced Setup</div><div style="padding:8px 0;border-top:1px solid var(--line);">Planner and Print Center</div><div style="padding:8px 0;border-top:1px solid var(--line);">Formation, books, and Grace Mode</div>`, { icon: "✥" })}
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
  { value: "Orthodox Classical", label: "Classical" },
  "Traditional",
  "Eclectic",
  "Unsure"
];

const subjectTypeOptions = [
  { value: "morning-time", label: "Morning Time" },
  { value: "catechesis", label: "Catechesis" },
  { value: "enrichment-recitation", label: "Enrichment & Recitation" },
  { value: "tales", label: "Tales" },
  { value: "literature", label: "Literature" },
  { value: "language-arts", label: "Language Arts" },
  { value: "classical-foreign-languages", label: "Classical & Foreign Languages" },
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

function planningModeOptionsFor(groupingMode = "forms") {
  return [
    { value: "family", label: "Family-Based" },
    { value: "forms", label: groupingMode === "grades" ? "Grade-Based" : "Forms-Based" }
  ];
}

const planningModeOptions = planningModeOptionsFor("forms");

function setupGroupOptions(children = [], groupingMode = "forms") {
  const values = groupingMode === "grades"
    ? children.map((child) => child.gradeLabel || child.grade)
    : children.map((child) => child.formLabel || child.form);
  const unique = [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
  return groupingMode === "grades" ? unique : [...new Set([...formOptions, ...unique])];
}

const weeklyFrequencyOptions = [
  { value: "daily", label: "Daily" },
  { value: "4x", label: "4x / week" },
  { value: "3x", label: "3x / week" },
  { value: "2x", label: "2x / week" },
  { value: "1x", label: "1x / week" },
  { value: "as-needed", label: "As needed" }
];

const setupWeekdays = [
  { value: "sun", label: "Sun" },
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" }
];

function scheduledDays(value, legacyFrequency = "") {
  const direct = Array.isArray(value) ? value : String(value || "").split(",");
  const valid = direct.map((day) => String(day).trim().toLowerCase()).filter((day) => setupWeekdays.some((option) => option.value === day));
  if (valid.length) return [...new Set(valid)];
  const presets = {
    daily: ["mon", "tue", "wed", "thu", "fri"],
    "4x": ["mon", "tue", "wed", "thu"],
    "3x": ["mon", "wed", "fri"],
    "2x": ["tue", "thu"],
    "1x": ["wed"],
    "as-needed": []
  };
  return presets[String(legacyFrequency || "").toLowerCase()] || ["mon", "tue", "wed", "thu", "fri"];
}

function setupDayPicker(value, legacyFrequency = "") {
  const selected = scheduledDays(value, legacyFrequency);
  const summary = selected.length ? setupWeekdays.filter((day) => selected.includes(day.value)).map((day) => day.label).join(" · ") : "Choose days";
  return `<details class="learn-day-picker"><summary><span>Days</span><strong data-day-summary>${html(summary)}</strong></summary><div class="learn-day-picker-menu">${setupWeekdays.map((day) => `<label><input type="checkbox" data-day-choice value="${day.value}" ${selected.includes(day.value) ? "checked" : ""}>${day.label}</label>`).join("")}</div><input type="hidden" name="scheduledDays" value="${html(selected.join(","))}"></details>`;
}

const sourceTypeOptions = [
  { value: "book", label: "Book - show on Books page" },
  { value: "curriculum", label: "Curriculum / lesson plan" },
  { value: "website", label: "Website / online source" },
  { value: "hymn", label: "Hymn / chant" },
  { value: "icon", label: "Icon / picture study" },
  { value: "activity", label: "Activity / hands-on" },
  { value: "none", label: "Not a book" }
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

function childSetupRow(child = {}, groupingMode = "forms") {
  const groupingField = groupingMode === "forms"
    ? setupSelect("Form", "formLabel", child.formLabel || child.form || "", formOptions)
    : `<input type="hidden" name="formLabel" value="${html(child.formLabel || child.form || "")}" />`;
  return `<div data-setup-row="children" data-id="${html(child.id || "")}" class="learn-family-row learn-child-row"><span class="learn-child-monogram" style="background:${html(child.color || colorChoices[0])};">${html((child.firstName || child.name || "C").charAt(0))}</span>${setupInput("Child name", "firstName", child.firstName || child.name || "")}${setupInput("Age", "ageYears", child.age || "", { type: "number" })}${setupInput("Grade / level", "gradeLabel", child.gradeLabel || child.grade || "")}${groupingField}${setupColorSelect("Color", "color", child.color || colorChoices[0])}${setupRemoveButton()}</div>`;
}

function subjectSetupRow(subject = {}, children = [], terms = [], currentTermId = "", groupingMode = "forms") {
  const groupLabel = groupingMode === "grades" ? "Grade / level" : "Form";
  const groupOptions = setupGroupOptions(children, groupingMode);
  const activeGroupField = groupingMode === "grades"
    ? `${setupSelect(groupLabel, "gradeLabel", subject.gradeLabel || "", [{ value: "", label: "All grades" }, ...groupOptions])}<input type="hidden" name="formLabel" value="${html(subject.formLabel || "")}" />`
    : `${setupSelect(groupLabel, "formLabel", subject.formLabel || "", [{ value: "", label: "All Forms" }, ...groupOptions])}<input type="hidden" name="gradeLabel" value="${html(subject.gradeLabel || "")}" />`;
  return `<div data-setup-row="subjects" data-id="${html(subject.id || "")}" class="learn-setup-row learn-setup-row-subject"><div class="learn-setup-row-main">${setupInput("Subject / skill", "title", subject.title || "")}${setupSelect("School-day area", "subjectType", subject.subjectType || subject.type || "language-arts", subjectTypeOptions)}${setupSelect("Planning Mode", "planningMode", subject.planningMode || "forms", planningModeOptionsFor(groupingMode))}${setupInput("Book / curriculum / source", "resource", subject.resource || "")}${setupSelect("Source type", "resourceType", subject.resourceType || subject.sourceType || (subject.resource ? "curriculum" : "none"), sourceTypeOptions)}${setupSelect("Track by", "progressionType", subject.progressionType || "lessons", ["lessons", "chapters", "pages", "units"])}${setupInput("Start", "startNumber", subject.startNumber || "", { type: "number" })}${setupInput("Done", "currentNumber", subject.currentNumber || subject.startNumber || "", { type: "number" })}${setupInput("End", "endNumber", subject.endNumber || "", { type: "number" })}${setupInput("Minutes", "minutes", subject.minutes || "", { type: "number" })}${setupRemoveButton()}</div><div class="learn-setup-row-meta">${setupSelect("Term", "termId", subject.termId || currentTermId, setupTermOptions(terms, { id: currentTermId, label: "Current Term" }))}${activeGroupField}${setupDayPicker(subject.scheduledDays, subject.weeklyFrequency || subject.cadenceLabel || "daily")}${setupSelect("Specific child", "childId", subject.childId || "", [{ value: "", label: "Use Planning Mode" }, ...children.map((child) => ({ value: child.id, label: child.name }))])}${setupInput("Credits", "credits", subject.credits || "", { type: "number", step: "0.25" })}${setupInput("Final mark", "finalGradeOverride", subject.finalGradeOverride || "")}${setupColorSelect("Planner Color", "color", subject.color || colorChoices[0])}${setupSelect("Grace Mode behavior", "gracePriority", subject.gracePriority || "keep", graceModeOptions)}<span class="learn-setup-grace-note">${setupInput("Grace Mode note", "graceNote", subject.graceNote || "Deferred gracefully to the reserve list.")}</span></div></div>`;
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

function formationEnrichmentSetupRow(block = {}, children = [], terms = [], currentTermId = "", groupingMode = "forms") {
  const groupLabel = groupingMode === "grades" ? "Grade / level" : "Form";
  const groupOptions = setupGroupOptions(children, groupingMode);
  const activeGroupField = groupingMode === "grades"
    ? `${setupSelect(groupLabel, "gradeLabel", block.gradeLabel || "", [{ value: "", label: "All grades" }, ...groupOptions])}<input type="hidden" name="formLabel" value="${html(block.formLabel || "")}" />`
    : `${setupSelect(groupLabel, "formLabel", block.formLabel || "", [{ value: "", label: "All Forms" }, ...groupOptions])}<input type="hidden" name="gradeLabel" value="${html(block.gradeLabel || "")}" />`;
  return `<div data-setup-row="formationEnrichment" data-id="${html(block.id || "")}" class="learn-setup-row learn-setup-row-enrichment"><div class="learn-setup-row-main">${setupSelect("Formation card", "blockType", block.blockType || block.type || "Art Study", ["Catechesis", "Recitation & Memory Work", "Saints & Feasts", "Icon Study", "Hymn Study", "Art Study", "Music Study", "Folk Songs", "Poetry", "Shakespeare", "Nature Study", "Composer", "Timeline"])}${setupInput("Title", "title", block.title || "")}${setupSelect("Planning Mode", "planningMode", block.planningMode || "family", planningModeOptionsFor(groupingMode))}${setupInput("Book / source / resource", "resource", block.resource || block.source || "")}${setupSelect("Source type", "resourceType", block.resourceType || block.sourceType || (block.resource || block.source ? "curriculum" : "none"), sourceTypeOptions)}${setupSelect("Track by", "progressionType", block.progressionType || "lessons", ["lessons", "chapters", "pages", "units"])}${setupInput("Start", "startNumber", block.startNumber || "", { type: "number" })}${setupInput("Done", "currentNumber", block.currentNumber || block.startNumber || "", { type: "number" })}${setupInput("End", "endNumber", block.endNumber || "", { type: "number" })}${setupInput("Minutes", "minutesPlanned", block.minutesPlanned || block.minutes || "", { type: "number" })}${setupRemoveButton()}</div><div class="learn-setup-row-meta">${setupSelect("Term", "termId", block.termId || currentTermId, setupTermOptions(terms, { id: currentTermId, label: "Current Term" }))}${activeGroupField}${setupDayPicker(block.scheduledDays, block.weeklyFrequency || block.cadenceLabel || block.cadence || "1x")}${setupSelect("Specific child", "childId", block.childId || "", [{ value: "", label: "Use Planning Mode" }, ...children.map((child) => ({ value: child.id, label: child.name }))])}${setupInput("Credits", "credits", block.credits || "", { type: "number", step: "0.25" })}${setupInput("Final mark", "finalGradeOverride", block.finalGradeOverride || "")}${setupColorSelect("Planner Color", "color", block.color || colorChoices[2])}${setupSelect("Grace Mode behavior", "gracePriority", block.gracePriority || "keep", graceModeOptions)}<span class="learn-setup-grace-note">${setupInput("Grace Mode note", "graceNote", block.graceNote || "Deferred gracefully to the reserve list.")}</span></div></div>`;
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

function setupTileValue(vm, group, panelId, fallback) {
  const tile = vm.setupTiles?.[group]?.[panelId] || {};
  return {
    ...fallback,
    title: tile.title || fallback.title,
    detail: tile.detail || fallback.detail
  };
}

function setupSectionCard({ group, panel: panelId, title, detail, count = 0, icon = "✥" }) {
  const controls = `learnSetupPanel-${group}-${panelId}`;
  const countLabel = count ? `${count} item${count === 1 ? "" : "s"}` : "Open";
  return `<button type="button" class="learn-setup-section-card" data-setup-section-toggle data-setup-section-group="${html(group)}" data-setup-section-panel="${html(panelId)}" aria-expanded="false" aria-controls="${html(controls)}"><small><span class="learn-setup-card-icon" aria-hidden="true">${html(icon)}</span><span>${html(countLabel)}</span></small><strong data-setup-section-card-title>${html(title)}</strong><span data-setup-section-card-detail>${html(detail)}</span><em>Open</em></button>`;
}

function setupSectionPanel({ group, panel: panelId, title, detail = "", content }) {
  const id = `learnSetupPanel-${group}-${panelId}`;
  return `<div id="${html(id)}" class="learn-setup-subsection" data-setup-section-group="${html(group)}" data-setup-section-panel="${html(panelId)}" hidden><div class="learn-setup-subsection-header"><div><strong data-setup-section-panel-title>${html(title)}</strong>${detail ? `<span data-setup-section-panel-detail>${html(detail)}</span>` : ""}</div><button type="button" class="learn-setup-subsection-close" data-setup-section-close data-setup-section-group="${html(group)}" data-setup-section-panel="${html(panelId)}">Collapse</button></div><div class="learn-setup-tile-editor"><label>Tile title<input name="setupTiles.${html(group)}.${html(panelId)}.title" data-setup-section-title-input data-setup-section-group="${html(group)}" data-setup-section-panel="${html(panelId)}" value="${html(title)}" /></label><label>Tile description<textarea name="setupTiles.${html(group)}.${html(panelId)}.detail" data-setup-section-detail-input data-setup-section-group="${html(group)}" data-setup-section-panel="${html(panelId)}" rows="2">${html(detail)}</textarea></label></div>${content}</div>`;
}

function formationSetupPanel(vm) {
  const formation = vm.formationSetup || {};
  const currentTermId = vm.schoolYear.currentTermId || vm.term.id;
  const enrichmentBlocks = formation.enrichmentBlocks || [];
  const countByType = (type) => enrichmentBlocks.filter((block) => String(block.blockType || block.type || "").toLowerCase() === type.toLowerCase()).length;
  const sections = [
    {
      panel: "catechesis",
      title: "Catechesis",
      detail: "Doctrine, Scripture, faith conversations, and parish formation.",
      icon: "✥",
      type: "Catechesis"
    },
    {
      panel: "recitation",
      title: "Recitation",
      detail: "Creeds, prayers, psalms, Scripture, poems, and speeches.",
      icon: "✦",
      type: "Recitation & Memory Work",
      rows: formation.recitationTracks || [],
      rowKind: "recitation"
    },
    {
      panel: "saints",
      title: "Saints",
      detail: "Lives of saints, feast preparation, and century-book notes.",
      icon: "☰",
      type: "Saints & Feasts"
    },
    { panel: "icons", title: "Icons", detail: "Icon study, sacred art observation, and copywork prompts.", icon: "▣", type: "Icon Study" },
    { panel: "hymns", title: "Hymns", detail: "Troparia, kontakia, hymn study, and singing practice.", icon: "♪", type: "Hymn Study" },
    { panel: "artists", title: "Artists", detail: "Artist study, picture study, and visual narration.", icon: "◎", type: "Art Study" },
    { panel: "composers", title: "Composers", detail: "Composer study, sacred music, and attentive listening.", icon: "♫", type: "Music Study" },
    { panel: "folk-songs", title: "Folk Songs", detail: "Folk songs, seasonal songs, and family singing.", icon: "♬", type: "Folk Songs" },
    { panel: "poetry", title: "Poetry", detail: "Poet study, recitation, copywork, and beautiful language.", icon: "✒", type: "Poetry" },
    { panel: "shakespeare", title: "Shakespeare", detail: "Plays, scenes, narration, and performance notes.", icon: "♜", type: "Shakespeare" }
  ].map((section) => setupTileValue(vm, "formation", section.panel, section));
  const sectionRows = (section) => section.rowKind === "recitation"
    ? (section.rows.length ? section.rows : [{}]).map((track) => formationRecitationSetupRow(track)).join("")
    : (enrichmentBlocks.filter((block) => String(block.blockType || block.type || "").toLowerCase() === section.type.toLowerCase()).length
      ? enrichmentBlocks.filter((block) => String(block.blockType || block.type || "").toLowerCase() === section.type.toLowerCase())
      : [{ blockType: section.type }]).map((block) => formationEnrichmentSetupRow({ ...block, blockType: block.blockType || section.type }, vm.children, vm.terms, currentTermId, vm.preferences.groupingMode)).join("");
  const sectionContent = (section) => section.rowKind === "recitation"
    ? `<div data-setup-list="formationRecitation" style="display:grid;gap:10px;">${sectionRows(section)}</div><button type="button" data-setup-add-row="formationRecitation" style="border:1px solid var(--line);background:var(--paper2);border-radius:10px;padding:10px 16px;font-family:inherit;">Add Recitation</button>`
    : `<div id="learnSetupFormation-${html(section.panel)}" data-setup-list="formationEnrichment" style="display:grid;gap:10px;">${sectionRows(section)}</div><button type="button" data-setup-add-row="formationEnrichment" data-setup-add-target="learnSetupFormation-${html(section.panel)}" data-setup-add-block-type="${html(section.type)}" style="border:1px solid var(--line);background:var(--paper2);border-radius:10px;padding:10px 16px;font-family:inherit;">Add ${html(section.title)}</button>`;
  return `
    <div style="display:grid;gap:14px;">
      <p style="margin:0;color:var(--muted);line-height:1.45;">Choose whether each item is shared by the whole family or assigned by ${vm.preferences.groupingMode === "grades" ? "grade" : "Form"}, then set how often it appears and how long it usually takes.</p>
      <div class="learn-setup-section-grid">${sections.map((section) => setupSectionCard({ group: "formation", ...section, count: section.rowKind === "recitation" ? section.rows.length : countByType(section.type) })).join("")}</div>
      ${sections.map((section) => setupSectionPanel({ group: "formation", panel: section.panel, title: section.title, detail: section.detail, content: sectionContent(section) })).join("")}
    </div>`;
}

function formSubjectsSetupPanel(vm, currentTermId) {
  const subjects = vm.subjects || [];
  const groups = [
    {
      panel: "language",
      title: "Language Arts",
      detail: "Reading, narration, copywork, dictation, grammar, composition, and rhetoric.",
      icon: "✎",
      types: ["language-arts"],
      defaultType: "language-arts"
    },
    {
      panel: "literature",
      title: "Literature",
      detail: "Living books, stories, plays, folk tales, myths, and great tales.",
      icon: "☰",
      types: ["tales", "literature"],
      defaultType: "literature"
    },
    {
      panel: "languages",
      title: "Classical & Foreign Languages",
      detail: "Greek, Latin, modern languages, translation, grammar, and oral practice.",
      icon: "Α",
      types: ["classical-foreign-languages", "foreign-language", "classical-languages", "latin", "greek"],
      defaultType: "classical-foreign-languages"
    },
    {
      panel: "history",
      title: "History",
      detail: "History readings, narrations, timelines, biographies, and term projects.",
      icon: "⌁",
      types: ["history"],
      defaultType: "history"
    },
    {
      panel: "geography",
      title: "Geography",
      detail: "Maps, regions, place study, journeys, and notebook work.",
      icon: "⌖",
      types: ["geography"],
      defaultType: "geography"
    },
    {
      panel: "maths",
      title: "Maths",
      detail: "Lesson ranges, practice, mastery checks, and progress tracking.",
      icon: "◎",
      types: ["math", "maths"],
      defaultType: "math"
    },
    {
      panel: "sciences",
      title: "Sciences",
      detail: "Science, nature study, experiments, notebooks, and observations.",
      icon: "✦",
      types: ["sciences-nature", "science", "nature-study"],
      defaultType: "sciences-nature"
    }
  ].map((group) => setupTileValue(vm, "subjects", group.panel, group));
  const subjectsForGroup = (group) => subjects.filter((subject) => group.types.includes(subject.subjectType || subject.type || "language-arts"));
  return `
    <p style="margin:0 0 12px;color:var(--muted);">Use one list for term-based subject work. Open only the subject family you are planning right now, then assign each row by ${vm.preferences.groupingMode === "grades" ? "grade" : "Form"}, child, term, range, credits, final mark, and Grace Mode behavior.</p>
    <div class="learn-setup-section-grid">
      ${groups.map((group) => setupSectionCard({ group: "subjects", panel: group.panel, title: group.title, detail: group.detail, count: subjectsForGroup(group).length, icon: group.icon })).join("")}
    </div>
    ${groups.map((group) => {
      const rows = subjectsForGroup(group);
      const listId = `learnSetupSubjects-${group.panel}`;
      const renderedRows = (rows.length ? rows : [{ subjectType: group.defaultType }]).map((subject) => subjectSetupRow(subject, vm.children, vm.terms, currentTermId, vm.preferences.groupingMode)).join("");
      const content = `<div id="${html(listId)}" data-setup-list="subjects" style="display:grid;gap:10px;">${renderedRows}</div><button type="button" data-setup-add-row="subjects" data-setup-add-target="${html(listId)}" data-setup-add-subject-type="${html(group.defaultType)}" style="margin-top:12px;border:1px solid var(--line);background:var(--paper2);border-radius:10px;padding:10px 16px;font-family:inherit;">Add ${html(group.title)} Subject</button>`;
      return setupSectionPanel({ group: "subjects", panel: group.panel, title: group.title, detail: group.detail, content });
    }).join("")}`;
}

function setupStepTarget(step) {
  const text = `${step.id || ""} ${step.title || ""}`.toLowerCase();
  if (text.includes("child") || text.includes("form")) return "learnSetupChildren";
  if (text.includes("stream")) return "learnSetupFormation";
  if (text.includes("language") || text.includes("math") || text.includes("science") || text.includes("subject") || text.includes("curriculum")) return "learnSetupSubjects";
  if (text.includes("literature") || text.includes("book") || text.includes("read")) return "learnSetupSubjects";
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

const SIMPLE_SETUP_STEPS = ["Household", "Rhythm", "Forms or Grades", "Children", "Grace Mode", "Starter Week"];

function simpleSetupDraftKey() {
  let identity = localStorage.getItem("agapayDonorEmail") || "household";
  try {
    const profile = JSON.parse(localStorage.getItem("agapayDonorProfile") || "{}");
    identity = profile.email || identity;
  } catch {
    // A malformed cached profile should not block local wizard progress.
  }
  return `agapay.learn.simpleSetup.v1:${String(identity).toLowerCase().replace(/[^a-z0-9@._-]/g, "")}`;
}

function suggestedFormForChild(child = {}) {
  const age = Number.parseInt(child.ageYears, 10);
  if (Number.isFinite(age)) {
    if (age <= 5) return "Little Ones";
    if (age <= 8) return "Form I";
    if (age <= 11) return "Form II";
    if (age <= 14) return "Form III";
    if (age <= 16) return "Form IV";
    return "Form V";
  }
  const grade = String(child.gradeLabel || "").toLowerCase();
  const number = Number.parseInt(grade.match(/\d+/)?.[0] || "", 10);
  if (grade.includes("pre") || grade.includes("kindergarten") || grade === "k") return "Little Ones";
  if (Number.isFinite(number)) {
    if (number <= 3) return "Form I";
    if (number <= 6) return "Form II";
    if (number <= 9) return "Form III";
    if (number <= 11) return "Form IV";
    return "Form V";
  }
  return "Form I";
}

function defaultSimpleSetupDraft(vm = {}) {
  const existingChildren = Array.isArray(vm.children) ? vm.children.map((child, index) => ({
    id: child.id || "",
    clientId: child.id || `child_${Date.now()}_${index}`,
    firstName: child.firstName || child.name || "",
    ageYears: String(child.age || ""),
    gradeLabel: child.grade || "",
    formLabel: child.formLabel || child.form || ""
  })) : [];
  return {
    step: 0,
    householdName: vm.household?.name || "",
    parentName: vm.household?.parentName || "",
    calendarType: vm.preferences?.calendarType || "julian",
    children: existingChildren.length ? existingChildren : [{ id: "", clientId: `child_${Date.now()}`, firstName: "", ageYears: "", gradeLabel: "", formLabel: "" }],
    useForms: true,
    method: vm.household?.method || "Unsure",
    starterWeek: true
  };
}

function loadSimpleSetupDraft(vm) {
  const fallback = defaultSimpleSetupDraft(vm);
  try {
    const stored = JSON.parse(localStorage.getItem(simpleSetupDraftKey()) || "null");
    if (!stored || typeof stored !== "object") return fallback;
    return {
      ...fallback,
      ...stored,
      step: Math.max(0, Math.min(SIMPLE_SETUP_STEPS.length - 1, Number(stored.step) || 0)),
      children: Array.isArray(stored.children) && stored.children.length
        ? stored.children.map((child, index) => ({
          clientId: child.clientId || `child_${Date.now()}_${index}`,
            id: String(child.id || ""),
            firstName: String(child.firstName || ""),
            ageYears: String(child.ageYears || ""),
            gradeLabel: String(child.gradeLabel || ""),
            formLabel: String(child.formLabel || "")
          }))
        : fallback.children
    };
  } catch {
    return fallback;
  }
}

function saveSimpleSetupDraft(draft) {
  localStorage.setItem(simpleSetupDraftKey(), JSON.stringify(draft));
}

function simpleSetupField(label, name, value = "", options = {}) {
  const type = options.type || "text";
  const placeholder = options.placeholder ? ` placeholder="${html(options.placeholder)}"` : "";
  const min = options.min !== undefined ? ` min="${html(options.min)}"` : "";
  const max = options.max !== undefined ? ` max="${html(options.max)}"` : "";
  return `<label class="learn-wizard-field"><span>${html(label)}</span><input name="${html(name)}" type="${html(type)}" value="${html(value)}"${placeholder}${min}${max}></label>`;
}

function simpleSetupStepBody(draft) {
  if (draft.step === 0) {
    return `<div class="learn-wizard-step-copy"><span>Begin with the people, not the paperwork.</span><h2>Tell us about your household.</h2><p>This is enough to personalize Learn. You can add parish, terms, books, and detailed subjects later.</p></div><div class="learn-wizard-fields">${simpleSetupField("Household name", "wizard.householdName", draft.householdName, { placeholder: "The Dunn Family" })}${simpleSetupField("Your name", "wizard.parentName", draft.parentName, { placeholder: "Stephanie" })}<label class="learn-wizard-field"><span>Church calendar</span><select name="wizard.calendarType"><option value="julian" ${draft.calendarType === "julian" ? "selected" : ""}>Old Calendar (Julian)</option><option value="revised-julian" ${draft.calendarType === "revised-julian" ? "selected" : ""}>New Calendar (Revised Julian)</option></select></label></div>`;
  }
  if (draft.step === 1) {
    const methods = [
      ["Charlotte Mason", "Living books, narration, short lessons, and generous enrichment."],
      ["Orthodox Classical", "Classical formation, language, history, and ordered study."],
      ["Traditional", "Familiar subjects, grade-level structure, and steady daily practice."],
      ["Eclectic", "A flexible blend chosen to fit each child and season."],
      ["Unsure", "Start gently now and refine your approach later."]
    ];
    return `<div class="learn-wizard-step-copy"><span>Your household rhythm</span><h2>Which approach feels closest?</h2><p>This shapes the order and language of Advanced Setup. It never locks you into a curriculum, and changing it later never deletes saved work.</p></div><div class="learn-wizard-methods">${methods.map(([value, detail]) => `<label><input type="radio" name="wizard.method" value="${html(value)}" ${draft.method === value ? "checked" : ""}><span><strong>${html(value === "Orthodox Classical" ? "Classical" : value)}</strong><small>${html(detail)}</small></span></label>`).join("")}</div>`;
  }
  if (draft.step === 2) {
    return `<div class="learn-wizard-step-copy"><span>Choose your planning structure</span><h2>Would you rather use Forms or familiar grades?</h2><p>A Form is a flexible group of children learning at a similar stage. Forms make shared work easier; grades keep the familiar structure many families already use.</p></div><label class="learn-wizard-choice-toggle"><input type="checkbox" name="wizard.useForms" ${draft.useForms ? "checked" : ""}><span><strong>Plan with Forms</strong><small>After you add your children, Learn will suggest a Form from each age or grade. You can adjust every suggestion.</small></span></label>${draft.useForms ? `<div class="learn-wizard-gentle-note"><strong>Forms selected.</strong><span>Next, add each child. Learn will suggest Little Ones, Form I, Form II, and beyond based on the information you enter.</span></div>` : `<div class="learn-wizard-gentle-note"><strong>Use familiar grades instead.</strong><span>Learn will organize children and assignments by grade or level. You can switch to Forms later without losing saved assignments.</span></div>`}`;
  }
  if (draft.step === 3) {
    return `<div class="learn-wizard-step-copy"><span>Your learners</span><h2>Add the children learning at home.</h2><p>First name plus either age or grade is enough.${draft.useForms ? " Learn will suggest a Form for each child as you enter them." : " Learn will use the grade or level you enter."}</p></div><div class="learn-wizard-plan-note"><strong>Free plan: up to 2 children</strong><span>Family plans include unlimited children, Forms, child sheets, and full household planning.</span></div><div class="learn-wizard-children">${draft.children.map((child, index) => { const suggested = child.formLabel || suggestedFormForChild(child); const formField = draft.useForms ? `<label class="learn-wizard-field"><span>Suggested Form</span><select name="formLabel">${formOptions.map((option) => `<option value="${html(option)}" ${option === suggested ? "selected" : ""}>${html(option)}</option>`).join("")}</select></label>` : ""; return `<div class="learn-wizard-child${draft.useForms ? " uses-forms" : ""}" data-wizard-child="${index}" data-client-id="${html(child.clientId)}"><span class="learn-wizard-child-number">${index + 1}</span>${simpleSetupField("First name", "firstName", child.firstName, { placeholder: "Maria" })}${simpleSetupField("Age", "ageYears", child.ageYears, { type: "number", min: 0, max: 21 })}${simpleSetupField("Grade or level", "gradeLabel", child.gradeLabel, { placeholder: "Grade 3 or Kindergarten" })}${formField}${draft.children.length > 1 ? `<button type="button" class="learn-wizard-icon-button" data-wizard-remove-child="${index}" aria-label="Remove ${html(child.firstName || `child ${index + 1}`)}">×</button>` : ""}</div>`; }).join("")}</div><button type="button" class="learn-wizard-add" data-wizard-add-child>${!isLearnFamilyPlan() && draft.children.length >= 2 ? "Upgrade to add another child" : "+ Add another child"}</button>`;
  }
  if (draft.step === 4) {
    return `<div class="learn-wizard-step-copy"><span>A gentler way through real life</span><h2>Meet Grace Mode.</h2><p>Your plan should serve your family, not punish it. Grace Mode lets you lighten a difficult day without deleting work or pretending the plan never existed.</p></div><aside class="learn-wizard-grace-explainer"><div><small>Built for real family life</small><h3>Grace Mode lightens a day without erasing the plan.</h3><p>Use it for illness, a new baby, travel, feast days, difficult mornings, or any season when the full plan is too much. Deferred work stays in your plan and can return when the household is ready.</p></div><div class="learn-wizard-grace-levels"><span><strong>Full</strong><small>Runs the complete day as planned.</small></span><span><strong>Light</strong><small>Keeps essentials and softens lower-priority work.</small></span><span><strong>Minimum</strong><small>Keeps prayer, one shared touchpoint, and the next right thing.</small></span></div><p class="learn-wizard-grace-tip"><strong>How to use it:</strong> choose today’s mode at the top of the Learn Dashboard. In Advanced Setup, each subject can be marked “keep,” “reduce first,” or “defer if needed,” so you remain in control.</p></aside><div class="learn-wizard-gentle-note"><strong>No permanent choice is required.</strong><span>You can change Grace Mode from day to day as family life changes.</span></div>`;
  }
  return `<div class="learn-wizard-step-copy"><span>Ready for Today</span><h2>Would you like a simple starter week?</h2><p>AGAPAY will save a real editable first term, Daily Church Rhythms, family read-aloud, nature walk, and starter subject plan organized by ${draft.useForms ? "Form" : "grade or level"}. Nothing is sample-only or locked.</p></div><label class="learn-wizard-starter"><input type="checkbox" name="wizard.starterWeek" ${draft.starterWeek ? "checked" : ""}><span><strong>Create a gentle starter week</strong><small>Creates Morning Prayers, Daily Readings, Saint of the Day, family read-aloud, nature walk, plus editable Language Arts, Mathematics, History, Geography, Literature, and Science subjects for every ${draft.useForms ? "Form" : "grade or level"}.</small></span></label><div class="learn-wizard-summary"><div><small>Household</small><strong>${html(draft.householdName || "Your household")}</strong></div><div><small>Children</small><strong>${draft.children.filter((child) => child.firstName).length}</strong></div><div><small>Planning</small><strong>${draft.useForms ? "Family + Forms" : "Family + grades"}</strong></div><div><small>Style</small><strong>${html(draft.method === "Orthodox Classical" ? "Classical" : draft.method)}</strong></div></div>`;
}

function renderSimpleSetupWizard(vm, draft) {
  const body = `<section class="learn-wizard" data-simple-setup-wizard data-wizard-step="${draft.step}">
    <div class="learn-wizard-topline"><div><span>Simple Setup</span><strong>Step ${draft.step + 1} of ${SIMPLE_SETUP_STEPS.length}</strong></div><a href="/myagapay/learn/setup?advanced=1" data-wizard-advanced>Advanced Setup</a></div>
    <div class="learn-wizard-progress" aria-label="Setup progress">${SIMPLE_SETUP_STEPS.map((label, index) => `<span class="${index < draft.step ? "is-complete" : index === draft.step ? "is-current" : ""}"><i>${index < draft.step ? "✓" : index + 1}</i><em>${html(label)}</em></span>`).join("")}</div>
    <form class="learn-wizard-card">${simpleSetupStepBody(draft)}<p class="learn-wizard-status" data-wizard-status aria-live="polite"></p><div class="learn-wizard-actions">${draft.step ? `<button type="button" class="learn-wizard-secondary" data-wizard-back>Back</button>` : `<a class="learn-wizard-secondary" href="/myagapay/learn/setup?advanced=1" data-wizard-advanced>Skip to full setup</a>`}<button type="button" class="learn-wizard-primary" ${draft.step === SIMPLE_SETUP_STEPS.length - 1 ? "data-wizard-finish" : "data-wizard-next"}>${draft.step === SIMPLE_SETUP_STEPS.length - 1 ? "Save & open Today" : "Continue"}</button></div></form>
    <p class="learn-wizard-draft-note">Your progress is saved on this device until setup is complete.</p>
  </section>`;
  return shell(vm, body);
}

function renderCommunity(vm) {
  const filterOptions = (values) => values.map((value) => `<option value="${html(value)}">${html(value)}</option>`).join("");
  const facebookAction = vm.facebookGroupUrl
    ? `<a href="${html(vm.facebookGroupUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;justify-content:center;gap:9px;background:var(--navy);color:#fffaf0;border:1px solid var(--gold);border-radius:10px;padding:11px 17px;text-decoration:none;font-weight:800;">Visit the Facebook Group <span aria-hidden="true">↗</span></a>`
    : `<span style="display:inline-flex;align-items:center;border:1px solid var(--line);background:var(--paper2);border-radius:999px;padding:7px 12px;color:var(--gold);font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">Facebook group opening soon</span>`;
  const cards = vm.resources.map((resource) => `<article data-community-card data-category="${html(resource.category)}" data-resource-type="${html(resource.resourceType)}" data-media-type="${html(resource.mediaType)}" data-search="${html(`${resource.title} ${resource.category} ${resource.resourceType} ${resource.mediaType} ${resource.ageRange} ${resource.desc} ${resource.tags.join(" ")}`.toLowerCase())}" style="background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:12px;box-shadow:0 1px 3px rgba(20,40,70,.04);min-height:286px;">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;"><span style="width:46px;height:46px;border-radius:12px;background:${softColor(resource.color, "28")};color:${html(resource.color)};display:grid;place-items:center;font-size:23px;border:1px solid ${softColor(resource.color, "44")};">✥</span>${resource.vetted ? `<span style="border:1px solid rgba(54,95,59,.28);background:#edf6ef;color:#365f3b;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:800;letter-spacing:.08em;">AGAPAY CURATED</span>` : ""}</div>
    <div><small style="display:block;color:var(--gold);font-weight:800;letter-spacing:.1em;text-transform:uppercase;">${html(resource.category)}</small><strong style="display:block;font-family:'Cormorant Garamond',serif;font-size:24px;line-height:1.08;margin-top:4px;color:var(--ink);">${html(resource.title)}</strong></div>
    <p style="font-size:14px;color:#3a4256;line-height:1.45;flex:1;margin:0;">${html(resource.desc)}</p>
    <div style="display:flex;gap:6px;flex-wrap:wrap;"><span style="font-size:11px;border:1px solid var(--line);border-radius:6px;padding:4px 7px;color:var(--muted);">${html(resource.resourceType)}</span><span style="font-size:11px;border:1px solid var(--line);border-radius:6px;padding:4px 7px;color:var(--muted);">${html(resource.mediaType)}</span><span style="font-size:11px;border:1px solid var(--line);border-radius:6px;padding:4px 7px;color:var(--muted);">${html(resource.ageRange)}</span></div>
    <div style="display:flex;align-items:center;gap:9px;border-top:1px solid var(--line);padding-top:11px;"><a href="${html(resource.url)}" target="_blank" rel="noopener noreferrer" style="flex:1;display:flex;align-items:center;justify-content:space-between;gap:10px;color:var(--navy);font-weight:800;text-decoration:none;">Open resource <span style="color:var(--gold);">↗</span></a>${resource.source === "community" ? `<button type="button" data-community-flag="${html(resource.id)}" title="Flag this resource for admin review" style="border:1px solid var(--line);background:var(--paper2);color:var(--muted);border-radius:8px;padding:6px 9px;font:inherit;font-size:12px;cursor:pointer;">Flag</button>` : ""}</div>
  </article>`).join("");
  return shell(vm, `
    <section data-screen-label="Community Resources" style="display:flex;flex-direction:column;gap:18px;">
      <div class="learn-community-hero" style="background:var(--paper);border:1px solid var(--line);border-radius:16px;padding:clamp(20px,4vw,30px);display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:22px;align-items:center;color:var(--ink);box-shadow:0 1px 3px rgba(20,40,70,.04);">
        <div><div style="color:var(--gold);font-size:11px;letter-spacing:.18em;font-weight:800;text-transform:uppercase;">Moms helping moms</div><h2 style="font-family:'Cormorant Garamond',serif;font-size:clamp(34px,5vw,50px);line-height:.98;margin:8px 0 10px;color:var(--ink);">A thoughtful Orthodox homeschool community.</h2><p style="line-height:1.55;color:#3a4256;margin:0;max-width:700px;">Ask practical questions, share encouragement, and learn from families walking the same road. The conversation lives in our moderated Facebook group.</p></div>
        <div style="display:flex;flex-direction:column;align-items:flex-start;gap:11px;border-left:1px solid var(--line);padding-left:22px;"><strong style="font-family:'Cormorant Garamond',serif;font-size:25px;color:var(--ink);">Join the conversation</strong><span style="color:var(--muted);line-height:1.4;">Questions, curriculum experiences, feast-day ideas, and the ordinary wisdom of Orthodox homeschool life.</span>${facebookAction}<button type="button" data-community-suggest style="border:1px solid var(--gold);background:var(--paper2);color:var(--navy);border-radius:10px;padding:10px 15px;font:inherit;font-weight:800;cursor:pointer;">Suggest a resource</button></div>
      </div>
      <div class="learn-community-filters" style="background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:16px;display:grid;grid-template-columns:minmax(220px,1.5fr) repeat(3,minmax(150px,.7fr));gap:10px;align-items:end;">
        <label style="display:grid;gap:5px;color:var(--gold);font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;">Search<input data-community-search type="search" placeholder="Search saints, history, audio, books..." style="border:1px solid var(--line);border-radius:9px;background:var(--paper2);padding:11px 12px;font:inherit;color:var(--ink);min-width:0;"></label>
        <label style="display:grid;gap:5px;color:var(--gold);font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;">Subject<select data-community-category style="border:1px solid var(--line);border-radius:9px;background:var(--paper2);padding:11px 10px;font:inherit;color:var(--ink);min-width:0;">${filterOptions(vm.categories)}</select></label>
        <label style="display:grid;gap:5px;color:var(--gold);font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;">Resource type<select data-community-resource-type style="border:1px solid var(--line);border-radius:9px;background:var(--paper2);padding:11px 10px;font:inherit;color:var(--ink);min-width:0;">${filterOptions(vm.resourceTypes)}</select></label>
        <label style="display:grid;gap:5px;color:var(--gold);font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;">Media<select data-community-media-type style="border:1px solid var(--line);border-radius:9px;background:var(--paper2);padding:11px 10px;font:inherit;color:var(--ink);min-width:0;">${filterOptions(vm.mediaTypes)}</select></label>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;"><div data-community-count style="color:var(--muted);font-size:13px;">Showing ${vm.resources.length} curated resources</div><small style="color:var(--muted);">Links open in a new tab.</small></div>
      <div data-community-empty hidden style="border:1px dashed var(--gold);border-radius:14px;background:var(--paper);padding:28px;text-align:center;color:var(--muted);">No resources match those filters yet. Try a broader search.</div>
      <div data-community-grid style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,275px),1fr));gap:14px;">${cards}</div>
      <div data-community-suggest-dialog hidden style="position:fixed;inset:0;z-index:90;background:rgba(4,20,39,.72);padding:20px;align-items:center;justify-content:center;"><form data-community-suggest-form style="width:min(560px,100%);max-height:90vh;overflow:auto;background:var(--cream);border:1px solid var(--gold);border-radius:16px;box-shadow:0 22px 70px rgba(0,0,0,.35);"><div style="padding:19px 22px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:12px;"><div><h2 style="font-family:'Cormorant Garamond',serif;font-size:28px;margin:0;">Suggest a Resource</h2><small style="color:var(--muted);">Submissions are reviewed before appearing in the library.</small></div><button type="button" data-community-suggest-close aria-label="Close" style="border:0;background:transparent;font-size:24px;color:var(--muted);cursor:pointer;">×</button></div><div style="padding:20px 22px;display:grid;grid-template-columns:1fr 1fr;gap:12px;"><label style="grid-column:1/-1;display:grid;gap:5px;">Title<input name="title" required maxlength="120" style="border:1px solid var(--line);border-radius:9px;padding:10px;font:inherit;"></label><label style="grid-column:1/-1;display:grid;gap:5px;">Link<input name="url" type="url" required style="border:1px solid var(--line);border-radius:9px;padding:10px;font:inherit;"></label><label style="display:grid;gap:5px;">Subject<input name="category" placeholder="Catechesis, History..." style="border:1px solid var(--line);border-radius:9px;padding:10px;font:inherit;"></label><label style="display:grid;gap:5px;">Resource type<input name="resourceType" placeholder="Book, Website, Printable..." style="border:1px solid var(--line);border-radius:9px;padding:10px;font:inherit;"></label><label style="display:grid;gap:5px;">Media type<input name="mediaType" placeholder="Article, Audio, PDF..." style="border:1px solid var(--line);border-radius:9px;padding:10px;font:inherit;"></label><label style="display:grid;gap:5px;">Age range<input name="ageRange" placeholder="Family, Form II..." style="border:1px solid var(--line);border-radius:9px;padding:10px;font:inherit;"></label><label style="grid-column:1/-1;display:grid;gap:5px;">Tags<input name="tags" placeholder="saints, narration, feast days" style="border:1px solid var(--line);border-radius:9px;padding:10px;font:inherit;"></label><label style="grid-column:1/-1;display:grid;gap:5px;">Why it is helpful<textarea name="description" required maxlength="600" rows="4" style="border:1px solid var(--line);border-radius:9px;padding:10px;font:inherit;resize:vertical;"></textarea></label><div data-community-suggest-status style="grid-column:1/-1;color:var(--muted);font-size:13px;"></div></div><div style="padding:15px 22px;border-top:1px solid var(--line);display:flex;justify-content:flex-end;gap:9px;"><button type="button" data-community-suggest-close style="border:1px solid var(--line);background:var(--paper);border-radius:9px;padding:10px 15px;font:inherit;cursor:pointer;">Cancel</button><button type="submit" style="border:1px solid var(--gold);background:var(--navy);color:#fff;border-radius:9px;padding:10px 16px;font:inherit;font-weight:800;cursor:pointer;">Send for Review</button></div></form></div>
    </section>
  `);
}

function renderReportsComingSoon(vm) {
  return shell(vm, `
    <section data-screen-label="Reports" class="learn-coming-soon-page">
      <div class="learn-coming-soon-mark" aria-hidden="true">▥</div>
      <p>Future Learn Feature</p>
      <h2>Beautiful records, without the institutional clutter.</h2>
      <span>Reports are intentionally parked while AGAPAY Learn focuses on a dependable Today dashboard, adaptive setup, planning, formation, books, and printable household plans.</span>
      <div class="learn-coming-soon-list">
        <strong>Planned for Reports</strong>
        <span>Progress summaries by child, Form, or grade</span>
        <span>Report cards and year-end household records</span>
        <span>Transcript-ready academic exports</span>
        <span>Printable state-reporting support</span>
      </div>
      <a href="/myagapay/learn" class="learn-coming-soon-action">Back to Today</a>
    </section>`);
}

function captureSimpleSetupStep(form, draft) {
  const value = (name) => form.elements[name]?.value?.trim() || "";
  if (draft.step === 0) {
    draft.householdName = value("wizard.householdName");
    draft.parentName = value("wizard.parentName");
    draft.calendarType = value("wizard.calendarType") || "julian";
  } else if (draft.step === 1) {
    draft.method = form.querySelector('[name="wizard.method"]:checked')?.value || "Unsure";
  } else if (draft.step === 2) {
    draft.useForms = Boolean(form.elements["wizard.useForms"]?.checked);
    if (!draft.useForms) draft.children.forEach((child) => { child.formLabel = ""; });
  } else if (draft.step === 3) {
    draft.children = [...form.querySelectorAll("[data-wizard-child]")].map((row, index) => ({
      clientId: row.dataset.clientId || `child_${Date.now()}_${index}`,
      id: draft.children[index]?.id || "",
      firstName: row.querySelector('[name="firstName"]')?.value.trim() || "",
      ageYears: row.querySelector('[name="ageYears"]')?.value.trim() || "",
      gradeLabel: row.querySelector('[name="gradeLabel"]')?.value.trim() || "",
      formLabel: draft.useForms ? row.querySelector('[name="formLabel"]')?.value || suggestedFormForChild({
        ageYears: row.querySelector('[name="ageYears"]')?.value.trim() || "",
        gradeLabel: row.querySelector('[name="gradeLabel"]')?.value.trim() || ""
      }) : ""
    }));
  } else if (draft.step === SIMPLE_SETUP_STEPS.length - 1) {
    draft.starterWeek = Boolean(form.elements["wizard.starterWeek"]?.checked);
  }
  saveSimpleSetupDraft(draft);
}

function validateSimpleSetupStep(draft) {
  if (draft.step === 0 && (!draft.householdName || !draft.parentName)) return "Please add the household name and your name.";
  if (draft.step === 3) {
    const children = draft.children.filter((child) => child.firstName);
    if (!children.length) return "Please add at least one child.";
    if (children.some((child) => !child.ageYears && !child.gradeLabel)) return "Add an age or grade for each child so Learn can suggest the right Form.";
  }
  return "";
}

function simpleSetupDates() {
  const today = new Date();
  const academicStartYear = today.getMonth() >= 5 ? today.getFullYear() : today.getFullYear() - 1;
  const termEnd = new Date(today);
  termEnd.setDate(termEnd.getDate() + 84);
  const iso = (date) => date.toISOString().slice(0, 10);
  return {
    yearLabel: `${academicStartYear}-${academicStartYear + 1} School Year`,
    yearStart: iso(today),
    yearEnd: `${academicStartYear + 1}-06-30`,
    termStart: iso(today),
    termEnd: iso(termEnd)
  };
}

function simpleSetupPayload(draft, existingSnapshot = null) {
  const dates = simpleSetupDates();
  const colors = ["#14294a", "#6e2f2a", "#4a5a31", "#b5942f", "#4b3158"];
  const children = draft.children.filter((child) => child.firstName).map((child, index) => ({
    id: child.id || "",
    firstName: child.firstName,
    ageYears: child.ageYears,
    gradeLabel: child.gradeLabel,
    formLabel: draft.useForms ? child.formLabel || suggestedFormForChild(child) : "",
    color: colors[index % colors.length]
  }));
  const planningGroups = [...new Set(children.map((child) => draft.useForms ? child.formLabel : child.gradeLabel).filter(Boolean))];
  if (!planningGroups.length) planningGroups.push("");
  const existingHasPlan = Boolean(existingSnapshot?.subjects?.length || existingSnapshot?.formation?.enrichmentBlocks?.length);
  const createStarterWeek = draft.starterWeek && !existingHasPlan;
  const starterAssignment = (groupLabel) => draft.useForms ? { formLabel: groupLabel } : { gradeLabel: groupLabel };
  const starterSubjectSlate = [
    { title: "Language Arts", subjectType: "language-arts", weeklyFrequency: "4x", minutes: "20", gracePriority: "keep" },
    { title: "Mathematics", subjectType: "math", weeklyFrequency: "4x", minutes: "20", gracePriority: "keep" },
    { title: "History", subjectType: "history", weeklyFrequency: "3x", minutes: "25", gracePriority: "keep" },
    { title: "Geography", subjectType: "geography", weeklyFrequency: "2x", minutes: "20", gracePriority: "reduce first" },
    { title: "Literature", subjectType: "literature", weeklyFrequency: "3x", minutes: "20", gracePriority: "keep" },
    { title: "Science", subjectType: "sciences-nature", weeklyFrequency: "2x", minutes: "25", gracePriority: "reduce first" }
  ];
  const subjects = createStarterWeek ? planningGroups.flatMap((groupLabel, groupIndex) => starterSubjectSlate.map((subject, subjectIndex) => ({
    ...subject,
    planningMode: draft.useForms ? "forms" : "grades",
    ...starterAssignment(groupLabel),
    termId: "term_1",
    resource: "",
    resourceType: "none",
    color: colors[(groupIndex + subjectIndex) % colors.length]
  }))) : [];
  const starterTerm = { id: "term_1", label: "Starter Term", startDate: dates.termStart, endDate: dates.termEnd, paceMode: "steady" };
  const starterFormation = {
    churchRhythms: [
      { title: "Morning Prayers", note: "Begin together", weeklyFrequency: "daily", minutes: 10 },
      { title: "Daily Readings", note: "Epistle and Gospel", weeklyFrequency: "daily", minutes: 10 },
      { title: "Saint of the Day", note: "Read and discuss", weeklyFrequency: "daily", minutes: 10 }
    ],
    recitationTracks: [], hymnStudies: [], feasts: [],
    enrichmentBlocks: [
      { blockType: "Literature", title: "Family Read-Aloud", planningMode: "family", weeklyFrequency: "daily", minutesPlanned: 20, termId: "term_1", gracePriority: "keep" },
      { blockType: "Nature Study", title: "Nature Walk", planningMode: "family", weeklyFrequency: "1x", minutesPlanned: 30, termId: "term_1", gracePriority: "reduce first" }
    ]
  };
  return {
    ...(existingSnapshot || {}),
    household: { ...(existingSnapshot?.household || {}), name: draft.householdName, parentName: draft.parentName, parentNames: [draft.parentName], primaryMethod: draft.method },
    schoolYear: existingSnapshot?.schoolYear || { id: "school_year_current", label: dates.yearLabel, startDate: dates.yearStart, endDate: dates.yearEnd, currentTermId: "term_1" },
    term: existingSnapshot?.term || starterTerm,
    terms: existingSnapshot?.terms?.length ? existingSnapshot.terms : [starterTerm],
    preferences: { ...(existingSnapshot?.preferences || {}), calendarType: draft.calendarType, groupingMode: draft.useForms ? "forms" : "grades", evaluationModel: existingSnapshot?.preferences?.evaluationModel || "narrative-only", graceModeDefault: existingSnapshot?.preferences?.graceModeDefault || "light", graceModeActive: Boolean(existingSnapshot?.preferences?.graceModeActive), paceMode: "steady" },
    children,
    streams: createStarterWeek ? [{ title: "Morning Time", streamType: "morning-time", cadenceLabel: "Daily", dailyMinutes: { mon: 30, tue: 30, wed: 30, thu: 30, fri: 30 } }] : existingSnapshot?.streams || [],
    subjects: createStarterWeek ? subjects : existingSnapshot?.subjects || [],
    books: existingSnapshot?.books || [],
    formation: createStarterWeek ? starterFormation : existingSnapshot?.formation || { churchRhythms: [], recitationTracks: [], hymnStudies: [], enrichmentBlocks: [], feasts: [] },
    formationMaterials: existingSnapshot?.formationMaterials || [],
    completion: existingSnapshot?.completion || { daily: {}, weekly: {} },
    starterWeek: createStarterWeek ? { enabled: true, generatedAt: new Date().toISOString() } : existingSnapshot?.starterWeek || null,
    coOp: existingSnapshot?.coOp || { enabled: false, status: "coming-soon" }
  };
}

function applySimpleDraftToSetupVm(vm, draft) {
  vm.household.name = draft.householdName || vm.household.name;
  vm.household.parentName = draft.parentName || vm.household.parentName;
  vm.household.method = draft.method || vm.household.method;
  vm.preferences.calendarType = draft.calendarType || vm.preferences.calendarType;
  vm.preferences.groupingMode = draft.useForms ? "forms" : "grades";
  const draftedChildren = draft.children.filter((child) => child.firstName).map((child, index) => ({
    id: "", name: child.firstName, firstName: child.firstName, age: child.ageYears, grade: child.gradeLabel,
    form: draft.useForms ? child.formLabel || suggestedFormForChild(child) : "",
    formLabel: draft.useForms ? child.formLabel || suggestedFormForChild(child) : "",
    color: colorChoices[index % colorChoices.length]
  }));
  if (draftedChildren.length) vm.children = draftedChildren;
  return vm;
}

function wireSimpleSetupWizard(vm, draft, existingSnapshot = null) {
  const form = root.querySelector("[data-simple-setup-wizard] form");
  if (!form) return;
  const status = form.querySelector("[data-wizard-status]");
  const rerender = () => {
    root.innerHTML = renderSimpleSetupWizard(vm, draft);
    wireSimpleSetupWizard(vm, draft, existingSnapshot);
    root.querySelector(".learn-wizard")?.scrollIntoView({ block: "start" });
  };
  form.addEventListener("input", () => captureSimpleSetupStep(form, draft));
  form.addEventListener("change", (event) => {
    captureSimpleSetupStep(form, draft);
    if (event.target.name === "wizard.useForms") rerender();
  });
  form.addEventListener("click", async (event) => {
    const addChild = event.target.closest("[data-wizard-add-child]");
    if (addChild) {
      captureSimpleSetupStep(form, draft);
      if (!isLearnFamilyPlan() && draft.children.length >= 2) {
        showLearnDialog("Upgrade to Add Another Child", "The free AGAPAY Learn plan includes up to two children. Your wizard progress is saved, so you can upgrade without starting over.", [
          { label: "Free plan", value: "Up to 2 children" }, { label: "Family plan", value: "Unlimited children" }
        ], { upgrade: true });
        return;
      }
      draft.children.push({ id: "", clientId: `child_${Date.now()}`, firstName: "", ageYears: "", gradeLabel: "", formLabel: "" });
      saveSimpleSetupDraft(draft);
      rerender();
      return;
    }
    const removeChild = event.target.closest("[data-wizard-remove-child]");
    if (removeChild) {
      captureSimpleSetupStep(form, draft);
      draft.children.splice(Number(removeChild.dataset.wizardRemoveChild), 1);
      saveSimpleSetupDraft(draft);
      rerender();
      return;
    }
    if (event.target.closest("[data-wizard-back]")) {
      captureSimpleSetupStep(form, draft);
      draft.step = Math.max(0, draft.step - 1);
      saveSimpleSetupDraft(draft);
      rerender();
      return;
    }
    if (event.target.closest("[data-wizard-next]")) {
      captureSimpleSetupStep(form, draft);
      const error = validateSimpleSetupStep(draft);
      if (error) { status.textContent = error; return; }
      if (draft.step === 3 && draft.useForms) draft.children.forEach((child) => { child.formLabel ||= suggestedFormForChild(child); });
      draft.step = Math.min(SIMPLE_SETUP_STEPS.length - 1, draft.step + 1);
      saveSimpleSetupDraft(draft);
      rerender();
      return;
    }
    const finish = event.target.closest("[data-wizard-finish]");
    if (!finish) return;
    captureSimpleSetupStep(form, draft);
    finish.disabled = true;
    status.textContent = "Preparing your AGAPAY Learn dashboard...";
    try {
      await apiPost("/api/learn/setup", simpleSetupPayload(draft, existingSnapshot));
      localStorage.setItem("agapay.learn.calendar", draft.calendarType || "julian");
      localStorage.removeItem(simpleSetupDraftKey());
      window.location.href = "/myagapay/learn";
    } catch (error) {
      status.textContent = error.message;
      finish.disabled = false;
    }
  });
}

function setupExperience(method = "Unsure", groupingMode = "forms") {
  const groupName = groupingMode === "grades" ? "Grade-Level" : "Form";
  const profiles = {
    "Charlotte Mason": {
      order: ["church", "enrichment", "subjects"],
      subjectTitle: `${groupName} Subjects`,
      note: "Living books, short lessons, narration, and generous enrichment are arranged around the household's Church rhythm."
    },
    "Orthodox Classical": {
      order: ["church", "subjects", "enrichment"],
      subjectTitle: groupingMode === "grades" ? "Classical Studies by Grade" : "Classical Studies by Form",
      note: "Church rhythm leads into ordered language, humanities, mathematics, and science, followed by enrichment."
    },
    Traditional: {
      order: ["subjects", "church", "enrichment"],
      subjectTitle: groupingMode === "grades" ? "Grade-Level Subjects" : "Grouped Subjects",
      note: "Familiar grade-level subjects come first, with Church rhythm and enrichment kept clear and easy to schedule."
    },
    Eclectic: {
      order: ["church", "subjects", "enrichment"],
      subjectTitle: groupingMode === "grades" ? "Flexible Subjects by Grade" : "Flexible Subjects by Form",
      note: "A flexible structure keeps core subjects, shared family work, and enrichment easy to mix without forcing one method."
    },
    Unsure: {
      order: ["church", "subjects", "enrichment"],
      subjectTitle: groupingMode === "grades" ? "Core Subjects by Grade" : "Core Subjects by Form",
      note: "A balanced starting point keeps the essentials visible now and leaves room to refine your method later."
    }
  };
  return profiles[method] || profiles.Unsure;
}

function familyEventSetupRow(event = {}) {
  return `<div data-setup-row="familyEvents" data-id="${html(event.id || "")}" class="learn-family-row learn-event-row">${setupInput("Event", "title", event.title || "")}${setupSelect("Type", "eventType", event.eventType || "appointment", [{ value: "appointment", label: "Appointment" }, { value: "field-trip", label: "Field trip" }, { value: "extracurricular", label: "Extracurricular" }, { value: "family", label: "Family" }, { value: "other", label: "Other" }])}${setupInput("Date", "date", event.date || "", { type: "date" })}${setupInput("Starts", "startTime", event.startTime || "", { type: "time" })}${setupInput("Location", "location", event.location || "")}${setupInput("Notes", "notes", event.notes || "")}${setupRemoveButton()}</div>`;
}

function recipeSetupRow(recipe = {}) {
  return `<div data-setup-row="recipes" data-id="${html(recipe.id || "")}" class="learn-family-row learn-recipe-row">${setupInput("Recipe", "title", recipe.title || "")}${setupSelect("Fasting fit", "fastingType", recipe.fastingType || "adaptable", [{ value: "fast-friendly", label: "Fast-friendly" }, { value: "adaptable", label: "Easy to adapt" }, { value: "regular", label: "Regular meal" }])}${setupInput("Category", "category", recipe.category || "Dinner")}${setupInput("Source link", "sourceUrl", recipe.sourceUrl || "", { type: "url" })}${setupInput("Ingredients", "ingredients", recipe.ingredients || "")}${setupInput("Notes / method", "instructions", recipe.instructions || "")}${setupRemoveButton()}</div>`;
}

function grocerySetupRow(item = {}) {
  return `<div data-setup-row="groceryItems" data-id="${html(item.id || "")}" class="learn-family-row learn-grocery-row">${setupInput("Item", "name", item.name || "")}${setupInput("Quantity", "quantity", item.quantity || "")}${setupSelect("Aisle", "category", item.category || "Produce", ["Produce", "Pantry", "Bakery", "Dairy", "Frozen", "Household", "Other"])}<label class="learn-check-field"><input type="checkbox" name="checked" ${item.checked ? "checked" : ""}> In cart</label>${setupRemoveButton()}</div>`;
}

function nextSevenDates(startDate = "") {
  const start = /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? new Date(`${startDate}T12:00:00`) : new Date();
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date.toISOString().slice(0, 10);
  });
}

function mealSetupRow(meal = {}, date = "") {
  const resolvedDate = meal.date || date;
  const weekday = resolvedDate ? new Date(`${resolvedDate}T12:00:00`).toLocaleDateString(undefined, { weekday: "long" }) : "Day";
  return `<div data-setup-row="meals" data-id="${html(meal.id || "")}" class="learn-meal-row"><div><strong>${html(weekday)}</strong><input type="date" name="date" value="${html(resolvedDate)}"></div>${setupInput("Breakfast", "breakfast", meal.breakfast || "")}${setupInput("Lunch", "lunch", meal.lunch || "")}${setupInput("Dinner", "dinner", meal.dinner || "")}</div>`;
}

function familyPlanningSetupPanel(vm) {
  const planning = vm.familyPlanning || {};
  const household = vm.household || planning.household || {};
  const children = vm.children || planning.children || [];
  const dates = nextSevenDates(planning.weekStart);
  const mealByDate = new Map((planning.meals || []).map((meal) => [meal.date, meal]));
  return `<div class="learn-family-planning">
    <p class="learn-panel-intro">Keep the household calendar, meals, and practical life beside the school plan. Name days repeat annually; appointments and outings appear on their exact dates.</p>
    <div class="learn-family-adults">${setupInput("Mom's name", "household.motherName", household.motherName || "")}${setupInput("Mom's name day", "household.motherNameDay", household.motherNameDay || "", { type: "date" })}${setupInput("Dad's name", "household.fatherName", household.fatherName || "")}${setupInput("Dad's name day", "household.fatherNameDay", household.fatherNameDay || "", { type: "date" })}</div>
    <div class="learn-child-name-days">${children.map((child) => `<label data-family-child-id="${html(child.id)}"><span>${html(child.name)}'s name day</span><input type="date" name="childNameDay" value="${html(child.nameDay || "")}"></label>`).join("")}</div>
    <details id="learn-weekly-meals" open class="learn-planning-section"><summary><span>Weekly Meals</span><small>Plan one week at a time with fasting guidance from your selected Church calendar</small></summary>${setupSelect("Fasting guidance", "familyPlanning.fastingPreference", planning.fastingPreference || "guidance", [{ value: "guidance", label: "Show guidance, let me decide" }, { value: "strict", label: "Follow fasting guidance closely" }, { value: "off", label: "Do not show meal guidance" }])}<input type="hidden" name="familyPlanning.weekStart" value="${html(dates[0])}"><div data-setup-list="meals" class="learn-meal-week">${dates.map((date) => mealSetupRow(mealByDate.get(date) || {}, date)).join("")}</div><p class="learn-planning-note">AGAPAY shows the fasting rule; it does not judge ingredients or replace guidance from your priest.</p></details>
    <details class="learn-planning-section"><summary><span>Family Calendar</span><small>Appointments, activities, field trips, and family events</small></summary><div data-setup-list="familyEvents" class="learn-planning-list">${(planning.events?.length ? planning.events : [{}]).map(familyEventSetupRow).join("")}</div><button type="button" data-setup-add-row="familyEvents" class="learn-add-button">Add Calendar Event</button></details>
    <details class="learn-planning-section"><summary><span>Recipes</span><small>Your household library, including fast-friendly favorites</small></summary><div data-setup-list="recipes" class="learn-planning-list">${(planning.recipes?.length ? planning.recipes : [{}]).map(recipeSetupRow).join("")}</div><button type="button" data-setup-add-row="recipes" class="learn-add-button">Add Recipe</button></details>
    <details class="learn-planning-section"><summary><span>Grocery List</span><small>A practical list generated and edited alongside the week</small></summary><div data-setup-list="groceryItems" class="learn-planning-list">${(planning.groceryItems?.length ? planning.groceryItems : [{}]).map(grocerySetupRow).join("")}</div><button type="button" data-setup-add-row="groceryItems" class="learn-add-button">Add Grocery Item</button></details>
  </div>`;
}

function renderSetup(vm) {
  const currentTermId = vm.schoolYear.currentTermId || vm.term.id || vm.terms?.[0]?.id || "term_1";
  const groupingMode = vm.preferences.groupingMode === "grades" ? "grades" : "forms";
  const experience = setupExperience(vm.household.method, groupingMode);
  const groupingTitle = groupingMode === "grades" ? "Children & Grades" : "Children & Forms";
  const groupingCopy = groupingMode === "grades"
    ? "Keep each child's familiar grade or level. Forms stay out of the way, and Planner and Print organize assignments by grade or individual child."
    : "Assign each child a Form and color. Forms let siblings at similar stages share work without duplicating the plan.";
  const adaptivePanels = {
    church: `<span id="learnSetupChurchRhythm" class="learn-setup-anchor"></span>${panel("Church Rhythm", churchRhythmSetupPanel(vm), { icon: "☩", largeTitle: true })}`,
    enrichment: `<span id="learnSetupFormation" class="learn-setup-anchor"></span>${panel("Enrichment", formationSetupPanel(vm), { icon: "✥", largeTitle: true })}`,
    subjects: `<span id="learnSetupSubjects" class="learn-setup-anchor"></span>${panel(experience.subjectTitle, formSubjectsSetupPanel(vm, currentTermId), { icon: "✎", largeTitle: true })}`
  };
  const body = `
    <form data-setup-form data-screen-label="Set Up" style="display:flex;flex-direction:column;gap:18px;">
      <span id="learnSetupHousehold" class="learn-setup-anchor"></span>
      ${panel("Household", `<div class="learn-setup-method-note"><small>Organized for ${html(vm.household.method || "your household")}</small><strong>${html(experience.note)}</strong></div><div style="display:grid;grid-template-columns:1.1fr .9fr .9fr;gap:12px;">${setupInput("Household name", "household.name", vm.household.name)}${setupInput("Parent name", "household.parentName", vm.household.parentName)}${setupInput("Parish", "household.parishName", vm.household.parish)}${setupSelect("Method", "household.primaryMethod", vm.household.method || "Unsure", homeschoolMethodOptions)}${setupSelect("Planning groups", "preferences.groupingMode", groupingMode, [{ value: "forms", label: "Forms" }, { value: "grades", label: "Traditional grades / levels" }])}${setupInput("School year", "schoolYear.label", vm.schoolYear.label)}${setupInput("Year start", "schoolYear.startDate", vm.schoolYear.startDate, { type: "date" })}${setupInput("Year end", "schoolYear.endDate", vm.schoolYear.endDate, { type: "date" })}${setupSelect("Current term", "schoolYear.currentTermId", currentTermId, setupTermOptions(vm.terms, vm.term))}${setupSelect("Church calendar", "preferences.calendarType", vm.preferences.calendarType, vm.calendarOptions)}${setupSelect("Evaluation", "preferences.evaluationModel", vm.preferences.evaluationModel, vm.evaluationModels)}<input name="preferences.graceModeActive" type="hidden" value="${vm.preferences.graceModeActive ? "true" : "false"}" /><input name="preferences.graceModeDefault" type="hidden" value="${html(vm.preferences.graceModeDefault || "light")}" /></div>`, { icon: "⌂", largeTitle: true })}
      <span id="learnSetupChildren" class="learn-setup-anchor"></span>
      ${panel(groupingTitle, `<p style="margin:0 0 12px;color:var(--muted);">${html(groupingCopy)}</p><div data-setup-list="children" style="display:grid;gap:10px;">${(vm.children.length ? vm.children : [{}]).map((child) => childSetupRow(child, groupingMode)).join("")}</div><button type="button" data-setup-add-row="children" style="margin-top:12px;width:100%;border:1px solid var(--line);background:var(--paper2);border-radius:10px;padding:10px;font-family:inherit;">Add Child</button>`, { icon: "◎", largeTitle: true })}
      ${panel("Terms", `<p style="margin:0 0 12px;color:var(--muted);line-height:1.45;">Term 4 / Summer is available for year-round homeschoolers. Assign subjects, books, and formation materials to the term where they belong.</p><div style="display:flex;justify-content:flex-end;margin-bottom:10px;"><button type="button" data-setup-add-row="terms" style="border:1px solid var(--line);background:var(--paper2);border-radius:10px;padding:10px 16px;font-family:inherit;">Add Term</button></div><div data-setup-list="terms" style="display:grid;gap:10px;">${(vm.terms?.length ? vm.terms : [vm.term]).map((term, index) => termSetupRow(term, index)).join("")}</div>`, { icon: "◷", largeTitle: true })}
      ${experience.order.map((key) => adaptivePanels[key]).join("")}
      ${panel("Co-op", `<div style="border:1px solid var(--line);border-radius:12px;background:var(--paper2);padding:14px;display:flex;align-items:center;justify-content:space-between;gap:16px;"><div><strong style="font-family:'Cormorant Garamond',serif;font-size:24px;">Coming Soon</strong><p style="margin:4px 0 0;color:var(--muted);line-height:1.4;">Co-op tools are deferred while Learn focuses on setup, Today, planning, formation, books, Grace Mode, and printable household plans.</p></div><span style="border:1px solid var(--gold);border-radius:999px;color:var(--gold);padding:7px 12px;white-space:nowrap;">Future add-on</span></div>`, { icon: "◎" })}
      <div class="learn-setup-savebar">
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
      <section id="reports" style="background:linear-gradient(135deg,#fffaf0,#f5ead1);border:1px solid rgba(181,148,47,.42);border-radius:14px;padding:20px;display:grid;gap:16px;scroll-margin-top:110px;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;"><div><div style="color:var(--gold);font-size:11px;letter-spacing:.16em;font-weight:800;text-transform:uppercase;">Reports & Records</div><h2 style="font-family:'Cormorant Garamond',serif;font-size:32px;line-height:1;margin:7px 0 5px;color:var(--ink);">Beautiful records, built from work already completed.</h2><p style="margin:0;color:var(--muted);line-height:1.45;max-width:760px;">This workspace will turn saved lessons, subject progress, attendance, narrations, and term closures into polished homeschool records. It is intentionally staged for a later release.</p></div><span style="border:1px solid var(--gold);border-radius:999px;background:var(--navy);color:#fffaf0;padding:7px 12px;font-size:11px;font-weight:800;letter-spacing:.08em;white-space:nowrap;">COMING SOON</span></div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;">${vm.reports.stats.map((stat) => `<article style="border:1px solid var(--line);border-radius:10px;background:rgba(255,255,255,.58);padding:13px;"><small style="display:block;color:var(--gold);letter-spacing:.09em;text-transform:uppercase;font-weight:800;">${html(stat.label)}</small><strong style="display:block;font-family:'Cormorant Garamond',serif;font-size:25px;margin-top:3px;">${html(stat.value)}</strong><span style="display:block;color:var(--muted);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${html(stat.sub)}</span></article>`).join("")}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;">
          <article style="border:1px solid var(--line);border-radius:10px;background:var(--paper);padding:14px;"><strong>Progress summaries</strong><p style="color:var(--muted);line-height:1.4;margin:5px 0 0;">Term and year snapshots by child, Form, and subject.</p></article>
          <article style="border:1px solid var(--line);border-radius:10px;background:var(--paper);padding:14px;"><strong>Report cards</strong><p style="color:var(--muted);line-height:1.4;margin:5px 0 0;">Narrative, complete/incomplete, percentage, and letter-grade formats.</p></article>
          <article style="border:1px solid var(--line);border-radius:10px;background:var(--paper);padding:14px;"><strong>Transcripts</strong><p style="color:var(--muted);line-height:1.4;margin:5px 0 0;">Course, credit, grade, and school-year records for older students.</p></article>
          <article style="border:1px solid var(--line);border-radius:10px;background:var(--paper);padding:14px;"><strong>State reporting exports</strong><p style="color:var(--muted);line-height:1.4;margin:5px 0 0;">Printable attendance, subject progress, and portfolio-ready summaries.</p></article>
        </div>
      </section>
      ${panel("Available Outputs", `<div style="display:grid;grid-template-columns:repeat(2,minmax(220px,1fr));gap:14px;"><div><strong>Household</strong>${vm.outputs.household.map((item) => `<div style="padding:8px 0;border-top:1px solid var(--line);">${html(item)}</div>`).join("")}</div><div><strong>Child</strong>${vm.outputs.child.map((item) => `<div style="padding:8px 0;border-top:1px solid var(--line);">${html(item)}</div>`).join("")}</div></div>`, { icon: "✥" })}
    </section>`;
  return shell(vm, body);
}

function redirectExpiredLearnSession() {
  if (window.MyAgapayShell?.redirectToLogin) {
    window.MyAgapayShell.redirectToLogin("session-expired");
    return;
  }
  localStorage.removeItem("agapayDonorToken");
  localStorage.removeItem("agapayDonorProfile");
  localStorage.removeItem("agapayDonorEmail");
  localStorage.removeItem("agapay.learn.plan");

  const loginUrl = new URL("/myagapay/login", window.location.origin);
  loginUrl.searchParams.set("next", `${window.location.pathname}${window.location.search || ""}`);
  loginUrl.searchParams.set("reason", "session-expired");
  window.location.replace(loginUrl.toString());
}

function waitForLearnSignIn(response) {
  if (response.status !== 401) return null;
  redirectExpiredLearnSession();
  return new Promise(() => {});
}

async function apiGet(path) {
  const response = await fetch(path, {
    headers: learnRequestHeaders()
  });
  const signInRedirect = waitForLearnSignIn(response);
  if (signInRedirect) return signInRedirect;
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
  const signInRedirect = waitForLearnSignIn(response);
  if (signInRedirect) return signInRedirect;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) throw new Error(payload.error || `Request failed with ${response.status}`);
  return payload;
}

function localIsoDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
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
    const cardSaintTitle = button.dataset.saintTitle || button.querySelector("strong")?.textContent || "";
    const orderedSaints = forceDisplayedSaintFirst(payload.saints || [], cardSaintTitle);
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

  root.querySelectorAll("[data-learn-completion]").forEach((button) => {
    button.addEventListener("click", async () => {
      const itemId = button.dataset.completionId || "";
      const scope = button.dataset.completionScope || "";
      const completed = button.getAttribute("aria-pressed") !== "true";
      const calendar = localStorage.getItem("agapay.learn.calendar") || "julian";
      button.disabled = true;
      button.style.cursor = "wait";
      try {
        const saved = await apiPost(`/api/learn/completion?calendar=${encodeURIComponent(calendar)}`, {
          itemId,
          scope,
          completed,
          civilDate: localIsoDate()
        });
        root.innerHTML = renderDashboard(toDashboardViewModel(saved));
        wireDashboard();
      } catch (error) {
        button.disabled = false;
        button.style.cursor = "pointer";
        showLearnDialog("Progress Could Not Be Saved", error.message || "AGAPAY Learn could not save this progress update.", []);
      }
    });
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
  const setupTiles = {};
  form.querySelectorAll(".learn-setup-subsection").forEach((section) => {
    const group = section.dataset.setupSectionGroup || "";
    const panelId = section.dataset.setupSectionPanel || "";
    if (!group || !panelId) return;
    const title = section.querySelector("[data-setup-section-title-input]")?.value?.trim() || "";
    const detail = section.querySelector("[data-setup-section-detail-input]")?.value?.trim() || "";
    if (!title && !detail) return;
    setupTiles[group] = setupTiles[group] || {};
    setupTiles[group][panelId] = { title, detail };
  });
  return {
    household: {
      name: get("household.name"),
      parentName: get("household.parentName"),
      parentNames: get("household.parentName") ? [get("household.parentName")] : [],
      motherName: get("household.motherName"),
      motherNameDay: get("household.motherNameDay"),
      fatherName: get("household.fatherName"),
      fatherNameDay: get("household.fatherNameDay"),
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
    setupTiles,
    preferences: {
      calendarType: get("preferences.calendarType"),
      groupingMode: get("preferences.groupingMode") === "grades" ? "grades" : "forms",
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
        gradeLabel: rowValue(row, "gradeLabel"),
        formLabel: rowValue(row, "formLabel"),
        ageYears: rowValue(row, "ageYears"),
        nameDay: rowValue(row, "nameDay"),
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
        scheduledDays: scheduledDays(rowValue(row, "scheduledDays"), rowValue(row, "weeklyFrequency")),
        weeklyFrequency: rowValue(row, "weeklyFrequency"),
        cadenceLabel: rowValue(row, "weeklyFrequency"),
        formLabel: rowValue(row, "formLabel"),
        gradeLabel: rowValue(row, "gradeLabel"),
        resource: rowValue(row, "resource"),
        resourceType: rowValue(row, "resourceType"),
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
          resource: rowValue(row, "resource"),
          resourceType: rowValue(row, "resourceType"),
          planningMode: rowValue(row, "planningMode"),
          scheduledDays: scheduledDays(rowValue(row, "scheduledDays"), rowValue(row, "weeklyFrequency")),
          weeklyFrequency: rowValue(row, "weeklyFrequency"),
          cadenceLabel: rowValue(row, "weeklyFrequency"),
          formLabel: rowValue(row, "formLabel"),
          gradeLabel: rowValue(row, "gradeLabel"),
          childId: rowValue(row, "childId"),
          progressionType: rowValue(row, "progressionType"),
          startNumber: rowValue(row, "startNumber"),
          currentNumber: rowValue(row, "currentNumber"),
          endNumber: rowValue(row, "endNumber"),
          minutesPlanned: rowValue(row, "minutesPlanned"),
          credits: rowValue(row, "credits"),
          finalGradeOverride: rowValue(row, "finalGradeOverride"),
          color: rowValue(row, "color"),
          termId: rowValue(row, "termId") || currentTermId,
          gracePriority: rowValue(row, "gracePriority"),
          graceNote: rowValue(row, "graceNote")
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
    familyPlanning: {
      fastingPreference: get("familyPlanning.fastingPreference") || "guidance",
      weekStart: get("familyPlanning.weekStart"),
      events: collectRows(form, "familyEvents", (row) => {
        const title = rowValue(row, "title");
        if (!title || !rowValue(row, "date")) return null;
        return { id: row.dataset.id || "", title, eventType: rowValue(row, "eventType"), date: rowValue(row, "date"), startTime: rowValue(row, "startTime"), location: rowValue(row, "location"), notes: rowValue(row, "notes") };
      }),
      meals: collectRows(form, "meals", (row) => ({ id: row.dataset.id || "", date: rowValue(row, "date"), breakfast: rowValue(row, "breakfast"), lunch: rowValue(row, "lunch"), dinner: rowValue(row, "dinner") })).filter((meal) => meal.date),
      recipes: collectRows(form, "recipes", (row) => {
        const title = rowValue(row, "title");
        if (!title) return null;
        return { id: row.dataset.id || "", title, fastingType: rowValue(row, "fastingType"), category: rowValue(row, "category"), sourceUrl: rowValue(row, "sourceUrl"), ingredients: rowValue(row, "ingredients"), instructions: rowValue(row, "instructions") };
      }),
      groceryItems: collectRows(form, "groceryItems", (row) => {
        const name = rowValue(row, "name");
        if (!name) return null;
        return { id: row.dataset.id || "", name, quantity: rowValue(row, "quantity"), category: rowValue(row, "category"), checked: Boolean(row.querySelector('[name="checked"]')?.checked) };
      })
    },
    coOp: {
      enabled: false,
      status: "coming-soon"
    }
  };
}

function currentSetupChildren(form) {
  return collectRows(form, "children", (row, index) => ({
    id: row.dataset.id || `new-child-${index}`,
    name: rowValue(row, "firstName") || `Child ${index + 1}`,
    gradeLabel: rowValue(row, "gradeLabel"),
    formLabel: rowValue(row, "formLabel")
  }));
}

function familyPlanningPayloadFromForm(form) {
  const get = (name) => form.elements[name]?.value?.trim() || "";
  return {
    household: {
      motherName: get("household.motherName"),
      motherNameDay: get("household.motherNameDay"),
      fatherName: get("household.fatherName"),
      fatherNameDay: get("household.fatherNameDay")
    },
    childNameDays: [...form.querySelectorAll("[data-family-child-id]")].map((row) => ({ childId: row.dataset.familyChildId || "", nameDay: row.querySelector('[name="childNameDay"]')?.value || "" })),
    familyPlanning: {
      fastingPreference: get("familyPlanning.fastingPreference") || "guidance",
      weekStart: get("familyPlanning.weekStart"),
      events: collectRows(form, "familyEvents", (row) => {
        const title = rowValue(row, "title");
        if (!title || !rowValue(row, "date")) return null;
        return { id: row.dataset.id || "", title, eventType: rowValue(row, "eventType"), date: rowValue(row, "date"), startTime: rowValue(row, "startTime"), location: rowValue(row, "location"), notes: rowValue(row, "notes") };
      }),
      meals: collectRows(form, "meals", (row) => ({ id: row.dataset.id || "", date: rowValue(row, "date"), breakfast: rowValue(row, "breakfast"), lunch: rowValue(row, "lunch"), dinner: rowValue(row, "dinner") })).filter((meal) => meal.date),
      recipes: collectRows(form, "recipes", (row) => {
        const title = rowValue(row, "title");
        return title ? { id: row.dataset.id || "", title, fastingType: rowValue(row, "fastingType"), category: rowValue(row, "category"), sourceUrl: rowValue(row, "sourceUrl"), ingredients: rowValue(row, "ingredients"), instructions: rowValue(row, "instructions") } : null;
      }),
      groceryItems: collectRows(form, "groceryItems", (row) => {
        const name = rowValue(row, "name");
        return name ? { id: row.dataset.id || "", name, quantity: rowValue(row, "quantity"), category: rowValue(row, "category"), checked: Boolean(row.querySelector('[name="checked"]')?.checked) } : null;
      })
    }
  };
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

function setupBlankRow(type, form, preset = {}) {
  const terms = currentSetupTerms(form);
  const currentTermId = form.elements["schoolYear.currentTermId"]?.value || terms[0]?.id || "term_1";
  const groupingMode = form.elements["preferences.groupingMode"]?.value === "grades" ? "grades" : "forms";
  if (type === "children") return childSetupRow({}, groupingMode);
  if (type === "terms") return termSetupRow({}, terms.length);
  if (type === "subjects") return subjectSetupRow(preset, currentSetupChildren(form), terms, currentTermId, groupingMode);
  if (type === "books") return bookSetupRow({}, terms, currentTermId);
  if (type === "formationMaterials") return formationSetupRow({}, terms, currentTermId);
  if (type === "formationRhythms") return formationRhythmSetupRow({});
  if (type === "formationRecitation") return formationRecitationSetupRow({});
  if (type === "formationEnrichment") return formationEnrichmentSetupRow(preset, currentSetupChildren(form), terms, currentTermId, groupingMode);
  if (type === "familyEvents") return familyEventSetupRow({});
  if (type === "recipes") return recipeSetupRow({});
  if (type === "groceryItems") return grocerySetupRow({});
  return "";
}

function setSetupSectionOpen(form, group, panelId, shouldOpen) {
  form.querySelectorAll(`[data-setup-section-group="${group}"][data-setup-section-toggle]`).forEach((button) => {
    const isTarget = button.dataset.setupSectionPanel === panelId;
    const open = shouldOpen && isTarget;
    button.setAttribute("aria-expanded", open ? "true" : "false");
    button.classList.toggle("is-open", open);
    const action = button.querySelector("em");
    if (action) action.textContent = open ? "Collapse" : "Open";
  });
  form.querySelectorAll(`[data-setup-section-group="${group}"].learn-setup-subsection`).forEach((section) => {
    const open = shouldOpen && section.dataset.setupSectionPanel === panelId;
    section.hidden = !open;
  });
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
    const dayChoice = event.target.closest("[data-day-choice]");
    if (dayChoice) {
      const picker = dayChoice.closest(".learn-day-picker");
      const selected = [...picker.querySelectorAll("[data-day-choice]:checked")].map((input) => input.value);
      picker.querySelector('[name="scheduledDays"]').value = selected.join(",");
      picker.querySelector("[data-day-summary]").textContent = selected.length ? setupWeekdays.filter((day) => selected.includes(day.value)).map((day) => day.label).join(" · ") : "Choose days";
      return;
    }
    const tileInput = event.target.closest("[data-setup-section-title-input], [data-setup-section-detail-input]");
    if (tileInput) {
      const group = tileInput.dataset.setupSectionGroup || "";
      const panelId = tileInput.dataset.setupSectionPanel || "";
      const section = tileInput.closest(".learn-setup-subsection");
      const title = section?.querySelector("[data-setup-section-title-input]")?.value?.trim() || "";
      const detail = section?.querySelector("[data-setup-section-detail-input]")?.value?.trim() || "";
      const card = form.querySelector(`[data-setup-section-group="${group}"][data-setup-section-panel="${panelId}"][data-setup-section-toggle]`);
      const cardTitle = card?.querySelector("[data-setup-section-card-title]");
      const cardDetail = card?.querySelector("[data-setup-section-card-detail]");
      const panelTitle = section?.querySelector("[data-setup-section-panel-title]");
      const panelDetail = section?.querySelector("[data-setup-section-panel-detail]");
      if (cardTitle && title) cardTitle.textContent = title;
      if (cardDetail && detail) cardDetail.textContent = detail;
      if (panelTitle && title) panelTitle.textContent = title;
      if (panelDetail && detail) panelDetail.textContent = detail;
      return;
    }
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
    const sectionToggle = event.target.closest("[data-setup-section-toggle]");
    if (sectionToggle) {
      const group = sectionToggle.dataset.setupSectionGroup || "";
      const panelId = sectionToggle.dataset.setupSectionPanel || "";
      const wasOpen = sectionToggle.getAttribute("aria-expanded") === "true";
      setSetupSectionOpen(form, group, panelId, !wasOpen);
      const panelElement = document.getElementById(sectionToggle.getAttribute("aria-controls") || "");
      if (!wasOpen && panelElement) panelElement.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const sectionClose = event.target.closest("[data-setup-section-close]");
    if (sectionClose) {
      setSetupSectionOpen(form, sectionClose.dataset.setupSectionGroup || "", sectionClose.dataset.setupSectionPanel || "", false);
      return;
    }
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
      const preset = {};
      if (addButton.dataset.setupAddSubjectType) preset.subjectType = addButton.dataset.setupAddSubjectType;
      if (addButton.dataset.setupAddBlockType) preset.blockType = addButton.dataset.setupAddBlockType;
      const list = addButton.dataset.setupAddTarget
        ? document.getElementById(addButton.dataset.setupAddTarget)
        : form.querySelector(`[data-setup-list="${type}"]`);
      if (list) {
        list.insertAdjacentHTML("beforeend", setupBlankRow(type, form, preset));
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
  if (vm.term?.activeTerm) localStorage.setItem("agapay.learn.plannerTerm", String(vm.term.activeTerm));
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
  const familyForm = root.querySelector("[data-family-planning-form]");
  familyForm?.addEventListener("click", (event) => {
    const remove = event.target.closest("[data-setup-remove-row]");
    if (remove) {
      const row = remove.closest("[data-setup-row]");
      if (row && row.parentElement.querySelectorAll("[data-setup-row]").length > 1) row.remove();
      return;
    }
    const add = event.target.closest("[data-setup-add-row]");
    if (!add) return;
    const list = familyForm.querySelector(`[data-setup-list="${add.dataset.setupAddRow}"]`);
    if (list) list.insertAdjacentHTML("beforeend", setupBlankRow(add.dataset.setupAddRow, familyForm));
  });
  familyForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = familyForm.querySelector("[data-family-planning-status]");
    const submit = familyForm.querySelector('button[type="submit"]');
    status.textContent = "Saving family planner...";
    submit.disabled = true;
    try {
      const saved = await apiPost("/api/learn/family-planning", familyPlanningPayloadFromForm(familyForm));
      status.textContent = `Family planner saved${saved.savedAt ? ` at ${new Date(saved.savedAt).toLocaleTimeString()}` : ""}.`;
      status.style.color = "var(--gold)";
    } catch (error) {
      status.textContent = error.message;
      status.style.color = "var(--burgundy)";
    } finally {
      submit.disabled = false;
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

function wireCommunityLegacy() {
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

function wireCommunity() {
  const search = root.querySelector("[data-community-search]");
  const category = root.querySelector("[data-community-category]");
  const resourceType = root.querySelector("[data-community-resource-type]");
  const mediaType = root.querySelector("[data-community-media-type]");
  const cards = [...root.querySelectorAll("[data-community-card]")];
  const count = root.querySelector("[data-community-count]");
  const empty = root.querySelector("[data-community-empty]");

  const applyFilters = () => {
    const query = (search?.value || "").trim().toLowerCase();
    let shown = 0;
    cards.forEach((card) => {
      const matches = (!query || (card.dataset.search || "").includes(query))
        && (!category || category.value === "All" || card.dataset.category === category.value)
        && (!resourceType || resourceType.value === "All" || card.dataset.resourceType === resourceType.value)
        && (!mediaType || mediaType.value === "All" || card.dataset.mediaType === mediaType.value);
      card.hidden = !matches;
      if (matches) shown += 1;
    });
    if (count) count.textContent = `Showing ${shown} curated ${shown === 1 ? "resource" : "resources"}`;
    if (empty) empty.hidden = shown !== 0;
  };

  search?.addEventListener("input", applyFilters);
  [category, resourceType, mediaType].forEach((control) => control?.addEventListener("change", applyFilters));

  root.querySelectorAll("[data-community-flag]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await apiPost(`/api/learn/community/resources/${encodeURIComponent(button.dataset.communityFlag || "")}/flag`, {});
        button.textContent = "Flagged";
        showLearnDialog("Sent for Review", "An AGAPAY administrator will review this resource.", []);
      } catch (error) {
        button.disabled = false;
        showLearnDialog("Could Not Flag Resource", error.message || "Please try again.", []);
      }
    });
  });

  const dialog = root.querySelector("[data-community-suggest-dialog]");
  const form = root.querySelector("[data-community-suggest-form]");
  const closeDialog = () => {
    if (!dialog) return;
    dialog.hidden = true;
    dialog.style.display = "none";
  };
  root.querySelector("[data-community-suggest]")?.addEventListener("click", () => {
    if (!dialog) return;
    dialog.hidden = false;
    dialog.style.display = "flex";
  });
  root.querySelectorAll("[data-community-suggest-close]").forEach((button) => button.addEventListener("click", closeDialog));
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = form.querySelector("[data-community-suggest-status]");
    const submit = form.querySelector('button[type="submit"]');
    const values = new FormData(form);
    if (submit) submit.disabled = true;
    if (status) status.textContent = "Sending your suggestion for review...";
    try {
      await apiPost("/api/learn/community/resources", {
        title: values.get("title"),
        url: values.get("url"),
        category: values.get("category"),
        resourceType: values.get("resourceType"),
        mediaType: values.get("mediaType"),
        ageRange: values.get("ageRange"),
        tags: values.get("tags"),
        description: values.get("description")
      });
      form.reset();
      closeDialog();
      showLearnDialog("Resource Submitted", "Thank you. The resource is now in the AGAPAY moderation queue and will not appear publicly until it is approved.", []);
    } catch (error) {
      if (status) status.textContent = error.message || "The resource could not be submitted.";
    } finally {
      if (submit) submit.disabled = false;
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
    if (raw.setupCompleted === false) {
      window.location.replace("/myagapay/learn/setup");
      return;
    }
    root.innerHTML = renderDashboard(toDashboardViewModel(raw));
    wireDashboard();
    return;
  }
  if (pageKey === "planner") {
    const params = new URLSearchParams(window.location.search);
    const view = params.get("view") || localStorage.getItem("agapay.learn.plannerView") || "week";
    const month = params.get("month") || localStorage.getItem("agapay.learn.plannerMonth") || new Date().toISOString().slice(0, 7);
    const termId = params.get("termId") || "";
    const raw = await apiGet(`/api/learn/planner?calendar=${encodeURIComponent(calendar)}&view=${encodeURIComponent(view)}&month=${encodeURIComponent(month)}&termId=${encodeURIComponent(termId)}`);
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
    const raw = await apiGet("/api/learn/dashboard");
    const vm = toDashboardViewModel(raw);
    vm.page = { id: "reports", title: "Reports", subtitle: "Academic records and transcript tools are coming soon.", ornament: true };
    root.innerHTML = renderReportsComingSoon(vm);
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
    wireCommunity();
    return;
  }
  if (pageKey === "co-op") {
    const raw = await apiGet("/api/learn/co-op");
    root.innerHTML = renderCoOp(toCoOpViewModel(raw));
    return;
  }
  if (pageKey === "onboarding") {
    const raw = await apiGet("/api/learn/setup");
    const vm = toSetupViewModel(raw, { calendar });
    const draft = loadSimpleSetupDraft(vm);
    const setupParams = new URLSearchParams(window.location.search);
    const advanced = setupParams.get("advanced") === "1";
    const simple = setupParams.get("simple") === "1";
    if ((!vm.setupCompleted && !advanced) || simple) {
      document.body.classList.add("learn-simple-setup");
      root.innerHTML = renderSimpleSetupWizard(vm, draft);
      wireSimpleSetupWizard(vm, draft, raw.onboarding?.setupSnapshot || null);
      return;
    }
    document.body.classList.remove("learn-simple-setup");
    root.innerHTML = renderSetup(!vm.setupCompleted ? applySimpleDraftToSetupVm(vm, draft) : vm);
    wireSetupPage();
    if (window.location.hash) {
      window.requestAnimationFrame(() => document.querySelector(window.location.hash)?.scrollIntoView({ block: "start" }));
    }
    return;
  }
  root.innerHTML = `<div style="padding:32px;font-family:Georgia,serif;color:#1b2c45;">This Learn route has not been migrated to the Claude shell yet.</div>`;
}

mount().catch((error) => {
  root.innerHTML = `<section style="padding:32px;font-family:Georgia,serif;color:#6e2f2a;"><strong>Unable to load AGAPAY Learn</strong><p>${html(error.message)}</p></section>`;
});

document.addEventListener("click", (event) => {
  const accountToggle = event.target.closest("[data-learn-account-toggle]");
  const accountMenu = event.target.closest("[data-learn-account-menu]");
  if (accountToggle) {
    const menu = accountToggle.closest("[data-learn-account-menu]");
    const dropdown = menu?.querySelector(".learn-account-dropdown");
    const open = accountToggle.getAttribute("aria-expanded") !== "true";
    document.querySelectorAll("[data-learn-account-toggle]").forEach((button) => button.setAttribute("aria-expanded", "false"));
    document.querySelectorAll(".learn-account-dropdown").forEach((panel) => { panel.hidden = true; });
    accountToggle.setAttribute("aria-expanded", String(open));
    if (dropdown) dropdown.hidden = !open;
    return;
  }
  if (!accountMenu) {
    document.querySelectorAll("[data-learn-account-toggle]").forEach((button) => button.setAttribute("aria-expanded", "false"));
    document.querySelectorAll(".learn-account-dropdown").forEach((panel) => { panel.hidden = true; });
  }
  if (event.target.closest("[data-learn-logout]")) {
    localStorage.removeItem("agapayDonorToken");
    localStorage.removeItem("agapayDonorProfile");
    localStorage.removeItem("agapayDonorEmail");
    localStorage.removeItem("agapay.learn.plan");
    window.location.href = "/myagapay/login";
    return;
  }

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
  document.querySelectorAll("[data-learn-account-toggle]").forEach((button) => button.setAttribute("aria-expanded", "false"));
  document.querySelectorAll(".learn-account-dropdown").forEach((panel) => { panel.hidden = true; });
});
