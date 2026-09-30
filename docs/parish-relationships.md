# Parish relationships and annual messages

The admin home includes 30/90/365-day paying-parish retention, net revenue retention, setup/billing attention items, upcoming signup anniversaries and patronal feasts, and annual email controls. Counts exclude Learn subscriptions.

## Retention

The hourly `15 * * * *` job records the first daily UTC snapshot of current parish subscriptions. Comparisons require a snapshot on the exact opening date; historical values are never reconstructed from current status. Active subscriptions with a known positive monthly price count as paid, matching the dashboard's MRR convention. Trials, free subscriptions, unknown prices and past-due accounts do not count as paid. Revenue retention compares only opening paid parishes, including their upgrades/downgrades. These are endpoint comparisons; departures followed by reactivation between observations are not separately measured.

## Annual emails

New preferences default to preview mode. Admins open **Manage annual emails → Review & configure**, preview, confirm recipients and IANA time zone, then enable each message independently. No email is sent when saving or previewing. The hourly job sends at 09:15 local time on the occasion date, to verified parishes except canceled/cancelled or unpaid subscriptions. Defaults use the treasurer for the financial report and priest for the greeting, with fallback to the other contact. Disable either checkbox to honor a reply requesting opt-out.

Signup anniversaries use the original registration date. February 29 anniversaries use February 28 in non-leap years. Explicit patronal observed dates are civil MM-DD dates; known feast IDs otherwise use the parish's liturgical calendar, including movable feasts. Unknown dates do not produce greetings.

Giving reports use the preceding twelve months ending at midnight UTC, excluding today. Paid offerings are grouped by currency; recurring received gifts are distinguished from a projection. Donors are counted by normalized nonempty email and returning donors have a recorded paid gift before the window. A growth comparison requires registration predating both periods and a positive prior USD total. Figures are paid recorded gifts before fees, not parish-wide income or bank reconciliation. Previews recalculate through today; actual sends recalculate on the occasion date.

## Delivery operations

Migration `0129_parish_relationships.sql` adds snapshot, preference and delivery tables. The existing Resend configuration is reused. D1 atomically claims a unique registration/kind/occasion key before calling the provider, with the same provider idempotency key. Concurrent and repeated cron execution cannot resend that occasion. Sent means accepted by the provider, not verified inbox delivery. Failed, unconfirmed or stuck-sending entries require operator review against provider records; no automatic retry occurs after an ambiguous send. No catch-up sends occur for missed days.

The admin activity list displays recent delivery states. The existing scheduled-task observer records job failures. No real messages are sent by automated tests, which use a local SQLite database and mocked provider.

Email preferences are parish-scoped in the portability inventory. The cross-parish subscription history and minimal provider delivery ledger are independent platform operations records. They never enter a parish export or restore; retaining delivery tombstones prevents an older parish backup from causing repeat anniversary messages.
