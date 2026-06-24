import { PDFDocument, StandardFonts, rgb, LineCapStyle } from "pdf-lib";

// AGAPAY Learn renders print-shop PDFs server-side in the Cloudflare Worker.
// pdf-lib is pure JavaScript and Worker-compatible, so we avoid Puppeteer,
// Chromium, nodejs_compat, and browser print hacks. This is the intentional
// first dependency added to support real PDF generation.

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LETTER = [612, 792];
const MARGIN = 46;
const NAVY      = rgb(0.02, 0.08, 0.15);
const NAVY_SOFT = rgb(0.06, 0.16, 0.24);
const GOLD      = rgb(0.72, 0.55, 0.20);
const GOLD_SOFT = rgb(0.94, 0.86, 0.65);
const CREAM     = rgb(0.98, 0.95, 0.88);
const PAPER     = rgb(1.00, 0.99, 0.96);
const INK       = rgb(0.08, 0.10, 0.14);
const MUTED     = rgb(0.36, 0.38, 0.42);
const LINE      = rgb(0.83, 0.78, 0.68);
const BURGUNDY  = rgb(0.55, 0.10, 0.12);
const FAST_BG   = rgb(0.98, 0.92, 0.92);
const FEAST_BG  = rgb(0.97, 0.94, 0.84);

// ─── Font URLs (Google Fonts static CSS → actual file URLs) ──────────────────
// We fetch TTF/OTF at render time; errors fall back to StandardFonts gracefully.
const FONT_URLS = {
  cormorant:     "https://fonts.gstatic.com/s/cormorantgaramond/v22/co3YmX5slCNuHLi8bLeY9MK7whWMhyjYrEPjuw.ttf",
  cormorantBold: "https://fonts.gstatic.com/s/cormorantgaramond/v22/co3bmX5slCNuHLi8bLeY9MK7whWMhyjQAllvuTWD.ttf",
  dmSans:        "https://fonts.gstatic.com/s/dmsans/v15/rP2Hp2ywxg089UriCZa4ET-DNl0.ttf",
  dmSansBold:    "https://fonts.gstatic.com/s/dmsans/v15/rP2Cp2ywxg089UriASitCBimCyUsn3ux.ttf",
};

