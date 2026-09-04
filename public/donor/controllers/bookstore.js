// Classic-script controller. Top-level function declarations intentionally
// preserve the inline-handler globals used by the two Bookstore pages.
// ------------------------------------------------------------------
// Parish Bookstore Payments — pay for books, prayer ropes, icons, candles, and
// other devotional items directly from My AGAPAY. Stripe shows sales tax
// during checkout when it applies for the parish's state and tax settings.
// See handleDonorBookstore in src/handlers/bookstore.js for the server side.
// ------------------------------------------------------------------

const BOOKSTORE_CATEGORY_LABELS = {
  book: "Book",
  prayer_rope: "Prayer Rope",
  icon: "Icon",
  candle: "Candle",
  jewelry: "Jewelry / Cross",
  incense: "Incense",
  cd_dvd: "CD / DVD",
  other: "Other Item"
};

const BOOKSTORE_STATUS_LABELS = {
  checkout_created: "Awaiting payment",
  completed: "Paid",
  failed: "Payment failed",
  expired: "Checkout expired",
  refunded: "Refunded"
};

const BOOKSTORE_STATUS_TONE = {
  checkout_created: "pending",
  completed: "success",
  failed: "wine",
  expired: "muted",
  refunded: "muted"
};

const BOOKSTORE_FULFILLMENT_LABELS = {
  pending: "Awaiting pickup",
  ready: "Ready for pickup",
  picked_up: "Picked up",
  shipped: "Shipped",
  fulfilled: "Fulfilled",
  cancelled: "Cancelled",
  none: ""
};

const BOOKSTORE_FALLBACK_FIELDS = [
  { category: "book", label: "Book", fields: [
    { key: "title", label: "Title", required: true, maxLength: 180 },
    { key: "author", label: "Author", required: false, maxLength: 120 },
    { key: "isbn", label: "ISBN / barcode", required: false, maxLength: 32 }
  ] },
  { category: "prayer_rope", label: "Prayer Rope", fields: [
    { key: "description", label: "Description", required: true, maxLength: 180 },
    { key: "color", label: "Color", required: false, maxLength: 80 }
  ] },
  { category: "icon", label: "Icon", fields: [
    { key: "saint_or_feast", label: "Saint or feast", required: true, maxLength: 160 },
    { key: "size", label: "Size", required: false, maxLength: 80 }
  ] },
  { category: "candle", label: "Candle", fields: [{ key: "description", label: "Description", required: true, maxLength: 160 }] },
  { category: "jewelry", label: "Jewelry / Cross", fields: [{ key: "description", label: "Description", required: true, maxLength: 180 }] },
  { category: "incense", label: "Incense", fields: [{ key: "description", label: "Description", required: true, maxLength: 160 }] },
  { category: "cd_dvd", label: "CD / DVD", fields: [{ key: "title", label: "Title", required: true, maxLength: 180 }] },
  { category: "other", label: "Other Item", fields: [{ key: "description", label: "Description", required: true, maxLength: 180 }] }
];

