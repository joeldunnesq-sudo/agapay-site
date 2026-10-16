import type {
  LearnScoreIdentity,
  SetupInputNode,
  LearnSetupSnapshot,
} from './setup-persistence-composition-contracts.js';

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
export { applySetupSnapshotToSeed } from './setup-seed-application.js';

export async function learnSetupIdentity(request: Request, env: Partial<Env>) {
  const donor = await requireDonor(request, env);
  const email = normalizeEmail(donor?.email || '');
  if (!email) return null;
  return {
    email,
    donor,
    householdId: `learn_household_${slug(email)}`,
  };
}

export async function loadLearnSetupSnapshotForIdentity(env: Partial<Env>, identity: LearnScoreIdentity) {
  if (!identity?.householdId) return null;
  if (!d1(env)) return devSetupSnapshots.get(identity.householdId) || null;
  try {
    const row = await d1First(env, 'SELECT data FROM learn_households WHERE id = ?1', identity.householdId);
    const snapshot = (safeParseJsonRow(row) as { setupSnapshot?: LearnSetupSnapshot } | null)?.setupSnapshot || null;
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

export async function loadLearnSetupSnapshot(env: Partial<Env>, request: Request) {
  const identity = await learnSetupIdentity(request, env);
  if (!identity) return null;
  return loadLearnSetupSnapshotForIdentity(env, identity);
}

export async function saveLearnCompletion(env: Partial<Env>, request: Request, payload: SetupInputNode = {}) {
  const identity = await learnSetupIdentity(request, env);
  if (!identity) return { ok: false as const, status: 401, error: 'Unauthorized' };
  const current = await loadLearnSetupSnapshotForIdentity(env, identity);
  if (!current) return { ok: false as const, status: 400, error: 'Complete Learn setup before tracking progress.' };

  const scope = payload.scope === 'daily' ? 'daily' : payload.scope === 'weekly' ? 'weekly' : '';
  const itemId = text(payload.itemId, '');
  const civilDate = /^\d{4}-\d{2}-\d{2}$/.test(String(payload.civilDate || ''))
    ? String(payload.civilDate)
    : nowIso().slice(0, 10);
  if (!scope || !/^[a-zA-Z0-9:_-]{1,180}$/.test(itemId)) {
    return { ok: false as const, status: 400, error: 'Progress item was invalid.' };
  }

  const date = new Date(`${civilDate}T12:00:00Z`);
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
    } catch {
      // D1 write failed — KV below is the fallback source of truth.
    }
  }
  if (env.AGAPAY_REGISTRATIONS) await env.AGAPAY_REGISTRATIONS.put(setupKvKey(identity), householdData);
  return { ok: true as const, setupSnapshot, scope, periodKey, itemId, completed: Boolean(payload.completed) };
}

export async function getLearnSeedForIdentity(
  env: Partial<Env>,
  identity: LearnScoreIdentity | null,
  { termId = '', weekDate = '' }: { termId?: string; weekDate?: string } = {}
) {
  if (!identity) return null;
  let setupSnapshot = await loadLearnSetupSnapshotForIdentity(env, identity);
  const selectedTerm = setupSnapshot?.terms?.find((term) => term.id === termId);
  if (selectedTerm) {
    setupSnapshot = {
      ...clone(setupSnapshot!),
      schoolYear: { ...setupSnapshot!.schoolYear, currentTermId: selectedTerm.id },
      term: { ...selectedTerm },
    };
  }
  const seed = applySetupSnapshotToSeed(getLearnSeedSnapshot(), setupSnapshot, { weekDate });
  const academicSnapshot = await loadLearnAcademicSnapshot(env, identity.householdId);
  seed.closedAcademicRecords = academicSnapshot.academicRecords;
  seed.closedReportCards = academicSnapshot.reportCards;
  return seed;
}

export async function getLearnSeedForRequest(env: Partial<Env>, request: Request) {
  return getLearnSeedForIdentity(env, await learnSetupIdentity(request, env));
}

