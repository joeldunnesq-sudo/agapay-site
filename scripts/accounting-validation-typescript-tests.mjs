import assert from 'node:assert/strict';
import * as errors from '../src/accounting/errors.js';
import {
  requireNonEmptyString,
  validateAccountingCapability,
  validateGatewayRequest,
  validateIdempotencyKey,
  validateAccountingContext,
} from '../src/accounting/validation.js';
const cases = [
  ['AccountingError', 'accounting_error', 500],
  ['AuthorizationError', 'accounting_authorization_error', 401],
  ['CapabilityDeniedError', 'accounting_capability_denied', 403],
  ['AccountingConfigurationError', 'accounting_configuration_error', 409],
  ['AccountingDatabaseError', 'accounting_database_error', 503],
  ['ClosedPeriodError', 'accounting_closed_period', 409],
  ['ValidationError', 'accounting_validation_error', 422],
  ['MappingError', 'accounting_mapping_error', 409],
  ['PostingError', 'accounting_posting_error', 409],
  ['DuplicatePostingError', 'accounting_duplicate_posting', 409],
  ['MigrationError', 'accounting_migration_error', 500],
  ['DomainBoundaryError', 'accounting_domain_boundary_error', 500],
];
for (const [name, code, status] of cases) {
  const ErrorType = errors[name];
  const error = name === 'AccountingError' ? new ErrorType('base') : new ErrorType();
  assert.ok(error instanceof Error);
  assert.ok(error instanceof errors.AccountingError);
  assert.equal(error.name, name);
  assert.equal(error.code, code);
  assert.equal(error.status, status);
  assert.ok(error.message.length);
  assert.deepEqual(error.details, {});
  const details = { field: 'synthetic' };
  const override = new ErrorType('custom', { code: 'custom_code', status: 418, details });
  assert.equal(override.message, 'custom');
  assert.equal(override.code, 'custom_code');
  assert.equal(override.status, 418);
  assert.equal(override.details, details);
  assert.equal(new ErrorType('custom', { details: null }).details, null);
}
assert.ok(new errors.CapabilityDeniedError() instanceof errors.AuthorizationError);
assert.ok(new errors.DuplicatePostingError() instanceof errors.PostingError);
function rejects(fn, field) {
  assert.throws(
    fn,
    (error) => error instanceof errors.ValidationError && error.status === 422 && error.details.field === field
  );
}
for (const value of ['', '  ', null, undefined, 12, {}, []])
  rejects(() => requireNonEmptyString(value, 'name'), 'name');
assert.equal(requireNonEmptyString('  parish  ', 'name'), 'parish');
for (const domain of ['accounting.', 'ap.', 'bank.'])
  assert.equal(validateAccountingCapability(` ${domain}view `), `${domain}view`);
for (const capability of ['parish.view', 'Accounting.view', 'accounting'])
  assert.throws(() => validateAccountingCapability(capability), errors.ValidationError);
assert.deepEqual(validateGatewayRequest({ parishId: ' p ', capability: ' accounting.view ', requestType: ' read ' }), {
  parishId: 'p',
  capability: 'accounting.view',
  requestType: 'read',
});
rejects(() => validateGatewayRequest({ parishId: 'p', capability: 'accounting.view' }), 'requestType');
for (const value of [null, undefined, '']) assert.equal(validateIdempotencyKey(value), '');
for (const size of [8, 200]) assert.equal(validateIdempotencyKey(` ${'x'.repeat(size)} `), 'x'.repeat(size));
for (const value of [' ', 'x'.repeat(7), 'x'.repeat(201)])
  rejects(() => validateIdempotencyKey(value), 'idempotencyKey');
assert.equal(validateIdempotencyKey(12345678), '12345678');
const context = {
  parishId: ' p ',
  requestType: ' read ',
  correlationId: ' c ',
  user: { id: 'u' },
  membership: { id: 'm' },
  authorization: { capability: 'accounting.view' },
  accountingDatabase: {},
  extra: 'preserved',
};
assert.equal(validateAccountingContext(context), context);
assert.equal(context.parishId, ' p ');
for (const value of [null, undefined, '', false, 1]) rejects(() => validateAccountingContext(value), 'context');
for (const field of ['parishId', 'requestType', 'correlationId'])
  rejects(() => validateAccountingContext({ ...context, [field]: ' ' }), `context.${field}`);
for (const [key, field] of [
  ['user', 'context.user'],
  ['membership', 'context.membership'],
  ['authorization', 'context.authorization.capability'],
  ['accountingDatabase', 'context.accountingDatabase'],
]) {
  for (const value of [null, undefined, false])
    rejects(() => validateAccountingContext({ ...context, [key]: value }), field);
}
// Preserve the existing truthiness checks without claiming stronger validation.
const truthy = {
  ...context,
  user: { id: 1 },
  membership: { id: true },
  authorization: { capability: {} },
  accountingDatabase: true,
};
assert.equal(validateAccountingContext(truthy), truthy);
console.log('PASS - Accounting error taxonomy and validation boundary regressions');
