# Parish Directory Phase 2A -- Security Review

## Verdict

Phase 2A is ready as a tightly scoped self-service foundation. It is not a directory browsing/search feature and it is not media infrastructure.

## Boundaries Reviewed

- IDOR: person and household access is derived server-side from the linked platform user and active household-admin rows.
- Household-admin overreach: household administrators can manage household-owned data, not another adult's person-owned contacts.
- Child exposure: child records cannot self-serve and child invitations are denied.
- Protected-person exposure: protected-person policy continues to fail closed through Phase 1B privacy evaluation.
- Protected-address exposure: protected addresses cannot be widened to ordinary directory members and are sanitized in self-service DTOs.
- Stale updates: person and household profile updates require `expectedVersion`.
- Mass assignment: unknown fields and protected fields are rejected.
- Self-approval: self-service publication approval is explicitly denied.
- Cross-parish access: manageable households and requests are parish-scoped.
- Invitation abuse: adult household invitations require an active household administrator and reuse Phase 1C token storage.
- Donor-data leakage: no donor, giving, Learn, or accounting tables are read.
- Legacy bearer access: the API route requires platform-user session identity.
- Tier enforcement: Mission and Parish both receive Phase 2A behavior; no security rule varies by tier.

## Residual Risk

The UI is intentionally minimal. Full parish review queues, rich notification delivery, and advanced administrative decisions belong in later phases. Contact verification remains non-operational and is not presented as verified.
