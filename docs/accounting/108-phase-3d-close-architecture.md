# Phase 3D close architecture

Phase 3D completes AGAPAY's core accounting lifecycle with one close domain over the authoritative journal and report services. A close session records workflow state independently from a period lock. Stable, normalized checks record automatic results, human review, warning waivers, sources, and versions.

The workflow is: create session, validate authoritative sources, resolve warnings, review or approve, complete, lock, and snapshot. Critical or blocking checks cannot be waived. Mission receives all essential closing functions; Parish additionally evaluates payables, budgets, and commerce.

Close snapshots are server-created, hash-verified, and immutable. Completing a period never changes posted journals or moves dates. Reopening preserves the original session and snapshot, unlocks through an explicit elevated action, and requires later revalidation.

Known integration boundary: this slice exposes domain services and safe output builders. Authenticated Parish Dashboard route handlers and navigation should call these services through the existing accounting gateway; they must retain private, no-store responses.
