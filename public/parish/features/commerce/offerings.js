'use strict';

// Parish dashboard commerce: offerings.
// Classic script; preserve global names used by the dashboard and inline actions.

function eventsApi(path = '') {
  if (!currentParish?.parishId) throw new Error('Load a parish first.');
  return '/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/events' + path;
}

const eventsOversightState = {
  event: { loaded: false, loading: false, items: [], sales: { kpis: {}, orders: [] } },
  meal: { loaded: false, loading: false, items: [], sales: { kpis: {}, orders: [] } },
};

function commerceOfferingKind(value) {
  return value === 'meal' ? 'meal' : 'event';
}

function commerceOfferingCopy(value) {
  return commerceOfferingKind(value) === 'meal'
    ? {
        singular: 'Meal',
        plural: 'Meals',
        namePlaceholder: 'Adult festival dinner plate',
        dateLabel: 'Serving or pickup date',
      }
    : { singular: 'Event', plural: 'Events', namePlaceholder: 'Parish festival admission', dateLabel: 'Event date' };
}

function renderCommerceOfferingFeatureToggle(offeringKind = 'event') {
  const kind = commerceOfferingKind(offeringKind);
  const copy = commerceOfferingCopy(kind);
  const root = document.getElementById(kind === 'meal' ? 'mealsFeatureToggle' : 'eventsFeatureToggle');
  if (!root) return;
  const key = kind === 'meal' ? 'mealsEnabled' : 'eventsEnabled';
  const enabled = currentParish?.[key] !== false;
  root.innerHTML = `<label class="sac-admin-switch agapay-feature-switch" title="Show or hide ${copy.plural} in My AGAPAY">
      <input type="checkbox" aria-label="Show ${copy.plural} in My AGAPAY" ${enabled ? 'checked' : ''} onchange="toggleCommerceOfferingFeature(this,'${kind}')" />
      <span aria-hidden="true"></span>
      <em>${enabled ? 'On' : 'Off'}</em>
    </label>`;
}

