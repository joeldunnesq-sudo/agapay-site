import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const mediaScript = await readFile(new URL('../public/myagapay/media.js', import.meta.url), 'utf8');
const watchScript = await readFile(new URL('../public/myagapay/watch.js', import.meta.url), 'utf8');
const mediaHtml = await readFile(new URL('../public/myagapay/media.html', import.meta.url), 'utf8');
const watchHtml = await readFile(new URL('../public/myagapay/watch.html', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true });
const errors = [];

async function fixture(
  kind,
  payload,
  {
    status = 200,
    unauthorized = false,
    search = '',
    native = true,
    hls = true,
    malformedReceipt = false,
    receiptStatus = 200,
  } = {}
) {
  const page = await browser.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', (route) => {
    if (route.request().isNavigationRequest())
      return route.fulfill({ contentType: 'text/html', body: kind === 'media' ? mediaHtml : watchHtml });
    return route.fulfill({
      contentType: route.request().resourceType() === 'script' ? 'application/javascript' : 'text/plain',
      body: '',
    });
  });
  await page.goto(`https://agapay.test/myagapay/${kind}${search}`);
  await page.evaluate(
    ({ payload, status, unauthorized, native, hls, malformedReceipt, receiptStatus }) => {
      window.calls = [];
      window.playerCalls = [];
      window.MyAgapayShell = {
        authHeaders: () => ({ Authorization: 'Bearer fixture-session' }),
        handleUnauthorized: (response) => unauthorized && response.status === 401,
      };
      window.fetch = async (url, options = {}) => {
        window.calls.push({ url, options });
        if (String(url).endsWith('/watch'))
          return new Response(malformedReceipt ? '{' : JSON.stringify({ watchCount: 7 }), { status: receiptStatus });
        return new Response(JSON.stringify(payload), { status });
      };
      const video = document.getElementById('streamVideo');
      if (video) {
        let paused = true;
        Object.defineProperty(video, 'paused', { get: () => paused });
        Object.defineProperty(video, 'duration', { get: () => 125 });
        video.canPlayType = () => (native ? 'probably' : '');
        video.play = async () => {
          paused = false;
          window.playerCalls.push('play');
          video.dispatchEvent(new Event('play'));
        };
        video.pause = () => {
          paused = true;
          window.playerCalls.push('pause');
          video.dispatchEvent(new Event('pause'));
        };
      }
      if (hls)
        window.Hls = class {
          static isSupported() {
            return true;
          }
          constructor(options) {
            window.playerCalls.push(['hls', options]);
          }
          loadSource(url) {
            window.playerCalls.push(['source', url]);
          }
          attachMedia(video) {
            window.playerCalls.push(['attach', video.id]);
          }
          destroy() {
            window.playerCalls.push('destroy');
          }
        };
    },
    { payload, status, unauthorized, native, hls, malformedReceipt, receiptStatus }
  );
  await page.addScriptTag({ content: kind === 'media' ? mediaScript : watchScript });
  await page.evaluate((kind) => (kind === 'media' ? loadMedia() : loadWatch()), kind);
  return page;
}

