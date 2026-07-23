import { json } from "../lib/core.js";
import { fundActivity, getAccountingSettings, getAccountingSetupOverview, initializeAccountingSetup, reportCsv, statementOfActivities, statementOfFinancialPosition, trialBalance, updateAccountingSettings } from "../accounting/index.js";
import { accountingContext } from "./accounting-ledger.js";

const HEADERS = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", Vary: "Authorization" };
const reply = (payload, status = 200) => json(payload, { status, headers: HEADERS });
const today = () => new Date().toISOString().slice(0, 10);
const yearStart = () => `${new Date().getUTCFullYear()}-01-01`;
const results = async (db, sql) => (await db.prepare(sql).all()).results || [];
const FUND_RESTRICTIONS = new Set(["unrestricted", "board_designated", "donor_restricted_temporary", "donor_restricted_permanent"]);
const clean = (value) => String(value || "").trim();

async function listFunds(db) {
  return results(db, `SELECT id,code,name,description,restriction_type restrictionType,purpose,
    is_default isDefault,is_active isActive,is_system isSystem,version,
    CASE WHEN description LIKE 'Synced from AGAPAY %' THEN 1 ELSE 0 END isGivingSynced
    FROM accounting_funds ORDER BY is_active DESC,is_default DESC,code`);
}

async function workspaceReference(db) {
  const [accounts, funds] = await Promise.all([
    results(db, `SELECT a.id,a.account_number accountNumber,a.name,a.description,a.normal_balance normalBalance,
      a.parent_account_id parentAccountId,
      a.is_system isSystem,a.version,t.category,p.expense_group expenseGroup,p.default_fund_id defaultFundId
      FROM accounting_accounts a JOIN accounting_account_types t ON t.id=a.account_type_id
      LEFT JOIN accounting_account_presentations p ON p.account_id=a.id
      WHERE a.is_active=1 AND a.is_posting_account=1 AND a.archived_at IS NULL ORDER BY a.account_number`),
    results(db, "SELECT id,code,name,restriction_type restrictionType,is_default isDefault FROM accounting_funds WHERE is_active=1 AND archived_at IS NULL ORDER BY is_default DESC,code")
  ]);
  return { accounts, funds };
}

function reportRequest(path, url, db, actor) {
  const startDate = url.searchParams.get("from") || yearStart();
  const endDate = url.searchParams.get("to") || today();
  const fundId = url.searchParams.get("fundId") || "";
  if (path === "/reports/trial-balance") return trialBalance(db, { actor, startDate, endDate, fundId, includeZero: url.searchParams.get("includeZero") === "true" });
  if (path === "/reports/statement-of-activities") return statementOfActivities(db, { actor, startDate, endDate, fundId });
  if (path === "/reports/statement-of-financial-position") return statementOfFinancialPosition(db, { actor, asOfDate: url.searchParams.get("asOf") || endDate, fundId });
  if (path === "/reports/fund-activity") return fundActivity(db, { actor, startDate, endDate });
  return null;
}

