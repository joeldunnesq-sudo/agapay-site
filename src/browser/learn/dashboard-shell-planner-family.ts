import { ACCENTS } from './dashboard-view-models-shared.js';
import {
  isOdysseyLearnContext,
  html,
  emptyState,
  setupInput,
  setupSelect,
  setupRemoveButton,
  learnExperience,
  softColor,
  panel,
} from './dashboard-shell-setup-calendar.js';
import type { LearnShell1Part0 } from './dashboard-shell-planner-family-part-1.js';
declare const marketingPreviewActive: LearnShell1Part0['marketingPreviewActive'];
declare const learnSectionHref: LearnShell1Part0['learnSectionHref'];
declare const plannerHref: LearnShell1Part0['plannerHref'];
declare const designedAssignmentsByDateForMonth: LearnShell1Part0['designedAssignmentsByDateForMonth'];
declare const renderWeeklyAssignmentBoard: LearnShell1Part0['renderWeeklyAssignmentBoard'];
declare const plannerDates: LearnShell1Part0['plannerDates'];
declare const plannerDayLabel: LearnShell1Part0['plannerDayLabel'];
declare const choreCadence: LearnShell1Part0['choreCadence'];
declare const choreAssigneeOptions: LearnShell1Part0['choreAssigneeOptions'];
declare const dayOfMonthOptions: LearnShell1Part0['dayOfMonthOptions'];
declare const choreTimeValues: LearnShell1Part0['choreTimeValues'];
declare const choreTimeLabel: LearnShell1Part0['choreTimeLabel'];
declare const choreTimeCheckboxes: LearnShell1Part0['choreTimeCheckboxes'];
declare const eventRecurrence: LearnShell1Part0['eventRecurrence'];
declare const eventRecurrenceLabel: LearnShell1Part0['eventRecurrenceLabel'];
declare const isoDateParts: LearnShell1Part0['isoDateParts'];
declare const eventOccursOnDate: LearnShell1Part0['eventOccursOnDate'];
declare const expandFamilyEvents: LearnShell1Part0['expandFamilyEvents'];
declare const choreSetupRow: LearnShell1Part0['choreSetupRow'];
declare const familyPlannerModel: LearnShell1Part0['familyPlannerModel'];
declare const renderFeastsPanel: LearnShell1Part0['renderFeastsPanel'];
declare const renderFastingLegend: LearnShell1Part0['renderFastingLegend'];
declare const mealSlotLabel: LearnShell1Part0['mealSlotLabel'];
declare const plannerHiddenData: LearnShell1Part0['plannerHiddenData'];
declare const plannerMonthQuery: LearnShell1Part0['plannerMonthQuery'];
declare const renderPlannerDaySelector: LearnShell1Part0['renderPlannerDaySelector'];
declare const renderMealCard: LearnShell1Part0['renderMealCard'];
import type { LearnShell1Part1 } from './dashboard-shell-planner-family-part-2.js';
declare const renderMealsPlan: LearnShell1Part1['renderMealsPlan'];
declare const renderRecipesTool: LearnShell1Part1['renderRecipesTool'];
declare const renderGroceriesTool: LearnShell1Part1['renderGroceriesTool'];
declare const renderPantryTool: LearnShell1Part1['renderPantryTool'];
declare const renderFamilyMonthOverview: LearnShell1Part1['renderFamilyMonthOverview'];
declare const monthDiffBetween: LearnShell1Part1['monthDiffBetween'];
declare const choreAssignedParts: LearnShell1Part1['choreAssignedParts'];
declare const choreDueOnDay: LearnShell1Part1['choreDueOnDay'];
declare const choreScheduleLabel: LearnShell1Part1['choreScheduleLabel'];
declare const choreOpenAttributes: LearnShell1Part1['choreOpenAttributes'];
declare const renderChoresScope: LearnShell1Part1['renderChoresScope'];
declare const renderEventsScope: LearnShell1Part1['renderEventsScope'];
declare const renderFamilyPlannerModals: LearnShell1Part1['renderFamilyPlannerModals'];
declare const renderFamilyPlannerScope: LearnShell1Part1['renderFamilyPlannerScope'];
declare const prototypeWeekDateMap: LearnShell1Part1['prototypeWeekDateMap'];
declare const recipeTitleFromPrototypeId: LearnShell1Part1['recipeTitleFromPrototypeId'];
declare const isImportantPlannerFeast: LearnShell1Part1['isImportantPlannerFeast'];
declare const prototypeStateToFamilyPlanningPayload: LearnShell1Part1['prototypeStateToFamilyPlanningPayload'];
declare const adjacentMonthKey: LearnShell1Part1['adjacentMonthKey'];
declare const uniqueMonthLessons: LearnShell1Part1['uniqueMonthLessons'];
declare const renderMonthLessonChip: LearnShell1Part1['renderMonthLessonChip'];
declare const renderPlannerMonth: LearnShell1Part1['renderPlannerMonth'];
import type { LearnShell1Part2 } from './dashboard-shell-planner-family-part-3.js';
declare const familyEventSetupRow: LearnShell1Part2['familyEventSetupRow'];
declare const recipeSetupRow: LearnShell1Part2['recipeSetupRow'];
declare const grocerySetupRow: LearnShell1Part2['grocerySetupRow'];
declare const nextSevenDates: LearnShell1Part2['nextSevenDates'];

