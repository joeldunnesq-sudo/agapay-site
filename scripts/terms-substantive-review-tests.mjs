import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { REGISTRATION_TERMS_VERSION } from "../src/lib/registration-intake.js";

const terms = await readFile(new URL("../public/terms.html", import.meta.url), "utf8");
const privacy = await readFile(new URL("../public/privacy.html", import.meta.url), "utf8");

const expectedSections = [
  "acceptance", "definitions", "eligibility", "services", "canonical", "donations", "fees",
  "commerce-merchant-of-record", "tax", "privacy", "organization-responsibilities", "community-features",
  "learn", "accounting", "third-parties", "conduct", "liturgical", "ip", "termination", "warranties",
  "liability", "indemnification", "updates", "arbitration", "governing", "general", "contact"
];

assert.equal(REGISTRATION_TERMS_VERSION, "2026-08-01", "registration must record the reviewed Terms version");
assert.match(terms, /Last updated: August 1, 2026[\s\S]*Effective for existing Users: August 31, 2026/);

const tocIds = [...terms.matchAll(/<li><a href="#([^"]+)"><span class="num">\d{2}<\/span>/g)].map((match) => match[1]);
const sectionIds = [...terms.matchAll(/<section class="section" id="([^"]+)">/g)].map((match) => match[1]);
assert.deepEqual(tocIds, expectedSections, "Terms contents must list every substantive section in order");
assert.deepEqual(sectionIds, expectedSections, "Terms must contain every substantive section in order");

const sectionNumbers = [...terms.matchAll(/<span class="section-num">Section (\d+)<\/span>/g)].map((match) => Number(match[1]));
assert.deepEqual(sectionNumbers, expectedSections.map((_, index) => index + 1), "Terms section numbers must stay sequential");

assert.match(terms, /These Terms do not waive or restrict any non-waivable right[\s\S]*good-faith dispute/);
assert.match(terms, /recurring schedule at checkout[\s\S]*cancel through supported account or Stripe billing tools/);
assert.match(terms, /no-card introductory demo ends automatically[\s\S]*does not silently convert into a paid Subscription/);
assert.match(terms, /Stripe Connected Account Agreement/);
assert.match(terms, /YouTube-hosted video—even Unlisted—does not carry that same guarantee|Unlisted videos can be watched by anyone with the link/);
assert.match(terms, /AGAPAY is not a school, teacher, accreditor/);
assert.match(terms, /software, not professional accounting, legal, tax, audit, payroll, or investment services/);
assert.match(terms, /AAA Consumer Arbitration Rules[\s\S]*AAA Commercial Arbitration Rules/);
assert.match(terms, /Small claims and urgent relief/);
assert.match(terms, /Thirty-day opt-out[\s\S]*ARBITRATION OPT OUT/);
assert.match(privacy, /governed by Section 24 of the[\s\S]*Terms of Service/);
assert.doesNotMatch(privacy, /under the Commercial Arbitration Rules of the American Arbitration Association/);

console.log("Terms substantive-review regression tests passed.");
