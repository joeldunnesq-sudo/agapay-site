import type { LearnShellNode, LearnShellError } from './dashboard-shell-contracts.js';
import type { LearnShellBindings } from './dashboard-shell.js';

declare const root: LearnShellBindings['root'];
declare const setupPayloadFromForm: LearnShellBindings['setupPayloadFromForm'];
declare const apiPost: LearnShellBindings['apiPost'];
declare const setupWeekdays: LearnShellBindings['setupWeekdays'];
declare const syncSetupTermSelects: LearnShellBindings['syncSetupTermSelects'];
declare const syncSetupChildLimit: LearnShellBindings['syncSetupChildLimit'];
declare const setupChildRowsFromForm: LearnShellBindings['setupChildRowsFromForm'];
declare const rowResources: LearnShellBindings['rowResources'];
declare const refreshResourceLaneCounts: LearnShellBindings['refreshResourceLaneCounts'];
declare const reindexResourceList: LearnShellBindings['reindexResourceList'];
declare const snapshotResourceModal: LearnShellBindings['snapshotResourceModal'];
declare const restoreResourceModal: LearnShellBindings['restoreResourceModal'];
declare const refreshResourceSummary: LearnShellBindings['refreshResourceSummary'];
declare const moveResourceRowToLane: LearnShellBindings['moveResourceRowToLane'];
declare const setSetupSectionOpen: LearnShellBindings['setSetupSectionOpen'];
declare const setupBlankRow: LearnShellBindings['setupBlankRow'];
declare const showLearnDialog: LearnShellBindings['showLearnDialog'];
declare const moveResourceRowToSubject: LearnShellBindings['moveResourceRowToSubject'];
declare const panel: LearnShellBindings['panel'];
declare const termWeekSummary: LearnShellBindings['termWeekSummary'];
declare const setupResourceRow: LearnShellBindings['setupResourceRow'];

