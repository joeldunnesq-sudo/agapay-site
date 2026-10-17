import type {
  LearnTruthyFilter,
  LearnSetupResourceRow,
  LearnResourceFieldSnapshot,
  LearnShellError,
} from './dashboard-shell-contracts.js';
import type { LearnShellBindings } from './dashboard-shell.js';

declare const rowValue: LearnShellBindings['rowValue'];
declare const storedLearnCalendar: LearnShellBindings['storedLearnCalendar'];
declare const apiGet: LearnShellBindings['apiGet'];
declare const learnApiUrl: LearnShellBindings['learnApiUrl'];
declare const forceDisplayedSaintFirst: LearnShellBindings['forceDisplayedSaintFirst'];
declare const showLearnDialog: LearnShellBindings['showLearnDialog'];
declare const saintStoryDialogHtml: LearnShellBindings['saintStoryDialogHtml'];
declare const root: LearnShellBindings['root'];
declare const setLearnViewMode: LearnShellBindings['setLearnViewMode'];
declare const apiPost: LearnShellBindings['apiPost'];
declare const localIsoDate: LearnShellBindings['localIsoDate'];
declare const renderDashboard: LearnShellBindings['renderDashboard'];
declare const prepareOdysseyViewModel: LearnShellBindings['prepareOdysseyViewModel'];
declare const learnExperience: LearnShellBindings['learnExperience'];
declare const DEFAULT_TERM_WEEK_COUNT: LearnShellBindings['DEFAULT_TERM_WEEK_COUNT'];
declare const resourceFieldName: LearnShellBindings['resourceFieldName'];
declare const selectedTermWeeks: LearnShellBindings['selectedTermWeeks'];
declare const primaryResourceGroupLabel: LearnShellBindings['primaryResourceGroupLabel'];
declare const termWeekSummaryFromSelected: LearnShellBindings['termWeekSummaryFromSelected'];
declare const toDashboardViewModel: LearnShellBindings['toDashboardViewModel'];
declare const renderLearnRoot: LearnShellBindings['renderLearnRoot'];

function rowWeeklyPlans(row: HTMLElement) {
  return Array.from({ length: DEFAULT_TERM_WEEK_COUNT }, (_, index) => rowValue(row, `weeklyPlans.${index + 1}`));
}

function rowResourceValue(resourceRow: HTMLElement, index: number, field: string) {
  const control = resourceRow.querySelector<HTMLElement>(`[name="${resourceFieldName(index, field)}"]`);
  if (!control) return '';
  return (control as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value.trim();
}

function rowResourceWeeklyPlans(resourceRow: HTMLElement, index: number) {
  return Array.from({ length: DEFAULT_TERM_WEEK_COUNT }, (_, weekIndex) =>
    rowResourceValue(resourceRow, index, `weeklyPlans.${weekIndex + 1}`)
  );
}

function rowResources(row: HTMLElement): LearnSetupResourceRow[] {
  // Read resources.N.title / resources.N.scheduledWeeks from [data-resource-list]
  const resourceRows = [...row.querySelectorAll<HTMLElement>('[data-resource-list] [data-resource-row]')];
  if (resourceRows.length) {
    return resourceRows
      .map((resourceRow) => {
        const index = Number(resourceRow.dataset.resourceRow || 0);
        const titleInput =
          resourceRow.querySelector<HTMLElement>(`[name="resources.${index}.title"]`) ||
          resourceRow.querySelector<HTMLInputElement>("input[type='text']");
        const weeksInput = resourceRow.querySelector<HTMLElement>(`[name="resources.${index}.scheduledWeeks"]`);
        const title = (titleInput as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)?.value?.trim() || '';
        const scheduledWeeks = selectedTermWeeks(
          (weeksInput as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)?.value || ''
        );
        return {
          title,
          scheduledWeeks,
          weeklyPlans: rowResourceWeeklyPlans(resourceRow, index),
          planningMode: rowResourceValue(resourceRow, index, 'planningMode'),
          formLabel: rowResourceValue(resourceRow, index, 'formLabel'),
          formLabels: rowResourceValue(resourceRow, index, 'formLabels')
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean as unknown as LearnTruthyFilter),
          gradeLabel: rowResourceValue(resourceRow, index, 'gradeLabel'),
          childIds: rowResourceValue(resourceRow, index, 'childIds')
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean as unknown as LearnTruthyFilter),
        };
      })
      .filter((r) => r.title);
  }
  // Legacy fallback: single resource field
  const legacy = rowValue(row, 'resource') as string;
  return legacy ? [{ title: legacy, scheduledWeeks: [] }] : [];
}

