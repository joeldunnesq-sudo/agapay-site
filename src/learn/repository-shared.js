// Generated from src/learn/repository-shared.ts by npm run build:server. Do not edit.
import { calendarLabel } from '../liturgical-calendar.js';
import './academic-exports.js';
import './academic-records.js';
import { getLearnSeedSnapshot } from './demo-data.js';
import { SeedLiturgicalSource } from './liturgical-source.js';
import './planner-overrides.js';
import './print-documents.js';
import './setup-persistence.js';
import { buildAgapayLiturgicalDays, buildPlannerWeek } from './repository-planner.js';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DEFAULT_FAMILY_RECIPES = [
  {
    id: 'agapay_recipe_lentil_vegetable_soup',
    title: 'Lenten Lentil Vegetable Soup',
    fastingType: 'fast-friendly',
    category: 'Soup',
    sourceUrl: '',
    ingredients:
      'Lentils, carrots, celery, onion, garlic, crushed tomatoes, vegetable broth, olive oil, bay leaf, parsley',
    instructions:
      'Saute onion, carrot, celery, and garlic. Add lentils, tomatoes, broth, and bay leaf. Simmer until tender, then finish with parsley. Serve with bread or rice.',
  },
  {
    id: 'agapay_recipe_chickpea_sheet_pan',
    title: 'Sheet Pan Chickpeas and Vegetables',
    fastingType: 'fast-friendly',
    category: 'Dinner',
    sourceUrl: '',
    ingredients:
      'Chickpeas, sweet potatoes, broccoli or cauliflower, red onion, olive oil, lemon, garlic, paprika, salt',
    instructions:
      'Roast chickpeas and chopped vegetables with olive oil, lemon, garlic, and paprika until crisp at the edges. Serve over rice, couscous, or greens.',
  },
  {
    id: 'agapay_recipe_black_bean_tacos',
    title: 'Black Bean Tacos with Cabbage Slaw',
    fastingType: 'fast-friendly',
    category: 'Quick Dinner',
    sourceUrl: '',
    ingredients: 'Black beans, corn tortillas, cabbage, lime, avocado, salsa, cumin, garlic, cilantro',
    instructions:
      'Warm black beans with cumin and garlic. Toss cabbage with lime and salt. Serve in warm tortillas with salsa, avocado, and cilantro.',
  },
  {
    id: 'agapay_recipe_mediterranean_pasta',
    title: 'Mediterranean Pantry Pasta',
    fastingType: 'adaptable',
    category: 'Pantry Meal',
    sourceUrl: '',
    ingredients: 'Pasta, chickpeas or white beans, spinach, olives, tomatoes, garlic, olive oil, lemon, optional feta',
    instructions:
      'Cook pasta and toss with garlic, beans, spinach, tomatoes, olives, olive oil, and lemon. Add feta on non-fasting days if desired.',
  },
  {
    id: 'agapay_recipe_salmon_rice_bowls',
    title: 'Salmon Rice Bowls',
    fastingType: 'adaptable',
    category: 'Fish Day',
    sourceUrl: '',
    ingredients: 'Salmon, rice, cucumber, carrots, avocado, soy sauce or coconut aminos, sesame seeds, lemon',
    instructions:
      'Bake salmon and serve over rice with sliced vegetables. Add lemon, soy sauce, and sesame seeds. Use on fish-allowed fasting days or regular days.',
  },
  {
    id: 'agapay_recipe_chicken_rice_soup',
    title: 'Chicken and Rice Soup',
    fastingType: 'regular',
    category: 'Soup',
    sourceUrl: '',
    ingredients: 'Chicken, rice, carrots, celery, onion, garlic, chicken broth, parsley, lemon',
    instructions:
      'Simmer chicken with vegetables and broth. Add rice until tender, shred the chicken, and finish with parsley and lemon.',
  },
  {
    id: 'agapay_recipe_turkey_sweet_potato_chili',
    title: 'Turkey Sweet Potato Chili',
    fastingType: 'regular',
    category: 'Batch Cook',
    sourceUrl: '',
    ingredients: 'Ground turkey, sweet potatoes, beans, crushed tomatoes, onion, garlic, chili powder, cumin',
    instructions:
      'Brown turkey with onion and garlic. Add sweet potatoes, beans, tomatoes, and spices. Simmer until the sweet potatoes are tender.',
  },
  {
    id: 'agapay_recipe_egg_veggie_bake',
    title: 'Simple Egg and Veggie Bake',
    fastingType: 'regular',
    category: 'Breakfast',
    sourceUrl: '',
    ingredients: 'Eggs, spinach, bell pepper, onion, milk, cheese, salt, pepper',
    instructions:
      'Whisk eggs with milk, vegetables, and cheese. Bake in a greased dish until set. Slice for breakfasts or quick lunches.',
  },
];
const GRACE_PRIORITY_RANKS = {
  core: 0,
  'always keep': 0,
  keep: 0,
  high: 1,
  important: 1,
  medium: 2,
  'reduce first': 2,
  shorten: 2,
  helpful: 2,
  low: 3,
  optional: 3,
  'bump if needed': 3,
  'defer if needed': 3,
  'defer in minimum': 3,
  'minimum only': 3,
};
const GRACE_MODE_CAPS = {
  light: { child: 4, household: 3, shortenKeptWork: false },
  'minimum viable': { child: 2, household: 1, shortenKeptWork: true },
};
class SeedLiturgicalRepository {
  constructor(seed = getLearnSeedSnapshot()) {
    this.seed = seed;
    this.source = new SeedLiturgicalSource(seed);
  }
  listWeek(calendarType = 'julian') {
    return this.source.listRange({ calendarType });
  }
  getDay(civilDate, calendarType = 'julian') {
    return this.source.getDay({ civilDate, calendarType });
  }
}
class SeedFutureRecordsRepository {
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
function familyPlanningWithDefaultRecipes(planning = {}) {
  const recipes =
    Array.isArray(planning.recipes) && planning.recipes.length ? planning.recipes : DEFAULT_FAMILY_RECIPES;
  return {
    nameDays: [],
    events: [],
    meals: [],
    groceryItems: [],
    chores: [],
    fastingPreference: 'guidance',
    ...planning,
    recipes,
  };
}
function patronalFeastForDate(seed = {}, civilDate = '') {
  const household = seed.setupSnapshot?.household || seed.household || {};
  const feastDate = String(household.parishPatronalFeastDate || household.patronalFeastDate || '').trim();
  const monthDay = /^\d{4}-\d{2}-\d{2}$/.test(feastDate) ? feastDate.slice(5) : feastDate;
  if (!monthDay || String(civilDate || '').slice(5) !== monthDay) return null;
  const parishName = household.parishName || 'your parish';
  return {
    id: 'parish_patronal_feast',
    title: household.parishPatronalFeastName || `${parishName} patronal feast`,
    rank: 'Patronal Feast',
    note: `${parishName} patronal feast`,
  };
}
function weekStartSundayIso(civilDate = /* @__PURE__ */ new Date().toISOString().slice(0, 10)) {
  const date = /* @__PURE__ */ new Date(`${civilDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date.toISOString().slice(0, 10);
}
function completionStatus(seed, scope, civilDate, itemId, fallback = 'planned') {
  const periodKey = scope === 'daily' ? civilDate : weekStartSundayIso(civilDate);
  const bucket = seed.setupSnapshot?.completion?.[scope]?.[periodKey];
  if (bucket && Object.prototype.hasOwnProperty.call(bucket, itemId)) return bucket[itemId] ? 'completed' : 'planned';
  return fallback;
}
function buildHouseholdStreamCards(seed, daily, civilDate) {
  const streamLookup = new Map(seed.householdStreams.map((stream) => [stream.id, stream]));
  const setupRows = (seed.plannerWeek?.householdRows || []).filter((row) => row.kind === 'enrichment');
  const blocks = setupRows.length
    ? setupRows.map((row) => ({
        ...row,
        subtitle: row.detail,
        minutesPlanned: row.minutes?.find((minutes) => Number(minutes) > 0) || 0,
        status: row.statuses?.includes('completed') ? 'completed' : 'planned',
      }))
    : daily.householdBlocks?.length
      ? daily.householdBlocks
      : seed.householdStreams.map((stream, index) => ({
          id: `stream_${stream.id || index}`,
          householdStreamId: stream.id,
          title: stream.title,
          subtitle: stream.cadenceLabel || stream.streamType || 'Household rhythm',
          minutesPlanned: stream.minutesPlanned || 20,
          status: stream.status || 'planned',
        }));
  return blocks.map((block) => {
    const stream = streamLookup.get(block.householdStreamId);
    return {
      id: block.id,
      streamType: stream?.streamType || '',
      title: block.title,
      subtitle: block.subtitle,
      groupLabel: block.groupLabel || (block.planningMode === 'forms' ? 'Form Enrichment' : 'Everyone Together'),
      href:
        block.href ||
        (/read|literature/i.test(`${block.title} ${block.subtitle}`)
          ? '/myagapay/learn/books'
          : '/myagapay/learn/formation'),
      cadenceLabel: stream?.cadenceLabel || '',
      minutesPlanned: block.minutesPlanned,
      status: completionStatus(seed, 'weekly', civilDate, block.id, block.status),
    };
  });
}
function progressFromTerm(term = {}, civilDate = '') {
  const start = /* @__PURE__ */ new Date(`${term.startDate || ''}T12:00:00`);
  const end = /* @__PURE__ */ new Date(`${term.endDate || ''}T12:00:00`);
  const current = /* @__PURE__ */ new Date(`${civilDate || ''}T12:00:00`);
  if ([start, end, current].some((date) => Number.isNaN(date.getTime())) || end <= start) {
    return {
      label: term.label || 'Current Term',
      description: term.description || '',
      currentWeek: 0,
      totalWeeks: 0,
      percent: 0,
      dateRange: [term.startDate, term.endDate].filter(Boolean).join(' - '),
    };
  }
  const totalWeeks = term.weeksCount
    ? Math.max(1, Math.min(24, Number(term.weeksCount)))
    : Math.max(1, Math.ceil((Number(end) - Number(start) + 1) / (7 * 24 * 60 * 60 * 1e3)));
  const currentWeek = Math.max(
    1,
    Math.min(totalWeeks, Math.floor((Number(current) - Number(start)) / (7 * 24 * 60 * 60 * 1e3)) + 1)
  );
  return {
    label: term.label || 'Current Term',
    description: term.description || '',
    currentWeek,
    totalWeeks,
    percent: Math.round((currentWeek / totalWeeks) * 100),
    dateRange: [term.startDate, term.endDate].filter(Boolean).join(' - '),
  };
}
function computeWeeklySummary(seed, calendarType, civilDate = /* @__PURE__ */ new Date().toISOString().slice(0, 10)) {
  const week = buildPlannerWeek(seed, calendarType);
  const rows = [...(week.householdRows || []), ...(week.childRows || [])];
  const statuses = rows
    .flatMap((row) => {
      const completed = completionStatus(seed, 'weekly', civilDate, row.id, 'planned') === 'completed';
      return (row.statuses || []).map((status) =>
        completed && status !== 'empty' && status !== 'rest' ? 'completed' : status
      );
    })
    .filter((status) => status && status !== 'rest');
  const lessonsPlanned = statuses.filter((status) => status !== 'empty').length;
  const lessonsCompleted = statuses.filter((status) => status === 'completed').length;
  const upcomingFeasts = buildUpcomingFeasts(
    seed,
    calendarType,
    week.dates?.[0] || /* @__PURE__ */ new Date().toISOString().slice(0, 10)
  );
  const readAloud = seed.currentReadAlouds?.[0] || seed.books?.[0] || {};
  return {
    lessonsCompleted,
    lessonsPlanned,
    lessonsCompletionPercent: lessonsPlanned ? Math.round((lessonsCompleted / lessonsPlanned) * 100) : 0,
    narrationsLogged: seed.narrationLogs?.length || 0,
    feastDaysAhead: upcomingFeasts.length,
    nextFeastLabel: upcomingFeasts[0]?.title || 'No upcoming feast loaded',
    readAloudProgressPercent: Number(readAloud.progressPercent || 0),
    readAloudTitle: readAloud.title || 'Add a read-aloud in Setup',
  };
}
function buildChildColumns(seed, daily, civilDate) {
  const childLookup = new Map(seed.children.map((child) => [child.id, child]));
  const columns =
    !seed.setupSnapshot && daily.childColumns?.length
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
              status: row.statuses?.find((status) => status && status !== 'empty') || 'planned',
            })),
        }));
  return columns.map((column) => ({
    child: childLookup.get(column.childId),
    blocks: column.blocks.map((block) => ({
      id: block.id,
      title: block.title,
      subtitle: block.subtitle,
      minutesPlanned: block.minutesPlanned,
      status: completionStatus(seed, 'weekly', civilDate, block.id, block.status),
    })),
  }));
}
function isImportantUpcomingFeast(entry = {}) {
  const rank = String(entry.feastRank || '').trim();
  const title = String(entry.feastTitle || '').trim();
  const text = `${rank} ${title}`.toLowerCase();
  if (!title || /daily rhythm|ordinary day|daily commemoration/.test(rank.toLowerCase())) {
    return false;
  }
  return /(?:^|\b)(great feast|major feast|twelve great|vigil|polyeleos|doxology|patronal feast|apostle|apostles|equal[- ]to[- ]the[- ]apostles|nativity|forerunner|theotokos|mother of god|ascension|pentecost|transfiguration|annunciation|presentation|meeting of the lord|exaltation|elevation of the cross|dormition|theophany|epiphany|pascha|resurrection of christ|circumcision of the lord|protection of the theotokos)(?:\b|$)/.test(
    text
  );
}
function buildUpcomingFeasts(seed, calendarType, fromDate = /* @__PURE__ */ new Date().toISOString().slice(0, 10)) {
  return buildAgapayLiturgicalDays({
    calendarType,
    startDate: fromDate,
    endDate: addDays(fromDate, 180),
    seed,
  })
    .filter(isImportantUpcomingFeast)
    .slice(0, 8)
    .map((entry) => ({
      civilDate: entry.civilDate,
      title: entry.feastTitle,
      fastingRule: entry.fastingRule,
      saints: entry.saints,
      feastRank: entry.feastRank,
      calendarType,
    }));
}
function buildCalendarToggle(resolvedCalendar) {
  return {
    active: resolvedCalendar,
    options: [
      { value: 'julian', label: 'Julian' },
      { value: 'revised-julian', label: 'Revised-Julian' },
    ],
    description: calendarLabel(resolvedCalendar === 'revised-julian' ? 'gregorian' : 'julian'),
  };
}
function childById(seed) {
  return new Map(seed.children.map((child) => [child.id, child]));
}
function communityResourceKey(resource = {}) {
  return resource.id || `${resource.title || ''}:${resource.url || ''}`;
}
function mergeCommunityResources(...lists) {
  const records = /* @__PURE__ */ new Map();
  lists
    .flat()
    .filter(Boolean)
    .forEach((resource) => {
      const resourceKey = communityResourceKey(resource);
      if (resourceKey) records.set(resourceKey, resource);
    });
  return [...records.values()];
}
function int(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function childrenForProgress(item = {}, children = []) {
  if (item.childId) return children.filter((child) => child.id === item.childId);
  if (item.formLabel)
    return children.filter((child) => child.formLabel === item.formLabel || child.gradeLabel === item.formLabel);
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
    percent: Math.round((completed / total) * 100),
  };
}
function addDays(iso, days) {
  const date = /* @__PURE__ */ new Date(`${iso}T00:00:00.000Z`);
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
function isoDateParts(value = '') {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}
function eventRecurrence(value = '') {
  const raw = String(value || '').toLowerCase();
  return ['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'].includes(raw) ? raw : 'none';
}
function eventOccursOnDate(event = {}, civilDate = '') {
  if (!event.date || !civilDate || civilDate < event.date) return false;
  const recurrence = eventRecurrence(event.recurrence);
  if (recurrence === 'none') return event.date === civilDate;
  const start = /* @__PURE__ */ new Date(`${event.date}T00:00:00.000Z`);
  const target = /* @__PURE__ */ new Date(`${civilDate}T00:00:00.000Z`);
  const diffDays = Math.round((Number(target) - Number(start)) / 864e5);
  if (diffDays < 0) return false;
  if (recurrence === 'weekly') return diffDays % 7 === 0;
  if (recurrence === 'biweekly') return diffDays % 14 === 0;
  const startParts = isoDateParts(event.date);
  const targetParts = isoDateParts(civilDate);
  if (!startParts || !targetParts || startParts.day !== targetParts.day) return false;
  const monthDiff = (targetParts.year - startParts.year) * 12 + (targetParts.month - startParts.month);
  if (recurrence === 'monthly') return monthDiff >= 0;
  if (recurrence === 'quarterly') return monthDiff >= 0 && monthDiff % 3 === 0;
  return recurrence === 'yearly' && startParts.month === targetParts.month;
}
function dateLabelFromIso(iso) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(
    /* @__PURE__ */ new Date(`${iso}T00:00:00.000Z`)
  );
}
function weekdayLabelFromIso(iso) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(
    /* @__PURE__ */ new Date(`${iso}T00:00:00.000Z`)
  );
}
function monthLabelFromIso(iso) {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    /* @__PURE__ */ new Date(`${iso}T00:00:00.000Z`)
  );
}
function monthKeyFromIso(iso) {
  const value = String(iso || '');
  return /^\d{4}-\d{2}/.test(value) ? value.slice(0, 7) : /* @__PURE__ */ new Date().toISOString().slice(0, 7);
}
function buildCurriculum(seed) {
  return {
    activePackage: seed.curriculumPackage,
    packages: seed.curriculumPackages,
    subjects: seed.curriculumSubjects,
    resources: seed.curriculumResources,
    mappings: seed.curriculumMappings,
    mappingSummary: [
      ...(seed.cycleYear?.title ? [`Planning cycle: ${seed.cycleYear.title}`] : []),
      ...(seed.curriculumPackage?.title ? [`Curriculum: ${seed.curriculumPackage.title}`] : []),
      ...(seed.books?.slice(0, 2).map((book) => `${book.audienceLabel || 'Read-aloud'}: ${book.title}`) || []),
    ],
  };
}
function buildGraceMode(seed) {
  return {
    enabled: true,
    seasonAdjustment: seed.seasonAdjustment,
    rule: seed.graceModeRule,
    reasons: ['new baby', 'illness', 'travel', 'caregiving', 'feast season', 'custom'],
    modes: ['full', 'medium', 'light'],
    preserved: ['Core-ranked work', 'High-ranked work until the daily cap', 'Orthodox household rhythm'],
    changed: seed.graceModeRule.changedSummary,
  };
}
export {
  DAYS,
  DEFAULT_FAMILY_RECIPES,
  GRACE_MODE_CAPS,
  GRACE_PRIORITY_RANKS,
  SeedFutureRecordsRepository,
  SeedLiturgicalRepository,
  addDays,
  buildCalendarToggle,
  buildChildColumns,
  buildCurriculum,
  buildGraceMode,
  buildHouseholdStreamCards,
  buildUpcomingFeasts,
  childById,
  childrenForProgress,
  communityResourceKey,
  completionStatus,
  computeWeeklySummary,
  dateLabelFromIso,
  eachIsoDate,
  eventOccursOnDate,
  eventRecurrence,
  familyPlanningWithDefaultRecipes,
  int,
  isImportantUpcomingFeast,
  isoDateParts,
  mergeCommunityResources,
  monthKeyFromIso,
  monthLabelFromIso,
  patronalFeastForDate,
  progressFromTerm,
  rangeProgress,
  weekStartSundayIso,
  weekdayLabelFromIso,
};
