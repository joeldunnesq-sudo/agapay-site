(function () {
  const navItems = [
    { href: "/learn/dashboard", label: "Dashboard", key: "dashboard", icon: "home" },
    { href: "/learn/planner", label: "Planner", key: "planner", icon: "calendar" },
    { href: "/learn/formation", label: "Formation", key: "formation", icon: "church" },
    { href: "/learn/books", label: "Books", key: "books", icon: "book" },
    { href: "/learn/community", label: "Community", key: "community", icon: "users" },
    { href: "/learn/reports", label: "Reports", key: "reports", icon: "bars" },
    { href: "/learn/print-center", label: "Print Center", key: "print-center", icon: "printer" },
    { href: "/learn/onboarding", label: "Setup", key: "onboarding", icon: "check" },
    { href: "/learn/co-op", label: "Co-op", key: "co-op", icon: "users" }
  ];

  const LEARN_FREE_CHILD_LIMIT = 2;
  const LEARN_FREE_PRINT_LIMIT = 3;
  const LEARN_PRINT_USAGE_KEY = "agapay.learn.printCount";
  const LEARN_COMMUNITY_RESOURCE_KEY = "agapay.learn.communityResources";

  const iconMap = {
    home: '<svg viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13V10.5"/><path d="M9.5 20v-5h5v5"/></svg>',
    calendar: '<svg viewBox="0 0 24 24"><rect x="3.5" y="4.5" width="17" height="16" rx="2.5"/><path d="M8 2.5v4"/><path d="M16 2.5v4"/><path d="M3.5 9.5h17"/></svg>',
    church: '<svg viewBox="0 0 24 24"><path d="M7 20V9l5-4 5 4v11"/><path d="M3 20h18"/><path d="M12 2.5v4"/><path d="M10 4.5h4"/></svg>',
    book: '<svg viewBox="0 0 24 24"><path d="M5 4.5h11a3 3 0 0 1 3 3V20H8a3 3 0 0 0-3 3z"/><path d="M5 4.5V20a3 3 0 0 1 3-3h11"/></svg>',
    bars: '<svg viewBox="0 0 24 24"><path d="M4 19.5V10"/><path d="M10 19.5V4.5"/><path d="M16 19.5v-7"/><path d="M22 19.5V7"/></svg>',
    printer: '<svg viewBox="0 0 24 24"><path d="M7 8V4.5h10V8"/><rect x="4" y="8" width="16" height="8" rx="2"/><path d="M7 14h10v5.5H7z"/></svg>',
    users: '<svg viewBox="0 0 24 24"><circle cx="8" cy="8" r="3"/><circle cx="16.5" cy="7.5" r="2.5"/><path d="M2.5 19c1.2-3 4.1-4.5 7-4.5S15.3 16 16.5 19"/><path d="M14.5 19c.8-2 2.6-3 4.5-3 1 0 1.9.2 2.5.7"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="m5 12 4 4 10-10"/></svg>'
  };

  function icon(name) {
    return iconMap[name] || "";
  }

  function currentPageKey() {
    const value = document.body.dataset.learnPage || "dashboard";
    return value;
  }

  function requestedPlannerView() {
    const params = new URLSearchParams(window.location.search);
    return params.get("view") || localStorage.getItem("agapay.learn.plannerView") || "week";
  }

  function requestedPlannerTerm() {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("term") || localStorage.getItem("agapay.learn.plannerTerm") || "2";
    const value = Number(raw);
    return value >= 1 && value <= 3 ? value : 2;
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function dateLabelFromCivil(iso) {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
      .format(new Date(`${iso}T00:00:00.000Z`));
  }

  function accentClass(token) {
    return token || "navy";
  }

  function formatStatus(status) {
    return status === "completed" ? "is-complete" : "";
  }

  function renderSidebar() {
    const activeKey = currentPageKey();
    const navHtml = navItems.map((item) => `
      <a class="learn-nav-link ${item.key === activeKey ? "is-active" : ""}" href="${item.href}" ${item.key === activeKey ? 'aria-current="page"' : ""}>
        ${icon(item.icon)}
        <span>${item.label}</span>
      </a>
    `).join("");

    return `
      <aside class="learn-sidebar">
        <div class="learn-sidebar-main">
          <div class="learn-brand">
            <div class="learn-brand-mark"><img src="/mark.png" alt="" /></div>
            <div class="learn-brand-copy">
              <strong>AGAPAY Learn</strong>
              <span>Orthodox homeschool planner</span>
            </div>
          </div>
          <nav class="learn-nav" aria-label="AGAPAY Learn">${navHtml}</nav>
        </div>
        <div class="learn-sidebar-footer">
          <div class="learn-sidebar-chapel" aria-hidden="true"></div>
          <div class="learn-sidebar-blessing">
            <p>Rooted in Christ.<br />Ordered in Love.</p>
          </div>
        </div>
      </aside>
    `;
  }

  function learnUtilityContext(payload = {}) {
    const setup = readSetupState();
    const household = payload.dashboard?.household
      || payload.planner?.household
      || payload.formation?.household
      || payload.books?.household
      || payload.reports?.household
      || payload.coOp?.household
      || payload.onboarding?.household
      || {};
    const name = setup.householdName || household.name || "Faithful Household";
    const childrenCount = setupChildren(payload.dashboard?.children || payload.planner?.children || payload.formation?.children || payload.onboarding?.children || []).length
      || household.childrenCount
      || 0;
    const primaryMethod = setup.primaryMethod || household.primaryMethod || "Homeschool";
    return {
      name,
      childrenCount,
      primaryMethod,
      timeLabel: household.topbarTimeLabel || new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date()),
      initials: name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "LH"
    };
  }

  function renderUtilityBar(payload = {}) {
    const account = learnUtilityContext(payload);
    return `
      <header class="learn-utility-bar">
        <a class="learn-utility-brand" href="/my-agapay" aria-label="Open My AGAPAY">
          <span class="learn-utility-mark"><img src="/mark.png" alt="" /></span>
          <span><span class="learn-utility-title">MY AGAPAY</span><small>Love how you Give + Learn + Live</small></span>
        </a>
        <div class="learn-utility-actions">
          <a class="learn-quick-action" href="/learn/onboarding">Quick Action</a>
          <a class="learn-account-chip" href="/my-agapay" aria-label="Back to My AGAPAY dashboard">
            <span class="learn-account-avatar">${account.initials}</span>
            <span><strong>${account.name}</strong><small>Back to Dashboard</small></span>
          </a>
        </div>
      </header>
    `;
  }

  function renderPageHeader(title, subtitle, actions = "") {
    return `
      <section class="learn-page-header">
        <div>
          <div class="learn-page-title"><span>${title}</span></div>
          <div class="learn-page-subtitle">${subtitle}</div>
        </div>
        <div class="learn-topbar-right">${actions}</div>
      </section>
    `;
  }

  function renderTopbar(data) {
    const { household, activeIndicators, calendarToggle, today } = data.dashboard;
    return `
      ${renderUtilityBar(data)}
      ${renderPageHeader(today.title, `${today.dateLabel} · ${today.weekdayLabel}`, `
          <div class="learn-chip">${activeIndicators.graceMode.label} · ${activeIndicators.graceMode.detail}</div>
          <div class="learn-chip-soft">${activeIndicators.cycle}</div>
          <div class="learn-chip-soft">${activeIndicators.curriculumPackage}</div>
          <div class="learn-utility">${household.topbarTimeLabel}</div>
          <div class="learn-segmented" id="calendarToggle">
            ${calendarToggle.options.map((option) => `
              <button type="button" data-calendar="${option.value}" class="${calendarToggle.active === option.value ? "is-active" : ""}">
                ${option.label}
              </button>
            `).join("")}
          </div>
      `)}
    `;
  }

  function renderLiturgyCard(data) {
    const day = data.dashboard.today.liturgicalDay;
    return `
      <section class="learn-card">
        <div class="learn-card-inner">
          <div class="learn-card-title">
            <strong>Today in the Church</strong>
            <span class="learn-chip-soft">${data.dashboard.calendarToggle.description}</span>
            <span class="learn-chip-soft">${day.sourceLabel || "Liturgical source"}</span>
          </div>
          <div class="learn-liturgy-grid">
            <div class="learn-icon-panel learn-liturgy-icon-panel">
              <img src="/pantocrator.png" alt="Christ Pantocrator icon" />
            </div>
            <div class="learn-liturgy-copy">
              <div class="learn-kicker">${day.feastRank}</div>
              <h2>${day.feastTitle}</h2>
              <p>${day.saints.join(" · ")}</p>
              <div class="learn-liturgy-meta">
                <div class="learn-meta-pill">
                  <div class="learn-meta-label">Liturgical Date</div>
                  <div class="learn-meta-value">${day.oldStyleDateLabel}</div>
                </div>
                <div class="learn-meta-pill">
                  <div class="learn-meta-label">Tone of Week</div>
                  <div class="learn-meta-value">${day.tone}</div>
                </div>
                <div class="learn-meta-pill">
                  <div class="learn-meta-label">Fasting Rule</div>
                  <div class="learn-meta-value">${day.fastingRule}</div>
                </div>
                <div class="learn-meta-pill">
                  <div class="learn-meta-label">Epistle Reading</div>
                  <div class="learn-meta-value">${day.epistleRef}</div>
                </div>
                <div class="learn-meta-pill">
                  <div class="learn-meta-label">Gospel Reading</div>
                  <div class="learn-meta-value">${day.gospelRef}</div>
                </div>
              </div>
              ${day.sourceUrl ? `<a class="learn-source-link" href="${day.sourceUrl}" target="_blank" rel="noopener">View source</a>` : ""}
            </div>
            <div class="learn-troparion">
              <div class="learn-troparion-block">
                <div class="learn-meta-label">Troparion · ${day.troparionTone}</div>
                <p>${day.troparionText}</p>
              </div>
              <div class="learn-troparion-block">
                <div class="learn-meta-label">Kontakion · ${day.kontakionTone}</div>
                <p>${day.kontakionText}</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function renderRhythms(data) {
    return `
      <section class="learn-card">
        <div class="learn-card-inner">
          <div class="learn-card-title"><strong>Church Rhythms</strong></div>
          <div class="learn-rhythm-list">
            ${data.dashboard.today.churchRhythms.map((item) => `
              <div class="learn-rhythm-item ${item.status === "completed" ? "is-complete" : ""}">
                <div class="learn-rhythm-check">${item.status === "completed" ? icon("check") : ""}</div>
                <div>
                  <div>${item.title}</div>
                  <small>${item.note}</small>
                </div>
              </div>
            `).join("")}
          </div>
        </div>
      </section>
    `;
  }

  function renderPlanningGrid(data) {
    if (!data.dashboard.today.householdStreamCards.length && !data.dashboard.today.childColumns.length) {
      return `
        <section class="learn-card">
          <div class="learn-card-inner">
            <div class="learn-card-title"><strong>Household Plan</strong><a class="learn-button learn-button-primary" href="/learn/onboarding">Finish Setup</a></div>
            ${renderEmpty("No lessons planned yet", "Add children, subjects, books, and formation materials in Setup to generate your first Learn plan.")}
          </div>
        </section>
      `;
    }
    const columns = data.dashboard.today.childColumns.map((column) => `
      <div class="learn-plan-column">
        <div class="learn-column-head">
          <div class="learn-avatar ${accentClass(column.child.accentToken)}">${column.child.avatarMonogram}</div>
          <div>
            <strong>${column.child.firstName}</strong>
            <span>${column.child.gradeLabel} · Age ${column.child.ageYears}</span>
          </div>
        </div>
        ${column.blocks.map((block) => `
          <div class="learn-task-card">
            <div class="learn-task-top">
              <div>
                <div class="learn-task-title">${block.title}</div>
                <div class="learn-task-subtitle">${block.subtitle}</div>
              </div>
              <div class="learn-task-meta">
                <span>${block.minutesPlanned}m</span>
                <span class="learn-status-dot ${formatStatus(block.status)}"></span>
              </div>
            </div>
          </div>
        `).join("")}
      </div>
    `).join("");

    return `
      <section class="learn-card">
        <div class="learn-card-inner">
          <div class="learn-planning-grid">
            <div class="learn-plan-column">
              <div class="learn-column-head">
                <div>
                  <strong>Household Stream</strong>
                  <span>${data.dashboard.term.label} · ${data.dashboard.schoolYear.label}</span>
                </div>
              </div>
              ${data.dashboard.today.householdStreamCards.map((block) => `
                <div class="learn-task-card">
                  <div class="learn-task-top">
                    <div>
                      <div class="learn-task-title">${block.title}</div>
                      <div class="learn-task-subtitle">${block.subtitle}</div>
                    </div>
                    <div class="learn-task-meta">
                      <span>${block.minutesPlanned}m</span>
                      <span class="learn-status-dot ${formatStatus(block.status)}"></span>
                    </div>
                  </div>
                </div>
              `).join("")}
            </div>
            ${columns}
          </div>
        </div>
      </section>
    `;
  }

  function renderWeeklySummary(data) {
    const summary = data.dashboard.weeklySummary;
    return `
      <aside class="learn-card learn-week-summary-card">
        <div class="learn-card-inner">
          <div class="learn-card-title">
            <strong>This Week</strong>
            <span class="learn-chip-soft">${data.dashboard.term.label}</span>
          </div>
          <div class="learn-week-summary-grid">
            <div class="learn-summary-stat">
              <div class="learn-summary-icon navy">✚</div>
              <div>
                <div class="learn-summary-value">${summary.lessonsCompleted}<span style="font-size:1.2rem"> / ${summary.lessonsPlanned}</span></div>
                <div class="learn-summary-note">Lessons Completed · ${summary.lessonsCompletionPercent}%</div>
              </div>
            </div>
            <div class="learn-summary-stat">
              <div class="learn-summary-icon wine">✒</div>
              <div>
                <div class="learn-summary-value">${summary.narrationsLogged}</div>
                <div class="learn-summary-note">Narrations Logged This Week</div>
              </div>
            </div>
            <div class="learn-summary-stat">
              <div class="learn-summary-icon forest">⌂</div>
              <div>
                <div class="learn-summary-value">${summary.feastDaysAhead}</div>
                <div class="learn-summary-note">Feast Days Ahead · ${summary.nextFeastLabel}</div>
              </div>
            </div>
            <div class="learn-summary-stat">
              <div class="learn-summary-icon gold">📖</div>
              <div style="width:100%">
                <div class="learn-summary-value">${summary.readAloudProgressPercent}%</div>
                <div class="learn-summary-note">Read-Aloud Progress · ${summary.readAloudTitle}</div>
                <div class="learn-progress"><span style="width:${summary.readAloudProgressPercent}%"></span></div>
              </div>
            </div>
          </div>
          <div class="learn-week-summary-action">
            <button class="learn-button" type="button" data-learn-action="planner-edit" data-action-title="Weekly Plan" data-action-body="Review completion, move unfinished work, or open the full week planner.">View Full Week</button>
          </div>
        </div>
      </aside>
    `;
  }

  function defaultSetupState() {
    return {
      householdName: "Your Household",
      parentNames: "",
      parishName: "",
      city: "",
      primaryMethod: "Charlotte Mason",
      calendarType: localStorage.getItem("agapay.learn.calendar") || "julian",
      evaluationModel: "narrative-only",
      graceModeDefault: "light",
      graceArchive: [],
      schoolYearLabel: "Current School Year",
      schoolYearStart: "",
      schoolYearEnd: "",
      children: [],
      cyclePlanning: {
        cycleTitle: "",
        historyFocus: "",
        catechesisFocus: "",
        termTheme: "",
        weekLabel: "",
        notes: ""
      },
      subjects: [],
      books: [],
      formationMaterials: [],
      communityResources: [],
      googleCalendar: {
        targetCalendar: "AGAPAY Learn",
        syncScope: "lessons-feasts-readalouds",
        reminderMinutes: 30
      },
      liturgicalSource: {
        provider: "orthocal",
        hymnProvider: "ponomar",
        manualEpistle: "",
        manualGospel: "",
        troparionTone: "",
        troparionText: "",
        kontakionTone: "",
        kontakionText: "",
        sourceNote: ""
      },
      billing: {
        plan: "free",
        status: "free",
        checkoutSessionId: ""
      },
      coOp: {
        enabled: false,
        name: "",
        city: "",
        nextMeetingDate: "",
        meetingTime: "",
        affiliation: "Orthodox homeschool community",
        patron: "",
        cadence: "Weekly",
        meetingLocation: "",
        description: "",
        members: [],
        scheduleBlocks: [],
        announcements: [],
        resources: [],
        sharedReadAlouds: []
      }
    };
  }

  function readSetupState() {
    try {
      return { ...defaultSetupState(), ...(JSON.parse(localStorage.getItem("agapay.learn.setup") || "{}") || {}) };
    } catch {
      return defaultSetupState();
    }
  }

  function hasSavedSetup() {
    return Boolean(localStorage.getItem("agapay.learn.setup"));
  }

  function writeSetupState(nextState) {
    const setup = { ...readSetupState(), ...nextState };
    localStorage.setItem("agapay.learn.setup", JSON.stringify(setup));
    localStorage.setItem("agapay.learn.calendar", setup.calendarType || "julian");
    return setup;
  }

  function readCommunityResources() {
    try {
      const saved = JSON.parse(localStorage.getItem(LEARN_COMMUNITY_RESOURCE_KEY) || "[]");
      return Array.isArray(saved) ? saved.filter((resource) => resource && resource.title && resource.url) : [];
    } catch {
      return [];
    }
  }

  function writeCommunityResource(resource) {
    const resources = [
      {
        id: resource.id || `community_resource_${Date.now()}`,
        title: resource.title,
        subtitle: resource.subtitle || resource.url,
        url: resource.url,
        category: resource.category || "Orthodox homeschool",
        sharedBy: resource.sharedBy || readSetupState().householdName || "Your Household",
        vetted: false
      },
      ...readCommunityResources()
    ].slice(0, 40);
    localStorage.setItem(LEARN_COMMUNITY_RESOURCE_KEY, JSON.stringify(resources));
    writeSetupState({ communityResources: resources });
    return resources;
  }

  function deleteCommunityResource(resourceId) {
    const resources = readCommunityResources().filter((resource) => resource.id !== resourceId);
    localStorage.setItem(LEARN_COMMUNITY_RESOURCE_KEY, JSON.stringify(resources));
    const setup = readSetupState();
    writeSetupState({
      communityResources: (Array.isArray(setup.communityResources) ? setup.communityResources : [])
        .filter((resource) => resource.id !== resourceId)
    });
    return resources;
  }

  function learnPlan(setup = readSetupState()) {
    return setup.billing?.plan || setup.plan || "free";
  }

  function learnPlanIsPaid(setup = readSetupState()) {
    return ["family", "founding-family", "active"].includes(String(learnPlan(setup)).toLowerCase())
      || String(setup.billing?.status || "").toLowerCase() === "active";
  }

  function learnPrintCount() {
    return Number(localStorage.getItem(LEARN_PRINT_USAGE_KEY) || 0);
  }

  function recordLearnPrint() {
    const nextCount = learnPrintCount() + 1;
    localStorage.setItem(LEARN_PRINT_USAGE_KEY, String(nextCount));
    return nextCount;
  }

  function consumeLearnBillingReturn() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("learn_billing") !== "success") return;
    writeSetupState({
      billing: {
        ...readSetupState().billing,
        plan: "family",
        status: "active",
        checkoutSessionId: params.get("session_id") || ""
      }
    });
    params.delete("learn_billing");
    params.delete("session_id");
    const nextQuery = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`);
  }

  function setupChildren(apiChildren = []) {
    const setup = readSetupState();
    const saved = Array.isArray(setup.children) ? setup.children : [];
    if (saved.length) return saved;
    return [];
  }

  function isSundayIso(civilDate) {
    return new Date(`${civilDate}T00:00:00.000Z`).getUTCDay() === 0;
  }

  function weekdayName(civilDate) {
    return new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(new Date(`${civilDate}T00:00:00.000Z`));
  }

  function isLegacyPlaceholderSubject(subject = {}) {
    return ["subject_math", "subject_science", "subject_language"].includes(subject.id)
      && !String(subject.resource || "").trim();
  }

  function isLegacyPlaceholderFormation(material = {}) {
    return ["formation_prayer", "formation_catechism", "formation_hymn"].includes(material.id)
      && !String(material.source || "").trim();
  }

  function configuredSubjects(setup = readSetupState()) {
    return (setup.subjects || []).filter((subject) => String(subject.title || "").trim() && !isLegacyPlaceholderSubject(subject));
  }

  function configuredBooks(setup = readSetupState()) {
    return (setup.books || []).filter((book) => String(book.title || "").trim());
  }

  function configuredFormationMaterials(setup = readSetupState()) {
    return (setup.formationMaterials || []).filter((item) => String(item.title || "").trim() && !isLegacyPlaceholderFormation(item));
  }

  function rowWithNoSchoolSunday(row, dates) {
    return {
      ...row,
      minutes: (row.minutes || []).map((minutes, index) => isSundayIso(dates[index]) ? 0 : minutes),
      statuses: (row.statuses || []).map((status, index) => isSundayIso(dates[index]) ? "no-school" : status)
    };
  }

  function normalizePlannerWeek(week = {}) {
    const dates = Array.isArray(week.dates) ? week.dates : [];
    const orderedIndexes = dates
      .map((date, index) => ({ date, index }))
      .sort((left, right) => {
        const leftDay = new Date(`${left.date}T00:00:00.000Z`).getUTCDay();
        const rightDay = new Date(`${right.date}T00:00:00.000Z`).getUTCDay();
        return leftDay - rightDay || left.date.localeCompare(right.date);
      })
      .map((entry) => entry.index);
    const reorder = (values = []) => orderedIndexes.map((index) => values[index]);
    const nextDates = reorder(dates);
    const nextLiturgicalDays = reorder(week.liturgicalDays || []).map((day) => ({
      ...day,
      weekdayLabel: weekdayName(day.civilDate)
    }));
    const normalizeRows = (rows = []) => rows.map((row) => rowWithNoSchoolSunday({
      ...row,
      minutes: reorder(row.minutes || []),
      statuses: reorder(row.statuses || [])
    }, nextDates));
    return {
      ...week,
      dates: nextDates,
      liturgicalDays: nextLiturgicalDays,
      householdRows: normalizeRows(week.householdRows || []),
      childRows: normalizeRows(week.childRows || [])
    };
  }

  function graceModeLabel(mode) {
    return {
      full: "Full Plan",
      light: "Light Day",
      "minimum viable": "Minimum Viable",
      "feast only": "Feast Only"
    }[mode] || "Custom Grace";
  }

  function graceModeDetail(mode) {
    return {
      full: "All scheduled lessons stay visible.",
      light: "Keeps core work and gently trims the rest.",
      "minimum viable": "Keeps faith, math, reading, and one core block.",
      "feast only": "Keeps prayer, feast, catechesis, and rest."
    }[mode] || "Uses your saved household Grace Mode rule.";
  }

  function rowMatches(row, terms) {
    const haystack = `${row.title || ""} ${row.subtitle || ""} ${row.detail || ""}`.toLowerCase();
    return terms.some((term) => haystack.includes(term));
  }

  function isGraceKeeper(row, mode, index) {
    if (mode === "full") return true;
    if (mode === "light") return index < 4 || rowMatches(row, ["prayer", "catech", "math", "read-aloud", "morning basket", "scripture"]);
    if (mode === "minimum viable") return index < 2 || rowMatches(row, ["prayer", "catech", "math", "read-aloud", "scripture"]);
    if (mode === "feast only") return rowMatches(row, ["prayer", "church", "catech", "feast", "saint", "hymn", "troparion", "scripture"]);
    return index < 3;
  }

  function graceAdjustedRow(row, mode) {
    if (mode === "full") return { ...row, graceModeApplied: false };
    const multiplier = mode === "light" ? 0.75 : mode === "minimum viable" ? 0.55 : 0.4;
    return {
      ...row,
      graceModeApplied: true,
      statuses: (row.statuses || []).map((status) => status === "planned" ? "reduced" : status),
      minutes: (row.minutes || []).map((minutes) => minutes ? Math.max(5, Math.round(Number(minutes) * multiplier)) : minutes)
    };
  }

  function applyGraceModeRows(rows, mode) {
    const safeRows = Array.isArray(rows) ? rows : [];
    if (!mode || mode === "full") return { visible: safeRows.map((row) => ({ ...row, graceModeApplied: false })), removed: [] };
    const visible = [];
    const removed = [];
    safeRows.forEach((row, index) => {
      if (isGraceKeeper(row, mode, index)) {
        visible.push(graceAdjustedRow(row, mode));
      } else {
        removed.push({
          id: row.id || `removed_${index}`,
          title: row.title || "Untitled lesson",
          detail: row.subtitle || row.detail || "",
          minutes: (row.minutes || []).reduce((sum, minutes) => sum + Number(minutes || 0), 0),
          reason: `${graceModeLabel(mode)} removed this from the active week.`
        });
      }
    });
    return { visible, removed };
  }

    function buildGraceArchiveItems(setup = readSetupState(), mode = setup.graceModeDefault) {
    const subjectRows = configuredSubjects(setup).map((subject, index) => ({
      id: subject.id || `subject_${index}`,
      title: subject.title,
      subtitle: subject.resource || subject.cadence || "",
      minutes: [Number(subject.minutes) || 20],
      statuses: ["planned"]
    }));
    const bookRows = configuredBooks(setup).map((book, index) => ({
      id: book.id || `book_${index}`,
      title: book.role || "Read-Aloud",
      subtitle: `${book.title}${book.author ? ` by ${book.author}` : ""}`,
      minutes: [20],
      statuses: ["planned"]
    }));
    return applyGraceModeRows([...subjectRows, ...bookRows], mode).removed;
  }

  function saveGraceMode(mode) {
    const setup = readSetupState();
    const removed = mode === "full" ? [] : buildGraceArchiveItems(setup, mode);
    const nextArchive = removed.length
      ? [
          {
            id: `grace_archive_${Date.now()}`,
            mode,
            label: graceModeLabel(mode),
            savedAt: new Date().toISOString(),
            items: removed
          },
          ...(Array.isArray(setup.graceArchive) ? setup.graceArchive : [])
        ].slice(0, 8)
      : (Array.isArray(setup.graceArchive) ? setup.graceArchive : []);
    writeSetupState({ graceModeDefault: mode, graceArchive: nextArchive });
  }

  function applySetupState(payload) {
    const setup = readSetupState();
    const setupSaved = hasSavedSetup();
    const patchHousehold = (household = {}) => ({
      ...household,
      name: setup.householdName || household.name || "Your Household",
      parentNames: setup.parentNames ? setup.parentNames.split(",").map((name) => name.trim()).filter(Boolean) : [],
      parishName: setup.parishName || "",
      city: setup.city || "",
      primaryMethod: setup.primaryMethod || household.primaryMethod || "Charlotte Mason",
      liturgicalCalendarType: setup.calendarType || household.liturgicalCalendarType || "julian",
      childrenCount: setupChildren(payload.dashboard?.children || payload.planner?.children || payload.onboarding?.children || payload.formation?.children || []).length
    });
    const patchChildren = (children = []) => setupChildren(children).map((child) => ({
      ...child,
      avatarMonogram: child.avatarMonogram || String(child.firstName || "?").charAt(0).toUpperCase()
    }));
    const patchSchoolYear = (schoolYear = {}) => ({
      ...schoolYear,
      label: setup.schoolYearLabel || "Current School Year",
      startDate: setup.schoolYearStart || "",
      endDate: setup.schoolYearEnd || ""
    });

    ["dashboard", "planner", "formation", "books", "reports", "coOp", "community", "onboarding", "printCenter"].forEach((key) => {
      if (!payload[key]) return;
      payload[key].household = patchHousehold(payload[key].household);
      if (payload[key].children) payload[key].children = patchChildren(payload[key].children);
      if (payload[key].schoolYear) payload[key].schoolYear = patchSchoolYear(payload[key].schoolYear);
    });
    const applyLiturgicalOverrides = (today) => {
      if (!today?.liturgicalDay) return;
      const source = setup.liturgicalSource || {};
      today.liturgicalDay = {
        ...today.liturgicalDay,
        epistleRef: source.manualEpistle || today.liturgicalDay.epistleRef,
        gospelRef: source.manualGospel || today.liturgicalDay.gospelRef,
        troparionTone: source.troparionTone || today.liturgicalDay.troparionTone,
        troparionText: source.troparionText || today.liturgicalDay.troparionText,
        kontakionTone: source.kontakionTone || today.liturgicalDay.kontakionTone,
        kontakionText: source.kontakionText || today.liturgicalDay.kontakionText,
        sourceLabel: source.provider === "manual" ? "Manual parish entry" : (today.liturgicalDay.sourceLabel || "Orthocal.info + Ponomar"),
        sourceNote: source.sourceNote || today.liturgicalDay.sourceNote || ""
      };
    };
    applyLiturgicalOverrides(payload.dashboard?.today);
    applyLiturgicalOverrides(payload.formation?.today);
    applyLiturgicalOverrides(payload.printCenter?.today);
    if (payload.dashboard?.today?.childColumns) {
      const childrenById = new Map((payload.dashboard.children || []).map((child) => [child.id, child]));
      payload.dashboard.today.childColumns = payload.dashboard.today.childColumns
        .map((column) => ({ ...column, child: childrenById.get(column.child?.id) || column.child }))
        .filter((column) => column.child);
    }
    if (payload.dashboard && !setupSaved) {
      payload.dashboard.today.householdStreamCards = [];
      payload.dashboard.today.childColumns = [];
      payload.dashboard.weeklySummary = {
        lessonsCompleted: 0,
        lessonsPlanned: 0,
        lessonsCompletionPercent: 0,
        narrationsLogged: 0,
        feastDaysAhead: payload.dashboard.weeklySummary?.feastDaysAhead || 0,
        nextFeastLabel: payload.dashboard.weeklySummary?.nextFeastLabel || "Set calendar in Setup",
        readAloudProgressPercent: 0,
        readAloudTitle: "Add a read-aloud in Setup"
      };
    }
    if (payload.dashboard && setupSaved) {
      payload.dashboard.activeIndicators = {
        ...payload.dashboard.activeIndicators,
        graceMode: {
          enabled: setup.graceModeDefault !== "full",
          label: "Grace Mode",
          detail: graceModeLabel(setup.graceModeDefault || "light")
        },
        cycle: setup.cyclePlanning?.cycleTitle || payload.dashboard.activeIndicators?.cycle || "Household Cycle"
      };
      payload.dashboard.cycle = {
        ...(payload.dashboard.cycle || {}),
        year: {
          ...(payload.dashboard.cycle?.year || {}),
          title: setup.cyclePlanning?.cycleTitle || payload.dashboard.cycle?.year?.title || "Household Cycle"
        },
        topics: [
          ...(setup.cyclePlanning?.historyFocus ? [{ subjectType: "history", title: setup.cyclePlanning.historyFocus }] : []),
          ...(setup.cyclePlanning?.catechesisFocus ? [{ subjectType: "catechesis", title: setup.cyclePlanning.catechesisFocus }] : [])
        ]
      };
    }
    if (payload.planner?.week?.childRows) {
      const childrenById = new Map((payload.planner.children || []).map((child) => [child.id, child]));
      payload.planner.week.childRows = payload.planner.week.childRows
        .map((row) => ({ ...row, child: childrenById.get(row.child?.id || row.childId) || row.child }))
        .filter((row) => row.child);
    }
    if (payload.planner) {
      payload.planner.week = normalizePlannerWeek(payload.planner.week || {});
      payload.planner.cycle = {
        ...(payload.planner.cycle || {}),
        year: {
          ...(payload.planner.cycle?.year || {}),
          title: setupSaved ? (setup.cyclePlanning?.cycleTitle || "Household Cycle") : "Setup needed"
        },
        visibleFrameworks: setupSaved
          ? [
              { type: "history", label: setup.cyclePlanning?.historyFocus || "Add a history focus in Setup" },
              { type: "catechesis", label: setup.cyclePlanning?.catechesisFocus || "Add a catechesis focus in Setup" },
              { type: "term", label: setup.cyclePlanning?.termTheme || "Add a term theme in Setup" },
              { type: "week", label: setup.cyclePlanning?.weekLabel || "Add a week label in Setup" }
            ]
          : []
      };
      payload.planner.curriculum = {
        ...payload.planner.curriculum,
        activePackage: {
          ...(payload.planner.curriculum?.activePackage || {}),
          title: setupSaved ? `${setup.householdName || "Household"} Plan` : "Setup needed",
          summary: setupSaved
            ? "Built from the subjects, books, and formation materials saved in Setup."
            : "Finish Setup to add curriculum, books, and formation materials."
        },
        mappingSummary: setupSaved
          ? [
              `${configuredSubjects(setup).length} subjects configured.`,
              `${configuredBooks(setup).length} books/read-alouds configured.`,
              `${configuredFormationMaterials(setup).length} formation materials configured.`
            ]
          : []
      };
      const subjectRows = configuredSubjects(setup).map((subject, index) => ({
        id: subject.id || `subject_${index}`,
        title: subject.title,
        subtitle: subject.resource || "Add resource in Setup",
        priority: index + 1,
        minutes: payload.planner.week.dates.map((date) => isSundayIso(date) ? 0 : Number(subject.minutes) || 20),
        statuses: payload.planner.week.dates.map((date) => isSundayIso(date) ? "no-school" : "planned")
      }));
      const readAloudRows = configuredBooks(setup).map((book, index) => ({
        id: book.id || `book_${index}`,
        title: book.role || "Read-Aloud",
        subtitle: `${book.title}${book.author ? ` by ${book.author}` : ""}`,
        priority: subjectRows.length + index + 1,
        minutes: payload.planner.week.dates.map((date) => isSundayIso(date) ? 0 : 20),
        statuses: payload.planner.week.dates.map((date) => isSundayIso(date) ? "no-school" : "planned")
      }));
      const graceMode = setup.graceModeDefault || "light";
      const graceResult = applyGraceModeRows(setupSaved ? [...subjectRows, ...readAloudRows] : [], graceMode);
      payload.planner.week.householdRows = setupSaved ? graceResult.visible : [];
      payload.planner.graceMode = {
        ...(payload.planner.graceMode || {}),
        enabled: graceMode !== "full",
        rule: {
          ...(payload.planner.graceMode?.rule || {}),
          mode: graceMode
        },
        seasonAdjustment: {
          ...(payload.planner.graceMode?.seasonAdjustment || {}),
          title: graceModeLabel(graceMode),
          summary: graceModeDetail(graceMode)
        },
        changed: graceResult.removed.length
          ? graceResult.removed.map((item) => `${item.title} saved to Grace Archive`)
          : ["No lessons removed in this mode."],
        removedItems: graceResult.removed,
        archive: Array.isArray(setup.graceArchive) ? setup.graceArchive : []
      };
      if (!setupSaved) payload.planner.week.childRows = [];
      if (setupSaved && readAloudRows.length) {
        const firstBook = configuredBooks(setup)[0];
        payload.planner.readAloud = {
          book: { title: firstBook.title, author: firstBook.author || "Household" },
          assignment: { progressPercent: 0, currentLabel: firstBook.role || "Read-Aloud" }
        };
      }
      if (!setupSaved) payload.planner.readAloud = null;
    }
    if (payload.onboarding?.onboarding?.preferences) {
      payload.onboarding.onboarding.preferences = {
        ...payload.onboarding.onboarding.preferences,
        calendarType: setup.calendarType,
        evaluationModel: setup.evaluationModel,
        graceModeDefault: setup.graceModeDefault
      };
    }
    if (payload.books) {
      const bookEntries = configuredBooks(setup);
      const formationEntries = configuredFormationMaterials(setup);
      const copyworkEntries = [
        ...bookEntries.filter((book) => /copywork/i.test(book.role || "")),
        ...formationEntries
      ];
      payload.books.currentReadAlouds = bookEntries.map((book, index) => ({
        id: book.id || `local_book_${index}`,
        title: book.title,
        author: book.author || "Household",
        progressPercent: 0,
        assignmentLabel: book.role || "Read-Aloud",
        streamLabel: book.role || "Read-Aloud"
      }));
      payload.books.libraryBooks = setupSaved ? bookEntries.map((book, index) => ({
        id: book.id || `library_book_${index}`,
        title: book.title,
        author: book.author || "Household",
        category: book.role || "Household Library",
        ageRange: "Configured in Setup",
        orthodox: /orthodox|saint|church|catech|scripture|hymn/i.test(`${book.title} ${book.role}`),
        progressPercent: 0
      })) : [];
      payload.books.orthodoxSuggestions = [];
      payload.books.copyworkSources = setupSaved ? copyworkEntries.map((entry, index) => ({
        id: entry.id || `copywork_${index}`,
        title: entry.title,
        detail: entry.source || entry.author || entry.role || "Configured in Setup"
      })) : [];
      if (!setupSaved) payload.books.currentReadAlouds = [];
    }
    if (payload.formation) {
      const formationEntries = configuredFormationMaterials(setup);
      const firstBook = configuredBooks(setup)[0];
      payload.formation.recitationTracks = setupSaved ? formationEntries.map((item, index) => ({
        id: item.id || `formation_${index}`,
        title: item.title,
        sourceKind: item.source || "Household",
        progressPercent: 0,
        status: item.cadence || "planned"
      })) : [];
      payload.formation.catechesisCycle = {
        ...(payload.formation.catechesisCycle || {}),
        title: setupSaved ? (setup.cyclePlanning?.catechesisFocus || "Catechesis not configured") : "Setup needed",
        currentLesson: setupSaved ? (setup.cyclePlanning?.termTheme || "Add catechesis materials in Setup") : "Add catechesis materials in Setup",
        doctrinalTopic: setupSaved ? (setup.cyclePlanning?.notes || setup.cyclePlanning?.catechesisFocus || "Use Setup to define this term's catechesis focus.") : "Finish Setup to begin catechesis planning.",
        lessonNumber: formationEntries.length ? 1 : 0,
        totalLessons: formationEntries.length,
        readAloudPairing: firstBook ? `${firstBook.title}${firstBook.author ? ` by ${firstBook.author}` : ""}` : "Add a read-aloud in Setup"
      };
      const hymns = [];
      if (payload.formation.today?.liturgicalDay?.troparionText) {
        hymns.push({
          title: "Weekday Troparion",
          tone: payload.formation.today.liturgicalDay.troparionTone || "Ponomar",
          source: payload.formation.today.liturgicalDay.sourceLabel || "Ponomar",
          status: "Available today"
        });
      }
      if (payload.formation.today?.liturgicalDay?.kontakionText) {
        hymns.push({
          title: "Weekday Kontakion",
          tone: payload.formation.today.liturgicalDay.kontakionTone || "Ponomar",
          source: payload.formation.today.liturgicalDay.sourceLabel || "Ponomar",
          status: "Available today"
        });
      }
      payload.formation.hymnStudies = hymns;
      payload.formation.enrichmentBlocks = setupSaved ? configuredSubjects(setup)
        .filter((subject) => /art|music|nature|science|history|poet|composer|picture/i.test(`${subject.title} ${subject.resource}`))
        .map((subject) => ({
          blockType: subject.title,
          title: subject.resource || subject.cadence || "Configured in Setup",
          minutesPlanned: Number(subject.minutes) || 20
        })) : [];
      payload.formation.natureJournalEntries = [];
    }
    if (payload.reports) {
      const subjectsCount = setupSaved ? configuredSubjects(setup).length + configuredBooks(setup).length + configuredFormationMaterials(setup).length : 0;
      const children = payload.reports.children || [];
      payload.reports.weeklySummary = {
        ...(payload.reports.weeklySummary || {}),
        lessonsCompleted: 0,
        lessonsPlanned: children.length * subjectsCount,
        lessonsCompletionPercent: 0,
        narrationsLogged: 0,
        readAloudProgressPercent: 0,
        feastDaysAhead: payload.reports.weeklySummary?.feastDaysAhead || 0,
        nextFeastLabel: payload.reports.weeklySummary?.nextFeastLabel || "Set calendar in Setup"
      };
      payload.reports.narrationLogs = [];
      payload.reports.natureJournalEntries = [];
      payload.reports.reportCards = setupSaved && children.length ? children.map((child) => ({
        child,
        exportPreview: {
          summary: `${child.firstName}'s year-end report will populate as lessons, narrations, nature study, and feast days are logged.`
        }
      })) : [];
      payload.reports.transcripts = setupSaved && children.length ? children.map((child) => ({
        child,
        exportPreview: {
          gradeSpan: child.gradeLabel || "Configured learner",
          records: []
        }
      })) : [];
      payload.reports.academicRecords = [];
    }
    if (payload.coOp) {
      payload.coOp.enabled = Boolean(setup.coOp?.enabled);
      payload.coOp.coOp = {
        ...(payload.coOp.coOp || {}),
        enabled: Boolean(setup.coOp?.enabled),
        name: setup.coOp?.name || "Your Homeschool Co-op",
        city: setup.coOp?.city || "",
        affiliation: setup.coOp?.affiliation || "Orthodox homeschool community",
        patron: setup.coOp?.patron || "",
        description: setup.coOp?.description || "",
        learningCycleLabel: setup.coOp?.meetingTime || "Set schedule in Setup"
      };
      payload.coOp.scheduleBlocks = Array.isArray(setup.coOp?.scheduleBlocks) ? setup.coOp.scheduleBlocks : [];
      payload.coOp.members = setup.coOp?.enabled
        ? [
            { id: "household_member", householdName: setup.householdName || "Your Household", childrenCount: setupChildren().length, role: "lead", agapayEmail: "" },
            ...(Array.isArray(setup.coOp?.members) ? setup.coOp.members : [])
          ]
        : [];
      payload.coOp.announcements = Array.isArray(setup.coOp?.announcements) ? setup.coOp.announcements : [];
      payload.coOp.sharedReadAlouds = Array.isArray(setup.coOp?.sharedReadAlouds) ? setup.coOp.sharedReadAlouds : [];
      payload.coOp.resources = Array.isArray(setup.coOp?.resources) ? setup.coOp.resources : [];
      if (setup.coOp?.nextMeetingDate) {
        payload.coOp.meeting = {
          ...(payload.coOp.meeting || {}),
          startsAt: setup.coOp.nextMeetingDate,
          locationLabel: setup.coOp.meetingLocation || setup.coOp.city || ""
        };
      }
    }
    if (payload.community) {
      const savedResources = [
        ...readCommunityResources(),
        ...(Array.isArray(setup.communityResources) ? setup.communityResources : [])
      ];
      const uniqueResources = Array.from(new Map(savedResources
        .filter((resource) => resource?.title && resource?.url)
        .map((resource) => [resource.id || `${resource.title}:${resource.url}`, resource])).values());
      payload.community.communityResources = uniqueResources;
      payload.community.sharingGuidance = [
        "Orthodox and parish-friendly",
        "Useful for homeschool planning",
        "Clear source and working link"
      ];
    }
    return payload;
  }

  function renderCalendarSyncCard(data) {
    const sync = data.dashboard.googleCalendarSync;
    const isConnected = Boolean(sync.connected);
    return `
      <section class="learn-card">
        <div class="learn-card-inner">
          <div class="learn-card-title">
            <strong>Google Calendar Sync</strong>
            <span class="${isConnected ? "learn-chip-soft" : "learn-chip"}">${isConnected ? "Connected" : "Not connected"}</span>
          </div>
          <p class="learn-text-muted">${sync.description}</p>
          <div class="learn-sync-grid">
            <div class="learn-side-line"><b>Account</b><span>${sync.accountLabel}</span></div>
            <div class="learn-side-line"><b>Target Calendar</b><span>${sync.calendarLabel}</span></div>
            <div class="learn-side-line"><b>Sync Scope</b><span>${sync.syncScopeLabel}</span></div>
            <div class="learn-side-line"><b>Last Sync</b><span>${sync.lastSyncLabel}</span></div>
            <div class="learn-side-line"><b>Next Sync</b><span>${sync.nextSyncLabel}</span></div>
            <div class="learn-side-line"><b>Events Planned</b><span>${sync.eventsPlanned}</span></div>
          </div>
          <div class="learn-side-line"><b>Reminder</b><span>${sync.reminderLabel}</span></div>
          <div class="learn-dialog-actions">
            <button class="learn-button learn-button-primary" type="button" data-learn-action="google-calendar-connect" data-action-title="Google Calendar Sync" data-action-body="Connect the household planner to Google Calendar so lessons, feast days, and read-aloud blocks can be mirrored into the family calendar." data-calendar-account="${sync.accountLabel}" data-calendar-target="${sync.calendarLabel}" data-calendar-scope="${sync.syncScopeLabel}">${isConnected ? "Manage Sync" : "Connect Google Calendar"}</button>
            <button class="learn-button" type="button" data-learn-action="google-calendar-sync" data-action-title="Sync Preview" data-action-body="Preview which lesson blocks and feast days would be exported to Google Calendar once the account is connected.">Sync Preview</button>
          </div>
        </div>
      </section>
    `;
  }

  function renderHistoryCard(data) {
    const history = data.dashboard.thisDayInHistory;
    return `
      <section class="learn-card">
        <div class="learn-card-inner">
          <div class="learn-card-title">
            <strong>${history.label}</strong>
            <span class="learn-chip-soft">${history.year}</span>
          </div>
          <div class="learn-feature-stat">
            <b>${history.title}</b>
            <span>${history.sourceLabel}</span>
          </div>
          <p class="learn-text-muted">${history.summary}</p>
          <button class="learn-button" type="button" data-learn-action="planner-edit" data-action-title="This Day in History" data-action-body="Add a short history note, saint commemoration, or narration prompt to today’s household rhythm.">Use as Narration Prompt</button>
        </div>
      </section>
    `;
  }

  function renderDashboard(data) {
    return `
      ${renderTopbar(data)}
      <div class="learn-shell learn-dashboard-shell">
        <div class="learn-dashboard-ornament" aria-hidden="true"><span></span></div>
        <div class="learn-dashboard-hero-row">
          ${renderLiturgyCard(data)}
        </div>
        <div class="learn-dashboard-ornament is-small" aria-hidden="true"><span></span></div>
        ${renderRhythms(data)}
        <div class="learn-dashboard-grid">
          ${renderPlanningGrid(data)}
          <div class="learn-side-stack">
          ${renderWeeklySummary(data)}
            ${renderHistoryCard(data)}
          </div>
        </div>
      </div>
    `;
  }

  function renderCommunity(payload) {
    const data = payload.community;
    return `
      ${renderSimpleTopbar("Community Resources", "Orthodox homeschool links shared by families in the community.", `<div class="learn-chip">${data.communityResources.length} resources</div><div class="learn-chip-soft">Vetted + shared links</div>`) }
      <div class="learn-shell">
        <section class="learn-card">
          <div class="learn-card-inner">
            <div class="learn-card-title">
              <strong>Shareable Links</strong>
              <button class="learn-button learn-button-primary" type="button" data-learn-action="community-share" data-action-title="Share a Community Resource" data-action-body="Add a link that helps Orthodox homeschool families with books, saints, liturgy, or family life.">Share a Link</button>
            </div>
            <div class="learn-inline-grid">
              ${data.sharingGuidance.map((item) => `<article class="learn-mini-card"><strong>${item}</strong><span>Sharing guidance</span><small>Keep links clear, useful, and easy to scan.</small></article>`).join("")}
            </div>
          </div>
        </section>
        <div class="learn-two-column">
          <section class="learn-card">
            <div class="learn-card-inner">
              <div class="learn-card-title">
                <strong>Community Picks</strong>
                <span class="learn-chip-soft">Orthodox homeschool resources</span>
              </div>
              <div class="learn-community-list">
                ${data.communityResources.length ? data.communityResources.map((resource) => `
                  <article class="learn-resource-row">
                    <div>
                      <div class="learn-resource-head">
                        <strong>${resource.title}</strong>
                        <span class="learn-chip-soft">${resource.category}</span>
                      </div>
                      <p>${resource.subtitle}</p>
                      <small>Shared by ${resource.sharedBy}${resource.vetted ? " · vetted" : ""}</small>
                    </div>
                    <div class="learn-dialog-actions">
                      <a class="learn-button" href="${resource.url}" target="_blank" rel="noopener">Open</a>
                      <button class="learn-button" type="button" data-learn-action="community-delete" data-resource-id="${resource.id || ""}">Remove</button>
                    </div>
                  </article>
                `).join("") : renderEmpty("No community links yet", "Share the first Orthodox homeschool resource for this community.")}
              </div>
            </div>
          </section>
          <aside class="learn-side-stack">
            <section class="learn-card">
              <div class="learn-card-inner">
                <div class="learn-card-title"><strong>Community Submissions</strong></div>
                <div class="learn-side-line"><b>Curriculum</b><span>Living books, copywork, and reading plans</span></div>
                <div class="learn-side-line"><b>Church Life</b><span>Feast-day crafts, saints, and family prayers</span></div>
                <div class="learn-side-line"><b>Practical</b><span>Schedule templates, checklists, and printable aids</span></div>
              </div>
            </section>
            <section class="learn-card">
              <div class="learn-card-inner">
                <div class="learn-card-title"><strong>History Prompt</strong></div>
                <div class="learn-feature-stat">
                  <b>${data.thisDayInHistory.title}</b>
                  <span>${data.thisDayInHistory.year}</span>
                </div>
                <p class="learn-text-muted">${data.thisDayInHistory.summary}</p>
              </div>
            </section>
          </aside>
        </div>
      </div>
    `;
  }

  function renderPlaceholder() {
    const key = currentPageKey();
    const labels = Object.fromEntries(navItems.map((item) => [item.key, item.label]));
    const label = labels[key] || "Learn";
    return `
      ${renderUtilityBar()}
      ${renderPageHeader(label, "Phase 1 shell route in place. The real implementation begins in the next Learn phase.", `<div class="learn-chip">Learn product flagged on</div>`)}
      <div class="learn-shell">
        <section class="learn-card learn-placeholder-hero">
          <div class="learn-card-inner">
            <h1>Shared navigation, product access, and future route scaffolding are ready.</h1>
            <p class="learn-text-muted">This page is intentionally a placeholder in Phase 1 so the dashboard can land cleanly without bleeding into Planner, Formation, Books, Reports, Print Center, or Co-op implementation work.</p>
          </div>
        </section>
        <section class="learn-placeholder-grid">
          <div class="learn-card learn-placeholder-card"><div class="learn-card-inner"><div class="learn-card-title"><strong>Route Ready</strong></div><p class="learn-text-muted">Extensionless Learn route, local dev support, and worker asset mapping are active.</p></div></div>
          <div class="learn-card learn-placeholder-card"><div class="learn-card-inner"><div class="learn-card-title"><strong>Domain Ready</strong></div><p class="learn-text-muted">Schema, TypeScript models, and seeded repositories already cover the future page contracts.</p></div></div>
          <div class="learn-card learn-placeholder-card"><div class="learn-card-inner"><div class="learn-card-title"><strong>Printability Ready</strong></div><p class="learn-text-muted">Placeholder print jobs, report cards, transcripts, and academic record types are in the Phase 1 foundation.</p></div></div>
        </section>
      </div>
    `;
  }

  function renderPlannerTopbar(payload) {
    const planner = payload.planner;
    return `
      ${renderUtilityBar(payload)}
      ${renderPageHeader("Planner", `${planner.week.label} · ${planner.week.seasonLabel}`, `
          <div class="learn-chip">${planner.graceMode.seasonAdjustment.title} · ${planner.graceMode.rule.mode}</div>
          <div class="learn-chip-soft">${planner.cycle.year.title}</div>
          <div class="learn-chip-soft">${planner.curriculum.activePackage.title}</div>
          <div class="learn-segmented" id="calendarToggle">
            ${planner.calendarToggle.options.map((option) => `
              <button type="button" data-calendar="${option.value}" class="${planner.calendarToggle.active === option.value ? "is-active" : ""}">
                ${option.label}
              </button>
            `).join("")}
          </div>
      `)}
    `;
  }

  function renderPlannerControls(activeView) {
    const activeTerm = requestedPlannerTerm();
    return `
      <section class="learn-planner-control-row">
        <div class="learn-planner-controls" aria-label="Planner view">
          ${["day", "week", "term", "year"].map((view) => `
            <button type="button" data-planner-view="${view}" class="${activeView === view ? "is-active" : ""}">${view[0].toUpperCase()}${view.slice(1)}</button>
          `).join("")}
        </div>
        <div class="learn-term-selector" aria-label="Term selector">
          ${[1, 2, 3].map((term) => `
            <button type="button" data-planner-term="${term}" class="${activeTerm === term ? "is-active" : ""}">Term ${term}</button>
          `).join("")}
        </div>
      </section>
    `;
  }

  function renderWeekGrid(payload) {
    const planner = payload.planner;
    const days = planner.week.liturgicalDays;
    const rows = [...planner.week.householdRows, ...planner.week.childRows];
    return `
      <section class="learn-card learn-week-card">
        <div class="learn-card-inner">
          <div class="learn-card-title">
            <strong>Week View</strong>
            <span class="learn-chip-soft">${planner.calendarToggle.description}</span>
          </div>
          <div class="learn-week-grid" style="--week-days:${days.length}">
            <div class="learn-week-label">Liturgical Week</div>
            ${days.map((day) => `
              <div class="learn-week-day ${isSundayIso(day.civilDate) ? "is-sunday" : ""}">
                <strong>${day.weekdayLabel || weekdayName(day.civilDate)}</strong>
                <b>${day.civilDate.slice(5)}</b>
                <span>${day.feastTitle}</span>
                <small>${day.fastingRule} · ${day.tone}</small>
              </div>
            `).join("")}
            ${rows.map((row) => `
              <div class="learn-week-row-label ${row.child ? "is-child" : ""}">
                ${row.child ? `<span class="learn-avatar ${accentClass(row.child.accentToken)}">${row.child.avatarMonogram}</span>` : ""}
                <div>
                  <strong>${row.title}</strong>
                  <span>${row.detail || row.subtitle || ""}${row.graceModeApplied ? " · Grace Mode adjusted" : ""}</span>
                </div>
              </div>
              ${row.minutes.map((minutes, index) => `
                <div class="learn-week-cell ${row.statuses[index]}">
                  ${row.statuses[index] === "no-school" ? "<span>No school</span>" : minutes ? `<strong>${minutes}m</strong><span>${row.statuses[index]}</span>` : "<span>-</span>"}
                </div>
              `).join("")}
            `).join("")}
          </div>
          ${rows.length ? "" : renderEmpty("No planner rows yet", "Finish Setup to add subjects, books, and formation materials to this week.")}
        </div>
      </section>
    `;
  }

  function renderPlannerSidebar(payload) {
    const planner = payload.planner;
    return `
      <aside class="learn-planner-sidebar">
        <section class="learn-card"><div class="learn-card-inner">
          <div class="learn-card-title"><strong>Upcoming Feasts</strong></div>
          ${planner.upcomingFeasts.map((feast) => `<div class="learn-side-line"><b>${feast.civilDate.slice(5)}</b><span>${feast.title}</span><small>${feast.fastingRule}</small></div>`).join("")}
        </div></section>
        <section class="learn-card"><div class="learn-card-inner">
          <div class="learn-card-title"><strong>Read-Aloud</strong></div>
          ${planner.readAloud ? `<p class="learn-text-muted">${planner.readAloud.book.title}</p><div class="learn-progress"><span style="width:${planner.readAloud.assignment.progressPercent}%"></span></div><small>${planner.readAloud.assignment.currentLabel}</small>` : renderEmpty("No read-aloud selected", "Add a book in Setup to create pacing.")}
        </div></section>
        <section class="learn-card"><div class="learn-card-inner">
          <div class="learn-card-title"><strong>Quick Reschedule</strong></div>
          <label class="learn-field">Move selected activities to <input type="date" /></label>
          <button class="learn-button learn-button-primary" type="button" data-learn-action="planner-edit" data-action-title="Quick Reschedule" data-action-body="Choose one or more lesson blocks, pick a target date, and save a draft reschedule before changing the live plan.">Reschedule</button>
        </div></section>
        <section class="learn-card"><div class="learn-card-inner">
          <div class="learn-card-title"><strong>Grace Mode</strong></div>
          <p class="learn-text-muted">${planner.graceMode.seasonAdjustment.summary}</p>
          <div class="learn-grace-mode-grid">
            ${["full", "light", "minimum viable", "feast only"].map((mode) => `
              <button type="button" class="learn-grace-mode-button ${planner.graceMode.rule.mode === mode ? "is-active" : ""}" data-learn-action="grace-mode-set" data-grace-mode="${mode}">
                <strong>${graceModeLabel(mode)}</strong>
                <span>${graceModeDetail(mode)}</span>
              </button>
            `).join("")}
          </div>
          ${planner.graceMode.changed.map((entry) => `<div class="learn-change-line">${entry}</div>`).join("")}
          ${planner.graceMode.removedItems?.length ? `
            <div class="learn-grace-archive">
              <strong>Saved for later</strong>
              ${planner.graceMode.removedItems.map((item) => `<div class="learn-side-line"><b>${item.title}</b><span>${item.detail || "Return when the week has room."}</span></div>`).join("")}
            </div>
          ` : ""}
          ${planner.graceMode.archive?.length ? `
            <details class="learn-grace-history">
              <summary>Grace Archive History</summary>
              ${planner.graceMode.archive.map((entry) => `<div class="learn-change-line">${entry.label} · ${entry.items.length} saved</div>`).join("")}
            </details>
          ` : ""}
        </div></section>
      </aside>
    `;
  }

  function renderCycleCurriculum(payload) {
    const planner = payload.planner;
    return `
      <section class="learn-planner-meta">
        <div class="learn-card"><div class="learn-card-inner">
          <div class="learn-card-title"><strong>Cycle Planning</strong></div>
          ${planner.cycle.visibleFrameworks.map((entry) => `<div class="learn-side-line"><b>${entry.type}</b><span>${entry.label}</span></div>`).join("")}
        </div></div>
        <div class="learn-card"><div class="learn-card-inner">
          <div class="learn-card-title"><strong>Curriculum Package</strong></div>
          <p class="learn-text-muted">${planner.curriculum.activePackage.summary}</p>
          ${planner.curriculum.mappingSummary.map((entry) => `<div class="learn-change-line">${entry}</div>`).join("")}
        </div></div>
      </section>
    `;
  }

  function plannerRows(payload) {
    const week = payload.planner.week || {};
    return [...(week.householdRows || []), ...(week.childRows || [])];
  }

  function renderDayView(payload) {
    const planner = payload.planner;
    const rows = plannerRows(payload);
    const dayIndex = Math.max(0, (planner.week.dates || []).findIndex((date) => !isSundayIso(date)));
    const day = planner.week.liturgicalDays?.[dayIndex] || planner.week.liturgicalDays?.[0];
    const dayRows = rows
      .map((row) => ({
        ...row,
        minutesToday: row.minutes?.[dayIndex] || 0,
        statusToday: row.statuses?.[dayIndex] || "empty"
      }))
      .filter((row) => row.statusToday !== "empty" && row.statusToday !== "no-school" && row.minutesToday);
    return `
      <section class="learn-planner-layout">
        <section class="learn-card">
          <div class="learn-card-inner">
            <div class="learn-card-title">
              <strong>Day View</strong>
              <span class="learn-chip-soft">${day ? `${weekdayName(day.civilDate)} · ${day.civilDate.slice(5)}` : "No day selected"}</span>
            </div>
            ${day ? `
              <div class="learn-calendar-tile">
                <b>${day.feastTitle}</b>
                <span>${day.fastingRule}</span>
                <small>${day.tone || ""}</small>
              </div>
            ` : ""}
            ${day && isSundayIso(day.civilDate)
              ? renderEmpty("Sunday is unscheduled", "AGAPAY Learn keeps Sunday free from school lessons.")
              : dayRows.length
                ? dayRows.map((row) => `<div class="learn-schedule-row"><b>${row.minutesToday}m</b><div><strong>${row.title}</strong><small>${row.detail || row.subtitle || ""}</small></div><span>${row.statusToday}</span></div>`).join("")
                : renderEmpty("No lessons scheduled", "Add subjects, books, or formation materials in Setup to build this day.")
            }
          </div>
        </section>
        ${renderPlannerSidebar(payload)}
      </section>
    `;
  }

  function renderTermView(payload) {
    const setup = readSetupState();
    const activeTerm = requestedPlannerTerm();
    const termRange = ["Aug 18 - Nov 7", "Jan 5 - Mar 27", "Apr 6 - Jun 26"][activeTerm - 1] || "Current term";
    const subjects = configuredSubjects(setup);
    const books = configuredBooks(setup);
    const materials = configuredFormationMaterials(setup);
    const hasContent = subjects.length || books.length || materials.length;
    if (!hasSavedSetup() || !hasContent) {
      return `
        <section class="learn-card">
          <div class="learn-card-inner">
            <div class="learn-card-title"><strong>Term ${activeTerm} Plan</strong><span class="learn-chip-soft">${termRange}</span><a class="learn-button learn-button-primary" href="/learn/onboarding">Open Setup</a></div>
            ${renderEmpty("No term plan yet", "Add subjects, books, formation materials, and cycle notes in Setup before building a term plan.")}
          </div>
        </section>
      `;
    }
    const cycle = setup.cyclePlanning || {};
    const termCards = [
      { title: `Term ${activeTerm}`, value: termRange, detail: cycle.termTheme || "Term theme comes from Setup" },
      { title: "Subjects", value: subjects.length, detail: "Configured curriculum areas" },
      { title: "Books", value: books.length, detail: "Read-alouds and assigned books" },
      { title: "Formation", value: materials.length, detail: "Catechesis, hymnody, prayers, and memory work" },
      { title: "Cycle", value: cycle.cycleTitle || "Not set", detail: cycle.historyFocus || "Add a cycle focus in Setup" }
    ];
    const summaryItems = [
      ...subjects.map((subject) => `${subject.title}: ${subject.cadence || "cadence not set"}${subject.resource ? ` · ${subject.resource}` : ""}`),
      ...books.map((book) => `${book.role || "Book"}: ${book.title}${book.author ? ` by ${book.author}` : ""}`),
      ...materials.map((material) => `${material.title}: ${material.cadence || "cadence not set"}${material.source ? ` · ${material.source}` : ""}`)
    ];
    return `
      <section class="learn-term-shell">
        <div class="learn-term-main">
          <div class="learn-term-cards">
            ${termCards.map((card) => `<article class="learn-term-card"><strong>${card.title}</strong><span>${card.detail}</span><b>${card.value}</b></article>`).join("")}
          </div>
          <section class="learn-card"><div class="learn-card-inner">
            <div class="learn-card-title"><strong>Term Materials</strong><a class="learn-button" href="/learn/onboarding">Edit Setup</a></div>
            ${summaryItems.map((item) => `<div class="learn-change-line">${item}</div>`).join("")}
          </div></section>
          <section class="learn-term-summaries">
            <div class="learn-card"><div class="learn-card-inner"><div class="learn-card-title"><strong>Cycle Notes</strong></div><div class="learn-side-line"><b>History</b><span>${cycle.historyFocus || "Add in Setup"}</span></div><div class="learn-side-line"><b>Catechesis</b><span>${cycle.catechesisFocus || "Add in Setup"}</span></div><div class="learn-side-line"><b>Term</b><span>${cycle.termTheme || "Add in Setup"}</span></div></div></div>
            <div class="learn-card"><div class="learn-card-inner"><div class="learn-card-title"><strong>Children</strong></div>${(payload.planner.children || []).length ? payload.planner.children.map((child) => `<div class="learn-side-line"><b>${child.firstName}</b><span>${child.gradeLabel || "Stage not set"}${child.ageYears ? ` · Age ${child.ageYears}` : ""}</span></div>`).join("") : renderEmpty("No children yet", "Add children in Setup.")}</div></div>
          </section>
        </div>
        <aside class="learn-card"><div class="learn-card-inner">
          <div class="learn-card-title"><strong>Term Summary</strong></div>
          <div class="learn-summary-stat"><div class="learn-summary-value">Term ${activeTerm}</div><div class="learn-summary-note">${termRange}</div></div>
          <div class="learn-summary-stat"><div class="learn-summary-value">${subjects.length}</div><div class="learn-summary-note">Subjects</div></div>
          <div class="learn-summary-stat"><div class="learn-summary-value">${books.length}</div><div class="learn-summary-note">Books</div></div>
          <div class="learn-summary-stat"><div class="learn-summary-value">${materials.length}</div><div class="learn-summary-note">Formation materials</div></div>
          <div class="learn-summary-stat"><div class="learn-summary-value">${(payload.planner.children || []).length}</div><div class="learn-summary-note">Children tracked</div></div>
          <button class="learn-button learn-button-primary" type="button" data-learn-action="planner-edit" data-action-title="Generate Week Plans" data-action-body="Draft weekly plans from term pacing, Grace Mode, feast days, and child track settings.">Generate Week Plans</button>
        </div></aside>
      </section>
    `;
  }

  function renderYearView(payload) {
    const setup = readSetupState();
    const subjects = configuredSubjects(setup);
    const books = configuredBooks(setup);
    const materials = configuredFormationMaterials(setup);
    const hasContent = hasSavedSetup() && (subjects.length || books.length || materials.length);
    return `
      <section class="learn-card">
        <div class="learn-card-inner">
          <div class="learn-card-title">
            <strong>Year View</strong>
            <span class="learn-chip-soft">${setup.schoolYearLabel || payload.planner.schoolYear?.label || "Current School Year"}</span>
          </div>
          ${hasContent ? `
            <div class="learn-inline-grid">
              <article class="learn-mini-card"><strong>School Year</strong><span>${setup.schoolYearStart || "Start not set"} to ${setup.schoolYearEnd || "End not set"}</span><small>Dates come from Setup</small></article>
              <article class="learn-mini-card"><strong>Subjects</strong><span>${subjects.length}</span><small>${subjects.map((subject) => subject.title).join(", ") || "None"}</small></article>
              <article class="learn-mini-card"><strong>Books</strong><span>${books.length}</span><small>${books.map((book) => book.title).join(", ") || "None"}</small></article>
              <article class="learn-mini-card"><strong>Formation</strong><span>${materials.length}</span><small>${materials.map((item) => item.title).join(", ") || "None"}</small></article>
            </div>
          ` : renderEmpty("No year plan yet", "Add school-year dates, subjects, books, formation materials, and cycle notes in Setup.")}
        </div>
      </section>
    `;
  }

  function renderActivePlannerView(payload) {
    if (payload.planner.activeView === "day") return renderDayView(payload);
    if (payload.planner.activeView === "term") return renderTermView(payload);
    if (payload.planner.activeView === "year") return renderYearView(payload);
    return `<div class="learn-planner-layout">${renderWeekGrid(payload)}${renderPlannerSidebar(payload)}</div>`;
  }

  function renderPlanner(payload) {
    const activeView = payload.planner.activeView;
    return `
      ${renderPlannerTopbar(payload)}
      ${renderPlannerControls(activeView)}
      <div class="learn-shell">
        ${renderCycleCurriculum(payload)}
        ${renderActivePlannerView(payload)}
      </div>
    `;
  }

  function renderPrintCenter(payload) {
    const data = payload.printCenter;
    const momTemplates = data.templates.filter((template) => template.audience === "mom");
    const childTemplates = data.templates.filter((template) => template.audience === "child");
    const paidPlan = learnPlanIsPaid();
    const printCount = learnPrintCount();
    const basicPrintsLeft = Math.max(0, LEARN_FREE_PRINT_LIMIT - printCount);
    const printDocument = data.printDocument || {
      title: "Weekly Household Plan",
      subtitle: `${data.week.label} · ${data.calendarToggle.description}`,
      sections: [
        {
          title: "Household Stream",
          items: data.week.householdRows.map((row) => ({
            label: row.title,
            detail: row.detail,
            minutes: row.minutes.reduce((sum, minutes) => sum + Number(minutes || 0), 0)
          }))
        }
      ]
    };
    return `
      ${renderUtilityBar(payload)}
      ${renderPageHeader("Print Center", `${data.term.label} · ${data.calendarToggle.description}`, `
          <div class="learn-segmented" id="calendarToggle">
            ${data.calendarToggle.options.map((option) => `<button type="button" data-calendar="${option.value}" class="${data.calendarToggle.active === option.value ? "is-active" : ""}">${option.label}</button>`).join("")}
          </div>
      `)}
      <div class="learn-print-layout">
        ${paidPlan ? "" : `
          <section class="learn-paywall-card">
            <div>
              <strong>Free printing includes ${LEARN_FREE_PRINT_LIMIT} basic household prints.</strong>
              <span>${basicPrintsLeft} basic ${basicPrintsLeft === 1 ? "print" : "prints"} left on this device. Family unlocks child sheets, term packets, and PDF-ready exports.</span>
            </div>
            <button class="learn-button learn-button-primary" type="button" data-learn-action="learn-upgrade">Upgrade with Stripe</button>
          </section>
        `}
        <section class="learn-card"><div class="learn-card-inner">
          <div class="learn-card-title"><strong>For Mom</strong><button class="learn-button" type="button" data-learn-action="print-edit" data-print-scope="basic" data-action-title="Mom Print Pack" data-action-body="Choose PDF format, week range, and included sections before generating a print job.">Print</button></div>
          <div class="learn-print-grid">${momTemplates.map((template, index) => renderPrintTemplate(template, !paidPlan && index > 0)).join("")}</div>
        </div></section>
        <section class="learn-card"><div class="learn-card-inner">
          <div class="learn-card-title"><strong>For Each Child</strong><button class="learn-button" type="button" data-learn-action="print-edit" data-print-scope="premium" data-action-title="Child Print Pack" data-action-body="Select children, assignment sheets, reading lists, and memory work pages for PDF generation.">Print</button></div>
          <div class="learn-print-grid">${childTemplates.map((template) => renderPrintTemplate(template, !paidPlan)).join("")}</div>
        </div></section>
        <section class="learn-print-preview">
          <div class="learn-print-page">
            <h1>${data.household.name}</h1>
            <h2>${printDocument.title}</h2>
            <p>${printDocument.subtitle}</p>
            ${printDocument.sections.map((section) => `<div><strong>${section.title}</strong>${section.items.map((item) => `<span>${item.label} · ${item.detail} · ${item.minutes}m</span>`).join("")}</div>`).join("")}
          </div>
        </section>
      </div>
    `;
  }

  function renderPrintTemplate(template, locked = false) {
    return `
      <article class="learn-print-template ${locked ? "is-locked" : ""}">
        <strong>${template.title}${locked ? `<span class="learn-lock-badge">Family</span>` : ""}</strong>
        <span>${template.description}</span>
        ${template.child ? `<small>${template.child.gradeLabel} · Age ${template.child.ageYears}</small>` : "<small>Household output</small>"}
      </article>
    `;
  }

  function renderSimpleTopbar(title, subtitle, actions = "") {
    return `
      ${renderUtilityBar()}
      ${renderPageHeader(title, subtitle, actions)}
    `;
  }

  function progressBar(value) {
    const safeValue = Math.max(0, Math.min(100, Number(value) || 0));
    return `<div class="learn-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${safeValue}"><span style="width:${safeValue}%"></span></div>`;
  }

  function renderLoading(label) {
    return `<div class="learn-loading" role="status" aria-live="polite"><span class="learn-spinner"></span><strong>${label}</strong><small>Preparing the latest Learn data.</small></div>`;
  }

  function renderError(label, error) {
    return `<section class="learn-card learn-state-card" role="alert"><div class="learn-card-inner"><h2>${label}</h2><p class="learn-text-muted">${error.message || "Something went wrong while loading this page."}</p><button class="learn-button learn-button-primary" type="button" data-learn-action="retry">Try Again</button></div></section>`;
  }

  function renderEmpty(title, detail) {
    return `<div class="learn-empty"><strong>${title}</strong><span>${detail}</span></div>`;
  }

  function renderActionDialog(title, body, fields = []) {
    const formFields = fields.map((field) => `
      <label class="learn-field">
        <span>${field.label}</span>
        ${field.type === "select"
          ? `<select>${field.options.map((option) => `<option>${option}</option>`).join("")}</select>`
          : `<input type="${field.type || "text"}" value="${field.value || ""}" />`}
      </label>
    `).join("");
    return `
      <div class="learn-dialog-backdrop" data-dialog-backdrop>
        <section class="learn-dialog" role="dialog" aria-modal="true" aria-labelledby="learnDialogTitle" tabindex="-1">
          <div class="learn-card-title"><strong id="learnDialogTitle">${title}</strong><button class="learn-icon-button" type="button" data-learn-action="dialog-close" aria-label="Close">x</button></div>
          <p class="learn-text-muted">${body}</p>
          <div class="learn-dialog-fields">${formFields}</div>
          <div class="learn-dialog-actions">
            <button class="learn-button" type="button" data-learn-action="dialog-close">Cancel</button>
            <button class="learn-button learn-button-primary" type="button" data-learn-action="dialog-close">Save Draft</button>
          </div>
        </section>
      </div>
    `;
  }

  function renderFormation(payload) {
    const data = payload.formation;
    return `
      ${renderSimpleTopbar("Formation", "Church-first learning for hearts and minds.", `<div class="learn-chip">${data.today.liturgicalDay.feastTitle}</div><div class="learn-chip-soft">${data.calendarToggle.description}</div>`)}
      <div class="learn-shell">
        <section class="learn-feature-layout">
          <div class="learn-card learn-icon-feature"><div class="learn-card-inner">
            <div class="learn-icon-panel"><img src="/pantocrator.png" alt="Liturgical icon panel" /></div>
            <p class="learn-text-muted">I was glad when they said to me, Let us go to the house of the Lord.</p>
          </div></div>
          <div class="learn-card"><div class="learn-card-inner">
            <div class="learn-card-title"><strong>Church Rhythms</strong><span class="learn-chip-soft">Today</span></div>
            ${data.churchRhythms.map((item) => `<div class="learn-record-row"><span class="learn-status-dot ${formatStatus(item.status)}"></span><div><strong>${item.title}</strong><small>${item.note}</small></div></div>`).join("")}
            <button class="learn-button" type="button" data-learn-action="planner-edit" data-action-title="Church Rhythms" data-action-body="Edit today's rhythm checklist, readings, hymn practice, and fasting reminders.">Open Full Church Rhythms</button>
          </div></div>
          <div class="learn-card"><div class="learn-card-inner">
            <div class="learn-card-title"><strong>Catechesis</strong><span>${data.catechesisCycle.lessonNumber} of ${data.catechesisCycle.totalLessons}</span></div>
            <div class="learn-feature-stat"><b>${data.catechesisCycle.title}</b><span>${data.catechesisCycle.currentLesson}</span></div>
            <div class="learn-meta-label">Doctrinal Topic</div>
            <p>${data.catechesisCycle.doctrinalTopic}</p>
            <div class="learn-meta-label">Read-Aloud Pairing</div>
            <p class="learn-text-muted">${data.catechesisCycle.readAloudPairing || "Add a read-aloud in Setup"}</p>
          </div></div>
          <aside class="learn-card"><div class="learn-card-inner">
            <div class="learn-card-title"><strong>This Week in the Church</strong></div>
            <div class="learn-calendar-tile"><b>${dateLabelFromCivil(data.today.civilDate || todayIso())}</b><span>${data.today.liturgicalDay.feastTitle}</span><small>${data.today.liturgicalDay.fastingRule}</small></div>
            <div class="learn-side-line"><b>Readings</b><span>${data.today.liturgicalDay.epistleRef}; ${data.today.liturgicalDay.gospelRef}</span></div>
            <div class="learn-side-line"><b>Saint</b><span>${data.today.liturgicalDay.saints.join(", ")}</span></div>
            <button class="learn-button" type="button" data-learn-action="planner-edit" data-action-title="Liturgical Calendar" data-action-body="Review upcoming feasts, saints, fast rules, and calendar source notes.">View Full Calendar</button>
          </div></aside>
        </section>
        <section class="learn-feature-grid">
          <div class="learn-card"><div class="learn-card-inner"><div class="learn-card-title"><strong>Recitation & Memory Work</strong></div>${data.recitationTracks.length ? data.recitationTracks.map((track) => `<div class="learn-progress-line"><span>${track.title}</span>${progressBar(track.progressPercent)}<b>${track.progressPercent}%</b></div>`).join("") : renderEmpty("No memory work yet", "Add prayers, Scripture, hymns, or catechism materials in Setup.")}</div></div>
          <div class="learn-card"><div class="learn-card-inner"><div class="learn-card-title"><strong>Hymn Study</strong></div>${data.hymnStudies.length ? data.hymnStudies.map((hymn) => `<div class="learn-side-line"><b>${hymn.title}</b><span>${hymn.tone} · ${hymn.source}</span><small>${hymn.status}</small></div>`).join("") : renderEmpty("No hymn text loaded", "Use Setup to confirm the Ponomar hymn provider or add manual hymn text.")}<button class="learn-button learn-button-primary" type="button" data-learn-action="planner-edit" data-action-title="Hymn Study" data-action-body="Add the selected hymn to morning basket, choose a tone, and set a review cadence.">Add to Morning Basket</button></div></div>
          <div class="learn-card"><div class="learn-card-inner"><div class="learn-card-title"><strong>Enrichment</strong></div>${data.enrichmentBlocks.length ? data.enrichmentBlocks.map((block) => `<div class="learn-side-line"><b>${block.blockType}</b><span>${block.title}</span><small>${block.minutesPlanned}m</small></div>`).join("") : renderEmpty("No enrichment blocks yet", "Add nature study, art, music, science, history, or picture study in Setup.")}</div></div>
        </section>
        <section class="learn-card"><div class="learn-card-inner"><div class="learn-card-title"><strong>Saints, Feasts & Nature Journal</strong></div><div class="learn-inline-grid">${data.upcomingFeasts.map((feast) => `<article class="learn-mini-card"><strong>${feast.title}</strong><span>${feast.civilDate}</span><small>${feast.fastingRule}</small></article>`).join("")}${data.natureJournalEntries.map((entry) => `<article class="learn-mini-card"><strong>${entry.title}</strong><span>${entry.location}</span><small>${entry.notes}</small></article>`).join("")}</div></div></section>
      </div>
    `;
  }

  function renderBooks(payload) {
    const data = payload.books;
    const hasBooks = data.currentReadAlouds.length > 0;
    return `
      ${renderSimpleTopbar("Books", "Living books for the mind, the heart, and the soul.", `<input class="learn-search" placeholder="Search books..." />`)}
      <div class="learn-shell">
        <section class="learn-card"><div class="learn-card-inner">
          <div class="learn-card-title"><strong>Current Read-Alouds</strong><button class="learn-button" type="button" data-learn-action="planner-edit" data-action-title="Read-Alouds" data-action-body="Edit pacing, current chapter, and assigned stream for household living books.">View All Read-Alouds</button></div>
          <div class="learn-inline-grid">${hasBooks ? data.currentReadAlouds.map((book) => `<article class="learn-book-card"><div class="learn-book-cover">${book.title.slice(0, 1)}</div><div><strong>${book.title}</strong><span>${book.author}</span><small>${book.assignmentLabel}</small>${progressBar(book.progressPercent)}<small>${book.progressPercent}% · ${book.streamLabel}</small></div></article>`).join("") : renderEmpty("No books added yet", "Add read-alouds and book lists in Setup.")}</div>
        </div></section>
        <div class="learn-two-column">
          <section class="learn-card"><div class="learn-card-inner">
            <div class="learn-card-title"><strong>Household Library</strong></div>
            <div class="learn-table">
              <div class="learn-table-head"><span>Title</span><span>Author</span><span>Category</span><span>Ages</span><span>Progress</span></div>
              ${data.libraryBooks.length ? data.libraryBooks.map((book) => `<div class="learn-table-row"><span><b>${book.title}</b>${book.orthodox ? "<small>Orthodox</small>" : ""}</span><span>${book.author}</span><span>${book.category}</span><span>${book.ageRange}</span><span>${progressBar(book.progressPercent)}<small>${book.progressPercent}%</small></span></div>`).join("") : renderEmpty("No library books configured", "Add books and read-alouds in Setup to build the household library.")}
            </div>
          </div></section>
          <aside class="learn-side-stack">
            <section class="learn-card"><div class="learn-card-inner"><div class="learn-card-title"><strong>Suggested Orthodox Living Books</strong></div>${data.orthodoxSuggestions.length ? data.orthodoxSuggestions.map((item) => `<div class="learn-record-row"><span class="learn-avatar ${accentClass(item.accentToken)}">${item.title.slice(0, 1)}</span><div><strong>${item.title}</strong><small>${item.subtitle}</small></div></div>`).join("") : renderEmpty("No suggestions loaded", "Curated recommendations will appear here after they are added to the library source.")}</div></section>
            <section class="learn-card"><div class="learn-card-inner"><div class="learn-card-title"><strong>Book Pacing</strong></div>${hasBooks ? `<strong>${data.currentReadAlouds[0].title}</strong><p class="learn-text-muted">${data.currentReadAlouds[0].author}</p>${progressBar(data.currentReadAlouds[0].progressPercent)}` : renderEmpty("No pacing plan yet", "Add a read-aloud in Setup to begin pacing chapters.")}</div></section>
            <section class="learn-card"><div class="learn-card-inner"><div class="learn-card-title"><strong>Copywork Sources</strong></div>${data.copyworkSources.length ? data.copyworkSources.map((source) => `<div class="learn-side-line"><b>${source.title}</b><span>${source.detail}</span></div>`).join("") : renderEmpty("No copywork sources", "Mark a book as a copywork source or add formation materials in Setup.")}</div></section>
          </aside>
        </div>
      </div>
    `;
  }

  function renderReports(payload) {
    const data = payload.reports;
    const summary = data.weeklySummary;
    const firstReport = data.reportCards[0];
    const firstTranscript = data.transcripts[0];
    const firstReportExport = firstReport?.exportPreview || firstReport;
    const firstTranscriptExport = firstTranscript?.exportPreview || firstTranscript;
    return `
      ${renderSimpleTopbar("Reports & Progress", "Review progress, track growth, and generate records for your homeschool.", `<div class="learn-chip">Filter: Current School Year</div>`)}
      <div class="learn-shell">
        <section class="learn-stats-row">
          <div class="learn-card"><div class="learn-card-inner"><span>Lessons Completed</span><b>${summary.lessonsCompleted} / ${summary.lessonsPlanned}</b>${progressBar(summary.lessonsCompletionPercent)}</div></div>
          <div class="learn-card"><div class="learn-card-inner"><span>Narrations Logged</span><b>${summary.narrationsLogged}</b><small>This week</small></div></div>
          <div class="learn-card"><div class="learn-card-inner"><span>Read-Aloud Progress</span><b>${summary.readAloudProgressPercent}%</b>${progressBar(summary.readAloudProgressPercent)}</div></div>
          <div class="learn-card"><div class="learn-card-inner"><span>Nature Journal Entries</span><b>${data.natureJournalEntries.length}</b><small>This month</small></div></div>
          <div class="learn-card"><div class="learn-card-inner"><span>Feast Days Observed</span><b>${summary.feastDaysAhead}</b><small>Upcoming: ${summary.nextFeastLabel}</small></div></div>
        </section>
        <div class="learn-two-column">
          <section class="learn-card"><div class="learn-card-inner">
            <div class="learn-card-title"><strong>Child Progress Overview</strong><button class="learn-button" type="button" data-learn-action="academic-edit" data-action-title="Child Progress Records" data-action-body="Review lesson counts, narrations, nature journal entries, feast days, and notes before exporting.">View Detailed Child Reports</button></div>
            <div class="learn-table">
              <div class="learn-table-head"><span>Child</span><span>Grade / Age</span><span>Lessons</span><span>Narrations</span><span>Nature</span></div>
              ${data.children.length ? data.children.map((child) => {
                const childLessons = (data.academicRecords || []).filter((record) => record.child?.id === child.id || record.childId === child.id);
                const childNarrations = (data.narrationLogs || []).filter((log) => log.child?.id === child.id || log.childId === child.id);
                const childNature = (data.natureJournalEntries || []).filter((entry) => entry.childId === child.id);
                return `<div class="learn-table-row learn-report-row"><span><span class="learn-avatar ${accentClass(child.accentToken)}">${child.avatarMonogram}</span><b>${child.firstName}</b></span><span>${child.gradeLabel || "Stage not set"} · Age ${child.ageYears || "not set"}</span><span><small>Lessons</small>${childLessons.length} logged</span><span><small>Narrations</small>${childNarrations.length}</span><span><small>Nature</small>${childNature.length}</span></div>`;
              }).join("") : renderEmpty("No children configured", "Add children in Setup to begin progress records.")}
            </div>
          </div></section>
          <aside class="learn-side-stack">
            <section class="learn-card"><div class="learn-card-inner"><div class="learn-card-title"><strong>Year-End Report Preview</strong></div><div class="learn-report-preview"><h2>Year-End Report</h2><p>${data.household.name}</p><small>${firstReportExport?.summary || "Reports will populate after lessons and narrations are logged."}</small></div><button class="learn-button" type="button" data-learn-action="academic-edit" data-action-title="Report Card Preview" data-action-body="Review subjects, narrative summaries, marks, and parent notes before PDF export.">Preview Full Report</button><button class="learn-button learn-button-primary" type="button" data-learn-action="academic-edit" data-action-title="Report Card PDF Export" data-action-body="Generate a polished PDF export using report-card sections and narrative summaries.">Export as PDF</button></div></section>
            <section class="learn-card"><div class="learn-card-inner"><div class="learn-card-title"><strong>Transcript Generation</strong></div>${firstTranscript ? `<strong>${firstTranscript.child.firstName} · ${firstTranscriptExport.gradeSpan}</strong><p class="learn-text-muted">${firstTranscriptExport.records.length} records ready for transcript export.</p>` : renderEmpty("No transcript records yet", "Transcript records will appear after child progress is logged.")}<button class="learn-button" type="button" data-learn-action="academic-edit" data-action-title="Transcript Export" data-action-body="Prepare transcript records, evaluation model labels, and grade-span notes for export.">Generate Transcript</button></div></section>
            <section class="learn-card"><div class="learn-card-inner"><div class="learn-card-title"><strong>Compliance-Friendly Exports</strong></div><div class="learn-inline-grid">${data.reportExports.map((entry) => `<article class="learn-mini-card"><strong>${entry.exportType}</strong><span>${entry.format.toUpperCase()}</span><small>${entry.status}</small></article>`).join("")}</div></div></section>
          </aside>
        </div>
        <section class="learn-card"><div class="learn-card-inner"><div class="learn-card-title"><strong>Narration Log</strong><button class="learn-button" type="button" data-learn-action="academic-edit" data-action-title="Narration Log" data-action-body="Filter, edit, and export narration entries for compliance records.">View All Narrations</button></div>${data.narrationLogs.length ? data.narrationLogs.map((log) => `<div class="learn-record-row"><span class="learn-avatar ${accentClass(log.child.accentToken)}">${log.child.avatarMonogram}</span><div><strong>${log.sourceTitle}</strong><small>${log.child.firstName} · ${log.narrationType} · ${log.note}</small></div></div>`).join("") : renderEmpty("No narrations yet", "Narrations will appear here once logged.")}</div></section>
      </div>
    `;
  }

  function renderCoOp(payload) {
    const data = payload.coOp;
    if (!data.enabled) {
      return `${renderSimpleTopbar("Co-op", "Optional community planning for shared classes, resources, and meeting days.", `<div class="learn-chip-soft">Not enabled</div>`)}<div class="learn-shell"><section class="learn-card"><div class="learn-card-inner"><div class="learn-card-title"><strong>Co-op is off for this household</strong><a class="learn-button learn-button-primary" href="/learn/onboarding">Open Setup</a></div><p class="learn-text-muted">Enable Co-op in Setup when you are ready to add member families, meeting days, teaching rotation, announcements, and shared resources.</p></div></section></div>`;
    }
    return `
      ${renderSimpleTopbar("Co-op", `Co-operatives > ${data.coOp.name}`, `<div class="learn-chip">${data.coOp.learningCycleLabel}</div>`)}
      <div class="learn-shell">
        <section class="learn-card"><div class="learn-card-inner learn-coop-hero"><div class="learn-icon-panel"><img src="/pantocrator.png" alt="Co-op patron icon" /></div><div><h1>${data.coOp.name}</h1><p>${data.coOp.city || "Location not set"}</p><span>${data.coOp.affiliation}</span></div><div class="learn-feature-stat"><b>${data.members.length}</b><span>Member Families</span></div><div class="learn-feature-stat"><b>${data.meeting?.startsAt || "Set in Setup"}</b><span>Next Meeting</span></div></div></section>
        <section class="learn-feature-grid learn-coop-grid">
          <div class="learn-card"><div class="learn-card-inner"><div class="learn-card-title"><strong>Weekly Co-op Schedule</strong><a class="learn-button" href="/learn/onboarding">Edit</a></div>${data.scheduleBlocks.length ? data.scheduleBlocks.map((block) => `<div class="learn-schedule-row"><b>${block.startsAt || "Set"}<br>${block.endsAt || "time"}</b><div><strong>${block.title}</strong><small>${block.subtitle}</small></div><span>${block.teacherHouseholdName || "Unassigned"}</span></div>`).join("") : renderEmpty("No meeting blocks yet", "Add the co-op meeting schedule in Setup.")}</div></div>
          <div class="learn-card"><div class="learn-card-inner"><div class="learn-card-title"><strong>Announcements</strong><a class="learn-button" href="/learn/onboarding">Edit</a></div>${data.announcements.length ? data.announcements.map((entry) => `<div class="learn-record-row"><span class="learn-status-dot ${entry.priority === "important" ? "is-complete" : ""}"></span><div><strong>${entry.title}</strong><small>${entry.body}</small></div></div>`).join("") : renderEmpty("No announcements", "Add reminders and updates in Setup.")}</div></div>
          <div class="learn-card"><div class="learn-card-inner"><div class="learn-card-title"><strong>Teaching Rotation</strong></div>${data.scheduleBlocks.length ? data.scheduleBlocks.map((block) => `<div class="learn-side-line"><b>${block.title}</b><span>${block.teacherHouseholdName || "Unassigned"}</span></div>`).join("") : renderEmpty("No rotation yet", "Assign teachers to schedule blocks in Setup.")}</div></div>
        </section>
        <section class="learn-feature-grid">
          <div class="learn-card"><div class="learn-card-inner"><div class="learn-card-title"><strong>Shared Read-Alouds</strong><a class="learn-button" href="/learn/onboarding">Edit</a></div>${data.sharedReadAlouds.length ? data.sharedReadAlouds.map((book) => `<div class="learn-side-line"><b>${book.title}</b><span>${book.author}</span><small>${book.status || `${book.progressPercent || 0}%`}</small></div>`).join("") : renderEmpty("No shared books", "Add co-op read-alouds in Setup.")}</div></div>
          <div class="learn-card"><div class="learn-card-inner"><div class="learn-card-title"><strong>Resources & Documents</strong><a class="learn-button" href="/learn/onboarding">Edit</a></div>${data.resources.length ? data.resources.map((resource) => `<div class="learn-side-line"><b>${resource.title}</b><span>${resource.type}</span></div>`).join("") : renderEmpty("No resources yet", "Add handbook links, calendars, and documents in Setup.")}</div></div>
          <div class="learn-card"><div class="learn-card-inner"><div class="learn-card-title"><strong>Member Families</strong><a class="learn-button learn-button-primary" href="/learn/onboarding">Add Members</a></div>${data.members.map((member) => `<div class="learn-side-line"><b>${member.householdName}</b><span>${member.childrenCount} Children · ${member.role}${member.agapayEmail ? ` · ${member.agapayEmail}` : ""}</span></div>`).join("")}</div></div>
        </section>
      </div>
    `;
  }

  function renderOnboarding(payload) {
    const data = payload.onboarding;
    const setup = readSetupState();
    const children = setupChildren(data.children);
    const paidPlan = learnPlanIsPaid(setup);
    const subjects = Array.isArray(setup.subjects) ? setup.subjects : [];
    const books = Array.isArray(setup.books) ? setup.books : [];
    const formationMaterials = Array.isArray(setup.formationMaterials) ? setup.formationMaterials : [];
    const coOpMembers = Array.isArray(setup.coOp?.members) ? setup.coOp.members : [];
    const coOpScheduleBlocks = Array.isArray(setup.coOp?.scheduleBlocks) ? setup.coOp.scheduleBlocks : [];
    const coOpAnnouncements = Array.isArray(setup.coOp?.announcements) ? setup.coOp.announcements : [];
    const coOpResources = Array.isArray(setup.coOp?.resources) ? setup.coOp.resources : [];
    const coOpSharedReadAlouds = Array.isArray(setup.coOp?.sharedReadAlouds) ? setup.coOp.sharedReadAlouds : [];
    const childFields = children.map((child, index) => `
      <article class="learn-child-editor" data-child-index="${index}">
        <label class="learn-field"><span>Name</span><input type="text" data-setup-child="firstName" value="${child.firstName || ""}" /></label>
        <label class="learn-field"><span>Age</span><input type="number" min="0" max="20" data-setup-child="ageYears" value="${child.ageYears || ""}" /></label>
        <label class="learn-field"><span>Grade / Stage</span><input type="text" data-setup-child="gradeLabel" value="${child.gradeLabel || ""}" /></label>
      </article>
    `).join("");
    const subjectFields = subjects.map((subject, index) => `
      <article class="learn-row-editor" data-subject-index="${index}">
        <label class="learn-field"><span>Subject</span><input type="text" data-setup-subject="title" value="${subject.title || ""}" /></label>
        <label class="learn-field"><span>Resource / Curriculum</span><input type="text" data-setup-subject="resource" value="${subject.resource || ""}" /></label>
        <label class="learn-field"><span>Cadence</span><input type="text" data-setup-subject="cadence" value="${subject.cadence || ""}" /></label>
        <label class="learn-field"><span>Minutes</span><input type="number" min="0" data-setup-subject="minutes" value="${subject.minutes || ""}" /></label>
      </article>
    `).join("");
    const bookFields = books.map((book, index) => `
      <article class="learn-row-editor" data-book-index="${index}">
        <label class="learn-field"><span>Title</span><input type="text" data-setup-book="title" value="${book.title || ""}" /></label>
        <label class="learn-field"><span>Author</span><input type="text" data-setup-book="author" value="${book.author || ""}" /></label>
        <label class="learn-field"><span>Role</span><select data-setup-book="role"><option ${book.role === "Family Read-Aloud" ? "selected" : ""}>Family Read-Aloud</option><option ${book.role === "Independent Reading" ? "selected" : ""}>Independent Reading</option><option ${book.role === "Morning Basket" ? "selected" : ""}>Morning Basket</option><option ${book.role === "Copywork Source" ? "selected" : ""}>Copywork Source</option></select></label>
      </article>
    `).join("");
    const formationFields = formationMaterials.map((material, index) => `
      <article class="learn-row-editor" data-formation-index="${index}">
        <label class="learn-field"><span>Formation Area</span><input type="text" data-setup-formation="title" value="${material.title || ""}" /></label>
        <label class="learn-field"><span>Source / Text</span><input type="text" data-setup-formation="source" value="${material.source || ""}" /></label>
        <label class="learn-field"><span>Cadence</span><input type="text" data-setup-formation="cadence" value="${material.cadence || ""}" /></label>
      </article>
    `).join("");
    const coOpMemberFields = coOpMembers.map((member, index) => `
      <article class="learn-row-editor" data-coop-member-index="${index}">
        <label class="learn-field"><span>AGAPAY Member Email</span><input type="email" data-setup-coop-member="agapayEmail" value="${member.agapayEmail || ""}" placeholder="family@example.com" /></label>
        <label class="learn-field"><span>Household</span><input type="text" data-setup-coop-member="householdName" value="${member.householdName || ""}" /></label>
        <label class="learn-field"><span>Children</span><input type="number" min="0" data-setup-coop-member="childrenCount" value="${member.childrenCount || ""}" /></label>
        <label class="learn-field"><span>Role</span><select data-setup-coop-member="role"><option ${member.role === "member" ? "selected" : ""}>member</option><option ${member.role === "teacher" ? "selected" : ""}>teacher</option><option ${member.role === "lead" ? "selected" : ""}>lead</option></select></label>
      </article>
    `).join("");
    const coOpScheduleFields = coOpScheduleBlocks.map((block, index) => `
      <article class="learn-row-editor" data-coop-schedule-index="${index}">
        <label class="learn-field"><span>Start</span><input type="text" data-setup-coop-schedule="startsAt" value="${block.startsAt || ""}" placeholder="9:00 AM" /></label>
        <label class="learn-field"><span>End</span><input type="text" data-setup-coop-schedule="endsAt" value="${block.endsAt || ""}" placeholder="9:45 AM" /></label>
        <label class="learn-field"><span>Class / Block</span><input type="text" data-setup-coop-schedule="title" value="${block.title || ""}" /></label>
        <label class="learn-field"><span>Details</span><input type="text" data-setup-coop-schedule="subtitle" value="${block.subtitle || ""}" /></label>
        <label class="learn-field"><span>Teacher</span><input type="text" data-setup-coop-schedule="teacherHouseholdName" value="${block.teacherHouseholdName || ""}" /></label>
      </article>
    `).join("");
    const coOpAnnouncementFields = coOpAnnouncements.map((entry, index) => `
      <article class="learn-row-editor" data-coop-announcement-index="${index}">
        <label class="learn-field"><span>Title</span><input type="text" data-setup-coop-announcement="title" value="${entry.title || ""}" /></label>
        <label class="learn-field"><span>Body</span><input type="text" data-setup-coop-announcement="body" value="${entry.body || ""}" /></label>
        <label class="learn-field"><span>Priority</span><select data-setup-coop-announcement="priority"><option ${entry.priority === "normal" ? "selected" : ""}>normal</option><option ${entry.priority === "important" ? "selected" : ""}>important</option></select></label>
      </article>
    `).join("");
    const coOpResourceFields = coOpResources.map((resource, index) => `
      <article class="learn-row-editor" data-coop-resource-index="${index}">
        <label class="learn-field"><span>Title</span><input type="text" data-setup-coop-resource="title" value="${resource.title || ""}" /></label>
        <label class="learn-field"><span>Type</span><input type="text" data-setup-coop-resource="type" value="${resource.type || ""}" placeholder="PDF, Link, DOC" /></label>
        <label class="learn-field"><span>URL / Note</span><input type="text" data-setup-coop-resource="url" value="${resource.url || ""}" /></label>
      </article>
    `).join("");
    const coOpReadAloudFields = coOpSharedReadAlouds.map((book, index) => `
      <article class="learn-row-editor" data-coop-readaloud-index="${index}">
        <label class="learn-field"><span>Title</span><input type="text" data-setup-coop-readaloud="title" value="${book.title || ""}" /></label>
        <label class="learn-field"><span>Author</span><input type="text" data-setup-coop-readaloud="author" value="${book.author || ""}" /></label>
        <label class="learn-field"><span>Status</span><input type="text" data-setup-coop-readaloud="status" value="${book.status || ""}" placeholder="Planned, In Progress" /></label>
      </article>
    `).join("");
    return `
      ${renderSimpleTopbar("Setup", "Configure AGAPAY Learn for your household before the school rhythm begins.", `<div class="learn-chip">Step ${data.onboarding.household.currentStep} of ${data.onboarding.household.totalSteps}</div>`)}
      <div class="learn-shell">
        <form class="learn-setup-form" id="learnSetupForm">
          <section class="learn-card learn-method-card"><div class="learn-card-inner">
            <div class="learn-card-title">
              <strong>Planning Pattern</strong>
              <span class="learn-chip-soft">Prepare · choose · schedule · adjust</span>
            </div>
            <div class="learn-method-steps">
              <a href="#learnSetupHousehold"><b>Household</b><span>Children, family method, parish, and school year.</span></a>
              <a href="#learnSetupCalendar"><b>Church Calendar</b><span>Liturgical calendar, readings, fasting, and records.</span></a>
              <a href="#learnSetupMaterials"><b>Living Materials</b><span>Books, subjects, formation texts, riches, and cycle notes.</span></a>
              <a href="#learnSetupSync"><b>Shared Rhythm</b><span>Grace Mode, Google Calendar, co-op, and print-ready plans.</span></a>
            </div>
          </div></section>
          <section class="learn-card" id="learnSetupHousehold"><div class="learn-card-inner">
            <div class="learn-card-title">
              <strong>Household</strong>
              <span class="learn-chip-soft">Saved on this device</span>
            </div>
            <div class="learn-setup-grid">
              <label class="learn-field"><span>Household Name</span><input type="text" name="householdName" value="${setup.householdName || data.household.name || ""}" /></label>
              <label class="learn-field"><span>Parent Names</span><input type="text" name="parentNames" value="${setup.parentNames || ""}" /></label>
              <label class="learn-field"><span>Parish / Community</span><input type="text" name="parishName" value="${setup.parishName || ""}" /></label>
              <label class="learn-field"><span>City</span><input type="text" name="city" value="${setup.city || ""}" /></label>
              <label class="learn-field"><span>Method</span><select name="primaryMethod"><option ${setup.primaryMethod === "Charlotte Mason" ? "selected" : ""}>Charlotte Mason</option><option ${setup.primaryMethod === "Classical" ? "selected" : ""}>Classical</option><option ${setup.primaryMethod === "Eclectic" ? "selected" : ""}>Eclectic</option><option ${setup.primaryMethod === "Custom" ? "selected" : ""}>Custom</option></select></label>
            </div>
          </div></section>
          <section class="learn-card" id="learnSetupCalendar"><div class="learn-card-inner">
            <div class="learn-card-title"><strong>Calendar & Records</strong><span class="learn-chip-soft">Uses AGAPAY liturgical calendars</span></div>
            <div class="learn-setup-grid">
              <label class="learn-field"><span>Church Calendar</span><select name="calendarType"><option value="julian" ${setup.calendarType !== "revised-julian" ? "selected" : ""}>Julian / Old Calendar</option><option value="revised-julian" ${setup.calendarType === "revised-julian" ? "selected" : ""}>Revised Julian / Gregorian</option></select></label>
              <label class="learn-field"><span>Evaluation Model</span><select name="evaluationModel">${data.evaluationModels.map((model) => `<option value="${model}" ${setup.evaluationModel === model ? "selected" : ""}>${model}</option>`).join("")}</select></label>
              <label class="learn-field"><span>School Year Label</span><input type="text" name="schoolYearLabel" value="${setup.schoolYearLabel || data.schoolYear.label || ""}" /></label>
              <label class="learn-field"><span>First School Day</span><input type="date" name="schoolYearStart" value="${setup.schoolYearStart || ""}" /></label>
              <label class="learn-field"><span>Last School Day</span><input type="date" name="schoolYearEnd" value="${setup.schoolYearEnd || ""}" /></label>
            </div>
          </div></section>
          <section class="learn-card"><div class="learn-card-inner">
            <div class="learn-card-title"><strong>Readings & Hymns</strong><span class="learn-chip-soft">Orthocal + Ponomar</span></div>
            <p class="learn-text-muted">Orthocal supplies the calendar, saints, fasting, epistle, and gospel. Ponomar supplies daily troparia and kontakia, with parish-approved overrides available here.</p>
            <div class="learn-setup-grid">
              <label class="learn-field"><span>Readings Provider</span><select name="liturgicalProvider"><option value="orthocal" ${setup.liturgicalSource?.provider !== "manual" ? "selected" : ""}>Orthocal.info</option><option value="manual" ${setup.liturgicalSource?.provider === "manual" ? "selected" : ""}>Manual parish entry</option></select></label>
              <label class="learn-field"><span>Hymn Provider</span><select name="hymnProvider"><option value="ponomar" ${setup.liturgicalSource?.hymnProvider !== "manual" ? "selected" : ""}>Ponomar Project</option><option value="manual" ${setup.liturgicalSource?.hymnProvider === "manual" ? "selected" : ""}>Manual parish entry</option></select></label>
              <label class="learn-field"><span>Epistle Override</span><input type="text" name="manualEpistle" value="${setup.liturgicalSource?.manualEpistle || ""}" placeholder="Romans 7.14-8.2" /></label>
              <label class="learn-field"><span>Gospel Override</span><input type="text" name="manualGospel" value="${setup.liturgicalSource?.manualGospel || ""}" placeholder="Matthew 10.9-15" /></label>
              <label class="learn-field"><span>Troparion Tone</span><input type="text" name="troparionTone" value="${setup.liturgicalSource?.troparionTone || ""}" placeholder="Tone 1" /></label>
              <label class="learn-field learn-field-wide"><span>Troparion Text</span><input type="text" name="troparionText" value="${setup.liturgicalSource?.troparionText || ""}" placeholder="Enter parish-approved troparion text" /></label>
              <label class="learn-field"><span>Kontakion Tone</span><input type="text" name="kontakionTone" value="${setup.liturgicalSource?.kontakionTone || ""}" placeholder="Tone 1" /></label>
              <label class="learn-field learn-field-wide"><span>Kontakion Text</span><input type="text" name="kontakionText" value="${setup.liturgicalSource?.kontakionText || ""}" placeholder="Enter parish-approved kontakion text" /></label>
              <label class="learn-field learn-field-wide"><span>Source Note</span><input type="text" name="liturgicalSourceNote" value="${setup.liturgicalSource?.sourceNote || ""}" placeholder="OCA, Antiochian parish bulletin, monastery menaion, etc." /></label>
            </div>
            <div class="learn-dialog-actions">
              <button class="learn-button" type="button" data-learn-action="readings-provider-status">Check Provider</button>
              <button class="learn-button learn-button-secondary" type="button" data-learn-action="hymns-provider-status">Check Hymns</button>
            </div>
          </div></section>
          <section class="learn-card"><div class="learn-card-inner">
            <div class="learn-card-title"><strong>Grace Mode</strong><span class="learn-chip-soft">${graceModeLabel(setup.graceModeDefault || "light")}</span></div>
            <p class="learn-text-muted">Choose the household default for hard days. The planner will keep essentials visible and place removed lessons in the Grace Archive.</p>
            <input type="hidden" name="graceModeDefault" value="${setup.graceModeDefault || "light"}" />
            <div class="learn-grace-mode-grid">
              ${["full", "light", "minimum viable", "feast only"].map((mode) => `
                <button type="button" class="learn-grace-mode-button ${setup.graceModeDefault === mode ? "is-active" : ""}" data-learn-action="grace-mode-set" data-grace-mode="${mode}">
                  <strong>${graceModeLabel(mode)}</strong>
                  <span>${graceModeDetail(mode)}</span>
                </button>
              `).join("")}
            </div>
            ${setup.graceArchive?.length ? `
              <div class="learn-grace-archive">
                <strong>Grace Archive</strong>
                ${setup.graceArchive.slice(0, 3).map((entry) => `<div class="learn-side-line"><b>${entry.label}</b><span>${entry.items.length} lessons saved for later</span></div>`).join("")}
              </div>
            ` : renderEmpty("No archived lessons yet", "When Grace Mode removes a lesson, it will be saved here for rescheduling later.")}
          </div></section>
          <section class="learn-card"><div class="learn-card-inner">
            <div class="learn-card-title"><strong>Cycle Planning</strong><span class="learn-chip-soft">History, catechesis, and term focus</span></div>
            <div class="learn-setup-grid">
              <label class="learn-field"><span>Cycle Title</span><input type="text" name="cycleTitle" value="${setup.cyclePlanning?.cycleTitle || ""}" placeholder="Cycle 1: Creation to Christ" /></label>
              <label class="learn-field"><span>History Focus</span><input type="text" name="historyFocus" value="${setup.cyclePlanning?.historyFocus || ""}" placeholder="Ancient history, Byzantine history, saints..." /></label>
              <label class="learn-field"><span>Catechesis Focus</span><input type="text" name="catechesisFocus" value="${setup.cyclePlanning?.catechesisFocus || ""}" placeholder="Creed, sacraments, feasts..." /></label>
              <label class="learn-field"><span>Term Theme</span><input type="text" name="termTheme" value="${setup.cyclePlanning?.termTheme || ""}" placeholder="Pascha term, Nativity term..." /></label>
              <label class="learn-field"><span>Week Label</span><input type="text" name="weekLabel" value="${setup.cyclePlanning?.weekLabel || ""}" placeholder="Week 3 - Bright Week" /></label>
              <label class="learn-field"><span>Planning Notes</span><input type="text" name="cycleNotes" value="${setup.cyclePlanning?.notes || ""}" placeholder="Pacing notes, feast adjustments, family priorities" /></label>
            </div>
          </div></section>
          <section class="learn-card"><div class="learn-card-inner">
            <div class="learn-card-title">
              <strong>Children</strong>
              <span class="learn-chip-soft">${paidPlan ? "Family plan" : `Free plan: ${LEARN_FREE_CHILD_LIMIT} children`}</span>
              <button class="learn-button" type="button" data-learn-action="setup-add-child">Add Child</button>
            </div>
            <div class="learn-child-editor-list">${childFields || renderEmpty("No children yet", "Add a child to begin planning lessons.")}</div>
          </div></section>
          <section class="learn-card" id="learnSetupMaterials"><div class="learn-card-inner">
            <div class="learn-card-title">
              <strong>Subjects & Curriculum</strong>
              <button class="learn-button" type="button" data-learn-action="setup-add-subject">Add Subject</button>
            </div>
            <div class="learn-row-editor-list">${subjectFields}</div>
          </div></section>
          <section class="learn-card"><div class="learn-card-inner">
            <div class="learn-card-title">
              <strong>Books & Read-Alouds</strong>
              <button class="learn-button" type="button" data-learn-action="setup-add-book">Add Book</button>
            </div>
            <div class="learn-row-editor-list">${bookFields}</div>
          </div></section>
          <section class="learn-card"><div class="learn-card-inner">
            <div class="learn-card-title">
              <strong>Formation Materials</strong>
              <button class="learn-button" type="button" data-learn-action="setup-add-formation">Add Material</button>
            </div>
            <div class="learn-row-editor-list">${formationFields}</div>
          </div></section>
          <section class="learn-card" id="learnSetupSync"><div class="learn-card-inner">
            <div class="learn-card-title"><strong>Google Calendar Sync</strong><span class="learn-chip-soft">OAuth connection</span></div>
            <div class="learn-setup-grid">
              <label class="learn-field"><span>Target Calendar</span><input type="text" name="googleTargetCalendar" value="${setup.googleCalendar?.targetCalendar || "AGAPAY Learn"}" /></label>
              <label class="learn-field"><span>Sync Scope</span><select name="googleSyncScope"><option value="lessons-feasts-readalouds" ${setup.googleCalendar?.syncScope !== "feasts-only" && setup.googleCalendar?.syncScope !== "lessons-only" ? "selected" : ""}>Lessons, feast days, and read-alouds</option><option value="feasts-only" ${setup.googleCalendar?.syncScope === "feasts-only" ? "selected" : ""}>Feast days only</option><option value="lessons-only" ${setup.googleCalendar?.syncScope === "lessons-only" ? "selected" : ""}>Lessons only</option></select></label>
              <label class="learn-field"><span>Reminder Minutes</span><input type="number" min="0" name="googleReminderMinutes" value="${setup.googleCalendar?.reminderMinutes || 30}" /></label>
            </div>
            <div class="learn-dialog-actions">
              <button class="learn-button learn-button-primary" type="button" data-learn-action="google-calendar-connect">Connect Google Calendar</button>
              <button class="learn-button" type="button" data-learn-action="google-calendar-sync">Preview Events</button>
            </div>
          </div></section>
          <section class="learn-card"><div class="learn-card-inner">
            <div class="learn-card-title"><strong>Co-op</strong><span class="learn-chip-soft">Create and manage</span></div>
            <div class="learn-setup-grid">
              <label class="learn-field"><span>Enable Co-op</span><select name="coOpEnabled"><option value="false" ${setup.coOp?.enabled ? "" : "selected"}>No</option><option value="true" ${setup.coOp?.enabled ? "selected" : ""}>Yes</option></select></label>
              <label class="learn-field"><span>Co-op Name</span><input type="text" name="coOpName" value="${setup.coOp?.name || ""}" /></label>
              <label class="learn-field"><span>City / Location</span><input type="text" name="coOpCity" value="${setup.coOp?.city || ""}" /></label>
              <label class="learn-field"><span>Affiliation</span><input type="text" name="coOpAffiliation" value="${setup.coOp?.affiliation || "Orthodox homeschool community"}" /></label>
              <label class="learn-field"><span>Patron / Saint</span><input type="text" name="coOpPatron" value="${setup.coOp?.patron || ""}" /></label>
              <label class="learn-field"><span>Meeting Cadence</span><input type="text" name="coOpCadence" value="${setup.coOp?.cadence || "Weekly"}" /></label>
              <label class="learn-field"><span>Next Meeting</span><input type="date" name="coOpNextMeetingDate" value="${setup.coOp?.nextMeetingDate || ""}" /></label>
              <label class="learn-field"><span>Meeting Time</span><input type="text" name="coOpMeetingTime" value="${setup.coOp?.meetingTime || ""}" /></label>
              <label class="learn-field"><span>Meeting Place</span><input type="text" name="coOpMeetingLocation" value="${setup.coOp?.meetingLocation || ""}" /></label>
              <label class="learn-field learn-field-wide"><span>Description</span><input type="text" name="coOpDescription" value="${setup.coOp?.description || ""}" /></label>
            </div>
            <div class="learn-setup-subsection">
              <div class="learn-card-title"><strong>AGAPAY Member Families</strong><button class="learn-button" type="button" data-learn-action="setup-add-coop-member">Add Member</button></div>
              <div class="learn-row-editor-list">${coOpMemberFields || renderEmpty("No members added", "Add AGAPAY member families by email, household name, and role.")}</div>
            </div>
            <div class="learn-setup-subsection">
              <div class="learn-card-title"><strong>Meeting Schedule</strong><button class="learn-button" type="button" data-learn-action="setup-add-coop-schedule">Add Block</button></div>
              <div class="learn-row-editor-list">${coOpScheduleFields || renderEmpty("No schedule blocks", "Add shared morning basket, classes, snack, closing prayer, or other meeting blocks.")}</div>
            </div>
            <div class="learn-setup-subsection">
              <div class="learn-card-title"><strong>Announcements</strong><button class="learn-button" type="button" data-learn-action="setup-add-coop-announcement">Add Announcement</button></div>
              <div class="learn-row-editor-list">${coOpAnnouncementFields || renderEmpty("No announcements", "Add reminders, feast plans, field trips, or supply notes.")}</div>
            </div>
            <div class="learn-setup-subsection">
              <div class="learn-card-title"><strong>Resources & Documents</strong><button class="learn-button" type="button" data-learn-action="setup-add-coop-resource">Add Resource</button></div>
              <div class="learn-row-editor-list">${coOpResourceFields || renderEmpty("No resources", "Add handbook links, calendars, supply lists, forms, or lesson files.")}</div>
            </div>
            <div class="learn-setup-subsection">
              <div class="learn-card-title"><strong>Shared Read-Alouds</strong><button class="learn-button" type="button" data-learn-action="setup-add-coop-readaloud">Add Read-Aloud</button></div>
              <div class="learn-row-editor-list">${coOpReadAloudFields || renderEmpty("No shared read-alouds", "Add books the co-op is reading together.")}</div>
            </div>
          </div></section>
          <section class="learn-card"><div class="learn-card-inner learn-setup-actions">
            <div>
              <strong>Ready to use</strong>
              <p class="learn-text-muted">Your setup updates the Learn dashboard, planner, formation pages, and print center on this device.</p>
            </div>
            <button class="learn-button learn-button-primary" type="submit">Save Setup</button>
          </div></section>
        </form>
      </div>
    `;
  }

  function renderCommunityResourceDialog() {
    return `
      <div class="learn-dialog-backdrop" data-dialog-backdrop>
        <section class="learn-dialog" role="dialog" aria-modal="true" aria-labelledby="learnDialogTitle" tabindex="-1">
          <div class="learn-card-title"><strong id="learnDialogTitle">Share a Community Resource</strong><button class="learn-icon-button" type="button" data-learn-action="dialog-close" aria-label="Close">x</button></div>
          <p class="learn-text-muted">Add a link that helps Orthodox homeschool families with books, saints, liturgy, planning, or family life.</p>
          <div class="learn-dialog-fields">
            <label class="learn-field"><span>Title</span><input type="text" data-community-field="title" placeholder="Resource title" /></label>
            <label class="learn-field"><span>Link</span><input type="url" data-community-field="url" placeholder="https://" /></label>
            <label class="learn-field"><span>Category</span><select data-community-field="category"><option>Living books</option><option>Church life</option><option>Lesson planning</option><option>Audio & activities</option><option>Orthodox homeschool</option></select></label>
            <label class="learn-field"><span>Short Note</span><input type="text" data-community-field="subtitle" placeholder="Why this is useful" /></label>
          </div>
          <div class="learn-dialog-actions">
            <button class="learn-button" type="button" data-learn-action="dialog-close">Cancel</button>
            <button class="learn-button learn-button-primary" type="button" data-learn-action="community-save">Share Link</button>
          </div>
        </section>
      </div>
    `;
  }

  function renderPaywallDialog(reason, detail) {
    return `
      <div class="learn-dialog-backdrop" data-dialog-backdrop>
        <section class="learn-dialog learn-paywall-dialog" role="dialog" aria-modal="true" aria-labelledby="learnPaywallTitle" tabindex="-1">
          <div class="learn-card-title"><strong id="learnPaywallTitle">${reason}</strong><button class="learn-icon-button" type="button" data-learn-action="dialog-close" aria-label="Close">x</button></div>
          <p class="learn-text-muted">${detail}</p>
          <div class="learn-paywall-summary">
            <div><strong>Free</strong><span>${LEARN_FREE_CHILD_LIMIT} children · ${LEARN_FREE_PRINT_LIMIT} basic prints</span></div>
            <div><strong>Family</strong><span>More children, child sheets, term packets, PDF-ready exports</span></div>
          </div>
          <div class="learn-dialog-actions">
            <button class="learn-button" type="button" data-learn-action="dialog-close">Not Now</button>
            <button class="learn-button learn-button-primary" type="button" data-learn-action="learn-upgrade">Upgrade with Stripe</button>
          </div>
        </section>
      </div>
    `;
  }

  function showPaywallDialog(reason, detail) {
    document.querySelector("[data-dialog-backdrop]")?.remove();
    document.body.insertAdjacentHTML("beforeend", renderPaywallDialog(reason, detail));
    bindLearnInteractions();
    document.querySelector(".learn-dialog")?.focus();
  }

  async function apiPost(path, body = {}) {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    let payload = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }
    if (!response.ok || payload.error) {
      const error = new Error(payload.error || `Request failed with ${response.status}`);
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  async function startLearnCheckout() {
    try {
      const payload = await apiPost("/api/learn/billing/checkout", { plan: "family" });
      if (payload.url) {
        window.location.href = payload.url;
        return;
      }
      throw new Error("Stripe checkout did not return a checkout URL.");
    } catch (error) {
      const requiredEnv = error.payload?.requiredEnv || ["STRIPE_SECRET_KEY", "AGAPAY_STRIPE_PRICE_LEARN_FAMILY_YEARLY", "AGAPAY_PUBLIC_URL"];
      return showDialog("Stripe Setup Needed", error.message || "Stripe checkout is not configured yet.", [
        { label: "Required", type: "text", value: requiredEnv.join(" + ") },
        { label: "Checkout Route", type: "text", value: "/api/learn/billing/checkout" }
      ]);
    }
  }

  async function loadFeaturePage(pageKey) {
    const main = document.getElementById("learnRoot");
    const calendar = localStorage.getItem("agapay.learn.calendar") || "julian";
    const endpoint = pageKey === "co-op" ? "co-op" : pageKey;
    main.innerHTML = renderLoading(`Loading ${pageKey}...`);
    const payload = await apiGet(`/api/learn/${endpoint}?calendar=${encodeURIComponent(calendar)}`);
    if (pageKey === "formation") main.innerHTML = renderFormation(payload);
    if (pageKey === "books") main.innerHTML = renderBooks(payload);
    if (pageKey === "community") main.innerHTML = renderCommunity(payload);
    if (pageKey === "reports") main.innerHTML = renderReports(payload);
    if (pageKey === "co-op") main.innerHTML = renderCoOp(payload);
    if (pageKey === "onboarding") main.innerHTML = renderOnboarding(payload);
    bindLearnInteractions();
  }

  async function apiGet(path) {
    const response = await fetch(path);
    let payload = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }
    if (!response.ok || payload.error) {
      throw new Error(payload.error || `Request failed with ${response.status}`);
    }
    return applySetupState(payload);
  }

  function showDialog(title, body, fields) {
    document.querySelector("[data-dialog-backdrop]")?.remove();
    document.body.insertAdjacentHTML("beforeend", renderActionDialog(title, body, fields));
    const dialog = document.querySelector(".learn-dialog");
    dialog?.focus();
  }

  function showCommunityResourceDialog() {
    document.querySelector("[data-dialog-backdrop]")?.remove();
    document.body.insertAdjacentHTML("beforeend", renderCommunityResourceDialog());
    bindLearnInteractions();
    document.querySelector(".learn-dialog")?.focus();
  }

  function closeDialog() {
    document.querySelector("[data-dialog-backdrop]")?.remove();
  }

  function bindLearnInteractions() {
    document.querySelectorAll("[data-learn-action]").forEach((control) => {
      if (control.dataset.bound === "true") return;
      control.dataset.bound = "true";
      control.addEventListener("click", async function () {
        const action = this.getAttribute("data-learn-action");
        if (action === "dialog-close") return closeDialog();
        if (action === "retry") return mountPage();
        if (action === "learn-upgrade") return startLearnCheckout();
        if (action === "community-save") {
          const title = document.querySelector('[data-community-field="title"]')?.value?.trim() || "";
          const url = document.querySelector('[data-community-field="url"]')?.value?.trim() || "";
          const category = document.querySelector('[data-community-field="category"]')?.value || "Orthodox homeschool";
          const subtitle = document.querySelector('[data-community-field="subtitle"]')?.value?.trim() || "";
          if (!title || !/^https?:\/\//i.test(url)) {
            return showDialog("Resource Needs a Valid Link", "Please include a title and a full http or https link before sharing.", [
              { label: "Example", type: "text", value: "https://example.org/resource" }
            ]);
          }
          writeCommunityResource({ title, url, category, subtitle });
          closeDialog();
          return mountPage();
        }
        if (action === "community-delete") {
          const resourceId = this.dataset.resourceId || "";
          if (resourceId) deleteCommunityResource(resourceId);
          return mountPage();
        }
        if (action === "setup-add-child") {
          const children = setupChildren();
          if (!learnPlanIsPaid() && children.length >= LEARN_FREE_CHILD_LIMIT) {
            return showPaywallDialog("Family Plan Needed", `The free AGAPAY Learn plan supports ${LEARN_FREE_CHILD_LIMIT} children. Upgrade to add more children, child-specific print packs, and full household exports.`);
          }
          const nextNumber = children.length + 1;
          writeSetupState({
            children: [
              ...children,
              {
                id: `local_child_${Date.now()}`,
                firstName: `Child ${nextNumber}`,
                ageYears: "",
                gradeLabel: "",
                avatarMonogram: String(nextNumber),
                accentToken: ["navy", "wine", "forest", "gold", "plum"][children.length % 5]
              }
            ]
          });
          return mountPage();
        }
        if (action === "setup-add-subject") {
          const setup = readSetupState();
          const subjects = Array.isArray(setup.subjects) ? setup.subjects : [];
          writeSetupState({ subjects: [...subjects, { id: `local_subject_${Date.now()}`, title: "", resource: "", cadence: "Weekly", minutes: 20 }] });
          return mountPage();
        }
        if (action === "setup-add-book") {
          const setup = readSetupState();
          const books = Array.isArray(setup.books) ? setup.books : [];
          writeSetupState({ books: [...books, { id: `local_book_${Date.now()}`, title: "", author: "", role: "Family Read-Aloud" }] });
          return mountPage();
        }
        if (action === "setup-add-formation") {
          const setup = readSetupState();
          const formationMaterials = Array.isArray(setup.formationMaterials) ? setup.formationMaterials : [];
          writeSetupState({ formationMaterials: [...formationMaterials, { id: `local_formation_${Date.now()}`, title: "", source: "", cadence: "Weekly" }] });
          return mountPage();
        }
        if (action === "grace-mode-set") {
          const mode = this.dataset.graceMode || "light";
          saveGraceMode(mode);
          document.querySelectorAll(".learn-grace-mode-button").forEach((button) => button.classList.toggle("is-active", button.dataset.graceMode === mode));
          const hiddenMode = document.querySelector('input[name="graceModeDefault"]');
          if (hiddenMode) hiddenMode.value = mode;
          if (currentPageKey() === "planner") return mountPage();
          return;
        }
        if (action === "setup-add-coop-member") {
          const setup = readSetupState();
          const members = Array.isArray(setup.coOp?.members) ? setup.coOp.members : [];
          writeSetupState({ coOp: { ...setup.coOp, enabled: true, members: [...members, { id: `coop_member_${Date.now()}`, agapayEmail: "", householdName: "", childrenCount: "", role: "member" }] } });
          return mountPage();
        }
        if (action === "setup-add-coop-schedule") {
          const setup = readSetupState();
          const scheduleBlocks = Array.isArray(setup.coOp?.scheduleBlocks) ? setup.coOp.scheduleBlocks : [];
          writeSetupState({ coOp: { ...setup.coOp, enabled: true, scheduleBlocks: [...scheduleBlocks, { id: `coop_block_${Date.now()}`, startsAt: "", endsAt: "", title: "", subtitle: "", teacherHouseholdName: "" }] } });
          return mountPage();
        }
        if (action === "setup-add-coop-announcement") {
          const setup = readSetupState();
          const announcements = Array.isArray(setup.coOp?.announcements) ? setup.coOp.announcements : [];
          writeSetupState({ coOp: { ...setup.coOp, enabled: true, announcements: [...announcements, { id: `coop_announcement_${Date.now()}`, title: "", body: "", priority: "normal" }] } });
          return mountPage();
        }
        if (action === "setup-add-coop-resource") {
          const setup = readSetupState();
          const resources = Array.isArray(setup.coOp?.resources) ? setup.coOp.resources : [];
          writeSetupState({ coOp: { ...setup.coOp, enabled: true, resources: [...resources, { id: `coop_resource_${Date.now()}`, title: "", type: "Link", url: "" }] } });
          return mountPage();
        }
        if (action === "setup-add-coop-readaloud") {
          const setup = readSetupState();
          const sharedReadAlouds = Array.isArray(setup.coOp?.sharedReadAlouds) ? setup.coOp.sharedReadAlouds : [];
          writeSetupState({ coOp: { ...setup.coOp, enabled: true, sharedReadAlouds: [...sharedReadAlouds, { id: `coop_readaloud_${Date.now()}`, title: "", author: "", status: "Planned" }] } });
          return mountPage();
        }
        if (action === "print-edit") {
          const premiumPrint = this.dataset.printScope === "premium";
          if (!learnPlanIsPaid() && premiumPrint) {
            return showPaywallDialog("Family Printing Needed", "Child print packs, term packets, and compliance-ready exports are part of the AGAPAY Learn Family plan.");
          }
          if (!learnPlanIsPaid() && learnPrintCount() >= LEARN_FREE_PRINT_LIMIT) {
            return showPaywallDialog("Basic Print Limit Reached", `The free plan includes ${LEARN_FREE_PRINT_LIMIT} basic household prints. Upgrade to keep printing weekly plans and child sheets.`);
          }
          if (!learnPlanIsPaid()) recordLearnPrint();
          return showDialog(this.dataset.actionTitle || "Print", this.dataset.actionBody || "Prepare a print job.", [
            { label: "Format", type: "select", options: ["PDF", "Browser Print"] },
            { label: "Range", type: "text", value: dateLabelFromCivil(todayIso()) }
          ]);
        }
        if (action === "academic-edit") {
          return showDialog(this.dataset.actionTitle || "Academic Record", this.dataset.actionBody || "Prepare academic export data.", [
            { label: "Evaluation Model", type: "select", options: ["Narrative Only", "Complete / Incomplete", "Percent", "Letter Grade"] },
            { label: "Export Status", type: "select", options: ["Draft", "Ready", "Exported"] }
          ]);
        }
        if (action === "planner-edit") {
          return showDialog(this.dataset.actionTitle || "Planner Edit", this.dataset.actionBody || "Edit planner data.", [
            { label: "Date", type: "date", value: todayIso() },
            { label: "Mode", type: "select", options: ["Save Draft", "Apply to Week", "Move to Next Available Day"] }
          ]);
        }
        if (action === "google-calendar-connect") {
          try {
            const payload = await apiGet(`/api/learn/google-calendar/connect?format=json&returnTo=${encodeURIComponent(window.location.pathname)}`);
            if (payload.authUrl) {
              window.location.href = payload.authUrl;
              return;
            }
          } catch (error) {
            return showDialog("Google Calendar Setup Needed", error.message || "Google Calendar sync is not configured yet.", [
              { label: "Required", type: "text", value: "GOOGLE_CALENDAR_CLIENT_ID + GOOGLE_CALENDAR_CLIENT_SECRET" },
              { label: "Callback", type: "text", value: `${window.location.origin}/api/learn/google-calendar/callback` }
            ]);
          }
        }
        if (action === "google-calendar-sync") {
          const calendar = localStorage.getItem("agapay.learn.calendar") || "julian";
          try {
            const payload = await apiPost(`/api/learn/google-calendar/sync?calendar=${encodeURIComponent(calendar)}&returnTo=${encodeURIComponent(window.location.pathname)}`);
            return showDialog("Google Calendar Synced", `${payload.syncedCount} AGAPAY Learn events were synced to Google Calendar.`, [
              { label: "Created", type: "text", value: String(payload.createdCount || 0) },
              { label: "Updated", type: "text", value: String(payload.updatedCount || 0) },
              { label: "Calendar", type: "text", value: calendar === "revised-julian" ? "Revised Julian / Gregorian" : "Julian / Old Calendar" }
            ]);
          } catch (error) {
            if (error.payload?.connectUrl) {
              return showDialog("Connect Google Calendar First", error.message || "Connect Google Calendar before syncing events.", [
                { label: "Action", type: "text", value: "Click Connect Google Calendar, approve access, then sync again." },
                { label: "Scope", type: "text", value: "calendar.events" }
              ]);
            }
            throw error;
          }
        }
        if (action === "readings-provider-status") {
          const payload = await apiGet("/api/learn/readings/status");
          return showDialog("Readings Provider", `${payload.provider.label} is configured for daily Orthodox calendar and Scripture readings.`, [
            { label: "Provider", type: "text", value: payload.provider.label },
            { label: "Capabilities", type: "text", value: payload.provider.capabilities.join(", ") },
            { label: "Docs", type: "text", value: payload.provider.docsUrl }
          ]);
        }
        if (action === "hymns-provider-status") {
          const payload = await apiGet("/api/learn/hymns/status");
          return showDialog("Hymn Provider", `${payload.provider.label} is configured for daily troparia and kontakia from Ponomar XML.`, [
            { label: "Provider", type: "text", value: payload.provider.label },
            { label: "Capabilities", type: "text", value: payload.provider.capabilities.join(", ") },
            { label: "License", type: "text", value: payload.provider.license },
            { label: "Source", type: "text", value: payload.provider.docsUrl }
          ]);
        }
        if (action === "community-share") {
          return showCommunityResourceDialog();
        }
      });
    });

    const setupForm = document.getElementById("learnSetupForm");
    if (setupForm && setupForm.dataset.bound !== "true") {
      setupForm.dataset.bound = "true";
      setupForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const formData = new FormData(setupForm);
        const childEditors = Array.from(setupForm.querySelectorAll("[data-child-index]"));
        const previousChildren = setupChildren();
        const children = childEditors.map((editor, index) => {
          const firstName = editor.querySelector('[data-setup-child="firstName"]')?.value?.trim() || `Child ${index + 1}`;
          const gradeLabel = editor.querySelector('[data-setup-child="gradeLabel"]')?.value?.trim() || "";
          const ageYears = editor.querySelector('[data-setup-child="ageYears"]')?.value?.trim() || "";
          return {
            id: previousChildren[index]?.id || `local_child_${index + 1}`,
            firstName,
            ageYears,
            gradeLabel,
            avatarMonogram: firstName.charAt(0).toUpperCase(),
            accentToken: previousChildren[index]?.accentToken || ["navy", "wine", "forest", "gold", "plum"][index % 5]
          };
        });
        if (!learnPlanIsPaid() && children.length > LEARN_FREE_CHILD_LIMIT) {
          showPaywallDialog("Family Plan Needed", `The free AGAPAY Learn plan supports ${LEARN_FREE_CHILD_LIMIT} children. Upgrade before saving a larger household setup.`);
          return;
        }
        const subjects = Array.from(setupForm.querySelectorAll("[data-subject-index]")).map((editor, index) => ({
          id: readSetupState().subjects?.[index]?.id || `local_subject_${index + 1}`,
          title: editor.querySelector('[data-setup-subject="title"]')?.value?.trim() || "",
          resource: editor.querySelector('[data-setup-subject="resource"]')?.value?.trim() || "",
          cadence: editor.querySelector('[data-setup-subject="cadence"]')?.value?.trim() || "",
          minutes: Number(editor.querySelector('[data-setup-subject="minutes"]')?.value || 0)
        })).filter((subject) => subject.title || subject.resource);
        const books = Array.from(setupForm.querySelectorAll("[data-book-index]")).map((editor, index) => ({
          id: readSetupState().books?.[index]?.id || `local_book_${index + 1}`,
          title: editor.querySelector('[data-setup-book="title"]')?.value?.trim() || "",
          author: editor.querySelector('[data-setup-book="author"]')?.value?.trim() || "",
          role: editor.querySelector('[data-setup-book="role"]')?.value || "Family Read-Aloud"
        }));
        const formationMaterials = Array.from(setupForm.querySelectorAll("[data-formation-index]")).map((editor, index) => ({
          id: readSetupState().formationMaterials?.[index]?.id || `local_formation_${index + 1}`,
          title: editor.querySelector('[data-setup-formation="title"]')?.value?.trim() || "",
          source: editor.querySelector('[data-setup-formation="source"]')?.value?.trim() || "",
          cadence: editor.querySelector('[data-setup-formation="cadence"]')?.value?.trim() || ""
        }));
        const currentSetup = readSetupState();
        const coOpMembers = Array.from(setupForm.querySelectorAll("[data-coop-member-index]")).map((editor, index) => ({
          id: currentSetup.coOp?.members?.[index]?.id || `coop_member_${index + 1}`,
          agapayEmail: editor.querySelector('[data-setup-coop-member="agapayEmail"]')?.value?.trim() || "",
          householdName: editor.querySelector('[data-setup-coop-member="householdName"]')?.value?.trim() || "",
          childrenCount: Number(editor.querySelector('[data-setup-coop-member="childrenCount"]')?.value || 0),
          role: editor.querySelector('[data-setup-coop-member="role"]')?.value || "member"
        })).filter((member) => member.agapayEmail || member.householdName);
        const coOpScheduleBlocks = Array.from(setupForm.querySelectorAll("[data-coop-schedule-index]")).map((editor, index) => ({
          id: currentSetup.coOp?.scheduleBlocks?.[index]?.id || `coop_block_${index + 1}`,
          startsAt: editor.querySelector('[data-setup-coop-schedule="startsAt"]')?.value?.trim() || "",
          endsAt: editor.querySelector('[data-setup-coop-schedule="endsAt"]')?.value?.trim() || "",
          title: editor.querySelector('[data-setup-coop-schedule="title"]')?.value?.trim() || "",
          subtitle: editor.querySelector('[data-setup-coop-schedule="subtitle"]')?.value?.trim() || "",
          teacherHouseholdName: editor.querySelector('[data-setup-coop-schedule="teacherHouseholdName"]')?.value?.trim() || ""
        })).filter((block) => block.title || block.startsAt || block.teacherHouseholdName);
        const coOpAnnouncements = Array.from(setupForm.querySelectorAll("[data-coop-announcement-index]")).map((editor, index) => ({
          id: currentSetup.coOp?.announcements?.[index]?.id || `coop_announcement_${index + 1}`,
          title: editor.querySelector('[data-setup-coop-announcement="title"]')?.value?.trim() || "",
          body: editor.querySelector('[data-setup-coop-announcement="body"]')?.value?.trim() || "",
          priority: editor.querySelector('[data-setup-coop-announcement="priority"]')?.value || "normal"
        })).filter((entry) => entry.title || entry.body);
        const coOpResources = Array.from(setupForm.querySelectorAll("[data-coop-resource-index]")).map((editor, index) => ({
          id: currentSetup.coOp?.resources?.[index]?.id || `coop_resource_${index + 1}`,
          title: editor.querySelector('[data-setup-coop-resource="title"]')?.value?.trim() || "",
          type: editor.querySelector('[data-setup-coop-resource="type"]')?.value?.trim() || "Link",
          url: editor.querySelector('[data-setup-coop-resource="url"]')?.value?.trim() || ""
        })).filter((resource) => resource.title || resource.url);
        const coOpSharedReadAlouds = Array.from(setupForm.querySelectorAll("[data-coop-readaloud-index]")).map((editor, index) => ({
          id: currentSetup.coOp?.sharedReadAlouds?.[index]?.id || `coop_readaloud_${index + 1}`,
          title: editor.querySelector('[data-setup-coop-readaloud="title"]')?.value?.trim() || "",
          author: editor.querySelector('[data-setup-coop-readaloud="author"]')?.value?.trim() || "",
          status: editor.querySelector('[data-setup-coop-readaloud="status"]')?.value?.trim() || "Planned",
          progressPercent: 0
        })).filter((book) => book.title);
        writeSetupState({
          householdName: String(formData.get("householdName") || "").trim() || "Your Household",
          parentNames: String(formData.get("parentNames") || "").trim(),
          parishName: String(formData.get("parishName") || "").trim(),
          city: String(formData.get("city") || "").trim(),
          primaryMethod: String(formData.get("primaryMethod") || "Charlotte Mason"),
          calendarType: String(formData.get("calendarType") || "julian"),
          evaluationModel: String(formData.get("evaluationModel") || "narrative-only"),
          graceModeDefault: String(formData.get("graceModeDefault") || "light"),
          schoolYearLabel: String(formData.get("schoolYearLabel") || "").trim() || "Current School Year",
          schoolYearStart: String(formData.get("schoolYearStart") || ""),
          schoolYearEnd: String(formData.get("schoolYearEnd") || ""),
          cyclePlanning: {
            cycleTitle: String(formData.get("cycleTitle") || "").trim(),
            historyFocus: String(formData.get("historyFocus") || "").trim(),
            catechesisFocus: String(formData.get("catechesisFocus") || "").trim(),
            termTheme: String(formData.get("termTheme") || "").trim(),
            weekLabel: String(formData.get("weekLabel") || "").trim(),
            notes: String(formData.get("cycleNotes") || "").trim()
          },
          children,
          subjects,
          books,
          formationMaterials,
          googleCalendar: {
            targetCalendar: String(formData.get("googleTargetCalendar") || "AGAPAY Learn").trim(),
            syncScope: String(formData.get("googleSyncScope") || "lessons-feasts-readalouds"),
            reminderMinutes: Number(formData.get("googleReminderMinutes") || 30)
          },
          liturgicalSource: {
            provider: String(formData.get("liturgicalProvider") || "orthocal"),
            hymnProvider: String(formData.get("hymnProvider") || "ponomar"),
            manualEpistle: String(formData.get("manualEpistle") || "").trim(),
            manualGospel: String(formData.get("manualGospel") || "").trim(),
            troparionTone: String(formData.get("troparionTone") || "").trim(),
            troparionText: String(formData.get("troparionText") || "").trim(),
            kontakionTone: String(formData.get("kontakionTone") || "").trim(),
            kontakionText: String(formData.get("kontakionText") || "").trim(),
            sourceNote: String(formData.get("liturgicalSourceNote") || "").trim()
          },
          coOp: {
            enabled: String(formData.get("coOpEnabled") || "false") === "true",
            name: String(formData.get("coOpName") || "").trim(),
            city: String(formData.get("coOpCity") || "").trim(),
            affiliation: String(formData.get("coOpAffiliation") || "Orthodox homeschool community").trim(),
            patron: String(formData.get("coOpPatron") || "").trim(),
            cadence: String(formData.get("coOpCadence") || "Weekly").trim(),
            nextMeetingDate: String(formData.get("coOpNextMeetingDate") || ""),
            meetingTime: String(formData.get("coOpMeetingTime") || "").trim(),
            meetingLocation: String(formData.get("coOpMeetingLocation") || "").trim(),
            description: String(formData.get("coOpDescription") || "").trim(),
            members: coOpMembers,
            scheduleBlocks: coOpScheduleBlocks,
            announcements: coOpAnnouncements,
            resources: coOpResources,
            sharedReadAlouds: coOpSharedReadAlouds
          }
        });
        showDialog("Setup Saved", "AGAPAY Learn will use these household, calendar, and child settings across the planner.", [
          { label: "Calendar", type: "text", value: formData.get("calendarType") === "revised-julian" ? "Revised Julian / Gregorian" : "Julian / Old Calendar" },
          { label: "Children", type: "text", value: String(children.length) }
        ]);
      });
    }
  }

  async function loadDashboard() {
    const main = document.getElementById("learnRoot");
    const calendar = localStorage.getItem("agapay.learn.calendar") || "julian";
    main.innerHTML = renderLoading("Loading AGAPAY Learn...");

    const payload = await apiGet(`/api/learn/dashboard?calendar=${encodeURIComponent(calendar)}`);
    main.innerHTML = renderDashboard(payload);
    bindLearnInteractions();

    document.querySelectorAll("[data-calendar]").forEach((button) => {
      button.addEventListener("click", async function () {
        localStorage.setItem("agapay.learn.calendar", this.getAttribute("data-calendar"));
        await loadDashboard();
      });
    });
  }

  async function loadPlanner(viewOverride) {
    const main = document.getElementById("learnRoot");
    const calendar = localStorage.getItem("agapay.learn.calendar") || "julian";
    const view = viewOverride || requestedPlannerView();
    main.innerHTML = renderLoading("Loading planner...");

    const payload = await apiGet(`/api/learn/planner?calendar=${encodeURIComponent(calendar)}&view=${encodeURIComponent(view)}`);
    main.innerHTML = renderPlanner(payload);
    bindLearnInteractions();

    document.querySelectorAll("[data-calendar]").forEach((button) => {
      button.addEventListener("click", async function () {
        localStorage.setItem("agapay.learn.calendar", this.getAttribute("data-calendar"));
        await loadPlanner(view);
      });
    });
    document.querySelectorAll("[data-planner-view]").forEach((button) => {
      button.addEventListener("click", async function () {
        const nextView = this.getAttribute("data-planner-view");
        localStorage.setItem("agapay.learn.plannerView", nextView);
        await loadPlanner(nextView);
      });
    });
    document.querySelectorAll("[data-planner-term]").forEach((button) => {
      button.addEventListener("click", async function () {
        const nextTerm = this.getAttribute("data-planner-term") || "2";
        localStorage.setItem("agapay.learn.plannerTerm", nextTerm);
        localStorage.setItem("agapay.learn.plannerView", "term");
        await loadPlanner("term");
      });
    });
  }

  async function loadPrintCenter() {
    const main = document.getElementById("learnRoot");
    const calendar = localStorage.getItem("agapay.learn.calendar") || "julian";
    main.innerHTML = renderLoading("Loading print center...");

    const payload = await apiGet(`/api/learn/print-center?calendar=${encodeURIComponent(calendar)}`);
    main.innerHTML = renderPrintCenter(payload);
    bindLearnInteractions();

    document.querySelectorAll("[data-calendar]").forEach((button) => {
      button.addEventListener("click", async function () {
        localStorage.setItem("agapay.learn.calendar", this.getAttribute("data-calendar"));
        await loadPrintCenter();
      });
    });
  }

  function mountPage() {
    if (currentPageKey() === "dashboard") {
      loadDashboard().catch((error) => {
        document.getElementById("learnRoot").innerHTML = renderError("Unable to load Learn dashboard", error);
        bindLearnInteractions();
      });
      return;
    }
    if (currentPageKey() === "planner") {
      loadPlanner().catch((error) => {
        document.getElementById("learnRoot").innerHTML = renderError("Unable to load Planner", error);
        bindLearnInteractions();
      });
      return;
    }
    if (currentPageKey() === "print-center") {
      loadPrintCenter().catch((error) => {
        document.getElementById("learnRoot").innerHTML = renderError("Unable to load Print Center", error);
        bindLearnInteractions();
      });
      return;
    }
    if (["formation", "books", "community", "reports", "co-op", "onboarding"].includes(currentPageKey())) {
      loadFeaturePage(currentPageKey()).catch((error) => {
        document.getElementById("learnRoot").innerHTML = renderError(`Unable to load ${currentPageKey()}`, error);
        bindLearnInteractions();
      });
      return;
    }

    document.getElementById("learnRoot").innerHTML = renderPlaceholder();
  }

  function mount() {
    consumeLearnBillingReturn();
    const app = document.querySelector(".learn-app");
    const shell = document.createElement("div");
    shell.innerHTML = renderSidebar();
    app.insertBefore(shell.firstElementChild, app.firstChild);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeDialog();
    });
    document.addEventListener("click", (event) => {
      if (event.target?.matches?.("[data-dialog-backdrop]")) closeDialog();
    });
    mountPage();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else {
    mount();
  }
})();
