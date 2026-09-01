'use strict';

// Parish dashboard Koinonia: block-based Sunday bulletin editor.

let bulletinState = {
  loaded: false,
  loading: false,
  bulletins: [],
  suggestions: null,
  templeTroparia: [],
  templeTropariaDraft: [],
  active: null,
  selectedBlockId: '',
  dirty: false,
};
let bulletinQrLoading = false;
let bulletinLiturgicalRequestId = 0;

function bulletinApi(path = '') {
  return `/api/parish/dashboard/${encodeURIComponent(currentParish.parishId)}/bulletins${path}`;
}

function installBulletinEntryPoints() {
  if (typeof document.createElement === 'function' && !document.querySelector('link[href^="/parish/bulletins.css"]')) {
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = '/parish/bulletins.css?v=b3';
    document.head.append(stylesheet);
  }
  const navigation = document.querySelector('.koinonia-studio-nav');
  const overview = navigation?.querySelector('[data-koinonia-view="overview"]');
  if (navigation && overview && !navigation.querySelector('[data-koinonia-view="bulletins"]')) {
    overview.insertAdjacentHTML(
      'afterend',
      '<button type="button" data-koinonia-view="bulletins" onclick="setKoinoniaStudioView(\'bulletins\')"><span>▥</span>Bulletins</button>'
    );
  }
  const metrics = document.querySelector('.koinonia-metric-grid');
  if (metrics && !document.getElementById('koinoniaBulletinCount')) {
    metrics.insertAdjacentHTML(
      'afterbegin',
      '<button class="koinonia-metric-card" type="button" onclick="openBulletinWorkspace()" aria-label="Create this Sunday’s bulletin"><span class="koinonia-metric-icon is-gold">▥</span><div><small>Sunday bulletin</small><strong id="koinoniaBulletinCount">New</strong><em id="koinoniaBulletinDetail">Create from parish life</em></div></button>'
    );
  }
}

function ensureBulletinWorkspace() {
  const mount = document.getElementById('bulletinMount');
  if (!mount || mount.childElementCount) return;
  mount.innerHTML = `
    <div class="bulletin-workspace-head">
      <div><span class="eyebrow">Sunday, assembled beautifully</span><h2 id="bulletinWorkspaceHeading">Bulletin Builder</h2><p>Bring parish announcements, services, events, and giving into one polished print edition.</p></div>
      <div class="bulletin-workspace-actions"><span id="bulletinSaveState" class="bulletin-save-state">Preview draft</span><button class="btn btn-ghost" type="button" onclick="openTempleTropariaEditor()">Temple hymns</button><button class="btn btn-ghost" type="button" onclick="createNewBulletinDraft()">New edition</button><button class="btn btn-ghost" type="button" onclick="duplicateBulletinDraft()">Duplicate</button><button class="btn btn-gold" type="button" onclick="saveBulletinDraft()">Save draft</button></div>
    </div>
    <div class="bulletin-builder-shell">
      <aside class="bulletin-builder-rail" aria-label="Bulletin content">
        <div class="bulletin-builder-rail-heading"><span class="eyebrow">Edition</span><strong>This Sunday</strong></div>
        <label>Saved editions<select id="bulletinDraftSelect" onchange="openBulletinDraft(this.value)"><option value="">New bulletin</option></select></label>
        <label>Bulletin date<input id="bulletinServiceDate" type="date" onchange="void updateBulletinServiceDate(this.value)" /></label>
        <label>Title<input id="bulletinTitle" maxlength="120" value="Sunday Bulletin" oninput="updateBulletinField('title', this.value)" /></label>
        <label>Download design<select id="bulletinTemplate" onchange="updateBulletinField('template', this.value)"><option value="heritage">Heritage</option><option value="quiet">Quiet light</option><option value="folded">Folded booklet (four panels)</option></select></label>
        <div class="bulletin-block-library"><span class="eyebrow">Add from AGAPAY</span><button type="button" onclick="addBulletinBlock('message')"><span>＋</span><strong>Pastoral message</strong><small>Welcome or reflection</small></button><button type="button" onclick="addBulletinBlock('liturgical')"><span>＋</span><strong>Saint & readings</strong><small>Sunday appointments</small></button><button type="button" onclick="addBulletinBlock('hymns')"><span>＋</span><strong>Troparia & kontakia</strong><small>Temple, week, or feast</small></button><button type="button" onclick="addBulletinBlock('celebrations')"><span>＋</span><strong>Parish celebrations</strong><small>Name days and milestones</small></button><button type="button" onclick="addBulletinBlock('schedule')"><span>＋</span><strong>Service schedule</strong><small>This week’s worship</small></button><button type="button" onclick="addBulletinBlock('announcements')"><span>＋</span><strong>Announcements</strong><small>Published parish news</small></button><button type="button" onclick="addBulletinBlock('events')"><span>＋</span><strong>Upcoming events</strong><small>Dates and locations</small></button><button type="button" onclick="addBulletinBlock('giving')"><span>＋</span><strong>Giving</strong><small>Parish URL and QR</small></button></div>
      </aside>
      <main class="bulletin-canvas-wrap" aria-label="Bulletin page preview">
        <div class="bulletin-canvas-toolbar"><span id="bulletinPreviewStatus"><i></i> Continuous editing preview</span><button type="button" onclick="printBulletinPreview()">Download / Print PDF</button></div>
        <article id="bulletinPagePreview" class="bulletin-page" aria-live="polite"></article>
      </main>
      <aside class="bulletin-outline" aria-label="Bulletin outline"><div><span class="eyebrow">Document outline</span><strong>Content blocks</strong></div><div id="bulletinBlockOutline"></div><div id="bulletinBlockEditor" class="bulletin-block-editor"></div><p><b>Tip</b> Edit in normal reading order. Folded Booklet is arranged into four printable panels only when you download or print.</p></aside>
    </div>
    <dialog id="templeTropariaDialog" class="bulletin-hymn-dialog"><div class="bulletin-hymn-dialog-head"><div><span class="eyebrow">Approved parish translations</span><h3>Temple hymns library</h3><p>Save the troparia and kontakia used regularly at your temple. These become reusable starting texts for new bulletins.</p></div><button type="button" onclick="closeTempleTropariaEditor()" aria-label="Close temple hymns editor">×</button></div><div id="templeTropariaEditor" class="bulletin-hymn-library"></div><div class="bulletin-hymn-dialog-actions"><button class="btn btn-ghost" type="button" onclick="addTempleTroparionDraft()">＋ Add hymn</button><button class="btn btn-gold" type="button" onclick="saveTempleTroparia()">Save approved translations</button></div></dialog>`;
}

