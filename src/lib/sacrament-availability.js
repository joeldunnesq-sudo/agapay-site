// src/lib/sacrament-availability.js
//
// Native (no third-party) real-time availability for the "schedulable"
// Sacraments & Services types (house_blessing, confession, home_visit). A
// priest defines recurring weekly windows (parish_availability_rules); this
// module turns those into concrete open slots for a donor to pick from,
// excluding blacked-out dates and already-booked times.
//
// No external calendar sync -- double-booking is only prevented against
// other AGAPAY-booked sacraments. Timezone math uses Intl.DateTimeFormat
// (available in the Workers runtime), not a date library.

import { d1, d1All } from "./core.js";

export const SCHEDULABLE_SACRAMENT_TYPES = new Set(["house_blessing", "confession", "home_visit"]);

/** { year, month, day, hour, minute, second } for `date` as observed in `timeZone`. */
function zonedParts(date, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  });
  const parts = {};
  for (const p of dtf.formatToParts(date)) parts[p.type] = p.value;
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second || 0)
  };
}

/** 'YYYY-MM-DD' for `date` as observed in `timeZone`. */
function zonedDateStr(date, timeZone) {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/**
 * Converts a wall-clock date+time ('YYYY-MM-DD', 'HH:MM') that's meant to be
 * read in `timeZone` into the actual UTC instant it represents. Standard
 * single-correction technique: guess it's UTC, see what that guess reads as
 * in the target zone, then shift by the difference.
 */
function zonedTimeToUtc(dateStr, timeStr, timeZone) {
  const naiveUtc = new Date(`${dateStr}T${timeStr}:00Z`);
  const p = zonedParts(naiveUtc, timeZone);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const offsetMs = asIfUtc - naiveUtc.getTime();
  return new Date(naiveUtc.getTime() - offsetMs);
}

/** Calendar weekday (0=Sun..6=Sat) of a plain 'YYYY-MM-DD' date, timezone-independent. */
function weekdayOf(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function minutesToHHMM(totalMinutes) {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function hhmmToMinutes(value) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Best-effort normalization of a stored confirmed_time value to 'HH:MM' 24h.
 * Manually-entered parish times can be free text ("10:00 AM"); returns null
 * (excluded from the occupied set) if it can't be confidently parsed rather
 * than risking blocking an unrelated slot.
 */
function normalizeTimeToHHMM(value) {
  const strict = hhmmToMinutes(value);
  if (strict !== null) return minutesToHHMM(strict);
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(value || "").trim());
  if (!m) return null;
  let hour = Number(m[1]) % 12;
  if (/pm/i.test(m[3])) hour += 12;
  return minutesToHHMM(hour * 60 + Number(m[2]));
}

/**
 * Returns { slots: [{ date, time, label, startsAt }], timezone } for the
 * given parish/sacramentType. Empty slots (with no error) means either no
 * rules are configured or the timezone isn't set yet -- callers should fall
 * back to the free-text request fields in that case.
 */
export async function computeAvailableSlots(env, { parishId, sacramentType, timezone, daysAhead = 21, maxSlots = 40 }) {
  if (!d1(env) || !parishId || !SCHEDULABLE_SACRAMENT_TYPES.has(sacramentType) || !timezone) {
    return { slots: [], timezone: timezone || "" };
  }

  const rules = await d1All(env,
    "SELECT * FROM parish_availability_rules WHERE parish_id = ? AND sacrament_type = ? AND active = 1",
    parishId, sacramentType
  ).catch(() => []);
  if (!rules.length) return { slots: [], timezone };

  const todayLocal = zonedDateStr(new Date(), timezone);
  const rangeEndLocal = addDays(todayLocal, daysAhead);

  const blackouts = await d1All(env,
    "SELECT date FROM parish_availability_blackouts WHERE parish_id = ? AND date >= ? AND date <= ?",
    parishId, todayLocal, rangeEndLocal
  ).catch(() => []);
  const blackoutDates = new Set(blackouts.map((b) => b.date));

  const occupiedRows = await d1All(env,
    `SELECT confirmed_date, confirmed_time FROM sacrament_requests
     WHERE parish_id = ? AND status = 'scheduled' AND confirmed_date IS NOT NULL
       AND confirmed_date >= ? AND confirmed_date <= ?`,
    parishId, todayLocal, rangeEndLocal
  ).catch(() => []);
  const occupied = new Set();
  for (const row of occupiedRows) {
    const t = normalizeTimeToHHMM(row.confirmed_time);
    if (t) occupied.add(`${row.confirmed_date}|${t}`);
  }

  const rulesByWeekday = new Map();
  for (const rule of rules) {
    const list = rulesByWeekday.get(rule.day_of_week) || [];
    list.push(rule);
    rulesByWeekday.set(rule.day_of_week, list);
  }

  const now = Date.now();
  const slots = [];
  for (let i = 0; i < daysAhead && slots.length < maxSlots; i++) {
    const dateStr = addDays(todayLocal, i);
    if (blackoutDates.has(dateStr)) continue;
    const dayRules = rulesByWeekday.get(weekdayOf(dateStr)) || [];
    for (const rule of dayRules) {
      const startMin = hhmmToMinutes(rule.start_time);
      const endMin = hhmmToMinutes(rule.end_time);
      const step = Math.max(5, Number(rule.slot_minutes) || 30);
      if (startMin === null || endMin === null) continue;
      for (let m = startMin; m + step <= endMin; m += step) {
        const timeStr = minutesToHHMM(m);
        if (occupied.has(`${dateStr}|${timeStr}`)) continue;
        const startsAt = zonedTimeToUtc(dateStr, timeStr, timezone);
        if (startsAt.getTime() <= now) continue;
        slots.push({
          date: dateStr,
          time: timeStr,
          startsAt: startsAt.toISOString(),
          label: startsAt.toLocaleString("en-US", {
            timeZone: timezone, weekday: "short", month: "short", day: "numeric",
            hour: "numeric", minute: "2-digit"
          })
        });
        if (slots.length >= maxSlots) break;
      }
      if (slots.length >= maxSlots) break;
    }
  }

  slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return { slots, timezone };
}

/**
 * Re-checks (at booking time) that a specific date/time is still free for a
 * parish -- used to guard against a race between two donors booking the
 * same slot. Independent of computeAvailableSlots's daysAhead/rule scan so
 * it works even for a slot near the edge of the normal lookahead window.
 */
export async function isSlotStillOpen(env, { parishId, date, time }) {
  if (!d1(env)) return true;
  const rows = await d1All(env,
    `SELECT confirmed_date, confirmed_time FROM sacrament_requests
     WHERE parish_id = ? AND status = 'scheduled' AND confirmed_date = ?`,
    parishId, date
  ).catch(() => []);
  return !rows.some((row) => normalizeTimeToHHMM(row.confirmed_time) === time);
}
