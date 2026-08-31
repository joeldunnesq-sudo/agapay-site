'use strict';

// Parish dashboard commerce: bookstore-inventory.
// Classic script; preserve global names used by the dashboard and inline actions.

function renderBookstoreCurrentItems(products) {
  const pane = document.getElementById('bookstoreCurrentItems');
  if (!pane) return;
  if (!products.length) {
    pane.innerHTML =
      '<p class="bookstore-empty">Nothing added yet. Use the starter catalog below or add a custom item.</p>';
    return;
  }
  const lowStockProducts = bookstoreCatalogState.lowStockProducts || [];
  const visibleProducts = bookstoreLowStockOnly ? lowStockProducts : products;
  const lowStockIds = new Set(lowStockProducts.map((product) => product.variantId || product.id));
  pane.innerHTML = `
      <div class="bookstore-inventory-filter" role="group" aria-label="Filter bookstore inventory">
        <button type="button" class="${bookstoreLowStockOnly ? '' : 'is-active'}" aria-pressed="${bookstoreLowStockOnly ? 'false' : 'true'}" onclick="setBookstoreLowStockFilter(false)">All items <span>${products.length}</span></button>
        <button type="button" class="${bookstoreLowStockOnly ? 'is-active' : ''}" aria-pressed="${bookstoreLowStockOnly ? 'true' : 'false'}" onclick="setBookstoreLowStockFilter(true)">Low stock <span>${lowStockProducts.length}</span></button>
      </div>
      ${
        visibleProducts.length
          ? `
      <div class="bookstore-current-list">
        ${visibleProducts
          .map((p) => {
            const isLow = lowStockIds.has(p.variantId || p.id);
            return `
          <article class="bookstore-current-row ${isLow ? 'is-low-stock' : ''} ${p.onSale ? 'is-on-sale' : ''}">
            <div class="bookstore-current-main">
              ${p.imageUrl ? `<img class="bookstore-current-image" src="${escapeAttr(p.imageUrl)}" alt="${escapeAttr(p.name || 'Bookstore item')}" loading="lazy" decoding="async" referrerpolicy="no-referrer" />` : ''}
              <div class="bookstore-current-copy">
                <strong>${escapeHtml(p.name || 'Bookstore item')}</strong>
                <span>${escapeHtml(BOOKSTORE_CATEGORY_LABELS[p.category] || p.category || 'Other')}${p.sku ? ` · ${escapeHtml(p.sku)}` : ''}</span>
                ${p.description ? `<small>${escapeHtml(p.description)}</small>` : ''}
                ${isLow ? `<em class="bookstore-low-stock-pill">Low stock</em>` : ''}
                ${p.onSale ? `<em class="bookstore-sale-pill">On sale · save ${Math.max(1, Math.round((1 - Number(p.salePriceCents) / Number(p.priceCents)) * 100))}%</em>` : ''}
              </div>
            </div>
            <div class="bookstore-current-metrics">
              ${p.onSale ? `<span class="bookstore-regular-price">${moneyFull(Number(p.priceCents || 0))}</span><b class="bookstore-sale-price">${moneyFull(Number(p.salePriceCents || 0))}</b>` : `<b>${moneyFull(Number(p.priceCents || 0))}</b>`}
              <span>${Number(p.stockQuantity || 0)} in stock${Number(p.reorderThreshold || 0) > 0 ? ` · reorder at ${Number(p.reorderThreshold)}` : ''}</span>
              <em class="bookstore-status-pill">${escapeHtml(p.status || 'active')}</em>
            </div>
            <div class="bookstore-row-actions">
              ${
                isLow
                  ? `<form class="bookstore-threshold-edit" onsubmit="saveBookstoreReorderThreshold(event, '${escapeAttr(p.id)}')">
                <label>Reorder at <input type="number" min="0" step="1" required value="${Number(p.reorderThreshold || 0)}" aria-label="Reorder threshold for ${escapeAttr(p.name || 'bookstore item')}" /></label>
                <button class="sw-action-btn" type="submit">Save threshold</button>
              </form>`
                  : ''
              }
              <button class="sw-action-btn" type="button" onclick="openBookstoreItemModal('${escapeAttr(p.id)}')">Edit</button>
              <button class="sw-action-btn bookstore-sale-action" type="button" onclick="openBookstoreItemModal('${escapeAttr(p.id)}', 'sale')">${p.onSale ? 'Change sale' : 'Put on sale'}</button>
              <button class="sw-action-btn" type="button" onclick="openBookstoreItemModal('${escapeAttr(p.id)}', 'receive')">Receive stock</button>
              <button class="sw-action-btn danger" type="button" onclick="archiveBookstoreItem('${escapeAttr(p.id)}', this)">Archive</button>
            </div>
          </article>
        `;
          })
          .join('')}
      </div>
      `
          : `<p class="bookstore-empty">No items are at or below a reorder threshold. Items with a threshold of zero are not treated as low stock.</p>`
      }`;
}

