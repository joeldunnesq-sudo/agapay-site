import { d1, d1First, d1Run, normalizeEmail, safeParseJsonRow } from "../lib/core.js";
import { requireDonor } from "../handlers/parish.js";
import { loadLearnAcademicSnapshot } from "./academic-records.js";
import { LEARN_FREE_CHILD_LIMIT, learnRequestHasFamilyAccessAsync } from "./billing.js";
import { getLearnSeedSnapshot } from "./demo-data.js";

const LEARN_SETUP_KV_PREFIX = "__agapay_learn_setup:";
const devSetupSnapshots = new Map();

const HOMESCHOOL_METHODS = ["Charlotte Mason", "Orthodox Classical", "Traditional", "Eclectic", "Unsure"];

const HISTORY_CYCLES = {
  "ambleside-inspired": {
    title: "Charlotte Mason History & Enrichment Cycle",
    summary: "A six-year chronological enrichment spine inspired by AmblesideOnline, adapted for Orthodox households with saints, church history, geography, timeline, art, poetry, music, and living-book context.",
    years: {
      year_1: {
        number: 1,
        title: "Year 1: Early medieval and national beginnings",
        topics: ["Early medieval stories", "Lives of saints and missionaries", "Maps, legends, folk songs, and picture study"]
      },
      year_2: {
        number: 2,
        title: "Year 2: Renaissance, exploration, and reformations",
        topics: ["Renaissance and exploration", "Church history touchpoints", "Art, geography, and narration"]
      },
      year_3: {
        number: 3,
        title: "Year 3: Early modern and colonial worlds",
        topics: ["Early modern nations", "Colonial and missionary encounters", "Timeline and map work"]
      },
      year_4: {
        number: 4,
        title: "Year 4: Revolutions and the long nineteenth century",
        topics: ["Revolutions and reform", "Nineteenth-century lives and literature", "Composer, artist, and poetry pairings"]
      },
      year_5: {
        number: 5,
        title: "Year 5: Modern nations and the twentieth century",
        topics: ["Modern world history", "Orthodox witness in modernity", "Civic geography and reports"]
      },
      year_6: {
        number: 6,
        title: "Year 6: Ancient Greece/Rome plus modern bridge",
        topics: ["Ancient Greek and Roman background", "Early Christian context", "Timeline synthesis and narration"]
      }
    }
  },
  "orthodox-classical": {
    title: "Orthodox Classical History & Enrichment Cycle",
    summary: "A chronological enrichment spine centered on Scripture, patristic history, Byzantium, Orthodox missions, and modern Church witness.",
    years: {
      year_1: { number: 1, title: "Year 1: Ancient, biblical, and patristic foundations", topics: ["Scripture geography", "Ancient civilizations", "Apostolic and patristic witness"] },
      year_2: { number: 2, title: "Year 2: Byzantium and medieval Christendom", topics: ["Byzantium", "Councils and saints", "Iconography, chant, and sacred art"] },
      year_3: { number: 3, title: "Year 3: Missions, nations, and early modern worlds", topics: ["Slavic and global missions", "Early modern empires", "Geography and source narration"] },
      year_4: { number: 4, title: "Year 4: Modern world and Orthodox witness", topics: ["Modern history", "New martyrs and confessors", "Civic life and reports"] },
      year_5: { number: 5, title: "Year 5: Integrated review and research", topics: ["Timeline review", "Family research projects", "Oral narration and portfolios"] },
      year_6: { number: 6, title: "Year 6: Capstone synthesis", topics: ["Ancient-to-modern synthesis", "Church history capstone", "Beautiful written reports"] }
    }
  },
  custom: {
    title: "Custom Enrichment Cycle",
    summary: "A flexible enrichment spine for eclectic households who want AGAPAY to organize history, geography, arts, saints, and living books around their chosen focus.",
    years: {
      year_1: { number: 1, title: "Custom Year 1", topics: ["Household-selected history", "Living books", "Narration and timeline work"] },
      year_2: { number: 2, title: "Custom Year 2", topics: ["Household-selected history", "Geography", "Arts and poetry"] },
      year_3: { number: 3, title: "Custom Year 3", topics: ["Household-selected history", "Church-life connections", "Reports"] },
      year_4: { number: 4, title: "Custom Year 4", topics: ["Household-selected history", "Timeline review", "Portfolio work"] },
      year_5: { number: 5, title: "Custom Year 5", topics: ["Household-selected history", "Independent reading", "Beautiful reports"] },
      year_6: { number: 6, title: "Custom Year 6", topics: ["Household-selected history", "Synthesis", "Capstone narration"] }
    }
  }
};

function nowIso() {
  return new Date().toISOString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function slug(value, fallback = "item") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function stableId(prefix, value, index = 0) {
  return `${prefix}_${slug(value, `${prefix}-${index + 1}`)}`;
}

function setupKvKey(identity) {
  return `${LEARN_SETUP_KV_PREFIX}${identity.householdId}`;
}

function parseStoredSetup(value) {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return safeParseJsonRow(value) || value;
}

function text(value, fallback = "") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function weeklyFrequencyValue(value, fallback = "1x") {
  const raw = String(value || "").trim().toLowerCase();
  if (["daily", "weekly", "4x", "3x", "2x", "1x", "as-needed"].includes(raw)) return raw;
  if (raw.includes("daily") || raw.includes("every")) return "daily";
  if (raw.includes("4")) return "4x";
  if (raw.includes("3")) return "3x";
  if (raw.includes("2")) return "2x";
  if (raw.includes("as")) return "as-needed";
  if (raw.includes("week")) return "1x";
  return fallback;
}

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function scheduledDaysValue(value, legacyFrequency = "") {
  const direct = Array.isArray(value) ? value : String(value || "").split(",");
  const selected = direct.map((day) => text(day, "").toLowerCase()).filter((day) => WEEKDAY_KEYS.includes(day));
  if (selected.length) return [...new Set(selected)];
  const frequency = weeklyFrequencyValue(legacyFrequency, "daily");
  return frequency === "daily" ? ["mon", "tue", "wed", "thu", "fri"]
    : frequency === "4x" ? ["mon", "tue", "wed", "thu"]
    : frequency === "3x" ? ["mon", "wed", "fri"]
    : frequency === "2x" ? ["tue", "thu"]
    : frequency === "1x" || frequency === "weekly" ? ["wed"]
    : [];
}

function frequencyFromDays(days = []) {
  const count = scheduledDaysValue(days, "as-needed").length;
  return count >= 5 ? "daily" : count === 1 ? "weekly" : count ? `${count}x` : "as-needed";
}

function weeklyPlansValue(value) {
  const direct = Array.isArray(value) ? value : String(value || "").split("|");
  return direct.slice(0, DEFAULT_TERM_WEEK_COUNT).map((entry) => text(entry, ""));
}

function labelsValue(value) {
  const direct = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(direct.map((entry) => text(entry, "")).filter(Boolean))];
}

function setupResourceValue(resource, subject = {}) {
  const raw = typeof resource === "string" ? { title: resource } : (resource || {});
  const title = text(raw.title || raw.resource, "");
  if (!title) return null;
  const formLabels = labelsValue(raw.formLabels || raw.formLabel || subject.formLabels || subject.formLabel);
  const childIds = Array.isArray(raw.childIds) && raw.childIds.length
    ? raw.childIds.filter(Boolean)
    : (Array.isArray(subject.childIds) ? subject.childIds.filter(Boolean) : []);
  return {
    title,
    scheduledWeeks: scheduledWeeksValue(raw.scheduledWeeks || subject.scheduledWeeks),
    weeklyPlans: weeklyPlansValue(raw.weeklyPlans || subject.weeklyPlans),
    planningMode: formLabels.length ? "forms" : text(raw.planningMode || subject.planningMode, "forms"),
    formLabel: text(raw.formLabel || formLabels[0] || subject.formLabel, ""),
    formLabels,
    gradeLabel: text(raw.gradeLabel || subject.gradeLabel, ""),
    childIds
  };
}

const DEFAULT_TERM_WEEK_COUNT = 12;

function scheduledWeeksValue(value, totalWeeks = DEFAULT_TERM_WEEK_COUNT) {
  const direct = Array.isArray(value) ? value : String(value || "").split(",");
  const selected = direct
    .map((week) => int(week, 0))
    .filter((week) => week >= 1 && week <= totalWeeks);
  return selected.length ? [...new Set(selected)].sort((a, b) => a - b) : Array.from({ length: totalWeeks }, (_, index) => index + 1);
}

function activeTermWeek(term = {}, reference = new Date(), totalWeeks = DEFAULT_TERM_WEEK_COUNT) {
  const startDate = String(term.startDate || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return 1;
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const current = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate()));
  const elapsedDays = Math.floor((current - start) / 86400000);
  return Math.max(1, Math.min(totalWeeks, Math.floor(elapsedDays / 7) + 1));
}

function scheduledThisTermWeek(item = {}, weekNumber = 1) {
  return scheduledWeeksValue(item.scheduledWeeks).includes(weekNumber);
}

function schedulingModeValue(value = "fixed") {
  return ["fixed", "weekly-target", "term-target", "loop", "date-range"].includes(value) ? value : "fixed";
}

function itemActiveOnDateRange(item = {}, isoDate = "") {
  if (!isoDate || item.schedulingMode !== "date-range") return true;
  if (item.activeStartDate && isoDate < item.activeStartDate) return false;
  if (item.activeEndDate && isoDate > item.activeEndDate) return false;
  return true;
}

