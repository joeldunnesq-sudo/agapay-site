// Generated from src/browser/learn/view-model-setup-print.ts by npm run build:browser. Do not edit.
import { ACCENTS } from './dashboard-view-models-shared.js';
import {
  safeArray,
  text,
  weeklyFrequencyValue,
  childName,
  childInitial,
  childFormByAge,
  shellFromPayload,
  page,
  simpleList,
} from './dashboard-view-models-shared.js';
import { toReportsViewModel } from './view-model-academic.js';
function toSetupViewModel(rawPayload, clientState = {}) {
  const setup = rawPayload?.onboarding || {};
  const setupCompleted = Boolean(setup.setupCompleted || setup.setupSnapshot);
  const snapshot = setup.setupSnapshot || {};
  const onboarding = setup.onboarding || {};
  const preferences = setup.preferences || snapshot.preferences || onboarding.preferences || {};
  const household = setupCompleted ? setup.household || snapshot.household || {} : {};
  const schoolYear = setupCompleted ? setup.schoolYear || snapshot.schoolYear || {} : {};
  const term = setupCompleted ? setup.term || snapshot.term || {} : {};
  const termsSource = safeArray(snapshot.terms).length ? snapshot.terms : safeArray(setup.terms);
  const starterTerms = [
    term,
    {
      id: 'term_2',
      label: 'Term 2',
      startDate: '',
      endDate: '',
      weeksCount: 12,
      paceMode: preferences.paceMode || term.paceMode || 'steady',
    },
    {
      id: 'term_3',
      label: 'Term 3',
      startDate: '',
      endDate: '',
      weeksCount: 12,
      paceMode: preferences.paceMode || term.paceMode || 'steady',
    },
    {
      id: 'term_4',
      label: 'Term 4 / Summer',
      startDate: '',
      endDate: '',
      weeksCount: 12,
      paceMode: preferences.paceMode || term.paceMode || 'steady',
    },
  ];
  const baseSetupTerms = termsSource.length
    ? [...termsSource]
    : setupCompleted
      ? [term].filter((entry) => entry && (entry.id || entry.label))
      : starterTerms;
  const setupTerms = baseSetupTerms.map((entry, index) => ({
    id: text(entry.id, `term_${index + 1}`),
    label: text(entry.label, `Term ${index + 1}`),
    startDate: text(entry.startDate, ''),
    endDate: text(entry.endDate, ''),
    weeksCount: Math.max(1, Math.min(24, Number(entry.weeksCount || 12))),
    paceMode: text(entry.paceMode, preferences.paceMode || term.paceMode || 'steady'),
  }));
  const currentTermId = text(schoolYear.currentTermId || term.id || setupTerms[0]?.id, 'term_1');
  const householdMethod = text(household.primaryMethod, 'Charlotte Mason');
  const childrenSource = setupCompleted ? (safeArray(setup.children).length ? setup.children : snapshot.children) : [];
  const groupingMode =
    text(
      preferences.groupingMode,
      childrenSource.some((child) => text(child.formLabel, '')) || householdMethod === 'Charlotte Mason'
        ? 'forms'
        : 'grades'
    ) === 'grades'
      ? 'grades'
      : 'forms';
  const streamsSource = setupCompleted
    ? safeArray(setup.starterStreams).length
      ? setup.starterStreams
      : safeArray(setup.householdStreams).length
        ? setup.householdStreams
        : snapshot.streams
    : [];
  const subjectsSource = setupCompleted
    ? safeArray(snapshot.subjects).length
      ? snapshot.subjects
      : setup.subjects
    : [];
  const booksSource = setupCompleted ? (safeArray(snapshot.books).length ? snapshot.books : setup.books) : [];
  const formation = setupCompleted ? setup.formation || snapshot.formation || {} : {};
  const setupTiles = snapshot.setupTiles || setup.setupTiles || {};
  const familyPlanning = snapshot.familyPlanning || setup.familyPlanning || {};
  const formationMaterialsSource = safeArray(snapshot.formationMaterials).length
    ? snapshot.formationMaterials
    : setup.formationMaterials;
  const materialDefaults = simpleList(formationMaterialsSource, (material, index) => ({
    id: text(material.id, ''),
    title: text(material.title, 'Formation Material'),
    materialType: text(material.materialType || material.resourceType, 'Catechesis'),
    source: text(material.source || material.author, ''),
    cadence: text(material.cadenceLabel || material.cadence, ''),
    planningMode: text(material.planningMode, 'family'),
    scheduledWeeks: safeArray(material.scheduledWeeks),
    weeklyFrequency: weeklyFrequencyValue(material.weeklyFrequency || material.cadenceLabel || material.cadence, '1x'),
    minutes: text(material.minutes, ''),
    termId: text(material.termId || material.assignedTermId, currentTermId),
    color: text(material.color, ACCENTS[(index + 3) % ACCENTS.length]),
  }));
  const defaultFormationMaterials = materialDefaults.length
    ? materialDefaults
    : [
        {
          id: 'formation_catechesis',
          title: 'Catechesis',
          materialType: 'Catechesis',
          source: '',
          cadence: 'Weekly',
          color: ACCENTS[0],
        },
        {
          id: 'formation_art',
          title: 'Art Study',
          materialType: 'Art Study',
          source: '',
          cadence: 'Weekly',
          color: ACCENTS[2],
        },
        {
          id: 'formation_poetry',
          title: 'Poetry',
          materialType: 'Poetry',
          source: '',
          cadence: 'Weekly',
          color: ACCENTS[3],
        },
        {
          id: 'formation_music',
          title: 'Music Study',
          materialType: 'Music Study',
          source: '',
          cadence: 'Weekly',
          color: ACCENTS[4],
        },
      ];
  const derivedEnrichment = defaultFormationMaterials
    .filter((material) => material.materialType !== 'Catechesis')
    .map((material) => ({
      id: material.id,
      blockType: material.materialType,
      title: material.title,
      cadenceLabel: material.cadence,
      planningMode: material.planningMode || 'family',
      scheduledWeeks: safeArray(material.scheduledWeeks),
      weeklyFrequency: weeklyFrequencyValue(material.weeklyFrequency || material.cadence, '1x'),
      minutesPlanned: '',
      color: material.color,
    }));
  const setupV2Steps = [
    {
      title: 'Household',
      status: household.name && schoolYear.label ? 'complete' : 'active',
      summary: 'Name, parish, method, school year, terms, and calendar.',
    },
    {
      title: 'Children & Forms',
      status: safeArray(childrenSource).length ? 'complete' : 'needed',
      summary: 'Assign each child to the Form used by Planner and Print.',
    },
    {
      title: 'Church Rhythm',
      status: safeArray(formation.churchRhythms).length ? 'complete' : 'needed',
      summary: 'Prayer, readings, saints, feasts, hymnody, and fasting rhythm.',
    },
    {
      title: 'Enrichment',
      status:
        safeArray(formation.recitationTracks).length ||
        safeArray(formation.enrichmentBlocks).length ||
        defaultFormationMaterials.length
          ? 'complete'
          : 'needed',
      summary: 'Memory work, hymnody, saints, feasts, icons, art, poetry, music, and nature.',
    },
    {
      title: 'Form Subjects',
      status: safeArray(subjectsSource).length ? 'complete' : 'needed',
      summary: 'Language arts, literature, languages, history, geography, math, science, and progress ranges.',
    },
  ];
  return {
    setupCompleted,
    shell: shellFromPayload('onboarding', rawPayload),
    page: page('onboarding', 'Set Up', 'Configure the household, calendar, terms, enrichment, subjects, and co-op.'),
    progress: {
      current: onboarding.household?.currentStep || 1,
      total: onboarding.household?.totalSteps || safeArray(onboarding.steps).length || 1,
      next: text(onboarding.household?.nextStep, ''),
    },
    household: {
      name: text(household.name, ''),
      parentName: text(household.parentNames?.[0] || household.parentName, ''),
      motherName: text(household.motherName, ''),
      motherNameDay: text(household.motherNameDay, ''),
      fatherName: text(household.fatherName, ''),
      fatherNameDay: text(household.fatherNameDay, ''),
      parish: text(household.parishName, ''),
      parishPatronalFeastName: text(household.parishPatronalFeastName, ''),
      parishPatronalFeastDate: text(household.parishPatronalFeastDate, ''),
      homeschoolName: text(household.homeschoolName, ''),
      patronSaintName: text(household.patronSaintName, ''),
      patronSaintFeastDate: text(household.patronSaintFeastDate, ''),
      method: householdMethod,
      schoolYear: text(schoolYear.label, ''),
      calendarType: text(household.liturgicalCalendarType, 'julian'),
      paceMode: text(household.paceMode, 'steady'),
    },
    children: simpleList(childrenSource, (child, index) => ({
      id: text(child.id, ''),
      name: childName(child, index),
      firstName: text(child.firstName, childName(child, index)),
      grade: text(child.gradeLabel, ''),
      age: text(child.ageYears, ''),
      nameDay: text(child.nameDay, ''),
      form: text(child.formLabel || child.gradeLabel, childFormByAge(child.ageYears)),
      formLabel: text(child.formLabel || child.gradeLabel, childFormByAge(child.ageYears)),
      initial: childInitial(child, index),
      color: text(child.color, ACCENTS[index % ACCENTS.length]),
    })),
    schoolYear: {
      id: text(schoolYear.id, ''),
      label: text(schoolYear.label, ''),
      startDate: text(schoolYear.startDate, ''),
      endDate: text(schoolYear.endDate, ''),
      currentTermId,
    },
    term: {
      id: text(term.id, ''),
      label: text(term.label, ''),
      startDate: text(term.startDate, ''),
      endDate: text(term.endDate, ''),
      paceMode: text(term.paceMode, preferences.paceMode || 'steady'),
    },
    terms: setupTerms,
    setupTiles,
    steps: setupV2Steps,
    preferences: {
      calendarType: text(clientState.calendar || preferences.calendarType, 'julian'),
      groupingMode,
      evaluationModel: text(preferences.evaluationModel, 'narrative-only'),
      graceModeDefault: text(preferences.graceModeDefault, 'light'),
      graceModeActive: Boolean(preferences.graceModeActive),
      paceMode: text(preferences.paceMode || term.paceMode, 'steady'),
      printPack: text(preferences.printPack, ''),
    },
    streams: simpleList(streamsSource, (stream) => ({
      id: text(stream.id, ''),
      title: text(stream.title, 'Stream'),
      streamType: text(stream.streamType, ''),
      type: text(stream.streamType, ''),
      cadence: text(stream.cadenceLabel, ''),
      dailyMinutes: stream.dailyMinutes || {
        mon: text(stream.monMinutes, '20'),
        tue: text(stream.tueMinutes, '20'),
        wed: text(stream.wedMinutes, '20'),
        thu: text(stream.thuMinutes, '20'),
        fri: text(stream.friMinutes, '20'),
      },
    })),
    subjects: simpleList(subjectsSource, (subject, index) => ({
      id: text(subject.id, ''),
      title: text(subject.title, 'Subject'),
      subjectType: text(subject.subjectType || subject.type, ''),
      planningMode: text(subject.planningMode, subject.childId ? 'forms' : 'forms'),
      scheduledDays: safeArray(subject.scheduledDays),
      scheduledWeeks: safeArray(subject.scheduledWeeks),
      weeklyPlans: safeArray(subject.weeklyPlans),
      weeklyFrequency: weeklyFrequencyValue(
        subject.weeklyFrequency || subject.cadenceLabel || subject.cadence,
        'daily'
      ),
      formLabel: text(subject.formLabel, ''),
      gradeLabel: text(subject.gradeLabel, ''),
      resource: text(subject.resource || safeArray(subject.resources)[0]?.title || subject.title, ''),
      resources: safeArray(subject.resources).length
        ? safeArray(subject.resources)
            .map((resource) =>
              typeof resource === 'string'
                ? { title: text(resource, ''), scheduledWeeks: [] }
                : {
                    title: text(resource.title || resource.resource, ''),
                    scheduledWeeks: safeArray(resource.scheduledWeeks),
                    weeklyPlans: safeArray(resource.weeklyPlans),
                    planningMode: text(resource.planningMode, subject.planningMode || 'forms'),
                    formLabel: text(resource.formLabel, subject.formLabel || ''),
                    formLabels: safeArray(resource.formLabels).length
                      ? safeArray(resource.formLabels)
                      : safeArray(subject.formLabels),
                    gradeLabel: text(resource.gradeLabel, subject.gradeLabel || ''),
                    childIds: safeArray(resource.childIds).length
                      ? safeArray(resource.childIds)
                      : safeArray(subject.childIds),
                  }
            )
            .filter((resource) => resource.title)
        : subject.resource
          ? [
              {
                title: text(subject.resource, ''),
                scheduledWeeks: safeArray(subject.scheduledWeeks),
                weeklyPlans: safeArray(subject.weeklyPlans),
                planningMode: text(subject.planningMode, 'forms'),
                formLabel: text(subject.formLabel, ''),
                formLabels: safeArray(subject.formLabels),
                gradeLabel: text(subject.gradeLabel, ''),
                childIds: safeArray(subject.childIds),
              },
            ]
          : [],
      resourceType: text(subject.resourceType || subject.sourceType, subject.resource ? 'curriculum' : 'none'),
      cadence: text(subject.cadenceLabel || subject.cadence, ''),
      minutes: text(subject.minutes, ''),
      childId: text(subject.childId, ''),
      progressionType: text(subject.progressionType, 'lessons'),
      startNumber: text(subject.startNumber, ''),
      currentNumber: text(subject.currentNumber || subject.completedThroughNumber, ''),
      endNumber: text(subject.endNumber, ''),
      credits: text(subject.credits, ''),
      finalGradeOverride: text(subject.finalGradeOverride, ''),
      termId: text(subject.termId || subject.assignedTermId, currentTermId),
      gracePriority: text(subject.gracePriority, 'keep'),
      graceNote: text(subject.graceNote, 'Deferred gracefully to the reserve list.'),
      color: text(subject.color, ACCENTS[index % ACCENTS.length]),
    })),
    books: simpleList(booksSource, (book, index) => ({
      id: text(book.id, ''),
      title: text(book.title, 'Book'),
      author: text(book.author, ''),
      category: text(book.category, 'Living Books'),
      planningMode: text(book.planningMode, book.formLabel ? 'forms' : 'family'),
      scheduledWeeks: safeArray(book.scheduledWeeks),
      weeklyFrequency: weeklyFrequencyValue(book.weeklyFrequency || book.cadenceLabel || book.cadence, 'daily'),
      minutes: text(book.minutes, '20'),
      formLabel: text(book.formLabel, ''),
      audienceLabel: text(book.audienceLabel, 'Household'),
      startChapter: text(book.startChapter, ''),
      currentChapter: text(book.currentChapter || book.completedThroughChapter, ''),
      endChapter: text(book.endChapter || book.totalChapters, ''),
      termId: text(book.termId || book.assignedTermId, currentTermId),
      graceNote: text(book.graceNote, 'Reading moved into the reserve basket.'),
      color: text(book.color, ACCENTS[(index + 2) % ACCENTS.length]),
    })),
    formationMaterials: defaultFormationMaterials,
    formationSetup: {
      churchRhythms: simpleList(formation.churchRhythms, (rhythm, index) => ({
        id: text(rhythm.id, ''),
        title: text(
          rhythm.title,
          ['Morning Prayers', 'Scripture Readings', 'Saint of the Day', 'Troparion Practice'][index] || 'Church Rhythm'
        ),
        note: text(rhythm.note, ''),
        cadenceLabel: text(rhythm.cadenceLabel || rhythm.cadence, 'Daily'),
        weeklyFrequency: weeklyFrequencyValue(rhythm.weeklyFrequency || rhythm.cadenceLabel || rhythm.cadence, 'daily'),
        minutes: text(rhythm.minutes || rhythm.minutesPlanned, ''),
      })).length
        ? simpleList(formation.churchRhythms, (rhythm, index) => ({
            id: text(rhythm.id, ''),
            title: text(
              rhythm.title,
              ['Morning Prayers', 'Scripture Readings', 'Saint of the Day', 'Troparion Practice'][index] ||
                'Church Rhythm'
            ),
            note: text(rhythm.note, ''),
            cadenceLabel: text(rhythm.cadenceLabel || rhythm.cadence, 'Daily'),
            weeklyFrequency: weeklyFrequencyValue(
              rhythm.weeklyFrequency || rhythm.cadenceLabel || rhythm.cadence,
              'daily'
            ),
            minutes: text(rhythm.minutes || rhythm.minutesPlanned, ''),
          }))
        : [
            {
              id: 'rhythm_morning_prayers',
              title: 'Morning Prayers',
              note: 'Family prayer rule',
              cadenceLabel: 'Daily',
              weeklyFrequency: 'daily',
              minutes: '10',
            },
            {
              id: 'rhythm_scripture',
              title: 'Scripture Readings',
              note: 'Epistle and Gospel',
              cadenceLabel: 'Daily',
              weeklyFrequency: 'daily',
              minutes: '10',
            },
            {
              id: 'rhythm_saint',
              title: 'Saint of the Day',
              note: 'Read and discuss',
              cadenceLabel: 'Daily',
              weeklyFrequency: 'daily',
              minutes: '10',
            },
            {
              id: 'rhythm_troparion',
              title: 'Troparion Practice',
              note: 'Practice hymn of the day',
              cadenceLabel: 'Daily',
              weeklyFrequency: 'daily',
              minutes: '5',
            },
          ],
      catechesis: {
        title: text(
          formation.catechesis?.title,
          defaultFormationMaterials.find((material) => material.materialType === 'Catechesis')?.title || 'Catechesis'
        ),
        currentLesson: text(formation.catechesis?.currentLesson, ''),
        planningMode: text(formation.catechesis?.planningMode, 'family'),
        weeklyFrequency: weeklyFrequencyValue(
          formation.catechesis?.weeklyFrequency || formation.catechesis?.cadenceLabel || formation.catechesis?.cadence,
          '2x'
        ),
        minutes: text(formation.catechesis?.minutes, ''),
        lessonNumber: text(formation.catechesis?.lessonNumber, ''),
        totalLessons: text(formation.catechesis?.totalLessons, ''),
        doctrinalTopic: text(formation.catechesis?.doctrinalTopic || formation.catechesis?.topic, ''),
        source: text(
          formation.catechesis?.source,
          defaultFormationMaterials.find((material) => material.materialType === 'Catechesis')?.source || ''
        ),
      },
      recitationTracks: simpleList(formation.recitationTracks, (track) => ({
        id: text(track.id, ''),
        title: text(track.title, 'Memory Work'),
        sourceKind: text(track.sourceKind || track.source, ''),
        planningMode: text(track.planningMode, 'family'),
        formLabel: text(track.formLabel, ''),
        formLabels: safeArray(track.formLabels),
        gradeLabel: text(track.gradeLabel, ''),
        scheduledWeeks: safeArray(track.scheduledWeeks),
        weeklyFrequency: weeklyFrequencyValue(track.weeklyFrequency || track.cadenceLabel || track.cadence, 'daily'),
        minutes: text(track.minutes, ''),
      })),
      hymnStudies: simpleList(formation.hymnStudies, (hymn) => ({
        id: text(hymn.id, ''),
        title: text(hymn.title, 'Hymn'),
        tone: text(hymn.tone, ''),
        source: text(hymn.source, ''),
        planningMode: text(hymn.planningMode, 'family'),
        weeklyFrequency: weeklyFrequencyValue(hymn.weeklyFrequency || hymn.cadenceLabel || hymn.cadence, '1x'),
        minutes: text(hymn.minutes, ''),
        status: text(hymn.status, 'planned'),
      })),
      enrichmentBlocks: simpleList(formation.enrichmentBlocks, (block) => ({
        id: text(block.id, ''),
        blockType: text(block.blockType || block.type, 'Art Study'),
        title: text(block.title, 'Enrichment'),
        resource: text(block.resource || block.source, ''),
        resources: safeArray(block.resources).length
          ? safeArray(block.resources)
              .map((resource) =>
                typeof resource === 'string'
                  ? { title: resource, scheduledWeeks: [], weeklyPlans: [] }
                  : {
                      title: text(resource.title || resource.resource, ''),
                      scheduledWeeks: safeArray(resource.scheduledWeeks),
                      weeklyPlans: safeArray(resource.weeklyPlans),
                      planningMode: text(resource.planningMode, block.planningMode || 'forms'),
                      formLabel: text(resource.formLabel, ''),
                      formLabels: safeArray(resource.formLabels),
                      gradeLabel: text(resource.gradeLabel, ''),
                      childIds: safeArray(resource.childIds),
                    }
              )
              .filter((resource) => resource.title)
          : [],
        resourceType: text(
          block.resourceType || block.sourceType,
          block.resource || block.source ? 'curriculum' : 'none'
        ),
        cadenceLabel: text(block.cadenceLabel || block.cadence, ''),
        planningMode: text(block.planningMode, 'family'),
        scheduledDays: safeArray(block.scheduledDays),
        scheduledWeeks: safeArray(block.scheduledWeeks),
        weeklyPlans: safeArray(block.weeklyPlans),
        weeklyFrequency: weeklyFrequencyValue(block.weeklyFrequency || block.cadenceLabel || block.cadence, '1x'),
        formLabel: text(block.formLabel, ''),
        formLabels: safeArray(block.formLabels),
        gradeLabel: text(block.gradeLabel, ''),
        childId: text(block.childId, ''),
        progressionType: text(block.progressionType, 'lessons'),
        startNumber: text(block.startNumber, ''),
        currentNumber: text(block.currentNumber || block.completedThroughNumber, ''),
        endNumber: text(block.endNumber, ''),
        minutesPlanned: text(block.minutesPlanned || block.minutes, ''),
        credits: text(block.credits, ''),
        finalGradeOverride: text(block.finalGradeOverride, ''),
        color: text(block.color, ACCENTS[2]),
        termId: text(block.termId || block.assignedTermId, currentTermId),
        gracePriority: text(block.gracePriority, 'keep'),
        graceNote: text(block.graceNote, 'Deferred gracefully to the reserve list.'),
      })).length
        ? simpleList(formation.enrichmentBlocks, (block) => ({
            id: text(block.id, ''),
            blockType: text(block.blockType || block.type, 'Art Study'),
            title: text(block.title, 'Enrichment'),
            resource: text(block.resource || block.source, ''),
            resources: safeArray(block.resources).length
              ? safeArray(block.resources)
                  .map((resource) =>
                    typeof resource === 'string'
                      ? { title: resource, scheduledWeeks: [], weeklyPlans: [] }
                      : {
                          title: text(resource.title || resource.resource, ''),
                          scheduledWeeks: safeArray(resource.scheduledWeeks),
                          weeklyPlans: safeArray(resource.weeklyPlans),
                          planningMode: text(resource.planningMode, block.planningMode || 'forms'),
                          formLabel: text(resource.formLabel, ''),
                          formLabels: safeArray(resource.formLabels),
                          gradeLabel: text(resource.gradeLabel, ''),
                          childIds: safeArray(resource.childIds),
                        }
                  )
                  .filter((resource) => resource.title)
              : [],
            resourceType: text(
              block.resourceType || block.sourceType,
              block.resource || block.source ? 'curriculum' : 'none'
            ),
            cadenceLabel: text(block.cadenceLabel || block.cadence, ''),
            planningMode: text(block.planningMode, 'family'),
            scheduledDays: safeArray(block.scheduledDays),
            scheduledWeeks: safeArray(block.scheduledWeeks),
            weeklyPlans: safeArray(block.weeklyPlans),
            weeklyFrequency: weeklyFrequencyValue(block.weeklyFrequency || block.cadenceLabel || block.cadence, '1x'),
            formLabel: text(block.formLabel, ''),
            formLabels: safeArray(block.formLabels),
            gradeLabel: text(block.gradeLabel, ''),
            childId: text(block.childId, ''),
            progressionType: text(block.progressionType, 'lessons'),
            startNumber: text(block.startNumber, ''),
            currentNumber: text(block.currentNumber || block.completedThroughNumber, ''),
            endNumber: text(block.endNumber, ''),
            minutesPlanned: text(block.minutesPlanned || block.minutes, ''),
            credits: text(block.credits, ''),
            finalGradeOverride: text(block.finalGradeOverride, ''),
            color: text(block.color, ACCENTS[2]),
            termId: text(block.termId || block.assignedTermId, currentTermId),
            gracePriority: text(block.gracePriority, 'keep'),
            graceNote: text(block.graceNote, 'Deferred gracefully to the reserve list.'),
          }))
        : derivedEnrichment,
      feasts: simpleList(formation.feasts, (feast) => ({
        id: text(feast.id, ''),
        civilDate: text(feast.civilDate || feast.date, ''),
        title: text(feast.title, 'Feast'),
        fastingRule: text(feast.fastingRule || feast.fasting, ''),
        planningMode: text(feast.planningMode, 'family'),
        minutes: text(feast.minutes, ''),
        note: text(feast.note, ''),
      })),
    },
    coOp: {
      enabled: Boolean(setup.coOp?.enabled),
      mode: text(setup.coOp?.mode, 'create'),
      name: text(setup.coOp?.name, ''),
      city: text(setup.coOp?.city, ''),
      meetingDay: text(setup.coOp?.meetingDay, ''),
      cycle: text(setup.coOp?.cycle, ''),
      theme: text(setup.coOp?.theme, ''),
      memberNotes: text(setup.coOp?.memberNotes, ''),
    },
    familyPlanning: {
      fastingPreference: text(familyPlanning.fastingPreference, 'guidance'),
      weekStart: text(familyPlanning.weekStart, ''),
      nameDays: safeArray(familyPlanning.nameDays),
      events: safeArray(familyPlanning.events),
      meals: safeArray(familyPlanning.meals),
      recipes: safeArray(familyPlanning.recipes),
      groceryItems: safeArray(familyPlanning.groceryItems),
    },
    calendarOptions: safeArray(setup.calendarToggle?.options),
    evaluationModels: safeArray(setup.evaluationModels),
  };
}
function toPrintCenterViewModel(rawPayload) {
  const printCenter = rawPayload?.printCenter || {};
  const reports = toReportsViewModel({ reports: printCenter.reports || {} });
  const printLimit = Math.max(1, Number(rawPayload?.printLimit || 3));
  const PLANNER_PREMIUM_TYPES = /* @__PURE__ */ new Set([
    'term-plan',
    'liturgical-school-calendar',
    'planner-lesson-week-form',
    'planner-lesson-month-form',
    'planner-lesson-term-form',
    'planner-lesson-week-child',
    'planner-lesson-month-child',
    'planner-lesson-term-child',
    'planner-chores-day',
    'planner-chores-week',
    'planner-chores-month',
    'planner-chores-week-child',
    'planner-meals-week',
    'planner-meals-month',
    'planner-recipes',
    'planner-grocery-week',
  ]);
  return {
    shell: shellFromPayload('print-center', { 'print-center': printCenter }),
    page: page('print-center', 'Print Center', 'Prepare limited, useful print packs for the household and each child.'),
    term: {
      label: text(printCenter.term?.label, ''),
      paceMode: text(printCenter.term?.paceMode, ''),
      week: text(printCenter.week?.label, ''),
      monthKey: text(printCenter.month?.key, /* @__PURE__ */ new Date().toISOString().slice(0, 7)),
    },
    templates: simpleList(printCenter.templates, (template, index) => ({
      id: text(template.id, ''),
      title: text(template.title, 'Print Template'),
      audience: text(template.audience, ''),
      type: text(template.templateType, ''),
      description: text(template.description, ''),
      childId: text(template.childId, ''),
      child: template.child ? childName(template.child, index) : '',
      color: ACCENTS[index % ACCENTS.length],
      premium: template.audience === 'child' || PLANNER_PREMIUM_TYPES.has(template.templateType || ''),
    })),
    document: {
      title: text(printCenter.printDocument?.title, 'Print Preview'),
      subtitle: text(printCenter.printDocument?.subtitle, ''),
      sections: simpleList(printCenter.printDocument?.sections, (section) => ({
        title: text(section.title, 'Section'),
        items: simpleList(section.items, (item) => ({
          label: text(item.label, 'Item'),
          detail: text(item.detail, ''),
          minutes: text(item.minutes, ''),
        })),
      })),
    },
    job: {
      templateId: text(printCenter.draftJob?.templateId, ''),
      format: text(printCenter.draftJob?.format, 'pdf').toUpperCase(),
      range: text(printCenter.draftJob?.rangeLabel, ''),
      status: text(printCenter.draftJob?.status, ''),
    },
    outputs: {
      household: safeArray(printCenter.sampleOutputs?.mom).map((item) => text(item)),
      child: safeArray(printCenter.sampleOutputs?.child).map((item) => text(item)),
      planner: safeArray(printCenter.sampleOutputs?.planner).map((item) => text(item)),
    },
    reports,
    billing: {
      childCount: safeArray(printCenter.children).length,
      printLimit,
    },
  };
}
export { toPrintCenterViewModel, toSetupViewModel };
