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
not load dashboard features. Shared Giving catalogs remain in the core.

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

Onboarding (`features/onboarding.js`) owns setup rendering, the three-step giving
wizard and its temporary draft state, and giving-setup save and treasurer signoff
actions. The core's `renderSetupWizard()` delegates synchronously to this feature.
It reads the current shared parish and Giving catalogs at action time rather than
caching its own copies. Catalog snapshots, authentication, billing/Stripe actions,
and navigation remain in the core. Existing DOM IDs and inline handler names are
preserved; the login page still loads no feature scripts.

`scripts/parish-onboarding-browser-tests.mjs` exercises real DOM interactions,
Starter and Give+ choices, cancellation, failed saves and retries, catalog
preservation, and fresh confirmations after a signoff snapshot changes. Like the
dashboard browser suite, it intercepts every request with synthetic data and
fails on uncaught browser errors. Run the browser suites with `npm run test:parish-browser`.

Campaign management (`features/campaigns.js`) owns the Campaigns tab's list,
editor state, cover/gallery uploads, saves, and progress updates. Navigation and
dashboard refresh call its registered lifecycle; actions always read the live
shared parish. Giving's editable fund/campaign catalogs and entitlement checks
remain in the core. The feature preserves the existing PATCH payloads and inline
handler names. `scripts/parish-campaign-browser-tests.mjs` covers tier gating,
list rendering and refresh, create/edit and failed saves, upload recovery and
photo removal, and update history without contacting real services.
Opening a new campaign resets the editor heading. Opening a new or existing
campaign clears the update draft and its status text, including after cancel, so
an unposted message cannot carry into a different campaign. Failed posts keep
their draft available for retry while that editor remains open.

Source-based regression tests use `scripts/lib/parish-dashboard-source.mjs` to
read the actual extracted files listed in dashboard HTML. Boundary checks still
read the core separately. `parish-dashboard-runtime-tests.mjs` executes the
classic scripts separately in HTML order and exercises login authentication
without feature scripts.

Stewardship (`features/stewardship.js`) owns plan status, billing actions, and
its cached meeting list. Supporting scripts under `features/stewardship/` own
giving metrics and reports (`metrics.js`), financial snapshots and accounting
imports (`financials.js`), the snapshot editor (`financials-editor.js`), outside
giving (`outside-giving.js`), donor nudges (`nudges.js`), and annual-meeting
packets (`meetings.js`). Keep new behavior in the matching supporting file.

The shell calls the registered `load()`/`refresh()` lifecycle. Dashboard refresh
uses `invalidate()`; shared entitlement checks use `getStatus()` only as a legacy
fallback behind server entitlements. Shared badge updates call `renderMeetings()`
through the registry. These optional bridges also work on the standalone login
page, which loads no features. Authentication, parish identity, navigation, and
cross-feature entitlement decisions stay in the core; supporting files read them
only when actions run. `prefetch()` retains the existing quiet status loader.

`scripts/parish-stewardship-browser-tests.mjs` covers tier transitions, caching,
dashboard refresh, snapshot years and financial payloads, outside contributions,
meeting packet creation/editing, report links, and donor nudge preview. Failed
saves and retries use synthetic responses; no real records or messages are sent.
It runs with `test:parish-browser`, `test:parish-ui`, and the full check suite.

Giving (`features/giving.js`) owns the remaining giving workflows. Its supporting
files cover overview metrics, recurring health, gift history and CSV export,
giver lists, annual statements, fund/alms editing, festal giving, reconciliation,
transfer worksheets and reports, QR/bulletin materials, candles, and commemorations.
Navigation delegates History, Givers, Funds & Alms, and Reconciliation to `load(tab)`.
Dashboard refresh calls `refresh()`, which preserves the existing staggered
requests and immediately refreshes history or reconciliation when open.
`init()` populates the reconciliation month selector after core initialization;
`renderOverview()` and `renderOptions()` provide the shell's rendering hooks.

The shared editable fund, campaign, and feast catalogs and their baseline
snapshots remain in core because Accounting, Onboarding, and Settings use them.
Giving's feast helpers also serve the Settings patronal-feast fields. Shared
authentication, settlement profiles, formatting, downloads, settings saves,
subscription billing, tax exemption, and Stripe/nonprofit-pricing administration
remain in core. The login page continues to work without Giving scripts.

The Giving overview displays a visible notice and Retry totals button when its
summary refresh fails, retains the last displayed totals, and clears the notice
only after a successful refresh. `scripts/parish-giving-browser-tests.mjs` covers
this recovery, real fund and feast edits, history filters and exports, giver
search/sorting, reconciliation close/reopen and transfers, and statement job
confirmation/failure/retry. All API responses and statement jobs are synthetic;
the tests never email donors or move money.

## Worker routes

Domain route matching belongs under `src/routes/`. A router receives request-scoped context and returns a `Response` when it matches or `null` when it does not. `src/worker.js` owns only cross-cutting gates, ordered router composition, the final API 404, and static asset fallback.

Route order is part of the public contract. Add specific routes before generic prefix fallbacks, especially parish dashboard and Sacraments routes.

## Enforcement

`scripts/architecture-boundaries-tests.mjs` protects script order, feature registration, router composition, and the size ceilings for handwritten composition files. `scripts/run-tests.mjs` is the single tagged test entry point used by local development and CI.

`config/source-size-budgets.json` freezes every legacy JavaScript hotspot above 1,200 physical lines at its current size. A budget is a ceiling, not permission to add code: changed behavior must be extracted into the nearest domain module. New files cannot cross 1,200 lines, and a legacy budget entry must be removed once extraction takes that file below the threshold.

The `critical` test tag is the explicit runtime gate for authentication and financial boundaries. Its membership is protected by `scripts/critical-path-manifest-tests.mjs`; required CI still runs those suites through the complete `all` group.
