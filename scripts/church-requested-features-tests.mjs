import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [donorHandler, donorApp, accountHtml, parishCore, sacramentsFeature, parishHtml, worker, googleCalendar, publicStore, publicStoreApp] = await Promise.all([
  read("src/handlers/donor.js"), read("public/donor/app.js"), read("public/myagapay/account.html"),
  read("public/parish/app.js"), read("public/parish/features/sacraments.js"), read("public/parish/dashboard.html"), read("src/worker.js"),
  read("src/sacraments/google-calendar.js"), read("public/bookstore/index.html"), read("public/bookstore/app.js")
]);
const parishApp = `${parishCore}\n${sacramentsFeature}`;
const workerRoutes = `${await read("src/routes/donor.js")}\n${await read("src/routes/learn.js")}`;

assert.match(accountHtml, /name="pledgeCadence" value="annual"/);
assert.match(accountHtml, /name="pledgeCadence" value="monthly"/);
assert.match(donorApp, /summary\?\.stewardshipMonthCents/);
assert.match(donorHandler, /updated\.pledgeCadence === "monthly" \? 12 : 1/);

assert.match(workerRoutes, /\/api\/public\/bookstore\//);
assert.match(worker, /\/bookstore\/index\.html/);
assert.ok(worker.includes('^\\/[^/]+\\/bookstore\\/?$'), "the public storefront should resolve /[parish]/bookstore");
assert.match(donorHandler, /Describe every shopper-added item and choose a valid category/);
assert.ok(donorHandler.includes('`/${encodeURIComponent(resolved.parishId)}/bookstore`'));
assert.match(parishHtml, /bookstoreGuestCheckoutQr/);
assert.match(parishHtml, /class="pdx-hero-qr bookstore-hero-qr"/);
assert.doesNotMatch(parishHtml, /id="bookstoreGuestCheckoutCard"/);
assert.match(parishApp, /qrcode\(0, 'H'\)/);
assert.match(parishApp, /brandQrSvg\(rawSvg, logoHref\)/);
assert.match(parishApp, /function downloadBookstoreGuestCheckoutQrPng\(\)/);
assert.match(parishApp, /function downloadBookstoreGuestCheckoutQrSvg\(\)/);
assert.match(parishApp, /bookstore-checkout-qr\.\$\{extension\}/);
assert.ok(parishApp.includes("'/' + encodeURIComponent(currentParish.parishId) + '/bookstore'"));

assert.match(parishHtml, /downloadBulletinPng\(\); return false;">Download bulletin PNG/);
assert.match(parishHtml, /downloadBulletinSvg\(\); return false;">Download bulletin SVG/);
assert.doesNotMatch(parishHtml, /id="bulletinInsertTitle"/);

const bulletinPositionStart = parishApp.indexOf("function positionBulletinQr");
const bulletinPositionEnd = parishApp.indexOf("function buildBulletinSvg", bulletinPositionStart);
assert.ok(bulletinPositionStart >= 0 && bulletinPositionEnd > bulletinPositionStart, "bulletin QR positioning helper should exist");
const positionBulletinQr = new Function(`${parishApp.slice(bulletinPositionStart, bulletinPositionEnd)}; return positionBulletinQr;`)();
const positionedBulletinQr = positionBulletinQr(
  '<svg xmlns="http://www.w3.org/2000/svg" width="211px" height="211px" viewBox="0 0 211 211" preserveAspectRatio="xMinYMin meet"><path d="M0 0h1v1z"/></svg>',
  289,
  94,
  96
);
const positionedBulletinQrRoot = positionedBulletinQr.match(/^<svg\b[^>]*>/)?.[0] || "";
assert.equal((positionedBulletinQrRoot.match(/\spreserveAspectRatio=/g) || []).length, 1, "bulletin QR SVG must not contain duplicate preserveAspectRatio attributes");
assert.match(positionedBulletinQrRoot, /x="289" y="94" width="96" height="96" preserveAspectRatio="xMidYMid meet"/);
assert.match(parishApp, /font-size="24"[^>]*>Give with gratitude\.<\/text>/, "bulletin headline should remain inside the copy column beside the QR panel");
assert.match(publicStore, /No account required/);
assert.match(publicStoreApp, /bookstorePathSegments\[1\] === "bookstore"/);

assert.match(googleCalendar, /KV_PREFIX = "__agapay_sacraments_google_calendar:"/);
assert.match(googleCalendar, /return `sac\.\$\{body\}/);
assert.match(googleCalendar, /\/api\/learn\/google-calendar\/callback/);
assert.match(googleCalendar, /syncSacramentRequestToGoogleCalendar/);
assert.match(parishApp, /<select id="sacclergy-/);
assert.match(parishApp, /Connect Google Calendar/);
assert.match(workerRoutes, /startsWith\('sac\.'\)/);

console.log("Church-requested pledge, guest bookstore, and priest calendar checks passed.");