function resourceRowPrimaryGroupLabel(resourceRow: HTMLElement, groupingMode: string = 'forms') {
  const index = Number(resourceRow?.dataset.resourceRow || 0);
  return primaryResourceGroupLabel(
    {
      formLabel: rowResourceValue(resourceRow, index, 'formLabel'),
      formLabels: rowResourceValue(resourceRow, index, 'formLabels')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean as unknown as LearnTruthyFilter),
      gradeLabel: rowResourceValue(resourceRow, index, 'gradeLabel'),
    },
    groupingMode
  );
}

function refreshResourceLaneCounts(list: HTMLElement) {
  if (!list) return;
  list.querySelectorAll<HTMLElement>('[data-resource-lane]').forEach((lane) => {
    const count = lane.querySelectorAll<HTMLElement>('[data-resource-row]').length;
    const countEl = lane.querySelector<HTMLElement>('header strong');
    if (countEl) countEl.textContent = `${count} ${count === 1 ? 'resource' : 'resources'}`;
  });
}

function moveResourceRowToLane(resourceRow: HTMLElement | null) {
  const list = resourceRow?.closest<HTMLElement>('[data-resource-list]');
  if (!list?.classList.contains('learn-resource-list-by-form')) return;
  const groupingMode =
    list.querySelector<HTMLButtonElement>('[data-resource-grouping-mode]')?.dataset.resourceGroupingMode || 'forms';
  const label = resourceRowPrimaryGroupLabel(resourceRow!, groupingMode);
  const laneKey = label || '__family';
  const lane = [...list.querySelectorAll<HTMLElement>('[data-resource-lane]')].find(
    (candidate) => candidate.dataset.resourceLane === laneKey
  );
  const addButton = lane?.querySelector<HTMLButtonElement>('[data-add-resource]');
  if (addButton && resourceRow!.parentElement !== addButton.parentElement) addButton.before(resourceRow!);
  // Reindex after move so all name attributes reflect actual DOM order
  reindexResourceList(list);
}

function reindexResourceList(list: HTMLElement | null) {
  if (!list) return;
  list.querySelectorAll<HTMLElement>('[data-resource-row]').forEach((row, i) => {
    row.dataset.resourceRow = String(i);
    row.querySelectorAll<HTMLInputElement>('[data-resource-field]').forEach((field) => {
      const key = field.dataset.resourceField || '';
      if (key) (field as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).name = resourceFieldName(i, key);
    });
    const weekPicker = row.querySelector<HTMLElement>('[data-resource-week-picker]');
    if (weekPicker) weekPicker.dataset.resourceWeekPicker = String(i);
    row
      .querySelectorAll<HTMLElement>('.learn-resource-card-summary small, .learn-resource-modal-card > small')
      .forEach((label) => {
        label.textContent = i === 0 ? 'Book / source / resource' : `Resource ${i + 1}`;
      });
    refreshResourceSummary(row);
  });
  refreshResourceLaneCounts(list);
}

function moveResourceRowToSubject(resourceRow: HTMLElement, subjectRow: HTMLElement) {
  const sourceList = resourceRow?.closest<HTMLElement>('[data-resource-list]');
  const targetList = subjectRow?.querySelector<HTMLElement>('[data-resource-list]');
  if (!resourceRow || !sourceList || !targetList || sourceList === targetList) return false;
  if (targetList.classList.contains('learn-resource-list-by-form')) {
    const groupingMode =
      targetList.querySelector<HTMLButtonElement>('[data-resource-grouping-mode]')?.dataset.resourceGroupingMode ||
      'forms';
    const laneKey = resourceRowPrimaryGroupLabel(resourceRow, groupingMode) || '__family';
    const lane =
      [...targetList.querySelectorAll<HTMLElement>('[data-resource-lane]')].find(
        (candidate) => candidate.dataset.resourceLane === laneKey
      ) || targetList.querySelector<HTMLElement>('[data-resource-lane]');
    const addButton = lane?.querySelector<HTMLButtonElement>('[data-add-resource]');
    if (addButton) addButton.before(resourceRow);
    else lane?.querySelector<HTMLFormElement>('.learn-resource-form-lane-body')?.appendChild(resourceRow);
  } else {
    const addButton = targetList.querySelector<HTMLButtonElement>('[data-add-resource]');
    if (addButton) addButton.before(resourceRow);
    else targetList.appendChild(resourceRow);
  }
  reindexResourceList(sourceList);
  reindexResourceList(targetList);
  return true;
}

