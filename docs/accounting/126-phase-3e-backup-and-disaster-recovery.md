# Phase 3E backup and disaster recovery

Backups use the established private R2 key model and must include encrypted storage, parish identity, schema/version manifest, artifact checksum, generation time, and retention classification. Verification recomputes artifact and manifest hashes, validates canonical schema, Trial Balance health, source links, reconciliation state, and close snapshots.

Restores occur only into a new test database first. Validate checksum, apply only reviewed forward migrations, run a full post-restore scan, compare Trial Balance and historical evidence, then execute a separately approved parish cutover. A failed test restore never changes production.

Target planning assumptions are documented—not guaranteed—as a 24-hour recovery point and an 8-hour parish-specific recovery time until measured production exercises prove tighter values. Expiration, key access, R2 outage, and platform-wide recovery require operational review.
