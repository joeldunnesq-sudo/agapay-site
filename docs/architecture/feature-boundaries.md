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

Rules:

- Use a lowercase kebab-case feature ID.
- Register exactly once and provide `load()`.
- Keep feature API calls, state, rendering, and event behavior in the feature file.
- Do not move authentication tokens or parish identity into module-level mutable state.
- Load `feature-registry.js` before feature scripts and load feature scripts before `app.js` until the legacy global compatibility layer is retired.

## Worker routes

Domain route matching belongs under `src/routes/`. A router receives request-scoped context and returns a `Response` when it matches or `null` when it does not. `src/worker.js` owns only cross-cutting gates, ordered router composition, the final API 404, and static asset fallback.

Route order is part of the public contract. Add specific routes before generic prefix fallbacks, especially parish dashboard and Sacraments routes.

## Enforcement

`scripts/architecture-boundaries-tests.mjs` protects script order, feature registration, router composition, and the size ceilings for handwritten composition files. `scripts/run-tests.mjs` is the single tagged test entry point used by local development and CI.

`config/source-size-budgets.json` freezes every legacy JavaScript hotspot above 1,200 physical lines at its current size. A budget is a ceiling, not permission to add code: changed behavior must be extracted into the nearest domain module. New files cannot cross 1,200 lines, and a legacy budget entry must be removed once extraction takes that file below the threshold.

The `critical` test tag is the explicit runtime gate for authentication and financial boundaries. Its membership is protected by `scripts/critical-path-manifest-tests.mjs`; required CI still runs those suites through the complete `all` group.
