# Parish Onboarding and Go-Live SOP

Document owner: AGAPAY Operations

Version: 1.1

Effective date: 2026-08-12

Review cycle: Quarterly and after any material change to registration, parish authentication, Stripe Connect, subscriptions, giving configuration, receipts, or accounting
Required control: P1-3 Treasurer Go-Live Signoff

## 1. Purpose

This SOP is the single source of truth for moving a parish from a received registration to a public AGAPAY giving launch.

The procedure is intentionally deterministic. Every step has an owner, evidence requirement, completion rule, and blocking rule. An operator may not infer completion from conversation, email, or a partially populated status field. A step is complete only when its exit criteria are met and the evidence is recorded on the onboarding record.

The central operating rule is:

> Canonical verification makes a parish eligible for setup. It does not make the parish public. The giving page remains hidden until setup is validated and the parish treasurer completes the P1-3 signoff and clicks **Go Live**.

## 2. Scope

Use this SOP for every parish, mission, cathedral, monastery, skete, or other church organization being activated in AGAPAY. Apply every step unless the step explicitly permits `Not applicable` and the reason is recorded.

This SOP covers:

1. Registration intake.
2. Canonical parish, priest, and treasurer-authorization verification.
3. AGAPAY Admin activation.
4. Personal dashboard-access invitations.
5. Stripe Connect and payout readiness.
6. Subscription, giving, fund, campaign, user, and optional data configuration.
7. AGAPAY internal launch readiness.
8. Treasurer signoff.
9. Publication, launch, and early-life monitoring.

It does not authorize an operator to bypass Stripe requirements, edit production records directly, accept bank details by email, or substitute an AGAPAY employee's judgment for the parish treasurer's signoff.

### 2.1 Parish-facing 10-minute setup

The detailed controls in this SOP belong to AGAPAY Operations. The parish-facing experience must expose only three stages:

1. **Accept access:** each invited person opens a private, one-use link and creates their own password.
2. **Connect payments:** the parish confirms its plan and the treasurer completes Stripe onboarding.
3. **Review and launch:** the treasurer reviews the locked configuration, completes the eight P1-3 affirmations, and clicks **Go Live**.

The parish must not be asked to understand manual gates, evidence fields, internal test runs, workflow-state names, a parish ID, or a shared temporary credential. AGAPAY records invite acceptance and access readiness automatically.

## 3. Roles and authority

| Role | Responsibilities | May approve |
| --- | --- | --- |
| AGAPAY onboarding owner | Owns the record, coordinates the parish, completes configuration, collects evidence, and resolves blockers | Operational steps assigned in this SOP |
| Canonical reviewer | Confirms the organization and its ecclesial relationship using authoritative sources | Canonical verification |
| Parish priest, rector, or verified parish leader | Is matched to an authoritative parish source and confirms parish participation and the treasurer's authority | Parish participation and named administrative contacts |
| Parish treasurer | Controls the parish's financial readiness review and P1-3 signoff | Stripe ownership, payout bank, giving configuration, plan, receipt details, and Go Live |
| AGAPAY support or engineering | Investigates defects and approved data migrations without weakening gates | Technical remediation only; never treasurer signoff |

One person may perform more than one AGAPAY role, but the record must still show which role they were acting in. The treasurer signoff must be performed by the parish treasurer, not by AGAPAY staff acting as a proxy.

## 4. Required onboarding record

Create one onboarding record per registration reference. Store links or identifiers for evidence, not secrets or full financial data.

The record must contain:

- Registration reference and received timestamp.
- Assigned onboarding owner.
- Current workflow state and the timestamp of the last transition.
- Canonical parish name, parish ID, organization type, jurisdiction, diocese/deanery, and bishop/authority.
- Canonical verification source, reviewer, review timestamp, and notes.
- Priest/rector name, email, authoritative verification source, reviewer, and timestamp.
- Treasurer name and email, plus the verified priest/leader's confirmation method and timestamp. The treasurer does not need to appear in a public directory.
- Dashboard invite delivery status and recipients.
- Personal invitation status, acceptance timestamp, membership ID, and verified recipient. Never store the new password.
- Stripe connected account ID, status-check timestamp, last server confirmation timestamp, readiness booleans, and only the bank name/masked last four digits returned by Stripe. Never store a full bank account or routing number.
- Selected AGAPAY plan and subscription status.
- General Operating Fund configuration snapshot.
- Designated fund and campaign configuration snapshot.
- User/access roster.
- Donor/pledge import decision and reconciliation evidence when applicable.
- Internal launch-check or incident evidence when AGAPAY Operations performs an additional risk-based check.
- Open blockers, exceptions, and incident links.
- Treasurer signoff identity, timestamp, attested snapshot/version, and affirmation results.
- Go-Live actor and timestamp.

Do not put passwords, one-time links, full bank numbers, tax documents, or other sensitive financial credentials in onboarding notes.

## 5. Workflow states

The onboarding record must be in exactly one primary state.

