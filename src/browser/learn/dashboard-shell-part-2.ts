import type {
  LearnChromeModel,
  LearnTruthyFilter,
  LearnShellViewModel,
  LearnShellNode,
  LearnShellOptions,
  LearnShellError,
} from './dashboard-shell-contracts.js';
import type { LearnShellBindings } from './dashboard-shell.js';

declare let learnCheckoutOpening: LearnShellBindings['learnCheckoutOpening'];
declare const apiPost: LearnShellBindings['apiPost'];
declare const pageIntroMeta: LearnShellBindings['pageIntroMeta'];
declare const pageKey: LearnShellBindings['pageKey'];
declare let learnGoogleCalendarStatus: LearnShellBindings['learnGoogleCalendarStatus'];
declare const resolveLearnPageKey: LearnShellBindings['resolveLearnPageKey'];
declare const cssVars: LearnShellBindings['cssVars'];
declare const pageIntro: LearnShellBindings['pageIntro'];
declare const isOdysseyLearnContext: LearnShellBindings['isOdysseyLearnContext'];
declare const html: LearnShellBindings['html'];
declare const learnExperience: LearnShellBindings['learnExperience'];
declare const panel: LearnShellBindings['panel'];
declare const marketingPreviewActive: LearnShellBindings['marketingPreviewActive'];
declare const learnSectionHref: LearnShellBindings['learnSectionHref'];
declare const plannerHref: LearnShellBindings['plannerHref'];

function printCount() {
  return Number(localStorage.getItem('agapay.learn.printCount') || 0);
}

function setPrintCount(value: number) {
  localStorage.setItem('agapay.learn.printCount', String(Math.max(0, value)));
}

function learnAccountEmail() {
  try {
    const donor = JSON.parse(localStorage.getItem('agapayDonorProfile') || '{}') as { email?: string };
    return localStorage.getItem('agapayDonorEmail') || donor.email || '';
  } catch {
    return localStorage.getItem('agapayDonorEmail') || '';
  }
}

function learnRequestHeaders(extra: Record<string, string> = {}) {
  if (window.MyAgapayShell?.authHeaders) return window.MyAgapayShell.authHeaders(extra);
  const headers: Record<string, string> = { Accept: 'application/json', ...extra };
  const token = localStorage.getItem('agapayDonorToken') || '';
  const email = learnAccountEmail();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (email) headers['X-AGAPAY-Donor-Email'] = email;
  return headers;
}

