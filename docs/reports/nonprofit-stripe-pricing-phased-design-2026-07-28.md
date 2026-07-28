# AGAPAY Nonprofit Stripe Pricing — Phased Design Strategy

**Date:** 2026-07-28  
**Status:** Proposed design; no production behavior changes  
**Primary owner:** AGAPAY payments/platform  
**External decision-maker:** Stripe, per parish connected account

## Stripe policy response received

Stripe Support confirmed on 2026-07-28:

- Each AGAPAY **Standard** connected account can apply separately for nonprofit pricing.
- The connected account owner must be logged into that parish’s Stripe account and contact Stripe directly.
- AGAPAY cannot submit or coordinate the request on behalf of a Standard connected account.
- Stripe’s specialist review team will notify the connected account after nonprofit pricing has been applied.

Stripe Support did not confirm the measurement period, direct-charge coverage, covered card brands/origins, or an API-based verification method. AGAPAY therefore records those fields as unresolved and does not infer approval from an attestation or uploaded nonprofit document.

## Executive decision

AGAPAY should build a **Nonprofit Pricing Readiness** workflow for each parish, not a global “nonprofit rate” switch.

AGAPAY creates a separate Stripe Standard connected account for each parish and makes donation charges directly on that account. Stripe therefore bills processing fees to the parish’s connected account and must approve nonprofit pricing for that account. AGAPAY can:

1. measure and explain apparent eligibility;
2. collect an attestation and supporting documents securely;
3. generate an application packet and guide the parish through Stripe Support;
4. record Stripe’s approval;
5. apply the approved rate to donor-facing fee estimates; and
6. verify and monitor the actual fees reported by Stripe.

AGAPAY cannot grant the discount, represent that a parish is approved before Stripe approves it, or safely infer approval from nonprofit documentation alone.

The proposed implementation is divided into seven phases. **Phase 1, payment-fee correctness, is a release prerequisite for every later phase.**

## Source and architecture basis

Stripe’s current published requirements say that an eligible account must:

- be a registered nonprofit in a supported region;
- use the Stripe account primarily for tax-deductible donations;
- have at least 80% of Stripe payment volume from tax-deductible donations; and
- contact Stripe Support from the account that needs the discount, providing the account ID, registered email, donation-volume confirmation, tax registration information, and tax-exempt documentation.

Stripe expressly identifies membership fees, tuition, ticket sales, registration fees, and auction payments as non-qualifying volume. Stripe also states that nonprofit pricing is intended for accounts used primarily for donations rather than product or ticket sales.

References, retrieved 2026-07-28:

- Stripe nonprofit requirements: https://support.stripe.com/questions/fee-discount-for-nonprofit-organizations
- Stripe Standard connected accounts: https://docs.stripe.com/connect/accounts
- Stripe direct-charge fee responsibility: https://docs.stripe.com/connect/direct-charges-fee-payer-behavior
- Stripe ACH Direct Debit behavior: https://docs.stripe.com/payments/ach-direct-debit
- Stripe pricing: https://stripe.com/pricing

AGAPAY’s relevant current architecture:

- `src/handlers/stripe.js` creates `type: "standard"` accounts with `business_type: "non_profit"`.
- `src/handlers/parish.js` creates donation Checkout Sessions on the parish connected account using the `Stripe-Account` header.
- AGAPAY intentionally does not collect an application fee on donations.
- `src/handlers/parish.js`, `src/lib/stripe-connect.js`, and `public/give/form.html` duplicate fee-estimation logic.
- The current ACH estimate is `2.6% + 30¢`, while the checkout requests `us_bank_account`. Stripe publishes standard ACH Direct Debit pricing as `0.8%`, capped at `$5`; `2.6% + 30¢` is associated with Instant Bank Payments, a different product.
- `migrations/0011_tax_exemptions.sql` and the related Worker/R2 code implement **AGAPAY subscription sales-tax exemption**, not nonprofit payment-processing eligibility. That workflow is a useful security and operational pattern but must remain a separate legal record.

## Non-negotiable design invariants

