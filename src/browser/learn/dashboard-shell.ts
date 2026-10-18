import type { LearnShellGoogleStatus, LearnShellError } from './dashboard-shell-contracts.js';
import {
  toBooksViewModel,
  toCoOpViewModel,
  toCommunityViewModel,
  toDashboardViewModel,
  toFormationViewModel,
  toGradesViewModel,
  toPlannerViewModel,
  toPrintCenterViewModel,
  toSetupViewModel,
} from './dashboard-view-models.js?v=20260703d';
import { renderSanitizedMarkup as renderLearnRoot } from './sanitized-render.js?v=20260904security1';
import { ACCENTS } from './dashboard-view-models-shared.js';
import {
  isOdysseyLearnContext,
  html,
  learnExperience,
  emptyState,
  renderPlannerTerm,
  renderPlannerYear,
  softColor,
  panel,
  renderAttendanceTracker,
  DEFAULT_TERM_WEEK_COUNT,
  formationRhythmSetupRow,
  formationRecitationSetupRow,
  formationEnrichmentSetupRow,
  subjectSetupRow,
  formOptions,
  colorChoices,
  setupInput,
  setupSelect,
  setupTermOptions,
  missedLessonOptions,
  childSetupRow,
  termSetupRow,
  resourceFieldName,
  selectedTermWeeks,
  primaryResourceGroupLabel,
  termWeekSummaryFromSelected,
  scheduledTermWeeks,
  bookSetupRow,
  formationSetupRow,
  termWeekSummary,
  setupResourceRow,
  attendanceStatusMark,
  attendanceStatusLabel,
} from './dashboard-shell-setup-calendar.js';
import {
  marketingPreviewActive,
  learnSectionHref,
  plannerHref,
  expandFamilyEvents,
  choreDueOnDay,
  plannerDayLabel,
  nextSevenDates,
  eventRecurrence,
  eventRecurrenceLabel,
  choreScheduleLabel,
  renderPlannerMonth,
  renderFamilyPlannerScope,
  renderWeeklyAssignmentBoard,
  plannerDates,
  familyEventSetupRow,
  choreSetupRow,
  recipeSetupRow,
  grocerySetupRow,
  prototypeWeekDateMap,
  familyPlannerModel,
  isImportantPlannerFeast,
  PROTOTYPE_RECIPE_TITLES,
  prototypeStateToFamilyPlanningPayload,
  renderChoresScope,
  choreTimeValues,
  mealSlotLabel,
} from './dashboard-shell-planner-family.js';
import type { LearnShell2Part0 } from './dashboard-shell-part-1.js';
declare const cloneLearnViewModel: LearnShell2Part0['cloneLearnViewModel'];
declare const isFaithSpecific: LearnShell2Part0['isFaithSpecific'];
declare const secularPrintText: LearnShell2Part0['secularPrintText'];
declare const itemIsFaithSpecific: LearnShell2Part0['itemIsFaithSpecific'];
declare const secularPlannerDay: LearnShell2Part0['secularPlannerDay'];
declare const demoPlannerItems: LearnShell2Part0['demoPlannerItems'];
declare const demoBooks: LearnShell2Part0['demoBooks'];
declare const prepareOdysseyViewModel: LearnShell2Part0['prepareOdysseyViewModel'];
declare const setLearnViewMode: LearnShell2Part0['setLearnViewMode'];
declare const safeExternalUrl: LearnShell2Part0['safeExternalUrl'];
declare const cssVars: LearnShell2Part0['cssVars'];
declare const check: LearnShell2Part0['check'];
declare const completionCheck: LearnShell2Part0['completionCheck'];
declare const bar: LearnShell2Part0['bar'];
declare const pageIntroIcon: LearnShell2Part0['pageIntroIcon'];
declare const pageIntroMeta: LearnShell2Part0['pageIntroMeta'];
declare const pageIntro: LearnShell2Part0['pageIntro'];
declare const downloadBlob: LearnShell2Part0['downloadBlob'];
declare const isLearnFamilyPlan: LearnShell2Part0['isLearnFamilyPlan'];
import type { LearnShell2Part1 } from './dashboard-shell-part-2.js';
declare const printCount: LearnShell2Part1['printCount'];
declare const setPrintCount: LearnShell2Part1['setPrintCount'];
declare const learnAccountEmail: LearnShell2Part1['learnAccountEmail'];
declare const learnRequestHeaders: LearnShell2Part1['learnRequestHeaders'];
declare const openLearnCheckout: LearnShell2Part1['openLearnCheckout'];
declare const showLearnDialog: LearnShell2Part1['showLearnDialog'];
declare const showLearnFeedbackDialog: LearnShell2Part1['showLearnFeedbackDialog'];
declare const saintStoryDialogHtml: LearnShell2Part1['saintStoryDialogHtml'];
declare const saintMatchKey: LearnShell2Part1['saintMatchKey'];
declare const saintMatchScore: LearnShell2Part1['saintMatchScore'];
declare const saintPrecedence: LearnShell2Part1['saintPrecedence'];
declare const orderSaintsByPrecedence: LearnShell2Part1['orderSaintsByPrecedence'];
declare const orderSaintsForCard: LearnShell2Part1['orderSaintsForCard'];
declare const forceDisplayedSaintFirst: LearnShell2Part1['forceDisplayedSaintFirst'];
declare const saintCardTitle: LearnShell2Part1['saintCardTitle'];
declare const plannerScopeFromQuery: LearnShell2Part1['plannerScopeFromQuery'];
declare const mealToolFromQuery: LearnShell2Part1['mealToolFromQuery'];
declare const plannerSidebarSubnav: LearnShell2Part1['plannerSidebarSubnav'];
declare const sidebar: LearnShell2Part1['sidebar'];
declare const globalProductNav: LearnShell2Part1['globalProductNav'];
declare const topbar: LearnShell2Part1['topbar'];
declare const shell: LearnShell2Part1['shell'];
declare const renderGraceModePanel: LearnShell2Part1['renderGraceModePanel'];
import type { LearnShell2Part2 } from './dashboard-shell-part-3.js';
declare const renderTermProgressPanel: LearnShell2Part2['renderTermProgressPanel'];
declare const renderTodayLearnContext: LearnShell2Part2['renderTodayLearnContext'];
declare const weekAssignmentStorageKey: LearnShell2Part2['weekAssignmentStorageKey'];
declare const readWeekAssignmentState: LearnShell2Part2['readWeekAssignmentState'];
declare const designedAssignmentsForDate: LearnShell2Part2['designedAssignmentsForDate'];
declare const timeLabel: LearnShell2Part2['timeLabel'];
declare const eventsForDate: LearnShell2Part2['eventsForDate'];
declare const mealForDate: LearnShell2Part2['mealForDate'];
declare const choresForDate: LearnShell2Part2['choresForDate'];
declare const renderDesignedLessonList: LearnShell2Part2['renderDesignedLessonList'];
declare const renderDashboardDesignedLessons: LearnShell2Part2['renderDashboardDesignedLessons'];
declare const renderDashboardFamilyCards: LearnShell2Part2['renderDashboardFamilyCards'];
declare const renderTefaViewToggleBanner: LearnShell2Part2['renderTefaViewToggleBanner'];
declare const renderDashboard: LearnShell2Part2['renderDashboard'];
import type { LearnShell2Part3 } from './dashboard-shell-part-4.js';
declare const renderPlanner: LearnShell2Part3['renderPlanner'];
declare const plannerStatusMeta: LearnShell2Part3['plannerStatusMeta'];
declare const statusPill: LearnShell2Part3['statusPill'];
declare const renderPlannerReserveCard: LearnShell2Part3['renderPlannerReserveCard'];
declare const gracePriorityBadge: LearnShell2Part3['gracePriorityBadge'];
declare const renderTermAtAGlance: LearnShell2Part3['renderTermAtAGlance'];
declare const renderPlannerWeek: LearnShell2Part3['renderPlannerWeek'];
declare const moveUnfinishedWorkControl: LearnShell2Part3['moveUnfinishedWorkControl'];
declare const renderPlannerDay: LearnShell2Part3['renderPlannerDay'];
declare const renderFamilyPlanningEditor: LearnShell2Part3['renderFamilyPlanningEditor'];
declare const renderFamilyPlannerIntro: LearnShell2Part3['renderFamilyPlannerIntro'];
declare const renderFamilyPlannerScopeLegacy: LearnShell2Part3['renderFamilyPlannerScopeLegacy'];
declare const dayKeyForChore: LearnShell2Part3['dayKeyForChore'];
declare const prototypeRecipeType: LearnShell2Part3['prototypeRecipeType'];
declare const prototypeDaySeeds: LearnShell2Part3['prototypeDaySeeds'];
declare const prototypeMonthSeed: LearnShell2Part3['prototypeMonthSeed'];
import type { LearnShell2Part4 } from './dashboard-shell-part-5.js';
declare const prototypeSetupSeed: LearnShell2Part4['prototypeSetupSeed'];
declare const prototypeKidsSeed: LearnShell2Part4['prototypeKidsSeed'];
declare const backendRecipeToPrototype: LearnShell2Part4['backendRecipeToPrototype'];
declare const seedFamilyPrototypeState: LearnShell2Part4['seedFamilyPrototypeState'];
declare const wireFamilyPrototypeBackend: LearnShell2Part4['wireFamilyPrototypeBackend'];
declare const renderTefaFormation: LearnShell2Part4['renderTefaFormation'];
declare const renderFormation: LearnShell2Part4['renderFormation'];
declare const bookCover: LearnShell2Part4['bookCover'];
import type { LearnShell2Part5 } from './dashboard-shell-part-6.js';
declare const renderBooks: LearnShell2Part5['renderBooks'];
declare const renderReports: LearnShell2Part5['renderReports'];
declare const gradeOption: LearnShell2Part5['gradeOption'];
declare const renderGradeTermFields: LearnShell2Part5['renderGradeTermFields'];
declare const renderGradeCourseEditor: LearnShell2Part5['renderGradeCourseEditor'];
declare const renderTestScoreRow: LearnShell2Part5['renderTestScoreRow'];
declare const renderTestScoresPanel: LearnShell2Part5['renderTestScoresPanel'];
declare const renderGrades: LearnShell2Part5['renderGrades'];
declare const renderCoOp: LearnShell2Part5['renderCoOp'];
declare const scheduledDays: LearnShell2Part5['scheduledDays'];
declare const setupDayPicker: LearnShell2Part5['setupDayPicker'];
declare const setupSourceInput: LearnShell2Part5['setupSourceInput'];
declare const setupWeeklyPlanFields: LearnShell2Part5['setupWeeklyPlanFields'];
declare const setupMultiChildPicker: LearnShell2Part5['setupMultiChildPicker'];
declare const churchRhythmSetupPanel: LearnShell2Part5['churchRhythmSetupPanel'];
declare const setupTileValue: LearnShell2Part5['setupTileValue'];
declare const setupSectionCard: LearnShell2Part5['setupSectionCard'];
declare const setupSectionPanel: LearnShell2Part5['setupSectionPanel'];
declare const formationSetupPanel: LearnShell2Part5['formationSetupPanel'];
import type { LearnShell2Part6 } from './dashboard-shell-part-7.js';
declare const formSubjectsSetupPanel: LearnShell2Part6['formSubjectsSetupPanel'];
declare const setupStepTarget: LearnShell2Part6['setupStepTarget'];
declare const setupStepState: LearnShell2Part6['setupStepState'];
declare const setupProgressCard: LearnShell2Part6['setupProgressCard'];
declare const setupPanelCollapsed: LearnShell2Part6['setupPanelCollapsed'];
declare const collapsibleSetupPanel: LearnShell2Part6['collapsibleSetupPanel'];
declare const simpleSetupDraftKey: LearnShell2Part6['simpleSetupDraftKey'];
declare const suggestedFormForChild: LearnShell2Part6['suggestedFormForChild'];
declare const defaultSimpleSetupDraft: LearnShell2Part6['defaultSimpleSetupDraft'];
declare const loadSimpleSetupDraft: LearnShell2Part6['loadSimpleSetupDraft'];
declare const saveSimpleSetupDraft: LearnShell2Part6['saveSimpleSetupDraft'];
declare const simpleSetupField: LearnShell2Part6['simpleSetupField'];
declare const simpleSetupStepBody: LearnShell2Part6['simpleSetupStepBody'];
declare const renderSimpleSetupWizard: LearnShell2Part6['renderSimpleSetupWizard'];
declare const renderTefaCommunity: LearnShell2Part6['renderTefaCommunity'];
import type { LearnShell2Part7 } from './dashboard-shell-part-8.js';
declare const renderCommunity: LearnShell2Part7['renderCommunity'];
declare const renderReportsComingSoon: LearnShell2Part7['renderReportsComingSoon'];
declare const captureSimpleSetupStep: LearnShell2Part7['captureSimpleSetupStep'];
declare const validateSimpleSetupStep: LearnShell2Part7['validateSimpleSetupStep'];
declare const validateSimpleSetupMinimum: LearnShell2Part7['validateSimpleSetupMinimum'];
declare const simpleSetupDates: LearnShell2Part7['simpleSetupDates'];
declare const simpleSetupPayload: LearnShell2Part7['simpleSetupPayload'];
declare const applySimpleDraftToSetupVm: LearnShell2Part7['applySimpleDraftToSetupVm'];
declare const wireSimpleSetupWizard: LearnShell2Part7['wireSimpleSetupWizard'];
import type { LearnShell2Part8 } from './dashboard-shell-part-9.js';
declare const setupExperience: LearnShell2Part8['setupExperience'];
declare const mealSetupRow: LearnShell2Part8['mealSetupRow'];
declare const familyPlanningSetupPanel: LearnShell2Part8['familyPlanningSetupPanel'];
declare const renderSetup: LearnShell2Part8['renderSetup'];
declare const renderPrintCenter: LearnShell2Part8['renderPrintCenter'];
declare const redirectExpiredLearnSession: LearnShell2Part8['redirectExpiredLearnSession'];
declare const waitForLearnSignIn: LearnShell2Part8['waitForLearnSignIn'];
declare const apiGet: LearnShell2Part8['apiGet'];
declare const apiPost: LearnShell2Part8['apiPost'];
declare const syncLearnGoogleCalendar: LearnShell2Part8['syncLearnGoogleCalendar'];
declare const localIsoDate: LearnShell2Part8['localIsoDate'];
declare const storedLearnCalendar: LearnShell2Part8['storedLearnCalendar'];
declare const learnApiUrl: LearnShell2Part8['learnApiUrl'];
declare const rowValue: LearnShell2Part8['rowValue'];
declare const setupChildRowsFromForm: LearnShell2Part8['setupChildRowsFromForm'];
import type { LearnShell2Part9 } from './dashboard-shell-part-10.js';
declare const rowWeeklyPlans: LearnShell2Part9['rowWeeklyPlans'];
declare const rowResourceValue: LearnShell2Part9['rowResourceValue'];
declare const rowResourceWeeklyPlans: LearnShell2Part9['rowResourceWeeklyPlans'];
declare const rowResources: LearnShell2Part9['rowResources'];
declare const resourceRowPrimaryGroupLabel: LearnShell2Part9['resourceRowPrimaryGroupLabel'];
declare const refreshResourceLaneCounts: LearnShell2Part9['refreshResourceLaneCounts'];
declare const moveResourceRowToLane: LearnShell2Part9['moveResourceRowToLane'];
declare const reindexResourceList: LearnShell2Part9['reindexResourceList'];
declare const moveResourceRowToSubject: LearnShell2Part9['moveResourceRowToSubject'];
declare const refreshResourceSummary: LearnShell2Part9['refreshResourceSummary'];
declare const snapshotResourceModal: LearnShell2Part9['snapshotResourceModal'];
declare const restoreResourceModal: LearnShell2Part9['restoreResourceModal'];
declare const rowTileMinutes: LearnShell2Part9['rowTileMinutes'];
declare const collectRows: LearnShell2Part9['collectRows'];
declare const openSaintOfDay: LearnShell2Part9['openSaintOfDay'];
declare const wireDashboard: LearnShell2Part9['wireDashboard'];
import type { LearnShell2Part10 } from './dashboard-shell-part-11.js';
declare const setupPayloadFromForm: LearnShell2Part10['setupPayloadFromForm'];
declare const currentSetupChildren: LearnShell2Part10['currentSetupChildren'];
declare const familyPlanningPayloadFromForm: LearnShell2Part10['familyPlanningPayloadFromForm'];
declare const currentSetupTerms: LearnShell2Part10['currentSetupTerms'];
declare const setupChildCount: LearnShell2Part10['setupChildCount'];
declare const syncSetupChildLimit: LearnShell2Part10['syncSetupChildLimit'];
declare const setupBlankRow: LearnShell2Part10['setupBlankRow'];
declare const setSetupSectionOpen: LearnShell2Part10['setSetupSectionOpen'];
declare const syncSetupTermSelects: LearnShell2Part10['syncSetupTermSelects'];
import type { LearnShell2Part11 } from './dashboard-shell-part-12.js';
declare const wireSetupPage: LearnShell2Part11['wireSetupPage'];
import type { LearnShell2Part12 } from './dashboard-shell-part-13.js';
declare const wireWeeklyAssignmentBoard: LearnShell2Part12['wireWeeklyAssignmentBoard'];
import type { LearnShell2Part13 } from './dashboard-shell-part-14.js';
declare const wireMoveUnfinishedWork: LearnShell2Part13['wireMoveUnfinishedWork'];
import type { LearnShell2Part14 } from './dashboard-shell-part-15.js';
declare const wirePlanner: LearnShell2Part14['wirePlanner'];
import type { LearnShell2Part15 } from './dashboard-shell-part-16.js';
declare const updateActiveButton: LearnShell2Part15['updateActiveButton'];
declare const wireCommunityLegacy: LearnShell2Part15['wireCommunityLegacy'];
declare const wireCommunity: LearnShell2Part15['wireCommunity'];
declare const wireReports: LearnShell2Part15['wireReports'];
declare const gradeCourseFromElement: LearnShell2Part15['gradeCourseFromElement'];
declare const blankGradeCourse: LearnShell2Part15['blankGradeCourse'];
declare const attendanceEntryFromCell: LearnShell2Part15['attendanceEntryFromCell'];
declare const setAttendanceCellStatus: LearnShell2Part15['setAttendanceCellStatus'];
declare const wireGrades: LearnShell2Part15['wireGrades'];
declare const testScoreFromElement: LearnShell2Part15['testScoreFromElement'];
import type { LearnShell2Part16 } from './dashboard-shell-part-17.js';
declare const wireTestScores: LearnShell2Part16['wireTestScores'];
declare const canUsePrint: LearnShell2Part16['canUsePrint'];
declare const wirePrintCenter: LearnShell2Part16['wirePrintCenter'];
declare const wireFormation: LearnShell2Part16['wireFormation'];
declare const mount: LearnShell2Part16['mount'];