function refreshResourceSummary(resourceRow: HTMLElement | null) {
  if (!resourceRow) return;
  const index = Number(resourceRow.dataset.resourceRow || 0);
  const title =
    (
      resourceRow.querySelector<HTMLElement>(`[name="${resourceFieldName(index, 'title')}"]`) as
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    )?.value?.trim() || '';
  const weeks = selectedTermWeeks(
    (
      resourceRow.querySelector<HTMLElement>(`[name="${resourceFieldName(index, 'scheduledWeeks')}"]`) as
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    )?.value || ''
  );
  const groups = (
    (
      resourceRow.querySelector<HTMLElement>(`[name="${resourceFieldName(index, 'formLabels')}"]`) as
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    )?.value || ''
  )
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean as unknown as LearnTruthyFilter);
  const children = (
    (
      resourceRow.querySelector<HTMLElement>(`[name="${resourceFieldName(index, 'childIds')}"]`) as
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    )?.value || ''
  )
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean as unknown as LearnTruthyFilter);
  const titleEl = resourceRow.querySelector<HTMLElement>('[data-resource-summary-title]');
  const detailEl = resourceRow.querySelector<HTMLElement>('[data-resource-summary-detail]');
  if (titleEl) titleEl.textContent = title || 'Untitled resource';
  if (detailEl)
    detailEl.textContent = [
      termWeekSummaryFromSelected(weeks),
      groups.length ? groups.join(', ') : '',
      children.length ? `${children.length} child-specific` : '',
    ]
      .filter(Boolean as unknown as LearnTruthyFilter)
      .join(' · ');
}

function snapshotResourceModal(modal: HTMLElement) {
  if (!modal) return;
  const fields = [...modal.querySelectorAll<HTMLInputElement>('input, select, textarea')].map((field) => ({
    name: field.name || '',
    value: field.value || '',
    checked: Boolean(field.checked),
  }));
  modal.dataset.resourceSnapshot = JSON.stringify(fields);
}

function restoreResourceModal(modal: HTMLElement | null) {
  if (!modal?.dataset.resourceSnapshot) return;
  try {
    const fields = JSON.parse(modal.dataset.resourceSnapshot) as LearnResourceFieldSnapshot[];
    fields.forEach((state, index: number) => {
      const field = modal.querySelectorAll<HTMLInputElement>('input, select, textarea')[index];
      if (!field || field.name !== state.name) return;
      if (field.type === 'checkbox') field.checked = Boolean(state.checked);
      else field.value = state.value || '';
    });
  } catch {
    // A stale modal snapshot should not block editing the resource.
  }
}

function rowTileMinutes(row: HTMLElement) {
  return (
    (
      row
        .closest<HTMLElement>('.learn-setup-subsection')
        ?.querySelector<HTMLInputElement>('[data-setup-section-minutes-input]') as
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    )?.value?.trim() ||
    (rowValue(row, 'minutes') as string) ||
    (rowValue(row, 'minutesPlanned') as string)
  );
}

function collectRows<T>(form: HTMLFormElement, rowType: string, mapper: (row: HTMLElement, index: number) => T) {
  return [...form.querySelectorAll<HTMLElement>(`[data-setup-row="${rowType}"]`)]
    .map((row, index) => mapper(row, index))
    .filter(Boolean as unknown as LearnTruthyFilter);
}

async function openSaintOfDay(button: HTMLButtonElement) {
  const date = button.dataset.date || '';
  const calendar = button.dataset.calendar || storedLearnCalendar('');
  const previousText = button.querySelector<HTMLElement>('small')?.textContent || '';
  button.disabled = true;
  button.style.cursor = 'wait';
  const small = button.querySelector<HTMLElement>('small');
  if (small) small.textContent = 'Loading the lives of the saints...';
  try {
    const payload = await apiGet(learnApiUrl('/api/learn/saints', { date, calendar }));
    const unavailable =
      payload.sourceConnected === false
        ? payload.message || 'Lives of the Saints are unavailable right now. Please try again later.'
        : '';
    const cardSaintTitle = button.dataset.saintTitle || button.querySelector<HTMLElement>('strong')?.textContent || '';
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
      (error as LearnShellError).message || 'Lives of the Saints are unavailable right now. Please try again later.',
      [{ label: 'Source', value: 'Orthocal.info' }]
    );
  } finally {
    button.disabled = false;
    button.style.cursor = 'pointer';
    if (small) small.textContent = previousText;
  }
}