async function openLearnCheckout() {
  if (learnCheckoutOpening) return;
  learnCheckoutOpening = true;
  document.querySelectorAll<HTMLButtonElement>('[data-dialog-checkout], [data-print-upgrade]').forEach((button) => {
    (button as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled = true;
    button.dataset.previousText = button.textContent || '';
    button.textContent = 'Opening Stripe...';
  });
  try {
    if (window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone === true) {
      window.open('https://agapay.app/learn/pricing?source=myagapay-app', '_blank', 'noopener,noreferrer');
      learnCheckoutOpening = false;
      document.querySelectorAll<HTMLButtonElement>('[data-dialog-checkout], [data-print-upgrade]').forEach((button) => {
        (button as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled = false;
        button.textContent = button.dataset.previousText || 'Upgrade';
      });
      return;
    }
    const payload = await apiPost('/api/learn/billing/checkout', { plan: 'family', interval: 'year' });
    if (payload.url) {
      window.location.href = payload.url;
      return;
    }
    throw new Error('Stripe checkout did not return a checkout URL.');
  } catch (error) {
    learnCheckoutOpening = false;
    document.querySelectorAll<HTMLButtonElement>('[data-dialog-checkout], [data-print-upgrade]').forEach((button) => {
      (button as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled = false;
      button.textContent = button.dataset.previousText || 'Upgrade';
    });
    showLearnDialog(
      'Checkout Setup Needed',
      (error as LearnShellError).message || 'Stripe checkout is not configured yet.',
      [{ label: 'Stripe route', value: '/api/learn/billing/checkout' }],
      { upgrade: false }
    );
  }
}

function showLearnDialog(title: string, message: string, rows: LearnShellNode[] = [], options: LearnShellOptions = {}) {
  const existing = document.querySelector<HTMLElement>('[data-learn-dialog]');
  if (existing) existing.remove();
  const dialog = document.createElement('div');
  dialog.dataset.learnDialog = 'true';
  dialog.style.cssText =
    'position:fixed;inset:0;z-index:80;background:rgba(10,20,40,.54);display:flex;align-items:center;justify-content:center;padding:clamp(10px,3vw,24px);';
  const contentHtml = options.contentHtml || '';
  const width = ['520px', '620px', '760px'].includes(options.width as string) ? options.width! : '520px';
  dialog.innerHTML = `<div data-dialog-card style="width:100%;max-height:min(760px,92vh);overflow:auto;background:#f3ead4;border:1px solid #b5942f;border-radius:16px;box-shadow:0 20px 60px rgba(10,20,40,.35);padding:clamp(16px,4vw,24px);color:#14294a;"><div style="display:flex;justify-content:space-between;gap:12px;align-items:start;position:sticky;top:-24px;background:#f3ead4;padding-top:2px;padding-bottom:12px;z-index:2;"><div><h2 data-dialog-title style="font-family:'Cormorant Garamond',serif;font-size:clamp(25px,7vw,31px);line-height:1.02;margin:0;color:#14294a;"></h2><p data-dialog-message style="color:#33405a;line-height:1.45;margin:8px 0 0;"></p></div><button type="button" data-dialog-close aria-label="Close dialog" style="border:1px solid rgba(20,41,74,.18);background:#fffaf0;color:#14294a;border-radius:999px;width:44px;height:44px;display:grid;place-items:center;font-size:24px;line-height:1;cursor:pointer;flex:none;">×</button></div><div data-dialog-content></div><div data-dialog-rows></div><div style="position:sticky;bottom:-24px;background:#f3ead4;display:flex;justify-content:flex-end;gap:10px;margin-top:16px;padding-top:12px;padding-bottom:2px;"><button type="button" data-dialog-close style="border:1px solid rgba(20,41,74,.22);background:#fffaf0;border-radius:10px;padding:12px 18px;min-height:44px;font-family:inherit;color:#14294a;font-weight:700;">Close</button><button type="button" data-dialog-checkout style="border:1px solid #b5942f;background:#14294a;color:#f3ead4;border-radius:9px;padding:10px 16px;font-family:inherit;" hidden>Upgrade</button></div></div>`;
  dialog.querySelector<HTMLElement>('[data-dialog-card]')!.style.maxWidth = width;
  dialog.querySelector<HTMLElement>('[data-dialog-title]')!.textContent = String(title || '');
  dialog.querySelector<HTMLElement>('[data-dialog-message]')!.textContent = String(message || '');
  const content = dialog.querySelector<HTMLElement>('[data-dialog-content]');
  if (contentHtml) content!.innerHTML = contentHtml;
  const rowContainer = dialog.querySelector<HTMLElement>('[data-dialog-rows]');
  rows.forEach((row) => {
    const item = document.createElement('div');
    item.style.cssText = 'border-top:1px solid rgba(181,148,47,.28);padding:9px 0;';
    const label = document.createElement('small');
    label.style.cssText = 'color:#9b7420;letter-spacing:.12em;text-transform:uppercase;';
    label.textContent = String(row.label || '');
    const value = document.createElement('strong');
    value.style.display = 'block';
    value.textContent = String(row.value || '');
    item.append(label, value);
    rowContainer!.append(item);
  });
  dialog.querySelector<HTMLButtonElement>('[data-dialog-checkout]')!.hidden = !options.upgrade;
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog || (event.target as HTMLElement).closest<HTMLElement>('[data-dialog-close]'))
      dialog.remove();
    if ((event.target as HTMLElement).closest<HTMLElement>('[data-dialog-checkout]')) openLearnCheckout();
  });
  document.body.append(dialog);
}

