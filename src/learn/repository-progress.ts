import type {
  LearnRuntimeSeed,
  LearnRuntimeBook,
  LearnSetupSnapshot,
  ProgressSubject,
} from './repository-composition-contracts.js';

import '../liturgical-calendar.js';

import './academic-exports.js';

import './academic-records.js';

import './demo-data.js';

import './liturgical-source.js';

import './planner-overrides.js';

import './print-documents.js';

import './setup-persistence.js';

import { childrenForProgress, rangeProgress } from './repository-shared.js';

export function buildSubjectProgress(seed: LearnRuntimeSeed) {
  const children = seed.children || [];
  const subjectRows = ((seed.setupSnapshot?.subjects || seed.curriculumSubjects || []) as ProgressSubject[]).flatMap(
    (subject, index) => {
      const assignedChildren = childrenForProgress(subject, children);
      const progress = rangeProgress({
        start: subject.startNumber || 1,
        current: subject.currentNumber || subject.completedThroughNumber || subject.startNumber || 0,
        end: subject.endNumber || subject.startNumber || 0,
      });
      return (
        assignedChildren.length
          ? assignedChildren
          : [{ id: '', firstName: 'Household', formLabel: subject.formLabel || 'Household' }]
      ).map((child) => ({
        id: `subject_progress_${subject.id || index}_${child.id || 'household'}`,
        childId: child.id || '',
        childName: child.firstName || 'Household',
        formLabel: child.formLabel || (child as { gradeLabel?: string }).gradeLabel || subject.formLabel || 'Household',
        kind: 'subject',
        subjectTitle: subject.title || 'Subject',
        subjectType: subject.subjectType || 'subject',
        source: subject.resource || '',
        progressionType: subject.progressionType || 'lessons',
        start: progress.start,
        current: progress.current,
        end: progress.end,
        completed: progress.completed,
        total: progress.total,
        percent: progress.percent,
        status: progress.percent >= 100 ? 'complete' : progress.percent > 0 ? 'in progress' : 'planned',
      }));
    }
  );
  const bookRows = ((seed.setupSnapshot?.books || seed.books || []) as LearnRuntimeBook[]).flatMap((book, index) => {
    const assignedChildren = childrenForProgress(book, children);
    const progress = rangeProgress({
      start: book.startChapter || 1,
      current: book.currentChapter || book.completedThroughChapter || book.startChapter || 0,
      end: book.endChapter || book.totalChapters || book.startChapter || 0,
    });
    const isHousehold = !book.formLabel && !book.childId;
    return (
      assignedChildren.length ? assignedChildren : [{ id: '', firstName: 'Household', formLabel: 'Household' }]
    ).map((child) => ({
      id: `book_progress_${book.id || index}_${child.id || 'household'}`,
      childId: isHousehold ? '' : child.id || '',
      childName: isHousehold ? 'Household' : child.firstName || 'Household',
      formLabel: isHousehold
        ? 'Household'
        : child.formLabel || (child as { gradeLabel?: string }).gradeLabel || book.formLabel || 'Household',
      kind: 'book',
      subjectTitle: book.title || 'Book',
      subjectType: book.category || 'Reading',
      source: book.author || book.audienceLabel || '',
      progressionType: 'chapters',
      start: progress.start,
      current: progress.current,
      end: progress.end,
      completed: progress.completed,
      total: progress.total,
      percent: progress.percent,
      status: progress.percent >= 100 ? 'complete' : progress.percent > 0 ? 'in progress' : 'planned',
    }));
  });
  return [...subjectRows, ...bookRows].filter((row) => row.subjectTitle && row.total > 0);
}
export function setupCopyworkSources(setupSnapshot: Partial<LearnSetupSnapshot> = {}) {
  const formation: Partial<LearnSetupSnapshot['formation']> = setupSnapshot.formation || {};
  const sources = [
    ...(Array.isArray(formation.recitationTracks) ? formation.recitationTracks : []).map((track) => ({
      title: track.title,
      detail: [track.sourceKind || track.source, track.status].filter(Boolean).join(' - '),
    })),
    ...(Array.isArray(formation.hymnStudies) ? formation.hymnStudies : []).map((hymn) => ({
      title: hymn.title,
      detail: [hymn.tone, hymn.source, hymn.status].filter(Boolean).join(' - '),
    })),
    ...(Array.isArray(formation.feasts) ? formation.feasts : []).map((feast) => ({
      title: feast.title,
      detail: [feast.civilDate || feast.date, feast.note].filter(Boolean).join(' - '),
    })),
    ...(Array.isArray(setupSnapshot.formationMaterials) ? setupSnapshot.formationMaterials : []).map((material) => ({
      title: material.title,
      detail: [material.materialType, material.source, material.cadence || material.cadenceLabel]
        .filter(Boolean)
        .join(' - '),
    })),
  ];
  return sources.filter((source) => source.title || source.detail);
}
export function reportCardsFromProgress(
  seed: LearnRuntimeSeed,
  subjectProgress: ReturnType<typeof buildSubjectProgress>
) {
  if (!seed.setupSnapshot) return seed.reportCards;
  return (seed.children || []).map((child) => {
    const rows = subjectProgress.filter((row) => row.childId === child.id);
    const completed = rows.reduce((total, row) => total + row.completed, 0);
    const planned = rows.reduce((total, row) => total + row.total, 0);
    const percent = planned ? Math.round((completed / planned) * 100) : 0;
    return {
      id: `report_${child.id}_${seed.term?.id || 'term'}`,
      childId: child.id,
      termId: seed.term?.id || '',
      status: 'draft',
      summary: `${child.firstName}'s report is generated from setup-tracked subject and reading progress.`,
      readAloudProgressPercent: percent,
      records: rows.map((row) => ({
        subject: row.subjectTitle,
        description: row.source || row.subjectType,
        progressPercent: row.percent,
        status: row.status,
        completed: row.completed,
        total: row.total,
        progressionType: row.progressionType,
      })),
    };
  });
}
export function buildFamilyPlanningPrintTemplates(seed: LearnRuntimeSeed) {
  const householdId = seed.household?.id || 'household';
  const baseTemplates = [
    {
      id: 'planner_lessons_week_form',
      householdId,
      templateType: 'planner-lesson-week-form',
      title: 'Weekly Lesson Plans by Form',
      audience: 'household',
      description:
        'A printable weekly lesson grid grouped by Form, including family-based enrichment and individual subjects.',
    },
    {
      id: 'planner_lessons_month_form',
      householdId,
      templateType: 'planner-lesson-month-form',
      title: 'Monthly Lesson Plans by Form',
      audience: 'household',
      description:
        'A month-at-a-glance planner with Form lessons, feast markers, fast days, and household rhythm notes.',
    },
    {
      id: 'planner_lessons_term_form',
      householdId,
      templateType: 'planner-lesson-term-form',
      title: 'Term Lesson Plans by Form',
      audience: 'household',
      description: 'A term overview organized by Form, children, subjects, and planned rhythm.',
    },
    {
      id: 'planner_meals_week',
      householdId,
      templateType: 'planner-meals-week',
      title: 'Weekly Meal Plan',
      audience: 'household',
      description: 'Breakfast, lunch, dinner, feast-day notes, and fasting guidance for the week.',
    },
    {
      id: 'planner_meals_month',
      householdId,
      templateType: 'planner-meals-month',
      title: 'Monthly Meal Plan',
      audience: 'household',
      description: 'A printable month of meals with fast days and feast days clearly marked.',
    },
    {
      id: 'planner_chores_day',
      householdId,
      templateType: 'planner-chores-day',
      title: 'Daily Chore Chart',
      audience: 'household',
      description: "A simple household chore chart for today's work.",
    },
    {
      id: 'planner_chores_week',
      householdId,
      templateType: 'planner-chores-week',
      title: 'Weekly Chore Chart',
      audience: 'household',
      description: "All children's chores for the week, grouped by day and assignment.",
    },
    {
      id: 'planner_chores_month',
      householdId,
      templateType: 'planner-chores-month',
      title: 'Monthly Chore Chart',
      audience: 'household',
      description: 'A month view of recurring chores, rotating responsibilities, and household service.',
    },
    {
      id: 'planner_events_month',
      householdId,
      templateType: 'planner-events-month',
      title: 'Monthly Events Chart',
      audience: 'household',
      description: 'Appointments, field trips, activities, name days, feast days, and fasting notes for the household.',
    },
    {
      id: 'planner_recipes',
      householdId,
      templateType: 'planner-recipes',
      title: 'Recipe Collection',
      audience: 'household',
      description: 'A printable collection of saved recipes with fasting notes and ingredients.',
    },
    {
      id: 'planner_grocery_week',
      householdId,
      templateType: 'planner-grocery-week',
      title: 'Weekly Grocery List',
      audience: 'household',
      description: 'A week-ready grocery list grouped for shopping and meal prep.',
    },
  ];

  const childLessonTemplates = (seed.children || []).flatMap((child) => [
    {
      id: `planner_lessons_${child.id}_week`,
      householdId,
      templateType: 'planner-lesson-week-child',
      title: `${child.firstName}'s Weekly Lessons`,
      audience: 'child',
      childId: child.id,
      description: 'A weekly lesson plan for this child, ready for checkoffs and notes.',
    },
    {
      id: `planner_lessons_${child.id}_month`,
      householdId,
      templateType: 'planner-lesson-month-child',
      title: `${child.firstName}'s Monthly Lessons`,
      audience: 'child',
      childId: child.id,
      description: "A month view of this child's lessons with Orthodox calendar markers.",
    },
    {
      id: `planner_lessons_${child.id}_term`,
      householdId,
      templateType: 'planner-lesson-term-child',
      title: `${child.firstName}'s Term Lessons`,
      audience: 'child',
      childId: child.id,
      description: 'A term-level subject and book plan for this child.',
    },
    {
      id: `planner_chores_${child.id}_week`,
      householdId,
      templateType: 'planner-chores-week-child',
      title: `${child.firstName}'s Weekly Chores`,
      audience: 'child',
      childId: child.id,
      description: 'A child-specific weekly chore chart.',
    },
  ]);

  return [...baseTemplates, ...childLessonTemplates];
}