function formatCentsAsDollars(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

let bookstoreItemFieldsSchema = null;
let bookstoreProducts = [];
let bookstoreCart = [];
let bookstoreCatalogQuery = "";
let bookstoreCatalogCategory = "all";
let bookstoreParishes = [];

async function loadBookstoreItemFieldsSchema() {
  if (bookstoreItemFieldsSchema) return bookstoreItemFieldsSchema;
  try {
    const res = await fetch("/api/donor/bookstore/item-fields");
    const data = await res.json().catch(() => ({}));
    bookstoreItemFieldsSchema = Array.isArray(data.categories) && data.categories.length ? data.categories : BOOKSTORE_FALLBACK_FIELDS;
  } catch {
    bookstoreItemFieldsSchema = BOOKSTORE_FALLBACK_FIELDS;
  }
  const select = document.getElementById("bookstoreCategory");
  if (select && bookstoreItemFieldsSchema.length) {
    select.innerHTML = '<option value="">Choose...</option>' +
      bookstoreItemFieldsSchema.map(c => `<option value="${escapeHtml(c.category)}">${escapeHtml(c.label)}</option>`).join("");
  }
  return bookstoreItemFieldsSchema;
}

function renderBookstoreItemFields() {
  const container = document.getElementById("bookstoreItemFields");
  const category = document.getElementById("bookstoreCategory")?.value || "";
  if (!container) return;
  if (!category || !bookstoreItemFieldsSchema) {
    container.innerHTML = '<p style="color:#6F6A60;font-size:13.5px;margin:0;">Choose an item type above to continue.</p>';
    return;
  }
  const entry = bookstoreItemFieldsSchema.find(c => c.category === category);
  const fields = entry?.fields || [];
  const scanButton = category === "book"
    ? `<button type="button" class="btn btn-ghost btn-sm bookstore-scan-btn" onclick="openBookstoreScanner()">
         <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M11 5v14M17 5v14"/></svg>
         Scan book barcode
       </button>`
    : "";
  container.innerHTML = scanButton + fields.map(field => {
    const inputId = `bookstoreField_${field.key}`;
    if (field.type === "select") {
      const options = field.options.map(opt => `<option value="${escapeHtml(opt)}">${escapeHtml(opt.charAt(0).toUpperCase() + opt.slice(1))}</option>`).join("");
      return `<div style="margin-bottom:8px;"><label class="form-label" for="${inputId}">${escapeHtml(field.label)}</label>
        <select class="form-input" id="${inputId}" data-field-key="${escapeHtml(field.key)}" ${field.required ? "required" : ""}>
          <option value="">${field.required ? "Choose..." : "Not specified"}</option>${options}
        </select></div>`;
    }
    return `<div style="margin-bottom:8px;"><label class="form-label" for="${inputId}">${escapeHtml(field.label)}</label>
      <input class="form-input" id="${inputId}" data-field-key="${escapeHtml(field.key)}" type="text" maxlength="${field.maxLength || 150}" ${field.required ? "required" : ""} /></div>`;
  }).join("");
}

function bookstoreProductById(productId, variantId = "") {
  return bookstoreProducts.find(product => product.id === productId && (!variantId || product.variantId === variantId))
    || bookstoreProducts.find(product => product.variantId === variantId)
    || null;
}

function setBookstoreCatalogQuery(value = "") {
  bookstoreCatalogQuery = String(value || "").trim().toLowerCase();
  renderBookstoreProducts(bookstoreProducts);
}

function setBookstoreCatalogCategory(category = "all") {
  bookstoreCatalogCategory = String(category || "all");
  renderBookstoreProducts(bookstoreProducts);
}

function bookstoreCategoryIcon(category = "other") {
  const icons = {
    sale: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 7v8.5L16.5 27 27 16.5 15.5 5H7a2 2 0 0 0-2 2Z"/><circle cx="11" cy="11" r="2"/><path d="m12 21 8-8M13 14h.01M20 21h.01"/></svg>',
    book: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M7 5.5h14.5A3.5 3.5 0 0 1 25 9v17H10.5A3.5 3.5 0 0 1 7 22.5v-17Z"/><path d="M10.5 19H25M12 10h8M12 14h6"/></svg>',
    icon: '<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="6" y="4" width="20" height="24" rx="2"/><circle cx="16" cy="12" r="4"/><path d="M10.5 23c1.2-4 3-6 5.5-6s4.3 2 5.5 6M16 8V5.5M13.5 6.5h5"/></svg>',
    candle: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M12 27h8V14h-8zM10 27h12M16 4c3 3.1 3.1 5.8 0 8-3.1-2.2-3-4.9 0-8Z"/><path d="M16 14v-2"/></svg>',
    jewelry: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8 7c0 8 2.5 14 8 18 5.5-4 8-10 8-18M16 5v13M11.5 10h9"/><path d="M13 20h6"/></svg>',
    incense: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8 23h16l-2 5H10l-2-5ZM11 20h10M10 23c0-5 2.2-8 6-8s6 3 6 8"/><path d="M13 13c-2-2 1-3 0-6M18 13c-2-2 2-3 1-7"/></svg>',
    cd_dvd: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="11"/><circle cx="16" cy="16" r="3"/><path d="m18 13 5-5M9 23l5-5"/></svg>',
    other: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6 11h20v16H6zM10 11V8a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v3M6 17h20M14 15h4v4h-4z"/></svg>'
  };
  return icons[category] || icons.other;
}

function bookstoreBarcodeIcon() {
  return '<svg viewBox="0 0 40 32" aria-hidden="true"><path class="scan-corners" d="M3 10V4h6M31 4h6v6M37 22v6h-6M9 28H3v-6"/><path class="barcode-lines" d="M9 9v14M12 9v14M16 9v14M19 9v14M24 9v14M27 9v14M31 9v14"/></svg>';
}

function bookstoreProductCard(product, { popular = false } = {}) {
  const cartIndex = bookstoreCart.findIndex(ci => ci.productId === product.id && ci.variantId === (product.variantId || ""));
  const cartItem = cartIndex >= 0 ? bookstoreCart[cartIndex] : null;
  const available = product.trackInventory === false || Number(product.stockQuantity || 0) > 0;
  const qtyBadge = cartItem ? `<span class="bookstore-product-card-qty">${Number(cartItem.quantity || 1)} in cart</span>` : "";
  const description = String(product.description || "").trim();
  const productMedia = product.imageUrl
    ? `<span class="bookstore-product-media"><img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.name || "Bookstore item")}" loading="lazy" decoding="async"></span>`
    : `<span class="bookstore-product-media" aria-hidden="true">${bookstoreCategoryIcon(product.category)}</span>`;
  const popularity = popular
    ? `<span class="bookstore-popular-rank">${Number(product.unitsSold || 0) > 0 ? `${Number(product.unitsSold)} sold` : "Parish favorite"}</span>`
    : "";
  const saleBadge = product.onSale ? `<span class="bookstore-sale-ribbon">Sale · ${Number(product.savingsPercent || 0)}% off</span>` : "";
  const price = product.onSale
    ? `<span class="bookstore-price bookstore-price-sale"><del>${formatCentsAsDollars(product.regularPriceCents)}</del><strong>${formatCentsAsDollars(product.priceCents)}</strong></span>`
    : `<span class="bookstore-price">${formatCentsAsDollars(product.priceCents)}</span>`;
  const action = cartItem
    ? `<span class="bookstore-product-stepper" aria-label="Quantity for ${escapeHtml(product.name)}">
        <button type="button" onclick="changeBookstoreCartQuantity(${cartIndex}, -1)" aria-label="Remove one ${escapeHtml(product.name)}">−</button>
        <strong aria-live="polite">${Number(cartItem.quantity || 1)}</strong>
        <button type="button" onclick="changeBookstoreCartQuantity(${cartIndex}, 1)" aria-label="Add another ${escapeHtml(product.name)}">+</button>
      </span>`
    : `<button type="button" class="bookstore-product-add" onclick="addBookstoreProductToCart('${escapeHtml(product.id)}','${escapeHtml(product.variantId || "")}')" ${available ? "" : "disabled"}>${available ? "+ Add" : "Unavailable"}</button>`;
  return `
    <article class="bookstore-product-card${popular ? " bookstore-popular-card" : ""}${product.onSale ? " bookstore-product-on-sale" : ""}${available ? "" : " is-unavailable"}">
      ${qtyBadge}
      ${available ? "" : '<span class="bookstore-product-stock-out">Out of stock</span>'}
      ${saleBadge}
      ${productMedia}
      ${popularity}
      <div class="bookstore-product-copy">
        <span class="bookstore-category-pill">${escapeHtml(product.onSale ? "Sale" : (product.categoryLabel || "Item"))}</span>
        <strong>${escapeHtml(product.name)}</strong>
        ${description ? `<small>${escapeHtml(description)}</small>` : ""}
      </div>
      <span class="bookstore-product-meta">${price}${action}</span>
    </article>`;
}

function renderBookstorePopularItems(products = []) {
  const section = document.getElementById("bookstorePopularItems");
  const grid = document.getElementById("bookstorePopularGrid");
  if (!section || !grid) return;
  const popular = [...products]
    .sort((a, b) => Number(b.unitsSold || 0) - Number(a.unitsSold || 0) || String(a.name || "").localeCompare(String(b.name || "")))
    .slice(0, 4);
  section.hidden = popular.length === 0 || Boolean(bookstoreCatalogQuery) || bookstoreCatalogCategory !== "all";
  grid.innerHTML = popular.map(product => bookstoreProductCard(product, { popular: true })).join("");
}

function renderBookstoreCategoryFilters(products = []) {
  const target = document.getElementById("bookstoreCategoryFilters");
  if (!target) return;
  const categories = new Map();
  products.forEach(product => {
    const key = product.category || "other";
    const label = product.categoryLabel || BOOKSTORE_CATEGORY_LABELS[key] || "Other";
    if (!categories.has(key)) categories.set(key, { label, count: 0 });
    categories.get(key).count += 1;
  });
  const hasSale = products.some(product => product.onSale);
  const availableCategories = new Set(["all", ...(hasSale ? ["sale"] : []), ...categories.keys()]);
  if (!availableCategories.has(bookstoreCatalogCategory)) bookstoreCatalogCategory = "all";
  const filters = [
    { key:"all", label:"All", count:products.length },
    ...(hasSale ? [{ key:"sale", label:"Sale", count:products.filter(product => product.onSale).length }] : []),
    ...Array.from(categories.entries())
      .sort(([, left], [, right]) => left.label.localeCompare(right.label))
      .map(([key, value]) => ({ key, ...value }))
  ];
  target.innerHTML = filters.map(filter => `<button type="button" class="bookstore-category-chip${bookstoreCatalogCategory === filter.key ? " is-active" : ""}" onclick="setBookstoreCatalogCategory('${escapeHtml(filter.key)}')" aria-pressed="${bookstoreCatalogCategory === filter.key}">${filter.key === "sale" ? '<span aria-hidden="true">%</span>' : ""}${escapeHtml(filter.label)} <small>${filter.count}</small></button>`).join("");
}

function renderBookstoreProducts(products = []) {
  const container = document.getElementById("bookstoreProductCatalog");
  if (!container) return;
  const count = document.getElementById("bookstoreCatalogCount");
  if (!products.length) {
    if (count) count.textContent = "No catalog items yet";
    renderBookstorePopularItems([]);
    renderBookstoreCategoryFilters([]);
    container.innerHTML = '<div class="notice">No parish products yet. Scan a book below and, after purchase, it will be added to the parish catalog for other parishioners.</div>';
    return;
  }

  renderBookstorePopularItems(products);
  renderBookstoreCategoryFilters(products);

  const visibleProducts = products.filter(product => {
    const matchesQuery = !bookstoreCatalogQuery || [product.name, product.description, product.categoryLabel]
      .some(value => String(value || "").toLowerCase().includes(bookstoreCatalogQuery));
    const matchesCategory = bookstoreCatalogCategory === "all"
      || (bookstoreCatalogCategory === "sale" ? product.onSale : product.category === bookstoreCatalogCategory);
    return matchesQuery && matchesCategory;
  });
  if (count) count.textContent = bookstoreCatalogQuery || bookstoreCatalogCategory !== "all"
    ? `${visibleProducts.length} of ${products.length} items`
    : `${products.length} item${products.length === 1 ? "" : "s"} available`;
  if (!visibleProducts.length) {
    container.innerHTML = '<div class="notice">No items match that search. Try a title, author, or category.</div>';
    return;
  }

  container.innerHTML = `<div class="bookstore-product-grid">${visibleProducts.map(product => bookstoreProductCard(product)).join("")}</div>`;
}

function renderBookstoreCart() {
  const list = document.getElementById("bookstoreCartList");
  const total = document.getElementById("bookstoreCartTotal");
  const count = document.getElementById("bookstoreCartCount");
  const mobileTotal = document.getElementById("bookstoreMobileCartTotal");
  const mobileCount = document.getElementById("bookstoreMobileCartCount");
  const subtotal = bookstoreCart.reduce((sum, item) => sum + (Number(item.unitPriceCents || 0) * Number(item.quantity || 1)), 0);
  const itemCount = bookstoreCart.reduce((sum, item) => sum + Number(item.quantity || 1), 0);
  if (total) total.textContent = formatCentsAsDollars(subtotal);
  if (count) count.textContent = String(itemCount);
  if (mobileTotal) mobileTotal.textContent = formatCentsAsDollars(subtotal);
  if (mobileCount) mobileCount.textContent = String(itemCount);
  const mobileCartBar = document.getElementById("bookstoreMobileCartBar");
  if (mobileCartBar) mobileCartBar.hidden = itemCount === 0;
  document.getElementById("bookstoreShopGrid")?.classList.toggle("has-cart", itemCount > 0);
  if (bookstoreProducts.length) renderBookstoreProducts(bookstoreProducts);
  if (!list) return;
  if (!bookstoreCart.length) {
    list.innerHTML = '<div class="notice">Your cart is empty.</div>';
    setBookstoreMobileCartOpen(false);
    return;
  }
  list.innerHTML = bookstoreCart.map((item, index) => `
    <div class="bookstore-cart-row">
      <div class="bookstore-cart-row-top">
        <span class="bookstore-cart-thumb" aria-hidden="true">${item.imageUrl ? `<img src="${escapeHtml(item.imageUrl)}" alt="">` : bookstoreCategoryIcon(item.itemCategory || bookstoreProductById(item.productId, item.variantId)?.category || "other")}</span>
        <div><strong>${escapeHtml(item.name)}</strong><br><small>${escapeHtml(item.categoryLabel || "Bookstore item")} · ${formatCentsAsDollars(item.unitPriceCents)} each</small></div>
        <button type="button" class="bookstore-cart-remove" onclick="removeBookstoreCartItem(${index})" aria-label="Remove ${escapeHtml(item.name)} from cart">×</button>
      </div>
      <div class="bookstore-qty-controls" aria-label="Quantity for ${escapeHtml(item.name)}">
        <button type="button" onclick="changeBookstoreCartQuantity(${index}, -1)">-</button>
        <span>${Number(item.quantity || 1)}</span>
        <button type="button" onclick="changeBookstoreCartQuantity(${index}, 1)">+</button>
        <small>${formatCentsAsDollars(Number(item.unitPriceCents || 0) * Number(item.quantity || 1))}</small>
      </div>
    </div>
  `).join("");
}

function setBookstoreMobileCartOpen(isOpen) {
  const panel = document.getElementById("bookstoreCartPanel");
  const trigger = document.getElementById("bookstoreMobileCartBar");
  const action = document.getElementById("bookstoreMobileCartAction");
  const backdrop = document.getElementById("bookstoreCartBackdrop");
  if (!panel || !trigger) return;
  const isMobile = window.matchMedia?.("(max-width: 700px)")?.matches;
  panel.classList.toggle("is-mobile-open", isOpen);
  trigger.setAttribute("aria-expanded", String(isOpen));
  if (action) action.textContent = isOpen ? "Close" : "View";
  if (backdrop) backdrop.hidden = !isOpen;
  document.body.classList.toggle("bookstore-cart-open", isOpen);
  if (isMobile) {
    panel.setAttribute("aria-hidden", String(!isOpen));
    panel.inert = !isOpen;
    if (isOpen) panel.querySelector(".bookstore-cart-close")?.focus();
    else if (document.activeElement && panel.contains(document.activeElement)) trigger.focus();
  } else {
    panel.removeAttribute("aria-hidden");
    panel.inert = false;
  }
}

function toggleBookstoreMobileCart() {
  if (!bookstoreCart.length) return;
  const panel = document.getElementById("bookstoreCartPanel");
  setBookstoreMobileCartOpen(!panel?.classList.contains("is-mobile-open"));
}

function addBookstoreProductToCart(productId, variantId = "") {
  const product = bookstoreProductById(productId, variantId);
  if (!product) return;
  if (product.trackInventory !== false && Number(product.stockQuantity || 0) <= 0) {
    setDonorStatus(`${product.name} is currently out of stock.`, "info");
    return;
  }
  const existing = bookstoreCart.find(item => item.productId === product.id && item.variantId === product.variantId);
  if (existing) existing.quantity = Math.min(50, Number(existing.quantity || 1) + 1);
  else bookstoreCart.push({
    type: "product",
    productId: product.id,
    variantId: product.variantId,
    name: product.name,
    categoryLabel: product.categoryLabel,
    imageUrl: product.imageUrl || "",
    unitPriceCents: product.priceCents,
    quantity: 1
  });
  renderBookstoreCart();
  setDonorStatus(`${product.name} added to your cart.`, "success");
}

function changeBookstoreCartQuantity(index, delta) {
  const item = bookstoreCart[index];
  if (!item) return;
  const nextQuantity = Number(item.quantity || 1) + delta;
  if (nextQuantity <= 0) bookstoreCart.splice(index, 1);
  else item.quantity = Math.min(50, nextQuantity);
  renderBookstoreCart();
}

function removeBookstoreCartItem(index) {
  bookstoreCart.splice(index, 1);
  renderBookstoreCart();
}

function clearManualBookstoreEntry() {
  const category = document.getElementById("bookstoreCategory");
  const quantity = document.getElementById("bookstoreQuantity");
  const price = document.getElementById("bookstorePrice");
  if (category) category.value = "";
  if (quantity) quantity.value = "1";
  if (price) price.value = "";
  const fields = document.getElementById("bookstoreItemFields");
  if (fields) fields.innerHTML = '<p style="color:#6F6A60;font-size:13.5px;margin:0;">Choose an item type above to enter a custom item.</p>';
}

function addManualBookstoreItem() {
  const itemCategory = document.getElementById("bookstoreCategory")?.value || "";
  if (!itemCategory) {
    setDonorStatus("Choose an item type before adding it to the cart.", "error");
    return;
  }
  const entry = (bookstoreItemFieldsSchema || BOOKSTORE_FALLBACK_FIELDS).find(c => c.category === itemCategory);
  const specifics = {};
  let missingRequired = false;
  document.querySelectorAll('#bookstoreItemFields [data-field-key]').forEach(el => {
    const key = el.getAttribute("data-field-key");
    const value = (el.value || "").trim();
    if (el.hasAttribute("required") && !value) missingRequired = true;
    if (value) specifics[key] = value;
  });
  if (missingRequired) {
    setDonorStatus("Fill in the required fields before adding this item.", "error");
    return;
  }
  const quantity = Number(document.getElementById("bookstoreQuantity")?.value) || 1;
  const unitPrice = Number(document.getElementById("bookstorePrice")?.value || 0);
  if (!unitPrice || unitPrice <= 0) {
    setDonorStatus("Enter a valid price before adding this item.", "error");
    return;
  }
  const name = itemCategory === "book"
    ? [specifics.title, specifics.author ? `by ${specifics.author}` : ""].filter(Boolean).join(" ")
    : (specifics.saint_or_feast || specifics.description || specifics.title || entry?.label || "Bookstore item");
  bookstoreCart.push({
    type: "manual",
    name,
    categoryLabel: entry?.label || BOOKSTORE_CATEGORY_LABELS[itemCategory] || "Item",
    itemCategory,
    specifics,
    unitPrice,
    unitPriceCents: Math.round(unitPrice * 100),
    quantity: Math.max(1, Math.min(50, quantity)),
    source: specifics.isbn ? "scan_and_go" : "manual_entry"
  });
  renderBookstoreCart();
  clearManualBookstoreEntry();
  setDonorStatus(`${name} added to your cart.`, "success");
}

// ------------------------------------------------------------------
// Book barcode scanning — scoped to the Book category only, since ISBNs
// are the one item type with a real, standardized barcode and a free
// public lookup (Open Library). Uses the native BarcodeDetector API when
// the browser supports it, falls back to the ZXing library otherwise.
// Any failure — no camera, permission denied, library didn't load, no
// match found — just closes the scanner and leaves manual Title/Author
// entry exactly as it was; scanning is additive, never a dead end.
// ------------------------------------------------------------------
let bookstoreScannerStream = null;
let bookstoreScannerRAF = null;
let bookstoreZXingReader = null;
let bookstoreScannerTorchOn = false;

function resetBookstoreScannerTorchControl() {
  const button = document.getElementById("bookstoreScannerTorch");
  if (!button) return;
  bookstoreScannerTorchOn = false;
  button.hidden = true;
  button.disabled = false;
  button.setAttribute("aria-pressed", "false");
  const label = button.querySelector("[data-bookstore-torch-label]");
  if (label) label.textContent = "Turn on flashlight";
}

function enableBookstoreScannerTorchControl(track) {
  const button = document.getElementById("bookstoreScannerTorch");
  if (!button || !track?.getCapabilities) return;
  let capabilities = {};
  try { capabilities = track.getCapabilities() || {}; } catch { return; }
  if (capabilities.torch !== true) return;
  button.hidden = false;
}

async function toggleBookstoreScannerTorch() {
  const button = document.getElementById("bookstoreScannerTorch");
  const status = document.getElementById("bookstoreScannerStatus");
  const track = bookstoreScannerStream?.getVideoTracks?.()[0];
  if (!button || !track?.applyConstraints) return;
  const next = !bookstoreScannerTorchOn;
  button.disabled = true;
  try {
    await track.applyConstraints({ advanced: [{ torch: next }] });
    bookstoreScannerTorchOn = next;
    button.setAttribute("aria-pressed", String(next));
    const label = button.querySelector("[data-bookstore-torch-label]");
    if (label) label.textContent = next ? "Turn off flashlight" : "Turn on flashlight";
    if (status) status.textContent = next
      ? "Flashlight on — hold the barcode steady inside the camera view."
      : "Point your camera at the barcode on the back of the book.";
  } catch {
    button.hidden = true;
    if (status) status.textContent = "The flashlight isn't available with this camera. Try moving the book into brighter light.";
  } finally {
    button.disabled = false;
  }
}

async function startBookstoreBookScan() {
  await loadBookstoreItemFieldsSchema();
  const category = document.getElementById("bookstoreCategory");
  if (category) category.value = "book";
  renderBookstoreItemFields();
  const manualPanel = document.querySelector("details.bookstore-manual-panel");
  if (manualPanel) manualPanel.open = true;
  await openBookstoreScanner();
}

async function openBookstoreScanner() {
  const overlay = document.getElementById("bookstoreScannerOverlay");
  const video = document.getElementById("bookstoreScannerVideo");
  const status = document.getElementById("bookstoreScannerStatus");
  if (!overlay || !video) return;
  resetBookstoreScannerTorchControl();
  overlay.hidden = false;
  if (status) status.textContent = "Point your camera at the barcode on the back of the book.";

  try {
    bookstoreScannerStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" }
    });
  } catch {
    if (status) status.textContent = "Couldn't access your camera. You can still enter the title and author below.";
    setTimeout(closeBookstoreScanner, 1800);
    return;
  }
  video.srcObject = bookstoreScannerStream;
  await video.play().catch(() => {});
  enableBookstoreScannerTorchControl(bookstoreScannerStream.getVideoTracks()[0]);

  if ("BarcodeDetector" in window) {
    try {
      const supported = await window.BarcodeDetector.getSupportedFormats();
      if (supported.includes("ean_13")) {
        const detector = new window.BarcodeDetector({ formats: ["ean_13"] });
        scanWithBarcodeDetector(detector, video);
        return;
      }
    } catch { /* fall through to ZXing */ }
  }
  scanWithZXing(video, status);
}