function setBookstoreLowStockFilter(enabled) {
  bookstoreLowStockOnly = Boolean(enabled);
  renderBookstoreCurrentItems(bookstoreCatalogState.products || []);
}

async function saveBookstoreReorderThreshold(event, productId) {
  event.preventDefault();
  const form = event.currentTarget;
  const input = form.querySelector('input');
  const button = form.querySelector('button[type="submit"]');
  const reorderThreshold = Number(input?.value);
  if (!Number.isInteger(reorderThreshold) || reorderThreshold < 0) {
    setStatus('Reorder threshold must be a non-negative whole number.', 'error');
    input?.focus();
    return;
  }
  if (button) {
    button.disabled = true;
    button.textContent = 'Saving…';
  }
  try {
    const res = await fetch(bookstoreApi('/products/' + encodeURIComponent(productId)), {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ reorderThreshold }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Unable to save the reorder threshold.');
    await loadBookstoreCatalogTab(true);
    setStatus(`Reorder threshold updated to ${reorderThreshold}.`, 'success');
  } catch (error) {
    setStatus(error.message, 'error');
    if (button) {
      button.disabled = false;
      button.textContent = 'Save threshold';
    }
  }
}

function buildBookstoreItemModal() {
  const existing = document.getElementById('bookstoreItemModal');
  if (existing) return existing;
  const modal = document.createElement('div');
  modal.id = 'bookstoreItemModal';
  modal.className = 'bookstore-modal-backdrop';
  modal.hidden = true;
  modal.innerHTML = `
      <div class="bookstore-modal" role="dialog" aria-modal="true" aria-labelledby="bookstoreItemModalTitle">
        <div class="bookstore-modal-head">
          <div>
            <span class="sw-suite-eyebrow">Bookstore catalog</span>
            <h2 id="bookstoreItemModalTitle">Edit item</h2>
          </div>
          <button class="bookstore-modal-close" type="button" onclick="closeBookstoreItemModal()" aria-label="Close">×</button>
        </div>
        <form class="bookstore-modal-form" onsubmit="saveBookstoreItemFromModal(event)">
          <label>Item name<input id="bookstoreModalName" required /></label>
          <label>Category<select id="bookstoreModalCategory">${bookstoreCategoryOptions('other')}</select></label>
          <label class="full">Description<textarea id="bookstoreModalDescription" rows="3"></textarea></label>
          <label>Price<input id="bookstoreModalPrice" type="number" min="0.01" step="0.01" required /></label>
          <label>Stock on hand<input id="bookstoreModalStock" type="number" min="0" step="1" value="0" oninput="syncBookstoreStockReason()" required /></label>
          <section class="bookstore-sale-editor full" id="bookstoreSaleEditor">
            <label class="bookstore-sale-toggle"><input id="bookstoreModalOnSale" type="checkbox" onchange="syncBookstoreSaleEditor()" /><span><strong>Put this item on sale</strong><small>Shoppers will see the regular price crossed out and a highlighted sale price.</small></span></label>
            <label id="bookstoreSalePriceField" hidden>Sale price<input id="bookstoreModalSalePrice" type="number" min="0.01" step="0.01" placeholder="0.00" /><small>Must be lower than the regular price.</small></label>
          </section>
          <label>SKU / barcode<input id="bookstoreModalSku" /></label>
          <label class="full">Image URL<input id="bookstoreModalImage" placeholder="https://..." /></label>
          <label class="full bookstore-stock-reason" id="bookstoreStockReasonField" hidden>
            Explain the stock difference
            <textarea id="bookstoreModalStockReason" rows="2" maxlength="500" placeholder="Example: Received 12 books and counted them by hand"></textarea>
            <small>A reason is required whenever stock on hand changes.</small>
          </label>
          <section class="bookstore-receive-panel full" aria-labelledby="bookstoreReceiveTitle">
            <div class="bookstore-receive-head">
              <div><span>Routine restocking</span><h3 id="bookstoreReceiveTitle">Receive stock</h3></div>
              <p>On hand: <strong id="bookstoreReceiveStock">0</strong> · Latest unit cost: <strong id="bookstoreReceiveCost">$0.00</strong></p>
            </div>
            <div class="bookstore-receive-fields">
              <label>Quantity<input id="bookstoreReceiveQuantity" type="number" min="1" step="1" placeholder="12" /></label>
              <label>Unit cost (optional)<input id="bookstoreReceiveUnitCost" type="number" min="0" step="0.01" placeholder="18.50" /></label>
              <label class="full">Reference (optional)<input id="bookstoreReceiveReference" maxlength="500" placeholder="PO number, supplier, or shipment note" /></label>
            </div>
            <button class="btn btn-ghost" type="button" onclick="submitBookstoreReceiving(this)">Add received stock</button>
          </section>
          <section class="bookstore-movement-panel full" aria-labelledby="bookstoreMovementTitle">
            <div><span>Inventory audit trail</span><h3 id="bookstoreMovementTitle">Stock history</h3></div>
            <div id="bookstoreMovementHistory" class="bookstore-movement-list"><p>Loading stock history…</p></div>
          </section>
          <div class="bookstore-modal-actions">
            <button class="btn btn-ghost" type="button" onclick="closeBookstoreItemModal()">Cancel</button>
            <button class="btn btn-gold" type="submit">Save item</button>
          </div>
        </form>
      </div>
    `;
  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeBookstoreItemModal();
  });
  document.body.appendChild(modal);
  return modal;
}

