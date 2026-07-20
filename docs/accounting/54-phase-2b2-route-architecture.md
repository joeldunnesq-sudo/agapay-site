# Phase 2B.2 authenticated route architecture

Phase 2B.2 exposes the existing journal and register services beneath `/api/parish/dashboard/:parishId/accounting`. The path parish is never accepted as authority: the established platform membership authorization must prove the caller belongs to that parish and holds the narrow capability.

Every request verifies Mission/Parish Accounting entitlement, a `ready` control-plane entity, a `ready` and `healthy` database registry record, and the opaque provider database resolved server-side. The Cloudflare D1 REST adapter is wrapped in a prepared-statement facade so handlers reuse domain services rather than duplicating SQL or posting logic. Physical names and provider IDs never enter DTOs.

Implemented routes cover journal list/create/detail/edit/validate/post, General Ledger and account/fund registers, CSV register export, and print-friendly General Ledger output. Responses use `Cache-Control: private, no-store` and safe error envelopes. Posting remains the Phase 1C idempotent atomic service.

Production requires server-only `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` secrets with least-privilege D1 access. Without those secrets the dynamic database adapter fails closed. The browser must never receive either value.
