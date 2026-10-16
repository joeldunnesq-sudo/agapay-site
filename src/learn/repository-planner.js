// Generated from src/learn/repository-planner.ts by npm run build:server. Do not edit.
import {
  displayDate,
  gregorianToJdn,
  jdnToGregorian,
  liturgicalFeastsForYear,
  orthodoxPascha,
} from '../liturgical-calendar.js';
import './academic-exports.js';
import './academic-records.js';
import './demo-data.js';
import { normalizeCalendarType } from './liturgical-source.js';
import { applyPlannerOverrides, plannerStatusLegend } from './planner-overrides.js';
import './print-documents.js';
import './setup-persistence.js';
import { DAYS, GRACE_PRIORITY_RANKS, GRACE_MODE_CAPS } from './repository-shared.js';
import {
  familyPlanningWithDefaultRecipes,
  patronalFeastForDate,
  childById,
  eachIsoDate,
  eventOccursOnDate,
  dateLabelFromIso,
  monthLabelFromIso,
  monthKeyFromIso,
} from './repository-shared.js';
function julianOldStyleLabel(civilDate) {
  const [year, month, day] = civilDate.split('-').map(Number);
  const oldStyle = jdnToGregorian(gregorianToJdn(year, month, day) - 13);
  return `Julian ${displayDate(oldStyle)}`;
}
function seededLiturgicalEntry(seed, calendarType, civilDate) {
  return (
    (seed.liturgicalWeek[normalizeCalendarType(calendarType)] || []).find((entry) => entry.civilDate === civilDate) ||
    null
  );
}
function paschalOffset(civilDate) {
  const year = Number(civilDate.slice(0, 4));
  const dateJdn = gregorianToJdn(...civilDate.split('-').map(Number));
  const pascha = orthodoxPascha(year);
  const paschaJdn = gregorianToJdn(...pascha.date.split('-').map(Number));
  return dateJdn - paschaJdn;
}
function fastingRuleForDate(civilDate, feast) {
  if (feast?.rank === 'fast') return 'Fast';
  const offset = paschalOffset(civilDate);
  if (offset >= 0 && offset <= 6) return 'No Fast (Bright Week)';
  const [, month, day] = civilDate.split('-').map(Number);
  if (
    (month === 6 && day >= 8 && day <= 28) ||
    (month === 8 && day >= 1 && day <= 14) ||
    (month === 11 && day >= 15) ||
    (month === 12 && day <= 24)
  ) {
    return 'Fast';
  }
  const weekday = /* @__PURE__ */ new Date(`${civilDate}T00:00:00.000Z`).getUTCDay();
  return weekday === 3 || weekday === 5 ? 'Fast' : 'No Fast';
}
function fastingTypeForDate(civilDate, feast, fastingRule = '') {
  const rule = String(fastingRule || '').toLowerCase();
  if (rule.includes('no fast')) return 'No fasting prescribed';
  const offset = paschalOffset(civilDate);
  if (offset >= 0 && offset <= 6) return 'Bright Week';
  if (feast?.rank === 'fast') return 'Strict fast day';
  const [, month, day] = civilDate.split('-').map(Number);
  if (month === 8 && day >= 1 && day <= 14) return 'Dormition Fast';
  if ((month === 11 && day >= 15) || (month === 12 && day <= 24)) return 'Nativity Fast';
  if (month === 6 && day >= 8 && day <= 28) return "Apostles' Fast";
  const weekday = /* @__PURE__ */ new Date(`${civilDate}T00:00:00.000Z`).getUTCDay();
  if (weekday === 3) return 'Wednesday fast';
  if (weekday === 5) return 'Friday fast';
  if (rule.includes('fast')) return 'Fast day';
  return 'No fasting prescribed';
}
function buildAgapayLiturgicalDays({ calendarType = 'julian', startDate, endDate, seed }) {
  const calendar = normalizeCalendarType(calendarType) === 'revised-julian' ? 'gregorian' : 'julian';
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
    const isSunday = /* @__PURE__ */ new Date(`${civilDate}T00:00:00.000Z`).getUTCDay() === 0;
    return {
      civilDate,
      calendarType: normalizeCalendarType(calendarType),
      feastTitle: feast?.name || (isSunday ? 'Sunday: Worship & Rest' : 'Ordinary Church Day'),
      feastRank: feast?.rank ? `${feast.rank.charAt(0).toUpperCase()}${feast.rank.slice(1)}` : 'Daily Rhythm',
      fastingRule: seededReadings.fastingRule || fastingRuleForDate(civilDate, feast),
      fastingType: fastingTypeForDate(
        civilDate,
        feast,
        seededReadings.fastingRule || fastingRuleForDate(civilDate, feast)
      ),
      saints: feast ? [feast.name] : ['Household prayer and lesson rhythm'],
      oldStyleDateLabel:
        calendar === 'julian' ? feast?.sourceDate || julianOldStyleLabel(civilDate) : dateLabelFromIso(civilDate),
      epistleRef: seededReadings.epistleRef || 'Daily readings source not connected',
      gospelRef: seededReadings.gospelRef || 'Daily readings source not connected',
      troparionTone: seededReadings.troparionTone || 'Household',
      troparionText:
        seededReadings.troparionText || 'Connect a liturgical text source in Setup before displaying hymn text.',
      kontakionTone: seededReadings.kontakionTone || 'Household',
      kontakionText:
        seededReadings.kontakionText || 'Connect a liturgical text source in Setup before displaying kontakion text.',
    };
  });
}
function normalizeGraceMode(value = '') {
  const raw = String(value || '')
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .trim();
  if (raw === 'minimum' || raw === 'minimum viable' || raw === 'feast only') return 'minimum viable';
  if (raw === 'medium' || raw === 'light') return 'light';
  return 'full';
}
function gracePriorityRank(row = {}, graceModeRule = {}) {
  const raw = String(row.gracePriority || row.priorityLevel || '')
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .trim();
  if (Object.prototype.hasOwnProperty.call(GRACE_PRIORITY_RANKS, raw)) return GRACE_PRIORITY_RANKS[raw];
  return Number(row.priority || 0) < Number(graceModeRule.reducePriorityThreshold || 4) ? 0 : 2;
}
function gracePriorityLabel(row = {}, graceModeRule = {}) {
  const rank = gracePriorityRank(row, graceModeRule);
  if (rank <= 0) return 'core';
  if (rank === 1) return 'high';
  if (rank === 2) return 'medium';
  return 'low';
}
function shortenMinutes(minutes, mode) {
  const value = Number(minutes || 0);
  if (!value) return value;
  if (mode === 'minimum viable') return Math.min(15, Math.max(10, Math.round(value * 0.4)));
  return value > 15 ? Math.max(10, Math.round(value * 0.5)) : value;
}
function applyGraceModeToRows(rows, graceModeRule) {
  const mode = normalizeGraceMode(graceModeRule?.mode);
  if (mode === 'full') {
    return rows.map((row) => ({
      ...row,
      graceModeApplied: false,
      graceModePriority: gracePriorityLabel(row, graceModeRule),
      graceModeBehavior: 'full',
    }));
  }
  const cap = GRACE_MODE_CAPS[mode] || GRACE_MODE_CAPS.light;
  const nextRows = rows.map((row) => ({
    ...row,
    statuses: [...(row.statuses || [])],
    minutes: [...(row.minutes || [])],
    graceModeApplied: false,
    graceModePriority: gracePriorityLabel(row, graceModeRule),
    graceModeBehavior: 'kept',
  }));
  for (let dayIndex = 0; dayIndex < DAYS.length; dayIndex += 1) {
    const groups = /* @__PURE__ */ new Map();
    nextRows.forEach((row, rowIndex) => {
      const status = row.statuses?.[dayIndex];
      if (status !== 'planned' && status !== 'reduced') return;
      const key = row.childId ? `child:${row.childId}` : 'household';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({
        rowIndex,
        rank: gracePriorityRank(row, graceModeRule),
        priority: Number(row.priority || 999),
      });
    });
    groups.forEach((items, key) => {
      const dailyCap = key.startsWith('child:') ? cap.child : cap.household;
      const kept = items
        .sort(
          (left, right) => left.rank - right.rank || left.priority - right.priority || left.rowIndex - right.rowIndex
        )
        .slice(0, dailyCap)
        .map((item) => item.rowIndex);
      const keptSet = new Set(kept);
      items.forEach((item) => {
        const row = nextRows[item.rowIndex];
        if (!keptSet.has(item.rowIndex)) {
          row.statuses[dayIndex] = 'deferred';
          row.minutes[dayIndex] = 0;
          row.graceModeApplied = true;
          row.graceModeBehavior = 'deferred-by-cap';
          return;
        }
        if (cap.shortenKeptWork) {
          const shortened = shortenMinutes(row.minutes[dayIndex], mode);
          if (shortened !== row.minutes[dayIndex]) {
            row.minutes[dayIndex] = shortened;
            row.statuses[dayIndex] = row.statuses[dayIndex] === 'planned' ? 'reduced' : row.statuses[dayIndex];
            row.graceModeApplied = true;
            row.graceModeBehavior =
              row.graceModeBehavior === 'deferred-by-cap' ? row.graceModeBehavior : 'shortened-by-mode';
          }
        }
      });
    });
  }
  return nextRows;
}
function familyPlanForDate(seed, civilDate, liturgicalDay = {}) {
  const planning = familyPlanningWithDefaultRecipes(seed.familyPlanning || seed.setupSnapshot?.familyPlanning || {});
  const monthDay = civilDate.slice(5);
  const patronalFeast = patronalFeastForDate(seed, civilDate);
  return {
    nameDays: (planning.nameDays || []).filter((entry) => entry.monthDay === monthDay),
    events: (planning.events || [])
      .filter((entry) => eventOccursOnDate(entry, civilDate))
      .map((entry) => ({ ...entry, occurrenceDate: civilDate })),
    patronalFeast,
    meal: (planning.meals || []).find((entry) => entry.date === civilDate) || null,
    fastingPreference: planning.fastingPreference || 'guidance',
    fastingRule: liturgicalDay?.fastingRule || 'No Fast',
    fastingType: liturgicalDay?.fastingType || 'none',
  };
}
function buildPlannerWeek(seed, calendarType) {
  const week = seed.plannerWeek;
  const familyPlanning = familyPlanningWithDefaultRecipes(
    seed.familyPlanning || seed.setupSnapshot?.familyPlanning || {}
  );
  const liturgicalDays = buildAgapayLiturgicalDays({
    calendarType,
    startDate: week.dates[0],
    endDate: week.dates[week.dates.length - 1],
    seed,
  })
    .filter((entry) => week.dates.includes(entry.civilDate))
    .map((day) => {
      const patronalFeast = patronalFeastForDate(seed, day.civilDate);
      if (!patronalFeast) return day;
      return {
        ...day,
        feastTitle: patronalFeast.title,
        feastRank: patronalFeast.rank,
        isPatronalFeast: true,
      };
    });
  const childLookup = childById(seed);
  const hasMinutes = (row) => Array.isArray(row.minutes) && row.minutes.some((m) => Number(m || 0) > 0);
  const householdGraded = applyGraceModeToRows(week.householdRows, seed.graceModeRule).filter(hasMinutes);
  const childGraded = applyGraceModeToRows(week.childRows, seed.graceModeRule)
    .filter(hasMinutes)
    .map((row) => ({
      ...row,
      child: childLookup.get(row.childId),
    }));
  const weekKey = week.dates?.[0] || '';
  const overridesForWeek = (seed.setupSnapshot?.plannerOverrides || seed.plannerOverrides || {})[weekKey] || {};
  const householdApplied = applyPlannerOverrides(householdGraded, overridesForWeek);
  const childApplied = applyPlannerOverrides(childGraded, overridesForWeek);
  return {
    ...week,
    liturgicalDays,
    familyDays: week.dates.map((civilDate) =>
      familyPlanForDate(
        seed,
        civilDate,
        liturgicalDays.find((day) => day.civilDate === civilDate)
      )
    ),
    recipes: familyPlanning.recipes || [],
    groceryItems: familyPlanning.groceryItems || [],
    householdRows: householdApplied.rows,
    childRows: childApplied.rows,
    reserveList: [...householdApplied.reserveList, ...childApplied.reserveList],
    statusLegend: plannerStatusLegend(),
  };
}
function buildPlannerMonth(seed, calendarType, month = '') {
  const monthKey = /^\d{4}-\d{2}$/.test(String(month || ''))
    ? month
    : monthKeyFromIso(/* @__PURE__ */ new Date().toISOString());
  const [year, monthNumber] = monthKey.split('-').map(Number);
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
  const today = /* @__PURE__ */ new Date().toISOString().slice(0, 10);
  const householdPlanByWeekday = /* @__PURE__ */ new Map();
  const formPlanByWeekday = /* @__PURE__ */ new Map();
  const planIndexForWeekday = (weekday) => weekday;
  for (let weekday = 0; weekday < 7; weekday += 1) {
    const index = planIndexForWeekday(weekday);
    householdPlanByWeekday.set(
      weekday,
      (week.householdRows || [])
        .filter((row) => Number(row.minutes?.[index] || 0) > 0)
        .map((row) => ({ title: row.title, minutes: Number(row.minutes?.[index] || 0) }))
        .slice(0, 3)
    );
    formPlanByWeekday.set(
      weekday,
      (week.childRows || [])
        .filter((row) => Number(row.minutes?.[index] || 0) > 0)
        .map((row) => ({
          title: row.title,
          formLabel: row.child?.formLabel || row.child?.gradeLabel || 'Form',
          minutes: Number(row.minutes?.[index] || 0),
        }))
        .slice(0, 3)
    );
  }
  const days = eachIsoDate(startDate, endDate).map((civilDate) => {
    const date = /* @__PURE__ */ new Date(`${civilDate}T00:00:00.000Z`);
    const weekday = date.getUTCDay();
    const liturgicalDay = liturgicalByDate.get(civilDate) || {};
    const fastingRule = liturgicalDay.fastingRule || 'No Fast';
    const familyPlan = familyPlanForDate(seed, civilDate, liturgicalDay);
    const patronalFeast = familyPlan.patronalFeast;
    const feastTitle = patronalFeast?.title || liturgicalDay.feastTitle || 'Ordinary Church Day';
    const feastRank = patronalFeast?.rank || liturgicalDay.feastRank || 'Daily Rhythm';
    return {
      civilDate,
      dayNumber: date.getUTCDate(),
      weekday,
      weekdayLabel: DAYS[weekday],
      inMonth: civilDate.startsWith(monthKey),
      isToday: civilDate === today,
      isSunday: weekday === 0,
      feastTitle,
      feastRank,
      fastingRule,
      fastingType: liturgicalDay.fastingType || fastingTypeForDate(civilDate, null, fastingRule),
      isFastDay: /fast/i.test(fastingRule) && !/no fast/i.test(fastingRule),
      isPatronalFeast: Boolean(patronalFeast),
      oldStyleDateLabel: liturgicalDay.oldStyleDateLabel || '',
      nameDays: familyPlan.nameDays,
      events: familyPlan.events,
      meal: familyPlan.meal,
      fastingPreference: familyPlan.fastingPreference,
      householdPlan: householdPlanByWeekday.get(weekday) || [],
      formPlan: formPlanByWeekday.get(weekday) || [],
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
    feastDays: days.filter((day) => day.inMonth && day.feastRank !== 'Daily Rhythm').length,
    printableTitle: `${monthLabelFromIso(`${monthKey}-01`)} Household Calendar`,
  };
}
export {
  applyGraceModeToRows,
  buildAgapayLiturgicalDays,
  buildPlannerMonth,
  buildPlannerWeek,
  familyPlanForDate,
  fastingRuleForDate,
  fastingTypeForDate,
  gracePriorityLabel,
  gracePriorityRank,
  julianOldStyleLabel,
  normalizeGraceMode,
  paschalOffset,
  seededLiturgicalEntry,
  shortenMinutes,
};
