# Phase 3E performance and capacity

Critical queries use compound indexes aligned to journal period/status/date, source/status, integration health, reconciliation status/date/difference, close status/period, and finding severity. Integrity samples are capped, export rows are selected in bounded server work, and expensive delivery is assigned to background jobs.

Capacity fixtures should represent a small mission, established parish, large parish, and stress-only history across multiple fiscal years. CI verifies correctness deterministically; environment-specific benchmarks record query plan, fixture size, duration, and memory separately because local SQLite timing is not a production D1 service-level guarantee.

Lists and findings must paginate in route integration. Reports remain authoritative and uncached; summary caching may be introduced only with private tenant-scoped keys and explicit invalidation after posting.
