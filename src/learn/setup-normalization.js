// Generated from src/learn/setup-normalization.ts by npm run build:server. Do not edit.
import '../lib/core.js';
import '../handlers/parish.js';
import './academic-records.js';
import './billing.js';
import { getLearnSeedSnapshot } from './demo-data.js';
import './planner-overrides.js';
import {
  nowIso,
  slug,
  stableId,
  text,
  weeklyFrequencyValue,
  scheduledDaysValue,
  frequencyFromDays,
  weeklyPlansValue,
  labelsValue,
  setupResourceValue,
  scheduledWeeksValue,
  schedulingModeValue,
  resourceTypeValue,
  graceModeValue,
  gracePriorityValue,
  normalizeHomeschoolMethod,
  normalizeHistoryCycle,
  int,
  list,
  normalizeCompletion,
  normalizePlannerOverrides,
} from './setup-persistence-shared.js';
function truthySetupNormalization(value) {
  return Boolean(value);
}
function normalizeSetupPayload(payload = {}, identity) {
  const seed = getLearnSeedSnapshot();
  const household = payload.household || {};
  const schoolYear = payload.schoolYear || {};
  const term = payload.term || {};
  const preferences = payload.preferences || {};
  const groupingMode = preferences.groupingMode === 'grades' ? 'grades' : 'forms';
  const primaryMethod = normalizeHomeschoolMethod(household.primaryMethod || seed.household.primaryMethod);
  const parentNames = list(household.parentNames)
    .map((name) => text(name, ''))
    .filter(truthySetupNormalization);
  if (!parentNames.length && text(household.parentName, '')) parentNames.push(text(household.parentName, ''));
  const historyCycle = payload.historyCycle ? normalizeHistoryCycle(payload.historyCycle, primaryMethod) : null;
  const normalizedHousehold = {
    id: identity.householdId,
    slug: slug(household.name || identity.householdId, identity.householdId),
    name: text(household.name, seed.household.name),
    parentNames,
    motherName: text(household.motherName, ''),
    motherNameDay: text(household.motherNameDay, ''),
    fatherName: text(household.fatherName, ''),
    fatherNameDay: text(household.fatherNameDay, ''),
    childrenCount: 0,
    parishName: text(household.parishName, seed.household.parishName || ''),
    parishPatronalFeastName: text(household.parishPatronalFeastName || household.patronalFeastName, ''),
    parishPatronalFeastDate: text(household.parishPatronalFeastDate || household.patronalFeastDate, ''),
    homeschoolName: text(household.homeschoolName, seed.household.homeschoolName || ''),
    patronSaintName: text(household.patronSaintName, seed.household.patronSaintName || ''),
    patronSaintFeastDate: text(household.patronSaintFeastDate, seed.household.patronSaintFeastDate || ''),
    city: text(household.city, ''),
    primaryMethod,
    liturgicalCalendarType: text(
      preferences.calendarType || household.liturgicalCalendarType,
      seed.household.liturgicalCalendarType || 'julian'
    ),
    paceMode: text(preferences.paceMode || household.paceMode, seed.household.paceMode || 'steady'),
    graceModeActive: Boolean(preferences.graceModeActive ?? seed.household.graceModeActive),
    setupCompleted: true,
  };
  const children = list(payload.children)
    .map((child, index) => {
      const firstName = text(child.firstName || child.name, '');
      if (!firstName) return null;
      return {
        id: text(child.id, stableId('child', firstName, index)),
        householdId: identity.householdId,
        firstName,
        ageYears: int(child.ageYears || child.age, 0),
        nameDay: text(child.nameDay, ''),
        gradeLabel: text(child.gradeLabel || child.grade, child.formLabel || ''),
        formLabel: text(child.formLabel, ''),
        color: text(child.color, ''),
        avatarMonogram: text(child.avatarMonogram, firstName.charAt(0).toUpperCase()),
        accentToken: text(child.accentToken, seed.children[index % seed.children.length]?.accentToken || 'navy'),
      };
    })
    .filter(truthySetupNormalization);
  normalizedHousehold.childrenCount = children.length;
  const schoolYearId = text(schoolYear.id, 'school_year_current');
  const normalizedTerms = (list(payload.terms).length ? list(payload.terms) : [term])
    .map((entry, index) => ({
      ...seed.term,
      id: text(entry.id, `term_${index + 1}`),
      schoolYearId,
      label: text(entry.label, `Term ${index + 1}`),
      startDate: text(entry.startDate, index === 0 ? seed.term.startDate : ''),
      endDate: text(entry.endDate, index === 0 ? seed.term.endDate : ''),
      weeksCount: Math.max(1, Math.min(24, int(entry.weeksCount, 12))),
      description: text(entry.description, ''),
      paceMode: text(preferences.paceMode || entry.paceMode, seed.term.paceMode || 'steady'),
    }))
    .filter((entry) => entry.label);
  const requestedCurrentTermId = text(schoolYear.currentTermId || payload.currentTermId || term.id, '');
  const currentTermFromList =
    normalizedTerms.find((entry) => entry.id === requestedCurrentTermId) || normalizedTerms[0];
  const normalizedSchoolYear = {
    ...seed.schoolYear,
    id: schoolYearId,
    householdId: identity.householdId,
    label: text(schoolYear.label, seed.schoolYear.label),
    startDate: text(schoolYear.startDate, seed.schoolYear.startDate),
    endDate: text(schoolYear.endDate, seed.schoolYear.endDate),
    status: 'active',
    currentTermId: currentTermFromList?.id || 'term_1',
  };
  const normalizedTerm = {
    ...(currentTermFromList || normalizedTerms[0] || seed.term),
    id: currentTermFromList?.id || 'term_1',
  };
  const streams = list(payload.streams)
    .map((stream, index) => ({
      id: text(stream.id, stableId('stream', stream.title, index)),
      householdId: identity.householdId,
      streamType: text(stream.streamType || stream.type, 'custom'),
      title: text(stream.title, 'Family-Based Block'),
      cadenceLabel: text(stream.cadenceLabel || stream.cadence, 'Weekly'),
      dailyMinutes: {
        mon: int(stream.dailyMinutes?.mon ?? stream.monMinutes, 20),
        tue: int(stream.dailyMinutes?.tue ?? stream.tueMinutes, 20),
        wed: int(stream.dailyMinutes?.wed ?? stream.wedMinutes, 20),
        thu: int(stream.dailyMinutes?.thu ?? stream.thuMinutes, 20),
        fri: int(stream.dailyMinutes?.fri ?? stream.friMinutes, 20),
      },
    }))
    .filter((stream) => stream.title);
  const books = list(payload.books)
    .map((book, index) => ({
      id: text(book.id, stableId('book', book.title, index)),
      householdId: identity.householdId,
      title: text(book.title, ''),
      author: text(book.author, ''),
      category: text(book.category, 'Living Books'),
      planningMode: text(book.planningMode, book.formLabel ? 'forms' : 'family'),
      scheduledWeeks: scheduledWeeksValue(book.scheduledWeeks),
      weeklyFrequency: weeklyFrequencyValue(book.weeklyFrequency || book.cadenceLabel || book.cadence, 'daily'),
      minutes: int(book.minutes, 20),
      formLabel: text(book.formLabel, ''),
      audienceLabel: text(book.audienceLabel, 'Household'),
      startChapter: int(book.startChapter, 1),
      currentChapter: int(
        book.currentChapter || book.completedThroughChapter || book.startChapter,
        int(book.startChapter, 1)
      ),
      endChapter: int(book.endChapter || book.totalChapters, 0),
      totalChapters: int(book.endChapter || book.totalChapters, 0),
      color: text(book.color, ''),
      termId: text(book.termId || book.assignedTermId, normalizedTerm.id),
      graceNote: text(book.graceNote, 'Reading moved into the reserve basket.'),
    }))
    .filter((book) => book.title);
  const subjects = list(payload.subjects)
    .map((subject, index) => {
      const subjectDays = scheduledDaysValue(
        subject.scheduledDays,
        subject.weeklyFrequency || subject.cadenceLabel || subject.cadence || 'daily'
      );
      return {
        id: text(subject.id, stableId('subject', subject.title, index)),
        subjectType: text(subject.subjectType || subject.type, slug(subject.title, 'subject')),
        title: text(subject.title, 'Subject'),
        instructionMode: text(subject.instructionMode, 'parent-led'),
        schedulingMode: schedulingModeValue(subject.schedulingMode),
        scheduledDays: subjectDays,
        scheduledWeeks: scheduledWeeksValue(subject.scheduledWeeks),
        weeklyFrequency: frequencyFromDays(subjectDays),
        weeklyPlans: weeklyPlansValue(subject.weeklyPlans),
        weeklyTarget: Math.max(0, int(subject.weeklyTarget, 0)),
        termTarget: Math.max(0, int(subject.termTarget, 0)),
        activeStartDate: text(subject.activeStartDate, ''),
        activeEndDate: text(subject.activeEndDate, ''),
        priorityLevel: ['essential', 'important', 'enrichment', 'optional'].includes(subject.priorityLevel)
          ? subject.priorityLevel
          : 'important',
        missedLessonBehavior: text(
          subject.missedLessonBehavior,
          preferences.defaultMissedLessonBehavior || 'next-occurrence'
        ),
        planningMode: labelsValue(subject.formLabels || subject.formLabel).length
          ? 'forms'
          : text(subject.planningMode, 'forms'),
        formLabel: text(subject.formLabel, labelsValue(subject.formLabels || '')[0] || ''),
        formLabels: labelsValue(subject.formLabels || subject.formLabel),
        gradeLabel: text(subject.gradeLabel, ''),
        resource: text(
          Array.isArray(subject.resources) && subject.resources.length
            ? subject.resources[0]?.title || subject.resources[0]
            : subject.resource,
          ''
        ),
        resources:
          Array.isArray(subject.resources) && subject.resources.length
            ? subject.resources
                .map((resource) => setupResourceValue(resource, subject))
                .filter(truthySetupNormalization)
            : subject.resource
              ? [setupResourceValue({ title: subject.resource }, subject)].filter(truthySetupNormalization)
              : [],
        resourceType: resourceTypeValue(
          subject.resourceType || subject.sourceType,
          subject.resource ? 'curriculum' : 'none'
        ),
        cadenceLabel: text(subject.weeklyFrequency || subject.cadenceLabel || subject.cadence, 'Weekly'),
        minutes: int(subject.minutes, 20),
        childId: text(subject.childId, ''),
        childIds: Array.isArray(subject.childIds) ? subject.childIds.filter(truthySetupNormalization) : [],
        startNumber: int(subject.startNumber, 1),
        currentNumber: int(
          subject.currentNumber || subject.completedThroughNumber || subject.startNumber,
          int(subject.startNumber, 1)
        ),
        endNumber: int(subject.endNumber, 0),
        credits: Math.max(0, Number(subject.credits) || 0),
        finalGradeOverride: text(subject.finalGradeOverride, ''),
        color: text(subject.color, ''),
        termId: text(subject.termId || subject.assignedTermId, normalizedTerm.id),
        gracePriority: gracePriorityValue(subject.gracePriority, 'core'),
        graceNote: text(subject.graceNote, 'Deferred gracefully to the reserve list.'),
      };
    })
    .filter((subject) => subject.title);
  const formationMaterials = list(payload.formationMaterials)
    .map((material, index) => ({
      id: text(material.id, stableId('formation', material.title, index)),
      title: text(material.title, ''),
      materialType: text(material.materialType || material.type, 'Catechesis'),
      source: text(material.source || material.author, ''),
      planningMode: text(material.planningMode, 'family'),
      scheduledWeeks: scheduledWeeksValue(material.scheduledWeeks),
      weeklyFrequency: weeklyFrequencyValue(
        material.weeklyFrequency || material.cadenceLabel || material.cadence,
        '1x'
      ),
      cadenceLabel: text(material.weeklyFrequency || material.cadenceLabel || material.cadence, 'Weekly'),
      minutes: int(material.minutes, 0),
      color: text(material.color, ''),
      termId: text(material.termId || material.assignedTermId, normalizedTerm.id),
    }))
    .filter((material) => material.title);
  const rawFormation = payload.formation || {};
  const formation = {
    churchRhythms: list(rawFormation.churchRhythms)
      .map((rhythm, index) => ({
        id: text(rhythm.id, stableId('rhythm', rhythm.title, index)),
        title: text(rhythm.title, ''),
        note: text(rhythm.note, ''),
        weeklyFrequency: weeklyFrequencyValue(rhythm.weeklyFrequency || rhythm.cadenceLabel || rhythm.cadence, 'daily'),
        cadenceLabel: text(rhythm.weeklyFrequency || rhythm.cadenceLabel || rhythm.cadence, 'Daily'),
        minutes: int(rhythm.minutes || rhythm.minutesPlanned, 0),
        status: text(rhythm.status, 'planned'),
      }))
      .filter((rhythm) => rhythm.title),
    catechesis: {
      id: text(rawFormation.catechesis?.id, 'catechesis_setup'),
      householdId: identity.householdId,
      cycleYearId: seed.cycleYear?.id || 'cycle_current',
      title: text(
        rawFormation.catechesis?.title,
        formationMaterials.find((material) => material.materialType === 'Catechesis')?.title || 'Catechesis'
      ),
      currentLesson: text(rawFormation.catechesis?.currentLesson, ''),
      planningMode: text(rawFormation.catechesis?.planningMode, 'family'),
      weeklyFrequency: weeklyFrequencyValue(
        rawFormation.catechesis?.weeklyFrequency ||
          rawFormation.catechesis?.cadenceLabel ||
          rawFormation.catechesis?.cadence,
        '2x'
      ),
      minutes: int(rawFormation.catechesis?.minutes, 0),
      lessonNumber: int(rawFormation.catechesis?.lessonNumber, 0),
      totalLessons: int(rawFormation.catechesis?.totalLessons, 0),
      doctrinalTopic: text(rawFormation.catechesis?.doctrinalTopic || rawFormation.catechesis?.topic, ''),
      source: text(rawFormation.catechesis?.source, ''),
      evaluationModel: text(preferences.evaluationModel, 'narrative-only'),
    },
    recitationTracks: list(rawFormation.recitationTracks)
      .map((track, index) => ({
        id: text(track.id, stableId('recitation', track.title, index)),
        householdId: identity.householdId,
        title: text(track.title, ''),
        sourceKind: text(track.sourceKind || track.source, 'memory'),
        planningMode: labelsValue(track.formLabels || track.formLabel).length
          ? 'forms'
          : text(track.planningMode, 'family'),
        formLabel: labelsValue(track.formLabels || track.formLabel)[0] || '',
        formLabels: labelsValue(track.formLabels || track.formLabel),
        gradeLabel: text(track.gradeLabel, ''),
        scheduledWeeks: scheduledWeeksValue(track.scheduledWeeks),
        weeklyFrequency: weeklyFrequencyValue(track.weeklyFrequency || track.cadenceLabel || track.cadence, 'daily'),
        minutes: int(track.minutes, 0),
      }))
      .filter((track) => track.title),
    hymnStudies: list(rawFormation.hymnStudies)
      .map((hymn, index) => ({
        id: text(hymn.id, stableId('hymn', hymn.title, index)),
        householdId: identity.householdId,
        termId: normalizedTerm.id,
        title: text(hymn.title, ''),
        tone: text(hymn.tone, ''),
        source: text(hymn.source, ''),
        planningMode: text(hymn.planningMode, 'family'),
        weeklyFrequency: weeklyFrequencyValue(hymn.weeklyFrequency || hymn.cadenceLabel || hymn.cadence, '1x'),
        minutes: int(hymn.minutes, 0),
        status: text(hymn.status, 'planned'),
      }))
      .filter((hymn) => hymn.title),
    enrichmentBlocks: list(rawFormation.enrichmentBlocks)
      .map((block, index) => {
        const blockDays = scheduledDaysValue(
          block.scheduledDays,
          block.weeklyFrequency || block.cadenceLabel || block.cadence || '1x'
        );
        const hasResourcesField = Array.isArray(block.resources);
        const blockResources = hasResourcesField
          ? list(block.resources)
              .map((resource) => setupResourceValue(resource, block))
              .filter(truthySetupNormalization)
          : block.resource || block.source
            ? [
                setupResourceValue(
                  {
                    title: block.resource || block.source,
                    scheduledWeeks: block.scheduledWeeks,
                    weeklyPlans: block.weeklyPlans,
                  },
                  block
                ),
              ].filter(truthySetupNormalization)
            : [];
        const primaryResource = blockResources[0] || {};
        return {
          id: text(block.id, stableId('enrich', block.title, index)),
          householdId: identity.householdId,
          termId: text(block.termId || block.assignedTermId, normalizedTerm.id),
          blockType: text(block.blockType || block.type, 'enrichment'),
          title: text(block.title, ''),
          resource: text(primaryResource.title || block.resource || block.source, ''),
          resources: blockResources,
          resourceType: resourceTypeValue(
            block.resourceType || block.sourceType,
            block.resource || block.source || blockResources.length ? 'curriculum' : 'none'
          ),
          planningMode:
            labelsValue(block.formLabels || block.formLabel).length ||
            blockResources.some((resource) => labelsValue(resource.formLabels || resource.formLabel).length)
              ? 'forms'
              : text(block.planningMode, 'family'),
          instructionMode: text(block.instructionMode, 'shared'),
          schedulingMode: schedulingModeValue(block.schedulingMode),
          scheduledDays: blockDays,
          scheduledWeeks: scheduledWeeksValue(block.scheduledWeeks),
          weeklyFrequency: frequencyFromDays(blockDays),
          weeklyPlans: weeklyPlansValue(block.weeklyPlans),
          weeklyTarget: Math.max(0, int(block.weeklyTarget, 0)),
          termTarget: Math.max(0, int(block.termTarget, 0)),
          activeStartDate: text(block.activeStartDate, ''),
          activeEndDate: text(block.activeEndDate, ''),
          priorityLevel: ['essential', 'important', 'enrichment', 'optional'].includes(block.priorityLevel)
            ? block.priorityLevel
            : 'enrichment',
          missedLessonBehavior: text(
            block.missedLessonBehavior,
            preferences.defaultMissedLessonBehavior || 'next-occurrence'
          ),
          formLabels: labelsValue(block.formLabels || block.formLabel),
          formLabel: text(block.formLabel, labelsValue(block.formLabels || block.formLabel)[0] || ''),
          gradeLabel: text(block.gradeLabel, ''),
          childId: text(block.childId, ''),
          childIds: Array.isArray(block.childIds) ? block.childIds.filter(truthySetupNormalization) : [],
          startNumber: text(block.startNumber, ''),
          currentNumber: text(block.currentNumber || block.completedThroughNumber, ''),
          endNumber: text(block.endNumber, ''),
          minutesPlanned: int(block.minutesPlanned || block.minutes, 0),
          credits: text(block.credits, ''),
          finalGradeOverride: text(block.finalGradeOverride, ''),
          cadenceLabel: text(block.weeklyFrequency || block.cadenceLabel || block.cadence, 'Weekly'),
          color: text(block.color, ''),
          gracePriority: gracePriorityValue(block.gracePriority, 'medium'),
          graceNote: text(block.graceNote, 'Deferred gracefully to the reserve list.'),
        };
      })
      .filter((block) => block.title),
    feasts: list(rawFormation.feasts)
      .map((feast, index) => ({
        id: text(feast.id, stableId('feast', feast.title, index)),
        civilDate: text(feast.civilDate || feast.date, ''),
        title: text(feast.title, ''),
        fastingRule: text(feast.fastingRule || feast.fasting, ''),
        planningMode: text(feast.planningMode, 'family'),
        minutes: int(feast.minutes, 0),
        note: text(feast.note, ''),
      }))
      .filter((feast) => feast.title),
  };
  const coOp = {
    enabled: false,
    status: 'coming-soon',
  };
  const rawFamilyPlanning = payload.familyPlanning || {};
  const familyPlanning = {
    fastingPreference: ['guidance', 'strict', 'off'].includes(rawFamilyPlanning.fastingPreference)
      ? rawFamilyPlanning.fastingPreference
      : 'guidance',
    weekStart: text(rawFamilyPlanning.weekStart, ''),
    nameDays: [
      normalizedHousehold.motherNameDay && normalizedHousehold.motherName
        ? {
            id: 'name_day_mother',
            personName: normalizedHousehold.motherName,
            relationship: 'mother',
            monthDay: normalizedHousehold.motherNameDay.slice(-5),
          }
        : null,
      normalizedHousehold.fatherNameDay && normalizedHousehold.fatherName
        ? {
            id: 'name_day_father',
            personName: normalizedHousehold.fatherName,
            relationship: 'father',
            monthDay: normalizedHousehold.fatherNameDay.slice(-5),
          }
        : null,
      ...children.map((child) =>
        child.nameDay
          ? {
              id: `name_day_${child.id}`,
              personId: child.id,
              personName: child.firstName,
              relationship: 'child',
              monthDay: child.nameDay.slice(-5),
            }
          : null
      ),
    ].filter(truthySetupNormalization),
    events: list(rawFamilyPlanning.events)
      .slice(0, 250)
      .map((event, index) => {
        const recurrence = text(event.recurrence || event.repeat || '', '').toLowerCase();
        return {
          id: text(event.id, stableId('event', event.title, index)),
          title: text(event.title, 'Event'),
          eventType: text(event.eventType, 'appointment'),
          date: text(event.date, ''),
          startTime: text(event.startTime, ''),
          recurrence: ['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'].includes(recurrence)
            ? recurrence
            : 'none',
          location: text(event.location, ''),
          notes: text(event.notes, ''),
        };
      })
      .filter((event) => event.date),
    meals: list(rawFamilyPlanning.meals)
      .slice(0, 120)
      .map((meal, index) => ({
        id: text(meal.id, stableId('meal', meal.date, index)),
        date: text(meal.date, ''),
        breakfast: text(meal.breakfast, ''),
        lunch: text(meal.lunch, ''),
        dinner: text(meal.dinner, ''),
      }))
      .filter((meal) => meal.date),
    recipes: list(rawFamilyPlanning.recipes)
      .slice(0, 250)
      .map((recipe, index) => ({
        id: text(recipe.id, stableId('recipe', recipe.title, index)),
        title: text(recipe.title, ''),
        fastingType: ['fast-friendly', 'adaptable', 'regular'].includes(recipe.fastingType)
          ? recipe.fastingType
          : 'adaptable',
        category: text(recipe.category, 'Dinner'),
        sourceUrl: text(recipe.sourceUrl, ''),
        ingredients: text(recipe.ingredients, ''),
        instructions: text(recipe.instructions, ''),
      }))
      .filter((recipe) => recipe.title),
    groceryItems: list(rawFamilyPlanning.groceryItems)
      .slice(0, 250)
      .map((item, index) => ({
        id: text(item.id, stableId('grocery', item.name, index)),
        name: text(item.name, ''),
        quantity: text(item.quantity, ''),
        category: text(item.category, 'Other'),
        checked: Boolean(item.checked),
        pantry: Boolean(item.pantry || item.inPantry),
      }))
      .filter((item) => item.name),
    chores: list(rawFamilyPlanning.chores)
      .slice(0, 250)
      .map((chore, index) => {
        const cadence = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'].includes(
          text(chore.cadence || chore.frequency, '').toLowerCase()
        )
          ? text(chore.cadence || chore.frequency, '').toLowerCase()
          : chore.day
            ? 'weekly'
            : 'daily';
        return {
          id: text(chore.id, stableId('chore', chore.title || chore.assignee, index)),
          title: text(chore.title, ''),
          assignee: text(chore.assignee, 'Everyone'),
          cadence,
          day: text(chore.day, ''),
          dayOfMonth: int(chore.dayOfMonth, 0) ? String(Math.max(1, Math.min(31, int(chore.dayOfMonth, 0)))) : '',
          quarterMonth: ['1', '2', '3'].includes(text(chore.quarterMonth, '')) ? text(chore.quarterMonth, '') : '1',
          assignedDate: /^\d{4}-\d{2}-\d{2}$/.test(text(chore.assignedDate || chore.startDate || chore.date, ''))
            ? text(chore.assignedDate || chore.startDate || chore.date, '')
            : '',
          timeOfDay: text(chore.timeOfDay, 'Anytime'),
          notes: text(chore.notes, ''),
          completed: Boolean(chore.completed),
        };
      })
      .filter((chore) => chore.title || chore.assignee),
  };
  const rawSetupTiles = payload.setupTiles && typeof payload.setupTiles === 'object' ? payload.setupTiles : {};
  const setupTiles = Object.fromEntries(
    Object.entries(rawSetupTiles)
      .filter(([, group]) => group && typeof group === 'object')
      .map(([groupKey, group]) => [
        text(groupKey, ''),
        Object.fromEntries(
          Object.entries(group)
            .filter(([, tile]) => tile && typeof tile === 'object')
            .map(([tileKey, tile]) => [
              text(tileKey, ''),
              {
                title: text(tile.title, ''),
                detail: text(tile.detail, ''),
                minutes: text(tile.minutes, ''),
              },
            ])
            .filter(([tileKey, tile]) => tileKey && (tile.title || tile.detail || tile.minutes))
        ),
      ])
      .filter(([groupKey, group]) => groupKey && Object.keys(group).length)
  );
  return {
    version: 1,
    savedAt: nowIso(),
    identity,
    household: normalizedHousehold,
    children,
    schoolYear: normalizedSchoolYear,
    term: normalizedTerm,
    terms: normalizedTerms,
    preferences: {
      calendarType: normalizedHousehold.liturgicalCalendarType,
      groupingMode,
      defaultSchoolDays: scheduledDaysValue(preferences.defaultSchoolDays, 'daily'),
      defaultMissedLessonBehavior: text(preferences.defaultMissedLessonBehavior, 'next-occurrence'),
      defaultMaxDailyMinutes: Math.max(30, int(preferences.defaultMaxDailyMinutes, 240)),
      paceMode: normalizedHousehold.paceMode,
      evaluationModel: text(preferences.evaluationModel, 'narrative-only'),
      graceModeDefault: graceModeValue(preferences.graceModeDefault, 'light'),
      graceModeActive: normalizedHousehold.graceModeActive,
      printPack: text(preferences.printPack, 'weekly-household'),
    },
    streams,
    subjects,
    books,
    setupTiles,
    familyPlanning,
    formation,
    formationMaterials,
    historyCycle,
    completion: normalizeCompletion(payload.completion),
    plannerOverrides: normalizePlannerOverrides(payload.plannerOverrides),
    starterWeek:
      payload.starterWeek && typeof payload.starterWeek === 'object'
        ? {
            generatedAt: text(payload.starterWeek.generatedAt, ''),
            enabled: Boolean(payload.starterWeek.enabled),
          }
        : null,
    coOp,
  };
}
export { normalizeSetupPayload };
