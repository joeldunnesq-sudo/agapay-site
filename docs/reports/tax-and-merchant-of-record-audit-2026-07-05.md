# AGAPAY Sales Tax & Merchant-of-Record Audit — Phase 1

Date: 2026-07-05
Scope: subscriptions (Giving/Parish+/Learn), donations, Parish+ Bookstore/Commerce, registration, D1 schema, file storage, terms.

This is a technical audit only. Items marked **[LEGAL REVIEW]** are not legal conclusions — they need sign-off from your attorney/CPA.

---

## 1. AGAPAY subscriptions (Giving / Parish+ / Learn)

**Files:** `src/lib/subscription-checkout.js` (`createSubscriptionCheckoutForRegistration`), `src/learn/billing.js` (`learnBillingCheckout`), `src/handlers/stewardship.js` (lines ~1854, ~2121).

| Question | Finding |
|---|---|
| Charge owner | Platform account. All three checkouts call `stripeFormRequest`/`stripePlatformPost` with **no** `Stripe-Account` header — correct, AGAPAY is seller of subscriptions. |
| Customer model | Parish+/Giving: one Stripe Customer per parish, created once and cached as `registration.stripeCustomerId` on the platform account. Learn: **no persisted Stripe Customer** — checkout uses `customer_email` only, so Stripe creates a new customer object per checkout with no metadata linking it back to a household. Stewardship: needs the same check (not yet traced line-by-line — flagging for Phase 2). |
| Address collection | Parish+/Giving: `billing_address_collection: required` + `customer_update[address]: auto` — full address collected and persisted to the Customer. Learn: **no explicit `billing_address_collection`** — Stripe Checkout will still collect what it needs for `automatic_tax`, but it's implicit rather than guaranteed, and there's no persisted address of record tied to a household. |
| Automatic tax | Enabled (`automatic_tax[enabled]: true`) on all three paths. |
| Product tax code | **Not set anywhere.** No `product_data[tax_code]` on any subscription line item (Giving/Parish+, Learn, or Stewardship). Stripe Tax will fall back to your account's default tax category, which for a mixed SaaS/subscription product is a real risk of miscategorization (e.g., being treated as a different taxability class than intended). This should be an explicit, documented tax code per product. |
| Tax exemption | **Does not exist.** `grep -rn "tax_exempt\|exemption"` across the entire repo returns zero matches. There is no field, no Stripe Customer `tax_exempt` update, no UI. This is a full build, not a fix. |
| Hard-coded rates | None found — tax is entirely delegated to Stripe Tax via `automatic_tax`, which is correct. |

**Conclusion:** subscription charge ownership and address collection for Giving/Parish+ are already aligned with the intended model. Two real gaps: (1) no product tax codes anywhere, (2) Learn checkout doesn't use a persisted, metadata-linked Customer, which matters once exemption needs to attach to "the correct Stripe Customer used for AGAPAY subscription billing" — Learn is a household-level product, not a parish-level one, so a parish's subscription exemption should never apply to it, and today there isn't even a stable customer to accidentally misapply it to.

---

## 2. Donations

**Files:** `src/handlers/donor.js` (donation checkout, separate from bookstore — not yet exhaustively re-quoted here since Phase 1 focus was tax/fee correctness), webhook handlers in `src/handlers/stripe.js`.

No `automatic_tax` call was found on the donation checkout path (only on bookstore and subscription paths). No sales tax is added to donations. This matches the intended model — donations are not taxed. AGAPAY does not take custody: donation charges use `on_behalf_of`/`Stripe-Account` against the parish's connected account (see `stripe-connect.js` — `stripeGetConnectedRequest`/`stripeFormConnectedRequest` used throughout the giving flow), so funds land with the parish, not AGAPAY.

**[LEGAL REVIEW]** Confirming AGAPAY never has ownership of donation funds, even momentarily, is a legal characterization question, not just a code question — flag for your attorney given AGAPAY does collect an `application_fee_amount` on some donation charges (per `stripe-connect.js` `summarizeCharges`, `agapayFeeCents` is read from `charge.application_fee_amount`). A platform fee on a direct charge is standard and doesn't make AGAPAY the recipient of the donation itself, but the exact framing in your terms/receipts should say so explicitly.

---

## 3. Parish+ Bookstore / Commerce

**File:** `src/handlers/donor.js`, function `handleDonorBookstore` (checkout creation ~line 1313–1420). Schema: `migrations/0009_parish_commerce.sql`.

Direct answers to the 12 merchant-of-record questions:

1. **Direct charge on connected account?** Yes — `stripeFormConnectedRequest(env, "/v1/checkout/sessions", form, resolved.registration.stripeAccountId)` creates the Checkout Session (and its PaymentIntent) *on* the parish's connected account via the `Stripe-Account` header.
2. **Destination charges / separate charges & transfers used anywhere?** Not for bookstore. No `transfer_data[destination]` or separate-charge-then-transfer pattern found in this handler.
3. **Is AGAPAY's platform account the charge owner?** No — the parish's connected account is.
4. **Application fee collected?** No. There's no `payment_intent_data[application_fee_amount]` in this form, and the code has an explicit comment: *"Do not add any AGAPAY platform/application fee to bookstore or future commerce checkouts."*
5. **Which account appears on the PaymentIntent?** The parish's connected account (it's a direct charge, so the PaymentIntent lives on that account).
6/7/8. **Refunds / disputes / negative balances?** Land on the connected account by default for direct charges. Webhook handling (`charge.refunded`, `charge.dispute.created`, `charge.dispute.closed` in `stripe.js`) updates AGAPAY's own order/donor records for visibility but doesn't re-route liability — Stripe already assigns it to the connected account.
9. **Whose business identity on receipts?** `on_behalf_of` is set to the parish's account, which is what drives the parish's business name/statement descriptor to appear (subject to the parish having completed the relevant Stripe onboarding fields — this depends on their account being fully verified, which is a per-parish operational risk, not a code defect).
10. **Whose Stripe Tax registrations?** Because this is a direct charge with the Checkout Session created *in the context of* the connected account (via `Stripe-Account` header), Stripe Tax evaluates using the **parish's own** tax registrations, not AGAPAY's. Correct per the intended model.
11. **Could this read as AGAPAY being a marketplace provider?** Structurally, no — no fee, no platform-account charge, tax computed on the connected account. **[LEGAL REVIEW]**: several states' marketplace-facilitator statutes look past fee/ownership and at *who controls checkout, sets prices, or processes payment* — since AGAPAY's software still presents the entire cart/checkout UI, this is a facts-and-circumstances legal question your attorney should evaluate even though the technical fee/charge-ownership signals are clean.
12. **Changes that would strengthen the "parish is seller" position:** (a) parish name/logo visibly displayed at bookstore checkout, not just AGAPAY's; (b) parish-specific terms accepted at bookstore checkout; (c) explicit terms language (see §7) naming the parish as merchant of record; (d) confirm `on_behalf_of` requirement is actually satisfied by parish account completeness before enabling bookstore for that parish.

**Bottom line:** the bookstore payment architecture already matches your intended model well — this is *not* one of the "material payment architecture changes" the assignment warns about. No charge-model change is needed. Note: an earlier note in my own memory said bookstore charges 5%+$0.30 like donations — that's now confirmed **stale**; the current code explicitly does not fee bookstore transactions.

---

## 4. Registration & address collection

**File:** `public/register.html`, submission handlers in `src/handlers/*registrations*` / `lib/registrations.js`.

Full street address, city, state, ZIP are already required fields on the registration form and validated client-side before submit. No country field currently (implicitly US-only — state dropdown is US states + DC). No exemption section exists yet.

**Schema:** the entity is table `registrations` (migration `0001_production_records.sql`), primary key `reference`, with a few promoted/indexed columns (`stripe_account_id`, `parish_id`, `status`, etc.) and the bulk of fields in a JSON blob column `data`. This is your "organizations" table in the spec's terms. New exemption fields should follow the existing pattern: add to the JS registration object (serialized into `data`) plus promote `tax_exemption_status` and `tax_exemption_expiration_date` (at minimum) as real indexed columns, since admin review needs to filter/sort on those.

---

## 5. File upload / storage infrastructure

**Result: none exists today.** No `multipart`/`FormData` file-upload handling anywhere in `src/`. One R2 bucket is bound (`CAMPAIGN_ASSETS`, wrangler.toml) but it is a **public** bucket with a public `r2.dev` URL (`CAMPAIGN_ASSETS_URL`) used for campaign image assets — not suitable for exemption documents. A new, non-public R2 bucket plus a signed-URL access pattern needs to be built from scratch (Phase 2 will lay this out).

---

## 6. Admin review workflow

**File:** `src/handlers/admin.js`. Existing admin auth/session pattern and audit-log helper (`appendAdminAudit`, seen in `stripe.js`) can be reused for exemption review actions — no new auth model needed, just new actions/routes on top of the existing admin session check (`requireAdminContext`).

---

## 7. Terms of service / merchant-of-record language

**File:** `public/terms.html`. Zero occurrences of "merchant of record," "seller," or "marketplace." No language currently addresses who is the seller for bookstore/commerce transactions, or that AGAPAY doesn't own merchandise. This needs new sections (Phase 2/3) — **[LEGAL REVIEW]**, not to be treated as final legal language.

---

## Summary: what's already correct vs. what's missing

**Already matches your intended model (no charge-model change needed):**
- Subscription charges run on AGAPAY's platform account; bookstore/donation charges run as direct charges on the parish's connected account.
- No AGAPAY application fee on bookstore sales.
- Bookstore Stripe Tax runs in the connected account's context (parish's own registrations).
- No tax applied to donations.
- No hard-coded tax rates anywhere — all delegated to Stripe Tax.

**Gaps to build (Phase 2/3, none of which touch the existing charge model):**
- Sales-tax exemption workflow: fields, storage, admin review, Stripe sync — doesn't exist at all today.
- Product tax codes missing on every subscription line item (Giving/Parish+, Learn, Stewardship).
- Learn checkout has no persisted/linked Stripe Customer — worth a light-touch fix so exemption logic (and general billing hygiene) has something stable to attach to; this is additive and doesn't change how Learn is charged.
- Secure private file storage doesn't exist — needs a new non-public R2 bucket + signed-URL pattern.
- Terms.html has no merchant-of-record language for bookstore/commerce.

**Legal questions flagged for your attorney/CPA, not resolved by this audit:**
- Whether AGAPAY's bookstore involvement (checkout UI, payment processing) could still trigger marketplace-facilitator obligations in some states despite the clean technical fee/charge-ownership structure.
- Precise framing of AGAPAY's role in donation flows given it does take an application fee on some donation charges.
- Final wording of any merchant-of-record/terms language — treat my Phase 3 draft as a starting point for review, not final copy.

---

## Recommendation

No existing payment architecture needs to change to reach your intended model — the bookstore/donation Connect design is already sound. I'd like to proceed to **Phase 2 (implementation plan)** for the net-new work: the exemption workflow (registration fields, D1 migration, secure R2 storage, admin review, Stripe sync), the missing product tax codes, and the terms updates.

Let me know if you want to adjust scope before I draft the Phase 2 plan.
