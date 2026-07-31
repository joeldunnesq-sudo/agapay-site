import { AccountingDatabaseError, ValidationError } from "../errors.js";
import { createBillDraft } from "./service.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const FREQUENCIES = new Set(["weekly", "biweekly", "monthly", "quarterly", "annual"]);
const id = (prefix) => `${prefix}_${crypto.randomUUID()}`;
const text = (value) => String(value ?? "").trim();
const first = (db, sql, ...params) => db.prepare(sql).bind(...params).first();
const all = async (db, sql, ...params) => (await db.prepare(sql).bind(...params).all()).results || [];
const run = (db, sql, ...params) => db.prepare(sql).bind(...params).run();

function requireCapability(actor, capability) {
  if (!actor?.id || !actor.capabilities?.includes(capability)) {
    throw new AccountingDatabaseError("Accounts Payable capability is required.", { details: { capability } });
  }
}
function requireParish(entitlementTier) {
  if (entitlementTier !== "parish") throw new AccountingDatabaseError("Recurring vendor bills are available with Parish Accounting.");
}
function dto(row) {
  return row && Object.freeze({
    id: row.id,
    vendorId: row.vendor_id,
    vendorName: row.vendor_name || "",
    name: row.name,
    description: row.description,
    accountId: row.account_id,
    accountName: row.account_name || "",
    fundId: row.fund_id,
    fundName: row.fund_name || "",
    amount: Number(row.amount),
    frequency: row.frequency,
    nextBillDate: row.next_bill_date,
    endDate: row.end_date || "",
    status: row.status,
    lastCreatedDate: row.last_created_date || "",
    lastError: row.last_error || "",
    version: Number(row.version)
  });
}
const SELECT = `SELECT s.*,v.display_name vendor_name,
  a.account_number||' · '||a.name account_name,f.code||' · '||f.name fund_name
  FROM accounting_recurring_bill_schedules s
  JOIN accounting_vendors v ON v.id=s.vendor_id
  JOIN accounting_accounts a ON a.id=s.account_id
  JOIN accounting_funds f ON f.id=s.fund_id`;

function values(input = {}) {
  const result = {
    vendorId: text(input.vendorId),
    name: text(input.name).slice(0, 120),
    description: text(input.description).slice(0, 240),
    accountId: text(input.accountId),
    fundId: text(input.fundId),
    amount: Number(input.amount),
    frequency: text(input.frequency),
    nextBillDate: text(input.nextBillDate),
    endDate: text(input.endDate)
  };
  if (!result.vendorId || !result.name || !result.description || !result.accountId || !result.fundId
    || !Number.isSafeInteger(result.amount) || result.amount <= 0 || !FREQUENCIES.has(result.frequency)
    || !DATE.test(result.nextBillDate) || (result.endDate && !DATE.test(result.endDate))) {
    throw new ValidationError("Vendor, name, description, account, fund, positive amount, frequency, and next bill date are required.");
  }
  if (result.endDate && result.endDate < result.nextBillDate) throw new ValidationError("The end date cannot be before the next bill date.");
  return result;
}
async function validateReferences(db, value) {
  const vendor = await first(db, "SELECT id FROM accounting_vendors WHERE id=? AND status='active'", value.vendorId);
  const account = await first(db, `SELECT a.id FROM accounting_accounts a
    JOIN accounting_account_types t ON t.id=a.account_type_id
    WHERE a.id=? AND a.is_active=1 AND a.archived_at IS NULL
      AND a.is_posting_account=1 AND t.category IN('expense','asset')`, value.accountId);
  const fund = await first(db, "SELECT id FROM accounting_funds WHERE id=? AND is_active=1 AND archived_at IS NULL", value.fundId);
  if (!vendor || !account || !fund) throw new ValidationError("Choose an active vendor, expense account, and fund.");
}
function advance(date, frequency) {
  const current = new Date(`${date}T00:00:00Z`);
  if (frequency === "weekly" || frequency === "biweekly") {
    current.setUTCDate(current.getUTCDate() + (frequency === "weekly" ? 7 : 14));
    return current.toISOString().slice(0, 10);
  }
  const months = { monthly: 1, quarterly: 3, annual: 12 }[frequency];
  const day = current.getUTCDate();
  const target = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return target.toISOString().slice(0, 10);
}

export async function listRecurringBillSchedules(db, { actor, entitlementTier }) {
  requireCapability(actor, "ap.view");
  requireParish(entitlementTier);
  return Object.freeze((await all(db, `${SELECT}
    ORDER BY CASE s.status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END,s.next_bill_date,s.name`)).map(dto));
}

