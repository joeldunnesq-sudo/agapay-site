# AGAPAY Sales Tax & Merchant-of-Record — Phase 3C Report (Admin Frontend)

Date: 2026-07-05. Corrects/extends Phase 3B. Honest status report — nothing here claims more than what's built and verified.

No production deploy. No live Stripe object touched. Donation tax treatment, bookstore charge ownership, and parish Stripe Customer separation are all unchanged.

---

## 1. Executive summary

Built a working "Tax Exemptions" admin tab in the existing `public/admin.html` / `public/admin/app.js` / `public/admin/style.css`, backed by two new per-Customer routes and a summary-counts route. The admin can now: see operational counts, filter/search the queue, open a claim, view organization/claim/document/Stripe-sync/audit/notes sections, and take every required action (approve, reject, request replacement with grace-period choice, revoke, retry all, retry one Customer, reconcile, add note) — all through the existing AGAPAY visual language (`.section-card`, `.badge`, `.revenue-card`, `.notes-entry`, native `window.confirm`-and-inline-form pattern already used elsewhere in this admin app, not a new modal system).

This is a genuinely functional first version, not a polished, exhaustively-tested production UI. Section 19 below lists what's simplified or not done, stated plainly.

## 2. Exact files changed

- `public/admin.html` — new sidebar nav item, new `#tab-taxexemptions` panel, new mobile tabbar button.
- `public/admin/app.js` — new `switchTab` title entry + load call; ~450 lines of new Tax Exemptions module (queue, filters, summary cards, detail view, all actions, document viewing).
- `public/admin/style.css` — new `.tex-*` rules: filter bar, responsive table→card conversion, detail grid, new `.badge.tex-*`/`.badge.texsync-*` status colors.
- `src/handlers/tax-exemption.js` — two new route handlers (`handleAdminTaxExemptionSyncRetry`, `handleAdminTaxExemptionSyncReconcile`), a new summary handler, enriched queue/detail responses, workflow-enabled guards added to the five existing mutation handlers plus both upload handlers.
- `src/lib/tax-exemption.js` — new pure helpers (`maskCertificateNumber`, `aggregateSyncState`, `computeAllowedActions`, `getTaxExemptionSummaryCounts`, `CUSTOMER_ROLE_LABELS`), three feature-flag functions (`isTaxExemptionWorkflowEnabled`/`DocumentUploadEnabled`/`StripeSyncEnabled`), and `approveTaxExemptionWithoutStripeSync` for the sync-disabled path.
- `src/worker.js` — routes for the summary endpoint and the two new per-Customer routes.
- `wrangler.toml` — three new kill-switch flags (`TAX_EXEMPTION_WORKFLOW_ENABLED`, `TAX_EXEMPTION_DOCUMENT_UPLOAD_ENABLED`, `TAX_EXEMPTION_STRIPE_SYNC_ENABLED`), all defaulted `"true"` (preserve current behavior; these are emergency off-switches, not a staged rollout gate like the Phase 3B flags).
- `scripts/tax-exemption-tests.mjs` — 13 new tests for the Phase 3C helpers and flags (63 tests total in the suite now).

## 3. Exact admin routes added or modified

New:
- `GET /api/admin/tax-exemptions/summary` — aggregate counts + workflow/sync-enabled flags.
- `POST /api/admin/tax-exemptions/:id/syncs/:syncId/retry` — retries exactly one Customer; rejects `succeeded` (409, "nothing to retry") and `reconciliation_required` (409, "use reconcile instead") rows; verifies the sync row actually belongs to `:id` before doing anything.
- `POST /api/admin/tax-exemptions/:id/syncs/:syncId/reconcile` — accepts `action: "accept_external" | "force_apply"` only (422 on anything else), requires `reason`, requires `confirm: true` for `force_apply`.

