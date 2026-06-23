const ACCENTS = ["#14294a", "#6e2f2a", "#4a5a31", "#b5942f", "#34507a"];
const RESOURCE_TYPE_STYLES = {
  website: { color: "#14294a", icon: "↗" },
  reference: { color: "#34507a", icon: "⌕" },
  reading: { color: "#6e2f2a", icon: "☰" },
  book: { color: "#4a5a31", icon: "▤" },
  printable: { color: "#b5942f", icon: "▦" },
  audio: { color: "#6e2f2a", icon: "♪" },
  video: { color: "#14294a", icon: "▷" },
  "mixed media": { color: "#4a5a31", icon: "✥" },
  default: { color: "#b5942f", icon: "✥" }
};

function resourceTypeStyle(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  return RESOURCE_TYPE_STYLES[normalized] || RESOURCE_TYPE_STYLES.default;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function saintKey(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/\([^)]*\b[1-2]?[0-9]{2,3}\b[^)]*\)/g, "")
    .replace(/\b(st|saint|ven|venerable|holy|apostle|evangelist|martyr|great|our holy|righteous|blessed|elder|prophet|hieromartyr|new martyr)\.?\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function saintScore(a = "", b = "") {
  const aTokens = saintKey(a).split(/\s+/).filter((token) => token.length > 2);
  const bTokens = saintKey(b).split(/\s+/).filter((token) => token.length > 2);
  if (!aTokens.length || !bTokens.length) return 0;
  const bSet = new Set(bTokens);
  let score = 0;
  aTokens.forEach((token) => {
    if (bSet.has(token)) score += 3;
    else if ([...bSet].some((other) => other.includes(token) || token.includes(other))) score += 1;
  });
  return score / Math.max(aTokens.length, bTokens.length);
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

function orderSaintNames(names = []) {
  return [...names].sort((a, b) => saintPrecedence(b) - saintPrecedence(a));
}

function saintLikeTitle(value = "") {
  const text = String(value || "").trim();
  if (!text || /today in the church|daily orthodox rhythm|set calendar/i.test(text)) return "";
  if (saintPrecedence(text) > 40) return text;
  return /\b(st\.?|saint|holy|apostle|venerable|martyr|righteous|prophet|hierarch|elder)\b/i.test(text) ? text : "";
}

function orderSaintStories(stories = [], names = []) {
  const remaining = [...stories];
  const ordered = [];
  orderSaintNames(names).forEach((name) => {
    let bestIndex = -1;
    let bestScore = 0;
    remaining.forEach((story, index) => {
      const score = Math.max(saintScore(name, story.name), saintScore(name, story.title));
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });
    if (bestIndex >= 0 && bestScore >= 0.45) {
      ordered.push(remaining[bestIndex]);
      remaining.splice(bestIndex, 1);
    }
  });
  return [...ordered, ...remaining];
}

function annoMundiLabel(civilDate = "") {
  const match = String(civilDate || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || !month || !day) return "";
  return `Anno Mundi ${year + (month >= 9 ? 5509 : 5508)}`;
}

function text(value, fallback = "") {
  return String(value || fallback);
}

function weeklyFrequencyValue(value, fallback = "1x") {
  const raw = String(value || "").trim().toLowerCase();
  if (["daily", "4x", "3x", "2x", "1x", "as-needed"].includes(raw)) return raw;
  if (raw.includes("daily") || raw.includes("every")) return "daily";
  if (raw.includes("4")) return "4x";
  if (raw.includes("3")) return "3x";
  if (raw.includes("2")) return "2x";
  if (raw.includes("as")) return "as-needed";
  if (raw.includes("week")) return "1x";
  return fallback;
}

function percent(value) {
  const number = Number(value || 0);
  return Math.max(0, Math.min(100, Number.isFinite(number) ? number : 0));
}

function childName(child = {}, index = 0) {
  return text(child.firstName || child.name, `Child ${index + 1}`);
}

function childInitial(child = {}, index = 0) {
  return text(child.avatarMonogram || childName(child, index).charAt(0), "?").toUpperCase();
}

function childFormByAge(age) {
  const years = Number(age);
  if (!Number.isFinite(years)) return "";
  if (years <= 5) return "Little Ones";
  if (years <= 8) return "Form I";
  if (years <= 11) return "Form II";
  if (years <= 14) return "Form III";
  if (years <= 16) return "Form IV";
  return "Form V";
}

function formLabelForChild(child = {}) {
  return text(child.formLabel || child.gradeLabel || child.form || childByAgeLabel(child.ageYears), "Household Form");
}

function childByAgeLabel(age) {
  return childFormByAge(age) || "Household Form";
}

function groupRowsByForm(rows = [], dayIndex = null) {
  const groups = new Map();
  safeArray(rows).forEach((row, index) => {
    const formLabel = formLabelForChild(row.child);
    if (!groups.has(formLabel)) {
      groups.set(formLabel, {
        formLabel,
        childNames: [],
        initials: [],
        color: ACCENTS[groups.size % ACCENTS.length],
        items: [],
        totalMinutes: 0
      });
    }
    const group = groups.get(formLabel);
    const name = childName(row.child, index);
    if (!group.childNames.includes(name)) group.childNames.push(name);
    const initial = childInitial(row.child, index);
    if (!group.initials.includes(initial)) group.initials.push(initial);
    const minutes = dayIndex === null
      ? safeArray(row.minutes).reduce((sum, value) => sum + Number(value || 0), 0)
      : Number(safeArray(row.minutes)[dayIndex] || 0);
    const status = dayIndex === null ? "" : text(safeArray(row.statuses)[dayIndex], "");
    if (dayIndex === null || minutes > 0 || status === "rest") {
      group.totalMinutes += minutes;
      group.items.push({
        title: text(row.title, "Lesson"),
        sub: text(row.detail || row.subtitle, ""),
        childName: name,
        minutes,
        status,
        graceModeApplied: Boolean(row.graceModeApplied)
      });
    }
  });
  return Array.from(groups.values()).filter((group) => group.items.length);
}

function donorAccountFromStorage() {
  try {
    const donor = JSON.parse(localStorage.getItem("agapayDonorProfile") || "{}");
    const email = localStorage.getItem("agapayDonorEmail") || donor.email || "";
    const name = text(donor.donorName || email.split("@")[0], "Faithful Member");
    const words = name.trim().split(/\s+/).filter(Boolean);
    const initials = words.length
      ? words.slice(0, 2).map((word) => word.charAt(0)).join("").toUpperCase()
      : "FM";
    return {
      name,
      initials: initials || "FM"
    };
  } catch {
    return {
      name: "Faithful Member",
      initials: "FM"
    };
  }
}

function dateParts(isoDate) {
  const date = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return { weekday: "", short: text(isoDate), dayNumber: "" };
  return {
    weekday: new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date).toUpperCase(),
    weekdayLong: new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(date),
    short: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date),
    dayNumber: new Intl.DateTimeFormat("en-US", { day: "numeric" }).format(date),
    isSunday: date.getDay() === 0
  };
}

function shellFromPayload(page, payload) {
  const section = payload?.[page] || payload?.dashboard || payload?.planner || {};
  const household = section.household || {};
  const children = safeArray(section.children);
  const name = text(household.name, "Your Household");
  const method = text(household.primaryMethod, "Homeschool");
  const account = donorAccountFromStorage();
  return {
    familyName: name,
    familyInitial: name.replace(/^The\s+/i, "").trim().charAt(0).toUpperCase() || "F",
    familyMeta: `${children.length || household.childrenCount || 0} ${children.length === 1 ? "Child" : "Children"} • ${method}`,
    accountName: account.name,
    accountInitials: account.initials,
    timeLabel: text(household.topbarTimeLabel, new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date())),
    nav: [
      { id: "dashboard", href: "/myagapay/learn", label: "Dashboard", icon: "✥" },
      { id: "planner", href: "/myagapay/learn/planner", label: "Planner", icon: "▣" },
      { id: "formation", href: "/myagapay/learn/formation", label: "Formation", icon: "⌂" },
      { id: "books", href: "/myagapay/learn/books", label: "Books", icon: "☰" },
      { id: "print-center", href: "/myagapay/learn/print", label: "Print", icon: "▤" },
      { id: "co-op", href: "/myagapay/learn/co-op", label: "Co-op", icon: "◎", comingSoon: true },
      { id: "community", href: "/myagapay/learn/community", label: "Community", icon: "♡" },
      { id: "onboarding", href: "/myagapay/learn/setup", label: "Set Up", icon: "⚙" }
    ]
  };
}

