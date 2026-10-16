import type { LearnTruthyFilter, LearnSetupResourceRow, LearnShellNode } from './dashboard-shell-contracts.js';
import type { LearnShellBindings } from './dashboard-shell.js';

declare const collectRows: LearnShellBindings['collectRows'];
declare const rowValue: LearnShellBindings['rowValue'];
declare const rowResources: LearnShellBindings['rowResources'];
declare const scheduledDays: LearnShellBindings['scheduledDays'];
declare const rowWeeklyPlans: LearnShellBindings['rowWeeklyPlans'];
declare const rowTileMinutes: LearnShellBindings['rowTileMinutes'];
declare const isLearnFamilyPlan: LearnShellBindings['isLearnFamilyPlan'];
declare const html: LearnShellBindings['html'];
declare const formationRhythmSetupRow: LearnShellBindings['formationRhythmSetupRow'];
declare const formationRecitationSetupRow: LearnShellBindings['formationRecitationSetupRow'];
declare const formationEnrichmentSetupRow: LearnShellBindings['formationEnrichmentSetupRow'];
declare const subjectSetupRow: LearnShellBindings['subjectSetupRow'];
declare const setupTermOptions: LearnShellBindings['setupTermOptions'];
declare const childSetupRow: LearnShellBindings['childSetupRow'];
declare const termSetupRow: LearnShellBindings['termSetupRow'];
declare const selectedTermWeeks: LearnShellBindings['selectedTermWeeks'];
declare const scheduledTermWeeks: LearnShellBindings['scheduledTermWeeks'];
declare const bookSetupRow: LearnShellBindings['bookSetupRow'];
declare const formationSetupRow: LearnShellBindings['formationSetupRow'];
declare const familyEventSetupRow: LearnShellBindings['familyEventSetupRow'];
declare const choreSetupRow: LearnShellBindings['choreSetupRow'];
declare const recipeSetupRow: LearnShellBindings['recipeSetupRow'];
declare const grocerySetupRow: LearnShellBindings['grocerySetupRow'];