export async function createRecurringBillSchedule(db, { actor, entitlementTier, input }) {
  requireCapability(actor, "ap.enter");
  requireParish(entitlementTier);
  const value = values(input);
  await validateReferences(db, value);
  const scheduleId = id("recurring_bill");
  await run(db, `INSERT INTO accounting_recurring_bill_schedules
    (id,vendor_id,name,description,account_id,fund_id,amount,frequency,next_bill_date,end_date,created_by_actor_id)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
  scheduleId, value.vendorId, value.name, value.description, value.accountId, value.fundId,
  value.amount, value.frequency, value.nextBillDate, value.endDate || null, actor.id);
  return dto(await first(db, `${SELECT} WHERE s.id=?`, scheduleId));
}

export async function updateRecurringBillSchedule(db, { actor, entitlementTier, scheduleId, expectedVersion, patch = {} }) {
  requireCapability(actor, "ap.enter");
  requireParish(entitlementTier);
  const current = await first(db, "SELECT * FROM accounting_recurring_bill_schedules WHERE id=?", scheduleId);
  if (!current || Number(current.version) !== Number(expectedVersion)) {
    throw new AccountingDatabaseError("Recurring bill changed. Reload and try again.", { details: { conflict: true } });
  }
  const status = text(patch.status ?? current.status);
  if (!["active", "paused", "completed"].includes(status)) throw new ValidationError("Recurring bill status is invalid.");
  const value = values({
    vendorId: patch.vendorId ?? current.vendor_id,
    name: patch.name ?? current.name,
    description: patch.description ?? current.description,
    accountId: patch.accountId ?? current.account_id,
    fundId: patch.fundId ?? current.fund_id,
    amount: patch.amount ?? current.amount,
    frequency: patch.frequency ?? current.frequency,
    nextBillDate: patch.nextBillDate ?? current.next_bill_date,
    endDate: patch.endDate ?? current.end_date
  });
  await validateReferences(db, value);
  const result = await run(db, `UPDATE accounting_recurring_bill_schedules SET
    vendor_id=?,name=?,description=?,account_id=?,fund_id=?,amount=?,frequency=?,
    next_bill_date=?,end_date=?,status=?,last_error=NULL,version=version+1,updated_at=datetime('now')
    WHERE id=? AND version=?`,
  value.vendorId, value.name, value.description, value.accountId, value.fundId, value.amount,
  value.frequency, value.nextBillDate, value.endDate || null, status, scheduleId, Number(expectedVersion));
  if (!result.meta?.changes) throw new AccountingDatabaseError("Recurring bill changed. Reload and try again.", { details: { conflict: true } });
  return dto(await first(db, `${SELECT} WHERE s.id=?`, scheduleId));
}

export async function processDueRecurringBills(db, { asOfDate, actor, entitlementTier = "parish", maxBills = 100 }) {
  requireCapability(actor, "ap.enter");
  requireParish(entitlementTier);
  if (!DATE.test(asOfDate)) throw new ValidationError("A valid recurring-bill processing date is required.");
  const due = await all(db, `SELECT * FROM accounting_recurring_bill_schedules
    WHERE status='active' AND next_bill_date<=? ORDER BY next_bill_date,id LIMIT ?`,
  asOfDate, Math.max(1, Math.min(500, Number(maxBills) || 100)));
  const results = [];
  for (const schedule of due) {
    const scheduledDate = schedule.next_bill_date;
    const prior = await first(db, `SELECT * FROM accounting_recurring_bill_executions
      WHERE schedule_id=? AND scheduled_date=?`, schedule.id, scheduledDate);
    if (prior?.status === "created") {
      const next = advance(scheduledDate, schedule.frequency);
      await run(db, `UPDATE accounting_recurring_bill_schedules SET next_bill_date=?,
        status=CASE WHEN end_date IS NOT NULL AND end_date<? THEN 'completed' ELSE status END,
        updated_at=datetime('now') WHERE id=?`, next, next, schedule.id);
      continue;
    }
    try {
      const bill = await createBillDraft(db, {
        actor,
        entitlementTier,
        input: {
          vendorId: schedule.vendor_id,
          billDate: scheduledDate,
          description: schedule.description,
          correlationId: `recurring-bill:${schedule.id}:${scheduledDate}`,
          lines: [{
            description: schedule.description,
            accountId: schedule.account_id,
            fundId: schedule.fund_id,
            quantity: 1,
            unitAmount: Number(schedule.amount)
          }]
        }
      });
      if (prior) {
        await run(db, `UPDATE accounting_recurring_bill_executions
          SET bill_id=?,status='created',error_message=NULL WHERE id=?`, bill.id, prior.id);
      } else {
        await run(db, `INSERT INTO accounting_recurring_bill_executions
          (id,schedule_id,scheduled_date,bill_id,status) VALUES(?,?,?,?,'created')`,
        id("recurring_bill_run"), schedule.id, scheduledDate, bill.id);
      }
      const next = advance(scheduledDate, schedule.frequency);
      const completed = Boolean(schedule.end_date && next > schedule.end_date);
      await run(db, `UPDATE accounting_recurring_bill_schedules SET next_bill_date=?,
        last_created_date=?,last_error=NULL,status=?,version=version+1,updated_at=datetime('now')
        WHERE id=?`, next, scheduledDate, completed ? "completed" : "active", schedule.id);
      results.push({ id: schedule.id, scheduledDate, status: "created", billId: bill.id });
    } catch (error) {
      const message = text(error?.message || error).slice(0, 500);
      if (prior) {
        await run(db, `UPDATE accounting_recurring_bill_executions
          SET status='failed',error_message=? WHERE id=?`, message, prior.id);
      } else {
        await run(db, `INSERT INTO accounting_recurring_bill_executions
          (id,schedule_id,scheduled_date,status,error_message) VALUES(?,?,?,'failed',?)`,
        id("recurring_bill_run"), schedule.id, scheduledDate, message);
      }
      await run(db, `UPDATE accounting_recurring_bill_schedules SET last_error=?,
        updated_at=datetime('now') WHERE id=?`, message, schedule.id);
      results.push({ id: schedule.id, scheduledDate, status: "failed", error: message });
    }
  }
  return Object.freeze(results);
}