Modified (enrichment, not redesign):
- `GET /api/admin/tax-exemptions` — now supports `status` (including virtual filters like `sync_failed`, `waiting_for_customer`, `pending_without_document`, `expiring_soon`), `state`, `jurisdiction`, `exemptionType`, and free-text `q` (parish name / reference / parish ID); every row now includes `parishName`, `state`, `maskedCertificateNumber`, `hasDocument`, `aggregateSyncState`, `expiringSoon`.
- `GET /api/admin/tax-exemptions/:id` — now includes `maskedCertificateNumber`, `hasCurrentDocument`, `aggregateSyncState`, `workflowEnabled`, `stripeSyncEnabled`, `allowedActions`, per-sync-row `customerRoleLabel`/`agapayOwnedChange`, and the registration's `contactEmail`/`contactName`/`registrationStatus`/no-statewide-tax guidance.
- The five existing mutation routes (approve/reject/request-replacement/revoke/retry-sync) and both document-upload routes now check the new kill-switch flags and return a 403/503 with a clear message when disabled, rather than silently proceeding.

## 4. Admin tab structure

New top-level sidebar item "Tax Exemptions" (`switchTab('taxexemptions')`), matching the existing `sidebar-nav-item` / `tab-panel` pattern exactly — no new navigation framework. Mobile tabbar got a matching button. The tab itself: hero header → workflow/sync-disabled notices (hidden unless actually disabled) → summary cards → filter bar + queue table → detail panel (shown/hidden via `display`, not a separate route or modal — consistent with how the existing Giving-queue detail view works in this app).

## 5. Queue and filters implemented

Implemented: status (including the virtual sync-state/document/expiring-soon filters), state, jurisdiction, free-text search (parish name/reference/parish ID), all via a 350ms debounce on text inputs. Summary cards are clickable and set the corresponding filter.

**Not implemented:** exemption-type as its own dropdown (it's supported server-side via `?exemptionType=`, just no UI control for it yet — low-effort follow-up), date-submitted/expiration **range** pickers (single expiring-soon virtual filter exists; arbitrary date ranges don't), and certificate-number search (deliberately excluded — searching by certificate number would require decrypting/matching against the very thing this workflow masks by default; not built rather than built insecurely).

## 6. Detail view sections

All six required sections (Organization, Exemption Claim, Documents, Stripe Synchronization, Audit History, Notes) are present and reading from the real detail API response — nothing is mocked or hardcoded. No-statewide-general-sales-tax guidance renders with the Alaska/Delaware-specific caveats when applicable. Certificate numbers render masked only; there is no "reveal" affordance because the backend detail endpoint doesn't send the full number to this view at all (a deliberate simplification — see section 19).

## 7. Admin actions implemented

Approve (confirmation summary + explicit confirm), reject (reason required, warns Stripe untouched), request replacement (reason + explicit keep-active-vs-disable choice, defaulting to disable), revoke (reason + explicit confirm), retry all failed syncs, retry one Customer, reconcile (accept_external / force_apply, reason + explicit confirmation for force_apply). "Mark expired" (manual override, distinct from the automatic cron) is **not** wired into the UI this pass — the backend function existed before this phase but no button calls it yet.

## 8. Per-Customer retry route

`POST /api/admin/tax-exemptions/:id/syncs/:syncId/retry` — verifies exemption exists, verifies the sync row's `tax_exemption_id` matches `:id` (rejects otherwise, preventing a sync row from one claim being retried under a different claim's URL), rejects `succeeded` and `reconciliation_required` statuses with a 409, calls the existing tested `retryOneStripeSync()`, writes an audit entry, returns the refreshed sync row plus the recomputed aggregate state.

## 9. Reconciliation route

`POST /api/admin/tax-exemptions/:id/syncs/:syncId/reconcile` — same ownership check, restricts `action` to exactly `accept_external`/`force_apply` (422 for anything else, including empty/garbage values), requires a `reason`, requires `confirm: true` specifically for `force_apply`. Delegates to the existing tested `reconcileStripeSync()`. Never exposes a raw Stripe Customer object — only the refreshed sync row's safe fields.

