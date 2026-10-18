import type {
  LearnShellWeekAssignment,
  LearnShellNode,
  LearnShellPayload,
  LearnShellError,
  LearnPlannerVm,
} from './dashboard-shell-contracts.js';
import type { LearnShellBindings } from './dashboard-shell.js';

// Match Boolean filtering while exposing its non-null result to TypeScript.
function truthyLearn13<T>(value: T): value is NonNullable<T> {
  return Boolean(value);
}

declare const root: LearnShellBindings['root'];
declare const weekAssignmentStorageKey: LearnShellBindings['weekAssignmentStorageKey'];
declare let learnGoogleCalendarStatus: LearnShellBindings['learnGoogleCalendarStatus'];
declare const syncLearnGoogleCalendar: LearnShellBindings['syncLearnGoogleCalendar'];
declare const storedLearnCalendar: LearnShellBindings['storedLearnCalendar'];
declare const learnApiUrl: LearnShellBindings['learnApiUrl'];
declare const learnRequestHeaders: LearnShellBindings['learnRequestHeaders'];
declare const waitForLearnSignIn: LearnShellBindings['waitForLearnSignIn'];
declare const downloadBlob: LearnShellBindings['downloadBlob'];
declare const isLearnFamilyPlan: LearnShellBindings['isLearnFamilyPlan'];
declare const setPrintCount: LearnShellBindings['setPrintCount'];
declare const printCount: LearnShellBindings['printCount'];
declare const showLearnDialog: LearnShellBindings['showLearnDialog'];
declare const apiPost: LearnShellBindings['apiPost'];
declare const mount: LearnShellBindings['mount'];

