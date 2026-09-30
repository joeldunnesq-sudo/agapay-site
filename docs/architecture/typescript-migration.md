# Staged TypeScript migration

The migration adds checked contracts while preserving the platform's runtime behavior. Each stage is independently reviewable and releasable. Existing route, export, browser-global, script-order, storage, and payment contracts remain in force; see [legacy module refactor guardrails](legacy-module-refactor-guardrails.md).

## Stage 1: strict checking without changing execution

Stage 1 introduced `npm run typecheck`. This generates Worker runtime and binding declarations from the current Wrangler configuration into ignored `.wrangler/types/worker.d.ts`, then checks two separate TypeScript projects without emitting application files:

- Initially, `tsconfig.worker.json` checked organization classification, organization terminology, and XML text helpers using strict JSDoc types. Stage 2 replaces these handwritten JavaScript sources with TypeScript and generated JavaScript at the same paths.
- `tsconfig.learn.json` checks the two existing Learn TypeScript files. Its DOM library is isolated from the Worker project.

`scripts/typecheck/pilot.ts` checks representative consumers and intentional invalid inputs. Its `@ts-expect-error` assertions fail if closed organization unions, readonly results, numeric options, or the Worker/browser boundary stop being enforced. This fixture is never executed or deployed.

TypeScript and Node 24 definitions are pinned in the package lockfile. The Node definitions reflect CI's Node 24 and the Worker's existing `nodejs_compat` flag; they do not change the application's minimum supported Node version or Worker compatibility date. Wrangler supplies the runtime-specific APIs.

`npm run quality` requires type checking before its existing checks. Both production and staging deployment workflows already depend on that quality job. Generated declarations are rebuilt on each check rather than committed, and local editor users should run the command after checkout or Wrangler configuration changes. Source-size budgets also inspect `.ts` files.

The checked scope remains small. It does not claim that all JavaScript consumers or API payloads are typed. `strict` remains enabled as that scope expands. Application source must not accumulate `any`, unchecked assertions, or suppression comments merely to obtain a passing check. The negative-test fixture is the deliberate exception for `@ts-expect-error`.

Stage 1 validation on September 30, 2026: `npm run quality` passed, and `npm run check` passed its two precheck commands and all 205 main test commands. Wrangler dry-run packaging passed with zero asset-reference updates. Comparing esbuild output before and after the annotations confirmed identical executable JavaScript for all three pilot modules. These are local validation results; no production deployment was performed.

## Stage 2: first runtime TypeScript modules

Stage 2 introduced these authoritative runtime sources:

- `src/organizations/types.ts`: classification constants, normalization, and legacy registration defaults.
- `src/organizations/terminology.ts`: organization terminology profiles.
- `src/lib/xml-text.ts`: XML entity decoding and plain-text extraction.

Edit the `.ts` files and run `npm run build:server`. The pinned esbuild transformer strips types and emits ES2022 JavaScript, formatted with the repository settings, to the existing adjacent `.js` paths. Include both source and output in the change. Generated files carry a source/provenance header. They are tracked compatibility artifacts, never a second handwritten implementation.

Node preview, scripts, and Worker consumers retain their `.js` imports and need no TypeScript runtime loader or newer Node minimum. TypeScript consumers resolve those same imports to the `.ts` source for checking. This intentionally accepts adjacent generated files in exchange for avoiding a platform-wide runtime/import change during the pilot. A later migration may consolidate generated output into a build directory once all execution paths support it.

`npm run build:server:check` fails on missing or stale output without rewriting it. Quality, the standard test precheck, and both Worker build configurations enforce the check. `npm run dev` and `npm start` regenerate the files before starting local preview. LF/CRLF differences are normalized so Windows and Linux checkouts use the same artifacts.

`scripts/lib/server-typescript.mjs` records the explicit source/output mapping. The runtime regression test rejects unregistered server `.ts` files outside the separately checked Learn model scope. Organization architecture tests inspect the authoritative source through the mapping. Existing export, route, and runtime tests continue to inspect/import executable JavaScript. Source-size checks inspect both, and ESLint now discovers and checks `.ts` files, including the existing Learn types and compile-time fixtures.

