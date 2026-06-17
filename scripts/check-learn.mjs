import { readFileSync } from "node:fs";
import { buildReportCardExport, buildTranscriptExport } from "../src/learn/academic-exports.js";
import { normalizeCalendarType, SeedLiturgicalSource } from "../src/learn/liturgical-source.js";
import { buildPrintJobRequest, buildWeeklyHouseholdPrintDocument } from "../src/learn/print-engine.js";
import { getLearnSeedSnapshot } from "../src/learn/demo-data.js";
import { createSeedLearnRepository } from "../src/learn/repository.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const repository = createSeedLearnRepository();
const seed = getLearnSeedSnapshot();

const formation = repository.getFormation();
assert(formation.catechesisCycle?.evaluationModel === "narrative-only", "Formation catechesis cycle should expose narrative evaluation.");
assert(formation.recitationTracks.length >= 4, "Formation should expose recitation tracks.");

const books = repository.getBooks();
assert(books.currentReadAlouds.length === 3, "Books should expose current read-alouds.");
assert(books.libraryBooks.some((book) => book.orthodox), "Books should preserve Orthodox library metadata.");

const reports = repository.getReports();
assert(reports.reportCards[0]?.records.length > 0, "Reports should generate report-card records.");
assert(reports.transcripts[0]?.records.length > 0, "Reports should generate transcript records.");
assert(reports.reportExports.length >= 4, "Reports should expose compliance-friendly exports.");
assert(reports.reportCards[0]?.exportPreview?.records.length > 0, "Reports should include report-card export previews.");
assert(reports.transcripts[0]?.exportPreview?.records.length > 0, "Reports should include transcript export previews.");

const reportExport = buildReportCardExport(seed.reportCards[0]);
assert(reportExport.title === "Term Report Card", "Report card export helper should produce titled payloads.");
const transcriptExport = buildTranscriptExport(seed.transcripts[0]);
assert(transcriptExport.title === "Academic Transcript", "Transcript export helper should produce titled payloads.");

const liturgicalSource = new SeedLiturgicalSource(seed);
assert(normalizeCalendarType("gregorian") === "revised-julian", "Calendar normalization should map Gregorian labels.");
assert(liturgicalSource.listRange({ calendarType: "julian", startDate: "2025-05-07", endDate: "2025-05-08" }).length === 2, "Liturgical source should support date ranges.");

const printCenter = repository.getPrintCenter();
const printDocument = buildWeeklyHouseholdPrintDocument(printCenter);
assert(printDocument.sections.length >= 2, "Print engine should build household and child sections.");
const printJob = buildPrintJobRequest({ templateId: "print_mom_weekly", rangeLabel: "May 4 - May 10" });
assert(printJob.status === "ready" && printJob.format === "pdf", "Print job helper should default to ready PDFs.");

const coOp = repository.getCoOp({ enabled: true });
assert(coOp.enabled === true && coOp.scheduleBlocks.length >= 5, "Co-op scaffold should be feature-flag ready with schedule blocks.");

const onboarding = repository.getOnboarding();
assert(onboarding.onboarding.steps.some((step) => step.status === "active"), "Onboarding should have an active setup step.");

const learnApp = readFileSync(new URL("../public/learn/app.js", import.meta.url), "utf8");
assert(learnApp.includes("role=\"dialog\""), "Learn app should include accessible edit dialogs.");
assert(learnApp.includes("role=\"progressbar\""), "Learn app should expose progressbar semantics.");
assert(learnApp.includes("data-learn-action=\"print-edit\""), "Learn app should expose print edit flow hooks.");

const phase3Migration = readFileSync(new URL("../migrations/0005_agapay_learn_phase3.sql", import.meta.url), "utf8");
[
  "learn_rotations",
  "learn_catechesis_cycles",
  "learn_report_exports",
  "learn_co_ops",
  "learn_co_op_schedule_blocks"
].forEach((table) => assert(phase3Migration.includes(table), `Migration should define ${table}.`));

console.log("AGAPAY Learn checks passed.");
