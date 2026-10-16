import type {
  SetupInputNode,
  LearnRuntimeSeed,
  LearnRuntimeBook,
  SetupTruthyFilter,
  LearnSetupSnapshot,
} from './setup-persistence-composition-contracts.js';

import '../lib/core.js';

import '../handlers/parish.js';

import './academic-records.js';

import './billing.js';

import { getLearnSeedSnapshot } from './demo-data.js';

import './planner-overrides.js';

import {
  clone,
  text,
  activeTermWeek,
  scheduledThisTermWeek,
  planArraysForItem,
  gracePriorityValue,
  list,
  rangeProgressPercent,
  distributeRangeSegments,
  weeklyPlanArrays,
  currentWeekWindow,
  childrenForAssignment,
  bookBelongsToHouseholdStream,
  resourceBookLike,
} from './setup-persistence-shared.js';

export function applySetupSnapshotToSeed(
  seed: LearnRuntimeSeed = getLearnSeedSnapshot() as LearnRuntimeSeed,
  setupSnapshot: LearnSetupSnapshot | null = null,
  { weekDate = '' }: { termId?: string; weekDate?: string } = {}
) {
  if (!setupSnapshot) return seed;
  const next = clone(seed);
  next.familyPlanning = clone(
    setupSnapshot.familyPlanning || {
      nameDays: [],
      events: [],
      meals: [],
      recipes: [],
      groceryItems: [],
      fastingPreference: 'guidance',
    }
  );
  const currentTermId =
    setupSnapshot.term?.id || setupSnapshot.schoolYear?.currentTermId || setupSnapshot.terms?.[0]?.id || '';
  const forCurrentTerm = (item: { termId?: string } = {}) =>
    !item.termId || !currentTermId || item.termId === currentTermId;
  const currentSubjects = list(setupSnapshot.subjects).filter(forCurrentTerm);
  const literatureBooks = list(setupSnapshot.books).filter(forCurrentTerm);
  const currentFormationMaterials = list(setupSnapshot.formationMaterials).filter(forCurrentTerm);
  const formation = setupSnapshot.formation || {};
  const isBookResource = (item: { resource?: unknown; resourceType?: string } = {}) =>
    item.resource && item.resourceType === 'book';
  const enrichmentBooks = list(formation.enrichmentBlocks)
    .filter(forCurrentTerm)
    .filter(isBookResource)
    .map((block, index) =>
      resourceBookLike({
        id: block.id || `enrichment_book_${index + 1}`,
        title: block.resource,
        category: block.title || block.blockType || block.type || 'Enrichment',
        termId: block.termId || currentTermId,
        formLabel: block.formLabel || '',
        audienceLabel: block.planningMode === 'forms' ? 'Form Enrichment' : 'Household Enrichment',
        planningMode: block.planningMode || 'family',
        weeklyFrequency: block.weeklyFrequency || block.cadenceLabel || '1x',
        minutes: block.minutesPlanned || block.minutes || '',
        color: block.color || '',
        sourceKind: 'enrichment',
      })
    )
    .filter(Boolean as unknown as SetupTruthyFilter);
  const subjectBooks = currentSubjects
    .flatMap((subject, subjectIndex) => {
      if (subject.resourceType !== 'book') return [];
      const subjectResources = list(subject.resources).length
        ? list(subject.resources)
        : subject.resource
          ? [{ title: subject.resource, scheduledWeeks: subject.scheduledWeeks }]
          : [];
      return subjectResources.map((resource, resourceIndex) => {
        const title =
          typeof resource === 'string' ? resource : resource.title || (resource as { resource?: string }).resource;
        const assignment = typeof resource === 'string' ? subject : { ...subject, ...resource };
        return resourceBookLike({
          id: `subject_resource_${subject.id || subjectIndex + 1}_${resourceIndex + 1}`,
          title,
          category: subject.title || subject.subjectType || 'Form Subject',
          termId: subject.termId || currentTermId,
          formLabel: assignment.formLabel || '',
          audienceLabel: list(assignment.childIds).length || assignment.childId ? 'Child Resource' : 'Form Resource',
          planningMode: assignment.planningMode || 'forms',
          weeklyFrequency: subject.weeklyFrequency || '1x',
          minutes: subject.minutes || '',
          color: subject.color || '',
          childIds: list(assignment.childIds),
          gradeLabel: assignment.gradeLabel || '',
          formLabels: list(assignment.formLabels),
          scheduledWeeks: list(assignment.scheduledWeeks).length ? assignment.scheduledWeeks : subject.scheduledWeeks,
          weeklyPlans: list(assignment.weeklyPlans).length ? assignment.weeklyPlans : subject.weeklyPlans,
          sourceKind: 'form-subject',
        });
      });
    })
    .filter(Boolean as unknown as SetupTruthyFilter);
  const materialBooks = currentFormationMaterials
    .map((material, index) =>
      resourceBookLike({
        id: `formation_material_${material.id || index + 1}`,
        title: material.source || material.title,
        author: material.source && material.title ? material.title : '',
        category: material.materialType || 'Formation Material',
        termId: material.termId || currentTermId,
        formLabel: material.formLabel || '',
        audienceLabel: material.planningMode === 'forms' ? 'Form Formation' : 'Household Formation',
        planningMode: material.planningMode || 'family',
        weeklyFrequency: material.weeklyFrequency || material.cadenceLabel || '1x',
        minutes: material.minutes || '',
        color: material.color || '',
        sourceKind: 'formation-material',
      })
    )
    .filter(Boolean as unknown as SetupTruthyFilter);
  const currentBooks: LearnRuntimeBook[] = [...literatureBooks, ...enrichmentBooks, ...subjectBooks, ...materialBooks];
  next.household = { ...next.household, ...setupSnapshot.household };
  next.children = list(setupSnapshot.children);
  next.schoolYear = { ...next.schoolYear, ...setupSnapshot.schoolYear };
  next.term = { ...next.term, ...setupSnapshot.term };
  if (setupSnapshot.historyCycle) {
    next.cycleFramework = {
      ...next.cycleFramework,
      id: setupSnapshot.historyCycle.framework,
      frameworkType: 'enrichment',
      title: setupSnapshot.historyCycle.frameworkTitle,
      summary: setupSnapshot.historyCycle.frameworkSummary,
    };
    next.cycleYear = {
      ...next.cycleYear,
      id: setupSnapshot.historyCycle.cycleYear,
      cycleFrameworkId: setupSnapshot.historyCycle.framework,
      yearNumber: setupSnapshot.historyCycle.yearNumber,
      title: setupSnapshot.historyCycle.yearTitle,
    };
    next.cycleTopics = list(setupSnapshot.historyCycle.enrichmentTopics).map((topic, index) => ({
      id: `cycle_topic_${setupSnapshot.historyCycle!.cycleYear}_${index + 1}`,
      cycleYearId: setupSnapshot.historyCycle!.cycleYear,
      subjectType: index === 0 ? 'history' : index === 1 ? 'church-history' : 'enrichment',
      title: topic,
      seasonLabel: setupSnapshot.historyCycle!.rotation === 'second' ? 'Second rotation' : 'First rotation',
    }));
  }
  next.graceModeRule = {
    ...next.graceModeRule,
    mode: setupSnapshot.preferences?.graceModeActive
      ? setupSnapshot.preferences?.graceModeDefault || next.graceModeRule?.mode || 'light'
      : 'full',
  };
  next.householdStreams = list(setupSnapshot.streams);
  next.books = currentBooks;
  next.libraryBooks = currentBooks.map((book, index) => ({
    ...book,
    ages: '',
    assignment: 'Setup',
    progressPercent: rangeProgressPercent(
      book.startChapter || 1,
      book.currentChapter || book.startChapter || 1,
      book.endChapter || book.totalChapters || 0
    ),
    orthodox: false,
    sortOrder: index + 1,
  }));
  const householdBooks = currentBooks.filter(bookBelongsToHouseholdStream);
  const childBooks = currentBooks.filter((book) => !bookBelongsToHouseholdStream(book));
  next.currentReadAlouds = (householdBooks.length ? householdBooks : currentBooks).slice(0, 3).map((book) => ({
    ...book,
    subtitle: book.category,
    progressPercent: rangeProgressPercent(
      book.startChapter || 1,
      book.currentChapter || book.startChapter || 1,
      book.endChapter || book.totalChapters || 0
    ),
    assignedTerm: setupSnapshot.term?.label || next.term.label,
  }));
  next.bookAssignments = currentBooks.flatMap((book) => {
    const assignedChildren = childrenForAssignment(book, next.children);
    const assignmentType = bookBelongsToHouseholdStream(book)
      ? 'household-read-aloud'
      : book.formLabel
        ? 'form-reading'
        : 'independent-reading';
    return (assignedChildren.length ? assignedChildren : [null]).map((child) => ({
      id: `assignment_${book.id}_${child?.id || 'household'}`,
      bookId: book.id,
      childId: child?.id || null,
      householdId: setupSnapshot.identity?.householdId || next.household.id,
      formLabel: book.formLabel,
      assignmentType,
      progressPercent: rangeProgressPercent(
        book.startChapter || 1,
        book.currentChapter || book.startChapter || 1,
        book.endChapter || book.totalChapters || 0
      ),
    }));
  });
  next.childTracks = currentSubjects
    .flatMap((subject, index) => {
      const resourceAssignments = list(subject.resources).length
        ? list(subject.resources).map((resource) => ({ ...subject, ...resource, title: subject.title }))
        : [subject];
      return resourceAssignments.flatMap((assignment, assignmentIndex) => {
        const assignedChildren = childrenForAssignment(assignment, next.children);
        return assignedChildren.map((child) => ({
          id: `${subject.id}_${assignmentIndex + 1}_${child.id || index}`,
          childId: child.id,
          subjectType: subject.subjectType,
          title: subject.title,
          formLabel: (assignment.formLabel || subject.formLabel) as string | undefined,
        }));
      });
    })
    .concat(
      childBooks.flatMap((book, index) => {
        const assignedChildren = childrenForAssignment(book, next.children);
        return assignedChildren.map((child) => ({
          id: `${book.id}_${child.id || index}`,
          childId: child.id,
          subjectType: 'reading',
          title: book.title,
          formLabel: book.formLabel,
        }));
      })
    );
  next.curriculumPackage = {
    ...next.curriculumPackage,
    householdId: setupSnapshot.identity?.householdId || next.household.id,
    title: `${setupSnapshot.household?.name || 'Household'} Curriculum`,
  };
  next.curriculumPackages = [next.curriculumPackage];
  next.curriculumSubjects = currentSubjects.map((subject, index) => ({
    id: subject.id,
    curriculumPackageId: next.curriculumPackage.id,
    subjectType: subject.subjectType,
    title: subject.title,
    sortOrder: index + 1,
  }));
  if (list(formation.churchRhythms).length) {
    next.dashboardDaily = Object.fromEntries(
      Object.entries(next.dashboardDaily || {}).map(([date, day]) => [
        date,
        { ...day, churchRhythms: list(formation.churchRhythms).map((rhythm) => ({ ...rhythm })) },
      ])
    );
  }
  if (formation.catechesis?.title) next.catechesisCycles = [formation.catechesis];
  else if (setupSnapshot) next.catechesisCycles = [];
  if (list(formation.recitationTracks).length) next.recitationTracks = list(formation.recitationTracks);
  else if (setupSnapshot) next.recitationTracks = [];
  if (list(formation.hymnStudies).length) next.hymnStudies = list(formation.hymnStudies);
  else if (setupSnapshot) next.hymnStudies = [];
  if (list(formation.enrichmentBlocks).length) next.enrichmentBlocks = list(formation.enrichmentBlocks);
  else if (setupSnapshot) next.enrichmentBlocks = [];
  // Always clear seed fixture logs for real users — they start empty and accumulate from their own data.
  next.narrationLogs = [];
  next.natureJournalEntries = [];
  const structuredFormationMaterials = [
    ...(formation.catechesis?.title
      ? [
          {
            id: formation.catechesis.id || 'formation_catechesis',
            title: formation.catechesis.title,
            materialType: 'Catechesis',
            source: formation.catechesis.source || '',
            cadenceLabel: 'Weekly',
            color: '',
          },
        ]
      : []),
    ...list(formation.hymnStudies).map((hymn) => ({
      id: hymn.id,
      title: hymn.title,
      materialType: 'Hymn Study',
      source: hymn.source,
      cadenceLabel: 'Weekly',
      color: '',
    })),
    ...list(formation.enrichmentBlocks).map((block) => ({
      id: block.id,
      title: block.title,
      materialType: block.blockType,
      source: '',
      cadenceLabel: block.cadenceLabel,
      color: block.color,
    })),
  ];
  const formationMaterialsForPlanning = currentFormationMaterials.length
    ? currentFormationMaterials
    : structuredFormationMaterials;
  next.curriculumResources = [
    ...currentSubjects.flatMap((subject, subjectIndex) => {
      const subjectResources = list(subject.resources).length
        ? list(subject.resources)
        : subject.resource
          ? [{ title: subject.resource, scheduledWeeks: subject.scheduledWeeks }]
          : [];
      return subjectResources
        .map((resource, resourceIndex) => {
          const title =
            typeof resource === 'string' ? resource : resource.title || (resource as { resource?: string }).resource;
          if (!title) return null;
          return {
            id: `resource_${subject.id || subjectIndex + 1}_${resourceIndex + 1}`,
            curriculumPackageId: next.curriculumPackage.id,
            curriculumSubjectId: subject.id,
            title,
            author: '',
            resourceType: subject.resourceType || subject.subjectType,
            sourceKind: 'household',
            sortOrder: subjectIndex * 10 + resourceIndex + 1,
          };
        })
        .filter(Boolean as unknown as SetupTruthyFilter);
    }),
    ...formationMaterialsForPlanning.map((material, index) => ({
      id: material.id,
      curriculumPackageId: next.curriculumPackage.id,
      curriculumSubjectId: null,
      title: material.title,
      author: material.source,
      resourceType: material.materialType,
      sourceKind: 'formation',
      sortOrder: index + 100,
    })),
  ];
  const weekReference =
    weekDate && /^\d{4}-\d{2}-\d{2}$/.test(weekDate) ? new Date(`${weekDate}T12:00:00.000Z`) : new Date();
  const currentTermWeek = activeTermWeek(setupSnapshot.term || next.term || {}, weekReference);
  const plannerWeekWindow = currentWeekWindow(weekReference);
  const currentWeekPlan = (item: SetupInputNode = {}) =>
    text(list(item.weeklyPlans)[Math.max(0, currentTermWeek - 1)], '');
  next.plannerWeek = {
    termWeekNumber: currentTermWeek,
    ...next.plannerWeek,
    ...plannerWeekWindow,
    seasonLabel: setupSnapshot.term?.label || next.plannerWeek.seasonLabel,
    householdRows: [
      ...list(setupSnapshot.streams).map((stream, index) => ({
        id: `week_${stream.id}`,
        streamId: stream.id,
        title: stream.title,
        detail: stream.cadenceLabel,
        priority: index + 1,
        minutes: [
          0,
          stream.dailyMinutes?.mon || 0,
          stream.dailyMinutes?.tue || 0,
          stream.dailyMinutes?.wed || 0,
          stream.dailyMinutes?.thu || 0,
          stream.dailyMinutes?.fri || 0,
          0,
        ],
        statuses: ['empty', 'planned', 'planned', 'planned', 'planned', 'planned', 'empty'],
      })),
      ...householdBooks.map((book, index) => ({
        id: `week_household_book_${book.id}`,
        streamId: book.id,
        title: book.audienceLabel === 'Morning Basket' ? book.title : `Read-Aloud: ${book.title}`,
        detail: `${book.author || book.category}${book.endChapter ? ` • chapters ${book.startChapter || 1}-${book.endChapter}` : ''}${book.weeklyFrequency ? ` • ${book.weeklyFrequency}` : ''}`,
        priority: 50 + index,
        gracePriority: book.gracePriority || 'reduce first',
        graceNote: book.graceNote || 'Reading moved into the reserve basket.',
        ...weeklyPlanArrays(book.weeklyFrequency, book.minutes || 20, scheduledThisTermWeek(book, currentTermWeek)),
      })),
      ...list(formation.enrichmentBlocks)
        .filter(forCurrentTerm)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Preserve the original callback signature during the runtime migration.
        .map((block, index) => ({
          id: `week_enrichment_${block.id}`,
          sourceId: block.id,
          kind: 'enrichment',
          title: block.title,
          detail: `${block.resource || block.blockType || 'Enrichment'}${currentWeekPlan(block) ? ` • ${currentWeekPlan(block)}` : ''}${block.weeklyFrequency ? ` • ${block.weeklyFrequency}` : ''}`,
          groupLabel:
            block.planningMode === 'forms'
              ? list(block.formLabels).length
                ? block.formLabels.join(', ')
                : block.formLabel || block.gradeLabel || 'Form Enrichment'
              : 'Everyone Together',
          planningMode: block.planningMode || 'family',
          href: /literature|read-aloud|read aloud/i.test(`${block.blockType} ${block.title}`)
            ? '/myagapay/learn/books'
            : '/myagapay/learn/formation',
          priority:
            block.priorityLevel === 'essential'
              ? 10
              : block.priorityLevel === 'important'
                ? 40
                : block.priorityLevel === 'optional'
                  ? 95
                  : 70,
          priorityLevel: block.priorityLevel,
          gracePriority: gracePriorityValue(block.gracePriority, 'medium'),
          instructionMode: block.instructionMode,
          missedLessonBehavior: block.missedLessonBehavior,
          color: block.color,
          graceNote: block.graceNote || 'Deferred gracefully to the reserve list.',
          ...planArraysForItem(block, currentTermWeek, plannerWeekWindow.dates),
        })),
    ],
    childRows: [
      ...currentSubjects.flatMap((subject, index) => {
        const resourceAssignments = list(subject.resources).length
          ? list(subject.resources).map((resource, resourceIndex) => ({
              ...subject,
              ...resource,
              resourceTitle: resource.title || (resource as { resource?: string }).resource || subject.resource,
              resourceIndex,
            }))
          : [{ ...subject, resourceTitle: subject.resource, resourceIndex: 0 }];
        return resourceAssignments.flatMap((assignment) => {
          const assignmentFormLabels =
            (assignment.formLabels?.length ? assignment.formLabels : subject.formLabels) || [];
          const hasChildIds = Array.isArray(assignment.childIds) && assignment.childIds.length;
          // For form-based planning: produce one row per form label regardless of
          // whether a child with that exact label exists. The planner pool shows
          // subjects to schedule; it doesn't require a matched child record.
          // For child-specific planning: filter to the named children only.
          let rowSlots;
          if (hasChildIds) {
            // Specific children — must match
            const matchedChildren = childrenForAssignment(assignment, next.children);
            rowSlots = matchedChildren.map((child) => ({ child, formLabelOverride: null }));
          } else if (assignmentFormLabels.length) {
            // Form-based — one slot per form label; try to find a matching child but don't require one
            rowSlots = assignmentFormLabels.map((label) => {
              const matchedChild = next.children.find((c) => c.formLabel === label || c.gradeLabel === label) || null;
              return { child: matchedChild, formLabelOverride: label };
            });
          } else {
            // No labels — treat as family/household (produce one row, no child)
            rowSlots = [{ child: null, formLabelOverride: null }];
          }
          return rowSlots.map(({ child, formLabelOverride }) => ({
            id: `week_${subject.id}_${assignment.resourceIndex + 1}_${formLabelOverride || child?.id || 'household'}`,
            sourceId: subject.id,
            resourceIndex: assignment.resourceIndex,
            childId: child?.id || null,
            childIds: subject.childIds || [],
            planningMode: assignmentFormLabels.length ? 'forms' : subject.planningMode || 'forms',
            formLabels: formLabelOverride ? [formLabelOverride] : assignmentFormLabels,
            title: subject.title,
            detail: `${assignment.resourceTitle || subject.cadenceLabel}${currentWeekPlan(assignment) ? ` • ${currentWeekPlan(assignment)}` : ''}${subject.endNumber ? ` (${subject.progressionType} ${subject.startNumber || 1}-${subject.endNumber})` : ''}${subject.weeklyFrequency ? ` • ${subject.weeklyFrequency}` : ''}`,
            priority:
              subject.priorityLevel === 'essential'
                ? index
                : subject.priorityLevel === 'important'
                  ? 30 + index
                  : subject.priorityLevel === 'optional'
                    ? 100 + index
                    : 70 + index,
            priorityLevel: subject.priorityLevel,
            gracePriority: gracePriorityValue(subject.gracePriority, 'core'),
            instructionMode: subject.instructionMode,
            missedLessonBehavior: subject.missedLessonBehavior,
            color: subject.color,
            graceNote: subject.graceNote || 'Deferred gracefully to the reserve list.',
            graceModeApplied:
              setupSnapshot.preferences?.graceModeActive &&
              gracePriorityValue(subject.gracePriority, 'core') !== 'core',
            ...planArraysForItem(assignment, currentTermWeek, plannerWeekWindow.dates),
          }));
        });
      }),
      ...childBooks.flatMap((book, index) => {
        const assignedChildren = childrenForAssignment(book, next.children);
        return assignedChildren.map((child) => ({
          id: `week_${book.id}_${child.id}`,
          childId: child.id,
          title: book.title,
          detail: `${book.author || book.category}${book.endChapter ? ` (chapters ${book.startChapter || 1}-${book.endChapter})` : ''}${book.weeklyFrequency ? ` • ${book.weeklyFrequency}` : ''}`,
          priority: index + 100,
          color: book.color,
          gracePriority: book.gracePriority || 'bump if needed',
          graceNote: book.graceNote || 'Reading moved into the reserve basket.',
          graceModeApplied:
            setupSnapshot.preferences?.graceModeActive && (book.gracePriority || 'bump if needed') !== 'keep',
          ...weeklyPlanArrays(book.weeklyFrequency, book.minutes || 20, scheduledThisTermWeek(book, currentTermWeek)),
        }));
      }),
    ],
  };
  next.termSetup = {
    ...next.termSetup,
    termOptions: list(setupSnapshot.terms).length ? list(setupSnapshot.terms) : [{ ...next.term }],
    activeTermId: currentTermId || next.term?.id || '',
    setupCards: [
      {
        id: 'setup_children',
        title: 'Children',
        value: String(next.children.length),
        detail: 'Active homeschool children',
      },
      {
        id: 'setup_subjects',
        title: 'Subjects',
        value: String(currentSubjects.length),
        detail: 'Configured curriculum tracks',
      },
      { id: 'setup_books', title: 'Books', value: String(currentBooks.length), detail: 'Living books and read-alouds' },
      {
        id: 'setup_formation',
        title: 'Formation',
        value: String(formationMaterialsForPlanning.length + list(formation.recitationTracks).length),
        detail: 'Catechesis, hymns, and memory work',
      },
    ],
    childTrackSummary: next.children.map((child) => ({
      childId: child.id,
      tracks: next.childTracks
        .filter((track) => track.childId === child.id)
        .map((track) => `${track.subjectType === 'reading' ? 'Reading' : track.subjectType}: ${track.title}`),
    })),
    pacingRows: [
      ...currentBooks
        .filter((book) => book.endChapter)
        .map((book) => ({
          id: `pace_${book.id}`,
          label: book.title,
          subtitle: `${book.author || book.category} • chapters ${book.startChapter || 1}-${book.endChapter}`,
          color: book.color,
          segments: distributeRangeSegments({
            label: 'Ch.',
            start: book.startChapter || 1,
            end: book.endChapter,
            color: book.color,
          }),
        })),
      ...currentSubjects
        .filter((subject) => subject.endNumber)
        .map((subject) => ({
          id: `pace_${subject.id}`,
          label: subject.title,
          subtitle: `${subject.resource || subject.subjectType} • ${subject.progressionType} ${subject.startNumber || 1}-${subject.endNumber}`,
          color: subject.color,
          segments: distributeRangeSegments({
            label: subject.progressionType,
            start: subject.startNumber || 1,
            end: subject.endNumber,
            color: subject.color,
          }),
        })),
      ...formationMaterialsForPlanning.map((material) => ({
        id: `pace_${material.id}`,
        label: material.materialType,
        subtitle: material.title,
        color: material.color,
        segments: [{ title: material.title, start: 1, span: 12, color: material.color }],
      })),
    ],
    graceReserve: [
      ...currentSubjects
        .filter(
          (subject) =>
            setupSnapshot.preferences?.graceModeActive && gracePriorityValue(subject.gracePriority, 'core') !== 'core'
        )
        .map((subject) => ({
          title: subject.title,
          note: subject.graceNote,
          color: subject.color,
        })),
      ...currentBooks
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Preserve the original callback signature during the runtime migration.
        .filter((book) => setupSnapshot.preferences?.graceModeActive)
        .map((book) => ({
          title: book.title,
          note: book.graceNote,
          color: book.color,
        })),
    ],
  };
  next.setupSnapshot = setupSnapshot;
  return next;
}
