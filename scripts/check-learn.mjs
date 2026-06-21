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
const monthPlanner = repository.getPlanner({ view: "month", month: "2026-06" });
assert(monthPlanner.activeView === "month", "Planner should expose a month view.");
assert(monthPlanner.month?.days?.length >= 35, "Month planner should expose a full calendar grid.");
assert(monthPlanner.month.days.some((day) => day.isFastDay && day.fastingType), "Month planner should label fasting type for fast days.");
const printDocument = buildWeeklyHouseholdPrintDocument(printCenter);
assert(printDocument.sections.length >= 2, "Print engine should build household and child sections.");
const serverPrintDocument = buildLearnPrintDocument(printCenter, { templateId: "print_mom_weekly" });
const pdfBytes = await renderPrintDocumentPdf(serverPrintDocument);
assert(pdfBytes[0] === 0x25 && pdfBytes[1] === 0x50 && pdfBytes[2] === 0x44 && pdfBytes[3] === 0x46, "Print engine should render a real PDF.");
const reportPrintDocument = buildLearnReportPrintDocument(reports, { templateId: "year-end-report" });
const reportPdfBytes = await renderPrintDocumentPdf(reportPrintDocument);
assert(reportPdfBytes[0] === 0x25 && reportPdfBytes[1] === 0x50 && reportPdfBytes[2] === 0x44 && reportPdfBytes[3] === 0x46, "Report print engine should render a real PDF.");
const monthPrintDocument = buildLearnPrintDocument(repository.getPrintCenter({ month: "2026-06" }), { templateId: "print_mom_month", month: "2026-06" });
assert(monthPrintDocument.sections.some((section) => section.heading === "Month Calendar"), "Print engine should render a month calendar section.");
const monthPdfBytes = await renderPrintDocumentPdf(monthPrintDocument);
assert(monthPdfBytes[0] === 0x25 && monthPdfBytes[1] === 0x50 && monthPdfBytes[2] === 0x44 && monthPdfBytes[3] === 0x46, "Month calendar should render a real PDF.");
const printJob = buildPrintJobRequest({ templateId: "print_mom_weekly", rangeLabel: "May 4 - May 10" });
assert(printJob.status === "ready" && printJob.format === "pdf", "Print job helper should default to ready PDFs.");

const coOp = repository.getCoOp({ enabled: true });
assert(coOp.enabled === true && coOp.scheduleBlocks.length >= 5, "Co-op scaffold should be feature-flag ready with schedule blocks.");

const onboarding = repository.getOnboarding();
assert(onboarding.onboarding.steps.some((step) => step.status === "active"), "Onboarding should have an active setup step.");
assert(onboarding.setupCompleted === false, "Unsaved Learn households should be identified as first-run setup.");

