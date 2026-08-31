# Test Lubbock production accounting health

The `Production Accounting Health - Test Lubbock` GitHub workflow targets only
`https://agapay.app` and `test-lubbock`. It is manually dispatched and does not
deploy the application. It keeps production access separate from the staging
`Accounting Release-Gate Evidence` workflow, which creates accounting records
and closes reconciliation periods and must not run against production.

Configure these encrypted secrets in the repository's **production** GitHub environment:

- `TEST_LUBBOCK_PARISH_PASSWORD`: the existing Test Lubbock dashboard password.
- `TEST_LUBBOCK_STAFF_PROFILE_ID`: an existing named Accounting administrator's profile ID.
- `TEST_LUBBOCK_STAFF_PIN`: that profile's existing six-digit PIN.
- `TEST_LUBBOCK_PARISH_SESSION`: optional, short-lived parish session issued by
  the normal Test Lubbock login **after completing MFA**. This takes precedence
  over the password. Production requires MFA, so password alone cannot finish
  login. Treat the session as a password; never put it in chat, source, artifacts,
  or a workflow input. Refresh it immediately before a run and remove the GitHub
  secret after the manual check. The server enforces session validity and fresh
  MFA for Accounting PIN verification; the workflow never fabricates a session
  or falls back to password login if a supplied session is rejected.

Do not copy staging credentials, reset passwords, create staff profiles, disable
MFA, or put credentials in source, chat, or workflow inputs to make the run pass.
If password login requires MFA, this unattended workflow reports
`blocked_parish_mfa`; it does not bypass the challenge. The profile needs permission to read the eight
accounting sections, including governance health.

After the workflow is available on the repository's default branch, run:

```powershell
gh workflow run accounting-health-production.yml --ref main
```

The check reads public D1/KV health, Stripe payout and balance-transaction
diagnostics, fast/full reconciliation for the latest payout month (or current
month when no payouts exist), book readiness, eight accounting sections, and
the existing governance health state. Only parish login and PIN verification
POST; these create normal sessions and audit records. No payments, imports,
reconciliation closes, account setup, Stripe configuration changes, or new
integrity scans are performed. Missing credentials and access failures exit
nonzero. An empty payout history is explicitly reported as lacking historical
payout coverage. No prior integrity scan is also reported explicitly.
The attachment check lists existing bills and reads attachments for one existing
bill only. If no bill exists, attachment coverage is explicitly skipped; the
check never creates a sample bill. Other failed reads still fail the run.

Artifacts contain pass/fail results and coverage flags, never credentials,
response bodies, donor records, financial amounts, or Stripe account IDs. A
passing result is an operational read check, not proof of the two-parish
isolation gate, transaction posting, check printing, or a fresh integrity scan.

On 2026-08-31, inspection found no secrets in the production environment and
confirmed that the normal post-deploy smoke had skipped authenticated checks.
The staging run `33350317424` failed at payout diagnostics with HTTP 502.
Run `33416463802`, attempt 2, confirmed that the updated password was accepted
(HTTP 200), but production returned an MFA challenge rather than a session.
The workflow needs a session issued after completing MFA before authenticated
financial checks can run. No Stripe or Accounting reads were reached in that attempt.
