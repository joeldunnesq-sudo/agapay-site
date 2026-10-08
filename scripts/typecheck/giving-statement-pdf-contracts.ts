import { buildGivingStatementPdf } from '../../src/lib/giving-statement-pdf.js';
import type { StatementGift } from '../../src/lib/giving-statement-pdf.js';
const gifts: readonly StatementGift[] = [{ amountCents: 100, date: null }];
const pdf: Promise<Uint8Array> = buildGivingStatementPdf({ fiscalYear: 2026, gifts });
void pdf;
// @ts-expect-error fiscal year must be numeric
void buildGivingStatementPdf({ fiscalYear: '2026' });
// @ts-expect-error year is required
void buildGivingStatementPdf({});
// @ts-expect-error amount must be numeric
void buildGivingStatementPdf({ fiscalYear: 2026, gifts: [{ amountCents: '100' }] });
// @ts-expect-error fee coverage must be numeric
void buildGivingStatementPdf({ fiscalYear: 2026, gifts: [{ amountCents: 100, feeCoverageCents: '5' }] });
// @ts-expect-error donor names must be text
void buildGivingStatementPdf({ fiscalYear: 2026, donor: { donorName: {} } });