async function fetchFont(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Font fetch failed: ${url}`);
  return res.arrayBuffer();
}

async function embedFonts(pdf) {
  try {
    const [cormorantBytes, cormorantBoldBytes, dmSansBytes, dmSansBoldBytes] = await Promise.all([
      fetchFont(FONT_URLS.cormorant),
      fetchFont(FONT_URLS.cormorantBold),
      fetchFont(FONT_URLS.dmSans),
      fetchFont(FONT_URLS.dmSansBold),
    ]);
    return {
      serif:       await pdf.embedFont(cormorantBytes),
      serifBold:   await pdf.embedFont(cormorantBoldBytes),
      sans:        await pdf.embedFont(dmSansBytes),
      sansBold:    await pdf.embedFont(dmSansBoldBytes),
      // Aliases used in drawing helpers
      times:       await pdf.embedFont(cormorantBytes),
      timesBold:   await pdf.embedFont(cormorantBoldBytes),
      helvetica:   await pdf.embedFont(dmSansBytes),
      helveticaBold: await pdf.embedFont(dmSansBoldBytes),
    };
  } catch {
    // Graceful fallback to standard PDF fonts
    const times        = await pdf.embedFont(StandardFonts.TimesRoman);
    const timesBold    = await pdf.embedFont(StandardFonts.TimesRomanBold);
    const helvetica    = await pdf.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdf.embedFont(StandardFonts.HelveticaBold);
    return { serif: times, serifBold: timesBold, sans: helvetica, sansBold: helveticaBold,
             times, timesBold, helvetica, helveticaBold };
  }
}

// ─── Text helpers ─────────────────────────────────────────────────────────────
function text(value) {
  return String(value ?? "").replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "-").trim();
}

function sumMinutes(minutes = []) {
  return minutes.reduce((sum, m) => sum + Number(m || 0), 0);
}

function childFormLabel(child = {}) {
  if (child.formLabel || child.gradeLabel || child.form) return child.formLabel || child.gradeLabel || child.form;
  const years = Number(child.ageYears);
  if (!Number.isFinite(years)) return "Household Form";
  if (years <= 5)  return "Little Ones";
  if (years <= 8)  return "Form I";
  if (years <= 11) return "Form II";
  if (years <= 14) return "Form III";
  if (years <= 16) return "Form IV";
  return "Form V";
}

function groupChildRowsByForm(childRows = []) {
  const groups = new Map();
  childRows.forEach((row) => {
    const label = childFormLabel(row.child);
    if (!groups.has(label)) groups.set(label, { label, children: new Set(), details: [], minutes: 0 });
    const g = groups.get(label);
    if (row.child?.firstName) g.children.add(row.child.firstName);
    if (row.title) g.details.push(row.detail ? `${row.title}: ${row.detail}` : row.title);
    g.minutes += sumMinutes(row.minutes);
  });
  return Array.from(groups.values());
}

// ─── Template resolution ──────────────────────────────────────────────────────
function findTemplate(printCenter, templateId) {
  const requested = templateId === "weekly-pack" ? "print_mom_weekly" : templateId;
  return printCenter.templates.find((t) => t.id === requested)
    || printCenter.templates.find((t) => t.id === "print_mom_weekly")
    || printCenter.templates[0]
    || { id: "print_mom_weekly", title: "Weekly Household Plan", templateType: "weekly-household-plan" };
}

function templateWithParams(template, params = {}) {
  return { ...template,
    childId: params.childId || template.childId || "",
    termId:  params.termId  || template.termId  || "",
    month:   params.month   || template.month   || "",
    year:    params.year    || template.year    || "" };
}

function childForTemplate(printCenter, template) {
  if (template.child) return template.child;
  return printCenter.children.find((c) => c.id === template.childId) || null;
}

// ─── Section builders ─────────────────────────────────────────────────────────
function tableSection(heading, columns, rows, { flex } = {}) {
  return {
    type: "table", heading, columns,
    flex: flex || null,
    rows: rows.filter((row) => row.some((cell) => text(cell))),
  };
}

function listSection(heading, items) {
  const mapped = items
    .map((item) => typeof item === "string" ? { label: item, detail: "" } : item)
    .filter((item) => text(item.label || item.detail));
  if (!mapped.length) return null;
  return { type: "list", heading, items: mapped };
}

function cardsSection(heading, items) {
  const filtered = items.filter((item) => text(item.label || item.value || item.detail));
  if (!filtered.length) return null;
  return { type: "cards", heading, items: filtered };
}

function liturgicalSection(heading, days) {
  const filtered = (days || []).filter((d) => d && (d.title || d.date));
  if (!filtered.length) return null;
  return { type: "liturgical", heading, days: filtered };
}

function calendarGridSection(heading, days) {
  if (!days?.length) return null;
  return { type: "calendar-grid", heading, days };
}

// ─── Document shells ──────────────────────────────────────────────────────────
function baseDocument(printCenter, template, generatedAt) {
  const household = printCenter.household?.name || "Household";
  const term      = printCenter.term?.label || "Current Term";
  const week      = printCenter.week?.label || "";
  return {
    title:       text(template.title || "AGAPAY Learn Print Pack"),
    subtitle:    text(`${household} · ${term}${week ? " · " + week : ""}`),
    footerRole:  text(template.title || "Household Plan"),
    household:   text(household),
    generatedAt,
    templateId:  template.id,
    sections:    [],
    footerNote:  `${household} · Generated by AGAPAY Learn`,
  };
}

// ─── Document content builders ────────────────────────────────────────────────
function buildHouseholdWeekly(printCenter, template, generatedAt) {
  const doc  = baseDocument(printCenter, template, generatedAt);
  const week = printCenter.week || {};
  const formRows = groupChildRowsByForm(week.childRows || []);
  doc.sections = [
    tableSection("Family-Based Learning", ["Rhythm", "Notes", "Minutes"],
      (week.householdRows || []).map((row) => [row.title, row.detail, `${sumMinutes(row.minutes)}m`]),
      { flex: [2, 4, 1] }),
    tableSection("Form Plans", ["Form", "Children", "Assignments"],
      formRows.map((row) => [row.label, Array.from(row.children).join(", "), row.details.slice(0, 5).join("; ")]),
      { flex: [1.5, 1.5, 4] }),
    liturgicalSection("Liturgical Notes", (week.liturgicalDays || []).slice(0, 7)),
  ].filter(Boolean);
  return doc;
}

function buildTermPlan(printCenter, template, generatedAt) {
  const doc   = baseDocument(printCenter, template, generatedAt);
  const setup = printCenter.termSetup || {};
  const activeTerm = (setup.termOptions || []).find((t) => t.id === setup.activeTermId) || {};
  doc.sections = [
    cardsSection("Current Term", [
      { label: "Term",      value: activeTerm.label || printCenter.term?.label || "Current Term", detail: printCenter.term?.week || "" },
      { label: "Calendar",  value: printCenter.calendarToggle?.label || "Orthodox Calendar", detail: printCenter.calendarToggle?.description || "" },
      { label: "Grace Mode", value: "Available", detail: "Use lighter weeks without losing the term rhythm." },
    ]),
    tableSection("Children and Forms", ["Child", "Form", "Age"],
      (printCenter.children || []).map((c) => [c.firstName || c.name, childFormLabel(c), c.ageYears ? `${c.ageYears}` : ""]),
      { flex: [2, 2, 1] }),
    tableSection("Term Options", ["Term", "Status", "Notes"],
      (setup.termOptions || []).map((t) => [t.label, t.id === setup.activeTermId ? "Current" : "Planned",
        t.startDate && t.endDate ? `${t.startDate} to ${t.endDate}` : "Set in Setup"]),
      { flex: [2, 1, 3] }),
  ].filter(Boolean);
  return doc;
}

function buildMonthCalendar(printCenter, template, generatedAt) {
  const doc   = baseDocument(printCenter, template, generatedAt);
  const month = printCenter.month || {};
  const days  = month.days || [];
  doc.title    = text(month.printableTitle || month.label || template.month || doc.title);
  doc.subtitle = text(`${printCenter.household?.name || "Household"} · ${month.label || "Month Calendar"} · ${printCenter.calendarToggle?.label || ""}`);
  doc.sections = [
    cardsSection("Month Summary", [
      { label: "Month",          value: month.label || "",           detail: "Household rhythm, feast markers, and fast-day notes." },
      { label: "Fast Days",      value: String(month.fastDays  || 0), detail: "Shown in the calendar cells and detailed below." },
      { label: "Feast Markers",  value: String(month.feastDays || 0), detail: "Liturgical rhythm from the selected Orthodox calendar." },
      { label: "Calendar",       value: printCenter.calendarToggle?.label || "Orthodox Calendar", detail: printCenter.calendarToggle?.description || "" },
    ]),
    calendarGridSection("Month Calendar", days.filter((d) => d?.inMonth !== undefined)),
    listSection("Fast-Day Details",
      days.filter((d) => d?.inMonth && d?.isFastDay).map((d) => ({
        label:  `${d.civilDate} · ${d.fastingType || d.fastingRule || "Fast"}`,
        detail: [d.feastTitle, d.oldStyleDateLabel].filter(Boolean).join(" · "),
      }))),
  ].filter(Boolean);
  return doc;
}

function buildChildWeekly(printCenter, template, generatedAt) {
  const doc   = baseDocument(printCenter, template, generatedAt);
  const child = childForTemplate(printCenter, template);
  const rows  = (printCenter.week?.childRows || []).filter((row) => !child?.id || row.childId === child.id);
  doc.title      = text(`${child?.firstName || "Child"}'s Weekly Sheet`);
  doc.footerRole = doc.title;
  doc.sections = [
    cardsSection("Student", [
      { label: "Name", value: child?.firstName || "Student", detail: childFormLabel(child || {}) },
      { label: "Week", value: printCenter.week?.label || "Current Week", detail: printCenter.term?.label || "" },
    ]),
    tableSection("Assignments", ["Subject", "Assignment", "Minutes"],
      rows.map((row) => [row.title, row.detail, `${sumMinutes(row.minutes)}m`]),
      { flex: [2, 4, 1] }),
    { type: "checkboxes", heading: "Daily Checklist",
      subjects: rows.map((row) => text(row.title)).filter(Boolean),
      days: ["Mon", "Tue", "Wed", "Thu", "Fri"] },
    listSection("Parent Notes", ["Narration:", "Copywork:", "Prayer and habit notes:"]),
  ].filter(Boolean);
  return doc;
}

