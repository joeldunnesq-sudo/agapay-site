import { readFileSync } from "node:fs";
import { buildReportCardExport, buildTranscriptExport } from "../src/learn/academic-exports.js";
import { normalizeCalendarType, SeedLiturgicalSource } from "../src/learn/liturgical-source.js";
import { buildLearnPrintDocument, buildLearnReportPrintDocument, buildPrintJobRequest, buildWeeklyHouseholdPrintDocument, renderPrintDocumentPdf } from "../src/learn/print-engine.js";
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
const serverPrintDocument = buildLearnPrintDocument(printCenter, { templateId: "print_mom_weekly" });
const pdfBytes = await renderPrintDocumentPdf(serverPrintDocument);
assert(pdfBytes[0] === 0x25 && pdfBytes[1] === 0x50 && pdfBytes[2] === 0x44 && pdfBytes[3] === 0x46, "Print engine should render a real PDF.");
const reportPrintDocument = buildLearnReportPrintDocument(reports, { templateId: "year-end-report" });
const reportPdfBytes = await renderPrintDocumentPdf(reportPrintDocument);
assert(reportPdfBytes[0] === 0x25 && reportPdfBytes[1] === 0x50 && reportPdfBytes[2] === 0x44 && reportPdfBytes[3] === 0x46, "Report print engine should render a real PDF.");
const printJob = buildPrintJobRequest({ templateId: "print_mom_weekly", rangeLabel: "May 4 - May 10" });
assert(printJob.status === "ready" && printJob.format === "pdf", "Print job helper should default to ready PDFs.");

const coOp = repository.getCoOp({ enabled: true });
assert(coOp.enabled === true && coOp.scheduleBlocks.length >= 5, "Co-op scaffold should be feature-flag ready with schedule blocks.");

const onboarding = repository.getOnboarding();
assert(onboarding.onboarding.steps.some((step) => step.status === "active"), "Onboarding should have an active setup step.");

const learnShell = readFileSync(new URL("../public/learn/dashboard-shell.js", import.meta.url), "utf8");
const learnBilling = readFileSync(new URL("../src/learn/billing.js", import.meta.url), "utf8");
const learnDashboardHtml = readFileSync(new URL("../public/learn/dashboard.html", import.meta.url), "utf8");
assert(learnShell.includes("data-dialog-checkout"), "Learn shell should include checkout dialog hooks.");
assert(learnShell.includes("data-grace-mode"), "Learn shell should expose grace mode controls.");
assert(learnShell.includes("data-print-generate"), "Learn shell should expose print generation hooks.");
assert(learnShell.includes("/api/learn/print/"), "Learn shell should request route-scoped server-side PDF generation.");
assert(!learnShell.includes("buildSimplePdf"), "Learn shell should not use client-side raw PDF generation.");
assert(!learnShell.includes("window.print"), "Learn shell should not use browser print for report PDFs.");
assert(learnShell.includes("today-in-the-church.jpg"), "Learn shell should render the Today in the Church artwork.");
assert(learnShell.includes("data-setup-progress-target"), "Learn shell setup progress cards should be interactive.");
assert(learnDashboardHtml.includes("/learn/dashboard-shell.js"), "Learn dashboard should load the active dashboard shell.");
assert(learnDashboardHtml.includes("/learn/dashboard-view-models.js"), "Learn dashboard should preload the active view model bundle.");
assert(!learnDashboardHtml.includes("claude-shell"), "Learn dashboard should not reference legacy Claude shell filenames.");
assert(learnBilling.includes("stephaie@dunncrew.com"), "Founder-family Learn access should include Stephanie's account.");

const phase3Migration = readFileSync(new URL("../migrations/0005_agapay_learn_phase3.sql", import.meta.url), "utf8");
[
  "learn_rotations",
  "learn_catechesis_cycles",
  "learn_report_exports",
  "learn_co_ops",
  "learn_co_op_schedule_blocks"
].forEach((table) => assert(phase3Migration.includes(table), `Migration should define ${table}.`));

console.log("AGAPAY Learn checks passed.");
