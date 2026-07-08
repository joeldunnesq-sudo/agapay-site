import { readFileSync } from "node:fs";
import { buildReportCardExport, buildTranscriptExport } from "../src/learn/academic-exports.js";
import { liturgicalFeastsForYear } from "../src/liturgical-calendar.js";
import { normalizeCalendarType, SeedLiturgicalSource } from "../src/learn/liturgical-source.js";
import { buildLearnPrintDocument, buildLearnReportPrintDocument, buildPrintJobRequest, buildWeeklyHouseholdPrintDocument, renderPrintDocumentPdf } from "../src/learn/print-documents.js";
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
const revisedJuneFeast = liturgicalFeastsForYear(2026, "gregorian").find((feast) => feast.id === "apostles-peter-paul");
const julianPeterPaul = liturgicalFeastsForYear(2026, "julian").find((feast) => feast.id === "apostles-peter-paul");
assert(revisedJuneFeast?.date === "2026-06-29", "Internal Revised Julian calendar should place Sts. Peter and Paul on June 29.");
assert(julianPeterPaul?.date === "2026-07-12" && julianPeterPaul?.sourceDate?.includes("Jun 29"), "Internal Old Calendar should map Julian June 29 to the correct civil date.");
const revisedPlannerJune = repository.getPlanner({ calendarType: "revised-julian", view: "month", month: "2026-06" });
const revisedPlannerPeterPaul = revisedPlannerJune.month.days.find((day) => day.civilDate === "2026-06-29");
assert(revisedPlannerPeterPaul?.feastTitle?.includes("Peter and Paul"), "Meal/planner month view should surface Sts. Peter and Paul on June 29 for Revised Julian families.");
const julianPlannerJuly = repository.getPlanner({ calendarType: "julian", view: "month", month: "2026-07" });
const julianPlannerPeterPaul = julianPlannerJuly.month.days.find((day) => day.civilDate === "2026-07-12");
assert(julianPlannerPeterPaul?.feastTitle?.includes("Peter and Paul") && julianPlannerPeterPaul?.oldStyleDateLabel?.includes("Jun 29"), "Old Calendar month view should surface Sts. Peter and Paul on its civil date with the Julian date label.");
const revisedPrintCenter = repository.getPrintCenter({ calendarType: "revised-julian", month: "2026-06" });
assert(revisedPrintCenter.month.days.find((day) => day.civilDate === "2026-06-29")?.feastTitle?.includes("Peter and Paul"), "Print Center month calendar should use the same internal feast data as Planner.");
assert(repository.getDashboard({ calendarType: "revised-julian", civilDate: "2026-06-29" }).today.liturgicalDay.feastTitle.includes("Peter and Paul"), "Dashboard Today in the Church should use the internal feast data.");
assert(repository.getFormation({ calendarType: "revised-julian", civilDate: "2026-06-29" }).today.liturgicalDay.feastTitle.includes("Peter and Paul"), "Formation should use the internal feast data.");
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