function buildChildTerm(printCenter, template, generatedAt) {
  const doc = buildChildWeekly(printCenter, template, generatedAt);
  doc.title = text(`${childForTemplate(printCenter, template)?.firstName || "Child"}'s Term Plan`);
  doc.footerRole = doc.title;
  const termSections = buildTermPlan(printCenter, template, generatedAt).sections || [];
  doc.sections = [...termSections, ...(doc.sections || []).slice(1, 3)];
  return doc;
}

export function buildWeeklyHouseholdPrintDocument({ household, week, calendarToggle }) {
  return buildHouseholdWeekly(
    { household, week, calendarToggle, term: { label: week?.termLabel || "Current Term" }, templates: [] },
    { id: "print_mom_weekly", title: "Weekly Household Plan" },
    new Date().toISOString()
  );
}

export function buildLearnPrintDocument(printCenter, {
  templateId = "print_mom_weekly", childId = "", termId = "", month = "", year = "",
  generatedAt = new Date().toISOString()
} = {}) {
  const template = templateWithParams(findTemplate(printCenter, templateId), { childId, termId, month, year });
  const type     = template.templateType || "weekly-household-plan";
  if (type === "term-plan"                 || template.id === "print_mom_term")      return buildTermPlan(printCenter, template, generatedAt);
  if (type === "month-calendar"            || template.id === "print_mom_month")     return buildMonthCalendar(printCenter, template, generatedAt);
  if (type === "liturgical-school-calendar"|| template.id === "print_mom_liturgical") return buildMonthCalendar(printCenter, template, generatedAt);
  if (type === "child-weekly-assignment")                                             return buildChildWeekly(printCenter, template, generatedAt);
  if (type === "child-term-plan")                                                     return buildChildTerm(printCenter, template, generatedAt);
  return buildHouseholdWeekly(printCenter, template, generatedAt);
}

