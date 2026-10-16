import type { LearnTruthyFilter, LearnShellNode } from './dashboard-shell-contracts.js';
import type { LearnShellBindings } from './dashboard-shell-setup-calendar.js';

declare const DEFAULT_TERM_WEEK_COUNT: LearnShellBindings['DEFAULT_TERM_WEEK_COUNT'];
declare const selectedTermWeeks: LearnShellBindings['selectedTermWeeks'];
declare const termWeekSummaryFromSelected: LearnShellBindings['termWeekSummaryFromSelected'];
declare const html: LearnShellBindings['html'];
declare const setupGroupOptions: LearnShellBindings['setupGroupOptions'];
declare const activeSetupGroupLabels: LearnShellBindings['activeSetupGroupLabels'];
declare const primaryResourceGroupLabel: LearnShellBindings['primaryResourceGroupLabel'];
declare const colorChoices: LearnShellBindings['colorChoices'];
declare const setupSelect: LearnShellBindings['setupSelect'];
declare const formOptions: LearnShellBindings['formOptions'];
declare const setupInput: LearnShellBindings['setupInput'];
declare const setupRemoveButton: LearnShellBindings['setupRemoveButton'];
declare const simpleScheduleOptions: LearnShellBindings['simpleScheduleOptions'];
declare const setupTermOptions: LearnShellBindings['setupTermOptions'];
declare const missedLessonOptions: LearnShellBindings['missedLessonOptions'];
declare const setupGraceModeBehavior: LearnShellBindings['setupGraceModeBehavior'];
declare const planningModeOptions: LearnShellBindings['planningModeOptions'];
declare const weeklyFrequencyOptions: LearnShellBindings['weeklyFrequencyOptions'];
declare const setupTermWeekPicker: LearnShellBindings['setupTermWeekPicker'];
declare const learnExperience: LearnShellBindings['learnExperience'];

function resourceFieldName(index: number, field: string) {
  return `resources.${index}.${field}`;
}

function setupResourceWeekPicker(
  index: number,
  scheduledWeeks: unknown = [],
  totalWeeks: number = DEFAULT_TERM_WEEK_COUNT
) {
  const selected = selectedTermWeeks(scheduledWeeks, totalWeeks);
  const summary = termWeekSummaryFromSelected(selected, totalWeeks);
  const name = resourceFieldName(index, 'scheduledWeeks');
  return `<details class="learn-day-picker learn-term-week-picker learn-resource-week-picker" data-resource-week-picker="${index}"><summary><span>Active weeks</span><strong data-term-week-summary>${html(summary)}</strong></summary><div class="learn-day-picker-menu" style="grid-template-columns:repeat(4,minmax(54px,1fr));">${Array.from(
    { length: totalWeeks },
    (_, i) => i + 1
  )
    .map(
      (week) =>
        `<label><input type="checkbox" data-term-week-choice value="${week}" ${selected.includes(week) ? 'checked' : ''}>W${week}</label>`
    )
    .join(
      ''
    )}</div><div style="display:flex;gap:8px;padding:8px 10px 2px;"><button type="button" data-term-weeks-all class="learn-add-button" style="padding:6px 10px;">All</button><button type="button" data-term-weeks-odd class="learn-add-button" style="padding:6px 10px;">Odd</button><button type="button" data-term-weeks-even class="learn-add-button" style="padding:6px 10px;">Even</button></div><input type="hidden" data-resource-field="scheduledWeeks" name="${html(name)}" value="${html(selected.join(','))}"></details>`;
}

function setupResourceWeeklyPlanFields(index: number, value: unknown = []) {
  const entries = Array.isArray(value) ? value : String(value || '').split('|');
  return `<div class="learn-weekly-plan-grid">${Array.from({ length: DEFAULT_TERM_WEEK_COUNT }, (_, weekIndex) => `<label>Week ${weekIndex + 1}<input type="text" data-resource-field="weeklyPlans.${weekIndex + 1}" name="${html(resourceFieldName(index, `weeklyPlans.${weekIndex + 1}`))}" value="${html(entries[weekIndex] || '')}" placeholder="Ch. 1, pp. 4-9, lesson 2..." /></label>`).join('')}</div>`;
}

