# AGAPAY — Security Response Headers

Added as a pre-launch hardening pass. Two mechanisms, covering two
different response paths — both are needed, neither alone is complete.

## The two mechanisms

1. **`public/_headers`** — a Cloudflare-native file. The static-asset
   layer (the `[assets]` binding in `wrangler.toml`) applies these headers
   to every response it serves directly from `public/` — HTML pages, JS,
   CSS. This covers requests that never reach `src/worker.js` at all (per
   `wrangler.toml`'s `run_worker_first` list, plain pages like `/`,
   `/vision`, `/marketplace`, `/register`, `/admin`, `/parish` are served
   straight from the assets layer, bypassing the Worker).
2. **`SECURITY_HEADERS` in `src/lib/core.js`** — applied inside `json()`
   and `corsJson()`, the two helpers essentially every `/api/*` response
   goes through (561 call sites at last count). This covers Worker-
   generated API responses, which never touch the static-asset layer and
   so would get none of the `_headers` file's protection otherwise.

**Keep both in sync.** If you change one policy, change the other to
match — they're written to be identical.

**Known gap**: a small number of hand-rolled `new Response(...)` calls in
`src/handlers/listen.js` and `src/handlers/stewardship.js` (~36 call sites
repo-wide, mostly Listen feed proxying and a couple of stewardship
checkout edge cases) don't go through `json()`/`corsJson()` and so don't
get these headers. Low priority — none of them render attacker-
controllable HTML — but worth folding in in a future pass rather than
touching all 36 individually right now.

## What's enforcing vs. report-only

