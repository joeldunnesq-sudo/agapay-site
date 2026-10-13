import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 393, height: 873 }, isMobile: true, serviceWorkers: 'block' });
  let releaseContext;
  let contextStarted;
  let financialRequests = 0;
  const started = new Promise(resolve => { contextStarted = resolve; });
  const release = new Promise(resolve => { releaseContext = resolve; });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/donor/dashboard') {
      if (url.searchParams.get('view') !== 'context') {
        financialRequests++;
        return route.fulfill({ status: 503, json: { error: 'Financial reconciliation is stalled' } });
      }
      contextStarted();
      await release;
      return route.fulfill({ json: { donor: { email: 'member@example.test' }, parish: { id: 'fixture', name: 'Test Parish', parishLifeLabel: 'Today', communicationsEnabled: false, parishLifeAvailable: false } } });
    }
    if (url.pathname.endsWith('.js')) return route.fulfill({ contentType: 'text/javascript', body: await readFile(new URL('../public' + url.pathname, import.meta.url)) });
    if (url.pathname === '/myagapay/news') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html data-myagapay-hydrate><head><script src="/donor/session.js"></script><script src="/myagapay-shell.js"></script></head><body><main>News</main></body></html>' });
    return route.fulfill({ status: 204, body: '' });
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('agapayDonorEmail', 'member@example.test');
    localStorage.setItem('agapayDonorToken', 'synthetic-token');
  });
  await page.goto('https://agapay.test/myagapay/news');
  await started;
  assert.equal(await page.evaluate(() => document.documentElement.dataset.myagapayPageReady), 'false', 'Do not reveal before authoritative context');
  releaseContext();
  await page.waitForFunction(() => document.documentElement.dataset.myagapayPageReady === 'true', null, { timeout: 3000 });
  assert.equal(financialRequests, 0, 'Navigation must not request giving reconciliation');
  await page.addScriptTag({ content: await readFile(new URL('../public/scripts/consumer-passkeys.js', import.meta.url), 'utf8') });
  const cancelled = await page.evaluate(async () => {
    window.PublicKeyCredential = function () {};
    Object.defineProperty(navigator, 'credentials', { configurable: true, value: { get: () => { throw new Error('Aborted options must never reach credential prompt'); } } });
    let sawSignal = false;
    window.fetch = (_url, options) => new Promise((_resolve, reject) => {
      sawSignal = Boolean(options.signal);
      options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    });
    const controller = new AbortController();
    const result = window.AgapayPasskeys.authenticate({ mediation: 'conditional', signal: controller.signal }).catch(error => error.name);
    controller.abort();
    return { sawSignal, result: await Promise.race([result, new Promise(resolve => setTimeout(() => resolve('still blocked'), 500))]) };
  });
  assert.deepEqual(cancelled, { sawSignal: true, result: 'AbortError' });
  console.log('PASS - mobile shell reveals after authenticated context without financial requests; passkey network cancellation settles immediately');
} finally { await browser.close(); }
