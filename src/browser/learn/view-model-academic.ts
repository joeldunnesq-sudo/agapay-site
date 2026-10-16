import type { LearnViewPayload, LearnViewContext } from './dashboard-view-models-composition-contracts.js';

import { ACCENTS } from './dashboard-view-models-shared.js';
import {
  safeArray,
  text,
  percent,
  childName,
  childInitial,
  shellFromPayload,
  page,
  simpleList,
} from './dashboard-view-models-shared.js';

export function toFormationViewModel(rawPayload: LearnViewPayload) {
  const formation = rawPayload?.formation || {};
  const today = formation.today || {};
  const liturgicalDay = today.liturgicalDay || {};
  const enrichmentBlocks = simpleList(formation.enrichmentBlocks, (block) => ({
    title: text(block.title, 'Enrichment'),
    type: text(block.blockType, ''),
    minutes: block.minutesPlanned ? `${block.minutesPlanned}m` : '',
    frequency: text(block.weeklyFrequency || block.cadenceLabel, ''),
  }));
  const enrichmentByType = (pattern: RegExp) => enrichmentBlocks.filter((block) => pattern.test(block.type));
  const mappedMemory = enrichmentByType(/recitation|memory/i);
  const mappedHymns = enrichmentByType(/hymn/i);
  const mappedFeasts = enrichmentByType(/saints?|feasts?/i);
  const coreEnrichment = enrichmentBlocks.filter(
    (block) => !/(catechesis|recitation|memory|hymn|saints?|feasts?)/i.test(block.type)
  );
  // The Catechesis card on the Formation tab is sourced from the Catechesis
  // tile in Setup — which lives in the Enrichment list (blockType: "Catechesis")
  // rather than a separate dedicated form. Read the raw block directly so the
  // card always reflects what was actually entered in Setup.
  const rawCatechesisBlock =
    safeArray(formation.enrichmentBlocks).find((block) => /catechesis/i.test(text(block.blockType, ''))) || {};
  const catechesisResource = safeArray(rawCatechesisBlock.resources)[0] || {};
  const catechesisCurrentPlan =
    safeArray(catechesisResource.weeklyPlans || rawCatechesisBlock.weeklyPlans)
      .filter(Boolean)
      .slice(-1)[0] || '';
  return {
    shell: shellFromPayload('formation', rawPayload),
    page: page('formation', 'Formation', 'Church-first learning for hearts and minds.'),
    today: {
      title: text(liturgicalDay.feastTitle || today.title, 'Today in the Church'),
      date: text(today.dateLabel, ''),
      fasting: text(liturgicalDay.fastingRule, ''),
      readings: [text(liturgicalDay.epistleRef, ''), text(liturgicalDay.gospelRef, '')].filter(Boolean).join('; '),
      readingTasks: [
        { id: 'epistle', label: 'Epistle', ref: text(liturgicalDay.epistleRef, '') },
        { id: 'gospel', label: 'Gospel', ref: text(liturgicalDay.gospelRef, '') },
      ].filter((item) => item.ref),
      saint: text(safeArray(liturgicalDay.saints)[0], ''),
      troparion: text(liturgicalDay.troparionText, ''),
    },
    rhythms: simpleList(formation.churchRhythms || today.churchRhythms, (item) => ({
      title: text(item.title, 'Rhythm'),
      note: text(item.note, ''),
      complete: item.status === 'completed',
    })),
    catechesis: {
      title: text(rawCatechesisBlock.title || catechesisResource.title, 'Catechesis'),
      currentLesson: text(catechesisCurrentPlan || catechesisResource.title, 'Add a Catechesis resource in Setup'),
      progress: text(rawCatechesisBlock.cadenceLabel || rawCatechesisBlock.weeklyFrequency, ''),
      topic: text(rawCatechesisBlock.formLabel, ''),
    },
    recitation: [
      ...simpleList(formation.recitationTracks, (track) => ({
        title: text(track.title, 'Memory Work'),
        status: text(track.status, ''),
        progress: percent(track.progressPercent),
      })),
      ...mappedMemory.map((item) => ({
        title: item.title,
        status: item.frequency || item.type,
        progress: 0,
      })),
    ],
    hymns: [
      ...simpleList(formation.hymnStudies, (hymn) => ({
        title: text(hymn.title, 'Hymn'),
        tone: text(hymn.tone, ''),
        source: text(hymn.source, ''),
      })),
      ...mappedHymns.map((item) => ({
        title: item.title,
        tone: item.frequency || item.type,
        source: item.minutes,
      })),
    ],
    enrichment: coreEnrichment.map((block) => ({
      title: block.title,
      type: block.type,
      minutes: block.minutes,
    })),
    feasts: [
      ...mappedFeasts.map((item) => ({
        title: item.title,
        date: item.frequency || 'Household focus',
        fasting: item.minutes,
      })),
      ...simpleList(formation.upcomingFeasts, (feast) => ({
        title: text(feast.title, 'Feast'),
        date: text(feast.civilDate, ''),
        fasting: text(feast.fastingRule, ''),
      })),
    ].slice(0, 2),
    nature: simpleList(formation.natureJournalEntries, (entry) => ({
      title: text(entry.title, 'Nature Journal'),
      location: text(entry.location, ''),
      notes: text(entry.notes, ''),
    })),
  };
}

