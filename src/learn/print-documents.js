import { PDFDocument, StandardFonts, rgb, LineCapStyle } from "pdf-lib";

// AGAPAY Learn renders print-shop PDFs server-side in the Cloudflare Worker.
// pdf-lib is pure JavaScript and Worker-compatible, so we avoid Puppeteer,
// Chromium, nodejs_compat, and browser print hacks. This is the intentional
// first dependency added to support real PDF generation.

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LETTER = [612, 792];
const LANDSCAPE = [792, 612];
const MARGIN = 46;
const FORM_ORDER = ["Little Ones", "Form I", "Form II", "Form III", "Form IV"];
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

async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed: ${url}`);
  return res.arrayBuffer();
}
const fetchFont = fetchBytes; // alias kept for embedFonts

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

function cleanDesignedAssignment(item = {}) {
  return {
    title: text(item.title || "Subject"),
    sub: text(item.sub || ""),
    note: text(item.note || ""),
    color: text(item.color || ""),
    kind: text(item.kind || ""),
    formLabels: Array.isArray(item.formLabels) ? item.formLabels.map(text).filter(Boolean) : []
  };
}

function sortFormLabels(labels = []) {
  return [...new Set(labels.map(text).filter((label) => label && label !== "__family"))].sort((a, b) => {
    const ai = FORM_ORDER.indexOf(a);
    const bi = FORM_ORDER.indexOf(b);
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    return a.localeCompare(b);
  });
}

function designedWeekForms(designedWeek, days, unassigned) {
  const explicitForms = sortFormLabels(Array.isArray(designedWeek.forms) ? designedWeek.forms : []);
  if (explicitForms.length) return explicitForms;
  const labels = [];
  days.forEach((day) => (day.assignments || []).forEach((item) => labels.push(...(item.formLabels || []))));
  unassigned.forEach((item) => labels.push(...(item.formLabels || [])));
  return sortFormLabels(labels).length ? sortFormLabels(labels) : ["Household"];
}

function designedAssignmentForForm(item, formLabel) {
  const labels = item.formLabels || [];
  if (!labels.length) return true;
  if (formLabel === "Household") return true;
  return labels.includes("__family") || labels.includes(formLabel);
}

function buildDesignedWeek(printCenter, designedWeek = {}, generatedAt) {
  const doc = baseDocument(printCenter, { id: "print_mom_weekly", title: "Designed Weekly Lesson Plan" }, generatedAt);
  const days = Array.isArray(designedWeek.days) ? designedWeek.days : [];
  const normalizedDays = days.slice(0, 7).map((day) => ({
    date: text(day.date || ""),
    weekday: text(day.weekday || ""),
    shortDate: text(day.shortDate || ""),
    feast: text(day.feast || ""),
    isSunday: Boolean(day.isSunday),
    assignments: Array.isArray(day.assignments) ? day.assignments.map(cleanDesignedAssignment).filter((item) => item.title) : []
  }));
  const unassigned = Array.isArray(designedWeek.unassigned) ? designedWeek.unassigned.map(cleanDesignedAssignment).filter((item) => item.title) : [];
  const forms = designedWeekForms(designedWeek, normalizedDays, unassigned);
  doc.layout = "designed-week-forms-landscape";
  doc.designedForms = forms.map((label) => ({
    label,
    days: normalizedDays.map((day) => ({
      ...day,
      assignments: (day.assignments || []).filter((item) => designedAssignmentForForm(item, label))
    })),
    unassigned: unassigned.filter((item) => designedAssignmentForForm(item, label))
  }));
  doc.title = "Designed Weekly Lesson Plan by Form";
  doc.subtitle = text(`${printCenter.household?.name || "Household"} · ${designedWeek.label || printCenter.week?.label || "Current Week"}${designedWeek.termLabel || printCenter.term?.label ? " · " + (designedWeek.termLabel || printCenter.term?.label) : ""}`);
  doc.footerRole = "Designed Week";
  doc.sections = [
    cardsSection("Week Summary", [
      { label: "Week", value: designedWeek.label || printCenter.week?.label || "Current Week", detail: "Personally arranged from the weekly planner." },
      { label: "Scheduled", value: String(normalizedDays.reduce((count, day) => count + day.assignments.length, 0)), detail: "Subject cards placed into days." },
      { label: "Unplaced", value: String(unassigned.length), detail: "Still waiting in the available-subject tray." }
    ]),
    { type: "designed-week", heading: "Mom's Designed Week", days: normalizedDays },
    unassigned.length ? listSection("Available Subjects Not Placed", unassigned.map((item) => ({ label: item.title, detail: item.note || item.sub }))) : null,
    liturgicalSection("Liturgical Notes", (printCenter.week?.liturgicalDays || []).slice(0, 7))
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

// ─── Planner document builders ────────────────────────────────────────────────
// Helpers shared across planner builders

const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function choresByAssignee(chores = [], children = []) {
  const people = [
    { name: "Everyone", color: "#102a4c" },
    ...children.filter((c) => c.firstName || c.name).map((c) => ({ name: c.firstName || c.name, color: c.color || "#34507a" })),
  ];
  const map = new Map(people.map((p) => [p.name, { ...p, byDay: new Map() }]));
  chores.forEach((chore) => {
    const assignee = chore.assignee || "Everyone";
    if (!map.has(assignee)) map.set(assignee, { name: assignee, color: "#34507a", byDay: new Map() });
    const day = chore.day || ""; // day is the full weekday name e.g. "Monday"
    const key = day || "Any Day";
    const bucket = map.get(assignee).byDay;
    if (!bucket.has(key)) bucket.set(key, []);
    bucket.get(key).push(chore);
  });
  return Array.from(map.values()).filter((p) => p.byDay.size > 0 || p.name === "Everyone");
}

function buildChorePlanWeek(printCenter, template, generatedAt) {
  const doc      = baseDocument(printCenter, template, generatedAt);
  const chores   = printCenter.familyPlanning?.chores || [];
  const children = printCenter.children || [];
  const childId  = template.childId || "";

  if (childId) {
    // Child-specific weekly chore chart
    const child    = children.find((c) => c.id === childId) || {};
    const name     = child.firstName || child.name || "Child";
    const myChores = chores.filter((c) => (c.assignee || "Everyone") === name || (c.assignee || "Everyone") === "Everyone");
    doc.title      = text(`${name}'s Weekly Chores`);
    doc.footerRole = doc.title;
    doc.subtitle   = text(`${printCenter.household?.name || "Household"} · ${printCenter.week?.label || "Current Week"}`);
    doc.sections = [
      cardsSection("Student", [
        { label: "Name",  value: name,                             detail: childFormLabel(child) },
        { label: "Week",  value: printCenter.week?.label || "—",  detail: printCenter.term?.label || "" },
        { label: "Chores", value: String(myChores.length),        detail: `${myChores.filter((c) => c.completed).length} completed` },
      ]),
      tableSection("Chore Rotation", ["Chore", "Day", "Time", "Notes"],
        myChores.map((c) => [c.title, c.day || "Any Day", c.timeOfDay || "Anytime", c.notes || ""]),
        { flex: [3, 1.5, 1.5, 3] }),
      { type: "checkboxes", heading: "Weekly Checkoff",
        subjects: myChores.map((c) => text(c.title)).filter(Boolean),
        days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] },
    ].filter(Boolean);
    return doc;
  }

  // Household weekly chore chart — grouped by person, day columns
  const assigneeGroups = choresByAssignee(chores, children);
  const rows = assigneeGroups.flatMap((person) =>
    WEEKDAYS_LONG.map((day) => {
      const dayChores = (person.byDay.get(day) || []).concat(person.byDay.get("Any Day") || []);
      return [person.name, day, dayChores.map((c) => c.title).join("; ") || "—", dayChores.map((c) => c.timeOfDay || "").filter(Boolean).join("; ")];
    }).filter((row) => row[2] !== "—")
  );

  doc.sections = [
    cardsSection("Chore Summary", [
      { label: "Week",        value: printCenter.week?.label || "Current Week", detail: printCenter.term?.label || "" },
      { label: "Total Chores", value: String(chores.length),   detail: "Across all assignees" },
      { label: "Assigned",    value: String(new Set(chores.map((c) => c.assignee || "Everyone")).size), detail: "People with chores" },
    ]),
    rows.length
      ? tableSection("Weekly Chore Rotation", ["Person", "Day", "Chores", "Time"],
          rows, { flex: [2, 1.5, 4, 1.5] })
      : listSection("Chores", ["No chores have been set up yet. Add chores in the Family Planner."]),
  ].filter(Boolean);
  return doc;
}

