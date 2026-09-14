(function () {
  'use strict';

  function progressFor(date, calendar) {
    const api = window.AGAPAYLiturgicalCalendar;
    if (!api || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return null;
    const parts = date.split('-').map(Number);
    const current = api.gregorianToJdn(...parts);
    const firstDay = (year) =>
      (api.calendarLabel(calendar) === 'Julian' ? api.julianToJdn : api.gregorianToJdn)(year, 9, 1);
    let year = parts[0];
    if (current < firstDay(year)) year -= 1;
    const start = firstDay(year);
    const length = firstDay(year + 1) - start;
    const elapsed = current - start;
    return { elapsed, day: elapsed + 1, length, percent: (elapsed / length) * 100 };
  }

  function render(date, calendar) {
    const card = document.getElementById('calendarChurchYear');
    if (!card) return;
    const progress = progressFor(date, calendar);
    card.hidden = !progress;
    if (!progress) return;
    const label = window.AGAPAYLiturgicalCalendar.calendarLabel(calendar);
    const track = card.querySelector('[role="progressbar"]');
    track.setAttribute('aria-valuemax', String(progress.length));
    track.setAttribute('aria-valuenow', String(progress.elapsed));
    track.setAttribute('aria-valuetext', `Day ${progress.day} of ${progress.length} · ${label} calendar`);
    card.style.setProperty('--year-progress', `${progress.percent}%`);
    card.querySelector('[data-year-day]').textContent = `Day ${progress.day} of ${progress.length}`;
    card.querySelector('[data-year-calendar]').textContent = `${label} calendar`;
  }

  window.KoinoniaChurchYear = { render, progressFor };
})();
