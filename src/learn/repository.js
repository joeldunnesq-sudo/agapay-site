import { calendarLabel } from "../liturgical-calendar.js";
import { buildReportCardExport, buildTranscriptExport } from "./academic-exports.js";
import { getLearnSeedSnapshot } from "./demo-data.js";
import { normalizeCalendarType, SeedLiturgicalSource } from "./liturgical-source.js";
import { buildPrintJobRequest, buildWeeklyHouseholdPrintDocument } from "./print-engine.js";

function buildHouseholdStreamCards(seed, daily) {
  const streamLookup = new Map(seed.householdStreams.map((stream) => [stream.id, stream]));
  return daily.householdBlocks.map((block) => {
    const stream = streamLookup.get(block.householdStreamId);
    return {
      id: block.id,
      streamType: stream?.streamType || "",
      title: block.title,
      subtitle: block.subtitle,
      cadenceLabel: stream?.cadenceLabel || "",
      minutesPlanned: block.minutesPlanned,
      status: block.status
    };
  });
}

function buildChildColumns(seed, daily) {
  const childLookup = new Map(seed.children.map((child) => [child.id, child]));
  return daily.childColumns.map((column) => ({
    child: childLookup.get(column.childId),
    blocks: column.blocks.map((block) => ({
      id: block.id,
      title: block.title,
      subtitle: block.subtitle,
      minutesPlanned: block.minutesPlanned,
      status: block.status
    }))
  }));
}

function buildUpcomingFeasts(seed, calendarType) {
  return seed.liturgicalWeek[calendarType]
    .filter((entry) => entry.civilDate >= "2025-05-08")
    .slice(0, 3)
    .map((entry) => ({
      civilDate: entry.civilDate,
      title: entry.feastTitle,
      fastingRule: entry.fastingRule,
      saints: entry.saints
    }));
}

function buildCalendarToggle(resolvedCalendar) {
  return {
    active: resolvedCalendar,
    options: [
      { value: "julian", label: "Julian" },
      { value: "revised-julian", label: "Revised Julian" }
    ],
    description: calendarLabel(resolvedCalendar === "revised-julian" ? "gregorian" : "julian")
  };
}

function childById(seed) {
  return new Map(seed.children.map((child) => [child.id, child]));
}

function applyGraceModeToRows(rows, graceModeRule) {
  if (!graceModeRule?.mode || graceModeRule.mode === "full") return rows.map((row) => ({ ...row, graceModeApplied: false }));
  return rows.map((row) => {
    if (row.priority < graceModeRule.reducePriorityThreshold) return { ...row, graceModeApplied: false };
    return {
      ...row,
      graceModeApplied: true,
      statuses: row.statuses.map((status) => status === "planned" ? "reduced" : status),
      minutes: row.minutes.map((minutes) => minutes > 15 ? Math.max(10, Math.round(minutes * 0.5)) : minutes)
    };
  });
}

function buildPlannerWeek(seed, calendarType) {
  const week = seed.plannerWeek;
  const liturgicalDays = seed.liturgicalWeek[calendarType].filter((entry) => week.dates.includes(entry.civilDate));
  const childLookup = childById(seed);
  return {
    ...week,
    liturgicalDays,
    householdRows: applyGraceModeToRows(week.householdRows, seed.graceModeRule),
    childRows: applyGraceModeToRows(week.childRows, seed.graceModeRule).map((row) => ({
      ...row,
      child: childLookup.get(row.childId)
    }))
  };
}

function buildCurriculum(seed) {
  return {
    activePackage: seed.curriculumPackage,
    packages: seed.curriculumPackages,
    subjects: seed.curriculumSubjects,
    resources: seed.curriculumResources,
    mappings: seed.curriculumMappings,
    mappingSummary: [
      "AGAPAY defaults map Scripture, catechesis, hymnody, and enrichment into the active cycle.",
      "Household custom resources map The Wingfeather Saga into the family read-aloud stream.",
      "The Bronze Bow maps directly to Elias's independent reading track."
    ]
  };
}

function buildGraceMode(seed) {
  return {
    enabled: true,
    seasonAdjustment: seed.seasonAdjustment,
    rule: seed.graceModeRule,
    reasons: ["new baby", "illness", "travel", "caregiving", "feast season", "custom"],
    modes: ["full", "light", "minimum viable", "feast only", "custom"],
    preserved: ["Church Rhythms", "Morning Basket", "Catechesis"],
    changed: seed.graceModeRule.changedSummary
  };
}

export class SeedLiturgicalRepository {
  constructor(seed = getLearnSeedSnapshot()) {
    this.seed = seed;
    this.source = new SeedLiturgicalSource(seed);
  }

  listWeek(calendarType = "julian") {
    return this.source.listRange({ calendarType });
  }

  getDay(civilDate, calendarType = "julian") {
    return this.source.getDay({ civilDate, calendarType });
  }
}

export class SeedFutureRecordsRepository {
  constructor(seed = getLearnSeedSnapshot()) {
    this.seed = seed;
  }