function buildChorePlanDay(printCenter, template, generatedAt) {
  const doc    = baseDocument(printCenter, template, generatedAt);
  const chores = printCenter.familyPlanning?.chores || [];
  const today  = new Date().toISOString().slice(0, 10);
  const todayWeekday = WEEKDAYS_LONG[new Date(today + "T12:00:00Z").getUTCDay()];
  const todayChores  = chores.filter((c) => !c.day || c.day === todayWeekday || c.day === "");
  doc.title = "Daily Chore Chart";
  doc.subtitle = text(`${printCenter.household?.name || "Household"} · ${todayWeekday}`);
  doc.sections = [
    cardsSection("Today", [
      { label: "Day",    value: todayWeekday,           detail: today },
      { label: "Chores", value: String(todayChores.length), detail: "Due today (including unscheduled)" },
    ]),
    tableSection("Today's Chores", ["Chore", "Assigned To", "Time", "Notes"],
      todayChores.length
        ? todayChores.map((c) => [c.title, c.assignee || "Everyone", c.timeOfDay || "Anytime", c.notes || ""])
        : [["No chores set for today.", "", "", ""]],
      { flex: [3, 2, 1.5, 2.5] }),
    { type: "checkboxes", heading: "Checkoff",
      subjects: todayChores.map((c) => `${text(c.title)} (${c.assignee || "Everyone"})`).filter(Boolean),
      days: ["Done"] },
  ].filter(Boolean);
  return doc;
}

