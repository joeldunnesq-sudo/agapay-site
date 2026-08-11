import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [referralPage, requestDemoPage, pixel, privacy, headers, core] = await Promise.all([
  readFile("public/give/get-agapay.html", "utf8"),
  readFile("public/give/request-demo.html", "utf8"),
  readFile("public/meta-pixel.js", "utf8"),
  readFile("public/privacy.html", "utf8"),
  readFile("public/_headers", "utf8"),
  readFile("src/lib/core.js", "utf8"),
]);

const pixelId = "1065546639329281";
const referralUrl = "https://agapay.app/give/request-demo?utm_source=parishioner&utm_medium=referral&utm_campaign=get_agapay";
const tagCount = (source, pattern) => [...source.matchAll(pattern)].length;

assert.equal(tagCount(pixel, /window\.fbq\("init", pixelId\)/g), 1, "Meta Pixel must initialize once in the shared loader");
assert.equal(tagCount(pixel, /window\.fbq\("track", "PageView"\)/g), 1, "PageView must fire once in the shared loader");
assert.match(pixel, new RegExp(pixelId), "shared loader must use the configured Pixel/Dataset ID");
assert.match(pixel, /https:\/\/connect\.facebook\.net\/en_US\/fbevents\.js/, "shared loader must use Meta's standard client library");
assert.match(pixel, /typeof window\.fbq !== "function"[\s\S]*catch \(_error\)/, "tracking helpers must fail silently when Meta is unavailable");

for (const [name, page] of [["referral", referralPage], ["request-demo", requestDemoPage]]) {
  assert.equal(tagCount(page, /<script src="\/meta-pixel\.js"><\/script>/g), 1, `${name} page must load the shared Pixel once`);
  assert.equal(tagCount(page, new RegExp(`facebook\\.com/tr\\?id=${pixelId}`, "g")), 1, `${name} page must have one noscript fallback`);
}

assert.equal(tagCount(referralPage, /<a\b[^>]*data-email-link[^>]*>/g), 3, "every referral email action must retain the reusable tracking hook");
assert.equal(tagCount(referralPage, /<button\b[^>]*data-copy-link[^>]*>/g), 2, "every copy action must retain the reusable tracking hook");
assert.equal(tagCount(referralPage, /<a\b[^>]*data-council-download[^>]*>/g), 3, "every council PDF link must have the reusable tracking hook");
for (const link of referralPage.match(/<a\b[^>]*href="\/downloads\/agapay-parish-council-overview\.pdf"[^>]*>/g) || []) {
  assert.match(link, /data-council-download/, "every council PDF link must be tracked");
}

assert.match(referralPage, /AGAPAYShareEmail[\s\S]*destination: "request-demo"[\s\S]*method: "email"/);
assert.match(referralPage, /AGAPAYCouncilPDF[\s\S]*file: "agapay-parish-council-overview\.pdf"/);
assert.match(referralPage, /await navigator\.clipboard\.writeText\(shareUrl\)/, "clipboard must receive the attributed referral URL");
assert.match(referralPage, /if \(copied && typeof window\.trackMetaEvent === "function"\)[\s\S]*AGAPAYCopyShareLink[\s\S]*destination: "request-demo"[\s\S]*method: "copy"/, "copy conversion must fire only after a successful copy");
assert.ok(referralPage.includes(`const shareUrl = "${referralUrl}";`), "email and clipboard sharing must use the attributed URL");
assert.match(referralPage, /The shared link is agapay\.app\/give\/request-demo/, "visible helper text must retain the clean URL");
assert.match(referralPage, /Here is the information: https:\/\/agapay\.app\/give\/request-demo<\/p>/, "visible email preview must retain the clean URL");

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
