import type { AdminRegistration, AdminMutation, AdminEnvironment } from './admin-composition-contracts.js';

import {
  d1,
  hasProductionStore,
  json,
  missingProductionStoreResponse,
  normalizeAdminActor,
  rateLimit,
  unauthorized,
} from '../lib/core.js';

import '../lib/mfa.js';

import '../lib/admin-overview-metrics.js';

import '../lib/registrations.js';

import { parishSlug } from '../lib/format.js';

import { defaultSubscriptionTier, normalizeParishHouseholdBand, subscriptionTier } from '../lib/subscriptions.js';

import { createSubscriptionCheckoutForRegistration as createSubscriptionCheckoutForRegistrationShared } from '../lib/subscription-checkout.js';

import { generateDashboardToken, sendDashboardInvite } from '../lib/parish-notifications.js';

import '../lib/memberships.js';

import '../lib/stripe-connect.js';

import {
  appendAdminAudit,
  loadRegistrationByReference,
  requireAdminContext,
  saveRegistrationRecord,
  statusTimelineWithNext,
} from './parish.js';

import './parish-commemorations.js';

import { recordAuditEvent } from '../lib/audit-log.js';

import { TAX_READINESS_STATUSES, withTaxReadinessDefaults } from '../lib/tax-readiness.js';

import {
  PARISH_ONBOARDING_WORKFLOW_VERSION,
  buildParishOnboardingWorkflow,
  invalidateOnboardingSignoffIfChanged,
  normalizeOnboardingChecks,
  onboardingWorkflowEnabled,
  recommendedOnboardingState,
} from '../lib/parish-onboarding.js';

import '../lib/entitlements.js';

import { ensureBenevolenceFundInRegistration } from '../lib/stewardship-funds.js';

import { evaluateOnboardingVerification } from '../organizations/verification-policies.js';

import '../accounting/index.js';

import './accounting-ledger.js';
import './admin-shared.js';
import './admin-revenue.js';
import './admin-registration-storage.js';
import './admin-session-operations.js';
import { stagingOnboardingTestMode } from './admin-onboarding-test.js';
import './admin-accounting-operations.js';

