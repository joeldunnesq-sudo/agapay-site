import {
  createAccountingContext,
  prepareIdempotencyContext,
  requestMetadataForAccounting,
  isAccountingGatewayContext,
} from '../../src/accounting/context.js';
import {
  AccountingService,
  ContractOnlyAccountingService,
  assertGatewayContext,
} from '../../src/accounting/contracts.js';
const context = createAccountingContext({
  parishId: 'p',
  requestType: 'read',
  capability: 'accounting.view',
  authorization: { user: { id: 'u' }, membership: { id: 'm' }, capabilities: ['accounting.view'] },
  accountingDatabase: {},
});
const service = new ContractOnlyAccountingService({ name: 'report', type: 'reporting', operations: ['read'] });
void service.invoke('read', context);
// @ts-expect-error Service types are a closed vocabulary.
new AccountingService({ name: 'invalid', type: 'invalid' });
// @ts-expect-error Operations are strings.
service.supports(123);
// @ts-expect-error Configuration requires an iterable of string capabilities.
createAccountingContext({ authorization: { capabilities: [123] } });
// @ts-expect-error Metadata method must be a string.
requestMetadataForAccounting({ method: 123 });
prepareIdempotencyContext({ idempotencyKey: 12345678 });
// @ts-expect-error Context metadata is immutable.
context.metadata.changed = true;
const input: unknown = {};
isAccountingGatewayContext(input);
const checked = assertGatewayContext(input);
// @ts-expect-error Runtime marker and minimal checks do not fully type arbitrary inputs.
void checked.user.id;