function scanWithBarcodeDetector(detector, video) {
  const tick = async () => {
    if (!bookstoreScannerStream) return;
    try {
      const codes = await detector.detect(video);
      if (codes.length) {
        handleBarcodeDetected(codes[0].rawValue);
        return;
      }
    } catch { /* keep trying */ }
    bookstoreScannerRAF = requestAnimationFrame(tick);
  };
  bookstoreScannerRAF = requestAnimationFrame(tick);
}

function scanWithZXing(video, status) {
  if (typeof ZXing === "undefined") {
    if (status) status.textContent = "Barcode scanning isn't available on this device. Enter the title and author below.";
    setTimeout(closeBookstoreScanner, 2200);
    return;
  }
  try {
    bookstoreZXingReader = new ZXing.BrowserMultiFormatReader();
    bookstoreZXingReader.decodeFromVideoElement(video, (result, err) => {
      if (result?.text) handleBarcodeDetected(result.text);
    });
  } catch {
    if (status) status.textContent = "Barcode scanning isn't available on this device. Enter the title and author below.";
    setTimeout(closeBookstoreScanner, 2200);
  }
}

async function handleBarcodeDetected(rawValue) {
  const isbn = String(rawValue || "").replace(/[^0-9Xx]/g, "");
  if (isbn.length !== 10 && isbn.length !== 13) return; // not a book ISBN, keep scanning

  const status = document.getElementById("bookstoreScannerStatus");
  if (status) status.textContent = "Found it — looking up the title...";
  closeBookstoreScanner();

  try {
    const parishId = document.getElementById("bookstoreParishId")?.value || donorProfile()?.defaultParishId || "";
    const data = await donorApi(`/api/donor/bookstore/isbn-lookup?isbn=${encodeURIComponent(isbn)}`, {
      headers: donorAuthHeaders({ "X-AGAPAY-Parish-Id": parishId })
    });
    if (data.found && data.product?.id) {
      const product = data.product;
      if (!bookstoreProductById(product.id, product.variantId)) {
        bookstoreProducts.push(product);
        renderBookstoreProducts(bookstoreProducts);
      }
      addBookstoreProductToCart(product.id, product.variantId || "");
      setDonorStatus(`${product.name} found in the parish catalog and added to your cart.`, "success");
    } else if (data.found) {
      const category = document.getElementById("bookstoreCategory");
      if (category) {
        category.value = "book";
        renderBookstoreItemFields();
      }
      const titleInput = document.getElementById("bookstoreField_title");
      const authorInput = document.getElementById("bookstoreField_author");
      const isbnInput = document.getElementById("bookstoreField_isbn");
      if (titleInput) titleInput.value = data.title || "";
      if (authorInput) authorInput.value = data.author || "";
      if (isbnInput) isbnInput.value = data.isbn || isbn;
      setDonorStatus("Title filled in from the barcode. Enter the price, then add it to your cart.", "success");
    } else {
      setDonorStatus("Couldn't find that book — enter the title and author below.", "info");
    }
  } catch {
    setDonorStatus("Couldn't look up that book — enter the title and author below.", "info");
  }
}

