import { json, normalizeEmail, rateLimit, unauthorized } from '../lib/core.js';
import { agapayEmailHtml, sendEmail } from '../lib/email.js';
import { sendAdminRegistrationNotice, sendDashboardInvite } from '../lib/parish-notifications.js';
import { recordAuditEvent } from '../lib/audit-log.js';
import { sendDonorDonationReceiptEmail, sendDonorVerificationEmail } from './donor.js';
import { requireAdminContext } from './parish.js';

const EMAIL_DIAGNOSTIC_KINDS = new Set(['verification', 'invitation', 'receipt', 'administrative']);

function configuredEmailDiagnosticRecipients(env) {
  return new Set(
    [env.AGAPAY_OPS_ALERT_EMAIL, env.AGAPAY_REGISTRATION_NOTIFY_EMAIL, env.AGAPAY_REPLY_TO_EMAIL]
      .map(normalizeEmail)
      .filter(Boolean)
  );
}

function diagnosticRegistration(recipient, stamp) {
  return {
    reference: `EMAIL-DIAGNOSTIC-${stamp}`,
    parishId: 'agapay-email-diagnostic',
    parishName: 'AGAPAY EMAIL TEST — NO PARISH CREATED',
    communityType: 'mission',
    jurisdiction: 'Diagnostic only',
    city: 'Lubbock',
    state: 'TX',
    addressLine1: 'No production record created',
    postalCode: '00000',
    website: 'https://agapay.app',
    organizationDescription: 'Launch-readiness email rendering test. This is not a parish registration.',
    subscriptionTier: 'starter',
    subscriptionStatus: 'inactive',
    status: 'verified',
    priestFirst: 'AGAPAY',
    priestLast: 'Email Test',
    priestEmail: recipient,
    treasurerFirst: '',
    treasurerLast: '',
    treasurerEmail: '',
  };
}

export async function handleAdminEmailDiagnostics(request, env) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const admin = await requireAdminContext(request, env);
  if (!admin) return unauthorized();
  const limited = await rateLimit(request, env, 'admin-email-diagnostics', { limit: 4, windowSeconds: 3600 });
  if (limited) return limited;

  const body = await request.json().catch(() => ({}));
  const allowedRecipients = configuredEmailDiagnosticRecipients(env);
  const recipient = normalizeEmail(body.recipient || env.AGAPAY_OPS_ALERT_EMAIL || env.AGAPAY_REPLY_TO_EMAIL);
  if (!recipient || !allowedRecipients.has(recipient)) {
    return json({ error: 'Diagnostics may only be sent to a configured AGAPAY operations address.' }, { status: 422 });
  }

  const requestedKinds =
    Array.isArray(body.kinds) && body.kinds.length
      ? [...new Set(body.kinds.map((value) => String(value).trim().toLowerCase()))]
      : [...EMAIL_DIAGNOSTIC_KINDS];
  if (requestedKinds.some((kind) => !EMAIL_DIAGNOSTIC_KINDS.has(kind))) {
    return json({ error: 'Unknown email diagnostic kind.' }, { status: 422 });
  }

  const stamp = new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, '')
    .slice(0, 14);
  const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
  const registration = diagnosticRegistration(recipient, stamp);
  const results = {};

  for (const kind of requestedKinds) {
    if (kind === 'verification') {
      results.verification = await sendDonorVerificationEmail(
        env,
        {
          email: recipient,
          donorName: 'AGAPAY email-test recipient',
          isDiagnostic: true,
        },
        `${appUrl}/myagapay/verify?diagnostic=${encodeURIComponent(stamp)}`
      );
    } else if (kind === 'invitation') {
      results.invitation = await sendDashboardInvite(env, appUrl, registration);
    } else if (kind === 'receipt') {
      results.receipt = await sendDonorDonationReceiptEmail(env, {
        id: `email-diagnostic-${stamp}`,
        donorEmail: recipient,
        donorName: 'AGAPAY email-test recipient',
        parishName: 'AGAPAY EMAIL TEST — NO PARISH CREATED',
        title: 'Template rendering fixture — no gift occurred',
        amountCents: 100,
        giftAmountCents: 100,
        chargeAmountCents: 100,
        parishNetCents: 97,
        totalFeeCents: 3,
        donorCoveredFeeCents: 0,
        coverFees: false,
        stripePaymentIntentId: 'TEST-NO-CHARGE',
        completedAt: new Date().toISOString(),
        isDiagnostic: true,
      });
    } else if (kind === 'administrative') {
      results.administrative = await sendAdminRegistrationNotice(
        {
          ...env,
          AGAPAY_REGISTRATION_NOTIFY_EMAIL: recipient,
        },
        appUrl,
        registration
      );
    }
  }

  if (body.includeBounce === true) {
    results.bounce = await sendEmail(env, {
      from: env.AGAPAY_FROM_EMAIL || 'AGAPAY <onboarding@agapay.app>',
      to: [`bounced+agapay-launch-${stamp}@resend.dev`],
      reply_to: env.AGAPAY_REPLY_TO_EMAIL || 'support@agapay.app',
      subject: `[TEST] AGAPAY controlled bounce ${stamp}`,
      text: 'Controlled AGAPAY launch-readiness bounce test. No real recipient is involved.',
      html: agapayEmailHtml(
        appUrl,
        'Controlled bounce test',
        "<p>This message intentionally targets Resend's designated bounce-test address. No real recipient is involved.</p>"
      ),
    });
  }

  await recordAuditEvent(env, request, {
    action: 'admin.email_diagnostics.run',
    actorUserId: admin.actor,
    actorType: 'admin',
    targetType: 'email_operations',
    targetId: recipient,
    reason: 'Launch-readiness inbox, rendering, and bounce verification',
    metadata: {
      kinds: requestedKinds,
      includeBounce: body.includeBounce === true,
      statuses: Object.fromEntries(Object.entries(results).map(([key, value]) => [key, value?.status || 'unknown'])),
    },
  });

  const allAccepted = Object.values(results).every((result) => result?.status === 'sent');
  return json({ ok: allAccepted, recipient, stamp, results }, { status: allAccepted ? 200 : 502 });
}
