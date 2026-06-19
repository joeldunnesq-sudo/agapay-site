import { d1, d1All, d1Run } from "../lib/core.js";

const LEARN_ACADEMIC_RECORDS_KV_PREFIX = "__agapay_learn_academic_records:";
const LEARN_REPORT_CARDS_KV_PREFIX = "__agapay_learn_report_cards:";

function list(value) {
  return Array.isArray(value) ? value : [];
}

function text(value, fallback = "") {
  const resolved = String(value ?? "").trim();
  return resolved || fallback;
}

function int(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stableSegment(value) {
  return text(value, "item").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "item";
}

function safeParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function rangeProgress({ start = 1, current = 0, end = 0 } = {}) {
  const first = Math.max(1, int(start, 1));
  const last = Math.max(first, int(end, first));
  const doneThrough = Math.max(first - 1, Math.min(last, int(current, first - 1)));
  const completed = Math.max(0, doneThrough - first + 1);
  const total = Math.max(1, last - first + 1);
  return {
    start: first,
    current: doneThrough,
    end: last,
    completed,
    total,
    percent: Math.round((completed / total) * 100)
  };
}

function childrenForAssignment(item = {}, children = []) {
  if (item.childId) return children.filter((child) => child.id === item.childId);
  if (item.formLabel) return children.filter((child) => child.formLabel === item.formLabel || child.gradeLabel === item.formLabel);
  return children;
}

function letterGrade(percent) {
  // Default placeholder scale; future household/state settings can make these thresholds configurable.
  if (percent >= 93) return "A";
  if (percent >= 90) return "A-";
  if (percent >= 87) return "B+";
  if (percent >= 83) return "B";
  if (percent >= 80) return "B-";
  if (percent >= 77) return "C+";
  if (percent >= 73) return "C";
  if (percent >= 70) return "C-";
  if (percent >= 60) return "D";
  return "F";
}

export function computeSubjectGrade(subjectProgressRow = {}, evaluationModel = "narrative-only", finalGradeOverride = "") {
  const override = text(finalGradeOverride, "");
  if (override) return override;
  const percent = Math.max(0, Math.min(100, number(subjectProgressRow.percent, 0)));
  switch (evaluationModel) {
    case "percent":
      return `${percent}%`;
    case "letter-grade":
      return letterGrade(percent);
    case "complete-incomplete":
      return percent >= 100 ? "Complete" : "Incomplete";
    case "pass-fail":
      // Default placeholder pass threshold; future household/state settings can make this configurable.
      return percent >= 60 ? "Pass" : "Fail";
    case "narrative-only":
    default:
      return "";
  }
}

function kvAcademicKey(householdId) {
  return `${LEARN_ACADEMIC_RECORDS_KV_PREFIX}${householdId}`;
}

function kvReportCardKey(householdId) {
  return `${LEARN_REPORT_CARDS_KV_PREFIX}${householdId}`;
}

async function loadKvArray(env, key) {
  if (!env.AGAPAY_REGISTRATIONS) return [];
  return safeParse(await env.AGAPAY_REGISTRATIONS.get(key), []) || [];
}

async function saveKvArray(env, key, rows = []) {
  if (!env.AGAPAY_REGISTRATIONS) return;
  await env.AGAPAY_REGISTRATIONS.put(key, JSON.stringify(rows));
}

export async function loadLearnAcademicSnapshot(env, householdId) {
  if (!householdId) return { academicRecords: [], reportCards: [] };
  if (d1(env)) {
    try {
      const [academicRows, reportRows] = await Promise.all([
        d1All(env, "SELECT id, child_id, record_type, occurred_on, data, created_at, updated_at FROM learn_academic_records WHERE household_id = ?1 ORDER BY occurred_on, id", householdId),
        d1All(env, "SELECT id, child_id, school_year_id, status, data, created_at, updated_at FROM learn_report_cards WHERE household_id = ?1 ORDER BY updated_at DESC, id", householdId)
      ]);
      return {
        academicRecords: academicRows.map((row) => ({
          ...(safeParse(row.data, {}) || {}),
          id: row.id,
          householdId,
          childId: row.child_id,
          recordType: row.record_type,
          occurredOn: row.occurred_on,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        })),
        reportCards: reportRows.map((row) => ({
          ...(safeParse(row.data, {}) || {}),
          id: row.id,
          householdId,
          childId: row.child_id,
          schoolYearId: row.school_year_id,
          status: row.status,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }))
      };
    } catch {
      // During local development or phased migration rollout, fall through to KV/dev storage.
    }
  }
  return {
    academicRecords: await loadKvArray(env, kvAcademicKey(householdId)),
    reportCards: await loadKvArray(env, kvReportCardKey(householdId))
  };
}

function recordsForTerm(setupSnapshot = {}, term = {}) {
  const householdId = setupSnapshot.identity?.householdId || setupSnapshot.household?.id || "";
  const schoolYearId = setupSnapshot.schoolYear?.id || "school_year_current";
  const children = list(setupSnapshot.children);
  const evaluationDefault = setupSnapshot.preferences?.evaluationModel || "narrative-only";
  const termId = term.id || setupSnapshot.term?.id || "";
  const occurredOn = term.endDate || new Date().toISOString().slice(0, 10);
  const subjectRecords = list(setupSnapshot.subjects)
    .filter((subject) => subject.termId === termId)
    .flatMap((subject, index) => {
      const progress = rangeProgress({
        start: subject.startNumber || 1,
        current: subject.currentNumber || subject.completedThroughNumber || subject.startNumber || 0,
        end: subject.endNumber || subject.startNumber || 0
      });
      const assignedChildren = childrenForAssignment(subject, children);
      const credits = Math.max(0, number(subject.credits, 0));
      const evaluationModel = text(subject.evaluationModel || evaluationDefault, evaluationDefault);
      const mark = computeSubjectGrade(progress, evaluationModel, subject.finalGradeOverride);
      return assignedChildren.map((child) => {
        const id = `learn_record_${stableSegment(householdId)}_${stableSegment(termId)}_${stableSegment(child.id)}_subject_${stableSegment(subject.id || index)}`;
        return {
          id,
          householdId,
          childId: child.id,
          schoolYearId,
          termId,
          termLabel: term.label || "",
          childName: child.firstName || child.name || "",
          recordType: credits > 0 ? "course-credit" : "milestone",
          occurredOn,
          subject: subject.title || "Subject",
          subjectTitle: subject.title || "Subject",
          subjectType: subject.subjectType || "subject",
          source: subject.resource || "",
          credits,
          evaluationModel,
          mark,
          completionPercent: progress.percent,
          progress,
          progressionType: subject.progressionType || "lessons",
          finalGradeOverride: text(subject.finalGradeOverride, ""),
          closedAt: new Date().toISOString()
        };
      });
    });
  const bookRecords = list(setupSnapshot.books)
    .filter((book) => book.termId === termId)
    .flatMap((book, index) => {
      const progress = rangeProgress({
        start: book.startChapter || 1,
        current: book.currentChapter || book.completedThroughChapter || book.startChapter || 0,
        end: book.endChapter || book.totalChapters || book.startChapter || 0
      });
      const assignedChildren = childrenForAssignment(book, children);
      return assignedChildren.map((child) => {
        const id = `learn_record_${stableSegment(householdId)}_${stableSegment(termId)}_${stableSegment(child.id)}_book_${stableSegment(book.id || index)}`;
        return {
          id,
          householdId,
          childId: child.id,
          schoolYearId,
          termId,
          termLabel: term.label || "",
          childName: child.firstName || child.name || "",
          recordType: "milestone",
          occurredOn,
          subject: book.title || "Book",
          subjectTitle: book.title || "Book",
          subjectType: book.category || "Reading",
          source: book.author || book.audienceLabel || "",
          credits: 0,
          evaluationModel: "narrative-only",
          mark: progress.percent >= 100 ? "Complete" : "",
          completionPercent: progress.percent,
          progress,
          progressionType: "chapters",
          closedAt: new Date().toISOString()
        };
      });
    });
  return [...subjectRecords, ...bookRecords];
}

function reportCardsForTerm(setupSnapshot = {}, term = {}, records = []) {
  const householdId = setupSnapshot.identity?.householdId || setupSnapshot.household?.id || "";
  const schoolYearId = setupSnapshot.schoolYear?.id || "school_year_current";
  const termId = term.id || setupSnapshot.term?.id || "";
  const generatedAt = new Date().toISOString();
  return list(setupSnapshot.children).map((child) => {
    const childRecords = records.filter((record) => record.childId === child.id);
    const completed = childRecords.reduce((total, record) => total + (record.progress?.completed || 0), 0);
    const planned = childRecords.reduce((total, record) => total + (record.progress?.total || 0), 0);
    const percent = planned ? Math.round((completed / planned) * 100) : 0;
    return {
      id: `learn_report_${stableSegment(householdId)}_${stableSegment(termId)}_${stableSegment(child.id)}`,
      householdId,
      childId: child.id,
      schoolYearId,
      termId,
      status: "published",
      generatedAt,
      summary: `${child.firstName || "This student"} completed ${completed} of ${planned} planned items for ${term.label || "the term"}.`,
      readAloudProgressPercent: percent,
      records: childRecords.map((record) => ({
        subject: record.subjectTitle,
        description: record.source || record.subjectType,
        progressPercent: record.completionPercent,
        status: record.completionPercent >= 100 ? "complete" : record.completionPercent > 0 ? "in progress" : "planned",
        completed: record.progress?.completed || 0,
        total: record.progress?.total || 0,
        progressionType: record.progressionType,
        grade: record.mark,
        credits: record.credits
      }))
    };
  });
}

async function saveAcademicRows(env, householdId, records, reportCards) {
  const timestamp = new Date().toISOString();
  if (d1(env)) {
    for (const record of records) {
      await d1Run(
        env,
        `INSERT INTO learn_academic_records (id, household_id, child_id, record_type, occurred_on, data, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
         ON CONFLICT(id) DO UPDATE SET
           record_type = excluded.record_type,
           occurred_on = excluded.occurred_on,
           data = excluded.data,
           updated_at = excluded.updated_at`,
        record.id,
        householdId,
        record.childId,
        record.recordType,
        record.occurredOn,
        JSON.stringify(record),
        timestamp
      );
    }
    for (const report of reportCards) {
      await d1Run(
        env,
        `INSERT INTO learn_report_cards (id, household_id, child_id, school_year_id, status, data, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
         ON CONFLICT(id) DO UPDATE SET
           status = excluded.status,
           data = excluded.data,
           updated_at = excluded.updated_at`,
        report.id,
        householdId,
        report.childId,
        report.schoolYearId,
        report.status,
        JSON.stringify(report),
        timestamp
      );
    }
    return;
  }
  const currentRecords = await loadKvArray(env, kvAcademicKey(householdId));
  const currentReports = await loadKvArray(env, kvReportCardKey(householdId));
  const byRecordId = new Map(currentRecords.map((record) => [record.id, record]));
  const byReportId = new Map(currentReports.map((report) => [report.id, report]));
  records.forEach((record) => byRecordId.set(record.id, { ...record, updatedAt: timestamp }));
  reportCards.forEach((report) => byReportId.set(report.id, { ...report, updatedAt: timestamp }));
  await saveKvArray(env, kvAcademicKey(householdId), [...byRecordId.values()]);
  await saveKvArray(env, kvReportCardKey(householdId), [...byReportId.values()]);
}

export async function closeLearnTerm(env, setupSnapshot = {}, termId = "") {
  const householdId = setupSnapshot.identity?.householdId || setupSnapshot.household?.id || "";
  if (!householdId) return { ok: false, status: 400, error: "Learn household setup is missing." };
  const terms = list(setupSnapshot.terms).length ? list(setupSnapshot.terms) : [setupSnapshot.term].filter(Boolean);
  const term = terms.find((entry) => entry.id === termId);
  if (!term) return { ok: false, status: 404, error: "That term is not part of this household setup." };
  const academicRecords = recordsForTerm(setupSnapshot, term);
  const reportCards = reportCardsForTerm(setupSnapshot, term, academicRecords);
  await saveAcademicRows(env, householdId, academicRecords, reportCards);
  return {
    ok: true,
    term,
    academicRecords,
    reportCards,
    closedAt: new Date().toISOString()
  };
}

export function buildTranscriptsFromAcademicRecords(seed = {}) {
  const records = list(seed.closedAcademicRecords || seed.academicRecords);
  if (!records.length) return [];
  const byChild = new Map(list(seed.children).map((child) => [child.id, child]));
  const grouped = new Map();
  records.forEach((record) => {
    if (!record.childId) return;
    if (!grouped.has(record.childId)) grouped.set(record.childId, []);
    grouped.get(record.childId).push(record);
  });
  return [...grouped.entries()].map(([childId, childRecords]) => {
    const child = byChild.get(childId) || {};
    const credits = childRecords
      .filter((record) => record.recordType === "course-credit")
      .reduce((total, record) => total + number(record.credits, 0), 0);
    return {
      id: `transcript_${stableSegment(seed.household?.id || "household")}_${stableSegment(childId)}`,
      householdId: seed.household?.id || "",
      childId,
      status: "published",
      generatedAt: new Date().toISOString(),
      gradeSpan: child.gradeLabel || child.formLabel || "",
      credits,
      records: childRecords.map((record) => ({
        id: record.id,
        schoolYearId: record.schoolYearId,
        termId: record.termId,
        termLabel: record.termLabel,
        subject: record.subjectTitle || record.subject,
        evaluationModel: record.evaluationModel,
        mark: record.mark,
        credits: number(record.credits, 0),
        recordType: record.recordType,
        occurredOn: record.occurredOn,
        completionPercent: record.completionPercent,
        progressionType: record.progressionType
      }))
    };
  });
}
