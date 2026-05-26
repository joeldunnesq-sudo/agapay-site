# AgaPay Platform Foundation

This snapshot keeps the existing static frontend and uses a Cloudflare Worker as the backend for parish registration, public giving, admin review, Stripe Connect onboarding, and subscription status.

## What is included

- `src/worker.js`: the active Cloudflare Worker backend and router.
- `public/`: static HTML, CSS, and browser-side JavaScript.
- `wrangler.toml`: Cloudflare Worker, static asset, and plain variable configuration.
- `AGAPAY_REGISTRATIONS`: Cloudflare KV namespace used as the parish source of truth.

## Environment variables

- `STRIPE_SECRET_KEY`: Cloudflare Secret required for real Stripe Checkout and Connect calls.
- `RESEND_API_KEY`: Cloudflare Secret required for outbound email.
- `AGAPAY_ADMIN_TOKEN`: Cloudflare Secret required for admin access.
- `STRIPE_WEBHOOK_SECRET`: Cloudflare Secret used to verify Stripe webhook events.
- `AGAPAY_APP_URL`: public app URL used for Stripe success/cancel URLs and dashboard links.
- `AGAPAY_FROM_EMAIL`: sender display address for Resend.
- `AGAPAY_REPLY_TO_EMAIL`: reply-to email address.
- `AGAPAY_REGISTRATION_NOTIFY_EMAIL`: owner notification address for new parish registrations.

## Next backend steps

1. Build a donor portal using Stripe Customer IDs.
2. Add receipts and annual giving statements.
3. Add fuller admin reporting for parish onboarding, subscriptions, and giving status.
4. Consider D1 when registration/dashboard data outgrows KV querying.
