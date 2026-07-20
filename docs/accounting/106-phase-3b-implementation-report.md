# Phase 3B implementation report

Implemented migration `0009_phase3b_budgeting.sql`, a Parish-only budgeting domain service, focused regression coverage, and documentation. The normalized schema includes versioned budget headers, monthly account/fund lines, narrative assumptions, lifecycle events, one-official-version enforcement, and locked-data immutability triggers.

Services implement creation, exact monthly allocation, optimistic line updates, submission, independent approval, locking, copying, history listing, budget-to-actual calculations, nonprofit-aware variance interpretation, year-to-date forecasts, formula-safe CSV, and print-ready council packets. Actuals always originate from posted ledger lines.

This phase introduces no journal mutations, payroll planning, purchasing, grants, inventory planning, capital projects, fundraising projections, or AI forecasting. Authenticated HTTP routes and the visual Parish Dashboard budget workspace remain integration work before operational enablement. Production rollout requires applying accounting migrations through `0009` to provisioned Parish-tier accounting databases.
