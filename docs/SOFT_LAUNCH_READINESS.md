# AGAPAY Soft-Launch Readiness & Future-Proofing — Tracker

This file is the source of truth for a 13-phase hardening initiative. It is
meant to survive across chat sessions, tools, and contributors (Joel,
Claude, Antigravity, Codex). **Update this file whenever a phase's status
changes.** Don't rely on chat history to know what's done — read this file
first.

Full original spec (all 13 phases) is preserved in
`docs/SOFT_LAUNCH_READINESS_SPEC.md`.

## How to read this file

Each phase has a status:
- `NOT STARTED`
- `IN PROGRESS`
- `DONE` — shipped and merged to `main`
- `DEFERRED` — deliberately postponed past soft launch, with a reason

## Ground rules established for this initiative

- No phase touching auth, money, or stored user data ships without Joel's
  explicit review and a working `npm run check` / `npm run prelaunch` pass.
- Claude has **read-only** access to `github.com/joeldunnesq-sudo/agapay-site`
  (anonymous clone works, no push credentials). All changes are handed to
  Joel as files to upload via the GitHub web UI, same as the existing
  workflow. Claude does not create branches or PRs itself.
- Phases 5–13 (admin support tools, audit log, data export/deletion,
  entitlements, canonical identity model, permissions system, financial
  ledger, webhook inbox, background jobs) are substantial new architecture
  touching auth/money/PII. These are **not** being built in the pre-launch
  push. They're scoped and sequenced below for after soft launch.

---

## ⚠ Verification note (2026-07-05, session 2)

Before doing new work this session, Claude cloned `main` fresh and checked
every file this tracker claimed as delivered. Result: **Phase 1 and Phase 2
claims were accurate** — those files are genuinely on `main`. **Phase 3 and
Phase 4 were not** — the tracker said `src/lib/logging.js`,
`docs/MONITORING_CHECKLIST.md`, `docs/BACKUP_RESTORE_RUNBOOK.md`, and
`scripts/validate-restore.mjs` existed and were wired in; none of the four
were actually present on `main`, and no code anywhere imported a shared
logger. Likely explanation: those files were written in a prior chat
session but never uploaded to GitHub.

Lesson for future sessions: **always verify against a fresh clone before
trusting this file's checkmarks.** This tracker is the source of truth for
intent, not proof of what's live — that's what `git log` / a fresh clone
is for.

