// Generated from src/browser/parish/features/this-week.ts by npm run build:browser. Do not edit.
(() => {
  const panel = document.getElementById('parishWeekPanel');
  const nav = document.getElementById('parishWeekNavigation');
  const details = document.getElementById('parishWeekContent');
  const message = document.getElementById('parishWeekStatus');
  if (!panel || !nav || !details || !message) return;
  let week = null;
  let parishId = '';
  let selectedDay = '';
  let requestedWeek = '';
  let request = null;
  const dayMs = 864e5;
  const localDate = (day) => /* @__PURE__ */ new Date(`${day}T00:00:00Z`);
  const dayLabel = (day, options) =>
    new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(localDate(day));
  const shiftDay = (day, offset) => new Date(localDate(day).getTime() + offset * dayMs).toISOString().slice(0, 10);
  const numberLabel = (count, singular, plural = singular + 's') => `${count} ${count === 1 ? singular : plural}`;
  function rangeLabel(data) {
    const format = new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
    return format.formatRange(localDate(data.weekStart), localDate(data.weekEnd));
  }
  function timeLabel(value, timeZone) {
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).format(new Date(value));
  }
  function weekLink(href, text) {
    if (!href || !/^\/myagapay\/(groups|signups|events)\?/.test(href)) return '';
    return `<a class="parish-week-link" href="${escapeAttr(href)}">${escapeHtml(text)} <span aria-hidden="true">↗</span></a>`;
  }
  function renderDayButtons(data) {
    const days = Array.from({ length: 7 }, (_, day) => shiftDay(data.weekStart, day));
    return days
      .map((day) => {
        const count = data.events.filter((event) => event.day === day).length;
        const attention =
          day >= data.today && data.serving.some((slot) => slot.day === day && (slot.open > 0 || slot.coverage > 0));
        const description = [
          dayLabel(day, { weekday: 'long', month: 'long', day: 'numeric' }),
          numberLabel(count, 'event'),
          attention ? 'serving needs' : '',
        ]
          .filter(Boolean)
          .join(', ');
        return `<button type="button" class="parish-week-day-button" data-week-day="${day}"
        aria-pressed="${day === selectedDay}" aria-label="${escapeAttr(description)}"
        ${day === data.today ? 'aria-current="date"' : ''}>
        <span>${dayLabel(day, { weekday: 'short' })}</span>
        <strong>${dayLabel(day, { day: 'numeric' })}</strong>
        <span class="parish-week-day-marks" aria-hidden="true">
          ${count ? '<i class="parish-week-date-event"></i>' : ''}
          ${attention ? '<i class="parish-week-date-attention"></i>' : ''}
        </span>
      </button>`;
      })
      .join('');
  }
  function renderEvent(event, timeZone) {
    const kind = { calendar: 'Parish calendar', ministry: 'Ministry', registration: 'Registration' }[event.kind];
    const meta = [event.ministry, event.location].filter(Boolean).join(' · ');
    return `<li class="parish-week-event" data-week-kind="${event.kind}">
      <time datetime="${escapeAttr(event.startsAt)}">${event.allDay ? 'All day' : timeLabel(event.startsAt, timeZone)}</time>
      <div class="parish-week-event-info">
        <div class="parish-week-event-title"><h5>${escapeHtml(event.title)}</h5><span>${kind}</span></div>
        ${meta ? `<p>${escapeHtml(meta)}</p>` : ''}
      </div>
      ${weekLink(event.href, event.kind === 'ministry' ? 'Ministry' : 'Event')}
    </li>`;
  }
  function renderServing(data, slots) {
    const attentionSlots = slots.filter((slot) => slot.day >= data.today && (slot.open > 0 || slot.coverage > 0));
    const filled = slots.filter((slot) => slot.confirmed > 0);
    const ordered = [...attentionSlots, ...slots.filter((slot) => !attentionSlots.includes(slot))];
    const heading = attentionSlots.length ? 'Needs attention' : 'Serving commitments';
    if (!data.signupsEnabled) return '';
    return `<aside class="parish-week-serving" aria-labelledby="parishWeekServingLabel">
      <header>
        <h3 id="parishWeekServingLabel">${heading}</h3>
        <p>${attentionSlots.length ? numberLabel(attentionSlots.length, 'signup') + ' to review' : filled.length ? numberLabel(filled.length, 'signup') + ' with confirmed volunteers' : 'No serving commitments for this view'}</p>
      </header>
      ${
        ordered.length
          ? `<ul>${ordered
              .map((slot) => {
                const isAttention = attentionSlots.includes(slot);
                const badges = isAttention
                  ? [
                      slot.open ? `<span>${numberLabel(slot.open, 'open spot')}</span>` : '',
                      slot.coverage ? `<span>${numberLabel(slot.coverage, 'coverage request')}</span>` : '',
                    ].join('')
                  : `<span>${slot.confirmed} of ${slot.needed} confirmed</span>`;
                return `<li class="parish-week-serving-row" data-needs-attention="${isAttention}">
          <p class="parish-week-serving-team">${escapeHtml(slot.ministry)}</p>
          <h4>${escapeHtml(slot.label)}</h4>
          <p class="parish-week-serving-when">${escapeHtml(slot.title)} · ${dayLabel(slot.day, { weekday: 'short', month: 'short', day: 'numeric' })} · ${timeLabel(slot.startsAt, data.timeZone)}</p>
          <div class="parish-week-serving-footer"><div>${badges}</div>${weekLink(slot.href, 'Signup')}</div>
        </li>`;
              })
              .join('')}</ul>`
          : '<p class="parish-week-empty">Dated ministry signups appear here automatically.</p>'
      }
    </aside>`;
  }
  function render(data) {
    nav.hidden = false;
    const dateRange = rangeLabel(data);
    const range = nav.querySelector('[data-week-range]');
    if (range) range.textContent = dateRange;
    const fullWeek = nav.querySelector('[data-week-action="all"]');
    if (fullWeek) fullWeek.setAttribute('aria-pressed', String(!selectedDay));
    const dayButtons = nav.querySelector('[data-week-days]');
    if (dayButtons) dayButtons.innerHTML = renderDayButtons(data);
    const events = data.events.filter((event) => !selectedDay || event.day === selectedDay);
    const slots = data.serving.filter((slot) => !selectedDay || slot.day === selectedDay);
    const grouped = /* @__PURE__ */ new Map();
    for (const event of events) {
      const existing = grouped.get(event.day);
      if (existing) existing.push(event);
      else grouped.set(event.day, [event]);
    }
    const agenda = [...grouped]
      .map(
        ([day, items]) => `<section class="parish-week-agenda-day">
        <h4><time datetime="${day}">${dayLabel(day, { weekday: 'long', month: 'short', day: 'numeric' })}</time>
          ${day === data.today ? '<span>Today</span>' : ''}
        </h4>
        <ul>${items.map((item) => renderEvent(item, data.timeZone)).join('')}</ul>
      </section>`
      )
      .join('');
    const calendarNotice =
      data.calendarState === 'unavailable'
        ? '<p class="parish-week-notice" role="status">The connected parish calendar could not be loaded. Other events are shown below.</p>'
        : data.calendarState === 'not_connected'
          ? '<p class="parish-week-notice">Connect a calendar in Connections &amp; settings to include parish services.</p>'
          : '';
    details.innerHTML = `<div class="parish-week-grid${data.signupsEnabled ? '' : ' parish-week-grid--agenda-only'}">
      <section class="parish-week-agenda" aria-labelledby="parishWeekAgendaLabel">
        <header>
          <div><h3 id="parishWeekAgendaLabel">${selectedDay ? dayLabel(selectedDay, { weekday: 'long' }) + ' agenda' : 'Agenda'}</h3>
          <p>${numberLabel(events.length, 'scheduled event')}</p></div>
        </header>
        ${calendarNotice}
        ${agenda || '<p class="parish-week-empty">There are no scheduled events in this view.</p>'}
      </section>
      ${renderServing(data, slots)}
    </div>`;
    message.textContent = `${dateRange}. ${numberLabel(events.length, 'scheduled event')} shown.`;
  }
  async function load(nextWeek = requestedWeek) {
    const nextParishId = currentParish?.parishId || '';
    if (!nextParishId) return;
    if (parishId !== nextParishId) {
      nextWeek = '';
      parishId = nextParishId;
      week = null;
      selectedDay = '';
    }
    requestedWeek = nextWeek;
    request?.abort();
    const current = new AbortController();
    request = current;
    panel.setAttribute('aria-busy', 'true');
    nav.hidden = !week;
    details.innerHTML = '<p class="parish-week-empty">Loading the parish week…</p>';
    message.textContent = 'Loading the parish week.';
    const query = nextWeek ? '?' + new URLSearchParams({ week: nextWeek }) : '';
    try {
      const staffToken = sessionStorage.getItem(identitySessionStorageKey);
      const staffEmail = sessionStorage.getItem(identityEmailStorageKey);
      const response = await fetch(`/api/parish/dashboard/${encodeURIComponent(nextParishId)}/this-week${query}`, {
        headers:
          staffToken && staffEmail
            ? { Accept: 'application/json', Authorization: 'Bearer ' + staffToken, 'X-AGAPAY-User-Email': staffEmail }
            : authHeaders(),
        cache: 'no-store',
        signal: current.signal,
      });
      if (!response.ok) throw new Error('Unable to load the parish week.');
      const loaded = await response.json();
      if (current.signal.aborted || currentParish?.parishId !== nextParishId) return;
      if (!loaded.weekStart || !Array.isArray(loaded.events) || !Array.isArray(loaded.serving))
        throw new Error('The parish week response was incomplete.');
      if (loaded.weekStart !== week?.weekStart) selectedDay = '';
      week = loaded;
      render(loaded);
    } catch {
      if (current.signal.aborted || currentParish?.parishId !== nextParishId) return;
      details.innerHTML =
        '<div class="parish-week-empty" role="alert"><p>The parish week could not be loaded.</p><button type="button" data-week-action="retry">Try again</button></div>';
      message.textContent = 'The parish week could not be loaded.';
    } finally {
      if (request === current) {
        request = null;
        panel.setAttribute('aria-busy', 'false');
      }
    }
  }
  panel.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-week-action], button[data-week-day]');
    if (!button) return;
    const { weekAction, weekDay } = button.dataset;
    if (weekAction === 'retry') {
      void load();
      return;
    }
    if (!week || request) return;
    if (weekDay || weekAction === 'all') {
      selectedDay = weekDay === selectedDay ? '' : weekDay || '';
      render(week);
      if (weekDay) nav.querySelector(`[data-week-day="${weekDay}"]`)?.focus();
    } else if (weekAction === 'current') {
      selectedDay = '';
      void load('');
    } else if (weekAction === 'previous' || weekAction === 'next') {
      selectedDay = '';
      void load(shiftDay(week.weekStart, weekAction === 'previous' ? -7 : 7));
    }
  });
  window.ParishFeatureRegistry?.register('this-week', { load });
})();
