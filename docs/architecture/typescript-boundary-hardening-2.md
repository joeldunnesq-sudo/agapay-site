# TypeScript boundary hardening: second checkpoint

This follows the accepted PR #244 checkpoint. The original migration inventory remains 495/495 modules. This batch removes all 119 remaining truthy-filter double assertions, reducing the inventory from 175 to 56 (173 removed since the original 229-assertion audit).

## Truthy filtering

The former Boolean casts are replaced by 28 implemented, hoisted predicates across the 30 affected source files. They retain Boolean filtering, including removal of false, zero, negative zero, NaN, zero bigint, empty strings, null and undefined; they preserve ordering, repeated object identities and sparse-array behavior. They remain filter callbacks rather than general guards for narrowing an else branch. Public compatibility type aliases remain available.

Composed browser parts retain their existing script URLs and initialization order. Donor parts share one hoisted predicate through existing typed bindings; this adds no runtime import or network dependency. The Donor output stays within its unchanged 2,553-line budget (2,552 lines). No source-size limit was raised.

## JSON boundaries

Parish support-ticket storage now checks object shape, declared string fields, nested email metadata and the storage ID before returning a ticket. Legacy omitted display/admin fields receive empty-string defaults, missing status retains the established new default, and omitted email metadata becomes null. Unknown metadata and future string statuses remain supported. Invalid canonical D1 records suppress stale KV fallbacks; reads never repair, delete or rewrite records. Tests cover actual SQLite queries, KV fallback, rejected updates, legacy defaults and current-writer round trips without real email delivery.

Email-provider JSON is parsed as unknown and projected into checked metadata. Message IDs must be strings; empty, malformed, null, array and primitive responses produce no unchecked ID. HTTP success/rejection remains authoritative. In particular, JSON null no longer turns an accepted/rejected HTTP response into a spurious transport failure. Original deadlines, idempotency headers, response bodies, failure details and credential-safe logs are preserved. Every provider request in the new regressions is intercepted.

## Validation and release

Focused emitted-predicate behavior/hoisting/caller-contract regressions, support-ticket/provider JSON tests and the existing notification regressions pass. Local validation passed all 324 platform commands and four prechecks; complete Quality (four strict projects, 57 owned Worker declarations, 17,114 checked parameter occurrences without inferred any, 1,922 linted files with zero errors and the six unchanged warnings, formatting, generated assets, source budgets and immutable migration ledger); Worker startup profiling; and private provisioner dry-run packaging. Protected staging and production acceptance remain pending.

## Remaining scope

56 double assertions remain: nullable DOM/string assignments, dynamic form/property lookups, database/proxy adapters and staged PDF state. Additional external JSON payloads still require domain-specific review; this checkpoint does not claim full application JSON validation.

Evidence and the remaining inventory are retained locally under ignored tmp-release-hardening-2/. Credentials and evidence artifacts are not committed.
