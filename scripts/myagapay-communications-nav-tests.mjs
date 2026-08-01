import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const html = await readFile(new URL("../public/myagapay/index.html", import.meta.url), "utf8");
const shell = await readFile(new URL("../public/myagapay-shell.js", import.meta.url), "utf8");
const donorStyles = await readFile(new URL("../public/donor/style.css", import.meta.url), "utf8");
const parishDashboard = await readFile(new URL("../public/parish/dashboard.html", import.meta.url), "utf8");
const desktopNav = html.match(/<nav class="nav unified-product-nav"[\s\S]*?<\/nav>/)?.[0] || "";
const shellDirectoryIcon = shell.match(/directory: '(<svg[^']+<\/svg>)'/)?.[1].replace(' aria-hidden="true"', "");
const dashboardDirectoryIcon = parishDashboard.match(/id="nav-directory">\s*(<svg[^]*?<\/svg>)/)?.[1];
const internalNavigationClick = shell.slice(
  shell.indexOf("function handleInternalNavigationClick"),
  shell.indexOf("function syncAuthVisibility")
);

assert.match(desktopNav, /href="\/myagapay\/parish-life"[^>]*data-parish-life-link[\s\S]*data-parish-life-label>Loading…</);
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
assert.match(shell, /UX cache only:[\s\S]*must never be used as an authorization or[\s\S]*security boundary/);
assert.match(shell, /PARISH_CAPABILITIES_CACHE_MAX_AGE_MS = 5 \* 60 \* 1000/);
assert.match(donorStyles, /\.myagapay-nav-loading[\s\S]*pointer-events: none/);
assert.match(donorStyles, /body\.myagapay-navigating::before[\s\S]*height: 3px;[\s\S]*linear-gradient\(90deg, transparent, var\(--gold\), transparent\)[\s\S]*dashboard-refresh-slide 1s ease-in-out infinite/);
assert.match(donorStyles, /@keyframes dashboard-refresh-slide\s*{\s*from\s*{ transform: translateX\(-110%\); }\s*to\s*{ transform: translateX\(380%\); }\s*}/);
assert.match(donorStyles, /prefers-reduced-motion: reduce[\s\S]*myagapay-navigating::before\s*{ animation-duration: 2\.4s; }/);
assert.doesNotMatch(shell, /sessionStorage/, "cross-page state must use the established localStorage pattern");
assert.doesNotMatch(internalNavigationClick, /preventDefault\(\)/, "the progress treatment must not intercept browser navigation");

function deferred() {
  let resolve;
  const promise = new Promise((next) => { resolve = next; });
  return { promise, resolve };
}

function testElement(textContent = "Today") {
  const classes = new Set();
  const attributes = new Map();
  const styles = new Map();
  return {
    textContent,
    hidden: false,
    classList: {
      add(...names) { names.forEach((name) => classes.add(name)); },
      remove(...names) { names.forEach((name) => classes.delete(name)); },
      contains(name) { return classes.has(name); },
      toggle(name, force) {
        const enabled = force === undefined ? !classes.has(name) : Boolean(force);
        if (enabled) classes.add(name);
        else classes.delete(name);
        return enabled;
      }
    },
    style: {
      setProperty(name, value) { styles.set(name, value); },
      getPropertyValue(name) { return styles.get(name) || ""; }
    },
    setAttribute(name, value) { attributes.set(name, value); },
    removeAttribute(name) { attributes.delete(name); },
    getAttribute(name) { return attributes.get(name) || null; }
  };
}

