# Contact recovery and shared security hardening

## Contact receipt and notification are separate outcomes

`POST /api/contact` now uses `src/handlers/contact.js` and `src/lib/contact-leads.js`.
It saves a lead before attempting email. A saved message returns a reference and
an explicit `notificationStatus`; a provider failure displays “saved for follow
up,” not “message sent.” A storage failure returns 503 and keeps the form content.

New contact/demo clients retain a random submission ID until receipt is confirmed.
A unique, hashed submission key prevents repeated requests from creating multiple
leads. Reusing a key with different form content returns 409. Old clients without a
key deduplicate identical form content within the same UTC day. No device identity
or fingerprint is created. Reloading an unconfirmed form can create a new client
key, so submission idempotency applies to retries from that form instance.

D1 `contact_leads` stores the original attribution plus notification status,
attempt count, provider message ID, safe error classification, and a frozen email
payload. The frozen payload and stable provider idempotency key are reused on
retry. A conditional SQL UPDATE acquires a 60-second sending lease. Concurrent
requests cannot both send. Email calls have a 10-second timeout in this path.

`sent` means the provider accepted the email, not that the recipient opened it or
that final inbox delivery is guaranteed. Existing Resend delivery alerts remain
responsible for bounce/delivery-failure notification.

## Admin recovery

In Admin → Overview → Insights & system detail → Contact submissions, choose
**Load contacts**. Expand a contact to inspect the message, first/last-touch
categories, attempts, provider ID and notification status. **Retry notification**
retries an eligible unsent message without creating another lead.

The provider deduplicates keys for 24 hours. Automatic use of the same key is
therefore restricted to a conservative 23-hour window from the first attempt.
There is no scheduled resend job: retries are explicit admin actions. After that
window, or for imported contacts with unknown historical delivery, inspect the
provider history. **Confirmed delivered** records the operator's confirmation;
**Confirmed not delivered — enable retry** starts a new delivery generation.
Neither resolution sends an email by itself. Resolutions are version checked and
audited. An active sending lease cannot be overridden by these controls.

The list/retry/resolve APIs are under `/api/admin/contact-leads`, require the
existing Admin session, and inherit Worker MFA/step-up enforcement. Lists are
paginated with a timestamp-and-ID cursor, so equal timestamps do not skip leads.
The browser renders user content as text. List responses omit the stored email
payload and hashed idempotency key.

## Rate limits

`AGAPAY_RATE_LIMITER` points to the SQLite-backed `RateLimiter` Durable Object.
Each hashed bucket/window gets an independent object, avoiding a single global
bottleneck. The counter increment is one atomic SQL statement. Its alarm deletes
storage after the window. Raw IP addresses and email identifiers are not stored.

Existing `rateLimit` and `rateLimitByKey` callers keep their limits and windows.
Contact submission adds a limit of eight attempts per IP per five-minute window;
admin retries/resolutions allow twenty per five minutes. Missing/unavailable
limiter bindings fail closed with 503 and Retry-After rather than disabling
protection. Test fixtures use an explicit test-only in-memory binding; there is
no production fallback to the old KV read-modify-write counter.

## Logging

The shared sanitizer redacts sensitive keys, replaces over-depth content, detects
cycles, skips accessor properties, and limits strings, breadth and total traversal.
Emitted JSON lines are capped at 16,000 UTF-8 bytes. Unserializable values and
logging sink errors cannot escape `logEvent`. Callers must still avoid passing
private content or secrets embedded in ordinary free-text strings to logging.

## Migration and release

`migrations/0124_contact_notification_recovery.sql` creates the indexed contact
table and imports existing `app_settings` contact records as `legacy_unknown`.
It does not resend them and retains the old rows. New contact recovery requires
D1; KV-only contact deployments return a clear storage-unavailable response.

The Wrangler `rate-limiter-v1` migration creates the Durable Object namespace.
Production and staging each declare the binding. Use the normal production CI
workflow: it applies D1 migrations before deploying the Worker and assets;
Wrangler applies the Durable Object migration at deployment. All service bindings
must ship with the Worker because the new limiter deliberately fails closed.

Regression suites: `contact-recovery-tests.mjs`, `contact-admin-browser-tests.mjs`,
`logging-safety-tests.mjs`, `rate-limiter-tests.mjs`, and the attribution suites.
These are included in the required test manifest. The rate limiter test runs real
Durable Object storage in local workerd; no real emails or production writes occur.
