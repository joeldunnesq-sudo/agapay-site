# Legacy module refactor guardrails

The oversized-module refactor is a behavior-preserving extraction program. It must not combine file movement with product redesign, route changes, authentication changes, payment changes, storage-key changes, or API payload changes.

## Browser composition contracts

Admin and Donor remain classic-script applications while their first supporting modules are extracted. Tests read the scripts referenced by the real HTML pages through `scripts/lib/admin-dashboard-source.mjs` and `scripts/lib/donor-app-source.mjs`. Source assertions must use those composed helpers instead of assuming all behavior remains in `app.js`.

Inline handler names are a compatibility API. An extracted classic script may keep a top-level function declaration or install an explicit `window` bridge. It must not silently move an inline handler into module scope. Page URLs, script timing, DOM IDs, storage keys, and existing global names remain stable until a dedicated migration removes the inline handler and its bridge together.

Learn is already an ES-module application. Its source helper follows the relative static and dynamic module graph from `public/learn/dashboard-shell.js`, including query-string cache versions. Learn source assertions use the composed graph and therefore survive renderer, controller, and view-model extraction.

## Worker contracts

`config/refactor-contracts.json` records the current ordered API route registry and the public export surface of the Worker and oversized server modules. Extraction PRs must preserve route precedence and public exports. A compatibility facade may re-export a function from its new domain module while consumers migrate incrementally.

New Worker modules must keep request-specific state in function arguments, never mutable module scope. Promises must remain awaited, returned, or passed to `ctx.waitUntil()`. Refactoring must not add public Worker-to-Worker HTTP calls where a binding is available or introduce unbounded response buffering.

## Learn support bundle decision

`public/learn/support.js` declares that it is generated from `dc-runtime/src/*.ts`, but that source tree and its build command are not present in this repository. It is therefore classified as a **frozen orphaned generated bundle**, not handwritten refactor material.

The bundle is pinned by SHA-256 in `config/refactor-contracts.json`. Do not edit or mechanically split it. A dedicated change must choose one of these paths before its checksum can change:

1. Restore the authoritative `dc-runtime` source, lockfile, and reproducible build command, then prove a clean rebuild.
2. Replace the runtime with a maintained, provenance-recorded dependency and migrate `Meals.dc.html` with browser coverage.
3. If it is confirmed to be third-party generated output, move it to the vendor boundary with its license, provenance, integrity record, and equivalent tests.

The checksum is not a permanent exemption. It prevents an unreviewable generated artifact from drifting while its source-of-truth decision is unresolved.

## Pilot extraction

The first extraction moves the Admin dashboard's deterministic presentation helpers from `public/admin/app.js` into `public/admin/presentation.js`. The boundary owns escaping, value and date formatting, Stripe-requirement markup, subscription labels, and local platform-summary calculation. It does not own authentication, requests, mutable dashboard state, navigation, or product decisions.

`presentation.js` is a classic script loaded before `app.js` on both Admin entry pages. It uses an explicit `globalThis` compatibility bridge so existing callers keep the same names while the legacy application is split incrementally. `scripts/admin-presentation-extraction-tests.mjs` exercises the helpers directly, verifies hostile content remains escaped, checks the compatibility globals, and protects script order.

## Classic browser controllers

Phase 3 extracts page-oriented controllers without waiting for the independent server-module work in Phase 2. This ordering is safe because the browser controllers depend on the Phase 0 composition contracts and Phase 1 classic-script compatibility method, not on server source layout.

- `public/admin/controllers/tax-exemptions.js` owns the Tax Exemptions queue, detail rendering, document access, and mutation controls. Admin authentication, shared request headers, status messaging, and tab orchestration remain in `public/admin/app.js`.
- `public/donor/controllers/bookstore.js` owns Bookstore catalog, cart, scanner, parish switching, order rendering, and checkout controls. Donor authentication, the shared API client, profile state, and general shell behavior remain in `public/donor/app.js`.

Each controller is loaded only by the pages that use it and before its legacy `app.js`. Top-level function declarations intentionally retain the inline-handler globals until the HTML is migrated away from inline events. `scripts/classic-browser-controller-extraction-tests.mjs` protects controller ownership, physical size, representative behavior, relevant-page loading, script order, and composed-source discovery.

## Server domain handlers

