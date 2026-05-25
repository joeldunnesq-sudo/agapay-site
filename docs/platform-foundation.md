# AgaPay Platform Foundation

This snapshot keeps the existing static frontend and adds the first backend layer needed for a real multi-parish giving platform.

## What is included

- `data/parishes.json`: canonical parish, mission, and monastery records used by the API.
- `api/parishes.js`: public parish listing endpoint.
- `api/registrations.js`: parish registration intake endpoint with server-side validation.
- `api/create-checkout-session.js`: Stripe Checkout endpoint. It runs in demo mode until `STRIPE_SECRET_KEY` is configured.
- `server.mjs`: local static + API dev server.
- `vercel.json`: clean URL rewrites for static pages and API routes.

## Environment variables

- `STRIPE_SECRET_KEY`: required for real Stripe Checkout sessions.
- `AGAPAY_APP_URL`: public app URL used for Stripe success and cancel URLs.
- `AGAPAY_ALLOWED_ORIGIN`: optional CORS origin.

## Next backend steps

1. Replace file-backed registrations with Postgres or Supabase tables.
2. Add admin authentication and a parish verification dashboard.
3. Store Stripe connected account IDs per parish.
4. Add Stripe webhooks for successful payments, recurring subscriptions, receipts, and failed payment notifications.
5. Add donor accounts and annual giving statements.
