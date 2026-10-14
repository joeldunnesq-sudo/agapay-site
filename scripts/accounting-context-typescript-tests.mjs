import assert from 'node:assert/strict';
import {
  ACCOUNTING_GATEWAY_CONTEXT,
  correlationIdForAccountingRequest,
  requestMetadataForAccounting,
  prepareIdempotencyContext,
  createAccountingContext,
  isAccountingGatewayContext,
} from '../src/accounting/context.js';
import {
  ACCOUNTING_SERVICE_TYPES,
  AccountingService,
  ContractOnlyAccountingService,
  assertGatewayContext,
} from '../src/accounting/contracts.js';
import { DomainBoundaryError, ValidationError } from '../src/accounting/errors.js';
const request = new Request('https://example.test/accounting/path?x=1', {
  method: 'POST',
  headers: {
    'X-Request-Id': 'request-id',
    'User-Agent': 'synthetic-agent',
    'CF-Connecting-IP': '192.0.2.1',
    'X-Forwarded-For': '192.0.2.2',
    'Idempotency-Key': 'header-key',
  },
});
assert.equal(correlationIdForAccountingRequest(request), 'request-id');
assert.match(correlationIdForAccountingRequest(null), /^[0-9a-f-]{36}$/);
assert.deepEqual(requestMetadataForAccounting(request), {
  method: 'POST',
  url: request.url,
  path: '/accounting/path',
  userAgent: 'synthetic-agent',
  ipAddress: '192.0.2.1',
});
assert.equal(
  requestMetadataForAccounting(new Request('https://example.test', { headers: { 'X-Forwarded-For': '192.0.2.2' } }))
    .ipAddress,
  '192.0.2.2'
);
assert.deepEqual(requestMetadataForAccounting(null), { method: '', url: '', path: '', userAgent: '', ipAddress: '' });
assert.throws(() => requestMetadataForAccounting({ url: 'invalid' }), TypeError);
assert.deepEqual(prepareIdempotencyContext(), {
  key: '',
  source: 'not_provided',
  scope: 'unknown:unknown',
  duplicateDetectionReady: false,
});
assert.equal(prepareIdempotencyContext({ request }).source, 'request_header');
assert.deepEqual(
  prepareIdempotencyContext({ request, parishId: 'p', requestType: 'read', idempotencyKey: ' explicit-key ' }),
  { key: 'explicit-key', source: 'explicit', scope: 'p:read', duplicateDetectionReady: false }
);
assert.throws(
  () =>
    prepareIdempotencyContext({
      idempotencyKey: 'valid-key',
      request: new Request('https://example.test', { headers: { 'Idempotency-Key': 'short' } }),
    }),
  ValidationError
);
const user = { id: 'u', extra: 'retained' },
  membership = { id: 'm' },
  capabilities = ['accounting.view'];
const database = { id: 'synthetic-db' },
  metadata = { tag: 'original' };
const context = createAccountingContext({
  request,
  parishId: 'p',
  requestType: 'read',
  capability: 'accounting.view',
  authorization: { user, membership, capabilities },
  accountingDatabase: database,
  metadata,
});
assert.equal(context.user, user);
assert.equal(context.membership, membership);
assert.equal(context.accountingDatabase, database);
assert.equal(context.audit.actorUserId, 'u');
assert.equal(context.audit.membershipId, 'm');
assert.equal(context.correlationId, 'request-id');
assert.equal(context.transaction.lifecycle, 'not_started');
assert.equal(context[ACCOUNTING_GATEWAY_CONTEXT], true);
for (const value of [
  context,
  context.request,
  context.audit,
  context.idempotency,
  context.transaction,
  context.metadata,
  context.authorization.capabilities,
])
  assert.ok(Object.isFrozen(value));
metadata.tag = 'changed';
capabilities.push('accounting.edit');
assert.equal(context.metadata.tag, 'original');
assert.deepEqual(context.authorization.capabilities, ['accounting.view']);
assert.equal(assertGatewayContext(context), context);
for (const value of [null, undefined, {}, false]) {
  assert.equal(isAccountingGatewayContext(value), false);
  assert.throws(() => assertGatewayContext(value), DomainBoundaryError);
}
assert.equal(isAccountingGatewayContext({ [ACCOUNTING_GATEWAY_CONTEXT]: 'truthy' }), true);
assert.throws(() => assertGatewayContext({ [ACCOUNTING_GATEWAY_CONTEXT]: true }), ValidationError);
assert.throws(() => createAccountingContext(), ValidationError);
for (const type of ACCOUNTING_SERVICE_TYPES) assert.equal(new AccountingService({ name: 'test', type }).type, type);
assert.throws(() => new AccountingService(), ValidationError);
assert.throws(() => new AccountingService({ name: 'test', type: 'invalid' }), ValidationError);
const operations = ['read'];
const base = new AccountingService({ name: 'test', type: 'reporting', operations });
operations.push('write');
assert.equal(base.supports('write'), false);
assert.ok(Object.isFrozen(base.operations));
await assert.rejects(() => base.invoke('read', {}), DomainBoundaryError);
await assert.rejects(() => base.invoke('write', context), ValidationError);
await assert.rejects(() => base.invoke('read', context), DomainBoundaryError);
const service = new ContractOnlyAccountingService({ name: 'test', type: 'reporting', operations: ['read'] });
const result = await service.invoke('read', context, { data: 'synthetic' });
assert.deepEqual(result, {
  ok: true,
  service: 'test',
  type: 'reporting',
  operationName: 'read',
  parishId: 'p',
  correlationId: 'request-id',
  payloadAccepted: true,
});
assert.ok(Object.isFrozen(result));
assert.equal((await service.invoke('read', context, null)).payloadAccepted, false);
await assert.rejects(() => service.handle('read', {}), DomainBoundaryError);
console.log('PASS - Accounting context and service boundary contracts');
