import type { LearnShell0Part0 } from './dashboard-shell-setup-calendar-part-1.js';
declare const isOdysseyLearnContext: LearnShell0Part0['isOdysseyLearnContext'];
declare const learnViewMode: LearnShell0Part0['learnViewMode'];
declare const learnExperience: LearnShell0Part0['learnExperience'];
declare const html: LearnShell0Part0['html'];
declare const panel: LearnShell0Part0['panel'];
declare const emptyState: LearnShell0Part0['emptyState'];
declare const softColor: LearnShell0Part0['softColor'];
declare const renderPlannerTerm: LearnShell0Part0['renderPlannerTerm'];
declare const renderPlannerYear: LearnShell0Part0['renderPlannerYear'];
declare const attendanceDateLabel: LearnShell0Part0['attendanceDateLabel'];
declare const attendanceStatusLabel: LearnShell0Part0['attendanceStatusLabel'];
declare const attendanceStatusMark: LearnShell0Part0['attendanceStatusMark'];
declare const isoDateFromUTC: LearnShell0Part0['isoDateFromUTC'];
declare const utcHolidayDate: LearnShell0Part0['utcHolidayDate'];
declare const addHoliday: LearnShell0Part0['addHoliday'];
declare const addObservedFixedHoliday: LearnShell0Part0['addObservedFixedHoliday'];
declare const nthWeekdayOfMonth: LearnShell0Part0['nthWeekdayOfMonth'];
declare const lastWeekdayOfMonth: LearnShell0Part0['lastWeekdayOfMonth'];
declare const usFederalHolidayMap: LearnShell0Part0['usFederalHolidayMap'];
declare const nationalHolidayForDate: LearnShell0Part0['nationalHolidayForDate'];
declare const renderAttendanceTracker: LearnShell0Part0['renderAttendanceTracker'];
declare const setupInput: LearnShell0Part0['setupInput'];
declare const setupSelect: LearnShell0Part0['setupSelect'];
declare const setupTermOptions: LearnShell0Part0['setupTermOptions'];
declare const termSetupRow: LearnShell0Part0['termSetupRow'];
declare const setupRemoveButton: LearnShell0Part0['setupRemoveButton'];
declare const setupGracePriorityValue: LearnShell0Part0['setupGracePriorityValue'];
declare const setupGraceModeBehavior: LearnShell0Part0['setupGraceModeBehavior'];
declare const planningModeOptionsFor: LearnShell0Part0['planningModeOptionsFor'];
declare const setupGroupOptions: LearnShell0Part0['setupGroupOptions'];
declare const activeSetupGroupLabels: LearnShell0Part0['activeSetupGroupLabels'];
declare const primaryResourceGroupLabel: LearnShell0Part0['primaryResourceGroupLabel'];
declare const scheduledTermWeeks: LearnShell0Part0['scheduledTermWeeks'];
declare const selectedTermWeeks: LearnShell0Part0['selectedTermWeeks'];
declare const termWeekSummaryFromSelected: LearnShell0Part0['termWeekSummaryFromSelected'];
declare const termWeekSummary: LearnShell0Part0['termWeekSummary'];
declare const setupTermWeekPicker: LearnShell0Part0['setupTermWeekPicker'];
import type { LearnShell0Part1 } from './dashboard-shell-setup-calendar-part-2.js';
declare const resourceFieldName: LearnShell0Part1['resourceFieldName'];
declare const setupResourceWeekPicker: LearnShell0Part1['setupResourceWeekPicker'];
declare const setupResourceWeeklyPlanFields: LearnShell0Part1['setupResourceWeeklyPlanFields'];
declare const setupResourcePlanningModePicker: LearnShell0Part1['setupResourcePlanningModePicker'];
declare const setupResourceChildPicker: LearnShell0Part1['setupResourceChildPicker'];
declare const setupResourcePlanningCard: LearnShell0Part1['setupResourcePlanningCard'];
declare const normalizeSetupResource: LearnShell0Part1['normalizeSetupResource'];
declare const setupResourceRow: LearnShell0Part1['setupResourceRow'];
declare const setupResourceLane: LearnShell0Part1['setupResourceLane'];
declare const setupResourceList: LearnShell0Part1['setupResourceList'];
declare const setupPlanningModePicker: LearnShell0Part1['setupPlanningModePicker'];
declare const setupColorSelect: LearnShell0Part1['setupColorSelect'];
declare const setupChildColor: LearnShell0Part1['setupChildColor'];
declare const childSetupRow: LearnShell0Part1['childSetupRow'];
declare const subjectSetupRow: LearnShell0Part1['subjectSetupRow'];
declare const bookSetupRow: LearnShell0Part1['bookSetupRow'];
declare const formationSetupRow: LearnShell0Part1['formationSetupRow'];
declare const formationRhythmSetupRow: LearnShell0Part1['formationRhythmSetupRow'];
declare const formationRecitationSetupRow: LearnShell0Part1['formationRecitationSetupRow'];
declare const formationEnrichmentSetupRow: LearnShell0Part1['formationEnrichmentSetupRow'];

