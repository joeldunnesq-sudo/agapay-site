(function () {
  const navItems = [
    { href: "/learn/app", label: "Dashboard", key: "dashboard", icon: "home" },
    { href: "/learn/planner", label: "Planner", key: "planner", icon: "calendar" },
    { href: "/learn/formation", label: "Formation", key: "formation", icon: "church" },
    { href: "/learn/books", label: "Books", key: "books", icon: "book" },
    { href: "/learn/reports", label: "Reports", key: "reports", icon: "bars" },
    { href: "/learn/print-center", label: "Print Center", key: "print-center", icon: "printer" },
    { href: "/learn/onboarding", label: "Setup", key: "onboarding", icon: "check" },
    { href: "/learn/co-op", label: "Co-op", key: "co-op", icon: "users" }
  ];

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
            <div class="learn-brand-mark"><img src="/mark.png" alt="AGAPAY" /></div>
            <div class="learn-brand-copy">
              <strong>AGAPAY Learn</strong>
              <span>Orthodox homeschool planner</span>
            </div>
          </div>
          <nav class="learn-nav" aria-label="AGAPAY Learn">${navHtml}</nav>
        </div>
        <div class="learn-sidebar-footer">
          <div class="learn-sidebar-blessing">
            <p>Rooted in Christ. Ordered in Love.</p>
          </div>
        </div>
      </aside>
    `;
  }

  function renderTopbar(data) {
    const { household, activeIndicators, calendarToggle, today } = data.dashboard;
    return `
      <header class="learn-topbar">
        <div>
          <div class="learn-page-title">${today.title}</div>
          <div class="learn-page-subtitle">${today.dateLabel} · ${today.weekdayLabel}</div>
        </div>
        <div class="learn-topbar-right">
          <div class="learn-chip">${activeIndicators.graceMode.label} · ${activeIndicators.graceMode.detail}</div>
          <div class="learn-chip-soft">${activeIndicators.cycle}</div>
          <div class="learn-chip-soft">${activeIndicators.curriculumPackage}</div>
          <div class="learn-utility">${household.topbarTimeLabel}</div>
          <div class="learn-utility">${household.name} · ${household.childrenCount} Children · ${household.primaryMethod}</div>
          <div class="learn-segmented" id="calendarToggle">
            ${calendarToggle.options.map((option) => `
              <button type="button" data-calendar="${option.value}" class="${calendarToggle.active === option.value ? "is-active" : ""}">
                ${option.label}
              </button>
            `).join("")}
          </div>
        </div>
      </header>
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
          </div>
          <div class="learn-liturgy-grid">
            <div class="learn-icon-panel">
              <img src="/pantocrator.png" alt="Liturgical icon panel" />
            </div>
            <div class="learn-liturgy-copy">
              <div class="learn-kicker">${day.feastRank}</div>
              <h2>${day.feastTitle}</h2>
              <p>${day.saints.join(" · ")}</p>
              <div class="learn-liturgy-meta">
                <div class="learn-meta-pill">
                  <div class="learn-meta-label">Old Style Date</div>
                  <div class="learn-meta-value">${day.oldStyleDateLabel}</div>
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
      <aside class="learn-card">
        <div class="learn-card-inner">
          <div class="learn-card-title"><strong>This Week</strong></div>
          <div class="learn-summary-stack">
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
          <button class="learn-button" type="button" data-learn-action="planner-edit" data-action-title="Weekly Plan" data-action-body="Review completion, move unfinished work, or open the full week planner.">View Full Week</button>
          </div>
        </div>
      </aside>
    `;
  }

  function renderDashboard(data) {
    return `
      ${renderTopbar(data)}
      <div class="learn-shell">
        ${renderLiturgyCard(data)}
        ${renderRhythms(data)}
        <div class="learn-dashboard-grid">
          ${renderPlanningGrid(data)}
          ${renderWeeklySummary(data)}
        </div>
      </div>
    `;
  }

  function renderPlaceholder() {
    const key = currentPageKey();
    const labels = Object.fromEntries(navItems.map((item) => [item.key, item.label]));
    const label = labels[key] || "Learn";
    return `
      <header class="learn-topbar">
        <div>
          <div class="learn-page-title">${label}</div>
          <div class="learn-page-subtitle">Phase 1 shell route in place. The real implementation begins in the next Learn phase.</div>
        </div>
        <div class="learn-topbar-right">
          <div class="learn-chip">Learn product flagged on</div>
        </div>
      </header>
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
      <header class="learn-topbar">
        <div>
          <div class="learn-page-title">Planner</div>
          <div class="learn-page-subtitle">${planner.week.label} · ${planner.week.seasonLabel}</div>
        </div>
        <div class="learn-topbar-right">
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
        </div>
      </header>
    `;
  }

  function renderPlannerControls(activeView) {
    return `
      <section class="learn-planner-controls">
        ${["day", "week", "term", "year"].map((view) => `
          <button type="button" data-planner-view="${view}" class="${activeView === view ? "is-active" : ""}">${view[0].toUpperCase()}${view.slice(1)}</button>
        `).join("")}
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
              <div class="learn-week-day">
                <strong>${day.civilDate.slice(5)}</strong>
                <span>${day.feastTitle}</span>
                <small>${day.fastingRule} · ${day.tone}</small>
              </div>
            `).join("")}
            ${rows.map((row) => `
              <div class="learn-week-row-label ${row.child ? "is-child" : ""}">
                ${row.child ? `<span class="learn-avatar ${accentClass(row.child.accentToken)}">${row.child.avatarMonogram}</span>` : ""}
                <div>
                  <strong>${row.title}</strong>
                  <span>${row.detail}${row.graceModeApplied ? " · Grace Mode adjusted" : ""}</span>
                </div>
              </div>
              ${row.minutes.map((minutes, index) => `
                <div class="learn-week-cell ${row.statuses[index]}">
                  ${minutes ? `<strong>${minutes}m</strong><span>${row.statuses[index]}</span>` : "<span>-</span>"}
                </div>
              `).join("")}
            `).join("")}
          </div>
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
          <p class="learn-text-muted">${planner.readAloud.book.title}</p>
          <div class="learn-progress"><span style="width:${planner.readAloud.assignment.progressPercent}%"></span></div>
          <small>${planner.readAloud.assignment.currentLabel}</small>
        </div></section>
        <section class="learn-card"><div class="learn-card-inner">
          <div class="learn-card-title"><strong>Quick Reschedule</strong></div>
          <label class="learn-field">Move selected activities to <input type="date" value="2025-05-12" /></label>
          <button class="learn-button learn-button-primary" type="button" data-learn-action="planner-edit" data-action-title="Quick Reschedule" data-action-body="Choose one or more lesson blocks, pick a target date, and save a draft reschedule before changing the live plan.">Reschedule</button>
        </div></section>
        <section class="learn-card"><div class="learn-card-inner">
          <div class="learn-card-title"><strong>Grace Mode</strong></div>
          <p class="learn-text-muted">${planner.graceMode.seasonAdjustment.summary}</p>
          ${planner.graceMode.changed.map((entry) => `<div class="learn-change-line">${entry}</div>`).join("")}
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

  function renderTermView(payload) {
    const term = payload.planner.termSetup;
    const childLookup = Object.fromEntries(payload.planner.children.map((child) => [child.id, child]));
    return `
      <section class="learn-term-shell">
        <div class="learn-term-main">
          <div class="learn-term-tabs">
            ${term.termOptions.map((option) => `<button class="${option.id === term.activeTermId ? "is-active" : ""}" type="button">${option.label}</button>`).join("")}
          </div>
          <div class="learn-term-cards">
            ${term.setupCards.map((card) => `<article class="learn-term-card"><strong>${card.title}</strong><span>${card.detail}</span><b>${card.value}</b></article>`).join("")}
          </div>
          <section class="learn-card"><div class="learn-card-inner">
            <div class="learn-card-title"><strong>Term Pacing · 12 Weeks</strong></div>
            <div class="learn-pacing-grid">
              <div class="learn-pacing-header">Week</div>
              ${Array.from({ length: 12 }, (_, index) => `<div class="learn-pacing-week">${index + 1}</div>`).join("")}
              ${term.pacingRows.map((row) => `
                <div class="learn-pacing-label"><strong>${row.label}</strong><span>${row.subtitle}</span></div>
                <div class="learn-pacing-track">
                  ${row.segments.map((segment) => `<span style="--start:${segment.start};--span:${segment.span}">${segment.title}</span>`).join("")}
                </div>
              `).join("")}
            </div>
          </div></section>
          <section class="learn-term-summaries">
            <div class="learn-card"><div class="learn-card-inner"><div class="learn-card-title"><strong>Household Stream</strong></div>${term.householdSummary.map((item) => `<div class="learn-change-line">${item}</div>`).join("")}</div></div>
            <div class="learn-card"><div class="learn-card-inner"><div class="learn-card-title"><strong>Child Tracks</strong></div>${term.childTrackSummary.map((item) => `<div class="learn-side-line"><b>${childLookup[item.childId]?.firstName || "Child"}</b><span>${item.tracks.join(" · ")}</span></div>`).join("")}</div></div>
          </section>
        </div>
        <aside class="learn-card"><div class="learn-card-inner">
          <div class="learn-card-title"><strong>Term Summary</strong></div>
          <div class="learn-summary-stat"><div class="learn-summary-value">${term.termSummary.weeks}</div><div class="learn-summary-note">Weeks this term</div></div>
          <div class="learn-summary-stat"><div class="learn-summary-value">${term.termSummary.livingBooks}</div><div class="learn-summary-note">Living books assigned</div></div>
          <div class="learn-summary-stat"><div class="learn-summary-value">${term.termSummary.pictureArtists}</div><div class="learn-summary-note">Picture study artists</div></div>
          <div class="learn-summary-stat"><div class="learn-summary-value">${term.termSummary.childrenTracked}</div><div class="learn-summary-note">Children tracked</div></div>
          <button class="learn-button learn-button-primary" type="button" data-learn-action="planner-edit" data-action-title="Generate Week Plans" data-action-body="Draft weekly plans from term pacing, Grace Mode, feast days, and child track settings.">Generate Week Plans</button>
        </div></aside>
      </section>
    `;
  }

  function renderPlanner(payload) {
    const activeView = payload.planner.activeView;
    return `
      ${renderPlannerTopbar(payload)}
      ${renderPlannerControls(activeView)}
      <div class="learn-shell">
        ${renderCycleCurriculum(payload)}
        ${activeView === "term" ? renderTermView(payload) : `<div class="learn-planner-layout">${renderWeekGrid(payload)}${renderPlannerSidebar(payload)}</div>`}
      </div>
    `;
  }

  function renderPrintCenter(payload) {
    const data = payload.printCenter;
    const momTemplates = data.templates.filter((template) => template.audience === "mom");
    const childTemplates = data.templates.filter((template) => template.audience === "child");
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
      <header class="learn-topbar">
        <div>
          <div class="learn-page-title">Print Center</div>
          <div class="learn-page-subtitle">${data.term.label} · ${data.calendarToggle.description}</div>
        </div>
        <div class="learn-topbar-right">
          <div class="learn-segmented" id="calendarToggle">
            ${data.calendarToggle.options.map((option) => `<button type="button" data-calendar="${option.value}" class="${data.calendarToggle.active === option.value ? "is-active" : ""}">${option.label}</button>`).join("")}
          </div>
        </div>
      </header>
      <div class="learn-print-layout">
        <section class="learn-card"><div class="learn-card-inner">
          <div class="learn-card-title"><strong>For Mom</strong><button class="learn-button" type="button" data-learn-action="print-edit" data-action-title="Mom Print Pack" data-action-body="Choose PDF format, week range, and included sections before generating a print job.">Print</button></div>
          <div class="learn-print-grid">${momTemplates.map(renderPrintTemplate).join("")}</div>
        </div></section>
        <section class="learn-card"><div class="learn-card-inner">
          <div class="learn-card-title"><strong>For Each Child</strong><button class="learn-button" type="button" data-learn-action="print-edit" data-action-title="Child Print Pack" data-action-body="Select children, assignment sheets, reading lists, and memory work pages for PDF generation.">Print</button></div>
          <div class="learn-print-grid">${childTemplates.map(renderPrintTemplate).join("")}</div>
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

  function renderPrintTemplate(template) {
    return `
      <article class="learn-print-template">
        <strong>${template.title}</strong>
        <span>${template.description}</span>
        ${template.child ? `<small>${template.child.gradeLabel} · Age ${template.child.ageYears}</small>` : "<small>Household output</small>"}
      </article>
    `;
  }

  function renderSimpleTopbar(title, subtitle, actions = "") {
    return `
      <header class="learn-topbar">
        <div>
          <div class="learn-page-title">${title}</div>
          <div class="learn-page-subtitle">${subtitle}</div>
        </div>
        <div class="learn-topbar-right">${actions}</div>
      </header>
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
            <p class="learn-text-muted">The Bronze Bow by Elizabeth George Speare</p>
          </div></div>
          <aside class="learn-card"><div class="learn-card-inner">
            <div class="learn-card-title"><strong>This Week in the Church</strong></div>
            <div class="learn-calendar-tile"><b>May 7</b><span>${data.today.liturgicalDay.feastTitle}</span><small>${data.today.liturgicalDay.fastingRule}</small></div>
            <div class="learn-side-line"><b>Readings</b><span>${data.today.liturgicalDay.epistleRef}; ${data.today.liturgicalDay.gospelRef}</span></div>
            <div class="learn-side-line"><b>Saint</b><span>${data.today.liturgicalDay.saints.join(", ")}</span></div>
            <button class="learn-button" type="button" data-learn-action="planner-edit" data-action-title="Liturgical Calendar" data-action-body="Review upcoming feasts, saints, fast rules, and calendar source notes.">View Full Calendar</button>
          </div></aside>
        </section>
        <section class="learn-feature-grid">
          <div class="learn-card"><div class="learn-card-inner"><div class="learn-card-title"><strong>Recitation & Memory Work</strong></div>${data.recitationTracks.map((track) => `<div class="learn-progress-line"><span>${track.title}</span>${progressBar(track.progressPercent)}<b>${track.progressPercent}%</b></div>`).join("")}</div></div>
          <div class="learn-card"><div class="learn-card-inner"><div class="learn-card-title"><strong>Hymn Study</strong></div>${data.hymnStudies.map((hymn) => `<div class="learn-side-line"><b>${hymn.title}</b><span>${hymn.tone} · ${hymn.source}</span><small>${hymn.status}</small></div>`).join("")}<button class="learn-button learn-button-primary" type="button" data-learn-action="planner-edit" data-action-title="Hymn Study" data-action-body="Add the selected hymn to morning basket, choose a tone, and set a review cadence.">Add to Morning Basket</button></div></div>
          <div class="learn-card"><div class="learn-card-inner"><div class="learn-card-title"><strong>Enrichment</strong></div>${data.enrichmentBlocks.map((block) => `<div class="learn-side-line"><b>${block.blockType}</b><span>${block.title}</span><small>${block.minutesPlanned}m</small></div>`).join("")}</div></div>
        </section>
        <section class="learn-card"><div class="learn-card-inner"><div class="learn-card-title"><strong>Saints, Feasts & Nature Journal</strong></div><div class="learn-inline-grid">${data.upcomingFeasts.map((feast) => `<article class="learn-mini-card"><strong>${feast.title}</strong><span>${feast.civilDate}</span><small>${feast.fastingRule}</small></article>`).join("")}${data.natureJournalEntries.map((entry) => `<article class="learn-mini-card"><strong>${entry.title}</strong><span>${entry.location}</span><small>${entry.notes}</small></article>`).join("")}</div></div></section>
      </div>
    `;
  }

  function renderBooks(payload) {
    const data = payload.books;
    return `
      ${renderSimpleTopbar("Books", "Living books for the mind, the heart, and the soul.", `<input class="learn-search" placeholder="Search books..." />`)}
      <div class="learn-shell">
        <section class="learn-card"><div class="learn-card-inner">
          <div class="learn-card-title"><strong>Current Read-Alouds</strong><button class="learn-button" type="button" data-learn-action="planner-edit" data-action-title="Read-Alouds" data-action-body="Edit pacing, current chapter, and assigned stream for household living books.">View All Read-Alouds</button></div>
          <div class="learn-inline-grid">${data.currentReadAlouds.map((book) => `<article class="learn-book-card"><div class="learn-book-cover">${book.title.slice(0, 1)}</div><div><strong>${book.title}</strong><span>${book.author}</span><small>${book.assignmentLabel}</small>${progressBar(book.progressPercent)}<small>${book.progressPercent}% · ${book.streamLabel}</small></div></article>`).join("")}</div>
        </div></section>
        <div class="learn-two-column">
          <section class="learn-card"><div class="learn-card-inner">
            <div class="learn-card-title"><strong>Household Library</strong></div>
            <div class="learn-table">
              <div class="learn-table-head"><span>Title</span><span>Author</span><span>Category</span><span>Ages</span><span>Progress</span></div>
              ${data.libraryBooks.map((book) => `<div class="learn-table-row"><span><b>${book.title}</b>${book.orthodox ? "<small>Orthodox</small>" : ""}</span><span>${book.author}</span><span>${book.category}</span><span>${book.ageRange}</span><span>${progressBar(book.progressPercent)}<small>${book.progressPercent}%</small></span></div>`).join("")}
            </div>
          </div></section>
          <aside class="learn-side-stack">
            <section class="learn-card"><div class="learn-card-inner"><div class="learn-card-title"><strong>Suggested Orthodox Living Books</strong></div>${data.orthodoxSuggestions.map((item) => `<div class="learn-record-row"><span class="learn-avatar ${accentClass(item.accentToken)}">${item.title.slice(0, 1)}</span><div><strong>${item.title}</strong><small>${item.subtitle}</small></div></div>`).join("")}</div></section>
            <section class="learn-card"><div class="learn-card-inner"><div class="learn-card-title"><strong>Book Pacing</strong></div><strong>${data.bookPacing.title}</strong><p class="learn-text-muted">${data.bookPacing.subtitle}</p>${progressBar(data.bookPacing.progressPercent)}${data.bookPacing.weeks.map((week) => `<div class="learn-side-line"><b>Week ${week.week}</b><span>Chapters ${week.chapters}</span><small>${week.pages} pages</small></div>`).join("")}</div></section>
            <section class="learn-card"><div class="learn-card-inner"><div class="learn-card-title"><strong>Copywork Sources</strong></div>${data.copyworkSources.map((source) => `<div class="learn-side-line"><b>${source.title}</b><span>${source.detail}</span></div>`).join("")}</div></section>
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
    const firstReportExport = firstReport.exportPreview || firstReport;
    const firstTranscriptExport = firstTranscript.exportPreview || firstTranscript;
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
              ${data.children.map((child, index) => `<div class="learn-table-row learn-report-row"><span><span class="learn-avatar ${accentClass(child.accentToken)}">${child.avatarMonogram}</span><b>${child.firstName}</b></span><span>${child.gradeLabel} · Age ${child.ageYears}</span><span><small>Lessons</small>${23 - index * 2} / ${28 - index}</span><span><small>Narrations</small>${index + 2}</span><span><small>Nature</small>${data.natureJournalEntries.filter((entry) => entry.childId === child.id).length}</span></div>`).join("")}
            </div>
          </div></section>
          <aside class="learn-side-stack">
            <section class="learn-card"><div class="learn-card-inner"><div class="learn-card-title"><strong>Year-End Report Preview</strong></div><div class="learn-report-preview"><h2>Year-End Report</h2><p>${data.household.name}</p><small>${firstReportExport.summary}</small></div><button class="learn-button" type="button" data-learn-action="academic-edit" data-action-title="Report Card Preview" data-action-body="Review subjects, narrative summaries, marks, and parent notes before PDF export.">Preview Full Report</button><button class="learn-button learn-button-primary" type="button" data-learn-action="academic-edit" data-action-title="Report Card PDF Export" data-action-body="Generate a polished PDF export using report-card sections and narrative summaries.">Export as PDF</button></div></section>
            <section class="learn-card"><div class="learn-card-inner"><div class="learn-card-title"><strong>Transcript Generation</strong></div><strong>${firstTranscript.child.firstName} · ${firstTranscriptExport.gradeSpan}</strong><p class="learn-text-muted">${firstTranscriptExport.records.length} records ready for transcript export.</p><button class="learn-button" type="button" data-learn-action="academic-edit" data-action-title="Transcript Export" data-action-body="Prepare transcript records, evaluation model labels, and grade-span notes for export.">Generate Transcript</button></div></section>
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
      return `${renderSimpleTopbar("Co-op", "Feature-flagged community planning scaffold.", `<div class="learn-chip-soft">learn-coop disabled</div>`)}<div class="learn-shell"><section class="learn-card"><div class="learn-card-inner"><h2>Co-op tools are scaffolded and waiting behind the learn-coop flag.</h2><p class="learn-text-muted">Household Learn pages continue to work independently while community scheduling remains gated.</p></div></section></div>`;
    }
    return `
      ${renderSimpleTopbar("Co-op", `Co-operatives > ${data.coOp.name}`, `<div class="learn-chip">${data.coOp.learningCycleLabel}</div>`)}
      <div class="learn-shell">
        <section class="learn-card"><div class="learn-card-inner learn-coop-hero"><div class="learn-icon-panel"><img src="/pantocrator.png" alt="Co-op patron icon" /></div><div><h1>${data.coOp.name}</h1><p>${data.coOp.city}</p><span>${data.coOp.affiliation}</span></div><div class="learn-feature-stat"><b>${data.members.length}</b><span>Member Families</span></div><div class="learn-feature-stat"><b>May 14</b><span>Next Meeting</span></div></div></section>
        <section class="learn-feature-grid learn-coop-grid">
          <div class="learn-card"><div class="learn-card-inner"><div class="learn-card-title"><strong>Weekly Co-op Schedule</strong></div>${data.scheduleBlocks.map((block) => `<div class="learn-schedule-row"><b>${block.startsAt}<br>${block.endsAt}</b><div><strong>${block.title}</strong><small>${block.subtitle}</small></div><span>${block.teacherHouseholdName}</span></div>`).join("")}</div></div>
          <div class="learn-card"><div class="learn-card-inner"><div class="learn-card-title"><strong>Announcements</strong></div>${data.announcements.map((entry) => `<div class="learn-record-row"><span class="learn-status-dot ${entry.priority === "important" ? "is-complete" : ""}"></span><div><strong>${entry.title}</strong><small>${entry.body}</small></div></div>`).join("")}</div></div>
          <div class="learn-card"><div class="learn-card-inner"><div class="learn-card-title"><strong>Teaching Rotation</strong></div>${data.scheduleBlocks.map((block) => `<div class="learn-side-line"><b>${block.title}</b><span>${block.teacherHouseholdName}</span></div>`).join("")}</div></div>
        </section>
        <section class="learn-feature-grid">
          <div class="learn-card"><div class="learn-card-inner"><div class="learn-card-title"><strong>Shared Read-Alouds</strong></div>${data.sharedReadAlouds.map((book) => `<div class="learn-side-line"><b>${book.title}</b><span>${book.author}</span><small>${book.progressPercent}%</small></div>`).join("")}</div></div>
          <div class="learn-card"><div class="learn-card-inner"><div class="learn-card-title"><strong>Resources & Documents</strong></div>${data.resources.map((resource) => `<div class="learn-side-line"><b>${resource.title}</b><span>${resource.type}</span></div>`).join("")}</div></div>
          <div class="learn-card"><div class="learn-card-inner"><div class="learn-card-title"><strong>Member Families</strong><button class="learn-button learn-button-primary">Invite Family</button></div>${data.members.map((member) => `<div class="learn-side-line"><b>${member.householdName}</b><span>${member.childrenCount} Children · ${member.role}</span></div>`).join("")}</div></div>
        </section>
      </div>
    `;
  }

  function renderOnboarding(payload) {
    const data = payload.onboarding;
    return `
      ${renderSimpleTopbar("Setup", "Configure AGAPAY Learn for your household before the school rhythm begins.", `<div class="learn-chip">Step ${data.onboarding.household.currentStep} of ${data.onboarding.household.totalSteps}</div>`)}
      <div class="learn-shell">
        <section class="learn-card"><div class="learn-card-inner">
          <div class="learn-card-title"><strong>Household Setup Flow</strong><span>Next: ${data.onboarding.household.nextStep}</span></div>
          <div class="learn-setup-steps">${data.onboarding.steps.map((step) => `<article class="learn-setup-step ${step.status}"><b>${step.title}</b><span>${step.summary}</span><small>${step.status}</small></article>`).join("")}</div>
        </div></section>
        <section class="learn-feature-grid">
          <div class="learn-card"><div class="learn-card-inner"><div class="learn-card-title"><strong>Calendar & Records</strong></div><div class="learn-side-line"><b>Calendar</b><span>${data.onboarding.preferences.calendarType}</span></div><div class="learn-side-line"><b>Evaluation</b><span>${data.onboarding.preferences.evaluationModel}</span></div><div class="learn-side-line"><b>Grace Mode</b><span>${data.onboarding.preferences.graceModeDefault}</span></div></div></div>
          <div class="learn-card"><div class="learn-card-inner"><div class="learn-card-title"><strong>Children</strong></div>${data.children.map((child) => `<div class="learn-record-row"><span class="learn-avatar ${accentClass(child.accentToken)}">${child.avatarMonogram}</span><div><strong>${child.firstName}</strong><small>${child.gradeLabel} · Age ${child.ageYears}</small></div></div>`).join("")}</div></div>
          <div class="learn-card"><div class="learn-card-inner"><div class="learn-card-title"><strong>Starter Streams</strong></div>${data.starterStreams.map((stream) => `<div class="learn-side-line"><b>${stream.title}</b><span>${stream.cadenceLabel}</span></div>`).join("")}</div></div>
        </section>
      </div>
    `;
  }

  async function loadFeaturePage(pageKey) {
    const main = document.getElementById("learnRoot");
    const calendar = localStorage.getItem("agapay.learn.calendar") || "julian";
    const endpoint = pageKey === "co-op" ? "co-op" : pageKey;
    main.innerHTML = renderLoading(`Loading ${pageKey}...`);
    const payload = await apiGet(`/api/learn/${endpoint}?calendar=${encodeURIComponent(calendar)}`);
    if (pageKey === "formation") main.innerHTML = renderFormation(payload);
    if (pageKey === "books") main.innerHTML = renderBooks(payload);
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
    return payload;
  }

  function showDialog(title, body, fields) {
    document.querySelector("[data-dialog-backdrop]")?.remove();
    document.body.insertAdjacentHTML("beforeend", renderActionDialog(title, body, fields));
    const dialog = document.querySelector(".learn-dialog");
    dialog?.focus();
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
        if (action === "print-edit") {
          return showDialog(this.dataset.actionTitle || "Print", this.dataset.actionBody || "Prepare a print job.", [
            { label: "Format", type: "select", options: ["PDF", "Browser Print"] },
            { label: "Range", type: "text", value: "May 4 - May 10, 2025" }
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
            { label: "Date", type: "date", value: "2025-05-12" },
            { label: "Mode", type: "select", options: ["Save Draft", "Apply to Week", "Move to Next Available Day"] }
          ]);
        }
      });
    });
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
    if (["formation", "books", "reports", "co-op", "onboarding"].includes(currentPageKey())) {
      loadFeaturePage(currentPageKey()).catch((error) => {
        document.getElementById("learnRoot").innerHTML = renderError(`Unable to load ${currentPageKey()}`, error);
        bindLearnInteractions();
      });
      return;
    }

    document.getElementById("learnRoot").innerHTML = renderPlaceholder();
  }

  function mount() {
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
