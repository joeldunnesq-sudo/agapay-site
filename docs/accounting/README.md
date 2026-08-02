# Accounting documentation index

This directory is the accounting engineering audit trail. Numbered documents record the architecture, implementation, security reviews, production-readiness work, and completion evidence as each phase shipped. They are intentionally retained even when later phases supersede details.

## Start here

- [Version 1 readiness report](130-phase-3e-version-1-readiness-report.md) summarizes the implemented accounting architecture and distinguishes code readiness from deployment evidence.
- [Phase G completion report](133-phase-g-completion-report.md) preserves the July 21 production-gate evidence and limitations from that run.
- [Accounting release-gate sign-off](accounting-release-gates-signoff.md) is the current release decision and operational checklist for automated, physical check-stock, credential, and production sign-off.

When these documents disagree with older phase reports, treat the newer implementation and release-gate evidence as current. Source code, migrations, and automated tests remain authoritative.

## Chronological audit trail

### Foundations and Package 0.75

- [00 — Phase 0 architecture audit](00-phase-0-architecture-audit.md)
- [01 — Accounting philosophy](01-accounting-philosophy.md)
- [02 — Phase 0.75 foundational readiness](02-phase-0.75-foundational-readiness.md)
- [02a — Stripe event readiness matrix](02a-stripe-event-readiness-matrix.md)
- [02b — Accounting threat model](02b-accounting-threat-model.md)
- [02c — Phase 1 entry checklist](02c-phase-1-entry-checklist.md)
- [02d — Identity and capability model](02d-identity-and-capability-model.md)
- [02e — Cloudflare accounting topology options](02e-cloudflare-accounting-topology-options.md)
- [03 — Package 0.75A CI safety report](03-package-0.75a-ci-safety-report.md)
- [04 — Package 0.75C identity architecture](04-package-0.75c-identity-architecture.md)
- [05 — Package 0.75C migration report](05-package-0.75c-migration-report.md)
- [06 — Package 0.75C security review](06-package-0.75c-security-review.md)
- [07 — Package 0.75C implementation report](07-package-0.75c-implementation-report.md)
- [08 — Capability model](08-capability-model.md)
- [09 — Role template reference](09-role-template-reference.md)
- [10 — Authorization review](10-authorization-review.md)
- [11 — Implementation report](11-implementation-report.md)
- [12 — Accounting gateway architecture](12-accounting-gateway-architecture.md)
- [13 — Accounting domain boundaries](13-accounting-domain-boundaries.md)
- [14 — Service contracts](14-service-contracts.md)
- [15 — Implementation report](15-implementation-report.md)
- [16 — Environment architecture](16-environment-architecture.md)
- [17 — Local development guide](17-local-development-guide.md)
- [18 — Staging strategy](18-staging-strategy.md)
- [19 — Implementation report](19-implementation-report.md)
- [20 — Package 0.75B Stripe event completeness](20-package-0.75b-stripe-event-completeness.md)
- [20 — Phase 0.75 completion report](20-phase-0.75-completion-report.md)
- [21 — Package 0.75F background processing](21-package-0.75f-background-processing.md)
- [22 — Package 0.75H observability threat mitigation](22-package-0.75h-observability-threat-mitigation.md)
- [22a — Accounting incident runbook](22a-accounting-incident-runbook.md)
- [23 — Package 0.75I R2 backup migration foundations](23-package-0.75i-r2-backup-migration-foundations.md)
- [24 — Phase 0.75 completion report](24-phase-0.75-completion-report.md)

### Phase 1

- [25 — Phase 1A control-plane architecture](25-phase-1a-control-plane-architecture.md)
- [26 — Phase 1A registry schema report](26-phase-1a-registry-schema-report.md)
- [27 — Phase 1A lifecycle state machine](27-phase-1a-lifecycle-state-machine.md)
- [28 — Phase 1A security review](28-phase-1a-security-review.md)
- [29 — Phase 1A implementation report](29-phase-1a-implementation-report.md)
- [37 — Phase 1C ledger architecture](37-phase-1c-ledger-architecture.md)
- [45 — Phase 1C implementation report](45-phase-1c-implementation-report.md)

