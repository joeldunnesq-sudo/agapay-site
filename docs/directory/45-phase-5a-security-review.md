# Phase 5A Security Review

Phase 5A security controls are implemented server-side.

- Display leadership does not grant authorization.
- Interest request approval blocks self-approval.
- Cross-parish operations require the resolved parish context.
- Protected people and children fail closed.
- Hidden, staff-only, draft, and archived ministries are not sent to ordinary member browse.
- Hidden participants do not affect visible member counts.
- Duplicate active participation and duplicate unresolved interest requests are prevented by database indexes.
- Person merge aliases resolve before assignment.
- Internal notes are not part of ministry member DTOs.
- Participation publication is opt-in plus staff-approved.
- Review items reuse Phase 3A metadata, assignment, priority, audit, and notification patterns.
- Private ministry JSON is routed through authenticated directory APIs.
- No donor, giving, accounting, Commerce, Learn, or Marketplace data is joined.

Known limitation: Phase 5A intentionally does not introduce child-ministry rosters, attendance, scheduling, messaging, exports, imports, maps, duplicate detection, or merge workflows for ministries.
