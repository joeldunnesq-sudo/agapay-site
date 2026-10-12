// Generated from src/accounting/contracts.ts by npm run build:server. Do not edit.
import { DomainBoundaryError, ValidationError } from './errors.js';
import { isAccountingGatewayContext } from './context.js';
import { validateAccountingContext } from './validation.js';
const ACCOUNTING_SERVICE_TYPES = Object.freeze([
  'donation',
  'commerce',
  'accounts_payable',
  'banking',
  'reporting',
  'migration',
  'audit',
]);
function assertGatewayContext(context) {
  if (!isAccountingGatewayContext(context)) {
    throw new DomainBoundaryError('Accounting services must be invoked through the Accounting Gateway.');
  }
  return validateAccountingContext(context);
}
class AccountingService {
  constructor({ name, type, operations = [] } = {}) {
    if (!name) throw new ValidationError('Accounting service name is required.');
    if (!ACCOUNTING_SERVICE_TYPES.includes(type)) {
      throw new ValidationError('Accounting service type is unknown.', { details: { type } });
    }
    this.name = name;
    this.type = type;
    this.operations = Object.freeze([...operations]);
  }
  supports(operationName) {
    return this.operations.includes(operationName);
  }
  async invoke(operationName, context, payload = {}) {
    assertGatewayContext(context);
    if (!this.supports(operationName)) {
      throw new ValidationError('Accounting service operation is not supported.', {
        details: { service: this.name, operationName },
      });
    }
    return this.handle(operationName, context, payload);
  }
  async handle() {
    throw new DomainBoundaryError('Accounting service contract has no implementation.');
  }
}
class ContractOnlyAccountingService extends AccountingService {
  async handle(operationName, context, payload = {}) {
    assertGatewayContext(context);
    return Object.freeze({
      ok: true,
      service: this.name,
      type: this.type,
      operationName,
      parishId: context.parishId,
      correlationId: context.correlationId,
      payloadAccepted: Boolean(payload),
    });
  }
}
export { ACCOUNTING_SERVICE_TYPES, AccountingService, ContractOnlyAccountingService, assertGatewayContext };
