# AGAPAY Sales Tax & Merchant-of-Record — Phase 2 Implementation Plan

Date: 2026-07-05. Planning only — no migrations, Stripe objects, R2 buckets, or config were created.

Additional repo inspection since Phase 1 turned up one important new fact that changes the Stripe-Customer picture in §1 and §6 below:

> **Parishes may already have two separate platform-account Stripe Customers.** `src/lib/subscription-checkout.js` creates/uses `registration.stripeCustomerId` for the Giving/Parish+ tier system. `src/handlers/stewardship.js` (~line 1841 and ~line 2109) independently creates/uses `registration.stewardshipStripeCustomerId` for the Stewardship Suite subscription — its own `stripePlatformPost(env, "/customers", ...)` call, never reusing `stripeCustomerId`. Any exemption sync must update **both** customer IDs when present, not just one.

---

## 1. Proposed architecture

### A. Parish subscription tax exemption

**Data ownership:**

| Data | Owner |
|---|---|
| Registration identity (parish name, address) | `registrations` table (existing) |
| Exemption claim + lifecycle status | new `tax_exemptions` table |
| Exemption document binary | new private R2 bucket |
| Exemption document metadata | new `tax_exemption_documents` table |
| Review decision, reviewer, reasons | `tax_exemptions` row (decision fields) + `tax_exemption_audit_log` |
| Stripe-side exempt flag | Stripe Customer object(s): `registration.stripeCustomerId` and, if present, `registration.stewardshipStripeCustomerId` |
| Sync state (has Stripe been told yet?) | `tax_exemptions.stripe_sync_status` / `stripe_sync_error` |
| Every state change | `tax_exemption_audit_log` (append-only) |

**Flow:**