  async listPrintTemplates(householdId) {
    return this.seed.placeholderRecords.printTemplates.filter((entry) => entry.householdId === householdId);
  }

  async listPrintJobs(householdId) {
    return this.seed.placeholderRecords.printJobs.filter((entry) => entry.householdId === householdId);
  }

  async listReportCards(householdId) {
    return this.seed.placeholderRecords.reportCards.filter((entry) => entry.householdId === householdId);
  }

  async listTranscripts(householdId) {
    return this.seed.placeholderRecords.transcripts.filter((entry) => entry.householdId === householdId);
  }

  async listAcademicRecords(householdId) {
    return this.seed.placeholderRecords.academicRecords.filter((entry) => entry.householdId === householdId);
  }
}

export class SeedLearnRepository {
  constructor(seed = getLearnSeedSnapshot()) {
    this.seed = seed;
    this.liturgical = new SeedLiturgicalRepository(seed);
    this.futureRecords = new SeedFutureRecordsRepository(seed);
  }

  getDashboard({ calendarType = "julian", civilDate = "2025-05-07" } = {}) {
    const resolvedCalendar = normalizeCalendarType(calendarType);
    const liturgicalDay = this.liturgical.getDay(civilDate, resolvedCalendar);
    const daily = this.seed.dashboardDaily[civilDate];
    return {
      household: this.seed.household,
      children: this.seed.children,
      schoolYear: this.seed.schoolYear,
      term: this.seed.term,
      cycle: {
        framework: this.seed.cycleFramework,
        year: this.seed.cycleYear,
        topics: this.seed.cycleTopics
      },
      curriculumPackage: this.seed.curriculumPackage,
      paceProfile: this.seed.paceProfile,
      seasonAdjustment: this.seed.seasonAdjustment,
      calendarToggle: buildCalendarToggle(resolvedCalendar),
      today: {
        civilDate,
        title: "Today",
        weekdayLabel: "Wednesday",
        dateLabel: "May 7, 2025",
        liturgicalDay,
        churchRhythms: daily.churchRhythms.map((entry) => ({ ...entry })),
        householdStreamCards: buildHouseholdStreamCards(this.seed, daily),
        childColumns: buildChildColumns(this.seed, daily)
      },
      weeklySummary: this.seed.weeklySummary,
      upcomingFeasts: buildUpcomingFeasts(this.seed, resolvedCalendar),
      activeIndicators: {
        graceMode: {
          enabled: true,
          label: "Grace Mode",
          detail: this.seed.seasonAdjustment.title
        },
        cycle: this.seed.cycleYear.title,
        curriculumPackage: this.seed.curriculumPackage.title
      },
      readAloud: {
        book: this.seed.books[0],
        assignment: this.seed.bookAssignments[0]
      },
      narrationLogs: this.seed.narrationLogs.map((entry) => ({ ...entry }))
    };
  }

  getPlanner({ calendarType = "julian", view = "week" } = {}) {
    const resolvedCalendar = normalizeCalendarType(calendarType);
    return {
      household: this.seed.household,
      children: this.seed.children,
      schoolYear: this.seed.schoolYear,
      term: this.seed.term,
      calendarToggle: buildCalendarToggle(resolvedCalendar),
      activeView: ["day", "week", "term", "year"].includes(view) ? view : "week",
      cycle: {
        framework: this.seed.cycleFramework,
        year: this.seed.cycleYear,
        topics: this.seed.cycleTopics,
        visibleFrameworks: [
          { type: "history", label: "Cycle 2: Medieval / Byzantine focus" },
          { type: "catechesis", label: "Cycle 2: The Creed and sacramental life" },
          { type: "enrichment", label: "Picture, poet, composer, and nature rotation" },
          { type: "recitation", label: "Psalms, hymns, Scripture, and prayers" }
        ]
      },
      curriculum: buildCurriculum(this.seed),
      graceMode: buildGraceMode(this.seed),
      week: buildPlannerWeek(this.seed, resolvedCalendar),
      termSetup: this.seed.termSetup,
      upcomingFeasts: buildUpcomingFeasts(this.seed, resolvedCalendar),
      readAloud: {
        book: this.seed.books[0],
        assignment: this.seed.bookAssignments[0]
      }
    };
  }