function setupResourcePlanningModePicker(
  index: number,
  item: LearnShellNode = {},
  children: LearnShellNode[] = [],
  groupingMode: string = 'forms'
) {
  const label = groupingMode === 'grades' ? 'Grades / levels' : 'Forms';
  const groupOptions = setupGroupOptions(children, groupingMode);
  const selected = Array.isArray(item.formLabels)
    ? item.formLabels
    : String(item.formLabels || item.formLabel || '').split(',');
  const selectedGroups = [
    ...new Set(selected.map((value) => String(value || '').trim()).filter(Boolean as unknown as LearnTruthyFilter)),
  ];
  const familyBased = (item.planningMode || 'forms') !== 'forms' || !selectedGroups.length;
  const summary = familyBased
    ? 'Family-Based'
    : `${groupingMode === 'grades' ? 'Grade-Based' : 'Forms-Based'}: ${selectedGroups.join(', ')}`;
  return `<details class="learn-day-picker learn-planning-mode-picker" data-planning-group-label="${html(groupingMode === 'grades' ? 'Grade-Based' : 'Forms-Based')}"><summary><span>${html(label)}</span><strong data-planning-mode-summary>${html(summary)}</strong></summary><div class="learn-day-picker-menu">${groupOptions.map((option) => `<label><input type="checkbox" data-planning-form-choice value="${html(option)}" ${selectedGroups.includes(option) ? 'checked' : ''}>${html(option)}</label>`).join('')}</div><input type="hidden" data-planning-mode-field data-resource-field="planningMode" name="${html(resourceFieldName(index, 'planningMode'))}" value="${familyBased ? 'family' : 'forms'}"><input type="hidden" data-form-label-field data-resource-field="formLabel" name="${html(resourceFieldName(index, 'formLabel'))}" value="${html(selectedGroups[0] || '')}"><input type="hidden" data-form-labels-field data-resource-field="formLabels" name="${html(resourceFieldName(index, 'formLabels'))}" value="${html(selectedGroups.join(','))}"><input type="hidden" data-grade-label-field data-resource-field="gradeLabel" name="${html(resourceFieldName(index, 'gradeLabel'))}" value="${html(groupingMode === 'grades' ? selectedGroups[0] || '' : item.gradeLabel || '')}"></details>`;
}

function setupResourceChildPicker(
  index: number,
  children: LearnShellNode[] = [],
  selectedIds: (string | undefined)[] = []
) {
  const selected = Array.isArray(selectedIds)
    ? selectedIds
    : String(selectedIds || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean as unknown as LearnTruthyFilter);
  const summary = selected.length
    ? children
        .filter((child) => selected.includes(child.id))
        .map((child) => child.name || child.firstName || child.id)
        .join(', ')
    : 'Use Forms';
  return `<details class="learn-day-picker learn-child-multi-picker"><summary><span>Specific children</span><strong data-child-multi-summary>${html(summary)}</strong></summary><div class="learn-day-picker-menu">${children.map((child) => `<label><input type="checkbox" data-child-multi-choice value="${html(child.id)}" ${selected.includes(child.id) ? 'checked' : ''}>${html(child.name || child.firstName || child.id)}</label>`).join('')}</div><input type="hidden" data-child-ids-field data-resource-field="childIds" name="${html(resourceFieldName(index, 'childIds'))}" value="${html(selected.join(','))}"></details>`;
}