function closeBookstoreScanner() {
  const overlay = document.getElementById("bookstoreScannerOverlay");
  const video = document.getElementById("bookstoreScannerVideo");
  if (overlay) overlay.hidden = true;
  if (bookstoreScannerRAF) cancelAnimationFrame(bookstoreScannerRAF);
  bookstoreScannerRAF = null;
  if (bookstoreZXingReader) {
    try { bookstoreZXingReader.reset(); } catch {}
    bookstoreZXingReader = null;
  }
  if (bookstoreScannerStream) {
    bookstoreScannerStream.getTracks().forEach(track => track.stop());
    bookstoreScannerStream = null;
  }
  resetBookstoreScannerTorchControl();
  if (video) video.srcObject = null;
}

function renderBookstoreParishContext(parish = null) {
  const parishId = parish?.id || "";
  const parishName = parish?.name || "";
  const place = [parish?.city, parish?.state].filter(Boolean).join(", ");
  const display = document.getElementById("commemorationParishDisplay");
  const parishInput = document.getElementById("bookstoreParishId");
  if (display) display.textContent = parishName ? [parishName, place].filter(Boolean).join(" · ") : "Choose a church";
  if (parishInput) parishInput.value = parishId;
  const bookstoreLabel = parishName ? `the ${parishName}` : "your parish";
  setText("bookstoreHeroTitle", `Shop the shelves at ${bookstoreLabel} bookstore.`);
  setText("bookstoreHeroDescription", parishName
    ? "Browse books and parish goods, add what you need, and check out securely from your phone."
    : "Choose a church below to browse its bookstore without leaving this page.");
}