1. **Stripe is authoritative.** AGAPAY records and verifies Stripe’s decision; it does not issue nonprofit pricing.
2. **Actual fees are authoritative.** Stripe balance transactions override every estimate in reports, accounting, and reconciliation.
3. **Eligibility and pricing are separate.** A parish can appear eligible without being approved, and an approved rate can differ from AGAPAY’s current assumptions.
4. **The fee schedule is data, not a scattered constant.** Rate, fixed fee, cap, payment method, effective date, source, and verification state must be modeled explicitly.
5. **Unknown payment volume is not presumed to be a donation.** It belongs in the denominator but not the eligible-donation numerator until classified.
6. **Tax documents are private.** They are never public R2 objects, never embedded in logs, and never returned through ordinary parish or admin list endpoints.
7. **Sales-tax exemption records are not reused as nonprofit-pricing approval.** The same IRS letter may support both processes, but the claims, statuses, approvals, and audit trails remain independent.
8. **No account splitting to manufacture eligibility.** A second Stripe account for commerce may be considered only after Stripe, accounting, and legal review confirm it reflects a legitimate operational structure.

## Target state

The Parish Dashboard displays one plain-language workflow:

> **Stripe nonprofit pricing**  
> AGAPAY estimates that 92.4% of this account’s classified payment volume is tax-deductible donations. Stripe makes the final eligibility and pricing decision.

The workflow then shows:

- connected Stripe account;
- measurement period and coverage;
- eligible donation volume, non-qualifying volume, and unclassified volume;
- required nonprofit documents;
- parish attestation;
- generated application statement;
- Stripe submission status;
- approval evidence and effective date;
- current estimated card and ACH pricing;
- live verification status; and
- warnings when volume mix or actual fees no longer match the recorded approval.

The donor-facing checkout only receives a safe, server-resolved fee estimate. It does not know about EINs, documents, application status, or internal eligibility calculations.

## Phase map

| Phase | Outcome | Production behavior affected? | Exit gate |
|---|---|---:|---|
| 0 | Stripe policy and account-model confirmation | No | Written Stripe answers recorded |
| 1 | Correct, centralized payment-fee estimation and ACH lifecycle | Yes | Fee and webhook test matrix passes |
| 2 | Conservative donation-volume measurement | Read-only | Coverage and classification reconciliation passes |
| 3 | Secure application records, documents, and audit trail | Additive | Security review and state-machine tests pass |
| 4 | Parish application assistant and admin review | Additive | Pilot packet accepted operationally |
| 5 | Approval activation and live fee verification | Yes, gated | Approved pilot fee matches Stripe |
| 6 | Monitoring, alerts, and annual re-attestation | Additive | Alerting runbook exercised |
| 7 | Optional recurring ACH expansion | Optional | Separate ACH risk/readiness gate passes |

---

## Phase 0 — Confirm Stripe policy before encoding it

### Purpose

Resolve policy details that Stripe’s public support article does not fully specify and prevent AGAPAY from baking assumptions into schema or UI copy.

### Questions for Stripe

AGAPAY should contact Stripe as the Connect platform and preserve the response in an internal policy record:

1. Must every AGAPAY Standard connected account apply separately?
2. Can AGAPAY assist or submit evidence on behalf of a connected account, or must the parish account owner always submit?
3. What measurement window does Stripe use for the 80% test: trailing 30/90/365 days, year-to-date, lifetime, or another period?
4. How does Stripe treat a newly created account without historical volume?
5. Which card brands, card origins, and donation transaction types receive the quoted discounted rate?
6. Does Stripe expose the assigned processing plan or rate through any API available to a Connect platform?
7. Does approval apply only prospectively?
8. What happens if an approved account’s non-donation volume later exceeds 20%?
9. Can an account process limited bookstore/commerce volume while retaining nonprofit pricing, provided the account remains above the threshold?
10. Does Stripe require periodic re-attestation or updated nonprofit documentation?

### Deliverables

- `docs/payments/stripe-nonprofit-policy.md` with the support case ID, response date, direct answers, and reviewed copy.
- A versioned `policy_version` identifier used by later attestations.
- Confirmed language for the parish-generated donation-volume statement.
- Confirmed initial rate schedule. Treat `2.2% + 30¢` as a proposed/default value until Stripe confirms it for AGAPAY’s account configuration.

