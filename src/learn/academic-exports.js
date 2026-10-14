// Generated from src/learn/academic-exports.ts by npm run build:server. Do not edit.
function buildReportCardExport(reportCard) {
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
function buildTranscriptExport(transcript) {
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
export { buildReportCardExport, buildTranscriptExport };
