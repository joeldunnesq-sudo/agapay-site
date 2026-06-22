import { calendarLabel, displayDate, gregorianToJdn, jdnToGregorian, liturgicalFeastsForYear, orthodoxPascha } from "../liturgical-calendar.js";
import { buildReportCardExport, buildTranscriptExport } from "./academic-exports.js";
import { buildTranscriptsFromAcademicRecords } from "./academic-records.js";
import { getLearnSeedSnapshot } from "./demo-data.js";
import { normalizeCalendarType, SeedLiturgicalSource } from "./liturgical-source.js";
import { buildPrintJobRequest, buildWeeklyHouseholdPrintDocument } from "./print-engine.js";
import { getLearnSeedForIdentity, learnSetupIdentity } from "./setup-persistence.js";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function weekStartSundayIso(civilDate = new Date().toISOString().slice(0, 10)) {
  const date = new Date(`${civilDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date.toISOString().slice(0, 10);
}

function completionStatus(seed, scope, civilDate, itemId, fallback = "planned") {
  const periodKey = scope === "daily" ? civilDate : weekStartSundayIso(civilDate);
  const bucket = seed.setupSnapshot?.completion?.[scope]?.[periodKey];
  if (bucket && Object.prototype.hasOwnProperty.call(bucket, itemId)) return bucket[itemId] ? "completed" : "planned";
  return fallback;
}

function buildHouseholdStreamCards(seed, daily, civilDate) {
  const streamLookup = new Map(seed.householdStreams.map((stream) => [stream.id, stream]));
  const setupRows = (seed.plannerWeek?.householdRows || []).filter((row) => row.kind === "enrichment");
  const blocks = setupRows.length
    ? setupRows.map((row) => ({
        ...row,
        subtitle: row.detail,
        minutesPlanned: row.minutes?.find((minutes) => Number(minutes) > 0) || 0,
        status: row.statuses?.includes("completed") ? "completed" : "planned"
      }))
    : daily.householdBlocks?.length
    ? daily.householdBlocks
    : seed.householdStreams.map((stream, index) => ({
        id: `stream_${stream.id || index}`,
        householdStreamId: stream.id,
        title: stream.title,
        subtitle: stream.cadenceLabel || stream.streamType || "Household rhythm",
        minutesPlanned: stream.minutesPlanned || 20,
        status: stream.status || "planned"
      }));
  return blocks.map((block) => {
    const stream = streamLookup.get(block.householdStreamId);
    return {
      id: block.id,
      streamType: stream?.streamType || "",
      title: block.title,
      subtitle: block.subtitle,
      groupLabel: block.groupLabel || (block.planningMode === "forms" ? "Form Enrichment" : "Everyone Together"),
      href: block.href || (/read|literature/i.test(`${block.title} ${block.subtitle}`) ? "/myagapay/learn/books" : "/myagapay/learn/formation"),
      cadenceLabel: stream?.cadenceLabel || "",
      minutesPlanned: block.minutesPlanned,
      status: completionStatus(seed, "weekly", civilDate, block.id, block.status)
    };
  });
}

function progressFromTerm(term = {}, civilDate = "") {
  const start = new Date(`${term.startDate || ""}T12:00:00`);
  const end = new Date(`${term.endDate || ""}T12:00:00`);
  const current = new Date(`${civilDate || ""}T12:00:00`);
  if ([start, end, current].some((date) => Number.isNaN(date.getTime())) || end <= start) {
    return {
      label: term.label || "Current Term",
      currentWeek: 0,
      totalWeeks: 0,
      percent: 0,
      dateRange: [term.startDate, term.endDate].filter(Boolean).join(" - ")
    };
  }
  const totalWeeks = Math.max(1, Math.ceil((end - start + 1) / (7 * 24 * 60 * 60 * 1000)));
  const currentWeek = Math.max(1, Math.min(totalWeeks, Math.floor((current - start) / (7 * 24 * 60 * 60 * 1000)) + 1));
  return {
    label: term.label || "Current Term",
    currentWeek,
    totalWeeks,
    percent: Math.round((currentWeek / totalWeeks) * 100),
    dateRange: [term.startDate, term.endDate].filter(Boolean).join(" - ")
  };
}

function computeWeeklySummary(seed, calendarType, civilDate = new Date().toISOString().slice(0, 10)) {
  const week = buildPlannerWeek(seed, calendarType);
  const rows = [...(week.householdRows || []), ...(week.childRows || [])];
  const statuses = rows.flatMap((row) => {
    const completed = completionStatus(seed, "weekly", civilDate, row.id, "planned") === "completed";
    return (row.statuses || []).map((status) => completed && status !== "empty" && status !== "rest" ? "completed" : status);
  }).filter((status) => status && status !== "rest");
  const lessonsPlanned = statuses.filter((status) => status !== "empty").length;
  const lessonsCompleted = statuses.filter((status) => status === "completed").length;
  const upcomingFeasts = buildUpcomingFeasts(seed, calendarType, week.dates?.[0] || new Date().toISOString().slice(0, 10));
  const readAloud = seed.currentReadAlouds?.[0] || seed.books?.[0] || {};
  return {
    lessonsCompleted,
    lessonsPlanned,
    lessonsCompletionPercent: lessonsPlanned ? Math.round((lessonsCompleted / lessonsPlanned) * 100) : 0,
    narrationsLogged: seed.narrationLogs?.length || 0,
    feastDaysAhead: upcomingFeasts.length,
    nextFeastLabel: upcomingFeasts[0]?.title || "No upcoming feast loaded",
    readAloudProgressPercent: Number(readAloud.progressPercent || 0),
    readAloudTitle: readAloud.title || "Add a read-aloud in Setup"
  };
}

function buildChildColumns(seed, daily, civilDate) {
  const childLookup = new Map(seed.children.map((child) => [child.id, child]));
  const columns = !seed.setupSnapshot && daily.childColumns?.length
    ? daily.childColumns
    : seed.children.map((child) => ({
        childId: child.id,
        blocks: (seed.plannerWeek?.childRows || [])
          .filter((row) => row.childId === child.id)
          .slice(0, 5)
          .map((row) => ({
            id: row.id,
            title: row.title,
            subtitle: row.detail,
            minutesPlanned: row.minutes?.find((minutes) => Number(minutes) > 0) || 0,
            status: row.statuses?.find((status) => status && status !== "empty") || "planned"
          }))
      }));
  return columns.map((column) => ({
    child: childLookup.get(column.childId),
    blocks: column.blocks.map((block) => ({
      id: block.id,
      title: block.title,
      subtitle: block.subtitle,
      minutesPlanned: block.minutesPlanned,
      status: completionStatus(seed, "weekly", civilDate, block.id, block.status)
    }))
  }));
}

function buildUpcomingFeasts(seed, calendarType, fromDate = "2025-05-08") {
  return buildAgapayLiturgicalDays({
    calendarType,
    startDate: fromDate,
    endDate: addDays(fromDate, 90),
    seed
  })
    .filter((entry) => entry.feastRank !== "Daily Rhythm")
    .slice(0, 3)
    .map((entry) => ({
      civilDate: entry.civilDate,
      title: entry.feastTitle,
      fastingRule: entry.fastingRule,
      saints: entry.saints
    }));
}

function buildCalendarToggle(resolvedCalendar) {
  return {
    active: resolvedCalendar,
    options: [
      { value: "julian", label: "Julian" },
      { value: "revised-julian", label: "Revised Julian" }
    ],
    description: calendarLabel(resolvedCalendar === "revised-julian" ? "gregorian" : "julian")
  };
}

function childById(seed) {
  return new Map(seed.children.map((child) => [child.id, child]));
}

function int(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function childrenForProgress(item = {}, children = []) {
  if (item.childId) return children.filter((child) => child.id === item.childId);
  if (item.formLabel) return children.filter((child) => child.formLabel === item.formLabel || child.gradeLabel === item.formLabel);
  return children;
}

function rangeProgress({ start = 1, current = 0, end = 0 } = {}) {
  const first = Math.max(1, int(start, 1));
  const last = Math.max(first, int(end, first));
  const doneThrough = Math.max(first - 1, Math.min(last, int(current, first - 1)));
  const completed = Math.max(0, doneThrough - first + 1);
  const total = Math.max(1, last - first + 1);
  return {
    start: first,
    current: doneThrough,
    end: last,
    completed,
    total,
    percent: Math.round((completed / total) * 100)
  };
}

function buildSubjectProgress(seed) {
  const children = seed.children || [];
  const subjectRows = (seed.setupSnapshot?.subjects || seed.curriculumSubjects || []).flatMap((subject, index) => {
    const assignedChildren = childrenForProgress(subject, children);
    const progress = rangeProgress({
      start: subject.startNumber || 1,
      current: subject.currentNumber || subject.completedThroughNumber || subject.startNumber || 0,
      end: subject.endNumber || subject.startNumber || 0
    });
    return (assignedChildren.length ? assignedChildren : [{ id: "", firstName: "Household", formLabel: subject.formLabel || "Household" }]).map((child) => ({
      id: `subject_progress_${subject.id || index}_${child.id || "household"}`,
      childId: child.id || "",
      childName: child.firstName || "Household",
      formLabel: child.formLabel || child.gradeLabel || subject.formLabel || "Household",
      kind: "subject",
      subjectTitle: subject.title || "Subject",
      subjectType: subject.subjectType || "subject",
      source: subject.resource || "",
      progressionType: subject.progressionType || "lessons",
      start: progress.start,
      current: progress.current,
      end: progress.end,
      completed: progress.completed,
      total: progress.total,
      percent: progress.percent,
      status: progress.percent >= 100 ? "complete" : progress.percent > 0 ? "in progress" : "planned"
    }));
  });
  const bookRows = (seed.setupSnapshot?.books || seed.books || []).flatMap((book, index) => {
    const assignedChildren = childrenForProgress(book, children);
    const progress = rangeProgress({
      start: book.startChapter || 1,
      current: book.currentChapter || book.completedThroughChapter || book.startChapter || 0,
      end: book.endChapter || book.totalChapters || book.startChapter || 0
    });
    const isHousehold = !book.formLabel && !book.childId;
    return (assignedChildren.length ? assignedChildren : [{ id: "", firstName: "Household", formLabel: "Household" }]).map((child) => ({
      id: `book_progress_${book.id || index}_${child.id || "household"}`,
      childId: isHousehold ? "" : child.id || "",
      childName: isHousehold ? "Household" : child.firstName || "Household",
      formLabel: isHousehold ? "Household" : child.formLabel || child.gradeLabel || book.formLabel || "Household",
      kind: "book",
      subjectTitle: book.title || "Book",
      subjectType: book.category || "Reading",
      source: book.author || book.audienceLabel || "",
      progressionType: "chapters",
      start: progress.start,
      current: progress.current,
      end: progress.end,
      completed: progress.completed,
      total: progress.total,
      percent: progress.percent,
      status: progress.percent >= 100 ? "complete" : progress.percent > 0 ? "in progress" : "planned"
    }));
  });
  return [...subjectRows, ...bookRows].filter((row) => row.subjectTitle && row.total > 0);
}

function setupCopyworkSources(setupSnapshot = {}) {
  const formation = setupSnapshot.formation || {};
  const sources = [
    ...(Array.isArray(formation.recitationTracks) ? formation.recitationTracks : []).map((track) => ({
      title: track.title,
      detail: [track.sourceKind || track.source, track.status].filter(Boolean).join(" - ")
    })),
    ...(Array.isArray(formation.hymnStudies) ? formation.hymnStudies : []).map((hymn) => ({
      title: hymn.title,
      detail: [hymn.tone, hymn.source, hymn.status].filter(Boolean).join(" - ")
    })),
    ...(Array.isArray(formation.feasts) ? formation.feasts : []).map((feast) => ({
      title: feast.title,
      detail: [feast.civilDate || feast.date, feast.note].filter(Boolean).join(" - ")
    })),
    ...(Array.isArray(setupSnapshot.formationMaterials) ? setupSnapshot.formationMaterials : []).map((material) => ({
      title: material.title,
      detail: [material.materialType, material.source, material.cadence || material.cadenceLabel].filter(Boolean).join(" - ")
    }))
  ];
  return sources.filter((source) => source.title || source.detail);
}

function reportCardsFromProgress(seed, subjectProgress) {
  if (!seed.setupSnapshot) return seed.reportCards;
  return (seed.children || []).map((child) => {
    const rows = subjectProgress.filter((row) => row.childId === child.id);
    const completed = rows.reduce((total, row) => total + row.completed, 0);
    const planned = rows.reduce((total, row) => total + row.total, 0);
    const percent = planned ? Math.round((completed / planned) * 100) : 0;
    return {
      id: `report_${child.id}_${seed.term?.id || "term"}`,
      childId: child.id,
      termId: seed.term?.id || "",
      status: "draft",
      summary: `${child.firstName}'s report is generated from setup-tracked subject and reading progress.`,
      readAloudProgressPercent: percent,
      records: rows.map((row) => ({
        subject: row.subjectTitle,
        description: row.source || row.subjectType,
        progressPercent: row.percent,
        status: row.status,
        completed: row.completed,
        total: row.total,
        progressionType: row.progressionType
      }))
    };
  });
}

