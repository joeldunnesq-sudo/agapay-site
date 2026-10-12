import assert from 'node:assert/strict';
import {
  ACCOUNTING_EVENT_TYPES,
  maskEmail,
  maskStripeId,
  maskObjectKey,
  maskIpAddress,
  redactSensitiveValue,
  redactObject,
  createAccountingLogEvent,
  createSafeErrorResponse,
  createSupportAuditRequirement,
} from '../src/accounting/observability.js';
assert.equal(maskEmail('treasurer@example.test'), 'tr***@example.test');
for (const value of ['', null, 42, 'missing-domain']) assert.equal(maskEmail(value), '');
assert.equal(maskStripeId('cus_12345678'), 'cus_***5678');
assert.equal(maskStripeId(null), '');
assert.equal(maskObjectKey('12345678'), '***');
assert.equal(maskObjectKey('123456789'), '1234***6789');
assert.equal(maskObjectKey(''), '');
assert.equal(maskIpAddress('192.0.2.1'), '192.0.x.x');
assert.equal(maskIpAddress('2001:db8::1'), '[masked-ip]');
assert.equal(maskIpAddress(null), '');
for (const key of ['PASSWORD', 'client_secret', 'token', 'Authorization', 'cookie', 'api_key', 'apikey', 'privateKey'])
  assert.equal(redactSensitiveValue('synthetic', key), '[redacted]');
assert.equal(redactSensitiveValue('treasurer@example.test', 'email'), 'tr***@example.test');
assert.equal(redactSensitiveValue('cus_12345678', 'stripeCustomer'), 'cus_***5678');
assert.equal(redactSensitiveValue('123456789', 'objectKey'), '1234***6789');
assert.equal(redactSensitiveValue('192.0.2.1', 'ipAddress'), '192.0.x.x');
assert.equal(redactSensitiveValue('synthetic', 'emailToken'), '[redacted]');
assert.equal(redactSensitiveValue(0, 'amount'), 0);
const input = {
  token: 'synthetic',
  nested: { password: 'synthetic', email: 'ab@example.test' },
  items: [{ secret: 'synthetic' }, 'unchanged'],
  count: 1,
};
const snapshot = structuredClone(input);
assert.deepEqual(redactObject(input), {
  token: '[redacted]',
  nested: { password: '[redacted]', email: 'ab***@example.test' },
  items: [{ secret: '[redacted]' }, 'unchanged'],
  count: 1,
});
assert.deepEqual(input, snapshot);
// Preserve legacy traversal: object children are visited without their parent key.
assert.deepEqual(redactObject({ private: { value: 'synthetic' } }), { private: { value: 'synthetic' } });
for (const value of [null, undefined, false, 0, 'plain']) assert.equal(redactObject(value), value);
for (const type of ACCOUNTING_EVENT_TYPES)
  assert.equal(createAccountingLogEvent({ type, env: { AGAPAY_ACCOUNTING_ENV: 'test' } }).type, type);
const event = createAccountingLogEvent({
  type: 'unknown',
  env: { AGAPAY_ACCOUNTING_ENV: 'test' },
  parishId: 'p',
  actorId: 'a',
  correlationId: 'c',
  subjectType: 'report',
  subjectId: 'r',
  severity: 'notice',
  metadata: { token: 'synthetic' },
});
assert.equal(event.type, 'accounting.gateway.request');
assert.equal(event.environment, 'test');
assert.equal(event.parishId, 'p');
assert.equal(event.actorId, 'a');
assert.equal(event.correlationId, 'c');
assert.equal(event.subjectType, 'report');
assert.equal(event.subjectId, 'r');
assert.equal(event.severity, 'notice');
assert.deepEqual(event.metadata, { token: '[redacted]' });
assert.ok(Number.isFinite(Date.parse(event.occurredAt)));
for (const status of [500, 503, 599, 200, 600, -1, 'invalid']) {
  const result = createSafeErrorResponse({ status, message: 'synthetic internal detail', code: 'test' }, 'c');
  assert.equal(result.status, typeof status === 'number' && status >= 500 && status < 600 ? status : 500);
  assert.equal(result.body.error, 'Accounting request could not be completed.');
  assert.equal(result.body.code, 'test');
  assert.equal(result.body.correlationId, 'c');
}
assert.deepEqual(createSafeErrorResponse({ status: '422', message: 'Rejected', name: 'ValidationError' }), {
  status: 422,
  body: { error: 'Rejected', code: 'ValidationError', correlationId: '' },
});
assert.equal(createSafeErrorResponse({ status: 0, statusCode: 403 }).status, 403);
assert.equal(createSafeErrorResponse({ status: 400.5 }).status, 400.5);
assert.equal(createSafeErrorResponse({ status: 400 }).body.error, 'Accounting request was rejected.');
assert.equal(createSafeErrorResponse().body.code, 'accounting_error');
assert.throws(() => createSafeErrorResponse(null), TypeError);
const keys = ['AGAPAY_ACCOUNTING_ENV', 'AGAPAY_ENVIRONMENT', 'AGAPAY_ENV', 'NODE_ENV'];
const saved = keys.map((key) => process.env[key]);
try {
  for (const key of keys) delete process.env[key];
  process.env.AGAPAY_ACCOUNTING_ENV = 'test';
  const audit = createSupportAuditRequirement({
    action: 'inspect',
    parishId: 'p',
    actorId: 'a',
    targetType: 'report',
    targetId: 'r',
    reason: 'synthetic',
    correlationId: 'c',
  });
  assert.equal(audit.type, 'accounting.support.action');
  assert.equal(audit.severity, 'notice');
  assert.equal(audit.subjectType, 'report');
  assert.equal(audit.subjectId, 'r');
  assert.equal(audit.environment, 'test');
  assert.deepEqual(audit.metadata, { action: 'inspect', reason: 'synthetic' });
} finally {
  keys.forEach((key, index) => {
    if (saved[index] === undefined) delete process.env[key];
    else process.env[key] = saved[index];
  });
}
console.log('PASS - Accounting masking, log events, safe responses, and support audit metadata');