### Exit criteria

- Product, engineering, and operations agree on the Stripe-confirmed policy.
- No unresolved answer would materially change the data model or approval flow.

---

## Phase 1 — Payment-fee correctness foundation

### Purpose

Correct current fee assumptions and eliminate duplicated browser/server calculations before adding parish-specific pricing.

### 1.1 Create one canonical fee engine

Add a shared server module, recommended:

`src/lib/payment-fees.js`

The module should model:

```text
payment_method
rate_basis_points
fixed_fee_cents
maximum_fee_cents
effective_from
effective_until
schedule_source
verification_status
```

Required functions:

- `estimateProcessingFeeCents(chargeCents, schedule)`
- `grossUpToNetCents(netCents, schedule)`
- `resolveParishFeeSchedule(env, parishId, paymentMethod, at)`
- `feeEstimateDisclosure(schedule)`

All arithmetic must use integer cents. Gross-up must solve against the fee on the **grossed-up charge**, including caps, rather than adding a fee calculated on the original gift.

### 1.2 Remove duplicate constants

Replace fee math in:

- `src/handlers/parish.js`
- `src/lib/stripe-connect.js`
- `public/give/form.html`

The browser should consume a server-returned fee quote or a public, non-sensitive resolved schedule. The server must recompute and remain authoritative when checkout is created.

### 1.3 Correct ACH product identification

For `payment_method_types[0]=us_bank_account`:

- use the current Stripe ACH Direct Debit schedule, including the `$5` cap;
- label the method “ACH Direct Debit,” not the generic “bank transfer” or “Instant Bank Payment”;
- state that settlement is delayed;
- confirm whether Financial Connections verification creates any separately billable cost for AGAPAY’s actual configuration; and
- record the chosen settlement option because faster settlement may have different pricing.

### 1.4 Audit delayed-payment behavior

ACH Direct Debit can take several business days to succeed or fail. Before promoting ACH:

- confirm `checkout.session.completed` does not cause a gift to be treated as paid;
- treat `payment_intent.processing` as pending;
- post giving and send a tax receipt only after `payment_intent.succeeded` or the appropriate async-success event;
- handle `checkout.session.async_payment_failed`, late failures, refunds, and final ACH disputes;
- confirm idempotency across overlapping Checkout, PaymentIntent, and invoice events; and
- verify accounting entries are not posted twice.

### 1.5 Make estimates honest

Donor copy should say “estimated processing cost.” Card brand, international-card surcharges, negotiated rates, and other Stripe charges can make the actual fee differ.

### Tests

- Table tests for standard card, nonprofit candidate card, capped ACH, zero/invalid amounts, and cap boundaries.
- Property test: grossed-up charge less estimated fee is never below the requested net.
- Frontend/server parity tests.
- Stripe test-mode one-time card and ACH lifecycle tests.
- Webhook reordering and replay tests.
- Accounting reconciliation test using actual balance-transaction fees.

### Exit criteria

- There is one fee engine.
- The browser has no independent rate constants.
- ACH estimates match the configured Stripe product.
- Delayed ACH never produces an early donation receipt or ledger posting.
- Existing card checkout remains unchanged except for more accurate gross-up.

---

## Phase 2 — Donation-volume classification and eligibility measurement

### Purpose

Produce a conservative, explainable calculation of the account’s qualifying donation percentage.

### 2.1 Classification model

Every successful connected-account payment belongs to one of:

- `qualifying_donation`
- `nonqualifying_membership`
- `nonqualifying_tuition`
- `nonqualifying_ticket`
- `nonqualifying_registration`
- `nonqualifying_auction`
- `nonqualifying_commerce`
- `nonqualifying_other`
- `unclassified`

AGAPAY-originated donation payments should carry a versioned field such as:

```text
metadata[agapay_payment_class]=qualifying_donation
metadata[agapay_classification_version]=1
```

Bookstore and future commerce flows must set the appropriate non-qualifying class. Existing `gift_type`, `commerce_module`, settlement-profile, and local-record relationships can support historical classification.

### 2.2 Conservative ratio