function addDays(iso, days) {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function eachIsoDate(startDate, endDate) {
  const dates = [];
  for (let cursor = startDate; cursor <= endDate; cursor = addDays(cursor, 1)) {
    dates.push(cursor);
  }
  return dates;
}

function dateLabelFromIso(iso) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${iso}T00:00:00.000Z`));
}

function weekdayLabelFromIso(iso) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" })
    .format(new Date(`${iso}T00:00:00.000Z`));
}

function monthLabelFromIso(iso) {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${iso}T00:00:00.000Z`));
}

function monthKeyFromIso(iso) {
  const value = String(iso || "");
  return /^\d{4}-\d{2}/.test(value) ? value.slice(0, 7) : new Date().toISOString().slice(0, 7);
}

function julianOldStyleLabel(civilDate) {
  const [year, month, day] = civilDate.split("-").map(Number);
  const oldStyle = jdnToGregorian(gregorianToJdn(year, month, day) - 13);
  return `Julian ${displayDate(oldStyle)}`;
}

function seededLiturgicalEntry(seed, calendarType, civilDate) {
  return (seed.liturgicalWeek[normalizeCalendarType(calendarType)] || []).find((entry) => entry.civilDate === civilDate) || null;
}

function paschalOffset(civilDate) {
  const year = Number(civilDate.slice(0, 4));
  const dateJdn = gregorianToJdn(...civilDate.split("-").map(Number));
  const pascha = orthodoxPascha(year);
  const paschaJdn = gregorianToJdn(...pascha.date.split("-").map(Number));
  return dateJdn - paschaJdn;
}

