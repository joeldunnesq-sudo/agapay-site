import { SeedLearnRepository } from '../../src/learn/repository.js';
import {
  buildLearnPrintDocument,
  buildLearnReportPrintDocument,
  renderPrintDocumentPdf,
  buildAcademicTranscriptPdf,
} from '../../src/learn/print-documents.js';
import type { PrintSection, PdfState, PrintDay } from '../../src/learn/print-document-contracts.js';
import { renderPrintDocumentPdf as renderHostedPrintDocumentPdf } from '../../src/learn/print-engine.js';
const repository = new SeedLearnRepository();
const document = buildLearnPrintDocument(repository.getPrintCenter());
void renderHostedPrintDocumentPdf(document, {});
void renderPrintDocumentPdf(document);
void buildLearnReportPrintDocument(repository.getReports());
void buildAcademicTranscriptPdf({
  courses: [{ childId: 'student', courseTitle: 'Algebra', grades: [{ termIndex: 1, letterGrade: 'A' }] }],
});
type IsAny<T> = 0 extends 1 & T ? true : false;
const monthPlansAreChecked: IsAny<NonNullable<PrintDay['formPlan']>[number]['minutes']> = false;
void monthPlansAreChecked;
// @ts-expect-error Table rows are lists of cells.
const invalidTable: PrintSection = { type: 'table', columns: ['Course'], rows: ['Algebra'] };
// @ts-expect-error A checklist contains day labels, not calendar objects.
const invalidChecklist: PrintSection = { type: 'checkboxes', subjects: ['Math'], days: [{ date: '2026-10-16' }] };
// @ts-expect-error PDF drawing coordinates are numeric.
const invalidY: PdfState['y'] = 'top';
// @ts-expect-error Course grades use textual letter grades.
void buildAcademicTranscriptPdf({ courses: [{ grades: [{ letterGrade: 4 }] }] });
void [invalidTable, invalidChecklist, invalidY];
