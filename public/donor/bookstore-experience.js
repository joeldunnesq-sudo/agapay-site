// Presentation and local shopping preferences. Catalog and checkout remain parish-owned.
let bookstoreSavedOnly = false;
let bookstoreSort = 'featured';

function bookstoreExperienceEnabled() {
  return document.body.classList.contains('bookstore-boutique');
}

function bookstoreSavedKey(product) {
  return `${document.getElementById('bookstoreParishId')?.value || ''}:${product.id}:${product.variantId || ''}`;
}

function bookstoreSavedItems() {
  try {
    const saved = JSON.parse(localStorage.getItem('agapayBookstoreSaved') || '[]');
    return new Set(Array.isArray(saved) ? saved.filter((value) => typeof value === 'string') : []);
  } catch {
    return new Set();
  }
}

function bookstoreIsSaved(product) {
  return bookstoreSavedItems().has(bookstoreSavedKey(product));
}

function toggleBookstoreSaved(index) {
  const product = bookstoreProducts[index];
  if (!product) return;
  const saved = bookstoreSavedItems();
  const key = bookstoreSavedKey(product);
  if (saved.has(key)) saved.delete(key);
  else saved.add(key);
  try {
    localStorage.setItem('agapayBookstoreSaved', JSON.stringify([...saved]));
  } catch {
    setDonorStatus('Saved items are unavailable in this browser.', 'error');
    return;
  }
  renderBookstoreProducts(bookstoreProducts);
  document.querySelector(`[data-bookstore-save="${index}"]`)?.focus();
}

function toggleBookstoreSavedView() {
  setBookstoreView(bookstoreSavedOnly ? 'shop' : 'saved');
}

function setBookstoreView(view = 'shop') {
  document.body.dataset.bookstoreView = view;
  bookstoreSavedOnly = view === 'saved';
  document.querySelectorAll('[data-bookstore-view]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.bookstoreView === view));
  });
  const orders = document.querySelector('.bookstore-orders-card');
  if (orders) {
    orders.hidden = view !== 'orders';
    orders.open = view === 'orders';
  }
  document.querySelectorAll('.bookstore-app-collection, .bookstore-manual-panel, .boutique-editorial').forEach((el) => {
    el.hidden = view === 'orders' || (view === 'saved' && !el.classList.contains('bookstore-app-collection'));
  });
  const title = document.getElementById('bookstoreCollectionTitle');
  if (title) title.textContent = bookstoreSavedOnly ? 'Saved items' : 'Parish bookstore';
  renderBookstoreProducts(bookstoreProducts);
  if (view === 'orders') document.getElementById('bookstorePopularItems').hidden = true;
}

function scrollBookstoreSellers(direction) {
  const rail = document.getElementById('bookstorePopularGrid');
  rail?.scrollBy({ left: direction * 280, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
}

document.addEventListener('DOMContentLoaded', () => {
  const dialog = document.getElementById('bookstoreCategoryDialog');
  dialog?.addEventListener('click', (event) => {
    const category = event.target.closest('.bookstore-category-chip');
    if (category) {
      const label = document.getElementById('bookstoreCategoryLabel');
      if (label) label.textContent = bookstoreCatalogCategory === 'all' ? 'Categories' : (BOOKSTORE_CATEGORY_LABELS[bookstoreCatalogCategory] || 'Sale');
      dialog.close();
    } else if (event.target === dialog) {
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
    }
  });
});

function setBookstoreSort(value) {
  bookstoreSort = value;
  renderBookstoreProducts(bookstoreProducts);
}

function bookstoreExperienceProducts(products) {
  const visible = products.filter((product) => !bookstoreSavedOnly || bookstoreIsSaved(product));
  if (bookstoreSort === 'low') visible.sort((a, b) => a.priceCents - b.priceCents);
  if (bookstoreSort === 'high') visible.sort((a, b) => b.priceCents - a.priceCents);
  if (bookstoreSort === 'name') visible.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return visible;
}

function openBookstoreDetail(index) {
  const product = bookstoreProducts[index];
  if (!product) return;
  const dialog = document.getElementById('bookstoreDetail');
  if (!dialog) return;
  const available = product.trackInventory === false || Number(product.stockQuantity) > 0;
  const media = product.imageUrl
    ? `<img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.name)}">`
    : bookstoreCategoryIcon(product.category);
  dialog.querySelector('[data-bookstore-detail-content]').innerHTML = `
    <div class="bookstore-detail-art">${media}</div>
    <div class="bookstore-detail-copy"><p class="boutique-eyebrow">${escapeHtml(product.categoryLabel || 'Parish goods')}</p>
      <h2 id="bookstoreDetailTitle">${escapeHtml(product.name)}</h2>
      <p>${escapeHtml(product.description || 'Available from your parish bookstore.')}</p>
      ${product.onSale ? `<span class="boutique-sale-label">Sale · ${Number(product.savingsPercent)}% off</span>` : ''}
      <p class="bookstore-detail-price">${product.onSale ? `<del>${formatCentsAsDollars(product.regularPriceCents)}</del> ` : ''}<strong>${formatCentsAsDollars(product.priceCents)}</strong></p>
      <button type="button" class="btn btn-gold" onclick="addBookstoreDetailToCart(${index})" ${available ? '' : 'disabled'}>${available ? 'Add to your bag' : 'Out of stock'}</button>
      <p class="bookstore-detail-note">${product.fulfillmentType === 'physical_pickup' ? 'Pickup details are confirmed at checkout.' : 'Fulfillment details are confirmed at checkout.'}</p>
    </div>`;
  dialog.showModal();
}

function addBookstoreDetailToCart(index) {
  const product = bookstoreProducts[index];
  if (!product) return;
  addBookstoreProductToCart(product.id, product.variantId || '');
  document.getElementById('bookstoreDetail')?.close();
}

function openBookstoreBag() {
  if (!bookstoreCart.length) {
    setDonorStatus('Your bag is empty. Explore the collection below.', 'info');
    return;
  }
  if (window.matchMedia('(max-width: 700px)').matches) setBookstoreMobileCartOpen(true);
  else document.getElementById('bookstoreCartPanel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function browseBookstoreCollection(category = 'all') {
  setBookstoreView('shop');
  bookstoreCatalogQuery = '';
  const search = document.getElementById('bookstoreProductSearch');
  if (search) search.value = '';
  setBookstoreCatalogCategory(category);
  document.getElementById('bookstoreProductSearch')?.focus({ preventScroll: true });
  document.querySelector('.bookstore-catalog-heading')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