// ── Weekly/Monthly planner weekday alignment ────────────────────────────────
const weekPlanner = repository.getPlanner({ view: "week" });
const alignmentMonthKey = weekPlanner.week.dates[1].slice(0, 7);
const alignmentMonthPlanner = repository.getPlanner({ view: "month", month: alignmentMonthKey });
const alignmentMonday = weekPlanner.week.dates[1];
const alignmentTuesday = weekPlanner.week.dates[2];
const alignmentFriday = weekPlanner.week.dates[5];
const alignmentSunday = weekPlanner.week.dates[0];
const alignmentSaturday = weekPlanner.week.dates[6];
const alignmentRows = [...(weekPlanner.week.householdRows || []), ...(weekPlanner.week.childRows || [])];
const mondayRow = alignmentRows.find((row) => Number(row.minutes?.[1] || 0) > 0);
const tuesdayRow = alignmentRows.find((row) => Number(row.minutes?.[2] || 0) > 0);
const fridayRow = alignmentRows.find((row) => Number(row.minutes?.[5] || 0) > 0);
const alignmentMondayCell = alignmentMonthPlanner.month.days.find((day) => day.civilDate === alignmentMonday);
const alignmentTuesdayCell = alignmentMonthPlanner.month.days.find((day) => day.civilDate === alignmentTuesday);
const alignmentFridayCell = alignmentMonthPlanner.month.days.find((day) => day.civilDate === alignmentFriday);
const alignmentSundayCell = alignmentMonthPlanner.month.days.find((day) => day.civilDate === alignmentSunday);
const alignmentSaturdayCell = alignmentMonthPlanner.month.days.find((day) => day.civilDate === alignmentSaturday);
const monthCellTitles = (cell) => [
  ...(cell?.householdPlan || []).map((item) => item.title),
  ...(cell?.formPlan || []).map((item) => item.title)
];
assert(mondayRow && monthCellTitles(alignmentMondayCell).includes(mondayRow.title), "Monthly planner should show Monday weekly work on Monday.");
assert(tuesdayRow && monthCellTitles(alignmentTuesdayCell).includes(tuesdayRow.title), "Monthly planner should show Tuesday weekly work on Tuesday.");
assert(fridayRow && monthCellTitles(alignmentFridayCell).includes(fridayRow.title), "Monthly planner should show Friday weekly work on Friday.");
const fridayOnlyRow = alignmentRows.find((row) => Number(row.minutes?.[5] || 0) > 0 && Number(row.minutes?.[6] || 0) === 0);
if (fridayOnlyRow) {
  assert(!monthCellTitles(alignmentSaturdayCell).includes(fridayOnlyRow.title), "Monthly planner should not show Friday-only work on Saturday.");
}
const saturdayOnlyRow = alignmentRows.find((row) => Number(row.minutes?.[6] || 0) > 0 && Number(row.minutes?.[0] || 0) === 0);
if (saturdayOnlyRow) {
  assert(!monthCellTitles(alignmentSundayCell).includes(saturdayOnlyRow.title), "Monthly planner should not show Saturday-only work on Sunday.");
}

const coOp = repository.getCoOp({ enabled: true });
assert(coOp.enabled === true && coOp.scheduleBlocks.length >= 5, "Co-op scaffold should be feature-flag ready with schedule blocks.");

const onboarding = repository.getOnboarding();
assert(onboarding.onboarding.steps.some((step) => step.status === "active"), "Onboarding should have an active setup step.");
assert(onboarding.setupCompleted === false, "Unsaved Learn households should be identified as first-run setup.");

