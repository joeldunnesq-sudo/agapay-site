// Generated from src/browser/myagapay/koinonia-experience.ts by npm run build:browser. Do not edit.
(function () {
  const iconPaths = {
    signups: '<path d="M9 5H6v16h12V5h-3M9 3h6v4H9zM9 13l2 2 4-4"/>',
    exchange: '<path d="M4 7h15l-4-4M20 17H5l4 4M19 7l-4 4M5 17l4-4"/>',
    prayers: '<path d="M12 2c4 4 3 7 0 7s-4-3 0-7ZM8 11h8l-1 10H9ZM7 21h10"/>',
    groups: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5"/>',
    directory: '<path d="M4 3h16v18H4zM8 3v18M11 8h6M11 12h6M11 16h4"/>',
  };
  function showShortcutAvailability(button) {
    const dialog = document.querySelector('#koinoniaShortcutDialog');
    if (!dialog || dialog.open) return;
    dialog.querySelector('h2').textContent = button.getAttribute('aria-label');
    dialog.querySelector('p').textContent = button.dataset.shortcutMessage || '';
    dialog.showModal();
  }
  function shortcuts(parish, communicationsEnabled, hasKoinoniaAccess) {
    const target = document.getElementById('koinoniaShortcuts');
    if (!target) return;
    target.hidden = hasKoinoniaAccess === void 0;
    if (target.hidden) return;
    const items = [
      ['signups', 'Signups', 'Parish Signups', parish?.signupsEnabled, 'signups'],
      ['exchange', 'Exchange', 'Parish Exchange', parish?.exchangeEnabled, 'exchange'],
      ['prayers', 'Prayers', 'Prayer Requests', parish?.prayerRequestsEnabled, 'prayer-requests'],
      ['groups', 'Ministries', 'Browse Ministries', communicationsEnabled, 'groups'],
      ['directory', 'Directory', 'Parish Directory', parish?.directoryEnabled, 'directory'],
      ['sacraments', 'Sacraments', 'Sacraments & Services', parish?.sacramentsEnabled, 'sacraments'],
    ];
    target.style.setProperty('--shortcut-count', String(items.length));
    target.innerHTML = items
      .map(([id, label, name, enabled, path]) => {
        const icon =
          id === 'sacraments'
            ? window.MyAgapayShell?.icons.sacraments || ''
            : `<svg viewBox="0 0 24 24" aria-hidden="true">${iconPaths[id]}</svg>`;
        const content = `${icon}<span>${label}</span>`;
        if (hasKoinoniaAccess && enabled) {
          const badge = ['signups', 'exchange', 'prayers'].includes(id)
            ? `<b class="koinonia-shortcut-badge" data-community-tool-badge="${id}" hidden></b>`
            : '';
          return `<a class="koinonia-shortcut" href="/myagapay/${path}" aria-label="${name}">${content}${badge}</a>`;
        }
        const message = !parish?.id
          ? 'Choose a church to see which features are available.'
          : enabled && communicationsEnabled
            ? 'Your parish needs to approve your membership before you can use this feature.'
            : 'Your parish needs to enable this feature before you can use it.';
        return `<button class="koinonia-shortcut" type="button" aria-label="${name}" aria-haspopup="dialog" data-shortcut-message="${message}">${content}</button>`;
      })
      .join('');
    target.querySelectorAll('[data-shortcut-message]').forEach((button) => {
      button.addEventListener('click', () => showShortcutAvailability(button));
    });
  }
  function parishContext(parish, communicationsEnabled, hasKoinoniaAccess) {
    const offering = document.getElementById('todayGiveLink');
    if (offering) offering.hidden = !parish?.id;
    shortcuts(parish, communicationsEnabled, hasKoinoniaAccess);
  }
  function compactFasting(chips, rule) {
    const pill = [...chips.querySelectorAll('span')].find((item) => item.textContent === rule);
    if (!pill) return;
    const full = String(rule || '').trim();
    const short = full.replace(/^fast\s*[-–—:]\s*/i, '').trim();
    pill.textContent = /\bno fast(?:ing)?\b|\bfast[- ]free\b/i.test(full)
      ? 'No fast'
      : /^(strict )?fast(?: day)?$/i.test(full)
        ? 'Plant foods · no oil/wine'
        : short;
    pill.title = full;
    pill.setAttribute('aria-label', full);
    pill.classList.add('koinonia-fasting-pill');
  }
  function liturgicalDay(_date, calendar, churchDate) {
    const calendarDate = document.getElementById('koinoniaChurchDate');
    if (calendarDate)
      calendarDate.textContent = `${churchDate} · ${window.AGAPAYLiturgicalCalendar.calendarLabel(calendar)}`;
  }
  window.KoinoniaExperience = { parishContext, liturgicalDay, compactFasting };
})();
