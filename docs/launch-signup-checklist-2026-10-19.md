# Current signup and treasurer verification checklist

Reviewed October 19, 2026 against released commit `058437466c08ec18ced86e5680e3fd9f915faedb`. This is the short operator view of the [onboarding SOP](parish-onboarding-go-live-sop.md). It clarifies the existing process; it does not change the shared-session launch policy or add an identity-verification service.

The software is approved for controlled onboarding. A successful deployment or test parish does not verify any real church's treasurer. Complete the church-specific rows below before that church launches.

## The simple path for a legitimate treasurer

1. The priest or treasurer submits one registration with the correct church and contact details.
2. AGAPAY finds the church and approving priest/leader through an official source, then obtains one direct confirmation of the treasurer's name, email and authority through that verified contact route.
3. AGAPAY records the confirmation, verifies the registration, and sends the getting-started instructions. The initial shared parish dashboard uses the Parish ID and temporary password from the welcome email; the parish replaces that password.
4. The treasurer chooses the plan, starts the eligible no-card demo, connects the parish's Stripe account and reviews giving setup. Accounting setup is completed separately when included.
5. The treasurer checks the eight launch affirmations, enters name/title, confirms authority and clicks **Go Live**. AGAPAY checks the signed-out link/QR and performs the 24-hour and 72-hour follow-up.

Do not require the treasurer to appear in a public directory, use a church-domain email address, create a separate personal account for initial publication, or send identity/bank documents to AGAPAY. Stripe collects its own required information directly. Ask for more verification only when the normal confirmation is missing, inconsistent or disputed. Individual paid-account invitations remain a separate flow; do not bypass existing paid-access controls.

## One confirmation, recorded once

The onboarding owner contacts the priest/leader using an independently located diocesan/jurisdiction listing, official parish website or published parish phone number. An unsolicited message or the registration's contact information alone is not independent confirmation. A reply from the independently verified priest's address, a callback to the published number or a documented diocesan introduction can complete this step; do not demand all three.

Suggested request:

> Please confirm that your parish is joining AGAPAY and that [name] at [email] is authorized to act as treasurer for payment setup, giving configuration and the final Go-Live approval. A short reply is sufficient; no bank details or identity documents are needed.

In Admin → **Verify parish**:

- Enter the official parish/priest source, reviewer, bishop/authority and diocese/deanery.
- In **Approving priest confirmed treasurer** (`authorizedRepresentative`), record the result, confirmation channel/date and a private evidence reference. Mark passed only after confirmation.
- Verify the treasurer name/email on the registration match what the priest confirmed. Reuse this evidence for access and launch; do not restart verification at every setup screen.

Suggested operator note: `Priest/leader [name/role], independently reached via [official source], confirmed [treasurer name/email] and launch authority on [date/channel]. Reviewed by [operator]. Evidence: [private reference].`

Keep actual names, emails and supporting correspondence in the private onboarding record, not this public checklist. If one person legitimately holds both roles, record that fact and independently verify the approving role; do not force a fictitious second person. If that role or authority is unclear, hold the authority step and seek confirmation through the known ecclesial contact.

## Repeat for each church

Registration reference: ______ · Parish ID: ______ · Onboarding owner: ______ · Review date: ______

| Gate                | Evidence to record privately                                                                                                               | Stop only when                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Registration        | One canonical record, correct parish and contacts, duplicate check                                                                         | A duplicate or material identity mismatch is unresolved                          |
| Parish/priest       | Official source and operator review                                                                                                        | Organization or approving leader cannot be independently connected to the parish |
| Treasurer authority | Verified leader's confirmation of name, email and scope; Admin manual check passed                                                         | Confirmation is missing, conflicting or disputed                                 |
| Setup access        | Intended recipient confirms receipt; password secured; getting-started delivery recorded                                                   | Delivery failed, address is unconfirmed or credential remains temporary          |
| Plan and Stripe     | Intended plan/demo; refreshed account has charges/payouts enabled, submitted details and no outstanding requirements/disabled reason       | Stripe is incomplete, unavailable or not ready; the selected plan is not ready   |
| Giving review       | General fund, designated funds/campaigns, receipt details, recurring choice and import decision reviewed; accounting mapping when required | A required setting or accounting mapping is incomplete                           |
| Treasurer approval  | Correct contact on file, current snapshot, all eight affirmations, name/title, authority confirmation and successful Go Live               | A gate is blocked, configuration changed, or approval is incomplete              |
| Public launch       | Correct signed-out giving page and phone QR; named 24h/72h follow-up owner                                                                 | Wrong parish/destination, failed publication or no support owner                 |

