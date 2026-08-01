import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [dashboard, app] = await Promise.all([
  readFile(new URL("../public/parish/dashboard.html", import.meta.url), "utf8"),
  readFile(new URL("../public/parish/app.js", import.meta.url), "utf8"),
]);

const parishGroupStart = dashboard.indexOf('id="nav-tier-parish"');
const settingsStart = dashboard.indexOf('id="nav-settings"');
assert.ok(parishGroupStart > dashboard.indexOf('id="nav-bookstore"'), "the Parish tier group must follow the lower subscription tiers");
assert.ok(settingsStart > parishGroupStart, "Settings must follow the Parish tier group");

const parishGroupSource = dashboard.slice(parishGroupStart, settingsStart);
const parishItems = [...parishGroupSource.matchAll(/class="sidebar-nav-item"[^>]*id="(nav-[^"]+)"/g)].map((match) => match[1]);
assert.deepEqual(parishItems, [
  "nav-sacraments",
  "nav-directory",
  "nav-communications",
  "nav-accounting",
  "nav-text",
], "Koinonia must sit directly after Directory and before Accounting");

assert.match(app, /const parishOrder = \['sacraments', 'directory', 'communications', 'accounting', 'text'\]/, "runtime ordering must place Koinonia after Directory and before Accounting");
assert.match(app, /parishOrder\.forEach[\s\S]*parishGroup\.appendChild\(item\)[\s\S]*sidebar\.appendChild\(parishGroup\)/, "runtime ordering must keep all Parish items inside the labeled group");

console.log("PASS - Koinonia remains after Directory and before Accounting in the Parish tier group");