function setupResourcePlanningCard(
  index: number,
  resource: LearnShellNode = {},
  children: LearnShellNode[] = [],
  groupingMode: string = 'forms'
) {
  return `<details class="learn-weekly-plan-fields learn-resource-plan-fields"><summary><span>Weekly chapters / lessons / pages</span><strong>${html(termWeekSummaryFromSelected(selectedTermWeeks(resource.scheduledWeeks || [])))}</strong></summary><div class="learn-resource-plan-controls">${setupResourceWeekPicker(index, resource.scheduledWeeks || [])}${setupResourcePlanningModePicker(index, resource, children, groupingMode)}${setupResourceChildPicker(index, children, resource.childIds || [])}</div>${setupResourceWeeklyPlanFields(index, resource.weeklyPlans || [])}</details>`;
}

function normalizeSetupResource(resource: LearnShellNode, subject: LearnShellNode = {}) {
  const raw = typeof resource === 'string' ? { title: resource } : resource || {};
  return {
    title: String(raw.title || raw.resource || ''),
    scheduledWeeks: raw.scheduledWeeks || [],
    weeklyPlans: raw.weeklyPlans || subject.weeklyPlans || [],
    planningMode: raw.planningMode || subject.planningMode || 'forms',
    formLabel: raw.formLabel || subject.formLabel || '',
    formLabels:
      Array.isArray(raw.formLabels) && raw.formLabels.length
        ? raw.formLabels
        : Array.isArray(subject.formLabels)
          ? subject.formLabels
          : [],
    gradeLabel: raw.gradeLabel || subject.gradeLabel || '',
    childIds:
      Array.isArray(raw.childIds) && raw.childIds.length
        ? raw.childIds
        : Array.isArray(subject.childIds)
          ? subject.childIds
          : [],
  };
}

function setupResourceRow(
  resource: LearnShellNode = {},
  index: number = 0,
  children: LearnShellNode[] = [],
  groupingMode: string = 'forms'
) {
  const resolved = String(resource.title || '').trim();
  const link = /^https?:\/\//i.test(resolved)
    ? `<a href="${html(resolved)}" target="_blank" rel="noopener noreferrer" class="learn-source-link">Open</a>`
    : '';
  const summary = termWeekSummaryFromSelected(selectedTermWeeks(resource.scheduledWeeks || []));
  return `<div data-resource-row="${index}" class="learn-resource-card" draggable="true" title="Drag this resource to another subject tile">
    <div class="learn-resource-card-summary">
      <small>${html(index === 0 ? 'Book / source / resource' : `Resource ${index + 1}`)}</small>
      <strong data-resource-summary-title>${html(resolved || 'Untitled resource')}</strong>
      <span data-resource-summary-detail>${html(summary)}</span>
      ${link}
    </div>
    <div class="learn-resource-card-actions"><button type="button" data-edit-resource>Edit</button><button type="button" data-remove-resource aria-label="Remove resource">Remove</button></div>
    <div class="learn-resource-modal" data-resource-modal hidden>
      <div class="learn-resource-modal-card">
        <button type="button" class="learn-family-modal-close" data-resource-modal-close aria-label="Close">×</button>
        <small>${html(index === 0 ? 'Book / source / resource' : `Resource ${index + 1}`)}</small>
        <h2>Resource details</h2>
        <label>Title, source note, or URL<input type="text" data-resource-field="title" name="${html(resourceFieldName(index, 'title'))}" value="${html(resolved)}" inputmode="url" placeholder="Book title, source note, or https://..." /></label>
        <div class="learn-resource-card-plan">${setupResourcePlanningCard(index, resource, children, groupingMode)}</div>
        <div class="learn-family-modal-actions"><button type="button" data-resource-modal-close>Cancel</button><button type="button" data-resource-modal-save>Save resource</button></div>
      </div>
    </div>
  </div>`;
}