Record `pending`, `passed`, `blocked` or permitted `not applicable` for each church in its onboarding record. These rows are not pre-completed by historical test evidence.

### Common situations without unnecessary paperwork

- **Treasurer registered first:** contact the independently verified priest once; the treasurer does not need to resubmit.
- **Personal/Gmail address or unpublished treasurer:** acceptable when the verified leader confirms that exact address and authority.
- **Typo or a new treasurer email:** confirm the corrected address with the verified leader, update the supported Admin record and resend the supported access message. Do not accept an unverified alternate address or forward credentials informally.
- **No response yet:** keep the authority step pending and follow up through the published parish contact. Do not label a plausible applicant fraudulent, and do not mark passed without confirmation.
- **Dispute or unexpected change:** hold onboarding and use [the incident process](launch-incident-runbook.md); resolve the specific discrepancy rather than asking every applicant for extra documents.

## What the product checks—and what a person checks

| Control             | Implemented behavior at the reviewed release                                                                                                                              | Evidence limit                                                                                                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Canonical review    | Verified status and required review fields are checked                                                                                                                    | Populated fields do not prove the source was actually consulted                                                                                                                                                                      |
| Treasurer authority | Workflow requires `authorizedRepresentative.status === 'passed'` before initial Go Live                                                                                   | The operator's note/evidence is a human control; the server does not independently validate the priest's communication or require a nonempty note to prove authority                                                                 |
| Access email        | Initial getting-started flow uses shared parish access; paid-account flow supports an individual treasurer invitation                                                     | An email delivery status or shared credential does not prove a named individual's identity. The welcome email may be sent to submitted contacts before review and is not verification approval                                       |
| Initial Go Live     | Valid parish dashboard bearer, treasurer email on file, fresh Stripe retrieval, current snapshot, all gates and eight affirmations, name/title and authority confirmation | The signer uses a shared parish session. The recorded email is taken from the parish record; it is not proof of a personally authenticated treasurer. Neither a client-supplied email nor Stripe readiness establishes that identity |
| Accounting          | Separate accounting session/PIN and authorization                                                                                                                         | Initial launch approval grants no accounting access                                                                                                                                                                                  |

The current policy accepts this shared-session model for initial controlled onboarding. Stronger personal signer authentication would require a separately reviewed product change, not another item silently added to this checklist. Operators should explain that distinction accurately and help the verified treasurer complete the existing path.

## Evidence and maintenance

- Fresh isolated-release regression checks passed during this review: `parish-onboarding-workflow-tests.mjs`, `parish-onboarding-hardening-tests.mjs`, `registration-security-tests.mjs` and all ten `parish-onboarding-browser-tests.mjs` scenarios. The tests include missing/incomplete prerequisites, changed signoff snapshots, cross-parish sessions, failed saves and blocked payouts; they do not verify any real treasurer's authority.
- Release acceptance: [production run 39183684058](https://github.com/joeldunnesq-sudo/agapay-site/actions/runs/39183684058), commit `05843746`.
- Operating health: [October 19 monitor](https://github.com/joeldunnesq-sudo/agapay-site/actions/runs/39313700070) and [October 19 D1 backup](https://github.com/joeldunnesq-sudo/agapay-site/actions/runs/39272491763) passed. These do not certify a real recipient, bank account or treasurer.
- Implementation reviewed: [verification policy](../src/organizations/verification-policies.ts), [onboarding workflow](../src/lib/parish-onboarding.ts), [Go-Live handler](../src/handlers/parish-onboarding.ts), [Admin review](../src/handlers/admin-registration-detail.ts) and [email/access flows](../src/lib/parish-notifications.ts).
- Use the [execution sheet](soft-launch-test-execution-sheet.md) for a new rehearsal. Historical owner walkthroughs are retained in the launch records; no real registration, bank connection or payment was submitted during this documentation review.

Recheck this checklist whenever the invitation, shared-session, treasurer role or Go-Live behavior changes. Document the exact release being checked; do not turn an old green test into a new per-church approval.
