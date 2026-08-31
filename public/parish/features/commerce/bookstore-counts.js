'use strict';

// Parish dashboard commerce: bookstore-counts.
// Classic script; preserve global names used by the dashboard and inline actions.

function renderBookstoreCountSessions(sessions = []) {
  const pane = document.getElementById('bookstoreCountSessions');
  const startButton = document.getElementById('bookstoreStartCountButton');
  const draft = sessions.find((session) => session.status === 'draft');
  if (startButton) startButton.textContent = draft ? 'Resume physical count' : 'Start physical count';
  if (!pane) return;
  const completed = sessions.filter((session) => session.status === 'completed').slice(0, 5);
  pane.innerHTML = `
      ${
        draft
          ? `<button class="bookstore-count-session-row is-draft" type="button" onclick="openBookstoreDraftCount('${escapeAttr(draft.id)}')">
        <span><strong>Physical count in progress</strong><small>Started ${escapeHtml(bookstoreMovementDate(draft.startedAt))}</small></span><em>Resume →</em>
      </button>`
          : ''
      }
      ${
        completed.length
          ? `<div class="bookstore-count-session-head"><strong>Recent physical counts</strong><small>Expected stock, shelf count, and explanations</small></div>
        <div class="bookstore-count-session-list">${completed
          .map((session) => {
            const differences = (session.items || []).filter((item) => Number(item.difference || 0) !== 0).length;
            return `<button class="bookstore-count-session-row" type="button" onclick="openBookstoreClosedCount('${escapeAttr(session.id)}')">
            <span><strong>${escapeHtml(bookstoreMovementDate(session.completedAt || session.startedAt))}</strong><small>${(session.items || []).length} item${(session.items || []).length === 1 ? '' : 's'} counted · ${differences} difference${differences === 1 ? '' : 's'}</small></span><em>View →</em>
          </button>`;
          })
          .join('')}</div>`
          : ''
      }`;
}

function buildBookstoreCountModal() {
  const existing = document.getElementById('bookstoreCountModal');
  if (existing) return existing;
  const modal = document.createElement('div');
  modal.id = 'bookstoreCountModal';
  modal.className = 'bookstore-modal-backdrop bookstore-count-backdrop';
  modal.hidden = true;
  modal.innerHTML = `<div class="bookstore-modal bookstore-count-modal" role="dialog" aria-modal="true" aria-labelledby="bookstoreCountModalTitle">
      <div class="bookstore-modal-head"><div><span class="sw-suite-eyebrow">Inventory control</span><h2 id="bookstoreCountModalTitle">Physical count</h2></div><button class="bookstore-modal-close" type="button" onclick="closeBookstoreCountModal()" aria-label="Close">×</button></div>
      <div id="bookstoreCountModalBody"></div>
    </div>`;
  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeBookstoreCountModal();
  });
  document.body.appendChild(modal);
  return modal;
}

function showBookstoreCountModal() {
  const modal = buildBookstoreCountModal();
  modal.hidden = false;
  document.body.classList.add('bookstore-modal-open');
  return document.getElementById('bookstoreCountModalBody');
}

function closeBookstoreCountModal() {
  const modal = document.getElementById('bookstoreCountModal');
  if (modal) modal.hidden = true;
  document.body.classList.remove('bookstore-modal-open');
}

function renderBookstoreDraftCount(session) {
  const pane = showBookstoreCountModal();
  const products = (bookstoreCatalogState.products || []).filter(
    (product) => product.trackInventory !== false && product.variantId
  );
  document.getElementById('bookstoreCountModalTitle').textContent = 'Count bookstore inventory';
  if (!products.length) {
    pane.innerHTML = '<p class="bookstore-empty">There are no tracked bookstore items to count.</p>';
    return;
  }
  pane.innerHTML = `<p class="bookstore-count-intro">Enter what is physically on the shelf. Any difference from AGAPAY’s expected stock needs its own explanation before this count can close.</p>
      <div id="bookstoreCountError" class="notice error" hidden></div>
      <form class="bookstore-count-form" data-session-id="${escapeAttr(session.id)}" onsubmit="closeBookstorePhysicalCount(event)">
        <div class="bookstore-count-table-head"><span>Item</span><span>Expected</span><span>Counted</span><span>Difference and explanation</span></div>
        ${products
          .map(
            (
              product
            ) => `<div class="bookstore-count-row" data-product-id="${escapeAttr(product.id)}" data-variant-id="${escapeAttr(product.variantId)}" data-expected="${Number(product.stockQuantity || 0)}">
          <div><strong>${escapeHtml(product.name || 'Bookstore item')}</strong><small>${product.sku ? escapeHtml(product.sku) : 'No SKU'}</small></div>
          <b>${Number(product.stockQuantity || 0)}</b>
          <label><span class="sr-only">Counted quantity for ${escapeHtml(product.name || 'bookstore item')}</span><input class="bookstore-count-quantity" type="number" min="0" step="1" inputmode="numeric" required placeholder="—" oninput="syncBookstoreCountDifference(this)" /></label>
          <div class="bookstore-count-difference"><strong>Not counted</strong><label hidden>Explain this difference<textarea maxlength="500" rows="2" placeholder="What explains the difference?"></textarea></label></div>
        </div>`
          )
          .join('')}
        <div class="bookstore-count-actions"><button class="btn btn-ghost" type="button" onclick="closeBookstoreCountModal()">Close for now</button><button class="btn btn-gold" type="submit">Close physical count</button></div>
      </form>`;
  setTimeout(() => pane.querySelector('.bookstore-count-quantity')?.focus(), 0);
}

