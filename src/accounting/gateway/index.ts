import type { AccountingContext } from '../context.js';
import type { AccountingDatabaseResolution, AccountingResolutionOptions } from '../database-resolution.js';
export type GatewayContext = AccountingContext & {
  user: { id: string };
  membership: { id: string };
  parishId: string;
  requestType: string;
  accountingDatabase: AccountingDatabaseResolution;
};
export interface GatewayOptions {
  parishId?: string;
  capability?: string;
  requestType?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
  environment?: string;
}
interface GatewayDependencies {
  databaseResolver?: (env: Partial<Env>, options: AccountingResolutionOptions) => Promise<AccountingDatabaseResolution>;
  auditSink?: ((env: Partial<Env>, request: Request, context: GatewayContext) => Promise<void>) | null;
}
// AGAPAY Accounting Package 0.75E -- Accounting Gateway.
//
// This module is the only approved entry point into the accounting domain.
// It authorizes, resolves the future accounting database abstraction,
// creates Accounting Context, and then invokes service contracts. It does
// not post, journal, reconcile, or build ledger behavior.

import { authorize } from '../../lib/authorization.js';
import { recordAuditEvent } from '../../lib/audit-log.js';
import { CapabilityDeniedError } from '../errors.js';
import { resolveAccountingDatabase, assertAccountingDatabaseResolution } from '../database-resolution.js';
import { createAccountingContext } from '../context.js';
import { validateGatewayRequest } from '../validation.js';

async function defaultAuditSink(env: Partial<Env>, request: Request, context: GatewayContext) {
  await recordAuditEvent(env, request, {
    action: 'accounting.gateway.request_started',
    actorUserId: context.user.id,
    actorType: 'platform_user',
    targetType: 'accounting_gateway',
    targetId: context.requestType,
    organizationId: context.parishId,
    requestId: context.correlationId,
    metadata: {
      capability: context.authorization.capability,
      membershipId: context.membership.id,
      accountingDatabaseStatus: context.accountingDatabase.status,
      idempotencySource: context.idempotency.source,
    },
  });
}

export function createAccountingGateway({
  databaseResolver = resolveAccountingDatabase,
  auditSink = defaultAuditSink,
}: GatewayDependencies = {}) {
  async function buildContext(
    request: Request,
    env: Partial<Env>,
    {
      parishId,
      capability,
      requestType,
      idempotencyKey = '',
      metadata = {},
      environment = 'production',
    }: GatewayOptions = {}
  ) {
    const validated = validateGatewayRequest({ parishId, capability, requestType });

    const authorization = await authorize(request, env, {
      parishId: validated.parishId,
      capability: validated.capability,
    });

    if (!authorization) {
      throw new CapabilityDeniedError('Accounting Gateway authorization failed.', {
        details: {
          parishId: validated.parishId,
          capability: validated.capability,
          requestType: validated.requestType,
        },
      });
    }

    const accountingDatabase = assertAccountingDatabaseResolution(
      await databaseResolver(env, {
        parishId: validated.parishId,
        environment,
        requestType: validated.requestType,
      })
    );

    const context = createAccountingContext({
      request,
      parishId: validated.parishId,
      requestType: validated.requestType,
      capability: validated.capability,
      authorization,
      accountingDatabase,
      idempotencyKey,
      metadata,
    });

    if (auditSink) await auditSink(env, request, context as GatewayContext);
    return context as GatewayContext;
  }

  async function invokeService(
    service: { invoke(operation: string, context: GatewayContext, payload: Record<string, unknown>): unknown },
    operationName: string,
    request: Request,
    env: Partial<Env>,
    options: GatewayOptions = {},
    payload: Record<string, unknown> = {}
  ) {
    const context = await buildContext(request, env, options);
    return service.invoke(operationName, context, payload);
  }

  return Object.freeze({
    buildContext,
    invokeService,
  });
}

export const accountingGateway = createAccountingGateway();
