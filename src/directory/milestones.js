import { d1All } from "../lib/core.js";

const MILESTONE_TYPES = Object.freeze({
  birthday: { label: "Birthday", icon: "birthday" },
  anniversary: { label: "Anniversary", icon: "anniversary" },
  nameday: { label: "Name day", icon: "nameday" }
});

function boundedDays(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(366, Math.round(parsed))) : 30;
}

function validMonthDay(value) {
  const match = String(value || "").match(/(?:^|\d{4}-)(\d{2})-(\d{2})$/);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { month, day, monthDay: `${match[1]}-${match[2]}` };
}

function annualDate(year, month, day) {
  const safeDay = month === 2 && day === 29 && new Date(Date.UTC(year, 1, 29)).getUTCDate() !== 29 ? 28 : day;
  const date = new Date(Date.UTC(year, month - 1, safeDay, 12));
  if (date.getUTCMonth() !== month - 1) return null;
  return date;
}

function isoDate(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function nextAnnualOccurrence(sourceDate, fromDate) {
  const parsed = validMonthDay(sourceDate);
  if (!parsed) return null;
  const start = new Date(Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), fromDate.getUTCDate(), 12));
  let occurrence = annualDate(start.getUTCFullYear(), parsed.month, parsed.day);
  if (!occurrence) return null;
  if (occurrence < start) occurrence = annualDate(start.getUTCFullYear() + 1, parsed.month, parsed.day);
  return occurrence;
}

export function buildUpcomingDirectoryMilestones(rowsByType = {}, { fromDate = new Date(), days = 30 } = {}) {
  const windowDays = boundedDays(days);
  const resultLimit = windowDays === 1 ? 24 : Math.min(1000, Math.max(100, windowDays * 5));
  const start = new Date(Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), fromDate.getUTCDate(), 12));
  // `days` is a count of calendar dates. A one-day window therefore means
  // today only, while a 30-day window ends 29 dates after the start date.
  const end = new Date(start.getTime() + ((windowDays - 1) * 86400000));
  const result = [];

  const typeAliases = { birthdays: "birthday", anniversaries: "anniversary", namedays: "nameday" };
  for (const [inputType, rows] of Object.entries(rowsByType)) {
    const type = typeAliases[inputType] || inputType;
    const meta = MILESTONE_TYPES[type];
    if (!meta || !Array.isArray(rows)) continue;
    for (const row of rows) {
      const occurrence = nextAnnualOccurrence(row.source_date || row.sourceDate || row.month_day || row.monthDay, start);
      if (!occurrence || occurrence > end) continue;
      const originalYear = Number(String(row.source_date || row.sourceDate || "").slice(0, 4));
      const years = type === "anniversary" && Number.isFinite(originalYear)
        ? Math.max(0, occurrence.getUTCFullYear() - originalYear)
        : null;
      result.push({
        id: `${type}:${row.id || row.person_id || row.household_id || row.label}:${isoDate(occurrence)}`,
        type,
        typeLabel: meta.label,
        icon: meta.icon,
        label: String(row.label || row.display_name || "Parish family").trim(),
        detail: type === "nameday" ? String(row.saint_name || row.detail || "").trim() : "",
        date: isoDate(occurrence),
        daysAway: Math.round((occurrence.getTime() - start.getTime()) / 86400000),
        years: years || null
      });
    }
  }

  return result
    .sort((left, right) => left.date.localeCompare(right.date) || left.type.localeCompare(right.type) || left.label.localeCompare(right.label))
    .slice(0, resultLimit);
}

export async function listDirectoryMilestones(env, { context, days = 30, fromDate = new Date() }) {
  const parishId = context?.parishId;
  if (!parishId) return { items: [], windowDays: boundedDays(days) };
  const [birthdays, anniversaries, namedays] = await Promise.all([
    d1All(env, `
      SELECT p.id, p.preferred_name AS label, p.date_of_birth AS source_date
      FROM directory_people p
      JOIN directory_publication_profiles publication
        ON publication.parish_id = ?1 AND publication.owner_type = 'person' AND publication.owner_id = p.id
       AND publication.active = 1 AND publication.status = 'approved' AND publication.approval_status = 'approved'
      JOIN directory_field_privacy_preferences preference
        ON preference.parish_id = ?1 AND preference.owner_type = 'person' AND preference.owner_id = p.id
       AND preference.field_key = 'adult_birthday' AND preference.visibility = 'directory_members'
       AND preference.publication_eligible = 1 AND preference.active = 1
      LEFT JOIN directory_person_privacy_flags flags
        ON flags.parish_id = ?1 AND flags.person_id = p.id AND flags.active = 1
      WHERE p.active = 1 AND p.date_of_birth IS NOT NULL AND p.date_of_birth != ''
        AND COALESCE(flags.is_child, 0) = 0 AND COALESCE(flags.protected_person, 0) = 0
    `, parishId),
    d1All(env, `
      SELECT h.id, h.display_name AS label, h.anniversary_date AS source_date
      FROM directory_households h
      JOIN directory_publication_profiles publication
        ON publication.parish_id = ?1 AND publication.owner_type = 'household' AND publication.owner_id = h.id
       AND publication.active = 1 AND publication.status = 'approved' AND publication.approval_status = 'approved'
      JOIN directory_field_privacy_preferences preference
        ON preference.parish_id = ?1 AND preference.owner_type = 'household' AND preference.owner_id = h.id
       AND preference.field_key = 'household_anniversary' AND preference.visibility = 'directory_members'
       AND preference.publication_eligible = 1 AND preference.active = 1
      WHERE h.parish_id = ?1 AND h.active = 1 AND h.anniversary_date IS NOT NULL AND h.anniversary_date != ''
    `, parishId),
    d1All(env, `
      SELECT nameday.id, nameday.display_name AS label, nameday.feast_month_day AS source_date, nameday.saint_name
      FROM directory_household_namedays nameday
      JOIN directory_publication_profiles publication
        ON publication.parish_id = ?1 AND publication.owner_type = 'household' AND publication.owner_id = nameday.household_id
       AND publication.active = 1 AND publication.status = 'approved' AND publication.approval_status = 'approved'
      WHERE nameday.parish_id = ?1 AND nameday.active = 1 AND nameday.visibility = 'directory_members'
    `, parishId)
  ]);
  return {
    items: buildUpcomingDirectoryMilestones({ birthdays, anniversaries, namedays }, { fromDate, days }),
    windowDays: boundedDays(days)
  };
}
