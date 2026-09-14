(function () {
  const iconPaths = {
    signups: '<path d="M9 5H6v16h12V5h-3M9 3h6v4H9zM9 13l2 2 4-4"/>',
    exchange: '<path d="M4 7h15l-4-4M20 17H5l4 4M19 7l-4 4M5 17l4-4"/>',
    prayers: '<path d="M12 2c4 4 3 7 0 7s-4-3 0-7ZM8 11h8l-1 10H9ZM7 21h10"/>',
    groups: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5"/>',
    directory: '<path d="M4 3h16v18H4zM8 3v18M11 8h6M11 12h6M11 16h4"/>',
  };
  function shortcuts(parish, communicationsEnabled) {
    const target = document.getElementById('koinoniaShortcuts');
    if (!target) return;
    const items = [
      ['signups', 'Signups', 'Parish Signups', parish?.signupsEnabled, 'signups'],
      ['exchange', 'Exchange', 'Parish Exchange', parish?.exchangeEnabled, 'exchange'],
      ['prayers', 'Prayers', 'Prayer Requests', parish?.prayerRequestsEnabled, 'prayer-requests'],
      ['groups', 'Ministries', 'Browse Ministries', communicationsEnabled, 'groups'],
      ['directory', 'Directory', 'Parish Directory', parish?.directoryEnabled, 'directory'],
    ].filter((item) => item[3]);
    target.hidden = !communicationsEnabled || !items.length;
    target.style.setProperty('--shortcut-count', items.length || 1);
    target.innerHTML = items
      .map(([id, label, name, , path]) => {
        const badge = ['signups', 'exchange', 'prayers'].includes(id)
          ? `<b class="koinonia-shortcut-badge" data-community-tool-badge="${id}" hidden></b>`
          : '';
        return `<a href="/myagapay/${path}" aria-label="${name}"><svg viewBox="0 0 24 24" aria-hidden="true">${iconPaths[id]}</svg><span>${label}</span>${badge}</a>`;
      })
      .join('');
  }
  function parishContext(parish, communicationsEnabled) {
    const name = document.getElementById('koinoniaParishName');
    if (name) name.textContent = parish?.name || 'Your church calendar';
    const offering = document.getElementById('todayGiveLink');
    if (offering) offering.hidden = !parish?.id;
    shortcuts(parish, communicationsEnabled);
  }
  function compactFasting(chips, rule) {
    const pill = [...chips.querySelectorAll('span')].find((item) => item.textContent === rule);
    if (!pill) return;
    const full = String(rule || '').trim();
    const short = full.replace(/\s*\([^)]*\)/g, '').trim();
    pill.textContent = /\bno fast(?:ing)?\b|\bfast[- ]free\b/i.test(full)
      ? 'No fast'
      : short.length <= 18
        ? short
        : 'Fast';
    pill.title = full;
    pill.setAttribute('aria-label', full);
    pill.classList.add('koinonia-fasting-pill');
  }
  function liturgicalDay(date, calendar, churchDate) {
    const calendarDate = document.getElementById('koinoniaChurchDate');
    if (calendarDate)
      calendarDate.textContent = `${churchDate} · ${window.AGAPAYLiturgicalCalendar.calendarLabel(calendar)}`;
  }
  window.KoinoniaExperience = { parishContext, liturgicalDay, compactFasting };
})();