function renderBookstoreParishOptions(query = "") {
  const list = document.getElementById("bookstoreParishOptions");
  if (!list) return;
  const selectedId = document.getElementById("bookstoreParishId")?.value || donorProfile()?.defaultParishId || "";
  const normalizedQuery = String(query || "").trim().toLowerCase();
  const matches = bookstoreParishes.filter(parish => [parish.name, parish.city, parish.state, parish.jurisdictionLabel, parish.jurisdiction]
    .filter(Boolean).join(" ").toLowerCase().includes(normalizedQuery));
  list.innerHTML = matches.length
    ? matches.map(parish => {
        const place = [parish.city, parish.state].filter(Boolean).join(", ");
        const selected = parish.id === selectedId;
        return `<button type="button" class="bookstore-parish-option${selected ? " is-current" : ""}" role="option" aria-selected="${selected}" onclick="selectBookstoreParish('${escapeHtml(parish.id)}')"><span><strong>${escapeHtml(parish.name || "Parish")}</strong>${place ? `<small>${escapeHtml(place)}</small>` : ""}</span>${selected ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>' : ""}</button>`;
      }).join("")
    : '<div class="bookstore-parish-empty">No churches match that search.</div>';
}

async function loadBookstoreParishOptions() {
  const list = document.getElementById("bookstoreParishOptions");
  if (list) list.innerHTML = '<div class="bookstore-parish-empty">Loading churches…</div>';
  try {
    bookstoreParishes = window.agapayPublicParishes?.length ? window.agapayPublicParishes : await fetchPublicParishes();
    window.agapayPublicParishes = bookstoreParishes;
    renderBookstoreParishOptions(document.getElementById("bookstoreParishSearch")?.value || "");
  } catch {
    if (list) list.innerHTML = '<div class="bookstore-parish-empty">Churches could not be loaded. Please try again.</div>';
  }
}

