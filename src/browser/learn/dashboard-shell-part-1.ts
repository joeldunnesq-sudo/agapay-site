import type {
  LearnFaithTextFields,
  LearnChromeModel,
  LearnTruthyFilter,
  LearnShellViewModel,
  LearnShellNode,
  LearnPrintVm,
} from './dashboard-shell-contracts.js';
import type { LearnShellBindings } from './dashboard-shell.js';

declare const ODYSSEY_FAITH_SPECIFIC: LearnShellBindings['ODYSSEY_FAITH_SPECIFIC'];
declare const MARKETING_LEARNERS: LearnShellBindings['MARKETING_LEARNERS'];
declare const LEARN_VIEW_MODE_KEY: LearnShellBindings['LEARN_VIEW_MODE_KEY'];
declare const isOdysseyLearnContext: LearnShellBindings['isOdysseyLearnContext'];
declare const html: LearnShellBindings['html'];
declare const learnExperience: LearnShellBindings['learnExperience'];
declare const marketingPreviewActive: LearnShellBindings['marketingPreviewActive'];
declare const learnSectionHref: LearnShellBindings['learnSectionHref'];

function cloneLearnViewModel<T>(vm: T) {
  try {
    return structuredClone(vm);
  } catch {
    return JSON.parse(JSON.stringify(vm)) as T;
  }
}

function isFaithSpecific(value: unknown = '') {
  return ODYSSEY_FAITH_SPECIFIC.test(String(value || ''));
}

function secularPrintText(value: unknown = '') {
  const text = String(value || '')
    .replace(/school rhythm with feast and fast markers\.?/gi, 'School rhythm with lesson and event markers.')
    .replace(
      /appointments, field trips, activities, name days, feast days, and fasting notes for the household\.?/gi,
      'Appointments, field trips, activities, and household notes.'
    )
    .replace(
      /a month-at-a-glance planner with form lessons, feast markers, fast days, and household rhythm notes\.?/gi,
      'A month-at-a-glance planner with Form lessons, school days, and household rhythm notes.'
    )
    .replace(
      /breakfast, lunch, dinner, feast-day notes, and fasting guidance for the week\.?/gi,
      'Breakfast, lunch, dinner, and weekly menu notes.'
    )
    .replace(
      /a printable month of meals with fast days and feast days clearly marked\.?/gi,
      'A printable month of meals with school days and household events clearly marked.'
    )
    .replace(
      /a printable collection of saved recipes with fasting notes and ingredients\.?/gi,
      'A printable collection of saved recipes with notes and ingredients.'
    )
    .replace(/liturgical school calendar/gi, 'Flexible school-year calendar')
    .replace(/meal plans with feast and fast markers/gi, 'Meal plans with family schedule notes')
    .replace(/feast[- ]day notes?/gi, 'calendar notes')
    .replace(/feast notes?/gi, 'calendar notes')
    .replace(/fasting (guidance|notes?)/gi, 'menu notes')
    .replace(/fast days?/gi, 'school days')
    .replace(/feast days?/gi, 'household events');
  return text;
}

function itemIsFaithSpecific(item: object = {}) {
  return [
    (item as LearnFaithTextFields).title,
    (item as LearnFaithTextFields).label,
    (item as LearnFaithTextFields).sub,
    (item as LearnFaithTextFields).subtitle,
    (item as LearnFaithTextFields).detail,
    (item as LearnFaithTextFields).note,
    (item as LearnFaithTextFields).type,
    (item as LearnFaithTextFields).category,
    (item as LearnFaithTextFields).description,
  ].some(isFaithSpecific);
}

function secularPlannerDay<T extends LearnShellNode = LearnShellNode>(day: T = {} as T) {
  return {
    ...day,
    isFastDay: false,
    feast: '',
    feastRank: '',
    fasting: '',
    fastingType: '',
    tone: '',
    epistle: '',
    gospel: '',
    oldStyleDateLabel: '',
    nameDays: [],
  };
}

