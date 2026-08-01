import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../public/myagapay/index.html", import.meta.url), "utf8");
const shell = await readFile(new URL("../public/myagapay-shell.js", import.meta.url), "utf8");
const desktopNav = html.match(/<nav class="nav unified-product-nav"[\s\S]*?<\/nav>/)?.[0] || "";

assert.match(desktopNav, /href="\/myagapay\/parish-life"[^>]*data-parish-life-link[\s\S]*data-parish-life-label>Today</);
assert.doesNotMatch(desktopNav, /href="\/myagapay\/(?:feed|groups|giving\/calendar)"/);
assert.equal((shell.match(/id: "parish-life"/g) || []).length, 1, "there must be one global parish landing product");
assert.doesNotMatch(shell, /id: "today"/);
assert.match(shell, /communicationsEnabled \? "Koinonia" : "Today"/);
assert.match(shell, /byId\.get\("parish-life"\)/);
assert.match(shell, /pathname\.startsWith\("\/myagapay\/calendar"\)[\s\S]*return "parish-life"/);
assert.match(shell, /function ensureParishLifeBackLink[\s\S]*href = "\/myagapay\/parish-life"/);
assert.doesNotMatch(shell.match(/function products\(\) \{[\s\S]*?return items;/)?.[0] || "", /id: "(?:feed|groups)"/);
assert.match(html, /data-parish-life-section[\s\S]*href="\/myagapay\/parish-life"/);
assert.doesNotMatch(html, /data-parish-life-section[^]*?href="\/myagapay\/(?:feed|groups)"/);

console.log("My AGAPAY tier-aware single parish landing navigation tests: PASS");