| State | Meaning | Permitted next state |
| --- | --- | --- |
| `RECEIVED` | Registration is stored and assigned | `IDENTITY_REVIEW`, `ON_HOLD`, `CANCELLED` |
| `IDENTITY_REVIEW` | Canonical parish and representative checks are in progress | `VERIFIED_HIDDEN`, `NEEDS_MORE_INFO`, `REJECTED`, `ON_HOLD` |
| `NEEDS_MORE_INFO` | Required identity or authority evidence is missing | `IDENTITY_REVIEW`, `REJECTED`, `CANCELLED` |
| `VERIFIED_HIDDEN` | Canonical verification passed; giving remains nonpublic | `INVITED`, `ON_HOLD` |
| `INVITED` | Personal access invitations were successfully delivered | `CREDENTIAL_SECURED`, `ON_HOLD` |
| `CREDENTIAL_SECURED` | Required personal invitations were accepted and individual passwords created | `STRIPE_PENDING`, `ON_HOLD` |
| `STRIPE_PENDING` | Stripe onboarding started but financial readiness is incomplete | `STRIPE_READY`, `ON_HOLD` |
| `STRIPE_READY` | Charges and payouts are enabled and requirements are clear | `CONFIGURING`, `ON_HOLD` |
| `CONFIGURING` | Plan, giving, funds, campaigns, and import decisions are being configured | `AWAITING_TREASURER_SIGNOFF`, `ON_HOLD` |
| `AWAITING_TREASURER_SIGNOFF` | All operator checks passed and the attestation snapshot is locked | `LIVE`, `CONFIGURING`, `ON_HOLD` |
| `LIVE` | Treasurer clicked Go Live and the giving page is public | `PAUSED`, `ON_HOLD` |
| `PAUSED` | Public giving or discovery is intentionally suspended | `LIVE`, `ON_HOLD`, `CANCELLED` |
| `ON_HOLD` | A named blocker prevents progress | The last valid nonterminal state |
| `REJECTED` | Canonical or authority review failed | None without a new documented review |
| `CANCELLED` | Parish withdrew or onboarding was administratively cancelled | None without a new registration or documented reopening |

State changes must be timestamped and auditable. A note alone does not change state.

## 6. Standard procedure

### Step 1 — Receive and acknowledge registration

Owner: AGAPAY onboarding owner

Entry criteria:

- AGAPAY has received a registration reference.

Actions:

1. Confirm the registration is stored and visible in AGAPAY Admin.
2. Check for an existing parish record or duplicate registration using parish name, city/state, jurisdiction, website, priest email, and treasurer email.
3. Assign one onboarding owner.
4. Confirm the registration acknowledgement was delivered to the submitted contacts. If email failed, correct only the verified address and resend.
5. Record the received timestamp and any promised follow-up date.

Evidence:

- Registration reference.
- Admin record link or identifier.
- Acknowledgement delivery status.
- Duplicate-search result.
- Assigned owner.

Exit criteria:

- The registration is unique or has been intentionally merged under one canonical record.
- Acknowledgement delivery is confirmed or a communication blocker is recorded.
- State is `IDENTITY_REVIEW`.

Block when:

- The registration cannot be found.
- A possible duplicate is unresolved.
- Both priest and treasurer contacts are unreachable.

### Step 2 — Confirm the canonical parish

Owner: Canonical reviewer

Entry criteria:

- State is `IDENTITY_REVIEW`.

Actions:

1. Confirm the parish exists in an authoritative ecclesial source. Prefer, in order:
   1. An official diocesan, metropolis, archdiocesan, or jurisdiction directory.
   2. Direct written confirmation from a diocesan/chancery office using independently sourced contact information.
   3. Direct confirmation from the bishop, dean, rector, or another known authority using independently sourced contact information.
2. Use the parish website as corroborating evidence, not as the sole authority when canonical standing is unclear.
3. Confirm the canonical organization name, organization type, location, jurisdiction, diocese/deanery, and bishop/authority.
4. Confirm the submitted priest/rector is associated with the parish.
5. Record the source URL or communication reference, reviewer name, review date, and any name variance.

Evidence:

- Verification source.
- Canonical organization details.
- Reviewer and timestamp.
- Notes explaining any variance between the registration and the authoritative source.

Exit criteria:

- The organization and its canonical relationship are confirmed.
- The fields `reviewedBy`, `verificationSource`, `bishopOrAuthority`, and `dioceseOrDeanery` are populated.

Block when:

- Sources conflict.
- The organization is not listed and independent confirmation has not been obtained.
- The submitted priest/rector cannot be connected to the organization.

If additional evidence is needed, set `NEEDS_MORE_INFO`. Do not mark the parish verified merely because the registration appears plausible.

### Step 3 — Verify the approving priest and confirm the treasurer

Owner: AGAPAY onboarding owner

Entry criteria:

- The canonical parish exists and its public or authoritative priest/contact route is known.

Actions:

1. Verify the parish priest, rector, or other approving parish leader through an authoritative source: the diocese/jurisdiction website, the official parish website, or a call to the phone number published by one of those sources.
2. Confirm through that verified leader that the parish is onboarding to AGAPAY.
3. Ask that verified leader to confirm the named treasurer's name and email and that the treasurer may review Stripe, payout, plan, fund configuration, and the P1-3 Go-Live signoff.
4. If the treasurer submitted the registration, obtain the same approval from the verified priest/leader. Do not treat the registration itself as the approval.
5. Record the authoritative priest source, confirmation channel, verifier, date, and result.
6. Send personal access invitations only after the confirmation is recorded.

The treasurer is not required to appear on a diocesan or parish website. Public-source verification establishes the parish and approving priest/leader. That verified leader's direct confirmation establishes the treasurer's authority, and invitation acceptance confirms control of the treasurer email address.

Evidence:

- Authoritative parish and priest/leader source.
- Verified priest/leader name and role.
- Confirmation that the verified leader approved the named treasurer and email address.
- Confirmation channel and timestamp, such as priest email, a call to the published parish number, or a diocesan introduction.

Exit criteria:

- The parish and approving priest/leader are matched to an authoritative source.
- That verified leader has confirmed the named treasurer and email address.
- A treasurer authorized to perform P1-3 signoff is identified and ready to receive a personal invitation.

Block when:

- The parish or approving priest/leader cannot be matched to an authoritative source.
- The priest/rector disclaims knowledge of the onboarding or will not confirm the treasurer.
- There is a dispute over who controls financial configuration.

### Step 4 — Verify the organization in AGAPAY Admin without publishing it

Owner: Canonical reviewer or authorized AGAPAY admin

Entry criteria:

