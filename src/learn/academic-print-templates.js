import { calculateCumulativeGPA } from "./gpa.js";

function text(value) {
  return String(value ?? "").trim();
}

function escapeHtml(value) {
  return text(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatCredits(value) {
  return number(value, 0).toFixed(1);
}

function formatAttendance(value) {
  const days = Math.max(0, Math.trunc(number(value, 0)));
  return `${days} ${days === 1 ? "day" : "days"}`;
}

function formatTermLabel(termIndex) {
  return `Term ${Math.max(1, Math.min(3, Math.trunc(number(termIndex, 1))))}`;
}

function formatGradeLevel(gradeLevel) {
  const grade = Math.max(9, Math.min(12, Math.trunc(number(gradeLevel, 9))));
  const suffix = grade === 11 || grade === 12 ? "th" : grade === 10 ? "th" : "th";
  return `${grade}${suffix} Grade`;
}

function courseGradeRows(courses = []) {
  return list(courses).flatMap((course) =>
    list(course.grades || course.gradesAndProgress || course.progress).map((grade) => ({
      courseTitle: text(course.courseTitle || course.course_title),
      subjectCategory: text(course.subjectCategory || course.subject_category),
      gradeLevel: number(course.gradeLevel ?? course.grade_level, 0),
      creditHours: number(course.creditHours ?? course.credit_hours, 0),
      termIndex: number(grade.termIndex ?? grade.term_index, 0),
      numericScore: grade.numericScore ?? grade.numeric_score,
      letterGrade: text(grade.letterGrade || grade.letter_grade),
      teacherNotes: text(grade.teacherNotes || grade.teacher_notes),
      attendanceDays: number(grade.attendanceDays ?? grade.attendance_days, 0)
    }))
  );
}

function groupBy(rows, keyFn) {
  const groups = new Map();
  rows.forEach((row) => {
    const key = keyFn(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  return groups;
}

function renderReportCardTerm(termIndex, rows = []) {
  return `
    <section class="print-section report-term" aria-labelledby="report-term-${termIndex}">
      <h2 id="report-term-${termIndex}">${escapeHtml(formatTermLabel(termIndex))}</h2>
      <table>
        <caption>${escapeHtml(formatTermLabel(termIndex))} course performance</caption>
        <thead>
          <tr>
            <th scope="col">Course Title</th>
            <th scope="col">Subject Category</th>
            <th scope="col">Term Grade</th>
            <th scope="col">Attendance</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <th scope="row">${escapeHtml(row.courseTitle)}</th>
              <td>${escapeHtml(row.subjectCategory)}</td>
              <td>${escapeHtml(row.letterGrade || String(row.numericScore ?? ""))}</td>
              <td>${escapeHtml(formatAttendance(row.attendanceDays))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </section>
  `;
}

function renderReportCardNarrativeNotes(rows = []) {
  const notes = rows
    .filter((row) => row.teacherNotes)
    .map((row) => `
      <article>
        <h3>${escapeHtml(formatTermLabel(row.termIndex))}: ${escapeHtml(row.courseTitle)}</h3>
        <p>${escapeHtml(row.teacherNotes)}</p>
      </article>
    `)
    .join("");

  return `
    <section class="narrative-notes" aria-labelledby="report-narrative-evaluation">
      <h2 id="report-narrative-evaluation">Narrative Evaluation Notes</h2>
      ${notes}
    </section>
  `;
}

function renderTranscriptGradeGroup(gradeLevel, rows = []) {
  return `
    <section class="transcript-grade" aria-labelledby="transcript-grade-${gradeLevel}">
      <h2 id="transcript-grade-${gradeLevel}">${escapeHtml(formatGradeLevel(gradeLevel))}</h2>
      <table>
        <caption>${escapeHtml(formatGradeLevel(gradeLevel))} coursework</caption>
        <thead>
          <tr>
            <th scope="col">Course</th>
            <th scope="col">Category</th>
            <th scope="col">Credit</th>
            <th scope="col">Grade</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <th scope="row">${escapeHtml(row.courseTitle)}</th>
              <td>${escapeHtml(row.subjectCategory)}</td>
              <td>${escapeHtml(formatCredits(row.creditHours))}</td>
              <td>${escapeHtml(row.letterGrade)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </section>
  `;
}

function printStyles() {
  return `
    <style>
      :root {
        color-scheme: light;
        --ink: #1f2526;
        --muted: #646968;
        --rule: #c9b783;
        --rule-soft: #e6dcc0;
        --paper: #fffdf8;
      }

      body {
        margin: 0;
        background: var(--paper);
        color: var(--ink);
        font-family: "Cormorant Garamond", Georgia, "Times New Roman", serif;
        font-size: 11pt;
        line-height: 1.35;
      }

      .academic-print-document {
        box-sizing: border-box;
        width: 8.5in;
        min-height: 11in;
        margin: 0 auto;
        padding: 0.48in 0.55in;
      }

      .document-kicker,
      .meta-grid dt,
      table,
      .signature-row span,
      .summary-panel dt {
        font-family: Georgia, "Times New Roman", serif;
      }

      .document-kicker {
        color: var(--muted);
        font-size: 8pt;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      header {
        border-bottom: 1.5pt solid var(--rule);
        margin-bottom: 0.22in;
        padding-bottom: 0.16in;
      }

      h1 {
        margin: 0.03in 0 0;
        font-size: 28pt;
        font-weight: 600;
        line-height: 1;
      }

      h2 {
        break-after: avoid;
        border-bottom: 0.75pt solid var(--rule-soft);
        font-size: 15pt;
        margin: 0.16in 0 0.07in;
        padding-bottom: 0.03in;
      }

      h3 {
        font-size: 12pt;
        margin: 0 0 0.05in;
      }

      .meta-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 0.08in 0.18in;
        margin: 0.16in 0 0;
      }

      .meta-grid dt,
      .summary-panel dt {
        color: var(--muted);
        font-size: 7.5pt;
        text-transform: uppercase;
      }

      .meta-grid dd,
      .summary-panel dd {
        margin: 0.02in 0 0;
        font-size: 12pt;
        font-weight: 600;
      }

      table {
        border-collapse: collapse;
        font-size: 9.2pt;
        width: 100%;
      }

      caption {
        height: 0;
        overflow: hidden;
        position: absolute;
        width: 0;
      }

      th,
      td {
        border-bottom: 0.5pt solid var(--rule-soft);
        padding: 0.045in 0.035in;
        text-align: left;
        vertical-align: top;
      }

      thead th {
        border-bottom: 1pt solid var(--rule);
        color: var(--muted);
        font-size: 7.5pt;
        text-transform: uppercase;
      }

      tbody th {
        font-weight: 600;
      }

      .narrative-notes {
        border: 0.75pt solid var(--rule-soft);
        break-inside: avoid;
        margin-top: 0.2in;
        padding: 0.12in;
      }

      .report-card-document {
        display: flex;
        flex-direction: column;
        min-height: 11in;
      }

      .report-card-document .narrative-notes {
        margin-top: auto;
        min-height: 1in;
      }

      .narrative-notes p {
        margin: 0 0 0.06in;
      }

      .narrative-notes article {
        break-inside: avoid;
        margin-bottom: 0.08in;
      }

      .transcript-document {
        display: grid;
        grid-template-rows: auto 1fr auto;
        height: 11in;
        min-height: 11in;
      }

      .transcript-grid {
        display: grid;
        gap: 0.1in 0.16in;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .transcript-grade {
        break-inside: avoid;
      }

      .transcript-grade h2 {
        font-size: 12.5pt;
        margin-top: 0.08in;
      }

      .transcript-grade table {
        font-size: 8.1pt;
      }

      .transcript-footer {
        align-items: end;
        display: grid;
        gap: 0.25in;
        grid-template-columns: 1.4fr 0.8fr;
        margin-top: 0.18in;
      }

      .signature-row {
        display: grid;
        gap: 0.13in;
      }

      .signature-row span {
        border-top: 0.75pt solid var(--ink);
        display: block;
        font-size: 8pt;
        padding-top: 0.04in;
        text-transform: uppercase;
      }

      .summary-panel {
        border-left: 1pt solid var(--rule);
        padding-left: 0.16in;
      }

      @media print {
        @page {
          size: letter;
          margin: 0;
        }

        html,
        body {
          background: #fff;
        }

        .academic-print-document {
          margin: 0;
          page-break-after: always;
        }

        .transcript-document {
          page-break-after: avoid;
        }
      }
    </style>
  `;
}

export function renderReportCardTemplate({
  studentName,
  academicYear,
  householdName,
  courses = []
} = {}) {
  const rows = courseGradeRows(courses).sort((a, b) => a.termIndex - b.termIndex || a.courseTitle.localeCompare(b.courseTitle));
  const byTerm = groupBy(rows, (row) => row.termIndex || 1);

  return `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${escapeHtml(text(studentName))} Report Card</title>
        ${printStyles()}
      </head>
      <body>
        <article class="academic-print-document report-card-document">
          <header>
            <p class="document-kicker">AGAPAY Learn Report Card</p>
            <h1>${escapeHtml(text(studentName))}</h1>
            <dl class="meta-grid">
              <div><dt>Academic Year</dt><dd>${escapeHtml(text(academicYear))}</dd></div>
              <div><dt>Household</dt><dd>${escapeHtml(text(householdName))}</dd></div>
              <div><dt>Calendar Rhythm</dt><dd>Three 12-week terms</dd></div>
            </dl>
          </header>
          ${[1, 2, 3].filter((termIndex) => byTerm.has(termIndex)).map((termIndex) => renderReportCardTerm(termIndex, byTerm.get(termIndex))).join("")}
          ${renderReportCardNarrativeNotes(rows)}
        </article>
      </body>
    </html>`;
}

export function renderHighSchoolTranscriptTemplate({
  studentName,
  academicYear,
  householdName,
  dateOfGraduation,
  courses = []
} = {}) {
  const rows = list(courses)
    .map((course) => ({
      courseTitle: text(course.courseTitle || course.course_title),
      subjectCategory: text(course.subjectCategory || course.subject_category),
      gradeLevel: number(course.gradeLevel ?? course.grade_level, 0),
      creditHours: number(course.creditHours ?? course.credit_hours, 0),
      letterGrade: text(course.letterGrade || course.letter_grade || course.finalLetterGrade || course.final_letter_grade)
    }))
    .filter((row) => row.gradeLevel >= 9 && row.gradeLevel <= 12)
    .sort((a, b) => a.gradeLevel - b.gradeLevel || a.subjectCategory.localeCompare(b.subjectCategory) || a.courseTitle.localeCompare(b.courseTitle));
  const byGrade = groupBy(rows, (row) => row.gradeLevel);
  const totalCredits = rows.reduce((sum, row) => row.letterGrade ? sum + row.creditHours : sum, 0);
  const cumulativeGpa = calculateCumulativeGPA(rows);

  return `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${escapeHtml(text(studentName))} High School Transcript</title>
        ${printStyles()}
      </head>
      <body>
        <article class="academic-print-document transcript-document">
          <header>
            <p class="document-kicker">Official High School Transcript</p>
            <h1>${escapeHtml(text(studentName))}</h1>
            <dl class="meta-grid">
              <div><dt>Academic Year</dt><dd>${escapeHtml(text(academicYear))}</dd></div>
              <div><dt>Household</dt><dd>${escapeHtml(text(householdName))}</dd></div>
              <div><dt>Record System</dt><dd>AGAPAY Learn</dd></div>
            </dl>
          </header>
          <main class="transcript-grid">
            ${[9, 10, 11, 12].filter((gradeLevel) => byGrade.has(gradeLevel)).map((gradeLevel) => renderTranscriptGradeGroup(gradeLevel, byGrade.get(gradeLevel))).join("")}
          </main>
          <footer class="transcript-footer">
            <section class="signature-row" aria-label="Compliance signatures">
              <span>Date of Graduation: ${escapeHtml(text(dateOfGraduation))}</span>
              <span>Authorized Parent/Administrator Signature</span>
            </section>
            <dl class="summary-panel">
              <div><dt>Total Cumulative Credits Earned</dt><dd>${escapeHtml(formatCredits(totalCredits))}</dd></div>
              <div><dt>Cumulative Unweighted GPA</dt><dd>${escapeHtml(cumulativeGpa)}</dd></div>
            </dl>
          </footer>
        </article>
      </body>
    </html>`;
}
