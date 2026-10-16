import type {
  StripeRequestEnv,
  FundReportPeriod,
  ReconciliationStripeRecord,
  ReconciliationStripeResponse,
  TransferAllocation,
  ReconciliationRegistration,
  ReconciliationReport,
} from './parish-reconciliation-composition-contracts.js';
import {
  reconciliationCloseRecord,
  prepareReconciliationReport,
  fundReportPeriod,
  parishReportingTimezone,
  d1,
  resolveParishDashboardSession,
  stripeGetConnectedRequest,
  findRegistrationByParishId,
  getBearerToken,
  givingFeatureAccess,
  hasProductionStore,
  json,
  missingProductionStoreResponse,
  rateLimit,
  unauthorized,
  verifyParishDashboardBearer,
} from './parish-reconciliation-shared.js';
import './parish-payout-diagnostics.js';
export { handleParishPayoutDiagnostics } from './parish-payout-diagnostics.js';

export async function listRecentStripePayouts(
  env: Partial<Env> & StripeRequestEnv,
  stripeAccountId: string,
  limit: number = 10
): Promise<ReconciliationStripeResponse> {
  const payouts: ReconciliationStripeRecord[] = [];
  let startingAfter = '';
  let pages = 0;

  do {
    const params = new URLSearchParams({
      limit: String(Math.min(100, Math.max(1, limit - payouts.length))),
    });
    if (startingAfter) params.set('starting_after', startingAfter);

    const result = (await stripeGetConnectedRequest(
      env,
      `/v1/payouts?${params.toString()}`,
      stripeAccountId
    )) as ReconciliationStripeResponse;
    if (!result.ok) return result;

    const data = Array.isArray(result.body.data) ? result.body.data : [];
    payouts.push(...data);
    startingAfter = data.length ? data[data.length - 1].id : '';
    pages += 1;

    if (!result.body.has_more || !startingAfter || payouts.length >= limit || pages >= 5) break;
  } while (true);

  return { ok: true, body: { data: payouts.slice(0, limit) } };
}

export async function listStripeBalanceTransactionsForPayout(
  env: Partial<Env> & StripeRequestEnv,
  stripeAccountId: string,
  payoutId: string,
  limit: number = 100
): Promise<ReconciliationStripeResponse> {
  const transactions: ReconciliationStripeRecord[] = [];
  let startingAfter = '';
  let pages = 0;
  let hasMore = false;

  do {
    const params = new URLSearchParams({
      payout: payoutId,
      limit: String(Math.min(100, Math.max(1, limit - transactions.length))),
    });
    params.append('expand[]', 'data.source');
    if (startingAfter) params.set('starting_after', startingAfter);

    const result = (await stripeGetConnectedRequest(
      env,
      `/v1/balance_transactions?${params.toString()}`,
      stripeAccountId
    )) as ReconciliationStripeResponse;
    if (!result.ok) return result;

    const data = Array.isArray(result.body.data) ? result.body.data : [];
    transactions.push(...data);
    startingAfter = data.length ? data[data.length - 1].id : '';
    pages += 1;
    hasMore = Boolean(result.body.has_more);

    if (!result.body.has_more || !startingAfter || transactions.length >= limit || pages >= 5) break;
  } while (true);

  return { ok: true, body: { data: transactions.slice(0, limit), truncated: hasMore || transactions.length > limit } };
}

export function reconciliationPeriod(
  value: string | null | undefined,
  now: Date = new Date(),
  timezone: string = 'UTC'
) {
  return fundReportPeriod({ month: value, now, timezone });
}