function nextSundayDate() {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + ((7 - date.getDay()) % 7));
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function bulletinDisplayDate(value) {
  const date = new Date(`${value || nextSundayDate()}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? 'Sunday'
    : new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }).format(date);
}

function newBulletinBlock(type) {
  const defaults = {
    message: {
      title: 'A word of welcome',
      body: 'Beloved in Christ,\n\nMay today’s worship renew us in faith, gratitude, and love for one another.',
    },
    liturgical: {
      title: 'Saint & appointed readings',
      saint: 'Add Sunday’s saint or feast',
      saintLife: '',
      quoteText: '',
      quoteAttribution: '',
      items: [],
      serviceDate: bulletinState.active?.serviceDate || nextSundayDate(),
      sourceLabel: '',
    },
    hymns: {
      title: 'Troparia & kontakia',
      hymns: structuredClone(bulletinState.templeTroparia || []),
    },
    celebrations: { title: 'Parish celebrations', items: [] },
    schedule: { title: 'This week in worship', items: [] },
    announcements: {
      title: 'Parish life',
      body: 'Add the announcements that will help parishioners worship, serve, and gather this week.',
    },
    events: { title: 'Coming up', items: [] },
    giving: {
      title: 'Give with gratitude',
      body: 'Support the worship, ministries, and charitable life of our parish.',
    },
  };
  return { id: crypto.randomUUID(), type, ...(defaults[type] || defaults.message) };
}

function createBulletinPreviewDraft() {
  const suggested = bulletinState.suggestions?.blocks;
  const blocks =
    Array.isArray(suggested) && suggested.length
      ? structuredClone(suggested)
      : [
          newBulletinBlock('message'),
          newBulletinBlock('liturgical'),
          {
            ...newBulletinBlock('schedule'),
            items: [
              { label: 'Sunday', text: 'Divine Liturgy · 10:00 AM' },
              { label: 'Wednesday', text: 'Vespers · 6:00 PM' },
            ],
          },
          newBulletinBlock('announcements'),
          newBulletinBlock('giving'),
        ];
  return {
    id: '',
    title: 'Sunday Bulletin',
    serviceDate: nextSundayDate(),
    template: 'heritage',
    status: 'draft',
    blocks,
  };
}

function openBulletinWorkspace() {
  setKoinoniaStudioView('bulletins');
  void loadBulletins();
}

async function loadBulletins(force = false) {
  ensureBulletinWorkspace();
  if (!currentParish || bulletinState.loading || (bulletinState.loaded && !force)) {
    if (!bulletinState.loading || bulletinState.active) initializeBulletinBuilder();
    return;
  }
  bulletinState.loading = true;
  const saveState = document.getElementById('bulletinSaveState');
  if (saveState) saveState.textContent = 'Loading editions';
  try {
    const response = await fetch(bulletinApi(`?serviceDate=${encodeURIComponent(nextSundayDate())}`), {
      headers: authHeaders(),
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Unable to load bulletins.');
    bulletinState.bulletins = data.bulletins || [];
    bulletinState.suggestions = data.suggestions || null;
    bulletinState.templeTroparia = data.templeTroparia || data.suggestions?.templeTroparia || [];
    bulletinState.loaded = true;
    if (!bulletinState.active || (!bulletinState.active.id && !bulletinState.dirty)) {
      bulletinState.active = bulletinState.bulletins[0]
        ? structuredClone(bulletinState.bulletins[0])
        : createBulletinPreviewDraft();
    }
    bulletinState.selectedBlockId = bulletinState.selectedBlockId || bulletinState.active.blocks?.[0]?.id || '';
    bulletinState.dirty = false;
    initializeBulletinBuilder();
  } catch (error) {
    if (!bulletinState.active) bulletinState.active = createBulletinPreviewDraft();
    initializeBulletinBuilder();
    setStatus(error.message || 'Unable to load bulletins.', 'error');
  } finally {
    bulletinState.loading = false;
  }
}

function initializeBulletinBuilder() {
  ensureBulletinWorkspace();
  if (!bulletinState.active) bulletinState.active = createBulletinPreviewDraft();
  const draft = bulletinState.active;
  bulletinState.selectedBlockId = bulletinState.selectedBlockId || draft.blocks?.[0]?.id || '';
  const date = document.getElementById('bulletinServiceDate');
  const title = document.getElementById('bulletinTitle');
  const template = document.getElementById('bulletinTemplate');
  if (date && document.activeElement !== date) date.value = draft.serviceDate;
  if (title && document.activeElement !== title) title.value = draft.title;
  if (template) template.value = draft.template;
  renderBulletinDraftSelect();
  renderBulletinBuilder();
  void ensureBulletinQr();
}

async function ensureBulletinQr() {
  const hasGiving = bulletinState.active?.blocks?.some((block) => block.type === 'giving');
  if (!hasGiving || bulletinQrLoading || typeof renderQrCode !== 'function') return;
  if (typeof currentQrSvg !== 'undefined' && currentQrSvg) return;
  bulletinQrLoading = true;
  try {
    await renderQrCode();
    renderBulletinPage();
  } finally {
    bulletinQrLoading = false;
  }
}

function renderBulletinDraftSelect() {
  const select = document.getElementById('bulletinDraftSelect');
  const count = document.getElementById('koinoniaBulletinCount');
  const detail = document.getElementById('koinoniaBulletinDetail');
  if (count) count.textContent = String(bulletinState.bulletins.length || 'New');
  if (detail) {
    detail.textContent = bulletinState.bulletins.length
      ? `${bulletinState.bulletins.length} saved edition${bulletinState.bulletins.length === 1 ? '' : 's'}`
      : 'Create from parish life';
  }
  if (!select) return;
  select.innerHTML = `<option value="">New bulletin</option>${bulletinState.bulletins
    .map(
      (item) =>
        `<option value="${escapeAttr(item.id)}">${escapeHtml(bulletinDisplayDate(item.serviceDate))} · ${escapeHtml(item.title)}</option>`
    )
    .join('')}`;
  select.value = bulletinState.active?.id || '';
}

function openBulletinDraft(id) {
  if (!id) {
    createNewBulletinDraft();
    return;
  }
  if (bulletinState.dirty && !confirm('Open another edition and discard your unsaved changes?')) {
    renderBulletinDraftSelect();
    return;
  }
  const bulletin = bulletinState.bulletins.find((item) => item.id === id);
  if (!bulletin) return;
  bulletinState.active = structuredClone(bulletin);
  bulletinState.selectedBlockId = bulletinState.active.blocks?.[0]?.id || '';
  bulletinState.dirty = false;
  initializeBulletinBuilder();
}

function createNewBulletinDraft() {
  if (bulletinState.dirty && !confirm('Start a new edition and discard your unsaved changes?')) return;
  bulletinState.active = createBulletinPreviewDraft();
  bulletinState.selectedBlockId = bulletinState.active.blocks?.[0]?.id || '';
  bulletinState.dirty = false;
  initializeBulletinBuilder();
}

function updateBulletinField(field, value) {
  if (!bulletinState.active) initializeBulletinBuilder();
  bulletinState.active[field] = value;
  bulletinState.dirty = true;
  renderBulletinBuilder();
}

async function updateBulletinServiceDate(value) {
  updateBulletinField('serviceDate', value);
  const draft = bulletinState.active;
  const requestId = ++bulletinLiturgicalRequestId;
  const existing = draft?.blocks?.find((block) => block.type === 'liturgical');
  const existingCelebrations = draft?.blocks?.find((block) => block.type === 'celebrations');
  const saveState = document.getElementById('bulletinSaveState');
  if (saveState) saveState.textContent = 'Finding Sunday saint & readings';
  try {
    const [liturgicalResponse, celebrationsResponse] = await Promise.all([
      fetch(bulletinApi(`/liturgical?serviceDate=${encodeURIComponent(value)}`), {
        headers: authHeaders(),
        cache: 'no-store',
      }),
      fetch(bulletinApi(`/celebrations?serviceDate=${encodeURIComponent(value)}`), {
        headers: authHeaders(),
        cache: 'no-store',
      }),
    ]);
    const [data, celebrationsData] = await Promise.all([
      liturgicalResponse.json().catch(() => ({})),
      celebrationsResponse.json().catch(() => ({})),
    ]);
    if (!liturgicalResponse.ok || !data.block) {
      throw new Error(data.error || 'Unable to load Sunday’s liturgical details.');
    }
    if (requestId !== bulletinLiturgicalRequestId || bulletinState.active !== draft || draft.serviceDate !== value)
      return;
    const block = {
      ...data.block,
      id: existing?.id || data.block.id || crypto.randomUUID(),
    };
    if (existing) {
      const index = draft.blocks.indexOf(existing);
      draft.blocks.splice(index, 1, block);
    } else {
      draft.blocks.splice(Math.min(1, draft.blocks.length), 0, block);
    }
    if (celebrationsResponse.ok && celebrationsData.block) {
      const manualItems = (existingCelebrations?.items || []).filter((item) => item.source !== 'directory');
      const celebrationBlock = {
        ...celebrationsData.block,
        id: existingCelebrations?.id || celebrationsData.block.id || crypto.randomUUID(),
        items: [...(celebrationsData.block.items || []), ...manualItems],
      };
      if (existingCelebrations) {
        draft.blocks.splice(draft.blocks.indexOf(existingCelebrations), 1, celebrationBlock);
      } else if (celebrationBlock.items.length) {
        draft.blocks.push(celebrationBlock);
      }
    }
    bulletinState.selectedBlockId = block.id;
    bulletinState.dirty = true;
    renderBulletinBuilder();
    setStatus('Sunday liturgical details and parish celebrations refreshed.', 'success');
  } catch (error) {
    if (requestId !== bulletinLiturgicalRequestId || bulletinState.active !== draft) return;
    renderBulletinSaveState();
    setStatus(error.message || 'Unable to load Sunday’s liturgical details.', 'error');
  }
}

function addBulletinBlock(type) {
  if (!bulletinState.active) initializeBulletinBuilder();
  if (type === 'liturgical') {
    const existing = bulletinState.active.blocks.find((block) => block.type === 'liturgical');
    if (existing) {
      bulletinState.selectedBlockId = existing.id;
      renderBulletinBuilder();
      void updateBulletinServiceDate(bulletinState.active.serviceDate);
      return;
    }
  }
  if (type === 'hymns') {
    const existing = bulletinState.active.blocks.find((block) => block.type === 'hymns');
    if (existing) {
      bulletinState.selectedBlockId = existing.id;
      renderBulletinBuilder();
      return;
    }
  }
  if (type === 'celebrations') {
    const existing = bulletinState.active.blocks.find((block) => block.type === 'celebrations');
    if (existing) {
      bulletinState.selectedBlockId = existing.id;
      renderBulletinBuilder();
      return;
    }
  }
  const block = newBulletinBlock(type);
  bulletinState.active.blocks.push(block);
  bulletinState.selectedBlockId = block.id;
  bulletinState.dirty = true;
  renderBulletinBuilder();
  if (type === 'liturgical') void updateBulletinServiceDate(bulletinState.active.serviceDate);
}

function selectBulletinBlock(id) {
  bulletinState.selectedBlockId = id;
  renderBulletinOutline();
  renderBulletinBlockEditor();
}

function removeBulletinBlock(id) {
  if (!bulletinState.active || bulletinState.active.blocks.length <= 1) {
    setStatus('Keep at least one content block in the bulletin.', 'error');
    return;
  }
  bulletinState.active.blocks = bulletinState.active.blocks.filter((block) => block.id !== id);
  bulletinState.selectedBlockId = bulletinState.active.blocks[0]?.id || '';
  bulletinState.dirty = true;
  renderBulletinBuilder();
}

function moveBulletinBlock(id, direction) {
  const blocks = bulletinState.active?.blocks || [];
  const index = blocks.findIndex((block) => block.id === id);
  const target = index + Number(direction || 0);
  if (index < 0 || target < 0 || target >= blocks.length) return;
  [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
  bulletinState.dirty = true;
  renderBulletinBuilder();
}

function updateBulletinBlockField(id, field, value) {
  const block = bulletinState.active?.blocks?.find((item) => item.id === id);
  if (!block || !['title', 'body', 'saint', 'saintLife', 'quoteText', 'quoteAttribution'].includes(field)) return;
  block[field] = value;
  bulletinState.dirty = true;
  renderBulletinPage();
  renderBulletinSaveState();
}

function addBulletinItem(id) {
  const block = bulletinState.active?.blocks?.find((item) => item.id === id);
  if (!block || !Array.isArray(block.items)) return;
  block.items.push({ label: '', text: '' });
  bulletinState.dirty = true;
  renderBulletinBuilder();
}

function updateBulletinItem(id, index, field, value) {
  const block = bulletinState.active?.blocks?.find((item) => item.id === id);
  const item = block?.items?.[index];
  if (!item || !['label', 'text'].includes(field)) return;
  item[field] = value;
  if (block.type === 'celebrations') item.source = 'manual';
  bulletinState.dirty = true;
  renderBulletinPage();
  renderBulletinSaveState();
}

function removeBulletinItem(id, index) {
  const block = bulletinState.active?.blocks?.find((item) => item.id === id);
  if (!block || !Array.isArray(block.items)) return;
  block.items.splice(index, 1);
  bulletinState.dirty = true;
  renderBulletinBuilder();
}

function newBulletinHymn() {
  return {
    id: crypto.randomUUID(),
    kind: 'troparion',
    title: '',
    tone: '',
    text: '',
  };
}

function addBulletinHymn(id) {
  const block = bulletinState.active?.blocks?.find((item) => item.id === id && item.type === 'hymns');
  if (!block) return;
  block.hymns = Array.isArray(block.hymns) ? block.hymns : [];
  block.hymns.push(newBulletinHymn());
  bulletinState.dirty = true;
  renderBulletinBuilder();
}

function updateBulletinHymn(id, index, field, value) {
  const hymn = bulletinState.active?.blocks?.find((item) => item.id === id)?.hymns?.[index];
  if (!hymn || !['kind', 'title', 'tone', 'text'].includes(field)) return;
  hymn[field] = value;
  bulletinState.dirty = true;
  renderBulletinPage();
  renderBulletinSaveState();
}

function removeBulletinHymn(id, index) {
  const block = bulletinState.active?.blocks?.find((item) => item.id === id && item.type === 'hymns');
  if (!block || !Array.isArray(block.hymns)) return;
  block.hymns.splice(index, 1);
  bulletinState.dirty = true;
  renderBulletinBuilder();
}

function refreshBulletinHymnsFromLibrary(id) {
  const block = bulletinState.active?.blocks?.find((item) => item.id === id && item.type === 'hymns');
  if (!block) return;
  block.hymns = structuredClone(bulletinState.templeTroparia || []);
  bulletinState.dirty = true;
  renderBulletinBuilder();
  setStatus('Approved temple hymns copied into this bulletin.', 'success');
}

function bulletinBlockMarkup(block, { omitSaintLife = false, omitSaintQuote = false } = {}) {
  if (block.type === 'liturgical') {
    const readings = (block.items || [])
      .filter((item) => item.label || item.text)
      .map((item) => `<li><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.text)}</span></li>`)
      .join('');
    const saintLife =
      block.saintLife && !omitSaintLife
        ? `<div class="bulletin-saint-life"><span>Life of the saint</span><p>${escapeHtml(block.saintLife)}</p></div>`
        : '';
    const quote =
      block.quoteText && !omitSaintQuote
        ? `<blockquote class="bulletin-saint-quote"><p>“${escapeHtml(block.quoteText)}”</p>${block.quoteAttribution ? `<cite>— ${escapeHtml(block.quoteAttribution)}</cite>` : ''}</blockquote>`
        : '';
    return `<section class="bulletin-print-block bulletin-print-liturgical"><h2>${escapeHtml(block.title)}</h2><div class="bulletin-saint"><span>Saint of the Sunday</span><strong>${escapeHtml(block.saint || 'Add Sunday’s saint or feast')}</strong></div>${saintLife}${quote}${readings ? `<ul>${readings}</ul>` : '<p class="bulletin-print-empty">Add the appointed Epistle and Gospel.</p>'}${block.sourceLabel ? `<small>Liturgical data: ${escapeHtml(block.sourceLabel)}</small>` : ''}</section>`;
  }
  if (block.type === 'schedule' || block.type === 'events' || block.type === 'celebrations') {
    const emptyCopy =
      block.type === 'events'
        ? 'Add upcoming parish events.'
        : block.type === 'celebrations'
          ? 'Add name days, birthdays, or anniversaries for this week.'
          : 'Add this week’s service times.';
    const items = (block.items || [])
      .filter((item) => item.label || item.text)
      .map((item) => `<li><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.text)}</span></li>`)
      .join('');
    return `<section class="bulletin-print-block"><h2>${escapeHtml(block.title)}</h2>${items ? `<ul>${items}</ul>` : `<p class="bulletin-print-empty">${escapeHtml(emptyCopy)}</p>`}</section>`;
  }
  if (block.type === 'hymns') {
    const hymns = (block.hymns || [])
      .filter((hymn) => hymn.title || hymn.text)
      .map((hymn) => {
        const kind = hymn.kind === 'kontakion' ? 'Kontakion' : hymn.kind === 'other' ? 'Hymn' : 'Troparion';
        const label = [kind, hymn.tone].filter(Boolean).join(' · ');
        return `<div class="bulletin-hymn"><span>${escapeHtml(label)}</span>${hymn.title ? `<strong>${escapeHtml(hymn.title)}</strong>` : ''}<p>${escapeHtml(hymn.text)}</p></div>`;
      })
      .join('');
    return `<section class="bulletin-print-block bulletin-print-hymns"><h2>${escapeHtml(block.title)}</h2>${hymns || '<p class="bulletin-print-empty">Add the troparia or kontakia appointed for this week.</p>'}</section>`;
  }
  if (block.type === 'giving') {
    const givingUrl =
      currentParish?.dedicatedGivingUrl || (typeof dedicatedGivingUrl === 'function' ? dedicatedGivingUrl() : '');
    const qr = typeof currentQrSvg !== 'undefined' ? currentQrSvg : '';
    return `<section class="bulletin-print-block bulletin-print-giving"><h2>${escapeHtml(block.title)}</h2>${qr ? `<div class="bulletin-giving-qr">${qr}</div>` : ''}<p>${escapeHtml(block.body)}</p><strong>${escapeHtml((givingUrl || 'agapay.app/give').replace(/^https?:\/\//, ''))}</strong></section>`;
  }
  return `<section class="bulletin-print-block"><h2>${escapeHtml(block.title)}</h2><p>${escapeHtml(block.body)}</p></section>`;
}

function bulletinPageHeaderMarkup(draft, parishName, city, { cover = false } = {}) {
  return `<header class="bulletin-page-header${cover ? ' is-cover' : ''}"><span class="bulletin-page-kicker">${escapeHtml(parishName)}</span><h1>${escapeHtml(draft.title || 'Sunday Bulletin')}</h1><p>${escapeHtml(bulletinDisplayDate(draft.serviceDate))}${city ? ` · ${escapeHtml(city)}` : ''}</p></header>`;
}

function bulletinFoldSaintFeatureMarkup(liturgicalBlock) {
  if (!liturgicalBlock?.saintLife && !liturgicalBlock?.quoteText) return '';
  const life = liturgicalBlock.saintLife
    ? `<div class="bulletin-saint-life"><span>Life of the saint</span><p>${escapeHtml(liturgicalBlock.saintLife)}</p></div>`
    : '';
  const quote = liturgicalBlock.quoteText
    ? `<blockquote class="bulletin-saint-quote"><p>“${escapeHtml(liturgicalBlock.quoteText)}”</p>${liturgicalBlock.quoteAttribution ? `<cite>— ${escapeHtml(liturgicalBlock.quoteAttribution)}</cite>` : ''}</blockquote>`
    : '';
  return `<section class="bulletin-print-block bulletin-fold-saint-feature"><h2>Life & wisdom of the saint</h2>${liturgicalBlock.saint ? `<strong class="bulletin-fold-saint-name">${escapeHtml(liturgicalBlock.saint)}</strong>` : ''}${life}${quote}</section>`;
}

function renderFoldedBulletin(draft, parishName, city) {
  const blocks = Array.isArray(draft.blocks) ? draft.blocks : [];
  const liturgical = blocks.find((block) => block.type === 'liturgical');
  const byType = (...types) => blocks.filter((block) => types.includes(block.type));
  const assignedTypes = new Set([
    'liturgical',
    'giving',
    'events',
    'celebrations',
    'schedule',
    'hymns',
    'message',
    'announcements',
  ]);
  const backBlocks = [...byType('events'), ...byType('celebrations'), ...byType('giving')];
  const insideLeftBlocks = [...byType('schedule'), ...byType('hymns')];
  const insideRightBlocks = [
    ...byType('message', 'announcements'),
    ...blocks.filter((block) => !assignedTypes.has(block.type)),
  ];
  const panelFooter = `<footer class="bulletin-fold-panel-footer"><span>${escapeHtml(parishName)}</span><span>AGAPAY</span></footer>`;
  const frontLiturgical = liturgical
    ? bulletinBlockMarkup(liturgical, { omitSaintLife: true, omitSaintQuote: true })
    : '<section class="bulletin-print-block bulletin-print-liturgical"><h2>Saint & appointed readings</h2><p class="bulletin-print-empty">Add the saint and readings for this Sunday.</p></section>';
  return `<div class="bulletin-fold-sheets"><section class="bulletin-fold-sheet is-outside" aria-label="Outside spread"><div class="bulletin-fold-panel is-back">${backBlocks.map((block) => bulletinBlockMarkup(block)).join('') || '<section class="bulletin-print-block"><h2>Parish life</h2><p class="bulletin-print-empty">Add giving, celebrations, or upcoming events.</p></section>'}${panelFooter}</div><div class="bulletin-fold-panel is-front">${bulletinPageHeaderMarkup(draft, parishName, city, { cover: true })}<div class="bulletin-cover-content">${frontLiturgical}</div>${panelFooter}</div></section><section class="bulletin-fold-sheet is-inside" aria-label="Inside spread"><div class="bulletin-fold-panel is-inside-left">${insideLeftBlocks.map((block) => bulletinBlockMarkup(block)).join('') || '<section class="bulletin-print-block"><h2>This week in worship</h2><p class="bulletin-print-empty">Add this week’s service schedule.</p></section>'}${panelFooter}</div><div class="bulletin-fold-panel is-inside-right">${insideRightBlocks.map((block) => bulletinBlockMarkup(block)).join('')}${bulletinFoldSaintFeatureMarkup(liturgical)}${panelFooter}</div></section></div>`;
}

function bulletinBlockLabel(block) {
  return (
    {
      message: 'Pastoral message',
      liturgical: 'Saint & readings',
      hymns: 'Troparia & kontakia',
      celebrations: 'Parish celebrations',
      schedule: 'Service schedule',
      announcements: 'Announcements',
      events: 'Upcoming events',
      giving: 'Giving invitation',
    }[block.type] || block.title
  );
}

function renderBulletinPage() {
  const draft = bulletinState.active;
  const page = document.getElementById('bulletinPagePreview');
  const previewStatus = document.getElementById('bulletinPreviewStatus');
  if (!draft || !page) return;
  const parishName = currentParish?.parishName || 'Your Parish';
  const city = [currentParish?.city, currentParish?.state].filter(Boolean).join(', ');
  page.classList.toggle('is-quiet', draft.template === 'quiet');
  page.classList.remove('is-folded', 'has-overflow');
  page.classList.add('is-builder-flow');
  page.innerHTML = `${bulletinPageHeaderMarkup(draft, parishName, city)}<div class="bulletin-page-columns">${draft.blocks.map((block) => bulletinBlockMarkup(block)).join('')}</div><footer class="bulletin-page-footer"><span>${escapeHtml(parishName)}</span><span>Made with AGAPAY</span></footer>`;
  if (previewStatus) {
    previewStatus.classList.remove('has-warning');
    previewStatus.innerHTML = `<i></i> ${draft.template === 'folded' ? 'Continuous preview · Downloads as four folded panels' : 'Continuous editing preview'}`;
  }
}

function renderBulletinOutline() {
  const draft = bulletinState.active;
  const outline = document.getElementById('bulletinBlockOutline');
  if (!draft || !outline) return;
  outline.innerHTML = draft.blocks
    .map(
      (block, index) =>
        `<div class="bulletin-outline-item${block.id === bulletinState.selectedBlockId ? ' is-selected' : ''}"><button class="bulletin-outline-select" type="button" onclick="selectBulletinBlock('${block.id}')"><span>${String(index + 1).padStart(2, '0')}</span><strong>${escapeHtml(bulletinBlockLabel(block))}</strong></button><span class="bulletin-outline-order"><button type="button" onclick="moveBulletinBlock('${block.id}',-1)" aria-label="Move ${escapeHtml(bulletinBlockLabel(block))} up" ${index === 0 ? 'disabled' : ''}>↑</button><button type="button" onclick="moveBulletinBlock('${block.id}',1)" aria-label="Move ${escapeHtml(bulletinBlockLabel(block))} down" ${index === draft.blocks.length - 1 ? 'disabled' : ''}>↓</button></span><button class="bulletin-outline-remove" type="button" onclick="removeBulletinBlock('${block.id}')" aria-label="Remove ${escapeHtml(bulletinBlockLabel(block))}">×</button></div>`
    )
    .join('');
}

function renderBulletinBlockEditor() {
  const editor = document.getElementById('bulletinBlockEditor');
  const block = bulletinState.active?.blocks?.find((item) => item.id === bulletinState.selectedBlockId);
  if (!editor) return;
  if (!block) {
    editor.innerHTML = '';
    return;
  }
  const title = `<label>Section heading<input maxlength="120" value="${escapeAttr(block.title)}" oninput="updateBulletinBlockField('${block.id}','title',this.value)" /></label>`;
  if (block.type === 'liturgical') {
    editor.innerHTML = `<span class="eyebrow">Edit block</span>${title}<label>Saint or feast<textarea maxlength="500" rows="3" oninput="updateBulletinBlockField('${block.id}','saint',this.value)">${escapeHtml(block.saint || '')}</textarea></label><label>Life of the saint<textarea maxlength="4000" rows="7" placeholder="Added automatically when available" oninput="updateBulletinBlockField('${block.id}','saintLife',this.value)">${escapeHtml(block.saintLife || '')}</textarea></label><label>Saint quotation<textarea maxlength="1000" rows="4" placeholder="Optional verified quotation" oninput="updateBulletinBlockField('${block.id}','quoteText',this.value)">${escapeHtml(block.quoteText || '')}</textarea></label><label>Quotation attribution<input maxlength="200" placeholder="St. John Chrysostom" value="${escapeAttr(block.quoteAttribution || '')}" oninput="updateBulletinBlockField('${block.id}','quoteAttribution',this.value)" /></label><div class="bulletin-item-editor">${(
      block.items || []
    )
      .map(
        (item, index) =>
          `<div><input maxlength="80" value="${escapeAttr(item.label)}" placeholder="Epistle or Gospel" oninput="updateBulletinItem('${block.id}',${index},'label',this.value)" /><textarea maxlength="500" rows="2" placeholder="Scripture appointment" oninput="updateBulletinItem('${block.id}',${index},'text',this.value)">${escapeHtml(item.text)}</textarea><button type="button" onclick="removeBulletinItem('${block.id}',${index})" aria-label="Remove reading">×</button></div>`
      )
      .join(
        ''
      )}</div><button class="bulletin-add-item" type="button" onclick="addBulletinItem('${block.id}')">＋ Add reading</button>`;
    return;
  }
  if (block.type === 'hymns') {
    editor.innerHTML = `<span class="eyebrow">Edit block</span>${title}<button class="bulletin-add-item" type="button" onclick="refreshBulletinHymnsFromLibrary('${block.id}')">↻ Use approved temple hymns</button><div class="bulletin-hymn-editor">${(
      block.hymns || []
    )
      .map(
        (hymn, index) =>
          `<div><button type="button" onclick="removeBulletinHymn('${block.id}',${index})" aria-label="Remove hymn">×</button><label>Kind<select onchange="updateBulletinHymn('${block.id}',${index},'kind',this.value)"><option value="troparion"${hymn.kind === 'troparion' ? ' selected' : ''}>Troparion</option><option value="kontakion"${hymn.kind === 'kontakion' ? ' selected' : ''}>Kontakion</option><option value="other"${hymn.kind === 'other' ? ' selected' : ''}>Other hymn</option></select></label><label>Title<input maxlength="120" value="${escapeAttr(hymn.title)}" placeholder="Temple, Sunday, or feast" oninput="updateBulletinHymn('${block.id}',${index},'title',this.value)" /></label><label>Tone<input maxlength="80" value="${escapeAttr(hymn.tone)}" placeholder="Tone 4" oninput="updateBulletinHymn('${block.id}',${index},'tone',this.value)" /></label><label>Approved text<textarea maxlength="5000" rows="6" oninput="updateBulletinHymn('${block.id}',${index},'text',this.value)">${escapeHtml(hymn.text)}</textarea></label></div>`
      )
      .join(
        ''
      )}</div><button class="bulletin-add-item" type="button" onclick="addBulletinHymn('${block.id}')">＋ Add week or feast hymn</button>`;
    return;
  }
  if (block.type === 'schedule' || block.type === 'events' || block.type === 'celebrations') {
    editor.innerHTML = `<span class="eyebrow">Edit block</span>${title}<div class="bulletin-item-editor">${(
      block.items || []
    )
      .map(
        (item, index) =>
          `<div><input maxlength="80" value="${escapeAttr(item.label)}" placeholder="Day or date" oninput="updateBulletinItem('${block.id}',${index},'label',this.value)" /><textarea maxlength="500" rows="2" placeholder="Time, title, and location" oninput="updateBulletinItem('${block.id}',${index},'text',this.value)">${escapeHtml(item.text)}</textarea><button type="button" onclick="removeBulletinItem('${block.id}',${index})" aria-label="Remove item">×</button></div>`
      )
      .join(
        ''
      )}</div><button class="bulletin-add-item" type="button" onclick="addBulletinItem('${block.id}')">＋ Add ${block.type === 'events' ? 'event' : block.type === 'celebrations' ? 'name or milestone' : 'service'}</button>`;
    return;
  }
  editor.innerHTML = `<span class="eyebrow">Edit block</span>${title}<label>Body<textarea maxlength="8000" rows="8" oninput="updateBulletinBlockField('${block.id}','body',this.value)">${escapeHtml(block.body || '')}</textarea></label>`;
}

function renderBulletinSaveState() {
  const saveState = document.getElementById('bulletinSaveState');
  if (!saveState || !bulletinState.active) return;
  saveState.textContent = bulletinState.dirty
    ? 'Unsaved changes'
    : bulletinState.active.id
      ? 'Draft saved'
      : 'Preview draft';
}

function renderBulletinBuilder() {
  renderBulletinPage();
  renderBulletinOutline();
  renderBulletinBlockEditor();
  renderBulletinSaveState();
}

function duplicateBulletinDraft() {
  if (!bulletinState.active) initializeBulletinBuilder();
  const copy = structuredClone(bulletinState.active);
  bulletinState.active = {
    ...copy,
    id: '',
    title: `${bulletinState.active.title} · Copy`,
    status: 'draft',
    blocks: copy.blocks.map((block) => ({ ...block, id: crypto.randomUUID() })),
  };
  bulletinState.selectedBlockId = bulletinState.active.blocks?.[0]?.id || '';
  bulletinState.dirty = true;
  initializeBulletinBuilder();
  setStatus('Bulletin duplicated as a new draft.', 'success');
}

async function saveBulletinDraft() {
  const draft = bulletinState.active;
  if (!draft) return;
  const button = document.querySelector('.bulletin-workspace-actions .btn-gold');
  if (button) button.disabled = true;
  try {
    const response = await fetch(bulletinApi(draft.id ? `/${encodeURIComponent(draft.id)}` : ''), {
      method: draft.id ? 'PATCH' : 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: draft.title,
        serviceDate: draft.serviceDate,
        template: draft.template,
        blocks: draft.blocks,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Unable to save the bulletin.');
    bulletinState.active = structuredClone(data.bulletin);
    const existing = bulletinState.bulletins.findIndex((item) => item.id === data.bulletin.id);
    if (existing >= 0) bulletinState.bulletins[existing] = structuredClone(data.bulletin);
    else bulletinState.bulletins.unshift(structuredClone(data.bulletin));
    bulletinState.dirty = false;
    renderBulletinDraftSelect();
    initializeBulletinBuilder();
    setStatus('Bulletin draft saved.', 'success');
  } catch (error) {
    setStatus(error.message || 'Unable to save the bulletin.', 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

function openTempleTropariaEditor() {
  bulletinState.templeTropariaDraft = structuredClone(bulletinState.templeTroparia || []);
  renderTempleTropariaEditor();
  const dialog = document.getElementById('templeTropariaDialog');
  if (!dialog) return;
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

function closeTempleTropariaEditor() {
  const dialog = document.getElementById('templeTropariaDialog');
  if (!dialog) return;
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
}

function addTempleTroparionDraft() {
  bulletinState.templeTropariaDraft.push(newBulletinHymn());
  renderTempleTropariaEditor();
}

function updateTempleTroparionDraft(index, field, value) {
  const hymn = bulletinState.templeTropariaDraft[index];
  if (!hymn || !['kind', 'title', 'tone', 'text'].includes(field)) return;
  hymn[field] = value;
}

function removeTempleTroparionDraft(index) {
  bulletinState.templeTropariaDraft.splice(index, 1);
  renderTempleTropariaEditor();
}

function renderTempleTropariaEditor() {
  const editor = document.getElementById('templeTropariaEditor');
  if (!editor) return;
  if (!bulletinState.templeTropariaDraft.length) {
    editor.innerHTML =
      '<div class="bulletin-hymn-library-empty"><strong>No approved temple hymns yet</strong><p>Add the translation your parish uses so staff can reuse it confidently.</p></div>';
    return;
  }
  editor.innerHTML = bulletinState.templeTropariaDraft
    .map(
      (hymn, index) =>
        `<article><div class="bulletin-hymn-library-number">${String(index + 1).padStart(2, '0')}</div><button type="button" onclick="removeTempleTroparionDraft(${index})" aria-label="Remove approved hymn">×</button><label>Kind<select onchange="updateTempleTroparionDraft(${index},'kind',this.value)"><option value="troparion"${hymn.kind === 'troparion' ? ' selected' : ''}>Troparion</option><option value="kontakion"${hymn.kind === 'kontakion' ? ' selected' : ''}>Kontakion</option><option value="other"${hymn.kind === 'other' ? ' selected' : ''}>Other hymn</option></select></label><label>Title<input maxlength="120" value="${escapeAttr(hymn.title)}" placeholder="Troparion of the temple" oninput="updateTempleTroparionDraft(${index},'title',this.value)" /></label><label>Tone<input maxlength="80" value="${escapeAttr(hymn.tone)}" placeholder="Tone 4" oninput="updateTempleTroparionDraft(${index},'tone',this.value)" /></label><label class="bulletin-hymn-library-text">Approved translation<textarea maxlength="5000" rows="7" placeholder="Enter the exact translation approved for parish use" oninput="updateTempleTroparionDraft(${index},'text',this.value)">${escapeHtml(hymn.text)}</textarea></label></article>`
    )
    .join('');
}

async function saveTempleTroparia() {
  const button = document.querySelector('.bulletin-hymn-dialog-actions .btn-gold');
  if (button) button.disabled = true;
  try {
    const response = await fetch(bulletinApi('/hymns'), {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ troparia: bulletinState.templeTropariaDraft }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Unable to save the temple hymns.');
    bulletinState.templeTroparia = data.troparia || [];
    const existing = bulletinState.active?.blocks?.find((block) => block.type === 'hymns');
    if (!existing && bulletinState.templeTroparia.length) {
      const block = newBulletinBlock('hymns');
      bulletinState.active.blocks.splice(Math.min(2, bulletinState.active.blocks.length), 0, block);
      bulletinState.selectedBlockId = block.id;
      bulletinState.dirty = true;
      renderBulletinBuilder();
    }
    closeTempleTropariaEditor();
    setStatus('Approved temple hymns saved for future bulletins.', 'success');
  } catch (error) {
    setStatus(error.message || 'Unable to save the temple hymns.', 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

function printBulletinPreview() {
  const page = document.getElementById('bulletinPagePreview');
  const draft = bulletinState.active;
  if (!page || !draft) return;
  const parishName = currentParish?.parishName || 'Your Parish';
  const city = [currentParish?.city, currentParish?.state].filter(Boolean).join(', ');
  const folded = draft.template === 'folded';
  const printPageClass = `bulletin-page${draft.template === 'quiet' ? ' is-quiet' : ''}${folded ? ' is-folded' : ''}`;
  const printPageMarkup = folded
    ? renderFoldedBulletin(draft, parishName, city)
    : `${bulletinPageHeaderMarkup(draft, parishName, city)}<div class="bulletin-page-columns">${draft.blocks.map((block) => bulletinBlockMarkup(block)).join('')}</div><footer class="bulletin-page-footer"><span>${escapeHtml(parishName)}</span><span>Made with AGAPAY</span></footer>`;
  const frame = document.createElement('iframe');
  frame.className = 'bulletin-print-frame';
  frame.setAttribute('title', 'Bulletin print document');
  document.body.append(frame);
  const printDocument = frame.contentDocument;
  printDocument.open();
  printDocument.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(draft.title || 'Sunday Bulletin')}</title><link rel="stylesheet" href="/parish/bulletins.css?v=b3"></head><body class="bulletin-print-document${folded ? ' is-folded' : ''}"><article class="${printPageClass}">${printPageMarkup}</article></body></html>`
  );
  printDocument.close();
  const printWhenReady = () => {
    const printWindow = frame.contentWindow;
    const cleanup = () => frame.remove();
    printWindow.addEventListener('afterprint', cleanup, { once: true });
    printWindow.focus();
    printWindow.print();
    setTimeout(cleanup, 60000);
  };
  const stylesheet = printDocument.querySelector('link[rel="stylesheet"]');
  if (stylesheet) stylesheet.addEventListener('load', printWhenReady, { once: true });
  else printWhenReady();
}

installBulletinEntryPoints();
