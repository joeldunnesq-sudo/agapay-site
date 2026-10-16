// Generated from src/handlers/donor.ts by npm run build:server. Do not edit.
import './donor-parish-context.js';
import { deliverDonationReceipt, sendDonationReceiptMessage } from '../payments/donation-receipts.js';
import '../payments/donation-events.js';
import '../lib/outside-pledges.js';
import '../lib/logging.js';
import '../lib/directory-invitation-next.js';
import '../lib/legal-acceptance.js';
import { normalizeEmail } from '../lib/core.js';
import '../lib/subscriptions.js';
import '../lib/entitlements.js';
import '../lib/parish-feature-requests.js';
import '../lib/parish-support-tickets.js';
import '../lib/safe-external-url.js';
import '../directory/self-service.js';
import '../lib/consumer-passkeys.js';
import { agapayEmailHtml } from '../lib/email.js';
import { htmlEscape } from '../lib/format.js';
import '../lib/stripe-connect.js';
import { offeringFeeBreakdown } from '../lib/stripe-fees.js';
import './parish.js';
import './parish-commemorations.js';
import './parish-giving-catalog.js';
import './donor-authentication.js';
import './donor-password-recovery.js';
import './donor-profile.js';
import './donor-giving.js';
import {
  bookstoreOrderSource,
  guestBookstoreItemError,
  handleDonorBookstore,
  handleDonorBookstoreIsbnLookup,
  handleDonorBookstoreItemFields,
  handleDonorBookstoreRequestFeature,
  handleParishBookstoreReadiness,
  loadDonorBookstoreProducts,
  normalizeBookstoreCartItems,
} from './donor-bookstore.js';
import { handleDonorParishCalendar, parseKoinoniaCalendarIcs } from './donor-parish-calendar.js';
import {
  handleDonorSacramentAvailability,
  handleDonorSacramentBook,
  handleDonorSacramentCancel,
  handleDonorSacraments,
} from './donor-sacraments.js';
import { handleDonorNotificationDismiss, handleDonorNotifications } from './donor-notifications.js';
import { adminRegistrationSummary, loadAdminRegistrationPage } from './registration-admin-page.js';
import {
  handleDonorClaimCheckout,
  handleDonorSession,
  issueDonorSession,
  handleDonorSignup,
  handleDonorLogin,
} from './donor-authentication.js';
import {
  sendDonorVerificationEmail,
  sendDonorPasswordResetEmail,
  handleDonorPasswordResetRequest,
  handleDonorPasswordResetConfirm,
  handleDonorVerify,
  handleDonorVerifyPage,
} from './donor-password-recovery.js';
import {
  handleDonorDashboard,
  handleDonorSupportTicket,
  handleDonorAccountDeletion,
  handleDonorStewardshipFeatureRequest,
  handleDonorGivingPlusFeatureRequest,
  handleDonorMinistryServiceInterest,
} from './donor-profile.js';
import { handleDonorOfferings, handleDonorSubscriptionPortal, handleDonorCommemorations } from './donor-giving.js';
function formatUsdFromCents(centsValue) {
  return (Number(centsValue || 0) / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}
function offeringLabel(offering = {}) {
  if (offering.title) return String(offering.title);
  const giftType = String(offering.giftType || 'offering').replace(/-/g, ' ');
  const parishName = offering.parishName || 'your parish';
  return `${parishName} - ${giftType}`;
}
async function sendDonorDonationReceiptEmail(env, offering = {}) {
  const donorEmail = normalizeEmail(offering.donorEmail);
  if (!donorEmail) return { status: 'missing_recipient' };
  const appUrl = env.AGAPAY_APP_URL || 'https://agapay.app';
  const from = env.AGAPAY_FROM_EMAIL || 'AGAPAY <onboarding@agapay.app>';
  const replyTo = env.AGAPAY_REPLY_TO_EMAIL || 'support@agapay.app';
  const donorName = htmlEscape(offering.donorName || 'friend');
  const lineItem = htmlEscape(offeringLabel(offering));
  const parishName = htmlEscape(offering.parishName || 'Orthodox parish');
  const fees = offeringFeeBreakdown(offering);
  const amount = formatUsdFromCents(fees.giftAmountCents);
  const chargeAmount = formatUsdFromCents(fees.chargeCents);
  const parishReceived = formatUsdFromCents(fees.parishNetCents);
  const totalFees = formatUsdFromCents(fees.totalFeeCents);
  const donorCovered = formatUsdFromCents(fees.donorCoveredFeeCents);
  const stripeReference = htmlEscape(offering.stripePaymentIntentId || offering.checkoutSessionId || offering.id || '');
  const donatedAt = htmlEscape(
    new Date(offering.completedAt || offering.createdAt || Date.now()).toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  );
  const dashboardUrl = htmlEscape(`${String(appUrl).replace(/\/+$/, '')}/myagapay`);
  const diagnostic = offering.isDiagnostic === true;
  const diagnosticBanner = diagnostic
    ? `<p style="margin:0 0 18px;padding:12px 14px;border:1px solid rgba(201,162,91,0.52);border-radius:10px;background:#FFF8EA;font-size:14px;line-height:1.6;color:#171715;"><strong>Delivery test:</strong> No payment or donation occurred. The values below are template-rendering fixtures only.</p>`
    : '';
  const feeDetail = fees.coverFees
    ? `<p style="margin:0 0 8px;font-size:14px;color:#171715;"><strong>Fees covered by you:</strong> ${htmlEscape(donorCovered)}</p>
       <p style="margin:0 0 8px;font-size:14px;color:#171715;"><strong>Parish received:</strong> ${htmlEscape(parishReceived)}</p>`
    : `<p style="margin:0 0 8px;font-size:14px;color:#171715;"><strong>Stripe processing fee deducted:</strong> ${htmlEscape(totalFees)}</p>
       <p style="margin:0 0 8px;font-size:14px;color:#171715;"><strong>Parish received:</strong> ${htmlEscape(parishReceived)}</p>`;
  const coverFeesNote = fees.coverFees
    ? ''
    : `
      <p style="margin:0 0 18px;padding:13px 15px;border-left:3px solid #C9A25B;background:#FFF8EA;font-size:14px;line-height:1.65;color:#171715;">
        Next time, you can choose to cover the processing fees so ${parishName} receives the full intended gift.
      </p>`;
  return sendDonationReceiptMessage(env, offering, {
    from,
    to: [donorEmail],
    reply_to: replyTo,
    subject: `${diagnostic ? '[TEST] ' : ''}AGAPAY receipt - ${amount} to ${offering.parishName || 'your parish'}`,
    html: agapayEmailHtml(
      appUrl,
      'Donation receipt',
      `
      ${diagnosticBanner}
      <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#171715;">Glory to Jesus Christ, ${donorName}.</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#171715;">Your gift has been received successfully through AGAPAY.</p>
      <div style="margin:0 0 20px;padding:16px 18px;border:1px solid rgba(201,162,91,0.34);border-radius:12px;background:#FDF9F0;">
        <p style="margin:0 0 8px;font-size:14px;color:#171715;"><strong>Your gift:</strong> ${htmlEscape(amount)}</p>
        <p style="margin:0 0 8px;font-size:14px;color:#171715;"><strong>Amount charged:</strong> ${htmlEscape(chargeAmount)}</p>
        ${feeDetail}
        <p style="margin:0 0 8px;font-size:14px;color:#171715;"><strong>Parish:</strong> ${parishName}</p>
        <p style="margin:0 0 8px;font-size:14px;color:#171715;"><strong>Offering:</strong> ${lineItem}</p>
        <p style="margin:0 0 8px;font-size:14px;color:#171715;"><strong>Date:</strong> ${donatedAt}</p>
        ${stripeReference ? `<p style="margin:0;font-size:12px;color:#6F6A60;"><strong>Stripe reference:</strong> ${stripeReference}</p>` : ''}
      </div>
      ${coverFeesNote}
      <p style="margin:0 0 18px;font-size:14px;line-height:1.65;color:#171715;">You can view this gift in your donor dashboard and keep track of your offering history there.</p>
      <p style="margin:0;"><a href="${dashboardUrl}" style="display:inline-block;background:#C9A25B;color:#061522;padding:12px 18px;border-radius:10px;text-decoration:none;font-family:Georgia,'Times New Roman',serif;font-size:17px;font-style:italic;font-weight:600;">Open donor dashboard</a></p>
    `
    ),
  });
}
async function sendDonationReceiptIfNeeded(env, offering = {}) {
  return deliverDonationReceipt(env, offering, sendDonorDonationReceiptEmail);
}
function jsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
function donorVerifyHtml({ title, message, status = 'info', script = '', refreshUrl = '' }, init = {}) {
  const statusClass = status === 'success' ? 'success' : status === 'error' ? 'error' : '';
  const refresh = refreshUrl ? `<meta http-equiv="refresh" content="2; url=${htmlEscape(refreshUrl)}" />` : '';
  return new Response(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  ${refresh}
  <title>${htmlEscape(title)} | AGAPAY</title>
  <link rel="icon" type="image/png" sizes="32x32" href="/favicons/favicon-32x32.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/donor/style.css" />
</head>
<body>
  <div class="app">
    <main class="content" style="min-height:100vh;">
      <div class="page">
        <section class="hero">
          <div class="hero-grid">
            <div>
              <div class="eyebrow">Email verification</div>
              <h1>${htmlEscape(title)}</h1>
              <p>${htmlEscape(message)}</p>
              <div class="notice ${statusClass}" style="margin-top:1rem;">${htmlEscape(message)}</div>
              <p class="form-help" style="margin-top:1rem;"><a href="/myagapay/login">Go to My AGAPAY login</a></p>
            </div>
            <div class="hero-mark"><img src="/mark.png" alt="" /></div>
          </div>
        </section>
      </div>
    </main>
  </div>
  ${script}
</body>
</html>`,
    {
      ...init,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        ...(init.headers || {}),
      },
    }
  );
}
export {
  adminRegistrationSummary,
  bookstoreOrderSource,
  donorVerifyHtml,
  formatUsdFromCents,
  guestBookstoreItemError,
  handleDonorAccountDeletion,
  handleDonorBookstore,
  handleDonorBookstoreIsbnLookup,
  handleDonorBookstoreItemFields,
  handleDonorBookstoreRequestFeature,
  handleDonorClaimCheckout,
  handleDonorCommemorations,
  handleDonorDashboard,
  handleDonorGivingPlusFeatureRequest,
  handleDonorLogin,
  handleDonorMinistryServiceInterest,
  handleDonorNotificationDismiss,
  handleDonorNotifications,
  handleDonorOfferings,
  handleDonorParishCalendar,
  handleDonorPasswordResetConfirm,
  handleDonorPasswordResetRequest,
  handleDonorSacramentAvailability,
  handleDonorSacramentBook,
  handleDonorSacramentCancel,
  handleDonorSacraments,
  handleDonorSession,
  handleDonorSignup,
  handleDonorStewardshipFeatureRequest,
  handleDonorSubscriptionPortal,
  handleDonorSupportTicket,
  handleDonorVerify,
  handleDonorVerifyPage,
  handleParishBookstoreReadiness,
  issueDonorSession,
  jsonForScript,
  loadAdminRegistrationPage,
  loadDonorBookstoreProducts,
  normalizeBookstoreCartItems,
  offeringLabel,
  parseKoinoniaCalendarIcs,
  sendDonationReceiptIfNeeded,
  sendDonorDonationReceiptEmail,
  sendDonorPasswordResetEmail,
  sendDonorVerificationEmail,
};