function showLearnFeedbackDialog() {
  const pageLabel = pageIntroMeta(pageKey).kicker || 'AGAPAY Learn';
  showLearnDialog(
    'Suggest an Improvement',
    'Share what would make AGAPAY Learn clearer, calmer, or more useful for your household.',
    [],
    {
      width: '620px',
      contentHtml: `
      <form data-learn-feedback-form style="border-top:1px solid rgba(181,148,47,.28);padding-top:16px;display:grid;gap:12px;">
        <label style="display:grid;gap:6px;color:#9b7420;font-size:12px;letter-spacing:.12em;text-transform:uppercase;font-weight:800;">Subject
          <input name="subject" value="${html(`${pageLabel} suggestion`)}" maxlength="120" style="border:1px solid rgba(20,41,74,.18);border-radius:10px;padding:11px;background:#fffaf0;color:#14294a;font:inherit;letter-spacing:0;text-transform:none;" />
        </label>
        <label style="display:grid;gap:6px;color:#9b7420;font-size:12px;letter-spacing:.12em;text-transform:uppercase;font-weight:800;">Suggestion
          <textarea name="message" rows="7" maxlength="1600" placeholder="What felt confusing, missing, too many steps, or worth improving?" style="border:1px solid rgba(20,41,74,.18);border-radius:10px;padding:11px;background:#fffaf0;color:#14294a;font:inherit;line-height:1.45;resize:vertical;letter-spacing:0;text-transform:none;"></textarea>
        </label>
        <div data-learn-feedback-status style="min-height:20px;color:#33405a;font-size:13px;"></div>
        <div style="display:flex;justify-content:flex-end;gap:10px;">
          <button type="button" data-dialog-close style="border:1px solid rgba(20,41,74,.22);background:#fffaf0;border-radius:10px;padding:12px 18px;min-height:44px;font-family:inherit;color:#14294a;font-weight:700;">Cancel</button>
          <button type="submit" style="border:1px solid #b5942f;background:#14294a;color:#f3ead4;border-radius:10px;padding:12px 18px;min-height:44px;font-family:inherit;font-weight:800;">Send suggestion</button>
        </div>
      </form>`,
    }
  );
}

function saintStoryDialogHtml(saints: LearnShellNode[] = [], unavailableMessage: string = '') {
  if (unavailableMessage) {
    return `<div style="border-top:1px solid rgba(181,148,47,.28);padding:14px 0;color:#33405a;line-height:1.5;">${html(unavailableMessage)}</div>`;
  }
  if (!saints.length) {
    return `<div style="border-top:1px solid rgba(181,148,47,.28);padding:14px 0;color:#33405a;line-height:1.5;">No saint life is listed for this day yet. Please try again later.</div>`;
  }
  return saints
    .map((saint) => {
      const paragraphs = String(saint.storyText || '')
        .split(/\n{2,}/)
        .map((part) => part.trim())
        .filter(Boolean as unknown as LearnTruthyFilter);
      return `<article style="border-top:1px solid rgba(181,148,47,.28);padding:16px 0;display:grid;gap:8px;">
      <div style="display:flex;gap:12px;align-items:flex-start;">
        ${saint.iconUrl ? `<img src="${html(saint.iconUrl)}" alt="" style="width:64px;height:64px;border-radius:12px;object-fit:cover;border:1px solid rgba(181,148,47,.34);">` : `<span style="width:48px;height:48px;border-radius:50%;background:#14294a;color:#f3ead4;display:grid;place-items:center;flex:none;font-size:23px;">✥</span>`}
        <span><strong style="display:block;font-family:'Cormorant Garamond',serif;font-size:24px;line-height:1.05;color:#14294a;">${html(saint.name || saint.title || 'Saint of the Day')}</strong>${saint.reposeCentury ? `<small style="display:block;margin-top:4px;color:#9b7420;font-weight:800;">${html(saint.reposeCentury)}</small>` : ''}${saint.feastRank ? `<small style="display:block;margin-top:4px;color:#9b7420;letter-spacing:.08em;text-transform:uppercase;">${html(saint.feastRank)}</small>` : ''}</span>
      </div>
      ${paragraphs.length ? paragraphs.map((paragraph) => `<p style="margin:0;color:#33405a;line-height:1.58;">${html(paragraph)}</p>`).join('') : `<p style="margin:0;color:#33405a;line-height:1.58;">A life-story text is not listed for this commemoration.</p>`}
    </article>`;
    })
    .join('');
}

