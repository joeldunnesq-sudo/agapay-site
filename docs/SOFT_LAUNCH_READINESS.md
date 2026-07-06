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
**Status: IN PROGRESS** (core endpoint verified DONE on `main`; admin UI section still open)

- [x] Added `GET /api/health` to `src/worker.js` — checks D1 (`SELECT 1`),
      KV (read-only `.get` on a sentinel key), reports Stripe/email/R2 config
      *presence* only (no live calls), returns `version` from
      `AGAPAY_BUILD_SHA` env var (falls back to `"unknown"` if unset)
- [x] Added `AGAPAY_BUILD_SHA` injection to `.github/workflows/deploy.yml`
      (set from `${{ github.sha }}` at deploy time via `wrangler.toml` var override)
- [x] Added automated test in `scripts/check.mjs` asserting the handler exists
      and never echoes secret values
- [ ] Admin-facing diagnostics section (deployed version, health, DB/Stripe/
      email/R2 status, release flags, current UTC time) — **not yet added to
      `public/admin/app.js`**; recommend as a small follow-up, low risk, but
      wasn't in this batch. Flagging so it doesn't get lost.
- [x] Added `/api/health` (and the new `stripe.webhook.*` log events from
      Phase 3) to `docs/launch-incident-runbook.md`'s "Quick diagnostics"
      section — this session

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

## Phases 5–13 — deferred past soft launch

Not started. Each needs its own dedicated review pass because they touch
auth, money, or PII directly. Recommended order after launch, roughly
easiest/lowest-risk first:

1. **Phase 6 — Audit log foundation** (D1 migration, append-only, needed
   before Phase 5 support tools so those tools have something to log to)
2. **Phase 5 — Admin support & account recovery tools** (depends on Phase 6)
3. **Phase 12 — Stripe webhook inbox/replay** (strengthens what already
   exists; webhook idempotency is already solid per the security audit,
   this formalizes storage + replay)
4. **Phase 8 — Entitlements separate from billing** (needed before Phase 9
   makes sense; existing Learn/Odyssey access logic should migrate here)
5. **Phase 7 — Account data export/deletion** (needs Phase 6 audit log first)
6. **Phase 11 — Immutable financial event ledger**
7. **Phase 13 — Background job foundation** (Cloudflare Queues vs D1-backed;
   needs its own spike to decide)
8. **Phase 10 — Permission-based authorization** (touches every route;
   should follow, not precede, Phase 9)
9. **Phase 9 — Canonical identity/household/org architecture doc** (design
   doc first, no schema changes, since a full identity rewrite pre-launch
   was explicitly ruled out in the original spec too)

## Change log

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