function planArraysForItem(item = {}, currentTermWeek = 1, weekDates = []) {
  const active = scheduledThisTermWeek(item, currentTermWeek);
  const mode = schedulingModeValue(item.schedulingMode);
  const defaultDays = item.scheduledDays?.length ? item.scheduledDays : scheduledDaysValue(item.weeklyFrequency || "daily");
  if (!active) return weeklyPlanArrays(defaultDays, item.minutes || item.minutesPlanned || 20, false);
  let days = [...defaultDays];
  if (mode === "weekly-target") {
    const count = Math.max(1, Math.min(7, int(item.weeklyTarget, days.length || 1)));
    const pool = days.length ? days : ["mon", "tue", "wed", "thu", "fri"];
    days = pool.slice(0, count);
  } else if (mode === "term-target") {
    const activeWeeks = Math.max(1, scheduledWeeksValue(item.scheduledWeeks).length);
    const sessionsThisWeek = Math.max(0, Math.ceil(int(item.termTarget, 0) / activeWeeks));
    const pool = days.length ? days : ["mon", "tue", "wed", "thu", "fri"];
    days = pool.slice(0, Math.min(pool.length, sessionsThisWeek));
  } else if (mode === "loop") {
    const pool = days.length ? days : ["mon", "tue", "wed", "thu", "fri"];
    days = pool.length ? [pool[(Math.max(1, currentTermWeek) - 1) % pool.length]] : [];
  }
  const base = weeklyPlanArrays(days, item.minutes || item.minutesPlanned || 20, true);
  if (mode === "date-range" && weekDates.length === 7) {
    base.minutes = base.minutes.map((value, index) => itemActiveOnDateRange(item, weekDates[index]) ? value : 0);
    base.statuses = base.statuses.map((value, index) => itemActiveOnDateRange(item, weekDates[index]) ? value : "empty");
  }
  return base;
}

function resourceTypeValue(value, fallback = "curriculum") {
  const raw = String(value || "").trim().toLowerCase();
  if (["book", "curriculum", "website", "hymn", "icon", "activity", "none"].includes(raw)) return raw;
  return fallback;
}

function graceModeValue(value = "", fallback = "light") {
  const raw = String(value || "").trim().toLowerCase().replace(/[-_]+/g, " ");
  if (raw === "full") return "full";
  if (raw === "medium" || raw === "light") return "light";
  if (raw === "minimum" || raw === "minimum viable" || raw === "feast only") return "minimum viable";
  return fallback;
}

function gracePriorityValue(value = "", fallback = "medium") {
  const raw = String(value || "").trim().toLowerCase().replace(/[-_]+/g, " ");
  if (raw === "core" || raw === "always keep" || raw === "keep") return "core";
  if (raw === "high" || raw === "important") return "high";
  if (raw === "medium" || raw === "helpful" || raw === "reduce first" || raw === "shorten") return "medium";
  if (raw === "low" || raw === "optional" || raw === "bump if needed" || raw === "defer if needed" || raw === "defer in minimum" || raw === "minimum only") return "low";
  return fallback;
}

function normalizeHomeschoolMethod(value) {
  const candidate = text(value, "Charlotte Mason");
  return HOMESCHOOL_METHODS.includes(candidate) ? candidate : "Charlotte Mason";
}

function defaultHistoryFrameworkForMethod(method) {
  if (method === "Orthodox Classical") return "orthodox-classical";
  if (method === "Eclectic") return "custom";
  return "ambleside-inspired";
}

function normalizeHistoryCycle(value = {}, method = "Charlotte Mason") {
  const framework = HISTORY_CYCLES[value.framework] ? value.framework : defaultHistoryFrameworkForMethod(method);
  const frameworkConfig = HISTORY_CYCLES[framework] || HISTORY_CYCLES["ambleside-inspired"];
  const cycleYear = frameworkConfig.years[value.cycleYear] ? value.cycleYear : "year_1";
  const year = frameworkConfig.years[cycleYear];
  const rotation = ["first", "second"].includes(value.rotation) ? value.rotation : "first";
  const currentFocus = text(value.currentFocus, year.topics[0] || year.title);
  return {
    framework,
    rotation,
    cycleYear,
    currentFocus,
    sourceNote: text(value.sourceNote, framework === "ambleside-inspired" ? "AO-inspired chronology adapted for an Orthodox household." : "Household enrichment cycle."),
    frameworkTitle: frameworkConfig.title,
    frameworkSummary: frameworkConfig.summary,
    yearNumber: year.number,
    yearTitle: year.title,
    enrichmentTopics: year.topics
  };
}

function int(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function rangeProgressPercent(start, current, end) {
  const first = Math.max(1, int(start, 1));
  const last = Math.max(first, int(end, first));
  if (!last || last <= first) return 0;
  const doneThrough = Math.max(first - 1, Math.min(last, int(current, first - 1)));
  const completed = Math.max(0, doneThrough - first + 1);
  const total = Math.max(1, last - first + 1);
  return Math.round((completed / total) * 100);
}

function distributeRangeSegments({ label = "", start = 1, end = 0, color = "" } = {}, weeks = 12) {
  const first = Math.max(1, int(start, 1));
  const last = Math.max(first, int(end, first));
  const total = Math.max(1, last - first + 1);
  return Array.from({ length: weeks }, (_, index) => {
    const segStart = first + Math.floor((index * total) / weeks);
    const segEnd = first + Math.floor(((index + 1) * total) / weeks) - 1;
    return {
      title: `${label} ${segStart}${Math.max(segStart, segEnd) > segStart ? `-${Math.max(segStart, segEnd)}` : ""}`,
      start: index + 1,
      span: 1,
      color
    };
  });
}

function weeklyPlanArrays(schedule = "daily", minutes = 20, active = true) {
  const amount = active ? Math.max(0, int(minutes, 20)) : 0;
  const activeDays = scheduledDaysValue(schedule, Array.isArray(schedule) ? "as-needed" : schedule).map((day) => WEEKDAY_KEYS.indexOf(day));
  const planMinutes = Array.from({ length: 7 }, (_, index) => activeDays.includes(index) ? amount : 0);
  const statuses = Array.from({ length: 7 }, (_, index) => activeDays.includes(index) ? "planned" : "empty");
  return { minutes: planMinutes, statuses };
}

function currentWeekWindow(reference = new Date()) {
  const start = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  const dates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
  const format = (iso) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
  return { dates, label: `${format(dates[0])} - ${format(dates[6])}` };
}

function normalizeCompletion(value = {}) {
  const normalizeBucket = (bucket, limit) => Object.fromEntries(
    Object.entries(bucket && typeof bucket === "object" ? bucket : {})
      .filter(([key, items]) => /^\d{4}-\d{2}-\d{2}$/.test(key) && items && typeof items === "object")
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, limit)
      .map(([key, items]) => [key, Object.fromEntries(
        Object.entries(items)
          .filter(([itemId]) => /^[a-zA-Z0-9:_-]{1,180}$/.test(itemId))
          .slice(0, 250)
          .map(([itemId, completed]) => [itemId, Boolean(completed)])
      )])
  );
  return {
    daily: normalizeBucket(value.daily, 45),
    weekly: normalizeBucket(value.weekly, 18)
  };
}

function childrenForAssignment(item = {}, children = []) {
  if (Array.isArray(item.childIds) && item.childIds.length) return children.filter((child) => item.childIds.includes(child.id));
  if (item.childId) return children.filter((child) => child.id === item.childId);
  if (Array.isArray(item.formLabels) && item.formLabels.length) return children.filter((child) => item.formLabels.includes(child.formLabel) || item.formLabels.includes(child.gradeLabel));
  if (item.formLabel) return children.filter((child) => child.formLabel === item.formLabel || child.gradeLabel === item.formLabel);
  if (item.gradeLabel) return children.filter((child) => child.gradeLabel === item.gradeLabel);
  return children;
}

function bookBelongsToHouseholdStream(book = {}) {
  const audience = String(book.audienceLabel || "").toLowerCase();
  return !book.formLabel && !book.childId && (
    !audience ||
    audience === "household" ||
    audience === "morning basket" ||
    audience === "read-aloud" ||
    audience === "read aloud"
  );
}

function resourceBookLike({ id = "", title = "", author = "", category = "", termId = "", formLabel = "", formLabels = [], gradeLabel = "", childId = "", childIds = [], audienceLabel = "", planningMode = "", weeklyFrequency = "1x", scheduledWeeks = [], weeklyPlans = [], minutes = "", color = "", sourceKind = "setup" } = {}) {
  const resolvedTitle = text(title, "");
  if (!resolvedTitle) return null;
  return {
    id,
    title: resolvedTitle,
    author,
    category,
    termId,
    formLabel,
    formLabels,
    gradeLabel,
    childId,
    childIds,
    audienceLabel,
    planningMode,
    weeklyFrequency,
    scheduledWeeks,
    weeklyPlans,
    minutes,
    color,
    sourceKind,
    startChapter: "",
    currentChapter: "",
    endChapter: "",
    totalChapters: ""
  };
}

export async function learnSetupIdentity(request, env) {
  const donor = await requireDonor(request, env);
  const email = normalizeEmail(donor?.email || "");
  if (!email) return null;
  return {
    email,
    donor,
    householdId: `learn_household_${slug(email)}`
  };
}