const odysseyPageMap: Record<string, string> = {
  planner: 'planner',
  formation: 'formation',
  books: 'books',
  grades: 'grades',
  community: 'community',
  'co-op': 'co-op',
  print: 'print-center',
  'print-center': 'print-center',
  setup: 'onboarding',
  onboarding: 'onboarding',
};

function resolveLearnPageKey() {
  const base = document.body.dataset.learnPage || 'dashboard';
  if (document.body.dataset.learnContext !== 'odyssey') return base;
  const match = window.location.pathname.match(/^\/learn\/odyssey\/dashboard\/([^/]+)/);
  return match ? odysseyPageMap[match[1]] || base : base;
}

const pageKey = resolveLearnPageKey();

const root = document.getElementById('learnRoot')!;

// eslint-disable-next-line prefer-const -- Reassigned by composed functions in this same runtime module.
let learnGoogleCalendarStatus: LearnShellGoogleStatus = { loaded: false, configured: false, connected: false };

const ODYSSEY_FAITH_SPECIFIC =
  /\b(orthodox|church|parish|saint|saints|catechesis|catechism|prayer|scripture|gospel|epistle|troparion|kontakion|hymn|feast|fasting|fast day|liturgical|creed|beatitudes|pascha|dormition|transfiguration|theology)\b/i;

