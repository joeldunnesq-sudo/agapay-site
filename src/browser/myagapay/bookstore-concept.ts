(() => {
  function conceptElement<T extends HTMLElement>(selector: string, elementType: { new (): T }): T {
    const element = document.querySelector(selector);
    if (!(element instanceof elementType)) throw new Error('Missing concept element: ' + selector);
    return element;
  }
  const paths = {
    'arrow-left': 'M19 12H5m6-6-6 6 6 6',
    'arrow-right': 'M5 12h14m-6-6 6 6-6 6',
    heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
    bag: 'M5 7h14l1 14H4L5 7Zm3 0V5a4 4 0 0 1 8 0v2',
    search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
    pin: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
    book: 'M12 5v16M3 3c4-1 7 0 9 2 2-2 5-3 9-2v16c-4-1-7 0-9 2-2-2-5-3-9-2V3Z',
    home: 'm3 10 9-8 9 8M5 8v13h14V8M9 21v-8h6v8',
    calendar: 'M4 5h16v16H4V5ZM8 2v6m8-6v6M4 10h16',
    sun: 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1',
    church: 'M12 2v6M9 4h6M4 21V11l8-5 8 5v10H4ZM9 21v-7h6v7',
    gift: 'M3 8h18v4H3V8ZM5 12v9h14v-9M12 8v13M12 8C3 9 4 1 8 3l4 5Zm0 0c9 1 8-7 4-5l-4 5Z',
    close: 'm6 6 12 12M6 18 18 6',
    plus: 'M12 5v14M5 12h14',
  };
  const icon = (name: string = 'book') =>
    `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${Object.entries(paths).find(([key]) => key === name)?.[1] || paths.book}"/></svg>`;
  document.querySelectorAll('[data-icon]').forEach((el) => {
    if (el instanceof HTMLElement) el.innerHTML = icon(el.dataset.icon);
  });
  const products = [
    {
      id: 1,
      title: 'Daily Prayers',
      category: 'Books',
      note: 'Clothbound · A companion for every day',
      price: 24,
      image: 0,
      badge: 'PARISH FAVORITE',
      description:
        'A beautiful clothbound companion for the small, sacred rhythms of everyday life. Morning and evening prayers gathered in a volume made to keep close.',
      detail: 'Olive cloth cover · Gold foil detail · Hardcover',
    },
    {
      id: 2,
      title: 'Christ Pantocrator',
      category: 'Icons',
      note: 'Traditional Byzantine icon · Wood mounted',
      price: 38,
      image: 1,
      badge: 'FOR YOUR PRAYER CORNER',
      description:
        'A timeless image of Christ, rendered in the Byzantine tradition with warm gold tones. A meaningful centerpiece for a prayer corner, or a thoughtful gift for a new home.',
      detail: 'Wood mounted · Gold-toned finish · 5 × 7 in.',
    },
    {
      id: 3,
      title: 'The Prayer Rope',
      category: 'Prayer ropes',
      note: 'Hand-knotted wool · 50 knots',
      price: 18,
      image: 2,
      badge: '',
      description:
        'A simple invitation to pause and pray. Soft black wool knots, a small wooden cross, and a traditional tassel make this a quiet companion for the Jesus Prayer.',
      detail: 'Black wool · 50 knots · Wooden cross',
    },
    {
      id: 4,
      title: 'Pure Beeswax Candles',
      category: 'Candles',
      note: 'Naturally golden · Bundle of 12',
      price: 16,
      image: 3,
      badge: 'A LITTLE LIGHT',
      description:
        'Bring a warm, gentle light to your daily prayers. A bundle of slender beeswax tapers, tied with natural linen and ready for your home prayer corner.',
      detail: 'Beeswax · 12 taper candles · Natural color',
    },
  ];
  let category = 'All items',
    savedOnly = false;
  const saved = new Set<number>();
  const bag = new Map<number, number>();
  type ConceptProduct = (typeof products)[number];
  const money = (value: number) => `$${value.toFixed(2)}`;
  const art = (product: ConceptProduct) =>
    `<span class="product-art" style="background-position:${(product.image * 100) / 3}% center" role="img" aria-label="${product.title}"></span>`;
  const grid = conceptElement('#products', HTMLElement);
  function render() {
    const query = conceptElement('#search', HTMLInputElement).value.trim().toLowerCase();
    const visible = products.filter(
      (p) =>
        (category === 'All items' || p.category === category) &&
        (p.title + ' ' + p.category + ' ' + p.note).toLowerCase().includes(query) &&
        (!savedOnly || saved.has(p.id))
    );
    const sort = conceptElement('#sort', HTMLSelectElement).value;
    if (sort === 'low') visible.sort((a, b) => a.price - b.price);
    if (sort === 'high') visible.sort((a, b) => b.price - a.price);
    if (sort === 'name') visible.sort((a, b) => a.title.localeCompare(b.title));
    conceptElement('#filters', HTMLElement).innerHTML = ['All items', 'Books', 'Icons', 'Prayer ropes', 'Candles']
      .map((c) => `<button type="button" data-category="${c}" aria-pressed="${c === category}">${c}</button>`)
      .join('');
    conceptElement('#shelf-title', HTMLElement).textContent = savedOnly
      ? 'Your saved finds'
      : category === 'All items'
        ? 'The parish favorites'
        : category;
    conceptElement('#result-count', HTMLElement).textContent = `${visible.length} thoughtfully chosen items`;
    conceptElement('#empty', HTMLElement).hidden = visible.length > 0;
    grid.innerHTML = visible
      .map(
        (p) =>
          `<article class="product-card"><button class="product-image" data-detail="${p.id}" aria-label="View ${p.title}">${art(p)}${p.badge ? `<span class="badge">${p.badge}</span>` : ''}</button><button class="save icon-button" data-save="${p.id}" aria-pressed="${saved.has(p.id)}" aria-label="Save ${p.title}">${icon('heart')}</button><p class="product-type">${p.category.toUpperCase()}</p><button class="product-title" data-detail="${p.id}">${p.title}</button><p class="product-note">${p.note}</p><div class="price-row"><span class="price">${money(p.price)}</span><button class="add-button" data-add="${p.id}" aria-label="Add ${p.title} to bag">${icon('plus')}</button></div></article>`
      )
      .join('');
  }
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  function toast(message: string) {
    const el = conceptElement('#toast', HTMLElement);
    el.textContent = message;
    el.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('visible'), 2600);
  }
  function add(id: number) {
    const product = products.find((p) => p.id === id);
    if (!product) return;
    bag.set(id, (bag.get(id) || 0) + 1);
    updateBag();
    toast(`${product.title} added to your bag`);
  }
  function updateBag() {
    const count = [...bag.values()].reduce((a, b) => a + b, 0);
    conceptElement('#bag-count', HTMLElement).textContent = String(count);
    conceptElement('#bag-button', HTMLElement).setAttribute('aria-label', `Open shopping bag, ${count} items`);
    let total = 0;
    conceptElement('#bag-items', HTMLElement).innerHTML = count
      ? [...bag]
          .map(([id, qty]) => {
            const p = products.find((p) => p.id === id);
            if (!p) return;
            total += p.price * qty;
            return `<div class="bag-item">${art(p)}<div><h3>${p.title}</h3><p>${money(p.price)} each</p><div class="quantity"><button data-quantity="${id}" data-delta="-1" aria-label="Decrease ${p.title} quantity">−</button><span>${qty}</span><button data-quantity="${id}" data-delta="1" aria-label="Increase ${p.title} quantity">+</button></div></div><div><span class="price">${money(p.price * qty)}</span><br><button class="remove" data-remove="${id}">Remove</button></div></div>`;
          })
          .join('')
      : '<div class="empty"><h3>Room for something meaningful.</h3><p>Explore the collection and find a little something for your everyday faith.</p><button class="secondary" data-close>Continue exploring</button></div>';
    conceptElement('#bag-summary', HTMLElement).innerHTML = count
      ? `<div class="total"><span>Subtotal</span><span>${money(total)}</span></div><p class="bag-note">${icon('church')} <b>Pickup at your parish</b><br>Collect your items after Divine Liturgy.<br><br>This is a design preview. Products and prices are samples; no order will be placed.</p><button class="primary" id="checkout-preview">Preview pickup summary ${icon('arrow-right')}</button>`
      : '';
  }
  function detail(id: number) {
    const p = products.find((p) => p.id === id);
    if (!p) return;
    conceptElement('#product-detail', HTMLElement).innerHTML =
      `<div class="detail-layout"><div class="detail-image">${art(p)}</div><div class="detail-copy"><span class="eyebrow">${p.category.toUpperCase()}</span><h2 id="detail-title">${p.title}</h2><p>${p.description}</p><p>${p.detail}</p><span class="price">${money(p.price)}</span><button class="primary" data-add="${p.id}">Add to my bag ${icon('bag')}</button><small>Parish pickup after Liturgy</small><small>Sample product · Visual concept</small></div></div>`;
    conceptElement('#product-dialog', HTMLDialogElement).showModal();
  }
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.category) {
      category = button.dataset.category;
      render();
      document.querySelectorAll('[data-category]').forEach((el) => {
        if (el instanceof HTMLElement && el.dataset.category === category) el.focus();
      });
    }
    if (button.dataset.add) add(Number(button.dataset.add));
    if (button.dataset.detail) detail(Number(button.dataset.detail));
    if (button.dataset.save) {
      const id = Number(button.dataset.save);
      if (saved.has(id)) saved.delete(id);
      else saved.add(id);
      render();
      const savedButton = grid.querySelector(`[data-save="${id}"]`);
      if (savedButton instanceof HTMLElement) savedButton.focus();
    }
    if (button.hasAttribute('data-close')) button.closest('dialog')?.close();
    if (button.dataset.quantity) {
      const id = Number(button.dataset.quantity),
        qty = (bag.get(id) || 0) + Number(button.dataset.delta);
      if (qty > 0) bag.set(id, qty);
      else bag.delete(id);
      updateBag();
    }
    if (button.dataset.remove) {
      bag.delete(Number(button.dataset.remove));
      updateBag();
    }
    if (button.id === 'checkout-preview') {
      conceptElement('#bag-summary', HTMLElement).innerHTML =
        `<h2>Ready for parish pickup</h2><p class="bag-note">Your sample bag contains ${[...bag.values()].reduce((a, b) => a + b, 0)} items.<br><br>In the finished experience, you would confirm your parish and pickup details before paying.<br><br><b>Preview only — no order has been placed.</b></p><button class="secondary" id="back-to-bag">Back to bag</button>`;
    }
    if (button.id === 'back-to-bag') updateBag();
  });
  conceptElement('#search', HTMLInputElement).addEventListener('input', render);
  conceptElement('#sort', HTMLSelectElement).addEventListener('change', render);
  conceptElement('#saved-button', HTMLElement).addEventListener('click', () => {
    savedOnly = !savedOnly;
    conceptElement('#saved-button', HTMLElement).setAttribute('aria-pressed', String(savedOnly));
    render();
    conceptElement('#collection', HTMLElement).scrollIntoView({ behavior: 'smooth' });
  });
  conceptElement('#bag-button', HTMLElement).addEventListener('click', () => {
    updateBag();
    conceptElement('#bag-dialog', HTMLDialogElement).showModal();
  });
  conceptElement('#explore', HTMLElement).addEventListener('click', () => {
    category = 'All items';
    savedOnly = false;
    conceptElement('#saved-button', HTMLElement).setAttribute('aria-pressed', 'false');
    conceptElement('#search', HTMLInputElement).value = '';
    render();
    conceptElement('#collection', HTMLElement).scrollIntoView({ behavior: 'smooth' });
  });
  conceptElement('#reset', HTMLElement).addEventListener('click', () => {
    category = 'All items';
    savedOnly = false;
    conceptElement('#saved-button', HTMLElement).setAttribute('aria-pressed', 'false');
    conceptElement('#search', HTMLInputElement).value = '';
    render();
  });
  conceptElement('#prayer-edit', HTMLElement).addEventListener('click', () => {
    category = 'All items';
    savedOnly = false;
    conceptElement('#saved-button', HTMLElement).setAttribute('aria-pressed', 'false');
    conceptElement('#search', HTMLInputElement).value = '';
    render();
    conceptElement('#shelf-title', HTMLElement).textContent = 'Your prayer corner essentials';
    conceptElement('#collection', HTMLElement).scrollIntoView({ behavior: 'smooth' });
  });
  document.querySelectorAll('dialog').forEach((dialog) =>
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) {
        const rect = dialog.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          dialog.close();
      }
    })
  );
  document.addEventListener('keydown', (event) => {
    if (
      event.key === '/' &&
      !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName || '') &&
      !document.querySelector('dialog[open]')
    ) {
      event.preventDefault();
      conceptElement('#search', HTMLInputElement).focus();
    }
  });
  render();
  updateBag();
})();