export async function listStripePayoutsForPeriod(
  env: Partial<Env> & StripeRequestEnv,
  stripeAccountId: string,
  period: FundReportPeriod,
  limit: number = 100
): Promise<ReconciliationStripeResponse> {
  const payouts: ReconciliationStripeRecord[] = [];
  let startingAfter = '';
  let pages = 0;
  let hasMore = false;
  // Stripe arrival_date is an expected calendar date, not a bank posting instant.
  const arrivalStart = Date.parse(period.startDate + 'T00:00:00Z') / 1000;
  const arrivalEnd = Date.parse(period.endDate + 'T00:00:00Z') / 1000;

  do {
    const params = new URLSearchParams({
      limit: String(Math.min(100, Math.max(1, limit - payouts.length))),
      'arrival_date[gte]': String(arrivalStart),
      'arrival_date[lt]': String(arrivalEnd),
    });
    if (startingAfter) params.set('starting_after', startingAfter);
    const result = (await stripeGetConnectedRequest(
      env,
      `/v1/payouts?${params.toString()}`,
      stripeAccountId
    )) as ReconciliationStripeResponse;
    if (!result.ok) return result;
    const data = Array.isArray(result.body.data) ? result.body.data : [];
    payouts.push(
      ...data.filter((payout) => {
        const bankDate = Number(payout.arrival_date || payout.created || 0);
        return bankDate >= arrivalStart && bankDate < arrivalEnd;
      })
    );
    startingAfter = data.length ? data[data.length - 1].id : '';
    pages += 1;
    hasMore = Boolean(result.body.has_more);
    if (!result.body.has_more || !startingAfter || payouts.length >= limit || pages >= 10) break;
  } while (true);

  return { ok: true, body: { data: payouts.slice(0, limit), truncated: hasMore || payouts.length > limit } };
}

export function buildFundTransferWorksheet(
  allocations: TransferAllocation[] = [],
  summary: { depositedCents?: number; readyForReview?: boolean } = {}
) {
  const depositedCents = Math.round(Number(summary.depositedCents || 0));
  const lines = (Array.isArray(allocations) ? allocations : []).map((item) => {
    const key =
      String(item?.key || '').trim() ||
      `allocation:${String(item?.label || 'giving')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')}`;
    const category = String(item?.category || 'Giving').trim() || 'Giving';
    const label = String(item?.label || 'General Giving').trim() || 'General Giving';
    const netCents = Math.round(Number(item?.netCents || 0));
    return {
      key,
      category,
      label,
      transactionCount: Math.max(0, Math.round(Number(item?.transactionCount || 0))),
      grossCents: Math.round(Number(item?.grossCents || 0)),
      feeCents: Math.round(Number(item?.feeCents || 0)),
      netCents,
      recommendedAction: 'retain',
      needsReview: netCents < 0,
    };
  });
  const allocatedNetCents = lines.reduce((sum, item) => sum + item.netCents, 0);
  const recommendedTransferCents = lines
    .filter((item) => item.recommendedAction === 'transfer' && item.netCents > 0)
    .reduce((sum, item) => sum + item.netCents, 0);
  const unallocatedCents = depositedCents - allocatedNetCents;
  return {
    available: lines.length > 0,
    lines,
    depositedCents,
    allocatedNetCents,
    recommendedTransferCents,
    retainInDepositAccountCents: depositedCents - recommendedTransferCents,
    unallocatedCents,
    readyToTransfer:
      summary.readyForReview === true &&
      lines.length > 0 &&
      unallocatedCents === 0 &&
      lines.every((item) => !item.needsReview),
    note: 'Net allocations describe paid Stripe payouts, not current fund balances or instructions to move money. Record any bank transfers separately.',
  };
}

export function normalizeFundTransferInstructions(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 100)
    .map((item) => {
      const action = item?.action === 'transfer' ? 'transfer' : 'retain';
      return {
        key: String(item?.key || '')
          .trim()
          .slice(0, 180),
        action,
        destination:
          action === 'transfer'
            ? String(item?.destination || '')
                .trim()
                .slice(0, 160)
            : '',
        completed: action === 'transfer' && Boolean(item?.completed),
        reference:
          action === 'transfer'
            ? String(item?.reference || '')
                .trim()
                .slice(0, 160)
            : '',
      };
    })
    .filter((item) => item.key);
}