const learnShell = readFileSync(new URL("../public/learn/dashboard-shell.js", import.meta.url), "utf8");
const learnBilling = readFileSync(new URL("../src/learn/billing.js", import.meta.url), "utf8");
const learnHandlers = readFileSync(new URL("../src/learn/handlers.js", import.meta.url), "utf8");
const learnRepository = readFileSync(new URL("../src/learn/repository.js", import.meta.url), "utf8");
const learnSetupPersistence = readFileSync(new URL("../src/learn/setup-persistence.js", import.meta.url), "utf8");
const learnDashboardHtml = readFileSync(new URL("../public/learn/dashboard.html", import.meta.url), "utf8");
const learnOverviewHtml = readFileSync(new URL("../public/learn/index.html", import.meta.url), "utf8");
const learnPricingHtml = readFileSync(new URL("../public/learn/pricing.html", import.meta.url), "utf8");
const learnShellCss = readFileSync(new URL("../public/learn/shell.css", import.meta.url), "utf8");
assert(learnShell.includes("data-dialog-checkout"), "Learn shell should include checkout dialog hooks.");
assert(learnShell.includes("data-grace-mode"), "Learn shell should expose grace mode controls.");
assert(learnShell.includes("data-print-generate"), "Learn shell should expose print generation hooks.");
assert(learnShell.includes("data-planner-month-print"), "Learn planner should expose printable month calendar hooks.");
assert(learnShell.includes("/api/learn/print/"), "Learn shell should request route-scoped server-side PDF generation.");
assert(!learnShell.includes("buildSimplePdf"), "Learn shell should not use client-side raw PDF generation.");
assert(!learnShell.includes("window.print"), "Learn shell should not use browser print for report PDFs.");
assert(learnShell.includes("today-in-the-church.jpg"), "Learn shell should render the Today in the Church artwork.");
assert(!learnShell.includes('panel("Setup Progress"'), "Advanced Setup should not repeat the first-run wizard progress card.");
assert(learnShell.includes("data-simple-setup-wizard"), "Learn should provide a simplified first-run setup wizard.");
assert(learnShell.includes('const SIMPLE_SETUP_STEPS = ["Household", "Rhythm", "Forms or Grades", "Children", "Grace Mode", "Starter Week"]'), "Learn setup should establish rhythm and planning structure before collecting children, then introduce Grace Mode.");
assert(learnShell.includes("agapay.learn.simpleSetup.v1"), "Learn setup wizard should persist unfinished progress locally.");
assert(learnShell.includes("data-wizard-advanced"), "Learn setup wizard should link to Advanced Setup.");
assert(learnShell.includes("simpleSetupPayload"), "Learn setup wizard should save through the existing setup endpoint.");
assert(learnShell.includes("Create a gentle starter week"), "Learn setup wizard should offer a starter-week plan.");
assert(learnShell.includes('title: "Starter Language Arts"') && learnShell.includes('title: "Morning Prayers"') && learnShell.includes('title: "Family Read-Aloud"'), "The starter-week option should persist real subject, Church rhythm, and enrichment data.");
assert(learnShell.includes("Grace Mode lightens a day without erasing the plan"), "The setup wizard should explain Grace Mode and its non-destructive behavior.");
assert(learnShell.includes("No permanent choice is required"), "The Grace Mode wizard step should explain that families can change modes day by day.");
assert(learnShell.includes("renderReportsComingSoon") && !learnShell.includes('apiGet("/api/learn/reports")'), "The Learn Reports screen should remain a coming-soon surface without loading report data.");
assert(learnShell.includes("Free plan: up to 2 children"), "Learn setup wizard should clearly disclose the free child limit.");
assert(learnShell.includes('href="/myagapay/learn/setup?simple=1">Quick Setup'), "Learn utility bar should open the simple setup wizard.");
assert(learnShell.includes('class="learn-setup-savebar"'), "Advanced Setup should use a dedicated reachable save bar.");
assert(learnShellCss.includes(".learn-product-topbar .learn-quick-action") && learnShellCss.includes("display: inline-flex !important"), "Quick Setup should remain visible in the mobile utility bar.");
assert(learnShellCss.includes("bottom: calc(78px + env(safe-area-inset-bottom))"), "The mobile setup save bar should sit above the fixed product navigation.");
assert(learnShell.includes('loginUrl.searchParams.set("reason", "session-expired")'), "Expired Learn sessions should return users to My AGAPAY sign-in.");
assert(learnShell.includes('loginUrl.searchParams.set("next",'), "Learn sign-in redirects should preserve the requested Learn page.");
assert(learnShell.includes("existingSnapshot?.subjects || []"), "Quick Setup should preserve an existing household's advanced subject plan.");
assert(learnShell.includes('groupingMode: draft.useForms ? "forms" : "grades"'), "The setup wizard should persist Forms versus grade-level planning.");
assert(learnShell.includes("function setupExperience"), "Advanced Setup should adapt its organization to the selected homeschool method.");
assert(learnShell.includes('name="gradeLabel"') && learnShell.includes('name="formLabel"'), "Adaptive setup should retain both grade and Form mappings when users switch organization styles.");
assert(learnHandlers.includes("setupCompleted: Boolean(repository.seed?.setupSnapshot)"), "Learn dashboard API should expose first-run setup state.");
assert(learnRepository.includes("setupCompleted: Boolean(this.seed.setupSnapshot)"), "Learn onboarding API should expose saved setup state.");
assert(learnSetupPersistence.includes('"Traditional", "Eclectic", "Unsure"'), "Learn setup should accept every wizard rhythm preset.");
assert(learnSetupPersistence.includes("parentNames"), "Learn setup should persist the wizard parent name.");
assert(learnSetupPersistence.includes("groupingMode"), "Learn setup should persist the selected planning-group model.");
assert(learnHandlers.includes('label: "Reports", implemented: false, status: "coming-soon"'), "Learn metadata should mark Reports as coming soon.");
assert(learnOverviewHtml.includes("Clearly on the roadmap") && learnOverviewHtml.includes("Reports & Transcripts"), "The Learn overview should clearly separate coming-soon features.");
assert(!learnOverviewHtml.includes("Printables, reports, and transcripts"), "The Learn overview should not advertise Reports as currently available.");
assert(learnPricingHtml.includes("Reports Coming Soon") && learnPricingHtml.includes("Reports</div><div>Coming Soon"), "Learn pricing should clearly label Reports as coming soon.");
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