### Phase 2

- [46 — Phase 2A setup UI architecture](46-phase-2a-setup-ui-architecture.md)
- [53 — Phase 2B manual ledger](53-phase-2b-manual-ledger.md)
- [54 — Phase 2B.2 route architecture](54-phase-2b2-route-architecture.md)
- [60 — Phase 2C reporting architecture](60-phase-2c-reporting-architecture.md)
- [70 — Phase 2D integration architecture](70-phase-2d-integration-architecture.md)
- [80 — Phase 2D implementation report](80-phase-2d-implementation-report.md)
- [81 — Phase 2E bank reconciliation architecture](81-phase-2e-bank-reconciliation-architecture.md)
- [89 — Phase 2E implementation report](89-phase-2e-implementation-report.md)

### Phase 3 and production readiness

- [90 — Phase 3A accounts payable](90-phase-3a-accounts-payable.md)
- [99 — Phase 3A implementation report](99-phase-3a-implementation-report.md)
- [100 — Phase 3B budgeting architecture](100-phase-3b-budgeting-architecture.md)
- [106 — Phase 3B implementation report](106-phase-3b-implementation-report.md)
- [107 — Phase 3C commerce architecture](107-phase-3c-commerce-architecture.md)
- [108 — Phase 3D close architecture](108-phase-3d-close-architecture.md)
- [109 — Phase 3D month-end close](109-phase-3d-month-end-close.md)
- [110 — Phase 3D adjusting entries](110-phase-3d-adjusting-entries.md)
- [111 — Phase 3D year-end close](111-phase-3d-year-end-close.md)
- [112 — Phase 3D net-asset closing](112-phase-3d-net-asset-closing.md)
- [113 — Phase 3D accountant exports](113-phase-3d-accountant-exports.md)
- [114 — Phase 3D audit readiness](114-phase-3d-audit-readiness.md)
- [115 — Phase 3D retention and archival](115-phase-3d-retention-and-archival.md)
- [116 — Phase 3D tier entitlements](116-phase-3d-tier-entitlements.md)
- [117 — Phase 3C implementation report](117-phase-3c-implementation-report.md)
- [117 — Phase 3D security and privacy](117-phase-3d-security-and-privacy.md)
- [118 — Phase 3D implementation report](118-phase-3d-implementation-report.md)
- [119 — Phase 3E production-readiness architecture](119-phase-3e-production-readiness-architecture.md)
- [120 — Phase 3E integrity scanner](120-phase-3e-integrity-scanner.md)
- [121 — Phase 3E health status and protective states](121-phase-3e-health-status-and-protective-states.md)
- [122 — Phase 3E migration safety](122-phase-3e-migration-safety.md)
- [123 — Phase 3E background-job reliability](123-phase-3e-background-job-reliability.md)
- [124 — Phase 3E performance and capacity](124-phase-3e-performance-and-capacity.md)
- [125 — Phase 3E security and tenant isolation](125-phase-3e-security-and-tenant-isolation.md)
- [126 — Phase 3E backup and disaster recovery](126-phase-3e-backup-and-disaster-recovery.md)
- [127 — Phase 3E observability and alerting](127-phase-3e-observability-and-alerting.md)
- [128 — Phase 3E accessibility and device validation](128-phase-3e-accessibility-and-device-validation.md)
- [129 — Phase 3E operational runbooks](129-phase-3e-operational-runbooks.md)
- [130 — Phase 3E Version 1 readiness report](130-phase-3e-version-1-readiness-report.md)
- [131 — Phase 3E implementation report](131-phase-3e-implementation-report.md)
- [132 — Phase G production gates](132-phase-g-production-gates-2026-07-21.md)
- [133 — Phase G completion report](133-phase-g-completion-report.md)
- [Accounting release-gate sign-off](accounting-release-gates-signoff.md)
