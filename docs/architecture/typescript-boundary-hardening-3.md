# TypeScript boundary hardening: third checkpoint

This checkpoint follows PR #245. The frozen migration inventory remains 495/495 modules (100%); assertion and external-JSON hardening continues separately. This batch removes 20 of the remaining 56 double assertions, leaving 36. No double assertion was replaced by an unchecked single assertion.

## Browser assignments

Fourteen string adapters were removed across Learn, Admin, My AGAPAY groups and stewardship reports. Nullable button labels retain DOM textContent semantics; the one optional saved label uses null when absent. Input values use explicit String conversion after the original falsy-to-empty fallback. Admin autosave messages use the DOM empty-string default. encodeURIComponent accepts the report year directly. Existing script URLs, load order, generated JavaScript paths and content-version checks remain in force.

## Storage proxies

Six portability proxy assertions were replaced with unknown property reads through Reflect.get and checked callable dispatch through Reflect.apply. Dispatch retains the original storage object as this. SQL statement unwrapping for batch, binding reuse, symbol properties, statement/SQL/R2/KV charges, the 800-operation work limit and 900-operation recovery limit remain unchanged. Unbounded SQL remains prohibited.

## Feature-request JSON

Stored feature-request JSON is parsed as unknown and checked as a record with record entries, optional string/null timestamps, finite numeric/string counts and optional string-array requestors. Legacy omitted fields, numeric strings, null defaults and unknown metadata remain supported. Read-only views project valid entries without repairing storage. Record or dismiss operations reject malformed stores or siblings before writing; rejected updates preserve the original bytes. Unknown metadata survives valid updates. Feature keys are handled as own properties, including prototype-like names, without changing Object.prototype.

Focused regressions cover malformed roots, malformed sibling entries, unchanged bytes and write counts, legacy values, duplicate donor requests, dismissals, round trips, metadata preservation, prototype-like keys, receiver-sensitive proxy methods, symbols, alias bindings, unwrapped batches and both operation allowances. Existing feature-request SQLite and KV tests pass. No real email, provider or production financial data is used by the new offline tests.

## Release validation

Full local Quality, platform regressions, Worker startup profiling and private provisioner packaging are required before this checkpoint is pushed. Protected staging, authenticated staging, CodeQL and protected production acceptance are required before declaring deployment accepted. Evidence is retained under ignored tmp-release-hardening-3/; credentials and artifacts are not committed.

## Remaining scope

36 double assertions remain in dynamic Learn property/form lookups, two invitation database result adapters and two PDF page-state initializers. Additional external JSON domains still need individual schema and compatibility review. This checkpoint does not claim complete external JSON validation. No security gate, MFA requirement, billing setting, entitlement, dependency version, source-size budget or Accounting migration ledger was weakened.

The first full-suite attempt stopped at the legacy dashboard-foundation regression, which expected malformed KV JSON to be replaced during a new request. That expectation was updated to require rejected record/dismiss operations and byte-for-byte preservation; its missing-store initialization, donor deduplication, dismissal/reopening and identity-redaction checks remain on a separate healthy store. Both focused regressions passed after this change. The initial run log is retained, and a fresh full platform run and Quality run are required for release acceptance.

## Completed local validation

The fresh full run passed all 325 platform commands and four prechecks. Quality passed four strict TypeScript projects, all 57 application-owned Worker declarations without skipLibCheck, 17,118 runtime parameter occurrences with no inferred any, and 1,923 linted files with zero errors and six unchanged warnings. Generated output and content versions, formatting, all seven unchanged legacy size budgets and the immutable Accounting migration ledger passed. The source scan finds 746 TypeScript files including declarations, zero explicit any, zero suppressions and 36 double assertions. All 607 registered generated outputs retain their existing paths. Local Worker startup profiling and private provisioner dry-run packaging passed; the 371.5 ms local profiling window is diagnostic and is not a production latency measurement. Protected staging and production acceptance passed through PR #246; production serves b0f73443298f6ab2ca5021db616102de422e04f1, stamped 2026-10-18T04:08:49Z.

## Protected release acceptance

PR [#246](https://github.com/joeldunnesq-sudo/agapay-site/pull/246) merged source a25d386f0c4c3a3c54f37f1087f509a1a0d72afa as b0f73443298f6ab2ca5021db616102de422e04f1; their trees are identical. Protected production [run 39095549587](https://github.com/joeldunnesq-sudo/agapay-site/actions/runs/39095549587), attempt 1, passed Test, Quality, Deploy and authenticated Accounting smoke. Production was stamped at 2026-10-18T04:08:49Z. Main Worker version: 3ade0d53-cc41-4ccd-9cba-d252817bb267; private Accounting provisioner version: 947e1936-e785-4568-999f-6953c64dfc34.

- Local, PR CI, protected staging and protected main passed all 325 platform commands and four prechecks. Quality logs independently confirm four strict projects, 57 owned Worker declarations, 17,118 runtime parameter occurrences with no inferred any, 1,923 linted files with zero errors and six unchanged warnings, generated assets/content versions, formatting, unchanged source budgets and the immutable migration ledger.
- PR CodeQL security policy and main CodeQL passed.
- Five hosted staging suites passed with exact deployed browser bytes. Staging does not populate the health build-SHA/stamp variables; its revision evidence is the successful exact-head protected deployment and exact assets. This diagnostic limitation was recorded explicitly; production still requires its stamped SHA. Normal-MFA Giving/catalog passed with catalog restoration and upload deletion, completed financial/weekly-fund reports, and all seven private-document checks.
- Six hosted production suites and all 16 deployed-asset PDF downloads passed. Normal-MFA production acceptance passed 18 checks, with 1 allowed existing-bill attachment skip because the dedicated test parish has no existing bill.
- Six spaced health probes retained the merged SHA and protected stamp after the automatic Cloudflare build.

Evidence is retained locally under ignored tmp-release-hardening-3/: local-validation.json, staging-acceptance.json, staging-deployment-proof.json, production-validation.json, authenticated artifacts, hosted logs, initial failure evidence, assertion inventory and stable-health.json. No MFA, billing, entitlement, release-permission, dependency version or size-budget configuration was changed.