function closeBookstoreParishMenu({ restoreFocus = false } = {}) {
  const menu = document.getElementById("bookstoreParishMenu");
  const trigger = document.getElementById("bookstoreParishTrigger");
  if (!menu || !trigger) return;
  menu.hidden = true;
  trigger.setAttribute("aria-expanded", "false");
  if (restoreFocus) trigger.focus();
}

function toggleBookstoreParishMenu(event) {
  event?.stopPropagation();
  const menu = document.getElementById("bookstoreParishMenu");
  const trigger = document.getElementById("bookstoreParishTrigger");
  if (!menu || !trigger) return;
  const opening = menu.hidden;
  menu.hidden = !opening;
  trigger.setAttribute("aria-expanded", String(opening));
  if (opening) {
    loadBookstoreParishOptions();
    requestAnimationFrame(() => document.getElementById("bookstoreParishSearch")?.focus());
  }
}

async function selectBookstoreParish(parishId) {
  const parish = bookstoreParishes.find(entry => entry.id === parishId);
  if (!parish) return;
  const currentParishId = document.getElementById("bookstoreParishId")?.value || "";
  if (parishId === currentParishId) {
    closeBookstoreParishMenu({ restoreFocus: true });
    return;
  }
  closeBookstoreParishMenu();
  setDonorStatus(`Opening ${parish.name || "the parish"} bookstore…`, "info");
  try {
    const data = await donorApi("/api/donor/dashboard", {
      method: "PATCH",
      body: JSON.stringify({ defaultParishId: parishId })
    });
    setDonorProfile({ ...(donorProfile() || {}), ...(data.donor || {}), defaultParish: parish });
    bookstoreCart = [];
    bookstoreCatalogQuery = "";
    const search = document.getElementById("bookstoreProductSearch");
    if (search) search.value = "";
    renderBookstoreParishContext(parish);
    renderBookstoreCart();
    const payload = await donorApi("/api/donor/bookstore", {
      headers: donorAuthHeaders({ "X-AGAPAY-Parish-Id": parishId })
    });
    writeDonorCache("bookstore", payload);
    renderBookstorePayload(payload);
    setDonorStatus(`You’re now shopping at ${parish.name || "this parish"}.`, "success");
  } catch (err) {
    setDonorStatus(err.message || "That bookstore could not be opened.", "error");
  }
}

