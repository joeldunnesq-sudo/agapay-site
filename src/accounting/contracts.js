// AGAPAY Accounting Package 0.75E -- Accounting service contracts.
//
// This file defines how future services are called. It does not implement
// donation posting, commerce posting, AP, banking, reconciliation, or
// reports.

import { DomainBoundaryError, ValidationError } from "./errors.js";
import { isAccountingGatewayContext } from "./context.js";
import { validateAccountingContext } from "./validation.js";

export const ACCOUNTING_SERVICE_TYPES = Object.freeze([
  "donation",
  "commerce",
  "accounts_payable",
  "banking",
  "reporting",
  "migration",
  "audit"
]);

export function assertGatewayContext(context) {
  if (!isAccountingGatewayContext(context)) {
    throw new DomainBoundaryError("Accounting services must be invoked through the Accounting Gateway.");
  }
  return validateAccountingContext(context);
}

export class AccountingService {
  constructor({ name, type, operations = [] } = {}) {
    if (!name) throw new ValidationError("Accounting service name is required.");
    if (!ACCOUNTING_SERVICE_TYPES.includes(type)) {
      throw new ValidationError("Accounting service type is unknown.", { details: { type } });
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
      throw new ValidationError("Accounting service operation is not supported.", {
        details: { service: this.name, operationName }
      });
    }
    return this.handle(operationName, context, payload);
  }

  async handle() {
    throw new DomainBoundaryError("Accounting service contract has no implementation.");
  }
}

export class ContractOnlyAccountingService extends AccountingService {
  async handle(operationName, context, payload = {}) {
    assertGatewayContext(context);
    return Object.freeze({
      ok: true,
      service: this.name,
      type: this.type,
      operationName,
      parishId: context.parishId,
      correlationId: context.correlationId,
      payloadAccepted: Boolean(payload)
    });
  }
}
