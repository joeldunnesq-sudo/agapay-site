import { validateSafeExternalUrl, type SafeExternalUrlOptions } from '../../src/lib/safe-external-url.js';
import {
  fetchKoinoniaCalendarIcs,
  normalizeKoinoniaCalendarUrl,
  type CalendarFetcher,
} from '../../src/lib/koinonia-calendar.js';
import { renderBoundedRichText, stripAuthoredHtml } from '../../src/lib/rich-text.js';

// Inputs retain existing coercion; options and transports are checked contracts.
declare const untrustedContent: unknown;
const urlOptions: SafeExternalUrlOptions = { base: new URL('https://example.com'), invalidMessage: 'Invalid' };
validateSafeExternalUrl(untrustedContent, urlOptions);
normalizeKoinoniaCalendarUrl(untrustedContent, 'https://example.com');
const calendarTransport: CalendarFetcher = async (_url, options) => {
  options?.signal?.throwIfAborted();
  return new Response('BEGIN:VCALENDAR\nEND:VCALENDAR');
};
const calendarResult: Promise<string> = fetchKoinoniaCalendarIcs(untrustedContent, calendarTransport);
void calendarResult;
const allowedTags = ['strong', 'em', 'a'] as const;
renderBoundedRichText(untrustedContent, allowedTags);
renderBoundedRichText(null);
stripAuthoredHtml(untrustedContent, allowedTags);
// @ts-expect-error: options cannot replace a base URL with a number.
validateSafeExternalUrl('feed.ics', { base: 42 });
// @ts-expect-error: custom error messages must remain strings.
validateSafeExternalUrl('feed.ics', { unsafeMessage: { message: 'No' } });
// @ts-expect-error: transport must return a response, not decoded text.
void fetchKoinoniaCalendarIcs('https://example.com', async () => 'BEGIN:VCALENDAR');
// @ts-expect-error: synchronous transports cannot satisfy the asynchronous fetch contract.
void fetchKoinoniaCalendarIcs('https://example.com', () => new Response());
// @ts-expect-error: a rendered result must be awaited.
const synchronousCalendar: string = fetchKoinoniaCalendarIcs('https://example.com');
void synchronousCalendar;
// @ts-expect-error: tag collections must contain strings.
renderBoundedRichText('hello', [123]);
// @ts-expect-error: a string is not an allowed-tag array.
stripAuthoredHtml('hello', 'strong');