export function buildLearnReportPrintDocument(reports, {
  templateId = "year-end-report", label = "", generatedAt = new Date().toISOString()
} = {}) {
  const normalized = text(templateId || label || "year-end-report").toLowerCase();
  const title = normalized.includes("transcript")
    ? "Academic Transcript"
    : normalized.includes("report-card") || normalized.includes("report card")
      ? "Term Report Card"
      : normalized.includes("subject")
        ? "Subject Progress Report"
        : label || "Year-End Report";
  const doc = {
    title, footerRole: title,
    subtitle:     text(`${reports.household?.name || "Household"} · ${reports.schoolYear?.label || reports.term?.label || "School Year"}`),
    household:    text(reports.household?.name || "Household"),
    generatedAt, templateId,
    footerNote:   `${reports.household?.name || "Household"} · Generated by AGAPAY Learn`,
    sections:     [],
  };

  const childRows    = (reports.children || []).map((c) => [c.firstName || c.name, childFormLabel(c), c.ageYears ? `Age ${c.ageYears}` : "", c.summary || ""]);
  const progressRows = (reports.subjectProgress || []).map((r) => [r.subjectTitle, r.childName, r.formLabel, `${r.completed} / ${r.total} ${r.progressionType || "units"}`, `${r.percent}%`, r.status]);
  const narrationRows = (reports.narrationLogs || []).slice(0, 24).map((e) => [e.date, e.child?.firstName || e.childName || e.childId || "", e.source, e.narrationType || e.type || "", e.note]);

  if (normalized.includes("transcript")) {
    doc.sections = [
      tableSection("Transcripts", ["Student", "Grade Span", "Credits", "Status"],
        (reports.transcripts || []).map((t) => [t.child?.firstName || t.childId || "", t.gradeSpan || "", t.credits || "", t.status || ""]),
        { flex: [2, 2, 1, 1] }),
      tableSection("Transcript Records", ["Subject", "Mark", "Model"],
        (reports.transcripts || []).flatMap((t) => (t.records || []).map((r) => [r.subject, r.mark, r.evaluationModel])),
        { flex: [3, 1, 2] }),
    ].filter(Boolean);
    return doc;
  }

  if (normalized.includes("report-card") || normalized.includes("report card")) {
    doc.sections = [
      tableSection("Report Cards", ["Student", "Summary", "Status"],
        (reports.reportCards || []).map((r) => [r.child?.firstName || r.childId || "", r.summary || "", r.status || ""]),
        { flex: [1.5, 5, 1.5] }),
      tableSection("Evaluation Records", ["Subject", "Mark", "Narrative"],
        (reports.reportCards || []).flatMap((r) => (r.records || []).map((rec) => [rec.subject, rec.mark, rec.narrativeSummary])),
        { flex: [2, 1, 4] }),
    ].filter(Boolean);
    return doc;
  }

  doc.sections = [
    cardsSection("Summary", [
      { label: "School Year", value: reports.schoolYear?.label || "", detail: reports.term?.label || "" },
      { label: "Lessons",     value: `${reports.weeklySummary?.lessonsCompleted || 0} / ${reports.weeklySummary?.lessonsPlanned || 0}`, detail: "Tracked weekly progress" },
      { label: "Children",    value: String((reports.children || []).length), detail: "Students in this household" },
    ]),
    tableSection("Student Overview", ["Student", "Form", "Age", "Notes"], childRows, { flex: [2, 1.5, 1, 3] }),
    tableSection("Subject Progress", ["Subject", "Student", "Form", "Progress", "Complete", "Status"], progressRows, { flex: [2.5, 1.5, 1, 2, 1, 1] }),
    tableSection("Narration Log",    ["Date", "Student", "Source", "Type", "Note"], narrationRows, { flex: [1.5, 1.5, 2, 1.5, 4] }),
  ].filter(Boolean);
  return doc;
}

export function buildPrintJobRequest({ templateId, format = "pdf", rangeLabel = "", requestedBy = "household" }) {
  return { templateId, format, rangeLabel, requestedBy, status: "ready", createdAt: new Date().toISOString() };
}

export function printDocumentFilename(document) {
  return `${text(document.title || "agapay-learn-print").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "agapay-learn-print"}.pdf`;
}

// ─── PDF drawing primitives ───────────────────────────────────────────────────
function wrapText(value, font, fontSize, maxWidth) {
  const words = text(value).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, fontSize) <= maxWidth || !line) {
      line = next;
    } else {
      lines.push(line);
      line = word;
    }
  });
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function drawTextLines(page, lines, x, y, { font, size, color, leading = size + 4 }) {
  lines.forEach((line, i) => page.drawText(line, { x, y: y - i * leading, size, font, color }));
  return y - lines.length * leading;
}

function fitPage(state, neededHeight) {
  if (state.y - neededHeight > MARGIN + 28) return;
  addPage(state);
}