function setupPayloadFromForm(form: HTMLFormElement) {
  const get = (name: string) =>
    (
      (form.elements as unknown as Record<string, { value?: string; checked?: boolean } | undefined>)[name] as
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    )?.value?.trim() || '';
  const isChecked = (name: string) =>
    (
      (form.elements as unknown as Record<string, { value?: string; checked?: boolean } | undefined>)[name] as
        HTMLInputElement | HTMLButtonElement
    )?.type === 'hidden'
      ? get(name) === 'true'
      : Boolean(
          (
            (form.elements as unknown as Record<string, { value?: string; checked?: boolean } | undefined>)[
              name
            ] as HTMLInputElement
          )?.checked
        );
  const terms = collectRows(form, 'terms', (row, index) => {
    const label = rowValue(row, 'label') as string;
    if (!label) return null;
    return {
      id: (rowValue(row, 'id') as string) || row.dataset.id || `term_${index + 1}`,
      label,
      startDate: rowValue(row, 'startDate') as string,
      endDate: rowValue(row, 'endDate') as string,
      weeksCount: Math.max(1, Math.min(24, Number((rowValue(row, 'weeksCount') as string) || 12))),
      description: (rowValue(row, 'description') as string) || '',
      paceMode: 'steady',
    };
  });
  const currentTermId = get('schoolYear.currentTermId') || terms[0]?.id || 'term_1';
  const currentTerm: LearnShellNode = terms.find((term) => term!.id === currentTermId) || terms[0] || {};
  const setupTiles: Record<string, Record<string, { title: string; detail: string; minutes: string }>> = {};
  form.querySelectorAll<HTMLElement>('.learn-setup-subsection').forEach((section) => {
    const group = section.dataset.setupSectionGroup || '';
    const panelId = section.dataset.setupSectionPanel || '';
    if (!group || !panelId) return;
    const title =
      (
        section.querySelector<HTMLInputElement>('[data-setup-section-title-input]') as
          HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      )?.value?.trim() || '';
    const detail =
      (
        section.querySelector<HTMLTextAreaElement>('[data-setup-section-detail-input]') as
          HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      )?.value?.trim() || '';
    const minutes =
      (
        section.querySelector<HTMLInputElement>('[data-setup-section-minutes-input]') as
          HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      )?.value?.trim() || '';
    if (!title && !detail && !minutes) return;
    setupTiles[group] = setupTiles[group] || {};
    setupTiles[group][panelId] = { title, detail, minutes };
  });
  return {
    household: {
      name: get('household.name'),
      parentName: get('household.parentName'),
      parentNames: get('household.parentName') ? [get('household.parentName')] : [],
      motherName: get('household.motherName'),
      motherNameDay: get('household.motherNameDay'),
      fatherName: get('household.fatherName'),
      fatherNameDay: get('household.fatherNameDay'),
      parishName: get('household.parishName'),
      parishPatronalFeastName: get('household.parishPatronalFeastName'),
      parishPatronalFeastDate: get('household.parishPatronalFeastDate'),
      homeschoolName: get('household.homeschoolName'),
      patronSaintName: get('household.patronSaintName'),
      patronSaintFeastDate: get('household.patronSaintFeastDate'),
      primaryMethod: get('household.primaryMethod'),
    },
    schoolYear: {
      label: get('schoolYear.label'),
      startDate: get('schoolYear.startDate'),
      endDate: get('schoolYear.endDate'),
      currentTermId,
    },
    term: {
      id: currentTerm.id || currentTermId,
      label: currentTerm.label || 'Term 1',
      startDate: currentTerm.startDate || '',
      endDate: currentTerm.endDate || '',
      paceMode: 'steady',
    },
    terms,
    setupTiles,
    preferences: {
      calendarType: get('preferences.calendarType'),
      groupingMode: get('preferences.groupingMode') === 'grades' ? 'grades' : 'forms',
      evaluationModel: get('preferences.evaluationModel'),
      graceModeDefault: get('preferences.graceModeDefault'),
      paceMode: 'steady',
      graceModeActive: isChecked('preferences.graceModeActive'),
    },
    children: collectRows(form, 'children', (row) => {
      const firstName = rowValue(row, 'firstName') as string;
      if (!firstName) return null;
      return {
        id: row.dataset.id || '',
        firstName,
        gradeLabel: rowValue(row, 'gradeLabel') as string,
        formLabel: rowValue(row, 'formLabel') as string,
        ageYears: rowValue(row, 'ageYears') as string,
        nameDay: rowValue(row, 'nameDay') as string,
        color: rowValue(row, 'color') as string,
      };
    }),
    streams: collectRows(form, 'streams', (row) => {
      const title = rowValue(row, 'title') as string;
      if (!title) return null;
      return {
        id: row.dataset.id || '',
        title,
        streamType: rowValue(row, 'streamType') as string,
        cadenceLabel: rowValue(row, 'cadenceLabel') as string,
        dailyMinutes: {
          mon: rowValue(row, 'monMinutes') as string,
          tue: rowValue(row, 'tueMinutes') as string,
          wed: rowValue(row, 'wedMinutes') as string,
          thu: rowValue(row, 'thuMinutes') as string,
          fri: rowValue(row, 'friMinutes') as string,
        },
      };
    }),
    subjects: collectRows(form, 'subjects', (row) => {
      const title = rowValue(row, 'title') as string;
      if (!title) return null;
      const resources = rowResources(row);
      const primaryResource: Partial<LearnSetupResourceRow> = resources[0] || {};
      return {
        id: row.dataset.id || '',
        title,
        subjectType: rowValue(row, 'subjectType') as string,
        planningMode: (rowValue(row, 'planningMode') as string) || primaryResource.planningMode || 'forms',
        instructionMode: rowValue(row, 'instructionMode') as string,
        schedulingMode: rowValue(row, 'schedulingMode') as string,
        scheduledDays: scheduledDays(
          rowValue(row, 'scheduledDays') as string,
          rowValue(row, 'weeklyFrequency') as string
        ),
        scheduledWeeks: selectedTermWeeks(
          (rowValue(row, 'scheduledWeeks') as string) || (primaryResource.scheduledWeeks || []).join(',')
        ),
        weeklyFrequency: rowValue(row, 'weeklyFrequency') as string,
        weeklyPlans: rowWeeklyPlans(row).some(Boolean) ? rowWeeklyPlans(row) : primaryResource.weeklyPlans || [],
        weeklyTarget: rowValue(row, 'weeklyTarget') as string,
        termTarget: rowValue(row, 'termTarget') as string,
        activeStartDate: rowValue(row, 'activeStartDate') as string,
        activeEndDate: rowValue(row, 'activeEndDate') as string,
        priorityLevel: rowValue(row, 'priorityLevel') as string,
        missedLessonBehavior: rowValue(row, 'missedLessonBehavior') as string,
        cadenceLabel: rowValue(row, 'weeklyFrequency') as string,
        formLabel: (rowValue(row, 'formLabel') as string) || primaryResource.formLabel || '',
        formLabels: ((rowValue(row, 'formLabels') as string) || (primaryResource.formLabels || []).join(','))
          .split(',')
          .map((v: string) => v.trim())
          .filter(Boolean as unknown as LearnTruthyFilter),
        gradeLabel: (rowValue(row, 'gradeLabel') as string) || primaryResource.gradeLabel || '',
        resource: resources[0]?.title || (rowValue(row, 'resource') as string),
        resources,
        resourceType: rowValue(row, 'resourceType') as string,
        minutes: rowTileMinutes(row),
        childId: rowValue(row, 'childId') as string,
        childIds: ((rowValue(row, 'childIds') as string) || (primaryResource.childIds || []).join(','))
          .split(',')
          .map((v: string) => v.trim())
          .filter(Boolean as unknown as LearnTruthyFilter),
        progressionType: rowValue(row, 'progressionType') as string,
        startNumber: rowValue(row, 'startNumber') as string,
        currentNumber: rowValue(row, 'currentNumber') as string,
        endNumber: rowValue(row, 'endNumber') as string,
        credits: rowValue(row, 'credits') as string,
        finalGradeOverride: rowValue(row, 'finalGradeOverride') as string,
        color: rowValue(row, 'color') as string,
        termId: (rowValue(row, 'termId') as string) || currentTermId,
        gracePriority: rowValue(row, 'gracePriority') as string,
        graceNote: rowValue(row, 'graceNote') as string,
      };
    }),
    books: collectRows(form, 'books', (row) => {
      const title = rowValue(row, 'title') as string;
      if (!title) return null;
      return {
        id: row.dataset.id || '',
        title,
        author: rowValue(row, 'author') as string,
        category: rowValue(row, 'category') as string,
        planningMode: rowValue(row, 'planningMode') as string,
        scheduledWeeks: scheduledTermWeeks(rowValue(row, 'scheduledWeeks') as string),
        weeklyFrequency: rowValue(row, 'weeklyFrequency') as string,
        minutes: rowValue(row, 'minutes') as string,
        formLabel: rowValue(row, 'formLabel') as string,
        audienceLabel: rowValue(row, 'audienceLabel') as string,
        startChapter: rowValue(row, 'startChapter') as string,
        currentChapter: rowValue(row, 'currentChapter') as string,
        endChapter: rowValue(row, 'endChapter') as string,
        color: rowValue(row, 'color') as string,
        termId: (rowValue(row, 'termId') as string) || currentTermId,
        graceNote: rowValue(row, 'graceNote') as string,
      };
    }),
    formation: {
      churchRhythms: collectRows(form, 'formationRhythms', (row) => {
        const title = rowValue(row, 'title') as string;
        if (!title) return null;
        return {
          id: row.dataset.id || '',
          title,
          note: rowValue(row, 'note') as string,
          weeklyFrequency: rowValue(row, 'weeklyFrequency') as string,
          weeklyTarget: rowValue(row, 'weeklyTarget') as string,
          termTarget: rowValue(row, 'termTarget') as string,
          activeStartDate: rowValue(row, 'activeStartDate') as string,
          activeEndDate: rowValue(row, 'activeEndDate') as string,
          priorityLevel: rowValue(row, 'priorityLevel') as string,
          missedLessonBehavior: rowValue(row, 'missedLessonBehavior') as string,
          cadenceLabel: rowValue(row, 'weeklyFrequency') as string,
          minutes: rowValue(row, 'minutes') as string,
        };
      }),
      catechesis: {
        title: get('formation.catechesis.title'),
        currentLesson: get('formation.catechesis.currentLesson'),
        planningMode: get('formation.catechesis.planningMode'),
        weeklyFrequency: get('formation.catechesis.weeklyFrequency'),
        minutes: get('formation.catechesis.minutes'),
        lessonNumber: get('formation.catechesis.lessonNumber'),
        totalLessons: get('formation.catechesis.totalLessons'),
        doctrinalTopic: get('formation.catechesis.doctrinalTopic'),
        source: get('formation.catechesis.source'),
      },
      recitationTracks: collectRows(form, 'formationRecitation', (row) => {
        const title = rowValue(row, 'title') as string;
        if (!title) return null;
        return {
          id: row.dataset.id || '',
          title,
          sourceKind: rowValue(row, 'sourceKind') as string,
          planningMode: rowValue(row, 'planningMode') as string,
          formLabel: rowValue(row, 'formLabel') as string,
          formLabels: (rowValue(row, 'formLabels') as string)
            .split(',')
            .map((value: string) => value.trim())
            .filter(Boolean as unknown as LearnTruthyFilter),
          gradeLabel: rowValue(row, 'gradeLabel') as string,
          scheduledWeeks: scheduledTermWeeks(rowValue(row, 'scheduledWeeks') as string),
          weeklyFrequency: rowValue(row, 'weeklyFrequency') as string,
          minutes: rowValue(row, 'minutes') as string,
        };
      }),
      hymnStudies: collectRows(form, 'formationHymns', (row) => {
        const title = rowValue(row, 'title') as string;
        if (!title) return null;
        return {
          id: row.dataset.id || '',
          title,
          tone: rowValue(row, 'tone') as string,
          source: rowValue(row, 'source') as string,
          planningMode: rowValue(row, 'planningMode') as string,
          weeklyFrequency: rowValue(row, 'weeklyFrequency') as string,
          minutes: rowValue(row, 'minutes') as string,
          status: rowValue(row, 'status') as string,
        };
      }),
      enrichmentBlocks: collectRows(form, 'formationEnrichment', (row) => {
        const resources = rowResources(row);
        const primaryResource = resources[0] || {};
        const title =
          (rowValue(row, 'title') as string) || primaryResource.title || (rowValue(row, 'blockType') as string);
        if (!title) return null;
        return {
          id: row.dataset.id || '',
          blockType: rowValue(row, 'blockType') as string,
          title,
          // Only send a top-level "resource" name when a real resource exists.
          // Falling back to the block title/type here used to manufacture a
          // phantom resource on save whenever the resource list was emptied —
          // the server would reconstruct one from this field, making deletes
          // appear to silently "undo" on refresh.
          resource: primaryResource.title || '',
          resources,
          resourceType: rowValue(row, 'resourceType') as string,
          planningMode: (rowValue(row, 'planningMode') as string) || primaryResource.planningMode || 'forms',
          instructionMode: rowValue(row, 'instructionMode') as string,
          schedulingMode: rowValue(row, 'schedulingMode') as string,
          scheduledDays: scheduledDays(
            rowValue(row, 'scheduledDays') as string,
            rowValue(row, 'weeklyFrequency') as string
          ),
          scheduledWeeks: selectedTermWeeks(
            (rowValue(row, 'scheduledWeeks') as string) || (primaryResource.scheduledWeeks || []).join(',')
          ),
          weeklyFrequency: rowValue(row, 'weeklyFrequency') as string,
          weeklyPlans: rowWeeklyPlans(row).some(Boolean) ? rowWeeklyPlans(row) : primaryResource.weeklyPlans || [],
          cadenceLabel: rowValue(row, 'weeklyFrequency') as string,
          formLabel: (rowValue(row, 'formLabel') as string) || primaryResource.formLabel || '',
          formLabels: ((rowValue(row, 'formLabels') as string) || (primaryResource.formLabels || []).join(','))
            .split(',')
            .map((value: string) => value.trim())
            .filter(Boolean as unknown as LearnTruthyFilter),
          gradeLabel: (rowValue(row, 'gradeLabel') as string) || primaryResource.gradeLabel || '',
          childId: rowValue(row, 'childId') as string,
          childIds: ((rowValue(row, 'childIds') as string) || (primaryResource.childIds || []).join(','))
            .split(',')
            .map((v: string) => v.trim())
            .filter(Boolean as unknown as LearnTruthyFilter),
          startNumber: rowValue(row, 'startNumber') as string,
          currentNumber: rowValue(row, 'currentNumber') as string,
          endNumber: rowValue(row, 'endNumber') as string,
          minutesPlanned: rowTileMinutes(row),
          credits: rowValue(row, 'credits') as string,
          finalGradeOverride: rowValue(row, 'finalGradeOverride') as string,
          color: rowValue(row, 'color') as string,
          termId: (rowValue(row, 'termId') as string) || currentTermId,
          gracePriority: rowValue(row, 'gracePriority') as string,
          graceNote: rowValue(row, 'graceNote') as string,
        };
      }),
      feasts: collectRows(form, 'formationFeasts', (row) => {
        const title = rowValue(row, 'title') as string;
        if (!title) return null;
        return {
          id: row.dataset.id || '',
          civilDate: rowValue(row, 'civilDate') as string,
          title,
          fastingRule: rowValue(row, 'fastingRule') as string,
          planningMode: rowValue(row, 'planningMode') as string,
          minutes: rowValue(row, 'minutes') as string,
          note: rowValue(row, 'note') as string,
        };
      }),
    },
    formationMaterials: collectRows(form, 'formationMaterials', (row) => {
      const title = rowValue(row, 'title') as string;
      if (!title) return null;
      return {
        id: row.dataset.id || '',
        title,
        materialType: rowValue(row, 'materialType') as string,
        source: rowValue(row, 'source') as string,
        planningMode: rowValue(row, 'planningMode') as string,
        scheduledWeeks: scheduledTermWeeks(rowValue(row, 'scheduledWeeks') as string),
        weeklyFrequency: rowValue(row, 'weeklyFrequency') as string,
        cadenceLabel: rowValue(row, 'weeklyFrequency') as string,
        minutes: rowValue(row, 'minutes') as string,
        termId: (rowValue(row, 'termId') as string) || currentTermId,
        color: rowValue(row, 'color') as string,
      };
    }),
    familyPlanning: {
      fastingPreference: get('familyPlanning.fastingPreference') || 'guidance',
      weekStart: get('familyPlanning.weekStart'),
      events: collectRows(form, 'familyEvents', (row) => {
        const title = rowValue(row, 'title') as string;
        if (!title || !(rowValue(row, 'date') as string)) return null;
        return {
          id: row.dataset.id || '',
          title,
          eventType: rowValue(row, 'eventType') as string,
          date: rowValue(row, 'date') as string,
          startTime: rowValue(row, 'startTime') as string,
          recurrence: (rowValue(row, 'recurrence') as string) || 'none',
          location: rowValue(row, 'location') as string,
          notes: rowValue(row, 'notes') as string,
        };
      }),
      meals: collectRows(form, 'meals', (row) => ({
        id: row.dataset.id || '',
        date: rowValue(row, 'date') as string,
        breakfast: rowValue(row, 'breakfast') as string,
        lunch: rowValue(row, 'lunch') as string,
        dinner: rowValue(row, 'dinner') as string,
      })).filter((meal) => meal.date),
      recipes: collectRows(form, 'recipes', (row) => {
        const title = rowValue(row, 'title') as string;
        if (!title) return null;
        return {
          id: row.dataset.id || '',
          title,
          fastingType: rowValue(row, 'fastingType') as string,
          category: rowValue(row, 'category') as string,
          sourceUrl: rowValue(row, 'sourceUrl') as string,
          ingredients: rowValue(row, 'ingredients') as string,
          instructions: rowValue(row, 'instructions') as string,
        };
      }),
      groceryItems: collectRows(form, 'groceryItems', (row) => {
        const name = rowValue(row, 'name') as string;
        if (!name) return null;
        return {
          id: row.dataset.id || '',
          name,
          quantity: rowValue(row, 'quantity') as string,
          category: rowValue(row, 'category') as string,
          checked: Boolean((row.querySelector<HTMLElement>('[name="checked"]') as HTMLInputElement)?.checked),
          pantry: Boolean((row.querySelector<HTMLElement>('[name="pantry"]') as HTMLInputElement)?.checked),
        };
      }),
    },
    coOp: {
      enabled: false,
      status: 'coming-soon',
    },
  };
}