function page(id, title, subtitle = "", ornament = true) {
  return { id, title, subtitle, ornament };
}

function simpleList(items, mapper) {
  return safeArray(items).map(mapper).filter(Boolean);
}

export function toDashboardViewModel(rawPayload, context = {}) {
  const dashboard = rawPayload?.dashboard || {};
  const today = dashboard.today || {};
  const liturgicalDay = today.liturgicalDay || {};
  const summary = dashboard.weeklySummary || {};
  const shell = shellFromPayload("dashboard", rawPayload);
  const saintNames = safeArray(liturgicalDay.saints)
    .map((saint) => text(typeof saint === "string" ? saint : saint.name || saint.title, ""))
    .filter(Boolean);
  const titleSaintName = saintLikeTitle(liturgicalDay.feastTitle || liturgicalDay.summaryTitle || "");
  const combinedSaintNames = [...(titleSaintName ? [titleSaintName] : []), ...saintNames]
    .filter((name, index, names) => names.findIndex((candidate) => saintKey(candidate) === saintKey(name)) === index);
  const orderedSaintNames = orderSaintNames(combinedSaintNames);
  const saintStories = orderSaintStories(safeArray(liturgicalDay.saintStories).map((saint) => ({
    name: text(saint.name || saint.title, ""),
    title: text(saint.title || saint.name, ""),
    storyText: text(saint.storyText || saint.story || saint.description, ""),
    reposeCentury: text(saint.reposeCentury, ""),
    feastRank: text(saint.feastRank, ""),
    iconUrl: text(saint.iconUrl, "")
  })).filter((saint) => saint.name || saint.storyText), orderedSaintNames);

  return {
    shell,
    page: {
      id: "dashboard",
      title: "Today",
      subtitle: `${text(today.dateLabel, context.todayLabel || "")}  •  ${text(today.weekdayLabel, "")}`,
      ornament: false
    },
    todayInChurch: {
      kicker: "TODAY IN THE CHURCH",
      title: text(liturgicalDay.feastTitle, "Today in the Church"),
      liturgicalDateLabel: text(liturgicalDay.oldStyleDateLabel || liturgicalDay.liturgicalDateLabel, "Set calendar in Setup"),
      annoMundiLabel: text(liturgicalDay.annoMundiLabel || annoMundiLabel(today.civilDate), "").replace(/^AM\s+/i, "Anno Mundi "),
      toneLabel: text(liturgicalDay.tone, "Tone unavailable"),
      fastingRule: text(liturgicalDay.fastingRule, "Set fasting source in Setup"),
      fastingNote: text(liturgicalDay.fastingNote || liturgicalDay.seasonLabel, ""),
      epistleRef: text(liturgicalDay.epistleRef, "Add epistle reading"),
      gospelRef: text(liturgicalDay.gospelRef, "Add gospel reading"),
      troparionLabel: liturgicalDay.troparionTone ? `TROPARION · ${liturgicalDay.troparionTone}` : "TROPARION",
      troparionText: text(liturgicalDay.troparionText, "No troparion text loaded yet."),
      kontakionLabel: liturgicalDay.kontakionTone ? `KONTAKION · ${liturgicalDay.kontakionTone}` : "KONTAKION",
      kontakionText: text(liturgicalDay.kontakionText, "No kontakion text loaded yet."),
      iconUrl: text(liturgicalDay.iconUrl || liturgicalDay.ponomarIconUrl || liturgicalDay.feastIconUrl, ""),
      civilDate: text(today.civilDate, ""),
      calendarType: text(dashboard.calendarToggle?.selected || dashboard.preferences?.calendarType || liturgicalDay.calendarType, ""),
      saintNames: orderedSaintNames,
      saintStories
    },
    churchRhythms: safeArray(today.churchRhythms).map((item) => ({
      id: text(item.id, ""),
      label: text(item.title, "Rhythm"),
      sub: text(item.note || item.subtitle, ""),
      complete: item.status === "completed"
    })),
    householdStream: safeArray(today.householdStreamCards).map((item) => ({
      id: text(item.id, ""),
      title: text(item.title, "Household block"),
      sub: text(item.subtitle, ""),
      group: text(item.groupLabel, "Everyone Together"),
      href: text(item.href, "/myagapay/learn/formation"),
      time: item.minutesPlanned ? `${item.minutesPlanned}m` : "",
      complete: item.status === "completed",
      icon: item.icon || "☩"
    })),
    childColumns: safeArray(today.childColumns).map((column, index) => ({
      tag: text(column.child?.formLabel || column.child?.gradeLabel, `CHILD ${index + 1}`).toUpperCase(),
      name: childName(column.child, index),
      age: text(column.child?.ageYears, ""),
      initial: childInitial(column.child, index),
      color: ACCENTS[index % ACCENTS.length],
      tasks: safeArray(column.blocks).map((block) => ({
        id: text(block.id, ""),
        title: text(block.title, "Lesson"),
        sub: text(block.subtitle, ""),
        time: block.minutesPlanned ? `${block.minutesPlanned}m` : "",
        complete: block.status === "completed"
      }))
    })),
    thisWeek: [
      {
        icon: "☩",
        color: ACCENTS[0],
        big: `${summary.lessonsCompleted || 0} / ${summary.lessonsPlanned || 0}`,
        label: "Lessons Completed",
        sub: `${summary.lessonsCompletionPercent || 0}%`
      },
      {
        icon: "✒",
        color: ACCENTS[1],
        big: text(summary.narrationsLogged, "0"),
        label: "Narrations Logged",
        sub: "This Week"
      },
      {
        icon: "⌂",
        color: ACCENTS[2],
        big: text(summary.feastDaysAhead, "0"),
        label: "Feast Days Ahead",
        sub: text(summary.nextFeastLabel, "Set calendar in Setup")
      },
      {
        icon: "☰",
        color: ACCENTS[3],
        big: `${percent(summary.readAloudProgressPercent)}%`,
        label: "Read-Aloud Progress",
        sub: text(summary.readAloudTitle, "Add a read-aloud in Setup")
      }
    ],
    integrations: {
      graceMode: dashboard.activeIndicators?.graceMode || null,
      calendarToggle: dashboard.calendarToggle || null,
      thisDayInHistory: dashboard.thisDayInHistory || null,
      googleCalendarSync: dashboard.googleCalendarSync || null
    },
    graceMode: {
      active: Boolean(dashboard.preferences?.graceModeActive),
      mode: text(dashboard.preferences?.graceModeDefault, "light")
    },
    termProgress: {
      label: text(dashboard.termProgress?.label || dashboard.term?.label, "Current Term"),
      currentWeek: Number(dashboard.termProgress?.currentWeek || 0),
      totalWeeks: Number(dashboard.termProgress?.totalWeeks || 0),
      percent: percent(dashboard.termProgress?.percent),
      dateRange: text(dashboard.termProgress?.dateRange, "")
    }
  };
}

