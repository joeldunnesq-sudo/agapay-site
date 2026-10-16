import type { LearnPrintNode } from './print-engine.js';
export function buildLearnPrintDocument(
  center: Record<string, unknown>,
  options?: {
    templateId?: string;
    childId?: string;
    termId?: string;
    month?: string;
    year?: string;
    designedWeek?: unknown;
    generatedAt?: string;
  }
): LearnPrintNode;
export function buildLearnReportPrintDocument(
  reports: Record<string, unknown>,
  options?: { templateId?: string; label?: string; generatedAt?: string }
): LearnPrintNode;
export function renderPrintDocumentPdf(document: LearnPrintNode): Promise<Uint8Array<ArrayBuffer>>;
interface AcademicPdfInput {
  household?: { name?: string; homeschoolName?: string; patronSaintName?: string };
  child?: import('./grade-records.js').LearnGradeChild & { gradeLevel?: number };
  academicYear?: { name?: string };
  courses?: { id?: string; courseTitle?: string; gradeLevel?: unknown }[];
  attendance?: unknown;
  testScores?: unknown[];
  generatedAt?: string;
}
export function buildAcademicReportCardPdf(input?: AcademicPdfInput): Promise<Uint8Array<ArrayBuffer>>;
export function buildAcademicTranscriptPdf(input?: AcademicPdfInput): Promise<Uint8Array<ArrayBuffer>>;
