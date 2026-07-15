# AGAPAY Accounting Package 0.75E -- Accounting Gateway Architecture

## 1. Purpose

The Accounting Gateway is the single approved entry point into the accounting domain. It exists before ledger tables, posting, journals, AP, reconciliation, or reporting exist, so future accounting work starts behind one secure boundary instead of growing entry points one feature at a time.

This package deliberately does not build accounting. It creates the doorway accounting must later pass through.

## 2. Responsibilities

The gateway owns the cross-cutting concerns that must happen before any accounting service runs:

- request validation
- platform-user authentication through the Package 0.75C identity layer
- parish membership and capability authorization through Package 0.75D
- Accounting Context creation
- correlation ID capture
- audit-context initiation
- idempotency-context preparation
- accounting database resolution through an abstraction
- service-contract invocation

The gateway does not own:

- ledger rules
- double-entry balancing
- chart of accounts
- funds
- mappings
- journal creation
- posting
- AP
- banking
- reconciliation
- reports

Those belong to later packages.

## 3. Request Lifecycle

The lifecycle established by `src/accounting/gateway/index.js` is:

1. A route or future worker entry point calls `accountingGateway.buildContext()` or `accountingGateway.invokeService()`.
2. `validateGatewayRequest()` verifies parish ID, request type, and accounting-adjacent capability.
3. The gateway calls the existing `authorize()` helper from `src/lib/authorization.js`.
4. If authorization fails, the gateway throws `CapabilityDeniedError` and never resolves a database.
5. If authorization succeeds, the gateway calls `resolveAccountingDatabase()`.
6. The resolver returns an abstract accounting database resolution object. Today that object is intentionally `unconfigured`.
7. The gateway creates an immutable Accounting Context.
8. The gateway records `accounting.gateway.request_started` in the central audit log.
9. If a service is supplied, the gateway invokes the service with the gateway-created context.

## 4. Accounting Context

Future accounting code receives one object containing:

- authenticated platform user
- active parish membership
- granted capability list
- the capability used for this request
- parish ID
- request type
- correlation ID
- request metadata
- audit metadata
- idempotency metadata
- accounting database resolution
- future transaction metadata

No accounting service should independently re-authenticate, re-query membership, or choose a database binding.

## 5. Database Resolution

`src/accounting/database-resolution.js` creates the future database-resolution boundary. It does not bind a D1 database and does not query an accounting registry yet.

Today the default resolver returns:

- `status: "unconfigured"`
- no binding
- no registry record
- no raw binding name
- no raw database ID

This is intentional. Future registry work can replace the resolver internals without changing service code.

## 6. Audit and Idempotency

The gateway starts a central audit event for accounting-domain requests. It does not create accounting audit tables or accounting audit records.

The gateway also prepares an idempotency context from an explicit idempotency key or the `Idempotency-Key` request header. It does not implement duplicate detection yet.

## 7. Future Lifecycle

Later packages may extend the inside of the gateway with:

- registry-backed accounting database resolution
- transaction lifecycle orchestration
- duplicate-detection persistence
- queue/workflow correlation
- posting-engine invocation
- accounting-local audit records

They should not add new accounting entry points outside this gateway.
