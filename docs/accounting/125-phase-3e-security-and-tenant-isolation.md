# Phase 3E security and tenant isolation

The accounting gateway remains the only resolver of parish databases. Authenticated server context supplies parish and entitlement; client parish, tier, database name, binding, or feature flag is never authoritative. Every domain operation still requires a narrow capability.

Protective controls, integrity findings, exports, attachments, close data, and recovery records are private. DTOs and logs omit secrets, full bank numbers, tax identifiers, raw webhooks, attachment keys, physical D1 identity, and stack traces. CSV output neutralizes formula injection; print output escapes stored text.

Emergency activation and release are separately authorized and audited. Feature disable and capability changes are server enforced on every request. Rate limits should be keyed by authenticated actor and parish without sharing financial state across tenants.
