export const ACCOUNTING_DEMO_PARISH_ID = "st-fiacre";

export function accountingAvailableForParish(parishId) {
  return String(parishId || "").trim().toLowerCase() === ACCOUNTING_DEMO_PARISH_ID;
}