function fastingRuleForDate(civilDate, feast) {
  if (feast?.rank === "fast") return "Fast";
  const offset = paschalOffset(civilDate);
  if (offset >= 0 && offset <= 6) return "No Fast (Bright Week)";
  const [, month, day] = civilDate.split("-").map(Number);
  if ((month === 6 && day >= 8 && day <= 28) || (month === 8 && day >= 1 && day <= 14) || (month === 11 && day >= 15) || (month === 12 && day <= 24)) {
    return "Fast";
  }
  const weekday = new Date(`${civilDate}T00:00:00.000Z`).getUTCDay();
  return weekday === 3 || weekday === 5 ? "Fast" : "No Fast";
}

function fastingTypeForDate(civilDate, feast, fastingRule = "") {
  const rule = String(fastingRule || "").toLowerCase();
  if (rule.includes("no fast")) return "No fasting prescribed";
  const offset = paschalOffset(civilDate);
  if (offset >= 0 && offset <= 6) return "Bright Week";
  if (feast?.rank === "fast") return "Strict fast day";
  const [, month, day] = civilDate.split("-").map(Number);
  if (month === 8 && day >= 1 && day <= 14) return "Dormition Fast";
  if (month === 11 && day >= 15 || month === 12 && day <= 24) return "Nativity Fast";
  if (month === 6 && day >= 8 && day <= 28) return "Apostles' Fast";
  const weekday = new Date(`${civilDate}T00:00:00.000Z`).getUTCDay();
  if (weekday === 3) return "Wednesday fast";
  if (weekday === 5) return "Friday fast";
  if (rule.includes("fast")) return "Fast day";
  return "No fasting prescribed";
}

