const eventsPathSegments = location.pathname.split("/").filter(Boolean);
const parishId = decodeURIComponent(eventsPathSegments[0] === "events" ? (eventsPathSegments[1] || "") : (eventsPathSegments[1] === "events" ? eventsPathSegments[0] : ""));
let items = [];
let cart = [];

const money = cents => (Number(cents || 0) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

function status(message, tone = "") {
  const el = document.getElementById("status");
  el.hidden = !message;
  el.className = `notice ${tone}`.trim();
  el.textContent = message;
  if (message) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function formatEventDate(value) {
  if (!value) return "";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function itemAvailable(item) {
  return item.trackInventory === false || Number(item.stockQuantity || 0) > 0;
}

function cartQuantityFor(variantId) {
  return cart.find(row => row.variantId === variantId)?.quantity || 0;
}

function effectiveCap(item) {
  const perOrder = Number(item.maxQuantityPerOrder || 0) > 0 ? Number(item.maxQuantityPerOrder) : Infinity;
  const stock = item.trackInventory === false ? Infinity : Number(item.stockQuantity || 0);
  return Math.min(perOrder, stock, 50);
}

function eventCard(item) {
  const quantity = cartQuantityFor(item.variantId);
  const available = itemAvailable(item);
  const cap = effectiveCap(item);
  const meta = [];
  if (item.eventDate) meta.push(`<span><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>${escapeHtml(formatEventDate(item.eventDate))}</span>`);
  if (item.eventLocation) meta.push(`<span><svg viewBox="0 0 24 24"><path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/></svg>${escapeHtml(item.eventLocation)}</span>`);
  return `<div class="product event-card" data-variant-id="${escapeHtml(item.variantId)}">
    <strong>${escapeHtml(item.name)}${item.variantName ? ` — ${escapeHtml(item.variantName)}` : ""}</strong>
    <div class="event-meta">${meta.join("")}</div>
    ${item.description ? `<p class="event-details">${escapeHtml(item.description)}</p>` : ""}
    <span class="product-foot"><b>${money(item.priceCents)}</b><span class="availability${available ? "" : " out"}">${available ? "Available" : "Sold out"}</span></span>
    <div class="event-qty">
      <button type="button" onclick="changeItemQuantity('${item.variantId}',-1)" ${quantity <= 0 ? "disabled" : ""} aria-label="Remove one">−</button>
      <span>${quantity}</span>
      <button type="button" onclick="changeItemQuantity('${item.variantId}',1)" ${!available || quantity >= cap ? "disabled" : ""} aria-label="Add one">+</button>
      ${item.maxQuantityPerOrder > 0 ? `<span class="event-cap">Limit ${item.maxQuantityPerOrder}/order</span>` : ""}
    </div>
  </div>`;
}

function renderItems() {
  const root = document.getElementById("products");
  document.getElementById("catalogCount").textContent = `${items.length} item${items.length === 1 ? "" : "s"}`;
  if (!items.length) {
    root.innerHTML = '<div class="empty-products"><h3>Nothing available right now</h3><p>Check back soon, or ask your parish about upcoming meals and fundraisers.</p></div>';
    return;
  }
  root.innerHTML = items.map(eventCard).join("");
}

function renderCart() {
  const quantityTotal = cart.reduce((sum, row) => sum + Number(row.quantity || 1), 0);
  const total = cart.reduce((sum, row) => sum + Number(row.priceCents || 0) * Number(row.quantity || 1), 0);
  document.getElementById("cartCount").textContent = String(quantityTotal);
  document.getElementById("total").textContent = money(total);
  document.getElementById("checkoutButton").disabled = !cart.length;
  renderItems();
  const root = document.getElementById("cart");
  if (!cart.length) {
    root.innerHTML = '<div class="empty-cart"><span aria-hidden="true">✦</span><b>Your basket is empty</b><p>Choose an item from the list.</p></div>';
    return;
  }
  root.innerHTML = cart.map(row => `<div class="cart-row"><div class="cart-row-top"><div><strong>${escapeHtml(row.name)}</strong>${row.eventDate ? `<br><small>${escapeHtml(formatEventDate(row.eventDate))}</small>` : ""}</div><button class="remove" type="button" onclick="removeItem('${row.variantId}')">Remove</button></div><div class="qty"><button type="button" onclick="changeItemQuantity('${row.variantId}',-1)" aria-label="Remove one">−</button><span>${row.quantity}</span><button type="button" onclick="changeItemQuantity('${row.variantId}',1)" aria-label="Add one">+</button><b>${money(row.priceCents * row.quantity)}</b></div></div>`).join("");
}

function changeItemQuantity(variantId, delta) {
  const item = items.find(row => row.variantId === variantId);
  if (!item) return;
  const cap = effectiveCap(item);
  const existing = cart.find(row => row.variantId === variantId);
  if (!existing) {
    if (delta > 0 && cap > 0) cart.push({ productId: item.id, variantId: item.variantId, name: item.name, eventDate: item.eventDate, priceCents: Number(item.priceCents), quantity: 1 });
  } else {
    existing.quantity = Math.max(0, Math.min(cap, existing.quantity + delta));
    if (existing.quantity <= 0) cart = cart.filter(row => row.variantId !== variantId);
  }
  renderCart();
}

function removeItem(variantId) {
  cart = cart.filter(row => row.variantId !== variantId);
  renderCart();
}

async function loadStore() {
  const params = new URLSearchParams(location.search);
  if (params.get("order_success")) status("Thank you. Your payment was received, and your receipt is on its way.", "success");
  else if (params.get("order_canceled")) status("Checkout was canceled. Your basket has not been charged.");
  const highlightVariantId = params.get("item") || "";
  try {
    const response = await fetch(`/api/public/events/${encodeURIComponent(parishId)}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Unable to load this parish's events.");
    if (!data.available) throw new Error("Meals & Events isn't currently available for this parish.");
    items = Array.isArray(data.items) ? data.items : [];
    const parishName = data.parish?.name || "Parish";
    document.getElementById("parishName").textContent = `${parishName} — Meals & Events`;
    document.title = `${parishName} Meals & Events | AGAPAY`;
    document.getElementById("sellerDisclosure").textContent = data.sellerDisclosure || "Your parish is the seller. Payment is processed securely by Stripe.";
    renderCart();
    if (highlightVariantId) {
      const target = items.find(item => item.variantId === highlightVariantId);
      if (!target) {
        status("That item isn't available right now, but here's everything else on offer.", "");
      } else if (!itemAvailable(target)) {
        status(`${target.name} is sold out. Check with your parish about other options, or browse what's still available below.`, "error");
      } else if (target.salesCloseAt && Date.now() > Date.parse(target.salesCloseAt)) {
        status(`Sales for ${target.name} have closed. Here's everything else still available.`, "error");
      } else {
        status(`You're ordering: ${target.name}.`, "success");
      }
      requestAnimationFrame(() => {
        const card = document.querySelector(`[data-variant-id="${CSS.escape(highlightVariantId)}"]`);
        if (card) { card.scrollIntoView({ behavior: "smooth", block: "center" }); card.classList.add("event-highlight"); }
      });
    }
  } catch (error) {
    status(error.message, "error");
    document.getElementById("products").innerHTML = '<div class="empty-products"><h3>This page is unavailable.</h3><p>Please check with the parish and try again.</p></div>';
  }
}

document.getElementById("checkoutForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  if (!cart.length) return;
  const button = document.getElementById("checkoutButton");
  button.disabled = true; button.textContent = "Preparing secure checkout…"; status("");
  try {
    const response = await fetch(`/api/public/events/${encodeURIComponent(parishId)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: document.getElementById("guestName").value.trim(),
        email: document.getElementById("guestEmail").value.trim(),
        pickupNote: document.getElementById("pickupNote").value.trim(),
        coverFees: document.getElementById("coverFees").checked,
        items: cart.map(row => ({ variantId: row.variantId, quantity: row.quantity }))
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.url) throw new Error(data.error || "Unable to begin checkout.");
    location.href = data.url;
  } catch (error) { status(error.message, "error"); button.disabled = false; button.innerHTML = 'Continue to secure checkout <span>→</span>'; }
});

loadStore();
