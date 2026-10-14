import {
  createAccountingLogEvent,
  createSafeErrorResponse,
  createSupportAuditRequirement,
  redactObject,
} from '../../src/accounting/observability.js';
const event = createAccountingLogEvent({
  type: 'accounting.gateway.request',
  env: { AGAPAY_ACCOUNTING_ENV: 'test' },
  metadata: { token: 'synthetic' },
});
const type: string = event.type;
void type;
const response = createSafeErrorResponse({ status: '422' });
const status: number = response.status;
void status;
createSupportAuditRequirement({ action: 'inspect', reason: { source: 'synthetic' } });
// @ts-expect-error Event correlation IDs are strings.
createAccountingLogEvent({ correlationId: 123 });
// @ts-expect-error Error response correlation IDs are strings.
createSafeErrorResponse({}, 123);
// @ts-expect-error Redacted arbitrary data requires narrowing.
void event.metadata.token;
const redacted = redactObject({ email: 'ab@example.test' });
// @ts-expect-error Redaction is not runtime shape validation.
void redacted.email;
