# AGAPAY Sales Tax Exemption — Preview QA Procedure

Status as of 2026-07-05: **QA procedure prepared and documented below. QA environment is NOT configured, and QA has NOT been executed.** This sandbox has no Cloudflare account, no Wrangler login, no D1/R2 provisioning access, and no Stripe test-mode account — so none of this could actually be run from here. Everything below is the exact procedure for Joel (or whoever has deploy access) to execute before any production rollout. Do not treat any scenario below as "passed" until it has actually been run against a real preview environment.

## 1. Preview environment setup

### 1.1 Wrangler environment

This repo's `wrangler.toml` does not currently define a `[env.preview]` block. Add one before running preview QA — do not point preview at production bindings. Example shape (adjust binding IDs to real preview resources once created):

```toml
[env.preview]
name = "agapay-site-preview"

[[env.preview.d1_databases]]
binding = "AGAPAY_DB"
database_name = "agapay-preview"
database_id = "<preview D1 database id — create via `wrangler d1 create agapay-preview`>"

[[env.preview.r2_buckets]]
binding = "TAX_EXEMPTION_DOCS"
bucket_name = "agapay-tax-exemption-docs-preview"

[[env.preview.r2_buckets]]
binding = "CAMPAIGN_ASSETS"
bucket_name = "agapay-campaign-assets-preview"

[env.preview.vars]
AGAPAY_APP_URL = "https://agapay-site-preview.<your-subdomain>.workers.dev"
TAX_EXEMPTION_WORKFLOW_ENABLED = "true"
TAX_EXEMPTION_DOCUMENT_UPLOAD_ENABLED = "true"
TAX_EXEMPTION_STRIPE_SYNC_ENABLED = "true"
SUBSCRIPTION_TAX_CODES_ENABLED = "false"
PARISH_COMMERCE_READINESS_ENABLED = "false"
PARISH_COMMERCE_READINESS_ENFORCED_FOR_NEW = "false"
PARISH_COMMERCE_READINESS_ENFORCED_FOR_ALL = "false"
LEARN_PERSISTED_CUSTOMER_ENFORCED = "false"
```

Secrets (`STRIPE_SECRET_KEY`, `RESEND_API_KEY`, admin session secret, etc.) must be set separately per environment via `wrangler secret put <NAME> --env preview` — using **Stripe test-mode** keys (`sk_test_...`) only, and a separate Resend sending domain/recipient (or a test inbox) so preview emails never reach real parish contacts.

### 1.2 Preview D1 database

```
wrangler d1 create agapay-preview
wrangler d1 migrations apply agapay-preview --env preview
```

Apply every migration in `migrations/`, in order, including `0011_tax_exemptions.sql`, `0012_learn_stripe_customer.sql`, and `0013_tax_exemption_upload_tokens.sql`.

### 1.3 Preview private R2 bucket

```
wrangler r2 bucket create agapay-tax-exemption-docs-preview
```

Confirm it has **no** public `r2.dev` URL enabled (unlike `CAMPAIGN_ASSETS`, this must stay fully private).

### 1.4 Stripe test mode

Use a Stripe account (or a test-mode subset of the production account) with `sk_test_...` keys only. Create at least:
- One test Product/Price for the Giving/Parish+ tier used in QA scenario A/B.
- One test Product/Price for Stewardship (`STEWARDSHIP_STRIPE_PRICE_MONTHLY`/`_ANNUAL` env vars, test-mode price IDs).

### 1.5 Test admin account

Issue a preview-only admin session (via the existing `/api/admin/session` login flow against the preview Worker) — do not reuse a production admin password in preview.

### 1.6 Test parish registration

Register a fresh test parish through the preview site's `/register` flow (e.g. "QA Test Parish — Do Not Use" ) so it's obviously not a real organization if anyone stumbles on it.

### 1.7 Two test platform Stripe Customers for one parish

Complete a Giving/Parish+ checkout AND a Stewardship checkout for the same test parish registration, so `registration.stripeCustomerId` and `registration.stewardshipStripeCustomerId` both exist — needed for QA scenario B.

### 1.8 Test exemption document

Prepare one small, genuinely valid PDF (a few KB) to use as the "certificate" upload across scenarios. Also prepare one deliberately invalid file (e.g. a renamed `.txt` as `.pdf`) to confirm upload validation rejects it.

### 1.9 Forced Stripe failure scenario

Stripe test mode doesn't have a built-in "fail this specific customer update" toggle. Options: (a) temporarily revoke/rotate the preview `STRIPE_SECRET_KEY` mid-test to force a 401 from Stripe, or (b) use a deliberately malformed test Customer ID to force a 404-style failure from Stripe. Either is sufficient to exercise the partial-sync and retry paths.

### 1.10 Externally modified Stripe `tax_exempt` scenario

After approving a claim through the admin UI, go into the Stripe Dashboard (test mode) directly and manually change the test Customer's `Tax status` field to something other than what AGAPAY set — this simulates an out-of-band change for QA scenario C.

## 2. Feature flags for preview

