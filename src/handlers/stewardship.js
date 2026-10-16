// Generated from src/handlers/stewardship.ts by npm run build:server. Do not edit.
import { hasActiveStewardshipComp, stewardshipStatus, hasStewardshipAccess } from '../lib/core.js';
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
import { STEWARDSHIP_PRODUCT_KEY } from './stewardship-shared.js';
import {
  handleAdminGrantStewardshipComp,
  handleAdminStewardshipCompStatus,
  handleParishStewardshipSubscribe,
  handleParishStewardshipBillingPortal,
  handleStewardshipSubscribe,
  handleStewardshipBilling,
  handleStewardshipBillingPortal,
} from './stewardship-billing.js';
import { handleParishStewardshipMeetings, handleParishStewardshipMeetingDetail } from './stewardship-meeting-api.js';
import {
  handleStewardshipMeetingList,
  handleStewardshipMeetingNew,
  handleStewardshipMeetingEdit,
  handleStewardshipMeetingPreview,
  handleStewardshipMeetingPdf,
} from './stewardship-meeting-pages.js';
import { handleStewardshipGivingMetricsPage } from './stewardship-metrics-page.js';
async function handleParishStewardshipSummary(request, env, parishId) {
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const ctx = await requireParishApiContext(request, env, parishId);
  if (!ctx.ok) return ctx.response;
  const { registration } = ctx;
  if (STEWARDSHIP_COMING_SOON) return json(stewardshipComingSoonPayload(registration));
  let meetings = [];
  let setupRequired = false;
  try {
    meetings = await d1All(
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
    if (!isMissingStewardshipSchema(error)) throw error;
    setupRequired = true;
  }
  return json({
    ok: true,
    stewardship: stewardshipPublicStatus(registration),
    setupRequired,
    meetings: (meetings || []).map(publicMeeting),
    subscribePlans: [],
  });
}
async function handleStewardshipHome(request, env) {
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
    return new Response(paywallHtml(registration, env), {
      headers: { 'Content-Type': 'text/html;charset=utf-8' },
    });
  }
  const meetings = await d1All(
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
export {
  STEWARDSHIP_PRODUCT_KEY,
  handleAdminGrantStewardshipComp,
  handleAdminStewardshipCompStatus,
  handleParishStewardshipBillingPortal,
  handleParishStewardshipMeetingDetail,
  handleParishStewardshipMeetings,
  handleParishStewardshipSubscribe,
  handleParishStewardshipSummary,
  handleStewardshipBilling,
  handleStewardshipBillingPortal,
  handleStewardshipFinancials,
  handleStewardshipGivingMetricsPage,
  handleStewardshipHome,
  handleStewardshipMeetingEdit,
  handleStewardshipMeetingList,
  handleStewardshipMeetingNew,
  handleStewardshipMeetingPdf,
  handleStewardshipMeetingPreview,
  handleStewardshipNudge,
  handleStewardshipSubscribe,
  handleStewardshipWebhook,
  hasActiveStewardshipComp,
  hasStewardshipAccess,
  stewardshipStatus,
};
