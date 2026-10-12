// AGAPAY Accounting Package 0.75E -- Accounting service contracts.
//
// This file defines how future services are called. It does not implement
// donation posting, commerce posting, AP, banking, reconciliation, or
// reports.

import { DomainBoundaryError, ValidationError } from './errors.js';
import type { AccountingContext } from './context.js';

import { isAccountingGatewayContext } from './context.js';
import { validateAccountingContext } from './validation.js';

export const ACCOUNTING_SERVICE_TYPES = Object.freeze([
  'donation',
  'commerce',
  'accounts_payable',
  'banking',
  'reporting',
  'migration',
  'audit',
] as const);

export type AccountingServiceType = (typeof ACCOUNTING_SERVICE_TYPES)[number];
export interface AccountingServiceOptions {
  name?: string;
  type?: AccountingServiceType;
  operations?: Iterable<string>;
}

export function assertGatewayContext<T>(context: T) {
  if (!isAccountingGatewayContext(context)) {
    throw new DomainBoundaryError('Accounting services must be invoked through the Accounting Gateway.');
  }
  return validateAccountingContext(context);
}

export class AccountingService {
  declare name: string;
  declare type: AccountingServiceType;
  declare operations: readonly string[];
  constructor({ name, type, operations = [] }: AccountingServiceOptions = {}) {
    if (!name) throw new ValidationError('Accounting service name is required.');
    if (!(ACCOUNTING_SERVICE_TYPES as readonly unknown[]).includes(type)) {
      throw new ValidationError('Accounting service type is unknown.', { details: { type } });
    }
    this.name = name;
    this.type = type!;
    this.operations = Object.freeze([...operations]);
  }

  supports(operationName: string) {
    return this.operations.includes(operationName);
  }

  async invoke(operationName: string, context: AccountingContext, payload: unknown = {}) {
    assertGatewayContext(context);
    if (!this.supports(operationName)) {
      throw new ValidationError('Accounting service operation is not supported.', {
        details: { service: this.name, operationName },
      });
    }
    return this.handle(operationName, context, payload);
  }

  handle(operationName: string, context: AccountingContext, payload?: unknown): Promise<unknown>;
  async handle(): Promise<unknown> {
    throw new DomainBoundaryError('Accounting service contract has no implementation.');
  }
}

export class ContractOnlyAccountingService extends AccountingService {
  async handle(operationName: string, context: AccountingContext, payload: unknown = {}) {
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
