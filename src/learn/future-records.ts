export interface PrintTemplate {
  id: string;
  householdId: string;
  templateType: "weekly-household-plan" | "term-plan" | "month-calendar" | "liturgical-school-calendar" | "child-weekly-assignment" | "child-reading-list" | "memory-work-sheet" | "copywork-sheet" | "child-term-plan";
  title: string;
  audience: "mom" | "child";
}

export interface PrintJob {
  id: string;
  householdId: string;
  templateId: string;
  status: "queued" | "rendering" | "complete";
  requestedAt: string;
}

export interface ReportCard {
  id: string;
  householdId: string;
  childId: string;
  schoolYearId: string;
  status: "draft" | "published";
}

export interface Transcript {
  id: string;
  householdId: string;
  childId: string;
  status: "draft" | "published";
}

export interface AcademicRecord {
  id: string;
  householdId: string;
  childId: string;
  recordType: "attendance" | "course-credit" | "milestone" | "narration-summary";
  occurredOn: string;
}

export interface FutureRecordsRepository {
  listPrintTemplates(householdId: string): Promise<PrintTemplate[]>;
  listPrintJobs(householdId: string): Promise<PrintJob[]>;
  listReportCards(householdId: string): Promise<ReportCard[]>;
  listTranscripts(householdId: string): Promise<Transcript[]>;
  listAcademicRecords(householdId: string): Promise<AcademicRecord[]>;
}
