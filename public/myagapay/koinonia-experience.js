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
  // Use calendar conversion helpers, rather than a fixed 13-day offset.
  function yearProgress(civilDate, calendar) {
    const api = window.AGAPAYLiturgicalCalendar;
    const parts = civilDate.split('-').map(Number);
    if (!api || parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;
    const civilJdn = api.gregorianToJdn(...parts);
    const julian = api.calendarLabel(calendar) === 'Julian';
    const firstDay = (year) => (julian ? api.julianToJdn : api.gregorianToJdn)(year, 9, 1);
    let startYear = parts[0];
    if (civilJdn < firstDay(startYear)) startYear -= 1;
    const start = firstDay(startYear);
    const length = firstDay(startYear + 1) - start;
    return {
      elapsed: civilJdn - start,
      day: civilJdn - start + 1,
      length,
      percent: ((civilJdn - start) / length) * 100,
    };
  }
  function liturgicalDay(date, calendar, churchDate) {
    const target = document.getElementById('koinoniaYearProgress');
    const progress = yearProgress(date, calendar);
    if (!target || !progress) return;
    target.hidden = false;
    const track = target.querySelector('[role="progressbar"]');
    track.setAttribute('aria-valuemax', String(progress.length));
    track.setAttribute('aria-valuenow', String(progress.elapsed));
    track.setAttribute('aria-valuetext', `Day ${progress.day} of ${progress.length} in the church year`);
    target.style.setProperty('--year-progress', `${progress.percent}%`);
    target.querySelector('[data-year-day]').textContent = `Today · Day ${progress.day} of ${progress.length}`;
    const calendarDate = document.getElementById('koinoniaChurchDate');
    if (calendarDate)
      calendarDate.textContent = `${churchDate} · ${window.AGAPAYLiturgicalCalendar.calendarLabel(calendar)}`;
  }
  window.KoinoniaExperience = { parishContext, liturgicalDay, yearProgress };
})();