function saintMatchKey(value: unknown = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/\([^)]*\b[1-2]?[0-9]{2,3}\b[^)]*\)/g, '')
    .replace(
      /\b(st|saint|ven|venerable|holy|apostle|evangelist|martyr|great|our holy|righteous|blessed|elder|prophet|hieromartyr|new martyr)\.?\b/g,
      ''
    )
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function saintMatchScore(a: unknown = '', b: unknown = '') {
  const aTokens = saintMatchKey(a)
    .split(/\s+/)
    .filter((token) => token.length > 2);
  const bTokens = saintMatchKey(b)
    .split(/\s+/)
    .filter((token) => token.length > 2);
  if (!aTokens.length || !bTokens.length) return 0;
  const aSet = new Set(aTokens);
  const bSet = new Set(bTokens);
  let score = 0;
  aSet.forEach((token) => {
    if (bSet.has(token)) score += 3;
    else if ([...bSet].some((other) => other.includes(token) || token.includes(other))) score += 1;
  });
  return score / Math.max(aSet.size, bSet.size);
}

function saintPrecedence(value: unknown = '') {
  const text = String(value || '').toLowerCase();
  if (
    /\b(lord|theotokos|mother of god|cross|resurrection|nativity|theophany|pascha|pentecost|transfiguration|ascension|annunciation|dormition)\b/.test(
      text
    )
  )
    return 100;
  if (/\b(apostle|evangelist|forerunner|baptist)\b/.test(text)) return 90;
  if (/\b(prophet|hierarch|bishop|equal[- ]to[- ]the[- ]apostles)\b/.test(text)) return 80;
  if (/\b(great martyr|new martyr|hieromartyr|martyr|confessor)\b/.test(text)) return 70;
  if (/\b(righteous|ancestor|forefather|foremother)\b/.test(text)) return 60;
  if (/\b(venerable|abbot|abbess|monk|nun|elder|wonderworker)\b/.test(text)) return 50;
  return 40;
}

function orderSaintsByPrecedence(saints: LearnShellNode[] = []) {
  return [...saints].sort((a, b) => {
    const aTitle = typeof a === 'string' ? a : a?.name || a?.title || '';
    const bTitle = typeof b === 'string' ? b : b?.name || b?.title || '';
    return saintPrecedence(bTitle) - saintPrecedence(aTitle);
  });
}

function orderSaintsForCard(saints: LearnShellNode[] = [], cardTitle: string | undefined = '') {
  const precedenceOrdered = orderSaintsByPrecedence(saints);
  const titleKey = saintMatchKey(cardTitle);
  if (!titleKey || !Array.isArray(precedenceOrdered) || precedenceOrdered.length < 2) return precedenceOrdered;
  let matchedIndex = precedenceOrdered.findIndex((saint) => {
    const nameKey = saintMatchKey(saint?.name || saint?.title || '');
    return nameKey && (nameKey === titleKey || nameKey.includes(titleKey) || titleKey.includes(nameKey));
  });
  if (matchedIndex < 0) {
    let bestScore = 0;
    precedenceOrdered.forEach((saint, index) => {
      const score = Math.max(
        saintMatchScore(cardTitle, saint?.name || ''),
        saintMatchScore(cardTitle, saint?.title || '')
      );
      if (score > bestScore) {
        bestScore = score;
        matchedIndex = index;
      }
    });
    if (bestScore < 0.45) matchedIndex = -1;
  }
  if (matchedIndex <= 0) return precedenceOrdered;
  return [
    precedenceOrdered[matchedIndex],
    ...precedenceOrdered.slice(0, matchedIndex),
    ...precedenceOrdered.slice(matchedIndex + 1),
  ];
}

function forceDisplayedSaintFirst(saints: LearnShellNode[] = [], cardTitle: string | undefined = '') {
  const ordered = orderSaintsForCard(saints, cardTitle);
  if (!cardTitle || !Array.isArray(ordered) || !ordered.length) return ordered;
  const first = ordered[0] || {};
  const score = Math.max(saintMatchScore(cardTitle, first.name || ''), saintMatchScore(cardTitle, first.title || ''));
  if (score >= 0.45) return ordered;
  return [
    {
      name: cardTitle,
      title: cardTitle,
      storyText: '',
      sourceLabel: 'Orthocal.info',
    },
    ...ordered,
  ];
}

function saintCardTitle(today: LearnShellNode = {}) {
  const firstName = today.saintNames?.[0] || '';
  if (firstName) {
    const orderedStories = orderSaintsForCard(today.saintStories || [], firstName);
    return orderedStories?.[0]?.name || orderedStories?.[0]?.title || firstName;
  }
  const firstStoryTitle = today.saintStories?.[0]?.name || today.saintStories?.[0]?.title || '';
  if (firstStoryTitle) return firstStoryTitle;
  const title = String(today.title || '').trim();
  return title || 'Lives of the Saints';
}

