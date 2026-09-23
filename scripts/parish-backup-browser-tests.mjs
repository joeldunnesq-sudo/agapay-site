import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { openParishFixture } from './lib/parish-browser-fixture.mjs';

const source = await readFile(new URL('../public/parish/backup.js', import.meta.url), 'utf8');
const zip = Buffer.from('PK synthetic archive');
const id = '11111111-1111-4111-8111-111111111111';
let posts = 0,
  reads = 0,
  corrupt = false,
  unavailable = false;
const server = createServer(async (request, response) => {
  const send = (body) => {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(body));
  };
  if (request.url === '/') {
    response.end('<html><body><div id="card"></div></body></html>');
    return;
  }
  if (request.url.endsWith('/backup-status')) {
    send({
      enabled: true,
      cloud: {
        status: unavailable ? 'unavailable' : 'verified',
        backedUpAt: unavailable ? null : new Date().toISOString(),
      },
    });
    return;
  }
  if (request.url.endsWith('/download')) {
    response.setHeader('Content-Type', 'application/zip');
    response.end(corrupt ? Buffer.alloc(zip.length) : zip);
    return;
  }
  if (request.method === 'POST') {
    let body = '';
    for await (const chunk of request) body += chunk;
    assert.equal(JSON.parse(body).mode, 'export', 'backup cannot request closure');
    posts++;
    send({ job: { id } });
    return;
  }
  if (request.url.endsWith('/' + id)) {
    reads++;
    send({
      job: {
        id,
        status: reads === 1 ? 'preparing' : 'ready',
        archiveBytes: zip.length,
        archiveSha256: createHash('sha256').update(zip).digest('hex'),
        createdAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      },
    });
    return;
  }
  send({ jobs: [] });
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ acceptDownloads: true });
  await page.goto('http://127.0.0.1:' + server.address().port);
  await page.addScriptTag({ content: source });
  await page.evaluate(() =>
    window.ParishBackup.mount({
      element: document.getElementById('card'),
      parishId: 'parish-a',
      headers: () => ({ Authorization: 'Bearer synthetic' }),
    })
  );
  await page.waitForFunction(() => !document.querySelector('[data-download]').disabled);
  assert.match(await page.locator('[data-cloud]').innerText(), /Verified/);
  const pending = page.waitForEvent('download');
  await page.locator('[data-download]').click();
  await page.waitForFunction(() => document.querySelector('[data-progress]').textContent.includes('Preparing'));
  assert.equal(await page.locator('[data-download]').isDisabled(), true);
  const download = await pending;
  assert.match(download.suggestedFilename(), /^AGAPAY-parish-backup-.+\.zip$/);
  assert.equal(await download.failure(), null);
  assert.equal(posts, 1, 'one click creates one ordinary export');
  corrupt = true;
  await page.locator('[data-download]').click();
  await page.waitForFunction(() =>
    document.querySelector('[data-progress]').textContent.includes('checksum did not match')
  );
  assert.equal(posts, 2, 'a subsequent backup captures a fresh export');
  await page.locator('[data-download]').click();
  await page.waitForFunction(() => !document.querySelector('[data-download]').disabled);
  assert.equal(posts, 2, 'failed download retries the same archive');
  unavailable = true;
  await page.locator('[data-refresh]').click();
  await page.waitForFunction(() => document.querySelector('[data-cloud]').textContent.includes('No verified'));
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await mkdir('artifacts/parish-backup', { recursive: true });
  await page.screenshot({ path: 'artifacts/parish-backup/mobile.png', fullPage: true });
  const fixture = await openParishFixture(browser);
  try {
    await fixture.open();
    await fixture.page.waitForFunction(() =>
      document.getElementById('parishBackupCard')?.textContent.includes('Parish backups')
    );
    await fixture.page.evaluate(() => {
      document.getElementById('nav-settings').click();
    });
    await fixture.page.locator('#parishBackupCard').scrollIntoViewIfNeeded();
    await fixture.page.screenshot({ path: 'artifacts/parish-backup/settings-desktop.png', fullPage: true });
    await fixture.page.setViewportSize({ width: 390, height: 844 });
    await fixture.page.locator('#parishBackupCard').scrollIntoViewIfNeeded();
    await fixture.page.screenshot({ path: 'artifacts/parish-backup/settings-mobile.png', fullPage: true });
    await fixture.page
      .locator('#parishBackupCard')
      .screenshot({ path: 'artifacts/parish-backup/backup-card-mobile.png' });
    assert.equal(
      await fixture.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
      'Settings fits the mobile viewport'
    );
    fixture.assertClean();
  } finally {
    await fixture.close();
  }
  console.log(
    'PASS - one-click queued download, duplicate prevention, checksum failure, unknown cloud state, and mobile layout'
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