function setupResourceLane(label: string, rows: string[] = [], index: number = 0, groupingMode: string = 'forms') {
  const laneLabel = label || 'Family-Based';
  const resourceLabel = rows.length === 1 ? 'resource' : 'resources';
  const addLabel = label ? `+ Add ${laneLabel} resource` : '+ Add family resource';
  return `<section class="learn-resource-form-lane" data-resource-lane="${html(label || '__family')}">
    <header><span>${html(laneLabel)}</span><strong>${rows.length} ${resourceLabel}</strong></header>
    <div class="learn-resource-form-lane-body">${rows.join('')}<button type="button" data-add-resource data-resource-form-label="${html(label)}" data-resource-grouping-mode="${html(groupingMode)}">${html(addLabel)}</button></div>
  </section>`;
}

function setupResourceList(
  resources: LearnShellNode[] = [],
  children: LearnShellNode[] = [],
  groupingMode: string = 'forms',
  subject: LearnShellNode = {}
) {
  // resources: array of {title, scheduledWeeks} objects, or plain strings (legacy)
  const entries =
    Array.isArray(resources) && resources.length
      ? resources
      : groupingMode === 'forms'
        ? []
        : [{ title: '', scheduledWeeks: [] }];
  const normalised = entries.map((entry: LearnShellNode) => normalizeSetupResource(entry, subject));
  if (groupingMode === 'forms') {
    const groupLabels = activeSetupGroupLabels(children, groupingMode, normalised);
    const lanes = new Map<string, string[]>([['', []], ...groupLabels.map((label): [string, string[]] => [label, []])]);
    normalised.forEach((resource, index) => {
      const label = primaryResourceGroupLabel(resource, groupingMode);
      if (!lanes.has(label)) lanes.set(label, []);
      lanes.get(label)!.push(setupResourceRow(resource, index, children, groupingMode));
    });
    const renderedLanes = [...lanes.entries()]
      .map(([label, rows], index) => setupResourceLane(label, rows, index, groupingMode))
      .join('');
    return `<div data-resource-list class="learn-resource-list learn-resource-list-by-form">${renderedLanes}</div>`;
  }
  const rows = normalised.map((resource, index) => setupResourceRow(resource, index, children, groupingMode)).join('');
  return `<div data-resource-list class="learn-resource-list">${rows}<button type="button" data-add-resource>+ Add resource</button></div>`;
}

function setupPlanningModePicker(
  item: LearnShellNode = {},
  children: LearnShellNode[] = [],
  groupingMode: string = 'forms'
) {
  const label = groupingMode === 'grades' ? 'Grades / levels' : 'Forms';
  const groupOptions = setupGroupOptions(children, groupingMode);
  const selected = Array.isArray(item.formLabels)
    ? item.formLabels
    : String(item.formLabels || item.formLabel || '').split(',');
  const selectedGroups = [
    ...new Set(selected.map((value) => String(value || '').trim()).filter(Boolean as unknown as LearnTruthyFilter)),
  ];
  const familyBased = (item.planningMode || 'family') !== 'forms' || !selectedGroups.length;
  const summary = familyBased
    ? 'Family-Based'
    : `${groupingMode === 'grades' ? 'Grade-Based' : 'Forms-Based'}: ${selectedGroups.join(', ')}`;
  return `<details class="learn-day-picker learn-planning-mode-picker" data-planning-group-label="${html(groupingMode === 'grades' ? 'Grade-Based' : 'Forms-Based')}"><summary><span>Planning Mode</span><strong data-planning-mode-summary>${html(summary)}</strong></summary><div class="learn-day-picker-menu">${groupOptions.map((option) => `<label><input type="checkbox" data-planning-form-choice value="${html(option)}" ${selectedGroups.includes(option) ? 'checked' : ''}>${html(option)}</label>`).join('')}</div><input type="hidden" name="planningMode" value="${familyBased ? 'family' : 'forms'}"><input type="hidden" name="formLabel" value="${html(selectedGroups[0] || '')}"><input type="hidden" name="formLabels" value="${html(selectedGroups.join(','))}"><input type="hidden" name="gradeLabel" value="${html(groupingMode === 'grades' ? selectedGroups[0] || '' : item.gradeLabel || '')}"></details>`;
}

