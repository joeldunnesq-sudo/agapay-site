import { AccountingDatabaseError, ValidationError } from '../errors.js';

const FORM_1099_THRESHOLD_CENTS = 60000;
const FORM_1099_DISCLAIMER =
  'Data-preparation aid only; this export is not a filed or filing-ready Form 1099-NEC or Form 1096.';

function capability(actor, name) {
  if (!actor?.id || !actor.capabilities?.includes(name)) {
    throw new AccountingDatabaseError('Accounts Payable capability is required.', {
      details: { capability: name },
    });
  }
}

function parish(tier) {
  if (tier !== 'parish') throw new AccountingDatabaseError('Accounts Payable is available with Parish Accounting.');
}

async function all(db, query, ...params) {
  return (
    (
      await db
        .prepare(query)
        .bind(...params)
        .all()
    ).results || []
  );
}

export async function vendor1099Summary(db, { actor, entitlementTier, calendarYear }) {
  capability(actor, 'ap.view');
  parish(entitlementTier);
  const year = String(calendarYear || '');
  if (!/^\d{4}$/.test(year)) throw new ValidationError('A four-digit calendar year is required.');
  const rows = await all(
    db,
    `SELECT v.id vendor_id,v.display_name,v.legal_name,v.tax_id_last4,v.tax_classification,
    COALESCE(SUM(CASE WHEN p.status IN('posted','cleared') AND strftime('%Y',p.payment_date)=?
      AND p.payment_method NOT IN ('debit_card','credit_card') THEN p.total_amount ELSE 0 END),0) total_paid
    FROM accounting_vendors v LEFT JOIN accounting_payments p ON p.vendor_id=v.id
    WHERE v.requires_1099_review=1 GROUP BY v.id ORDER BY v.display_name`,
    year
  );
  return Object.freeze({
    calendarYear: year,
    threshold: FORM_1099_THRESHOLD_CENTS,
    disclaimer: FORM_1099_DISCLAIMER,
    vendors: Object.freeze(
      rows.map((row) =>
        Object.freeze({
          vendorId: row.vendor_id,
          displayName: row.display_name,
          legalName: row.legal_name || '',
          taxIdLast4: row.tax_id_last4 || '',
          taxClassification: row.tax_classification || '',
          totalPaid: Number(row.total_paid),
          meetsThreshold: Number(row.total_paid) >= FORM_1099_THRESHOLD_CENTS,
        })
      )
    ),
  });
}

function csvCell(value) {
  const raw = String(value ?? '');
  const rendered = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(rendered) ? `"${rendered.replaceAll('"', '""')}"` : rendered;
}

export function vendor1099SummaryCsv(report) {
  const lines = [
    ['Disclaimer', report.disclaimer],
    ['Calendar year', report.calendarYear],
    [],
    [
      'Vendor ID',
      'Display name',
      'Legal name',
      'Tax ID last 4',
      'Tax classification',
      'Eligible non-card payments',
      'Meets $600 threshold',
    ],
  ];
  for (const vendor of report.vendors || []) {
    lines.push([
      vendor.vendorId,
      vendor.displayName,
      vendor.legalName,
      vendor.taxIdLast4,
      vendor.taxClassification,
      vendor.totalPaid,
      vendor.meetsThreshold ? 'Yes' : 'No',
    ]);
  }
  return `${lines.map((line) => line.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