- Steps 2 and 3 are complete.

Actions:

1. Open the registration in AGAPAY Admin.
2. Confirm the canonical review fields are complete.
3. Set canonical review status to `verified`.
4. Confirm a stable, unique parish ID is assigned.
5. Set the giving page status to `hidden` before saving.
6. Save and confirm the audit history records the reviewer, status change, and timestamp.
7. Reopen the record and verify it remains `verified` and `hidden`.

Evidence:

- Verified status.
- Parish ID.
- `givingStatus = hidden`.
- Audit entry.

Exit criteria:

- State is `VERIFIED_HIDDEN`.
- The parish is eligible for setup but does not appear in public parish discovery and cannot be treated as launched.

Block when:

- The page becomes active as a side effect of verification.
- The parish ID collides with or could be confused with another organization.
- Required canonical fields are incomplete.

Important current-product safeguard: the present admin implementation can default a newly verified parish to an active giving status. The operator must explicitly select `hidden` and verify the saved result. This is a P1 workflow gap until the product separates canonical verification from publication.

### Step 5 — Send personal dashboard invitations

Owner: AGAPAY onboarding owner

Entry criteria:

- State is `VERIFIED_HIDDEN`.
- Priest and treasurer email addresses have been verified.

Actions:

1. Send personal invitations from AGAPAY Admin to the verified priest and treasurer addresses.
2. Confirm each message contains a private, one-use account-claim link.
3. Confirm the message does not require a parish ID or shared temporary credential.
4. Confirm delivery status is `sent` to the intended recipients.
5. If delivery fails, correct the verified address or delivery configuration and resend. Do not forward an invitation to an unverified alternate address.

Evidence:

- Invite recipients.
- Delivery status and provider identifier when available.
- Sent timestamp.

Exit criteria:

- Invite delivery is confirmed.
- State is `INVITED`.

Block when:

- Delivery status is failed, missing recipient, or not configured.
- The recipients do not match the verified roster.

### Step 6 — Confirm personal access acceptance

Owner: Invited priest and treasurer

Entry criteria:

- Invite was delivered.

Actions:

1. Each recipient opens their own private invitation link.
2. Each recipient creates their own password that meets the current password policy.
3. AGAPAY activates the membership and opens the parish dashboard automatically.
4. AGAPAY records acceptance without recording either password.
5. The access gate completes automatically when the required invitations are accepted.
6. Confirm the recorded accepted membership IDs still resolve to active memberships for this parish. Email delivery alone is not acceptance.

Evidence:

- Invitation and membership identifiers.
- Acceptance timestamps.
- Verified recipient emails and assigned roles.

Exit criteria:

- State is `CREDENTIAL_SECURED`.

Block when:

- A required invitation is expired, revoked, or unaccepted.
- An invitation was sent to an unverified person.
- An accepted identity is connected to the wrong parish or role.

Legacy shared parish credentials do not satisfy this gate by default. A migrated record may use shared access only under an explicit, persisted exception containing approval, approver, timestamp, and reason. The exception is compatibility-only and never grants Go-Live authority; Go Live always requires the authenticated treasurer membership.

### Step 7 — Connect the parish's Stripe account

Owner: Parish treasurer, assisted by AGAPAY onboarding owner

Entry criteria:

- State is `CREDENTIAL_SECURED`.
- Parish identity and treasurer authority are confirmed.

Actions:

1. Start Stripe onboarding from the supported AGAPAY workflow.
2. The treasurer completes Stripe's identity, organization, tax, bank, and payout requirements directly in Stripe.
3. AGAPAY records the connected account ID returned by Stripe.
4. The treasurer does not send bank credentials or identity documents to AGAPAY by email.
5. If the onboarding link expires, create a new single-use link through the supported workflow.

Evidence:

- Connected account ID in the form `acct_…`.
- Onboarding link creation timestamp.
- Stripe onboarding delivery/result status.

Exit criteria:

- A connected account exists and Stripe onboarding is in progress.
- State is `STRIPE_PENDING`.

Block when:

- The account was created for the wrong legal organization.
- The account is already connected to another parish record.
- Stripe reports restrictions that the treasurer has not resolved.

### Step 8 — Wait for Stripe charge and payout readiness

Owner: AGAPAY onboarding owner; parish treasurer resolves Stripe requirements

Entry criteria:

- A connected account ID exists.

Actions:

1. Use **Refresh Stripe status** to retrieve the current connected-account state from Stripe.
2. Do not manually set a status dropdown to simulate readiness.
3. Confirm all of the following from the refreshed Stripe response:
   - `stripeChargesEnabled = true`.
   - `stripePayoutsEnabled = true`.
   - `stripeDetailsSubmitted = true`.
   - `stripeDisabledReason` is blank.
   - `stripeRequirementsDue` is empty.
4. Record the refresh timestamp and the connected account ID.
5. If any item is incomplete, return the action to the treasurer and remain in `STRIPE_PENDING`.
6. Treat this operator refresh as the reviewed snapshot. When the treasurer clicks **Go Live**, the server must retrieve the connected account from Stripe again and compare the current account, readiness, requirements, and payout-bank summary with that reviewed snapshot.

Evidence:

- Stripe account ID.
- Readiness booleans and requirements summary.
- Status-check timestamp.

Exit criteria:

- Charges and payouts are both enabled, details are submitted, and no currently due requirement or disabled reason remains.
- State is `STRIPE_READY`.

Block when:

- Only `charges_enabled` is true but payouts are not enabled.
- The account is `restricted`, `onboarding`, or `invited`.
- Readiness is based on a stale status check.
- Stripe cannot be reached during the mandatory Go-Live refresh. Fail closed with a retryable error; never activate from cached booleans.

### Step 9 — Configure the AGAPAY subscription

Owner: Parish treasurer and AGAPAY onboarding owner