function wireSetupPage() {
  const form = root!.querySelector<HTMLFormElement>('[data-setup-form]');
  if (!form) return;
  const status = form.querySelector<HTMLElement>('[data-setup-status]');
  const submit = form.querySelector<HTMLButtonElement>("button[type='submit']");
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
        status.textContent = (error as LearnShellError).message;
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
  let draggedResourceRow: HTMLElement | null = null;
  const clearResourceDropTargets = () => {
    form
      .querySelectorAll<HTMLElement>(
        '.learn-setup-row-subject.is-resource-drop-target, .learn-setup-row-enrichment.is-resource-drop-target'
      )
      .forEach((row) => row.classList.remove('is-resource-drop-target'));
  };
  form.addEventListener('input', (event) => {
    const dayChoice = (event.target as HTMLElement).closest<HTMLElement>('[data-day-choice]');
    if (dayChoice) {
      const picker = dayChoice.closest<HTMLElement>('.learn-day-picker');
      const selected = [...picker!.querySelectorAll<HTMLInputElement>('[data-day-choice]:checked')].map(
        (input) => (input as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value
      );
      (
        picker!.querySelector<HTMLElement>('[name="scheduledDays"]') as
          HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      ).value = selected.join(',');
      picker!.querySelector<HTMLElement>('[data-day-summary]')!.textContent = selected.length
        ? setupWeekdays
            .filter((day) => selected.includes(day.value))
            .map((day) => day.label)
            .join(' · ')
        : 'Choose days';
      return;
    }
    const termWeekChoice = (event.target as HTMLElement).closest<HTMLElement>('[data-term-week-choice]');
    if (termWeekChoice) {
      const picker = termWeekChoice.closest<HTMLElement>('.learn-term-week-picker');
      const selected = [...picker!.querySelectorAll<HTMLInputElement>('[data-term-week-choice]:checked')].map((input) =>
        Number((input as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value)
      );
      const hiddenField = picker!.querySelector<HTMLInputElement>("input[type='hidden']");
      if (hiddenField) hiddenField.value = selected.join(',');
      picker!.querySelector<HTMLElement>('[data-term-week-summary]')!.textContent = selected.length
        ? termWeekSummary(selected)
        : 'Choose weeks';
      return;
    }
    const planningFormChoice = (event.target as HTMLElement).closest<HTMLElement>('[data-planning-form-choice]');
    if (planningFormChoice) {
      const picker = planningFormChoice.closest<HTMLElement>('.learn-planning-mode-picker');
      const selected = [...picker!.querySelectorAll<HTMLInputElement>('[data-planning-form-choice]:checked')].map(
        (input) => (input as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value
      );
      const planningMode = selected.length ? 'forms' : 'family';
      const planningModeField =
        picker!.querySelector<HTMLInputElement>('[data-planning-mode-field]') ||
        picker!.querySelector<HTMLElement>('[name="planningMode"]');
      const formLabelField =
        picker!.querySelector<HTMLInputElement>('[data-form-label-field]') ||
        picker!.querySelector<HTMLElement>('[name="formLabel"]');
      const formLabelsField =
        picker!.querySelector<HTMLInputElement>('[data-form-labels-field]') ||
        picker!.querySelector<HTMLElement>('[name="formLabels"]');
      const gradeField =
        picker!.querySelector<HTMLInputElement>('[data-grade-label-field]') ||
        picker!.querySelector<HTMLElement>('[name="gradeLabel"]');
      if (planningModeField)
        (planningModeField as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value = planningMode;
      if (formLabelField)
        (formLabelField as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value = selected[0] || '';
      if (formLabelsField)
        (formLabelsField as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value = selected.join(',');
      if (gradeField)
        (gradeField as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value = selected[0] || '';
      const label = picker!.querySelector<HTMLElement>('[data-planning-mode-summary]');
      if (label)
        label.textContent = selected.length
          ? `${picker!.dataset.planningGroupLabel || 'Forms-Based'}: ${selected.join(', ')}`
          : 'Family-Based';
      return;
    }
    const childMultiChoice = (event.target as HTMLElement).closest<HTMLElement>('[data-child-multi-choice]');
    if (childMultiChoice) {
      const picker = childMultiChoice.closest<HTMLElement>('.learn-child-multi-picker');
      const selected = [...picker!.querySelectorAll<HTMLInputElement>('[data-child-multi-choice]:checked')].map(
        (input) => (input as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value
      );
      const childIdsField =
        picker!.querySelector<HTMLInputElement>('[data-child-ids-field]') ||
        picker!.querySelector<HTMLElement>('[name="childIds"]');
      if (childIdsField)
        (childIdsField as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value = selected.join(',');
      const names = [...picker!.querySelectorAll<HTMLInputElement>('[data-child-multi-choice]:checked')].map(
        (input) =>
          input.closest<HTMLElement>('label')?.textContent?.trim() ||
          (input as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value
      );
      picker!.querySelector<HTMLElement>('[data-child-multi-summary]')!.textContent = selected.length
        ? names.join(', ')
        : 'Use Form Assignment';
      return;
    }
    const tileInput = (event.target as HTMLElement).closest<HTMLElement>(
      '[data-setup-section-title-input], [data-setup-section-detail-input]'
    );
    if (tileInput) {
      const group = tileInput.dataset.setupSectionGroup || '';
      const panelId = tileInput.dataset.setupSectionPanel || '';
      const section = tileInput.closest<HTMLElement>('.learn-setup-subsection');
      const title =
        (
          section?.querySelector<HTMLInputElement>('[data-setup-section-title-input]') as
            HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        )?.value?.trim() || '';
      const detail =
        (
          section?.querySelector<HTMLTextAreaElement>('[data-setup-section-detail-input]') as
            HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        )?.value?.trim() || '';
      const card = form.querySelector<HTMLElement>(
        `[data-setup-section-group="${group}"][data-setup-section-panel="${panelId}"][data-setup-section-toggle]`
      );
      const cardTitle = card?.querySelector<HTMLElement>('[data-setup-section-card-title]');
      const cardDetail = card?.querySelector<HTMLElement>('[data-setup-section-card-detail]');
      const panelTitle = section?.querySelector<HTMLElement>('[data-setup-section-panel-title]');
      const panelDetail = section?.querySelector<HTMLElement>('[data-setup-section-panel-detail]');
      if (cardTitle && title) cardTitle.textContent = title;
      if (cardDetail && detail) cardDetail.textContent = detail;
      if (panelTitle && title) panelTitle.textContent = title;
      if (panelDetail && detail) panelDetail.textContent = detail;
      return;
    }
    const colorField = (event.target as HTMLElement).closest<HTMLElement>('.learn-color-field');
    if (!colorField) return;
    const colorInput = colorField.querySelector<HTMLInputElement>('input[type="color"]');
    const textInput = colorField.querySelector<HTMLInputElement>('input[type="text"]');
    const preview = colorField.querySelector<HTMLElement>('[data-color-preview]');
    if (event.target === colorInput && textInput) textInput.value = colorInput!.value;
    if (event.target === textInput && /^#[0-9a-f]{6}$/i.test(textInput!.value) && colorInput)
      colorInput.value = textInput!.value;
    const value = /^#[0-9a-f]{6}$/i.test(textInput?.value || '') ? textInput!.value : colorInput?.value;
    if (preview && value) preview.style.background = value;
    if ((event.target as HTMLElement).closest<HTMLElement>('[data-setup-row="terms"]')) syncSetupTermSelects(form);
    if ((event.target as HTMLElement).closest<HTMLElement>('[data-setup-row="children"]')) syncSetupChildLimit(form);
  });
  form.addEventListener('input', () => scheduleSetupAutosave(900));
  form.addEventListener('change', () => scheduleSetupAutosave(250));
  form.addEventListener('focusout', () => scheduleSetupAutosave(150));
  form.addEventListener('click', (event) => {
    const setupPanelToggle = (event.target as HTMLElement).closest<HTMLElement>('[data-setup-panel-toggle]');
    if (setupPanelToggle) {
      const panel = setupPanelToggle.closest<HTMLElement>('[data-setup-collapse-panel]');
      const body = panel?.querySelector<HTMLElement>('.learn-setup-collapse-body');
      if (!panel || !body) return;
      const expanded = setupPanelToggle.getAttribute('aria-expanded') === 'true';
      const nextExpanded = !expanded;
      setupPanelToggle.setAttribute('aria-expanded', nextExpanded ? 'true' : 'false');
      setupPanelToggle.textContent = nextExpanded ? 'Minimize' : 'Expand';
      body.hidden = !nextExpanded;
      panel.classList.toggle('is-collapsed', !nextExpanded);
      try {
        localStorage.setItem(
          `agapay.learn.setupPanel.${setupPanelToggle.dataset.setupPanelToggle}`,
          nextExpanded ? 'expanded' : 'collapsed'
        );
      } catch {
        // Collapsed state persistence is optional.
      }
      return;
    }
    const addResource = (event.target as HTMLElement).closest<HTMLElement>('[data-add-resource]');
    if (addResource) {
      const list = addResource.closest<HTMLElement>('[data-resource-list]');
      if (!list) return;
      const existingRows = list.querySelectorAll<HTMLElement>('[data-resource-row]');
      const index = existingRows.length;
      const subjectRow = addResource.closest<HTMLElement>('[data-setup-row="subjects"]');
      const groupingMode =
        (
          document.querySelector<HTMLElement>('[name="preferences.groupingMode"]') as
            HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        )?.value || 'forms';
      const children = setupChildRowsFromForm(addResource.closest<HTMLElement>('[data-setup-form]'));
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
      const newRow = list.querySelector<HTMLElement>(`[data-resource-row="${index}"]`);
      refreshResourceLaneCounts(list);
      // Reindex so the new row's field names are consistent with DOM order
      reindexResourceList(list);
      const newRowAfterReindex = list.querySelector<HTMLElement>(
        `[data-resource-row="${list.querySelectorAll<HTMLElement>('[data-resource-row]').length - 1}"]`
      );
      const modal = (newRowAfterReindex || newRow)?.querySelector<HTMLElement>('[data-resource-modal]');
      if (modal) {
        snapshotResourceModal(modal);
        modal.hidden = false;
        modal.style.display = 'flex';
        modal.querySelector<HTMLInputElement>('input')?.focus();
      }
      return;
    }
    const editResource = (event.target as HTMLElement).closest<HTMLElement>('[data-edit-resource]');
    if (editResource) {
      const modal = editResource
        .closest<HTMLElement>('[data-resource-row]')
        ?.querySelector<HTMLElement>('[data-resource-modal]');
      if (!modal) return;
      snapshotResourceModal(modal);
      modal.hidden = false;
      modal.style.display = 'flex';
      modal.querySelector<HTMLInputElement>('input')?.focus();
      return;
    }
    const closeResourceModal = (event.target as HTMLElement).closest<HTMLElement>(
      '[data-resource-modal-close], [data-resource-modal-save]'
    );
    if (closeResourceModal) {
      const savingResource = closeResourceModal.hasAttribute('data-resource-modal-save');
      const modal = closeResourceModal.closest<HTMLElement>('[data-resource-modal]');
      if (!savingResource) restoreResourceModal(modal);
      const resourceRow = closeResourceModal.closest<HTMLElement>('[data-resource-row]');
      refreshResourceSummary(resourceRow);
      if (savingResource) moveResourceRowToLane(resourceRow);
      if (modal) {
        modal.hidden = true;
        modal.style.display = 'none';
      }
      return;
    }
    const removeResource = (event.target as HTMLElement).closest<HTMLElement>('[data-remove-resource]');
    if (removeResource) {
      const list = removeResource.closest<HTMLElement>('[data-resource-list]');
      const removedRow = removeResource.closest<HTMLElement>('[data-resource-row]');
      removedRow?.remove();
      reindexResourceList(list);
      return;
    }
    const weekPreset = (event.target as HTMLElement).closest<HTMLElement>(
      '[data-term-weeks-all], [data-term-weeks-odd], [data-term-weeks-even]'
    );
    if (weekPreset) {
      const picker = weekPreset.closest<HTMLElement>('.learn-term-week-picker');
      const mode = weekPreset.hasAttribute('data-term-weeks-odd')
        ? 'odd'
        : weekPreset.hasAttribute('data-term-weeks-even')
          ? 'even'
          : 'all';
      picker!.querySelectorAll<HTMLInputElement>('[data-term-week-choice]').forEach((input) => {
        const week = Number((input as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value);
        (input as HTMLInputElement).checked = mode === 'all' || (mode === 'odd' ? week % 2 === 1 : week % 2 === 0);
      });
      const selected = [...picker!.querySelectorAll<HTMLInputElement>('[data-term-week-choice]:checked')].map((input) =>
        Number((input as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value)
      );
      const hiddenField = picker!.querySelector<HTMLInputElement>("input[type='hidden']");
      if (hiddenField) hiddenField.value = selected.join(',');
      picker!.querySelector<HTMLElement>('[data-term-week-summary]')!.textContent = termWeekSummary(selected);
      return;
    }
    const sectionToggle = (event.target as HTMLElement).closest<HTMLElement>('[data-setup-section-toggle]');
    if (sectionToggle) {
      const group = sectionToggle.dataset.setupSectionGroup || '';
      const panelId = sectionToggle.dataset.setupSectionPanel || '';
      const wasOpen = sectionToggle.getAttribute('aria-expanded') === 'true';
      setSetupSectionOpen(form, group, panelId, !wasOpen);
      const panelElement = document.getElementById(sectionToggle.getAttribute('aria-controls') || '');
      if (!wasOpen && panelElement) panelElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const sectionClose = (event.target as HTMLElement).closest<HTMLElement>('[data-setup-section-close]');
    if (sectionClose) {
      setSetupSectionOpen(
        form,
        sectionClose.dataset.setupSectionGroup || '',
        sectionClose.dataset.setupSectionPanel || '',
        false
      );
      return;
    }
    const closeButton = (event.target as HTMLElement).closest<HTMLElement>('[data-close-term]');
    if (closeButton) {
      const termId =
        closeButton.dataset.closeTerm || closeButton.closest<HTMLElement>('[data-setup-row]')?.dataset.id || '';
      const status = form.querySelector<HTMLElement>('[data-setup-status]');
      const originalText = closeButton.textContent;
      (closeButton as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled = true;
      closeButton.textContent = 'Closing...';
      if (status) {
        status.style.color = 'var(--muted)';
        status.textContent = 'Saving setup before closing term...';
      }
      (async () => {
        try {
          const payload = setupPayloadFromForm(form);
          const calendar = payload.preferences.calendarType || 'julian';
          await apiPost('/api/learn/setup', payload);
          const closed = await apiPost(`/api/learn/terms/${encodeURIComponent(termId)}/close`, {});
          localStorage.setItem('agapay.learn.calendar', calendar);
          if (status) {
            status.style.color = 'var(--gold)';
            status.textContent = `${closed.term?.label || 'Term'} closed with ${closed.academicRecords?.length || 0} academic records.`;
          }
          closeButton.textContent = 'Closed';
        } catch (error) {
          if (status) {
            status.style.color = 'var(--burgundy)';
            status.textContent = (error as LearnShellError).message;
          }
          (closeButton as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled = false;
          closeButton.textContent = originalText;
        }
      })();
      return;
    }
    const addChildrenButton = (event.target as HTMLElement).closest<HTMLElement>('[data-setup-add-children]');
    if (addChildrenButton) {
      const list = form.querySelector<HTMLElement>('[data-setup-list="children"]');
      const count = Math.max(1, Math.min(5, Number(addChildrenButton.dataset.setupAddChildren) || 3));
      if (list) {
        for (let index = 0; index < count; index += 1)
          list.insertAdjacentHTML('beforeend', setupBlankRow('children', form, {}));
        syncSetupChildLimit(form);
        scheduleSetupAutosave(250);
      }
      return;
    }
    const removeButton = (event.target as HTMLElement).closest<HTMLElement>('[data-setup-remove-row]');
    if (removeButton) {
      const row = removeButton.closest<HTMLElement>('[data-setup-row]');
      const list = row?.parentElement;
      const removedType = row?.dataset.setupRow;
      // Only "children" must keep at least one row — every other list type
      // (subjects, books, formation rows, etc.) already renders a blank
      // placeholder row when empty, so it's safe to delete down to zero.
      // The old length > 1 guard applied to every row type, which silently
      // blocked deletion on per-group subject panels that usually contain
      // only a single seeded subject (e.g. from the Setup Wizard).
      const matchingSiblingCount = row
        ? [...list!.querySelectorAll<HTMLElement>('[data-setup-row]')].filter(
            (sibling) => sibling.dataset.setupRow === removedType
          ).length
        : 0;
      const mustKeepOne = removedType === 'children';
      if (row && list && (!mustKeepOne || matchingSiblingCount > 1)) {
        row.remove();
        if (removedType === 'terms') syncSetupTermSelects(form);
        if (removedType === 'children') syncSetupChildLimit(form);
      }
      return;
    }
    const addButton = (event.target as HTMLElement).closest<HTMLElement>('[data-setup-add-row]');
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
      const preset: LearnShellNode = {};
      if (addButton.dataset.setupAddSubjectType) preset.subjectType = addButton.dataset.setupAddSubjectType;
      if (addButton.dataset.setupAddBlockType) preset.blockType = addButton.dataset.setupAddBlockType;
      if (addButton.dataset.setupAddDate) preset.date = addButton.dataset.setupAddDate;
      const tileMinutes =
        (
          addButton
            .closest<HTMLElement>('.learn-setup-subsection')
            ?.querySelector<HTMLInputElement>('[data-setup-section-minutes-input]') as
            HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        )?.value?.trim() || '';
      if (tileMinutes && type === 'subjects') preset.minutes = tileMinutes;
      if (tileMinutes && type === 'formationEnrichment') preset.minutesPlanned = tileMinutes;
      const list = addButton.dataset.setupAddTarget
        ? document.getElementById(addButton.dataset.setupAddTarget)
        : form.querySelector<HTMLElement>(`[data-setup-list="${type}"]`);
      if (list) {
        list.insertAdjacentHTML('beforeend', setupBlankRow(type!, form, preset));
        if (type === 'terms') syncSetupTermSelects(form);
        if (type === 'children') syncSetupChildLimit(form);
      }
    }
  });
  form.addEventListener('click', (event) => {
    const autosaveTrigger = (event.target as HTMLElement).closest<HTMLElement>(
      '[data-add-resource], [data-edit-resource], [data-resource-modal-close], [data-resource-modal-save], [data-remove-resource], [data-term-weeks-all], [data-term-weeks-odd], [data-term-weeks-even], [data-setup-remove-row], [data-setup-add-row], [data-setup-add-children]'
    );
    if (!autosaveTrigger || (event.target as HTMLElement).closest<HTMLElement>('[data-close-term]')) return;
    scheduleSetupAutosave(250);
  });
  form.addEventListener('dragstart', (event) => {
    const resourceRow = (event.target as HTMLElement).closest<HTMLElement>('[data-resource-row]');
    if (
      !resourceRow ||
      (event.target as HTMLElement).closest<HTMLButtonElement>('button, a, input, select, textarea, summary, details')
    )
      return;
    draggedResourceRow = resourceRow;
    resourceRow.classList.add('is-dragging');
    event.dataTransfer?.setData('text/plain', resourceRow.dataset.resourceRow || '');
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  });
  form.addEventListener('dragover', (event) => {
    if (!draggedResourceRow) return;
    const subjectRow = (event.target as HTMLElement).closest<HTMLElement>(
      '[data-setup-row="subjects"], [data-setup-row="formationEnrichment"]'
    );
    if (!subjectRow || subjectRow.contains(draggedResourceRow)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    clearResourceDropTargets();
    subjectRow.classList.add('is-resource-drop-target');
  });
  form.addEventListener('dragleave', (event) => {
    const subjectRow = (event.target as HTMLElement).closest<HTMLElement>(
      '[data-setup-row="subjects"], [data-setup-row="formationEnrichment"]'
    );
    if (!subjectRow || subjectRow.contains(event.relatedTarget as Node | null)) return;
    subjectRow.classList.remove('is-resource-drop-target');
  });
  form.addEventListener('drop', (event) => {
    if (!draggedResourceRow) return;
    const subjectRow = (event.target as HTMLElement).closest<HTMLElement>(
      '[data-setup-row="subjects"], [data-setup-row="formationEnrichment"]'
    );
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
export type LearnShell2Part11 = { wireSetupPage: typeof wireSetupPage };