function demoPlannerItems() {
  const planned = ['empty', 'planned', 'planned', 'planned', 'planned', 'planned', 'empty'];
  return [
    {
      id: 'demo_family_readaloud',
      kind: 'household',
      title: 'Family Read-Aloud',
      sub: 'The Wind in the Willows',
      minutes: 25,
      statuses: planned,
      color: '#34507a',
      formLabels: ['__family'],
      gracePriority: 'keep',
    },
    {
      id: 'demo_nature',
      kind: 'household',
      title: 'Nature Study',
      sub: 'Backyard birds and field notes',
      minutes: 30,
      statuses: ['empty', 'empty', 'planned', 'empty', 'planned', 'empty', 'empty'],
      color: '#4a5a31',
      formLabels: ['__family'],
      gracePriority: 'reduce first',
    },
    {
      id: 'demo_art',
      kind: 'household',
      title: 'Art & Music',
      sub: 'Artist study and listening',
      minutes: 25,
      statuses: ['empty', 'planned', 'empty', 'empty', 'planned', 'empty', 'empty'],
      color: '#8a6b2f',
      formLabels: ['__family'],
      gracePriority: 'reduce first',
    },
    {
      id: 'demo_form4_math',
      kind: 'form',
      title: 'Algebra II',
      sub: 'Form IV · Lessons 18–21',
      minutes: 45,
      statuses: planned,
      color: '#34507a',
      formLabels: ['Form IV'],
      gracePriority: 'keep',
    },
    {
      id: 'demo_form4_lit',
      kind: 'form',
      title: 'American Literature',
      sub: 'Form IV · Chapters 7–9',
      minutes: 35,
      statuses: planned,
      color: '#7b5b78',
      formLabels: ['Form IV'],
      gracePriority: 'keep',
    },
    {
      id: 'demo_form3_math',
      kind: 'form',
      title: 'Pre-Algebra',
      sub: 'Form III · Lessons 24–27',
      minutes: 40,
      statuses: planned,
      color: '#6e2f2a',
      formLabels: ['Form III'],
      gracePriority: 'keep',
    },
    {
      id: 'demo_form3_science',
      kind: 'form',
      title: 'Earth Science',
      sub: 'Form III · Weather systems',
      minutes: 35,
      statuses: planned,
      color: '#537a7a',
      formLabels: ['Form III'],
      gracePriority: 'keep',
    },
    {
      id: 'demo_form2_math',
      kind: 'form',
      title: 'Mathematics',
      sub: 'Form II · Fractions and decimals',
      minutes: 30,
      statuses: planned,
      color: '#4a5a31',
      formLabels: ['Form II'],
      gracePriority: 'keep',
    },
    {
      id: 'demo_form2_history',
      kind: 'form',
      title: 'World History',
      sub: 'Form II · Ancient Greece',
      minutes: 30,
      statuses: planned,
      color: '#8a6b2f',
      formLabels: ['Form II'],
      gracePriority: 'keep',
    },
    {
      id: 'demo_form1_math',
      kind: 'form',
      title: 'Number Sense',
      sub: 'Form I · Lesson 12',
      minutes: 20,
      statuses: planned,
      color: '#537a7a',
      formLabels: ['Form I'],
      gracePriority: 'keep',
    },
    {
      id: 'demo_form1_reading',
      kind: 'form',
      title: 'Reading & Phonics',
      sub: 'Form I · Short vowels',
      minutes: 20,
      statuses: planned,
      color: '#7b5b78',
      formLabels: ['Form I'],
      gracePriority: 'keep',
    },
  ];
}

function demoBooks() {
  return {
    readAlouds: [
      {
        title: 'The Wind in the Willows',
        author: 'Kenneth Grahame',
        assignment: 'Family Read-Aloud',
        progress: 62,
        stream: 'Household',
      },
      {
        title: 'The Burgess Bird Book',
        author: 'Thornton W. Burgess',
        assignment: 'Nature Study',
        progress: 38,
        stream: 'Household',
      },
      {
        title: "A Child's History of the World",
        author: 'V. M. Hillyer',
        assignment: 'World History',
        progress: 47,
        stream: 'Forms I–II',
      },
    ],
    library: [
      {
        title: 'The Wind in the Willows',
        author: 'Kenneth Grahame',
        category: 'Literature',
        ages: '8+',
        assignment: 'Family Read-Aloud',
        progress: 62,
      },
      {
        title: 'The Burgess Bird Book',
        author: 'Thornton W. Burgess',
        category: 'Nature Study',
        ages: '7–12',
        assignment: 'Term 1',
        progress: 38,
      },
      {
        title: "A Child's History of the World",
        author: 'V. M. Hillyer',
        category: 'History',
        ages: '8–13',
        assignment: 'Term 1',
        progress: 47,
      },
      {
        title: 'The Story of Science',
        author: 'Joy Hakim',
        category: 'Science',
        ages: '11+',
        assignment: 'Form III',
        progress: 24,
      },
    ],
    copywork: [
      { title: 'Selected Poems', detail: 'Robert Louis Stevenson and Christina Rossetti' },
      { title: 'Nature Journal Captions', detail: 'Student-selected observations from weekly field notes' },
    ],
    suggestions: [
      {
        title: 'Living Books for American History',
        subtitle: 'Narrative history and primary-source selections',
        color: '#34507a',
      },
      {
        title: 'Family Nature Study',
        subtitle: 'Field guides, seasonal journals, and observation prompts',
        color: '#4a5a31',
      },
    ],
  };
}

function prepareOdysseyViewModel<T extends LearnShellViewModel>(vm: T): T;

