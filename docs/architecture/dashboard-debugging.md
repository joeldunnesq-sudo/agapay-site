# Parish dashboard debugging

The dashboard keeps authentication and shared state in `public/parish/app.js`.
`public/parish/dashboard-runtime.js` owns initial loading, refresh, recovery UI,
and duplicate-load prevention. Both the dashboard and login page load diagnostics
and this lifecycle script before the core. Feature ownership is unchanged.

## Reproduce safely

Run `npx playwright install chromium` once for local browser tests. Linux CI also
installs the browser's system dependencies. Then use:

- `npm run test:parish-browser` for the real dashboard DOM with synthetic API responses.
- `node scripts/parish-diagnostics-tests.mjs` for diagnostic privacy checks.
- `npm run test:parish-ui` for the browser gate and existing parish UI regressions.
- `npm run quality` and `npm run check` for the complete required CI checks.

The browser gate loads checked-in HTML, CSS, and JavaScript in Chromium. All
requests are fulfilled locally; it uses no real accounts or production services.
Unexpected API requests fail the test. External fonts and the QR library receive
empty responses to exercise the existing offline QR fallback; QR encoding itself
is not validated by this gate. No screenshots, traces, or account data are saved.

The scenarios cover onboarding actions and signoff visibility, first-load
failures, expired sessions, malformed responses, network interruptions, retries,
refresh failures with unsaved form data, and concurrent loads. The gate explicitly
tests that uncaught callbacks and unhandled promise rejections fail rather than
merely printing warnings. It is included in the required test manifest.

## Read diagnostics

Filter the browser console for `[AGAPAY diagnostic]`, or evaluate
`window.AgapayDiagnostics.recent()` while the page is open. This returns at most
20 immutable records, retained only in memory. Nothing is uploaded or persisted.

Records include an approved operation name, standard error type, numeric HTTP
status when supplied, timestamp, and source locations. `stackSource: exception`
means locations came from the original error. When a native error supplies no
usable stack, `stackSource: report` identifies the reporting call site instead.
Open those file/line locations in DevTools or the repository to trace the failure.

Raw error messages, custom error properties, causes, request/response bodies,
headers, storage, donor details, and arbitrary caller context are never recorded.
Frame function names, URL queries and fragments, external URLs, and paths not
belonging to same-origin scripts on the page are discarded. User-facing errors
use fixed safe messages. Do not add raw `console.error(error)` calls or send these
records to a remote service without a separate privacy review.

Initial load failures release the busy state and expose a retry button. A failed
first render restores the previous parish reference so retry remains a true boot.
A failed refresh leaves the prior parish reference intact; failures before
rendering also leave unsaved form fields untouched. Quiet billing and Stripe
refresh failures produce diagnostics without showing an unexpected toast.
