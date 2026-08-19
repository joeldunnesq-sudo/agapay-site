const myEventsState = { items: [], orders: [], cart: [] };

const myEventsEscape = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const myEventsMoney = cents => (Number(cents || 0) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

function myEventsHeaders(extra = { "Content-Type": "application/json" }) {
  return window.MyAgapayShell?.authHeaders(extra) || extra;
}

async function myEventsFetch(path, options = {}) {
  const response = await fetch(path, { ...options, headers: myEventsHeaders(), cache: "no-store" });
  if (window.MyAgapayShell?.handleUnauthorized(response)) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Unable to load Meals & Events.");
  return payload;
}

function myEventsStatus(message, state = "") {
  const target = document.getElementById("eventsStatus");
  if (!target) return;
  target.hidden = !message;
  target.textContent = message || "";
  if (state) target.dataset.state = state;
  else delete target.dataset.state;
}

function myEventsFormatDate(value) {
  if (!value) return "";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function myEventsCap(item) {
  const perOrder = Number(item.maxQuantityPerOrder || 0) > 0 ? Number(item.maxQuantityPerOrder) : Infinity;
  const stock = item.trackInventory === false ? Infinity : Number(item.stockQuantity || 0);
  return Math.min(perOrder, stock, 50);
}

function myEventsQuantityFor(variantId) {
  return myEventsState.cart.find(row => row.variantId === variantId)?.quantity || 0;
}

function renderMyEventsList() {
  const target = document.getElementById("eventsList");
  if (!target) return;
  if (!myEventsState.items.length) {
    target.innerHTML = '<div class="koinonia-empty-state"><strong>Nothing available right now</strong><p>Check back soon for the next parish meal or fundraiser.</p></div>';
    return;
  }
  target.innerHTML = myEventsState.items.map(item => {
    const available = item.trackInventory === false || Number(item.stockQuantity || 0) > 0;
    const quantity = myEventsQuantityFor(item.variantId);
    const cap = myEventsCap(item);
    const meta = [];
    if (item.eventDate) meta.push(myEventsEscape(myEventsFormatDate(item.eventDate)));
    if (item.eventLocation) meta.push(myEventsEscape(item.eventLocation));
    return `<div class="events-item-card">
      ${available ? "" : '<span class="events-sold-out">Sold out</span>'}
      <strong>${myEventsEscape(item.name)}${item.variantName ? ` — ${myEventsEscape(item.variantName)}` : ""}</strong>
      ${meta.length ? `<div class="events-item-meta">${meta.join(" · ")}</div>` : ""}
      ${item.description ? `<p class="events-item-desc">${myEventsEscape(item.description)}</p>` : ""}
      <div class="events-item-foot">
        <b>${myEventsMoney(item.priceCents)}</b>
        <div class="events-qty">
          <button type="button" onclick="myEventsChangeQuantity('${item.variantId}',-1)" ${quantity <= 0 ? "disabled" : ""} aria-label="Remove one">−</button>
          <span>${quantity}</span>
          <button type="button" onclick="myEventsChangeQuantity('${item.variantId}',1)" ${!available || quantity >= cap ? "disabled" : ""} aria-label="Add one">+</button>
        </div>
      </div>
    </div>`;
  }).join("");
}

function renderMyEventsCart() {
  const count = myEventsState.cart.reduce((sum, row) => sum + Number(row.quantity || 1), 0);
  const total = myEventsState.cart.reduce((sum, row) => sum + Number(row.priceCents || 0) * Number(row.quantity || 1), 0);
  document.getElementById("eventsCartCount").textContent = String(count);
  document.getElementById("eventsCartTotal").textContent = myEventsMoney(total);
  document.getElementById("eventsCheckoutButton").disabled = !myEventsState.cart.length;
  renderMyEventsList();
}

function myEventsChangeQuantity(variantId, delta) {
  const item = myEventsState.items.find(row => row.variantId === variantId);
  if (!item) return;
  const cap = myEventsCap(item);
  const existing = myEventsState.cart.find(row => row.variantId === variantId);
  if (!existing) {
    if (delta > 0 && cap > 0) myEventsState.cart.push({ variantId: item.variantId, name: item.name, priceCents: Number(item.priceCents), quantity: 1 });
  } else {
    existing.quantity = Math.max(0, Math.min(cap, existing.quantity + delta));
    if (existing.quantity <= 0) myEventsState.cart = myEventsState.cart.filter(row => row.variantId !== variantId);
  }
  renderMyEventsCart();
}

async function loadMyEvents() {
  myEventsStatus("Loading…");
  try {
    const data = await myEventsFetch("/api/donor/events");
    if (!data) return;
    if (!data.available) {
      myEventsStatus("Meals & Events isn't turned on for your parish yet.", "error");
      document.getElementById("eventsList").innerHTML = "";
      return;
    }
    myEventsState.items = Array.isArray(data.items) ? data.items : [];
    myEventsState.orders = Array.isArray(data.orders) ? data.orders : [];
    if (data.parish?.name) document.getElementById("eventsParishName").textContent = `${data.parish.name} — Meals & Events`;
    myEventsStatus("");
    renderMyEventsCart();
  } catch (error) {
    myEventsStatus(error.message || "Unable to load Meals & Events.", "error");
  }
}

document.getElementById("eventsCheckoutForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  if (!myEventsState.cart.length) return;
  const button = document.getElementById("eventsCheckoutButton");
  button.disabled = true;
  const originalLabel = button.textContent;
  button.textContent = "Preparing secure checkout…";
  try {
    const data = await myEventsFetch("/api/donor/events", {
      method: "POST",
      body: JSON.stringify({
        pickupNote: document.getElementById("eventsPickupNote").value.trim(),
        coverFees: document.getElementById("eventsCoverFees").checked,
        items: myEventsState.cart.map(row => ({ variantId: row.variantId, quantity: row.quantity }))
      })
    });
    if (!data) return;
    if (!data.url) throw new Error(data.error || "Unable to begin checkout.");
    location.href = data.url;
  } catch (error) {
    myEventsStatus(error.message || "Unable to begin checkout.", "error");
    button.disabled = false;
    button.textContent = originalLabel;
  }
});

document.addEventListener("DOMContentLoaded", () => {
  void loadMyEvents();
});