Entry criteria:

- State is `STRIPE_READY`.
- The parish's chosen plan is documented.

Actions:

1. Transition the onboarding record to `CONFIGURING`.
2. Review plan name, price, included modules, trial terms if any, and recurring-giving capabilities with the treasurer.
3. Confirm tax/billing readiness when the selected plan requires checkout.
4. Select the agreed plan in AGAPAY.
5. Complete the supported subscription checkout or apply the supported no-fee status.
6. Refresh the record and verify both the selected tier and billing status.

Evidence:

- Selected tier and displayed plan label.
- Parish approval of the plan.
- Subscription status and Stripe customer/subscription identifiers when applicable.

Exit criteria:

- The selected tier is correct.
- Subscription status is `active`, `trialing`, or `free_forever`, as applicable.

Block when:

- Plan selection is disputed or unclear.
- Paid checkout is blocked by tax/billing readiness.
- The selected tier and billed subscription do not match.

### Step 10 — Configure the General Operating Fund

Owner: Parish treasurer; AGAPAY onboarding owner configures

Entry criteria:

- Subscription is ready.

Actions:

1. Confirm the parish's default unrestricted operating destination with the treasurer.
2. Configure exactly one default General Operating Fund.
3. Use stable identifier `general` unless an approved migration requires a mapped legacy identifier.
4. Confirm the public name, description, accounting treatment, and enabled status.
5. If AGAPAY Accounting is enabled, confirm the giving source maps to the intended unrestricted fund/account.
6. Confirm the fund appears correctly in the giving experience without making the page public.

Required configuration:

- Name: `General Operating Fund`, unless the parish explicitly approves a different public label.
- Identifier: `general`.
- Restriction: unrestricted.
- Default: yes.
- Enabled: yes.
- Donor-visible/giving-enabled: yes.
- Accounting mapping when Accounting is enabled: canonical `fund_general`.

Evidence:

- Fund configuration snapshot.
- Treasurer approval.
- Accounting mapping when applicable.

Exit criteria:

- There is one and only one default General Operating Fund.
- Gifts to the default option will report to the correct fund/account.

Block when:

- Multiple funds are marked default.
- The default fund is restricted.
- The public label and accounting destination describe different purposes.

### Step 11 — Add designated funds and campaigns

Owner: Parish treasurer or priest approves; AGAPAY onboarding owner configures

Entry criteria:

- General Operating Fund is correct.

Actions:

1. Obtain the parish-approved list of designated funds and campaigns.
2. For each item, record:
   - Public name.
   - Purpose/description.
   - Stable identifier.
   - Fund or campaign classification.
   - Restriction type.
   - Enabled/status value.
   - Goal, dates, or destination fund when applicable.
   - Accounting mapping when applicable.
3. Remove duplicates and resolve ambiguous names.
4. Confirm completed, paused, or future campaigns are not accidentally accepting gifts.
5. Review the final donor-facing order and wording with the parish.

Evidence:

- Versioned configuration snapshot.
- Parish approval source.
- Accounting mapping result when applicable.

Exit criteria:

- Every displayed destination is parish-approved and maps to the intended purpose.
- No unapproved or duplicate destination is enabled.

Block when:

- Fund restriction or campaign purpose is unclear.
- The parish has not approved the donor-facing wording.
- A restricted purpose cannot be mapped correctly in reporting/accounting.

### Step 12 — Add priest and treasurer users

Owner: AGAPAY onboarding owner

Entry criteria:

- Verified user roster exists.

Actions:

1. Add or confirm the priest/rector and treasurer using their individually verified email addresses.
2. Assign only the role and access the parish authorized.
3. Send supported invitations and confirm delivery.
4. Require each person to use their own supported identity or invitation. Do not intentionally create a shared named-user identity.
5. Test that each user can access the intended parish and cannot access another parish.
6. Record any additional user request separately with requester, approver, role, and result.

Evidence:

- User/access roster.
- Invitation delivery status.
- Role approval.
- Access test result.

Exit criteria:

- Priest and treasurer access is present and verified.
- No unauthorized user remains.

Block when:

- A requested user or role lacks parish approval.
- Access is delivered to the wrong parish or address.
- Cross-parish access is observed.

Current-product note: priest and treasurer onboarding invitations now create unique role-based identities. The access gate updates automatically when the personal invitations are accepted.

### Step 13 — Import donors and pledges when applicable

Owner: AGAPAY onboarding owner; parish treasurer owns source totals

Entry criteria:

- Parish has answered whether historical donors or active pledges must be brought into AGAPAY.

Actions:

1. Record one decision: `Not applicable`, `Deferred by parish`, or `Import required`.
2. If `Not applicable` or `Deferred by parish`, record the treasurer's confirmation and date.
3. If `Import required`:
   - Obtain an approved export through the authorized transfer method.
   - Preserve the source file and checksum in the approved secure location.
   - Map source columns and document transformations.
   - Preview counts, totals, duplicate rules, rejected rows, and pledge balances.
   - Obtain parish approval of the preview.
   - Run the supported import once with an idempotency key or migration identifier.
   - Reconcile imported counts and monetary totals to the approved preview.
   - Produce an exception report and resolve or accept every exception.
4. Do not use ad hoc direct production writes as an onboarding shortcut.

Evidence:

- Import decision.
- Source summary and approval.
- Preview and reconciliation results.
- Exception report.
- Migration identifier.

Exit criteria:

- Decision is explicitly recorded.
- If imported, source and destination counts/totals reconcile and all exceptions are resolved or accepted by the treasurer.

Block when:

- An import is required but no supported, tested import path exists.
- Source totals cannot be established.
- Duplicate or pledge-balance handling is unresolved.

