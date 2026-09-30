import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { chromium } from 'playwright';
import { appAssetUrl } from './lib/app-asset-versions.mjs';
import { repoRoot } from './lib/server-typescript.mjs';

const publicRoot = resolve(repoRoot, 'public');
const workerSource = await readFile(resolve(publicRoot, 'service-worker.js'), 'utf8');
const cacheName = workerSource.match(/const AGAPAY_CACHE = "([^"]+)"/)[1];
let previousRelease = true;
const requests = new Map();
const bookstoreUrl = appAssetUrl('/donor/bookstore-presentation.js');
const oldUrl = '/donor/bookstore-presentation.js?v=previous-release';
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  requests.set(req.url, (requests.get(req.url) || 0) + 1);
  res.setHeader('Cache-Control', 'no-store');
  if (url.pathname === '/service-worker.js') {
    res.setHeader('Content-Type', 'text/javascript');
    res.end(previousRelease ? workerSource.replace(cacheName, `${cacheName}-typescript-old`) : workerSource);
    return;
  }
  if (url.pathname === '/__typescript_test__') {
    res.setHeader('Content-Type', 'text/html');
    res.end(
      `<!doctype html><title>Browser migration fixture</title><script src="${appAssetUrl('/donor/session.js')}"></script><script src="${bookstoreUrl}"></script>`
    );
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json');
    res.end('{}');
    return;
  }
  let pathname = url.pathname;
  if (!pathname.split('/').at(-1).includes('.')) pathname += '.html';
  const file = resolve(publicRoot, `.${pathname}`);
  if (!file.startsWith(`${publicRoot}${sep}`)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const bytes = await readFile(file);
    res.setHeader(
      'Content-Type',
      file.endsWith('.js')
        ? 'text/javascript'
        : file.endsWith('.css')
          ? 'text/css'
          : file.endsWith('.html')
            ? 'text/html'
            : 'application/octet-stream'
    );
    res.end(bytes);
  } catch {
    res.writeHead(404).end();
  }
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const origin = `http://127.0.0.1:${server.address().port}`;
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${origin}/admin/login.html`);
  assert.equal(await page.evaluate(() => window.money(2500)), '$25/mo');
  assert.equal(await page.evaluate(() => window.escapeHtml('<unsafe>')), '&lt;unsafe&gt;');
  assert.equal(await page.locator('#adminToken').count(), 1);

  await page.goto(`${origin}/__typescript_test__`);
  assert.equal(await page.evaluate(() => window.formatCentsAsDollars(1250)), '$12.50');
  assert.equal(await page.evaluate('BOOKSTORE_CATEGORY_LABELS.book'), 'Book');
  await page.evaluate(
    async ({ cacheName, oldUrl }) => {
      window.AGAPAYDonorSession.saveSession({ token: 'migration-fixture', donor: { email: 'migration@example.test' } });
      await navigator.serviceWorker.register('/service-worker.js');

      const cache = await caches.open(`${cacheName}-typescript-old`);
      await cache.put(oldUrl, new Response('previous release cached asset'));
    },
    { cacheName, oldUrl }
  );
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  assert.equal(await page.evaluate(async (url) => (await fetch(url)).text(), oldUrl), 'previous release cached asset');
  const before = requests.get(bookstoreUrl) || 0;
  const expected = (await readFile(resolve(publicRoot, 'donor/bookstore-presentation.js'), 'utf8')).replaceAll(
    '\r\n',
    '\n'
  );
  const fetched = await page.evaluate(async (url) => (await fetch(url)).text(), bookstoreUrl);
  assert.equal(fetched.replaceAll('\r\n', '\n'), expected, 'new hash must not resolve to the old cached release');
  assert.equal(requests.get(bookstoreUrl), before + 1);
  await page.waitForFunction(async (url) => Boolean(await caches.match(url)), bookstoreUrl);
  await page.evaluate(async (url) => (await fetch(url)).text(), bookstoreUrl);
  assert.equal(requests.get(bookstoreUrl), before + 1, 'repeat requests use the exact cached version');

  previousRelease = false;
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
  await page.waitForFunction(async (cacheName) => {
    const names = await caches.keys();
    return names.includes(cacheName) && !names.includes(`${cacheName}-typescript-old`);
  }, cacheName);
  // Refill under the new worker, then verify a warm offline installation.
  await page.evaluate(async (url) => (await fetch(url)).text(), bookstoreUrl);
  await page.waitForFunction(async ({ cacheName, url }) => Boolean(await (await caches.open(cacheName)).match(url)), {
    cacheName,
    url: bookstoreUrl,
  });
  await context.setOffline(true);
  const offline = await page.evaluate(async (url) => (await fetch(url)).text(), bookstoreUrl);
  assert.equal(offline.replaceAll('\r\n', '\n'), expected);
  const offlineListen = await context.newPage();
  const listenResponse = await offlineListen.goto(`${origin}/listen.html`);
  assert.equal(listenResponse.status(), 200);
  assert.ok((await listenResponse.text()).includes('id="listen-app"'), 'Listen fallback must serve its own shell');
  await offlineListen.close();
  await context.setOffline(false);
  await page.reload();
  assert.equal(await page.evaluate(() => window.AGAPAYDonorSession.session().token), 'migration-fixture');
  assert.equal(await page.evaluate(() => window.AGAPAYDonorSession.session().email), 'migration@example.test');
  assert.equal(await page.evaluate(() => window.formatCentsAsDollars(1250)), '$12.50');
  assert.deepEqual(errors, []);
  console.log(
    'PASS - Admin page globals, old-cache/new-hash isolation, actual service-worker update, warm offline assets, and retained donor session'
  );
} finally {
  if (browser) await browser.close();
  server.closeAllConnections();
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}
