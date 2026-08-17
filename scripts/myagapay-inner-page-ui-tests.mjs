import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const sharedCss = await read("public/myagapay/koinonia-inner.css");
const koinoniaPages = ["feed", "news", "groups", "teaching", "media", "signups", "exchange"];
const productPages = ["bookstore", "directory", "sacraments"];

for (const pageName of [...koinoniaPages, ...productPages]) {
  const html = await read(`public/myagapay/${pageName}.html`);
  assert.match(html, /\/myagapay\/koinonia-inner\.css\?v=20260817compact1/, `${pageName} must load the shared app-like inner-page frame`);
  assert.match(html, /class="koinonia-mobile-appbar"/, `${pageName} must show the compact My AGAPAY mobile app bar`);
  assert.match(html, /class="koinonia-page-heading(?: [^"]*)?"/, `${pageName} must use the compact cream heading`);
  assert.match(html, /class="koinonia-page-back"[^>]*data-parish-life-back/, `${pageName} must prevent the shared shell from injecting a duplicate back control`);
}

for (const pageName of koinoniaPages) {
  const html = await read(`public/myagapay/${pageName}.html`);
  assert.match(html, /class="koinonia-page-back"[^>]*>[\s\S]*?Koinonia<\/a>/, `${pageName} must return to Koinonia`);
  assert.doesNotMatch(html, /koinonia-feature-hero|koinonia-screen-head/, `${pageName} must not retain an oversized or legacy feature hero`);
}

assert.doesNotMatch(await read("public/myagapay/bookstore.html"), /class="bookstore-store-hero"/, "Bookstore must not retain its blue promotional hero");
assert.doesNotMatch(await read("public/myagapay/directory.html"), /class="directory-top cal-hero myagapay-page-hero"/, "Directory must not retain its blue promotional hero");
assert.doesNotMatch(await read("public/myagapay/sacraments.html"), /class="cal-hero myagapay-page-hero"/, "Sacraments must not retain its blue promotional hero");
assert.match(await read("public/myagapay/prayer-requests.html"), /class="prayer-page-back"[^>]*>[\s\S]*?Koinonia<\/a>/, "Prayer Requests back label must say Koinonia");

assert.match(sharedCss, /\.koinonia-mobile-appbar \{ display:none;/, "the shared frame must keep the app bar mobile-only");
assert.match(sharedCss, /\.koinonia-page-heading \{[^}]*background:#fffdf8;/, "the shared frame must use the Prayer Requests cream heading");
assert.match(sharedCss, /grid-template-columns:minmax\(0,1fr\); align-content:start;/, "the shared frame must prevent stretched grid rows");

console.log("PASS - Koinonia and core My AGAPAY destinations share the compact Prayer Requests inner-page UI");