try {
  const video = {
    id: 'private/video',
    title: '<Private & title>',
    publishedAt: '2026-10-14',
    thumbnailUrl: '/thumb',
    durationSeconds: 3661,
    watchCount: 1,
    description: '<Description>',
  };
  const youtube = { title: '<YouTube & title>', youtubeUrl: 'https://youtu.be/abcdef12345', thumbnailUrl: '/thumb' };
  let page = await fixture('media', {
    parish: { name: '<Parish>' },
    videos: [video],
    youtube: [youtube, { ...youtube, youtubeUrl: 'https://youtu.be/bad!' }],
    youtubeChannel: { uploadsPlaylistId: `UU${'a'.repeat(22)}`, channelTitle: 'Parish channel' },
  });
  assert.equal(await page.locator('#mediaParishName').textContent(), '<Parish>');
  assert.equal(await page.locator('#mediaFeatured strong').textContent(), video.title);
  assert.equal(await page.locator('#mediaFeatured em').textContent(), '1:01:01');
  assert.equal(
    await page.locator('#mediaFeatured a').getAttribute('href'),
    '/myagapay/media/watch?video=private%2Fvideo'
  );
  assert.equal(await page.locator('#mediaFeatured script').count(), 0);
  assert.equal(await page.locator('.youtube-card').count(), 1);
  assert.equal(
    await page.locator('#youtubePlayerModal').evaluate((el) => el.hidden),
    true,
    'YouTube playback waits for explicit selection'
  );
  assert.match(
    await page.locator('#youtubeChannelFrame').getAttribute('src'),
    /youtube-nocookie\.com\/embed\/videoseries\?list=UU/
  );
  const calls = await page.evaluate(() => window.calls);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.cache, 'no-store');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer fixture-session');
  await page.locator('.youtube-card').click();
  assert.equal(await page.locator('#youtubePlayerTitle').textContent(), youtube.title);
  assert.match(
    await page.locator('#youtubePlayerFrame').getAttribute('src'),
    /youtube-nocookie\.com\/embed\/abcdef12345\?autoplay=1/
  );
  assert.equal(await page.locator('.youtube-player-close').evaluate((el) => document.activeElement === el), true);
  await page.evaluate(async () => {
    const dialog = document.querySelector('.youtube-player-dialog');
    dialog.requestFullscreen = async () => {
      throw new Error('Fullscreen unavailable');
    };
    await openYouTubeMediaFullscreen();
  });
  assert.equal(
    await page.locator('.youtube-player-dialog').evaluate((el) => el.classList.contains('is-landscape-fallback')),
    true
  );
  await page.keyboard.press('Escape');
  assert.equal(
    await page.locator('.youtube-player-dialog').evaluate((el) => el.classList.contains('is-browser-fullscreen')),
    false
  );
  assert.equal(
    await page.locator('#youtubePlayerModal').evaluate((el) => el.hidden),
    false,
    'First Escape exits fullscreen fallback'
  );
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#youtubePlayerModal').evaluate((el) => el.hidden), true);
  assert.equal(await page.locator('#youtubePlayerFrame').getAttribute('src'), 'about:blank');
  await page.evaluate(async () => {
    const dialog = document.querySelector('.youtube-player-dialog');
    dialog.requestFullscreen = undefined;
    dialog.webkitRequestFullscreen = async function (options) {
      window.fullscreenCall = { sameElement: this === dialog, options };
    };
    screen.orientation.lock = async (value) => {
      window.orientationRequested = value;
    };
    await openYouTubeMediaFullscreen();
  });
  assert.deepEqual(await page.evaluate(() => window.fullscreenCall), {
    sameElement: true,
    options: { navigationUI: 'hide' },
  });
  assert.equal(await page.evaluate(() => window.orientationRequested), 'landscape');
  await page.evaluate(() => {
    screen.orientation.unlock = () => {
      window.orientationUnlocked = true;
    };
    document.dispatchEvent(new Event('fullscreenchange'));
  });
  assert.equal(await page.evaluate(() => window.orientationUnlocked), true);
  assert.equal(await page.evaluate(() => mediaDate('not-a-date')), '');
  assert.equal(await page.evaluate(() => mediaDuration(-1)), '0:00');
  assert.deepEqual(
    await page.evaluate(() =>
      [
        'https://youtube.com/watch?v=abcdef12345',
        'https://youtube.com/shorts/abcdef12345',
        'https://youtube.com/live/abcdef12345',
        'https://youtube.com/embed/abcdef12345',
      ].map(youtubeVideoId)
    ),
    Array(4).fill('abcdef12345')
  );
  await page.close();

  for (const [payload, options, expected] of [
    [{}, {}, 'No private parish videos have been published yet.'],
    [{ error: 'Media access unavailable' }, { status: 403 }, 'Media access unavailable'],
  ]) {
    page = await fixture('media', payload, options);
    assert.equal(await page.locator('#mediaStatus').textContent(), expected);
    assert.equal(await page.locator('#mediaSkeleton').evaluate((el) => el.hidden), true);
    await page.close();
  }
  page = await fixture('media', { error: 'Sign in' }, { status: 401, unauthorized: true });
  assert.equal(await page.locator('#mediaSkeleton').evaluate((el) => el.hidden), false);
  await page.close();
  page = await fixture('media', { youtubeLatest: youtube }, { search: '?youtube=abcdef12345' });
  assert.equal(
    await page.locator('#youtubePlayerModal').evaluate((el) => el.hidden),
    false,
    'Existing deep links open a matching latest video'
  );
  await page.close();

  const playback = {
    video: {
      title: '<Private title>',
      publishedAt: '2026-10-14',
      descriptionHtml: '<p>Server-rendered description</p>',
      hlsUrl: 'https://stream.test/signed.m3u8',
    },
  };
  page = await fixture('watch', playback, { search: '?video=private%2Fvideo' });
  assert.equal(await page.locator('#watchTitle').textContent(), playback.video.title);
  assert.equal(await page.locator('#watchExperience').evaluate((el) => el.hidden), false);
  assert.equal(await page.locator('#streamVideo').getAttribute('src'), playback.video.hlsUrl);
  assert.equal(await page.locator('#watchDescription p').textContent(), 'Server-rendered description');
  assert.equal(await page.evaluate(() => window.calls.length), 1, 'Loading does not mark the video watched');
  await page.locator('#playerPlay').click();
  await page.waitForFunction(() => document.getElementById('watchCount').textContent === '7 parishioners watched');
  assert.equal(await page.locator('#centerPlay').evaluate((el) => el.hidden), true);
  await page.locator('#playerPlay').click();
  assert.equal(await page.locator('#centerPlay').evaluate((el) => el.hidden), false);
  await page.locator('#centerPlay').click();
  assert.equal(
    await page.evaluate(() => window.calls.filter((call) => call.url.endsWith('/watch')).length),
    1,
    'Watch receipt is sent once'
  );
  assert.deepEqual(await page.evaluate(() => window.calls[1]), {
    url: '/api/donor/videos/private%2Fvideo/watch',
    options: { method: 'POST', headers: { Authorization: 'Bearer fixture-session' } },
  });
  await page.evaluate(() => {
    const video = document.getElementById('streamVideo');
    video.currentTime = 65;
    video.dispatchEvent(new Event('timeupdate'));
  });
  assert.equal(await page.locator('#playerTime').textContent(), '1:05 / 2:05');
  assert.equal(await page.locator('#playerSeek').inputValue(), '520');
  await page.locator('#playerSeek').evaluate((el) => {
    el.value = '800';
    el.dispatchEvent(new Event('input'));
  });
  assert.equal(await page.locator('#streamVideo').evaluate((el) => el.currentTime), 100);
  await page.locator('#playerMute').click();
  assert.equal(await page.locator('#streamVideo').evaluate((el) => el.muted), true);
  await page.locator('#playerVolume').evaluate((el) => {
    el.value = '0.25';
    el.dispatchEvent(new Event('input'));
  });
  assert.deepEqual(await page.locator('#streamVideo').evaluate((el) => [el.volume, el.muted]), [0.25, false]);
  await page.evaluate(() => {
    document.getElementById('agapayPlayer').requestFullscreen = async () => {
      window.playerFullscreenRequested = true;
    };
  });
  await page.locator('#playerFullscreen').click();
  assert.equal(await page.evaluate(() => window.playerFullscreenRequested), true);
  assert.equal(
    await page.evaluate(() => watchTime(Infinity)),
    'Infinity:NaN:NaN',
    'Existing numeric coercion remains unchanged'
  );
  await page.close();

  page = await fixture('watch', playback, { search: '?video=private', native: false });
  assert.deepEqual(await page.evaluate(() => window.playerCalls), [
    ['hls', { enableWorker: true }],
    ['source', playback.video.hlsUrl],
    ['attach', 'streamVideo'],
  ]);
  await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')));
  assert.equal(await page.evaluate(() => window.playerCalls.at(-1)), 'destroy');
  await page.close();
  for (const [options, expected] of [
    [{}, 'Choose a video from Media.'],
    [{ search: '?video=private', native: false, hls: false }, 'This browser cannot play secure HLS video.'],
    [{ search: '?video=private', status: 403 }, 'This video is not available.'],
  ]) {
    page = await fixture('watch', playback, options);
    assert.equal(await page.locator('#watchStatus').textContent(), expected);
    assert.equal(await page.locator('#watchExperience').evaluate((el) => el.hidden), true);
    await page.close();
  }
  page = await fixture('watch', { error: 'Sign in' }, { search: '?video=private', status: 401, unauthorized: true });
  assert.equal(await page.locator('#watchStatus').textContent(), 'Checking parish access…');
  await page.close();
  page = await fixture('watch', playback, { search: '?video=private', malformedReceipt: true });
  await page.locator('#playerPlay').click();
  await page.waitForFunction(() => document.getElementById('watchCount').textContent === '0 parishioners watched');
  await page.close();
  assert.deepEqual(errors, []);
  console.log(
    'PASS - Media rendering, escaped titles, validated embeds, deep links, fullscreen fallback, private playback, native/HLS branches, controls, single receipts, auth, errors and teardown'
  );
} finally {
  await browser.close();
}
