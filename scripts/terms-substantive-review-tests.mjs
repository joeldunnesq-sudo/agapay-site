import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { REGISTRATION_TERMS_VERSION, REGISTRATION_PRIVACY_NOTICE_VERSION } from "../src/lib/registration-intake.js";
import { CURRENT_TERMS_VERSION, CURRENT_PRIVACY_NOTICE_VERSION } from "../src/lib/legal-acceptance.js";

const terms = await readFile(new URL("../public/terms.html", import.meta.url), "utf8");
const privacy = await readFile(new URL("../public/privacy.html", import.meta.url), "utf8");

const expectedSections = [
  "acceptance", "definitions", "eligibility", "services", "canonical", "donations", "fees",
  "commerce-merchant-of-record", "tax", "privacy", "organization-responsibilities", "community-features",
  "learn", "accounting", "third-parties", "conduct", "liturgical", "ip", "termination", "warranties",
  "liability", "indemnification", "updates", "arbitration", "governing", "general", "contact"
];

assert.equal(REGISTRATION_TERMS_VERSION, CURRENT_TERMS_VERSION, "registration and acceptance must record the same Terms version");
assert.equal(CURRENT_TERMS_VERSION, "2026-08-30");
assert.equal(REGISTRATION_PRIVACY_NOTICE_VERSION, CURRENT_PRIVACY_NOTICE_VERSION);
assert.equal(CURRENT_PRIVACY_NOTICE_VERSION, "2026-08-30");
assert.match(terms, /Last updated: August 30, 2026[\s\S]*Effective for existing Users upon affirmative acceptance, no earlier than September 29, 2026/);
assert.match(privacy, /Last updated: August 30, 2026[\s\S]*Effective for existing Users upon notice, no earlier than September 29, 2026/);
assert.match(terms, /AGAPAY, a Texas sole proprietorship operating under the AGAPAY name/);

const tocIds = [...terms.matchAll(/<li><a href="#([^"]+)"><span class="num">\d{2}<\/span>/g)].map((match) => match[1]);
const sectionIds = [...terms.matchAll(/<section class="section" id="([^"]+)">/g)].map((match) => match[1]);
assert.deepEqual(tocIds, expectedSections, "Terms contents must list every substantive section in order");
assert.deepEqual(sectionIds, expectedSections, "Terms must contain every substantive section in order");

const sectionNumbers = [...terms.matchAll(/<span class="section-num">Section (\d+)<\/span>/g)].map((match) => Number(match[1]));
assert.deepEqual(sectionNumbers, expectedSections.map((_, index) => index + 1), "Terms section numbers must stay sequential");

assert.match(terms, /These Terms do not waive or restrict any non-waivable right[\s\S]*good-faith dispute/);
assert.match(terms, /guest Transaction[\s\S]*does not treat the Transaction alone as affirmative acceptance/);
assert.match(terms, /recurring schedule at checkout[\s\S]*cancel through supported account or Stripe billing tools/);
assert.match(terms, /no-card introductory demo ends automatically[\s\S]*does not silently convert into a paid Subscription/);
assert.match(terms, /Stripe Connected Account Agreement/);
assert.match(terms, /YouTube-hosted video—even Unlisted—does not carry that same guarantee|Unlisted videos can be watched by anyone with the link/);
assert.match(terms, /AGAPAY is not a school, teacher, accreditor/);
assert.match(terms, /software, not professional accounting, legal, tax, audit, payroll, or investment services/);
assert.match(terms, /30-day good-faith informal-resolution process/);
assert.match(terms, /Small claims[\s\S]*court of limited jurisdiction/);
assert.match(terms, /Court proceedings[\s\S]*appropriate state or federal court/);
assert.match(terms, /Voluntary alternatives after a dispute[\s\S]*separate writing/);
assert.match(terms, /Regulatory and non-waivable rights/);
assert.doesNotMatch(terms, /AAA Consumer Arbitration Rules|AAA Commercial Arbitration Rules|ARBITRATION OPT OUT/);
assert.doesNotMatch(terms, /YOU AND AGAPAY AGREE THAT EACH MAY BRING CLAIMS/);
assert.match(terms, /Service by email accepted/);
assert.match(terms, /SERVICE OF PROCESS/);
assert.match(terms, /Delivery is deemed accepted when AGAPAY sends that written acknowledgment/);
assert.match(terms, /court requires a signed waiver, court order, sworn filing, personal service, or another formality/);
assert.match(privacy, /governed by Section 24 of the[\s\S]*Terms of Service/);
assert.match(privacy, /does not require arbitration or a class-action waiver/);

// Public notices must distinguish the released export feature from unapproved closure.
for (const notice of [terms, privacy]) {
  assert.match(notice, /Parish data exports are available\. Automatic parish closure and deletion are not enabled\./);
  assert.match(notice, /Preparing or downloading an export does not cancel billing, close the parish account, or delete parish data\./);
  assert.match(notice, /CSV and JSON[\s\S]*manifest[\s\S]*exclusions/);
  assert.match(notice, /Authentication credentials, independent donor accounts, parent-owned Learn records, and other parishes' private data are excluded/);
  assert.match(notice, /seven days after the request/);
}
assert.match(terms, /id="data-portability"/);
assert.match(terms, /href="\/privacy#parish-data-portability"/);
assert.match(terms, /Publishing this notice does not approve the draft closure retention schedule/);
assert.match(privacy, /id="parish-data-portability"/);
assert.match(privacy, /expiration of access is not a claim that every stored or recovery copy was erased/);
assert.match(privacy, /preserve the newest recovery copy/);
assert.match(privacy, /replaying the independent closure record before restored service resumes/);
assert.match(privacy, /A review date is not confirmation of automatic deletion/);
assert.match(privacy, /does not replace the retention periods above with that draft schedule/);
assert.match(privacy, /disabled automated workflow does not suspend an individual's privacy rights/);
assert.match(privacy, /do not need parish administrator access to submit an individual request/);
assert.match(privacy, /Records independently held by Stripe[\s\S]*does not itself erase those copies/);

console.log("Terms substantive-review regression tests passed.");