function buildChorePlanMonth(printCenter, template, generatedAt) {
  const doc    = baseDocument(printCenter, template, generatedAt);
  const chores = printCenter.familyPlanning?.chores || [];
  const byDay  = new Map();
  chores.forEach((c) => {
    const key = c.day || "Any Day";
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(c);
  });
  const rows = [...WEEKDAYS_LONG, "Any Day"]
    .filter((d) => byDay.has(d))
    .flatMap((day) => byDay.get(day).map((c) => [day, c.title, c.assignee || "Everyone", c.timeOfDay || "Anytime", c.notes || ""]));
  doc.title = "Monthly Chore Chart";
  doc.subtitle = text(`${printCenter.household?.name || "Household"} · ${printCenter.month?.label || printCenter.term?.label || "Current Month"}`);
  doc.sections = [
    cardsSection("Chore Overview", [
      { label: "Month",  value: printCenter.month?.label || "Current",   detail: "Recurring chore rotation" },
      { label: "Chores", value: String(chores.length),                   detail: `${new Set(chores.map((c) => c.assignee || "Everyone")).size} people assigned` },
    ]),
    rows.length
      ? tableSection("Chore Rotation", ["Day", "Chore", "Assigned To", "Time", "Notes"],
          rows, { flex: [1.5, 3, 2, 1.5, 2] })
      : listSection("Chores", ["No chores have been set up yet. Add chores in the Family Planner."]),
  ].filter(Boolean);
  return doc;
}

function buildMealPlanWeek(printCenter, template, generatedAt) {
  const doc    = baseDocument(printCenter, template, generatedAt);
  const meals  = printCenter.familyPlanning?.meals || [];
  const days   = printCenter.week?.familyDays || printCenter.week?.dates?.map((d) => ({ civilDate: d })) || [];
  const mealByDate = new Map(meals.map((m) => [m.date, m]));
  const rows = days.map((day) => {
    const m = mealByDate.get(day.civilDate) || {};
    const fasting = day.isFastDay ? (day.fastingType || day.fastingRule || "Fast") : "";
    return [
      text(day.weekdayLabel || day.civilDate || ""),
      text(day.feastTitle || ""),
      fasting,
      text(m.breakfast || m.lunch || ""),
      text(m.dinner || ""),
    ];
  }).filter((row) => row[0]);
  doc.sections = [
    cardsSection("Week Summary", [
      { label: "Week",       value: printCenter.week?.label || "Current Week", detail: printCenter.term?.label || "" },
      { label: "Fast Days",  value: String(days.filter((d) => d.isFastDay).length), detail: "Days with fasting guidance" },
      { label: "Calendar",   value: printCenter.calendarToggle?.label || "Orthodox Calendar", detail: "" },
    ]),
    tableSection("Weekly Meals", ["Day", "Feast/Fast", "Fasting Rule", "Lunch", "Dinner"],
      rows, { flex: [1.5, 2.5, 2, 2.5, 2.5] }),
  ].filter(Boolean);
  return doc;
}

function buildMealPlanMonth(printCenter, template, generatedAt) {
  const doc   = baseDocument(printCenter, template, generatedAt);
  const meals = printCenter.familyPlanning?.meals || [];
  const mealByDate = new Map(meals.map((m) => [m.date, m]));
  const days  = (printCenter.month?.days || []).filter((d) => d?.inMonth);
  const rows  = days.map((day) => {
    const m = mealByDate.get(day.civilDate) || {};
    return [
      String(day.dayNumber || ""),
      text(day.feastTitle || ""),
      day.isFastDay ? text(day.fastingType || day.fastingRule || "Fast") : "",
      text(m.breakfast || m.lunch || ""),
      text(m.dinner || ""),
    ];
  }).filter((row) => row[0]);
  doc.title    = text(printCenter.month?.label ? `${printCenter.month.label} Meal Plan` : "Monthly Meal Plan");
  doc.subtitle = text(`${printCenter.household?.name || "Household"} · ${printCenter.calendarToggle?.label || "Orthodox Calendar"}`);
  doc.sections = [
    cardsSection("Month Summary", [
      { label: "Month",      value: printCenter.month?.label || "Current", detail: "Meals beside the Orthodox calendar" },
      { label: "Fast Days",  value: String(printCenter.month?.fastDays || 0), detail: "Days with fasting guidance" },
      { label: "Feast Days", value: String(printCenter.month?.feastDays || 0), detail: "Major liturgical markers" },
    ]),
    tableSection("Monthly Meals", ["Date", "Feast", "Fasting", "Lunch/Breakfast", "Dinner"],
      rows, { flex: [0.8, 2.5, 2, 2.5, 2.5] }),
  ].filter(Boolean);
  return doc;
}

