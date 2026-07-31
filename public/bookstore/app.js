const parishId = decodeURIComponent(location.pathname.replace(/^\/bookstore\//, "").replace(/\/$/, ""));
let products = [];
let cart = [];

const money = cents => (Number(cents || 0) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

function status(message, tone = "") {
  const el = document.getElementById("status");
  el.hidden = !message;
  el.className = `notice ${tone}`.trim();
  el.textContent = message;
}

function renderProducts() {
  const root = document.getElementById("products");
  if (!products.length) { root.innerHTML = '<p class="empty">No items are available for guest checkout yet.</p>'; return; }
  root.innerHTML = products.map((product, index) => `
    <button class="product" type="button" onclick="addItem(${index})">
      <i>${escapeHtml(product.categoryLabel || "Bookstore item")}</i><strong>${escapeHtml(product.name)}</strong>
      <small>${escapeHtml(product.description || "Available for parish pickup")}</small><b>${money(product.priceCents)}</b>
    </button>`).join("");
}

function renderCart() {
  const root = document.getElementById("cart");
  const total = cart.reduce((sum, row) => sum + row.priceCents * row.quantity, 0);
  document.getElementById("total").textContent = money(total);
  document.getElementById("checkoutButton").disabled = !cart.length;
  if (!cart.length) { root.innerHTML = '<p class="empty">Your cart is empty.</p>'; return; }
  root.innerHTML = cart.map((row, index) => `<div class="cart-row"><div><strong>${escapeHtml(row.name)}</strong><br><small>${money(row.priceCents)} each</small></div><div><div class="qty"><button type="button" onclick="quantity(${index},-1)" aria-label="Remove one">−</button><span>${row.quantity}</span><button type="button" onclick="quantity(${index},1)" aria-label="Add one">+</button></div><button class="remove" type="button" onclick="removeItem(${index})">Remove</button></div></div>`).join("");
}

function addItem(index) {
  const product = products[index];
  const existing = cart.find(row => row.variantId === product.variantId);
  if (existing) existing.quantity = Math.min(50, existing.quantity + 1);
  else cart.push({ productId: product.id, variantId: product.variantId, name: product.name, priceCents: Number(product.priceCents), quantity: 1 });
  renderCart();
}
function quantity(index, delta) { cart[index].quantity += delta; if (cart[index].quantity < 1) cart.splice(index, 1); renderCart(); }
function removeItem(index) { cart.splice(index, 1); renderCart(); }

async function loadStore() {
  const params = new URLSearchParams(location.search);
  if (params.get("order_success")) status("Thank you. Your payment was received and your receipt is on its way.", "success");
  else if (params.get("order_canceled")) status("Checkout was canceled. Your cart has not been charged.");
  try {
    const response = await fetch(`/api/public/bookstore/${encodeURIComponent(parishId)}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Unable to load this bookstore.");
    if (!data.available) throw new Error("Guest bookstore checkout is not currently available for this parish.");
    products = Array.isArray(data.products) ? data.products : [];
    document.getElementById("parishName").textContent = data.parish?.name ? `${data.parish.name} bookstore` : "Parish bookstore";
    document.title = `${data.parish?.name || "Parish"} Bookstore | AGAPAY`;
    document.getElementById("sellerDisclosure").textContent = data.sellerDisclosure || "Your parish is the seller. Payment is processed securely by Stripe.";
    renderProducts();
  } catch (error) {
    status(error.message, "error");
    document.getElementById("products").innerHTML = '<p class="empty">This storefront is unavailable.</p>';
  }
}

document.getElementById("checkoutForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  if (!cart.length) return;
  const button = document.getElementById("checkoutButton");
  button.disabled = true; button.textContent = "Preparing checkout…"; status("");
  try {
    const response = await fetch(`/api/public/bookstore/${encodeURIComponent(parishId)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: document.getElementById("guestName").value.trim(),
        email: document.getElementById("guestEmail").value.trim(),
        pickupNote: document.getElementById("pickupNote").value.trim(),
        items: cart.map(row => ({ productId: row.productId, variantId: row.variantId, quantity: row.quantity }))
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.url) throw new Error(data.error || "Unable to begin checkout.");
    location.href = data.url;
  } catch (error) {
    status(error.message, "error"); button.disabled = false; button.textContent = "Continue to secure checkout";
  }
});

loadStore();
