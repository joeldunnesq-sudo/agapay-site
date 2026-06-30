import puppeteer from "@cloudflare/puppeteer";

const DEFAULT_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const WEEK_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function plainText(value, fallback = "") {
  const text = String(value ?? fallback ?? "").replace(/\s+/g, " ").trim();
  return text || fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toKebab(value) {
  return plainText(value, "section")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "section";
}

function joinText(parts, separator = " · ") {
  return parts.map((part) => plainText(part)).filter(Boolean).join(separator);
}

function fieldValue(row, column, index) {
  if (Array.isArray(row)) return row[index] ?? "";
  if (!row || typeof row !== "object") return index === 0 ? row : "";
  const key = typeof column === "object"
    ? column.key || column.id || column.accessor || column.field || column.label || column.title
    : column;
  return row[key] ?? row[toKebab(key)] ?? row[index] ?? "";
}

function normalizeColumns(section) {
  const columns = asArray(section.columns).map((column, index) => {
    if (typeof column === "object" && column) {
      return {
        key: column.key || column.id || column.accessor || column.field || column.label || column.title || `col_${index}`,
        label: plainText(column.label || column.title || column.heading || column.key || `Column ${index + 1}`),
      };
    }
    return { key: plainText(column, `col_${index}`), label: plainText(column, `Column ${index + 1}`) };
  });

  if (columns.length) return columns;
  const firstRow = asArray(section.rows)[0];
  if (firstRow && typeof firstRow === "object" && !Array.isArray(firstRow)) {
    return Object.keys(firstRow).map((key) => ({ key, label: key.replace(/[-_]/g, " ") }));
  }
  return [{ key: "item", label: "Item" }];
}

function orthodoxCrossSvg() {
  return `
    <svg class="orthodox-cross" viewBox="0 0 240 300" role="img" aria-label="Gold Orthodox budded cross" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="crossGold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#f7e7b4"/>
          <stop offset="0.48" stop-color="#b78b32"/>
          <stop offset="1" stop-color="#6e4c14"/>
        </linearGradient>
        <filter id="crossShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1.2" stdDeviation="1.2" flood-color="#4c330d" flood-opacity="0.22"/>
        </filter>
      </defs>
      <path
        d="m 120,6.5 c -10.67737,0 -19.33309,8.65572 -19.33309,19.33309 0,3.59159 0.96899,6.96328 2.67524,9.84489 -10.67736,0 -19.33308,8.65572 -19.33308,19.3331 0,9.1766 6.4058,16.8551 14.98136,18.8337 l 0,14.4106 -25.46831,0 C 71.54356,79.67988 63.86503,73.27408 54.68841,73.27408 c -10.67736,0 -19.33308,8.6557 -19.33308,19.3331 -2.88161,-1.7063 -6.2533,-2.6753 -9.84489,-2.6753 -10.67737,0 -19.33309,8.6557 -19.33309,19.3331 0,10.6774 8.65572,19.3331 19.33309,19.3331 3.59159,0 6.96328,-0.969 9.84489,-2.6753 0,10.6774 8.65572,19.3331 19.33308,19.3331 9.17662,0 16.85515,-6.4058 18.83371,-14.9813 l 25.46831,0 0,95.8807 c -8.57556,1.9785 -14.98136,9.657 -14.98136,18.8337 0,10.6773 8.65572,19.333 19.33308,19.333 -1.70625,2.8817 -2.67524,6.2533 -2.67524,9.8449 0,10.6774 8.65572,19.3331 19.33309,19.3331 10.67736,0 19.33308,-8.6557 19.33308,-19.3331 0,-3.5916 -0.96898,-6.9632 -2.67524,-9.8449 10.67737,0 19.33308,-8.6557 19.33308,-19.333 0,-9.1767 -6.4058,-16.8552 -14.98135,-18.8337 l 0,-95.8807 25.4683,0 c 1.97857,8.5755 9.65709,14.9813 18.83371,14.9813 10.67737,0 19.33309,-8.6557 19.33309,-19.3331 2.8816,1.7063 6.25329,2.6753 9.84489,2.6753 10.67736,0 19.33308,-8.6557 19.33308,-19.3331 0,-10.6774 -8.65572,-19.3331 -19.33308,-19.3331 -3.5916,0 -6.96329,0.969 -9.84489,2.6753 0,-10.6774 -8.65572,-19.3331 -19.33309,-19.3331 -9.17662,0 -16.85514,6.4058 -18.83371,14.9813 l -25.4683,0 0,-14.4106 c 8.57555,-1.9786 14.98135,-9.6571 14.98135,-18.8337 0,-10.67738 -8.65571,-19.3331 -19.33308,-19.3331 1.70626,-2.88161 2.67524,-6.2533 2.67524,-9.84489 C 139.33308,15.15572 130.67736,6.5 120,6.5 z"
        fill="none"
        stroke="url(#crossGold)"
        stroke-width="7"
        stroke-linejoin="round"
        filter="url(#crossShadow)"
      />
      <path
        d="M120 54v190M104 79h32M75 109h90M103 203l36 16"
        fill="none"
        stroke="url(#crossGold)"
        stroke-width="7"
        stroke-linecap="square"
        stroke-linejoin="round"
      />
      <text x="45" y="118" font-family="Georgia, 'Times New Roman', serif" font-size="24" font-weight="700" fill="#b78b32" letter-spacing="1.5">IC</text>
      <text x="171" y="118" font-family="Georgia, 'Times New Roman', serif" font-size="24" font-weight="700" fill="#b78b32" letter-spacing="1.5">XC</text>
    </svg>`;
}

function renderDocumentHeader(document) {
  return `
    <header class="document-header">
      <div class="brand-mark">${orthodoxCrossSvg()}</div>
      <div class="brand-copy">
        <p class="brand-kicker">AGAPAY Learn</p>
        <h1>${escapeHtml(document.title || "Print Document")}</h1>
        <p class="subtitle">${escapeHtml(document.subtitle || document.footerRole || "Orthodox Christian homeschool planning")}</p>
      </div>
      <div class="header-meta">
        <span>${escapeHtml(document.household || "Household")}</span>
        <span>${escapeHtml(plainText(document.generatedAt).slice(0, 10))}</span>
      </div>
    </header>`;
}

function sectionHeading(section) {
  return section.heading || section.title || section.label || "Print Section";
}

function renderSectionShell(section, body) {
  const classes = ["print-section", `section-${toKebab(section.type || "content")}`];
  if (section.pageBreakBefore || section.breakBefore) classes.push("section-break");
  return `
    <section class="${classes.join(" ")}" aria-labelledby="${toKebab(sectionHeading(section))}-heading">
      <div class="section-heading">
        <p>${escapeHtml(section.kicker || section.type || "Section")}</p>
        <h2 id="${toKebab(sectionHeading(section))}-heading">${escapeHtml(sectionHeading(section))}</h2>
      </div>
      ${body}
    </section>`;
}

function renderTableSection(section) {
  const columns = normalizeColumns(section);
  const rows = asArray(section.rows);
  const bodyRows = rows.map((row) => `
    <tr>
      ${columns.map((column, index) => `<td>${escapeHtml(fieldValue(row, column, index))}</td>`).join("")}
    </tr>`).join("");

  return renderSectionShell(section, `
    <div class="table-frame">
      <table>
        <thead>
          <tr>${columns.map((column) => `<th scope="col">${escapeHtml(column.label)}</th>`).join("")}</tr>
        </thead>
        <tbody>${bodyRows || `<tr><td colspan="${columns.length}">No rows have been added yet.</td></tr>`}</tbody>
      </table>
    </div>`);
}

function renderListSection(section) {
  const items = asArray(section.items || section.rows).map((item) => {
    const label = typeof item === "object" && item
      ? item.label || item.title || item.name || item.value || ""
      : item;
    const detail = typeof item === "object" && item
      ? item.detail || item.description || item.note || item.subtitle || ""
      : "";
    return `
      <li>
        <span class="list-label">${escapeHtml(label)}</span>
        ${plainText(detail) ? `<span class="list-detail">${escapeHtml(detail)}</span>` : ""}
      </li>`;
  }).join("");

  return renderSectionShell(section, `<ul class="structured-list">${items || "<li><span class=\"list-label\">No items yet.</span></li>"}</ul>`);
}

function renderCheckboxesSection(section) {
  const days = asArray(section.days).length ? asArray(section.days) : DEFAULT_DAYS;
  const subjects = asArray(section.subjects || section.items || section.rows)
    .map((subject) => typeof subject === "object" && subject ? subject.subject || subject.title || subject.label || subject.name : subject)
    .filter((subject) => plainText(subject));

  const rows = subjects.map((subject) => `
    <div class="check-row">
      <div class="check-subject">${escapeHtml(subject)}</div>
      ${days.map((day) => `<div class="check-cell" aria-label="${escapeHtml(subject)} ${escapeHtml(day)}"><span></span></div>`).join("")}
    </div>`).join("");

  return renderSectionShell(section, `
    <div class="check-grid" style="--day-count:${days.length}">
      <div class="check-row check-head">
        <div>Subject</div>
        ${days.map((day) => `<div>${escapeHtml(day)}</div>`).join("")}
      </div>
      ${rows || `<div class="check-row"><div class="check-subject">Subject</div>${days.map(() => "<div class=\"check-cell\"><span></span></div>").join("")}</div>`}
    </div>`);
}

function renderLiturgicalSection(section) {
  const days = asArray(section.days || section.items).slice(0, 7);
  const tiles = days.map((day, index) => {
    const isFast = Boolean(day?.isFastDay || day?.fastingRule || day?.fastingType === "fast");
    const weekday = day?.weekday || day?.dayName || WEEK_DAYS[index] || "";
    const dayNumber = day?.dayNumber || day?.dateLabel || String(day?.date || day?.civilDate || "").slice(-2);
    const feast = day?.feast || day?.title || day?.feastTitle || day?.summaryTitle || (isFast ? day?.fastingRule || "Fast day" : "Church rhythm");
    return `
      <article class="liturgical-day${isFast ? " is-fast" : ""}">
        <p class="weekday">${escapeHtml(weekday)}</p>
        <p class="day-number">${escapeHtml(dayNumber)}</p>
        <h3>${escapeHtml(feast)}</h3>
        ${day?.oldStyleDateLabel ? `<p class="old-style">${escapeHtml(day.oldStyleDateLabel)}</p>` : ""}
      </article>`;
  }).join("");

  return renderSectionShell(section, `<div class="liturgical-ribbon">${tiles}</div>`);
}

function lessonItems(day) {
  return asArray(day.assignments || day.lessons || day.blocks || day.items);
}

function renderDesignedWeekSection(section) {
  const days = asArray(section.days).slice(0, 7);
  const blocks = days.map((day, index) => {
    const assignments = lessonItems(day);
    const assignmentHtml = assignments.map((item) => {
      const time = joinText([item.time, item.timeLabel, item.startTime && item.endTime ? `${item.startTime}-${item.endTime}` : ""]);
      const title = item.subject || item.title || item.label || "Lesson";
      const detail = item.assignment || item.detail || item.note || item.subtitle || item.sub || "";
      return `
        <article class="lesson-module">
          ${time ? `<p class="lesson-time">${escapeHtml(time)}</p>` : ""}
          <h4>${escapeHtml(title)}</h4>
          ${detail ? `<p>${escapeHtml(detail)}</p>` : ""}
        </article>`;
    }).join("");
    const weekday = day.weekday || day.dayName || WEEK_DAYS[index] || `Day ${index + 1}`;
    const meta = joinText([day.shortDate || day.date || day.civilDate, day.feast || day.feastTitle]);
    return `
      <article class="week-day${day.isSunday ? " is-sunday" : ""}">
        <header>
          <h3>${escapeHtml(weekday)}</h3>
          ${meta ? `<p>${escapeHtml(meta)}</p>` : ""}
        </header>
        <div class="lesson-stack">${assignmentHtml || `<p class="open-day">${escapeHtml(day.isSunday ? "Church, rest, and family rhythm." : "Open lesson space.")}</p>`}</div>
      </article>`;
  }).join("");

  return renderSectionShell(section, `<div class="designed-week">${blocks}</div>`);
}

function renderCardsSection(section) {
  const items = asArray(section.items || section.rows);
  const cards = items.map((item) => `
    <article class="summary-card">
      <p>${escapeHtml(item.label || item.title || item.name || "Summary")}</p>
      <h3>${escapeHtml(item.value || item.total || item.count || "")}</h3>
      ${item.detail || item.note ? `<span>${escapeHtml(item.detail || item.note)}</span>` : ""}
    </article>`).join("");
  return renderSectionShell(section, `<div class="summary-grid">${cards}</div>`);
}

function renderCalendarGridSection(section) {
  const days = asArray(section.days);
  const cells = days.map((day) => `
    <article class="calendar-cell${day.inMonth === false ? " is-muted" : ""}${day.isFastDay ? " is-fast" : ""}">
      <strong>${escapeHtml(day.dayNumber || String(day.date || day.civilDate || "").slice(-2))}</strong>
      <span>${escapeHtml(day.feastTitle || day.feastMarker || day.fastingRule || "")}</span>
    </article>`).join("");
  return renderSectionShell(section, `<div class="calendar-grid">${cells}</div>`);
}

function renderSection(section) {
  if (!section || typeof section !== "object") return "";
  if (section.type === "table") return renderTableSection(section);
  if (section.type === "list") return renderListSection(section);
  if (section.type === "checkboxes") return renderCheckboxesSection(section);
  if (section.type === "liturgical") return renderLiturgicalSection(section);
  if (section.type === "designed-week") return renderDesignedWeekSection(section);
  if (section.type === "cards") return renderCardsSection(section);
  if (section.type === "calendar-grid") return renderCalendarGridSection(section);
  return renderListSection({ ...section, type: "list", items: section.items || section.rows || [] });
}

function renderStyles() {
  return `
    <style>
      :root {
        color-scheme: light;
        --ink:#17202a;
        --muted:#68707a;
        --line:#d9d1c0;
        --paper:#fffdf8;
        --cream:#f7f0df;
        --navy:#10233d;
        --gold:#b78b32;
        --red:#9d2630;
      }
      * { box-sizing: border-box; }
      html { background: white; color: var(--ink); font-family: Helvetica, Arial, sans-serif; }
      body { margin: 0; background: white; font-size: 10.5pt; line-height: 1.42; }
      .print-page-header {
        display: none;
      }
      .document {
        padding: 0.22in 0 0;
      }
      .document-header {
        display: grid;
        grid-template-columns: 0.78in minmax(0, 1fr) 1.5in;
        gap: 0.18in;
        align-items: center;
        padding: 0 0 0.28in;
        border-bottom: 2px solid var(--gold);
        break-inside: avoid;
      }
      .orthodox-cross { width: 0.56in; height: 0.76in; display: block; }
      .brand-kicker,
      .section-heading p,
      .lesson-time,
      .weekday,
      .header-meta {
        margin: 0;
        color: var(--gold);
        font-size: 7.5pt;
        font-weight: 700;
        letter-spacing: 0.13em;
        text-transform: uppercase;
      }
      h1, h2, h3, h4 {
        margin: 0;
        font-family: Georgia, "Times New Roman", serif;
        color: var(--navy);
        font-weight: 700;
      }
      h1 { font-size: 26pt; line-height: 1.02; }
      .subtitle { margin: 0.06in 0 0; color: var(--muted); }
      .header-meta { display: grid; gap: 0.04in; justify-items: end; color: var(--muted); }
      .print-section {
        margin-top: 0.28in;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .section-break {
        page-break-before: always;
        break-before: page;
      }
      .section-heading {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 2.1in;
        gap: 0.2in;
        align-items: end;
        margin-bottom: 0.12in;
        border-bottom: 1px solid var(--line);
        padding-bottom: 0.07in;
      }
      .section-heading h2 { font-size: 16pt; }
      .section-heading p { justify-self: end; }
      .table-frame { border: 1px solid var(--line); break-inside: avoid; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      thead { display: table-header-group; }
      th {
        background: var(--navy);
        color: white;
        font-size: 7.5pt;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        text-align: left;
      }
      th, td { padding: 0.075in 0.08in; border-bottom: 1px solid var(--line); vertical-align: top; }
      td { font-size: 9pt; }
      tbody tr:nth-child(even) td { background: #fbf7ee; }
      .structured-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.075in; }
      .structured-list li {
        display: grid;
        grid-template-columns: 1.55in minmax(0, 1fr);
        gap: 0.16in;
        padding: 0.09in 0.11in;
        background: var(--paper);
        border-left: 4px solid var(--gold);
        break-inside: avoid;
      }
      .list-label { font-weight: 700; color: var(--navy); }
      .list-detail { color: var(--muted); }
      .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.12in; }
      .summary-card {
        padding: 0.13in;
        background: var(--paper);
        border: 1px solid var(--line);
        border-top: 4px solid var(--gold);
        break-inside: avoid;
      }
      .summary-card p { margin: 0; color: var(--gold); font-weight: 700; text-transform: uppercase; font-size: 7.5pt; }
      .summary-card h3 { margin-top: 0.05in; font-size: 18pt; }
      .summary-card span { display: block; margin-top: 0.04in; color: var(--muted); font-size: 8pt; }
      .check-grid {
        display: grid;
        border: 1px solid var(--line);
        break-inside: avoid;
      }
      .check-row {
        display: grid;
        grid-template-columns: minmax(1.85in, 1fr) repeat(var(--day-count), 0.62in);
        min-height: 0.34in;
      }
      .check-row > div {
        display: grid;
        align-items: center;
        padding: 0.06in;
        border-right: 1px solid var(--line);
        border-bottom: 1px solid var(--line);
      }
      .check-head > div {
        background: var(--navy);
        color: white;
        font-weight: 700;
        text-align: center;
        text-transform: uppercase;
        font-size: 7.5pt;
      }
      .check-subject { font-weight: 700; color: var(--navy); }
      .check-cell { justify-items: center; }
      .check-cell span { width: 0.16in; height: 0.16in; border: 1.4px solid var(--gold); background: white; }
      .liturgical-ribbon {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 0.055in;
      }
      .liturgical-day {
        min-height: 1.05in;
        padding: 0.08in;
        background: var(--cream);
        border: 1px solid var(--line);
        border-top: 5px solid var(--gold);
        break-inside: avoid;
      }
      .liturgical-day.is-fast { background: #fff1f1; border-top-color: var(--red); }
      .liturgical-day.is-fast .weekday,
      .liturgical-day.is-fast h3 { color: var(--red); }
      .day-number { margin: 0.02in 0 0; font: 700 17pt Georgia, "Times New Roman", serif; color: var(--navy); }
      .liturgical-day h3 { margin-top: 0.03in; font-size: 8.5pt; line-height: 1.15; }
      .old-style { margin: 0.04in 0 0; color: var(--muted); font-size: 7pt; }
      .designed-week {
        display: grid;
        grid-template-columns: 1.08fr 1fr 1fr;
        gap: 0.12in;
        align-items: start;
      }
      .week-day {
        min-height: 1.45in;
        padding: 0.11in;
        background: var(--paper);
        border: 1px solid var(--line);
        border-top: 5px solid var(--gold);
        break-inside: avoid;
      }
      .week-day.is-sunday { border-top-color: var(--red); background: #fff8f4; }
      .week-day header { margin-bottom: 0.08in; }
      .week-day h3 { font-size: 14pt; }
      .week-day header p { margin: 0.025in 0 0; color: var(--muted); font-size: 8pt; }
      .lesson-stack { display: grid; gap: 0.07in; }
      .lesson-module {
        padding: 0.075in 0.085in;
        background: white;
        border: 1px solid var(--line);
        border-left: 4px solid var(--gold);
        break-inside: avoid;
      }
      .lesson-module h4 { font-size: 10pt; }
      .lesson-module p:not(.lesson-time), .open-day { margin: 0.025in 0 0; color: var(--muted); font-size: 8pt; }
      .calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); border: 1px solid var(--line); }
      .calendar-cell {
        min-height: 0.74in;
        padding: 0.055in;
        border-right: 1px solid var(--line);
        border-bottom: 1px solid var(--line);
        background: var(--paper);
      }
      .calendar-cell.is-muted { background: #f1eee6; color: var(--muted); }
      .calendar-cell.is-fast { background: #fff1f1; }
      .calendar-cell strong { display: block; color: var(--navy); font-family: Georgia, "Times New Roman", serif; font-size: 13pt; }
      .calendar-cell span { display: block; margin-top: 0.03in; font-size: 7pt; color: var(--muted); }
      footer {
        margin-top: 0.28in;
        padding-top: 0.09in;
        border-top: 1px solid var(--line);
        color: var(--muted);
        font-size: 7.5pt;
      }
      @media print {
        @page { size: Letter; margin: 0.6in 0.5in; }
        body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        .print-page-header {
          position: fixed;
          top: -0.42in;
          left: 0;
          right: 0;
          display: grid;
          grid-template-columns: 0.28in minmax(0, 1fr) auto;
          gap: 0.08in;
          align-items: center;
          height: 0.28in;
          color: var(--muted);
          font-size: 7pt;
          border-bottom: 1px solid var(--line);
        }
        .print-page-header .orthodox-cross { width: 0.2in; height: 0.28in; }
        .print-section, .summary-card, .lesson-module, .week-day, .liturgical-day, .structured-list li {
          break-inside: avoid;
          page-break-inside: avoid;
        }
        tr { break-inside: avoid; page-break-inside: avoid; }
      }
    </style>`;
}

function renderDesignedWeekFormsHtml(document) {
  const forms = Array.isArray(document.designedForms) && document.designedForms.length
    ? document.designedForms
    : [{ label: "Household", days: [] }];
  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return forms.map((form, formIndex) => {
    const days = asArray(form.days).slice(0, 7);
    // Collect all unique subjects (rows) across all days
    const subjectMap = new Map();
    days.forEach((day, dayIndex) => {
      asArray(day.assignments).forEach((item) => {
        const key = item.id || item.title || `item-${dayIndex}`;
        if (!subjectMap.has(key)) {
          subjectMap.set(key, { title: item.title || "Subject", sub: item.sub || "", cells: Array.from({ length: 7 }, () => "") });
        }
        const note = item.note || item.sub || "✓";
        subjectMap.get(key).cells[dayIndex] = note;
      });
    });
    const rows = Array.from(subjectMap.values());

    const headerCols = days.map((day, i) => {
      const label = day.weekday || weekDays[i] || `Day ${i + 1}`;
      const date  = day.shortDate || day.date || "";
      const isSun = day.isSunday || label === "Sun" || label === "Sunday";
      return `<th class="${isSun ? "col-sunday" : ""}">${escapeHtml(label)}<br><span class="col-date">${escapeHtml(date)}</span></th>`;
    }).join("");

    const bodyRows = rows.map((row, ri) => {
      const cells = row.cells.map((note, di) => {
        const day = days[di] || {};
        const isSun = day.isSunday;
        return `<td class="${isSun ? "col-sunday" : ""}${note ? " has-entry" : ""}">${note ? `<span class="cell-check">☐</span><span class="cell-note">${escapeHtml(note)}</span>` : ""}</td>`;
      }).join("");
      return `<tr class="${ri % 2 === 0 ? "" : "row-alt"}"><td class="subject-col"><strong>${escapeHtml(row.title)}</strong>${row.sub ? `<span class="subject-sub">${escapeHtml(row.sub)}</span>` : ""}</td>${cells}</tr>`;
    }).join("");

    const isFirst = formIndex === 0;
    return `
      <section class="form-page${isFirst ? "" : " page-break"}">
        <header class="form-header">
          <div class="form-header-brand">
            ${orthodoxCrossSvg()}
            <div>
              <p class="brand-kicker">AGAPAY Learn</p>
              <p class="form-week-label">${escapeHtml(document.subtitle || "")}</p>
            </div>
          </div>
          <div class="form-title-block">
            <h1>${escapeHtml(form.label === "Family" ? "Family Learning" : `${form.label} — Lesson Plan`)}</h1>
          </div>
        </header>
        <div class="form-grid-wrap">
          <table class="form-grid">
            <thead>
              <tr>
                <th class="subject-col-head">Subject / Resource</th>
                ${headerCols}
              </tr>
            </thead>
            <tbody>
              ${bodyRows || `<tr><td colspan="${days.length + 1}" class="empty-row">No lessons have been placed for this form yet.</td></tr>`}
            </tbody>
          </table>
        </div>
        <div class="form-footer">
          <span>Notes: <span class="notes-line"></span></span>
          <span>${escapeHtml(document.footerNote || "Generated by AGAPAY Learn")}</span>
        </div>
      </section>`;
  }).join("");
}

function renderLandscapeStyles() {
  return `
    <style>
      :root {
        --ink:#17202a; --muted:#68707a; --line:#d9d1c0;
        --paper:#fffdf8; --cream:#f7f0df; --navy:#10233d;
        --gold:#b78b32; --red:#9d2630;
      }
      * { box-sizing: border-box; }
      html, body { margin: 0; background: white; font-family: Helvetica, Arial, sans-serif; font-size: 9pt; line-height: 1.35; color: var(--ink); }
      .form-page { display: flex; flex-direction: column; min-height: 100vh; padding: 0.45in 0.4in 0.35in; }
      .page-break { page-break-before: always; break-before: page; }
      .form-header {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 0.22in;
        align-items: center;
        padding-bottom: 0.16in;
        border-bottom: 2.5px solid var(--gold);
        margin-bottom: 0.18in;
      }
      .form-header-brand { display: flex; align-items: center; gap: 0.12in; }
      .orthodox-cross { width: 0.36in; height: 0.48in; display: block; flex-shrink: 0; }
      .brand-kicker { margin: 0; color: var(--gold); font-size: 7pt; font-weight: 700; letter-spacing: 0.13em; text-transform: uppercase; }
      .form-week-label { margin: 0.03in 0 0; color: var(--muted); font-size: 7.5pt; }
      .form-title-block h1 { margin: 0; font-family: Georgia, "Times New Roman", serif; font-size: 20pt; color: var(--navy); text-align: right; }
      .form-grid-wrap { flex: 1; }
      .form-grid {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }
      .form-grid thead th {
        background: var(--navy);
        color: white;
        font-size: 7.5pt;
        font-weight: 700;
        letter-spacing: 0.07em;
        text-transform: uppercase;
        text-align: center;
        padding: 0.07in 0.05in;
        border: 1px solid #1a3353;
        vertical-align: bottom;
      }
      .form-grid .subject-col-head { text-align: left; padding-left: 0.09in; width: 1.7in; }
      .form-grid .col-sunday { background: var(--red) !important; }
      .col-date { display: block; font-weight: 400; font-size: 6.5pt; opacity: 0.75; margin-top: 0.02in; }
      .form-grid tbody td {
        border: 1px solid var(--line);
        vertical-align: top;
        padding: 0.055in 0.05in;
        font-size: 8pt;
        min-height: 0.38in;
      }
      .form-grid tbody td.col-sunday { background: #fff4f2; }
      .form-grid tbody td.has-entry { background: #fffdf4; }
      .form-grid tbody .row-alt td { background: #f9f5eb; }
      .form-grid tbody .row-alt td.col-sunday { background: #fff0ed; }
      .form-grid tbody .row-alt td.has-entry { background: #fffae8; }
      .subject-col { width: 1.7in; font-size: 8.5pt; }
      .subject-col strong { display: block; color: var(--navy); font-weight: 700; line-height: 1.2; }
      .subject-sub { display: block; color: var(--muted); font-size: 7pt; margin-top: 0.02in; }
      .cell-check { color: var(--gold); margin-right: 0.03in; font-size: 9pt; }
      .cell-note { color: var(--muted); font-size: 7pt; line-height: 1.2; }
      .empty-row { color: var(--muted); font-style: italic; padding: 0.2in; text-align: center; }
      .form-footer {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        padding-top: 0.1in;
        border-top: 1px solid var(--line);
        margin-top: 0.14in;
        color: var(--muted);
        font-size: 7pt;
      }
      .notes-line { display: inline-block; width: 3.5in; border-bottom: 1px solid var(--line); vertical-align: bottom; }
      @media print {
        @page { size: Letter landscape; margin: 0; }
        body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        .form-page { min-height: 0; page-break-inside: avoid; }
      }
    </style>`;
}

function buildPrintDocumentHtml(document = {}) {
  const title = plainText(document.title, "AGAPAY Learn Print Document");
  const generated = plainText(document.generatedAt, new Date().toISOString());

  // Landscape layout: one page per form, Mon-Fri grid
  if (document.layout === "designed-week-forms-landscape") {
    return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8">
      <title>${escapeHtml(title)}</title>
      ${renderLandscapeStyles()}
    </head>
    <body>
      ${renderDesignedWeekFormsHtml({ ...document, title, generatedAt: generated })}
    </body>
  </html>`;
  }

  // Standard portrait layout
  const sections = asArray(document.sections);
  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${escapeHtml(title)}</title>
      ${renderStyles()}
    </head>
    <body>
      <div class="print-page-header" aria-hidden="true">
        ${orthodoxCrossSvg()}
        <span>AGAPAY Learn</span>
        <span>${escapeHtml(title)}</span>
      </div>
      <main class="document">
        ${renderDocumentHeader({ ...document, title, generatedAt: generated })}
        ${sections.map(renderSection).join("")}
        <footer>${escapeHtml(document.footerNote || `${document.household || "Household"} · Generated by AGAPAY Learn`)}</footer>
      </main>
    </body>
  </html>`;
}

function toArrayBuffer(pdfBytes) {
  if (pdfBytes instanceof ArrayBuffer) return pdfBytes;
  if (ArrayBuffer.isView(pdfBytes)) {
    return pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength);
  }
  return new Uint8Array(pdfBytes).buffer;
}

export async function renderPrintDocumentPdf(document, env) {
  if (!env?.BROWSER) {
    throw new Error("AGAPAY Learn PDF rendering requires a Cloudflare Browser Rendering binding named BROWSER.");
  }

  let browser;
  try {
    browser = await puppeteer.launch(env.BROWSER);
    const page = await browser.newPage();
    await page.setContent(buildPrintDocumentHtml(document), { waitUntil: "load" });
    await page.emulateMediaType("print");
    const isLandscape = document.layout === "designed-week-forms-landscape";
    const pdfBytes = await page.pdf({
      format: "Letter",
      landscape: isLandscape,
      printBackground: true,
      margin: isLandscape
        ? { top: "0", right: "0", bottom: "0", left: "0" }
        : { top: "0.6in", right: "0.5in", bottom: "0.6in", left: "0.5in" },
    });
    await page.close();
    return toArrayBuffer(pdfBytes);
  } finally {
    if (browser) await browser.close();
  }
}