function buildAgapayLiturgicalDays({ calendarType = "julian", startDate, endDate, seed }) {
  const calendar = normalizeCalendarType(calendarType) === "revised-julian" ? "gregorian" : "julian";
  const startYear = Number(startDate.slice(0, 4));
  const endYear = Number(endDate.slice(0, 4));
  const feastLookup = new Map(
    [startYear - 1, startYear, endYear, endYear + 1]
      .flatMap((year) => liturgicalFeastsForYear(year, calendar))
      .map((feast) => [feast.date, feast])
  );

  return eachIsoDate(startDate, endDate).map((civilDate) => {
    const feast = feastLookup.get(civilDate);
    const seededReadings = seededLiturgicalEntry(seed, calendarType, civilDate) || {};
    const isSunday = new Date(`${civilDate}T00:00:00.000Z`).getUTCDay() === 0;
    return {
      civilDate,
      calendarType: normalizeCalendarType(calendarType),
      feastTitle: feast?.name || (isSunday ? "Sunday Orthodox Rhythm" : "Daily Orthodox Rhythm"),
      feastRank: feast?.rank ? `${feast.rank.charAt(0).toUpperCase()}${feast.rank.slice(1)}` : "Daily Rhythm",
      fastingRule: seededReadings.fastingRule || fastingRuleForDate(civilDate, feast),
      fastingType: fastingTypeForDate(civilDate, feast, seededReadings.fastingRule || fastingRuleForDate(civilDate, feast)),
      saints: feast ? [feast.name] : ["Household prayer and lesson rhythm"],
      oldStyleDateLabel: calendar === "julian" ? feast?.sourceDate || julianOldStyleLabel(civilDate) : dateLabelFromIso(civilDate),
      epistleRef: seededReadings.epistleRef || "Daily readings source not connected",
      gospelRef: seededReadings.gospelRef || "Daily readings source not connected",
      troparionTone: seededReadings.troparionTone || "Household",
      troparionText: seededReadings.troparionText || "Connect a liturgical text source in Setup before displaying hymn text.",
      kontakionTone: seededReadings.kontakionTone || "Household",
      kontakionText: seededReadings.kontakionText || "Connect a liturgical text source in Setup before displaying kontakion text."
    };
  });
}

function applyGraceModeToRows(rows, graceModeRule) {
  if (!graceModeRule?.mode || graceModeRule.mode === "full") return rows.map((row) => ({ ...row, graceModeApplied: false }));
  return rows.map((row) => {
    if (row.priority < graceModeRule.reducePriorityThreshold) return { ...row, graceModeApplied: false };
    return {
      ...row,
      graceModeApplied: true,
      statuses: row.statuses.map((status) => status === "planned" ? "reduced" : status),
      minutes: row.minutes.map((minutes) => minutes > 15 ? Math.max(10, Math.round(minutes * 0.5)) : minutes)
    };
  });
}

function familyPlanForDate(seed, civilDate, liturgicalDay = {}) {
  const planning = seed.familyPlanning || seed.setupSnapshot?.familyPlanning || {};
  const monthDay = civilDate.slice(5);
  return {
    nameDays: (planning.nameDays || []).filter((entry) => entry.monthDay === monthDay),
    events: (planning.events || []).filter((entry) => entry.date === civilDate),
    meal: (planning.meals || []).find((entry) => entry.date === civilDate) || null,
    fastingPreference: planning.fastingPreference || "guidance",
    fastingRule: liturgicalDay?.fastingRule || "No Fast",
    fastingType: liturgicalDay?.fastingType || "none"
  };
}

function buildPlannerWeek(seed, calendarType) {
  const week = seed.plannerWeek;
  const liturgicalDays = buildAgapayLiturgicalDays({
    calendarType,
    startDate: week.dates[0],
    endDate: week.dates[week.dates.length - 1],
    seed
  }).filter((entry) => week.dates.includes(entry.civilDate));
  const childLookup = childById(seed);
  return {
    ...week,
    liturgicalDays,
    familyDays: week.dates.map((civilDate) => familyPlanForDate(seed, civilDate, liturgicalDays.find((day) => day.civilDate === civilDate))),
    recipes: seed.familyPlanning?.recipes || [],
    groceryItems: seed.familyPlanning?.groceryItems || [],
    householdRows: applyGraceModeToRows(week.householdRows, seed.graceModeRule),
    childRows: applyGraceModeToRows(week.childRows, seed.graceModeRule).map((row) => ({
      ...row,
      child: childLookup.get(row.childId)
    }))
  };
}

