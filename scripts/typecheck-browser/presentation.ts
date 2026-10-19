// Compile-only contracts. No fixture code is served or executed.
const adminPresentation = window;
const browserSummary = adminPresentation.computeLocalPlatformSummary([
  { receivedAt: null, stripeAccountStatus: null, status: 'verified' },
  { receivedAt: new Date(), stripeRequirementsDue: { malformed: true } },
]);
void browserSummary.monthly[0].registered.toFixed();
adminPresentation.renderStripeRequirements({ stripeRequirementsDue: null });
adminPresentation.escapeHtml({ untrusted: '<script>' });
adminPresentation.shortDate(null);
formatCentsAsDollars('1250');
formatCentsAsDollars(undefined);
void BOOKSTORE_CATEGORY_LABELS.prayer_rope;
void BOOKSTORE_STATUS_LABELS.completed;
// @ts-expect-error: unknown categories cannot silently become undefined labels.
void BOOKSTORE_CATEGORY_LABELS.not_a_category;
// @ts-expect-error: presentation labels are immutable for typed consumers.
BOOKSTORE_STATUS_LABELS.completed = 'Changed';
// @ts-expect-error: summaries take a list of registrations, not an API envelope.
adminPresentation.computeLocalPlatformSummary({ registrations: [] });
// @ts-expect-error: month indexes are numbers.
adminPresentation.monthLabel('January');
// @ts-expect-error: dates must be date-compatible values.
adminPresentation.shortDate({ timestamp: 123 });
// @ts-expect-error: browser projects must not acquire Node globals.
void process.env;
// @ts-expect-error: browser projects must not acquire Worker bindings.
declare const browserDatabase: D1Database;
void browserDatabase;