const MARKETING_LEARNERS = [
  { id: 'demo_avery', name: 'Avery', age: '15', formLabel: 'Form IV', gradeLabel: 'Grade 10', color: '#34507a' },
  { id: 'demo_jordan', name: 'Jordan', age: '13', formLabel: 'Form III', gradeLabel: 'Grade 8', color: '#6e2f2a' },
  { id: 'demo_riley', name: 'Riley', age: '11', formLabel: 'Form II', gradeLabel: 'Grade 6', color: '#4a5a31' },
  { id: 'demo_morgan', name: 'Morgan', age: '10', formLabel: 'Form II', gradeLabel: 'Grade 5', color: '#8a6b2f' },
  { id: 'demo_casey', name: 'Casey', age: '8', formLabel: 'Form I', gradeLabel: 'Grade 3', color: '#7b5b78' },
  { id: 'demo_quinn', name: 'Quinn', age: '6', formLabel: 'Form I', gradeLabel: 'Grade 1', color: '#537a7a' },
];

// Single source of truth for how the shared Learn dashboard should present
// itself differently for TEFA/Odyssey marketplace families vs. ordinary
// AGAPAY Learn households. This is intentionally config-driven — it changes
// labels, copy, nav order, and a small activation badge — rather than
// forking the dashboard renderer itself.
const LEARN_VIEW_MODE_KEY = 'agapay.learn.viewMode';