function buildPlannerMonth(seed, calendarType, month = "") {
  const monthKey = /^\d{4}-\d{2}$/.test(String(month || "")) ? month : monthKeyFromIso(seed.term?.startDate || new Date().toISOString());
  const [year, monthNumber] = monthKey.split("-").map(Number);
  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  const last = new Date(Date.UTC(year, monthNumber, 0));
  const gridStart = new Date(first);
  gridStart.setUTCDate(first.getUTCDate() - first.getUTCDay());
  const gridEnd = new Date(last);
  gridEnd.setUTCDate(last.getUTCDate() + (6 - last.getUTCDay()));
  const startDate = gridStart.toISOString().slice(0, 10);
  const endDate = gridEnd.toISOString().slice(0, 10);
  const liturgicalDays = buildAgapayLiturgicalDays({ calendarType, startDate, endDate, seed });
  const liturgicalByDate = new Map(liturgicalDays.map((day) => [day.civilDate, day]));
  const week = buildPlannerWeek(seed, calendarType);
  const today = new Date().toISOString().slice(0, 10);
  const householdPlanByWeekday = new Map();
  const formPlanByWeekday = new Map();
  const planIndexForWeekday = (weekday) => weekday === 0 ? 6 : weekday - 1;

  for (let weekday = 0; weekday < 7; weekday += 1) {
    const index = planIndexForWeekday(weekday);
    householdPlanByWeekday.set(weekday, (week.householdRows || [])
      .filter((row) => Number(row.minutes?.[index] || 0) > 0)
      .map((row) => ({ title: row.title, minutes: Number(row.minutes?.[index] || 0) }))
      .slice(0, 3));
    formPlanByWeekday.set(weekday, (week.childRows || [])
      .filter((row) => Number(row.minutes?.[index] || 0) > 0)
      .map((row) => ({ title: row.title, formLabel: row.child?.formLabel || row.child?.gradeLabel || "Form", minutes: Number(row.minutes?.[index] || 0) }))
      .slice(0, 3));
  }

  const days = eachIsoDate(startDate, endDate).map((civilDate) => {
    const date = new Date(`${civilDate}T00:00:00.000Z`);
    const weekday = date.getUTCDay();
    const liturgicalDay = liturgicalByDate.get(civilDate) || {};
    const fastingRule = liturgicalDay.fastingRule || "No Fast";
    const familyPlan = familyPlanForDate(seed, civilDate, liturgicalDay);
    return {
      civilDate,
      dayNumber: date.getUTCDate(),
      weekday,
      weekdayLabel: DAYS[weekday],
      inMonth: civilDate.startsWith(monthKey),
      isToday: civilDate === today,
      isSunday: weekday === 0,
      feastTitle: liturgicalDay.feastTitle || "Daily Orthodox Rhythm",
      feastRank: liturgicalDay.feastRank || "Daily Rhythm",
      fastingRule,
      fastingType: liturgicalDay.fastingType || fastingTypeForDate(civilDate, null, fastingRule),
      isFastDay: /fast/i.test(fastingRule) && !/no fast/i.test(fastingRule),
      oldStyleDateLabel: liturgicalDay.oldStyleDateLabel || "",
      nameDays: familyPlan.nameDays,
      events: familyPlan.events,
      meal: familyPlan.meal,
      fastingPreference: familyPlan.fastingPreference,
      householdPlan: householdPlanByWeekday.get(weekday) || [],
      formPlan: formPlanByWeekday.get(weekday) || []
    };
  });

  return {
    key: monthKey,
    label: monthLabelFromIso(`${monthKey}-01`),
    startDate,
    endDate,
    weekdays: DAYS,
    days,
    fastDays: days.filter((day) => day.inMonth && day.isFastDay).length,
    feastDays: days.filter((day) => day.inMonth && day.feastRank !== "Daily Rhythm").length,
    printableTitle: `${monthLabelFromIso(`${monthKey}-01`)} Household Calendar`
  };
}

function buildCurriculum(seed) {
  return {
    activePackage: seed.curriculumPackage,
    packages: seed.curriculumPackages,
    subjects: seed.curriculumSubjects,
    resources: seed.curriculumResources,
    mappings: seed.curriculumMappings,
    mappingSummary: [
      "AGAPAY defaults map Scripture, catechesis, hymnody, and enrichment into the active cycle.",
      "Household custom resources map The Wingfeather Saga into the family read-aloud stream.",
      "The Bronze Bow maps directly to Elias's independent reading track."
    ]
  };
}

function buildGraceMode(seed) {
  return {
    enabled: true,
    seasonAdjustment: seed.seasonAdjustment,
    rule: seed.graceModeRule,
    reasons: ["new baby", "illness", "travel", "caregiving", "feast season", "custom"],
    modes: ["full", "light", "minimum viable", "feast only", "custom"],
    preserved: ["Church Rhythms", "Morning Basket", "Catechesis"],
    changed: seed.graceModeRule.changedSummary
  };
}

export class SeedLiturgicalRepository {
  constructor(seed = getLearnSeedSnapshot()) {
    this.seed = seed;
    this.source = new SeedLiturgicalSource(seed);
  }

  listWeek(calendarType = "julian") {
    return this.source.listRange({ calendarType });
  }

  getDay(civilDate, calendarType = "julian") {
    return this.source.getDay({ civilDate, calendarType });
  }
}

export class SeedFutureRecordsRepository {
  constructor(seed = getLearnSeedSnapshot()) {
    this.seed = seed;
  }

  async listPrintTemplates(householdId) {
    return this.seed.placeholderRecords.printTemplates.filter((entry) => entry.householdId === householdId);
  }

  async listPrintJobs(householdId) {
    return this.seed.placeholderRecords.printJobs.filter((entry) => entry.householdId === householdId);
  }

  async listReportCards(householdId) {
    return this.seed.placeholderRecords.reportCards.filter((entry) => entry.householdId === householdId);
  }

  async listTranscripts(householdId) {
    return this.seed.placeholderRecords.transcripts.filter((entry) => entry.householdId === householdId);
  }

  async listAcademicRecords(householdId) {
    return this.seed.placeholderRecords.academicRecords.filter((entry) => entry.householdId === householdId);
  }
}

export class SeedLearnRepository {
  constructor(seed = getLearnSeedSnapshot()) {
    this.seed = seed;
    this.liturgical = new SeedLiturgicalRepository(seed);
    this.futureRecords = new SeedFutureRecordsRepository(seed);
  }

