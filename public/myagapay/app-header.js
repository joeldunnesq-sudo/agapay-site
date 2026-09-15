(function () {
  'use strict';

  const titles = {
    account: 'Account',
    bookstore: 'Bookstore',
    directory: 'Directory',
    events: 'Meals & Events',
    exchange: 'Parish Exchange',
    feed: 'Announcements',
    groups: 'Groups',
    library: 'Parish Library',
    media: 'Video Library',
    news: 'Parish News',
    'parish-life': 'Koinonia',
    'prayer-requests': 'Prayer Requests',
    sacraments: 'Sacraments & Services',
    signups: 'Parish Signups',
    teaching: 'Audio Library',
    watch: 'Watch',
    'giving/history': 'Giving History',
    'giving/calendar': 'Calendar',
    'giving/give': 'Make a Gift',
  };
  const descriptions = {
    account: 'Manage your profile and preferences.',
    bookstore: 'Books, icons, and gifts from your parish.',
    directory: 'Connect with your parish community.',
    events: 'Gather for meals and parish events.',
    exchange: 'Share useful items with your parish community.',
    feed: 'Updates and announcements from your parish.',
    groups: 'Find fellowship in your parish groups.',
    library: 'Resources chosen for your parish community.',
    media: 'Explore videos shared by your parish.',
    news: 'Stay connected with news from your parish.',
    'parish-life': 'Prayer, fellowship, and parish life together.',
    'prayer-requests': 'Share a prayer request and pray for others.',
    sacraments: 'Request sacraments, services, and prayers.',
    signups: 'Find opportunities to serve your parish.',
    teaching: 'Listen to teachings shared by your parish.',
    watch: 'Watch services and videos from your parish.',
    'giving/history': 'View your gifts and giving statements.',
    'giving/calendar': 'Services, feast days, and parish events.',
    'giving/give': 'Support the life and work of your parish.',
  };
  const route = location.pathname
    .replace(/^\/myagapay\/?/, '')
    .replace(/\.html$/, '')
    .replace(/\/$/, '');
  const key = route === 'calendar' ? 'giving/calendar' : route === 'services' ? 'sacraments' : route;
  if (!titles[key]) return;

  const switchIcon =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7h11l-3-3M16 17H5l3 3M19 7l-3 3M5 17l3-3"/></svg>';
  const churchIcon =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v5M9.5 4.5h5M5 21V11l7-5 7 5v10H5ZM2 21h20M10 21v-6h4v6M3 13v8M21 13v8"/></svg>';
  let parish = null;
  let header;
  let dialog;
  let churches = [];
  let switching = false;

  function updateParish(value) {
    if (!header) return;
    parish = value || null;
    const name = header.querySelector('[data-app-church-name]');
    name.textContent = value?.name || 'Choose a church';
    name.title = value?.name || 'Choose a church';
    const locationLabel = header.querySelector('[data-app-church-location]');
    locationLabel.textContent = [value?.city, value?.state].filter(Boolean).join(', ');
    locationLabel.hidden = !locationLabel.textContent;
    if (key === 'parish-life')
      header.querySelector('[data-app-page-title]').textContent =
        value?.communicationsEnabled === false ? 'Today' : 'Koinonia';
  }

  async function request(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: window.AGAPAYDonorSession.authHeaders({ 'Content-Type': 'application/json', ...options.headers }),
    });
    if (window.MyAgapayShell.handleUnauthorized(response)) throw new Error('Please sign in again.');
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Unable to complete the request.');
    return payload;
  }

  function renderChurches() {
    const query = dialog.querySelector('input').value.trim().toLowerCase();
    const list = dialog.querySelector('[data-app-churches]');
    list.replaceChildren();
    churches
      .filter((entry) => [entry.name, entry.city, entry.state].join(' ').toLowerCase().includes(query))
      .forEach((entry) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.disabled = switching;
        button.className = 'app-church-option';
        if (entry.id === parish?.id) button.setAttribute('aria-current', 'true');
        const name = document.createElement('strong');
        name.textContent = entry.name;
        const place = document.createElement('span');
        place.textContent = [entry.city, entry.state].filter(Boolean).join(', ');
        button.append(name, place);
        button.addEventListener('click', () => switchChurch(entry));
        list.append(button);
      });
    if (!list.children.length) list.textContent = 'No churches match your search.';
  }

  async function switchChurch(entry) {
    if (switching) return;
    if (entry.id === parish?.id) {
      dialog.close();
      return;
    }
    switching = true;
    renderChurches();
    const status = dialog.querySelector('[role="status"]');
    status.textContent = 'Switching churches…';
    try {
      const result = await request('/api/donor/dashboard', {
        method: 'PATCH',
        body: JSON.stringify({ defaultParishId: entry.id }),
      });
      window.AGAPAYDonorSession.setProfile({
        ...window.AGAPAYDonorSession.profile(),
        ...result.donor,
        defaultParishId: entry.id,
        defaultParish: entry,
      });
      // Reload parish-owned data and re-evaluate access before showing the new church.
      location.reload();
    } catch (error) {
      status.textContent = error.message;
      switching = false;
      renderChurches();
    }
  }

  async function openChurches() {
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.className = 'app-church-dialog';
      dialog.setAttribute('aria-labelledby', 'appChurchDialogTitle');
      dialog.innerHTML =
        '<div class="app-church-dialog-heading"><h2 id="appChurchDialogTitle">Switch churches</h2><button type="button" aria-label="Close church picker">×</button></div><p data-app-current-church></p><label>Find a church<input type="search" placeholder="Church name, city, or state"></label><p role="status" aria-live="polite"></p><div data-app-churches></div>';
      document.body.append(dialog);
      dialog.querySelector('button').addEventListener('click', () => dialog.close());
      dialog.querySelector('input').addEventListener('input', renderChurches);
      dialog.addEventListener('close', () => header.querySelector('[data-app-switch-church]')?.focus());
    }
    dialog.querySelector('[data-app-current-church]').textContent = parish
      ? [parish.name, [parish.city, parish.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')
      : 'Choose your church';
    dialog.showModal();
    dialog.querySelector('input').focus();
    if (churches.length) {
      renderChurches();
      return;
    }
    const status = dialog.querySelector('[role="status"]');
    status.textContent = 'Loading churches…';
    try {
      const loaded = [];
      let cursor = '';
      do {
        const params = new URLSearchParams({ limit: '250' });
        if (cursor) params.set('cursor', cursor);
        const payload = await request('/api/parishes?' + params);
        loaded.push(...(payload.parishes || []));
        cursor = payload.cursor || '';
      } while (cursor);
      churches = loaded;
      status.textContent = '';
      renderChurches();
    } catch (error) {
      status.textContent = error.message;
    }
  }

  function buildHeader() {
    const main = document.querySelector('main.content, main.directory-main, main');
    if (!main || main.querySelector('.app-page-header')) return;
    document.body.classList.add('app-shared-header-page');
    header = document.createElement('header');
    header.className = 'app-page-header';
    header.innerHTML = `<div class="app-header-bar koinonia-mobile-appbar"><a class="app-header-brand" href="/myagapay"><img src="/mark.png" alt=""><span>MY AGAPAY</span></a><button class="app-header-menu-button" type="button" data-myagapay-app-menu-toggle aria-label="Open My AGAPAY navigation">${window.MyAgapayShell.icons.menu}</button></div><nav id="appHeaderNavigation" class="koinonia-mobile-menu" data-myagapay-app-menu aria-label="My AGAPAY navigation" hidden></nav><div class="app-header-body"><div class="app-header-parish">${churchIcon}<div class="app-header-parish-copy"><div data-app-church-name>Loading your church…</div><div data-app-church-location hidden></div></div><div class="app-header-switch"><button type="button" data-app-switch-church aria-label="Switch churches">${switchIcon}</button></div></div><div class="app-header-title-row"><h1 data-app-page-title></h1><div class="app-header-actions"></div></div></div>`;
    header.querySelector('[data-app-page-title]').textContent = titles[key];
    main.prepend(header);

    const description = document.createElement('p');
    description.className = 'app-header-description';
    description.textContent = descriptions[key];
    header.querySelector('.app-header-body').append(description);
    if (
      [
        'feed',
        'news',
        'groups',
        'teaching',
        'media',
        'media/watch',
        'watch',
        'signups',
        'exchange',
        'prayer-requests',
        'events',
        'giving/calendar',
      ].includes(key)
    ) {
      const back = document.createElement('a');
      back.className = 'app-header-back';
      back.href = '/myagapay/parish-life';
      back.textContent = '← Back to Koinonia';
      back.setAttribute('data-parish-life-back', '');
      header.querySelector('.app-header-title-row').before(back);
    }
    if (key === 'library') main.querySelector('.library-page-heading')?.classList.add('app-header-replaced');

    const actions = header.querySelector('.app-header-actions');
    const actionSelectors =
      key === 'bookstore'
        ? ['.boutique-bag']
        : [
            '.koinonia-parish-context #todayGiveLink',
            '.topbar-actions > #todayGiveLink',
            '.koinonia-page-action',
            '.prayer-new-request',
          ];
    actionSelectors.forEach((selector) => main.querySelectorAll(selector).forEach((action) => actions.append(action)));
    if (key === 'bookstore') {
      const nativePicker = main.querySelector('.bookstore-parish-switcher');
      if (nativePicker) header.querySelector('.app-header-switch').replaceChildren(nativePicker);
    } else header.querySelector('[data-app-switch-church]').addEventListener('click', openChurches);

    // Hide old navigation shells, retaining their data-bound elements and notices.
    main
      .querySelectorAll(
        '.topbar, .koinonia-mobile-appbar, .prayer-mobile-appbar, .library-mobile-appbar, [data-myagapay-app-menu], .bookstore-store-context, .koinonia-parish-context, [data-parish-life-back]'
      )
      .forEach((element) => {
        if (!header.contains(element)) element.classList.add('app-header-replaced');
      });
    main.querySelectorAll('.koinonia-page-heading, .prayer-page-heading').forEach((element) => {
      element.classList.add('app-header-old-heading');
      element.querySelectorAll('h1').forEach((title) => title.classList.add('app-header-old-title'));
      element.querySelectorAll('.koinonia-page-title-row p, .prayer-page-title-row p').forEach((copy) => {
        description.textContent = copy.textContent;
        copy.classList.add('app-header-replaced');
      });
    });
    window.MyAgapayShell.initializeMobileAppMenus(header);
    const menu = header.querySelector('[data-myagapay-app-menu]');
    menu?.addEventListener('click', (event) => {
      if (event.target.closest('[data-app-support]')) {
        menu.hidden = true;
        header.querySelector('[data-myagapay-app-menu-toggle]').setAttribute('aria-expanded', 'false');
        window.MyAgapayShell.openSupportDialog();
      }
      if (event.target.closest('[data-app-log-out]')) {
        window.AGAPAYDonorSession.clearSession();
        location.assign('/myagapay/login');
      }
    });
    menu?.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') header.querySelector('[data-myagapay-app-menu-toggle]').focus();
    });
    updateParish(window.AGAPAYDonorSession.profile()?.defaultParish);
  }

  window.addEventListener('myagapay:parish-context', (event) => updateParish(event.detail));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildHeader);
  else buildHeader();
})();