function prepareOdysseyViewModel(vm: LearnShellViewModel) {
  if (!isOdysseyLearnContext()) return vm;
  const next = cloneLearnViewModel(vm);
  const marketing = marketingPreviewActive();
  const secularPageMeta: Record<string, [string, string]> = {
    dashboard: ['Today', 'Lessons, household plans, and the day’s essentials in one calm view.'],
    planner: ['Family Planner', 'Plan lessons, meals, chores, and events across the whole household.'],
    formation: ['Formation & Enrichment', 'Memory work, nature study, art, music, and optional household practices.'],
    books: ['Books & Curriculum', 'Track read-alouds, curriculum resources, pacing, and the household library.'],
    grades: ['Grades & Attendance', 'Record grades, credits, attendance, and transcript-ready academic history.'],
    community: ['Homeschool Resources', 'A curated library of practical tools for teaching and home education.'],
    'print-center': ['Print Center', 'Create weekly plans, student sheets, records, and household print packs.'],
    onboarding: ['Set Up', 'Configure learners, terms, subjects, planning groups, and household defaults.'],
  };
  if (secularPageMeta[next.page?.id]) {
    next.page.title = secularPageMeta[next.page.id][0];
    next.page.subtitle = secularPageMeta[next.page.id][1];
  }
  if (next.shell) {
    next.shell.nav = (next.shell.nav || []).map((item) => ({ ...item, href: learnSectionHref(item.id) }));
    if (marketing) {
      next.shell.familyName = 'The Harper Family';
      next.shell.familyMeta = '6 Learners • Flexible Homeschool';
    }
  }

  if (next.page?.id === 'dashboard') {
    next.churchRhythms = [];
    next.householdStream = (next.householdStream || []).filter((item) => !itemIsFaithSpecific(item));
    next.week!.days = (next.week?.days || []).map(secularPlannerDay);
    next.week!.weeklyAssignmentItems = (next.week?.weeklyAssignmentItems || []).filter(
      (item) => !itemIsFaithSpecific(item)
    );
    next.childColumns = (next.childColumns || []).map((column) => ({
      ...column,
      tasks: (column.tasks || []).filter((item) => !itemIsFaithSpecific(item)),
    }));
    if (next.thisWeek?.[2])
      next.thisWeek[2] = { icon: '◷', color: '#4a5a31', big: '5', label: 'School Days Planned', sub: 'This Week' };
    if (marketing) {
      const date = next.todayInChurch?.civilDate || new Date().toISOString().slice(0, 10);
      next.householdStream = [
        {
          id: 'demo_morning',
          title: 'Morning Basket',
          sub: 'Poetry, map work, and read-aloud',
          group: 'Everyone Together',
          href: learnSectionHref('planner'),
          time: '30m',
          complete: true,
          icon: '☰',
        },
        {
          id: 'demo_nature',
          title: 'Nature Study',
          sub: 'Backyard birds and field notes',
          group: 'Everyone Together',
          href: learnSectionHref('planner'),
          time: '30m',
          complete: false,
          icon: '✦',
        },
        {
          id: 'demo_art',
          title: 'Art & Music',
          sub: 'Artist study and listening',
          group: 'Everyone Together',
          href: learnSectionHref('planner'),
          time: '25m',
          complete: false,
          icon: '♫',
        },
      ];
      next.childColumns = MARKETING_LEARNERS.map((learner, index) => ({
        tag: learner.formLabel.toUpperCase(),
        name: learner.name,
        age: learner.age,
        initial: learner.name[0],
        color: learner.color,
        tasks: [
          {
            id: `demo_${index}_math`,
            title: index < 2 ? 'Mathematics' : 'Number Sense',
            sub: `Lesson ${18 + index}`,
            time: index < 2 ? '40m' : '25m',
            complete: index % 2 === 0,
          },
          {
            id: `demo_${index}_language`,
            title: index < 2 ? 'Literature & Composition' : 'Reading & Narration',
            sub: index < 2 ? 'Chapters 7–9' : 'Daily reading',
            time: '30m',
            complete: index < 3,
          },
        ],
      }));
      next.week!.weeklyAssignmentItems = demoPlannerItems();
      next.familyPlanning = {
        ...(next.familyPlanning || {}),
        events: [{ id: 'demo_library', title: 'Library visit', date, startTime: '14:00', location: 'Central Library' }],
        meals: [{ date, breakfast: 'Oatmeal & berries', lunch: 'Soup and bread', dinner: 'Sheet-pan chicken' }],
        chores: [
          {
            id: 'demo_dishes',
            title: 'Unload dishwasher',
            assignee: 'Jordan',
            daysOfWeek: [new Date(`${date}T12:00:00Z`).getUTCDay()],
          },
        ],
      };
      next.thisWeek = [
        { icon: '✓', color: '#34507a', big: '24 / 31', label: 'Lessons Completed', sub: '77%' },
        { icon: '✒', color: '#6e2f2a', big: '8', label: 'Narrations Logged', sub: 'This Week' },
        { icon: '◷', color: '#4a5a31', big: '5', label: 'School Days Planned', sub: 'This Week' },
        { icon: '☰', color: '#8a6b2f', big: '62%', label: 'Read-Aloud Progress', sub: 'The Wind in the Willows' },
      ];
    }
  }

  if (next.page?.id === 'planner') {
    next.week!.days = (next.week?.days || []).map(secularPlannerDay);
    next.month!.days = (next.month?.days || []).map(secularPlannerDay);
    next.month!.fastDays = 0;
    next.month!.feastDays = 0;
    next.year!.upcomingFeasts = [];
    next.week!.householdRows = (next.week!.householdRows || []).filter((item) => !itemIsFaithSpecific(item));
    next.week!.childRows = (next.week!.childRows || [])
      .map((row) => ({ ...row, blocks: (row.blocks || []).filter((item) => !itemIsFaithSpecific(item)) }))
      .filter((item) => !itemIsFaithSpecific(item));
    next.week!.weeklyAssignmentItems = (next.week!.weeklyAssignmentItems || []).filter(
      (item) => !itemIsFaithSpecific(item)
    );
    next.day!.householdBlocks = (next.day!.householdBlocks || []).filter((item) => !itemIsFaithSpecific(item));
    next.day!.childBlocks = (next.day!.childBlocks || []).filter((item) => !itemIsFaithSpecific(item));
    next.day!.formBlocks = (next.day!.formBlocks || []).filter((item) => !itemIsFaithSpecific(item));
    next.term!.setupCards = (next.term!.setupCards || []).filter((item) => !itemIsFaithSpecific(item));
    next.year!.topics = (next.year!.topics || []).filter((item) => !itemIsFaithSpecific(item));
    if (marketing) {
      next.week!.weeklyAssignmentItems = demoPlannerItems();
      next.week!.formRows = [
        {
          formLabel: 'Form IV',
          childNames: ['Avery'],
          initials: ['A'],
          color: '#34507a',
          items: [{ title: 'Algebra II' }, { title: 'American Literature' }],
        },
        {
          formLabel: 'Form III',
          childNames: ['Jordan'],
          initials: ['J'],
          color: '#6e2f2a',
          items: [{ title: 'Pre-Algebra' }, { title: 'Earth Science' }],
        },
        {
          formLabel: 'Form II',
          childNames: ['Riley', 'Morgan'],
          initials: ['R', 'M'],
          color: '#4a5a31',
          items: [{ title: 'Mathematics' }, { title: 'World History' }],
        },
        {
          formLabel: 'Form I',
          childNames: ['Casey', 'Quinn'],
          initials: ['C', 'Q'],
          color: '#537a7a',
          items: [{ title: 'Number Sense' }, { title: 'Reading & Phonics' }],
        },
      ];
      next.familyPlanning!.children = MARKETING_LEARNERS.map((learner) => ({
        ...learner,
        initial: learner.name[0],
        nameDay: '',
      }));
      next.familyPlanning!.household = {
        motherName: '',
        fatherName: '',
        parishPatronalFeastName: '',
        parishPatronalFeastDate: '',
      };
      next.familyPlanning!.meals = (next.week!.days || []).map((day, index) => ({
        date: day.date,
        breakfast: ['Oatmeal & berries', 'Eggs & toast', 'Yogurt & granola'][index % 3],
        lunch: ['Soup and bread', 'Picnic lunch', 'Pasta salad'][index % 3],
        dinner: ['Sheet-pan chicken', 'Taco bowls', 'Vegetable curry'][index % 3],
      }));
      next.familyPlanning!.chores = MARKETING_LEARNERS.map((learner, index) => ({
        id: `demo_chore_${index}`,
        title: ['Kitchen reset', 'Laundry', 'Pet care', 'Sweep entry', 'Set the table', 'Toy pickup'][index],
        assignee: learner.name,
        childId: learner.id,
        daysOfWeek: [1, 3, 5],
      }));
    }
  }

  if (next.page?.id === 'formation') {
    next.rhythms = (next.rhythms || []).filter((item) => !itemIsFaithSpecific(item));
    next.recitation = (next.recitation || []).filter((item) => !itemIsFaithSpecific(item));
    next.hymns = [];
    next.feasts = [];
    next.enrichment = (next.enrichment || []).filter((item) => !itemIsFaithSpecific(item));
    if (marketing) {
      next.rhythms = [
        { title: 'Morning Check-In', note: 'Review the day together', complete: true },
        { title: 'Independent Reading', note: 'Quiet reading block', complete: false },
      ];
      next.recitation = [
        { title: 'The Swing — Robert Louis Stevenson', status: 'memorizing', progress: 70 },
        { title: 'Gettysburg Address', status: 'reviewing', progress: 45 },
      ];
      next.enrichment = [
        { title: "Georgia O'Keeffe", type: 'Art Study', minutes: '25m' },
        { title: 'Aaron Copland', type: 'Composer Study', minutes: '20m' },
        { title: 'Backyard Birds', type: 'Nature Study', minutes: '30m' },
      ];
      next.nature = [
        {
          title: 'Northern Cardinal',
          location: 'Backyard feeder',
          notes: 'Compared the male and female plumage and added both to the field journal.',
        },
      ];
    }
  }

  if (next.page?.id === 'books') {
    next.library = (next.library || [])
      .filter((item) => !itemIsFaithSpecific(item))
      .map((item) => ({ ...item, orthodox: false }));
    next.readAlouds = (next.readAlouds || []).filter((item) => !itemIsFaithSpecific(item));
    next.copywork = (next.copywork || []).filter((item) => !itemIsFaithSpecific(item));
    next.suggestions = (next.suggestions || []).filter((item) => !itemIsFaithSpecific(item));
    if (marketing) Object.assign(next, demoBooks());
  }

  if (next.page?.id === 'grades') {
    next.subjectCategories = (next.subjectCategories || []).filter((item) => !isFaithSpecific(item));
    if (marketing) {
      next.children = MARKETING_LEARNERS.map((learner, index) => ({
        id: learner.id,
        name: learner.name,
        firstName: learner.name,
        gradeLabel: learner.formLabel,
        gradeLevel: 10 - index,
        initial: learner.name[0],
        color: learner.color,
      }));
      next.selectedChildId = next.children[0].id;
      next.selectedChild = next.children[0];
      next.courses = [
        {
          id: 'demo_course_math',
          childId: next.selectedChildId,
          courseTitle: 'Algebra II',
          subjectCategory: 'Math',
          gradeLevel: 10,
          creditHours: 1,
          color: '#34507a',
          grades: [
            {
              termIndex: 1,
              numericScore: 94,
              letterGrade: 'A',
              attendanceDays: 42,
              teacherNotes: 'Strong mastery and consistent work.',
            },
            { termIndex: 2, numericScore: 92, letterGrade: 'A-', attendanceDays: 0, teacherNotes: '' },
            { termIndex: 3, numericScore: '', letterGrade: '', attendanceDays: '', teacherNotes: '' },
          ],
        },
        {
          id: 'demo_course_lit',
          childId: next.selectedChildId,
          courseTitle: 'American Literature',
          subjectCategory: 'English',
          gradeLevel: 10,
          creditHours: 1,
          color: '#7b5b78',
          grades: [
            {
              termIndex: 1,
              numericScore: 96,
              letterGrade: 'A',
              attendanceDays: 42,
              teacherNotes: 'Thoughtful narration and analysis.',
            },
            { termIndex: 2, numericScore: 95, letterGrade: 'A', attendanceDays: 0, teacherNotes: '' },
            { termIndex: 3, numericScore: '', letterGrade: '', attendanceDays: '', teacherNotes: '' },
          ],
        },
        {
          id: 'demo_course_science',
          childId: next.selectedChildId,
          courseTitle: 'Biology with Lab',
          subjectCategory: 'Science',
          gradeLevel: 10,
          creditHours: 1,
          color: '#4a5a31',
          grades: [
            {
              termIndex: 1,
              numericScore: 91,
              letterGrade: 'A-',
              attendanceDays: 42,
              teacherNotes: 'Complete lab notebook.',
            },
            { termIndex: 2, numericScore: 93, letterGrade: 'A', attendanceDays: 0, teacherNotes: '' },
            { termIndex: 3, numericScore: '', letterGrade: '', attendanceDays: '', teacherNotes: '' },
          ],
        },
      ];
      next.childCourses = next.courses;
      next.summary = {
        totalCredits: '3.0',
        cumulativeGpa: '3.90',
        missingGrades: 3,
        courseCount: 3,
        attendanceDays: 42,
      };
      next.attendance!.summary!.instructionalDays = 42;
    }
  }

  if (next.page?.id === 'print-center') {
    next.templates = (next.templates || [])
      .filter((item) => !isFaithSpecific(item.title))
      .map((item) => ({
        ...item,
        description: secularPrintText(item.description),
      }));
    if (next.reports?.stats) {
      next.reports.stats = next.reports.stats.map((stat) =>
        isFaithSpecific(stat.label) || isFaithSpecific(stat.sub)
          ? { ...stat, label: 'Upcoming Events', sub: 'Field trips & activities' }
          : stat
      );
    }
    if (next.outputs) {
      next.outputs.household = (next.outputs.household || []).map(secularPrintText);
      next.outputs.child = (next.outputs.child || []).map(secularPrintText);
      next.outputs.planner = (next.outputs.planner || []).map(secularPrintText);
    }
    if (marketing)
      next.templates = (next.templates || []).map((template: Partial<LearnPrintVm['templates'][number]>, index) => ({
        ...template,
        child:
          template.audience === 'child' ? MARKETING_LEARNERS[index % MARKETING_LEARNERS.length].name : template.child,
      }));
  }

  if (next.page?.id === 'community') {
    next.resources = (next.resources || []).filter((item) => !itemIsFaithSpecific(item));
    next.categories = [
      'All',
      ...new Set(next.resources.map((item) => item.category).filter(Boolean as unknown as LearnTruthyFilter)),
    ];
    if (marketing || !next.resources.length) {
      next.comingSoon = false;
      next.title = 'Practical resources, thoughtfully curated.';
      next.subtitle = 'Find useful tools for planning, teaching, records, and family learning.';
      next.resources = [
        {
          id: 'demo_resource_teks',
          title: 'TEKS Resource Library',
          category: 'Texas Standards',
          resourceType: 'Reference',
          mediaType: 'Website',
          ageRange: 'K–12',
          subtitle: 'Official standards and supporting materials',
          desc: 'Browse Texas Essential Knowledge and Skills by subject and grade.',
          url: 'https://tea.texas.gov/academics/curriculum-standards/teks',
          sharedBy: 'AGAPAY',
          poster: 'AGAPAY',
          posterInitial: 'A',
          tags: ['TEKS', 'Planning', 'K–12'],
          votes: 0,
          pinned: true,
          vetted: true,
          flagCount: 0,
          color: '#34507a',
          icon: '↗',
          posterColor: '#34507a',
        },
        {
          id: 'demo_resource_library',
          title: 'Library of Congress Education',
          category: 'Primary Sources',
          resourceType: 'Resource Library',
          mediaType: 'Mixed Media',
          ageRange: 'All Ages',
          subtitle: 'Primary sources and classroom collections',
          desc: 'Explore maps, photographs, recordings, and curated historical collections.',
          url: 'https://www.loc.gov/programs/teachers/',
          sharedBy: 'AGAPAY',
          poster: 'AGAPAY',
          posterInitial: 'A',
          tags: ['History', 'Primary Sources'],
          votes: 0,
          pinned: true,
          vetted: true,
          flagCount: 0,
          color: '#4a5a31',
          icon: '⌕',
          posterColor: '#4a5a31',
        },
        {
          id: 'demo_resource_nasa',
          title: 'NASA STEM Resources',
          category: 'Science',
          resourceType: 'Lesson Collection',
          mediaType: 'Mixed Media',
          ageRange: 'K–12',
          subtitle: 'Science activities and exploration',
          desc: 'Hands-on STEM activities, images, missions, and learning collections.',
          url: 'https://www.nasa.gov/learning-resources/',
          sharedBy: 'AGAPAY',
          poster: 'AGAPAY',
          posterInitial: 'A',
          tags: ['Science', 'STEM', 'K–12'],
          votes: 0,
          pinned: true,
          vetted: true,
          flagCount: 0,
          color: '#6e2f2a',
          icon: '✦',
          posterColor: '#6e2f2a',
        },
      ];
      next.categories = ['All', 'Texas Standards', 'Primary Sources', 'Science'];
      next.resourceTypes = ['All', 'Reference', 'Resource Library', 'Lesson Collection'];
      next.mediaTypes = ['All', 'Website', 'Mixed Media'];
    }
  }

  if (next.page?.id === 'onboarding') {
    next.children = (next.children || []).map((child) => ({ ...child }));
    next.subjects = (next.subjects || []).filter((item) => !itemIsFaithSpecific(item));
    next.books = (next.books || []).filter((item) => !itemIsFaithSpecific(item));
    if (next.formationSetup) {
      next.formationSetup.churchRhythms = (next.formationSetup.churchRhythms || []).filter(
        (item) => !itemIsFaithSpecific(item)
      );
      next.formationSetup.recitationTracks = (next.formationSetup.recitationTracks || []).filter(
        (item) => !itemIsFaithSpecific(item)
      );
      next.formationSetup.hymnStudies = [];
      next.formationSetup.enrichmentBlocks = (next.formationSetup.enrichmentBlocks || []).filter(
        (item) => !itemIsFaithSpecific(item)
      );
      next.formationSetup.feasts = [];
    }
    if (marketing) {
      next.household!.name = 'The Harper Family';
      next.household!.parentName = 'Taylor Harper';
      next.household!.homeschoolName = 'Harper Home Academy';
      next.household!.method = 'Eclectic';
      next.household!.parish = '';
      next.household!.parishName = '';
      next.household!.patronSaintName = '';
      next.household!.patronSaintFeastDate = '';
      next.household!.parishPatronalFeastName = '';
      next.household!.parishPatronalFeastDate = '';
      next.children = MARKETING_LEARNERS.map((learner) => ({
        id: learner.id,
        name: learner.name,
        firstName: learner.name,
        age: learner.age,
        ageYears: learner.age,
        grade: learner.gradeLabel,
        gradeLabel: learner.gradeLabel,
        form: learner.formLabel,
        formLabel: learner.formLabel,
        color: learner.color,
      }));
    }
  }

  return next;
}