function wireDashboard() {
  root!.querySelectorAll<HTMLButtonElement>('[data-tefa-view-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const next = learnExperience().viewMode === 'tefa' ? 'classic' : 'tefa';
      setLearnViewMode(next);
      // Reload rather than patch in place: the toggle changes copy, nav
      // labels/order, and section order across the whole shell, and a full
      // reload is far less error-prone than re-deriving every affected node.
      window.location.reload();
    });
  });

  root!.querySelectorAll<HTMLButtonElement>('[data-church-section-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const body = button
        .closest<HTMLElement>('[data-church-section]')
        ?.querySelector<HTMLElement>('[data-church-section-body]');
      if (!body) return;
      const nowCollapsed = !body.hidden;
      body.hidden = nowCollapsed;
      // The body carries an inline `display:flex` (needed for its layout when
      // open), which — being inline — outranks the `[hidden] { display:none }`
      // UA rule. Setting `hidden` alone left the content visibly on-screen.
      // Drive `display` explicitly so the toggle actually hides the section.
      body.style.display = nowCollapsed ? 'none' : 'flex';
      button.setAttribute('aria-expanded', nowCollapsed ? 'false' : 'true');
      const label = button.querySelector<HTMLElement>('[data-church-section-toggle-label]');
      if (label) label.textContent = nowCollapsed ? 'Show Church Rhythm' : 'Minimize';
      try {
        localStorage.setItem('agapay.learn.churchCardMinimized', nowCollapsed ? 'true' : 'false');
      } catch {
        // Best-effort — the toggle still works for this page view either way.
      }
    });
  });

  root!.querySelectorAll<HTMLButtonElement>('[data-saint-of-day]').forEach((button) => {
    button.addEventListener('click', () => openSaintOfDay(button));
  });

  root!.querySelectorAll<HTMLButtonElement>('[data-learn-completion]').forEach((button) => {
    button.addEventListener('click', async () => {
      const itemId = button.dataset.completionId || '';
      const scope = button.dataset.completionScope || '';
      const completed = button.getAttribute('aria-pressed') !== 'true';
      const calendar = storedLearnCalendar('');
      (button as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled = true;
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
        (button as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled = false;
        button.style.cursor = 'pointer';
        showLearnDialog(
          'Progress Could Not Be Saved',
          (error as LearnShellError).message || 'AGAPAY Learn could not save this progress update.',
          []
        );
      }
    });
  });

  root!.querySelectorAll<HTMLButtonElement>('[data-grace-mode]').forEach((button) => {
    button.addEventListener('click', async () => {
      const mode = button.dataset.graceMode || 'light';
      const status = root!.querySelector<HTMLElement>('[data-grace-mode-status]');
      const calendar = storedLearnCalendar('');
      if (status) {
        status.style.color = 'var(--muted)';
        status.textContent = 'Saving rhythm...';
      }
      root!.querySelectorAll<HTMLButtonElement>('[data-grace-mode]').forEach((item) => {
        (item as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled = true;
        item.style.cursor = 'wait';
      });
      try {
        const saved = await apiPost(learnApiUrl('/api/learn/grace-mode', { calendar }), {
          mode,
          active: mode !== 'full',
        });
        renderLearnRoot(root, renderDashboard(prepareOdysseyViewModel(toDashboardViewModel(saved))));
        wireDashboard();
        const nextStatus = root!.querySelector<HTMLElement>('[data-grace-mode-status]');
        if (nextStatus) nextStatus.textContent = 'Rhythm saved.';
      } catch (error) {
        if (status) {
          status.style.color = 'var(--burgundy)';
          status.textContent = (error as LearnShellError).message;
        }
        root!.querySelectorAll<HTMLButtonElement>('[data-grace-mode]').forEach((item) => {
          (item as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled = false;
          item.style.cursor = 'pointer';
        });
      }
    });
  });
}
export type LearnShell2Part9 = {
  rowWeeklyPlans: typeof rowWeeklyPlans;
  rowResourceValue: typeof rowResourceValue;
  rowResourceWeeklyPlans: typeof rowResourceWeeklyPlans;
  rowResources: typeof rowResources;
  resourceRowPrimaryGroupLabel: typeof resourceRowPrimaryGroupLabel;
  refreshResourceLaneCounts: typeof refreshResourceLaneCounts;
  moveResourceRowToLane: typeof moveResourceRowToLane;
  reindexResourceList: typeof reindexResourceList;
  moveResourceRowToSubject: typeof moveResourceRowToSubject;
  refreshResourceSummary: typeof refreshResourceSummary;
  snapshotResourceModal: typeof snapshotResourceModal;
  restoreResourceModal: typeof restoreResourceModal;
  rowTileMinutes: typeof rowTileMinutes;
  collectRows: typeof collectRows;
  openSaintOfDay: typeof openSaintOfDay;
  wireDashboard: typeof wireDashboard;
};
