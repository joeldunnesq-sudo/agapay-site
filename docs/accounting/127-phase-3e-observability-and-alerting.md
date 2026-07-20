# Phase 3E observability and alerting

Structured events cover integrity scan start/completion, critical findings, protective-state activation/release, recovery verification, jobs, migrations, gateway denial, backup, restore, and support actions. Correlation IDs connect scan, finding, journal/source, job, migration, and recovery evidence.

Critical alerts include Trial Balance failure, schema drift, cross-tenant risk, corrupted snapshot, completed reconciliation difference, and failed verified restore. Error alerts include stalled migrations and persistent module inconsistency. Warning alerts include missing costs, budget allocation review, and backlog growth.

Metrics track scan duration and findings, posting blocks, job age/retries/dead letters, migration drift, report latency, export size, backup age, verification results, and capacity. Logs are redacted and sampled where volume is high; financial payloads are not observability metadata.
