import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../public/myagapay/index.html", import.meta.url), "utf8");
const shell = await readFile(new URL("../public/myagapay-shell.js", import.meta.url), "utf8");
const parishDashboard = await readFile(new URL("../public/parish/dashboard.html", import.meta.url), "utf8");
const desktopNav = html.match(/<nav class="nav unified-product-nav"[\s\S]*?<\/nav>/)?.[0] || "";
const shellDirectoryIcon = shell.match(/directory: '(<svg[^']+<\/svg>)'/)?.[1].replace(' aria-hidden="true"', "");
const dashboardDirectoryIcon = parishDashboard.match(/id="nav-directory">\s*(<svg[^]*?<\/svg>)/)?.[1];

assert.match(desktopNav, /href="\/myagapay\/parish-life"[^>]*data-parish-life-link[\s\S]*data-parish-life-label>Today</);
assert.doesNotMatch(desktopNav, /href="\/myagapay\/(?:feed|groups|giving\/calendar)"/);
assert.equal((shell.match(/id: "parish-life"/g) || []).length, 1, "there must be one global parish landing product");
assert.doesNotMatch(shell, /id: "today"/);
assert.match(shell, /communicationsEnabled \? "Koinonia" : "Today"/);
assert.match(shell, /byId\.get\("parish-life"\)/);
assert.match(shell, /pathname\.startsWith\("\/myagapay\/calendar"\)[\s\S]*return "parish-life"/);
assert.match(shell, /function ensureParishLifeBackLink[\s\S]*href = "\/myagapay\/parish-life"/);
assert.doesNotMatch(shell.match(/function products\(\) \{[\s\S]*?return items;/)?.[0] || "", /id: "(?:feed|groups)"/);
assert.doesNotMatch(html, /data-parish-life-section/, "the My AGAPAY homepage must not repeat Koinonia as a content card");
assert.match(shell, /id: "giving"[^\n]*icon: icons\.home/, "the Home bottom-nav item must use the house icon");
assert.match(shell, /parishLife: '[^']*<circle cx="12" cy="7" r="3"\/>[^']*<circle cx="5\.5" cy="9" r="2\.2"\/>[^']*<circle cx="18\.5" cy="9" r="2\.2"\/>/, "the Koinonia bottom-nav item must depict three people");
assert.equal(shellDirectoryIcon, dashboardDirectoryIcon, "the My AGAPAY and Parish Dashboard Directory icons must match");

console.log("My AGAPAY tier-aware single parish landing navigation tests: PASS");