export function toPlannerViewModel(rawPayload) {
  const planner = rawPayload?.planner || {};
  const week = planner.week || {};
  const shell = shellFromPayload("planner", rawPayload);
  const query = new URLSearchParams(window.location.search);
  const activeView = query.get("view") || planner.activeView || localStorage.getItem("agapay.learn.plannerView") || "week";
  const monthKey = query.get("month") || planner.month?.key || new Date().toISOString().slice(0, 7);
  const termOptions = safeArray(planner.termSetup?.termOptions);
  const requestedTermId = query.get("termId") || planner.term?.id || planner.termSetup?.activeTermId || "";
  const requestedTermIndex = termOptions.findIndex((term) => term.id === requestedTermId);
  const numericTermIndex = Math.max(0, Math.min(termOptions.length - 1, Number(query.get("term") || localStorage.getItem("agapay.learn.plannerTerm") || 1) - 1));
  const activeTermIndex = requestedTermIndex >= 0 ? requestedTermIndex : numericTermIndex;
  const activeTermId = termOptions[activeTermIndex]?.id || requestedTermId;
  const activeTerm = activeTermIndex + 1;
  const days = safeArray(week.liturgicalDays).map((day, index) => {
    const parts = dateParts(day.civilDate || safeArray(week.dates)[index]);
    const familyDay = safeArray(week.familyDays)[index] || {};
    return {
      weekday: text(day.weekdayLabel || parts.weekday, ""),
      weekdayLong: text(day.weekdayLong || parts.weekdayLong, ""),
      date: text(day.civilDate || safeArray(week.dates)[index], ""),
      shortDate: parts.short,
      dayNumber: parts.dayNumber,
      isSunday: Boolean(parts.isSunday),
      isFastDay: Boolean(day.isFastDay),
      feast: text(day.feastTitle, ""),
      feastRank: text(day.feastRank, ""),
      fasting: text(day.fastingRule, ""),
      fastingType: text(day.fastingType || familyDay.fastingType, ""),
      tone: text(day.tone || day.troparionTone, ""),
      epistle: text(day.epistleRef, ""),
      gospel: text(day.gospelRef, ""),
      nameDays: safeArray(familyDay.nameDays),
      events: safeArray(familyDay.events),
      meal: familyDay.meal || null,
      fastingPreference: text(familyDay.fastingPreference, "guidance")
    };
  });
  const selectedDate = query.get("date") || days.find((day) => !day.isSunday)?.date || days[0]?.date || "";
  const selectedDayIndex = Math.max(0, days.findIndex((day) => day.date === selectedDate));
  const selectedDay = days[selectedDayIndex] || days[0] || {};
  const childTrackSummary = safeArray(planner.termSetup?.childTrackSummary);
  const childTrackById = new Map(childTrackSummary.map((track) => [track.childId, safeArray(track.tracks)]));
  const rawChildRows = safeArray(week.childRows);

  return {
    shell,
    page: {
      id: "planner",
      title: "Family Planner",
      subtitle: activeView === "week" || activeView === "day" ? `${text(week.label, "This Week")}  •  ${text(week.seasonLabel, "")}` : activeView === "month" ? text(planner.month?.label, "Month Calendar") : "Plan lessons, meals, appointments, chores, and the household rhythm in one place.",
      ornament: true
    },
    activeView,
    plannerTabs: ["day", "week", "month", "term", "year"].map((view) => ({
      id: view,
      label: view.charAt(0).toUpperCase() + view.slice(1),
      active: activeView === view,
      href: `/myagapay/learn/planner?view=${view}${view === "month" ? `&month=${encodeURIComponent(monthKey)}` : ""}${view !== "year" ? `&term=${activeTerm}&termId=${encodeURIComponent(activeTermId)}` : ""}`
    })),
    termTabs: (termOptions.length ? termOptions : [1, 2, 3, 4].map((term) => ({ id: `term_${term}`, label: term === 4 ? "Term 4 / Summer" : `Term ${term}` }))).map((term, index) => ({
      id: term.id || index + 1,
      label: text(term.label, `Term ${index + 1}`),
      active: index === activeTermIndex,
      href: `/myagapay/learn/planner?view=${encodeURIComponent(activeView)}&term=${index + 1}&termId=${encodeURIComponent(term.id || "")}${activeView === "month" ? `&month=${encodeURIComponent(monthKey)}` : ""}`
    })),
    week: {
      label: text(week.label, "This Week"),
      seasonLabel: text(week.seasonLabel, ""),
      days,
      householdRows: safeArray(week.householdRows).map((row) => ({
        title: text(row.title, "Household block"),
        sub: text(row.subtitle || row.detail, ""),
        minutes: safeArray(row.minutes),
        statuses: safeArray(row.statuses),
        graceModeApplied: Boolean(row.graceModeApplied)
      })),
      childRows: rawChildRows.map((row, index) => ({
        childName: childName(row.child, index),
        childId: text(row.childId || row.child?.id, ""),
        initial: childInitial(row.child, index),
        color: text(row.color || row.child?.color, ACCENTS[index % ACCENTS.length]),
        blocks: safeArray(row.blocks || row.assignments).map((block) => ({
          title: text(block.title, "Lesson"),
          sub: text(block.subtitle, ""),
          minutes: block.minutesPlanned || block.minutes || ""
        })),
        title: text(row.title, "Lesson"),
        sub: text(row.detail || row.subtitle, ""),
        minutes: safeArray(row.minutes),
        statuses: safeArray(row.statuses),
        graceModeApplied: Boolean(row.graceModeApplied)
      })),
      formRows: groupRowsByForm(rawChildRows)
    },
    day: {
      selected: selectedDay,
      selectedIndex: selectedDayIndex,
      householdBlocks: safeArray(week.householdRows).map((row) => ({
        title: text(row.title, "Household block"),
        sub: text(row.detail || row.subtitle, ""),
        minutes: selectedDay?.isSunday ? 0 : Number(safeArray(row.minutes)[selectedDayIndex] || 0),
        status: selectedDay?.isSunday ? "rest" : text(safeArray(row.statuses)[selectedDayIndex], ""),
        graceModeApplied: Boolean(row.graceModeApplied)
      })).filter((row) => row.minutes > 0 || row.status === "rest"),
      childBlocks: rawChildRows.map((row, index) => ({
        childName: childName(row.child, index),
        initial: childInitial(row.child, index),
        color: text(row.color || row.child?.color, ACCENTS[index % ACCENTS.length]),
        title: text(row.title, "Lesson"),
        sub: text(row.detail || row.subtitle, ""),
        minutes: selectedDay?.isSunday ? 0 : Number(safeArray(row.minutes)[selectedDayIndex] || 0),
        status: selectedDay?.isSunday ? "rest" : text(safeArray(row.statuses)[selectedDayIndex], ""),
        graceModeApplied: Boolean(row.graceModeApplied)
      })).filter((row) => row.minutes > 0 || row.status === "rest"),
      formBlocks: selectedDay?.isSunday ? [] : groupRowsByForm(rawChildRows, selectedDayIndex)
    },
    month: {
      key: monthKey,
      label: text(planner.month?.label, "Month Calendar"),
      printableTitle: text(planner.month?.printableTitle, "Household Month Calendar"),
      weekdays: safeArray(planner.month?.weekdays).length ? safeArray(planner.month?.weekdays) : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
      fastDays: Number(planner.month?.fastDays || 0),
      feastDays: Number(planner.month?.feastDays || 0),
      days: safeArray(planner.month?.days).map((day) => ({
        date: text(day.civilDate, ""),
        dayNumber: text(day.dayNumber, ""),
        weekday: text(day.weekdayLabel, ""),
        inMonth: Boolean(day.inMonth),
        isToday: Boolean(day.isToday),
        isSunday: Boolean(day.isSunday),
        isFastDay: Boolean(day.isFastDay),
        feast: text(day.feastTitle, ""),
        feastRank: text(day.feastRank, ""),
        fasting: text(day.fastingRule, ""),
        fastingType: text(day.fastingType, ""),
        oldStyleDateLabel: text(day.oldStyleDateLabel, ""),
        nameDays: safeArray(day.nameDays),
        events: safeArray(day.events),
        meal: day.meal || null,
        fastingPreference: text(day.fastingPreference, "guidance"),
        householdPlan: safeArray(day.householdPlan).map((item) => ({
          title: text(item.title, ""),
          minutes: Number(item.minutes || 0)
        })),
        formPlan: safeArray(day.formPlan).map((item) => ({
          title: text(item.title, ""),
          formLabel: text(item.formLabel, ""),
          minutes: Number(item.minutes || 0)
        }))
      }))
    },
    familyPlanning: {
      fastingPreference: text(planner.familyPlanning?.fastingPreference, "guidance"),
      recipes: safeArray(planner.familyPlanning?.recipes || week.recipes),
      groceryItems: safeArray(planner.familyPlanning?.groceryItems || week.groceryItems),
      events: safeArray(planner.familyPlanning?.events),
      meals: safeArray(planner.familyPlanning?.meals),
      chores: safeArray(planner.familyPlanning?.chores),
      weekStart: text(planner.familyPlanning?.weekStart, ""),
      household: {
        motherName: text(planner.household?.motherName, ""),
        motherNameDay: text(planner.household?.motherNameDay, ""),
        fatherName: text(planner.household?.fatherName, ""),
        fatherNameDay: text(planner.household?.fatherNameDay, ""),
        parishPatronalFeastName: text(planner.household?.parishPatronalFeastName, ""),
        parishPatronalFeastDate: text(planner.household?.parishPatronalFeastDate, "")
      },
      children: safeArray(planner.children).map((child, index) => ({
        id: text(child.id, ""),
        name: childName(child, index),
        nameDay: text(child.nameDay, ""),
        color: text(child.color, ACCENTS[index % ACCENTS.length]),
        initial: childInitial(child, index),
        formLabel: text(child.formLabel || child.form || "", ""),
        gradeLabel: text(child.gradeLabel || child.grade || "", "")
      }))
    },
    term: {
      activeTerm,
      activeTermId,
      label: text(planner.term?.label, `Term ${activeTerm}`),
      dateRange: [text(planner.term?.startDate, ""), text(planner.term?.endDate, "")].filter(Boolean).join(" - "),
      paceMode: text(planner.term?.paceMode, ""),
      settings: planner.curriculum?.mappingSummary || [],
      cycleTitle: text(planner.cycle?.year?.title, "Household Cycle"),
      cycleSummary: text(planner.cycle?.framework?.summary, ""),
      setupCards: simpleList(planner.termSetup?.setupCards, (card) => ({
        title: text(card.title, "Setup"),
        value: text(card.value, ""),
        detail: text(card.detail, "")
      })).map((card, index) => ({ ...card, color: ACCENTS[index % ACCENTS.length] })),
      pacingRows: simpleList(planner.termSetup?.pacingRows, (row, rowIndex) => ({
        label: text(row.label, "Pacing"),
        subtitle: text(row.subtitle, ""),
        color: text(row.color, ACCENTS[rowIndex % ACCENTS.length]),
        segments: simpleList(row.segments, (segment, segmentIndex) => ({
          title: text(segment.title, ""),
          start: Number(segment.start || 1),
          span: Number(segment.span || 1),
          color: text(segment.color, ACCENTS[(rowIndex + segmentIndex) % ACCENTS.length])
        }))
      })),
      graceReserve: simpleList(planner.termSetup?.graceReserve, (item, index) => ({
        title: text(item.title, "Reserved work"),
        note: text(item.note, ""),
        color: text(item.color, ACCENTS[index % ACCENTS.length])
      })),
      summary: planner.termSetup?.termSummary || {},
      householdSummary: safeArray(planner.termSetup?.householdSummary).map((item) => text(item)),
      childTracks: safeArray(planner.children).map((child, index) => ({
        name: childName(child, index),
        age: text(child.ageYears, ""),
        initial: childInitial(child, index),
        color: text(child.color, ACCENTS[index % ACCENTS.length]),
        tracks: safeArray(childTrackById.get(child.id)).map((item) => text(item))
      })),
      graceMode: planner.graceMode || null
    },
    year: {
      schoolYear: text(planner.schoolYear?.label, "School Year"),
      dateRange: [text(planner.schoolYear?.startDate, ""), text(planner.schoolYear?.endDate, "")].filter(Boolean).join(" - "),
      cycleTitle: text(planner.cycle?.framework?.title, "Cycle Planning"),
      cycleYear: text(planner.cycle?.year?.title, ""),
      frameworks: simpleList(planner.cycle?.visibleFrameworks, (framework) => ({
        type: text(framework.type, ""),
        label: text(framework.label, "")
      })),
      topics: simpleList(planner.cycle?.topics, (topic) => ({
        type: text(topic.subjectType, ""),
        title: text(topic.title, ""),
        season: text(topic.seasonLabel, "")
      })),
      terms: (termOptions.length ? termOptions : [{ label: "Term 1" }, { label: "Term 2" }, { label: "Term 3" }]).map((term, index) => ({
        label: text(term.label, `Term ${index + 1}`),
        active: index === activeTermIndex
      })),
      upcomingFeasts: simpleList(planner.upcomingFeasts, (feast) => ({
        date: text(feast.civilDate, ""),
        title: text(feast.title, ""),
        fasting: text(feast.fastingRule, "")
      })),
      curriculumPackages: simpleList(planner.curriculum?.packages, (pkg) => ({
        title: text(pkg.title, "Curriculum Package"),
        vendor: text(pkg.vendor, ""),
        summary: text(pkg.summary, "")
      }))
    }
  };
}