// eslint-disable-next-line prefer-const -- Reassigned by composed functions in this same runtime module.
let learnCheckoutOpening: boolean = false;

// Mirrors STATUS_META in src/learn/planner-overrides.js. Kept as a small,
// separate copy here because this file is served to the browser directly
// (no bundler), so it can't import server-side ES modules — see that file
// for the source of truth on status language.
const PLANNER_STATUS_META = {
  planned: { label: 'Planned', note: 'On the schedule for this day.' },
  reduced: { label: 'Shortened', note: 'Kept, but trimmed to fit a lighter day.' },
  deferred: { label: 'Moved', note: 'Moved to another day this week — not behind, just later.' },
  reserve: { label: 'In Reserve', note: "Set aside for whenever there's a roomier day. No rush." },
  completed: { label: 'Done', note: 'Completed.' },
  rest: { label: 'Rest', note: 'A day for church, rest, and family rhythm.' },
};

const homeschoolMethodOptions = [
  'Charlotte Mason',
  { value: 'Orthodox Classical', label: 'Classical' },
  'Traditional',
  'Eclectic',
  'Unsure',
];

const subjectTypeOptions = [
  { value: 'morning-time', label: 'Morning Time' },
  { value: 'catechesis', label: 'Catechesis' },
  { value: 'enrichment-recitation', label: 'Enrichment & Recitation' },
  { value: 'tales', label: 'Tales' },
  { value: 'literature', label: 'Literature' },
  { value: 'language-arts', label: 'Language Arts' },
  { value: 'classical-foreign-languages', label: 'Classical & Foreign Languages' },
  { value: 'history', label: 'History' },
  { value: 'geography', label: 'Geography' },
  { value: 'math', label: 'Math' },
  { value: 'sciences-nature', label: 'Sciences & Nature' },
  { value: 'science', label: 'Science' },
  { value: 'social-studies', label: 'Social Studies' },
  { value: 'fine-arts', label: 'Fine Arts' },
  { value: 'health-education', label: 'Health Education' },
  { value: 'physical-education', label: 'Physical Education (PE)' },
  { value: 'technology-applications', label: 'Technology Applications' },
  { value: 'languages-other-than-english', label: 'Languages Other Than English (LOTE)' },
  { value: 'career-technical-education', label: 'Career and Technical Education (CTE)' },
  { value: 'speech-communication', label: 'Speech/Communication' },
  { value: 'custom', label: 'Custom' },
];

