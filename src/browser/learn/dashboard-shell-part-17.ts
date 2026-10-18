import type { LearnShellPayload, LearnShellError, LearnGradesVm, LearnPrintVm } from './dashboard-shell-contracts.js';
import type { LearnShellBindings } from './dashboard-shell.js';

declare const root: LearnShellBindings['root'];
declare const renderTestScoreRow: LearnShellBindings['renderTestScoreRow'];
declare const testScoreFromElement: LearnShellBindings['testScoreFromElement'];
declare const apiPost: LearnShellBindings['apiPost'];
declare const isLearnFamilyPlan: LearnShellBindings['isLearnFamilyPlan'];
declare const showLearnDialog: LearnShellBindings['showLearnDialog'];
declare const printCount: LearnShellBindings['printCount'];
declare const openLearnCheckout: LearnShellBindings['openLearnCheckout'];
declare const storedLearnCalendar: LearnShellBindings['storedLearnCalendar'];
declare const learnApiUrl: LearnShellBindings['learnApiUrl'];
declare const learnRequestHeaders: LearnShellBindings['learnRequestHeaders'];
declare const downloadBlob: LearnShellBindings['downloadBlob'];
declare const setPrintCount: LearnShellBindings['setPrintCount'];
declare const apiGet: LearnShellBindings['apiGet'];
declare let learnGoogleCalendarStatus: LearnShellBindings['learnGoogleCalendarStatus'];
declare const pageKey: LearnShellBindings['pageKey'];
declare const renderDashboard: LearnShellBindings['renderDashboard'];
declare const prepareOdysseyViewModel: LearnShellBindings['prepareOdysseyViewModel'];
declare const wireDashboard: LearnShellBindings['wireDashboard'];
declare const renderPlanner: LearnShellBindings['renderPlanner'];
declare const wirePlanner: LearnShellBindings['wirePlanner'];
declare const renderFormation: LearnShellBindings['renderFormation'];
declare const renderBooks: LearnShellBindings['renderBooks'];
declare const renderGrades: LearnShellBindings['renderGrades'];
declare const wireGrades: LearnShellBindings['wireGrades'];
declare const renderReportsComingSoon: LearnShellBindings['renderReportsComingSoon'];
declare const renderPrintCenter: LearnShellBindings['renderPrintCenter'];
declare const renderCommunity: LearnShellBindings['renderCommunity'];
declare const wireCommunity: LearnShellBindings['wireCommunity'];
declare const renderCoOp: LearnShellBindings['renderCoOp'];
declare const loadSimpleSetupDraft: LearnShellBindings['loadSimpleSetupDraft'];
declare const renderSimpleSetupWizard: LearnShellBindings['renderSimpleSetupWizard'];
declare const wireSimpleSetupWizard: LearnShellBindings['wireSimpleSetupWizard'];
declare const renderSetup: LearnShellBindings['renderSetup'];
declare const applySimpleDraftToSetupVm: LearnShellBindings['applySimpleDraftToSetupVm'];
declare const wireSetupPage: LearnShellBindings['wireSetupPage'];
declare const learnExperience: LearnShellBindings['learnExperience'];
declare const emptyState: LearnShellBindings['emptyState'];
declare const marketingPreviewActive: LearnShellBindings['marketingPreviewActive'];
declare const learnSectionHref: LearnShellBindings['learnSectionHref'];
declare const toBooksViewModel: LearnShellBindings['toBooksViewModel'];
declare const toCoOpViewModel: LearnShellBindings['toCoOpViewModel'];
declare const toCommunityViewModel: LearnShellBindings['toCommunityViewModel'];
declare const toDashboardViewModel: LearnShellBindings['toDashboardViewModel'];
declare const toFormationViewModel: LearnShellBindings['toFormationViewModel'];
declare const toGradesViewModel: LearnShellBindings['toGradesViewModel'];
declare const toPlannerViewModel: LearnShellBindings['toPlannerViewModel'];
declare const toPrintCenterViewModel: LearnShellBindings['toPrintCenterViewModel'];
declare const toSetupViewModel: LearnShellBindings['toSetupViewModel'];
declare const renderLearnRoot: LearnShellBindings['renderLearnRoot'];

