# Phase 3E background-job reliability

Integrity scans and recovery verification use workflows; large exports use queues. Envelopes remain versioned, parish-scoped, correlation-aware, forbidden from carrying bindings or secrets, and protected by stable idempotency. Scans checkpoint by category and can resume; exports and recovery evidence retain stable identities.

Transient platform errors receive bounded retry with backoff and jitter at the transport layer. Dependency-waiting work pauses with visible status. Validation, authorization, closed-period, duplicate-conflict, schema-drift, and integrity failures do not retry blindly. Exhausted jobs enter visible failed/dead-letter operations with safe error summaries and correlation IDs.

Worker restart or duplicate delivery must not create a second financial result. Queue messages carry stable object references, never full financial exports or provider secrets.