function openBookstoreItemModal(productId, focusSection = 'edit') {
  const product = bookstoreCatalogState.products.find((p) => p.id === productId);
  if (!product) {
    setStatus('Bookstore item not found.', 'error');
    return;
  }
  const modal = buildBookstoreItemModal();
  bookstoreEditingProductId = productId;
  document.getElementById('bookstoreModalName').value = product.name || '';
  document.getElementById('bookstoreModalCategory').innerHTML = bookstoreCategoryOptions(product.category || 'other');
  document.getElementById('bookstoreModalDescription').value = product.description || '';
  document.getElementById('bookstoreModalPrice').value = (Number(product.priceCents || 0) / 100).toFixed(2);
  document.getElementById('bookstoreModalOnSale').checked = Boolean(product.onSale) || focusSection === 'sale';
  document.getElementById('bookstoreModalSalePrice').value = product.onSale
    ? (Number(product.salePriceCents || 0) / 100).toFixed(2)
    : '';
  syncBookstoreSaleEditor();
  bookstoreEditingOriginalStock = Number(product.stockQuantity || 0);
  document.getElementById('bookstoreModalStock').value = bookstoreEditingOriginalStock;
  document.getElementById('bookstoreModalStockReason').value = '';
  document.getElementById('bookstoreModalSku').value = product.sku || '';
  document.getElementById('bookstoreModalImage').value = product.imageUrl || '';
  document.getElementById('bookstoreReceiveQuantity').value = '';
  document.getElementById('bookstoreReceiveUnitCost').value = '';
  document.getElementById('bookstoreReceiveReference').value = '';
  document.getElementById('bookstoreReceiveStock').textContent = bookstoreEditingOriginalStock;
  document.getElementById('bookstoreReceiveCost').textContent = moneyFull(Number(product.costBasisCents || 0));
  syncBookstoreStockReason();
  loadBookstoreMovementHistory(productId);
  modal.hidden = false;
  document.body.classList.add('bookstore-modal-open');
  setTimeout(
    () =>
      document
        .getElementById(
          focusSection === 'receive'
            ? 'bookstoreReceiveQuantity'
            : focusSection === 'sale'
              ? 'bookstoreModalSalePrice'
              : 'bookstoreModalName'
        )
        ?.focus(),
    0
  );
}