function setupColorSelect(label: string, name: string, value: unknown = colorChoices[0]) {
  const resolved = /^#[0-9a-f]{6}$/i.test(String(value || '')) ? value : colorChoices[0];
  return `<label class="learn-color-field" style="display:grid;gap:5px;color:var(--gold);font-size:12px;letter-spacing:.12em;text-transform:uppercase;">${html(label)}<span style="display:flex;gap:8px;align-items:center;"><input name="${html(name)}" type="color" value="${html(resolved)}" list="learnColorChoices" style="width:44px;height:40px;flex:0 0 auto;border:1px solid var(--line);border-radius:9px;padding:3px;background:var(--paper2);"><input name="${html(name)}Hex" type="text" value="${html(resolved)}" pattern="#[0-9A-Fa-f]{6}" style="min-width:0;flex:1;border:1px solid var(--line);border-radius:9px;padding:10px;background:var(--paper2);font-family:inherit;color:var(--ink);"><span data-color-preview style="width:34px;height:34px;border-radius:50%;background:${html(resolved)};border:1px solid var(--goldsoft);"></span></span><datalist id="learnColorChoices">${colorChoices.map((color) => `<option value="${html(color)}"></option>`).join('')}</datalist></label>`;
}

function setupChildColor(value: unknown = colorChoices[0]) {
  const resolved = /^#[0-9a-f]{6}$/i.test(String(value || '')) ? value : colorChoices[0];
  return `<label class="learn-child-color-field"><span>Color</span><input name="color" type="color" value="${html(resolved)}" list="learnColorChoices" aria-label="Planner color"><datalist id="learnColorChoices">${colorChoices.map((color) => `<option value="${html(color)}"></option>`).join('')}</datalist></label>`;
}

function childSetupRow(child: LearnShellNode = {}, groupingMode: string = 'forms') {
  const groupingField =
    groupingMode === 'forms'
      ? setupSelect('Form', 'formLabel', child.formLabel || child.form || '', formOptions)
      : `<input type="hidden" name="formLabel" value="${html(child.formLabel || child.form || '')}" />`;
  return `<div data-setup-row="children" data-id="${html(child.id || '')}" class="learn-family-row learn-child-row"><span class="learn-child-monogram" style="background:${html(child.color || colorChoices[0])};">${html((child.firstName || child.name || 'C').charAt(0))}</span>${setupInput('Child name', 'firstName', child.firstName || child.name || '')}${setupInput('Age', 'ageYears', child.age || '', { type: 'number' })}${setupInput('Grade / level', 'gradeLabel', child.gradeLabel || child.grade || '')}${groupingField}${setupChildColor(child.color || colorChoices[0])}${setupRemoveButton()}</div>`;
}