All four files have now been built for real in this session (see Phase 3
and Phase 4 below) and are staged for Joel to upload. Also found: `npm run
check` currently fails at `scripts/check-learn.mjs` ("Learn dashboard
should load the active dashboard shell") — **this is a pre-existing
failure unrelated to Phases 1–4**, present on `main` before this session's
changes. Flagging it here so it isn't confused with anything below; it's
a Learn-area issue, not a hardening regression.

## ⚠ Verification note (2026-07-06, session 3)

Confirmed session 2's Phase 3/4 files uploaded correctly (fresh clone,
`npm run check` — before this session's fixes — passed everything except
the already-known `check-learn.mjs` issue). While investigating that
issue, found a **new regression**: `scripts/route-map-integrity.mjs` and
the Odyssey-expanded `scripts/smoke-live.mjs` from Phase 1 — verified
genuinely on `main` in session 2 — were **gone** by this session, and
`package.json`'s `check` script no longer referenced
`route-map-integrity.mjs` at all. `git log --all -- scripts/route-map-
integrity.mjs` shows zero history for that path, which rules out a normal
revert commit; most likely a later upload (possibly from Codex, given the
`codex-soft-launch-readiness-hardening` branch) overwrote `package.json`
and didn't carry the file forward. Rebuilt both from scratch against the
*current* `worker.js` route tables rather than restoring old file content
blind (the routes may have changed since). Also root-caused and fixed the
`check-learn.mjs` failure: it was a stale assertion left over from an
intentional July 3 refactor (Learn dashboard shell-loading moved into
`mobile-gate.js`'s dynamic `import()`), not a live bug — Learn itself was
never broken. `npm run check` is fully green again as of this session.

Separately, fixed a live PWA bug: several in-app links (My AGAPAY "Give"
tab, back-button fallback, Learn/Odyssey "My AGAPAY" links) pointed at the
bare path `/myagapay` instead of `/myagapay/dashboard`. The installed PWA's
manifest scope is `/myagapay/` (trailing slash) — `/myagapay` without the
slash doesn't match that scope as a URL prefix, so navigating to it kicked
the app out of standalone display into browser chrome (title bar + close
button). Fixed at the source across 8 files; `/myagapay/dashboard` serves
identical content per the Worker's own route table, so this is a
zero-risk, same-content fix. Bumped the cache-busting `?v=` query strings
on the 3 JS files that changed (`myagapay-shell.js`, `dashboard-shell.js`,
`mobile-gate.js`) everywhere they're referenced, so browsers don't serve
stale cached copies after upload.

## Phase 1 — Expand automated prelaunch/route testing
**Status: DONE (rebuilt 2026-07-06 after a regression — see verification note above)**

- [x] Inventoried existing scripts: `scripts/prelaunch-checks.mjs`,
      `scripts/check.mjs`, `scripts/smoke-live.mjs`, `scripts/worker-hardening-tests.mjs`
- [x] Confirmed the 3 static route tables in `src/worker.js`:
      `MYAGAPAY_ASSET_ROUTES` (path → served file), `DASHBOARD_LEGACY_REDIRECTS`,
      `LEGACY_GIVING_PAGE_REDIRECTS` (path → path, not files)
- [x] Rebuilt `scripts/route-map-integrity.mjs` — parses `MYAGAPAY_ASSET_ROUTES`,
      the hardcoded `url.pathname = "...html"` rewrites in `cleanAssetRequest()`,
      and the `staticGivePages` Set, and fails if any mapped file is missing
      under `public/`. Also explicitly checks the 5 Odyssey files named in
      the original spec. 55 file-backed targets checked as of this session.
- [x] Re-expanded `scripts/smoke-live.mjs` with the full route list from the
      spec (Odyssey landing/dashboard/login/activate incl. trailing-slash
      variants, `/api/health`, `/marketplace`, `/directory`, `/vision`,
      `/register`, `/admin/login`, etc.)
- [x] Wired `route-map-integrity.mjs` back into `npm run check`
- [x] Updated README with exact commands for all four check types (local,
      route-map integrity, prelaunch, production smoke)
- [ ] Joel to run `npm run check` and `node scripts/smoke-live.mjs
      https://agapay.app` against production once uploaded, confirm green

Files touched (this session, staged for upload): `scripts/route-map-integrity.mjs`
(new — same filename, rebuilt), `scripts/smoke-live.mjs`, `package.json`, `README.md`

## Phase 2 — Health, version, and deployment diagnostics
**Status: DONE** (admin diagnostics panel built 2026-07-06, session 4 — staged for upload)

- [x] Added `GET /api/health` to `src/worker.js` — checks D1 (`SELECT 1`),
      KV (read-only `.get` on a sentinel key), reports Stripe/email/R2 config
      *presence* only (no live calls), returns `version` from
      `AGAPAY_BUILD_SHA` env var (falls back to `"unknown"` if unset)
- [x] Added `AGAPAY_BUILD_SHA` injection to `.github/workflows/deploy.yml`
      (set from `${{ github.sha }}` at deploy time via `wrangler.toml` var override)
- [x] Added automated test in `scripts/check.mjs` asserting the handler exists
      and never echoes secret values
- [x] Added a "Deployment & Health" panel to the admin Overview tab
      (`public/admin.html` + `public/admin/app.js`) — shows version,
      environment, deployed-at, current UTC time, `/api/health` checks
      (worker/D1/KV/Stripe/email/R2) as status badges, and release-flag
      state. Reuses the existing `.badge.<key>` 4-color convention, no new
      CSS colors introduced. Also extended `GET /api/admin/release-status`
      (`src/handlers/admin.js`) to return actual feature-flag *values*
      (`featureFlags` object) — it previously only reported config
      *presence*, not the flags themselves, so there was nothing for a
      "release flags" panel to show before this.
- [x] Added `/api/health` (and the new `stripe.webhook.*` log events from
      Phase 3) to `docs/launch-incident-runbook.md`'s "Quick diagnostics"
      section

Files touched (verified on `main`): `src/worker.js`, `wrangler.toml`,
`.github/workflows/deploy.yml`, `scripts/check.mjs`.
Files touched (this session, staged for upload): `docs/launch-incident-runbook.md`

## Phase 3 — Observability and structured error logging
**Status: IN PROGRESS (partial — scoped down deliberately)**
**Built this session (2026-07-05); not yet uploaded/verified on `main` — see
verification note above.**

- [x] Added `src/lib/logging.js` — a structured JSON logger (`logEvent()`)
      that emits the fields from the spec (event type, severity, request ID,
      route, method, timestamp, error name, sanitized message, retryable,
      deployment version) to `console.log`/`console.error` for Cloudflare's
      log ingestion. Includes a `sanitize()` helper that strips known-sensitive
      keys (password, token, secret, authorization, signature, etc.) before
      anything is logged. `node --check` passes on this file.
- [x] Wired structured logging into the full Stripe webhook lifecycle in
      `src/handlers/stripe.js` (`handleStripeWebhook`): misconfigured
      secret, invalid signature, invalid payload, duplicate event,
      processed, and processing-failed — each with a distinct `eventType`
      and a request ID generated per webhook call.
- [x] Wired structured logging into the donor login failure path in
      `src/handlers/donor.js` (`handleDonorLogin`) — logs a hashed email
      (`sha256Hex`, never the raw address or password) on failed login,
      consolidating the "no such donor" and "wrong password" branches into
      one log point so failure timing doesn't differ between the two (minor
      side-benefit, not the primary goal).
