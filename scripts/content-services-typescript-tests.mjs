import assert from 'node:assert/strict';
import { fetchKoinoniaCalendarIcs } from '../src/lib/koinonia-calendar.js';
import { isUnsafeHostname, validateSafeExternalUrl } from '../src/lib/safe-external-url.js';
import { renderBoundedRichText, stripAuthoredHtml } from '../src/lib/rich-text.js';

const origin = 'https://calendar.example/feed';
const calendar = 'BEGIN:VCALENDAR\nSUMMARY:Parish ☦\nEND:VCALENDAR';
const bytes = new TextEncoder().encode(calendar);
let transportOptions;
assert.equal(
  await fetchKoinoniaCalendarIcs(origin, async (_url, options) => {
    transportOptions = options;
    return new Response(
      new ReadableStream({
        start(controller) {
          // Splitting every byte exercises incremental UTF-8 decoding.
          for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
          controller.close();
        },
      })
    );
  }),
  calendar
);
assert.equal(transportOptions.redirect, 'manual');
assert.equal(transportOptions.headers.Accept, 'text/calendar');
assert.ok(transportOptions.signal instanceof AbortSignal);

const requests = [];
await fetchKoinoniaCalendarIcs(origin, async (url) => {
  requests.push(url);
  return requests.length === 1
    ? new Response(null, { status: 302, headers: { location: '/relative.ics#ignored' } })
    : new Response(calendar);
});
assert.deepEqual(requests, [origin, 'https://calendar.example/relative.ics']);
let redirectCalls = 0;
await assert.rejects(
  fetchKoinoniaCalendarIcs(origin, async () => {
    redirectCalls++;
    return new Response(null, { status: 307, headers: { location: '/loop' } });
  }),
  /redirected too many times/
);
assert.equal(redirectCalls, 4);

await assert.rejects(
  fetchKoinoniaCalendarIcs(
    origin,
    async () =>
      new Response(calendar, {
        headers: { 'Content-Length': '2000001' },
      })
  ),
  /Calendar too large/
);
let cancelled = false;
await assert.rejects(
  fetchKoinoniaCalendarIcs(
    origin,
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(2_000_001));
          },
          cancel() {
            cancelled = true;
          },
        })
      )
  ),
  /Calendar too large/
);
assert.equal(cancelled, true, 'oversized streaming bodies must cancel their source');
const exactLimit = 'BEGIN:VCALENDAR'.padEnd(2_000_000, ' ');
assert.equal((await fetchKoinoniaCalendarIcs(origin, async () => new Response(exactLimit))).length, 2_000_000);
await assert.rejects(
  fetchKoinoniaCalendarIcs(origin, async () => new Response(null)),
  /did not return an ICS calendar/
);
await assert.rejects(
  fetchKoinoniaCalendarIcs(origin, async () => new Response('', { status: 503 })),
  /Calendar unavailable/
);
const transportFailure = new Error('test transport failure');
await assert.rejects(
  fetchKoinoniaCalendarIcs(origin, async () => {
    throw transportFailure;
  }),
  (error) => error === transportFailure
);

for (const host of [
  'localhost',
  'site.localhost',
  'site.local',
  'site.internal',
  '[::1]',
  '10.0.0.1',
  '172.31.0.1',
  '192.168.1.1',
  '224.0.0.1',
]) {
  assert.equal(isUnsafeHostname(host), true, host);
}
assert.equal(validateSafeExternalUrl('/feed#fragment', { base: new URL(origin) }), origin);
assert.throws(() => validateSafeExternalUrl(null, { invalidMessage: 'Invalid input' }), /Invalid input/);
assert.throws(
  () => validateSafeExternalUrl('http://calendar.example', { unsafeMessage: 'HTTPS required' }),
  /HTTPS required/
);

const tags = Object.freeze(['strong', 'em', 'a', 'ul', 'li', 'br']);
assert.equal(
  renderBoundedRichText('**Hello**\n- *One*\n- Two', tags),
  '<strong>Hello</strong><br><ul><li><em>One</em></li><li>Two</li></ul>'
);
assert.equal(
  renderBoundedRichText('[Unsafe](javascript:alert) <img src=x onerror=alert(1)>', tags),
  '[Unsafe](javascript:alert) '
);
assert.equal(
  renderBoundedRichText('[Public](https://example.com)', tags),
  '<a href="https://example.com" target="_blank" rel="noopener noreferrer">Public</a>'
);
assert.equal(stripAuthoredHtml('<span title="a>b">text</span>', tags), 'text');
assert.equal(renderBoundedRichText(null), '');
assert.equal(renderBoundedRichText(0), '0');
assert.equal(renderBoundedRichText('**plain**'), '**plain**');
assert.throws(() => renderBoundedRichText('text', ['script']), /Unsupported authored rich-text tag/);
console.log(
  'PASS - typed content services retain URL validation, redirect limits, streamed byte limits, cancellation, UTF-8 decoding, and bounded rendering'
);
