# Request diagnostics and email deadlines

The Worker assigns a fresh UUID to each request it handles. `X-Request-ID` is
returned on successes, errors, redirects, and preflights and exposed to CORS
clients. Incoming client request IDs are not trusted or reused. Static assets
served directly by Cloudflare without invoking the Worker do not receive an
application request ID.

Unhandled route errors return a generic, non-cacheable HTTP 500 JSON response
with `requestId`. Existing handled responses keep their status, body, cookies,
and headers; the wrapper does not buffer their response streams. Contact and
demo forms show the response reference when a submission fails. A successful
saved contact instead shows its lead reference when notification needs follow-up.

For a reported failure, search Workers logs for the exact `requestId`.
`request.failed` includes the HTTP status and a safe error classification.
All `logEvent` calls made within that request inherit its ID, route family,
method, deployment version, and elapsed milliseconds through AsyncLocalStorage.
This includes locally caught contact errors and email failures. Concurrent
requests cannot overwrite each other's context. Scheduled jobs retain their
existing job-specific metadata without a fabricated HTTP request reference.

Route families deliberately omit dynamic IDs, emails, path tokens, and query
strings. The common boundary logs neither raw exception messages/stacks nor
request/response bodies. Handled HTTP errors use `http_client_error` or
`http_server_error`; uncaught exceptions use a small allowlist of classifications.
Existing caller-supplied log metadata still must follow the logging privacy rules.
Elapsed time measures response creation, not the later consumption of a streaming
body; errors occurring after a stream has begun are outside this boundary.

Outbound email defaults to a 10-second deadline covering fetch and response-body
reading. Positive numeric overrides are capped at 30 seconds; zero, negative,
non-numeric, and non-finite overrides use the default. Timers are cleared on
completion. Existing `sent`, `failed`, `error`, and `not_configured` status values
are preserved, with `errorCode` distinguishing `timeout`, `network_error`, and
`provider_rejected`. Failure logs omit recipients, provider response content,
API keys, and idempotency keys.

A timeout means delivery is unconfirmed, not definitely unsent. The shared helper
does not automatically resend. Callers with persisted jobs and provider
idempotency keys control retries; contact recovery follows the existing 23-hour
safe-retry window and manual-review process.

Required CI includes the attribution and contact-admin browser tests, contact
recovery tests, concurrent rate-limit tests, deep-redaction tests, and the new
request-diagnostics and email-timeout tests. Browser tests verify visible failure
references and reuse of the submission key on retry. Email tests simulate stalled
connections and response bodies without sending real messages. All changes ship
through the normal main deployment workflow; no additional migration or secret
is required for this batch.