export async function listRecentStripeBalanceTransactions(
  env: Partial<Env> & StripeRequestEnv,
  stripeAccountId: string,
  limit: number = 25
): Promise<ReconciliationStripeResponse> {
  const transactions: ReconciliationStripeRecord[] = [];
  let startingAfter = '';
  let pages = 0;

  do {
    const params = new URLSearchParams({
      limit: String(Math.min(100, Math.max(1, limit - transactions.length))),
    });
    if (startingAfter) params.set('starting_after', startingAfter);

    const result = (await stripeGetConnectedRequest(
      env,
      `/v1/balance_transactions?${params.toString()}`,
      stripeAccountId
    )) as ReconciliationStripeResponse;
    if (!result.ok) return result;

    const data = Array.isArray(result.body.data) ? result.body.data : [];
    transactions.push(...data);
    startingAfter = data.length ? data[data.length - 1].id : '';
    pages += 1;

    if (!result.body.has_more || !startingAfter || transactions.length >= limit || pages >= 5) break;
  } while (true);

  return { ok: true, body: { data: transactions.slice(0, limit) } };
}

export async function handleParishReconciliation(
  request: Request,
  env: Partial<Env> & StripeRequestEnv,
  parishId: string
) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'parish-reconciliation', { limit: 30, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const found = await findRegistrationByParishId<ReconciliationRegistration>(env, parishId);
  if (!found) return json({ error: 'Parish dashboard record not found' }, { status: 404 });
  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) return unauthorized();
  if (!givingFeatureAccess(found.registration, 'reconciliation')) {
    return json({ error: 'Reconciliation access is unavailable.' }, { status: 403 });
  }

  return buildReconciliationReport(env, parishId, found.registration, new URL(request.url).searchParams);
}

export async function buildReconciliationReport(
  env: Partial<Env> & StripeRequestEnv,
  parishId: string,
  registration: ReconciliationRegistration,
  params: URLSearchParams
) {
  try {
    return await prepareReconciliationReport(env, parishId, registration, params);
  } catch {
    return json(
      { error: 'The report could not be verified. Retry when Stripe and giving records are available.' },
      { status: 503 }
    );
  }
}

