# Accounting access during a Parish trial

Accounting eligibility follows the saved registration's subscription entitlement,
including an active Parish trial or Give + Accounting add-on. A parish name or
test allowlist does not grant access. Pending checkout, ended subscriptions and
expired trials do not unlock Accounting. Existing active legacy grants remain
honored, and the explicit Accounting disable flag remains authoritative.

The common parish dashboard payload returns `accountingAvailable` alongside the
same Accounting entitlement. Authenticated APIs recheck the saved registration;
browser flags never authorize access. Named staff or platform capability checks
still apply to every request for books.

Subscription entitlement does not prove that a parish has provisioned books.
`GET /api/parish/dashboard/:parish/accounting-access/profiles` verifies the parish
session and returns a small readiness status, without exposing database names or
creating profiles, registry rows or books. A missing entity is `setup_required`;
inactive, suspended, incomplete or unhealthy books are `unavailable`. The
dashboard explains that setup is required and no additional upgrade is needed.
Ledger access still checks the registry, environment, activation and health.

Giving catalog edits remain possible before the first books are registered.
Once an entity or existing fund links exist, synchronization must succeed before
an edit is accepted; an unhealthy or missing database cannot silently detach the
giving catalog from existing books.

## Operational limitation

This change does not provision production databases on subscription upgrade.
That path is not currently wired into billing. Production still requires a
dedicated parish database, the complete ordered migration sequence, a server-side
binding, verified ownership, and normal registry activation and validation. The
existing prepared staging activation endpoint remains unavailable in production.
Do not substitute another parish's database or mark a partial database ready.

On 2026-08-31, Test Lubbock's production registration had an active Parish trial
ending 2026-09-12T01:25:41.483Z, but no Accounting entity or database registry row.
The entitlement fix removes the incorrect demo-only restriction; operational
Accounting smoke tests for that parish still require provisioning its books.

Regression coverage: `scripts/accounting-trial-access-tests.mjs` exercises the
real access handler and staff authorization against SQLite fixtures, including
tenant separation and mutation-free readiness reads. The parish dashboard
runtime tests cover the setup state for both parish and platform sessions.