function setLearnViewMode(mode: string) {
  if (isOdysseyLearnContext()) return;
  try {
    localStorage.setItem(LEARN_VIEW_MODE_KEY, mode === 'classic' ? 'classic' : 'tefa');
  } catch {
    // Best-effort — a failed write just means the toggle won't persist across reloads.
  }
}

function safeExternalUrl(value: unknown) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function cssVars() {
  return [
    '--ink:#1b2c45',
    '--navy:#102a4c',
    '--navy2:#0a1c38',
    '--cream:#f6f1e8',
    '--paper:#fdf9ef',
    '--paper2:#f8f0dd',
    '--line:#e7dcc0',
    '--gold:#b5942f',
    '--gold2:#c9a227',
    '--goldsoft:#dac88f',
    '--muted:#8a7c5e',
    '--burgundy:#6e2f2a',
    '--olive:#4a5a31',
    '--slate:#34507a',
  ].join(';');
}

function check(complete: unknown) {
  return `<span style="width:23px;height:23px;flex:none;border-radius:50%;border:1.4px solid ${complete ? 'var(--navy)' : 'var(--gold)'};background:${complete ? 'var(--navy)' : 'transparent'};color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;">${complete ? '✓' : ''}</span>`;
}

function completionCheck(item: LearnShellNode, scope: string, label: unknown) {
  return `<button type="button" data-learn-completion data-completion-id="${html(item.id)}" data-completion-scope="${html(scope)}" aria-pressed="${item.complete ? 'true' : 'false'}" aria-label="${html(`${item.complete ? 'Mark incomplete' : 'Mark complete'}: ${label}`)}" style="width:27px;height:27px;flex:none;border-radius:50%;border:1.5px solid ${item.complete ? 'var(--navy)' : 'var(--gold)'};background:${item.complete ? 'var(--navy)' : 'transparent'};color:#fff;display:grid;place-items:center;font-size:14px;cursor:pointer;padding:0;">${item.complete ? '✓' : ''}</button>`;
}