TypeScript is pinned to 6.0.3 with typescript-eslint 8.71.0. The ESLint integration currently supports TypeScript below 6.1, so this replaces stage 1's 7.0.2 compiler with a supported pairing rather than suppressing compatibility warnings. Both strict projects and their negative contract checks remain required.

Convert one bounded group at a time. Run focused behavior tests, strict checking, quality, the full check suite, Worker dry-run packaging, and local startup verification. Preserve accepted inputs, coercion, defaults, error responses, and export names. Changes to those behaviors belong in separately reviewed fixes.

Stage 2 validation on September 30, 2026: quality passed with TypeScript linting and strict checks; the full test run passed all three precheck commands and 206 main commands. The main Worker passed dry-run packaging and local workerd startup profiling; the private accounting Worker passed dry-run packaging. The preview server served `/api/learn/meta` successfully. Normalized esbuild output matched the pre-conversion helpers for all three modules, and bundler metadata confirmed the organization imports resolve to the same generated JavaScript used by Node. Missing output, modified output, uncompiled source changes, and CRLF checkout behavior are covered by regression tests. No remote staging or production deployment was performed.

## Stage 3: service and data contracts

Expand through read models, service parameters, API responses, and storage adapters before payment execution, webhooks, authentication, accounting writes, or scheduled jobs. Model optional and nullable stored data as it exists. External JSON, database records, and webhook bodies still need runtime validation; TypeScript assertions cannot establish trust. Share only public response types with browser code.

The first service-contract batch adds six authoritative TypeScript modules:

- `src/organizations/module-profiles.ts`: immutable module profiles and eligibility lists.
- `src/organizations/verification-policies.ts`: verification requirements, evaluations, and onboarding step results.
- `src/organizations/context.ts`: normalized organization contexts and the injected registration lookup contract.
- `src/organizations/module-access.ts`: synchronous entitlement callbacks and immutable access decisions.
- `src/organizations/api-policy.ts`: versioned API decisions and the bounded public organization descriptor.
- `src/lib/content-reads.ts`: D1 query inputs, selected row shapes, and camel-case read receipt responses.

`RegistrationRecord` describes stored fields as optional unknown values. Existing normalization and tenant checks remain responsible for producing a context. Generic repository callbacks preserve the caller's record type, including nullable custom fields, and return a nullable resolved organization. The existing `isOrganizationContext` probe intentionally returns only a boolean: checking version and ID does not validate every context property. Stored manual-check notes also remain unknown until narrowed by their consumer.

The public descriptor exposes only its existing organization and compatibility fields; it does not expose raw registrations or private payment/session fields. Entitlement callback types require a synchronous boolean result so a newly typed caller cannot accidentally pass an async callback whose Promise would be treated as truthy. The runtime policy logic itself remains unchanged.

The content-read adapter uses the generated D1 interface and explicit row types matching the existing NOT NULL TEXT columns. It preserves parameter binding, INSERT OR IGNORE behavior, query ordering, tenant scope, deletion scope, and database error propagation. Content type remains a string because the storage helper is shared across features and database migrations govern supported values. No migration or runtime validator was added.

`scripts/typecheck/services.ts` checks nullable lookup handling, preserved record types, immutable contexts, the public/private response boundary, callback return types, and required query fields. All service fixtures are included automatically by the Worker type-check project. Existing organization source-policy tests and the content-read feature-independence check inspect authoritative TypeScript through the source mapping. Runtime tests continue to use the generated JavaScript.

Stage 3 batch validation on September 30, 2026: strict checking and quality passed; all three precheck commands and 206 main test commands passed. Normalized executable output, including SQL strings, matched the previous JavaScript for all six new modules. Focused tests cover tenant-safe receipt deletion, empty queries, error propagation, organization lookup boundaries, verification policy behavior, and public API responses. The main Worker passed dry-run packaging and local workerd startup; the private accounting Worker passed dry-run packaging. Nine runtime modules now have authoritative TypeScript sources. No remote staging or production deployment was performed, and unconverted JavaScript callers are not yet claimed as type-checked.

## Stage 4: browser compilation