async function toggleCommerceOfferingFeature(input, offeringKind = 'event') {
  if (!currentParish) return;
  const kind = commerceOfferingKind(offeringKind);
  const copy = commerceOfferingCopy(kind);
  const key = kind === 'meal' ? 'mealsEnabled' : 'eventsEnabled';
  const enabled = Boolean(input?.checked);
  const previous = currentParish[key] !== false;
  if (input) input.disabled = true;
  try {
    const response = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId), {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: enabled }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Unable to update ${copy.plural}.`);
    currentParish = { ...currentParish, ...(payload.parish || {}), [key]: Boolean(payload.parish?.[key] ?? enabled) };
    renderCommerceOfferingFeatureToggle(kind);
    setStatus(
      currentParish[key] ? `${copy.plural} are on for parishioners.` : `${copy.plural} are off for parishioners.`,
      'success'
    );
  } catch (error) {
    currentParish[key] = previous;
    if (input) input.checked = previous;
    renderCommerceOfferingFeatureToggle(kind);
    setStatus(error.message, 'error');
  } finally {
    if (input) input.disabled = false;
  }
}

function eventsMoney(cents) {
  return (Number(cents || 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

async function loadEventsOversightPanel(offeringKind = 'event', force = false) {
  const kind = commerceOfferingKind(offeringKind);
  const copy = commerceOfferingCopy(kind);
  const state = eventsOversightState[kind];
  const body = document.getElementById(kind === 'meal' ? 'mealsOversightBody' : 'eventsOversightBody');
  if (!body || !currentParish) return;
  renderCommerceOfferingFeatureToggle(kind);
  if (state.loaded && !force) {
    renderEventsOversightPanel(kind);
    return;
  }
  if (state.loading) return;
  state.loading = true;
  if (!state.loaded) body.innerHTML = `<p class="sw-tool-loading">Loading ${copy.plural}…</p>`;
  try {
    const [itemsRes, salesRes] = await Promise.all([
      fetch(eventsApi('?offeringKind=' + encodeURIComponent(kind)), { headers: authHeaders() }),
      fetch(eventsApi('/sales?offeringKind=' + encodeURIComponent(kind)), { headers: authHeaders() }),
    ]);
    const [data, sales] = await Promise.all([itemsRes.json().catch(() => ({})), salesRes.json().catch(() => ({}))]);
    if (!itemsRes.ok) throw new Error(data.error || `Unable to load ${copy.plural}.`);
    if (!salesRes.ok) throw new Error(sales.error || `Unable to load ${copy.plural} sales.`);
    state.items = data.items || [];
    state.sales = sales || { kpis: {}, orders: [] };
    state.loaded = true;
    renderEventsOversightPanel(kind);
  } catch (err) {
    body.innerHTML = `<div class="notice error">${escapeHtml(err.message)}</div>`;
  } finally {
    state.loading = false;
  }
}

function renderEventsOversightPanel(offeringKind = 'event') {
  const kind = commerceOfferingKind(offeringKind);
  const copy = commerceOfferingCopy(kind);
  const state = eventsOversightState[kind];
  const body = document.getElementById(kind === 'meal' ? 'mealsOversightBody' : 'eventsOversightBody');
  if (!body) return;
  const items = state.items;
  const sales = state.sales || {};
  const kpis = sales.kpis || {};
  const orders = sales.orders || [];
  const createForm = `<section class="section-card bookstore-card" style="margin-bottom:18px;">
      <div class="section-header"><div class="section-title">Add a ${copy.singular.toLowerCase()}</div></div>
      <div class="section-body"><form class="bookstore-form" onsubmit="submitParishCommerceOffering(event,'${kind}')">
        <div class="form-group full"><label class="form-label">${copy.singular} name</label><input name="name" required maxlength="180" placeholder="${copy.namePlaceholder}" /></div>
        <div class="form-group full"><label class="form-label">Description</label><textarea class="form-input" name="description" rows="2" maxlength="600" placeholder="What parishioners are purchasing"></textarea></div>
        <div class="form-group"><label class="form-label">Price</label><input name="price" type="number" min="0.01" step="0.01" required placeholder="20.00" /></div>
        <div class="form-group"><label class="form-label">${copy.dateLabel}</label><input name="eventDate" type="date" required /></div>
        <div class="form-group"><label class="form-label">Start time</label><input name="eventStartTime" type="time" /></div>
        <div class="form-group"><label class="form-label">End time</label><input name="eventEndTime" type="time" /></div>
        <div class="form-group"><label class="form-label">Location</label><input name="eventLocation" maxlength="200" placeholder="Parish Hall" /></div>
        <div class="form-group"><label class="form-label">Quantity available</label><input name="stockQuantity" type="number" min="0" step="1" value="0" /></div>
        <div class="form-group"><label class="form-label">Limit per order</label><input name="maxQuantityPerOrder" type="number" min="1" step="1" placeholder="Optional" /></div>
        <div class="form-group"><label class="form-label">Sales close</label><input name="salesCloseAt" type="datetime-local" /></div>
        <div class="form-group"><label class="form-label">Publication</label><select name="status"><option value="active">Publish now</option><option value="draft">Save as draft</option></select></div>
        <label class="form-check full"><input name="trackInventory" type="checkbox" checked /> Track quantity and stop checkout when sold out</label>
        <label class="form-check full"><input name="showOnCalendar" type="checkbox" checked /> Show on the parish calendar when published</label>
        <button class="btn btn-gold" type="submit">Save ${copy.singular}</button>
      </form></div>
    </section>`;
  const rows = items
    .map(
      (item) => `<tr>
      <td><strong>${escapeHtml(item.name)}</strong>${item.description ? `<br><small class="muted">${escapeHtml(item.description)}</small>` : ''}</td>
      <td>${escapeHtml(item.ministryName || 'Parish')}</td>
      <td>${item.eventDate ? escapeHtml(item.eventDate) : '—'}${item.eventStartTime ? ` · ${escapeHtml(item.eventStartTime)}` : ''}${item.eventLocation ? `<br><small class="muted">${escapeHtml(item.eventLocation)}</small>` : ''}<br><small class="muted">${item.showOnCalendar ? 'On parish calendar' : 'Calendar hidden'}</small></td>
      <td>${eventsMoney(item.priceCents)}</td>
      <td>${item.trackInventory ? `${Number(item.stockQuantity || 0)} left` : 'Unlimited'}</td>
      <td>${Number(item.unitsSold || 0)}</td>
      <td><span class="acct-status ${item.status === 'active' ? 'posted' : 'draft'}">${item.status === 'active' ? 'Published' : item.status === 'draft' ? 'Draft' : 'Archived'}</span></td>
      <td><div class="bookstore-header-actions">
        <button class="btn btn-ghost btn-sm" type="button" onclick="moveParishCommerceOffering('${escapeHtml(item.id)}','${kind === 'meal' ? 'event' : 'meal'}','${kind}')">Move to ${kind === 'meal' ? 'Events' : 'Meals'}</button>
        <button class="btn btn-ghost btn-sm" type="button" onclick="toggleEventsCalendarVisibility('${escapeHtml(item.id)}',${item.showOnCalendar ? 'false' : 'true'},'${kind}')">${item.showOnCalendar ? 'Hide from calendar' : 'Show on calendar'}</button>
        <button class="btn btn-ghost btn-sm" type="button" onclick="toggleEventsOversightStatus('${escapeHtml(item.id)}','${item.status === 'active' ? 'archived' : 'active'}','${kind}')">${item.status === 'active' ? 'Archive' : 'Publish'}</button>
      </div></td>
    </tr>`
    )
    .join('');
  const orderRows = orders
    .map(
      (order) => `<tr>
      <td><strong>${escapeHtml(order.orderNumber || order.id)}</strong><br><small class="muted">${escapeHtml(order.itemDescription)}</small></td>
      <td>${escapeHtml(order.donorName || order.donorEmail || 'Guest')}</td>
      <td>${eventsMoney(order.subtotalCents)}</td>
      <td>${eventsMoney(order.taxCents)}</td>
      <td><strong>${eventsMoney(order.totalChargedCents)}</strong></td>
      <td>${escapeHtml(order.fulfillmentStatus)}</td>
      <td>${escapeHtml(order.receiptEmailStatus || 'Stripe receipt')}</td>
    </tr>`
    )
    .join('');
  body.innerHTML = `${createForm}<div class="acct-kpis">
      <div><span>Paid orders</span><strong>${Number(kpis.orderCount || 0)}</strong></div>
      <div><span>Gross sales</span><strong>${eventsMoney(kpis.subtotalCents)}</strong></div>
      <div><span>Sales tax collected</span><strong>${eventsMoney(kpis.taxCents)}</strong></div>
      <div><span>Parish net</span><strong>${eventsMoney(kpis.parishNetCents)}</strong></div>
    </div>
    ${
      items.length
        ? `<div class="acct-table-wrap"><table class="acct-table"><thead><tr>
      <th>Item</th><th>Ministry</th><th>Date &amp; location</th><th>Price</th><th>Stock</th><th>Sold</th><th>Status</th><th></th>
    </tr></thead><tbody>${rows}</tbody></table></div>`
        : `<p class="bk-panel-empty">No ${copy.plural.toLowerCase()} listings yet.</p>`
    }
    <div class="acct-list-head"><div><span class="acct-kicker">Recent activity</span><h2>${copy.plural} sales</h2><p>Checkout tax, receipt state, and fulfillment are shown for the latest paid orders.</p></div></div>
    ${orderRows ? `<div class="acct-table-wrap"><table class="acct-table"><thead><tr><th>Order</th><th>Customer</th><th>Subtotal</th><th>Tax</th><th>Total</th><th>Fulfillment</th><th>Receipt</th></tr></thead><tbody>${orderRows}</tbody></table></div>` : `<p class="bk-panel-empty">No paid ${copy.plural.toLowerCase()} orders yet.</p>`}`;
}

async function submitParishCommerceOffering(event, offeringKind) {
  event.preventDefault();
  const kind = commerceOfferingKind(offeringKind);
  const copy = commerceOfferingCopy(kind);
  const form = event.currentTarget;
  const data = new FormData(form);
  const body = {
    offeringKind: kind,
    name: data.get('name'),
    description: data.get('description'),
    priceCents: Math.round(Number(data.get('price') || 0) * 100),
    eventDate: data.get('eventDate'),
    eventStartTime: data.get('eventStartTime'),
    eventEndTime: data.get('eventEndTime'),
    eventLocation: data.get('eventLocation'),
    stockQuantity: Number(data.get('stockQuantity') || 0),
    maxQuantityPerOrder: data.get('maxQuantityPerOrder') ? Number(data.get('maxQuantityPerOrder')) : null,
    salesCloseAt: data.get('salesCloseAt') || null,
    trackInventory: data.get('trackInventory') === 'on',
    showOnCalendar: data.get('showOnCalendar') === 'on',
    status: data.get('status'),
  };
  const button = form.querySelector('button[type="submit"]');
  if (button) button.disabled = true;
  try {
    const response = await fetch(eventsApi(''), {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Unable to create this ${copy.singular.toLowerCase()}.`);
    form.reset();
    const inventory = form.elements.trackInventory;
    if (inventory) inventory.checked = true;
    const calendar = form.elements.showOnCalendar;
    if (calendar) calendar.checked = true;
    setStatus(
      body.status === 'draft'
        ? `${copy.singular} saved as a draft.`
        : `${copy.singular} published and added to the parish calendar.`,
      'success'
    );
    await loadEventsOversightPanel(kind, true);
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