function buildEventsPlanMonth(printCenter, template, generatedAt) {
  const doc    = baseDocument(printCenter, template, generatedAt);
  const events = printCenter.familyPlanning?.events || [];
  const nameDays = printCenter.familyPlanning?.nameDays || [];
  const eventsByDate = new Map();
  events.forEach((e) => {
    if (!eventsByDate.has(e.date)) eventsByDate.set(e.date, []);
    eventsByDate.get(e.date).push(e);
  });
  const days  = (printCenter.month?.days || []).filter((d) => d?.inMonth);
  const rows  = days
    .filter((day) => eventsByDate.has(day.civilDate) || day.nameDays?.length || day.isFastDay || day.feastTitle)
    .map((day) => {
      const dayEvents = eventsByDate.get(day.civilDate) || [];
      const feast     = text(day.feastTitle || "");
      const fasting   = day.isFastDay ? text(day.fastingType || "Fast") : "";
      const evtStr    = dayEvents.map((e) => `${e.startTime ? e.startTime + " " : ""}${e.title}`).join("; ");
      return [String(day.dayNumber || ""), text(day.weekdayLabel || ""), feast, fasting, text(evtStr)];
    });
  doc.title    = text(printCenter.month?.label ? `${printCenter.month.label} Events` : "Monthly Events Chart");
  doc.subtitle = text(`${printCenter.household?.name || "Household"} · ${printCenter.calendarToggle?.label || "Orthodox Calendar"}`);
  doc.sections = [
    cardsSection("Month Overview", [
      { label: "Month",      value: printCenter.month?.label || "Current", detail: "Appointments, feast days, and family events" },
      { label: "Events",     value: String(events.length),                 detail: "Household events and appointments" },
      { label: "Fast Days",  value: String(printCenter.month?.fastDays || 0), detail: "Fasting days this month" },
    ]),
    rows.length
      ? tableSection("Month Events & Calendar", ["Date", "Day", "Feast", "Fasting", "Events"],
          rows, { flex: [0.8, 1.2, 2.5, 2, 4] })
      : listSection("Events", ["No events have been added yet. Add events in the Family Planner."]),
  ].filter(Boolean);
  return doc;
}

function buildRecipeCollection(printCenter, template, generatedAt) {
  const doc     = baseDocument(printCenter, template, generatedAt);
  const recipes = printCenter.familyPlanning?.recipes || printCenter.week?.recipes || [];
  doc.title = "Recipe Collection";
  doc.subtitle = text(`${printCenter.household?.name || "Household"} · Fasting-Aware Family Recipes`);
  doc.sections = [
    cardsSection("Recipe Library", [
      { label: "Recipes",    value: String(recipes.length),                                detail: "Saved family recipes" },
      { label: "Fasting Fit", value: String(recipes.filter((r) => r.fastingType && r.fastingType !== "free").length), detail: "Fasting-compatible recipes" },
    ]),
    tableSection("Recipes", ["Recipe", "Fasting Fit", "Category", "Source"],
      recipes.map((r) => [r.title, r.fastingType || "Any day", r.category || "", r.sourceUrl || ""]),
      { flex: [4, 2, 2, 3] }),
  ].filter(Boolean);
  return doc;
}

function buildGroceryListWeek(printCenter, template, generatedAt) {
  const doc    = baseDocument(printCenter, template, generatedAt);
  const items  = printCenter.familyPlanning?.groceryItems || printCenter.week?.groceryItems || [];
  doc.title    = "Weekly Grocery List";
  doc.subtitle = text(`${printCenter.household?.name || "Household"} · ${printCenter.week?.label || "Current Week"}`);
  const byCategory = new Map();
  items.forEach((item) => {
    const cat = text(item.category || item.aisle || "General");
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat).push(item);
  });
  const rows = Array.from(byCategory.entries()).flatMap(([cat, catItems]) =>
    catItems.map((item) => [cat, text(item.name || item.title || ""), text(item.quantity || ""), text(item.notes || "")])
  );
  doc.sections = [
    cardsSection("List Summary", [
      { label: "Week",   value: printCenter.week?.label || "Current Week", detail: printCenter.term?.label || "" },
      { label: "Items",  value: String(items.length), detail: `${byCategory.size} categories` },
    ]),
    rows.length
      ? tableSection("Grocery List", ["Category", "Item", "Qty", "Notes"],
          rows, { flex: [2, 4, 1, 3] })
      : listSection("Items", ["No grocery items yet. Add items in the Family Planner."]),
  ].filter(Boolean);
  return doc;
}