export function toBooksViewModel(rawPayload: LearnViewPayload) {
  const books = rawPayload?.books || {};
  return {
    shell: shellFromPayload('books', rawPayload),
    page: page('books', 'Books', 'Living books for the mind, the heart, and the soul.'),
    readAlouds: simpleList(books.currentReadAlouds, (book) => ({
      title: text(book.title, 'Untitled Book'),
      author: text(book.author, ''),
      assignment: text(book.assignmentLabel || book.assignedTerm || book.assignment || book.audienceLabel, ''),
      progress: percent(book.progressPercent),
      stream: text(book.streamLabel || book.audienceLabel, ''),
      list: text(book.listLabel, ''),
    })),
    library: simpleList(books.libraryBooks, (book) => ({
      title: text(book.title, 'Untitled Book'),
      author: text(book.author, ''),
      category: text(book.category, ''),
      ages: text(book.ageRange || book.ages, ''),
      orthodox: Boolean(book.orthodox),
      assignment: text(book.assignmentLabel || book.assignment || book.audienceLabel || book.formLabel, ''),
      progress: percent(book.progressPercent),
    })),
    suggestions: simpleList(books.orthodoxSuggestions, (item, index) => ({
      title: text(item.title, 'Suggestion'),
      subtitle: text(item.subtitle, ''),
      color: ACCENTS[index % ACCENTS.length],
    })),
    pacing: {
      title: text(books.bookPacing?.title, 'Select a book to pace'),
      subtitle: text(books.bookPacing?.subtitle, ''),
      chaptersPerWeek: text(books.bookPacing?.chaptersPerWeek, ''),
      weeks: simpleList(books.bookPacing?.weeks, (week) => ({
        week: text(week.week, ''),
        chapters: text(week.chapters, ''),
        pages: text(week.pages, ''),
      })),
    },
    copywork: simpleList(books.copyworkSources, (source) => ({
      title: text(source.title, 'Copywork Source'),
      detail: text(source.detail, ''),
    })),
  };
}