  getPrintCenter({ calendarType = "julian" } = {}) {
    const resolvedCalendar = normalizeCalendarType(calendarType);
    const childLookup = childById(this.seed);
    return {
      household: this.seed.household,
      children: this.seed.children,
      calendarToggle: buildCalendarToggle(resolvedCalendar),
      term: this.seed.term,
      week: buildPlannerWeek(this.seed, resolvedCalendar),
      termSetup: this.seed.termSetup,
      templates: this.seed.placeholderRecords.printTemplates.map((template) => ({
        ...template,
        child: template.childId ? childLookup.get(template.childId) : null
      })),
      printDocument: buildWeeklyHouseholdPrintDocument({
        household: this.seed.household,
        week: buildPlannerWeek(this.seed, resolvedCalendar),
        calendarToggle: buildCalendarToggle(resolvedCalendar)
      }),
      draftJob: buildPrintJobRequest({
        templateId: "print_mom_weekly",
        rangeLabel: this.seed.plannerWeek.label
      }),
      sampleOutputs: {
        mom: [
          "Weekly household plan",
          "Term plan",
          "Month calendar",
          "Liturgical school calendar"
        ],
        child: [
          "Weekly assignment sheet",
          "Reading list",
          "Memory work sheet",
          "Copywork sheet",
          "Term plan"
        ]
      }
    };
  }

  getFormation({ calendarType = "julian" } = {}) {
    const resolvedCalendar = normalizeCalendarType(calendarType);
    const dashboard = this.getDashboard({ calendarType: resolvedCalendar });
    return {
      household: this.seed.household,
      children: this.seed.children,
      calendarToggle: buildCalendarToggle(resolvedCalendar),
      today: dashboard.today,
      churchRhythms: dashboard.today.churchRhythms,
      catechesisCycle: this.seed.catechesisCycles[0],
      recitationTracks: this.seed.recitationTracks,
      hymnStudies: this.seed.hymnStudies,
      enrichmentBlocks: this.seed.enrichmentBlocks,
      rotations: this.seed.rotations,
      upcomingFeasts: dashboard.upcomingFeasts,
      natureJournalEntries: this.seed.natureJournalEntries
    };
  }

  getBooks() {
    return {
      household: this.seed.household,
      children: this.seed.children,
      currentReadAlouds: this.seed.currentReadAlouds,
      libraryBooks: this.seed.libraryBooks,
      orthodoxSuggestions: this.seed.orthodoxBookSuggestions,
      bookPacing: {
        title: this.seed.currentReadAlouds[0].title,
        subtitle: "Spring Term",
        chaptersPerWeek: 2,
        progressPercent: this.seed.currentReadAlouds[0].progressPercent,
        weeks: [
          { week: 1, chapters: "1-2", pages: 44 },
          { week: 2, chapters: "3-4", pages: 46 },
          { week: 3, chapters: "5-6", pages: 42 },
          { week: 4, chapters: "7-8", pages: 48 }
        ]
      },
      copyworkSources: [
        { title: "KJV Scripture", detail: "Psalm 23; John 10:11; Philippians 4:13" },
        { title: "Hymn Texts", detail: "Be Thou My Vision; O Sacred Head" },
        { title: "Feast Day Texts", detail: "Troparia of the Day; Kontakia" }
      ]
    };
  }

  getReports() {
    const childLookup = childById(this.seed);
    return {
      household: this.seed.household,
      children: this.seed.children,
      schoolYear: this.seed.schoolYear,
      term: this.seed.term,
      weeklySummary: this.seed.weeklySummary,
      reportCards: this.seed.reportCards.map((report) => ({
        ...report,
        child: childLookup.get(report.childId),
        exportPreview: buildReportCardExport(report)
      })),
      transcripts: this.seed.transcripts.map((transcript) => ({
        ...transcript,
        child: childLookup.get(transcript.childId),
        exportPreview: buildTranscriptExport(transcript)
      })),
      academicRecords: this.seed.academicRecords,
      reportExports: this.seed.reportExports,
      narrationLogs: this.seed.narrationLogs.map((entry) => ({
        ...entry,
        child: childLookup.get(entry.childId)
      })),
      natureJournalEntries: this.seed.natureJournalEntries.map((entry) => ({
        ...entry,
        child: childLookup.get(entry.childId)
      }))
    };
  }

  getCoOp({ enabled = false } = {}) {
    return {
      enabled,
      coOp: {
        ...this.seed.coOp,
        enabled
      },
      meeting: this.seed.coOpMeeting,
      scheduleBlocks: this.seed.coOpScheduleBlocks,
      members: this.seed.coOpMembers,
      announcements: this.seed.coOpAnnouncements,
      sharedReadAlouds: this.seed.currentReadAlouds.slice(0, 3),
      resources: [
        { title: "Co-op Handbook", type: "PDF" },
        { title: "2024-25 Calendar", type: "PDF" },
        { title: "Teaching Rotation (Cycle 2)", type: "XLSX" },
        { title: "Nature Study Guide: Spring", type: "PDF" }
      ]
    };
  }

  getOnboarding() {
    return {
      household: this.seed.household,
      children: this.seed.children,
      schoolYear: this.seed.schoolYear,
      onboarding: this.seed.onboarding,
      calendarToggle: buildCalendarToggle(this.seed.household.liturgicalCalendarType),
      starterStreams: this.seed.householdStreams,
      evaluationModels: ["narrative-only", "complete-incomplete", "letter-grade", "percent", "pass-fail"]
    };
  }
}

export function createSeedLearnRepository() {
  return new SeedLearnRepository();
}
