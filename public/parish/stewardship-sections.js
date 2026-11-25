(() => {
  const workspace = document.querySelector('#tab-stewardship .sw-section-layout');
  if (!workspace) return;
  const sections = [...workspace.querySelectorAll('[data-sw-panel]')];
  const menu = [...workspace.querySelectorAll('.sw-section-nav [data-sw-view]')];
  const icons = {
    overview: 'M3 3h18v18H3zM3 9h18M9 9v12',
    giving: 'M4 20V4m0 16h16M8 16v-4m4 4V9m4 7V6',
    recurring: 'M20 7v5h-5M4 17v-5h5M5 9a8 8 0 0 1 15-2M4 17a8 8 0 0 0 15-2',
    outside: 'M3 6h18v12H3zM7 12h1m8 0h1m-3 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
    attendance: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-4M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
    reports: 'M5 3h10l4 4v14H5zM15 3v5h4M8 12h8m-8 4h8',
    meetings: 'M3 6h7l2 2h9v12H3zM6 12h12m-12 4h8',
    plan: 'M4 5h16v14H4zM4 9h16M8 15h4',
  };
  for (const item of menu) {
    const path = icons[item.dataset.swView];
    if (path)
      item.insertAdjacentHTML('afterbegin', `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="${path}"/></svg>`);
  }
  workspace.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-sw-view]');
    if (!button) return;
    const section = sections.find((item) => item.dataset.swPanel === button.dataset.swView);
    if (!section) return;
    section.focus({ preventScroll: true });
    section.scrollIntoView({ block: 'start' });
  });
})();