const schedulingModeOptions = [
  { value: 'fixed', label: 'Fixed days' },
  { value: 'weekly-target', label: 'Weekly target' },
  { value: 'term-target', label: 'Term target' },
  { value: 'loop', label: 'Loop schedule' },
  { value: 'date-range', label: 'Date range' },
];

const lessonPriorityOptions = [
  { value: 'essential', label: 'Essential' },
  { value: 'important', label: 'Important' },
  { value: 'enrichment', label: 'Enrichment' },
  { value: 'optional', label: 'Optional' },
];

const instructionModeOptions = [
  { value: 'parent-led', label: 'Parent-led' },
  { value: 'independent', label: 'Independent' },
  { value: 'shared', label: 'Shared / together' },
];

const setupWeekdays = [
  { value: 'sun', label: 'Sun' },
  { value: 'mon', label: 'Mon' },
  { value: 'tue', label: 'Tue' },
  { value: 'wed', label: 'Wed' },
  { value: 'thu', label: 'Thu' },
  { value: 'fri', label: 'Fri' },
  { value: 'sat', label: 'Sat' },
];

const sourceTypeOptions = [
  { value: 'book', label: 'Book - show on Books page' },
  { value: 'curriculum', label: 'Curriculum / lesson plan' },
  { value: 'website', label: 'Website / online source' },
  { value: 'hymn', label: 'Hymn / chant' },
  { value: 'icon', label: 'Icon / picture study' },
  { value: 'activity', label: 'Activity / hands-on' },
  { value: 'none', label: 'Not a book' },
];

const SIMPLE_SETUP_STEPS = ['Household', 'Rhythm', 'Forms or Grades', 'Children', 'Grace Mode', 'Starter Week'];

mount().catch((error: LearnShellError) => {
  root!.replaceChildren();
  const section = document.createElement('section');
  section.style.cssText = 'padding:32px;font-family:Georgia,serif;color:#6e2f2a;';
  const heading = document.createElement('strong');
  heading.textContent = 'Unable to load AGAPAY Learn';
  const message = document.createElement('p');
  message.textContent = (error as LearnShellError).message || 'Please refresh and try again.';
  section.append(heading, message);
  root!.append(section);
});