function plannerScopeFromQuery() {
  const query = new URLSearchParams(window.location.search);
  const rawScope = query.get('scope') || 'lessons';
  if (rawScope === 'calendar') return 'events';
  if (['recipes', 'groceries', 'pantry'].includes(rawScope)) return 'meals';
  return ['lessons', 'meals', 'chores', 'events'].includes(rawScope) ? rawScope : 'lessons';
}

function mealToolFromQuery() {
  const query = new URLSearchParams(window.location.search);
  const rawScope = query.get('scope') || '';
  const rawTool = query.get('tool') || '';
  if (['recipes', 'groceries', 'pantry'].includes(rawScope)) return rawScope;
  return ['plan', 'recipes', 'groceries', 'pantry'].includes(rawTool) ? rawTool : 'plan';
}

function plannerSidebarSubnav(activePage: string) {
  if (activePage !== 'planner') return '';
  const activeScope = plannerScopeFromQuery();
  const items = [
    {
      id: 'lessons',
      label: 'Lessons',
      glyph:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l1-4L15.5 5.5l3.5 3.5L8.5 19.5 4 20z"/><path d="M13 7.5l3.5 3.5"/></svg>',
      href: plannerHref({ scope: 'lessons', tool: null }),
    },
    {
      id: 'meals',
      label: 'Meals',
      glyph:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11.5a8 8 0 0 0 16 0"/><path d="M4 11.5h16"/><path d="M12 3.2v5"/></svg>',
      href: plannerHref({ scope: 'meals', tool: 'plan', view: 'week', term: null, termId: null }),
    },
    {
      id: 'chores',
      label: 'Chores',
      glyph:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5 5L20 6"/></svg>',
      href: plannerHref({ scope: 'chores', tool: null, view: 'week', term: null, termId: null }),
    },
    {
      id: 'events',
      label: 'Events',
      glyph:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.3"/><path d="M12 7.2v5l3.3 2"/></svg>',
      href: plannerHref({ scope: 'events', tool: null, view: 'week', term: null, termId: null }),
    },
  ];
  return `<div class="learn-planner-subnav" aria-label="Family Planner sections">
    ${items.map((item) => `<a href="${item.href}" class="${item.id === activeScope ? 'is-active' : ''}" ${item.id === activeScope ? 'aria-current="page"' : ''}><span>${item.glyph}</span>${html(item.label)}</a>`).join('')}
  </div>`;
}

function sidebar(vm: LearnChromeModel) {
  const active = vm.page.id;
  const experience = learnExperience();
  const gcalConfigured = learnGoogleCalendarStatus.loaded
    ? learnGoogleCalendarStatus.configured
    : vm.shell.gcalConfigured;
  const gcalConnected = learnGoogleCalendarStatus.loaded ? learnGoogleCalendarStatus.connected : vm.shell.gcalConnected;
  const navItems = experience.navOrder
    ? experience.navOrder
        .map((id) => vm.shell.nav.find((item) => item.id === id))
        .filter(Boolean as unknown as LearnTruthyFilter)
    : vm.shell.nav;
  return `
    <aside class="learn-product-sidebar" data-learn-sidebar>
      <div class="learn-product-sidebar-scroll">
        <a class="learn-product-back" href="${experience.backHref}" aria-label="Back to ${html(experience.backLabel)}">
          <span aria-hidden="true">←</span>
          <strong>${html(experience.backLabel)}</strong>
        </a>
        <div class="learn-product-profile">
          <strong>${html(vm.shell.familyName || 'Faithful Household')}</strong>
          <span>${html(vm.shell.familyMeta || 'AGAPAY Learn')}</span>
          ${experience.activationBadge ? `<small class="learn-odyssey-badge" style="display:inline-block;margin-top:6px;border:1px solid var(--gold);border-radius:999px;padding:2px 9px;font-size:10.5px;letter-spacing:.06em;color:var(--gold);">${html(experience.activationBadge)}</small>` : ''}
          ${marketingPreviewActive() ? `<small class="learn-odyssey-badge" style="display:inline-block;margin:6px 0 0 5px;border:1px solid rgba(255,250,240,.45);border-radius:999px;padding:2px 9px;font-size:10.5px;letter-spacing:.06em;color:#f7e8bd;">Marketing preview</small>` : ''}
        </div>
        <div class="learn-product-label">AGAPAY Learn</div>
        <nav class="learn-product-nav" aria-label="AGAPAY Learn">
        ${navItems
          .map(
            (item) => `
          <a class="${item!.id === active ? 'is-active' : ''}" href="${item!.href}" ${item!.id === active ? 'aria-current="page"' : ''}>
            <span class="learn-product-nav-icon">${item!.icon}</span>
            <span>${html((experience.navLabels as unknown as Record<string, string | undefined>)[item!.id] || item!.label)}</span>
            ${item!.comingSoon ? '<small class="learn-nav-soon">Soon</small>' : ''}
          </a>
          ${item!.id === 'planner' ? plannerSidebarSubnav(active) : ''}
        `
          )
          .join('')}
        </nav>
        <button class="learn-product-google-sync" type="button" data-learn-google-sync
          ${gcalConfigured ? '' : 'disabled aria-disabled="true" title="Google Calendar sync is not yet configured"'}
          style="${gcalConfigured ? '' : 'opacity:.45;cursor:not-allowed;'}">
          <span aria-hidden="true">G</span>
          <span><strong>Google Calendar</strong><small>${gcalConnected ? 'Sync connected' : gcalConfigured ? 'Connect family sync' : 'Not yet configured'}</small></span>
        </button>
      </div>
    </aside>
  `;
}