const US_FEDERAL_HOLIDAY_CACHE = new Map<number, Map<string, string>>();

const formOptions = ['Little Ones', 'Form I', 'Form II', 'Form III', 'Form IV'];

const graceModeOptions = [
  { value: 'core', label: '1 Core: chosen first in every mode' },
  { value: 'high', label: '2 High: keep after Core' },
  { value: 'medium', label: '3 Medium: keep if the cap has room' },
  { value: 'low', label: '4 Low: first moved to reserve' },
];

const missedLessonOptions = [
  { value: 'next-school-day', label: 'Move to next school day' },
  { value: 'next-occurrence', label: 'Move to next scheduled occurrence' },
  { value: 'end-of-term', label: 'Add to end of term' },
  { value: 'leave-incomplete', label: 'Leave incomplete' },
  { value: 'skip', label: 'Skip automatically' },
  { value: 'ask', label: 'Ask each time' },
];

const planningModeOptions = planningModeOptionsFor('forms');

const weeklyFrequencyOptions = [
  { value: 'daily', label: 'Daily' },
  { value: '4x', label: '4x / week' },
  { value: '3x', label: '3x / week' },
  { value: '2x', label: '2x / week' },
  { value: '1x', label: '1x / week' },
  { value: 'as-needed', label: 'As needed' },
];

const simpleScheduleOptions = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
];

const DEFAULT_TERM_WEEK_COUNT = 12;

const colorChoices = [
  '#14294a',
  '#6e2f2a',
  '#4a5a31',
  '#b5942f',
  '#4b3158',
  '#34507a',
  '#7f3f2a',
  '#2f5f5b',
  '#7b496f',
  '#8a6a2f',
  '#3f4f73',
  '#9a3f45',
];
export type LearnShellBindings = {
  US_FEDERAL_HOLIDAY_CACHE: typeof US_FEDERAL_HOLIDAY_CACHE;
  graceModeOptions: typeof graceModeOptions;
  formOptions: typeof formOptions;
  DEFAULT_TERM_WEEK_COUNT: typeof DEFAULT_TERM_WEEK_COUNT;
  selectedTermWeeks: typeof selectedTermWeeks;
  termWeekSummaryFromSelected: typeof termWeekSummaryFromSelected;
  html: typeof html;
  setupGroupOptions: typeof setupGroupOptions;
  activeSetupGroupLabels: typeof activeSetupGroupLabels;
  primaryResourceGroupLabel: typeof primaryResourceGroupLabel;
  colorChoices: typeof colorChoices;
  setupSelect: typeof setupSelect;
  setupInput: typeof setupInput;
  setupRemoveButton: typeof setupRemoveButton;
  simpleScheduleOptions: typeof simpleScheduleOptions;
  setupTermOptions: typeof setupTermOptions;
  missedLessonOptions: typeof missedLessonOptions;
  setupGraceModeBehavior: typeof setupGraceModeBehavior;
  planningModeOptions: typeof planningModeOptions;
  weeklyFrequencyOptions: typeof weeklyFrequencyOptions;
  setupTermWeekPicker: typeof setupTermWeekPicker;
  learnExperience: typeof learnExperience;
};
export {
  isOdysseyLearnContext,
  html,
  learnExperience,
  emptyState,
  renderPlannerTerm,
  renderPlannerYear,
  softColor,
  setupInput,
  setupSelect,
  panel,
  setupRemoveButton,
  renderAttendanceTracker,
  DEFAULT_TERM_WEEK_COUNT,
  formationRhythmSetupRow,
  formationRecitationSetupRow,
  formationEnrichmentSetupRow,
  subjectSetupRow,
  formOptions,
  colorChoices,
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
};