// ─── Orthodox cross ornament ──────────────────────────────────────────────────
// An eight-pointed Orthodox cross drawn with pdf-lib primitives
function drawOrthCross(page, cx, cy, size, color) {
  const arm   = size * 0.42;
  const thick = size * 0.11;
  const slab  = size * 0.22; // cross-arm length at top & bottom
  // Vertical bar
  page.drawRectangle({ x: cx - thick / 2, y: cy - arm, width: thick, height: arm * 2, color });
  // Main horizontal bar
  page.drawRectangle({ x: cx - arm, y: cy - thick / 2, width: arm * 2, height: thick, color });
  // Titulus (top short bar)
  const titY = cy + arm * 0.52;
  page.drawRectangle({ x: cx - slab / 2, y: titY, width: slab, height: thick * 0.75, color });
  // Suppedaneum (bottom slanted bar — approximated as tilted rectangle via two triangles)
  const supY  = cy - arm * 0.50;
  const supW  = slab * 1.1;
  const supH  = thick * 0.75;
  page.drawRectangle({ x: cx - supW / 2, y: supY - supH / 2, width: supW, height: supH, color });
}

// ─── Page layout ──────────────────────────────────────────────────────────────
function addPage(state, sectionLabel) {
  const page = state.pdf.addPage(LETTER);
  // Full warm-paper background
  page.drawRectangle({ x: 0, y: 0, width: LETTER[0], height: LETTER[1], color: PAPER });
  // Navy header band
  page.drawRectangle({ x: 0, y: LETTER[1] - 72, width: LETTER[0], height: 72, color: NAVY });
  // Wordmark
  page.drawText("AGAPAY LEARN", { x: MARGIN, y: LETTER[1] - 30, size: 11, font: state.fonts.sansBold, color: GOLD });
  // Section label on continuation pages
  const secLabel = sectionLabel || state.currentSectionHeading || "Print Shop";
  page.drawText(text(secLabel), { x: MARGIN, y: LETTER[1] - 50, size: 8, font: state.fonts.sans, color: CREAM });
  // Small cross ornament top-right
  drawOrthCross(page, LETTER[0] - MARGIN - 10, LETTER[1] - 36, 28, GOLD_SOFT);
  // Gold rule under header
  page.drawLine({ start: { x: MARGIN, y: LETTER[1] - 80 }, end: { x: LETTER[0] - MARGIN, y: LETTER[1] - 80 }, thickness: 1, color: GOLD });
  state.page  = page;
  state.pages.push(page);
  state.y = LETTER[1] - 110;
}

// ─── Cover page ───────────────────────────────────────────────────────────────
function drawCoverPage(state, document) {
  const page = state.pdf.addPage(LETTER);
  const W = LETTER[0], H = LETTER[1];

  // Full navy background
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: NAVY });

  // Cream decorative border (inner frame)
  const bm = 36;
  page.drawRectangle({ x: bm, y: bm, width: W - bm * 2, height: H - bm * 2,
    borderColor: GOLD_SOFT, borderWidth: 1.2, color: NAVY });

  // Large centered cross
  drawOrthCross(page, W / 2, H - 160, 72, GOLD);

  // Product badge
  page.drawText("AGAPAY LEARN", { x: W / 2 - 52, y: H - 232, size: 10, font: state.fonts.sansBold, color: GOLD });
  page.drawText("Print Shop", {    x: W / 2 - 22, y: H - 248, size: 9,  font: state.fonts.sans,    color: CREAM });

  // Gold separator
  const sepW = 200;
  page.drawLine({ start: { x: W / 2 - sepW / 2, y: H - 268 }, end: { x: W / 2 + sepW / 2, y: H - 268 }, thickness: 0.8, color: GOLD });

  // Document title — Cormorant Garamond, large
  const titleFontSize = 36;
  const titleWords    = wrapText(document.title, state.fonts.serifBold, titleFontSize, W - 160).slice(0, 3);
  const titleBlockH   = titleWords.length * 40;
  const titleY        = H / 2 + titleBlockH / 2 + 30;
  titleWords.forEach((line, i) => {
    const lw = state.fonts.serifBold.widthOfTextAtSize(line, titleFontSize);
    page.drawText(line, { x: (W - lw) / 2, y: titleY - i * 42, size: titleFontSize, font: state.fonts.serifBold, color: CREAM });
  });

  // Subtitle
  const subFontSize = 11;
  const subLines    = wrapText(document.subtitle, state.fonts.sans, subFontSize, W - 160).slice(0, 2);
  subLines.forEach((line, i) => {
    const lw = state.fonts.sans.widthOfTextAtSize(line, subFontSize);
    page.drawText(line, { x: (W - lw) / 2, y: titleY - titleBlockH - 32 - i * 15, size: subFontSize, font: state.fonts.sans, color: GOLD_SOFT });
  });

  // Bottom household name block
  page.drawLine({ start: { x: W / 2 - sepW / 2, y: 130 }, end: { x: W / 2 + sepW / 2, y: 130 }, thickness: 0.6, color: GOLD });
  const hhLine = text(document.household || "Household");
  const hhW    = state.fonts.sansBold.widthOfTextAtSize(hhLine, 10);
  page.drawText(hhLine, { x: (W - hhW) / 2, y: 112, size: 10, font: state.fonts.sansBold, color: CREAM });
  const dateLine = `Generated ${document.generatedAt?.slice(0, 10) || ""}`;
  const dateW    = state.fonts.sans.widthOfTextAtSize(dateLine, 8);
  page.drawText(dateLine, { x: (W - dateW) / 2, y: 96, size: 8, font: state.fonts.sans, color: MUTED });

  state.pages.push(page);
}

