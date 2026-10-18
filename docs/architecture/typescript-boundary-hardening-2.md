# TypeScript boundary hardening: second checkpoint

This follows the accepted PR #244 checkpoint. The original migration inventory remains 495/495 modules. This batch removes all 119 remaining truthy-filter double assertions, reducing the inventory from 175 to 56 (173 removed since the original 229-assertion audit).

## Truthy filtering

The former Boolean casts are replaced by 28 implemented, hoisted predicates across the 30 affected source files. They retain Boolean filtering, including removal of false, zero, negative zero, NaN, zero bigint, empty strings, null and undefined; they preserve ordering, repeated object identities and sparse-array behavior. They remain filter callbacks rather than general guards for narrowing an else branch. Public compatibility type aliases remain available.

Composed browser parts retain their existing script URLs and initialization order. Donor parts share one hoisted predicate through existing typed bindings; this adds no runtime import or network dependency. The Donor output stays within its unchanged 2,553-line budget (2,552 lines). No source-size limit was raised.

## JSON boundaries

Parish support-ticket storage now checks object shape, declared string fields, nested email metadata and the storage ID before returning a ticket. Legacy omitted display/admin fields receive empty-string defaults, missing status retains the established new default, and omitted email metadata becomes null. Unknown metadata and future string statuses remain supported. Invalid canonical D1 records suppress stale KV fallbacks; reads never repair, delete or rewrite records. Tests cover actual SQLite queries, KV fallback, rejected updates, legacy defaults and current-writer round trips without real email delivery.

Email-provider JSON is parsed as unknown and projected into checked metadata. Message IDs must be strings; empty, malformed, null, array and primitive responses produce no unchecked ID. HTTP success/rejection remains authoritative. In particular, JSON null no longer turns an accepted/rejected HTTP response into a spurious transport failure. Original deadlines, idempotency headers, response bodies, failure details and credential-safe logs are preserved. Every provider request in the new regressions is intercepted.

## Validation and release

Focused emitted-predicate behavior/hoisting/caller-contract regressions, support-ticket/provider JSON tests and the existing notification regressions pass. Local validation passed all 324 platform commands and four prechecks; complete Quality (four strict projects, 57 owned Worker declarations, 17,114 checked parameter occurrences without inferred any, 1,922 linted files with zero errors and the six unchanged warnings, formatting, generated assets, source budgets and immutable migration ledger); Worker startup profiling; and private provisioner dry-run packaging. Protected staging and production acceptance passed through PR #245; production serves 5687c23517f11a4cb1ba88905dda884b34245e56, stamped 2026-10-17T14:41:59Z.

## Remaining scope

56 double assertions remain: nullable DOM/string assignments, dynamic form/property lookups, database/proxy adapters and staged PDF state. Additional external JSON payloads still require domain-specific review; this checkpoint does not claim full application JSON validation.

Evidence and the remaining inventory are retained locally under ignored tmp-release-hardening-2/. Credentials and evidence artifacts are not committed.

## Protected release acceptance

PR [#245](https://github.com/joeldunnesq-sudo/agapay-site/pull/245) merged source e7b5ce27659e860c8557b98dc0aa591ff2335454 as 5687c23517f11a4cb1ba88905dda884b34245e56; their trees are identical. Protected production [run 39041231592](https://github.com/joeldunnesq-sudo/agapay-site/actions/runs/39041231592), attempt 1, passed Test, Quality, Deploy and authenticated Accounting smoke. Production was stamped at 2026-10-17T14:41:59Z. Main Worker version: 7198775b-ce17-470c-832d-4b9d5102f61f; private Accounting provisioner version: 4e0990cc-13bf-4c6b-8789-e740d7e62962.

- Local, exact-source PR, protected staging and protected main passed all 324 platform commands and four prechecks. Quality logs independently confirm four strict projects, 57 owned Worker declarations, 17,114 runtime parameter occurrences without inferred any, 1,922 linted files with zero errors and the six unchanged warnings, generated output/content versions, formatting, unchanged source budgets and the immutable migration ledger.
- PR CodeQL security policy passed with no new alerts; main CodeQL passed.
- Five hosted staging suites passed, including exact deployed assets and page versions. Normal-MFA Giving/catalog acceptance passed with catalog restoration and upload deletion; all seven private-document checks passed.
- Six hosted production suites and all 16 deployed-asset PDF downloads passed. Normal-MFA production acceptance passed 18 checks, with 1 allowed existing-bill attachment skip because the dedicated test parish has no existing bill.
- Six spaced health probes retained the merged SHA and stamped deployment after the automatic Cloudflare build and protected deployment.

Evidence is retained locally under ignored tmp-release-hardening-2/: local-validation.json, staging-acceptance.json, production-validation.json, authenticated artifacts, hosted logs, assertion inventory and stable-health.json. No MFA, billing, entitlement, release-permission, dependency version or size-budget configuration was changed.

## Subsequent checkpoint

The accepted [third hardening checkpoint](typescript-boundary-hardening-3.md), PR [#246](https://github.com/joeldunnesq-sudo/agapay-site/pull/246), removes 20 further double assertions (56 to 36) and validates stored feature-request JSON without discarding malformed records. It deploys as b0f73443298f6ab2ca5021db616102de422e04f1. The acceptance above remains the historical record for the second checkpoint.