Current-product note: the inspected codebase does not expose a completed donor/pledge import workflow. Until one exists, `Import required` is a blocker that must be handled through an approved, tested migration plan; it is not permission for an operator to improvise a production import.

When Steps 9–13 pass, save a versioned setup snapshot and transition to `AWAITING_TREASURER_SIGNOFF`.

Steps 14–17 below are retained as an internal diagnostic playbook, not as required parish onboarding gates. Run them only when AGAPAY Operations identifies a launch risk or needs to investigate a defect. They must never appear as a fifth parish setup stage or prevent an otherwise ready treasurer from reviewing and launching.

### Step 14 — Run a controlled test gift

Owner: AGAPAY onboarding owner and parish treasurer

Entry criteria:

- State is `VALIDATING`.
- Stripe and subscription readiness remain valid.
- Funds/campaigns are finalized for signoff.
- The giving link has not been distributed publicly.

Actions:

1. Use a donor identity and email controlled for the test.
2. Make a small live gift to the General Operating Fund using the production connected account. Record the amount in advance.
3. Do not use a Stripe test-mode charge as evidence that the production connected account can receive live funds.
4. If the current product cannot accept a controlled live gift while the page is hidden:
   - Open a time-boxed validation window.
   - Set the page active only long enough to perform the test through the unpublicized direct URL.
   - Confirm the page is not intentionally distributed or announced.
   - Return the page to `hidden` immediately after the checkout result is captured.
   - Record the start/end timestamps and operator.
5. Record the Checkout Session, PaymentIntent, or charge identifier.
6. Retain or refund the small gift according to the parish treasurer's written direction. If refunded, separately verify the refund lifecycle and reporting.

Evidence:

- Test donor, amount, date/time, destination, and payment identifier.
- Successful checkout confirmation.
- Validation-window log if temporary activation was necessary.
- Refund result if applicable.

Exit criteria:

- A production payment succeeded against the correct connected account and destination.
- Giving status is again `hidden` after validation.

Block when:

- The payment lands on the wrong connected account or fund.
- The page cannot be returned to hidden.
- Only a test-mode payment has been performed.

The time-boxed activation is a temporary compatibility procedure, not the target design. The future UI should provide a privileged pre-live test-gift route that does not add the parish to public discovery.

### Step 15 — Verify the donor receipt

Owner: AGAPAY onboarding owner; parish treasurer reviews

Entry criteria:

- Test gift succeeded.

Actions:

1. Confirm the donor receipt email was delivered once.
2. Confirm the receipt displays the correct:
   - Parish/organization name.
   - Gift amount and amount charged.
   - Fund or campaign.
   - Date.
   - Fee treatment and parish net, when displayed.
   - Stripe/payment reference.
   - Reply-to or support contact.
3. Confirm the parish legal name used for tax receipts/statements is correct.
4. Confirm a webhook replay or refresh did not send a duplicate receipt.
5. Save a redacted copy or screenshot as evidence.

Evidence:

- Receipt delivery status and timestamp.
- Redacted receipt artifact.
- Legal receipt/statement name.
- Duplicate-receipt check.

Exit criteria:

- Receipt content and contact details are correct and delivery is successful.

Block when:

- No receipt is delivered.
- Receipt data names the wrong parish, amount, or destination.
- Duplicate receipts are sent for one gift.

### Step 16 — Verify reporting and accounting

Owner: AGAPAY onboarding owner and parish treasurer

Entry criteria:

- Test gift and receipt passed.

Actions:

1. Confirm the gift appears once in parish giving history.
2. Confirm donor name/email, amount, date, status, and fund/campaign are correct.
3. Confirm gross, Stripe processing fee, donor-covered fee if any, parish net, and refund status reconcile to Stripe.
4. Confirm the connected Stripe account shows the same payment.
5. Confirm the gift is included in the appropriate giving report and export.
6. If AGAPAY Accounting is enabled:
   - Confirm the gift posted once.
   - Confirm the correct fund/account and restriction classification.
   - Confirm gross, fee, and net entries balance.
   - Confirm the source link returns to the Stripe/gift record.
7. If reconciliation tooling is enabled, confirm the payment is eligible to match to the eventual Stripe payout. An actual settled payout is not required when Stripe already reports `payouts_enabled`, unless the parish or risk review requires one.
8. Have the treasurer review the result.

Evidence:

- Redacted giving-history record.
- Stripe payment record.
- Report/export result.
- Accounting journal/source-link result when applicable.
- Treasurer review result.

Exit criteria:

- One payment produces one correct gift record, one correct receipt, and one correct reporting/accounting result.

Block when:

- Amounts do not reconcile.
- The gift is missing or duplicated.
- The fund/account classification is wrong.
- A cross-parish data leak is observed.

### Step 17 — Validate the direct giving URL and QR code

Owner: AGAPAY onboarding owner

Entry criteria:

- Test gift, receipt, and reporting/accounting checks passed.

Actions:

1. Record the canonical direct giving URL: `https://agapay.app/give/{parishId}`.
2. Generate the parish QR code from that exact canonical URL.
3. Scan the QR code with at least two independent devices or camera applications when practical.
4. Confirm the decoded URL exactly matches the canonical HTTPS URL and does not use a temporary, shortened, admin, or session-bearing link.
5. Confirm the URL shows the correct parish name and finalized giving destinations during the controlled validation window or privileged preview.
6. Save the approved QR asset and link, but do not distribute them yet.

Evidence:

- Canonical URL.
- QR PNG/SVG identifier.
- Scan results.
- Page-content validation result.

Exit criteria:

- URL and QR reliably resolve to the correct parish giving experience.
- Page returns to `hidden` after any validation window.

Block when:

- QR and direct URL differ.
- Link redirects to the wrong parish or environment.
- A session token or other secret is embedded in the QR code.

