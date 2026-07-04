# Settlement Profiles — Implementation Note

## Naming: "Revenue Streams" vs. "Settlement Profiles"

Parishes see **"Revenue Streams"** everywhere in the UI — the Settings tab
section title, the explanatory copy, button labels, and every error/status
message a parish admin can see. The backend keeps the original name
throughout: the table names (`settlement_profiles`,
`settlement_profile_modules`), the service module
(`src/lib/settlement-profiles.js`), every function and variable name
(`resolveSettlementProfileId`, `ensureDefaultGivingProfile`, etc.), the API
route (`/api/parish/dashboard/:id/settlement-profiles`), and this document's
own name and terminology are unchanged. If you're reading code, it's a
Settlement Profile; if you're looking at the dashboard, it's a Revenue
Stream. Same thing, two names, by design — so a future engineer grepping
the codebase for "settlement" finds everything in one place, while parishes
never see that word.

## Subcategories (`profile_type`)

The category dropdown on "Add a revenue stream" offers exactly these nine,
matching what a parish would recognize on their own books:

| Internal `profile_type` value | Parish-facing label |
|---|---|
| `general_giving` | General Giving |
| `liturgical` | Liturgical |
| `bookstore` | Bookstore |
| `festival` | Festival |
| `school` | School |
| `cemetery` | Cemetery |
| `camp` | Camp |
| `hall_rental` | Hall Rental |
| `fundraisers` | Fundraisers |

Only two of these have live, automated payment flows wired to them today —
`general_giving` (every donation) and `bookstore` (Bookstore Payments). The
other seven exist so a treasurer can create a revenue stream for something
AGAPAY doesn't automate yet (a school tuition ledger, a cemetery plot fund,
a hall rental deposit) purely for their own manual bookkeeping category —
creating one of those doesn't wire up any new payment automation by itself.
The auto-created defaults use `general_giving` (name: "Primary Giving") and
`bookstore` (name: "Bookstore Payments").

## What this is

Settlement Profiles let a parish separate its revenue streams — giving vs.
Parish+ Bookstore Payments, and future Parish+ modules — for reporting and
accounting purposes, even though every profile settles through the same
connected Stripe account and the same parish bank account today. Every
parish gets a "Primary Giving" profile automatically; parishes with Parish+
active also get a "Bookstore Payments" profile. Both work identically to how
payments processed before this feature — nothing about Stripe Connect, the
checkout flow, or payouts changes for any existing parish.

## Files

| File | What it does |
|---|---|
| `migrations/0010_settlement_profiles.sql` | New tables + nullable columns + non-destructive backfill |
| `src/lib/settlement-profiles.js` | The service: resolution, defaults, admin CRUD |
| `src/handlers/parish.js` | `handleParishSettlementProfiles` admin API; `storeDonorOffering` now resolves a profile |
| `src/handlers/donor.js` | Bookstore checkout now resolves a profile before writing the order |
| `src/worker.js` | Route: `/api/parish/dashboard/:id/settlement-profiles` |
| `public/parish/dashboard.html` / `app.js` / `redesign.css` | Settings tab admin UI |
| `scripts/settlement-profiles-tests.mjs` | 15 tests against the real module, via a D1-shaped SQLite shim |

## Data model

`settlement_profiles` — one row per profile. `stripe_account_id` and
`stripe_external_account_id` are nullable on purpose: `NULL` means "use the
parish's normal connected Stripe account and normal payout destination,"
which is what every profile does today. A future larger parish can point one
profile at a different Stripe account without any schema change.

A partial unique index enforces **at most one** `is_default_giving = 1` row
and **at most one** `is_default_commerce = 1` row per parish — there is
always exactly one canonical default of each kind (or zero, before a parish
has ever needed one).

`settlement_profile_modules` — explicit `(parish_id, module_key) -> profile`
overrides. `module_key` is free text (`'giving'`, `'bookstore'` today), not
an enum, so a future module doesn't need a migration to be assignable. If no
row exists for a module, the parish's default of the matching kind is used.

`donor_offerings.settlement_profile_id` and
`commerce_orders.settlement_profile_id` — nullable columns added via
`ALTER TABLE ... ADD COLUMN`, so every existing row and every existing code
path that doesn't know about profiles keeps working unchanged.

## Resolution & the "never route to an inactive profile" safeguard

`resolveSettlementProfileId(env, parishId, moduleKey)` is called once, right
before a new payment record is written:

1. Is there an **explicit, active** module assignment? Use it.
2. Otherwise, use the parish's **active** default of the matching kind
   (giving default for `'giving'`, commerce default for anything else).
