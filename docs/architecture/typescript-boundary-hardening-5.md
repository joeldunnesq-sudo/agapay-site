# TypeScript boundary hardening: fifth checkpoint

Release candidate. Protected staging and production acceptance are pending.

This checkpoint removes the final 17 double assertions: 13 Learn table lookups, two redundant directory D1 result adapters, and two PDF page initializers. The original migration remains 495/495; removing assertions is a separate hardening measure and does not prove every external JSON boundary is validated.

Learn tables now use private, hoisted generic functions that inspect owned enumerable keys and return the actual property value type or undefined. Known values and caller fallbacks are retained; unknown or inherited prototype keys cannot select Object.prototype values. No replacement type assertions or runtime imports were added to composed browser parts.

Directory invitation listing and expiry consume the shared D1 helper's existing array result directly. Native D1 envelopes remain normalized in database-reads. Existing capability checks, parish constraints and atomic expiry/audit statements are unchanged. Ministry participant profile search parses JSON into unknown, checks a non-array object and string name fields, and retains the email/Parishioner fallback for malformed names or JSON. Stored records are never rewritten by this reader.

PDF state now owns an explicit current-page getter/setter. It creates no page in the initializer and rejects drawing before page creation. Existing cover, form and landscape renderers retain their page creation sequence. Permanent regression fixtures fingerprint page dimensions and drawing streams from accepted main 8eaec2442b3cc03e872d79d7c8127cd8b3258988 for empty, short, overflowing, landscape, report-card and transcript documents. Document timestamps are excluded from these comparisons.

Two focused suites are registered in the full manifest and formatter: directory-profile-json-tests and learn-final-boundaries-tests. They cover malformed roots and name fields, permission denial before database reads, parish query scope, D1 envelope normalization, owned/unknown/prototype table keys, page initialization and production PDF drawing parity. Existing Learn native controls, weekly JSON lossless saves, desktop/phone boot, directory invitation and offline/cache/session suites remain required.

No MFA, billing, entitlement, dependency, release permission, migration ledger or size budget configuration changed. Remaining work is broader external JSON validation in separate domain batches; zero double assertions is not a claim of complete runtime schema coverage.

## Local validation

Focused boundary and invitation regressions passed. Full Quality passed with four strict projects, 57 owned Worker declarations, 17,144 runtime parameter occurrences with no inferred any, and 1,926 linted files with zero errors and six unchanged warnings. Generated paths, asset versions, formatting, all seven existing budgets and the migration ledger passed. The source scan found 746 TypeScript files, zero explicit any, zero suppressions and zero double assertions. Local Worker startup profiling and private provisioner dry-run packaging passed. All 328 platform commands and four prechecks passed locally.