function wireTestScores(vm: LearnGradesVm) {
  const list = root!.querySelector<HTMLElement>('[data-test-score-list]');
  const status = root!.querySelector<HTMLElement>('[data-test-scores-status]');
  if (!list) return;
  const setStatus = (message: string, tone = 'muted') => {
    if (!status) return;
    status.textContent = message;
    status.dataset.tone = tone;
  };
  const clearEmptyState = () => {
    if (!list.querySelector<HTMLElement>('[data-test-score]')) list.innerHTML = '';
  };
  root!.querySelectorAll<HTMLButtonElement>('[data-test-score-add]').forEach((button) => {
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
    const remove = (event.target as HTMLElement).closest<HTMLElement>('[data-test-score-remove]');
    if (!remove) return;
    remove.closest<HTMLElement>('[data-test-score]')?.remove();
    if (!list.querySelector<HTMLElement>('[data-test-score]')) {
      list.innerHTML = emptyState('No ACT or SAT scores recorded yet for this student.');
    }
    setStatus('Score removed. Save to confirm.');
  });
  root!.querySelector<HTMLButtonElement>('[data-test-scores-save]')?.addEventListener('click', async (event) => {
    const save = event.currentTarget;
    const childId = vm.selectedChildId;
    const scores = [...list.querySelectorAll<HTMLElement>('[data-test-score]')].map(testScoreFromElement);
    (save as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled = true;
    (save as HTMLElement).textContent = 'Saving...';
    setStatus('Saving test scores...');
    try {
      await apiPost('/api/learn/test-scores', { childId, scores });
      setStatus('Test scores saved.', 'success');
    } catch (error) {
      setStatus((error as LearnShellError).message || 'Test scores could not be saved.', 'error');
    } finally {
      (save as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled = false;
      (save as HTMLElement).textContent = 'Save Test Scores';
    }
  });
}

function canUsePrint(vm: LearnPrintVm, template: { premium?: boolean } | undefined | null) {
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

function wirePrintCenter(vm: LearnPrintVm) {
  root!.querySelector<HTMLButtonElement>('[data-print-upgrade]')?.addEventListener('click', openLearnCheckout);
  root!.querySelectorAll<HTMLButtonElement>('[data-print-generate]').forEach((button) => {
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
      (button as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled = true;
      button.textContent = 'Generating...';
      try {
        const calendar = storedLearnCalendar('');
        const response = await fetch(learnApiUrl(`/api/learn/print/${encodeURIComponent(templateId!)}`, { calendar }), {
          method: 'POST',
          headers: learnRequestHeaders({ 'content-type': 'application/json' }),
          body: JSON.stringify({
            childId: (template as Partial<LearnPrintVm['templates'][number]> & { termId?: string }).childId || '',
            termId: (template as Partial<LearnPrintVm['templates'][number]> & { termId?: string }).termId || '',
            month: button.dataset.printMonth || '',
          }),
        });
        const contentType = response.headers.get('content-type') || '';
        if (!response.ok || !contentType.includes('application/pdf')) {
          const payload = contentType.includes('application/json')
            ? ((await response.json().catch(() => ({}))) as LearnShellPayload)
            : {};
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
        showLearnDialog(
          'Print Could Not Be Generated',
          (error as LearnShellError).message || 'Please refresh and try again.',
          []
        );
      } finally {
        (button as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled = false;
        button.textContent = originalText;
      }
    });
  });

  // ── Child sheet dropdown buttons ────────────────────────────────────────────
  // Each child card has a <select> and a button with data-child-print-group.
  // On click, resolve the selected templateId from the <select>, find its
  // template (for childId and premium gating), then fire the same print flow.
  root!.querySelectorAll<HTMLButtonElement>('[data-child-print-group]').forEach((button) => {
    button.addEventListener('click', async () => {
      const selectId = button.dataset.childSelect;
      const select = selectId ? (document.getElementById(selectId) as HTMLSelectElement | null) : null;
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
      (button as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled = true;
      button.textContent = 'Generating...';
      try {
        const calendar = storedLearnCalendar('');
        const response = await fetch(learnApiUrl(`/api/learn/print/${encodeURIComponent(templateId)}`, { calendar }), {
          method: 'POST',
          headers: learnRequestHeaders({ 'content-type': 'application/json' }),
          body: JSON.stringify({
            childId: (template as Partial<LearnPrintVm['templates'][number]> & { termId?: string }).childId || '',
            termId: (template as Partial<LearnPrintVm['templates'][number]> & { termId?: string }).termId || '',
          }),
        });
        const contentType = response.headers.get('content-type') || '';
        if (!response.ok || !contentType.includes('application/pdf')) {
          const payload = contentType.includes('application/json')
            ? ((await response.json().catch(() => ({}))) as LearnShellPayload)
            : {};
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
        showLearnDialog(
          'Print Could Not Be Generated',
          (error as LearnShellError).message || 'Please refresh and try again.',
          []
        );
      } finally {
        (button as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled = false;
        button.textContent = originalText;
      }
    });
  });
}

function wireFormation() {
  root!.querySelectorAll<HTMLButtonElement>('[data-reading-check]').forEach((button) => {
    button.addEventListener('click', () => {
      const active = button.getAttribute('aria-pressed') !== 'true';
      button.setAttribute('aria-pressed', String(active));
      button.style.background = active ? '#fbf2dd' : 'var(--paper2)';
      button.style.borderColor = active ? 'var(--gold)' : 'var(--line)';
      const mark = button.querySelector<HTMLElement>('[data-reading-mark]');
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
    // Always clear and re-derive from the live API response so stale localStorage
    // doesn't show a paid UI to a user whose subscription has lapsed.
    if (billing.plan === 'family' || billing.fullAccess) {
      localStorage.setItem('agapay.learn.plan', 'family');
    } else {
      localStorage.removeItem('agapay.learn.plan');
    }
    if (billing.printLimit) resolvedPrintLimit = Number(billing.printLimit) || 3;
  } catch {
    // Billing status is advisory for the shell; route-level saves still enforce limits.
  }
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
    const month = params.get('month') || new Date().toISOString().slice(0, 7);
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
    const params = new URLSearchParams(window.location.search);
    const academicYear = params.get('academicYear') || '';
    const childId = params.get('childId') || '';
    const raw = await apiGet(
      `/api/learn/grades${academicYear ? `?academicYear=${encodeURIComponent(academicYear)}` : ''}`
    );
    const vm: LearnGradesVm = prepareOdysseyViewModel(toGradesViewModel(raw, { childId }));
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
        document.querySelector<HTMLElement>(window.location.hash)?.scrollIntoView({ block: 'start' })
      );
    }
    return;
  }
  renderLearnRoot(
    root,
    `<div style="padding:32px;font-family:Georgia,serif;color:#1b2c45;">This Learn route has not been migrated to the Claude shell yet.</div>`
  );
}
export type LearnShell2Part16 = {
  wireTestScores: typeof wireTestScores;
  canUsePrint: typeof canUsePrint;
  wirePrintCenter: typeof wirePrintCenter;
  wireFormation: typeof wireFormation;
  mount: typeof mount;
};
