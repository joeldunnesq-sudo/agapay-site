# AGAPAY Accounting Philosophy

## 1. Purpose

This document is the constitutional design authority for AGAPAY Accounting. It governs every later phase — schema design, posting-engine implementation, UI behavior, migration tooling, and every prompt given to a human developer or an AI implementation agent (Claude, Codex, or otherwise).

- This document controls accounting behavior across all later phases. A later design document, ticket, or prompt may add detail; none may contradict this one without an explicit, written amendment to this document.
- Implementation convenience must never override accounting correctness. "It's easier to just update the row" is never an acceptable reason to violate an invariant defined here.
- No feature may bypass the posting engine. If a feature needs to create, reverse, or adjust a journal entry, it goes through the posting engine described in Section 10 — never a direct table write, however small or well-intentioned.
- Any future design that conflicts with this document must be explicitly reviewed and amended here — not silently implemented around. If a developer or an agent believes a rule in this document is wrong or unworkable, the correct action is to propose an amendment to this document, not to route around it in code.

This document does not implement anything. It does not define schema, does not write SQL, and does not design screens. It defines the rules that any later schema, SQL, or screen must obey.

---

## 2. Product Objective

AGAPAY Accounting is an **account-based, double-entry church fund-accounting system**, integrated with AGAPAY Give (donations), AGAPAY Parish Commerce (bookstore and future commerce modules), donor management, and general parish operations. It is designed specifically for **Orthodox missions and parishes**, and is intended to be a credible, eventual replacement for Aplos for participating parishes.

It is designed to support two distinct levels of rigor, because a ten-family mission and a large, staffed parish have genuinely different needs:

- **Mission-tier accounting** — core bookkeeping. A single fund or a small number of funds, straightforward income and expense tracking, basic financial statements, a treasurer who may reasonably wear every hat. This tier must still be double-entry and must still obey every invariant in this document — "mission-tier" describes *scope*, not looser correctness.
- **Parish-tier accounting** — everything in Mission-tier, plus accounts payable, check printing, advanced bank reconciliation, multi-person approval workflows, and Aplos migration assistance. This tier assumes more staff, more funds, more vendors, and a real separation-of-duties need.
- **Future advanced or multi-entity functionality** (e.g., a diocese consolidating multiple parishes, inter-parish loans, or multi-entity reporting) is explicitly out of scope for this document and for the initial architecture. Nothing in this document should be read as promising or precluding it — it is simply not designed here.

Both tiers share one ledger architecture, one posting engine, and one set of invariants. Tier only changes which *features* are exposed, never the underlying accounting rules.

---

## 3. Core Accounting Principles

These are non-negotiable. Each one constrains every later design decision.

- **Double-entry accounting.** Every accounting transaction is recorded as a journal entry composed of two or more journal lines, where the sum of debits equals the sum of credits. There is no other way to record a financial fact in AGAPAY Accounting.
- **Balanced debits and credits.** No journal entry may be posted unless it balances to zero (total debits minus total credits equals zero) within the entry's currency. This is enforced by the posting engine, not by UI validation and not by developer discipline.
- **Accrual-capable ledger architecture.** The ledger itself must be able to represent accrual concepts (a bill owed but not yet paid, revenue earned but not yet received) even for parishes that choose to *report* on a cash basis. See Section 13.
- **Cash-basis reporting where supported.** A parish may see cash-basis financial statements generated from the same accrual-capable ledger, without the underlying ledger ever being cash-only.
- **Immutable posted records.** Once a journal entry is posted, its lines do not change. Ever. Corrections are new entries, never edits to old ones. See Section 11.
- **Reversals and adjusting entries instead of direct edits.** Every correction mechanism in this system is additive — it creates new journal entries that offset or adjust prior ones. Nothing "fixes" a posted entry by mutating it.
- **Complete auditability.** Every posting, correction, approval, and privileged action must be attributable to an actor, a time, and a reason, and must be reconstructable after the fact. See Section 22.
- **Consistency across periods.** The same kind of source event must produce the same kind of accounting treatment every time it occurs, regardless of when it happens or who triggered it. Accounting treatment is a property of the mapping rules (Section 9), not of who happened to process the event.
- **Fund accountability.** Every dollar is trackable to the fund that owns it, and a parish must always be able to answer "what is the balance of Fund X" from the ledger alone. See Section 8.
- **Reproducible reports.** Running the same report against the same posted data, at any later time, must produce the same numbers. Reports are not allowed to depend on ephemeral state.
- **Traceable source records.** Every journal entry must be traceable back to the operational event, document, or manual action that caused it.
- **Least-privilege access.** Every actor — human or system — gets the minimum accounting capability needed for their role. Nobody gets broad access "to be safe" or "to save time."
- **Separation of duties where practical.** Distinguishing who *enters* a financial action, who *approves* it, and who *executes* it (e.g., signs a check) is a design goal for Parish-tier accounting and must never be architecturally foreclosed, even where Mission-tier allows one person to hold multiple roles. See Section 23.

---

## 4. Authoritative Sources of Truth

### Operational transactions

Donations, bookstore sales, Stripe payments, refunds, disputes, payouts, and tax calculations are **operational events**. The system that originates them (AGAPAY Give, AGAPAY Parish Commerce, Stripe) is authoritative for *what happened in that workflow* — that a checkout succeeded, that a refund was issued, that a payout was initiated. Operational systems are not authoritative for *how that event is recorded in the parish's books* — that is the accounting domain's job.

### Accounting records

- Posted journal entries and their journal lines are **the authoritative accounting record**. Nothing else in the system outranks them.
- Balances — account balances, fund balances, financial-statement totals — must be **derived from journal lines**. A balance is a computation, not a fact stored independently of the entries that produce it.
- Reports are **views or snapshots**, not independent sources of truth. A report can be wrong (bug, stale cache) without the ledger being wrong; the ledger can never be "corrected" by fixing a report.
- Cached balances are **derived and rebuildable**. Any cache of a balance must be reconstructable from journal lines alone, at any time, and must never be treated as authoritative if it disagrees with the journal lines.
- Bank imports **do not become accounting entries until matched or posted**. An imported bank transaction is evidence, not a journal entry, until a human or a defined process turns it into one.
- R2 documents (invoices, receipts, bank statements, check PDFs) **support records but do not create accounting facts**. A receipt attached to a bill does not, by itself, mean the bill was paid — the journal entry means that.

### Stripe

**Stripe is authoritative for payment-processing events and money movement** — whether a charge succeeded, what the fee was, whether a payout occurred, whether a dispute was filed. **AGAPAY Accounting is authoritative for how those events are classified and recorded in the parish's books** — which fund, which account, which posting date, which fiscal period. Stripe tells AGAPAY *that* money moved; AGAPAY Accounting decides *what that means* for the parish's financial statements.

### Aplos migration

Imported Aplos data is **historical source data**, not a shortcut to authoritative records. It must be validated, mapped, and balanced before it becomes a posted AGAPAY accounting record. Aplos's own history does not carry AGAPAY authority merely because it existed first. See Section 26.

### Source-of-truth hierarchy (highest to lowest authority, for anything already posted)

1. **Posted journal entries and journal lines** (parish accounting D1) — the ledger itself.
2. **Operational source events** (Stripe webhook data, commerce order records, donor records — central AGAPAY D1) — the evidence a posting was built from.
3. **Supporting documents** (R2 — invoices, receipts, bank statements) — evidence supporting a source event or a manual entry.
4. **Derived/cached data** (balances, report aggregates) — computed from #1, rebuildable, never trusted over #1.
5. **Draft, unposted, or imported-but-unvalidated data** (draft bills, raw Aplos import rows, unmatched bank transactions) — not yet accounting facts at all.

---

## 5. Accounting Domain Boundaries

The accounting domain is a **distinct system** within AGAPAY, comprising: ledger, accounts, funds, fiscal years, accounting periods, journals, posting, banking, reconciliation, vendors, accounts payable, payments, checks, budgeting, reporting, migration, and audit controls.

- Route handlers must not write directly to journal tables. A route handler receives a request, authorizes it, and calls an accounting-domain service — it never issues `INSERT INTO journal_lines` itself.
- Operational modules (Give, Commerce, donor management) must not create ledger rows directly. They emit source events; the accounting domain decides what, if anything, to post.
- All postings must pass through approved accounting-domain services — described functionally in Section 10 as "the posting engine." There is exactly one path into the ledger.
- Reports must not contain hidden posting logic. A report reads journal lines and aggregates them; it never writes, adjusts, or "corrects" data as a side effect of being viewed.
- UI components must not implement accounting rules independently. If a screen needs to know whether an account is a debit-normal or credit-normal account, it asks the accounting domain — it does not hardcode that knowledge in JavaScript.

This boundary exists so that "how AGAPAY Accounting behaves" has exactly one implementation, not one implementation plus a dozen accidental reimplementations scattered across route handlers, background jobs, and UI code.

---

## 6. Core Terminology

