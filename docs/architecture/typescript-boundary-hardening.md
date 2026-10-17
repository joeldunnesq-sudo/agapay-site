# TypeScript boundary hardening: first checkpoint

This follows the accepted migration audit in PR #243. The original migration inventory remains 495/495 modules. This checkpoint reduces double assertions from 229 to 175 across the TypeScript source inventory.

## Changes

- Replace 26 double assertions in Date arithmetic, sorting and validity checks with explicit numeric conversion. Compiler inspection confirms the operands are Dates, including the invalid-Date cases whose numeric result remains NaN.
- Replace 23 numeric DOM double assertions with explicit string conversion for counters, dataset values, SVG attributes and CSS animation values. Nullable text assignments and generic dynamic input values remain for separate review.
- Replace the academic-term truthy predicate assertion with a real Boolean predicate, retaining the original filtering behavior.
- Validate Learn community-resource and feedback JSON before treating it as a domain record. Reject arrays, primitives, malformed JSON, invalid declared field types, invalid nested flags/notifications and mismatched storage IDs. Preserve unknown metadata and legacy optional fields. Feedback records that omit status keep the established new default.
- Preserve canonical D1 precedence even when its record is invalid: reads return no record and lists suppress stale KV/seed copies for that storage ID. KV-only invalid records also suppress seeded copies. Reads never rewrite or delete stored data. These are deliberate fail-closed changes for malformed records; normal valid writes and reads retain their behavior.
- Register the new validator as an authoritative TypeScript runtime module with its adjacent generated JavaScript path, and include its tests and formatting in the existing gates.

## Validation

The focused regression suite exercises canonical and KV readers, malformed records, nested shapes, identity binding, legacy defaults, writer round trips, and canonical shadowing without network calls or sending email. Local validation passed all 322 platform commands and four prechecks, complete Quality (four strict projects, 57 owned Worker declarations, 17,082 runtime parameter occurrences with no inferred any, 1,920 linted files with zero errors and the six unchanged warnings, formatting, generated assets, source budgets and immutable migration ledger), Worker startup profiling and private provisioner dry-run packaging. Protected staging and production acceptance passed through PR #244; production serves 2f5a0adbfc5a65ad1e029b64c47f3aacc834ca83, stamped 2026-10-17T05:32:44Z.

## Remaining scope

175 double assertions remain, including shared truthy-filter adapters, nullable DOM assignments, dynamic object/database/proxy adapters and staged PDF state. Additional external JSON readers and API responses still need domain-specific validation. This checkpoint does not certify all application JSON or remove assertions by substituting unchecked single casts.

Detailed inventory and release evidence are retained locally in ignored tmp-release-hardening-1/. Credentials and evidence artifacts are not committed.

## Protected release acceptance

PR [#244](https://github.com/joeldunnesq-sudo/agapay-site/pull/244) merged source 5a8d5699234841159410814774220b2c36b644cb as 2f5a0adbfc5a65ad1e029b64c47f3aacc834ca83; their trees are identical. Protected production [run 39006118644](https://github.com/joeldunnesq-sudo/agapay-site/actions/runs/39006118644), attempt 1, passed Test, Quality, Deploy and authenticated Accounting smoke. Production was stamped at 2026-10-17T05:32:44Z. Main Worker version: 80946353-c4ff-46c4-b8cd-ecbdec8f4f00; private Accounting provisioner version: de1b370e-fd52-499a-942f-5a3da979035c.

- Local, exact-source PR, protected staging and protected main each passed all 322 platform commands and four prechecks. Quality logs independently confirm all four strict projects, 57 owned Worker declarations, 17,082 runtime parameter occurrences without inferred any, 1,920 linted files with zero errors and the six unchanged warnings, and the existing asset, formatting, size-budget and immutable-ledger gates.
- PR CodeQL security policy passed with no new alerts; main CodeQL passed.
- All five hosted staging suites passed, including exact deployed assets and page versions. Normal-MFA Giving/catalog acceptance passed with catalog restoration and upload deletion; all seven private-document checks passed.
- All six hosted production suites and all 16 deployed-asset PDF downloads passed. Normal-MFA production acceptance passed 18 checks, with 1 allowed existing-bill skip because the dedicated test parish has no existing bill.
- Six spaced production health probes confirmed the same merged SHA and stamped deployment after the automatic Cloudflare build and protected deployment.

Release evidence is retained locally under ignored tmp-release-hardening-1/, including local-validation.json, staging-acceptance.json, production-validation.json, authenticated artifacts, hosted-suite logs, the assertion inventory and stable-health.json. No MFA, billing, entitlement, release-permission or size-budget configuration was changed.