function wireWeeklyAssignmentBoard(vm: LearnPlannerVm) {
  const board = root!.querySelector<HTMLElement>('[data-week-assignment-board]');
  if (!board) return;
  const storageKey = weekAssignmentStorageKey(vm, board.dataset.weekKey || 'week');
  const formStorageKey = `${storageKey}.form`;
  const familyViewStorageKey = 'agapay.learn.weekPlanner.familyView'; // household-wide preference, not per-week
  const zones = [...board.querySelectorAll<HTMLElement>('[data-week-assignment-zone]')];
  const formButtons = [...board.querySelectorAll<HTMLButtonElement>('[data-week-form-filter]')];
  const availableForms = formButtons.map((button) => button.dataset.weekFormFilter).filter(truthyLearn13);
  const familyLane = board.querySelector<HTMLElement>('[data-family-lane]');
  const familyLaneZone = board.querySelector<HTMLElement>('[data-week-assignment-zone="pool-family"]');
  const familyToggle = board.querySelector<HTMLInputElement>('[data-family-view-toggle]');
  const familyToggleState = board.querySelector<HTMLElement>('[data-family-view-state]');
  const autoFillButton = board.querySelector<HTMLButtonElement>('[data-week-auto-fill]');
  const resetFormButton = board.querySelector<HTMLButtonElement>('[data-week-reset-form]');
  const cardFormLabels = (card: HTMLElement) =>
    (card.dataset.weekFormLabels || '')
      .split('|')
      .map((label: string) => label.trim())
      .filter(truthyLearn13);
  const isFamilyCard = (card: HTMLElement) => {
    const labels = cardFormLabels(card);
    return !labels.length || labels.includes('__family') || labels.includes('Household Form');
  };
  // familyViewMode: "mixed" (default) shows family subjects inside every Form tab's pool.
  // "separated" pulls them into their own dedicated lane shown above the Form pool at all times.
  const familyViewFromStorage = () => {
    try {
      // Default is now "separated": Form pools show only that Form's subjects,
      // and family-wide subjects live in the Family tab / dedicated lane. A
      // household can still flip back to "mixed" via the toggle if they'd
      // rather see family subjects repeated inside every Form's pool.
      const saved = localStorage.getItem(familyViewStorageKey);
      return saved === 'mixed' ? 'mixed' : 'separated';
    } catch {
      return 'separated';
    }
  };
  let familyViewMode = familyViewFromStorage();
  const cardVisibleForForm = (card: HTMLElement, formLabel: string) => {
    const labels = cardFormLabels(card);
    if (!formLabel || !availableForms.length) return true;
    // The "Family" tab filters the pool down to only family/household cards,
    // exactly like a Form tab filters down to that Form's cards — independent
    // of the mixed/separated toggle, which only governs default visibility
    // when no specific tab (Form or Family) has been chosen to isolate.
    if (formLabel === '__family') return isFamilyCard(card);
    if (isFamilyCard(card)) {
      // Mixed mode: family cards show under every Form tab. Separated mode: they live
      // in the dedicated lane instead, so hide them from the per-Form pool entirely.
      return familyViewMode === 'mixed';
    }
    return labels.includes(formLabel);
  };
  const applyFamilyViewMode = () => {
    if (!familyLane) return;
    // Don't show the dedicated family lane while the Family tab itself is the
    // active filter — the pool is already showing exactly those cards, so a
    // second copy in the lane would be redundant.
    const separated = familyViewMode === 'separated' && availableForms.length > 0 && activeFormLabel !== '__family';
    familyLane.hidden = !separated;
    if (familyToggle) (familyToggle as HTMLInputElement).checked = familyViewMode === 'mixed';
    if (familyToggleState)
      familyToggleState.textContent = familyViewMode === 'mixed' ? 'with each Form' : 'in its own lane';
    // Move family-only cards (that aren't placed in a day) between the family lane and the main pool
    if (familyLaneZone) {
      const mainPool = board.querySelector<HTMLElement>('[data-week-assignment-zone="pool"]');
      board
        .querySelectorAll<HTMLElement>('[data-week-assignment-card]:not([data-auto-original])')
        .forEach((card: HTMLElement) => {
          if (!isFamilyCard(card)) return;
          const inDayZone = card.closest<HTMLElement>('[data-week-assignment-zone]')?.dataset.weekAssignmentZone;
          const isPlacedInDay = inDayZone && inDayZone !== 'pool' && inDayZone !== 'pool-family';
          if (isPlacedInDay) return; // leave manually-placed cards where they are
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
  const applyFormFilter = (formLabel: string = activeFormLabel) => {
    activeFormLabel = formLabel || '';
    if (activeFormLabel) board.dataset.activeWeekForm = activeFormLabel;
    else delete board.dataset.activeWeekForm;
    formButtons.forEach((button) => {
      button.setAttribute('aria-pressed', button.dataset.weekFormFilter === activeFormLabel ? 'true' : 'false');
    });
    const poolHeading = board.querySelector<HTMLElement>('[data-pool-heading]');
    if (poolHeading) {
      poolHeading.textContent =
        activeFormLabel === '__family'
          ? 'Family — Everyone subjects'
          : activeFormLabel && availableForms.length
            ? `${activeFormLabel} subjects`
            : 'Available subjects';
    }
    board.querySelectorAll<HTMLElement>('[data-week-assignment-card]').forEach((card: HTMLElement) => {
      const visible = cardVisibleForForm(card, activeFormLabel);
      // Auto-originals: use style.display (they're never rendered via hidden attr)
      if (card.dataset.autoOriginal) {
        card.style.display = 'none'; // always hidden — clones are in day zones
      } else if (card.dataset.autoPlaced) {
        // Clones in day zones: show/hide based on form filter
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
      ...board.querySelectorAll<HTMLElement>('[data-week-assignment-zone="pool"] > [data-week-assignment-card]'),
    ].filter((card: HTMLElement) => !card.hidden && card.style.display !== 'none');
    const poolCount = board.querySelector<HTMLElement>('[data-pool-count]');
    if (poolCount) poolCount.textContent = `${visiblePoolCards.length} unplaced`;
  };
  const readState = () => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || '{}') as Record<string, LearnShellWeekAssignment>;
    } catch {
      return {};
    }
  };
  const writeState = () => {
    const state: Record<string, LearnShellWeekAssignment> = {};
    board.querySelectorAll<HTMLElement>('[data-week-assignment-card]').forEach((card: HTMLElement) => {
      const zone = card.closest<HTMLElement>('[data-week-assignment-zone]');
      const zoneKey = zone?.dataset.weekAssignmentZone || 'pool';
      const itemId = card.dataset.itemId;
      const sourceId = card.dataset.sourceItemId || itemId;
      const note =
        (
          card.querySelector<HTMLTextAreaElement>('[data-week-assignment-note]') as
            HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        )?.value || '';
      if (card.dataset.autoOriginal) {
        state[itemId as string] = { zone: 'auto', autoPlaced: true };
      } else if (card.dataset.autoPlaced) {
        // Auto-placed clones: key by sourceId__zone so each day slot is independent
        (state as unknown as Record<string, (typeof state)[keyof typeof state] | undefined>)[
          `${sourceId}__auto__${zoneKey}`
        ] = { zone: zoneKey, note, autoPlaced: true, sourceId };
        // Also mark the source item as auto-distributed so restore knows
        if (!state[sourceId as string]) state[sourceId as string] = { zone: 'auto', autoPlaced: true };
      } else {
        state[itemId as string] = { zone: zoneKey, note };
      }
    });
    localStorage.setItem(storageKey, JSON.stringify(state));
    scheduleDesignedWeekCalendarSync();
  };
  const wireCard = (card: HTMLElement) => {
    card.addEventListener('dragstart', (event: DragEvent) => {
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
    card.querySelector<HTMLTextAreaElement>('[data-week-assignment-note]')?.addEventListener('input', writeState);
  };
  // Day zones in DOM order (Sun=index 0, Mon=1 … Sat=6 matching statuses array).
  const dayZones = [
    ...board.querySelectorAll<HTMLElement>(
      "[data-week-assignment-zone]:not([data-week-assignment-zone='pool']):not([data-week-assignment-zone='pool-family'])"
    ),
  ];
  const autoPlaceCard = (card: HTMLElement, state = readState()) => {
    const id = card.dataset.sourceItemId || card.dataset.itemId;
    const statuses = (card.dataset.statuses || '').split(',');
    const activeDayIndexes = statuses
      .map((status, index: number) => (status === 'planned' ? index : -1))
      .filter((index: number) => index >= 0);
    if (!id || !activeDayIndexes.length) return 0;
    card.style.display = 'none';
    card.dataset.autoOriginal = 'true';
    let placed = 0;
    activeDayIndexes.forEach((dayIndex) => {
      const zone = dayZones[dayIndex];
      if (!zone || zone.querySelector<HTMLElement>(`[data-source-item-id="${CSS.escape(id)}"]`)) return;
      const autoKey = `${id}__auto__${zone.dataset.weekAssignmentZone}`;
      const savedClone = state[autoKey];
      const clone = card.cloneNode(true) as HTMLElement;
      clone.dataset.itemId = autoKey;
      clone.dataset.sourceItemId = id;
      clone.dataset.autoPlaced = 'true';
      delete clone.dataset.autoOriginal;
      clone.style.display = '';
      const cloneNote = clone.querySelector<HTMLTextAreaElement>('[data-week-assignment-note]');
      if (cloneNote) {
        cloneNote.value = savedClone?.note || '';
        cloneNote.placeholder = 'Specify chapters, pages, lessons, or notes for this day';
      }
      const targetZoneKey =
        savedClone?.zone && savedClone.zone !== zone.dataset.weekAssignmentZone
          ? savedClone.zone
          : zone.dataset.weekAssignmentZone;
      const targetZone =
        board.querySelector<HTMLElement>(`[data-week-assignment-zone="${CSS.escape(targetZoneKey!)}"]`) || zone;
      targetZone.appendChild(clone);
      wireCard(clone);
      placed += 1;
    });
    return placed;
  };
  const restore = () => {
    const state = readState();
    board.querySelectorAll<HTMLElement>('[data-week-assignment-card]').forEach((card: HTMLElement) => {
      const id = card.dataset.itemId;
      const saved = state[id as string];
      if (saved && saved.zone && saved.zone !== 'auto') {
        // Manual placement from a previous session — honour it exactly
        const target = board.querySelector<HTMLElement>(`[data-week-assignment-zone="${CSS.escape(saved.zone)}"]`);
        if (target) target.appendChild(card);
        const note = card.querySelector<HTMLTextAreaElement>('[data-week-assignment-note]');
        if (note && saved.note) (note as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value = saved.note;
        return;
      }
      const statuses = (card.dataset.statuses || '').split(',');
      const isAutoEligible = statuses.includes('planned') && availableForms.length === 0;
      if (isAutoEligible) autoPlaceCard(card, state);
    });
  };
  restore();
  // Wire drag + note events for pool originals (non-auto cards)
  board.querySelectorAll<HTMLElement>('[data-week-assignment-card]:not([data-auto-placed])').forEach(wireCard);

  // ── Compact-card expand → modal ──────────────────────────────────────────
  function openLearnCardModal(card: HTMLElement) {
    if (document.querySelector<HTMLElement>('.learn-card-modal-backdrop')) return;
    const itemId = card.dataset.itemId || '';
    const title = card.querySelector<HTMLElement>('strong')?.textContent?.trim() || 'Subject';
    const sub = card.dataset.itemSub || card.querySelector<HTMLElement>('small')?.textContent?.trim() || '';
    const color = card.dataset.itemColor || card.style.borderLeftColor || 'var(--gold)';
    const note =
      (
        card.querySelector<HTMLTextAreaElement>('[data-week-assignment-note]') as
          HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      )?.value || '';
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
    bd.querySelector<HTMLElement>('.learn-card-modal-close')!.addEventListener('click', closeModal);
    bd.querySelector<HTMLElement>('.learn-modal-btn-cancel')!.addEventListener('click', closeModal);
    bd.addEventListener('click', (e) => {
      if (e.target === bd) closeModal();
    });
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', onKey);
      }
    });

    bd.querySelector<HTMLElement>('.learn-modal-btn-save')!.addEventListener('click', () => {
      const noteVal =
        (bd.querySelector<HTMLElement>("[name='note']") as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)
          ?.value || '';
      const graceVal =
        (
          bd.querySelector<HTMLElement>("[name='gracePriority']") as
            HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        )?.value || gracePri;
      // Write note back to the hidden textarea on the card
      const noteEl = card.querySelector<HTMLTextAreaElement>('[data-week-assignment-note]');
      if (noteEl) (noteEl as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value = noteVal;
      // Update grace priority data attr so filter still works
      card.dataset.gracePriority = graceVal;
      // Trigger writeState so the designed-week payload stays in sync
      writeState();
      closeModal();
    });
  }

  board.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-card-expand]');
    if (!btn) return;
    e.stopPropagation();
    const card = btn.closest<HTMLElement>('[data-week-assignment-card]');
    if (card) openLearnCardModal(card);
  });
  // ── end modal wiring ──────────────────────────────────────

  autoFillButton?.addEventListener('click', () => {
    const state = readState();
    const poolCards = [
      ...board.querySelectorAll<HTMLElement>(
        '[data-week-assignment-zone="pool"] > [data-week-assignment-card], [data-week-assignment-zone="pool-family"] > [data-week-assignment-card]'
      ),
    ].filter((card: HTMLElement) => !card.dataset.autoPlaced && cardVisibleForForm(card, activeFormLabel));
    const placements = poolCards.reduce((total, card: HTMLElement) => total + autoPlaceCard(card, state), 0);
    writeState();
    applyFormFilter(activeFormLabel);
    const original = autoFillButton.textContent;
    autoFillButton.textContent = placements ? `Placed ${placements} lessons` : 'Nothing new to place';
    window.setTimeout(() => {
      autoFillButton.textContent = original;
    }, 1600);
  });

  resetFormButton?.addEventListener('click', () => {
    const mainPool = board.querySelector<HTMLElement>('[data-week-assignment-zone="pool"]');
    if (!mainPool) return;
    const matchesActiveGroup = (card: HTMLElement) => cardVisibleForForm(card, activeFormLabel);
    [...board.querySelectorAll<HTMLElement>('[data-week-assignment-card][data-auto-original]')]
      .filter(matchesActiveGroup)
      .forEach((source) => {
        const sourceId = source.dataset.itemId || '';
        board
          .querySelectorAll<HTMLElement>(`[data-week-assignment-card][data-source-item-id="${CSS.escape(sourceId)}"]`)
          .forEach((clone) => clone.remove());
        delete source.dataset.autoOriginal;
        source.style.display = '';
        mainPool.appendChild(source);
      });
    dayZones.forEach((zone) => {
      [...zone.querySelectorAll<HTMLElement>(':scope > [data-week-assignment-card]:not([data-auto-placed])')]
        .filter(matchesActiveGroup)
        .forEach((card: HTMLElement) => mainPool.appendChild(card));
    });
    writeState();
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
    familyViewMode = (familyToggle as HTMLInputElement).checked ? 'mixed' : 'separated';
    try {
      localStorage.setItem(familyViewStorageKey, familyViewMode);
    } catch {}
    applyFormFilter(activeFormLabel);
  });
  applyFormFilter(activeFormLabel);
  const designedWeekPayload = () => {
    const itemLookup = new Map((vm.week?.weeklyAssignmentItems || []).map((item) => [item.id, item]));
    const assignmentForCard = (card: HTMLElement) => {
      // Resolve metadata from source item for auto-placed clones
      const sourceId = card.dataset.sourceItemId || card.dataset.itemId;
      const item: LearnShellNode =
        itemLookup.get(sourceId as string) || itemLookup.get(card.dataset.itemId as string) || {};
      return {
        id: sourceId || '',
        title: card.querySelector<HTMLElement>('strong')?.textContent?.trim() || item.title || 'Subject',
        sub: card.querySelector<HTMLElement>('small')?.textContent?.trim() || item.sub || '',
        note:
          (
            card.querySelector<HTMLTextAreaElement>('[data-week-assignment-note]') as
              HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
          )?.value?.trim() || '',
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
        const zone = board.querySelector<HTMLElement>(`[data-week-assignment-zone="${CSS.escape(day.date)}"]`);
        return {
          date: day.date || '',
          weekday: day.weekdayLong || day.weekday || '',
          shortDate: day.shortDate || '',
          feast: day.isSunday ? 'Church & Rest' : day.feast || '',
          isSunday: Boolean(day.isSunday),
          assignments: zone
            ? [...zone.querySelectorAll<HTMLElement>('[data-week-assignment-card]')].map(assignmentForCard)
            : [],
        };
      }),
      unassigned: [
        ...(board
          .querySelector<HTMLElement>('[data-week-assignment-zone="pool"]')
          ?.querySelectorAll<HTMLElement>('[data-week-assignment-card]') || []),
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
  let designedWeekSyncTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleDesignedWeekCalendarSync = () => {
    if (!learnGoogleCalendarStatus.configured || !learnGoogleCalendarStatus.connected) return;
    clearTimeout(designedWeekSyncTimer as number | undefined);
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
      const card = id
        ? board.querySelector<HTMLElement>(`[data-week-assignment-card][data-item-id="${CSS.escape(id)}"]`)
        : null;
      if (card) {
        zone.appendChild(card);
        writeState();
        applyFormFilter(activeFormLabel);
      }
    });
  });
  board.querySelector<HTMLButtonElement>('[data-week-designed-print]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const originalText = (button as HTMLElement).textContent;
    (button as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled = true;
    (button as HTMLElement).textContent = 'Generating...';
    writeState();
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
        const payload = (await response.json().catch(() => ({}))) as LearnShellPayload;
        throw new Error(payload.error || 'Unable to generate the designed week PDF.');
      }
      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') || '';
      const fileMatch = disposition.match(/filename="([^"]+)"/);
      downloadBlob(fileMatch?.[1] || 'agapay-learn-designed-week.pdf', blob);
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
      (button as HTMLElement).textContent = originalText;
    }
  });

  // ── Appointment cards on the Lessons week board ──────────────────────────
  // This board has no surrounding <form> (the family planner form only mounts
  // for the Meals/Chores/Events scopes), so appointments here save directly
  // through the family-planning API rather than via form submission.
  const apptModal = board.querySelector<HTMLElement>('[data-week-appt-modal]');
  let activeApptEntry: LearnShellNode | null = null; // the appointment currently open in the modal, or null when adding new
  const apptField = (name: string) => apptModal?.querySelector<HTMLElement>(`[name="${CSS.escape(name)}"]`) || null;
  const setApptField = (name: string, value: unknown) => {
    const el = apptField(name);
    if (el) (el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value = String(value || '');
  };
  const getApptField = (name: string) =>
    (apptField(name) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)?.value?.trim() || '';

  const openApptModal = (entry?: LearnShellNode | undefined) => {
    if (!apptModal) return;
    activeApptEntry = entry?.id ? entry : null;
    setApptField('weekApptModal.title', entry?.title || '');
    setApptField('weekApptModal.eventType', entry?.eventType || 'Family');
    setApptField('weekApptModal.date', entry?.date || '');
    setApptField('weekApptModal.startTime', entry?.startTime || '');
    setApptField('weekApptModal.recurrence', entry?.recurrence || 'none');
    setApptField('weekApptModal.location', entry?.location || '');
    setApptField('weekApptModal.notes', entry?.notes || '');
    const deleteBtn = apptModal.querySelector<HTMLButtonElement>('[data-week-appt-delete]');
    if (deleteBtn) deleteBtn.hidden = !entry?.id;
    const titleEl = apptModal.querySelector<HTMLElement>('[data-week-appt-modal-title]');
    if (titleEl) titleEl.textContent = entry?.id ? 'Edit appointment' : 'Add appointment';
    apptModal.hidden = false;
    apptModal.style.display = 'flex';
    apptModal.querySelector<HTMLInputElement>('input, textarea, button')?.focus();
  };
  const closeApptModal = () => {
    if (apptModal) {
      apptModal.hidden = true;
      apptModal.style.display = 'none';
    }
    activeApptEntry = null;
  };

  // Persist appointments by sending the full familyPlanning payload back —
  // the save endpoint replaces familyPlanning wholesale, so every other
  // field (meals, recipes, groceries, chores) must be carried through as-is.
  const saveWeekAppointments = async (events: LearnShellNode[]) => {
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
      date: params.get('date') || vm.day?.selected?.date || new Date().toISOString().slice(0, 10),
    });
    const saved = await apiPost(`/api/learn/family-planning?${saveQuery.toString()}`, payload);
    await syncLearnGoogleCalendar([], null);
    return saved;
  };

  const currentWeekAppointments = () =>
    [...board.querySelectorAll<HTMLElement>('[data-week-appt-drag]')]
      .map((card: HTMLElement) => ({
        id: card.dataset.apptId || '',
        title: card.dataset.apptTitle || '',
        eventType: card.dataset.apptType || '',
        date: card.dataset.apptDate || '',
        startTime: card.dataset.apptTime || '',
        recurrence: card.dataset.apptRecurrence || 'none',
        location: card.dataset.apptLocation || '',
        notes: card.dataset.apptNotes || '',
      }))
      .filter((entry: LearnShellNode) => entry.title && entry.date);

  board.querySelectorAll<HTMLButtonElement>('[data-week-appt-open]').forEach((btn) => {
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
  board.querySelectorAll<HTMLButtonElement>('[data-week-appt-add]').forEach((btn) => {
    btn.addEventListener('click', () => {
      openApptModal({ id: '', date: btn.dataset.apptDate || '', eventType: 'Family', recurrence: 'none' });
    });
  });
  apptModal
    ?.querySelectorAll<HTMLButtonElement>('[data-week-appt-modal-close]')
    .forEach((btn) => btn.addEventListener('click', closeApptModal));
  apptModal?.addEventListener('click', (event) => {
    if (event.target === apptModal) closeApptModal();
  });

  apptModal?.querySelector<HTMLButtonElement>('[data-week-appt-save]')?.addEventListener('click', async () => {
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
      showLearnDialog('Could Not Save Appointment', (error as LearnShellError).message || 'Please try again.', []);
    }
  });

  apptModal?.querySelector<HTMLButtonElement>('[data-week-appt-delete]')?.addEventListener('click', async () => {
    if (!activeApptEntry?.id) {
      closeApptModal();
      return;
    }
    const events = currentWeekAppointments().filter((existing) => existing.id !== activeApptEntry!.id);
    closeApptModal();
    try {
      await saveWeekAppointments(events);
      mount();
    } catch (error) {
      showLearnDialog('Could Not Delete Appointment', (error as LearnShellError).message || 'Please try again.', []);
    }
  });

  // Drag-and-drop between days
  let draggedApptCard: HTMLElement | null = null;
  board.querySelectorAll<HTMLElement>('[data-week-appt-drag]').forEach((card: HTMLElement) => {
    card.addEventListener('dragstart', (event) => {
      draggedApptCard = card;
      card.classList.add('is-dragging');
      event.dataTransfer?.setData('text/plain', card.dataset.apptId || card.dataset.apptTitle || '');
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('is-dragging');
      draggedApptCard = null;
      board
        .querySelectorAll<HTMLElement>('[data-week-appt-dropzone]')
        .forEach((zone) => zone.classList.remove('is-over'));
    });
  });
  board.querySelectorAll<HTMLElement>('[data-week-appt-dropzone]').forEach((zone) => {
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
      // Move the card in the DOM immediately so the change is visible right away,
      // ahead of the save confirming it.
      sourceCard.dataset.apptDate = targetDate;
      sourceCard.querySelector<HTMLButtonElement>('[data-week-appt-open]')?.setAttribute('data-appt-date', targetDate);
      zone.appendChild(sourceCard);
      try {
        await saveWeekAppointments(currentWeekAppointments());
        mount();
      } catch (error) {
        showLearnDialog('Could Not Move Appointment', (error as LearnShellError).message || 'Please try again.', []);
      }
    });
  });
}
export type LearnShell2Part12 = { wireWeeklyAssignmentBoard: typeof wireWeeklyAssignmentBoard };
