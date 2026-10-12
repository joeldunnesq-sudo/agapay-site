import { AccountingError, ValidationError } from '../../src/accounting/errors.js';
import {
  requireNonEmptyString,
  validateAccountingContext,
  validateGatewayRequest,
  validateIdempotencyKey,
} from '../../src/accounting/validation.js';
const error = new ValidationError('invalid', { code: 'custom', status: 422, details: { field: 'x' } });
const base: AccountingError = error;
const status: number = base.status;
void status;
// @ts-expect-error Error status must be numeric.
new ValidationError('invalid', { status: '422' });
// @ts-expect-error Error code must be a string.
new AccountingError('invalid', { code: 422 });
// @ts-expect-error Arbitrary error details require narrowing.
void error.details.field;
const value: string = requireNonEmptyString({ input: 'unvalidated' }, 'input');
void value;
const request = validateGatewayRequest({ parishId: null, capability: undefined, requestType: 1 });
const parishId: string = request.parishId;
void parishId;
// @ts-expect-error Request type must be supplied for validation.
validateGatewayRequest({ parishId: 'p', capability: 'accounting.view' });
const key: string = validateIdempotencyKey(12345678);
void key;
const context = { extra: 'preserved', user: { id: 123 } };
const returned: typeof context = validateAccountingContext(context);
void returned;
const unvalidated: unknown = {};
const validated = validateAccountingContext(unvalidated);
// @ts-expect-error Legacy truthiness checks do not establish a fully typed context.
void validated.user.id;