For a period:

```text
eligible_ratio =
  qualifying_donation_volume
  / total_successful_payment_volume
```

Rules:

- Refunds reduce the original class’s net volume.
- Disputes and reversals are reported separately and follow the Stripe-confirmed policy.
- Unclassified payments remain in total volume but not qualifying volume.
- Payments made outside AGAPAY on the same Stripe account must still be discovered and classified or remain unclassified.
- Do not use local `donor_offerings` alone as the denominator; Stripe account volume is the requirement.

### 2.3 Measurement storage

Recommended tables:

```text
nonprofit_pricing_volume_snapshots
nonprofit_pricing_payment_classifications
```

Snapshots store period boundaries, gross/net volumes, class totals, ratio, unclassified count, Stripe coverage cursor, calculation version, and calculation timestamp.

Payment classifications store only identifiers and classification evidence needed for audit; do not duplicate complete Stripe objects.

### 2.4 Scale and completeness

The current YTD Stripe charge listing stops after five 100-item pages. Eligibility calculations must not silently cap at 500 charges.

Use:

- webhooks for ongoing incremental classification;
- a cursor-based Stripe reconciliation job for historical/external activity;
- resumable progress in D1; and
- a completeness flag that prevents “ready to apply” until the entire selected period has been scanned.

### 2.5 UI behavior

Show:

- measurement window;
- last complete scan;
- classified donation volume;
- non-qualifying volume by type;
- unclassified volume;
- estimated ratio; and
- “Stripe makes the final determination.”

Use an operational buffer:

- `>= 85%`: apparently ready, subject to completeness and documentation;
- `80%–84.99%`: eligible by the published threshold but close to the boundary;
- `< 80%`: not currently ready;
- incomplete scan or material unclassified volume: indeterminate.

The buffer is an AGAPAY risk indicator, not a different Stripe eligibility rule.

### Exit criteria

- A production-like account reconciles to Stripe’s total volume for the selected period.
- Every amount in the ratio can be traced to a Stripe payment and classification rule.
- No capped pagination or incomplete scan can produce a “ready” state.

---

## Phase 3 — Secure nonprofit-pricing records and evidence

### Purpose

Build the legal/operational record independently of sales-tax exemption.

### 3.1 State machine

Recommended statuses:

```text
not_started
collecting_information
measurement_incomplete
below_threshold
ready_to_submit
submitted_to_stripe
stripe_approved
stripe_declined
activation_pending
active_verified
verification_mismatch
suspended
withdrawn
```

All transitions go through one service function with an allowlist and append-only audit entry.

### 3.2 Tables

Recommended D1 tables:

#### `nonprofit_pricing_applications`

- id
- registration reference and parish ID
- Stripe account ID
- status
- policy version
- measurement snapshot ID
- reported ratio
- measurement period
- attestation text version
- attested by/name/title/timestamp
- EIN last four only
- submitted timestamp
- Stripe support case ID
- Stripe decision timestamp
- effective date
- approved card rate basis points
- approved fixed fee cents
- approval scope/notes
- current pricing schedule ID
- created/updated timestamps

Do not persist the full EIN as an ordinary searchable field. The parish can enter it directly into Stripe’s authenticated form. If a document contains the EIN, protect it as private evidence.

#### `nonprofit_pricing_documents`

- random object key
- application ID
- document type (`irs_determination`, `tax_exempt_proof`, `stripe_approval`, `other`)
- sanitized filename
- MIME type, size, SHA-256
- uploader identity and timestamp
- current/replaced/deleted state

#### `nonprofit_pricing_fee_schedules`

- application/parish/account ID
- payment method
- percentage basis points
- fixed and capped fee cents
- effective dates
- source (`stripe_published`, `stripe_approval`, `manual_admin`)
- approval evidence link
- verification status
- activated/reverted timestamps

#### `nonprofit_pricing_verifications`

- schedule ID
- Stripe charge and balance-transaction IDs
- transaction eligibility facts
- expected fee
- actual fee
- variance
- result and timestamp

#### `nonprofit_pricing_audit_log`

Append-only events without document contents, full EINs, raw Stripe objects, tokens, or authorization headers.