Phase 4 starts with the Donor Bookstore server domain. `src/handlers/donor-bookstore.js` owns Bookstore catalog reads, cart normalization, parish availability, guest rules, and Stripe Checkout creation. The ordered Donor and Parish route registries remain unchanged, and `src/handlers/donor.js` re-exports the nine established Bookstore functions so Worker imports and test consumers migrate without an API-surface change.

The second extraction moves parish-calendar aggregation and bounded ICS recurrence parsing into `src/handlers/donor-parish-calendar.js`. The domain retains donor-session authorization, private cache headers, URL validation, the existing 180-day recurrence horizon, per-event and aggregate result caps, and the merge with published Commerce events. `src/handlers/donor.js` re-exports both established calendar functions, so the Worker route and existing direct test imports remain stable.

The Donor Sacraments boundary lives in `src/handlers/donor-sacraments.js`. It owns request listing and creation, structured baptism and wedding details, slot availability, race-safe direct booking, cancellation, parish notification email, preparation attachment, and Google Calendar synchronization. The extraction preserves the existing entitlement gates, donor ownership checks, D1 statements, status transitions, rate limit, slot-conflict response, and best-effort notification semantics.

The final Donor cleanup moves pledge notifications into `src/handlers/donor-notifications.js` and the legacy registration-page compatibility exports into `src/handlers/registration-admin-page.js`. These small domains retain their exact response and pagination shapes. With those implementations removed, `src/handlers/donor.js` falls below the lint-counted 1,200-line ceiling and its warning-baseline exemption is removed.

Admin extraction follows the same facade contract. `src/handlers/admin-learning-support.js` owns Learn subscription metrics, scholarship persistence and Stripe promotion creation, community moderation, feedback review, and parish support-ticket review. `src/handlers/admin-email-diagnostics.js` owns the tightly rate-limited operations-only template and controlled-bounce diagnostics. `src/handlers/admin.js` re-exports all six handlers, retains the same 22-name public surface, and falls below the lint-counted ceiling without changing admin authentication, recipients, Stripe requests, or audit records.

Parish Commerce separates the Bookstore inventory service from its authenticated route controller. `src/handlers/parish-bookstore-inventory.js` owns count sessions, low-stock queries, paid-order inventory application, item edits, thresholds, and receiving; `src/handlers/parish-bookstore-handler.js` owns the established dashboard request dispatch and starter-catalog workflows. `src/handlers/parish-commerce.js` keeps settlement profiles and Stripe lifecycle processing and re-exports the ten established Bookstore functions, preserving its 15-name surface while dropping below the warning threshold.

The Parish facade now delegates donor-offering persistence and reconciliation to `parish-donor-offerings.js`, paid and recurring giving projections to `parish-giving-read-models.js`, registration and Stripe checkout orchestration to `parish-checkout.js`, and dashboard payload/update handling to `parish-dashboard-handler.js`. `parish.js` retains the original 96-name public surface and the registration lookup/authentication primitives shared by these domains. Source-composition helpers keep source-inspection regressions valid across the facade and extracted owners.

Stewardship keeps its established 24-name facade while separating HTTP/DTO utilities, interactive page rendering, packet rendering, authoritative financial snapshots, and nudge/webhook processing into bounded modules. Presentation extraction preserves the existing HTML strings and packet calculations verbatim; financial and communications handlers remain re-exported through `stewardship.js`, so Worker route imports and request precedence are unchanged.

Server source assertions use `scripts/lib/donor-handler-source.mjs`, which composes the compatibility facade with extracted Donor domains. A new domain must be added to that helper in the same change that moves its implementation so repository-wide policy and product assertions continue to inspect executable behavior rather than only the facade.

The extraction retains direct D1 binding access, awaited Stripe and D1 calls, request-local state, bounded Open Library JSON responses, existing rate limits, and existing error payloads. It does not introduce Worker-to-Worker HTTP calls, mutable module state, new secrets, route changes, or payment-policy changes. `scripts/server-domain-handler-extraction-tests.mjs` protects the compatibility exports, implementation ownership, source composition, size ceiling, and representative Bookstore rules.

## Per-extraction release gate

Each extraction change must:

1. Add or update focused behavior tests before moving code.
2. Use the composed browser helpers for source assertions.
3. Keep every new source file at or below 1,200 physical lines, preferably 400–800.
4. Lower the legacy physical source budget and remove the exact lint-warning baseline entry when its file falls below the thresholds.
5. Run the focused tagged suite, `npm run quality`, and `npm run check`.
6. Run Worker dry-run/startup validation when Worker code, imports, routing, or scheduled composition changes.