function normalizeSetupPayload(payload = {}, identity) {
  const seed = getLearnSeedSnapshot();
  const household = payload.household || {};
  const schoolYear = payload.schoolYear || {};
  const term = payload.term || {};
  const preferences = payload.preferences || {};
  const groupingMode = preferences.groupingMode === "grades" ? "grades" : "forms";
  const primaryMethod = normalizeHomeschoolMethod(household.primaryMethod || seed.household.primaryMethod);
  const parentNames = list(household.parentNames)
    .map((name) => text(name, ""))
    .filter(Boolean);
  if (!parentNames.length && text(household.parentName, "")) parentNames.push(text(household.parentName, ""));
  const historyCycle = payload.historyCycle ? normalizeHistoryCycle(payload.historyCycle, primaryMethod) : null;
  const normalizedHousehold = {
    id: identity.householdId,
    slug: slug(household.name || identity.householdId, identity.householdId),
    name: text(household.name, seed.household.name),
    parentNames,
    motherName: text(household.motherName, ""),
    motherNameDay: text(household.motherNameDay, ""),
    fatherName: text(household.fatherName, ""),
    fatherNameDay: text(household.fatherNameDay, ""),
    childrenCount: 0,
    parishName: text(household.parishName, seed.household.parishName || ""),
    parishPatronalFeastName: text(household.parishPatronalFeastName || household.patronalFeastName, ""),
    parishPatronalFeastDate: text(household.parishPatronalFeastDate || household.patronalFeastDate, ""),
    homeschoolName: text(household.homeschoolName, seed.household.homeschoolName || ""),
    patronSaintName: text(household.patronSaintName, seed.household.patronSaintName || ""),
    patronSaintFeastDate: text(household.patronSaintFeastDate, seed.household.patronSaintFeastDate || ""),
    city: text(household.city, ""),
    primaryMethod,
    liturgicalCalendarType: text(preferences.calendarType || household.liturgicalCalendarType, seed.household.liturgicalCalendarType || "julian"),
    paceMode: text(preferences.paceMode || household.paceMode, seed.household.paceMode || "steady"),
    graceModeActive: Boolean(preferences.graceModeActive ?? seed.household.graceModeActive),
    setupCompleted: true
  };

  const children = list(payload.children)
    .map((child, index) => {
      const firstName = text(child.firstName || child.name, "");
      if (!firstName) return null;
      return {
        id: text(child.id, stableId("child", firstName, index)),
        householdId: identity.householdId,
        firstName,
        ageYears: int(child.ageYears || child.age, 0),
        nameDay: text(child.nameDay, ""),
        gradeLabel: text(child.gradeLabel || child.grade, child.formLabel || ""),
        formLabel: text(child.formLabel, ""),
        color: text(child.color, ""),
        avatarMonogram: text(child.avatarMonogram, firstName.charAt(0).toUpperCase()),
        accentToken: text(child.accentToken, seed.children[index % seed.children.length]?.accentToken || "navy")
      };
    })
    .filter(Boolean);
  normalizedHousehold.childrenCount = children.length;

  const schoolYearId = text(schoolYear.id, "school_year_current");
  const normalizedTerms = (list(payload.terms).length ? list(payload.terms) : [term])
    .map((entry, index) => ({
      ...seed.term,
      id: text(entry.id, `term_${index + 1}`),
      schoolYearId,
      label: text(entry.label, `Term ${index + 1}`),
      startDate: text(entry.startDate, index === 0 ? seed.term.startDate : ""),
      endDate: text(entry.endDate, index === 0 ? seed.term.endDate : ""),
      weeksCount: Math.max(1, Math.min(24, int(entry.weeksCount, 12))),
      description: text(entry.description, ""),
      paceMode: text(preferences.paceMode || entry.paceMode, seed.term.paceMode || "steady")
    }))
    .filter((entry) => entry.label);
  const requestedCurrentTermId = text(schoolYear.currentTermId || payload.currentTermId || term.id, "");
  const currentTermFromList = normalizedTerms.find((entry) => entry.id === requestedCurrentTermId) || normalizedTerms[0];
  const normalizedSchoolYear = {
    ...seed.schoolYear,
    id: schoolYearId,
    householdId: identity.householdId,
    label: text(schoolYear.label, seed.schoolYear.label),
    startDate: text(schoolYear.startDate, seed.schoolYear.startDate),
    endDate: text(schoolYear.endDate, seed.schoolYear.endDate),
    status: "active",
    currentTermId: currentTermFromList?.id || "term_1"
  };

  const normalizedTerm = {
    ...(currentTermFromList || normalizedTerms[0] || seed.term),
    id: currentTermFromList?.id || "term_1"
  };

  const streams = list(payload.streams).map((stream, index) => ({
    id: text(stream.id, stableId("stream", stream.title, index)),
    householdId: identity.householdId,
    streamType: text(stream.streamType || stream.type, "custom"),
    title: text(stream.title, "Family-Based Block"),
    cadenceLabel: text(stream.cadenceLabel || stream.cadence, "Weekly"),
    dailyMinutes: {
      mon: int(stream.dailyMinutes?.mon ?? stream.monMinutes, 20),
      tue: int(stream.dailyMinutes?.tue ?? stream.tueMinutes, 20),
      wed: int(stream.dailyMinutes?.wed ?? stream.wedMinutes, 20),
      thu: int(stream.dailyMinutes?.thu ?? stream.thuMinutes, 20),
      fri: int(stream.dailyMinutes?.fri ?? stream.friMinutes, 20)
    }
  })).filter((stream) => stream.title);

  const books = list(payload.books).map((book, index) => ({
    id: text(book.id, stableId("book", book.title, index)),
    householdId: identity.householdId,
    title: text(book.title, ""),
    author: text(book.author, ""),
    category: text(book.category, "Living Books"),
    planningMode: text(book.planningMode, book.formLabel ? "forms" : "family"),
    scheduledWeeks: scheduledWeeksValue(book.scheduledWeeks),
    weeklyFrequency: weeklyFrequencyValue(book.weeklyFrequency || book.cadenceLabel || book.cadence, "daily"),
    minutes: int(book.minutes, 20),
    formLabel: text(book.formLabel, ""),
    audienceLabel: text(book.audienceLabel, "Household"),
    startChapter: int(book.startChapter, 1),
    currentChapter: int(book.currentChapter || book.completedThroughChapter || book.startChapter, int(book.startChapter, 1)),
    endChapter: int(book.endChapter || book.totalChapters, 0),
    totalChapters: int(book.endChapter || book.totalChapters, 0),
    color: text(book.color, ""),
    termId: text(book.termId || book.assignedTermId, normalizedTerm.id),
    graceNote: text(book.graceNote, "Reading moved into the reserve basket.")
  })).filter((book) => book.title);

  const subjects = list(payload.subjects).map((subject, index) => {
    const subjectDays = scheduledDaysValue(subject.scheduledDays, subject.weeklyFrequency || subject.cadenceLabel || subject.cadence || "daily");
    return ({
    id: text(subject.id, stableId("subject", subject.title, index)),
    subjectType: text(subject.subjectType || subject.type, slug(subject.title, "subject")),
    title: text(subject.title, "Subject"),
    instructionMode: text(subject.instructionMode, "parent-led"),
    schedulingMode: schedulingModeValue(subject.schedulingMode),
    scheduledDays: subjectDays,
    scheduledWeeks: scheduledWeeksValue(subject.scheduledWeeks),
    weeklyFrequency: frequencyFromDays(subjectDays),
    weeklyPlans: weeklyPlansValue(subject.weeklyPlans),
    weeklyTarget: Math.max(0, int(subject.weeklyTarget, 0)),
    termTarget: Math.max(0, int(subject.termTarget, 0)),
    activeStartDate: text(subject.activeStartDate, ""),
    activeEndDate: text(subject.activeEndDate, ""),
    priorityLevel: ["essential", "important", "enrichment", "optional"].includes(subject.priorityLevel) ? subject.priorityLevel : "important",
    missedLessonBehavior: text(subject.missedLessonBehavior, preferences.defaultMissedLessonBehavior || "next-occurrence"),
    planningMode: labelsValue(subject.formLabels || subject.formLabel).length ? "forms" : text(subject.planningMode, "forms"),
    formLabel: text(subject.formLabel, labelsValue(subject.formLabels || "")[0] || ""),
    formLabels: labelsValue(subject.formLabels || subject.formLabel),
    gradeLabel: text(subject.gradeLabel, ""),
    resource: text(Array.isArray(subject.resources) && subject.resources.length ? (subject.resources[0]?.title || subject.resources[0]) : subject.resource, ""),
    resources: Array.isArray(subject.resources) && subject.resources.length
      ? subject.resources.map((resource) => setupResourceValue(resource, subject)).filter(Boolean)
      : (subject.resource ? [setupResourceValue({ title: subject.resource }, subject)].filter(Boolean) : []),
    resourceType: resourceTypeValue(subject.resourceType || subject.sourceType, subject.resource ? "curriculum" : "none"),
    cadenceLabel: text(subject.weeklyFrequency || subject.cadenceLabel || subject.cadence, "Weekly"),
    minutes: int(subject.minutes, 20),
    childId: text(subject.childId, ""),
    childIds: Array.isArray(subject.childIds) ? subject.childIds.filter(Boolean) : [],
    startNumber: int(subject.startNumber, 1),
    currentNumber: int(subject.currentNumber || subject.completedThroughNumber || subject.startNumber, int(subject.startNumber, 1)),
    endNumber: int(subject.endNumber, 0),
    credits: Math.max(0, Number(subject.credits) || 0),
    finalGradeOverride: text(subject.finalGradeOverride, ""),
    color: text(subject.color, ""),
    termId: text(subject.termId || subject.assignedTermId, normalizedTerm.id),
    gracePriority: gracePriorityValue(subject.gracePriority, "core"),
    graceNote: text(subject.graceNote, "Deferred gracefully to the reserve list.")
  });
  }).filter((subject) => subject.title);

  const formationMaterials = list(payload.formationMaterials).map((material, index) => ({
    id: text(material.id, stableId("formation", material.title, index)),
    title: text(material.title, ""),
    materialType: text(material.materialType || material.type, "Catechesis"),
    source: text(material.source || material.author, ""),
    planningMode: text(material.planningMode, "family"),
    scheduledWeeks: scheduledWeeksValue(material.scheduledWeeks),
    weeklyFrequency: weeklyFrequencyValue(material.weeklyFrequency || material.cadenceLabel || material.cadence, "1x"),
    cadenceLabel: text(material.weeklyFrequency || material.cadenceLabel || material.cadence, "Weekly"),
    minutes: int(material.minutes, 0),
    color: text(material.color, ""),
    termId: text(material.termId || material.assignedTermId, normalizedTerm.id)
  })).filter((material) => material.title);

  const rawFormation = payload.formation || {};
  const formation = {
    churchRhythms: list(rawFormation.churchRhythms).map((rhythm, index) => ({
      id: text(rhythm.id, stableId("rhythm", rhythm.title, index)),
      title: text(rhythm.title, ""),
      note: text(rhythm.note, ""),
      weeklyFrequency: weeklyFrequencyValue(rhythm.weeklyFrequency || rhythm.cadenceLabel || rhythm.cadence, "daily"),
      cadenceLabel: text(rhythm.weeklyFrequency || rhythm.cadenceLabel || rhythm.cadence, "Daily"),
      minutes: int(rhythm.minutes || rhythm.minutesPlanned, 0),
      status: text(rhythm.status, "planned")
    })).filter((rhythm) => rhythm.title),
    catechesis: {
      id: text(rawFormation.catechesis?.id, "catechesis_setup"),
      householdId: identity.householdId,
      cycleYearId: seed.cycleYear?.id || "cycle_current",
      title: text(rawFormation.catechesis?.title, formationMaterials.find((material) => material.materialType === "Catechesis")?.title || "Catechesis"),
      currentLesson: text(rawFormation.catechesis?.currentLesson, ""),
      planningMode: text(rawFormation.catechesis?.planningMode, "family"),
      weeklyFrequency: weeklyFrequencyValue(rawFormation.catechesis?.weeklyFrequency || rawFormation.catechesis?.cadenceLabel || rawFormation.catechesis?.cadence, "2x"),
      minutes: int(rawFormation.catechesis?.minutes, 0),
      lessonNumber: int(rawFormation.catechesis?.lessonNumber, 0),
      totalLessons: int(rawFormation.catechesis?.totalLessons, 0),
      doctrinalTopic: text(rawFormation.catechesis?.doctrinalTopic || rawFormation.catechesis?.topic, ""),
      source: text(rawFormation.catechesis?.source, ""),
      evaluationModel: text(preferences.evaluationModel, "narrative-only")
    },
    recitationTracks: list(rawFormation.recitationTracks).map((track, index) => ({
      id: text(track.id, stableId("recitation", track.title, index)),
      householdId: identity.householdId,
      title: text(track.title, ""),
      sourceKind: text(track.sourceKind || track.source, "memory"),
      planningMode: labelsValue(track.formLabels || track.formLabel).length ? "forms" : text(track.planningMode, "family"),
      formLabel: labelsValue(track.formLabels || track.formLabel)[0] || "",
      formLabels: labelsValue(track.formLabels || track.formLabel),
      gradeLabel: text(track.gradeLabel, ""),
      scheduledWeeks: scheduledWeeksValue(track.scheduledWeeks),
      weeklyFrequency: weeklyFrequencyValue(track.weeklyFrequency || track.cadenceLabel || track.cadence, "daily"),
      minutes: int(track.minutes, 0)
    })).filter((track) => track.title),
    hymnStudies: list(rawFormation.hymnStudies).map((hymn, index) => ({
      id: text(hymn.id, stableId("hymn", hymn.title, index)),
      householdId: identity.householdId,
      termId: normalizedTerm.id,
      title: text(hymn.title, ""),
      tone: text(hymn.tone, ""),
      source: text(hymn.source, ""),
      planningMode: text(hymn.planningMode, "family"),
      weeklyFrequency: weeklyFrequencyValue(hymn.weeklyFrequency || hymn.cadenceLabel || hymn.cadence, "1x"),
      minutes: int(hymn.minutes, 0),
      status: text(hymn.status, "planned")
    })).filter((hymn) => hymn.title),
    enrichmentBlocks: list(rawFormation.enrichmentBlocks).map((block, index) => {
      const blockDays = scheduledDaysValue(block.scheduledDays, block.weeklyFrequency || block.cadenceLabel || block.cadence || "1x");
      // When resources[] is explicitly present (even empty), trust it as-is — the
      // user may have deliberately deleted every resource. Only fall back to
      // reconstructing a single resource from legacy block.resource/source when
      // resources was never sent at all (older snapshots, pre-resource-list saves).
      const hasResourcesField = Array.isArray(block.resources);
      const blockResources = hasResourcesField
        ? list(block.resources).map((resource) => setupResourceValue(resource, block)).filter(Boolean)
        : (block.resource || block.source
            ? [setupResourceValue({ title: block.resource || block.source, scheduledWeeks: block.scheduledWeeks, weeklyPlans: block.weeklyPlans }, block)].filter(Boolean)
            : []);
      const primaryResource = blockResources[0] || {};
      return ({
      id: text(block.id, stableId("enrich", block.title, index)),
      householdId: identity.householdId,
      termId: text(block.termId || block.assignedTermId, normalizedTerm.id),
      blockType: text(block.blockType || block.type, "enrichment"),
      title: text(block.title, ""),
      resource: text(primaryResource.title || block.resource || block.source, ""),
      resources: blockResources,
      resourceType: resourceTypeValue(block.resourceType || block.sourceType, block.resource || block.source || blockResources.length ? "curriculum" : "none"),
      planningMode: labelsValue(block.formLabels || block.formLabel).length || blockResources.some((resource) => labelsValue(resource.formLabels || resource.formLabel).length) ? "forms" : text(block.planningMode, "family"),
      instructionMode: text(block.instructionMode, "shared"),
      schedulingMode: schedulingModeValue(block.schedulingMode),
      scheduledDays: blockDays,
      scheduledWeeks: scheduledWeeksValue(block.scheduledWeeks),
      weeklyFrequency: frequencyFromDays(blockDays),
      weeklyPlans: weeklyPlansValue(block.weeklyPlans),
      weeklyTarget: Math.max(0, int(block.weeklyTarget, 0)),
      termTarget: Math.max(0, int(block.termTarget, 0)),
      activeStartDate: text(block.activeStartDate, ""),
      activeEndDate: text(block.activeEndDate, ""),
      priorityLevel: ["essential", "important", "enrichment", "optional"].includes(block.priorityLevel) ? block.priorityLevel : "enrichment",
      missedLessonBehavior: text(block.missedLessonBehavior, preferences.defaultMissedLessonBehavior || "next-occurrence"),
      formLabels: labelsValue(block.formLabels || block.formLabel),
      formLabel: text(block.formLabel, labelsValue(block.formLabels || block.formLabel)[0] || ""),
      gradeLabel: text(block.gradeLabel, ""),
      childId: text(block.childId, ""),
      childIds: Array.isArray(block.childIds) ? block.childIds.filter(Boolean) : [],
      startNumber: text(block.startNumber, ""),
      currentNumber: text(block.currentNumber || block.completedThroughNumber, ""),
      endNumber: text(block.endNumber, ""),
      minutesPlanned: int(block.minutesPlanned || block.minutes, 0),
      credits: text(block.credits, ""),
      finalGradeOverride: text(block.finalGradeOverride, ""),
      cadenceLabel: text(block.weeklyFrequency || block.cadenceLabel || block.cadence, "Weekly"),
      color: text(block.color, ""),
      gracePriority: gracePriorityValue(block.gracePriority, "medium"),
      graceNote: text(block.graceNote, "Deferred gracefully to the reserve list.")
    });
    }).filter((block) => block.title),
    feasts: list(rawFormation.feasts).map((feast, index) => ({
      id: text(feast.id, stableId("feast", feast.title, index)),
      civilDate: text(feast.civilDate || feast.date, ""),
      title: text(feast.title, ""),
      fastingRule: text(feast.fastingRule || feast.fasting, ""),
      planningMode: text(feast.planningMode, "family"),
      minutes: int(feast.minutes, 0),
      note: text(feast.note, "")
    })).filter((feast) => feast.title)
  };

  const coOp = {
    enabled: false,
    status: "coming-soon"
  };
  const rawFamilyPlanning = payload.familyPlanning || {};
  const familyPlanning = {
    fastingPreference: ["guidance", "strict", "off"].includes(rawFamilyPlanning.fastingPreference) ? rawFamilyPlanning.fastingPreference : "guidance",
    weekStart: text(rawFamilyPlanning.weekStart, ""),
    nameDays: [
      normalizedHousehold.motherNameDay && normalizedHousehold.motherName ? { id: "name_day_mother", personName: normalizedHousehold.motherName, relationship: "mother", monthDay: normalizedHousehold.motherNameDay.slice(-5) } : null,
      normalizedHousehold.fatherNameDay && normalizedHousehold.fatherName ? { id: "name_day_father", personName: normalizedHousehold.fatherName, relationship: "father", monthDay: normalizedHousehold.fatherNameDay.slice(-5) } : null,
      ...children.map((child) => child.nameDay ? { id: `name_day_${child.id}`, personId: child.id, personName: child.firstName, relationship: "child", monthDay: child.nameDay.slice(-5) } : null)
    ].filter(Boolean),
    events: list(rawFamilyPlanning.events).slice(0, 250).map((event, index) => {
      const recurrence = text(event.recurrence || event.repeat || "", "").toLowerCase();
      return {
        id: text(event.id, stableId("event", event.title, index)),
        title: text(event.title, "Event"),
        eventType: text(event.eventType, "appointment"),
        date: text(event.date, ""),
        startTime: text(event.startTime, ""),
        recurrence: ["weekly", "biweekly", "monthly", "quarterly", "yearly"].includes(recurrence) ? recurrence : "none",
        location: text(event.location, ""),
        notes: text(event.notes, "")
      };
    }).filter((event) => event.date),
    meals: list(rawFamilyPlanning.meals).slice(0, 120).map((meal, index) => ({ id: text(meal.id, stableId("meal", meal.date, index)), date: text(meal.date, ""), breakfast: text(meal.breakfast, ""), lunch: text(meal.lunch, ""), dinner: text(meal.dinner, "") })).filter((meal) => meal.date),
    recipes: list(rawFamilyPlanning.recipes).slice(0, 250).map((recipe, index) => ({ id: text(recipe.id, stableId("recipe", recipe.title, index)), title: text(recipe.title, ""), fastingType: ["fast-friendly", "adaptable", "regular"].includes(recipe.fastingType) ? recipe.fastingType : "adaptable", category: text(recipe.category, "Dinner"), sourceUrl: text(recipe.sourceUrl, ""), ingredients: text(recipe.ingredients, ""), instructions: text(recipe.instructions, "") })).filter((recipe) => recipe.title),
    groceryItems: list(rawFamilyPlanning.groceryItems).slice(0, 250).map((item, index) => ({ id: text(item.id, stableId("grocery", item.name, index)), name: text(item.name, ""), quantity: text(item.quantity, ""), category: text(item.category, "Other"), checked: Boolean(item.checked), pantry: Boolean(item.pantry || item.inPantry) })).filter((item) => item.name),
    chores: list(rawFamilyPlanning.chores).slice(0, 250).map((chore, index) => {
      const cadence = ["daily", "weekly", "monthly", "quarterly", "yearly"].includes(text(chore.cadence || chore.frequency, "").toLowerCase()) ? text(chore.cadence || chore.frequency, "").toLowerCase() : chore.day ? "weekly" : "daily";
      return {
        id: text(chore.id, stableId("chore", chore.title || chore.assignee, index)),
        title: text(chore.title, ""),
        assignee: text(chore.assignee, "Everyone"),
        cadence,
        day: text(chore.day, ""),
        dayOfMonth: int(chore.dayOfMonth, 0) ? String(Math.max(1, Math.min(31, int(chore.dayOfMonth, 0)))) : "",
        quarterMonth: ["1", "2", "3"].includes(text(chore.quarterMonth, "")) ? text(chore.quarterMonth, "") : "1",
        assignedDate: /^\d{4}-\d{2}-\d{2}$/.test(text(chore.assignedDate || chore.startDate || chore.date, "")) ? text(chore.assignedDate || chore.startDate || chore.date, "") : "",
        timeOfDay: text(chore.timeOfDay, "Anytime"),
        notes: text(chore.notes, ""),
        completed: Boolean(chore.completed)
      };
    }).filter((chore) => chore.title || chore.assignee)
  };
  const rawSetupTiles = payload.setupTiles && typeof payload.setupTiles === "object" ? payload.setupTiles : {};
  const setupTiles = Object.fromEntries(
    Object.entries(rawSetupTiles)
      .filter(([, group]) => group && typeof group === "object")
      .map(([groupKey, group]) => [
        text(groupKey, ""),
        Object.fromEntries(
          Object.entries(group)
            .filter(([, tile]) => tile && typeof tile === "object")
            .map(([tileKey, tile]) => [
              text(tileKey, ""),
              {
                title: text(tile.title, ""),
                detail: text(tile.detail, ""),
                minutes: text(tile.minutes, "")
              }
            ])
            .filter(([tileKey, tile]) => tileKey && (tile.title || tile.detail || tile.minutes))
        )
      ])
      .filter(([groupKey, group]) => groupKey && Object.keys(group).length)
  );

  return {
    version: 1,
    savedAt: nowIso(),
    identity,
    household: normalizedHousehold,
    children,
    schoolYear: normalizedSchoolYear,
    term: normalizedTerm,
    terms: normalizedTerms,
    preferences: {
      calendarType: normalizedHousehold.liturgicalCalendarType,
      groupingMode,
      defaultSchoolDays: scheduledDaysValue(preferences.defaultSchoolDays, "daily"),
      defaultMissedLessonBehavior: text(preferences.defaultMissedLessonBehavior, "next-occurrence"),
      defaultMaxDailyMinutes: Math.max(30, int(preferences.defaultMaxDailyMinutes, 240)),
      paceMode: normalizedHousehold.paceMode,
      evaluationModel: text(preferences.evaluationModel, "narrative-only"),
      graceModeDefault: graceModeValue(preferences.graceModeDefault, "light"),
      graceModeActive: normalizedHousehold.graceModeActive,
      printPack: text(preferences.printPack, "weekly-household")
    },
    streams,
    subjects,
    books,
    setupTiles,
    familyPlanning,
    formation,
    formationMaterials,
    historyCycle,
    completion: normalizeCompletion(payload.completion),
    starterWeek: payload.starterWeek && typeof payload.starterWeek === "object" ? {
      generatedAt: text(payload.starterWeek.generatedAt, ""),
      enabled: Boolean(payload.starterWeek.enabled)
    } : null,
    coOp
  };
}