export async function saveLearnSetup(env: Partial<Env>, request: Request, payload: SetupInputNode) {
  const identity = await learnSetupIdentity(request, env);
  if (!identity) {
    return { ok: false as const, status: 401, error: 'Unauthorized' };
  }
  const setupSnapshot = normalizeSetupPayload(payload, identity);
  if (
    setupSnapshot.children.length > LEARN_FREE_CHILD_LIMIT &&
    !(await learnRequestHasFamilyAccessAsync(request, env, identity))
  ) {
    return {
      ok: false as const,
      status: 402,
      error: `The free AGAPAY Learn plan supports up to ${LEARN_FREE_CHILD_LIMIT} children. Upgrade to the Family plan to save larger households.`,
    };
  }
  const timestamp = setupSnapshot.savedAt;
  if (!d1(env)) {
    devSetupSnapshots.set(identity.householdId, setupSnapshot);
    return {
      ok: true as const,
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
      ok: true as const,
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
    ok: true as const,
    setupSnapshot,
    onboarding: applySetupSnapshotToSeed(getLearnSeedSnapshot(), setupSnapshot),
  };
}

export async function saveLearnFamilyPlanning(env: Partial<Env>, request: Request, payload: SetupInputNode = {}) {
  const identity = await learnSetupIdentity(request, env);
  if (!identity) return { ok: false as const, status: 401, error: 'Unauthorized' };
  const current = await loadLearnSetupSnapshotForIdentity(env, identity);
  if (!current)
    return { ok: false as const, status: 409, error: 'Complete Learn setup before saving the family planner.' };
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

export async function saveLearnGraceMode(env: Partial<Env>, request: Request, payload: SetupInputNode = {}) {
  const identity = await learnSetupIdentity(request, env);
  if (!identity) {
    return { ok: false as const, status: 401, error: 'Unauthorized' };
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

// Save a single lesson block edit (note, reschedule, or completion) to the setup snapshot.
// Accepts: { action: "note"|"reschedule"|"complete", blockId, note, fromDate, toDate, completed }
export async function saveLearnPlannerBlock(env: Partial<Env>, request: Request, payload: SetupInputNode = {}) {
  const identity = await learnSetupIdentity(request, env);
  if (!identity) return { ok: false as const, status: 401, error: 'Unauthorized' };
  const current = await loadLearnSetupSnapshotForIdentity(env, identity);
  if (!current) return { ok: false as const, status: 409, error: 'Complete Learn setup before editing lesson blocks.' };

  const action = text(payload.action, '');
  const blockId = text(payload.blockId, '');
  if (!action || !blockId) return { ok: false as const, status: 400, error: 'action and blockId are required.' };

  const blockEdits = clone(current.blockEdits || {});

  if (action === 'note') {
    blockEdits[blockId] = { ...(blockEdits[blockId] || {}), note: text(payload.note, ''), updatedAt: nowIso() };
  } else if (action === 'reschedule') {
    const fromDate = text(payload.fromDate, '');
    const toDate = text(payload.toDate, '');
    if (!fromDate || !toDate)
      return { ok: false as const, status: 400, error: 'fromDate and toDate are required for reschedule.' };
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
    const date = new Date(`${civilDate}T12:00:00Z`);
    if (scope === 'weekly') date.setUTCDate(date.getUTCDate() - date.getUTCDay());
    const periodKey = date.toISOString().slice(0, 10);
    const completion = normalizeCompletion(current.completion);
    completion[scope][periodKey] = { ...(completion[scope][periodKey] || {}), [blockId]: Boolean(payload.completed) };
    return saveLearnSetup(env, request, { ...current, blockEdits, completion: normalizeCompletion(completion) });
  } else {
    return { ok: false as const, status: 400, error: `Unknown action "${action}". Valid: note, reschedule, complete.` };
  }

  return saveLearnSetup(env, request, { ...current, blockEdits });
}

// "Move unfinished work": moves a day's unfinished lesson to the next open
// day this week, or sets it aside in Reserve for whenever there's a roomier
// day. Shares computeMoveUnfinishedWork()/applyPlannerOverrides() with
// repository.js's buildPlannerWeek() (both import from ./planner-overrides.js)
// so the read side (what the planner/print shows) and this write side always
// agree on what counts as "the next open day."
// Accepts: { scope: "household"|"child", rowId, fromWeekday (0-6), mode: "next-open-day"|"reserve", weekDate }
export async function saveLearnMoveUnfinishedWork(env: Partial<Env>, request: Request, payload: SetupInputNode = {}) {
  const identity = await learnSetupIdentity(request, env);
  if (!identity) return { ok: false as const, status: 401, error: 'Unauthorized' };
  const current = await loadLearnSetupSnapshotForIdentity(env, identity);
  if (!current) return { ok: false as const, status: 409, error: 'Complete Learn setup before moving lessons.' };

  const scope = payload.scope === 'child' ? 'child' : 'household';
  const rowId = text(payload.rowId, '');
  const fromWeekday = Number(payload.fromWeekday);
  const mode = payload.mode === 'reserve' ? 'reserve' : 'next-open-day';
  if (!rowId || !Number.isInteger(fromWeekday) || fromWeekday < 0 || fromWeekday > 6) {
    return { ok: false as const, status: 400, error: 'rowId and a valid fromWeekday (0-6) are required.' };
  }

  const weekDate = /^\d{4}-\d{2}-\d{2}$/.test(String(payload.weekDate || '')) ? String(payload.weekDate) : '';
  const weekReference = weekDate ? new Date(`${weekDate}T12:00:00.000Z`) : new Date();
  const seedForWeek = applySetupSnapshotToSeed(getLearnSeedSnapshot(), current, { weekDate });
  const week = seedForWeek.plannerWeek || {};
  const weekKey = list(week.dates)[0] || currentWeekWindow(weekReference).dates[0];
  const baseRows = scope === 'child' ? list(week.childRows) : list(week.householdRows);

  // Apply any prior overrides for this week first, so the move sees the
  // currently-effective state (e.g. a day already moved earlier).
  const existingOverridesForWeek = clone((current.plannerOverrides || {})[weekKey] || {});
  const { rows: effectiveRows } = applyPlannerOverrides(baseRows, existingOverridesForWeek);

  const result = computeMoveUnfinishedWork({ rows: effectiveRows, rowId, fromWeekday, mode });
  if (!result.ok) return { ok: false as const, status: 400, error: result.error };

  const plannerOverrides = clone(current.plannerOverrides || {});
  plannerOverrides[weekKey] = { ...(plannerOverrides[weekKey] || {}) };
  plannerOverrides[weekKey][rowId] = {
    ...(plannerOverrides[weekKey][rowId] || {}),
    [result.fromWeekday as number]: {
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
    ok: true as const,
    ...(saved as Omit<typeof saved, 'ok'> & { ok?: true }),
    ...(result as Omit<typeof result, 'ok'> & { ok?: true }),
    weekStartIso: weekKey,
  };
}
export type { LearnSetupSnapshot } from './setup-persistence-composition-contracts.js';