- [ ] **Could not find** a dedicated parish-login or admin-login handler
      distinct from `handleDonorLogin` in the time available this
      session — `/parish/login` and `/admin/login` in `src/worker.js` are
      static-asset redirects, not API handlers, and no `handleParishLogin`/
      `handleAdminLogin` function exists under those names in
      `src/handlers/`. Whoever picks this back up should locate the actual
      parish/admin auth-check code path (likely inline in `worker.js` or in
      `admin.js`/`parish.js` under a different name) before wiring logging
      there. Do not mark this done until that's found and confirmed.
- [ ] **NOT wired yet**: Learn/Odyssey billing, email delivery, D1 writes,
      R2 uploads, scheduled jobs, weekly bookstore summaries, Google Calendar
      sync, export/deletion jobs (most of these don't exist yet — see Phase 7/13)
      — deliberately scoped down. Rationale: threading a new logging call
      through every write path in one unreviewed pass is itself a launch-week
      risk. Recommend doing this incrementally, one subsystem per PR, after
      launch, using the `stripe.js` wiring as the reference pattern.
- [x] Added `docs/MONITORING_CHECKLIST.md` — manual configuration checklist
      for Cloudflare Worker error alerts, Stripe webhook failure alerts, email
      delivery failure alerts, scheduled task failure alerts. Explicitly does
      **not** claim these are auto-configured — they require manual dashboard
      setup, documented step by step.

Files touched (new/modified, staged for upload): `src/lib/logging.js` (new),
`src/handlers/stripe.js`, `src/handlers/donor.js`,
`docs/MONITORING_CHECKLIST.md` (new)

## Phase 4 — Database backup and restore runbook
**Status: IN PROGRESS (docs + script written; not yet run against a real restore)**
**Built this session (2026-07-05); not yet uploaded/verified on `main` — see
verification note above.**

- [x] `docs/BACKUP_RESTORE_RUNBOOK.md` — full runbook: export commands,
      storage/retention guidance, restore into a temp D1 database, validation
      steps, record-count comparison, relationship checks, per-domain checklist
      (donor/parish/donation/subscription/Learn/student/settlement/tax/bookstore),
      migration-failure response, forward-repair guidance. Table/column
      names in the runbook and script were checked against the actual
      `migrations/*.sql` files, not guessed.
- [x] `scripts/validate-restore.mjs` — read-only validation script: confirms
      expected tables exist, migration status is current, IDs aren't null,
      `stripe_subscription_id`/`stripe_account_id` unique where non-null, no
      duplicate `stripe_events` rows, `learn_children`→`learn_households`
      relationship intact, `commerce_orders`/`settlement_profiles`
      `parish_id` populated, `tax_exemptions.registration_reference`
      resolves. Refuses to run against `agapay-production` by name or
      database ID — no override flag. `node --check` passes.
- [ ] **Not yet run against a real restore.** The script has been written
      against the current schema but never executed end-to-end (would
      require `wrangler` auth Claude doesn't have). Treat the first real
      run as validating the script itself, not just the data — flagged in
      the runbook too.

Files touched (new, staged for upload): `docs/BACKUP_RESTORE_RUNBOOK.md`,
`scripts/validate-restore.mjs`

---

## Security response headers (pre-launch easy win, outside the 13-phase spec)
**Status: DONE** (2026-07-06, session 4 — staged for upload)

Not part of the original 13-phase spec, but flagged during the platform
review as a cheap, no-behavior-risk item worth doing before soft launch.

- [x] Added `public/_headers` (new, Cloudflare-native) covering every
      static-asset response, and a shared `SECURITY_HEADERS` constant in
      `src/lib/core.js` applied via `json()`/`corsJson()` covering
      Worker-generated API responses (561 of ~597 total response call
      sites; see `docs/SECURITY_HEADERS.md` for the ~36 hand-rolled
      `Response` sites not yet covered — low priority, flagged not fixed).
- [x] Enforcing immediately: `X-Content-Type-Options`, `Referrer-Policy`,
      `X-Frame-Options: SAMEORIGIN`, `Strict-Transport-Security`
      (180 days, no `includeSubDomains`/`preload` yet), `Permissions-Policy`
      (camera left available same-origin for the bookstore barcode
      scanner — confirmed by checking actual usage, not assumed).
- [x] `Content-Security-Policy-Report-Only` — deliberately **not**
      enforcing yet. Built by actually grepping the codebase for every
      external script/style/frame/connect target rather than guessing;
      confirmed Stripe Checkout is server-side-redirect only (no
      `js.stripe.com`/Elements in the browser at all), so the allowlist
      only needs Cloudflare Turnstile, Google Fonts, jsdelivr, and unpkg.
      Full rationale and the path to flipping it to enforcing is in
      `docs/SECURITY_HEADERS.md` — **read that before ever changing
      `Content-Security-Policy-Report-Only` to `Content-Security-Policy`.**
- [x] Added assertions to `scripts/check.mjs` so this can't silently
      regress the way Phase 1's route-map integrity check did — checks
      both `core.js` and `public/_headers` exist and stay in sync, and
      explicitly asserts CSP is still Report-Only (fails loudly if someone
      flips it to enforcing without reading the doc first).

Files touched (staged for upload): `public/_headers` (new),
`docs/SECURITY_HEADERS.md` (new), `src/lib/core.js`, `scripts/check.mjs`

## Phase 6 — Audit log foundation
**Status: DONE** (2026-07-06, session 5 — staged for upload)

- [x] Migration `migrations/0014_audit_log.sql` — append-only `audit_log`
      table (`id, actor_user_id, actor_type, actor_role, action, target_type,
      target_id, organization_id, household_id, request_id, ip_hash, reason,
      before_summary_json, after_summary_json, metadata_json, created_at`),
      indexed on `created_at`, `action`, `target_type+target_id`,
      `organization_id`, `actor_user_id`. Deliberately separate from (a)
      `src/lib/logging.js`'s ephemeral console logs, and (b) the existing
      per-registration `appendAdminAudit()` trail in `src/handlers/parish.js`
      — this table is a cross-record index on top, not a replacement for
      either.
- [x] `src/lib/audit-log.js` — `recordAuditEvent()` (never throws; falls
      back to `logEvent()` if the D1 write itself fails, so a logging
      failure can never block the actual privileged action) and
      `listAuditEvents()` (filtered, paginated, newest-first read path).
      Defensively truncates `before`/`after`/`metadata` JSON so a mistake
      passing a full record instead of a small summary can't balloon the
      table or leak more than intended.
- [x] Wired into 3 real existing privileged actions as concrete proof it
      works end-to-end (not just scaffolding):
      - `admin.index_rebuild` (`handleAdminRebuildIndexes`, `admin.js`)
      - `registration.status_changed` (`handleAdminRegistrationDetail`
        PATCH branch, `admin.js`) — the highest-signal existing action
        (parish verify/reject)
      - `settlement_profile.*` — renamed, active-changed,
        default-giving-changed, default-commerce-changed, module-assigned
        (`handleParishSettlementProfiles`, `parish.js`) — explicitly called
        out in the original spec as needing audit coverage, since these
        control where parish money is routed
- [x] Admin audit-log viewer: new "Audit Log" tab in `public/admin.html` /
      `public/admin/app.js`, filterable by action / actor / target type /
      target ID / organization / date range, paginated ("Load more").
      Backed by new `GET /api/admin/audit-log` (`handleAdminAuditLog`,
      `admin.js`).
- [x] Added `scripts/check.mjs` assertions: migration creates the table,
      the service exports the right functions, no UPDATE/DELETE path
      exists anywhere (append-only stays append-only), and all 3 wire-in
      points are actually present in source — same regression-guard
      pattern used for Phase 1 and the security headers.

**Not done, deliberately deferred**: full coverage of every action listed
in the original spec (session revocation, verification resend, entitlement
grants, refunds, transcript finalization, export/deletion, migration
execution, release-flag changes) — most of those features don't exist yet
(Phase 5/7/8/9/10). The 3 wire-ins above prove the foundation works;
wiring each new privileged feature into `recordAuditEvent()` as it's built
is now a small addition, not a new system.

Files touched (staged for upload): `migrations/0014_audit_log.sql` (new),
`src/lib/audit-log.js` (new), `src/handlers/admin.js`,
`src/handlers/parish.js`, `src/worker.js`, `public/admin.html`,
`public/admin/app.js`, `public/admin/style.css`, `scripts/check.mjs`

## Phases 5–13 — remaining work after soft launch

Recommended order, roughly easiest/lowest-risk first (Phase 6 above is
done — support tools and everything after it now has somewhere to log to):

1. **Phase 5 — Admin support & account recovery tools** (depends on
   Phase 6, now done)
2. **Phase 12 — Stripe webhook inbox/replay** (strengthens what already
   exists; webhook idempotency is already solid per the security audit,
   this formalizes storage + replay)
3. **Phase 8 — Entitlements separate from billing** (needed before Phase 9
   makes sense; existing Learn/Odyssey access logic should migrate here)
4. **Phase 7 — Account data export/deletion** (needs Phase 6 audit log,
   now done)
5. **Phase 11 — Immutable financial event ledger**
6. **Phase 13 — Background job foundation** (Cloudflare Queues vs D1-backed;
   needs its own spike to decide)
7. **Phase 10 — Permission-based authorization** (touches every route;
   should follow, not precede, Phase 9)
8. **Phase 9 — Canonical identity/household/org architecture doc** (design
   doc first, no schema changes, since a full identity rewrite pre-launch
   was explicitly ruled out in the original spec too)

## Change log

- 2026-07-06 (session 6) — Built a tax readiness gate (separate from
  canonical/ministry verification) per direct spec: a canonically
  verified parish can now be correctly blocked from paid subscription
  checkout until AGAPAY has manually reviewed billing/tax jurisdiction
  readiness. New `src/lib/tax-readiness.js` (pure, no D1 dependency);
  gate wired into the single shared `createSubscriptionCheckoutForRegistration()`
  in `src/lib/subscription-checkout.js`, which as a side effect also
  closed a pre-existing gap where the admin-triggered checkout path had
  no verified-status check at all (only the parish self-service path did).
  Admin PATCH (`src/handlers/admin.js`) extended to manage tax readiness
  status/notes/billing address, auto-setting reviewed-at/by and recording
  a `registration.tax_readiness_changed` audit event (Phase 6). Admin UI
  got a new "Tax / Billing Readiness" panel + edit form
  (`public/admin/app.js`), reusing the existing `.badge`/`.requirements-panel`
  patterns rather than new CSS. Learn billing (`src/learn/billing.js`)
  already had `billing_address_collection: required` and
  `automatic_tax[enabled]: true` -- nothing to add there; added storage
  for a household billing address (captured from Stripe's own
  `customer_details.address` on checkout completion where present, with
  fallback-to-existing so a later renewal webhook without address data
  doesn't blank it out). No D1 migration -- registrations are stored as a
  single JSON blob already, so new fields are just additional properties;
  see the file's own comment for why. New `scripts/tax-readiness-tests.mjs`
  runs real functional tests against the actual gate and checkout
  function (Stripe calls mocked via monkeypatched `fetch`, with explicit
  assertions that fetch is never called on the blocked paths) — wired
  into `npm run check`. Confirmed via `git diff --name-only` that no
  bookstore/commerce file was touched. `npm run check` fully green.

- 2026-07-05 — Initial tracker created. Phases 1–4 started.
- 2026-07-05 (session 2) — Verified this tracker against a fresh clone of
  `main`. Confirmed Phases 1–2 files were genuinely present and correct.
  Found Phase 3 and Phase 4 files were claimed done but absent from `main`
  (`src/lib/logging.js`, `docs/MONITORING_CHECKLIST.md`,
  `docs/BACKUP_RESTORE_RUNBOOK.md`, `scripts/validate-restore.mjs`). Built
  all four for real this session, wired logging into the Stripe webhook
  lifecycle and donor login failures, added `/api/health` to the incident
  runbook. Also found and flagged a pre-existing, unrelated
  `check-learn.mjs` failure blocking a fully green `npm run check`. Files
  from this session are staged for Joel to upload — none are on `main` yet.
- 2026-07-06 (session 3) — Confirmed session 2's Phase 3/4 upload was
  correct. Found Phase 1's `route-map-integrity.mjs`/expanded
  `smoke-live.mjs` had regressed off `main` since session 2 (see
  verification note above) — rebuilt both against the current `worker.js`.
  Root-caused and fixed the `check-learn.mjs` failure (stale assertion,
  not a live bug). `npm run check` is fully green for the first time this
  initiative. Also fixed a live PWA bug (unrelated to the 13-phase spec,
  reported directly by Joel): several in-app links used a bare `/myagapay`
  path that fell outside the installed PWA's manifest scope
  (`/myagapay/`), kicking the app out of standalone mode into browser
  chrome. Fixed across 8 files, cache-busting versions bumped.
- 2026-07-06 (session 4) — Closed out the remaining "easy win" items from
  the platform review: shipped security response headers (new
  `public/_headers` + `SECURITY_HEADERS` in `core.js`, CSP in
  Report-Only mode — see `docs/SECURITY_HEADERS.md`), and built the
  admin diagnostics panel that Phase 2 had flagged but never shipped
  (`public/admin.html` + `public/admin/app.js`, plus a `featureFlags`
  addition to `GET /api/admin/release-status` in `src/handlers/admin.js`
  since the endpoint had nothing for a "release flags" panel to show
  before). Phase 2 is now fully DONE. `npm run check` still fully green.
- 2026-07-06 (session 5) — Built Phase 6 (audit log foundation): migration,
  service layer, wired into 3 real existing privileged actions (index
  rebuild, registration status changes, settlement profile changes), and
  an admin viewer tab with filters. Phase 6 is now fully DONE, unblocking
  Phase 5 (admin support tools) and Phase 7 (data export/deletion) to
  proceed whenever picked up next. `npm run check` still fully green.
- 2026-07-06 (session 5, continued) — Redesigned the parish dashboard's
  Stewardship tab per direct request (outside the 13-phase spec): the tab
  had emptied out visually after Annual Meeting Packets moved to Parish +.
  Found two backend endpoints (`/stewardship/giving/distribution` and
  `/stewardship/giving/retention` in `src/worker.js`) that were already
  fully built and routed but never called from the frontend — added two
  new cards (Donor Retention, Giving Distribution) using that existing
  data instead of building anything new server-side. Also added a
  color-coded fulfillment ring to the existing Stewardship Reports card.
  Grid changed from 3-column (awkward with an odd card count) to a clean
  2x2. Color conventions: green/red/gold semantic tones for
  retained/lapsed/new donors, a 5-step gold-intensity scale for giving
  tiers. Locked/upsell states for non-subscribers updated to match. Files:
  `public/parish/dashboard.html`, `public/parish/app.js`,
  `public/styles/stewardship.css`, `scripts/check.mjs`.
- 2026-07-07 — AGAPAY Learn / TEKS-Odyssey pre-launch pass (outside the
  13-phase spec, but pre-launch work worth tracking here). Fixed: TEFA
  dashboard nav order now matches classic AGAPAY Learn exactly (was
  reordered for TEFA framing, which Joel found confusing — reverted to
  shared order, kept only label wording TEFA-specific); Church Rhythm
  minimize button on the dashboard was non-functional — an inline
  `style="display:flex"` on the collapsible body outranked the `[hidden]`
  UA rule, so the button changed its own label/state but never actually
  hid anything; fixed by driving `display` explicitly in both initial
  render and the click handler. Found and fixed a real data gap: Report
  Card/Transcript PDFs were rendering from a disconnected narrative
  "Reports" model instead of the real Grades & Attendance gradebook a
  parent fills in — rebuilt both as dedicated pdf-lib documents
  (`buildAcademicReportCardPdf`/`buildAcademicTranscriptPdf` in
  `src/learn/print-documents.js`) sourced from real course/term/credit
  data, with the transcript pulling every academic year on file
  (`loadAllCoursesForHousehold`, new) rather than just the active year,
  since a transcript is a K-12 record. Iterated the transcript layout
  twice against Joel-supplied reference templates (two-column
  School/Student info, four grade-level tables shown two-up, compact
  grading-scale legend, one page). Added: ACT/SAT score entry on the
  Grades & Attendance page (new `learn_test_scores` table, migration
  `0015`, `src/learn/test-scores.js`) that prints directly on the
  transcript; homeschool name + patron saint fields in Setup that print
  on both documents (`src/learn/setup-persistence.js`,
  `dashboard-view-models.js`). While wiring the patron saint field, found
  and fixed a **pre-existing** bug: the parish patronal feast fields saved
  correctly but were never read back into the setup view model, so they
  always rendered blank on reload — same root cause class as the new
  fields would have hit if copied blind. Separately hardened the local
  dev server (`server.mjs`) for this area, since it had no working path to
  test any of it: missing `/learn/odyssey/dashboard/*` routing, the PDF-
  generation POST endpoint wasn't wired at all, and PDF rendering had no
  fallback for the missing Cloudflare Browser Rendering binding
  (`AGAPAY_TEST_MODE` now set locally to route through the pdf-lib
  renderer). Migration `0015` and all files applied by Joel; `npm run
  check` fully green on a fresh clone as of this entry. **Not verified
  end-to-end against production D1**: course/grade save and the
  Report Card/Transcript print flow were tested locally against the
  dev-server's non-D1 fallback path and via direct unit tests of the PDF
  builders with synthetic data — never against a real D1-backed save in
  production. Recommend one real click-through before calling Learn done:
  Setup (add homeschool name + patron saint) → Grades & Attendance (add a
  course with a grade, add an ACT or SAT score, Save) → Print Report Card
  and Print Transcript → confirm the PDFs reflect what was actually
  entered.
- 2026-07-07 (continued) — Joel ran `node scripts/smoke-live.mjs` against
  production via GitHub Actions: all green. Closes Phase 1's remaining
  open item. Only open pre-launch item left on this tracker: the backup/
  restore runbook and `scripts/validate-restore.mjs` have been written
  and checked against the schema, but still never run against a real
  restore — recommend doing one before relying on it in an actual
  incident.
- 2026-07-07 (continued) — Joel ran the actual restore drill: exported
  production, restored into a scratch D1 database
  (`agapay-restore-test`, created via the Cloudflare dashboard),
  restore itself succeeded cleanly (512 queries, 1805 rows written, no
  errors). `validate-restore.mjs` failed all 10 checks with `spawnSync
  npx ENOENT` — not a data problem, a real bug: `execFileSync("npx", ...)`
  needs `shell: true` to resolve `npx.cmd` on Windows, which the script
  didn't have. First fix attempt (`shell: true`) was only verified by
  reading the code, not by running it — Joel re-ran it and it failed
  differently: `cmd.exe` was re-splitting the multi-word `--command` SQL
  string into separate arguments ("Unknown arguments: name, FROM,
  sqlite_master..."), and a second, independent bug surfaced in the same
  run — the migration-status check used `wrangler d1 migrations list`,
  which requires a `wrangler.toml` binding that a scratch database never
  has. Real fix: stopped using a shell/`.cmd` entirely — the script now
  resolves wrangler's real JS entry point on disk and spawns it via
  `node.exe` directly (`execFileSync(process.execPath, [wranglerBin,
  ...])`), which preserves each argument exactly with no shell
  involved; the migration check now queries D1's own `d1_migrations`
  table directly instead of calling the wrangler.toml-bound subcommand.
  This time verified by actually running it (against a nonexistent DB
  name, no real credentials available in-session) and confirming it
  reaches wrangler's own auth error rather than an argument-parsing
  failure — proof the splitting bug is gone, not just inspection. **Still
  needs**: one more real run against `agapay-restore-test` with actual
  credentials to confirm all 10 checks genuinely pass against real data.
- 2026-07-07 (continued) — Restore drill closed out. Two more real findings
  surfaced on the way to a clean run, both fixed:
  - `EXPECTED_TABLES` listed `household_pledges_new`, a transient
    mid-migration table name (migrations 0003/0004 create it, copy data,
    then rename it to `household_pledges` as the final step) — the script
    was checking for a name that's never supposed to exist in a healthy
    database. Fixed to check for `household_pledges` instead.
  - The stripe_subscription_id/stripe_account_id uniqueness checks only
    excluded SQL `NULL`, not empty strings. Pending/incomplete
    registrations store an unset value as `''`, not `NULL`, so multiple
    pending registrations were getting grouped together as a false
    "duplicate." Fixed both checks to exclude `''` too.
  - Also confirmed (separately, real production finding, not a
    restore-mechanism bug): migrations 0010-0015 had never been recorded
    in D1's `d1_migrations` bookkeeping table, because they were applied
    by pasting SQL into the Cloudflare dashboard console rather than via
    `wrangler d1 migrations apply` — the only thing that writes that
    bookkeeping row. The actual schema was confirmed present the whole
    time (`settlement_profiles`, `tax_exemptions`, `learn_test_scores` all
    existed and worked); this was purely a tracking gap, but a real one —
    left as-is, it would have made a future `wrangler d1 migrations apply`
    try to re-run 0010-0015 and fail on the non-idempotent `ALTER TABLE
    ... ADD COLUMN` statements. Joel backfilled `d1_migrations` with the 6
    missing rows directly against production.
  - Along the way, also improved the script's own error reporting:
    `query()` was swallowing wrangler's actual stderr behind a generic
    "Command failed: <command>" message, which cost a full round-trip to
    even see what was wrong on a transient failure. Now surfaces the real
    error text.
  Final run: **all 10 checks pass clean** against `agapay-restore-test`.
  This is the first time this script — or this runbook — has been
  exercised end to end against a real production export. Every failure
  encountered along the way turned out to be in the validation tooling
  itself (Windows shell/`.cmd` quoting, twice; a stale table name; a
  missing empty-string filter; one transient network blip), never the
  restore mechanism or the underlying data. The backup/restore runbook is
  now genuinely proven, not just written. Scratch database
  `agapay-restore-test` and the local `.sql` export should be cleaned up
  per the runbook's step 5 (`npx wrangler d1 delete agapay-restore-test`,
  then move or delete the local export file) once Joel is satisfied.
