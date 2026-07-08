// Shared, dependency-free helpers for:
//   1. Describing planner statuses in plain, reassuring language (used by the
//      UI status pills/badges and by print output).
//   2. The "Move unfinished work" feature: moving a day's unfinished lesson
//      to the next open day this week, or setting it aside in Reserve.
//
// This module intentionally imports nothing from repository.js or
// setup-persistence.js. repository.js (read path, buildPlannerWeek) and
// setup-persistence.js (write path, saveLearnMoveUnfinishedWork) already
// import from each other in one direction; keeping this logic here lets both
// share it without creating a circular import between them.

export const STATUS_META = {
  planned:   { label: "Planned",    note: "On the schedule for this day." },
  reduced:   { label: "Shortened",  note: "Kept, but trimmed to fit a lighter day." },
  deferred:  { label: "Moved",      note: "Moved to another day this week — not behind, just later." },
  reserve:   { label: "In Reserve", note: "Set aside for whenever there's a roomier day. No rush." },
  completed: { label: "Done",       note: "Completed." },
  rest:      { label: "Rest",       note: "A day for church, rest, and family rhythm." },
  empty:     { label: "",           note: "" }
};

// The four statuses called out for the family: everything else (reduced,
// rest, empty) is a supporting/internal state.
export const PRIMARY_STATUS_ORDER = ["planned", "deferred", "completed", "reserve"];

export function describePlannerStatus(status) {
  const key = String(status || "planned").toLowerCase();
  if (Object.prototype.hasOwnProperty.call(STATUS_META, key)) return { status: key, ...STATUS_META[key] };
  const label = key ? key.charAt(0).toUpperCase() + key.slice(1) : "Planned";
  return { status: key || "planned", label, note: "" };
}

export function plannerStatusLegend() {
  return PRIMARY_STATUS_ORDER.map((status) => describePlannerStatus(status));
}

// Finds the next weekday (this week, wrapping Sat -> Sun) with no work
// scheduled for this row yet. Returns null if every other day is already
// spoken for.
export function findNextOpenWeekday(row, fromWeekday) {
  const statuses = Array.isArray(row?.statuses) ? row.statuses : [];
  const from = Number(fromWeekday);
  for (let offset = 1; offset <= 6; offset += 1) {
    const idx = (from + offset) % 7;
    const status = statuses[idx];
    if (!status || status === "empty") return idx;
  }
  return null;
}

// Applies persisted weekday-level overrides (from a manual "move unfinished
// work" action) on top of a week's rows.
//
// overridesForWeek shape:
//   { [rowId]: { [weekdayIndex]: { action: "deferred" | "reserve", movedToWeekday, minutes, note } } }
//
// Returns { rows, reserveList } — rows is a new array (rows without an
// override are returned unchanged), reserveList collects every item moved
// to Reserve for display in the weekly Reserve card and on printables.
export function applyPlannerOverrides(rows = [], overridesForWeek = {}) {
  const reserveList = [];
  const nextRows = (rows || []).map((row) => {
    const rowOverrides = overridesForWeek?.[row.id];
    if (!rowOverrides || typeof rowOverrides !== "object") return row;

    const statuses = [...(row.statuses || [])];
    const minutes = [...(row.minutes || [])];
    let movedFromWeekday = Number.isInteger(row.movedFromWeekday) ? row.movedFromWeekday : null;
    let movedToWeekday = Number.isInteger(row.movedToWeekday) ? row.movedToWeekday : null;

    Object.entries(rowOverrides).forEach(([weekdayKey, entry]) => {
      const weekday = Number(weekdayKey);
      if (!entry || !Number.isInteger(weekday) || weekday < 0 || weekday > 6) return;
      const originalMinutes = Number.isFinite(Number(entry.minutes)) ? Number(entry.minutes) : Number(minutes[weekday] || 0);

      if (entry.action === "reserve") {
        statuses[weekday] = "reserve";
        minutes[weekday] = 0;
        reserveList.push({
          rowId: row.id,
          title: row.title,
          minutes: originalMinutes,
          fromWeekday: weekday,
          note: entry.note || ""
        });
        return;
      }

      // "deferred" — moved to another day this week.
      statuses[weekday] = "deferred";
      minutes[weekday] = 0;
      movedFromWeekday = weekday;
      if (Number.isInteger(entry.movedToWeekday)) {
        statuses[entry.movedToWeekday] = "planned";
        minutes[entry.movedToWeekday] = originalMinutes;
        movedToWeekday = entry.movedToWeekday;
      }
    });

    return { ...row, statuses, minutes, movedFromWeekday, movedToWeekday };
  });

  return { rows: nextRows, reserveList };
}

// Pure computation for "Move unfinished work". `rows` must already reflect
// the currently-effective state for the week (i.e. any prior overrides for
// that week should already be applied by the caller) so this doesn't move a
// day that was already moved.
export function computeMoveUnfinishedWork({ rows = [], rowId = "", fromWeekday, mode = "next-open-day" } = {}) {
  const weekday = Number(fromWeekday);
  if (!rowId || !Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    return { ok: false, error: "A lesson block and a valid weekday are required." };
  }
  const row = (rows || []).find((candidate) => candidate.id === rowId);
  if (!row) return { ok: false, error: "That lesson block was not found for this week." };

  const status = row.statuses?.[weekday];
  if (status !== "planned" && status !== "reduced") {
    return { ok: false, error: status === "completed"
      ? "This work is already marked done, so there's nothing to move."
      : "There is no unfinished, scheduled work on that day to move." };
  }

  const minutes = Number(row.minutes?.[weekday] || 0);
  const title = row.title;

  if (mode === "reserve") {
    return { ok: true, rowId, fromWeekday: weekday, action: "reserve", movedToWeekday: null, minutes, title };
  }

  const nextOpenWeekday = findNextOpenWeekday(row, weekday);
  if (nextOpenWeekday === null) {
    // No open day left this week — gracefully fall back to Reserve rather
    // than failing the request outright.
    return { ok: true, rowId, fromWeekday: weekday, action: "reserve", movedToWeekday: null, minutes, title, fallbackToReserve: true };
  }
  return { ok: true, rowId, fromWeekday: weekday, action: "deferred", movedToWeekday: nextOpenWeekday, minutes, title };
}
