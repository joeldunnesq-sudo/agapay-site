import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = file => readFileSync(path.join(root, file), "utf8");
const html = read("public/myagapay/bookstore.html");
const app = read("public/donor/app.js");

assert.match(html, /id="bookstoreParishTrigger"[\s\S]*?aria-controls="bookstoreParishMenu"/,
  "the Shopping at card must expose an accessible church switcher");
assert.match(html, /id="bookstoreParishSearch"[\s\S]*?id="bookstoreParishOptions"/,
  "the church switcher must offer an in-place searchable popout");
assert.match(app, /donorApi\("\/api\/donor\/dashboard", \{[\s\S]*?method: "PATCH"[\s\S]*?defaultParishId: parishId/,
  "choosing a bookstore must persist the church without sending the shopper to Settings");
assert.match(app, /bookstoreCart = \[\][\s\S]*?renderBookstoreParishContext\(parish\)/,
  "switching churches must clear parish-specific cart state before rendering the next store");

assert.match(html, /id="bookstorePopularItems"[\s\S]*?<h2 id="bookstorePopularHeading">Popular items<\/h2>[\s\S]*?id="bookstorePopularGrid"/,
  "the storefront must render a community-ranked Popular items rail");
assert.ok(html.indexOf('class="bookstore-catalog-heading"') < html.indexOf('id="bookstoreCategoryFilters"')
  && html.indexOf('id="bookstoreCategoryFilters"') < html.indexOf('id="bookstorePopularItems"')
  && html.indexOf('id="bookstorePopularItems"') < html.indexOf('class="bookstore-scan-feature"'),
  "search and category filters must lead the app-like discovery flow before recommendations and scanning");
assert.match(app, /Number\(b\.unitsSold \|\| 0\) - Number\(a\.unitsSold \|\| 0\)[\s\S]*?\.slice\(0, 4\)/,
  "Popular items must be ranked by completed sales and limited to four cards");
assert.match(app, /function bookstoreCategoryIcon[\s\S]*?book:[\s\S]*?icon:[\s\S]*?candle:[\s\S]*?jewelry:[\s\S]*?incense:[\s\S]*?cd_dvd:/,
  "storefront categories must use purpose-designed icons for the supported inventory types");
assert.match(app, /bookstoreCategoryIcon\(product\.category\)/,
  "products without photos must retain category-specific visual artwork");
assert.match(app, /function renderBookstoreCategoryFilters[\s\S]*?bookstore-category-chip[\s\S]*?aria-pressed/,
  "category filters must be rendered as accessible app-style selection chips");
assert.match(app, /bookstoreCatalogCategory === "sale" \? product\.onSale : product\.category === bookstoreCatalogCategory/,
  "category chips must filter the flat product feed, including a dedicated Sale view");
assert.doesNotMatch(app, /details\.bookstore-category-group|openLabels\.has\(category\)/,
  "the shopping feed must not require opening accordion shelves");
assert.match(html, /\.bookstore-shop-grid\.has-cart \{[^}]*grid-template-columns:minmax\(0,1fr\) minmax\(315px,\.36fr\)/,
  "the cart may claim a second column only after an item is added");
assert.match(html, /\.bookstore-mobile-cart-bar \{ position:fixed; z-index:205;[\s\S]*?bottom:calc\(76px \+ env\(safe-area-inset-bottom\)\)/,
  "the mobile cart action must behave like an app checkout bar while remaining above the canonical bottom nav");
assert.match(html, /\.bookstore-cart-card\.is-mobile-open \{[^}]*opacity:1;[^}]*pointer-events:auto;[^}]*transform:translateY\(0\)/,
  "the mobile cart must open as a focused bottom sheet");
assert.match(app, /panel\.inert = !isOpen[\s\S]*?bookstore-cart-close/,
  "the closed cart sheet must be removed from keyboard navigation and focus its close action when opened");
assert.match(app, /classList\.toggle\("has-cart", itemCount > 0\)/,
  "the storefront width must respond to actual cart state");

assert.match(html, /donor\/style\.css\?v=20260819koinoniaweek1/,
  "the bookstore must load the updated storefront styles with a fresh immutable URL");
assert.match(html, /donor\/app\.js\?v=20260819bookstoreapp2/,
  "the bookstore must load the updated storefront behavior with a fresh immutable URL");
assert.match(html, /id="donorStatus"[^>]*role="status"[^>]*aria-live="polite"[^>]*hidden/,
  "bookstore feedback must begin as a non-layout status surface");
assert.match(html, /\.bookstore-toast \{[\s\S]*?position:fixed;[\s\S]*?transform:translate\(-50%,-18px\)[\s\S]*?transition:/,
  "bookstore feedback must overlay the page and animate in from above");
assert.match(app, /isBookstoreToast[\s\S]*?classList\.add\("is-visible"\)[\s\S]*?2800/,
  "non-error bookstore feedback must automatically slide away after a short delay");
assert.match(html, /bookstore-scan-feature-icon[\s\S]*?barcode-lines/,
  "the primary scanner card must feature a real barcode illustration");
assert.match(html, /class="bookstore-scan-feature"[\s\S]*?startBookstoreBookScan\(\)/,
  "the shopping feed must keep a prominent barcode scanner quick action");
assert.match(html, /id="bookstoreScannerTorch"[^>]*aria-pressed="false"[^>]*toggleBookstoreScannerTorch\(\)[^>]*hidden/,
  "the barcode scanner must include an initially hidden, accessible flashlight control");
assert.match(app, /getCapabilities\(\)[\s\S]*capabilities\.torch !== true[\s\S]*applyConstraints\(\{ advanced: \[\{ torch: next \}\] \}\)/,
  "the flashlight control must feature-detect torch support before changing the camera constraint");
assert.match(app, /function closeBookstoreScanner\(\)[\s\S]*track\.stop\(\)[\s\S]*resetBookstoreScannerTorchControl\(\)/,
  "closing the scanner must stop the camera and reset the flashlight control");
assert.match(html, /\.bookstore-product-media \{[^}]*height:148px[^}]*flex:0 0 148px/,
  "product photos must stay inside a fixed-height media frame instead of overtaking the card");
assert.match(html, /\.bookstore-product-media img \{[^}]*object-fit:contain/,
  "product photos must preserve their full artwork while leaving title and price visible");
assert.match(html, /@media \(max-width:700px\)[\s\S]*?\.bookstore-product-media \{ height:126px; min-height:126px; flex-basis:126px;/,
  "phone storefront cards must reserve a stable image frame");
assert.match(app, /const description = String\(product\.description \|\| ""\)\.trim\(\);[\s\S]*?\$\{description \? `<small>/,
  "cards without descriptions must not repeat the category label beneath the title");
assert.match(app, /bookstore-product-stepper[\s\S]*?changeBookstoreCartQuantity/,
  "items already in the cart must expose inline quantity controls on their product cards");
assert.match(html, /\.donor-bookstore-page \.my-agapay-tabbar,[\s\S]*?z-index:220;[\s\S]*?background:#fffcf6;[\s\S]*?backdrop-filter:none;/,
  "the mobile bookstore nav must remain opaque and above sticky storefront controls");
assert.match(html, /padding:10px 10px calc\(172px \+ env\(safe-area-inset-bottom\)\)/,
  "the mobile bookstore must reserve scroll clearance for both the checkout bar and canonical bottom nav");
assert.match(html, /\.donor-bookstore-page,[\s\S]*?\.donor-bookstore-page \.content,[\s\S]*?width:100%; min-width:0; max-width:100%; overflow-x:hidden;/,
  "the Galaxy-width storefront must contain page-level horizontal overflow");
assert.match(html, /\.bookstore-category-filters \{ width:100%; max-width:100%; margin:0 0 16px;/,
  "mobile category scrolling must remain inside the centered content width");
assert.match(html, /\.bookstore-popular \{ width:100%; max-width:100%; margin:0 0 14px;/,
  "the Popular items rail must not use full-bleed negative margins that shift wide Android layouts");
assert.match(html, /\.bookstore-storefront-layout \{ width:auto; min-width:0; max-width:100%; \}/,
  "the bookstore layout must consume the space between the shared Koinonia shell margins instead of adding 100% width on top of them");
assert.match(app, /bookstore-sale-ribbon/);
assert.match(app, /<del>\$\{formatCentsAsDollars\(product\.regularPriceCents\)\}<\/del>/,
  "sale cards must show the crossed-out regular price");

assert.match(html, /class="koinonia-mobile-appbar"[\s\S]*?<nav class="mobile-tabbar" aria-label="Donor navigation"><\/nav>/,
  "the bookstore redesign must preserve the canonical top and bottom navigation shells");
assert.doesNotMatch(html, /class="bookstore-app-intro"|Your parish shop|Find something for prayer, study, and home/,
  "the shopping surface must open directly on the parish context and catalog without a redundant hero card");

console.log("PASS - bookstore parish switching, discovery filters, product feed, cart sheet, and canonical navigation are wired");