function syncBookstoreCountDifference(input) {
  const row = input.closest('.bookstore-count-row');
  const differenceBox = row?.querySelector('.bookstore-count-difference');
  const summary = differenceBox?.querySelector('strong');
  const noteLabel = differenceBox?.querySelector('label');
  if (!row || !summary || !noteLabel) return;
  if (input.value === '') {
    summary.textContent = 'Not counted';
    summary.className = '';
    noteLabel.hidden = true;
    return;
  }
  const difference = Number(input.value) - Number(row.dataset.expected || 0);
  summary.textContent = difference === 0 ? 'Matches' : `${difference > 0 ? '+' : '−'}${Math.abs(difference)}`;
  summary.className = difference === 0 ? 'is-match' : 'is-difference';
  noteLabel.hidden = difference === 0;
}

async function startBookstorePhysicalCount(button) {
  const existing = (bookstoreCatalogState.countSessions || []).find((session) => session.status === 'draft');
  if (existing) {
    renderBookstoreDraftCount(existing);
    return;
  }
  if (button) {
    button.disabled = true;
    button.textContent = 'Starting…';
  }
  try {
    const res = await fetch(bookstoreApi('/count-sessions'), {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: '{}',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok && !(res.status === 409 && data.session))
      throw new Error(data.error || 'Unable to start a physical count.');
    const session = data.session;
    bookstoreCatalogState.countSessions = [
      session,
      ...(bookstoreCatalogState.countSessions || []).filter((item) => item.id !== session.id),
    ];
    renderBookstoreCountSessions(bookstoreCatalogState.countSessions);
    renderBookstoreDraftCount(session);
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    if (button) button.disabled = false;
    renderBookstoreCountSessions(bookstoreCatalogState.countSessions || []);
  }
}

function openBookstoreDraftCount(sessionId) {
  const session = (bookstoreCatalogState.countSessions || []).find(
    (item) => item.id === sessionId && item.status === 'draft'
  );
  if (session) renderBookstoreDraftCount(session);
}

async function closeBookstorePhysicalCount(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const rows = Array.from(form.querySelectorAll('.bookstore-count-row'));
  const uncounted = rows.find((row) => row.querySelector('.bookstore-count-quantity')?.value === '');
  if (uncounted) {
    setStatus('Enter a counted quantity for every item before closing.', 'error');
    uncounted.querySelector('.bookstore-count-quantity')?.focus();
    return;
  }
  const items = rows.map((row) => ({
    productId: row.dataset.productId,
    variantId: row.dataset.variantId,
    countedQuantity: Number(row.querySelector('.bookstore-count-quantity')?.value),
    note: row.querySelector('.bookstore-count-difference textarea')?.value || '',
  }));
  const errorBox = document.getElementById('bookstoreCountError');
  if (errorBox) errorBox.hidden = true;
  if (button) {
    button.disabled = true;
    button.textContent = 'Closing…';
  }
  try {
    const sessionId = form.dataset.sessionId;
    const res = await fetch(bookstoreApi('/count-sessions/' + encodeURIComponent(sessionId) + '/close'), {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Unable to close this physical count.');
    await loadBookstoreCatalogTab(true);
    renderBookstoreCompletedCount(data.session);
    setStatus('Physical count closed and bookstore stock reconciled.', 'success');
  } catch (error) {
    if (errorBox) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
    }
    setStatus(error.message, 'error');
    if (button) {
      button.disabled = false;
      button.textContent = 'Close physical count';
    }
  }
}

function renderBookstoreCompletedCount(session) {
  const pane = showBookstoreCountModal();
  document.getElementById('bookstoreCountModalTitle').textContent = 'Completed physical count';
  const items = session.items || [];
  pane.innerHTML = `<div class="bookstore-count-summary"><span><strong>${escapeHtml(bookstoreMovementDate(session.completedAt || session.startedAt))}</strong><small>${items.length} item${items.length === 1 ? '' : 's'} counted</small></span><em>Completed</em></div>
      <div class="bookstore-count-completed-list">${items
        .map((item) => {
          const difference = Number(item.difference || 0);
          return `<article><div><strong>${escapeHtml(item.name || 'Bookstore item')}</strong><small>${item.sku ? escapeHtml(item.sku) : 'No SKU'}</small></div><span><small>Expected</small><b>${Number(item.expectedQuantity || 0)}</b></span><span><small>Counted</small><b>${Number(item.countedQuantity || 0)}</b></span><span class="${difference === 0 ? 'is-match' : 'is-difference'}"><small>Difference</small><b>${difference > 0 ? '+' : difference < 0 ? '−' : ''}${Math.abs(difference)}</b></span><p>${difference === 0 ? 'Matched — no adjustment recorded.' : `${escapeHtml(item.note || '')}<button type="button" onclick="closeBookstoreCountModal();openBookstoreItemModal('${escapeAttr(item.productId)}')">View stock history →</button>`}</p></article>`;
        })
        .join('')}</div>
      <div class="bookstore-count-actions"><button class="btn btn-gold" type="button" onclick="closeBookstoreCountModal()">Done</button></div>`;
}

async function openBookstoreClosedCount(sessionId) {
  const pane = showBookstoreCountModal();
  pane.innerHTML = '<p class="sw-tool-loading">Loading physical count…</p>';
  try {
    const res = await fetch(bookstoreApi('/count-sessions/' + encodeURIComponent(sessionId)), {
      headers: authHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Unable to load this physical count.');
    renderBookstoreCompletedCount(data.session);
  } catch (error) {
    pane.innerHTML = `<div class="notice error">${escapeHtml(error.message)}</div>`;
  }
}
