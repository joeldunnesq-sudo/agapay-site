(() => {
  const workspace = document.querySelector('#tab-givers .gv-section-layout');
  if (!workspace) return;
  const panels = [...workspace.querySelectorAll('[data-gv-panel]')];
  const buttons = [...workspace.querySelectorAll('[data-gv-view]')];
  const icons = {
    records: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-4M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
    statements: 'M5 3h10l4 4v14H5zM15 3v5h4M8 12h8m-8 4h8',
    outside: 'M3 6h18v12H3zM7 12h1m8 0h1m-3 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
    exports: 'M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5',
  };
  for (const button of buttons) {
    button.insertAdjacentHTML(
      'afterbegin',
      `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="${icons[button.dataset.gvView]}"/></svg>`
    );
  }
  workspace.addEventListener('click', (event) => {
    const trigger = event.target.closest('button[data-gv-view], button[data-gv-statement]');
    if (!trigger) return;
    const email = trigger.dataset.gvStatement;
    const view = email ? 'statements' : trigger.dataset.gvView;
    const selected = buttons.find((button) => button.dataset.gvView === view);
    if (!selected) return;
    panels.forEach((panel) => {
      panel.hidden = panel.dataset.gvPanel !== view;
    });
    buttons.forEach((button) => {
      button.setAttribute('aria-pressed', String(button === selected));
    });
    if (email) {
      const donor = workspace.querySelector('#gsPreviewDonor');
      if (donor && [...donor.options].some((option) => option.value === email)) donor.value = email;
      selected.focus();
    }
  });
})();
