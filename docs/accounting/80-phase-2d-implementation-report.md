# Phase 2D implementation report

Implemented the isolated-parish schema and domain service for settings, normalized source events, typed mappings, posting proposals, automatic/review modes, exception states, source links, clearing validation, and bounded backfill preview. The service supports donations, actual Stripe fees and fee refunds, full/partial refunds, disputes, chargeback fees, paid/reversed/failed/canceled payouts, Mission/Parish parity, optimistic settings updates, safe DTOs, and journal-service idempotency.

The default chart adds Stripe Clearing (`1110`) and Restricted Contributions (`4020`); existing Operating Checking, General Donations, and Bank and Payment Processing Fees accounts provide safe initial defaults. Mapping precedence is source object, Revenue Stream, settlement profile, general mapping, then configured defaults. Restricted gifts without a safe fund are exceptions.

No commerce, bookstore, AP, budgeting, statement import, or full reconciliation functionality is introduced. Phase 2E can build on payout composition and the clearing validation result. Production rollout requires applying `0006_phase2d_give_stripe_integration.sql` to each provisioned parish accounting database, then connecting persisted Give/Stripe events and background jobs to the orchestrator after mappings and start dates are reviewed.
