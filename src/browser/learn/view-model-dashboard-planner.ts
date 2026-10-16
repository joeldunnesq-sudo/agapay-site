import type { LearnViewPayload, LearnViewContext } from './dashboard-view-models-composition-contracts.js';

import { ACCENTS } from './dashboard-view-models-shared.js';
import {
  safeArray,
  saintKey,
  orderSaintNames,
  saintLikeTitle,
  orderSaintStories,
  annoMundiLabel,
  text,
  percent,
  childName,
  childInitial,
  groupRowsByForm,
  shellFromPayload,
  simpleList,
  weeklyAssignmentItemsFromRows,
  plannerDaysFromWeek,
} from './dashboard-view-models-shared.js';

export function toDashboardViewModel(rawPayload: LearnViewPayload, context: LearnViewContext = {}) {
  const dashboard = rawPayload?.dashboard || {};
  const today = dashboard.today || {};
  const liturgicalDay = today.liturgicalDay || {};
  const summary = dashboard.weeklySummary || {};
  const dashboardWeek = dashboard.week || {};
  const dashboardWeekHouseholdRows = safeArray(dashboardWeek.householdRows);
  const dashboardWeekChildRows = safeArray(dashboardWeek.childRows);
  const shell = shellFromPayload('dashboard', rawPayload);
  const saintNames = safeArray(liturgicalDay.saints)
    .map((saint) => text(typeof saint === 'string' ? saint : saint.name || saint.title, ''))
    .filter(Boolean);
  const titleSaintName = saintLikeTitle(liturgicalDay.feastTitle || liturgicalDay.summaryTitle || '');
  const combinedSaintNames = [...(titleSaintName ? [titleSaintName] : []), ...saintNames].filter(
    (name, index, names) => names.findIndex((candidate) => saintKey(candidate) === saintKey(name)) === index
  );
  const orderedSaintNames = orderSaintNames(combinedSaintNames);
  const saintStories = orderSaintStories(
    safeArray(liturgicalDay.saintStories)
      .map((saint) => ({
        name: text(saint.name || saint.title, ''),
        title: text(saint.title || saint.name, ''),
        storyText: text(saint.storyText || saint.story || saint.description, ''),
        reposeCentury: text(saint.reposeCentury, ''),
        feastRank: text(saint.feastRank, ''),
        iconUrl: text(saint.iconUrl, ''),
      }))
      .filter((saint) => saint.name || saint.storyText),
    orderedSaintNames
  );

  return {
    shell,
    page: {
      id: 'dashboard',
      title: 'Today',
      subtitle: `${text(today.dateLabel, context.todayLabel || '')}  •  ${text(today.weekdayLabel, '')}`,
      ornament: false,
    },
    todayInChurch: {
      kicker: 'TODAY IN THE CHURCH',
      title: text(liturgicalDay.feastTitle, 'Today in the Church'),
      liturgicalDateLabel: text(
        liturgicalDay.oldStyleDateLabel || liturgicalDay.liturgicalDateLabel,
        'Set calendar in Setup'
      ),
      annoMundiLabel: text(liturgicalDay.annoMundiLabel || annoMundiLabel(today.civilDate), '').replace(
        /^AM\s+/i,
        'Anno Mundi '
      ),
      toneLabel: text(liturgicalDay.tone, 'Tone unavailable'),
      fastingRule: text(liturgicalDay.fastingRule, 'Set fasting source in Setup'),
      fastingNote: text(liturgicalDay.fastingNote || liturgicalDay.seasonLabel, ''),
      epistleRef: text(liturgicalDay.epistleRef, 'Add epistle reading'),
      gospelRef: text(liturgicalDay.gospelRef, 'Add gospel reading'),
      troparionLabel: liturgicalDay.troparionTone ? `TROPARION · ${liturgicalDay.troparionTone}` : 'TROPARION',
      troparionText: text(liturgicalDay.troparionText, 'No troparion text loaded yet.'),
      kontakionLabel: liturgicalDay.kontakionTone ? `KONTAKION · ${liturgicalDay.kontakionTone}` : 'KONTAKION',
      kontakionText: text(liturgicalDay.kontakionText, 'No kontakion text loaded yet.'),
      iconUrl: text(liturgicalDay.iconUrl || liturgicalDay.ponomarIconUrl || liturgicalDay.feastIconUrl, ''),
      civilDate: text(today.civilDate, ''),
      calendarType: text(
        dashboard.calendarToggle?.selected || dashboard.preferences?.calendarType || liturgicalDay.calendarType,
        ''
      ),
      saintNames: orderedSaintNames,
      saintStories,
    },
    churchRhythms: safeArray(today.churchRhythms).map((item) => ({
      id: text(item.id, ''),
      label: text(item.title, 'Rhythm'),
      sub: text(item.note || item.subtitle, ''),
      complete: item.status === 'completed',
    })),
    householdStream: safeArray(today.householdStreamCards).map((item) => ({
      id: text(item.id, ''),
      title: text(item.title, 'Household block'),
      sub: text(item.subtitle, ''),
      group: text(item.groupLabel, 'Everyone Together'),
      href: text(item.href, '/myagapay/learn/formation'),
      time: item.minutesPlanned ? `${item.minutesPlanned}m` : '',
      complete: item.status === 'completed',
      icon: item.icon || '☩',
    })),
    childColumns: safeArray(today.childColumns).map((column, index) => ({
      tag: text(column.child?.formLabel || column.child?.gradeLabel, `CHILD ${index + 1}`).toUpperCase(),
      name: childName(column.child, index),
      age: text(column.child?.ageYears, ''),
      initial: childInitial(column.child, index),
      color: ACCENTS[index % ACCENTS.length],
      tasks: safeArray(column.blocks).map((block) => ({
        id: text(block.id, ''),
        title: text(block.title, 'Lesson'),
        sub: text(block.subtitle, ''),
        time: block.minutesPlanned ? `${block.minutesPlanned}m` : '',
        complete: block.status === 'completed',
      })),
    })),
    week: {
      label: text(dashboardWeek.label, 'This Week'),
      seasonLabel: text(dashboardWeek.seasonLabel, ''),
      days: plannerDaysFromWeek(dashboardWeek),
      weeklyAssignmentItems: weeklyAssignmentItemsFromRows(dashboardWeekHouseholdRows, dashboardWeekChildRows),
    },
    familyPlanning: {
      fastingPreference: text(dashboard.familyPlanning?.fastingPreference, 'guidance'),
      recipes: safeArray(dashboard.familyPlanning?.recipes),
      groceryItems: safeArray(dashboard.familyPlanning?.groceryItems),
      events: safeArray(dashboard.familyPlanning?.events),
      meals: safeArray(dashboard.familyPlanning?.meals),
      chores: safeArray(dashboard.familyPlanning?.chores),
      weekStart: text(dashboard.familyPlanning?.weekStart, ''),
    },
    thisWeek: [
      {
        icon: '☩',
        color: ACCENTS[0],
        big: `${summary.lessonsCompleted || 0} / ${summary.lessonsPlanned || 0}`,
        label: 'Lessons Completed',
        sub: `${summary.lessonsCompletionPercent || 0}%`,
      },
      {
        icon: '✒',
        color: ACCENTS[1],
        big: text(summary.narrationsLogged, '0'),
        label: 'Narrations Logged',
        sub: 'This Week',
      },
      {
        icon: '⌂',
        color: ACCENTS[2],
        big: text(summary.feastDaysAhead, '0'),
        label: 'Feast Days Ahead',
        sub: text(summary.nextFeastLabel, 'Set calendar in Setup'),
      },
      {
        icon: '☰',
        color: ACCENTS[3],
        big: `${percent(summary.readAloudProgressPercent)}%`,
        label: 'Read-Aloud Progress',
        sub: text(summary.readAloudTitle, 'Add a read-aloud in Setup'),
      },
    ],
    integrations: {
      graceMode: dashboard.activeIndicators?.graceMode || null,
      calendarToggle: dashboard.calendarToggle || null,
      thisDayInHistory: dashboard.thisDayInHistory || null,
      googleCalendarSync: dashboard.googleCalendarSync || null,
    },
    graceMode: {
      active: Boolean(dashboard.preferences?.graceModeActive),
      mode: text(dashboard.preferences?.graceModeDefault, 'light'),
    },
    termProgress: {
      label: text(dashboard.termProgress?.label || dashboard.term?.label, 'Current Term'),
      description: text(dashboard.termProgress?.description || dashboard.term?.description, ''),
      currentWeek: Number(dashboard.termProgress?.currentWeek || 0),
      totalWeeks: Number(dashboard.termProgress?.totalWeeks || 0),
      percent: percent(dashboard.termProgress?.percent),
      dateRange: text(dashboard.termProgress?.dateRange, ''),
    },
  };
}