function bar(value: unknown, color: string = 'var(--gold)') {
  return `<span style="display:block;height:6px;border-radius:99px;background:#e9dfc7;overflow:hidden;"><span style="display:block;height:100%;width:${Number(value) || 0}%;background:${color};border-radius:99px;"></span></span>`;
}

function pageIntroIcon(id: string) {
  const icons = {
    dashboard: '<path d="M4 12.5 12 5l8 7.5V21H4z"/><path d="M9 21v-6h6v6"/><path d="M12 5V2"/><path d="M10 4h4"/>',
    planner:
      '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/><path d="M8 14h3M13 14h3M8 17h3"/>',
    formation:
      '<path d="M10 9h4M12 6v7"/><path d="M4 22V11l8-5 8 5v11"/><path d="M8 22v-4a4 4 0 0 1 8 0v4"/><path d="M12 2v3"/>',
    books:
      '<path d="M12 7v14"/><path d="M4 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 3 1.35A4 4 0 0 1 15 3h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-5a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
    grades: '<path d="M4 20 10 4h4l6 16"/><path d="M7 14h10"/><path d="M8 20h8"/>',
    reports: '<path d="M4 21V3h12l4 4v14z"/><path d="M16 3v5h5"/><path d="M8 16v-3M12 16V9M16 16v-5"/>',
    'print-center':
      '<path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/>',
    community:
      '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="3.4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.3a4 4 0 0 1 0 7.4"/>',
    'co-op': '<path d="M4 20V9l8-5 8 5v11"/><path d="M8 20v-5h8v5"/><path d="M7 12h2M15 12h2"/><path d="M12 4V2"/>',
    onboarding:
      '<path d="M12.2 2h-.4a2 2 0 0 0-2 2 1.7 1.7 0 0 1-2.6 1.5 2 2 0 0 0-2.7.7l-.2.4a2 2 0 0 0 .7 2.7A1.7 1.7 0 0 1 5 12a1.7 1.7 0 0 1-1 1.6 2 2 0 0 0-.7 2.7l.2.4a2 2 0 0 0 2.7.7A1.7 1.7 0 0 1 9 18.9a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2 1.7 1.7 0 0 1 2.6-1.5 2 2 0 0 0 2.7-.7l.2-.4a2 2 0 0 0-.7-2.7A1.7 1.7 0 0 1 19 12a1.7 1.7 0 0 1 1-1.6 2 2 0 0 0 .7-2.7l-.2-.4a2 2 0 0 0-2.7-.7A1.7 1.7 0 0 1 14.2 4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.8c.25 2.3.72 2.78 3 3-2.28.25-2.75.72-3 3-.25-2.28-.72-2.75-3-3 2.28-.22 2.75-.7 3-3z" fill="currentColor" stroke="none"/><g fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round">${(icons as unknown as Record<string, (typeof icons)[keyof typeof icons] | undefined>)[id] || icons.dashboard}</g></svg>`;
}

function pageIntroMeta(id: string) {
  const meta = {
    dashboard: {
      kicker: 'AGAPAY LEARN',
      description:
        'A peaceful command center for today’s Church rhythm, household learning, term progress, and gentle adjustments.',
      quote: 'Of all holy works, the education of children is the most holy.',
      ref: 'St. Theophan the Recluse',
    },
    planner: {
      kicker: 'HOUSEHOLD PLANNING',
      description:
        'Plan the week by household rhythm and Form, so large families stay organized without repeating the same work everywhere.',
      quote:
        'The soul of a child is like soft wax. If you impress right principles upon it while it is tender, no one will be able to efface them.',
      ref: 'St. John Chrysostom',
    },
    formation: {
      kicker: 'ORTHODOX FORMATION',
      description:
        'Keep readings, prayers, catechesis, hymns, saints, feasts, and beauty tied to the living rhythm of the Church.',
      quote: 'We must not only teach our children to read and write, but we must also teach them to know God.',
      ref: 'St. Kosmas Aitolos',
    },
    books: {
      kicker: 'LIVING BOOKS',
      description:
        'Track read-alouds, library choices, copywork sources, and Orthodox living-book suggestions for the whole household.',
      quote: 'A word of advice is a seed. If the soil is good, it will bring forth fruit.',
      ref: 'Elder Thaddeus of Vitovnica',
    },
    grades: {
      kicker: 'ACADEMIC RECORDS',
      description:
        'Record term grades, attendance, credits, and narrative notes for report cards and high school transcripts.',
      quote: 'Let all things be done decently and in order.',
      ref: '1 Corinthians 14:40',
    },
    reports: {
      kicker: 'COMING SOON',
      description:
        'Beautiful academic records, report cards, progress summaries, and transcripts are planned for a future Learn release.',
      quote: 'If good foundations are laid early, children will grow up to be great.',
      ref: 'St. John Chrysostom',
    },
    'print-center': {
      kicker: 'PRINT CENTER',
      description: 'Generate simple household plans and printable resources with clear Free and Family-plan access.',
      quote:
        'With us everything should be secondary compared to our concern with children, and their upbringing in the instruction and teaching of the Lord.',
      ref: 'St. John Chrysostom',
    },
    community: {
      kicker: 'COMING SOON',
      description: 'A curated Orthodox homeschool resource exchange will come after the core planner is settled.',
      quote: 'As each has received a gift, use it to serve one another.',
      ref: '1 Peter 4:10',
    },
    'co-op': {
      kicker: 'CO-OP',
      description: 'Future shared planning for Orthodox homeschool groups, classes, meetings, and records.',
      quote: 'Where two or three are gathered together in My name, there am I.',
      ref: 'Matthew 18:20',
    },
    onboarding: {
      kicker: 'SETUP',
      description:
        'Shape the household profile, children, Forms, books, term dates, subjects, and Church rhythm that power Learn.',
      quote: 'And let us not be weary in well doing: for in due season we shall reap, if we faint not.',
      ref: 'Galatians 6:9',
    },
  };
  return (meta as unknown as Record<string, (typeof meta)[keyof typeof meta] | undefined>)[id] || meta.dashboard;
}

function pageIntro(vm: LearnChromeModel) {
  const meta = pageIntroMeta(vm.page.id);
  const experience = learnExperience();
  const tefaMeta = {
    dashboard: {
      kicker: 'TEFA HOMESCHOOL PLANNER',
      description: 'Lessons, household plans, and the day’s essentials in one calm view.',
      quote: 'A well-planned day makes room for attention.',
      ref: 'AGAPAY Learn',
    },
    planner: {
      kicker: 'HOUSEHOLD PLANNING',
      description: 'Plan by family group, Form, or grade without repeating the same work for every child.',
      quote: 'A clear week leaves more room for teaching.',
      ref: 'AGAPAY Learn',
    },
    onboarding: {
      kicker: 'SETUP',
      description: 'Set up learners, planning groups, school dates, subjects, and optional household rhythms.',
      quote: 'Start with the essentials. Add detail only when it helps.',
      ref: 'AGAPAY Learn',
    },
    formation: {
      kicker: 'FORMATION & ENRICHMENT',
      description: 'Add memory work, nature study, art, music, and household practices when they serve your family.',
      quote: 'Keep what is useful; leave what is not.',
      ref: 'AGAPAY Learn',
    },
    books: {
      kicker: 'BOOKS & CURRICULUM',
      description: 'Track read-alouds, curriculum resources, pacing, and the household library.',
      quote: 'Books turn lessons into lasting conversations.',
      ref: 'AGAPAY Learn',
    },
    grades: {
      kicker: 'ACADEMIC RECORDS',
      description: 'Record grades, credits, attendance, and transcript-ready academic history.',
      quote: 'Records should make progress easy to see.',
      ref: 'AGAPAY Learn',
    },
    'print-center': {
      kicker: 'PRINT CENTER',
      description: 'Create weekly plans, student sheets, records, and household print packs.',
      quote: 'Plan once. Use it wherever the week happens.',
      ref: 'AGAPAY Learn',
    },
    community: {
      kicker: 'HOMESCHOOL RESOURCES',
      description: 'A curated library of practical tools for teaching and home education.',
      quote: 'Useful resources are better when families can find them quickly.',
      ref: 'AGAPAY Learn',
    },
  };
  const activeMeta =
    experience.tefaActive &&
    (tefaMeta as unknown as Record<string, (typeof tefaMeta)[keyof typeof tefaMeta] | undefined>)[vm.page.id]
      ? {
          ...meta,
          ...(tefaMeta as unknown as Record<string, (typeof tefaMeta)[keyof typeof tefaMeta] | undefined>)[vm.page.id],
        }
      : meta;
  const kicker = experience.odyssey && vm.page.id === 'dashboard' ? experience.dashboardKicker : activeMeta.kicker;
  const description =
    experience.odyssey && vm.page.id === 'dashboard' && experience.dashboardDescription
      ? experience.dashboardDescription
      : activeMeta.description;
  const subtitle = vm.page.subtitle ? vm.page.subtitle : description;
  const currentMode = vm.graceMode?.active ? vm.graceMode.mode || 'light' : 'full';
  return `
    <section class="learn-page-intro learn-page-intro--dashboard" aria-labelledby="learn-page-heading">
      <div class="learn-page-intro-heading">
        <span class="learn-page-intro-icon">${pageIntroIcon(vm.page.id)}</span>
        <div>
          <div class="learn-page-intro-kicker">${html(kicker)}</div>
          <h1 id="learn-page-heading">${html(vm.page.title)}</h1>
        </div>
      </div>
      <p class="learn-page-intro-description">${html(subtitle)}</p>
      <div class="learn-page-intro-quote">
        <span aria-hidden="true">“</span>
        <p>${html(activeMeta.quote)} <strong>${html(activeMeta.ref)}</strong></p>
      </div>
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(181,148,47,.2);">
        <button type="button" data-grace-mode="full" style="border:1px solid ${currentMode === 'full' ? 'var(--gold)' : 'rgba(181,148,47,.3)'};border-radius:9px;background:${currentMode === 'full' ? 'rgba(6,21,34,.06)' : 'transparent'};color:${currentMode === 'full' ? 'var(--gold)' : 'var(--muted)'};padding:7px 14px;cursor:pointer;font-family:inherit;font-size:13px;font-weight:${currentMode === 'full' ? '700' : '400'};">
          ${currentMode === 'full' ? '✓ Full plan active — Grace Mode off' : 'Return to full plan — no Grace Mode'}
        </button>
      </div>
    </section>
  `;
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function isLearnFamilyPlan() {
  return localStorage.getItem('agapay.learn.plan') === 'family';
}
export type LearnShell2Part0 = {
  cloneLearnViewModel: typeof cloneLearnViewModel;
  isFaithSpecific: typeof isFaithSpecific;
  secularPrintText: typeof secularPrintText;
  itemIsFaithSpecific: typeof itemIsFaithSpecific;
  secularPlannerDay: typeof secularPlannerDay;
  demoPlannerItems: typeof demoPlannerItems;
  demoBooks: typeof demoBooks;
  prepareOdysseyViewModel: typeof prepareOdysseyViewModel;
  setLearnViewMode: typeof setLearnViewMode;
  safeExternalUrl: typeof safeExternalUrl;
  cssVars: typeof cssVars;
  check: typeof check;
  completionCheck: typeof completionCheck;
  bar: typeof bar;
  pageIntroIcon: typeof pageIntroIcon;
  pageIntroMeta: typeof pageIntroMeta;
  pageIntro: typeof pageIntro;
  downloadBlob: typeof downloadBlob;
  isLearnFamilyPlan: typeof isLearnFamilyPlan;
};
