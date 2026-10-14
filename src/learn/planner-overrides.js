// Generated from src/learn/planner-overrides.ts by npm run build:server. Do not edit.
const STATUS_META = {
  planned: { label: 'Planned', note: 'On the schedule for this day.' },
  reduced: { label: 'Shortened', note: 'Kept, but trimmed to fit a lighter day.' },
  deferred: { label: 'Moved', note: 'Moved to another day this week — not behind, just later.' },
  reserve: { label: 'In Reserve', note: "Set aside for whenever there's a roomier day. No rush." },
  completed: { label: 'Done', note: 'Completed.' },
  rest: { label: 'Rest', note: 'A day for church, rest, and family rhythm.' },
  empty: { label: '', note: '' },
};
const PRIMARY_STATUS_ORDER = ['planned', 'deferred', 'completed', 'reserve'];
function describePlannerStatus(status) {
  const key = String(status || 'planned').toLowerCase();
  if (Object.prototype.hasOwnProperty.call(STATUS_META, key)) return { status: key, ...STATUS_META[key] };
  const label = key ? key.charAt(0).toUpperCase() + key.slice(1) : 'Planned';
  return { status: key || 'planned', label, note: '' };
}
function plannerStatusLegend() {
  return PRIMARY_STATUS_ORDER.map((status) => describePlannerStatus(status));
}
function findNextOpenWeekday(row, fromWeekday) {
  const statuses = Array.isArray(row?.statuses) ? row.statuses : [];
  const from = Number(fromWeekday);
  for (let offset = 1; offset <= 6; offset += 1) {
    const idx = (from + offset) % 7;
    const status = statuses[idx];
    if (!status || status === 'empty') return idx;
  }
  return null;
}
function applyPlannerOverrides(rows = [], overridesForWeek = {}) {
  const reserveList = [];
  const nextRows = (rows || []).map((row) => {
    const rowOverrides = overridesForWeek?.[row.id];
    if (!rowOverrides || typeof rowOverrides !== 'object') return row;
    const statuses = [...(row.statuses || [])];
    const minutes = [...(row.minutes || [])];
    let movedFromWeekday = Number.isInteger(row.movedFromWeekday) ? row.movedFromWeekday : null;
    let movedToWeekday = Number.isInteger(row.movedToWeekday) ? row.movedToWeekday : null;
    Object.entries(rowOverrides).forEach(([weekdayKey, entry]) => {
      const weekday = Number(weekdayKey);
      if (!entry || !Number.isInteger(weekday) || weekday < 0 || weekday > 6) return;
      const originalMinutes = Number.isFinite(Number(entry.minutes))
        ? Number(entry.minutes)
        : Number(minutes[weekday] || 0);
      if (entry.action === 'reserve') {
        statuses[weekday] = 'reserve';
        minutes[weekday] = 0;
        reserveList.push({
          rowId: row.id,
          title: row.title,
          minutes: originalMinutes,
          fromWeekday: weekday,
          note: entry.note || '',
        });
        return;
      }
      statuses[weekday] = 'deferred';
      minutes[weekday] = 0;
      movedFromWeekday = weekday;
      if (Number.isInteger(entry.movedToWeekday)) {
        statuses[entry.movedToWeekday] = 'planned';
        minutes[entry.movedToWeekday] = originalMinutes;
        movedToWeekday = entry.movedToWeekday;
      }
    });
    return { ...row, statuses, minutes, movedFromWeekday, movedToWeekday };
  });
  return { rows: nextRows, reserveList };
}
function computeMoveUnfinishedWork({ rows = [], rowId = '', fromWeekday, mode = 'next-open-day' } = {}) {
  const weekday = Number(fromWeekday);
  if (!rowId || !Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    return { ok: false, error: 'A lesson block and a valid weekday are required.' };
  }
  const row = (rows || []).find((candidate) => candidate.id === rowId);
  if (!row) return { ok: false, error: 'That lesson block was not found for this week.' };
  const status = row.statuses?.[weekday];
  if (status !== 'planned' && status !== 'reduced') {
    return {
      ok: false,
      error:
        status === 'completed'
          ? "This work is already marked done, so there's nothing to move."
          : 'There is no unfinished, scheduled work on that day to move.',
    };
  }
  const minutes = Number(row.minutes?.[weekday] || 0);
  const title = row.title;
  if (mode === 'reserve') {
    return { ok: true, rowId, fromWeekday: weekday, action: 'reserve', movedToWeekday: null, minutes, title };
  }
  const nextOpenWeekday = findNextOpenWeekday(row, weekday);
  if (nextOpenWeekday === null) {
    return {
      ok: true,
      rowId,
      fromWeekday: weekday,
      action: 'reserve',
      movedToWeekday: null,
      minutes,
      title,
      fallbackToReserve: true,
    };
  }
  return { ok: true, rowId, fromWeekday: weekday, action: 'deferred', movedToWeekday: nextOpenWeekday, minutes, title };
}
export {
  PRIMARY_STATUS_ORDER,
  STATUS_META,
  applyPlannerOverrides,
  computeMoveUnfinishedWork,
  describePlannerStatus,
  findNextOpenWeekday,
  plannerStatusLegend,
};
