# TypeScript transition audit

Audit target: the completed 495-module migration released through PR #242, main commit `de63df5db057dcf50489161c9d6c193d29b70c34`. The audit examines the completed runtime migration and its enforcement, rather than expanding the frozen inventory to vendor assets, inline scripts or tooling.

## Findings and corrections

### Application declarations were excluded from semantic checking

The shared `skipLibCheck: true` setting skipped application-owned `.d.ts` files along with dependency declarations. Enabling declaration checks exposed incompatible interface inheritance, global overloads, duplicate fields and a stale re-export that the normal strict checks had accepted.

The shared configuration now checks declarations. Browser, browser-worker and Learn projects inherit that setting. The Worker project retains its upstream-library exception because the generated Workers runtime and installed Node ambient definitions overlap. A required additional gate creates a program with declaration checking enabled and checks all 57 application-owned Worker declarations without filtering any diagnostic in an owned file. This gate is part of `npm run typecheck`, and therefore Quality and protected release gates.

The regression test uses invalid owned inheritance, duplicate fields and a stale export to verify failure even when the project requests `skipLibCheck`. It also verifies that overlapping upstream declarations do not suppress checking of the application files.

### Unrelated browser pages shared incompatible global contracts

Donor and parish sacrament pages have different `sacramentTypeLabel` signatures. Their global declarations collided in the shared browser compilation. Donor presentation and controller sources now exchange exact type-only bindings, preserving the original classic-script runtime globals and ordering. Parish preparation references its actual owner signature. Donor calendar gifting also references its actual owner signature rather than a handwritten approximation.

The calendar-label declaration no longer promises an omitted argument where the global implementation requires a string. Compile-only positive and negative callers verify that donor string arguments and parish request-object arguments remain separate.

A further comparison of handwritten global declarations with same-page implementations found drift in campaign helpers, cache/API helpers, commemoration rendering, fund fallback and parish feature requests. Those contracts now derive from their owners. The JSON API helper explicitly supports the endpoint-specific generic contract already used by its callers, and the cache writer accepts the arbitrary serializable payloads it already stores. Neither change adds runtime validation or changes the generated helper implementation.

### Response contracts assumed fields that can be absent or differ by endpoint

The calendar's sacrament request contract required both requested and confirmed dates, while the same request is valid before scheduling. Those dates are now optional, consistent with the request DTO and existing presentation logic. Both calendar consumers explicitly use an empty fallback when filtering missing dates; requests without dates remain excluded, and scheduled dates retain their original behavior.

Sacrament offerings are a structured `{ types, custom }` response, while giving-history offerings are an array. The sacrament payload explicitly replaces that endpoint-specific property rather than incorrectly inheriting the array contract. The parish settings identity similarly replaces its editable partial-priest collection rather than claiming it is the fully populated workspace collection. Optional campaign values now reflect the existing truthy query-parameter filtering.

The sacrament controller's dashboard and commemoration responses now use their actual donor payload contract rather than the scheduling response type. Its shared renderer returns normalized entries; it does not return the original sacrament response. Negative compile-only callers guard against mixing these shapes.

### Accounting declaration re-export and Stripe duplicate fields

`src/accounting/index.d.ts` declared `voidJournalDraft` as an export from ledger workspace, although its implementation is owned by ledger service. The declaration now points to the correct owner. Runtime exports are unchanged. Repeated identical Stripe webhook account fields were removed from the declaration.

### Library-inferred callbacks bypassed strict parameter checking

A compiler-type scan found 93 parameters receiving `any` from array narrowing, untyped collections, Promise rejection handlers and library callback signatures. They were not explicit `any` annotations or implicit-any compiler errors, so normal strict compilation and the existing lint rule did not reject them.

Typed report/aging/reconciliation aggregates and collection owners now preserve their value contracts. Boundary callbacks explicitly accept `unknown` or the relevant DTO/scalar shape, including stored recovery hashes, JSON/array normalization, error handling and XML captures. The secure comparison helper retains its existing signature and implementation. No callback fix changes emitted executable code.

`npm run typecheck` now also requires the compiler-based runtime parameter audit across all four projects. It checks 17,078 parameter occurrences and rejects inferred `any`, even when library signatures would otherwise permit it. Regression cases prove detection of array narrowing, Promise rejection and untyped-map callbacks. The final scan has zero unchecked parameters. This gate does not claim that all local variables, return types or external payloads are runtime-validated.

## Coverage and runtime compatibility

- The frozen migration inventory still reports 495 converted original modules, zero remaining. Extracted helpers do not inflate the count.
- An AST scan covered all 745 TypeScript files under `src`, including declarations: zero explicit `any` types and zero `@ts-ignore` or `@ts-nocheck` directives.
- A same-page declaration/implementation comparison checked 61 unambiguous remaining function declarations with no incompatible signatures. Owner-derived bindings additionally check the corrected helpers directly.
- All 606 registered generated outputs were compared with the accepted checkpoint: 604 are byte-identical after line-ending normalization. The only two changed outputs are donor calendar and My AGAPAY parish life, where optional date filtering now spells out the existing missing-date behavior. The donor sacrament output is unchanged despite its compile-time isolation.
- Content versions were regenerated for the changed browser outputs. No package versions, Worker bindings, compatibility dates, payment behavior, MFA requirements, release permissions or size budgets were changed.

## Validation

Validation passed:

- All 321 platform commands and four prechecks, including browser/offline/session, payments, MFA, recovery, portability and Accounting regressions. The additional declaration/type-safety gate regression cases were also rerun after their final edits.
- Complete Quality: four strict TypeScript projects; 57 application-owned Worker declaration files; 17,078 parameter occurrences with zero inferred `any`; generated output and content versions; lint of 1,917 files with zero errors and the same six existing warnings; formatting; seven unchanged legacy budgets; immutable Accounting migration ledger.
- A final focused Worker compilation passed after retaining the original secure-comparison signature and explicitly typing stored recovery hashes.
- Worker startup profiling and private Accounting provisioner dry-run packaging. The local startup profile window was 564.8 ms while other checks were running; this is a local diagnostic, not a production latency measurement.
- Final generated-output checks passed after the callback/collection corrections, confirming those corrections erase without changing runtime output. The two explicit missing-date fallbacks remain the only changed generated JavaScript files.

Local evidence is retained in ignored `tmp-release-90/audit-*.log`, `audit-runtime-diff.json`, `audit-validation.json` and `audit-type-surface.json`; these artifacts and credentials are not committed. These audit fixes are a local follow-up to the accepted PR #242 release; this audit does not push or deploy them.

## Limits and remaining hardening

The 100% inventory measures authoritative TypeScript ownership of the original runtime modules. It does not mean every external JSON payload is validated at runtime or every type assertion is eliminated.

The scan catalogued 229 `as unknown as` double assertions. These include truthy-array predicates, native DOM coercions, Date arithmetic, dynamic keys, database/proxy adapters and staged PDF state. Their presence is a type-hardening concern, not proof of a runtime defect. This audit corrects verified contract errors rather than blindly rewriting assertions and changing established behavior. Future changes at those boundaries should replace assertions with derived types, explicit coercions or runtime validation, backed by behavior tests. The detailed path/line inventory is retained locally in `audit-type-surface.json`.

Systematic compiler, manifest, output and regression checks cover the migration as a whole; manual review focused on compiler-discovered inconsistencies and high-risk ownership, payload, browser-global and release boundaries. Passing these checks is not a proof that every application path is bug-free.
