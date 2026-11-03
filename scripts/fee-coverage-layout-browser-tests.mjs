import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
await mkdir('output/fee-coverage-screenshots', { recursive: true });
try {
  for (const width of [390, 1280]) {
    const page = await browser.newPage({
      viewport: { width, height: 900 },
      serviceWorkers: 'block',
    });
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'demo.test') return route.fulfill({ body: '', contentType: 'text/css' });
      try {
        const p = path.resolve('public', '.' + url.pathname);
        assert.ok(p.startsWith(path.resolve('public') + path.sep));
        const body = await readFile(p);
        return route.fulfill({
          body,
          contentType: p.endsWith('.css') ? 'text/css' : p.endsWith('.js') ? 'text/javascript' : 'text/html',
        });
      } catch {
        return route.fulfill({ status: 404, body: '' });
      }
    });
    for (const [name, file] of [
      ['form', 'give/form.html'],
      ['embed', 'give/embed.html'],
      ['donor', 'donor/give.html'],
      ['myagapay', 'myagapay/giving/give.html'],
      ['campaign', 'give/parish-giving/index.html'],
    ]) {
      let html = await readFile('public/' + file, 'utf8');
      html = html.replace(
        '<head>',
        '<head><meta http-equiv="Content-Security-Policy" content="script-src &#39;none&#39;"><base href="https://demo.test/' +
          file +
          '">'
      );
      await page.setContent(html);
      if (name === 'campaign') await page.locator('#campaignContent').evaluate((el) => (el.hidden = false));
      const note = page.locator('#feeTaxNote');
      await note.scrollIntoViewIfNeeded();
      assert.equal(await note.isVisible(), true, name);
      const bounds = await note.boundingBox();
      assert.ok(bounds.x >= -1 && bounds.x + bounds.width <= width + 1, `${name}: fee note fits ${width}px`);
      await page.screenshot({ path: `output/fee-coverage-screenshots/${name}-${width}.png` });
    }
    await page.close();
  }
  console.log(
    'PASS - all five donation fee disclosures visible and within mobile/desktop viewport; external network blocked'
  );
} finally {
  await browser.close();
}