function currentSetupChildren(form: HTMLFormElement) {
  return collectRows(form, 'children', (row, index) => ({
    id: row.dataset.id || `new-child-${index}`,
    name: (rowValue(row, 'firstName') as string) || `Child ${index + 1}`,
    gradeLabel: rowValue(row, 'gradeLabel') as string,
    formLabel: rowValue(row, 'formLabel') as string,
  }));
}

function familyPlanningPayloadFromForm(form: HTMLFormElement) {
  const get = (name: string) =>
    (
      (form.elements as unknown as Record<string, { value?: string; checked?: boolean } | undefined>)[name] as
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    )?.value?.trim() || '';
  return {
    household: {
      motherName: get('household.motherName'),
      motherNameDay: get('household.motherNameDay'),
      fatherName: get('household.fatherName'),
      fatherNameDay: get('household.fatherNameDay'),
      parishPatronalFeastName: get('household.parishPatronalFeastName'),
      parishPatronalFeastDate: get('household.parishPatronalFeastDate'),
    },
    childNameDays: [...form.querySelectorAll<HTMLElement>('[data-family-child-id]')].map((row) => ({
      childId: row.dataset.familyChildId || '',
      nameDay:
        (
          row.querySelector<HTMLElement>('[name="childNameDay"]') as
            HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        )?.value || '',
    })),
    familyPlanning: {
      fastingPreference: get('familyPlanning.fastingPreference') || 'guidance',
      weekStart: get('familyPlanning.weekStart'),
      events: collectRows(form, 'familyEvents', (row) => {
        const title = rowValue(row, 'title') as string;
        if (!title || !(rowValue(row, 'date') as string)) return null;
        return {
          id: row.dataset.id || '',
          title,
          eventType: rowValue(row, 'eventType') as string,
          date: rowValue(row, 'date') as string,
          startTime: rowValue(row, 'startTime') as string,
          recurrence: (rowValue(row, 'recurrence') as string) || 'none',
          location: rowValue(row, 'location') as string,
          notes: rowValue(row, 'notes') as string,
        };
      }),
      meals: collectRows(form, 'meals', (row) => ({
        id: row.dataset.id || '',
        date: rowValue(row, 'date') as string,
        breakfast: rowValue(row, 'breakfast') as string,
        lunch: rowValue(row, 'lunch') as string,
        dinner: rowValue(row, 'dinner') as string,
      })).filter((meal) => meal.date),
      recipes: collectRows(form, 'recipes', (row) => {
        const title = rowValue(row, 'title') as string;
        return title
          ? {
              id: row.dataset.id || '',
              title,
              fastingType: rowValue(row, 'fastingType') as string,
              category: rowValue(row, 'category') as string,
              sourceUrl: rowValue(row, 'sourceUrl') as string,
              ingredients: rowValue(row, 'ingredients') as string,
              instructions: rowValue(row, 'instructions') as string,
            }
          : null;
      }),
      groceryItems: collectRows(form, 'groceryItems', (row) => {
        const name = rowValue(row, 'name') as string;
        return name
          ? {
              id: row.dataset.id || '',
              name,
              quantity: rowValue(row, 'quantity') as string,
              category: rowValue(row, 'category') as string,
              checked: Boolean((row.querySelector<HTMLElement>('[name="checked"]') as HTMLInputElement)?.checked),
              pantry: Boolean((row.querySelector<HTMLElement>('[name="pantry"]') as HTMLInputElement)?.checked),
            }
          : null;
      }),
      chores: collectRows(form, 'chores', (row) => {
        const title = rowValue(row, 'title') as string;
        const assignee = rowValue(row, 'assignee') as string;
        return title || assignee
          ? {
              id: row.dataset.id || '',
              title,
              assignee,
              cadence: (rowValue(row, 'cadence') as string) || 'daily',
              day: rowValue(row, 'day') as string,
              dayOfMonth: rowValue(row, 'dayOfMonth') as string,
              quarterMonth: rowValue(row, 'quarterMonth') as string,
              assignedDate: rowValue(row, 'assignedDate') as string,
              timeOfDay: rowValue(row, 'timeOfDay') as string,
              notes: rowValue(row, 'notes') as string,
              completed: Boolean((row.querySelector<HTMLElement>('[name="completed"]') as HTMLInputElement)?.checked),
            }
          : null;
      }),
    },
  };
}

