# Parish onboarding audit — September 5, 2026

## Assessment

The three-stage parish dashboard is a good starting point, but the flow was not reliably recoverable on mobile or after a failed save. The interaction defects and follow-up findings below have been addressed locally. The user confirmed that shared dashboard access is the intended authority for initial launch.

Reviewed: public onboarding entry and registration form, parish dashboard setup and giving wizard, Stripe continuation, launch summary and submission, workflow predicates, registration persistence, existing workflow/hardening tests, and the onboarding SOP.

## Fixes implemented

| User situation | Previous behavior | Updated behavior |
| --- | --- | --- |
| Phone user continues setup | Bottom navigation intercepted wizard buttons because it was above the modal | Wizard appears above the bottom navigation |
| Stripe account exists but setup is unfinished | Only checking status was offered | Continue Stripe setup and check status are both available |
| Browser blocks Stripe popup | Simple setup lacked the fallback link container used by the Stripe action | Setup includes the existing fallback link and help text |
| Setup save fails, then user cancels | Draft funds had already replaced dashboard catalog state | Shared catalog stays unchanged until the server reload supplies saved data |
| Save is in progress | Back, close, and import choices could change the reviewed draft | Controls are disabled and duplicate saves are ignored until the request finishes |
| Custom fund uses a reserved or colliding identifier | Names such as General or two punctuation variants could produce conflicting IDs | Reject reserved identifiers, symbol-only names, and duplicate normalized IDs |
| Keyboard user opens wizard | Focus could leave the modal; Escape had no close behavior | Tab cycles inside the dialog, Escape closes it, and focus returns to the opener |
| Treasurer omits confirmations | Incomplete form caused a server request and Stripe refresh | Local validation focuses the first omission; server validation remains authoritative |
| Registration contains HTML-like text | Review inserted user input directly into HTML | Review escapes entered values and shows them as text |
| Registration is submitted repeatedly | No in-flight guard | Ignore duplicate submissions while pending and after success |
| Registration fails | Generic support instruction hid the returned reason | Show returned error, retain entries, and explain retry/support options |
| Timing expectations | Dashboard promised a ten-minute process regardless of verification dependencies | Dashboard says Parish setup; optional import help explains follow-up |

## Follow-up resolutions

### Initial launch authority — confirmed and aligned

The user explicitly approved shared parish dashboard launch, especially during the 30-day free trial. A secured parish dashboard session can now approve initial launch even if billing is already active. A separate treasurer membership is not required for initial publication. Existing paid-account access requirements after launch remain in place.

The SOP and intake guidance now describe this model. Signoff records the entered name/title, authority affirmation, parish email on file, and authenticationMethod: parish_dashboard_session. It does not claim personally authenticated identity evidence. Accounting retains its separate PIN/session, entitlement, and parish-isolation checks.

### Concurrent launch/configuration edits — fixed

Go Live retrieves Stripe without first writing over the registration. Publication uses one conditional D1 UPDATE comparing the persisted JSON record with the record read before review. Signoff, audit history, Stripe confirmation, and public visibility are saved together only if the record is unchanged. A conflict returns the latest parish summary for fresh review; concurrent successful launch requests return the existing result. Ordinary registration saves also compare the prior goLiveAt value so an in-flight prelaunch write cannot erase a completed launch.

No new database column or migration is required. KV-only deployments cannot use the atomic launch command and receive a service-unavailable response instead of an unsafe write. This change protects publication boundaries; it is not a general-purpose transaction system for every parish operation.

### Complete launch review — fixed

The read-only review now includes each destination's description, restriction, campaign destination, and accounting mapping when configured. The plan snapshot includes total monthly price, selected add-ons, included modules, processing-cost description, household band, and trial end date. Changed plan details participate in the material hash. Existing signed records without reviewVersion: 2 retain compatibility with their original snapshot shape when otherwise unchanged; new approvals use the expanded review.

### Registration validation and recovery — fixed

Registration now uses field-level errors with focus and accessible invalid-state markers. Browser and server reject malformed contact/acceptance emails. Contact drafts stay in sessionStorage for up to 24 hours in the same tab and can be cleared; passwords, files, CAPTCHA tokens, and legal consent are not restored. Storage failure does not prevent form use.

The browser retains an opaque submission key across reloads and retries. The server binds that key to a hash of the sanitized request and atomically inserts the D1 registration once. Concurrent or repeated identical requests return the same reference without duplicate registration or email initiation. Changed details with an already accepted key require correction through support instead of creating a second parish. Replayed exemption submissions instruct the user to confirm document receipt separately. Registration retries require D1; existing API clients without retry keys retain their previous behavior.

### Clear blocked/success states — fixed

The dashboard distinguishes parish access completion from AGAPAY review, offers a support link and refresh action, and shows the available last-update timestamp. Server-side readiness regressions replace stale launch controls with the current next step. Successful launch keeps a visible sharing panel with the canonical giving page, copy-link action, and QR download.

## Verification

Expanded `scripts/parish-onboarding-browser-tests.mjs` covers registration HTML escaping; phone-sized layout and unobstructed controls; keyboard focus and Escape; reserved and colliding names; failed-save cancellation; Stripe continuation controls; Give/Give+ draft preservation and retry; and launch failures, fresh snapshot confirmations, and successful publication responses. APIs are intercepted locally: no real invitations, payments, or publication are performed.

Verification includes: all nine onboarding browser scenarios, parish onboarding workflow tests, parish onboarding hardening tests, public registration boundary tests, targeted ESLint, and source-size budgets. The workflow copy assertion was updated to reject the fixed ten-minute promise. Added backend tests cover membership-free trial and paid initial launch, overlapping launch requests, concurrent edits, safe registration replay, and unchanged historical approvals. Accounting trial/access suites verify the separate authorization boundary. Browser fixtures do not establish live Stripe, email-delivery, or production database behavior.

Before production acceptance, exercise a real staging invitation through password creation, interrupted Stripe onboarding and return, saved setup, stale-snapshot rejection, authorized launch, signed-out giving page, and QR destination. Include both a fresh parish and a resumed partial onboarding.