  getDashboard({ calendarType = "julian", civilDate = new Date().toISOString().slice(0, 10) } = {}) {
    const resolvedCalendar = normalizeCalendarType(calendarType);
    const hasSetup = Boolean(this.seed.setupSnapshot);
    const household = hasSetup
      ? this.seed.household
      : {
          id: "learn_household_pending",
          name: "Your Household",
          primaryMethod: "Homeschool",
          liturgicalCalendarType: resolvedCalendar,
          paceMode: "steady",
          graceModeActive: false,
          setupCompleted: false
        };
    const children = hasSetup ? this.seed.children : [];
    const liturgicalDay = this.liturgical.getDay(civilDate, resolvedCalendar)
      || buildAgapayLiturgicalDays({ calendarType: resolvedCalendar, startDate: civilDate, endDate: civilDate, seed: this.seed })[0];
    const daily = this.seed.dashboardDaily[civilDate] || {
      churchRhythms: [
        { id: "rhythm_prayers", title: "Morning Prayers", status: "planned", note: "Ready" },
        { id: "rhythm_readings", title: "Daily Readings", status: "planned", note: "Connect source in Setup" },
        { id: "rhythm_saint", title: "Saint or Feast", status: "planned", note: liturgicalDay.feastTitle },
        { id: "rhythm_hymn", title: "Hymn Practice", status: "planned", note: "Connect text source in Setup" },
        { id: "rhythm_fast", title: "Fasting Rule", status: "planned", note: liturgicalDay.fastingRule }
      ],
      householdBlocks: [],
      childColumns: [],
      googleCalendarSync: this.seed.googleCalendarSync || {},
      thisDayInHistory: {
        label: "This Day in History",
        title: "Connect a history source",
        year: civilDate.slice(0, 4),
        summary: "AGAPAY Learn can show a daily history prompt here once a free source is connected.",
        sourceLabel: "Source not connected"
      }
    };
    return {
      household,
      children,
      schoolYear: hasSetup ? this.seed.schoolYear : { label: "Set up your school year", startDate: "", endDate: "" },
      term: hasSetup ? this.seed.term : { label: "No term configured", startDate: "", endDate: "" },
      preferences: this.seed.setupSnapshot?.preferences || {
        calendarType: household.liturgicalCalendarType || calendarType,
        paceMode: household.paceMode || "steady",
        graceModeDefault: this.seed.graceModeRule?.mode || "light",
        graceModeActive: Boolean(household.graceModeActive)
      },
      cycle: {
        framework: this.seed.cycleFramework,
        year: hasSetup ? this.seed.cycleYear : { title: "Choose your cycle in Setup" },
        topics: hasSetup ? this.seed.cycleTopics : []
      },
      curriculumPackage: hasSetup ? this.seed.curriculumPackage : { title: "Setup needed" },
      paceProfile: this.seed.paceProfile,
      seasonAdjustment: this.seed.seasonAdjustment,
      calendarToggle: buildCalendarToggle(resolvedCalendar),
      googleCalendarSync: daily.googleCalendarSync || this.seed.googleCalendarSync,
      thisDayInHistory: daily.thisDayInHistory || this.seed.thisDayInHistory,
      today: {
        civilDate,
        title: "Today",
        weekdayLabel: weekdayLabelFromIso(civilDate),
        dateLabel: dateLabelFromIso(civilDate),
        liturgicalDay,
        churchRhythms: (this.seed.setupSnapshot?.formation?.churchRhythms?.length
          ? this.seed.setupSnapshot.formation.churchRhythms
          : hasSetup ? daily.churchRhythms : [
            { id: "rhythm_setup", title: "Complete Setup", status: "planned", note: "Build your household rhythm." }
          ]).map((entry) => ({
            ...entry,
            status: completionStatus(this.seed, "daily", civilDate, entry.id, entry.status)
          })),
        householdStreamCards: hasSetup ? buildHouseholdStreamCards(this.seed, daily, civilDate) : [],
        childColumns: hasSetup ? buildChildColumns(this.seed, daily, civilDate) : []
      },
      termProgress: hasSetup ? progressFromTerm(this.seed.term, civilDate) : progressFromTerm({}, civilDate),
      weeklySummary: hasSetup ? computeWeeklySummary(this.seed, resolvedCalendar, civilDate) : {
        lessonsCompleted: 0,
        lessonsPlanned: 0,
        lessonsCompletionPercent: 0,
        narrationsLogged: 0,
        feastDaysAhead: 0,
        nextFeastLabel: "Choose a calendar in Setup",
        readAloudProgressPercent: 0,
        readAloudTitle: "Add books in Setup"
      },
      upcomingFeasts: this.seed.setupSnapshot?.formation?.feasts?.length
        ? this.seed.setupSnapshot.formation.feasts.map((feast) => ({ ...feast }))
        : buildUpcomingFeasts(this.seed, resolvedCalendar, addDays(civilDate, 1)),
      activeIndicators: {
        graceMode: {
          enabled: hasSetup,
          label: "Grace Mode",
          detail: hasSetup ? this.seed.seasonAdjustment.title : "Configure in Setup"
        },
        cycle: hasSetup ? this.seed.cycleYear.title : "Setup needed",
        curriculumPackage: hasSetup ? this.seed.curriculumPackage.title : "No curriculum configured"
      },
      readAloud: {
        book: hasSetup ? this.seed.books[0] : null,
        assignment: hasSetup ? this.seed.bookAssignments[0] : null
      },
      narrationLogs: hasSetup ? this.seed.narrationLogs.map((entry) => ({ ...entry })) : []
    };
  }

  getCommunity({ facebookGroupUrl = "", communityResources = [] } = {}) {
    return {
      household: this.seed.household,
      comingSoon: false,
      title: "Community Resources",
      subtitle: "A growing library of trusted resources for Orthodox homeschool families.",
      detail: "Search by subject, resource type, or media format. AGAPAY curates the library; the Facebook group is the place for conversation, questions, and encouragement.",
      facebookGroupUrl,
      communityResources: [...(this.seed.communityResources || []), ...communityResources],
      sharingGuidance: [
        "Resources are reviewed before being added to the AGAPAY library.",
        "Use the Facebook group to ask questions and recommend resources.",
        "Always review a resource for your family's needs before assigning it."
      ]
    };
  }

