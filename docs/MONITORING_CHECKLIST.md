# AGAPAY — Launch-Week Monitoring & Alert Configuration Checklist

This is a **manual configuration checklist**, not automation. None of the
items below can be configured from this repository — they require someone
with Cloudflare, Stripe, and Resend dashboard access (Joel) to click through
each one. Claude cannot configure Cloudflare dashboard alerts, Stripe
dashboard alerts, or email-provider alerts from code; those services don't
expose that as a file in this repo.

What Claude *did* build to support this: `src/lib/logging.js`, a structured
JSON logger wired into the Stripe webhook lifecycle
(`src/handlers/stripe.js`) and donor login failures
(`src/handlers/donor.js`) as reference examples. Every log line is JSON with
an `eventType`, `severity`, and `timestamp` field, which is what makes the
Cloudflare filters below possible.

## 1. Cloudflare Worker error alerts

1. Cloudflare dashboard → Workers & Pages → `agapay-site` → **Logs** tab.
   Confirm you can see live `console.log`/`console.error` output (structured
   JSON lines from `logEvent()`).
2. Workers & Pages → `agapay-site` → **Settings → Observability** → enable
   **Logpush** if you want log retention beyond the live tail (Logpush needs
   an R2 or external destination).
3. Cloudflare dashboard → **Notifications** → Create → choose
   **Workers — Errors** (or **Workers Metrics** depending on current
   Cloudflare naming) for the `agapay-site` Worker. Set a threshold (e.g.
   >10 5xx responses in 5 minutes) and an email/webhook destination.
4. If Logpush is enabled, you can also set up a downstream alert (e.g. a
   scheduled query against the Logpush destination) that greps for
   `"severity":"error"` — this is what the structured `severity` field is
   for.

## 2. Stripe webhook failure alerts

1. Stripe Dashboard → **Developers → Webhooks** → select the AGAPAY
   endpoint (both the platform endpoint and the Connect endpoint).
2. Stripe surfaces failed-delivery counts directly on that page. Stripe
   also has **Workbench → Event destinations** email notifications for
   repeated delivery failures — enable those for both endpoints.
3. On the AGAPAY side, every webhook attempt is already recorded via
   `claimStripeEvent`/`finishStripeEvent` (existing idempotency store) with
   a `"processed"` or `"failed"` status, and now also emits a
   `stripe.webhook.processing_failed` log line (see `src/handlers/stripe.js`)
   with `retryable: true`. A Cloudflare Logpush filter on
   `eventType = "stripe.webhook.processing_failed"` is the AGAPAY-side
   complement to Stripe's own dashboard alerting.

## 3. Email delivery failure alerts (Resend)

1. Resend dashboard → **Webhooks** → add a webhook for `email.bounced` and
   `email.delivery_delayed` events if you want push alerts rather than
   checking the dashboard manually.
2. Resend dashboard → **Logs** — check periodically during launch week,
   especially for parish invitation, verification, and Odyssey activation
   emails, since those block onboarding if they silently fail.
3. `handleHealth()` (`GET /api/health`, see `src/lib/core.js`) reports
   `emailConfigured` — this is presence-of-API-key only, not a live send
   test. It will not catch a Resend outage; only Resend's own dashboard or
   webhooks will.

## 4. Scheduled task (cron) failure alerts

1. `wrangler.toml` currently defines one cron trigger
   (`0 14 * * 6` — Saturday commemoration email job). Cloudflare dashboard →
   Workers & Pages → `agapay-site` → **Triggers** tab shows recent cron
   invocation history and success/failure status.
2. Cloudflare dashboard → **Notifications** → there is a **Workers Cron
   failure** style alert in some account tiers — check availability under
   your plan and enable it if present.
3. Until Phase 13 (background job foundation) exists, cron failures are
   only visible via the Triggers tab and the Worker's own logs — there is
   no retry or dead-letter handling yet. Treat this as a known gap, not
   something already covered.

## 5. Launch-week monitoring routine (manual, until the above is fully wired)

- Check `GET /api/health` a few times a day during launch week
  (`curl https://agapay.app/api/health`) — should return `"ok": true` and
  `200`. A `503` means D1 or KV is unreachable.
- Check Cloudflare Workers **Logs** tab live tail during/after any parish
  onboarding or real donation, watching for `"severity":"error"` lines.
- Check the Stripe Dashboard webhook page for both endpoints for delivery
  failures.
- Check Resend logs for bounces on verification/invitation/activation
  emails.

## What this checklist does NOT claim

- It does not claim Cloudflare dashboard alert rules have been created —
  they have not; step 1.3 and 4.2 above are for Joel to click through.
- It does not claim a durable, queryable log store exists — logs currently
  live only in Cloudflare's live tail / optional Logpush destination.
- It does not cover Phases 5–13 (audit log, webhook inbox, background
  jobs) — those will each get their own logging surface when built.
