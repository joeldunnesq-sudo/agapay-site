import { hasActiveStewardshipComp, stewardshipStatus, hasStewardshipAccess } from '../lib/core.js';
import type { StewardshipEnvironment, StewardshipMeetingRow } from './stewardship-composition-contracts.js';

// src/handlers/stewardship.js
// AGAPAY Stewardship module — Parish-tier annual meeting packet builder.
// All routes live under /parish/stewardship/*.
// Parish auth is already verified by requireAdmin / requireParish helpers in parish.js
// before these handlers are called.

import { d1All, hasProductionStore, json, missingProductionStoreResponse } from '../lib/core.js';

import '../lib/entitlements.js';

import './parish.js';

import './admin.js';

import '../lib/core.js';

import { isMissingStewardshipSchema, publicMeeting } from './stewardship-http.js';

import { paywallHtml, stewardshipHomeHtml } from './stewardship-presentation.js';

import './stewardship-packet-presentation.js';

import { handleStewardshipFinancials } from './stewardship-financials.js';

import { handleStewardshipNudge, handleStewardshipWebhook } from './stewardship-communications.js';
import { STEWARDSHIP_COMING_SOON } from './stewardship-shared.js';
import {
  requireParishContext,
  requireParishApiContext,
  stewardshipPublicStatus,
  hasStewardshipToolAccess,
  stewardshipComingSoonPayload,
  stewardshipComingSoonHtml,
} from './stewardship-shared.js';
import './stewardship-billing.js';
import './stewardship-meeting-api.js';
import './stewardship-meeting-pages.js';
import './stewardship-metrics-page.js';
import './stewardship-meeting-storage.js';

export { handleStewardshipFinancials, handleStewardshipNudge, handleStewardshipWebhook };

// ─── Subscription helpers ─────────────────────────────────────────────────────
// hasActiveStewardshipComp, stewardshipStatus, and hasStewardshipAccess now
// live in lib/core.js — re-exported here so every existing caller inside
// this file that imports them from "./stewardship.js" keeps working, while
// parish.js and donor.js can import the same functions directly from
// core.js without creating a circular dependency on this file.
export { hasActiveStewardshipComp, stewardshipStatus, hasStewardshipAccess };
export { STEWARDSHIP_PRODUCT_KEY } from './stewardship-shared.js';
export {
  handleAdminGrantStewardshipComp,
  handleAdminStewardshipCompStatus,
  handleParishStewardshipSubscribe,
  handleParishStewardshipBillingPortal,
  handleStewardshipSubscribe,
  handleStewardshipBilling,
  handleStewardshipBillingPortal,
} from './stewardship-billing.js';
export { handleParishStewardshipMeetings, handleParishStewardshipMeetingDetail } from './stewardship-meeting-api.js';
export {
  handleStewardshipMeetingList,
  handleStewardshipMeetingNew,
  handleStewardshipMeetingEdit,
  handleStewardshipMeetingPreview,
  handleStewardshipMeetingPdf,
} from './stewardship-meeting-pages.js';
export { handleStewardshipGivingMetricsPage } from './stewardship-metrics-page.js';

// ─── Route handlers ───────────────────────────────────────────────────────────

export async function handleParishStewardshipSummary(request: Request, env: StewardshipEnvironment, parishId: string) {
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const ctx = await requireParishApiContext(request, env, parishId);
  if (!ctx.ok) return ctx.response;
  const { registration } = ctx;
  if (STEWARDSHIP_COMING_SOON) return json(stewardshipComingSoonPayload(registration));
  let meetings: StewardshipMeetingRow[] = [];
  let setupRequired = false;
  try {
    meetings = await d1All<StewardshipMeetingRow>(
      env,
      `
      SELECT id, title, fiscal_year, meeting_date, status, created_at, updated_at
      FROM stewardship_annual_meetings
      WHERE parish_id = ?
      ORDER BY fiscal_year DESC, created_at DESC
      LIMIT 50
    `,
      registration.parishId
    );
  } catch (error) {
    if (!isMissingStewardshipSchema(error as Error)) throw error;
    setupRequired = true;
  }

  return json({
    ok: true as const,
    stewardship: stewardshipPublicStatus(registration),
    setupRequired,
    meetings: (meetings || []).map(publicMeeting),
    subscribePlans: [],
  });
}

// GET /parish/stewardship
export async function handleStewardshipHome(request: Request, env: StewardshipEnvironment) {
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const ctx = await requireParishContext(request, env);
  if (!ctx.ok) return ctx.response;
  const { registration } = ctx;
  if (STEWARDSHIP_COMING_SOON) {
    return new Response(stewardshipComingSoonHtml(registration, env), {
      headers: { 'Content-Type': 'text/html;charset=utf-8' },
    });
  }

  if (!hasStewardshipToolAccess(registration)) {
    return new Response((paywallHtml as (...ignored: unknown[]) => string)(registration, env), {
      headers: { 'Content-Type': 'text/html;charset=utf-8' },
    });
  }

  const meetings = await d1All<StewardshipMeetingRow>(
    env,
    `
    SELECT id, title, fiscal_year, meeting_date, status
    FROM stewardship_annual_meetings
    WHERE parish_id = ?
    ORDER BY fiscal_year DESC, created_at DESC
    LIMIT 50
  `,
    registration.parishId
  );

  return new Response(stewardshipHomeHtml(registration, meetings || [], env), {
    headers: { 'Content-Type': 'text/html;charset=utf-8' },
  });
}
