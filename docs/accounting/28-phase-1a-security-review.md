# Phase 1A Security Review

## Summary

Phase 1A strengthens accounting isolation by adding a server-side control-plane resolver and rejecting client-supplied database identity.

## Controls

| Risk | Control |
| --- | --- |
| Browser supplies a database identifier | Resolver accepts parish context only and never trusts arbitrary database names. |
| Cross-parish resolution | `resolveAccountingControlPlaneDatabase()` requires requested parish and authenticated parish to match. |
| Physical database identifier leakage | Resolver output omits `database_identifier`. Tests assert the secret identifier is absent from serialized output. |
| Suspended or archived accounting use | Validation blocks suspended and archived entities. |
| Registry inconsistency | Validation catches provisioning mismatch, missing schema version, missing database row, and blocked health states. |
| Unreviewed lifecycle changes | Lifecycle operations write durable audit rows and lifecycle-event rows. |
| Ledger data in central registry | Migration creates only control-plane tables; no ledger, journal, fund, account, balance, AP, reconciliation, or report tables. |
| JSON blob persistence | Registry schema uses typed relational columns. |

## Residual Risk

Phase 1A does not create actual per-parish D1 databases or bind them to Workers. Phase 1B must preserve this resolver boundary when provisioning real resources.

## Security Verdict

Accepted for Phase 1A. The package creates the registry and resolver boundary needed before provisioning, without introducing accounting data or ledger write paths.
