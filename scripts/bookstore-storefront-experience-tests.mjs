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
  "the storefront must render a two-item Popular items section above the shelves");
assert.ok(html.indexOf('id="bookstorePopularItems"') < html.indexOf('class="bookstore-scan-feature"')
  && html.indexOf('class="bookstore-scan-feature"') < html.indexOf('class="bookstore-catalog-heading"'),
  "the primary scanner card must sit between Popular items and Shop the shelves");
assert.match(app, /Number\(b\.unitsSold \|\| 0\) - Number\(a\.unitsSold \|\| 0\)[\s\S]*?\.slice\(0, 2\)/,
  "Popular items must be ranked by completed sales and limited to two cards");
assert.match(app, /function bookstoreCategoryIcon[\s\S]*?book:[\s\S]*?icon:[\s\S]*?candle:[\s\S]*?jewelry:[\s\S]*?incense:[\s\S]*?cd_dvd:/,
  "storefront categories must use purpose-designed icons for the supported inventory types");
assert.match(app, /class="bookstore-category-icon">\$\{bookstoreCategoryIcon\(category\)\}/,
  "each Shop the shelves summary must render its category icon");

assert.match(app, /const isOpen = openLabels\.has\(category\);/,
  "only shopper-opened categories may remain expanded during a re-render");
assert.doesNotMatch(app, /openLabels\.size === 0 && idx === 0|cartQtyInCategory > 0 \|\|/,
  "no shelf category may be opened automatically");
assert.match(html, /\.bookstore-shop-grid \{[^}]*grid-template-columns: minmax\(0, 1fr\)/,
  "collapsed shelves must use the full storefront width while the cart is empty");
assert.match(html, /\.bookstore-shop-grid\.has-cart \{[^}]*grid-template-columns: minmax\(0, 1\.35fr\) minmax\(300px, 0\.75fr\)/,
  "the cart may claim a second column only after an item is added");
assert.match(html, /\.bookstore-shop-grid \{ display:flex; flex-direction:column; align-items:stretch; \}[\s\S]*?\.bookstore-catalog-pane \{ width:100%; \}/,
  "phone shelves and closed category rows must stretch across the available page width");
assert.match(app, /classList\.toggle\("has-cart", itemCount > 0\)/,
  "the storefront width must respond to actual cart state");

assert.match(html, /donor\/style\.css\?v=20260803iospolish1/,
  "the bookstore must load the updated storefront styles with a fresh immutable URL");
assert.match(html, /donor\/app\.js\?v=20260816torch1/,
  "the bookstore must load the updated storefront behavior with a fresh immutable URL");
assert.match(html, /bookstore-scan-feature-icon[\s\S]*?barcode-lines/,
  "the primary scanner card must feature a real barcode illustration");
assert.match(app, /category === "book"[\s\S]*?bookstore-category-scan[\s\S]*?startBookstoreBookScan\(\)/,
  "the Books category must expose the same scanner without requiring a scroll to the primary card");
assert.match(html, /id="bookstoreScannerTorch"[^>]*aria-pressed="false"[^>]*toggleBookstoreScannerTorch\(\)[^>]*hidden/,
  "the barcode scanner must include an initially hidden, accessible flashlight control");
assert.match(app, /getCapabilities\(\)[\s\S]*capabilities\.torch !== true[\s\S]*applyConstraints\(\{ advanced: \[\{ torch: next \}\] \}\)/,
  "the flashlight control must feature-detect torch support before changing the camera constraint");
assert.match(app, /function closeBookstoreScanner\(\)[\s\S]*track\.stop\(\)[\s\S]*resetBookstoreScannerTorchControl\(\)/,
  "closing the scanner must stop the camera and reset the flashlight control");
assert.match(html, /\.bookstore-product-media \{[^}]*flex:0 0 118px[^}]*overflow:hidden/,
  "product photos must stay inside a fixed-height media frame instead of overtaking the card");
assert.match(html, /\.bookstore-product-media img \{[^}]*object-fit:contain/,
  "product photos must preserve their full artwork while leaving title and price visible");
assert.match(html, /@supports \(-webkit-touch-callout: none\)[\s\S]*\.bookstore-product-media \{[^}]*height:128px[^}]*flex-basis:128px/,
  "iPhone storefront cards must reserve a generous, stable image frame");
assert.match(html, /@supports \(-webkit-touch-callout: none\)[\s\S]*\.bookstore-product-media img \{[^}]*width:100% !important[^}]*height:100% !important/,
  "iPhone storefront images must fill the same frame used on Android");
assert.match(app, /const description = String\(product\.description \|\| ""\)\.trim\(\);[\s\S]*?\$\{description \? `<small>/,
  "cards without descriptions must not repeat the category label beneath the title");
assert.match(html, /\.donor-bookstore-page \.my-agapay-tabbar,[\s\S]*?z-index:220;[\s\S]*?background:#fffcf6;[\s\S]*?backdrop-filter:none;/,
  "the mobile bookstore nav must remain opaque and above sticky storefront controls");
assert.match(html, /padding:10px 10px calc\(106px \+ env\(safe-area-inset-bottom\)\)/,
  "the mobile bookstore must reserve scroll clearance for the bottom nav and iOS safe area");
assert.match(app, /const key = product\.onSale \? "sale"/,
  "sale items must move into a dedicated Sale shelf");
assert.match(app, /bookstore-sale-ribbon/);
assert.match(app, /<del>\$\{formatCentsAsDollars\(product\.regularPriceCents\)\}<\/del>/,
  "sale cards must show the crossed-out regular price");

console.log("PASS - bookstore parish switching, popular items, collapsed shelves, and category icons are wired");