function subjectSetupRow(
  subject: LearnShellNode = {},
  children: LearnShellNode[] = [],
  terms: LearnShellNode[] = [],
  currentTermId: string = '',
  groupingMode: string = 'forms',
  tileMinutes: unknown = ''
) {
  const minutes = subject.minutes || tileMinutes || '20';
  return `<div data-setup-row="subjects" data-id="${html(subject.id || '')}" class="learn-setup-row learn-setup-row-subject"><div class="learn-setup-row-main"><div class="learn-setup-row-identity">${setupInput('Subject / skill', 'title', subject.title || '')}${setupSelect('Schedule type', 'weeklyFrequency', subject.weeklyFrequency === '1x' ? 'weekly' : subject.weeklyFrequency || subject.cadenceLabel || 'daily', simpleScheduleOptions)}${setupRemoveButton()}</div>${setupResourceList(subject.resources?.length ? subject.resources : subject.resource ? [{ title: subject.resource, scheduledWeeks: [] }] : [], children, groupingMode, subject)}<input type="hidden" name="minutes" value="${html(minutes)}" /><input type="hidden" name="subjectType" value="${html(subject.subjectType || subject.type || 'custom')}" /><input type="hidden" name="instructionMode" value="${html(subject.instructionMode || 'parent-led')}" /><input type="hidden" name="resourceType" value="${html(subject.resourceType || subject.sourceType || (subject.resource ? 'curriculum' : 'none'))}" /><input type="hidden" name="schedulingMode" value="fixed" /><input type="hidden" name="progressionType" value="${html(subject.progressionType || 'lessons')}" /><input type="hidden" name="priorityLevel" value="${html(subject.priorityLevel || 'important')}" /></div><div class="learn-setup-row-meta">${setupSelect('Term', 'termId', subject.termId || currentTermId, setupTermOptions(terms, { id: currentTermId, label: 'Current Term' }))}${setupSelect('If missed', 'missedLessonBehavior', subject.missedLessonBehavior || 'next-occurrence', missedLessonOptions)}${setupInput('Credits', 'credits', subject.credits || '', { type: 'number', step: '0.25' })}${setupInput('Final mark', 'finalGradeOverride', subject.finalGradeOverride || '')}${setupColorSelect('Planner Color', 'color', subject.color || colorChoices[0])}${setupGraceModeBehavior(subject.gracePriority || 'core')}<span class="learn-setup-grace-note">${setupInput('Grace Mode note', 'graceNote', subject.graceNote || 'Deferred gracefully to the reserve list.')}</span></div></div>`;
}

function bookSetupRow(book: LearnShellNode = {}, terms: LearnShellNode[] = [], currentTermId: string = '') {
  return `<div data-setup-row="books" data-id="${html(book.id || '')}" style="display:grid;grid-template-columns:1.1fr .9fr .7fr .75fr .55fr .55fr .55fr .75fr auto;gap:10px;align-items:end;border:1px solid var(--line);border-radius:12px;background:var(--paper2);padding:12px;">${setupInput('Title', 'title', book.title || '')}${setupInput('Author', 'author', book.author || '')}${setupInput('Category', 'category', book.category || '')}${setupSelect('Planning Mode', 'planningMode', book.planningMode || (book.formLabel ? 'forms' : 'family'), planningModeOptions)}${setupInput('Start Ch.', 'startChapter', book.startChapter || '', { type: 'number' })}${setupInput('Done Ch.', 'currentChapter', book.currentChapter || book.startChapter || '', { type: 'number' })}${setupInput('End Ch.', 'endChapter', book.endChapter || book.totalChapters || '', { type: 'number' })}${setupColorSelect('Planner Color', 'color', book.color || colorChoices[2])}${setupRemoveButton()}<div style="grid-column:1 / -1;display:grid;grid-template-columns:repeat(5,minmax(120px,1fr));gap:10px;">${setupSelect('Term', 'termId', book.termId || currentTermId, setupTermOptions(terms, { id: currentTermId, label: 'Current Term' }))}${setupSelect('Form', 'formLabel', book.formLabel || '', [{ value: '', label: 'All Forms' }, ...formOptions])}${setupSelect('Frequency', 'weeklyFrequency', book.weeklyFrequency || 'daily', weeklyFrequencyOptions)}${setupTermWeekPicker(book.scheduledWeeks)}${setupSelect('Audience', 'audienceLabel', book.audienceLabel || 'Household', ['Household', 'Morning Basket', 'Independent', 'Read-Aloud'])}${setupInput('Minutes', 'minutes', book.minutes || '20', { type: 'number' })}${setupInput('Grace Note', 'graceNote', book.graceNote || 'Reading moved into the reserve basket.')}</div></div>`;
}