// ─── Section-level heading ────────────────────────────────────────────────────
function drawHeading(state, heading) {
  fitPage(state, 44);
  state.currentSectionHeading = heading;
  const y = state.y;
  state.page.drawText(text(heading).toUpperCase(), { x: MARGIN, y, size: 9, font: state.fonts.sansBold, color: GOLD });
  state.y -= 14;
  state.page.drawLine({ start: { x: MARGIN, y: state.y }, end: { x: LETTER[0] - MARGIN, y: state.y }, thickness: 0.6, color: LINE });
  state.y -= 14;
}

// ─── Cards ────────────────────────────────────────────────────────────────────
function drawCards(state, section) {
  drawHeading(state, section.heading);
  const cardW = (LETTER[0] - MARGIN * 2 - 14) / 2;
  section.items.forEach((item, i) => {
    const x = MARGIN + (i % 2) * (cardW + 14);
    if (i % 2 === 0) fitPage(state, 78);
    const y = state.y;
    state.page.drawRectangle({ x, y: y - 60, width: cardW, height: 60, borderColor: LINE, borderWidth: 0.6, color: CREAM });
    // gold top accent strip
    state.page.drawRectangle({ x, y: y - 5, width: cardW, height: 5, color: GOLD_SOFT });
    state.page.drawText(text(item.label), { x: x + 10, y: y - 20, size: 8, font: state.fonts.sansBold, color: GOLD });
    state.page.drawText(text(item.value || ""), { x: x + 10, y: y - 36, size: 14, font: state.fonts.serifBold, color: NAVY });
    drawTextLines(state.page, wrapText(item.detail || "", state.fonts.sans, 7.5, cardW - 20).slice(0, 2),
      x + 10, y - 48, { font: state.fonts.sans, size: 7.5, color: MUTED, leading: 9 });
    if (i % 2 === 1 || i === section.items.length - 1) state.y -= 76;
  });
  state.y -= 8;
}

// ─── List ─────────────────────────────────────────────────────────────────────
function drawList(state, section) {
  drawHeading(state, section.heading);
  section.items.forEach((item) => {
    const combined = [item.label, item.detail].filter(Boolean).join(" · ");
    const lines    = wrapText(combined, state.fonts.sans, 9, LETTER[0] - MARGIN * 2 - 22);
    fitPage(state, lines.length * 12 + 12);
    // Gold bullet diamond
    state.page.drawText("◆", { x: MARGIN + 2, y: state.y, size: 6, font: state.fonts.sansBold, color: GOLD });
    state.y = drawTextLines(state.page, lines, MARGIN + 16, state.y,
      { font: state.fonts.sans, size: 9, color: INK, leading: 12 }) - 4;
  });
  state.y -= 8;
}

// ─── Table (with flex-width column allocation) ────────────────────────────────
function resolveColWidths(columns, flex) {
  const available = LETTER[0] - MARGIN * 2;
  if (flex && flex.length === columns.length) {
    const total = flex.reduce((a, b) => a + b, 0);
    return flex.map((f) => (f / total) * available);
  }
  // Legacy fallback
  if (columns.length === 3) return [130, 300, 80];
  if (columns.length === 4) return [70, 90, 170, 180];
  if (columns.length === 6) return columns.map((_, i) => i === 0 ? 150 : 72);
  return columns.map(() => available / columns.length);
}

function drawTable(state, section) {
  drawHeading(state, section.heading);
  const widths = resolveColWidths(section.columns, section.flex);

  const drawHeader = () => {
    fitPage(state, 32);
    let x = MARGIN;
    state.page.drawRectangle({ x: MARGIN, y: state.y - 20, width: LETTER[0] - MARGIN * 2, height: 24, color: NAVY_SOFT });
    section.columns.forEach((col, i) => {
      state.page.drawText(text(col), { x: x + 5, y: state.y - 12, size: 7, font: state.fonts.sansBold, color: CREAM });
      x += widths[i];
    });
    state.y -= 28;
  };

  drawHeader();
  section.rows.forEach((row, rowIdx) => {
    const wrapped    = row.map((cell, i) => wrapText(cell, state.fonts.sans, 8, widths[i] - 10).slice(0, 4));
    const rowHeight  = Math.max(22, Math.max(...wrapped.map((ls) => ls.length)) * 10 + 8);
    if (state.y - rowHeight < MARGIN + 32) { addPage(state, section.heading); drawHeader(); }
    const rowBg = rowIdx % 2 === 0 ? rgb(1, 1, 0.98) : PAPER;
    let x = MARGIN;
    state.page.drawRectangle({ x: MARGIN, y: state.y - rowHeight + 4, width: LETTER[0] - MARGIN * 2, height: rowHeight,
      borderColor: LINE, borderWidth: 0.35, color: rowBg });
    wrapped.forEach((lines, i) => {
      drawTextLines(state.page, lines, x + 5, state.y - 7, { font: state.fonts.sans, size: 8, color: INK, leading: 10 });
      x += widths[i];
    });
    state.y -= rowHeight;
  });
  state.y -= 12;
}