document.addEventListener('click', async (event) => {
  const feedbackOpen = (event.target as HTMLElement).closest<HTMLElement>('[data-learn-feedback-open]');
  if (feedbackOpen) {
    event.preventDefault();
    showLearnFeedbackDialog();
    return;
  }
  const accountToggle = (event.target as HTMLElement).closest<HTMLElement>('[data-learn-account-toggle]');
  const accountMenu = (event.target as HTMLElement).closest<HTMLElement>('[data-learn-account-menu]');
  if (accountToggle) {
    const menu = accountToggle.closest<HTMLElement>('[data-learn-account-menu]');
    const dropdown = menu?.querySelector<HTMLElement>('.learn-account-dropdown');
    const open = accountToggle.getAttribute('aria-expanded') !== 'true';
    document
      .querySelectorAll<HTMLButtonElement>('[data-learn-account-toggle]')
      .forEach((button) => button.setAttribute('aria-expanded', 'false'));
    document.querySelectorAll<HTMLElement>('.learn-account-dropdown').forEach((panel) => {
      panel.hidden = true;
    });
    accountToggle.setAttribute('aria-expanded', String(open));
    if (dropdown) dropdown.hidden = !open;
    return;
  }
  if (!accountMenu) {
    document
      .querySelectorAll<HTMLButtonElement>('[data-learn-account-toggle]')
      .forEach((button) => button.setAttribute('aria-expanded', 'false'));
    document.querySelectorAll<HTMLElement>('.learn-account-dropdown').forEach((panel) => {
      panel.hidden = true;
    });
  }
  if ((event.target as HTMLElement).closest<HTMLElement>('[data-learn-logout]')) {
    localStorage.removeItem('agapayDonorToken');
    localStorage.removeItem('agapayDonorProfile');
    localStorage.removeItem('agapayDonorEmail');
    localStorage.removeItem('agapay.learn.plan');
    window.location.href = isOdysseyLearnContext() ? '/learn/odyssey/dashboard/login' : '/myagapay/login';
    return;
  }
  const googleSyncButton = (event.target as HTMLElement).closest<HTMLElement>('[data-learn-google-sync]');
  if (googleSyncButton) {
    event.preventDefault();
    if ((googleSyncButton as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled) return;
    const originalHtml = googleSyncButton.innerHTML;
    (googleSyncButton as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled = true;
    googleSyncButton.setAttribute('aria-busy', 'true');
    try {
      const returnTo = window.location.pathname + window.location.search;
      const result = await apiGet(
        `/api/learn/google-calendar/connect?format=json&returnTo=${encodeURIComponent(returnTo)}`
      );
      if (!result.authUrl) throw new Error('Google Calendar did not return an authorization URL.');
      window.location.assign(result.authUrl);
    } catch (error) {
      (googleSyncButton as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled = false;
      googleSyncButton.removeAttribute('aria-busy');
      googleSyncButton.innerHTML = originalHtml;
      showLearnDialog(
        'Google Calendar Connection Failed',
        (error as LearnShellError)?.message || 'AGAPAY could not begin the Google Calendar connection.'
      );
    }
    return;
  }

  const progressTarget = (event.target as HTMLElement).closest<HTMLElement>('[data-setup-progress-target]');
  if (progressTarget) {
    const target = document.getElementById(progressTarget.dataset.setupProgressTarget!);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      target.classList.add('learn-setup-focus');
      window.setTimeout(() => target.classList.remove('learn-setup-focus'), 1500);
    }
    return;
  }

  const toggle = (event.target as HTMLElement).closest<HTMLElement>('[data-learn-menu-toggle]');
  const scrim = (event.target as HTMLElement).closest<HTMLElement>('[data-learn-sidebar-scrim]');
  const navLink = (event.target as HTMLElement).closest<HTMLElement>('.learn-product-nav a');
  if (!toggle && !scrim && !navLink) return;

  const open = toggle ? !document.body.classList.contains('learn-menu-open') : false;
  document.body.classList.toggle('learn-menu-open', open);
  document.querySelector<HTMLButtonElement>('[data-learn-menu-toggle]')?.setAttribute('aria-expanded', String(open));
});

document.addEventListener('submit', async (event) => {
  const form = (event.target as HTMLElement).closest<HTMLElement>('[data-learn-feedback-form]');
  if (!form) return;
  event.preventDefault();
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  const status = form.querySelector<HTMLElement>('[data-learn-feedback-status]');
  const subject =
    (
      (form as HTMLFormElement).elements as HTMLFormControlsCollection & Record<string, { value: string }>
    ).subject?.value?.trim() || '';
  const message =
    (
      (form as HTMLFormElement).elements as HTMLFormControlsCollection & Record<string, { value: string }>
    ).message?.value?.trim() || '';
  if (!message || message.length < 8) {
    if (status) status.textContent = 'Please add a little more detail before sending.';
    return;
  }
  if (submit) {
    submit.disabled = true;
    submit.textContent = 'Sending...';
  }
  if (status) status.textContent = 'Sending your suggestion...';
  try {
    await apiPost('/api/learn/feedback', {
      subject,
      message,
      page: pageKey,
      path: window.location.pathname + window.location.search,
      familyName: document.querySelector<HTMLElement>('.learn-product-profile strong')?.textContent || '',
      userAgent: navigator.userAgent || '',
    });
    if (status) status.textContent = 'Thank you. Your suggestion is now in the AGAPAY Learn admin queue.';
    form.querySelector<HTMLTextAreaElement>('textarea')?.setAttribute('readonly', 'readonly');
    window.setTimeout(() => document.querySelector<HTMLElement>('[data-learn-dialog]')?.remove(), 1800);
  } catch (error) {
    if (status) status.textContent = (error as LearnShellError).message || 'Unable to send your suggestion right now.';
    if (submit) {
      submit.disabled = false;
      submit.textContent = 'Send suggestion';
    }
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  document.body.classList.remove('learn-menu-open');
  document.querySelector<HTMLButtonElement>('[data-learn-menu-toggle]')?.setAttribute('aria-expanded', 'false');
  document
    .querySelectorAll<HTMLButtonElement>('[data-learn-account-toggle]')
    .forEach((button) => button.setAttribute('aria-expanded', 'false'));
  document.querySelectorAll<HTMLElement>('.learn-account-dropdown').forEach((panel) => {
    panel.hidden = true;
  });
});

export type LearnSimpleDraftShape = ReturnType<typeof defaultSimpleSetupDraft>;
export type LearnShellBindings = {
  ODYSSEY_FAITH_SPECIFIC: typeof ODYSSEY_FAITH_SPECIFIC;
  MARKETING_LEARNERS: typeof MARKETING_LEARNERS;
  LEARN_VIEW_MODE_KEY: typeof LEARN_VIEW_MODE_KEY;
  isOdysseyLearnContext: typeof isOdysseyLearnContext;
  html: typeof html;
  learnExperience: typeof learnExperience;
  marketingPreviewActive: typeof marketingPreviewActive;
  learnSectionHref: typeof learnSectionHref;
  learnCheckoutOpening: boolean;
  apiPost: typeof apiPost;
  pageIntroMeta: typeof pageIntroMeta;
  pageKey: typeof pageKey;
  learnGoogleCalendarStatus: LearnShellGoogleStatus;
  resolveLearnPageKey: typeof resolveLearnPageKey;
  cssVars: typeof cssVars;
  pageIntro: typeof pageIntro;
  panel: typeof panel;
  plannerHref: typeof plannerHref;
  bar: typeof bar;
  saintCardTitle: typeof saintCardTitle;
  forceDisplayedSaintFirst: typeof forceDisplayedSaintFirst;
  saintMatchKey: typeof saintMatchKey;
  completionCheck: typeof completionCheck;
  shell: typeof shell;
  emptyState: typeof emptyState;
  expandFamilyEvents: typeof expandFamilyEvents;
  choreDueOnDay: typeof choreDueOnDay;
  plannerDayLabel: typeof plannerDayLabel;
  nextSevenDates: typeof nextSevenDates;
  eventRecurrence: typeof eventRecurrence;
  eventRecurrenceLabel: typeof eventRecurrenceLabel;
  choreScheduleLabel: typeof choreScheduleLabel;
  seedFamilyPrototypeState: typeof seedFamilyPrototypeState;
  plannerScopeFromQuery: typeof plannerScopeFromQuery;
  mealToolFromQuery: typeof mealToolFromQuery;
  PLANNER_STATUS_META: typeof PLANNER_STATUS_META;
  designedAssignmentsForDate: typeof designedAssignmentsForDate;
  renderDesignedLessonList: typeof renderDesignedLessonList;
  eventsForDate: typeof eventsForDate;
  timeLabel: typeof timeLabel;
  familyPlanningSetupPanel: typeof familyPlanningSetupPanel;
  renderPlannerTerm: typeof renderPlannerTerm;
  renderPlannerYear: typeof renderPlannerYear;
  softColor: typeof softColor;
  renderPlannerMonth: typeof renderPlannerMonth;
  renderFamilyPlannerScope: typeof renderFamilyPlannerScope;
  renderWeeklyAssignmentBoard: typeof renderWeeklyAssignmentBoard;
  plannerDates: typeof plannerDates;
  familyEventSetupRow: typeof familyEventSetupRow;
  choreSetupRow: typeof choreSetupRow;
  recipeSetupRow: typeof recipeSetupRow;
  grocerySetupRow: typeof grocerySetupRow;
  prototypeWeekDateMap: typeof prototypeWeekDateMap;
  familyPlannerModel: typeof familyPlannerModel;
  isImportantPlannerFeast: typeof isImportantPlannerFeast;
  storedLearnCalendar: typeof storedLearnCalendar;
  prototypeRecipeType: typeof prototypeRecipeType;
  prototypeDaySeeds: typeof prototypeDaySeeds;
  learnAccountEmail: typeof learnAccountEmail;
  prototypeMonthSeed: typeof prototypeMonthSeed;
  check: typeof check;
  ACCENTS: typeof ACCENTS;
  PROTOTYPE_RECIPE_TITLES: typeof PROTOTYPE_RECIPE_TITLES;
  prototypeStateToFamilyPlanningPayload: typeof prototypeStateToFamilyPlanningPayload;
  bookCover: typeof bookCover;
  setupWeekdays: typeof setupWeekdays;
  renderAttendanceTracker: typeof renderAttendanceTracker;
  DEFAULT_TERM_WEEK_COUNT: typeof DEFAULT_TERM_WEEK_COUNT;
  formationRhythmSetupRow: typeof formationRhythmSetupRow;
  formationRecitationSetupRow: typeof formationRecitationSetupRow;
  formationEnrichmentSetupRow: typeof formationEnrichmentSetupRow;
  setupTileValue: typeof setupTileValue;
  setupSectionCard: typeof setupSectionCard;
  setupSectionPanel: typeof setupSectionPanel;
  SIMPLE_SETUP_STEPS: typeof SIMPLE_SETUP_STEPS;
  isLearnFamilyPlan: typeof isLearnFamilyPlan;
  safeExternalUrl: typeof safeExternalUrl;
  subjectSetupRow: typeof subjectSetupRow;
  formOptions: typeof formOptions;
  renderTefaCommunity: typeof renderTefaCommunity;
  suggestedFormForChild: typeof suggestedFormForChild;
  saveSimpleSetupDraft: typeof saveSimpleSetupDraft;
  root: typeof root;
  renderSimpleSetupWizard: typeof renderSimpleSetupWizard;
  simpleSetupDraftKey: typeof simpleSetupDraftKey;
  showLearnDialog: typeof showLearnDialog;
  colorChoices: typeof colorChoices;
  renderLearnRoot: typeof renderLearnRoot;
  collapsibleSetupPanel: typeof collapsibleSetupPanel;
  churchRhythmSetupPanel: typeof churchRhythmSetupPanel;
  formationSetupPanel: typeof formationSetupPanel;
  formSubjectsSetupPanel: typeof formSubjectsSetupPanel;
  homeschoolMethodOptions: typeof homeschoolMethodOptions;
  printCount: typeof printCount;
  learnRequestHeaders: typeof learnRequestHeaders;
  setupInput: typeof setupInput;
  setupSelect: typeof setupSelect;
  setupTermOptions: typeof setupTermOptions;
  missedLessonOptions: typeof missedLessonOptions;
  childSetupRow: typeof childSetupRow;
  termSetupRow: typeof termSetupRow;
  rowValue: typeof rowValue;
  apiGet: typeof apiGet;
  learnApiUrl: typeof learnApiUrl;
  saintStoryDialogHtml: typeof saintStoryDialogHtml;
  setLearnViewMode: typeof setLearnViewMode;
  localIsoDate: typeof localIsoDate;
  renderDashboard: typeof renderDashboard;
  prepareOdysseyViewModel: typeof prepareOdysseyViewModel;
  resourceFieldName: typeof resourceFieldName;
  selectedTermWeeks: typeof selectedTermWeeks;
  primaryResourceGroupLabel: typeof primaryResourceGroupLabel;
  termWeekSummaryFromSelected: typeof termWeekSummaryFromSelected;
  toDashboardViewModel: typeof toDashboardViewModel;
  collectRows: typeof collectRows;
  rowResources: typeof rowResources;
  scheduledDays: typeof scheduledDays;
  rowWeeklyPlans: typeof rowWeeklyPlans;
  rowTileMinutes: typeof rowTileMinutes;
  scheduledTermWeeks: typeof scheduledTermWeeks;
  bookSetupRow: typeof bookSetupRow;
  formationSetupRow: typeof formationSetupRow;
  learnNamedField: LearnShell2Part10['learnNamedField'];
  setupPayloadFromForm: typeof setupPayloadFromForm;
  syncSetupTermSelects: typeof syncSetupTermSelects;
  syncSetupChildLimit: typeof syncSetupChildLimit;
  setupChildRowsFromForm: typeof setupChildRowsFromForm;
  refreshResourceLaneCounts: typeof refreshResourceLaneCounts;
  reindexResourceList: typeof reindexResourceList;
  snapshotResourceModal: typeof snapshotResourceModal;
  restoreResourceModal: typeof restoreResourceModal;
  refreshResourceSummary: typeof refreshResourceSummary;
  moveResourceRowToLane: typeof moveResourceRowToLane;
  setSetupSectionOpen: typeof setSetupSectionOpen;
  setupBlankRow: typeof setupBlankRow;
  moveResourceRowToSubject: typeof moveResourceRowToSubject;
  termWeekSummary: typeof termWeekSummary;
  setupResourceRow: typeof setupResourceRow;
  parseLearnWeekAssignments: LearnShell2Part2['parseLearnWeekAssignments'];
  weekAssignmentStorageKey: typeof weekAssignmentStorageKey;
  syncLearnGoogleCalendar: typeof syncLearnGoogleCalendar;
  waitForLearnSignIn: typeof waitForLearnSignIn;
  downloadBlob: typeof downloadBlob;
  setPrintCount: typeof setPrintCount;
  mount: typeof mount;
  wireWeeklyAssignmentBoard: typeof wireWeeklyAssignmentBoard;
  wireMoveUnfinishedWork: typeof wireMoveUnfinishedWork;
  wireFamilyPrototypeBackend: typeof wireFamilyPrototypeBackend;
  familyPlanningPayloadFromForm: typeof familyPlanningPayloadFromForm;
  dayKeyForChore: typeof dayKeyForChore;
  renderPlanner: typeof renderPlanner;
  renderChoresScope: typeof renderChoresScope;
  choreTimeValues: typeof choreTimeValues;
  mealSlotLabel: typeof mealSlotLabel;
  toPlannerViewModel: typeof toPlannerViewModel;
  renderGradeCourseEditor: typeof renderGradeCourseEditor;
  attendanceStatusMark: typeof attendanceStatusMark;
  attendanceStatusLabel: typeof attendanceStatusLabel;
  renderTestScoreRow: typeof renderTestScoreRow;
  testScoreFromElement: typeof testScoreFromElement;
  openLearnCheckout: typeof openLearnCheckout;
  wireDashboard: typeof wireDashboard;
  wirePlanner: typeof wirePlanner;
  renderFormation: typeof renderFormation;
  renderBooks: typeof renderBooks;
  renderGrades: typeof renderGrades;
  wireGrades: typeof wireGrades;
  renderReportsComingSoon: typeof renderReportsComingSoon;
  renderPrintCenter: typeof renderPrintCenter;
  renderCommunity: typeof renderCommunity;
  wireCommunity: typeof wireCommunity;
  renderCoOp: typeof renderCoOp;
  loadSimpleSetupDraft: typeof loadSimpleSetupDraft;
  wireSimpleSetupWizard: typeof wireSimpleSetupWizard;
  renderSetup: typeof renderSetup;
  applySimpleDraftToSetupVm: typeof applySimpleDraftToSetupVm;
  wireSetupPage: typeof wireSetupPage;
  toBooksViewModel: typeof toBooksViewModel;
  toCoOpViewModel: typeof toCoOpViewModel;
  toCommunityViewModel: typeof toCommunityViewModel;
  toFormationViewModel: typeof toFormationViewModel;
  toGradesViewModel: typeof toGradesViewModel;
  toPrintCenterViewModel: typeof toPrintCenterViewModel;
  toSetupViewModel: typeof toSetupViewModel;
};