1. **Claim** — parish registers or later visits their dashboard, opens "Sales Tax Exemption," selects "Yes," fills jurisdiction/type/number/dates, uploads a document, certifies, submits. This creates one `tax_exemptions` row with `status='pending'` (see edge case on registration timing in §3 — resolved as: create the `registrations` row first via the existing flow, then attach the exemption claim once `reference` exists).
2. **Document upload** — file goes to the new private R2 bucket (§4); a `tax_exemption_documents` row is written with `is_current=1`. No status change beyond `pending`.
3. **Pending review** — appears in the admin exemption queue (§5) filtered by `status='pending'`.
4. **Admin approval** — sequence in §5/§6 (D1 pending → Stripe call → D1 finalize). On success: `tax_exemptions.status='approved'`, `approved_at`, `approved_by`; Stripe Customer(s) updated; `registrations.tax_exemption_status` cache column updated (see below); notify parish; audit log entry.
5. **Admin rejection** — `status='rejected'`, `rejected_at/by/reason`; Stripe untouched (stays non-exempt); document retained; notify parish with resubmission instructions; audit log entry.
6. **Replacement requested** — `status='replacement_required'`; if a prior approval existed, Stripe exemption stays active only under an explicit grace-period policy Joel must decide on (default recommendation: **no grace period** — treat as if never approved for Stripe purposes until the replacement is itself approved, since a lapsed/invalid certificate shouldn't keep tax off invoices); old document kept, `is_current=0`; new upload creates a new `tax_exemption_documents` row with `replaces_document_id` set.
7. **Stripe Customer update** — see §6 for the exact call and idempotency plan.
8. **Invoice treatment** — once Stripe Customer `tax_exempt` is set, Stripe Tax excludes tax from that Customer's future invoices automatically; no code change needed on the invoicing path itself.
9. **Expiration** — a scheduled check (existing `[triggers] crons` in `wrangler.toml` already runs a Saturday cron for commemoration emails — either extend that worker cron or add a second cron entry) finds `tax_exemptions` where `expiration_date < today AND status='approved'`, flips to `status='expired'`, disables Stripe exemption, notifies parish, logs.
10. **Renewal** — parish submits a new claim; if their prior row is `expired`, create a fresh `tax_exemptions` row rather than mutating the old one, so exemption history stays intact per jurisdiction/period.
11. **Revocation** — admin-initiated equivalent of expiration (manual trigger, e.g. certificate turns out to be invalid); same Stripe-disable + notify + audit sequence, `status='revoked'`, `revoked_at/by/reason`.
12. **Sync failure/retry** — if the Stripe call fails at approval/expiration/revocation time, the local status must **not** advance to the terminal state (`approved`/`expired`/`revoked`) — it stays in a `stripe_sync_status='failed'` holding state with the *previous* `tax_exemptions.status` unchanged, surfaced in the admin queue's "Failed Stripe synchronization" filter (§5) with a retry action.

**Isolation guarantee:** every write path above only ever touches `registration.stripeCustomerId` / `registration.stewardshipStripeCustomerId` — never a donor record (`donors` table / `donor_offerings`), never a bookstore purchaser Customer (created via `findOrCreateDonorCustomer` in `donor.js`, which is scoped to the connected account, not the platform account, so it's a structurally different Stripe Customer namespace already).

### B. Parish commerce tax setup — kept separate

Two independent concepts, two independent places in the UI and data model:

1. **"Is the parish exempt from sales tax on its own AGAPAY subscription?"** → `tax_exemptions` table, admin-reviewed, affects only `registration.stripeCustomerId`/`stewardshipStripeCustomerId` on the **platform** account.
2. **"Is the parish registered/configured to collect sales tax from its own bookstore customers?"** → this is entirely about the parish's **connected account** Stripe Tax configuration (their own registrations, entered by the parish or their accountant directly in their connected Stripe Tax settings, or via the readiness framework in §9). AGAPAY does not adjudicate this and it is never influenced by the parish's own subscription exemption status.

**UI separation:** the parish dashboard's Parish+ / Bookstore settings tab shows a distinct "Bookstore tax readiness" panel (§9) that is visually and functionally unconnected to the parish's "Sales Tax Exemption" (subscription) panel — different page sections, different copy, and the bookstore panel explicitly states "This does not affect whether your parish's own retail customers are charged tax." The admin exemption queue (§5) only ever lists subscription exemption claims — never commerce/bookstore tax settings.

### C. Learn billing identity

New stable Customer model (detailed schema in §8):

- One Stripe Customer per `learn_households.id` (already a deterministic id: `learn_household_<slug(email)>`, from `learnBillingIdentityFromEmail` in `src/learn/billing.js`).
- `stripe_customer_id` persisted on the `learn_households` row (new column, or inside the existing `data` JSON blob with a promoted column for lookups — recommend a real column, see §8).
- Created once, reused on every subsequent checkout — never `customer_email` alone.
- Metadata `agapay_household_id` and `agapay_product: "learn"` distinguishes it from parish subscription Customers and from donor/bookstore Customers at a glance in the Stripe Dashboard.
- Supports Stripe Customer Portal today if AGAPAY chooses to turn it on later (portal requires a real Customer, which this model provides — currently there is no Portal integration in the repo, only Checkout).
- Webhook correlation: existing `handleStripeWebhookEvent`-style logic in `stripe.js` (`account.updated`, `invoice.payment_succeeded`, etc.) can add a case keyed on `event.data.object.customer` matched against `learn_households.stripe_customer_id`, the same lookup-by-Stripe-id pattern already used for registrations via `findRegistrationByStripeAccountId`/`findRegistrationByStripeSubscriptionId`.
- Learn's Customer must never be the same id as the parish's `stripeCustomerId`/`stewardshipStripeCustomerId` — this is a **household** entity, not a parish entity, even for households tied to a Learn co-op hosted by a parish.

---

## 2. Database plan

### `tax_exemptions`

Follows the `settlement_profiles` migration conventions already in the repo (`migrations/0010_settlement_profiles.sql`): heavily commented, prefixed random ids, `INSERT OR IGNORE`-safe backfill, additive `ALTER TABLE` only.

```
id                              TEXT PRIMARY KEY   -- 'texmp_' + 12 random hex bytes, same style as settlement_profiles' 'sp_' prefix
registration_reference          TEXT NOT NULL       -- FK -> registrations(reference)
parish_id                       TEXT                -- FK -> registrations(parish_id), denormalized for indexing/joins
jurisdiction                    TEXT NOT NULL        -- state code, or 'FEDERAL', or 'OTHER'
exemption_type                  TEXT NOT NULL        -- e.g. 'religious_organization', 'nonprofit', 'other'
certificate_number              TEXT                 -- nullable
effective_date                  TEXT                 -- nullable, ISO date
expiration_date                 TEXT                 -- nullable, ISO date
status                          TEXT NOT NULL DEFAULT 'pending'
authorized_representative_name  TEXT NOT NULL
authorized_representative_title TEXT NOT NULL
certified_at                    TEXT NOT NULL         -- when the checkbox was submitted
approved_at                     TEXT
approved_by                     TEXT                  -- admin actor string, same convention as appendAdminAudit's `actor`
rejected_at                     TEXT
rejected_by                     TEXT
rejection_reason                TEXT
replacement_requested_at        TEXT
replacement_requested_by        TEXT
replacement_reason              TEXT
revoked_at                      TEXT
revoked_by                      TEXT
revocation_reason               TEXT
stripe_customer_id              TEXT                  -- the customer this claim was synced to (may later need a second row/column if a parish's two customer ids diverge — see below)
stripe_sync_status              TEXT NOT NULL DEFAULT 'not_started'
stripe_sync_error               TEXT
stripe_synced_at                TEXT
created_at                      TEXT NOT NULL DEFAULT (datetime('now'))
updated_at                      TEXT NOT NULL DEFAULT (datetime('now'))
```

**Two-customer problem:** since a parish can have both `stripeCustomerId` and `stewardshipStripeCustomerId`, a single `stripe_customer_id` column is insufficient to represent "did we sync both." Recommend either (a) a small companion table `tax_exemption_stripe_syncs` with one row per `(tax_exemption_id, stripe_customer_id)` pair so each customer's sync status/error is tracked independently, or (b) two explicit nullable columns (`stripe_customer_id_giving`, `stripe_customer_id_stewardship`) with matching `_sync_status`/`_sync_error`/`_synced_at` triples. Recommend **(a)** — it's forward-compatible if a third platform Customer type is ever added, and it keeps `tax_exemptions` itself narrow. Detailed columns for Phase 3 to finalize with Joel.

**Indexes:** `idx_tax_exemptions_registration_reference`, `idx_tax_exemptions_parish_id`, `idx_tax_exemptions_status`, `idx_tax_exemptions_expiration_date` (for the expiration cron), `idx_tax_exemptions_stripe_sync_status` (for the "failed sync" admin filter).

**Uniqueness:** no hard uniqueness constraint on `(registration_reference)` — a parish can have a historical sequence of exemption rows (expired → renewed). The admin queue and any "current exemption for this parish" lookup should query `ORDER BY created_at DESC LIMIT 1` or rely on the `registrations.tax_exemption_status` cache column (below) plus a `current_tax_exemption_id` pointer if needed.

**Valid state transitions:** `pending → approved | rejected`; `approved → replacement_required | expired | revoked`; `rejected → (new row created on resubmission, this row stays terminal)`; `replacement_required → approved | rejected` (on the new document's review). Enforce these in application code (the D1 driver here is raw SQL via `d1Run`, not an ORM with state-machine support) — a single `updateTaxExemptionStatus()` helper should be the only write path and should validate the transition before writing.

### `tax_exemption_documents`

```
id                     TEXT PRIMARY KEY   -- 'texdoc_' + random hex
tax_exemption_id       TEXT NOT NULL       -- FK -> tax_exemptions(id)
registration_reference TEXT NOT NULL       -- denormalized for direct lookup/authorization checks without a join
storage_key            TEXT NOT NULL UNIQUE -- random R2 object key, see §4
original_filename      TEXT NOT NULL       -- metadata only, never used as storage_key
sanitized_filename     TEXT NOT NULL
mime_type              TEXT NOT NULL
file_size              INTEGER NOT NULL
sha256                 TEXT NOT NULL
uploaded_by_user_id    TEXT                -- parish dashboard session actor, or 'registration_form' if pre-account
uploaded_at            TEXT NOT NULL DEFAULT (datetime('now'))
is_current             INTEGER NOT NULL DEFAULT 1
replaces_document_id   TEXT                -- FK -> tax_exemption_documents(id), nullable
archived_at            TEXT
deleted_at             TEXT
```

Index: `idx_tax_exemption_documents_tax_exemption_id`, `idx_tax_exemption_documents_registration_reference`. `deleted_at` is soft-delete only — never a hard `DELETE` given the audit requirement; a real delete request (e.g. legal request) should still go through the audit log first.

### `tax_exemption_audit_log`

```
id                     TEXT PRIMARY KEY
tax_exemption_id       TEXT                -- nullable: some events (e.g. initial claim before a row's fully committed) may not have one yet
document_id            TEXT                -- nullable
registration_reference TEXT NOT NULL
action                 TEXT NOT NULL        -- upload | view | approve | reject | request_replacement | revoke | expire | stripe_sync_attempt | stripe_sync_success | stripe_sync_failure
actor_type             TEXT NOT NULL         -- 'admin' | 'parish' | 'system'
actor_user_id           TEXT
metadata_json          TEXT                  -- small structured context; never file contents or certificate numbers (per the do-not-log requirement)
created_at             TEXT NOT NULL DEFAULT (datetime('now'))
```

Index: `idx_tax_exemption_audit_log_registration_reference`, `idx_tax_exemption_audit_log_tax_exemption_id`. This table is **append-only** at the application layer — no `updateTaxExemptionAuditLog()` function should ever be written; only an `insert`.

### `registrations` promoted columns

Add `tax_exemption_status TEXT` and `tax_exemption_expiration_date TEXT` as new nullable columns via `ALTER TABLE registrations ADD COLUMN ...` (same pattern as the existing promoted columns `stripe_account_id`, `parish_id`, etc. in `migrations/0001_production_records.sql`).

**These are cached/denormalized, not authoritative.** `tax_exemptions` is the source of truth; the `registrations` columns exist purely so existing list/search/filter code (`/api/parishes`, `/api/admin/registrations`, both already using D1 keyset pagination with `status`/`type`/`jurisdiction` filters per the existing scaling refactor) can filter/sort parishes by exemption status without a join, matching how `stripe_account_id` is already promoted for the same reason. Every write to `tax_exemptions.status` or `.expiration_date` must be paired with a write to the corresponding `registrations` columns in the same logical operation (not a DB transaction, since D1's binding here is used via discrete `d1Run` calls rather than multi-statement transactions in application code — see rollback note below).

### Migration sequence

1. `0011_tax_exemptions.sql` — creates all three new tables, indexes, and the two `registrations` ALTER TABLE ADD COLUMN statements. Purely additive; no backfill needed since the feature doesn't exist yet (no historical data to migrate). Safe to run against production with zero downtime — new tables and nullable columns don't affect any existing query.
2. `0012_learn_stripe_customer.sql` — adds `stripe_customer_id`, `stripe_customer_created_at`, `stripe_subscription_id`, `stripe_subscription_status`, `last_stripe_sync_at` columns to `learn_households` (nullable ALTER TABLE ADD COLUMN, additive). Kept as a separate migration from #1 since it's a logically distinct feature (Learn billing hygiene, not tax exemption) and Joel may want to approve/deploy them independently.

**Deployment safety:** both migrations are additive-only (new tables, nullable columns) — no existing column is altered or dropped, no existing row is rewritten, so they're safe to apply before the corresponding code deploys (D1 migrations and Worker code deploy separately per the existing GitHub Actions pipeline). **Rollback:** for D1, there's no automatic "down" migration tooling in this repo today — rollback means either leaving the additive schema in place (harmless if the feature code is reverted) or manually issuing `DROP TABLE`/column-removal statements by hand if truly necessary. Recommend: never roll back schema, only roll back application code, since the added tables/columns are inert until the new code paths reference them.

---

## 3. Registration-page changes

**Files to change:**
- `public/register.html` — new "Sales Tax Exemption" section (after the existing address block, ~line 446 area where `postalCode` currently ends), new fields, new client-side validation alongside the existing `addressLine1`/`city`/`state`/`postalCode` required-field checks (~lines 818–821).
- Registration submission handler — need to trace the exact POST target (`api/registrations.js` / `src/lib/registrations.js` / the worker route it proxies to) to add server-side field parsing; will confirm exact function name in Phase 3 since it wasn't fully traced in Phase 1 (flagging rather than guessing).
- New handler module, e.g. `src/handlers/tax-exemption.js`, for: claim creation, document upload, parish self-view of their own claim/document. Mirrors the existing per-domain handler split (`stripe.js`, `donor.js`, `stewardship.js`, etc.).
- `src/handlers/admin.js` — new admin review routes (§5).
- `src/worker.js` — new route registrations for the above, following the existing `url.pathname.startsWith(...)` dispatch pattern already used for `/api/admin/registrations/.../subscription-checkout` etc.

**Copy:** exact text from the spec ("Some AGAPAY subscription fees may be subject to sales tax... Exemption is not automatic...") goes directly under the new section heading.

**Fields:** claim yes/no radio, jurisdiction select (US states + `Federal` + `Other`, reusing the existing state `<select>` markup as a base and adding the two extra options), exemption type, certificate number (optional), effective date (optional), expiration date (optional), file input (accept `.pdf,.jpg,.jpeg,.png`), certification checkbox with the exact required text, representative name, representative title, submission date (auto-set server-side, not user-editable).

**Conditional logic:**
- Claim = "No" → hide/disable all exemption sub-fields, no document required, form submits exactly as it does today.
- Claim = "Yes" → document required **unless** jurisdiction is a no-certificate jurisdiction. Oregon has no general sales tax, so if `jurisdiction === 'OR'`, don't require a document — but do still create a `tax_exemptions` row (status `pending`, so an admin can confirm the "no certificate needed" reasoning) rather than silently auto-approving. Any other jurisdiction/claim combination that looks unusual (e.g., a document-required jurisdiction with no file) blocks client-side submission and is also rejected server-side.
- Upload never implies approval — the document-upload endpoint only ever creates/updates a `pending` (or `replacement_required`) row; there is no code path where an upload flips `status` to `approved`.

**Registration timing — resolved:** create the `registrations` row first (as today), then let the parish attach the exemption claim (and its document) against that `reference` — either in the same submission (registration handler internally calls the new exemption-claim function after the registration insert succeeds) or later from the parish dashboard. This avoids needing a temporary pre-registration upload token, since `reference` already exists by the time the file is sent (the existing registration flow appears to be a single synchronous form POST, not multi-step, so reference should be available before file upload begins in the same request/response cycle or a fast follow-up request).

**Orphaned/abandoned uploads:** if a claim is created but never gets a document (e.g., the browser tab closes mid-upload), the row simply sits at `pending` with zero `tax_exemption_documents` rows — the admin queue should visually flag "pending, no document" as a filter so these don't get lost. A cleanup job isn't strictly necessary (unlike anonymous/pre-auth upload tokens, every claim here is already tied to a real `registration_reference`), but a periodic sweep (e.g., part of the same cron as expiration handling) that flags/closes `pending` claims with no document after N days is a reasonable low-cost addition.

**Idempotent resubmission:** if a parish resubmits the exemption section for a registration that already has a `pending` or `rejected` claim, treat it as updating the existing `pending` row (not creating a duplicate) or creating a fresh row only when the prior one is terminal (`rejected`/`expired`/`revoked`), matching the "renewal creates a new row" behavior in §1.

**Cross-cutting requirements (all standard, matching existing patterns already in the repo):**
- Server-side validation mirrors client-side, never trusts it alone (existing convention throughout `donor.js`/`parish.js`).
- Rate limiting via the existing `rateLimit`/`rateLimitByKey` helpers (`src/lib/core.js`) on both claim submission and document upload endpoints.
- CSRF: the codebase currently has **no CSRF token system** anywhere (confirmed by repo-wide search) — all mutating admin/parish routes are protected by bearer/session tokens in the `Authorization` header rather than cookies, which structurally avoids classic CSRF. The new endpoints should follow that same pattern (bearer token, not cookie session) rather than introducing a new CSRF mechanism inconsistent with the rest of the app.
- Accessibility: `<label for>` on every field (already the pattern in `register.html`), `aria-live` region for validation/upload-progress messages, visible focus states consistent with existing `.form-group` styling, keyboard-operable file input and checkbox.
- Upload progress/retry: use `XMLHttpRequest` or `fetch` with a progress-capable pattern (Cloudflare Workers requests don't support native upload progress events via `fetch`, so `XMLHttpRequest.upload.onprogress` is the practical option for a progress bar); on failure, keep the already-filled form fields in place (don't reset the form) and show a retry button that resubmits only the file, not the whole claim.
- Duplicate-submit prevention: disable the submit button on click, matching the existing `.btn-submit:disabled` styling already defined in `register.html`.

---

## 4. Secure R2 document-storage plan

**New binding:** `TAX_EXEMPTION_DOCS` (distinct name, clearly not `CAMPAIGN_ASSETS`). Bucket naming: `agapay-tax-exemption-docs` for production; recommend `agapay-tax-exemption-docs-preview` / a local `.wrangler` dev binding for preview/dev environments, mirroring how `CAMPAIGN_ASSETS`/`AGAPAY_DB` are each single named bindings today (this repo doesn't currently show a multi-environment wrangler config, so this would be a new pattern — flagging for Joel's confirmation before Phase 3 rather than assuming an environments block exists).

**Object key format:** fully random, no embedded parish name/certificate number/email — e.g. `texdoc/{random-32-hex}` (mirrors the `sp_`/random-hex id convention already used for settlement profiles). The `tax_exemption_documents.storage_key` column is the only place this key is recorded, joined back to `registration_reference` there — never derivable from the key itself, which also prevents path traversal since the key has no user-controlled path segments at all.

**Access model comparison:**

| | Worker streams the object directly | Worker issues a short-lived signed URL |
|---|---|---|
| Auth enforcement | Every byte request re-runs the admin/parish auth check | Auth checked once at URL-issuance time; the URL itself is the only gate afterward |
| Exposure window | None — no bearer URL ever leaves the server | A signed URL, even short-lived, could be shared/logged/cached before it expires |
| Implementation complexity | Simpler — no need to implement/verify HMAC signing in Workers | Needs a signing scheme (HMAC over key+expiry) since R2 bindings don't have built-in presigned URLs the way S3 does (Cloudflare's presigned-URL support is via the S3-compatible API with R2 API tokens, not the same as a Worker's `R2Bucket` binding) |

**Recommendation: Worker-streams-the-object.** Given the sensitivity of these documents and that Cloudflare's presigned-URL flow would require provisioning R2 API tokens (a whole separate credential/configuration surface) rather than using the simple `env.TAX_EXEMPTION_DOCS.get(key)` binding already idiomatic to this codebase's Cloudflare-native style, a Worker route that re-checks admin auth (or parish-self-access auth) on every request and streams `object.body` directly is simpler, has zero URL-leakage window, and matches the "no predictable public URLs, authenticated short-lived access" requirement without adding new credential types. (The spec's phrase "short-lived signed URLs" is satisfied functionally — every access is short-lived and signed in the sense that it requires a valid, freshly-checked session token — even though there's no separate bearer URL artifact.)

**Route shape:** `GET /api/admin/tax-exemptions/:id/document` (admin) and `GET /api/parish/dashboard/:parishId/tax-exemption/document` (parish self-view, optional per spec — "optionally allow the organization's authorized administrator to view its own submitted file"), both requiring `requireAdminContext`/parish session respectively, then looking up the current (`is_current=1`) document row for that exemption/registration, then `env.TAX_EXEMPTION_DOCS.get(storage_key)`.

**Response headers:** `Content-Disposition: inline; filename="<sanitized original filename, re-escaped>"`, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store` (never cache these responses), `Content-Type` set from the stored `mime_type` (never trust a client-supplied header at read time — use what was validated at upload time).

**Upload-time validation:**
- Allowed: `application/pdf`, `image/jpeg`, `image/png` — matched against both the `Content-Type` the browser sends **and** a magic-byte/file-signature check server-side (PDF: `%PDF-`; JPEG: `FF D8 FF`; PNG: `89 50 4E 47`) so a renamed `.exe` can't pass as a `.pdf`.
- Reject SVG explicitly (even though it's an image format, it's excluded per spec) and any executable extension.
- Max size: recommend 10MB (typical scanned exemption certificate — final number is Joel's call, not a technical constraint).
- Filename sanitization: strip path separators, non-ASCII/control characters, collapse to a safe slug; store the sanitized name plus the untouched `original_filename` as metadata only (never used as the storage key or in any file-system-facing path).
- SHA-256 computed at upload time (Workers support `crypto.subtle.digest`), stored for potential duplicate-detection (`WHERE sha256 = ? AND registration_reference = ?`) — cheap integrity/dedup check, not a security control by itself.
- Malware scanning: **no compatible infrastructure exists today** in this repo (no ClamAV/VirusTotal/Cloudflare-native scanning binding found) — document this as a known limitation rather than building a scanner from scratch; recommend flagging documents for manual visual admin review as the practical mitigation until/unless Joel wants to provision a scanning service.
- Cross-organization isolation: every read/write path requires both a valid admin session **and** (for parish self-access) confirms the requesting parish's own `registration_reference`/`parish_id` matches the document's — never trust a client-supplied id alone (standard IDOR-prevention pattern already used elsewhere in this codebase per the Phase 1 security-posture notes).

**Cleanup of abandoned uploads:** an R2 object written but never linked to a finalized `tax_exemption_documents` row (e.g., request died mid-flow) should be rare if upload and metadata-row-write happen in the same request handler, but as a safety net, a periodic sweep (same cron cadence as expiration handling) can list recently-written keys with no matching D1 row and delete them after a grace window.

---

## 5. Admin review workflow

**Files to extend:** `src/handlers/admin.js` (new route handlers, reusing `requireAdminContext` from `parish.js` and the `appendAdminAudit`-style audit pattern — though audit here goes to the new `tax_exemption_audit_log` table rather than a registration's in-JSON `adminAuditLog` array, since this needs to be queryable/filterable independent of any one registration). `src/worker.js` (new routes). Admin UI: `public/admin.html` + `public/admin/app.js` (new tab/section, following the existing tab structure already used for Overview/Giving queue/Learn per the Phase 1 admin-dashboard notes).

**Queue filters:** `pending`, `approved`, `rejected`, `replacement_required`, expiring-soon (e.g. `expiration_date` within 30 days AND `status='approved'`), `expired`, `revoked`, and a `stripe_sync_status='failed'` filter — all straightforward `WHERE` clauses against the indexed `tax_exemptions` columns from §2.

**Per-record detail view:** parish name/registration reference/parish id (join to `registrations`), billing address (from the registration's existing address fields), jurisdiction/type/certificate number/dates, representative name/title, the document (via the streaming route in §4), full document history (all `tax_exemption_documents` rows for this exemption, ordered by `uploaded_at`), full review history (all `tax_exemption_audit_log` rows for this exemption), Stripe Customer id(s) and sync status/error, and a free-text internal notes field (new `notes` column on `tax_exemptions`, or a separate small `tax_exemption_notes` table if multiple admins should be able to leave separate timestamped notes — recommend the latter for a cleaner audit trail).

**Actions:** approve, reject (with required reason field), request replacement (with reason), revoke (with reason), mark expired (manual override, in addition to the automatic cron), retry Stripe sync, view current document, view archived documents, add note. "Download only if operationally necessary" — recommend the UI defaults to inline view (via the streaming route, which can serve `Content-Disposition: inline`) and a separate explicit "download" action (that swaps to `attachment`) only shown behind one extra click, so casual review doesn't produce a local copy by default.

**Approval sequence (failure-safe):**

1. Validate current `status` is `pending` or `replacement_required` (reject the approve action otherwise — no approving an already-approved or rejected row).
2. Resolve the correct Stripe Customer id(s) for this parish (`stripeCustomerId`, and `stewardshipStripeCustomerId` if present).
3. Set `tax_exemptions.stripe_sync_status='pending'` (D1 write #1) — this is the "D1 pending state" step.
4. Call Stripe to update the Customer(s) (§6) — using an idempotency key derived from `tax_exemption_id` + customer id + action, so a retried request after a timeout doesn't double-apply.
5. **Only if every required Stripe call succeeds**, finalize: `tax_exemptions.status='approved'`, `approved_at`, `approved_by`, `stripe_sync_status='succeeded'`, `stripe_synced_at` (D1 write #2); also update `registrations.tax_exemption_status`/`tax_exemption_expiration_date` cache columns.
6. Write `tax_exemption_audit_log` entries for both the sync attempt and the approval decision.
7. Send the parish notification via the existing `sendEmail`/`agapayEmailHtml` helpers (`src/lib/email.js`).

**Why D1-pending-then-Stripe-then-D1-finalize (not Stripe-first):** Stripe-first risks a crash/timeout between the Stripe call succeeding and the local write happening, leaving Stripe exempt but the local record unaware — silent drift that's hard to detect. D1-pending-first means if the process dies before the Stripe call, the record is visibly stuck at `stripe_sync_status='pending'` (not silently approved), which the admin queue's failed/pending-sync filter will surface for a manual retry — a stuck-and-visible state is safer than a silently-diverged one.

**Rejection:** Stripe untouched (never called at all for a rejection), document retained (never deleted), `rejection_reason` required, notification sent with resubmission guidance, audit logged.

**Replacement-required / revocation / expiration:** same failure-safe pattern as approval but in reverse (disable rather than enable the Stripe exemption) — same D1-pending → Stripe call → D1-finalize sequence, same retry-on-failure behavior, same audit logging, same notification.

---

## 6. Stripe integration plan

**No official Stripe SDK is used anywhere in this repo** (`package.json` has zero Stripe dependency — the "zero npm dependencies" security posture noted in Phase 1 memory is confirmed; all Stripe calls go through raw `fetch` helpers in `src/lib/stripe-connect.js`: `stripeFormRequest`, `stripeGetRequest`, `stripeFormConnectedRequest`, `stripeGetConnectedRequest`). No `Stripe-Version` header is set anywhere, meaning every call runs against whatever API version is configured as the account default in the Stripe Dashboard — Phase 3 should confirm that version explicitly (e.g. by checking the Dashboard) before relying on any newly-introduced field names, rather than assuming.

**Correct field:** Stripe Customer objects support `tax_exempt` with values `none | exempt | reverse`. The correct call is a `POST /v1/customers/{id}` with `tax_exempt=exempt` (approval) or `tax_exempt=none` (rejection/revocation/expiration/default) — a new small helper, e.g. `setStripeCustomerTaxExempt(env, customerId, exempt)`, added to `src/lib/stripe-connect.js` alongside the existing Stripe helpers, using `stripeFormRequest` (platform account, no `Stripe-Account` header, since these are platform-account Customers).

**Which Customer(s) to update:** exactly `registration.stripeCustomerId` (Giving/Parish+) and, if present, `registration.stewardshipStripeCustomerId` (Stewardship) — both, since both currently exist as independent platform Customers for the same parish. Never a donor record, never a `findOrCreateDonorCustomer`-created bookstore Customer (those live on the connected account, a structurally separate Stripe Customer namespace, and are never touched by this feature). Never an AGAPAY Learn household Customer (§8) — Learn exemption isn't in scope per the spec ("do not apply an AGAPAY subscription exemption to bookstore purchasers or donors" extends naturally to Learn households too, which are not parishes at all).

**Metadata:** add `metadata[agapay_tax_exemption_id]` when calling the update, so the Stripe Dashboard itself shows a breadcrumb back to the local record for manual investigation.

**Idempotency:** Stripe's idempotency-key header (`Idempotency-Key`) should be added to `stripeFormRequest`/equivalent for this specific call — none of the existing helpers currently pass one (checked: no `Idempotency-Key` usage anywhere in `stripe-connect.js`), so this is a new but low-risk addition scoped to just the new tax-exempt-sync helper rather than a blanket change to every existing Stripe call (which would be a larger, riskier change outside this feature's scope).

**Failure/timeout handling:** if the fetch itself throws or times out with an ambiguous result (network error, not a clean 4xx/5xx from Stripe), treat it as failure for the purposes of the D1 state machine (§5) — don't assume success. A subsequent retry, using the same idempotency key, is safe even if the first attempt actually did succeed on Stripe's side, since Stripe will simply return the same result for a repeated idempotency key rather than double-processing.

**Handling a Customer already exempt outside AGAPAY, or missing entirely:** before writing, `GET /v1/customers/{id}` and check current `tax_exempt` — if it's already `exempt` for a reason unrelated to this workflow, don't silently overwrite without at least logging that the pre-existing value differed (helps catch a parish that was manually marked exempt in the Stripe Dashboard directly, outside this review flow, which the audit log should be able to surface as an anomaly). If the Customer id on the registration doesn't resolve (404 from Stripe — deleted or never actually created), fail closed: don't approve locally, surface a clear "Stripe Customer not found" error in the admin UI requiring manual resolution (matches the "avoid marking the customer exempt if the Stripe update fails" requirement).

**Effect on existing subscriptions/invoices:** Stripe's `automatic_tax` recalculates tax on the **next** invoice/checkout generated after the Customer's `tax_exempt` changes — it does not retroactively touch already-finalized or already-paid invoices, and does not automatically issue credits/refunds for tax already charged on past invoices. This is exactly the "do not promise retroactive tax refunds" behavior the assignment requires, and it happens automatically (no special code needed to *prevent* retroactivity — Stripe simply doesn't do it). If a parish requests a refund of previously-charged tax after a late-approved exemption, that's a manual decision: **[LEGAL REVIEW / ADMIN REVIEW]** — outside any automated code path.

---

## 7. Product tax-code configuration

**Exact line-item creation sites to update (confirmed by direct inspection):**
- `src/lib/subscription-checkout.js`, inside `createSubscriptionCheckoutForRegistration` — the `line_items[0][price_data][product_data]` block (~line 84), used for both Giving and Parish+ tiers (`tier.id` distinguishes them).
- `src/learn/billing.js`, inside `learnBillingCheckout` — the `line_items[0][price_data][product_data]` block (~line 331).
- `src/handlers/stewardship.js` — **two** separate checkout-session-creation call sites (~line 1854 and ~line 2121) that both use a pre-existing Stripe `price` id (`STEWARDSHIP_STRIPE_PRICE_MONTHLY`/`_ANNUAL`) rather than inline `price_data`, meaning the tax code for Stewardship needs to be set **on the Stripe Product itself** (via the Stripe Dashboard or a one-time `POST /v1/products/{id}` update), not passed per-checkout the way Giving/Parish+/Learn can, since Stripe doesn't accept `tax_code` alongside a `price` reference — only alongside `price_data`.

**Proposed structure** — new exported constant, recommend placing it in `src/lib/subscription-checkout.js` (or a new tiny `src/lib/tax-codes.js` shared by all three call sites, which is cleaner since Learn and Stewardship live outside `subscription-checkout.js`):

```js
// src/lib/tax-codes.js
export const SUBSCRIPTION_TAX_CODES = {
  giving: "",      // Phase 3: final value pending CPA/tax-adviser sign-off
  parishPlus: "",  // Phase 3: final value pending CPA/tax-adviser sign-off
  learn: "",       // Phase 3: flagged for separate classification review — Learn sells curriculum-planning software to individual families, a different customer/product relationship than a parish subscription
  stewardship: ""  // Phase 3: set directly on the Stripe Product (see above), this entry exists for documentation/consistency even though it isn't passed per-checkout
};
```

**Fail-safe behavior:** if a required code is empty/missing at checkout-creation time, **do not block checkout** (that would take down live billing over a configuration gap) — log a structured warning (parish/product/tier, never any customer PII) and proceed without `tax_code` on that line item exactly as today, so this is a strictly additive change with a soft-fail path, not a new hard dependency.

**Bundles/add-ons/trials/discounts:** none of the three checkout paths currently support multi-line-item bundles (each is single-line-item `mode: "subscription"`) — so no per-item mixed-taxability concern exists yet. If a future bundle combines products with different correct tax codes, each `line_items[N]` needs its own `product_data[tax_code]`, which this same constant/lookup approach supports without further redesign. Trials (`subscription_data[trial_period_days]`, already used by Stewardship) and discounts (Learn's `allow_promotion_codes`) don't interact with tax-code assignment — Stripe Tax computes based on the product's tax code and price, independent of trial/discount mechanics.

**Where codes live:** recommend passing `tax_code` through `product_data` at checkout time for Giving/Parish+/Learn (consistent with how `tax_behavior` is already set inline for Giving/Parish+ today), and — for Stewardship specifically, since it references a persistent `price` id rather than inline `price_data` — setting the code once on the underlying Stripe Product object directly (a one-time manual or scripted update, not a per-checkout code path).

**Deployment checklist (Phase 3 gate):** final `SUBSCRIPTION_TAX_CODES` values must be reviewed and approved by AGAPAY's CPA/tax adviser before being set to non-empty in production — until then, all four entries stay empty strings (soft-fail, no functional change from today's behavior) even after the code ships.

---

## 8. Learn persisted Stripe Customer plan

**Table to extend:** `learn_households` (`migrations/0003_agapay_learn_phase1.sql`) — add columns via `ALTER TABLE learn_households ADD COLUMN`:

```
stripe_customer_id           TEXT
stripe_customer_created_at   TEXT
stripe_subscription_id       TEXT
stripe_subscription_status   TEXT
last_stripe_sync_at          TEXT
```

(Alternative considered and rejected: storing these only inside the existing `data` JSON blob — rejected because webhook correlation and admin lookups need an indexed column, matching why `registrations` promotes `stripe_account_id` rather than leaving it buried in JSON.)

**Creation flow change in `src/learn/billing.js`:** before building the checkout form, look up `learn_households` by the deterministic `id` (`learnBillingIdentityFromEmail`); if `stripe_customer_id` is already set, pass `customer: stripe_customer_id` to the checkout session (replacing today's bare `customer_email`); if not set, create the Customer first (`POST /v1/customers` with `email`, `metadata[agapay_household_id]`, `metadata[agapay_product]="learn"`), persist the new id + `stripe_customer_created_at` back onto the `learn_households` row, then use it in checkout. This mirrors exactly the existing "create-once, reuse" pattern already used for `registration.stripeCustomerId` in `subscription-checkout.js` — no new architectural idea, just applying the existing pattern to Learn.

**Existing subscribers / migration:** since Learn currently uses `customer_email`-only checkout, existing Learn subscribers may already have one or more Stripe Customer objects with no local record of the id. Backfill plan: a one-time script that lists Stripe Customers with `metadata[product]="learn"` (already set today per `learn/billing.js`'s `params.set("metadata[product]", "learn")`... actually confirm this is on the Customer vs. just the Checkout Session/Subscription metadata — Phase 3 should verify) or, more reliably, matches by email against `learn_households`, and backfills `stripe_customer_id` for any household with exactly one matching Customer; households with duplicate/ambiguous Customers get flagged for manual review rather than an automated guess.

**Duplicate Customer handling going forward:** once the lookup-by-`learn_households.stripe_customer_id` path is live, duplicates stop accumulating for new checkouts; for the backfill period, any household that already has 2+ Stripe Customers just needs one designated as canonical (manual pick, doesn't require merging Stripe objects).

**Webhook matching:** extend the existing webhook dispatch in `src/handlers/stripe.js` with a case that, for Learn-relevant events (`customer.subscription.updated`, `invoice.payment_succeeded` when `metadata.product === "learn"`), looks up `learn_households` by `stripe_customer_id` or `stripe_subscription_id` and updates `stripe_subscription_status`/`last_stripe_sync_at` — same shape as the existing `findRegistrationByStripeSubscriptionId` helper, just against the Learn table instead.

**Email changes:** since the Customer is now keyed by the immutable `learn_households.id` (derived from the email **at household-creation time**, not re-derived on every checkout), a household's email can change without losing the Stripe Customer link — update the Stripe Customer's `email` field via `POST /v1/customers/{id}` when the household's contact email changes, rather than creating a new Customer.

**Multiple adults in one household / household ownership changes:** out of scope for this billing-identity fix specifically — the household model (`learn_households`) already represents the billing unit; which individual adult manages it is a separate access-control concern already handled (or not) by however Learn currently authenticates household members, untouched by this plan.

**Account deletion / subscription cancellation:** on cancellation, update `stripe_subscription_status` via webhook as above; don't delete the Stripe Customer itself (Stripe Customers are typically retained for historical invoice access) — this is a data-retention/deletion policy question or beyond this plan's payment-architecture scope.

**Stripe Customer Portal compatibility:** since the Customer now persists and is reusable, turning on the Stripe Customer Portal in the future (not in scope today — no Portal integration exists in the repo) would work without further identity changes.

**Rollout without breaking current checkout:** ship the `learn_households` column additions and the lookup-before-create logic together; until backfill runs, households with no `stripe_customer_id` simply go through the create-once path on their next checkout exactly as new households would — no behavior change for anyone mid-flow, no risk to current checkout uptime.

---

## 9. Parish+ seller identity and commerce-readiness plan

**No change to `handleDonorBookstore`'s direct-charge model** — this section only adds a readiness gate in front of the existing `resolveDonorBookstoreParish` check in `src/handlers/donor.js` (currently: `hasStewardshipAccess(registration) && registration.bookstoreEnabled !== false`).

**Proposed readiness checks**, each a discrete boolean derived from existing or new data:

| Check | Source |
|---|---|
| Connected account exists | `registration.stripeAccountId` present |
| `charges_enabled` | `registration.stripeChargesEnabled` (already tracked via `account.updated` webhook handling in `stripe.js`) |
| `payouts_enabled` | `registration.stripePayoutsEnabled` (same) |
| Details submitted | `registration.stripeDetailsSubmitted` (same) |
| Seller legal name | new `registration.commerceSellerLegalName` field (parish-entered, distinct from `parishName` which is the AGAPAY-facing display name) |
| Seller display name | new `registration.commerceSellerDisplayName` (defaults to `parishName` if unset) |
| Bookstore support email | new `registration.commerceSupportEmail` |
| Bookstore operating address | reuse existing registration address fields unless the parish indicates a different commerce-specific address (new optional override fields) |
| Refund policy | new `registration.commerceRefundPolicyText` (free text or a short structured policy) |
| Fulfillment/pickup policy | new `registration.commerceFulfillmentPolicyText` |
| Tax-responsibility acknowledgment | new boolean `registration.commerceTaxResponsibilityAcknowledged` + timestamp |
| Merchant-of-record acknowledgment | new boolean `registration.commerceMerchantOfRecordAcknowledged` + timestamp, tied to the specific terms language in §10 |
| Statement-descriptor readiness | derived: `stripeDetailsSubmitted && stripeChargesEnabled` (Stripe requires a complete account before a custom descriptor reliably shows) |
| Connected-account Stripe Tax readiness | cannot be verified programmatically from the platform side in general (Stripe doesn't expose "has this connected account configured Stripe Tax registrations" via a simple flag on the Account object in all cases) — **recommend this be a parish self-attestation checkbox** ("I have configured tax collection for my bookstore, or I acknowledge none is configured and I am responsible for determining if that's compliant") rather than a system-verified check, and label this explicitly as parish-attested, not AGAPAY-verified |
| Parish-specific terms accepted | new boolean + timestamp, versioned (store which terms version was accepted, so future terms updates can be tracked per parish) |

**What happens when automatic tax is enabled but the connected account has no tax registration:** Stripe Tax will simply calculate $0 tax for jurisdictions where the connected account has no active registration — it does not warn the customer or the parish, and it does not register/file/remit on the parish's behalf regardless of registration status. The readiness UI and the self-attestation checkbox above exist specifically to make sure the parish understands this rather than assuming Stripe "handles" their tax obligations end-to-end.

**Seller disclosure copy** (from spec) — placement plan:
- Storefront/product list header (existing `public/myagapay/bookstore` — need to confirm exact file path in Phase 3)
- Cart summary
- Checkout handoff screen (the last AGAPAY-controlled screen before redirecting to the Stripe-hosted Checkout Session)
- Order confirmation page
- Receipt email (via `sendEmail`/`agapayEmailHtml`, a new template variant)
- Refund communication (same email system)

**Readiness-status UI:** a parish-facing panel in the Parish+/Bookstore settings tab listing each unmet requirement from the table above with a plain-language description and a direct link/action to complete it — bookstore checkout stays gated (`resolved.available = false`, reusing the existing pattern in `resolveDonorBookstoreParish`) until all required items are satisfied, with clear messaging distinct from today's generic "hasn't turned on Bookstore Payments yet" error.

---

## 10. Terms and disclosure plan

**Pages to update:** `public/terms.html` (primary — currently has zero merchant-of-record/seller language per Phase 1 findings), `public/register.html` (new exemption section's own explanatory copy, already covered in §3), and a new parish-commerce-specific terms addendum (could be a new section within `terms.html` or a separate `public/commerce-terms.html` linked from the Parish+ commerce readiness/acknowledgment flow in §9 — recommend a distinct addendum since the audience and acceptance moment differ from the general site terms).

**Outline only** (not final legal language — every bullet below is **[LEGAL REVIEW]**):

- The parish is the seller and merchant of record for all Parish+ commerce/bookstore transactions.
- The parish controls product descriptions, pricing, and inventory.
- The parish owns the merchandise and is responsible for fulfillment.
- The parish handles returns, refunds, and customer service for commerce transactions.
- The parish is responsible for determining the taxability of its own products and for its own tax registration, collection, filing, and remittance.
- AGAPAY provides software and payment-processing infrastructure only for Parish+ commerce; AGAPAY does not purchase goods from the parish for resale and does not take ownership of merchandise at any point.
- Stripe (or another processor) may calculate estimated tax based on information and configuration supplied by the parish; the parish remains responsible for reviewing the accuracy of that calculation and for its own compliance obligations regardless of what any automated calculation shows.
- For AGAPAY subscription billing (Giving, Parish+, Learn), AGAPAY is the seller; sales tax exemption is available only upon submission and AGAPAY approval of appropriate documentation, is not automatic, and does not apply to donations, bookstore transactions, or any purchase made by a parish's own customers.
- Donations processed through AGAPAY Giving are not purchases of software and are not taxed; AGAPAY does not take ownership of donated funds, which are processed through Stripe to the parish's own connected account.

Per the assignment's legal-framing instruction, the terms outline (and any Phase 3 draft language) should include, verbatim or near-verbatim: *"The direct-charge architecture supports the intended position that the parish is the seller and merchant of record, but legal marketplace-facilitator classification depends on applicable state law and AGAPAY's actual role in listing, checkout, payment orchestration, receipts, customer interaction, and transaction control."* — this belongs in an internal compliance note (not customer-facing terms copy) so Joel's attorney has it front-and-center when reviewing.

---

## Phase 2 close-out

This plan touches no production code, no Stripe objects, no R2 buckets, and no `wrangler.toml` changes — everything above is a specification for Phase 3. Two things need Joel's explicit decision before Phase 3 implementation begins:

1. **The two-Stripe-Customer-per-parish problem** (Giving/Parish+'s `stripeCustomerId` vs. Stewardship's separate `stewardshipStripeCustomerId`) — confirm the plan to sync exemption to both is correct, or whether Stewardship's customer should eventually be consolidated (a separate, larger change outside this feature's scope).
2. **Replacement-required grace period** — confirmed default recommendation is *no* grace period (exemption stops applying immediately when replacement is requested); flag if a grace period is actually wanted.

Ready to proceed to Phase 3 on your go-ahead, or happy to adjust any section above first.
