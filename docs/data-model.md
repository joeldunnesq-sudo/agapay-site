# AGAPAY Data Model

> **Stack:** Cloudflare Workers · D1 (SQLite) · KV · R2 · Assets  
> **Entry point:** `src/worker.js` → `src/handlers/` → `src/lib/core.js`

---

## Bindings at a glance

| Binding | Type | Purpose |
|---|---|---|
| `AGAPAY_DB` | D1 (SQLite) | Structured relational data — offerings, commemorations, settings |
| `AGAPAY_REGISTRATIONS` | KV | Parish registrations and all donor/session/index state |
| `CAMPAIGN_ASSETS` | R2 | Uploaded campaign images and attachments |
| `ASSETS` | Workers Assets | Static public site (`./public/**`) |

---

## D1 — `AGAPAY_DB`

D1 holds **structured, queryable records** that benefit from SQL joins, aggregation, or ordering. All D1 access goes through four helpers in `src/lib/core.js`:

```js
d1(env, sql, params?)          // single statement, returns result object
d1First(env, sql, params?)     // first row or null
d1All(env, sql, params?)       // all rows as array
d1Run(env, sql, params?)       // INSERT / UPDATE / DELETE (no return rows)
```

Settings (key→value pairs) use two additional helpers:

```js
d1GetSetting(env, key)         // SELECT value FROM settings WHERE key = ?
d1SetSetting(env, key, value)  // INSERT OR REPLACE INTO settings
```

### Tables

**`offerings`** — every giving transaction recorded by AGAPAY.

| Column | Notes |
|---|---|
| `id` | UUID primary key |
| `parish_id` | FK → registration in KV |
| `donor_email` | normalised lowercase |
| `type` | `tithe`, `candle`, `memorial`, `campaign`, … |
| `amount_cents` | integer; never store floats for money |
| `stripe_checkout_session_id` | Stripe `cs_…` |
| `stripe_payment_intent_id` | Stripe `pi_…` |
| `stripe_subscription_id` | Stripe `sub_…` (recurring only) |
| `status` | `checkout_created` → `completed` / `expired` |
| `payment_status` | mirrors Stripe: `unpaid` / `paid` / `succeeded` |
| `fee_cents`, `net_cents` | computed after Stripe webhook |
| `created_at`, `completed_at` | ISO 8601 UTC |

**`commemorations`** — names submitted for prayer / liturgical commemoration.

| Column | Notes |
|---|---|
| `id` | UUID |
| `offering_id` | FK → offerings (optional — direct submissions allowed) |
| `parish_id` | FK → registration in KV |
| `donor_email` | submitter |
| `category` | `living` / `departed` |
| `names` | free text, newline-separated |
| `submitted_at` | ISO 8601 UTC |

**`settings`** — platform-wide or per-parish key/value configuration.

| Column | Notes |
|---|---|
| `key` | e.g. `stripe_event_cursor`, `last_migration_run` |
| `value` | text |

### Decision rule for D1

Use D1 when you need to **query across records** (sum donations by month, list offerings for a donor, find commemorations for a parish). D1 is the source of truth for financial and liturgical records.

---

## KV — `AGAPAY_REGISTRATIONS`

KV holds **document-style records** always fetched by a known key — no joins, no scans. It is the primary store for everything that does not need SQL.

All KV access goes through helpers in `src/lib/core.js` that call `env.AGAPAY_REGISTRATIONS`.

### Key namespaces

All prefix constants live in `src/lib/core.js`.

#### Parish registrations

```
PARISH_ID_INDEX_PREFIX  = "parish_id_index:"

parish_id_index:{parishId}  →  { stripeAccountId, registrationRef, subscriptionTier,
                                  dashboardPasswordHash, givingPageConfig, … }
```

The registration document is the canonical parish record. Stripe account ID, onboarding status, subscription tier, dashboard password hash, giving page configuration, and contact info all live here.

