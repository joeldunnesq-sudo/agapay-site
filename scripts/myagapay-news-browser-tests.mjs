import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// Real page markup and generated classic script, synthetic authenticated API responses.
const html = (await readFile(new URL('../public/myagapay/news.html', import.meta.url), 'utf8')).replace(
  /<script\b[^>]*>[\s\S]*?<\/script>/gi,
  ''
);
const script = await readFile(new URL('../public/myagapay/news.js', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 393, height: 873 }, isMobile: true });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let followed = true;
  let custom = [];
  let failMutation = false;
  let unauthorized = false;
  let malformed = false;
  const requests = [];
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) return route.fulfill({ contentType: 'text/html', body: html });
    requests.push({
      path: url.pathname + url.search,
      method: request.method(),
      body: request.postDataJSON(),
      auth: request.headers().authorization,
    });
    if (unauthorized) return route.fulfill({ status: 401, json: { error: 'Expired session' } });
    if (malformed) return route.fulfill({ contentType: 'application/json', body: '{broken' });
    if (request.method() !== 'GET' && failMutation)
      return route.fulfill({ status: 503, json: { error: 'Please retry' } });
    if (url.pathname === '/api/donor/dashboard') {
      assert.equal(url.search, '?view=context', 'News must not wait for financial reconciliation');
      return route.fulfill({ json: { parish: { name: 'Fixture Parish' } } });
    }
    if (url.pathname.startsWith('/api/donor/custom-news-feeds')) {
      if (request.method() === 'POST')
        custom = [
          {
            sourceKey: 'custom:one',
            sourceLabel: 'Custom',
            custom: true,
            id: 'one',
            available: true,
            subscribed: true,
            posts: [],
          },
        ];
      if (request.method() === 'DELETE') custom = [];
      return route.fulfill({ json: { feeds: custom } });
    }
    const sourceKey = url.pathname.split('/').pop();
    if (sourceKey === 'oca') {
      if (request.method() === 'PATCH') followed = request.postDataJSON().subscribed;
      return route.fulfill({
        json: {
          sourceKey,
          available: true,
          subscribed: followed,
          posts: [
            { title: 'Older', publishedAt: '2026-10-01', url: 'https://example.test/old' },
            {
              title: '<img src=x onerror=alert(1)>',
              excerpt: '<script>bad()</script>',
              publishedAt: '2026-10-13',
              url: 'https://example.test/new',
            },
          ],
        },
      });
    }
    return route.fulfill({ status: 503, json: { error: 'Unavailable source' } });
  });
  await page.goto('https://agapay.test/myagapay/news');
  await page.evaluate(() => {
    window.unauthorizedCount = 0;
    window.MyAgapayShell = {
      authHeaders: (extra) => ({ ...extra, Authorization: 'Bearer synthetic' }),
      handleUnauthorized: (response) => {
        if (response.status !== 401) return false;
        window.unauthorizedCount++;
        return true;
      },
    };
  });
  await page.addScriptTag({ content: script });
  await page.evaluate(() => loadNews());
  assert.equal(await page.locator('#newsParishName').textContent(), 'Fixture Parish');
  assert.deepEqual(await page.locator('#newsArticleList strong').allTextContents(), [
    '<img src=x onerror=alert(1)>',
    'Older',
  ]);
  assert.equal(await page.locator('#newsArticleList img, #newsArticleList script').count(), 0);
  assert.equal(await page.locator('#newsArticleList a').first().getAttribute('rel'), 'noopener noreferrer');
  await page.evaluate(() => setNewsFilter('oca'));
  failMutation = true;
  await page.evaluate(() => toggleNewsSource(document.querySelector('[data-source-key="oca"]')));
  assert.equal(await page.locator('#newsStatus').textContent(), 'Please retry');
  assert.equal(await page.locator('[data-source-key="oca"]').isDisabled(), false);
  failMutation = false;
  await page.evaluate(() => toggleNewsSource(document.querySelector('[data-source-key="oca"]')));
  assert.match(await page.locator('#newsArticleList').textContent(), /Your news feed is empty/);
  assert.equal(await page.evaluate(() => newsState.filter), 'all');
  assert.deepEqual(requests.find((request) => request.method === 'PATCH').body, { subscribed: false });
  await page.locator('#customNewsFeedUrl').fill('https://example.test/feed');
  await page.evaluate(async () => {
    const form = document.querySelector('.news-custom-feed-form');
    await addCustomNewsSource({ preventDefault() {}, currentTarget: form });
  });
  assert.equal(await page.locator('#customNewsFeedUrl').inputValue(), '');
  assert.match(await page.locator('#newsArticleList').textContent(), /No recent articles/);
  assert.deepEqual(requests.find((request) => request.method === 'POST').body, { url: 'https://example.test/feed' });
  await page.evaluate(() => removeCustomNewsSource(document.querySelector('[data-custom-feed-id="one"]')));
  assert.equal(await page.locator('[data-custom-feed-id]').count(), 0);
  assert.ok(requests.some((request) => request.method === 'DELETE' && request.path.endsWith('/one')));
  malformed = true;
  await page.evaluate(() => loadNews());
  assert.match(await page.locator('#newsArticleList').textContent(), /Your news feed is empty/);
  malformed = false;
  unauthorized = true;
  await page.evaluate(() => loadNews());
  assert.equal(await page.evaluate(() => window.unauthorizedCount), 8);
  assert.ok(requests.every((request) => request.auth === 'Bearer synthetic'));
  assert.deepEqual(errors, []);
  console.log(
    'PASS - mobile News context-only loading, partial/malformed feeds, escaping/order, filter reset, mutation failure/retry, custom feed lifecycle, and expired sessions'
  );
} finally {
  await browser.close();
}