| Flag | Preview value | Why |
|---|---|---|
| `TAX_EXEMPTION_WORKFLOW_ENABLED` | `true` | Exercise the full workflow |
| `TAX_EXEMPTION_DOCUMENT_UPLOAD_ENABLED` | `true` | Exercise upload |
| `TAX_EXEMPTION_STRIPE_SYNC_ENABLED` | `true` (test mode only) | Exercise real (test-mode) Stripe sync |
| `SUBSCRIPTION_TAX_CODES_ENABLED` | `false` unless a specific test code is explicitly approved for this QA pass | Never invent/approve tax codes as a side effect of QA |
| `PARISH_COMMERCE_READINESS_ENABLED`/`_ENFORCED_FOR_NEW`/`_ENFORCED_FOR_ALL` | `false` | Non-blocking unless commerce readiness is itself under test |
| `LEARN_PERSISTED_CUSTOMER_ENFORCED` | `false` by default; may be set `true` temporarily to specifically test the enforced path | Document explicitly if changed for a test run, then reset |

Production flag defaults are unchanged by this document — do not alter production activation states without explicit separate approval.

## 3. QA scenarios

For each scenario: record pass/fail, screenshots or console output where useful, and the exact preview URL/request used. None of these have been executed as part of this report.

### A. Basic admin workflow
1. Submit an exemption claim through `/register` for the test parish (claims exemption = yes, jurisdiction = TX).
2. Upload the valid test PDF via the claim-scoped upload flow.
3. Confirm the "Pending review" summary card count increments in `/admin` → Tax Exemptions.
4. Open the claim detail, confirm the document shows "Available."
5. Add an internal note.
6. Approve the claim.
7. Confirm the Stripe sync row shows `succeeded` for the Giving/Parish+ Customer, and the Stripe test-mode Customer's `Tax status` actually shows Exempt in the Dashboard.

### B. Two-Customer partial sync
1. Using the parish with both Giving/Parish+ and Stewardship test Customers (§1.7), submit and approve a new claim.
2. Before approving, force one Customer's Stripe call to fail (§1.9).
3. Confirm the claim stays `pending` (not falsely approved), the failed Customer's sync row shows `failed`, and the succeeded Customer's row is untouched.
4. Use "Retry this Customer" on only the failed row.
5. Confirm the claim becomes `approved` once both succeed, and the previously-succeeded Customer was not re-called (check Stripe test-mode logs for call count).

### C. External Stripe state
1. Approve an exemption normally.
2. Manually change the test Customer's `tax_exempt` value directly in the Stripe Dashboard (§1.10).
3. Revoke or manually expire the exemption locally.
4. Confirm the sync row shows `reconciliation_required` and Stripe was NOT overwritten.
5. Test "Accept current external Stripe state" — confirm it resolves without a further Stripe write.
6. Repeat from step 1, then test "Force AGAPAY's desired state" instead — confirm it does overwrite, with explicit confirmation required in the UI.

### D. Stale admin state
1. Open the same exemption claim's detail view in two separate admin browser sessions (e.g. two browser profiles, both logged in).
2. In session 1, approve the claim.
3. In session 2 (still showing the pre-approval detail view), attempt to reject it.
4. Confirm session 2 receives the "updated by another administrator" message, the detail view reloads with current data, and Stripe was not called by the stale request.

### E. Waiting for Customer
1. Register a brand-new test parish, submit and approve an exemption claim **before** completing any subscription checkout.
2. Confirm the admin UI shows "waiting for Customer" rather than a false success.
3. Complete a Giving/Parish+ Checkout for that parish.
4. Confirm the exemption is applied automatically before/at Customer creation (check the new Customer's `tax_exempt` in Stripe test mode).
5. Repeat steps 1–4 for a Stewardship checkout on a different test parish, confirming the same behavior via the newly-wired Stewardship path.

### F. Document security
1. Attempt to hit the document view/download endpoint with no Authorization header — confirm 401.
2. Attempt to hit it with a valid admin token for a different exemption's document — confirm the endpoint still only serves the document tied to the requested `:id` (no cross-claim leakage).
3. Inspect response headers for `Cache-Control: private, no-store` and `X-Content-Type-Options: nosniff`.
4. Confirm there is no public `r2.dev` URL for the preview `agapay-tax-exemption-docs-preview` bucket.
5. Confirm inline view vs. explicit download produce different `Content-Disposition` values.

### G. Manual expiration
1. Approve an exemption where AGAPAY owns the Stripe change.
2. Use "Mark expired" with a reason and explicit confirmation.
3. Confirm the Stripe test Customer's `tax_exempt` reverts to `none`.
4. Repeat on a claim where the Stripe state is externally-owned (§1.10) and confirm it is preserved, not erased, with `reconciliation_required` shown instead.
5. Confirm an audit entry and a (test-mode) notification email were both produced.

### H. Responsive and accessibility
1. Load the Tax Exemptions tab at desktop, tablet, and mobile widths — confirm the table converts to stacked cards below ~760px.
2. Navigate the entire queue → detail → action flow using only the keyboard (Tab/Enter/Escape).
3. Run a screen reader (VoiceOver/NVDA) over the summary cards, badges, and toast messages — confirm status is announced as text, not implied by color alone.
4. Confirm visible focus outlines throughout.

## 4. Distinguishing prepared vs. executed

- **QA procedure prepared:** Yes — this document.
- **QA environment configured:** No — no preview Wrangler environment, D1, R2 bucket, or Stripe test-mode setup has actually been created; §1 above is instructions, not a completed setup.
- **QA executed:** No.
- **QA passed:** N/A — cannot pass QA that has not been run.

This document should be updated in place with actual results (pass/fail per scenario, dates, and who ran it) once someone with real deploy/Stripe-test access executes it.
