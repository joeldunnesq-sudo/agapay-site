// Generated from src/learn/repository.ts by npm run build:server. Do not edit.
import '../liturgical-calendar.js';
import { buildReportCardExport, buildTranscriptExport } from './academic-exports.js';
import { buildTranscriptsFromAcademicRecords } from './academic-records.js';
import { getLearnSeedSnapshot } from './demo-data.js';
import { normalizeCalendarType } from './liturgical-source.js';
import { computeMoveUnfinishedWork } from './planner-overrides.js';
import { buildPrintJobRequest, buildWeeklyHouseholdPrintDocument } from './print-documents.js';
import { getLearnSeedForIdentity, learnSetupIdentity } from './setup-persistence.js';
import { SeedLiturgicalRepository, SeedFutureRecordsRepository } from './repository-shared.js';
import {
  familyPlanningWithDefaultRecipes,
  completionStatus,
  buildHouseholdStreamCards,
  progressFromTerm,
  computeWeeklySummary,
  buildChildColumns,
  buildUpcomingFeasts,
  buildCalendarToggle,
  childById,
  mergeCommunityResources,
  addDays,
  dateLabelFromIso,
  weekdayLabelFromIso,
  buildCurriculum,
  buildGraceMode,
} from './repository-shared.js';
import {
  buildSubjectProgress,
  setupCopyworkSources,
  reportCardsFromProgress,
  buildFamilyPlanningPrintTemplates,
} from './repository-progress.js';
import { buildAgapayLiturgicalDays, buildPlannerWeek, buildPlannerMonth } from './repository-planner.js';
import {
  DEFAULT_FAMILY_RECIPES,
  SeedLiturgicalRepository as SeedLiturgicalRepository2,
  SeedFutureRecordsRepository as SeedFutureRecordsRepository2,
} from './repository-shared.js';
function createSeedLearnRepository() {
  return new SeedLearnRepository();
}
async function createLearnRepositoryForRequest(request, env, options = {}) {
  const identity = await learnSetupIdentity(request, env);
  if (!identity) return null;
  return new SeedLearnRepository(await getLearnSeedForIdentity(env, identity, options));
}
class SeedLearnRepository {
  constructor(seed = getLearnSeedSnapshot()) {
    this.seed = seed;
    this.liturgical = new SeedLiturgicalRepository(seed);
    this.futureRecords = new SeedFutureRecordsRepository(seed);
  }
  getDashboard({ calendarType = 'julian', civilDate = /* @__PURE__ */ new Date().toISOString().slice(0, 10) } = {}) {
    const resolvedCalendar = normalizeCalendarType(calendarType);
    const hasSetup = Boolean(this.seed.setupSnapshot);
    const household = hasSetup
      ? this.seed.household
      : {
          id: 'learn_household_pending',
          name: 'Your Household',
          primaryMethod: 'Homeschool',
          liturgicalCalendarType: resolvedCalendar,
          paceMode: 'steady',
          graceModeActive: false,
          setupCompleted: false,
        };
    const children = hasSetup ? this.seed.children : [];
    const liturgicalDay =
      this.liturgical.getDay(civilDate, resolvedCalendar) ||
      buildAgapayLiturgicalDays({
        calendarType: resolvedCalendar,
        startDate: civilDate,
        endDate: civilDate,
        seed: this.seed,
      })[0];
    const plannerWeek = hasSetup ? buildPlannerWeek(this.seed, resolvedCalendar) : null;
    const familyPlanning = hasSetup
      ? familyPlanningWithDefaultRecipes(this.seed.familyPlanning || this.seed.setupSnapshot?.familyPlanning || {})
      : {};
    const daily = this.seed.dashboardDaily[civilDate] || {
      churchRhythms: [
        { id: 'rhythm_prayers', title: 'Morning Prayers', status: 'planned', note: 'Ready' },
        { id: 'rhythm_readings', title: 'Daily Readings', status: 'planned', note: 'Connect source in Setup' },
        { id: 'rhythm_saint', title: 'Saint or Feast', status: 'planned', note: liturgicalDay.feastTitle },
        { id: 'rhythm_hymn', title: 'Hymn Practice', status: 'planned', note: 'Connect text source in Setup' },
        { id: 'rhythm_fast', title: 'Fasting Rule', status: 'planned', note: liturgicalDay.fastingRule },
      ],
      householdBlocks: [],
      childColumns: [],
      googleCalendarSync: this.seed.googleCalendarSync || {},
      thisDayInHistory: {
        label: 'This Day in History',
        title: 'Connect a history source',
        year: civilDate.slice(0, 4),
        summary: 'AGAPAY Learn can show a daily history prompt here once a free source is connected.',
        sourceLabel: 'Source not connected',
      },
    };
    return {
      household,
      children,
      schoolYear: hasSetup ? this.seed.schoolYear : { label: 'Set up your school year', startDate: '', endDate: '' },
      term: hasSetup ? this.seed.term : { label: 'No term configured', startDate: '', endDate: '' },
      preferences: this.seed.setupSnapshot?.preferences || {
        calendarType: household.liturgicalCalendarType || calendarType,
        paceMode: household.paceMode || 'steady',
        graceModeDefault: this.seed.graceModeRule?.mode || 'light',
        graceModeActive: Boolean(household.graceModeActive),
      },
      cycle: {
        framework: this.seed.cycleFramework,
        year: hasSetup ? this.seed.cycleYear : { title: 'Choose your cycle in Setup' },
        topics: hasSetup ? this.seed.cycleTopics : [],
      },
      curriculumPackage: hasSetup ? this.seed.curriculumPackage : { title: 'Setup needed' },
      paceProfile: this.seed.paceProfile,
      seasonAdjustment: this.seed.seasonAdjustment,
      calendarToggle: buildCalendarToggle(resolvedCalendar),
      week: plannerWeek,
      familyPlanning,
      googleCalendarSync: daily.googleCalendarSync || this.seed.googleCalendarSync,
      thisDayInHistory: daily.thisDayInHistory || this.seed.thisDayInHistory,
      today: {
        civilDate,
        title: 'Today',
        weekdayLabel: weekdayLabelFromIso(civilDate),
        dateLabel: dateLabelFromIso(civilDate),
        liturgicalDay,
        churchRhythms: (this.seed.setupSnapshot?.formation?.churchRhythms?.length
          ? this.seed.setupSnapshot.formation.churchRhythms
          : hasSetup
            ? daily.churchRhythms
            : [{ id: 'rhythm_setup', title: 'Complete Setup', status: 'planned', note: 'Build your household rhythm.' }]
        ).map((entry) => ({
          ...entry,
          status: completionStatus(this.seed, 'daily', civilDate, entry.id, entry.status),
        })),
        householdStreamCards: hasSetup ? buildHouseholdStreamCards(this.seed, daily, civilDate) : [],
        childColumns: hasSetup ? buildChildColumns(this.seed, daily, civilDate) : [],
      },
      termProgress: hasSetup ? progressFromTerm(this.seed.term, civilDate) : progressFromTerm({}, civilDate),
      weeklySummary: hasSetup
        ? computeWeeklySummary(this.seed, resolvedCalendar, civilDate)
        : {
            lessonsCompleted: 0,
            lessonsPlanned: 0,
            lessonsCompletionPercent: 0,
            narrationsLogged: 0,
            feastDaysAhead: 0,
            nextFeastLabel: 'Choose a calendar in Setup',
            readAloudProgressPercent: 0,
            readAloudTitle: 'Add books in Setup',
          },
      upcomingFeasts: this.seed.setupSnapshot?.formation?.feasts?.length
        ? this.seed.setupSnapshot.formation.feasts.map((feast) => ({ ...feast }))
        : buildUpcomingFeasts(this.seed, resolvedCalendar, addDays(civilDate, 1)),
      activeIndicators: {
        graceMode: {
          enabled: hasSetup,
          label: 'Grace Mode',
          detail: hasSetup ? this.seed.seasonAdjustment.title : 'Configure in Setup',
        },
        cycle: hasSetup ? this.seed.cycleYear.title : 'Setup needed',
        curriculumPackage: hasSetup ? this.seed.curriculumPackage.title : 'No curriculum configured',
      },
      readAloud: {
        book: hasSetup ? this.seed.books[0] : null,
        assignment: hasSetup ? this.seed.bookAssignments[0] : null,
      },
      narrationLogs: hasSetup ? this.seed.narrationLogs.map((entry) => ({ ...entry })) : [],
    };
  }
  getCommunity({ facebookGroupUrl = '', communityResources = [] } = {}) {
    return {
      household: this.seed.household,
      comingSoon: false,
      title: 'Community Resources',
      subtitle: 'A growing library of trusted resources for Orthodox homeschool families.',
      detail:
        'Search by subject, resource type, or media format. AGAPAY curates the library; the Facebook group is the place for conversation, questions, and encouragement.',
      facebookGroupUrl,
      communityResources: mergeCommunityResources(this.seed.communityResources || [], communityResources),
      sharingGuidance: [
        'Resources are reviewed before being added to the AGAPAY library.',
        'Use the Facebook group to ask questions and recommend resources.',
        "Always review a resource for your family's needs before assigning it.",
      ],
    };
  }
  getPlanner({
    calendarType = 'julian',
    view = 'week',
    month = '',
    civilDate = /* @__PURE__ */ new Date().toISOString().slice(0, 10),
  } = {}) {
    const resolvedCalendar = normalizeCalendarType(calendarType);
    return {
      household: this.seed.household,
      children: this.seed.children,
      schoolYear: this.seed.schoolYear,
      term: this.seed.term,
      calendarToggle: buildCalendarToggle(resolvedCalendar),
      activeView: ['day', 'week', 'month', 'term', 'year'].includes(view) ? view : 'week',
      cycle: {
        framework: this.seed.cycleFramework,
        year: this.seed.cycleYear,
        topics: this.seed.cycleTopics,
        visibleFrameworks: this.seed.cycleTopics?.length
          ? [...new Set(this.seed.cycleTopics.map((t) => t.subjectType))].map((type) => ({
              type,
              label: this.seed.cycleTopics.find((t) => t.subjectType === type)?.title || type,
            }))
          : [],
      },
      curriculum: buildCurriculum(this.seed),
      graceMode: buildGraceMode(this.seed),
      week: buildPlannerWeek(this.seed, resolvedCalendar),
      month: buildPlannerMonth(this.seed, resolvedCalendar, month),
      termSetup: this.seed.termSetup,
      upcomingFeasts: buildUpcomingFeasts(this.seed, resolvedCalendar, civilDate),
      readAloud: {
        book: this.seed.books[0],
        assignment: this.seed.bookAssignments[0],
      },
      familyPlanning: familyPlanningWithDefaultRecipes(
        this.seed.familyPlanning || this.seed.setupSnapshot?.familyPlanning || {}
      ),
    };
  }
  // "Move unfinished work" for the in-memory seed repository (demo data and
  // tests). Real households persist this the same way through
  // saveLearnMoveUnfinishedWork() in setup-persistence.js, which shares the
  // exact same computeMoveUnfinishedWork()/applyPlannerOverrides() logic from
  // ./planner-overrides.js so both paths behave identically.
  moveUnfinishedWork({
    calendarType = 'julian',
    scope = 'household',
    rowId = '',
    fromWeekday,
    mode = 'next-open-day',
  } = {}) {
    const resolvedCalendar = normalizeCalendarType(calendarType);
    const week = buildPlannerWeek(this.seed, resolvedCalendar);
    const rows = scope === 'child' ? week.childRows : week.householdRows;
    const result = computeMoveUnfinishedWork({ rows, rowId, fromWeekday, mode });
    if (!result.ok) return result;
    const weekKey = week.dates?.[0] || '';
    this.seed.plannerOverrides = this.seed.plannerOverrides || {};
    this.seed.plannerOverrides[weekKey] = this.seed.plannerOverrides[weekKey] || {};
    this.seed.plannerOverrides[weekKey][rowId] = {
      ...(this.seed.plannerOverrides[weekKey][rowId] || {}),
      [result.fromWeekday]: {
        action: result.action,
        movedToWeekday: result.movedToWeekday,
        minutes: result.minutes,
        note: '',
      },
    };
    return result;
  }
  getPrintCenter({ calendarType = 'julian', month = '' } = {}) {
    const resolvedCalendar = normalizeCalendarType(calendarType);
    const childLookup = childById(this.seed);
    const householdTemplates = this.seed.placeholderRecords.printTemplates.filter(
      (template) => template.audience !== 'child'
    );
    const childTemplates = this.seed.setupSnapshot
      ? this.seed.children.flatMap((child) => [
          {
            id: `print_${child.id}_weekly`,
            householdId: this.seed.household.id,
            templateType: 'child-weekly-assignment',
            title: `${child.firstName}'s Weekly Sheet`,
            audience: 'child',
            childId: child.id,
            description: "Daily assignments, readings, memory work, and copywork from this household's saved setup.",
          },
          {
            id: `print_${child.id}_term`,
            householdId: this.seed.household.id,
            templateType: 'child-term-plan',
            title: `${child.firstName}'s Term Plan`,
            audience: 'child',
            childId: child.id,
            description: "Term track summary, books, subjects, and progress from this household's saved setup.",
          },
        ])
      : this.seed.placeholderRecords.printTemplates.filter((template) => template.audience === 'child');
    const familyPlanning = familyPlanningWithDefaultRecipes(
      this.seed.familyPlanning || this.seed.setupSnapshot?.familyPlanning || {}
    );
    const plannerTemplates = buildFamilyPlanningPrintTemplates(this.seed);
    const templates = [...householdTemplates, ...childTemplates, ...plannerTemplates];
    return {
      household: this.seed.household,
      children: this.seed.children,
      calendarToggle: buildCalendarToggle(resolvedCalendar),
      term: this.seed.term,
      week: buildPlannerWeek(this.seed, resolvedCalendar),
      month: buildPlannerMonth(this.seed, resolvedCalendar, month),
      termSetup: this.seed.termSetup,
      familyPlanning,
      templates: templates.map((template) => ({
        ...template,
        child: template.childId ? childLookup.get(template.childId) : null,
      })),
      printDocument: buildWeeklyHouseholdPrintDocument({
        household: this.seed.household,
        week: buildPlannerWeek(this.seed, resolvedCalendar),
        calendarToggle: buildCalendarToggle(resolvedCalendar),
      }),
      draftJob: buildPrintJobRequest({
        templateId: 'print_mom_weekly',
        rangeLabel: this.seed.plannerWeek.label,
      }),
      sampleOutputs: {
        mom: ['Weekly household plan', 'Term plan', 'Month calendar', 'Liturgical school calendar'],
        child: ['Weekly assignment sheet', 'Reading list', 'Memory work sheet', 'Copywork sheet', 'Term plan'],
        planner: [
          'Lesson plans by week, month, and term',
          'Meal plans with feast and fast markers',
          'Chore charts',
          'Events chart',
          'Recipes and grocery lists',
        ],
      },
    };
  }
  getFormation({ calendarType = 'julian', civilDate = /* @__PURE__ */ new Date().toISOString().slice(0, 10) } = {}) {
    const resolvedCalendar = normalizeCalendarType(calendarType);
    const dashboard = this.getDashboard({ calendarType: resolvedCalendar, civilDate });
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
      upcomingFeasts: this.seed.setupSnapshot?.formation?.feasts?.length
        ? this.seed.setupSnapshot.formation.feasts.map((feast) => ({ ...feast }))
        : dashboard.upcomingFeasts,
      natureJournalEntries: this.seed.natureJournalEntries,
    };
  }
  getBooks() {
    const hasSetup = Boolean(this.seed.setupSnapshot);
    const readAloud = this.seed.currentReadAlouds?.[0] || this.seed.books?.[0] || null;
    const start = Number(readAloud?.startChapter || 1);
    const end = Number(readAloud?.endChapter || readAloud?.totalChapters || 0);
    const chapterSpan = end ? Math.max(1, end - start + 1) : 0;
    const pacingWeeks =
      readAloud && end
        ? Array.from({ length: 4 }, (_, index) => {
            const first = start + Math.floor((index * chapterSpan) / 4);
            const last = start + Math.floor(((index + 1) * chapterSpan) / 4) - 1;
            return {
              week: index + 1,
              chapters: `${first}${Math.max(first, last) > first ? `-${Math.max(first, last)}` : ''}`,
              pages: '',
            };
          })
        : [];
    return {
      household: this.seed.household,
      children: this.seed.children,
      currentReadAlouds: this.seed.currentReadAlouds,
      libraryBooks: this.seed.libraryBooks,
      orthodoxSuggestions: hasSetup ? [] : this.seed.orthodoxBookSuggestions,
      bookPacing: {
        title: readAloud?.title || 'Add a read-aloud in Setup',
        subtitle: this.seed.term?.label || 'Current Term',
        chaptersPerWeek: end ? Math.max(1, Math.ceil(chapterSpan / 12)) : 0,
        progressPercent: readAloud?.progressPercent || 0,
        weeks: pacingWeeks,
      },
      copyworkSources: hasSetup
        ? setupCopyworkSources(this.seed.setupSnapshot)
        : [
            { title: 'KJV Scripture', detail: 'Psalm 23; John 10:11; Philippians 4:13' },
            { title: 'Hymn Texts', detail: 'Be Thou My Vision; O Sacred Head' },
            { title: 'Feast Day Texts', detail: 'Troparia of the Day; Kontakia' },
          ],
    };
  }
  getReports() {
    const childLookup = childById(this.seed);
    const subjectProgress = buildSubjectProgress(this.seed);
    const closedReportCards = Array.isArray(this.seed.closedReportCards) ? this.seed.closedReportCards : [];
    const reportCards = closedReportCards.length
      ? closedReportCards
      : reportCardsFromProgress(this.seed, subjectProgress);
    const academicRecords = this.seed.setupSnapshot
      ? Array.isArray(this.seed.closedAcademicRecords)
        ? this.seed.closedAcademicRecords
        : []
      : this.seed.academicRecords;
    const transcripts = this.seed.setupSnapshot
      ? buildTranscriptsFromAcademicRecords({ ...this.seed, academicRecords })
      : this.seed.transcripts;
    return {
      household: this.seed.household,
      children: this.seed.children,
      schoolYear: this.seed.schoolYear,
      term: this.seed.term,
      weeklySummary: this.seed.setupSnapshot
        ? computeWeeklySummary(this.seed, this.seed.household?.liturgicalCalendarType || 'julian')
        : this.seed.weeklySummary,
      subjectProgress,
      reportCards: reportCards.map((report) => ({
        ...report,
        child: childLookup.get(report.childId),
        exportPreview: buildReportCardExport(report),
      })),
      transcripts: transcripts.map((transcript) => ({
        ...transcript,
        child: childLookup.get(transcript.childId),
        exportPreview: buildTranscriptExport(transcript),
      })),
      academicRecords,
      reportExports: this.seed.reportExports,
      narrationLogs: this.seed.narrationLogs.map((entry) => ({
        ...entry,
        child: childLookup.get(entry.childId),
      })),
      natureJournalEntries: this.seed.natureJournalEntries.map((entry) => ({
        ...entry,
        child: childLookup.get(entry.childId),
      })),
    };
  }
  getCoOp({ enabled = false } = {}) {
    return {
      enabled,
      coOp: {
        ...this.seed.coOp,
        enabled,
      },
      meeting: this.seed.coOpMeeting,
      scheduleBlocks: this.seed.coOpScheduleBlocks,
      members: this.seed.coOpMembers,
      announcements: this.seed.coOpAnnouncements,
      sharedReadAlouds: this.seed.currentReadAlouds.slice(0, 3),
      resources: [
        { title: 'Co-op Handbook', type: 'PDF' },
        { title: '2024-25 Calendar', type: 'PDF' },
        { title: 'Teaching Rotation (Cycle 2)', type: 'XLSX' },
        { title: 'Nature Study Guide: Spring', type: 'PDF' },
      ],
    };
  }
  getOnboarding() {
    return {
      setupCompleted: Boolean(this.seed.setupSnapshot),
      setupSnapshot: this.seed.setupSnapshot || null,
      household: this.seed.household,
      children: this.seed.children,
      schoolYear: this.seed.schoolYear,
      term: this.seed.term,
      onboarding: this.seed.onboarding,
      calendarToggle: buildCalendarToggle(this.seed.household.liturgicalCalendarType),
      starterStreams: this.seed.householdStreams,
      subjects: this.seed.setupSnapshot?.subjects || this.seed.curriculumSubjects || [],
      books: this.seed.setupSnapshot?.books || this.seed.books || [],
      formation: this.seed.setupSnapshot?.formation || {
        churchRhythms: this.seed.dashboard?.today?.churchRhythms || [],
        catechesis: this.seed.catechesisCycles?.[0] || {},
        recitationTracks: this.seed.recitationTracks || [],
        hymnStudies: this.seed.hymnStudies || [],
        enrichmentBlocks: this.seed.enrichmentBlocks || [],
        feasts: [],
      },
      formationMaterials:
        this.seed.setupSnapshot?.formationMaterials ||
        this.seed.curriculumResources?.filter((resource) => resource.sourceKind === 'formation') ||
        [],
      preferences: this.seed.setupSnapshot?.preferences || {
        calendarType: this.seed.household.liturgicalCalendarType,
        paceMode: this.seed.household.paceMode,
        evaluationModel: 'narrative-only',
        graceModeDefault: this.seed.graceModeRule?.mode || 'light',
        graceModeActive: Boolean(this.seed.household.graceModeActive),
        printPack: 'weekly-household',
      },
      coOp: this.seed.setupSnapshot?.coOp || this.seed.coOp || {},
      evaluationModels: ['narrative-only', 'complete-incomplete', 'letter-grade', 'percent', 'pass-fail'],
    };
  }
}
export {
  DEFAULT_FAMILY_RECIPES,
  SeedFutureRecordsRepository2 as SeedFutureRecordsRepository,
  SeedLearnRepository,
  SeedLiturgicalRepository2 as SeedLiturgicalRepository,
  createLearnRepositoryForRequest,
  createSeedLearnRepository,
};
