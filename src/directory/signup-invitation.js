import { agapayEmailHtml, sendEmail } from '../lib/email.js';
import { htmlEscape } from '../lib/format.js';

export async function deliverDirectorySignupInvitation(env, { email, name, parishName, rawToken, invitationId }) {
  // Use trusted configuration, never a Host header or spreadsheet-supplied URL.
  const base = String(env.AGAPAY_APP_URL || 'https://agapay.app').replace(/\/+$/, '');
  const destination = `/myagapay/directory?invite=${encodeURIComponent(rawToken)}`;
  const url = `${base}/myagapay/login?next=${encodeURIComponent(destination)}`;
  return sendEmail(env, {
    from: env.AGAPAY_FROM_EMAIL || 'AGAPAY <support@agapay.app>',
    to: [email],
    subject: `${parishName} invites you to My AGAPAY`,
    html: agapayEmailHtml(base, 'Your parish is on My AGAPAY',
      `<p>Hello ${htmlEscape(name)},</p><p>${htmlEscape(parishName)} has added your contact information to its private parish directory and invited you to connect it to My AGAPAY.</p><p>Create an account or sign in using <strong>${htmlEscape(email)}</strong>, then accept your invitation. You can review your information and choose what to share with fellow parishioners.</p><p><a href="${htmlEscape(url)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#0a4b78;color:#fff;text-decoration:none;font-weight:700;">Sign up or sign in to My AGAPAY</a></p><p>The invitation expires in 14 days. No gift or payment is required. If you did not expect this invitation, you can ignore it or contact your parish.</p>`),
    text: `Hello ${name},\n\n${parishName} has added your contact information to its private parish directory and invited you to My AGAPAY.\n\nCreate an account or sign in using ${email}, then accept your invitation:\n${url}\n\nReview your information and choose what to share. This invitation expires in 14 days. No gift or payment is required. If you did not expect it, ignore it or contact your parish.`
  }, { idempotencyKey: `directory-import-${invitationId}`, timeoutMs: 10000 });
}
