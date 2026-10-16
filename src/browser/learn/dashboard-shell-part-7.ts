import type {
  LearnShellNode,
  LearnShellOptions,
  LearnShellSimpleDraft,
  LearnCommunityVm,
  LearnSetupVm,
} from './dashboard-shell-contracts.js';
import type { LearnShellBindings } from './dashboard-shell.js';

declare const setupTileValue: LearnShellBindings['setupTileValue'];
declare const setupSectionCard: LearnShellBindings['setupSectionCard'];
declare const setupSectionPanel: LearnShellBindings['setupSectionPanel'];
declare const SIMPLE_SETUP_STEPS: LearnShellBindings['SIMPLE_SETUP_STEPS'];
declare const isLearnFamilyPlan: LearnShellBindings['isLearnFamilyPlan'];
declare const shell: LearnShellBindings['shell'];
declare const safeExternalUrl: LearnShellBindings['safeExternalUrl'];
declare const isOdysseyLearnContext: LearnShellBindings['isOdysseyLearnContext'];
declare const html: LearnShellBindings['html'];
declare const learnExperience: LearnShellBindings['learnExperience'];
declare const emptyState: LearnShellBindings['emptyState'];
declare const panel: LearnShellBindings['panel'];
declare const subjectSetupRow: LearnShellBindings['subjectSetupRow'];
declare const formOptions: LearnShellBindings['formOptions'];
declare const learnSectionHref: LearnShellBindings['learnSectionHref'];