async function renderShell({ cached = null, transitionMarker = null, referrer = "", pathname = "/myagapay/index.html" } = {}) {
  const dashboard = deferred();
  const parishLifeLabel = testElement("Today");
  const parishLifeLink = testElement("Today");
  let domReady;
  let clickListener;
  let fetchCalls = 0;
  const documentElement = { dataset: {} };
  const body = testElement("");
  const document = {
    body,
    referrer,
    documentElement,
    addEventListener(type, listener) {
      if (type === "DOMContentLoaded") domReady = listener;
      if (type === "click") clickListener = listener;
    },
    getElementById(id) { return ["myAgapayIosBackStyles", "myAgapayIosBack", "myAgapaySupportDialog"].includes(id) ? {} : null; },
    querySelector() { return null; },
    querySelectorAll(selector) {
      if (selector === "[data-parish-life-link], [data-parish-life-section]") return [parishLifeLink];
      if (selector === "[data-parish-life-label]") return [parishLifeLabel];
      return [];
    },
  };
  const values = new Map([
    ["agapayDonorEmail", "member@example.test"],
    ["agapayDonorToken", "test-token"]
  ]);
  if (cached) values.set("agapay.parishCapabilities.v1", JSON.stringify(cached));
  if (transitionMarker) values.set("agapay.navigationTransition.v1", JSON.stringify(transitionMarker));
  const removed = [];
  const storage = {
    getItem(key) { return values.get(key) || null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { removed.push(key); values.delete(key); },
  };
  const location = {
    href: `https://agapay.test${pathname}`,
    origin: "https://agapay.test",
    pathname,
    search: "",
    replace() {},
  };
  const window = {
    location,
    localStorage: storage,
    navigator: { userAgent: "test", platform: "Win32", maxTouchPoints: 0 },
    matchMedia: () => ({ matches: true, addEventListener() {} }),
    requestAnimationFrame(callback) { callback(); },
    addEventListener() {},
    dispatchEvent() {},
  };
  const sandbox = {
    console,
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    URL,
    document,
    fetch: () => { fetchCalls += 1; return dashboard.promise; },
    localStorage: storage,
    navigator: window.navigator,
    window,
  };
  vm.runInNewContext(shell, sandbox);
  const navigatingBeforeDomReady = body.classList.contains("myagapay-navigating");
  domReady();
  return { body, click: (event) => clickListener(event), dashboard, fetchCalls: () => fetchCalls, label: parishLifeLabel, link: parishLifeLink, shell: window.MyAgapayShell, storage, values, removed, documentElement, navigatingBeforeDomReady };
}

async function resolveDashboard(rendered, parish) {
  rendered.dashboard.resolve({ ok: true, status: 200, json: async () => ({ parish }) });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

const coldStart = await renderShell();
assert.equal(coldStart.fetchCalls(), 1, "cold start must begin the real dashboard request");
assert.equal(coldStart.label.textContent, "Loading…", "missing cache must show an honest loading label");
assert.equal(coldStart.link.hidden, false, "loading placeholder must occupy the parish-life nav position");
assert.equal(coldStart.link.classList.contains("sw-tool-loading"), true);
assert.equal(coldStart.link.getAttribute("aria-busy"), "true");
assert.equal(coldStart.shell.capabilitiesLoaded(), false);
assert.match(coldStart.shell.productNav(), /data-parish-life-loading[\s\S]*Loading…/);
assert.doesNotMatch(coldStart.shell.productNav(), />Koinonia<|>Today</, "cold nav must never guess an identity");
await resolveDashboard(coldStart, { communicationsEnabled: true, parishLifeLabel: "Koinonia", parishLifeAvailable: true });
assert.equal(coldStart.label.textContent, "Koinonia");
assert.equal(coldStart.link.classList.contains("sw-tool-loading"), false);
assert.equal(coldStart.link.getAttribute("aria-busy"), null);
assert.doesNotMatch(coldStart.shell.productNav(), /data-parish-life-loading|Loading…/, "resolved nav replaces the loading item in one render");
assert.match(coldStart.shell.productNav(), />Koinonia</);
assert.equal(JSON.parse(coldStart.values.get("agapay.parishCapabilities.v1")).parish.parishLifeLabel, "Koinonia");

const staleCache = await renderShell({ cached: {
  email: "member@example.test",
  cachedAt: Date.now() - (6 * 60 * 1000),
  parish: { communicationsEnabled: false, parishLifeLabel: "Today" }
} });
assert.equal(staleCache.label.textContent, "Loading…", "stale cache must not render its old label");
assert.doesNotMatch(staleCache.shell.productNav(), />Today</);

const freshCache = await renderShell({ cached: {
  email: "member@example.test",
  cachedAt: Date.now(),
  parish: { communicationsEnabled: true, parishLifeLabel: "Koinonia", parishLifeAvailable: true }
} });
assert.equal(freshCache.label.textContent, "Koinonia", "fresh cache must render before fetch resolution");
assert.equal(freshCache.shell.capabilitiesLoaded(), true);
assert.equal(freshCache.fetchCalls(), 1, "fresh cache must still start a background refresh");
assert.match(freshCache.shell.productNav(), />Koinonia</);
assert.doesNotMatch(freshCache.shell.productNav(), /Loading…/);
await resolveDashboard(freshCache, { communicationsEnabled: false, parishLifeLabel: "Today", parishLifeAvailable: true });
assert.equal(freshCache.label.textContent, "Today", "changed network data must replace cached display data");
assert.match(freshCache.shell.productNav(), />Today</);
assert.doesNotMatch(freshCache.shell.productNav(), />Koinonia</);

freshCache.shell.clearSession();
assert.equal(freshCache.values.has("agapay.parishCapabilities.v1"), false, "logout/session clear must remove the capabilities cache");
assert.ok(freshCache.removed.includes("agapay.parishCapabilities.v1"));

const directVisit = await renderShell();
assert.equal(directVisit.navigatingBeforeDomReady, false, "a direct visit must not start the progress bar");
assert.equal(directVisit.body.classList.contains("myagapay-navigating"), false);

const sourcePage = await renderShell({ pathname: "/myagapay/feed" });
const destinationLink = {
  href: "https://agapay.test/myagapay/groups",
  target: "",
  hasAttribute() { return false; }
};
sourcePage.click({
  defaultPrevented: false,
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  target: { closest() { return destinationLink; } }
});
assert.equal(sourcePage.body.classList.contains("myagapay-navigating"), true, "an internal click must start the progress bar immediately");
const clickMarker = JSON.parse(sourcePage.values.get("agapay.navigationTransition.v1"));
assert.equal(clickMarker.fromPath, "/myagapay/feed");
assert.equal(clickMarker.destinationPath, "/myagapay/groups");

const destinationPage = await renderShell({
  pathname: "/myagapay/groups",
  referrer: "https://agapay.test/myagapay/feed",
  transitionMarker: clickMarker
});
assert.equal(destinationPage.navigatingBeforeDomReady, true, "the destination must continue the click-started progress motion");
assert.match(destinationPage.body.style.getPropertyValue("--myagapay-navigation-delay"), /^-\d+ms$/, "the destination must preserve the animation phase");
assert.equal(destinationPage.body.classList.contains("myagapay-navigating"), false, "the progress bar must clear after the real cached/loading state is rendered");

const referrerWithoutClick = await renderShell({
  pathname: "/myagapay/groups",
  referrer: "https://agapay.test/myagapay/feed"
});
assert.equal(referrerWithoutClick.navigatingBeforeDomReady, false, "a referrer alone is not proof of an in-app click");

console.log("My AGAPAY tier-aware single parish landing navigation tests: PASS");
