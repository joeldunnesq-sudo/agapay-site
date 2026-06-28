import {
  toBooksViewModel,
  toCoOpViewModel,
  toCommunityViewModel,
  toDashboardViewModel,
  toFormationViewModel,
  toGradesViewModel,
  toPlannerViewModel,
  toPrintCenterViewModel,
  toSetupViewModel
} from "./dashboard-view-models.js";

const odysseyPageMap = {
  planner: "planner",
  formation: "formation",
  books: "books",
  grades: "grades",
  community: "community",
  "co-op": "co-op",
  print: "print-center",
  "print-center": "print-center",
  setup: "onboarding",
  onboarding: "onboarding"
};

function resolveLearnPageKey() {
  const base = document.body.dataset.learnPage || "dashboard";
  if (document.body.dataset.learnContext !== "odyssey") return base;
  const match = window.location.pathname.match(/^\/learn\/odyssey\/dashboard\/([^/]+)/);
  return match ? odysseyPageMap[match[1]] || base : base;
}

const pageKey = resolveLearnPageKey();
const root = document.getElementById("learnRoot");
let learnGoogleCalendarStatus = { loaded: false, configured: false, connected: false };

function isOdysseyLearnContext() {
  return document.body.dataset.learnContext === "odyssey";
}

function learnSectionHref(section = "dashboard", query = "") {
  const regular = {
    dashboard: "/myagapay/learn",
    planner: "/myagapay/learn/planner",
    formation: "/myagapay/learn/formation",
    books: "/myagapay/learn/books",
    grades: "/myagapay/learn/grades",
    community: "/myagapay/learn/community",
    "co-op": "/myagapay/learn/co-op",
    "print-center": "/myagapay/learn/print",
    onboarding: "/myagapay/learn/setup"
  };
  const odyssey = {
    dashboard: "/learn/odyssey/dashboard",
    planner: "/learn/odyssey/dashboard/planner",
    formation: "/learn/odyssey/dashboard/formation",
    books: "/learn/odyssey/dashboard/books",
    grades: "/learn/odyssey/dashboard/grades",
    community: "/learn/odyssey/dashboard/community",
    "co-op": "/learn/odyssey/dashboard/co-op",
    "print-center": "/learn/odyssey/dashboard/print",
    onboarding: "/learn/odyssey/dashboard/setup"
  };
  const base = (isOdysseyLearnContext() ? odyssey : regular)[section] || (isOdysseyLearnContext() ? odyssey.dashboard : regular.dashboard);
  return query ? `${base}?${query}` : base;
}

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

function progressEditor(item = {}, kind = "book", options = {}) {
  const id = String(item.id || "");
  const value = Math.max(0, Math.min(100, Number(item.progress) || 0));
  if (!id) {
    return `${bar(value, options.color || "var(--gold)")}<small style="display:block;color:var(--gold);font-weight:700;margin-top:4px;">${html(value)}% ${html(options.suffix || "complete")}</small>`;
  }
  return `
    <div data-progress-editor data-progress-kind="${html(kind)}" data-progress-id="${html(id)}" style="display:grid;gap:7px;margin-top:8px;">
      ${bar(value, options.color || "var(--gold)")}
      <div style="display:grid;grid-template-columns:1fr 58px auto;gap:8px;align-items:center;">
        <input data-progress-range type="range" min="0" max="100" step="5" value="${html(value)}" aria-label="${html(options.label || "Progress")}" style="width:100%;accent-color:var(--gold);" />
        <input data-progress-number type="number" min="0" max="100" step="5" value="${html(value)}" aria-label="${html(options.label || "Progress percent")}" style="width:58px;border:1px solid var(--line);border-radius:8px;background:var(--paper2);color:var(--ink);font:inherit;font-size:12px;padding:7px 6px;" />
        <button type="button" data-progress-save style="border:1px solid var(--gold);background:var(--navy);color:#f3ead4;border-radius:8px;padding:8px 10px;font-family:inherit;font-size:12px;font-weight:800;white-space:nowrap;">Save</button>
      </div>
      <small data-progress-status style="min-height:15px;color:var(--muted);font-size:11px;">${html(value)}% ${html(options.suffix || "complete")}</small>
    </div>`;
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
    grades: '<path d="M4 20 10 4h4l6 16"/><path d="M7 14h10"/><path d="M8 20h8"/>',
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
    grades: {
      kicker: "ACADEMIC RECORDS",
      description: "Record term grades, attendance, credits, and narrative notes for report cards and high school transcripts.",
      quote: "Let all things be done decently and in order.",
      ref: "1 Corinthians 14:40"
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
      quote: "And let us not be weary in well doing: for in due season we shall reap, if we faint not.",
      ref: "Galatians 6:9"
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
    const payload = await apiPost("/api/learn/billing/checkout", { plan: "family", interval: "year" });
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

function showLearnFeedbackDialog() {
  const pageLabel = pageIntroMeta(pageKey).kicker || "AGAPAY Learn";
  showLearnDialog("Suggest an Improvement", "Share what would make AGAPAY Learn clearer, calmer, or more useful for your household.", [], {
    width: "620px",
    contentHtml: `
      <form data-learn-feedback-form style="border-top:1px solid rgba(181,148,47,.28);padding-top:16px;display:grid;gap:12px;">
        <label style="display:grid;gap:6px;color:#9b7420;font-size:12px;letter-spacing:.12em;text-transform:uppercase;font-weight:800;">Subject
          <input name="subject" value="${html(`${pageLabel} suggestion`)}" maxlength="120" style="border:1px solid rgba(20,41,74,.18);border-radius:10px;padding:11px;background:#fffaf0;color:#14294a;font:inherit;letter-spacing:0;text-transform:none;" />
        </label>
        <label style="display:grid;gap:6px;color:#9b7420;font-size:12px;letter-spacing:.12em;text-transform:uppercase;font-weight:800;">Suggestion
          <textarea name="message" rows="7" maxlength="1600" placeholder="What felt confusing, missing, too many steps, or worth improving?" style="border:1px solid rgba(20,41,74,.18);border-radius:10px;padding:11px;background:#fffaf0;color:#14294a;font:inherit;line-height:1.45;resize:vertical;letter-spacing:0;text-transform:none;"></textarea>
        </label>
        <div data-learn-feedback-status style="min-height:20px;color:#33405a;font-size:13px;"></div>
        <div style="display:flex;justify-content:flex-end;gap:10px;">
          <button type="button" data-dialog-close style="border:1px solid rgba(20,41,74,.22);background:#fffaf0;border-radius:10px;padding:12px 18px;min-height:44px;font-family:inherit;color:#14294a;font-weight:700;">Cancel</button>
          <button type="submit" style="border:1px solid #b5942f;background:#14294a;color:#f3ead4;border-radius:10px;padding:12px 18px;min-height:44px;font-family:inherit;font-weight:800;">Send suggestion</button>
        </div>
      </form>`
  });
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

function plannerScopeFromQuery() {
  const query = new URLSearchParams(window.location.search);
  const rawScope = query.get("scope") || "lessons";
  if (rawScope === "calendar") return "events";
  if (["recipes", "groceries", "pantry"].includes(rawScope)) return "meals";
  return ["lessons", "meals", "chores", "events"].includes(rawScope) ? rawScope : "lessons";
}

function mealToolFromQuery() {
  const query = new URLSearchParams(window.location.search);
  const rawScope = query.get("scope") || "";
  const rawTool = query.get("tool") || "";
  if (["recipes", "groceries", "pantry"].includes(rawScope)) return rawScope;
  return ["plan", "recipes", "groceries", "pantry"].includes(rawTool) ? rawTool : "plan";
}

function plannerHref(updates = {}) {
  const next = new URLSearchParams(window.location.search);
  Object.entries(updates).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") next.delete(key);
    else next.set(key, value);
  });
  return learnSectionHref("planner", next.toString());
}

function plannerSidebarSubnav(activePage) {
  if (activePage !== "planner") return "";
  const activeScope = plannerScopeFromQuery();
  const items = [
    { id: "lessons", label: "Lessons", glyph: "▦", href: plannerHref({ scope: "lessons", tool: null }) },
    { id: "meals", label: "Meals", glyph: "♨", href: plannerHref({ scope: "meals", tool: "plan", view: "week", term: null, termId: null }) },
    { id: "chores", label: "Chores", glyph: "✓", href: plannerHref({ scope: "chores", tool: null, view: "week", term: null, termId: null }) },
    { id: "events", label: "Events", glyph: "◷", href: plannerHref({ scope: "events", tool: null, view: "week", term: null, termId: null }) }
  ];
  return `<div class="learn-planner-subnav" aria-label="Family Planner sections">
    ${items.map((item) => `<a href="${item.href}" class="${item.id === activeScope ? "is-active" : ""}" ${item.id === activeScope ? 'aria-current="page"' : ""}><span>${html(item.glyph)}</span>${html(item.label)}</a>`).join("")}
  </div>`;
}

function sidebar(vm) {
  const active = vm.page.id;
  const gcalConfigured = learnGoogleCalendarStatus.loaded ? learnGoogleCalendarStatus.configured : vm.shell.gcalConfigured;
  const gcalConnected = learnGoogleCalendarStatus.loaded ? learnGoogleCalendarStatus.connected : vm.shell.gcalConnected;
  return `
    <aside class="learn-product-sidebar" data-learn-sidebar>
      <div class="learn-product-sidebar-scroll">
        <a class="learn-product-back" href="${isOdysseyLearnContext() ? "/learn/odyssey" : "/myagapay"}" aria-label="${isOdysseyLearnContext() ? "Back to AGAPAY Learn Odyssey" : "Back to My AGAPAY"}">
          <span aria-hidden="true">←</span>
          <strong>${isOdysseyLearnContext() ? "TEFA Portal" : "My AGAPAY"}</strong>
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
          ${item.id === "planner" ? plannerSidebarSubnav(active) : ""}
        `).join("")}
        </nav>
        <button class="learn-product-google-sync" type="button" data-learn-google-sync
          ${gcalConfigured ? "" : "disabled aria-disabled=\"true\" title=\"Google Calendar sync is not yet configured\""}
          style="${gcalConfigured ? "" : "opacity:.45;cursor:not-allowed;"}">
          <span aria-hidden="true">G</span>
          <span><strong>Google Calendar</strong><small>${gcalConnected ? "Sync connected" : gcalConfigured ? "Connect family sync" : "Not yet configured"}</small></span>
        </button>
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
        <button class="learn-quick-action learn-feedback-action" type="button" data-learn-feedback-open>Suggest</button>
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
      detail: "Every scheduled subject, book, and enrichment block stays at its planned time."
    },
    {
      id: "light",
      title: "Medium Day",
      subtitle: "Cap the day without shrinking the whole plan.",
      detail: "Each child keeps up to 4 ranked subjects. Household enrichment keeps up to 3 blocks. Lower-ranked work moves to reserve."
    },
    {
      id: "minimum viable",
      title: "Light Day",
      subtitle: "A faithful tiny plan for hard days.",
      detail: "Each child keeps up to 2 top-ranked subjects. Household enrichment keeps 1 block. Kept work becomes a short touchpoint."
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
      <div style="display:grid;grid-template-columns:repeat(3,minmax(160px,1fr));gap:10px;">
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
    { id: "full", title: "Full", detail: "Run every scheduled item as planned." },
    { id: "light", title: "Medium", detail: "Keep up to 4 ranked child subjects; reserve the rest." },
    { id: "minimum viable", title: "Light", detail: "Keep up to 2 top-ranked child subjects as short touchpoints." }
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
        <div style="display:grid;grid-template-columns:repeat(3,minmax(100px,1fr));gap:8px;">
          ${modes.map((mode) => {
            const active = mode.id === currentMode;
            return `<button type="button" data-grace-mode="${html(mode.id)}" aria-pressed="${active ? "true" : "false"}" title="${html(mode.detail)}" style="border:1px solid ${active ? "var(--gold)" : "var(--line)"};border-radius:11px;background:${active ? "var(--navy)" : "rgba(255,255,255,.62)"};color:${active ? "#fffaf0" : "var(--ink)"};padding:10px;text-align:left;cursor:pointer;font-family:inherit;min-height:84px;"><strong style="display:block;font-family:'Cormorant Garamond',serif;font-size:20px;line-height:1;">${html(mode.title)}</strong><small style="display:block;margin-top:5px;line-height:1.25;color:${active ? "rgba(255,250,240,.82)" : "var(--muted)"};">${html(mode.detail)}</small></button>`;
          }).join("")}
        </div>
      </section>
    </div>
  `;
}

function weekAssignmentStorageKey(vm, explicitWeekKey = "") {
  const itemIds = (vm.week?.weeklyAssignmentItems || []).map((item) => item.id).join(",");
  const weekKey = explicitWeekKey || [vm.week?.days?.[0]?.date, vm.week?.days?.[6]?.date].filter(Boolean).join("_") || "week";
  return `agapay.learn.weekAssignments.${weekKey}.${itemIds}`;
}

function readWeekAssignmentState(vm, explicitWeekKey = "") {
  try {
    return JSON.parse(localStorage.getItem(weekAssignmentStorageKey(vm, explicitWeekKey)) || "{}");
  } catch {
    return {};
  }
}

function designedAssignmentsForDate(vm, date) {
  if (!date) return [];
  const state = readWeekAssignmentState(vm);
  const items = vm.week?.weeklyAssignmentItems || [];
  return items.map((item) => {
    const saved = state[item.id];
    return saved?.zone === date ? {
      ...item,
      note: saved.note || "",
      sub: saved.note || item.sub || ""
    } : null;
  }).filter(Boolean);
}

function timeLabel(value = "") {
  return value ? value : "All day";
}

function eventsForDate(vm, date) {
  return expandFamilyEvents(vm.familyPlanning?.events || [], [date]).get(date) || [];
}

function mealForDate(vm, date) {
  return (vm.familyPlanning?.meals || []).find((meal) => meal.date === date) || null;
}

function choresForDate(vm, date) {
  return (vm.familyPlanning?.chores || []).filter((chore) => choreDueOnDay(chore, {
    date,
    long: plannerDayLabel(date).long
  }));
}

function renderDesignedLessonList(assignments, emptyMessage) {
  return assignments.length
    ? `<div class="learn-designed-lesson-list">${assignments.map((item) => `
        <article class="learn-designed-lesson-card" style="border-left-color:${html(item.color || "var(--gold)")};">
          <strong>${html(item.title)}</strong>
          ${item.sub ? `<small>${html(item.sub)}</small>` : ""}
          ${item.note && item.note !== item.sub ? `<em>${html(item.note)}</em>` : ""}
        </article>`).join("")}</div>`
    : emptyState(emptyMessage);
}

function renderDashboardDesignedLessons(vm) {
  const date = vm.todayInChurch?.civilDate || "";
  const assignments = designedAssignmentsForDate(vm, date);
  const dayHref = `/myagapay/learn/planner?view=day&date=${encodeURIComponent(date)}`;
  return `
    <div style="background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:18px 22px;box-shadow:0 1px 3px rgba(20,40,70,.04);">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;">
        <span style="display:flex;align-items:center;gap:9px;"><span style="color:var(--gold);font-size:16px;">▦</span><span style="color:var(--gold);font-size:12px;letter-spacing:.18em;font-weight:600;">TODAY'S DESIGNED LESSONS</span></span>
        <a href="${html(dayHref)}" style="color:var(--gold);font-size:12px;font-weight:800;text-decoration:none;">Open day</a>
      </div>
      ${renderDesignedLessonList(assignments, "Drag subjects into this day from the Week view to seed today's Dashboard lessons.")}
    </div>
  `;
}

function renderDashboardFamilyCards(vm) {
  const date = vm.todayInChurch?.civilDate || "";
  const todayEvents = eventsForDate(vm, date);
  const upcomingDates = nextSevenDates(date).concat(Array.from({ length: 84 }, (_, index) => {
    const parsed = new Date(`${date}T00:00:00.000Z`);
    parsed.setUTCDate(parsed.getUTCDate() + index + 8);
    return parsed.toISOString().slice(0, 10);
  }));
  const upcomingEvents = [...expandFamilyEvents(vm.familyPlanning?.events || [], upcomingDates).entries()]
    .flatMap(([eventDate, events]) => events.map((event) => ({ ...event, occurrenceDate: eventDate })))
    .filter((event) => event.occurrenceDate >= date)
    .sort((a, b) => `${a.occurrenceDate} ${a.startTime || ""}`.localeCompare(`${b.occurrenceDate} ${b.startTime || ""}`))
    .slice(0, 4);
  const meal = mealForDate(vm, date);
  const chores = choresForDate(vm, date).slice(0, 6);
  const appointmentItems = todayEvents.length ? todayEvents : upcomingEvents;
  const appointmentTitle = todayEvents.length ? "Today's Appointments" : "Upcoming Appointments";
  return `
    <div class="learn-dashboard-family-grid">
      <section class="learn-dashboard-family-card">
        <div><small>APPOINTMENTS</small><h3>${html(appointmentTitle)}</h3></div>
        ${appointmentItems.length ? `<div class="learn-dashboard-mini-list">${appointmentItems.map((event) => { const eventDate = event.occurrenceDate || event.date; return `<span><strong>${html(event.title || "Appointment")}</strong><small>${html(eventDate === date ? timeLabel(event.startTime) : `${eventDate} · ${timeLabel(event.startTime)}`)}${event.location ? ` · ${html(event.location)}` : ""}${eventRecurrence(event.recurrence) !== "none" ? ` · ${html(eventRecurrenceLabel(event.recurrence))}` : ""}</small></span>`; }).join("")}</div>` : emptyState("Add appointments in Planner > Events.")}
      </section>
      <section class="learn-dashboard-family-card">
        <div><small>MEALS</small><h3>Meal Plan</h3></div>
        ${meal ? `<div class="learn-dashboard-mini-list">
          <span><strong>Breakfast</strong><small>${html(meal.breakfast || "Open")}</small></span>
          <span><strong>Lunch</strong><small>${html(meal.lunch || "Open")}</small></span>
          <span><strong>Dinner</strong><small>${html(meal.dinner || "Open")}</small></span>
        </div>` : emptyState("Plan today's meals in Planner > Meals.")}
      </section>
      <section class="learn-dashboard-family-card">
        <div><small>CHORES</small><h3>Household Chores</h3></div>
        ${chores.length ? `<div class="learn-dashboard-mini-list">${chores.map((chore) => `<span><strong>${html(chore.title || "Chore")}</strong><small>${html([chore.assignee, choreScheduleLabel(chore), chore.notes].filter(Boolean).join(" · "))}</small></span>`).join("")}</div>` : emptyState("Add chores in Planner > Chores.")}
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

  // ── Readings — distinct actionable callout ────────────────────────────────────
  const hasReadings = today.epistleRef || today.gospelRef;
  const readingsCallout = hasReadings ? `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px;">
      <div style="background:linear-gradient(135deg,#fffbf0,#f7edd6);border:1px solid rgba(181,148,47,.28);border-radius:11px;padding:12px;">
        <div style="display:flex;align-items:center;gap:7px;margin-bottom:5px;">
          <span style="color:var(--gold);font-size:14px;">☰</span>
          <span style="color:var(--gold);font-size:10px;letter-spacing:.13em;font-weight:800;text-transform:uppercase;">Epistle</span>
        </div>
        <strong style="font-family:'Cormorant Garamond',serif;font-size:18px;color:var(--ink);line-height:1.1;">${html(today.epistleRef)}</strong>
      </div>
      <div style="background:linear-gradient(135deg,#fffbf0,#f7edd6);border:1px solid rgba(181,148,47,.28);border-radius:11px;padding:12px;">
        <div style="display:flex;align-items:center;gap:7px;margin-bottom:5px;">
          <span style="color:var(--gold);font-size:14px;">☩</span>
          <span style="color:var(--gold);font-size:10px;letter-spacing:.13em;font-weight:800;text-transform:uppercase;">Gospel</span>
        </div>
        <strong style="font-family:'Cormorant Garamond',serif;font-size:18px;color:var(--ink);line-height:1.1;">${html(today.gospelRef)}</strong>
      </div>
    </div>` : "";

  // ── Church Rhythms — proper grid with breathing room ──────────────────────────
  const rhythmsGrid = vm.churchRhythms.length
    ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:1px;background:var(--line);border-radius:10px;overflow:hidden;">
        ${vm.churchRhythms.map((r, i) => `
          <div style="display:flex;align-items:center;gap:12px;padding:14px 16px;background:var(--paper);">
            ${completionCheck(r, "daily", r.label)}
            <span style="line-height:1.25;min-width:0;">
              <span style="display:block;font-size:15px;color:var(--ink);font-weight:500;">${html(r.label)}</span>
              ${r.sub ? `<span style="display:block;font-size:12px;color:var(--muted);">${html(r.sub)}</span>` : ""}
            </span>
          </div>`).join("")}
       </div>`
    : emptyState("Add church rhythms in Setup — Morning Prayer, Readings, Saint of the Day.");

  // ── Together This Week ────────────────────────────────────────────────────────
  const householdGroups = vm.householdStream.reduce((groups, item) => {
    const label = item.group || "Everyone Together";
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(item);
    return groups;
  }, new Map());
  const togetherThisWeek = householdGroups.size
    ? [...householdGroups.entries()].map(([group, items]) => `
        <section>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin:2px 0 8px;">
            <strong style="color:var(--ink);font-family:'Cormorant Garamond',serif;font-size:18px;">${html(group)}</strong>
            <span style="font-size:11px;color:var(--muted);">${items.filter((item) => item.complete).length}/${items.length} complete</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:9px;">
            ${items.map((item) => `
              <div style="display:flex;align-items:center;gap:12px;background:var(--paper2);border:1px solid var(--line);border-radius:10px;padding:11px 13px;">
                <span style="width:38px;height:38px;border-radius:50%;background:#f1e6c9;color:var(--gold);display:flex;align-items:center;justify-content:center;font-size:18px;flex:none;">${html(item.icon)}</span>
                <a href="${html(item.href)}" style="flex:1;min-width:0;line-height:1.2;text-decoration:none;color:inherit;">
                  <span style="display:block;font-weight:600;font-size:15.5px;color:var(--ink);">${html(item.title)}</span>
                  <span style="display:block;font-size:12.5px;color:var(--muted);">${html(item.sub)}</span>
                </a>
                <span style="color:var(--muted);font-size:13px;flex:none;">${html(item.time)}</span>
                ${completionCheck(item, "weekly", item.title)}
              </div>`).join("")}
          </div>
        </section>`).join("")
    : `<div style="color:var(--muted);font-style:italic;">Run Quick Setup or add Enrichment in Advanced Setup to build this week together.</div>`;

  // ── Week stats strip — above child columns ────────────────────────────────────
  const weekStatsStrip = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;">
      ${vm.thisWeek.map((w) => `
        <div style="background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:14px;display:flex;align-items:center;gap:12px;box-shadow:0 1px 3px rgba(20,40,70,.04);">
          <span style="width:40px;height:40px;border-radius:50%;background:${w.color};color:#f3ead4;display:flex;align-items:center;justify-content:center;font-size:18px;flex:none;">${html(w.icon)}</span>
          <div style="min-width:0;">
            <span style="display:block;font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:600;color:var(--ink);line-height:1;">${html(w.big)}</span>
            <span style="display:block;font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${html(w.label)}</span>
            <span style="display:block;font-size:11px;color:var(--gold);font-weight:600;">${html(w.sub)}</span>
          </div>
        </div>`).join("")}
      <a href="/myagapay/learn/planner" style="background:var(--navy);border:1px solid var(--gold);border-radius:12px;padding:14px;display:flex;align-items:center;justify-content:center;gap:8px;font-size:14px;color:#fffaf0;font-weight:700;text-decoration:none;box-shadow:0 1px 3px rgba(20,40,70,.04);">
        Open Planner <span style="color:var(--gold);">→</span>
      </a>
    </div>`;

  // ── Child columns — with empty state ─────────────────────────────────────────
  const childColumnsGrid = vm.childColumns.length
    ? vm.childColumns.map((col) => `
        <article style="background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:14px;box-shadow:0 1px 3px rgba(20,40,70,.04);">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--line);">
            <span style="width:34px;height:34px;border-radius:50%;background:${col.color};color:#f3ead4;display:flex;align-items:center;justify-content:center;font-size:16px;flex:none;">${html(col.initial)}</span>
            <div style="line-height:1.15;min-width:0;">
              <span style="display:block;font-size:10px;letter-spacing:.12em;color:var(--gold);font-weight:600;">${html(col.tag)}</span>
              <span style="display:block;font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${html(col.name)} <span style="color:var(--muted);font-size:13px;">• Age ${html(col.age)}</span></span>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            ${col.tasks.map((t) => `
              <div style="display:flex;align-items:center;gap:9px;background:var(--paper2);border:1px solid var(--line);border-radius:9px;padding:9px 10px;">
                <a href="/myagapay/learn/planner" style="flex:1;min-width:0;line-height:1.15;text-decoration:none;color:inherit;">
                  <span style="display:block;font-weight:600;font-size:14px;color:var(--ink);">${html(t.title)}</span>
                  <span style="display:block;font-size:11.5px;color:var(--muted);">${html(t.sub)}</span>
                </a>
                <span style="color:var(--muted);font-size:11.5px;flex:none;">${html(t.time)}</span>
                ${completionCheck(t, "weekly", `${col.name}: ${t.title}`)}
              </div>`).join("")}
          </div>
        </article>`).join("")
    : `<div style="grid-column:1/-1;background:var(--paper);border:1px dashed var(--line);border-radius:14px;padding:28px;text-align:center;">
         <div style="color:var(--gold);font-size:28px;margin-bottom:10px;">◎</div>
         <strong style="font-family:'Cormorant Garamond',serif;font-size:22px;color:var(--ink);display:block;margin-bottom:6px;">No children in the planner yet</strong>
         <p style="color:var(--muted);margin:0 0 16px;line-height:1.5;">Add children in Setup to see their individual work here each week.</p>
         <a href="/myagapay/learn/setup" style="display:inline-flex;align-items:center;gap:8px;background:var(--navy);color:#fff;border:1px solid var(--gold);border-radius:10px;padding:10px 18px;text-decoration:none;font-weight:700;font-size:14px;">Go to Setup →</a>
       </div>`;

  const body = `
    <section data-screen-label="Dashboard" style="display:flex;flex-direction:column;gap:22px;">

      <!-- Today in the Church -->
      <div data-church-card style="background:var(--paper);border:1px solid var(--line);border-radius:14px;box-shadow:0 1px 3px rgba(20,40,70,.04);overflow:hidden;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 18px;border-bottom:1px solid var(--line);background:rgba(255,250,240,.72);">
          <span style="display:flex;align-items:center;gap:8px;"><span style="color:var(--gold);font-size:15px;">☩</span><span style="color:var(--gold);font-size:12px;letter-spacing:.18em;font-weight:800;text-transform:uppercase;">Today in the Church</span></span>
          <button type="button" data-church-toggle aria-expanded="true" aria-controls="learn-church-body" style="border:none;background:none;cursor:pointer;color:var(--muted);font-family:inherit;font-size:12px;display:flex;align-items:center;gap:5px;padding:4px 8px;border-radius:6px;" title="Minimize or expand the Church calendar card">
            <span data-church-toggle-label>Minimize</span>
            <span data-church-toggle-icon style="font-size:10px;">▲</span>
          </button>
        </div>
        <div id="learn-church-body" data-church-body style="padding:22px;display:flex;gap:24px;flex-wrap:wrap;">
          ${churchIconPanel}
          <div class="learn-today-main">
            <div style="color:var(--gold);font-size:12px;letter-spacing:.18em;font-weight:600;">${html(today.kicker)}</div>
            <div style="font-family:'Cormorant Garamond',serif;font-size:30px;font-weight:600;color:var(--ink);line-height:1.1;">${html(displayedSaintTitle)}</div>
            <div class="learn-today-meta-grid">
              <div style="display:flex;gap:10px;"><span style="color:var(--gold);font-size:17px;margin-top:2px;">▣</span><span><span style="display:block;color:var(--gold);font-size:10.5px;letter-spacing:.13em;font-weight:600;">LITURGICAL DATE</span><span style="font-size:16px;display:block;">${html(today.liturgicalDateLabel)}</span>${today.annoMundiLabel ? `<span style="color:var(--muted);font-size:13px;font-style:italic;">${html(today.annoMundiLabel)}</span>` : ""}</span></div>
              <div style="display:flex;flex-direction:column;gap:12px;">
                <div style="display:flex;gap:10px;"><span style="color:var(--gold);font-size:17px;margin-top:2px;">✥</span><span><span style="display:block;color:var(--gold);font-size:10.5px;letter-spacing:.13em;font-weight:600;">TONE OF THE WEEK</span><span style="font-size:16px;">${html(today.toneLabel)}</span></span></div>
                <div style="display:flex;gap:10px;"><span style="color:var(--gold);font-size:17px;margin-top:2px;">♙</span><span><span style="display:block;color:var(--gold);font-size:10.5px;letter-spacing:.13em;font-weight:600;">FASTING RULE</span><span style="font-size:16px;display:block;">${html(today.fastingRule)}</span><span style="color:var(--muted);font-size:13px;font-style:italic;">${html(today.fastingNote)}</span></span></div>
              </div>
              <div class="learn-today-readings">
                ${readingsCallout}
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
      </div>

      <!-- Daily Church Rhythms — proper grid -->
      <div style="background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:18px 22px;box-shadow:0 1px 3px rgba(20,40,70,.04);">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;">
          <span style="display:flex;align-items:center;gap:9px;"><span style="color:var(--gold);font-size:16px;">✥</span><span style="color:var(--gold);font-size:12px;letter-spacing:.18em;font-weight:600;">DAILY CHURCH RHYTHMS</span></span>
          <small style="color:var(--muted);">Resets each day</small>
        </div>
        ${rhythmsGrid}
      </div>

      ${renderDashboardDesignedLessons(vm)}
      ${renderDashboardFamilyCards(vm)}

      <!-- Together This Week — full width -->
      <div style="background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:18px 22px;box-shadow:0 1px 3px rgba(20,40,70,.04);">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;">
          <span style="display:flex;align-items:center;gap:9px;"><span style="color:var(--gold);font-size:17px;">⌂</span><span style="color:var(--gold);font-size:12px;letter-spacing:.15em;font-weight:600;">TOGETHER THIS WEEK</span></span>
          <small style="color:var(--muted);">Resets Sunday</small>
        </div>
        <div style="display:flex;flex-direction:column;gap:13px;">${togetherThisWeek}</div>
      </div>

      <!-- Week stats strip + child columns -->
      <!-- learn-week-overview WEEK AT A GLANCE -->
      <section style="display:grid;gap:14px;">
        <div style="display:flex;align-items:end;justify-content:space-between;gap:12px;flex-wrap:wrap;">
          <div>
            <div style="color:var(--gold);font-size:11px;letter-spacing:.16em;font-weight:800;text-transform:uppercase;">Forms & Children</div>
            <h2 style="font-family:'Cormorant Garamond',serif;font-size:28px;line-height:1;margin:5px 0 0;color:var(--ink);">Individual work this week</h2>
          </div>
          <small style="color:var(--muted);">${vm.childColumns.length} ${vm.childColumns.length === 1 ? "learner" : "learners"}</small>
        </div>
        ${weekStatsStrip}
        <div class="learn-child-week-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:14px;align-items:start;">
          ${childColumnsGrid}
        </div>
      </section>

    </section>
  `;
  return shell(vm, body);
}

function renderPlanner(vm) {
  seedFamilyPrototypeState(vm);
  const query = new URLSearchParams(window.location.search);
  const activeScope = plannerScopeFromQuery();
  const mealTool = mealToolFromQuery();
  const scopeAllowsTerm = activeScope === "lessons";
  const viewSet = scopeAllowsTerm ? ["day", "week", "month", "term", "year"] : ["day", "week", "month"];
  const displayView = viewSet.includes(vm.activeView) ? vm.activeView : "week";
  if (!scopeAllowsTerm && vm.activeView !== displayView) {
    window.history.replaceState(null, "", plannerHref({ view: displayView, term: null, termId: null }));
  }
  const viewTabs = viewSet.map((view) => ({
    id: view,
    label: view.charAt(0).toUpperCase() + view.slice(1),
    href: plannerHref(scopeAllowsTerm ? { view } : { view, term: null, termId: null }),
    active: displayView === view
  }));
  const familyTabs = [
    { id: "lessons", label: "Lessons", icon: "▦" },
    { id: "meals",   label: "Meals",   icon: "♨" },
    { id: "chores",  label: "Chores",  icon: "✓" },
    { id: "events",  label: "Events",  icon: "◷" }
  ];
  const mealTools = [
    { id: "plan",      label: "Plan",      icon: "▦" },
    { id: "recipes",   label: "Recipes",   icon: "☰" },
    { id: "groceries", label: "Groceries", icon: "▤" },
    { id: "pantry",    label: "Pantry",    icon: "☖" }
  ];

  // ── Intro — shown on first visit per scope, dismissible ───────────────────────
  const introDismissedKey = `agapay.learn.plannerIntro.${activeScope}`;
  const introDismissed = typeof localStorage !== "undefined" && localStorage.getItem(introDismissedKey) === "1";
  const introHtml = introDismissed ? "" : `
    ${renderFamilyPlannerIntro(vm, activeScope === "meals" && mealTool !== "plan" ? mealTool : activeScope)}
    <div style="margin-top:-8px;display:flex;justify-content:flex-end;">
      <button type="button" data-planner-intro-dismiss="${introDismissedKey}"
        style="border:0;background:none;color:var(--muted);font-family:inherit;font-size:12px;cursor:pointer;padding:4px 0;">
        Hide this — I know what this page does
      </button>
    </div>`;

  const controls = `
    <div class="learn-family-toolbar">
      <div class="learn-family-tabs" aria-label="Planner view">
        ${viewTabs.map((tab) => `<a href="${tab.href}" aria-current="${tab.active ? "page" : "false"}">${html(tab.label)}</a>`).join("")}
      </div>
      <div class="learn-family-tabs learn-family-tabs-wide" aria-label="Planner layer">
        ${familyTabs.map((tab) => {
          const nextScopeAllowsTerm = tab.id === "lessons";
          return `<a href="${plannerHref({
            scope: tab.id,
            tool: tab.id === "meals" ? mealTool : null,
            view: nextScopeAllowsTerm ? displayView : (["day", "week", "month"].includes(displayView) ? displayView : "week"),
            term: nextScopeAllowsTerm ? query.get("term") : null,
            termId: nextScopeAllowsTerm ? query.get("termId") : null
          })}" aria-current="${activeScope === tab.id ? "page" : "false"}"><span>${html(tab.icon)}</span>${html(tab.label)}</a>`;
        }).join("")}
      </div>
      <div class="learn-family-range">
        <strong>${html(displayView === "month" ? vm.month.label : vm.week.label)}</strong>
        <span>${html(vm.week.seasonLabel || "Household rhythm")}</span>
      </div>
      ${scopeAllowsTerm && displayView !== "year" ? `<div class="learn-family-tabs learn-family-term-tabs" aria-label="Planner term">${vm.termTabs.map((tab) => `<a href="${tab.href}" aria-current="${tab.active ? "page" : "false"}">${html(tab.label)}</a>`).join("")}</div>` : ""}
      ${!scopeAllowsTerm ? `<span class="learn-family-lock">Meals, chores, and events use day, week, and month views.</span>` : ""}
    </div>
    ${activeScope === "meals" ? `<div class="learn-family-meal-tools" aria-label="Meal tools">
      ${mealTools.map((tool) => `<a href="${plannerHref({ scope: "meals", tool: tool.id, view: displayView, term: null, termId: null })}" aria-current="${mealTool === tool.id ? "page" : "false"}"><span>${html(tool.icon)}</span>${html(tool.label)}</a>`).join("")}
    </div>` : ""}
  `;

  const lessonContent = displayView === "day"
    ? renderPlannerDay(vm)
    : displayView === "month"
      ? renderPlannerMonth(vm)
      : displayView === "term"
        ? renderPlannerTerm(vm)
        : displayView === "year"
          ? renderPlannerYear(vm)
          : renderPlannerWeek(vm);
  const scopedContent = activeScope === "lessons" ? `${lessonContent}${renderPlannerReserveCard(vm)}` : renderFamilyPlannerScope(vm, activeScope, displayView, mealTool);

  const body = `
    <section data-screen-label="Family Planner" class="learn-family-page">
      ${introHtml}
      ${controls}
      ${scopedContent}
    </section>
  `;
  return shell(vm, body);
}

function statusPill(status) {
  const normalized = String(status || "").toLowerCase();
  const color = normalized === "completed" ? "var(--navy)" : normalized === "deferred" ? "var(--burgundy)" : normalized === "reduced" ? "var(--gold)" : "var(--muted)";
  return `<span style="border:1px solid ${color};color:${color};border-radius:999px;padding:2px 8px;font-size:11px;text-transform:capitalize;">${html(status || "planned")}</span>`;
}

function renderPlannerReserveCard(vm) {
  const items = vm.term?.graceReserve || [];
  const currentMode = vm.term?.graceMode?.rule?.mode || vm.graceMode?.mode || "";
  const body = items.length
    ? `<div class="learn-reserve-grid">${items.map((item) => `<article style="border-color:${html(item.color)};background:${softColor(item.color, "18")};"><strong>${html(item.title)}</strong><small>${html(item.note || "Saved in the reserve list for a roomier day.")}</small></article>`).join("")}</div>`
    : `<p class="learn-reserve-empty">No subjects are currently deferred into the reserve list.</p>`;
  return `
    <section class="learn-planner-reserve-card">
      <div class="learn-planner-reserve-head">
        <div>
          <small>GRACE RESERVE</small>
          <h2>Deferred Subjects</h2>
        </div>
        ${currentMode ? `<span>${html(currentMode)}</span>` : ""}
      </div>
      ${body}
    </section>
  `;
}

function renderWeeklyAssignmentBoard(vm) {
  const items = vm.week.weeklyAssignmentItems || [];
  const card = (item) => {
    const minutesLabel = Number(item.minutes) > 0 ? `${Number(item.minutes)} min` : "";
    return `<article class="learn-week-assignment-card" draggable="true" data-week-assignment-card data-item-id="${html(item.id)}" data-statuses="${html((item.statuses || []).join(","))}" data-weekly-frequency="${html(item.weeklyFrequency || "")}" style="border-left-color:${html(item.color || "var(--gold)")};"><strong>${html(item.title)}</strong>${item.sub ? `<small>${html(item.sub)}</small>` : ""}${minutesLabel ? `<span class="learn-week-assignment-minutes">${html(minutesLabel)}</span>` : ""}<textarea data-week-assignment-note placeholder="Specify chapters, pages, lessons, or notes for this day">${html(item.sub || "")}</textarea></article>`;
  };
  const weekNum = vm.week.termWeekNumber || 0;
  const totalWeeks = vm.week.totalTermWeeks || 0;
  const weekLabel = weekNum && totalWeeks ? `Week ${weekNum} of ${totalWeeks}` : vm.week.label || "This Week";
  const weekStartDate = vm.week.weekStartDate || vm.week.days?.[0]?.date || "";
  const weekEndDate = vm.week.weekEndDate || vm.week.days?.[6]?.date || "";
  return `
    <section class="learn-week-assignment-board" data-week-assignment-board data-week-key="${html([vm.week.days[0]?.date, vm.week.days[6]?.date].filter(Boolean).join("_"))}" data-week-start="${html(weekStartDate)}" data-week-end="${html(weekEndDate)}">
      <div class="learn-week-assignment-head">
        <div>
          <div>WEEKLY PLANNER</div>
          <h2>${html(vm.week.label || "This Week")}</h2>
        </div>
        <div class="learn-week-nav" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:6px;">
            <button type="button" data-week-nav="-1" aria-label="Previous week" style="border:1px solid var(--line);background:var(--paper2);color:var(--ink);border-radius:9px;padding:8px 12px;font-family:inherit;cursor:pointer;">← Prev</button>
            <span style="font-size:13px;color:var(--muted);white-space:nowrap;padding:0 4px;">${html(weekLabel)}</span>
            <button type="button" data-week-nav="1" aria-label="Next week" style="border:1px solid var(--line);background:var(--paper2);color:var(--ink);border-radius:9px;padding:8px 12px;font-family:inherit;cursor:pointer;">Next →</button>
            <button type="button" data-week-nav="today" style="border:1px solid var(--goldsoft);background:var(--paper);border-radius:9px;padding:8px 12px;font-family:inherit;cursor:pointer;color:var(--gold);font-weight:600;">Today</button>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <small style="color:var(--muted);">Drag a subject into a day.</small>
            <button type="button" data-week-designed-print>Print designed week</button>
          </div>
        </div>
      </div>
      <div class="learn-week-assignment-layout">
        <div class="learn-week-assignment-pool">
          <strong>Available subjects</strong>
          <div class="learn-week-assignment-dropzone" data-week-assignment-zone="pool">${items.length ? items.map(card).join("") : emptyState("No setup subjects are active this week.")}</div>
        </div>
        <div class="learn-week-assignment-days">
          ${vm.week.days.map((day) => {
            const appointments = day.events || [];
            return `<div class="learn-week-assignment-day"><strong>${html(day.weekday || day.weekdayLong)}<span>${html(day.shortDate || day.date)}</span></strong>${appointments.length ? `<div class="learn-week-assignment-events">${appointments.slice(0, 3).map((event) => `<span>${html(event.startTime || "")}${event.startTime ? " · " : ""}${html(event.title || "Appointment")}</span>`).join("")}${appointments.length > 3 ? `<small>+ ${appointments.length - 3} more</small>` : ""}</div>` : ""}<div class="learn-week-assignment-dropzone" data-week-assignment-zone="${html(day.date)}"></div></div>`;
          }).join("")}
        </div>
      </div>
    </section>
  `;
}

function renderPlannerWeek(vm) {
  return `
    ${renderWeeklyAssignmentBoard(vm)}
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
  const designedAssignments = designedAssignmentsForDate(vm, day.date);
  const household = designedAssignments.length
    ? renderDesignedLessonList(designedAssignments, "")
    : day.isSunday
      ? emptyState("Sunday is reserved for worship, rest, and family rhythm. No school blocks are scheduled.")
      : vm.day.householdBlocks.length
        ? vm.day.householdBlocks.map((block) => `<div style="display:grid;grid-template-columns:1fr 70px 100px;gap:12px;align-items:center;padding:12px 0;border-top:1px solid var(--line);"><span><strong>${html(block.title)}</strong><small style="display:block;color:var(--muted);">${html(block.sub)}</small></span><span>${html(block.minutes)}m</span>${statusPill(block.status)}</div>`).join("")
        : emptyState("Drag subjects into this day from the Week view, or add setup subjects for this week.");
  const forms = day.isSunday ? "" : vm.day.formBlocks.map((form) => `<div style="border:1px solid var(--line);border-radius:10px;background:var(--paper2);padding:12px;display:grid;gap:10px;"><div style="display:flex;gap:10px;align-items:center;"><span style="width:34px;height:34px;border-radius:50%;background:${form.color};color:#f3ead4;display:flex;align-items:center;justify-content:center;">${html(form.initials.slice(0, 2).join(""))}</span><span><strong>${html(form.formLabel)}</strong><small style="display:block;color:var(--muted);">${html(form.childNames.join(", "))}</small></span></div>${form.items.map((item) => `<div style="display:grid;grid-template-columns:1fr 60px 90px;gap:10px;align-items:center;border-top:1px solid var(--line);padding-top:8px;"><span><strong>${html(item.title)}</strong><small style="display:block;color:var(--muted);">${html(item.sub)}</small></span><span>${html(item.minutes)}m</span>${statusPill(item.status)}</div>`).join("")}</div>`).join("");
  const appointments = day.events || eventsForDate(vm, day.date);
  const appointmentPanel = appointments.length
    ? `<div style="display:grid;gap:9px;">${appointments.map((event) => `<div style="border:1px solid var(--line);border-radius:10px;background:var(--paper2);padding:10px 12px;"><strong>${html(event.title || "Appointment")}</strong><small style="display:block;color:var(--muted);">${html([timeLabel(event.startTime), event.location, event.notes].filter(Boolean).join(" · "))}</small></div>`).join("")}</div>`
    : emptyState("No appointments are scheduled for this day.");
  return `
    <div style="display:flex;gap:8px;overflow:auto;padding-bottom:2px;">${dayLinks}</div>
    <div style="display:grid;grid-template-columns:1.1fr .9fr;gap:16px;align-items:start;">
      ${panel("Daily Plan", `<h2 style="font-family:'Cormorant Garamond',serif;font-size:28px;margin:0;">${html(day.weekdayLong || day.weekday)} · ${html(day.shortDate || day.date)}</h2><p style="margin:6px 0 14px;color:var(--muted);">${html(day.feast)} · ${html(day.fasting)}</p>${household}`, { icon: day.isSunday ? "☩" : "▣" })}
      ${panel("Form Work", day.isSunday ? `<div style="color:var(--muted);line-height:1.45;">No Form work is scheduled on Sunday.</div>` : `<div style="display:grid;gap:10px;">${forms || emptyState("No Form blocks for this day.")}</div>`, { icon: "◎" })}
    </div>
    ${panel("Appointments", appointmentPanel, { icon: "◷" })}
    ${panel("Church Notes", `<div style="display:grid;grid-template-columns:repeat(3,minmax(180px,1fr));gap:12px;"><div><small style="color:var(--gold);letter-spacing:.12em;">EPISTLE</small><strong style="display:block;">${html(day.epistle || "Set readings source")}</strong></div><div><small style="color:var(--gold);letter-spacing:.12em;">GOSPEL</small><strong style="display:block;">${html(day.gospel || "Set readings source")}</strong></div><div><small style="color:var(--gold);letter-spacing:.12em;">TONE</small><strong style="display:block;">${html(day.tone || "Tone")}</strong></div></div>`, { icon: "✥" })}
  `;
}

function renderFamilyPlanningEditor(vm) {
  return `<form data-family-planning-form id="family-planner" style="display:grid;gap:12px;scroll-margin-top:110px;">${panel("Family Planner & Meals", familyPlanningSetupPanel({ familyPlanning: vm.familyPlanning, household: vm.familyPlanning.household, children: vm.familyPlanning.children }), { icon: "▣", largeTitle: true })}<div class="learn-family-planner-save"><span data-family-planning-status>Appointments, name days, meals, recipes, and groceries save independently from school setup.</span><button type="submit">Save Family Planner</button></div></form>`;
}

function plannerDates(vm) {
  const start = vm.familyPlanning.weekStart || vm.week.days?.[0]?.date || new Date().toISOString().slice(0, 10);
  return nextSevenDates(start);
}

function plannerDayLabel(date = "") {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T12:00:00`) : new Date();
  return {
    weekday: parsed.toLocaleDateString(undefined, { weekday: "short" }),
    long: parsed.toLocaleDateString(undefined, { weekday: "long" }),
    short: parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" })
  };
}

function choreCadence(chore = {}) {
  const raw = String(chore.cadence || chore.frequency || "").toLowerCase();
  if (["daily", "weekly", "monthly", "quarterly", "yearly"].includes(raw)) return raw;
  return chore.day ? "weekly" : "daily";
}

function choreAssigneeOptions(planning = {}) {
  const household = planning.household || {};
  const names = [
    "Everyone",
    household.motherName || "Mom",
    household.fatherName || "Dad",
    ...(planning.children || []).map((child) => child.name || child.firstName).filter(Boolean)
  ];
  return [...new Set(names.filter(Boolean))];
}

function dayOfMonthOptions() {
  return [{ value: "", label: "Choose day" }, ...Array.from({ length: 31 }, (_, index) => ({ value: String(index + 1), label: `${index + 1}` }))];
}

const choreTimeOptions = ["Morning", "Afternoon", "Evening"];

function choreTimeValues(value = "") {
  const values = Array.isArray(value) ? value : String(value || "").split(/[,\u00b7|]/);
  return values.map((item) => item.trim()).filter((item) => choreTimeOptions.includes(item));
}

function choreTimeLabel(value = "") {
  const selected = choreTimeValues(value);
  return selected.length ? selected.join(" & ") : "Anytime";
}

function choreTimeCheckboxes(name, value = "") {
  const selected = choreTimeValues(value);
  return `<fieldset class="learn-chore-time-field"><legend>Time</legend>${choreTimeOptions.map((option) => `<label><input type="checkbox" name="${html(name)}" value="${html(option)}" ${selected.includes(option) ? "checked" : ""}> ${html(option)}</label>`).join("")}<small>Select one or more.</small></fieldset>`;
}

const eventRecurrenceOptions = [
  { value: "none", label: "Does not repeat" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Bi-weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" }
];

function eventRecurrence(value = "") {
  const raw = String(value || "").toLowerCase();
  return ["weekly", "biweekly", "monthly", "quarterly", "yearly"].includes(raw) ? raw : "none";
}

function eventRecurrenceLabel(value = "") {
  return eventRecurrenceOptions.find((option) => option.value === eventRecurrence(value))?.label || "Does not repeat";
}

function isoDateParts(value = "") {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function eventOccursOnDate(event = {}, date = "") {
  if (!event.date || !date || date < event.date) return false;
  const recurrence = eventRecurrence(event.recurrence);
  if (recurrence === "none") return event.date === date;
  const start = new Date(`${event.date}T00:00:00.000Z`);
  const target = new Date(`${date}T00:00:00.000Z`);
  const diffDays = Math.round((target - start) / 86400000);
  if (diffDays < 0) return false;
  if (recurrence === "weekly") return diffDays % 7 === 0;
  if (recurrence === "biweekly") return diffDays % 14 === 0;
  const startParts = isoDateParts(event.date);
  const targetParts = isoDateParts(date);
  if (!startParts || !targetParts || startParts.day !== targetParts.day) return false;
  const monthDiff = (targetParts.year - startParts.year) * 12 + (targetParts.month - startParts.month);
  if (recurrence === "monthly") return monthDiff >= 0;
  if (recurrence === "quarterly") return monthDiff >= 0 && monthDiff % 3 === 0;
  return recurrence === "yearly" && startParts.month === targetParts.month;
}

function expandFamilyEvents(events = [], dates = []) {
  const byDate = new Map();
  dates.filter(Boolean).forEach((date) => {
    const matches = events
      .filter((event) => eventOccursOnDate(event, date))
      .map((event) => ({ ...event, occurrenceDate: date }));
    if (matches.length) byDate.set(date, matches);
  });
  return byDate;
}

function choreSetupRow(chore = {}, index = 0, planning = {}) {
  const cadence = choreCadence(chore);
  const assignees = choreAssigneeOptions(planning);
  return `<article data-setup-row="chores" data-id="${html(chore.id || "")}" class="learn-chore-editor">
    <div class="learn-chore-editor-main">
      ${setupInput("Chore", "title", chore.title || "")}
      ${setupSelect("Assigned to", "assignee", chore.assignee || "Everyone", assignees)}
      ${setupSelect("Type", "cadence", cadence, [{ value: "daily", label: "Daily" }, { value: "weekly", label: "Weekly" }, { value: "monthly", label: "Monthly" }, { value: "quarterly", label: "Quarterly" }, { value: "yearly", label: "Yearly" }])}
      ${setupRemoveButton()}
    </div>
    <div class="learn-chore-editor-schedule">
      ${setupSelect("Weekly day", "day", chore.day || "", ["", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"])}
      ${setupSelect("Monthly day", "dayOfMonth", String(chore.dayOfMonth || ""), dayOfMonthOptions())}
      ${setupSelect("Quarter month", "quarterMonth", String(chore.quarterMonth || "1"), [{ value: "1", label: "1st month" }, { value: "2", label: "2nd month" }, { value: "3", label: "3rd month" }])}
      ${setupInput("Starts on", "assignedDate", chore.assignedDate || "", { type: "date" })}
      ${choreTimeCheckboxes("timeOfDay", chore.timeOfDay || "")}
      ${setupInput("Notes", "notes", chore.notes || "")}
      <label class="learn-check-field"><input type="checkbox" name="completed" ${chore.completed ? "checked" : ""}> Done</label>
    </div>
  </article>`;
}

function renderFamilyPlannerIntro(vm, scope) {
  const intros = {
    lessons: ["Family Planner", "Lessons & Forms", "Your school day, arranged by family work and Form work.", "▦"],
    meals: ["Meal Planning", "Fast-aware weekly meals", "Plan breakfast, lunch, and dinner beside the Church calendar so fasting days and feast days shape the week naturally.", "♨"],
    chores: ["Household Chores", "Practical life for every child", "Keep a visible weekly rotation with lighter expectations on Sundays and feast days.", "✓"],
    events: ["Family Calendar", "Appointments, field trips, and name days", "Keep the household’s real life beside lessons, feasts, and meals.", "◷"],
    calendar: ["Family Calendar", "Appointments, field trips, and name days", "Keep the household’s real life beside lessons, feasts, and meals.", "◷"],
    recipes: ["Recipe Library", "Your fast-aware family recipe box", "Save recipes once, mark fasting fit, and use them as the source for meal planning.", "☰"],
    groceries: ["Grocery List", "From the menu to the store", "Group shopping by aisle and keep pantry staples from cluttering the list.", "▤"],
    pantry: ["Pantry", "Staples, leftovers, and things already on hand", "Track what the household already has so the weekly grocery list stays practical and lean.", "☖"]
  };
  const [kicker, title, desc, icon] = intros[scope] || intros.lessons;
  return `
    <section class="learn-family-intro">
      <span class="learn-family-intro-watermark">${html(icon)}</span>
      <div class="learn-family-intro-icon">${html(icon)}</div>
      <div>
        <div class="learn-family-kicker">${html(kicker)}</div>
        <h1>${html(title)}</h1>
        <p>${html(desc)}</p>
      </div>
    </section>
  `;
}

function renderFamilyPlannerScopeLegacy(vm, scope) {
  const planning = vm.familyPlanning || {};
  const dates = plannerDates(vm);
  const mealByDate = new Map((planning.meals || []).map((meal) => [meal.date, meal]));
  const recipes = planning.recipes || [];
  const groceries = planning.groceryItems || [];
  const chores = planning.chores || [];
  const eventsByDate = expandFamilyEvents(planning.events || [], dates);
  const titleMap = {
    meals: ["Weekly Meals", "Plan one week at a time with fasting guidance beside the family calendar.", "♨"],
    chores: ["Chores", "Keep practical life visible without crowding the school lesson plan.", "✓"],
    calendar: ["Family Calendar", "Appointments, field trips, extracurriculars, and name days in one household view.", "◷"],
    recipes: ["Recipes", "A fast-aware household recipe box connected to your weekly meal plan.", "☰"],
    groceries: ["Grocery List", "A simple shopping list that can grow from meals and recipes.", "▤"]
  };
  const [title, intro, icon] = titleMap[scope] || titleMap.meals;
  const saveBar = `<div class="learn-family-planner-save"><span data-family-planning-status>Changes save to this household's Learn planner.</span><button type="submit">Save ${html(title)}</button></div>`;
  const hidden = `<input type="hidden" name="familyPlanning.weekStart" value="${html(dates[0])}"><input type="hidden" name="familyPlanning.fastingPreference" value="${html(planning.fastingPreference || "guidance")}"><input type="hidden" name="household.motherName" value="${html(planning.household?.motherName || "")}"><input type="hidden" name="household.motherNameDay" value="${html(planning.household?.motherNameDay || "")}"><input type="hidden" name="household.fatherName" value="${html(planning.household?.fatherName || "")}"><input type="hidden" name="household.fatherNameDay" value="${html(planning.household?.fatherNameDay || "")}"><input type="hidden" name="household.parishPatronalFeastName" value="${html(planning.household?.parishPatronalFeastName || "")}"><input type="hidden" name="household.parishPatronalFeastDate" value="${html(planning.household?.parishPatronalFeastDate || "")}">${(planning.children || []).map((child) => `<span data-family-child-id="${html(child.id)}" data-family-child-name="${html(child.name || "")}" hidden><input name="childNameDay" value="${html(child.nameDay || "")}"></span>`).join("")}`;
  let content = "";
  if (scope === "meals") {
    content = `<div class="learn-family-section-note"><strong>Weekly menu</strong><span>Tap into the fields and save the week. Recipe picker and drag-and-drop meal assignment can layer on top of this without changing the data.</span></div><div class="learn-family-meal-grid">${dates.map((date) => {
      const day = plannerDayLabel(date);
      const meal = mealByDate.get(date) || {};
      const calendarDay = (vm.month.days || []).find((item) => item.date === date) || (vm.week.days || []).find((item) => item.date === date) || {};
      const fastingClass = calendarDay.isFastDay ? "is-fast" : calendarDay.isSunday ? "is-feast" : "";
      return `<article class="learn-family-day-card ${fastingClass}" data-setup-row="meals" data-id="${html(meal.id || "")}"><div><span><small>${html(day.weekday)}</small><b>${html(day.short)}</b></span><strong>${html(calendarDay.fastingType || calendarDay.fasting || "No fast")}</strong></div><input type="hidden" name="date" value="${html(date)}"><label><span>Breakfast</span><input name="breakfast" value="${html(meal.breakfast || "")}" placeholder="Add breakfast"></label><label><span>Lunch</span><input name="lunch" value="${html(meal.lunch || "")}" placeholder="Add lunch"></label><label><span>Dinner</span><input name="dinner" value="${html(meal.dinner || "")}" placeholder="Add dinner"></label></article>`;
    }).join("")}</div>`;
  } else if (scope === "calendar") {
    content = `<div class="learn-family-section-note"><strong>This week's calendar</strong><span>Appointments, field trips, extracurriculars, and name days stay visible with school work and meals.</span></div><div class="learn-family-events-list">${dates.map((date) => {
      const day = plannerDayLabel(date);
      const rows = eventsByDate.get(date) || [{}];
      const calendarDay = (vm.week.days || []).find((item) => item.date === date) || {};
      return `<section class="learn-family-date-section"><header><span><small>${html(day.weekday)}</small><strong>${html(day.short)}</strong><em>${html(calendarDay.feast || "Family day")}</em></span><button type="button" data-setup-add-row="familyEvents" data-setup-add-target="familyEvents-${html(date)}" data-setup-add-date="${html(date)}">+ Add</button></header><div id="familyEvents-${html(date)}" data-setup-list="familyEvents" style="display:grid;gap:8px;">${rows.map((event) => familyEventSetupRow({ ...event, date: event.date || date })).join("")}</div></section>`;
    }).join("")}</div>`;
  } else if (scope === "chores") {
    const choreRows = chores.length ? chores : [{}];
    const household = planning.household || {};
    const roster = [
      { name: household.motherName || "Mom", color: "var(--burgundy)" },
      { name: household.fatherName || "Dad", color: "var(--navy)" },
      ...(planning.children || []).map((child) => ({ name: child.name || "Child", color: child.color || "var(--gold)" }))
    ];
    content = `<div class="learn-family-section-note"><strong>Chore rhythm</strong><span>Create daily, weekly, monthly, quarterly, and yearly chores. Assign each one to Mom, Dad, Everyone, or a specific child.</span></div><div class="learn-family-chore-roster">${roster.map((person) => `<span><b style="background:${html(person.color)};">${html(String(person.name || "C").slice(0, 1))}</b>${html(person.name)}</span>`).join("")}</div><div data-setup-list="chores" class="learn-family-edit-list">${choreRows.map((chore, index) => choreSetupRow(chore, index, planning)).join("")}</div><button type="button" data-setup-add-row="chores" class="learn-add-button">Add Chore</button>`;
  } else if (scope === "recipes") {
    content = `<div class="learn-family-section-note"><strong>Recipe library</strong><span>Mark each recipe by fasting fit so AGAPAY can suggest better meals for fast days later.</span></div><div data-setup-list="recipes" class="learn-family-edit-list">${(recipes.length ? recipes : [{}]).map(recipeSetupRow).join("")}</div><button type="button" data-setup-add-row="recipes" class="learn-add-button">Add Recipe</button>`;
  } else {
    const byCategory = new Map();
    groceries.forEach((item) => {
      const category = item.category || "Other";
      if (!byCategory.has(category)) byCategory.set(category, []);
      byCategory.get(category).push(item);
    });
    const summary = groceries.length ? [...byCategory.entries()].map(([category, items]) => `<div class="learn-family-aisle"><strong>${html(category)}</strong><span>${items.map((item) => html(item.name)).join(", ")}</span></div>`).join("") : "";
    content = `<div class="learn-family-section-note"><strong>Grocery list</strong><span>Group items by aisle. Checked items persist so the list can become a real weekly shopping tool.</span></div>${summary ? `<div class="learn-family-grocery-summary">${summary}</div>` : ""}<div data-setup-list="groceryItems" class="learn-family-edit-list">${(groceries.length ? groceries : [{}]).map(grocerySetupRow).join("")}</div><button type="button" data-setup-add-row="groceryItems" class="learn-add-button">Add Grocery Item</button>`;
  }
  return `<form data-family-planning-form id="family-planner" class="learn-family-planner-panel">${hidden}${content}${saveBar}</form>`;
}

function familyPlannerModel(vm) {
  const planning = vm.familyPlanning || {};
  const dates = plannerDates(vm);
  const mealByDate = new Map((planning.meals || []).map((meal) => [meal.date, meal]));
  const children = (planning.children || []).map((child, index) => ({
    ...child,
    name: child.name || child.firstName || `Child ${index + 1}`,
    color: child.color || ACCENTS[index % ACCENTS.length],
    initial: child.initial || String(child.name || child.firstName || "?").charAt(0).toUpperCase()
  }));
  const groceries = (planning.groceryItems || []).map((item) => ({
    ...item,
    pantry: Boolean(item.pantry || item.inPantry),
    checked: Boolean(item.checked)
  }));
  const monthDays = (vm.month?.days || []).map((day) => ({
    ...day,
    date: day.date,
    short: day.dayNumber ? `${day.weekday || ""} ${day.dayNumber}`.trim() : day.date,
    long: day.weekday || "",
    isFastDay: Boolean(day.isFastDay),
    meal: day.meal || mealByDate.get(day.date) || null
  }));
  const calendarDates = [...new Set([...dates, ...monthDays.map((day) => day.date)].filter(Boolean))];
  const eventsByDate = expandFamilyEvents(planning.events || [], calendarDates);
  const weekDays = dates.map((date) => {
    const label = plannerDayLabel(date);
    const liturgical = (vm.week.days || []).find((day) => day.date === date) || {};
    return { date, ...label, ...liturgical };
  });
  return {
    planning,
    dates,
    monthKey: vm.month?.key || "",
    monthLabel: vm.month?.label || "Month Calendar",
    weekDays,
    monthDays,
    mealByDate,
    eventsByDate,
    recipes: planning.recipes || [],
    groceries,
    chores: planning.chores || [],
    children
  };
}

function renderFeastsPanel(model, mode = "week") {
  const days = (mode === "month" ? model.monthDays : model.weekDays)
    .filter((day) => day.inMonth !== false && isImportantPlannerFeast(day))
    .slice(0, mode === "month" ? 8 : 5);

  if (mode === "month") {
    return `<aside class="learn-family-feasts-card" style="position:static;top:auto;display:grid;grid-template-columns:minmax(170px,.55fr) minmax(0,2.45fr);gap:12px;align-items:center;padding:12px 14px;">
      <div style="min-width:0;">
        <small>Feasts this month</small>
        <strong style="font-size:24px;line-height:1;">Church Calendar</strong>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;min-width:0;">
        ${days.length ? days.map((day) => `<article class="${day.isFastDay ? "is-fast" : ""}" style="display:flex;grid-template-columns:none;align-items:center;gap:8px;min-width:0;flex:1 1 180px;max-width:260px;padding:8px 10px;border-radius:11px;">
          <span style="min-width:34px;min-height:34px;width:34px;height:34px;border-radius:9px;font-size:12px;flex:none;">${html(day.dayNumber || day.shortDate || day.short || day.date)}</span>
          <p style="margin:0;min-width:0;">
            <strong style="font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${html(day.feast || day.feastTitle || "Feast day")}</strong>
            <small style="margin-top:2px;font-size:10.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${html([day.feastRank || "Feast", day.isFastDay ? day.fastingType || day.fasting || "" : ""].filter(Boolean).join(" · "))}</small>
          </p>
        </article>`).join("") : `<p class="learn-family-empty-line" style="margin:0;">No major feast markers in this range.</p>`}
      </div>
    </aside>`;
  }

  return `<aside class="learn-family-feasts-card">
    <div><small>Feasts this week</small><strong>Church Calendar</strong></div>
    ${days.length ? days.map((day) => `<article class="${day.isFastDay ? "is-fast" : ""}">
      <span>${html(day.dayNumber || day.shortDate || day.short || day.date)}</span>
      <p><strong>${html(day.feast || day.feastTitle || "Feast day")}</strong><small>${html([day.feastRank || "Feast", day.isFastDay ? day.fastingType || day.fasting || "" : ""].filter(Boolean).join(" · "))}</small></p>
    </article>`).join("") : `<p class="learn-family-empty-line">No major feast markers in this range.</p>`}
  </aside>`;
}

function renderFastingLegend() {
  return `<div class="learn-family-fasting-legend" aria-label="Fasting legend">
    <span><i class="is-strict"></i> Fast day</span>
    <span><i class="is-feast"></i> Feast or Sunday</span>
    <span><i class="is-today"></i> Today</span>
    <span><i class="is-ordinary"></i> Ordinary day</span>
  </div>`;
}

function mealSlotLabel(slot) {
  return { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner" }[slot] || slot;
}

function plannerHiddenData(model) {
  const mealDates = [...new Set([...model.weekDays, ...model.monthDays].map((day) => day.date).filter(Boolean))];
  const meals = mealDates.map((date) => {
    const day = model.monthDays.find((item) => item.date === date) || model.weekDays.find((item) => item.date === date) || { date };
    const meal = model.mealByDate.get(day.date) || { date: day.date };
    return `<div data-setup-row="meals" data-date="${html(day.date)}" hidden><input name="date" value="${html(day.date)}"><input name="breakfast" value="${html(meal.breakfast || "")}"><input name="lunch" value="${html(meal.lunch || "")}"><input name="dinner" value="${html(meal.dinner || "")}"></div>`;
  }).join("");
  return `<div hidden>
    <input name="familyPlanning.fastingPreference" value="${html(model.planning.fastingPreference || "guidance")}">
    <input name="familyPlanning.weekStart" value="${html(model.planning.weekStart || model.weekDays[0]?.date || "")}">
    <input name="household.motherName" value="${html(model.planning.household?.motherName || "")}">
    <input name="household.motherNameDay" value="${html(model.planning.household?.motherNameDay || "")}">
    <input name="household.fatherName" value="${html(model.planning.household?.fatherName || "")}">
    <input name="household.fatherNameDay" value="${html(model.planning.household?.fatherNameDay || "")}">
    <input name="household.parishPatronalFeastName" value="${html(model.planning.household?.parishPatronalFeastName || "")}">
    <input name="household.parishPatronalFeastDate" value="${html(model.planning.household?.parishPatronalFeastDate || "")}">
    ${model.children.map((child) => `<span data-family-child-id="${html(child.id || "")}" data-family-child-name="${html(child.name || "")}"><input name="childNameDay" value="${html(child.nameDay || "")}"></span>`).join("")}
    <div data-setup-list="meals">${meals}</div>
    <div data-setup-list="familyEvents">${(model.planning.events || []).map(familyEventSetupRow).join("")}</div>
    <div data-setup-list="recipes">${model.recipes.map(recipeSetupRow).join("")}</div>
    <div data-setup-list="groceryItems">${model.groceries.map(grocerySetupRow).join("")}</div>
    <div data-setup-list="chores">${model.chores.map((chore, index) => choreSetupRow(chore, index, model.planning)).join("")}</div>
  </div>`;
}

function plannerMonthQuery(model) {
  const firstInMonth = (model.monthDays || []).find((day) => day.inMonth !== false && day.date)?.date || "";
  return String(model.monthKey || firstInMonth.slice(0, 7) || new Date().toISOString().slice(0, 7));
}

function renderPlannerDaySelector(model, selectedDate) {
  return `<div class="learn-family-day-selector">${model.weekDays.map((day) => `<a href="${plannerHref({ view: "day", date: day.date })}" class="${day.date === selectedDate ? "is-active" : ""}"><span>${day.isSunday ? "☩" : day.isFastDay ? "✥" : "·"}</span><strong>${html(day.weekday || day.weekdayLong || day.long)}</strong><small>${html(day.shortDate || day.short || day.date)}</small></a>`).join("")}</div>`;
}

function renderMealCard(day, meal, slot) {
  const value = meal?.[slot] || "";
  return `<button type="button" class="learn-family-meal-card" data-meal-open data-date="${html(day.date)}" data-slot="${html(slot)}"><span>${html(mealSlotLabel(slot))}</span><strong>${html(value || "No dish yet")}</strong><small>${value ? "change it" : "add a dish"} →</small></button>`;
}

function renderMealsPlan(model, displayView, vm) {
  const selectedDate = new URLSearchParams(window.location.search).get("date") || vm.day?.selected?.date || model.weekDays[0]?.date || "";
  if (displayView === "day") {
    const day = model.weekDays.find((item) => item.date === selectedDate) || model.weekDays[0] || {};
    const meal = model.mealByDate.get(day.date) || {};
    return `<div class="learn-family-prototype">${renderPlannerDaySelector(model, day.date)}<section class="learn-family-day-hero ${day.isFastDay ? "is-fast" : ""}"><div><small>${html(day.long || day.weekdayLong || "Today")}</small><h2>${html(day.weekdayLong || day.long || "Selected Day")} · ${html(day.shortDate || day.short || day.date)}</h2><p>${html(day.feast || "Household rhythm")} ${day.fasting ? `· ${html(day.fasting)}` : ""}</p></div><button type="button" data-event-open data-date="${html(day.date)}">+ Add to calendar</button></section><section class="learn-family-card-grid learn-family-card-grid-three">${["breakfast", "lunch", "dinner"].map((slot) => renderMealCard(day, meal, slot)).join("")}</section></div>`;
  }
  if (displayView === "month") {
    return `<div style="display:flex;flex-direction:column;gap:14px;">${renderFeastsPanel(model, "month")}${renderFamilyMonthOverview(model, "meals")}${renderFastingLegend()}</div>`;
  }
  return `<div class="learn-family-week-layout"><section class="learn-family-week-board"><div class="learn-family-week-scroll"><div class="learn-family-week-head"><span></span>${model.weekDays.map((day) => `<strong class="${day.isFastDay ? "is-fast" : day.isSunday ? "is-feast" : ""}">${html(day.weekday || day.weekdayLong)}<small>${html(day.shortDate || day.short)}</small><em>${html(day.isFastDay ? day.fastingType || day.fasting || "Fast" : day.feast || "")}</em></strong>`).join("")}</div>${["breakfast", "lunch", "dinner"].map((slot) => `<div class="learn-family-week-row"><strong>${html(mealSlotLabel(slot))}</strong>${model.weekDays.map((day) => `<div>${renderMealCard(day, model.mealByDate.get(day.date) || {}, slot)}</div>`).join("")}</div>`).join("")}</div></section><div style="display:grid;gap:14px;">${renderFeastsPanel(model, "week")}${renderFastingLegend()}</div></div>`;
}

function renderRecipesTool(model) {
  return `<section class="learn-family-tool-grid"><div class="learn-family-section-note"><strong>Recipe Library</strong><span>Add family recipes once, mark fasting fit, then choose them from the meal picker.</span><button type="button" data-recipe-open>+ New recipe</button></div><div class="learn-family-recipe-grid">${(model.recipes.length ? model.recipes : [{ title: "Add your first recipe", fastingType: "free", category: "Family favorite" }]).map((recipe) => `<article class="learn-family-recipe-card" data-recipe-title="${html(recipe.title || "")}" data-recipe-fasting="${html(recipe.fastingType || "")}" data-recipe-category="${html(recipe.category || "")}" data-recipe-source="${html(recipe.sourceUrl || "")}" data-recipe-ingredients="${html(recipe.ingredients || "")}" data-recipe-instructions="${html(recipe.instructions || "")}"><div><span>☰</span><small>${html(recipe.fastingType || "Any day")}</small></div><h3>${html(recipe.title || "Untitled Recipe")}</h3><p>${html(recipe.category || "Recipe")}</p><button type="button" data-recipe-open>Edit recipe</button></article>`).join("")}</div></section>`;
}

function renderGroceriesTool(model) {
  const byCategory = new Map();
  const shoppingItems = model.groceries.filter((item) => !item.pantry);
  shoppingItems.forEach((item) => {
    const category = item.category || "Other";
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category).push(item);
  });
  const pantryCount = model.groceries.filter((item) => item.pantry).length;
  return `<section class="learn-family-grocery-layout">
    <div class="learn-family-section-note"><strong>Grocery List</strong><span>Build the weekly list from the menu. Pantry staples stay out of the shopping list unless you mark them as needed.</span><button type="button" data-grocery-add>+ Add grocery</button></div>
    <div class="learn-family-grocery-summary">${[...byCategory.entries()].length ? [...byCategory.entries()].map(([category, items]) => `<div class="learn-family-aisle"><strong>${html(category)}</strong>${items.map((item) => `<label class="${item.checked ? "is-checked" : ""}"><input type="checkbox" ${item.checked ? "checked" : ""}> ${html(item.quantity ? `${item.quantity} ` : "")}${html(item.name)}</label>`).join("")}</div>`).join("") : emptyState("No grocery items yet. Add items from recipes or the grocery button.")}</div>
    <aside class="learn-family-shopping-card"><small>Shopping rhythm</small><h3>Weekly list</h3><p>${html(String(shoppingItems.length))} item${shoppingItems.length === 1 ? "" : "s"} to shop · ${html(String(pantryCount))} pantry staple${pantryCount === 1 ? "" : "s"} saved.</p><a href="${plannerHref({ scope: "meals", tool: "pantry", view: "week", term: null, termId: null })}">Review pantry →</a></aside>
  </section>`;
}

function renderPantryTool(model) {
  const pantryItems = model.groceries.filter((item) => item.inPantry || item.pantry || item.have);
  return `<section class="learn-family-pantry-layout">
    <div class="learn-family-section-note"><strong>Pantry</strong><span>Your pantry tells the grocery list what you already have. Staples here are kept apart from the shopping list so you shop only for what is missing.</span><button type="button" data-grocery-add data-pantry-add>+ Add staple</button></div>
    <div class="learn-family-pantry-cloud">${pantryItems.length ? pantryItems.map((item) => `<span>${html(item.name || item.title || item.item)}<button type="button" data-grocery-remove="${html(item.id || "")}" aria-label="Remove ${html(item.name || item.title || "item")}">×</button></span>`).join("") : `<p class="learn-family-empty-line">No pantry staples yet. Add staples like rice, flour, olive oil, beans, or leftovers.</p>`}</div>
    <aside><small>Why it matters</small><p>Pantry staples and leftovers should shape the week instead of hiding in your cabinets. This keeps meal planning practical, fast-aware, and less wasteful.</p></aside>
  </section>`;
}

function renderFamilyMonthOverview(model, scope = "meals") {
  const cells = model.monthDays.length ? model.monthDays : model.weekDays;
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const monthlyChoresForDay = (day) => (model.chores || []).filter((chore) => {
    if (!["monthly", "quarterly", "yearly"].includes(choreCadence(chore))) return false;
    return choreDueOnDay(chore, day);
  });
  const monthlyChoresByAssignee = (day) => {
    const groups = new Map();
    monthlyChoresForDay(day).forEach((chore) => {
      const key = chore.assignee || "Everyone";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(chore);
    });
    return [...groups.entries()];
  };
  const headerAction = scope === "meals"
    ? `<a href="${plannerHref({ scope: "meals", tool: "groceries", view: "month", month: plannerMonthQuery(model), term: null, termId: null })}">Grocery list →</a>`
    : scope === "chores"
      ? `<a href="${plannerHref({ scope: "chores", view: "week", month: plannerMonthQuery(model), term: null, termId: null })}">Week view →</a>`
      : `<span></span>`;
  return `<section class="learn-family-month-card">
    <header><div><small>${html(scope === "meals" ? "Meal calendar" : scope === "events" ? "Family calendar" : "Scheduled chores")}</small><h3>${html(model.monthLabel)}</h3></div>${headerAction}</header>
    <div class="learn-family-month-weekdays">${weekdays.map((day) => `<span>${html(day)}</span>`).join("")}</div>
    <div class="learn-family-month-board is-full-month">${cells.map((day) => {
    const meal = day.meal || model.mealByDate.get(day.date) || {};
    const events = model.eventsByDate.get(day.date) || [];
    const monthlyChores = monthlyChoresByAssignee(day);
    const feastLabel = day.feast || day.feastTitle || "";
    const fastingLabel = day.fastingType || day.fasting || day.fastingRule || "";
    const scopeText = scope === "meals"
      ? meal.dinner || meal.lunch || meal.breakfast || ""
      : scope === "chores"
        ? monthlyChores.length ? `${monthlyChores.reduce((sum, [, chores]) => sum + chores.length, 0)} scheduled chore${monthlyChores.reduce((sum, [, chores]) => sum + chores.length, 0) === 1 ? "" : "s"}` : ""
        : events[0]?.title || "";
    const addButton = scope === "meals"
      ? `<button type="button" data-meal-open data-date="${html(day.date)}" data-slot="dinner">${html(scopeText ? "Edit dinner" : "+ Dinner")}</button>`
      : scope === "events"
        ? `<button type="button" data-event-open data-date="${html(day.date)}">${html(scopeText ? "Edit" : "+ Event")}</button>`
        : `<button type="button" data-chore-open data-cadence="monthly" data-day-of-month="${html(day.dayNumber || "")}" data-assigned-date="${html(day.date || "")}" data-assignee="Everyone">+ Monthly chore</button>`;
    return `<article class="${day.inMonth === false ? "is-muted" : ""} ${day.isFastDay ? "is-fast" : ""} ${day.isSunday ? "is-feast" : ""}">
      <div><strong>${html(day.weekday || day.weekdayLong || "")}</strong><span>${html(day.dayNumber || day.shortDate || day.short)}</span></div>
      <small>${html([fastingLabel, feastLabel].filter(Boolean).join(" · ") || "Household day")}</small>
      ${scope === "meals"
        ? `<p>${html(scopeText || (day.isFastDay ? "Fast-aware meal plan" : day.isSunday || feastLabel ? "Feast-day meal plan" : "Plan dinner"))}</p>${["breakfast", "lunch", "dinner"].filter((slot) => meal[slot]).map((slot) => `<em>${html(mealSlotLabel(slot))}: ${html(meal[slot])}</em>`).join("")}`
        : scope === "chores"
          ? (monthlyChores.length ? `<div class="learn-family-month-chore-list">${monthlyChores.map(([assignee, chores]) => `<span><strong>${html(assignee)}</strong><small>${html(chores.map((chore) => `${chore.title || "Chore"} (${choreTimeLabel(chore.timeOfDay)})`).join(", "))}</small></span>`).join("")}</div>` : `<p>${html(day.inMonth === false ? "" : "No monthly chores")}</p>`)
          : `<p>${html(scopeText || "Plan")}</p>`}
      ${events.slice(0, 2).map((event) => `<em>${html(event.startTime || "")} ${html(event.title)}</em>`).join("")}
      ${addButton}
    </article>`;
  }).join("")}</div>
  </section>`;
}

function monthDiffBetween(startParts, targetParts) {
  return (targetParts.year - startParts.year) * 12 + (targetParts.month - startParts.month);
}

function choreAssignedParts(chore = {}) {
  return isoDateParts(chore.assignedDate || chore.startDate || chore.date || "");
}

function choreDueOnDay(chore = {}, day = {}) {
  const date = day.date || "";
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T12:00:00`) : null;
  const cadence = choreCadence(chore);
  const weekday = day.weekdayLong || day.long || plannerDayLabel(date).long;
  if (cadence === "daily") return true;
  if (cadence === "weekly") return !chore.day || chore.day === weekday;
  if (!parsed) return false;
  const assigned = choreAssignedParts(chore);
  const target = isoDateParts(date);
  if (assigned && target) {
    const monthDiff = monthDiffBetween(assigned, target);
    const dueDay = Number(chore.dayOfMonth || assigned.day);
    if (monthDiff < 0 || (monthDiff === 0 && target.day < assigned.day)) return false;
    if (target.day !== dueDay) return false;
    if (cadence === "monthly") return true;
    if (cadence === "quarterly") return monthDiff % 3 === 0;
    if (cadence === "yearly") return monthDiff % 12 === 0;
  }
  const choreDay = Number(chore.dayOfMonth || 0);
  if (cadence === "monthly") return !choreDay || choreDay === parsed.getDate();
  if (cadence === "quarterly") {
    const quarterSlot = String((parsed.getMonth() % 3) + 1);
    return (!chore.quarterMonth || String(chore.quarterMonth) === quarterSlot) && (!choreDay || choreDay === parsed.getDate());
  }
  if (cadence === "yearly") return false;
  return false;
}

function choreScheduleLabel(chore = {}) {
  const cadence = choreCadence(chore);
  const time = choreTimeLabel(chore.timeOfDay);
  const schedule = cadence === "daily"
    ? "Daily"
    : cadence === "weekly"
      ? (chore.day ? `Weekly · ${chore.day}` : "Weekly")
      : cadence === "monthly"
        ? (chore.dayOfMonth ? `Monthly · day ${chore.dayOfMonth}` : "Monthly")
        : cadence === "quarterly"
          ? `Quarterly${chore.assignedDate ? ` · from ${chore.assignedDate}` : chore.quarterMonth ? ` · month ${chore.quarterMonth}` : ""}${chore.dayOfMonth ? ` · day ${chore.dayOfMonth}` : ""}`
          : `Yearly${chore.assignedDate ? ` · ${chore.assignedDate.slice(5)}` : ""}${chore.dayOfMonth ? ` · day ${chore.dayOfMonth}` : ""}`;
  return `${schedule} · ${time}`;
}

function choreOpenAttributes(chore = null, personName = "", day = {}) {
  const dayLabel = day.weekdayLong || day.long || "";
  const attrs = [
    `data-chore-open`,
    `data-assignee="${html(personName)}"`,
    `data-day="${html(dayLabel)}"`,
    `data-assigned-date="${html(day.date || "")}"`
  ];
  if (chore) {
    attrs.push(
      `data-chore-existing="1"`,
      `data-chore-id="${html(chore.id || "")}"`,
      `data-chore-title="${html(chore.title || "")}"`,
      `data-chore-assignee="${html(chore.assignee || "Everyone")}"`,
      `data-chore-cadence="${html(choreCadence(chore))}"`,
      `data-chore-day="${html(chore.day || dayLabel)}"`,
      `data-chore-day-of-month="${html(chore.dayOfMonth || "")}"`,
      `data-chore-quarter-month="${html(chore.quarterMonth || "1")}"`,
      `data-chore-assigned-date="${html(chore.assignedDate || "")}"`,
      `data-chore-time-of-day="${html(chore.timeOfDay || "Anytime")}"`,
      `data-chore-notes="${html(chore.notes || "")}"`
    );
  }
  return attrs.join(" ");
}

function renderChoresScope(model, displayView) {
  const people = [{ name: "Everyone", color: "var(--navy)", initial: "✥" }, ...model.children.filter((child) => child.name)];
  const choresForPersonDay = (person, day) => model.chores.filter((item) => (item.assignee || "Everyone") === person.name && choreDueOnDay(item, day));
  const renderChoreButton = (chore, person, day) => `<button type="button" class="learn-family-mini-card" ${choreOpenAttributes(chore, person.name, day)}><strong>${html(chore.title || "Chore")}</strong><small>${html(choreScheduleLabel(chore))}</small></button>`;
  const addChoreButton = (person, day, compact = false) => `<button type="button" class="${compact ? "learn-family-mini-card learn-family-add-chore-card" : "learn-family-add-chore-card"}" ${choreOpenAttributes(null, person.name, day)}><strong>+ Add chore</strong><small>${html(day.weekday || day.weekdayLong || day.long || "Day")}</small></button>`;
  if (displayView === "month") {
    return `<div style="display:flex;flex-direction:column;gap:14px;">${renderFamilyMonthOverview(model, "chores")}${renderFastingLegend()}</div>`;
  }
  if (displayView === "day") {
    const selectedDate = new URLSearchParams(window.location.search).get("date") || model.weekDays[0]?.date || "";
    const day = model.weekDays.find((item) => item.date === selectedDate) || model.weekDays[0] || {};
    return `<div class="learn-family-prototype">${renderPlannerDaySelector(model, day.date)}<section class="learn-family-card-grid">${people.map((person) => { const chores = choresForPersonDay(person, day); return `<article class="learn-family-person-card" style="--person-color:${html(person.color)};"><span>${html(person.initial || person.name.slice(0, 1) || "•")}</span><strong>${html(person.name)}</strong>${chores.length ? `<div class="learn-family-chore-stack">${chores.map((chore) => renderChoreButton(chore, person, day)).join("")}</div>` : `<p>${html(day.isSunday ? "Rest" : "Choose a chore")}</p>`}<button type="button" ${choreOpenAttributes(null, person.name, day)}>Add chore</button></article>`; }).join("")}</section></div>`;
  }
  return `<section class="learn-family-week-board"><div class="learn-family-week-scroll"><div class="learn-family-week-head"><span></span>${model.weekDays.map((day) => `<strong>${html(day.weekday || day.weekdayLong)}<small>${html(day.shortDate || day.short)}</small></strong>`).join("")}</div>${people.map((person) => `<div class="learn-family-week-row learn-family-chore-row" style="--person-color:${html(person.color)};"><strong><span>${html(person.initial || person.name.slice(0, 1) || "•")}</span>${html(person.name)}</strong>${model.weekDays.map((day) => { const chores = choresForPersonDay(person, day); return `<div><div class="learn-family-chore-stack">${chores.map((chore) => renderChoreButton(chore, person, day)).join("")}${addChoreButton(person, day, true)}</div></div>`; }).join("")}</div>`).join("")}</div></section>`;
}

function renderEventsScope(model, displayView) {
  const selectedDate = new URLSearchParams(window.location.search).get("date") || model.weekDays[0]?.date || "";
  const days = displayView === "day" ? model.weekDays.filter((day) => day.date === selectedDate) : model.weekDays;
  if (displayView === "month") return `<div style="display:flex;flex-direction:column;gap:14px;">${renderFeastsPanel(model, "month")}${renderFamilyMonthOverview(model, "events")}</div>`;
  return `<div class="learn-family-prototype">${displayView === "day" ? renderPlannerDaySelector(model, selectedDate) : ""}<div class="learn-family-events-list">${days.map((day) => { const events = model.eventsByDate.get(day.date) || []; return `<section class="learn-family-date-section"><header><span><small>${html(day.weekday || day.weekdayLong)}</small><strong>${html(day.shortDate || day.short || day.date)}</strong><em>${html(day.feast || "")}</em></span><button type="button" data-event-open data-date="${html(day.date)}">+ Add event</button></header>${events.length ? events.map((event) => `<button type="button" class="learn-family-event-row" data-event-open data-event-id="${html(event.id || "")}" data-date="${html(event.date || day.date)}" data-title="${html(event.title || "")}" data-time="${html(event.startTime || "")}" data-location="${html(event.location || "")}" data-notes="${html(event.notes || "")}" data-type="${html(event.eventType || "")}" data-recurrence="${html(event.recurrence || "none")}"><span>${html(event.startTime || "—")}</span><strong>${html(event.title)}</strong><small>${html([event.location || event.eventType || "Family event", eventRecurrence(event.recurrence) !== "none" ? eventRecurrenceLabel(event.recurrence) : ""].filter(Boolean).join(" · "))}</small></button>`).join("") : `<p class="learn-family-empty-line">No events planned.</p>`}</section>`; }).join("")}</div></div>`;
}

function renderFamilyPlannerModals(model) {
  return `<div class="learn-family-modal" data-family-modal="meal" hidden><div class="learn-family-modal-card"><button type="button" class="learn-family-modal-close" data-family-modal-close aria-label="Close">×</button><small>Meal Picker</small><h2>Choose a dish</h2><p data-meal-modal-context>Pick a recipe or type a dish name.</p><input data-meal-custom-input placeholder="Type a dish name..."><div class="learn-family-picker-list">${model.recipes.length ? model.recipes.map((recipe) => `<button type="button" data-meal-pick="${html(recipe.title)}"><strong>${html(recipe.title)}</strong><span>${html(recipe.fastingType || "Any day")} · ${html(recipe.category || "Recipe")}</span></button>`).join("") : `<span class="learn-family-empty-line">No recipes yet. You can still type a dish above.</span>`}</div><div class="learn-family-modal-actions"><button type="button" data-meal-clear>Clear meal</button><button type="button" data-meal-save>Save meal</button></div></div></div>
  <div class="learn-family-modal" data-family-modal="recipe" hidden><div class="learn-family-modal-card"><button type="button" class="learn-family-modal-close" data-family-modal-close aria-label="Close">×</button><small>Recipe</small><h2>Save a family recipe</h2><div class="learn-family-modal-grid">${setupInput("Recipe name", "modalRecipe.title")}${setupSelect("Fasting fit", "modalRecipe.fastingType", "", ["free", "fish", "oilwine", "strict"])}${setupInput("Category", "modalRecipe.category")}${setupInput("Source URL", "modalRecipe.sourceUrl")}<label>Ingredients<textarea name="modalRecipe.ingredients" rows="4"></textarea></label><label>Instructions<textarea name="modalRecipe.instructions" rows="4"></textarea></label></div><div class="learn-family-modal-actions"><button type="button" data-family-modal-close>Cancel</button><button type="button" data-recipe-save>Save recipe</button></div></div></div>
  <div class="learn-family-modal" data-family-modal="event" hidden><div class="learn-family-modal-card"><button type="button" class="learn-family-modal-close" data-family-modal-close aria-label="Close">×</button><small>Calendar</small><h2>Add to calendar</h2><div class="learn-family-modal-grid">${setupInput("Title", "modalEvent.title")}${setupSelect("Type", "modalEvent.eventType", "", ["Appointment", "Field Trip", "Extracurricular", "Name Day", "Family"])}${setupInput("Date", "modalEvent.date", "", { type: "date" })}${setupInput("Time", "modalEvent.startTime", "", { type: "time" })}${setupSelect("Repeats", "modalEvent.recurrence", "none", eventRecurrenceOptions)}${setupInput("Location", "modalEvent.location")}<label>Notes<textarea name="modalEvent.notes" rows="3"></textarea></label></div><div class="learn-family-modal-actions"><button type="button" data-family-modal-close>Cancel</button><button type="button" data-event-save>Save event</button></div></div></div>
  <div class="learn-family-modal" data-family-modal="chore" hidden><div class="learn-family-modal-card"><button type="button" class="learn-family-modal-close" data-family-modal-close aria-label="Close">×</button><small>Chore Rhythm</small><h2 data-chore-modal-title>Add chore</h2><div class="learn-family-modal-grid">${setupInput("Chore", "modalChore.title")}${setupSelect("Assigned to", "modalChore.assignee", "Everyone", choreAssigneeOptions(model.planning))}${setupSelect("Type", "modalChore.cadence", "weekly", [{ value: "daily", label: "Daily" }, { value: "weekly", label: "Weekly" }, { value: "monthly", label: "Monthly" }, { value: "quarterly", label: "Quarterly" }, { value: "yearly", label: "Yearly" }])}${setupSelect("Weekly day", "modalChore.day", "", ["", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"])}${setupSelect("Monthly day", "modalChore.dayOfMonth", "", dayOfMonthOptions())}${setupSelect("Quarter month", "modalChore.quarterMonth", "1", [{ value: "1", label: "1st month" }, { value: "2", label: "2nd month" }, { value: "3", label: "3rd month" }])}${setupInput("Starts on", "modalChore.assignedDate", "", { type: "date" })}${choreTimeCheckboxes("modalChore.timeOfDay")}<label style="display:grid;gap:5px;color:var(--gold);font-size:12px;letter-spacing:.12em;text-transform:uppercase;">Notes<input name="modalChore.notes" type="text" value="" style="min-width:0;border:1px solid var(--line);border-radius:9px;padding:10px;background:var(--paper2);font-family:inherit;color:var(--ink);" /></label></div><div class="learn-chore-batch-list" data-chore-batch-list hidden></div><div class="learn-family-modal-actions"><button type="button" data-chore-delete hidden>Delete chore</button><button type="button" data-family-modal-close>Cancel</button><button type="button" data-chore-save-add>Save & add another</button><button type="button" data-chore-save>Save chore</button></div></div></div>`;
}

function dayKeyForChore(chore = {}, vm = {}) {
  const dayLabel = String(chore.day || "").toLowerCase();
  return Object.entries(prototypeWeekDateMap(vm)).find(([, date]) => {
    const label = plannerDayLabel(date).long.toLowerCase();
    return label === dayLabel;
  })?.[0] || "";
}

function renderFamilyPlannerScope(vm, scope, displayView = "week", mealTool = "plan") {
  const model = familyPlannerModel(vm);
  const hidden = plannerHiddenData(model);
  const saveBar = `<div class="learn-family-planner-save"><span data-family-planning-status>Changes save to the household Family Planner.</span><button type="submit">Save Family Planner</button></div>`;
  const content = scope === "meals"
    ? mealTool === "recipes"
      ? renderRecipesTool(model)
      : mealTool === "groceries"
        ? renderGroceriesTool(model)
        : mealTool === "pantry"
          ? renderPantryTool(model)
          : renderMealsPlan(model, displayView, vm)
    : scope === "chores"
      ? renderChoresScope(model, displayView)
      : renderEventsScope(model, displayView);
  return `<form data-family-planning-form id="family-planner" class="learn-family-planner-panel">${hidden}<div data-family-planner-live>${content}</div>${saveBar}${renderFamilyPlannerModals(model)}</form>`;
}

const PROTOTYPE_RECIPE_TITLES = {
  b1: "Lenten Oatmeal, Apple & Cinnamon",
  b2: "Avocado & Tomato Toast",
  b3: "Tahini, Banana & Honey Toast",
  b4: "Smoked Salmon on Rye",
  b5: "Yogurt, Honey & Walnuts",
  l1: "Lentil Soup (Fakes)",
  l2: "Hummus & Veggie Pita",
  l3: "Roasted Vegetable Orzo",
  l4: "Sardines & Greens on Toast",
  l5: "Greek Salad with Feta",
  d1: "Gigantes — Greek Baked Beans",
  d2: "Stuffed Peppers, Rice & Herbs",
  d3: "Mushroom Stew over Polenta",
  d4: "Baked Cod, Lemon & Potatoes",
  d5: "Pan-Seared Trout, Rice Pilaf",
  d6: "Roast Chicken & Lemon Potatoes",
  d7: "Spanakopita",
  d8: "Chickpea & Vegetable Stew",
  d9: "Herb-Roasted Salmon & Greens",
  s1: "Olive & Herb Bread",
  s2: "Semolina Halva",
  s3: "Chocolate Olive-Oil Cake",
  s4: "Walnut Baklava"
};

function prototypeWeekDateMap(vm) {
  const model = familyPlannerModel(vm);
  const days = model.weekDays.length ? model.weekDays : plannerDates(vm).map((date) => ({ date }));
  return Object.fromEntries(days.slice(0, 7).map((day, index) => [`d${index}`, day.date]));
}

function prototypeRecipeType(slot = "dinner") {
  if (slot === "breakfast") return "breakfast";
  if (slot === "lunch") return "lunch";
  return "dinner";
}

function recipeTitleFromPrototypeId(id, state = {}) {
  return state.userRecipes?.[id]?.name || PROTOTYPE_RECIPE_TITLES[id] || id || "";
}

function prototypeDaySeeds(vm) {
  const model = familyPlannerModel(vm);
  const days = model.weekDays.length ? model.weekDays : plannerDates(vm).map((date) => ({ date, ...plannerDayLabel(date) }));
  return days.slice(0, 7).map((day, index) => ({
    key: `d${index}`,
    fullDate: day.date || "",
    weekday: day.weekday || day.weekdayShort || ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][index] || "",
    long: day.weekdayLong || day.long || day.weekday || "",
    short: day.shortDate || day.short || day.date || "",
    date: Number(day.dayNumber || String(day.date || "").slice(-2)) || index + 1,
    level: isImportantPlannerFeast(day) ? "fish" : day.isSunday ? "fish" : day.isFastDay ? (String(day.fastingType || day.fasting || "").toLowerCase().includes("strict") ? "strict" : "oilwine") : "rich",
    feast: isImportantPlannerFeast(day) ? day.feast || day.feastTitle || "" : "",
    tag: day.fastingType || day.fasting || (isImportantPlannerFeast(day) ? day.feast || day.feastTitle || "Feast day" : "No fast"),
    sunday: Boolean(day.isSunday),
    isToday: Boolean(day.isToday),
    feastDay: isImportantPlannerFeast(day),
    school: index === 0 ? "Church & rest" : "Plan the day"
  }));
}

function isImportantPlannerFeast(day = {}) {
  const feast = String(day.feast || day.feastTitle || "").trim();
  if (!feast || /^fast day$/i.test(feast)) return false;
  const rank = String(day.feastRank || "").trim();
  const text = `${feast} ${rank}`.toLowerCase();
  const realRank = rank && !/daily rhythm/i.test(rank);
  return Boolean(realRank) || /patronal feast|nativity|forerunner|theotokos|apostle|apostles|great feast|major|vigil|polyeleos|doxology|ascension|pentecost|transfiguration|annunciation|presentation|exaltation|pascha/.test(text);
}

function prototypeMonthSeed(vm) {
  const model = familyPlannerModel(vm);
  const weekDateToKey = Object.fromEntries(prototypeDaySeeds(vm).map((day) => [day.fullDate, day.key]));
  const monthDays = (model.monthDays || []).map((day) => {
    const feast = day.feast || day.feastTitle || "";
    const fasting = day.fastingType || day.fasting || "";
    const importantFeast = isImportantPlannerFeast(day);
    const key = weekDateToKey[day.date] || (day.date ? `m_${String(day.date).replaceAll("-", "")}` : "");
    return {
      key,
      fullDate: day.date || "",
      dayNumber: day.dayNumber || String(day.date || "").slice(-2).replace(/^0/, ""),
      weekday: day.weekday || day.weekdayLong || "",
      long: day.weekdayLong || day.long || day.weekday || "",
      short: day.shortDate || day.short || day.date || "",
      date: Number(day.dayNumber || String(day.date || "").slice(-2)) || 0,
      level: importantFeast ? "fish" : day.isSunday ? "fish" : day.isFastDay ? (String(fasting).toLowerCase().includes("strict") ? "strict" : "oilwine") : "rich",
      tag: fasting || (importantFeast ? feast || "Feast day" : "No fast"),
      sunday: Boolean(day.isSunday),
      feastDay: importantFeast,
      inMonth: day.inMonth !== false,
      isToday: Boolean(day.isToday),
      isSunday: Boolean(day.isSunday),
      isFastDay: Boolean(day.isFastDay),
      isImportantFeast: importantFeast,
      feast,
      feastRank: day.feastRank || "",
      fasting,
      fastingType: day.fastingType || "",
      meal: day.meal || null
    };
  });
  const monthFeasts = monthDays
    .filter((day) => day.inMonth !== false && day.isImportantFeast)
    .slice(0, 8)
    .map((day, index) => ({
      id: `month_${day.fullDate || index}`,
      day: day.dayNumber || "",
      dateLabel: day.dayNumber ? String(day.dayNumber) : day.fullDate || "",
      name: day.feast || "Fast day",
      rank: day.isFastDay
        ? [day.feastRank || "Feast", day.fasting || day.fastingType || ""].filter(Boolean).join(" · ")
        : day.feastRank || "Feast",
      plan: index === 0
    }));
  let weekFeasts = monthDays
    .filter((day) => weekDateToKey[day.fullDate] && day.isImportantFeast)
    .map((day, index) => ({
      id: `week_${day.fullDate || index}`,
      day: day.dayNumber || "",
      dateLabel: day.short || day.dayNumber || day.fullDate || "",
      name: day.feast || "Feast",
      rank: day.isFastDay
        ? [day.feastRank || "Feast", day.fasting || day.fastingType || ""].filter(Boolean).join(" · ")
        : day.feastRank || "Feast",
      fullDate: day.fullDate || "",
      plan: index === 0
    }));
  const calendarType = String(vm.preferences?.calendarType || (typeof localStorage !== "undefined" ? localStorage.getItem("agapay.learn.calendar") : "") || "");
  const revisedLike = /revised|gregorian/i.test(calendarType);
  const june24 = monthDays.find((day) => day.inMonth !== false && String(day.fullDate || "").slice(5) === "06-24");
  if (revisedLike && june24 && !monthFeasts.some((feast) => feast.id === `month_${june24.fullDate}`)) {
    june24.feast = june24.feast || "Nativity of St. John the Forerunner";
    june24.feastDay = true;
    june24.isImportantFeast = true;
    june24.level = "fish";
    monthFeasts.push({
      id: `month_${june24.fullDate}`,
      day: june24.dayNumber || "24",
      dateLabel: june24.dayNumber || "24",
      name: june24.feast,
      rank: [june24.fasting || june24.fastingType || "", "Feast"].filter(Boolean).join(" · "),
      plan: monthFeasts.length === 0
    });
  }
  if (revisedLike && june24 && weekDateToKey[june24.fullDate] && !weekFeasts.some((feast) => feast.fullDate === june24.fullDate)) {
    weekFeasts = weekFeasts.concat({
      id: `week_${june24.fullDate}_forerunner`,
      day: june24.dayNumber || "24",
      dateLabel: june24.short || june24.dayNumber || "Jun 24",
      name: "Nativity of St. John the Forerunner",
      rank: [june24.fasting || june24.fastingType || "", "Feast"].filter(Boolean).join(" · "),
      fullDate: june24.fullDate || "",
      plan: weekFeasts.length === 0
    });
  }
  weekFeasts.sort((a, b) => String(a.fullDate || "").localeCompare(String(b.fullDate || "")));
  const weekDays = model.weekDays || [];
  const weekStart = weekDays[0]?.shortDate || weekDays[0]?.short || weekDays[0]?.date || "";
  const weekEnd = weekDays[weekDays.length - 1]?.shortDate || weekDays[weekDays.length - 1]?.short || weekDays[weekDays.length - 1]?.date || "";
  const fastNames = [...new Set(monthDays.filter((day) => day.inMonth !== false && day.isFastDay).map((day) => day.fasting || day.fastingType || "Fast day").filter(Boolean))];
  return {
    key: vm.month?.key || model.monthKey || new Date().toISOString().slice(0, 7),
    label: model.monthLabel || vm.month?.label || "Month Calendar",
    weekdays: vm.month?.weekdays || ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    days: monthDays,
    feasts: monthFeasts,
    weekFeasts,
    weekRange: weekStart && weekEnd ? `${weekStart} - ${weekEnd}` : "This week",
    fastingSummary: fastNames.length ? fastNames.slice(0, 2).join(" + ") : "Church calendar"
  };
}

function prototypeSetupSeed(vm) {
  const grouping = (vm.familyPlanning?.children || []).some((child) => child.formLabel) ? "Forms" : "Grades";
  const formMap = new Map();
  (vm.familyPlanning?.children || []).forEach((child, index) => {
    const label = child.formLabel || child.gradeLabel || child.form || child.grade || "Household";
    if (!formMap.has(label)) {
      formMap.set(label, {
        id: `form_${formMap.size + 1}`,
        label,
        color: child.color || ACCENTS[index % ACCENTS.length],
        children: [],
        subjects: []
      });
    }
    formMap.get(label).children.push(child.name || child.firstName || `Child ${index + 1}`);
  });
  (vm.week?.formRows || []).forEach((row) => {
    const label = row.formLabel || row.label || "Household";
    if (!formMap.has(label)) formMap.set(label, { id: `form_${formMap.size + 1}`, label, color: row.color || ACCENTS[formMap.size % ACCENTS.length], children: [], subjects: [] });
    const target = formMap.get(label);
    (row.blocks || []).forEach((block) => {
      const title = block.title || row.title;
      if (title && !target.subjects.includes(title)) target.subjects.push(title);
    });
  });
  (vm.term?.pacingRows || []).forEach((row) => {
    const label = row.formLabel || row.label || "";
    const targets = label && formMap.has(label) ? [formMap.get(label)] : [...formMap.values()];
    targets.forEach((target) => {
      const title = row.subjectTitle || row.title || row.label;
      if (title && !target.subjects.includes(title)) target.subjects.push(title);
    });
  });
  const forms = [...formMap.values()].map((form) => ({
    ...form,
    subjects: form.subjects.length ? form.subjects : ["Math", "Language Arts", "History", "Science", "Literature"]
  }));
  return {
    calendar: storedLearnCalendar(vm.preferences?.calendarType || ""),
    grouping,
    enrichment: (vm.week?.householdRows || []).map((row) => row.title).filter(Boolean),
    forms: forms.length ? forms : [{ id: "household", label: "Household", color: "#b5942f", children: [], subjects: ["Math", "Language Arts", "History", "Science", "Literature"] }]
  };
}

function prototypeKidsSeed(vm) {
  const chores = vm.familyPlanning?.chores || [];
  return (vm.familyPlanning?.children || []).map((child, index) => {
    const name = child.name || child.firstName || `Child ${index + 1}`;
    const childChores = chores.filter((chore) => !chore.assignee || chore.assignee === name).map((chore) => chore.title).filter(Boolean);
    return {
      name,
      color: child.color || ACCENTS[index % ACCENTS.length],
      chores: childChores.length ? childChores : ["", "", "", "", ""]
    };
  });
}

function backendRecipeToPrototype(recipe, index = 0) {
  const id = recipe.id || `agp_recipe_${index + 1}`;
  const types = [prototypeRecipeType(String(recipe.category || "").toLowerCase().includes("breakfast") ? "breakfast" : String(recipe.category || "").toLowerCase().includes("lunch") ? "lunch" : "dinner")];
  return {
    id,
    recipe: {
      name: recipe.title || `Recipe ${index + 1}`,
      types,
      level: recipe.fastingType === "strict" ? "strict" : recipe.fastingType === "fish" ? "fish" : recipe.fastingType === "regular" ? "rich" : "oilwine",
      time: "30 min",
      servings: 4,
      glyph: "🍲",
      ingredients: String(recipe.ingredients || "").split(",").map((item) => item.trim()).filter(Boolean),
      note: recipe.instructions || recipe.category || "Saved from AGAPAY Learn.",
      custom: true
    }
  };
}

function seedFamilyPrototypeState(vm) {
  const existing = JSON.parse(localStorage.getItem("agapay.planner.v2") || "{}");
  const planning = vm.familyPlanning || {};
  const dateToKey = Object.fromEntries(Object.entries(prototypeWeekDateMap(vm)).map(([key, date]) => [date, key]));
  const userRecipes = {};
  const recipeIdsByTitle = new Map(Object.entries(PROTOTYPE_RECIPE_TITLES).map(([id, title]) => [title.toLowerCase(), id]));
  (planning.recipes || []).forEach((recipe, index) => {
    const converted = backendRecipeToPrototype(recipe, index);
    userRecipes[converted.id] = converted.recipe;
    recipeIdsByTitle.set(converted.recipe.name.toLowerCase(), converted.id);
  });
  const plan = {};
  (planning.meals || []).forEach((meal) => {
    const dayKey = dateToKey[meal.date];
    if (!dayKey) return;
    ["breakfast", "lunch", "dinner"].forEach((slot) => {
      const title = meal[slot];
      if (!title) return;
      let recipeId = recipeIdsByTitle.get(String(title).toLowerCase());
      if (!recipeId) {
        recipeId = `agp_${dayKey}_${slot}`;
        userRecipes[recipeId] = {
          name: title,
          types: [slot],
          level: "oilwine",
          time: "30 min",
          servings: 4,
          glyph: "🍲",
          ingredients: [],
          note: "Saved from AGAPAY Learn.",
          custom: true
        };
        recipeIdsByTitle.set(String(title).toLowerCase(), recipeId);
      }
      plan[`${dayKey}-${slot}`] = recipeId;
    });
  });
  const events = (planning.events || []).map((event, index) => ({
    id: event.id || `agp_event_${index + 1}`,
    type: event.eventType || "Appointment",
    title: event.title || "Family event",
    dayKey: dateToKey[event.date] || "d3",
    time: event.startTime || "",
    who: event.location || "Family",
    note: event.notes || ""
  }));
  const pantry = (planning.groceryItems || []).filter((item) => item.pantry || item.inPantry).map((item) => item.name).filter(Boolean);
  const manualGroceries = (planning.groceryItems || []).filter((item) => !(item.pantry || item.inPantry)).map((item, index) => ({
    id: item.id || `agp_grocery_${index + 1}`,
    aisle: item.category || "Pantry",
    label: item.quantity ? `${item.quantity} ${item.name}` : item.name
  })).filter((item) => item.label);
  const dayKeyByLabel = Object.fromEntries(prototypeDaySeeds(vm).map((day) => [String(day.long || day.weekday || "").toLowerCase(), day.key]));
  const chores = {};
  const choreDetails = {};
  (planning.chores || []).forEach((chore) => {
    const assignee = chore.assignee || "Everyone";
    const dayKey = dayKeyByLabel[String(chore.day || "").toLowerCase()] || "";
    if (dayKey && chore.title) {
      const key = `${assignee}::${dayKey}`;
      chores[key] = chore.title;
      choreDetails[key] = {
        id: chore.id || "",
        title: chore.title || "",
        assignee,
        cadence: chore.cadence || "weekly",
        day: chore.day || "",
        dayOfMonth: chore.dayOfMonth || "",
        quarterMonth: chore.quarterMonth || "",
        timeOfDay: chore.timeOfDay || "Anytime",
        notes: chore.notes || "",
        completed: Boolean(chore.completed)
      };
    }
  });
  const seed = {
    email: learnAccountEmail(),
    ui: {
      view: new URLSearchParams(window.location.search).get("view") || "week",
      scope: new URLSearchParams(window.location.search).get("scope") || "lessons",
      tab: new URLSearchParams(window.location.search).get("tool") || "plan"
    },
    days: prototypeDaySeeds(vm),
    month: prototypeMonthSeed(vm),
    setup: prototypeSetupSeed(vm),
    kids: prototypeKidsSeed(vm),
    pantry,
    chores,
    feast: {
      dateLong: (vm.week?.days || []).find((day) => day.feast)?.shortDate || "",
      name: (vm.week?.days || []).find((day) => day.feast)?.feast || "Upcoming Feast",
      tasks: []
    }
  };
  localStorage.setItem("agapay.planner.seed.v1", JSON.stringify(seed));
  if (existing?.__agapayBackendSynced) return;
  localStorage.setItem("agapay.planner.v2", JSON.stringify({
    __agapayBackendSynced: true,
    plan,
    pantry,
    userRecipes,
    manualGroceries,
    events,
    chores,
    choreDetails,
    groceryChecked: {},
    feastPlan: {},
    google: { open: false, connected: false, email: learnAccountEmail(), last: "", layers: { lessons: true, terms: true, feasts: true, events: true, chores: false } }
  }));
}

function prototypeStateToFamilyPlanningPayload(vm, state) {
  const keyToDate = prototypeWeekDateMap(vm);
  try {
    const seed = JSON.parse(localStorage.getItem("agapay.planner.seed.v1") || "{}");
    (seed.month?.days || []).forEach((day) => {
      if (day.key && day.fullDate) keyToDate[day.key] = day.fullDate;
    });
  } catch {
    // Keep the week map if the local seed cannot be read.
  }
  const recipes = Object.entries(state.userRecipes || {}).map(([id, recipe]) => ({
    id,
    title: recipe.name || "",
    fastingType: recipe.level || "adaptable",
    category: Array.isArray(recipe.types) ? recipe.types.join(", ") : "Recipe",
    sourceUrl: "",
    ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients.join(", ") : "",
    instructions: recipe.note || ""
  })).filter((recipe) => recipe.title);
  const mealsByDate = new Map();
  Object.entries(state.plan || {}).forEach(([key, recipeId]) => {
    const [dayKey, slot] = key.split("-");
    const date = keyToDate[dayKey];
    if (!date || !slot) return;
    if (!mealsByDate.has(date)) mealsByDate.set(date, { date });
    mealsByDate.get(date)[slot] = recipeTitleFromPrototypeId(recipeId, state);
  });
  const events = (state.events || []).map((event) => ({
    id: event.id || "",
    title: event.title || "",
    eventType: event.type || "Appointment",
    date: keyToDate[event.dayKey] || keyToDate.d3 || "",
    startTime: event.time || "",
    location: event.who || "",
    notes: event.note || ""
  })).filter((event) => event.title && event.date);
  const seedDays = (() => {
    try {
      return JSON.parse(localStorage.getItem("agapay.planner.seed.v1") || "{}").days || [];
    } catch {
      return [];
    }
  })();
  const dayLabelByKey = Object.fromEntries(seedDays.map((day) => [day.key, day.long || day.weekday || ""]));
  const choreDetails = state.choreDetails || {};
  const chores = Object.entries(state.chores || {}).map(([key, title], index) => {
    const [assignee = "Everyone", dayKey = ""] = key.split("::");
    const detail = choreDetails[key] || {};
    return {
      id: detail.id || `prototype_chore_${index}`,
      title: detail.title || title,
      assignee: detail.assignee || assignee,
      cadence: detail.cadence || "weekly",
      day: detail.day || dayLabelByKey[dayKey] || "",
      dayOfMonth: detail.dayOfMonth || "",
      quarterMonth: detail.quarterMonth || "",
      assignedDate: detail.assignedDate || "",
      timeOfDay: detail.timeOfDay || "Anytime",
      notes: detail.notes || "",
      completed: Boolean(detail.completed)
    };
  }).filter((chore) => chore.title);
  const pantryItems = (state.pantry || []).map((name, index) => ({
    id: `pantry_${index}`,
    name,
    quantity: "",
    category: "Pantry",
    checked: false,
    pantry: true
  }));
  const groceryItems = (state.manualGroceries || []).map((item) => ({
    id: item.id || "",
    name: item.label || "",
    quantity: "",
    category: item.aisle || "Other",
    checked: Boolean(state.groceryChecked?.[item.id]),
    pantry: false
  })).filter((item) => item.name);
  return {
    household: vm.familyPlanning?.household || {},
    childNameDays: (vm.familyPlanning?.children || []).map((child) => ({ childId: child.id || "", nameDay: child.nameDay || "" })),
    familyPlanning: {
      fastingPreference: vm.familyPlanning?.fastingPreference || "guidance",
      weekStart: keyToDate.d0 || "",
      meals: [...mealsByDate.values()],
      recipes,
      groceryItems: [...pantryItems, ...groceryItems],
      events,
      chores: chores.length ? chores : vm.familyPlanning?.chores || []
    }
  };
}

function wireFamilyPrototypeBackend(vm, frame) {
  let lastSeen = localStorage.getItem("agapay.planner.v2") || "";
  let lastPosted = localStorage.getItem("agapay.planner.v2.backendHash") || "";
  let syncTimer = null;
  const status = document.createElement("div");
  status.className = "learn-prototype-sync-status";
  status.textContent = "Family Planner sync is ready.";
  frame.closest(".learn-prototype-embed")?.prepend(status);

  const syncNow = async () => {
    const raw = localStorage.getItem("agapay.planner.v2") || "";
    if (!raw || raw === lastPosted) return;
    let state;
    try {
      state = JSON.parse(raw);
    } catch {
      return;
    }
    status.textContent = "Saving Family Planner...";
    status.dataset.state = "saving";
    try {
      await apiPost("/api/learn/family-planning", prototypeStateToFamilyPlanningPayload(vm, state));
      lastPosted = raw;
      localStorage.setItem("agapay.planner.v2.backendHash", raw);
      status.textContent = "Family Planner saved.";
      status.dataset.state = "saved";
    } catch (error) {
      status.textContent = error.message || "Family Planner could not save.";
      status.dataset.state = "error";
    }
  };

  const scheduleSync = () => {
    window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(syncNow, 650);
  };

  const poll = window.setInterval(() => {
    const current = localStorage.getItem("agapay.planner.v2") || "";
    if (current !== lastSeen) {
      lastSeen = current;
      scheduleSync();
    }
  }, 900);

  frame.addEventListener("load", () => {
    lastSeen = localStorage.getItem("agapay.planner.v2") || "";
    scheduleSync();
  }, { once: true });

  window.addEventListener("beforeunload", () => {
    window.clearInterval(poll);
  }, { once: true });
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
    return `<article style="min-height:110px;border:1px solid ${border};border-radius:10px;background:${muted ? "rgba(248,240,221,.46)" : fastBg};padding:8px;display:flex;flex-direction:column;gap:5px;box-shadow:${day.isToday ? "inset 0 0 0 1px rgba(181,148,47,.45)" : "none"};opacity:${muted ? ".55" : "1"};">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px;">
        <span style="font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:700;color:${day.isFastDay ? "var(--burgundy)" : "var(--ink)"};">${html(day.dayNumber)}</span>
        ${day.isToday ? `<span style="border:1px solid var(--gold);border-radius:999px;padding:2px 6px;font-size:9px;color:var(--gold);font-weight:700;">TODAY</span>` : ""}
      </div>
      <strong style="font-size:11px;line-height:1.2;color:${day.isFastDay ? "var(--burgundy)" : "var(--ink)"};">${html(day.feast)}</strong>
      ${day.isFastDay ? `<span style="color:var(--burgundy);font-size:10px;font-weight:700;">${html(day.fastingType || day.fasting)}</span>` : ""}
      <div style="display:grid;gap:3px;margin-top:auto;">${plans.length ? plans.map((plan) => `<span style="font-size:10.5px;color:#33405a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${html(plan.title)}</span>`).join("") : ""}</div>
    </article>`;
  }).join("");

  return `
    <div style="display:flex;flex-direction:column;gap:14px;">

      <!-- Full-width calendar panel -->
      <div style="background:var(--paper);border:1px solid var(--line);border-radius:16px;padding:18px 16px;box-shadow:0 1px 3px rgba(20,40,70,.04);">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
          <div>
            <div style="color:var(--gold);font-size:11px;letter-spacing:.15em;font-weight:700;text-transform:uppercase;">Household Month</div>
            <h2 style="font-family:'Cormorant Garamond',serif;font-size:34px;line-height:1;margin:5px 0 0;color:var(--ink);">${html(month.label)}</h2>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <a href="/myagapay/learn/planner?view=month&month=${encodeURIComponent(adjacentMonthKey(month.key, -1))}&term=${encodeURIComponent(vm.term.activeTerm)}&termId=${encodeURIComponent(vm.term.activeTermId)}" style="border:1px solid var(--line);border-radius:9px;padding:9px 12px;color:var(--ink);text-decoration:none;background:var(--paper2);">← Previous</a>
            <button type="button" data-planner-month-print="${html(month.key)}" style="border:1px solid var(--gold);background:var(--navy);color:#fff;border-radius:9px;padding:9px 14px;font-family:inherit;font-weight:700;cursor:pointer;">Print Month</button>
            <a href="/myagapay/learn/planner?view=month&month=${encodeURIComponent(adjacentMonthKey(month.key, 1))}&term=${encodeURIComponent(vm.term.activeTerm)}&termId=${encodeURIComponent(vm.term.activeTermId)}" style="border:1px solid var(--line);border-radius:9px;padding:9px 12px;color:var(--ink);text-decoration:none;background:var(--paper2);">Next →</a>
          </div>
        </div>
        <!-- 7-column day header -->
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-bottom:6px;">
          ${(month.weekdays || []).map((day) => `<div style="color:var(--gold);font-size:10px;letter-spacing:.12em;font-weight:700;text-align:center;text-transform:uppercase;padding-bottom:4px;">${html(day)}</div>`).join("")}
        </div>
        <!-- Day cells — no min-width, fills container naturally -->
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;">
          ${dayCells}
        </div>
      </div>

      <!-- Sidebar panels below, side by side -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;">
        ${panel("Month Notes", `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div>
              <small style="color:var(--gold);letter-spacing:.12em;text-transform:uppercase;font-size:10px;">Fast Days</small>
              <strong style="display:block;font-family:'Cormorant Garamond',serif;font-size:30px;color:var(--burgundy);line-height:1;">${html(month.fastDays)}</strong>
              <span style="color:var(--muted);font-size:13px;">Marked in red.</span>
            </div>
            <div>
              <small style="color:var(--gold);letter-spacing:.12em;text-transform:uppercase;font-size:10px;">Feast Markers</small>
              <strong style="display:block;font-family:'Cormorant Garamond',serif;font-size:30px;color:var(--ink);line-height:1;">${html(month.feastDays)}</strong>
              <span style="color:var(--muted);font-size:13px;">Major liturgical rhythms.</span>
            </div>
          </div>
          <p style="margin:12px 0 0;font-size:13px;color:#33405a;line-height:1.45;border-top:1px solid var(--line);padding-top:12px;">Print a clean household copy — feast days, fasts, and the month at a glance.</p>`, { icon: "▣" })}
        ${panel("Legend", `
          <div style="display:grid;gap:10px;">
            <span style="display:flex;gap:9px;align-items:center;font-size:13px;"><i style="flex:none;width:18px;height:18px;border-radius:5px;background:rgba(110,47,42,.12);border:1px solid rgba(110,47,42,.38);"></i> Fast day</span>
            <span style="display:flex;gap:9px;align-items:center;font-size:13px;"><i style="flex:none;width:18px;height:18px;border-radius:5px;background:rgba(181,148,47,.14);border:1px solid var(--line);"></i> Sunday / feast rhythm</span>
            <span style="display:flex;gap:9px;align-items:center;font-size:13px;"><i style="flex:none;width:18px;height:18px;border-radius:5px;background:var(--paper2);border:1px solid var(--gold);"></i> Today</span>
          </div>`, { icon: "✥" })}
      </div>

    </div>
  `;
}

function renderPlannerTerm(vm) {
  const weekCells = Array.from({ length: Number(vm.term.summary.weeks || 12) }, (_, index) => `<div style="text-align:center;color:var(--ink);font-size:13px;">${index + 1}</div>`).join("");
  const pacingRows = vm.term.pacingRows.map((row) => `<div style="display:grid;grid-template-columns:150px repeat(12,1fr);min-width:920px;border-top:1px solid var(--line);align-items:stretch;"><div style="padding:12px;display:flex;gap:9px;align-items:flex-start;"><span style="width:28px;height:28px;border-radius:50%;background:${html(row.color)};color:#f3ead4;display:flex;align-items:center;justify-content:center;font-size:13px;">✥</span><span><strong>${html(row.label)}</strong><small style="display:block;color:var(--muted);">${html(row.subtitle)}</small></span></div><div style="grid-column:span 12;display:grid;grid-template-columns:repeat(12,1fr);position:relative;border-left:1px solid var(--line);background:linear-gradient(90deg,rgba(231,220,192,.32) 1px,transparent 1px);background-size:calc(100% / 12) 100%;">${row.segments.map((segment) => `<div style="grid-column:${segment.start} / span ${segment.span};margin:7px 4px;border:1px solid ${html(segment.color)};border-radius:8px;background:${softColor(segment.color, "26")};display:flex;align-items:center;justify-content:center;text-align:center;padding:8px;font-size:13px;color:var(--ink);box-shadow:inset 0 0 0 1px rgba(255,255,255,.32);"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${html(segment.color)};margin-right:6px;"></span>${html(segment.title)}</div>`).join("")}</div></div>`).join("");
  return `
    <div style="display:grid;grid-template-columns:repeat(4,minmax(160px,1fr));gap:12px;">${vm.term.setupCards.map((card) => `<div style="background:var(--paper);border:1px solid ${html(card.color)};border-radius:12px;padding:14px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.35);"><small style="color:var(--gold);letter-spacing:.12em;text-transform:uppercase;">${html(card.title)}</small><strong style="display:block;font-family:'Cormorant Garamond',serif;font-size:22px;margin:8px 0;color:var(--ink);">${html(card.value)}</strong><span style="color:var(--muted);line-height:1.35;">${html(card.detail)}</span></div>`).join("")}</div>
    <div style="background:var(--paper);border:1px solid var(--line);border-radius:14px;overflow:hidden;">
      <div style="overflow-x:auto;overflow-y:visible;">
      <div style="min-width:920px;">
        <div style="display:grid;grid-template-columns:150px repeat(12,1fr);padding:12px 0;border-bottom:1px solid var(--line);"><div style="padding-left:12px;color:var(--gold);font-size:12px;letter-spacing:.15em;">TERM PACING</div>${weekCells}</div>
        ${pacingRows || emptyState("Add pacing rows in Setup.")}
      </div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:.9fr repeat(${Math.min(vm.term.childTracks.length, 4)}, minmax(150px,1fr));gap:12px;">
      ${panel("Family-Based Learning", vm.term.householdSummary.map((item) => `<div style="padding:8px 0;border-top:1px solid var(--line);">${html(item)}</div>`).join("") || emptyState("Add household streams in Setup."), { icon: "⌂", style: "min-width:0;" })}
      ${vm.term.childTracks.slice(0, 4).map((child) => panel(`${child.name} · Age ${child.age}`, `<div style="display:grid;gap:8px;">${child.tracks.map((track) => `<div style="border-top:1px solid var(--line);padding:8px 0;">${html(track)}</div>`).join("") || emptyState("No tracks configured.")}</div>`, { icon: child.initial, style: "min-width:0;" })).join("")}
    </div>
    ${vm.term.childTracks.length > 4 ? `<div style="color:var(--muted);font-size:13px;padding:6px 2px;">+ ${vm.term.childTracks.length - 4} more ${vm.term.childTracks.length - 4 === 1 ? "child" : "children"} — add Setup tracks to see their columns here.</div>` : ""}
  `;
}

function renderPlannerYear(vm) {
  // ── Term timeline ─────────────────────────────────────────────────────────────
  const totalTerms = vm.year.terms.length || 4;
  const termTimeline = vm.year.terms.map((term, i) => {
    const active = term.active;
    return `
      <div style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;">
        <div style="width:100%;height:8px;border-radius:99px;background:${active ? "var(--gold)" : "var(--line)"};position:relative;">
          ${active ? `<div style="position:absolute;top:-4px;left:50%;transform:translateX(-50%);width:16px;height:16px;border-radius:50%;background:var(--gold);border:2px solid #fff;box-shadow:0 0 0 2px var(--gold);"></div>` : ""}
        </div>
        <strong style="font-size:13px;color:${active ? "var(--ink)" : "var(--muted)"};">${html(term.label)}</strong>
        <small style="font-size:11px;color:${active ? "var(--gold)" : "var(--muted)"};">${active ? "Current" : "Planned"}</small>
      </div>
      ${i < totalTerms - 1 ? `<div style="width:16px;flex:none;height:8px;margin-top:0;align-self:center;"></div>` : ""}`;
  }).join("");

  // ── Season topics by type ─────────────────────────────────────────────────────
  const topicsByType = vm.year.topics.reduce((map, topic) => {
    const key = topic.type || "Enrichment";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(topic);
    return map;
  }, new Map());

  const topicsGrid = topicsByType.size
    ? Array.from(topicsByType.entries()).map(([type, topics]) => `
        <div>
          <div style="color:var(--gold);font-size:10px;letter-spacing:.14em;font-weight:800;text-transform:uppercase;margin-bottom:8px;">${html(type)}</div>
          ${topics.map((topic) => `
            <div style="padding:8px 0;border-top:1px solid var(--line);">
              <strong style="display:block;font-size:14px;color:var(--ink);">${html(topic.title)}</strong>
              ${topic.season ? `<small style="color:var(--muted);font-size:11px;">${html(topic.season)}</small>` : ""}
            </div>`).join("")}
        </div>`).join("")
    : `<div style="color:var(--muted);font-style:italic;font-size:13px;">Add curriculum subjects in Setup to populate the year view.</div>`;

  // ── Curriculum packages ───────────────────────────────────────────────────────
  const pkgCards = vm.year.curriculumPackages.length
    ? vm.year.curriculumPackages.map((pkg) => `
        <div style="border:1px solid var(--line);border-radius:10px;background:var(--paper2);padding:13px;">
          ${pkg.vendor ? `<small style="color:var(--gold);font-size:10px;letter-spacing:.1em;font-weight:800;text-transform:uppercase;">${html(pkg.vendor)}</small>` : ""}
          <strong style="display:block;margin:4px 0 5px;font-family:'Cormorant Garamond',serif;font-size:18px;color:var(--ink);">${html(pkg.title)}</strong>
          <span style="color:var(--muted);line-height:1.4;font-size:13px;">${html(pkg.summary)}</span>
        </div>`).join("")
    : `<div style="color:var(--muted);font-style:italic;font-size:13px;padding:8px 0;">Add curriculum packages in Setup.</div>`;

  // ── Upcoming feasts ───────────────────────────────────────────────────────────
  const feastItems = vm.year.upcomingFeasts.length
    ? vm.year.upcomingFeasts.map((feast) => `
        <div style="display:grid;grid-template-columns:52px 1fr;gap:10px;padding:10px 0;border-top:1px solid var(--line);align-items:start;">
          <div style="text-align:center;background:linear-gradient(180deg,var(--navy),#1b2c4a);border-radius:8px;padding:7px 4px;border:1px solid rgba(181,148,47,.28);">
            <div style="color:var(--gold);font-size:14px;">✦</div>
            <div style="color:#f3ead4;font-size:9px;line-height:1.2;margin-top:2px;">${html(feast.date || "")}</div>
          </div>
          <div>
            <strong style="font-family:'Cormorant Garamond',serif;font-size:16px;line-height:1.2;display:block;">${html(feast.title)}</strong>
            ${feast.fasting ? `<small style="color:var(--burgundy);font-size:11px;font-weight:700;">${html(feast.fasting)}</small>` : ""}
          </div>
        </div>`).join("")
    : emptyState("Connect a calendar source to see upcoming feasts.");

  return `
    <div style="display:grid;gap:16px;">

      ${panel("School Year", `
        <h2 style="font-family:'Cormorant Garamond',serif;font-size:28px;margin:0 0 4px;">${html(vm.year.schoolYear)}</h2>
        <p style="margin:0 0 18px;color:var(--muted);font-size:13px;">${html(vm.year.dateRange)}${vm.year.cycleTitle ? ` · ${html(vm.year.cycleTitle)}` : ""}${vm.year.cycleYear ? ` · ${html(vm.year.cycleYear)}` : ""}</p>
        <div style="display:flex;gap:0;align-items:flex-start;">
          ${termTimeline}
        </div>`, { icon: "▣" })}

      <div style="display:grid;grid-template-columns:1fr 300px;gap:16px;align-items:start;">
        ${panel("Season Topics", `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:20px;">${topicsGrid}</div>`, { icon: "☰" })}
        ${panel("Upcoming Feasts", feastItems, { icon: "✦" })}
      </div>

      ${panel("Curriculum Packages", `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;">${pkgCards}</div>`, { icon: "✥" })}

    </div>
  `;
}

function renderFormation(vm) {
  // ── Today panel — liturgical day, readings, saint, fasting all in one place ─
  const fastBadge = vm.today.fasting && !/no fast/i.test(vm.today.fasting)
    ? `<span style="display:inline-flex;align-items:center;gap:5px;background:rgba(110,47,42,.10);color:var(--burgundy);border:1px solid rgba(110,47,42,.22);border-radius:999px;padding:4px 11px;font-size:11px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;">✦ ${html(vm.today.fasting)}</span>`
    : "";
  const readingButtons = vm.today.readingTasks?.length
    ? `<div style="display:grid;gap:8px;margin-top:14px;">${vm.today.readingTasks.map((r) => `
        <button type="button" data-reading-check aria-pressed="false"
          style="display:flex;align-items:center;gap:11px;text-align:left;border:1px solid var(--line);border-radius:11px;background:var(--paper2);padding:11px 13px;font-family:inherit;color:var(--ink);cursor:pointer;transition:border-color .15s;">
          <span data-reading-mark style="flex:none;width:22px;height:22px;border-radius:50%;border:1.5px solid var(--gold);display:grid;place-items:center;color:var(--gold);font-size:11px;"></span>
          <span style="min-width:0;">
            <strong style="display:block;font-size:14px;">${html(r.label)}</strong>
            <small style="color:var(--muted);font-size:12px;">${html(r.ref)}</small>
          </span>
        </button>`).join("")}</div>`
    : (vm.today.readings ? `<p style="margin:12px 0 0;color:#33405a;line-height:1.5;font-size:14px;">${html(vm.today.readings)}</p>` : "");

  const saintBlock = vm.today.saint
    ? `<div style="margin-top:14px;padding:12px;background:linear-gradient(135deg,rgba(181,148,47,.08),rgba(181,148,47,.03));border:1px solid rgba(181,148,47,.22);border-radius:10px;">
         <div style="color:var(--gold);font-size:10px;letter-spacing:.14em;font-weight:800;text-transform:uppercase;margin-bottom:4px;">Commemorated Today</div>
         <strong style="font-family:'Cormorant Garamond',serif;font-size:17px;color:var(--ink);line-height:1.25;">${html(vm.today.saint)}</strong>
       </div>`
    : "";

  const troparionBlock = vm.today.troparion
    ? `<div style="margin-top:12px;padding:12px 14px;border-left:3px solid var(--goldsoft);background:rgba(255,255,255,.5);border-radius:0 8px 8px 0;">
         <div style="color:var(--gold);font-size:10px;letter-spacing:.14em;font-weight:800;text-transform:uppercase;margin-bottom:5px;">Troparion</div>
         <p style="margin:0;font-family:'Cormorant Garamond',serif;font-size:16px;line-height:1.55;color:#2a3550;font-style:italic;">${html(vm.today.troparion)}</p>
       </div>`
    : "";

  const todayPanel = panel("Today in the Church", `
    <div style="display:flex;align-items:baseline;flex-wrap:wrap;gap:10px;margin-bottom:6px;">
      <h2 style="font-family:'Cormorant Garamond',serif;font-size:28px;line-height:1.05;margin:0;color:var(--ink);">${html(vm.today.title)}</h2>
      <small style="color:var(--muted);font-size:13px;">${html(vm.today.date)}</small>
    </div>
    ${fastBadge}
    ${readingButtons}
    ${saintBlock}
    ${troparionBlock}`, { icon: "☩", largeTitle: false, style: "" });

  // ── Church rhythms — daily household formation checklist ─────────────────────
  const rhythmsContent = vm.rhythms.length
    ? vm.rhythms.map((item) => `
        <div style="display:flex;align-items:center;gap:12px;padding:11px 0;border-top:1px solid var(--line);">
          ${check(item.complete)}
          <div style="min-width:0;">
            <strong style="font-size:14px;display:block;">${html(item.title)}</strong>
            ${item.note ? `<small style="color:var(--muted);font-size:12px;">${html(item.note)}</small>` : ""}
          </div>
        </div>`).join("")
    : emptyState("Add daily rhythms in Setup — Morning Prayer, Readings, Scripture memory.");
  const rhythmsPanel = panel("Daily Household Rhythms", rhythmsContent, { icon: "✥" });

  // ── Upcoming feasts — oriented around the week ahead ─────────────────────────
  const feastItems = vm.feasts.length
    ? vm.feasts.map((feast) => `
        <div style="display:grid;grid-template-columns:56px 1fr;gap:12px;padding:11px 0;border-top:1px solid var(--line);align-items:start;">
          <div style="text-align:center;background:linear-gradient(180deg,var(--navy),#1b2c4a);border-radius:9px;padding:8px 4px;border:1px solid rgba(181,148,47,.28);">
            <div style="color:var(--gold);font-size:18px;">✦</div>
            <div style="color:#f3ead4;font-size:10px;line-height:1.2;margin-top:2px;">${html(feast.date || "Soon")}</div>
          </div>
          <div>
            <strong style="font-family:'Cormorant Garamond',serif;font-size:17px;line-height:1.2;display:block;">${html(feast.title)}</strong>
            ${feast.fasting ? `<small style="color:var(--burgundy);font-size:11px;font-weight:700;">${html(feast.fasting)}</small>` : ""}
          </div>
        </div>`).join("")
    : emptyState("Connect a calendar source to see upcoming feasts.");
  const feastsPanel = panel("Upcoming Feasts", `${feastItems}<a href="/myagapay/learn/planner" style="display:block;margin-top:10px;text-align:center;font-size:13px;color:var(--gold);text-decoration:none;border:1px solid var(--line);border-radius:9px;padding:9px;">View full calendar →</a>`, { icon: "☩" });

  // ── Catechesis ────────────────────────────────────────────────────────────────
  const catechesisPanel = panel("Catechesis", `
    <small style="color:var(--gold);letter-spacing:.12em;text-transform:uppercase;font-size:10px;">${html(vm.catechesis.progress) || "Current Lesson"}</small>
    <strong style="display:block;font-family:'Cormorant Garamond',serif;font-size:22px;margin:6px 0 8px;color:var(--ink);">${html(vm.catechesis.title)}</strong>
    <p style="margin:0;color:#33405a;line-height:1.5;font-size:14px;">${html(vm.catechesis.currentLesson)}</p>
    ${vm.catechesis.topic ? `<small style="display:block;margin-top:8px;color:var(--muted);">${html(vm.catechesis.topic)}</small>` : ""}`, { icon: "✥" });

  // ── Recitation & Memory Work ──────────────────────────────────────────────────
  const memoryContent = vm.recitation.length
    ? vm.recitation.map((item) => `
        <div style="padding:10px 0;border-top:1px solid var(--line);">
          <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:6px;">
            <strong style="font-size:14px;">${html(item.title)}</strong>
            <small style="color:var(--muted);white-space:nowrap;font-size:11px;">${html(item.status)}</small>
          </div>
          ${progressEditor(item, "recitation", { color: "var(--navy)", label: `${item.title} memory progress`, suffix: "memorized" })}
        </div>`).join("")
    : emptyState("Add recitation tracks in Setup — Psalms, Catechism, Scripture.");
  const memoryPanel = panel("Recitation & Memory", memoryContent, { icon: "☰" });

  // ── Hymn Study ────────────────────────────────────────────────────────────────
  const hymnContent = vm.hymns.length
    ? vm.hymns.map((hymn) => `
        <div style="padding:11px 0;border-top:1px solid var(--line);">
          <strong style="display:block;font-size:14px;">${html(hymn.title)}</strong>
          <small style="color:var(--muted);font-size:12px;">${[hymn.tone, hymn.source].filter(Boolean).join(" · ")}</small>
        </div>`).join("")
    : emptyState("Add hymns to study in Setup.");
  const hymnsPanel = panel("Hymn Study", hymnContent, { icon: "♫" });

  // ── Enrichment ────────────────────────────────────────────────────────────────
  const enrichContent = vm.enrichment.length
    ? vm.enrichment.map((item) => `
        <div style="display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid var(--line);align-items:center;">
          <span style="min-width:0;">
            <strong style="font-size:13px;display:block;">${html(item.title)}</strong>
            ${item.type ? `<small style="color:var(--muted);font-size:11px;text-transform:capitalize;">${html(item.type)}</small>` : ""}
          </span>
          <span style="color:var(--muted);font-size:12px;white-space:nowrap;">${html(item.minutes)}</span>
        </div>`).join("")
    : emptyState("Add enrichment blocks in Setup.");
  const enrichPanel = panel("Enrichment", enrichContent, { icon: "✣" });

  // ── Nature Journal ────────────────────────────────────────────────────────────
  const natureContent = vm.nature?.length
    ? vm.nature.map((entry) => `
        <div style="padding:10px 0;border-top:1px solid var(--line);">
          <strong style="display:block;font-size:14px;">${html(entry.title)}</strong>
          ${entry.location ? `<small style="color:var(--muted);font-size:12px;">📍 ${html(entry.location)}</small>` : ""}
          ${entry.notes ? `<p style="margin:5px 0 0;font-size:13px;color:#33405a;line-height:1.4;">${html(entry.notes)}</p>` : ""}
        </div>`).join("")
    : emptyState("Nature journal entries will appear here as you add them.");
  const naturePanel = panel("Nature Journal", natureContent, { icon: "✦" });

  const body = `
    <section data-screen-label="Formation" style="display:flex;flex-direction:column;gap:18px;">

      <div style="display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr) minmax(0,1fr);gap:16px;align-items:start;">
        ${todayPanel}
        ${rhythmsPanel}
        ${feastsPanel}
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;align-items:start;">
        ${catechesisPanel}
        ${memoryPanel}
        ${hymnsPanel}
        ${enrichPanel}
        ${naturePanel}
      </div>

    </section>`;
  return shell(vm, body);
}

function bookCover(book = {}, icon = "☰") {
  const title = String(book.title || "Book").split(/\s+/).slice(0, 3).join(" ");
  return `<div style="width:58px;height:82px;flex:none;border-radius:7px;border:1.5px solid var(--goldsoft);background:linear-gradient(145deg,var(--navy),#1b2c4a 58%,#6e2f2a);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08),0 8px 18px rgba(20,40,70,.14);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#f7e8bd;padding:7px;gap:5px;"><span style="font-size:17px;color:var(--gold2);">${icon}</span><small style="font-size:10px;line-height:1.05;">${html(title)}</small></div>`;
}

function renderBooks(vm) {
  // ── Read-aloud cards ──────────────────────────────────────────────────────────
  const readAloudCards = vm.readAlouds.length
    ? vm.readAlouds.map((book) => `
        <article style="display:flex;gap:14px;background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:14px;min-width:0;box-shadow:0 1px 3px rgba(20,40,70,.04);">
          ${bookCover(book, "☰")}
          <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;">
            <strong style="font-family:'Cormorant Garamond',serif;font-size:19px;line-height:1.12;color:var(--ink);">${html(book.title)}</strong>
            <span style="font-size:12px;color:var(--muted);">${html(book.author)}</span>
            <span style="font-size:12px;color:var(--gold);font-weight:700;letter-spacing:.04em;">${html(book.assignment || book.stream || "Household")}</span>
            <div style="margin-top:auto;padding-top:10px;">
              ${progressEditor(book, "book", { label: `${book.title} reading progress`, suffix: "complete" })}
            </div>
          </div>
        </article>`).join("")
    : emptyState("Add read-alouds in Setup to track progress here.");

  // ── Library table — fixed overflow ────────────────────────────────────────────
  const libraryRows = vm.library.length
    ? vm.library.map((book, i) => `
        <div style="display:grid;grid-template-columns:2fr 1.1fr 1fr .55fr .65fr 1.6fr;gap:10px;align-items:center;padding:10px 4px;border-top:1px solid var(--line);font-size:13px;background:${i % 2 ? "var(--paper2)" : "transparent"};">
          <span style="display:flex;align-items:center;gap:9px;min-width:0;">
            ${bookCover(book, "☰")}
            <span style="min-width:0;">
              <strong style="display:block;color:var(--ink);font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${html(book.title)}</strong>
              <small style="color:var(--muted);">${html(book.assignment || "")}</small>
            </span>
          </span>
          <span style="color:var(--ink);">${html(book.author)}</span>
          <span style="color:var(--muted);">${html(book.category)}</span>
          <span style="color:var(--muted);">${html(book.ages || "—")}</span>
          <span style="${book.orthodox ? "color:var(--gold);font-weight:700;" : "color:var(--muted);"}">${book.orthodox ? "Orthodox" : "—"}</span>
          <span>${progressEditor(book, "book", { label: `${book.title} reading progress`, suffix: "complete" })}</span>
        </div>`).join("")
    : `<div style="padding:18px 4px;color:var(--muted);font-style:italic;">Add books in Setup to build the household library.</div>`;

  const libraryHeader = `
    <div style="display:grid;grid-template-columns:2fr 1.1fr 1fr .55fr .65fr 1.6fr;gap:10px;padding:0 4px 10px;border-bottom:1px solid var(--line);font-size:10px;letter-spacing:.1em;color:var(--muted);font-weight:700;text-transform:uppercase;">
      <span>Title</span><span>Author</span><span>Category</span><span>Ages</span><span>Orthodox</span><span>Progress</span>
    </div>`;

  // ── Book pacing ───────────────────────────────────────────────────────────────
  const pacingContent = vm.pacing.weeks.length
    ? `<strong style="font-family:'Cormorant Garamond',serif;font-size:20px;display:block;margin-bottom:4px;">${html(vm.pacing.title)}</strong>
       <small style="color:var(--muted);">${html(vm.pacing.subtitle)}${vm.pacing.chaptersPerWeek ? ` · ${html(vm.pacing.chaptersPerWeek)} ch/wk` : ""}</small>
       ${vm.pacing.weeks.map((week, i) => `
         <div style="display:grid;grid-template-columns:52px 1fr 52px;gap:8px;border-top:1px solid var(--line);padding:8px 0;font-size:13px;align-items:center;">
           <span style="color:var(--muted);">Wk ${html(week.week)}</span>
           <strong style="font-size:14px;">${html(week.chapters)}</strong>
           <span style="color:var(--muted);text-align:right;">${html(week.pages)}</span>
         </div>`).join("")}`
    : emptyState("Add a read-aloud with start and end chapters in Setup.");

  // ── Copywork sources ──────────────────────────────────────────────────────────
  const copyworkContent = vm.copywork.length
    ? vm.copywork.map((source) => `
        <div style="padding:9px 0;border-top:1px solid var(--line);">
          <strong style="display:block;font-size:14px;">${html(source.title)}</strong>
          <small style="color:var(--muted);font-size:12px;line-height:1.4;">${html(source.detail)}</small>
        </div>`).join("")
    : "";

  // ── Orthodox suggestions ──────────────────────────────────────────────────────
  const suggestionsContent = vm.suggestions.length
    ? vm.suggestions.map((s) => `
        <div style="display:flex;gap:12px;padding:11px 0;border-top:1px solid var(--line);align-items:flex-start;">
          <span style="flex:none;width:36px;height:36px;border-radius:50%;background:${s.color};color:#f3ead4;display:flex;align-items:center;justify-content:center;font-size:16px;">✥</span>
          <div>
            <strong style="font-family:'Cormorant Garamond',serif;font-size:17px;display:block;line-height:1.2;">${html(s.title)}</strong>
            <small style="color:var(--muted);font-size:12px;line-height:1.3;">${html(s.subtitle)}</small>
          </div>
        </div>`).join("")
    : "";

  const body = `
    <section data-screen-label="Books" style="display:flex;flex-direction:column;gap:18px;">

      <div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap;">

        <div style="flex:1 1 620px;min-width:0;display:flex;flex-direction:column;gap:16px;">

          ${panel("Current Read-Alouds",
            `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;">${readAloudCards}</div>`,
            { icon: "☰" })}

          ${panel("Household Library",
            `<div style="overflow-x:auto;overflow-y:visible;">
               <div style="min-width:880px;">${libraryHeader}${libraryRows}</div>
             </div>`,
            { icon: "⌂" })}

        </div>

        <aside style="flex:0 1 320px;min-width:240px;display:flex;flex-direction:column;gap:16px;">

          ${panel("Book Pacing", pacingContent, { icon: "♙" })}

          ${vm.copywork.length
            ? panel("Copywork Sources", copyworkContent, { icon: "✒" })
            : ""}

          ${vm.suggestions.length
            ? panel("Suggested Orthodox Books", suggestionsContent, { icon: "✥" })
            : ""}

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

function gradeOption(value, selectedValue) {
  return `<option value="${html(value)}" ${value === selectedValue ? "selected" : ""}>${html(value || "Select")}</option>`;
}

function attendanceDateLabel(date = "") {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T12:00:00Z`) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return { day: "Day", short: date };
  return {
    day: new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(parsed),
    short: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(parsed)
  };
}

function attendanceStatusLabel(status = "present") {
  return {
    present: "Present",
    absent: "Absent",
    excused: "Excused",
    holiday: "Holiday"
  }[status] || "Present";
}

function attendanceStatusMark(status = "present") {
  return {
    present: "P",
    absent: "A",
    excused: "E",
    holiday: "H"
  }[status] || "P";
}

const US_FEDERAL_HOLIDAY_CACHE = new Map();

function isoDateFromUTC(date) {
  return date.toISOString().slice(0, 10);
}

function utcHolidayDate(year, monthIndex, day) {
  return new Date(Date.UTC(year, monthIndex, day, 12));
}

function addHoliday(map, date, name) {
  map.set(isoDateFromUTC(date), name);
}

function addObservedFixedHoliday(map, year, monthIndex, day, name) {
  const actual = utcHolidayDate(year, monthIndex, day);
  const observed = utcHolidayDate(year, monthIndex, day);
  const weekday = actual.getUTCDay();
  if (weekday === 6) observed.setUTCDate(observed.getUTCDate() - 1);
  if (weekday === 0) observed.setUTCDate(observed.getUTCDate() + 1);
  addHoliday(map, observed, name);
}

function nthWeekdayOfMonth(year, monthIndex, weekday, nth) {
  const date = utcHolidayDate(year, monthIndex, 1);
  const offset = (weekday - date.getUTCDay() + 7) % 7;
  date.setUTCDate(1 + offset + ((nth - 1) * 7));
  return date;
}

function lastWeekdayOfMonth(year, monthIndex, weekday) {
  const date = utcHolidayDate(year, monthIndex + 1, 0);
  const offset = (date.getUTCDay() - weekday + 7) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date;
}

function usFederalHolidayMap(year) {
  if (US_FEDERAL_HOLIDAY_CACHE.has(year)) return US_FEDERAL_HOLIDAY_CACHE.get(year);
  const holidays = new Map();
  addObservedFixedHoliday(holidays, year, 0, 1, "New Year's Day");
  addHoliday(holidays, nthWeekdayOfMonth(year, 0, 1, 3), "Martin Luther King Jr. Day");
  addHoliday(holidays, nthWeekdayOfMonth(year, 1, 1, 3), "Washington's Birthday");
  addHoliday(holidays, lastWeekdayOfMonth(year, 4, 1), "Memorial Day");
  addObservedFixedHoliday(holidays, year, 5, 19, "Juneteenth National Independence Day");
  addObservedFixedHoliday(holidays, year, 6, 4, "Independence Day");
  addHoliday(holidays, nthWeekdayOfMonth(year, 8, 1, 1), "Labor Day");
  addHoliday(holidays, nthWeekdayOfMonth(year, 9, 1, 2), "Columbus Day");
  addObservedFixedHoliday(holidays, year, 10, 11, "Veterans Day");
  addHoliday(holidays, nthWeekdayOfMonth(year, 10, 4, 4), "Thanksgiving Day");
  addObservedFixedHoliday(holidays, year, 11, 25, "Christmas Day");
  US_FEDERAL_HOLIDAY_CACHE.set(year, holidays);
  return holidays;
}

function nationalHolidayForDate(date = "") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const year = Number(date.slice(0, 4));
  return [year - 1, year, year + 1]
    .map((candidateYear) => usFederalHolidayMap(candidateYear).get(date))
    .find(Boolean) || "";
}

function renderAttendanceTracker(vm) {
  const dates = vm.attendance.weekDates.length ? vm.attendance.weekDates : [];
  const byKey = new Map(vm.attendance.entries.map((entry) => [`${entry.childId}::${entry.date}`, entry]));
  const childSummary = new Map(vm.attendance.summary.byChild.map((row) => [row.childId, row]));
  const attendanceChildren = vm.selectedChild?.id ? vm.children.filter((child) => child.id === vm.selectedChild.id) : vm.children;
  const head = dates.map((date) => {
    const label = attendanceDateLabel(date);
    const holiday = nationalHolidayForDate(date);
    return `<span><strong>${html(label.day)}</strong><small>${html(label.short)}${holiday ? ` · ${html(holiday)}` : ""}</small></span>`;
  }).join("");
  const rows = attendanceChildren.map((child) => {
    const summary = childSummary.get(child.id) || {};
    return `<div class="learn-attendance-row" data-attendance-child="${html(child.id)}">
      <div class="learn-attendance-student">
        <span style="background:${html(child.color)};">${html(child.initial)}</span>
        <strong>${html(child.name)}</strong>
        <small>${html(summary.instructionalDays || 0)} instructional day${Number(summary.instructionalDays || 0) === 1 ? "" : "s"}</small>
      </div>
      ${dates.map((date) => {
        const holiday = nationalHolidayForDate(date);
        const entry = byKey.get(`${child.id}::${date}`) || { status: holiday ? "holiday" : "present", minutes: 0, notes: holiday };
        const status = entry.status || "present";
        return `<button type="button" class="learn-attendance-cell is-${html(status)}" data-attendance-cell data-child-id="${html(child.id)}" data-date="${html(date)}" data-status="${html(status)}" data-default-status="${holiday ? "holiday" : "present"}" data-holiday-name="${html(holiday)}" data-minutes="${html(entry.minutes || "")}" data-notes="${html(entry.notes || holiday || "")}" aria-label="${html(`${child.name} ${date}: ${attendanceStatusLabel(status)}${holiday ? ` (${holiday})` : ""}`)}"><strong>${html(attendanceStatusMark(status))}</strong><small>${html(holiday && status === "holiday" ? holiday : attendanceStatusLabel(status))}</small></button>`;
      }).join("")}
    </div>`;
  }).join("");
  const guidance = `<div class="learn-attendance-guidance"><strong>Attendance is optional.</strong><span>Texas homeschools do not need this tracker, but families in states that require attendance can keep a clean household log here.</span></div>`;
  return `
    <section data-attendance-form class="learn-attendance-panel is-collapsed">
      <div class="learn-attendance-toolbar">
        <div>
          <small>${html(vm.selectedChild?.name || "Student")} Attendance</small>
          <h2>Weekly attendance log</h2>
          <em data-attendance-status aria-live="polite">Attendance card minimized. Mark the selected student's week present or expand for details.</em>
        </div>
        <div class="learn-attendance-actions">
          <button type="button" data-attendance-present-week>Mark Week Present</button>
          <button type="button" data-attendance-toggle aria-expanded="false">Expand</button>
          <button type="button" data-attendance-save>Save Attendance</button>
        </div>
      </div>
      <div class="learn-attendance-body" data-attendance-body hidden>
        ${guidance}
        <div class="learn-attendance-grid" style="--attendance-cols:${dates.length};">
          <div class="learn-attendance-head"><span></span>${head}</div>
          ${rows}
        </div>
        <div class="learn-attendance-legend">
          <span><b class="is-present">P</b> Present</span>
          <span><b class="is-absent">A</b> Absent</span>
          <span><b class="is-excused">E</b> Excused</span>
          <span><b class="is-holiday">H</b> Holiday</span>
        </div>
      </div>
    </section>`;
}

function renderGradeTermFields(course, grade) {
  return `
    <fieldset class="learn-grade-term" data-grade-term="${grade.termIndex}">
      <legend>Term ${grade.termIndex}</legend>
      <label>Score
        <input name="numericScore" inputmode="decimal" value="${html(grade.numericScore)}" placeholder="96" />
      </label>
      <label>Grade
        <select name="letterGrade">
          ${["", "A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F"].map((value) => gradeOption(value, grade.letterGrade)).join("")}
        </select>
      </label>
      <label>Attendance
        <input name="attendanceDays" inputmode="numeric" value="${html(grade.attendanceDays)}" placeholder="60" />
      </label>
      <label class="learn-grade-notes">Narrative notes
        <textarea name="teacherNotes" rows="3" placeholder="Narrative evaluation for this course and term">${html(grade.teacherNotes)}</textarea>
      </label>
    </fieldset>
  `;
}

function renderGradeCourseEditor(course, vm, index) {
  return `
    <article class="learn-grade-course" data-grade-course data-course-id="${html(course.id)}">
      <header>
        <span style="--course-color:${html(course.color)}">${html(String(index + 1))}</span>
        <div>
          <input name="courseTitle" value="${html(course.courseTitle)}" aria-label="Course title" />
          <small>${html(course.subjectCategory)} · Grade ${html(course.gradeLevel)} · ${html(course.creditHours)} credit${Number(course.creditHours) === 1 ? "" : "s"}${course.setupSeeded ? " · from Setup" : ""}</small>
        </div>
        <button type="button" data-grade-remove-course aria-label="Remove course">×</button>
      </header>
      <div class="learn-grade-course-meta">
        <label>Subject
          <select name="subjectCategory">
            ${vm.subjectCategories.map((category) => `<option value="${html(category)}" ${category === course.subjectCategory ? "selected" : ""}>${html(category)}</option>`).join("")}
          </select>
        </label>
        <label>Grade level
          <select name="gradeLevel">
            ${[9, 10, 11, 12].map((gradeLevel) => `<option value="${gradeLevel}" ${Number(course.gradeLevel) === gradeLevel ? "selected" : ""}>${gradeLevel}</option>`).join("")}
          </select>
        </label>
        <label>Credit hours
          <input name="creditHours" inputmode="decimal" value="${html(course.creditHours)}" />
        </label>
      </div>
      <div class="learn-grade-term-grid">
        ${course.grades.map((grade) => renderGradeTermFields(course, grade)).join("")}
      </div>
    </article>
  `;
}

function renderGrades(vm) {
  const selectedCourses = vm.childCourses;
  const readiness = vm.readiness || {};
  const childOptions = vm.children.map((child) => `<option value="${html(child.id)}" ${child.id === vm.selectedChildId ? "selected" : ""}>${html(child.name)}${child.gradeLabel ? ` · ${html(child.gradeLabel)}` : ""}</option>`).join("");
  const transcriptRows = selectedCourses.length ? selectedCourses.map((course) => {
    const finalGrade = [...course.grades].reverse().find((grade) => grade.letterGrade)?.letterGrade || "";
    return `<tr><th scope="row">${html(course.courseTitle)}</th><td>${html(course.subjectCategory)}</td><td>Grade ${html(course.gradeLevel)}</td><td>${html(course.creditHours)}</td><td>${html(finalGrade || "Open")}</td></tr>`;
  }).join("") : `<tr><td colspan="5">Add courses to begin transcript tracking.</td></tr>`;
  const body = `
    <section data-screen-label="Grades" class="learn-grades-page">
      <form data-grades-form>
        <div class="learn-grades-toolbar">
          <label>Student
            <select name="childId" data-grades-child>
              ${childOptions}
            </select>
          </label>
          <label>Academic year
            <input name="academicYearName" value="${html(vm.academicYear.name)}" />
          </label>
          <div class="learn-grades-actions">
            <button type="button" data-grade-add-course>Add Course</button>
            <button type="submit" data-grade-save>Save Grades</button>
          </div>
        </div>

        <div class="learn-grades-summary">
          <article><small>Student</small><strong>${html(vm.selectedChild.name || "Student")}</strong><span>${html(vm.selectedChild.gradeLabel || "High school records")}</span></article>
          <article><small>Courses</small><strong>${html(String(selectedCourses.length))}</strong><span>For selected student</span></article>
          <article><small>Credits Earned</small><strong data-grade-summary-credits>${html(vm.summary.totalCredits)}</strong><span>Transcript total</span></article>
          <article><small>Unweighted GPA</small><strong data-grade-summary-gpa>${html(vm.summary.cumulativeGpa)}</strong><span>4.0 scale</span></article>
          <article><small>Attendance</small><strong>${html(String(vm.summary.attendanceDays || 0))}</strong><span>Instructional days</span></article>
        </div>

        ${renderAttendanceTracker(vm)}

        <div data-grades-status class="learn-grades-status" aria-live="polite"></div>

        <div class="learn-grade-editor" data-grade-course-list>
          ${selectedCourses.length ? selectedCourses.map((course, index) => renderGradeCourseEditor(course, vm, index)).join("") : emptyState("No setup subjects are assigned to this student yet. Add subjects in Setup or add a course manually.")}
        </div>
      </form>

      ${panel("Transcript Readiness", `<div class="learn-grade-readiness"><article data-ready="${readiness.reportCardReady ? "true" : "false"}"><small>${html(readiness.reportCardTermLabel || "Current Term")}</small><strong>${readiness.reportCardReady ? "Report card ready" : "Report card waiting"}</strong><span>${readiness.reportCardReady ? "All assigned term subjects have grades." : `${html(String(readiness.reportCardMissing || 0))} assigned subject${Number(readiness.reportCardMissing || 0) === 1 ? "" : "s"} still need a term grade.`}</span></article><article data-ready="${readiness.transcriptReady ? "true" : "false"}"><small>School Year</small><strong>${readiness.transcriptReady ? "Transcript ready" : "Transcript waiting"}</strong><span>${readiness.transcriptReady ? "All assigned school-year subjects have grades." : `${html(String(readiness.transcriptMissing || 0))} course/term grade${Number(readiness.transcriptMissing || 0) === 1 ? "" : "s"} still missing.`}</span></article></div><div style="overflow:auto;"><table class="learn-grade-transcript-table"><thead><tr><th>Course</th><th>Subject</th><th>Level</th><th>Credit</th><th>Final</th></tr></thead><tbody>${transcriptRows}</tbody></table></div><div class="learn-grade-print-actions"><a href="${learnSectionHref("print-center")}">Open Print Center</a><button type="button" data-report-export="Report Card" data-report-ready="${readiness.reportCardReady ? "true" : "false"}" ${readiness.reportCardReady ? "" : "disabled"} title="${readiness.reportCardReady ? "Print the selected student's term report card" : "Enter grades for every assigned subject in the current term first"}">Print Report Card</button><button type="button" data-report-export="Transcript" data-report-ready="${readiness.transcriptReady ? "true" : "false"}" ${readiness.transcriptReady ? "" : "disabled"} title="${readiness.transcriptReady ? "Print the selected student's transcript" : "Complete the school-year grades first"}">Print Transcript</button></div>`, { icon: "▤" })}
    </section>
  `;
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
  return `<div data-setup-row="terms" data-id="${html(termId)}" style="display:grid;grid-template-columns:1fr .7fr .7fr .55fr auto auto;gap:10px;align-items:end;border:1px solid var(--line);border-radius:12px;background:var(--paper2);padding:12px;"><input type="hidden" name="id" value="${html(termId)}" />${setupInput("Term name", "label", term.label || `Term ${index + 1}`)}${setupInput("Start", "startDate", term.startDate || "", { type: "date" })}${setupInput("End", "endDate", term.endDate || "", { type: "date" })}${setupInput("Weeks", "weeksCount", term.weeksCount || 12, { type: "number" })}<button type="button" data-close-term="${html(termId)}" style="align-self:end;border:1px solid var(--gold);background:#fbf2dd;color:var(--ink);border-radius:9px;padding:10px 12px;font-family:inherit;font-weight:700;">Close Term</button>${setupRemoveButton()}</div>`;
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
  { value: "science", label: "Science" },
  { value: "social-studies", label: "Social Studies" },
  { value: "fine-arts", label: "Fine Arts" },
  { value: "health-education", label: "Health Education" },
  { value: "physical-education", label: "Physical Education (PE)" },
  { value: "technology-applications", label: "Technology Applications" },
  { value: "languages-other-than-english", label: "Languages Other Than English (LOTE)" },
  { value: "career-technical-education", label: "Career and Technical Education (CTE)" },
  { value: "speech-communication", label: "Speech/Communication" },
  { value: "custom", label: "Custom" }
];

const graceModeOptions = [
  { value: "core", label: "1 Core: chosen first in every mode" },
  { value: "high", label: "2 High: keep after Core" },
  { value: "medium", label: "3 Medium: keep if the cap has room" },
  { value: "low", label: "4 Low: first moved to reserve" }
];

function setupGracePriorityValue(value = "core") {
  const normalized = String(value || "").toLowerCase().replace(/[-_]+/g, " ").trim();
  if (normalized === "keep" || normalized === "always keep") return "core";
  if (normalized === "important") return "high";
  if (normalized === "reduce first" || normalized === "shorten" || normalized === "helpful") return "medium";
  if (normalized === "bump if needed" || normalized === "defer if needed" || normalized === "minimum only" || normalized === "optional") return "low";
  return ["core", "high", "medium", "low"].includes(normalized) ? normalized : "core";
}

function setupGraceModeBehavior(value = "core") {
  return `<span class="learn-grace-behavior-field">${setupSelect("Grace priority", "gracePriority", setupGracePriorityValue(value), graceModeOptions)}<small>Full runs all scheduled work. Medium keeps up to 4 ranked child subjects per day. Light keeps up to 2 and turns kept work into short touchpoints.</small></span>`;
}

const schedulingModeOptions = [
  { value: "fixed", label: "Fixed days" },
  { value: "weekly-target", label: "Weekly target" },
  { value: "term-target", label: "Term target" },
  { value: "loop", label: "Loop schedule" },
  { value: "date-range", label: "Date range" }
];

const lessonPriorityOptions = [
  { value: "essential", label: "Essential" },
  { value: "important", label: "Important" },
  { value: "enrichment", label: "Enrichment" },
  { value: "optional", label: "Optional" }
];

const missedLessonOptions = [
  { value: "next-school-day", label: "Move to next school day" },
  { value: "next-occurrence", label: "Move to next scheduled occurrence" },
  { value: "end-of-term", label: "Add to end of term" },
  { value: "leave-incomplete", label: "Leave incomplete" },
  { value: "skip", label: "Skip automatically" },
  { value: "ask", label: "Ask each time" }
];

const instructionModeOptions = [
  { value: "parent-led", label: "Parent-led" },
  { value: "independent", label: "Independent" },
  { value: "shared", label: "Shared / together" }
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

const simpleScheduleOptions = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" }
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
    weekly: ["wed"],
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

const DEFAULT_TERM_WEEK_COUNT = 12;

function scheduledTermWeeks(value, totalWeeks = DEFAULT_TERM_WEEK_COUNT) {
  const direct = Array.isArray(value) ? value : String(value || "").split(",");
  const selected = direct
    .map((week) => Number.parseInt(week, 10))
    .filter((week) => Number.isInteger(week) && week >= 1 && week <= totalWeeks);
  return selected.length ? [...new Set(selected)].sort((a, b) => a - b) : Array.from({ length: totalWeeks }, (_, index) => index + 1);
}

function termWeekSummary(weeks = [], totalWeeks = DEFAULT_TERM_WEEK_COUNT) {
  const selected = scheduledTermWeeks(weeks, totalWeeks);
  if (selected.length === totalWeeks) return `All ${totalWeeks} weeks`;
  if (!selected.length) return "Choose weeks";
  const ranges = [];
  let start = selected[0];
  let previous = selected[0];
  for (const week of selected.slice(1)) {
    if (week === previous + 1) { previous = week; continue; }
    ranges.push(start === previous ? `${start}` : `${start}-${previous}`);
    start = previous = week;
  }
  ranges.push(start === previous ? `${start}` : `${start}-${previous}`);
  return `Weeks ${ranges.join(", ")}`;
}

function setupTermWeekPicker(value, totalWeeks = DEFAULT_TERM_WEEK_COUNT) {
  const selected = scheduledTermWeeks(value, totalWeeks);
  return `<details class="learn-day-picker learn-term-week-picker"><summary><span>Term weeks</span><strong data-term-week-summary>${html(termWeekSummary(selected, totalWeeks))}</strong></summary><div class="learn-day-picker-menu" style="grid-template-columns:repeat(4,minmax(54px,1fr));">${Array.from({ length: totalWeeks }, (_, index) => index + 1).map((week) => `<label><input type="checkbox" data-term-week-choice value="${week}" ${selected.includes(week) ? "checked" : ""}>W${week}</label>`).join("")}</div><div style="display:flex;gap:8px;padding:8px 10px 2px;"><button type="button" data-term-weeks-all class="learn-add-button" style="padding:6px 10px;">All weeks</button><button type="button" data-term-weeks-odd class="learn-add-button" style="padding:6px 10px;">Odd weeks</button><button type="button" data-term-weeks-even class="learn-add-button" style="padding:6px 10px;">Even weeks</button></div><input type="hidden" name="scheduledWeeks" value="${html(selected.join(","))}"></details>`;
}

function setupSourceInput(label, name, value = "") {
  const resolved = String(value || "").trim();
  const link = /^https?:\/\//i.test(resolved)
    ? `<a href="${html(resolved)}" target="_blank" rel="noopener noreferrer" class="learn-source-link">Open source</a>`
    : "";
  return `<label>${html(label)}<input type="text" name="${html(name)}" value="${html(resolved)}" inputmode="url" placeholder="Book title, source note, or https://..." />${link}</label>`;
}

function resourceFieldName(index, field) {
  return `resources.${index}.${field}`;
}

function setupResourceWeekPicker(index, scheduledWeeks = [], totalWeeks = DEFAULT_TERM_WEEK_COUNT) {
  const selected = scheduledTermWeeks(scheduledWeeks, totalWeeks);
  const allWeeks = selected.length === totalWeeks;
  const summary = allWeeks ? "All weeks" : termWeekSummary(selected, totalWeeks);
  const name = resourceFieldName(index, "scheduledWeeks");
  return `<details class="learn-day-picker learn-term-week-picker learn-resource-week-picker" data-resource-week-picker="${index}"><summary><span>Active weeks</span><strong data-term-week-summary>${html(summary)}</strong></summary><div class="learn-day-picker-menu" style="grid-template-columns:repeat(4,minmax(54px,1fr));">${Array.from({ length: totalWeeks }, (_, i) => i + 1).map((week) => `<label><input type="checkbox" data-term-week-choice value="${week}" ${selected.includes(week) ? "checked" : ""}>W${week}</label>`).join("")}</div><div style="display:flex;gap:8px;padding:8px 10px 2px;"><button type="button" data-term-weeks-all class="learn-add-button" style="padding:6px 10px;">All</button><button type="button" data-term-weeks-odd class="learn-add-button" style="padding:6px 10px;">Odd</button><button type="button" data-term-weeks-even class="learn-add-button" style="padding:6px 10px;">Even</button></div><input type="hidden" data-resource-field="scheduledWeeks" name="${html(name)}" value="${html(selected.join(","))}"></details>`;
}

function setupResourceWeeklyPlanFields(index, value = []) {
  const entries = Array.isArray(value) ? value : String(value || "").split("|");
  return `<div class="learn-weekly-plan-grid">${Array.from({ length: DEFAULT_TERM_WEEK_COUNT }, (_, weekIndex) => `<label>Week ${weekIndex + 1}<input type="text" data-resource-field="weeklyPlans.${weekIndex + 1}" name="${html(resourceFieldName(index, `weeklyPlans.${weekIndex + 1}`))}" value="${html(entries[weekIndex] || "")}" placeholder="Ch. 1, pp. 4-9, lesson 2..." /></label>`).join("")}</div>`;
}

function setupResourcePlanningModePicker(index, item = {}, children = [], groupingMode = "forms") {
  const label = groupingMode === "grades" ? "Grades / levels" : "Forms";
  const groupOptions = setupGroupOptions(children, groupingMode);
  const selected = Array.isArray(item.formLabels)
    ? item.formLabels
    : String(item.formLabels || item.formLabel || "").split(",");
  const selectedGroups = [...new Set(selected.map((value) => String(value || "").trim()).filter(Boolean))];
  const familyBased = (item.planningMode || "forms") !== "forms" || !selectedGroups.length;
  const summary = familyBased
    ? "Family-Based"
    : `${groupingMode === "grades" ? "Grade-Based" : "Forms-Based"}: ${selectedGroups.join(", ")}`;
  return `<details class="learn-day-picker learn-planning-mode-picker" data-planning-group-label="${html(groupingMode === "grades" ? "Grade-Based" : "Forms-Based")}"><summary><span>${html(label)}</span><strong data-planning-mode-summary>${html(summary)}</strong></summary><div class="learn-day-picker-menu">${groupOptions.map((option) => `<label><input type="checkbox" data-planning-form-choice value="${html(option)}" ${selectedGroups.includes(option) ? "checked" : ""}>${html(option)}</label>`).join("")}</div><input type="hidden" data-planning-mode-field data-resource-field="planningMode" name="${html(resourceFieldName(index, "planningMode"))}" value="${familyBased ? "family" : "forms"}"><input type="hidden" data-form-label-field data-resource-field="formLabel" name="${html(resourceFieldName(index, "formLabel"))}" value="${html(selectedGroups[0] || "")}"><input type="hidden" data-form-labels-field data-resource-field="formLabels" name="${html(resourceFieldName(index, "formLabels"))}" value="${html(selectedGroups.join(","))}"><input type="hidden" data-grade-label-field data-resource-field="gradeLabel" name="${html(resourceFieldName(index, "gradeLabel"))}" value="${html(groupingMode === "grades" ? selectedGroups[0] || "" : item.gradeLabel || "")}"></details>`;
}

function setupResourceChildPicker(index, children = [], selectedIds = []) {
  const selected = Array.isArray(selectedIds)
    ? selectedIds
    : String(selectedIds || "").split(",").map((value) => value.trim()).filter(Boolean);
  const summary = selected.length
    ? children.filter((child) => selected.includes(child.id)).map((child) => child.name || child.firstName || child.id).join(", ")
    : "Use Forms";
  return `<details class="learn-day-picker learn-child-multi-picker"><summary><span>Specific children</span><strong data-child-multi-summary>${html(summary)}</strong></summary><div class="learn-day-picker-menu">${children.map((child) => `<label><input type="checkbox" data-child-multi-choice value="${html(child.id)}" ${selected.includes(child.id) ? "checked" : ""}>${html(child.name || child.firstName || child.id)}</label>`).join("")}</div><input type="hidden" data-child-ids-field data-resource-field="childIds" name="${html(resourceFieldName(index, "childIds"))}" value="${html(selected.join(","))}"></details>`;
}

function setupResourcePlanningCard(index, resource = {}, children = [], groupingMode = "forms") {
  return `<details class="learn-weekly-plan-fields learn-resource-plan-fields"><summary><span>Weekly chapters / lessons / pages</span><strong>${html(termWeekSummary(resource.scheduledWeeks || []))}</strong></summary><div class="learn-resource-plan-controls">${setupResourceWeekPicker(index, resource.scheduledWeeks || [])}${setupResourcePlanningModePicker(index, resource, children, groupingMode)}${setupResourceChildPicker(index, children, resource.childIds || [])}</div>${setupResourceWeeklyPlanFields(index, resource.weeklyPlans || [])}</details>`;
}

function normalizeSetupResource(resource, subject = {}) {
  const raw = typeof resource === "string" ? { title: resource } : (resource || {});
  return {
    title: String(raw.title || raw.resource || ""),
    scheduledWeeks: raw.scheduledWeeks || subject.scheduledWeeks || [],
    weeklyPlans: raw.weeklyPlans || subject.weeklyPlans || [],
    planningMode: raw.planningMode || subject.planningMode || "forms",
    formLabel: raw.formLabel || subject.formLabel || "",
    formLabels: Array.isArray(raw.formLabels) && raw.formLabels.length ? raw.formLabels : (Array.isArray(subject.formLabels) ? subject.formLabels : []),
    gradeLabel: raw.gradeLabel || subject.gradeLabel || "",
    childIds: Array.isArray(raw.childIds) && raw.childIds.length ? raw.childIds : (Array.isArray(subject.childIds) ? subject.childIds : [])
  };
}

function setupResourceRow(resource = {}, index = 0, children = [], groupingMode = "forms") {
  const resolved = String(resource.title || "").trim();
  const link = /^https?:\/\//i.test(resolved)
    ? `<a href="${html(resolved)}" target="_blank" rel="noopener noreferrer" class="learn-source-link">Open</a>`
    : "";
  const removeBtn = index > 0
    ? `<button type="button" data-remove-resource aria-label="Remove resource">×</button>`
    : "";
  const summary = termWeekSummary(resource.scheduledWeeks || []);
  return `<div data-resource-row="${index}" class="learn-resource-card">
    <div class="learn-resource-card-summary">
      <small>${html(index === 0 ? "Book / source / resource" : `Resource ${index + 1}`)}</small>
      <strong data-resource-summary-title>${html(resolved || "Untitled resource")}</strong>
      <span data-resource-summary-detail>${html(summary)}</span>
      ${link}
    </div>
    <div class="learn-resource-card-actions"><button type="button" data-edit-resource>Edit</button>${removeBtn}</div>
    <div class="learn-resource-modal" data-resource-modal hidden>
      <div class="learn-resource-modal-card">
        <button type="button" class="learn-family-modal-close" data-resource-modal-close aria-label="Close">×</button>
        <small>${html(index === 0 ? "Book / source / resource" : `Resource ${index + 1}`)}</small>
        <h2>Resource details</h2>
        <label>Title, source note, or URL<input type="text" data-resource-field="title" name="${html(resourceFieldName(index, "title"))}" value="${html(resolved)}" inputmode="url" placeholder="Book title, source note, or https://..." /></label>
        <div class="learn-resource-card-plan">${setupResourcePlanningCard(index, resource, children, groupingMode)}</div>
        <div class="learn-family-modal-actions"><button type="button" data-resource-modal-close>Cancel</button><button type="button" data-resource-modal-save>Save resource</button></div>
      </div>
    </div>
  </div>`;
}

function setupResourceList(resources = [], children = [], groupingMode = "forms", subject = {}) {
  // resources: array of {title, scheduledWeeks} objects, or plain strings (legacy)
  const entries = Array.isArray(resources) && resources.length ? resources : [{ title: "", scheduledWeeks: [] }];
  const normalised = entries.map((entry) => normalizeSetupResource(entry, subject));
  const rows = normalised.map((resource, index) => setupResourceRow(resource, index, children, groupingMode)).join("");
  return `<div data-resource-list class="learn-resource-list">${rows}<button type="button" data-add-resource>+ Add resource</button></div>`;
}

function setupWeeklyPlanFields(value = []) {
  const entries = Array.isArray(value) ? value : String(value || "").split("|");
  return `<details class="learn-weekly-plan-fields"><summary><span>Weekly chapters / lessons / pages</span><strong>Optional</strong></summary>${setupWeeklyPlanGrid(entries)}</details>`;
}

function setupWeeklyPlanGrid(value = []) {
  const entries = Array.isArray(value) ? value : String(value || "").split("|");
  return `<div class="learn-weekly-plan-grid">${Array.from({ length: DEFAULT_TERM_WEEK_COUNT }, (_, index) => `<label>Week ${index + 1}<input type="text" name="weeklyPlans.${index + 1}" value="${html(entries[index] || "")}" placeholder="Ch. 1, pp. 4-9, lesson 2..." /></label>`).join("")}</div>`;
}

function setupPlannerRulesPanel(item = {}, options = {}) {
  const includeRange = options.range !== false;
  const includeWeeklyPlans = Boolean(options.weeklyPlans);
  const rangeLabel = item.progressionType || options.progressionType || "lessons";
  const weeklyPlanFields = includeWeeklyPlans
    ? setupWeeklyPlanGrid(item.weeklyPlans || [])
    : "";
  return `<details class="learn-weekly-plan-fields"><summary><span>Planner rules</span><strong>Optional</strong></summary>
    <div style="display:grid;gap:12px;">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;">
        ${setupDayPicker(item.scheduledDays, item.weeklyFrequency || item.cadenceLabel || item.cadence || "daily")}
        ${setupInput("Weekly target", "weeklyTarget", item.weeklyTarget || "", { type: "number" })}
        ${setupInput("Term target", "termTarget", item.termTarget || "", { type: "number" })}
        ${setupInput("Starts", "activeStartDate", item.activeStartDate || "", { type: "date" })}
        ${setupInput("Ends", "activeEndDate", item.activeEndDate || "", { type: "date" })}
      </div>
      ${includeRange ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;">
        ${setupInput(`Start ${rangeLabel}`, "startNumber", item.startNumber || "", { type: "number" })}
        ${setupInput(`Done ${rangeLabel}`, "currentNumber", item.currentNumber || item.completedThroughNumber || "", { type: "number" })}
        ${setupInput(`End ${rangeLabel}`, "endNumber", item.endNumber || "", { type: "number" })}
      </div>` : ""}
      ${weeklyPlanFields}
    </div>
  </details>`;
}

function setupPlanningModePicker(item = {}, children = [], groupingMode = "forms") {
  const label = groupingMode === "grades" ? "Grades / levels" : "Forms";
  const groupOptions = setupGroupOptions(children, groupingMode);
  const selected = Array.isArray(item.formLabels)
    ? item.formLabels
    : String(item.formLabels || item.formLabel || "").split(",");
  const selectedGroups = [...new Set(selected.map((value) => String(value || "").trim()).filter(Boolean))];
  const familyBased = (item.planningMode || "family") !== "forms" || !selectedGroups.length;
  const summary = familyBased
    ? "Family-Based"
    : `${groupingMode === "grades" ? "Grade-Based" : "Forms-Based"}: ${selectedGroups.join(", ")}`;
  return `<details class="learn-day-picker learn-planning-mode-picker" data-planning-group-label="${html(groupingMode === "grades" ? "Grade-Based" : "Forms-Based")}"><summary><span>Planning Mode</span><strong data-planning-mode-summary>${html(summary)}</strong></summary><div class="learn-day-picker-menu">${groupOptions.map((option) => `<label><input type="checkbox" data-planning-form-choice value="${html(option)}" ${selectedGroups.includes(option) ? "checked" : ""}>${html(option)}</label>`).join("")}</div><input type="hidden" name="planningMode" value="${familyBased ? "family" : "forms"}"><input type="hidden" name="formLabel" value="${html(selectedGroups[0] || "")}"><input type="hidden" name="formLabels" value="${html(selectedGroups.join(","))}"><input type="hidden" name="gradeLabel" value="${html(groupingMode === "grades" ? selectedGroups[0] || "" : item.gradeLabel || "")}"></details>`;
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

function setupMultiChildPicker(children = [], selectedIds = []) {
  // Normalise: selectedIds may be a comma-joined string or an array
  const selected = Array.isArray(selectedIds)
    ? selectedIds
    : String(selectedIds || "").split(",").map((v) => v.trim()).filter(Boolean);
  const summary = selected.length
    ? children.filter((child) => selected.includes(child.id)).map((child) => child.name || child.firstName || child.id).join(", ")
    : "Use Form Assignment";
  return `<details class="learn-day-picker learn-child-multi-picker"><summary><span>Specific children</span><strong data-child-multi-summary>${html(summary)}</strong></summary><div class="learn-day-picker-menu">${children.map((child) => `<label><input type="checkbox" data-child-multi-choice value="${html(child.id)}" ${selected.includes(child.id) ? "checked" : ""}>${html(child.name || child.firstName || child.id)}</label>`).join("")}</div><input type="hidden" name="childIds" value="${html(selected.join(","))}"></details>`;
}

function childSetupRow(child = {}, groupingMode = "forms") {
  const groupingField = groupingMode === "forms"
    ? setupSelect("Form", "formLabel", child.formLabel || child.form || "", formOptions)
    : `<input type="hidden" name="formLabel" value="${html(child.formLabel || child.form || "")}" />`;
  return `<div data-setup-row="children" data-id="${html(child.id || "")}" class="learn-family-row learn-child-row"><span class="learn-child-monogram" style="background:${html(child.color || colorChoices[0])};">${html((child.firstName || child.name || "C").charAt(0))}</span>${setupInput("Child name", "firstName", child.firstName || child.name || "")}${setupInput("Age", "ageYears", child.age || "", { type: "number" })}${setupInput("Grade / level", "gradeLabel", child.gradeLabel || child.grade || "")}${groupingField}${setupColorSelect("Color", "color", child.color || colorChoices[0])}${setupRemoveButton()}</div>`;
}

function subjectSetupRow(subject = {}, children = [], terms = [], currentTermId = "", groupingMode = "forms", tileMinutes = "") {
  const minutes = subject.minutes || tileMinutes || "20";
  return `<div data-setup-row="subjects" data-id="${html(subject.id || "")}" class="learn-setup-row learn-setup-row-subject"><div class="learn-setup-row-main"><div class="learn-setup-row-identity">${setupInput("Subject / skill", "title", subject.title || "")}${setupSelect("Schedule type", "weeklyFrequency", subject.weeklyFrequency === "1x" ? "weekly" : subject.weeklyFrequency || subject.cadenceLabel || "daily", simpleScheduleOptions)}${setupRemoveButton()}</div>${setupResourceList(subject.resources?.length ? subject.resources : (subject.resource ? [{ title: subject.resource, scheduledWeeks: [] }] : []), children, groupingMode, subject)}<input type="hidden" name="minutes" value="${html(minutes)}" /><input type="hidden" name="subjectType" value="${html(subject.subjectType || subject.type || "custom")}" /><input type="hidden" name="instructionMode" value="${html(subject.instructionMode || "parent-led")}" /><input type="hidden" name="resourceType" value="${html(subject.resourceType || subject.sourceType || (subject.resource ? "curriculum" : "none"))}" /><input type="hidden" name="schedulingMode" value="fixed" /><input type="hidden" name="progressionType" value="${html(subject.progressionType || "lessons")}" /><input type="hidden" name="priorityLevel" value="${html(subject.priorityLevel || "important")}" /></div><div class="learn-setup-row-meta">${setupSelect("Term", "termId", subject.termId || currentTermId, setupTermOptions(terms, { id: currentTermId, label: "Current Term" }))}${setupTermWeekPicker(subject.scheduledWeeks)}${setupPlannerRulesPanel(subject)}${setupSelect("If missed", "missedLessonBehavior", subject.missedLessonBehavior || "next-occurrence", missedLessonOptions)}${setupInput("Credits", "credits", subject.credits || "", { type: "number", step: "0.25" })}${setupInput("Final mark", "finalGradeOverride", subject.finalGradeOverride || "")}${setupColorSelect("Planner Color", "color", subject.color || colorChoices[0])}${setupGraceModeBehavior(subject.gracePriority || "core")}<span class="learn-setup-grace-note">${setupInput("Grace Mode note", "graceNote", subject.graceNote || "Deferred gracefully to the reserve list.")}</span></div></div>`;
}

function bookSetupRow(book = {}, terms = [], currentTermId = "") {
  return `<div data-setup-row="books" data-id="${html(book.id || "")}" style="display:grid;grid-template-columns:1.1fr .9fr .7fr .75fr .55fr .55fr .55fr .75fr auto;gap:10px;align-items:end;border:1px solid var(--line);border-radius:12px;background:var(--paper2);padding:12px;">${setupInput("Title", "title", book.title || "")}${setupInput("Author", "author", book.author || "")}${setupInput("Category", "category", book.category || "")}${setupSelect("Planning Mode", "planningMode", book.planningMode || (book.formLabel ? "forms" : "family"), planningModeOptions)}${setupInput("Start Ch.", "startChapter", book.startChapter || "", { type: "number" })}${setupInput("Done Ch.", "currentChapter", book.currentChapter ?? book.startChapter ?? "", { type: "number" })}${setupInput("End Ch.", "endChapter", book.endChapter || book.totalChapters || "", { type: "number" })}${setupColorSelect("Planner Color", "color", book.color || colorChoices[2])}${setupRemoveButton()}<div style="grid-column:1 / -1;display:grid;grid-template-columns:repeat(5,minmax(120px,1fr));gap:10px;">${setupSelect("Term", "termId", book.termId || currentTermId, setupTermOptions(terms, { id: currentTermId, label: "Current Term" }))}${setupSelect("Form", "formLabel", book.formLabel || "", [{ value: "", label: "All Forms" }, ...formOptions])}${setupSelect("Frequency", "weeklyFrequency", book.weeklyFrequency || "daily", weeklyFrequencyOptions)}${setupTermWeekPicker(book.scheduledWeeks)}${setupSelect("Audience", "audienceLabel", book.audienceLabel || "Household", ["Household", "Morning Basket", "Independent", "Read-Aloud"])}${setupInput("Minutes", "minutes", book.minutes || "20", { type: "number" })}${setupInput("Grace Note", "graceNote", book.graceNote || "Reading moved into the reserve basket.")}</div></div>`;
}

function formationSetupRow(material = {}, terms = [], currentTermId = "") {
  return `<div data-setup-row="formationMaterials" data-id="${html(material.id || "")}" style="display:grid;grid-template-columns:1.1fr .75fr 1fr .75fr .65fr .75fr .8fr auto;gap:10px;align-items:end;border:1px solid var(--line);border-radius:12px;background:var(--paper2);padding:12px;">${setupInput("Material", "title", material.title || "")}${setupSelect("Preset", "materialType", material.materialType || "Catechesis", ["Catechesis", "Art Study", "Poetry", "Music Study"])}${setupInput("Source", "source", material.source || "")}${setupSelect("Planning Mode", "planningMode", material.planningMode || "family", planningModeOptions)}${setupSelect("Frequency", "weeklyFrequency", material.weeklyFrequency || material.cadence || "1x", weeklyFrequencyOptions)}${setupTermWeekPicker(material.scheduledWeeks)}${setupSelect("Term", "termId", material.termId || currentTermId, setupTermOptions(terms, { id: currentTermId, label: "Current Term" }))}${setupInput("Minutes", "minutes", material.minutes || "", { type: "number" })}${setupColorSelect("Term Color", "color", material.color || colorChoices[3])}${setupRemoveButton()}</div>`;
}

function formationRhythmSetupRow(rhythm = {}) {
  return `<div data-setup-row="formationRhythms" data-id="${html(rhythm.id || "")}" style="display:grid;grid-template-columns:1fr 1.15fr .65fr .45fr auto;gap:10px;align-items:end;border:1px solid var(--line);border-radius:12px;background:var(--paper2);padding:12px;">${setupInput("Rhythm", "title", rhythm.title || "")}${setupInput("Note", "note", rhythm.note || "")}${setupSelect("Frequency", "weeklyFrequency", rhythm.weeklyFrequency || rhythm.cadenceLabel || rhythm.cadence || "daily", weeklyFrequencyOptions)}${setupInput("Minutes", "minutes", rhythm.minutes || rhythm.minutesPlanned || "", { type: "number" })}${setupRemoveButton()}</div>`;
}

function formationRecitationSetupRow(track = {}, children = [], groupingMode = "forms") {
  return `<div data-setup-row="formationRecitation" data-id="${html(track.id || "")}" style="display:grid;grid-template-columns:1fr .85fr .95fr .65fr .85fr .55fr auto;gap:10px;align-items:end;border:1px solid var(--line);border-radius:12px;background:var(--paper2);padding:12px;">${setupInput("Memory Work", "title", track.title || "")}${setupInput("Source", "sourceKind", track.sourceKind || track.source || "")}${setupPlanningModePicker(track, children, groupingMode)}${setupSelect("Frequency", "weeklyFrequency", track.weeklyFrequency || "daily", weeklyFrequencyOptions)}${setupTermWeekPicker(track.scheduledWeeks)}${setupInput("Minutes", "minutes", track.minutes || "", { type: "number" })}${setupRemoveButton()}</div>`;
}

function formationEnrichmentSetupRow(block = {}, children = [], terms = [], currentTermId = "", groupingMode = "forms", tileMinutes = "") {
  const minutes = block.minutesPlanned || block.minutes || tileMinutes || "20";
  return `<div data-setup-row="formationEnrichment" data-id="${html(block.id || "")}" class="learn-setup-row learn-setup-row-enrichment"><div class="learn-setup-row-main">${setupSelect("Formation card", "blockType", block.blockType || block.type || "Art Study", ["Catechesis", "Recitation & Memory Work", "Saints & Feasts", "Icon Study", "Hymn Study", "Art Study", "Music Study", "Folk Songs", "Poetry", "Shakespeare", "Nature Study", "Composer", "Timeline"])}${setupSourceInput("Source", "title", block.title || block.resource || block.source || "")}${setupPlanningModePicker(block, children, groupingMode)}${setupSelect("Schedule type", "weeklyFrequency", block.weeklyFrequency === "1x" ? "weekly" : block.weeklyFrequency || block.cadenceLabel || block.cadence || "weekly", simpleScheduleOptions)}${setupRemoveButton()}<input type="hidden" name="minutesPlanned" value="${html(minutes)}" /><input type="hidden" name="instructionMode" value="${html(block.instructionMode || "shared")}" /><input type="hidden" name="resourceType" value="${html(block.resourceType || block.sourceType || (block.resource || block.source ? "curriculum" : "none"))}" /><input type="hidden" name="schedulingMode" value="fixed" /><input type="hidden" name="progressionType" value="${html(block.progressionType || "lessons")}" /><input type="hidden" name="priorityLevel" value="${html(block.priorityLevel || "enrichment")}" /></div><div class="learn-setup-row-meta">${setupSelect("Term", "termId", block.termId || currentTermId, setupTermOptions(terms, { id: currentTermId, label: "Current Term" }))}${setupTermWeekPicker(block.scheduledWeeks)}${setupPlannerRulesPanel(block, { weeklyPlans: true })}${setupMultiChildPicker(children, block.childIds || (block.childId ? [block.childId] : []))}${setupSelect("If missed", "missedLessonBehavior", block.missedLessonBehavior || "next-occurrence", missedLessonOptions)}${setupInput("Credits", "credits", block.credits || "", { type: "number", step: "0.25" })}${setupInput("Final mark", "finalGradeOverride", block.finalGradeOverride || "")}${setupColorSelect("Planner Color", "color", block.color || colorChoices[2])}${setupGraceModeBehavior(block.gracePriority || "medium")}<span class="learn-setup-grace-note">${setupInput("Grace Mode note", "graceNote", block.graceNote || "Deferred gracefully to the reserve list.")}</span></div></div>`;
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
    detail: tile.detail || fallback.detail,
    minutes: tile.minutes || fallback.minutes || "20"
  };
}

function setupSectionCard({ group, panel: panelId, title, detail, count = 0, icon = "✥" }) {
  const controls = `learnSetupPanel-${group}-${panelId}`;
  const countLabel = count ? `${count} item${count === 1 ? "" : "s"}` : "Open";
  return `<button type="button" class="learn-setup-section-card" data-setup-section-toggle data-setup-section-group="${html(group)}" data-setup-section-panel="${html(panelId)}" aria-expanded="false" aria-controls="${html(controls)}"><small><span class="learn-setup-card-icon" aria-hidden="true">${html(icon)}</span><span>${html(countLabel)}</span></small><strong data-setup-section-card-title>${html(title)}</strong><span data-setup-section-card-detail>${html(detail)}</span><em>Open</em></button>`;
}

function setupSectionPanel({ group, panel: panelId, title, detail = "", minutes = "20", content }) {
  const id = `learnSetupPanel-${group}-${panelId}`;
  const hasTileMinutes = group === "subjects" || (group === "formation" && panelId !== "recitation");
  return `<div id="${html(id)}" class="learn-setup-subsection" data-setup-section-group="${html(group)}" data-setup-section-panel="${html(panelId)}" hidden><div class="learn-setup-subsection-header"><div><strong data-setup-section-panel-title>${html(title)}</strong>${detail ? `<span data-setup-section-panel-detail>${html(detail)}</span>` : ""}</div><button type="button" class="learn-setup-subsection-close" data-setup-section-close data-setup-section-group="${html(group)}" data-setup-section-panel="${html(panelId)}">Collapse</button></div><div class="learn-setup-tile-editor"><label>Tile title<input name="setupTiles.${html(group)}.${html(panelId)}.title" data-setup-section-title-input data-setup-section-group="${html(group)}" data-setup-section-panel="${html(panelId)}" value="${html(title)}" /></label><label>Tile description<textarea name="setupTiles.${html(group)}.${html(panelId)}.detail" data-setup-section-detail-input data-setup-section-group="${html(group)}" data-setup-section-panel="${html(panelId)}" rows="2">${html(detail)}</textarea></label>${hasTileMinutes ? `<label>Minutes<input type="number" name="setupTiles.${html(group)}.${html(panelId)}.minutes" data-setup-section-minutes-input value="${html(minutes || "20")}" /></label>` : ""}</div>${content}</div>`;
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
    ? (section.rows.length ? section.rows : [{}]).map((track) => formationRecitationSetupRow(track, vm.children, vm.preferences.groupingMode)).join("")
    : (enrichmentBlocks.filter((block) => String(block.blockType || block.type || "").toLowerCase() === section.type.toLowerCase()).length
      ? enrichmentBlocks.filter((block) => String(block.blockType || block.type || "").toLowerCase() === section.type.toLowerCase())
      : [{ blockType: section.type }]).map((block) => formationEnrichmentSetupRow({ ...block, blockType: block.blockType || section.type }, vm.children, vm.terms, currentTermId, vm.preferences.groupingMode, section.minutes)).join("");
  const sectionContent = (section) => section.rowKind === "recitation"
    ? `<div data-setup-list="formationRecitation" style="display:grid;gap:10px;">${sectionRows(section)}</div><button type="button" data-setup-add-row="formationRecitation" style="border:1px solid var(--line);background:var(--paper2);border-radius:10px;padding:10px 16px;font-family:inherit;">Add Recitation</button>`
    : `<div id="learnSetupFormation-${html(section.panel)}" data-setup-list="formationEnrichment" style="display:grid;gap:10px;">${sectionRows(section)}</div><button type="button" data-setup-add-row="formationEnrichment" data-setup-add-target="learnSetupFormation-${html(section.panel)}" data-setup-add-block-type="${html(section.type)}" style="border:1px solid var(--line);background:var(--paper2);border-radius:10px;padding:10px 16px;font-family:inherit;">Add ${html(section.title)}</button>`;
  return `
    <div style="display:grid;gap:14px;">
      <p style="margin:0;color:var(--muted);line-height:1.45;">Each tile is a planning basket. Open the tile you want, add the books, recitations, hymns, poets, artists, or other enrichment you want available, then choose whether each item is shared by the whole family or assigned by ${vm.preferences.groupingMode === "grades" ? "grade" : "Form"}.</p>
      <p class="learn-setup-helper-note"><strong>How this becomes a week:</strong> These enrichment items become draggable subject cards in the Planner Week view. You will be able to drag each one into the day you want, then add chapters, pages, lessons, or notes for that specific day without changing Setup.</p>
      <div class="learn-setup-section-grid">${sections.map((section) => setupSectionCard({ group: "formation", ...section, count: section.rowKind === "recitation" ? section.rows.length : countByType(section.type) })).join("")}</div>
      ${sections.map((section) => setupSectionPanel({ group: "formation", panel: section.panel, title: section.title, detail: section.detail, minutes: section.minutes, content: sectionContent(section) })).join("")}
    </div>`;
}

function formSubjectsSetupPanel(vm, currentTermId) {
  const subjects = vm.subjects || [];
  const standardGroups = [
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
  ];
  const teksFoundationGroups = [
    {
      panel: "teks-elar",
      title: "English Language Arts and Reading (ELAR)",
      detail: "Reading, writing, speaking, listening, composition, grammar, and literacy foundations.",
      icon: "✎",
      types: ["language-arts", "tales", "literature"],
      defaultType: "language-arts"
    },
    {
      panel: "teks-mathematics",
      title: "Mathematics",
      detail: "Number sense, operations, algebraic reasoning, geometry, measurement, data, and problem solving.",
      icon: "◎",
      types: ["math", "maths"],
      defaultType: "math"
    },
    {
      panel: "teks-science",
      title: "Science",
      detail: "Scientific practices, lab work, earth and space, life science, physical science, and nature study.",
      icon: "✦",
      types: ["science", "sciences-nature", "nature-study"],
      defaultType: "science"
    },
    {
      panel: "teks-social-studies",
      title: "Social Studies",
      detail: "History, geography, civics, economics, cultures, citizenship, timelines, and primary sources.",
      icon: "⌁",
      types: ["social-studies", "history", "geography"],
      defaultType: "social-studies"
    }
  ];
  const teksEnrichmentGroups = [
    {
      panel: "teks-fine-arts",
      title: "Fine Arts",
      detail: "Visual art, music, composer study, artist study, performance, and creative expression.",
      icon: "♪",
      types: ["fine-arts", "art", "music"],
      defaultType: "fine-arts"
    },
    {
      panel: "teks-health-education",
      title: "Health Education",
      detail: "Personal wellness, nutrition, safety, emotional health, family life, and healthy habits.",
      icon: "✚",
      types: ["health-education"],
      defaultType: "health-education"
    },
    {
      panel: "teks-physical-education",
      title: "Physical Education (PE)",
      detail: "Movement, fitness, coordination, outdoor activity, skill practice, and lifelong physical health.",
      icon: "◉",
      types: ["physical-education", "pe"],
      defaultType: "physical-education"
    },
    {
      panel: "teks-technology-applications",
      title: "Technology Applications",
      detail: "Digital citizenship, computer use, productivity tools, research, coding, and applied technology.",
      icon: "▣",
      types: ["technology-applications", "technology"],
      defaultType: "technology-applications"
    },
    {
      panel: "teks-lote",
      title: "Languages Other Than English (LOTE)",
      detail: "Modern languages, classical languages, vocabulary, grammar, conversation, and translation.",
      icon: "Α",
      types: ["languages-other-than-english", "classical-foreign-languages", "foreign-language", "classical-languages", "latin", "greek"],
      defaultType: "languages-other-than-english"
    },
    {
      panel: "teks-cte",
      title: "Career and Technical Education (CTE)",
      detail: "Career exploration, practical skills, applied projects, entrepreneurship, and technical pathways.",
      icon: "⌘",
      types: ["career-technical-education", "cte"],
      defaultType: "career-technical-education"
    },
    {
      panel: "teks-speech-communication",
      title: "Speech/Communication",
      detail: "Public speaking, discussion, presentation, listening, rhetoric, and interpersonal communication.",
      icon: "✦",
      types: ["speech-communication", "speech", "communication"],
      defaultType: "speech-communication"
    }
  ];
  const groupSets = isOdysseyLearnContext()
    ? [
        {
          title: "Foundation Curriculum",
          note: "Core, form-based academic subjects required for all students.",
          groups: teksFoundationGroups
        },
        {
          title: "Enrichment Curriculum",
          note: "Mandated enrichment subjects offered to provide a well-rounded education.",
          groups: teksEnrichmentGroups
        }
      ]
    : [{ title: "", note: "", groups: standardGroups }];
  const groups = groupSets.flatMap((set) => set.groups).map((group) => setupTileValue(vm, "subjects", group.panel, group));
  const subjectsForGroup = (group) => subjects.filter((subject) => group.types.includes(subject.subjectType || subject.type || "language-arts"));
  const renderGroupSet = (set) => {
    const setGroups = set.groups.map((group) => setupTileValue(vm, "subjects", group.panel, group));
    return `
      ${set.title ? `<div class="learn-setup-helper-note"><strong>${html(set.title)}:</strong> ${html(set.note)}</div>` : ""}
      <div class="learn-setup-section-grid">
        ${setGroups.map((group) => setupSectionCard({ group: "subjects", panel: group.panel, title: group.title, detail: group.detail, count: subjectsForGroup(group).length, icon: group.icon })).join("")}
      </div>`;
  };
  return `
    <p style="margin:0 0 12px;color:var(--muted);">Each tile is a subject family. Open only the subject family you are planning right now, then add the books, resources, and lesson streams that belong there.</p>
    <p class="learn-setup-helper-note"><strong>How this becomes a week:</strong> These Form-based subjects become draggable cards in the Planner Week view. After Setup, you will place them into the days you want and can edit the day-specific chapters, pages, lessons, or notes right inside the week.</p>
    ${groupSets.map(renderGroupSet).join("")}
    ${groups.map((group) => {
      const rows = subjectsForGroup(group);
      const listId = `learnSetupSubjects-${group.panel}`;
      const renderedRows = (rows.length ? rows : [{ subjectType: group.defaultType }]).map((subject) => subjectSetupRow(subject, vm.children, vm.terms, currentTermId, vm.preferences.groupingMode, group.minutes)).join("");
      const content = `<div id="${html(listId)}" data-setup-list="subjects" style="display:grid;gap:10px;">${renderedRows}</div><button type="button" data-setup-add-row="subjects" data-setup-add-target="${html(listId)}" data-setup-add-subject-type="${html(group.defaultType)}" style="margin-top:12px;border:1px solid var(--line);background:var(--paper2);border-radius:10px;padding:10px 16px;font-family:inherit;">Add ${html(group.title)} Subject</button>`;
      return setupSectionPanel({ group: "subjects", panel: group.panel, title: group.title, detail: group.detail, minutes: group.minutes, content });
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

function setupPanelCollapsed(panelId, defaultCollapsed = false) {
  try {
    const saved = localStorage.getItem(`agapay.learn.setupPanel.${panelId}`);
    if (saved === "collapsed") return true;
    if (saved === "expanded") return false;
  } catch {
    // Local storage is only a convenience for setup layout preferences.
  }
  return defaultCollapsed;
}

function collapsibleSetupPanel(panelId, title, content, options = {}) {
  const collapsed = setupPanelCollapsed(panelId, Boolean(options.defaultCollapsed));
  const icon = options.icon || "✥";
  const bodyId = `learnSetupPanel-${panelId}`;
  return `
    <section class="learn-setup-collapse-panel ${collapsed ? "is-collapsed" : ""}" data-setup-collapse-panel="${html(panelId)}">
      <header class="learn-setup-collapse-header">
        <div>
          <span aria-hidden="true">${html(icon)}</span>
          <strong>${html(title)}</strong>
          ${options.summary ? `<small>${html(options.summary)}</small>` : ""}
        </div>
        <button type="button" data-setup-panel-toggle="${html(panelId)}" aria-expanded="${collapsed ? "false" : "true"}" aria-controls="${html(bodyId)}">${collapsed ? "Expand" : "Minimize"}</button>
      </header>
      <div id="${html(bodyId)}" class="learn-setup-collapse-body" ${collapsed ? "hidden" : ""}>
        ${content}
      </div>
    </section>`;
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
    return `<div class="learn-wizard-step-copy"><span>A gentler way through real life</span><h2>Meet Grace Mode.</h2><p>Your plan should serve your family, not punish it. Grace Mode lets you choose Full, Medium, or Light without deleting work or pretending the plan never existed.</p></div><aside class="learn-wizard-grace-explainer"><div><small>Built for real family life</small><h3>Grace Mode changes the day according to each subject’s priority rank.</h3><p>Use it for illness, a new baby, travel, feast days, difficult mornings, or any season when the full plan is too much. Deferred work stays in your plan and can return when the household is ready.</p></div><div class="learn-wizard-grace-levels"><span><strong>Full</strong><small>Every scheduled item runs at its normal time.</small></span><span><strong>Medium</strong><small>Each child keeps up to 4 ranked subjects. Household enrichment keeps up to 3 blocks.</small></span><span><strong>Light</strong><small>Each child keeps up to 2 top-ranked subjects as short touchpoints. Household enrichment keeps 1 block.</small></span></div><p class="learn-wizard-grace-tip"><strong>How to use it:</strong> choose today’s mode on the Learn Dashboard. In Advanced Setup, rank each subject as Core, High, Medium, or Low so Mom knows exactly what survives first when the day gets lighter.</p></aside><div class="learn-wizard-gentle-note"><strong>No permanent choice is required.</strong><span>You can change Grace Mode from day to day as family life changes.</span></div>`;
  }
  return `<div class="learn-wizard-step-copy"><span>Ready for Today</span><h2>Would you like a simple starter week?</h2><p>AGAPAY will save a real editable first term, Daily Church Rhythms, family read-aloud, nature walk, and starter subject plan organized by ${draft.useForms ? "Form" : "grade or level"}. Nothing is sample-only or locked.</p></div><label class="learn-wizard-starter"><input type="checkbox" name="wizard.starterWeek" ${draft.starterWeek ? "checked" : ""}><span><strong>Create a gentle starter week</strong><small>Creates Morning Prayers, Daily Readings, Saint of the Day, family read-aloud, nature walk, plus editable Language Arts, Mathematics, History, Geography, Literature, and Science subjects for every ${draft.useForms ? "Form" : "grade or level"}.</small></span></label><div class="learn-wizard-summary"><div><small>Household</small><strong>${html(draft.householdName || "Your household")}</strong></div><div><small>Children</small><strong>${draft.children.filter((child) => child.firstName).length}</strong></div><div><small>Planning</small><strong>${draft.useForms ? "Family + Forms" : "Family + grades"}</strong></div><div><small>Style</small><strong>${html(draft.method === "Orthodox Classical" ? "Classical" : draft.method)}</strong></div></div>`;
}

function renderSimpleSetupWizard(vm, draft) {
  const tileNote = `<aside class="learn-wizard-tile-note"><strong>How setup tiles work</strong><span>Tiles are planning baskets. Quick Setup creates a gentle starter set, and Advanced Setup lets you open each tile to add or adjust the subjects, books, enrichment, Forms, weeks, and Grace Mode behavior behind your planner.</span></aside>`;
  const body = `<section class="learn-wizard" data-simple-setup-wizard data-wizard-step="${draft.step}">
    <div class="learn-wizard-topline"><div><span>Simple Setup</span><strong>Step ${draft.step + 1} of ${SIMPLE_SETUP_STEPS.length}</strong></div><a href="/myagapay/learn/setup?advanced=1" data-wizard-advanced>Advanced Setup</a></div>
    <div class="learn-wizard-progress" aria-label="Setup progress">${SIMPLE_SETUP_STEPS.map((label, index) => `<span class="${index < draft.step ? "is-complete" : index === draft.step ? "is-current" : ""}"><i>${index < draft.step ? "✓" : index + 1}</i><em>${html(label)}</em></span>`).join("")}</div>
    ${tileNote}
    <form class="learn-wizard-card">${simpleSetupStepBody(draft)}<p class="learn-wizard-status" data-wizard-status aria-live="polite"></p><div class="learn-wizard-actions">${draft.step ? `<button type="button" class="learn-wizard-secondary" data-wizard-back>Back</button>` : `<a class="learn-wizard-secondary" href="/myagapay/learn/setup?advanced=1" data-wizard-advanced>Skip to full setup</a>`}<button type="submit" class="learn-wizard-primary" ${draft.step === SIMPLE_SETUP_STEPS.length - 1 ? "data-wizard-finish" : "data-wizard-next"}>${draft.step === SIMPLE_SETUP_STEPS.length - 1 ? "Save & open Today" : "Continue"}</button></div></form>
    <p class="learn-wizard-draft-note">Your progress is saved on this device until setup is complete.</p>
  </section>`;
  return shell(vm, body);
}

function renderCommunity(vm) {
  const filterOptions = (values) => values.map((value) => `<option value="${html(value)}">${html(value)}</option>`).join("");

  // ── Facebook / community CTA ──────────────────────────────────────────────────
  const facebookCta = vm.facebookGroupUrl
    ? `<a href="${html(vm.facebookGroupUrl)}" target="_blank" rel="noopener noreferrer"
         style="display:inline-flex;align-items:center;gap:9px;background:var(--navy);color:#fffaf0;border:1.5px solid var(--gold);border-radius:11px;padding:12px 20px;text-decoration:none;font-weight:800;font-size:14px;">
         Join the Facebook Group <span style="color:var(--gold);">↗</span>
       </a>`
    : `<span style="display:inline-flex;align-items:center;border:1px solid var(--line);background:var(--paper2);border-radius:999px;padding:7px 13px;color:var(--gold);font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">
         Facebook group opening soon
       </span>`;

  // ── Resource cards — scannable, type-forward ───────────────────────────────────
  const typeLabel = (resource) => {
    const parts = [resource.resourceType, resource.ageRange].filter(Boolean);
    return parts.join(" · ");
  };

  const card = (resource) => `
    <article data-community-card
      data-category="${html(resource.category)}"
      data-resource-type="${html(resource.resourceType)}"
      data-media-type="${html(resource.mediaType)}"
      data-search="${html(`${resource.title} ${resource.category} ${resource.resourceType} ${resource.mediaType} ${resource.ageRange} ${resource.desc} ${resource.tags.join(" ")}`.toLowerCase())}"
      style="background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:10px;box-shadow:0 1px 3px rgba(20,40,70,.04);position:relative;">

      ${resource.vetted ? `<div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--gold),#dac88f);border-radius:14px 14px 0 0;"></div>` : ""}

      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
        <div style="display:flex;align-items:center;gap:9px;">
          <span style="flex:none;width:36px;height:36px;border-radius:9px;background:${softColor(resource.color, "22")};color:${html(resource.color)};display:grid;place-items:center;font-size:17px;border:1px solid ${softColor(resource.color, "38")};">${html(resource.icon || "✥")}</span>
          <div>
            <div style="color:var(--gold);font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;">${html(resource.category)}</div>
            <div style="color:var(--muted);font-size:11px;">${html(typeLabel(resource))}</div>
          </div>
        </div>
        ${resource.vetted ? `<span style="flex:none;border:1px solid rgba(54,95,59,.28);background:#edf6ef;color:#365f3b;border-radius:999px;padding:3px 8px;font-size:10px;font-weight:800;letter-spacing:.07em;white-space:nowrap;">AGAPAY CURATED</span>` : ""}
      </div>

      <strong style="display:block;font-family:'Cormorant Garamond',serif;font-size:21px;line-height:1.1;color:var(--ink);">${html(resource.title)}</strong>
      <p style="font-size:13px;color:#3a4256;line-height:1.5;flex:1;margin:0;">${html(resource.desc)}</p>

      <div style="display:flex;align-items:center;gap:10px;border-top:1px solid var(--line);padding-top:10px;margin-top:auto;">
        <a href="${html(resource.url)}" target="_blank" rel="noopener noreferrer"
           style="flex:1;font-size:13px;font-weight:800;color:var(--navy);text-decoration:none;display:flex;align-items:center;gap:6px;">
          Open <span style="color:var(--gold);">↗</span>
        </a>
        ${resource.source === "community"
          ? `<button type="button" data-community-flag="${html(resource.id)}" title="Flag for review"
               style="border:1px solid var(--line);background:transparent;color:var(--muted);border-radius:7px;padding:5px 9px;font:inherit;font-size:11px;cursor:pointer;">Flag</button>`
          : ""}
      </div>
    </article>`;

  // ── Pinned / curated cards separate from the grid ────────────────────────────
  const pinnedResources = vm.resources.filter((r) => r.vetted || r.pinned);
  const regularResources = vm.resources.filter((r) => !r.vetted && !r.pinned);

  const pinnedGrid = pinnedResources.length
    ? `<div style="margin-bottom:6px;">
         <div style="color:var(--gold);font-size:10px;letter-spacing:.16em;font-weight:800;text-transform:uppercase;margin-bottom:10px;">✦ AGAPAY Curated Picks</div>
         <div data-community-pinned style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr));gap:12px;">
           ${pinnedResources.map(card).join("")}
         </div>
       </div>`
    : "";

  // ── Guidance sidebar ──────────────────────────────────────────────────────────
  const guidancePanel = vm.guidance?.length
    ? panel("How This Works", `
        ${vm.guidance.map((item) => `
          <div style="display:flex;gap:10px;padding:9px 0;border-top:1px solid var(--line);align-items:flex-start;">
            <span style="flex:none;width:20px;height:20px;border-radius:50%;background:var(--paper2);border:1px solid var(--line);display:grid;place-items:center;color:var(--gold);font-size:11px;">✦</span>
            <span style="font-size:13px;color:#33405a;line-height:1.45;">${html(item)}</span>
          </div>`).join("")}
        <button type="button" data-community-suggest
          style="margin-top:12px;width:100%;border:1.5px solid var(--gold);background:var(--paper2);color:var(--navy);border-radius:10px;padding:11px;font:inherit;font-weight:800;font-size:13px;cursor:pointer;">
          Suggest a resource
        </button>`, { icon: "✥" })
    : "";

  // ── This Day in History widget ────────────────────────────────────────────────
  const historyPanel = vm.history?.title
    ? panel("This Day in Church History", `
        <div style="display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:flex-start;">
          <div style="background:linear-gradient(180deg,var(--navy),#1b2c4a);border-radius:10px;padding:10px 12px;text-align:center;border:1px solid rgba(181,148,47,.28);min-width:52px;">
            <div style="color:var(--gold);font-size:20px;">✦</div>
            <div style="color:#f3ead4;font-size:11px;font-weight:700;margin-top:2px;">${html(vm.history.year)}</div>
          </div>
          <div>
            <strong style="font-family:'Cormorant Garamond',serif;font-size:19px;line-height:1.15;display:block;color:var(--ink);">${html(vm.history.title)}</strong>
            ${vm.history.summary ? `<p style="margin:6px 0 0;font-size:13px;color:#33405a;line-height:1.45;">${html(vm.history.summary)}</p>` : ""}
            ${vm.history.source ? `<small style="display:block;margin-top:6px;color:var(--muted);">Source: ${html(vm.history.source)}</small>` : ""}
          </div>
        </div>`, { icon: "☩" })
    : "";

  return shell(vm, `
    <section data-screen-label="Community Resources" style="display:flex;flex-direction:column;gap:18px;">

      <!-- Hero -->
      <div style="background:linear-gradient(135deg,var(--navy),#0a1c30);border-radius:16px;padding:clamp(20px,4vw,32px);display:grid;grid-template-columns:1fr auto;gap:24px;align-items:center;box-shadow:0 2px 8px rgba(4,20,39,.18);">
        <div>
          <div style="color:var(--goldsoft);font-size:10px;letter-spacing:.2em;font-weight:800;text-transform:uppercase;margin-bottom:8px;">Moms helping moms</div>
          <h2 style="font-family:'Cormorant Garamond',serif;font-size:clamp(30px,5vw,44px);line-height:.98;margin:0 0 10px;color:#fff;">A thoughtful Orthodox homeschool community.</h2>
          <p style="line-height:1.55;color:rgba(246,241,232,.78);margin:0 0 18px;max-width:600px;font-size:15px;">Ask practical questions, share encouragement, and learn from families walking the same road.</p>
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
            ${facebookCta}
          </div>
        </div>
        <div style="display:none;width:80px;height:80px;border-radius:20px;border:1px solid rgba(181,148,47,.32);background:rgba(181,148,47,.1);place-items:center;color:var(--gold);font-size:38px;" class="learn-community-mark">✥</div>
      </div>

      <!-- Filters + count -->
      <div style="display:grid;grid-template-columns:minmax(200px,1.6fr) repeat(3,minmax(130px,.7fr));gap:10px;align-items:end;">
        <label style="display:grid;gap:5px;color:var(--gold);font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;">
          Search
          <input data-community-search type="search" placeholder="Saints, catechesis, audio, printables..."
            style="border:1px solid var(--line);border-radius:9px;background:var(--paper);padding:11px 12px;font:inherit;color:var(--ink);min-width:0;">
        </label>
        <label style="display:grid;gap:5px;color:var(--gold);font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;">
          Subject
          <select data-community-category style="border:1px solid var(--line);border-radius:9px;background:var(--paper);padding:11px 10px;font:inherit;color:var(--ink);min-width:0;">${filterOptions(vm.categories)}</select>
        </label>
        <label style="display:grid;gap:5px;color:var(--gold);font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;">
          Type
          <select data-community-resource-type style="border:1px solid var(--line);border-radius:9px;background:var(--paper);padding:11px 10px;font:inherit;color:var(--ink);min-width:0;">${filterOptions(vm.resourceTypes)}</select>
        </label>
        <label style="display:grid;gap:5px;color:var(--gold);font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;">
          Media
          <select data-community-media-type style="border:1px solid var(--line);border-radius:9px;background:var(--paper);padding:11px 10px;font:inherit;color:var(--ink);min-width:0;">${filterOptions(vm.mediaTypes)}</select>
        </label>
      </div>

      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
        <span data-community-count style="color:var(--muted);font-size:13px;">Showing ${vm.resources.length} curated ${vm.resources.length === 1 ? "resource" : "resources"}</span>
        <small style="color:var(--muted);">Links open in a new tab · <button type="button" data-community-suggest style="border:0;background:none;color:var(--gold);font:inherit;font-size:12px;font-weight:700;cursor:pointer;padding:0;">Suggest a resource →</button></small>
      </div>

      <!-- Main two-column layout: cards + sidebar -->
      <div style="display:grid;grid-template-columns:1fr 300px;gap:16px;align-items:start;">

        <div style="display:flex;flex-direction:column;gap:16px;">
          ${pinnedGrid}
          <div data-community-empty hidden
            style="border:1px dashed var(--gold);border-radius:14px;background:var(--paper);padding:28px;text-align:center;color:var(--muted);">
            No resources match those filters yet. Try a broader search.
          </div>
          ${regularResources.length ? `
            <div data-community-grid style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,250px),1fr));gap:12px;">
              ${regularResources.map(card).join("")}
            </div>` : ""}
        </div>

        <aside style="display:flex;flex-direction:column;gap:14px;">
          ${historyPanel}
          ${guidancePanel}
        </aside>

      </div>

      <!-- Suggest dialog (unchanged from existing wiring) -->
      <div data-community-suggest-dialog hidden style="position:fixed;inset:0;z-index:90;background:rgba(4,20,39,.72);padding:20px;align-items:center;justify-content:center;">
        <form data-community-suggest-form style="width:min(560px,100%);max-height:90vh;overflow:auto;background:var(--cream);border:1px solid var(--gold);border-radius:16px;box-shadow:0 22px 70px rgba(0,0,0,.35);">
          <div style="padding:19px 22px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:12px;">
            <div>
              <h2 style="font-family:'Cormorant Garamond',serif;font-size:28px;margin:0;">Suggest a Resource</h2>
              <small style="color:var(--muted);">Submissions are reviewed before appearing in the library.</small>
            </div>
            <button type="button" data-community-suggest-close aria-label="Close" style="border:0;background:transparent;font-size:24px;color:var(--muted);cursor:pointer;">×</button>
          </div>
          <div style="padding:20px 22px;display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <label style="grid-column:1/-1;display:grid;gap:5px;">Title<input name="title" required maxlength="120" style="border:1px solid var(--line);border-radius:9px;padding:10px;font:inherit;"></label>
            <label style="grid-column:1/-1;display:grid;gap:5px;">Link<input name="url" type="url" required style="border:1px solid var(--line);border-radius:9px;padding:10px;font:inherit;"></label>
            <label style="display:grid;gap:5px;">Subject<input name="category" placeholder="Catechesis, History..." style="border:1px solid var(--line);border-radius:9px;padding:10px;font:inherit;"></label>
            <label style="display:grid;gap:5px;">Resource type<input name="resourceType" placeholder="Book, Website, Printable..." style="border:1px solid var(--line);border-radius:9px;padding:10px;font:inherit;"></label>
            <label style="display:grid;gap:5px;">Media type<input name="mediaType" placeholder="Article, Audio, PDF..." style="border:1px solid var(--line);border-radius:9px;padding:10px;font:inherit;"></label>
            <label style="display:grid;gap:5px;">Age range<input name="ageRange" placeholder="Family, Form II..." style="border:1px solid var(--line);border-radius:9px;padding:10px;font:inherit;"></label>
            <label style="grid-column:1/-1;display:grid;gap:5px;">Tags<input name="tags" placeholder="saints, narration, feast days" style="border:1px solid var(--line);border-radius:9px;padding:10px;font:inherit;"></label>
            <label style="grid-column:1/-1;display:grid;gap:5px;">Why it is helpful<textarea name="description" required maxlength="600" rows="4" style="border:1px solid var(--line);border-radius:9px;padding:10px;font:inherit;resize:vertical;"></textarea></label>
            <div data-community-suggest-status style="grid-column:1/-1;color:var(--muted);font-size:13px;"></div>
          </div>
          <div style="padding:15px 22px;border-top:1px solid var(--line);display:flex;justify-content:flex-end;gap:9px;">
            <button type="button" data-community-suggest-close style="border:1px solid var(--line);background:var(--paper);border-radius:9px;padding:10px 15px;font:inherit;cursor:pointer;">Cancel</button>
            <button type="submit" style="border:1px solid var(--gold);background:var(--navy);color:#fff;border-radius:9px;padding:10px 16px;font:inherit;font-weight:800;cursor:pointer;">Send for Review</button>
          </div>
        </form>
      </div>

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

function validateSimpleSetupMinimum(draft) {
  if (!draft.householdName || !draft.parentName) return "Please add the household name and your name.";
  const children = draft.children.filter((child) => child.firstName);
  if (!children.length) return "Please add at least one child.";
  if (children.some((child) => !child.ageYears && !child.gradeLabel)) return "Add an age or grade for each child so Learn can suggest the right Form.";
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
  if (!planningGroups.length) planningGroups.push(draft.useForms ? "Form I" : "Household Grade");
  const existingHasPlan = Boolean(existingSnapshot?.subjects?.length || existingSnapshot?.formation?.enrichmentBlocks?.length);
  const createStarterWeek = draft.starterWeek && !existingHasPlan;
  const starterAssignment = (groupLabel) => draft.useForms ? { formLabel: groupLabel } : { gradeLabel: groupLabel };
  const subjectDays = {
    "4x": ["mon", "tue", "wed", "thu"],
    "3x": ["mon", "wed", "fri"],
    "2x": ["tue", "thu"],
    "1x": ["fri"],
    daily: ["mon", "tue", "wed", "thu", "fri"]
  };
  const starterSubjectSlate = [
    { title: "Language Arts", subjectType: "language-arts", weeklyFrequency: "4x", minutes: "20", gracePriority: "core" },
    { title: "Mathematics", subjectType: "math", weeklyFrequency: "4x", minutes: "20", gracePriority: "core" },
    { title: "History", subjectType: "history", weeklyFrequency: "3x", minutes: "25", gracePriority: "high" },
    { title: "Geography", subjectType: "geography", weeklyFrequency: "2x", minutes: "20", gracePriority: "medium" },
    { title: "Literature", subjectType: "literature", weeklyFrequency: "3x", minutes: "20", gracePriority: "high" },
    { title: "Science", subjectType: "sciences-nature", weeklyFrequency: "2x", minutes: "25", gracePriority: "medium" }
  ];
  const subjects = createStarterWeek ? planningGroups.flatMap((groupLabel, groupIndex) => starterSubjectSlate.map((subject, subjectIndex) => ({
    ...subject,
    planningMode: draft.useForms ? "forms" : "grades",
    ...starterAssignment(groupLabel),
    termId: "term_1",
    daysOfWeek: subjectDays[subject.weeklyFrequency] || subjectDays["1x"],
    resource: "",
    resourceType: "none",
    color: colors[(groupIndex + subjectIndex) % colors.length]
  }))) : [];
  const starterTerm = { id: "term_1", label: "Starter Term", startDate: dates.termStart, endDate: dates.termEnd, paceMode: "steady" };
  const starterFormation = {
    churchRhythms: [
      { title: "Morning Prayers", note: "Begin together", weeklyFrequency: "daily", daysOfWeek: subjectDays.daily, minutes: 10 },
      { title: "Daily Readings", note: "Epistle and Gospel", weeklyFrequency: "daily", daysOfWeek: subjectDays.daily, minutes: 10 },
      { title: "Saint of the Day", note: "Read and discuss", weeklyFrequency: "daily", daysOfWeek: subjectDays.daily, minutes: 10 }
    ],
    recitationTracks: [], hymnStudies: [], feasts: [],
    enrichmentBlocks: [
      { blockType: "Literature", title: "Family Read-Aloud", planningMode: "family", weeklyFrequency: "daily", daysOfWeek: subjectDays.daily, minutesPlanned: 20, termId: "term_1", gracePriority: "high" },
      { blockType: "Nature Study", title: "Nature Walk", planningMode: "family", weeklyFrequency: "1x", daysOfWeek: subjectDays["1x"], minutesPlanned: 30, termId: "term_1", gracePriority: "medium" }
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
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    captureSimpleSetupStep(form, draft);
    const submit = event.submitter || form.querySelector(".learn-wizard-primary");
    if (submit?.hasAttribute("data-wizard-finish")) {
      const error = validateSimpleSetupMinimum(draft);
      if (error) { status.textContent = error; return; }
      if (draft.useForms) draft.children.forEach((child) => { child.formLabel ||= suggestedFormForChild(child); });
      submit.disabled = true;
      status.textContent = "Preparing your AGAPAY Learn dashboard...";
      try {
        await apiPost("/api/learn/setup", simpleSetupPayload(draft, existingSnapshot));
        localStorage.setItem("agapay.learn.calendar", draft.calendarType || "julian");
        localStorage.removeItem(simpleSetupDraftKey());
        window.location.href = "/myagapay/learn";
      } catch (error) {
        status.textContent = error.message;
        submit.disabled = false;
      }
      return;
    }
    const error = validateSimpleSetupStep(draft);
    if (error) { status.textContent = error; return; }
    if (draft.step === 3 && draft.useForms) draft.children.forEach((child) => { child.formLabel ||= suggestedFormForChild(child); });
    draft.step = Math.min(SIMPLE_SETUP_STEPS.length - 1, draft.step + 1);
    saveSimpleSetupDraft(draft);
    rerender();
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
    if (event.target.closest("[data-wizard-next], [data-wizard-finish]")) return;
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
  return `<div data-setup-row="familyEvents" data-id="${html(event.id || "")}" class="learn-family-row learn-event-row">${setupInput("Event", "title", event.title || "")}${setupSelect("Type", "eventType", event.eventType || "appointment", [{ value: "appointment", label: "Appointment" }, { value: "field-trip", label: "Field trip" }, { value: "extracurricular", label: "Extracurricular" }, { value: "family", label: "Family" }, { value: "other", label: "Other" }])}${setupInput("Date", "date", event.date || "", { type: "date" })}${setupInput("Starts", "startTime", event.startTime || "", { type: "time" })}${setupSelect("Repeats", "recurrence", event.recurrence || "none", eventRecurrenceOptions)}${setupInput("Location", "location", event.location || "")}${setupInput("Notes", "notes", event.notes || "")}${setupRemoveButton()}</div>`;
}

function recipeSetupRow(recipe = {}) {
  return `<div data-setup-row="recipes" data-id="${html(recipe.id || "")}" class="learn-family-row learn-recipe-row">${setupInput("Recipe", "title", recipe.title || "")}${setupSelect("Fasting fit", "fastingType", recipe.fastingType || "adaptable", [{ value: "fast-friendly", label: "Fast-friendly" }, { value: "adaptable", label: "Easy to adapt" }, { value: "regular", label: "Regular meal" }])}${setupInput("Category", "category", recipe.category || "Dinner")}${setupInput("Source link", "sourceUrl", recipe.sourceUrl || "", { type: "url" })}${setupInput("Ingredients", "ingredients", recipe.ingredients || "")}${setupInput("Notes / method", "instructions", recipe.instructions || "")}${setupRemoveButton()}</div>`;
}

function grocerySetupRow(item = {}) {
  const isPantry = Boolean(item.pantry || item.inPantry);
  return `<div data-setup-row="groceryItems" data-id="${html(item.id || "")}" class="learn-family-row learn-grocery-row">${setupInput("Item", "name", item.name || "")}${setupInput("Quantity", "quantity", item.quantity || "")}${setupSelect("Aisle", "category", item.category || (isPantry ? "Pantry" : "Produce"), ["Produce", "Pantry", "Bakery", "Dairy", "Frozen", "Household", "Other"])}<label class="learn-check-field"><input type="checkbox" name="checked" ${item.checked ? "checked" : ""}> In cart</label><label class="learn-check-field"><input type="checkbox" name="pantry" ${isPantry ? "checked" : ""}> Pantry staple</label>${setupRemoveButton()}</div>`;
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
  const collapseDefault = Boolean(vm.setupCompleted);
  const rhythmSetupTitle = isOdysseyLearnContext() ? "Daily Rhythm" : "Church Rhythm";
  const rhythmSetupSummary = isOdysseyLearnContext() ? "Daily prayers, readings, saints, feasts, and fasting notes" : "Daily prayers, readings, saints, feasts, and fasting rhythm";
  const adaptivePanels = {
    church: `<span id="learnSetupChurchRhythm" class="learn-setup-anchor"></span>${collapsibleSetupPanel("churchRhythm", rhythmSetupTitle, churchRhythmSetupPanel(vm), { icon: "☩", summary: rhythmSetupSummary, defaultCollapsed: collapseDefault })}`,
    enrichment: `<span id="learnSetupFormation" class="learn-setup-anchor"></span>${panel("Enrichment", formationSetupPanel(vm), { icon: "✥", largeTitle: true })}`,
    subjects: `<span id="learnSetupSubjects" class="learn-setup-anchor"></span>${panel(experience.subjectTitle, formSubjectsSetupPanel(vm, currentTermId), { icon: "✎", largeTitle: true })}`
  };
  const householdContent = `<div class="learn-setup-method-note"><small>Organized for ${html(vm.household.method || "your household")}</small><strong>${html(experience.note)}</strong></div><div style="display:grid;grid-template-columns:1.1fr .9fr .9fr;gap:12px;">${setupInput("Household name", "household.name", vm.household.name)}${setupInput("Parent name", "household.parentName", vm.household.parentName)}${setupInput("Parish", "household.parishName", vm.household.parish)}${setupInput("Parish patronal feast", "household.parishPatronalFeastName", vm.household.parishPatronalFeastName || "")}${setupInput("Patronal feast date", "household.parishPatronalFeastDate", vm.household.parishPatronalFeastDate || "", { type: "date" })}${setupSelect("Method", "household.primaryMethod", vm.household.method || "Unsure", homeschoolMethodOptions)}${setupSelect("Planning groups", "preferences.groupingMode", groupingMode, [{ value: "forms", label: "Forms" }, { value: "grades", label: "Traditional grades / levels" }])}${setupInput("School year", "schoolYear.label", vm.schoolYear.label)}${setupInput("Year start", "schoolYear.startDate", vm.schoolYear.startDate, { type: "date" })}${setupInput("Year end", "schoolYear.endDate", vm.schoolYear.endDate, { type: "date" })}${setupSelect("Current term", "schoolYear.currentTermId", currentTermId, setupTermOptions(vm.terms, vm.term))}${setupSelect("Church calendar", "preferences.calendarType", vm.preferences.calendarType, vm.calendarOptions)}${setupSelect("Evaluation", "preferences.evaluationModel", vm.preferences.evaluationModel, vm.evaluationModels)}${`<details class="learn-day-picker"><summary><span>Default school days</span><strong data-day-summary>${html(setupWeekdays.filter((day) => (vm.preferences.defaultSchoolDays || ["mon","tue","wed","thu","fri"]).includes(day.value)).map((day) => day.label).join(" · "))}</strong></summary><div class="learn-day-picker-menu">${setupWeekdays.map((day) => `<label><input type="checkbox" data-day-choice value="${day.value}" ${(vm.preferences.defaultSchoolDays || ["mon","tue","wed","thu","fri"]).includes(day.value) ? "checked" : ""}>${day.label}</label>`).join("")}</div><input type="hidden" name="preferences.defaultSchoolDays" value="${html((vm.preferences.defaultSchoolDays || ["mon","tue","wed","thu","fri"]).join(","))}"></details>`}${setupSelect("Default missed lesson", "preferences.defaultMissedLessonBehavior", vm.preferences.defaultMissedLessonBehavior || "next-occurrence", missedLessonOptions)}${setupInput("Default max minutes / child", "preferences.defaultMaxDailyMinutes", vm.preferences.defaultMaxDailyMinutes || "240", { type: "number" })}<input name="preferences.graceModeActive" type="hidden" value="${vm.preferences.graceModeActive ? "true" : "false"}" /><input name="preferences.graceModeDefault" type="hidden" value="${html(vm.preferences.graceModeDefault || "light")}" /></div><p style="margin:10px 0 0;color:var(--muted);font-size:13px;line-height:1.4;">The patronal feast repeats annually on the Family Planner calendar so it can be honored alongside name days, fasts, and major feasts.</p>`;
  const childrenContent = `<p style="margin:0 0 12px;color:var(--muted);">${html(groupingCopy)}</p><div data-setup-list="children" style="display:grid;gap:10px;">${(vm.children.length ? vm.children : [{}]).map((child) => childSetupRow(child, groupingMode)).join("")}</div><button type="button" data-setup-add-row="children" style="margin-top:12px;width:100%;border:1px solid var(--line);background:var(--paper2);border-radius:10px;padding:10px;font-family:inherit;">Add Child</button>`;
  const termsContent = `<p style="margin:0 0 12px;color:var(--muted);line-height:1.45;">Term 4 / Summer is available for year-round homeschoolers. Assign subjects, books, and formation materials to the term where they belong.</p><div style="display:flex;justify-content:flex-end;margin-bottom:10px;"><button type="button" data-setup-add-row="terms" style="border:1px solid var(--line);background:var(--paper2);border-radius:10px;padding:10px 16px;font-family:inherit;">Add Term</button></div><div data-setup-list="terms" style="display:grid;gap:10px;">${(vm.terms?.length ? vm.terms : [vm.term]).map((term, index) => termSetupRow(term, index)).join("")}</div>`;
  const body = `
    <form data-setup-form data-screen-label="Set Up" style="display:flex;flex-direction:column;gap:18px;">
      <span id="learnSetupHousehold" class="learn-setup-anchor"></span>
      ${collapsibleSetupPanel("household", "Household", householdContent, { icon: "⌂", summary: "Profile, method, school year, calendar, and defaults", defaultCollapsed: collapseDefault })}
      <span id="learnSetupChildren" class="learn-setup-anchor"></span>
      ${collapsibleSetupPanel("children", groupingTitle, childrenContent, { icon: "◎", summary: `${vm.children.length || 0} ${vm.children.length === 1 ? "child" : "children"} configured`, defaultCollapsed: collapseDefault })}
      ${collapsibleSetupPanel("terms", "Terms", termsContent, { icon: "◷", summary: `${(vm.terms?.length || 1)} term${(vm.terms?.length || 1) === 1 ? "" : "s"} in this school year`, defaultCollapsed: collapseDefault })}
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
  const householdTemplates = vm.templates.filter((t) => t.audience === "mom" || t.audience === "household");
  const childTemplates     = vm.templates.filter((t) => t.audience === "child");
  const freePlan  = !isLearnFamilyPlan();
  const remaining = Math.max(0, vm.billing.printLimit - printCount());
  const nearLimit = freePlan && remaining <= 1;

  // ── Shared helpers ────────────────────────────────────────────────────────────
  const accessBadge = (isPrem) => isPrem
    ? `<span style="flex:none;border:1px solid var(--gold);background:#fbf2dd;color:var(--gold);border-radius:999px;padding:3px 9px;font-size:10px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;">Family</span>`
    : `<span style="flex:none;border:1px solid #c2d9c4;background:#edf6ef;color:#365f3b;border-radius:999px;padding:3px 9px;font-size:10px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;">Free</span>`;

  // ── Row-style template item (for grouped lists) ───────────────────────────────
  const templateRow = (template) => {
    const locked = template.premium && freePlan;
    return `
      <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-top:1px solid var(--line);${locked ? "opacity:.72;" : ""}">
        <div style="flex:1;min-width:0;">
          <strong style="display:block;font-size:14px;color:var(--ink);">${html(template.title)}</strong>
          <small style="color:var(--muted);font-size:12px;line-height:1.35;">${html(template.description)}</small>
        </div>
        ${locked
          ? `<button type="button" data-print-upgrade
               style="flex:none;border:1px solid var(--gold);background:transparent;color:var(--gold);border-radius:8px;padding:7px 12px;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;">
               🔒 Upgrade
             </button>`
          : `<button type="button" data-print-generate="${html(template.id)}"
               style="flex:none;border:none;background:var(--navy);color:#fff;border-radius:8px;padding:7px 14px;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;">
               Print PDF
             </button>`}
      </div>`;
  };

  // ── Group household templates by purpose ──────────────────────────────────────
  const GROUPS = [
    {
      id: "weekly",
      label: "This Week",
      icon: "▦",
      desc: "The free weekly household plan. Lesson-specific weekly grids unlock with the Family plan.",
      premium: false,
      ids: ["print_mom_weekly"]
    },
    {
      id: "month",
      label: "Month & Calendar",
      icon: "▣",
      desc: "Free monthly household calendar and events sheet with feast days and fast days clearly marked.",
      premium: false,
      ids: ["print_mom_month", "planner_events_month"]
    },
    {
      id: "lessons",
      label: "Lesson Plans",
      icon: "☰",
      desc: "Structured lesson grids, landscape term maps, full-year plans, and liturgical calendars.",
      premium: true,
      ids: ["planner_lessons_week_form", "planner_lessons_month_form", "planner_lessons_term_form", "print_mom_term", "print_mom_school_year", "print_mom_liturgical"]
    },
    {
      id: "kitchen",
      label: "Meals, Recipes & Home",
      icon: "♨",
      desc: "Meal plans, recipe collections, grocery lists, and chore charts for the household.",
      premium: true,
      ids: [
        "planner_meals_week", "planner_meals_month",
        "planner_recipes", "planner_grocery_week",
        "planner_chores_day", "planner_chores_week", "planner_chores_month"
      ]
    }
  ];

  const tmplById = new Map(householdTemplates.map((t) => [t.id, t]));
  const assignedIds = new Set(GROUPS.flatMap((g) => g.ids));
  const ungrouped = householdTemplates.filter((t) => !assignedIds.has(t.id));

  const groupSection = (group) => {
    const members = group.ids.map((id) => tmplById.get(id)).filter(Boolean);
    if (group.id === "kitchen") members.push(...ungrouped.filter((t) => t.premium));
    else if (group.id === "weekly") members.push(...ungrouped.filter((t) => !t.premium));
    if (!members.length) return "";
    const groupPremium = members.some((template) => template.premium);
    const groupLocked = groupPremium && freePlan;
    return `
      <div style="background:var(--paper);border:1px solid ${groupLocked ? "rgba(181,148,47,.3)" : "var(--line)"};border-radius:12px;overflow:hidden;">
        <div style="display:flex;align-items:center;gap:10px;padding:13px 14px;background:${groupLocked ? "linear-gradient(90deg,#fffaed,var(--paper))" : "var(--paper2)"};border-bottom:1px solid var(--line);">
          <span style="font-size:16px;color:var(--gold);">${group.icon}</span>
          <div style="flex:1;min-width:0;">
            <strong style="font-size:15px;color:var(--ink);">${group.label}</strong>
            <small style="display:block;color:var(--muted);font-size:12px;">${group.desc}</small>
          </div>
          ${groupPremium
            ? `<span style="flex:none;border:1px solid var(--gold);background:#fbf2dd;color:var(--gold);border-radius:999px;padding:3px 10px;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">Family Plan</span>`
            : `<span style="flex:none;border:1px solid #c2d9c4;background:#edf6ef;color:#365f3b;border-radius:999px;padding:3px 10px;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">Free</span>`}
        </div>
        ${members.map(templateRow).join("")}
      </div>`;
  };

  // ── Plan status bar ─────────────────────────────────────────────────────────
  const usedPct = freePlan ? Math.round(((vm.billing.printLimit - remaining) / vm.billing.printLimit) * 100) : 0;
  const statusBar = freePlan
    ? `<div style="margin-top:8px;height:5px;border-radius:99px;background:var(--line);overflow:hidden;">
         <div style="height:100%;width:${usedPct}%;background:${nearLimit ? "var(--burgundy)" : "var(--gold)"};border-radius:99px;transition:width .4s;"></div>
       </div>
       <small style="display:block;margin-top:5px;color:${nearLimit ? "var(--burgundy)" : "var(--muted)"};font-size:11px;">
         ${remaining} of ${vm.billing.printLimit} free prints remaining
       </small>`
    : "";

  // ── Plan banner ─────────────────────────────────────────────────────────────
  const planBanner = `
    <div style="border:1px solid ${nearLimit ? "var(--burgundy)" : freePlan ? "var(--line)" : "rgba(181,148,47,.35)"};
      background:${freePlan ? "var(--paper)" : "linear-gradient(135deg,#fffdf5,#fdf5dc)"};
      border-radius:14px;padding:16px 20px;display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;">
      <div style="flex:1;min-width:220px;">
        <strong style="font-family:'Cormorant Garamond',serif;font-size:21px;color:var(--ink);">
          ${freePlan ? "Free Plan" : "✦ Family Plan Active"}
        </strong>
        <span style="display:block;color:var(--muted);font-size:13px;margin-top:3px;line-height:1.45;">
          ${freePlan
            ? "This Week and Month & Calendar packs are free. Lesson plans, meal plans, chore charts, recipes, and child sheets require the Family plan."
            : "All household plans, child sheets, lesson packs, meal plans, recipe collections, and planner prints are unlocked."}
        </span>
        ${statusBar}
      </div>
      ${freePlan
        ? `<button type="button" data-print-upgrade
             style="flex:none;background:var(--navy);color:#fff;border:1px solid var(--gold);border-radius:10px;padding:11px 20px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;">
             Upgrade — Family Plan
           </button>`
        : `<span style="flex:none;color:var(--gold);font-size:13px;font-weight:700;padding-top:4px;">Unlocked ✦</span>`}
    </div>`;

  // ── Child sheet cards — one per child with dropdown ───────────────────────────
  const childrenMap = new Map();
  childTemplates.forEach((t) => {
    const key = t.childId || t.child || t.id;
    if (!childrenMap.has(key)) childrenMap.set(key, { name: t.child || "Child", childId: t.childId, color: t.color, sheets: [] });
    childrenMap.get(key).sheets.push(t);
  });

  const childGroupCard = (group) => {
    const locked   = freePlan;
    const initial  = html((group.name || "C").charAt(0).toUpperCase());
    const avatarBg = group.color || "var(--slate)";
    const selectId = `child-sheet-sel-${html(group.childId || group.name)}`;
    const options  = group.sheets.map((t) => `<option value="${html(t.id)}">${html(t.title)}</option>`).join("");
    return `
      <article style="border:1px solid ${locked ? "var(--gold)" : "var(--line)"};border-radius:12px;background:${locked ? "#fffaed" : "var(--paper)"};padding:14px;display:flex;flex-direction:column;gap:10px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="flex:none;width:36px;height:36px;border-radius:50%;background:${avatarBg};color:#f3ead4;display:flex;align-items:center;justify-content:center;font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:700;">${initial}</span>
          <strong style="font-size:15px;color:var(--ink);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${html(group.name)}</strong>
          ${accessBadge(true)}
        </div>
        <select id="${selectId}" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:9px 10px;font-family:inherit;font-size:13px;color:var(--ink);background:var(--paper2);cursor:${locked ? "default" : "pointer"};" ${locked ? "disabled" : ""}>
          ${options}
        </select>
        <button type="button" data-child-print-group="${html(group.childId || group.name)}" data-child-select="${selectId}"
          style="border:1.5px solid ${locked ? "var(--gold)" : "var(--navy)"};background:${locked ? "transparent" : "var(--navy)"};color:${locked ? "var(--gold)" : "#fff"};border-radius:9px;padding:10px 12px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;text-align:center;">
          ${locked ? `<span style="margin-right:5px;font-size:11px;">🔒</span>Upgrade to unlock` : "Generate PDF"}
        </button>
      </article>`;
  };

  const childGrid = childrenMap.size
    ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;">${Array.from(childrenMap.values()).map(childGroupCard).join("")}</div>`
    : `<div style="padding:16px;border:1px dashed var(--line);border-radius:10px;color:var(--muted);font-size:13px;line-height:1.5;">
         Child sheets appear here once children are added in Setup. Each child gets a weekly assignment sheet, term plan, and chore chart.
       </div>`;

  // ── Reports coming-soon section ─────────────────────────────────────────────
  const upcomingReports = [
    { label: "Progress summaries",      desc: "Term and year snapshots by child, Form, and subject." },
    { label: "Report cards",            desc: "Narrative, complete/incomplete, percentage, and letter-grade formats." },
    { label: "Transcripts",             desc: "Course, credit, grade, and school-year records for older students." },
    { label: "State reporting exports", desc: "Attendance, subject progress, and portfolio-ready summaries." },
  ];

  const reportsSection = `
    <section id="reports" style="background:linear-gradient(135deg,var(--paper),var(--paper2));border:1px solid rgba(181,148,47,.35);border-radius:14px;padding:22px;display:grid;gap:18px;scroll-margin-top:110px;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;">
        <div>
          <div style="color:var(--gold);font-size:10px;letter-spacing:.18em;font-weight:800;text-transform:uppercase;margin-bottom:6px;">Reports & Records</div>
          <h2 style="font-family:'Cormorant Garamond',serif;font-size:30px;line-height:1.05;margin:0 0 6px;color:var(--ink);">Beautiful records, built from work already done.</h2>
          <p style="margin:0;color:var(--muted);font-size:13px;line-height:1.5;max-width:640px;">This workspace will turn saved lessons, narrations, subject progress, and term closures into polished homeschool records. Staged for a future release.</p>
        </div>
        <span style="flex:none;border:1px solid var(--gold);border-radius:999px;background:var(--navy);color:#fffaf0;padding:7px 14px;font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;">Coming Soon</span>
      </div>
      ${vm.reports?.stats?.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;">${vm.reports.stats.map((stat) => `
        <article style="border:1px solid var(--line);border-radius:10px;background:rgba(255,255,255,.6);padding:14px;">
          <small style="display:block;color:var(--gold);font-size:10px;letter-spacing:.1em;text-transform:uppercase;font-weight:800;">${html(stat.label)}</small>
          <strong style="display:block;font-family:'Cormorant Garamond',serif;font-size:26px;margin-top:4px;color:var(--ink);">${html(stat.value)}</strong>
          <span style="display:block;color:var(--muted);font-size:12px;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${html(stat.sub)}</span>
        </article>`).join("")}</div>` : ""}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;">
        ${upcomingReports.map((r) => `
          <article style="border:1px solid var(--line);border-radius:10px;background:var(--paper);padding:14px;opacity:.78;">
            <strong style="display:block;color:var(--ink);margin-bottom:4px;">${r.label}</strong>
            <p style="margin:0;color:var(--muted);font-size:13px;line-height:1.4;">${r.desc}</p>
          </article>`).join("")}
      </div>
    </section>`;

  // ── Outputs reference ───────────────────────────────────────────────────────
  const outputsPanel = panel("What You Can Print", `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:20px;">
      <div>
        <div style="color:var(--gold);font-size:10px;letter-spacing:.14em;font-weight:800;text-transform:uppercase;margin-bottom:8px;">Household</div>
        ${(vm.outputs?.household || vm.sampleOutputs?.mom || []).map((item) => `<div style="padding:7px 0;border-top:1px solid var(--line);font-size:13px;color:var(--ink);">${html(item)}</div>`).join("")}
      </div>
      <div>
        <div style="color:var(--gold);font-size:10px;letter-spacing:.14em;font-weight:800;text-transform:uppercase;margin-bottom:8px;">Child</div>
        ${(vm.outputs?.child || vm.sampleOutputs?.child || []).map((item) => `<div style="padding:7px 0;border-top:1px solid var(--line);font-size:13px;color:var(--ink);">${html(item)}</div>`).join("")}
      </div>
      ${(vm.outputs?.planner || vm.sampleOutputs?.planner || []).length ? `<div>
        <div style="color:var(--gold);font-size:10px;letter-spacing:.14em;font-weight:800;text-transform:uppercase;margin-bottom:8px;">Planner</div>
        ${(vm.outputs?.planner || vm.sampleOutputs?.planner || []).map((item) => `<div style="padding:7px 0;border-top:1px solid var(--line);font-size:13px;color:var(--ink);">${html(item)}</div>`).join("")}
      </div>` : ""}
    </div>`, { icon: "✥" });

  // ── Draft Job panel ─────────────────────────────────────────────────────────
  const draftJob = panel("Weekly Family Plan", `
    <strong style="font-family:'Cormorant Garamond',serif;font-size:24px;color:var(--ink);">${html(vm.job.status)}</strong>
    <div style="margin-top:8px;color:var(--muted);line-height:1.55;">
      ${html(vm.term.label)}<br>
      ${html(vm.term.week)}<br>
      ${vm.job.range ? html(vm.job.range) + " · " : ""}${html(vm.job.format)}
    </div>
    <button type="button" data-print-generate="weekly-pack"
      style="margin-top:14px;width:100%;background:var(--navy);color:#fff;border:none;border-radius:10px;padding:11px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;">
      Generate Print Pack
    </button>
    ${!freePlan ? `<button type="button" data-print-generate="print_mom_month" data-print-month="${html(vm.term.monthKey)}"
      style="margin-top:8px;width:100%;background:transparent;color:var(--navy);border:1.5px solid var(--line);border-radius:10px;padding:10px;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;">
      Month Calendar
    </button>` : ""}`, { icon: "✒" });

  const body = `
    <section data-screen-label="Print Center" style="display:flex;flex-direction:column;gap:18px;">
      ${planBanner}
      <div style="display:grid;grid-template-columns:1fr 330px;gap:16px;align-items:start;">
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${GROUPS.map(groupSection).join("")}
        </div>
        ${draftJob}
      </div>
      ${panel("Child Sheets", childGrid, { icon: "◎" })}
      ${reportsSection}
      ${outputsPanel}
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

function clampProgress(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, parsed));
}

function currentChapterFromProgress(book = {}, progress = 0) {
  const start = Math.max(1, Number.parseInt(book.startChapter || 1, 10) || 1);
  const end = Math.max(start, Number.parseInt(book.endChapter || book.totalChapters || start, 10) || start);
  const total = Math.max(1, end - start + 1);
  const completed = Math.round((clampProgress(progress) / 100) * total);
  return completed <= 0 ? start - 1 : Math.min(end, start + completed - 1);
}

async function loadLearnSetupSnapshotForPatch() {
  const raw = await apiGet("/api/learn/setup");
  const setup = raw.onboarding?.setupSnapshot || null;
  if (!setup || typeof setup !== "object") {
    throw new Error("Complete Learn setup before saving progress from this page.");
  }
  return JSON.parse(JSON.stringify(setup));
}

async function saveInlineProgress(kind, id, progress) {
  const setup = await loadLearnSetupSnapshotForPatch();
  if (kind === "book") {
    let matched = false;
    setup.books = Array.isArray(setup.books) ? setup.books.map((book) => {
      if (String(book.id || book.bookId || "") !== String(id)) return book;
      matched = true;
      return {
        ...book,
        currentChapter: currentChapterFromProgress(book, progress)
      };
    }) : [];
    if (!matched) throw new Error("That book was not found in setup. Refresh and try again.");
  } else if (kind === "recitation") {
    const formation = setup.formation && typeof setup.formation === "object" ? setup.formation : {};
    let matched = false;
    formation.recitationTracks = Array.isArray(formation.recitationTracks) ? formation.recitationTracks.map((track) => {
      if (String(track.id || "") !== String(id)) return track;
      matched = true;
      const nextProgress = clampProgress(progress);
      return {
        ...track,
        progressPercent: nextProgress,
        status: nextProgress >= 100 ? "memorized" : (track.status || "memorizing")
      };
    }) : [];
    setup.formation = formation;
    if (!matched) throw new Error("That recitation track was not found in setup. Refresh and try again.");
  } else {
    throw new Error("Unsupported progress type.");
  }
  return apiPost("/api/learn/setup", setup);
}

function wireInlineProgressEditors({ afterSave } = {}) {
  root.querySelectorAll("[data-progress-editor]").forEach((editor) => {
    const range = editor.querySelector("[data-progress-range]");
    const number = editor.querySelector("[data-progress-number]");
    const status = editor.querySelector("[data-progress-status]");
    const fill = editor.querySelector("span span");
    const sync = (value) => {
      const next = clampProgress(value);
      if (range) range.value = String(next);
      if (number) number.value = String(next);
      if (fill) fill.style.width = `${next}%`;
      if (status && !status.dataset.saving) {
        const suffix = /recitation/i.test(editor.dataset.progressKind || "") ? "memorized" : "complete";
        status.style.color = "var(--muted)";
        status.textContent = `${next}% ${suffix}`;
      }
    };
    range?.addEventListener("input", () => sync(range.value));
    number?.addEventListener("input", () => sync(number.value));
  });

  root.querySelectorAll("[data-progress-save]").forEach((button) => {
    button.addEventListener("click", async () => {
      const editor = button.closest("[data-progress-editor]");
      if (!editor) return;
      const status = editor.querySelector("[data-progress-status]");
      const value = clampProgress(editor.querySelector("[data-progress-number]")?.value || editor.querySelector("[data-progress-range]")?.value || 0);
      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = "Saving...";
      if (status) {
        status.dataset.saving = "true";
        status.style.color = "var(--muted)";
        status.textContent = "Saving progress...";
      }
      try {
        await saveInlineProgress(editor.dataset.progressKind || "", editor.dataset.progressId || "", value);
        if (status) {
          status.style.color = "var(--gold)";
          status.textContent = "Progress saved.";
        }
        await afterSave?.();
      } catch (error) {
        if (status) {
          status.style.color = "var(--burgundy)";
          status.textContent = error.message || "Progress could not be saved.";
        }
      } finally {
        if (button.isConnected) {
          button.disabled = false;
          button.textContent = originalText;
        }
        if (status) delete status.dataset.saving;
      }
    });
  });
}

async function syncLearnGoogleCalendar(extraEvents = [], statusEl = null) {
  if (!learnGoogleCalendarStatus.configured || !learnGoogleCalendarStatus.connected) return null;
  try {
    const calendar = storedLearnCalendar("");
    const result = await apiPost(learnApiUrl("/api/learn/google-calendar/sync", { calendar, returnTo: window.location.pathname + window.location.search }), { extraEvents });
    if (statusEl && result?.syncedCount) {
      statusEl.textContent = `${statusEl.textContent} Google Calendar synced ${result.syncedCount} item${result.syncedCount === 1 ? "" : "s"}.`;
    }
    return result;
  } catch (error) {
    console.warn("Google Calendar sync skipped:", error);
    if (statusEl) statusEl.textContent = `${statusEl.textContent} Google Calendar sync needs attention.`;
    return null;
  }
}

function localIsoDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function storedLearnCalendar(fallback = "") {
  try {
    return localStorage.getItem("agapay.learn.calendar") || fallback;
  } catch {
    return fallback;
  }
}

function learnApiUrl(path, params = {}) {
  const url = new URL(path, window.location.origin);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value) !== "") url.searchParams.set(key, String(value));
  });
  return `${url.pathname}${url.search}`;
}

function rowValue(row, name) {
  const control = row.querySelector(`[name="${name}"]`);
  if (!control) return "";
  const controls = row.querySelectorAll(`[name="${name}"]`);
  if (controls.length > 1 && control.type === "checkbox") {
    return [...controls].filter((item) => item.checked).map((item) => item.value).join(", ");
  }
  if (control.type === "checkbox") return control.checked;
  return control.value.trim();
}

function setupChildRowsFromForm(form) {
  if (!form) return [];
  return [...form.querySelectorAll('[data-setup-row="children"]')].map((row, index) => {
    const firstName = rowValue(row, "firstName");
    const id = row.dataset.id || `child_${index + 1}`;
    return {
      id,
      firstName,
      name: firstName || `Child ${index + 1}`,
      formLabel: rowValue(row, "formLabel"),
      gradeLabel: rowValue(row, "gradeLabel")
    };
  }).filter((child) => child.firstName || child.formLabel || child.gradeLabel);
}

function rowWeeklyPlans(row) {
  return Array.from({ length: DEFAULT_TERM_WEEK_COUNT }, (_, index) => rowValue(row, `weeklyPlans.${index + 1}`));
}

function rowResourceValue(resourceRow, index, field) {
  const control = resourceRow.querySelector(`[name="${resourceFieldName(index, field)}"]`);
  if (!control) return "";
  return control.value.trim();
}

function rowResourceWeeklyPlans(resourceRow, index) {
  return Array.from({ length: DEFAULT_TERM_WEEK_COUNT }, (_, weekIndex) => rowResourceValue(resourceRow, index, `weeklyPlans.${weekIndex + 1}`));
}

function rowResources(row) {
  // Read resources.N.title / resources.N.scheduledWeeks from [data-resource-list]
  const resourceRows = [...row.querySelectorAll("[data-resource-list] [data-resource-row]")];
  if (resourceRows.length) {
    return resourceRows.map((resourceRow, i) => {
      const titleInput = resourceRow.querySelector(`[name="resources.${i}.title"]`) || resourceRow.querySelector("input[type='text']");
      const weeksInput = resourceRow.querySelector(`[name="resources.${i}.scheduledWeeks"]`);
      const title = titleInput?.value?.trim() || "";
      const scheduledWeeks = scheduledTermWeeks(weeksInput?.value || "");
      return {
        title,
        scheduledWeeks,
        weeklyPlans: rowResourceWeeklyPlans(resourceRow, i),
        planningMode: rowResourceValue(resourceRow, i, "planningMode"),
        formLabel: rowResourceValue(resourceRow, i, "formLabel"),
        formLabels: rowResourceValue(resourceRow, i, "formLabels").split(",").map((value) => value.trim()).filter(Boolean),
        gradeLabel: rowResourceValue(resourceRow, i, "gradeLabel"),
        childIds: rowResourceValue(resourceRow, i, "childIds").split(",").map((value) => value.trim()).filter(Boolean)
      };
    }).filter((r) => r.title);
  }
  // Legacy fallback: single resource field
  const legacy = rowValue(row, "resource");
  return legacy ? [{ title: legacy, scheduledWeeks: [] }] : [];
}

function refreshResourceSummary(resourceRow) {
  if (!resourceRow) return;
  const index = Number(resourceRow.dataset.resourceRow || 0);
  const title = resourceRow.querySelector(`[name="${resourceFieldName(index, "title")}"]`)?.value?.trim() || "";
  const weeks = scheduledTermWeeks(resourceRow.querySelector(`[name="${resourceFieldName(index, "scheduledWeeks")}"]`)?.value || "");
  const groups = (resourceRow.querySelector(`[name="${resourceFieldName(index, "formLabels")}"]`)?.value || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const children = (resourceRow.querySelector(`[name="${resourceFieldName(index, "childIds")}"]`)?.value || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const titleEl = resourceRow.querySelector("[data-resource-summary-title]");
  const detailEl = resourceRow.querySelector("[data-resource-summary-detail]");
  if (titleEl) titleEl.textContent = title || "Untitled resource";
  if (detailEl) detailEl.textContent = [termWeekSummary(weeks), groups.length ? groups.join(", ") : "", children.length ? `${children.length} child-specific` : ""].filter(Boolean).join(" · ");
}

function snapshotResourceModal(modal) {
  if (!modal) return;
  const fields = [...modal.querySelectorAll("input, select, textarea")].map((field) => ({
    name: field.name || "",
    value: field.value || "",
    checked: Boolean(field.checked)
  }));
  modal.dataset.resourceSnapshot = JSON.stringify(fields);
}

function restoreResourceModal(modal) {
  if (!modal?.dataset.resourceSnapshot) return;
  try {
    const fields = JSON.parse(modal.dataset.resourceSnapshot);
    fields.forEach((state, index) => {
      const field = modal.querySelectorAll("input, select, textarea")[index];
      if (!field || field.name !== state.name) return;
      if (field.type === "checkbox") field.checked = Boolean(state.checked);
      else field.value = state.value || "";
    });
  } catch {
    // A stale modal snapshot should not block editing the resource.
  }
}

function rowTileMinutes(row) {
  return row.closest(".learn-setup-subsection")?.querySelector("[data-setup-section-minutes-input]")?.value?.trim() || rowValue(row, "minutes") || rowValue(row, "minutesPlanned");
}

function collectRows(form, rowType, mapper) {
  return [...form.querySelectorAll(`[data-setup-row="${rowType}"]`)]
    .map((row, index) => mapper(row, index))
    .filter(Boolean);
}

async function openSaintOfDay(button) {
  const date = button.dataset.date || "";
  const calendar = button.dataset.calendar || storedLearnCalendar("");
  const previousText = button.querySelector("small")?.textContent || "";
  button.disabled = true;
  button.style.cursor = "wait";
  const small = button.querySelector("small");
  if (small) small.textContent = "Loading the lives of the saints...";
  try {
    const payload = await apiGet(learnApiUrl("/api/learn/saints", { date, calendar }));
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

function wireChurchCardToggle() {
  const storageKey = "agapay.learn.churchCardMinimized";
  const card = root.querySelector("[data-church-card]");
  if (!card) return;
  const body = card.querySelector("[data-church-body]");
  const button = card.querySelector("[data-church-toggle]");
  const label = card.querySelector("[data-church-toggle-label]");
  const icon = card.querySelector("[data-church-toggle-icon]");
  if (!body || !button) return;
  const setMinimized = (minimized) => {
    body.hidden = minimized;
    button.setAttribute("aria-expanded", minimized ? "false" : "true");
    if (label) label.textContent = minimized ? "Expand" : "Minimize";
    if (icon) icon.textContent = minimized ? "▼" : "▲";
    localStorage.setItem(storageKey, minimized ? "true" : "false");
  };
  setMinimized(localStorage.getItem(storageKey) === "true");
  button.addEventListener("click", () => setMinimized(!body.hidden));
}

function wireDashboard() {
  wireChurchCardToggle();
  root.querySelectorAll("[data-saint-of-day]").forEach((button) => {
    button.addEventListener("click", () => openSaintOfDay(button));
  });

  root.querySelectorAll("[data-learn-completion]").forEach((button) => {
    button.addEventListener("click", async () => {
      const itemId = button.dataset.completionId || "";
      const scope = button.dataset.completionScope || "";
      const completed = button.getAttribute("aria-pressed") !== "true";
      const calendar = storedLearnCalendar("");
      button.disabled = true;
      button.style.cursor = "wait";
      try {
        const saved = await apiPost(learnApiUrl("/api/learn/completion", { calendar }), {
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
      const calendar = storedLearnCalendar("");
      if (status) {
        status.style.color = "var(--muted)";
        status.textContent = "Saving rhythm...";
      }
      root.querySelectorAll("[data-grace-mode]").forEach((item) => {
        item.disabled = true;
        item.style.cursor = "wait";
      });
      try {
        const saved = await apiPost(learnApiUrl("/api/learn/grace-mode", { calendar }), {
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
      weeksCount: Math.max(1, Math.min(24, Number(rowValue(row, "weeksCount") || 12))),
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
    const minutes = section.querySelector("[data-setup-section-minutes-input]")?.value?.trim() || "";
    if (!title && !detail && !minutes) return;
    setupTiles[group] = setupTiles[group] || {};
    setupTiles[group][panelId] = { title, detail, minutes };
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
      parishPatronalFeastName: get("household.parishPatronalFeastName"),
      parishPatronalFeastDate: get("household.parishPatronalFeastDate"),
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
      const resources = rowResources(row);
      const primaryResource = resources[0] || {};
      return {
        id: row.dataset.id || "",
        title,
        subjectType: rowValue(row, "subjectType"),
        planningMode: rowValue(row, "planningMode") || primaryResource.planningMode || "forms",
        instructionMode: rowValue(row, "instructionMode"),
        schedulingMode: rowValue(row, "schedulingMode"),
        scheduledDays: scheduledDays(rowValue(row, "scheduledDays"), rowValue(row, "weeklyFrequency")),
        scheduledWeeks: scheduledTermWeeks(rowValue(row, "scheduledWeeks") || primaryResource.scheduledWeeks || ""),
        weeklyFrequency: rowValue(row, "weeklyFrequency"),
        weeklyPlans: rowWeeklyPlans(row).some(Boolean) ? rowWeeklyPlans(row) : primaryResource.weeklyPlans || [],
        weeklyTarget: rowValue(row, "weeklyTarget"),
        termTarget: rowValue(row, "termTarget"),
        activeStartDate: rowValue(row, "activeStartDate"),
        activeEndDate: rowValue(row, "activeEndDate"),
        priorityLevel: rowValue(row, "priorityLevel"),
        missedLessonBehavior: rowValue(row, "missedLessonBehavior"),
        cadenceLabel: rowValue(row, "weeklyFrequency"),
        formLabel: rowValue(row, "formLabel") || primaryResource.formLabel || "",
        formLabels: (rowValue(row, "formLabels") || (primaryResource.formLabels || []).join(",")).split(",").map((v) => v.trim()).filter(Boolean),
        gradeLabel: rowValue(row, "gradeLabel") || primaryResource.gradeLabel || "",
        resource: resources[0]?.title || rowValue(row, "resource"),
        resources,
        resourceType: rowValue(row, "resourceType"),
        minutes: rowTileMinutes(row),
        childId: rowValue(row, "childId"),
        childIds: (rowValue(row, "childIds") || (primaryResource.childIds || []).join(",")).split(",").map((v) => v.trim()).filter(Boolean),
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
        scheduledWeeks: scheduledTermWeeks(rowValue(row, "scheduledWeeks")),
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
          weeklyTarget: rowValue(row, "weeklyTarget"),
          termTarget: rowValue(row, "termTarget"),
          activeStartDate: rowValue(row, "activeStartDate"),
          activeEndDate: rowValue(row, "activeEndDate"),
          priorityLevel: rowValue(row, "priorityLevel"),
          missedLessonBehavior: rowValue(row, "missedLessonBehavior"),
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
          formLabel: rowValue(row, "formLabel"),
          formLabels: rowValue(row, "formLabels").split(",").map((value) => value.trim()).filter(Boolean),
          gradeLabel: rowValue(row, "gradeLabel"),
          scheduledWeeks: scheduledTermWeeks(rowValue(row, "scheduledWeeks")),
          weeklyFrequency: rowValue(row, "weeklyFrequency"),
          minutes: rowValue(row, "minutes")
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
          resource: rowValue(row, "resource") || title,
          resourceType: rowValue(row, "resourceType"),
          planningMode: rowValue(row, "planningMode"),
          instructionMode: rowValue(row, "instructionMode"),
          schedulingMode: rowValue(row, "schedulingMode"),
          scheduledDays: scheduledDays(rowValue(row, "scheduledDays"), rowValue(row, "weeklyFrequency")),
          scheduledWeeks: scheduledTermWeeks(rowValue(row, "scheduledWeeks")),
          weeklyFrequency: rowValue(row, "weeklyFrequency"),
          weeklyPlans: rowWeeklyPlans(row),
          cadenceLabel: rowValue(row, "weeklyFrequency"),
          formLabel: rowValue(row, "formLabel"),
          formLabels: rowValue(row, "formLabels").split(",").map((value) => value.trim()).filter(Boolean),
          gradeLabel: rowValue(row, "gradeLabel"),
          childId: rowValue(row, "childId"),
          childIds: rowValue(row, "childIds").split(",").map((v) => v.trim()).filter(Boolean),
          startNumber: rowValue(row, "startNumber"),
          currentNumber: rowValue(row, "currentNumber"),
          endNumber: rowValue(row, "endNumber"),
          minutesPlanned: rowTileMinutes(row),
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
        scheduledWeeks: scheduledTermWeeks(rowValue(row, "scheduledWeeks")),
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
        return { id: row.dataset.id || "", title, eventType: rowValue(row, "eventType"), date: rowValue(row, "date"), startTime: rowValue(row, "startTime"), recurrence: rowValue(row, "recurrence") || "none", location: rowValue(row, "location"), notes: rowValue(row, "notes") };
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
        return { id: row.dataset.id || "", name, quantity: rowValue(row, "quantity"), category: rowValue(row, "category"), checked: Boolean(row.querySelector('[name="checked"]')?.checked), pantry: Boolean(row.querySelector('[name="pantry"]')?.checked) };
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
      fatherNameDay: get("household.fatherNameDay"),
      parishPatronalFeastName: get("household.parishPatronalFeastName"),
      parishPatronalFeastDate: get("household.parishPatronalFeastDate")
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
        return name ? { id: row.dataset.id || "", name, quantity: rowValue(row, "quantity"), category: rowValue(row, "category"), checked: Boolean(row.querySelector('[name="checked"]')?.checked), pantry: Boolean(row.querySelector('[name="pantry"]')?.checked) } : null;
      }),
      chores: collectRows(form, "chores", (row) => {
        const title = rowValue(row, "title");
        const assignee = rowValue(row, "assignee");
        return title || assignee ? {
          id: row.dataset.id || "",
          title,
          assignee,
          cadence: rowValue(row, "cadence") || "daily",
          day: rowValue(row, "day"),
          dayOfMonth: rowValue(row, "dayOfMonth"),
          quarterMonth: rowValue(row, "quarterMonth"),
          assignedDate: rowValue(row, "assignedDate"),
          timeOfDay: rowValue(row, "timeOfDay"),
          notes: rowValue(row, "notes"),
          completed: Boolean(row.querySelector('[name="completed"]')?.checked)
        } : null;
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
  const familyPlanningFromForm = () => ({
    household: {
      motherName: form.elements["household.motherName"]?.value || "",
      fatherName: form.elements["household.fatherName"]?.value || ""
    },
    children: [...form.querySelectorAll("[data-family-child-id]")].map((row) => ({ name: row.dataset.familyChildName || "" })).filter((child) => child.name)
  });
  if (type === "children") return childSetupRow({}, groupingMode);
  if (type === "terms") return termSetupRow({}, terms.length);
  if (type === "subjects") return subjectSetupRow(preset, currentSetupChildren(form), terms, currentTermId, groupingMode, preset.minutes || "");
  if (type === "books") return bookSetupRow({}, terms, currentTermId);
  if (type === "formationMaterials") return formationSetupRow({}, terms, currentTermId);
  if (type === "formationRhythms") return formationRhythmSetupRow({});
  if (type === "formationRecitation") return formationRecitationSetupRow({});
  if (type === "formationEnrichment") return formationEnrichmentSetupRow(preset, currentSetupChildren(form), terms, currentTermId, groupingMode, preset.minutesPlanned || "");
  if (type === "familyEvents") return familyEventSetupRow({ date: preset.date || "" });
  if (type === "recipes") return recipeSetupRow({});
  if (type === "groceryItems") return grocerySetupRow({});
  if (type === "chores") return choreSetupRow({}, 0, familyPlanningFromForm());
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
    const termWeekChoice = event.target.closest("[data-term-week-choice]");
    if (termWeekChoice) {
      const picker = termWeekChoice.closest(".learn-term-week-picker");
      const selected = [...picker.querySelectorAll("[data-term-week-choice]:checked")].map((input) => Number(input.value));
      const hiddenField = picker.querySelector("input[type='hidden']");
      if (hiddenField) hiddenField.value = selected.join(",");
      picker.querySelector("[data-term-week-summary]").textContent = selected.length ? termWeekSummary(selected) : "Choose weeks";
      return;
    }
    const planningFormChoice = event.target.closest("[data-planning-form-choice]");
    if (planningFormChoice) {
      const picker = planningFormChoice.closest(".learn-planning-mode-picker");
      const selected = [...picker.querySelectorAll("[data-planning-form-choice]:checked")].map((input) => input.value);
      const planningMode = selected.length ? "forms" : "family";
      const planningModeField = picker.querySelector("[data-planning-mode-field]") || picker.querySelector('[name="planningMode"]');
      const formLabelField = picker.querySelector("[data-form-label-field]") || picker.querySelector('[name="formLabel"]');
      const formLabelsField = picker.querySelector("[data-form-labels-field]") || picker.querySelector('[name="formLabels"]');
      const gradeField = picker.querySelector("[data-grade-label-field]") || picker.querySelector('[name="gradeLabel"]');
      if (planningModeField) planningModeField.value = planningMode;
      if (formLabelField) formLabelField.value = selected[0] || "";
      if (formLabelsField) formLabelsField.value = selected.join(",");
      if (gradeField) gradeField.value = selected[0] || "";
      const label = picker.querySelector("[data-planning-mode-summary]");
      if (label) label.textContent = selected.length ? `${picker.dataset.planningGroupLabel || "Forms-Based"}: ${selected.join(", ")}` : "Family-Based";
      return;
    }
    const childMultiChoice = event.target.closest("[data-child-multi-choice]");
    if (childMultiChoice) {
      const picker = childMultiChoice.closest(".learn-child-multi-picker");
      const selected = [...picker.querySelectorAll("[data-child-multi-choice]:checked")].map((input) => input.value);
      const childIdsField = picker.querySelector("[data-child-ids-field]") || picker.querySelector('[name="childIds"]');
      if (childIdsField) childIdsField.value = selected.join(",");
      const names = [...picker.querySelectorAll("[data-child-multi-choice]:checked")].map((input) => input.closest("label")?.textContent?.trim() || input.value);
      picker.querySelector("[data-child-multi-summary]").textContent = selected.length ? names.join(", ") : "Use Form Assignment";
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
    const setupPanelToggle = event.target.closest("[data-setup-panel-toggle]");
    if (setupPanelToggle) {
      const panel = setupPanelToggle.closest("[data-setup-collapse-panel]");
      const body = panel?.querySelector(".learn-setup-collapse-body");
      if (!panel || !body) return;
      const expanded = setupPanelToggle.getAttribute("aria-expanded") === "true";
      const nextExpanded = !expanded;
      setupPanelToggle.setAttribute("aria-expanded", nextExpanded ? "true" : "false");
      setupPanelToggle.textContent = nextExpanded ? "Minimize" : "Expand";
      body.hidden = !nextExpanded;
      panel.classList.toggle("is-collapsed", !nextExpanded);
      try {
        localStorage.setItem(`agapay.learn.setupPanel.${setupPanelToggle.dataset.setupPanelToggle}`, nextExpanded ? "expanded" : "collapsed");
      } catch {
        // Collapsed state persistence is optional.
      }
      return;
    }
    const addResource = event.target.closest("[data-add-resource]");
    if (addResource) {
      const list = addResource.closest("[data-resource-list]");
      if (!list) return;
      const existingRows = list.querySelectorAll("[data-resource-row]");
      const index = existingRows.length;
      const subjectRow = addResource.closest('[data-setup-row="subjects"]');
      const groupingMode = document.querySelector('[name="preferences.groupingMode"]')?.value || "forms";
      const children = setupChildRowsFromForm(addResource.closest("[data-setup-form]"));
      const firstResource = rowResources(subjectRow || document.createElement("div"))[0] || {};
      const newRowHtml = setupResourceRow({ planningMode: firstResource.planningMode || "forms", formLabels: firstResource.formLabels || [], childIds: firstResource.childIds || [] }, index, children, groupingMode);
      addResource.insertAdjacentHTML("beforebegin", newRowHtml);
      const newRow = list.querySelector(`[data-resource-row="${index}"]`);
      const modal = newRow?.querySelector("[data-resource-modal]");
      if (modal) {
        snapshotResourceModal(modal);
        modal.hidden = false;
        modal.style.display = "flex";
        modal.querySelector("input")?.focus();
      }
      return;
    }
    const editResource = event.target.closest("[data-edit-resource]");
    if (editResource) {
      const modal = editResource.closest("[data-resource-row]")?.querySelector("[data-resource-modal]");
      if (!modal) return;
      snapshotResourceModal(modal);
      modal.hidden = false;
      modal.style.display = "flex";
      modal.querySelector("input")?.focus();
      return;
    }
    const closeResourceModal = event.target.closest("[data-resource-modal-close], [data-resource-modal-save]");
    if (closeResourceModal) {
      const savingResource = closeResourceModal.hasAttribute("data-resource-modal-save");
      const modal = closeResourceModal.closest("[data-resource-modal]");
      if (!savingResource) restoreResourceModal(modal);
      const resourceRow = closeResourceModal.closest("[data-resource-row]");
      refreshResourceSummary(resourceRow);
      if (modal) {
        modal.hidden = true;
        modal.style.display = "none";
      }
      return;
    }
    const removeResource = event.target.closest("[data-remove-resource]");
    if (removeResource) {
      const list = removeResource.closest("[data-resource-list]");
      const removedRow = removeResource.closest("[data-resource-row]");
      removedRow?.remove();
      // Re-index remaining rows
      if (list) {
        list.querySelectorAll("[data-resource-row]").forEach((row, i) => {
          row.dataset.resourceRow = i;
          row.querySelectorAll("[data-resource-field]").forEach((field) => {
            const key = field.dataset.resourceField || "";
            if (key) field.name = resourceFieldName(i, key);
          });
          const weekPicker = row.querySelector("[data-resource-week-picker]");
          if (weekPicker) weekPicker.dataset.resourceWeekPicker = i;
          // Update label text for rows after the first
          row.querySelectorAll(".learn-resource-card-summary small, .learn-resource-modal-card > small").forEach((label) => {
            label.textContent = i === 0 ? "Book / source / resource" : `Resource ${i + 1}`;
          });
          refreshResourceSummary(row);
        });
      }
      return;
    }
    const weekPreset = event.target.closest("[data-term-weeks-all], [data-term-weeks-odd], [data-term-weeks-even]");
    if (weekPreset) {
      const picker = weekPreset.closest(".learn-term-week-picker");
      const mode = weekPreset.hasAttribute("data-term-weeks-odd") ? "odd" : weekPreset.hasAttribute("data-term-weeks-even") ? "even" : "all";
      picker.querySelectorAll("[data-term-week-choice]").forEach((input) => {
        const week = Number(input.value);
        input.checked = mode === "all" || (mode === "odd" ? week % 2 === 1 : week % 2 === 0);
      });
      const selected = [...picker.querySelectorAll("[data-term-week-choice]:checked")].map((input) => Number(input.value));
      const hiddenField = picker.querySelector("input[type='hidden']");
      if (hiddenField) hiddenField.value = selected.join(",");
      picker.querySelector("[data-term-week-summary]").textContent = termWeekSummary(selected);
      return;
    }
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
      if (addButton.dataset.setupAddDate) preset.date = addButton.dataset.setupAddDate;
      const tileMinutes = addButton.closest(".learn-setup-subsection")?.querySelector("[data-setup-section-minutes-input]")?.value?.trim() || "";
      if (tileMinutes && type === "subjects") preset.minutes = tileMinutes;
      if (tileMinutes && type === "formationEnrichment") preset.minutesPlanned = tileMinutes;
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
    status.style.color = "var(--muted)";
    submit.disabled = true;
    try {
      const saved = await apiPost("/api/learn/setup", payload);
      const calendar = payload.preferences.calendarType || "julian";
      const savedAt = saved.savedAt ? ` at ${new Date(saved.savedAt).toLocaleTimeString()}` : "";
      localStorage.setItem("agapay.learn.calendar", calendar);
      status.style.color = "var(--gold)";
      status.textContent = `Setup saved${savedAt}.`;
    } catch (error) {
      status.textContent = error.message;
      status.style.color = "var(--burgundy)";
    } finally {
      if (submit?.isConnected) submit.disabled = false;
    }
  });
}

function wireWeeklyAssignmentBoard(vm) {
  const board = root.querySelector("[data-week-assignment-board]");
  if (!board) return;
  const storageKey = weekAssignmentStorageKey(vm, board.dataset.weekKey || "week");
  const zones = [...board.querySelectorAll("[data-week-assignment-zone]")];
  const readState = () => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || "{}");
    } catch {
      return {};
    }
  };
  const writeState = () => {
    const state = {};
    board.querySelectorAll("[data-week-assignment-card]").forEach((card) => {
      const zone = card.closest("[data-week-assignment-zone]");
      const zoneKey = zone?.dataset.weekAssignmentZone || "pool";
      const itemId = card.dataset.itemId;
      const sourceId = card.dataset.sourceItemId || itemId;
      const note = card.querySelector("[data-week-assignment-note]")?.value || "";
      if (card.dataset.autoPlaced) {
        // Auto-placed clones: key by sourceId__zone so each day slot is independent
        state[`${sourceId}__auto__${zoneKey}`] = { zone: zoneKey, note, autoPlaced: true, sourceId };
        // Also mark the source item as auto-distributed so restore knows
        if (!state[sourceId]) state[sourceId] = { zone: "auto", autoPlaced: true };
      } else {
        state[itemId] = { zone: zoneKey, note };
      }
    });
    localStorage.setItem(storageKey, JSON.stringify(state));
    scheduleDesignedWeekCalendarSync();
  };
  const wireCard = (card) => {
    card.addEventListener("dragstart", (event) => {
      event.dataTransfer?.setData("text/plain", card.dataset.itemId || "");
      card.classList.add("is-dragging");
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("is-dragging");
      writeState();
    });
    card.querySelector("[data-week-assignment-note]")?.addEventListener("input", writeState);
  };
  const restore = () => {
    const state = readState();
    // Day zones in DOM order (Sun=index 0, Mon=1 … Sat=6 matching statuses array)
    const dayZones = [...board.querySelectorAll("[data-week-assignment-zone]:not([data-week-assignment-zone='pool'])")];
    board.querySelectorAll("[data-week-assignment-card]").forEach((card) => {
      const id = card.dataset.itemId;
      const saved = state[id];
      if (saved && saved.zone && saved.zone !== "auto") {
        // Manual placement from a previous session — honour it exactly
        const target = board.querySelector(`[data-week-assignment-zone="${CSS.escape(saved.zone)}"]`);
        if (target) target.appendChild(card);
        const note = card.querySelector("[data-week-assignment-note]");
        if (note && saved.note) note.value = saved.note;
        return;
      }
      // Determine auto-placement eligibility from statuses
      const statuses = (card.dataset.statuses || "").split(",");
      const activeDayIndexes = statuses
        .map((s, i) => s === "planned" ? i : -1)
        .filter((i) => i >= 0);
      const isAutoEligible = activeDayIndexes.length >= 2;
      if (!isAutoEligible) return; // single-day or unscheduled — leave in pool for drag
      // Auto-place: hide the pool original, clone into each active day zone
      card.style.display = "none";
      card.dataset.autoOriginal = "true";
      activeDayIndexes.forEach((dayIndex) => {
        // dayZones[0] = Sunday, [1] = Mon … match statuses array positions
        const zone = dayZones[dayIndex];
        if (!zone) return;
        const autoKey = `${id}__auto__${zone.dataset.weekAssignmentZone}`;
        const savedClone = state[autoKey];
        const clone = card.cloneNode(true);
        clone.dataset.itemId = autoKey;
        clone.dataset.sourceItemId = id;
        clone.dataset.autoPlaced = "true";
        clone.style.display = ""; // visible
        const cloneNote = clone.querySelector("[data-week-assignment-note]");
        if (cloneNote) {
          cloneNote.value = savedClone?.note || "";
          cloneNote.placeholder = "Specify chapters, pages, lessons, or notes for this day";
        }
        // If a saved clone was moved to a different zone, honour that
        const targetZoneKey = savedClone?.zone && savedClone.zone !== zone.dataset.weekAssignmentZone
          ? savedClone.zone
          : zone.dataset.weekAssignmentZone;
        const targetZone = board.querySelector(`[data-week-assignment-zone="${CSS.escape(targetZoneKey)}"]`) || zone;
        targetZone.appendChild(clone);
        wireCard(clone);
      });
    });
  };
  restore();
  // Wire drag + note events for pool originals (non-auto cards)
  board.querySelectorAll("[data-week-assignment-card]:not([data-auto-placed])").forEach(wireCard);
  const designedWeekPayload = () => {
    const itemLookup = new Map((vm.week?.weeklyAssignmentItems || []).map((item) => [item.id, item]));
    const assignmentForCard = (card) => {
      // Resolve metadata from source item for auto-placed clones
      const sourceId = card.dataset.sourceItemId || card.dataset.itemId;
      const item = itemLookup.get(sourceId) || itemLookup.get(card.dataset.itemId) || {};
      return {
        id: sourceId || "",
        title: card.querySelector("strong")?.textContent?.trim() || item.title || "Subject",
        sub: card.querySelector("small")?.textContent?.trim() || item.sub || "",
        note: card.querySelector("[data-week-assignment-note]")?.value?.trim() || "",
        minutes: Number(item.minutes || 0),
        color: item.color || ""
      };
    };
    return {
      label: vm.week?.label || "",
      termLabel: vm.term?.label || vm.week?.termLabel || "",
      days: (vm.week?.days || []).map((day) => {
        const zone = board.querySelector(`[data-week-assignment-zone="${CSS.escape(day.date)}"]`);
        return {
          date: day.date || "",
          weekday: day.weekdayLong || day.weekday || "",
          shortDate: day.shortDate || "",
          feast: day.isSunday ? "Church & Rest" : day.feast || "",
          isSunday: Boolean(day.isSunday),
          assignments: zone ? [...zone.querySelectorAll("[data-week-assignment-card]")].map(assignmentForCard) : []
        };
      }),
      unassigned: [...(board.querySelector('[data-week-assignment-zone="pool"]')?.querySelectorAll("[data-week-assignment-card]") || [])].map(assignmentForCard)
    };
  };
  const designedWeekCalendarEvents = () => designedWeekPayload().days.flatMap((day) => (day.assignments || []).map((assignment, index) => ({
    type: "designed-lesson",
    title: assignment.title || "Lesson",
    date: day.date,
    allDay: false,
    durationMinutes: Number(assignment.minutes || 0) || 30,
    description: [day.weekday, assignment.sub, assignment.note].filter(Boolean).join("\n"),
    startTime: `${String(9 + Math.min(index, 6)).padStart(2, "0")}:00`
  })));
  let designedWeekSyncTimer = null;
  const scheduleDesignedWeekCalendarSync = () => {
    if (!learnGoogleCalendarStatus.configured || !learnGoogleCalendarStatus.connected) return;
    clearTimeout(designedWeekSyncTimer);
    designedWeekSyncTimer = setTimeout(() => {
      syncLearnGoogleCalendar(designedWeekCalendarEvents());
    }, 900);
  };
  zones.forEach((zone) => {
    zone.addEventListener("dragover", (event) => {
      event.preventDefault();
      zone.classList.add("is-over");
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("is-over"));
    zone.addEventListener("drop", (event) => {
      event.preventDefault();
      zone.classList.remove("is-over");
      const id = event.dataTransfer?.getData("text/plain") || "";
      const card = id ? board.querySelector(`[data-week-assignment-card][data-item-id="${CSS.escape(id)}"]`) : null;
      if (card) {
        zone.appendChild(card);
        writeState();
      }
    });
  });
  board.querySelector("[data-week-designed-print]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Generating...";
    writeState();
    try {
      const calendar = storedLearnCalendar("");
      const response = await fetch(learnApiUrl("/api/learn/print/print_mom_weekly", { calendar }), {
        method: "POST",
        headers: learnRequestHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          templateId: "print_mom_weekly",
          designedWeek: designedWeekPayload()
        })
      });
      if (waitForLearnSignIn(response)) return;
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Unable to generate the designed week PDF.");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const fileMatch = disposition.match(/filename="([^"]+)"/);
      downloadBlob(fileMatch?.[1] || "agapay-learn-designed-week.pdf", blob);
      const serverCount = Number(response.headers.get("x-agapay-learn-print-count"));
      if (!isLearnFamilyPlan()) setPrintCount(Number.isFinite(serverCount) ? serverCount : printCount() + 1);
    } catch (error) {
      showLearnDialog("Print Could Not Be Generated", error.message || "Please refresh and try again.", []);
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  });
}

function wirePlanner(vm) {
  if (vm.activeView) localStorage.setItem("agapay.learn.plannerView", vm.activeView);
  if (vm.month?.key) localStorage.setItem("agapay.learn.plannerMonth", vm.month.key);
  if (vm.term?.activeTerm) localStorage.setItem("agapay.learn.plannerTerm", String(vm.term.activeTerm));
  wireWeeklyAssignmentBoard(vm);

  // Week navigation — prev / next / today
  root.querySelectorAll("[data-week-nav]").forEach((button) => {
    button.addEventListener("click", () => {
      const board = root.querySelector("[data-week-assignment-board]");
      const weekStart = board?.dataset.weekStart || "";
      const direction = button.dataset.weekNav;
      let targetDate;
      if (direction === "today") {
        targetDate = new Date().toISOString().slice(0, 10);
      } else {
        const offset = Number(direction) * 7;
        const base = weekStart ? new Date(`${weekStart}T12:00:00Z`) : new Date();
        base.setUTCDate(base.getUTCDate() + offset);
        targetDate = base.toISOString().slice(0, 10);
      }
      const params = new URLSearchParams(window.location.search);
      params.set("date", targetDate);
      params.set("view", "week");
      window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
      mount();
    });
  });

  // Intro dismiss — sets a localStorage flag so the intro hides on next visit
  root.querySelector("[data-planner-intro-dismiss]")?.addEventListener("click", (event) => {
    const key = event.currentTarget.dataset.plannerIntroDismiss;
    if (key) localStorage.setItem(key, "1");
    const introEl = event.currentTarget.closest(".learn-family-intro")?.parentElement;
    // Remove the intro block and the dismiss button row together
    event.currentTarget.closest("div[style*='justify-content:flex-end']")?.remove();
    event.currentTarget.closest(".learn-family-intro")?.remove();
  });

  const prototypeFrame = root.querySelector("[data-family-prototype-frame]");
  if (prototypeFrame) wireFamilyPrototypeBackend(vm, prototypeFrame);
  root.querySelector("[data-planner-month-print]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const month = button.dataset.plannerMonthPrint || vm.month?.key || new Date().toISOString().slice(0, 7);
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Generating...";
    try {
      const calendar = storedLearnCalendar("");
      const response = await fetch(learnApiUrl("/api/learn/print/print_mom_month", { calendar, month }), {
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
  let activeMeal = null;
  const openFamilyModal = (name) => {
    const modal = familyForm?.querySelector(`[data-family-modal="${name}"]`);
    if (!modal) return null;
    modal.hidden = false;
    modal.style.display = "flex";
    modal.querySelector("input, textarea, button")?.focus();
    return modal;
  };
  const closeFamilyModals = () => {
    familyForm?.querySelectorAll("[data-family-modal]").forEach((modal) => {
      modal.hidden = true;
      modal.style.display = "none";
    });
  };
  const submitFamilyPlanner = () => {
    familyForm?.requestSubmit();
  };
  const refreshChoreCalendar = () => {
    if (!familyForm) return;
    const live = familyForm.querySelector("[data-family-planner-live]");
    if (!live) return;
    const params = new URLSearchParams(window.location.search);
    const scope = params.get("scope") || vm.activeScope || "lessons";
    if (scope !== "chores") return;
    const displayView = params.get("view") || vm.activeView || "week";
    const payload = familyPlanningPayloadFromForm(familyForm);
    const nextVm = {
      ...vm,
      familyPlanning: {
        ...(vm.familyPlanning || {}),
        ...(payload.familyPlanning || {}),
        household: {
          ...(vm.familyPlanning?.household || {}),
          ...(payload.household || {})
        },
        children: vm.familyPlanning?.children || []
      }
    };
    live.innerHTML = renderChoresScope(familyPlannerModel(nextVm), displayView);
  };
  const setModalValue = (name, value) => {
    const fields = familyForm?.querySelectorAll(`[name="${CSS.escape(name)}"]`) || [];
    if (!fields.length) return;
    if (fields.length > 1 && fields[0].type === "checkbox") {
      const selected = choreTimeValues(value);
      fields.forEach((field) => { field.checked = selected.includes(field.value); });
      return;
    }
    fields[0].value = value || "";
  };
  const getModalValue = (name) => {
    const fields = familyForm?.querySelectorAll(`[name="${CSS.escape(name)}"]`) || [];
    if (!fields.length) return "";
    if (fields.length > 1 && fields[0].type === "checkbox") {
      return [...fields].filter((field) => field.checked).map((field) => field.value).join(", ");
    }
    return fields[0].value?.trim() || "";
  };
  const resetChoreBatchList = () => {
    const batchList = familyForm?.querySelector("[data-chore-batch-list]");
    if (!batchList) return;
    batchList.innerHTML = "";
    batchList.hidden = true;
  };
  const addChoreToBatchList = (entry = {}) => {
    const batchList = familyForm?.querySelector("[data-chore-batch-list]");
    if (!batchList || !entry.title) return;
    batchList.hidden = false;
    batchList.insertAdjacentHTML("beforeend", `<span><strong>${html(entry.title)}</strong><small>${html([entry.assignee || "Everyone", choreScheduleLabel(entry)].filter(Boolean).join(" · "))}</small></span>`);
  };
  let activeChore = null;
  const choreStorageKey = (chore = {}) => {
    const dayKey = dayKeyForChore(chore, vm);
    return dayKey ? `${chore.assignee || "Everyone"}::${dayKey}::${chore.id || chore.title || "chore"}` : "";
  };
  const removeChoreRows = (chore = {}) => {
    if (!familyForm) return;
    familyForm.querySelectorAll('[data-setup-list="chores"] [data-setup-row="chores"]').forEach((row) => {
      const sameId = chore.id && row.dataset.id === chore.id;
      const sameDetails = !chore.id
        && rowValue(row, "title") === (chore.title || "")
        && rowValue(row, "assignee") === (chore.assignee || "Everyone")
        && rowValue(row, "day") === (chore.day || "");
      if (sameId || sameDetails) row.remove();
    });
  };
  const removeChoreFromDraftState = (chore = {}) => {
    const key = choreStorageKey(chore);
    if (!key) return;
    try {
      const state = JSON.parse(localStorage.getItem("agapay.planner.v2") || "{}");
      if (state.chores) delete state.chores[key];
      if (state.choreDetails) delete state.choreDetails[key];
      localStorage.setItem("agapay.planner.v2", JSON.stringify(state));
    } catch {
      // The hidden setup row removal is still enough for the backend save.
    }
  };
  const setMealValue = (date, slot, value) => {
    if (!date || !slot) return;
    let row = familyForm?.querySelector(`[data-setup-row="meals"][data-date="${CSS.escape(date)}"]`);
    if (!row) {
      const list = familyForm?.querySelector('[data-setup-list="meals"]');
      list?.insertAdjacentHTML("beforeend", `<div data-setup-row="meals" data-date="${html(date)}" hidden><input name="date" value="${html(date)}"><input name="breakfast" value=""><input name="lunch" value=""><input name="dinner" value=""></div>`);
      row = familyForm?.querySelector(`[data-setup-row="meals"][data-date="${CSS.escape(date)}"]`);
    }
    const input = row?.querySelector(`[name="${CSS.escape(slot)}"]`);
    if (input) input.value = value || "";
    root.querySelectorAll(`[data-meal-open][data-date="${CSS.escape(date)}"][data-slot="${CSS.escape(slot)}"]`).forEach((button) => {
      const strong = button.querySelector("strong");
      const small = button.querySelector("small");
      if (strong) strong.textContent = value || "No dish yet";
      if (small) small.textContent = value ? "change it →" : "add a dish →";
    });
  };
  familyForm?.addEventListener("click", (event) => {
    const close = event.target.closest("[data-family-modal-close]");
    if (close) {
      closeFamilyModals();
      return;
    }
    const mealButton = event.target.closest("[data-meal-open]");
    if (mealButton) {
      activeMeal = { date: mealButton.dataset.date || "", slot: mealButton.dataset.slot || "" };
      const modal = openFamilyModal("meal");
      const input = modal?.querySelector("[data-meal-custom-input]");
      const context = modal?.querySelector("[data-meal-modal-context]");
      const row = familyForm.querySelector(`[data-setup-row="meals"][data-date="${CSS.escape(activeMeal.date)}"]`);
      if (input) input.value = row?.querySelector(`[name="${CSS.escape(activeMeal.slot)}"]`)?.value || "";
      if (context) context.textContent = `${mealSlotLabel(activeMeal.slot)} · ${activeMeal.date}`;
      return;
    }
    const mealPick = event.target.closest("[data-meal-pick]");
    if (mealPick && activeMeal) {
      const input = familyForm.querySelector("[data-meal-custom-input]");
      if (input) input.value = mealPick.dataset.mealPick || "";
      return;
    }
    if (event.target.closest("[data-meal-clear]") && activeMeal) {
      setMealValue(activeMeal.date, activeMeal.slot, "");
      closeFamilyModals();
      submitFamilyPlanner();
      return;
    }
    if (event.target.closest("[data-meal-save]") && activeMeal) {
      setMealValue(activeMeal.date, activeMeal.slot, familyForm.querySelector("[data-meal-custom-input]")?.value?.trim() || "");
      closeFamilyModals();
      submitFamilyPlanner();
      return;
    }
    const recipeOpen = event.target.closest("[data-recipe-open]");
    if (recipeOpen) {
      const card = recipeOpen.closest("[data-recipe-title]");
      setModalValue("modalRecipe.title", card?.dataset.recipeTitle || "");
      setModalValue("modalRecipe.fastingType", card?.dataset.recipeFasting || "free");
      setModalValue("modalRecipe.category", card?.dataset.recipeCategory || "");
      setModalValue("modalRecipe.sourceUrl", card?.dataset.recipeSource || "");
      setModalValue("modalRecipe.ingredients", card?.dataset.recipeIngredients || "");
      setModalValue("modalRecipe.instructions", card?.dataset.recipeInstructions || "");
      openFamilyModal("recipe");
      return;
    }
    if (event.target.closest("[data-recipe-save]")) {
      const list = familyForm.querySelector('[data-setup-list="recipes"]');
      const recipe = {
        title: getModalValue("modalRecipe.title"),
        fastingType: getModalValue("modalRecipe.fastingType"),
        category: getModalValue("modalRecipe.category"),
        sourceUrl: getModalValue("modalRecipe.sourceUrl"),
        ingredients: getModalValue("modalRecipe.ingredients"),
        instructions: getModalValue("modalRecipe.instructions")
      };
      if (recipe.title && list) list.insertAdjacentHTML("beforeend", recipeSetupRow(recipe));
      closeFamilyModals();
      submitFamilyPlanner();
      return;
    }
    const eventOpen = event.target.closest("[data-event-open]");
    if (eventOpen) {
      setModalValue("modalEvent.title", eventOpen.dataset.title || "");
      setModalValue("modalEvent.eventType", eventOpen.dataset.type || "Family");
      setModalValue("modalEvent.date", eventOpen.dataset.date || "");
      setModalValue("modalEvent.startTime", eventOpen.dataset.time || "");
      setModalValue("modalEvent.recurrence", eventOpen.dataset.recurrence || "none");
      setModalValue("modalEvent.location", eventOpen.dataset.location || "");
      setModalValue("modalEvent.notes", eventOpen.dataset.notes || "");
      openFamilyModal("event");
      return;
    }
    if (event.target.closest("[data-event-save]")) {
      const list = familyForm.querySelector('[data-setup-list="familyEvents"]');
      const entry = {
        title: getModalValue("modalEvent.title"),
        eventType: getModalValue("modalEvent.eventType"),
        date: getModalValue("modalEvent.date"),
        startTime: getModalValue("modalEvent.startTime"),
        recurrence: getModalValue("modalEvent.recurrence") || "none",
        location: getModalValue("modalEvent.location"),
        notes: getModalValue("modalEvent.notes")
      };
      if (entry.title && entry.date && list) list.insertAdjacentHTML("beforeend", familyEventSetupRow(entry));
      closeFamilyModals();
      submitFamilyPlanner();
      return;
    }
    const choreOpen = event.target.closest("[data-chore-open]");
    if (choreOpen) {
      const existing = choreOpen.dataset.choreExisting === "1";
      activeChore = existing ? {
        id: choreOpen.dataset.choreId || "",
        title: choreOpen.dataset.choreTitle || "",
        assignee: choreOpen.dataset.choreAssignee || choreOpen.dataset.assignee || "Everyone",
        cadence: choreOpen.dataset.choreCadence || "weekly",
        day: choreOpen.dataset.choreDay || choreOpen.dataset.day || "",
        dayOfMonth: choreOpen.dataset.choreDayOfMonth || "",
        quarterMonth: choreOpen.dataset.choreQuarterMonth || "1",
        assignedDate: choreOpen.dataset.choreAssignedDate || choreOpen.dataset.assignedDate || "",
        timeOfDay: choreOpen.dataset.choreTimeOfDay || "Anytime",
        notes: choreOpen.dataset.choreNotes || ""
      } : null;
      setModalValue("modalChore.title", activeChore?.title || "");
      setModalValue("modalChore.assignee", activeChore?.assignee || choreOpen.dataset.assignee || "Everyone");
      setModalValue("modalChore.cadence", activeChore?.cadence || choreOpen.dataset.cadence || "weekly");
      setModalValue("modalChore.day", activeChore?.day || choreOpen.dataset.day || "");
      setModalValue("modalChore.dayOfMonth", activeChore?.dayOfMonth || choreOpen.dataset.dayOfMonth || "");
      setModalValue("modalChore.quarterMonth", activeChore?.quarterMonth || "1");
      setModalValue("modalChore.assignedDate", activeChore?.assignedDate || choreOpen.dataset.assignedDate || "");
      setModalValue("modalChore.timeOfDay", activeChore?.timeOfDay || "Anytime");
      setModalValue("modalChore.notes", activeChore?.notes || "");
      const deleteButton = familyForm.querySelector("[data-chore-delete]");
      if (deleteButton) deleteButton.hidden = !existing;
      const addAnotherButton = familyForm.querySelector("[data-chore-save-add]");
      if (addAnotherButton) addAnotherButton.hidden = existing;
      resetChoreBatchList();
      const title = familyForm.querySelector("[data-chore-modal-title]");
      if (title) title.textContent = existing ? "Edit chore" : "Add chore";
      openFamilyModal("chore");
      return;
    }
    if (event.target.closest("[data-chore-delete]")) {
      if (activeChore) {
        removeChoreRows(activeChore);
        removeChoreFromDraftState(activeChore);
      }
      activeChore = null;
      closeFamilyModals();
      refreshChoreCalendar();
      submitFamilyPlanner();
      return;
    }
    const saveChoreButton = event.target.closest("[data-chore-save], [data-chore-save-add]");
    if (saveChoreButton) {
      const addAnother = saveChoreButton.hasAttribute("data-chore-save-add");
      const list = familyForm.querySelector('[data-setup-list="chores"]');
      const entry = {
        id: activeChore?.id || "",
        title: getModalValue("modalChore.title"),
        assignee: getModalValue("modalChore.assignee"),
        cadence: getModalValue("modalChore.cadence") || "weekly",
        day: getModalValue("modalChore.day"),
        dayOfMonth: getModalValue("modalChore.dayOfMonth"),
        quarterMonth: getModalValue("modalChore.quarterMonth"),
        assignedDate: getModalValue("modalChore.assignedDate"),
        timeOfDay: getModalValue("modalChore.timeOfDay"),
        notes: getModalValue("modalChore.notes")
      };
      if (!entry.title) {
        const titleInput = familyForm.querySelector('[name="modalChore.title"]');
        if (titleInput) titleInput.focus();
        return;
      }
      if (list) {
        const payload = familyPlanningPayloadFromForm(familyForm);
        const planningForRow = {
          ...(payload.familyPlanning || {}),
          household: payload.household || {},
          children: vm.familyPlanning?.children || []
        };
        if (activeChore) {
          removeChoreRows(activeChore);
          removeChoreFromDraftState(activeChore);
        }
        list.insertAdjacentHTML("beforeend", choreSetupRow(entry, 0, planningForRow));
        try {
          const dayKey = dayKeyForChore(entry, vm);
          if (dayKey) {
            const key = `${entry.assignee || "Everyone"}::${dayKey}::${entry.id || entry.title || Date.now()}`;
            const state = JSON.parse(localStorage.getItem("agapay.planner.v2") || "{}");
            state.chores = { ...(state.chores || {}), [key]: entry.title || "" };
            state.choreDetails = {
              ...(state.choreDetails || {}),
              [key]: { ...entry, day: entry.day || plannerDayLabel(prototypeWeekDateMap(vm)[dayKey]).long }
            };
            localStorage.setItem("agapay.planner.v2", JSON.stringify(state));
          }
        } catch {
          // Hidden setup rows still carry the chore if local planner state cannot be updated.
        }
      }
      activeChore = null;
      refreshChoreCalendar();
      if (addAnother) {
        addChoreToBatchList(entry);
        setModalValue("modalChore.title", "");
        setModalValue("modalChore.timeOfDay", "");
        setModalValue("modalChore.notes", "");
        const titleInput = familyForm.querySelector('[name="modalChore.title"]');
        if (titleInput) titleInput.focus();
      } else {
        closeFamilyModals();
        submitFamilyPlanner();
      }
      return;
    }
    const groceryRemove = event.target.closest("[data-grocery-remove]");
    if (groceryRemove) {
      const id = groceryRemove.dataset.groceryRemove || "";
      if (id) {
        const row = familyForm.querySelector(`[data-setup-list="groceryItems"] [data-setup-row="groceryItems"][data-id="${CSS.escape(id)}"]`);
        if (row) row.remove();
      }
      submitFamilyPlanner();
      return;
    }
    const groceryAdd = event.target.closest("[data-grocery-add]");
    if (groceryAdd) {
      const list = familyForm.querySelector('[data-setup-list="groceryItems"]');
      const pantry = groceryAdd.hasAttribute("data-pantry-add");
      if (list) list.insertAdjacentHTML("beforeend", grocerySetupRow({
        name: pantry ? "New pantry staple" : "New grocery item",
        category: pantry ? "Pantry" : "Produce",
        pantry
      }));
      submitFamilyPlanner();
      return;
    }
    const remove = event.target.closest("[data-setup-remove-row]");
    if (remove) {
      const row = remove.closest("[data-setup-row]");
      if (row && row.parentElement.querySelectorAll("[data-setup-row]").length > 1) row.remove();
      return;
    }
    const add = event.target.closest("[data-setup-add-row]");
    if (!add) return;
    const list = add.dataset.setupAddTarget
      ? familyForm.querySelector(`#${CSS.escape(add.dataset.setupAddTarget)}`)
      : familyForm.querySelector(`[data-setup-list="${add.dataset.setupAddRow}"]`);
    if (list) list.insertAdjacentHTML("beforeend", setupBlankRow(add.dataset.setupAddRow, familyForm, { date: add.dataset.setupAddDate || "" }));
  });
  familyForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = familyForm.querySelector("[data-family-planning-status]");
    const submit = familyForm.querySelector('button[type="submit"]');
    status.textContent = "Saving family planner...";
    submit.disabled = true;
    try {
      const params = new URLSearchParams(window.location.search);
      const saveQuery = new URLSearchParams({
        calendar: params.get("calendar") || storedLearnCalendar(""),
        view: params.get("view") || vm.activeView || "week",
        month: params.get("month") || vm.month?.key || new Date().toISOString().slice(0, 7),
        date: params.get("date") || vm.day?.selected?.date || new Date().toISOString().slice(0, 10)
      });
      const saved = await apiPost(`/api/learn/family-planning?${saveQuery.toString()}`, familyPlanningPayloadFromForm(familyForm));
      status.textContent = `Family planner saved${saved.savedAt ? ` at ${new Date(saved.savedAt).toLocaleTimeString()}` : ""}.`;
      status.style.color = "var(--gold)";
      await syncLearnGoogleCalendar([], status);
      // Re-render the planner from the returned payload so calendar-type changes
      // and other data-driven updates are immediately reflected without a full reload.
      if (saved.planner) {
        const updatedVm = toPlannerViewModel({ ok: true, planner: saved.planner });
        const scope = params.get("scope") || updatedVm.activeScope || "lessons";
        const displayView = params.get("view") || updatedVm.activeView || "week";
        root.innerHTML = renderPlanner(updatedVm);
        wirePlanner(updatedVm);
      }
    } catch (error) {
      status.textContent = error.message;
      status.style.color = "var(--burgundy)";
    } finally {
      submit.disabled = false;
    }
  });

  // ── Lesson block note save ────────────────────────────────────────────────────
  root.querySelectorAll("[data-block-note-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const blockId = form.dataset.blockNoteForm || "";
      const note = form.querySelector("[data-block-note-input]")?.value?.trim() || "";
      const btn = form.querySelector("button[type=\"submit\"]");
      if (btn) { btn.disabled = true; btn.textContent = "Saving..."; }
      try {
        await apiPost("/api/learn/planner", { action: "note", blockId, note });
        const wrap = form.closest("[data-block-note-wrap]");
        if (wrap) { wrap.querySelector("[data-block-note-display]").textContent = note; wrap.dataset.blockNoteOpen = ""; }
      } catch (error) {
        showLearnDialog("Note Could Not Be Saved", error.message || "Please try again.", []);
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = "Save Note"; }
      }
    });
  });

  // ── Lesson block reschedule ───────────────────────────────────────────────────
  root.querySelectorAll("[data-block-reschedule]").forEach((button) => {
    button.addEventListener("click", async () => {
      const blockId = button.dataset.blockReschedule || "";
      const fromDate = button.dataset.blockFromDate || "";
      const toDate = button.dataset.blockToDate || "";
      if (!blockId || !fromDate || !toDate) return;
      button.disabled = true;
      try {
        const calendar = storedLearnCalendar("");
        const saved = await apiPost(learnApiUrl("/api/learn/planner", { calendar }), { action: "reschedule", blockId, fromDate, toDate });
        await syncLearnGoogleCalendar();
        if (saved.planner) {
          const updatedVm = toPlannerViewModel({ ok: true, planner: saved.planner });
          root.innerHTML = renderPlanner(updatedVm);
          wirePlanner(updatedVm);
        }
      } catch (error) {
        showLearnDialog("Reschedule Could Not Be Saved", error.message || "Please try again.", []);
      } finally {
        button.disabled = false;
      }
    });
  });
}

function updateActiveButton(buttons, activeButton) {
  buttons.forEach((button) => {
    const active = button === activeButton;

    button.style.background = active
      ? "var(--navy)"
      : "var(--paper)";

    button.style.color = active
      ? "#f3ead4"
      : "var(--ink)";

    button.style.borderColor = active
      ? "var(--gold)"
      : "var(--line)";

    button.setAttribute("aria-pressed", String(active));
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

function gradeCourseFromElement(courseEl, childId) {
  const field = (name) => courseEl.querySelector(`[name="${name}"]`);
  return {
    id: courseEl.dataset.courseId || "",
    childId,
    courseTitle: field("courseTitle")?.value?.trim() || "Untitled Course",
    subjectCategory: field("subjectCategory")?.value || "General",
    gradeLevel: Number(field("gradeLevel")?.value || 9),
    creditHours: Number(field("creditHours")?.value || 0),
    grades: [...courseEl.querySelectorAll("[data-grade-term]")].map((termEl) => ({
      termIndex: Number(termEl.dataset.gradeTerm || 1),
      numericScore: termEl.querySelector('[name="numericScore"]')?.value?.trim() || "",
      letterGrade: termEl.querySelector('[name="letterGrade"]')?.value || "",
      attendanceDays: termEl.querySelector('[name="attendanceDays"]')?.value?.trim() || "",
      teacherNotes: termEl.querySelector('[name="teacherNotes"]')?.value?.trim() || ""
    }))
  };
}

function blankGradeCourse(vm) {
  const index = root.querySelectorAll("[data-grade-course]").length;
  const child = vm.selectedChild || vm.children[0] || {};
  return {
    id: "",
    courseTitle: "New Course",
    subjectCategory: "English",
    gradeLevel: Number(child.gradeLevel || 9),
    creditHours: 1,
    color: ["#14294a", "#6e2f2a", "#4a5a31", "#b5942f", "#34507a"][index % 5],
    grades: [1, 2, 3].map((termIndex) => ({
      termIndex,
      numericScore: "",
      letterGrade: "",
      attendanceDays: "",
      teacherNotes: ""
    }))
  };
}

function attendanceEntryFromCell(cell) {
  return {
    childId: cell.dataset.childId || "",
    date: cell.dataset.date || "",
    status: cell.dataset.status || "present",
    minutes: cell.dataset.minutes || "",
    notes: cell.dataset.notes || ""
  };
}

function setAttendanceCellStatus(cell, status) {
  const next = status || "present";
  const holidayName = cell.dataset.holidayName || "";
  cell.dataset.status = next;
  cell.classList.remove("is-present", "is-absent", "is-excused", "is-holiday");
  cell.classList.add(`is-${next}`);
  const strong = cell.querySelector("strong");
  const small = cell.querySelector("small");
  if (strong) strong.textContent = attendanceStatusMark(next);
  if (small) small.textContent = holidayName && next === "holiday" ? holidayName : attendanceStatusLabel(next);
  cell.setAttribute("aria-label", `${cell.dataset.childId || "Student"} ${cell.dataset.date || ""}: ${attendanceStatusLabel(next)}${holidayName && next === "holiday" ? ` (${holidayName})` : ""}`);
}

function wireGrades(vm) {
  const form = root.querySelector("[data-grades-form]");
  if (!form) return;
  const status = root.querySelector("[data-grades-status]");
  const setStatus = (message, tone = "muted") => {
    if (!status) return;
    status.textContent = message;
    status.dataset.tone = tone;
  };
  const attendanceForm = root.querySelector("[data-attendance-form]");
  const attendanceStatus = root.querySelector("[data-attendance-status]");
  const setAttendanceStatus = (message, tone = "muted") => {
    if (!attendanceStatus) return;
    attendanceStatus.textContent = message;
    attendanceStatus.dataset.tone = tone;
  };
  attendanceForm?.addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-attendance-toggle]");
    if (toggle) {
      const body = attendanceForm.querySelector("[data-attendance-body]");
      const expanded = toggle.getAttribute("aria-expanded") === "true";
      const nextExpanded = !expanded;
      toggle.setAttribute("aria-expanded", nextExpanded ? "true" : "false");
      toggle.textContent = nextExpanded ? "Minimize" : "Expand";
      if (body) body.hidden = !nextExpanded;
      attendanceForm.classList.toggle("is-collapsed", !nextExpanded);
      setAttendanceStatus(nextExpanded ? "Click a day to cycle its status." : "Attendance card minimized. Mark the week present or expand for details.");
      return;
    }
    const cell = event.target.closest("[data-attendance-cell]");
    if (!cell) return;
    const statuses = ["present", "absent", "excused", "holiday"];
    const index = statuses.indexOf(cell.dataset.status || "present");
    setAttendanceCellStatus(cell, statuses[(index + 1) % statuses.length]);
    setAttendanceStatus("Attendance changed. Save when ready.");
  });
  attendanceForm?.querySelector("[data-attendance-present-week]")?.addEventListener("click", () => {
    attendanceForm.querySelectorAll("[data-attendance-cell]").forEach((cell) => setAttendanceCellStatus(cell, cell.dataset.defaultStatus === "holiday" ? "holiday" : "present"));
    setAttendanceStatus("Week marked present with national holidays preserved. Save when ready.");
  });
  attendanceForm?.querySelector("[data-attendance-save]")?.addEventListener("click", async () => {
    const save = attendanceForm.querySelector("[data-attendance-save]");
    if (save) {
      save.disabled = true;
      save.textContent = "Saving...";
    }
    setAttendanceStatus("Saving attendance...");
    try {
      await apiPost("/api/learn/attendance", {
        academicYearName: form.elements.academicYearName?.value?.trim() || vm.academicYear.name,
        entries: [...attendanceForm.querySelectorAll("[data-attendance-cell]")].map(attendanceEntryFromCell)
      });
      setAttendanceStatus("Attendance saved.", "success");
    } catch (error) {
      setAttendanceStatus(error.message || "Attendance could not be saved.", "error");
    } finally {
      if (save) {
        save.disabled = false;
        save.textContent = "Save Attendance";
      }
    }
  });
  form.querySelector("[data-grades-child]")?.addEventListener("change", (event) => {
    const params = new URLSearchParams(window.location.search);
    params.set("childId", event.currentTarget.value);
    window.location.search = params.toString();
  });
  form.querySelector('[name="academicYearName"]')?.addEventListener("change", (event) => {
    const params = new URLSearchParams(window.location.search);
    params.set("academicYear", event.currentTarget.value.trim());
    window.location.search = params.toString();
  });
  form.querySelector("[data-grade-add-course]")?.addEventListener("click", () => {
    const listEl = root.querySelector("[data-grade-course-list]");
    if (!listEl) return;
    if (!listEl.querySelector("[data-grade-course]")) listEl.innerHTML = "";
    listEl.insertAdjacentHTML("beforeend", renderGradeCourseEditor(blankGradeCourse(vm), vm, listEl.querySelectorAll("[data-grade-course]").length));
  });
  form.addEventListener("click", (event) => {
    const remove = event.target.closest("[data-grade-remove-course]");
    if (!remove) return;
    remove.closest("[data-grade-course]")?.remove();
    if (!root.querySelector("[data-grade-course]")) {
      root.querySelector("[data-grade-course-list]").innerHTML = emptyState("No courses have been recorded for this student yet. Add a course to begin the transcript trail.");
    }
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const save = form.querySelector("[data-grade-save]");
    const childId = form.elements.childId?.value || vm.selectedChildId;
    const payload = {
      childId,
      academicYearName: form.elements.academicYearName?.value?.trim() || vm.academicYear.name,
      courses: [...root.querySelectorAll("[data-grade-course]")].map((courseEl) => gradeCourseFromElement(courseEl, childId))
    };
    if (save) {
      save.disabled = true;
      save.textContent = "Saving...";
    }
    setStatus("Saving grades...");
    try {
      await apiPost("/api/learn/grades", payload);
      setStatus("Grades saved. Refreshing the gradebook...", "success");
      window.setTimeout(() => window.location.reload(), 450);
    } catch (error) {
      setStatus(error.message || "Grades could not be saved.", "error");
    } finally {
      if (save) {
        save.disabled = false;
        save.textContent = "Save Grades";
      }
    }
  });
  root.querySelectorAll("[data-report-export]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (button.disabled || button.dataset.reportReady === "false") return;
      const label = button.dataset.reportExport || "Report Card";
      const original = button.textContent;
      button.disabled = true;
      button.textContent = "Generating...";
      try {
        const templateId = label.toLowerCase().includes("transcript") ? "transcript" : "report-card";
        const response = await fetch(`/api/learn/print/${templateId}`, {
          method: "POST",
          headers: learnRequestHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({
            label,
            childId: form.elements.childId?.value || vm.selectedChildId,
            academicYearName: form.elements.academicYearName?.value?.trim() || vm.academicYear.name,
            termIndex: vm.currentTermIndex,
            termLabel: vm.readiness?.reportCardTermLabel || ""
          })
        });
        const contentType = response.headers.get("content-type") || "";
        if (!response.ok || !contentType.includes("application/pdf")) throw new Error("Unable to generate that PDF yet.");
        const blob = await response.blob();
        downloadBlob(`${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`, blob);
      } catch (error) {
        showLearnDialog("Print Could Not Be Generated", error.message || "Please refresh and try again.", []);
      } finally {
        button.disabled = false;
        button.textContent = original;
      }
    });
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
        const calendar = storedLearnCalendar("");
        const response = await fetch(learnApiUrl(`/api/learn/print/${encodeURIComponent(templateId)}`, { calendar }), {
          method: "POST",
          headers: learnRequestHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({
            childId: template.childId || "",
            termId: template.termId || "",
            month: button.dataset.printMonth || ""
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

  // ── Child sheet dropdown buttons ────────────────────────────────────────────
  // Each child card has a <select> and a button with data-child-print-group.
  // On click, resolve the selected templateId from the <select>, find its
  // template (for childId and premium gating), then fire the same print flow.
  root.querySelectorAll("[data-child-print-group]").forEach((button) => {
    button.addEventListener("click", async () => {
      const selectId  = button.dataset.childSelect;
      const select    = selectId ? document.getElementById(selectId) : null;
      const templateId = select?.value || "";
      if (!templateId) return;
      const template  = vm.templates.find((t) => t.id === templateId) || { id: templateId, title: "Child Sheet", audience: "child", premium: true, childId: "" };
      if (!canUsePrint(vm, template)) return;
      const title         = template.title || "Child Sheet";
      const originalText  = button.textContent;
      button.disabled     = true;
      button.textContent  = "Generating...";
      try {
        const calendar = storedLearnCalendar("");
        const response = await fetch(learnApiUrl(`/api/learn/print/${encodeURIComponent(templateId)}`, { calendar }), {
          method: "POST",
          headers: learnRequestHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({
            childId: template.childId || "",
            termId:  template.termId  || ""
          })
        });
        const contentType = response.headers.get("content-type") || "";
        if (!response.ok || !contentType.includes("application/pdf")) {
          const payload = contentType.includes("application/json") ? await response.json().catch(() => ({})) : {};
          throw new Error(payload.error || "Unable to generate the PDF. Please try again.");
        }
        const blob = await response.blob();
        const disposition = response.headers.get("content-disposition") || "";
        const fileMatch   = disposition.match(/filename="([^"]+)"/i);
        downloadBlob(fileMatch?.[1] || `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "child-sheet"}.pdf`, blob);
        const serverCount = Number(response.headers.get("x-agapay-learn-print-count"));
        if (!isLearnFamilyPlan()) setPrintCount(Number.isFinite(serverCount) ? serverCount : printCount() + 1);
      } catch (error) {
        showLearnDialog("Print Could Not Be Generated", error.message || "Please refresh and try again.", []);
      } finally {
        button.disabled    = false;
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
  wireInlineProgressEditors({
    afterSave: async () => {
      const calendar = new URLSearchParams(window.location.search).get("calendar") || storedLearnCalendar("");
      const raw = await apiGet(learnApiUrl("/api/learn/formation", { calendar }));
      root.innerHTML = renderFormation(toFormationViewModel(raw));
      wireFormation();
    }
  });
}

function wireBooks() {
  wireInlineProgressEditors({
    afterSave: async () => {
      const raw = await apiGet("/api/learn/books");
      root.innerHTML = renderBooks(toBooksViewModel(raw));
      wireBooks();
    }
  });
}

async function mount() {
  if (new URLSearchParams(window.location.search).get("learn_billing") === "success") {
    localStorage.setItem("agapay.learn.plan", "family");
  }
  let resolvedPrintLimit = 3;
  try {
    const billing = await apiGet("/api/learn/billing/status");
    // Always clear and re-derive from the live API response so stale localStorage
    // doesn't show a paid UI to a user whose subscription has lapsed.
    if (billing.plan === "family" || billing.fullAccess) {
      localStorage.setItem("agapay.learn.plan", "family");
    } else {
      localStorage.removeItem("agapay.learn.plan");
    }
    if (billing.printLimit) resolvedPrintLimit = Number(billing.printLimit) || 3;
  } catch {
    // Billing status is advisory for the shell; route-level saves still enforce limits.
  }
  try {
    const status = await apiGet("/api/learn/google-calendar/status");
    learnGoogleCalendarStatus = {
      loaded: true,
      configured: Boolean(status.configured),
      connected: Boolean(status.connected),
      accountEmail: status.accountEmail || ""
    };
  } catch (error) {
    console.warn("Google Calendar status could not be loaded:", error);
    learnGoogleCalendarStatus = { loaded: true, configured: false, connected: false };
  }
  const params = new URLSearchParams(window.location.search);
  const calendar = params.get("calendar") || storedLearnCalendar("");
  root.innerHTML = `<div style="padding:32px;font-family:Georgia,serif;color:#1b2c45;">Loading AGAPAY Learn...</div>`;
  if (pageKey === "dashboard") {
    const raw = await apiGet(learnApiUrl("/api/learn/dashboard", { calendar }));
    if (raw.setupCompleted === false) {
      window.location.replace(learnSectionHref("onboarding"));
      return;
    }
    root.innerHTML = renderDashboard(toDashboardViewModel(raw));
    wireDashboard();
    return;
  }
  if (pageKey === "planner") {
    const view = params.get("view") || localStorage.getItem("agapay.learn.plannerView") || "week";
    const month = params.get("month") || new Date().toISOString().slice(0, 7);
    const termId = params.get("termId") || "";
    const date = params.get("date") || "";
    const raw = await apiGet(learnApiUrl("/api/learn/planner", { calendar, view, month, termId, date }));
    const vm = toPlannerViewModel(raw);
    root.innerHTML = renderPlanner(vm);
    wirePlanner(vm);
    return;
  }
  if (pageKey === "formation") {
    const raw = await apiGet(learnApiUrl("/api/learn/formation", { calendar }));
    root.innerHTML = renderFormation(toFormationViewModel(raw));
    wireFormation();
    return;
  }
  if (pageKey === "books") {
    const raw = await apiGet("/api/learn/books");
    root.innerHTML = renderBooks(toBooksViewModel(raw));
    wireBooks();
    return;
  }
  if (pageKey === "grades") {
    const params = new URLSearchParams(window.location.search);
    const academicYear = params.get("academicYear") || "";
    const childId = params.get("childId") || "";
    const raw = await apiGet(`/api/learn/grades${academicYear ? `?academicYear=${encodeURIComponent(academicYear)}` : ""}`);
    const vm = toGradesViewModel(raw, { childId });
    root.innerHTML = renderGrades(vm);
    wireGrades(vm);
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
    const raw = await apiGet(learnApiUrl("/api/learn/print-center", { calendar }));
    const vm = toPrintCenterViewModel({ ...raw, printLimit: resolvedPrintLimit });
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

document.addEventListener("click", async (event) => {
  const feedbackOpen = event.target.closest("[data-learn-feedback-open]");
  if (feedbackOpen) {
    event.preventDefault();
    showLearnFeedbackDialog();
    return;
  }
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
    window.location.href = isOdysseyLearnContext() ? "/learn/odyssey/dashboard/login" : "/myagapay/login";
    return;
  }
  const googleSyncButton = event.target.closest("[data-learn-google-sync]");
  if (googleSyncButton) {
    event.preventDefault();
    if (googleSyncButton.disabled) return;
    const originalHtml = googleSyncButton.innerHTML;
    googleSyncButton.disabled = true;
    googleSyncButton.setAttribute("aria-busy", "true");
    try {
      const returnTo = window.location.pathname + window.location.search;
      const result = await apiGet(`/api/learn/google-calendar/connect?format=json&returnTo=${encodeURIComponent(returnTo)}`);
      if (!result.authUrl) throw new Error("Google Calendar did not return an authorization URL.");
      window.location.assign(result.authUrl);
    } catch (error) {
      googleSyncButton.disabled = false;
      googleSyncButton.removeAttribute("aria-busy");
      googleSyncButton.innerHTML = originalHtml;
      showLearnDialog("Google Calendar Connection Failed", error?.message || "AGAPAY could not begin the Google Calendar connection.");
    }
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

document.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-learn-feedback-form]");
  if (!form) return;
  event.preventDefault();
  const submit = form.querySelector('button[type="submit"]');
  const status = form.querySelector("[data-learn-feedback-status]");
  const subject = form.elements.subject?.value?.trim() || "";
  const message = form.elements.message?.value?.trim() || "";
  if (!message || message.length < 8) {
    if (status) status.textContent = "Please add a little more detail before sending.";
    return;
  }
  if (submit) {
    submit.disabled = true;
    submit.textContent = "Sending...";
  }
  if (status) status.textContent = "Sending your suggestion...";
  try {
    await apiPost("/api/learn/feedback", {
      subject,
      message,
      page: pageKey,
      path: window.location.pathname + window.location.search,
      familyName: document.querySelector(".learn-product-profile strong")?.textContent || "",
      userAgent: navigator.userAgent || ""
    });
    if (status) status.textContent = "Thank you. Your suggestion is now in the AGAPAY Learn admin queue.";
    form.querySelector("textarea")?.setAttribute("readonly", "readonly");
    window.setTimeout(() => document.querySelector("[data-learn-dialog]")?.remove(), 1800);
  } catch (error) {
    if (status) status.textContent = error.message || "Unable to send your suggestion right now.";
    if (submit) {
      submit.disabled = false;
      submit.textContent = "Send suggestion";
    }
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  document.body.classList.remove("learn-menu-open");
  document.querySelector("[data-learn-menu-toggle]")?.setAttribute("aria-expanded", "false");
  document.querySelectorAll("[data-learn-account-toggle]").forEach((button) => button.setAttribute("aria-expanded", "false"));
  document.querySelectorAll(".learn-account-dropdown").forEach((panel) => { panel.hidden = true; });
});