function formationSetupRow(material: LearnShellNode = {}, terms: LearnShellNode[] = [], currentTermId: string = '') {
  return `<div data-setup-row="formationMaterials" data-id="${html(material.id || '')}" style="display:grid;grid-template-columns:1.1fr .75fr 1fr .75fr .65fr .75fr .8fr auto;gap:10px;align-items:end;border:1px solid var(--line);border-radius:12px;background:var(--paper2);padding:12px;">${setupInput('Material', 'title', material.title || '')}${setupSelect('Preset', 'materialType', material.materialType || 'Catechesis', ['Catechesis', 'Art Study', 'Poetry', 'Music Study'])}${setupInput('Source', 'source', material.source || '')}${setupSelect('Planning Mode', 'planningMode', material.planningMode || 'family', planningModeOptions)}${setupSelect('Frequency', 'weeklyFrequency', material.weeklyFrequency || material.cadence || '1x', weeklyFrequencyOptions)}${setupTermWeekPicker(material.scheduledWeeks)}${setupSelect('Term', 'termId', material.termId || currentTermId, setupTermOptions(terms, { id: currentTermId, label: 'Current Term' }))}${setupInput('Minutes', 'minutes', material.minutes || '', { type: 'number' })}${setupColorSelect('Term Color', 'color', material.color || colorChoices[3])}${setupRemoveButton()}</div>`;
}

function formationRhythmSetupRow(rhythm: LearnShellNode = {}) {
  return `<div data-setup-row="formationRhythms" data-id="${html(rhythm.id || '')}" style="display:grid;grid-template-columns:1fr 1.15fr .65fr .45fr auto;gap:10px;align-items:end;border:1px solid var(--line);border-radius:12px;background:var(--paper2);padding:12px;">${setupInput('Rhythm', 'title', rhythm.title || '')}${setupInput('Note', 'note', rhythm.note || '')}${setupSelect('Frequency', 'weeklyFrequency', rhythm.weeklyFrequency || rhythm.cadenceLabel || rhythm.cadence || 'daily', weeklyFrequencyOptions)}${setupInput('Minutes', 'minutes', rhythm.minutes || rhythm.minutesPlanned || '', { type: 'number' })}${setupRemoveButton()}</div>`;
}

function formationRecitationSetupRow(
  track: LearnShellNode = {},
  children: LearnShellNode[] = [],
  groupingMode: string = 'forms'
) {
  return `<div data-setup-row="formationRecitation" data-id="${html(track.id || '')}" style="display:grid;grid-template-columns:1fr .85fr .95fr .65fr .85fr .55fr auto;gap:10px;align-items:end;border:1px solid var(--line);border-radius:12px;background:var(--paper2);padding:12px;">${setupInput('Memory Work', 'title', track.title || '')}${setupInput('Source', 'sourceKind', track.sourceKind || track.source || '')}${setupPlanningModePicker(track, children, groupingMode)}${setupSelect('Frequency', 'weeklyFrequency', track.weeklyFrequency || 'daily', weeklyFrequencyOptions)}${setupTermWeekPicker(track.scheduledWeeks)}${setupInput('Minutes', 'minutes', track.minutes || '', { type: 'number' })}${setupRemoveButton()}</div>`;
}

