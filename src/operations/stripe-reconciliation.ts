import type { StripeRequestEnv } from '../lib/stripe-connect.js';
import { stripeGetConnectedRequest } from '../lib/stripe-connect.js';

const DAY_SECONDS = 86_400;
const INITIAL_LOOKBACK_SECONDS = 3 * DAY_SECONDS;
const WEBHOOK_GRACE_SECONDS = 10 * 60;
const RETENTION_LOOKBACK_SECONDS = 29 * DAY_SECONDS;
const PAGE_LIMIT = 20;
const EVENT_TYPES = {
  'payout.paid': 'po',
  'payout.failed': 'po',
  'payout.canceled': 'po',
  'charge.refunded': 'ch',
  'refund.updated': 're',
  'charge.dispute.created': 'dp',
  'charge.dispute.closed': 'dp',
} as const;
type EventType = keyof typeof EVENT_TYPES;

interface ReconciliationEnvironment extends StripeRequestEnv {
  AGAPAY_DB?: D1Database;
  AGAPAY_ENVIRONMENT?: string;
}

interface ConnectedAccount {
  stripe_account_id: string;
  parish_id: string;
  parish_count: number;
  covered_through: number | null;
}

interface Observation {
  id: string;
  type: EventType;
  objectId: string;
  created: number;
}

export const STRIPE_RECONCILIATION_JOB = 'daily_stripe_payment_reconciliation';
export const STRIPE_RECONCILIATION_CRON = '15 8 * * *';

function observeEvent(raw: unknown, expectedLive: boolean, account: string, start: number, end: number): Observation {
  const event = raw as {
    id?: unknown;
    type?: unknown;
    account?: unknown;
    livemode?: unknown;
    created?: unknown;
    data?: { object?: { id?: unknown } };
  } | null;
  const type = event?.type as EventType;
  const prefix = Object.hasOwn(EVENT_TYPES, type) ? EVENT_TYPES[type] : '';
  const objectId = event?.data?.object?.id;
  const created = event?.created;
  if (
    !event ||
    typeof event.id !== 'string' ||
    !/^evt_[A-Za-z0-9_]{1,100}$/.test(event.id) ||
    !prefix ||
    typeof objectId !== 'string' ||
    !/^[a-z]+_[A-Za-z0-9]{1,100}$/.test(objectId) ||
    !objectId.startsWith(`${prefix}_`) ||
    typeof created !== 'number' ||
    !Number.isSafeInteger(created) ||
    created < start ||
    created >= end ||
    event.livemode !== expectedLive ||
    (event.account && event.account !== account)
  ) {
    throw new Error('Stripe returned an unexpected reconciliation event');
  }
  return { id: event.id, type, objectId, created };
}

