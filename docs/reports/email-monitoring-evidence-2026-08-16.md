# Production Email and Monitoring Evidence — 2026-08-16

## Scope

Owner-run production validation covered the real AGAPAY templates for donor verification, parish invitation/getting started, donor receipt, and administrative registration notification. It also covered a deliberate hard bounce through Resend's designated test address and the resulting AGAPAY operations alert.

The diagnostic path does not create a donor, parish, registration, payment, gift, or Stripe charge. Test messages are visibly labeled, and their links/values are diagnostic fixtures.

## Results

| Check | Result | Evidence retained outside repository |
|---|---|---|
| Donor verification | PASS | Resend `delivered`; present in Gmail inbox; AGAPAY header, test warning, verification CTA, body, and footer rendered correctly |
| Parish invitation / getting started | PASS | Resend `delivered`; present in Gmail inbox; AGAPAY header, next-step panel, dashboard CTA, reminder block, footer, and onboarding-guide attachment rendered correctly |
| Donor receipt | PASS | Resend `delivered`; present in Gmail inbox; test warning, receipt summary, diagnostic values, dashboard CTA, and footer rendered correctly |
| Administrative registration notice | PASS | Resend `delivered`; present in Gmail inbox; registration summary, diagnostic/no-record markers, admin CTA, and footer rendered correctly |
| Controlled hard bounce | PASS | Resend classified the message as `bounced` with a permanent/general hard bounce |
| Signed bounce webhook | PASS | Resend webhook event succeeded on the first attempt with HTTP `200 OK` and response `{"ok":true}` |
| Operations alert | PASS | Branded `[AGAPAY Ops] Resend delivery alert: Email bounced` message was delivered to and rendered in the configured operations inbox |
| Sender authentication | PASS | Gmail reported DKIM, SPF, and DMARC passing for the tested `agapay.app` messages |

## Production configuration confirmed

- Endpoint: `POST https://agapay.app/api/resend/webhook`
- Webhook status: enabled
- Events: `email.bounced`, `email.delivery_delayed`, `email.failed`, `email.complained`
- Signing secret: stored as encrypted Cloudflare Worker secret `RESEND_WEBHOOK_SECRET`
- Invalid unsigned requests: rejected with HTTP `400`
- Duplicate delivery window: seven days
- Operations-alert loop prevention: enabled

## Accounting follow-up

The canary protective state was `normal` when checked on 2026-08-16. The findings from `integrityscan_b94f2942-f3bb-4065-865a-3ae98c4104d8` had both been marked resolved at `2026-08-16 20:41:03` UTC. A formal post-fix clean scan was not yet present; the next scheduled `0 8 * * *` run is expected to record that evidence.

## Evidence boundary

Provider message identifiers, recipient addresses, email bodies, webhook signing material, and screenshots are intentionally not committed to the public repository. This report records the outcome and reproducible checks without publishing sensitive evidence.