export function toFormationViewModel(rawPayload) {
  const formation = rawPayload?.formation || {};
  const today = formation.today || {};
  const liturgicalDay = today.liturgicalDay || {};
  const catechesis = formation.catechesisCycle || {};
  const enrichmentBlocks = simpleList(formation.enrichmentBlocks, (block) => ({
    title: text(block.title, "Enrichment"),
    type: text(block.blockType, ""),
    minutes: block.minutesPlanned ? `${block.minutesPlanned}m` : "",
    frequency: text(block.weeklyFrequency || block.cadenceLabel, "")
  }));
  const enrichmentByType = (pattern) => enrichmentBlocks.filter((block) => pattern.test(block.type));
  const mappedMemory = enrichmentByType(/recitation|memory/i);
  const mappedHymns = enrichmentByType(/hymn/i);
  const mappedFeasts = enrichmentByType(/saints?|feasts?/i);
  const coreEnrichment = enrichmentBlocks.filter((block) => !/(recitation|memory|hymn|saints?|feasts?)/i.test(block.type));
  return {
    shell: shellFromPayload("formation", rawPayload),
    page: page("formation", "Formation", "Church-first learning for hearts and minds."),
    today: {
      title: text(liturgicalDay.feastTitle || today.title, "Today in the Church"),
      date: text(today.dateLabel, ""),
      fasting: text(liturgicalDay.fastingRule, ""),
      readings: [text(liturgicalDay.epistleRef, ""), text(liturgicalDay.gospelRef, "")].filter(Boolean).join("; "),
      readingTasks: [
        { id: "epistle", label: "Epistle", ref: text(liturgicalDay.epistleRef, "") },
        { id: "gospel", label: "Gospel", ref: text(liturgicalDay.gospelRef, "") }
      ].filter((item) => item.ref),
      saint: text(safeArray(liturgicalDay.saints)[0], ""),
      troparion: text(liturgicalDay.troparionText, "")
    },
    rhythms: simpleList(formation.churchRhythms || today.churchRhythms, (item) => ({
      title: text(item.title, "Rhythm"),
      note: text(item.note, ""),
      complete: item.status === "completed"
    })),
    catechesis: {
      title: text(catechesis.title, "Catechesis"),
      currentLesson: text(catechesis.currentLesson, "Add catechesis in Setup"),
      progress: catechesis.lessonNumber && catechesis.totalLessons ? `Lesson ${catechesis.lessonNumber} of ${catechesis.totalLessons}` : "",
      topic: text(catechesis.doctrinalTopic, "")
    },
    recitation: [
      ...simpleList(formation.recitationTracks, (track) => ({
      title: text(track.title, "Memory Work"),
      status: text(track.status, ""),
      progress: percent(track.progressPercent)
      })),
      ...mappedMemory.map((item) => ({
        title: item.title,
        status: item.frequency || item.type,
        progress: 0
      }))
    ],
    hymns: [
      ...simpleList(formation.hymnStudies, (hymn) => ({
      title: text(hymn.title, "Hymn"),
      tone: text(hymn.tone, ""),
      source: text(hymn.source, "")
      })),
      ...mappedHymns.map((item) => ({
        title: item.title,
        tone: item.frequency || item.type,
        source: item.minutes
      }))
    ],
    enrichment: coreEnrichment.map((block) => ({
      title: block.title,
      type: block.type,
      minutes: block.minutes
    })),
    feasts: [
      ...mappedFeasts.map((item) => ({
        title: item.title,
        date: item.frequency || "Household focus",
        fasting: item.minutes
      })),
      ...simpleList(formation.upcomingFeasts, (feast) => ({
      title: text(feast.title, "Feast"),
      date: text(feast.civilDate, ""),
      fasting: text(feast.fastingRule, "")
      }))
    ].slice(0, 2),
    nature: simpleList(formation.natureJournalEntries, (entry) => ({
      title: text(entry.title, "Nature Journal"),
      location: text(entry.location, ""),
      notes: text(entry.notes, "")
    }))
  };
}

