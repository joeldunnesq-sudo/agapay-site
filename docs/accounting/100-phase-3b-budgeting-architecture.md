# Phase 3B — Parish budgeting architecture

Budgets are Parish-tier planning artifacts stored separately from the immutable ledger. They never post journals or replace actual financial data. Each fiscal-year version contains account-and-fund lines in integer minor units; the database requires every annual amount to equal its twelve monthly allocations.

The lifecycle is draft → submitted → approved → locked. The creator cannot be the sole approver. A fiscal year has at most one official locked version, and database triggers make its header and lines immutable. Revisions are new versions, preserving complete history and assumptions without copying audit events.

Budget-to-actual reports read only posted/reversed journal activity and preserve fund separation. Variance is actual minus budget. Higher revenue is favorable; lower expense is favorable, so every row includes a textual assessment rather than relying on color. Year-to-date forecasting annualizes actual activity without modifying the budget.

CSV output neutralizes spreadsheet formulas. The council packet DTO combines an executive summary, revenue, expenses, major variances, forecast-ready values, and narrative assumptions for accessible browser printing. Mission Accounting receives no budget data or mutations.
