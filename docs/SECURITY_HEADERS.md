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
- `X-Frame-Options: SAMEORIGIN` — blocks other sites from framing AGAPAY
  pages (clickjacking defense). `SAMEORIGIN` rather than `DENY` in case
  AGAPAY ever needs to frame itself; nothing today intentionally embeds
  AGAPAY pages in a third-party iframe.
- `Strict-Transport-Security: max-age=15552000` (180 days) — deliberately
  **without** `includeSubDomains` or `preload`. Add those later once
  you're confident every subdomain (if any exist beyond `agapay.app`
  itself) is HTTPS-only; `preload` in particular is slow to undo once
  submitted to browser preload lists.
- `Permissions-Policy: geolocation=(), microphone=(), camera=(self),
  payment=(self)` — camera is deliberately allowed same-origin only
  (`self`), not blocked entirely, because the bookstore barcode scanner
  (`public/donor/app.js`, `zxing` library) needs it.

**Report-Only, not enforcing**: `Content-Security-Policy-Report-Only`.
This was a deliberate choice, not an oversight — **do not flip this to a
plain enforcing `Content-Security-Policy` header without watching for
violations first.**

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
| `style-src` | `fonts.googleapis.com` | Google Fonts stylesheets |
| `font-src` | `fonts.gstatic.com` | Google Fonts font files |
| `frame-src` | `challenges.cloudflare.com` | Turnstile renders its widget in an iframe |
| `connect-src` | `challenges.cloudflare.com` | Turnstile's own client-side calls |

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
