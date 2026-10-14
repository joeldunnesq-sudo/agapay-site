// Generated from src/lib/sacrament-availability.ts by npm run build:server. Do not edit.
import { d1, d1All } from './core.js';
const SCHEDULABLE_SACRAMENT_TYPES = /* @__PURE__ */ new Set([
  'house_blessing',
  'confession',
  'home_visit',
  'office_visit',
  'anointing',
  'counseling',
]);
function isSchedulableOfferingKey(value) {
  const key = String(value || '').trim();
  return SCHEDULABLE_SACRAMENT_TYPES.has(key) || /^custom_[a-z0-9_-]{1,72}$/.test(key);
}
function zonedParts(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = {};
  for (const p of dtf.formatToParts(date)) parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second || 0),
  };
}
function zonedDateStr(date, timeZone) {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}
function zonedTimeToUtc(dateStr, timeStr, timeZone) {
  const naiveUtc = /* @__PURE__ */ new Date(`${dateStr}T${timeStr}:00Z`);
  const p = zonedParts(naiveUtc, timeZone);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const offsetMs = asIfUtc - naiveUtc.getTime();
  return new Date(naiveUtc.getTime() - offsetMs);
}
function weekdayOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
function minutesToHHMM(totalMinutes) {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
function hhmmToMinutes(value) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}
function normalizeTimeToHHMM(value) {
  const strict = hhmmToMinutes(value);
  if (strict !== null) return minutesToHHMM(strict);
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(value || '').trim());
  if (!m) return null;
  let hour = Number(m[1]) % 12;
  if (/pm/i.test(m[3])) hour += 12;
  return minutesToHHMM(hour * 60 + Number(m[2]));
}
async function computeAvailableSlots(env, { parishId, sacramentType, timezone, daysAhead = 21, maxSlots = 40 }) {
  if (!d1(env) || !parishId || !isSchedulableOfferingKey(sacramentType) || !timezone) {
    return { slots: [], timezone: timezone || '' };
  }
  const rules = await d1All(
    env,
    'SELECT * FROM parish_availability_rules WHERE parish_id = ? AND sacrament_type = ? AND active = 1',
    parishId,
    sacramentType
  ).catch(() => []);
  if (!rules.length) return { slots: [], timezone };
  const todayLocal = zonedDateStr(/* @__PURE__ */ new Date(), timezone);
  const rangeEndLocal = addDays(todayLocal, daysAhead);
  const blackouts = await d1All(
    env,
    `SELECT date, COALESCE(end_date, date) AS end_date, priest_name
     FROM parish_availability_blackouts
     WHERE parish_id = ? AND date <= ? AND COALESCE(end_date, date) >= ?`,
    parishId,
    rangeEndLocal,
    todayLocal
  ).catch(() => []);
  const isBlackedOut = (date, priestName = '') =>
    blackouts.some(
      (row) =>
        date >= row.date && date <= (row.end_date || row.date) && (!row.priest_name || row.priest_name === priestName)
    );
  const occupiedRows = await d1All(
    env,
    `SELECT confirmed_date, confirmed_time, clergy_assigned FROM sacrament_requests
     WHERE parish_id = ? AND status = 'scheduled' AND confirmed_date IS NOT NULL
       AND confirmed_date >= ? AND confirmed_date <= ?`,
    parishId,
    todayLocal,
    rangeEndLocal
  ).catch(() => []);
  const occupied = /* @__PURE__ */ new Set();
  for (const row of occupiedRows) {
    const t = normalizeTimeToHHMM(row.confirmed_time);
    if (t) occupied.add(`${row.confirmed_date}|${t}|${row.clergy_assigned || ''}`);
  }
  const rulesByWeekday = /* @__PURE__ */ new Map();
  for (const rule of rules) {
    const list = rulesByWeekday.get(rule.day_of_week) || [];
    list.push(rule);
    rulesByWeekday.set(rule.day_of_week, list);
  }
  const now = Date.now();
  const slots = [];
  for (let i = 0; i < daysAhead && slots.length < maxSlots; i++) {
    const dateStr = addDays(todayLocal, i);
    const dayRules = rulesByWeekday.get(weekdayOf(dateStr)) || [];
    for (const rule of dayRules) {
      if (isBlackedOut(dateStr, rule.priest_name || '')) continue;
      const startMin = hhmmToMinutes(rule.start_time);
      const endMin = hhmmToMinutes(rule.end_time);
      const step = Math.max(5, Number(rule.slot_minutes) || 30);
      if (startMin === null || endMin === null) continue;
      for (let m = startMin; m + step <= endMin; m += step) {
        const timeStr = minutesToHHMM(m);
        if (occupied.has(`${dateStr}|${timeStr}|${rule.priest_name || ''}`)) continue;
        const startsAt = zonedTimeToUtc(dateStr, timeStr, timezone);
        if (startsAt.getTime() <= now) continue;
        slots.push({
          date: dateStr,
          time: timeStr,
          priestName: rule.priest_name || '',
          priestEmail: rule.priest_email || '',
          startsAt: startsAt.toISOString(),
          label: startsAt.toLocaleString('en-US', {
            timeZone: timezone,
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          }),
        });
        if (slots.length >= maxSlots) break;
      }
      if (slots.length >= maxSlots) break;
    }
  }
  slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return { slots, timezone };
}
async function isSlotStillOpen(env, { parishId, date, time, priestName = '' }) {
  if (!d1(env)) return true;
  const rows = await d1All(
    env,
    `SELECT confirmed_date, confirmed_time, clergy_assigned FROM sacrament_requests
     WHERE parish_id = ? AND status = 'scheduled' AND confirmed_date = ?`,
    parishId,
    date
  ).catch(() => []);
  return !rows.some(
    (row) =>
      normalizeTimeToHHMM(row.confirmed_time) === time && String(row.clergy_assigned || '') === String(priestName || '')
  );
}
export {
  SCHEDULABLE_SACRAMENT_TYPES,
  computeAvailableSlots,
  isSchedulableOfferingKey,
  isSlotStillOpen,
  zonedTimeToUtc,
};