function globalProductNav(activeProduct: string = 'learn') {
  if (window.MyAgapayShell?.productNav) {
    return window.MyAgapayShell.productNav(activeProduct, 'learn-product-tabbar');
  }
  if (isOdysseyLearnContext()) {
    // TEFA/Odyssey families never had a My AGAPAY donor shell loaded on this
    // page — the bottom nav must stay inside /learn/odyssey/dashboard/... and
    // must not send them to Giving, Marketplace, or My AGAPAY account routes.
    const active = resolveLearnPageKey();
    const tab = (id: string, href: string, label: string, icon: string) => `
      <a class="${active === id ? 'is-active' : ''}" href="${html(href)}" ${active === id ? 'aria-current="page"' : ''}>
        ${icon}
        <span>${html(label)}</span>
      </a>`;
    return `
      <nav class="learn-product-tabbar" aria-label="AGAPAY Learn Odyssey navigation">
        ${tab('dashboard', learnSectionHref('dashboard'), 'Today', '<svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></svg>')}
        ${tab('planner', learnSectionHref('planner'), 'Planner', '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4"/><path d="M16 2v4"/><path d="M3 10h18"/></svg>')}
        ${tab('grades', learnSectionHref('grades'), 'Grades', '<svg viewBox="0 0 24 24"><path d="M4 20 10 4h4l6 16"/><path d="M7 14h10"/></svg>')}
        ${tab('print-center', learnSectionHref('print-center'), 'Print', '<svg viewBox="0 0 24 24"><path d="M6 9V3h12v6"/><rect x="4" y="9" width="16" height="8" rx="1.6"/><path d="M6 14h12v8H6z"/></svg>')}
        <a href="/learn/odyssey">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M5 21a7 7 0 0 1 14 0"/></svg>
          <span>Account</span>
        </a>
      </nav>
    `;
  }
  return `
    <nav class="learn-product-tabbar" aria-label="My AGAPAY navigation">
      <a class="${activeProduct === 'home' ? 'is-active' : ''}" href="/myagapay/dashboard">
        <svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></svg>
        <span>My AGAPAY</span>
      </a>
      <a class="${activeProduct === 'giving' ? 'is-active' : ''}" href="/myagapay/giving">
        <svg viewBox="0 0 24 24"><path d="M7 13V7.5a1.5 1.5 0 0 1 3 0V13"/><path d="M10 13V5.5a1.5 1.5 0 0 1 3 0V13"/><path d="M13 13V6.5a1.5 1.5 0 0 1 3 0V14"/><path d="M16 14V10a1.5 1.5 0 0 1 3 0v5c0 4-2.6 6-6.3 6H12a7 7 0 0 1-7-7v-1.5a1.5 1.5 0 0 1 2 0V13"/></svg>
        <span>Giving</span>
      </a>
      <a class="${activeProduct === 'learn' ? 'is-active' : ''}" href="${html(learnSectionHref('dashboard'))}">
        <svg viewBox="0 0 24 24"><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H20v17H7.5A3.5 3.5 0 0 0 4 22z"/><path d="M4 5.5V22"/><path d="M8 6h8"/><path d="M8 10h7"/></svg>
        <span>Learn</span>
      </a>
      <a href="/marketplace">
        <svg viewBox="0 0 24 24"><path d="M6 8h12l-1 13H7z"/><path d="M9 8a3 3 0 0 1 6 0"/><path d="M9 13h6"/></svg>
        <span>Market</span>
      </a>
      <a href="/myagapay/account">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M5 21a7 7 0 0 1 14 0"/></svg>
        <span>Account</span>
      </a>
    </nav>
  `;
}