async function scanAccount(
  env: ReconciliationEnvironment,
  db: D1Database,
  account: ConnectedAccount,
  end: number,
  discoveredAt: string
) {
  if (account.parish_count !== 1) throw new Error('Stripe account ownership is ambiguous');
  if (account.covered_through !== null && account.covered_through >= end) {
    return { checked: 0, discovered: 0, outsideRetention: false };
  }
  const oldest = end - RETENTION_LOOKBACK_SECONDS;
  const requestedStart = (account.covered_through ?? end - INITIAL_LOOKBACK_SECONDS + DAY_SECONDS) - DAY_SECONDS;
  const start = Math.max(oldest, requestedStart);
  const outsideRetention = requestedStart < oldest;
  const params = new URLSearchParams({
    limit: '50',
    'created[gte]': String(start),
    'created[lt]': String(end),
  });
  Object.keys(EVENT_TYPES).forEach((type, index) => params.set(`types[${index}]`, type));
  let checked = 0;
  let discovered = 0;

  for (let page = 0; page < PAGE_LIMIT; page += 1) {
    const result = await stripeGetConnectedRequest(
      env,
      `/v1/events?${params}`,
      account.stripe_account_id,
      AbortSignal.timeout(15_000)
    );
    if (!result.ok || !Array.isArray(result.body.data) || typeof result.body.has_more !== 'boolean') {
      throw new Error(`Stripe event list unavailable (HTTP ${result.status})`);
    }
    const events = result.body.data.map((event) =>
      observeEvent(event, env.AGAPAY_ENVIRONMENT === 'production', account.stripe_account_id, start, end)
    );
    checked += events.length;
    if (events.length) {
      const insert = await db
        .prepare(
          `INSERT INTO stripe_payment_reconciliation_findings
            (event_id,event_type,object_id,stripe_account_id,parish_id,occurred_at,discovered_at)
          SELECT json_extract(o.value,'$.id'),json_extract(o.value,'$.type'),json_extract(o.value,'$.objectId'),
            ?2,?3,strftime('%Y-%m-%dT%H:%M:%fZ',json_extract(o.value,'$.created'),'unixepoch'),?4
          FROM json_each(?1) o
          WHERE NOT EXISTS (SELECT 1 FROM stripe_events e WHERE e.id=json_extract(o.value,'$.id'))
          ON CONFLICT(event_id) DO NOTHING`
        )
        .bind(JSON.stringify(events), account.stripe_account_id, account.parish_id, discoveredAt)
        .run();
      discovered += insert.meta.changes ?? 0;
    }
    if (!result.body.has_more) {
      await db
        .prepare(
          `INSERT INTO stripe_payment_reconciliation_scans(stripe_account_id,covered_through) VALUES (?1,?2)
          ON CONFLICT(stripe_account_id) DO UPDATE SET covered_through=excluded.covered_through
          WHERE excluded.covered_through>stripe_payment_reconciliation_scans.covered_through`
        )
        .bind(account.stripe_account_id, end)
        .run();
      return { checked, discovered, outsideRetention };
    }
    const next = events.at(-1)?.id;
    if (!next || next === params.get('starting_after')) throw new Error('Stripe reconciliation pagination stalled');
    params.set('starting_after', next);
  }
  throw new Error('Stripe reconciliation page limit exceeded');
}

// Review-only. A provider API observation never becomes a webhook delivery or a journal entry.
export async function reconcileStripePaymentDeliveries(env: ReconciliationEnvironment, scheduledTime: number) {
  const db = env.AGAPAY_DB;
  if (!db || !env.STRIPE_SECRET_KEY || !['production', 'staging'].includes(env.AGAPAY_ENVIRONMENT || ''))
    throw new Error('Stripe reconciliation is not configured');
  const end = Math.floor(scheduledTime / 1_000) - WEBHOOK_GRACE_SECONDS;
  const discoveredAt = new Date(scheduledTime).toISOString();
  const { results: accounts } = await db
    .prepare(
      `WITH ownership AS (
        SELECT stripe_account_id,parish_id FROM registrations
        WHERE COALESCE(parish_id,'')<>'' AND status<>'closed'
        UNION
        SELECT stripe_account_id,parish_id FROM settlement_profiles
        WHERE COALESCE(parish_id,'')<>'' AND is_active=1
      )
      SELECT o.stripe_account_id,MIN(o.parish_id) AS parish_id,COUNT(*) AS parish_count,s.covered_through
      FROM ownership o LEFT JOIN stripe_payment_reconciliation_scans s ON s.stripe_account_id=o.stripe_account_id
      WHERE o.stripe_account_id GLOB 'acct_?*' AND SUBSTR(o.stripe_account_id,6) NOT GLOB '*[^A-Za-z0-9]*'
      GROUP BY o.stripe_account_id,s.covered_through ORDER BY o.stripe_account_id`
    )
    .all<ConnectedAccount>();
  let checked = 0;
  let discovered = 0;
  const failures: string[] = [];
  for (const account of accounts) {
    try {
      const result = await scanAccount(env, db, account, end, discoveredAt);
      checked += result.checked;
      discovered += result.discovered;
      if (result.outsideRetention) failures.push('Coverage gap exceeds Stripe event history');
    } catch (error) {
      failures.push(error instanceof Error ? error.message : 'Unknown reconciliation failure');
    }
  }
  if (failures.length) {
    throw new Error(`Stripe reconciliation incomplete for ${failures.length} account(s). ${failures[0]}`);
  }
  return { accounts: accounts.length, checked, discovered };
}