### 3.3 R2 storage

Reuse the security behavior of `tax-exemption-storage.js`, but create a distinct binding and bucket such as:

```toml
[[r2_buckets]]
binding = "NONPROFIT_PRICING_DOCS"
bucket_name = "agapay-nonprofit-pricing-docs"
```

Requirements:

- no public `r2.dev` URL;
- authenticated Worker streaming only;
- random non-guessable object keys;
- allowlisted MIME types;
- size limits and magic-byte checks;
- sanitized download names;
- rate-limited uploads;
- parish access limited to its own application;
- admin access audited;
- replacement rather than destructive overwrite; and
- documented retention/deletion policy.

### 3.4 Feature flags

Recommended flags, default off:

```text
NONPROFIT_PRICING_WORKFLOW_ENABLED
NONPROFIT_PRICING_DOCUMENT_UPLOAD_ENABLED
NONPROFIT_PRICING_APPLICATION_UI_ENABLED
NONPROFIT_PRICING_RATE_ACTIVATION_ENABLED
NONPROFIT_PRICING_MONITORING_ENABLED
```

### Exit criteria

- Migration and state-machine tests pass.
- Cross-parish document access tests fail closed.
- Security review approves R2, audit, masking, and retention behavior.
- No fee behavior changes while activation remains disabled.

---

## Phase 4 — Parish application assistant and AGAPAY review

### Purpose

Turn the Stripe support process into a clear, low-friction parish workflow without impersonating Stripe or submitting external requests without authorization.

### Parish Dashboard

Add a Settings/Payments card with:

1. **Eligibility estimate** — ratio, window, completeness, and exclusions.
2. **Organization evidence** — upload IRS determination/tax-exempt documents.
3. **Attestation** — authorized representative confirms the displayed statement.
4. **Application packet** — account ID, registered email, measurement summary, and copyable statement.
5. **Open Stripe Support** — parish signs into the connected Standard account and submits.
6. **Submission tracking** — parish records submission date and support case ID.
7. **Decision tracking** — upload Stripe’s approval/decline response.

Suggested generated statement:

> Based on the measurement period shown above, at least 80% of this Stripe account’s payment volume is from tax-deductible donations. I am authorized to make this statement for the organization and understand that Stripe determines final eligibility.

Final wording must use the Stripe-confirmed measurement rule from Phase 0.

### AGAPAY admin

Add a queue for:

- ready for review;
- submitted, awaiting Stripe;
- approval evidence review;
- measurement incomplete;
- verification mismatch; and
- nearing/below threshold.

Admin review confirms packet completeness and records Stripe evidence. It does **not** approve nonprofit status on Stripe’s behalf.

### API shape

Recommended endpoints:

```text
GET  /api/parish/dashboard/:parishId/nonprofit-pricing
POST /api/parish/dashboard/:parishId/nonprofit-pricing/attest
POST /api/parish/dashboard/:parishId/nonprofit-pricing/documents
POST /api/parish/dashboard/:parishId/nonprofit-pricing/submitted
POST /api/parish/dashboard/:parishId/nonprofit-pricing/decision

GET  /api/admin/nonprofit-pricing
GET  /api/admin/nonprofit-pricing/:applicationId
POST /api/admin/nonprofit-pricing/:applicationId/review
POST /api/admin/nonprofit-pricing/:applicationId/record-approval
POST /api/admin/nonprofit-pricing/:applicationId/suspend
```

All parish routes use the existing parish-dashboard authentication boundary. All money-impacting admin transitions require admin context, rate limiting, idempotency, and audit logging.

### Pilot

Pilot with one parish that:

- has a fully active Stripe account;
- has a clearly donation-dominant volume mix;
- has no ambiguous external Stripe activity;
- can supply documents promptly; and
- agrees to share Stripe’s response and one subsequent eligible transaction for verification.

### Exit criteria

- The pilot parish can complete the packet without engineering assistance.
- Operations can distinguish AGAPAY readiness from Stripe approval.
- Stripe accepts the submission format or provides actionable corrections.

---

## Phase 5 — Approved-rate activation and live verification

### Purpose