function topbar(vm: LearnChromeModel) {
  const experience = learnExperience();
  const title = vm.page.ornament
    ? `<span style="color:#c9a227;font-size:22px;margin:0 14px;">❦</span>${html(vm.page.title)}<span style="color:#c9a227;font-size:22px;margin:0 14px;">❦</span>`
    : html(vm.page.title);
  return `
    <header class="learn-product-topbar">
      <button class="learn-menu-button" type="button" data-learn-menu-toggle aria-label="Open Learn navigation" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
      <a class="learn-mobile-brand learn-utility-brand" href="${experience.backHref}" aria-label="Open ${html(experience.backLabel)}">
        <img src="/mark.png" alt="" />
        <span><strong>${html(experience.brandName)}</strong><small>${html(experience.brandTagline)}</small></span>
      </a>
      <div class="learn-page-title-utility" style="flex:1;min-width:0;line-height:1.1;">
        <div style="color:var(--gold);font-size:11px;letter-spacing:.14em;font-weight:700;text-transform:uppercase;">${html(experience.brandName)} · ${html(experience.brandTagline)}</div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:38px;font-weight:600;color:var(--ink);display:flex;align-items:center;">${title}</div>
        ${vm.page.subtitle ? `<div style="font-size:14.5px;color:var(--muted);margin-top:2px;">${html(vm.page.subtitle)}</div>` : ''}
      </div>
      <div class="learn-utility-actions" style="display:flex;align-items:center;gap:18px;flex:none;">
        <button class="learn-quick-action learn-feedback-action" type="button" data-learn-feedback-open>Suggest</button>
        <a class="learn-quick-action" href="${learnSectionHref('onboarding', 'simple=1')}">Quick Setup</a>
        <div class="learn-account-menu" data-learn-account-menu>
          <button class="learn-account-utility myagapay-menu-trigger" type="button" data-learn-account-toggle aria-haspopup="true" aria-expanded="false" aria-label="Open My AGAPAY menu">
            <span class="myagapay-menu-icon" aria-hidden="true"><span></span><span></span><span></span></span>
          </button>
          <div class="learn-account-dropdown" role="menu" hidden>
            <a href="${experience.odyssey ? learnSectionHref('onboarding') : '/myagapay/account'}" role="menuitem">Account Settings</a>
            <button type="button" data-learn-logout role="menuitem">Log out</button>
          </div>
        </div>
      </div>
    </header>
  `;
}

function shell(vm: LearnChromeModel, body: string) {
  return `
    <div class="learn-product-shell learn-screen-${html(vm.page.id)}" style="${cssVars()};">
      ${sidebar(vm)}
      <div class="learn-sidebar-scrim" data-learn-sidebar-scrim></div>
      <main class="learn-product-main scroll">
        ${topbar(vm)}
        <div class="learn-product-content">${pageIntro(vm)}${body}</div>
        ${globalProductNav('learn')}
      </main>
    </div>
  `;
}

