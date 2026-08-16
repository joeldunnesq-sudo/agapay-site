# AGAPAY — Launch-Week Monitoring & Alert Checklist

Last verified: 2026-08-16 (America/Chicago)

## Current production status

- Cloudflare Worker logs are enabled, invocation logs are included, dashboard persistence is enabled, and log sampling is 100%.
- Cloudflare currently offers no native `Workers Errors` or cron-failure notification type in this account. The complete account notification catalog was reviewed on 2026-08-16. Log Explorer scheduled-query alerts require purchasing Log Explorer, so no paid feature was enabled during this review.
- Scheduled-job failures are covered in the application: `sendScheduledJobFailureAlert()` sends a deduplicated operations email to `AGAPAY_OPS_ALERT_EMAIL`, and `scripts/scheduled-job-observability-tests.mjs` verifies that behavior.
- Resend delivery monitoring is enabled through the signed production endpoint `POST https://agapay.app/api/resend/webhook` for `email.bounced`, `email.delivery_delayed`, `email.failed`, and `email.complained`.
- Resend webhook requests are verified with `RESEND_WEBHOOK_SECRET`, duplicate Svix deliveries are suppressed for seven days, and alert-loop protection prevents an operations-alert bounce from recursively sending more alerts.
- The production Worker has two cron triggers: the accounting/operations job at `0 8 * * *` and the Friday commemoration job at `0 14 * * 6`.
- Stripe event-destination delivery monitoring was verified separately during the webhook repair work.

## 1. Cloudflare Worker and cron monitoring

1. Worker settings → **Observability**:
   - Logs: enabled
   - Invocation logs: enabled
   - Persist logs to the Workers dashboard: enabled
   - Log sampling: 100%
2. Worker settings → **Trigger events**:
   - `0 8 * * *` — next accounting/operations run is shown in the Cloudflare dashboard.
   - `0 14 * * 6` — Friday commemoration run.
3. Account **Notifications** contains no native Worker-error or cron-failure rule type for this account. Do not mark a native Cloudflare alert as enabled unless Cloudflare adds that capability later.
4. Application-level cron failure coverage is the active alert path. Confirm these production variables remain present:
   - `AGAPAY_OPS_ALERT_EMAIL`
   - `AGAPAY_SCHEDULED_ALERT_DEDUPE_SECONDS`
5. Continue reviewing structured Worker logs for `severity: "error"`. If paid Log Explorer is adopted later, add a scheduled query over those structured events.

## 2. Resend delivery monitoring

1. Resend **Webhooks** must show the AGAPAY endpoint as enabled and listening for:
   - `email.bounced`
   - `email.delivery_delayed`
   - `email.failed`
   - `email.complained`
2. Cloudflare **Variables and secrets** must contain encrypted `RESEND_WEBHOOK_SECRET`.
3. An unsigned request to `/api/resend/webhook` must return `400` with `Missing webhook signature`; `503 Resend webhook is not configured` means the signing secret is absent from the active Worker version.
4. The webhook sends a branded operations alert to `AGAPAY_OPS_ALERT_EMAIL`. It returns a retryable failure if the alert cannot be dispatched.
5. During launch week, review Resend **Emails** and **Logs** for verification, invitation, receipt, and administrative mail. The admin-only **Launch email diagnostics** control sends those four real templates and can add one deliberate Resend test bounce without creating a donor, donation, payment, or parish registration.

## 3. Stripe webhook monitoring

1. In Stripe Workbench, review both AGAPAY event destinations and their recent deliveries.
2. Failed Stripe processing emits `stripe.webhook.processing_failed` and is recorded by the idempotency lifecycle (`claimStripeEvent` / `finishStripeEvent`).
3. During launch week, check both Stripe delivery failures and Cloudflare structured logs after onboarding or donation activity.

## 4. Accounting integrity monitoring

1. The `agapay-phase-g-canary` protective state is `normal`.
2. The two findings from scan `integrityscan_b94f2942-f3bb-4065-865a-3ae98c4104d8` were resolved at `2026-08-16 20:41:03` UTC:
   - `ap.bill_lines_mismatch`
   - `reconciliation.snapshot_missing`
3. The next scheduled `0 8 * * *` run is responsible for recording the formal post-fix clean scan. Until that scan completes, distinguish “findings resolved” from “clean scan recorded.”
4. If an authenticated administrator needs earlier evidence, use the narrowly scoped admin integrity-scan control rather than mutating the accounting database directly.

## 5. Launch-week routine

- Check `GET https://agapay.app/api/health`; it should return `200` with `"ok": true`.
- Review Cloudflare Worker logs after onboarding, donations, cron runs, and email diagnostics.
- Review Stripe event-destination deliveries for both platform and Connect endpoints.
- Review Resend delivery status and webhook events, especially for verification and invitation mail.
- Confirm the next accounting scan records all nine checks passing; investigate immediately if either resolved health code returns.

## Evidence boundary

- Dashboard configuration was directly inspected on 2026-08-16.
- Native Cloudflare Worker/Cron alerts are not claimed as enabled because Cloudflare does not offer those notification types in this account.
- Email addresses, message bodies, signing secrets, and sensitive provider evidence remain outside the public repository.
