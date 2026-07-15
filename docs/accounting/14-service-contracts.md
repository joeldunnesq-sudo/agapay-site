# AGAPAY Accounting Package 0.75E -- Service Contracts

## 1. Gateway Contract

The public gateway surface is intentionally small:

- `buildContext(request, env, options)`
- `invokeService(service, operationName, request, env, options, payload)`

There is no method for selecting a raw binding, opening a ledger database, posting a journal entry, or creating accounting records.

Gateway options:

| Field | Purpose |
|---|---|
| `parishId` | Tenant/accounting entity candidate, authorized server-side |
| `capability` | Required accounting-adjacent capability |
| `requestType` | Stable request/action name for audit and idempotency scope |
| `idempotencyKey` | Optional explicit idempotency input |
| `metadata` | Non-authoritative request metadata |
| `environment` | Resolver hint; not a database identifier |

## 2. Accounting Context Contract

Accounting Context contains:

- `user`
- `membership`
- `authorization`
- `parishId`
- `requestType`
- `correlationId`
- `request`
- `audit`
- `idempotency`
- `accountingDatabase`
- `transaction`
- `metadata`

The object is immutable and marked with an internal gateway symbol. Service contracts reject unmarked objects.

## 3. Service Interface

`AccountingService` is a base contract for future services. A service declares:

- `name`
- `type`
- supported operation names

Allowed service types today:

- `donation`
- `commerce`
- `accounts_payable`
- `banking`
- `reporting`
- `migration`
- `audit`

The base class does not implement accounting. `ContractOnlyAccountingService` exists only for tests and future contract examples.

## 4. Error Model

The taxonomy in `src/accounting/errors.js` is:

- `AccountingError`
- `AuthorizationError`
- `CapabilityDeniedError`
- `AccountingConfigurationError`
- `AccountingDatabaseError`
- `ClosedPeriodError`
- `ValidationError`
- `MappingError`
- `PostingError`
- `DuplicatePostingError`
- `MigrationError`
- `DomainBoundaryError`

These are names future services can consistently throw. They do not imply the underlying business logic exists yet.

## 5. Validation Model

Validation is centralized in `src/accounting/validation.js`:

- gateway request validation
- accounting-adjacent capability validation
- idempotency-key validation
- accounting-context validation

Future validation should extend this layer rather than creating one-off validation in route handlers.

## 6. Database Resolver Contract

The resolver returns an accounting database resolution object with:

- status
- parish ID
- environment
- optional future binding handle
- optional future registry record
- reason

It must not expose `bindingName` or `databaseId` to services. `assertAccountingDatabaseResolution()` rejects those fields.