export function applySetupSnapshotToSeed(seed = getLearnSeedSnapshot(), setupSnapshot = null, { weekDate = "" } = {}) {
  if (!setupSnapshot) return seed;
  const next = clone(seed);
  next.familyPlanning = clone(setupSnapshot.familyPlanning || { nameDays: [], events: [], meals: [], recipes: [], groceryItems: [], fastingPreference: "guidance" });
  const currentTermId = setupSnapshot.term?.id || setupSnapshot.schoolYear?.currentTermId || setupSnapshot.terms?.[0]?.id || "";
  const forCurrentTerm = (item = {}) => !item.termId || !currentTermId || item.termId === currentTermId;
  const currentSubjects = list(setupSnapshot.subjects).filter(forCurrentTerm);
  const literatureBooks = list(setupSnapshot.books).filter(forCurrentTerm);
  const currentFormationMaterials = list(setupSnapshot.formationMaterials).filter(forCurrentTerm);
  const formation = setupSnapshot.formation || {};
  const isBookResource = (item = {}) => item.resource && item.resourceType === "book";
  const enrichmentBooks = list(formation.enrichmentBlocks).filter(forCurrentTerm).filter(isBookResource).map((block, index) => resourceBookLike({
    id: block.id || `enrichment_book_${index + 1}`,
    title: block.resource,
    category: block.title || block.blockType || block.type || "Enrichment",
    termId: block.termId || currentTermId,
    formLabel: block.formLabel || "",
    audienceLabel: block.planningMode === "forms" ? "Form Enrichment" : "Household Enrichment",
    planningMode: block.planningMode || "family",
    weeklyFrequency: block.weeklyFrequency || block.cadenceLabel || "1x",
    minutes: block.minutesPlanned || block.minutes || "",
    color: block.color || "",
    sourceKind: "enrichment"
  })).filter(Boolean);
  const subjectBooks = currentSubjects.flatMap((subject, subjectIndex) => {
    if (subject.resourceType !== "book") return [];
    const subjectResources = list(subject.resources).length
      ? list(subject.resources)
      : (subject.resource ? [{ title: subject.resource, scheduledWeeks: subject.scheduledWeeks }] : []);
    return subjectResources.map((resource, resourceIndex) => {
      const title = typeof resource === "string" ? resource : resource.title || resource.resource;
      const assignment = typeof resource === "string" ? subject : { ...subject, ...resource };
      return resourceBookLike({
        id: `subject_resource_${subject.id || subjectIndex + 1}_${resourceIndex + 1}`,
        title,
        category: subject.title || subject.subjectType || "Form Subject",
        termId: subject.termId || currentTermId,
        formLabel: assignment.formLabel || "",
        audienceLabel: list(assignment.childIds).length || assignment.childId ? "Child Resource" : "Form Resource",
        planningMode: assignment.planningMode || "forms",
        weeklyFrequency: subject.weeklyFrequency || "1x",
        minutes: subject.minutes || "",
        color: subject.color || "",
        childIds: list(assignment.childIds),
        gradeLabel: assignment.gradeLabel || "",
        formLabels: list(assignment.formLabels),
        scheduledWeeks: list(assignment.scheduledWeeks).length ? assignment.scheduledWeeks : subject.scheduledWeeks,
        weeklyPlans: list(assignment.weeklyPlans).length ? assignment.weeklyPlans : subject.weeklyPlans,
        sourceKind: "form-subject"
      });
    });
  }).filter(Boolean);
  const materialBooks = currentFormationMaterials.map((material, index) => resourceBookLike({
    id: `formation_material_${material.id || index + 1}`,
    title: material.source || material.title,
    author: material.source && material.title ? material.title : "",
    category: material.materialType || "Formation Material",
    termId: material.termId || currentTermId,
    formLabel: material.formLabel || "",
    audienceLabel: material.planningMode === "forms" ? "Form Formation" : "Household Formation",
    planningMode: material.planningMode || "family",
    weeklyFrequency: material.weeklyFrequency || material.cadenceLabel || "1x",
    minutes: material.minutes || "",
    color: material.color || "",
    sourceKind: "formation-material"
  })).filter(Boolean);
  const currentBooks = [...literatureBooks, ...enrichmentBooks, ...subjectBooks, ...materialBooks];
  next.household = { ...next.household, ...setupSnapshot.household };
  next.children = list(setupSnapshot.children);
  next.schoolYear = { ...next.schoolYear, ...setupSnapshot.schoolYear };
  next.term = { ...next.term, ...setupSnapshot.term };
  if (setupSnapshot.historyCycle) {
    next.cycleFramework = {
      ...next.cycleFramework,
      id: setupSnapshot.historyCycle.framework,
      frameworkType: "enrichment",
      title: setupSnapshot.historyCycle.frameworkTitle,
      summary: setupSnapshot.historyCycle.frameworkSummary
    };
    next.cycleYear = {
      ...next.cycleYear,
      id: setupSnapshot.historyCycle.cycleYear,
      cycleFrameworkId: setupSnapshot.historyCycle.framework,
      yearNumber: setupSnapshot.historyCycle.yearNumber,
      title: setupSnapshot.historyCycle.yearTitle
    };
    next.cycleTopics = list(setupSnapshot.historyCycle.enrichmentTopics).map((topic, index) => ({
      id: `cycle_topic_${setupSnapshot.historyCycle.cycleYear}_${index + 1}`,
      cycleYearId: setupSnapshot.historyCycle.cycleYear,
      subjectType: index === 0 ? "history" : index === 1 ? "church-history" : "enrichment",
      title: topic,
      seasonLabel: setupSnapshot.historyCycle.rotation === "second" ? "Second rotation" : "First rotation"
    }));
  }
  next.graceModeRule = {
    ...next.graceModeRule,
    mode: setupSnapshot.preferences?.graceModeActive ? setupSnapshot.preferences?.graceModeDefault || next.graceModeRule?.mode || "light" : "full"
  };
  next.householdStreams = list(setupSnapshot.streams);
  next.books = currentBooks;
  next.libraryBooks = currentBooks.map((book, index) => ({
    ...book,
    ages: "",
    assignment: "Setup",
    progressPercent: rangeProgressPercent(book.startChapter || 1, book.currentChapter || book.startChapter || 1, book.endChapter || book.totalChapters || 0),
    orthodox: false,
    sortOrder: index + 1
  }));
  const householdBooks = currentBooks.filter(bookBelongsToHouseholdStream);
  const childBooks = currentBooks.filter((book) => !bookBelongsToHouseholdStream(book));
  next.currentReadAlouds = (householdBooks.length ? householdBooks : currentBooks).slice(0, 3).map((book) => ({
    ...book,
    subtitle: book.category,
    progressPercent: rangeProgressPercent(book.startChapter || 1, book.currentChapter || book.startChapter || 1, book.endChapter || book.totalChapters || 0),
    assignedTerm: setupSnapshot.term?.label || next.term.label
  }));
  next.bookAssignments = currentBooks.flatMap((book) => {
    const assignedChildren = childrenForAssignment(book, next.children);
    const assignmentType = bookBelongsToHouseholdStream(book) ? "household-read-aloud" : book.formLabel ? "form-reading" : "independent-reading";
    return (assignedChildren.length ? assignedChildren : [null]).map((child) => ({
      id: `assignment_${book.id}_${child?.id || "household"}`,
      bookId: book.id,
      childId: child?.id || null,
      householdId: setupSnapshot.identity?.householdId || next.household.id,
      formLabel: book.formLabel,
      assignmentType,
      progressPercent: rangeProgressPercent(book.startChapter || 1, book.currentChapter || book.startChapter || 1, book.endChapter || book.totalChapters || 0)
    }));
  });
  next.childTracks = currentSubjects.flatMap((subject, index) => {
    const resourceAssignments = list(subject.resources).length
      ? list(subject.resources).map((resource) => ({ ...subject, ...resource, title: subject.title }))
      : [subject];
    return resourceAssignments.flatMap((assignment, assignmentIndex) => {
    const assignedChildren = childrenForAssignment(assignment, next.children);
    return assignedChildren.map((child) => ({
      id: `${subject.id}_${assignmentIndex + 1}_${child.id || index}`,
      childId: child.id,
      subjectType: subject.subjectType,
      title: subject.title,
      formLabel: assignment.formLabel || subject.formLabel
    }));
    });
  }).concat(childBooks.flatMap((book, index) => {
    const assignedChildren = childrenForAssignment(book, next.children);
    return assignedChildren.map((child) => ({
      id: `${book.id}_${child.id || index}`,
      childId: child.id,
      subjectType: "reading",
      title: book.title,
      formLabel: book.formLabel
    }));
  }));
  next.curriculumPackage = {
    ...next.curriculumPackage,
    householdId: setupSnapshot.identity?.householdId || next.household.id,
    title: `${setupSnapshot.household?.name || "Household"} Curriculum`
  };
  next.curriculumPackages = [next.curriculumPackage];
  next.curriculumSubjects = currentSubjects.map((subject, index) => ({
    id: subject.id,
    curriculumPackageId: next.curriculumPackage.id,
    subjectType: subject.subjectType,
    title: subject.title,
    sortOrder: index + 1
  }));
  if (list(formation.churchRhythms).length) {
    next.dashboardDaily = Object.fromEntries(Object.entries(next.dashboardDaily || {}).map(([date, day]) => [
      date,
      { ...day, churchRhythms: list(formation.churchRhythms).map((rhythm) => ({ ...rhythm })) }
    ]));
  }
  if (formation.catechesis?.title) next.catechesisCycles = [formation.catechesis];
  else if (setupSnapshot) next.catechesisCycles = [];
  if (list(formation.recitationTracks).length) next.recitationTracks = list(formation.recitationTracks);
  else if (setupSnapshot) next.recitationTracks = [];
  if (list(formation.hymnStudies).length) next.hymnStudies = list(formation.hymnStudies);
  else if (setupSnapshot) next.hymnStudies = [];
  if (list(formation.enrichmentBlocks).length) next.enrichmentBlocks = list(formation.enrichmentBlocks);
  else if (setupSnapshot) next.enrichmentBlocks = [];
  // Always clear seed fixture logs for real users — they start empty and accumulate from their own data.
  next.narrationLogs = [];
  next.natureJournalEntries = [];
  const structuredFormationMaterials = [
    ...(formation.catechesis?.title ? [{
      id: formation.catechesis.id || "formation_catechesis",
      title: formation.catechesis.title,
      materialType: "Catechesis",
      source: formation.catechesis.source || "",
      cadenceLabel: "Weekly",
      color: ""
    }] : []),
    ...list(formation.hymnStudies).map((hymn) => ({
      id: hymn.id,
      title: hymn.title,
      materialType: "Hymn Study",
      source: hymn.source,
      cadenceLabel: "Weekly",
      color: ""
    })),
    ...list(formation.enrichmentBlocks).map((block) => ({
      id: block.id,
      title: block.title,
      materialType: block.blockType,
      source: "",
      cadenceLabel: block.cadenceLabel,
      color: block.color
    }))
  ];
  const formationMaterialsForPlanning = currentFormationMaterials.length
    ? currentFormationMaterials
    : structuredFormationMaterials;
  next.curriculumResources = [
    ...currentSubjects.flatMap((subject, subjectIndex) => {
      const subjectResources = list(subject.resources).length
        ? list(subject.resources)
        : (subject.resource ? [{ title: subject.resource, scheduledWeeks: subject.scheduledWeeks }] : []);
      return subjectResources.map((resource, resourceIndex) => {
        const title = typeof resource === "string" ? resource : resource.title || resource.resource;
        if (!title) return null;
        return {
          id: `resource_${subject.id || subjectIndex + 1}_${resourceIndex + 1}`,
          curriculumPackageId: next.curriculumPackage.id,
          curriculumSubjectId: subject.id,
          title,
          author: "",
          resourceType: subject.resourceType || subject.subjectType,
          sourceKind: "household",
          sortOrder: subjectIndex * 10 + resourceIndex + 1
        };
      }).filter(Boolean);
    }),
    ...formationMaterialsForPlanning.map((material, index) => ({
      id: material.id,
      curriculumPackageId: next.curriculumPackage.id,
      curriculumSubjectId: null,
      title: material.title,
      author: material.source,
      resourceType: material.materialType,
      sourceKind: "formation",
      sortOrder: index + 100
    }))
  ];
  const weekReference = weekDate && /^\d{4}-\d{2}-\d{2}$/.test(weekDate) ? new Date(`${weekDate}T12:00:00.000Z`) : new Date();
  const currentTermWeek = activeTermWeek(setupSnapshot.term || next.term || {}, weekReference);
  const plannerWeekWindow = currentWeekWindow(weekReference);
  const currentWeekPlan = (item = {}) => text(list(item.weeklyPlans)[Math.max(0, currentTermWeek - 1)], "");
  next.plannerWeek = {
    termWeekNumber: currentTermWeek,
    ...next.plannerWeek,
    ...plannerWeekWindow,
    seasonLabel: setupSnapshot.term?.label || next.plannerWeek.seasonLabel,
    householdRows: [
      ...list(setupSnapshot.streams).map((stream, index) => ({
        id: `week_${stream.id}`,
        streamId: stream.id,
        title: stream.title,
        detail: stream.cadenceLabel,
        priority: index + 1,
        minutes: [0, stream.dailyMinutes?.mon || 0, stream.dailyMinutes?.tue || 0, stream.dailyMinutes?.wed || 0, stream.dailyMinutes?.thu || 0, stream.dailyMinutes?.fri || 0, 0],
        statuses: ["empty", "planned", "planned", "planned", "planned", "planned", "empty"]
      })),
      ...householdBooks.map((book, index) => ({
        id: `week_household_book_${book.id}`,
        streamId: book.id,
        title: book.audienceLabel === "Morning Basket" ? book.title : `Read-Aloud: ${book.title}`,
        detail: `${book.author || book.category}${book.endChapter ? ` • chapters ${book.startChapter || 1}-${book.endChapter}` : ""}${book.weeklyFrequency ? ` • ${book.weeklyFrequency}` : ""}`,
        priority: 50 + index,
        gracePriority: book.gracePriority || "reduce first",
        graceNote: book.graceNote || "Reading moved into the reserve basket.",
        ...weeklyPlanArrays(book.weeklyFrequency, book.minutes || 20, scheduledThisTermWeek(book, currentTermWeek))
      })),
      ...list(formation.enrichmentBlocks).filter(forCurrentTerm).map((block, index) => ({
        id: `week_enrichment_${block.id}`,
        sourceId: block.id,
        kind: "enrichment",
        title: block.title,
        detail: `${block.resource || block.blockType || "Enrichment"}${currentWeekPlan(block) ? ` • ${currentWeekPlan(block)}` : ""}${block.weeklyFrequency ? ` • ${block.weeklyFrequency}` : ""}`,
        groupLabel: block.planningMode === "forms" ? list(block.formLabels).length ? block.formLabels.join(", ") : block.formLabel || block.gradeLabel || "Form Enrichment" : "Everyone Together",
        planningMode: block.planningMode || "family",
        href: /literature|read-aloud|read aloud/i.test(`${block.blockType} ${block.title}`) ? "/myagapay/learn/books" : "/myagapay/learn/formation",
        priority: block.priorityLevel === "essential" ? 10 : block.priorityLevel === "important" ? 40 : block.priorityLevel === "optional" ? 95 : 70,
        priorityLevel: block.priorityLevel,
        gracePriority: gracePriorityValue(block.gracePriority, "medium"),
        instructionMode: block.instructionMode,
        missedLessonBehavior: block.missedLessonBehavior,
        color: block.color,
        graceNote: block.graceNote || "Deferred gracefully to the reserve list.",
        ...planArraysForItem(block, currentTermWeek, plannerWeekWindow.dates)
      }))
    ],
    childRows: [
      ...currentSubjects.flatMap((subject, index) => {
        const resourceAssignments = list(subject.resources).length
          ? list(subject.resources).map((resource, resourceIndex) => ({ ...subject, ...resource, resourceTitle: resource.title || resource.resource || subject.resource, resourceIndex }))
          : [{ ...subject, resourceTitle: subject.resource, resourceIndex: 0 }];
        return resourceAssignments.flatMap((assignment) => {
          const assignmentFormLabels = (assignment.formLabels?.length ? assignment.formLabels : subject.formLabels) || [];
          const hasChildIds = Array.isArray(assignment.childIds) && assignment.childIds.length;
          // For form-based planning: produce one row per form label regardless of
          // whether a child with that exact label exists. The planner pool shows
          // subjects to schedule; it doesn't require a matched child record.
          // For child-specific planning: filter to the named children only.
          let rowSlots;
          if (hasChildIds) {
            // Specific children — must match
            const matchedChildren = childrenForAssignment(assignment, next.children);
            rowSlots = matchedChildren.map((child) => ({ child, formLabelOverride: null }));
          } else if (assignmentFormLabels.length) {
            // Form-based — one slot per form label; try to find a matching child but don't require one
            rowSlots = assignmentFormLabels.map((label) => {
              const matchedChild = next.children.find((c) => c.formLabel === label || c.gradeLabel === label) || null;
              return { child: matchedChild, formLabelOverride: label };
            });
          } else {
            // No labels — treat as family/household (produce one row, no child)
            rowSlots = [{ child: null, formLabelOverride: null }];
          }
          return rowSlots.map(({ child, formLabelOverride }) => ({
          id: `week_${subject.id}_${assignment.resourceIndex + 1}_${formLabelOverride || child?.id || "household"}`,
          sourceId: subject.id,
          resourceIndex: assignment.resourceIndex,
          childId: child?.id || null,
          childIds: subject.childIds || [],
          planningMode: assignmentFormLabels.length ? "forms" : (subject.planningMode || "forms"),
          formLabels: formLabelOverride ? [formLabelOverride] : assignmentFormLabels,
          title: subject.title,
          detail: `${assignment.resourceTitle || subject.cadenceLabel}${currentWeekPlan(assignment) ? ` • ${currentWeekPlan(assignment)}` : ""}${subject.endNumber ? ` (${subject.progressionType} ${subject.startNumber || 1}-${subject.endNumber})` : ""}${subject.weeklyFrequency ? ` • ${subject.weeklyFrequency}` : ""}`,
          priority: subject.priorityLevel === "essential" ? index : subject.priorityLevel === "important" ? 30 + index : subject.priorityLevel === "optional" ? 100 + index : 70 + index,
          priorityLevel: subject.priorityLevel,
          gracePriority: gracePriorityValue(subject.gracePriority, "core"),
          instructionMode: subject.instructionMode,
          missedLessonBehavior: subject.missedLessonBehavior,
          color: subject.color,
          graceNote: subject.graceNote || "Deferred gracefully to the reserve list.",
          graceModeApplied: setupSnapshot.preferences?.graceModeActive && gracePriorityValue(subject.gracePriority, "core") !== "core",
          ...planArraysForItem(assignment, currentTermWeek, plannerWeekWindow.dates)
        }));
        });
      }),
      ...childBooks.flatMap((book, index) => {
        const assignedChildren = childrenForAssignment(book, next.children);
        return assignedChildren.map((child) => ({
          id: `week_${book.id}_${child.id}`,
          childId: child.id,
          title: book.title,
          detail: `${book.author || book.category}${book.endChapter ? ` (chapters ${book.startChapter || 1}-${book.endChapter})` : ""}${book.weeklyFrequency ? ` • ${book.weeklyFrequency}` : ""}`,
          priority: index + 100,
          color: book.color,
          gracePriority: book.gracePriority || "bump if needed",
          graceNote: book.graceNote || "Reading moved into the reserve basket.",
          graceModeApplied: setupSnapshot.preferences?.graceModeActive && (book.gracePriority || "bump if needed") !== "keep",
          ...weeklyPlanArrays(book.weeklyFrequency, book.minutes || 20, scheduledThisTermWeek(book, currentTermWeek))
        }));
      })
    ]
  };
  next.termSetup = {
    ...next.termSetup,
    termOptions: list(setupSnapshot.terms).length ? list(setupSnapshot.terms) : [{ ...next.term }],
    activeTermId: currentTermId || next.term?.id || "",
    setupCards: [
      { id: "setup_children", title: "Children", value: String(next.children.length), detail: "Active homeschool children" },
      { id: "setup_subjects", title: "Subjects", value: String(currentSubjects.length), detail: "Configured curriculum tracks" },
      { id: "setup_books", title: "Books", value: String(currentBooks.length), detail: "Living books and read-alouds" },
      { id: "setup_formation", title: "Formation", value: String(formationMaterialsForPlanning.length + list(formation.recitationTracks).length), detail: "Catechesis, hymns, and memory work" }
    ],
    childTrackSummary: next.children.map((child) => ({
      childId: child.id,
      tracks: next.childTracks
        .filter((track) => track.childId === child.id)
        .map((track) => `${track.subjectType === "reading" ? "Reading" : track.subjectType}: ${track.title}`)
    })),
    pacingRows: [
      ...currentBooks.filter((book) => book.endChapter).map((book) => ({
        id: `pace_${book.id}`,
        label: book.title,
        subtitle: `${book.author || book.category} • chapters ${book.startChapter || 1}-${book.endChapter}`,
        color: book.color,
        segments: distributeRangeSegments({ label: "Ch.", start: book.startChapter || 1, end: book.endChapter, color: book.color })
      })),
      ...currentSubjects.filter((subject) => subject.endNumber).map((subject) => ({
        id: `pace_${subject.id}`,
        label: subject.title,
        subtitle: `${subject.resource || subject.subjectType} • ${subject.progressionType} ${subject.startNumber || 1}-${subject.endNumber}`,
        color: subject.color,
        segments: distributeRangeSegments({ label: subject.progressionType, start: subject.startNumber || 1, end: subject.endNumber, color: subject.color })
      })),
      ...formationMaterialsForPlanning.map((material) => ({
        id: `pace_${material.id}`,
        label: material.materialType,
        subtitle: material.title,
        color: material.color,
        segments: [{ title: material.title, start: 1, span: 12, color: material.color }]
      }))
    ],
    graceReserve: [
      ...currentSubjects.filter((subject) => setupSnapshot.preferences?.graceModeActive && gracePriorityValue(subject.gracePriority, "core") !== "core").map((subject) => ({
        title: subject.title,
        note: subject.graceNote,
        color: subject.color
      })),
      ...currentBooks.filter((book) => setupSnapshot.preferences?.graceModeActive).map((book) => ({
        title: book.title,
        note: book.graceNote,
        color: book.color
      }))
    ]
  };
  next.setupSnapshot = setupSnapshot;
  return next;
}

