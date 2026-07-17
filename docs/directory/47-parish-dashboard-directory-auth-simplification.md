# Parish Dashboard Directory Authentication Simplification

Directory Operations inside the Parish Dashboard use the authenticated Parish Dashboard session for the current parish. The dashboard session is already limited to a small trusted administrator set in AGAPAY's current parish model, so requiring a simultaneous My AGAPAY platform-user session created avoidable friction without adding meaningful protection for this administrative surface.

## Scope Boundary

- Parish Dashboard session: authorizes Directory administration for its own parish only.
- My AGAPAY platform-user session: still required for member directory browsing and household self-service.
- Parish Dashboard sessions cannot impersonate a parishioner, submit member-owned requests, or browse the member directory as a household user.
- Platform-user capability authorization remains the long-term model for independently permissioned staff accounts.

## Server Rule

Administrative Directory routes under `/api/parish/dashboard/:parishId/directory/admin` resolve the parish from the validated Parish Dashboard bearer token. The server compares the requested route parish to that validated session and fails closed if they do not match. The centralized `requireCapability()` platform-user helper is unchanged and still requires a named platform user.

The bounded helper is `requireParishDashboardDirectoryAccess()` in `src/directory/admin.js`. It returns a normalized context with:

- `authenticationType: "parish_dashboard"`
- `actorType: "parish_dashboard_account"`
- `actorId` equal to the authenticated parish id
- `parishSessionId` from the validated dashboard session
- directory-only administrative capabilities needed by the existing Directory Operations routes

## Audit Attribution

Directory administrative actions through the Parish Dashboard are audited as `parish_dashboard_account`, not as a platform user. This is parish-account-level attribution. It is intentionally honest about the current dashboard identity model and should not be described as person-specific unless the Parish Dashboard later records distinct named staff users.

## Entitlement

The current implementation preserves the existing product entitlement behavior: a valid, active Parish Dashboard for the requested parish is required, and Directory routes remain parish-scoped. There is not yet a separate Directory subscription flag. When AGAPAY adds one, it should be enforced inside `requireParishDashboardDirectoryAccess()` so the boundary remains centralized.

## Private Data And Caching

Directory administrative API responses return `Cache-Control: private, no-store`. The service worker bypasses `/api/`, `/parish`, and authenticated My AGAPAY paths, so Directory administrative JSON and member/private JSON are not cached by the PWA shell.

## Routes Intentionally Unchanged

The My AGAPAY routes remain platform-user authenticated:

- `/api/directory/self/*`
- `/api/directory/member/*`
- `/api/directory/children/*/publication`
- household self-service routes
- member media/profile routes

These routes still require an individual identity, eligible parish relationship, and household/member context where applicable.
