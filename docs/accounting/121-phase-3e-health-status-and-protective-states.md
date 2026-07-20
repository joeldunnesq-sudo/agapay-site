# Phase 3E health and protective states

Normalized scan, finding, protective-state, and alert records distinguish healthy, warning, degraded, blocked, recovering, and unknown states. Findings contain safe summaries and operator guidance, not raw payloads, credentials, donor details, or infrastructure identifiers.

`posting_blocked` and `degraded_read_only` are enforced inside the authoritative journal posting validation. Reports and support diagnostics remain available. Activation and release require narrow elevated capability; release also requires optimistic version and a verified reason. No support action rewrites, balances, or deletes posted journals.

The parish health DTO shows only its latest scan, active work, protective state, and safe unresolved findings. Platform aggregation belongs in the existing control plane and must not expose one parish to another.