function currentSetupTerms(form: HTMLFormElement) {
  return collectRows(form, 'terms', (row, index) => ({
    id: (rowValue(row, 'id') as string) || row.dataset.id || `term_${index + 1}`,
    label: (rowValue(row, 'label') as string) || `Term ${index + 1}`,
  }));
}

function setupChildCount(form: HTMLFormElement) {
  return form.querySelectorAll<HTMLElement>('[data-setup-row="children"]').length;
}

function syncSetupChildLimit(form: HTMLFormElement) {
  const button = form.querySelector<HTMLButtonElement>('[data-setup-add-row="children"]');
  if (!button) return;
  const freeLimitReached = !isLearnFamilyPlan() && setupChildCount(form) >= 2;
  button.dataset.upgradeRequired = freeLimitReached ? 'true' : 'false';
  button.textContent = freeLimitReached ? 'Upgrade to add another child' : 'Add Child';
  button.style.background = freeLimitReached ? 'var(--navy)' : 'var(--paper2)';
  button.style.color = freeLimitReached ? '#fff' : 'var(--ink)';
  button.style.borderColor = freeLimitReached ? 'var(--gold)' : 'var(--line)';
}

function setupBlankRow(type: string, form: HTMLFormElement, preset: LearnShellNode = {}) {
  const terms = currentSetupTerms(form);
  const currentTermId =
    (form.elements as unknown as Record<string, { value?: string; checked?: boolean } | undefined>)[
      'schoolYear.currentTermId'
    ]?.value ||
    terms[0]?.id ||
    'term_1';
  const groupingMode =
    (form.elements as unknown as Record<string, { value?: string; checked?: boolean } | undefined>)[
      'preferences.groupingMode'
    ]?.value === 'grades'
      ? 'grades'
      : 'forms';
  const familyPlanningFromForm = () => ({
    household: {
      motherName:
        (form.elements as unknown as Record<string, { value?: string; checked?: boolean } | undefined>)[
          'household.motherName'
        ]?.value || '',
      fatherName:
        (form.elements as unknown as Record<string, { value?: string; checked?: boolean } | undefined>)[
          'household.fatherName'
        ]?.value || '',
    },
    children: [...form.querySelectorAll<HTMLElement>('[data-family-child-id]')]
      .map((row) => ({ name: row.dataset.familyChildName || '' }))
      .filter((child) => child.name),
  });
  if (type === 'children') return childSetupRow({}, groupingMode);
  if (type === 'terms') return termSetupRow({}, terms.length);
  if (type === 'subjects')
    return subjectSetupRow(
      preset,
      currentSetupChildren(form),
      terms,
      currentTermId,
      groupingMode,
      preset.minutes || ''
    );
  if (type === 'books') return bookSetupRow({}, terms, currentTermId);
  if (type === 'formationMaterials') return formationSetupRow({}, terms, currentTermId);
  if (type === 'formationRhythms') return formationRhythmSetupRow({});
  if (type === 'formationRecitation') return formationRecitationSetupRow({});
  if (type === 'formationEnrichment')
    return formationEnrichmentSetupRow(
      preset,
      currentSetupChildren(form),
      terms,
      currentTermId,
      groupingMode,
      preset.minutesPlanned || ''
    );
  if (type === 'familyEvents') return familyEventSetupRow({ date: preset.date || '' });
  if (type === 'recipes') return recipeSetupRow({});
  if (type === 'groceryItems') return grocerySetupRow({});
  if (type === 'chores') return choreSetupRow({}, 0, familyPlanningFromForm());
  return '';
}