function renderGraceModePanel(vm: LearnShellViewModel) {
  const currentMode = vm.graceMode?.active ? vm.graceMode.mode || 'light' : 'full';
  const modes = [
    {
      id: 'full',
      title: 'Full Rhythm',
      subtitle: 'Keep the complete plan for an ordinary, steady week.',
      detail: 'Every scheduled subject, book, and enrichment block stays at its planned time.',
    },
    {
      id: 'light',
      title: 'Medium Day',
      subtitle: 'Cap the day without shrinking the whole plan.',
      detail:
        'Each child keeps up to 4 ranked subjects. Household enrichment keeps up to 3 blocks. Lower-ranked work moves to reserve.',
    },
    {
      id: 'minimum viable',
      title: 'Light Day',
      subtitle: 'A faithful tiny plan for hard days.',
      detail:
        'Each child keeps up to 2 top-ranked subjects. Household enrichment keeps 1 block. Kept work becomes a short touchpoint.',
    },
  ];
  return `
    <section data-grace-mode-panel style="background:linear-gradient(135deg,#fffaf0 0%,#f7edd6 100%);border:1px solid rgba(181,148,47,.34);border-radius:16px;padding:18px 20px;box-shadow:0 1px 3px rgba(20,40,70,.05);">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:14px;flex-wrap:wrap;">
        <div>
          <div class="learn-eyebrow">Grace Mode</div>
          <h2 style="font-family:'Cormorant Garamond',serif;font-size:30px;line-height:1.05;margin:4px 0 4px;color:var(--ink);">Choose today's household rhythm.</h2>
          <p style="margin:0;color:#4c5870;line-height:1.45;max-width:720px;">Adjust the day without abandoning the plan. AGAPAY keeps what matters most and gently moves the rest into reserve.</p>
        </div>
        <span data-grace-mode-status style="color:var(--muted);font-size:13px;min-height:20px;"></span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,minmax(160px,1fr));gap:10px;">
        ${modes
          .map((mode) => {
            const active = mode.id === currentMode;
            return `<button type="button" data-grace-mode="${html(mode.id)}" aria-pressed="${active ? 'true' : 'false'}" style="text-align:left;border:1px solid ${active ? 'var(--gold)' : 'var(--line)'};border-radius:13px;background:${active ? 'var(--navy)' : 'rgba(255,255,255,.58)'};color:${active ? '#fffaf0' : 'var(--ink)'};padding:13px;cursor:pointer;font-family:inherit;min-height:146px;box-shadow:${active ? '0 10px 24px rgba(6,21,34,.16)' : 'none'};">
            <span style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
              <strong style="font-family:'Cormorant Garamond',serif;font-size:22px;line-height:1;">${html(mode.title)}</strong>
              <span style="width:22px;height:22px;border-radius:50%;border:1px solid ${active ? 'rgba(255,250,240,.65)' : 'var(--gold)'};display:grid;place-items:center;color:${active ? 'var(--gold2)' : 'var(--gold)'};">${active ? '✓' : ''}</span>
            </span>
            <span style="display:block;font-weight:700;font-size:13px;line-height:1.3;margin-bottom:7px;color:${active ? '#f5df9d' : 'var(--gold)'};">${html(mode.subtitle)}</span>
            <span style="display:block;font-size:13px;line-height:1.38;color:${active ? 'rgba(255,250,240,.84)' : '#4c5870'};">${html(mode.detail)}</span>
          </button>`;
          })
          .join('')}
      </div>
    </section>
  `;
}
export type LearnShell2Part1 = {
  printCount: typeof printCount;
  setPrintCount: typeof setPrintCount;
  learnAccountEmail: typeof learnAccountEmail;
  learnRequestHeaders: typeof learnRequestHeaders;
  openLearnCheckout: typeof openLearnCheckout;
  showLearnDialog: typeof showLearnDialog;
  showLearnFeedbackDialog: typeof showLearnFeedbackDialog;
  saintStoryDialogHtml: typeof saintStoryDialogHtml;
  saintMatchKey: typeof saintMatchKey;
  saintMatchScore: typeof saintMatchScore;
  saintPrecedence: typeof saintPrecedence;
  orderSaintsByPrecedence: typeof orderSaintsByPrecedence;
  orderSaintsForCard: typeof orderSaintsForCard;
  forceDisplayedSaintFirst: typeof forceDisplayedSaintFirst;
  saintCardTitle: typeof saintCardTitle;
  plannerScopeFromQuery: typeof plannerScopeFromQuery;
  mealToolFromQuery: typeof mealToolFromQuery;
  plannerSidebarSubnav: typeof plannerSidebarSubnav;
  sidebar: typeof sidebar;
  globalProductNav: typeof globalProductNav;
  topbar: typeof topbar;
  shell: typeof shell;
  renderGraceModePanel: typeof renderGraceModePanel;
};
