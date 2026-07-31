import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [donorHandler, donorApp, accountHtml, parishApp, parishHtml, worker, googleCalendar, publicStore, publicStoreApp] = await Promise.all([
  read("src/handlers/donor.js"), read("public/donor/app.js"), read("public/myagapay/account.html"),
  read("public/parish/app.js"), read("public/parish/dashboard.html"), read("src/worker.js"),
  read("src/sacraments/google-calendar.js"), read("public/bookstore/index.html"), read("public/bookstore/app.js")
]);

assert.match(accountHtml, /name="pledgeCadence" value="annual"/);
assert.match(accountHtml, /name="pledgeCadence" value="monthly"/);
assert.match(donorApp, /summary\?\.stewardshipMonthCents/);
assert.match(donorHandler, /updated\.pledgeCadence === "monthly" \? 12 : 1/);

assert.match(worker, /\/api\/public\/bookstore\//);
assert.match(worker, /\/bookstore\/index\.html/);
assert.ok(worker.includes('^\\/[^/]+\\/bookstore\\/?$'), "the public storefront should resolve /[parish]/bookstore");
assert.match(donorHandler, /Describe every shopper-added item and choose a valid category/);
assert.ok(donorHandler.includes('`/${encodeURIComponent(resolved.parishId)}/bookstore`'));
assert.match(parishHtml, /bookstoreGuestCheckoutQr/);
assert.match(parishApp, /qrcode\(0, 'H'\)/);
assert.match(parishApp, /brandQrSvg\(rawSvg, logoHref\)/);
assert.ok(parishApp.includes("'/' + encodeURIComponent(currentParish.parishId) + '/bookstore'"));
assert.match(publicStore, /No account required/);
assert.match(publicStoreApp, /bookstorePathSegments\[1\] === "bookstore"/);

assert.match(googleCalendar, /KV_PREFIX = "__agapay_sacraments_google_calendar:"/);
assert.match(googleCalendar, /return `sac\.\$\{body\}/);
assert.match(googleCalendar, /\/api\/learn\/google-calendar\/callback/);
assert.match(googleCalendar, /syncSacramentRequestToGoogleCalendar/);
assert.match(parishApp, /<select id="sacclergy-/);
assert.match(parishApp, /Connect Google Calendar/);
assert.match(worker, /startsWith\("sac\."\)/);

console.log("Church-requested pledge, guest bookstore, and priest calendar checks passed.");