Use the parish’s recorded Stripe approval for estimates, then verify the actual fee.

### Activation gates

A discounted card schedule can activate only when:

- Stripe account ID matches the application;
- approval evidence has been reviewed;
- approval includes an effective date or an unambiguous “active now” statement;
- rate and scope are recorded;
- the application is not suspended;
- the activation feature flag is enabled; and
- the change is audit logged.

No code path should derive `stripe_approved` merely from an IRS document, an AGAPAY tax-exemption approval, or an estimated ratio.

### Runtime behavior

`resolveParishFeeSchedule` chooses:

1. a currently effective, approved schedule for the parish/payment method; otherwise
2. the current published standard estimate.

The Checkout server recomputes the quote. Store on the offering:

- schedule ID/version;
- estimated fee;
- donor-covered amount;
- actual fee when available; and
- estimate/actual variance.

Reports and accounting always display/post actual Stripe fees once retrieved.

### Live verification

After an eligible domestic card donation:

1. retrieve its expanded balance transaction;
2. confirm card brand/origin and other fee-affecting facts;
3. compute the expected fee under the recorded approval;
4. compare expected and actual fees using a documented tolerance;
5. store the verification result; and
6. mark `active_verified` only after a valid match.

Do not use an Amex, international card, refunded payment, dispute, or transaction with other known surcharges as the sole verification sample unless Stripe’s approval explicitly covers it.

On material mismatch:

- mark `verification_mismatch`;
- alert operations;
- revert donor-facing estimates to the standard schedule unless operations documents a safe alternative; and
- preserve actual fees in all reports.

### Rollout

1. Shadow mode: resolve schedules and record what would have been quoted.
2. One approved pilot account.
3. Five-account cohort.
4. All approved accounts.

Use per-parish activation, not only a global flag.

### Exit criteria

- The pilot’s eligible transaction matches the approved schedule.
- Estimate/actual variance is explainable for non-eligible card types.
- Rollback to standard estimates is tested.
- No accounting journal depends on an estimate after an actual fee exists.

---

## Phase 6 — Ongoing monitoring and re-attestation

### Purpose

Keep AGAPAY’s guidance and estimates aligned with the parish’s current account use and Stripe’s actual pricing.

### Scheduled checks

Use the existing Worker cron infrastructure to:

- refresh rolling volume snapshots;
- identify incomplete Stripe scans;
- alert at ratio thresholds;
- detect material unclassified volume;
- sample actual-fee variance;
- identify approval/document review dates; and
- request re-attestation on the Stripe-confirmed cadence.

Recommended signals:

- warning below 85%;
- critical at or below 80%;
- warning when unclassified volume exceeds a defined materiality threshold;
- critical when repeated eligible transactions do not match the active schedule;
- warning when Stripe support evidence or policy version is stale.

These alerts should not silently alter Stripe’s account or claim that approval has ended. They control AGAPAY’s estimates and prompt human review.

### Operational reports

Per parish:

- current ratio and trend;
- qualifying/non-qualifying/unclassified mix;
- current estimate schedule;
- actual effective fee rate;
- total estimated savings;
- last successful verification;
- unresolved mismatches.

Platform-wide:

- applications by state;
- accounts ready to apply;
- accounts awaiting Stripe;
- active/verified accounts;
- accounts near the threshold;
- fee mismatches and scan failures.

### Exit criteria

- Alerts reach the configured operations channel.
- The runbook covers threshold decline, mismatched fees, changed Stripe policy, and document replacement.
- Annual or Stripe-required re-attestation can be completed without a schema change.

---

## Phase 7 — Optional recurring ACH expansion

### Purpose

Capture the largest processing savings for recurring gifts after the core workflow is stable.

AGAPAY currently forces recurring gifts to card. Stripe supports recurring ACH Direct Debit, but it introduces delayed success, reusable mandates, failure handling, final disputes, and donor-notification obligations.

Treat recurring ACH as a separate product release:

- Stripe-hosted mandate collection;
- subscription compatibility validation on Standard connected accounts;
- pending-state donor UX;
- mandate and microdeposit notifications;
- retry policy;
- final-dispute handling;
- receipt timing;
- accounting reversal behavior; and
- explicit parish risk disclosure.