export async function loadLearnSetupSnapshotForIdentity(env, identity) {
  if (!identity?.householdId) return null;
  if (!d1(env)) return devSetupSnapshots.get(identity.householdId) || null;
  try {
    const row = await d1First(env, "SELECT data FROM learn_households WHERE id = ?1", identity.householdId);
    const snapshot = safeParseJsonRow(row)?.setupSnapshot || null;
    if (snapshot) return snapshot;
  } catch {
    // Fall back to KV while Learn D1 migrations are being rolled out.
  }
  if (env.AGAPAY_REGISTRATIONS) {
    const stored = await env.AGAPAY_REGISTRATIONS.get(setupKvKey(identity));
    return parseStoredSetup(stored)?.setupSnapshot || null;
  }
  return null;
}

export async function loadLearnSetupSnapshot(env, request) {
  const identity = await learnSetupIdentity(request, env);
  if (!identity) return null;
  return loadLearnSetupSnapshotForIdentity(env, identity);
}

export async function saveLearnCompletion(env, request, payload = {}) {
  const identity = await learnSetupIdentity(request, env);
  if (!identity) return { ok: false, status: 401, error: "Unauthorized" };
  const current = await loadLearnSetupSnapshotForIdentity(env, identity);
  if (!current) return { ok: false, status: 400, error: "Complete Learn setup before tracking progress." };

  const scope = payload.scope === "daily" ? "daily" : payload.scope === "weekly" ? "weekly" : "";
  const itemId = text(payload.itemId, "");
  const civilDate = /^\d{4}-\d{2}-\d{2}$/.test(String(payload.civilDate || "")) ? String(payload.civilDate) : nowIso().slice(0, 10);
  if (!scope || !/^[a-zA-Z0-9:_-]{1,180}$/.test(itemId)) {
    return { ok: false, status: 400, error: "Progress item was invalid." };
  }

  const date = new Date(`${civilDate}T12:00:00Z`);
  if (scope === "weekly") date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  const periodKey = date.toISOString().slice(0, 10);
  const completion = normalizeCompletion(current.completion);
  completion[scope][periodKey] = {
    ...(completion[scope][periodKey] || {}),
    [itemId]: Boolean(payload.completed)
  };
  const setupSnapshot = {
    ...current,
    savedAt: nowIso(),
    completion: normalizeCompletion(completion)
  };
  const householdData = JSON.stringify({ ownerEmail: identity.email, setupSnapshot });

  if (!d1(env)) {
    devSetupSnapshots.set(identity.householdId, setupSnapshot);
  } else {
    try {
      await d1Run(env, "UPDATE learn_households SET data = ?1, updated_at = ?2 WHERE id = ?3", householdData, setupSnapshot.savedAt, identity.householdId);
    } catch {
      // D1 write failed — KV below is the fallback source of truth.
    }
  }
  if (env.AGAPAY_REGISTRATIONS) await env.AGAPAY_REGISTRATIONS.put(setupKvKey(identity), householdData);
  return { ok: true, setupSnapshot, scope, periodKey, itemId, completed: Boolean(payload.completed) };
}

