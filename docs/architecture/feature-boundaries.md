# AGAPAY feature boundaries

AGAPAY grows by adding features behind explicit frontend and Worker routing boundaries. New feature code should not be added directly to the parish dashboard shell or to the Worker `fetch()` dispatcher.

## Parish dashboard features

Place parish feature implementations under `public/parish/features/`. Each script must register one stable lifecycle object through `window.ParishFeatureRegistry.register(featureId, definition)`.

The minimum contract is:

```js
window.ParishFeatureRegistry.register('feature-id', {
  load(options) {
    // Fetch state and render the feature's existing dashboard pane.
  },
  refresh() {
    // Optional explicit refresh entry point.
  },
});
```

Feature scripts currently remain classic scripts because the dashboard still has legacy inline handlers and shared globals. This registry is the migration boundary: new behavior belongs in the feature file, while `app.js` retains shell concerns such as authentication, navigation, entitlement state, and shared status UI.

Dashboard boot and retry handling lives in `public/parish/dashboard-runtime.js`,
with safe local reporting in `public/parish/diagnostics.js`. Both load before the
core on dashboard and login pages. See [dashboard debugging](dashboard-debugging.md)
for the browser regression gate and diagnostic privacy contract.

Rules:

- Use a lowercase kebab-case feature ID.
- Register exactly once and provide `load()`.
- Keep feature API calls, state, rendering, and event behavior in the feature file.
- Do not move authentication tokens or parish identity into module-level mutable state.
- Load `feature-registry.js` before feature scripts and load feature scripts before `app.js` until the legacy global compatibility layer is retired.

Large features have one lifecycle entry (`features/accounting.js`, for example)
and supporting classic scripts in their own subdirectory (`features/accounting/`).
Supporting scripts do not register independent features. Load them exactly once,
before their parent entry and before `app.js`. The recursive architecture check
enforces these rules and the existing file-size ceilings. Do not access core
state during feature script initialization; use it only inside functions called
after the dashboard core has loaded.

Accounting owns its workspace, treasurer forms, ledger, payables, reports, fund
administration, banking, close/governance, and migration UI. The shared
`accountingStaffSessionKey()` and `accountingStaffSession()` functions remain in
`app.js`: core authentication also runs on the standalone login page, which does
not load dashboard features. Shared Giving catalogs and Stewardship remain in
the core.

Commerce is the parent feature (`features/commerce.js`) for all current and future
commerce products. It owns product navigation, entitlement-based defaults, the
shared overview, and reporting ranges. Bookstore catalog, checkout, sales,
inventory, and physical counts live under `features/commerce/`; Events and Meals
share `offerings.js`. Add future commerce implementations under this same parent,
not as separate dashboard features or new code in `app.js`. Retreats, Camp, and
Tuition remain disabled placeholders until their implementations ship. Existing
`commerce`, `bookstore`, and `parishplus` navigation aliases still open Commerce.
Payment settlement profiles remain in the core because Giving also uses them.

Koinonia (`features/koinonia.js`) owns the existing `communications` dashboard
tab. Its supporting files cover announcements and overview, ministries and
calendar settings, prayer requests, and audio/video publishing. It continues to
use the Directory feature's API helper for ministry administration.

Source-based regression tests use `scripts/lib/parish-dashboard-source.mjs` to
read the actual extracted files listed in dashboard HTML. Boundary checks still
read the core separately. `parish-dashboard-runtime-tests.mjs` executes the
classic scripts separately in HTML order and exercises login authentication
without feature scripts.

## Worker routes

Domain route matching belongs under `src/routes/`. A router receives request-scoped context and returns a `Response` when it matches or `null` when it does not. `src/worker.js` owns only cross-cutting gates, ordered router composition, the final API 404, and static asset fallback.

Route order is part of the public contract. Add specific routes before generic prefix fallbacks, especially parish dashboard and Sacraments routes.

## Enforcement

`scripts/architecture-boundaries-tests.mjs` protects script order, feature registration, router composition, and the size ceilings for handwritten composition files. `scripts/run-tests.mjs` is the single tagged test entry point used by local development and CI.

`config/source-size-budgets.json` freezes every legacy JavaScript hotspot above 1,200 physical lines at its current size. A budget is a ceiling, not permission to add code: changed behavior must be extracted into the nearest domain module. New files cannot cross 1,200 lines, and a legacy budget entry must be removed once extraction takes that file below the threshold.

The `critical` test tag is the explicit runtime gate for authentication and financial boundaries. Its membership is protected by `scripts/critical-path-manifest-tests.mjs`; required CI still runs those suites through the complete `all` group.
