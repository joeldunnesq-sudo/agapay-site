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
const cacheName = workerSource.match(/const AGAPAY_CACHE = ['"]([^'"]+)['"]/)[1];
let previousRelease = true;
const requests = new Map();
const bookstoreUrl = appAssetUrl('/donor/bookstore-presentation.js');
const oldUrl = '/donor/bookstore-presentation.js?v=previous-release';
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  requests.set(req.url, (requests.get(req.url) || 0) + 1);
  res.setHeader('Cache-Control', 'no-store');
  if (url.pathname === '/__native_audio__') {
    res.setHeader('Content-Type', 'audio/mpeg');
    res.end(Buffer.from([1, 2, 3, 4]));
    return;
  }
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
  if (url.pathname === '/__listen_typescript_test__') {
    res.setHeader('Content-Type', 'text/html');
    res.end(await readFile(resolve(publicRoot, 'listen/index.html'), 'utf8'));
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
      file.endsWith('.js') || file.endsWith('.mjs')
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
  const native = await page.evaluate(async () => {
    const { ListenDB } = await import('/listen/db.js');
    const { AudioPlayer } = await import('/listen/player.js');
    const { exportOpml, importOpml } = await import('/listen/opml.js');
    const { parseDirectoryCsv, mapImportRows } = await import('/parish/directory-import-format.js');
    const { renderSanitizedMarkup } = await import('/learn/sanitized-render.js');
    const db = new ListenDB();
    await db.saveProgress('native-probe', 20, 300);
    const progress = await db.getProgress('native-probe');
    await db.downloadEpisode({ guid: 'native-probe', url: '/__native_audio__' });
    const blobUrl = await db.getDownload('native-probe');
    const bytes = Array.from(new Uint8Array(await (await fetch(blobUrl)).arrayBuffer()));
    URL.revokeObjectURL(blobUrl);
    const downloads = await db.getAllDownloads();
    await db.deleteDownload('native-probe');
    const removed = await db.getDownload('native-probe');
    const player = new AudioPlayer();
    player.setSpeed(1.25);
    const subscriptions = importOpml(exportOpml([{ title: 'Example', xmlUrl: 'https://example.test/feed' }]));
    const table = parseDirectoryCsv('name,email\nExample,person@example.test');
    const rows = mapImportRows(table, { name: 0, email: 1 });
    const target = document.createElement('div');
    renderSanitizedMarkup(target, '<b>Example</b><img src=x onerror=alert(1)><script>alert(1)</script>');
    return {
      position: progress.position,
      duration: progress.duration,
      bytes,
      downloadGuid: downloads[0].guid,
      removed,
      paused: player.paused,
      subscription: subscriptions[0].xmlUrl,
      email: rows[0].email,
      sanitized: target.innerHTML,
    };
  });
  assert.equal(native.position, 20);
  assert.equal(native.duration, 300);
  assert.deepEqual(native.bytes, [1, 2, 3, 4]);
  assert.equal(native.downloadGuid, 'native-probe');
  assert.equal(native.removed, null);
  assert.equal(native.paused, true);
  assert.equal(native.subscription, 'https://example.test/feed');
  assert.equal(native.email, 'person@example.test');
  assert.doesNotMatch(native.sanitized, /<script|onerror=/i);
  assert.match(native.sanitized, /<b>Example<\/b>/);
  // Exercise the real Listen module graph and IndexedDB/Cache APIs with a deterministic media adapter.
  const listenContext = await browser.newContext({
    viewport: { width: 393, height: 873 },
    isMobile: true,
    serviceWorkers: 'block',
  });
  try {
    const listenPage = await listenContext.newPage(),
      listenErrors = [];
    listenPage.on('pageerror', (error) => listenErrors.push(error.message));
    await listenPage.addInitScript(
      ({ origin }) => {
        localStorage.setItem(
          'agp_eps',
          JSON.stringify([
            {
              guid: 'listen-ui-1',
              url: origin + '/__native_audio__',
              title: 'Migration Episode',
              show: 'Fixture Podcast',
              date: '2026-10-16',
              duration: 300,
              categories: ['Prayer'],
            },
          ])
        );
        HTMLMediaElement.prototype.play = function () {
          window.__listenPlayedSrc = this.src;
          this.dispatchEvent(new Event('playing'));
          return Promise.resolve();
        };
        HTMLMediaElement.prototype.pause = function () {
          this.dispatchEvent(new Event('pause'));
        };
        HTMLMediaElement.prototype.load = function () {
          queueMicrotask(() => this.dispatchEvent(new Event('loadedmetadata')));
        };
        Object.defineProperty(HTMLMediaElement.prototype, 'duration', { configurable: true, get: () => 300 });
      },
      { origin }
    );
    await listenPage.goto(origin + '/__listen_typescript_test__');
    await listenPage.locator('.ep-like-btn').first().click();
    assert.deepEqual(await listenPage.evaluate(() => JSON.parse(localStorage.getItem('agp_liked'))), ['listen-ui-1']);
    await listenPage.locator('.ep-play-next-btn').first().click();
    assert.equal(await listenPage.evaluate(() => JSON.parse(localStorage.getItem('agp_queue'))[0].guid), 'listen-ui-1');
    await listenPage.locator('.ep-download-btn').first().click();
    await listenPage.waitForFunction(() =>
      JSON.parse(localStorage.getItem('agp_downloaded') || '[]').includes('listen-ui-1')
    );
    assert.deepEqual(
      await listenPage.evaluate(async () =>
        Array.from(
          new Uint8Array(
            await (
              await (await caches.open('agapay-listen-audio-v1')).match(location.origin + '/__native_audio__')
            ).arrayBuffer()
          )
        )
      ),
      [1, 2, 3, 4]
    );
    await listenPage.locator('.ep-tap').first().click();
    await listenPage.waitForFunction(() => localStorage.getItem('agp_current'));
    assert.equal(await listenPage.evaluate(() => JSON.parse(localStorage.getItem('agp_current')).guid), 'listen-ui-1');
    assert.ok(
      await listenPage.evaluate(() => window.__listenPlayedSrc.startsWith('blob:')),
      'downloaded audio uses the local Cache response'
    );
    assert.equal(await listenPage.evaluate(() => navigator.mediaSession.metadata.title), 'Migration Episode');
    await listenPage.locator('.play-pause').click();
    await listenPage.locator('.back-btn').click();
    await listenPage.locator('[data-nav="library"]').last().click();
    await listenPage.locator('[data-nav="profile"]').last().click();
    assert.ok((await listenPage.locator('#listen-app').innerText()).includes('Guest Listener'));
    assert.deepEqual(listenErrors, [], 'Listen helpers must boot and handle UI actions without runtime errors');
    console.log(
      'PASS - mobile Listen likes, queue, exact cached bytes, media-adapter playback, Media Session metadata and navigation'
    );
  } finally {
    await listenContext.close();
  }
  // Exercise both deferred Groups scripts with real page markup and synthetic authenticated APIs.
  const groupsUrl = appAssetUrl('/myagapay/groups-presentation.js');
  assert.equal(requests.get(groupsUrl) || 0, 0, 'Groups support stays out of the existing login/shell boot');
  const groupsContext = await browser.newContext({
    viewport: { width: 393, height: 873 },
    isMobile: true,
    serviceWorkers: 'block',
  });
  try {
    const groupsPage = await groupsContext.newPage(),
      groupsErrors = [],
      groupApi = [];
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlWQAAAAASUVORK5CYII=',
      'base64'
    );
    groupsPage.on('pageerror', (error) => groupsErrors.push(error.message));
    await groupsPage.addInitScript(() => {
      window.groupFixture = { unauthorized: 0, revoked: [] };
      window.MyAgapayShell = {
        authHeaders: (extra) => ({ ...extra, Authorization: 'Bearer groups-fixture' }),
        handleUnauthorized: (response) => {
          if (response.status !== 401) return false;
          window.groupFixture.unauthorized++;
          return true;
        },
      };
      const revoke = URL.revokeObjectURL.bind(URL);
      URL.revokeObjectURL = (url) => {
        window.groupFixture.revoked.push(url);
        revoke(url);
      };
      document.addEventListener('DOMContentLoaded', () =>
        document.documentElement.setAttribute('data-myagapay-page-ready', 'true')
      );
    });
    await groupsContext.route('**/*', async (route) => {
      const request = route.request(),
        url = new URL(request.url());
      if (request.resourceType() === 'script') {
        if (
          ['/myagapay/groups.js', '/myagapay/groups-presentation.js', '/myagapay/ministry-home.js'].includes(
            url.pathname
          )
        )
          return route.continue();
        return route.fulfill({ contentType: 'text/javascript', body: '' });
      }
      if (url.origin !== origin) return route.fulfill({ contentType: 'text/css', body: '' });
      if (!url.pathname.startsWith('/api/')) return route.continue();
      groupApi.push({
        path: url.pathname,
        method: request.method(),
        headers: request.headers(),
        bytes: request.postDataBuffer()?.length || 0,
      });
      const root = '/api/donor/groups/fixture-group';
      let body;
      if (url.pathname === '/api/donor/groups')
        body = { groups: [{ id: 'fixture-group', name: '<Fixture Ministry>', role: 'leader', unreadCount: 2 }] };
      else if (url.pathname === root + '/messages')
        body = {
          group: { id: 'fixture-group', name: '<Fixture Ministry>' },
          messages: [
            {
              id: 'text',
              messageType: 'text',
              authorName: 'Fixture Adult',
              body: '<img src=x onerror=alert(1)>',
              createdAt: '2026-10-16',
              read: false,
            },
            {
              id: 'photo',
              messageType: 'image',
              authorName: 'Fixture Adult',
              createdAt: '2026-10-16',
              read: false,
              attachmentUrl: root + '/private-photo',
            },
          ],
        };
      else if (url.pathname === root + '/private-photo') return route.fulfill({ contentType: 'image/png', body: png });
      else if (url.pathname.endsWith('/read') || url.pathname === root + '/messages/attachment') body = { ok: true };
      else if (url.pathname === root + '/overview') body = { myCommitments: [], coverageRequests: [] };
      else if (url.pathname === root + '/members')
        body = {
          members: [
            {
              personId: 'adult',
              name: 'Fixture Adult',
              displayName: 'Fixture Adult',
              role: 'leader',
              accountLinked: true,
              caughtUp: true,
              mine: true,
            },
          ],
        };
      else if (url.pathname === root + '/caught-up')
        body = {
          latestMessage: { id: 'text', createdAt: '2026-10-16' },
          members: [{ displayName: 'Fixture Adult', role: 'leader', accountLinked: true, caughtUp: true }],
          caughtUpCount: 1,
          memberCount: 1,
        };
      else if (url.pathname === '/api/donor/koinonia/signups')
        body = {
          sheets: [
            {
              id: 'fixture-sheet',
              title: 'Fixture signup',
              ministryId: 'fixture-group',
              status: 'draft',
              slotCount: 1,
              openingCount: 1,
            },
          ],
        };
      else if (url.pathname === '/api/donor/koinonia/signups/templates/fixture-group') body = { templates: [] };
      else if (url.pathname === '/api/donor/koinonia/signups/fixture-sheet')
        body = {
          sheet: { id: 'fixture-sheet', title: 'Fixture signup', status: 'draft', category: 'general' },
          slots: [{ id: 'slot', label: 'Bring bread', filledCount: 0, neededCount: 1 }],
        };
      else if (url.pathname === root + '/commerce')
        body = {
          parishId: 'fixture-parish',
          items: [
            {
              id: 'item',
              variantId: 'variant',
              name: 'Fixture dinner',
              priceCents: 1800,
              eventDate: '2026-10-16',
              status: 'active',
              showOnCalendar: true,
            },
          ],
        };
      else throw Error('Unexpected Groups fixture API ' + url.pathname);
      return route.fulfill({ json: body });
    });
    await groupsPage.goto(origin + '/myagapay/groups.html');
    await groupsPage.locator('.group-list-item').click();
    await groupsPage.locator('[data-group-tab="messages"]').click();
    await groupsPage.waitForFunction(() =>
      document.querySelector('[data-group-photo]')?.getAttribute('src')?.startsWith('blob:')
    );
    assert.ok((await groupsPage.locator('.group-message-list').innerText()).includes('<img src=x onerror=alert(1)>'));
    assert.equal(await groupsPage.locator('.group-message img[src="x"]').count(), 0);
    await groupsPage.getByRole('button', { name: 'Who’s caught up' }).click();
    await groupsPage.waitForFunction(() =>
      document.querySelector('.group-catch-up')?.textContent.includes('Caught up')
    );
    await groupsPage
      .locator('#groupPhotoInput')
      .setInputFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: png });
    await groupsPage.locator('#groupMessageBody').fill('Fixture caption');
    await groupsPage.locator('#groupMessageSubmit').click();
    await groupsPage.waitForFunction(() => document.querySelector('#groupAttachmentPreview')?.hidden);
    const upload = groupApi.find((r) => r.path === '/api/donor/groups/fixture-group/messages/attachment');
    assert.ok(upload, 'private image upload is submitted through the existing attachment route');
    assert.equal(upload.bytes, png.length);
    assert.equal(upload.headers['x-agapay-attachment-bytes'], String(png.length));
    await groupsPage.locator('[data-group-tab="signups"]').click();
    await groupsPage.locator('.group-signup-row').click();
    await groupsPage.locator('.group-signup-slot-editor form').first().waitFor({ state: 'attached' });
    assert.equal(await groupsPage.locator('.group-signup-slot-editor form').count(), 1);
    await groupsPage.locator('[data-group-tab="commerce"]').click();
    await groupsPage.getByRole('button', { name: 'Duplicate for next year' }).click();
    assert.equal(await groupsPage.locator('#ministryCommerceCreateForm [name="eventDate"]').inputValue(), '');
    assert.equal(await groupsPage.locator('#ministryCommerceCreateForm [name="status"]').inputValue(), 'draft');
    await groupsPage.locator('.group-thread-back').click();
    assert.equal(new URL(groupsPage.url()).searchParams.has('group'), false);
    assert.ok(await groupsPage.evaluate(() => window.groupFixture.revoked.length > 0));
    assert.ok(groupApi.every((r) => r.headers.authorization === 'Bearer groups-fixture'));
    assert.deepEqual(groupsErrors, []);
    assert.equal(requests.get(groupsUrl), 1, 'one deferred support response is fetched on the Groups page');
    console.log(
      'PASS - mobile Groups message escaping, private photo fetch/upload, read status, signup detail, commerce duplicate defaults and cleanup'
    );
  } finally {
    await groupsContext.close();
  }

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
  const groupsExpected = (await readFile(resolve(publicRoot, 'myagapay/groups-presentation.js'), 'utf8')).replaceAll(
    '\r\n',
    '\n'
  );
  await page.evaluate(async (url) => (await fetch(url)).text(), groupsUrl);
  await page.waitForFunction(async (url) => Boolean(await caches.match(url)), groupsUrl);
  await context.setOffline(true);
  const offline = await page.evaluate(async (url) => (await fetch(url)).text(), bookstoreUrl);
  assert.equal(offline.replaceAll('\r\n', '\n'), expected);
  assert.equal(
    (await page.evaluate(async (url) => (await fetch(url)).text(), groupsUrl)).replaceAll('\r\n', '\n'),
    groupsExpected,
    'warm Groups support remains available offline by its exact content version'
  );
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
