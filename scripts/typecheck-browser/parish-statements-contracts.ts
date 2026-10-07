const statementPreview: Promise<void> = previewGivingStatement(document.createElement('button'));
void statementPreview;
const statementPoll: Promise<void> = pollGivingStatementJob('job');
void statementPoll;
// @ts-expect-error Preview controls must be buttons.
previewGivingStatement(document.createElement('div'));
// @ts-expect-error Polling requires a job identifier.
pollGivingStatementJob();
// @ts-expect-error History jobs must be a list.
const invalidStatementHistory: ParishStatementHistoryResponse = { jobs: {} };
void invalidStatementHistory;