export async function handleParishReconciliationClose(
  request: Request,
  env: Partial<Env> & StripeRequestEnv,
  parishId: string
) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'parish-reconciliation-close', { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const found = await findRegistrationByParishId<ReconciliationRegistration>(env, parishId);
  if (!found) return json({ error: 'Parish dashboard record not found' }, { status: 404 });
  const token = getBearerToken(request);
  const session = await resolveParishDashboardSession(found.registration, token);
  if (!session) return unauthorized();
  if (!givingFeatureAccess(found.registration, 'reconciliation')) {
    return json({ error: 'Reconciliation access is unavailable.' }, { status: 403 });
  }

  let body: {
    month?: string;
    closed?: boolean;
    bankStatementCents: number;
    bankConfirmed?: boolean;
    expectedReviewVersion?: string;
    notes?: string;
    fingerprint?: string;
    transferInstructions?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return json({ error: 'Expected a review object.' }, { status: 400 });
  let period;
  try {
    period = reconciliationPeriod(body.month, new Date(), parishReportingTimezone(found.registration));
  } catch (error) {
    return json({ error: (error as Error).message }, { status: 422 });
  }
  const closed = body.closed !== false;
  const bankStatementCents = body.bankStatementCents;
  if (closed && (body.bankConfirmed !== true || !Number.isSafeInteger(bankStatementCents) || bankStatementCents < 0))
    return json({ error: 'Enter and confirm the Stripe deposit total from your bank statement.' }, { status: 400 });
  if (!d1(env)) return json({ error: 'Saving a reviewed report requires the giving database.' }, { status: 503 });
  const previous = await reconciliationCloseRecord(env, parishId, period.month);
  const previousVersion = previous?.reviewId || previous?.updatedAt || null;
  if ((body.expectedReviewVersion || null) !== previousVersion)
    return json({ error: 'Another review changed this month. Refresh before saving.' }, { status: 409 });
  if (closed && previous?.status === 'closed')
    return json({ error: 'Reopen the existing review with a reason before saving a replacement.' }, { status: 409 });
  if (!closed && previous?.status !== 'closed')
    return json({ error: 'Only a closed review can be reopened.' }, { status: 409 });
  const notes = String(body.notes || '')
    .trim()
    .slice(0, 2000);
  if (!closed && !notes) return json({ error: 'Add a reason before reopening this review.' }, { status: 400 });
  let report: ReconciliationReport | null = null;
  if (closed) {
    const response = await buildReconciliationReport(
      env,
      parishId,
      found.registration,
      new URLSearchParams({ month: period.month!, detail: 'full' })
    );
    if (!response.ok) return response;
    report = (await response.json()) as ReconciliationReport;
    if (!report.summary?.readyForReview || !report.complete)
      return json(
        { error: 'Resolve incomplete matching, pending payouts, and review items before finalizing.' },
        { status: 409 }
      );
    if (!body.fingerprint || body.fingerprint !== report.fingerprint)
      return json(
        { error: 'The report changed. Refresh and review the latest amounts before saving.' },
        { status: 409 }
      );
    if (bankStatementCents !== report.summary.depositedCents)
      return json(
        {
          error:
            'The bank total differs from Stripe. Review payout amounts and posting dates; notes cannot mark a difference reconciled.',
        },
        { status: 409 }
      );
  }
  const now = new Date().toISOString();
  const record = {
    parishId,
    month: period.month,
    reviewId: crypto.randomUUID(),
    previousReviewId: previousVersion,
    status: closed ? 'closed' : 'open',
    bankStatementCents: closed ? bankStatementCents : (previous?.bankStatementCents ?? null),
    bankConfirmed: closed,
    expectedDepositCents: report?.summary.depositedCents ?? previous?.expectedDepositCents ?? null,
    differenceCents: closed ? 0 : (previous?.differenceCents ?? null),
    fingerprint: report?.fingerprint || previous?.fingerprint || '',
    notes,
    transferInstructions: normalizeFundTransferInstructions(body.transferInstructions),
    closedAt: closed ? now : '',
    updatedAt: now,
    reviewedVia: 'authenticated_parish_dashboard',
    reviewedSessionId: session.id,
  };
  const key = `reconciliation-close:${parishId}:${period.month}`;
  const previousRaw = previous ? JSON.stringify(previous) : null;
  const snapshot = JSON.stringify({ record, report });
  // Keep headroom under D1's row-size limit; never save a close without its audit snapshot.
  if (new TextEncoder().encode(snapshot).byteLength > 1_800_000)
    return json(
      {
        error:
          'This report is too large to archive safely. Export the draft and contact support; the month has not been marked reconciled.',
      },
      { status: 413 }
    );
  // D1 executes this batch atomically. A losing reviewer writes neither a
  // snapshot nor the current pointer, so history never includes unsaved attempts.
  const results = await d1(env)!.batch([
    d1(env)!
      .prepare(
        'INSERT INTO app_settings (key,value,updated_at) SELECT ?1,?2,?3 WHERE ' +
          '(?4 IS NULL AND NOT EXISTS(SELECT 1 FROM app_settings WHERE key=?5)) OR EXISTS(SELECT 1 FROM app_settings WHERE key=?5 AND value=?4)'
      )
      .bind(`${key}:revision:${record.reviewId}`, snapshot, now, previousRaw, key),
    d1(env)!
      .prepare(
        'INSERT INTO app_settings (key,value,updated_at) SELECT ?1,?2,?3 WHERE ?4 IS NULL OR EXISTS(SELECT 1 FROM app_settings WHERE key=?1 AND value=?4) ' +
          'ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at WHERE app_settings.value=?4'
      )
      .bind(key, JSON.stringify(record), now, previousRaw),
  ]);
  const result = results[1];
  if (!result.meta?.changes)
    return json({ error: 'Another reviewer saved changes. Refresh before trying again.' }, { status: 409 });
  return json({ ok: true, record });
}
