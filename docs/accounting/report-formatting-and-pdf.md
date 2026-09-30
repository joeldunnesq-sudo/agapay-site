# Financial report presentation and PDF exports

The Financial Reports library uses one statement model for screen, CSV, print, and downloadable PDF output. All 16 library reports support PDF download, including the General Ledger with opening balances, account activity, running balances, and debit/credit totals.

Statements identify the parish, reporting period, currency, and posted-ledger basis. Numeric columns are right aligned, negative amounts use parentheses, zero balances use a dash, subtotals use rules, and final totals use double rules. Wide reports use landscape PDFs. Headers and table headings repeat on later pages, account sections continue across page breaks, and page numbers appear in the footer.

The income statement distinguishes revenue, expenses, and change in net assets. The balance sheet separates assets, liabilities, and net assets. Nonprofit statements use with-donor-restrictions and without-donor-restrictions classes, with board-designated funds included in the latter. The trial balance separates ending debits and credits. Cash flows include beginning and ending cash. Budget reports separate revenue and expense categories and state their fiscal-year coverage and variance convention.

These presentation conventions do not certify financial statements as GAAP compliant. Reports describe posted ledger activity. Functional expense allocation remains based on the existing account-group mapping, and the report retains its allocation disclosure. Restriction-release and validation notes remain visible in exported documents. Accurate statements depend on correct posting, fund classification, closing entries, and accounting review.

PDF generation runs in the browser. PDF-LIB, fontkit, and Noto Sans load from the application only when needed; report data is not sent to a PDF service. Dependency provenance and licenses are retained under public/vendor.

Validation: all 43 accounting test commands and the project quality checks passed. Browser coverage downloads all 16 report types, verifies date-filtered CSV output, balanced trial-balance totals, budget net-result arithmetic, mobile overflow, Unicode parish names, and a multipage general ledger. Generated sample PDFs use synthetic data and were rendered for visual inspection.