// ─── Planner lesson builders ──────────────────────────────────────────────────
function buildPlannerLessonWeekForm(printCenter, template, generatedAt) {
  const doc      = baseDocument(printCenter, template, generatedAt);
  const formRows = groupChildRowsByForm(printCenter.week?.childRows || []);
  doc.sections = [
    cardsSection("Week", [
      { label: "Week",   value: printCenter.week?.label || "Current Week", detail: printCenter.term?.label || "" },
      { label: "Forms",  value: String(formRows.length), detail: "Active forms this week" },
    ]),
    tableSection("Family-Based Learning", ["Rhythm", "Notes", "Min"],
      (printCenter.week?.householdRows || []).map((r) => [r.title, r.detail, `${sumMinutes(r.minutes)}m`]),
      { flex: [2.5, 4, 1] }),
    tableSection("Form Plans", ["Form", "Children", "Assignments"],
      formRows.map((r) => [r.label, Array.from(r.children).join(", "), r.details.slice(0, 5).join("; ")]),
      { flex: [1.5, 2, 5] }),
  ].filter(Boolean);
  return doc;
}

function buildPlannerLessonMonthForm(printCenter, template, generatedAt) {
  const doc = buildMonthCalendar(printCenter, template, generatedAt);
  doc.title = text(printCenter.month?.label ? `${printCenter.month.label} Lesson Plans` : "Monthly Lesson Plans by Form");
  return doc;
}

function buildPlannerLessonTermForm(printCenter, template, generatedAt) {
  return buildTermPlan(printCenter, template, generatedAt);
}

function buildPlannerLessonWeekChild(printCenter, template, generatedAt) {
  return buildChildWeekly(printCenter, template, generatedAt);
}

function buildPlannerLessonMonthChild(printCenter, template, generatedAt) {
  const doc   = buildMonthCalendar(printCenter, template, generatedAt);
  const child = childForTemplate(printCenter, template);
  const name  = child?.firstName || "Child";
  doc.title   = text(`${name}'s Monthly Lessons`);
  doc.footerRole = doc.title;
  return doc;
}

function buildPlannerLessonTermChild(printCenter, template, generatedAt) {
  return buildChildTerm(printCenter, template, generatedAt);
}

