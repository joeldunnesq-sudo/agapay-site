# AGAPAY Parish + Module

Subscription-gated parish administration module, nested inside the existing AGAPAY parish dashboard. The first feature is an **Orthodox Annual Meeting Packet Builder**.

---

## Architecture

### Where it fits
- **No new app shell** — fully inside the existing Cloudflare Worker + parish dashboard
- **Auth** — reuses existing `requireAdminContext` from `handlers/parish.js`
- **Storage** — new D1 tables for structured data; stewardship subscription state stored in the existing KV registration document
- **Stripe** — uses the *platform* Stripe account (not parish connected accounts) for subscription billing

### Files added

```
src/handlers/stewardship.js        — all Stewardship route handlers
public/styles/stewardship.css      — module UI styles
public/styles/stewardship-packet.css — print-optimised packet styles
migrations/0003_stewardship.sql    — D1 tables
migrations/0004_stewardship_seed.sql — demo data (dev only)
```

### Files modified (additions only)

```
src/worker.js          — import stewardship handlers + add routes
                         see src/WORKER_JS_ADDITIONS.js for exact lines
```

---

## Routes

| Method | Path | Handler |
|--------|------|---------|
| GET | `/parish/stewardship` | `handleStewardshipHome` |
| POST | `/parish/stewardship/subscribe` | `handleStewardshipSubscribe` |
| GET | `/parish/stewardship/billing` | `handleStewardshipBilling` |
| POST | `/parish/stewardship/billing-portal` | `handleStewardshipBillingPortal` |
| GET/POST | `/parish/stewardship/annual-meetings/new` | `handleStewardshipMeetingNew` |
| GET/POST | `/parish/stewardship/annual-meetings/:id` | `handleStewardshipMeetingEdit` |
| GET | `/parish/stewardship/annual-meetings/:id/preview` | `handleStewardshipMeetingPreview` |
| GET | `/parish/stewardship/annual-meetings/:id/pdf` | `handleStewardshipMeetingPdf` |
| POST | `/webhooks/stewardship` | `handleStewardshipWebhook` |

---

## Subscription States

| State | Description | Access |
|-------|-------------|--------|
| `no_subscription` | Parish has never subscribed | Paywall |
| `trialing` | 14-day free trial | ✅ Full access |
| `active` | Paid subscription current | ✅ Full access |
| `past_due` | Payment failed | ❌ Paywall |
| `canceled` | Subscription canceled | ❌ Paywall |
| `unpaid` | Invoice unpaid after retries | ❌ Paywall |
| `incomplete` | First payment pending | ❌ Paywall |

Only `active` and `trialing` unlock the module.

### Where subscription state lives

Stored as fields on the parish KV registration document (`parish_id_index:{parishId}`):

```json
{
  "stewardshipStatus": "active",
  "stewardshipStripeCustomerId": "cus_...",
  "stewardshipStripeSubscriptionId": "sub_...",
  "stewardshipStripePriceId": "price_...",
  "stewardshipPeriodEnd": 1234567890,
  "stewardshipCancelAtPeriodEnd": false,
  "stewardshipTrialEnd": null
}
```

---

## Environment Variables

Add to `wrangler.toml` `[vars]` or `wrangler secret put`:

```toml
# wrangler.toml — add to [vars]
# (non-secret, safe to commit)
STEWARDSHIP_STRIPE_PRICE_MONTHLY = "price_..."   # $39/month Price ID
STEWARDSHIP_STRIPE_PRICE_ANNUAL  = "price_..."   # $399/year Price ID
```

```bash
# Secrets — do not commit
wrangler secret put STRIPE_SECRET_KEY              # Platform Stripe secret key (sk_live_... or sk_test_...)
wrangler secret put STEWARDSHIP_STRIPE_WEBHOOK_SECRET  # Webhook signing secret (whsec_...)
```

`STRIPE_SECRET_KEY` is the **platform** key (not a parish connected account key). It must be the same account that owns the Stewardship subscription prices.

---

## Stripe Setup

### 1. Create the product and prices

In the Stripe Dashboard (or CLI):

```bash
# Create the product
stripe products create \
  --name "AGAPAY Parish +" \
  --metadata[product_key]=stewardship

# Monthly price ($39/month)
stripe prices create \
  --product prod_... \
  --unit-amount 3900 \
  --currency usd \
  --recurring[interval]=month \
  --nickname "Stewardship Monthly"

# Annual price ($399/year)
stripe prices create \
  --product prod_... \
  --unit-amount 39900 \
  --currency usd \
  --recurring[interval]=year \
  --nickname "Stewardship Annual"
```

Copy the Price IDs into `wrangler.toml`.

### 2. Configure webhook

In Stripe Dashboard → Developers → Webhooks → Add endpoint:

- **URL:** `https://agapay.app/webhooks/stewardship`
- **Events to listen:**
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_failed`

Copy the webhook signing secret → `wrangler secret put STEWARDSHIP_STRIPE_WEBHOOK_SECRET`.

### 3. Enable Billing Portal

In Stripe Dashboard → Settings → Billing → Customer portal:
- Enable the portal
- Allow customers to cancel subscriptions
- Allow customers to update payment methods

---

## Database Migration

Run after deploying:

```bash
# Apply Stewardship tables
wrangler d1 execute AGAPAY_DB --file=migrations/0003_stewardship.sql

# (Optional) Load demo data for development
wrangler d1 execute AGAPAY_DB --file=migrations/0004_stewardship_seed.sql
```

---

## PDF Generation

PDF download (`/parish/stewardship/annual-meetings/:id/pdf`) returns a print-optimised HTML page with `@page` CSS and proper page-break rules. The browser's built-in print-to-PDF produces a clean, paginated output without any server-side PDF library.

**Why this approach:**
- Zero additional dependencies (no Puppeteer, no wkhtmltopdf, no headless Chrome)
- Works within Cloudflare Workers CPU limits
- CSS `@page` handles page numbers and margins
- Quality is equivalent to a dedicated PDF library for text-heavy documents

**To download as PDF:**
1. Navigate to `/parish/stewardship/annual-meetings/:id/pdf`
2. Browser opens the packet in print-optimised view
3. Use browser Print → Save as PDF

---

## Testing with Stripe Test Mode

Use Stripe test keys (`sk_test_...`) and test Price IDs during development.

Trigger webhook events locally:

```bash
# Listen and forward to local worker
stripe listen --forward-to http://localhost:8787/webhooks/stewardship

# Test subscription creation
stripe trigger customer.subscription.created
```

Test subscription states:
- Use card `4242 4242 4242 4242` → active subscription
- Use card `4000 0000 0000 0341` → payment fails → `past_due`

---

## Security

- All Stewardship routes require an active parish dashboard session (`requireAdminContext`)
- Subscription check is enforced server-side on every request — UI gating is a second layer only
- Every D1 query includes `parish_id = ?` to enforce tenant isolation
- Stripe webhook signature is verified with HMAC-SHA256 before any state updates
- Parish IDs from webhook metadata are verified against the KV registration document before writing
