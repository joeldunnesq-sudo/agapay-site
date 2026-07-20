# Phase 3D month-end close

Month-end checks cover ledger balance and integrity, draft journals, required bank reconciliation, integration exceptions, and report validation. Parish sessions add payables, official-budget, and commerce exception checks. Unavailable advanced modules are excluded from Mission sessions rather than presented as functional checks.

The close workspace DTO includes session actors and timestamps, categorized checks, counts of passes, warnings, failures, and blockers, and optimistic version state. Warnings may be acknowledged with a reason when policy permits. Critical blockers must pass from authoritative data.

Completion creates an immutable snapshot before applying the hard period lock. Reports remain readable. Manual, Give, AP, and commerce posting continue to use the existing journal engine, whose open-period and active-lock validation blocks closed-period posting.
