import { sendEmail, type EmailEnv, type EmailResult } from '../../src/lib/email.js';
import {
  sendDashboardInvite,
  sendParishStaffAccessInvitation,
  type NotificationRegistration,
} from '../../src/lib/parish-notifications.js';
import {
  submitParishSupportTicket,
  updateParishSupportTicket,
  listParishSupportTickets,
} from '../../src/lib/parish-support-tickets.js';
import { attributionEmail } from '../../src/lib/lead-attribution.js';
const env: EmailEnv = {};
const result: Promise<EmailResult> = sendEmail(
  env,
  { from: 'a@example.test', to: ['b@example.test'], subject: 'test' },
  { timeoutMs: 100, idempotencyKey: 'test' }
);
const registration: NotificationRegistration = {
  parishId: 'a',
  treasurerEmail: 'b@example.test',
  subscriptionTier: 'giving',
};
const invite = sendDashboardInvite(env, 'https://example.test', registration);
const ticket = submitParishSupportTicket(env, new Request('https://example.test'), registration, {
  message: 'Support request',
});
const referral: string = attributionEmail({ firstTouch: { timestamp: '2026-01-01', category: 'Referral' } }).html;
void [result, invite, ticket, referral];
// @ts-expect-error Recipients are a collection.
sendEmail(env, { from: 'a', to: 'b', subject: 'test' });
// @ts-expect-error Deadline overrides must be numeric.
sendEmail(env, { from: 'a', to: ['b'], subject: 'test' }, { timeoutMs: 'never' });
// @ts-expect-error Attachments require base64 content and a filename.
sendEmail(env, { from: 'a', to: ['b'], subject: 'test', attachments: [{ filename: 'file' }] });
// @ts-expect-error API keys must be strings.
const badEnv: EmailEnv = { RESEND_API_KEY: 42 };
void badEnv;
// @ts-expect-error A typed invitation needs its role template.
sendParishStaffAccessInvitation(env, 'https://example.test', registration, { email: 'b', token: 'test' });
// @ts-expect-error Stored email addresses must be strings.
sendDashboardInvite(env, 'https://example.test', { treasurerEmail: 42 });
// @ts-expect-error Support submission needs a real Request.
submitParishSupportTicket(env, {}, registration, { message: 'test' });
// @ts-expect-error Ticket IDs must be strings.
updateParishSupportTicket(env, { actor: 'Admin' }, 42, { status: 'resolved' });
// @ts-expect-error Listing limits are numeric.
listParishSupportTickets(env, { limit: 'all' });
// @ts-expect-error Attribution dates must be stored strings.
attributionEmail({ firstTouch: { timestamp: 42 } });