document.addEventListener("click", event => {
  if (!event.target.closest(".bookstore-parish-switcher")) closeBookstoreParishMenu();
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !document.getElementById("bookstoreParishMenu")?.hidden) closeBookstoreParishMenu({ restoreFocus: true });
  if (event.key === "Escape" && document.getElementById("bookstoreCartPanel")?.classList.contains("is-mobile-open")) setBookstoreMobileCartOpen(false);
});

async function loadDonorBookstorePage() {
  const session = donorSession();
  const list = document.getElementById("bookstoreOrderList");
  primeCommemorationParishDisplay();
  loadBookstoreItemFieldsSchema();


  if (!session.email || !session.token) {
    if (list) list.innerHTML = '<div class="notice">Sign in to view your orders.</div>';
    return;
  }

  let donor = donorProfile();
  let dashboardParish = null;
  try {
    const dashboard = await donorApi("/api/donor/dashboard");
    dashboardParish = dashboard.parish || null;
    donor = { ...donor, ...(dashboard.donor || {}), defaultParish: dashboardParish || donor.defaultParish || null };
    setDonorProfile(donor);
  } catch {
    // The bookstore can still use the last saved profile while offline.
  }

  let parishId = dashboardParish?.id || donor?.defaultParishId || "";
  let parishName = dashboardParish?.name || donor?.defaultParish?.name || donor?.defaultParishName || "";
  if (parishId && !dashboardParish) {
    try {
      const parishes = window.agapayPublicParishes?.length ? window.agapayPublicParishes : await fetchPublicParishes();
      bookstoreParishes = parishes;
      window.agapayPublicParishes = parishes;
      const parishSlug = value => String(value || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      const configuredSlug = parishSlug(parishId);
      const canonicalParish = parishes.find(parish => parish.id === parishId)
        || parishes.find(parish => parishSlug(parish.id) === configuredSlug || parishSlug(parish.name) === configuredSlug);
      if (canonicalParish) {
        parishId = canonicalParish.id;
        parishName = canonicalParish.name || parishName;
      }
    } catch {
      // Keep the configured parish id if the public directory is unavailable.
    }
  }
  const selectedParish = dashboardParish || bookstoreParishes.find(parish => parish.id === parishId) || { id: parishId, name: parishName };
  renderBookstoreParishContext(selectedParish);

  if (!parishId) {
    renderBookstoreProducts([]);
    if (list) list.innerHTML = '<div class="notice">Choose a church above to open its bookstore.</div>';
    return;
  }

  handleBookstoreCheckoutReturn();

  const cached = readDonorCache("bookstore");
  if (cached) renderBookstorePayload(cached);

  try {
    const data = await donorApi("/api/donor/bookstore", {
      headers: donorAuthHeaders({ "X-AGAPAY-Parish-Id": parishId })
    });
    writeDonorCache("bookstore", data);
    renderBookstorePayload(data);
  } catch (err) {
    if (isDonorUnauthorized(err)) {
      clearDonorSession();
      if (list) list.innerHTML = '<div class="notice">Session expired. Please sign in again.</div>';
      return;
    }
    if (!cached) {
      if (list) list.innerHTML = `<div class="notice">${escapeHtml(err.message)}</div>`;
    }
  }
}

function renderBookstorePayload(payload = {}) {
  const list = document.getElementById("bookstoreOrderList");
  const form = document.getElementById("bookstoreForm");
  const unavailableNotice = document.getElementById("bookstoreUnavailableNotice");

  const available = payload.available !== false; // default to showing the form while first loading
  if (form) form.style.display = available ? "" : "none";
  bookstoreProducts = Array.isArray(payload.products) ? payload.products : [];
  renderBookstoreProducts(bookstoreProducts);
  renderBookstoreCart();
  if (unavailableNotice) {
    unavailableNotice.style.display = available ? "none" : "block";
    unavailableNotice.innerHTML = available ? "" : `
      <p style="margin:0 0 8px;">Your parish hasn't activated Bookstore Payments yet.</p>
      <p style="margin:0 0 12px;">Bookstore Payments are part of the AGAPAY Parish+ premium add-on. You can request this feature and AGAPAY will let your parish know donors are interested.</p>
      <button type="button" class="btn btn-ghost btn-sm" onclick="requestBookstoreFeature(this)">Request this feature for my parish</button>
    `;
  }

  const orders = Array.isArray(payload.orders) ? payload.orders : [];
  if (list) {
    list.innerHTML = orders.length
      ? orders.map(bookstoreOrderRow).join("")
      : '<div class="notice">No orders yet.</div>';
  }
  return payload;
}

async function requestBookstoreFeature(btn) {
  const parishId = document.getElementById("bookstoreParishId")?.value || donorProfile()?.defaultParishId || "";
  if (!parishId) return;
  if (btn) { btn.disabled = true; btn.textContent = "Sending..."; }
  try {
    const data = await donorApi("/api/donor/bookstore/request-feature", {
      method: "POST",
      body: JSON.stringify({ parishId })
    });
    if (btn) btn.textContent = data.alreadySent ? "Already asked recently" : "Request sent!";
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = "Request this feature for my parish"; }
    setDonorStatus(err.message, "error");
  }
}