Introduce a reproducible build with TypeScript sources outside the served asset directory and JavaScript output at the existing public URLs. Compile before calculating asset versions. Test the emitted JavaScript used by actual pages.

Classic Admin, Donor, and Parish scripts retain their global bridges, registration contracts, and load order. Learn retains ES-module semantics. Start with small presentation helpers or features, and address large shells separately. Verify fresh loads, existing sessions, service-worker updates, and cached installations. The frozen orphaned `public/learn/support.js` bundle remains excluded until its source/provenance issue is resolved.

The first browser batch adds two authoritative sources outside the served asset directory:

- `src/browser/admin/presentation.ts`: the 17 Admin presentation globals, their input and summary contracts, and the typed Window interface.
- `src/browser/donor/bookstore-presentation.ts`: shared bookstore category/status labels and currency formatting used by Bookstore and giving history.

`tsconfig.browser.json` checks these classic scripts and compile-only browser fixtures with strict DOM types and no Node or Worker ambient declarations. Worker checking excludes this directory. The Admin installer must satisfy the same interface exposed to typed Window consumers. Bookstore constants remain top-level lexical bindings and the formatter remains a global function. Readonly types do not freeze objects or change behavior at runtime.

Run `npm run build:browser` followed by `npm run assets:version` after editing browser TypeScript, and include both source and generated output in the change. The explicit manifest in `scripts/lib/browser-typescript.mjs` emits ES2022 JavaScript at the existing `public/admin/presentation.js` and `public/donor/bookstore-presentation.js` paths. It adds no bundle, wrapper, runtime loader, or module exports. The build rejects module syntax, and regression tests require every browser TypeScript implementation to be registered in the manifest.

`npm run build:browser:check` rejects missing or stale output, while allowing Windows CRLF checkouts. Quality, full-test prechecks, asset versioning, and the main Worker build enforce this gate. Local start/dev regenerate browser output before hashing assets. All six consuming HTML pages retain their existing script positions and use content hashes of the generated files; Admin retains its service-worker cache bypass policy.

The browser regression test exercises the actual Admin login page and generated globals, then uses a local fixture with the real service worker and donor session module to verify old-cache/new-hash isolation, worker replacement, warm offline asset fetches, and retained sessions. Existing bookstore browser tests exercise the actual bookstore page, catalog, cart, checkout request payload, mobile layout, and parish isolation with mocked APIs.

This verification exposed a pre-existing failed precache request for absent `/listen.html`. The precache now uses the existing `/listen/index.html`, its offline navigation fallback uses the same file, and the service-worker cache advances to v38. The new browser test requires installation and activation to complete, so a missing precache asset cannot silently hang the test. This does not establish offline support for authenticated pages.

Stage 4 batch validation on September 30, 2026: quality passed; all four precheck commands and 208 main test commands passed. Normalized executable JavaScript matched the previous implementation for both converted helpers. The real-browser service-worker test also passed its Listen offline-shell check. Main Worker packaging and local workerd startup passed, and the private accounting Worker passed dry-run packaging. Eleven runtime modules now have authoritative TypeScript sources, including these two browser entries. No remote staging or production deployment was performed; staging journeys remain a release requirement, and unconverted JavaScript callers are not yet type-checked.

## Release and rollback

The release branch is integrated with `main` at `52e7d22c`, retaining its newer recovery functionality, Wrangler/Miniflare versions, browser assets, and expanded test manifest. Main has independently retired the orphaned Learn support bundle; this migration does not restore it. The stage validation counts above record the original checkpoints, while the integrated release requires all 238 current test commands. Staging now installs lockfile dependencies explicitly before running custom asset builds.

Each stage must pass its focused tests, `npm run quality`, and `npm run check`. Runtime conversions also require Worker packaging/startup checks and relevant staging browser journeys. Keep database schema changes, dependency upgrades unrelated to typing, UI redesigns, and business-rule changes separate. Retain a known-good Worker and asset release for rollback and check affected user flows after release.

Migration progress is measured by checked contracts and protected behavior, not file-extension counts. No stage authorizes weakening existing release gates or treating a partial local test run as production validation.