export async function getLearnSeedForIdentity(env, identity, { termId = "", weekDate = "" } = {}) {
  if (!identity) return null;
  let setupSnapshot = await loadLearnSetupSnapshotForIdentity(env, identity);
  const selectedTerm = setupSnapshot?.terms?.find((term) => term.id === termId);
  if (selectedTerm) {
    setupSnapshot = {
      ...clone(setupSnapshot),
      schoolYear: { ...setupSnapshot.schoolYear, currentTermId: selectedTerm.id },
      term: { ...selectedTerm }
    };
  }
  const seed = applySetupSnapshotToSeed(getLearnSeedSnapshot(), setupSnapshot, { weekDate });
  const academicSnapshot = await loadLearnAcademicSnapshot(env, identity.householdId);
  seed.closedAcademicRecords = academicSnapshot.academicRecords;
  seed.closedReportCards = academicSnapshot.reportCards;
  return seed;
}

export async function getLearnSeedForRequest(env, request) {
  return getLearnSeedForIdentity(env, await learnSetupIdentity(request, env));
}

async function bestEffort(statement) {
  try {
    await statement();
  } catch {
    // Local development databases can lag migrations; the setup snapshot remains the source of truth.
  }
}

export async function saveLearnSetup(env, request, payload) {
  const identity = await learnSetupIdentity(request, env);
  if (!identity) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  const setupSnapshot = normalizeSetupPayload(payload, identity);
  if (setupSnapshot.children.length > LEARN_FREE_CHILD_LIMIT && !(await learnRequestHasFamilyAccessAsync(request, env, identity))) {
    return {
      ok: false,
      status: 402,
      error: `The free AGAPAY Learn plan supports up to ${LEARN_FREE_CHILD_LIMIT} children. Upgrade to the Family plan to save larger households.`
    };
  }
  const timestamp = setupSnapshot.savedAt;
  if (!d1(env)) {
    devSetupSnapshots.set(identity.householdId, setupSnapshot);
    return {
      ok: true,
      setupSnapshot,
      onboarding: applySetupSnapshotToSeed(getLearnSeedSnapshot(), setupSnapshot),
      storage: "memory"
    };
  }
  const householdData = JSON.stringify({
    ownerEmail: identity.email,
    setupSnapshot
  });

  try {
    await d1Run(
      env,
      `INSERT INTO learn_households (id, slug, name, household_size, liturgical_calendar_type, pace_mode, grace_mode_active, data, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         household_size = excluded.household_size,
         liturgical_calendar_type = excluded.liturgical_calendar_type,
         pace_mode = excluded.pace_mode,
         grace_mode_active = excluded.grace_mode_active,
         data = excluded.data,
         updated_at = excluded.updated_at`,
      identity.householdId,
      slug(setupSnapshot.household.name, identity.householdId),
      setupSnapshot.household.name,
      setupSnapshot.children.length,
      setupSnapshot.preferences.calendarType,
      setupSnapshot.preferences.paceMode,
      setupSnapshot.preferences.graceModeActive ? 1 : 0,
      householdData,
      timestamp
    );
  } catch (error) {
    if (!env.AGAPAY_REGISTRATIONS) throw error;
    await env.AGAPAY_REGISTRATIONS.put(setupKvKey(identity), householdData);
    return {
      ok: true,
      setupSnapshot,
      onboarding: applySetupSnapshotToSeed(getLearnSeedSnapshot(), setupSnapshot),
      storage: "kv-fallback"
    };
  }
  if (env.AGAPAY_REGISTRATIONS) {
    await env.AGAPAY_REGISTRATIONS.put(setupKvKey(identity), householdData);
  }

  await bestEffort(async () => {
    await d1Run(env, "DELETE FROM learn_child_tracks WHERE child_id IN (SELECT id FROM learn_children WHERE household_id = ?1)", identity.householdId);
    await d1Run(env, "DELETE FROM learn_children WHERE household_id = ?1", identity.householdId);
    for (const child of setupSnapshot.children) {
      await d1Run(
        env,
        `INSERT INTO learn_children (id, household_id, first_name, age_years, grade_label, active, data, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?7, ?7)`,
        child.id,
        identity.householdId,
        child.firstName,
        child.ageYears,
        child.gradeLabel,
        JSON.stringify(child),
        timestamp
      );
    }
  });

  await bestEffort(async () => {
    await d1Run(env, "DELETE FROM learn_household_streams WHERE household_id = ?1", identity.householdId);
    for (const stream of setupSnapshot.streams) {
      await d1Run(
        env,
        `INSERT INTO learn_household_streams (id, household_id, stream_type, title, cadence_label, data, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)`,
        stream.id,
        identity.householdId,
        stream.streamType,
        stream.title,
        stream.cadenceLabel,
        JSON.stringify(stream),
        timestamp
      );
    }
  });

  await bestEffort(async () => {
    await d1Run(env, "DELETE FROM learn_book_assignments WHERE book_id IN (SELECT id FROM learn_books WHERE household_id = ?1)", identity.householdId);
    await d1Run(env, "DELETE FROM learn_books WHERE household_id = ?1", identity.householdId);
    for (const book of setupSnapshot.books) {
      await d1Run(
        env,
        `INSERT INTO learn_books (id, household_id, title, author, category, audience_label, data, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)`,
        book.id,
        identity.householdId,
        book.title,
        book.author,
        book.category,
        "Household",
        JSON.stringify(book),
        timestamp
      );
    }
  });

  await bestEffort(async () => {
    await d1Run(env, "DELETE FROM learn_terms WHERE school_year_id IN (SELECT id FROM learn_school_years WHERE household_id = ?1)", identity.householdId);
    await d1Run(env, "DELETE FROM learn_school_years WHERE household_id = ?1", identity.householdId);
    await d1Run(
      env,
      `INSERT INTO learn_school_years (id, household_id, label, start_date, end_date, current_term_id, data, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)`,
      setupSnapshot.schoolYear.id,
      identity.householdId,
      setupSnapshot.schoolYear.label,
      setupSnapshot.schoolYear.startDate,
      setupSnapshot.schoolYear.endDate,
      setupSnapshot.schoolYear.currentTermId || setupSnapshot.term.id,
      JSON.stringify(setupSnapshot.schoolYear),
      timestamp
    );
    for (const term of list(setupSnapshot.terms).length ? list(setupSnapshot.terms) : [setupSnapshot.term]) {
      await d1Run(
        env,
        `INSERT INTO learn_terms (id, school_year_id, label, start_date, end_date, pace_mode, data, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)`,
        term.id,
        setupSnapshot.schoolYear.id,
        term.label,
        term.startDate,
        term.endDate,
        term.paceMode,
        JSON.stringify(term),
        timestamp
      );
    }
  });

  return {
    ok: true,
    setupSnapshot,
    onboarding: applySetupSnapshotToSeed(getLearnSeedSnapshot(), setupSnapshot)
  };
}

