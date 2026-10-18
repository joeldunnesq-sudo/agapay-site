import type {
  LearnCommunityResource,
  LearnShellViewModel,
  LearnShellNode,
  LearnShellSimpleDraft,
  LearnShellError,
  LearnCommunityVm,
  LearnSetupVm,
} from './dashboard-shell-contracts.js';
import type { LearnShellBindings } from './dashboard-shell.js';
declare const learnNamedField: LearnShellBindings['learnNamedField'];

// Match Boolean filtering while exposing its non-null result to TypeScript.
function truthyLearn8<T>(value: T): value is NonNullable<T> {
  return Boolean(value);
}

declare const renderTefaCommunity: LearnShellBindings['renderTefaCommunity'];
declare const shell: LearnShellBindings['shell'];
declare const suggestedFormForChild: LearnShellBindings['suggestedFormForChild'];
declare const SIMPLE_SETUP_STEPS: LearnShellBindings['SIMPLE_SETUP_STEPS'];
declare const saveSimpleSetupDraft: LearnShellBindings['saveSimpleSetupDraft'];
declare const root: LearnShellBindings['root'];
declare const renderSimpleSetupWizard: LearnShellBindings['renderSimpleSetupWizard'];
declare const apiPost: LearnShellBindings['apiPost'];
declare const simpleSetupDraftKey: LearnShellBindings['simpleSetupDraftKey'];
declare const isLearnFamilyPlan: LearnShellBindings['isLearnFamilyPlan'];
declare const showLearnDialog: LearnShellBindings['showLearnDialog'];
declare const isOdysseyLearnContext: LearnShellBindings['isOdysseyLearnContext'];
declare const html: LearnShellBindings['html'];
declare const learnExperience: LearnShellBindings['learnExperience'];
declare const softColor: LearnShellBindings['softColor'];
declare const panel: LearnShellBindings['panel'];
declare const colorChoices: LearnShellBindings['colorChoices'];
declare const learnSectionHref: LearnShellBindings['learnSectionHref'];
declare const renderLearnRoot: LearnShellBindings['renderLearnRoot'];