**Enforcing immediately** (safe defaults, essentially zero risk of
breaking anything):
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Frame-Options: SAMEORIGIN` — blocks other sites from framing normal
  AGAPAY pages (clickjacking defense). The narrowly scoped giving-box routes
  are the intentional exception described below.
- `Strict-Transport-Security: max-age=2592000; includeSubDomains` (30 days)
  — rollout stage 1. This intentionally omits `preload` and uses a
  moderate lifetime while the effect across the verified DNS inventory
  is monitored. Do not increase the lifetime until this stage has run
  cleanly for its full 30-day `max-age`.
- `Permissions-Policy: geolocation=(), microphone=(), camera=(self),
  payment=(self)` — camera is deliberately allowed same-origin only
  (`self`), not blocked entirely, because the bookstore barcode scanner
  (`public/donor/app.js`, `zxing` library) needs it.

**Report-Only, not enforcing**: `Content-Security-Policy-Report-Only`.
This was a deliberate choice, not an oversight — **do not flip this to a
plain enforcing `Content-Security-Policy` header without watching for
violations first.**

## Public giving-box exceptions

`/give/embed.html` and its clean public route `/give/embed/*` are the only AGAPAY
pages intended for third-party framing. Their `_headers` rules remove
`X-Frame-Options`, enforce `Content-Security-Policy: frame-ancestors *`, prevent
indexing, and disable storage with `Cache-Control: no-store`. Both rules are
required because Cloudflare matches headers against the original public URL
before the Worker rewrite resolves the clean route to the physical asset. All
other pages retain `SAMEORIGIN`.

`/giving-box.js` is the small public loader organizations paste into their
websites. Its exact rule permits cross-origin loading and uses a one-hour
browser cache so security and compatibility fixes can roll out without asking
organizations to replace their snippet. The loader validates both the message
origin and sending iframe before applying automatic height updates.

## Why CSP is Report-Only

This codebase has extensive inline `<script>` blocks and `style=""`
attributes throughout — it's a hand-written, zero-build-step site by
design, not something with a bundler that could inject nonces. An
enforcing CSP without `'unsafe-inline'` would break real pages
immediately. The policy above already includes `'unsafe-inline'` for
both `script-src` and `style-src` to reflect that reality, rather than
pretending otherwise.

Report-Only mode means: the browser evaluates the policy and logs any
violation to the DevTools console, but **never blocks anything**. Zero
behavior risk. What it still catches, even in this permissive form: any
script or connection attempt from a domain *not* in the allowlist below —
which is exactly the scenario CSP exists to catch (an XSS payload loading
a remote script, a compromised or accidentally-added third-party tag,
etc.).

### Current allowlist and why each entry is there

Built by actually grepping the codebase for external resource loads, not
guessed:

| Directive | Allowed origins | Why |
|---|---|---|
| `script-src` | `challenges.cloudflare.com` | Turnstile widget, loaded dynamically by `public/security.js` |
| | `cdn.jsdelivr.net` | QR code generator library |
| | `unpkg.com` | zxing barcode-scanning library, htmx |
| | `connect.facebook.net` | Meta Pixel client library on the AGAPAY referral and demo-request pages |
| `style-src` | `fonts.googleapis.com` | Google Fonts stylesheets |
| `font-src` | `fonts.gstatic.com` | Google Fonts font files |
| `frame-src` | `challenges.cloudflare.com` | Turnstile renders its widget in an iframe |
| `connect-src` | `challenges.cloudflare.com` | Turnstile's own client-side calls |
| | `www.facebook.com` | Meta Pixel page-view and referral/conversion event delivery |

**Confirmed NOT needed**: `js.stripe.com` / Stripe Elements — AGAPAY uses
server-created Stripe Checkout Sessions with a full-page redirect, not
client-side Stripe.js or embedded Elements, so nothing loads from Stripe
domains in the browser. `api.stripe.com`, `api.resend.com`,
`openlibrary.org`, and the Turnstile `siteverify` call are all
**server-side** fetches from `src/handlers/*`/`src/lib/*` — the Worker
calling out, not the browser — so they're irrelevant to a browser CSP.

## Path to enforcing CSP

1. Deploy this Report-Only policy.
2. Watch Cloudflare Worker logs / ask a few real users to check their
   browser DevTools console for `Content-Security-Policy-Report-Only`
   violation messages over the first 1–2 weeks of soft launch.
3. Fix or allowlist anything that shows up unexpectedly.
4. Once quiet, flip `Content-Security-Policy-Report-Only` to
   `Content-Security-Policy` in both `public/_headers` and
   `SECURITY_HEADERS` (`src/lib/core.js`) — same value, just the
   enforcing header name.
5. Longer-term, consider removing `'unsafe-inline'` from `script-src` via
   nonces or hashes — a bigger project, not part of this pass.

## HSTS rollout toward preload readiness

Inventory checked on 2026-07-31 (America/Chicago):

| DNS name | Record/use | HTTPS status |
|---|---|---|
| `agapay.app` | Proxied Worker plus apex mail/TXT records | HTTPS returns 200 with a valid certificate; HTTP redirects to the same host over HTTPS |
| `send.agapay.app` | SES MX and SPF TXT only | No A, AAAA, CNAME, or HTTP service; HSTS does not affect its mail transport |
| `cf2024-1._domainkey.agapay.app` | Cloudflare DKIM TXT only | No web service |
| `google._domainkey.agapay.app` | Google DKIM TXT only | No web service |
| `resend._domainkey.agapay.app` | Resend DKIM TXT only | No web service |
| `_dmarc.agapay.app` | DMARC TXT only | No web service |
| `www.agapay.app` | No DNS record | Does not resolve; Cloudflare also reports it as absent |
| `staging.agapay.app` | Referenced only as an accounting profile fallback | No DNS record. Deployed staging uses `agapay-site-staging.joeldunnesq.workers.dev`, which is outside `agapay.app` and unaffected by the parent policy |

The Cloudflare DNS dashboard showed all 11 public records in the zone. The
repository's `wrangler.toml` declares no `agapay.app` routes; Cloudflare's
zone shows the production Worker attached only to the apex. This inventory
cannot prove that no private or split-horizon DNS names exist outside the
public Cloudflare zone, so that limitation must remain explicit in every
later rollout decision.

Rollout stages:

1. **Current:** `max-age=2592000; includeSubDomains`. Run for the full 30
   days and monitor for failed requests or subdomain breakage.
2. After stage 1 is confirmed clean, change both header locations to
   `max-age=63072000; includeSubDomains` and monitor again.
3. Only after the full-duration policy is stable, add `preload` to both
   header locations. Adding the directive merely makes the domain eligible
   for submission.
4. Submission at `hstspreload.org` is a separate, deliberate human action.
   No preload-list submission was made as part of stage 1.
