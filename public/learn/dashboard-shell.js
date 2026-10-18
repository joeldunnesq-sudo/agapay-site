// Generated from src/browser/learn/dashboard-shell.ts by npm run build:browser. Do not edit.
function truthyLearn1(value) {
  return Boolean(value);
}
function cloneLearnViewModel(vm) {
  try {
    return structuredClone(vm);
  } catch {
    return JSON.parse(JSON.stringify(vm));
  }
}
function isFaithSpecific(value = '') {
  return ODYSSEY_FAITH_SPECIFIC.test(String(value || ''));
}
function secularPrintText(value = '') {
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
function itemIsFaithSpecific(item = {}) {
  return [
    item.title,
    item.label,
    item.sub,
    item.subtitle,
    item.detail,
    item.note,
    item.type,
    item.category,
    item.description,
  ].some(isFaithSpecific);
}
function secularPlannerDay(day = {}) {
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
function prepareOdysseyViewModel(vm) {
  if (!isOdysseyLearnContext()) return vm;
  const next = cloneLearnViewModel(vm);
  const marketing = marketingPreviewActive();
  const secularPageMeta = {
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
    next.week.days = (next.week?.days || []).map(secularPlannerDay);
    next.week.weeklyAssignmentItems = (next.week?.weeklyAssignmentItems || []).filter(
      (item) => !itemIsFaithSpecific(item)
    );
    next.childColumns = (next.childColumns || []).map((column) => ({
      ...column,
      tasks: (column.tasks || []).filter((item) => !itemIsFaithSpecific(item)),
    }));
    if (next.thisWeek?.[2])
      next.thisWeek[2] = { icon: '◷', color: '#4a5a31', big: '5', label: 'School Days Planned', sub: 'This Week' };
    if (marketing) {
      const date = next.todayInChurch?.civilDate || /* @__PURE__ */ new Date().toISOString().slice(0, 10);
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
      next.week.weeklyAssignmentItems = demoPlannerItems();
      next.familyPlanning = {
        ...(next.familyPlanning || {}),
        events: [{ id: 'demo_library', title: 'Library visit', date, startTime: '14:00', location: 'Central Library' }],
        meals: [{ date, breakfast: 'Oatmeal & berries', lunch: 'Soup and bread', dinner: 'Sheet-pan chicken' }],
        chores: [
          {
            id: 'demo_dishes',
            title: 'Unload dishwasher',
            assignee: 'Jordan',
            daysOfWeek: [/* @__PURE__ */ new Date(`${date}T12:00:00Z`).getUTCDay()],
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
    next.week.days = (next.week?.days || []).map(secularPlannerDay);
    next.month.days = (next.month?.days || []).map(secularPlannerDay);
    next.month.fastDays = 0;
    next.month.feastDays = 0;
    next.year.upcomingFeasts = [];
    next.week.householdRows = (next.week.householdRows || []).filter((item) => !itemIsFaithSpecific(item));
    next.week.childRows = (next.week.childRows || [])
      .map((row) => ({ ...row, blocks: (row.blocks || []).filter((item) => !itemIsFaithSpecific(item)) }))
      .filter((item) => !itemIsFaithSpecific(item));
    next.week.weeklyAssignmentItems = (next.week.weeklyAssignmentItems || []).filter(
      (item) => !itemIsFaithSpecific(item)
    );
    next.day.householdBlocks = (next.day.householdBlocks || []).filter((item) => !itemIsFaithSpecific(item));
    next.day.childBlocks = (next.day.childBlocks || []).filter((item) => !itemIsFaithSpecific(item));
    next.day.formBlocks = (next.day.formBlocks || []).filter((item) => !itemIsFaithSpecific(item));
    next.term.setupCards = (next.term.setupCards || []).filter((item) => !itemIsFaithSpecific(item));
    next.year.topics = (next.year.topics || []).filter((item) => !itemIsFaithSpecific(item));
    if (marketing) {
      next.week.weeklyAssignmentItems = demoPlannerItems();
      next.week.formRows = [
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
      next.familyPlanning.children = MARKETING_LEARNERS.map((learner) => ({
        ...learner,
        initial: learner.name[0],
        nameDay: '',
      }));
      next.familyPlanning.household = {
        motherName: '',
        fatherName: '',
        parishPatronalFeastName: '',
        parishPatronalFeastDate: '',
      };
      next.familyPlanning.meals = (next.week.days || []).map((day, index) => ({
        date: day.date,
        breakfast: ['Oatmeal & berries', 'Eggs & toast', 'Yogurt & granola'][index % 3],
        lunch: ['Soup and bread', 'Picnic lunch', 'Pasta salad'][index % 3],
        dinner: ['Sheet-pan chicken', 'Taco bowls', 'Vegetable curry'][index % 3],
      }));
      next.familyPlanning.chores = MARKETING_LEARNERS.map((learner, index) => ({
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
      next.attendance.summary.instructionalDays = 42;
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
      next.templates = (next.templates || []).map((template, index) => ({
        ...template,
        child:
          template.audience === 'child' ? MARKETING_LEARNERS[index % MARKETING_LEARNERS.length].name : template.child,
      }));
  }
  if (next.page?.id === 'community') {
    next.resources = (next.resources || []).filter((item) => !itemIsFaithSpecific(item));
    next.categories = ['All', ...new Set(next.resources.map((item) => item.category).filter(truthyLearn1))];
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
      next.household.name = 'The Harper Family';
      next.household.parentName = 'Taylor Harper';
      next.household.homeschoolName = 'Harper Home Academy';
      next.household.method = 'Eclectic';
      next.household.parish = '';
      next.household.parishName = '';
      next.household.patronSaintName = '';
      next.household.patronSaintFeastDate = '';
      next.household.parishPatronalFeastName = '';
      next.household.parishPatronalFeastDate = '';
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
function setLearnViewMode(mode) {
  if (isOdysseyLearnContext()) return;
  try {
    localStorage.setItem(LEARN_VIEW_MODE_KEY, mode === 'classic' ? 'classic' : 'tefa');
  } catch {}
}
function safeExternalUrl(value) {
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
function check(complete) {
  return `<span style="width:23px;height:23px;flex:none;border-radius:50%;border:1.4px solid ${complete ? 'var(--navy)' : 'var(--gold)'};background:${complete ? 'var(--navy)' : 'transparent'};color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;">${complete ? '✓' : ''}</span>`;
}
function completionCheck(item, scope, label) {
  return `<button type="button" data-learn-completion data-completion-id="${html(item.id)}" data-completion-scope="${html(scope)}" aria-pressed="${item.complete ? 'true' : 'false'}" aria-label="${html(`${item.complete ? 'Mark incomplete' : 'Mark complete'}: ${label}`)}" style="width:27px;height:27px;flex:none;border-radius:50%;border:1.5px solid ${item.complete ? 'var(--navy)' : 'var(--gold)'};background:${item.complete ? 'var(--navy)' : 'transparent'};color:#fff;display:grid;place-items:center;font-size:14px;cursor:pointer;padding:0;">${item.complete ? '✓' : ''}</button>`;
}
function bar(value, color = 'var(--gold)') {
  return `<span style="display:block;height:6px;border-radius:99px;background:#e9dfc7;overflow:hidden;"><span style="display:block;height:100%;width:${Number(value) || 0}%;background:${color};border-radius:99px;"></span></span>`;
}
function pageIntroIcon(id) {
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
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.8c.25 2.3.72 2.78 3 3-2.28.25-2.75.72-3 3-.25-2.28-.72-2.75-3-3 2.28-.22 2.75-.7 3-3z" fill="currentColor" stroke="none"/><g fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round">${icons[id] || icons.dashboard}</g></svg>`;
}
function pageIntroMeta(id) {
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
  return meta[id] || meta.dashboard;
}
function pageIntro(vm) {
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
    experience.tefaActive && tefaMeta[vm.page.id]
      ? {
          ...meta,
          ...tefaMeta[vm.page.id],
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
function downloadBlob(filename, blob) {
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
function truthyLearn2(value) {
  return Boolean(value);
}
function printCount() {
  return Number(localStorage.getItem('agapay.learn.printCount') || 0);
}
function setPrintCount(value) {
  localStorage.setItem('agapay.learn.printCount', String(Math.max(0, value)));
}
function learnAccountEmail() {
  try {
    const donor = JSON.parse(localStorage.getItem('agapayDonorProfile') || '{}');
    return localStorage.getItem('agapayDonorEmail') || donor.email || '';
  } catch {
    return localStorage.getItem('agapayDonorEmail') || '';
  }
}
function learnRequestHeaders(extra = {}) {
  if (window.MyAgapayShell?.authHeaders) return window.MyAgapayShell.authHeaders(extra);
  const headers = { Accept: 'application/json', ...extra };
  const token = localStorage.getItem('agapayDonorToken') || '';
  const email = learnAccountEmail();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (email) headers['X-AGAPAY-Donor-Email'] = email;
  return headers;
}
async function openLearnCheckout() {
  if (learnCheckoutOpening) return;
  learnCheckoutOpening = true;
  document.querySelectorAll('[data-dialog-checkout], [data-print-upgrade]').forEach((button) => {
    button.disabled = true;
    button.dataset.previousText = button.textContent || '';
    button.textContent = 'Opening Stripe...';
  });
  try {
    if (window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone === true) {
      window.open('https://agapay.app/learn/pricing?source=myagapay-app', '_blank', 'noopener,noreferrer');
      learnCheckoutOpening = false;
      document.querySelectorAll('[data-dialog-checkout], [data-print-upgrade]').forEach((button) => {
        button.disabled = false;
        button.textContent = button.dataset.previousText || 'Upgrade';
      });
      return;
    }
    const payload = await apiPost('/api/learn/billing/checkout', { plan: 'family', interval: 'year' });
    if (payload.url) {
      window.location.href = payload.url;
      return;
    }
    throw new Error('Stripe checkout did not return a checkout URL.');
  } catch (error) {
    learnCheckoutOpening = false;
    document.querySelectorAll('[data-dialog-checkout], [data-print-upgrade]').forEach((button) => {
      button.disabled = false;
      button.textContent = button.dataset.previousText || 'Upgrade';
    });
    showLearnDialog(
      'Checkout Setup Needed',
      error.message || 'Stripe checkout is not configured yet.',
      [{ label: 'Stripe route', value: '/api/learn/billing/checkout' }],
      { upgrade: false }
    );
  }
}
function showLearnDialog(title, message, rows = [], options = {}) {
  const existing = document.querySelector('[data-learn-dialog]');
  if (existing) existing.remove();
  const dialog = document.createElement('div');
  dialog.dataset.learnDialog = 'true';
  dialog.style.cssText =
    'position:fixed;inset:0;z-index:80;background:rgba(10,20,40,.54);display:flex;align-items:center;justify-content:center;padding:clamp(10px,3vw,24px);';
  const contentHtml = options.contentHtml || '';
  const width = ['520px', '620px', '760px'].includes(options.width) ? options.width : '520px';
  dialog.innerHTML = `<div data-dialog-card style="width:100%;max-height:min(760px,92vh);overflow:auto;background:#f3ead4;border:1px solid #b5942f;border-radius:16px;box-shadow:0 20px 60px rgba(10,20,40,.35);padding:clamp(16px,4vw,24px);color:#14294a;"><div style="display:flex;justify-content:space-between;gap:12px;align-items:start;position:sticky;top:-24px;background:#f3ead4;padding-top:2px;padding-bottom:12px;z-index:2;"><div><h2 data-dialog-title style="font-family:'Cormorant Garamond',serif;font-size:clamp(25px,7vw,31px);line-height:1.02;margin:0;color:#14294a;"></h2><p data-dialog-message style="color:#33405a;line-height:1.45;margin:8px 0 0;"></p></div><button type="button" data-dialog-close aria-label="Close dialog" style="border:1px solid rgba(20,41,74,.18);background:#fffaf0;color:#14294a;border-radius:999px;width:44px;height:44px;display:grid;place-items:center;font-size:24px;line-height:1;cursor:pointer;flex:none;">×</button></div><div data-dialog-content></div><div data-dialog-rows></div><div style="position:sticky;bottom:-24px;background:#f3ead4;display:flex;justify-content:flex-end;gap:10px;margin-top:16px;padding-top:12px;padding-bottom:2px;"><button type="button" data-dialog-close style="border:1px solid rgba(20,41,74,.22);background:#fffaf0;border-radius:10px;padding:12px 18px;min-height:44px;font-family:inherit;color:#14294a;font-weight:700;">Close</button><button type="button" data-dialog-checkout style="border:1px solid #b5942f;background:#14294a;color:#f3ead4;border-radius:9px;padding:10px 16px;font-family:inherit;" hidden>Upgrade</button></div></div>`;
  dialog.querySelector('[data-dialog-card]').style.maxWidth = width;
  dialog.querySelector('[data-dialog-title]').textContent = String(title || '');
  dialog.querySelector('[data-dialog-message]').textContent = String(message || '');
  const content = dialog.querySelector('[data-dialog-content]');
  if (contentHtml) content.innerHTML = contentHtml;
  const rowContainer = dialog.querySelector('[data-dialog-rows]');
  rows.forEach((row) => {
    const item = document.createElement('div');
    item.style.cssText = 'border-top:1px solid rgba(181,148,47,.28);padding:9px 0;';
    const label = document.createElement('small');
    label.style.cssText = 'color:#9b7420;letter-spacing:.12em;text-transform:uppercase;';
    label.textContent = String(row.label || '');
    const value = document.createElement('strong');
    value.style.display = 'block';
    value.textContent = String(row.value || '');
    item.append(label, value);
    rowContainer.append(item);
  });
  dialog.querySelector('[data-dialog-checkout]').hidden = !options.upgrade;
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog || event.target.closest('[data-dialog-close]')) dialog.remove();
    if (event.target.closest('[data-dialog-checkout]')) openLearnCheckout();
  });
  document.body.append(dialog);
}
function showLearnFeedbackDialog() {
  const pageLabel = pageIntroMeta(pageKey).kicker || 'AGAPAY Learn';
  showLearnDialog(
    'Suggest an Improvement',
    'Share what would make AGAPAY Learn clearer, calmer, or more useful for your household.',
    [],
    {
      width: '620px',
      contentHtml: `
      <form data-learn-feedback-form style="border-top:1px solid rgba(181,148,47,.28);padding-top:16px;display:grid;gap:12px;">
        <label style="display:grid;gap:6px;color:#9b7420;font-size:12px;letter-spacing:.12em;text-transform:uppercase;font-weight:800;">Subject
          <input name="subject" value="${html(`${pageLabel} suggestion`)}" maxlength="120" style="border:1px solid rgba(20,41,74,.18);border-radius:10px;padding:11px;background:#fffaf0;color:#14294a;font:inherit;letter-spacing:0;text-transform:none;" />
        </label>
        <label style="display:grid;gap:6px;color:#9b7420;font-size:12px;letter-spacing:.12em;text-transform:uppercase;font-weight:800;">Suggestion
          <textarea name="message" rows="7" maxlength="1600" placeholder="What felt confusing, missing, too many steps, or worth improving?" style="border:1px solid rgba(20,41,74,.18);border-radius:10px;padding:11px;background:#fffaf0;color:#14294a;font:inherit;line-height:1.45;resize:vertical;letter-spacing:0;text-transform:none;"></textarea>
        </label>
        <div data-learn-feedback-status style="min-height:20px;color:#33405a;font-size:13px;"></div>
        <div style="display:flex;justify-content:flex-end;gap:10px;">
          <button type="button" data-dialog-close style="border:1px solid rgba(20,41,74,.22);background:#fffaf0;border-radius:10px;padding:12px 18px;min-height:44px;font-family:inherit;color:#14294a;font-weight:700;">Cancel</button>
          <button type="submit" style="border:1px solid #b5942f;background:#14294a;color:#f3ead4;border-radius:10px;padding:12px 18px;min-height:44px;font-family:inherit;font-weight:800;">Send suggestion</button>
        </div>
      </form>`,
    }
  );
}
function saintStoryDialogHtml(saints = [], unavailableMessage = '') {
  if (unavailableMessage) {
    return `<div style="border-top:1px solid rgba(181,148,47,.28);padding:14px 0;color:#33405a;line-height:1.5;">${html(unavailableMessage)}</div>`;
  }
  if (!saints.length) {
    return `<div style="border-top:1px solid rgba(181,148,47,.28);padding:14px 0;color:#33405a;line-height:1.5;">No saint life is listed for this day yet. Please try again later.</div>`;
  }
  return saints
    .map((saint) => {
      const paragraphs = String(saint.storyText || '')
        .split(/\n{2,}/)
        .map((part) => part.trim())
        .filter(truthyLearn2);
      return `<article style="border-top:1px solid rgba(181,148,47,.28);padding:16px 0;display:grid;gap:8px;">
      <div style="display:flex;gap:12px;align-items:flex-start;">
        ${saint.iconUrl ? `<img src="${html(saint.iconUrl)}" alt="" style="width:64px;height:64px;border-radius:12px;object-fit:cover;border:1px solid rgba(181,148,47,.34);">` : `<span style="width:48px;height:48px;border-radius:50%;background:#14294a;color:#f3ead4;display:grid;place-items:center;flex:none;font-size:23px;">✥</span>`}
        <span><strong style="display:block;font-family:'Cormorant Garamond',serif;font-size:24px;line-height:1.05;color:#14294a;">${html(saint.name || saint.title || 'Saint of the Day')}</strong>${saint.reposeCentury ? `<small style="display:block;margin-top:4px;color:#9b7420;font-weight:800;">${html(saint.reposeCentury)}</small>` : ''}${saint.feastRank ? `<small style="display:block;margin-top:4px;color:#9b7420;letter-spacing:.08em;text-transform:uppercase;">${html(saint.feastRank)}</small>` : ''}</span>
      </div>
      ${paragraphs.length ? paragraphs.map((paragraph) => `<p style="margin:0;color:#33405a;line-height:1.58;">${html(paragraph)}</p>`).join('') : `<p style="margin:0;color:#33405a;line-height:1.58;">A life-story text is not listed for this commemoration.</p>`}
    </article>`;
    })
    .join('');
}
function saintMatchKey(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/\([^)]*\b[1-2]?[0-9]{2,3}\b[^)]*\)/g, '')
    .replace(
      /\b(st|saint|ven|venerable|holy|apostle|evangelist|martyr|great|our holy|righteous|blessed|elder|prophet|hieromartyr|new martyr)\.?\b/g,
      ''
    )
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
function saintMatchScore(a = '', b = '') {
  const aTokens = saintMatchKey(a)
    .split(/\s+/)
    .filter((token) => token.length > 2);
  const bTokens = saintMatchKey(b)
    .split(/\s+/)
    .filter((token) => token.length > 2);
  if (!aTokens.length || !bTokens.length) return 0;
  const aSet = new Set(aTokens);
  const bSet = new Set(bTokens);
  let score = 0;
  aSet.forEach((token) => {
    if (bSet.has(token)) score += 3;
    else if ([...bSet].some((other) => other.includes(token) || token.includes(other))) score += 1;
  });
  return score / Math.max(aSet.size, bSet.size);
}
function saintPrecedence(value = '') {
  const text = String(value || '').toLowerCase();
  if (
    /\b(lord|theotokos|mother of god|cross|resurrection|nativity|theophany|pascha|pentecost|transfiguration|ascension|annunciation|dormition)\b/.test(
      text
    )
  )
    return 100;
  if (/\b(apostle|evangelist|forerunner|baptist)\b/.test(text)) return 90;
  if (/\b(prophet|hierarch|bishop|equal[- ]to[- ]the[- ]apostles)\b/.test(text)) return 80;
  if (/\b(great martyr|new martyr|hieromartyr|martyr|confessor)\b/.test(text)) return 70;
  if (/\b(righteous|ancestor|forefather|foremother)\b/.test(text)) return 60;
  if (/\b(venerable|abbot|abbess|monk|nun|elder|wonderworker)\b/.test(text)) return 50;
  return 40;
}
function orderSaintsByPrecedence(saints = []) {
  return [...saints].sort((a, b) => {
    const aTitle = typeof a === 'string' ? a : a?.name || a?.title || '';
    const bTitle = typeof b === 'string' ? b : b?.name || b?.title || '';
    return saintPrecedence(bTitle) - saintPrecedence(aTitle);
  });
}
function orderSaintsForCard(saints = [], cardTitle = '') {
  const precedenceOrdered = orderSaintsByPrecedence(saints);
  const titleKey = saintMatchKey(cardTitle);
  if (!titleKey || !Array.isArray(precedenceOrdered) || precedenceOrdered.length < 2) return precedenceOrdered;
  let matchedIndex = precedenceOrdered.findIndex((saint) => {
    const nameKey = saintMatchKey(saint?.name || saint?.title || '');
    return nameKey && (nameKey === titleKey || nameKey.includes(titleKey) || titleKey.includes(nameKey));
  });
  if (matchedIndex < 0) {
    let bestScore = 0;
    precedenceOrdered.forEach((saint, index) => {
      const score = Math.max(
        saintMatchScore(cardTitle, saint?.name || ''),
        saintMatchScore(cardTitle, saint?.title || '')
      );
      if (score > bestScore) {
        bestScore = score;
        matchedIndex = index;
      }
    });
    if (bestScore < 0.45) matchedIndex = -1;
  }
  if (matchedIndex <= 0) return precedenceOrdered;
  return [
    precedenceOrdered[matchedIndex],
    ...precedenceOrdered.slice(0, matchedIndex),
    ...precedenceOrdered.slice(matchedIndex + 1),
  ];
}
function forceDisplayedSaintFirst(saints = [], cardTitle = '') {
  const ordered = orderSaintsForCard(saints, cardTitle);
  if (!cardTitle || !Array.isArray(ordered) || !ordered.length) return ordered;
  const first = ordered[0] || {};
  const score = Math.max(saintMatchScore(cardTitle, first.name || ''), saintMatchScore(cardTitle, first.title || ''));
  if (score >= 0.45) return ordered;
  return [
    {
      name: cardTitle,
      title: cardTitle,
      storyText: '',
      sourceLabel: 'Orthocal.info',
    },
    ...ordered,
  ];
}
function saintCardTitle(today = {}) {
  const firstName = today.saintNames?.[0] || '';
  if (firstName) {
    const orderedStories = orderSaintsForCard(today.saintStories || [], firstName);
    return orderedStories?.[0]?.name || orderedStories?.[0]?.title || firstName;
  }
  const firstStoryTitle = today.saintStories?.[0]?.name || today.saintStories?.[0]?.title || '';
  if (firstStoryTitle) return firstStoryTitle;
  const title = String(today.title || '').trim();
  return title || 'Lives of the Saints';
}
function plannerScopeFromQuery() {
  const query = new URLSearchParams(window.location.search);
  const rawScope = query.get('scope') || 'lessons';
  if (rawScope === 'calendar') return 'events';
  if (['recipes', 'groceries', 'pantry'].includes(rawScope)) return 'meals';
  return ['lessons', 'meals', 'chores', 'events'].includes(rawScope) ? rawScope : 'lessons';
}
function mealToolFromQuery() {
  const query = new URLSearchParams(window.location.search);
  const rawScope = query.get('scope') || '';
  const rawTool = query.get('tool') || '';
  if (['recipes', 'groceries', 'pantry'].includes(rawScope)) return rawScope;
  return ['plan', 'recipes', 'groceries', 'pantry'].includes(rawTool) ? rawTool : 'plan';
}
function plannerSidebarSubnav(activePage) {
  if (activePage !== 'planner') return '';
  const activeScope = plannerScopeFromQuery();
  const items = [
    {
      id: 'lessons',
      label: 'Lessons',
      glyph:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l1-4L15.5 5.5l3.5 3.5L8.5 19.5 4 20z"/><path d="M13 7.5l3.5 3.5"/></svg>',
      href: plannerHref({ scope: 'lessons', tool: null }),
    },
    {
      id: 'meals',
      label: 'Meals',
      glyph:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11.5a8 8 0 0 0 16 0"/><path d="M4 11.5h16"/><path d="M12 3.2v5"/></svg>',
      href: plannerHref({ scope: 'meals', tool: 'plan', view: 'week', term: null, termId: null }),
    },
    {
      id: 'chores',
      label: 'Chores',
      glyph:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5 5L20 6"/></svg>',
      href: plannerHref({ scope: 'chores', tool: null, view: 'week', term: null, termId: null }),
    },
    {
      id: 'events',
      label: 'Events',
      glyph:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.3"/><path d="M12 7.2v5l3.3 2"/></svg>',
      href: plannerHref({ scope: 'events', tool: null, view: 'week', term: null, termId: null }),
    },
  ];
  return `<div class="learn-planner-subnav" aria-label="Family Planner sections">
    ${items.map((item) => `<a href="${item.href}" class="${item.id === activeScope ? 'is-active' : ''}" ${item.id === activeScope ? 'aria-current="page"' : ''}><span>${item.glyph}</span>${html(item.label)}</a>`).join('')}
  </div>`;
}
function sidebar(vm) {
  const active = vm.page.id;
  const experience = learnExperience();
  const gcalConfigured = learnGoogleCalendarStatus.loaded
    ? learnGoogleCalendarStatus.configured
    : vm.shell.gcalConfigured;
  const gcalConnected = learnGoogleCalendarStatus.loaded ? learnGoogleCalendarStatus.connected : vm.shell.gcalConnected;
  const navItems = experience.navOrder
    ? experience.navOrder.map((id) => vm.shell.nav.find((item) => item.id === id)).filter(truthyLearn2)
    : vm.shell.nav;
  return `
    <aside class="learn-product-sidebar" data-learn-sidebar>
      <div class="learn-product-sidebar-scroll">
        <a class="learn-product-back" href="${experience.backHref}" aria-label="Back to ${html(experience.backLabel)}">
          <span aria-hidden="true">←</span>
          <strong>${html(experience.backLabel)}</strong>
        </a>
        <div class="learn-product-profile">
          <strong>${html(vm.shell.familyName || 'Faithful Household')}</strong>
          <span>${html(vm.shell.familyMeta || 'AGAPAY Learn')}</span>
          ${experience.activationBadge ? `<small class="learn-odyssey-badge" style="display:inline-block;margin-top:6px;border:1px solid var(--gold);border-radius:999px;padding:2px 9px;font-size:10.5px;letter-spacing:.06em;color:var(--gold);">${html(experience.activationBadge)}</small>` : ''}
          ${marketingPreviewActive() ? `<small class="learn-odyssey-badge" style="display:inline-block;margin:6px 0 0 5px;border:1px solid rgba(255,250,240,.45);border-radius:999px;padding:2px 9px;font-size:10.5px;letter-spacing:.06em;color:#f7e8bd;">Marketing preview</small>` : ''}
        </div>
        <div class="learn-product-label">AGAPAY Learn</div>
        <nav class="learn-product-nav" aria-label="AGAPAY Learn">
        ${navItems
          .map(
            (item) => `
          <a class="${item.id === active ? 'is-active' : ''}" href="${item.href}" ${item.id === active ? 'aria-current="page"' : ''}>
            <span class="learn-product-nav-icon">${item.icon}</span>
            <span>${html(experience.navLabels[item.id] || item.label)}</span>
            ${item.comingSoon ? '<small class="learn-nav-soon">Soon</small>' : ''}
          </a>
          ${item.id === 'planner' ? plannerSidebarSubnav(active) : ''}
        `
          )
          .join('')}
        </nav>
        <button class="learn-product-google-sync" type="button" data-learn-google-sync
          ${gcalConfigured ? '' : 'disabled aria-disabled="true" title="Google Calendar sync is not yet configured"'}
          style="${gcalConfigured ? '' : 'opacity:.45;cursor:not-allowed;'}">
          <span aria-hidden="true">G</span>
          <span><strong>Google Calendar</strong><small>${gcalConnected ? 'Sync connected' : gcalConfigured ? 'Connect family sync' : 'Not yet configured'}</small></span>
        </button>
      </div>
    </aside>
  `;
}
function globalProductNav(activeProduct = 'learn') {
  if (window.MyAgapayShell?.productNav) {
    return window.MyAgapayShell.productNav(activeProduct, 'learn-product-tabbar');
  }
  if (isOdysseyLearnContext()) {
    const active = resolveLearnPageKey();
    const tab = (id, href, label, icon) => `
      <a class="${active === id ? 'is-active' : ''}" href="${html(href)}" ${active === id ? 'aria-current="page"' : ''}>
        ${icon}
        <span>${html(label)}</span>
      </a>`;
    return `
      <nav class="learn-product-tabbar" aria-label="AGAPAY Learn Odyssey navigation">
        ${tab('dashboard', learnSectionHref('dashboard'), 'Today', '<svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></svg>')}
        ${tab('planner', learnSectionHref('planner'), 'Planner', '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4"/><path d="M16 2v4"/><path d="M3 10h18"/></svg>')}
        ${tab('grades', learnSectionHref('grades'), 'Grades', '<svg viewBox="0 0 24 24"><path d="M4 20 10 4h4l6 16"/><path d="M7 14h10"/></svg>')}
        ${tab('print-center', learnSectionHref('print-center'), 'Print', '<svg viewBox="0 0 24 24"><path d="M6 9V3h12v6"/><rect x="4" y="9" width="16" height="8" rx="1.6"/><path d="M6 14h12v8H6z"/></svg>')}
        <a href="/learn/odyssey">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M5 21a7 7 0 0 1 14 0"/></svg>
          <span>Account</span>
        </a>
      </nav>
    `;
  }
  return `
    <nav class="learn-product-tabbar" aria-label="My AGAPAY navigation">
      <a class="${activeProduct === 'home' ? 'is-active' : ''}" href="/myagapay/dashboard">
        <svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></svg>
        <span>My AGAPAY</span>
      </a>
      <a class="${activeProduct === 'giving' ? 'is-active' : ''}" href="/myagapay/giving">
        <svg viewBox="0 0 24 24"><path d="M7 13V7.5a1.5 1.5 0 0 1 3 0V13"/><path d="M10 13V5.5a1.5 1.5 0 0 1 3 0V13"/><path d="M13 13V6.5a1.5 1.5 0 0 1 3 0V14"/><path d="M16 14V10a1.5 1.5 0 0 1 3 0v5c0 4-2.6 6-6.3 6H12a7 7 0 0 1-7-7v-1.5a1.5 1.5 0 0 1 2 0V13"/></svg>
        <span>Giving</span>
      </a>
      <a class="${activeProduct === 'learn' ? 'is-active' : ''}" href="${html(learnSectionHref('dashboard'))}">
        <svg viewBox="0 0 24 24"><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H20v17H7.5A3.5 3.5 0 0 0 4 22z"/><path d="M4 5.5V22"/><path d="M8 6h8"/><path d="M8 10h7"/></svg>
        <span>Learn</span>
      </a>
      <a href="/marketplace">
        <svg viewBox="0 0 24 24"><path d="M6 8h12l-1 13H7z"/><path d="M9 8a3 3 0 0 1 6 0"/><path d="M9 13h6"/></svg>
        <span>Market</span>
      </a>
      <a href="/myagapay/account">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M5 21a7 7 0 0 1 14 0"/></svg>
        <span>Account</span>
      </a>
    </nav>
  `;
}
function topbar(vm) {
  const experience = learnExperience();
  const title = vm.page.ornament
    ? `<span style="color:#c9a227;font-size:22px;margin:0 14px;">❦</span>${html(vm.page.title)}<span style="color:#c9a227;font-size:22px;margin:0 14px;">❦</span>`
    : html(vm.page.title);
  return `
    <header class="learn-product-topbar">
      <button class="learn-menu-button" type="button" data-learn-menu-toggle aria-label="Open Learn navigation" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
      <a class="learn-mobile-brand learn-utility-brand" href="${experience.backHref}" aria-label="Open ${html(experience.backLabel)}">
        <img src="/mark.png" alt="" />
        <span><strong>${html(experience.brandName)}</strong><small>${html(experience.brandTagline)}</small></span>
      </a>
      <div class="learn-page-title-utility" style="flex:1;min-width:0;line-height:1.1;">
        <div style="color:var(--gold);font-size:11px;letter-spacing:.14em;font-weight:700;text-transform:uppercase;">${html(experience.brandName)} · ${html(experience.brandTagline)}</div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:38px;font-weight:600;color:var(--ink);display:flex;align-items:center;">${title}</div>
        ${vm.page.subtitle ? `<div style="font-size:14.5px;color:var(--muted);margin-top:2px;">${html(vm.page.subtitle)}</div>` : ''}
      </div>
      <div class="learn-utility-actions" style="display:flex;align-items:center;gap:18px;flex:none;">
        <button class="learn-quick-action learn-feedback-action" type="button" data-learn-feedback-open>Suggest</button>
        <a class="learn-quick-action" href="${learnSectionHref('onboarding', 'simple=1')}">Quick Setup</a>
        <div class="learn-account-menu" data-learn-account-menu>
          <button class="learn-account-utility myagapay-menu-trigger" type="button" data-learn-account-toggle aria-haspopup="true" aria-expanded="false" aria-label="Open My AGAPAY menu">
            <span class="myagapay-menu-icon" aria-hidden="true"><span></span><span></span><span></span></span>
          </button>
          <div class="learn-account-dropdown" role="menu" hidden>
            <a href="${experience.odyssey ? learnSectionHref('onboarding') : '/myagapay/account'}" role="menuitem">Account Settings</a>
            <button type="button" data-learn-logout role="menuitem">Log out</button>
          </div>
        </div>
      </div>
    </header>
  `;
}
function shell(vm, body) {
  return `
    <div class="learn-product-shell learn-screen-${html(vm.page.id)}" style="${cssVars()};">
      ${sidebar(vm)}
      <div class="learn-sidebar-scrim" data-learn-sidebar-scrim></div>
      <main class="learn-product-main scroll">
        ${topbar(vm)}
        <div class="learn-product-content">${pageIntro(vm)}${body}</div>
        ${globalProductNav('learn')}
      </main>
    </div>
  `;
}
function renderGraceModePanel(vm) {
  const currentMode = vm.graceMode?.active ? vm.graceMode.mode || 'light' : 'full';
  const modes = [
    {
      id: 'full',
      title: 'Full Rhythm',
      subtitle: 'Keep the complete plan for an ordinary, steady week.',
      detail: 'Every scheduled subject, book, and enrichment block stays at its planned time.',
    },
    {
      id: 'light',
      title: 'Medium Day',
      subtitle: 'Cap the day without shrinking the whole plan.',
      detail:
        'Each child keeps up to 4 ranked subjects. Household enrichment keeps up to 3 blocks. Lower-ranked work moves to reserve.',
    },
    {
      id: 'minimum viable',
      title: 'Light Day',
      subtitle: 'A faithful tiny plan for hard days.',
      detail:
        'Each child keeps up to 2 top-ranked subjects. Household enrichment keeps 1 block. Kept work becomes a short touchpoint.',
    },
  ];
  return `
    <section data-grace-mode-panel style="background:linear-gradient(135deg,#fffaf0 0%,#f7edd6 100%);border:1px solid rgba(181,148,47,.34);border-radius:16px;padding:18px 20px;box-shadow:0 1px 3px rgba(20,40,70,.05);">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:14px;flex-wrap:wrap;">
        <div>
          <div class="learn-eyebrow">Grace Mode</div>
          <h2 style="font-family:'Cormorant Garamond',serif;font-size:30px;line-height:1.05;margin:4px 0 4px;color:var(--ink);">Choose today's household rhythm.</h2>
          <p style="margin:0;color:#4c5870;line-height:1.45;max-width:720px;">Adjust the day without abandoning the plan. AGAPAY keeps what matters most and gently moves the rest into reserve.</p>
        </div>
        <span data-grace-mode-status style="color:var(--muted);font-size:13px;min-height:20px;"></span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,minmax(160px,1fr));gap:10px;">
        ${modes
          .map((mode) => {
            const active = mode.id === currentMode;
            return `<button type="button" data-grace-mode="${html(mode.id)}" aria-pressed="${active ? 'true' : 'false'}" style="text-align:left;border:1px solid ${active ? 'var(--gold)' : 'var(--line)'};border-radius:13px;background:${active ? 'var(--navy)' : 'rgba(255,255,255,.58)'};color:${active ? '#fffaf0' : 'var(--ink)'};padding:13px;cursor:pointer;font-family:inherit;min-height:146px;box-shadow:${active ? '0 10px 24px rgba(6,21,34,.16)' : 'none'};">
            <span style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
              <strong style="font-family:'Cormorant Garamond',serif;font-size:22px;line-height:1;">${html(mode.title)}</strong>
              <span style="width:22px;height:22px;border-radius:50%;border:1px solid ${active ? 'rgba(255,250,240,.65)' : 'var(--gold)'};display:grid;place-items:center;color:${active ? 'var(--gold2)' : 'var(--gold)'};">${active ? '✓' : ''}</span>
            </span>
            <span style="display:block;font-weight:700;font-size:13px;line-height:1.3;margin-bottom:7px;color:${active ? '#f5df9d' : 'var(--gold)'};">${html(mode.subtitle)}</span>
            <span style="display:block;font-size:13px;line-height:1.38;color:${active ? 'rgba(255,250,240,.84)' : '#4c5870'};">${html(mode.detail)}</span>
          </button>`;
          })
          .join('')}
      </div>
    </section>
  `;
}
function truthyLearn3(value) {
  return Boolean(value);
}
function renderTermProgressPanel(vm) {
  const term = vm.termProgress || {};
  const progress = Number(term.percent || 0);
  return `
    <section style="background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:18px 20px;display:grid;grid-template-columns:minmax(220px,.8fr) 1fr;gap:18px;align-items:center;box-shadow:0 1px 3px rgba(20,40,70,.04);">
      <div>
        <div class="learn-eyebrow">Term at a Glance</div>
        <h2 style="font-family:'Cormorant Garamond',serif;font-size:28px;line-height:1.05;margin:5px 0 4px;color:var(--ink);">${html(term.label || 'Current Term')}</h2>
        <p style="margin:0;color:var(--muted);line-height:1.4;">${term.currentWeek && term.totalWeeks ? `Week ${html(term.currentWeek)} of ${html(term.totalWeeks)}` : 'Set term dates in Setup'}${term.dateRange ? ` · ${html(term.dateRange)}` : ''}</p>
        ${term.description ? `<p style="margin:10px 0 0;font-size:14px;line-height:1.55;color:var(--ink);">${html(term.description)}</p>` : ''}
      </div>
      <div>
        <div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:8px;color:#33405a;font-size:13px;"><span>Term progress</span><strong>${html(progress)}%</strong></div>
        ${bar(progress, 'var(--gold)')}
      </div>
    </section>
  `;
}
function renderTodayLearnContext(vm) {
  const term = vm.termProgress || {};
  const progress = Number(term.percent || 0);
  const currentMode = vm.graceMode?.active ? vm.graceMode.mode || 'light' : 'full';
  const modes = [
    { id: 'full', title: 'Full', detail: 'Run every scheduled item as planned.' },
    { id: 'light', title: 'Medium', detail: 'Keep up to 4 ranked child subjects; reserve the rest.' },
    { id: 'minimum viable', title: 'Light', detail: 'Keep up to 2 top-ranked child subjects as short touchpoints.' },
  ];
  return `
    <div style="display:grid;grid-template-columns:repeat(2,minmax(220px,1fr));gap:12px;margin-top:18px;width:100%;">
      <section style="border:1px solid var(--line);border-radius:14px;background:rgba(255,252,245,.72);padding:14px;">
        <div style="color:var(--gold);font-size:11px;letter-spacing:.16em;font-weight:800;text-transform:uppercase;">Term at a Glance</div>
        <h3 style="font-family:'Cormorant Garamond',serif;font-size:25px;line-height:1.05;margin:5px 0 4px;color:var(--ink);">${html(term.label || 'Current Term')}</h3>
        <p style="margin:0 0 10px;color:var(--muted);line-height:1.35;">${term.currentWeek && term.totalWeeks ? `Week ${html(term.currentWeek)} of ${html(term.totalWeeks)}` : 'Set term dates in Setup'}${term.dateRange ? ` · ${html(term.dateRange)}` : ''}</p>
        ${term.description ? `<p style="margin:-2px 0 10px;font-size:13px;line-height:1.5;color:var(--ink);">${html(term.description)}</p>` : ''}
        <div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:7px;color:#33405a;font-size:13px;"><span>Term progress</span><strong>${html(progress)}%</strong></div>
        ${bar(progress, 'var(--gold)')}
      </section>
      <section style="border:1px solid rgba(181,148,47,.34);border-radius:14px;background:linear-gradient(135deg,#fffaf0 0%,#f7edd6 100%);padding:14px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px;">
          <span><span style="display:block;color:var(--gold);font-size:11px;letter-spacing:.16em;font-weight:800;text-transform:uppercase;">Grace Mode</span><strong style="font-family:'Cormorant Garamond',serif;font-size:25px;">Today’s rhythm</strong></span>
          <span data-grace-mode-status style="color:var(--muted);font-size:12px;min-height:18px;">${vm.graceMode?.active ? '' : 'Full plan · no Grace Mode'}</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,minmax(100px,1fr));gap:8px;">
          ${modes
            .map((mode) => {
              const active = mode.id === currentMode;
              return `<button type="button" data-grace-mode="${html(mode.id)}" aria-pressed="${active ? 'true' : 'false'}" title="${html(mode.detail)}" style="border:1px solid ${active ? 'var(--gold)' : 'var(--line)'};border-radius:11px;background:${active ? 'var(--navy)' : 'rgba(255,255,255,.62)'};color:${active ? '#fffaf0' : 'var(--ink)'};padding:10px;text-align:left;cursor:pointer;font-family:inherit;min-height:84px;"><strong style="display:block;font-family:'Cormorant Garamond',serif;font-size:20px;line-height:1;">${html(mode.title)}</strong><small style="display:block;margin-top:5px;line-height:1.25;color:${active ? 'rgba(255,250,240,.82)' : 'var(--muted)'};">${html(mode.detail)}</small></button>`;
            })
            .join('')}
        </div>
        <button type="button" data-grace-mode="full" style="margin-top:8px;width:100%;border:1px solid ${currentMode === 'full' ? 'var(--navy)' : 'var(--line)'};border-radius:9px;background:${currentMode === 'full' ? 'rgba(6,21,34,.06)' : 'transparent'};color:var(--muted);padding:7px 10px;text-align:center;cursor:pointer;font-family:inherit;font-size:13px;">
          ${currentMode === 'full' ? '✓ Full plan — no Grace Mode active' : 'Return to full plan'}
        </button>
      </section>
    </div>
  `;
}
function weekAssignmentStorageKey(vm, explicitWeekKey = '') {
  const itemIds = (vm.week?.weeklyAssignmentItems || []).map((item) => item.id).join(',');
  const weekKey =
    explicitWeekKey || [vm.week?.days?.[0]?.date, vm.week?.days?.[6]?.date].filter(truthyLearn3).join('_') || 'week';
  return `agapay.learn.weekAssignments.${weekKey}.${itemIds}`;
}
function isLearnWeekAssignment(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  for (const field of ['zone', 'sourceId', 'note', 'status']) {
    if (field in value && typeof Reflect.get(value, field) !== 'string') return false;
  }
  for (const field of ['completed', 'autoPlaced']) {
    if (field in value && typeof Reflect.get(value, field) !== 'boolean') return false;
  }
  return true;
}
function parseLearnWeekAssignments(raw) {
  const state = {};
  Object.setPrototypeOf(state, null);
  if (raw === null) return { state, valid: true };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { state, valid: false };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return { state, valid: false };
  let valid = true;
  for (const [key, value] of Object.entries(parsed)) {
    if (isLearnWeekAssignment(value)) state[key] = value;
    else valid = false;
  }
  return { state, valid };
}
function readWeekAssignmentState(vm, explicitWeekKey = '') {
  try {
    return parseLearnWeekAssignments(localStorage.getItem(weekAssignmentStorageKey(vm, explicitWeekKey))).state;
  } catch {
    return parseLearnWeekAssignments(null).state;
  }
}
function designedAssignmentsForDate(vm, date) {
  if (!date) return [];
  const items = vm.week?.weeklyAssignmentItems || [];
  if (marketingPreviewActive()) {
    const weekday = /* @__PURE__ */ new Date(`${date}T12:00:00Z`).getUTCDay();
    return items
      .filter((item) => ['planned', 'reduced', 'completed'].includes(item.statuses?.[weekday]))
      .slice(0, 6)
      .map((item) => ({ ...item, note: item.sub || '', sub: item.sub || '' }));
  }
  const state = readWeekAssignmentState(vm);
  return items
    .map((item) => {
      const saved = state[item.id];
      return saved?.zone === date
        ? {
            ...item,
            note: saved.note || '',
            sub: saved.note || item.sub || '',
          }
        : null;
    })
    .filter(truthyLearn3);
}
function timeLabel(value = '') {
  return value ? value : 'All day';
}
function eventsForDate(vm, date) {
  return expandFamilyEvents(vm.familyPlanning?.events || [], [date]).get(date) || [];
}
function mealForDate(vm, date) {
  return (vm.familyPlanning?.meals || []).find((meal) => meal.date === date) || null;
}
function choresForDate(vm, date) {
  return (vm.familyPlanning?.chores || []).filter((chore) =>
    choreDueOnDay(chore, {
      date,
      long: plannerDayLabel(date).long,
    })
  );
}
function renderDesignedLessonList(assignments, emptyMessage) {
  return assignments.length
    ? `<div class="learn-designed-lesson-list">${assignments
        .map(
          (item) => `
        <article class="learn-designed-lesson-card" style="border-left-color:${html(item.color || 'var(--gold)')};">
          <strong>${html(item.title)}</strong>
          ${item.sub ? `<small>${html(item.sub)}</small>` : ''}
          ${item.note && item.note !== item.sub ? `<em>${html(item.note)}</em>` : ''}
        </article>`
        )
        .join('')}</div>`
    : emptyState(emptyMessage);
}
function renderDashboardDesignedLessons(vm) {
  const date = vm.todayInChurch?.civilDate || '';
  const assignments = designedAssignmentsForDate(vm, date);
  const dayHref = learnSectionHref('planner', `view=day&date=${encodeURIComponent(date)}`);
  return `
    <div class="learn-card">
      <div class="learn-section-head">
        <span style="display:flex;align-items:center;gap:9px;"><span style="color:var(--gold);font-size:16px;">▦</span><span style="color:var(--gold);font-size:12px;letter-spacing:.18em;font-weight:600;">TODAY'S DESIGNED LESSONS</span></span>
        <a href="${html(dayHref)}" style="color:var(--gold);font-size:12px;font-weight:800;text-decoration:none;">Open day</a>
      </div>
      ${renderDesignedLessonList(assignments, "Drag subjects into this day from the Week view to seed today's Dashboard lessons.")}
    </div>
  `;
}
function renderDashboardFamilyCards(vm) {
  const date = vm.todayInChurch?.civilDate || '';
  const todayEvents = eventsForDate(vm, date);
  const upcomingDates = nextSevenDates(date).concat(
    Array.from({ length: 84 }, (_, index) => {
      const parsed = /* @__PURE__ */ new Date(`${date}T00:00:00.000Z`);
      parsed.setUTCDate(parsed.getUTCDate() + index + 8);
      return parsed.toISOString().slice(0, 10);
    })
  );
  const upcomingEvents = [...expandFamilyEvents(vm.familyPlanning?.events || [], upcomingDates).entries()]
    .flatMap(([eventDate, events]) => events.map((event) => ({ ...event, occurrenceDate: eventDate })))
    .filter((event) => event.occurrenceDate >= date)
    .sort((a, b) =>
      `${a.occurrenceDate} ${a.startTime || ''}`.localeCompare(`${b.occurrenceDate} ${b.startTime || ''}`)
    )
    .slice(0, 4);
  const meal = mealForDate(vm, date);
  const chores = choresForDate(vm, date).slice(0, 6);
  const appointmentItems = todayEvents.length ? todayEvents : upcomingEvents;
  const appointmentTitle = todayEvents.length ? "Today's Appointments" : 'Upcoming Appointments';
  return `
    <div class="learn-dashboard-family-grid">
      <section class="learn-dashboard-family-card">
        <div><small>APPOINTMENTS</small><h3>${html(appointmentTitle)}</h3></div>
        ${
          appointmentItems.length
            ? `<div class="learn-dashboard-mini-list">${appointmentItems
                .map((event) => {
                  const eventDate = event.occurrenceDate || event.date;
                  return `<span><strong>${html(event.title || 'Appointment')}</strong><small>${html(eventDate === date ? timeLabel(event.startTime) : `${eventDate} · ${timeLabel(event.startTime)}`)}${event.location ? ` · ${html(event.location)}` : ''}${eventRecurrence(event.recurrence) !== 'none' ? ` · ${html(eventRecurrenceLabel(event.recurrence))}` : ''}</small></span>`;
                })
                .join('')}</div>`
            : emptyState('Add appointments in Planner > Events.')
        }
      </section>
      <section class="learn-dashboard-family-card">
        <div><small>MEALS</small><h3>Meal Plan</h3></div>
        ${
          meal
            ? `<div class="learn-dashboard-mini-list">
          <span><strong>Breakfast</strong><small>${html(meal.breakfast || 'Open')}</small></span>
          <span><strong>Lunch</strong><small>${html(meal.lunch || 'Open')}</small></span>
          <span><strong>Dinner</strong><small>${html(meal.dinner || 'Open')}</small></span>
        </div>`
            : emptyState("Plan today's meals in Planner > Meals.")
        }
      </section>
      <section class="learn-dashboard-family-card">
        <div><small>CHORES</small><h3>Household Chores</h3></div>
        ${chores.length ? `<div class="learn-dashboard-mini-list">${chores.map((chore) => `<span><strong>${html(chore.title || 'Chore')}</strong><small>${html([chore.assignee, choreScheduleLabel(chore), chore.notes].filter(truthyLearn3).join(' · '))}</small></span>`).join('')}</div>` : emptyState('Add chores in Planner > Chores.')}
      </section>
    </div>
  `;
}
function renderTefaViewToggleBanner(experience) {
  const tefa = experience.viewMode === 'tefa';
  if (tefa) {
    return `
      <div data-tefa-view-toggle-row style="display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;background:linear-gradient(135deg,#fffaf0 0%,#f7edd6 100%);border:1px solid rgba(181,148,47,.34);border-radius:14px;padding:14px 18px;">
        <div style="min-width:0;">
          <div style="color:var(--gold);font-size:10.5px;letter-spacing:.14em;font-weight:800;text-transform:uppercase;">Odyssey marketplace edition</div>
          <strong style="display:block;font-family:'Cormorant Garamond',serif;font-size:21px;line-height:1.1;color:var(--ink);">Built for flexible Texas homeschool planning</strong>
          <span style="display:block;font-size:12.5px;color:var(--muted);margin-top:2px;">Lessons, attendance, grades, household planning, and printable records in one calm workspace.</span>
        </div>
        <span style="display:inline-flex;align-items:center;border:1px solid var(--gold);background:var(--paper2);border-radius:999px;padding:7px 12px;font-size:12px;font-weight:800;color:var(--navy);">TEFA Edition</span>
      </div>`;
  }
  return `
    <div data-tefa-view-toggle-row style="display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;background:${tefa ? 'linear-gradient(135deg,#fffaf0 0%,#f7edd6 100%)' : 'var(--paper)'};border:1px solid ${tefa ? 'rgba(181,148,47,.34)' : 'var(--line)'};border-radius:14px;padding:14px 18px;">
      <div style="min-width:0;">
        <div style="color:var(--gold);font-size:10.5px;letter-spacing:.14em;font-weight:800;text-transform:uppercase;">Dashboard view</div>
        <strong style="display:block;font-family:'Cormorant Garamond',serif;font-size:21px;line-height:1.1;color:var(--ink);">${tefa ? 'TEFA Edition' : 'Classic AGAPAY Learn'}</strong>
        <span style="display:block;font-size:12.5px;color:var(--muted);margin-top:2px;">${tefa ? "Today's lessons, planner, attendance, grades, and print tools lead the dashboard." : 'The full Orthodox household dashboard, with Church Rhythm leading the day.'}</span>
      </div>
      <button type="button" data-tefa-view-toggle role="switch" aria-checked="${tefa ? 'true' : 'false'}" aria-label="Switch to ${tefa ? 'the classic AGAPAY Learn dashboard' : 'TEFA Edition'}" style="display:flex;align-items:center;gap:9px;flex:none;border:1px solid var(--gold);background:var(--paper2);border-radius:999px;padding:7px 12px;cursor:pointer;font-family:inherit;">
        <span style="font-size:12px;font-weight:700;color:${tefa ? 'var(--muted)' : 'var(--navy)'};">Classic</span>
        <span aria-hidden="true" style="position:relative;width:40px;height:23px;border-radius:999px;background:${tefa ? 'var(--gold)' : 'var(--line)'};display:inline-flex;align-items:center;padding:2px;transition:background .15s;">
          <span style="width:19px;height:19px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.3);transform:translateX(${tefa ? '17px' : '0'});transition:transform .15s;"></span>
        </span>
        <span style="font-size:12px;font-weight:700;color:${tefa ? 'var(--navy)' : 'var(--muted)'};">TEFA</span>
      </button>
    </div>
  `;
}
function renderDashboard(vm) {
  const today = vm.todayInChurch;
  const todayArtworkUrl = today.iconUrl || '/images/learn/today-in-the-church.jpg';
  const displayedSaintTitle = saintCardTitle(today);
  const orderedSaintStories = forceDisplayedSaintFirst(today.saintStories || [], displayedSaintTitle);
  const churchIconPanel = `<div class="learn-today-art-panel"><img src="${html(todayArtworkUrl)}" alt="Illustrated Orthodox homeschool planner open to today" loading="lazy"></div>`;
  const saintPreview =
    displayedSaintTitle && displayedSaintTitle !== 'Lives of the Saints'
      ? `${today.saintNames?.length > 1 ? `${today.saintNames.length} commemorations` : 'Open the life'} for today.`
      : today.saintNames?.length
        ? today.saintNames.slice(0, 2).join('; ') +
          (today.saintNames.length > 2 ? ` + ${today.saintNames.length - 2} more` : '')
        : 'Open the lives commemorated today.';
  const saintIcon = orderedSaintStories?.find((saint) => saint.iconUrl)?.iconUrl || '';
  const displayedSaintKey = saintMatchKey(displayedSaintTitle);
  const displayedSaintStory = orderedSaintStories?.find((saint) => {
    const key = saintMatchKey(saint?.name || saint?.title || '');
    return (
      key &&
      displayedSaintKey &&
      (key === displayedSaintKey || key.includes(displayedSaintKey) || displayedSaintKey.includes(key))
    );
  });
  const saintCentury =
    displayedSaintStory?.reposeCentury ||
    orderedSaintStories?.find((saint) => saint.reposeCentury)?.reposeCentury ||
    '';
  const saintCard = `<button type="button" data-saint-of-day data-saint-title="${html(displayedSaintTitle)}" data-date="${html(today.civilDate)}" data-calendar="${html(today.calendarType)}" style="margin-top:14px;width:100%;text-align:left;border:1px solid rgba(181,148,47,.34);background:linear-gradient(135deg,#fffaf0,#f7edd6);border-radius:13px;padding:13px;display:flex;gap:12px;align-items:center;cursor:pointer;font-family:inherit;color:var(--ink);box-shadow:0 1px 2px rgba(20,40,70,.04);">
    ${saintIcon ? `<img src="${html(saintIcon)}" alt="" style="width:52px;height:52px;border-radius:12px;object-fit:cover;border:1px solid var(--goldsoft);flex:none;">` : `<span style="width:48px;height:48px;border-radius:50%;background:var(--navy);color:#f3ead4;display:grid;place-items:center;flex:none;font-size:23px;">✥</span>`}
    <span style="min-width:0;line-height:1.25;"><span style="display:block;color:var(--gold);font-size:10.5px;letter-spacing:.13em;font-weight:800;text-transform:uppercase;">Saint of the Day</span><strong style="display:block;font-family:'Cormorant Garamond',serif;font-size:22px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${html(displayedSaintTitle)}</strong>${saintCentury ? `<span style="display:block;color:var(--gold);font-size:12px;font-weight:800;margin:2px 0 1px;">${html(saintCentury)}</span>` : ''}<small style="display:block;color:var(--muted);line-height:1.35;">${html(saintPreview)}</small></span>
    <span style="margin-left:auto;color:var(--gold);font-size:20px;flex:none;">→</span>
  </button>`;
  const hasReadings = today.epistleRef || today.gospelRef;
  const readingsCallout = hasReadings
    ? `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px;">
      <div style="background:linear-gradient(135deg,#fffbf0,#f7edd6);border:1px solid rgba(181,148,47,.28);border-radius:11px;padding:12px;">
        <div style="display:flex;align-items:center;gap:7px;margin-bottom:5px;">
          <span style="color:var(--gold);font-size:14px;">☰</span>
          <span style="color:var(--gold);font-size:10px;letter-spacing:.13em;font-weight:800;text-transform:uppercase;">Epistle</span>
        </div>
        <strong style="font-family:'Cormorant Garamond',serif;font-size:18px;color:var(--ink);line-height:1.1;">${html(today.epistleRef)}</strong>
      </div>
      <div style="background:linear-gradient(135deg,#fffbf0,#f7edd6);border:1px solid rgba(181,148,47,.28);border-radius:11px;padding:12px;">
        <div style="display:flex;align-items:center;gap:7px;margin-bottom:5px;">
          <span style="color:var(--gold);font-size:14px;">☩</span>
          <span style="color:var(--gold);font-size:10px;letter-spacing:.13em;font-weight:800;text-transform:uppercase;">Gospel</span>
        </div>
        <strong style="font-family:'Cormorant Garamond',serif;font-size:18px;color:var(--ink);line-height:1.1;">${html(today.gospelRef)}</strong>
      </div>
    </div>`
    : '';
  const rhythmsGrid = vm.churchRhythms.length
    ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:1px;background:var(--line);border-radius:10px;overflow:hidden;">
        ${vm.churchRhythms
          .map(
            (r, i) => `
          <div style="display:flex;align-items:center;gap:12px;padding:14px 16px;background:var(--paper);">
            ${completionCheck(r, 'daily', r.label)}
            <span style="line-height:1.25;min-width:0;">
              <span style="display:block;font-size:15px;color:var(--ink);font-weight:500;">${html(r.label)}</span>
              ${r.sub ? `<span style="display:block;font-size:12px;color:var(--muted);">${html(r.sub)}</span>` : ''}
            </span>
          </div>`
          )
          .join('')}
       </div>`
    : emptyState('Add church rhythms in Setup — Morning Prayer, Readings, Saint of the Day.');
  const householdGroups = vm.householdStream.reduce((groups, item) => {
    const label = item.group || 'Everyone Together';
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(item);
    return groups;
  }, /* @__PURE__ */ new Map());
  const togetherThisWeek = householdGroups.size
    ? [...householdGroups.entries()]
        .map(
          ([group, items]) => `
        <section>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin:2px 0 8px;">
            <strong style="color:var(--ink);font-family:'Cormorant Garamond',serif;font-size:18px;">${html(group)}</strong>
            <span style="font-size:11px;color:var(--muted);">${items.filter((item) => item.complete).length}/${items.length} complete</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:9px;">
            ${items
              .map(
                (item) => `
              <div style="display:flex;align-items:center;gap:12px;background:var(--paper2);border:1px solid var(--line);border-radius:10px;padding:11px 13px;">
                <span style="width:38px;height:38px;border-radius:50%;background:#f1e6c9;color:var(--gold);display:flex;align-items:center;justify-content:center;font-size:18px;flex:none;">${html(item.icon)}</span>
                <a href="${html(item.href)}" style="flex:1;min-width:0;line-height:1.2;text-decoration:none;color:inherit;">
                  <span style="display:block;font-weight:600;font-size:15.5px;color:var(--ink);">${html(item.title)}</span>
                  <span style="display:block;font-size:12.5px;color:var(--muted);">${html(item.sub)}</span>
                </a>
                <span style="color:var(--muted);font-size:13px;flex:none;">${html(item.time)}</span>
                ${completionCheck(item, 'weekly', item.title)}
              </div>`
              )
              .join('')}
          </div>
        </section>`
        )
        .join('')
    : `<div style="color:var(--muted);font-style:italic;">Run Quick Setup or add Enrichment in Advanced Setup to build this week together.</div>`;
  const weekStatsStrip = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;">
      ${vm.thisWeek
        .map(
          (w) => `
        <div style="background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:14px;display:flex;align-items:center;gap:12px;box-shadow:0 1px 3px rgba(20,40,70,.04);">
          <span style="width:40px;height:40px;border-radius:50%;background:${w.color};color:#f3ead4;display:flex;align-items:center;justify-content:center;font-size:18px;flex:none;">${html(w.icon)}</span>
          <div style="min-width:0;">
            <span style="display:block;font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:600;color:var(--ink);line-height:1;">${html(w.big)}</span>
            <span style="display:block;font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${html(w.label)}</span>
            <span style="display:block;font-size:11px;color:var(--gold);font-weight:600;">${html(w.sub)}</span>
          </div>
        </div>`
        )
        .join('')}
      <a href="${html(learnSectionHref('planner'))}" style="background:var(--navy);border:1px solid var(--gold);border-radius:12px;padding:14px;display:flex;align-items:center;justify-content:center;gap:8px;font-size:14px;color:#fffaf0;font-weight:700;text-decoration:none;box-shadow:0 1px 3px rgba(20,40,70,.04);">
        Open Planner <span style="color:var(--gold);">→</span>
      </a>
    </div>`;
  const childColumnsGrid = vm.childColumns.length
    ? vm.childColumns
        .map(
          (col) => `
        <article style="background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:14px;box-shadow:0 1px 3px rgba(20,40,70,.04);">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--line);">
            <span style="width:34px;height:34px;border-radius:50%;background:${col.color};color:#f3ead4;display:flex;align-items:center;justify-content:center;font-size:16px;flex:none;">${html(col.initial)}</span>
            <div style="line-height:1.15;min-width:0;">
              <span style="display:block;font-size:10px;letter-spacing:.12em;color:var(--gold);font-weight:600;">${html(col.tag)}</span>
              <span style="display:block;font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${html(col.name)} <span class="learn-muted-sm">• Age ${html(col.age)}</span></span>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            ${col.tasks
              .map(
                (t) => `
              <div style="display:flex;align-items:center;gap:9px;background:var(--paper2);border:1px solid var(--line);border-radius:9px;padding:9px 10px;">
                <a href="${html(learnSectionHref('planner'))}" style="flex:1;min-width:0;line-height:1.15;text-decoration:none;color:inherit;">
                  <span style="display:block;font-weight:600;font-size:14px;color:var(--ink);">${html(t.title)}</span>
                  <span style="display:block;font-size:11.5px;color:var(--muted);">${html(t.sub)}</span>
                </a>
                <span style="color:var(--muted);font-size:11.5px;flex:none;">${html(t.time)}</span>
                ${completionCheck(t, 'weekly', `${col.name}: ${t.title}`)}
              </div>`
              )
              .join('')}
          </div>
        </article>`
        )
        .join('')
    : `<div style="grid-column:1/-1;background:var(--paper);border:1px dashed var(--line);border-radius:14px;padding:28px;text-align:center;">
         <div style="color:var(--gold);font-size:28px;margin-bottom:10px;">◎</div>
         <strong style="font-family:'Cormorant Garamond',serif;font-size:22px;color:var(--ink);display:block;margin-bottom:6px;">No children in the planner yet</strong>
         <p style="color:var(--muted);margin:0 0 16px;line-height:1.5;">Add children in Setup to see their individual work here each week.</p>
         <a href="${html(learnSectionHref('onboarding'))}" style="display:inline-flex;align-items:center;gap:8px;background:var(--navy);color:#fff;border:1px solid var(--gold);border-radius:10px;padding:10px 18px;text-decoration:none;font-weight:700;font-size:14px;">Go to Setup →</a>
       </div>`;
  const experience = learnExperience();
  const churchCollapsed =
    experience.odyssey &&
    (() => {
      try {
        return localStorage.getItem('agapay.learn.churchCardMinimized') === 'true';
      } catch {
        return experience.tefaActive;
      }
    })();
  const churchSectionBody = `
      <!-- Today in the Church -->
      <div style="background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:22px;display:flex;gap:24px;box-shadow:0 1px 3px rgba(20,40,70,.04);flex-wrap:wrap;">
        ${churchIconPanel}
        <div class="learn-today-main">
          <div style="color:var(--gold);font-size:12px;letter-spacing:.18em;font-weight:600;">${html(today.kicker)}</div>
          <div style="font-family:'Cormorant Garamond',serif;font-size:30px;font-weight:600;color:var(--ink);line-height:1.1;">${html(displayedSaintTitle)}</div>
          <div class="learn-today-meta-grid">
            <div style="display:flex;gap:10px;"><span style="color:var(--gold);font-size:17px;margin-top:2px;">▣</span><span><span style="display:block;color:var(--gold);font-size:10.5px;letter-spacing:.13em;font-weight:600;">LITURGICAL DATE</span><span style="font-size:16px;display:block;">${html(today.liturgicalDateLabel)}</span>${today.annoMundiLabel ? `<span style="color:var(--muted);font-size:13px;font-style:italic;">${html(today.annoMundiLabel)}</span>` : ''}</span></div>
            <div style="display:flex;flex-direction:column;gap:12px;">
              <div style="display:flex;gap:10px;"><span style="color:var(--gold);font-size:17px;margin-top:2px;">✥</span><span><span style="display:block;color:var(--gold);font-size:10.5px;letter-spacing:.13em;font-weight:600;">TONE OF THE WEEK</span><span style="font-size:16px;">${html(today.toneLabel)}</span></span></div>
              <div style="display:flex;gap:10px;"><span style="color:var(--gold);font-size:17px;margin-top:2px;">♙</span><span><span style="display:block;color:var(--gold);font-size:10.5px;letter-spacing:.13em;font-weight:600;">FASTING RULE</span><span style="font-size:16px;display:block;">${html(today.fastingRule)}</span><span style="color:var(--muted);font-size:13px;font-style:italic;">${html(today.fastingNote)}</span></span></div>
            </div>
            <div class="learn-today-readings">
              ${readingsCallout}
            </div>
          </div>
          ${saintCard}
        </div>
        <div class="learn-today-hymns">
          <div style="color:var(--gold);font-size:11px;letter-spacing:.16em;font-weight:600;">${html(today.troparionLabel)}</div>
          <p style="margin:6px 0 16px;font-size:15.5px;line-height:1.5;color:#33405a;">${html(today.troparionText)}</p>
          <div style="color:var(--gold);font-size:11px;letter-spacing:.16em;font-weight:600;">${html(today.kontakionLabel)}</div>
          <p style="margin:6px 0 0;font-size:15.5px;line-height:1.5;color:#33405a;">${html(today.kontakionText)}</p>
        </div>
        ${renderTodayLearnContext(vm)}
      </div>

      <!-- Daily Church Rhythms — proper grid -->
      <div class="learn-card">
        <div class="learn-section-head">
          <span style="display:flex;align-items:center;gap:9px;"><span style="color:var(--gold);font-size:16px;">✥</span><span style="color:var(--gold);font-size:12px;letter-spacing:.18em;font-weight:600;">DAILY CHURCH RHYTHMS</span></span>
          <small class="learn-muted">Resets each day</small>
        </div>
        ${rhythmsGrid}
      </div>
  `;
  const churchSectionHtml = experience.tefaActive
    ? ''
    : experience.odyssey
      ? `
      <div data-church-section style="display:flex;flex-direction:column;gap:14px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
          <span class="learn-eyebrow" style="display:flex;align-items:center;gap:8px;"><span style="color:var(--gold);">✥</span>Church Rhythm${experience.tefaActive ? ' (Optional)' : ''}</span>
          <button type="button" data-church-section-toggle aria-expanded="${churchCollapsed ? 'false' : 'true'}" style="border:1px solid var(--line);background:var(--paper2);border-radius:9px;padding:6px 13px;font-family:inherit;font-size:12.5px;color:var(--ink);cursor:pointer;">
            <span data-church-section-toggle-label>${churchCollapsed ? 'Show Church Rhythm' : 'Minimize'}</span>
          </button>
        </div>
        <div data-church-section-body ${churchCollapsed ? 'hidden' : ''} style="display:${churchCollapsed ? 'none' : 'flex'};flex-direction:column;gap:22px;">
          ${churchSectionBody}
        </div>
      </div>
    `
      : `<div style="display:flex;flex-direction:column;gap:22px;">${churchSectionBody}</div>`;
  const lessonsAndFamilyHtml = `${renderDashboardDesignedLessons(vm)}
      ${renderDashboardFamilyCards(vm)}`;
  const togetherAndWeekHtml = `
      <!-- Together This Week — full width -->
      <div class="learn-card">
        <div class="learn-section-head">
          <span style="display:flex;align-items:center;gap:9px;"><span style="color:var(--gold);font-size:17px;">⌂</span><span class="learn-eyebrow">TOGETHER THIS WEEK</span></span>
          <small class="learn-muted">Resets Sunday</small>
        </div>
        <div style="display:flex;flex-direction:column;gap:13px;">${togetherThisWeek}</div>
      </div>

      <!-- Week stats strip + child columns -->
      <!-- learn-week-overview WEEK AT A GLANCE -->
      <section style="display:grid;gap:14px;">
        <div style="display:flex;align-items:end;justify-content:space-between;gap:12px;flex-wrap:wrap;">
          <div>
            <div style="color:var(--gold);font-size:11px;letter-spacing:.16em;font-weight:800;text-transform:uppercase;">Forms & Children</div>
            <h2 style="font-family:'Cormorant Garamond',serif;font-size:28px;line-height:1;margin:5px 0 0;color:var(--ink);">Individual work this week</h2>
          </div>
          <small class="learn-muted">${vm.childColumns.length} ${vm.childColumns.length === 1 ? 'learner' : 'learners'}</small>
        </div>
        ${weekStatsStrip}
        <div class="learn-child-week-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:14px;align-items:start;">
          ${childColumnsGrid}
        </div>
      </section>
  `;
  const sectionOrder = experience.tefaActive
    ? `${lessonsAndFamilyHtml}
${togetherAndWeekHtml}
${churchSectionHtml}`
    : `${churchSectionHtml}
${lessonsAndFamilyHtml}
${togetherAndWeekHtml}`;
  const body = `
    <section data-screen-label="Dashboard" style="display:flex;flex-direction:column;gap:22px;">
      ${experience.odyssey ? renderTefaViewToggleBanner(experience) : ''}
      ${sectionOrder}
    </section>
  `;
  return shell(vm, body);
}
function truthyLearn4(value) {
  return Boolean(value);
}
function renderPlanner(vm) {
  if (!marketingPreviewActive()) seedFamilyPrototypeState(vm);
  const query = new URLSearchParams(window.location.search);
  const activeScope = plannerScopeFromQuery();
  const mealTool = mealToolFromQuery();
  const scopeAllowsTerm = activeScope === 'lessons';
  const viewSet = scopeAllowsTerm ? ['day', 'week', 'month', 'term', 'year'] : ['day', 'week', 'month'];
  const displayView = viewSet.includes(vm.activeView) ? vm.activeView : 'week';
  if (!scopeAllowsTerm && vm.activeView !== displayView) {
    window.history.replaceState(null, '', plannerHref({ view: displayView, term: null, termId: null }));
  }
  const viewTabs = viewSet.map((view) => ({
    id: view,
    label: view.charAt(0).toUpperCase() + view.slice(1),
    href: plannerHref(scopeAllowsTerm ? { view } : { view, term: null, termId: null }),
    active: displayView === view,
  }));
  const familyTabs = [
    { id: 'lessons', label: 'Lessons', icon: '▦' },
    { id: 'meals', label: 'Meals', icon: '♨' },
    { id: 'chores', label: 'Chores', icon: '✓' },
    { id: 'events', label: 'Events', icon: '◷' },
  ];
  const mealTools = [
    { id: 'plan', label: 'Plan', icon: '▦' },
    { id: 'recipes', label: 'Recipes', icon: '☰' },
    { id: 'groceries', label: 'Groceries', icon: '▤' },
    { id: 'pantry', label: 'Pantry', icon: '☖' },
  ];
  const introDismissedKey = `agapay.learn.plannerIntro.${activeScope}`;
  const introDismissed = typeof localStorage !== 'undefined' && localStorage.getItem(introDismissedKey) === '1';
  const introHtml = introDismissed
    ? ''
    : `
    ${renderFamilyPlannerIntro(vm, activeScope === 'meals' && mealTool !== 'plan' ? mealTool : activeScope)}
    <div style="margin-top:-8px;display:flex;justify-content:flex-end;">
      <button type="button" data-planner-intro-dismiss="${introDismissedKey}"
        style="border:0;background:none;color:var(--muted);font-family:inherit;font-size:12px;cursor:pointer;padding:4px 0;">
        Hide this — I know what this page does
      </button>
    </div>`;
  const controls = `
    <div class="learn-family-toolbar">
      <div class="learn-family-tabs" aria-label="Planner view">
        ${viewTabs.map((tab) => `<a href="${tab.href}" aria-current="${tab.active ? 'page' : 'false'}">${html(tab.label)}</a>`).join('')}
      </div>
      <div class="learn-family-tabs learn-family-tabs-wide" aria-label="Planner layer">
        ${familyTabs
          .map((tab) => {
            const nextScopeAllowsTerm = tab.id === 'lessons';
            return `<a href="${plannerHref({
              scope: tab.id,
              tool: tab.id === 'meals' ? mealTool : null,
              view: nextScopeAllowsTerm
                ? displayView
                : ['day', 'week', 'month'].includes(displayView)
                  ? displayView
                  : 'week',
              term: nextScopeAllowsTerm ? query.get('term') : null,
              termId: nextScopeAllowsTerm ? query.get('termId') : null,
            })}" aria-current="${activeScope === tab.id ? 'page' : 'false'}"><span>${html(tab.icon)}</span>${html(tab.label)}</a>`;
          })
          .join('')}
      </div>
      <div class="learn-family-range">
        <strong>${html(displayView === 'month' ? vm.month.label : vm.week.label)}</strong>
        <span>${html(vm.week.seasonLabel || 'Household rhythm')}</span>
      </div>
      ${scopeAllowsTerm && displayView !== 'year' ? `<div class="learn-family-tabs learn-family-term-tabs" aria-label="Planner term">${vm.termTabs.map((tab) => `<a href="${tab.href}" aria-current="${tab.active ? 'page' : 'false'}">${html(tab.label)}</a>`).join('')}</div>` : ''}
      ${!scopeAllowsTerm ? `<span class="learn-family-lock">Meals, chores, and events use day, week, and month views.</span>` : ''}
    </div>
    ${
      activeScope === 'meals'
        ? `<div class="learn-family-meal-tools" aria-label="Meal tools">
      ${mealTools.map((tool) => `<a href="${plannerHref({ scope: 'meals', tool: tool.id, view: displayView, term: null, termId: null })}" aria-current="${mealTool === tool.id ? 'page' : 'false'}"><span>${html(tool.icon)}</span>${html(tool.label)}</a>`).join('')}
    </div>`
        : ''
    }
  `;
  const lessonContent =
    displayView === 'day'
      ? renderPlannerDay(vm)
      : displayView === 'month'
        ? renderPlannerMonth(vm)
        : displayView === 'term'
          ? renderPlannerTerm(vm)
          : displayView === 'year'
            ? renderPlannerYear(vm)
            : renderPlannerWeek(vm);
  const scopedContent =
    activeScope === 'lessons'
      ? `${lessonContent}${renderPlannerReserveCard(vm)}`
      : renderFamilyPlannerScope(vm, activeScope, displayView, mealTool);
  const body = `
    <section data-screen-label="Family Planner" class="learn-family-page">
      ${introHtml}
      ${controls}
      ${scopedContent}
    </section>
  `;
  return shell(vm, body);
}
function plannerStatusMeta(status) {
  const normalized = String(status || 'planned').toLowerCase();
  return (
    PLANNER_STATUS_META[normalized] || {
      label: normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : 'Planned',
      note: '',
    }
  );
}
function statusPill(status) {
  const normalized = String(status || '').toLowerCase();
  const color =
    normalized === 'completed'
      ? 'var(--navy)'
      : normalized === 'deferred'
        ? 'var(--gold)'
        : normalized === 'reserve'
          ? 'var(--muted)'
          : normalized === 'reduced'
            ? 'var(--gold)'
            : 'var(--muted)';
  const meta = plannerStatusMeta(status);
  return `<span title="${html(meta.note)}" style="border:1px solid ${color};color:${color};border-radius:999px;padding:2px 8px;font-size:11px;">${html(meta.label)}</span>`;
}
function renderPlannerReserveCard(vm) {
  const items = vm.term?.graceReserve || [];
  const currentMode = vm.term?.graceMode?.rule?.mode || vm.graceMode?.mode || '';
  const body = items.length
    ? `<div class="learn-reserve-grid">${items.map((item) => `<article style="border-color:${html(item.color)};background:${softColor(item.color, '18')};"><strong>${html(item.title)}</strong><small>${html(item.note || 'Saved in the reserve list for a roomier day.')}</small></article>`).join('')}</div>`
    : `<p class="learn-reserve-empty">No subjects are currently deferred into the reserve list.</p>`;
  return `
    <section class="learn-planner-reserve-card">
      <div class="learn-planner-reserve-head">
        <div>
          <small>GRACE RESERVE</small>
          <h2>Deferred Subjects</h2>
        </div>
        ${currentMode ? `<span>${html(currentMode)}</span>` : ''}
      </div>
      ${body}
    </section>
  `;
}
function gracePriorityBadge(priority) {
  if (!priority || priority === 'keep') {
    return `<span class="learn-grace-badge learn-grace-badge--keep" title="Grace Mode: always kept">✦ Keep</span>`;
  }
  if (priority === 'reduce first') {
    return `<span class="learn-grace-badge learn-grace-badge--reduce" title="Grace Mode: reduce minutes first">◐ Reduce</span>`;
  }
  return `<span class="learn-grace-badge learn-grace-badge--defer" title="Grace Mode: defer to reserve if needed">○ Defer</span>`;
}
function renderTermAtAGlance(vm) {
  const weekNum = vm.week.termWeekNumber || 0;
  const totalWeeks = vm.week.totalTermWeeks || 12;
  const percent = totalWeeks > 0 && weekNum > 0 ? Math.round((weekNum / totalWeeks) * 100) : 0;
  const hasDescription = Boolean(vm.term.description);
  if (hasDescription) {
    const dots = Array.from({ length: totalWeeks }, (_, i) => {
      const w = i + 1;
      const isCurrent = w === weekNum;
      const isPast = w < weekNum;
      return `<span title="Week ${w}" style="display:inline-block;width:${isCurrent ? 12 : 8}px;height:${isCurrent ? 12 : 8}px;border-radius:50%;background:${isCurrent ? 'var(--gold)' : isPast ? 'rgba(181,148,47,.38)' : 'var(--line)'};${isCurrent ? 'box-shadow:0 0 0 3px rgba(181,148,47,.22);' : ''}vertical-align:middle;"></span>`;
    }).join('');
    return `
      <section style="background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:18px 22px;display:grid;grid-template-columns:1fr minmax(180px,.55fr);gap:22px;align-items:start;">
        <div>
          <div class="learn-eyebrow">Term at a Glance</div>
          <strong style="font-family:'Cormorant Garamond',serif;font-size:22px;display:block;line-height:1.1;">${html(vm.term.label)}</strong>
          ${vm.term.dateRange ? `<div style="color:var(--muted);font-size:13px;margin:3px 0 10px;">${html(vm.term.dateRange)}</div>` : `<div style="margin-bottom:10px;"></div>`}
          <p style="margin:0;font-size:14px;line-height:1.6;color:var(--ink);">${html(vm.term.description)}</p>
        </div>
        <div style="padding-top:2px;">
          <div style="color:var(--gold);font-size:11px;letter-spacing:.14em;font-weight:700;text-transform:uppercase;margin-bottom:10px;">Week progress</div>
          ${weekNum && totalWeeks ? `<p style="margin:0 0 10px;font-size:13px;color:var(--muted);">Week ${weekNum} of ${totalWeeks}${vm.term.dateRange ? ` · ${html(vm.term.dateRange)}` : ''}</p>` : `<p style="margin:0 0 10px;font-size:13px;color:var(--muted);">Set term dates in Setup</p>`}
          <div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center;">${dots}</div>
        </div>
      </section>
    `;
  }
  return `
    <section style="background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:18px 22px;display:grid;grid-template-columns:minmax(200px,.75fr) 1fr;gap:22px;align-items:center;">
      <div>
        <div class="learn-eyebrow">Term at a Glance</div>
        <h2 style="font-family:'Cormorant Garamond',serif;font-size:26px;line-height:1.05;margin:5px 0 4px;color:var(--ink);">${html(vm.term.label || 'Current Term')}</h2>
        <p style="margin:0;color:var(--muted);font-size:13px;line-height:1.4;">${weekNum && totalWeeks ? `Week ${weekNum} of ${totalWeeks}` : 'Set term dates in Setup'}${vm.term.dateRange ? ` · ${html(vm.term.dateRange)}` : ''}</p>
      </div>
      <div>
        <div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:8px;color:#33405a;font-size:13px;"><span>Term progress</span><strong>${percent}%</strong></div>
        ${bar(percent, 'var(--gold)')}
        <p style="margin:8px 0 0;font-size:12px;color:var(--muted);">Add a term description in Setup → Terms to show cycle and focus notes here.</p>
      </div>
    </section>
  `;
}
function renderPlannerWeek(vm) {
  return `
    ${renderWeeklyAssignmentBoard(vm)}
    <details class="learn-form-plan-summary">
      <summary><span><small>FORM PLANS</small><strong>Review generated group plans</strong></span><em>${vm.week.formRows.length} ${vm.week.formRows.length === 1 ? 'group' : 'groups'}</em></summary>
      <div>${
        vm.week.formRows.length
          ? vm.week.formRows
              .map(
                (form) =>
                  `<article><span style="background:${form.color};">${html(form.initials.slice(0, 2).join(''))}</span><div><strong>${html(form.formLabel)}</strong><small>${html(form.childNames.join(', '))}</small></div><p>${form.items
                    .slice(0, 4)
                    .map((item) => `<span>${html(item.title)}${item.sub ? ` · ${html(item.sub)}` : ''}</span>`)
                    .join(
                      ''
                    )}${form.items.length > 4 ? `<small>+ ${form.items.length - 4} more lessons</small>` : ''}</p></article>`
              )
              .join('')
          : emptyState('Add children and subjects in Setup to generate group plans.')
      }</div>
    </details>
  `;
}
function moveUnfinishedWorkControl(scope, rowId, weekday, status) {
  if (!rowId || (status !== 'planned' && status !== 'reduced')) return '';
  return `<div class="learn-move-unfinished" data-move-unfinished data-move-scope="${html(scope)}" data-move-row-id="${html(rowId)}" data-move-weekday="${weekday}" style="display:flex;gap:6px;justify-self:end;">
    <button type="button" data-move-mode="next-open-day" title="Move this to the next open day this week" style="border:1px solid var(--line);background:var(--paper);color:var(--ink);border-radius:8px;padding:4px 8px;font-size:11px;font-family:inherit;cursor:pointer;white-space:nowrap;">Move →</button>
    <button type="button" data-move-mode="reserve" title="Set this aside for a roomier day — no rush" style="border:1px solid var(--line);background:var(--paper);color:var(--muted);border-radius:8px;padding:4px 8px;font-size:11px;font-family:inherit;cursor:pointer;white-space:nowrap;">Reserve</button>
  </div>`;
}
function renderPlannerDay(vm) {
  const day = vm.day.selected || {};
  const dayWeekday = Number.isInteger(vm.day.selectedIndex) ? vm.day.selectedIndex : 0;
  const dayLinks = vm.week.days
    .map(
      (item) =>
        `<a href="${html(learnSectionHref('planner', `view=day&date=${encodeURIComponent(item.date)}&term=${encodeURIComponent(vm.term.activeTerm)}&termId=${encodeURIComponent(vm.term.activeTermId)}`))}" style="text-decoration:none;color:var(--ink);border:1px solid ${item.date === day.date ? 'var(--gold)' : 'var(--line)'};background:${item.date === day.date ? '#fbf2dd' : 'var(--paper)'};border-radius:10px;padding:10px;text-align:center;min-width:92px;"><strong style="display:block;color:${item.isSunday ? 'var(--burgundy)' : 'var(--gold)'};">${html(item.weekday)}</strong><small>${html(item.shortDate)}</small></a>`
    )
    .join('');
  const designedAssignments = designedAssignmentsForDate(vm, day.date);
  const household = designedAssignments.length
    ? renderDesignedLessonList(designedAssignments, '')
    : day.isSunday
      ? emptyState('Sunday is reserved for worship, rest, and family rhythm. No school blocks are scheduled.')
      : vm.day.householdBlocks.length
        ? vm.day.householdBlocks
            .map(
              (block) =>
                `<div style="display:grid;grid-template-columns:1fr 70px 100px auto;gap:12px;align-items:center;padding:12px 0;border-top:1px solid var(--line);"><span><strong>${html(block.title)}</strong><small style="display:block;color:var(--muted);">${html(block.sub)}</small></span><span>${html(block.minutes)}m</span>${statusPill(block.status)}${moveUnfinishedWorkControl('household', block.id, dayWeekday, block.status)}</div>`
            )
            .join('')
        : emptyState('Drag subjects into this day from the Week view, or add setup subjects for this week.');
  const forms = day.isSunday
    ? ''
    : vm.day.formBlocks
        .map(
          (form) =>
            `<div style="border:1px solid var(--line);border-radius:10px;background:var(--paper2);padding:12px;display:grid;gap:10px;"><div style="display:flex;gap:10px;align-items:center;"><span style="width:34px;height:34px;border-radius:50%;background:${form.color};color:#f3ead4;display:flex;align-items:center;justify-content:center;">${html(form.initials.slice(0, 2).join(''))}</span><span><strong>${html(form.formLabel)}</strong><small style="display:block;color:var(--muted);">${html(form.childNames.join(', '))}</small></span></div>${form.items.map((item) => `<div style="display:grid;grid-template-columns:1fr 60px 90px auto;gap:10px;align-items:center;border-top:1px solid var(--line);padding-top:8px;"><span><strong>${html(item.title)}</strong><small style="display:block;color:var(--muted);">${html(item.sub)}</small></span><span>${html(item.minutes)}m</span>${statusPill(item.status)}${moveUnfinishedWorkControl('child', item.id, dayWeekday, item.status)}</div>`).join('')}</div>`
        )
        .join('');
  const appointments = day.events || eventsForDate(vm, day.date);
  const appointmentPanel = appointments.length
    ? `<div style="display:grid;gap:9px;">${appointments.map((event) => `<div style="border:1px solid var(--line);border-radius:10px;background:var(--paper2);padding:10px 12px;"><strong>${html(event.title || 'Appointment')}</strong><small style="display:block;color:var(--muted);">${html([timeLabel(event.startTime), event.location, event.notes].filter(truthyLearn4).join(' · '))}</small></div>`).join('')}</div>`
    : emptyState('No appointments are scheduled for this day.');
  return `
    <div style="display:flex;gap:8px;overflow:auto;padding-bottom:2px;">${dayLinks}</div>
    <div style="display:grid;grid-template-columns:1.1fr .9fr;gap:16px;align-items:start;">
      ${panel('Daily Plan', `<h2 style="font-family:'Cormorant Garamond',serif;font-size:28px;margin:0;">${html(day.weekdayLong || day.weekday)} · ${html(day.shortDate || day.date)}</h2><p style="margin:6px 0 14px;color:var(--muted);">${html(day.feast)} · ${html(day.fasting)}</p>${household}`, { icon: day.isSunday ? '☩' : '▣' })}
      ${panel('Form Work', day.isSunday ? `<div style="color:var(--muted);line-height:1.45;">No Form work is scheduled on Sunday.</div>` : `<div style="display:grid;gap:10px;">${forms || emptyState('No Form blocks for this day.')}</div>`, { icon: '◎' })}
    </div>
    ${panel('Appointments', appointmentPanel, { icon: '◷' })}
    ${panel('Church Notes', `<div style="display:grid;grid-template-columns:repeat(3,minmax(180px,1fr));gap:12px;"><div><small style="color:var(--gold);letter-spacing:.12em;">EPISTLE</small><strong style="display:block;">${html(day.epistle || 'Set readings source')}</strong></div><div><small style="color:var(--gold);letter-spacing:.12em;">GOSPEL</small><strong style="display:block;">${html(day.gospel || 'Set readings source')}</strong></div><div><small style="color:var(--gold);letter-spacing:.12em;">TONE</small><strong style="display:block;">${html(day.tone || 'Tone')}</strong></div></div>`, { icon: '✥' })}
  `;
}
function renderFamilyPlanningEditor(vm) {
  return `<form data-family-planning-form id="family-planner" style="display:grid;gap:12px;scroll-margin-top:110px;">${panel('Family Planner & Meals', familyPlanningSetupPanel({ familyPlanning: vm.familyPlanning, household: vm.familyPlanning.household, children: vm.familyPlanning.children }), { icon: '▣', largeTitle: true })}<div class="learn-family-planner-save"><span data-family-planning-status>Appointments, name days, meals, recipes, and groceries save independently from school setup.</span><button type="submit">Save Family Planner</button></div></form>`;
}
function renderFamilyPlannerIntro(vm, scope) {
  const tefa = learnExperience().tefaActive;
  const intros = {
    lessons: ['Family Planner', 'Lessons & Forms', 'Your school day, arranged by family work and Form work.', '▦'],
    meals: tefa
      ? [
          'Meal Planning',
          'A practical weekly menu',
          'Plan breakfast, lunch, and dinner beside lessons and family activities.',
          '♨',
        ]
      : [
          'Meal Planning',
          'Fast-aware weekly meals',
          'Plan breakfast, lunch, and dinner beside the Church calendar so fasting days and feast days shape the week naturally.',
          '♨',
        ],
    chores: tefa
      ? [
          'Household Chores',
          'Practical life for every child',
          'Keep a visible weekly rotation with age-appropriate responsibilities.',
          '✓',
        ]
      : [
          'Household Chores',
          'Practical life for every child',
          'Keep a visible weekly rotation with lighter expectations on Sundays and feast days.',
          '✓',
        ],
    events: tefa
      ? [
          'Family Calendar',
          'Appointments, field trips, and activities',
          'Keep the household’s real life beside lessons and meals.',
          '◷',
        ]
      : [
          'Family Calendar',
          'Appointments, field trips, and name days',
          'Keep the household’s real life beside lessons, feasts, and meals.',
          '◷',
        ],
    calendar: tefa
      ? [
          'Family Calendar',
          'Appointments, field trips, and activities',
          'Keep the household’s real life beside lessons and meals.',
          '◷',
        ]
      : [
          'Family Calendar',
          'Appointments, field trips, and name days',
          'Keep the household’s real life beside lessons, feasts, and meals.',
          '◷',
        ],
    recipes: tefa
      ? [
          'Recipe Library',
          'Your family recipe box',
          'Save recipes once and use them as the source for weekly meal planning.',
          '☰',
        ]
      : [
          'Recipe Library',
          'Your fast-aware family recipe box',
          'Save recipes once, mark fasting fit, and use them as the source for meal planning.',
          '☰',
        ],
    groceries: [
      'Grocery List',
      'From the menu to the store',
      'Group shopping by aisle and keep pantry staples from cluttering the list.',
      '▤',
    ],
    pantry: [
      'Pantry',
      'Staples, leftovers, and things already on hand',
      'Track what the household already has so the weekly grocery list stays practical and lean.',
      '☖',
    ],
  };
  const [kicker, title, desc, icon] = intros[scope] || intros.lessons;
  return `
    <section class="learn-family-intro">
      <span class="learn-family-intro-watermark">${html(icon)}</span>
      <div class="learn-family-intro-icon">${html(icon)}</div>
      <div>
        <div class="learn-family-kicker">${html(kicker)}</div>
        <h1>${html(title)}</h1>
        <p>${html(desc)}</p>
      </div>
    </section>
  `;
}
function renderFamilyPlannerScopeLegacy(vm, scope) {
  const planning = vm.familyPlanning || {};
  const dates = plannerDates(vm);
  const mealByDate = new Map((planning.meals || []).map((meal) => [meal.date, meal]));
  const recipes = planning.recipes || [];
  const groceries = planning.groceryItems || [];
  const chores = planning.chores || [];
  const eventsByDate = expandFamilyEvents(planning.events || [], dates);
  const titleMap = {
    meals: ['Weekly Meals', 'Plan one week at a time with fasting guidance beside the family calendar.', '♨'],
    chores: ['Chores', 'Keep practical life visible without crowding the school lesson plan.', '✓'],
    calendar: [
      'Family Calendar',
      'Appointments, field trips, extracurriculars, and name days in one household view.',
      '◷',
    ],
    recipes: ['Recipes', 'A fast-aware household recipe box connected to your weekly meal plan.', '☰'],
    groceries: ['Grocery List', 'A simple shopping list that can grow from meals and recipes.', '▤'],
  };
  const [title, intro, icon] = titleMap[scope] || titleMap.meals;
  const saveBar = `<div class="learn-family-planner-save"><span data-family-planning-status>Changes save to this household's Learn planner.</span><button type="submit">Save ${html(title)}</button></div>`;
  const hidden = `<input type="hidden" name="familyPlanning.weekStart" value="${html(dates[0])}"><input type="hidden" name="familyPlanning.fastingPreference" value="${html(planning.fastingPreference || 'guidance')}"><input type="hidden" name="household.motherName" value="${html(planning.household?.motherName || '')}"><input type="hidden" name="household.motherNameDay" value="${html(planning.household?.motherNameDay || '')}"><input type="hidden" name="household.fatherName" value="${html(planning.household?.fatherName || '')}"><input type="hidden" name="household.fatherNameDay" value="${html(planning.household?.fatherNameDay || '')}"><input type="hidden" name="household.parishPatronalFeastName" value="${html(planning.household?.parishPatronalFeastName || '')}"><input type="hidden" name="household.parishPatronalFeastDate" value="${html(planning.household?.parishPatronalFeastDate || '')}">${(planning.children || []).map((child) => `<span data-family-child-id="${html(child.id)}" data-family-child-name="${html(child.name || '')}" hidden><input name="childNameDay" value="${html(child.nameDay || '')}"></span>`).join('')}`;
  let content = '';
  if (scope === 'meals') {
    content = `<div class="learn-family-section-note"><strong>Weekly menu</strong><span>Tap into the fields and save the week. Recipe picker and drag-and-drop meal assignment can layer on top of this without changing the data.</span></div><div class="learn-family-meal-grid">${dates
      .map((date) => {
        const day = plannerDayLabel(date);
        const meal = mealByDate.get(date) || {};
        const calendarDay =
          (vm.month.days || []).find((item) => item.date === date) ||
          (vm.week.days || []).find((item) => item.date === date) ||
          {};
        const fastingClass = calendarDay.isFastDay ? 'is-fast' : calendarDay.isSunday ? 'is-feast' : '';
        return `<article class="learn-family-day-card ${fastingClass}" data-setup-row="meals" data-id="${html(meal.id || '')}"><div><span><small>${html(day.weekday)}</small><b>${html(day.short)}</b></span><strong>${html(calendarDay.fastingType || calendarDay.fasting || 'No fast')}</strong></div><input type="hidden" name="date" value="${html(date)}"><label><span>Breakfast</span><input name="breakfast" value="${html(meal.breakfast || '')}" placeholder="Add breakfast"></label><label><span>Lunch</span><input name="lunch" value="${html(meal.lunch || '')}" placeholder="Add lunch"></label><label><span>Dinner</span><input name="dinner" value="${html(meal.dinner || '')}" placeholder="Add dinner"></label></article>`;
      })
      .join('')}</div>`;
  } else if (scope === 'calendar') {
    content = `<div class="learn-family-section-note"><strong>This week's calendar</strong><span>Appointments, field trips, extracurriculars, and name days stay visible with school work and meals.</span></div><div class="learn-family-events-list">${dates
      .map((date) => {
        const day = plannerDayLabel(date);
        const rows = eventsByDate.get(date) || [{}];
        const calendarDay = (vm.week.days || []).find((item) => item.date === date) || {};
        return `<section class="learn-family-date-section"><header><span><small>${html(day.weekday)}</small><strong>${html(day.short)}</strong><em>${html(calendarDay.feast || 'Family day')}</em></span><button type="button" data-setup-add-row="familyEvents" data-setup-add-target="familyEvents-${html(date)}" data-setup-add-date="${html(date)}">+ Add</button></header><div id="familyEvents-${html(date)}" data-setup-list="familyEvents" style="display:grid;gap:8px;">${rows.map((event) => familyEventSetupRow({ ...event, date: event.date || date })).join('')}</div></section>`;
      })
      .join('')}</div>`;
  } else if (scope === 'chores') {
    const choreRows = chores.length ? chores : [{}];
    const household = planning.household || {};
    const roster = [
      { name: household.motherName || 'Mom', color: 'var(--burgundy)' },
      { name: household.fatherName || 'Dad', color: 'var(--navy)' },
      ...(planning.children || []).map((child) => ({
        name: child.name || 'Child',
        color: child.color || 'var(--gold)',
      })),
    ];
    content = `<div class="learn-family-section-note"><strong>Chore rhythm</strong><span>Create daily, weekly, monthly, quarterly, and yearly chores. Assign each one to Mom, Dad, Everyone, or a specific child.</span></div><div class="learn-family-chore-roster">${roster.map((person) => `<span><b style="background:${html(person.color)};">${html(String(person.name || 'C').slice(0, 1))}</b>${html(person.name)}</span>`).join('')}</div><div data-setup-list="chores" class="learn-family-edit-list">${choreRows.map((chore, index) => choreSetupRow(chore, index, planning)).join('')}</div><button type="button" data-setup-add-row="chores" class="learn-add-button">Add Chore</button>`;
  } else if (scope === 'recipes') {
    content = `<div class="learn-family-section-note"><strong>Recipe library</strong><span>Mark each recipe by fasting fit so AGAPAY can suggest better meals for fast days later.</span></div><div data-setup-list="recipes" class="learn-family-edit-list">${(recipes.length ? recipes : [{}]).map(recipeSetupRow).join('')}</div><button type="button" data-setup-add-row="recipes" class="learn-add-button">Add Recipe</button>`;
  } else {
    const byCategory = /* @__PURE__ */ new Map();
    groceries.forEach((item) => {
      const category = item.category || 'Other';
      if (!byCategory.has(category)) byCategory.set(category, []);
      byCategory.get(category).push(item);
    });
    const summary = groceries.length
      ? [...byCategory.entries()]
          .map(
            ([category, items]) =>
              `<div class="learn-family-aisle"><strong>${html(category)}</strong><span>${items.map((item) => html(item.name)).join(', ')}</span></div>`
          )
          .join('')
      : '';
    content = `<div class="learn-family-section-note"><strong>Grocery list</strong><span>Group items by aisle. Checked items persist so the list can become a real weekly shopping tool.</span></div>${summary ? `<div class="learn-family-grocery-summary">${summary}</div>` : ''}<div data-setup-list="groceryItems" class="learn-family-edit-list">${(groceries.length ? groceries : [{}]).map(grocerySetupRow).join('')}</div><button type="button" data-setup-add-row="groceryItems" class="learn-add-button">Add Grocery Item</button>`;
  }
  return `<form data-family-planning-form id="family-planner" class="learn-family-planner-panel">${hidden}${content}${saveBar}</form>`;
}
function dayKeyForChore(chore = {}, vm = {}) {
  const dayLabel = String(chore.day || '').toLowerCase();
  return (
    Object.entries(prototypeWeekDateMap(vm)).find(([, date]) => {
      const label = plannerDayLabel(date).long.toLowerCase();
      return label === dayLabel;
    })?.[0] || ''
  );
}
function prototypeRecipeType(slot = 'dinner') {
  if (slot === 'breakfast') return 'breakfast';
  if (slot === 'lunch') return 'lunch';
  return 'dinner';
}
function prototypeDaySeeds(vm) {
  const model = familyPlannerModel(vm);
  const days = model.weekDays.length
    ? model.weekDays
    : plannerDates(vm).map((date) => ({ date, ...plannerDayLabel(date) }));
  return days.slice(0, 7).map((day, index) => ({
    key: `d${index}`,
    fullDate: day.date || '',
    weekday: day.weekday || day.weekdayShort || ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][index] || '',
    long: day.weekdayLong || day.long || day.weekday || '',
    short: day.shortDate || day.short || day.date || '',
    date: Number(day.dayNumber || String(day.date || '').slice(-2)) || index + 1,
    level: isImportantPlannerFeast(day)
      ? 'fish'
      : day.isSunday
        ? 'fish'
        : day.isFastDay
          ? String(day.fastingType || day.fasting || '')
              .toLowerCase()
              .includes('strict')
            ? 'strict'
            : 'oilwine'
          : 'rich',
    feast: isImportantPlannerFeast(day) ? day.feast || day.feastTitle || '' : '',
    tag:
      day.fastingType ||
      day.fasting ||
      (isImportantPlannerFeast(day) ? day.feast || day.feastTitle || 'Feast day' : 'No fast'),
    sunday: Boolean(day.isSunday),
    isToday: Boolean(day.isToday),
    feastDay: isImportantPlannerFeast(day),
    school: index === 0 ? 'Church & rest' : 'Plan the day',
  }));
}
function prototypeMonthSeed(vm) {
  const model = familyPlannerModel(vm);
  const weekDateToKey = Object.fromEntries(prototypeDaySeeds(vm).map((day) => [day.fullDate, day.key]));
  const monthDays = (model.monthDays || []).map((day) => {
    const feast = day.feast || day.feastTitle || '';
    const fasting = day.fastingType || day.fasting || '';
    const importantFeast = isImportantPlannerFeast(day);
    const key = weekDateToKey[day.date] || (day.date ? `m_${String(day.date).replaceAll('-', '')}` : '');
    return {
      key,
      fullDate: day.date || '',
      dayNumber:
        day.dayNumber ||
        String(day.date || '')
          .slice(-2)
          .replace(/^0/, ''),
      weekday: day.weekday || day.weekdayLong || '',
      long: day.weekdayLong || day.long || day.weekday || '',
      short: day.shortDate || day.short || day.date || '',
      date: Number(day.dayNumber || String(day.date || '').slice(-2)) || 0,
      level: importantFeast
        ? 'fish'
        : day.isSunday
          ? 'fish'
          : day.isFastDay
            ? String(fasting).toLowerCase().includes('strict')
              ? 'strict'
              : 'oilwine'
            : 'rich',
      tag: fasting || (importantFeast ? feast || 'Feast day' : 'No fast'),
      sunday: Boolean(day.isSunday),
      feastDay: importantFeast,
      inMonth: day.inMonth !== false,
      isToday: Boolean(day.isToday),
      isSunday: Boolean(day.isSunday),
      isFastDay: Boolean(day.isFastDay),
      isImportantFeast: importantFeast,
      feast,
      feastRank: day.feastRank || '',
      fasting,
      fastingType: day.fastingType || '',
      meal: day.meal || null,
    };
  });
  const monthFeasts = monthDays
    .filter((day) => day.inMonth !== false && day.isImportantFeast)
    .slice(0, 8)
    .map((day, index) => ({
      id: `month_${day.fullDate || index}`,
      day: day.dayNumber || '',
      dateLabel: day.dayNumber ? String(day.dayNumber) : day.fullDate || '',
      name: day.feast || 'Fast day',
      rank: day.isFastDay
        ? [day.feastRank || 'Feast', day.fasting || day.fastingType || ''].filter(truthyLearn4).join(' · ')
        : day.feastRank || 'Feast',
      plan: index === 0,
    }));
  let weekFeasts = monthDays
    .filter((day) => weekDateToKey[day.fullDate] && day.isImportantFeast)
    .map((day, index) => ({
      id: `week_${day.fullDate || index}`,
      day: day.dayNumber || '',
      dateLabel: day.short || day.dayNumber || day.fullDate || '',
      name: day.feast || 'Feast',
      rank: day.isFastDay
        ? [day.feastRank || 'Feast', day.fasting || day.fastingType || ''].filter(truthyLearn4).join(' · ')
        : day.feastRank || 'Feast',
      fullDate: day.fullDate || '',
      plan: index === 0,
    }));
  const calendarType = String(
    vm.preferences?.calendarType ||
      (typeof localStorage !== 'undefined' ? localStorage.getItem('agapay.learn.calendar') : '') ||
      ''
  );
  const revisedLike = /revised|gregorian/i.test(calendarType);
  const june24 = monthDays.find((day) => day.inMonth !== false && String(day.fullDate || '').slice(5) === '06-24');
  if (revisedLike && june24 && !monthFeasts.some((feast) => feast.id === `month_${june24.fullDate}`)) {
    june24.feast = june24.feast || 'Nativity of St. John the Forerunner';
    june24.feastDay = true;
    june24.isImportantFeast = true;
    june24.level = 'fish';
    monthFeasts.push({
      id: `month_${june24.fullDate}`,
      day: june24.dayNumber || '24',
      dateLabel: june24.dayNumber || '24',
      name: june24.feast,
      rank: [june24.fasting || june24.fastingType || '', 'Feast'].filter(truthyLearn4).join(' · '),
      plan: monthFeasts.length === 0,
    });
  }
  if (
    revisedLike &&
    june24 &&
    weekDateToKey[june24.fullDate] &&
    !weekFeasts.some((feast) => feast.fullDate === june24.fullDate)
  ) {
    weekFeasts = weekFeasts.concat({
      id: `week_${june24.fullDate}_forerunner`,
      day: june24.dayNumber || '24',
      dateLabel: june24.short || june24.dayNumber || 'Jun 24',
      name: 'Nativity of St. John the Forerunner',
      rank: [june24.fasting || june24.fastingType || '', 'Feast'].filter(truthyLearn4).join(' · '),
      fullDate: june24.fullDate || '',
      plan: weekFeasts.length === 0,
    });
  }
  weekFeasts.sort((a, b) => String(a.fullDate || '').localeCompare(String(b.fullDate || '')));
  const weekDays = model.weekDays || [];
  const weekStart = weekDays[0]?.shortDate || weekDays[0]?.short || weekDays[0]?.date || '';
  const weekEnd =
    weekDays[weekDays.length - 1]?.shortDate ||
    weekDays[weekDays.length - 1]?.short ||
    weekDays[weekDays.length - 1]?.date ||
    '';
  const fastNames = [
    ...new Set(
      monthDays
        .filter((day) => day.inMonth !== false && day.isFastDay)
        .map((day) => day.fasting || day.fastingType || 'Fast day')
        .filter(truthyLearn4)
    ),
  ];
  return {
    key: vm.month?.key || model.monthKey || /* @__PURE__ */ new Date().toISOString().slice(0, 7),
    label: model.monthLabel || vm.month?.label || 'Month Calendar',
    weekdays: vm.month?.weekdays || ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    days: monthDays,
    feasts: monthFeasts,
    weekFeasts,
    weekRange: weekStart && weekEnd ? `${weekStart} - ${weekEnd}` : 'This week',
    fastingSummary: fastNames.length ? fastNames.slice(0, 2).join(' + ') : 'Church calendar',
  };
}
function truthyLearn5(value) {
  return Boolean(value);
}
function prototypeSetupSeed(vm) {
  const grouping = (vm.familyPlanning?.children || []).some((child) => child.formLabel) ? 'Forms' : 'Grades';
  const formMap = /* @__PURE__ */ new Map();
  (vm.familyPlanning?.children || []).forEach((child, index) => {
    const label = child.formLabel || child.gradeLabel || child.form || child.grade || 'Household';
    if (!formMap.has(label)) {
      formMap.set(label, {
        id: `form_${formMap.size + 1}`,
        label,
        color: child.color || ACCENTS[index % ACCENTS.length],
        children: [],
        subjects: [],
      });
    }
    formMap.get(label).children.push(child.name || child.firstName || `Child ${index + 1}`);
  });
  (vm.week?.formRows || []).forEach((row) => {
    const label = row.formLabel || row.label || 'Household';
    if (!formMap.has(label))
      formMap.set(label, {
        id: `form_${formMap.size + 1}`,
        label,
        color: row.color || ACCENTS[formMap.size % ACCENTS.length],
        children: [],
        subjects: [],
      });
    const target = formMap.get(label);
    (row.blocks || []).forEach((block) => {
      const title = block.title || row.title;
      if (title && !target.subjects.includes(title)) target.subjects.push(title);
    });
  });
  (vm.term?.pacingRows || []).forEach((row) => {
    const label = row.formLabel || row.label || '';
    const targets = label && formMap.has(label) ? [formMap.get(label)] : [...formMap.values()];
    targets.forEach((target) => {
      const title = row.subjectTitle || row.title || row.label;
      if (title && !target.subjects.includes(title)) target.subjects.push(title);
    });
  });
  const forms = [...formMap.values()].map((form) => ({
    ...form,
    subjects: form.subjects.length ? form.subjects : ['Math', 'Language Arts', 'History', 'Science', 'Literature'],
  }));
  return {
    calendar: storedLearnCalendar(vm.preferences?.calendarType || ''),
    grouping,
    enrichment: (vm.week?.householdRows || []).map((row) => row.title).filter(truthyLearn5),
    forms: forms.length
      ? forms
      : [
          {
            id: 'household',
            label: 'Household',
            color: '#b5942f',
            children: [],
            subjects: ['Math', 'Language Arts', 'History', 'Science', 'Literature'],
          },
        ],
  };
}
function prototypeKidsSeed(vm) {
  const chores = vm.familyPlanning?.chores || [];
  return (vm.familyPlanning?.children || []).map((child, index) => {
    const name = child.name || child.firstName || `Child ${index + 1}`;
    const childChores = chores
      .filter((chore) => !chore.assignee || chore.assignee === name)
      .map((chore) => chore.title)
      .filter(truthyLearn5);
    return {
      name,
      color: child.color || ACCENTS[index % ACCENTS.length],
      chores: childChores.length ? childChores : ['', '', '', '', ''],
    };
  });
}
function backendRecipeToPrototype(recipe, index = 0) {
  const id = recipe.id || `agp_recipe_${index + 1}`;
  const types = [
    prototypeRecipeType(
      String(recipe.category || '')
        .toLowerCase()
        .includes('breakfast')
        ? 'breakfast'
        : String(recipe.category || '')
              .toLowerCase()
              .includes('lunch')
          ? 'lunch'
          : 'dinner'
    ),
  ];
  return {
    id,
    recipe: {
      name: recipe.title || `Recipe ${index + 1}`,
      types,
      level:
        recipe.fastingType === 'strict'
          ? 'strict'
          : recipe.fastingType === 'fish'
            ? 'fish'
            : recipe.fastingType === 'regular'
              ? 'rich'
              : 'oilwine',
      time: '30 min',
      servings: 4,
      glyph: '🍲',
      ingredients: String(recipe.ingredients || '')
        .split(',')
        .map((item) => item.trim())
        .filter(truthyLearn5),
      note: recipe.instructions || recipe.category || 'Saved from AGAPAY Learn.',
      custom: true,
    },
  };
}
function seedFamilyPrototypeState(vm) {
  const existing = JSON.parse(localStorage.getItem('agapay.planner.v2') || '{}');
  const planning = vm.familyPlanning || {};
  const dateToKey = Object.fromEntries(Object.entries(prototypeWeekDateMap(vm)).map(([key, date]) => [date, key]));
  const userRecipes = {};
  const recipeIdsByTitle = new Map(
    Object.entries(PROTOTYPE_RECIPE_TITLES).map(([id, title]) => [title.toLowerCase(), id])
  );
  (planning.recipes || []).forEach((recipe, index) => {
    const converted = backendRecipeToPrototype(recipe, index);
    userRecipes[converted.id] = converted.recipe;
    recipeIdsByTitle.set(converted.recipe.name.toLowerCase(), converted.id);
  });
  const plan = {};
  (planning.meals || []).forEach((meal) => {
    const dayKey = dateToKey[meal.date];
    if (!dayKey) return;
    ['breakfast', 'lunch', 'dinner'].forEach((slot) => {
      const title = learnMealSlotValue(meal, slot);
      if (!title) return;
      let recipeId = recipeIdsByTitle.get(String(title).toLowerCase());
      if (!recipeId) {
        recipeId = `agp_${dayKey}_${slot}`;
        userRecipes[recipeId] = {
          name: title,
          types: [slot],
          level: 'oilwine',
          time: '30 min',
          servings: 4,
          glyph: '🍲',
          ingredients: [],
          note: 'Saved from AGAPAY Learn.',
          custom: true,
        };
        recipeIdsByTitle.set(String(title).toLowerCase(), recipeId);
      }
      plan[`${dayKey}-${slot}`] = recipeId;
    });
  });
  const events = (planning.events || []).map((event, index) => ({
    id: event.id || `agp_event_${index + 1}`,
    type: event.eventType || 'Appointment',
    title: event.title || 'Family event',
    dayKey: dateToKey[event.date] || 'd3',
    time: event.startTime || '',
    who: event.location || 'Family',
    note: event.notes || '',
  }));
  const pantry = (planning.groceryItems || [])
    .filter((item) => item.pantry || item.inPantry)
    .map((item) => item.name)
    .filter(truthyLearn5);
  const manualGroceries = (planning.groceryItems || [])
    .filter((item) => !(item.pantry || item.inPantry))
    .map((item, index) => ({
      id: item.id || `agp_grocery_${index + 1}`,
      aisle: item.category || 'Pantry',
      label: item.quantity ? `${item.quantity} ${item.name}` : item.name,
    }))
    .filter((item) => item.label);
  const dayKeyByLabel = Object.fromEntries(
    prototypeDaySeeds(vm).map((day) => [String(day.long || day.weekday || '').toLowerCase(), day.key])
  );
  const chores = {};
  const choreDetails = {};
  (planning.chores || []).forEach((chore) => {
    const assignee = chore.assignee || 'Everyone';
    const dayKey = dayKeyByLabel[String(chore.day || '').toLowerCase()] || '';
    if (dayKey && chore.title) {
      const key = `${assignee}::${dayKey}`;
      chores[key] = chore.title;
      choreDetails[key] = {
        id: chore.id || '',
        title: chore.title || '',
        assignee,
        cadence: chore.cadence || 'weekly',
        day: chore.day || '',
        dayOfMonth: chore.dayOfMonth || '',
        quarterMonth: chore.quarterMonth || '',
        timeOfDay: chore.timeOfDay || 'Anytime',
        notes: chore.notes || '',
        completed: Boolean(chore.completed),
      };
    }
  });
  const seed = {
    email: learnAccountEmail(),
    ui: {
      view: new URLSearchParams(window.location.search).get('view') || 'week',
      scope: new URLSearchParams(window.location.search).get('scope') || 'lessons',
      tab: new URLSearchParams(window.location.search).get('tool') || 'plan',
    },
    days: prototypeDaySeeds(vm),
    month: prototypeMonthSeed(vm),
    setup: prototypeSetupSeed(vm),
    kids: prototypeKidsSeed(vm),
    pantry,
    chores,
    feast: {
      dateLong: (vm.week?.days || []).find((day) => day.feast)?.shortDate || '',
      name: (vm.week?.days || []).find((day) => day.feast)?.feast || 'Upcoming Feast',
      tasks: [],
    },
  };
  localStorage.setItem('agapay.planner.seed.v1', JSON.stringify(seed));
  if (existing?.__agapayBackendSynced) return;
  localStorage.setItem(
    'agapay.planner.v2',
    JSON.stringify({
      __agapayBackendSynced: true,
      plan,
      pantry,
      userRecipes,
      manualGroceries,
      events,
      chores,
      choreDetails,
      groceryChecked: {},
      feastPlan: {},
      google: {
        open: false,
        connected: false,
        email: learnAccountEmail(),
        last: '',
        layers: { lessons: true, terms: true, feasts: true, events: true, chores: false },
      },
    })
  );
}
function wireFamilyPrototypeBackend(vm, frame) {
  let lastSeen = localStorage.getItem('agapay.planner.v2') || '';
  let lastPosted = localStorage.getItem('agapay.planner.v2.backendHash') || '';
  let syncTimer = null;
  const status = document.createElement('div');
  status.className = 'learn-prototype-sync-status';
  status.textContent = 'Family Planner sync is ready.';
  frame.closest('.learn-prototype-embed')?.prepend(status);
  const syncNow = async () => {
    const raw = localStorage.getItem('agapay.planner.v2') || '';
    if (!raw || raw === lastPosted) return;
    let state;
    try {
      state = JSON.parse(raw);
    } catch {
      return;
    }
    status.textContent = 'Saving Family Planner...';
    status.dataset.state = 'saving';
    try {
      await apiPost('/api/learn/family-planning', prototypeStateToFamilyPlanningPayload(vm, state));
      lastPosted = raw;
      localStorage.setItem('agapay.planner.v2.backendHash', raw);
      status.textContent = 'Family Planner saved.';
      status.dataset.state = 'saved';
    } catch (error) {
      status.textContent = error.message || 'Family Planner could not save.';
      status.dataset.state = 'error';
    }
  };
  const scheduleSync = () => {
    window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(syncNow, 650);
  };
  const poll = window.setInterval(() => {
    const current = localStorage.getItem('agapay.planner.v2') || '';
    if (current !== lastSeen) {
      lastSeen = current;
      scheduleSync();
    }
  }, 900);
  frame.addEventListener(
    'load',
    () => {
      lastSeen = localStorage.getItem('agapay.planner.v2') || '';
      scheduleSync();
    },
    { once: true }
  );
  window.addEventListener(
    'beforeunload',
    () => {
      window.clearInterval(poll);
    },
    { once: true }
  );
}
function renderTefaFormation(vm) {
  const rhythmContent = vm.rhythms?.length
    ? vm.rhythms
        .map(
          (item) =>
            `<div style="display:flex;align-items:center;gap:12px;padding:11px 0;border-top:1px solid var(--line);">${check(item.complete)}<span><strong style="display:block;font-size:14px;">${html(item.title)}</strong>${item.note ? `<small class="learn-muted">${html(item.note)}</small>` : ''}</span></div>`
        )
        .join('')
    : emptyState('Add an optional household routine in Setup.');
  const memoryContent = vm.recitation?.length
    ? vm.recitation
        .map(
          (item) =>
            `<div style="padding:11px 0;border-top:1px solid var(--line);"><div style="display:flex;justify-content:space-between;gap:10px;margin-bottom:7px;"><strong>${html(item.title)}</strong><small class="learn-muted">${html(item.status)}</small></div>${bar(item.progress, 'var(--navy)')}<small class="learn-muted">${html(item.progress)}% complete</small></div>`
        )
        .join('')
    : emptyState('Add poems, speeches, vocabulary, or other memory work in Setup.');
  const enrichmentContent = vm.enrichment?.length
    ? vm.enrichment
        .map(
          (item) =>
            `<div style="display:flex;justify-content:space-between;gap:12px;padding:11px 0;border-top:1px solid var(--line);"><span><strong style="display:block;">${html(item.title)}</strong><small class="learn-muted">${html(item.type)}</small></span><small class="learn-muted">${html(item.minutes)}</small></div>`
        )
        .join('')
    : emptyState('Add art, music, nature study, and other enrichment in Setup.');
  const natureContent = vm.nature?.length
    ? vm.nature
        .map(
          (entry) =>
            `<article style="padding:12px 0;border-top:1px solid var(--line);"><strong style="font-family:'Cormorant Garamond',serif;font-size:20px;">${html(entry.title)}</strong>${entry.location ? `<small style="display:block;color:var(--gold);margin-top:2px;">${html(entry.location)}</small>` : ''}${entry.notes ? `<p style="margin:7px 0 0;color:var(--muted);line-height:1.45;">${html(entry.notes)}</p>` : ''}</article>`
        )
        .join('')
    : emptyState('Nature journal entries appear here as you add them.');
  const body = `<section data-screen-label="Formation & Enrichment" class="learn-stack">
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));gap:16px;align-items:start;">
      ${panel('Household Rhythms', rhythmContent, { icon: '◷' })}
      ${panel('Memory & Recitation', memoryContent, { icon: '☰' })}
      ${panel('Art, Music & Enrichment', enrichmentContent, { icon: '✣' })}
      ${panel('Nature Journal', natureContent, { icon: '✦' })}
    </div>
  </section>`;
  return shell(vm, body);
}
function renderFormation(vm) {
  if (learnExperience().tefaActive) return renderTefaFormation(vm);
  const fastBadge =
    vm.today.fasting && !/no fast/i.test(vm.today.fasting)
      ? `<span style="display:inline-flex;align-items:center;gap:5px;background:rgba(110,47,42,.10);color:var(--burgundy);border:1px solid rgba(110,47,42,.22);border-radius:999px;padding:4px 11px;font-size:11px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;">✦ ${html(vm.today.fasting)}</span>`
      : '';
  const readingButtons = vm.today.readingTasks?.length
    ? `<div style="display:grid;gap:8px;margin-top:14px;">${vm.today.readingTasks
        .map(
          (r) => `
        <button type="button" data-reading-check aria-pressed="false"
          style="display:flex;align-items:center;gap:11px;text-align:left;border:1px solid var(--line);border-radius:11px;background:var(--paper2);padding:11px 13px;font-family:inherit;color:var(--ink);cursor:pointer;transition:border-color .15s;">
          <span data-reading-mark style="flex:none;width:22px;height:22px;border-radius:50%;border:1.5px solid var(--gold);display:grid;place-items:center;color:var(--gold);font-size:11px;"></span>
          <span style="min-width:0;">
            <strong style="display:block;font-size:14px;">${html(r.label)}</strong>
            <small style="color:var(--muted);font-size:12px;">${html(r.ref)}</small>
          </span>
        </button>`
        )
        .join('')}</div>`
    : vm.today.readings
      ? `<p style="margin:12px 0 0;color:#33405a;line-height:1.5;font-size:14px;">${html(vm.today.readings)}</p>`
      : '';
  const saintBlock = vm.today.saint
    ? `<div style="margin-top:14px;padding:12px;background:linear-gradient(135deg,rgba(181,148,47,.08),rgba(181,148,47,.03));border:1px solid rgba(181,148,47,.22);border-radius:10px;">
         <div style="color:var(--gold);font-size:10px;letter-spacing:.14em;font-weight:800;text-transform:uppercase;margin-bottom:4px;">Commemorated Today</div>
         <strong style="font-family:'Cormorant Garamond',serif;font-size:17px;color:var(--ink);line-height:1.25;">${html(vm.today.saint)}</strong>
       </div>`
    : '';
  const troparionBlock = vm.today.troparion
    ? `<div style="margin-top:12px;padding:12px 14px;border-left:3px solid var(--goldsoft);background:rgba(255,255,255,.5);border-radius:0 8px 8px 0;">
         <div style="color:var(--gold);font-size:10px;letter-spacing:.14em;font-weight:800;text-transform:uppercase;margin-bottom:5px;">Troparion</div>
         <p style="margin:0;font-family:'Cormorant Garamond',serif;font-size:16px;line-height:1.55;color:#2a3550;font-style:italic;">${html(vm.today.troparion)}</p>
       </div>`
    : '';
  const todayPanel = panel(
    'Today in the Church',
    `
    <div style="display:flex;align-items:baseline;flex-wrap:wrap;gap:10px;margin-bottom:6px;">
      <h2 style="font-family:'Cormorant Garamond',serif;font-size:28px;line-height:1.05;margin:0;color:var(--ink);">${html(vm.today.title)}</h2>
      <small class="learn-muted-sm">${html(vm.today.date)}</small>
    </div>
    ${fastBadge}
    ${readingButtons}
    ${saintBlock}
    ${troparionBlock}`,
    { icon: '☩', largeTitle: false, style: '' }
  );
  const rhythmsContent = vm.rhythms.length
    ? vm.rhythms
        .map(
          (item) => `
        <div style="display:flex;align-items:center;gap:12px;padding:11px 0;border-top:1px solid var(--line);">
          ${check(item.complete)}
          <div style="min-width:0;">
            <strong style="font-size:14px;display:block;">${html(item.title)}</strong>
            ${item.note ? `<small style="color:var(--muted);font-size:12px;">${html(item.note)}</small>` : ''}
          </div>
        </div>`
        )
        .join('')
    : emptyState('Add daily rhythms in Setup — Morning Prayer, Readings, Scripture memory.');
  const rhythmsPanel = panel('Daily Household Rhythms', rhythmsContent, { icon: '✥' });
  const feastItems = vm.feasts.length
    ? vm.feasts
        .map(
          (feast) => `
        <div style="display:grid;grid-template-columns:56px 1fr;gap:12px;padding:11px 0;border-top:1px solid var(--line);align-items:start;">
          <div style="text-align:center;background:linear-gradient(180deg,var(--navy),#1b2c4a);border-radius:9px;padding:8px 4px;border:1px solid rgba(181,148,47,.28);">
            <div style="color:var(--gold);font-size:18px;">✦</div>
            <div style="color:#f3ead4;font-size:10px;line-height:1.2;margin-top:2px;">${html(feast.date || 'Soon')}</div>
          </div>
          <div>
            <strong style="font-family:'Cormorant Garamond',serif;font-size:17px;line-height:1.2;display:block;">${html(feast.title)}</strong>
            ${feast.fasting ? `<small style="color:var(--burgundy);font-size:11px;font-weight:700;">${html(feast.fasting)}</small>` : ''}
          </div>
        </div>`
        )
        .join('')
    : emptyState('Connect a calendar source to see upcoming feasts.');
  const feastsPanel = panel(
    'Upcoming Feasts',
    `${feastItems}<a href="/myagapay/learn/planner" style="display:block;margin-top:10px;text-align:center;font-size:13px;color:var(--gold);text-decoration:none;border:1px solid var(--line);border-radius:9px;padding:9px;">View full calendar →</a>`,
    { icon: '☩' }
  );
  const catechesisPanel = panel(
    'Catechesis',
    `
    <small style="color:var(--gold);letter-spacing:.12em;text-transform:uppercase;font-size:10px;">${html(vm.catechesis.progress) || 'Current Lesson'}</small>
    <strong style="display:block;font-family:'Cormorant Garamond',serif;font-size:22px;margin:6px 0 8px;color:var(--ink);">${html(vm.catechesis.title)}</strong>
    <p style="margin:0;color:#33405a;line-height:1.5;font-size:14px;">${html(vm.catechesis.currentLesson)}</p>
    ${vm.catechesis.topic ? `<small style="display:block;margin-top:8px;color:var(--muted);">${html(vm.catechesis.topic)}</small>` : ''}`,
    { icon: '✥' }
  );
  const memoryContent = vm.recitation.length
    ? vm.recitation
        .map(
          (item) => `
        <div style="padding:10px 0;border-top:1px solid var(--line);">
          <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:6px;">
            <strong style="font-size:14px;">${html(item.title)}</strong>
            <small style="color:var(--muted);white-space:nowrap;font-size:11px;">${html(item.status)}</small>
          </div>
          ${bar(item.progress, 'var(--navy)')}
          <small style="color:var(--muted);font-size:11px;">${item.progress}% memorised</small>
        </div>`
        )
        .join('')
    : emptyState('Add recitation tracks in Setup — Psalms, Catechism, Scripture.');
  const memoryPanel = panel('Recitation & Memory', memoryContent, { icon: '☰' });
  const hymnContent = vm.hymns.length
    ? vm.hymns
        .map(
          (hymn) => `
        <div style="padding:11px 0;border-top:1px solid var(--line);">
          <strong style="display:block;font-size:14px;">${html(hymn.title)}</strong>
          <small style="color:var(--muted);font-size:12px;">${[hymn.tone, hymn.source].filter(truthyLearn5).join(' · ')}</small>
        </div>`
        )
        .join('')
    : emptyState('Add hymns to study in Setup.');
  const hymnsPanel = panel('Hymn Study', hymnContent, { icon: '♫' });
  const enrichContent = vm.enrichment.length
    ? vm.enrichment
        .map(
          (item) => `
        <div style="display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid var(--line);align-items:center;">
          <span style="min-width:0;">
            <strong style="font-size:13px;display:block;">${html(item.title)}</strong>
            ${item.type ? `<small style="color:var(--muted);font-size:11px;text-transform:capitalize;">${html(item.type)}</small>` : ''}
          </span>
          <span style="color:var(--muted);font-size:12px;white-space:nowrap;">${html(item.minutes)}</span>
        </div>`
        )
        .join('')
    : emptyState('Add enrichment blocks in Setup.');
  const enrichPanel = panel('Enrichment', enrichContent, { icon: '✣' });
  const natureContent = vm.nature?.length
    ? vm.nature
        .map(
          (entry) => `
        <div style="padding:10px 0;border-top:1px solid var(--line);">
          <strong style="display:block;font-size:14px;">${html(entry.title)}</strong>
          ${entry.location ? `<small style="color:var(--muted);font-size:12px;">📍 ${html(entry.location)}</small>` : ''}
          ${entry.notes ? `<p style="margin:5px 0 0;font-size:13px;color:#33405a;line-height:1.4;">${html(entry.notes)}</p>` : ''}
        </div>`
        )
        .join('')
    : emptyState('Nature journal entries will appear here as you add them.');
  const naturePanel = panel('Nature Journal', natureContent, { icon: '✦' });
  const body = `
    <section data-screen-label="Formation" class="learn-stack">

      <div style="display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr) minmax(0,1fr);gap:16px;align-items:start;">
        ${todayPanel}
        ${rhythmsPanel}
        ${feastsPanel}
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;align-items:start;">
        ${catechesisPanel}
        ${memoryPanel}
        ${hymnsPanel}
        ${enrichPanel}
        ${naturePanel}
      </div>

    </section>`;
  return shell(vm, body);
}
function bookCover(book = {}, icon = '☰') {
  const title = String(book.title || 'Book')
    .split(/\s+/)
    .slice(0, 3)
    .join(' ');
  return `<div style="width:58px;height:82px;flex:none;border-radius:7px;border:1.5px solid var(--goldsoft);background:linear-gradient(145deg,var(--navy),#1b2c4a 58%,#6e2f2a);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08),0 8px 18px rgba(20,40,70,.14);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#f7e8bd;padding:7px;gap:5px;"><span style="font-size:17px;color:var(--gold2);">${icon}</span><small style="font-size:10px;line-height:1.05;">${html(title)}</small></div>`;
}
function learnMealSlotValue(meal, slot) {
  if (slot === 'breakfast' || slot === 'lunch' || slot === 'dinner') return meal?.[slot];
  return void 0;
}
function truthyLearn6(value) {
  return Boolean(value);
}
function renderBooks(vm) {
  const tefaActive = learnExperience().tefaActive;
  const libraryColumns = tefaActive ? '2fr 1.1fr 1fr .6fr 1fr' : '2fr 1.1fr 1fr .6fr .7fr 1fr';
  const readAloudCards = vm.readAlouds.length
    ? vm.readAlouds
        .map(
          (book) => `
        <article style="display:flex;gap:14px;background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:14px;min-width:0;box-shadow:0 1px 3px rgba(20,40,70,.04);">
          ${bookCover(book, '☰')}
          <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;">
            <strong style="font-family:'Cormorant Garamond',serif;font-size:19px;line-height:1.12;color:var(--ink);">${html(book.title)}</strong>
            <span style="font-size:12px;color:var(--muted);">${html(book.author)}</span>
            <span style="font-size:12px;color:var(--gold);font-weight:700;letter-spacing:.04em;">${html(book.assignment || book.stream || 'Household')}</span>
            <div style="margin-top:auto;padding-top:10px;">
              ${bar(book.progress)}
              <small style="display:block;color:var(--gold);font-weight:700;margin-top:4px;">${html(book.progress)}% complete</small>
            </div>
          </div>
        </article>`
        )
        .join('')
    : emptyState('Add read-alouds in Setup to track progress here.');
  const libraryRows = vm.library.length
    ? vm.library
        .map(
          (book, i) => `
        <div style="display:grid;grid-template-columns:${libraryColumns};gap:10px;align-items:center;padding:10px 4px;border-top:1px solid var(--line);font-size:13px;background:${i % 2 ? 'var(--paper2)' : 'transparent'};">
          <span style="display:flex;align-items:center;gap:9px;min-width:0;">
            ${bookCover(book, '☰')}
            <span style="min-width:0;">
              <strong style="display:block;color:var(--ink);font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${html(book.title)}</strong>
              <small class="learn-muted">${html(book.assignment || '')}</small>
            </span>
          </span>
          <span style="color:var(--ink);">${html(book.author)}</span>
          <span class="learn-muted">${html(book.category)}</span>
          <span class="learn-muted">${html(book.ages || '—')}</span>
          ${tefaActive ? '' : `<span style="${book.orthodox ? 'color:var(--gold);font-weight:700;' : 'color:var(--muted);'}">${book.orthodox ? 'Orthodox' : '—'}</span>`}
          <span>${bar(book.progress)}<small style="color:var(--gold);font-weight:700;">${html(book.progress)}%</small></span>
        </div>`
        )
        .join('')
    : `<div style="padding:18px 4px;color:var(--muted);font-style:italic;">Add books in Setup to build the household library.</div>`;
  const libraryHeader = `
    <div style="display:grid;grid-template-columns:${libraryColumns};gap:10px;padding:0 4px 10px;border-bottom:1px solid var(--line);font-size:10px;letter-spacing:.1em;color:var(--muted);font-weight:700;text-transform:uppercase;">
      <span>Title</span><span>Author</span><span>Category</span><span>Ages</span>${tefaActive ? '' : '<span>Orthodox</span>'}<span>Progress</span>
    </div>`;
  const pacingContent = vm.pacing.weeks.length
    ? `<strong style="font-family:'Cormorant Garamond',serif;font-size:20px;display:block;margin-bottom:4px;">${html(vm.pacing.title)}</strong>
       <small class="learn-muted">${html(vm.pacing.subtitle)}${vm.pacing.chaptersPerWeek ? ` · ${html(vm.pacing.chaptersPerWeek)} ch/wk` : ''}</small>
       ${vm.pacing.weeks
         .map(
           (week, i) => `
         <div style="display:grid;grid-template-columns:52px 1fr 52px;gap:8px;border-top:1px solid var(--line);padding:8px 0;font-size:13px;align-items:center;">
           <span class="learn-muted">Wk ${html(week.week)}</span>
           <strong style="font-size:14px;">${html(week.chapters)}</strong>
           <span style="color:var(--muted);text-align:right;">${html(week.pages)}</span>
         </div>`
         )
         .join('')}`
    : emptyState('Add a read-aloud with start and end chapters in Setup.');
  const copyworkContent = vm.copywork.length
    ? vm.copywork
        .map(
          (source) => `
        <div style="padding:9px 0;border-top:1px solid var(--line);">
          <strong style="display:block;font-size:14px;">${html(source.title)}</strong>
          <small style="color:var(--muted);font-size:12px;line-height:1.4;">${html(source.detail)}</small>
        </div>`
        )
        .join('')
    : '';
  const suggestionsContent = vm.suggestions.length
    ? vm.suggestions
        .map(
          (s) => `
        <div style="display:flex;gap:12px;padding:11px 0;border-top:1px solid var(--line);align-items:flex-start;">
          <span style="flex:none;width:36px;height:36px;border-radius:50%;background:${s.color};color:#f3ead4;display:flex;align-items:center;justify-content:center;font-size:16px;">✥</span>
          <div>
            <strong style="font-family:'Cormorant Garamond',serif;font-size:17px;display:block;line-height:1.2;">${html(s.title)}</strong>
            <small style="color:var(--muted);font-size:12px;line-height:1.3;">${html(s.subtitle)}</small>
          </div>
        </div>`
        )
        .join('')
    : '';
  const body = `
    <section data-screen-label="Books" class="learn-stack">

      <div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap;">

        <div style="flex:1 1 620px;min-width:0;display:flex;flex-direction:column;gap:16px;">

          ${panel(
            'Current Read-Alouds',
            `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;">${readAloudCards}</div>`,
            { icon: '☰' }
          )}

          ${panel(
            'Household Library',
            `<div style="overflow-x:auto;overflow-y:visible;">
               <div style="min-width:680px;">${libraryHeader}${libraryRows}</div>
             </div>`,
            { icon: '⌂' }
          )}

        </div>

        <aside style="flex:0 1 320px;min-width:240px;display:flex;flex-direction:column;gap:16px;">

          ${panel('Book Pacing', pacingContent, { icon: '♙' })}

          ${vm.copywork.length ? panel('Copywork Sources', copyworkContent, { icon: '✒' }) : ''}

          ${
            vm.suggestions.length
              ? panel(tefaActive ? 'Suggested Living Books' : 'Suggested Orthodox Books', suggestionsContent, {
                  icon: '✥',
                })
              : ''
          }

        </aside>

      </div>

    </section>`;
  return shell(vm, body);
}
function renderReports(vm) {
  const exportButtons = vm.exports
    .map((item) => {
      const label = item.label || item.title || 'Learn Report';
      return `<button type="button" data-report-export="${html(label)}" style="border:1px solid var(--line);background:var(--paper2);border-radius:10px;padding:12px;font-family:inherit;color:var(--ink);display:grid;gap:5px;text-align:left;cursor:pointer;"><strong>${html(label)}</strong><small class="learn-muted">${html(item.format)}</small></button>`;
    })
    .join('');
  const subjectRows = vm.subjectProgress.length
    ? vm.subjectProgress
        .map(
          (row) =>
            `<tr style="border-top:1px solid var(--line);"><td style="padding:10px;font-weight:700;">${html(row.subjectTitle)}</td><td style="padding:10px;">${html(row.childName)}</td><td style="padding:10px;">${html(row.formLabel)}</td><td style="padding:10px;">${html(row.source || row.subjectType)}</td><td style="padding:10px;">${html(row.completed)} / ${html(row.total)} ${html(row.progressionType)}</td><td style="padding:10px;min-width:130px;">${bar(row.percent, row.color)}<small>${html(row.percent)}%</small></td><td style="padding:10px;text-transform:capitalize;color:var(--gold);">${html(row.status)}</td></tr>`
        )
        .join('')
    : `<tr><td colspan="7" style="padding:18px;color:var(--muted);">Add subject ranges and Done Through progress in Setup to generate state-reporting rows.</td></tr>`;
  const body = `
    <section data-screen-label="Reports" class="learn-stack">
      <div style="display:grid;grid-template-columns:repeat(4,minmax(170px,1fr));gap:14px;">${vm.stats.map((stat) => `<div style="background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:18px;display:flex;gap:13px;align-items:center;"><span style="width:44px;height:44px;border-radius:50%;background:${stat.color};color:#f3ead4;display:flex;align-items:center;justify-content:center;">✥</span><span><small style="display:block;color:var(--gold);letter-spacing:.12em;text-transform:uppercase;">${html(stat.label)}</small><strong style="font-family:'Cormorant Garamond',serif;font-size:25px;">${html(stat.value)}</strong><small style="display:block;color:var(--muted);">${html(stat.sub)}</small></span></div>`).join('')}</div>
      <div style="display:grid;grid-template-columns:1fr 360px;gap:16px;align-items:start;">
        ${panel('Child Progress Overview', vm.children.map((child) => `<div style="display:grid;grid-template-columns:42px 1fr 150px;gap:12px;align-items:center;padding:12px 0;border-top:1px solid var(--line);"><span style="width:38px;height:38px;border-radius:50%;background:${child.color};color:#f3ead4;display:flex;align-items:center;justify-content:center;">${html(child.initial)}</span><div><strong>${html(child.name)}</strong><small style="display:block;color:var(--muted);">${html(child.grade)} · Age ${html(child.age)} · ${html(child.summary)}</small><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px;"><span><small class="learn-muted">Lessons ${html(child.lessons.done)} / ${html(child.lessons.total)}</small>${bar(child.lessons.percent, child.color)}</span><span><small class="learn-muted">Read-aloud ${html(child.readAloud.percent)}%</small>${bar(child.readAloud.percent, child.color)}</span></div></div><span style="text-transform:capitalize;color:var(--gold);">${html(child.status)}</span></div>`).join(''), { icon: '✥' })}
        ${panel('Year-End Report Preview', `<div style="border:1px solid var(--line);background:#fffaf0;border-radius:10px;min-height:260px;padding:26px;text-align:center;"><div style="color:var(--gold);font-size:32px;">✥</div><h2 style="font-family:'Cormorant Garamond',serif;margin:12px 0 4px;">${html(vm.pdf.title)}</h2><p>${html(vm.pdf.familyName)}</p><small style="display:block;color:var(--muted);">Generated from Learn setup progress, narrations, lessons, and attendance.</small><div style="text-align:left;margin-top:18px;color:#34405a;font-size:13px;">${vm.pdf.summary.map((line) => `<div style="border-top:1px solid var(--line);padding:8px 0;">${html(line)}</div>`).join('')}</div></div><button type="button" data-report-pdf style="margin-top:12px;width:100%;background:var(--navy);color:#fff;border:none;border-radius:10px;padding:11px;font-family:inherit;cursor:pointer;">Print Beautiful Report</button>`, { icon: '☰' })}
      </div>
      ${panel('State Reporting Subject Progress', `<div style="overflow:auto;"><table style="width:100%;border-collapse:collapse;font-size:14px;"><thead><tr style="color:var(--gold);font-size:11px;letter-spacing:.12em;text-transform:uppercase;"><th style="text-align:left;padding:8px;">Subject</th><th style="text-align:left;padding:8px;">Student</th><th style="text-align:left;padding:8px;">Form</th><th style="text-align:left;padding:8px;">Source</th><th style="text-align:left;padding:8px;">Progress</th><th style="text-align:left;padding:8px;">Complete</th><th style="text-align:left;padding:8px;">Status</th></tr></thead><tbody>${subjectRows}</tbody></table></div>`, { icon: '▤' })}
      ${panel('Narration Log', `<div style="overflow:auto;"><table style="width:100%;border-collapse:collapse;font-size:14px;"><tbody>${vm.narrations.map((log) => `<tr style="border-top:1px solid var(--line);"><td style="padding:10px;">${html(log.date)}</td><td style="padding:10px;">${html(log.child)}</td><td style="padding:10px;">${html(log.source)}</td><td style="padding:10px;text-transform:capitalize;">${html(log.type)}</td><td style="padding:10px;color:var(--muted);">${html(log.note)}</td></tr>`).join('')}</tbody></table></div>`, { icon: '✒' })}
      ${panel('Compliance-Friendly Exports', `<div style="display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:12px;">${exportButtons}</div>`, { icon: '▤' })}
    </section>`;
  return shell(vm, body);
}
function gradeOption(value, selectedValue) {
  return `<option value="${html(value)}" ${value === selectedValue ? 'selected' : ''}>${html(value || 'Select')}</option>`;
}
function renderGradeTermFields(course, grade) {
  return `
    <fieldset class="learn-grade-term" data-grade-term="${grade.termIndex}">
      <legend>Term ${grade.termIndex}</legend>
      <label>Score
        <input name="numericScore" inputmode="decimal" value="${html(grade.numericScore)}" placeholder="96" />
      </label>
      <label>Grade
        <select name="letterGrade">
          ${['', 'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F'].map((value) => gradeOption(value, grade.letterGrade)).join('')}
        </select>
      </label>
      <label>Attendance
        <input name="attendanceDays" inputmode="numeric" value="${html(grade.attendanceDays)}" placeholder="60" />
      </label>
      <label class="learn-grade-notes">Narrative notes
        <textarea name="teacherNotes" rows="3" placeholder="Narrative evaluation for this course and term">${html(grade.teacherNotes)}</textarea>
      </label>
    </fieldset>
  `;
}
function renderGradeCourseEditor(course, vm, index) {
  return `
    <article class="learn-grade-course" data-grade-course data-course-id="${html(course.id)}">
      <header>
        <span style="--course-color:${html(course.color)}">${html(String(index + 1))}</span>
        <div>
          <input name="courseTitle" value="${html(course.courseTitle)}" aria-label="Course title" />
          <small>${html(course.subjectCategory)} · Grade ${html(course.gradeLevel)} · ${html(course.creditHours)} credit${Number(course.creditHours) === 1 ? '' : 's'}</small>
        </div>
        <button type="button" data-grade-remove-course aria-label="Remove course">×</button>
      </header>
      <div class="learn-grade-course-meta">
        <label>Subject
          <select name="subjectCategory">
            ${vm.subjectCategories.map((category) => `<option value="${html(category)}" ${category === course.subjectCategory ? 'selected' : ''}>${html(category)}</option>`).join('')}
          </select>
        </label>
        <label>Grade level
          <select name="gradeLevel">
            ${[9, 10, 11, 12].map((gradeLevel) => `<option value="${gradeLevel}" ${Number(course.gradeLevel) === gradeLevel ? 'selected' : ''}>${gradeLevel}</option>`).join('')}
          </select>
        </label>
        <label>Credit hours
          <input name="creditHours" inputmode="decimal" value="${html(course.creditHours)}" />
        </label>
      </div>
      <div class="learn-grade-term-grid">
        ${course.grades.map((grade) => renderGradeTermFields(course, grade)).join('')}
      </div>
    </article>
  `;
}
function renderTestScoreRow(entry = {}) {
  const isSat = entry.testType === 'SAT';
  const id = entry.id || '';
  const val = (v) => (v === null || v === void 0 ? '' : v);
  if (isSat) {
    return `<article class="learn-grade-course" data-test-score data-test-type="SAT" data-score-id="${html(id)}">
      <header><span style="--course-color:var(--gold);">SAT</span><div><input name="testDate" type="date" value="${html(entry.testDate || '')}" aria-label="Test date" /><small>SAT</small></div><button type="button" data-test-score-remove aria-label="Remove score">×</button></header>
      <div class="learn-grade-course-meta">
        <label>Total Score<input name="totalScore" inputmode="numeric" value="${html(val(entry.totalScore))}" placeholder="1200" /></label>
        <label>Reading/Writing<input name="readingWritingScore" inputmode="numeric" value="${html(val(entry.readingWritingScore))}" placeholder="620" /></label>
        <label>Math<input name="mathScore" inputmode="numeric" value="${html(val(entry.mathScore))}" placeholder="580" /></label>
      </div>
    </article>`;
  }
  return `<article class="learn-grade-course" data-test-score data-test-type="ACT" data-score-id="${html(id)}">
    <header><span style="--course-color:var(--navy);">ACT</span><div><input name="testDate" type="date" value="${html(entry.testDate || '')}" aria-label="Test date" /><small>ACT</small></div><button type="button" data-test-score-remove aria-label="Remove score">×</button></header>
    <div class="learn-grade-course-meta">
      <label>Composite<input name="compositeScore" inputmode="numeric" value="${html(val(entry.compositeScore))}" placeholder="27" /></label>
      <label>English<input name="englishScore" inputmode="numeric" value="${html(val(entry.englishScore))}" placeholder="26" /></label>
      <label>Math<input name="mathScore" inputmode="numeric" value="${html(val(entry.mathScore))}" placeholder="27" /></label>
      <label>Reading<input name="readingScore" inputmode="numeric" value="${html(val(entry.readingScore))}" placeholder="28" /></label>
      <label>Science<input name="scienceScore" inputmode="numeric" value="${html(val(entry.scienceScore))}" placeholder="26" /></label>
      <label>Writing (optional)<input name="writingScore" inputmode="numeric" value="${html(val(entry.writingScore))}" placeholder="8" /></label>
    </div>
  </article>`;
}
function renderTestScoresPanel(vm) {
  const scores = vm.testScores || [];
  const rows = scores.length ? scores.map((entry) => renderTestScoreRow(entry)).join('') : '';
  return panel(
    'Test Scores',
    `
    <p class="learn-muted" style="margin:0 0 12px;font-size:13px;">Add ACT or SAT results as they come in — they print directly on this student's transcript.</p>
    <div class="learn-grades-actions" style="margin-bottom:12px;">
      <button type="button" data-test-score-add="ACT">Add ACT Score</button>
      <button type="button" data-test-score-add="SAT">Add SAT Score</button>
      <button type="button" data-test-scores-save>Save Test Scores</button>
    </div>
    <div data-test-scores-status class="learn-grades-status" aria-live="polite"></div>
    <div class="learn-grade-editor" data-test-score-list>${rows || emptyState('No ACT or SAT scores recorded yet for this student.')}</div>
  `,
    { icon: '✎' }
  );
}
function renderGrades(vm) {
  const selectedCourses = vm.childCourses;
  const childOptions = vm.children
    .map(
      (child) =>
        `<option value="${html(child.id)}" ${child.id === vm.selectedChildId ? 'selected' : ''}>${html(child.name)}${child.gradeLabel ? ` · ${html(child.gradeLabel)}` : ''}</option>`
    )
    .join('');
  const transcriptRows = selectedCourses.length
    ? selectedCourses
        .map((course) => {
          const finalGrade = [...course.grades].reverse().find((grade) => grade.letterGrade)?.letterGrade || '';
          return `<tr><th scope="row">${html(course.courseTitle)}</th><td>${html(course.subjectCategory)}</td><td>Grade ${html(course.gradeLevel)}</td><td>${html(course.creditHours)}</td><td>${html(finalGrade || 'Open')}</td></tr>`;
        })
        .join('')
    : `<tr><td colspan="5">Add courses to begin transcript tracking.</td></tr>`;
  const body = `
    <section data-screen-label="Grades" class="learn-grades-page">
      <form data-grades-form>
        <div class="learn-grades-toolbar">
          <label>Student
            <select name="childId" data-grades-child>
              ${childOptions}
            </select>
          </label>
          <label>Academic year
            <input name="academicYearName" value="${html(vm.academicYear.name)}" />
            <small class="learn-muted">Entering records for a past year (child started high school before AGAPAY)? Type that year's name here, e.g. "2022-2023 School Year", to switch and add courses for it.</small>
          </label>
          <div class="learn-grades-actions">
            <button type="button" data-grade-add-course>Add Course</button>
            <button type="submit" data-grade-save>Save Grades</button>
          </div>
        </div>

        <div class="learn-grades-summary">
          <article><small>Student</small><strong>${html(vm.selectedChild.name || 'Student')}</strong><span>${html(vm.selectedChild.gradeLabel || 'High school records')}</span></article>
          <article><small>Courses</small><strong>${html(String(selectedCourses.length))}</strong><span>For selected student</span></article>
          <article><small>Credits Earned</small><strong data-grade-summary-credits>${html(vm.summary.totalCredits)}</strong><span>Transcript total</span></article>
          <article><small>Unweighted GPA</small><strong data-grade-summary-gpa>${html(vm.summary.cumulativeGpa)}</strong><span>4.0 scale</span></article>
          <article><small>Attendance</small><strong>${html(String(vm.summary.attendanceDays || 0))}</strong><span>Instructional days</span></article>
        </div>

        ${renderAttendanceTracker(vm)}

        <div data-grades-status class="learn-grades-status" aria-live="polite"></div>

        <div class="learn-grade-editor" data-grade-course-list>
          ${selectedCourses.length ? selectedCourses.map((course, index) => renderGradeCourseEditor(course, vm, index)).join('') : emptyState('No courses have been recorded for this student yet. Add a course to begin the transcript trail.')}
        </div>
      </form>

      ${panel('Transcript Readiness', `<div style="overflow:auto;"><table class="learn-grade-transcript-table"><thead><tr><th>Course</th><th>Subject</th><th>Level</th><th>Credit</th><th>Final</th></tr></thead><tbody>${transcriptRows}</tbody></table></div><div class="learn-grade-print-actions"><a href="${learnSectionHref('print-center')}">Open Print Center</a><button type="button" data-report-export="Report Card" data-report-child-id="${html(vm.selectedChildId)}">Print Report Card</button><button type="button" data-report-export="Transcript" data-report-child-id="${html(vm.selectedChildId)}">Print Transcript</button></div>`, { icon: '▤' })}
      ${renderTestScoresPanel(vm)}
    </section>
  `;
  return shell(vm, body);
}
function renderCoOp(vm) {
  const body = `
    <section data-screen-label="Co-op" class="learn-stack">
      ${panel('Co-op Coming Soon', `<div style="display:grid;grid-template-columns:130px 1fr;gap:22px;align-items:center;"><div style="height:132px;border:1px solid var(--line);border-radius:12px;background:linear-gradient(180deg,#f8f0dd,#efe0ba);display:flex;align-items:center;justify-content:center;color:var(--gold);font-size:54px;">◎</div><div><small style="color:var(--gold);letter-spacing:.16em;text-transform:uppercase;">Future Learn Add-On</small><h2 style="font-family:'Cormorant Garamond',serif;font-size:34px;margin:8px 0 6px;">Co-op tools are coming soon</h2><p style="margin:0;color:#34405a;line-height:1.5;max-width:760px;">For launch, AGAPAY Learn is focused on setup, Today, planning, Church rhythms, formation, books, Grace Mode, and printable household plans. Co-op creation, invitations, and shared schedules will come in a later release.</p></div></div>`, { icon: '◎' })}
      <div style="display:grid;grid-template-columns:repeat(3,minmax(180px,1fr));gap:16px;">
        ${panel('Planned Later', `<div class="learn-list-row">Create or join a co-op</div><div class="learn-list-row">Invite AGAPAY member families</div><div class="learn-list-row">Shared schedules and rotation</div>`, { icon: '▣' })}
        ${panel('Launch Focus', `<div class="learn-list-row">Simple and Advanced Setup</div><div class="learn-list-row">Planner and Print Center</div><div class="learn-list-row">Formation, books, and Grace Mode</div>`, { icon: '✥' })}
        ${panel('Status', `<strong style="font-family:'Cormorant Garamond',serif;font-size:26px;">Coming Soon</strong><small style="display:block;color:var(--muted);margin-top:6px;">This tab is intentionally parked for the first revenue-focused launch.</small>`, { icon: '♢' })}
      </div>
    </section>`;
  return shell(vm, body);
}
function scheduledDays(value, legacyFrequency = '') {
  const direct = Array.isArray(value) ? value : String(value || '').split(',');
  const valid = direct
    .map((day) => String(day).trim().toLowerCase())
    .filter((day) => setupWeekdays.some((option) => option.value === day));
  if (valid.length) return [...new Set(valid)];
  const presets = {
    daily: ['mon', 'tue', 'wed', 'thu', 'fri'],
    '4x': ['mon', 'tue', 'wed', 'thu'],
    '3x': ['mon', 'wed', 'fri'],
    '2x': ['tue', 'thu'],
    weekly: ['wed'],
    '1x': ['wed'],
    'as-needed': [],
  };
  return presets[String(legacyFrequency || '').toLowerCase()] || ['mon', 'tue', 'wed', 'thu', 'fri'];
}
function setupDayPicker(value, legacyFrequency = '') {
  const selected = scheduledDays(value, legacyFrequency);
  const summary = selected.length
    ? setupWeekdays
        .filter((day) => selected.includes(day.value))
        .map((day) => day.label)
        .join(' · ')
    : 'Choose days';
  return `<details class="learn-day-picker"><summary><span>Days</span><strong data-day-summary>${html(summary)}</strong></summary><div class="learn-day-picker-menu">${setupWeekdays.map((day) => `<label><input type="checkbox" data-day-choice value="${day.value}" ${selected.includes(day.value) ? 'checked' : ''}>${day.label}</label>`).join('')}</div><input type="hidden" name="scheduledDays" value="${html(selected.join(','))}"></details>`;
}
function setupSourceInput(label, name, value = '') {
  const resolved = String(value || '').trim();
  const link = /^https?:\/\//i.test(resolved)
    ? `<a href="${html(resolved)}" target="_blank" rel="noopener noreferrer" class="learn-source-link">Open source</a>`
    : '';
  return `<label>${html(label)}<input type="text" name="${html(name)}" value="${html(resolved)}" inputmode="url" placeholder="Book title, source note, or https://..." />${link}</label>`;
}
function setupWeeklyPlanFields(value = []) {
  const entries = Array.isArray(value) ? value : String(value || '').split('|');
  return `<details class="learn-weekly-plan-fields"><summary><span>Weekly chapters / lessons / pages</span><strong>Optional</strong></summary><div class="learn-weekly-plan-grid">${Array.from({ length: DEFAULT_TERM_WEEK_COUNT }, (_, index) => `<label>Week ${index + 1}<input type="text" name="weeklyPlans.${index + 1}" value="${html(entries[index] || '')}" placeholder="Ch. 1, pp. 4-9, lesson 2..." /></label>`).join('')}</div></details>`;
}
function setupMultiChildPicker(children = [], selectedIds = []) {
  const selected = Array.isArray(selectedIds)
    ? selectedIds
    : String(selectedIds || '')
        .split(',')
        .map((v) => v.trim())
        .filter(truthyLearn6);
  const summary = selected.length
    ? children
        .filter((child) => selected.includes(child.id))
        .map((child) => child.name || child.firstName || child.id)
        .join(', ')
    : 'Use Form Assignment';
  return `<details class="learn-day-picker learn-child-multi-picker"><summary><span>Specific children</span><strong data-child-multi-summary>${html(summary)}</strong></summary><div class="learn-day-picker-menu">${children.map((child) => `<label><input type="checkbox" data-child-multi-choice value="${html(child.id)}" ${selected.includes(child.id) ? 'checked' : ''}>${html(child.name || child.firstName || child.id)}</label>`).join('')}</div><input type="hidden" name="childIds" value="${html(selected.join(','))}"></details>`;
}
function churchRhythmSetupPanel(vm) {
  const formation = vm.formationSetup || {};
  const tefa = learnExperience().tefaActive;
  const sectionStyle =
    'border:1px solid var(--line);border-radius:13px;background:rgba(255,252,245,.64);padding:14px;display:grid;gap:12px;';
  const sectionTitle = (title, subtitle = '') =>
    `<div><strong style="display:block;font-family:var(--sans);font-size:15px;color:var(--ink);">${html(title)}</strong>${subtitle ? `<small style="display:block;color:var(--muted);line-height:1.35;margin-top:2px;">${html(subtitle)}</small>` : ''}</div>`;
  return `
    <div style="display:grid;gap:14px;">
      <p style="margin:0;color:var(--muted);line-height:1.45;">${tefa ? 'Build a simple household opening routine that helps everyone begin the school day together.' : "This is the household's daily Church anchor. It lives above school subjects because it shapes the day before lesson planning begins."}</p>
      <div style="${sectionStyle}">
        ${sectionTitle('Daily rhythm items', tefa ? 'Morning meeting, read-aloud, movement, planning, and other shared anchors.' : 'Prayer, Gospel, Epistle, saints, feasts, and fasting notes.')}
        <div data-setup-list="formationRhythms" style="display:grid;gap:10px;">${(formation.churchRhythms?.length ? formation.churchRhythms : [{}]).map((rhythm) => formationRhythmSetupRow(rhythm)).join('')}</div>
        <button type="button" data-setup-add-row="formationRhythms" style="border:1px solid var(--line);background:var(--paper2);border-radius:10px;padding:10px 16px;font-family:inherit;">Add ${tefa ? 'Household Rhythm' : 'Church Rhythm'}</button>
      </div>
    </div>`;
}
function setupTileValue(vm, group, panelId, fallback) {
  const tile = vm.setupTiles?.[group]?.[panelId] || {};
  const allowSavedTitle = group !== 'subjects' || learnExperience().tefaActive;
  return {
    ...fallback,
    title: allowSavedTitle ? tile.title || fallback.title : fallback.title,
    detail: allowSavedTitle ? tile.detail || fallback.detail : fallback.detail,
    minutes: tile.minutes || fallback.minutes || '20',
  };
}
function setupSectionCard({ group, panel: panelId, title, detail, count = 0, icon = '✥' }) {
  const controls = `learnSetupPanel-${group}-${panelId}`;
  const countLabel = count ? `${count} item${count === 1 ? '' : 's'}` : 'Open';
  return `<button type="button" class="learn-setup-section-card" data-setup-section-toggle data-setup-section-group="${html(group)}" data-setup-section-panel="${html(panelId)}" aria-expanded="false" aria-controls="${html(controls)}"><small><span class="learn-setup-card-icon" aria-hidden="true">${html(icon)}</span><span>${html(countLabel)}</span></small><strong data-setup-section-card-title>${html(title)}</strong><span data-setup-section-card-detail>${html(detail)}</span><em>Open</em></button>`;
}
function setupSectionPanel({ group, panel: panelId, title, detail = '', minutes = '20', teksUrl = '', content }) {
  const id = `learnSetupPanel-${group}-${panelId}`;
  const hasTileMinutes = group === 'subjects' || (group === 'formation' && panelId !== 'recitation');
  const teksLink = teksUrl
    ? `<a href="${html(teksUrl)}" target="_blank" rel="noopener noreferrer" class="learn-setup-teks-link" style="font-size:12px;color:var(--gold);text-decoration:none;white-space:nowrap;">TEA subject page ↗</a>`
    : '';
  return `<div id="${html(id)}" class="learn-setup-subsection" data-setup-section-group="${html(group)}" data-setup-section-panel="${html(panelId)}" hidden><div class="learn-setup-subsection-header"><div><strong data-setup-section-panel-title>${html(title)}</strong>${detail ? `<span data-setup-section-panel-detail>${html(detail)}</span>` : ''}${teksLink}</div><button type="button" class="learn-setup-subsection-close" data-setup-section-close data-setup-section-group="${html(group)}" data-setup-section-panel="${html(panelId)}">Collapse</button></div><div class="learn-setup-tile-editor"><label>Tile title<input name="setupTiles.${html(group)}.${html(panelId)}.title" data-setup-section-title-input data-setup-section-group="${html(group)}" data-setup-section-panel="${html(panelId)}" value="${html(title)}" /></label><label>Tile description<textarea name="setupTiles.${html(group)}.${html(panelId)}.detail" data-setup-section-detail-input data-setup-section-group="${html(group)}" data-setup-section-panel="${html(panelId)}" rows="2">${html(detail)}</textarea></label>${hasTileMinutes ? `<label>Minutes<input type="number" name="setupTiles.${html(group)}.${html(panelId)}.minutes" data-setup-section-minutes-input value="${html(minutes || '20')}" /></label>` : ''}</div>${content}</div>`;
}
function formationSetupPanel(vm) {
  const tefa = learnExperience().tefaActive;
  const formation = vm.formationSetup || {};
  const currentTermId = vm.schoolYear.currentTermId || vm.term.id;
  const enrichmentBlocks = formation.enrichmentBlocks || [];
  const countByType = (type) =>
    enrichmentBlocks.filter((block) => String(block.blockType || block.type || '').toLowerCase() === type.toLowerCase())
      .length;
  const sections = [
    {
      panel: 'catechesis',
      title: 'Catechesis',
      detail: 'Doctrine, Scripture, faith conversations, and parish formation.',
      icon: '✥',
      type: 'Catechesis',
    },
    {
      panel: 'recitation',
      title: 'Recitation',
      detail: tefa
        ? 'Poems, speeches, vocabulary, facts, and memory work.'
        : 'Creeds, prayers, psalms, Scripture, poems, and speeches.',
      icon: '✦',
      type: 'Recitation & Memory Work',
      rows: formation.recitationTracks || [],
      rowKind: 'recitation',
    },
    {
      panel: 'saints',
      title: 'Saints',
      detail: 'Lives of saints, feast preparation, and century-book notes.',
      icon: '☰',
      type: 'Saints & Feasts',
    },
    {
      panel: 'icons',
      title: 'Icons',
      detail: 'Icon study, sacred art observation, and copywork prompts.',
      icon: '▣',
      type: 'Icon Study',
    },
    {
      panel: 'hymns',
      title: 'Hymns',
      detail: 'Troparia, kontakia, hymn study, and singing practice.',
      icon: '♪',
      type: 'Hymn Study',
    },
    {
      panel: 'artists',
      title: 'Artists',
      detail: 'Artist study, picture study, and visual narration.',
      icon: '◎',
      type: 'Art Study',
    },
    {
      panel: 'composers',
      title: 'Composers',
      detail: tefa
        ? 'Composer study, music history, and attentive listening.'
        : 'Composer study, sacred music, and attentive listening.',
      icon: '♫',
      type: 'Music Study',
    },
    {
      panel: 'folk-songs',
      title: 'Folk Songs',
      detail: 'Folk songs, seasonal songs, and family singing.',
      icon: '♬',
      type: 'Folk Songs',
    },
    {
      panel: 'poetry',
      title: 'Poetry',
      detail: 'Poet study, recitation, copywork, and beautiful language.',
      icon: '✒',
      type: 'Poetry',
    },
    {
      panel: 'shakespeare',
      title: 'Shakespeare',
      detail: 'Plays, scenes, narration, and performance notes.',
      icon: '♜',
      type: 'Shakespeare',
    },
  ]
    .filter((section) => !tefa || !['catechesis', 'saints', 'icons', 'hymns'].includes(section.panel))
    .map((section) => setupTileValue(vm, 'formation', section.panel, section));
  const sectionRows = (section) =>
    section.rowKind === 'recitation'
      ? (section.rows.length ? section.rows : [{}])
          .map((track) => formationRecitationSetupRow(track, vm.children, vm.preferences.groupingMode))
          .join('')
      : (enrichmentBlocks.filter(
          (block) => String(block.blockType || block.type || '').toLowerCase() === section.type.toLowerCase()
        ).length
          ? enrichmentBlocks.filter(
              (block) => String(block.blockType || block.type || '').toLowerCase() === section.type.toLowerCase()
            )
          : [{ blockType: section.type }]
        )
          .map((block) =>
            formationEnrichmentSetupRow(
              { ...block, blockType: block.blockType || section.type },
              vm.children,
              vm.terms,
              currentTermId,
              vm.preferences.groupingMode,
              section.minutes
            )
          )
          .join('');
  const sectionContent = (section) =>
    section.rowKind === 'recitation'
      ? `<div data-setup-list="formationRecitation" style="display:grid;gap:10px;">${sectionRows(section)}</div><button type="button" data-setup-add-row="formationRecitation" style="border:1px solid var(--line);background:var(--paper2);border-radius:10px;padding:10px 16px;font-family:inherit;">Add Recitation</button>`
      : `<div id="learnSetupFormation-${html(section.panel)}" data-setup-list="formationEnrichment" style="display:grid;gap:10px;">${sectionRows(section)}</div><button type="button" data-setup-add-row="formationEnrichment" data-setup-add-target="learnSetupFormation-${html(section.panel)}" data-setup-add-block-type="${html(section.type)}" style="border:1px solid var(--line);background:var(--paper2);border-radius:10px;padding:10px 16px;font-family:inherit;">Add ${html(section.title)}</button>`;
  return `
    <div style="display:grid;gap:14px;">
      <p style="margin:0;color:var(--muted);line-height:1.45;">Each tile is a planning basket. Open the tile you want, add the books, recitations, hymns, poets, artists, or other enrichment you want available, then choose whether each item is shared by the whole family or assigned by ${vm.preferences.groupingMode === 'grades' ? 'grade' : 'Form'}.</p>
      <p class="learn-setup-helper-note"><strong>How this becomes a week:</strong> These enrichment items become draggable subject cards in the Planner Week view. You will be able to drag each one into the day you want, then add chapters, pages, lessons, or notes for that specific day without changing Setup.</p>
      <div class="learn-setup-section-grid">${sections.map((section) => setupSectionCard({ group: 'formation', ...section, count: section.rowKind === 'recitation' ? section.rows.length : countByType(section.type) })).join('')}</div>
      ${sections.map((section) => setupSectionPanel({ group: 'formation', panel: section.panel, title: section.title, detail: section.detail, minutes: section.minutes, content: sectionContent(section) })).join('')}
    </div>`;
}
function formSubjectsSetupPanel(vm, currentTermId) {
  const subjects = vm.subjects || [];
  const standardGroups = [
    {
      panel: 'language',
      title: 'Language Arts',
      detail: 'Reading, narration, copywork, dictation, grammar, composition, and rhetoric.',
      icon: '✎',
      types: ['language-arts'],
      defaultType: 'language-arts',
    },
    {
      panel: 'literature',
      title: 'Literature',
      detail: 'Living books, stories, plays, folk tales, myths, and great tales.',
      icon: '☰',
      types: ['tales', 'literature'],
      defaultType: 'literature',
    },
    {
      panel: 'languages',
      title: 'Classical & Foreign Languages',
      detail: 'Greek, Latin, modern languages, translation, grammar, and oral practice.',
      icon: 'Α',
      types: ['classical-foreign-languages', 'foreign-language', 'classical-languages', 'latin', 'greek'],
      defaultType: 'classical-foreign-languages',
    },
    {
      panel: 'history',
      title: 'History',
      detail: 'History readings, narrations, timelines, biographies, and term projects.',
      icon: '⌁',
      types: ['history'],
      defaultType: 'history',
    },
    {
      panel: 'geography',
      title: 'Geography',
      detail: 'Maps, regions, place study, journeys, and notebook work.',
      icon: '⌖',
      types: ['geography'],
      defaultType: 'geography',
    },
    {
      panel: 'maths',
      title: 'Maths',
      detail: 'Lesson ranges, practice, mastery checks, and progress tracking.',
      icon: '◎',
      types: ['math', 'maths'],
      defaultType: 'math',
    },
    {
      panel: 'sciences',
      title: 'Sciences',
      detail: 'Science, nature study, experiments, notebooks, and observations.',
      icon: '✦',
      types: ['sciences-nature', 'science', 'nature-study'],
      defaultType: 'sciences-nature',
    },
  ];
  const teksFoundationGroups = [
    {
      panel: 'teks-elar',
      title: 'English Language Arts and Reading',
      detail: 'Reading, writing, speaking, listening, composition, grammar, and literacy foundations.',
      icon: '✎',
      types: ['language-arts', 'tales', 'literature', 'speech-communication', 'speech', 'communication'],
      defaultType: 'language-arts',
      teksUrl:
        'https://tea.texas.gov/educators/subject-areas/english-language-arts-and-reading/english-language-arts-and-reading',
    },
    {
      panel: 'teks-mathematics',
      title: 'Mathematics',
      detail: 'Number sense, operations, algebraic reasoning, geometry, measurement, data, and problem solving.',
      icon: '◎',
      types: ['math', 'maths'],
      defaultType: 'math',
      teksUrl: 'https://tea.texas.gov/educators/subject-areas/mathematics/mathematics',
    },
    {
      panel: 'teks-science',
      title: 'Science',
      detail: 'Scientific practices, lab work, earth and space, life science, physical science, and nature study.',
      icon: '✦',
      types: ['science', 'sciences-nature', 'nature-study'],
      defaultType: 'science',
      teksUrl: 'https://tea.texas.gov/educators/subject-areas/science/science',
    },
    {
      panel: 'teks-social-studies',
      title: 'Social Studies',
      detail: 'History, geography, civics, economics, cultures, citizenship, timelines, and primary sources.',
      icon: '⌁',
      types: ['social-studies', 'history', 'geography'],
      defaultType: 'social-studies',
      teksUrl: 'https://tea.texas.gov/educators/subject-areas/social-studies/social-studies',
    },
  ];
  const teksEnrichmentGroups = [
    {
      panel: 'teks-cte',
      title: 'Career and Technical Education',
      detail: 'Career exploration, practical skills, applied projects, entrepreneurship, and technical pathways.',
      icon: '⌘',
      types: ['career-technical-education', 'cte'],
      defaultType: 'career-technical-education',
      teksUrl: 'https://tea.texas.gov/student-readiness-and-high-school/career-and-technical-education',
    },
    {
      panel: 'teks-fine-arts',
      title: 'Fine Arts',
      detail: 'Visual art, music, composer study, artist study, performance, and creative expression.',
      icon: '♪',
      types: ['fine-arts', 'art', 'music'],
      defaultType: 'fine-arts',
      teksUrl: 'https://tea.texas.gov/educators/subject-areas/fine-arts/fine-arts',
    },
    {
      panel: 'teks-health-education',
      title: 'Health Education',
      detail: 'Personal wellness, nutrition, safety, emotional health, family life, and healthy habits.',
      icon: '✚',
      types: ['health-education'],
      defaultType: 'health-education',
      teksUrl: 'https://tea.texas.gov/educators/subject-areas/health-and-physical-education/health-education',
    },
    {
      panel: 'teks-lote',
      title: 'Languages other than English (LOTE)',
      detail: 'Modern languages, classical languages, vocabulary, grammar, conversation, and translation.',
      icon: 'Α',
      types: [
        'languages-other-than-english',
        'classical-foreign-languages',
        'foreign-language',
        'classical-languages',
        'latin',
        'greek',
      ],
      defaultType: 'languages-other-than-english',
      teksUrl: 'https://tea.texas.gov/educators/subject-areas/languages-other-english/languages-other-english',
    },
    {
      panel: 'teks-physical-education',
      title: 'Physical Education (PE)',
      detail: 'Movement, fitness, coordination, outdoor activity, skill practice, and lifelong physical health.',
      icon: '◉',
      types: ['physical-education', 'pe'],
      defaultType: 'physical-education',
      teksUrl: 'https://tea.texas.gov/educators/subject-areas/health-and-physical-education/physical-education',
    },
    {
      panel: 'teks-technology-applications',
      title: 'Technology Applications',
      detail: 'Digital citizenship, computer use, productivity tools, research, coding, and applied technology.',
      icon: '▣',
      types: ['technology-applications', 'technology'],
      defaultType: 'technology-applications',
      teksUrl:
        'https://tea.texas.gov/curriculum-and-instruction/learning-support-and-programs/technology-resources/technology-standards-students-teachers-and-librarians',
    },
  ];
  const groupSets = learnExperience().tefaActive
    ? [
        {
          title: 'Foundation Curriculum',
          note: 'Core, form-based academic subjects required for all students.',
          groups: teksFoundationGroups,
        },
        {
          title: 'Enrichment Curriculum',
          note: 'Mandated enrichment subjects offered to provide a well-rounded education.',
          groups: teksEnrichmentGroups,
        },
      ]
    : [{ title: '', note: '', groups: standardGroups }];
  const groups = groupSets
    .flatMap((set) => set.groups)
    .map((group) => setupTileValue(vm, 'subjects', group.panel, group));
  const subjectsForGroup = (group) =>
    subjects.filter((subject) => group.types.includes(subject.subjectType || subject.type || 'language-arts'));
  const renderGroupSet = (set) => {
    const setGroups = set.groups.map((group) => setupTileValue(vm, 'subjects', group.panel, group));
    return `
      ${set.title ? `<div class="learn-setup-helper-note"><strong>${html(set.title)}:</strong> ${html(set.note)}</div>` : ''}
      <div class="learn-setup-section-grid">
        ${setGroups.map((group) => setupSectionCard({ group: 'subjects', panel: group.panel, title: group.title, detail: group.detail, count: subjectsForGroup(group).length, icon: group.icon })).join('')}
      </div>`;
  };
  return `
    <p style="margin:0 0 12px;color:var(--muted);">Each tile is a subject family. Open only the subject family you are planning right now, then add the books, resources, and lesson streams that belong there.</p>
    <p class="learn-setup-helper-note"><strong>How this becomes a week:</strong> These Form-based subjects become draggable cards in the Planner Week view. After Setup, you will place them into the days you want and can edit the day-specific chapters, pages, lessons, or notes right inside the week.</p>
    ${groupSets.map(renderGroupSet).join('')}
    ${groups
      .map((group) => {
        const rows = subjectsForGroup(group);
        const listId = `learnSetupSubjects-${group.panel}`;
        const renderedRows = (rows.length ? rows : [{ subjectType: group.defaultType }])
          .map((subject) =>
            subjectSetupRow(subject, vm.children, vm.terms, currentTermId, vm.preferences.groupingMode, group.minutes)
          )
          .join('');
        const content = `<div id="${html(listId)}" data-setup-list="subjects" style="display:grid;gap:10px;">${renderedRows}</div><button type="button" data-setup-add-row="subjects" data-setup-add-target="${html(listId)}" data-setup-add-subject-type="${html(group.defaultType)}" style="margin-top:12px;border:1px solid var(--line);background:var(--paper2);border-radius:10px;padding:10px 16px;font-family:inherit;">Add ${html(group.title)} Subject</button>`;
        return setupSectionPanel({
          group: 'subjects',
          panel: group.panel,
          title: group.title,
          detail: group.detail,
          minutes: group.minutes,
          teksUrl: group.teksUrl || '',
          content,
        });
      })
      .join('')}`;
}
function setupStepTarget(step) {
  const text = `${step.id || ''} ${step.title || ''}`.toLowerCase();
  if (text.includes('child') || text.includes('form')) return 'learnSetupChildren';
  if (text.includes('stream')) return 'learnSetupFormation';
  if (
    text.includes('language') ||
    text.includes('math') ||
    text.includes('science') ||
    text.includes('subject') ||
    text.includes('curriculum')
  )
    return 'learnSetupSubjects';
  if (text.includes('literature') || text.includes('book') || text.includes('read')) return 'learnSetupSubjects';
  if (text.includes('church rhythm')) return 'learnSetupChurchRhythm';
  if (text.includes('formation') || text.includes('catechesis') || text.includes('enrichment'))
    return 'learnSetupFormation';
  return 'learnSetupHousehold';
}
function setupStepState(step) {
  const status = String(step.status || '').toLowerCase();
  if (['complete', 'completed', 'done'].includes(status)) return 'is-complete';
  if (status === 'active') return 'is-active';
  return 'is-needed';
}
function setupProgressCard(step) {
  return `<button type="button" class="learn-setup-step ${setupStepState(step)}" data-setup-progress-target="${setupStepTarget(step)}"><small>${html(step.status)}</small><strong>${html(step.title)}</strong><span>${html(step.summary)}</span></button>`;
}
function setupPanelCollapsed(panelId, defaultCollapsed = false) {
  try {
    const saved = localStorage.getItem(`agapay.learn.setupPanel.${panelId}`);
    if (saved === 'collapsed') return true;
    if (saved === 'expanded') return false;
  } catch {}
  return defaultCollapsed;
}
function collapsibleSetupPanel(panelId, title, content, options = {}) {
  const collapsed = setupPanelCollapsed(panelId, Boolean(options.defaultCollapsed));
  const icon = options.icon || '✥';
  const bodyId = `learnSetupPanel-${panelId}`;
  return `
    <section class="learn-setup-collapse-panel ${collapsed ? 'is-collapsed' : ''}" data-setup-collapse-panel="${html(panelId)}">
      <header class="learn-setup-collapse-header">
        <div>
          <span aria-hidden="true">${html(icon)}</span>
          <strong>${html(title)}</strong>
          ${options.summary ? `<small>${html(options.summary)}</small>` : ''}
        </div>
        <button type="button" data-setup-panel-toggle="${html(panelId)}" aria-expanded="${collapsed ? 'false' : 'true'}" aria-controls="${html(bodyId)}">${collapsed ? 'Expand' : 'Minimize'}</button>
      </header>
      <div id="${html(bodyId)}" class="learn-setup-collapse-body" ${collapsed ? 'hidden' : ''}>
        ${content}
      </div>
    </section>`;
}
function simpleSetupDraftKey() {
  let identity = localStorage.getItem('agapayDonorEmail') || 'household';
  try {
    const profile = JSON.parse(localStorage.getItem('agapayDonorProfile') || '{}');
    identity = profile.email || identity;
  } catch {}
  return `agapay.learn.simpleSetup.v1:${String(identity)
    .toLowerCase()
    .replace(/[^a-z0-9@._-]/g, '')}`;
}
function suggestedFormForChild(child = {}) {
  const age = Number.parseInt(child.ageYears, 10);
  if (Number.isFinite(age)) {
    if (age <= 5) return 'Little Ones';
    if (age <= 8) return 'Form I';
    if (age <= 11) return 'Form II';
    if (age <= 14) return 'Form III';
    return 'Form IV';
  }
  const grade = String(child.gradeLabel || '').toLowerCase();
  const number = Number.parseInt(grade.match(/\d+/)?.[0] || '', 10);
  if (grade.includes('pre') || grade.includes('kindergarten') || grade === 'k') return 'Little Ones';
  if (Number.isFinite(number)) {
    if (number <= 3) return 'Form I';
    if (number <= 6) return 'Form II';
    if (number <= 9) return 'Form III';
    return 'Form IV';
  }
  return 'Form I';
}
function defaultSimpleSetupDraft(vm = {}) {
  const existingChildren = Array.isArray(vm.children)
    ? vm.children.map((child, index) => ({
        id: child.id || '',
        clientId: child.id || `child_${Date.now()}_${index}`,
        firstName: child.firstName || child.name || '',
        ageYears: String(child.age || ''),
        gradeLabel: child.grade || '',
        formLabel: child.formLabel || child.form || '',
      }))
    : [];
  return {
    step: 0,
    householdName: vm.household?.name || '',
    parentName: vm.household?.parentName || '',
    calendarType: vm.preferences?.calendarType || 'julian',
    children: existingChildren.length
      ? existingChildren
      : [{ id: '', clientId: `child_${Date.now()}`, firstName: '', ageYears: '', gradeLabel: '', formLabel: '' }],
    useForms: true,
    method: vm.household?.method || 'Unsure',
    starterWeek: true,
  };
}
function loadSimpleSetupDraft(vm) {
  const fallback = defaultSimpleSetupDraft(vm);
  try {
    const stored = JSON.parse(localStorage.getItem(simpleSetupDraftKey()) || 'null');
    if (!stored || typeof stored !== 'object') return fallback;
    return {
      ...fallback,
      ...stored,
      step: Math.max(0, Math.min(SIMPLE_SETUP_STEPS.length - 1, Number(stored.step) || 0)),
      children:
        Array.isArray(stored.children) && stored.children.length
          ? stored.children.map((child, index) => ({
              clientId: child.clientId || `child_${Date.now()}_${index}`,
              id: String(child.id || ''),
              firstName: String(child.firstName || ''),
              ageYears: String(child.ageYears || ''),
              gradeLabel: String(child.gradeLabel || ''),
              formLabel: String(child.formLabel || ''),
            }))
          : fallback.children,
    };
  } catch {
    return fallback;
  }
}
function saveSimpleSetupDraft(draft) {
  localStorage.setItem(simpleSetupDraftKey(), JSON.stringify(draft));
}
function simpleSetupField(label, name, value = '', options = {}) {
  const type = options.type || 'text';
  const placeholder = options.placeholder ? ` placeholder="${html(options.placeholder)}"` : '';
  const min = options.min !== void 0 ? ` min="${html(options.min)}"` : '';
  const max = options.max !== void 0 ? ` max="${html(options.max)}"` : '';
  return `<label class="learn-wizard-field"><span>${html(label)}</span><input name="${html(name)}" type="${html(type)}" value="${html(value)}"${placeholder}${min}${max}></label>`;
}
function simpleSetupStepBody(draft) {
  if (draft.step === 0) {
    const churchCalendarField = isOdysseyLearnContext()
      ? ''
      : `<label class="learn-wizard-field"><span>Church calendar</span><select name="wizard.calendarType"><option value="julian" ${draft.calendarType === 'julian' ? 'selected' : ''}>Julian</option><option value="revised-julian" ${draft.calendarType === 'revised-julian' ? 'selected' : ''}>Revised-Julian</option></select></label>`;
    const laterCopy = isOdysseyLearnContext()
      ? 'You can add terms, books, and detailed subjects later.'
      : 'You can add parish, terms, books, and detailed subjects later.';
    return `<div class="learn-wizard-step-copy"><span>Begin with the people, not the paperwork.</span><h2>Tell us about your household.</h2><p>This is enough to personalize Learn. ${laterCopy}</p></div><div class="learn-wizard-fields">${simpleSetupField('Household name', 'wizard.householdName', draft.householdName, { placeholder: 'The Harper Family' })}${simpleSetupField('Your name', 'wizard.parentName', draft.parentName, { placeholder: 'Taylor' })}${churchCalendarField}</div>`;
  }
  if (draft.step === 1) {
    const methods = [
      ['Charlotte Mason', 'Living books, narration, short lessons, and generous enrichment.'],
      ['Orthodox Classical', 'Classical formation, language, history, and ordered study.'],
      ['Traditional', 'Familiar subjects, grade-level structure, and steady daily practice.'],
      ['Eclectic', 'A flexible blend chosen to fit each child and season.'],
      ['Unsure', 'Start gently now and refine your approach later.'],
    ];
    return `<div class="learn-wizard-step-copy"><span>Your household rhythm</span><h2>Which approach feels closest?</h2><p>This shapes the order and language of Advanced Setup. It never locks you into a curriculum, and changing it later never deletes saved work.</p></div><div class="learn-wizard-methods">${methods.map(([value, detail]) => `<label><input type="radio" name="wizard.method" value="${html(value)}" ${draft.method === value ? 'checked' : ''}><span><strong>${html(value === 'Orthodox Classical' ? 'Classical' : value)}</strong><small>${html(detail)}</small></span></label>`).join('')}</div>`;
  }
  if (draft.step === 2) {
    return `<div class="learn-wizard-step-copy"><span>Choose your planning structure</span><h2>Would you rather use Forms or familiar grades?</h2><p>A Form is a flexible group of children learning at a similar stage. Forms make shared work easier; grades keep the familiar structure many families already use.</p></div><label class="learn-wizard-choice-toggle"><input type="checkbox" name="wizard.useForms" ${draft.useForms ? 'checked' : ''}><span><strong>Plan with Forms</strong><small>After you add your children, Learn will suggest a Form from each age or grade. You can adjust every suggestion.</small></span></label>${draft.useForms ? `<div class="learn-wizard-gentle-note"><strong>Forms selected.</strong><span>Next, add each child. Learn will suggest Little Ones, Form I, Form II, and beyond based on the information you enter.</span></div>` : `<div class="learn-wizard-gentle-note"><strong>Use familiar grades instead.</strong><span>Learn will organize children and assignments by grade or level. You can switch to Forms later without losing saved assignments.</span></div>`}`;
  }
  if (draft.step === 3) {
    const familyPlan = isLearnFamilyPlan();
    const planNote = familyPlan
      ? `<div class="learn-wizard-plan-note"><strong>Family plan · unlimited children</strong><span>Add everyone now, then plan once for each shared Form or grade group.</span></div>`
      : `<div class="learn-wizard-plan-note"><strong>Free plan: up to 2 children</strong><span>Family plans include unlimited children, Forms, child sheets, and full household planning.</span></div>`;
    const childRows = draft.children
      .map((child, index) => {
        const suggested = child.formLabel || suggestedFormForChild(child);
        const formField = draft.useForms
          ? `<label class="learn-wizard-field"><span>Suggested Form</span><select name="formLabel" data-wizard-form-select>${formOptions.map((option) => `<option value="${html(option)}" ${option === suggested ? 'selected' : ''}>${html(option)}</option>`).join('')}</select></label>`
          : '';
        return `<div class="learn-wizard-child${draft.useForms ? ' uses-forms' : ''}" data-wizard-child="${index}" data-client-id="${html(child.clientId)}"><span class="learn-wizard-child-number">${index + 1}</span>${simpleSetupField('First name', 'firstName', child.firstName, { placeholder: 'Maria' })}${simpleSetupField('Age', 'ageYears', child.ageYears, { type: 'number', min: 0, max: 21 })}${simpleSetupField('Grade or level', 'gradeLabel', child.gradeLabel, { placeholder: 'Grade 3 or Kindergarten' })}${formField}${draft.children.length > 1 ? `<button type="button" class="learn-wizard-icon-button" data-wizard-remove-child="${index}" aria-label="Remove ${html(child.firstName || `child ${index + 1}`)}">×</button>` : ''}</div>`;
      })
      .join('');
    const addLabel = !familyPlan && draft.children.length >= 2 ? 'Upgrade to add another child' : '+ Add one child';
    return `<div class="learn-wizard-step-copy"><span>Your learners</span><h2>Add the children learning at home.</h2><p>First name plus either age or grade is enough.${draft.useForms ? ' Learn suggests a Form automatically; change it only when you need to.' : ' Learn will use the grade or level you enter.'}</p></div>${planNote}<div class="learn-wizard-roster-head"><span>${draft.children.length} ${draft.children.length === 1 ? 'learner' : 'learners'}</span><small>${draft.useForms ? 'Forms keep sibling work shared' : 'Grouped by grade or level'}</small></div><div class="learn-wizard-children">${childRows}</div><div class="learn-wizard-add-actions"><button type="button" class="learn-wizard-add" data-wizard-add-child>${addLabel}</button>${familyPlan ? `<button type="button" class="learn-wizard-add" data-wizard-add-children="3">+ Add 3 children</button>` : ''}</div>`;
  }
  if (draft.step === 4) {
    return `<div class="learn-wizard-step-copy"><span>A gentler way through real life</span><h2>Meet Grace Mode.</h2><p>Your plan should serve your family, not punish it. Grace Mode lets you choose Full, Medium, or Light without deleting work or pretending the plan never existed.</p></div><aside class="learn-wizard-grace-explainer"><div><small>Built for real family life</small><h3>Grace Mode changes the day according to each subject’s priority rank.</h3><p>Use it for illness, a new baby, travel, feast days, difficult mornings, or any season when the full plan is too much. Deferred work stays in your plan and can return when the household is ready.</p></div><div class="learn-wizard-grace-levels"><span><strong>Full</strong><small>Every scheduled item runs at its normal time.</small></span><span><strong>Medium</strong><small>Each child keeps up to 4 ranked subjects. Household enrichment keeps up to 3 blocks.</small></span><span><strong>Light</strong><small>Each child keeps up to 2 top-ranked subjects as short touchpoints. Household enrichment keeps 1 block.</small></span></div><p class="learn-wizard-grace-tip"><strong>How to use it:</strong> choose today’s mode on the Learn Dashboard. In Advanced Setup, rank each subject as Core, High, Medium, or Low so Mom knows exactly what survives first when the day gets lighter.</p></aside><div class="learn-wizard-gentle-note"><strong>No permanent choice is required.</strong><span>You can change Grace Mode from day to day as family life changes.</span></div>`;
  }
  const starterRhythm = isOdysseyLearnContext()
    ? 'a family read-aloud, nature walk, and a starter subject plan'
    : 'Daily Church Rhythms, a family read-aloud, nature walk, and a starter subject plan';
  const starterDetails = isOdysseyLearnContext()
    ? 'Creates family read-aloud and nature walk blocks, plus editable Language Arts, Mathematics, History, Geography, Literature, and Science subjects'
    : 'Creates Morning Prayers, Daily Readings, Saint of the Day, family read-aloud, nature walk, plus editable Language Arts, Mathematics, History, Geography, Literature, and Science subjects';
  return `<div class="learn-wizard-step-copy"><span>Ready for Today</span><h2>Would you like a simple starter week?</h2><p>AGAPAY will save a real editable first term, ${starterRhythm} organized by ${draft.useForms ? 'Form' : 'grade or level'}. Nothing is sample-only or locked.</p></div><label class="learn-wizard-starter"><input type="checkbox" name="wizard.starterWeek" ${draft.starterWeek ? 'checked' : ''}><span><strong>Create a gentle starter week</strong><small>${starterDetails} for every ${draft.useForms ? 'Form' : 'grade or level'}.</small></span></label><div class="learn-wizard-summary"><div><small>Household</small><strong>${html(draft.householdName || 'Your household')}</strong></div><div><small>Children</small><strong>${draft.children.filter((child) => child.firstName).length}</strong></div><div><small>Planning</small><strong>${draft.useForms ? 'Family + Forms' : 'Family + grades'}</strong></div><div><small>Style</small><strong>${html(draft.method === 'Orthodox Classical' ? 'Classical' : draft.method)}</strong></div></div>`;
}
function renderSimpleSetupWizard(vm, draft) {
  const body = `<section class="learn-wizard" data-simple-setup-wizard data-wizard-step="${draft.step}">
    <div class="learn-wizard-topline"><div><span>Simple Setup</span><strong>Step ${draft.step + 1} of ${SIMPLE_SETUP_STEPS.length}</strong></div><a href="${html(learnSectionHref('onboarding', 'advanced=1'))}" data-wizard-advanced>Advanced Setup</a></div>
    <div class="learn-wizard-progress" aria-label="Setup progress">${SIMPLE_SETUP_STEPS.map((label, index) => `<span class="${index < draft.step ? 'is-complete' : index === draft.step ? 'is-current' : ''}"><i>${index < draft.step ? '✓' : index + 1}</i><em>${html(label)}</em></span>`).join('')}</div>
    <form class="learn-wizard-card">${simpleSetupStepBody(draft)}<p class="learn-wizard-status" data-wizard-status aria-live="polite"></p><div class="learn-wizard-actions">${draft.step ? `<button type="button" class="learn-wizard-secondary" data-wizard-back>Back</button>` : `<a class="learn-wizard-secondary" href="${html(learnSectionHref('onboarding', 'advanced=1'))}" data-wizard-advanced>Skip to full setup</a>`}<button type="submit" class="learn-wizard-primary" ${draft.step === SIMPLE_SETUP_STEPS.length - 1 ? 'data-wizard-finish' : 'data-wizard-next'}>${draft.step === SIMPLE_SETUP_STEPS.length - 1 ? 'Save & open Today' : 'Continue'}</button></div></form>
    <p class="learn-wizard-draft-note">Your progress is saved on this device until setup is complete.</p>
  </section>`;
  return shell(vm, body);
}
function renderTefaCommunity(vm) {
  const resources = vm.resources?.length
    ? vm.resources
        .map(
          (
            resource
          ) => `<article style="background:var(--paper);border:1px solid var(--line);border-top:3px solid ${html(resource.color || 'var(--gold)')};border-radius:13px;padding:16px;display:grid;gap:9px;box-shadow:0 1px 3px rgba(20,40,70,.04);">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;"><small style="color:var(--gold);font-weight:800;letter-spacing:.11em;text-transform:uppercase;">${html(resource.category)}</small>${resource.vetted ? '<span style="font-size:10px;color:#365f3b;border:1px solid #c2d9c4;background:#edf6ef;border-radius:999px;padding:3px 8px;">AGAPAY CURATED</span>' : ''}</div>
        <strong style="font-family:'Cormorant Garamond',serif;font-size:23px;line-height:1.05;color:var(--ink);">${html(resource.title)}</strong>
        <p style="margin:0;color:var(--muted);line-height:1.45;">${html(resource.desc || resource.subtitle)}</p>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">${(resource.tags || [])
          .slice(0, 4)
          .map(
            (tag) =>
              `<span style="border:1px solid var(--line);border-radius:999px;padding:3px 8px;font-size:10px;color:var(--muted);">${html(tag)}</span>`
          )
          .join('')}</div>
        <a href="${html(safeExternalUrl(resource.url) || '#')}" target="_blank" rel="noopener noreferrer" style="margin-top:4px;color:var(--navy);font-weight:800;text-decoration:none;">Open resource →</a>
      </article>`
        )
        .join('')
    : emptyState('Curated homeschool resources are being prepared for TEFA Edition.');
  const body = `<section data-screen-label="Homeschool Resources" class="learn-stack">
    <div style="background:linear-gradient(135deg,var(--navy),#16385e);border:1px solid var(--gold);border-radius:16px;padding:26px 30px;color:#fffaf0;">
      <div class="learn-eyebrow" style="color:#f0d783;">CURATED FOR HOME EDUCATION</div>
      <h2 style="font-family:'Cormorant Garamond',serif;font-size:clamp(32px,5vw,48px);line-height:1;margin:7px 0 8px;">Practical resources, thoughtfully curated.</h2>
      <p style="margin:0;color:rgba(255,250,240,.78);max-width:760px;line-height:1.5;">Find useful tools for planning, teaching, Texas standards, primary sources, and family learning.</p>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:14px;">${resources}</div>
  </section>`;
  return shell(vm, body);
}
function truthyLearn8(value) {
  return Boolean(value);
}
function renderCommunity(vm) {
  if (learnExperience().tefaActive) return renderTefaCommunity(vm);
  const filterOptions = (values) =>
    values.map((value) => `<option value="${html(value)}">${html(value)}</option>`).join('');
  const facebookCta = vm.facebookGroupUrl
    ? `<a href="${html(vm.facebookGroupUrl)}" target="_blank" rel="noopener noreferrer"
         style="display:inline-flex;align-items:center;gap:9px;background:var(--navy);color:#fffaf0;border:1.5px solid var(--gold);border-radius:11px;padding:12px 20px;text-decoration:none;font-weight:800;font-size:14px;">
         Join the Facebook Group <span style="color:var(--gold);">↗</span>
       </a>`
    : `<span style="display:inline-flex;align-items:center;border:1px solid var(--line);background:var(--paper2);border-radius:999px;padding:7px 13px;color:var(--gold);font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">
         Facebook group opening soon
       </span>`;
  const typeLabel = (resource) => {
    const parts = [resource.resourceType, resource.ageRange].filter(truthyLearn8);
    return parts.join(' · ');
  };
  const card = (resource) => `
    <article data-community-card
      data-category="${html(resource.category)}"
      data-resource-type="${html(resource.resourceType)}"
      data-media-type="${html(resource.mediaType)}"
      data-search="${html(`${resource.title} ${resource.category} ${resource.resourceType} ${resource.mediaType} ${resource.ageRange} ${resource.desc} ${resource.tags.join(' ')}`.toLowerCase())}"
      style="background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:10px;box-shadow:0 1px 3px rgba(20,40,70,.04);position:relative;">

      ${resource.vetted ? `<div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--gold),#dac88f);border-radius:14px 14px 0 0;"></div>` : ''}

      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
        <div style="display:flex;align-items:center;gap:9px;">
          <span style="flex:none;width:36px;height:36px;border-radius:9px;background:${softColor(resource.color, '22')};color:${html(resource.color)};display:grid;place-items:center;font-size:17px;border:1px solid ${softColor(resource.color, '38')};">${html(resource.icon || '✥')}</span>
          <div>
            <div style="color:var(--gold);font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;">${html(resource.category)}</div>
            <div style="color:var(--muted);font-size:11px;">${html(typeLabel(resource))}</div>
          </div>
        </div>
        ${resource.vetted ? `<span style="flex:none;border:1px solid rgba(54,95,59,.28);background:#edf6ef;color:#365f3b;border-radius:999px;padding:3px 8px;font-size:10px;font-weight:800;letter-spacing:.07em;white-space:nowrap;">AGAPAY CURATED</span>` : ''}
      </div>

      <strong style="display:block;font-family:'Cormorant Garamond',serif;font-size:21px;line-height:1.1;color:var(--ink);">${html(resource.title)}</strong>
      <p style="font-size:13px;color:#3a4256;line-height:1.5;flex:1;margin:0;">${html(resource.desc)}</p>

      <div style="display:flex;align-items:center;gap:10px;border-top:1px solid var(--line);padding-top:10px;margin-top:auto;">
        <a href="${html(resource.url)}" target="_blank" rel="noopener noreferrer"
           style="flex:1;font-size:13px;font-weight:800;color:var(--navy);text-decoration:none;display:flex;align-items:center;gap:6px;">
          Open <span style="color:var(--gold);">↗</span>
        </a>
        ${
          resource.source === 'community'
            ? `<button type="button" data-community-flag="${html(resource.id)}" title="Flag for review"
               style="border:1px solid var(--line);background:transparent;color:var(--muted);border-radius:7px;padding:5px 9px;font:inherit;font-size:11px;cursor:pointer;">Flag</button>`
            : ''
        }
      </div>
    </article>`;
  const pinnedResources = vm.resources.filter((r) => r.vetted || r.pinned);
  const regularResources = vm.resources.filter((r) => !r.vetted && !r.pinned);
  const pinnedGrid = pinnedResources.length
    ? `<div style="margin-bottom:6px;">
         <div style="color:var(--gold);font-size:10px;letter-spacing:.16em;font-weight:800;text-transform:uppercase;margin-bottom:10px;">✦ AGAPAY Curated Picks</div>
         <div data-community-pinned style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr));gap:12px;">
           ${pinnedResources.map(card).join('')}
         </div>
       </div>`
    : '';
  const guidancePanel = vm.guidance?.length
    ? panel(
        'How This Works',
        `
        ${vm.guidance
          .map(
            (item) => `
          <div style="display:flex;gap:10px;padding:9px 0;border-top:1px solid var(--line);align-items:flex-start;">
            <span style="flex:none;width:20px;height:20px;border-radius:50%;background:var(--paper2);border:1px solid var(--line);display:grid;place-items:center;color:var(--gold);font-size:11px;">✦</span>
            <span style="font-size:13px;color:#33405a;line-height:1.45;">${html(item)}</span>
          </div>`
          )
          .join('')}
        <button type="button" data-community-suggest
          style="margin-top:12px;width:100%;border:1.5px solid var(--gold);background:var(--paper2);color:var(--navy);border-radius:10px;padding:11px;font:inherit;font-weight:800;font-size:13px;cursor:pointer;">
          Suggest a resource
        </button>`,
        { icon: '✥' }
      )
    : '';
  const historyPanel = vm.history?.title
    ? panel(
        'This Day in Church History',
        `
        <div style="display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:flex-start;">
          <div style="background:linear-gradient(180deg,var(--navy),#1b2c4a);border-radius:10px;padding:10px 12px;text-align:center;border:1px solid rgba(181,148,47,.28);min-width:52px;">
            <div style="color:var(--gold);font-size:20px;">✦</div>
            <div style="color:#f3ead4;font-size:11px;font-weight:700;margin-top:2px;">${html(vm.history.year)}</div>
          </div>
          <div>
            <strong style="font-family:'Cormorant Garamond',serif;font-size:19px;line-height:1.15;display:block;color:var(--ink);">${html(vm.history.title)}</strong>
            ${vm.history.summary ? `<p style="margin:6px 0 0;font-size:13px;color:#33405a;line-height:1.45;">${html(vm.history.summary)}</p>` : ''}
            ${vm.history.source ? `<small style="display:block;margin-top:6px;color:var(--muted);">Source: ${html(vm.history.source)}</small>` : ''}
          </div>
        </div>`,
        { icon: '☩' }
      )
    : '';
  return shell(
    vm,
    `
    <section data-screen-label="Community Resources" class="learn-stack">

      <!-- Hero -->
      <div style="background:linear-gradient(135deg,var(--navy),#0a1c30);border-radius:16px;padding:clamp(20px,4vw,32px);display:grid;grid-template-columns:1fr auto;gap:24px;align-items:center;box-shadow:0 2px 8px rgba(4,20,39,.18);">
        <div>
          <div style="color:var(--goldsoft);font-size:10px;letter-spacing:.2em;font-weight:800;text-transform:uppercase;margin-bottom:8px;">Moms helping moms</div>
          <h2 style="font-family:'Cormorant Garamond',serif;font-size:clamp(30px,5vw,44px);line-height:.98;margin:0 0 10px;color:#fff;">A thoughtful Orthodox homeschool community.</h2>
          <p style="line-height:1.55;color:rgba(246,241,232,.78);margin:0 0 18px;max-width:600px;font-size:15px;">Ask practical questions, share encouragement, and learn from families walking the same road.</p>
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
            ${facebookCta}
          </div>
        </div>
        <div style="display:none;width:80px;height:80px;border-radius:20px;border:1px solid rgba(181,148,47,.32);background:rgba(181,148,47,.1);place-items:center;color:var(--gold);font-size:38px;" class="learn-community-mark">✥</div>
      </div>

      <!-- Filters + count -->
      <div style="display:grid;grid-template-columns:minmax(200px,1.6fr) repeat(3,minmax(130px,.7fr));gap:10px;align-items:end;">
        <label style="display:grid;gap:5px;color:var(--gold);font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;">
          Search
          <input data-community-search type="search" placeholder="Saints, catechesis, audio, printables..."
            style="border:1px solid var(--line);border-radius:9px;background:var(--paper);padding:11px 12px;font:inherit;color:var(--ink);min-width:0;">
        </label>
        <label style="display:grid;gap:5px;color:var(--gold);font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;">
          Subject
          <select data-community-category style="border:1px solid var(--line);border-radius:9px;background:var(--paper);padding:11px 10px;font:inherit;color:var(--ink);min-width:0;">${filterOptions(vm.categories)}</select>
        </label>
        <label style="display:grid;gap:5px;color:var(--gold);font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;">
          Type
          <select data-community-resource-type style="border:1px solid var(--line);border-radius:9px;background:var(--paper);padding:11px 10px;font:inherit;color:var(--ink);min-width:0;">${filterOptions(vm.resourceTypes)}</select>
        </label>
        <label style="display:grid;gap:5px;color:var(--gold);font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;">
          Media
          <select data-community-media-type style="border:1px solid var(--line);border-radius:9px;background:var(--paper);padding:11px 10px;font:inherit;color:var(--ink);min-width:0;">${filterOptions(vm.mediaTypes)}</select>
        </label>
      </div>

      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
        <span data-community-count class="learn-muted-sm">Showing ${vm.resources.length} curated ${vm.resources.length === 1 ? 'resource' : 'resources'}</span>
        <small class="learn-muted">Links open in a new tab · <button type="button" data-community-suggest style="border:0;background:none;color:var(--gold);font:inherit;font-size:12px;font-weight:700;cursor:pointer;padding:0;">Suggest a resource →</button></small>
      </div>

      <!-- Main two-column layout: cards + sidebar -->
      <div style="display:grid;grid-template-columns:1fr 300px;gap:16px;align-items:start;">

        <div style="display:flex;flex-direction:column;gap:16px;">
          ${pinnedGrid}
          <div data-community-empty hidden
            style="border:1px dashed var(--gold);border-radius:14px;background:var(--paper);padding:28px;text-align:center;color:var(--muted);">
            No resources match those filters yet. Try a broader search.
          </div>
          ${
            regularResources.length
              ? `
            <div data-community-grid style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,250px),1fr));gap:12px;">
              ${regularResources.map(card).join('')}
            </div>`
              : ''
          }
        </div>

        <aside style="display:flex;flex-direction:column;gap:14px;">
          ${historyPanel}
          ${guidancePanel}
        </aside>

      </div>

      <!-- Suggest dialog (unchanged from existing wiring) -->
      <div data-community-suggest-dialog hidden style="position:fixed;inset:0;z-index:90;background:rgba(4,20,39,.72);padding:20px;align-items:center;justify-content:center;">
        <form data-community-suggest-form style="width:min(560px,100%);max-height:90vh;overflow:auto;background:var(--cream);border:1px solid var(--gold);border-radius:16px;box-shadow:0 22px 70px rgba(0,0,0,.35);">
          <div style="padding:19px 22px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:12px;">
            <div>
              <h2 style="font-family:'Cormorant Garamond',serif;font-size:28px;margin:0;">Suggest a Resource</h2>
              <small class="learn-muted">Submissions are reviewed before appearing in the library.</small>
            </div>
            <button type="button" data-community-suggest-close aria-label="Close" style="border:0;background:transparent;font-size:24px;color:var(--muted);cursor:pointer;">×</button>
          </div>
          <div style="padding:20px 22px;display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <label style="grid-column:1/-1;display:grid;gap:5px;">Title<input name="title" required maxlength="120" style="border:1px solid var(--line);border-radius:9px;padding:10px;font:inherit;"></label>
            <label style="grid-column:1/-1;display:grid;gap:5px;">Link<input name="url" type="url" required style="border:1px solid var(--line);border-radius:9px;padding:10px;font:inherit;"></label>
            <label style="display:grid;gap:5px;">Subject<input name="category" placeholder="Catechesis, History..." style="border:1px solid var(--line);border-radius:9px;padding:10px;font:inherit;"></label>
            <label style="display:grid;gap:5px;">Resource type<input name="resourceType" placeholder="Book, Website, Printable..." style="border:1px solid var(--line);border-radius:9px;padding:10px;font:inherit;"></label>
            <label style="display:grid;gap:5px;">Media type<input name="mediaType" placeholder="Article, Audio, PDF..." style="border:1px solid var(--line);border-radius:9px;padding:10px;font:inherit;"></label>
            <label style="display:grid;gap:5px;">Age range<input name="ageRange" placeholder="Family, Form II..." style="border:1px solid var(--line);border-radius:9px;padding:10px;font:inherit;"></label>
            <label style="grid-column:1/-1;display:grid;gap:5px;">Tags<input name="tags" placeholder="saints, narration, feast days" style="border:1px solid var(--line);border-radius:9px;padding:10px;font:inherit;"></label>
            <label style="grid-column:1/-1;display:grid;gap:5px;">Why it is helpful<textarea name="description" required maxlength="600" rows="4" style="border:1px solid var(--line);border-radius:9px;padding:10px;font:inherit;resize:vertical;"></textarea></label>
            <div data-community-suggest-status style="grid-column:1/-1;color:var(--muted);font-size:13px;"></div>
          </div>
          <div style="padding:15px 22px;border-top:1px solid var(--line);display:flex;justify-content:flex-end;gap:9px;">
            <button type="button" data-community-suggest-close style="border:1px solid var(--line);background:var(--paper);border-radius:9px;padding:10px 15px;font:inherit;cursor:pointer;">Cancel</button>
            <button type="submit" style="border:1px solid var(--gold);background:var(--navy);color:#fff;border-radius:9px;padding:10px 16px;font:inherit;font-weight:800;cursor:pointer;">Send for Review</button>
          </div>
        </form>
      </div>

    </section>
  `
  );
}
function renderReportsComingSoon(vm) {
  return shell(
    vm,
    `
    <section data-screen-label="Reports" class="learn-coming-soon-page">
      <div class="learn-coming-soon-mark" aria-hidden="true">▥</div>
      <p>Future Learn Feature</p>
      <h2>Beautiful records, without the institutional clutter.</h2>
      <span>Reports are intentionally parked while AGAPAY Learn focuses on a dependable Today dashboard, adaptive setup, planning, formation, books, and printable household plans.</span>
      <div class="learn-coming-soon-list">
        <strong>Planned for Reports</strong>
        <span>Progress summaries by child, Form, or grade</span>
        <span>Report cards and year-end household records</span>
        <span>Transcript-ready academic exports</span>
        <span>Printable state-reporting support</span>
      </div>
      <a href="${html(learnSectionHref('dashboard'))}" class="learn-coming-soon-action">Back to Today</a>
    </section>`
  );
}
function captureSimpleSetupStep(form, draft) {
  const value = (name) => learnNamedField(form, name)?.value?.trim() || '';
  if (draft.step === 0) {
    draft.householdName = value('wizard.householdName');
    draft.parentName = value('wizard.parentName');
    draft.calendarType = value('wizard.calendarType') || 'julian';
  } else if (draft.step === 1) {
    draft.method = form.querySelector('[name="wizard.method"]:checked')?.value || 'Unsure';
  } else if (draft.step === 2) {
    draft.useForms = Boolean(learnNamedField(form, 'wizard.useForms')?.checked);
    if (!draft.useForms)
      draft.children.forEach((child) => {
        child.formLabel = '';
      });
  } else if (draft.step === 3) {
    draft.children = [...form.querySelectorAll('[data-wizard-child]')].map((row, index) => ({
      clientId: row.dataset.clientId || `child_${Date.now()}_${index}`,
      id: draft.children[index]?.id || '',
      firstName: row.querySelector('[name="firstName"]')?.value.trim() || '',
      ageYears: row.querySelector('[name="ageYears"]')?.value.trim() || '',
      gradeLabel: row.querySelector('[name="gradeLabel"]')?.value.trim() || '',
      formLabel: draft.useForms
        ? row.querySelector('[name="formLabel"]')?.value ||
          suggestedFormForChild({
            ageYears: row.querySelector('[name="ageYears"]')?.value.trim() || '',
            gradeLabel: row.querySelector('[name="gradeLabel"]')?.value.trim() || '',
          })
        : '',
    }));
  } else if (draft.step === SIMPLE_SETUP_STEPS.length - 1) {
    draft.starterWeek = Boolean(learnNamedField(form, 'wizard.starterWeek')?.checked);
  }
  saveSimpleSetupDraft(draft);
}
function validateSimpleSetupStep(draft) {
  if (draft.step === 0 && (!draft.householdName || !draft.parentName))
    return 'Please add the household name and your name.';
  if (draft.step === 3) {
    const children = draft.children.filter((child) => child.firstName);
    if (!children.length) return 'Please add at least one child.';
    if (children.some((child) => !child.ageYears && !child.gradeLabel))
      return 'Add an age or grade for each child so Learn can suggest the right Form.';
  }
  return '';
}
function validateSimpleSetupMinimum(draft) {
  if (!draft.householdName || !draft.parentName) return 'Please add the household name and your name.';
  const children = draft.children.filter((child) => child.firstName);
  if (!children.length) return 'Please add at least one child.';
  if (children.some((child) => !child.ageYears && !child.gradeLabel))
    return 'Add an age or grade for each child so Learn can suggest the right Form.';
  return '';
}
function simpleSetupDates() {
  const today = /* @__PURE__ */ new Date();
  const academicStartYear = today.getMonth() >= 5 ? today.getFullYear() : today.getFullYear() - 1;
  const termEnd = new Date(today);
  termEnd.setDate(termEnd.getDate() + 84);
  const iso = (date) => date.toISOString().slice(0, 10);
  return {
    yearLabel: `${academicStartYear}-${academicStartYear + 1} School Year`,
    yearStart: iso(today),
    yearEnd: `${academicStartYear + 1}-06-30`,
    termStart: iso(today),
    termEnd: iso(termEnd),
  };
}
function simpleSetupPayload(draft, existingSnapshot = null) {
  const dates = simpleSetupDates();
  const colors = ['#14294a', '#6e2f2a', '#4a5a31', '#b5942f', '#4b3158'];
  const children = draft.children
    .filter((child) => child.firstName)
    .map((child, index) => ({
      id: child.id || '',
      firstName: child.firstName,
      ageYears: child.ageYears,
      gradeLabel: child.gradeLabel,
      formLabel: draft.useForms ? child.formLabel || suggestedFormForChild(child) : '',
      color: colors[index % colors.length],
    }));
  const planningGroups = [
    ...new Set(children.map((child) => (draft.useForms ? child.formLabel : child.gradeLabel)).filter(truthyLearn8)),
  ];
  if (!planningGroups.length) planningGroups.push(draft.useForms ? 'Form I' : 'Household Grade');
  const existingHasPlan = Boolean(
    existingSnapshot?.subjects?.length || existingSnapshot?.formation?.enrichmentBlocks?.length
  );
  const createStarterWeek = draft.starterWeek && !existingHasPlan;
  const starterAssignment = (groupLabel) => (draft.useForms ? { formLabel: groupLabel } : { gradeLabel: groupLabel });
  const subjectDays = {
    '4x': ['mon', 'tue', 'wed', 'thu'],
    '3x': ['mon', 'wed', 'fri'],
    '2x': ['tue', 'thu'],
    '1x': ['fri'],
    daily: ['mon', 'tue', 'wed', 'thu', 'fri'],
  };
  const starterSubjectSlate = [
    {
      title: 'Language Arts',
      subjectType: 'language-arts',
      weeklyFrequency: '4x',
      minutes: '20',
      gracePriority: 'core',
    },
    { title: 'Mathematics', subjectType: 'math', weeklyFrequency: '4x', minutes: '20', gracePriority: 'core' },
    { title: 'History', subjectType: 'history', weeklyFrequency: '3x', minutes: '25', gracePriority: 'high' },
    { title: 'Geography', subjectType: 'geography', weeklyFrequency: '2x', minutes: '20', gracePriority: 'medium' },
    { title: 'Literature', subjectType: 'literature', weeklyFrequency: '3x', minutes: '20', gracePriority: 'high' },
    { title: 'Science', subjectType: 'sciences-nature', weeklyFrequency: '2x', minutes: '25', gracePriority: 'medium' },
  ];
  const subjects = createStarterWeek
    ? planningGroups.flatMap((groupLabel, groupIndex) =>
        starterSubjectSlate.map((subject, subjectIndex) => ({
          ...subject,
          planningMode: draft.useForms ? 'forms' : 'grades',
          ...starterAssignment(groupLabel),
          termId: 'term_1',
          daysOfWeek: subjectDays[subject.weeklyFrequency] || subjectDays['1x'],
          resource: '',
          resourceType: 'none',
          color: colors[(groupIndex + subjectIndex) % colors.length],
        }))
      )
    : [];
  const starterTerm = {
    id: 'term_1',
    label: 'Starter Term',
    startDate: dates.termStart,
    endDate: dates.termEnd,
    paceMode: 'steady',
  };
  const starterChurchRhythms = isOdysseyLearnContext()
    ? []
    : [
        {
          title: 'Morning Prayers',
          note: 'Begin together',
          weeklyFrequency: 'daily',
          daysOfWeek: subjectDays.daily,
          minutes: 10,
        },
        {
          title: 'Daily Readings',
          note: 'Epistle and Gospel',
          weeklyFrequency: 'daily',
          daysOfWeek: subjectDays.daily,
          minutes: 10,
        },
        {
          title: 'Saint of the Day',
          note: 'Read and discuss',
          weeklyFrequency: 'daily',
          daysOfWeek: subjectDays.daily,
          minutes: 10,
        },
      ];
  const starterFormation = {
    churchRhythms: starterChurchRhythms,
    recitationTracks: [],
    hymnStudies: [],
    feasts: [],
    enrichmentBlocks: [
      {
        blockType: 'Literature',
        title: 'Family Read-Aloud',
        planningMode: 'family',
        weeklyFrequency: 'daily',
        daysOfWeek: subjectDays.daily,
        minutesPlanned: 20,
        termId: 'term_1',
        gracePriority: 'high',
      },
      {
        blockType: 'Nature Study',
        title: 'Nature Walk',
        planningMode: 'family',
        weeklyFrequency: '1x',
        daysOfWeek: subjectDays['1x'],
        minutesPlanned: 30,
        termId: 'term_1',
        gracePriority: 'medium',
      },
    ],
  };
  return {
    ...(existingSnapshot || {}),
    household: {
      ...(existingSnapshot?.household || {}),
      name: draft.householdName,
      parentName: draft.parentName,
      parentNames: [draft.parentName],
      primaryMethod: draft.method,
    },
    schoolYear: existingSnapshot?.schoolYear || {
      id: 'school_year_current',
      label: dates.yearLabel,
      startDate: dates.yearStart,
      endDate: dates.yearEnd,
      currentTermId: 'term_1',
    },
    term: existingSnapshot?.term || starterTerm,
    terms: existingSnapshot?.terms?.length ? existingSnapshot.terms : [starterTerm],
    preferences: {
      ...(existingSnapshot?.preferences || {}),
      calendarType: draft.calendarType,
      groupingMode: draft.useForms ? 'forms' : 'grades',
      evaluationModel: existingSnapshot?.preferences?.evaluationModel || 'narrative-only',
      graceModeDefault: existingSnapshot?.preferences?.graceModeDefault || 'light',
      graceModeActive: Boolean(existingSnapshot?.preferences?.graceModeActive),
      paceMode: 'steady',
    },
    children,
    streams: createStarterWeek
      ? [
          {
            title: 'Morning Time',
            streamType: 'morning-time',
            cadenceLabel: 'Daily',
            dailyMinutes: { mon: 30, tue: 30, wed: 30, thu: 30, fri: 30 },
          },
        ]
      : existingSnapshot?.streams || [],
    subjects: createStarterWeek ? subjects : existingSnapshot?.subjects || [],
    books: existingSnapshot?.books || [],
    formation: createStarterWeek
      ? starterFormation
      : existingSnapshot?.formation || {
          churchRhythms: [],
          recitationTracks: [],
          hymnStudies: [],
          enrichmentBlocks: [],
          feasts: [],
        },
    formationMaterials: existingSnapshot?.formationMaterials || [],
    completion: existingSnapshot?.completion || { daily: {}, weekly: {} },
    starterWeek: createStarterWeek
      ? { enabled: true, generatedAt: /* @__PURE__ */ new Date().toISOString() }
      : existingSnapshot?.starterWeek || null,
    coOp: existingSnapshot?.coOp || { enabled: false, status: 'coming-soon' },
  };
}
function applySimpleDraftToSetupVm(vm, draft) {
  vm.household.name = draft.householdName || vm.household.name;
  vm.household.parentName = draft.parentName || vm.household.parentName;
  vm.household.method = draft.method || vm.household.method;
  vm.preferences.calendarType = draft.calendarType || vm.preferences.calendarType;
  vm.preferences.groupingMode = draft.useForms ? 'forms' : 'grades';
  const draftedChildren = draft.children
    .filter((child) => child.firstName)
    .map((child, index) => ({
      id: '',
      name: child.firstName,
      firstName: child.firstName,
      age: child.ageYears,
      grade: child.gradeLabel,
      form: draft.useForms ? child.formLabel || suggestedFormForChild(child) : '',
      formLabel: draft.useForms ? child.formLabel || suggestedFormForChild(child) : '',
      color: colorChoices[index % colorChoices.length],
    }));
  if (draftedChildren.length) vm.children = draftedChildren;
  return vm;
}
function wireSimpleSetupWizard(vm, draft, existingSnapshot = null) {
  const form = root.querySelector('[data-simple-setup-wizard] form');
  if (!form) return;
  const status = form.querySelector('[data-wizard-status]');
  const rerender = () => {
    renderLearnRoot(root, renderSimpleSetupWizard(vm, draft));
    wireSimpleSetupWizard(vm, draft, existingSnapshot);
    root.querySelector('.learn-wizard')?.scrollIntoView({ block: 'start' });
  };
  form.addEventListener('input', (event) => {
    const childRow = event.target.closest('[data-wizard-child]');
    if (
      childRow &&
      draft.useForms &&
      ['ageYears', 'gradeLabel'].includes(event.target.name) &&
      childRow.dataset.formManual !== 'true'
    ) {
      const formSelect = childRow.querySelector('[data-wizard-form-select]');
      if (formSelect) {
        formSelect.value = suggestedFormForChild({
          ageYears: childRow.querySelector('[name="ageYears"]')?.value || '',
          gradeLabel: childRow.querySelector('[name="gradeLabel"]')?.value || '',
        });
      }
    }
    captureSimpleSetupStep(form, draft);
  });
  form.addEventListener('change', (event) => {
    if (event.target.matches('[data-wizard-form-select]'))
      event.target.closest('[data-wizard-child]').dataset.formManual = 'true';
    captureSimpleSetupStep(form, draft);
    if (event.target.name === 'wizard.useForms') rerender();
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    captureSimpleSetupStep(form, draft);
    const submit = event.submitter || form.querySelector('.learn-wizard-primary');
    if (submit?.hasAttribute('data-wizard-finish')) {
      const error2 = validateSimpleSetupMinimum(draft);
      if (error2) {
        status.textContent = error2;
        return;
      }
      if (draft.useForms)
        draft.children.forEach((child) => {
          child.formLabel ||= suggestedFormForChild(child);
        });
      submit.disabled = true;
      status.textContent = 'Preparing your AGAPAY Learn dashboard...';
      try {
        await apiPost('/api/learn/setup', simpleSetupPayload(draft, existingSnapshot));
        localStorage.setItem('agapay.learn.calendar', draft.calendarType || 'julian');
        localStorage.removeItem(simpleSetupDraftKey());
        window.location.href = learnSectionHref('dashboard');
      } catch (error3) {
        status.textContent = error3.message;
        submit.disabled = false;
      }
      return;
    }
    const error = validateSimpleSetupStep(draft);
    if (error) {
      status.textContent = error;
      return;
    }
    if (draft.step === 3 && draft.useForms)
      draft.children.forEach((child) => {
        child.formLabel ||= suggestedFormForChild(child);
      });
    draft.step = Math.min(SIMPLE_SETUP_STEPS.length - 1, draft.step + 1);
    saveSimpleSetupDraft(draft);
    rerender();
  });
  form.addEventListener('click', async (event) => {
    const addChild = event.target.closest('[data-wizard-add-child]');
    if (addChild) {
      captureSimpleSetupStep(form, draft);
      if (!isLearnFamilyPlan() && draft.children.length >= 2) {
        showLearnDialog(
          'Upgrade to Add Another Child',
          'The free AGAPAY Learn plan includes up to two children. Your wizard progress is saved, so you can upgrade without starting over.',
          [
            { label: 'Free plan', value: 'Up to 2 children' },
            { label: 'Family plan', value: 'Unlimited children' },
          ],
          { upgrade: true }
        );
        return;
      }
      draft.children.push({
        id: '',
        clientId: `child_${Date.now()}`,
        firstName: '',
        ageYears: '',
        gradeLabel: '',
        formLabel: '',
      });
      saveSimpleSetupDraft(draft);
      rerender();
      return;
    }
    const addChildren = event.target.closest('[data-wizard-add-children]');
    if (addChildren) {
      captureSimpleSetupStep(form, draft);
      if (!isLearnFamilyPlan()) return;
      const count = Math.max(1, Math.min(5, Number(addChildren.dataset.wizardAddChildren) || 3));
      const stamp = Date.now();
      for (let index = 0; index < count; index += 1) {
        draft.children.push({
          id: '',
          clientId: `child_${stamp}_${index}`,
          firstName: '',
          ageYears: '',
          gradeLabel: '',
          formLabel: '',
        });
      }
      saveSimpleSetupDraft(draft);
      rerender();
      return;
    }
    const removeChild = event.target.closest('[data-wizard-remove-child]');
    if (removeChild) {
      captureSimpleSetupStep(form, draft);
      draft.children.splice(Number(removeChild.dataset.wizardRemoveChild), 1);
      saveSimpleSetupDraft(draft);
      rerender();
      return;
    }
    if (event.target.closest('[data-wizard-back]')) {
      captureSimpleSetupStep(form, draft);
      draft.step = Math.max(0, draft.step - 1);
      saveSimpleSetupDraft(draft);
      rerender();
      return;
    }
    if (event.target.closest('[data-wizard-next], [data-wizard-finish]')) return;
  });
}
function truthyLearn9(value) {
  return Boolean(value);
}
function setupExperience(method = 'Unsure', groupingMode = 'forms') {
  const groupName = groupingMode === 'grades' ? 'Grade-Level' : 'Form';
  const profiles = {
    'Charlotte Mason': {
      order: ['church', 'enrichment', 'subjects'],
      subjectTitle: `${groupName} Subjects`,
      note: "Living books, short lessons, narration, and generous enrichment are arranged around the household's Church rhythm.",
    },
    'Orthodox Classical': {
      order: ['church', 'subjects', 'enrichment'],
      subjectTitle: groupingMode === 'grades' ? 'Classical Studies by Grade' : 'Classical Studies by Form',
      note: 'Church rhythm leads into ordered language, humanities, mathematics, and science, followed by enrichment.',
    },
    Traditional: {
      order: ['subjects', 'church', 'enrichment'],
      subjectTitle: groupingMode === 'grades' ? 'Grade-Level Subjects' : 'Grouped Subjects',
      note: 'Familiar grade-level subjects come first, with Church rhythm and enrichment kept clear and easy to schedule.',
    },
    Eclectic: {
      order: ['church', 'subjects', 'enrichment'],
      subjectTitle: groupingMode === 'grades' ? 'Flexible Subjects by Grade' : 'Flexible Subjects by Form',
      note: 'A flexible structure keeps core subjects, shared family work, and enrichment easy to mix without forcing one method.',
    },
    Unsure: {
      order: ['church', 'subjects', 'enrichment'],
      subjectTitle: groupingMode === 'grades' ? 'Core Subjects by Grade' : 'Core Subjects by Form',
      note: 'A balanced starting point keeps the essentials visible now and leaves room to refine your method later.',
    },
  };
  return profiles[method] || profiles.Unsure;
}
function mealSetupRow(meal = {}, date = '') {
  const resolvedDate = meal.date || date;
  const weekday = resolvedDate
    ? /* @__PURE__ */ new Date(`${resolvedDate}T12:00:00`).toLocaleDateString(void 0, { weekday: 'long' })
    : 'Day';
  return `<div data-setup-row="meals" data-id="${html(meal.id || '')}" class="learn-meal-row"><div><strong>${html(weekday)}</strong><input type="date" name="date" value="${html(resolvedDate)}"></div>${setupInput('Breakfast', 'breakfast', meal.breakfast || '')}${setupInput('Lunch', 'lunch', meal.lunch || '')}${setupInput('Dinner', 'dinner', meal.dinner || '')}</div>`;
}
function familyPlanningSetupPanel(vm) {
  const planning = vm.familyPlanning || {};
  const household = vm.household || planning.household || {};
  const children = vm.children || planning.children || [];
  const dates = nextSevenDates(planning.weekStart);
  const mealByDate = new Map((planning.meals || []).map((meal) => [meal.date, meal]));
  return `<div class="learn-family-planning">
    <p class="learn-panel-intro">Keep the household calendar, meals, and practical life beside the school plan. Name days repeat annually; appointments and outings appear on their exact dates.</p>
    <div class="learn-family-adults">${setupInput("Mom's name", 'household.motherName', household.motherName || '')}${setupInput("Mom's name day", 'household.motherNameDay', household.motherNameDay || '', { type: 'date' })}${setupInput("Dad's name", 'household.fatherName', household.fatherName || '')}${setupInput("Dad's name day", 'household.fatherNameDay', household.fatherNameDay || '', { type: 'date' })}</div>
    <div class="learn-child-name-days">${children.map((child) => `<label data-family-child-id="${html(child.id)}"><span>${html(child.name)}'s name day</span><input type="date" name="childNameDay" value="${html(child.nameDay || '')}"></label>`).join('')}</div>
    <details id="learn-weekly-meals" open class="learn-planning-section"><summary><span>Weekly Meals</span><small>Plan one week at a time with fasting guidance from your selected Church calendar</small></summary>${setupSelect(
      'Fasting guidance',
      'familyPlanning.fastingPreference',
      planning.fastingPreference || 'guidance',
      [
        { value: 'guidance', label: 'Show guidance, let me decide' },
        { value: 'strict', label: 'Follow fasting guidance closely' },
        { value: 'off', label: 'Do not show meal guidance' },
      ]
    )}<input type="hidden" name="familyPlanning.weekStart" value="${html(dates[0])}"><div data-setup-list="meals" class="learn-meal-week">${dates.map((date) => mealSetupRow(mealByDate.get(date) || {}, date)).join('')}</div><p class="learn-planning-note">AGAPAY shows the fasting rule; it does not judge ingredients or replace guidance from your priest.</p></details>
    <details class="learn-planning-section"><summary><span>Family Calendar</span><small>Appointments, activities, field trips, and family events</small></summary><div data-setup-list="familyEvents" class="learn-planning-list">${(planning.events?.length ? planning.events : [{}]).map(familyEventSetupRow).join('')}</div><button type="button" data-setup-add-row="familyEvents" class="learn-add-button">Add Calendar Event</button></details>
    <details class="learn-planning-section"><summary><span>Recipes</span><small>Your household library, including fast-friendly favorites</small></summary><div data-setup-list="recipes" class="learn-planning-list">${(planning.recipes?.length ? planning.recipes : [{}]).map(recipeSetupRow).join('')}</div><button type="button" data-setup-add-row="recipes" class="learn-add-button">Add Recipe</button></details>
    <details class="learn-planning-section"><summary><span>Grocery List</span><small>A practical list generated and edited alongside the week</small></summary><div data-setup-list="groceryItems" class="learn-planning-list">${(planning.groceryItems?.length ? planning.groceryItems : [{}]).map(grocerySetupRow).join('')}</div><button type="button" data-setup-add-row="groceryItems" class="learn-add-button">Add Grocery Item</button></details>
  </div>`;
}
function renderSetup(vm) {
  const currentTermId = vm.schoolYear.currentTermId || vm.term.id || vm.terms?.[0]?.id || 'term_1';
  const groupingMode = vm.preferences.groupingMode === 'grades' ? 'grades' : 'forms';
  const experience = setupExperience(vm.household.method, groupingMode);
  const groupingTitle = groupingMode === 'grades' ? 'Children & Grades' : 'Children & Forms';
  const groupingCopy =
    groupingMode === 'grades'
      ? "Keep each child's familiar grade or level. Forms stay out of the way, and Planner and Print organize assignments by grade or individual child."
      : 'Assign each child a Form and color. Forms let siblings at similar stages share work without duplicating the plan.';
  const collapseDefault = Boolean(vm.setupCompleted);
  const productExperience = learnExperience();
  const rhythmSetupTitle = productExperience.tefaActive ? 'Optional Formation & Rhythm' : 'Church Rhythm';
  const rhythmSetupSummary = productExperience.tefaActive
    ? 'Optional household practices, readings, memory work, and calendar notes'
    : 'Daily prayers, readings, saints, feasts, and fasting rhythm';
  const adaptivePanels = {
    church: `<span id="learnSetupChurchRhythm" class="learn-setup-anchor"></span>${collapsibleSetupPanel('churchRhythm', rhythmSetupTitle, churchRhythmSetupPanel(vm), { icon: '☩', summary: rhythmSetupSummary, defaultCollapsed: collapseDefault })}`,
    enrichment: `<span id="learnSetupFormation" class="learn-setup-anchor"></span>${collapsibleSetupPanel('enrichment', 'Enrichment', formationSetupPanel(vm), { icon: '✥', summary: 'Shared books, recitation, music, art, and beauty subjects', defaultCollapsed: true })}`,
    subjects: `<span id="learnSetupSubjects" class="learn-setup-anchor"></span>${collapsibleSetupPanel('subjects', experience.subjectTitle, formSubjectsSetupPanel(vm, currentTermId), { icon: '✎', summary: 'Curriculum and recurring work by planning group', defaultCollapsed: true })}`,
  };
  const orthodoxHouseholdFields = productExperience.tefaActive
    ? ''
    : `${setupInput('Parish', 'household.parishName', vm.household.parish)}${setupInput('Parish patronal feast', 'household.parishPatronalFeastName', vm.household.parishPatronalFeastName || '')}${setupInput('Patronal feast date', 'household.parishPatronalFeastDate', vm.household.parishPatronalFeastDate || '', { type: 'date' })}${setupInput('Patron Saint of your homeschool', 'household.patronSaintName', vm.household.patronSaintName || '', { placeholder: 'e.g. St. Xenia of St. Petersburg' })}${setupInput('Patron Saint feast date', 'household.patronSaintFeastDate', vm.household.patronSaintFeastDate || '', { type: 'date' })}`;
  const orthodoxHouseholdNote = productExperience.tefaActive
    ? ''
    : `<p style="margin:10px 0 0;color:var(--muted);font-size:13px;line-height:1.4;">The patronal feast repeats annually on the Family Planner calendar so it can be honored alongside name days, fasts, and major feasts. If your homeschool has its own patron saint, that name day appears there too, and both names print on report cards and transcripts.</p>`;
  const calendarField = productExperience.tefaActive
    ? ''
    : setupSelect('Church calendar', 'preferences.calendarType', vm.preferences.calendarType, vm.calendarOptions);
  const householdContent = `<div class="learn-setup-method-note"><small>Organized for ${html(vm.household.method || 'your household')}</small><strong>${html(experience.note)}</strong></div><div class="learn-setup-household-grid">${setupInput('Household name', 'household.name', vm.household.name)}${setupInput('Parent name', 'household.parentName', vm.household.parentName)}${setupSelect('Method', 'household.primaryMethod', vm.household.method || 'Unsure', homeschoolMethodOptions)}${setupInput('Homeschool name', 'household.homeschoolName', vm.household.homeschoolName || '', { placeholder: productExperience.tefaActive ? 'e.g. Harper Family Homeschool' : 'e.g. St. Xenia Homeschool' })}${orthodoxHouseholdFields}${setupSelect(
    'Planning groups',
    'preferences.groupingMode',
    groupingMode,
    [
      { value: 'forms', label: 'Forms' },
      { value: 'grades', label: 'Traditional grades / levels' },
    ]
  )}${setupInput('School year', 'schoolYear.label', vm.schoolYear.label)}${setupInput('Year start', 'schoolYear.startDate', vm.schoolYear.startDate, { type: 'date' })}${setupInput('Year end', 'schoolYear.endDate', vm.schoolYear.endDate, { type: 'date' })}${setupSelect('Current term', 'schoolYear.currentTermId', currentTermId, setupTermOptions(vm.terms, vm.term))}${calendarField}${setupSelect('Evaluation', 'preferences.evaluationModel', vm.preferences.evaluationModel, vm.evaluationModels)}${`<details class="learn-day-picker"><summary><span>Default school days</span><strong data-day-summary>${html(
    setupWeekdays
      .filter((day) => (vm.preferences.defaultSchoolDays || ['mon', 'tue', 'wed', 'thu', 'fri']).includes(day.value))
      .map((day) => day.label)
      .join(' · ')
  )}</strong></summary><div class="learn-day-picker-menu">${setupWeekdays.map((day) => `<label><input type="checkbox" data-day-choice value="${day.value}" ${(vm.preferences.defaultSchoolDays || ['mon', 'tue', 'wed', 'thu', 'fri']).includes(day.value) ? 'checked' : ''}>${day.label}</label>`).join('')}</div><input type="hidden" name="preferences.defaultSchoolDays" value="${html((vm.preferences.defaultSchoolDays || ['mon', 'tue', 'wed', 'thu', 'fri']).join(','))}"></details>`}${setupSelect('Default missed lesson', 'preferences.defaultMissedLessonBehavior', vm.preferences.defaultMissedLessonBehavior || 'next-occurrence', missedLessonOptions)}${setupInput('Default max minutes / child', 'preferences.defaultMaxDailyMinutes', vm.preferences.defaultMaxDailyMinutes || '240', { type: 'number' })}<input name="preferences.graceModeActive" type="hidden" value="${vm.preferences.graceModeActive ? 'true' : 'false'}" /><input name="preferences.graceModeDefault" type="hidden" value="${html(vm.preferences.graceModeDefault || 'light')}" /></div>${orthodoxHouseholdNote}`;
  const childrenContent = `<p style="margin:0 0 12px;color:var(--muted);">${html(groupingCopy)}</p><div data-setup-list="children" style="display:grid;gap:8px;">${(vm.children.length ? vm.children : [{}]).map((child) => childSetupRow(child, groupingMode)).join('')}</div><div class="learn-setup-add-actions"><button type="button" data-setup-add-row="children">Add one child</button>${isLearnFamilyPlan() ? `<button type="button" data-setup-add-children="3">Add 3 children</button>` : ''}</div>`;
  const termsContent = `<p style="margin:0 0 12px;color:var(--muted);line-height:1.45;">Term 4 / Summer is available for year-round homeschoolers. Assign subjects, books, and formation materials to the term where they belong.</p><div style="display:flex;justify-content:flex-end;margin-bottom:10px;"><button type="button" data-setup-add-row="terms" style="border:1px solid var(--line);background:var(--paper2);border-radius:10px;padding:10px 16px;font-family:inherit;">Add Term</button></div><div data-setup-list="terms" style="display:grid;gap:10px;">${(vm.terms?.length ? vm.terms : [vm.term]).map((term, index) => termSetupRow(term, index)).join('')}</div>`;
  const body = `
    <form data-setup-form data-screen-label="Set Up" class="learn-stack">
      <span id="learnSetupHousehold" class="learn-setup-anchor"></span>
      ${collapsibleSetupPanel('household', 'Household', householdContent, { icon: '⌂', summary: 'Profile, method, school year, calendar, and defaults', defaultCollapsed: collapseDefault })}
      <span id="learnSetupChildren" class="learn-setup-anchor"></span>
      ${collapsibleSetupPanel('children', groupingTitle, childrenContent, { icon: '◎', summary: `${vm.children.length || 0} ${vm.children.length === 1 ? 'child' : 'children'} configured`, defaultCollapsed: collapseDefault })}
      ${collapsibleSetupPanel('terms', 'Terms', termsContent, { icon: '◷', summary: `${vm.terms?.length || 1} term${(vm.terms?.length || 1) === 1 ? '' : 's'} in this school year`, defaultCollapsed: collapseDefault })}
      ${experience.order.map((key) => adaptivePanels[key]).join('')}
      <div class="learn-setup-savebar">
        <span data-setup-status class="learn-muted">Setup saves to the household profile and D1-backed Learn records.</span>
        <button type="submit" style="border:none;background:var(--navy);color:#fff;border-radius:10px;padding:12px 20px;font-family:inherit;font-weight:700;">Save Setup</button>
      </div>
    </form>`;
  return shell(vm, body);
}
function renderPrintCenter(vm) {
  const tefaActive = learnExperience().tefaActive;
  const householdTemplates = vm.templates.filter((t) => t.audience === 'mom' || t.audience === 'household');
  const childTemplates = vm.templates.filter((t) => t.audience === 'child');
  const freePlan = !isLearnFamilyPlan();
  const remaining = Math.max(0, vm.billing.printLimit - printCount());
  const nearLimit = freePlan && remaining <= 1;
  const accessBadge = (isPrem) =>
    isPrem
      ? `<span style="flex:none;border:1px solid var(--gold);background:#fbf2dd;color:var(--gold);border-radius:999px;padding:3px 9px;font-size:10px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;">Family</span>`
      : `<span style="flex:none;border:1px solid #c2d9c4;background:#edf6ef;color:#365f3b;border-radius:999px;padding:3px 9px;font-size:10px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;">Free</span>`;
  const templateRow = (template) => {
    const locked = template.premium && freePlan;
    return `
      <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-top:1px solid var(--line);${locked ? 'opacity:.72;' : ''}">
        <div style="flex:1;min-width:0;">
          <strong style="display:block;font-size:14px;color:var(--ink);">${html(template.title)}</strong>
          <small style="color:var(--muted);font-size:12px;line-height:1.35;">${html(template.description)}</small>
        </div>
        ${
          locked
            ? `<button type="button" data-print-upgrade
               style="flex:none;border:1px solid var(--gold);background:transparent;color:var(--gold);border-radius:8px;padding:7px 12px;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;">
               🔒 Upgrade
             </button>`
            : `<button type="button" data-print-generate="${html(template.id)}"
               style="flex:none;border:none;background:var(--navy);color:#fff;border-radius:8px;padding:7px 14px;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;">
               Print PDF
             </button>`
        }
      </div>`;
  };
  const GROUPS = [
    {
      id: 'weekly',
      label: 'This Week',
      icon: '▦',
      desc: 'Household plan and the landscape lesson grid by Form for the current week.',
      premium: false,
      ids: ['print_mom_weekly', 'planner_lessons_week_form'],
    },
    {
      id: 'month',
      label: 'Month & Calendar',
      icon: '▣',
      desc: tefaActive
        ? 'Monthly household plans with school days and household events clearly marked.'
        : 'Monthly household plans with feast days and fast days clearly marked.',
      premium: false,
      ids: ['print_mom_month', 'planner_events_month'],
    },
    {
      id: 'lessons',
      label: 'Lesson Plans',
      icon: '☰',
      desc: 'Structured lesson grids by Form, term, or month.',
      premium: true,
      ids: ['planner_lessons_month_form', 'planner_lessons_term_form', 'print_mom_term', 'print_mom_liturgical'],
    },
    {
      id: 'kitchen',
      label: 'Meals, Recipes & Home',
      icon: '♨',
      desc: 'Meal plans, recipe collections, grocery lists, and chore charts for the household.',
      premium: true,
      ids: [
        'planner_meals_week',
        'planner_meals_month',
        'planner_recipes',
        'planner_grocery_week',
        'planner_chores_day',
        'planner_chores_week',
        'planner_chores_month',
      ],
    },
  ];
  const tmplById = new Map(householdTemplates.map((t) => [t.id, t]));
  const assignedIds = new Set(GROUPS.flatMap((g) => g.ids));
  const ungrouped = householdTemplates.filter((t) => !assignedIds.has(t.id));
  const groupSection = (group) => {
    const members = group.ids.map((id) => tmplById.get(id)).filter(truthyLearn9);
    if (group.id === 'kitchen') members.push(...ungrouped.filter((t) => t.premium));
    else if (group.id === 'weekly') members.push(...ungrouped.filter((t) => !t.premium));
    if (!members.length) return '';
    const groupLocked = group.premium && freePlan;
    return `
      <div style="background:var(--paper);border:1px solid ${groupLocked ? 'rgba(181,148,47,.3)' : 'var(--line)'};border-radius:12px;overflow:hidden;">
        <div style="display:flex;align-items:center;gap:10px;padding:13px 14px;background:${groupLocked ? 'linear-gradient(90deg,#fffaed,var(--paper))' : 'var(--paper2)'};border-bottom:1px solid var(--line);">
          <span style="font-size:16px;color:var(--gold);">${group.icon}</span>
          <div style="flex:1;min-width:0;">
            <strong style="font-size:15px;color:var(--ink);">${group.label}</strong>
            <small style="display:block;color:var(--muted);font-size:12px;">${group.desc}</small>
          </div>
          ${groupLocked ? `<span style="flex:none;border:1px solid var(--gold);background:#fbf2dd;color:var(--gold);border-radius:999px;padding:3px 10px;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">Family Plan</span>` : `<span style="flex:none;border:1px solid #c2d9c4;background:#edf6ef;color:#365f3b;border-radius:999px;padding:3px 10px;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">Free</span>`}
        </div>
        ${members.map(templateRow).join('')}
      </div>`;
  };
  const usedPct = freePlan ? Math.round(((vm.billing.printLimit - remaining) / vm.billing.printLimit) * 100) : 0;
  const statusBar = freePlan
    ? `<div style="margin-top:8px;height:5px;border-radius:99px;background:var(--line);overflow:hidden;">
         <div style="height:100%;width:${usedPct}%;background:${nearLimit ? 'var(--burgundy)' : 'var(--gold)'};border-radius:99px;transition:width .4s;"></div>
       </div>
       <small style="display:block;margin-top:5px;color:${nearLimit ? 'var(--burgundy)' : 'var(--muted)'};font-size:11px;">
         ${remaining} of ${vm.billing.printLimit} free prints remaining
       </small>`
    : '';
  const planBanner = `
    <div style="border:1px solid ${nearLimit ? 'var(--burgundy)' : freePlan ? 'var(--line)' : 'rgba(181,148,47,.35)'};
      background:${freePlan ? 'var(--paper)' : 'linear-gradient(135deg,#fffdf5,#fdf5dc)'};
      border-radius:14px;padding:16px 20px;display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;">
      <div style="flex:1;min-width:220px;">
        <strong style="font-family:'Cormorant Garamond',serif;font-size:21px;color:var(--ink);">
          ${freePlan ? 'Free Plan' : '✦ Family Plan Active'}
        </strong>
        <span style="display:block;color:var(--muted);font-size:13px;margin-top:3px;line-height:1.45;">
          ${freePlan ? 'This Week and Month & Calendar packs are free. Lesson plans, meal plans, chore charts, recipes, and child sheets require the Family plan.' : 'All household plans, child sheets, lesson packs, meal plans, recipe collections, and planner prints are unlocked.'}
        </span>
        ${statusBar}
      </div>
      ${
        freePlan
          ? `<button type="button" data-print-upgrade
             style="flex:none;background:var(--navy);color:#fff;border:1px solid var(--gold);border-radius:10px;padding:11px 20px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;">
             Upgrade — Family Plan
           </button>`
          : `<span style="flex:none;color:var(--gold);font-size:13px;font-weight:700;padding-top:4px;">Unlocked ✦</span>`
      }
    </div>`;
  const childrenMap = /* @__PURE__ */ new Map();
  childTemplates.forEach((t) => {
    const key = t.childId || t.child || t.id;
    if (!childrenMap.has(key))
      childrenMap.set(key, { name: t.child || 'Child', childId: t.childId, color: t.color, sheets: [] });
    childrenMap.get(key).sheets.push(t);
  });
  const childGroupCard = (group) => {
    const locked = freePlan;
    const initial = html((group.name || 'C').charAt(0).toUpperCase());
    const avatarBg = group.color || 'var(--slate)';
    const selectId = `child-sheet-sel-${html(group.childId || group.name)}`;
    const options = group.sheets.map((t) => `<option value="${html(t.id)}">${html(t.title)}</option>`).join('');
    return `
      <article style="border:1px solid ${locked ? 'var(--gold)' : 'var(--line)'};border-radius:12px;background:${locked ? '#fffaed' : 'var(--paper)'};padding:14px;display:flex;flex-direction:column;gap:10px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="flex:none;width:36px;height:36px;border-radius:50%;background:${avatarBg};color:#f3ead4;display:flex;align-items:center;justify-content:center;font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:700;">${initial}</span>
          <strong style="font-size:15px;color:var(--ink);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${html(group.name)}</strong>
          ${accessBadge(true)}
        </div>
        <select id="${selectId}" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:9px 10px;font-family:inherit;font-size:13px;color:var(--ink);background:var(--paper2);cursor:${locked ? 'default' : 'pointer'};" ${locked ? 'disabled' : ''}>
          ${options}
        </select>
        <button type="button" data-child-print-group="${html(group.childId || group.name)}" data-child-select="${selectId}"
          style="border:1.5px solid ${locked ? 'var(--gold)' : 'var(--navy)'};background:${locked ? 'transparent' : 'var(--navy)'};color:${locked ? 'var(--gold)' : '#fff'};border-radius:9px;padding:10px 12px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;text-align:center;">
          ${locked ? `<span style="margin-right:5px;font-size:11px;">🔒</span>Upgrade to unlock` : 'Generate PDF'}
        </button>
      </article>`;
  };
  const childGrid = childrenMap.size
    ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;">${Array.from(childrenMap.values()).map(childGroupCard).join('')}</div>`
    : `<div style="padding:16px;border:1px dashed var(--line);border-radius:10px;color:var(--muted);font-size:13px;line-height:1.5;">
         Child sheets appear here once children are added in Setup. Each child gets a weekly assignment sheet, term plan, and chore chart.
       </div>`;
  const upcomingReports = [
    { label: 'Progress summaries', desc: 'Term and year snapshots by child, Form, and subject.' },
    { label: 'Report cards', desc: 'Narrative, complete/incomplete, percentage, and letter-grade formats.' },
    { label: 'Transcripts', desc: 'Course, credit, grade, and school-year records for older students.' },
    { label: 'State reporting exports', desc: 'Attendance, subject progress, and portfolio-ready summaries.' },
  ];
  const reportsSection = `
    <section id="reports" style="background:linear-gradient(135deg,var(--paper),var(--paper2));border:1px solid rgba(181,148,47,.35);border-radius:14px;padding:22px;display:grid;gap:18px;scroll-margin-top:110px;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;">
        <div>
          <div style="color:var(--gold);font-size:10px;letter-spacing:.18em;font-weight:800;text-transform:uppercase;margin-bottom:6px;">Reports & Records</div>
          <h2 style="font-family:'Cormorant Garamond',serif;font-size:30px;line-height:1.05;margin:0 0 6px;color:var(--ink);">Beautiful records, built from work already done.</h2>
          <p style="margin:0;color:var(--muted);font-size:13px;line-height:1.5;max-width:640px;">This workspace will turn saved lessons, narrations, subject progress, and term closures into polished homeschool records. Staged for a future release.</p>
        </div>
        <span style="flex:none;border:1px solid var(--gold);border-radius:999px;background:var(--navy);color:#fffaf0;padding:7px 14px;font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;">Coming Soon</span>
      </div>
      ${
        vm.reports?.stats?.length
          ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;">${vm.reports.stats
              .map(
                (stat) => `
        <article style="border:1px solid var(--line);border-radius:10px;background:rgba(255,255,255,.6);padding:14px;">
          <small style="display:block;color:var(--gold);font-size:10px;letter-spacing:.1em;text-transform:uppercase;font-weight:800;">${html(stat.label)}</small>
          <strong style="display:block;font-family:'Cormorant Garamond',serif;font-size:26px;margin-top:4px;color:var(--ink);">${html(stat.value)}</strong>
          <span style="display:block;color:var(--muted);font-size:12px;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${html(stat.sub)}</span>
        </article>`
              )
              .join('')}</div>`
          : ''
      }
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;">
        ${upcomingReports
          .map(
            (r) => `
          <article style="border:1px solid var(--line);border-radius:10px;background:var(--paper);padding:14px;opacity:.78;">
            <strong style="display:block;color:var(--ink);margin-bottom:4px;">${r.label}</strong>
            <p style="margin:0;color:var(--muted);font-size:13px;line-height:1.4;">${r.desc}</p>
          </article>`
          )
          .join('')}
      </div>
    </section>`;
  const outputsPanel = panel(
    'What You Can Print',
    `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:20px;">
      <div>
        <div style="color:var(--gold);font-size:10px;letter-spacing:.14em;font-weight:800;text-transform:uppercase;margin-bottom:8px;">Household</div>
        ${(vm.outputs?.household || vm.sampleOutputs?.mom || []).map((item) => `<div style="padding:7px 0;border-top:1px solid var(--line);font-size:13px;color:var(--ink);">${html(item)}</div>`).join('')}
      </div>
      <div>
        <div style="color:var(--gold);font-size:10px;letter-spacing:.14em;font-weight:800;text-transform:uppercase;margin-bottom:8px;">Child</div>
        ${(vm.outputs?.child || vm.sampleOutputs?.child || []).map((item) => `<div style="padding:7px 0;border-top:1px solid var(--line);font-size:13px;color:var(--ink);">${html(item)}</div>`).join('')}
      </div>
      ${
        (vm.outputs?.planner || vm.sampleOutputs?.planner || []).length
          ? `<div>
        <div style="color:var(--gold);font-size:10px;letter-spacing:.14em;font-weight:800;text-transform:uppercase;margin-bottom:8px;">Planner</div>
        ${(vm.outputs?.planner || vm.sampleOutputs?.planner || []).map((item) => `<div style="padding:7px 0;border-top:1px solid var(--line);font-size:13px;color:var(--ink);">${html(item)}</div>`).join('')}
      </div>`
          : ''
      }
    </div>`,
    { icon: '✥' }
  );
  const draftJob = panel(
    'Weekly Family Plan',
    `
    <strong style="font-family:'Cormorant Garamond',serif;font-size:24px;color:var(--ink);">${html(vm.job.status)}</strong>
    <div style="margin-top:8px;color:var(--muted);line-height:1.55;">
      ${html(vm.term.label)}<br>
      ${html(vm.term.week)}<br>
      ${vm.job.range ? html(vm.job.range) + ' · ' : ''}${html(vm.job.format)}
    </div>
    <button type="button" data-print-generate="weekly-pack"
      style="margin-top:14px;width:100%;background:var(--navy);color:#fff;border:none;border-radius:10px;padding:11px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;">
      Generate Print Pack
    </button>
    ${
      !freePlan
        ? `<button type="button" data-print-generate="print_mom_month" data-print-month="${html(vm.term.monthKey)}"
      style="margin-top:8px;width:100%;background:transparent;color:var(--navy);border:1.5px solid var(--line);border-radius:10px;padding:10px;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;">
      Month Calendar
    </button>`
        : ''
    }`,
    { icon: '✒' }
  );
  const body = `
    <section data-screen-label="Print Center" class="learn-stack">
      ${planBanner}
      <div style="display:grid;grid-template-columns:1fr 330px;gap:16px;align-items:start;">
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${GROUPS.map(groupSection).join('')}
        </div>
        ${draftJob}
      </div>
      ${panel('Child Sheets', childGrid, { icon: '◎' })}
      ${reportsSection}
      ${outputsPanel}
    </section>`;
  return shell(vm, body);
}
function redirectExpiredLearnSession() {
  if (window.MyAgapayShell?.redirectToLogin) {
    window.MyAgapayShell.redirectToLogin('session-expired');
    return;
  }
  localStorage.removeItem('agapayDonorToken');
  localStorage.removeItem('agapayDonorProfile');
  localStorage.removeItem('agapayDonorEmail');
  localStorage.removeItem('agapay.learn.plan');
  const loginPath = isOdysseyLearnContext() ? '/learn/odyssey/dashboard/login' : '/myagapay/login';
  const loginUrl = new URL(loginPath, window.location.origin);
  loginUrl.searchParams.set('next', `${window.location.pathname}${window.location.search || ''}`);
  loginUrl.searchParams.set('reason', 'session-expired');
  window.location.replace(loginUrl.toString());
}
function waitForLearnSignIn(response) {
  if (response.status !== 401) return null;
  redirectExpiredLearnSession();
  return new Promise(() => {});
}
async function apiGet(path) {
  const response = await fetch(path, {
    headers: learnRequestHeaders(),
  });
  const signInRedirect = waitForLearnSignIn(response);
  if (signInRedirect) return signInRedirect;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) throw new Error(payload.error || `Request failed with ${response.status}`);
  return payload;
}
async function apiPost(path, body) {
  let response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: learnRequestHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Unable to reach AGAPAY Learn. Please refresh, confirm you are still logged in, and try again.');
  }
  const signInRedirect = waitForLearnSignIn(response);
  if (signInRedirect) return signInRedirect;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) throw new Error(payload.error || `Request failed with ${response.status}`);
  return payload;
}
async function syncLearnGoogleCalendar(extraEvents = [], statusEl = null) {
  if (!learnGoogleCalendarStatus.configured || !learnGoogleCalendarStatus.connected) {
    if (statusEl)
      statusEl.textContent = `${statusEl.textContent} Google Calendar is not connected — connect it in Setup to sync.`;
    return null;
  }
  try {
    const calendar = storedLearnCalendar('');
    const pageParams = new URLSearchParams(window.location.search);
    const syncParams = {
      calendar,
      returnTo: window.location.pathname + window.location.search,
      date: pageParams.get('date') || '',
      termId: pageParams.get('termId') || '',
    };
    const result = await apiPost(learnApiUrl('/api/learn/google-calendar/sync', syncParams), { extraEvents });
    if (statusEl) {
      const count = Number(result?.syncedCount || 0);
      statusEl.textContent = count
        ? `${statusEl.textContent} Google Calendar synced ${count} item${count === 1 ? '' : 's'}.`
        : `${statusEl.textContent} Google Calendar is connected, but nothing matched this week to sync.`;
    }
    return result;
  } catch (error) {
    console.warn('Google Calendar sync skipped:', error);
    if (statusEl) statusEl.textContent = `${statusEl.textContent} Google Calendar sync needs attention.`;
    return null;
  }
}
function localIsoDate() {
  const now = /* @__PURE__ */ new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
function storedLearnCalendar(fallback = '') {
  try {
    return localStorage.getItem('agapay.learn.calendar') || fallback;
  } catch {
    return fallback;
  }
}
function learnApiUrl(path, params = {}) {
  const url = new URL(path, window.location.origin);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== void 0 && value !== null && String(value) !== '') url.searchParams.set(key, String(value));
  });
  return `${url.pathname}${url.search}`;
}
function rowValue(row, name) {
  const control = row.querySelector(`[name="${name}"]`);
  if (!control) return '';
  const controls = row.querySelectorAll(`[name="${name}"]`);
  if (controls.length > 1 && control.type === 'checkbox') {
    return [...controls]
      .filter((item) => item.checked)
      .map((item) => item.value)
      .join(', ');
  }
  if (control.type === 'checkbox') return control.checked;
  return control.value.trim();
}
function setupChildRowsFromForm(form) {
  if (!form) return [];
  return [...form.querySelectorAll('[data-setup-row="children"]')]
    .map((row, index) => {
      const firstName = rowValue(row, 'firstName');
      const id = row.dataset.id || `child_${index + 1}`;
      return {
        id,
        firstName,
        name: firstName || `Child ${index + 1}`,
        formLabel: rowValue(row, 'formLabel'),
        gradeLabel: rowValue(row, 'gradeLabel'),
      };
    })
    .filter((child) => child.firstName || child.formLabel || child.gradeLabel);
}
function truthyLearn10(value) {
  return Boolean(value);
}
function rowWeeklyPlans(row) {
  return Array.from({ length: DEFAULT_TERM_WEEK_COUNT }, (_, index) => rowValue(row, `weeklyPlans.${index + 1}`));
}
function rowResourceValue(resourceRow, index, field) {
  const control = resourceRow.querySelector(`[name="${resourceFieldName(index, field)}"]`);
  if (!control) return '';
  return control.value.trim();
}
function rowResourceWeeklyPlans(resourceRow, index) {
  return Array.from({ length: DEFAULT_TERM_WEEK_COUNT }, (_, weekIndex) =>
    rowResourceValue(resourceRow, index, `weeklyPlans.${weekIndex + 1}`)
  );
}
function rowResources(row) {
  const resourceRows = [...row.querySelectorAll('[data-resource-list] [data-resource-row]')];
  if (resourceRows.length) {
    return resourceRows
      .map((resourceRow) => {
        const index = Number(resourceRow.dataset.resourceRow || 0);
        const titleInput =
          resourceRow.querySelector(`[name="resources.${index}.title"]`) ||
          resourceRow.querySelector("input[type='text']");
        const weeksInput = resourceRow.querySelector(`[name="resources.${index}.scheduledWeeks"]`);
        const title = titleInput?.value?.trim() || '';
        const scheduledWeeks = selectedTermWeeks(weeksInput?.value || '');
        return {
          title,
          scheduledWeeks,
          weeklyPlans: rowResourceWeeklyPlans(resourceRow, index),
          planningMode: rowResourceValue(resourceRow, index, 'planningMode'),
          formLabel: rowResourceValue(resourceRow, index, 'formLabel'),
          formLabels: rowResourceValue(resourceRow, index, 'formLabels')
            .split(',')
            .map((value) => value.trim())
            .filter(truthyLearn10),
          gradeLabel: rowResourceValue(resourceRow, index, 'gradeLabel'),
          childIds: rowResourceValue(resourceRow, index, 'childIds')
            .split(',')
            .map((value) => value.trim())
            .filter(truthyLearn10),
        };
      })
      .filter((r) => r.title);
  }
  const legacy = rowValue(row, 'resource');
  return legacy ? [{ title: legacy, scheduledWeeks: [] }] : [];
}
function resourceRowPrimaryGroupLabel(resourceRow, groupingMode = 'forms') {
  const index = Number(resourceRow?.dataset.resourceRow || 0);
  return primaryResourceGroupLabel(
    {
      formLabel: rowResourceValue(resourceRow, index, 'formLabel'),
      formLabels: rowResourceValue(resourceRow, index, 'formLabels')
        .split(',')
        .map((value) => value.trim())
        .filter(truthyLearn10),
      gradeLabel: rowResourceValue(resourceRow, index, 'gradeLabel'),
    },
    groupingMode
  );
}
function refreshResourceLaneCounts(list) {
  if (!list) return;
  list.querySelectorAll('[data-resource-lane]').forEach((lane) => {
    const count = lane.querySelectorAll('[data-resource-row]').length;
    const countEl = lane.querySelector('header strong');
    if (countEl) countEl.textContent = `${count} ${count === 1 ? 'resource' : 'resources'}`;
  });
}
function moveResourceRowToLane(resourceRow) {
  const list = resourceRow?.closest('[data-resource-list]');
  if (!list?.classList.contains('learn-resource-list-by-form')) return;
  const groupingMode = list.querySelector('[data-resource-grouping-mode]')?.dataset.resourceGroupingMode || 'forms';
  const label = resourceRowPrimaryGroupLabel(resourceRow, groupingMode);
  const laneKey = label || '__family';
  const lane = [...list.querySelectorAll('[data-resource-lane]')].find(
    (candidate) => candidate.dataset.resourceLane === laneKey
  );
  const addButton = lane?.querySelector('[data-add-resource]');
  if (addButton && resourceRow.parentElement !== addButton.parentElement) addButton.before(resourceRow);
  reindexResourceList(list);
}
function reindexResourceList(list) {
  if (!list) return;
  list.querySelectorAll('[data-resource-row]').forEach((row, i) => {
    row.dataset.resourceRow = String(i);
    row.querySelectorAll('[data-resource-field]').forEach((field) => {
      const key = field.dataset.resourceField || '';
      if (key) field.name = resourceFieldName(i, key);
    });
    const weekPicker = row.querySelector('[data-resource-week-picker]');
    if (weekPicker) weekPicker.dataset.resourceWeekPicker = String(i);
    row.querySelectorAll('.learn-resource-card-summary small, .learn-resource-modal-card > small').forEach((label) => {
      label.textContent = i === 0 ? 'Book / source / resource' : `Resource ${i + 1}`;
    });
    refreshResourceSummary(row);
  });
  refreshResourceLaneCounts(list);
}
function moveResourceRowToSubject(resourceRow, subjectRow) {
  const sourceList = resourceRow?.closest('[data-resource-list]');
  const targetList = subjectRow?.querySelector('[data-resource-list]');
  if (!resourceRow || !sourceList || !targetList || sourceList === targetList) return false;
  if (targetList.classList.contains('learn-resource-list-by-form')) {
    const groupingMode =
      targetList.querySelector('[data-resource-grouping-mode]')?.dataset.resourceGroupingMode || 'forms';
    const laneKey = resourceRowPrimaryGroupLabel(resourceRow, groupingMode) || '__family';
    const lane =
      [...targetList.querySelectorAll('[data-resource-lane]')].find(
        (candidate) => candidate.dataset.resourceLane === laneKey
      ) || targetList.querySelector('[data-resource-lane]');
    const addButton = lane?.querySelector('[data-add-resource]');
    if (addButton) addButton.before(resourceRow);
    else lane?.querySelector('.learn-resource-form-lane-body')?.appendChild(resourceRow);
  } else {
    const addButton = targetList.querySelector('[data-add-resource]');
    if (addButton) addButton.before(resourceRow);
    else targetList.appendChild(resourceRow);
  }
  reindexResourceList(sourceList);
  reindexResourceList(targetList);
  return true;
}
function refreshResourceSummary(resourceRow) {
  if (!resourceRow) return;
  const index = Number(resourceRow.dataset.resourceRow || 0);
  const title = resourceRow.querySelector(`[name="${resourceFieldName(index, 'title')}"]`)?.value?.trim() || '';
  const weeks = selectedTermWeeks(
    resourceRow.querySelector(`[name="${resourceFieldName(index, 'scheduledWeeks')}"]`)?.value || ''
  );
  const groups = (resourceRow.querySelector(`[name="${resourceFieldName(index, 'formLabels')}"]`)?.value || '')
    .split(',')
    .map((value) => value.trim())
    .filter(truthyLearn10);
  const children = (resourceRow.querySelector(`[name="${resourceFieldName(index, 'childIds')}"]`)?.value || '')
    .split(',')
    .map((value) => value.trim())
    .filter(truthyLearn10);
  const titleEl = resourceRow.querySelector('[data-resource-summary-title]');
  const detailEl = resourceRow.querySelector('[data-resource-summary-detail]');
  if (titleEl) titleEl.textContent = title || 'Untitled resource';
  if (detailEl)
    detailEl.textContent = [
      termWeekSummaryFromSelected(weeks),
      groups.length ? groups.join(', ') : '',
      children.length ? `${children.length} child-specific` : '',
    ]
      .filter(truthyLearn10)
      .join(' · ');
}
function snapshotResourceModal(modal) {
  if (!modal) return;
  const fields = [...modal.querySelectorAll('input, select, textarea')].map((field) => ({
    name: field.name || '',
    value: field.value || '',
    checked: Boolean(field.checked),
  }));
  modal.dataset.resourceSnapshot = JSON.stringify(fields);
}
function restoreResourceModal(modal) {
  if (!modal?.dataset.resourceSnapshot) return;
  try {
    const fields = JSON.parse(modal.dataset.resourceSnapshot);
    fields.forEach((state, index) => {
      const field = modal.querySelectorAll('input, select, textarea')[index];
      if (!field || field.name !== state.name) return;
      if (field.type === 'checkbox') field.checked = Boolean(state.checked);
      else field.value = state.value || '';
    });
  } catch {}
}
function rowTileMinutes(row) {
  return (
    row.closest('.learn-setup-subsection')?.querySelector('[data-setup-section-minutes-input]')?.value?.trim() ||
    rowValue(row, 'minutes') ||
    rowValue(row, 'minutesPlanned')
  );
}
function collectRows(form, rowType, mapper) {
  return [...form.querySelectorAll(`[data-setup-row="${rowType}"]`)]
    .map((row, index) => mapper(row, index))
    .filter(truthyLearn10);
}
async function openSaintOfDay(button) {
  const date = button.dataset.date || '';
  const calendar = button.dataset.calendar || storedLearnCalendar('');
  const previousText = button.querySelector('small')?.textContent || '';
  button.disabled = true;
  button.style.cursor = 'wait';
  const small = button.querySelector('small');
  if (small) small.textContent = 'Loading the lives of the saints...';
  try {
    const payload = await apiGet(learnApiUrl('/api/learn/saints', { date, calendar }));
    const unavailable =
      payload.sourceConnected === false
        ? payload.message || 'Lives of the Saints are unavailable right now. Please try again later.'
        : '';
    const cardSaintTitle = button.dataset.saintTitle || button.querySelector('strong')?.textContent || '';
    const orderedSaints = forceDisplayedSaintFirst(payload.saints || [], cardSaintTitle);
    const firstSaintTitle =
      orderedSaints?.[0]?.name || orderedSaints?.[0]?.title || cardSaintTitle || 'Saint of the Day';
    showLearnDialog(
      firstSaintTitle,
      payload.date ? `Saint of the Day · ${payload.date}` : "Today's commemoration",
      [{ label: 'Attribution', value: 'Lives of the Saints courtesy of Orthocal.info' }],
      {
        width: '760px',
        contentHtml: saintStoryDialogHtml(orderedSaints, unavailable),
      }
    );
  } catch (error) {
    showLearnDialog(
      'Saint of the Day Unavailable',
      error.message || 'Lives of the Saints are unavailable right now. Please try again later.',
      [{ label: 'Source', value: 'Orthocal.info' }]
    );
  } finally {
    button.disabled = false;
    button.style.cursor = 'pointer';
    if (small) small.textContent = previousText;
  }
}
function wireDashboard() {
  root.querySelectorAll('[data-tefa-view-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const next = learnExperience().viewMode === 'tefa' ? 'classic' : 'tefa';
      setLearnViewMode(next);
      window.location.reload();
    });
  });
  root.querySelectorAll('[data-church-section-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const body = button.closest('[data-church-section]')?.querySelector('[data-church-section-body]');
      if (!body) return;
      const nowCollapsed = !body.hidden;
      body.hidden = nowCollapsed;
      body.style.display = nowCollapsed ? 'none' : 'flex';
      button.setAttribute('aria-expanded', nowCollapsed ? 'false' : 'true');
      const label = button.querySelector('[data-church-section-toggle-label]');
      if (label) label.textContent = nowCollapsed ? 'Show Church Rhythm' : 'Minimize';
      try {
        localStorage.setItem('agapay.learn.churchCardMinimized', nowCollapsed ? 'true' : 'false');
      } catch {}
    });
  });
  root.querySelectorAll('[data-saint-of-day]').forEach((button) => {
    button.addEventListener('click', () => openSaintOfDay(button));
  });
  root.querySelectorAll('[data-learn-completion]').forEach((button) => {
    button.addEventListener('click', async () => {
      const itemId = button.dataset.completionId || '';
      const scope = button.dataset.completionScope || '';
      const completed = button.getAttribute('aria-pressed') !== 'true';
      const calendar = storedLearnCalendar('');
      button.disabled = true;
      button.style.cursor = 'wait';
      try {
        const saved = await apiPost(learnApiUrl('/api/learn/completion', { calendar }), {
          itemId,
          scope,
          completed,
          civilDate: localIsoDate(),
        });
        renderLearnRoot(root, renderDashboard(prepareOdysseyViewModel(toDashboardViewModel(saved))));
        wireDashboard();
      } catch (error) {
        button.disabled = false;
        button.style.cursor = 'pointer';
        showLearnDialog(
          'Progress Could Not Be Saved',
          error.message || 'AGAPAY Learn could not save this progress update.',
          []
        );
      }
    });
  });
  root.querySelectorAll('[data-grace-mode]').forEach((button) => {
    button.addEventListener('click', async () => {
      const mode = button.dataset.graceMode || 'light';
      const status = root.querySelector('[data-grace-mode-status]');
      const calendar = storedLearnCalendar('');
      if (status) {
        status.style.color = 'var(--muted)';
        status.textContent = 'Saving rhythm...';
      }
      root.querySelectorAll('[data-grace-mode]').forEach((item) => {
        item.disabled = true;
        item.style.cursor = 'wait';
      });
      try {
        const saved = await apiPost(learnApiUrl('/api/learn/grace-mode', { calendar }), {
          mode,
          active: mode !== 'full',
        });
        renderLearnRoot(root, renderDashboard(prepareOdysseyViewModel(toDashboardViewModel(saved))));
        wireDashboard();
        const nextStatus = root.querySelector('[data-grace-mode-status]');
        if (nextStatus) nextStatus.textContent = 'Rhythm saved.';
      } catch (error) {
        if (status) {
          status.style.color = 'var(--burgundy)';
          status.textContent = error.message;
        }
        root.querySelectorAll('[data-grace-mode]').forEach((item) => {
          item.disabled = false;
          item.style.cursor = 'pointer';
        });
      }
    });
  });
}
function truthyLearn11(value) {
  return Boolean(value);
}
function learnNamedField(form, name) {
  const field = form.elements.namedItem(name);
  return {
    value: field && 'value' in field && typeof field.value === 'string' ? field.value : void 0,
    checked: field && 'checked' in field && typeof field.checked === 'boolean' ? field.checked : void 0,
    type: field && 'type' in field && typeof field.type === 'string' ? field.type : void 0,
  };
}
function setupPayloadFromForm(form) {
  const get = (name) => learnNamedField(form, name)?.value?.trim() || '';
  const isChecked = (name) =>
    learnNamedField(form, name)?.type === 'hidden'
      ? get(name) === 'true'
      : Boolean(learnNamedField(form, name)?.checked);
  const terms = collectRows(form, 'terms', (row, index) => {
    const label = rowValue(row, 'label');
    if (!label) return null;
    return {
      id: rowValue(row, 'id') || row.dataset.id || `term_${index + 1}`,
      label,
      startDate: rowValue(row, 'startDate'),
      endDate: rowValue(row, 'endDate'),
      weeksCount: Math.max(1, Math.min(24, Number(rowValue(row, 'weeksCount') || 12))),
      description: rowValue(row, 'description') || '',
      paceMode: 'steady',
    };
  });
  const currentTermId = get('schoolYear.currentTermId') || terms[0]?.id || 'term_1';
  const currentTerm = terms.find((term) => term.id === currentTermId) || terms[0] || {};
  const setupTiles = {};
  form.querySelectorAll('.learn-setup-subsection').forEach((section) => {
    const group = section.dataset.setupSectionGroup || '';
    const panelId = section.dataset.setupSectionPanel || '';
    if (!group || !panelId) return;
    const title = section.querySelector('[data-setup-section-title-input]')?.value?.trim() || '';
    const detail = section.querySelector('[data-setup-section-detail-input]')?.value?.trim() || '';
    const minutes = section.querySelector('[data-setup-section-minutes-input]')?.value?.trim() || '';
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
      const firstName = rowValue(row, 'firstName');
      if (!firstName) return null;
      return {
        id: row.dataset.id || '',
        firstName,
        gradeLabel: rowValue(row, 'gradeLabel'),
        formLabel: rowValue(row, 'formLabel'),
        ageYears: rowValue(row, 'ageYears'),
        nameDay: rowValue(row, 'nameDay'),
        color: rowValue(row, 'color'),
      };
    }),
    streams: collectRows(form, 'streams', (row) => {
      const title = rowValue(row, 'title');
      if (!title) return null;
      return {
        id: row.dataset.id || '',
        title,
        streamType: rowValue(row, 'streamType'),
        cadenceLabel: rowValue(row, 'cadenceLabel'),
        dailyMinutes: {
          mon: rowValue(row, 'monMinutes'),
          tue: rowValue(row, 'tueMinutes'),
          wed: rowValue(row, 'wedMinutes'),
          thu: rowValue(row, 'thuMinutes'),
          fri: rowValue(row, 'friMinutes'),
        },
      };
    }),
    subjects: collectRows(form, 'subjects', (row) => {
      const title = rowValue(row, 'title');
      if (!title) return null;
      const resources = rowResources(row);
      const primaryResource = resources[0] || {};
      return {
        id: row.dataset.id || '',
        title,
        subjectType: rowValue(row, 'subjectType'),
        planningMode: rowValue(row, 'planningMode') || primaryResource.planningMode || 'forms',
        instructionMode: rowValue(row, 'instructionMode'),
        schedulingMode: rowValue(row, 'schedulingMode'),
        scheduledDays: scheduledDays(rowValue(row, 'scheduledDays'), rowValue(row, 'weeklyFrequency')),
        scheduledWeeks: selectedTermWeeks(
          rowValue(row, 'scheduledWeeks') || (primaryResource.scheduledWeeks || []).join(',')
        ),
        weeklyFrequency: rowValue(row, 'weeklyFrequency'),
        weeklyPlans: rowWeeklyPlans(row).some(Boolean) ? rowWeeklyPlans(row) : primaryResource.weeklyPlans || [],
        weeklyTarget: rowValue(row, 'weeklyTarget'),
        termTarget: rowValue(row, 'termTarget'),
        activeStartDate: rowValue(row, 'activeStartDate'),
        activeEndDate: rowValue(row, 'activeEndDate'),
        priorityLevel: rowValue(row, 'priorityLevel'),
        missedLessonBehavior: rowValue(row, 'missedLessonBehavior'),
        cadenceLabel: rowValue(row, 'weeklyFrequency'),
        formLabel: rowValue(row, 'formLabel') || primaryResource.formLabel || '',
        formLabels: (rowValue(row, 'formLabels') || (primaryResource.formLabels || []).join(','))
          .split(',')
          .map((v) => v.trim())
          .filter(truthyLearn11),
        gradeLabel: rowValue(row, 'gradeLabel') || primaryResource.gradeLabel || '',
        resource: resources[0]?.title || rowValue(row, 'resource'),
        resources,
        resourceType: rowValue(row, 'resourceType'),
        minutes: rowTileMinutes(row),
        childId: rowValue(row, 'childId'),
        childIds: (rowValue(row, 'childIds') || (primaryResource.childIds || []).join(','))
          .split(',')
          .map((v) => v.trim())
          .filter(truthyLearn11),
        progressionType: rowValue(row, 'progressionType'),
        startNumber: rowValue(row, 'startNumber'),
        currentNumber: rowValue(row, 'currentNumber'),
        endNumber: rowValue(row, 'endNumber'),
        credits: rowValue(row, 'credits'),
        finalGradeOverride: rowValue(row, 'finalGradeOverride'),
        color: rowValue(row, 'color'),
        termId: rowValue(row, 'termId') || currentTermId,
        gracePriority: rowValue(row, 'gracePriority'),
        graceNote: rowValue(row, 'graceNote'),
      };
    }),
    books: collectRows(form, 'books', (row) => {
      const title = rowValue(row, 'title');
      if (!title) return null;
      return {
        id: row.dataset.id || '',
        title,
        author: rowValue(row, 'author'),
        category: rowValue(row, 'category'),
        planningMode: rowValue(row, 'planningMode'),
        scheduledWeeks: scheduledTermWeeks(rowValue(row, 'scheduledWeeks')),
        weeklyFrequency: rowValue(row, 'weeklyFrequency'),
        minutes: rowValue(row, 'minutes'),
        formLabel: rowValue(row, 'formLabel'),
        audienceLabel: rowValue(row, 'audienceLabel'),
        startChapter: rowValue(row, 'startChapter'),
        currentChapter: rowValue(row, 'currentChapter'),
        endChapter: rowValue(row, 'endChapter'),
        color: rowValue(row, 'color'),
        termId: rowValue(row, 'termId') || currentTermId,
        graceNote: rowValue(row, 'graceNote'),
      };
    }),
    formation: {
      churchRhythms: collectRows(form, 'formationRhythms', (row) => {
        const title = rowValue(row, 'title');
        if (!title) return null;
        return {
          id: row.dataset.id || '',
          title,
          note: rowValue(row, 'note'),
          weeklyFrequency: rowValue(row, 'weeklyFrequency'),
          weeklyTarget: rowValue(row, 'weeklyTarget'),
          termTarget: rowValue(row, 'termTarget'),
          activeStartDate: rowValue(row, 'activeStartDate'),
          activeEndDate: rowValue(row, 'activeEndDate'),
          priorityLevel: rowValue(row, 'priorityLevel'),
          missedLessonBehavior: rowValue(row, 'missedLessonBehavior'),
          cadenceLabel: rowValue(row, 'weeklyFrequency'),
          minutes: rowValue(row, 'minutes'),
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
        const title = rowValue(row, 'title');
        if (!title) return null;
        return {
          id: row.dataset.id || '',
          title,
          sourceKind: rowValue(row, 'sourceKind'),
          planningMode: rowValue(row, 'planningMode'),
          formLabel: rowValue(row, 'formLabel'),
          formLabels: rowValue(row, 'formLabels')
            .split(',')
            .map((value) => value.trim())
            .filter(truthyLearn11),
          gradeLabel: rowValue(row, 'gradeLabel'),
          scheduledWeeks: scheduledTermWeeks(rowValue(row, 'scheduledWeeks')),
          weeklyFrequency: rowValue(row, 'weeklyFrequency'),
          minutes: rowValue(row, 'minutes'),
        };
      }),
      hymnStudies: collectRows(form, 'formationHymns', (row) => {
        const title = rowValue(row, 'title');
        if (!title) return null;
        return {
          id: row.dataset.id || '',
          title,
          tone: rowValue(row, 'tone'),
          source: rowValue(row, 'source'),
          planningMode: rowValue(row, 'planningMode'),
          weeklyFrequency: rowValue(row, 'weeklyFrequency'),
          minutes: rowValue(row, 'minutes'),
          status: rowValue(row, 'status'),
        };
      }),
      enrichmentBlocks: collectRows(form, 'formationEnrichment', (row) => {
        const resources = rowResources(row);
        const primaryResource = resources[0] || {};
        const title = rowValue(row, 'title') || primaryResource.title || rowValue(row, 'blockType');
        if (!title) return null;
        return {
          id: row.dataset.id || '',
          blockType: rowValue(row, 'blockType'),
          title,
          // Only send a top-level "resource" name when a real resource exists.
          // Falling back to the block title/type here used to manufacture a
          // phantom resource on save whenever the resource list was emptied —
          // the server would reconstruct one from this field, making deletes
          // appear to silently "undo" on refresh.
          resource: primaryResource.title || '',
          resources,
          resourceType: rowValue(row, 'resourceType'),
          planningMode: rowValue(row, 'planningMode') || primaryResource.planningMode || 'forms',
          instructionMode: rowValue(row, 'instructionMode'),
          schedulingMode: rowValue(row, 'schedulingMode'),
          scheduledDays: scheduledDays(rowValue(row, 'scheduledDays'), rowValue(row, 'weeklyFrequency')),
          scheduledWeeks: selectedTermWeeks(
            rowValue(row, 'scheduledWeeks') || (primaryResource.scheduledWeeks || []).join(',')
          ),
          weeklyFrequency: rowValue(row, 'weeklyFrequency'),
          weeklyPlans: rowWeeklyPlans(row).some(Boolean) ? rowWeeklyPlans(row) : primaryResource.weeklyPlans || [],
          cadenceLabel: rowValue(row, 'weeklyFrequency'),
          formLabel: rowValue(row, 'formLabel') || primaryResource.formLabel || '',
          formLabels: (rowValue(row, 'formLabels') || (primaryResource.formLabels || []).join(','))
            .split(',')
            .map((value) => value.trim())
            .filter(truthyLearn11),
          gradeLabel: rowValue(row, 'gradeLabel') || primaryResource.gradeLabel || '',
          childId: rowValue(row, 'childId'),
          childIds: (rowValue(row, 'childIds') || (primaryResource.childIds || []).join(','))
            .split(',')
            .map((v) => v.trim())
            .filter(truthyLearn11),
          startNumber: rowValue(row, 'startNumber'),
          currentNumber: rowValue(row, 'currentNumber'),
          endNumber: rowValue(row, 'endNumber'),
          minutesPlanned: rowTileMinutes(row),
          credits: rowValue(row, 'credits'),
          finalGradeOverride: rowValue(row, 'finalGradeOverride'),
          color: rowValue(row, 'color'),
          termId: rowValue(row, 'termId') || currentTermId,
          gracePriority: rowValue(row, 'gracePriority'),
          graceNote: rowValue(row, 'graceNote'),
        };
      }),
      feasts: collectRows(form, 'formationFeasts', (row) => {
        const title = rowValue(row, 'title');
        if (!title) return null;
        return {
          id: row.dataset.id || '',
          civilDate: rowValue(row, 'civilDate'),
          title,
          fastingRule: rowValue(row, 'fastingRule'),
          planningMode: rowValue(row, 'planningMode'),
          minutes: rowValue(row, 'minutes'),
          note: rowValue(row, 'note'),
        };
      }),
    },
    formationMaterials: collectRows(form, 'formationMaterials', (row) => {
      const title = rowValue(row, 'title');
      if (!title) return null;
      return {
        id: row.dataset.id || '',
        title,
        materialType: rowValue(row, 'materialType'),
        source: rowValue(row, 'source'),
        planningMode: rowValue(row, 'planningMode'),
        scheduledWeeks: scheduledTermWeeks(rowValue(row, 'scheduledWeeks')),
        weeklyFrequency: rowValue(row, 'weeklyFrequency'),
        cadenceLabel: rowValue(row, 'weeklyFrequency'),
        minutes: rowValue(row, 'minutes'),
        termId: rowValue(row, 'termId') || currentTermId,
        color: rowValue(row, 'color'),
      };
    }),
    familyPlanning: {
      fastingPreference: get('familyPlanning.fastingPreference') || 'guidance',
      weekStart: get('familyPlanning.weekStart'),
      events: collectRows(form, 'familyEvents', (row) => {
        const title = rowValue(row, 'title');
        if (!title || !rowValue(row, 'date')) return null;
        return {
          id: row.dataset.id || '',
          title,
          eventType: rowValue(row, 'eventType'),
          date: rowValue(row, 'date'),
          startTime: rowValue(row, 'startTime'),
          recurrence: rowValue(row, 'recurrence') || 'none',
          location: rowValue(row, 'location'),
          notes: rowValue(row, 'notes'),
        };
      }),
      meals: collectRows(form, 'meals', (row) => ({
        id: row.dataset.id || '',
        date: rowValue(row, 'date'),
        breakfast: rowValue(row, 'breakfast'),
        lunch: rowValue(row, 'lunch'),
        dinner: rowValue(row, 'dinner'),
      })).filter((meal) => meal.date),
      recipes: collectRows(form, 'recipes', (row) => {
        const title = rowValue(row, 'title');
        if (!title) return null;
        return {
          id: row.dataset.id || '',
          title,
          fastingType: rowValue(row, 'fastingType'),
          category: rowValue(row, 'category'),
          sourceUrl: rowValue(row, 'sourceUrl'),
          ingredients: rowValue(row, 'ingredients'),
          instructions: rowValue(row, 'instructions'),
        };
      }),
      groceryItems: collectRows(form, 'groceryItems', (row) => {
        const name = rowValue(row, 'name');
        if (!name) return null;
        return {
          id: row.dataset.id || '',
          name,
          quantity: rowValue(row, 'quantity'),
          category: rowValue(row, 'category'),
          checked: Boolean(row.querySelector('[name="checked"]')?.checked),
          pantry: Boolean(row.querySelector('[name="pantry"]')?.checked),
        };
      }),
    },
    coOp: {
      enabled: false,
      status: 'coming-soon',
    },
  };
}
function currentSetupChildren(form) {
  return collectRows(form, 'children', (row, index) => ({
    id: row.dataset.id || `new-child-${index}`,
    name: rowValue(row, 'firstName') || `Child ${index + 1}`,
    gradeLabel: rowValue(row, 'gradeLabel'),
    formLabel: rowValue(row, 'formLabel'),
  }));
}
function familyPlanningPayloadFromForm(form) {
  const get = (name) => learnNamedField(form, name)?.value?.trim() || '';
  return {
    household: {
      motherName: get('household.motherName'),
      motherNameDay: get('household.motherNameDay'),
      fatherName: get('household.fatherName'),
      fatherNameDay: get('household.fatherNameDay'),
      parishPatronalFeastName: get('household.parishPatronalFeastName'),
      parishPatronalFeastDate: get('household.parishPatronalFeastDate'),
    },
    childNameDays: [...form.querySelectorAll('[data-family-child-id]')].map((row) => ({
      childId: row.dataset.familyChildId || '',
      nameDay: row.querySelector('[name="childNameDay"]')?.value || '',
    })),
    familyPlanning: {
      fastingPreference: get('familyPlanning.fastingPreference') || 'guidance',
      weekStart: get('familyPlanning.weekStart'),
      events: collectRows(form, 'familyEvents', (row) => {
        const title = rowValue(row, 'title');
        if (!title || !rowValue(row, 'date')) return null;
        return {
          id: row.dataset.id || '',
          title,
          eventType: rowValue(row, 'eventType'),
          date: rowValue(row, 'date'),
          startTime: rowValue(row, 'startTime'),
          recurrence: rowValue(row, 'recurrence') || 'none',
          location: rowValue(row, 'location'),
          notes: rowValue(row, 'notes'),
        };
      }),
      meals: collectRows(form, 'meals', (row) => ({
        id: row.dataset.id || '',
        date: rowValue(row, 'date'),
        breakfast: rowValue(row, 'breakfast'),
        lunch: rowValue(row, 'lunch'),
        dinner: rowValue(row, 'dinner'),
      })).filter((meal) => meal.date),
      recipes: collectRows(form, 'recipes', (row) => {
        const title = rowValue(row, 'title');
        return title
          ? {
              id: row.dataset.id || '',
              title,
              fastingType: rowValue(row, 'fastingType'),
              category: rowValue(row, 'category'),
              sourceUrl: rowValue(row, 'sourceUrl'),
              ingredients: rowValue(row, 'ingredients'),
              instructions: rowValue(row, 'instructions'),
            }
          : null;
      }),
      groceryItems: collectRows(form, 'groceryItems', (row) => {
        const name = rowValue(row, 'name');
        return name
          ? {
              id: row.dataset.id || '',
              name,
              quantity: rowValue(row, 'quantity'),
              category: rowValue(row, 'category'),
              checked: Boolean(row.querySelector('[name="checked"]')?.checked),
              pantry: Boolean(row.querySelector('[name="pantry"]')?.checked),
            }
          : null;
      }),
      chores: collectRows(form, 'chores', (row) => {
        const title = rowValue(row, 'title');
        const assignee = rowValue(row, 'assignee');
        return title || assignee
          ? {
              id: row.dataset.id || '',
              title,
              assignee,
              cadence: rowValue(row, 'cadence') || 'daily',
              day: rowValue(row, 'day'),
              dayOfMonth: rowValue(row, 'dayOfMonth'),
              quarterMonth: rowValue(row, 'quarterMonth'),
              assignedDate: rowValue(row, 'assignedDate'),
              timeOfDay: rowValue(row, 'timeOfDay'),
              notes: rowValue(row, 'notes'),
              completed: Boolean(row.querySelector('[name="completed"]')?.checked),
            }
          : null;
      }),
    },
  };
}
function currentSetupTerms(form) {
  return collectRows(form, 'terms', (row, index) => ({
    id: rowValue(row, 'id') || row.dataset.id || `term_${index + 1}`,
    label: rowValue(row, 'label') || `Term ${index + 1}`,
  }));
}
function setupChildCount(form) {
  return form.querySelectorAll('[data-setup-row="children"]').length;
}
function syncSetupChildLimit(form) {
  const button = form.querySelector('[data-setup-add-row="children"]');
  if (!button) return;
  const freeLimitReached = !isLearnFamilyPlan() && setupChildCount(form) >= 2;
  button.dataset.upgradeRequired = freeLimitReached ? 'true' : 'false';
  button.textContent = freeLimitReached ? 'Upgrade to add another child' : 'Add Child';
  button.style.background = freeLimitReached ? 'var(--navy)' : 'var(--paper2)';
  button.style.color = freeLimitReached ? '#fff' : 'var(--ink)';
  button.style.borderColor = freeLimitReached ? 'var(--gold)' : 'var(--line)';
}
function setupBlankRow(type, form, preset = {}) {
  const terms = currentSetupTerms(form);
  const currentTermId = learnNamedField(form, 'schoolYear.currentTermId')?.value || terms[0]?.id || 'term_1';
  const groupingMode = learnNamedField(form, 'preferences.groupingMode')?.value === 'grades' ? 'grades' : 'forms';
  const familyPlanningFromForm = () => ({
    household: {
      motherName: learnNamedField(form, 'household.motherName')?.value || '',
      fatherName: learnNamedField(form, 'household.fatherName')?.value || '',
    },
    children: [...form.querySelectorAll('[data-family-child-id]')]
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
function setSetupSectionOpen(form, group, panelId, shouldOpen) {
  form.querySelectorAll(`[data-setup-section-group="${group}"][data-setup-section-toggle]`).forEach((button) => {
    const isTarget = button.dataset.setupSectionPanel === panelId;
    const open = shouldOpen && isTarget;
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
    button.classList.toggle('is-open', open);
    const action = button.querySelector('em');
    if (action) action.textContent = open ? 'Collapse' : 'Open';
  });
  form.querySelectorAll(`[data-setup-section-group="${group}"].learn-setup-subsection`).forEach((section) => {
    const open = shouldOpen && section.dataset.setupSectionPanel === panelId;
    section.hidden = !open;
  });
}
function syncSetupTermSelects(form) {
  const terms = currentSetupTerms(form);
  if (!terms.length) return;
  form.querySelectorAll('select[name="schoolYear.currentTermId"], select[name="termId"]').forEach((select) => {
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
function wireSetupPage() {
  const form = root.querySelector('[data-setup-form]');
  if (!form) return;
  const status = form.querySelector('[data-setup-status]');
  const submit = form.querySelector("button[type='submit']");
  let setupAutosaveTimer = 0;
  let setupSaveInFlight = false;
  let setupSaveQueued = false;
  let lastSavedSetupHash = '';
  const saveSetupNow = async ({ manual = false } = {}) => {
    if (!form.isConnected) return;
    const payload = setupPayloadFromForm(form);
    const setupHash = JSON.stringify(payload);
    if (!manual && setupHash === lastSavedSetupHash) return;
    if (setupSaveInFlight) {
      setupSaveQueued = true;
      return;
    }
    window.clearTimeout(setupAutosaveTimer);
    setupSaveInFlight = true;
    if (manual && submit) submit.disabled = true;
    if (status) {
      status.style.color = 'var(--muted)';
      status.textContent = manual ? 'Saving setup...' : 'Autosaving setup...';
    }
    try {
      const saved = await apiPost('/api/learn/setup', payload);
      const calendar = payload.preferences.calendarType || 'julian';
      const savedAt = saved.savedAt ? ` at ${new Date(saved.savedAt).toLocaleTimeString()}` : '';
      localStorage.setItem('agapay.learn.calendar', calendar);
      lastSavedSetupHash = setupHash;
      if (status) {
        status.style.color = 'var(--gold)';
        status.textContent = `${manual ? 'Setup saved' : 'Autosaved'}${savedAt}.`;
      }
    } catch (error) {
      if (status) {
        status.textContent = error.message;
        status.style.color = 'var(--burgundy)';
      }
    } finally {
      setupSaveInFlight = false;
      if (manual && submit?.isConnected) submit.disabled = false;
      if (setupSaveQueued) {
        setupSaveQueued = false;
        setupAutosaveTimer = window.setTimeout(() => saveSetupNow({ manual: false }), 350);
      }
    }
  };
  const scheduleSetupAutosave = (delay = 900) => {
    if (!form.isConnected) return;
    window.clearTimeout(setupAutosaveTimer);
    setupAutosaveTimer = window.setTimeout(() => saveSetupNow({ manual: false }), delay);
  };
  let draggedResourceRow = null;
  const clearResourceDropTargets = () => {
    form
      .querySelectorAll(
        '.learn-setup-row-subject.is-resource-drop-target, .learn-setup-row-enrichment.is-resource-drop-target'
      )
      .forEach((row) => row.classList.remove('is-resource-drop-target'));
  };
  form.addEventListener('input', (event) => {
    const dayChoice = event.target.closest('[data-day-choice]');
    if (dayChoice) {
      const picker = dayChoice.closest('.learn-day-picker');
      const selected = [...picker.querySelectorAll('[data-day-choice]:checked')].map((input) => input.value);
      picker.querySelector('[name="scheduledDays"]').value = selected.join(',');
      picker.querySelector('[data-day-summary]').textContent = selected.length
        ? setupWeekdays
            .filter((day) => selected.includes(day.value))
            .map((day) => day.label)
            .join(' · ')
        : 'Choose days';
      return;
    }
    const termWeekChoice = event.target.closest('[data-term-week-choice]');
    if (termWeekChoice) {
      const picker = termWeekChoice.closest('.learn-term-week-picker');
      const selected = [...picker.querySelectorAll('[data-term-week-choice]:checked')].map((input) =>
        Number(input.value)
      );
      const hiddenField = picker.querySelector("input[type='hidden']");
      if (hiddenField) hiddenField.value = selected.join(',');
      picker.querySelector('[data-term-week-summary]').textContent = selected.length
        ? termWeekSummary(selected)
        : 'Choose weeks';
      return;
    }
    const planningFormChoice = event.target.closest('[data-planning-form-choice]');
    if (planningFormChoice) {
      const picker = planningFormChoice.closest('.learn-planning-mode-picker');
      const selected = [...picker.querySelectorAll('[data-planning-form-choice]:checked')].map((input) => input.value);
      const planningMode = selected.length ? 'forms' : 'family';
      const planningModeField =
        picker.querySelector('[data-planning-mode-field]') || picker.querySelector('[name="planningMode"]');
      const formLabelField =
        picker.querySelector('[data-form-label-field]') || picker.querySelector('[name="formLabel"]');
      const formLabelsField =
        picker.querySelector('[data-form-labels-field]') || picker.querySelector('[name="formLabels"]');
      const gradeField =
        picker.querySelector('[data-grade-label-field]') || picker.querySelector('[name="gradeLabel"]');
      if (planningModeField) planningModeField.value = planningMode;
      if (formLabelField) formLabelField.value = selected[0] || '';
      if (formLabelsField) formLabelsField.value = selected.join(',');
      if (gradeField) gradeField.value = selected[0] || '';
      const label = picker.querySelector('[data-planning-mode-summary]');
      if (label)
        label.textContent = selected.length
          ? `${picker.dataset.planningGroupLabel || 'Forms-Based'}: ${selected.join(', ')}`
          : 'Family-Based';
      return;
    }
    const childMultiChoice = event.target.closest('[data-child-multi-choice]');
    if (childMultiChoice) {
      const picker = childMultiChoice.closest('.learn-child-multi-picker');
      const selected = [...picker.querySelectorAll('[data-child-multi-choice]:checked')].map((input) => input.value);
      const childIdsField = picker.querySelector('[data-child-ids-field]') || picker.querySelector('[name="childIds"]');
      if (childIdsField) childIdsField.value = selected.join(',');
      const names = [...picker.querySelectorAll('[data-child-multi-choice]:checked')].map(
        (input) => input.closest('label')?.textContent?.trim() || input.value
      );
      picker.querySelector('[data-child-multi-summary]').textContent = selected.length
        ? names.join(', ')
        : 'Use Form Assignment';
      return;
    }
    const tileInput = event.target.closest('[data-setup-section-title-input], [data-setup-section-detail-input]');
    if (tileInput) {
      const group = tileInput.dataset.setupSectionGroup || '';
      const panelId = tileInput.dataset.setupSectionPanel || '';
      const section = tileInput.closest('.learn-setup-subsection');
      const title = section?.querySelector('[data-setup-section-title-input]')?.value?.trim() || '';
      const detail = section?.querySelector('[data-setup-section-detail-input]')?.value?.trim() || '';
      const card = form.querySelector(
        `[data-setup-section-group="${group}"][data-setup-section-panel="${panelId}"][data-setup-section-toggle]`
      );
      const cardTitle = card?.querySelector('[data-setup-section-card-title]');
      const cardDetail = card?.querySelector('[data-setup-section-card-detail]');
      const panelTitle = section?.querySelector('[data-setup-section-panel-title]');
      const panelDetail = section?.querySelector('[data-setup-section-panel-detail]');
      if (cardTitle && title) cardTitle.textContent = title;
      if (cardDetail && detail) cardDetail.textContent = detail;
      if (panelTitle && title) panelTitle.textContent = title;
      if (panelDetail && detail) panelDetail.textContent = detail;
      return;
    }
    const colorField = event.target.closest('.learn-color-field');
    if (!colorField) return;
    const colorInput = colorField.querySelector('input[type="color"]');
    const textInput = colorField.querySelector('input[type="text"]');
    const preview = colorField.querySelector('[data-color-preview]');
    if (event.target === colorInput && textInput) textInput.value = colorInput.value;
    if (event.target === textInput && /^#[0-9a-f]{6}$/i.test(textInput.value) && colorInput)
      colorInput.value = textInput.value;
    const value = /^#[0-9a-f]{6}$/i.test(textInput?.value || '') ? textInput.value : colorInput?.value;
    if (preview && value) preview.style.background = value;
    if (event.target.closest('[data-setup-row="terms"]')) syncSetupTermSelects(form);
    if (event.target.closest('[data-setup-row="children"]')) syncSetupChildLimit(form);
  });
  form.addEventListener('input', () => scheduleSetupAutosave(900));
  form.addEventListener('change', () => scheduleSetupAutosave(250));
  form.addEventListener('focusout', () => scheduleSetupAutosave(150));
  form.addEventListener('click', (event) => {
    const setupPanelToggle = event.target.closest('[data-setup-panel-toggle]');
    if (setupPanelToggle) {
      const panel2 = setupPanelToggle.closest('[data-setup-collapse-panel]');
      const body = panel2?.querySelector('.learn-setup-collapse-body');
      if (!panel2 || !body) return;
      const expanded = setupPanelToggle.getAttribute('aria-expanded') === 'true';
      const nextExpanded = !expanded;
      setupPanelToggle.setAttribute('aria-expanded', nextExpanded ? 'true' : 'false');
      setupPanelToggle.textContent = nextExpanded ? 'Minimize' : 'Expand';
      body.hidden = !nextExpanded;
      panel2.classList.toggle('is-collapsed', !nextExpanded);
      try {
        localStorage.setItem(
          `agapay.learn.setupPanel.${setupPanelToggle.dataset.setupPanelToggle}`,
          nextExpanded ? 'expanded' : 'collapsed'
        );
      } catch {}
      return;
    }
    const addResource = event.target.closest('[data-add-resource]');
    if (addResource) {
      const list = addResource.closest('[data-resource-list]');
      if (!list) return;
      const existingRows = list.querySelectorAll('[data-resource-row]');
      const index = existingRows.length;
      const subjectRow = addResource.closest('[data-setup-row="subjects"]');
      const groupingMode = document.querySelector('[name="preferences.groupingMode"]')?.value || 'forms';
      const children = setupChildRowsFromForm(addResource.closest('[data-setup-form]'));
      const firstResource = rowResources(subjectRow || document.createElement('div'))[0] || {};
      const laneScopedAdd = addResource.hasAttribute('data-resource-form-label');
      const formLabel = addResource.dataset.resourceFormLabel || '';
      const newRowHtml = setupResourceRow(
        {
          planningMode: laneScopedAdd ? (formLabel ? 'forms' : 'family') : firstResource.planningMode || 'forms',
          formLabel: laneScopedAdd ? formLabel : firstResource.formLabel || '',
          formLabels: laneScopedAdd ? (formLabel ? [formLabel] : []) : firstResource.formLabels || [],
          childIds: firstResource.childIds || [],
        },
        index,
        children,
        groupingMode
      );
      addResource.insertAdjacentHTML('beforebegin', newRowHtml);
      const newRow = list.querySelector(`[data-resource-row="${index}"]`);
      refreshResourceLaneCounts(list);
      reindexResourceList(list);
      const newRowAfterReindex = list.querySelector(
        `[data-resource-row="${list.querySelectorAll('[data-resource-row]').length - 1}"]`
      );
      const modal = (newRowAfterReindex || newRow)?.querySelector('[data-resource-modal]');
      if (modal) {
        snapshotResourceModal(modal);
        modal.hidden = false;
        modal.style.display = 'flex';
        modal.querySelector('input')?.focus();
      }
      return;
    }
    const editResource = event.target.closest('[data-edit-resource]');
    if (editResource) {
      const modal = editResource.closest('[data-resource-row]')?.querySelector('[data-resource-modal]');
      if (!modal) return;
      snapshotResourceModal(modal);
      modal.hidden = false;
      modal.style.display = 'flex';
      modal.querySelector('input')?.focus();
      return;
    }
    const closeResourceModal = event.target.closest('[data-resource-modal-close], [data-resource-modal-save]');
    if (closeResourceModal) {
      const savingResource = closeResourceModal.hasAttribute('data-resource-modal-save');
      const modal = closeResourceModal.closest('[data-resource-modal]');
      if (!savingResource) restoreResourceModal(modal);
      const resourceRow = closeResourceModal.closest('[data-resource-row]');
      refreshResourceSummary(resourceRow);
      if (savingResource) moveResourceRowToLane(resourceRow);
      if (modal) {
        modal.hidden = true;
        modal.style.display = 'none';
      }
      return;
    }
    const removeResource = event.target.closest('[data-remove-resource]');
    if (removeResource) {
      const list = removeResource.closest('[data-resource-list]');
      const removedRow = removeResource.closest('[data-resource-row]');
      removedRow?.remove();
      reindexResourceList(list);
      return;
    }
    const weekPreset = event.target.closest('[data-term-weeks-all], [data-term-weeks-odd], [data-term-weeks-even]');
    if (weekPreset) {
      const picker = weekPreset.closest('.learn-term-week-picker');
      const mode = weekPreset.hasAttribute('data-term-weeks-odd')
        ? 'odd'
        : weekPreset.hasAttribute('data-term-weeks-even')
          ? 'even'
          : 'all';
      picker.querySelectorAll('[data-term-week-choice]').forEach((input) => {
        const week = Number(input.value);
        input.checked = mode === 'all' || (mode === 'odd' ? week % 2 === 1 : week % 2 === 0);
      });
      const selected = [...picker.querySelectorAll('[data-term-week-choice]:checked')].map((input) =>
        Number(input.value)
      );
      const hiddenField = picker.querySelector("input[type='hidden']");
      if (hiddenField) hiddenField.value = selected.join(',');
      picker.querySelector('[data-term-week-summary]').textContent = termWeekSummary(selected);
      return;
    }
    const sectionToggle = event.target.closest('[data-setup-section-toggle]');
    if (sectionToggle) {
      const group = sectionToggle.dataset.setupSectionGroup || '';
      const panelId = sectionToggle.dataset.setupSectionPanel || '';
      const wasOpen = sectionToggle.getAttribute('aria-expanded') === 'true';
      setSetupSectionOpen(form, group, panelId, !wasOpen);
      const panelElement = document.getElementById(sectionToggle.getAttribute('aria-controls') || '');
      if (!wasOpen && panelElement) panelElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const sectionClose = event.target.closest('[data-setup-section-close]');
    if (sectionClose) {
      setSetupSectionOpen(
        form,
        sectionClose.dataset.setupSectionGroup || '',
        sectionClose.dataset.setupSectionPanel || '',
        false
      );
      return;
    }
    const closeButton = event.target.closest('[data-close-term]');
    if (closeButton) {
      const termId = closeButton.dataset.closeTerm || closeButton.closest('[data-setup-row]')?.dataset.id || '';
      const status2 = form.querySelector('[data-setup-status]');
      const originalText = closeButton.textContent;
      closeButton.disabled = true;
      closeButton.textContent = 'Closing...';
      if (status2) {
        status2.style.color = 'var(--muted)';
        status2.textContent = 'Saving setup before closing term...';
      }
      (async () => {
        try {
          const payload = setupPayloadFromForm(form);
          const calendar = payload.preferences.calendarType || 'julian';
          await apiPost('/api/learn/setup', payload);
          const closed = await apiPost(`/api/learn/terms/${encodeURIComponent(termId)}/close`, {});
          localStorage.setItem('agapay.learn.calendar', calendar);
          if (status2) {
            status2.style.color = 'var(--gold)';
            status2.textContent = `${closed.term?.label || 'Term'} closed with ${closed.academicRecords?.length || 0} academic records.`;
          }
          closeButton.textContent = 'Closed';
        } catch (error) {
          if (status2) {
            status2.style.color = 'var(--burgundy)';
            status2.textContent = error.message;
          }
          closeButton.disabled = false;
          closeButton.textContent = originalText;
        }
      })();
      return;
    }
    const addChildrenButton = event.target.closest('[data-setup-add-children]');
    if (addChildrenButton) {
      const list = form.querySelector('[data-setup-list="children"]');
      const count = Math.max(1, Math.min(5, Number(addChildrenButton.dataset.setupAddChildren) || 3));
      if (list) {
        for (let index = 0; index < count; index += 1)
          list.insertAdjacentHTML('beforeend', setupBlankRow('children', form, {}));
        syncSetupChildLimit(form);
        scheduleSetupAutosave(250);
      }
      return;
    }
    const removeButton = event.target.closest('[data-setup-remove-row]');
    if (removeButton) {
      const row = removeButton.closest('[data-setup-row]');
      const list = row?.parentElement;
      const removedType = row?.dataset.setupRow;
      const matchingSiblingCount = row
        ? [...list.querySelectorAll('[data-setup-row]')].filter((sibling) => sibling.dataset.setupRow === removedType)
            .length
        : 0;
      const mustKeepOne = removedType === 'children';
      if (row && list && (!mustKeepOne || matchingSiblingCount > 1)) {
        row.remove();
        if (removedType === 'terms') syncSetupTermSelects(form);
        if (removedType === 'children') syncSetupChildLimit(form);
      }
      return;
    }
    const addButton = event.target.closest('[data-setup-add-row]');
    if (addButton) {
      const type = addButton.dataset.setupAddRow;
      if (type === 'children' && addButton.dataset.upgradeRequired === 'true') {
        showLearnDialog(
          'Upgrade to Add Another Child',
          'The free AGAPAY Learn plan includes up to two children. Upgrade to the Family plan to add unlimited children, child sheets, term packs, and larger-household planning.',
          [
            { label: 'Free plan', value: 'Up to 2 children' },
            { label: 'Family plan', value: 'Unlimited children' },
          ],
          { upgrade: true }
        );
        return;
      }
      const preset = {};
      if (addButton.dataset.setupAddSubjectType) preset.subjectType = addButton.dataset.setupAddSubjectType;
      if (addButton.dataset.setupAddBlockType) preset.blockType = addButton.dataset.setupAddBlockType;
      if (addButton.dataset.setupAddDate) preset.date = addButton.dataset.setupAddDate;
      const tileMinutes =
        addButton
          .closest('.learn-setup-subsection')
          ?.querySelector('[data-setup-section-minutes-input]')
          ?.value?.trim() || '';
      if (tileMinutes && type === 'subjects') preset.minutes = tileMinutes;
      if (tileMinutes && type === 'formationEnrichment') preset.minutesPlanned = tileMinutes;
      const list = addButton.dataset.setupAddTarget
        ? document.getElementById(addButton.dataset.setupAddTarget)
        : form.querySelector(`[data-setup-list="${type}"]`);
      if (list) {
        list.insertAdjacentHTML('beforeend', setupBlankRow(type, form, preset));
        if (type === 'terms') syncSetupTermSelects(form);
        if (type === 'children') syncSetupChildLimit(form);
      }
    }
  });
  form.addEventListener('click', (event) => {
    const autosaveTrigger = event.target.closest(
      '[data-add-resource], [data-edit-resource], [data-resource-modal-close], [data-resource-modal-save], [data-remove-resource], [data-term-weeks-all], [data-term-weeks-odd], [data-term-weeks-even], [data-setup-remove-row], [data-setup-add-row], [data-setup-add-children]'
    );
    if (!autosaveTrigger || event.target.closest('[data-close-term]')) return;
    scheduleSetupAutosave(250);
  });
  form.addEventListener('dragstart', (event) => {
    const resourceRow = event.target.closest('[data-resource-row]');
    if (!resourceRow || event.target.closest('button, a, input, select, textarea, summary, details')) return;
    draggedResourceRow = resourceRow;
    resourceRow.classList.add('is-dragging');
    event.dataTransfer?.setData('text/plain', resourceRow.dataset.resourceRow || '');
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  });
  form.addEventListener('dragover', (event) => {
    if (!draggedResourceRow) return;
    const subjectRow = event.target.closest('[data-setup-row="subjects"], [data-setup-row="formationEnrichment"]');
    if (!subjectRow || subjectRow.contains(draggedResourceRow)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    clearResourceDropTargets();
    subjectRow.classList.add('is-resource-drop-target');
  });
  form.addEventListener('dragleave', (event) => {
    const subjectRow = event.target.closest('[data-setup-row="subjects"], [data-setup-row="formationEnrichment"]');
    if (!subjectRow || subjectRow.contains(event.relatedTarget)) return;
    subjectRow.classList.remove('is-resource-drop-target');
  });
  form.addEventListener('drop', (event) => {
    if (!draggedResourceRow) return;
    const subjectRow = event.target.closest('[data-setup-row="subjects"], [data-setup-row="formationEnrichment"]');
    clearResourceDropTargets();
    if (!subjectRow || subjectRow.contains(draggedResourceRow)) return;
    event.preventDefault();
    if (moveResourceRowToSubject(draggedResourceRow, subjectRow)) scheduleSetupAutosave(150);
  });
  form.addEventListener('dragend', () => {
    draggedResourceRow?.classList.remove('is-dragging');
    draggedResourceRow = null;
    clearResourceDropTargets();
  });
  syncSetupChildLimit(form);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    await saveSetupNow({ manual: true });
  });
}
function truthyLearn13(value) {
  return Boolean(value);
}
function wireWeeklyAssignmentBoard(vm) {
  const board = root.querySelector('[data-week-assignment-board]');
  if (!board) return;
  const storageKey = weekAssignmentStorageKey(vm, board.dataset.weekKey || 'week');
  const formStorageKey = `${storageKey}.form`;
  const familyViewStorageKey = 'agapay.learn.weekPlanner.familyView';
  const zones = [...board.querySelectorAll('[data-week-assignment-zone]')];
  const formButtons = [...board.querySelectorAll('[data-week-form-filter]')];
  const availableForms = formButtons.map((button) => button.dataset.weekFormFilter).filter(truthyLearn13);
  const familyLane = board.querySelector('[data-family-lane]');
  const familyLaneZone = board.querySelector('[data-week-assignment-zone="pool-family"]');
  const familyToggle = board.querySelector('[data-family-view-toggle]');
  const familyToggleState = board.querySelector('[data-family-view-state]');
  const autoFillButton = board.querySelector('[data-week-auto-fill]');
  const resetFormButton = board.querySelector('[data-week-reset-form]');
  const cardFormLabels = (card) =>
    (card.dataset.weekFormLabels || '')
      .split('|')
      .map((label) => label.trim())
      .filter(truthyLearn13);
  const isFamilyCard = (card) => {
    const labels = cardFormLabels(card);
    return !labels.length || labels.includes('__family') || labels.includes('Household Form');
  };
  const familyViewFromStorage = () => {
    try {
      const saved = localStorage.getItem(familyViewStorageKey);
      return saved === 'mixed' ? 'mixed' : 'separated';
    } catch {
      return 'separated';
    }
  };
  let familyViewMode = familyViewFromStorage();
  const cardVisibleForForm = (card, formLabel) => {
    const labels = cardFormLabels(card);
    if (!formLabel || !availableForms.length) return true;
    if (formLabel === '__family') return isFamilyCard(card);
    if (isFamilyCard(card)) {
      return familyViewMode === 'mixed';
    }
    return labels.includes(formLabel);
  };
  const applyFamilyViewMode = () => {
    if (!familyLane) return;
    const separated = familyViewMode === 'separated' && availableForms.length > 0 && activeFormLabel !== '__family';
    familyLane.hidden = !separated;
    if (familyToggle) familyToggle.checked = familyViewMode === 'mixed';
    if (familyToggleState)
      familyToggleState.textContent = familyViewMode === 'mixed' ? 'with each Form' : 'in its own lane';
    if (familyLaneZone) {
      const mainPool = board.querySelector('[data-week-assignment-zone="pool"]');
      board.querySelectorAll('[data-week-assignment-card]:not([data-auto-original])').forEach((card) => {
        if (!isFamilyCard(card)) return;
        const inDayZone = card.closest('[data-week-assignment-zone]')?.dataset.weekAssignmentZone;
        const isPlacedInDay = inDayZone && inDayZone !== 'pool' && inDayZone !== 'pool-family';
        if (isPlacedInDay) return;
        const targetZone = separated ? familyLaneZone : mainPool;
        if (targetZone && card.parentElement !== targetZone) targetZone.appendChild(card);
      });
    }
  };
  const activeFormFromStorage = () => {
    try {
      const saved = localStorage.getItem(formStorageKey) || '';
      return availableForms.includes(saved) ? saved : availableForms[0] || '';
    } catch {
      return availableForms[0] || '';
    }
  };
  let activeFormLabel = activeFormFromStorage();
  const applyFormFilter = (formLabel = activeFormLabel) => {
    activeFormLabel = formLabel || '';
    if (activeFormLabel) board.dataset.activeWeekForm = activeFormLabel;
    else delete board.dataset.activeWeekForm;
    formButtons.forEach((button) => {
      button.setAttribute('aria-pressed', button.dataset.weekFormFilter === activeFormLabel ? 'true' : 'false');
    });
    const poolHeading = board.querySelector('[data-pool-heading]');
    if (poolHeading) {
      poolHeading.textContent =
        activeFormLabel === '__family'
          ? 'Family — Everyone subjects'
          : activeFormLabel && availableForms.length
            ? `${activeFormLabel} subjects`
            : 'Available subjects';
    }
    board.querySelectorAll('[data-week-assignment-card]').forEach((card) => {
      const visible = cardVisibleForForm(card, activeFormLabel);
      if (card.dataset.autoOriginal) {
        card.style.display = 'none';
      } else if (card.dataset.autoPlaced) {
        card.hidden = !visible;
      } else {
        card.hidden = !visible;
        card.style.display = '';
      }
    });
    applyFamilyViewMode();
    const groupLabel = activeFormLabel === '__family' ? 'Family' : activeFormLabel || 'week';
    if (autoFillButton) autoFillButton.textContent = `Fill ${groupLabel} from Setup`;
    if (resetFormButton) resetFormButton.textContent = `Reset ${groupLabel}`;
    const visiblePoolCards = [
      ...board.querySelectorAll('[data-week-assignment-zone="pool"] > [data-week-assignment-card]'),
    ].filter((card) => !card.hidden && card.style.display !== 'none');
    const poolCount = board.querySelector('[data-pool-count]');
    if (poolCount) poolCount.textContent = `${visiblePoolCards.length} unplaced`;
  };
  const readState = () => {
    try {
      return parseLearnWeekAssignments(localStorage.getItem(storageKey)).state;
    } catch {
      return {};
    }
  };
  const writeState = () => {
    try {
      if (!parseLearnWeekAssignments(localStorage.getItem(storageKey)).valid) {
        showLearnDialog(
          'Could Not Save This Week',
          'Your saved weekly plan contains unreadable data and has been kept intact. Please contact support before changing this week.',
          []
        );
        return false;
      }
    } catch {
      showLearnDialog(
        'Could Not Save This Week',
        'Your browser could not read the saved plan. Keep this page open and try again.',
        []
      );
      return false;
    }
    const state = {};
    Object.setPrototypeOf(state, null);
    board.querySelectorAll('[data-week-assignment-card]').forEach((card) => {
      const zone = card.closest('[data-week-assignment-zone]');
      const zoneKey = zone?.dataset.weekAssignmentZone || 'pool';
      const itemId = card.dataset.itemId;
      const sourceId = card.dataset.sourceItemId || itemId;
      const note = card.querySelector('[data-week-assignment-note]')?.value || '';
      if (card.dataset.autoOriginal) {
        state[itemId] = { zone: 'auto', autoPlaced: true };
      } else if (card.dataset.autoPlaced) {
        state[`${sourceId}__auto__${zoneKey}`] = { zone: zoneKey, note, autoPlaced: true, sourceId };
        if (!state[sourceId]) state[sourceId] = { zone: 'auto', autoPlaced: true };
      } else {
        state[itemId] = { zone: zoneKey, note };
      }
    });
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      showLearnDialog(
        'Could Not Save This Week',
        'Your browser could not save the plan. Keep this page open and try again.',
        []
      );
      return false;
    }
    scheduleDesignedWeekCalendarSync();
    return true;
  };
  const wireCard = (card) => {
    card.addEventListener('dragstart', (event) => {
      if (!cardVisibleForForm(card, activeFormLabel)) {
        event.preventDefault();
        return;
      }
      event.dataTransfer?.setData('text/plain', card.dataset.itemId || '');
      card.classList.add('is-dragging');
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('is-dragging');
      writeState();
    });
    card.querySelector('[data-week-assignment-note]')?.addEventListener('input', writeState);
  };
  const dayZones = [
    ...board.querySelectorAll(
      "[data-week-assignment-zone]:not([data-week-assignment-zone='pool']):not([data-week-assignment-zone='pool-family'])"
    ),
  ];
  const autoPlaceCard = (card, state = readState()) => {
    const id = card.dataset.sourceItemId || card.dataset.itemId;
    const statuses = (card.dataset.statuses || '').split(',');
    const activeDayIndexes = statuses
      .map((status, index) => (status === 'planned' ? index : -1))
      .filter((index) => index >= 0);
    if (!id || !activeDayIndexes.length) return 0;
    card.style.display = 'none';
    card.dataset.autoOriginal = 'true';
    let placed = 0;
    activeDayIndexes.forEach((dayIndex) => {
      const zone = dayZones[dayIndex];
      if (!zone || zone.querySelector(`[data-source-item-id="${CSS.escape(id)}"]`)) return;
      const autoKey = `${id}__auto__${zone.dataset.weekAssignmentZone}`;
      const savedClone = state[autoKey];
      const clone = card.cloneNode(true);
      clone.dataset.itemId = autoKey;
      clone.dataset.sourceItemId = id;
      clone.dataset.autoPlaced = 'true';
      delete clone.dataset.autoOriginal;
      clone.style.display = '';
      const cloneNote = clone.querySelector('[data-week-assignment-note]');
      if (cloneNote) {
        cloneNote.value = savedClone?.note || '';
        cloneNote.placeholder = 'Specify chapters, pages, lessons, or notes for this day';
      }
      const targetZoneKey =
        savedClone?.zone && savedClone.zone !== zone.dataset.weekAssignmentZone
          ? savedClone.zone
          : zone.dataset.weekAssignmentZone;
      const targetZone = board.querySelector(`[data-week-assignment-zone="${CSS.escape(targetZoneKey)}"]`) || zone;
      targetZone.appendChild(clone);
      wireCard(clone);
      placed += 1;
    });
    return placed;
  };
  const restore = () => {
    const state = readState();
    board.querySelectorAll('[data-week-assignment-card]').forEach((card) => {
      const id = card.dataset.itemId;
      const saved = state[id];
      if (saved && saved.zone && saved.zone !== 'auto') {
        const target = board.querySelector(`[data-week-assignment-zone="${CSS.escape(saved.zone)}"]`);
        if (target) target.appendChild(card);
        const note = card.querySelector('[data-week-assignment-note]');
        if (note && saved.note) note.value = saved.note;
        return;
      }
      const statuses = (card.dataset.statuses || '').split(',');
      const isAutoEligible = statuses.includes('planned') && availableForms.length === 0;
      if (isAutoEligible) autoPlaceCard(card, state);
    });
  };
  restore();
  board.querySelectorAll('[data-week-assignment-card]:not([data-auto-placed])').forEach(wireCard);
  function openLearnCardModal(card) {
    if (document.querySelector('.learn-card-modal-backdrop')) return;
    const itemId = card.dataset.itemId || '';
    const title = card.querySelector('strong')?.textContent?.trim() || 'Subject';
    const sub = card.dataset.itemSub || card.querySelector('small')?.textContent?.trim() || '';
    const color = card.dataset.itemColor || card.style.borderLeftColor || 'var(--gold)';
    const note = card.querySelector('[data-week-assignment-note]')?.value || '';
    const gracePri = card.dataset.gracePriority || 'keep';
    const bd = document.createElement('div');
    bd.className = 'learn-card-modal-backdrop';
    bd.innerHTML = `
      <div class="learn-card-modal" style="--modal-color:${sub ? sub.replace(/"/g, "'") : color}">
        <div class="learn-card-modal-header">
          <div class="learn-card-modal-accent" style="background:${color}"></div>
          <div class="learn-card-modal-title-block">
            <div class="learn-card-modal-title">${title.replace(/</g, '&lt;')}</div>
            ${sub ? `<div class="learn-card-modal-subtitle">${sub.replace(/</g, '&lt;')}</div>` : ''}
          </div>
          <button type="button" class="learn-card-modal-close" aria-label="Close">&#x2715;</button>
        </div>
        <div class="learn-card-modal-body">
          <div class="learn-modal-field">
            <label class="learn-modal-label">This week's assignment</label>
            <textarea class="learn-modal-textarea" name="note" placeholder="Chapters, pages, lessons, narration prompt…">${note.replace(/</g, '&lt;')}</textarea>
          </div>
          <div class="learn-modal-row">
            <div class="learn-modal-field">
              <label class="learn-modal-label">Start (page / chapter / lesson)</label>
              <input class="learn-modal-input" type="text" name="startAt" placeholder="e.g. 42">
            </div>
            <div class="learn-modal-field">
              <label class="learn-modal-label">Through</label>
              <input class="learn-modal-input" type="text" name="endAt" placeholder="e.g. 55">
            </div>
          </div>
          <div class="learn-modal-row">
            <div class="learn-modal-field">
              <label class="learn-modal-label">Grace mode</label>
              <select class="learn-modal-select" name="gracePriority">
                <option value="keep"${gracePri === 'keep' ? ' selected' : ''}>Core — always keep</option>
                <option value="reduce first"${gracePri === 'reduce first' ? ' selected' : ''}>Reduce — cut minutes first</option>
                <option value="bump if needed"${gracePri === 'bump if needed' ? ' selected' : ''}>Defer — bump to reserve</option>
                <option value="skip"${gracePri === 'skip' ? ' selected' : ''}>Skip — feast days only</option>
              </select>
            </div>
          </div>
          <div class="learn-modal-field">
            <label class="learn-modal-label">Teacher notes</label>
            <textarea class="learn-modal-textarea" name="teacherNotes" placeholder="Observations, resources, adjustments…"></textarea>
          </div>
        </div>
        <div class="learn-card-modal-footer">
          <button type="button" class="learn-modal-btn-cancel">Cancel</button>
          <button type="button" class="learn-modal-btn-save">Save</button>
        </div>
      </div>
    `;
    document.body.appendChild(bd);
    const closeModal = () => bd.remove();
    bd.querySelector('.learn-card-modal-close').addEventListener('click', closeModal);
    bd.querySelector('.learn-modal-btn-cancel').addEventListener('click', closeModal);
    bd.addEventListener('click', (e) => {
      if (e.target === bd) closeModal();
    });
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', onKey);
      }
    });
    bd.querySelector('.learn-modal-btn-save').addEventListener('click', () => {
      const noteVal = bd.querySelector("[name='note']")?.value || '';
      const graceVal = bd.querySelector("[name='gracePriority']")?.value || gracePri;
      const noteEl = card.querySelector('[data-week-assignment-note]');
      if (noteEl) noteEl.value = noteVal;
      card.dataset.gracePriority = graceVal;
      if (writeState()) closeModal();
    });
  }
  board.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-card-expand]');
    if (!btn) return;
    e.stopPropagation();
    const card = btn.closest('[data-week-assignment-card]');
    if (card) openLearnCardModal(card);
  });
  autoFillButton?.addEventListener('click', () => {
    const state = readState();
    const poolCards = [
      ...board.querySelectorAll(
        '[data-week-assignment-zone="pool"] > [data-week-assignment-card], [data-week-assignment-zone="pool-family"] > [data-week-assignment-card]'
      ),
    ].filter((card) => !card.dataset.autoPlaced && cardVisibleForForm(card, activeFormLabel));
    const placements = poolCards.reduce((total, card) => total + autoPlaceCard(card, state), 0);
    if (!writeState()) return;
    applyFormFilter(activeFormLabel);
    const original = autoFillButton.textContent;
    autoFillButton.textContent = placements ? `Placed ${placements} lessons` : 'Nothing new to place';
    window.setTimeout(() => {
      autoFillButton.textContent = original;
    }, 1600);
  });
  resetFormButton?.addEventListener('click', () => {
    const mainPool = board.querySelector('[data-week-assignment-zone="pool"]');
    if (!mainPool) return;
    const matchesActiveGroup = (card) => cardVisibleForForm(card, activeFormLabel);
    [...board.querySelectorAll('[data-week-assignment-card][data-auto-original]')]
      .filter(matchesActiveGroup)
      .forEach((source) => {
        const sourceId = source.dataset.itemId || '';
        board
          .querySelectorAll(`[data-week-assignment-card][data-source-item-id="${CSS.escape(sourceId)}"]`)
          .forEach((clone) => clone.remove());
        delete source.dataset.autoOriginal;
        source.style.display = '';
        mainPool.appendChild(source);
      });
    dayZones.forEach((zone) => {
      [...zone.querySelectorAll(':scope > [data-week-assignment-card]:not([data-auto-placed])')]
        .filter(matchesActiveGroup)
        .forEach((card) => mainPool.appendChild(card));
    });
    if (!writeState()) return;
    applyFormFilter(activeFormLabel);
  });
  formButtons.forEach((button) => {
    button.addEventListener('click', () => {
      activeFormLabel = button.dataset.weekFormFilter || '';
      try {
        localStorage.setItem(formStorageKey, activeFormLabel);
      } catch {}
      applyFormFilter(activeFormLabel);
    });
  });
  familyToggle?.addEventListener('change', () => {
    familyViewMode = familyToggle.checked ? 'mixed' : 'separated';
    try {
      localStorage.setItem(familyViewStorageKey, familyViewMode);
    } catch {}
    applyFormFilter(activeFormLabel);
  });
  applyFormFilter(activeFormLabel);
  const designedWeekPayload = () => {
    const itemLookup = new Map((vm.week?.weeklyAssignmentItems || []).map((item) => [item.id, item]));
    const assignmentForCard = (card) => {
      const sourceId = card.dataset.sourceItemId || card.dataset.itemId;
      const item = itemLookup.get(sourceId) || itemLookup.get(card.dataset.itemId) || {};
      return {
        id: sourceId || '',
        title: card.querySelector('strong')?.textContent?.trim() || item.title || 'Subject',
        sub: card.querySelector('small')?.textContent?.trim() || item.sub || '',
        note: card.querySelector('[data-week-assignment-note]')?.value?.trim() || '',
        color: item.color || '',
        kind: card.dataset.weekAssignmentKind || item.kind || '',
        formLabels: cardFormLabels(card),
      };
    };
    return {
      label: vm.week?.label || '',
      termLabel: vm.term?.label || vm.week?.termLabel || '',
      activeFormLabel,
      forms: availableForms,
      days: (vm.week?.days || []).map((day) => {
        const zone = board.querySelector(`[data-week-assignment-zone="${CSS.escape(day.date)}"]`);
        return {
          date: day.date || '',
          weekday: day.weekdayLong || day.weekday || '',
          shortDate: day.shortDate || '',
          feast: day.isSunday ? 'Church & Rest' : day.feast || '',
          isSunday: Boolean(day.isSunday),
          assignments: zone ? [...zone.querySelectorAll('[data-week-assignment-card]')].map(assignmentForCard) : [],
        };
      }),
      unassigned: [
        ...(board
          .querySelector('[data-week-assignment-zone="pool"]')
          ?.querySelectorAll('[data-week-assignment-card]') || []),
      ].map(assignmentForCard),
    };
  };
  const designedWeekCalendarEvents = () =>
    designedWeekPayload().days.flatMap((day) =>
      (day.assignments || []).map((assignment, index) => ({
        type: 'designed-lesson',
        title: assignment.title || 'Lesson',
        date: day.date,
        allDay: false,
        durationMinutes: 30,
        description: [day.weekday, assignment.sub, assignment.note].filter(truthyLearn13).join('\n'),
        startTime: `${String(9 + Math.min(index, 6)).padStart(2, '0')}:00`,
      }))
    );
  let designedWeekSyncTimer = null;
  const scheduleDesignedWeekCalendarSync = () => {
    if (!learnGoogleCalendarStatus.configured || !learnGoogleCalendarStatus.connected) return;
    clearTimeout(designedWeekSyncTimer);
    designedWeekSyncTimer = setTimeout(() => {
      syncLearnGoogleCalendar(designedWeekCalendarEvents());
    }, 900);
  };
  zones.forEach((zone) => {
    zone.addEventListener('dragover', (event) => {
      event.preventDefault();
      zone.classList.add('is-over');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
    zone.addEventListener('drop', (event) => {
      event.preventDefault();
      zone.classList.remove('is-over');
      const id = event.dataTransfer?.getData('text/plain') || '';
      const card = id ? board.querySelector(`[data-week-assignment-card][data-item-id="${CSS.escape(id)}"]`) : null;
      if (card) {
        zone.appendChild(card);
        if (!writeState()) return;
        applyFormFilter(activeFormLabel);
      }
    });
  });
  board.querySelector('[data-week-designed-print]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    if (!writeState()) return;
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'Generating...';
    try {
      const calendar = storedLearnCalendar('');
      const response = await fetch(learnApiUrl('/api/learn/print/print_mom_weekly', { calendar }), {
        method: 'POST',
        headers: learnRequestHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({
          templateId: 'print_mom_weekly',
          designedWeek: designedWeekPayload(),
        }),
      });
      if (waitForLearnSignIn(response)) return;
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Unable to generate the designed week PDF.');
      }
      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') || '';
      const fileMatch = disposition.match(/filename="([^"]+)"/);
      downloadBlob(fileMatch?.[1] || 'agapay-learn-designed-week.pdf', blob);
      const serverCount = Number(response.headers.get('x-agapay-learn-print-count'));
      if (!isLearnFamilyPlan()) setPrintCount(Number.isFinite(serverCount) ? serverCount : printCount() + 1);
    } catch (error) {
      showLearnDialog('Print Could Not Be Generated', error.message || 'Please refresh and try again.', []);
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  });
  const apptModal = board.querySelector('[data-week-appt-modal]');
  let activeApptEntry = null;
  const apptField = (name) => apptModal?.querySelector(`[name="${CSS.escape(name)}"]`) || null;
  const setApptField = (name, value) => {
    const el = apptField(name);
    if (el) el.value = String(value || '');
  };
  const getApptField = (name) => apptField(name)?.value?.trim() || '';
  const openApptModal = (entry) => {
    if (!apptModal) return;
    activeApptEntry = entry?.id ? entry : null;
    setApptField('weekApptModal.title', entry?.title || '');
    setApptField('weekApptModal.eventType', entry?.eventType || 'Family');
    setApptField('weekApptModal.date', entry?.date || '');
    setApptField('weekApptModal.startTime', entry?.startTime || '');
    setApptField('weekApptModal.recurrence', entry?.recurrence || 'none');
    setApptField('weekApptModal.location', entry?.location || '');
    setApptField('weekApptModal.notes', entry?.notes || '');
    const deleteBtn = apptModal.querySelector('[data-week-appt-delete]');
    if (deleteBtn) deleteBtn.hidden = !entry?.id;
    const titleEl = apptModal.querySelector('[data-week-appt-modal-title]');
    if (titleEl) titleEl.textContent = entry?.id ? 'Edit appointment' : 'Add appointment';
    apptModal.hidden = false;
    apptModal.style.display = 'flex';
    apptModal.querySelector('input, textarea, button')?.focus();
  };
  const closeApptModal = () => {
    if (apptModal) {
      apptModal.hidden = true;
      apptModal.style.display = 'none';
    }
    activeApptEntry = null;
  };
  const saveWeekAppointments = async (events) => {
    const fp = vm.familyPlanning || {};
    const payload = {
      household: {
        motherName: fp.household?.motherName || '',
        motherNameDay: fp.household?.motherNameDay || '',
        fatherName: fp.household?.fatherName || '',
        fatherNameDay: fp.household?.fatherNameDay || '',
        parishPatronalFeastName: fp.household?.parishPatronalFeastName || '',
        parishPatronalFeastDate: fp.household?.parishPatronalFeastDate || '',
      },
      childNameDays: (fp.children || []).map((child) => ({ childId: child.id || '', nameDay: child.nameDay || '' })),
      familyPlanning: {
        fastingPreference: fp.fastingPreference || 'guidance',
        weekStart: fp.weekStart || '',
        events,
        meals: fp.meals || [],
        recipes: fp.recipes || [],
        groceryItems: fp.groceryItems || [],
        chores: fp.chores || [],
      },
    };
    const params = new URLSearchParams(window.location.search);
    const saveQuery = new URLSearchParams({
      calendar: params.get('calendar') || storedLearnCalendar(''),
      view: params.get('view') || vm.activeView || 'week',
      date: params.get('date') || vm.day?.selected?.date || /* @__PURE__ */ new Date().toISOString().slice(0, 10),
    });
    const saved = await apiPost(`/api/learn/family-planning?${saveQuery.toString()}`, payload);
    await syncLearnGoogleCalendar([], null);
    return saved;
  };
  const currentWeekAppointments = () =>
    [...board.querySelectorAll('[data-week-appt-drag]')]
      .map((card) => ({
        id: card.dataset.apptId || '',
        title: card.dataset.apptTitle || '',
        eventType: card.dataset.apptType || '',
        date: card.dataset.apptDate || '',
        startTime: card.dataset.apptTime || '',
        recurrence: card.dataset.apptRecurrence || 'none',
        location: card.dataset.apptLocation || '',
        notes: card.dataset.apptNotes || '',
      }))
      .filter((entry) => entry.title && entry.date);
  board.querySelectorAll('[data-week-appt-open]').forEach((btn) => {
    btn.addEventListener('click', () => {
      openApptModal({
        id: btn.dataset.apptId || '',
        title: btn.dataset.apptTitle || '',
        eventType: btn.dataset.apptType || '',
        date: btn.dataset.apptDate || '',
        startTime: btn.dataset.apptTime || '',
        recurrence: btn.dataset.apptRecurrence || 'none',
        location: btn.dataset.apptLocation || '',
        notes: btn.dataset.apptNotes || '',
      });
    });
  });
  board.querySelectorAll('[data-week-appt-add]').forEach((btn) => {
    btn.addEventListener('click', () => {
      openApptModal({ id: '', date: btn.dataset.apptDate || '', eventType: 'Family', recurrence: 'none' });
    });
  });
  apptModal
    ?.querySelectorAll('[data-week-appt-modal-close]')
    .forEach((btn) => btn.addEventListener('click', closeApptModal));
  apptModal?.addEventListener('click', (event) => {
    if (event.target === apptModal) closeApptModal();
  });
  apptModal?.querySelector('[data-week-appt-save]')?.addEventListener('click', async () => {
    const entry = {
      id: activeApptEntry?.id || '',
      title: getApptField('weekApptModal.title'),
      eventType: getApptField('weekApptModal.eventType'),
      date: getApptField('weekApptModal.date'),
      startTime: getApptField('weekApptModal.startTime'),
      recurrence: getApptField('weekApptModal.recurrence') || 'none',
      location: getApptField('weekApptModal.location'),
      notes: getApptField('weekApptModal.notes'),
    };
    if (!entry.title || !entry.date) {
      closeApptModal();
      return;
    }
    const events = currentWeekAppointments().filter(
      (existing) => !(activeApptEntry?.id && existing.id === activeApptEntry.id)
    );
    events.push(entry);
    closeApptModal();
    try {
      await saveWeekAppointments(events);
      mount();
    } catch (error) {
      showLearnDialog('Could Not Save Appointment', error.message || 'Please try again.', []);
    }
  });
  apptModal?.querySelector('[data-week-appt-delete]')?.addEventListener('click', async () => {
    if (!activeApptEntry?.id) {
      closeApptModal();
      return;
    }
    const events = currentWeekAppointments().filter((existing) => existing.id !== activeApptEntry.id);
    closeApptModal();
    try {
      await saveWeekAppointments(events);
      mount();
    } catch (error) {
      showLearnDialog('Could Not Delete Appointment', error.message || 'Please try again.', []);
    }
  });
  let draggedApptCard = null;
  board.querySelectorAll('[data-week-appt-drag]').forEach((card) => {
    card.addEventListener('dragstart', (event) => {
      draggedApptCard = card;
      card.classList.add('is-dragging');
      event.dataTransfer?.setData('text/plain', card.dataset.apptId || card.dataset.apptTitle || '');
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('is-dragging');
      draggedApptCard = null;
      board.querySelectorAll('[data-week-appt-dropzone]').forEach((zone) => zone.classList.remove('is-over'));
    });
  });
  board.querySelectorAll('[data-week-appt-dropzone]').forEach((zone) => {
    zone.addEventListener('dragover', (event) => {
      if (!draggedApptCard) return;
      event.preventDefault();
      zone.classList.add('is-over');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
    zone.addEventListener('drop', async (event) => {
      if (!draggedApptCard) return;
      event.preventDefault();
      zone.classList.remove('is-over');
      const targetDate = zone.dataset.weekApptDropzone || '';
      const sourceCard = draggedApptCard;
      draggedApptCard = null;
      if (!targetDate || targetDate === sourceCard.dataset.apptDate) return;
      sourceCard.dataset.apptDate = targetDate;
      sourceCard.querySelector('[data-week-appt-open]')?.setAttribute('data-appt-date', targetDate);
      zone.appendChild(sourceCard);
      try {
        await saveWeekAppointments(currentWeekAppointments());
        mount();
      } catch (error) {
        showLearnDialog('Could Not Move Appointment', error.message || 'Please try again.', []);
      }
    });
  });
}
function wireMoveUnfinishedWork(vm) {
  root.querySelectorAll('[data-move-unfinished] button[data-move-mode]').forEach((button) => {
    button.addEventListener('click', async () => {
      const wrap = button.closest('[data-move-unfinished]');
      if (!wrap) return;
      const scope = wrap.dataset.moveScope || 'household';
      const rowId = wrap.dataset.moveRowId || '';
      const fromWeekday = Number(wrap.dataset.moveWeekday);
      const mode = button.dataset.moveMode || 'next-open-day';
      if (!rowId || !Number.isInteger(fromWeekday)) return;
      const buttons = wrap.querySelectorAll('button');
      buttons.forEach((b) => {
        b.disabled = true;
      });
      try {
        const weekDate = vm.day?.selected?.date || '';
        const response = await fetch(learnApiUrl('/api/learn/planner/move', { view: 'day', date: weekDate }), {
          method: 'POST',
          headers: learnRequestHeaders({ 'content-type': 'application/json' }),
          body: JSON.stringify({ scope, rowId, fromWeekday, mode, weekDate }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.ok)
          throw new Error(payload.error || 'That lesson could not be moved. Please try again.');
        mount();
      } catch (error) {
        buttons.forEach((b) => {
          b.disabled = false;
        });
        showLearnDialog("Couldn't Move That Lesson", error.message || 'Please refresh and try again.', []);
      }
    });
  });
}
function truthyLearn15(value) {
  return Boolean(value);
}
function wirePlanner(vm) {
  if (vm.activeView) localStorage.setItem('agapay.learn.plannerView', vm.activeView);
  if (vm.month?.key) localStorage.setItem('agapay.learn.plannerMonth', vm.month.key);
  if (vm.term?.activeTerm) localStorage.setItem('agapay.learn.plannerTerm', String(vm.term.activeTerm));
  wireWeeklyAssignmentBoard(vm);
  wireMoveUnfinishedWork(vm);
  root.querySelectorAll('[data-week-nav]').forEach((button) => {
    button.addEventListener('click', () => {
      const board = root.querySelector('[data-week-assignment-board]');
      const weekStart = board?.dataset.weekStart || '';
      const direction = button.dataset.weekNav;
      let targetDate;
      if (direction === 'today') {
        targetDate = /* @__PURE__ */ new Date().toISOString().slice(0, 10);
      } else {
        const offset = Number(direction) * 7;
        const base = weekStart ? /* @__PURE__ */ new Date(`${weekStart}T12:00:00Z`) : /* @__PURE__ */ new Date();
        base.setUTCDate(base.getUTCDate() + offset);
        targetDate = base.toISOString().slice(0, 10);
      }
      const params = new URLSearchParams(window.location.search);
      params.set('date', targetDate);
      params.set('view', 'week');
      window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
      mount();
    });
  });
  root.querySelector('[data-planner-intro-dismiss]')?.addEventListener('click', (event) => {
    const key = event.currentTarget.dataset.plannerIntroDismiss;
    if (key) localStorage.setItem(key, '1');
    const introEl = event.currentTarget.closest('.learn-family-intro')?.parentElement;
    event.currentTarget.closest("div[style*='justify-content:flex-end']")?.remove();
    event.currentTarget.closest('.learn-family-intro')?.remove();
  });
  const prototypeFrame = root.querySelector('[data-family-prototype-frame]');
  if (prototypeFrame) wireFamilyPrototypeBackend(vm, prototypeFrame);
  root.querySelector('[data-planner-month-print]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const month =
      button.dataset.plannerMonthPrint || vm.month?.key || /* @__PURE__ */ new Date().toISOString().slice(0, 7);
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'Generating...';
    try {
      const calendar = storedLearnCalendar('');
      const response = await fetch(learnApiUrl('/api/learn/print/print_mom_month', { calendar, month }), {
        method: 'POST',
        headers: learnRequestHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ month }),
      });
      const contentType = response.headers.get('content-type') || '';
      if (!response.ok || !contentType.includes('application/pdf')) {
        const payload = contentType.includes('application/json') ? await response.json().catch(() => ({})) : {};
        throw new Error(payload.error || 'Unable to generate the month calendar. Please try again.');
      }
      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') || '';
      const fileMatch = disposition.match(/filename="([^"]+)"/i);
      downloadBlob(fileMatch?.[1] || `agapay-learn-${month}-calendar.pdf`, blob);
    } catch (error) {
      showLearnDialog('Month Calendar Could Not Be Generated', error.message || 'Please refresh and try again.', []);
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  });
  const familyForm = root.querySelector('[data-family-planning-form]');
  let activeMeal = null;
  const openFamilyModal = (name) => {
    const modal = familyForm?.querySelector(`[data-family-modal="${name}"]`);
    if (!modal) return null;
    modal.hidden = false;
    modal.style.display = 'flex';
    modal.querySelector('input, textarea, button')?.focus();
    return modal;
  };
  const closeFamilyModals = () => {
    familyForm?.querySelectorAll('[data-family-modal]').forEach((modal) => {
      modal.hidden = true;
      modal.style.display = 'none';
    });
  };
  const submitFamilyPlanner = () => {
    familyForm?.requestSubmit();
  };
  const refreshChoreCalendar = () => {
    if (!familyForm) return;
    const live = familyForm.querySelector('[data-family-planner-live]');
    if (!live) return;
    const params = new URLSearchParams(window.location.search);
    const scope = params.get('scope') || vm.activeScope || 'lessons';
    if (scope !== 'chores') return;
    const displayView = params.get('view') || vm.activeView || 'week';
    const payload = familyPlanningPayloadFromForm(familyForm);
    const nextVm = {
      ...vm,
      familyPlanning: {
        ...(vm.familyPlanning || {}),
        ...(payload.familyPlanning || {}),
        household: {
          ...(vm.familyPlanning?.household || {}),
          ...(payload.household || {}),
        },
        children: vm.familyPlanning?.children || [],
      },
    };
    live.innerHTML = renderChoresScope(familyPlannerModel(nextVm), displayView);
  };
  const setModalValue = (name, value) => {
    const fields = familyForm?.querySelectorAll(`[name="${CSS.escape(name)}"]`) || [];
    if (!fields.length) return;
    if (fields.length > 1 && fields[0].type === 'checkbox') {
      const selected = choreTimeValues(value);
      fields.forEach((field) => {
        field.checked = selected.includes(field.value);
      });
      return;
    }
    fields[0].value = String(value || '');
  };
  const getModalValue = (name) => {
    const fields = familyForm?.querySelectorAll(`[name="${CSS.escape(name)}"]`) || [];
    if (!fields.length) return '';
    if (fields.length > 1 && fields[0].type === 'checkbox') {
      return [...fields]
        .filter((field) => field.checked)
        .map((field) => field.value)
        .join(', ');
    }
    return fields[0].value?.trim() || '';
  };
  const resetChoreBatchList = () => {
    const batchList = familyForm?.querySelector('[data-chore-batch-list]');
    if (!batchList) return;
    batchList.innerHTML = '';
    batchList.hidden = true;
  };
  const addChoreToBatchList = (entry = {}) => {
    const batchList = familyForm?.querySelector('[data-chore-batch-list]');
    if (!batchList || !entry.title) return;
    batchList.hidden = false;
    batchList.insertAdjacentHTML(
      'beforeend',
      `<span><strong>${html(entry.title)}</strong><small>${html([entry.assignee || 'Everyone', choreScheduleLabel(entry)].filter(truthyLearn15).join(' · '))}</small></span>`
    );
  };
  let activeChore = null;
  let activeEvent = null;
  const removeEventRows = (eventEntry = {}) => {
    if (!familyForm) return;
    familyForm.querySelectorAll('[data-setup-list="familyEvents"] [data-setup-row="familyEvents"]').forEach((row) => {
      const sameId = eventEntry.id && row.dataset.id === eventEntry.id;
      const sameDetails =
        !eventEntry.id &&
        rowValue(row, 'title') === (eventEntry.title || '') &&
        rowValue(row, 'date') === (eventEntry.date || '') &&
        rowValue(row, 'startTime') === (eventEntry.startTime || '');
      if (sameId || sameDetails) row.remove();
    });
  };
  const choreStorageKey = (chore = {}) => {
    const dayKey = dayKeyForChore(chore, vm);
    return dayKey ? `${chore.assignee || 'Everyone'}::${dayKey}::${chore.id || chore.title || 'chore'}` : '';
  };
  const removeChoreRows = (chore = {}) => {
    if (!familyForm) return;
    familyForm.querySelectorAll('[data-setup-list="chores"] [data-setup-row="chores"]').forEach((row) => {
      const sameId = chore.id && row.dataset.id === chore.id;
      const sameDetails =
        !chore.id &&
        rowValue(row, 'title') === (chore.title || '') &&
        rowValue(row, 'assignee') === (chore.assignee || 'Everyone') &&
        rowValue(row, 'day') === (chore.day || '');
      if (sameId || sameDetails) row.remove();
    });
  };
  const removeChoreFromDraftState = (chore = {}) => {
    const key = choreStorageKey(chore);
    if (!key) return;
    try {
      const state = JSON.parse(localStorage.getItem('agapay.planner.v2') || '{}');
      if (state.chores) delete state.chores[key];
      if (state.choreDetails) delete state.choreDetails[key];
      localStorage.setItem('agapay.planner.v2', JSON.stringify(state));
    } catch {}
  };
  const setMealValue = (date, slot, value) => {
    if (!date || !slot) return;
    let row = familyForm?.querySelector(`[data-setup-row="meals"][data-date="${CSS.escape(date)}"]`);
    if (!row) {
      const list = familyForm?.querySelector('[data-setup-list="meals"]');
      list?.insertAdjacentHTML(
        'beforeend',
        `<div data-setup-row="meals" data-date="${html(date)}" hidden><input name="date" value="${html(date)}"><input name="breakfast" value=""><input name="lunch" value=""><input name="dinner" value=""></div>`
      );
      row = familyForm?.querySelector(`[data-setup-row="meals"][data-date="${CSS.escape(date)}"]`);
    }
    const input = row?.querySelector(`[name="${CSS.escape(slot)}"]`);
    if (input) input.value = String(value || '');
    root
      .querySelectorAll(`[data-meal-open][data-date="${CSS.escape(date)}"][data-slot="${CSS.escape(slot)}"]`)
      .forEach((button) => {
        const strong = button.querySelector('strong');
        const small = button.querySelector('small');
        if (strong) strong.textContent = value || 'No dish yet';
        if (small) small.textContent = value ? 'change it →' : 'add a dish →';
      });
  };
  familyForm?.addEventListener('click', (event) => {
    const close = event.target.closest('[data-family-modal-close]');
    if (close) {
      closeFamilyModals();
      return;
    }
    const mealButton = event.target.closest('[data-meal-open]');
    if (mealButton) {
      activeMeal = { date: mealButton.dataset.date || '', slot: mealButton.dataset.slot || '' };
      const modal = openFamilyModal('meal');
      const input = modal?.querySelector('[data-meal-custom-input]');
      const context = modal?.querySelector('[data-meal-modal-context]');
      const row = familyForm.querySelector(`[data-setup-row="meals"][data-date="${CSS.escape(activeMeal.date)}"]`);
      if (input) input.value = row?.querySelector(`[name="${CSS.escape(activeMeal.slot)}"]`)?.value || '';
      if (context) context.textContent = `${mealSlotLabel(activeMeal.slot)} · ${activeMeal.date}`;
      return;
    }
    const mealPick = event.target.closest('[data-meal-pick]');
    if (mealPick && activeMeal) {
      const input = familyForm.querySelector('[data-meal-custom-input]');
      if (input) input.value = mealPick.dataset.mealPick || '';
      return;
    }
    if (event.target.closest('[data-meal-clear]') && activeMeal) {
      setMealValue(activeMeal.date, activeMeal.slot, '');
      closeFamilyModals();
      submitFamilyPlanner();
      return;
    }
    if (event.target.closest('[data-meal-save]') && activeMeal) {
      setMealValue(
        activeMeal.date,
        activeMeal.slot,
        familyForm.querySelector('[data-meal-custom-input]')?.value?.trim() || ''
      );
      closeFamilyModals();
      submitFamilyPlanner();
      return;
    }
    const recipeOpen = event.target.closest('[data-recipe-open]');
    if (recipeOpen) {
      const card = recipeOpen.closest('[data-recipe-title]');
      setModalValue('modalRecipe.title', card?.dataset.recipeTitle || '');
      setModalValue('modalRecipe.fastingType', card?.dataset.recipeFasting || 'free');
      setModalValue('modalRecipe.category', card?.dataset.recipeCategory || '');
      setModalValue('modalRecipe.sourceUrl', card?.dataset.recipeSource || '');
      setModalValue('modalRecipe.ingredients', card?.dataset.recipeIngredients || '');
      setModalValue('modalRecipe.instructions', card?.dataset.recipeInstructions || '');
      openFamilyModal('recipe');
      return;
    }
    if (event.target.closest('[data-recipe-save]')) {
      const list2 = familyForm.querySelector('[data-setup-list="recipes"]');
      const recipe = {
        title: getModalValue('modalRecipe.title'),
        fastingType: getModalValue('modalRecipe.fastingType'),
        category: getModalValue('modalRecipe.category'),
        sourceUrl: getModalValue('modalRecipe.sourceUrl'),
        ingredients: getModalValue('modalRecipe.ingredients'),
        instructions: getModalValue('modalRecipe.instructions'),
      };
      if (recipe.title && list2) list2.insertAdjacentHTML('beforeend', recipeSetupRow(recipe));
      closeFamilyModals();
      submitFamilyPlanner();
      return;
    }
    const eventOpen = event.target.closest('[data-event-open]');
    if (eventOpen) {
      const existingEventId = eventOpen.dataset.eventId || '';
      activeEvent = existingEventId
        ? {
            id: existingEventId,
            title: eventOpen.dataset.title || '',
            eventType: eventOpen.dataset.type || '',
            date: eventOpen.dataset.date || '',
            startTime: eventOpen.dataset.time || '',
            recurrence: eventOpen.dataset.recurrence || 'none',
            location: eventOpen.dataset.location || '',
            notes: eventOpen.dataset.notes || '',
          }
        : null;
      setModalValue('modalEvent.title', eventOpen.dataset.title || '');
      setModalValue('modalEvent.eventType', eventOpen.dataset.type || 'Family');
      setModalValue('modalEvent.date', eventOpen.dataset.date || '');
      setModalValue('modalEvent.startTime', eventOpen.dataset.time || '');
      setModalValue('modalEvent.recurrence', eventOpen.dataset.recurrence || 'none');
      setModalValue('modalEvent.location', eventOpen.dataset.location || '');
      setModalValue('modalEvent.notes', eventOpen.dataset.notes || '');
      const eventDeleteButton = familyForm.querySelector('[data-event-delete]');
      if (eventDeleteButton) eventDeleteButton.hidden = !existingEventId;
      const eventModalTitle = familyForm.querySelector('[data-event-modal-title]');
      if (eventModalTitle) eventModalTitle.textContent = existingEventId ? 'Edit calendar event' : 'Add to calendar';
      openFamilyModal('event');
      return;
    }
    if (event.target.closest('[data-event-delete]')) {
      if (activeEvent) {
        removeEventRows(activeEvent);
        activeEvent = null;
      }
      closeFamilyModals();
      submitFamilyPlanner();
      return;
    }
    if (event.target.closest('[data-event-save]')) {
      const list2 = familyForm.querySelector('[data-setup-list="familyEvents"]');
      const entry = {
        id: activeEvent?.id || '',
        title: getModalValue('modalEvent.title'),
        eventType: getModalValue('modalEvent.eventType'),
        date: getModalValue('modalEvent.date'),
        startTime: getModalValue('modalEvent.startTime'),
        recurrence: getModalValue('modalEvent.recurrence') || 'none',
        location: getModalValue('modalEvent.location'),
        notes: getModalValue('modalEvent.notes'),
      };
      if (activeEvent) removeEventRows(activeEvent);
      if (entry.title && entry.date && list2) list2.insertAdjacentHTML('beforeend', familyEventSetupRow(entry));
      activeEvent = null;
      closeFamilyModals();
      submitFamilyPlanner();
      return;
    }
    const choreOpen = event.target.closest('[data-chore-open]');
    if (choreOpen) {
      const existing = choreOpen.dataset.choreExisting === '1';
      activeChore = existing
        ? {
            id: choreOpen.dataset.choreId || '',
            title: choreOpen.dataset.choreTitle || '',
            assignee: choreOpen.dataset.choreAssignee || choreOpen.dataset.assignee || 'Everyone',
            cadence: choreOpen.dataset.choreCadence || 'weekly',
            day: choreOpen.dataset.choreDay || choreOpen.dataset.day || '',
            dayOfMonth: choreOpen.dataset.choreDayOfMonth || '',
            quarterMonth: choreOpen.dataset.choreQuarterMonth || '1',
            assignedDate: choreOpen.dataset.choreAssignedDate || choreOpen.dataset.assignedDate || '',
            timeOfDay: choreOpen.dataset.choreTimeOfDay || 'Anytime',
            notes: choreOpen.dataset.choreNotes || '',
          }
        : null;
      setModalValue('modalChore.title', activeChore?.title || '');
      setModalValue('modalChore.assignee', activeChore?.assignee || choreOpen.dataset.assignee || 'Everyone');
      setModalValue('modalChore.cadence', activeChore?.cadence || choreOpen.dataset.cadence || 'weekly');
      setModalValue('modalChore.day', activeChore?.day || choreOpen.dataset.day || '');
      setModalValue('modalChore.dayOfMonth', activeChore?.dayOfMonth || choreOpen.dataset.dayOfMonth || '');
      setModalValue('modalChore.quarterMonth', activeChore?.quarterMonth || '1');
      setModalValue('modalChore.assignedDate', activeChore?.assignedDate || choreOpen.dataset.assignedDate || '');
      setModalValue('modalChore.timeOfDay', activeChore?.timeOfDay || 'Anytime');
      setModalValue('modalChore.notes', activeChore?.notes || '');
      const deleteButton = familyForm.querySelector('[data-chore-delete]');
      if (deleteButton) deleteButton.hidden = !existing;
      const addAnotherButton = familyForm.querySelector('[data-chore-save-add]');
      if (addAnotherButton) addAnotherButton.hidden = existing;
      resetChoreBatchList();
      const title = familyForm.querySelector('[data-chore-modal-title]');
      if (title) title.textContent = existing ? 'Edit chore' : 'Add chore';
      openFamilyModal('chore');
      return;
    }
    if (event.target.closest('[data-chore-delete]')) {
      if (activeChore) {
        removeChoreRows(activeChore);
        removeChoreFromDraftState(activeChore);
      }
      activeChore = null;
      closeFamilyModals();
      refreshChoreCalendar();
      submitFamilyPlanner();
      return;
    }
    const saveChoreButton = event.target.closest('[data-chore-save], [data-chore-save-add]');
    if (saveChoreButton) {
      const addAnother = saveChoreButton.hasAttribute('data-chore-save-add');
      const list2 = familyForm.querySelector('[data-setup-list="chores"]');
      const entry = {
        id: activeChore?.id || '',
        title: getModalValue('modalChore.title'),
        assignee: getModalValue('modalChore.assignee'),
        cadence: getModalValue('modalChore.cadence') || 'weekly',
        day: getModalValue('modalChore.day'),
        dayOfMonth: getModalValue('modalChore.dayOfMonth'),
        quarterMonth: getModalValue('modalChore.quarterMonth'),
        assignedDate: getModalValue('modalChore.assignedDate'),
        timeOfDay: getModalValue('modalChore.timeOfDay'),
        notes: getModalValue('modalChore.notes'),
      };
      if (!entry.title) {
        const titleInput = familyForm.querySelector('[name="modalChore.title"]');
        if (titleInput) titleInput.focus();
        return;
      }
      if (list2) {
        const payload = familyPlanningPayloadFromForm(familyForm);
        const planningForRow = {
          ...(payload.familyPlanning || {}),
          household: payload.household || {},
          children: vm.familyPlanning?.children || [],
        };
        if (activeChore) {
          removeChoreRows(activeChore);
          removeChoreFromDraftState(activeChore);
        }
        list2.insertAdjacentHTML('beforeend', choreSetupRow(entry, 0, planningForRow));
        try {
          const dayKey = dayKeyForChore(entry, vm);
          if (dayKey) {
            const key = `${entry.assignee || 'Everyone'}::${dayKey}::${entry.id || entry.title || Date.now()}`;
            const state = JSON.parse(localStorage.getItem('agapay.planner.v2') || '{}');
            state.chores = { ...(state.chores || {}), [key]: entry.title || '' };
            state.choreDetails = {
              ...(state.choreDetails || {}),
              [key]: { ...entry, day: entry.day || plannerDayLabel(prototypeWeekDateMap(vm)[dayKey]).long },
            };
            localStorage.setItem('agapay.planner.v2', JSON.stringify(state));
          }
        } catch {}
      }
      activeChore = null;
      refreshChoreCalendar();
      if (addAnother) {
        addChoreToBatchList(entry);
        setModalValue('modalChore.title', '');
        setModalValue('modalChore.timeOfDay', '');
        setModalValue('modalChore.notes', '');
        const titleInput = familyForm.querySelector('[name="modalChore.title"]');
        if (titleInput) titleInput.focus();
      } else {
        closeFamilyModals();
        submitFamilyPlanner();
      }
      return;
    }
    const groceryRemove = event.target.closest('[data-grocery-remove]');
    if (groceryRemove) {
      const id = groceryRemove.dataset.groceryRemove || '';
      if (id) {
        const row = familyForm.querySelector(
          `[data-setup-list="groceryItems"] [data-setup-row="groceryItems"][data-id="${CSS.escape(id)}"]`
        );
        if (row) row.remove();
      }
      submitFamilyPlanner();
      return;
    }
    const groceryAdd = event.target.closest('[data-grocery-add]');
    if (groceryAdd) {
      const list2 = familyForm.querySelector('[data-setup-list="groceryItems"]');
      const pantry = groceryAdd.hasAttribute('data-pantry-add');
      if (list2)
        list2.insertAdjacentHTML(
          'beforeend',
          grocerySetupRow({
            name: pantry ? 'New pantry staple' : 'New grocery item',
            category: pantry ? 'Pantry' : 'Produce',
            pantry,
          })
        );
      submitFamilyPlanner();
      return;
    }
    const remove = event.target.closest('[data-setup-remove-row]');
    if (remove) {
      const row = remove.closest('[data-setup-row]');
      if (row) row.remove();
      return;
    }
    const add = event.target.closest('[data-setup-add-row]');
    if (!add) return;
    const list = add.dataset.setupAddTarget
      ? familyForm.querySelector(`#${CSS.escape(add.dataset.setupAddTarget)}`)
      : familyForm.querySelector(`[data-setup-list="${add.dataset.setupAddRow}"]`);
    if (list)
      list.insertAdjacentHTML(
        'beforeend',
        setupBlankRow(add.dataset.setupAddRow, familyForm, { date: add.dataset.setupAddDate || '' })
      );
  });
  let draggedEventRow = null;
  familyForm?.addEventListener('dragstart', (event) => {
    const row = event.target.closest('[data-event-drag]');
    if (!row) return;
    draggedEventRow = row;
    row.classList.add('is-dragging');
    event.dataTransfer?.setData('text/plain', row.dataset.eventId || row.dataset.title || '');
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  });
  familyForm?.addEventListener('dragend', (event) => {
    const row = event.target.closest('[data-event-drag]');
    if (row) row.classList.remove('is-dragging');
    draggedEventRow = null;
    familyForm.querySelectorAll('[data-event-dropzone]').forEach((zone) => zone.classList.remove('is-over'));
  });
  familyForm?.addEventListener('dragover', (event) => {
    const zone = event.target.closest('[data-event-dropzone]');
    if (!zone || !draggedEventRow) return;
    event.preventDefault();
    zone.classList.add('is-over');
  });
  familyForm?.addEventListener('dragleave', (event) => {
    const zone = event.target.closest('[data-event-dropzone]');
    if (zone) zone.classList.remove('is-over');
  });
  familyForm?.addEventListener('drop', (event) => {
    const zone = event.target.closest('[data-event-dropzone]');
    if (!zone || !draggedEventRow) return;
    event.preventDefault();
    zone.classList.remove('is-over');
    const targetDate = zone.dataset.eventDropzone || '';
    const sourceRow = draggedEventRow;
    draggedEventRow = null;
    if (!targetDate || targetDate === sourceRow.dataset.date) return;
    const movedEvent = {
      id: sourceRow.dataset.eventId || '',
      title: sourceRow.dataset.title || '',
      eventType: sourceRow.dataset.type || '',
      date: sourceRow.dataset.date || '',
      startTime: sourceRow.dataset.time || '',
      recurrence: sourceRow.dataset.recurrence || 'none',
      location: sourceRow.dataset.location || '',
      notes: sourceRow.dataset.notes || '',
    };
    removeEventRows(movedEvent);
    const list = familyForm.querySelector('[data-setup-list="familyEvents"]');
    if (list) list.insertAdjacentHTML('beforeend', familyEventSetupRow({ ...movedEvent, date: targetDate }));
    const rowsContainer = zone.querySelector('[data-event-rows]');
    if (rowsContainer) {
      rowsContainer.querySelector('[data-event-empty-hint]')?.remove();
      sourceRow.remove();
      rowsContainer.appendChild(sourceRow);
      sourceRow.dataset.date = targetDate;
      sourceRow.querySelectorAll('[data-event-open], [data-date]').forEach((el) => {
        if (el.dataset.date !== void 0) el.dataset.date = targetDate;
      });
    }
    submitFamilyPlanner();
  });
  familyForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = familyForm.querySelector('[data-family-planning-status]');
    const submit = familyForm.querySelector('button[type="submit"]');
    status.textContent = 'Saving family planner...';
    submit.disabled = true;
    try {
      const params = new URLSearchParams(window.location.search);
      const saveQuery = new URLSearchParams({
        calendar: params.get('calendar') || storedLearnCalendar(''),
        view: params.get('view') || vm.activeView || 'week',
        month: params.get('month') || vm.month?.key || /* @__PURE__ */ new Date().toISOString().slice(0, 7),
        date: params.get('date') || vm.day?.selected?.date || /* @__PURE__ */ new Date().toISOString().slice(0, 10),
      });
      const saved = await apiPost(
        `/api/learn/family-planning?${saveQuery.toString()}`,
        familyPlanningPayloadFromForm(familyForm)
      );
      status.textContent = `Family planner saved${saved.savedAt ? ` at ${new Date(saved.savedAt).toLocaleTimeString()}` : ''}.`;
      status.style.color = 'var(--gold)';
      await syncLearnGoogleCalendar([], status);
      if (saved.planner) {
        const updatedVm = toPlannerViewModel({ ok: true, planner: saved.planner });
        const scope = params.get('scope') || updatedVm.activeScope || 'lessons';
        const displayView = params.get('view') || updatedVm.activeView || 'week';
        const preparedVm = prepareOdysseyViewModel(updatedVm);
        renderLearnRoot(root, renderPlanner(preparedVm));
        wirePlanner(preparedVm);
      }
    } catch (error) {
      status.textContent = error.message;
      status.style.color = 'var(--burgundy)';
    } finally {
      submit.disabled = false;
    }
  });
  root.querySelectorAll('[data-block-note-form]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const blockId = form.dataset.blockNoteForm || '';
      const note = form.querySelector('[data-block-note-input]')?.value?.trim() || '';
      const btn = form.querySelector('button[type="submit"]');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Saving...';
      }
      try {
        await apiPost('/api/learn/planner', { action: 'note', blockId, note });
        const wrap = form.closest('[data-block-note-wrap]');
        if (wrap) {
          wrap.querySelector('[data-block-note-display]').textContent = note;
          wrap.dataset.blockNoteOpen = '';
        }
      } catch (error) {
        showLearnDialog('Note Could Not Be Saved', error.message || 'Please try again.', []);
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Save Note';
        }
      }
    });
  });
  root.querySelectorAll('[data-block-reschedule]').forEach((button) => {
    button.addEventListener('click', async () => {
      const blockId = button.dataset.blockReschedule || '';
      const fromDate = button.dataset.blockFromDate || '';
      const toDate = button.dataset.blockToDate || '';
      if (!blockId || !fromDate || !toDate) return;
      button.disabled = true;
      try {
        const calendar = storedLearnCalendar('');
        const saved = await apiPost(learnApiUrl('/api/learn/planner', { calendar }), {
          action: 'reschedule',
          blockId,
          fromDate,
          toDate,
        });
        await syncLearnGoogleCalendar();
        if (saved.planner) {
          const updatedVm = toPlannerViewModel({ ok: true, planner: saved.planner });
          const preparedVm = prepareOdysseyViewModel(updatedVm);
          renderLearnRoot(root, renderPlanner(preparedVm));
          wirePlanner(preparedVm);
        }
      } catch (error) {
        showLearnDialog('Reschedule Could Not Be Saved', error.message || 'Please try again.', []);
      } finally {
        button.disabled = false;
      }
    });
  });
}
function updateActiveButton(buttons, activeButton) {
  buttons.forEach((button) => {
    const active = button === activeButton;
    button.style.background = active ? 'var(--navy)' : 'var(--paper)';
    button.style.color = active ? '#f3ead4' : 'var(--ink)';
    button.style.borderColor = active ? 'var(--gold)' : 'var(--line)';
    button.setAttribute('aria-pressed', String(active));
  });
}
function wireCommunityLegacy() {
  const search = root.querySelector('[data-community-search]');
  const cards = [...root.querySelectorAll('[data-community-card]')];
  const count = root.querySelector('[data-community-count]');
  const filterButtons = [...root.querySelectorAll('[data-community-filter]')];
  let activeCategory = 'All';
  const applyFilters = () => {
    const query = (search?.value || '').trim().toLowerCase();
    let shown = 0;
    cards.forEach((card) => {
      const matchesCategory = activeCategory === 'All' || card.dataset.category === activeCategory;
      const matchesSearch = !query || (card.dataset.search || '').includes(query);
      const visible = matchesCategory && matchesSearch;
      card.hidden = !visible;
      if (visible) shown += 1;
    });
    if (count)
      count.innerHTML = `<span style="color:var(--gold);">✥</span> Showing ${shown} resources shared by Orthodox homeschool families`;
  };
  search?.addEventListener('input', applyFilters);
  filterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      activeCategory = button.dataset.communityFilter || 'All';
      updateActiveButton(filterButtons, button);
      applyFilters();
    });
  });
  root.querySelectorAll('[data-community-sort]').forEach((button) => {
    button.addEventListener('click', () =>
      updateActiveButton([...root.querySelectorAll('[data-community-sort]')], button)
    );
  });
  root.addEventListener('click', (event) => {
    const vote = event.target.closest('[data-community-vote]');
    if (vote) {
      const value = vote.querySelector('span');
      value.textContent = String((Number(value.textContent) || 0) + 1);
      return;
    }
    const save = event.target.closest('[data-community-save]');
    if (save) {
      save.textContent = save.textContent.includes('Saved') ? '♡ Save' : '✓ Saved';
      save.style.background = save.textContent.includes('Saved') ? 'var(--paper2)' : '#fbf2dd';
      return;
    }
    if (event.target.closest('[data-community-add]')) {
      showLearnDialog(
        'Added to Library',
        'This resource has been queued for the household library. Persistent community library syncing will use the same D1-backed profile store as setup.'
      );
    }
  });
  const panelEl = root.querySelector('[data-community-share-panel]');
  root.querySelector('[data-community-share]')?.addEventListener('click', () => {
    if (panelEl) {
      panelEl.hidden = false;
      panelEl.style.display = 'flex';
    }
  });
  root.querySelectorAll('[data-community-share-close]').forEach((button) => {
    button.addEventListener('click', () => {
      if (panelEl) {
        panelEl.hidden = true;
        panelEl.style.display = 'none';
      }
    });
  });
  root.querySelector('[data-community-submit]')?.addEventListener('click', () => {
    const title = root.querySelector('[name="community.title"]')?.value?.trim();
    const url = safeExternalUrl(root.querySelector('[name="community.url"]')?.value);
    const category = root.querySelector('[name="community.category"]')?.value?.trim() || 'Community';
    if (!title || !url) {
      showLearnDialog(
        'Resource needs a title and link',
        'Add a title and a valid http or https URL before sharing this resource.'
      );
      return;
    }
    showLearnDialog('Resource Shared', `${title} has been added to this community view for review.`);
    if (panelEl) {
      panelEl.hidden = true;
      panelEl.style.display = 'none';
    }
    const grid = root.querySelector('[data-community-grid]');
    if (grid) {
      const searchText = `${title} ${category}`.toLowerCase();
      const card = document.createElement('article');
      card.dataset.communityCard = '';
      card.dataset.category = category;
      card.dataset.search = searchText;
      card.style.cssText =
        'background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:11px;';
      const art = document.createElement('div');
      art.style.cssText =
        'height:92px;border:1px solid var(--line);border-radius:10px;background:linear-gradient(135deg,#f6edd6,var(--paper2));display:flex;align-items:center;justify-content:center;color:var(--gold);font-size:36px;';
      art.textContent = '✥';
      const heading = document.createElement('strong');
      heading.style.cssText = "font-family:'Cormorant Garamond',serif;font-size:20px;";
      heading.textContent = title;
      const description = document.createElement('p');
      description.style.cssText = 'font-size:13px;color:#3a4256;line-height:1.4;margin:0;';
      description.textContent = 'Newly shared by this household.';
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noreferrer';
      link.style.cssText = 'color:var(--gold);text-decoration:none;';
      link.textContent = 'Open resource ↗';
      card.append(art, heading, description, link);
      grid.prepend(card);
    }
  });
}
function wireCommunity() {
  const search = root.querySelector('[data-community-search]');
  const category = root.querySelector('[data-community-category]');
  const resourceType = root.querySelector('[data-community-resource-type]');
  const mediaType = root.querySelector('[data-community-media-type]');
  const cards = [...root.querySelectorAll('[data-community-card]')];
  const count = root.querySelector('[data-community-count]');
  const empty = root.querySelector('[data-community-empty]');
  const applyFilters = () => {
    const query = (search?.value || '').trim().toLowerCase();
    let shown = 0;
    cards.forEach((card) => {
      const matches =
        (!query || (card.dataset.search || '').includes(query)) &&
        (!category || category.value === 'All' || card.dataset.category === category.value) &&
        (!resourceType || resourceType.value === 'All' || card.dataset.resourceType === resourceType.value) &&
        (!mediaType || mediaType.value === 'All' || card.dataset.mediaType === mediaType.value);
      card.hidden = !matches;
      if (matches) shown += 1;
    });
    if (count) count.textContent = `Showing ${shown} curated ${shown === 1 ? 'resource' : 'resources'}`;
    if (empty) empty.hidden = shown !== 0;
  };
  search?.addEventListener('input', applyFilters);
  [category, resourceType, mediaType].forEach((control) => control?.addEventListener('change', applyFilters));
  root.querySelectorAll('[data-community-flag]').forEach((button) => {
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await apiPost(
          `/api/learn/community/resources/${encodeURIComponent(button.dataset.communityFlag || '')}/flag`,
          {}
        );
        button.textContent = 'Flagged';
        showLearnDialog('Sent for Review', 'An AGAPAY administrator will review this resource.', []);
      } catch (error) {
        button.disabled = false;
        showLearnDialog('Could Not Flag Resource', error.message || 'Please try again.', []);
      }
    });
  });
  const dialog = root.querySelector('[data-community-suggest-dialog]');
  const form = root.querySelector('[data-community-suggest-form]');
  const closeDialog = () => {
    if (!dialog) return;
    dialog.hidden = true;
    dialog.style.display = 'none';
  };
  root.querySelector('[data-community-suggest]')?.addEventListener('click', () => {
    if (!dialog) return;
    dialog.hidden = false;
    dialog.style.display = 'flex';
  });
  root
    .querySelectorAll('[data-community-suggest-close]')
    .forEach((button) => button.addEventListener('click', closeDialog));
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = form.querySelector('[data-community-suggest-status]');
    const submit = form.querySelector('button[type="submit"]');
    const values = new FormData(form);
    if (submit) submit.disabled = true;
    if (status) status.textContent = 'Sending your suggestion for review...';
    try {
      await apiPost('/api/learn/community/resources', {
        title: values.get('title'),
        url: values.get('url'),
        category: values.get('category'),
        resourceType: values.get('resourceType'),
        mediaType: values.get('mediaType'),
        ageRange: values.get('ageRange'),
        tags: values.get('tags'),
        description: values.get('description'),
      });
      form.reset();
      closeDialog();
      showLearnDialog(
        'Resource Submitted',
        'Thank you. The resource is now in the AGAPAY moderation queue and will not appear publicly until it is approved.',
        []
      );
    } catch (error) {
      if (status) status.textContent = error.message || 'The resource could not be submitted.';
    } finally {
      if (submit) submit.disabled = false;
    }
  });
}
function wireReports(vm) {
  const reportTemplateId = (label = 'Year-End Report') => {
    const lower = String(label || '').toLowerCase();
    if (lower.includes('transcript')) return 'transcript';
    if (lower.includes('report card')) return 'report-card';
    if (lower.includes('subject')) return 'subject-progress-report';
    return 'year-end-report';
  };
  const exportReport = async (label = vm.pdf.title, button = null, extra = {}) => {
    const title = label || 'Year-End Report';
    const originalText = button?.textContent;
    if (button) {
      button.disabled = true;
      button.textContent = 'Generating...';
    }
    try {
      const response = await fetch(`/api/learn/print/${encodeURIComponent(reportTemplateId(title))}`, {
        method: 'POST',
        headers: learnRequestHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ label: title, ...extra }),
      });
      const contentType = response.headers.get('content-type') || '';
      if (!response.ok || !contentType.includes('application/pdf')) {
        const payload = contentType.includes('application/json') ? await response.json().catch(() => ({})) : {};
        throw new Error(payload.error || 'Unable to generate the report PDF. Please try again.');
      }
      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') || '';
      const fileMatch = disposition.match(/filename="([^"]+)"/i);
      downloadBlob(
        fileMatch?.[1] ||
          `${
            title
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, '') || 'learn-report'
          }.pdf`,
        blob
      );
    } catch (error) {
      showLearnDialog('Report Could Not Be Generated', error.message || 'Please refresh and try again.', []);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = originalText ?? null;
      }
    }
  };
  root
    .querySelector('[data-report-pdf]')
    ?.addEventListener('click', (event) => exportReport(vm.pdf.title, event.currentTarget));
  root.querySelectorAll('[data-report-export]').forEach((button) => {
    button.addEventListener('click', () => {
      const childId = button.dataset.reportChildId || '';
      exportReport(button.dataset.reportExport || 'Learn Report', button, childId ? { childId } : {});
    });
  });
}
function gradeCourseFromElement(courseEl, childId) {
  const field = (name) => courseEl.querySelector(`[name="${name}"]`);
  return {
    id: courseEl.dataset.courseId || '',
    childId,
    courseTitle: field('courseTitle')?.value?.trim() || 'Untitled Course',
    subjectCategory: field('subjectCategory')?.value || 'General',
    gradeLevel: Number(field('gradeLevel')?.value || 9),
    creditHours: Number(field('creditHours')?.value || 0),
    grades: [...courseEl.querySelectorAll('[data-grade-term]')].map((termEl) => ({
      termIndex: Number(termEl.dataset.gradeTerm || 1),
      numericScore: termEl.querySelector('[name="numericScore"]')?.value?.trim() || '',
      letterGrade: termEl.querySelector('[name="letterGrade"]')?.value || '',
      attendanceDays: termEl.querySelector('[name="attendanceDays"]')?.value?.trim() || '',
      teacherNotes: termEl.querySelector('[name="teacherNotes"]')?.value?.trim() || '',
    })),
  };
}
function blankGradeCourse(vm) {
  const index = root.querySelectorAll('[data-grade-course]').length;
  const child = vm.selectedChild || vm.children[0] || {};
  return {
    id: '',
    courseTitle: 'New Course',
    subjectCategory: 'English',
    gradeLevel: Number(child.gradeLevel || 9),
    creditHours: 1,
    color: ['#14294a', '#6e2f2a', '#4a5a31', '#b5942f', '#34507a'][index % 5],
    grades: [1, 2, 3].map((termIndex) => ({
      termIndex,
      numericScore: '',
      letterGrade: '',
      attendanceDays: '',
      teacherNotes: '',
    })),
  };
}
function attendanceEntryFromCell(cell) {
  return {
    childId: cell.dataset.childId || '',
    date: cell.dataset.date || '',
    status: cell.dataset.status || 'present',
    minutes: cell.dataset.minutes || '',
    notes: cell.dataset.notes || '',
  };
}
function setAttendanceCellStatus(cell, status) {
  const next = status || 'present';
  const holidayName = cell.dataset.holidayName || '';
  cell.dataset.status = next;
  cell.classList.remove('is-present', 'is-absent', 'is-excused', 'is-holiday');
  cell.classList.add(`is-${next}`);
  const strong = cell.querySelector('strong');
  const small = cell.querySelector('small');
  if (strong) strong.textContent = attendanceStatusMark(next);
  if (small) small.textContent = holidayName && next === 'holiday' ? holidayName : attendanceStatusLabel(next);
  cell.setAttribute(
    'aria-label',
    `${cell.dataset.childId || 'Student'} ${cell.dataset.date || ''}: ${attendanceStatusLabel(next)}${holidayName && next === 'holiday' ? ` (${holidayName})` : ''}`
  );
}
function wireGrades(vm) {
  const form = root.querySelector('[data-grades-form]');
  if (!form) return;
  const status = root.querySelector('[data-grades-status]');
  const setStatus = (message, tone = 'muted') => {
    if (!status) return;
    status.textContent = message;
    status.dataset.tone = tone;
  };
  const attendanceForm = root.querySelector('[data-attendance-form]');
  const attendanceStatus = root.querySelector('[data-attendance-status]');
  const setAttendanceStatus = (message, tone = 'muted') => {
    if (!attendanceStatus) return;
    attendanceStatus.textContent = message;
    attendanceStatus.dataset.tone = tone;
  };
  attendanceForm?.addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-attendance-toggle]');
    if (toggle) {
      const body = attendanceForm.querySelector('[data-attendance-body]');
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      const nextExpanded = !expanded;
      toggle.setAttribute('aria-expanded', nextExpanded ? 'true' : 'false');
      toggle.textContent = nextExpanded ? 'Minimize' : 'Expand';
      if (body) body.hidden = !nextExpanded;
      attendanceForm.classList.toggle('is-collapsed', !nextExpanded);
      setAttendanceStatus(
        nextExpanded
          ? 'Click a day to cycle its status.'
          : 'Attendance card minimized. Mark the week present or expand for details.'
      );
      return;
    }
    const cell = event.target.closest('[data-attendance-cell]');
    if (!cell) return;
    const statuses = ['present', 'absent', 'excused', 'holiday'];
    const index = statuses.indexOf(cell.dataset.status || 'present');
    setAttendanceCellStatus(cell, statuses[(index + 1) % statuses.length]);
    setAttendanceStatus('Attendance changed. Save when ready.');
  });
  attendanceForm?.querySelector('[data-attendance-present-week]')?.addEventListener('click', () => {
    attendanceForm
      .querySelectorAll('[data-attendance-cell]')
      .forEach((cell) =>
        setAttendanceCellStatus(cell, cell.dataset.defaultStatus === 'holiday' ? 'holiday' : 'present')
      );
    setAttendanceStatus('Week marked present with national holidays preserved. Save when ready.');
  });
  attendanceForm?.querySelector('[data-attendance-save]')?.addEventListener('click', async () => {
    const save = attendanceForm.querySelector('[data-attendance-save]');
    if (save) {
      save.disabled = true;
      save.textContent = 'Saving...';
    }
    setAttendanceStatus('Saving attendance...');
    try {
      await apiPost('/api/learn/attendance', {
        academicYearName: form.elements.academicYearName?.value?.trim() || vm.academicYear.name,
        entries: [...attendanceForm.querySelectorAll('[data-attendance-cell]')].map(attendanceEntryFromCell),
      });
      setAttendanceStatus('Attendance saved.', 'success');
    } catch (error) {
      setAttendanceStatus(error.message || 'Attendance could not be saved.', 'error');
    } finally {
      if (save) {
        save.disabled = false;
        save.textContent = 'Save Attendance';
      }
    }
  });
  form.querySelector('[data-grades-child]')?.addEventListener('change', (event) => {
    const params = new URLSearchParams(window.location.search);
    params.set('childId', event.currentTarget.value);
    window.location.search = params.toString();
  });
  form.querySelector('[name="academicYearName"]')?.addEventListener('change', (event) => {
    const params = new URLSearchParams(window.location.search);
    params.set('academicYear', event.currentTarget.value.trim());
    window.location.search = params.toString();
  });
  form.querySelector('[data-grade-add-course]')?.addEventListener('click', () => {
    const listEl = root.querySelector('[data-grade-course-list]');
    if (!listEl) return;
    if (!listEl.querySelector('[data-grade-course]')) listEl.innerHTML = '';
    listEl.insertAdjacentHTML(
      'beforeend',
      renderGradeCourseEditor(blankGradeCourse(vm), vm, listEl.querySelectorAll('[data-grade-course]').length)
    );
  });
  form.addEventListener('click', (event) => {
    const remove = event.target.closest('[data-grade-remove-course]');
    if (!remove) return;
    remove.closest('[data-grade-course]')?.remove();
    if (!root.querySelector('[data-grade-course]')) {
      root.querySelector('[data-grade-course-list]').innerHTML = emptyState(
        'No courses have been recorded for this student yet. Add a course to begin the transcript trail.'
      );
    }
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const save = form.querySelector('[data-grade-save]');
    const childId = form.elements.childId?.value || vm.selectedChildId;
    const payload = {
      childId,
      academicYearName: form.elements.academicYearName?.value?.trim() || vm.academicYear.name,
      courses: [...root.querySelectorAll('[data-grade-course]')].map((courseEl) =>
        gradeCourseFromElement(courseEl, childId)
      ),
    };
    if (save) {
      save.disabled = true;
      save.textContent = 'Saving...';
    }
    setStatus('Saving grades...');
    try {
      await apiPost('/api/learn/grades', payload);
      setStatus('Grades saved. Refreshing the gradebook...', 'success');
      window.setTimeout(() => window.location.reload(), 450);
    } catch (error) {
      setStatus(error.message || 'Grades could not be saved.', 'error');
    } finally {
      if (save) {
        save.disabled = false;
        save.textContent = 'Save Grades';
      }
    }
  });
  root.querySelectorAll('[data-report-export]').forEach((button) => {
    button.addEventListener('click', async () => {
      const label = button.dataset.reportExport || 'Report Card';
      const original = button.textContent;
      button.disabled = true;
      button.textContent = 'Generating...';
      try {
        const templateId = label.toLowerCase().includes('transcript') ? 'transcript' : 'report-card';
        const response = await fetch(`/api/learn/print/${templateId}`, {
          method: 'POST',
          headers: learnRequestHeaders({ 'content-type': 'application/json' }),
          body: JSON.stringify({ label }),
        });
        const contentType = response.headers.get('content-type') || '';
        if (!response.ok || !contentType.includes('application/pdf'))
          throw new Error('Unable to generate that PDF yet.');
        const blob = await response.blob();
        downloadBlob(`${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`, blob);
      } catch (error) {
        showLearnDialog('Print Could Not Be Generated', error.message || 'Please refresh and try again.', []);
      } finally {
        button.disabled = false;
        button.textContent = original;
      }
    });
  });
}
function testScoreFromElement(entryEl) {
  const field = (name) => entryEl.querySelector(`[name="${name}"]`)?.value?.trim() || '';
  const testType = entryEl.dataset.testType === 'SAT' ? 'SAT' : 'ACT';
  return {
    id: entryEl.dataset.scoreId || '',
    testType,
    testDate: field('testDate'),
    compositeScore: field('compositeScore'),
    totalScore: field('totalScore'),
    englishScore: field('englishScore'),
    mathScore: field('mathScore'),
    readingScore: field('readingScore'),
    scienceScore: field('scienceScore'),
    writingScore: field('writingScore'),
    readingWritingScore: field('readingWritingScore'),
  };
}
function wireTestScores(vm) {
  const list = root.querySelector('[data-test-score-list]');
  const status = root.querySelector('[data-test-scores-status]');
  if (!list) return;
  const setStatus = (message, tone = 'muted') => {
    if (!status) return;
    status.textContent = message;
    status.dataset.tone = tone;
  };
  const clearEmptyState = () => {
    if (!list.querySelector('[data-test-score]')) list.innerHTML = '';
  };
  root.querySelectorAll('[data-test-score-add]').forEach((button) => {
    button.addEventListener('click', () => {
      clearEmptyState();
      list.insertAdjacentHTML(
        'beforeend',
        renderTestScoreRow({ testType: button.dataset.testScoreAdd === 'SAT' ? 'SAT' : 'ACT' })
      );
      setStatus('New score added. Fill it in and save when ready.');
    });
  });
  list.addEventListener('click', (event) => {
    const remove = event.target.closest('[data-test-score-remove]');
    if (!remove) return;
    remove.closest('[data-test-score]')?.remove();
    if (!list.querySelector('[data-test-score]')) {
      list.innerHTML = emptyState('No ACT or SAT scores recorded yet for this student.');
    }
    setStatus('Score removed. Save to confirm.');
  });
  root.querySelector('[data-test-scores-save]')?.addEventListener('click', async (event) => {
    const save = event.currentTarget;
    const childId = vm.selectedChildId;
    const scores = [...list.querySelectorAll('[data-test-score]')].map(testScoreFromElement);
    save.disabled = true;
    save.textContent = 'Saving...';
    setStatus('Saving test scores...');
    try {
      await apiPost('/api/learn/test-scores', { childId, scores });
      setStatus('Test scores saved.', 'success');
    } catch (error) {
      setStatus(error.message || 'Test scores could not be saved.', 'error');
    } finally {
      save.disabled = false;
      save.textContent = 'Save Test Scores';
    }
  });
}
function canUsePrint(vm, template) {
  if (isLearnFamilyPlan()) return true;
  if (template?.premium) {
    showLearnDialog(
      'Family Plan Required',
      'Child sheets, term packs, and premium print templates are available on the Learn Family plan.',
      [],
      { upgrade: true }
    );
    return false;
  }
  if (printCount() >= vm.billing.printLimit) {
    showLearnDialog(
      'Print Limit Reached',
      `The free plan includes ${vm.billing.printLimit} basic household prints. Upgrade to keep generating print packs.`,
      [],
      { upgrade: true }
    );
    return false;
  }
  return true;
}
function wirePrintCenter(vm) {
  root.querySelector('[data-print-upgrade]')?.addEventListener('click', openLearnCheckout);
  root.querySelectorAll('[data-print-generate]').forEach((button) => {
    button.addEventListener('click', async () => {
      const templateId = button.dataset.printGenerate;
      const template = vm.templates.find((item) => item.id === templateId) ||
        vm.templates.find((item) => item.id === 'weekly-pack') || {
          id: 'weekly-pack',
          title: 'Weekly Print Pack',
          audience: 'household',
          premium: false,
        };
      if (!canUsePrint(vm, template)) return;
      const title = template?.title || 'Weekly Print Pack';
      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = 'Generating...';
      try {
        const calendar = storedLearnCalendar('');
        const response = await fetch(learnApiUrl(`/api/learn/print/${encodeURIComponent(templateId)}`, { calendar }), {
          method: 'POST',
          headers: learnRequestHeaders({ 'content-type': 'application/json' }),
          body: JSON.stringify({
            childId: template.childId || '',
            termId: template.termId || '',
            month: button.dataset.printMonth || '',
          }),
        });
        const contentType = response.headers.get('content-type') || '';
        if (!response.ok || !contentType.includes('application/pdf')) {
          const payload = contentType.includes('application/json') ? await response.json().catch(() => ({})) : {};
          throw new Error(payload.error || 'Unable to generate the PDF. Please try again.');
        }
        const blob = await response.blob();
        const disposition = response.headers.get('content-disposition') || '';
        const fileMatch = disposition.match(/filename="([^"]+)"/i);
        downloadBlob(
          fileMatch?.[1] ||
            `${
              title
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '') || 'learn-print-pack'
            }.pdf`,
          blob
        );
        const serverCount = Number(response.headers.get('x-agapay-learn-print-count'));
        if (!isLearnFamilyPlan()) setPrintCount(Number.isFinite(serverCount) ? serverCount : printCount() + 1);
      } catch (error) {
        showLearnDialog('Print Could Not Be Generated', error.message || 'Please refresh and try again.', []);
      } finally {
        button.disabled = false;
        button.textContent = originalText;
      }
    });
  });
  root.querySelectorAll('[data-child-print-group]').forEach((button) => {
    button.addEventListener('click', async () => {
      const selectId = button.dataset.childSelect;
      const select = selectId ? document.getElementById(selectId) : null;
      const templateId = select?.value || '';
      if (!templateId) return;
      const template = vm.templates.find((t) => t.id === templateId) || {
        id: templateId,
        title: 'Child Sheet',
        audience: 'child',
        premium: true,
        childId: '',
      };
      if (!canUsePrint(vm, template)) return;
      const title = template.title || 'Child Sheet';
      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = 'Generating...';
      try {
        const calendar = storedLearnCalendar('');
        const response = await fetch(learnApiUrl(`/api/learn/print/${encodeURIComponent(templateId)}`, { calendar }), {
          method: 'POST',
          headers: learnRequestHeaders({ 'content-type': 'application/json' }),
          body: JSON.stringify({
            childId: template.childId || '',
            termId: template.termId || '',
          }),
        });
        const contentType = response.headers.get('content-type') || '';
        if (!response.ok || !contentType.includes('application/pdf')) {
          const payload = contentType.includes('application/json') ? await response.json().catch(() => ({})) : {};
          throw new Error(payload.error || 'Unable to generate the PDF. Please try again.');
        }
        const blob = await response.blob();
        const disposition = response.headers.get('content-disposition') || '';
        const fileMatch = disposition.match(/filename="([^"]+)"/i);
        downloadBlob(
          fileMatch?.[1] ||
            `${
              title
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '') || 'child-sheet'
            }.pdf`,
          blob
        );
        const serverCount = Number(response.headers.get('x-agapay-learn-print-count'));
        if (!isLearnFamilyPlan()) setPrintCount(Number.isFinite(serverCount) ? serverCount : printCount() + 1);
      } catch (error) {
        showLearnDialog('Print Could Not Be Generated', error.message || 'Please refresh and try again.', []);
      } finally {
        button.disabled = false;
        button.textContent = originalText;
      }
    });
  });
}
function wireFormation() {
  root.querySelectorAll('[data-reading-check]').forEach((button) => {
    button.addEventListener('click', () => {
      const active = button.getAttribute('aria-pressed') !== 'true';
      button.setAttribute('aria-pressed', String(active));
      button.style.background = active ? '#fbf2dd' : 'var(--paper2)';
      button.style.borderColor = active ? 'var(--gold)' : 'var(--line)';
      const mark = button.querySelector('[data-reading-mark]');
      if (mark) mark.textContent = active ? '✓' : '';
    });
  });
}
async function mount() {
  if (new URLSearchParams(window.location.search).get('learn_billing') === 'success') {
    localStorage.setItem('agapay.learn.plan', 'family');
  }
  let resolvedPrintLimit = 3;
  try {
    const billing = await apiGet('/api/learn/billing/status');
    if (billing.plan === 'family' || billing.fullAccess) {
      localStorage.setItem('agapay.learn.plan', 'family');
    } else {
      localStorage.removeItem('agapay.learn.plan');
    }
    if (billing.printLimit) resolvedPrintLimit = Number(billing.printLimit) || 3;
  } catch {}
  try {
    const status = await apiGet('/api/learn/google-calendar/status');
    learnGoogleCalendarStatus = {
      loaded: true,
      configured: Boolean(status.configured),
      connected: Boolean(status.connected),
      accountEmail: status.accountEmail || '',
    };
  } catch (error) {
    console.warn('Google Calendar status could not be loaded:', error);
    learnGoogleCalendarStatus = { loaded: true, configured: false, connected: false };
  }
  const params = new URLSearchParams(window.location.search);
  const calendar = params.get('calendar') || storedLearnCalendar('');
  renderLearnRoot(
    root,
    `<div style="padding:32px;font-family:Georgia,serif;color:#1b2c45;">Loading AGAPAY Learn...</div>`
  );
  if (pageKey === 'dashboard') {
    const raw = await apiGet(learnApiUrl('/api/learn/dashboard', { calendar }));
    if (raw.setupCompleted === false && !marketingPreviewActive()) {
      window.location.replace(learnSectionHref('onboarding'));
      return;
    }
    renderLearnRoot(root, renderDashboard(prepareOdysseyViewModel(toDashboardViewModel(raw))));
    if (!marketingPreviewActive()) wireDashboard();
    return;
  }
  if (pageKey === 'planner') {
    const view = params.get('view') || localStorage.getItem('agapay.learn.plannerView') || 'week';
    const month = params.get('month') || /* @__PURE__ */ new Date().toISOString().slice(0, 7);
    const termId = params.get('termId') || '';
    const date = params.get('date') || '';
    const raw = await apiGet(learnApiUrl('/api/learn/planner', { calendar, view, month, termId, date }));
    const vm = prepareOdysseyViewModel(toPlannerViewModel(raw));
    renderLearnRoot(root, renderPlanner(vm));
    if (!marketingPreviewActive()) wirePlanner(vm);
    return;
  }
  if (pageKey === 'formation') {
    const raw = await apiGet(learnApiUrl('/api/learn/formation', { calendar }));
    renderLearnRoot(root, renderFormation(prepareOdysseyViewModel(toFormationViewModel(raw))));
    if (!marketingPreviewActive()) wireFormation();
    return;
  }
  if (pageKey === 'books') {
    const raw = await apiGet('/api/learn/books');
    renderLearnRoot(root, renderBooks(prepareOdysseyViewModel(toBooksViewModel(raw))));
    return;
  }
  if (pageKey === 'grades') {
    const params2 = new URLSearchParams(window.location.search);
    const academicYear = params2.get('academicYear') || '';
    const childId = params2.get('childId') || '';
    const raw = await apiGet(
      `/api/learn/grades${academicYear ? `?academicYear=${encodeURIComponent(academicYear)}` : ''}`
    );
    const vm = prepareOdysseyViewModel(toGradesViewModel(raw, { childId }));
    const testScoresRaw = await apiGet('/api/learn/test-scores').catch(() => null);
    vm.testScores = (testScoresRaw?.testScores?.scores || []).filter((row) => row.childId === vm.selectedChildId);
    renderLearnRoot(root, renderGrades(vm));
    if (!marketingPreviewActive()) {
      wireGrades(vm);
      wireTestScores(vm);
    }
    return;
  }
  if (pageKey === 'reports') {
    const raw = await apiGet('/api/learn/dashboard');
    const vm = toDashboardViewModel(raw);
    vm.page = {
      id: 'reports',
      title: 'Reports',
      subtitle: 'Academic records and transcript tools are coming soon.',
      ornament: true,
    };
    renderLearnRoot(root, renderReportsComingSoon(vm));
    return;
  }
  if (pageKey === 'print-center') {
    const raw = await apiGet(learnApiUrl('/api/learn/print-center', { calendar }));
    const vm = prepareOdysseyViewModel(toPrintCenterViewModel({ ...raw, printLimit: resolvedPrintLimit }));
    renderLearnRoot(root, renderPrintCenter(vm));
    if (!marketingPreviewActive()) wirePrintCenter(vm);
    return;
  }
  if (pageKey === 'community') {
    const raw = await apiGet('/api/learn/community');
    renderLearnRoot(root, renderCommunity(prepareOdysseyViewModel(toCommunityViewModel(raw))));
    if (!learnExperience().tefaActive && !marketingPreviewActive()) wireCommunity();
    return;
  }
  if (pageKey === 'co-op') {
    const raw = await apiGet('/api/learn/co-op');
    renderLearnRoot(root, renderCoOp(toCoOpViewModel(raw)));
    return;
  }
  if (pageKey === 'onboarding') {
    const raw = await apiGet('/api/learn/setup');
    const vm = prepareOdysseyViewModel(toSetupViewModel(raw, { calendar }));
    const draft = loadSimpleSetupDraft(vm);
    const setupParams = new URLSearchParams(window.location.search);
    const advanced = setupParams.get('advanced') === '1';
    const simple = setupParams.get('simple') === '1';
    if ((!vm.setupCompleted && !advanced) || simple) {
      document.body.classList.add('learn-simple-setup');
      renderLearnRoot(root, renderSimpleSetupWizard(vm, draft));
      if (!marketingPreviewActive()) wireSimpleSetupWizard(vm, draft, raw.onboarding?.setupSnapshot || null);
      return;
    }
    document.body.classList.remove('learn-simple-setup');
    renderLearnRoot(root, renderSetup(!vm.setupCompleted ? applySimpleDraftToSetupVm(vm, draft) : vm));
    if (!marketingPreviewActive()) wireSetupPage();
    if (window.location.hash) {
      window.requestAnimationFrame(() =>
        document.querySelector(window.location.hash)?.scrollIntoView({ block: 'start' })
      );
    }
    return;
  }
  renderLearnRoot(
    root,
    `<div style="padding:32px;font-family:Georgia,serif;color:#1b2c45;">This Learn route has not been migrated to the Claude shell yet.</div>`
  );
}
import {
  toBooksViewModel,
  toCoOpViewModel,
  toCommunityViewModel,
  toDashboardViewModel,
  toFormationViewModel,
  toGradesViewModel,
  toPlannerViewModel,
  toPrintCenterViewModel,
  toSetupViewModel,
} from './dashboard-view-models.js?v=20260703d';
import { renderSanitizedMarkup as renderLearnRoot } from './sanitized-render.js?v=20260904security1';
import { ACCENTS } from './dashboard-view-models-shared.js';
import {
  isOdysseyLearnContext,
  html,
  learnExperience,
  emptyState,
  renderPlannerTerm,
  renderPlannerYear,
  softColor,
  panel,
  renderAttendanceTracker,
  DEFAULT_TERM_WEEK_COUNT,
  formationRhythmSetupRow,
  formationRecitationSetupRow,
  formationEnrichmentSetupRow,
  subjectSetupRow,
  formOptions,
  colorChoices,
  setupInput,
  setupSelect,
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
} from './dashboard-shell-setup-calendar.js';
import {
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
} from './dashboard-shell-planner-family.js';
const odysseyPageMap = {
  planner: 'planner',
  formation: 'formation',
  books: 'books',
  grades: 'grades',
  community: 'community',
  'co-op': 'co-op',
  print: 'print-center',
  'print-center': 'print-center',
  setup: 'onboarding',
  onboarding: 'onboarding',
};
function resolveLearnPageKey() {
  const base = document.body.dataset.learnPage || 'dashboard';
  if (document.body.dataset.learnContext !== 'odyssey') return base;
  const match = window.location.pathname.match(/^\/learn\/odyssey\/dashboard\/([^/]+)/);
  return match ? odysseyPageMap[match[1]] || base : base;
}
const pageKey = resolveLearnPageKey();
const root = document.getElementById('learnRoot');
let learnGoogleCalendarStatus = { loaded: false, configured: false, connected: false };
const ODYSSEY_FAITH_SPECIFIC =
  /\b(orthodox|church|parish|saint|saints|catechesis|catechism|prayer|scripture|gospel|epistle|troparion|kontakion|hymn|feast|fasting|fast day|liturgical|creed|beatitudes|pascha|dormition|transfiguration|theology)\b/i;
const MARKETING_LEARNERS = [
  { id: 'demo_avery', name: 'Avery', age: '15', formLabel: 'Form IV', gradeLabel: 'Grade 10', color: '#34507a' },
  { id: 'demo_jordan', name: 'Jordan', age: '13', formLabel: 'Form III', gradeLabel: 'Grade 8', color: '#6e2f2a' },
  { id: 'demo_riley', name: 'Riley', age: '11', formLabel: 'Form II', gradeLabel: 'Grade 6', color: '#4a5a31' },
  { id: 'demo_morgan', name: 'Morgan', age: '10', formLabel: 'Form II', gradeLabel: 'Grade 5', color: '#8a6b2f' },
  { id: 'demo_casey', name: 'Casey', age: '8', formLabel: 'Form I', gradeLabel: 'Grade 3', color: '#7b5b78' },
  { id: 'demo_quinn', name: 'Quinn', age: '6', formLabel: 'Form I', gradeLabel: 'Grade 1', color: '#537a7a' },
];
const LEARN_VIEW_MODE_KEY = 'agapay.learn.viewMode';
let learnCheckoutOpening = false;
const PLANNER_STATUS_META = {
  planned: { label: 'Planned', note: 'On the schedule for this day.' },
  reduced: { label: 'Shortened', note: 'Kept, but trimmed to fit a lighter day.' },
  deferred: { label: 'Moved', note: 'Moved to another day this week — not behind, just later.' },
  reserve: { label: 'In Reserve', note: "Set aside for whenever there's a roomier day. No rush." },
  completed: { label: 'Done', note: 'Completed.' },
  rest: { label: 'Rest', note: 'A day for church, rest, and family rhythm.' },
};
const homeschoolMethodOptions = [
  'Charlotte Mason',
  { value: 'Orthodox Classical', label: 'Classical' },
  'Traditional',
  'Eclectic',
  'Unsure',
];
const subjectTypeOptions = [
  { value: 'morning-time', label: 'Morning Time' },
  { value: 'catechesis', label: 'Catechesis' },
  { value: 'enrichment-recitation', label: 'Enrichment & Recitation' },
  { value: 'tales', label: 'Tales' },
  { value: 'literature', label: 'Literature' },
  { value: 'language-arts', label: 'Language Arts' },
  { value: 'classical-foreign-languages', label: 'Classical & Foreign Languages' },
  { value: 'history', label: 'History' },
  { value: 'geography', label: 'Geography' },
  { value: 'math', label: 'Math' },
  { value: 'sciences-nature', label: 'Sciences & Nature' },
  { value: 'science', label: 'Science' },
  { value: 'social-studies', label: 'Social Studies' },
  { value: 'fine-arts', label: 'Fine Arts' },
  { value: 'health-education', label: 'Health Education' },
  { value: 'physical-education', label: 'Physical Education (PE)' },
  { value: 'technology-applications', label: 'Technology Applications' },
  { value: 'languages-other-than-english', label: 'Languages Other Than English (LOTE)' },
  { value: 'career-technical-education', label: 'Career and Technical Education (CTE)' },
  { value: 'speech-communication', label: 'Speech/Communication' },
  { value: 'custom', label: 'Custom' },
];
const schedulingModeOptions = [
  { value: 'fixed', label: 'Fixed days' },
  { value: 'weekly-target', label: 'Weekly target' },
  { value: 'term-target', label: 'Term target' },
  { value: 'loop', label: 'Loop schedule' },
  { value: 'date-range', label: 'Date range' },
];
const lessonPriorityOptions = [
  { value: 'essential', label: 'Essential' },
  { value: 'important', label: 'Important' },
  { value: 'enrichment', label: 'Enrichment' },
  { value: 'optional', label: 'Optional' },
];
const instructionModeOptions = [
  { value: 'parent-led', label: 'Parent-led' },
  { value: 'independent', label: 'Independent' },
  { value: 'shared', label: 'Shared / together' },
];
const setupWeekdays = [
  { value: 'sun', label: 'Sun' },
  { value: 'mon', label: 'Mon' },
  { value: 'tue', label: 'Tue' },
  { value: 'wed', label: 'Wed' },
  { value: 'thu', label: 'Thu' },
  { value: 'fri', label: 'Fri' },
  { value: 'sat', label: 'Sat' },
];
const sourceTypeOptions = [
  { value: 'book', label: 'Book - show on Books page' },
  { value: 'curriculum', label: 'Curriculum / lesson plan' },
  { value: 'website', label: 'Website / online source' },
  { value: 'hymn', label: 'Hymn / chant' },
  { value: 'icon', label: 'Icon / picture study' },
  { value: 'activity', label: 'Activity / hands-on' },
  { value: 'none', label: 'Not a book' },
];
const SIMPLE_SETUP_STEPS = ['Household', 'Rhythm', 'Forms or Grades', 'Children', 'Grace Mode', 'Starter Week'];
mount().catch((error) => {
  root.replaceChildren();
  const section = document.createElement('section');
  section.style.cssText = 'padding:32px;font-family:Georgia,serif;color:#6e2f2a;';
  const heading = document.createElement('strong');
  heading.textContent = 'Unable to load AGAPAY Learn';
  const message = document.createElement('p');
  message.textContent = error.message || 'Please refresh and try again.';
  section.append(heading, message);
  root.append(section);
});
document.addEventListener('click', async (event) => {
  const feedbackOpen = event.target.closest('[data-learn-feedback-open]');
  if (feedbackOpen) {
    event.preventDefault();
    showLearnFeedbackDialog();
    return;
  }
  const accountToggle = event.target.closest('[data-learn-account-toggle]');
  const accountMenu = event.target.closest('[data-learn-account-menu]');
  if (accountToggle) {
    const menu = accountToggle.closest('[data-learn-account-menu]');
    const dropdown = menu?.querySelector('.learn-account-dropdown');
    const open2 = accountToggle.getAttribute('aria-expanded') !== 'true';
    document
      .querySelectorAll('[data-learn-account-toggle]')
      .forEach((button) => button.setAttribute('aria-expanded', 'false'));
    document.querySelectorAll('.learn-account-dropdown').forEach((panel2) => {
      panel2.hidden = true;
    });
    accountToggle.setAttribute('aria-expanded', String(open2));
    if (dropdown) dropdown.hidden = !open2;
    return;
  }
  if (!accountMenu) {
    document
      .querySelectorAll('[data-learn-account-toggle]')
      .forEach((button) => button.setAttribute('aria-expanded', 'false'));
    document.querySelectorAll('.learn-account-dropdown').forEach((panel2) => {
      panel2.hidden = true;
    });
  }
  if (event.target.closest('[data-learn-logout]')) {
    localStorage.removeItem('agapayDonorToken');
    localStorage.removeItem('agapayDonorProfile');
    localStorage.removeItem('agapayDonorEmail');
    localStorage.removeItem('agapay.learn.plan');
    window.location.href = isOdysseyLearnContext() ? '/learn/odyssey/dashboard/login' : '/myagapay/login';
    return;
  }
  const googleSyncButton = event.target.closest('[data-learn-google-sync]');
  if (googleSyncButton) {
    event.preventDefault();
    if (googleSyncButton.disabled) return;
    const originalHtml = googleSyncButton.innerHTML;
    googleSyncButton.disabled = true;
    googleSyncButton.setAttribute('aria-busy', 'true');
    try {
      const returnTo = window.location.pathname + window.location.search;
      const result = await apiGet(
        `/api/learn/google-calendar/connect?format=json&returnTo=${encodeURIComponent(returnTo)}`
      );
      if (!result.authUrl) throw new Error('Google Calendar did not return an authorization URL.');
      window.location.assign(result.authUrl);
    } catch (error) {
      googleSyncButton.disabled = false;
      googleSyncButton.removeAttribute('aria-busy');
      googleSyncButton.innerHTML = originalHtml;
      showLearnDialog(
        'Google Calendar Connection Failed',
        error?.message || 'AGAPAY could not begin the Google Calendar connection.'
      );
    }
    return;
  }
  const progressTarget = event.target.closest('[data-setup-progress-target]');
  if (progressTarget) {
    const target = document.getElementById(progressTarget.dataset.setupProgressTarget);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      target.classList.add('learn-setup-focus');
      window.setTimeout(() => target.classList.remove('learn-setup-focus'), 1500);
    }
    return;
  }
  const toggle = event.target.closest('[data-learn-menu-toggle]');
  const scrim = event.target.closest('[data-learn-sidebar-scrim]');
  const navLink = event.target.closest('.learn-product-nav a');
  if (!toggle && !scrim && !navLink) return;
  const open = toggle ? !document.body.classList.contains('learn-menu-open') : false;
  document.body.classList.toggle('learn-menu-open', open);
  document.querySelector('[data-learn-menu-toggle]')?.setAttribute('aria-expanded', String(open));
});
document.addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-learn-feedback-form]');
  if (!form) return;
  event.preventDefault();
  const submit = form.querySelector('button[type="submit"]');
  const status = form.querySelector('[data-learn-feedback-status]');
  const subject = form.elements.subject?.value?.trim() || '';
  const message = form.elements.message?.value?.trim() || '';
  if (!message || message.length < 8) {
    if (status) status.textContent = 'Please add a little more detail before sending.';
    return;
  }
  if (submit) {
    submit.disabled = true;
    submit.textContent = 'Sending...';
  }
  if (status) status.textContent = 'Sending your suggestion...';
  try {
    await apiPost('/api/learn/feedback', {
      subject,
      message,
      page: pageKey,
      path: window.location.pathname + window.location.search,
      familyName: document.querySelector('.learn-product-profile strong')?.textContent || '',
      userAgent: navigator.userAgent || '',
    });
    if (status) status.textContent = 'Thank you. Your suggestion is now in the AGAPAY Learn admin queue.';
    form.querySelector('textarea')?.setAttribute('readonly', 'readonly');
    window.setTimeout(() => document.querySelector('[data-learn-dialog]')?.remove(), 1800);
  } catch (error) {
    if (status) status.textContent = error.message || 'Unable to send your suggestion right now.';
    if (submit) {
      submit.disabled = false;
      submit.textContent = 'Send suggestion';
    }
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  document.body.classList.remove('learn-menu-open');
  document.querySelector('[data-learn-menu-toggle]')?.setAttribute('aria-expanded', 'false');
  document
    .querySelectorAll('[data-learn-account-toggle]')
    .forEach((button) => button.setAttribute('aria-expanded', 'false'));
  document.querySelectorAll('.learn-account-dropdown').forEach((panel2) => {
    panel2.hidden = true;
  });
});
