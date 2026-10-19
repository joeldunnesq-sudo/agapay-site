# TypeScript parallel-work reconciliation

Release candidate; protected staging and production acceptance are pending.

The user authorized coordination with the parallel migration chat, preservation of both checkouts, reconciliation, and push/deployment after all release checks pass. That chat handed off its work and paused further deployment activity. The original checkout remains untouched.

The canonical candidate starts at ef67399552ff72ba7129211e65c918c45982df48 (PR #248, including the final 17 double-assertion removals). Remote main was 8eaec2442b3cc03e872d79d7c8127cd8b3258988. The parallel checkout was based at 669fd9f676c08be3bea6fee4bc05346335ebfbe1 and had deployed build typescript-8e417bf61d50d3b8, stamped 2026-10-18T23:37:46.582Z. All 1,258 files in that deployed manifest matched the preserved checkout. This divergent production baseline must still match before the combined candidate can merge.

## Preservation and decisions

A byte-verified snapshot and full-index patch preserve 227 changed/new files (13,133,917 bytes); nested Git worktrees were left untouched. Local archival commit bef2c199024ff5f92f60a2fadd239bc607df461d on codex/preserved-typescript-original-2026-10-18 records the snapshot without altering either checkout's index. The [per-file ledger](typescript-reconciliation-ledger.json) records each preserved file's hash and resolution. The [parallel migration history](typescript-parallel-migration-history.md) retains its original documentation as historical evidence.

The combined implementation retains the canonical dependency/security configuration, Android PWA performance fixes, asset delivery, source budgets, release gates and newer UI. Original backups, embeds and existing business features remain represented by their current implementations. The parallel Bookstore design preview and demo documents are preserved; the preview is isolated sample data and does not create orders or call purchasing APIs. Historical conversion tooling and superseded UI variants remain recoverable in the archival snapshot.

## Runtime and contract reconciliation

Twenty-five support modules give storage, keys, crypto, password records, Admin/Donor/Parish sessions, MFA predicates, identity handlers, capability enforcement and organization providers explicit TypeScript owners. Generated JavaScript paths and compatibility exports remain stable. Runtime export comparison found no missing exports across core, format, identity, authorization, identity handlers, parish, donor and Worker actions. New support modules do not inflate the frozen migration baseline of 495/495.

Canonical registration lookups remain in the production provider path to preserve caching and Android performance. Typed provider views expose unknown persisted data while retaining the actual implementation binding. Existing negative compile checks remain required: serialized row strings, donor email fields, normalized MFA session IDs, nullable/private records and guarded organization requests. No additional weaker compiler project or JavaScript escape hatch was introduced.

Malformed JSON roots are rejected before login/invitation actions. Malformed invitation IDs cannot reach pending-invitation replacement SQL. Stored session metadata remains lossless; MFA entry points reject invalid session identifiers before issuing a transaction. D1 operations resolve their binding once, including atomic batches. Existing MFA, capabilities, pending replacement, onboarding and email failure semantics remain protected by regressions. The private provisioner adds a generated-output freshness build guard.

## Validation and release requirements

Seven added commands cover storage/session contracts, identity and invitations, real organization providers, reconciliation boundaries and the Bookstore preview at desktop and phone sizes. The full platform manifest now contains 335 commands plus four prechecks. All four strict projects, 57 owned Worker declarations, formatting, source budgets, immutable accounting ledger, generated outputs and assets remain mandatory. Source scanning found 772 TypeScript files with zero explicit any, suppression directives or double assertions; broader external JSON validation remains ongoing domain work. Zero assertions does not establish complete runtime schema coverage.

Local full-suite results and protected release evidence will be recorded after completion. The combined release requires fresh exact-head CI and staging deployment, CodeQL policy acceptance, five hosted staging suites, normal-MFA Giving/catalog and private document gates run serially with fixture cleanup, and normal protected merge. Production acceptance requires exact merged revision/stamp, protected authenticated accounting, hosted checks, deployed PDFs and stability after automatic Cloudflare builds. The prior parallel public-only checks do not substitute for these authenticated gates.
