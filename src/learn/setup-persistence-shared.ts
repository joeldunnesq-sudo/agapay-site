import type {
  LearnScoreIdentity,
  SetupInputNode,
  SetupBookInput,
  LearnRuntimeChild,
  LearnRuntimeBook,
  LearnSetupSnapshot,
} from './setup-persistence-composition-contracts.js';

import { safeParseJsonRow } from '../lib/core.js';

import '../handlers/parish.js';

import './academic-records.js';

import './billing.js';

import './demo-data.js';

import './planner-overrides.js';

// Match Boolean filtering while exposing its non-null result to TypeScript.
function truthySetupPersistence<T>(value: T | null | undefined | false): value is NonNullable<T> {
  return Boolean(value);
}

export const LEARN_SETUP_KV_PREFIX = '__agapay_learn_setup:';
export const devSetupSnapshots = new Map<string, LearnSetupSnapshot>();
export const HOMESCHOOL_METHODS = ['Charlotte Mason', 'Orthodox Classical', 'Traditional', 'Eclectic', 'Unsure'];
export const HISTORY_CYCLES: Record<
  string,
  { title: string; summary: string; years: Record<string, { number: number; title: string; topics: string[] }> }
> = {
  'ambleside-inspired': {
    title: 'Charlotte Mason History & Enrichment Cycle',
    summary:
      'A six-year chronological enrichment spine inspired by AmblesideOnline, adapted for Orthodox households with saints, church history, geography, timeline, art, poetry, music, and living-book context.',
    years: {
      year_1: {
        number: 1,
        title: 'Year 1: Early medieval and national beginnings',
        topics: [
          'Early medieval stories',
          'Lives of saints and missionaries',
          'Maps, legends, folk songs, and picture study',
        ],
      },
      year_2: {
        number: 2,
        title: 'Year 2: Renaissance, exploration, and reformations',
        topics: ['Renaissance and exploration', 'Church history touchpoints', 'Art, geography, and narration'],
      },
      year_3: {
        number: 3,
        title: 'Year 3: Early modern and colonial worlds',
        topics: ['Early modern nations', 'Colonial and missionary encounters', 'Timeline and map work'],
      },
      year_4: {
        number: 4,
        title: 'Year 4: Revolutions and the long nineteenth century',
        topics: [
          'Revolutions and reform',
          'Nineteenth-century lives and literature',
          'Composer, artist, and poetry pairings',
        ],
      },
      year_5: {
        number: 5,
        title: 'Year 5: Modern nations and the twentieth century',
        topics: ['Modern world history', 'Orthodox witness in modernity', 'Civic geography and reports'],
      },
      year_6: {
        number: 6,
        title: 'Year 6: Ancient Greece/Rome plus modern bridge',
        topics: ['Ancient Greek and Roman background', 'Early Christian context', 'Timeline synthesis and narration'],
      },
    },
  },
  'orthodox-classical': {
    title: 'Orthodox Classical History & Enrichment Cycle',
    summary:
      'A chronological enrichment spine centered on Scripture, patristic history, Byzantium, Orthodox missions, and modern Church witness.',
    years: {
      year_1: {
        number: 1,
        title: 'Year 1: Ancient, biblical, and patristic foundations',
        topics: ['Scripture geography', 'Ancient civilizations', 'Apostolic and patristic witness'],
      },
      year_2: {
        number: 2,
        title: 'Year 2: Byzantium and medieval Christendom',
        topics: ['Byzantium', 'Councils and saints', 'Iconography, chant, and sacred art'],
      },
      year_3: {
        number: 3,
        title: 'Year 3: Missions, nations, and early modern worlds',
        topics: ['Slavic and global missions', 'Early modern empires', 'Geography and source narration'],
      },
      year_4: {
        number: 4,
        title: 'Year 4: Modern world and Orthodox witness',
        topics: ['Modern history', 'New martyrs and confessors', 'Civic life and reports'],
      },
      year_5: {
        number: 5,
        title: 'Year 5: Integrated review and research',
        topics: ['Timeline review', 'Family research projects', 'Oral narration and portfolios'],
      },
      year_6: {
        number: 6,
        title: 'Year 6: Capstone synthesis',
        topics: ['Ancient-to-modern synthesis', 'Church history capstone', 'Beautiful written reports'],
      },
    },
  },
  custom: {
    title: 'Custom Enrichment Cycle',
    summary:
      'A flexible enrichment spine for eclectic households who want AGAPAY to organize history, geography, arts, saints, and living books around their chosen focus.',
    years: {
      year_1: {
        number: 1,
        title: 'Custom Year 1',
        topics: ['Household-selected history', 'Living books', 'Narration and timeline work'],
      },
      year_2: {
        number: 2,
        title: 'Custom Year 2',
        topics: ['Household-selected history', 'Geography', 'Arts and poetry'],
      },
      year_3: {
        number: 3,
        title: 'Custom Year 3',
        topics: ['Household-selected history', 'Church-life connections', 'Reports'],
      },
      year_4: {
        number: 4,
        title: 'Custom Year 4',
        topics: ['Household-selected history', 'Timeline review', 'Portfolio work'],
      },
      year_5: {
        number: 5,
        title: 'Custom Year 5',
        topics: ['Household-selected history', 'Independent reading', 'Beautiful reports'],
      },
      year_6: {
        number: 6,
        title: 'Custom Year 6',
        topics: ['Household-selected history', 'Synthesis', 'Capstone narration'],
      },
    },
  },
};
export const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const DEFAULT_TERM_WEEK_COUNT = 12;
export function nowIso() {
  return new Date().toISOString();
}
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
export function slug(value: unknown, fallback: string = 'item') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}
export function stableId(prefix: string, value: unknown, index: number = 0) {
  return `${prefix}_${slug(value, `${prefix}-${index + 1}`)}`;
}
export function setupKvKey(identity: LearnScoreIdentity) {
  return `${LEARN_SETUP_KV_PREFIX}${identity.householdId}`;
}
export function parseStoredSetup(value: unknown): { setupSnapshot?: LearnSetupSnapshot } | null {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return (safeParseJsonRow(value) || value) as { setupSnapshot?: LearnSetupSnapshot };
}
export function text(value: unknown, fallback: string = '') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}
export function weeklyFrequencyValue(value: unknown, fallback: string = '1x') {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  if (['daily', 'weekly', '4x', '3x', '2x', '1x', 'as-needed'].includes(raw)) return raw;
  if (raw.includes('daily') || raw.includes('every')) return 'daily';
  if (raw.includes('4')) return '4x';
  if (raw.includes('3')) return '3x';
  if (raw.includes('2')) return '2x';
  if (raw.includes('as')) return 'as-needed';
  if (raw.includes('week')) return '1x';
  return fallback;
}
export function scheduledDaysValue(value: unknown, legacyFrequency: unknown = '') {
  const direct = Array.isArray(value) ? value : String(value || '').split(',');
  const selected = direct
    .map((day: unknown) => text(day, '').toLowerCase())
    .filter((day) => WEEKDAY_KEYS.includes(day));
  if (selected.length) return [...new Set(selected)];
  const frequency = weeklyFrequencyValue(legacyFrequency, 'daily');
  return frequency === 'daily'
    ? ['mon', 'tue', 'wed', 'thu', 'fri']
    : frequency === '4x'
      ? ['mon', 'tue', 'wed', 'thu']
      : frequency === '3x'
        ? ['mon', 'wed', 'fri']
        : frequency === '2x'
          ? ['tue', 'thu']
          : frequency === '1x' || frequency === 'weekly'
            ? ['wed']
            : [];
}
export function frequencyFromDays(days: unknown = []) {
  const count = scheduledDaysValue(days, 'as-needed').length;
  return count >= 5 ? 'daily' : count === 1 ? 'weekly' : count ? `${count}x` : 'as-needed';
}
export function weeklyPlansValue(value: unknown) {
  const direct = Array.isArray(value) ? value : String(value || '').split('|');
  return direct.slice(0, DEFAULT_TERM_WEEK_COUNT).map((entry: unknown) => text(entry, ''));
}
export function labelsValue(value: unknown) {
  const direct = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(direct.map((entry: unknown) => text(entry, '')).filter(truthySetupPersistence))];
}
export function setupResourceValue(resource: string | SetupInputNode | null | undefined, subject: SetupInputNode = {}) {
  const raw: SetupInputNode = typeof resource === 'string' ? { title: resource } : resource || {};
  const title = text(raw.title || raw.resource, '');
  if (!title) return null;
  const formLabels = labelsValue(raw.formLabels || raw.formLabel || subject.formLabels || subject.formLabel);
  const childIds =
    Array.isArray(raw.childIds) && raw.childIds.length
      ? raw.childIds.filter(truthySetupPersistence)
      : Array.isArray(subject.childIds)
        ? subject.childIds.filter(truthySetupPersistence)
        : [];
  return {
    title,
    scheduledWeeks: scheduledWeeksValue(raw.scheduledWeeks || subject.scheduledWeeks),
    weeklyPlans: weeklyPlansValue(raw.weeklyPlans || subject.weeklyPlans),
    planningMode: formLabels.length ? 'forms' : text(raw.planningMode || subject.planningMode, 'forms'),
    formLabel: text(raw.formLabel || formLabels[0] || subject.formLabel, ''),
    formLabels,
    gradeLabel: text(raw.gradeLabel || subject.gradeLabel, ''),
    childIds,
  };
}
export function scheduledWeeksValue(value: unknown, totalWeeks: number = DEFAULT_TERM_WEEK_COUNT) {
  const direct = Array.isArray(value) ? value : String(value || '').split(',');
  const selected = direct.map((week: unknown) => int(week, 0)).filter((week) => week >= 1 && week <= totalWeeks);
  return selected.length
    ? [...new Set(selected)].sort((a, b) => a - b)
    : Array.from({ length: totalWeeks }, (_, index) => index + 1);
}
export function activeTermWeek(
  term: SetupInputNode = {},
  reference: Date = new Date(),
  totalWeeks: number = DEFAULT_TERM_WEEK_COUNT
) {
  const startDate = String(term.startDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return 1;
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const current = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate()));
  const elapsedDays = Math.floor((Number(current) - Number(start)) / 86400000);
  return Math.max(1, Math.min(totalWeeks, Math.floor(elapsedDays / 7) + 1));
}
export function scheduledThisTermWeek(item: SetupInputNode = {}, weekNumber: number = 1) {
  return scheduledWeeksValue(item.scheduledWeeks).includes(weekNumber);
}
export function schedulingModeValue(value: unknown = 'fixed') {
  return ['fixed', 'weekly-target', 'term-target', 'loop', 'date-range'].includes(value as string)
    ? (value as string)
    : 'fixed';
}
export function itemActiveOnDateRange(item: SetupInputNode = {}, isoDate: string = '') {
  if (!isoDate || item.schedulingMode !== 'date-range') return true;
  if (item.activeStartDate && isoDate < item.activeStartDate) return false;
  if (item.activeEndDate && isoDate > item.activeEndDate) return false;
  return true;
}
export function planArraysForItem(item: SetupInputNode = {}, currentTermWeek: number = 1, weekDates: string[] = []) {
  const active = scheduledThisTermWeek(item, currentTermWeek);
  const mode = schedulingModeValue(item.schedulingMode);
  const defaultDays = item.scheduledDays?.length
    ? item.scheduledDays
    : scheduledDaysValue(item.weeklyFrequency || 'daily');
  if (!active) return weeklyPlanArrays(defaultDays, item.minutes || item.minutesPlanned || 20, false);
  let days = [...defaultDays];
  if (mode === 'weekly-target') {
    const count = Math.max(1, Math.min(7, int(item.weeklyTarget, days.length || 1)));
    const pool = days.length ? days : ['mon', 'tue', 'wed', 'thu', 'fri'];
    days = pool.slice(0, count);
  } else if (mode === 'term-target') {
    const activeWeeks = Math.max(1, scheduledWeeksValue(item.scheduledWeeks).length);
    const sessionsThisWeek = Math.max(0, Math.ceil(int(item.termTarget, 0) / activeWeeks));
    const pool = days.length ? days : ['mon', 'tue', 'wed', 'thu', 'fri'];
    days = pool.slice(0, Math.min(pool.length, sessionsThisWeek));
  } else if (mode === 'loop') {
    const pool = days.length ? days : ['mon', 'tue', 'wed', 'thu', 'fri'];
    days = pool.length ? [pool[(Math.max(1, currentTermWeek) - 1) % pool.length]] : [];
  }
  const base = weeklyPlanArrays(days, item.minutes || item.minutesPlanned || 20, true);
  if (mode === 'date-range' && weekDates.length === 7) {
    base.minutes = base.minutes.map((value, index) => (itemActiveOnDateRange(item, weekDates[index]) ? value : 0));
    base.statuses = base.statuses.map((value, index) =>
      itemActiveOnDateRange(item, weekDates[index]) ? value : 'empty'
    );
  }
  return base;
}
export function resourceTypeValue(value: unknown, fallback: string = 'curriculum') {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  if (['book', 'curriculum', 'website', 'hymn', 'icon', 'activity', 'none'].includes(raw)) return raw;
  return fallback;
}
export function graceModeValue(value: unknown = '', fallback: string = 'light') {
  const raw = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[-_]+/g, ' ');
  if (raw === 'full') return 'full';
  if (raw === 'medium' || raw === 'light') return 'light';
  if (raw === 'minimum' || raw === 'minimum viable' || raw === 'feast only') return 'minimum viable';
  return fallback;
}
export function gracePriorityValue(value: unknown = '', fallback: string = 'medium') {
  const raw = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[-_]+/g, ' ');
  if (raw === 'core' || raw === 'always keep' || raw === 'keep') return 'core';
  if (raw === 'high' || raw === 'important') return 'high';
  if (raw === 'medium' || raw === 'helpful' || raw === 'reduce first' || raw === 'shorten') return 'medium';
  if (
    raw === 'low' ||
    raw === 'optional' ||
    raw === 'bump if needed' ||
    raw === 'defer if needed' ||
    raw === 'defer in minimum' ||
    raw === 'minimum only'
  )
    return 'low';
  return fallback;
}
export function normalizeHomeschoolMethod(value: unknown) {
  const candidate = text(value, 'Charlotte Mason');
  return HOMESCHOOL_METHODS.includes(candidate) ? candidate : 'Charlotte Mason';
}
export function defaultHistoryFrameworkForMethod(method: string) {
  if (method === 'Orthodox Classical') return 'orthodox-classical';
  if (method === 'Eclectic') return 'custom';
  return 'ambleside-inspired';
}
export function normalizeHistoryCycle(value: SetupInputNode = {}, method: string = 'Charlotte Mason') {
  const framework = HISTORY_CYCLES[value.framework as string]
    ? (value.framework as string)
    : defaultHistoryFrameworkForMethod(method);
  const frameworkConfig = HISTORY_CYCLES[framework] || HISTORY_CYCLES['ambleside-inspired'];
  const cycleYear = frameworkConfig.years[value.cycleYear as string] ? (value.cycleYear as string) : 'year_1';
  const year = frameworkConfig.years[cycleYear];
  const rotation = ['first', 'second'].includes(value.rotation as string) ? value.rotation : 'first';
  const currentFocus = text(value.currentFocus, year.topics[0] || year.title);
  return {
    framework,
    rotation,
    cycleYear,
    currentFocus,
    sourceNote: text(
      value.sourceNote,
      framework === 'ambleside-inspired'
        ? 'AO-inspired chronology adapted for an Orthodox household.'
        : 'Household enrichment cycle.'
    ),
    frameworkTitle: frameworkConfig.title,
    frameworkSummary: frameworkConfig.summary,
    yearNumber: year.number,
    yearTitle: year.title,
    enrichmentTopics: year.topics,
  };
}
export function int(value: unknown, fallback: number = 0) {
  const parsed = Number.parseInt(value as string, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
export function list<T>(value: T[] | null | undefined): T[];
export function list<T = SetupInputNode>(value: unknown): T[];
export function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
export function rangeProgressPercent(start: unknown, current: unknown, end: unknown) {
  const first = Math.max(1, int(start, 1));
  const last = Math.max(first, int(end, first));
  if (!last || last <= first) return 0;
  const doneThrough = Math.max(first - 1, Math.min(last, int(current, first - 1)));
  const completed = Math.max(0, doneThrough - first + 1);
  const total = Math.max(1, last - first + 1);
  return Math.round((completed / total) * 100);
}
export function distributeRangeSegments(
  {
    label = '',
    start = 1,
    end = 0,
    color = '',
  }: { label?: string; start?: unknown; end?: unknown; color?: string } = {},
  weeks: number = 12
) {
  const first = Math.max(1, int(start, 1));
  const last = Math.max(first, int(end, first));
  const total = Math.max(1, last - first + 1);
  return Array.from({ length: weeks }, (_, index) => {
    const segStart = first + Math.floor((index * total) / weeks);
    const segEnd = first + Math.floor(((index + 1) * total) / weeks) - 1;
    return {
      title: `${label} ${segStart}${Math.max(segStart, segEnd) > segStart ? `-${Math.max(segStart, segEnd)}` : ''}`,
      start: index + 1,
      span: 1,
      color,
    };
  });
}
export function weeklyPlanArrays(schedule: unknown = 'daily', minutes: unknown = 20, active: boolean = true) {
  const amount = active ? Math.max(0, int(minutes, 20)) : 0;
  const activeDays = scheduledDaysValue(schedule, Array.isArray(schedule) ? 'as-needed' : schedule).map((day) =>
    WEEKDAY_KEYS.indexOf(day)
  );
  const planMinutes = Array.from({ length: 7 }, (_, index) => (activeDays.includes(index) ? amount : 0));
  const statuses = Array.from({ length: 7 }, (_, index) => (activeDays.includes(index) ? 'planned' : 'empty'));
  return { minutes: planMinutes, statuses };
}
export function currentWeekWindow(reference: Date = new Date()) {
  const start = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  const dates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
  const format = (iso: string) =>
    new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
      new Date(`${iso}T12:00:00Z`)
    );
  return { dates, label: `${format(dates[0])} - ${format(dates[6])}` };
}
export function normalizeCompletion(value: SetupInputNode = {}) {
  const normalizeBucket = (bucket: unknown, limit: number) =>
    Object.fromEntries(
      Object.entries(bucket && typeof bucket === 'object' ? bucket : {})
        .filter(([key, items]) => /^\d{4}-\d{2}-\d{2}$/.test(key) && items && typeof items === 'object')
        .sort(([a], [b]) => b.localeCompare(a))
        .slice(0, limit)
        .map(([key, items]) => [
          key,
          Object.fromEntries(
            Object.entries(items as Record<string, unknown>)
              .filter(([itemId]) => /^[a-zA-Z0-9:_-]{1,180}$/.test(itemId))
              .slice(0, 250)
              .map(([itemId, completed]) => [itemId, Boolean(completed)])
          ),
        ])
    );
  return {
    daily: normalizeBucket(value.daily, 45),
    weekly: normalizeBucket(value.weekly, 18),
  };
}
export function normalizePlannerOverrides(value: unknown = {}) {
  const weeks = Object.entries(value && typeof value === 'object' ? value : {})
    .filter(([weekKey, rowMap]) => /^\d{4}-\d{2}-\d{2}$/.test(weekKey) && rowMap && typeof rowMap === 'object')
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 12);

  return Object.fromEntries(
    weeks.map(([weekKey, rowMap]) => {
      const rows = Object.entries(rowMap as Record<string, Record<string, SetupInputNode>>)
        .filter(([rowId]) => /^[a-zA-Z0-9:_-]{1,180}$/.test(rowId))
        .slice(0, 100);
      return [
        weekKey,
        Object.fromEntries(
          rows.map(([rowId, dayMap]) => {
            const days = Object.entries(dayMap && typeof dayMap === 'object' ? dayMap : {})
              .filter(([weekdayKey, entry]) => {
                const weekday = Number(weekdayKey);
                return Number.isInteger(weekday) && weekday >= 0 && weekday <= 6 && entry && typeof entry === 'object';
              })
              .slice(0, 7);
            return [
              rowId,
              Object.fromEntries(
                days.map(([weekdayKey, entry]) => [
                  weekdayKey,
                  {
                    action: entry.action === 'reserve' ? 'reserve' : 'deferred',
                    movedToWeekday:
                      Number.isInteger(entry.movedToWeekday) &&
                      (entry.movedToWeekday as number) >= 0 &&
                      (entry.movedToWeekday as number) <= 6
                        ? (entry.movedToWeekday as number)
                        : null,
                    minutes: Math.max(0, int(entry.minutes, 0)),
                    note: text(entry.note, '').slice(0, 280),
                    updatedAt: text(entry.updatedAt, nowIso()),
                  },
                ])
              ),
            ];
          })
        ),
      ];
    })
  );
}
export function childrenForAssignment(item: SetupInputNode = {}, children: LearnRuntimeChild[] = []) {
  if (Array.isArray(item.childIds) && item.childIds.length)
    return children.filter((child) => item.childIds!.includes(child.id));
  if (item.childId) return children.filter((child) => child.id === item.childId);
  if (Array.isArray(item.formLabels) && item.formLabels.length)
    return children.filter(
      (child) =>
        item.formLabels!.includes(child.formLabel as string) || item.formLabels!.includes(child.gradeLabel as string)
    );
  if (item.formLabel)
    return children.filter((child) => child.formLabel === item.formLabel || child.gradeLabel === item.formLabel);
  if (item.gradeLabel) return children.filter((child) => child.gradeLabel === item.gradeLabel);
  return children;
}
export function bookBelongsToHouseholdStream(book: SetupInputNode = {}) {
  const audience = String(book.audienceLabel || '').toLowerCase();
  return (
    !book.formLabel &&
    !book.childId &&
    (!audience ||
      audience === 'household' ||
      audience === 'morning basket' ||
      audience === 'read-aloud' ||
      audience === 'read aloud')
  );
}
export function resourceBookLike({
  id = '',
  title = '',
  author = '',
  category = '',
  termId = '',
  formLabel = '',
  formLabels = [],
  gradeLabel = '',
  childId = '',
  childIds = [],
  audienceLabel = '',
  planningMode = '',
  weeklyFrequency = '1x',
  scheduledWeeks = [],
  weeklyPlans = [],
  minutes = '',
  color = '',
  sourceKind = 'setup',
}: SetupBookInput = {}): LearnRuntimeBook | null {
  const resolvedTitle = text(title, '');
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
    startChapter: '',
    currentChapter: '',
    endChapter: '',
    totalChapters: '',
  };
}
export async function bestEffort(statement: () => Promise<unknown>) {
  try {
    await statement();
  } catch {
    // Local development databases can lag migrations; the setup snapshot remains the source of truth.
  }
}
