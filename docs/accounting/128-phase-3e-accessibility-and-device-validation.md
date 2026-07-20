# Phase 3E accessibility and device validation

Accounting targets WCAG 2.2 AA where practical. Navigation, editors, tables, dialogs, error summaries, loading states, print views, close checks, and health findings require semantic landmarks, keyboard operation, visible focus, associated errors, announced status, noncolor severity, sufficient contrast, reduced motion, reflow, and touch-sized controls.

Validation covers narrow and large mobile, tablet portrait/landscape, desktop, 200% zoom, touch only, current Chrome/Edge/Firefox, and Safari/iOS where available. Reconciliation must not require drag-and-drop. Complex entry may be easier on desktop but remains viewable and safely actionable on small screens.

Accounting does not support offline financial mutation. Service workers must exclude accounting APIs and exports, stale state must clear on logout/parish switching, and slow or interrupted mutations must present an unknown-result/retry-safe state rather than claiming failure means nothing posted.
