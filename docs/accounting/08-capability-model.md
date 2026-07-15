# AGAPAY Accounting Package 0.75D — Capability Model

## 1. Capability Philosophy

A capability is a single, atomic permission — "may this authenticated user do X, at this parish, right now." Capabilities are the permanent, stable API. Roles are convenience bundles of capabilities, assigned once, expanded into explicit grants, and never consulted again after that (see `09-role-template-reference.md`). Business logic asks exactly one question, always phrased the same way:

> Does this authenticated user possess capability `X` for this parish?

It never asks "is this user the treasurer," "is this user an administrator," or any other role-shaped question. This is the concrete implementation of `01-accounting-philosophy.md` Section 23 ("role names alone are insufficient") and Package 0.75D's own primary goal.

**Why capabilities rarely change but roles may evolve freely:** a capability names a permission a piece of code actually checks (`accounting.post`, `ap.approve`). Renaming or removing one is a breaking change to every route that checks it — so the catalog is deliberately conservative, additive-by-default, and reviewed as a stable contract. A role template, by contrast, is just a named bundle of capability strings a parish administrator picks at invitation time; changing what "Treasurer" means (adding or removing a capability from the `treasurer` template) affects only *future* invitations, never any already-granted membership (Section 3 below), so role templates can be freely tuned without the same stability burden.

## 2. Capability Catalog

The full, current catalog (`src/lib/authorization.js`, `CAPABILITY_CATALOG`) — 40 capabilities across nine domains:

| Domain | Capabilities |
|---|---|
| **Platform** | `platform.admin`, `platform.support`, `platform.audit.view`, `platform.system` |
| **Parish Administration** | `parish.view`, `parish.manage`, `parish.members.invite`, `parish.members.remove`, `parish.roles.assign`, `parish.settings.manage` |
| **Accounting (foundation only — no ledger exists yet)** | `accounting.view`, `accounting.post`, `accounting.adjust`, `accounting.reverse`, `accounting.close_period`, `accounting.reopen_period`, `accounting.reconcile`, `accounting.reports`, `accounting.export`, `accounting.audit` |
| **Accounts Payable** | `ap.view`, `ap.enter`, `ap.approve`, `ap.pay`, `ap.void` |
| **Banking** | `bank.view`, `bank.reconcile`, `bank.manage_accounts` |
| **Commerce** | `commerce.manage`, `commerce.orders`, `commerce.refunds`, `commerce.products` |
| **Stewardship** | `donations.view`, `donations.manage`, `donor.statements` |
| **Learn** | `learn.manage`, `learn.admin` |
| **Future Modules** | `marketplace.manage`, `directory.manage`, `communications.manage`, `events.manage` |

This catalog **replaces** the ad hoc, accounting-only catalog Package 0.75C introduced (`accounting.configure`, `accounts.manage`, `journals.*`, `bills.*`, `checks.*`, `reconciliations.*`, `memberships.invite`/`memberships.manage`, etc.). Section 5 of `10-authorization-review.md` documents this rename in full, including why it was safe to do now (no real invitation had been accepted against the old catalog — this repository's platform-identity feature is brand new, pre-deployment, with zero production data depending on the old strings).

## 3. Platform vs. Parish Capabilities — A Structural Boundary, Not a Naming Convention

`platform.admin`, `platform.support`, `platform.audit.view`, and `platform.system` are catalogued, but **not grantable through the parish-membership mechanism this package builds.** This is enforced in code, not merely by convention:

- `PLATFORM_ONLY_CAPABILITIES` (`src/lib/authorization.js`) is an explicit, named set — not inferred from a `platform.` string prefix a future capability addition might accidentally collide with.
- `sanitizeGrantableCapabilities()` strips any `platform.*` string before it can ever reach an invitation or a `membership_capabilities` row. This runs at every write path: the route handler (`handleMembershipInvitationCreate`) and, redundantly, inside `createInvitation` itself (defense in depth — no future caller of the library function, even one that bypasses the route, can accidentally persist a platform capability).
- `hasPlatformCapability()` is a dedicated function, structurally separate from `hasCapability()`/`resolveAuthorizationContext()` (which only ever consult `parish_memberships`/`membership_capabilities`), and **it always returns `false`** today. There is no platform-level grant table yet. This is Package 0.75D's answer to "prepare for future support access... do not build the workflow": the vocabulary and the boundary exist and are testable now; the actual elevation mechanism is explicitly deferred (Section 6).

## 4. Naming Conventions

- Two-segment `domain.action` (`accounting.post`, `ap.approve`) for most capabilities.
- Three-segment `domain.subject.action` (`parish.members.invite`, `platform.audit.view`) where the domain has a distinct sub-resource worth naming explicitly.
- `domain.manage` is used where a single capability reasonably bundles create/update/configure for a domain that doesn't yet need finer granularity (`commerce.manage`, `bank.manage_accounts`, `learn.manage`, `directory.manage`) — a deliberate choice to avoid inventing `commerce.create`/`commerce.update`/`commerce.configure` speculatively, per this package's own catalog ("include at minimum" — the given list, not an invented finer subdivision).
- Verb choice is consistent within a domain once established: `.view` (read), `.manage`/`.configure`/`.enter` (write/create), `.approve` (a distinct authorization step), `.post`/`.adjust`/`.reverse`/`.close_period`/`.reopen_period`/`.reconcile` (accounting-specific state-changing actions with real semantic meaning, not generic CRUD verbs, matching the given catalog's own vocabulary).

## 5. No Implicit Capability Hierarchy

Capabilities are **flat** — holding `accounting.post` does not imply `accounting.view`; holding `ap.approve` does not imply `ap.view`. This is a deliberate design decision, not an oversight: `01-accounting-philosophy.md`'s deny-by-default doctrine and Package 0.75D's own "there must never be an implicit allow" rule both argue against any inferred permission a future maintainer might not expect. A role template that wants both `ap.view` and `ap.approve` lists both explicitly (see `09-role-template-reference.md`) — there is no capability-inheritance graph anywhere in `authorization.js` for `hasCapability`/`resolveAuthorizationContext` to walk, and none should be added without a documented amendment to this file, per the same "no implicit allow" principle.

## 6. Future Expansion

- **Adding a capability** is additive: append a string to `CAPABILITY_CATALOG`, optionally add it to one or more role templates. No migration — `membership_capabilities.capability` is unconstrained `TEXT`. A test (`scripts/identity-tests.mjs`, `"capability catalog and role templates only reference known capability strings"`) guards against a role template drifting to reference a capability that was removed or never added.
- **Removing or renaming a capability** is the one genuinely breaking catalog change — any membership already holding the old string keeps a grant nothing checks anymore (harmless but orphaned) until a migration/cleanup removes it. Not needed for this package (the one rename that happened, Section 2, occurred pre-deployment with zero real data).
- **Platform-level capabilities becoming grantable** is Package 0.75E-or-later's job: introduce a `platform_capabilities` grant table (or equivalent), wire `hasPlatformCapability()` to actually query it, and design the elevation/support-access workflow this package deliberately did not build (`10-authorization-review.md` Section 6 has the full handoff notes).
- **New domains** (a future "Marketplace" or "Directory" module) already have a reserved capability namespace in the catalog (`marketplace.manage`, `directory.manage`, `communications.manage`, `events.manage`) — placeholders for when those modules are actually built, following this same `domain.action` convention rather than inventing a new one per module.