export async function handleAccountingSetupReports(request, env, parishId) {
  const url = new URL(request.url);
  const base = `/api/parish/dashboard/${encodeURIComponent(parishId)}/accounting`;
  if (!url.pathname.startsWith(base)) return null;
  let path = url.pathname.slice(base.length);
  const csv = path.endsWith(".csv");
  if (csv) path = path.slice(0, -4);
  const fundMatch = path.match(/^\/funds(?:\/([^/]+))?$/);
  const accountMatch = path.match(/^\/accounts(?:\/([^/]+))?$/);
  const supported = path === "/setup" || path === "/setup/initialize" || path === "/settings" || path === "/workspace-reference" || fundMatch || accountMatch || path.startsWith("/reports/");
  if (!supported) return null;
  const capability = fundMatch && request.method !== "GET" ? "accounting.funds.manage" : accountMatch && request.method !== "GET" ? "accounting.configure" : request.method === "GET" ? "accounting.view" : "accounting.configure";
  try {
    const ctx = await accountingContext(request, env, parishId, capability);
    if (!ctx) return reply({ error: "Unauthorized" }, 401);
    if (ctx.error) return ctx.error;
    if (request.method === "GET" && path === "/setup") return reply({ ok: true, tier: ctx.tier, overview: await getAccountingSetupOverview(ctx.db, { actor: ctx.actor, entitlementTier: ctx.tier, databaseStatus: ctx.databaseStatus, databaseHealth: ctx.databaseHealth }) });
    if (request.method === "POST" && path === "/setup/initialize") return reply({ ok: true, setup: await initializeAccountingSetup(ctx.db, { actor: ctx.actor }) }, 201);
    if (request.method === "GET" && path === "/settings") return reply({ ok: true, settings: await getAccountingSettings(ctx.db, { actor: ctx.actor }) });
    if (request.method === "GET" && path === "/workspace-reference") return reply({ ok: true, ...(await workspaceReference(ctx.db)) });
    if (request.method === "POST" && accountMatch && !accountMatch[1]) {
      const body = await request.json().catch(() => ({}));
      const accountNumber = clean(body.accountNumber).replace(/[^A-Za-z0-9._-]/g, "").slice(0, 24);
      const name = clean(body.name).slice(0, 120);
      const expenseGroup = clean(body.expenseGroup);
      const defaultFundId = clean(body.defaultFundId);
      const parentAccountId = clean(body.parentAccountId);
      if (!accountNumber || !name || !["administrative","other"].includes(expenseGroup) || !defaultFundId) return reply({ error:"invalid_account", message:"Account number, name, expense group, and default fund are required." }, 422);
      const fund = await ctx.db.prepare("SELECT id FROM accounting_funds WHERE id=? AND is_active=1 AND archived_at IS NULL").bind(defaultFundId).first();
      if (!fund) return reply({ error:"invalid_fund", message:"Choose an active default fund." }, 422);
      if (parentAccountId) {
        const parent = await ctx.db.prepare(`SELECT a.id FROM accounting_accounts a JOIN accounting_account_types t ON t.id=a.account_type_id
          WHERE a.id=? AND a.is_active=1 AND a.archived_at IS NULL AND t.category='expense'`).bind(parentAccountId).first();
        if (!parent) return reply({ error:"invalid_parent", message:"Choose an active expense account as the parent." }, 422);
      }
      const id = `acct_${crypto.randomUUID()}`;
      await ctx.db.batch([
        ctx.db.prepare(`INSERT INTO accounting_accounts
          (id,account_number,name,description,account_type_id,parent_account_id,normal_balance,is_posting_account,is_system,is_active,requires_fund,cash_flow_classification)
          VALUES(?,?,?,?,'type_expense',?,'debit',1,0,1,1,'operating')`)
          .bind(id, accountNumber, name, clean(body.description) || null, parentAccountId || null),
        ctx.db.prepare("INSERT INTO accounting_account_presentations(account_id,expense_group,default_fund_id) VALUES(?,?,?)")
          .bind(id, expenseGroup, defaultFundId)
      ]);
      return reply({ ok:true, account:(await workspaceReference(ctx.db)).accounts.find((account) => account.id === id) }, 201);
    }
    if (request.method === "PATCH" && accountMatch?.[1]) {
      const body = await request.json().catch(() => ({}));
      const id = decodeURIComponent(accountMatch[1]);
      const current = await ctx.db.prepare(`SELECT a.*,t.category FROM accounting_accounts a JOIN accounting_account_types t ON t.id=a.account_type_id WHERE a.id=?`).bind(id).first();
      if (!current || current.category !== "expense") return reply({ error:"not_found", message:"Expense account was not found." }, 404);
      if (Number(current.version) !== Number(body.expectedVersion)) return reply({ error:"conflict", message:"This account changed. Reload and try again." }, 409);
      const accountNumber = current.is_system ? current.account_number : clean(body.accountNumber ?? current.account_number).replace(/[^A-Za-z0-9._-]/g, "").slice(0, 24);
      const name = current.is_system ? current.name : clean(body.name ?? current.name).slice(0, 120);
      const expenseGroup = clean(body.expenseGroup);
      const defaultFundId = clean(body.defaultFundId);
      const parentAccountId = clean(body.parentAccountId);
      if (!accountNumber || !name || !["administrative","other"].includes(expenseGroup) || !defaultFundId) return reply({ error:"invalid_account", message:"Account number, name, expense group, and default fund are required." }, 422);
      const fund = await ctx.db.prepare("SELECT id FROM accounting_funds WHERE id=? AND is_active=1 AND archived_at IS NULL").bind(defaultFundId).first();
      if (!fund) return reply({ error:"invalid_fund", message:"Choose an active default fund." }, 422);
      if (parentAccountId === id) return reply({ error:"invalid_parent", message:"An account cannot be its own parent." }, 422);
      if (parentAccountId) {
        const parent = await ctx.db.prepare(`SELECT a.id,a.parent_account_id FROM accounting_accounts a JOIN accounting_account_types t ON t.id=a.account_type_id
          WHERE a.id=? AND a.is_active=1 AND a.archived_at IS NULL AND t.category='expense'`).bind(parentAccountId).first();
        if (!parent || parent.parent_account_id === id) return reply({ error:"invalid_parent", message:"Choose an expense account that does not create a circular hierarchy." }, 422);
      }
      await ctx.db.batch([
        ctx.db.prepare("UPDATE accounting_accounts SET account_number=?,name=?,description=?,parent_account_id=?,version=version+1,updated_at=datetime('now') WHERE id=? AND version=?")
          .bind(accountNumber, name, clean(body.description ?? current.description) || null, parentAccountId || null, id, Number(body.expectedVersion)),
        ctx.db.prepare(`INSERT INTO accounting_account_presentations(account_id,expense_group,default_fund_id)
          VALUES(?,?,?) ON CONFLICT(account_id) DO UPDATE SET expense_group=excluded.expense_group,
          default_fund_id=excluded.default_fund_id,updated_at=datetime('now')`).bind(id, expenseGroup, defaultFundId)
      ]);
      return reply({ ok:true, account:(await workspaceReference(ctx.db)).accounts.find((account) => account.id === id) });
    }
    if (request.method === "GET" && fundMatch && !fundMatch[1]) return reply({ ok: true, funds: await listFunds(ctx.db) });
    if (request.method === "POST" && fundMatch && !fundMatch[1]) {
      const body = await request.json().catch(() => ({}));
      const code = clean(body.code).toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 24);
      const name = clean(body.name).slice(0, 120);
      const restriction = clean(body.restrictionType) || "unrestricted";
      if (!code || !name || !FUND_RESTRICTIONS.has(restriction)) return reply({ error: "invalid_fund", message: "Fund account number, name, and a valid restriction are required." }, 422);
      const id = `fund_${crypto.randomUUID()}`;
      await ctx.db.prepare(`INSERT INTO accounting_funds
        (id,code,name,description,restriction_type,purpose,is_default,is_active,is_system)
        VALUES(?,?,?,?,?,?,0,1,0)`).bind(id, code, name, clean(body.description) || null, restriction, clean(body.purpose) || null).run();
      return reply({ ok: true, fund: (await listFunds(ctx.db)).find((fund) => fund.id === id) }, 201);
    }
    if (request.method === "PATCH" && fundMatch?.[1]) {
      const body = await request.json().catch(() => ({}));
      const id = decodeURIComponent(fundMatch[1]);
      const current = await ctx.db.prepare("SELECT * FROM accounting_funds WHERE id=?").bind(id).first();
      if (!current) return reply({ error: "not_found", message: "Fund was not found." }, 404);
      if (Number(current.version) !== Number(body.expectedVersion)) return reply({ error: "conflict", message: "This fund changed. Reload and try again." }, 409);
      const code = clean(body.code ?? current.code).toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 24);
      const name = clean(body.name ?? current.name).slice(0, 120);
      const restriction = clean(body.restrictionType ?? current.restriction_type);
      if (!code || !name || !FUND_RESTRICTIONS.has(restriction)) return reply({ error: "invalid_fund", message: "Fund account number, name, and a valid restriction are required." }, 422);
      await ctx.db.prepare(`UPDATE accounting_funds SET code=?,name=?,description=?,restriction_type=?,purpose=?,
        version=version+1,updated_at=datetime('now') WHERE id=? AND version=?`)
        .bind(code, name, clean(body.description ?? current.description) || null, restriction,
          clean(body.purpose ?? current.purpose) || null, id, Number(body.expectedVersion)).run();
      return reply({ ok: true, fund: (await listFunds(ctx.db)).find((fund) => fund.id === id) });
    }
    if (request.method === "PATCH" && path === "/settings") {
      const body = await request.json().catch(() => ({}));
      return reply({ ok: true, settings: await updateAccountingSettings(ctx.db, { actor: ctx.actor, expectedVersion: body.expectedVersion, patch: body.patch || {} }) });
    }
    if (request.method === "GET" && path.startsWith("/reports/")) {
      const report = await reportRequest(path, url, ctx.db, ctx.actor);
      if (!report) return reply({ error: "Not found" }, 404);
      if (csv) return new Response(reportCsv(report), { headers: { ...HEADERS, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename=agapay-${report.code}.csv` } });
      return reply({ ok: true, report });
    }
    return reply({ error: "Not found" }, 404);
  } catch (error) {
    return reply({ error: error?.details?.conflict ? "conflict" : "accounting_request_failed", message: error?.message || "Accounting request failed." }, error?.details?.conflict ? 409 : 400);
  }
}
