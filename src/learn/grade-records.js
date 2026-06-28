import { d1, d1All, d1Run, json, unauthorized } from "../lib/core.js";
import { calculateCumulativeGPA } from "./gpa.js";
import { getLearnSeedForIdentity, learnSetupIdentity, loadLearnSetupSnapshotForIdentity } from "./setup-persistence.js";

const devAttendanceEntries = new Map();

function list(value) {
  return Array.isArray(value) ? value : [];
}

function text(value, fallback = "") {
  const resolved = String(value ?? "").trim();
  return resolved || fallback;
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function integer(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stableSegment(value, fallback = "item") {
  return text(value, fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || fallback;
}

function safeJson(value, fallback = {}) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function academicYearId(householdId, name) {
  return `academic_year_${stableSegment(householdId, "household")}_${stableSegment(name, "year")}`;
}

function courseId(householdId, childId, academicYearName, title) {
  return `course_${stableSegment(householdId, "household")}_${stableSegment(childId, "child")}_${stableSegment(academicYearName, "year")}_${stableSegment(title, "course")}`;
}

function gradeId(courseIdValue, termIndex) {
  return `grade_${stableSegment(courseIdValue, "course")}_term_${termIndex}`;
}

function attendanceId(childId, academicYearName, date) {
  return `attendance_${stableSegment(childId, "child")}_${stableSegment(academicYearName, "year")}_${stableSegment(date, "date")}`;
}

function defaultAcademicYearName(setupSnapshot = {}) {
  return text(setupSnapshot.schoolYear?.label || setupSnapshot.schoolYear?.name, new Date().getFullYear().toString());
}

function setupFromHouseholdRow(row) {
  return safeJson(row?.data, {})?.setupSnapshot || null;
}

function gradeLevelForChild(child = {}) {
  const label = text(child.gradeLabel || child.formLabel, "");
  const match = label.match(/\b(9|10|11|12)\b/);
  return match ? Number(match[1]) : 9;
}

function setupTerms(setupSnapshot = {}) {
  const terms = list(setupSnapshot.terms).length
    ? list(setupSnapshot.terms)
    : list(setupSnapshot.schoolYear?.terms);
  if (terms.length) {
    return terms.map((term, index) => ({
      id: text(term.id, `term_${index + 1}`),
      label: text(term.label || term.name, `Term ${index + 1}`),
      index: index + 1,
      startDate: text(term.startDate || term.start_date, ""),
      endDate: text(term.endDate || term.end_date, "")
    }));
  }
  return [1, 2, 3].map((index) => ({ id: `term_${index}`, label: `Term ${index}`, index, startDate: "", endDate: "" }));
}

function currentTermIndex(setupSnapshot = {}) {
  const terms = setupTerms(setupSnapshot);
  const currentId = text(setupSnapshot.schoolYear?.currentTermId || setupSnapshot.term?.id, "");
  return terms.find((term) => term.id === currentId)?.index || 1;
}

function labelsFrom(value) {
  if (Array.isArray(value)) return value.map((entry) => text(entry, "")).filter(Boolean);
  return text(value, "").split(",").map((entry) => entry.trim()).filter(Boolean);
}

function childrenForSetupItem(item = {}, children = []) {
  const childIds = new Set(labelsFrom(item.childIds || item.childId));
  if (childIds.size) return children.filter((child) => childIds.has(child.id));
  const formLabels = new Set(labelsFrom(item.formLabels || item.formLabel || item.gradeLabel));
  if (formLabels.size) {
    return children.filter((child) => formLabels.has(child.formLabel) || formLabels.has(child.gradeLabel));
  }
  const mode = text(item.planningMode, "").toLowerCase();
  if (mode === "child" || mode === "individual") return [];
  return children;
}

function termIdsForSetupItem(item = {}, terms = []) {
  const explicit = labelsFrom(item.termIds || item.termId || item.assignedTermId);
  if (explicit.length) return explicit;
  return terms.map((term) => term.id);
}

function courseCategory(item = {}, fallback = "General") {
  const raw = text(item.subjectType || item.blockType || item.category || item.type, fallback);
  const normalized = raw.toLowerCase();
  if (/english|language|reading|phonics|grammar|composition|literature/.test(normalized)) return "English";
  if (/math/.test(normalized)) return "Math";
  if (/science|nature/.test(normalized)) return "Science";
  if (/history|geography|social/.test(normalized)) return "History";
  if (/catechesis|theology|formation|recitation|memory|hymn|church/.test(normalized)) return "Theology/Formation";
  if (/language|lote|latin|greek|spanish|french/.test(normalized)) return "World Language";
  if (/art|music|fine/.test(normalized)) return "Fine Arts";
  return raw;
}

function blankGradesForTerms(courseIdValue, termCount) {
  return Array.from({ length: Math.max(1, termCount) }, (_, index) => {
    const termIndex = index + 1;
    return {
      id: gradeId(courseIdValue, termIndex),
      termIndex,
      numericScore: null,
      letterGrade: "",
      teacherNotes: "",
      attendanceDays: 0
    };
  });
}

function setupCourseTemplates(setupSnapshot = {}, children = [], academicYearName = "") {
  const householdId = setupSnapshot.identity?.householdId || setupSnapshot.household?.id || "household";
  const terms = setupTerms(setupSnapshot);
  const termCount = terms.length || 3;
  const setupItems = [
    ...list(setupSnapshot.subjects).map((item) => ({ ...item, setupKind: "subject" })),
    ...list(setupSnapshot.formation?.enrichmentBlocks).map((item) => ({ ...item, setupKind: "enrichment" })),
    ...list(setupSnapshot.formationSetup?.enrichmentBlocks).map((item) => ({ ...item, setupKind: "enrichment" }))
  ];
  const seen = new Set();
  return setupItems.flatMap((item, index) => {
    const title = text(item.title || item.courseTitle || item.blockType, item.setupKind === "enrichment" ? "Enrichment" : "Subject");
    const assignedChildren = childrenForSetupItem(item, children);
    const termIds = termIdsForSetupItem(item, terms);
    return assignedChildren.map((child) => {
      const id = courseId(
        householdId,
        child.id,
        academicYearName,
        `${item.setupKind}-${item.id || index}-${title}`
      );
      if (seen.has(id)) return null;
      seen.add(id);
      const highSchool = gradeLevelForChild(child) >= 9;
      return {
        id,
        childId: child.id,
        courseTitle: title,
        subjectCategory: courseCategory(item, item.setupKind === "enrichment" ? "Fine Arts" : "General"),
        gradeLevel: gradeLevelForChild(child),
        creditHours: Math.max(0, number(item.credits ?? item.creditHours, highSchool ? 1 : 0)),
        sourceSetupId: text(item.id, ""),
        sourceKind: item.setupKind,
        termIds,
        setupSeeded: true,
        grades: blankGradesForTerms(id, termCount)
      };
    }).filter(Boolean);
  });
}

function mergeSetupAndSavedCourses(setupCourses = [], savedCourses = []) {
  const merged = new Map(setupCourses.map((course) => [course.id, { ...course, grades: list(course.grades).map((grade) => ({ ...grade })) }]));
  for (const saved of list(savedCourses)) {
    const existing = merged.get(saved.id);
    if (!existing) {
      merged.set(saved.id, { ...saved, setupSeeded: false, termIds: [], grades: list(saved.grades) });
      continue;
    }
    const savedGrades = new Map(list(saved.grades).map((grade) => [integer(grade.termIndex ?? grade.term_index, 0), grade]));
    merged.set(saved.id, {
      ...existing,
      ...saved,
      setupSeeded: true,
      sourceSetupId: existing.sourceSetupId,
      sourceKind: existing.sourceKind,
      termIds: existing.termIds,
      grades: list(existing.grades).map((grade) => ({
        ...grade,
        ...(savedGrades.get(integer(grade.termIndex, 0)) || {})
      }))
    });
  }
  return [...merged.values()].sort((a, b) =>
    String(a.childId).localeCompare(String(b.childId))
    || String(a.subjectCategory).localeCompare(String(b.subjectCategory))
    || String(a.courseTitle).localeCompare(String(b.courseTitle))
  );
}

function normalizeCoursePayload(course = {}, { householdId, childId, academicYearName }) {
  const title = text(course.courseTitle || course.course_title, "Untitled Course").slice(0, 160);
  const resolvedCourseId = text(course.id, courseId(householdId, childId, academicYearName, title));
  return {
    id: resolvedCourseId,
    courseTitle: title,
    subjectCategory: text(course.subjectCategory || course.subject_category, "General").slice(0, 80),
    gradeLevel: Math.max(9, Math.min(12, integer(course.gradeLevel ?? course.grade_level, 9))),
    creditHours: Math.max(0, number(course.creditHours ?? course.credit_hours, 1)),
    grades: [1, 2, 3].map((termIndex) => {
      const grade = list(course.grades).find((entry) => integer(entry.termIndex ?? entry.term_index, 0) === termIndex) || {};
      const numeric = grade.numericScore ?? grade.numeric_score;
      return {
        id: text(grade.id, gradeId(resolvedCourseId, termIndex)),
        termIndex,
        numericScore: numeric === "" || numeric === null || numeric === undefined ? null : Math.max(0, Math.min(100, number(numeric, 0))),
        letterGrade: text(grade.letterGrade || grade.letter_grade, "").slice(0, 8),
        teacherNotes: text(grade.teacherNotes || grade.teacher_notes, "").slice(0, 2400),
        attendanceDays: Math.max(0, integer(grade.attendanceDays ?? grade.attendance_days, 0))
      };
    })
  };
}

function finalLetterGrade(course = {}) {
  const grades = list(course.grades).filter((grade) => grade.letterGrade);
  return grades.length ? grades[grades.length - 1].letterGrade : "";
}

function courseSummary(courses = []) {
  const flat = list(courses).map((course) => ({
    creditHours: course.creditHours,
    letterGrade: finalLetterGrade(course)
  }));
  const credits = flat.reduce((sum, course) => course.letterGrade ? sum + number(course.creditHours, 0) : sum, 0);
  return {
    totalCredits: credits.toFixed(1),
    cumulativeGpa: calculateCumulativeGPA(flat),
    missingGrades: list(courses).reduce((sum, course) => sum + list(course.grades).filter((grade) => !grade.letterGrade).length, 0),
    courseCount: list(courses).length
  };
}

function isoDate(value) {
  const normalized = text(value, "");
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

function attendanceStatus(value) {
  const status = text(value, "present").toLowerCase();
  return ["present", "absent", "excused", "holiday"].includes(status) ? status : "present";
}

function mondayForDate(date = new Date()) {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = copy.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  copy.setUTCDate(copy.getUTCDate() + offset);
  return copy;
}

function attendanceWeekDates(reference = new Date()) {
  const monday = mondayForDate(reference);
  return Array.from({ length: 5 }, (_, index) => {
    const date = new Date(monday);
    date.setUTCDate(monday.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
}

function attendanceSummary(children = [], entries = []) {
  const byChild = new Map(children.map((child) => [child.id, { childId: child.id, present: 0, absent: 0, excused: 0, holiday: 0, instructionalDays: 0 }]));
  for (const entry of list(entries)) {
    if (!byChild.has(entry.childId)) continue;
    const row = byChild.get(entry.childId);
    row[entry.status] = (row[entry.status] || 0) + 1;
    if (entry.status === "present" || entry.status === "excused") row.instructionalDays += 1;
  }
  const rows = [...byChild.values()];
  return {
    totalPresent: rows.reduce((sum, row) => sum + row.present, 0),
    totalAbsent: rows.reduce((sum, row) => sum + row.absent, 0),
    totalExcused: rows.reduce((sum, row) => sum + row.excused, 0),
    instructionalDays: rows.reduce((sum, row) => sum + row.instructionalDays, 0),
    byChild: rows
  };
}

function attendanceStoreKey(householdId, academicYearName) {
  return `${householdId}::${academicYearName}`;
}

function devAttendanceFor(householdId, academicYearName) {
  return list(devAttendanceEntries.get(attendanceStoreKey(householdId, academicYearName)));
}

function saveDevAttendance(householdId, academicYearName, entries = []) {
  const key = attendanceStoreKey(householdId, academicYearName);
  const byEntry = new Map(devAttendanceFor(householdId, academicYearName).map((entry) => [`${entry.childId}::${entry.date}`, entry]));
  for (const entry of entries) {
    byEntry.set(`${entry.childId}::${entry.date}`, {
      id: attendanceId(entry.childId, academicYearName, entry.date),
      ...entry
    });
  }
  const saved = [...byEntry.values()].sort((a, b) => b.date.localeCompare(a.date) || a.childId.localeCompare(b.childId));
  devAttendanceEntries.set(key, saved);
  return saved;
}

async function loadSetup(env, householdId) {
  if (!d1(env)) return null;
  const rows = await d1All(env, "SELECT data FROM learn_households WHERE id = ?1", householdId);
  return setupFromHouseholdRow(rows[0]);
}

async function loadSetupForIdentity(env, identity) {
  return loadLearnSetupSnapshotForIdentity(env, identity);
}

async function loadChildren(env, householdId, setupSnapshot) {
  if (!d1(env)) return list(setupSnapshot?.children);
  const rows = await d1All(env, "SELECT id, first_name, age_years, grade_label, data FROM learn_children WHERE household_id = ?1 AND active = 1 ORDER BY first_name", householdId);
  if (!rows.length) return list(setupSnapshot?.children);
  return rows.map((row, index) => {
    const stored = safeJson(row.data, {});
    return {
      ...stored,
      id: row.id,
      firstName: row.first_name || stored.firstName || `Child ${index + 1}`,
      ageYears: row.age_years,
      gradeLabel: row.grade_label || stored.gradeLabel || ""
    };
  });
}

async function loadCourses(env, householdId, academicYearName) {
  if (!d1(env)) return [];
  let rows = [];
  try {
    rows = await d1All(
      env,
      `SELECT
         c.id AS course_id,
         c.child_id,
         c.course_title,
         c.grade_level,
         c.credit_hours,
         c.subject_category,
         g.id AS grade_id,
         g.term_index,
         g.numeric_score,
         g.letter_grade,
         g.teacher_notes,
         g.attendance_days
       FROM courses c
       JOIN academic_years ay ON ay.id = c.academic_year_id
       LEFT JOIN grades_and_progress g ON g.course_id = c.id
       WHERE c.household_id = ?1 AND ay.name = ?2
       ORDER BY c.child_id, c.grade_level, c.subject_category, c.course_title, g.term_index`,
      householdId,
      academicYearName
    );
  } catch {
    return [];
  }
  const byCourse = new Map();
  rows.forEach((row) => {
    if (!byCourse.has(row.course_id)) {
      byCourse.set(row.course_id, {
        id: row.course_id,
        childId: row.child_id,
        courseTitle: row.course_title,
        gradeLevel: row.grade_level,
        creditHours: row.credit_hours,
        subjectCategory: row.subject_category,
        grades: []
      });
    }
    if (row.term_index) {
      byCourse.get(row.course_id).grades.push({
        id: row.grade_id,
        termIndex: row.term_index,
        numericScore: row.numeric_score,
        letterGrade: row.letter_grade || "",
        teacherNotes: row.teacher_notes || "",
        attendanceDays: row.attendance_days || 0
      });
    }
  });
  return [...byCourse.values()].map((course) => ({
    ...course,
    grades: [1, 2, 3].map((termIndex) => course.grades.find((grade) => grade.termIndex === termIndex) || {
      id: gradeId(course.id, termIndex),
      termIndex,
      numericScore: null,
      letterGrade: "",
      teacherNotes: "",
      attendanceDays: 0
    })
  }));
}

async function loadAttendance(env, householdId, academicYearName) {
  if (!d1(env)) return [];
  try {
    const rows = await d1All(
      env,
      `SELECT a.id, a.household_id, a.child_id, a.attendance_date, a.status, a.minutes, a.notes
       FROM learn_attendance_days a
       JOIN academic_years ay ON ay.id = a.academic_year_id
       WHERE a.household_id = ?1 AND ay.name = ?2
       ORDER BY a.attendance_date DESC, a.child_id`,
      householdId,
      academicYearName
    );
    return rows.map((row) => ({
      id: row.id,
      childId: row.child_id,
      date: row.attendance_date,
      status: attendanceStatus(row.status),
      minutes: integer(row.minutes, 0),
      notes: row.notes || ""
    }));
  } catch {
    return [];
  }
}

async function ensureLearnBaseRows(env, identity, setupSnapshot, children) {
  if (!d1(env) || !identity?.householdId) return;
  const timestamp = new Date().toISOString();
  const household = setupSnapshot?.household || {};
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
    stableSegment(household.name || identity.householdId, identity.householdId),
    text(household.name, "Your Household"),
    list(children).length,
    text(setupSnapshot?.preferences?.calendarType || household.liturgicalCalendarType, "julian"),
    text(setupSnapshot?.preferences?.paceMode || household.paceMode, "steady"),
    setupSnapshot?.preferences?.graceModeActive ? 1 : 0,
    JSON.stringify({ ownerEmail: identity.email, setupSnapshot }),
    timestamp
  );
  for (const child of list(children)) {
    await d1Run(
      env,
      `INSERT INTO learn_children (id, household_id, first_name, age_years, grade_label, active, data, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?7, ?7)
       ON CONFLICT(id) DO UPDATE SET
         first_name = excluded.first_name,
         age_years = excluded.age_years,
         grade_label = excluded.grade_label,
         active = 1,
         data = excluded.data,
         updated_at = excluded.updated_at`,
      child.id,
      identity.householdId,
      text(child.firstName || child.name, "Student"),
      integer(child.ageYears, 0),
      text(child.gradeLabel || child.formLabel, ""),
      JSON.stringify(child),
      timestamp
    );
  }
}

function buildGradesPayload({ householdId, setupSnapshot, children, academicYearName, courses, attendanceEntries = [] }) {
  const selectedChildId = children[0]?.id || "";
  const terms = setupTerms(setupSnapshot);
  return {
    household: {
      id: householdId,
      name: text(setupSnapshot?.household?.name, "Your Household")
    },
    academicYear: {
      id: academicYearId(householdId, academicYearName),
      name: academicYearName
    },
    terms,
    currentTermIndex: currentTermIndex(setupSnapshot),
    children: children.map((child, index) => ({
      id: child.id,
      firstName: text(child.firstName || child.name, `Child ${index + 1}`),
      name: text(child.firstName || child.name, `Child ${index + 1}`),
      gradeLabel: text(child.gradeLabel || child.formLabel, ""),
      gradeLevel: gradeLevelForChild(child)
    })),
    courses,
    attendance: {
      entries: attendanceEntries,
      weekDates: attendanceWeekDates(),
      statuses: ["present", "absent", "excused", "holiday"],
      summary: attendanceSummary(children, attendanceEntries)
    },
    selectedChildId,
    summary: courseSummary(courses)
  };
}

export async function handleLearnGrades(request, env) {
  const identity = await learnSetupIdentity(request, env);
  if (!identity) return unauthorized();
  if (!d1(env)) {
    const seed = await getLearnSeedForIdentity(env, identity);
    const academicYearName = defaultAcademicYearName(seed?.setupSnapshot || { schoolYear: seed?.schoolYear });
    return json({
      ok: true,
      grades: buildGradesPayload({
        householdId: identity.householdId,
        setupSnapshot: seed?.setupSnapshot || seed,
        children: list(seed?.children),
        academicYearName,
        courses: setupCourseTemplates(seed?.setupSnapshot || seed, list(seed?.children), academicYearName),
        attendanceEntries: devAttendanceFor(identity.householdId, academicYearName)
      })
    });
  }

  const setupSnapshot = await loadSetupForIdentity(env, identity);
  const children = await loadChildren(env, identity.householdId, setupSnapshot);
  const url = new URL(request.url);
  const academicYearName = text(url.searchParams.get("academicYear") || defaultAcademicYearName(setupSnapshot), defaultAcademicYearName(setupSnapshot));
  const savedCourses = await loadCourses(env, identity.householdId, academicYearName);
  const courses = mergeSetupAndSavedCourses(setupCourseTemplates(setupSnapshot, children, academicYearName), savedCourses);
  const attendanceEntries = await loadAttendance(env, identity.householdId, academicYearName);

  return json({
    ok: true,
    grades: buildGradesPayload({
      householdId: identity.householdId,
      setupSnapshot,
      children,
      academicYearName,
      courses,
      attendanceEntries
    })
  });
}

export async function handleLearnGradesSave(request, env) {
  const identity = await learnSetupIdentity(request, env);
  if (!identity) return unauthorized();
  if (!d1(env)) return json({ ok: false, error: "D1 is required for grade records." }, { status: 503 });

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") return json({ ok: false, error: "Grade payload was invalid." }, { status: 400 });

  const setupSnapshot = await loadSetupForIdentity(env, identity);
  const children = await loadChildren(env, identity.householdId, setupSnapshot);
  const childIds = new Set(children.map((child) => child.id));
  const childId = text(payload.childId || children[0]?.id, "");
  if (!childIds.has(childId)) return json({ ok: false, error: "Choose a child from this household before saving grades." }, { status: 400 });

  const academicYearName = text(payload.academicYear?.name || payload.academicYearName || defaultAcademicYearName(setupSnapshot), defaultAcademicYearName(setupSnapshot));
  const resolvedAcademicYearId = academicYearId(identity.householdId, academicYearName);
  const timestamp = new Date().toISOString();
  const courses = list(payload.courses)
    .map((course) => normalizeCoursePayload(course, { householdId: identity.householdId, childId, academicYearName }))
    .filter((course) => course.courseTitle);
  const keepCourseIds = courses.map((course) => course.id);

  await ensureLearnBaseRows(env, identity, setupSnapshot, children);

  await d1Run(
    env,
    `INSERT INTO academic_years (id, household_id, name, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?4)
     ON CONFLICT(household_id, name) DO UPDATE SET updated_at = excluded.updated_at`,
    resolvedAcademicYearId,
    identity.householdId,
    academicYearName,
    timestamp
  );

  for (const course of courses) {
    await d1Run(
      env,
      `INSERT INTO courses (id, household_id, child_id, academic_year_id, course_title, grade_level, credit_hours, subject_category, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)
       ON CONFLICT(id) DO UPDATE SET
         course_title = excluded.course_title,
         grade_level = excluded.grade_level,
         credit_hours = excluded.credit_hours,
         subject_category = excluded.subject_category,
         updated_at = excluded.updated_at`,
      course.id,
      identity.householdId,
      childId,
      resolvedAcademicYearId,
      course.courseTitle,
      course.gradeLevel,
      course.creditHours,
      course.subjectCategory,
      timestamp
    );
    for (const grade of course.grades) {
      await d1Run(
        env,
        `INSERT INTO grades_and_progress (id, course_id, term_index, numeric_score, letter_grade, teacher_notes, attendance_days, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
         ON CONFLICT(course_id, term_index) DO UPDATE SET
           numeric_score = excluded.numeric_score,
           letter_grade = excluded.letter_grade,
           teacher_notes = excluded.teacher_notes,
           attendance_days = excluded.attendance_days,
           updated_at = excluded.updated_at`,
        grade.id,
        course.id,
        grade.termIndex,
        grade.numericScore,
        grade.letterGrade,
        grade.teacherNotes,
        grade.attendanceDays,
        timestamp
      );
    }
  }

  const placeholders = keepCourseIds.map((_, index) => `?${index + 4}`).join(", ");
  if (keepCourseIds.length) {
    await d1Run(
      env,
      `DELETE FROM courses
       WHERE household_id = ?1 AND child_id = ?2 AND academic_year_id = ?3 AND id NOT IN (${placeholders})`,
      identity.householdId,
      childId,
      resolvedAcademicYearId,
      ...keepCourseIds
    );
  } else {
    await d1Run(
      env,
      "DELETE FROM courses WHERE household_id = ?1 AND child_id = ?2 AND academic_year_id = ?3",
      identity.householdId,
      childId,
      resolvedAcademicYearId
    );
  }

  const savedCourses = await loadCourses(env, identity.householdId, academicYearName);
  const mergedCourses = mergeSetupAndSavedCourses(setupCourseTemplates(setupSnapshot, children, academicYearName), savedCourses);
  return json({
    ok: true,
    savedAt: timestamp,
    grades: buildGradesPayload({
      householdId: identity.householdId,
      setupSnapshot,
      children,
      academicYearName,
      courses: mergedCourses,
      attendanceEntries: await loadAttendance(env, identity.householdId, academicYearName)
    })
  });
}

export async function handleLearnAttendanceSave(request, env) {
  const identity = await learnSetupIdentity(request, env);
  if (!identity) return unauthorized();

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") return json({ ok: false, error: "Attendance payload was invalid." }, { status: 400 });

  const setupSnapshot = d1(env) ? await loadSetupForIdentity(env, identity) : null;
  const seed = !d1(env) ? await getLearnSeedForIdentity(env, identity) : null;
  const setupForPayload = setupSnapshot || seed?.setupSnapshot || seed;
  const children = await loadChildren(env, identity.householdId, setupSnapshot);
  const resolvedChildren = children.length ? children : list(seed?.children);
  const childIds = new Set(resolvedChildren.map((child) => child.id));
  const academicYearName = text(payload.academicYearName || payload.academicYear?.name || defaultAcademicYearName(setupForPayload), defaultAcademicYearName(setupForPayload));
  const resolvedAcademicYearId = academicYearId(identity.householdId, academicYearName);
  const timestamp = new Date().toISOString();
  const entries = list(payload.entries)
    .map((entry) => ({
      childId: text(entry.childId, ""),
      date: isoDate(entry.date),
      status: attendanceStatus(entry.status),
      minutes: Math.max(0, integer(entry.minutes, 0)),
      notes: text(entry.notes, "").slice(0, 800)
    }))
    .filter((entry) => childIds.has(entry.childId) && entry.date);

  if (!d1(env)) {
    const attendanceEntries = saveDevAttendance(identity.householdId, academicYearName, entries);
    return json({
      ok: true,
      savedAt: timestamp,
      grades: buildGradesPayload({
        householdId: identity.householdId,
        setupSnapshot: setupForPayload,
        children: resolvedChildren,
        academicYearName,
        courses: setupCourseTemplates(setupForPayload, resolvedChildren, academicYearName),
        attendanceEntries
      })
    });
  }

  await ensureLearnBaseRows(env, identity, setupSnapshot, resolvedChildren);
  await d1Run(
    env,
    `INSERT INTO academic_years (id, household_id, name, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?4)
     ON CONFLICT(household_id, name) DO UPDATE SET updated_at = excluded.updated_at`,
    resolvedAcademicYearId,
    identity.householdId,
    academicYearName,
    timestamp
  );

  for (const entry of entries) {
    await d1Run(
      env,
      `INSERT INTO learn_attendance_days (id, household_id, child_id, academic_year_id, attendance_date, status, minutes, notes, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)
       ON CONFLICT(child_id, academic_year_id, attendance_date) DO UPDATE SET
         status = excluded.status,
         minutes = excluded.minutes,
         notes = excluded.notes,
         updated_at = excluded.updated_at`,
      attendanceId(entry.childId, academicYearName, entry.date),
      identity.householdId,
      entry.childId,
      resolvedAcademicYearId,
      entry.date,
      entry.status,
      entry.minutes,
      entry.notes,
      timestamp
    );
  }

  const savedCourses = await loadCourses(env, identity.householdId, academicYearName);
  const courses = mergeSetupAndSavedCourses(setupCourseTemplates(setupForPayload, resolvedChildren, academicYearName), savedCourses);
  return json({
    ok: true,
    savedAt: timestamp,
    grades: buildGradesPayload({
      householdId: identity.householdId,
      setupSnapshot,
      children: resolvedChildren,
      academicYearName,
      courses,
      attendanceEntries: await loadAttendance(env, identity.householdId, academicYearName)
    })
  });
}
