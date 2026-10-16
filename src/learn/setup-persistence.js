// Generated from src/learn/setup-persistence.ts by npm run build:server. Do not edit.
import { d1, d1First, d1Run, normalizeEmail, safeParseJsonRow } from '../lib/core.js';
import { requireDonor } from '../handlers/parish.js';
import { loadLearnAcademicSnapshot } from './academic-records.js';
import { LEARN_FREE_CHILD_LIMIT, learnRequestHasFamilyAccessAsync } from './billing.js';
import { getLearnSeedSnapshot } from './demo-data.js';
import { applyPlannerOverrides, computeMoveUnfinishedWork } from './planner-overrides.js';
import { devSetupSnapshots } from './setup-persistence-shared.js';
import {
  nowIso,
  clone,
  slug,
  setupKvKey,
  parseStoredSetup,
  text,
  graceModeValue,
  list,
  currentWeekWindow,
  normalizeCompletion,
  bestEffort,
} from './setup-persistence-shared.js';
import { normalizeSetupPayload } from './setup-normalization.js';
import { applySetupSnapshotToSeed } from './setup-seed-application.js';
import { applySetupSnapshotToSeed as applySetupSnapshotToSeed2 } from './setup-seed-application.js';
async function learnSetupIdentity(request, env) {
  const donor = await requireDonor(request, env);
  const email = normalizeEmail(donor?.email || '');
  if (!email) return null;
  return {
    email,
    donor,
    householdId: `learn_household_${slug(email)}`,
  };
}
async function loadLearnSetupSnapshotForIdentity(env, identity) {
  if (!identity?.householdId) return null;
  if (!d1(env)) return devSetupSnapshots.get(identity.householdId) || null;
  try {
    const row = await d1First(env, 'SELECT data FROM learn_households WHERE id = ?1', identity.householdId);
    const snapshot = safeParseJsonRow(row)?.setupSnapshot || null;
    if (snapshot) return snapshot;
  } catch {}
  if (env.AGAPAY_REGISTRATIONS) {
    const stored = await env.AGAPAY_REGISTRATIONS.get(setupKvKey(identity));
    return parseStoredSetup(stored)?.setupSnapshot || null;
  }
  return null;
}
async function loadLearnSetupSnapshot(env, request) {
  const identity = await learnSetupIdentity(request, env);
  if (!identity) return null;
  return loadLearnSetupSnapshotForIdentity(env, identity);
}
async function saveLearnCompletion(env, request, payload = {}) {
  const identity = await learnSetupIdentity(request, env);
  if (!identity) return { ok: false, status: 401, error: 'Unauthorized' };
  const current = await loadLearnSetupSnapshotForIdentity(env, identity);
  if (!current) return { ok: false, status: 400, error: 'Complete Learn setup before tracking progress.' };
  const scope = payload.scope === 'daily' ? 'daily' : payload.scope === 'weekly' ? 'weekly' : '';
  const itemId = text(payload.itemId, '');
  const civilDate = /^\d{4}-\d{2}-\d{2}$/.test(String(payload.civilDate || ''))
    ? String(payload.civilDate)
    : nowIso().slice(0, 10);
  if (!scope || !/^[a-zA-Z0-9:_-]{1,180}$/.test(itemId)) {
    return { ok: false, status: 400, error: 'Progress item was invalid.' };
  }
  const date = /* @__PURE__ */ new Date(`${civilDate}T12:00:00Z`);
  if (scope === 'weekly') date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  const periodKey = date.toISOString().slice(0, 10);
  const completion = normalizeCompletion(current.completion);
  completion[scope][periodKey] = {
    ...(completion[scope][periodKey] || {}),
    [itemId]: Boolean(payload.completed),
  };
  const setupSnapshot = {
    ...current,
    savedAt: nowIso(),
    completion: normalizeCompletion(completion),
  };
  const householdData = JSON.stringify({ ownerEmail: identity.email, setupSnapshot });
  if (!d1(env)) {
    devSetupSnapshots.set(identity.householdId, setupSnapshot);
  } else {
    try {
      await d1Run(
        env,
        'UPDATE learn_households SET data = ?1, updated_at = ?2 WHERE id = ?3',
        householdData,
        setupSnapshot.savedAt,
        identity.householdId
      );
    } catch {}
  }
  if (env.AGAPAY_REGISTRATIONS) await env.AGAPAY_REGISTRATIONS.put(setupKvKey(identity), householdData);
  return { ok: true, setupSnapshot, scope, periodKey, itemId, completed: Boolean(payload.completed) };
}
async function getLearnSeedForIdentity(env, identity, { termId = '', weekDate = '' } = {}) {
  if (!identity) return null;
  let setupSnapshot = await loadLearnSetupSnapshotForIdentity(env, identity);
  const selectedTerm = setupSnapshot?.terms?.find((term) => term.id === termId);
  if (selectedTerm) {
    setupSnapshot = {
      ...clone(setupSnapshot),
      schoolYear: { ...setupSnapshot.schoolYear, currentTermId: selectedTerm.id },
      term: { ...selectedTerm },
    };
  }
  const seed = applySetupSnapshotToSeed(getLearnSeedSnapshot(), setupSnapshot, { weekDate });
  const academicSnapshot = await loadLearnAcademicSnapshot(env, identity.householdId);
  seed.closedAcademicRecords = academicSnapshot.academicRecords;
  seed.closedReportCards = academicSnapshot.reportCards;
  return seed;
}
async function getLearnSeedForRequest(env, request) {
  return getLearnSeedForIdentity(env, await learnSetupIdentity(request, env));
}
async function saveLearnSetup(env, request, payload) {
  const identity = await learnSetupIdentity(request, env);
  if (!identity) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }
  const setupSnapshot = normalizeSetupPayload(payload, identity);
  if (
    setupSnapshot.children.length > LEARN_FREE_CHILD_LIMIT &&
    !(await learnRequestHasFamilyAccessAsync(request, env, identity))
  ) {
    return {
      ok: false,
      status: 402,
      error: `The free AGAPAY Learn plan supports up to ${LEARN_FREE_CHILD_LIMIT} children. Upgrade to the Family plan to save larger households.`,
    };
  }
  const timestamp = setupSnapshot.savedAt;
  if (!d1(env)) {
    devSetupSnapshots.set(identity.householdId, setupSnapshot);
    return {
      ok: true,
      setupSnapshot,
      onboarding: applySetupSnapshotToSeed(getLearnSeedSnapshot(), setupSnapshot),
      storage: 'memory',
    };
  }
  const householdData = JSON.stringify({
    ownerEmail: identity.email,
    setupSnapshot,
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
      storage: 'kv-fallback',
    };
  }
  if (env.AGAPAY_REGISTRATIONS) {
    await env.AGAPAY_REGISTRATIONS.put(setupKvKey(identity), householdData);
  }
  await bestEffort(async () => {
    await d1Run(
      env,
      'DELETE FROM learn_child_tracks WHERE child_id IN (SELECT id FROM learn_children WHERE household_id = ?1)',
      identity.householdId
    );
    await d1Run(env, 'DELETE FROM learn_children WHERE household_id = ?1', identity.householdId);
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
    await d1Run(env, 'DELETE FROM learn_household_streams WHERE household_id = ?1', identity.householdId);
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
    await d1Run(
      env,
      'DELETE FROM learn_book_assignments WHERE book_id IN (SELECT id FROM learn_books WHERE household_id = ?1)',
      identity.householdId
    );
    await d1Run(env, 'DELETE FROM learn_books WHERE household_id = ?1', identity.householdId);
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
        'Household',
        JSON.stringify(book),
        timestamp
      );
    }
  });
  await bestEffort(async () => {
    await d1Run(
      env,
      'DELETE FROM learn_terms WHERE school_year_id IN (SELECT id FROM learn_school_years WHERE household_id = ?1)',
      identity.householdId
    );
    await d1Run(env, 'DELETE FROM learn_school_years WHERE household_id = ?1', identity.householdId);
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
    onboarding: applySetupSnapshotToSeed(getLearnSeedSnapshot(), setupSnapshot),
  };
}
async function saveLearnFamilyPlanning(env, request, payload = {}) {
  const identity = await learnSetupIdentity(request, env);
  if (!identity) return { ok: false, status: 401, error: 'Unauthorized' };
  const current = await loadLearnSetupSnapshotForIdentity(env, identity);
  if (!current) return { ok: false, status: 409, error: 'Complete Learn setup before saving the family planner.' };
  const childNameDays = new Map(
    list(payload.childNameDays).map((entry) => [text(entry.childId, ''), text(entry.nameDay, '')])
  );
  return saveLearnSetup(env, request, {
    ...current,
    household: {
      ...current.household,
      motherName: text(payload.household?.motherName, current.household?.motherName || ''),
      motherNameDay: text(payload.household?.motherNameDay, current.household?.motherNameDay || ''),
      fatherName: text(payload.household?.fatherName, current.household?.fatherName || ''),
      fatherNameDay: text(payload.household?.fatherNameDay, current.household?.fatherNameDay || ''),
      parishPatronalFeastName: text(
        payload.household?.parishPatronalFeastName,
        current.household?.parishPatronalFeastName || ''
      ),
      parishPatronalFeastDate: text(
        payload.household?.parishPatronalFeastDate,
        current.household?.parishPatronalFeastDate || ''
      ),
    },
    children: list(current.children).map((child) => ({
      ...child,
      nameDay: childNameDays.has(child.id) ? childNameDays.get(child.id) : child.nameDay || '',
    })),
    familyPlanning: payload.familyPlanning || current.familyPlanning || {},
  });
}
async function saveLearnGraceMode(env, request, payload = {}) {
  const identity = await learnSetupIdentity(request, env);
  if (!identity) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }
  const current = await loadLearnSetupSnapshotForIdentity(env, identity);
  const nextPreferences = {
    ...(current?.preferences || {}),
    graceModeDefault: graceModeValue(
      payload.mode || payload.graceModeDefault || current?.preferences?.graceModeDefault || 'light'
    ),
    graceModeActive: Boolean(payload.active ?? payload.graceModeActive ?? true),
  };
  const nextPayload = current
    ? {
        household: {
          ...current.household,
          graceModeActive: nextPreferences.graceModeActive,
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
        coOp: current.coOp,
      }
    : {
        household: {
          id: identity.householdId,
          name: 'Your Household',
          graceModeActive: nextPreferences.graceModeActive,
        },
        preferences: nextPreferences,
      };
  return saveLearnSetup(env, request, nextPayload);
}
async function saveLearnPlannerBlock(env, request, payload = {}) {
  const identity = await learnSetupIdentity(request, env);
  if (!identity) return { ok: false, status: 401, error: 'Unauthorized' };
  const current = await loadLearnSetupSnapshotForIdentity(env, identity);
  if (!current) return { ok: false, status: 409, error: 'Complete Learn setup before editing lesson blocks.' };
  const action = text(payload.action, '');
  const blockId = text(payload.blockId, '');
  if (!action || !blockId) return { ok: false, status: 400, error: 'action and blockId are required.' };
  const blockEdits = clone(current.blockEdits || {});
  if (action === 'note') {
    blockEdits[blockId] = { ...(blockEdits[blockId] || {}), note: text(payload.note, ''), updatedAt: nowIso() };
  } else if (action === 'reschedule') {
    const fromDate = text(payload.fromDate, '');
    const toDate = text(payload.toDate, '');
    if (!fromDate || !toDate)
      return { ok: false, status: 400, error: 'fromDate and toDate are required for reschedule.' };
    blockEdits[blockId] = {
      ...(blockEdits[blockId] || {}),
      rescheduledFrom: fromDate,
      rescheduledTo: toDate,
      updatedAt: nowIso(),
    };
  } else if (action === 'complete') {
    const civilDate = /^\d{4}-\d{2}-\d{2}$/.test(String(payload.civilDate || ''))
      ? String(payload.civilDate)
      : nowIso().slice(0, 10);
    const scope = payload.scope === 'daily' ? 'daily' : 'weekly';
    const date = /* @__PURE__ */ new Date(`${civilDate}T12:00:00Z`);
    if (scope === 'weekly') date.setUTCDate(date.getUTCDate() - date.getUTCDay());
    const periodKey = date.toISOString().slice(0, 10);
    const completion = normalizeCompletion(current.completion);
    completion[scope][periodKey] = { ...(completion[scope][periodKey] || {}), [blockId]: Boolean(payload.completed) };
    return saveLearnSetup(env, request, { ...current, blockEdits, completion: normalizeCompletion(completion) });
  } else {
    return { ok: false, status: 400, error: `Unknown action "${action}". Valid: note, reschedule, complete.` };
  }
  return saveLearnSetup(env, request, { ...current, blockEdits });
}
async function saveLearnMoveUnfinishedWork(env, request, payload = {}) {
  const identity = await learnSetupIdentity(request, env);
  if (!identity) return { ok: false, status: 401, error: 'Unauthorized' };
  const current = await loadLearnSetupSnapshotForIdentity(env, identity);
  if (!current) return { ok: false, status: 409, error: 'Complete Learn setup before moving lessons.' };
  const scope = payload.scope === 'child' ? 'child' : 'household';
  const rowId = text(payload.rowId, '');
  const fromWeekday = Number(payload.fromWeekday);
  const mode = payload.mode === 'reserve' ? 'reserve' : 'next-open-day';
  if (!rowId || !Number.isInteger(fromWeekday) || fromWeekday < 0 || fromWeekday > 6) {
    return { ok: false, status: 400, error: 'rowId and a valid fromWeekday (0-6) are required.' };
  }
  const weekDate = /^\d{4}-\d{2}-\d{2}$/.test(String(payload.weekDate || '')) ? String(payload.weekDate) : '';
  const weekReference = weekDate ? /* @__PURE__ */ new Date(`${weekDate}T12:00:00.000Z`) : /* @__PURE__ */ new Date();
  const seedForWeek = applySetupSnapshotToSeed(getLearnSeedSnapshot(), current, { weekDate });
  const week = seedForWeek.plannerWeek || {};
  const weekKey = list(week.dates)[0] || currentWeekWindow(weekReference).dates[0];
  const baseRows = scope === 'child' ? list(week.childRows) : list(week.householdRows);
  const existingOverridesForWeek = clone((current.plannerOverrides || {})[weekKey] || {});
  const { rows: effectiveRows } = applyPlannerOverrides(baseRows, existingOverridesForWeek);
  const result = computeMoveUnfinishedWork({ rows: effectiveRows, rowId, fromWeekday, mode });
  if (!result.ok) return { ok: false, status: 400, error: result.error };
  const plannerOverrides = clone(current.plannerOverrides || {});
  plannerOverrides[weekKey] = { ...(plannerOverrides[weekKey] || {}) };
  plannerOverrides[weekKey][rowId] = {
    ...(plannerOverrides[weekKey][rowId] || {}),
    [result.fromWeekday]: {
      action: result.action,
      movedToWeekday: result.movedToWeekday,
      minutes: result.minutes,
      note: '',
      updatedAt: nowIso(),
    },
  };
  const saved = await saveLearnSetup(env, request, { ...current, plannerOverrides });
  if (!saved.ok) return saved;
  return {
    ok: true,
    ...saved,
    ...result,
    weekStartIso: weekKey,
  };
}
export {
  applySetupSnapshotToSeed2 as applySetupSnapshotToSeed,
  getLearnSeedForIdentity,
  getLearnSeedForRequest,
  learnSetupIdentity,
  loadLearnSetupSnapshot,
  loadLearnSetupSnapshotForIdentity,
  saveLearnCompletion,
  saveLearnFamilyPlanning,
  saveLearnGraceMode,
  saveLearnMoveUnfinishedWork,
  saveLearnPlannerBlock,
  saveLearnSetup,
};