export function buildLearnPrintDocument(printCenter, {
  templateId = "print_mom_weekly", childId = "", termId = "", month = "", year = "",
  generatedAt = new Date().toISOString(), designedWeek = null
} = {}) {
  if (designedWeek && typeof designedWeek === "object") return buildDesignedWeek(printCenter, designedWeek, generatedAt);
  const template = templateWithParams(findTemplate(printCenter, templateId), { childId, termId, month, year });
  const type     = template.templateType || "weekly-household-plan";

  // ── Core Learn templates ──────────────────────────────────────────────────
  if (type === "term-plan"                  || template.id === "print_mom_term")       return buildTermPlan(printCenter, template, generatedAt);
  if (type === "month-calendar"             || template.id === "print_mom_month")      return buildMonthCalendar(printCenter, template, generatedAt);
  if (type === "liturgical-school-calendar" || template.id === "print_mom_liturgical") return buildMonthCalendar(printCenter, template, generatedAt);
  if (type === "child-weekly-assignment")                                               return buildChildWeekly(printCenter, template, generatedAt);
  if (type === "child-term-plan")                                                       return buildChildTerm(printCenter, template, generatedAt);

  // ── Planner: Chores ───────────────────────────────────────────────────────
  if (type === "planner-chores-day")                                                   return buildChorePlanDay(printCenter, template, generatedAt);
  if (type === "planner-chores-week")                                                  return buildChorePlanWeek(printCenter, template, generatedAt);
  if (type === "planner-chores-month")                                                 return buildChorePlanMonth(printCenter, template, generatedAt);
  if (type === "planner-chores-week-child")                                            return buildChorePlanWeek(printCenter, template, generatedAt);

  // ── Planner: Meals ────────────────────────────────────────────────────────
  if (type === "planner-meals-week")                                                   return buildMealPlanWeek(printCenter, template, generatedAt);
  if (type === "planner-meals-month")                                                  return buildMealPlanMonth(printCenter, template, generatedAt);

  // ── Planner: Events ───────────────────────────────────────────────────────
  if (type === "planner-events-month")                                                 return buildEventsPlanMonth(printCenter, template, generatedAt);

  // ── Planner: Recipes & Grocery ────────────────────────────────────────────
  if (type === "planner-recipes")                                                      return buildRecipeCollection(printCenter, template, generatedAt);
  if (type === "planner-grocery-week")                                                 return buildGroceryListWeek(printCenter, template, generatedAt);

  // ── Planner: Lessons ──────────────────────────────────────────────────────
  if (type === "planner-lesson-week-form")                                             return buildPlannerLessonWeekForm(printCenter, template, generatedAt);
  if (type === "planner-lesson-month-form")                                            return buildPlannerLessonMonthForm(printCenter, template, generatedAt);
  if (type === "planner-lesson-term-form")                                             return buildPlannerLessonTermForm(printCenter, template, generatedAt);
  if (type === "planner-lesson-week-child")                                            return buildPlannerLessonWeekChild(printCenter, template, generatedAt);
  if (type === "planner-lesson-month-child")                                           return buildPlannerLessonMonthChild(printCenter, template, generatedAt);
  if (type === "planner-lesson-term-child")                                            return buildPlannerLessonTermChild(printCenter, template, generatedAt);

  // ── Default ───────────────────────────────────────────────────────────────
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
  // Small gold rule only — logo lives on cover page
  page.drawLine({ start: { x: LETTER[0] - MARGIN - 28, y: LETTER[1] - 20 }, end: { x: LETTER[0] - MARGIN - 28, y: LETTER[1] - 60 }, thickness: 0.5, color: GOLD_SOFT });
  // Gold rule under header
  page.drawLine({ start: { x: MARGIN, y: LETTER[1] - 80 }, end: { x: LETTER[0] - MARGIN, y: LETTER[1] - 80 }, thickness: 1, color: GOLD });
  state.page  = page;
  state.pages.push(page);
  state.y = LETTER[1] - 110;
}

// ─── Cover page ───────────────────────────────────────────────────────────────
async function drawCoverPage(state, document) {
  const page = state.pdf.addPage(LETTER);
  const W = LETTER[0], H = LETTER[1];

  // Full navy background
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: NAVY });

  // Cream decorative border (inner frame)
  const bm = 36;
  page.drawRectangle({ x: bm, y: bm, width: W - bm * 2, height: H - bm * 2,
    borderColor: GOLD_SOFT, borderWidth: 1.2, color: NAVY });

  // mark.png logo — embedded PNG, centered near top
  try {
    const markBytes = await fetchBytes("https://agapay.app/mark.png");
    const markImg   = await state.pdf.embedPng(markBytes);
    const markSize  = 80;
    const markDims  = markImg.scale(markSize / markImg.width);
    page.drawImage(markImg, {
      x: (W - markDims.width) / 2,
      y: H - 80 - markDims.height,
      width: markDims.width,
      height: markDims.height,
    });
  } catch {
    // If the logo can't be fetched, fall back to a simple gold cross drawn with lines
    const cx = W / 2, cy = H - 150, arm = 28, thick = 8;
    page.drawRectangle({ x: cx - thick / 2, y: cy - arm, width: thick, height: arm * 2, color: GOLD });
    page.drawRectangle({ x: cx - arm, y: cy - thick / 2, width: arm * 2, height: thick, color: GOLD });
  }

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
    // Gold bullet bullet
    state.page.drawText("•", { x: MARGIN + 2, y: state.y, size: 6, font: state.fonts.sansBold, color: GOLD });
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

