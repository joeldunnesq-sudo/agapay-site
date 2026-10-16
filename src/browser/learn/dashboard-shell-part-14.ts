import type { LearnShellPayload, LearnShellError, LearnPlannerVm } from './dashboard-shell-contracts.js';
import type { LearnShellBindings } from './dashboard-shell.js';

declare const root: LearnShellBindings['root'];
declare const learnApiUrl: LearnShellBindings['learnApiUrl'];
declare const learnRequestHeaders: LearnShellBindings['learnRequestHeaders'];
declare const mount: LearnShellBindings['mount'];
declare const showLearnDialog: LearnShellBindings['showLearnDialog'];

function wireMoveUnfinishedWork(vm: LearnPlannerVm) {
  root!.querySelectorAll<HTMLButtonElement>('[data-move-unfinished] button[data-move-mode]').forEach((button) => {
    button.addEventListener('click', async () => {
      const wrap = button.closest<HTMLElement>('[data-move-unfinished]');
      if (!wrap) return;
      const scope = wrap.dataset.moveScope || 'household';
      const rowId = wrap.dataset.moveRowId || '';
      const fromWeekday = Number(wrap.dataset.moveWeekday);
      const mode = button.dataset.moveMode || 'next-open-day';
      if (!rowId || !Number.isInteger(fromWeekday)) return;
      const buttons = wrap.querySelectorAll<HTMLButtonElement>('button');
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
        const payload = (await response.json().catch(() => ({}))) as LearnShellPayload;
        if (!response.ok || !payload.ok)
          throw new Error(payload.error || 'That lesson could not be moved. Please try again.');
        mount();
      } catch (error) {
        buttons.forEach((b) => {
          b.disabled = false;
        });
        showLearnDialog(
          "Couldn't Move That Lesson",
          (error as LearnShellError).message || 'Please refresh and try again.',
          []
        );
      }
    });
  });
}
export type LearnShell2Part13 = { wireMoveUnfinishedWork: typeof wireMoveUnfinishedWork };