export function toPlannerViewModel(rawPayload: LearnViewPayload) {
  const planner = rawPayload?.planner || {};
  const week = planner.week || {};
  const shell = shellFromPayload('planner', rawPayload);
  const query = new URLSearchParams(window.location.search);
  const activeView =
    query.get('view') || planner.activeView || localStorage.getItem('agapay.learn.plannerView') || 'week';
  const monthKey = query.get('month') || planner.month?.key || new Date().toISOString().slice(0, 7);
  const termOptions = safeArray(planner.termSetup?.termOptions);
  const requestedTermId = query.get('termId') || planner.term?.id || planner.termSetup?.activeTermId || '';
  const requestedTermIndex = termOptions.findIndex((term) => term.id === requestedTermId);
  const numericTermIndex = Math.max(
    0,
    Math.min(
      termOptions.length - 1,
      Number(query.get('term') || localStorage.getItem('agapay.learn.plannerTerm') || 1) - 1
    )
  );
  const activeTermIndex = requestedTermIndex >= 0 ? requestedTermIndex : numericTermIndex;
  const activeTermId = termOptions[activeTermIndex]?.id || requestedTermId;
  const activeTerm = activeTermIndex + 1;
  const days = plannerDaysFromWeek(week);
  const selectedDate = query.get('date') || days.find((day) => !day.isSunday)?.date || days[0]?.date || '';
  const selectedDayIndex = Math.max(
    0,
    days.findIndex((day) => day.date === selectedDate)
  );
  const selectedDay = days[selectedDayIndex] || days[0] || {};
  const childTrackSummary = safeArray(planner.termSetup?.childTrackSummary);
  const childTrackById = new Map(childTrackSummary.map((track) => [track.childId, safeArray(track.tracks)]));
  const rawHouseholdRows = safeArray(week.householdRows);
  const rawChildRows = safeArray(week.childRows);
  const currentWeekItems = weeklyAssignmentItemsFromRows(rawHouseholdRows, rawChildRows);

  return {
    shell,
    graceMode: {
      active: Boolean(planner.graceMode?.active ?? planner.preferences?.graceModeActive),
      mode: text(planner.graceMode?.mode ?? planner.preferences?.graceModeDefault, 'light'),
    },
    page: {
      id: 'planner',
      title: 'Family Planner',
      subtitle:
        activeView === 'week' || activeView === 'day'
          ? `${text(week.label, 'This Week')}  •  ${text(week.seasonLabel, '')}`
          : activeView === 'month'
            ? text(planner.month?.label, 'Month Calendar')
            : 'Plan lessons, meals, appointments, chores, and the household rhythm in one place.',
      ornament: true,
    },
    activeView,
    plannerTabs: ['day', 'week', 'month', 'term', 'year'].map((view) => ({
      id: view,
      label: view.charAt(0).toUpperCase() + view.slice(1),
      active: activeView === view,
      href: `/myagapay/learn/planner?view=${view}${view === 'month' ? `&month=${encodeURIComponent(monthKey)}` : ''}${view !== 'year' ? `&term=${activeTerm}&termId=${encodeURIComponent(activeTermId)}` : ''}`,
    })),
    termTabs: (termOptions.length
      ? termOptions
      : [1, 2, 3, 4].map((term) => ({ id: `term_${term}`, label: term === 4 ? 'Term 4 / Summer' : `Term ${term}` }))
    ).map((term, index) => ({
      id: term.id || index + 1,
      label: text(term.label, `Term ${index + 1}`),
      active: index === activeTermIndex,
      href: `/myagapay/learn/planner?view=${encodeURIComponent(activeView)}&term=${index + 1}&termId=${encodeURIComponent(term.id || '')}${activeView === 'month' ? `&month=${encodeURIComponent(monthKey)}` : ''}`,
    })),
    week: {
      label: text(week.label, 'This Week'),
      seasonLabel: text(week.seasonLabel, ''),
      termWeekNumber: Number(week.termWeekNumber || 0),
      totalTermWeeks: Number(
        planner.term?.weeksCount ||
          planner.schoolYear?.terms?.find?.((t) => t.id === (planner.term?.id || ''))?.weeksCount ||
          12
      ),
      weekStartDate: text(safeArray<string>(week.dates)[0], ''),
      weekEndDate: text(
        safeArray<string>(week.dates)[6] || safeArray<string>(week.dates)[safeArray<string>(week.dates).length - 1],
        ''
      ),
      days,
      householdRows: rawHouseholdRows.map((row, index) => ({
        id: text(row.id, `household-${index}`),
        title: text(row.title, 'Household block'),
        sub: text(row.subtitle || row.detail, ''),
        minutes: safeArray(row.minutes),
        statuses: safeArray<string>(row.statuses),
        color: text(row.color, ACCENTS[index % ACCENTS.length]),
        graceModeApplied: Boolean(row.graceModeApplied),
      })),
      childRows: rawChildRows.map((row, index) => ({
        childName: childName(row.child, index),
        childId: text(row.childId || row.child?.id, ''),
        initial: childInitial(row.child, index),
        color: text(row.color || row.child?.color, ACCENTS[index % ACCENTS.length]),
        blocks: safeArray(row.blocks || row.assignments).map((block) => ({
          title: text(block.title, 'Lesson'),
          sub: text(block.subtitle, ''),
          minutes: block.minutesPlanned || block.minutes || '',
        })),
        title: text(row.title, 'Lesson'),
        sub: text(row.detail || row.subtitle, ''),
        minutes: safeArray(row.minutes),
        statuses: safeArray<string>(row.statuses),
        graceModeApplied: Boolean(row.graceModeApplied),
      })),
      weeklyAssignmentItems: currentWeekItems,
      formRows: groupRowsByForm(rawChildRows),
    },
    day: {
      selected: selectedDay,
      selectedIndex: selectedDayIndex,
      householdBlocks: safeArray(week.householdRows)
        .map((row, index) => ({
          id: text(row.id, `household-${index}`),
          title: text(row.title, 'Household block'),
          sub: text(row.detail || row.subtitle, ''),
          minutes: selectedDay?.isSunday ? 0 : Number(safeArray(row.minutes)[selectedDayIndex] || 0),
          status: selectedDay?.isSunday ? 'rest' : text(safeArray<string>(row.statuses)[selectedDayIndex], ''),
          graceModeApplied: Boolean(row.graceModeApplied),
        }))
        .filter((row) => row.minutes > 0 || row.status === 'rest'),
      childBlocks: rawChildRows
        .map((row, index) => ({
          id: text(row.id, `child-${index}`),
          childName: childName(row.child, index),
          initial: childInitial(row.child, index),
          color: text(row.color || row.child?.color, ACCENTS[index % ACCENTS.length]),
          title: text(row.title, 'Lesson'),
          sub: text(row.detail || row.subtitle, ''),
          minutes: selectedDay?.isSunday ? 0 : Number(safeArray(row.minutes)[selectedDayIndex] || 0),
          status: selectedDay?.isSunday ? 'rest' : text(safeArray<string>(row.statuses)[selectedDayIndex], ''),
          graceModeApplied: Boolean(row.graceModeApplied),
        }))
        .filter((row) => row.minutes > 0 || row.status === 'rest'),
      formBlocks: selectedDay?.isSunday ? [] : groupRowsByForm(rawChildRows, selectedDayIndex),
    },
    month: {
      key: monthKey,
      label: text(planner.month?.label, 'Month Calendar'),
      printableTitle: text(planner.month?.printableTitle, 'Household Month Calendar'),
      weekdays: safeArray(planner.month?.weekdays).length
        ? safeArray(planner.month?.weekdays)
        : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      fastDays: Number(planner.month?.fastDays || 0),
      feastDays: Number(planner.month?.feastDays || 0),
      days: safeArray(planner.month?.days).map((day) => ({
        date: text(day.civilDate, ''),
        dayNumber: text(day.dayNumber, ''),
        weekday: text(day.weekdayLabel, ''),
        inMonth: Boolean(day.inMonth),
        isToday: Boolean(day.isToday),
        isSunday: Boolean(day.isSunday),
        isFastDay: Boolean(day.isFastDay),
        feast: text(day.feastTitle, ''),
        feastRank: text(day.feastRank, ''),
        fasting: text(day.fastingRule, ''),
        fastingType: text(day.fastingType, ''),
        oldStyleDateLabel: text(day.oldStyleDateLabel, ''),
        nameDays: safeArray(day.nameDays),
        events: safeArray(day.events),
        meal: day.meal || null,
        fastingPreference: text(day.fastingPreference, 'guidance'),
        householdPlan: safeArray(day.householdPlan).map((item) => ({
          title: text(item.title, ''),
          minutes: Number(item.minutes || 0),
        })),
        formPlan: safeArray(day.formPlan).map((item) => ({
          title: text(item.title, ''),
          formLabel: text(item.formLabel, ''),
          minutes: Number(item.minutes || 0),
        })),
      })),
    },
    familyPlanning: {
      fastingPreference: text(planner.familyPlanning?.fastingPreference, 'guidance'),
      recipes: safeArray(planner.familyPlanning?.recipes || week.recipes),
      groceryItems: safeArray(planner.familyPlanning?.groceryItems || week.groceryItems),
      events: safeArray(planner.familyPlanning?.events),
      meals: safeArray(planner.familyPlanning?.meals),
      chores: safeArray(planner.familyPlanning?.chores),
      weekStart: text(planner.familyPlanning?.weekStart, ''),
      household: {
        motherName: text(planner.household?.motherName, ''),
        motherNameDay: text(planner.household?.motherNameDay, ''),
        fatherName: text(planner.household?.fatherName, ''),
        fatherNameDay: text(planner.household?.fatherNameDay, ''),
        parishPatronalFeastName: text(planner.household?.parishPatronalFeastName, ''),
        parishPatronalFeastDate: text(planner.household?.parishPatronalFeastDate, ''),
      },
      children: safeArray(planner.children).map((child, index) => ({
        id: text(child.id, ''),
        name: childName(child, index),
        nameDay: text(child.nameDay, ''),
        color: text(child.color, ACCENTS[index % ACCENTS.length]),
        initial: childInitial(child, index),
        formLabel: text(child.formLabel || child.form || '', ''),
        gradeLabel: text(child.gradeLabel || child.grade || '', ''),
      })),
    },
    term: {
      activeTerm,
      activeTermId,
      label: text(planner.term?.label, `Term ${activeTerm}`),
      dateRange: [text(planner.term?.startDate, ''), text(planner.term?.endDate, '')].filter(Boolean).join(' - '),
      description: text(planner.term?.description, ''),
      paceMode: text(planner.term?.paceMode, ''),
      settings: planner.curriculum?.mappingSummary || [],
      cycleTitle: text(planner.cycle?.year?.title, 'Household Cycle'),
      cycleSummary: text(planner.cycle?.framework?.summary, ''),
      setupCards: simpleList(planner.termSetup?.setupCards, (card) => ({
        title: text(card.title, 'Setup'),
        value: text(card.value, ''),
        detail: text(card.detail, ''),
      })).map((card, index) => ({ ...card, color: ACCENTS[index % ACCENTS.length] })),
      pacingRows: simpleList(planner.termSetup?.pacingRows, (row, rowIndex) => ({
        label: text(row.label, 'Pacing'),
        subtitle: text(row.subtitle, ''),
        color: text(row.color, ACCENTS[rowIndex % ACCENTS.length]),
        segments: simpleList(row.segments, (segment, segmentIndex) => ({
          title: text(segment.title, ''),
          start: Number(segment.start || 1),
          span: Number(segment.span || 1),
          color: text(segment.color, ACCENTS[(rowIndex + segmentIndex) % ACCENTS.length]),
        })),
      })),
      graceReserve: [
        ...simpleList(planner.termSetup?.graceReserve, (item, index) => ({
          title: text(item.title, 'Reserved work'),
          note: text(item.note, ''),
          color: text(item.color, ACCENTS[index % ACCENTS.length]),
        })),
        ...simpleList(planner.week?.reserveList, (item, index) => ({
          title: text(item.title, 'Reserved work'),
          note: "Set aside for whenever there's a roomier day. No rush.",
          color: ACCENTS[(index + 3) % ACCENTS.length],
        })),
      ],
      summary: planner.termSetup?.termSummary || {},
      householdSummary: safeArray(planner.termSetup?.householdSummary).map((item) => text(item)),
      childTracks: safeArray(planner.children).map((child, index) => ({
        name: childName(child, index),
        age: text(child.ageYears, ''),
        initial: childInitial(child, index),
        color: text(child.color, ACCENTS[index % ACCENTS.length]),
        tracks: safeArray(childTrackById.get(child.id)).map((item) => text(item)),
      })),
      graceMode: planner.graceMode || null,
    },
    year: {
      schoolYear: text(planner.schoolYear?.label, 'School Year'),
      dateRange: [text(planner.schoolYear?.startDate, ''), text(planner.schoolYear?.endDate, '')]
        .filter(Boolean)
        .join(' - '),
      cycleTitle: text(planner.cycle?.framework?.title, 'Cycle Planning'),
      cycleYear: text(planner.cycle?.year?.title, ''),
      frameworks: simpleList(planner.cycle?.visibleFrameworks, (framework) => ({
        type: text(framework.type, ''),
        label: text(framework.label, ''),
      })),
      topics: simpleList(planner.cycle?.topics, (topic) => ({
        type: text(topic.subjectType, ''),
        title: text(topic.title, ''),
        season: text(topic.seasonLabel, ''),
      })),
      terms: (termOptions.length ? termOptions : [{ label: 'Term 1' }, { label: 'Term 2' }, { label: 'Term 3' }]).map(
        (term, index) => ({
          label: text(term.label, `Term ${index + 1}`),
          active: index === activeTermIndex,
        })
      ),
      upcomingFeasts: simpleList(planner.upcomingFeasts, (feast) => ({
        date: text(feast.civilDate, ''),
        title: text(feast.title, ''),
        fasting: text(feast.fastingRule, ''),
      })),
      curriculumPackages: simpleList(planner.curriculum?.packages, (pkg) => ({
        title: text(pkg.title, 'Curriculum Package'),
        vendor: text(pkg.vendor, ''),
        summary: text(pkg.summary, ''),
      })),
    },
  };
}