function renderCommunity(vm: LearnCommunityVm) {
  if (learnExperience().tefaActive) return renderTefaCommunity(vm);
  const filterOptions = (values: string[]) =>
    values.map((value: unknown) => `<option value="${html(value)}">${html(value)}</option>`).join('');

  // ── Facebook / community CTA ──────────────────────────────────────────────────
  const facebookCta = vm.facebookGroupUrl
    ? `<a href="${html(vm.facebookGroupUrl)}" target="_blank" rel="noopener noreferrer"
         style="display:inline-flex;align-items:center;gap:9px;background:var(--navy);color:#fffaf0;border:1.5px solid var(--gold);border-radius:11px;padding:12px 20px;text-decoration:none;font-weight:800;font-size:14px;">
         Join the Facebook Group <span style="color:var(--gold);">↗</span>
       </a>`
    : `<span style="display:inline-flex;align-items:center;border:1px solid var(--line);background:var(--paper2);border-radius:999px;padding:7px 13px;color:var(--gold);font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">
         Facebook group opening soon
       </span>`;

  // ── Resource cards — scannable, type-forward ───────────────────────────────────
  const typeLabel = (resource: LearnCommunityResource) => {
    const parts = [resource.resourceType, resource.ageRange].filter(truthyLearn8);
    return parts.join(' · ');
  };

  const card = (resource: LearnCommunityResource) => `
    <article data-community-card
      data-category="${html(resource.category)}"
      data-resource-type="${html(resource.resourceType)}"
      data-media-type="${html(resource.mediaType)}"
      data-search="${html(`${resource.title} ${resource.category} ${resource.resourceType} ${resource.mediaType} ${resource.ageRange} ${resource.desc} ${resource.tags!.join(' ')}`.toLowerCase())}"
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

  // ── Pinned / curated cards separate from the grid ────────────────────────────
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

  // ── Guidance sidebar ──────────────────────────────────────────────────────────
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

  // ── This Day in History widget ────────────────────────────────────────────────
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

function renderReportsComingSoon(vm: LearnShellViewModel) {
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

function captureSimpleSetupStep(form: HTMLFormElement, draft: LearnShellSimpleDraft) {
  const value = (name: string) => learnNamedField(form, name)?.value?.trim() || '';
  if (draft.step === 0) {
    draft.householdName = value('wizard.householdName');
    draft.parentName = value('wizard.parentName');
    draft.calendarType = value('wizard.calendarType') || 'julian';
  } else if (draft.step === 1) {
    draft.method =
      (
        form.querySelector<HTMLElement>('[name="wizard.method"]:checked') as
          HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      )?.value || 'Unsure';
  } else if (draft.step === 2) {
    draft.useForms = Boolean(learnNamedField(form, 'wizard.useForms')?.checked);
    if (!draft.useForms)
      draft.children.forEach((child) => {
        child.formLabel = '';
      });
  } else if (draft.step === 3) {
    draft.children = [...form.querySelectorAll<HTMLElement>('[data-wizard-child]')].map((row, index) => ({
      clientId: row.dataset.clientId || `child_${Date.now()}_${index}`,
      id: draft.children[index]?.id || '',
      firstName:
        (
          row.querySelector<HTMLElement>('[name="firstName"]') as
            HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        )?.value.trim() || '',
      ageYears:
        (
          row.querySelector<HTMLElement>('[name="ageYears"]') as
            HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        )?.value.trim() || '',
      gradeLabel:
        (
          row.querySelector<HTMLElement>('[name="gradeLabel"]') as
            HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        )?.value.trim() || '',
      formLabel: draft.useForms
        ? (
            row.querySelector<HTMLElement>('[name="formLabel"]') as
              HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
          )?.value ||
          suggestedFormForChild({
            ageYears:
              (
                row.querySelector<HTMLElement>('[name="ageYears"]') as
                  HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
              )?.value.trim() || '',
            gradeLabel:
              (
                row.querySelector<HTMLElement>('[name="gradeLabel"]') as
                  HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
              )?.value.trim() || '',
          })
        : '',
    }));
  } else if (draft.step === SIMPLE_SETUP_STEPS.length - 1) {
    draft.starterWeek = Boolean(learnNamedField(form, 'wizard.starterWeek')?.checked);
  }
  saveSimpleSetupDraft(draft);
}

function validateSimpleSetupStep(draft: LearnShellSimpleDraft) {
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

function validateSimpleSetupMinimum(draft: LearnShellSimpleDraft) {
  if (!draft.householdName || !draft.parentName) return 'Please add the household name and your name.';
  const children = draft.children.filter((child) => child.firstName);
  if (!children.length) return 'Please add at least one child.';
  if (children.some((child) => !child.ageYears && !child.gradeLabel))
    return 'Add an age or grade for each child so Learn can suggest the right Form.';
  return '';
}

function simpleSetupDates() {
  const today = new Date();
  const academicStartYear = today.getMonth() >= 5 ? today.getFullYear() : today.getFullYear() - 1;
  const termEnd = new Date(today);
  termEnd.setDate(termEnd.getDate() + 84);
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  return {
    yearLabel: `${academicStartYear}-${academicStartYear + 1} School Year`,
    yearStart: iso(today),
    yearEnd: `${academicStartYear + 1}-06-30`,
    termStart: iso(today),
    termEnd: iso(termEnd),
  };
}

function simpleSetupPayload(draft: LearnShellSimpleDraft, existingSnapshot: LearnShellNode | null = null) {
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
  const starterAssignment = (groupLabel: string) =>
    draft.useForms ? { formLabel: groupLabel } : { gradeLabel: groupLabel };
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
          daysOfWeek:
            (subjectDays as unknown as Record<string, (typeof subjectDays)[keyof typeof subjectDays] | undefined>)[
              subject.weeklyFrequency
            ] || subjectDays['1x'],
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
      ? { enabled: true, generatedAt: new Date().toISOString() }
      : existingSnapshot?.starterWeek || null,
    coOp: existingSnapshot?.coOp || { enabled: false, status: 'coming-soon' },
  };
}

function applySimpleDraftToSetupVm(vm: LearnSetupVm, draft: LearnShellSimpleDraft) {
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

function wireSimpleSetupWizard(
  vm: LearnSetupVm,
  draft: LearnShellSimpleDraft,
  existingSnapshot: LearnShellNode | null = null
) {
  const form = root!.querySelector<HTMLFormElement>('[data-simple-setup-wizard] form');
  if (!form) return;
  const status = form.querySelector<HTMLElement>('[data-wizard-status]');
  const rerender = () => {
    renderLearnRoot(root, renderSimpleSetupWizard(vm, draft));
    wireSimpleSetupWizard(vm, draft, existingSnapshot);
    root!.querySelector<HTMLElement>('.learn-wizard')?.scrollIntoView({ block: 'start' });
  };
  form.addEventListener('input', (event) => {
    const childRow = (event.target as HTMLElement).closest<HTMLElement>('[data-wizard-child]');
    if (
      childRow &&
      draft.useForms &&
      ['ageYears', 'gradeLabel'].includes(
        (event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).name
      ) &&
      childRow.dataset.formManual !== 'true'
    ) {
      const formSelect = childRow.querySelector<HTMLSelectElement>('[data-wizard-form-select]');
      if (formSelect) {
        (formSelect as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value = suggestedFormForChild({
          ageYears:
            (
              childRow.querySelector<HTMLElement>('[name="ageYears"]') as
                HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
            )?.value || '',
          gradeLabel:
            (
              childRow.querySelector<HTMLElement>('[name="gradeLabel"]') as
                HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
            )?.value || '',
        });
      }
    }
    captureSimpleSetupStep(form, draft);
  });
  form.addEventListener('change', (event) => {
    if ((event.target as HTMLElement).matches('[data-wizard-form-select]'))
      (event.target as HTMLElement).closest<HTMLElement>('[data-wizard-child]')!.dataset.formManual = 'true';
    captureSimpleSetupStep(form, draft);
    if ((event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).name === 'wizard.useForms')
      rerender();
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    captureSimpleSetupStep(form, draft);
    const submit = event.submitter || form.querySelector<HTMLElement>('.learn-wizard-primary');
    if (submit?.hasAttribute('data-wizard-finish')) {
      const error = validateSimpleSetupMinimum(draft);
      if (error) {
        status!.textContent = error;
        return;
      }
      if (draft.useForms)
        draft.children.forEach((child) => {
          child.formLabel ||= suggestedFormForChild(child);
        });
      (submit as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled = true;
      status!.textContent = 'Preparing your AGAPAY Learn dashboard...';
      try {
        await apiPost('/api/learn/setup', simpleSetupPayload(draft, existingSnapshot));
        localStorage.setItem('agapay.learn.calendar', draft.calendarType || 'julian');
        localStorage.removeItem(simpleSetupDraftKey());
        window.location.href = learnSectionHref('dashboard');
      } catch (error) {
        status!.textContent = (error as LearnShellError).message;
        (submit as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled = false;
      }
      return;
    }
    const error = validateSimpleSetupStep(draft);
    if (error) {
      status!.textContent = error;
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
    const addChild = (event.target as HTMLElement).closest<HTMLElement>('[data-wizard-add-child]');
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
    const addChildren = (event.target as HTMLElement).closest<HTMLElement>('[data-wizard-add-children]');
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
    const removeChild = (event.target as HTMLElement).closest<HTMLElement>('[data-wizard-remove-child]');
    if (removeChild) {
      captureSimpleSetupStep(form, draft);
      draft.children.splice(Number(removeChild.dataset.wizardRemoveChild), 1);
      saveSimpleSetupDraft(draft);
      rerender();
      return;
    }
    if ((event.target as HTMLElement).closest<HTMLElement>('[data-wizard-back]')) {
      captureSimpleSetupStep(form, draft);
      draft.step = Math.max(0, draft.step - 1);
      saveSimpleSetupDraft(draft);
      rerender();
      return;
    }
    if ((event.target as HTMLElement).closest<HTMLElement>('[data-wizard-next], [data-wizard-finish]')) return;
  });
}
export type LearnShell2Part7 = {
  renderCommunity: typeof renderCommunity;
  renderReportsComingSoon: typeof renderReportsComingSoon;
  captureSimpleSetupStep: typeof captureSimpleSetupStep;
  validateSimpleSetupStep: typeof validateSimpleSetupStep;
  validateSimpleSetupMinimum: typeof validateSimpleSetupMinimum;
  simpleSetupDates: typeof simpleSetupDates;
  simpleSetupPayload: typeof simpleSetupPayload;
  applySimpleDraftToSetupVm: typeof applySimpleDraftToSetupVm;
  wireSimpleSetupWizard: typeof wireSimpleSetupWizard;
};