export function toReportsViewModel(rawPayload: LearnViewPayload) {
  const reports = rawPayload?.reports || {};
  const summary = reports.weeklySummary || {};
  const shell = shellFromPayload('reports', rawPayload);
  return {
    shell,
    page: page(
      'reports',
      'Reports & Progress',
      'Review progress, track growth, and generate records for your homeschool.'
    ),
    stats: [
      {
        label: 'Lessons Completed',
        value: `${summary.lessonsCompleted || 0} / ${summary.lessonsPlanned || 0}`,
        sub: `${summary.lessonsCompletionPercent || 0}%`,
        color: ACCENTS[0],
      },
      { label: 'Narrations Logged', value: text(summary.narrationsLogged, '0'), sub: 'This Week', color: ACCENTS[1] },
      {
        label: 'Read-Aloud Progress',
        value: `${percent(summary.readAloudProgressPercent)}%`,
        sub: text(summary.readAloudTitle, ''),
        color: ACCENTS[3],
      },
      {
        label: 'Feast Days Ahead',
        value: text(summary.feastDaysAhead, '0'),
        sub: text(summary.nextFeastLabel, ''),
        color: ACCENTS[2],
      },
    ],
    children: simpleList(reports.children, (child, index) => {
      const card = safeArray(reports.reportCards).find((item) => item.childId === child.id) || {};
      const records = safeArray(card.records);
      const completed = records.reduce((total, record) => total + (Number(record.completed) || 0), 0);
      const planned = records.reduce((total, record) => total + (Number(record.total) || 0), 0);
      const completionPercent = planned
        ? Math.round((completed / planned) * 100)
        : percent(card.readAloudProgressPercent || summary.lessonsCompletionPercent);
      return {
        id: text(child.id, ''),
        name: childName(child, index),
        grade: text(child.gradeLabel, ''),
        age: text(child.ageYears, ''),
        initial: childInitial(child, index),
        color: ACCENTS[index % ACCENTS.length],
        status: text(card.status, 'in progress'),
        summary: text(card.summary, 'No report notes yet.'),
        lessons: {
          done: completed || Number(summary.lessonsCompleted || 0),
          total: planned || Number(summary.lessonsPlanned || 0),
          percent: completionPercent,
        },
        readAloud: {
          percent: percent(card.readAloudProgressPercent || summary.readAloudProgressPercent),
        },
      };
    }),
    subjectProgress: simpleList(reports.subjectProgress, (row, index) => ({
      id: text(row.id, `progress-${index}`),
      childId: text(row.childId, ''),
      childName: text(row.childName, 'Household'),
      formLabel: text(row.formLabel, 'Household'),
      kind: text(row.kind, 'subject'),
      subjectTitle: text(row.subjectTitle, 'Subject'),
      subjectType: text(row.subjectType, ''),
      source: text(row.source, ''),
      progressionType: text(row.progressionType, 'lessons'),
      start: text(row.start, ''),
      current: text(row.current, ''),
      end: text(row.end, ''),
      completed: Number(row.completed || 0),
      total: Number(row.total || 0),
      percent: percent(row.percent),
      status: text(row.status, 'planned'),
      color: ACCENTS[index % ACCENTS.length],
    })),
    narrations: simpleList(reports.narrationLogs, (log) => ({
      date: text(log.loggedAt, '').slice(0, 10),
      child: childName(log.child, 0),
      source: text(log.sourceTitle, ''),
      type: text(log.narrationType, ''),
      note: text(log.note, ''),
    })),
    exports: simpleList(reports.reportExports, (item) => ({
      title: text(item.exportType, 'Export').replaceAll('-', ' '),
      format: text(item.format, '').toUpperCase(),
      status: text(item.status, ''),
    })),
    pdf: {
      title: 'Year-End Report',
      familyName: shell.familyName,
      schoolYear: text(reports.schoolYear?.label, ''),
      summary: [
        `Lessons completed: ${summary.lessonsCompleted || 0} / ${summary.lessonsPlanned || 0}`,
        `Narrations logged: ${summary.narrationsLogged || 0}`,
        `Read-aloud progress: ${percent(summary.readAloudProgressPercent)}%`,
        `Feast days ahead: ${summary.feastDaysAhead || 0}`,
        `Tracked subject rows: ${safeArray(reports.subjectProgress).length}`,
      ],
    },
  };
}