function formationEnrichmentSetupRow(
  block: LearnShellNode = {},
  children: LearnShellNode[] = [],
  terms: LearnShellNode[] = [],
  currentTermId: string = '',
  groupingMode: string = 'forms',
  tileMinutes: unknown = ''
) {
  const blockTypeOptions = learnExperience().tefaActive
    ? [
        'Recitation & Memory Work',
        'Art Study',
        'Music Study',
        'Folk Songs',
        'Poetry',
        'Shakespeare',
        'Nature Study',
        'Composer',
        'Timeline',
      ]
    : [
        'Catechesis',
        'Recitation & Memory Work',
        'Saints & Feasts',
        'Icon Study',
        'Hymn Study',
        'Art Study',
        'Music Study',
        'Folk Songs',
        'Poetry',
        'Shakespeare',
        'Nature Study',
        'Composer',
        'Timeline',
      ];
  const minutes = block.minutesPlanned || block.minutes || tileMinutes || '20';
  const resourceEntries =
    Array.isArray(block.resources) && block.resources.length
      ? block.resources
      : block.resource || block.source || block.title
        ? [
            {
              title: block.resource || block.source || block.title,
              scheduledWeeks: block.scheduledWeeks || [],
              weeklyPlans: block.weeklyPlans || [],
              planningMode: block.planningMode || 'forms',
              formLabel: block.formLabel || '',
              formLabels: block.formLabels || [],
              gradeLabel: block.gradeLabel || '',
              childIds: block.childIds || (block.childId ? [block.childId] : []),
            },
          ]
        : [];
  return `<div data-setup-row="formationEnrichment" data-id="${html(block.id || '')}" class="learn-setup-row learn-setup-row-enrichment"><div class="learn-setup-row-main"><div class="learn-setup-row-identity">${setupSelect('Formation card', 'blockType', block.blockType || block.type || 'Art Study', blockTypeOptions)}${setupSelect('Schedule type', 'weeklyFrequency', block.weeklyFrequency === '1x' ? 'weekly' : block.weeklyFrequency || block.cadenceLabel || block.cadence || 'weekly', simpleScheduleOptions)}${setupRemoveButton()}</div>${setupResourceList(resourceEntries, children, groupingMode, block)}<input type="hidden" name="minutesPlanned" value="${html(minutes)}" /><input type="hidden" name="instructionMode" value="${html(block.instructionMode || 'shared')}" /><input type="hidden" name="resourceType" value="${html(block.resourceType || block.sourceType || (resourceEntries.length ? 'curriculum' : 'none'))}" /><input type="hidden" name="schedulingMode" value="fixed" /><input type="hidden" name="progressionType" value="${html(block.progressionType || 'lessons')}" /><input type="hidden" name="priorityLevel" value="${html(block.priorityLevel || 'enrichment')}" /></div><div class="learn-setup-row-meta">${setupSelect('Term', 'termId', block.termId || currentTermId, setupTermOptions(terms, { id: currentTermId, label: 'Current Term' }))}${setupSelect('If missed', 'missedLessonBehavior', block.missedLessonBehavior || 'next-occurrence', missedLessonOptions)}${setupInput('Credits', 'credits', block.credits || '', { type: 'number', step: '0.25' })}${setupInput('Final mark', 'finalGradeOverride', block.finalGradeOverride || '')}${setupColorSelect('Planner Color', 'color', block.color || colorChoices[2])}${setupGraceModeBehavior(block.gracePriority || 'medium')}<span class="learn-setup-grace-note">${setupInput('Grace Mode note', 'graceNote', block.graceNote || 'Deferred gracefully to the reserve list.')}</span></div></div>`;
}
export type LearnShell0Part1 = {
  resourceFieldName: typeof resourceFieldName;
  setupResourceWeekPicker: typeof setupResourceWeekPicker;
  setupResourceWeeklyPlanFields: typeof setupResourceWeeklyPlanFields;
  setupResourcePlanningModePicker: typeof setupResourcePlanningModePicker;
  setupResourceChildPicker: typeof setupResourceChildPicker;
  setupResourcePlanningCard: typeof setupResourcePlanningCard;
  normalizeSetupResource: typeof normalizeSetupResource;
  setupResourceRow: typeof setupResourceRow;
  setupResourceLane: typeof setupResourceLane;
  setupResourceList: typeof setupResourceList;
  setupPlanningModePicker: typeof setupPlanningModePicker;
  setupColorSelect: typeof setupColorSelect;
  setupChildColor: typeof setupChildColor;
  childSetupRow: typeof childSetupRow;
  subjectSetupRow: typeof subjectSetupRow;
  bookSetupRow: typeof bookSetupRow;
  formationSetupRow: typeof formationSetupRow;
  formationRhythmSetupRow: typeof formationRhythmSetupRow;
  formationRecitationSetupRow: typeof formationRecitationSetupRow;
  formationEnrichmentSetupRow: typeof formationEnrichmentSetupRow;
};
