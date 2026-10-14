export interface AcademicExportRecord {
  subject: string;
  evaluationModel: string;
  mark: unknown;
  narrativeSummary?: string;
}
export interface ReportCardExportInput {
  id: string;
  childId: string;
  status: string;
  summary: unknown;
  records: readonly AcademicExportRecord[];
}
export interface TranscriptExportInput {
  id: string;
  childId: string;
  status: string;
  gradeSpan: unknown;
  credits: unknown;
  records: readonly AcademicExportRecord[];
}
export function buildReportCardExport(reportCard: ReportCardExportInput) {
  return {
    id: reportCard.id,
    childId: reportCard.childId,
    status: reportCard.status,
    title: 'Term Report Card',
    summary: reportCard.summary,
    records: reportCard.records.map((record) => ({
      subject: record.subject,
      evaluationModel: record.evaluationModel,
      mark: record.mark,
      narrativeSummary: record.narrativeSummary,
    })),
  };
}

export function buildTranscriptExport(transcript: TranscriptExportInput) {
  return {
    id: transcript.id,
    childId: transcript.childId,
    status: transcript.status,
    title: 'Academic Transcript',
    gradeSpan: transcript.gradeSpan,
    credits: transcript.credits,
    records: transcript.records.map((record) => ({
      subject: record.subject,
      mark: record.mark,
      evaluationModel: record.evaluationModel,
    })),
  };
}
