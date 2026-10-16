import type {
  DonorEnvironment,
  DonorVerificationResult,
  DonorRequestBody,
  DonorRecord,
} from './donor-composition-contracts.js';

import './donor-parish-context.js';

import '../payments/donation-receipts.js';

import '../payments/donation-events.js';

import '../lib/outside-pledges.js';

import '../lib/logging.js';

import { directoryInvitationNext } from '../lib/directory-invitation-next.js';

import '../lib/legal-acceptance.js';

import {
  applyDonorPassword,
  generateSecret,
  hasProductionStore,
  json,
  loadDonor,
  missingProductionStoreResponse,
  normalizeEmail,
  publicDonor,
  rateLimit,
  saveDonor,
  secureCompare,
  sha256Hex,
  unauthorized,
} from '../lib/core.js';

import '../lib/subscriptions.js';

import '../lib/entitlements.js';

import '../lib/parish-feature-requests.js';

import '../lib/parish-support-tickets.js';

import '../lib/safe-external-url.js';

import '../directory/self-service.js';

import '../lib/consumer-passkeys.js';

import { agapayEmailHtml, sendEmail } from '../lib/email.js';

import { htmlEscape } from '../lib/format.js';

import '../lib/stripe-connect.js';

import '../lib/stripe-fees.js';

import './parish.js';

import './parish-commemorations.js';

import './parish-giving-catalog.js';
import { issueDonorSession } from './donor-authentication.js';
import { jsonForScript, donorVerifyHtml } from './donor.js';
import './donor-profile.js';
import './donor-giving.js';

export async function sendDonorVerificationEmail(env: DonorEnvironment, donor: DonorRecord, verificationUrl: string) {
  const appUrl = env.AGAPAY_APP_URL || 'https://agapay.app';
  const from = env.AGAPAY_FROM_EMAIL || 'AGAPAY <onboarding@agapay.app>';
  const replyTo = env.AGAPAY_REPLY_TO_EMAIL || 'support@agapay.app';
  const safeUrl = htmlEscape(verificationUrl);
  const name = htmlEscape(donor.donorName || donor.householdName || 'friend');
  const diagnostic = donor.isDiagnostic === true;
  const diagnosticBanner = diagnostic
    ? `<p style="margin:0 0 18px;padding:12px 14px;border:1px solid rgba(201,162,91,0.52);border-radius:10px;background:#FFF8EA;font-size:14px;line-height:1.6;color:#171715;"><strong>Delivery test:</strong> No donor account was created and the verification link is intentionally nonfunctional.</p>`
    : '';

  return sendEmail(env, {
    from,
    to: [donor.email],
    reply_to: replyTo,
    subject: `${diagnostic ? '[TEST] ' : ''}Verify your AGAPAY donor account`,
    html: agapayEmailHtml(
      appUrl,
      'Verify your donor account',
      `
      ${diagnosticBanner}
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#171715;">Glory to Jesus Christ!</p>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#171715;">Hello ${name}, please verify your email address to finish setting up your AGAPAY donor dashboard.</p>
      <p style="margin:0 0 24px;"><a href="${safeUrl}" style="display:inline-block;background:#C9A25B;color:#061522;padding:14px 20px;border-radius:10px;text-decoration:none;font-family:Georgia,'Times New Roman',serif;font-size:18px;font-style:italic;font-weight:600;">Verify email address</a></p>
      <p style="margin:0 0 12px;font-size:14px;line-height:1.7;color:#171715;">After verification, you can sign in to your donor dashboard to view offering history, submit commemorations, and give through AGAPAY.</p>
      <p style="margin:0;font-size:12px;line-height:1.6;color:#6F6A60;">If you did not create this AGAPAY account, you can ignore this email.</p>
    `
    ),
  });
}

export async function sendDonorPasswordResetEmail(env: DonorEnvironment, donor: DonorRecord, resetUrl: string) {
  const appUrl = env.AGAPAY_APP_URL || 'https://agapay.app';
  const from = env.AGAPAY_FROM_EMAIL || 'AGAPAY <onboarding@agapay.app>';
  const replyTo = env.AGAPAY_REPLY_TO_EMAIL || 'support@agapay.app';
  const safeUrl = htmlEscape(resetUrl);
  const name = htmlEscape(donor.donorName || donor.householdName || 'friend');

  return sendEmail(env, {
    from,
    to: [donor.email],
    reply_to: replyTo,
    subject: 'Reset your AGAPAY donor password',
    html: agapayEmailHtml(
      appUrl,
      'Reset your donor password',
      `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#171715;">Glory to Jesus Christ, ${name}.</p>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#171715;">Use this secure link to choose a new password for your AGAPAY donor dashboard.</p>
      <p style="margin:0 0 24px;"><a href="${safeUrl}" style="display:inline-block;background:#C9A25B;color:#061522;padding:14px 20px;border-radius:10px;text-decoration:none;font-family:Georgia,'Times New Roman',serif;font-size:18px;font-style:italic;font-weight:600;">Reset donor password</a></p>
      <p style="margin:0;font-size:12px;line-height:1.6;color:#6F6A60;">If you did not request this, ignore this email. The link expires in 1 hour.</p>
    `
    ),
    text: [
      'Reset your AGAPAY donor password',
      '',
      `Open this link to choose a new password: ${resetUrl}`,
      '',
      'If you did not request this, ignore this email. The link expires in 1 hour.',
    ].join('\n'),
  });
}