export function toBooksViewModel(rawPayload) {
  const books = rawPayload?.books || {};
  return {
    shell: shellFromPayload("books", rawPayload),
    page: page("books", "Books", "Living books for the mind, the heart, and the soul."),
    readAlouds: simpleList(books.currentReadAlouds, (book) => ({
      title: text(book.title, "Untitled Book"),
      author: text(book.author, ""),
      assignment: text(book.assignmentLabel || book.assignedTerm || book.assignment || book.audienceLabel, ""),
      progress: percent(book.progressPercent),
      stream: text(book.streamLabel || book.audienceLabel, ""),
      list: text(book.listLabel, "")
    })),
    library: simpleList(books.libraryBooks, (book) => ({
      title: text(book.title, "Untitled Book"),
      author: text(book.author, ""),
      category: text(book.category, ""),
      ages: text(book.ageRange || book.ages, ""),
      orthodox: Boolean(book.orthodox),
      assignment: text(book.assignmentLabel || book.assignment || book.audienceLabel || book.formLabel, ""),
      progress: percent(book.progressPercent)
    })),
    suggestions: simpleList(books.orthodoxSuggestions, (item, index) => ({
      title: text(item.title, "Suggestion"),
      subtitle: text(item.subtitle, ""),
      color: ACCENTS[index % ACCENTS.length]
    })),
    pacing: {
      title: text(books.bookPacing?.title, "Select a book to pace"),
      subtitle: text(books.bookPacing?.subtitle, ""),
      chaptersPerWeek: text(books.bookPacing?.chaptersPerWeek, ""),
      weeks: simpleList(books.bookPacing?.weeks, (week) => ({
        week: text(week.week, ""),
        chapters: text(week.chapters, ""),
        pages: text(week.pages, "")
      }))
    },
    copywork: simpleList(books.copyworkSources, (source) => ({
      title: text(source.title, "Copywork Source"),
      detail: text(source.detail, "")
    }))
  };
}

export function toReportsViewModel(rawPayload) {
  const reports = rawPayload?.reports || {};
  const summary = reports.weeklySummary || {};
  const shell = shellFromPayload("reports", rawPayload);
  return {
    shell,
    page: page("reports", "Reports & Progress", "Review progress, track growth, and generate records for your homeschool."),
    stats: [
      { label: "Lessons Completed", value: `${summary.lessonsCompleted || 0} / ${summary.lessonsPlanned || 0}`, sub: `${summary.lessonsCompletionPercent || 0}%`, color: ACCENTS[0] },
      { label: "Narrations Logged", value: text(summary.narrationsLogged, "0"), sub: "This Week", color: ACCENTS[1] },
      { label: "Read-Aloud Progress", value: `${percent(summary.readAloudProgressPercent)}%`, sub: text(summary.readAloudTitle, ""), color: ACCENTS[3] },
      { label: "Feast Days Ahead", value: text(summary.feastDaysAhead, "0"), sub: text(summary.nextFeastLabel, ""), color: ACCENTS[2] }
    ],
    children: simpleList(reports.children, (child, index) => {
      const card = safeArray(reports.reportCards).find((item) => item.childId === child.id) || {};
      const records = safeArray(card.records);
      const completed = records.reduce((total, record) => total + (Number(record.completed) || 0), 0);
      const planned = records.reduce((total, record) => total + (Number(record.total) || 0), 0);
      const completionPercent = planned ? Math.round((completed / planned) * 100) : percent(card.readAloudProgressPercent || summary.lessonsCompletionPercent);
      return {
        id: text(child.id, ""),
        name: childName(child, index),
        grade: text(child.gradeLabel, ""),
        age: text(child.ageYears, ""),
        initial: childInitial(child, index),
        color: ACCENTS[index % ACCENTS.length],
        status: text(card.status, "in progress"),
        summary: text(card.summary, "No report notes yet."),
        lessons: {
          done: completed || Number(summary.lessonsCompleted || 0),
          total: planned || Number(summary.lessonsPlanned || 0),
          percent: completionPercent
        },
        readAloud: {
          percent: percent(card.readAloudProgressPercent || summary.readAloudProgressPercent)
        }
      };
    }),
    subjectProgress: simpleList(reports.subjectProgress, (row, index) => ({
      id: text(row.id, `progress-${index}`),
      childId: text(row.childId, ""),
      childName: text(row.childName, "Household"),
      formLabel: text(row.formLabel, "Household"),
      kind: text(row.kind, "subject"),
      subjectTitle: text(row.subjectTitle, "Subject"),
      subjectType: text(row.subjectType, ""),
      source: text(row.source, ""),
      progressionType: text(row.progressionType, "lessons"),
      start: text(row.start, ""),
      current: text(row.current, ""),
      end: text(row.end, ""),
      completed: Number(row.completed || 0),
      total: Number(row.total || 0),
      percent: percent(row.percent),
      status: text(row.status, "planned"),
      color: ACCENTS[index % ACCENTS.length]
    })),
    narrations: simpleList(reports.narrationLogs, (log) => ({
      date: text(log.loggedAt, "").slice(0, 10),
      child: childName(log.child, 0),
      source: text(log.sourceTitle, ""),
      type: text(log.narrationType, ""),
      note: text(log.note, "")
    })),
    exports: simpleList(reports.reportExports, (item) => ({
      title: text(item.exportType, "Export").replaceAll("-", " "),
      format: text(item.format, "").toUpperCase(),
      status: text(item.status, "")
    })),
    pdf: {
      title: "Year-End Report",
      familyName: shell.familyName,
      schoolYear: text(reports.schoolYear?.label, ""),
      summary: [
        `Lessons completed: ${summary.lessonsCompleted || 0} / ${summary.lessonsPlanned || 0}`,
        `Narrations logged: ${summary.narrationsLogged || 0}`,
        `Read-aloud progress: ${percent(summary.readAloudProgressPercent)}%`,
        `Feast days ahead: ${summary.feastDaysAhead || 0}`,
        `Tracked subject rows: ${safeArray(reports.subjectProgress).length}`
      ]
    }
  };
}

export function toCommunityViewModel(rawPayload) {
  const community = rawPayload?.community || {};
  return {
    shell: shellFromPayload("community", rawPayload),
    page: page("community", "Community Resources", "Trusted tools and encouragement for Orthodox homeschool families."),
    comingSoon: Boolean(community.comingSoon),
    title: text(community.title, "Community is coming soon"),
    subtitle: text(community.subtitle, "A curated resource exchange is planned after the core Learn workflow is settled."),
    detail: text(community.detail, ""),
    facebookGroupUrl: text(community.facebookGroupUrl, ""),
    resources: simpleList(community.communityResources, (resource) => ({
      id: text(resource.id, ""),
      source: text(resource.source, "curated"),
      title: text(resource.title, "Resource"),
      category: text(resource.category, ""),
      resourceType: text(resource.resourceType, "Resource"),
      mediaType: text(resource.mediaType, "Mixed Media"),
      ageRange: text(resource.ageRange, "Family"),
      subtitle: text(resource.subtitle, ""),
      desc: text(resource.description || resource.subtitle, ""),
      url: text(resource.url, "#"),
      sharedBy: text(resource.sharedBy, ""),
      poster: text(resource.sharedBy, "AGAPAY Community"),
      posterInitial: text(resource.sharedBy, "A").charAt(0).toUpperCase(),
      tags: safeArray(resource.tags).length ? safeArray(resource.tags).map((tag) => text(tag)) : [text(resource.category, "Resource"), "Orthodox", "Homeschool"].filter(Boolean),
      votes: Number(resource.votes || 0),
      pinned: Boolean(resource.pinned || resource.vetted),
      vetted: Boolean(resource.vetted),
      flagCount: safeArray(resource.flags).length
    })).map((resource, index) => {
      const style = resourceTypeStyle(resource.resourceType);
      return {
        ...resource,
        color: style.color,
        icon: style.icon,
        posterColor: ACCENTS[(index + 1) % ACCENTS.length]
      };
    }),
    categories: ["All", ...new Set(simpleList(community.communityResources, (resource) => text(resource.category, "")).filter(Boolean))],
    resourceTypes: ["All", ...new Set(simpleList(community.communityResources, (resource) => text(resource.resourceType, "")).filter(Boolean))],
    mediaTypes: ["All", ...new Set(simpleList(community.communityResources, (resource) => text(resource.mediaType, "")).filter(Boolean))],
    calendar: {
      connected: Boolean(community.googleCalendarSync?.connected),
      account: text(community.googleCalendarSync?.accountLabel, "No account connected"),
      calendar: text(community.googleCalendarSync?.calendarLabel, ""),
      scope: text(community.googleCalendarSync?.syncScopeLabel, ""),
      next: text(community.googleCalendarSync?.nextSyncLabel, "")
    },
    history: {
      label: text(community.thisDayInHistory?.label, "This Day in History"),
      title: text(community.thisDayInHistory?.title, ""),
      year: text(community.thisDayInHistory?.year, ""),
      summary: text(community.thisDayInHistory?.summary, ""),
      source: text(community.thisDayInHistory?.sourceLabel, "")
    },
    guidance: safeArray(community.sharingGuidance).map((item) => text(item))
  };
}

