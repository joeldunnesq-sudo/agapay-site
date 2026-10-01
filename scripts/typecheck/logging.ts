import {
  requestContext,
  safeErrorClass,
  safeRequestRoute,
  type RequestDiagnosticContext,
} from '../../src/lib/request-context.js';
import { logEvent, sanitize, sanitizedErrorMessage, type SanitizedValue } from '../../src/lib/logging.js';

const context: RequestDiagnosticContext = {
  requestId: 'request',
  route: '/api/parish/*',
  method: 'GET',
  startedAt: 0,
  deploymentVersion: 'release',
};
declare const env: Env;
void logEvent(env, { eventType: 'worker.event' });
void logEvent({ ...env, AGAPAY_BUILD_SHA: 'release' });
// @ts-expect-error: the separately injected deployment version is text.
void logEvent({ AGAPAY_BUILD_SHA: 123 });
requestContext.run(context, () => logEvent({}, { severity: 'warn', metadata: { arbitrary: Symbol('value') } }));
const safe: SanitizedValue = sanitize(new Map());
void safe;
safeRequestRoute(new Request('https://example.test/api/health'));
safeErrorClass(null);
sanitizedErrorMessage(new Error('message'));
// @ts-expect-error: timestamps are numeric epoch milliseconds.
requestContext.run({ ...context, startedAt: 'yesterday' }, () => {});
// @ts-expect-error: request metadata is immutable to typed consumers.
context.requestId = 'replacement';
// @ts-expect-error: log severity is a closed vocabulary.
void logEvent({}, { severity: 'fatal' });
// @ts-expect-error: retryable describes a boolean, not a string.
void logEvent({}, { retryable: 'yes' });
// @ts-expect-error: structured errors must be normalized before message formatting.
sanitizedErrorMessage({ message: 123 });
// @ts-expect-error: sanitization can return primitives, not just a record.
const record: Record<string, SanitizedValue> = sanitize(null);
void record;