export async function handleDonorPasswordResetRequest(request: Request, env: DonorEnvironment) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const limited = await rateLimit(request, env, 'donor-password-reset-request', { limit: 6, windowSeconds: 300 });
  if (limited) return limited;

  let body: DonorRequestBody;
  try {
    body = (await request.json()) as DonorRequestBody;
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const email = normalizeEmail(body.email);
  if (!email) return json({ error: 'Email is required' }, { status: 422 });

  const generic = {
    ok: true,
    message: 'If a verified donor account exists for that email, a reset link has been sent.',
  };
  const donor = await loadDonor(env, email);
  if (!donor?.emailVerifiedAt) return json(generic);

  const resetToken = generateSecret('donor_reset');
  const resetSalt = generateSecret('donor_reset_salt');
  const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
  const resetUrl = `${String(appUrl).replace(/\/+$/, '')}/myagapay/login?reset=1&email=${encodeURIComponent(email)}&token=${encodeURIComponent(resetToken)}`;
  const updated = {
    ...donor,
    passwordResetSalt: resetSalt,
    passwordResetTokenHash: await sha256Hex(`${resetSalt}:${resetToken}`),
    passwordResetSentAt: new Date().toISOString(),
    passwordResetExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const emailResult = await sendDonorPasswordResetEmail(env, updated, resetUrl);
  updated.passwordResetEmailStatus = emailResult.status || '';
  updated.passwordResetEmailDetail = emailResult.detail || '';
  await saveDonor(env, updated);

  return json({
    ...generic,
    email: { status: emailResult.status || 'unknown', detail: emailResult.detail || '' },
    resetUrl: emailResult.status === 'not_configured' ? resetUrl : undefined,
  });
}

export async function handleDonorPasswordResetConfirm(request: Request, env: DonorEnvironment) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const limited = await rateLimit(request, env, 'donor-password-reset-confirm', { limit: 10, windowSeconds: 300 });
  if (limited) return limited;

  let body: DonorRequestBody;
  try {
    body = (await request.json()) as DonorRequestBody;
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const email = normalizeEmail(body.email);
  const token = String(body.token || '');
  const newPassword = String(body.newPassword || body.password || '').trim();
  const confirmPassword = String(body.confirmPassword || body.newPassword || body.password || '').trim();
  if (!email || !token) return json({ error: 'Email and reset token are required' }, { status: 422 });
  if (newPassword.length < 8) return json({ error: 'Password must be at least 8 characters' }, { status: 422 });
  if (newPassword !== confirmPassword) return json({ error: 'Passwords do not match' }, { status: 422 });

  const donor = await loadDonor(env, email);
  if (!donor?.emailVerifiedAt) return unauthorized();
  if (!donor.passwordResetSalt || !donor.passwordResetTokenHash) {
    return json({ error: 'Reset link is missing or expired. Please request a new link.' }, { status: 410 });
  }
  if (donor.passwordResetExpiresAt && new Date(donor.passwordResetExpiresAt).getTime() < Date.now()) {
    return json({ error: 'Reset link expired. Please request a new link.' }, { status: 410 });
  }
  const submittedHash = await sha256Hex(`${donor.passwordResetSalt}:${token}`);
  if (!secureCompare(submittedHash, donor.passwordResetTokenHash)) return unauthorized();

  const reset = await applyDonorPassword(
    {
      ...donor,
      passwordResetSalt: '',
      passwordResetTokenHash: '',
      passwordResetSentAt: '',
      passwordResetExpiresAt: '',
      passwordResetEmailStatus: '',
      passwordResetEmailDetail: '',
      sessionSalt: '',
      sessionTokenHash: '',
      sessionExpiresAt: '',
      updatedAt: new Date().toISOString(),
    },
    newPassword
  );
  await saveDonor(env, reset);
  return json({ ok: true, updatedAt: reset.passwordUpdatedAt || new Date().toISOString() });
}

export async function handleDonorVerify(request: Request, env: DonorEnvironment) {
  if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed' }, { status: 405 });
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const limited = await rateLimit(request, env, 'donor-verify', { limit: 20, windowSeconds: 300 });
  if (limited) return limited;

  let email = '';
  let token = '';
  const url = new URL(request.url);
  if (request.method === 'GET') {
    email = normalizeEmail(url.searchParams.get('email'));
    token = String(url.searchParams.get('token') || '');
  } else {
    let body: DonorRequestBody;
    try {
      body = (await request.json()) as DonorRequestBody;
    } catch {
      return json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    email = normalizeEmail(body.email);
    token = String(body.token || '');
  }

  if (!email || !token) return json({ error: 'Verification email and token are required' }, { status: 422 });
  const donor = await loadDonor(env, email);
  if (!donor) return unauthorized();

  const hasVerificationToken = donor.emailVerificationSalt && donor.emailVerificationTokenHash;
  if (!hasVerificationToken) {
    if (donor.emailVerifiedAt) {
      return json({ ok: true, alreadyVerified: true });
    }
    return json(
      { error: 'Verification token is missing or expired. Please sign up again to resend verification.' },
      { status: 410 }
    );
  }
  if (donor.emailVerificationExpiresAt && new Date(donor.emailVerificationExpiresAt).getTime() < Date.now()) {
    if (donor.emailVerifiedAt) {
      return json({ ok: true, alreadyVerified: true });
    }
    return json({ error: 'Verification link expired. Please sign up again to resend verification.' }, { status: 410 });
  }
  const submittedHash = await sha256Hex(`${donor.emailVerificationSalt}:${token}`);
  if (!secureCompare(submittedHash, donor.emailVerificationTokenHash)) return unauthorized();
  if (donor.emailVerifiedAt) {
    const session = await issueDonorSession(env, donor);
    return json({ ok: true, alreadyVerified: true, token: session.token, donor: publicDonor(session.donor) });
  }

  const verified = {
    ...donor,
    emailVerifiedAt: new Date().toISOString(),
    emailVerificationSalt: '',
    emailVerificationTokenHash: '',
    emailVerificationExpiresAt: '',
    updatedAt: new Date().toISOString(),
  };
  const session = await issueDonorSession(env, verified);
  return json({ ok: true, token: session.token, donor: publicDonor(session.donor) });
}

export async function handleDonorVerifyPage(request: Request, env: DonorEnvironment) {
  if (request.method !== 'GET') {
    return donorVerifyHtml(
      {
        title: 'Verification link unavailable',
        message: 'Open your donor verification link in a browser to confirm your email.',
        status: 'error',
      },
      { status: 405 }
    );
  }

  const verification = await handleDonorVerify(request, env);
  const data = (await verification.json().catch(() => ({}))) as DonorVerificationResult;
  const invitationNext = directoryInvitationNext(new URL(request.url).searchParams.get('next'));
  const destination = invitationNext || '/myagapay';

  if (!verification.ok) {
    return donorVerifyHtml(
      {
        title: 'We could not verify your email',
        message:
          data.error ||
          data.detail ||
          'This verification link is invalid or expired. Please sign up again to request a new link.',
        status: 'error',
      },
      { status: verification.status }
    );
  }

  if (!data.token) {
    return donorVerifyHtml(
      {
        title: 'Email already verified',
        message: 'Your email is already verified. Please log in to open your donor dashboard.',
        status: 'success',
        refreshUrl: invitationNext ? `/myagapay/login?next=${encodeURIComponent(invitationNext)}` : '/myagapay/login',
      },
      { status: 200 }
    );
  }

  const session = {
    email: data.donor?.email || new URL(request.url).searchParams.get('email') || '',
    token: data.token,
    donor: data.donor || {},
  };
  const script = `<script>
(() => {
  const session = ${jsonForScript(session)};
  try {
    if (session.email) localStorage.setItem("agapayDonorEmail", session.email);
    if (session.token) localStorage.setItem("agapayDonorToken", session.token);
    if (session.donor) localStorage.setItem("agapayDonorProfile", JSON.stringify(session.donor));
  } catch (err) {}
  window.location.replace(${jsonForScript(destination)});
})();
</script>`;

  return donorVerifyHtml(
    {
      title: 'Email verified',
      message: data.alreadyVerified
        ? 'Your email was already verified. Opening your donor dashboard.'
        : 'Your email is verified. Opening your donor dashboard.',
      status: 'success',
      script,
      refreshUrl: destination,
    },
    { status: 200 }
  );
}