const choreTimeOptions = ['Morning', 'Afternoon', 'Evening'];

const eventRecurrenceOptions = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
];

const PROTOTYPE_RECIPE_TITLES: Record<string, string> = {
  b1: 'Lenten Oatmeal, Apple & Cinnamon',
  b2: 'Avocado & Tomato Toast',
  b3: 'Tahini, Banana & Honey Toast',
  b4: 'Smoked Salmon on Rye',
  b5: 'Yogurt, Honey & Walnuts',
  l1: 'Lentil Soup (Fakes)',
  l2: 'Hummus & Veggie Pita',
  l3: 'Roasted Vegetable Orzo',
  l4: 'Sardines & Greens on Toast',
  l5: 'Greek Salad with Feta',
  d1: 'Gigantes — Greek Baked Beans',
  d2: 'Stuffed Peppers, Rice & Herbs',
  d3: 'Mushroom Stew over Polenta',
  d4: 'Baked Cod, Lemon & Potatoes',
  d5: 'Pan-Seared Trout, Rice Pilaf',
  d6: 'Roast Chicken & Lemon Potatoes',
  d7: 'Spanakopita',
  d8: 'Chickpea & Vegetable Stew',
  d9: 'Herb-Roasted Salmon & Greens',
  s1: 'Olive & Herb Bread',
  s2: 'Semolina Halva',
  s3: 'Chocolate Olive-Oil Cake',
  s4: 'Walnut Baklava',
};
export type LearnShellBindings = {
  eventRecurrenceOptions: typeof eventRecurrenceOptions;
  nextSevenDates: typeof nextSevenDates;
  choreTimeOptions: typeof choreTimeOptions;
  isImportantPlannerFeast: typeof isImportantPlannerFeast;
  familyEventSetupRow: typeof familyEventSetupRow;
  recipeSetupRow: typeof recipeSetupRow;
  grocerySetupRow: typeof grocerySetupRow;
  ACCENTS: typeof ACCENTS;
  isOdysseyLearnContext: typeof isOdysseyLearnContext;
  html: typeof html;
  emptyState: typeof emptyState;
  setupInput: typeof setupInput;
  setupSelect: typeof setupSelect;
  setupRemoveButton: typeof setupRemoveButton;
  learnExperience: typeof learnExperience;
  familyPlannerModel: typeof familyPlannerModel;
  renderPlannerDaySelector: typeof renderPlannerDaySelector;
  renderMealCard: typeof renderMealCard;
  renderFeastsPanel: typeof renderFeastsPanel;
  renderFastingLegend: typeof renderFastingLegend;
  mealSlotLabel: typeof mealSlotLabel;
  plannerHref: typeof plannerHref;
  choreCadence: typeof choreCadence;
  plannerMonthQuery: typeof plannerMonthQuery;
  choreTimeLabel: typeof choreTimeLabel;
  isoDateParts: typeof isoDateParts;
  plannerDayLabel: typeof plannerDayLabel;
  eventRecurrence: typeof eventRecurrence;
  eventRecurrenceLabel: typeof eventRecurrenceLabel;
  choreAssigneeOptions: typeof choreAssigneeOptions;
  dayOfMonthOptions: typeof dayOfMonthOptions;
  choreTimeCheckboxes: typeof choreTimeCheckboxes;
  plannerHiddenData: typeof plannerHiddenData;
  plannerDates: typeof plannerDates;
  PROTOTYPE_RECIPE_TITLES: Record<string, string>;
  designedAssignmentsByDateForMonth: typeof designedAssignmentsByDateForMonth;
  learnSectionHref: typeof learnSectionHref;
  softColor: typeof softColor;
  panel: typeof panel;
};
export {
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
};