const learnShell = readFileSync(new URL("../public/learn/dashboard-shell.js", import.meta.url), "utf8");
const learnMobileGate = readFileSync(new URL("../public/learn/mobile-gate.js", import.meta.url), "utf8");
const learnBilling = readFileSync(new URL("../src/learn/billing.js", import.meta.url), "utf8");
const learnHandlers = readFileSync(new URL("../src/learn/handlers.js", import.meta.url), "utf8");
const learnGoogleCalendar = readFileSync(new URL("../src/learn/google-calendar.js", import.meta.url), "utf8");
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
assert(["Language Arts", "Mathematics", "History", "Geography", "Literature", "Science"].every((title) => learnShell.includes(`title: "${title}"`)) && learnShell.includes('title: "Morning Prayers"') && learnShell.includes('title: "Family Read-Aloud"'), "The starter-week option should persist a full editable subject slate, Church rhythm, and enrichment data.");
assert(learnShell.includes('panel("Family-Based Learning"') && !learnShell.includes('panel("Household Stream"'), "Planner should use family-based learning language instead of the legacy Household Stream label.");
assert(!learnShell.includes('// vm.activeView') && learnShell.includes('displayView !== "year" ? `<div class="learn-family-tabs learn-family-term-tabs"') && learnShell.includes('aria-current="${tab.active ? "page" : "false"}"'), "Planner should show one explicit active term outside the combined Year view without leaking template code.");
assert(learnShell.includes("TOGETHER THIS WEEK") && learnShell.includes("DAILY CHURCH RHYTHMS"), "Learn dashboard should distinguish weekly family work from daily Church rhythms.");
assert(learnShell.includes("learn-week-overview") && learnShell.includes("learn-child-week-grid") && learnShell.includes("WEEK AT A GLANCE"), "Learn dashboard should keep household summaries separate from a scalable child grid.");
assert(learnShell.includes("data-learn-completion") && learnShell.includes("/api/learn/completion"), "Learn dashboard should persist daily and weekly completion through the backend.");
assert(learnShell.includes("Full, Medium, or Light") && learnShell.includes("Each child keeps up to 4 ranked subjects") && learnShell.includes("Each child keeps up to 2 top-ranked subjects"), "The setup wizard should explain the exact Full, Medium, and Light Grace Mode caps.");
assert(learnShell.includes("1 Core: chosen first in every mode") && learnShell.includes("4 Low: first moved to reserve"), "Advanced Setup should expose granular Grace priority ranking for each subject.");
assert(learnRepository.includes("GRACE_MODE_CAPS") && learnRepository.includes("deferred-by-cap"), "Grace Mode should enforce daily caps in the planner engine.");
assert(learnRepository.includes('modes: ["full", "medium", "light"]'), "Learn APIs should expose the three mom-facing Grace Mode options.");
assert(learnSetupPersistence.includes("gracePriorityValue") && learnSetupPersistence.includes("graceModeValue"), "Learn setup persistence should normalize legacy and current Grace Mode values.");
assert(learnShell.includes("No permanent choice is required"), "The Grace Mode wizard step should explain that families can change modes day by day.");
assert(learnShell.includes('id="reports"') && learnShell.includes("Reports & Records"), "Print Center should contain the staged Reports and Records workspace.");
assert(!learnShell.includes('apiGet("/api/learn/reports")'), "The Learn shell should not load a standalone Reports screen.");
assert(learnShell.includes("data-community-category") && learnShell.includes("data-community-resource-type") && learnShell.includes("data-community-media-type"), "Community Resources should filter by subject, resource type, and media type.");
assert(learnShell.includes("data-community-suggest-form") && learnShell.includes("data-community-flag"), "Community Resources should support moderated submissions and member flags.");
assert(learnShell.includes("Free plan: up to 2 children"), "Learn setup wizard should clearly disclose the free child limit.");
assert(learnShell.includes('learnSectionHref("onboarding", "simple=1")') && learnShell.includes(">Quick Setup"), "Learn utility bar should open the simple setup wizard, resolved per-context (My AGAPAY vs. Odyssey/TEFA) via learnSectionHref.");
assert(learnShell.includes('class="learn-setup-savebar"'), "Advanced Setup should use a dedicated reachable save bar.");
assert(learnShell.includes("data-day-choice") && learnShell.includes('name="scheduledDays"'), "Enrichment and Form subjects should support exact weekday scheduling.");
assert(learnShell.includes("Family Planner & Meals") && learnShell.includes("familyPlanning.fastingPreference"), "Planner should expose connected family calendar and fasting-aware meal planning.");
assert(learnShell.includes('data-setup-row="familyEvents"') && learnShell.includes('data-setup-row="recipes"') && learnShell.includes('data-setup-row="groceryItems"'), "Learn setup should persist events, recipes, and grocery items.");
assert(learnShell.includes('name="childNameDay"') && learnShell.includes("motherNameDay") && learnShell.includes("fatherNameDay"), "The Family Planner should collect annual household name days.");
assert(learnShell.includes("data-family-planning-form") && learnShell.includes("/api/learn/family-planning"), "Family planning should live in Planner and save through its own endpoint.");
assert(!learnShell.includes('panel("Family Calendar & Meals", familyPlanningSetupPanel(vm)'), "Advanced school setup should not contain the family planning workspace.");
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
assert(learnSetupPersistence.includes("currentWeekWindow") && learnSetupPersistence.includes('kind: "enrichment"'), "Starter setup should generate a current editable week with enrichment rows.");
assert(learnSetupPersistence.includes("scheduledDaysValue") && learnSetupPersistence.includes("familyPlanning"), "Learn setup persistence should normalize weekday schedules and connected family planning.");
assert(learnRepository.includes("familyPlanForDate") && learnRepository.includes("familyDays"), "Planner APIs should map name days, events, and meals onto calendar dates.");
assert(learnHandlers.includes("calendarTypeForRequest") && learnGoogleCalendar.includes("setupSnapshot?.preferences?.calendarType"), "Learn calendar consumers should use explicit or saved household calendar preference before falling back.");
assert(!learnHandlers.includes('href: "/myagapay/learn/reports"'), "Learn metadata should keep Reports inside Print Center rather than a standalone tab.");
assert(learnHandlers.includes("AGAPAY_LEARN_FACEBOOK_GROUP_URL"), "Community should accept a configured Facebook group URL.");
assert(learnOverviewHtml.includes("Clearly on the roadmap") && learnOverviewHtml.includes("Reports & Transcripts"), "The Learn overview should clearly separate coming-soon features.");
assert(!learnOverviewHtml.includes("Printables, reports, and transcripts"), "The Learn overview should not advertise Reports as currently available.");
assert(learnPricingHtml.includes("Reports Coming Soon") && learnPricingHtml.includes("Reports</div><div>Coming Soon"), "Learn pricing should clearly label Reports as coming soon.");
assert(learnDashboardHtml.includes("/learn/mobile-gate.js"), "Learn dashboard should load the mobile gate, which owns dynamic-importing the dashboard shell (see public/learn/mobile-gate.js).");
assert(learnMobileGate.includes("/learn/dashboard-shell.js"), "Learn mobile gate should dynamic-import the active dashboard shell.");
assert(learnDashboardHtml.includes("/myagapay-shell.js"), "Learn dashboard should load the shared My AGAPAY shell.");
assert(learnShell.includes("window.MyAgapayShell.productNav") && learnShell.includes("window.MyAgapayShell.redirectToLogin"), "Learn should share global product navigation and expired-session handling with My AGAPAY.");
assert(learnShell.includes("learn-page-intro--dashboard") && learnShell.includes('"--cream:#f6f1e8"'), "Learn Today should use the navy branded intro card on the shared Giving dashboard canvas color.");
assert(learnShell.includes("dashboard-view-models.js"), "Learn dashboard shell should import the active view model bundle.");
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

