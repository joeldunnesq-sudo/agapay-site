# Phase 3D security and privacy

Close services accept only the already-resolved isolated parish database and enforce entitlement plus narrow capability. Callers must derive parish scope from the authenticated Parish Dashboard session through the existing gateway; client-supplied parish identity is never authoritative.

All mutations use parameterized statements, expected versions, stable source identifiers, and journal idempotency. Posted journals and snapshot rows are immutable. DTOs exclude raw rows, infrastructure identity, secrets, credentials, full bank details, tax identifiers, and raw provider payloads.

Route integration must send `Cache-Control: private, no-store`, exclude close and export APIs from service-worker caching, avoid browser persistence of package contents, clear state on logout or parish switching, and use background jobs for large packages. No external accountant login or weaker authentication is introduced.