function setSetupSectionOpen(form: HTMLFormElement, group: string, panelId: string, shouldOpen: boolean) {
  form
    .querySelectorAll<HTMLElement>(`[data-setup-section-group="${group}"][data-setup-section-toggle]`)
    .forEach((button) => {
      const isTarget = button.dataset.setupSectionPanel === panelId;
      const open = shouldOpen && isTarget;
      button.setAttribute('aria-expanded', open ? 'true' : 'false');
      button.classList.toggle('is-open', open);
      const action = button.querySelector<HTMLElement>('em');
      if (action) action.textContent = open ? 'Collapse' : 'Open';
    });
  form
    .querySelectorAll<HTMLElement>(`[data-setup-section-group="${group}"].learn-setup-subsection`)
    .forEach((section) => {
      const open = shouldOpen && section.dataset.setupSectionPanel === panelId;
      section.hidden = !open;
    });
}

function syncSetupTermSelects(form: HTMLFormElement) {
  const terms = currentSetupTerms(form);
  if (!terms.length) return;
  form
    .querySelectorAll<HTMLSelectElement>('select[name="schoolYear.currentTermId"], select[name="termId"]')
    .forEach((select) => {
      const currentValue = select.value;
      select.innerHTML = setupTermOptions(terms, terms[0])
        .map(
          (option) =>
            `<option value="${html(option.value)}" ${option.value === currentValue ? 'selected' : ''}>${html(option.label)}</option>`
        )
        .join('');
      if (![...select.options].some((option) => option.value === currentValue)) select.value = terms[0].id;
    });
}
export type LearnShell2Part10 = {
  setupPayloadFromForm: typeof setupPayloadFromForm;
  currentSetupChildren: typeof currentSetupChildren;
  familyPlanningPayloadFromForm: typeof familyPlanningPayloadFromForm;
  currentSetupTerms: typeof currentSetupTerms;
  setupChildCount: typeof setupChildCount;
  syncSetupChildLimit: typeof syncSetupChildLimit;
  setupBlankRow: typeof setupBlankRow;
  setSetupSectionOpen: typeof setSetupSectionOpen;
  syncSetupTermSelects: typeof syncSetupTermSelects;
};