async function moveParishCommerceOffering(productId, nextKind, currentKind) {
  const destination = commerceOfferingCopy(nextKind);
  try {
    const response = await fetch(eventsApi('/' + encodeURIComponent(productId)), {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ offeringKind: commerceOfferingKind(nextKind) }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Unable to move this listing.');
    eventsOversightState[commerceOfferingKind(nextKind)].loaded = false;
    setStatus(`Listing moved to ${destination.plural}.`, 'success');
    await loadEventsOversightPanel(currentKind, true);
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

async function toggleEventsOversightStatus(productId, nextStatus, offeringKind = 'event') {
  try {
    const res = await fetch(eventsApi('/' + encodeURIComponent(productId)), {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Unable to update this listing.');
    setStatus(nextStatus === 'archived' ? 'Listing archived.' : 'Listing published.', 'success');
    await loadEventsOversightPanel(offeringKind, true);
  } catch (err) {
    setStatus(err.message, 'error');
  }
}

async function toggleEventsCalendarVisibility(productId, showOnCalendar, offeringKind = 'event') {
  try {
    const res = await fetch(eventsApi('/' + encodeURIComponent(productId)), {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ showOnCalendar: Boolean(showOnCalendar) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Unable to update calendar visibility.');
    setStatus(
      showOnCalendar ? 'Listing added to the parish calendar.' : 'Listing hidden from the parish calendar.',
      'success'
    );
    await loadEventsOversightPanel(offeringKind, true);
  } catch (err) {
    setStatus(err.message, 'error');
  }
}