Helpers: `parishIdIndexKey(parishId)`, `saveRegistrationRecord(env, reg)`, `loadRegistrationByReference(env, ref)`.

#### Stripe account → parish reverse index

```
STRIPE_ACCOUNT_INDEX_PREFIX = "stripe_account_index:"

stripe_account_index:{stripeAccountId}  →  { parishId }
```

Used to route incoming Stripe webhooks to the right parish. Helper: `stripeAccountIndexKey(stripeAccountId)`.

#### Stripe subscription → parish reverse index

```
STRIPE_SUBSCRIPTION_INDEX_PREFIX = "stripe_subscription_index:"

stripe_subscription_index:{subscriptionId}  →  { parishId }
```

#### Stripe payment intent → donor offering reverse index

```
STRIPE_PAYMENT_INTENT_INDEX_PREFIX = "stripe_payment_intent_index:"

stripe_payment_intent_index:{paymentIntentId}  →  { donorEmail, checkoutSessionId }
```

#### Donor records

```
DONOR_KEY_PREFIX = "donor:"

donor:{normalizedEmail}  →  {
  email, donorName, householdName,
  defaultParishId,
  passwordHash, passwordSalt, passwordHashVersion,
  sessionTokenHash, sessionSalt, sessionExpiresAt,
  emailVerifiedAt, emailVerificationTokenHash, …,
  createdAt, updatedAt
}
```

Helpers: `loadDonor(env, email)`, `saveDonor(env, donor)`, `deleteDonor(env, email)`.

The raw session token is returned to the client only at login/signup — only its hash is persisted.

#### Donor checkout session index

```
DONOR_CHECKOUT_INDEX_PREFIX = "donor_checkout_index:"

donor_checkout_index:{cs_…}  →  { donorEmail, parishId, offeringId, … }
```

Maps a Stripe checkout session ID back to the donor who initiated it. Used in `handleDonorClaimCheckout`. Helper: `donorCheckoutIndexKey(sessionId)`.

#### Donor offering cache

```
DONOR_OFFERING_KEY_PREFIX = "donor_offering:"

donor_offering:{donorEmail}:{offeringId}  →  { … offering snapshot … }
```

A lightweight per-donor snapshot written at checkout time so the donor dashboard can show recent activity without a D1 scan. Helper: `donorOfferingKey(email, offeringId)`.

#### Commemoration cache

```
COMMEMORATION_KEY_PREFIX = "commemoration:"

commemoration:{parishId}:{commemorationId}  →  { … }
```

Written alongside the D1 `commemorations` row. Enables fast per-parish listing without a SQL query on every dashboard load.

#### Admin session

```
ADMIN_SESSION_STORE_KEY = "admin_session"
ADMIN_PASSWORD_KV_KEY   = "__agapay_admin_password"
```

Platform-admin session token hash and the hashed admin password. Stored under flat keys (no prefix) because only one admin account exists.

#### Stripe event deduplication

```
STRIPE_EVENT_PREFIX = "stripe_event:"

stripe_event:{eventId}  →  "processing" | "done"
```

Written before processing a webhook event; checked on arrival to prevent double-processing. Helpers: `claimStripeEvent(env, eventId)`, `finishStripeEvent(env, eventId)`.

#### Parish dashboard sessions

```
PARISH_SESSION_TTL_MS = 7 days (as milliseconds)
PARISH_SESSION_MAX    = 5   // simultaneous sessions per parish
```

Sessions are stored inside the parish registration document itself, not as separate KV keys.

#### Rate limiting

```
RATE_LIMIT_PREFIX = "rate_limit:"

rate_limit:{action}:{clientIp}  →  { count, windowStart }
```

Written with a TTL equal to the window duration; purely ephemeral.

### Decision rule for KV

Use KV when you need to **fetch or store a single document by its natural key** (donor by email, parish by ID, session by token hash). KV is eventually consistent across regions — never use it for anything requiring counting or listing across many records.