export async function saveLearnFamilyPlanning(env, request, payload = {}) {
  const identity = await learnSetupIdentity(request, env);
  if (!identity) return { ok: false, status: 401, error: "Unauthorized" };
  const current = await loadLearnSetupSnapshotForIdentity(env, identity);
  if (!current) return { ok: false, status: 409, error: "Complete Learn setup before saving the family planner." };
  const childNameDays = new Map(list(payload.childNameDays).map((entry) => [text(entry.childId, ""), text(entry.nameDay, "")]));
  return saveLearnSetup(env, request, {
    ...current,
    household: {
      ...current.household,
      motherName: text(payload.household?.motherName, current.household?.motherName || ""),
      motherNameDay: text(payload.household?.motherNameDay, current.household?.motherNameDay || ""),
      fatherName: text(payload.household?.fatherName, current.household?.fatherName || ""),
      fatherNameDay: text(payload.household?.fatherNameDay, current.household?.fatherNameDay || ""),
      parishPatronalFeastName: text(payload.household?.parishPatronalFeastName, current.household?.parishPatronalFeastName || ""),
      parishPatronalFeastDate: text(payload.household?.parishPatronalFeastDate, current.household?.parishPatronalFeastDate || "")
    },
    children: list(current.children).map((child) => ({
      ...child,
      nameDay: childNameDays.has(child.id) ? childNameDays.get(child.id) : child.nameDay || ""
    })),
    familyPlanning: payload.familyPlanning || current.familyPlanning || {}
  });
}