Do not bundle this into nonprofit-pricing approval. ACH’s published rate is a payment-method price, not the nonprofit card discount.

### Exit criteria

- End-to-end test-mode subscription lifecycle passes.
- A pilot recurring ACH gift posts only after confirmed success.
- Failure, cancellation, mandate invalidation, and dispute runbooks are exercised.

## Security and privacy review checklist

- Full EIN never appears in list APIs, logs, analytics, email, or audit metadata.
- Documents remain in private R2 and are served only after fresh authorization.
- File type is verified from content, not filename alone.
- All downloads use safe content-disposition headers.
- Cross-parish object-key guessing yields no information.
- Admin document views are audit logged.
- Stripe support case IDs and approval records are treated as operationally sensitive.
- Public donation configuration exposes only the resolved schedule fields needed for an estimate.
- Attestation text is versioned and immutable after submission.
- Rate activation and suspension require high-trust authorization and idempotency.

## Test and release matrix

Each implementation phase adds focused tests to `npm run check`; it does not rely only on browser QA.

| Area | Required coverage |
|---|---|
| Fee math | cents, rounding, cap, gross-up, schedule effective dates |
| Classification | every AGAPAY payment source, refunds, disputes, external/unclassified |
| Completeness | pagination beyond 500 charges, resume cursor, webhook/reconciliation overlap |
| State machine | allowed/forbidden transitions, idempotency, concurrent updates |
| Documents | MIME/size/signature, replacement, cross-tenant access, audit |
| Approval | account mismatch, missing evidence, future/expired schedules |
| Verification | eligible sample, Amex/international exclusion, variance and rollback |
| ACH | processing/succeeded/failed, webhook reorder, duplicate event, dispute |
| Accounting | estimated-to-actual replacement, no duplicate posting |
| UI | parish/admin permissions, incomplete and error states, accessible disclosures |

## Implementation package sequence

Recommended pull-request boundaries:

1. **Fee engine and ACH correction**
2. **Webhook/payment-lifecycle hardening**
3. **Classification metadata and reconciliation snapshots**
4. **Nonprofit-pricing schema, service, audit, and feature flags**
5. **Private document storage and security tests**
6. **Parish application UI/API**
7. **Admin review UI/API**
8. **Approved schedule activation in shadow mode**
9. **Pilot activation and actual-fee verification**
10. **Monitoring, alerts, and operational reports**
11. **Optional recurring ACH**

Every package should be independently deployable with later behavior disabled by flags.

## Explicitly out of scope

- Automatically contacting Stripe or submitting documents without the parish’s direct authorization.
- Promising that every 501(c)(3) will receive a particular rate.
- Applying a discounted estimate to non-donation commerce.
- Reusing AGAPAY subscription sales-tax approval as Stripe nonprofit approval.
- Migrating Standard accounts to Express or Custom solely for this feature.
- Creating extra Stripe accounts solely to improve the donation-volume ratio.
- Treating estimated Stripe fees as final accounting data.
- Legal or tax advice about whether a particular payment is tax-deductible.

## Decisions required before implementation

1. Stripe’s answers to the Phase 0 policy questions.
2. Whether AGAPAY wants to store nonprofit documents itself or minimize custody by having parishes submit them only to Stripe. The design supports either; storing them enables an application packet and audit trail but increases privacy obligations.
3. The volume measurement periods shown to parishes before Stripe confirms its authoritative window.
4. Who may record Stripe approval: parish, AGAPAY admin, or parish submission followed by admin verification. Recommended: parish submits evidence; admin activates the schedule.
5. The initial pilot parish.
6. Whether Phase 7 recurring ACH belongs in the same roadmap or a later payments program.

## Recommended immediate next action

Begin Phase 0 and Phase 1 in parallel operationally:

- Open the Stripe Connect/platform support case and preserve the answers.
- Implement the centralized fee engine and correct ACH estimation/lifecycle behavior without waiting for nonprofit-policy answers.

Do not begin discounted-rate activation until Stripe confirms the Standard connected-account process and the pilot parish supplies explicit approval evidence.