function formSubjectsSetupPanel(vm: LearnSetupVm, currentTermId: string) {
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
    .flatMap((set: (typeof groupSets)[number]) => set.groups)
    .map((group) => setupTileValue(vm, 'subjects', group.panel, group));
  const subjectsForGroup = (group: (typeof groups)[number]) =>
    subjects.filter((subject) => group.types.includes(subject.subjectType || subject.type || 'language-arts'));
  const renderGroupSet = (set: (typeof groupSets)[number]) => {
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
          teksUrl: (group as { teksUrl?: string }).teksUrl || '',
          content,
        });
      })
      .join('')}`;
}

function setupStepTarget(step: LearnShellNode) {
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

function setupStepState(step: LearnShellNode) {
  const status = String(step.status || '').toLowerCase();
  if (['complete', 'completed', 'done'].includes(status)) return 'is-complete';
  if (status === 'active') return 'is-active';
  return 'is-needed';
}

function setupProgressCard(step: LearnShellNode) {
  return `<button type="button" class="learn-setup-step ${setupStepState(step)}" data-setup-progress-target="${setupStepTarget(step)}"><small>${html(step.status)}</small><strong>${html(step.title)}</strong><span>${html(step.summary)}</span></button>`;
}

function setupPanelCollapsed(panelId: string, defaultCollapsed: boolean = false) {
  try {
    const saved = localStorage.getItem(`agapay.learn.setupPanel.${panelId}`);
    if (saved === 'collapsed') return true;
    if (saved === 'expanded') return false;
  } catch {
    // Local storage is only a convenience for setup layout preferences.
  }
  return defaultCollapsed;
}

function collapsibleSetupPanel(panelId: string, title: string, content: string, options: LearnShellOptions = {}) {
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
    const profile = JSON.parse(localStorage.getItem('agapayDonorProfile') || '{}') as { email?: string };
    identity = profile.email || identity;
  } catch {
    // A malformed cached profile should not block local wizard progress.
  }
  return `agapay.learn.simpleSetup.v1:${String(identity)
    .toLowerCase()
    .replace(/[^a-z0-9@._-]/g, '')}`;
}

function suggestedFormForChild(child: LearnShellNode = {}) {
  const age = Number.parseInt(child.ageYears as string, 10);
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

function defaultSimpleSetupDraft(vm: Partial<LearnSetupVm> = {}) {
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

function loadSimpleSetupDraft(vm: LearnSetupVm) {
  const fallback = defaultSimpleSetupDraft(vm);
  try {
    const stored = JSON.parse(
      localStorage.getItem(simpleSetupDraftKey()) || 'null'
    ) as Partial<LearnShellSimpleDraft> | null;
    if (!stored || typeof stored !== 'object') return fallback;
    return {
      ...fallback,
      ...stored,
      step: Math.max(0, Math.min(SIMPLE_SETUP_STEPS.length - 1, Number(stored.step) || 0)),
      children:
        Array.isArray(stored.children) && stored.children.length
          ? stored.children.map((child: LearnShellNode, index: number) => ({
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

function saveSimpleSetupDraft(draft: LearnShellSimpleDraft) {
  localStorage.setItem(simpleSetupDraftKey(), JSON.stringify(draft));
}

function simpleSetupField(label: string, name: string, value: unknown = '', options: LearnShellOptions = {}) {
  const type = options.type || 'text';
  const placeholder = options.placeholder ? ` placeholder="${html(options.placeholder)}"` : '';
  const min = options.min !== undefined ? ` min="${html(options.min)}"` : '';
  const max = options.max !== undefined ? ` max="${html(options.max)}"` : '';
  return `<label class="learn-wizard-field"><span>${html(label)}</span><input name="${html(name)}" type="${html(type)}" value="${html(value)}"${placeholder}${min}${max}></label>`;
}

function simpleSetupStepBody(draft: LearnShellSimpleDraft) {
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

function renderSimpleSetupWizard(vm: LearnSetupVm, draft: LearnShellSimpleDraft) {
  const body = `<section class="learn-wizard" data-simple-setup-wizard data-wizard-step="${draft.step}">
    <div class="learn-wizard-topline"><div><span>Simple Setup</span><strong>Step ${draft.step + 1} of ${SIMPLE_SETUP_STEPS.length}</strong></div><a href="${html(learnSectionHref('onboarding', 'advanced=1'))}" data-wizard-advanced>Advanced Setup</a></div>
    <div class="learn-wizard-progress" aria-label="Setup progress">${SIMPLE_SETUP_STEPS.map((label, index) => `<span class="${index < draft.step ? 'is-complete' : index === draft.step ? 'is-current' : ''}"><i>${index < draft.step ? '✓' : index + 1}</i><em>${html(label)}</em></span>`).join('')}</div>
    <form class="learn-wizard-card">${simpleSetupStepBody(draft)}<p class="learn-wizard-status" data-wizard-status aria-live="polite"></p><div class="learn-wizard-actions">${draft.step ? `<button type="button" class="learn-wizard-secondary" data-wizard-back>Back</button>` : `<a class="learn-wizard-secondary" href="${html(learnSectionHref('onboarding', 'advanced=1'))}" data-wizard-advanced>Skip to full setup</a>`}<button type="submit" class="learn-wizard-primary" ${draft.step === SIMPLE_SETUP_STEPS.length - 1 ? 'data-wizard-finish' : 'data-wizard-next'}>${draft.step === SIMPLE_SETUP_STEPS.length - 1 ? 'Save & open Today' : 'Continue'}</button></div></form>
    <p class="learn-wizard-draft-note">Your progress is saved on this device until setup is complete.</p>
  </section>`;
  return shell(vm, body);
}

function renderTefaCommunity(vm: LearnCommunityVm) {
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
export type LearnShell2Part6 = {
  formSubjectsSetupPanel: typeof formSubjectsSetupPanel;
  setupStepTarget: typeof setupStepTarget;
  setupStepState: typeof setupStepState;
  setupProgressCard: typeof setupProgressCard;
  setupPanelCollapsed: typeof setupPanelCollapsed;
  collapsibleSetupPanel: typeof collapsibleSetupPanel;
  simpleSetupDraftKey: typeof simpleSetupDraftKey;
  suggestedFormForChild: typeof suggestedFormForChild;
  defaultSimpleSetupDraft: typeof defaultSimpleSetupDraft;
  loadSimpleSetupDraft: typeof loadSimpleSetupDraft;
  saveSimpleSetupDraft: typeof saveSimpleSetupDraft;
  simpleSetupField: typeof simpleSetupField;
  simpleSetupStepBody: typeof simpleSetupStepBody;
  renderSimpleSetupWizard: typeof renderSimpleSetupWizard;
  renderTefaCommunity: typeof renderTefaCommunity;
};
