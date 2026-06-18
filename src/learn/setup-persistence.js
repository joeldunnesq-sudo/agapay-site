import { d1, d1First, d1Run, normalizeEmail, safeParseJsonRow } from "../lib/core.js";
import { getLearnSeedSnapshot } from "./demo-data.js";

const FALLBACK_EMAIL = "demo@agapay.local";
const FALLBACK_HOUSEHOLD_ID = "household_martin";
const LEARN_SETUP_KV_PREFIX = "__agapay_learn_setup:";
const devSetupSnapshots = new Map();

function nowIso() {
  return new Date().toISOString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function slug(value, fallback = "item") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function stableId(prefix, value, index = 0) {
  return `${prefix}_${slug(value, `${prefix}-${index + 1}`)}`;
}

function setupKvKey(identity) {
  return `${LEARN_SETUP_KV_PREFIX}${identity.householdId}`;
}

function parseStoredSetup(value) {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return safeParseJsonRow(value) || value;
}

function text(value, fallback = "") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function int(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function distributeRangeSegments({ label = "", start = 1, end = 0, color = "" } = {}, weeks = 12) {
  const first = Math.max(1, int(start, 1));
  const last = Math.max(first, int(end, first));
  const total = Math.max(1, last - first + 1);
  return Array.from({ length: weeks }, (_, index) => {
    const segStart = first + Math.floor((index * total) / weeks);
    const segEnd = first + Math.floor(((index + 1) * total) / weeks) - 1;
    return {
      title: `${label} ${segStart}${Math.max(segStart, segEnd) > segStart ? `-${Math.max(segStart, segEnd)}` : ""}`,
      start: index + 1,
      span: 1,
      color
    };
  });
}

function childrenForAssignment(item = {}, children = []) {
  if (item.childId) return children.filter((child) => child.id === item.childId);
  if (item.formLabel) return children.filter((child) => child.formLabel === item.formLabel || child.gradeLabel === item.formLabel);
  return children;
}

export function learnSetupIdentity(request) {
  const email = normalizeEmail(
    request?.headers?.get("X-AGAPAY-Learn-Email")
    || request?.headers?.get("X-AGAPAY-User-Email")
    || request?.headers?.get("CF-Access-Authenticated-User-Email")
    || ""
  ) || FALLBACK_EMAIL;
  return {
    email,
    householdId: email === FALLBACK_EMAIL ? FALLBACK_HOUSEHOLD_ID : `learn_household_${slug(email)}`
  };
}

function normalizeSetupPayload(payload = {}, identity = learnSetupIdentity()) {
  const seed = getLearnSeedSnapshot();
  const household = payload.household || {};
  const schoolYear = payload.schoolYear || {};
  const term = payload.term || {};
  const preferences = payload.preferences || {};
  const normalizedHousehold = {
    id: identity.householdId,
    slug: slug(household.name || identity.householdId, identity.householdId),
    name: text(household.name, seed.household.name),
    parentNames: [],
    childrenCount: 0,
    parishName: text(household.parishName, seed.household.parishName || ""),
    city: text(household.city, ""),
    primaryMethod: text(household.primaryMethod, seed.household.primaryMethod || "Charlotte Mason"),
    liturgicalCalendarType: text(preferences.calendarType || household.liturgicalCalendarType, seed.household.liturgicalCalendarType || "julian"),
    paceMode: text(preferences.paceMode || household.paceMode, seed.household.paceMode || "steady"),
    graceModeActive: Boolean(preferences.graceModeActive ?? seed.household.graceModeActive),
    setupCompleted: true
  };

  const children = list(payload.children)
    .map((child, index) => {
      const firstName = text(child.firstName || child.name, "");
      if (!firstName) return null;
      return {
        id: text(child.id, stableId("child", firstName, index)),
        householdId: identity.householdId,
        firstName,
        ageYears: int(child.ageYears || child.age, 0),
        gradeLabel: text(child.formLabel || child.gradeLabel || child.grade, ""),
        formLabel: text(child.formLabel || child.gradeLabel || child.grade, ""),
        color: text(child.color, ""),
        avatarMonogram: text(child.avatarMonogram, firstName.charAt(0).toUpperCase()),
        accentToken: text(child.accentToken, seed.children[index % seed.children.length]?.accentToken || "navy")
      };
    })
    .filter(Boolean);
  normalizedHousehold.childrenCount = children.length;

  const schoolYearId = text(schoolYear.id, "school_year_current");
  const normalizedSchoolYear = {
    ...seed.schoolYear,
    id: schoolYearId,
    householdId: identity.householdId,
    label: text(schoolYear.label, seed.schoolYear.label),
    startDate: text(schoolYear.startDate, seed.schoolYear.startDate),
    endDate: text(schoolYear.endDate, seed.schoolYear.endDate),
    status: "active"
  };

  const normalizedTerm = {
    ...seed.term,
    id: text(term.id, "term_current"),
    schoolYearId,
    label: text(term.label, seed.term.label),
    startDate: text(term.startDate, seed.term.startDate),
    endDate: text(term.endDate, seed.term.endDate),
    paceMode: text(preferences.paceMode || term.paceMode, seed.term.paceMode || "steady")
  };

  const streams = list(payload.streams).map((stream, index) => ({
    id: text(stream.id, stableId("stream", stream.title, index)),
    householdId: identity.householdId,
    streamType: text(stream.streamType || stream.type, "custom"),
    title: text(stream.title, "Household Stream"),
    cadenceLabel: text(stream.cadenceLabel || stream.cadence, "Weekly"),
    dailyMinutes: {
      mon: int(stream.dailyMinutes?.mon ?? stream.monMinutes, 20),
      tue: int(stream.dailyMinutes?.tue ?? stream.tueMinutes, 20),
      wed: int(stream.dailyMinutes?.wed ?? stream.wedMinutes, 20),
      thu: int(stream.dailyMinutes?.thu ?? stream.thuMinutes, 20),
      fri: int(stream.dailyMinutes?.fri ?? stream.friMinutes, 20)
    }
  })).filter((stream) => stream.title);

  const books = list(payload.books).map((book, index) => ({
    id: text(book.id, stableId("book", book.title, index)),
    householdId: identity.householdId,
    title: text(book.title, ""),
    author: text(book.author, ""),
    category: text(book.category, "Living Books"),
    formLabel: text(book.formLabel, ""),
    audienceLabel: text(book.audienceLabel, "Household"),
    startChapter: int(book.startChapter, 1),
    endChapter: int(book.endChapter || book.totalChapters, 0),
    totalChapters: int(book.endChapter || book.totalChapters, 0),
    color: text(book.color, ""),
    graceNote: text(book.graceNote, "Reading moved into the reserve basket.")
  })).filter((book) => book.title);

  const subjects = list(payload.subjects).map((subject, index) => ({
    id: text(subject.id, stableId("subject", subject.title, index)),
    subjectType: text(subject.subjectType || subject.type, slug(subject.title, "subject")),
    title: text(subject.title, "Subject"),
    formLabel: text(subject.formLabel, ""),
    resource: text(subject.resource, ""),
    cadenceLabel: text(subject.cadenceLabel || subject.cadence, "Weekly"),
    minutes: int(subject.minutes, 20),
    childId: text(subject.childId, ""),
    progressionType: text(subject.progressionType, "lessons"),
    startNumber: int(subject.startNumber, 1),
    endNumber: int(subject.endNumber, 0),
    color: text(subject.color, ""),
    gracePriority: text(subject.gracePriority, "keep"),
    graceNote: text(subject.graceNote, "Deferred gracefully to the reserve list.")
  })).filter((subject) => subject.title);

  const formationMaterials = list(payload.formationMaterials).map((material, index) => ({
    id: text(material.id, stableId("formation", material.title, index)),
    title: text(material.title, ""),
    materialType: text(material.materialType || material.type, "Catechesis"),
    source: text(material.source || material.author, ""),
    cadenceLabel: text(material.cadenceLabel || material.cadence, "Weekly"),
    color: text(material.color, "")
  })).filter((material) => material.title);

  const rawFormation = payload.formation || {};
  const formation = {
    churchRhythms: list(rawFormation.churchRhythms).map((rhythm, index) => ({
      id: text(rhythm.id, stableId("rhythm", rhythm.title, index)),
      title: text(rhythm.title, ""),
      note: text(rhythm.note, ""),
      cadenceLabel: text(rhythm.cadenceLabel || rhythm.cadence, "Daily"),
      minutes: int(rhythm.minutes || rhythm.minutesPlanned, 0),
      status: text(rhythm.status, "planned")
    })).filter((rhythm) => rhythm.title),
    catechesis: {
      id: text(rawFormation.catechesis?.id, "catechesis_setup"),
      householdId: identity.householdId,
      cycleYearId: seed.cycleYear?.id || "cycle_current",
      title: text(rawFormation.catechesis?.title, formationMaterials.find((material) => material.materialType === "Catechesis")?.title || "Catechesis"),
      currentLesson: text(rawFormation.catechesis?.currentLesson, ""),
      lessonNumber: int(rawFormation.catechesis?.lessonNumber, 0),
      totalLessons: int(rawFormation.catechesis?.totalLessons, 0),
      doctrinalTopic: text(rawFormation.catechesis?.doctrinalTopic || rawFormation.catechesis?.topic, ""),
      source: text(rawFormation.catechesis?.source, ""),
      evaluationModel: text(preferences.evaluationModel, "narrative-only")
    },
    recitationTracks: list(rawFormation.recitationTracks).map((track, index) => ({
      id: text(track.id, stableId("recitation", track.title, index)),
      householdId: identity.householdId,
      title: text(track.title, ""),
      sourceKind: text(track.sourceKind || track.source, "memory"),
      progressPercent: int(track.progressPercent || track.progress, 0),
      status: text(track.status, "memorizing")
    })).filter((track) => track.title),
    hymnStudies: list(rawFormation.hymnStudies).map((hymn, index) => ({
      id: text(hymn.id, stableId("hymn", hymn.title, index)),
      householdId: identity.householdId,
      termId: normalizedTerm.id,
      title: text(hymn.title, ""),
      tone: text(hymn.tone, ""),
      source: text(hymn.source, ""),
      status: text(hymn.status, "planned")
    })).filter((hymn) => hymn.title),
    enrichmentBlocks: list(rawFormation.enrichmentBlocks).map((block, index) => ({
      id: text(block.id, stableId("enrich", block.title, index)),
      householdId: identity.householdId,
      termId: normalizedTerm.id,
      blockType: text(block.blockType || block.type, "enrichment"),
      title: text(block.title, ""),
      minutesPlanned: int(block.minutesPlanned || block.minutes, 0),
      cadenceLabel: text(block.cadenceLabel || block.cadence, "Weekly"),
      color: text(block.color, "")
    })).filter((block) => block.title),
    feasts: list(rawFormation.feasts).map((feast, index) => ({
      id: text(feast.id, stableId("feast", feast.title, index)),
      civilDate: text(feast.civilDate || feast.date, ""),
      title: text(feast.title, ""),
      fastingRule: text(feast.fastingRule || feast.fasting, ""),
      note: text(feast.note, "")
    })).filter((feast) => feast.title)
  };

  const coOp = {
    enabled: false,
    status: "coming-soon"
  };

  return {
    version: 1,
    savedAt: nowIso(),
    identity,
    household: normalizedHousehold,
    children,
    schoolYear: normalizedSchoolYear,
    term: normalizedTerm,
    preferences: {
      calendarType: normalizedHousehold.liturgicalCalendarType,
      paceMode: normalizedHousehold.paceMode,
      evaluationModel: text(preferences.evaluationModel, "narrative-only"),
      graceModeDefault: text(preferences.graceModeDefault, "light"),
      graceModeActive: normalizedHousehold.graceModeActive,
      printPack: text(preferences.printPack, "weekly-household")
    },
    streams,
    subjects,
    books,
    formation,
    formationMaterials,
    coOp
  };
}

export function applySetupSnapshotToSeed(seed = getLearnSeedSnapshot(), setupSnapshot = null) {
  if (!setupSnapshot) return seed;
  const next = clone(seed);
  next.household = { ...next.household, ...setupSnapshot.household };
  next.children = list(setupSnapshot.children);
  next.schoolYear = { ...next.schoolYear, ...setupSnapshot.schoolYear };
  next.term = { ...next.term, ...setupSnapshot.term };
  next.graceModeRule = {
    ...next.graceModeRule,
    mode: setupSnapshot.preferences?.graceModeActive ? setupSnapshot.preferences?.graceModeDefault || next.graceModeRule?.mode || "light" : "full"
  };
  next.householdStreams = list(setupSnapshot.streams);
  next.books = list(setupSnapshot.books);
  next.libraryBooks = list(setupSnapshot.books).map((book, index) => ({
    ...book,
    ages: "",
    assignment: "Setup",
    progressPercent: book.endChapter ? Math.round(((book.startChapter || 1) / Math.max(book.endChapter, 1)) * 100) : 0,
    orthodox: false,
    sortOrder: index + 1
  }));
  next.currentReadAlouds = list(setupSnapshot.books).slice(0, 3).map((book) => ({
    ...book,
    subtitle: book.category,
    progressPercent: book.endChapter ? Math.round(((book.startChapter || 1) / Math.max(book.endChapter, 1)) * 100) : 0,
    assignedTerm: setupSnapshot.term?.label || next.term.label
  }));
  next.bookAssignments = list(setupSnapshot.books).flatMap((book) => {
    const assignedChildren = childrenForAssignment(book, next.children);
    const assignmentType = book.formLabel ? "form-reading" : "household-read-aloud";
    return (assignedChildren.length ? assignedChildren : [null]).map((child) => ({
      id: `assignment_${book.id}_${child?.id || "household"}`,
      bookId: book.id,
      childId: child?.id || null,
      householdId: setupSnapshot.identity?.householdId || next.household.id,
      formLabel: book.formLabel,
      assignmentType,
      progressPercent: book.endChapter ? Math.round(((book.startChapter || 1) / Math.max(book.endChapter, 1)) * 100) : 0
    }));
  });
  next.childTracks = list(setupSnapshot.subjects).flatMap((subject, index) => {
    const assignedChildren = childrenForAssignment(subject, next.children);
    return assignedChildren.map((child) => ({
      id: `${subject.id}_${child.id || index}`,
      childId: child.id,
      subjectType: subject.subjectType,
      title: subject.title,
      formLabel: subject.formLabel
    }));
  }).concat(list(setupSnapshot.books).flatMap((book, index) => {
    const assignedChildren = childrenForAssignment(book, next.children);
    return assignedChildren.map((child) => ({
      id: `${book.id}_${child.id || index}`,
      childId: child.id,
      subjectType: "reading",
      title: book.title,
      formLabel: book.formLabel
    }));
  }));
  next.curriculumPackage = {
    ...next.curriculumPackage,
    householdId: setupSnapshot.identity?.householdId || next.household.id,
    title: `${setupSnapshot.household?.name || "Household"} Curriculum`
  };
  next.curriculumPackages = [next.curriculumPackage];
  next.curriculumSubjects = list(setupSnapshot.subjects).map((subject, index) => ({
    id: subject.id,
    curriculumPackageId: next.curriculumPackage.id,
    subjectType: subject.subjectType,
    title: subject.title,
    sortOrder: index + 1
  }));
  const formation = setupSnapshot.formation || {};
  if (list(formation.churchRhythms).length) {
    next.dashboardDaily = Object.fromEntries(Object.entries(next.dashboardDaily || {}).map(([date, day]) => [
      date,
      { ...day, churchRhythms: list(formation.churchRhythms).map((rhythm) => ({ ...rhythm })) }
    ]));
  }
  if (formation.catechesis?.title) next.catechesisCycles = [formation.catechesis];
  if (list(formation.recitationTracks).length) next.recitationTracks = list(formation.recitationTracks);
  if (list(formation.hymnStudies).length) next.hymnStudies = list(formation.hymnStudies);
  if (list(formation.enrichmentBlocks).length) next.enrichmentBlocks = list(formation.enrichmentBlocks);
  const structuredFormationMaterials = [
    ...(formation.catechesis?.title ? [{
      id: formation.catechesis.id || "formation_catechesis",
      title: formation.catechesis.title,
      materialType: "Catechesis",
      source: formation.catechesis.source || "",
      cadenceLabel: "Weekly",
      color: ""
    }] : []),
    ...list(formation.hymnStudies).map((hymn) => ({
      id: hymn.id,
      title: hymn.title,
      materialType: "Hymn Study",
      source: hymn.source,
      cadenceLabel: "Weekly",
      color: ""
    })),
    ...list(formation.enrichmentBlocks).map((block) => ({
      id: block.id,
      title: block.title,
      materialType: block.blockType,
      source: "",
      cadenceLabel: block.cadenceLabel,
      color: block.color
    }))
  ];
  const formationMaterialsForPlanning = list(setupSnapshot.formationMaterials).length
    ? list(setupSnapshot.formationMaterials)
    : structuredFormationMaterials;
  next.curriculumResources = [
    ...list(setupSnapshot.subjects).filter((subject) => subject.resource).map((subject, index) => ({
      id: `resource_${subject.id}`,
      curriculumPackageId: next.curriculumPackage.id,
      curriculumSubjectId: subject.id,
      title: subject.resource,
      author: "",
      resourceType: subject.subjectType,
      sourceKind: "household",
      sortOrder: index + 1
    })),
    ...formationMaterialsForPlanning.map((material, index) => ({
      id: material.id,
      curriculumPackageId: next.curriculumPackage.id,
      curriculumSubjectId: null,
      title: material.title,
      author: material.source,
      resourceType: material.materialType,
      sourceKind: "formation",
      sortOrder: index + 100
    }))
  ];
  next.plannerWeek = {
    ...next.plannerWeek,
    label: setupSnapshot.term?.label || next.plannerWeek.label,
    householdRows: list(setupSnapshot.streams).map((stream, index) => ({
      id: `week_${stream.id}`,
      streamId: stream.id,
      title: stream.title,
      detail: stream.cadenceLabel,
      priority: index + 1,
      minutes: [0, stream.dailyMinutes?.mon || 0, stream.dailyMinutes?.tue || 0, stream.dailyMinutes?.wed || 0, stream.dailyMinutes?.thu || 0, stream.dailyMinutes?.fri || 0, 0],
      statuses: ["empty", "planned", "planned", "planned", "planned", "planned", "empty"]
    })),
    childRows: [
      ...list(setupSnapshot.subjects).flatMap((subject, index) => {
        const assignedChildren = childrenForAssignment(subject, next.children);
        return assignedChildren.map((child) => ({
          id: `week_${subject.id}_${child.id}`,
          childId: child.id,
          title: subject.title,
          detail: `${subject.resource || subject.cadenceLabel}${subject.endNumber ? ` (${subject.progressionType} ${subject.startNumber || 1}-${subject.endNumber})` : ""}`,
          priority: index + 1,
          color: subject.color,
          graceModeApplied: setupSnapshot.preferences?.graceModeActive && subject.gracePriority !== "keep",
          minutes: [0, subject.minutes, subject.minutes, subject.minutes, subject.minutes, subject.minutes, 0],
          statuses: ["empty", "planned", "planned", "planned", "planned", "planned", "empty"]
        }));
      }),
      ...list(setupSnapshot.books).flatMap((book, index) => {
        const assignedChildren = childrenForAssignment(book, next.children);
        return assignedChildren.map((child) => ({
          id: `week_${book.id}_${child.id}`,
          childId: child.id,
          title: book.title,
          detail: `${book.author || book.category}${book.endChapter ? ` (chapters ${book.startChapter || 1}-${book.endChapter})` : ""}`,
          priority: index + 100,
          color: book.color,
          graceModeApplied: setupSnapshot.preferences?.graceModeActive,
          minutes: [0, 20, 20, 20, 20, 20, 0],
          statuses: ["empty", "planned", "planned", "planned", "planned", "planned", "empty"]
        }));
      })
    ]
  };
  next.termSetup = {
    ...next.termSetup,
    setupCards: [
      { id: "setup_children", title: "Children", value: String(next.children.length), detail: "Active homeschool children" },
      { id: "setup_subjects", title: "Subjects", value: String(list(setupSnapshot.subjects).length), detail: "Configured curriculum tracks" },
      { id: "setup_books", title: "Books", value: String(list(setupSnapshot.books).length), detail: "Living books and read-alouds" },
      { id: "setup_formation", title: "Formation", value: String(formationMaterialsForPlanning.length + list(formation.recitationTracks).length), detail: "Catechesis, hymns, and memory work" }
    ],
    childTrackSummary: next.children.map((child) => ({
      childId: child.id,
      tracks: next.childTracks
        .filter((track) => track.childId === child.id)
        .map((track) => `${track.subjectType === "reading" ? "Reading" : track.subjectType}: ${track.title}`)
    })),
    pacingRows: [
      ...list(setupSnapshot.books).filter((book) => book.endChapter).map((book) => ({
        id: `pace_${book.id}`,
        label: book.title,
        subtitle: `${book.author || book.category} • chapters ${book.startChapter || 1}-${book.endChapter}`,
        color: book.color,
        segments: distributeRangeSegments({ label: "Ch.", start: book.startChapter || 1, end: book.endChapter, color: book.color })
      })),
      ...list(setupSnapshot.subjects).filter((subject) => subject.endNumber).map((subject) => ({
        id: `pace_${subject.id}`,
        label: subject.title,
        subtitle: `${subject.resource || subject.subjectType} • ${subject.progressionType} ${subject.startNumber || 1}-${subject.endNumber}`,
        color: subject.color,
        segments: distributeRangeSegments({ label: subject.progressionType, start: subject.startNumber || 1, end: subject.endNumber, color: subject.color })
      })),
      ...formationMaterialsForPlanning.map((material) => ({
        id: `pace_${material.id}`,
        label: material.materialType,
        subtitle: material.title,
        color: material.color,
        segments: [{ title: material.title, start: 1, span: 12, color: material.color }]
      }))
    ],
    graceReserve: [
      ...list(setupSnapshot.subjects).filter((subject) => setupSnapshot.preferences?.graceModeActive && subject.gracePriority !== "keep").map((subject) => ({
        title: subject.title,
        note: subject.graceNote,
        color: subject.color
      })),
      ...list(setupSnapshot.books).filter((book) => setupSnapshot.preferences?.graceModeActive).map((book) => ({
        title: book.title,
        note: book.graceNote,
        color: book.color
      }))
    ]
  };
  next.setupSnapshot = setupSnapshot;
  return next;
}

export async function loadLearnSetupSnapshot(env, request) {
  const identity = learnSetupIdentity(request);
  if (!d1(env)) return devSetupSnapshots.get(identity.householdId) || null;
  try {
    const row = await d1First(env, "SELECT data FROM learn_households WHERE id = ?1", identity.householdId);
    const snapshot = safeParseJsonRow(row)?.setupSnapshot || null;
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

export async function getLearnSeedForRequest(env, request) {
  return applySetupSnapshotToSeed(getLearnSeedSnapshot(), await loadLearnSetupSnapshot(env, request));
}

async function bestEffort(statement) {
  try {
    await statement();
  } catch {
    // Local development databases can lag migrations; the setup snapshot remains the source of truth.
  }
}

export async function saveLearnSetup(env, request, payload) {
  const identity = learnSetupIdentity(request);
  const setupSnapshot = normalizeSetupPayload(payload, identity);
  const timestamp = setupSnapshot.savedAt;
  if (!d1(env)) {
    devSetupSnapshots.set(identity.householdId, setupSnapshot);
    return {
      ok: true,
      setupSnapshot,
      onboarding: applySetupSnapshotToSeed(getLearnSeedSnapshot(), setupSnapshot),
      storage: "memory"
    };
  }
  const householdData = JSON.stringify({
    ownerEmail: identity.email,
    setupSnapshot
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
      storage: "kv-fallback"
    };
  }
  if (env.AGAPAY_REGISTRATIONS) {
    await env.AGAPAY_REGISTRATIONS.put(setupKvKey(identity), householdData);
  }

  await bestEffort(async () => {
    await d1Run(env, "DELETE FROM learn_child_tracks WHERE child_id IN (SELECT id FROM learn_children WHERE household_id = ?1)", identity.householdId);
    await d1Run(env, "DELETE FROM learn_children WHERE household_id = ?1", identity.householdId);
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
    await d1Run(env, "DELETE FROM learn_household_streams WHERE household_id = ?1", identity.householdId);
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
    await d1Run(env, "DELETE FROM learn_book_assignments WHERE book_id IN (SELECT id FROM learn_books WHERE household_id = ?1)", identity.householdId);
    await d1Run(env, "DELETE FROM learn_books WHERE household_id = ?1", identity.householdId);
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
        "Household",
        JSON.stringify(book),
        timestamp
      );
    }
  });

  await bestEffort(async () => {
    await d1Run(env, "DELETE FROM learn_terms WHERE school_year_id IN (SELECT id FROM learn_school_years WHERE household_id = ?1)", identity.householdId);
    await d1Run(env, "DELETE FROM learn_school_years WHERE household_id = ?1", identity.householdId);
    await d1Run(
      env,
      `INSERT INTO learn_school_years (id, household_id, label, start_date, end_date, current_term_id, data, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)`,
      setupSnapshot.schoolYear.id,
      identity.householdId,
      setupSnapshot.schoolYear.label,
      setupSnapshot.schoolYear.startDate,
      setupSnapshot.schoolYear.endDate,
      setupSnapshot.term.id,
      JSON.stringify(setupSnapshot.schoolYear),
      timestamp
    );
    await d1Run(
      env,
      `INSERT INTO learn_terms (id, school_year_id, label, start_date, end_date, pace_mode, data, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)`,
      setupSnapshot.term.id,
      setupSnapshot.schoolYear.id,
      setupSnapshot.term.label,
      setupSnapshot.term.startDate,
      setupSnapshot.term.endDate,
      setupSnapshot.term.paceMode,
      JSON.stringify(setupSnapshot.term),
      timestamp
    );
  });

  return {
    ok: true,
    setupSnapshot,
    onboarding: applySetupSnapshotToSeed(getLearnSeedSnapshot(), setupSnapshot)
  };
}

export async function saveLearnGraceMode(env, request, payload = {}) {
  const identity = learnSetupIdentity(request);
  const current = await loadLearnSetupSnapshot(env, request);
  const nextPreferences = {
    ...(current?.preferences || {}),
    graceModeDefault: text(payload.mode || payload.graceModeDefault, current?.preferences?.graceModeDefault || "light"),
    graceModeActive: Boolean(payload.active ?? payload.graceModeActive ?? true)
  };
  const nextPayload = current ? {
    household: {
      ...current.household,
      graceModeActive: nextPreferences.graceModeActive
    },
    schoolYear: current.schoolYear,
    term: current.term,
    preferences: nextPreferences,
    children: current.children,
    streams: current.streams,
    subjects: current.subjects,
    books: current.books,
    formation: current.formation,
    formationMaterials: current.formationMaterials,
    coOp: current.coOp
  } : {
    household: {
      id: identity.householdId,
      name: "Your Household",
      graceModeActive: nextPreferences.graceModeActive
    },
    preferences: nextPreferences
  };
  return saveLearnSetup(env, request, nextPayload);
}
