# TypeScript parallel-work reconciliation

Accepted through PR #248. Production serves 058437466c08ec18ced86e5680e3fd9f915faedb, stamped 2026-10-19T01:14:20Z.

The user authorized coordination with the parallel migration chat, preservation of both checkouts, reconciliation, and push/deployment after all release checks pass. That chat handed off its work and paused further deployment activity. The original checkout was left untouched during reconciliation. Later preservation and recovery are recorded separately below.

The historical canonical candidate started at ef67399552ff72ba7129211e65c918c45982df48 (PR #248, including the final 17 double-assertion removals). At that checkpoint, remote main was 8eaec2442b3cc03e872d79d7c8127cd8b3258988. The parallel checkout was based at 669fd9f676c08be3bea6fee4bc05346335ebfbe1 and had deployed build typescript-8e417bf61d50d3b8, stamped 2026-10-18T23:37:46.582Z. All 1,258 files in that deployed manifest matched the preserved checkout. That divergent production baseline was a required pre-merge comparison; it is historical and has been superseded by the accepted combined release below.

## Preservation and decisions

A byte-verified snapshot and full-index patch preserve 227 changed/new files (13,133,917 bytes); nested Git worktrees were left untouched. Pushed archival commit bef2c199024ff5f92f60a2fadd239bc607df461d on codex/preserved-typescript-original-2026-10-18 records the snapshot without altering either checkout's index. The [per-file ledger](typescript-reconciliation-ledger.json) records each preserved file's hash and resolution. The [parallel migration history](typescript-parallel-migration-history.md) retains its original documentation as historical evidence.

The combined implementation retains the canonical dependency/security configuration, Android PWA performance fixes, asset delivery, source budgets, release gates and newer UI. Original backups, embeds and existing business features remain represented by their current implementations. The parallel Bookstore design preview and demo documents are preserved; the preview is isolated sample data and does not create orders or call purchasing APIs. Historical conversion tooling and superseded UI variants remain recoverable in the archival snapshot.

## Runtime and contract reconciliation

Twenty-five support modules give storage, keys, crypto, password records, Admin/Donor/Parish sessions, MFA predicates, identity handlers, capability enforcement and organization providers explicit TypeScript owners. Generated JavaScript paths and compatibility exports remain stable. Runtime export comparison found no missing exports across core, format, identity, authorization, identity handlers, parish, donor and Worker actions. New support modules do not inflate the frozen migration baseline of 495/495.

Canonical registration lookups remain in the production provider path to preserve caching and Android performance. Typed provider views expose unknown persisted data while retaining the actual implementation binding. Existing negative compile checks remain required: serialized row strings, donor email fields, normalized MFA session IDs, nullable/private records and guarded organization requests. No additional weaker compiler project or JavaScript escape hatch was introduced.

Malformed JSON roots are rejected before login/invitation actions. Malformed invitation IDs cannot reach pending-invitation replacement SQL. Stored session metadata remains lossless; MFA entry points reject invalid session identifiers before issuing a transaction. D1 operations resolve their binding once, including atomic batches. Existing MFA, capabilities, pending replacement, onboarding and email failure semantics remain protected by regressions. The private provisioner adds a generated-output freshness build guard.

## Validation and release requirements

Seven added commands cover storage/session contracts, identity and invitations, real organization providers, reconciliation boundaries and the Bookstore preview at desktop and phone sizes. The full platform manifest now contains 335 commands plus four prechecks. All four strict projects, 57 owned Worker declarations, formatting, source budgets, immutable accounting ledger, generated outputs and assets remain mandatory. Source scanning found 772 TypeScript files with zero explicit any, suppression directives or double assertions; broader external JSON validation remains ongoing domain work. Eliminating double assertions does not establish complete runtime schema coverage.

The combined release completed exact-head CI and staging deployment, CodeQL policy acceptance, five hosted staging suites, normal-MFA Giving/catalog and private document gates run serially with fixture cleanup, and protected merge. Production acceptance verified the exact merged revision/stamp, protected authenticated accounting, hosted checks, deployed PDFs and stability after automatic Cloudflare builds. Evidence follows below. The prior parallel public-only checks do not substitute for these authenticated gates.

## Accepted combined release

PR [#248](https://github.com/joeldunnesq-sudo/agapay-site/pull/248) merged source 907a9b86c103be377727f463daec17e5acf49dd8 as 058437466c08ec18ced86e5680e3fd9f915faedb; their trees match exactly. Protected production [run 39183684058](https://github.com/joeldunnesq-sudo/agapay-site/actions/runs/39183684058), attempt 1, passed Quality, Test, Deploy and normal-MFA Accounting acceptance. The final stamp is 2026-10-19T01:14:20Z; main Worker b27858d8-cdc9-41d3-ab2f-1214bd995a5c; private provisioner 4ba0fbcb-e109-46ee-a4c8-b782686d08e7.

The original workspace is preserved in [archival commit bef2c199](https://github.com/joeldunnesq-sudo/agapay-site/commit/bef2c199024ff5f92f60a2fadd239bc607df461d) on codex/preserved-typescript-original-2026-10-18, pushed alongside the reconciled branch. Its 227 raw file hashes and original HEAD were reverified unchanged.

- Local, PR CI, protected staging and main passed all 335 platform commands and four prechecks. Fresh Quality proofs confirm four strict projects, 57 owned Worker declarations, 17,293 runtime parameters without inferred any, 1,994 linted files with zero errors and six unchanged warnings, formatting, generated outputs/assets, seven unchanged budgets and the immutable accounting ledger. Source scanning covers 772 TypeScript files with zero explicit any, suppressions or double assertions; 633 generated outputs remain registered.
- Local Worker startup profiling and private provisioner dry-run packaging passed. The profile is a local diagnostic, not a production latency claim. Runtime export comparison found no missing compatibility exports. The source-reading integration issue was corrected through explicit owner registration, preserving the original handler-path assertion.
- Exact-source CodeQL policy and main CodeQL passed. Five hosted staging suites verified exact deployed browser bytes. The staging workflow does not populate health build-SHA/stamp variables; exact-head deployment and exact asset bytes establish its revision.
- Normal-MFA Giving/catalog and private document gates ran serially to protect their shared test account. Catalog restoration, upload deletion, financial/weekly-fund reports and all seven private-document checks passed.
- Six hosted production suites, all 16 deployed-asset financial PDF downloads and nine-domain routing parity passed. Normal-MFA production acceptance passed 18 checks with 1 permitted existing-bill attachment skip (no_existing_bill).
- Six spaced production health probes retained the merged SHA and protected stamp after the automatic Cloudflare build completed.

The fifth boundary-hardening checkpoint is included: 17 double assertions removed, leaving zero. This is not a claim that every external JSON domain has complete runtime schema validation. Remaining validation should continue in bounded domain batches, preserving stored data and capability/MFA behavior.

At acceptance, local evidence was retained under ignored tmp-reconciliation-1/: preservation manifests/patch, per-file comparison, runtime-export parity, local-validation.json, staging-acceptance.json, staging-deployment-proof.json, production-validation.json, protected artifacts, hosted/PDF logs and stable-health.json. The original checkout and embedded worktrees were not reset, cleaned or moved as part of reconciliation. Later worktree cleanup is a separate operation and is documented below.

## Production recheck and preservation follow-up

On October 19, production health returned `ok: true`, revision `058437466c08ec18ced86e5680e3fd9f915faedb` and deployment stamp `2026-10-19T01:14:20Z`. GitHub confirms both the protected [production workflow](https://github.com/joeldunnesq-sudo/agapay-site/actions/runs/39183684058) and [main CodeQL workflow](https://github.com/joeldunnesq-sudo/agapay-site/actions/runs/39183684076) completed successfully for this revision. This recheck confirms the recorded deployment; it is not a new exhaustive platform test run.

Subsequent cleanup encountered an incomplete archive of two old worktrees. The [recovery report at archive commit afc8554b](https://github.com/joeldunnesq-sudo/agapay-site/blob/afc8554b7c566570d8c9e87edb6ebfb1d581250e/release-worktree-archives/2026-10-19-uncommitted/RECOVERY-REPORT.md) records the incident, reconstruction of 31 hero/calendar files, the preview script and both bookstore drafts, and the absence of original pre-deletion byte hashes. Focused calendar, Koinonia and bookstore checks found no lost deployed functionality; this does not retroactively validate the incomplete snapshots.

The [four-worktree archive at commit 71f5229c](https://github.com/joeldunnesq-sudo/agapay-site/blob/71f5229c498712444a6ba4267d5f5363be3aa0f7/release-worktree-archives/2026-10-19-four-worktrees/README.md) additionally preserves all 16 nonignored uncommitted files from the four remaining dirty secondary worktrees, with base histories, hashes and restore instructions. Those four worktrees were verified unchanged. These archive branches are preservation records and are not the deployed application.