3. Otherwise (a parish that's never had one), create the default now
   (`ensureDefaultGivingProfile` / `ensureDefaultCommerceProfile`) and use
   that. This is what "ensure a default profile exists" means in practice —
   it self-heals lazily rather than depending on a signup hook having fired.
4. If step 3 somehow can't produce a commerce profile, fall back to the
   giving profile and log a warning (`console.warn`) — the spec's explicit
   fallback-of-last-resort.

An inactive profile is treated as if it doesn't exist in steps 1 and 2. This
is safe — not just a hopeful check — because `setProfileActive()` **refuses
to deactivate a parish's last active default of a kind**: you can't
deactivate the only active giving profile, and you can't deactivate the only
active commerce profile. That invariant means a parish can never end up
with zero active defaults once it's ever had one, so the self-heal path in
step 3 only ever fires for a genuinely new parish (where inserting a fresh
default can't collide with anything).

## What's wired up today

- **Donations** (`storeDonorOffering`, used by every giving flow —
  stewardship, campaigns, candles, commemorations) resolve and store a
  giving profile automatically. No caller had to change.
- **Bookstore Payments** (the one Parish+ commerce module that's actually
  live) resolves and stores a commerce profile at checkout.
- **Admin UI** — Settings tab, "Settlement Profiles" card: view profiles,
  see which module uses each, create/rename, activate/deactivate, set
  default giving, set default commerce, assign Bookstore Payments to a
  profile. Exactly the copy you specified about most parishes using one
  Stripe account.
- **Bookstore Sales report** (`/bookstore/sales`, the one real transaction
  report that exists in this codebase) now includes `settlementProfileId`,
  `settlementProfileName`, and the Stripe/AGAPAY fee breakdown per order,
  visible in the parish dashboard's order ledger.
- **Permissions** — gated behind the same parish-dashboard bearer-token auth
  every other Settings endpoint uses. See "Permissions" below for why that's
  the correct scope for this codebase rather than a new role system.
- **Tests** — `scripts/settlement-profiles-tests.mjs`, 15 tests, run
  directly against the real service module (not a reimplementation) using
  an in-memory SQLite database shaped like D1. Run with:
  `node scripts/settlement-profiles-tests.mjs`

## What's future-only (explicitly out of scope, by design)

- **Separate Stripe accounts / separate bank accounts per profile.** The
  columns exist and are nullable; nothing reads them yet to actually route a
  Stripe charge to a different connected account. Every profile today
  settles through `registration.stripeAccountId`, unchanged. Wiring a
  profile's own `stripe_account_id` into the checkout session's
  `on_behalf_of` / connected-account header is the next step when a parish
  actually needs it — the admin UI intentionally does not promise this yet,
  per your instruction.
- **Automatic bank-account splitting.** Same story — `stripe_external_account_id`
  and `payout_destination_label` are schema-only placeholders.

## What I deliberately did NOT build, and why

Two items from the request don't correspond to anything that exists in this
codebase yet:

- **"Monday treasurer summary emails."** There is no weekly email job
  anywhere in this codebase today — `commerce_weekly_reports` is a table
  that's been in the schema since the original Parish Commerce migration
  but nothing has ever written to it or emailed from it. Building a new
  scheduled email feature was out of scope for a settlement-profiles
  ticket, so I didn't invent one. If you want this, it's a real, separate
  piece of work (a Cron Trigger + email template) — happy to scope it next.
- **CSV export.** Same situation — no CSV export exists anywhere in the app
  (bookstore or otherwise) to extend.

Rather than silently skip the spirit of "reports show settlement profile," I
wired settlement profile data into the one reporting surface that's actually
real and shipped: the Bookstore Sales dashboard panel.

## Permissions — a scope note

The request asks for "only parish admins/treasurers with payment-settings
permission." This codebase doesn't have per-user roles within a single
parish's dashboard login — the whole Parish Dashboard (Giving, Bookstore,
Settings, everything) is one shared parish credential (parish ID +
password), the same way every other Settings endpoint works. There's a
separate `parish_commerce_permissions` table, but that's for Bookstore
*staff* roles (volunteers, inventory managers using a physical
scan-and-go device) — a different concept from parish-level financial
settings. I gated Settlement Profiles at the same boundary as the rest of
Settings rather than inventing a new RBAC system as a side effect of this
ticket. The one thing the spec explicitly calls out — "regular My AGAPAY
users should never see this" — is true by construction: the donor-facing
app has no parish-dashboard bearer token at all.

## A migration operations note

This migration is written to be safe to run more than once for the
`INSERT OR IGNORE` / backfill statements — but the two `ALTER TABLE ...
ADD COLUMN` lines are **not** re-runnable; SQLite errors if the column
already exists. Apply this migration exactly once. If you're applying
migrations by hand through the D1 console (rather than
`wrangler d1 migrations apply`, which tracks what's already run), keep
that in mind before pasting it a second time.