function drawDesignedWeek(state, section) {
  drawHeading(state, section.heading);
  const days = (section.days || []).slice(0, 7);
  days.forEach((day) => {
    const assignments = day.assignments || [];
    const assignmentHeights = assignments.map((item) => {
      const note = item.note || item.sub || "";
      const noteLines = note ? wrapText(note, state.fonts.sans, 7.5, LETTER[0] - MARGIN * 2 - 44).slice(0, 3) : [];
      return 34 + noteLines.length * 9;
    });
    const dayHeight = Math.max(78, 42 + (assignments.length ? assignmentHeights.reduce((sum, value) => sum + value + 7, 0) : 30));
    fitPage(state, dayHeight + 14);
    const x = MARGIN;
    const y = state.y;
    const width = LETTER[0] - MARGIN * 2;
    const accent = day.isSunday ? BURGUNDY : GOLD;
    state.page.drawRectangle({ x, y: y - dayHeight, width, height: dayHeight, borderColor: LINE, borderWidth: 0.6, color: CREAM });
    state.page.drawRectangle({ x, y: y - 7, width, height: 7, color: accent });
    state.page.drawText(text(day.weekday || "Day"), { x: x + 14, y: y - 25, size: 15, font: state.fonts.serifBold, color: NAVY });
    state.page.drawText(text([day.shortDate || day.date, day.feast].filter(Boolean).join(" · ")), { x: x + 150, y: y - 22, size: 8, font: state.fonts.sans, color: MUTED });
    let innerY = y - 45;
    if (!assignments.length) {
      state.page.drawText(day.isSunday ? "Church, rest, and family rhythm." : "Open space for lessons, reading, or recovery.", {
        x: x + 14, y: innerY, size: 9, font: state.fonts.sans, color: MUTED
      });
    }
    assignments.forEach((item, index) => {
      const note = item.note || item.sub || "";
      const noteLines = note ? wrapText(note, state.fonts.sans, 7.5, width - 44).slice(0, 3) : [];
      const blockHeight = 28 + noteLines.length * 9;
      const blockY = innerY;
      state.page.drawRectangle({
        x: x + 14,
        y: blockY - blockHeight + 8,
        width: width - 28,
        height: blockHeight,
        borderColor: LINE,
        borderWidth: 0.35,
        color: index % 2 === 0 ? PAPER : rgb(1, 0.98, 0.92)
      });
      state.page.drawRectangle({ x: x + 14, y: blockY - blockHeight + 8, width: 4, height: blockHeight, color: accent });
      state.page.drawText(text(item.title), { x: x + 25, y: blockY - 6, size: 9, font: state.fonts.sansBold, color: INK });
      if (item.sub && item.sub !== note) {
        state.page.drawText(text(item.sub).slice(0, 82), { x: x + 25, y: blockY - 17, size: 7, font: state.fonts.sans, color: MUTED });
      }
      noteLines.forEach((line, li) => {
        state.page.drawText(line, { x: x + 25, y: blockY - 18 - li * 9, size: 7.5, font: state.fonts.sans, color: MUTED });
      });
      innerY -= blockHeight + 7;
    });
    state.y -= dayHeight + 13;
  });
  state.y -= 4;
}

