# AGAPAY Accounting Package 0.75E -- Accounting Domain Boundaries

## 1. Boundary Rule

Every future accounting operation enters through the Accounting Gateway. No route handler, background job, service, or UI layer should call future ledger, posting, journal, AP, banking, reconciliation, or reporting internals directly.

The path is:

Route or worker entry point -> authentication -> membership/capability authorization -> Accounting Gateway -> Accounting Service -> future posting engine -> future ledger.

## 2. What Belongs Inside Accounting

The accounting domain eventually owns:

- Accounting Gateway
- Accounting Context
- accounting database resolution
- accounting service contracts
- accounting validation
- accounting error taxonomy
- future chart of accounts
- future funds
- future journal entries and lines
- future posting engine
- future period close/reopen rules
- future AP
- future banking and reconciliation
- future reports
- future accounting audit trail
- future accounting migration and restore validation

## 3. What Stays Outside Accounting

The following remain operational domains and should not become ledger implementations:

- AGAPAY Give checkout and donor workflows
- Stripe webhook ingestion
- commerce order capture
- settlement profiles
- tax exemption workflow
- Learn
- marketplace/directory/content modules
- parish-dashboard legacy bearer authentication
- central platform-user identity and membership storage

Operational modules may provide source events. The accounting domain decides how those events are recorded later.

## 4. Interaction Rules

- A caller supplies a parish ID, request type, and required capability to the gateway.
- A caller never supplies a physical database binding name.
- A caller never supplies a raw accounting database ID.
- A caller never writes journal tables.
- A caller never constructs a fake Accounting Context.
- A service rejects calls not carrying a gateway-created context.
- Authorization happens before database resolution.
- Database resolution happens before service invocation.
- Auditing starts at the gateway boundary.

## 5. Examples

Permitted future pattern:

```js
await accountingGateway.invokeService(service, "preview", request, env, {
  parishId,
  capability: "accounting.view",
  requestType: "future.reporting.preview"
});
```

Forbidden future pattern:

```js
await env.AGAPAY_DB.prepare("INSERT INTO journal_lines ...").run();
```

Also forbidden:

```js
await postingEngine.post({ parishId, bindingName: clientSuppliedBinding });
```

## 6. Current Enforcement

`AccountingService.invoke()` requires a gateway-created context and throws `DomainBoundaryError` otherwise. The gateway strips caller options down to the resolver-safe fields `parishId`, `environment`, and `requestType`, so raw binding identifiers are not forwarded.

These tests live in `scripts/accounting-gateway-tests.mjs`.
