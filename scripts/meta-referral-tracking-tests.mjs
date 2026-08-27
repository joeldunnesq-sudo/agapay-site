import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [givePage, requestDemoPage, pixel, privacy, headers, core] = await Promise.all([
  readFile("public/give/index.html", "utf8"),
  readFile("public/give/request-demo.html", "utf8"),
  readFile("public/meta-pixel.js", "utf8"),
  readFile("public/privacy.html", "utf8"),
  readFile("public/_headers", "utf8"),
  readFile("src/lib/core.js", "utf8"),
]);

const pixelId = "1065546639329281";
const tagCount = (source, pattern) => [...source.matchAll(pattern)].length;

assert.equal(tagCount(pixel, /window\.fbq\("init", pixelId\)/g), 1, "Meta Pixel must initialize once in the shared loader");
assert.equal(tagCount(pixel, /window\.fbq\("track", "PageView"\)/g), 1, "PageView must fire once in the shared loader");
assert.match(pixel, new RegExp(pixelId), "shared loader must use the configured Pixel/Dataset ID");
assert.match(pixel, /https:\/\/connect\.facebook\.net\/en_US\/fbevents\.js/, "shared loader must use Meta's standard client library");
assert.match(pixel, /typeof window\.fbq !== "function"[\s\S]*catch \(_error\)/, "tracking helpers must fail silently when Meta is unavailable");

assert.equal(tagCount(requestDemoPage, /<script src="\/meta-pixel\.js"><\/script>/g), 1, "request-demo page must load the shared Pixel once");
assert.equal(tagCount(requestDemoPage, new RegExp(`facebook\\.com/tr\\?id=${pixelId}`, "g")), 1, "request-demo page must have one noscript fallback");
assert.match(givePage, /href="\/downloads\/agapay-parish-council-overview\.pdf" download/, "the consolidated Give page must preserve the council proposal download");
assert.match(givePage, /href="\/give\/request-demo"/, "the consolidated Give page must preserve the guided-demo path");

const backendSuccessCheck = requestDemoPage.indexOf('if (!response.ok || !payload.ok) throw new Error');
const leadCall = requestDemoPage.indexOf("trackLeadOnce();", backendSuccessCheck);
assert.ok(backendSuccessCheck > -1 && leadCall > backendSuccessCheck, "Lead must fire only after backend-confirmed success");
assert.match(requestDemoPage, /trackMetaStandardEvent\("Lead", \{ content_name: "AGAPAY Parish Demo Request" \}\)/);
assert.match(requestDemoPage, /leadTracked[\s\S]*sessionStorage\.getItem\("agapayMetaDemoLeadTracked"\)[\s\S]*sessionStorage\.setItem\("agapayMetaDemoLeadTracked", "1"\)/, "Lead must be guarded against refresh or retry double-fires");
for (const key of ["utm_source", "utm_medium", "utm_campaign"]) {
  assert.match(requestDemoPage, new RegExp(key), `${key} must be preserved in the accepted contact message`);
}

assert.doesNotMatch(privacy, /We do not use Google Analytics, Meta Pixel, or comparable advertising tools/);
assert.match(privacy, /solely for its own internal (?:business|referral and campaign|campaign) analysis/);
assert.match(privacy, /AGAPAY does not sell this information/);
assert.match(privacy, /Meta Platforms, Inc\./);
assert.match(privacy, /AGAPAY does not send names, email addresses, parish names, or form-message contents through the Pixel/);
assert.match(headers, /script-src[^;]*https:\/\/connect\.facebook\.net/);
assert.match(headers, /connect-src[^;]*https:\/\/www\.facebook\.com/);
assert.match(core, /script-src[^;]*https:\/\/connect\.facebook\.net/);
assert.match(core, /connect-src[^;]*https:\/\/www\.facebook\.com/);

console.log("Meta referral and demo conversion tracking checks passed.");
