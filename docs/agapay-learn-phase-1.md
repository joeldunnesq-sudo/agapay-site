# AGAPAY Learn Phase 1

## What was added

- `learn` product flag plumbing through the worker and local dev server
- Phase 1 D1 schema in `migrations/0003_agapay_learn_phase1.sql`
- TypeScript domain models and enums in `src/learn/domain.ts`
- Future-facing print/report/transcript record contracts in `src/learn/future-records.ts`
- Seed-backed Learn repositories and liturgical service abstractions in `src/learn/*.js`
- AGAPAY Learn layout, Dashboard / Today page, and placeholder routes in `public/learn/*`

## What is real vs seeded

- Real in this phase: route structure, product gating, D1 schema, repository boundaries, dashboard rendering, and calendar toggle interaction.
- Seeded in this phase: household, children, school year, term, cycle, curriculum package, liturgical week data, church rhythm checklist state, lesson blocks, narration logs, read-aloud progress, and Grace Mode season.

## How the calendar toggle works

- The dashboard stores the selected calendar in `localStorage` under `agapay.learn.calendar`.
- The client requests `/api/learn/dashboard?calendar=julian` or `/api/learn/dashboard?calendar=revised-julian`.
- `SeedLiturgicalRepository` swaps the liturgical week entries by calendar type while keeping the rest of the dashboard payload stable.
- The UI label is derived from the existing shared liturgical calendar helper so future production data can keep the same toggle contract.

## How cycles are modeled

- `CycleFramework` defines the broad cycle system, such as a combined history and catechesis loop.
- `CycleYear` identifies the active year inside that framework.
- `CycleTopic` carries season-aware topic slices that later phases can project into planner, formation, and reporting views.
- The dashboard already surfaces the active cycle year and current seasonal topics through the seed repository payload.

## Next recommended steps

1. Replace the seed repositories with D1-backed repositories while preserving the same response shape.
2. Build Planner next using the existing child tracks, lesson day, and lesson block schema.
3. Expand the liturgical seed abstraction into a real ingest pipeline with fuller daily texts and jurisdiction-aware saints.
4. Add authenticated household access once Learn moves past the single demo household stage.

## Phase 2 Addendum

Phase 2 adds the core planning engine on top of the Phase 1 foundation.

- Planner now has real Week and Term views at `/learn/planner`.
- Week view shows a liturgical strip, household stream rows, child plan rows, upcoming feasts, read-aloud progress, quick reschedule, and Grace Mode adjustments.
- Term view shows term setup cards, cycle/curriculum context, household stream and child track summaries, and a 12-week pacing grid.
- Curriculum support now includes packages, subjects, resources, and mappings for cycle, term, household stream, and child track targets.
- Grace Mode now has a rules-backed seed model with full, light, minimum viable, feast only, and custom modes represented in the UI.
- Print Center at `/learn/print-center` includes first-pass printer-friendly mom and child outputs.

The data is still seed-backed, but the routes and repository payloads are shaped so D1-backed repositories can replace them later without rewriting the UI.

## Phase 3 Addendum

Phase 3 completes the remaining Phase 1 visual surface without beginning the next product phase.

- Formation at `/learn/formation` now renders church rhythms, catechesis, recitation, hymn study, enrichment, saints/feasts, and nature journal records.
- Books at `/learn/books` now renders current read-alouds, household library metadata, Orthodox suggestions, book pacing, and copywork sources.
- Reports at `/learn/reports` now renders child progress, narration logs, compliance exports, generated report card records, and generated transcript records.
- Setup at `/learn/onboarding` now provides the household onboarding flow and default Learn preferences.
- Co-op at `/learn/co-op` is scaffolded behind the `learn-coop` feature flag. Local development enables it by default; production remains gated by `AGAPAY_ENABLED_PRODUCTS`.
- Phase 3 schema lives in `migrations/0005_agapay_learn_phase3.sql` and covers rotations, catechesis cycles, recitation, hymn study, enrichment, nature journal entries, report exports, and co-op records.
- `scripts/check-learn.mjs` adds lightweight payload and schema assertions for the new Learn surface.

The new Phase 3 pages continue to use seed-backed repositories and static UI, matching the previous phases' boundary.

## Phase 4 Hardening Addendum

Phase 4 refines the existing Learn surface without redesigning it.

- Liturgical data now goes through `src/learn/liturgical-source.js`, with seed and production-source boundaries.
- Print preview data now goes through `src/learn/print-engine.js`, preparing the Print Center for a stronger PDF generation path.
- Report card and transcript preview payloads now go through `src/learn/academic-exports.js`.
- Planner, Print Center, Formation, Books, and Reports actions now open keyboard-accessible draft edit/export dialogs instead of inert buttons.
- Loading, error, empty, focus, progressbar, and dialog states were hardened in `public/learn/app.js` and `public/learn/style.css`.
- `scripts/check-learn.mjs` now covers helper behavior, repository payloads, schema presence, and core UI hooks.

The app is still seed-backed, but Phase 4 makes the boundaries cleaner for production data, PDF generation, and richer edit persistence.
