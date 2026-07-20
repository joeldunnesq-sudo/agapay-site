import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("public/myagapay/directory.html", "utf8");

assert.match(page, /class="directory-mobile-header"/);
assert.match(page, /My AGAPAY Directory/);
assert.match(page, /class="directory-mobile-nav"/);
assert.match(page, /data-mobile-target="browse"/);
assert.match(page, /data-mobile-target="add"/);
assert.match(page, /data-mobile-target="household"/);
assert.match(page, />Add Household</);
assert.match(page, />Household Info</);
assert.match(page, /grid-template-columns:68px minmax\(0,1fr\)/);
assert.match(page, /directory-profile-open/);
assert.match(page, /data-reveal-directory-contact/);
assert.match(page, /body\.donor-directory-page \.mobile-tabbar \{ display:none !important; \}/);
assert.match(page, /font-family:"Cormorant Garamond"/);
assert.match(page, /background:linear-gradient\(160deg,#061522 0%,#0b2130 100%\)/);

console.log("PASS - Canonical mobile Directory header, photo-led cards, detail privacy, navigation, and AGAPAY visual system");
