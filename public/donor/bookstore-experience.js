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
  bookstoreSavedOnly = !bookstoreSavedOnly;
  document.getElementById('bookstoreSavedToggle')?.setAttribute('aria-pressed', String(bookstoreSavedOnly));
  renderBookstoreProducts(bookstoreProducts);
}

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
  bookstoreSavedOnly = false;
  document.getElementById('bookstoreSavedToggle')?.setAttribute('aria-pressed', 'false');
  bookstoreCatalogQuery = '';
  const search = document.getElementById('bookstoreProductSearch');
  if (search) search.value = '';
  setBookstoreCatalogCategory(category);
  document.getElementById('bookstoreProductSearch')?.focus({ preventScroll: true });
  document.querySelector('.bookstore-catalog-heading')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