  getPlanner({ calendarType = "julian", view = "week", month = "" } = {}) {
    const resolvedCalendar = normalizeCalendarType(calendarType);
    return {
      household: this.seed.household,
      children: this.seed.children,
      schoolYear: this.seed.schoolYear,
      term: this.seed.term,
      calendarToggle: buildCalendarToggle(resolvedCalendar),
      activeView: ["day", "week", "month", "term", "year"].includes(view) ? view : "week",
      cycle: {
        framework: this.seed.cycleFramework,
        year: this.seed.cycleYear,
        topics: this.seed.cycleTopics,
        visibleFrameworks: [
          { type: "history", label: "Cycle 2: Medieval / Byzantine focus" },
          { type: "catechesis", label: "Cycle 2: The Creed and sacramental life" },
          { type: "enrichment", label: "Picture, poet, composer, and nature rotation" },
          { type: "recitation", label: "Psalms, hymns, Scripture, and prayers" }
        ]
      },
      curriculum: buildCurriculum(this.seed),
      graceMode: buildGraceMode(this.seed),
      week: buildPlannerWeek(this.seed, resolvedCalendar),
      month: buildPlannerMonth(this.seed, resolvedCalendar, month),
      termSetup: this.seed.termSetup,
      upcomingFeasts: buildUpcomingFeasts(this.seed, resolvedCalendar),
      readAloud: {
        book: this.seed.books[0],
        assignment: this.seed.bookAssignments[0]
      },
      familyPlanning: this.seed.familyPlanning || this.seed.setupSnapshot?.familyPlanning || { nameDays: [], events: [], meals: [], recipes: [], groceryItems: [], fastingPreference: "guidance" }
    };
  }

  getPrintCenter({ calendarType = "julian", month = "" } = {}) {
    const resolvedCalendar = normalizeCalendarType(calendarType);
    const childLookup = childById(this.seed);
    const householdTemplates = this.seed.placeholderRecords.printTemplates.filter((template) => template.audience !== "child");
    const childTemplates = this.seed.setupSnapshot
      ? this.seed.children.flatMap((child) => [
          {
            id: `print_${child.id}_weekly`,
            householdId: this.seed.household.id,
            templateType: "child-weekly-assignment",
            title: `${child.firstName}'s Weekly Sheet`,
            audience: "child",
            childId: child.id,
            description: "Daily assignments, readings, memory work, and copywork from this household's saved setup."
          },
          {
            id: `print_${child.id}_term`,
            householdId: this.seed.household.id,
            templateType: "child-term-plan",
            title: `${child.firstName}'s Term Plan`,
            audience: "child",
            childId: child.id,
            description: "Term track summary, books, subjects, and progress from this household's saved setup."
          }
        ])
      : this.seed.placeholderRecords.printTemplates.filter((template) => template.audience === "child");
    const templates = [...householdTemplates, ...childTemplates];
    return {
      household: this.seed.household,
      children: this.seed.children,
      calendarToggle: buildCalendarToggle(resolvedCalendar),
      term: this.seed.term,
      week: buildPlannerWeek(this.seed, resolvedCalendar),
      month: buildPlannerMonth(this.seed, resolvedCalendar, month),
      termSetup: this.seed.termSetup,
      templates: templates.map((template) => ({
        ...template,
        child: template.childId ? childLookup.get(template.childId) : null
      })),
      printDocument: buildWeeklyHouseholdPrintDocument({
        household: this.seed.household,
        week: buildPlannerWeek(this.seed, resolvedCalendar),
        calendarToggle: buildCalendarToggle(resolvedCalendar)
      }),
      draftJob: buildPrintJobRequest({
        templateId: "print_mom_weekly",
        rangeLabel: this.seed.plannerWeek.label
      }),
      sampleOutputs: {
        mom: [
          "Weekly household plan",
          "Term plan",
          "Month calendar",
          "Liturgical school calendar"
        ],
        child: [
          "Weekly assignment sheet",
          "Reading list",
          "Memory work sheet",
          "Copywork sheet",
          "Term plan"
        ]
      }
    };
  }

  getFormation({ calendarType = "julian", civilDate = new Date().toISOString().slice(0, 10) } = {}) {
    const resolvedCalendar = normalizeCalendarType(calendarType);
    const dashboard = this.getDashboard({ calendarType: resolvedCalendar, civilDate });
    return {
      household: this.seed.household,
      children: this.seed.children,
      calendarToggle: buildCalendarToggle(resolvedCalendar),
      today: dashboard.today,
      churchRhythms: dashboard.today.churchRhythms,
      catechesisCycle: this.seed.catechesisCycles[0],
      recitationTracks: this.seed.recitationTracks,
      hymnStudies: this.seed.hymnStudies,
      enrichmentBlocks: this.seed.enrichmentBlocks,
      rotations: this.seed.rotations,
      upcomingFeasts: this.seed.setupSnapshot?.formation?.feasts?.length
        ? this.seed.setupSnapshot.formation.feasts.map((feast) => ({ ...feast }))
        : dashboard.upcomingFeasts,
      natureJournalEntries: this.seed.natureJournalEntries
    };
  }