function renderDesignedWeekFormsLandscape(document, state) {
  const forms = Array.isArray(document.designedForms) && document.designedForms.length
    ? document.designedForms
    : [{ label: "Household", days: [] }];
  const W = LANDSCAPE[0];
  const H = LANDSCAPE[1];
  const pageMargin = 28;
  const gap = 6;
  const gridTop = H - 112;
  const gridBottom = 48;
  const colW = (W - pageMargin * 2 - gap * 6) / 7;
  const colH = gridTop - gridBottom;

  forms.forEach((form, pageIndex) => {
    const page = state.pdf.addPage(LANDSCAPE);
    state.pages.push(page);
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: PAPER });
    page.drawRectangle({ x: 0, y: H - 76, width: W, height: 76, color: NAVY });
    page.drawText("AGAPAY LEARN", { x: pageMargin, y: H - 30, size: 10, font: state.fonts.sansBold, color: GOLD });
    page.drawText(text(document.title || "Designed Weekly Lesson Plan"), { x: pageMargin, y: H - 53, size: 19, font: state.fonts.serifBold, color: CREAM });
    page.drawText(text(form.label || "Household"), { x: W - pageMargin - 160, y: H - 32, size: 16, font: state.fonts.serifBold, color: GOLD_SOFT });
    const subtitle = wrapText(document.subtitle || "", state.fonts.sans, 8, W - pageMargin * 2 - 170).slice(0, 1);
    if (subtitle[0]) page.drawText(subtitle[0], { x: pageMargin, y: H - 69, size: 8, font: state.fonts.sans, color: GOLD_SOFT });
    page.drawLine({ start: { x: pageMargin, y: H - 88 }, end: { x: W - pageMargin, y: H - 88 }, thickness: 1, color: GOLD });

    const days = (form.days || []).slice(0, 7);
    DAYS.forEach((fallbackDay, index) => {
      const day = days[index] || {};
      const x = pageMargin + index * (colW + gap);
      const y = gridTop;
      const accent = day.isSunday ? BURGUNDY : GOLD;
      page.drawRectangle({ x, y: gridBottom, width: colW, height: colH, borderColor: LINE, borderWidth: 0.55, color: CREAM });
      page.drawRectangle({ x, y: gridTop - 30, width: colW, height: 30, color: accent });
      page.drawText(text(day.weekday || fallbackDay), { x: x + 7, y: gridTop - 13, size: 8.6, font: state.fonts.sansBold, color: PAPER });
      page.drawText(text(day.shortDate || day.date || ""), { x: x + 7, y: gridTop - 25, size: 6.6, font: state.fonts.sans, color: PAPER });
      if (day.feast) {
        const feastLine = wrapText(day.feast, state.fonts.sans, 6.2, colW - 14)[0] || "";
        page.drawText(feastLine, { x: x + 7, y: gridTop - 42, size: 6.2, font: state.fonts.sans, color: day.isSunday ? BURGUNDY : MUTED });
      }

      let cursorY = gridTop - 56;
      const assignments = day.assignments || [];
      if (!assignments.length) {
        const empty = day.isSunday ? "Church, rest, and family rhythm." : "Open lesson space.";
        wrapText(empty, state.fonts.sans, 7, colW - 14).slice(0, 3).forEach((line, li) => {
          page.drawText(line, { x: x + 7, y: cursorY - li * 9, size: 7, font: state.fonts.sans, color: MUTED });
        });
        return;
      }
      let hiddenCount = 0;
      let overflowed = false;
      assignments.forEach((item, itemIndex) => {
        if (overflowed) return;
        if (cursorY < gridBottom + 34) {
          hiddenCount += assignments.length - itemIndex;
          overflowed = true;
          return;
        }
        const titleLines = wrapText(item.title, state.fonts.sansBold, 7.2, colW - 20).slice(0, 2);
        const note = item.note || item.sub || "";
        const noteLines = note ? wrapText(note, state.fonts.sans, 6.4, colW - 20).slice(0, 2) : [];
        const blockH = Math.max(28, 15 + titleLines.length * 8 + noteLines.length * 7);
        if (cursorY - blockH < gridBottom + 10) {
          hiddenCount += assignments.length - itemIndex;
          overflowed = true;
          return;
        }
        page.drawRectangle({
          x: x + 6,
          y: cursorY - blockH,
          width: colW - 12,
          height: blockH,
          borderColor: LINE,
          borderWidth: 0.3,
          color: itemIndex % 2 === 0 ? PAPER : rgb(1, 0.98, 0.92)
        });
        page.drawRectangle({ x: x + 6, y: cursorY - blockH, width: 3, height: blockH, color: accent });
        titleLines.forEach((line, li) => {
          page.drawText(line, { x: x + 13, y: cursorY - 11 - li * 8, size: 7.2, font: state.fonts.sansBold, color: INK });
        });
        noteLines.forEach((line, li) => {
          page.drawText(line, { x: x + 13, y: cursorY - 11 - titleLines.length * 8 - li * 7, size: 6.4, font: state.fonts.sans, color: MUTED });
        });
        cursorY -= blockH + 5;
      });
      if (hiddenCount > 0) {
        page.drawText(`+ ${hiddenCount} more`, { x: x + 7, y: gridBottom + 12, size: 7, font: state.fonts.sansBold, color: BURGUNDY });
      }
    });

    const unassigned = form.unassigned || [];
    if (unassigned.length) {
      const line = wrapText(`Available but not placed: ${unassigned.map((item) => item.title).join(", ")}`, state.fonts.sans, 7, W - pageMargin * 2 - 160).slice(0, 1)[0] || "";
      page.drawText(line, { x: pageMargin, y: 31, size: 7, font: state.fonts.sans, color: MUTED });
    }
    page.drawLine({ start: { x: pageMargin, y: 24 }, end: { x: W - pageMargin, y: 24 }, thickness: 0.4, color: LINE });
    page.drawText(text(document.footerNote || "Generated by AGAPAY Learn"), { x: pageMargin, y: 12, size: 7, font: state.fonts.sans, color: MUTED });
    page.drawText(`Form page ${pageIndex + 1} of ${forms.length}`, { x: W - pageMargin - 86, y: 12, size: 7, font: state.fonts.sans, color: MUTED });
  });
  return state.pdf.save();
}

// ─── Section dispatcher ───────────────────────────────────────────────────────
function drawSection(state, section) {
  if (!section) return;
  if (section.type === "cards")         return drawCards(state, section);
  if (section.type === "table")         return drawTable(state, section);
  if (section.type === "checkboxes")    return drawCheckboxes(state, section);
  if (section.type === "liturgical")    return drawLiturgicalStrip(state, section);
  if (section.type === "calendar-grid") return drawCalendarGrid(state, section);
  if (section.type === "designed-week") return drawDesignedWeek(state, section);
  return drawList(state, section);
}

// ─── Main renderer ────────────────────────────────────────────────────────────
export async function renderPrintDocumentPdf(document) {
  const pdf   = await PDFDocument.create();
  const fonts = await embedFonts(pdf);
  const state = { pdf, fonts, pages: [], page: null, y: 0, currentSectionHeading: "" };

  if (document.layout === "designed-week-forms-landscape") {
    return renderDesignedWeekFormsLandscape(document, state);
  }

  // Cover page
  await drawCoverPage(state, document);

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