- **Accounting entity** — the legal/organizational unit whose books are being kept. In AGAPAY, this is normally synonymous with a parish, but the term exists separately in case a future entity (a diocese, a monastery with a separate legal status) needs its own books without being a "parish" in the platform's other senses.
- **Parish** — the tenant unit already used throughout AGAPAY (registrations, settlement profiles, etc.). For accounting purposes, a parish that has activated accounting is one accounting entity with one dedicated accounting D1 database.
- **Chart of accounts** — the complete, ordered list of ledger accounts an accounting entity uses to classify every debit and credit. See Section 7.
- **Ledger account** — a single named, typed line in the chart of accounts (e.g., "Bookstore Sales Revenue," "Building Fund Cash"). The unit that journal lines post to.
- **Account type** — the classification of a ledger account (asset, liability, net assets/fund equity, revenue, expense, contra, other income, other expense). Determines the account's normal balance and its role in financial statements.
- **Journal entry** — a single, balanced accounting transaction, composed of two or more journal lines, posted as an atomic unit.
- **Journal line** — one debit or credit within a journal entry, referencing exactly one ledger account and (where applicable) exactly one fund.
- **Debit / credit** — the two sides of every journal line. Not "increase" and "decrease" in the colloquial sense — their effect depends on the account's normal balance.
- **Normal balance** — whether an account's balance increases with debits (assets, expenses) or credits (liabilities, net assets/fund equity, revenue). A property of account type, not a per-transaction choice.
- **Fund** — a self-balancing accounting subdivision tracking resources for a particular purpose or restriction (see Section 8). Distinct from an account: a fund is *whose money and for what purpose*; an account is *what kind of thing* (cash, revenue, expense).
- **Restricted fund** — a fund whose use is limited by a donor's or grantor's stipulation, which the parish cannot unilaterally override. Legal significance — see Section 8's caution about legal conclusions.
- **Board-designated fund** — a fund the parish council/vestry has earmarked for a purpose, but which the parish itself created the restriction for and can, with proper process, undesignate. Distinct from donor-restricted: the parish put this fence up, so the parish can take it down.
- **General operating fund** — the default, unrestricted fund used for day-to-day parish operations absent a more specific designation.
- **Net assets / fund equity** — the accounting-equation counterpart to assets and liabilities in fund accounting (roughly, nonprofit accounting's analog to "owner's equity"), typically tracked per fund.
- **Revenue stream** — an *operational* classification (already implemented in AGAPAY as "Revenue Streams" in the UI / `settlement_profiles.profile_type` in the schema) describing *what kind of activity* generated money — general giving, bookstore, festival, school, etc. Not an accounting concept by itself. See Section 9.
- **Settlement profile** — the *operational* record (AGAPAY's existing `settlement_profiles` table) describing where a given revenue stream settles — which Stripe Connect account, which payout destination. Also not an accounting concept by itself. See Section 9.
- **Accounting mapping** — the rule that translates a revenue stream / settlement profile (or any other operational source) into an actual accounting treatment: which revenue account, which fund, which fee account, etc. This is the bridge between operational classification and the chart of accounts. See Section 9.
- **Bank account** — a ledger representation of a real-world parish bank account, used for reconciliation and cash-account journal lines.
- **Stripe clearing account** — an intermediate ledger account representing money that Stripe has collected on the parish's behalf but has not yet paid out to the parish's bank account. Money passes through this account between "donor paid" and "parish bank received."
- **Accounts payable (AP)** — the subledger and control account tracking amounts the parish owes vendors but has not yet paid.
- **Vendor** — a payee the parish transacts with (a supplier, a contractor, a service provider) — distinct from a donor.
- **Bill** — a vendor's request for payment, entered into AP before it is paid.
- **Payment** — the act (and accounting record) of paying a bill, in full or in part.
- **Check** — a specific payment *instrument* (see Section 17) — not synonymous with "payment." A payment can be made by check, but the check itself is downstream of the accounting payment, not a replacement for it.
- **Reconciliation** — the process of comparing ledger bank-account activity against actual bank evidence (statement or feed) and marking items cleared/reconciled. See Section 18.
- **Fiscal year** — the accounting entity's defined 12-month (or otherwise-defined) reporting year.
- **Accounting period** — a subdivision of a fiscal year (typically monthly) used for closing, reporting, and controlling when ordinary posting is allowed.
- **Closing** — the controlled process of locking a period (or year) against further ordinary posting. See Section 12.
- **Posting date** — the accounting-period date a journal entry is recorded against, which determines which period's financial statements it affects. May differ from the transaction date.
- **Transaction date** — the real-world date the underlying event occurred (a donation was made, a bill was received). May differ from the posting date (e.g., a bill dated at month-end but entered in the next period).
- **Source event** — the specific operational occurrence (a Stripe webhook event, a manual entry request, an Aplos import row) that a journal entry was generated from. Every posted entry must reference one.
- **Source document** — a supporting file (an R2 object — an invoice PDF, a receipt image, a bank statement) that documents a source event or a manual entry, without itself being an accounting fact.
- **Idempotency key** — a value guaranteeing a given source event posts at most once, even if the triggering process (a webhook, a queue message) is retried or duplicated.
- **Reversal** — a new journal entry that exactly offsets a previously posted entry, leaving both entries visible in the ledger. Used when an entry was correct-at-the-time but is no longer wanted (e.g., a donation later refunded) or was posted in error and must be fully undone.
- **Adjustment** — a new journal entry that corrects a previously posted entry's classification (wrong account, wrong fund) without necessarily reversing the underlying economic event. Often a reversal of the incorrect line(s) plus a correct posting, but conceptually distinct from a pure reversal because the *event* still happened — only its treatment was wrong.
- **Void** — marking a *non-posted or instrument-level* record (a draft bill, an unissued check) as cancelled and no longer actionable, without it ever having been — or while explicitly removing it from being — a live financial obligation. Voiding a posted, money-moving fact is done through a reversal, not a void; see Section 11 for exactly which records may be voided versus which require reversal.
- **Deleted record** — permitted only for records that have never been posted (drafts). A posted journal entry is never deleted.
- **Official report snapshot** — a stored (R2), point-in-time copy of a report's output, generated once and preserved as-is regardless of later corrections to the underlying ledger. See Section 20.
- **Derived balance** — any balance (account, fund, subtotal) computed from journal lines rather than stored as an independent fact. See Section 21.

### Terms that are commonly confused — explicit distinctions

- **Account vs. fund.** An account answers "what kind of economic item is this" (cash, revenue, an expense category). A fund answers "whose money is this, for what purpose." A single fund typically has journal lines across many accounts (its own cash, its own revenue, its own expenses); a single account (e.g., "Cash") may have balances broken out across many funds.
- **Fund vs. revenue stream.** A fund is an *accounting* concept with (potentially) legal or governance significance and a balance. A revenue stream is an *operational* classification of incoming activity with no balance of its own — it exists to categorize where money came from operationally, and is one of several inputs an accounting mapping uses to decide which fund (and account) to post to. A revenue stream does not have a fund balance; a fund does.
- **Revenue stream vs. settlement profile.** A revenue stream describes *what kind of activity* generated the money (general giving, bookstore). A settlement profile describes *where it settles* (which Stripe Connect account/payout destination) and, in AGAPAY's existing schema, is effectively the same underlying record wearing two names — `settlement_profiles.profile_type` is the revenue-stream classification. Neither is a fund, and neither is a chart-of-accounts entry.
- **Operational transaction vs. accounting posting.** An operational transaction (a Stripe charge, a commerce order) is a fact about what happened in a workflow. An accounting posting is the ledger's *interpretation* of that fact, expressed as balanced debits and credits. One operational transaction typically produces one accounting posting, but the two are never the same record, and the operational record must never be mistaken for, or substituted for, the posting.
- **Void vs. reversal.** A void cancels something that was never a completed financial fact requiring an offsetting entry (an unissued check, a draft bill) — nothing was posted, so nothing needs to be un-posted. A reversal offsets something that *was* posted and needs to be undone or changed while preserving history. If money already moved or a journal entry already posted, "voiding" it is not accounting-valid — only a reversal is.
- **Cash-basis reporting vs. accrual ledger structure.** The ledger structure (the tables, the posting engine, the ability to record a bill before it's paid) is always accrual-capable — this is a structural property of the system, not a per-parish choice. Cash-basis reporting is a *reporting-layer* choice: a report can be generated that only reflects cash-settled activity, computed from the same accrual-capable ledger. A parish choosing "cash-basis reporting" never means the underlying ledger stops being accrual-capable.

---

## 7. Chart of Accounts Philosophy

- **Account classes:** assets, liabilities, net assets/fund equity, revenue, expenses, contra accounts (e.g., contra-revenue for refunds/discounts), other income, other expense. Every ledger account belongs to exactly one class.
- **Controlled account types.** The set of valid account types (and their normal balances) is fixed by the system, not freely invented per parish. A parish may add accounts within a type; it may not invent a new type.
- **Account numbering.** Accounts use a numbering convention (exact ranges are an implementation decision deferred past this document) sufficient to group accounts by class and support standard nonprofit financial-statement ordering.
- **Parent and child accounts.** The chart of accounts supports hierarchical grouping (e.g., "Utilities" as a parent with "Electric," "Water," "Gas" children) for reporting roll-up, without requiring every parish to use sub-accounts.
- **Active and inactive accounts.** An account may be deactivated (hidden from new-entry selection) without being deleted. Deactivation is reversible; it is a visibility/usability control, not a data-integrity one.
- **System-controlled accounts.** Certain accounts (the Stripe clearing account, the AP control account, sales-tax liability where applicable) are created and managed by the system and must not be freely renamed, retyped, or deleted by a parish user, because other parts of the system depend on their identity and behavior.
- **Accounts may not be deleted once they have ever been posted to.** An account with any journal-line history is deactivated, never deleted — deleting it would break the traceability of every historical entry that references it. An account that was created and never used may be deleted while still a draft/unused concept, subject to normal draft-record rules (Section 11).
- **Historical accounts remain reportable.** A deactivated account still appears correctly in every historical report covering periods when it was active and used.
- **Renaming an account** changes its display name; the account is the same identity throughout, and renaming must never be implemented as "delete old, create new," which would break traceability. This has different effects on two different kinds of report output, and the distinction matters: **live reports** (Section 20 — generated on demand from current data) always resolve the account by its identity and display its **current** name, even when covering historical periods, because a live report reflects the chart of accounts as it stands today. **Official report snapshots** (Section 20 — a report's output stored as a fixed point-in-time artifact in R2) **permanently preserve whatever account names appeared at the time the report was generated**, and are never updated when an account is later renamed — a snapshot is a preserved historical document, not a live view, and must continue to read exactly as it did when issued.
- **Default Orthodox parish templates.** AGAPAY provides a default starting chart of accounts appropriate to Orthodox parish and mission operations (offerings, candles, bookstore, clergy compensation, utilities, building fund, etc. — exact template content is a later design decision, not defined here). Parishes customize from this template.
- **Customization without breaking standard reports.** A parish may add, rename, deactivate, or reorganize accounts within the fixed account-type framework. Standard reports (statement of activities, statement of financial position) must be driven by account *type*, not by hardcoded account names or IDs, precisely so that customization never silently breaks a standard report.
- **Monetary amounts must be stored as integer minor units (e.g., cents), never floating-point values.** This is a firm rule, not a preference — floating-point currency arithmetic produces rounding errors that are unacceptable in a ledger that must balance to zero.

---

## 8. Fund Accounting Philosophy

A **fund** in AGAPAY is a self-balancing subdivision of the parish's resources, tracked for accountability to a purpose or restriction — not merely a label.

- **General operating fund** — the default fund for unrestricted, day-to-day parish resources.
- **Donor-restricted funds** — funds whose use is limited by a stipulation from the donor (or grantor) that the parish did not itself impose and generally cannot unilaterally waive.
- **Board-designated funds** — funds the parish council/vestry has earmarked internally; the restriction is self-imposed and, through proper governance action, self-reversible.
- **Internally tracked ministries or purposes** that do not rise to the level of a formal restriction (e.g., "Youth Group" as an informal tracking category) may or may not warrant a full fund versus a simpler tracking dimension — this is a policy question for Section 31, not resolved here.
- **Fund balances** must always be derivable from journal lines tagged to that fund, the same way account balances are (Section 4, Section 21).
- **Transfers between funds** are journal entries, never silent adjustments — a transfer debits one fund's equity and credits another's, with both sides visible.
- **Spending from restricted funds** must be checked against the fund's designated purpose before posting an expense to it. Whether this check is a **hard restriction** (the system blocks the posting) or a **warning** (the system flags it but allows an authorized override) is a policy decision that depends on the parish's own governance practices and, for legally donor-restricted funds, potentially on legal obligations — **this document does not resolve which** (see Section 31). What this document does require: the system must always be able to tell the difference between a donor-restricted fund and a board-designated fund, because the correct answer to "can this be overridden" depends on that distinction, and conflating them would be an accounting-policy error, not just a UX one.
- **Donor designation vs. legal restriction.** A donor writing "for the building fund" on a check is a designation with real accounting significance, but whether it creates a *legally* binding restriction is a legal question this document does not answer. AGAPAY Accounting must record the designation faithfully and flag that legal-restriction status is a policy/legal determination, not something the software concludes on its own.
- **Funds vs. departments/projects/ministries/cost centers.** These are conceptually distinct from funds: a fund has a balance and (often) a restriction; a department/project/cost-center is a reporting dimension for slicing activity that may or may not carry its own balance. Whether AGAPAY Accounting models these as a separate dimension from funds, or folds simple cases into funds, is an open design question (Section 31) — this document requires only that the two concepts not be conflated in the data model once decided.
- **When is a fund required on a journal line?** Every journal line touching an asset, liability, revenue, or expense account should generally carry a fund reference so that fund balances stay derivable; the exact enforcement rule (required on every line vs. required on certain account types) is left to schema design, constrained by the invariant that fund balances must always be fully reconstructable from journal lines — no journal line may be fund-ambiguous.
- **One fund per journal line is the default design assumption, without ambiguity.** Every posted journal line should carry **exactly one fund**, unless and until an explicit, future, entity-wide exception is deliberately introduced and documented as an amendment to this philosophy (for example, a genuine multi-fund allocation mechanism, should one ever be adopted, would need its own explicit design and its own explicit rules — it is not implied or permitted by anything in this document as written). This is a strengthening of the fund-attribution philosophy, not merely a convenience: it exists so that **no posting may ever create an unallocated difference between an accounting entity's total balances and the sum of its fund balances.** If every journal line carries exactly one fund, then by construction the sum of all fund balances always equals the entity's total balances — there is never a residual, unattributed amount sitting outside fund accounting. A design that allowed fund-ambiguous or fund-split lines without an explicit, deliberate allocation mechanism would risk exactly that kind of unallocated gap, which this document treats as unacceptable.

This section identifies where parish accounting policy or accountant review is required rather than asserting legal conclusions; Section 31 formalizes the specific open questions.

---

## 9. Settlement Profiles, Revenue Streams, and Accounting Mappings

AGAPAY already has two operational concepts that predate accounting and must not be confused with accounting concepts:

- **Revenue streams** — operational classifications identifying *what activity generated revenue* (general giving, bookstore, festival, school, cemetery, camp, hall rental, fundraisers — per the existing `profile_type` values). They answer "what kind of thing is this," operationally.
- **Settlement profiles** — operational groupings describing *settlement destination, commerce area, or reporting context* (which Stripe Connect account, which payout path). In AGAPAY's current implementation these are the same underlying record as revenue streams (`settlement_profiles` table, user-facing label "Revenue Streams") — the accounting philosophy treats them as one operational concept with two names, consistent with existing AGAPAY documentation (`docs/settlement-profiles.md`).

**Accounting mappings** are the rules that translate an operational source (a revenue stream/settlement profile, or any other source-event type) into accounting treatment. An accounting mapping may identify:

- the revenue account to credit;
- the fund to post to;
- the Stripe clearing account to use;
- the bank account eventually affected;
- the processing-fee account (for Stripe's cut);
- the refund/contra-revenue account;
- the dispute account;
- the sales-tax liability account;
- future cost-of-goods-sold and inventory accounts.

**Settlement profiles and revenue streams are not substitutes for the chart of accounts or funds.** A settlement profile is an operational label with an `accounting_category` hook (already present, unused, in the existing schema per Phase 0's findings) — it is an *input* to an accounting mapping, never itself a ledger account or a fund. Posting a transaction requires resolving it through a mapping to an actual account and fund; a revenue stream by itself is not a valid posting target.

---

## 10. Posting Engine Philosophy

The posting engine is **the only approved path for creating posted journal entries.** No other code, table write, or process may post a journal entry. The posting engine must enforce, for every posting attempt:

- **Balanced entries** — total debits equal total credits, or the posting is rejected.
- **Valid account status** — every referenced account exists and is active (or, if inactive, the posting is rejected rather than silently allowed).
- **Valid fund usage** — every referenced fund exists and the posting is permitted against it under whatever restriction rules are in force (Section 8).
- **Open accounting period** — the posting date falls within an open period, or the posting is rejected (Section 12).
- **Authorized actor** — the actor (human or system process) has the permission required to create this kind of posting.
- **Valid source** — the entry references a real, identifiable source event.
- **Unique idempotency key** — the same source event cannot post twice; a duplicate attempt is recognized and rejected (or safely no-ops) rather than double-posting.
- **Supported currency** — the entry's currency is one the accounting entity actually operates in.
- **Valid posting date** — a real date, within the open period, consistent with the entry's fiscal year.
- **Complete audit metadata** — actor, timestamp, source reference, and reason (where applicable) are captured as part of posting, not as an afterthought.
- **Atomic creation of entry and lines** — a journal entry and all of its lines are created together or not at all; there is no state where an entry exists with only some of its lines.
- **Rollback on any failure** — any failure partway through posting leaves no partial record behind.
- **Deterministic accounting treatment for the same source event** — given the same source event and the same mapping rules, the posting engine always produces the same journal entry shape. Accounting treatment is not allowed to vary by who triggered the posting or by incidental timing.

**Draft vs. posted entries.** A draft is a not-yet-posted, editable representation of an intended entry (e.g., a bill awaiting approval, a manual entry being composed). A draft has no accounting effect until the posting engine posts it. Once posted, an entry is no longer a draft and Section 11's immutability rules apply.

**System-generated vs. manual entries.** System-generated entries originate from a source event processed automatically (a Stripe webhook, a bookstore sale). Manual entries originate from a human explicitly composing a journal entry. Both go through the same posting engine and the same invariants — "manual" does not mean "less validated."

**Synchronous vs. queued posting.** Posting may happen synchronously (within the request that triggered it) or asynchronously (via a background queue/workflow, once that infrastructure exists per Phase 0's findings). Regardless of which, **the queue itself is never the accounting source of truth** — a message sitting in a queue, processed or not, is not a journal entry. The journal entry exists only once the posting engine has actually created it, atomically, in the parish's accounting D1. A queued-but-not-yet-processed source event represents work to be done, not a financial fact.

---

## 11. Immutability and Corrections

**Draft records** may be edited or deleted before posting, subject to permissions and audit logging. A draft bill, an unsent manual entry, an unissued check — all mutable, all logged when changed.

**Posted journal entries may not be directly edited or deleted.** This is absolute. Once the posting engine has created an entry, its lines are frozen.

**Corrections use one of these mechanisms, never a direct edit:**
- **Reversal entries** — a new entry exactly offsetting a prior posted entry.
- **Correcting entries** — a reversal plus a new, correct posting, when the classification (account/fund) was wrong but the underlying event is still valid.
- **Adjusting entries** — entries that record a change in facts discovered later (e.g., a bill amount was understated), without implying the original entry was invalid at the time it was posted.
- **Void-and-reissue workflows** — for instrument-level records like checks (Section 17), where the *instrument* is voided and a new one issued, while the underlying accounting payment is corrected via reversal/adjustment, not by editing the original payment record.
- **Controlled reopening of periods**, where permitted, as an exceptional path (Section 12) — not a routine correction tool.

### Distinguishing what "correcting" something actually means

- **Correcting a memo or nonfinancial metadata** (a typo in a description field) on a posted entry may be permitted as a direct edit *if and only if* the field carries no accounting effect (does not affect any account, fund, amount, or date) — this must be a narrowly scoped exception, not a precedent for editing anything else on a posted entry.
- **Correcting account classification** on a posted entry requires a correcting entry (reversal + repost to the right account) — never a direct account-ID change on the existing line.
- **Correcting fund classification** likewise requires a correcting entry — never a direct fund-ID change.
- **Changing an amount** on a posted entry requires a correcting or adjusting entry — never a direct amount edit.
- **Changing a posting date** on a posted entry is treated the same as any other classification correction — requires a new entry, because posting date determines which period's statements the entry affects, and silently moving that after the fact would corrupt period reporting.
- **Voiding a check** cancels the check instrument (Section 17) — it does not, by itself, reverse the underlying accounting payment; that requires its own correction if the payment itself needs to be undone.
- **Deleting a draft bill** is a real delete — the bill was never posted, so nothing needs preserving beyond the normal audit log of "a draft was deleted."
- **Reversing a posted bill** creates an offsetting entry against the AP control account and the original expense/asset account — the original bill's posted entry remains, visible, in the ledger.
- **Reopening a reconciliation** is a controlled, permission-gated, audited action (Section 18) — not a routine correction, and not equivalent to any of the above.

**Every correction must preserve the original record and create an audit trail.** There is no correction mechanism in this system that makes a prior posted fact disappear from history.

---

## 12. Accounting Periods and Closing

- **Fiscal year** — the accounting entity's defined annual reporting cycle.
- **Monthly or custom accounting periods** — subdivisions of the fiscal year used for closing granularity; monthly is the expected default.
- **Open periods** accept ordinary posting.
- **Soft close** — a period is closed to routine entry but can still accept postings from an authorized user without a full reopen process (e.g., a treasurer finishing up a few late items within a defined grace window). Exact mechanics are an implementation decision; the philosophy requirement is that soft-close still be logged and still be distinguishable from a fully open period in reporting.
- **Hard close / period lock** — a period rejects all ordinary posting; only a formal reopen (below) can post into it again.
- **Year-end close** — the fiscal-year-level closing process, which in fund accounting typically involves rolling revenue/expense activity into net assets/fund equity per fund. Exact mechanics are a later design decision; the philosophy requirement is that it be a controlled, auditable, reversible-only-via-reopen process, not an ad hoc report.
- **Reopening authority** is restricted to specifically authorized roles (Section 23) and must never be available to the same broad set of users who can post ordinary entries.
- **Prior-period adjustment** — an entry posted into a still-open (or specifically reopened) period that corrects something from an earlier period; distinguished in reporting from ordinary current-period activity where the report format calls for that distinction.

**Prohibited in closed periods:** ordinary journal posting, bill posting, and check issuance dated into the closed period. **Permitted only via formal reopen:** any posting whose posting date falls inside a closed period.

**Late Stripe events, refunds, or adjustments arriving after a period closes** must never be silently posted into the closed period and must never be silently redated into the current period without a decision rule. The system's default (absent a specific accounting-policy decision — see Section 31) should be: post such events into the current open period with a clear cross-reference back to the original period's entry, rather than either reopening the old period automatically or discarding the event. Whether some categories of late event (e.g., a refund on a donation from a already-closed period) should instead trigger a formal reopen request is a policy question for accountant review (Section 31), not resolved here.

**Reopening a period is an exceptional, permission-controlled, audited action** — never a routine workflow, never available to the same role that does day-to-day bookkeeping without additional authorization, and always logged with a reason.

---

## 13. Cash Basis and Accrual Basis

**The underlying ledger must always remain accrual-capable.** This is structural, not a per-parish setting. Bills are entered into AP when received (an accrual concept) regardless of whether a parish ultimately *reports* on a cash basis; a bill's existence and its payment are two separate journal entries (or, cash-basis reporting-wise, are reconciled to look like one event — see below).

- **How bills and accounts payable work:** a bill posts a liability (AP) and an expense/asset when entered/approved (accrual event); paying it posts a reduction of AP and a reduction of cash (a second, later event). This two-step structure exists regardless of reporting basis.
- **How cash-basis reports may be generated:** a cash-basis report is a *reporting transformation* over the same accrual-capable ledger, not a different ledger and not a simple filter. Producing a correct cash-basis report requires **deterministic reporting logic that associates payments with their underlying accrual transactions** (e.g., matching a payment back to the bill or bills it settles) — it is not sufficient to merely include "the entries that touch a cash account" and call the result cash-basis, because that naive approach breaks down in ordinary cases such as: a **partial payment** (only part of a bill's accrual amount has actually been paid in cash so far), a **vendor credit** applied against a bill (reduces the cash-basis expense without itself being a cash movement), a **split-account bill** (a single payment settling a bill whose accrual-side lines were posted to multiple accounts/funds, which the cash-basis view must still attribute correctly), and a **prepaid expense** (cash paid in one period for a benefit accrual-recognizes across future periods). Each of these requires the reporting logic to walk the payment-to-accrual linkage explicitly and deterministically, not to infer cash-basis treatment from which account a line happens to touch.
- **Whether a parish may choose a reporting basis:** yes, at the reporting layer — a parish should be able to view statements on a cash basis or an accrual basis from the same underlying data. This document recommends supporting both from day one at the reporting layer, since the ledger structure already requires accrual capability; restricting parishes to only one *reporting* view would discard information the ledger already has.
- **How switching reporting basis affects historical data:** switching which basis a report is *viewed* in must not alter any journal entry — it only changes which entries/timing a report includes or how it aggregates them. Historical journal entries are never rewritten because a parish changed its preferred reporting basis.
- **Why the software must not mix cash and accrual treatment inconsistently:** if some transaction types post on an accrual basis and others post on a cash basis *at the ledger level* (rather than the reporting level), the ledger itself becomes internally inconsistent and no report — cash or accrual — can be trusted. The ledger records economic events consistently; only the *report* varies by basis.

**Recommended approach:** build the ledger accrual-capable from the start (non-negotiable per Section 3), and offer cash-basis reporting as a first-class report option for Mission-tier parishes who think in cash terms, without ever weakening the underlying ledger's accrual structure. **Flag for accountant review:** the precise mechanics of cash-basis statement generation from an accrual ledger (which is a well-understood nonprofit-accounting technique, but has real edge cases — e.g., partial payments, prepaid expenses) should be validated with an experienced nonprofit accountant before Phase 1 reporting design (Section 31).

---

## 14. Donation Posting Philosophy

Conceptual lifecycle (illustrative debit/credit examples — not database design):

1. **Gross donation received via Stripe.** A donor gives $100 to the General Fund.
   - Debit: Stripe Clearing (asset) $100
   - Credit: Contribution Revenue — General Fund $100
2. **Restricted or designated fund.** If the $100 was designated to the Building Fund instead:
   - Debit: Stripe Clearing (asset) $100
   - Credit: Contribution Revenue — Building Fund $100
   (Same account type, different fund — the fund tag is what carries the restriction/designation, not a different account.)
3. **Stripe processing fee.** Stripe takes a $3.20 fee on payout:
   - Debit: Stripe Processing Fee Expense $3.20
   - Credit: Stripe Clearing (asset) $3.20
4. **Payout to parish bank account.** The net $96.80 lands in the parish's bank:
   - Debit: Parish Bank Account (asset) $96.80
   - Credit: Stripe Clearing (asset) $96.80
5. **Full refund.** The $100 donation is refunded before payout:
   - Debit: Contribution Revenue — General Fund $100 (or a contra-revenue "Refunded Contributions" account, per accounting-policy decision — Section 31)
   - Credit: Stripe Clearing (asset) $100
6. **Partial refund.** Same treatment as a full refund, scaled to the refunded amount, leaving the remainder of the original entry's economic effect intact.
7. **Failed payment.** No journal entry — a failed payment never became a completed operational transaction, so it never became a posting candidate in the first place.
8. **Chargeback / dispute.** A provisional reversal of the original contribution revenue, generally to a distinct "Disputed Contributions" holding treatment rather than being conflated with an ordinary refund, pending resolution — exact account structure is a later design decision; the philosophy requirement is that a dispute be visibly distinguishable from a voluntary refund in the ledger, because they carry different operational and reporting implications.
9. **Recovered dispute** (the parish wins the dispute). A new entry restoring the previously-disputed contribution revenue, referencing the original entry and the dispute entry.
10. **Donation reassignment to a different fund.** This covers two different situations, and the correct treatment depends on which one applies — they must not be conflated. **Situation A — the original posting was incorrect** (e.g., the donor's designation was misread or mis-entered, and the gift was posted to the wrong fund from the start). This is not a transfer; it is an **accounting reclassification / correcting entry** (Section 11) — a reversal of the incorrect fund posting plus a correct posting to the intended fund, both referencing the original entry, because the *fact* being corrected is that the original entry never reflected reality. **Situation B — the original posting was correct at the time, but a later valid change occurs** (for example, the donor authorizes moving their gift to a different fund, or a restriction is released per parish policy). This *is* a fund-to-fund transfer (Section 8) or a restriction-release entry, following the parish's interfund-transfer or restriction-release policy — the original entry was right when posted, and the transfer records a new, subsequent economic event, not a correction of the past.
11. **Contribution statement implications.** Year-end/annual contribution statements to donors must be generated from posted journal-line data (or from the donor-offering operational records reconciled against posted entries — exact source is a later design decision), never from a number that could diverge from the ledger.

**Which date controls, and where policy review is required:** the **transaction date** (when the donor's payment actually completed, per Stripe) should generally drive the donor-facing contribution-statement date, while the **posting date** (which accounting period the entry lands in) should generally match the transaction date unless a specific late-event/period-close rule (Section 12) applies. Edge cases — a donation made December 31 but not settled by Stripe until January 2 — require an explicit accounting-policy decision (Section 31) about which date the parish's contribution statements and financial statements should follow; this document does not resolve that question.

---

## 15. Parish Commerce Posting Philosophy

Conceptual lifecycle:

1. **Bookstore sale (taxable).** A parishioner buys a $20 icon, $1.50 sales tax collected:
   - Debit: Stripe Clearing (asset) $21.50
   - Credit: Bookstore Sales Revenue $20.00
   - Credit: Sales Tax Liability $1.50
2. **Tax-exempt sale.** Same as above without the tax liability line, when the sale is validly exempt per the parish's tax-exemption workflow (already implemented operationally per Phase 0's findings).
3. **Stripe fee and payout** follow the same clearing-account pattern as Section 14, steps 3–4.
4. **Refund.** Reverses revenue and (if applicable) the tax liability, symmetric to Section 14's refund treatment.
5. **Future inventory / future cost of goods sold.** Not part of initial scope. **Inventory accounting is explicitly deferred until the inventory module can reliably supply quantity and cost data** — posting COGS without trustworthy quantity/cost inputs would produce ledger entries that look precise but aren't, which is worse than not posting COGS at all. Until then, bookstore sales post revenue only, with no inventory-asset or COGS-expense entries.

**Commerce order records (the operational data in AGAPAY's existing commerce tables) remain operational records; journal entries remain accounting records.** A commerce order describes what was sold, to whom, for how much, per the checkout workflow. The journal entry describes how that sale affects the parish's books. Neither replaces the other, and a commerce order is never itself queried as if it were the ledger.

---

## 16. Accounts Payable Philosophy

- **Vendor** — a payee record, distinct from a donor.
- **Bill** — a vendor's request for payment; **bill line** — an individual charge within a bill, which may need its own account/fund classification (e.g., a single vendor invoice covering both a Building Fund repair and a General Fund supply purchase).
- **Due date** — informational/workflow field, not itself an accounting posting trigger.
- **Approval** — a required step (Parish-tier) before a bill posts, performed by a role distinct from whoever entered the bill, where separation of duties is in force (Section 23).
- **Posting** — a bill becomes a journal entry (debit expense/asset, credit AP control account) only once approved (or, for Mission-tier without a distinct approval step, once entered by an authorized user) — either way, through the posting engine, never a side effect of data entry alone.
- **Partial payment** — a payment posts against the specific bill, reducing AP and cash by the paid amount, while **preserving the remaining liability** as a continuing AP balance on that bill.
- **Vendor credit** — an explicit record (a credit memo from a vendor) that reduces a future bill or is applied against an outstanding balance; never silently netted without its own record.
- **Recurring bill** — a template that generates new bill drafts on a schedule; each generated bill is its own draft, approved and posted independently — a recurring schedule is not itself a posting mechanism.
- **Voided bill** — only valid for a bill that has not been posted (a draft); a posted bill is reversed, not voided (Section 11).
- **Deleted draft** — a real delete, permitted only pre-posting.
- **Payment allocation** — when a payment covers multiple bills, or a bill is paid across multiple payments, the allocation between bill(s) and payment(s) must be explicit and traceable.
- **AP control account** — the general-ledger account that must always equal the sum of all outstanding (unpaid or partially paid) bills in the AP subledger.

**Requirements:**
- **AP subledger totals must reconcile to the general-ledger AP control account** — if they ever diverge, that is a system defect requiring investigation, not a discrepancy to paper over (see Section 28's "no silent balancing entries").
- **A posted bill cannot simply be deleted.** Ever. Only reversed.
- **Partial payments preserve the remaining liability** — never zero out a bill's AP balance except through an actual, equal-in-total payment or reversal.
- **Vendor credits are explicit records** — never an informal adjustment to a bill's amount.
- **Payment workflows do not bypass the AP ledger** — there is no "quick pay" path that moves cash without an AP-reducing journal entry.

**Cash-basis vs. accrual-basis treatment:** the AP subledger and control account exist regardless of a parish's chosen reporting basis (accrual is structural, per Section 13); a cash-basis report simply recognizes the expense at payment rather than at bill-posting, without changing that the bill was, in fact, recorded as a liability when received.

---

## 17. Check Printing Philosophy

- **Bill approval, payment preparation, check issuance, check printing, and check clearing are five distinct steps, only one of which creates the accounting payment.** **Bill approval** (Section 16) authorizes that a bill *may* be paid — it does not itself create a payment journal entry; an approved bill is still an open AP liability until it is actually paid. **Payment preparation** is the act of selecting an approved bill (or bills) for payment and assembling the payment (amount, payee, bank account, allocation across bills) — still no accounting payment exists at this stage. **Check issuance** is the step that **creates the accounting payment**: a check number and issue date are assigned, and it is at this moment — not at approval, and not at printing — that the payment journal entry posts (AP reduced, cash reduced). **Check printing** (and reprinting) is a downstream, purely document-generation action against an already-issued check record and **never creates or duplicates an accounting event** (see Requirements, below). **Check clearing** is a bank-reconciliation fact (Section 18), tracked separately from issuance, and does not itself trigger a journal entry — issuance already reduced the book cash balance; clearing only confirms the bank agrees.
- **Printed check** — a physical/PDF representation of an already-issued accounting payment.
- **Check number** — must be **unique within a bank account** (not necessarily globally unique across the parish, if a parish has multiple bank accounts with independent check sequences).
- **Check PDF** — a private R2 document (Section 25), generated from the payment record, not a source of truth for whether the payment happened.
- **Check stock / blank-stock MICR printing** is **outside the initial scope unless separately approved** — this document does not assume MICR-line generation for pre-printed blank check stock is part of Mission- or Parish-tier's initial release.
- **Check register** — a report/view listing checks issued against a bank account, derived from payment records (Section 20's derivation rules apply — it is a view, not a separate authoritative list).
- **Void** — cancels a check *instrument* that was issued in error or damaged before use/deposit, without implying the underlying accounting payment was wrong; if the underlying payment itself needs undoing, that's a reversal of the payment (Section 11), separate from voiding the check number.
- **Stop payment** — an operational/banking action (contacting the bank) that must be reflected in the accounting record once confirmed, but is not itself an accounting action AGAPAY performs — it's real-world evidence to be recorded.
- **Reprint vs. reissue.** A **reprint** regenerates the PDF/physical output for the *same* check record (e.g., a printer jam) — **it must not create a duplicate accounting payment.** A **reissue** creates a **new check record** (new check number, referencing the void of the original) while **preserving the original** (voided) check record in history — used when the original check was lost, damaged in a way that requires a new check number, or stopped at the bank.

**Requirements:**
- **Printing or reprinting a check does not create duplicate accounting payments** — the payment posting happens once, at payment-recording time; printing is purely a document-generation action against that existing record.
- **Check numbers are unique within a bank account.**
- **Voiding follows a controlled accounting workflow** — logged, permissioned, and distinguishing "voided before any economic effect" from "needs a payment reversal too."
- **Reissuing creates a new check record and preserves the original** — never overwrites the original check's data.
- **Check PDFs are private documents** — never publicly accessible (Section 25).

**Whether a printed check, rather than a cleared check, reduces cash in the ledger:** the accounting payment (and therefore the cash reduction) is recorded at **check issuance** — when a check number and issue date are assigned — not at bill approval, not at check printing, and not when the check physically clears the bank. This is standard practice (checks outstanding but not yet cashed still reduce the book cash balance) and is why **bank reconciliation** (Section 18) — not the printing of the check — is where "has this check actually cleared" gets tracked, via outstanding-check status.

---

## 18. Bank Accounts and Reconciliation Philosophy

- **Ledger bank account** — the accounting-domain representation of a real parish bank account, holding a cash-asset balance derived from journal lines.
- **Imported bank transaction** — raw data from a bank feed or statement import; evidence, not a ledger entry.
- **Matched transaction** — an imported bank transaction that has been linked (manually or automatically) to a specific journal line/payment.
- **Cleared transaction** — a matched transaction confirmed to have actually occurred at the bank (money is really in/out).
- **Reconciled transaction** — a cleared transaction that has been included in a completed reconciliation for its bank account and period.
- **Outstanding check** — a posted payment (Section 16/17) not yet matched/cleared against a bank transaction.
- **Outstanding deposit** — a posted deposit not yet matched/cleared.
- **Reconciliation adjustment** — a journal entry created specifically to resolve a genuine discrepancy discovered during reconciliation (e.g., a bank fee never separately entered) — itself a normal journal entry, going through the posting engine, never a special back-door.
- **Reconciliation lock** — once a reconciliation is completed for a period/bank account, its matched/cleared/reconciled transactions become immutable absent a formal reopen.

**Requirements:**
- **Imported bank transactions do not replace journal entries.** A bank feed showing a $500 deposit is not, itself, a $500 contribution-revenue posting — matching/reconciliation connects the two; it does not create the accounting fact.
- **Reconciliation compares bank evidence against ledger records** — it is a verification process over two independently-arrived-at pictures of reality, not a way to generate ledger entries wholesale from a bank feed.
- **Completed reconciliations are immutable unless reopened with elevated authority** — symmetric to period closing (Section 12).
- **A bank balance shown by an integration is not automatically the book balance.** The book (ledger) balance and the bank's reported balance are reconciled to each other, explaining any difference (outstanding checks/deposits, timing) — the software must never silently treat the bank's number as more correct than the ledger's, or vice versa, without that reconciliation process.
- **Reconciliation discrepancies must be explicit, not silently forced.** If the ledger and the bank don't agree after accounting for known outstanding items, that discrepancy must be surfaced and investigated (or recorded as an explicit reconciliation adjustment with a reason) — never auto-corrected by a plug entry (Section 29).

**Stripe clearing reconciliation is addressed separately from ordinary bank reconciliation**, because the Stripe Clearing account (Section 6) is reconciled against Stripe's own records (balance transactions, payout reports) rather than against a bank statement — it has its own evidence source and its own matching logic, even though it eventually feeds into the same parish bank account once payouts land.

---

## 19. Budgeting Philosophy

- **Original budget** — the initially approved budget for a fiscal year.
- **Revised budget** — a later, formally revised version.
- **Budget version** — the system must retain every version, not just the latest, so history is preserved.
- **Monthly allocation** — an annual budget figure may be broken into monthly targets for finer-grained variance reporting.
- **Fund budget / account budget** — budgets may be set at the fund level, the account level, or both, depending on how granular a parish wants to plan.
- **Department or project budget** — depends on whether/how department-or-project dimensions are ultimately modeled (Section 8's open question); not resolved here.
- **Actual vs. budget / variance** — a report comparing posted actuals (from journal lines) against the applicable budget figures.

**Budgets do not create journal entries and are not part of the authoritative ledger.** A budget is a planning artifact compared against the ledger in reports; it never posts, never affects account balances, and is never treated as an accounting fact.

**Budget revisions must preserve history** — revising a budget creates a new version; it does not overwrite the prior version's figures, so that "what did we originally plan" remains answerable after a revision.

---

## 20. Reporting Philosophy

Reports must:
- **Derive from posted journal lines** — never from draft entries, never from operational records directly, never from a hand-maintained parallel figure.
- **Respect date range and fiscal period** — a report's numbers must correctly reflect exactly the period requested.
- **Respect account and fund classifications** — reports must correctly group/exclude by account type and fund per the report's purpose.
- **Provide drill-down to source entries** — a user should be able to go from a report total down to the individual journal entries (and, from there, the source event) that produced it.
- **Use consistent sign conventions** — debits/credits displayed consistently across every report, without ad hoc sign flips that make one report's "positive" mean the opposite of another's.
- **Disclose reporting basis** — every financial statement must state whether it is cash-basis or accrual-basis (Section 13).
- **Distinguish draft from official reports** — a report generated on demand against live (possibly still-changing, within an open period) data is distinct from an official snapshot (below).
- **Remain reproducible** — the same report, same parameters, same underlying posted data, produces the same output at any later time.
- **Support export** — reports must be exportable (format is an implementation decision) for treasurer/council/accountant use outside the platform.
- **Show comparative periods where appropriate** — e.g., this month vs. last month, this year vs. last year, as is standard nonprofit-reporting practice.

**Reports this document requires the system to support (conceptually, not designed here):**
- Trial balance
- General ledger
- Statement of financial position (balance sheet analog)
- Statement of activities (income statement analog, by fund)
- Fund-balance report
- Budget vs. actual
- AP aging
- Bank-reconciliation report
- Check register
- Treasurer packet (a bundled set of the above, for regular council/treasurer review)

**Official report snapshots** are a report's output, generated once and stored in R2 as a fixed point-in-time artifact (e.g., a month-end financial package delivered to the parish council). **Historical snapshots do not change after later corrections** to the underlying ledger — a snapshot represents "what the books said as of the date it was generated," and a subsequent correcting entry does not retroactively alter a previously issued snapshot. If a correction is significant enough to warrant it, a *new* snapshot reflecting the correction is generated and both remain available, clearly dated, rather than the old one being silently replaced.

---

## 21. Derived Balances and Performance

- **Journal lines are authoritative** (restated from Section 4 because this section's rules depend on it).
- **Cached account balances, fund balances, and report aggregates are derived** — computed from journal lines, stored only for performance, never as an independent fact.
- **Derived tables must be rebuildable** — at any time, a rebuild process must be able to recompute every cached balance/aggregate from journal lines alone and produce the same result as before (absent an actual bug).
- **Performance optimizations must not create a second independent ledger.** A cache that can drift from journal lines and be trusted anyway is not a performance optimization — it's a second, competing source of truth, which this document prohibits (Section 29).
- **Rebuild and verification tools must exist** — the system must be able to, on demand, recompute derived balances and compare them against currently cached values.
- **Discrepancies between derived data and journal lines must fail visibly** — if a rebuild produces a different number than the current cache, that is surfaced as an error/alert, never silently overwritten without record, and never hidden from whoever is responsible for investigating it.

**Report snapshots (Section 20) vs. cached balances** are different tools for different purposes: a cached balance is a performance shortcut for a number that should always match a fresh computation from current journal lines; a report snapshot is a deliberately preserved historical artifact that is *expected* to eventually diverge from a fresh computation (because corrections happened after it was taken) and is valuable precisely because it doesn't change.

---

## 22. Audit Trail Philosophy

**Must be audited**, at minimum: login-sensitive accounting actions, role changes, account creation and deactivation, fund changes, journal posting, reversal, bill approval, check generation, check download, void and reissue, reconciliation completion and reopening, period closing and reopening, mapping changes (Section 9), migration actions, backup and restore, support access, and data export.

**Every audit record requires:** actor, parish, timestamp, action, affected record, correlation ID, before-and-after information where appropriate, and a reason for privileged changes (e.g., reopening a period, support access).

**Relationship between central platform audit logs and parish accounting audit logs:** AGAPAY already has a central, append-only `audit_log` table (confirmed in Phase 0) that is a reasonable model to extend, but accounting-domain actions that touch a parish's accounting D1 should be logged **within that parish's accounting D1** as the primary, parish-scoped audit trail (so that a parish's own export/backup carries its complete accounting audit history with it), while cross-parish/platform-level actions (e.g., AGAPAY support accessing a parish's accounting data, provisioning a new accounting database) are logged centrally, because those are actions *about* the parish taken from outside it, not actions *within* its books. A single privileged action (e.g., a support engineer reopening a period at a treasurer's request) may reasonably produce entries in both: a central record of "support accessed parish X's accounting" and a parish-local record of "period reopened, by [support actor], reason: [x]."

---

## 23. Roles and Separation of Duties

Future roles include: rector, treasurer, bookkeeper, AP clerk, bill approver, check preparer, check signer, parish-council viewer, accountant, auditor, and AGAPAY support administrator.

- **Role names alone are insufficient.** "Treasurer" does not, by itself, define what a person can do — the system must define actual **capabilities** (post a journal entry, approve a bill, reopen a period, generate a check, view-only access, etc.) and assign roles as bundles of capabilities.
- **Permissions should be capability-based**, not a single fixed role check scattered through the code (echoing Phase 0's finding that today's parish access model is a single shared credential with no role distinction at all — this document sets the target the future system must reach, not a description of what exists today).
- **Small missions may combine duties** — a one-person mission treasurer may hold every accounting capability. This is a legitimate, supported configuration, not a workaround.
- **Larger parishes should be able to separate duties** — the system must support (not require) distinct people holding bill-entry, bill-approval, and check-signing capabilities.
- **The system must reveal when one person performs multiple sensitive actions** on the same transaction (e.g., the same person entered and approved the same bill) — visibly, in reporting/audit review, even where policy permits it for a small mission. Visibility is the control when structural separation isn't practical.
- **AGAPAY support access must be exceptional, time-limited where practical, and fully audited.** Support staff are not treasurers; access to a parish's accounting data for support purposes is a distinct, logged, and — wherever the platform can practically implement it — time-bounded event, not standing access.

This document does not design the complete role/permission schema (deferred to later implementation), but establishes that the target system is capability-based, supports both combined and separated duty configurations, and makes duty-combination visible rather than either forbidding it outright (which would break small missions) or hiding it (which would defeat the purpose of separation of duties for parishes that do rely on it).

---

## 24. Multi-Tenant and Database Isolation Philosophy

This restates and formalizes, as accounting doctrine, the architecture Phase 0 recommended:

- **The central database is the control plane** — parish identity, subscriptions, the accounting-database registry, and operational (non-ledger) records live there.
- **Each parish accounting D1 contains only that parish's authoritative accounting data.** No parish's accounting database ever contains another parish's journal entries, accounts, or funds.
- **The browser must never select a database identifier.** A client request may say "I am acting for parish X" (via its authenticated session), but it never supplies, and is never trusted to supply, which physical database that maps to.
- **Database resolution must occur server-side**, from the authenticated session/context, against the central registry — never from a client-supplied value, however it's disguised (a hidden field, a URL parameter, a header).
- **No accounting service may accept an arbitrary database binding from client input.** The set of databases any given request can possibly touch is determined entirely by server-side authorization, before any query is formed.
- **Accounting files must be parish-isolated in R2** — every accounting document's ownership must be verifiable server-side before it is streamed to anyone (Section 25).
- **Cross-parish access tests are mandatory.** Before any accounting feature ships, there must be an automated test that attempts (and fails) to access Parish A's accounting data using Parish B's authenticated context.
- **Database-specific backup, restore, export, and migration are first-class requirements** — every parish accounting database must be independently backable-up, restorable, exportable, and migratable, not merely covered as a side effect of a platform-wide backup process.

**On the risk of static D1 binding limits:** Phase 0 identified that Cloudflare D1 bindings are static and that there is a practical ceiling on how many can be held by a small number of Workers before a different architecture (e.g., Workers for Platforms/dispatch namespaces) is needed. This document does not attempt to resolve that ceiling or prescribe the eventual architecture — it only requires that whatever architecture is chosen, at any scale, continue to satisfy every isolation requirement above. Scale is an engineering problem to solve within these constraints, not a reason to relax them.

---

## 25. File and Document Philosophy

R2 documents relevant to accounting include: invoices, receipts, bank statements, checks, reports, migration files, and backups.

- **Files support accounting records but are not themselves journal entries.** An invoice PDF attached to a bill documents the bill; it does not, by its existence, mean the bill was entered correctly or at all.
- **Every object must have parish ownership metadata**, checked server-side before any access is granted (consistent with Phase 0's finding that AGAPAY's existing private-document pattern already does this — the accounting bucket must follow the same discipline).
- **Access must be authorized** — every read of an accounting document goes through an authenticated, parish-scoped check, never a bare object-key lookup.
- **Private documents must never use public URLs.** No accounting document bucket may ever have a public `r2.dev` URL enabled, following the existing pattern already established for `TAX_EXEMPTION_DOCS` and `GIVING_STATEMENTS`.
- **Deletion and retention must follow accounting policy**, not merely storage-cost convenience — retention periods for financial documents may carry legal/tax significance (Section 31 flags where accountant/legal review applies) and must not be treated as a routine cleanup decision.
- **Checks and migration files require heightened protection** given their sensitivity (checks: bank account/routing details; migration files: potentially complete historical financial data) beyond the baseline private-document handling.
- **File hashes or checksums may be used for integrity verification** — to detect corruption or tampering of stored financial documents, particularly for backups and migration files where integrity matters most.

---

## 26. Migration Philosophy

How historical (Aplos) data becomes authoritative AGAPAY data:

- **Source preservation** — the original Aplos export, as received, is preserved unmodified as a reference artifact, separate from any working/staging copy.
- **Raw import files** are staged, not posted.
- **Staging** — imported data lives in a staging area, inspectable and correctable, before any of it becomes a posted journal entry.
- **Account mapping / fund mapping** — every Aplos account and fund must be explicitly mapped to an AGAPAY account/fund before its historical transactions can be posted; unmapped source data is not silently dropped or silently guessed at.
- **Validation** — imported data is checked for internal consistency (e.g., do Aplos's own reported balances match the sum of its transactions) before being trusted.
- **Balancing** — the migrated data, once posted, must balance exactly the same way any other ledger data must (Section 3) — a migration that "mostly balances" is not acceptable; discrepancies must be resolved or explicitly, visibly flagged as unreconciled opening items, never silently plugged (Section 29).
- **Duplicate prevention** — a migration must not be re-runnable in a way that posts the same historical data twice.
- **Lineage** — every migrated journal entry must be traceable back to the specific source row(s) in the original Aplos export that produced it.
- **Treasurer approval** — a parish's treasurer (or equivalent authorized role) must explicitly approve a migration batch before it posts, since they are the one accountable for whether the imported history is correct.
- **Immutable migration batch** — once approved and posted, a migration batch is subject to the same immutability rules as any other posted data (Section 11) — corrections happen via adjusting entries, not by re-running or editing the migration.
- **Rollback or restart** — before a migration batch is approved/posted, it must be possible to discard and restart it; after posting, "rollback" means a reversal, not a delete (consistent with Section 11).
- **Current-year vs. full-history migration** — a parish may choose to migrate only the current fiscal year's activity plus opening balances, or a deeper history; either is a legitimate scope choice, but the scope chosen must be explicit and documented, not ambiguous.
- **Opening-balance migration** — where full history isn't migrated, opening balances (as of the cutover date) must themselves be posted as an explicit, balanced journal entry (or set of entries) per fund/account, with clear labeling that they represent an opening position rather than ordinary activity.

**Imported data must not be trusted merely because it came from Aplos.** Aplos's own numbers may themselves contain errors, and the validation/balancing/approval steps above exist specifically because "it's what the old system said" is not, by itself, sufficient grounds for AGAPAY to treat something as an authoritative accounting fact.

---

## 27. Backup and Recovery Philosophy

- **Point-in-time recovery** — the ability to restore a parish's accounting database (or the central database) to a specific prior moment.
- **Scheduled exports** — regular, automated exports of accounting data, independent of Cloudflare's own platform-level backup mechanisms.
- **Month-end packages** — a durable, exportable bundle (financial statements + underlying data reference) generated at each month's close, useful both as a governance artifact and as a recovery aid.
- **R2 backup storage** — exports/backups are stored the same way any other sensitive accounting document is (Section 25): private, parish-scoped, access-controlled.
- **Restore testing** — the ability to restore must be periodically tested against a non-production target, not merely assumed to work because a backup file exists (this document notes Phase 0 found AGAPAY already does this for the central database via a restore-test database pattern — the same discipline must extend to per-parish accounting databases).
- **Parish self-export** — a parish should be able to export its own accounting data on demand, independent of AGAPAY-initiated backups, both for the parish's own peace of mind and because parishes may reasonably want a portable copy of their own books.
- **Disaster recovery** — a defined process for what happens if a parish accounting database (or the whole platform) becomes unavailable or corrupted.
- **Restore authorization** — restoring data (especially overwriting current data) is a privileged, audited action, never available casually.
- **Post-restore validation** — after any restore, the restored data must be checked against ledger invariants (balances, journal-entry balance-to-zero, etc.) before being treated as live again.

**Requirements:**
- **Cloudflare Time Travel (D1's built-in point-in-time recovery) alone is insufficient.** It is a useful safety net, not a substitute for AGAPAY's own tested, application-aware backup/restore/export process — Time Travel doesn't know what a "balanced ledger" looks like; AGAPAY's own validation does.
- **Backup success must be verified** — a backup job that "ran" is not the same as a backup that is confirmed usable.
- **Restores must be tested** — not merely assumed, per the restore-testing requirement above.
- **Restoration must preserve audit evidence** — a restore must not silently erase the audit trail of what happened between the backup point and the restore point; that gap itself should be recorded.
- **A pre-restore backup should be taken before overwriting current data** — so that a restore is itself reversible.

---

## 28. Idempotency and Failure Handling

Expected behavior for each failure mode:

- **Stripe sends a duplicate event** — recognized via idempotency key (Section 10) and safely no-op'd; never double-posted. (AGAPAY already has a working pattern for this at the webhook-receipt layer per Phase 0's findings; the accounting posting layer must extend the same discipline to the posting step itself, since receiving a webhook once and posting it once are two different guarantees that both must hold.)
- **A queue retries** — the retried message must be safely reprocessable without a duplicate posting, via the same idempotency-key mechanism.
- **A Worker times out** — any partially-completed posting attempt must not leave a partial journal entry behind (Section 10's atomicity requirement); on retry/recovery, the system must be able to tell whether the original attempt actually completed before retrying.
- **A D1 write partially fails** — the posting engine's atomic-batch requirement (Section 10) prevents a half-written entry; if the platform-level guarantee is ever violated, that is treated as a critical defect, not a normal case to design around silently.
- **An R2 upload succeeds but D1 metadata fails** — the orphaned R2 object is not treated as a valid accounting document until its metadata record exists; a cleanup/reconciliation process should be able to detect and handle orphaned objects, but the failure must be visible, not silently ignored.
- **Report generation fails** — the report simply fails visibly; it must never fall back to partial or estimated data presented as if it were complete and accurate.
- **A migration partially succeeds** — per Section 26, a migration batch is all-or-nothing at the posting step; a partial migration failure halts before posting, is surfaced, and is corrected/restarted in staging, never posted in a partial state.
- **A check PDF generation fails** — the underlying accounting payment record is unaffected (it was already posted, per Section 17's requirement that printing is downstream of posting); only the document-generation step needs retrying.
- **A posting event cannot map to an account or fund** (no accounting mapping exists for a given revenue stream, or a mapping is misconfigured) — the posting is **rejected and surfaced as an error requiring administrative attention**; it must never be posted to a default/guess account silently, because that would misclassify the transaction under a "resolved" appearance while actually hiding a real configuration gap.

**Requirements across all of the above:**
- **Fail-closed behavior** — when in doubt, don't post, rather than post something possibly wrong.
- **Visible error state** — failures are surfaced to someone who can act on them, not swallowed.
- **Retry-safe processing** — every retryable operation is safe to retry because of idempotency keys, not because retries are assumed to be rare.
- **No silent balancing entries** — the system never invents a "plug" line to force an entry to balance when the real inputs don't; an unbalanced attempt is rejected, not fixed by fabricating a number (formalized further in Section 29).
- **No duplicate journal postings.**
- **Administrative repair tools that preserve auditability** — any tool built to help an admin fix a stuck/failed state must itself post through the normal posting engine and normal audit logging, never bypass them "because it's just a repair."
- **Dead-letter or failed-job visibility** — failed background processing must be visible somewhere a human will actually see it, not just logged and forgotten (Phase 0 noted AGAPAY currently has no queue/dead-letter infrastructure at all — this is a requirement for whatever background-processing system is eventually built, not a description of something that exists today).

---

## 29. Prohibited Design Patterns

The following are prohibited in AGAPAY Accounting, without exception absent a formal amendment to this document:

1. Floating-point monetary values, anywhere in the accounting domain.
2. Direct journal-table writes from route handlers, background jobs, or any code outside the posting engine.
3. Editing posted journal lines.
4. Deleting posted financial history.
5. Storing authoritative accounting state in KV.
6. Storing receipt or PDF bodies in D1.
7. Trusting client-supplied database IDs or parish identifiers for accounting-database resolution.
8. Relying only on UI-layer validation for any accounting invariant (balance, permission, period status, etc.) — the posting engine enforces it server-side regardless of what the UI already checked.
9. Silently creating balancing/plug entries to force an unbalanced attempt to appear balanced.
10. Allowing report-generation code to modify accounting data as a side effect.
11. Allowing background jobs or queues to be treated as the accounting source of truth (Section 10) — the posting engine's actual write to the ledger is the source of truth, not a message that a job intends to do so.
12. Per-parish schema divergence in the accounting domain — every parish's accounting database follows the same schema/migration set; parishes do not get bespoke table structures.
13. Financial logic duplicated across UI, route handlers, and services — accounting rules live in exactly one place (the accounting domain / posting engine), referenced everywhere else, never reimplemented.
14. Broad support-admin access to parish accounting data without audit logging and (wherever practical) time-bounding.
15. Treating successful check printing as proof a payment cleared the bank (Section 17/18 — printing and clearing are different facts).
16. Treating bank-import data as authoritative ledger data before it is matched/posted (Section 18).
17. Posting a source event to a default or guessed account/fund when no valid accounting mapping exists (Section 28) — an unmapped event is rejected and surfaced, not silently classified.
18. Reusing a general-purpose "row + JSON blob" storage pattern (used elsewhere in AGAPAY today, per Phase 0's findings) for ledger tables — accounting tables must be fully normalized, relational, and constrainable at the database layer, not JSON-blob-based, because amounts, accounts, and funds must be independently queryable, summable, and constrainable by the database itself.
19. Allowing a single actor's role label alone (rather than an explicit capability check) to authorize a sensitive accounting action (Section 23).

---

## 30. Decision Framework for Future Features

Before implementing any accounting feature, a developer or an AI implementation agent must answer:

1. What is the operational source event?
2. What is the accounting event?
3. Does it create, reverse, or adjust a journal entry?
4. Which accounts are affected?
5. Which fund is affected?
6. What is the posting date?
7. What is the idempotency key?
8. What happens on retry?
9. What happens after period close?
10. What permissions are required?
11. What audit events are required?
12. What reports are affected?
13. What correction workflow applies?
14. How is the feature tested (including a cross-parish isolation test)?
15. How can the result be reconciled (against Stripe, against a bank, against the AP control account — whichever applies)?
16. What data belongs in central D1, parish D1, R2, or nowhere at all?
17. Can all derived values produced by this feature be rebuilt from journal lines alone?

A feature proposal that cannot answer all seventeen questions is not ready for implementation, regardless of how well-specified its UI or its happy-path behavior is.

---

## 31. Open Accounting Policy Questions

These require review with the design-partner parish and an experienced nonprofit accountant before the corresponding feature is finalized. None of them are resolved by this document.

| # | Question | Why it matters | Available approaches | Risk of choosing incorrectly | Blocks initial ledger development? |
|---|---|---|---|---|---|
| 1 | Cash vs. accrual reporting default | Determines what a treasurer sees by default and how statements are framed | Cash-only, accrual-only, both with a parish-level default | Wrong default confuses treasurers unfamiliar with the other basis; getting the underlying ledger structure wrong (Section 13) would be far worse and must not happen | No — ledger stays accrual-capable regardless; this is a reporting-default choice only |
| 2 | Donor-restricted vs. internally-designated fund distinction and enforcement | Determines whether restriction violations are blocked or merely flagged | Hard block, soft warning, or configurable per fund | Over-restricting frustrates legitimate parish operations; under-restricting risks a parish spending money it legally cannot | Partially — the *distinction* must exist before any fund can post correctly; the *enforcement mechanism* can be refined later |
| 3 | Restriction release treatment (when a restricted fund's purpose is fulfilled) | Determines how/when restricted net assets move to unrestricted | Manual release entry vs. automated release rules | Getting this wrong misstates net assets by restriction category | No — can be deferred past initial ledger development |
| 4 | Contribution refund classification (contra-revenue vs. direct revenue reduction) | Affects how gross vs. net giving is reported | Contra-revenue account vs. direct debit to revenue | Affects comparability of statements and default report design | No, but should be settled before Section 14's refund posting ships |
| 5 | Dispute and chargeback treatment | Affects timing/classification of disputed funds | Immediate reversal vs. provisional holding account pending resolution | Misstating disputed funds as either "still ours" or "gone" prematurely | No, but should be settled before dispute posting ships |
| 6 | Stale/uncashed checks (escheatment, write-off timing) | Legal/state-law implications (unclaimed property), accounting cleanup | Time-based write-off policy, formal escheatment process | Real legal exposure if handled incorrectly — genuinely requires legal/accountant input, not just an engineering decision | No — relevant only once check printing/reconciliation is mature |
| 7 | Sales tax recognition timing and liability treatment | Compliance risk, ties into existing tax-exemption workflow | Recognize at sale vs. at remittance | Misstated liability could create real compliance exposure | No, but should be settled before commerce posting (Section 15) ships |
| 8 | Interfund transfers — approval requirements | Governance control over moving restricted resources | Require council approval vs. treasurer discretion within policy | Weak controls risk misuse of restricted funds | No |
| 9 | Year-end closing process specifics | Determines exact net-asset roll-forward mechanics | Various standard nonprofit close procedures | Incorrect close misstates beginning balances for the next year | No — relevant only once a fiscal year needs closing |
| 10 | Retained net assets presentation | How cumulative fund equity is displayed across funds | Combined vs. fund-by-fund presentation | Affects clarity of financial statements to council/parishioners | No |
| 11 | Beginning balances for migrating parishes | How opening positions are validated and presented | Full historical migration vs. opening-balance-only cutover | Wrong opening balances corrupt every subsequent report | Yes — must be settled before any parish's migration is finalized (though not before ledger *development* itself) |
| 12 | Prior-period adjustments — disclosure requirements | Nonprofit financial-statement convention for restatements | Various standard disclosure approaches | Under-disclosure could mislead statement readers | No |
| 13 | Contribution statement alignment with IRS/donor expectations | Tax-deductibility documentation for donors | Calendar-year cash-received basis is the common approach, but must be confirmed | Wrong basis could produce donor tax documents that don't match IRS expectations — real tax exposure for donors, not just AGAPAY | Yes — must be settled before Section 14's contribution-statement feature ships; this is the kind of question that specifically needs an accountant, not an engineering guess |
| 14 | 1099-related vendor information | Tax-reporting obligation for parishes paying vendors | Collect W-9 data at vendor creation vs. at first payment threshold | Missing 1099 data creates real IRS-compliance risk for parishes | No — relevant only once AP/vendor payments are mature, but flagged early because vendor-record design should anticipate it |
| 15 | Treatment of credit-card accounts (parish-held cards) | Whether these are liability accounts, how reconciliation works | Treat as a bank-like account vs. a distinct account type | Misclassifying credit-card activity distorts cash-vs-liability reporting | No |
| 16 | Department/project/cost-center dimensions vs. funds (Section 8) | Data-model decision affecting reporting flexibility | Separate dimension vs. folding into fund structure | Wrong choice either overcomplicates small missions or under-serves larger parishes' reporting needs | Yes, partially — affects core schema design, so should be settled early even though it doesn't block Mission-tier's simplest case |
| 17 | Historical migration depth (current-year-only vs. full history) default recommendation | Affects migration project scope and cost per parish | Recommend current-year + opening balances as default, full history as opt-in | Over-promising full-history migration as standard could be costly/slow; under-migrating could frustrate parishes wanting full historical reports | No — a per-migration decision, not a ledger-development blocker |

---

## Existing Implementation Conflicts

- **Existing behavior:** Parish-side authentication today is a single shared bearer credential per parish (`verifyParishDashboardBearer`), with no distinct user identities or capability-based roles.
  **Governing principle it conflicts with:** Section 23 (capability-based roles) and Section 22 (audit trail requiring a specific actor, not just "the parish").
  **When it must be resolved:** Before any accounting-domain write path (posting, approval, check generation) ships — a shared credential cannot support "who approved this bill" or "who signed this check" in any meaningful sense.

- **Existing behavior:** The general D1 access helper (`d1(env)` in `src/lib/core.js`) hardcodes a single database (`AGAPAY_DB`), and most existing tables use a "row + JSON blob" storage pattern rather than fully normalized columns.
  **Governing principle it conflicts with:** Section 24 (per-parish database isolation) and Section 29, item 18 (prohibition on JSON-blob ledger tables).
  **When it must be resolved:** Before any accounting-domain schema or D1 resolution code is written — this is a Phase 1 (not Phase 0.5) concern, noted here only because this document's invariants make clear that the existing pattern must not be extended into the accounting domain.

- **Existing behavior:** No Cloudflare Queues or Workflows exist in the current architecture; background processing is synchronous or manually triggered.
  **Governing principle it conflicts with:** Section 10's "synchronous vs. queued posting" framing and Section 28's queue-retry/dead-letter requirements presuppose that infrastructure exists.
  **When it must be resolved:** Before any accounting feature depends on asynchronous posting or retry-based processing — synchronous-only posting may be sufficient for an initial Mission-tier release, but this must be a deliberate scoping decision, not an accidental one.

- **Existing behavior:** No CI test gate blocks deployment (`workflows/deploy.yml` deploys on push with no test step).
  **Governing principle it conflicts with:** No single section states this directly, but it undermines every invariant in Section 32 in practice — an invariant that isn't tested and enforced in CI is a policy on paper, not a guarantee.
  **When it must be resolved:** Before any accounting code reaches production, full stop.

These conflicts are noted, not fixed, per this document's scope. They are Phase 1 (or earlier) engineering prerequisites, consistent with Phase 0's findings.

---

## 32. Non-Negotiable Invariants

1. Every posted journal entry balances (total debits equal total credits).
2. Posted financial entries are immutable — never edited, never deleted.
3. Corrections preserve original history and are made via reversal, adjustment, or a documented void-and-reissue workflow — never a direct edit.
4. Every external source event posts at most once (idempotency is enforced, not assumed).
5. Every accounting request is parish-authorized server-side — never by trusting client-supplied identifiers.
6. Every balance is derivable from journal lines alone.
7. Every privileged action is auditable — actor, parish, timestamp, action, affected record, and reason where applicable.
8. Closed periods reject ordinary posting; only a formal, audited reopen permits posting into a closed period.
9. AP subledger detail reconciles to the AP general-ledger control account at all times.
10. Reconciled bank activity remains traceable back to its source journal entries.
11. Check reprints never create duplicate accounting payments; only a reissue creates a new check record, and it preserves the original.
12. Accounting state never depends on KV as an authoritative source.
13. Monetary values are never stored as floating-point — integer minor units only.
14. Files (R2 documents) never substitute for ledger records — they support, they never constitute, an accounting fact.
15. No parish actor may ever access another parish's accounting data. AGAPAY support access to a parish's accounting data is permitted only through the explicitly authorized, fully audited, narrowly scoped support-access process defined in Section 23 — never through ordinary parish-actor access paths, and never unaudited.
16. No accounting error is silently hidden by an automatic plug/balancing entry.
17. Every derived table or cache is rebuildable from journal lines, and a rebuild that disagrees with the current cache fails visibly rather than silently.
18. Every migration and restore is validated against ledger checks (balance, referential integrity) before being trusted as live data.
19. All accounting-domain writes pass through the posting engine — no route handler, background job, or UI component writes to journal tables directly.
20. Every accounting entity's chart of accounts, funds, and posted history are independently backable-up, exportable, and restorable.
21. Every posted journal line carries exactly one fund, so that the sum of fund balances always equals the entity's total balances — no posting may create an unallocated difference between them.
22. Every posted journal line references exactly one ledger account and, unless an explicitly documented future exception exists, exactly one fund.

---

## Phase 0.5 Sign-Off Checklist

- [x] Source-of-truth hierarchy is defined (Section 4).
- [x] Account, fund, revenue stream, and settlement profile are distinguished (Sections 6, 9).
- [x] Posting invariants are defined (Sections 10, 32).
- [x] Correction rules are defined (Section 11).
- [x] Period-close rules are defined (Section 12).
- [x] Stripe lifecycle treatment is conceptually defined (Sections 4, 14).
- [x] AP and check philosophy are defined (Sections 16, 17).
- [x] Reconciliation philosophy is defined (Section 18).
- [x] Permissions and audit principles are defined (Sections 22, 23).
- [x] Data ownership boundaries are defined (Sections 5, 24, 25).
- [x] Migration and backup principles are defined (Sections 26, 27).
- [x] Open accountant-review questions are identified (Section 31).

**All checklist items are satisfied. Phase 1 (Accounting Control Plane) design work may proceed, subject to the prerequisites already identified in the Phase 0 audit (`docs/accounting/00-phase-0-architecture-audit.md`) and the Existing Implementation Conflicts noted above — specifically the role/capability system, the parish-aware D1 resolver, and the CI test gate, none of which this document waives.**

---

## Revision Changelog (Phase 0.5 Final Corrections)

All section numbers, cross-references, and overall structure are unchanged from the prior draft. The following accounting-policy corrections were made:

1. **Section 13 (Cash Basis and Accrual Basis):** Revised the "How cash-basis reports may be generated" bullet. Previously implied cash-basis reports could be produced by simply filtering journal entries for those touching cash accounts. Now states that cash-basis reporting requires deterministic reporting logic that explicitly associates payments with their underlying accrual transactions, and names partial payments, vendor credits, split-account bills, and prepaid expenses as cases that a simple cash-account filter would handle incorrectly.
2. **Section 17 (Check Printing Philosophy):** Replaced the opening bullet and the closing "whether a printed check... reduces cash" paragraph. Previously implied approval/recording could reduce cash. Now explicitly distinguishes five steps — bill approval, payment preparation, check issuance, check printing, and check clearing — and states that the accounting payment (and the cash reduction) is created at **check issuance** (when a check number and issue date are assigned), not at approval and not at printing; printing/reprinting never creates an accounting event; clearing is a reconciliation fact tracked separately.
3. **Section 14 (Donation Posting Philosophy), item 10:** Previously described every donation reassignment as a fund-to-fund transfer. Now distinguishes Situation A (the original posting was incorrect — requires an accounting reclassification/correcting entry per Section 11) from Situation B (the original posting was correct but a later valid change occurs, e.g. donor-authorized reassignment or restriction release — follows the parish's interfund-transfer or restriction-release policy per Section 8).
4. **Section 8 (Fund Accounting Philosophy):** Added a new bullet strengthening fund attribution: every posted journal line carries exactly one fund as the default design assumption, absent an explicit future entity-wide exception, so that no posting may create an unallocated difference between an accounting entity's total balances and its fund balances.
5. **Section 32 (Non-Negotiable Invariants):** Added new invariant 21 restating the one-fund-per-line rule and the no-unallocated-difference requirement from Section 8.
6. **Section 7 (Chart of Accounts Philosophy):** Revised the "Renaming an account" bullet to distinguish live reports (always resolve an account by identity and display its current name, even for historical periods) from official report snapshots stored in R2 (permanently preserve whatever account names appeared at the time the snapshot was generated, never updated by a later rename).
7. **Section 32 (Non-Negotiable Invariants), invariant 15:** Revised from "No cross-parish accounting access is permitted, under any actor, without exception" to explicitly carve out the already-defined AGAPAY support-access process (Section 23): no parish actor may ever access another parish's accounting data, and AGAPAY support access is permitted only through the explicit, fully audited, narrowly scoped support-access process already defined in the document — never through ordinary parish-actor access paths. Tenant isolation itself is not weakened; the invariant is now consistent with Section 23 rather than appearing to contradict it.
8. **Section 32 (Non-Negotiable Invariants):** Added new invariant 22: "Every posted journal line references exactly one ledger account and, unless an explicitly documented future exception exists, exactly one fund." This is additive to invariant 21 (which addresses the fund side and the no-unallocated-difference rationale) — invariant 22 makes explicit that the same one-and-only-one attribution rule applies to the ledger-account reference on a journal line, not only the fund reference.

No section numbers were changed, no cross-references were broken, no accounting invariant was weakened, no implementation details were introduced, and no new open accounting policy questions were created.
