// Generated from src/handlers/accounting-readiness.ts by npm run build:server. Do not edit.
import { json } from '../lib/core.js';
import { accountingContext } from './accounting-ledger.js';
import {
  listDimensions,
  saveDimension,
  dimensionTransactions,
  classifyJournalLine,
} from '../accounting/dimensions/service.js';
import { dimensionBudget, allocateDimensionBudget, dimensionReport } from '../accounting/dimensions/reporting.js';
import {
  listReportPackages,
  saveReportPackage,
  generateReportPackage,
  getReportPackageRun,
} from '../accounting/report-packages/service.js';
const headers = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow', Vary: 'Authorization' };
const reply = (data, status = 200) => json(data, { status, headers });
async function handleAccountingReadiness(request, env, parishId) {
  const url = new URL(request.url),
    base = `/api/parish/dashboard/${encodeURIComponent(parishId)}/accounting`,
    path = url.pathname.slice(base.length);
  if (!['/dimensions', '/report-packages'].some((prefix) => path === prefix || path.startsWith(prefix + '/')))
    return null;
  try {
    const ctx = await accountingContext(
      request,
      env,
      parishId,
      request.method === 'GET' || path.endsWith('/generate') ? 'accounting.view' : 'accounting.configure'
    );
    if (!ctx) return reply({ error: 'Unauthorized' }, 401);
    if (ctx.error) return ctx.error;
    const { db, actor, tier } = ctx;
    if (request.method === 'GET' && path === '/dimensions')
      return reply({ ok: true, dimensions: await listDimensions(db, actor) });
    if (request.method === 'POST' && path === '/dimensions') {
      const b = await request.json();
      return reply({
        ok: true,
        dimension: await saveDimension(db, actor, {
          id: b.id,
          kind: b.kind,
          code: b.code,
          name: b.name,
          active: b.active,
          expectedVersion: b.expectedVersion,
        }),
      });
    }
    const from = url.searchParams.get('from') || '',
      to = url.searchParams.get('to') || '';
    if (request.method === 'GET' && path === '/dimensions/transactions')
      return reply({
        ok: true,
        ...(await dimensionTransactions(db, actor, from, to, url.searchParams.get('q') || '', {
          departmentId: url.searchParams.get('departmentId') || void 0,
          projectId: url.searchParams.get('projectId') || void 0,
          accountId: url.searchParams.get('accountId') || void 0,
          fundId: url.searchParams.get('fundId') || void 0,
        })),
      });
    if (request.method === 'GET' && path === '/dimensions/report')
      return reply({
        ok: true,
        ...(await dimensionReport(db, actor, tier, {
          from,
          to,
          budgetId: url.searchParams.get('budgetId') || void 0,
          groupBy: url.searchParams.get('groupBy') || void 0,
          fundId: url.searchParams.get('fundId') || void 0,
        })),
      });
    const line = path.match(/^\/dimensions\/transactions\/([^/]+)$/);
    if (request.method === 'PATCH' && line) {
      const b = await request.json();
      return reply({
        ok: true,
        classification: await classifyJournalLine(db, actor, decodeURIComponent(line[1]), {
          expectedVersion: b.expectedVersion,
          departmentId: b.departmentId,
          projectId: b.projectId,
          reason: b.reason,
        }),
      });
    }
    const budget = path.match(/^\/dimensions\/budgets\/([^/]+)(?:\/lines\/([^/]+))?$/);
    if (budget) {
      if (request.method === 'GET' && !budget[2])
        return reply({ ok: true, ...(await dimensionBudget(db, actor, tier, decodeURIComponent(budget[1]))) });
      if (request.method === 'POST' && budget[2]) {
        const b = await request.json();
        return reply({
          ok: true,
          ...(await allocateDimensionBudget(
            db,
            actor,
            tier,
            decodeURIComponent(budget[1]),
            decodeURIComponent(budget[2]),
            {
              expectedVersion: b.expectedVersion,
              allocations: b.allocations?.map((v) => ({
                departmentId: v.departmentId,
                projectId: v.projectId,
                basisPoints: v.basisPoints,
              })),
            }
          )),
        });
      }
    }
    if (request.method === 'GET' && path === '/report-packages')
      return reply({ ok: true, ...(await listReportPackages(db, actor)) });
    if (request.method === 'POST' && path === '/report-packages') {
      const b = await request.json();
      return reply({
        ok: true,
        package: await saveReportPackage(db, actor, {
          id: b.id,
          name: b.name,
          reportIds: b.reportIds,
          expectedVersion: b.expectedVersion,
          active: b.active,
        }),
      });
    }
    const generate = path.match(/^\/report-packages\/([^/]+)\/generate$/);
    if (request.method === 'POST' && generate) {
      const b = await request.json();
      return reply({
        ok: true,
        ...(await generateReportPackage(db, actor, tier, decodeURIComponent(generate[1]), {
          from: b.from,
          to: b.to,
          budgetId: b.budgetId,
          operationKey: b.operationKey,
        })),
      });
    }
    const run = path.match(/^\/report-packages\/runs\/([^/]+)$/);
    if (request.method === 'GET' && run)
      return reply({ ok: true, ...(await getReportPackageRun(db, actor, decodeURIComponent(run[1]), tier)) });
    return reply({ error: 'Report workspace route not found' }, 404);
  } catch (error) {
    const e = error;
    return reply(
      { error: e.status ? e.message : 'Unable to complete the report workspace request. Reload before retrying.' },
      e.status || 409
    );
  }
}
export { handleAccountingReadiness };