// ─── Checkbox grid ────────────────────────────────────────────────────────────
function drawCheckboxes(state, section) {
  drawHeading(state, section.heading);
  const days     = section.days || [];
  const subjects = section.subjects || [];
  const colW     = 52;
  const labelW   = LETTER[0] - MARGIN * 2 - days.length * colW;
  const rowH     = 22;

  // Header row
  fitPage(state, rowH + 4);
  state.page.drawRectangle({ x: MARGIN, y: state.y - rowH, width: LETTER[0] - MARGIN * 2, height: rowH, color: NAVY_SOFT });
  days.forEach((day, i) => {
    state.page.drawText(day, {
      x: MARGIN + labelW + i * colW + (colW - state.fonts.sansBold.widthOfTextAtSize(day, 8)) / 2,
      y: state.y - 12, size: 8, font: state.fonts.sansBold, color: CREAM,
    });
  });
  state.y -= rowH + 2;

  subjects.forEach((subject, si) => {
    fitPage(state, rowH + 2);
    const rowBg = si % 2 === 0 ? rgb(1, 1, 0.98) : PAPER;
    state.page.drawRectangle({ x: MARGIN, y: state.y - rowH + 2, width: LETTER[0] - MARGIN * 2, height: rowH,
      borderColor: LINE, borderWidth: 0.3, color: rowBg });
    state.page.drawText(subject, { x: MARGIN + 6, y: state.y - 11, size: 8.5, font: state.fonts.sans, color: INK });
    days.forEach((_, i) => {
      const cx = MARGIN + labelW + i * colW + (colW - 11) / 2;
      const cy = state.y - rowH + 5;
      // Actual drawn checkbox rectangle
      state.page.drawRectangle({ x: cx, y: cy, width: 11, height: 11,
        borderColor: GOLD, borderWidth: 0.9, color: CREAM });
    });
    state.y -= rowH;
  });
  state.y -= 10;
}

// ─── Liturgical strip ─────────────────────────────────────────────────────────
function drawLiturgicalStrip(state, section) {
  drawHeading(state, section.heading);
  const days  = (section.days || []).slice(0, 7);
  const tileW = Math.floor((LETTER[0] - MARGIN * 2) / 7);
  const tileH = 72;

  fitPage(state, tileH + 16);

  days.forEach((day, i) => {
    const x      = MARGIN + i * tileW;
    const y      = state.y;
    const isFast = day.isFastDay || day.fastingRule;
    const isFeast = !isFast && (day.title || day.feastTitle);
    const bgCol  = isFast ? FAST_BG : (isFeast ? FEAST_BG : CREAM);
    const accent = isFast ? BURGUNDY : GOLD;

    // Tile background
    state.page.drawRectangle({ x, y: y - tileH, width: tileW - 2, height: tileH,
      borderColor: LINE, borderWidth: 0.5, color: bgCol });
    // Accent top band
    state.page.drawRectangle({ x, y: y - 5, width: tileW - 2, height: 5, color: accent });

    // Weekday label
    const wday = text(day.weekday || "").slice(0, 3);
    state.page.drawText(wday, { x: x + 4, y: y - 18, size: 7, font: state.fonts.sansBold, color: accent });
    // Day number
    const dayNum = text(day.date || day.dayNumber || "");
    state.page.drawText(dayNum, { x: x + 4, y: y - 30, size: 14, font: state.fonts.serifBold, color: NAVY });
    // Feast/fast label — wrap tightly
    const label  = text(day.title || day.feastTitle || (isFast ? day.fastingType || "Fast" : ""));
    const labelLines = wrapText(label, state.fonts.sans, 6.5, tileW - 10).slice(0, 3);
    labelLines.forEach((line, li) => {
      state.page.drawText(line, { x: x + 4, y: y - 45 - li * 9, size: 6.5, font: state.fonts.sans,
        color: isFast ? BURGUNDY : INK });
    });
  });
  state.y -= tileH + 14;
}