function bookstoreOrderRow(row) {
  const statusLabel = BOOKSTORE_STATUS_LABELS[row.status] || row.status;
  const tone = BOOKSTORE_STATUS_TONE[row.status] || "muted";
  const categoryLabel = row.itemCategoryLabel || BOOKSTORE_CATEGORY_LABELS[row.itemCategory] || "Item";
  const isPaid = row.paymentStatus === "paid";
  const items = Array.isArray(row.items) ? row.items : [];
  const fulfillmentLabel = BOOKSTORE_FULFILLMENT_LABELS[row.fulfillmentStatus] || "";
  const dateLabel = shortDate(row.createdAt);

  // Paid orders expand into a real line-item receipt. Unpaid/failed/expired
  // checkouts have no confirmed items worth itemizing, so they stay flat.
  if (!isPaid || !items.length) {
    return `<div class="sac-row">
      <div class="sac-row-top">
        <span class="sac-row-type">${escapeHtml(row.itemDescription)}</span>
        <span class="status-pill ${tone}">${escapeHtml(statusLabel)}</span>
      </div>
      <div class="sac-row-meta">${escapeHtml(categoryLabel)} &times; ${row.quantity} &middot; ${formatCentsAsDollars(row.totalChargedCents || row.subtotalCents)}${row.pickupNote ? ` &middot; ${escapeHtml(row.pickupNote)}` : ""}</div>
    </div>`;
  }

  const itemLines = items.map((item) => `
    <li class="bk-receipt-line">
      <span class="bk-receipt-line-name">${escapeHtml(item.name)}${item.quantity > 1 ? ` <em>&times;${item.quantity}</em>` : ""}</span>
      <span class="bk-receipt-line-amt">${formatCentsAsDollars(item.totalCents)}</span>
    </li>`).join("");

  return `<div class="bk-receipt">
    <button type="button" class="bk-receipt-head" onclick="this.closest('.bk-receipt').classList.toggle('is-open')" aria-expanded="false">
      <div class="bk-receipt-summary">
        <span class="sac-row-type">${escapeHtml(row.itemDescription)}</span>
        <span class="sac-row-meta">${escapeHtml(categoryLabel)} &middot; ${dateLabel}${fulfillmentLabel ? ` &middot; ${escapeHtml(fulfillmentLabel)}` : ""}</span>
      </div>
      <div class="bk-receipt-head-right">
        <span class="bk-receipt-total">${formatCentsAsDollars(row.totalChargedCents || row.subtotalCents)}</span>
        <span class="status-pill ${tone}">${escapeHtml(statusLabel)}</span>
        <svg class="bk-receipt-caret" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m3 5 3 3 3-3"/></svg>
      </div>
    </button>
    <div class="bk-receipt-body">
      <div class="bk-receipt-body-inner">
        <ul class="bk-receipt-lines">${itemLines}</ul>
        <div class="bk-receipt-totals">
          <span>Subtotal</span><span>${formatCentsAsDollars(row.subtotalCents)}</span>
          ${row.taxCents ? `<span>Tax</span><span>${formatCentsAsDollars(row.taxCents)}</span>` : ""}
          <span class="bk-receipt-total-row">Total paid</span><span class="bk-receipt-total-row">${formatCentsAsDollars(row.totalChargedCents || row.subtotalCents)}</span>
        </div>
        ${row.pickupNote ? `<p class="bk-receipt-note">Note to parish: ${escapeHtml(row.pickupNote)}</p>` : ""}
      </div>
    </div>
  </div>`;
}

async function submitBookstoreOrder(event) {
  event.preventDefault();
  const session = donorSession();
  if (!session.email || !session.token) {
    setDonorStatus("Sign in from the donor home page before checking out.", "error");
    return;
  }

  const parishId = document.getElementById("bookstoreParishId")?.value || donorProfile()?.defaultParishId || "";
  if (!parishId) {
    setDonorStatus("Choose your parish in Settings first.", "error");
    return;
  }

  if (!bookstoreCart.length) {
    setDonorStatus("Add at least one item to your cart before checkout.", "error");
    return;
  }
  const pickupNote = document.getElementById("bookstorePickupNote")?.value || "";
  const coverFees = document.getElementById("bookstoreCoverFees")?.checked !== false;
  const items = bookstoreCart.map(item => item.type === "product"
    ? {
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity
      }
    : {
        itemCategory: item.itemCategory,
        specifics: item.specifics,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        source: item.source || "manual_entry"
      });

  try {
    setDonorStatus("Preparing checkout...");
    const data = await donorApi("/api/donor/bookstore", {
      method: "POST",
      body: JSON.stringify({
        parishId,
        items,
        pickupNote,
        coverFees,
        email: session.email
      })
    });
    if (data.url) window.location.href = data.url;
    else setDonorStatus(data.message || "Checkout is not available yet.", "error");
  } catch (err) {
    setDonorStatus(err.message, "error");
  }
}

function handleBookstoreCheckoutReturn() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("order_success") === "1") {
    setDonorStatus("Payment received — thank you! Your parish will let you know when your item is ready.", "success");
    window.history.replaceState({}, "", "/myagapay/bookstore");
  } else if (params.get("order_canceled") === "1") {
    setDonorStatus("Checkout canceled. Your order was not charged.", "info");
    window.history.replaceState({}, "", "/myagapay/bookstore");
  }
}
