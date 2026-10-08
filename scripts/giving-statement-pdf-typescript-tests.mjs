import assert from 'node:assert/strict';
import { PDFDocument, PDFPage } from 'pdf-lib';
import { buildGivingStatementPdf } from '../src/lib/giving-statement-pdf.js';

const drawText = PDFPage.prototype.drawText;
const originalFetch = globalThis.fetch;
let captured = [];
PDFPage.prototype.drawText = function (value, options) {
  captured.push(value);
  return drawText.call(this, value, options);
};
globalThis.fetch = () => {
  throw new Error('Statement generation must not fetch external resources');
};
async function render(input) {
  captured = [];
  const bytes = await buildGivingStatementPdf(input);
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), '%PDF');
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  for (const page of pdf.getPages()) assert.deepEqual(page.getSize(), { width: 612, height: 792 });
  return { pdf, lines: [...captured] };
}
try {
  const empty = await render({ fiscalYear: 2026 });
  assert.equal(empty.pdf.getTitle(), 'Parish - 2026 Giving Statement');
  assert.equal(empty.pdf.getProducer(), 'AGAPAY');
  assert.equal(empty.pdf.getPageCount(), 1);
  assert.ok(empty.lines.includes('Valued Donor'));
  assert.ok(empty.lines.includes('$0.00'));
  assert.ok(empty.lines.join(' ').includes('No goods or services were provided'));
  assert.ok(!empty.lines.join(' ').includes('Total contributions include voluntary'));

  const gifts = Object.freeze([
    Object.freeze({
      date: '2026-12-31',
      label: 'Last gift',
      amountCents: 12345,
      feeCoverageCents: 345,
      refundedCents: 100,
    }),
    Object.freeze({ date: '2026-01-01', label: 'First gift', amountCents: 2500 }),
    Object.freeze({ date: '2026-06-01', label: 'Middle gift', amountCents: 5150, feeCoverageCents: 150 }),
  ]);
  const populated = await render({
    fiscalYear: 2026,
    gifts,
    totalCents: 19995,
    parish: {
      legalName: 'Legal Parish',
      parishName: 'Display Parish',
      ein: '12-3456789',
      addressLine1: '1 Test St',
      city: 'Test City',
      state: 'TX',
      postalCode: '12345',
      website: 'https://example.test',
    },
    donor: {
      donorName: 'Preferred Donor',
      name: 'Fallback Donor',
      email: 'donor@example.test',
      addressLine1: '2 Test St',
      addressLine2: 'Unit 3',
    },
  });
  assert.equal(populated.pdf.getTitle(), 'Legal Parish - 2026 Giving Statement');
  assert.ok(populated.lines.includes('Preferred Donor'));
  assert.ok(!populated.lines.includes('Fallback Donor'));
  assert.ok(populated.lines.includes('Federal EIN: 12-3456789'));
  assert.ok(populated.lines.includes('1 Test St, Test City TX 12345'));
  assert.ok(populated.lines.includes('2 Test St, Unit 3'));
  const words = populated.lines.join(' ');
  assert.ok(words.indexOf('First gift') < words.indexOf('Middle gift'));
  assert.ok(words.indexOf('Middle gift') < words.indexOf('Last gift'));
  assert.ok(words.includes('original $3.45 fee-covering addition'));
  assert.ok(words.includes('$1.00 refunded'));
  assert.ok(words.includes('includes a $1.50 fee-covering addition'));
  assert.ok(words.includes('Total contributions include voluntary fee-covering additions'));
  assert.ok(populated.lines.includes('$199.95'), 'the renderer must use the supplied aggregate');
  assert.equal(gifts[0].label, 'Last gift', 'sorting must not mutate the input');

  const fallback = await render({
    fiscalYear: 2025,
    gifts: [
      { date: 'invalid', amountCents: 0 },
      { date: null, amountCents: -100 },
    ],
    donor: { name: 'Fallback Donor' },
    parish: { parishName: 'Display Parish' },
  });
  assert.ok(fallback.lines.includes('Fallback Donor'));
  assert.equal(fallback.lines.filter((value) => value === '-').length, 2);
  assert.ok(fallback.lines.includes('-$1.00'));
  assert.ok(fallback.lines.includes('Gift'));

  const multipage = await render({
    fiscalYear: 2026,
    gifts: Array.from({ length: 100 }, (_, index) => ({
      date: '2026-01-01',
      amountCents: index + 1,
      label: 'Long designation '.repeat(5),
    })),
  });
  assert.ok(multipage.pdf.getPageCount() > 2);
  assert.ok(
    multipage.lines.filter((value) => value === 'Fund / Designation').length > 1,
    'table headings repeat after page breaks'
  );
  assert.equal(multipage.lines.filter((value) => value === 'Total contributions').length, 1);
  assert.ok(multipage.lines.join(' ').includes('Please retain this statement for your tax records'));
  console.log(
    'PASS - statement PDF sorting, totals, fee/refund disclosures, defaults, no network, immutable input and pagination'
  );
} finally {
  PDFPage.prototype.drawText = drawText;
  globalThis.fetch = originalFetch;
}