When a risk-based internal check is performed, attach its result to the onboarding audit. These checks do not change the standard transition to `AWAITING_TREASURER_SIGNOFF`.

## 7. P1-3 Treasurer Go-Live Signoff

### 7.1 Control objective

The parish treasurer must affirmatively verify the financial and donor-facing configuration immediately before publication. This is a hard launch gate.

The signer identity is derived only from the authenticated platform-user session and active parish membership. A browser-submitted email, display field, parish dashboard bearer, shared credential, or AGAPAY admin session is never authoritative for Go Live. The authenticated user must hold the dedicated `parish.giving.go_live` capability and their normalized email and membership ID must match the accepted treasurer access record for the same parish.

AGAPAY must show the treasurer a read-only signoff summary generated from the exact configuration snapshot that will go live. The summary must display enough information to identify the connected Stripe account without exposing full bank data.

### 7.2 Preconditions

The **Go Live** action must remain disabled unless all of the following are true:

- Canonical status is verified.
- Giving status is hidden.
- Priest and treasurer personal invitations have both been accepted and their recorded membership IDs are active for this parish.
- Dashboard invite was delivered.
- Stripe status was freshly retrieved for the reviewed snapshot, and the Go-Live command can retrieve it again server-side before activation.
- `stripeChargesEnabled = true`.
- `stripePayoutsEnabled = true`.
- `stripeDetailsSubmitted = true`.
- No Stripe disabled reason or currently due requirement exists.
- Subscription tier is selected and subscription status is `active`, `trialing`, or `free_forever`.
- Exactly one active General Operating Fund candidate exists; it is unrestricted, default, donor-visible/giving-enabled, and uses stable ID `general` (or an explicit approved legacy-fund exception).
- When AGAPAY Accounting is enabled, that General Operating Fund maps to canonical accounting fund `fund_general`.
- Designated funds and campaigns have a locked versioned snapshot.
- Recurring-giving setting is explicitly selected.
- Priest and treasurer access is confirmed.
- Donor/pledge import decision is complete.
- No P0 or P1 onboarding blocker is open.

Test-gift, receipt, reporting/accounting, direct-URL, and QR checks remain available as risk-based internal diagnostics. They are not standard parish-facing launch gates and are not part of the ten-minute setup path.

### 7.3 Required affirmations

The treasurer must individually check all eight affirmations. Prechecked boxes are prohibited.

| Required affirmation | What AGAPAY displays | Treasurer action |
| --- | --- | --- |
| Connected Stripe account is ours | Parish name, connected `acct_…` identifier, Stripe status, and link to Stripe | Open Stripe and confirm the account belongs to the parish |
| Payout bank account is correct | Bank name and masked last four digits supplied by Stripe, when available; otherwise instructions to verify inside Stripe | Confirm the destination bank in Stripe; AGAPAY never asks for the full number |
| Organization name is correct | Canonical public parish name and legal receipt/statement name | Confirm both names |
| General Fund is correct | Default fund name, description, unrestricted classification, and accounting mapping when applicable | Confirm gifts will go to the intended operating purpose |
| Designated funds are correct | Every enabled designated fund/campaign, restriction, and destination | Confirm the complete list and wording |
| Recurring giving is enabled as intended | Current enabled/disabled value and relevant plan capability | Confirm the intended setting |
| Receipt contact/details are correct | Receipt preview, legal name, reply-to/support contact, and test-receipt result | Confirm donor-facing details |
| Chosen AGAPAY plan is correct | Plan name, price/terms, included modules, and billing status | Confirm the selected plan |

Required attestation text:

> I am authorized to act as treasurer for this parish. I reviewed the Stripe account and payout destination in Stripe and reviewed the organization, fund, recurring-giving, receipt, and AGAPAY plan details shown here. They are correct for this parish, and I authorize AGAPAY to publish this parish's giving page.

The treasurer must enter or confirm their name and title and then click **Go Live**. Authentication plus the click constitutes the electronic signoff; do not ask the treasurer to email a substitute “looks good” message.

### 7.4 Signoff evidence

Record:

- Treasurer platform user ID, active parish membership ID, and server-verified email.
- Name and title.
- Timestamp and timezone.
- IP/request/audit identifier consistent with AGAPAY privacy and logging policy.
- Version/hash of the exact signoff snapshot.
- Eight affirmation results.
- Attestation text version.
- Stripe status-check timestamp.
- Go-Live action result.

Do not record a full bank or routing number.

### 7.5 Signoff invalidation

Return the onboarding to `CONFIGURING` and require a new signoff if any of these change after the signoff snapshot is created:

- Connected Stripe account or payout destination.
- Public or legal organization name.
- General Operating Fund.
- Any enabled designated fund or campaign, its restriction, or destination.
- Recurring-giving setting.
- Receipt legal name, contact, or material receipt content.
- AGAPAY plan, price/terms, or billing status.
- A validation result changes to failed.
- Stripe readiness regresses or requirements become due.

Cosmetic changes that cannot affect identity, money routing, donor choice, receipts, or plan terms may retain the signoff only when the UI classifies them as nonmaterial and records the change. When in doubt, invalidate and re-sign.

## 8. Go Live and launch

Owner: Parish treasurer performs Go Live; AGAPAY onboarding owner monitors

Entry criteria:

- State is `AWAITING_TREASURER_SIGNOFF`.
- The treasurer has checked all eight affirmations in the authenticated Go-Live form.
- The signoff snapshot still matches the configuration to be published.

Go-Live transaction:

1. Recheck all hard predicates server-side. Client-side checks are not sufficient.
2. Authenticate the platform user, require the dedicated Go-Live capability for this parish, and exactly match the accepted treasurer email and membership ID.
3. Retrieve the connected account directly from Stripe. Recompute charges, payouts, details, requirements, status, and masked payout-bank summary. If Stripe fails, readiness regresses, or the refreshed material state changes the snapshot, fail closed and require the treasurer to refresh and review again.
4. Recheck that the signoff snapshot hash matches the current material configuration after the Stripe refresh.
5. Atomically:
   - Record the treasurer's attestations and audit event.
   - Set onboarding state to `LIVE`.
   - Set giving status to `active`.
   - Record `goLiveAt` and `goLiveBy`.
6. If any write fails, leave the parish hidden and return a clear error. Do not partially publish.
7. Confirm the parish appears correctly in public discovery, where applicable.
8. Open the canonical direct giving URL in a signed-out/private session.
9. Scan the final QR code once more.
10. Deliver the approved direct URL and QR assets to the priest and treasurer.
11. The parish may now place the link or QR code on its website, bulletin, email, signage, and other approved channels.

Launch evidence:

- Go-Live audit event.
- Active giving status.
- Signed-out public-page check.
- Final QR scan.
- Link/asset delivery status.

Exit criteria:

- State is `LIVE`.
- Public page is reachable, correct, and accepting intended gifts.
- Parish has the canonical URL and QR assets.

## 9. Early-life monitoring

Owner: AGAPAY onboarding owner

For the first 72 hours:

1. Confirm the first non-test gift, if one occurs, is processed once.
2. Confirm its receipt and reporting/accounting result.
3. Monitor Stripe requirements, restrictions, webhook failures, email delivery failures, and subscription status.
4. Confirm the parish can access its dashboard and reports.
5. Confirm the treasurer knows how to contact AGAPAY support.
6. Record a 24-hour check and a 72-hour closeout, or `No activity` if no gift occurred.

Onboarding may be closed after the 72-hour review when no blocker is open. Normal support and account monitoring continue under their respective procedures.

## 10. Stop, rollback, and incident rules

Immediately stop launch or pause giving when any of the following occurs:

- Uncertain canonical identity or representative authority.
- Stripe account ownership or payout bank dispute.
- Stripe charges or payouts become disabled.
- Wrong organization, fund, campaign, plan, or receipt details.
- Gift routes to the wrong account or parish.
- Duplicate charges, receipts, gifts, or accounting entries.
- Cross-parish data exposure.
- Treasurer withdraws approval.

Response:

1. Set giving status to `paused` when donors should see a temporary interruption, or `hidden` when the parish should not be publicly discoverable.
2. Record the reason, actor, and timestamp.
3. Open or link the incident/support record.
4. Preserve payment, webhook, receipt, and audit evidence. Do not delete or “clean up” financial records.
5. Correct the issue through the supported workflow.
6. Repeat every affected validation.
7. Invalidate the treasurer signoff when a material field or validation result changed.
8. Require a new P1-3 signoff before returning to `LIVE` when signoff was invalidated.

## 11. Operator completion checklist

This checklist is a summary. The detailed exit criteria above control if the summary and procedure ever differ.

- [ ] Registration stored, acknowledged, deduplicated, and assigned.
- [ ] Canonical parish confirmed from an authoritative source.
- [ ] Parish and approving priest/leader verified from an authoritative source.
- [ ] Verified priest/leader confirmed the treasurer's name, email, and authority; confirmation method recorded.
- [ ] Organization verified in AGAPAY Admin with giving status `hidden`.
- [ ] Personal invitations delivered to the verified priest and treasurer.
- [ ] Required personal invitations accepted; individual access recorded automatically.
- [ ] Stripe connected account created for the correct parish.
- [ ] Stripe charges, payouts, details, and requirements readiness confirmed by refresh.
- [ ] AGAPAY plan and subscription status confirmed.
- [ ] Exactly one correct default General Operating Fund configured.
- [ ] Designated funds/campaigns approved and configured.
- [ ] Donor/pledge import decision completed and reconciled if applicable.
- [ ] Configuration snapshot locked.
- [ ] Treasurer completed all eight P1-3 affirmations.
- [ ] Treasurer clicked Go Live.
- [ ] Signed-out page and final QR passed.
- [ ] URL/QR delivered to parish.
- [ ] 24-hour and 72-hour monitoring completed.

## 12. UI workflow requirements

This section translates the SOP into a future AGAPAY Admin/parish onboarding workflow. It is part of the SOP so the operational process and product implementation do not drift.

### 12.1 Workflow layout

AGAPAY Admin uses four operational phases: **Verify parish**, **Give access**, **Connect Stripe**, and **Configure giving**. The parish dashboard uses only **Accept access**, **Connect payments**, and **Review and launch**.

Each stage must show:

- Owner.
- Status: `not_started`, `in_progress`, `blocked`, `passed`, or `not_applicable` when permitted.
- Required fields.
- Evidence links/identifiers.
- Last actor and timestamp.
- Blocking reason and next action.

### 12.2 Persistence model

The product should store, at minimum:

- `onboardingState`.
- `onboardingOwner`.
- Per-step status, actor, timestamps, and evidence references.
- `materialConfigurationVersion` or canonical snapshot hash.
- Stripe readiness values and `stripeStatusCheckedAt`.
- `validationRunId` and individual validation results.
- `treasurerSignoff` with signer, attestations, text version, snapshot hash, and timestamp.
- `goLiveAt`, `goLiveBy`, and publication audit event.
- Signoff invalidation reason and timestamp.

Step updates and state transitions must be idempotent. Repeating an invite, Stripe refresh, validation refresh, or Go-Live request must not create duplicate users, charges, receipts, configuration items, or audit outcomes.

### 12.3 Server-side Go-Live guard

The server must compute readiness from source fields. A single manually editable `ready` flag is insufficient.

Conceptually:

```text
canGoLive =
  canonicalVerified
  AND givingStatus == hidden
  AND priestAndTreasurerPersonalMembershipsAccepted
  AND dashboardInviteDelivered
  AND stripeChargesEnabled
  AND stripePayoutsEnabled
  AND stripeDetailsSubmitted
  AND noStripeDisabledReason
  AND noStripeRequirementsDue
  AND mandatoryServerSideStripeRefreshSucceeded
  AND subscriptionReady
  AND canonicalGeneralFundIsUnrestrictedDefaultAndDonorVisible
  AND (accountingDisabled OR generalFundAccountingId == fund_general)
  AND givingConfigurationLocked
  AND usersConfirmed
  AND importDecisionComplete
  AND requiredConfigurationChecksPassed
  AND authenticatedTreasurerAttestsCurrentSnapshot
  AND noOpenP0OrP1Blocker
```

The treasurer's **Go Live** click must call one server-side command that re-evaluates this guard and atomically records signoff/publication.

### 12.4 Required UI behavior

- Canonical `verified` and public `active` must be separate controls and states.
- Saving canonical verification must default giving to `hidden`.
- Status values derived from Stripe must be read-only; readiness comes only from Stripe refresh/webhooks.
- The UI must display charges and payouts separately. A generic “Stripe ready” label is insufficient.
- The signoff page must be read-only except for affirmations, signer name/title, and Go Live.
- The verified treasurer email must be read-only display data and must not be accepted from the request body as signer authority.
- The eight P1-3 boxes must start unchecked.
- The payout-bank display must be masked and sourced from Stripe. If masked data is unavailable, require the treasurer to open Stripe and attest there.
- The signoff page must show the version/time of the last Stripe refresh.
- A material configuration edit after signoff must disable Go Live and visibly explain why re-signoff is required.
- Go Live must fail closed. A partial database or email failure must not leave the parish public without a complete audit record.
- The workflow must offer `Pause` after launch without deleting the giving configuration or financial history.
- The workflow should provide a privileged pre-live live-gift test path so operators do not need to expose a parish in public discovery during validation.

### 12.5 Current implementation alignment

| Capability | Current code support | SOP/UI treatment |
| --- | --- | --- |
| Registration and canonical fields | Supported in registration/admin handlers | Retain; make evidence and state transitions explicit |
| Canonical verification guard | Requires reviewer, source, bishop/authority, and diocese/deanery | Retain as the identity gate |
| Giving visibility | Supports `active`, `paused`, and `hidden`; newly verified workflow records default to hidden | Treasurer Go Live is the only pre-live transition to active |
| Dashboard access | Personal one-use priest and treasurer invitations, individual password creation, and automatic acceptance tracking | Treat required accepted identities as the access gate; do not expose parish IDs or temporary credentials |
| Stripe Connect/status refresh | Supported with charges, payouts, details, disabled reason, and due requirements | Make fields read-only and require both charges and payouts |
| Subscription | Supported with tier and status | Require agreement and status match before validation |
| General/designated funds and campaigns | Structured General Fund validator and versioned giving snapshot implemented | Require stable ID, unrestricted/default/donor-visible flags, and `fund_general` mapping when Accounting is enabled |
| Priest/treasurer contacts | Personal role-based identities and memberships are supported | Track delivery and acceptance automatically |
| Donor/pledge import | Applicability and evidence gate implemented; import remains operator-managed | Record `not_applicable` only when no import was requested; otherwise block until evidence exists |
| Internal diagnostics | Payment, receipt, reporting, accounting, URL, and QR tooling remain available | Use when risk or defect investigation warrants; not a parish-facing or standard blocking phase |
| Giving URL and QR | Dashboard generates the canonical URL and QR assets | Provide them automatically after Go Live |
| Treasurer signoff and Go Live | Dedicated treasurer capability, active membership/email match, mandatory fresh Stripe retrieval, snapshot hash, eight affirmations, actor IDs, audit record, and atomic publication implemented | Required P1-3 control; shared parish credentials cannot launch |

### 12.6 Staging workflow test

Use the isolated staging site at `https://agapay-site-staging.joeldunnesq.workers.dev`. The staging tools are shown only when `AGAPAY_ENVIRONMENT` is `staging`, `test`, `preview`, `development`, or `local`; the server returns `403` if the same endpoint is invoked in production.

For a fast UI and state-machine exercise:

1. Sign in to `/admin` on staging and open a registration with both priest and treasurer email addresses.
2. Choose **Prepare parish test**. This creates and accepts test priest/treasurer identities through the real membership APIs and activates the verified treasurer session in the current browser.
3. Copy the one-time parish password. It is shown once and opens the parish dashboard; it does not authorize Go Live.
4. Open `/parish/dashboard?parish={parishId}` and sign in with that password.
5. Confirm the parish sees only the three-stage setup, review the locked summary, check all eight treasurer affirmations, enter the treasurer name/title, confirm authority, and click **Go Live**. The server uses the staging treasurer platform session, not a submitted email or shared parish bearer.
6. Confirm the dashboard reports `LIVE`, the giving status is `active`, and the direct giving URL opens.
7. Return to Admin and choose **Reset test** to repeat the exercise.

The synthetic connected-account fixture is persisted server-side, limited to explicitly non-production environments, and consumed by the same Go-Live refresh code path. Production ignores the fixture path and the staging control returns `403`. Synthetic Stripe readiness validates the AGAPAY workflow only; it cannot process a real test gift. To test the payment, receipt, and reconciliation paths, connect a Stripe test-mode account instead. Never use staging simulation as production evidence.

## 13. Change control

Changes to this SOP require review by AGAPAY Operations and the product owner. Changes to the P1-3 affirmations, Stripe readiness definition, financial validation, or Go-Live guard also require review by the owner of the affected payment/accounting implementation.

When code and this SOP disagree, stop the onboarding at the affected gate, record the mismatch, and obtain an approved resolution. Do not silently reinterpret the SOP to match current UI behavior.
