// Generated from src/handlers/parish-registration-intake.ts by npm run build:server. Do not edit.
import '../payments/donation-events.js';
import '../festal-alms.js';
import { registrationRetryIdentity, insertRegistrationOnce } from '../lib/registration-retries.js';
import '../payments/giving-checkout.js';
import { d1Run, hasProductionStore, json, rateLimit, verifyTurnstileIfConfigured } from '../lib/core.js';
import { ensureBenevolenceFundInRegistration } from '../lib/stewardship-funds.js';
import '../lib/parish-onboarding.js';
import { createTaxExemptionClaim, issueClaimUploadToken } from '../lib/tax-exemption.js';
import '../lib/subscription-checkout.js';
import { normalizeParishHouseholdBand, subscriptionTier as sharedSubscriptionTier } from '../lib/subscriptions.js';
import '../lib/parish-pricing-usage.js';
import { parishSlug } from '../lib/format.js';
import {
  registrationAgreementEvidence,
  registrationRequiresJurisdiction,
  registrationRequiresValuesReview,
  registrationRequiresWebsite,
  sanitizePublicRegistrationInput,
} from '../lib/registration-intake.js';
import { withTaxReadinessDefaults } from '../lib/tax-readiness.js';
import { recordOrganizationRegistrationAcceptance } from '../lib/legal-acceptance.js';
import '../lib/stripe-fees.js';
import '../lib/stripe-connect.js';
import {
  generateDashboardToken,
  sendAdminRegistrationNotice,
  sendRegistrationConfirmation,
} from '../lib/parish-notifications.js';
import './parish-giving-catalog.js';
import './parish-commemorations.js';
import './parish-donor-offerings.js';
import {
  defaultSubscriptionTier,
  findRegistrationByParishId,
  loadRegistrationByReference,
  requireFields,
  saveRegistrationRecord,
  slugify,
} from './parish.js';
import { d1 } from './parish-checkout-shared.js';
import './parish-giving-checkout.js';
import './parish-checkout.js';
async function handleRegistrations(request, env) {
  const limited = await rateLimit(request, env, 'registrations', { limit: 6, windowSeconds: 600 });
  if (limited) return limited;
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return json({ error: 'Enter the registration details.' }, { status: 400 });
  const turnstileToken = body.turnstileToken || body.cfTurnstileToken;
  body = sanitizePublicRegistrationInput(body);
  const retry = await registrationRetryIdentity(request, body);
  if (retry?.error) return json({ error: retry.error }, { status: 400 });
  if (retry && !env.AGAPAY_DB?.prepare)
    return json(
      { error: 'Registration is temporarily unavailable. Please contact support@agapay.app.' },
      { status: 503 }
    );
  const replayRegistration = async () => {
    const existing = await loadRegistrationByReference(env, retry.reference);
    if (!existing) return null;
    return existing.registrationRequestHash !== retry.hash
      ? json(
          {
            error:
              'This submission was already received with different details. Contact support@agapay.app to correct it.',
            code: 'registration_retry_changed',
          },
          { status: 409 }
        )
      : json({
          ok: true,
          reference: retry.reference,
          mode: 'stored',
          replayed: true,
          message: 'Your registration was already received. No second registration was created.',
          ...(body.taxExemption
            ? {
                taxExemption: {
                  ok: false,
                  error: 'Please confirm document receipt with support before resending an exemption document.',
                },
              }
            : {}),
        });
  };
  if (retry) {
    const replay = await replayRegistration();
    if (replay) return replay;
  }
  const turnstile = await verifyTurnstileIfConfigured(request, env, turnstileToken);
  if (turnstile) return turnstile;
  if (body.canonicalAgreement !== true)
    return json({ error: 'Authorization and agreement to the Terms of Service are required.' }, { status: 422 });
  const requiredFields = [
    'communityType',
    'parishName',
    'addressLine1',
    'city',
    'state',
    'postalCode',
    'subscriptionTier',
    'priestFirst',
    'priestEmail',
    'priestPhone',
    'treasurerFirst',
    'treasurerEmail',
    'acceptingName',
    'acceptingEmail',
    'acceptingRole',
  ];
  if (registrationRequiresJurisdiction(body.communityType)) requiredFields.push('jurisdiction');
  if (String(body.subscriptionTier || '').toLowerCase() === 'parish') requiredFields.push('parishHouseholdBand');
  if (registrationRequiresWebsite(body.communityType)) requiredFields.push('website');
  if (registrationRequiresValuesReview(body.communityType)) requiredFields.push('organizationDescription');
  const missing = requireFields(body, requiredFields);
  if (missing.length) return json({ error: 'Missing required fields', fields: missing }, { status: 422 });
  const invalidEmails = ['priestEmail', 'treasurerEmail', 'acceptingEmail'].filter(
    (field) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body[field])
  );
  if (invalidEmails.length) {
    return json(
      { error: 'Enter a valid email address, such as name@example.org.', fields: invalidEmails },
      { status: 422 }
    );
  }
  const communityType = String(body.communityType || '');
  const requestedTier = String(body.subscriptionTier || '')
    .trim()
    .toLowerCase();
  const selectableParishTiers = /* @__PURE__ */ new Set(['starter', 'giving', 'parish']);
  const validTierForCommunity =
    communityType === 'Cathedral'
      ? requestedTier === 'diocese'
      : communityType === 'Monastery'
        ? requestedTier === 'monastery_free'
        : selectableParishTiers.has(requestedTier);
  if (!validTierForCommunity) {
    return json({ error: 'Choose a valid starting tier for this community type.' }, { status: 422 });
  }
  if (requestedTier === 'parish' && !normalizeParishHouseholdBand(body.parishHouseholdBand))
    return json({ error: 'Choose a valid active-household range.' }, { status: 422 });
  const reference = retry?.reference || `AGP-REG-${crypto.randomUUID()}`,
    receivedAt = /* @__PURE__ */ new Date().toISOString();
  const subscriptionTierId = requestedTier;
  const tier =
    sharedSubscriptionTier({ ...body, subscriptionTier: subscriptionTierId }) ||
    sharedSubscriptionTier({ ...body, subscriptionTier: defaultSubscriptionTier(body) });
  const baseParishId = parishSlug(body.parishName, body.city);
  let parishId = baseParishId;
  if (await findRegistrationByParishId(env, parishId)) {
    const stateSuffix = slugify(body.state);
    parishId = stateSuffix ? `${baseParishId}-${stateSuffix}`.slice(0, 80) : baseParishId;
    let collision = await findRegistrationByParishId(env, parishId);
    let suffix = 2;
    while (collision && suffix < 100) {
      parishId = `${baseParishId}-${stateSuffix ? `${stateSuffix}-` : ''}${suffix}`.slice(0, 80);
      collision = await findRegistrationByParishId(env, parishId);
      suffix += 1;
    }
    if (collision)
      return json({ error: 'Unable to create a unique parish ID. Please contact AGAPAY support.' }, { status: 409 });
  }
  const parishDashboardToken = generateDashboardToken();
  const registrationWithTier = withTaxReadinessDefaults({
    ...body,
    ...(retry ? { registrationRequestHash: retry.hash } : {}),
    reference,
    status: 'pending',
    receivedAt,
    canonicalVerification: 'pending_review',
    parishId,
    parishUsername: parishId,
    parishDashboardToken,
    parishDashboardTokenTemporary: true,
    parishDashboardTokenCreatedAt: receivedAt,
    ...registrationAgreementEvidence(receivedAt),
    subscriptionTier: tier?.id || 'parish',
    subscriptionPricingProgram: tier?.id === 'parish' ? 'early_adopter_candidate' : 'standard',
    subscriptionStatus: tier?.monthlyCents === 0 ? 'free_forever' : 'not_started',
    subscriptionMonthlyCents: tier?.monthlyCents ?? null,
    subscriptionTierLabel: tier?.label || '',
  });
  const registration = tier?.modules?.givingPlus
    ? ensureBenevolenceFundInRegistration(registrationWithTier).registration
    : registrationWithTier;
  await recordOrganizationRegistrationAcceptance(env, request, { body, parishId, reference });
  if (retry && !(await insertRegistrationOnce(env, registration))) return await replayRegistration();
  let taxExemptionResult = null;
  if (env.AGAPAY_REGISTRATIONS) {
    if (!retry) await saveRegistrationRecord(env, reference, registration);
    const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
    const [notice, confirmation] = await Promise.all([
      sendAdminRegistrationNotice(env, appUrl, registration),
      sendRegistrationConfirmation(env, appUrl, registration),
    ]);
    await saveRegistrationRecord(
      env,
      reference,
      {
        ...registration,
        adminNotificationEmailStatus: notice.status,
        adminNotificationEmailId: notice.id || '',
        adminNotificationEmailDetail: notice.detail || '',
        adminNotificationEmailSentAt: notice.status === 'sent' ? /* @__PURE__ */ new Date().toISOString() : '',
        confirmationEmailStatus: confirmation.status,
        confirmationEmailId: confirmation.id || '',
        confirmationEmailSentAt: confirmation.status === 'sent' ? /* @__PURE__ */ new Date().toISOString() : '',
      },
      registration
    );
    const exemptionInput = body.taxExemption;
    if (exemptionInput && (exemptionInput.claimsExemption === true || exemptionInput.claimsExemption === 'yes')) {
      try {
        const jurisdiction = String(exemptionInput.jurisdiction || '')
          .trim()
          .toUpperCase();
        const repName = String(exemptionInput.authorizedRepresentativeName || '').trim();
        const repTitle = String(exemptionInput.authorizedRepresentativeTitle || '').trim();
        if (!jurisdiction) throw new Error('Exemption jurisdiction is required.');
        if (!repName || !repTitle) throw new Error('Authorized representative name and title are required.');
        if (exemptionInput.certified !== true) throw new Error('You must certify the exemption claim.');
        if (jurisdiction === 'OTHER' && !String(exemptionInput.multistateExplanation || '').trim()) {
          throw new Error('Please explain the jurisdiction or multistate use this exemption relates to.');
        }
        const taxExemptionId = await createTaxExemptionClaim(env, {
          registrationReference: reference,
          parishId,
          jurisdiction,
          exemptionType: String(exemptionInput.exemptionType || '').trim() || 'religious_organization',
          certificateNumber: exemptionInput.certificateNumber || '',
          effectiveDate: exemptionInput.effectiveDate || '',
          expirationDate: exemptionInput.expirationDate || '',
          authorizedRepresentativeName: repName,
          authorizedRepresentativeTitle: repTitle,
          actorUserId: body.treasurerEmail || body.priestEmail || '',
          internalReviewStatus: jurisdiction === 'OTHER' ? 'needs_manual_review' : null,
        });
        if (d1(env)) {
          await d1Run(
            env,
            `UPDATE registrations SET tax_exemption_status = 'pending', current_tax_exemption_id = ?1 WHERE reference = ?2`,
            taxExemptionId,
            reference
          );
        }
        const upload = await issueClaimUploadToken(env, taxExemptionId);
        taxExemptionResult = {
          ok: true,
          taxExemptionId,
          uploadRequired: true,
          uploadToken: upload.token,
          uploadTokenExpiresAt: upload.expiresAt,
          uploadUrl: `/api/tax-exemption/${encodeURIComponent(taxExemptionId)}/upload`,
        };
      } catch (exemptionError) {
        taxExemptionResult = {
          ok: false,
          error: exemptionError.message || 'Could not submit exemption claim.',
        };
      }
    }
  }
  return json(
    {
      ok: true,
      reference,
      mode: hasProductionStore(env) ? 'stored' : 'demo',
      message: 'Registration received. AGAPAY will review the organization before activation.',
      ...(taxExemptionResult ? { taxExemption: taxExemptionResult } : {}),
    },
    { status: 201 }
  );
}
export { handleRegistrations };
