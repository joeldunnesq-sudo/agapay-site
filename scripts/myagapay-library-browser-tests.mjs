import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const html = (await readFile(new URL('../public/myagapay/library.html', import.meta.url), 'utf8')).replace(
  /<script\b[^>]*>[\s\S]*?<\/script>/gi,
  ''
);
const script = await readFile(new URL('../public/myagapay/library.js', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [393, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 873 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    let listingMode = 'ok';
    let fileMode = 'ok';
    const requests = [];
    const resources = [
      {
        id: 'pdf/one',
        title: '<img src=x onerror=alert(1)>',
        description: 'Evening prayers',
        category: 'prayer_worship',
        resourceType: 'pdf',
        pinned: true,
      },
      {
        id: 'link',
        title: 'Welcome',
        description: 'New member guide',
        category: 'newcomers',
        resourceType: 'link',
        url: 'https://example.test/welcome',
      },
    ];
    await page.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (!url.pathname.startsWith('/api/')) return route.fulfill({ contentType: 'text/html', body: html });
      requests.push({ path: url.pathname, headers: request.headers() });
      if (url.pathname === '/api/donor/library') {
        if (listingMode === 'unauthorized') return route.fulfill({ status: 401, json: {} });
        if (listingMode === 'error') return route.fulfill({ status: 503, json: { error: 'Please retry library' } });
        if (listingMode === 'malformed')
          return route.fulfill({ status: 503, contentType: 'application/json', body: '{broken' });
        return route.fulfill({
          json: {
            available: listingMode !== 'disabled',
            parish: { name: 'Fixture Parish' },
            resources: listingMode === 'empty' ? [] : resources,
          },
        });
      }
      assert.equal(
        url.pathname,
        '/api/donor/library/pdf%2Fone/file',
        'PDF IDs must be encoded and no financial requests are allowed'
      );
      if (fileMode === 'unauthorized') return route.fulfill({ status: 401, json: {} });
      if (fileMode === 'error') return route.fulfill({ status: 403, json: { error: 'Document unavailable' } });
      return route.fulfill({ contentType: 'application/pdf', body: '%PDF-1.7\nfixture' });
    });
    await page.goto('https://agapay.test/myagapay/library');
    await page.evaluate(() => {
      window.libraryTest = { unauthorized: 0, previews: [], urls: [], revoked: [], timers: [] };
      window.MyAgapayShell = {
        authHeaders: (extra) => ({ ...extra, Authorization: 'Bearer synthetic' }),
        handleUnauthorized: (response) => {
          if (response.status !== 401) return false;
          window.libraryTest.unauthorized++;
          return true;
        },
      };
      window.open = () => {
        const preview = {
          opener: 'parent',
          closed: false,
          target: '',
          location: {
            replace: (url) => {
              preview.target = url;
            },
          },
          close: () => {
            preview.closed = true;
          },
        };
        window.libraryTest.previews.push(preview);
        return preview;
      };
      URL.createObjectURL = (blob) => {
        window.libraryTest.urls.push({ size: blob.size, type: blob.type });
        return 'blob:synthetic-library';
      };
      URL.revokeObjectURL = (url) => window.libraryTest.revoked.push(url);
      const originalTimeout = window.setTimeout;
      window.setTimeout = (callback, delay, ...args) => {
        if (delay === 60000) {
          window.libraryTest.timers.push(callback);
          return 1;
        }
        return originalTimeout(callback, delay, ...args);
      };
    });
    await page.addScriptTag({ content: script });
    await page.evaluate(() => document.dispatchEvent(new Event('DOMContentLoaded')));
    await page.waitForFunction(() => document.querySelectorAll('.library-card').length === 2);
    assert.equal(await page.locator('#libraryParishName').textContent(), 'Fixture Parish');
    assert.equal(await page.locator('#libraryGrid img').count(), 0);
    assert.equal(await page.locator('.library-card h2').first().textContent(), '<img src=x onerror=alert(1)>');
    assert.equal(await page.locator('.is-pinned').count(), 1);
    assert.equal(
      await page.locator('a[href="https://example.test/welcome"]').getAttribute('rel'),
      'noopener noreferrer'
    );
    await page.locator('#librarySearch').fill('  EVENING  ');
    assert.equal(await page.locator('.library-card').count(), 1);
    await page.locator('#libraryCategory').selectOption('newcomers');
    assert.match(await page.locator('#libraryGrid').textContent(), /No resources match your search/);
    await page.locator('#librarySearch').fill('');
    assert.equal(await page.locator('.library-card h2').textContent(), 'Welcome');
    await page.locator('#libraryCategory').selectOption('');
    await page.locator('[data-library-pdf] svg').click();
    await page.waitForFunction(() => window.libraryTest.previews[0]?.target === 'blob:synthetic-library');
    assert.deepEqual(
      await page.evaluate(() => ({ opener: window.libraryTest.previews[0].opener, urls: window.libraryTest.urls })),
      { opener: null, urls: [{ size: 16, type: 'application/pdf' }] }
    );
    await page.evaluate(() => window.libraryTest.timers.forEach((callback) => callback()));
    assert.deepEqual(await page.evaluate(() => window.libraryTest.revoked), ['blob:synthetic-library']);
    fileMode = 'error';
    await page.evaluate(() => openLibraryPdf('pdf/one'));
    assert.equal(await page.locator('#libraryStatus').textContent(), 'Document unavailable');
    assert.equal(await page.evaluate(() => window.libraryTest.previews.at(-1).closed), true);
    fileMode = 'unauthorized';
    await page.evaluate(() => openLibraryPdf('pdf/one'));
    assert.equal(await page.evaluate(() => window.libraryTest.previews.at(-1).closed), true);
    listingMode = 'error';
    await page.evaluate(() => loadLibrary());
    assert.equal(await page.locator('#libraryStatus').textContent(), 'Please retry library');
    assert.equal(await page.locator('#libraryStatus').getAttribute('data-state'), 'error');
    listingMode = 'malformed';
    await page.evaluate(() => loadLibrary());
    assert.equal(await page.locator('#libraryStatus').textContent(), 'Unable to load the Parish Library.');
    listingMode = 'empty';
    await page.evaluate(() => loadLibrary());
    assert.match(await page.locator('#libraryGrid').textContent(), /Your parish library is ready/);
    assert.equal(await page.locator('#libraryStatus').isHidden(), true);
    listingMode = 'unauthorized';
    await page.evaluate(() => loadLibrary());
    assert.equal(await page.evaluate(() => window.libraryTest.unauthorized), 2);
    assert.ok(requests.every((request) => request.headers.authorization === 'Bearer synthetic'));
    listingMode = 'disabled';
    await Promise.all([page.waitForURL('**/myagapay/dashboard'), page.evaluate(() => loadLibrary())]);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(
    'PASS - mobile/desktop Library search, filters, escaping, private PDF fetch/cleanup, failure/retry, expired sessions and unavailable-library redirect'
  );
} finally {
  await browser.close();
}