  getBooks() {
    const hasSetup = Boolean(this.seed.setupSnapshot);
    const readAloud = this.seed.currentReadAlouds?.[0] || this.seed.books?.[0] || null;
    const start = Number(readAloud?.startChapter || 1);
    const end = Number(readAloud?.endChapter || readAloud?.totalChapters || 0);
    const chapterSpan = end ? Math.max(1, end - start + 1) : 0;
    const pacingWeeks = readAloud && end ? Array.from({ length: 4 }, (_, index) => {
      const first = start + Math.floor((index * chapterSpan) / 4);
      const last = start + Math.floor(((index + 1) * chapterSpan) / 4) - 1;
      return {
        week: index + 1,
        chapters: `${first}${Math.max(first, last) > first ? `-${Math.max(first, last)}` : ""}`,
        pages: ""
      };
    }) : [];
    return {
      household: this.seed.household,
      children: this.seed.children,
      currentReadAlouds: this.seed.currentReadAlouds,
      libraryBooks: this.seed.libraryBooks,
      orthodoxSuggestions: hasSetup ? [] : this.seed.orthodoxBookSuggestions,
      bookPacing: {
        title: readAloud?.title || "Add a read-aloud in Setup",
        subtitle: this.seed.term?.label || "Current Term",
        chaptersPerWeek: end ? Math.max(1, Math.ceil(chapterSpan / 12)) : 0,
        progressPercent: readAloud?.progressPercent || 0,
        weeks: pacingWeeks
      },
      copyworkSources: hasSetup ? setupCopyworkSources(this.seed.setupSnapshot) : [
        { title: "KJV Scripture", detail: "Psalm 23; John 10:11; Philippians 4:13" },
        { title: "Hymn Texts", detail: "Be Thou My Vision; O Sacred Head" },
        { title: "Feast Day Texts", detail: "Troparia of the Day; Kontakia" }
      ]
    };
  }

  getReports() {
    const childLookup = childById(this.seed);
    const subjectProgress = buildSubjectProgress(this.seed);
    const closedReportCards = Array.isArray(this.seed.closedReportCards) ? this.seed.closedReportCards : [];
    const reportCards = closedReportCards.length ? closedReportCards : reportCardsFromProgress(this.seed, subjectProgress);
    const academicRecords = this.seed.setupSnapshot
      ? (Array.isArray(this.seed.closedAcademicRecords) ? this.seed.closedAcademicRecords : [])
      : this.seed.academicRecords;
    const transcripts = this.seed.setupSnapshot
      ? buildTranscriptsFromAcademicRecords({ ...this.seed, academicRecords })
      : this.seed.transcripts;
    return {
      household: this.seed.household,
      children: this.seed.children,
      schoolYear: this.seed.schoolYear,
      term: this.seed.term,
      weeklySummary: this.seed.setupSnapshot ? computeWeeklySummary(this.seed, this.seed.household?.liturgicalCalendarType || "julian") : this.seed.weeklySummary,
      subjectProgress,
      reportCards: reportCards.map((report) => ({
        ...report,
        child: childLookup.get(report.childId),
        exportPreview: buildReportCardExport(report)
      })),
      transcripts: transcripts.map((transcript) => ({
        ...transcript,
        child: childLookup.get(transcript.childId),
        exportPreview: buildTranscriptExport(transcript)
      })),
      academicRecords,
      reportExports: this.seed.reportExports,
      narrationLogs: this.seed.narrationLogs.map((entry) => ({
        ...entry,
        child: childLookup.get(entry.childId)
      })),
      natureJournalEntries: this.seed.natureJournalEntries.map((entry) => ({
        ...entry,
        child: childLookup.get(entry.childId)
      }))
    };
  }

  getCoOp({ enabled = false } = {}) {
    return {
      enabled,
      coOp: {
        ...this.seed.coOp,
        enabled
      },
      meeting: this.seed.coOpMeeting,
      scheduleBlocks: this.seed.coOpScheduleBlocks,
      members: this.seed.coOpMembers,
      announcements: this.seed.coOpAnnouncements,
      sharedReadAlouds: this.seed.currentReadAlouds.slice(0, 3),
      resources: [
        { title: "Co-op Handbook", type: "PDF" },
        { title: "2024-25 Calendar", type: "PDF" },
        { title: "Teaching Rotation (Cycle 2)", type: "XLSX" },
        { title: "Nature Study Guide: Spring", type: "PDF" }
      ]
    };
  }

  getOnboarding() {
    return {
      setupCompleted: Boolean(this.seed.setupSnapshot),
      setupSnapshot: this.seed.setupSnapshot || null,
      household: this.seed.household,
      children: this.seed.children,
      schoolYear: this.seed.schoolYear,
      term: this.seed.term,
      onboarding: this.seed.onboarding,
      calendarToggle: buildCalendarToggle(this.seed.household.liturgicalCalendarType),
      starterStreams: this.seed.householdStreams,
      subjects: this.seed.setupSnapshot?.subjects || this.seed.curriculumSubjects || [],
      books: this.seed.setupSnapshot?.books || this.seed.books || [],
      formation: this.seed.setupSnapshot?.formation || {
        churchRhythms: this.seed.dashboard?.today?.churchRhythms || [],
        catechesis: this.seed.catechesisCycles?.[0] || {},
        recitationTracks: this.seed.recitationTracks || [],
        hymnStudies: this.seed.hymnStudies || [],
        enrichmentBlocks: this.seed.enrichmentBlocks || [],
        feasts: []
      },
      formationMaterials: this.seed.setupSnapshot?.formationMaterials || this.seed.curriculumResources?.filter((resource) => resource.sourceKind === "formation") || [],
      preferences: this.seed.setupSnapshot?.preferences || {
        calendarType: this.seed.household.liturgicalCalendarType,
        paceMode: this.seed.household.paceMode,
        evaluationModel: "narrative-only",
        graceModeDefault: this.seed.graceModeRule?.mode || "light",
        graceModeActive: Boolean(this.seed.household.graceModeActive),
        printPack: "weekly-household"
      },
      coOp: this.seed.setupSnapshot?.coOp || this.seed.coOp || {},
      evaluationModels: ["narrative-only", "complete-incomplete", "letter-grade", "percent", "pass-fail"]
    };
  }
}

export function createSeedLearnRepository() {
  return new SeedLearnRepository();
}

export async function createLearnRepositoryForRequest(request, env, options = {}) {
  const identity = await learnSetupIdentity(request, env);
  if (!identity) return null;
  return new SeedLearnRepository(await getLearnSeedForIdentity(env, identity, options));
}