// ── Odyssey / TEFA pre-launch checks ────────────────────────────────────────
const odysseyIndexHtml = readFileSync(new URL("../public/learn/odyssey/index.html", import.meta.url), "utf8");
const odysseyFaqHtml = readFileSync(new URL("../public/learn/odyssey/faq.html", import.meta.url), "utf8");
const odysseyActivateHtml = readFileSync(new URL("../public/learn/odyssey/dashboard/activate.html", import.meta.url), "utf8");
const odysseyLoginHtml = readFileSync(new URL("../public/learn/odyssey/dashboard/login.html", import.meta.url), "utf8");
const workerSource = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");

assert(odysseyFaqHtml.includes("AGAPAY Learn has been pre-approved for Odyssey"), "Odyssey FAQ should accurately state pre-approval status.");
assert(odysseyFaqHtml.includes("Student Data & Privacy") || odysseyFaqHtml.includes("Student Data &amp; Privacy"), "Odyssey FAQ should include a Student Data & Privacy section.");
assert(odysseyFaqHtml.includes("support@agapay.app"), "Odyssey FAQ should list a support contact.");
assert(odysseyFaqHtml.includes("/learn/odyssey/dashboard/activate"), "Odyssey FAQ should link to the activation page.");
assert(odysseyFaqHtml.includes("/learn/odyssey/dashboard/login"), "Odyssey FAQ should link to the sign-in page.");

[
  "/learn/dashboard-shell.js",
  'data-learn-context="odyssey"',
  'data-learn-page="dashboard"',
  '<main id="learnRoot"'
].forEach((needle) => assert(!odysseyFaqHtml.includes(needle), `Odyssey FAQ must stay public/static and must not include "${needle}".`));

assert(odysseyIndexHtml.includes("/learn/odyssey/faq"), "Odyssey landing page should link to the FAQ.");
assert(odysseyActivateHtml.includes("/learn/odyssey/faq"), "Odyssey activation page should link to the FAQ.");
assert(odysseyLoginHtml.includes("/learn/odyssey/faq"), "Odyssey login page should link to the FAQ.");

[
  "live on Odyssey",
  "available now in the Odyssey marketplace",
  "purchase now through Odyssey",
  "listed on Odyssey"
].forEach((phrase) => assert(!odysseyIndexHtml.includes(phrase), `Odyssey landing page should not say "${phrase}" ahead of a deliberate live-marketplace flag.`));

[
  "odysseyVerificationStatus",
  "odysseyActivatedAt",
  "odysseyLastVerifiedAt",
  "odysseyVerificationNote"
].forEach((field) => assert(learnBilling.includes(field), `Odyssey activation backend should track ${field}.`));

assert(workerSource.includes('["/learn/odyssey/faq", "/learn/odyssey/faq.html"]'), "Worker asset routes should serve the Odyssey FAQ page.");
assert(workerSource.includes('["/learn/odyssey/faq/", "/learn/odyssey/faq.html"]'), "Worker asset routes should serve the Odyssey FAQ page with a trailing slash.");

console.log("AGAPAY Learn checks passed.");
