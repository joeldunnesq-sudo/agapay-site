import { json } from '../lib/core.js';
import { authorize } from '../lib/authorization.js';
import { requireAccountingStaffProfile } from '../lib/accounting-staff.js';
import { accountingEnabledFor, accountingTierFor } from '../lib/entitlements.js';
import { findRegistrationByParishId } from './parish.js';
import {
  createD1DatabaseFacade,
  createJournalDraft,
  detectAccountingEnvironment,
  getJournalEntry,
  initializeLedger,
  ledgerInitializationStatus,
  ledgerRegister,
  ledgerRegisterCsv,
  loadAccountingDatabaseForEntity,
  loadAccountingDatabaseProviderRecord,
  loadAccountingEntityByParish,
  postJournalEntry,
  postOpeningBalanceBatch,
  printableLedger,
  recordInKindGift,
  recordSimpleDeposit,
  recordSplitDeposit,
  resolveCloudflareD1Adapter,
  reverseJournalEntry,
  searchJournalEntries,
  updateJournalDraft,
  validateJournalEntryForPosting,
  validateLedgerFoundation,
  voidJournalDraft,
} from '../accounting/index.js';
const HEADERS = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow', Vary: 'Authorization' };
const reply = (payload, status = 200) => json(payload, { status, headers: HEADERS });
export async function resolveAccountingDatabaseForParish(env, parishId) {
  const environment = detectAccountingEnvironment(env),
    registration = (await findRegistrationByParishId(env, parishId))?.registration || null,
    entity = await loadAccountingEntityByParish(env, parishId),
    registry = entity && (await loadAccountingDatabaseForEntity(env, entity.id, environment));
  if (
    !accountingEnabledFor(registration) ||
    !entity ||
    !registry ||
    entity.entityStatus !== 'ready' ||
    entity.activationStatus !== 'active' ||
    registry.provisioningStatus !== 'ready' ||
    registry.healthStatus !== 'healthy'
  )
    return { registration, entity, registry, db: null };
  const provider = await loadAccountingDatabaseProviderRecord(env, entity.id, environment);
  if (!provider) return { registration, entity, registry, provider: null, db: null };
  const adapter = await resolveCloudflareD1Adapter(env, provider.databaseIdentifier),
    physical = await adapter.findByName(provider.databaseIdentifier);
  return {
    registration,
    entity,
    registry,
    provider,
    physical,
    db: physical ? createD1DatabaseFacade(adapter, physical.providerId) : null,
  };
}
export async function accountingContext(request, env, parishId, capability) {
  const auth =
    (await authorize(request, env, { parishId, capability })) ||
    (await requireAccountingStaffProfile(request, env, parishId, capability));
  if (!auth) return null;
  const resolved = await resolveAccountingDatabaseForParish(env, parishId),
    { registration, entity, registry, db } = resolved;
  if (!accountingEnabledFor(registration))
    return { error: reply({ error: 'Accounting is not included in this subscription.' }, 403) };
  if (
    !entity ||
    entity.entityStatus !== 'ready' ||
    entity.activationStatus !== 'active' ||
    registry?.provisioningStatus !== 'ready' ||
    registry?.healthStatus !== 'healthy'
  )
    return {
      error: reply(
        {
          error:
            'Accounting is included, but its books are not ready or did not pass their safety checks. Contact AGAPAY support to complete setup.',
          accounting: { status: entity ? 'unavailable' : 'setup_required', ready: false },
        },
        409
      ),
    };
  if (!db) return { error: reply({ error: 'Accounting database is unavailable.' }, 503) };
  return {
    db,
    entityId: entity.id,
    registration,
    actor: { id: auth.user.id, type: auth.actorType || 'platform_user', capabilities: auth.capabilities || [] },
    tier: accountingTierFor(registration),
    databaseStatus: registry.provisioningStatus,
    databaseHealth: registry.healthStatus,
  };
}
export async function handleAccountingLedger(request, env, parishId) {
  const url = new URL(request.url),
    base = `/api/parish/dashboard/${encodeURIComponent(parishId)}/accounting`,
    path = url.pathname.slice(base.length),
    match = path.match(/^\/journals(?:\/([^/]+))?(?:\/([^/]+))?$/);
  if (!url.pathname.startsWith(base)) return null;
  let capability = request.method === 'GET' ? 'accounting.view' : 'accounting.journals.create';
  if (match?.[2] === 'post') capability = 'accounting.journals.post';
  if (match?.[2] === 'reverse') capability = 'accounting.journals.reverse';
  if (path === '/ledger/opening-balances') capability = 'accounting.opening_balances.manage';
  if (path === '/ledger/initialize') capability = 'accounting.configure';
  try {
    const ctx = await accountingContext(request, env, parishId, capability);
    if (!ctx) return reply({ error: 'Unauthorized' }, 401);
    if (ctx.error) return ctx.error;
    const data = await request.json().catch(() => ({}));
    if (request.method === 'POST' && path === '/simple/deposits')
      return reply({ ok: true, entry: await recordSimpleDeposit(ctx.db, { actor: ctx.actor, ...data }) }, 201);
    if (request.method === 'POST' && path === '/simple/split-deposits')
      return reply({ ok: true, entry: await recordSplitDeposit(ctx.db, { actor: ctx.actor, ...data }) }, 201);
    if (request.method === 'POST' && path === '/simple/in-kind-gifts')
      return reply({ ok: true, entry: await recordInKindGift(ctx.db, { actor: ctx.actor, ...data }) }, 201);
    if (match) {
      const id = match[1] ? decodeURIComponent(match[1]) : '',
        action = match[2] || '';
      if (request.method === 'GET' && !id)
        return reply({
          ok: true,
          tier: ctx.tier,
          entries: await searchJournalEntries(ctx.db, {
            actor: ctx.actor,
            query: url.searchParams.get('q') || '',
            status: url.searchParams.get('status') || '',
            sourceType: url.searchParams.get('sourceType') || '',
            dateFrom: url.searchParams.get('from') || '',
            dateTo: url.searchParams.get('to') || '',
            limit: url.searchParams.get('limit') || 50,
            offset: url.searchParams.get('offset') || 0,
          }),
        });
      if (request.method === 'POST' && !id)
        return reply({ ok: true, entry: await createJournalDraft(ctx.db, { actor: ctx.actor, ...data }) }, 201);
      if (request.method === 'GET' && id && !action)
        return reply({ ok: true, entry: await getJournalEntry(ctx.db, { actor: ctx.actor, journalEntryId: id }) });
      if (request.method === 'PATCH' && id)
        return reply({
          ok: true,
          entry: await updateJournalDraft(ctx.db, { actor: ctx.actor, journalEntryId: id, ...data }),
        });
      if (request.method === 'POST' && action === 'validate')
        return reply({
          ok: true,
          validation: await validateJournalEntryForPosting(ctx.db, {
            journalEntryId: id,
            expectedVersion: data.expectedVersion,
          }),
        });
      if (request.method === 'POST' && action === 'post')
        return reply({
          ok: true,
          entry: await postJournalEntry(ctx.db, { actor: ctx.actor, journalEntryId: id, ...data }),
        });
      if (request.method === 'POST' && action === 'reverse')
        return reply({
          ok: true,
          entry: await reverseJournalEntry(ctx.db, {
            actor: ctx.actor,
            journalEntryId: id,
            entryDate: data.entryDate,
            reason: data.reason,
            idempotencyKey: data.idempotencyKey,
            requestHash: data.requestHash || data.idempotencyKey,
            correlationId: data.correlationId,
          }),
        });
      if (request.method === 'POST' && action === 'void')
        return reply({
          ok: true,
          entry: await voidJournalDraft(ctx.db, {
            actor: ctx.actor,
            journalEntryId: id,
            reason: data.reason,
            correlationId: data.correlationId,
          }),
        });
    }
    if (request.method === 'POST' && path === '/ledger/opening-balances')
      return reply(
        {
          ok: true,
          entry: await postOpeningBalanceBatch(ctx.db, {
            actor: ctx.actor,
            effectiveDate: data.effectiveDate,
            description: data.description,
            lines: data.lines,
            idempotencyKey: data.idempotencyKey,
            requestHash: data.requestHash || data.idempotencyKey,
            correlationId: data.correlationId,
          }),
        },
        201
      );
    if (request.method === 'POST' && path === '/ledger/initialize')
      return reply({
        ok: true,
        initialization: await initializeLedger(ctx.db, {
          actor: ctx.actor,
          date: data.date,
          correlationId: data.correlationId,
        }),
      });
    if (request.method === 'GET' && path === '/ledger/status')
      return reply({ ok: true, status: await ledgerInitializationStatus(ctx.db) });
    if (request.method === 'GET' && path === '/ledger/validate')
      return reply({ ok: true, validation: await validateLedgerFoundation(ctx.db) });
    const reg = path.match(/^\/(general-ledger|account-registers|fund-registers)(?:\/([^/]+))?$/);
    if (request.method === 'GET' && reg) {
      const rows = await ledgerRegister(ctx.db, {
        actor: ctx.actor,
        accountId: reg[1] === 'account-registers' ? decodeURIComponent(reg[2] || '') : '',
        fundId: reg[1] === 'fund-registers' ? decodeURIComponent(reg[2] || '') : '',
        dateFrom: url.searchParams.get('from') || '',
        dateTo: url.searchParams.get('to') || '',
      });
      return reply({ ok: true, rows });
    }
    const exp = path.match(/^\/exports\/(general-ledger|accounts|funds)(?:\/([^/]+))?\.csv$/);
    if (request.method === 'GET' && exp) {
      const rows = await ledgerRegister(ctx.db, {
        actor: ctx.actor,
        accountId: exp[1] === 'accounts' ? decodeURIComponent(exp[2] || '') : '',
        fundId: exp[1] === 'funds' ? decodeURIComponent(exp[2] || '') : '',
      });
      return new Response(ledgerRegisterCsv(rows), {
        headers: {
          ...HEADERS,
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename=agapay-ledger.csv',
        },
      });
    }
    if (request.method === 'GET' && path === '/print/general-ledger') {
      const rows = await ledgerRegister(ctx.db, { actor: ctx.actor });
      return new Response(printableLedger(rows), {
        headers: { ...HEADERS, 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
    return reply({ error: 'Not found' }, 404);
  } catch (error) {
    return reply(
      {
        error: error?.details?.conflict ? 'conflict' : 'accounting_request_failed',
        message: error?.message || 'Accounting request failed.',
      },
      error?.details?.conflict ? 409 : 400
    );
  }
}