export function toCoOpViewModel(rawPayload) {
  const coOpPayload = rawPayload?.coOp || {};
  return {
    shell: shellFromPayload("co-op", { "co-op": coOpPayload }),
    page: page("co-op", "Co-op", "Coming Soon"),
    enabled: false,
    hero: {
      name: "Co-op tools are coming soon",
      city: "",
      affiliation: "Future Learn add-on",
      cycle: "Deferred for launch",
      memberFamilies: 0,
      children: 0,
      meeting: "Not available yet"
    },
    schedule: [],
    announcements: [],
    readAlouds: [],
    resources: [],
    members: []
  };
}

export function toSetupViewModel(rawPayload, clientState = {}) {
  const setup = rawPayload?.onboarding || {};
  const setupCompleted = Boolean(setup.setupCompleted || setup.setupSnapshot);
  const snapshot = setup.setupSnapshot || {};
  const onboarding = setup.onboarding || {};
  const preferences = setup.preferences || snapshot.preferences || onboarding.preferences || {};
  const household = setupCompleted ? setup.household || snapshot.household || {} : {};
  const schoolYear = setupCompleted ? setup.schoolYear || snapshot.schoolYear || {} : {};
  const term = setupCompleted ? setup.term || snapshot.term || {} : {};
  const termsSource = safeArray(snapshot.terms).length ? snapshot.terms : safeArray(setup.terms);
  const baseSetupTerms = (termsSource.length ? termsSource : [
    term,
    { id: "term_2", label: "Term 2", startDate: "", endDate: "", paceMode: preferences.paceMode || term.paceMode || "steady" },
    { id: "term_3", label: "Term 3", startDate: "", endDate: "", paceMode: preferences.paceMode || term.paceMode || "steady" },
    { id: "term_4", label: "Term 4 / Summer", startDate: "", endDate: "", paceMode: preferences.paceMode || term.paceMode || "steady" }
  ]);
  while (baseSetupTerms.length < 4) {
    baseSetupTerms.push({
      id: `term_${baseSetupTerms.length + 1}`,
      label: baseSetupTerms.length === 3 ? "Term 4 / Summer" : `Term ${baseSetupTerms.length + 1}`,
      startDate: "",
      endDate: "",
      paceMode: preferences.paceMode || term.paceMode || "steady"
    });
  }
  const setupTerms = baseSetupTerms.map((entry, index) => ({
    id: text(entry.id, `term_${index + 1}`),
    label: text(entry.label, `Term ${index + 1}`),
    startDate: text(entry.startDate, ""),
    endDate: text(entry.endDate, ""),
    paceMode: text(entry.paceMode, preferences.paceMode || term.paceMode || "steady")
  }));
  const currentTermId = text(schoolYear.currentTermId || term.id || setupTerms[0]?.id, "term_1");
  const householdMethod = text(household.primaryMethod, "Charlotte Mason");
  const childrenSource = setupCompleted ? (safeArray(setup.children).length ? setup.children : snapshot.children) : [];
  const groupingMode = text(preferences.groupingMode, childrenSource.some((child) => text(child.formLabel, "")) || householdMethod === "Charlotte Mason" ? "forms" : "grades") === "grades" ? "grades" : "forms";
  const streamsSource = setupCompleted ? (safeArray(setup.starterStreams).length ? setup.starterStreams : safeArray(setup.householdStreams).length ? setup.householdStreams : snapshot.streams) : [];
  const subjectsSource = setupCompleted ? (safeArray(snapshot.subjects).length ? snapshot.subjects : setup.subjects) : [];
  const booksSource = setupCompleted ? (safeArray(snapshot.books).length ? snapshot.books : setup.books) : [];
  const formation = setupCompleted ? setup.formation || snapshot.formation || {} : {};
  const setupTiles = snapshot.setupTiles || setup.setupTiles || {};
  const familyPlanning = snapshot.familyPlanning || setup.familyPlanning || {};
  const formationMaterialsSource = safeArray(snapshot.formationMaterials).length ? snapshot.formationMaterials : setup.formationMaterials;
  const materialDefaults = simpleList(formationMaterialsSource, (material, index) => ({
    id: text(material.id, ""),
    title: text(material.title, "Formation Material"),
    materialType: text(material.materialType || material.resourceType, "Catechesis"),
    source: text(material.source || material.author, ""),
    cadence: text(material.cadenceLabel || material.cadence, ""),
    planningMode: text(material.planningMode, "family"),
    weeklyFrequency: weeklyFrequencyValue(material.weeklyFrequency || material.cadenceLabel || material.cadence, "1x"),
    minutes: text(material.minutes, ""),
    termId: text(material.termId || material.assignedTermId, currentTermId),
    color: text(material.color, ACCENTS[(index + 3) % ACCENTS.length])
  }));
  const defaultFormationMaterials = materialDefaults.length ? materialDefaults : [
    { id: "formation_catechesis", title: "Catechesis", materialType: "Catechesis", source: "", cadence: "Weekly", color: ACCENTS[0] },
    { id: "formation_art", title: "Art Study", materialType: "Art Study", source: "", cadence: "Weekly", color: ACCENTS[2] },
    { id: "formation_poetry", title: "Poetry", materialType: "Poetry", source: "", cadence: "Weekly", color: ACCENTS[3] },
    { id: "formation_music", title: "Music Study", materialType: "Music Study", source: "", cadence: "Weekly", color: ACCENTS[4] }
  ];
  const derivedEnrichment = defaultFormationMaterials
    .filter((material) => material.materialType !== "Catechesis")
    .map((material) => ({
      id: material.id,
    blockType: material.materialType,
    title: material.title,
    cadenceLabel: material.cadence,
    planningMode: material.planningMode || "family",
    weeklyFrequency: weeklyFrequencyValue(material.weeklyFrequency || material.cadence, "1x"),
    minutesPlanned: "",
    color: material.color
    }));
  const setupV2Steps = [
    {
      title: "Household",
      status: household.name && schoolYear.label ? "complete" : "active",
      summary: "Name, parish, method, school year, terms, and calendar."
    },
    {
      title: "Children & Forms",
      status: safeArray(childrenSource).length ? "complete" : "needed",
      summary: "Assign each child to the Form used by Planner and Print."
    },
    {
      title: "Church Rhythm",
      status: safeArray(formation.churchRhythms).length ? "complete" : "needed",
      summary: "Prayer, readings, saints, feasts, hymnody, and fasting rhythm."
    },
    {
      title: "Enrichment",
      status: safeArray(formation.recitationTracks).length || safeArray(formation.enrichmentBlocks).length || defaultFormationMaterials.length ? "complete" : "needed",
      summary: "Memory work, hymnody, saints, feasts, icons, art, poetry, music, and nature."
    },
    {
      title: "Form Subjects",
      status: safeArray(subjectsSource).length ? "complete" : "needed",
      summary: "Language arts, literature, languages, history, geography, math, science, and progress ranges."
    }
  ];
  return {
    setupCompleted,
    shell: shellFromPayload("onboarding", rawPayload),
    page: page("onboarding", "Set Up", "Configure the household, calendar, terms, enrichment, subjects, and co-op."),
    progress: {
      current: onboarding.household?.currentStep || 1,
      total: onboarding.household?.totalSteps || safeArray(onboarding.steps).length || 1,
      next: text(onboarding.household?.nextStep, "")
    },
    household: {
      name: text(household.name, ""),
      parentName: text(household.parentNames?.[0] || household.parentName, ""),
      motherName: text(household.motherName, ""),
      motherNameDay: text(household.motherNameDay, ""),
      fatherName: text(household.fatherName, ""),
      fatherNameDay: text(household.fatherNameDay, ""),
      parish: text(household.parishName, ""),
      method: householdMethod,
      schoolYear: text(schoolYear.label, ""),
      calendarType: text(household.liturgicalCalendarType, "julian"),
      paceMode: text(household.paceMode, "steady")
    },
    children: simpleList(childrenSource, (child, index) => ({
      id: text(child.id, ""),
      name: childName(child, index),
      firstName: text(child.firstName, childName(child, index)),
      grade: text(child.gradeLabel, ""),
      age: text(child.ageYears, ""),
      nameDay: text(child.nameDay, ""),
      form: text(child.formLabel || child.gradeLabel, childFormByAge(child.ageYears)),
      formLabel: text(child.formLabel || child.gradeLabel, childFormByAge(child.ageYears)),
      initial: childInitial(child, index),
      color: text(child.color, ACCENTS[index % ACCENTS.length])
    })),
    schoolYear: {
      id: text(schoolYear.id, ""),
      label: text(schoolYear.label, ""),
      startDate: text(schoolYear.startDate, ""),
      endDate: text(schoolYear.endDate, ""),
      currentTermId
    },
    term: {
      id: text(term.id, ""),
      label: text(term.label, ""),
      startDate: text(term.startDate, ""),
      endDate: text(term.endDate, ""),
      paceMode: text(term.paceMode, preferences.paceMode || "steady")
    },
    terms: setupTerms,
    setupTiles,
    steps: setupV2Steps,
    preferences: {
      calendarType: text(clientState.calendar || preferences.calendarType, "julian"),
      groupingMode,
      evaluationModel: text(preferences.evaluationModel, "narrative-only"),
      graceModeDefault: text(preferences.graceModeDefault, "light"),
      graceModeActive: Boolean(preferences.graceModeActive),
      paceMode: text(preferences.paceMode || term.paceMode, "steady"),
      printPack: text(preferences.printPack, "")
    },
    streams: simpleList(streamsSource, (stream) => ({
      id: text(stream.id, ""),
      title: text(stream.title, "Stream"),
      streamType: text(stream.streamType, ""),
      type: text(stream.streamType, ""),
      cadence: text(stream.cadenceLabel, ""),
      dailyMinutes: stream.dailyMinutes || {
        mon: text(stream.monMinutes, "20"),
        tue: text(stream.tueMinutes, "20"),
        wed: text(stream.wedMinutes, "20"),
        thu: text(stream.thuMinutes, "20"),
        fri: text(stream.friMinutes, "20")
      }
    })),
    subjects: simpleList(subjectsSource, (subject, index) => ({
      id: text(subject.id, ""),
      title: text(subject.title, "Subject"),
      subjectType: text(subject.subjectType || subject.type, ""),
      planningMode: text(subject.planningMode, subject.childId ? "forms" : "forms"),
      scheduledDays: safeArray(subject.scheduledDays),
      weeklyFrequency: weeklyFrequencyValue(subject.weeklyFrequency || subject.cadenceLabel || subject.cadence, "daily"),
      formLabel: text(subject.formLabel, ""),
      gradeLabel: text(subject.gradeLabel, ""),
      resource: text(subject.resource || subject.title, ""),
      resourceType: text(subject.resourceType || subject.sourceType, subject.resource ? "curriculum" : "none"),
      cadence: text(subject.cadenceLabel || subject.cadence, ""),
      minutes: text(subject.minutes, ""),
      childId: text(subject.childId, ""),
      progressionType: text(subject.progressionType, "lessons"),
      startNumber: text(subject.startNumber, ""),
      currentNumber: text(subject.currentNumber || subject.completedThroughNumber, ""),
      endNumber: text(subject.endNumber, ""),
      credits: text(subject.credits, ""),
      finalGradeOverride: text(subject.finalGradeOverride, ""),
      termId: text(subject.termId || subject.assignedTermId, currentTermId),
      gracePriority: text(subject.gracePriority, "keep"),
      graceNote: text(subject.graceNote, "Deferred gracefully to the reserve list."),
      color: text(subject.color, ACCENTS[index % ACCENTS.length])
    })),
    books: simpleList(booksSource, (book, index) => ({
      id: text(book.id, ""),
      title: text(book.title, "Book"),
      author: text(book.author, ""),
      category: text(book.category, "Living Books"),
      planningMode: text(book.planningMode, book.formLabel ? "forms" : "family"),
      weeklyFrequency: weeklyFrequencyValue(book.weeklyFrequency || book.cadenceLabel || book.cadence, "daily"),
      minutes: text(book.minutes, "20"),
      formLabel: text(book.formLabel, ""),
      audienceLabel: text(book.audienceLabel, "Household"),
      startChapter: text(book.startChapter, ""),
      currentChapter: text(book.currentChapter || book.completedThroughChapter, ""),
      endChapter: text(book.endChapter || book.totalChapters, ""),
      termId: text(book.termId || book.assignedTermId, currentTermId),
      graceNote: text(book.graceNote, "Reading moved into the reserve basket."),
      color: text(book.color, ACCENTS[(index + 2) % ACCENTS.length])
    })),
    formationMaterials: defaultFormationMaterials,
    formationSetup: {
      churchRhythms: simpleList(formation.churchRhythms, (rhythm, index) => ({
        id: text(rhythm.id, ""),
        title: text(rhythm.title, ["Morning Prayers", "Scripture Readings", "Saint of the Day", "Troparion Practice"][index] || "Church Rhythm"),
        note: text(rhythm.note, ""),
        cadenceLabel: text(rhythm.cadenceLabel || rhythm.cadence, "Daily"),
        weeklyFrequency: weeklyFrequencyValue(rhythm.weeklyFrequency || rhythm.cadenceLabel || rhythm.cadence, "daily"),
        minutes: text(rhythm.minutes || rhythm.minutesPlanned, "")
      })).length ? simpleList(formation.churchRhythms, (rhythm, index) => ({
        id: text(rhythm.id, ""),
        title: text(rhythm.title, ["Morning Prayers", "Scripture Readings", "Saint of the Day", "Troparion Practice"][index] || "Church Rhythm"),
        note: text(rhythm.note, ""),
        cadenceLabel: text(rhythm.cadenceLabel || rhythm.cadence, "Daily"),
        weeklyFrequency: weeklyFrequencyValue(rhythm.weeklyFrequency || rhythm.cadenceLabel || rhythm.cadence, "daily"),
        minutes: text(rhythm.minutes || rhythm.minutesPlanned, "")
      })) : [
        { id: "rhythm_morning_prayers", title: "Morning Prayers", note: "Family prayer rule", cadenceLabel: "Daily", weeklyFrequency: "daily", minutes: "10" },
        { id: "rhythm_scripture", title: "Scripture Readings", note: "Epistle and Gospel", cadenceLabel: "Daily", weeklyFrequency: "daily", minutes: "10" },
        { id: "rhythm_saint", title: "Saint of the Day", note: "Read and discuss", cadenceLabel: "Daily", weeklyFrequency: "daily", minutes: "10" },
        { id: "rhythm_troparion", title: "Troparion Practice", note: "Practice hymn of the day", cadenceLabel: "Daily", weeklyFrequency: "daily", minutes: "5" }
      ],
      catechesis: {
        title: text(formation.catechesis?.title, defaultFormationMaterials.find((material) => material.materialType === "Catechesis")?.title || "Catechesis"),
        currentLesson: text(formation.catechesis?.currentLesson, ""),
        planningMode: text(formation.catechesis?.planningMode, "family"),
        weeklyFrequency: weeklyFrequencyValue(formation.catechesis?.weeklyFrequency || formation.catechesis?.cadenceLabel || formation.catechesis?.cadence, "2x"),
        minutes: text(formation.catechesis?.minutes, ""),
        lessonNumber: text(formation.catechesis?.lessonNumber, ""),
        totalLessons: text(formation.catechesis?.totalLessons, ""),
        doctrinalTopic: text(formation.catechesis?.doctrinalTopic || formation.catechesis?.topic, ""),
        source: text(formation.catechesis?.source, defaultFormationMaterials.find((material) => material.materialType === "Catechesis")?.source || "")
      },
      recitationTracks: simpleList(formation.recitationTracks, (track) => ({
        id: text(track.id, ""),
        title: text(track.title, "Memory Work"),
        sourceKind: text(track.sourceKind || track.source, ""),
        planningMode: text(track.planningMode, "family"),
        weeklyFrequency: weeklyFrequencyValue(track.weeklyFrequency || track.cadenceLabel || track.cadence, "daily"),
        minutes: text(track.minutes, ""),
        status: text(track.status, "memorizing"),
        progressPercent: text(track.progressPercent || track.progress, "")
      })),
      hymnStudies: simpleList(formation.hymnStudies, (hymn) => ({
        id: text(hymn.id, ""),
        title: text(hymn.title, "Hymn"),
        tone: text(hymn.tone, ""),
        source: text(hymn.source, ""),
        planningMode: text(hymn.planningMode, "family"),
        weeklyFrequency: weeklyFrequencyValue(hymn.weeklyFrequency || hymn.cadenceLabel || hymn.cadence, "1x"),
        minutes: text(hymn.minutes, ""),
        status: text(hymn.status, "planned")
      })),
      enrichmentBlocks: simpleList(formation.enrichmentBlocks, (block) => ({
        id: text(block.id, ""),
        blockType: text(block.blockType || block.type, "Art Study"),
        title: text(block.title, "Enrichment"),
        resource: text(block.resource || block.source, ""),
        resourceType: text(block.resourceType || block.sourceType, block.resource || block.source ? "curriculum" : "none"),
        cadenceLabel: text(block.cadenceLabel || block.cadence, ""),
        planningMode: text(block.planningMode, "family"),
        scheduledDays: safeArray(block.scheduledDays),
        weeklyFrequency: weeklyFrequencyValue(block.weeklyFrequency || block.cadenceLabel || block.cadence, "1x"),
        formLabel: text(block.formLabel, ""),
        gradeLabel: text(block.gradeLabel, ""),
        childId: text(block.childId, ""),
        progressionType: text(block.progressionType, "lessons"),
        startNumber: text(block.startNumber, ""),
        currentNumber: text(block.currentNumber || block.completedThroughNumber, ""),
        endNumber: text(block.endNumber, ""),
        minutesPlanned: text(block.minutesPlanned || block.minutes, ""),
        credits: text(block.credits, ""),
        finalGradeOverride: text(block.finalGradeOverride, ""),
        color: text(block.color, ACCENTS[2]),
        termId: text(block.termId || block.assignedTermId, currentTermId),
        gracePriority: text(block.gracePriority, "keep"),
        graceNote: text(block.graceNote, "Deferred gracefully to the reserve list.")
      })).length ? simpleList(formation.enrichmentBlocks, (block) => ({
        id: text(block.id, ""),
        blockType: text(block.blockType || block.type, "Art Study"),
        title: text(block.title, "Enrichment"),
        resource: text(block.resource || block.source, ""),
        resourceType: text(block.resourceType || block.sourceType, block.resource || block.source ? "curriculum" : "none"),
        cadenceLabel: text(block.cadenceLabel || block.cadence, ""),
        planningMode: text(block.planningMode, "family"),
        scheduledDays: safeArray(block.scheduledDays),
        weeklyFrequency: weeklyFrequencyValue(block.weeklyFrequency || block.cadenceLabel || block.cadence, "1x"),
        formLabel: text(block.formLabel, ""),
        gradeLabel: text(block.gradeLabel, ""),
        childId: text(block.childId, ""),
        progressionType: text(block.progressionType, "lessons"),
        startNumber: text(block.startNumber, ""),
        currentNumber: text(block.currentNumber || block.completedThroughNumber, ""),
        endNumber: text(block.endNumber, ""),
        minutesPlanned: text(block.minutesPlanned || block.minutes, ""),
        credits: text(block.credits, ""),
        finalGradeOverride: text(block.finalGradeOverride, ""),
        color: text(block.color, ACCENTS[2]),
        termId: text(block.termId || block.assignedTermId, currentTermId),
        gracePriority: text(block.gracePriority, "keep"),
        graceNote: text(block.graceNote, "Deferred gracefully to the reserve list.")
      })) : derivedEnrichment,
      feasts: simpleList(formation.feasts, (feast) => ({
        id: text(feast.id, ""),
        civilDate: text(feast.civilDate || feast.date, ""),
        title: text(feast.title, "Feast"),
        fastingRule: text(feast.fastingRule || feast.fasting, ""),
        planningMode: text(feast.planningMode, "family"),
        minutes: text(feast.minutes, ""),
        note: text(feast.note, "")
      }))
    },
    coOp: {
      enabled: Boolean(setup.coOp?.enabled),
      mode: text(setup.coOp?.mode, "create"),
      name: text(setup.coOp?.name, ""),
      city: text(setup.coOp?.city, ""),
      meetingDay: text(setup.coOp?.meetingDay, ""),
      cycle: text(setup.coOp?.cycle, ""),
      theme: text(setup.coOp?.theme, ""),
      memberNotes: text(setup.coOp?.memberNotes, "")
    },
    familyPlanning: {
      fastingPreference: text(familyPlanning.fastingPreference, "guidance"),
      weekStart: text(familyPlanning.weekStart, ""),
      nameDays: safeArray(familyPlanning.nameDays),
      events: safeArray(familyPlanning.events),
      meals: safeArray(familyPlanning.meals),
      recipes: safeArray(familyPlanning.recipes),
      groceryItems: safeArray(familyPlanning.groceryItems)
    },
    calendarOptions: safeArray(setup.calendarToggle?.options),
    evaluationModels: safeArray(setup.evaluationModels)
  };
}