## 10. Document-view behavior

`texViewDocument(id, mode)` fetches the existing authenticated Worker route with the admin bearer token, gets a `Blob`, creates a transient `URL.createObjectURL()`, opens it in a new tab (or triggers a download if the popup is blocked), and revokes the object URL after 60 seconds. The R2 storage key and the bearer token never appear in the DOM — only a short-lived local blob URL.

## 11. Audit and notes behavior

Audit log renders chronologically with timestamp/action/actor type/actor id — no raw Stripe payloads, tokens, or document bytes (the underlying `metadata_json` is deliberately not dumped into the DOM; only the action/actor/timestamp fields render). Notes render chronologically with author/timestamp/text, with a simple add-note form; there's no edit/delete UI, matching the "append-only unless the audit policy explicitly permits otherwise" requirement (it doesn't).

## 12. Concurrency protection

**Not implemented.** The detail view doesn't send an expected-version/timestamp on mutating requests, and the backend mutation routes don't check for one either — a genuine gap against item 10 of the assignment. Adding real optimistic-concurrency support (a version/`updated_at` check on every mutation route, a 409 response, and a "this was updated by someone else, refreshing" UI message) is real, scoped work that didn't fit in this pass; flagging it explicitly rather than adding a cosmetic-only version field that doesn't actually protect anything.

## 13. Accessibility

Done: buttons are real `<button>` elements, form fields have `<label for>`, status/sync badges carry both text and color (never color-only), summary cards are keyboard-operable (`tabindex="0"`, `Enter` triggers the same action as click, `aria-label` with the count), the queue table converts to accessible stacked cards below 760px using `data-label` attributes (a standard no-JS-needed technique), `setStatus()` toasts already exist as the app's `aria-live`-equivalent feedback mechanism (reused, not reinvented).

**Not implemented:** true focus-trapping (there's no true modal in this design — actions expand inline within the existing panel, matching how the rest of this admin app already works, so a focus trap isn't structurally applicable the way the assignment describes for a modal/drawer); Escape-to-close wasn't wired to the inline action forms.

## 14. Responsive behavior

Desktop: summary cards grid, filter bar, table, inline detail panel below the queue. Mobile (<760px): the table converts to stacked labeled cards via CSS alone; filters wrap; detail panel is the same inline panel, which on a narrow viewport naturally reads as a full-width panel (no separate mobile-specific detail layout was built, but the existing responsive CSS this app already has for `.section-card`/`.notes-entry` carries over correctly).

## 15. Security controls

- Every route re-checks `requireAdminContext` (existing pattern, unchanged).
- Both new per-Customer routes verify the sync row's `tax_exemption_id` matches the `:id` in the URL before doing anything — preventing a sync row ID from one claim being replayed against a different claim.
- `reconcile` restricts `action` to an explicit allow-list; nothing arbitrary is accepted.
- All user-supplied text (parish names, notes, reasons, filenames) goes through the existing `escapeHtml`/`escapeAttr` helpers before any DOM insertion — no raw `innerHTML` of untrusted content.
- Document view/download never exposes the R2 key or the bearer token in the DOM — only a transient blob URL.
- Rate limiting reuses the existing `admin-money-actions` bucket for the two new mutation routes, matching the other five.

## 16. Tests added

13 new tests in `scripts/tax-exemption-tests.mjs` (suite total: 63, all passing): `maskCertificateNumber`, `aggregateSyncState` (waiting-for-customer, partial, reconciliation-required-takes-priority), `computeAllowedActions` (no-document blocks approve, workflow-disabled blocks everything but notes, retryAll only when actually failed/partial), `getTaxExemptionSummaryCounts` (all-zero baseline, and real counts against seeded data), the three workflow feature-flag functions, and `approveTaxExemptionWithoutStripeSync` (approves without ever calling Stripe, writes zero sync rows).