export function toGradesViewModel(rawPayload: LearnViewPayload, context: LearnViewContext = {}) {
  const grades = rawPayload?.grades || {};
  const shell = shellFromPayload('grades', { grades });
  const children = simpleList(grades.children, (child, index) => ({
    id: text(child.id, ''),
    name: text(child.name || child.firstName, `Child ${index + 1}`),
    firstName: text(child.firstName || child.name, `Child ${index + 1}`),
    gradeLabel: text(child.gradeLabel, ''),
    gradeLevel: Number(child.gradeLevel || 9),
    initial: childInitial(child, index),
    color: ACCENTS[index % ACCENTS.length],
  }));
  const selectedChildId = text(context.childId || grades.selectedChildId, children[0]?.id || '');
  const selectedChild = children.find((child) => child.id === selectedChildId) || children[0] || {};
  const courses = simpleList(grades.courses, (course, index) => ({
    id: text(course.id, ''),
    childId: text(course.childId || course.child_id, ''),
    courseTitle: text(course.courseTitle || course.course_title, 'Course'),
    subjectCategory: text(course.subjectCategory || course.subject_category, 'General'),
    gradeLevel: Number(course.gradeLevel ?? course.grade_level ?? selectedChild.gradeLevel ?? 9),
    creditHours: Number(course.creditHours ?? course.credit_hours ?? 1),
    color: ACCENTS[index % ACCENTS.length],
    grades: [1, 2, 3].map((termIndex) => {
      const grade =
        safeArray(course.grades).find((entry) => Number(entry.termIndex ?? entry.term_index) === termIndex) || {};
      return {
        id: text(grade.id, ''),
        termIndex,
        numericScore: grade.numericScore ?? grade.numeric_score ?? '',
        letterGrade: text(grade.letterGrade || grade.letter_grade, ''),
        attendanceDays: grade.attendanceDays ?? grade.attendance_days ?? '',
        teacherNotes: text(grade.teacherNotes || grade.teacher_notes, ''),
      };
    }),
  }));
  const childCourses = courses.filter((course) => !selectedChildId || course.childId === selectedChildId);
  const gpaPoints: Record<string, number> = {
    'A+': 4,
    A: 4,
    'A-': 3.7,
    'B+': 3.3,
    B: 3,
    'B-': 2.7,
    'C+': 2.3,
    C: 2,
    'C-': 1.7,
    'D+': 1.3,
    D: 1,
    'D-': 0.7,
    F: 0,
  };
  const finalRows = childCourses.map((course) => ({
    credits: Number(course.creditHours || 0),
    grade: [...course.grades].reverse().find((grade) => grade.letterGrade)?.letterGrade || '',
  }));
  const earnedCredits = finalRows.reduce((sum, row) => (row.grade ? sum + row.credits : sum), 0);
  const gpaCredits = finalRows.reduce(
    (sum, row) => (Object.hasOwn(gpaPoints, row.grade) && row.credits > 0 ? sum + row.credits : sum),
    0
  );
  const weightedGpa = finalRows.reduce(
    (sum, row) =>
      Object.hasOwn(gpaPoints, row.grade) && row.credits > 0 ? sum + gpaPoints[row.grade] * row.credits : sum,
    0
  );
  const summary = grades.summary || {};
  const attendanceEntries = simpleList(grades.attendance?.entries, (entry) => ({
    id: text(entry.id, ''),
    childId: text(entry.childId || entry.child_id, ''),
    date: text(entry.date || entry.attendanceDate || entry.attendance_date, ''),
    status: text(entry.status, 'present'),
    minutes: Number(entry.minutes || 0),
    notes: text(entry.notes, ''),
  }));
  const attendanceByChild = grades.attendance?.summary?.byChild || [];
  const attendanceSummaryForChild = (childId: string) =>
    attendanceByChild.find((row) => row.childId === childId) || {
      childId,
      present: attendanceEntries.filter((entry) => entry.childId === childId && entry.status === 'present').length,
      absent: attendanceEntries.filter((entry) => entry.childId === childId && entry.status === 'absent').length,
      excused: attendanceEntries.filter((entry) => entry.childId === childId && entry.status === 'excused').length,
      holiday: attendanceEntries.filter((entry) => entry.childId === childId && entry.status === 'holiday').length,
      instructionalDays: attendanceEntries.filter(
        (entry) => entry.childId === childId && ['present', 'excused'].includes(entry.status)
      ).length,
    };
  return {
    shell,
    page: page(
      'grades',
      'Grades & Attendance',
      'Record term grades, credits, attendance days, and narrative notes for report cards and transcripts.'
    ),
    household: {
      name: text(grades.household?.name || shell.familyName, 'Your Household'),
    },
    academicYear: {
      id: text(grades.academicYear?.id, ''),
      name: text(grades.academicYear?.name, ''),
    },
    children,
    selectedChildId,
    selectedChild,
    courses,
    childCourses,
    summary: {
      totalCredits: earnedCredits.toFixed(1),
      cumulativeGpa: gpaCredits ? (weightedGpa / gpaCredits).toFixed(2) : '0.00',
      missingGrades: childCourses.reduce(
        (sum, course) => sum + course.grades.filter((grade) => !grade.letterGrade).length,
        0
      ),
      courseCount: childCourses.length || Number(summary.courseCount || 0),
      attendanceDays: attendanceSummaryForChild(selectedChildId).instructionalDays || 0,
    },
    attendance: {
      entries: attendanceEntries,
      weekDates: safeArray(grades.attendance?.weekDates),
      statuses: safeArray(grades.attendance?.statuses).length
        ? grades.attendance!.statuses
        : ['present', 'absent', 'excused', 'holiday'],
      summary: {
        totalPresent: Number(grades.attendance?.summary?.totalPresent || 0),
        totalAbsent: Number(grades.attendance?.summary?.totalAbsent || 0),
        totalExcused: Number(grades.attendance?.summary?.totalExcused || 0),
        instructionalDays: Number(grades.attendance?.summary?.instructionalDays || 0),
        byChild: children.map((child) => attendanceSummaryForChild(child.id)),
      },
    },
    subjectCategories: [
      'English',
      'Math',
      'Science',
      'History',
      'Theology/Formation',
      'World Language',
      'Fine Arts',
      'Elective',
    ],
    letterGrades: ['', 'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F'],
  };
}