export function toPrintCenterViewModel(rawPayload) {
  const printCenter = rawPayload?.printCenter || {};
  const reports = toReportsViewModel({ reports: printCenter.reports || {} });
  return {
    shell: shellFromPayload("print-center", { "print-center": printCenter }),
    page: page("print-center", "Print Center", "Prepare limited, useful print packs for the household and each child."),
    term: {
      label: text(printCenter.term?.label, ""),
      paceMode: text(printCenter.term?.paceMode, ""),
      week: text(printCenter.week?.label, "")
    },
    templates: simpleList(printCenter.templates, (template, index) => ({
      id: text(template.id, ""),
      title: text(template.title, "Print Template"),
      audience: text(template.audience, ""),
      type: text(template.templateType, ""),
      description: text(template.description, ""),
      child: template.child ? childName(template.child, index) : "",
      color: ACCENTS[index % ACCENTS.length],
      premium: template.audience === "child" || template.templateType === "term-plan" || template.templateType === "liturgical-school-calendar"
    })),
    document: {
      title: text(printCenter.printDocument?.title, "Print Preview"),
      subtitle: text(printCenter.printDocument?.subtitle, ""),
      sections: simpleList(printCenter.printDocument?.sections, (section) => ({
        title: text(section.title, "Section"),
        items: simpleList(section.items, (item) => ({
          label: text(item.label, "Item"),
          detail: text(item.detail, ""),
          minutes: text(item.minutes, "")
        }))
      }))
    },
    job: {
      templateId: text(printCenter.draftJob?.templateId, ""),
      format: text(printCenter.draftJob?.format, "pdf").toUpperCase(),
      range: text(printCenter.draftJob?.rangeLabel, ""),
      status: text(printCenter.draftJob?.status, "")
    },
    outputs: {
      household: safeArray(printCenter.sampleOutputs?.mom).map((item) => text(item)),
      child: safeArray(printCenter.sampleOutputs?.child).map((item) => text(item))
    },
    reports,
    billing: {
      childCount: safeArray(printCenter.children).length,
      printLimit: 3
    }
  };
}
