import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

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

function deferred() {
  let resolve;
  const promise = new Promise((next) => { resolve = next; });
  return { promise, resolve };
}

async function renderShellBeforeCapabilities(parish) {
  const dashboard = deferred();
  const parishLifeLabel = { textContent: "Today", hidden: false };
  const parishLifeLink = { textContent: "Today", hidden: false };
  let domReady;
  const documentElement = { dataset: {} };
  const document = {
    body: { classList: { contains() { return false; }, toggle() {} } },
    documentElement,
    addEventListener(type, listener) {
      if (type === "DOMContentLoaded") domReady = listener;
    },
    getElementById(id) { return ["myAgapayIosBackStyles", "myAgapayIosBack"].includes(id) ? {} : null; },
    querySelector() { return null; },
    querySelectorAll(selector) {
      if (selector === "[data-parish-life-link], [data-parish-life-section]") return [parishLifeLink];
      if (selector === "[data-parish-life-label]") return [parishLifeLabel];
      return [];
    },
  };
  const storage = {
    getItem(key) {
      if (key === "agapayDonorEmail") return "member@example.test";
      if (key === "agapayDonorToken") return "test-token";
      return "";
    },
    removeItem() {},
  };
  const location = {
    href: "https://agapay.test/myagapay/index.html",
    origin: "https://agapay.test",
    pathname: "/myagapay/index.html",
    replace() {},
  };
  const window = {
    location,
    localStorage: storage,
    navigator: { userAgent: "test", platform: "Win32", maxTouchPoints: 0 },
    matchMedia: () => ({ matches: true, addEventListener() {} }),
    addEventListener() {},
    dispatchEvent() {},
  };
  const sandbox = {
    console,
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    URL,
    document,
    fetch: () => dashboard.promise,
    localStorage: storage,
    navigator: window.navigator,
    window,
  };
  vm.runInNewContext(shell, sandbox);
  domReady();

  assert.equal(parishLifeLabel.textContent, "", "the unresolved nav label must be empty in the actual initial DOM");
  assert.equal(parishLifeLink.hidden, true, "the unresolved parish-life item must be hidden");
  assert.equal(window.MyAgapayShell.capabilitiesLoaded(), false);
  assert.doesNotMatch(window.MyAgapayShell.productNav(), /href="\/myagapay\/parish-life"/, "generated nav must defer parish-life until capabilities resolve");

  dashboard.resolve({ ok: true, status: 200, json: async () => ({ parish }) });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  return { label: parishLifeLabel, link: parishLifeLink, shell: window.MyAgapayShell };
}

const parishTier = await renderShellBeforeCapabilities({ communicationsEnabled: true, parishLifeLabel: "Koinonia" });
assert.equal(parishTier.label.textContent, "Koinonia");
assert.equal(parishTier.link.hidden, false);
assert.equal(parishTier.shell.capabilitiesLoaded(), true);
assert.match(parishTier.shell.productNav(), />Koinonia</);
assert.equal(parishTier.label.textContent, "Koinonia", "the resolved label must remain stable after subsequent nav renders");

const lowerTier = await renderShellBeforeCapabilities({ communicationsEnabled: false, parishLifeLabel: "Today" });
assert.equal(lowerTier.label.textContent, "Today");
assert.equal(lowerTier.link.hidden, false);
assert.equal(lowerTier.shell.capabilitiesLoaded(), true);
assert.match(lowerTier.shell.productNav(), />Today</);

console.log("My AGAPAY tier-aware single parish landing navigation tests: PASS");