export async function saveLearnGraceMode(env, request, payload = {}) {
  const identity = await learnSetupIdentity(request, env);
  if (!identity) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  const current = await loadLearnSetupSnapshotForIdentity(env, identity);
  const nextPreferences = {
    ...(current?.preferences || {}),
    graceModeDefault: graceModeValue(payload.mode || payload.graceModeDefault || current?.preferences?.graceModeDefault || "light"),
    graceModeActive: Boolean(payload.active ?? payload.graceModeActive ?? true)
  };
  const nextPayload = current ? {
    household: {
      ...current.household,
      graceModeActive: nextPreferences.graceModeActive
    },
    schoolYear: current.schoolYear,
    term: current.term,
    terms: current.terms,
    preferences: nextPreferences,
    children: current.children,
    streams: current.streams,
    subjects: current.subjects,
    books: current.books,
    formation: current.formation,
    formationMaterials: current.formationMaterials,
    coOp: current.coOp
  } : {
    household: {
      id: identity.householdId,
      name: "Your Household",
      graceModeActive: nextPreferences.graceModeActive
    },
    preferences: nextPreferences
  };
  return saveLearnSetup(env, request, nextPayload);
}

// Save a single lesson block edit (note, reschedule, or completion) to the setup snapshot.
// Accepts: { action: "note"|"reschedule"|"complete", blockId, note, fromDate, toDate, completed }
export async function saveLearnPlannerBlock(env, request, payload = {}) {
  const identity = await learnSetupIdentity(request, env);
  if (!identity) return { ok: false, status: 401, error: "Unauthorized" };
  const current = await loadLearnSetupSnapshotForIdentity(env, identity);
  if (!current) return { ok: false, status: 409, error: "Complete Learn setup before editing lesson blocks." };

  const action = text(payload.action, "");
  const blockId = text(payload.blockId, "");
  if (!action || !blockId) return { ok: false, status: 400, error: "action and blockId are required." };

  const blockEdits = clone(current.blockEdits || {});

  if (action === "note") {
    blockEdits[blockId] = { ...(blockEdits[blockId] || {}), note: text(payload.note, ""), updatedAt: nowIso() };
  } else if (action === "reschedule") {
    const fromDate = text(payload.fromDate, "");
    const toDate = text(payload.toDate, "");
    if (!fromDate || !toDate) return { ok: false, status: 400, error: "fromDate and toDate are required for reschedule." };
    blockEdits[blockId] = { ...(blockEdits[blockId] || {}), rescheduledFrom: fromDate, rescheduledTo: toDate, updatedAt: nowIso() };
  } else if (action === "complete") {
    const civilDate = /^\d{4}-\d{2}-\d{2}$/.test(String(payload.civilDate || "")) ? String(payload.civilDate) : nowIso().slice(0, 10);
    const scope = payload.scope === "daily" ? "daily" : "weekly";
    const date = new Date(`${civilDate}T12:00:00Z`);
    if (scope === "weekly") date.setUTCDate(date.getUTCDate() - date.getUTCDay());
    const periodKey = date.toISOString().slice(0, 10);
    const completion = normalizeCompletion(current.completion);
    completion[scope][periodKey] = { ...(completion[scope][periodKey] || {}), [blockId]: Boolean(payload.completed) };
    return saveLearnSetup(env, request, { ...current, blockEdits, completion: normalizeCompletion(completion) });
  } else {
    return { ok: false, status: 400, error: `Unknown action "${action}". Valid: note, reschedule, complete.` };
  }

  return saveLearnSetup(env, request, { ...current, blockEdits });
}
