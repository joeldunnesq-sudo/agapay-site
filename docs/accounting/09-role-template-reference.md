# AGAPAY Accounting Package 0.75D — Role Template Reference

`src/lib/authorization.js`'s `ROLE_TEMPLATES` — 13 templates, every one a plain array of capability strings from `08-capability-model.md`'s catalog. A role template is consulted **exactly once**, at invitation-creation time (`createInvitation`'s `expandRoleTemplate()` call) — the expanded capabilities become explicit `membership_capabilities` rows, and the template name itself is stored only as a display label (`parish_memberships.role_template`) that no authorization check ever reads again. Editing a template's definition in this file changes what *future* invitations grant; it never retroactively changes an already-accepted membership.

## Rector

**Capabilities:** `parish.view`, `parish.manage`, `parish.members.invite`, `parish.members.remove`, `parish.roles.assign`, `parish.settings.manage`, `accounting.view`, `accounting.post`, `accounting.adjust`, `accounting.reverse`, `accounting.close_period`, `accounting.reopen_period`, `accounting.reconcile`, `accounting.reports`, `accounting.export`, `accounting.audit`, `ap.view`, `ap.enter`, `ap.approve`, `ap.pay`, `ap.void`, `bank.view`, `bank.reconcile`, `bank.manage_accounts`, `commerce.manage`, `commerce.orders`, `commerce.refunds`, `commerce.products`, `donations.view`, `donations.manage`, `donor.statements`.

**Reasoning:** the parish's senior clergy/canonical leader — the broadest template short of platform-level access. Holds every parish-administration and accounting-foundation capability, including `parish.roles.assign` (may grant any capability to anyone, per `08`'s escalation-bounding rule) and `accounting.reopen_period` (an exceptional action per `01-accounting-philosophy.md` Section 12, appropriately reserved for the most senior role). Does not hold any `platform.*` capability — those remain ungrantable through any parish membership regardless of role (Section 3 of `08-capability-model.md`).

## Treasurer

**Capabilities:** `parish.view`, `parish.members.invite`, `accounting.view`, `accounting.post`, `accounting.adjust`, `accounting.reverse`, `accounting.close_period`, `accounting.reconcile`, `accounting.reports`, `accounting.export`, `ap.view`, `ap.enter`, `ap.approve`, `ap.pay`, `ap.void`, `bank.view`, `bank.reconcile`, `bank.manage_accounts`, `donations.view`, `donations.manage`, `donor.statements`.

**Reasoning:** the parish's primary financial officer. Full accounting/AP/banking authority, including period close (but **not** `accounting.reopen_period` — reopening a closed period is deliberately reserved for the Rector per `01` Section 12's "never available to the same role that does day-to-day bookkeeping without additional authorization"). Holds `parish.members.invite` so a treasurer can bring on a bookkeeper without needing the Rector for every hire, but not `parish.roles.assign` — a treasurer may only grant capabilities they themselves hold (`08` Section 3's bounding rule), which happens to already cover the accounting/AP/banking domain they're expected to delegate within.

## Bookkeeper

**Capabilities:** `parish.view`, `accounting.view`, `accounting.post`, `ap.view`, `ap.enter`, `bank.view`, `bank.reconcile`, `donations.view`.

**Reasoning:** day-to-day data entry. Can post routine entries and enter bills, but cannot approve them (`ap.approve` withheld — separation of duties per `01` Section 23, distinguishing who *enters* from who *approves*), cannot pay (`ap.pay` withheld), cannot close a period, and cannot invite anyone else. A textbook "data entry, not authorization" role.

## Secretary

**Capabilities:** `parish.view`, `parish.members.invite`, `donations.view`, `donor.statements`.

**Reasoning:** administrative/clerical support — can see membership context, help onboard new members (invite), and handle donor-facing correspondence (statements), but has no accounting-domain capability at all. A secretary inviting a new member is bounded to only the capabilities the secretary already holds (`08` Section 3), so a secretary alone can never accidentally (or otherwise) hand out accounting access — the escalation-bounding rule makes this role structurally safe to grant broadly.

## Council Member

**Capabilities:** `parish.view`, `accounting.view`, `accounting.reports`.

**Reasoning:** parish-council oversight — read access to parish context and financial reports, nothing else. No write capability of any kind.

## Volunteer

**Capabilities:** `parish.view`.

**Reasoning:** the minimum possible membership — visibility only. The floor of the catalog, used for anyone whose relationship to the parish doesn't warrant any specific operational access yet.

## Bookstore Manager

**Capabilities:** `parish.view`, `commerce.manage`, `commerce.orders`, `commerce.products`, `commerce.refunds`.

**Reasoning:** full operational authority over the commerce/bookstore domain specifically, with zero accounting-domain capability — a bookstore manager doesn't need `accounting.post` to run the shop; commerce activity's eventual accounting treatment is a posting-engine concern (out of scope for this package and for the bookstore manager's own permissions).

## Reader

**Capabilities:** `parish.view`.

**Reasoning:** a liturgical/lay-ministry role with no administrative expectation — same floor as Volunteer, kept as a separate named template because "Reader" is a real, recognizable parish role people will look for at invitation time, even though its capability set happens to be identical today. (Two templates sharing a capability set is fine — see `08` Section 1: templates are a convenience label, capabilities are the real permission; nothing requires templates to be capability-set-unique.)

## Deacon

**Capabilities:** `parish.view`, `donations.view`.

**Reasoning:** clergy assisting the Rector, without independent accounting authority — can see giving activity (relevant to pastoral care/stewardship conversations) but has no posting, approval, or administrative capability.

## Priest

**Capabilities:** `parish.view`, `donations.view`, `donor.statements`.

**Reasoning:** an assisting priest (distinct from the Rector, who has the full `rector` template) — slightly broader than Deacon (adds `donor.statements`, relevant to pastoral/stewardship correspondence a priest might handle) but still zero accounting-domain or parish-administration capability. A parish with only one priest uses the `rector` template for that person; `priest` exists for a second or associate clergy member who assists without holding the Rector's full authority.

## Administrator

**Capabilities:** `parish.view`, `parish.manage`, `parish.members.invite`, `parish.members.remove`, `parish.roles.assign`, `parish.settings.manage`.

**Reasoning:** full parish-administration authority (including `parish.roles.assign`, so an Administrator can grant any capability to anyone, matching a lay parish-office-manager role that handles membership/settings without necessarily touching the books) but **zero accounting-domain capability** — deliberately separating "who manages the parish's people/settings" from "who manages the parish's money," so an office administrator role doesn't implicitly carry financial authority.

## Support *(reserved)*

**Capabilities:** `[]` (intentionally empty).

**Reasoning:** reserved name for the future platform-support role. Selecting this template today grants **nothing** — `platform.support` cannot be assigned through any parish membership (`08-capability-model.md` Section 3), and no other capability is bundled here, because a support role's authority should come from a dedicated, time-limited elevation grant (Package 0.75E or later), never from being invited into a parish's ordinary membership list. This is the literal implementation of "Platform support without authorization: Denied."

## Platform Admin *(reserved)*

**Capabilities:** `[]` (intentionally empty).

**Reasoning:** same reservation as `support`, for the same reason — `platform.admin` cannot be assigned through a parish membership. A future platform-level administration surface will need its own grant mechanism entirely separate from `parish_memberships`, since "platform admin" is definitionally not scoped to any one parish.