// ─── Calendar grid ────────────────────────────────────────────────────────────
function drawCalendarGrid(state, section) {
  drawHeading(state, section.heading);
  const days    = section.days || [];
  const tileW   = Math.floor((LETTER[0] - MARGIN * 2) / 7);
  const tileH   = 66;

  // Day-of-week header
  fitPage(state, 20);
  DAYS.forEach((d, i) => {
    const x = MARGIN + i * tileW;
    state.page.drawRectangle({ x, y: state.y - 18, width: tileW - 1, height: 20, color: NAVY_SOFT });
    state.page.drawText(d, { x: x + (tileW - 1 - state.fonts.sansBold.widthOfTextAtSize(d, 8)) / 2,
      y: state.y - 12, size: 8, font: state.fonts.sansBold, color: CREAM });
  });
  state.y -= 24;

  // Weeks (7 days per row)
  for (let wi = 0; wi < days.length; wi += 7) {
    const week = days.slice(wi, wi + 7);
    fitPage(state, tileH + 2);
    week.forEach((day, di) => {
      if (!day) return;
      const x       = MARGIN + di * tileW;
      const y       = state.y;
      const inMonth = day.inMonth !== false;
      const isFast  = inMonth && day.isFastDay;
      const isFeast = inMonth && !isFast && (day.feastTitle || day.feastMarker);
      const bgCol   = !inMonth ? rgb(0.94, 0.93, 0.90) : isFast ? FAST_BG : isFeast ? FEAST_BG : CREAM;
      const numCol  = !inMonth ? MUTED : isFast ? BURGUNDY : NAVY;

      state.page.drawRectangle({ x, y: y - tileH, width: tileW - 1, height: tileH,
        borderColor: LINE, borderWidth: 0.35, color: bgCol });
      // Day number
      state.page.drawText(text(day.dayNumber || ""), { x: x + 4, y: y - 14, size: 13, font: state.fonts.serifBold, color: numCol });
      // Old-style date (e.g. "12/25") — small, top right
      if (day.oldStyleDateLabel && inMonth) {
        const osText = text(day.oldStyleDateLabel);
        const osW    = state.fonts.sans.widthOfTextAtSize(osText, 6);
        state.page.drawText(osText, { x: x + tileW - osW - 5, y: y - 14, size: 6, font: state.fonts.sans, color: MUTED });
      }
      // Feast title
      if (isFeast || isFast) {
        const label = text(day.feastTitle || day.fastingType || day.fastingRule || "Fast");
        const lLines = wrapText(label, state.fonts.sans, 6, tileW - 10).slice(0, 2);
        lLines.forEach((line, li) => {
          state.page.drawText(line, { x: x + 4, y: y - 28 - li * 8, size: 6, font: state.fonts.sans,
            color: isFast ? BURGUNDY : GOLD });
        });
      }
      // Plan preview
      const planItems = [...(day.householdPlan || []), ...(day.formPlan || [])].slice(0, 2).map((p) => p.title);
      planItems.forEach((item, pi) => {
        const planLine = wrapText(item, state.fonts.sans, 6, tileW - 10)[0] || "";
        state.page.drawText(planLine, { x: x + 4, y: y - 44 - pi * 9, size: 6, font: state.fonts.sans, color: MUTED });
      });
    });
    state.y -= tileH + 1;
  }
  state.y -= 10;
}

// ─── Section dispatcher ───────────────────────────────────────────────────────
function drawSection(state, section) {
  if (!section) return;
  if (section.type === "cards")         return drawCards(state, section);
  if (section.type === "table")         return drawTable(state, section);
  if (section.type === "checkboxes")    return drawCheckboxes(state, section);
  if (section.type === "liturgical")    return drawLiturgicalStrip(state, section);
  if (section.type === "calendar-grid") return drawCalendarGrid(state, section);
  return drawList(state, section);
}

// ─── Main renderer ────────────────────────────────────────────────────────────
export async function renderPrintDocumentPdf(document) {
  const pdf   = await PDFDocument.create();
  const fonts = await embedFonts(pdf);
  const state = { pdf, fonts, pages: [], page: null, y: 0, currentSectionHeading: "" };

  // Cover page
  drawCoverPage(state, document);

  // First content page
  addPage(state);

  // Content title block (below the header band on page 1)
  const titleLines = wrapText(document.title, fonts.serifBold, 26, LETTER[0] - MARGIN * 2);
  state.y = drawTextLines(state.page, titleLines, MARGIN, state.y,
    { font: fonts.serifBold, size: 26, color: NAVY, leading: 30 });
  state.y = drawTextLines(state.page, wrapText(document.subtitle, fonts.sans, 9.5, LETTER[0] - MARGIN * 2),
    MARGIN, state.y - 4, { font: fonts.sans, size: 9.5, color: MUTED, leading: 13 }) - 16;
  state.page.drawLine({
    start: { x: MARGIN, y: state.y + 6 }, end: { x: LETTER[0] - MARGIN, y: state.y + 6 },
    thickness: 1, color: GOLD_SOFT,
  });
  state.y -= 10;

  // Sections
  document.sections.forEach((section) => drawSection(state, section));

  // Footer on every content page (skip cover — index 0)
  const contentPages = state.pages.slice(1);
  contentPages.forEach((page, idx) => {
    page.drawLine({ start: { x: MARGIN, y: 36 }, end: { x: LETTER[0] - MARGIN, y: 36 }, thickness: 0.5, color: LINE });
    page.drawText(text(document.footerNote || "Generated by AGAPAY Learn"),
      { x: MARGIN, y: 20, size: 7.5, font: fonts.sans, color: MUTED });
    page.drawText(`Page ${idx + 1} of ${contentPages.length}`,
      { x: LETTER[0] - MARGIN - 54, y: 20, size: 7.5, font: fonts.sans, color: MUTED });
  });

  return pdf.save();
}
