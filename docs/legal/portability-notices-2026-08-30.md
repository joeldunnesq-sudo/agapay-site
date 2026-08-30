# Portability notices published August 30, 2026

## Scope

The Terms (Section 19) and Privacy Policy (Section 8) describe the released parish
export feature, its scope and limits, authenticated access, seven-day download
deadline, handling of downloaded copies, and the separation of export, billing
cancellation, and deletion. They distinguish organizational exports from individual
privacy requests and describe backup and third-party copy limitations.

The public copy does not approve `2026-08-29-draft-v1`, change its wording, change
production flags, establish a new post-closure retention schedule, or authorize
deletion. Exact retention defaults and disposal authority still require the
separate closure approval process. The current retention periods remain in place.

## Version and notice handling

- New Terms version and snapshot: `2026-08-30`.
- New privacy notice version: `2026-08-30`.
- New users: August 30, 2026; existing users: no earlier than September 29, 2026,
  subject to the notices' existing notice and acceptance requirements.
- Migration `0113_portability_legal_notices.sql` appends the Terms version and
  content hash. Earlier snapshots, version records, and acceptances are unchanged.
- Posting is not evidence that an existing user received notice or accepted new
  Terms. No acceptance records or notice emails are created by this release.
- The current-availability callouts describe actual service behavior now. Before
  applying material revised obligations to existing users, complete the existing
  notice and affirmative-acceptance process. Legal review remains appropriate
  before approving the separate automated-closure retention schedule.

## Review basis

Implementation reviewed: `src/handlers/parish-portability.js`,
`src/portability/{catalog,export,service,policy}.js`, the dashboard dialog, and
production feature flags. The public wording must change if closure is enabled
or export availability, scope, or expiry rules change.

The FTC advises businesses to honor their privacy representations and describe
data practices clearly:
[FTC Privacy and Security](https://www.ftc.gov/business-guidance/privacy-security).
The Texas Attorney General explains individual access/deletion rights and notice
requirements for covered businesses, as well as exemptions; this release does
not make a new determination about AGAPAY's statutory coverage:
[Texas Data Privacy and Security Act overview](https://www.texasattorneygeneral.gov/consumer-protection/file-consumer-complaint/consumer-privacy-rights/texas-data-privacy-and-security-act).
