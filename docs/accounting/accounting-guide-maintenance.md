# Accounting handbook maintenance

The public handbook is `public/docs/AGAPAY-Accounting-Suite-Guide-Comprehensive.pdf`. Accounting Settings links to this stable filename with an edition query to avoid opening an older browser-cached guide.

Rebuild with Python, ReportLab and pypdf:

```text
python scripts/generate-accounting-guide.py
```

The generator uses the repository's Noto Sans font assets and standard PDF heading fonts. Its reviewed topic content lives with the generator so changes to workflows and examples can be versioned. It produces the public PDF and a delivery copy under `output/pdf/`.

The guide contains 24 curated pages. The generator rejects page overflow and verifies each topic still begins on its intended page. The contents-page links and PDF bookmarks must continue to point at the correct pages. Update the contents, footer count and validation together if deliberately adding pages.

After a content change:

1. Verify the instructions against the current browser labels and the relevant service behavior. Do not describe a preview as a post, a recorded payment as an executed bank transfer, or a role/view toggle as extra permission.
2. Rebuild and render every page to PNG using Poppler. Inspect the contact sheet and dense pages at reading size. Check for clipped tables, isolated spill pages, missing glyphs, incorrect page references and broken navigation.
3. Confirm the current support policy, fiscal-date instructions and asset/import controls. Preserve the distinction between live reports and immutable saved council snapshots.
4. Keep examples explicitly illustrative. Donor reporting and accounting valuation do not themselves determine tax eligibility or filing obligations. Verify any substantive tax statement against primary guidance before changing it.
5. Update the edition query and guide description in `src/browser/parish/features/accounting/workspace.ts`; rebuild browser output and synchronize app asset versions. Keep the stable PDF filename.
6. Run the accounting route/UI checks and required release gates. After publication, verify the live PDF hash and the versioned Settings link against the reviewed files.

The November 3, 2026 edition replaces the earlier 13-page guide. It includes guided setup, daily actions, donation fee coverage and annual totals, shared report dates, transaction drilldowns, fiscal YTD budgets, department/project reporting, council packages, historical assets and corrections, reconciliation/close, and dashboard support.
