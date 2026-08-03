const bookstorePathSegments = location.pathname.split("/").filter(Boolean);
const parishId = decodeURIComponent(bookstorePathSegments[0] === "bookstore" ? (bookstorePathSegments[1] || "") : (bookstorePathSegments[1] === "bookstore" ? bookstorePathSegments[0] : ""));
let products = [];
let cart = [];
let activeCategory = "all";
let scannerStream = null;
let scannerFrame = null;
let zxingReader = null;

const money = cents => (Number(cents || 0) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const normalizeIsbn = value => String(value || "").replace(/[^0-9Xx]/g, "");
const categoryLabels = { book: "Book", prayer_rope: "Prayer Rope", icon: "Icon", candle: "Candle", jewelry: "Jewelry / Cross", incense: "Incense", cd_dvd: "CD / DVD", other: "Other item" };

function status(message, tone = "") {
  const el = document.getElementById("status");
  el.hidden = !message;
  el.className = `notice ${tone}`.trim();
  el.textContent = message;
  if (message) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function categoryArt(category = "other") {
  const paths = {
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 0 4 22V5.5Z"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>',
    icon: '<path d="M5 3h14v18H5z"/><path d="M9 9a3 3 0 0 1 6 0c0 2-1.2 2.6-3 4-1.8-1.4-3-2-3-4Z"/>',
    candle: '<path d="M9 22h6M10 18h4v4h-4zM12 3c2 2 2 4 0 6-2-2-2-4 0-6ZM9 9h6v9H9z"/>',
    prayer_rope: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="4" r="1"/><circle cx="18" cy="8" r="1"/><circle cx="18" cy="16" r="1"/><circle cx="6" cy="16" r="1"/><circle cx="6" cy="8" r="1"/>',
    jewelry: '<path d="M7 4c0 4 2 7 5 9 3-2 5-5 5-9M12 12v9M9 16h6"/>',
    incense: '<path d="M6 14h12l-2 7H8l-2-7ZM9 10c-2-2 1-3 0-6M14 10c-2-2 1-3 0-6"/>',
    cd_dvd: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/>',
    other: '<path d="M4 8h16v12H4zM8 8a4 4 0 0 1 8 0"/>'
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[category] || paths.other}</svg>`;
}

function productAvailable(product) {
  return product.trackInventory === false || Number(product.stockQuantity || 0) > 0;
}

function productImageUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw, location.origin);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    if (/(^|\.)google\.[a-z.]+$/i.test(url.hostname) && url.pathname === "/imgres") {
      const embedded = new URL(url.searchParams.get("imgurl") || "");
      return ["http:", "https:"].includes(embedded.protocol) ? embedded.href : "";
    }
    return url.href;
  } catch {
    return "";
  }
}

function productCard(product, index, rank = 0) {
  const line = cart.find(item => item.variantId && item.variantId === product.variantId);
  const available = productAvailable(product);
  const imageUrl = productImageUrl(product.imageUrl);
  const saleBadge = product.onSale ? `<span class="sale-ribbon">Sale · ${Number(product.savingsPercent || 0)}% off</span>` : "";
  const price = product.onSale
    ? `<span class="sale-price"><del>${money(product.regularPriceCents)}</del><b>${money(product.priceCents)}</b></span>`
    : `<b>${money(product.priceCents)}</b>`;
  return `<button class="product${line ? " in-cart" : ""}${product.onSale ? " on-sale" : ""}" type="button" onclick="addCatalogItem(${index})" ${available ? "" : "disabled"}>
    ${rank ? `<span class="popular-rank">${rank}</span>` : ""}
    ${line ? `<span class="selected-badge">${line.quantity}</span>` : ""}
    ${available ? "" : '<span class="sold-out-badge">Out of stock</span>'}
    ${saleBadge}
    <span class="product-art${imageUrl ? " has-image" : ""}">${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.parentElement.classList.remove('has-image');this.remove()" />` : ""}${categoryArt(product.category)}<small>${escapeHtml(product.categoryLabel || "Parish item")}</small></span>
    <strong>${escapeHtml(product.name)}</strong>
    <p>${escapeHtml(product.description || "Available for parish pickup")}</p>
    <span class="product-foot">${price}<span class="availability${available ? "" : " out"}">${available ? "Available" : "Out of stock"}</span></span>
  </button>`;
}

function selectCategory(category) {
  activeCategory = category || "all";
  renderProducts();
}

function renderProducts() {
  const root = document.getElementById("products");
  document.getElementById("catalogCount").textContent = `${products.length} item${products.length === 1 ? "" : "s"}`;
  if (!products.length) {
    root.innerHTML = '<div class="empty-products"><span class="eyebrow">The shelves are ready</span><h3>No catalog items yet</h3><p>Scan the first book below. After your purchase, it will appear here for the next parishioner.</p></div>';
    return;
  }
  const categories = Array.from(new Map(products.map(product => product.onSale
    ? ["sale", "Sale"]
    : [product.category || "other", product.categoryLabel || "Other"])))
    .sort((a, b) => a[0] === "sale" ? -1 : b[0] === "sale" ? 1 : a[1].localeCompare(b[1]));
  if (activeCategory !== "all" && !categories.some(([category]) => category === activeCategory)) activeCategory = "all";
  document.getElementById("categoryFilters").innerHTML = [["all", "All items"], ...categories]
    .map(([category, label]) => `<button class="category-filter${activeCategory === category ? " active" : ""}" type="button" onclick="selectCategory('${escapeHtml(category)}')" aria-pressed="${activeCategory === category}">${escapeHtml(label)}</button>`).join("");

  const popular = products.map((product, index) => ({ product, index }))
    .filter(({ product }) => Number(product.unitsSold || 0) > 0)
    .sort((a, b) => Number(b.product.unitsSold || 0) - Number(a.product.unitsSold || 0) || a.product.name.localeCompare(b.product.name))
    .slice(0, 3);
  const popularShelf = document.getElementById("popularShelf");
  popularShelf.hidden = !popular.length || activeCategory !== "all";
  document.getElementById("popularProducts").innerHTML = popular.map(({ product, index }, rank) => productCard(product, index, rank + 1)).join("");

  const visibleProducts = activeCategory === "all" ? products : products.filter(product => activeCategory === "sale" ? product.onSale : !product.onSale && (product.category || "other") === activeCategory);
  root.innerHTML = visibleProducts.length
    ? visibleProducts.map(product => productCard(product, products.indexOf(product))).join("")
    : '<div class="empty-products"><h3>No items in this category yet</h3><p>Choose another category or scan a book from the shelf.</p></div>';
}

function renderCart() {
  const root = document.getElementById("cart");
  const quantityTotal = cart.reduce((sum, row) => sum + Number(row.quantity || 1), 0);
  const total = cart.reduce((sum, row) => sum + Number(row.priceCents || 0) * Number(row.quantity || 1), 0);
  document.getElementById("cartCount").textContent = String(quantityTotal);
  document.getElementById("total").textContent = money(total);
  document.getElementById("checkoutButton").disabled = !cart.length;
  renderProducts();
  if (!cart.length) {
    root.innerHTML = '<div class="empty-cart"><span aria-hidden="true">✦</span><b>Your basket is empty</b><p>Choose something from the shelves or scan a book.</p></div>';
    return;
  }
  root.innerHTML = cart.map((row, index) => `<div class="cart-row"><div class="cart-row-top"><div><strong>${escapeHtml(row.name)}</strong><br><small>${row.buyerAdded ? "New item · joins catalog after payment" : escapeHtml(row.categoryLabel || "Parish item")}</small></div><button class="remove" type="button" onclick="removeItem(${index})">Remove</button></div><div class="qty"><button type="button" onclick="changeQuantity(${index},-1)" aria-label="Remove one">−</button><span>${row.quantity}</span><button type="button" onclick="changeQuantity(${index},1)" aria-label="Add one">+</button><b>${money(row.priceCents * row.quantity)}</b></div></div>`).join("");
}

function addCatalogItem(index) {
  const product = products[index];
  if (!product || !productAvailable(product)) return;
  const existing = cart.find(row => row.variantId === product.variantId);
  if (existing) existing.quantity = Math.min(50, existing.quantity + 1);
  else cart.push({ productId: product.id, variantId: product.variantId, name: product.name, categoryLabel: product.categoryLabel, priceCents: Number(product.priceCents), quantity: 1 });
  renderCart();
}

function changeQuantity(index, delta) {
  const row = cart[index];
  if (!row) return;
  row.quantity += delta;
  if (row.quantity < 1) cart.splice(index, 1);
  else row.quantity = Math.min(50, row.quantity);
  renderCart();
}

function removeItem(index) { cart.splice(index, 1); renderCart(); }

async function lookupIsbn(isbn) {
  const clean = normalizeIsbn(isbn);
  const lookupStatus = document.getElementById("bookLookupStatus");
  if (![10, 13].includes(clean.length)) throw new Error("Enter a valid 10- or 13-digit ISBN.");
  document.getElementById("newBookIsbn").value = clean;
  const catalogMatch = products.find(product => [product.barcode, product.sku].some(code => normalizeIsbn(code) === clean));
  if (catalogMatch) {
    const index = products.indexOf(catalogMatch);
    if (!productAvailable(catalogMatch)) throw new Error(`${catalogMatch.name} is in the catalog but currently out of stock.`);
    addCatalogItem(index);
    document.getElementById("addBookPanel").open = false;
    status(`${catalogMatch.name} was already in the parish catalog and has been added to your basket.`, "success");
    return;
  }
  lookupStatus.className = "lookup-status";
  lookupStatus.textContent = "Looking up this ISBN…";
  const response = await fetch(`/api/donor/bookstore/isbn-lookup?isbn=${encodeURIComponent(clean)}`);
  const data = await response.json().catch(() => ({}));
  if (data.found) {
    document.getElementById("newBookTitle").value = data.title || "";
    document.getElementById("newBookAuthor").value = data.author || "";
    lookupStatus.textContent = data.title ? `Found “${data.title}.” Confirm the shelf price below.` : "ISBN found. Enter the title and shelf price below.";
  } else {
    lookupStatus.textContent = "We couldn’t find the title automatically. Enter it from the cover below.";
  }
}

async function lookupEnteredIsbn(button) {
  button.disabled = true;
  try { await lookupIsbn(document.getElementById("newBookIsbn").value); }
  catch (error) { const el = document.getElementById("bookLookupStatus"); el.className = "lookup-status error"; el.textContent = error.message; }
  finally { button.disabled = false; }
}

function addBuyerBook() {
  const category = document.getElementById("newItemCategory").value || "other";
  const isbn = normalizeIsbn(document.getElementById("newBookIsbn").value);
  const title = document.getElementById("newBookTitle").value.trim();
  const author = document.getElementById("newBookAuthor").value.trim();
  const price = Number(document.getElementById("newBookPrice").value);
  const quantity = Math.max(1, Math.min(50, Number(document.getElementById("newBookQuantity").value) || 1));
  const lookupStatus = document.getElementById("bookLookupStatus");
  if (!title || !Number.isFinite(price) || price <= 0 || (category === "book" && isbn && ![10, 13].includes(isbn.length))) {
    lookupStatus.className = "lookup-status error";
    lookupStatus.textContent = "Enter a description and shelf price. If you enter an ISBN, use a valid 10- or 13-digit code.";
    return;
  }
  const name = [title, category === "book" && author ? `by ${author}` : ""].filter(Boolean).join(" ");
  const specifics = category === "book"
    ? { title, author, isbn }
    : category === "icon" ? { saint_or_feast: title } : category === "cd_dvd" ? { title } : { description: title };
  cart.push({ buyerAdded: true, source: category === "book" && isbn ? "scan_and_go" : "shopper_added", itemCategory: category, specifics, name, categoryLabel: `New ${categoryLabels[category] || "item"}`, priceCents: Math.round(price * 100), quantity });
  document.getElementById("newBookIsbn").value = "";
  document.getElementById("newBookTitle").value = "";
  document.getElementById("newBookAuthor").value = "";
  document.getElementById("newBookPrice").value = "";
  document.getElementById("newBookQuantity").value = "1";
  lookupStatus.className = "lookup-status";
  lookupStatus.textContent = "Item added. It will join the parish catalog after payment succeeds.";
  renderCart();
}

function updateUnlistedItemFields() {
  const category = document.getElementById("newItemCategory")?.value || "book";
  const isBook = category === "book";
  document.getElementById("bookIdentifierFields").hidden = !isBook;
  document.getElementById("bookAuthorField").hidden = !isBook;
  document.getElementById("newItemNameLabel").textContent = isBook ? "Book title" : category === "icon" ? "Saint or feast" : "Item description";
  document.getElementById("addUnlistedItemButton").textContent = "Add this item to my basket";
  const lookupStatus = document.getElementById("bookLookupStatus");
  lookupStatus.textContent = isBook ? "Scan or enter an ISBN for automatic title lookup, or type the title yourself." : "Describe the item as it appears on the shelf.";
  lookupStatus.className = "lookup-status";
}

async function openBookScanner() {
  const overlay = document.getElementById("bookScannerOverlay");
  const video = document.getElementById("bookScannerVideo");
  const scannerStatus = document.getElementById("bookScannerStatus");
  overlay.hidden = false;
  scannerStatus.textContent = "Point your camera at the ISBN barcode on the back cover.";
  try { scannerStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }); }
  catch { scannerStatus.textContent = "Camera access wasn’t available. Close this window and enter the ISBN instead."; return; }
  video.srcObject = scannerStream;
  await video.play().catch(() => {});
  if ("BarcodeDetector" in window) {
    try {
      const detector = new BarcodeDetector({ formats: ["ean_13"] });
      const tick = async () => { if (!scannerStream) return; try { const codes = await detector.detect(video); if (codes[0]?.rawValue) return handleScannedCode(codes[0].rawValue); } catch {} scannerFrame = requestAnimationFrame(tick); };
      scannerFrame = requestAnimationFrame(tick); return;
    } catch {}
  }
  if (typeof ZXing !== "undefined") {
    try { zxingReader = new ZXing.BrowserMultiFormatReader(); zxingReader.decodeFromVideoElement(video, result => { if (result?.text) handleScannedCode(result.text); }); return; } catch {}
  }
  scannerStatus.textContent = "Barcode scanning isn’t available on this device. Enter the ISBN instead.";
}

async function handleScannedCode(rawValue) {
  const isbn = normalizeIsbn(rawValue);
  if (![10, 13].includes(isbn.length)) return;
  closeBookScanner();
  document.getElementById("addBookPanel").open = true;
  try { await lookupIsbn(isbn); }
  catch (error) { const el = document.getElementById("bookLookupStatus"); el.className = "lookup-status error"; el.textContent = error.message; }
}

function closeBookScanner() {
  document.getElementById("bookScannerOverlay").hidden = true;
  if (scannerFrame) cancelAnimationFrame(scannerFrame);
  scannerFrame = null;
  if (zxingReader) { try { zxingReader.reset(); } catch {} zxingReader = null; }
  if (scannerStream) { scannerStream.getTracks().forEach(track => track.stop()); scannerStream = null; }
  document.getElementById("bookScannerVideo").srcObject = null;
}

async function loadStore() {
  const params = new URLSearchParams(location.search);
  if (params.get("order_success")) status("Thank you. Your payment was received, and your receipt is on its way.", "success");
  else if (params.get("order_canceled")) status("Checkout was canceled. Your basket has not been charged.");
  try {
    const response = await fetch(`/api/public/bookstore/${encodeURIComponent(parishId)}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Unable to load this bookstore.");
    if (!data.available) throw new Error("Guest bookstore checkout is not currently available for this parish.");
    products = Array.isArray(data.products) ? data.products : [];
    const parishName = data.parish?.name || data.sellerDisclosure?.match(/^Sold by ([^.]+)/)?.[1] || "Parish";
    document.getElementById("parishName").textContent = `${parishName} Bookstore`;
    document.title = `${parishName} Bookstore | AGAPAY`;
    document.getElementById("sellerDisclosure").textContent = data.sellerDisclosure || "Your parish is the seller. Payment is processed securely by Stripe.";
    renderCart();
  } catch (error) {
    status(error.message, "error");
    document.getElementById("products").innerHTML = '<div class="empty-products"><h3>This storefront is unavailable.</h3><p>Please check with the parish and try again.</p></div>';
  }
}

document.getElementById("checkoutForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  if (!cart.length) return;
  const button = document.getElementById("checkoutButton");
  button.disabled = true; button.textContent = "Preparing secure checkout…"; status("");
  try {
    const response = await fetch(`/api/public/bookstore/${encodeURIComponent(parishId)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: document.getElementById("guestName").value.trim(), email: document.getElementById("guestEmail").value.trim(), pickupNote: document.getElementById("pickupNote").value.trim(), coverFees: document.getElementById("coverFees").checked,
        items: cart.map(row => row.buyerAdded ? { source: row.source, itemCategory: row.itemCategory, specifics: row.specifics, unitPrice: row.priceCents / 100, quantity: row.quantity } : { productId: row.productId, variantId: row.variantId, quantity: row.quantity })
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.url) throw new Error(data.error || "Unable to begin checkout.");
    location.href = data.url;
  } catch (error) { status(error.message, "error"); button.disabled = false; button.innerHTML = 'Continue to secure checkout <span>→</span>'; }
});

updateUnlistedItemFields();
loadStore();