**Not added, per the assignment's own explicit list:** dedicated route-level tests for the two new HTTP routes themselves (the underlying `retryOneStripeSync`/`reconcileStripeSync` functions were already tested in Phase 3B; the new routes are thin, mostly-declarative wrappers around them plus ownership/action-validation checks that aren't independently exercised by an HTTP-level test here), and no frontend/DOM tests were added — this repository has no browser-test framework and no established pattern for testing inline HTML-string-building admin code (unlike the D1-backed lib functions, which do have an established `node:sqlite` testing pattern to follow). Building one from scratch was out of scope for this pass; flagging rather than skipping silently.

## 17. Full validation results

```
node --check <every touched .js file>        → all pass
node scripts/tax-exemption-tests.mjs          → 63/63 pass
node scripts/worker-hardening-tests.mjs       → pass (unchanged)
node scripts/settlement-profiles-tests.mjs    → pass (unchanged)
node scripts/check-learn.mjs                  → still fails; PRE-EXISTING on main
                                                 (missing public/manifest.webmanifest,
                                                 confirmed via git stash in Phase 3B,
                                                 unrelated to this work)
npm run check (full)                          → fails at its first step (scripts/check.mjs)
                                                 for the same pre-existing missing-file
                                                 reason -- not a regression from this work
```

I'm not claiming a fully green `npm run check` because it genuinely isn't — the failure predates every phase of this project and is documented, not swept under the rug.

## 18. Manual QA checklist (not executed — no live environment available)

The following is the checklist this admin UI should be walked through before real use; I could not execute it myself since there's no deployed Cloudflare Worker/D1/R2/Stripe test environment available in this sandbox:

- [ ] Desktop, tablet, mobile viewport rendering of the queue and detail panel
- [ ] Keyboard-only navigation through summary cards, filters, queue "Review" buttons, and action buttons
- [ ] Screen reader pass over badges, form labels, and toast messages
- [ ] Document inline view and explicit download, for a real PDF/JPG/PNG in a real R2 bucket
- [ ] Partial-sync recovery: approve a claim with two Customers, force one to fail via a real Stripe test-mode error, retry only that one
- [ ] External reconciliation: manually flip a test Customer's `tax_exempt` in the Stripe test dashboard, then trigger a revoke and confirm reconciliation_required appears and both reconcile paths work
- [ ] Waiting-for-Customer approval, then complete a real Giving checkout and confirm the exemption applies automatically
- [ ] Replacement with grace period kept active vs. disabled
- [ ] Rejection, revocation, and manual/automatic expiration end-to-end with real notification emails

## 19. What's simplified or not done — stated plainly

- **Concurrency/stale-state protection**: not implemented (section 12).
- **Frontend/DOM tests**: not added — no framework exists in this repo for it (section 16).
- **"Mark expired" button**: backend exists, no UI button wired to it yet.
- **Exemption-type filter dropdown, date-range filters**: server supports exemption-type; date ranges beyond "expiring soon" aren't built.
- **True focus-trapping / Escape-to-close**: not applicable to this inline-panel design the way it would be for a true modal; not built as a modal.
- **Certificate-number "reveal"**: not built — the backend never sends the full number to this view, which is the safer default; a genuine reveal feature would need its own narrowly-scoped, audit-logged endpoint, which wasn't built this pass.
- **Stewardship's delayed-exemption-application wiring** (flagged already in Phase 3B): still not done — `applyApprovedExemptionIfExists()` is proven and tested but only wired into `src/lib/subscription-checkout.js`, not `src/handlers/stewardship.js`'s two Customer-creation call sites.
- **Route-level HTTP tests for the two new admin routes**: not added, only the underlying lib functions and pure helpers are directly tested.

Ready to close any of these gaps next — Stewardship wiring and the concurrency check are probably the highest-value next steps if you want to keep going.