---

## R2 — `CAMPAIGN_ASSETS`

R2 stores **binary objects**: images and file attachments uploaded by parishes for their giving campaigns.

```
binding:    CAMPAIGN_ASSETS
bucket:     agapay-campaign-assets
public CDN: https://pub-a8aecb95751f49ac9b078c3e3ed378b8.r2.dev
            (also env.CAMPAIGN_ASSETS_URL)
```

### Key convention

```
{parishId}/{campaignId}/{filename}
```

Objects are served publicly via the R2 CDN. The worker only writes objects (upload) and constructs public URLs — it never proxies R2 reads through itself.

### What lives here

- Campaign hero images uploaded through the parish dashboard

### What does NOT live here

- Offering receipts — generated on the fly, never stored
- Static site assets — served from `./public/` via Workers Assets
- Donor avatars — not implemented

### Decision rule for R2

Use R2 for any **binary blob > ~1 KB** that needs a stable public URL and is not re-derived on every request. All text-based data (JSON documents, email templates) stays in D1 or KV.

---

## Workers Assets — `ASSETS`

Static files in `./public/` are served by Cloudflare Workers Assets via the `ASSETS` binding.

```toml
[assets]
directory = "./public"
binding   = "ASSETS"
run_worker_first = ["/**.html"]
```

`run_worker_first = ["/**.html"]` routes `.html` URL requests through the worker first so it can issue a 301 redirect to the canonical extensionless URL (e.g. `/features.html` → `/features`), then fall through to `env.ASSETS.fetch()`. All other paths bypass the worker and are served directly from the edge CDN.

### What lives here

- All HTML pages (`/index.html`, `/features.html`, …)
- `public/images/`, `public/icons/`, `public/fonts/`
- `manifest.webmanifest`, `robots.txt`, `sitemap.xml`
- Service worker (`sw.js`)

---

## Cross-store relationships

```
KV: donor:{email}
    └─ defaultParishId ──────────────────────► KV: parish_id_index:{parishId}
                                                     └─ stripeAccountId ──► Stripe

KV: donor_checkout_index:{cs_…}
    └─ offeringId ───────────────────────────► D1: offerings.id

D1: offerings
    └─ parish_id ────────────────────────────► KV: parish_id_index:{parishId}
    └─ stripe_payment_intent_id ─────────────► KV: stripe_payment_intent_index:{pi_…}

D1: commemorations
    └─ offering_id ──────────────────────────► D1: offerings.id
    └─ parish_id ────────────────────────────► KV: parish_id_index:{parishId}

R2: {parishId}/{campaignId}/{file}
    └─ parishId ─────────────────────────────► KV: parish_id_index:{parishId}
```

---

## Cron job

```toml
[triggers]
crons = ["0 14 * * 6"]   # every Saturday at 14:00 UTC
```

The `scheduled` export in `src/worker.js` runs weekly to:

1. Reconcile pending donor offerings against Stripe (catch missed webhooks)
2. Send the weekly commemoration digest email to each active parish

---

## Environment variables

Set in `wrangler.toml` `[vars]`; accessed as `env.*` at runtime. Secrets (Stripe keys, Turnstile secret, email API key, admin password) are set via `wrangler secret put` and never appear in the repo.

| Variable | Value |
|---|---|
| `AGAPAY_FROM_EMAIL` | Sender address for transactional email |
| `AGAPAY_REPLY_TO_EMAIL` | Reply-to for support |
| `AGAPAY_REGISTRATION_NOTIFY_EMAIL` | Internal alert email for new registrations |
| `AGAPAY_APP_URL` | `https://agapay.app` — used to build absolute URLs in emails |
| `TURNSTILE_SITE_KEY` | Cloudflare Turnstile public key (anti-bot) |
| `CAMPAIGN_ASSETS_URL` | R2 public CDN base URL |