export async function handleAdminRegistrationDetail(request: Request, env: AdminEnvironment, reference: string) {
  const limited = await rateLimit(
    request,
    env,
    request.method === 'PATCH' ? 'admin-registration-write' : 'admin-auth',
    { limit: request.method === 'PATCH' ? 30 : 80, windowSeconds: 300 }
  );
  if (limited) return limited;
  const adminContext = await requireAdminContext(request, env);
  if (!adminContext) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  if (request.method === 'GET') {
    const registration = (await loadRegistrationByReference(env, reference)) as AdminRegistration | null;
    if (!registration) return json({ error: 'Registration not found' }, { status: 404 });
    const normalized = withTaxReadinessDefaults(registration);
    return json({
      registration: {
        ...normalized,
        onboardingWorkflow: await buildParishOnboardingWorkflow(normalized, {
          appUrl: env.AGAPAY_APP_URL || new URL(request.url).origin,
          receiptContact: env.AGAPAY_REPLY_TO_EMAIL || 'support@agapay.app',
        }),
        onboardingTestMode: stagingOnboardingTestMode(env),
      },
    });
  }

  if (request.method === 'PATCH') {
    const current = (await loadRegistrationByReference(env, reference)) as AdminRegistration | null;
    if (!current) return json({ error: 'Registration not found' }, { status: 404 });

    let body: AdminMutation;
    try {
      body = (await request.json()) as AdminMutation;
    } catch {
      return json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const nextStatus = body.status || current.status;
    const enteringVerified = nextStatus === 'verified' && current.status !== 'verified';
    const reviewedByNext = body.reviewedBy ?? current.reviewedBy ?? '';
    const verificationSourceNext = body.verificationSource ?? current.verificationSource ?? '';
    const bishopOrAuthorityNext = body.bishopOrAuthority ?? current.bishopOrAuthority ?? '';
    const dioceseOrDeaneryNext = body.dioceseOrDeanery ?? current.dioceseOrDeanery ?? '';
    const onboardingVerification = evaluateOnboardingVerification({
      ...current,
      status: nextStatus,
      reviewedBy: reviewedByNext,
      verificationSource: verificationSourceNext,
      bishopOrAuthority: bishopOrAuthorityNext,
      dioceseOrDeanery: dioceseOrDeaneryNext,
    });

    // Tax readiness is a manual admin decision, separate from canonical
    // verification -- see src/lib/tax-readiness.js. A blank/unknown value
    // in the body is never treated as "clear the status"; it just means
    // this PATCH didn't touch it.
    const currentTaxReadinessStatus = TAX_READINESS_STATUSES.includes(current.taxReadinessStatus as string)
      ? current.taxReadinessStatus
      : 'tax_needs_review';
    const nextTaxReadinessStatus = TAX_READINESS_STATUSES.includes(body.taxReadinessStatus as string)
      ? body.taxReadinessStatus
      : currentTaxReadinessStatus;
    const taxReadinessStatusChanged = nextTaxReadinessStatus !== currentTaxReadinessStatus;

    if (nextStatus === 'verified' && !onboardingVerification.passed) {
      return json(
        {
          error: onboardingVerification.incompleteMessage,
          missing: onboardingVerification.missingFields,
        },
        { status: 422 }
      );
    }

    const parishId =
      nextStatus === 'verified' ? current.parishId || parishSlug(current.parishName, current.city) : current.parishId;
    const requestedDashboardToken =
      body.parishDashboardToken !== undefined
        ? String(body.parishDashboardToken || '').trim()
        : String(current.parishDashboardToken || '').trim();
    const parishDashboardToken =
      nextStatus === 'verified' && !requestedDashboardToken && !d1(env)
        ? generateDashboardToken()
        : requestedDashboardToken;
    const nextSubscriptionTierId =
      body.subscriptionTier || current.subscriptionTier || defaultSubscriptionTier(current);
    const nextParishHouseholdBand = normalizeParishHouseholdBand(
      body.parishHouseholdBand ?? current.parishHouseholdBand
    );
    const nextTier =
      subscriptionTier({
        ...current,
        subscriptionTier: nextSubscriptionTierId,
        parishHouseholdBand: nextParishHouseholdBand,
      }) ||
      subscriptionTier({
        ...current,
        subscriptionTier: defaultSubscriptionTier(current),
        parishHouseholdBand: nextParishHouseholdBand,
      });
    const nextSubscriptionStatus =
      nextTier?.monthlyCents === 0
        ? 'free_forever'
        : body.subscriptionStatus || current.subscriptionStatus || 'not_started';
    let updated: AdminRegistration = {
      ...current,
      status: nextStatus,
      parishId,
      parishUsername: current.parishUsername || parishId,
      givingStatus: enteringVerified
        ? 'hidden'
        : onboardingWorkflowEnabled(current) && current.onboardingState !== 'LIVE' && body.givingStatus === 'active'
          ? 'hidden'
          : body.givingStatus || current.givingStatus || 'hidden',
      // Stripe connection state is owned by parish-led Stripe onboarding and
      // verified server-side. Never accept these fields from an Admin form:
      // a stale open page could otherwise erase a connection made moments ago.
      stripeAccountStatus: current.stripeAccountStatus || 'not_started',
      stripeAccountId: current.stripeAccountId || '',
      reviewedBy: reviewedByNext,
      verificationSource: verificationSourceNext,
      bishopOrAuthority: bishopOrAuthorityNext,
      dioceseOrDeanery: dioceseOrDeaneryNext,
      platformFee: body.platformFee ?? current.platformFee ?? '',
      liturgicalCalendar: body.liturgicalCalendar ?? current.liturgicalCalendar ?? 'julian',
      subscriptionTier: nextTier?.id || nextSubscriptionTierId,
      parishHouseholdBand: nextParishHouseholdBand || current.parishHouseholdBand || '',
      subscriptionTierLabel: nextTier?.label || current.subscriptionTierLabel || '',
      subscriptionMonthlyCents: nextTier?.monthlyCents ?? current.subscriptionMonthlyCents ?? null,
      subscriptionStatus: nextSubscriptionStatus,
      stripeCustomerId: body.stripeCustomerId ?? current.stripeCustomerId ?? '',
      stripeSubscriptionId: body.stripeSubscriptionId ?? current.stripeSubscriptionId ?? '',
      recurringGivingEnabled: Boolean(body.recurringGivingEnabled ?? current.recurringGivingEnabled ?? true),
      candlesEnabled: Boolean(body.candlesEnabled ?? current.candlesEnabled ?? true),
      commemorationsEnabled: Boolean(body.commemorationsEnabled ?? current.commemorationsEnabled ?? true),
      funds: Array.isArray(body.funds) ? body.funds : current.funds,
      campaigns: Array.isArray(body.campaigns) ? body.campaigns : current.campaigns,
      feastCampaigns: Array.isArray(body.feastCampaigns) ? body.feastCampaigns : current.feastCampaigns,
      parishDashboardToken,
      parishDashboardTokenTemporary: Boolean(parishDashboardToken),
      parishDashboardTokenCreatedAt:
        parishDashboardToken && parishDashboardToken !== current.parishDashboardToken
          ? new Date().toISOString()
          : current.parishDashboardTokenCreatedAt,
      reviewerNotes: body.reviewerNotes ?? current.reviewerNotes ?? '',
      // Tax readiness / billing (see src/lib/tax-readiness.js) -- kept
      // separate from canonical `status` above by design.
      taxReadinessStatus: nextTaxReadinessStatus,
      taxReadinessNotes: body.taxReadinessNotes ?? current.taxReadinessNotes ?? '',
      taxReadinessReviewedAt: taxReadinessStatusChanged
        ? new Date().toISOString()
        : current.taxReadinessReviewedAt || '',
      taxReadinessReviewedBy: taxReadinessStatusChanged ? adminContext.actor : current.taxReadinessReviewedBy || '',
      billingLegalName: body.billingLegalName ?? current.billingLegalName ?? '',
      billingAddressLine1: body.billingAddressLine1 ?? current.billingAddressLine1 ?? '',
      billingAddressLine2: body.billingAddressLine2 ?? current.billingAddressLine2 ?? '',
      billingCity: body.billingCity ?? current.billingCity ?? '',
      billingState: body.billingState ?? current.billingState ?? '',
      billingPostalCode: body.billingPostalCode ?? current.billingPostalCode ?? '',
      billingCountry: body.billingCountry ?? current.billingCountry ?? '',
      statusTimeline: statusTimelineWithNext(current.status as string, nextStatus as string, current.statusTimeline),
      stripeStatusHistory: statusTimelineWithNext(
        current.stripeAccountStatus || 'not_started',
        current.stripeAccountStatus || 'not_started',
        current.stripeStatusHistory
      ),
      subscriptionStatusHistory: statusTimelineWithNext(
        current.subscriptionStatus || 'not_started',
        nextSubscriptionStatus,
        current.subscriptionStatusHistory
      ),
      lastWorkflowEventAt: new Date().toISOString(),
      reviewedAt: new Date().toISOString(),
      publicProfileCreatedAt:
        nextStatus === 'verified'
          ? current.publicProfileCreatedAt || new Date().toISOString()
          : current.publicProfileCreatedAt,
    };
    if (nextStatus === 'verified') {
      updated = {
        ...updated,
        onboardingWorkflowVersion: Math.max(
          Number(current.onboardingWorkflowVersion || 0),
          PARISH_ONBOARDING_WORKFLOW_VERSION
        ),
        onboardingChecks: normalizeOnboardingChecks(
          body.onboardingChecks,
          current.onboardingChecks,
          adminContext.actor
        ),
      };
      updated.onboardingState = recommendedOnboardingState(updated, updated.onboardingChecks);
    }
    if (nextTier?.modules?.givingPlus) {
      updated = ensureBenevolenceFundInRegistration(updated).registration as AdminRegistration;
    }

    const reviewerNote = String(body.reviewerNotes || '').trim();
    if (reviewerNote) {
      const nextHistory = Array.isArray(current.notesHistory) ? [...current.notesHistory] : [];
      nextHistory.push({
        author: normalizeAdminActor(reviewedByNext || adminContext.actor),
        text: reviewerNote,
        createdAt: new Date().toISOString(),
      });
      updated.notesHistory = nextHistory.slice(-200);
    }

    if (nextStatus !== current.status) {
      updated = appendAdminAudit(updated, 'status_changed', adminContext.actor, {
        from: current.status || 'pending',
        to: nextStatus,
      });
    }
    if (
      (body.subscriptionStatus || current.subscriptionStatus || 'not_started') !==
      (current.subscriptionStatus || 'not_started')
    ) {
      updated = appendAdminAudit(updated, 'subscription_status_changed', adminContext.actor, {
        from: current.subscriptionStatus || 'not_started',
        to: body.subscriptionStatus || current.subscriptionStatus || 'not_started',
      });
    }
    if (reviewerNote) {
      updated = appendAdminAudit(updated, 'review_note_added', reviewedByNext || adminContext.actor, {
        notePreview: reviewerNote.slice(0, 160),
      });
    }

    let dashboardInvite: (Awaited<ReturnType<typeof sendDashboardInvite>> & { id?: string; detail?: unknown }) | null =
      null;
    if (body.sendDashboardInvite && nextStatus === 'verified') {
      const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
      dashboardInvite = await sendDashboardInvite(env, appUrl, updated);
      updated = {
        ...updated,
        dashboardInviteEmailStatus: dashboardInvite.status,
        dashboardInviteEmailId: dashboardInvite.id || '',
        dashboardInviteEmailDetail: dashboardInvite.detail || '',
        dashboardInviteEmailRecipients: dashboardInvite.recipients || [],
        dashboardInviteEmailSentAt:
          dashboardInvite.status === 'sent' ? new Date().toISOString() : updated.dashboardInviteEmailSentAt,
        onboardingAccess: dashboardInvite.access
          ? { ...(updated.onboardingAccess || {}), ...dashboardInvite.access }
          : updated.onboardingAccess,
      };
      updated = appendAdminAudit(updated, 'dashboard_invite_requested', adminContext.actor, {
        emailStatus: dashboardInvite.status || 'unknown',
        recipients: dashboardInvite.recipients || [],
      });
    }

    if (nextStatus === 'verified') {
      updated.onboardingState = recommendedOnboardingState(updated, updated.onboardingChecks);
    }
    updated = await invalidateOnboardingSignoffIfChanged(current, updated, {
      actor: adminContext.actor,
      reason: 'AGAPAY Admin changed material onboarding configuration.',
      receiptContact: env.AGAPAY_REPLY_TO_EMAIL || 'support@agapay.app',
    });

    await saveRegistrationRecord(env, reference, updated, current);

    if (nextStatus !== current.status) {
      await recordAuditEvent(env, request, {
        action: 'registration.status_changed',
        actorUserId: adminContext.actor,
        targetType: 'registration',
        targetId: reference,
        organizationId: parishId || reference,
        reason: reviewerNote || null,
        before: { status: current.status || 'pending' },
        after: { status: nextStatus },
      });
    }

    if (taxReadinessStatusChanged) {
      await recordAuditEvent(env, request, {
        action: 'registration.tax_readiness_changed',
        actorUserId: adminContext.actor,
        targetType: 'registration',
        targetId: reference,
        organizationId: parishId || reference,
        reason: (body.taxReadinessNotes || '').trim() || null,
        before: { taxReadinessStatus: currentTaxReadinessStatus },
        after: { taxReadinessStatus: nextTaxReadinessStatus },
      });
    }

    return json({
      ok: true,
      registration: {
        ...updated,
        onboardingWorkflow: await buildParishOnboardingWorkflow(updated, {
          appUrl: env.AGAPAY_APP_URL || new URL(request.url).origin,
          receiptContact: env.AGAPAY_REPLY_TO_EMAIL || 'support@agapay.app',
        }),
        onboardingTestMode: stagingOnboardingTestMode(env),
      },
      dashboardInvite,
    });
  }

  return json({ error: 'Method not allowed' }, { status: 405 });
}

export async function createSubscriptionCheckoutForRegistration(
  request: Request,
  env: AdminEnvironment,
  reference: string,
  registration: AdminRegistration,
  body: AdminMutation = {},
  returnPath: string = '/admin'
) {
  return createSubscriptionCheckoutForRegistrationShared({
    request,
    env,
    reference,
    registration,
    body,
    returnPath,
    allowTrial: true,
    saveRegistrationRecord,
  });
}