function closeBookstoreItemModal() {
  const modal = document.getElementById('bookstoreItemModal');
  if (modal) modal.hidden = true;
  document.body.classList.remove('bookstore-modal-open');
  bookstoreEditingProductId = null;
}

function syncBookstoreStockReason() {
  const changed = Number(document.getElementById('bookstoreModalStock')?.value || 0) !== bookstoreEditingOriginalStock;
  const field = document.getElementById('bookstoreStockReasonField');
  const input = document.getElementById('bookstoreModalStockReason');
  if (field) field.hidden = !changed;
  if (input) input.required = changed;
}

function syncBookstoreSaleEditor() {
  const enabled = Boolean(document.getElementById('bookstoreModalOnSale')?.checked);
  const field = document.getElementById('bookstoreSalePriceField');
  const input = document.getElementById('bookstoreModalSalePrice');
  if (field) field.hidden = !enabled;
  if (input) input.required = enabled;
}

function bookstoreMovementDate(value) {
  const date = new Date(value || '');
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function renderBookstoreMovementHistory(movements) {
  const pane = document.getElementById('bookstoreMovementHistory');
  if (!pane) return;
  if (!movements.length) {
    pane.innerHTML = '<p>No stock changes recorded yet.</p>';
    return;
  }
  pane.innerHTML = movements
    .map((movement) => {
      const delta = Number(movement.quantityDelta || 0);
      const deltaLabel = delta > 0 ? `+${delta}` : String(delta).replace('-', '−');
      const type =
        movement.movementType === 'sale'
          ? 'Sale'
          : movement.movementType === 'receiving'
            ? 'Received stock'
            : movement.movementType === 'physical_count'
              ? 'Physical count'
              : 'Manual adjustment';
      const order = movement.orderNumber || movement.orderId;
      const count = movement.countSessionId ? ` · Count ${String(movement.countSessionId).slice(-6)}` : '';
      return `<article class="bookstore-movement-row">
        <strong class="${delta < 0 ? 'is-negative' : 'is-positive'}">${escapeHtml(deltaLabel)}</strong>
        <div><b>${escapeHtml(type)}${order ? ` · Order ${escapeHtml(order)}` : ''}${escapeHtml(count)}</b><span>${escapeHtml(bookstoreMovementDate(movement.createdAt))}</span>${movement.note ? `<q>${escapeHtml(movement.note)}</q>` : ''}</div>
      </article>`;
    })
    .join('');
}

async function loadBookstoreMovementHistory(productId) {
  const pane = document.getElementById('bookstoreMovementHistory');
  if (pane) pane.innerHTML = '<p>Loading stock history…</p>';
  try {
    const res = await fetch(bookstoreApi('/products/' + encodeURIComponent(productId) + '/movements'), {
      headers: authHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Unable to load stock history.');
    if (bookstoreEditingProductId === productId) renderBookstoreMovementHistory(data.movements || []);
  } catch (err) {
    if (pane && bookstoreEditingProductId === productId)
      pane.innerHTML = `<p class="bookstore-movement-error">${escapeHtml(err.message)}</p>`;
  }
}

async function submitBookstoreReceiving(btn) {
  const productId = bookstoreEditingProductId;
  const quantity = Number(document.getElementById('bookstoreReceiveQuantity')?.value || 0);
  const unitCostInput = document.getElementById('bookstoreReceiveUnitCost');
  const unitCostValue = String(unitCostInput?.value || '').trim();
  const reference = document.getElementById('bookstoreReceiveReference')?.value || '';
  if (!productId) return;
  if (!Number.isInteger(quantity) || quantity <= 0) {
    setStatus('Receiving quantity must be a positive whole number.', 'error');
    document.getElementById('bookstoreReceiveQuantity')?.focus();
    return;
  }
  const body = { quantity, reference };
  if (unitCostValue !== '') body.unitCostCents = Math.round(Number(unitCostValue) * 100);
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Receiving…';
  }
  try {
    const res = await fetch(bookstoreApi('/products/' + encodeURIComponent(productId) + '/receive'), {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Unable to receive stock.');
    const product = bookstoreCatalogState.products.find((item) => item.id === productId);
    if (product) {
      product.stockQuantity = Number(data.stockQuantity || 0);
      product.costBasisCents = Number(data.costBasisCents || 0);
    }
    bookstoreEditingOriginalStock = Number(data.stockQuantity || 0);
    document.getElementById('bookstoreModalStock').value = bookstoreEditingOriginalStock;
    document.getElementById('bookstoreReceiveStock').textContent = bookstoreEditingOriginalStock;
    document.getElementById('bookstoreReceiveCost').textContent = moneyFull(Number(data.costBasisCents || 0));
    document.getElementById('bookstoreReceiveQuantity').value = '';
    document.getElementById('bookstoreReceiveUnitCost').value = '';
    document.getElementById('bookstoreReceiveReference').value = '';
    syncBookstoreStockReason();
    await loadBookstoreCatalogTab(true);
    await loadBookstoreMovementHistory(productId);
    setStatus(`Received ${quantity} item${quantity === 1 ? '' : 's'} into bookstore stock.`, 'success');
  } catch (err) {
    setStatus(err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Add received stock';
    }
  }
}

function renderBookstoreStarterCatalogUI(catalog) {
  const pane = document.getElementById('bookstoreStarterCatalog');
  if (!pane) return;
  if (!catalog.length) {
    pane.innerHTML = '<p style="margin:0;">No starter items available.</p>';
    return;
  }

  pane.innerHTML = catalog
    .map(
      (group) => `
      <div class="bookstore-starter-group">
        <h4>${escapeHtml(group.label)}</h4>
        <div class="bookstore-starter-list">
          ${group.items
            .map(
              (item) => `
            <label class="bookstore-starter-row ${item.alreadyAdded ? 'is-added' : ''}">
              <input type="checkbox" data-starter-key="${escapeAttr(item.key)}" ${item.alreadyAdded ? 'disabled checked' : ''} />
              <span>${escapeHtml(item.name)}${item.alreadyAdded ? ' <em>already added</em>' : ''}</span>
              ${
                item.alreadyAdded
                  ? ''
                  : `
                <div class="bookstore-starter-fields">
                  <input type="text" value="${escapeAttr(item.name)}" data-starter-name="${escapeAttr(item.key)}" title="Item name" />
                  <select data-starter-category="${escapeAttr(item.key)}" title="Category">${bookstoreCategoryOptions(item.category || 'other')}</select>
                  <input type="text" value="${escapeAttr(item.key)}" data-starter-sku="${escapeAttr(item.key)}" title="SKU / barcode" />
                </div>
                <input type="number" min="0.01" step="0.01" value="${(item.suggestedPriceCents / 100).toFixed(2)}" data-starter-price="${escapeAttr(item.key)}" title="Price" />
                <input type="hidden" value="0" data-starter-stock="${escapeAttr(item.key)}" />
              `
              }
            </label>
          `
            )
            .join('')}
        </div>
      </div>
    `
    )
    .join('');
}

async function submitBookstoreStarterCatalog(btn) {
  const checked = Array.from(
    document.querySelectorAll(
      '#bookstoreStarterCatalog input[type="checkbox"][data-starter-key]:checked:not(:disabled)'
    )
  );
  if (!checked.length) {
    setStatus('Check off at least one item to add.', 'error');
    return;
  }

  const items = checked.map((box) => {
    const key = box.getAttribute('data-starter-key');
    const nameInput = document.querySelector(`[data-starter-name="${CSS.escape(key)}"]`);
    const categoryInput = document.querySelector(`[data-starter-category="${CSS.escape(key)}"]`);
    const skuInput = document.querySelector(`[data-starter-sku="${CSS.escape(key)}"]`);
    const priceInput = document.querySelector(`[data-starter-price="${CSS.escape(key)}"]`);
    const stockInput = document.querySelector(`[data-starter-stock="${CSS.escape(key)}"]`);
    const priceCents = priceInput ? Math.round(Number(priceInput.value || 0) * 100) : undefined;
    const stockQuantity = stockInput ? Number(stockInput.value || 0) : 0;
    return {
      key,
      name: nameInput?.value || '',
      category: categoryInput?.value || 'other',
      sku: skuInput?.value || '',
      priceCents,
      stockQuantity,
    };
  });

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Adding…';
  }
  try {
    const res = await fetch(bookstoreApi('/starter-catalog/add'), {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Unable to add items.');
    setStatus(`Added ${data.added.length} item${data.added.length === 1 ? '' : 's'} to your bookstore.`, 'success');
    await loadBookstoreCatalogTab(true);
  } catch (err) {
    setStatus(err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Add selected items to my bookstore';
    }
  }
}

async function submitBookstoreManualItem(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const btn = form.querySelector('button[type="submit"]');
  const body = {
    name: document.getElementById('bookstoreItemName')?.value || '',
    description: document.getElementById('bookstoreItemDescription')?.value || '',
    category: document.getElementById('bookstoreItemCategory')?.value || 'other',
    priceCents: Math.round(Number(document.getElementById('bookstoreItemPrice')?.value || 0) * 100),
    stockQuantity: Number(document.getElementById('bookstoreItemStock')?.value || 0),
    sku: document.getElementById('bookstoreItemSku')?.value || '',
    imageUrl: document.getElementById('bookstoreItemImage')?.value || '',
  };
  if (!body.name.trim() || body.priceCents < 1) {
    setStatus('Item name and price are required.', 'error');
    return;
  }
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Adding...';
  }
  try {
    const res = await fetch(bookstoreApi('/products'), {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Unable to add item.');
    form.reset();
    document.getElementById('bookstoreItemStock').value = '0';
    setStatus('Bookstore item added.', 'success');
    await loadBookstoreCatalogTab(true);
  } catch (err) {
    setStatus(err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Add item';
    }
  }
}

async function saveBookstoreItemFromModal(event) {
  event.preventDefault();
  const productId = bookstoreEditingProductId;
  const btn = event.submitter;
  const body = {
    name: document.getElementById('bookstoreModalName')?.value || '',
    description: document.getElementById('bookstoreModalDescription')?.value || '',
    category: document.getElementById('bookstoreModalCategory')?.value || 'other',
    sku: document.getElementById('bookstoreModalSku')?.value || '',
    imageUrl: document.getElementById('bookstoreModalImage')?.value || '',
    priceCents: Math.round(Number(document.getElementById('bookstoreModalPrice')?.value || 0) * 100),
    salePriceCents: document.getElementById('bookstoreModalOnSale')?.checked
      ? Math.round(Number(document.getElementById('bookstoreModalSalePrice')?.value || 0) * 100)
      : null,
    stockQuantity: Number(document.getElementById('bookstoreModalStock')?.value || 0),
    stockAdjustmentReason: document.getElementById('bookstoreModalStockReason')?.value || '',
  };
  if (!productId) return;
  if (!String(body.name || '').trim()) {
    setStatus('Item name is required.', 'error');
    return;
  }
  if (body.priceCents < 1) {
    setStatus('Price must be greater than zero.', 'error');
    return;
  }
  if (body.salePriceCents !== null && (body.salePriceCents < 1 || body.salePriceCents >= body.priceCents)) {
    setStatus('Sale price must be greater than zero and lower than the regular price.', 'error');
    document.getElementById('bookstoreModalSalePrice')?.focus();
    return;
  }
  if (body.stockQuantity !== bookstoreEditingOriginalStock && !String(body.stockAdjustmentReason || '').trim()) {
    setStatus('Explain the stock difference before saving this adjustment.', 'error');
    document.getElementById('bookstoreModalStockReason')?.focus();
    return;
  }
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Saving...';
  }
  try {
    const res = await fetch(bookstoreApi('/products/' + encodeURIComponent(productId)), {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Unable to save item.');
    setStatus('Bookstore item saved.', 'success');
    closeBookstoreItemModal();
    await loadBookstoreCatalogTab(true);
  } catch (err) {
    setStatus(err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Save';
    }
  }
}

async function archiveBookstoreItem(productId, btn) {
  if (!confirm('Archive this bookstore item? Parishioners will no longer see it.')) return;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Archiving...';
  }
  try {
    const res = await fetch(bookstoreApi('/products/' + encodeURIComponent(productId)), {
      method: 'DELETE',
      headers: authHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Unable to archive item.');
    setStatus('Bookstore item archived.', 'success');
    await loadBookstoreCatalogTab(true);
  } catch (err) {
    setStatus(err.message, 'error');
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Archive';
    }
  }
}
