# TypeScript boundary hardening: fourth checkpoint

This follows accepted PR #246. The frozen migration inventory remains 495/495 modules (100%). This connected Learn batch removes 19 double assertions, reducing the remaining inventory from 36 to 17. None was replaced by an unchecked single assertion.

## Native form controls and meal fields

Eleven form-collection adapters now use one hoisted helper around HTMLFormControlsCollection.namedItem, checking string values, boolean checked state and control types before use. Existing whitespace trimming, empty/missing controls, hidden true/false flags, checkbox behavior, radio-group values, ID lookup, external form association and disabled controls are preserved. Radio groups retain their native RadioNodeList value and do not acquire an artificial checked flag. Native lookup also handles controls named like collection properties.

Six meal-property adapters now use fixed breakfast/lunch/dinner keys and a checked dinner-field reader for calendar values. Legacy string meal labels remain safe; malformed non-string dinner values do not masquerade as valid display strings. Two dictionary adapters were removed where the existing typed records already support their string keys. The weekly writer uses a dictionary without a prototype so prototype-like item IDs are serialized as data.

All helpers remain hoisted function declarations inside their registered composed modules. Existing generated JavaScript paths, public compatibility exports, load order, native helper/preload URLs and network dependencies are preserved. No source-size budget was raised.

## Weekly-assignment JSON

The dashboard and weekly board share a parser that treats saved local-storage JSON as unknown. It checks record roots and entries, optional string zone/source/note/status fields and optional boolean completion/auto-placement fields. Valid omitted fields and unknown metadata within valid assignment entries remain readable. Valid siblings can be displayed when another entry is malformed; reads do not rewrite storage. The validated dictionary has no prototype, preventing inherited names from posing as saved assignments.

A save rechecks the original raw store before replacing the board state. Malformed roots or siblings reject the write and retain the original bytes, with an actionable save error. Storage read/write failures are also handled. Rejected changes do not schedule Google Calendar synchronization or print an unsaved week; print controls remain available and do not get stuck in a busy state. Valid board edits retain the existing writer's normalization and reset behavior and schedule the same debounced calendar synchronization after persistence succeeds.

## Focused validation

The new regression script uses actual emitted functions, native Chromium form controls and the real weekly-board wiring with synthetic storage and intercepted provider boundaries. It covers malformed roots/entries, preserved metadata, legacy omitted fields, prototype-like IDs, native form lookup, hidden flags, checkbox/radio behavior, trimmed payloads, meal slots, calendar dinner fields, healthy save/restore round trips, missing stores, rejected writes, denied storage access, quota errors, blocked print behavior and the actual calendar debounce. Existing full Learn desktop/mobile boot regressions remain required.

## Release validation and remaining scope

Full local Quality, all platform regressions, Worker startup profiling and private provisioner dry-run packaging are required before push. Protected staging, CodeQL, normal-MFA authenticated gates, hosted suites, deployed PDFs and stable production revision checks are required for acceptance. Evidence is retained locally under ignored tmp-release-hardening-4/; credentials and artifacts are not committed.

17 double assertions remain: 13 Learn dynamic table lookups, two invitation database-result adapters and two PDF page-state initializers. Additional external JSON domains still require individual compatibility review. This checkpoint does not claim complete application JSON validation.

## Completed local validation

All 326 platform commands and four prechecks passed. Full Quality passed four strict projects, 57 application-owned Worker declarations without skipLibCheck, 17,127 runtime parameter occurrences without inferred any, and 1,924 linted files with zero errors and six unchanged warnings. Generated output and content versions, formatting, all seven unchanged legacy size budgets and the immutable Accounting migration ledger passed. The source inventory remains 746 TypeScript files including declarations, with zero explicit any, zero suppression comments and 17 double assertions. All 607 registered generated outputs retain their existing paths. Local Worker startup profiling and private provisioner dry-run packaging passed; the 618.3 ms local profile window is diagnostic and is not a production latency measurement. Protected staging and production acceptance passed through PR #247; production serves 8eaec2442b3cc03e872d79d7c8127cd8b3258988, stamped 2026-10-18T05:02:27Z.

## Protected release acceptance

PR [#247](https://github.com/joeldunnesq-sudo/agapay-site/pull/247) merged source ce971896b0af60c00cc466428c19b8681c127631 as 8eaec2442b3cc03e872d79d7c8127cd8b3258988; their trees are identical. Protected production [run 39098780273](https://github.com/joeldunnesq-sudo/agapay-site/actions/runs/39098780273), attempt 1, passed Test, Quality, Deploy and authenticated Accounting smoke. Production was stamped at 2026-10-18T05:02:27Z. Main Worker version: a30e4847-2795-4ce8-b5af-18aba0a605af; private Accounting provisioner version: bc46bece-85f7-42b9-99c0-95e1673becf0.

- Local, PR CI, protected staging and protected main passed all 326 platform commands and four prechecks. Quality logs independently confirm four strict projects, 57 owned Worker declarations, 17,127 runtime parameter occurrences with no inferred any, 1,924 linted files with zero errors and six unchanged warnings, generated assets/content versions, formatting, unchanged source budgets and the immutable migration ledger.
- PR CodeQL security policy and main CodeQL passed.
- Five hosted staging suites passed with exact deployed browser bytes. Staging does not populate health build-SHA/stamp variables; its revision evidence is the successful exact-head protected deployment and exact assets. Production still requires its stamped SHA. Normal-MFA Giving/catalog passed with catalog restoration and upload deletion, completed financial/weekly-fund reports, and all seven private-document checks.
- Six hosted production suites and all 16 deployed-asset PDF downloads passed. Normal-MFA production acceptance passed 18 checks, with 1 allowed existing-bill attachment skip because the dedicated test parish has no existing bill.
- Six spaced health probes retained the merged SHA and protected stamp after the automatic Cloudflare build.

Evidence is retained locally under ignored tmp-release-hardening-4/: local-validation.json, staging-acceptance.json, staging-deployment-proof.json, production-validation.json, authenticated artifacts, hosted logs, assertion inventory and stable-health.json. No MFA, billing, entitlement, release-permission, dependency version or size-budget configuration was changed.
