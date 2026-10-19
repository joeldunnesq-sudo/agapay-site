// Generated from src/learn/print-academic-pdf.ts by npm run build:server. Do not edit.
import { PDFDocument, rgb } from 'pdf-lib';
import { getGPAPoints } from './gpa.js';
import {
  LETTER,
  MARGIN,
  NAVY,
  NAVY_SOFT,
  GOLD,
  GOLD_SOFT,
  CREAM,
  PAPER,
  INK,
  MUTED,
  LINE,
  CORE_SUBJECT_CATEGORIES,
  GRADE_LEVEL_NAMES,
  GRADE_PERCENT_RANGES,
} from './print-documents-shared.js';
import { fetchBytes, embedFonts, text, newPdfState } from './print-documents-shared.js';
import { wrapText, drawTextLines, resolveColWidths } from './print-pdf-layout.js';
function nextGradeLabel(gradeLevel) {
  const level = Number(gradeLevel) || 9;
  if (level >= 12) return 'Graduate';
  return `Grade ${level + 1}`;
}
function finalCourseGrade(course = {}) {
  const graded = (course.grades || []).filter((grade) => grade.letterGrade);
  return graded.length ? graded[graded.length - 1].letterGrade : '';
}
function courseGradePoints(course = {}) {
  const points = getGPAPoints(finalCourseGrade(course));
  return points === null ? null : points * (Number(course.creditHours) || 0);
}
async function embedMarkLogo(pdf) {
  try {
    const markBytes = await fetchBytes('https://agapay.app/mark.png');
    return await pdf.embedPng(markBytes);
  } catch {
    return null;
  }
}
function newFormState(pdf, fonts, markImage) {
  const state = newPdfState(pdf, fonts);
  state.markImage = markImage;
  return state;
}
function drawFormMasthead(state, { eyebrow = 'Print Shop', title, subtitle }) {
  const page = state.page;
  const W = LETTER[0];
  const bandH = 70;
  page.drawRectangle({ x: 0, y: LETTER[1] - bandH, width: W, height: bandH, color: NAVY });
  if (state.markImage) {
    const markSize = 30;
    const markDims = state.markImage.scale(markSize / state.markImage.width);
    page.drawImage(state.markImage, {
      x: MARGIN,
      y: LETTER[1] - bandH + (bandH - markDims.height) / 2,
      width: markDims.width,
      height: markDims.height,
    });
  }
  const textX = MARGIN + (state.markImage ? 42 : 0);
  page.drawText('AGAPAY LEARN', { x: textX, y: LETTER[1] - 30, size: 11, font: state.fonts.sansBold, color: GOLD });
  page.drawText(text(eyebrow), { x: textX, y: LETTER[1] - 43, size: 7.5, font: state.fonts.sans, color: CREAM });
  const titleSize = 15;
  const titleW = state.fonts.serifBold.widthOfTextAtSize(text(title), titleSize);
  page.drawText(text(title), {
    x: W - MARGIN - titleW,
    y: LETTER[1] - 30,
    size: titleSize,
    font: state.fonts.serifBold,
    color: CREAM,
  });
  if (subtitle) {
    const subW = state.fonts.sans.widthOfTextAtSize(text(subtitle), 8.5);
    page.drawText(text(subtitle), {
      x: W - MARGIN - subW,
      y: LETTER[1] - 44,
      size: 8.5,
      font: state.fonts.sans,
      color: GOLD_SOFT,
    });
  }
  page.drawLine({
    start: { x: 0, y: LETTER[1] - bandH },
    end: { x: W, y: LETTER[1] - bandH },
    thickness: 2,
    color: GOLD,
  });
  state.y = LETTER[1] - bandH - 20;
}
function addFormPage(state, headerArgs) {
  const page = state.pdf.addPage(LETTER);
  page.drawRectangle({ x: 0, y: 0, width: LETTER[0], height: LETTER[1], color: PAPER });
  state.page = page;
  state.pages.push(page);
  drawFormMasthead(state, headerArgs);
  return page;
}
function fitFormPage(state, neededHeight, headerArgs) {
  if (state.y - neededHeight > MARGIN + 54) return;
  addFormPage(state, headerArgs || { title: state.docTitle, subtitle: state.docSubtitle });
}
function drawFormSectionLabel(state, label) {
  fitFormPage(state, 20);
  state.page.drawText(text(label).toUpperCase(), {
    x: MARGIN,
    y: state.y,
    size: 9,
    font: state.fonts.sansBold,
    color: GOLD,
  });
  state.y -= 6;
  state.page.drawLine({
    start: { x: MARGIN, y: state.y },
    end: { x: LETTER[0] - MARGIN, y: state.y },
    thickness: 0.8,
    color: GOLD,
  });
  state.y -= 11;
}
function drawFormInfoRow(state, pairs) {
  fitFormPage(state, 26);
  const colWidth = (LETTER[0] - MARGIN * 2) / pairs.length;
  pairs.forEach((pair, i) => {
    const x = MARGIN + i * colWidth;
    state.page.drawText(text(pair.label).toUpperCase(), {
      x,
      y: state.y,
      size: 7.5,
      font: state.fonts.sansBold,
      color: MUTED,
    });
    state.page.drawText(text(pair.value || '—'), {
      x,
      y: state.y - 14,
      size: 10.5,
      font: state.fonts.serifBold,
      color: NAVY,
    });
  });
  state.y -= 28;
}
function drawFormGridTable(
  state,
  { heading, columns, flex, rows, boldRowIndexes = [], emptyLabel = 'None recorded yet.' }
) {
  if (heading) drawFormSectionLabel(state, heading);
  const widths = resolveColWidths(columns, flex);
  const drawHeader = () => {
    fitFormPage(state, 26, { title: state.docTitle, subtitle: state.docSubtitle });
    let x = MARGIN;
    state.page.drawRectangle({
      x: MARGIN,
      y: state.y - 14,
      width: LETTER[0] - MARGIN * 2,
      height: 18,
      color: NAVY_SOFT,
    });
    columns.forEach((col, i) => {
      state.page.drawText(text(col), { x: x + 6, y: state.y - 9, size: 7.5, font: state.fonts.sansBold, color: CREAM });
      x += widths[i];
    });
    state.y -= 21;
  };
  drawHeader();
  if (!rows.length) {
    fitFormPage(state, 18);
    state.page.drawRectangle({
      x: MARGIN,
      y: state.y - 15,
      width: LETTER[0] - MARGIN * 2,
      height: 18,
      borderColor: LINE,
      borderWidth: 0.4,
      color: PAPER,
    });
    state.page.drawText(text(emptyLabel), {
      x: MARGIN + 6,
      y: state.y - 10,
      size: 8,
      font: state.fonts.sans,
      color: MUTED,
    });
    state.y -= 21;
  }
  rows.forEach((row, rowIdx) => {
    const wrapped = row.map((cell, i) => wrapText(cell, state.fonts.sans, 8, widths[i] - 12).slice(0, 3));
    const rowHeight = Math.max(16, Math.max(...wrapped.map((ls) => ls.length)) * 10 + 6);
    if (state.y - rowHeight < MARGIN + 30) {
      addFormPage(state, { title: state.docTitle, subtitle: state.docSubtitle });
      drawHeader();
    }
    const bold = boldRowIndexes.includes(rowIdx);
    let x = MARGIN;
    state.page.drawRectangle({
      x: MARGIN,
      y: state.y - rowHeight + 4,
      width: LETTER[0] - MARGIN * 2,
      height: rowHeight,
      borderColor: LINE,
      borderWidth: 0.4,
      color: bold ? GOLD_SOFT : rowIdx % 2 === 0 ? rgb(1, 1, 0.98) : PAPER,
    });
    wrapped.forEach((lines, i) => {
      drawTextLines(state.page, lines, x + 6, state.y - 6, {
        font: bold ? state.fonts.sansBold : state.fonts.sans,
        size: 8,
        color: INK,
        leading: 10,
      });
      x += widths[i];
    });
    state.y -= rowHeight;
  });
  state.y -= 6;
}
function drawFormParagraph(state, lines, { size = 9.5, gap = 13 } = {}) {
  lines.forEach((line) => {
    const wrapped = wrapText(line, state.fonts.sans, size, LETTER[0] - MARGIN * 2);
    fitFormPage(state, wrapped.length * gap + 4);
    state.y =
      drawTextLines(state.page, wrapped, MARGIN, state.y, { font: state.fonts.sans, size, color: INK, leading: gap }) -
      4;
  });
}
function drawFormSignatureLines(state, labels) {
  fitFormPage(state, 40);
  const gap = 24;
  const colWidth = (LETTER[0] - MARGIN * 2 - gap * (labels.length - 1)) / labels.length;
  labels.forEach((label, i) => {
    const x = MARGIN + i * (colWidth + gap);
    state.page.drawLine({ start: { x, y: state.y }, end: { x: x + colWidth, y: state.y }, thickness: 0.8, color: INK });
    state.page.drawText(text(label), { x, y: state.y - 11, size: 8, font: state.fonts.sans, color: MUTED });
  });
  state.y -= 22;
}
function drawFormFooter(state, householdName, generatedAt) {
  state.pages.forEach((page, i) => {
    const note = `${text(householdName)} · Generated by AGAPAY Learn · ${text(generatedAt).slice(0, 10)}`;
    page.drawText(note, { x: MARGIN, y: 24, size: 7, font: state.fonts.sans, color: MUTED });
    const pageLabel = `Page ${i + 1} of ${state.pages.length}`;
    const pw = state.fonts.sans.widthOfTextAtSize(pageLabel, 7);
    page.drawText(pageLabel, { x: LETTER[0] - MARGIN - pw, y: 24, size: 7, font: state.fonts.sans, color: MUTED });
  });
}
function drawFormTwoColumnBlock(state, left, right) {
  fitFormPage(state, 24 + Math.max(left.fields.length, right.fields.length) * 14);
  const colWidth = (LETTER[0] - MARGIN * 2 - 20) / 2;
  const startY = state.y;
  [
    { x: MARGIN, spec: left },
    { x: MARGIN + colWidth + 20, spec: right },
  ].forEach(({ x, spec }) => {
    let y = startY;
    state.page.drawRectangle({ x, y: y - 12, width: colWidth, height: 14, color: NAVY_SOFT });
    state.page.drawText(text(spec.title).toUpperCase(), {
      x: x + 6,
      y: y - 9.5,
      size: 7.5,
      font: state.fonts.sansBold,
      color: CREAM,
    });
    y -= 22;
    spec.fields.forEach((field) => {
      const labelText = `${text(field.label).toUpperCase()}:`;
      state.page.drawText(labelText, { x, y, size: 7, font: state.fonts.sansBold, color: MUTED });
      const labelW = state.fonts.sansBold.widthOfTextAtSize(labelText, 7);
      if (field.value) {
        state.page.drawText(text(field.value), {
          x: x + labelW + 6,
          y: y - 1,
          size: 8.5,
          font: state.fonts.sans,
          color: INK,
        });
      } else {
        state.page.drawLine({
          start: { x: x + labelW + 6, y: y - 3 },
          end: { x: x + colWidth, y: y - 3 },
          thickness: 0.6,
          color: LINE,
        });
      }
      y -= 14;
    });
  });
  state.y = startY - 22 - Math.max(left.fields.length, right.fields.length) * 14 - 6;
}
function drawCompactCourseTable(state, x, width, { heading, rows, totals }) {
  const startY = state.y;
  state.page.drawText(text(heading), { x, y: startY, size: 9.5, font: state.fonts.serifBold, color: NAVY });
  const yearLabel = 'Year:';
  const yearFieldW = 55;
  const yearLabelW = state.fonts.sans.widthOfTextAtSize(yearLabel, 7);
  const yearX = x + width - yearFieldW - yearLabelW - 4;
  state.page.drawText(yearLabel, { x: yearX, y: startY, size: 7, font: state.fonts.sans, color: MUTED });
  state.page.drawLine({
    start: { x: yearX + yearLabelW + 4, y: startY - 2 },
    end: { x: x + width, y: startY - 2 },
    thickness: 0.6,
    color: LINE,
  });
  let y = startY - 11;
  state.page.drawLine({ start: { x, y }, end: { x: x + width, y }, thickness: 1, color: GOLD });
  y -= 10;
  const colWidths = [width * 0.56, width * 0.16, width * 0.12, width * 0.16];
  const columns = ['Course Title', 'Grade', 'Unit', 'GP'];
  state.page.drawRectangle({ x, y: y - 12, width, height: 14, color: NAVY_SOFT });
  let cx = x;
  columns.forEach((col, i) => {
    state.page.drawText(col, { x: cx + 4, y: y - 8.5, size: 6.5, font: state.fonts.sansBold, color: CREAM });
    cx += colWidths[i];
  });
  y -= 15;
  const drawRow = (cells, { bold = false, shade = null } = {}) => {
    const rowH = 12.5;
    state.page.drawRectangle({
      x,
      y: y - rowH + 3.5,
      width,
      height: rowH,
      borderColor: LINE,
      borderWidth: 0.35,
      color: shade || PAPER,
    });
    let cxr = x;
    cells.forEach((cell, i) => {
      const lines = wrapText(text(cell), bold ? state.fonts.sansBold : state.fonts.sans, 7, colWidths[i] - 6).slice(
        0,
        1
      );
      drawTextLines(state.page, lines, cxr + 4, y - 5.5, {
        font: bold ? state.fonts.sansBold : state.fonts.sans,
        size: 7,
        color: bold ? NAVY : INK,
        leading: 8,
      });
      cxr += colWidths[i];
    });
    y -= rowH;
  };
  if (!rows.length) {
    drawRow(['No courses recorded for this year yet.', '', '', '']);
  } else {
    rows.forEach((row, i) => drawRow(row, { shade: i % 2 === 0 ? rgb(1, 1, 0.98) : PAPER }));
  }
  drawRow(['Totals/Averages', '', totals.credit, totals.gp], { bold: true, shade: GOLD_SOFT });
  return y;
}
function drawSideBySideCourseTables(state, leftSpec, rightSpec) {
  fitFormPage(state, 170, { title: state.docTitle, subtitle: state.docSubtitle });
  const colWidth = (LETTER[0] - MARGIN * 2 - 20) / 2;
  const startY = state.y;
  const leftEndY = drawCompactCourseTable(state, MARGIN, colWidth, leftSpec);
  state.y = startY;
  const rightEndY = drawCompactCourseTable(state, MARGIN + colWidth + 20, colWidth, rightSpec);
  state.y = Math.min(leftEndY, rightEndY) - 10;
}
function drawFormScaleLine(state, label, items) {
  fitFormPage(state, 22);
  state.page.drawText(text(label).toUpperCase(), {
    x: MARGIN,
    y: state.y,
    size: 7.5,
    font: state.fonts.sansBold,
    color: GOLD,
  });
  state.y -= 11;
  const lines = wrapText(items.join('   '), state.fonts.sans, 7.5, LETTER[0] - MARGIN * 2);
  lines.forEach((line) => {
    fitFormPage(state, 11);
    state.page.drawText(line, { x: MARGIN, y: state.y, size: 7.5, font: state.fonts.sans, color: INK });
    state.y -= 11;
  });
  state.y -= 3;
}
async function buildAcademicReportCardPdf({
  household,
  child,
  academicYear,
  courses = [],
  attendance = null,
  generatedAt = /* @__PURE__ */ new Date().toISOString(),
} = {}) {
  const pdf = await PDFDocument.create();
  const fonts = await embedFonts(pdf);
  const markImage = await embedMarkLogo(pdf);
  const state = newFormState(pdf, fonts, markImage);
  const schoolName = text(household?.homeschoolName) || text(household?.name);
  state.docTitle = 'Report Card';
  state.docSubtitle = text(child?.firstName || child?.name);
  addFormPage(state, { title: 'Homeschool Report Card', subtitle: `${text(academicYear?.name)}` });
  drawFormInfoRow(state, [
    { label: 'Student', value: text(child?.firstName || child?.name) },
    { label: 'Grade', value: text(child?.gradeLabel) || (child?.gradeLevel ? `Grade ${child.gradeLevel}` : '') },
    { label: 'School Year', value: text(academicYear?.name) },
    { label: 'School', value: schoolName },
  ]);
  if (text(household?.patronSaintName)) {
    state.page.drawText(`Patron Saint: ${text(household.patronSaintName)}`, {
      x: MARGIN,
      y: state.y + 6,
      size: 8,
      font: state.fonts.sans,
      color: MUTED,
    });
    state.y -= 6;
  }
  const childCourses = courses.filter((course) => course.childId === child?.id);
  const coreCourses = childCourses.filter((course) => CORE_SUBJECT_CATEGORIES.has(course.subjectCategory));
  const electiveCourses = childCourses.filter((course) => !CORE_SUBJECT_CATEGORIES.has(course.subjectCategory));
  const termCount = Math.max(1, ...childCourses.map((course) => (course.grades || []).length), 3);
  const termColumns = Array.from({ length: Math.min(termCount, 3) }, (_, i) => `Term ${i + 1}`);
  const courseRow = (course) => [
    course.courseTitle,
    ...termColumns.map((_, i) => course.grades?.find((g) => g.termIndex === i + 1)?.letterGrade || '—'),
  ];
  drawFormGridTable(state, {
    heading: 'Core Courses',
    columns: ['Course', ...termColumns],
    flex: [2.2, ...termColumns.map(() => 0.7)],
    rows: coreCourses.map(courseRow),
    emptyLabel: 'No core courses recorded yet for this student.',
  });
  drawFormGridTable(state, {
    heading: 'Elective Courses',
    columns: ['Course', ...termColumns],
    flex: [2.2, ...termColumns.map(() => 0.7)],
    rows: electiveCourses.map(courseRow),
    emptyLabel: 'No elective courses recorded yet for this student.',
  });
  const childAttendance = attendance?.byChild?.find((row) => row.childId === child?.id);
  drawFormGridTable(state, {
    heading: 'Attendance This Term',
    columns: ['Present', 'Absent', 'Excused', 'Instructional Days'],
    flex: [1, 1, 1, 1],
    rows: childAttendance
      ? [
          [
            String(childAttendance.present || 0),
            String(childAttendance.absent || 0),
            String(childAttendance.excused || 0),
            String(childAttendance.instructionalDays || 0),
          ],
        ]
      : [],
    emptyLabel: 'No attendance recorded yet this term.',
  });
  drawFormSectionLabel(state, 'Grading Scale');
  drawFormGridTable(state, {
    columns: GRADE_PERCENT_RANGES.map(([letter]) => letter),
    flex: GRADE_PERCENT_RANGES.map(() => 1),
    rows: [GRADE_PERCENT_RANGES.map(([, range]) => range)],
  });
  const studentName = text(child?.firstName || child?.name, 'This student');
  const gradeLabel = text(child?.gradeLabel) || (child?.gradeLevel ? `Grade ${child.gradeLevel}` : 'the current grade');
  drawFormParagraph(state, [
    `I certify that ${studentName} has met the requirements to advance to ${nextGradeLabel(child?.gradeLevel)}, and that the information presented is accurate to the performance achieved for ${gradeLabel}.`,
  ]);
  state.y -= 10;
  drawFormSignatureLines(state, ['Parent / Teacher Signature', 'Date']);
  drawFormFooter(state, household?.name, generatedAt);
  return pdf.save();
}
async function buildAcademicTranscriptPdf({
  household,
  child,
  courses = [],
  attendance = null,
  testScores = [],
  generatedAt = /* @__PURE__ */ new Date().toISOString(),
} = {}) {
  const pdf = await PDFDocument.create();
  const fonts = await embedFonts(pdf);
  const markImage = await embedMarkLogo(pdf);
  const state = newFormState(pdf, fonts, markImage);
  const schoolName = text(household?.homeschoolName) || text(household?.name);
  state.docTitle = 'Official Transcript';
  state.docSubtitle = text(child?.firstName || child?.name);
  const headerArgs = { title: 'Homeschool Official Transcript', subtitle: schoolName };
  addFormPage(state, headerArgs);
  const schoolFields = [{ label: 'School Name', value: schoolName }];
  if (text(household?.patronSaintName))
    schoolFields.push({ label: 'Patron Saint', value: text(household.patronSaintName) });
  schoolFields.push({ label: 'Address', value: '' }, { label: 'Email', value: '' }, { label: 'Phone #', value: '' });
  drawFormTwoColumnBlock(
    state,
    {
      title: 'School Information',
      fields: schoolFields,
    },
    {
      title: 'Student Information',
      fields: [
        { label: 'Student Name', value: text(child?.firstName || child?.name) },
        { label: 'Address', value: '' },
        { label: 'D.O.B.', value: '' },
        { label: 'Email', value: '' },
        { label: 'Phone #', value: '' },
      ],
    }
  );
  const childCourses = courses.filter((course) => course.childId === child?.id);
  let totalCredits = 0;
  let totalPoints = 0;
  const yearSpec = (gradeLevel) => {
    const yearCourses = childCourses.filter((course) => Number(course.gradeLevel) === gradeLevel);
    let yearCredits = 0;
    let yearPoints = 0;
    const rows = yearCourses.map((course) => {
      const finalGrade = finalCourseGrade(course);
      const credit = Number(course.creditHours) || 0;
      const points = courseGradePoints(course);
      if (points !== null) {
        yearCredits += credit;
        yearPoints += points;
      }
      return [
        course.courseTitle,
        finalGrade || 'In Progress',
        credit ? credit.toFixed(1) : '—',
        points === null ? '—' : points.toFixed(2),
      ];
    });
    totalCredits += yearCredits;
    totalPoints += yearPoints;
    return {
      heading: GRADE_LEVEL_NAMES[gradeLevel].replace(' Year', ''),
      rows,
      totals: { credit: yearCredits.toFixed(1), gp: yearPoints.toFixed(2) },
    };
  };
  drawFormSectionLabel(state, 'Academic History');
  drawSideBySideCourseTables(state, yearSpec(9), yearSpec(10));
  drawSideBySideCourseTables(state, yearSpec(11), yearSpec(12));
  const finalGpa = totalCredits > 0 ? (totalPoints / totalCredits).toFixed(2) : '0.00';
  drawFormSectionLabel(state, 'Summary');
  drawFormInfoRow(state, [
    { label: 'Graduation Date', value: '' },
    { label: 'Total Graduation Units', value: totalCredits.toFixed(1) },
    { label: 'Cumulative GPA', value: finalGpa },
  ]);
  drawFormSectionLabel(state, 'Grading Scale');
  drawFormScaleLine(
    state,
    'Grading System',
    GRADE_PERCENT_RANGES.map(([letter, range]) => `${letter} = ${range}`)
  );
  drawFormScaleLine(
    state,
    'GPA Scale',
    GRADE_PERCENT_RANGES.map(([letter]) => `${letter} = ${(getGPAPoints(letter) ?? 0).toFixed(2)}`)
  );
  const scoreCell = (value) => (value === null || value === void 0 || value === '' ? '' : String(value));
  const actScores = testScores.filter((row) => row.testType === 'ACT');
  const satScores = testScores.filter((row) => row.testType === 'SAT');
  drawFormSectionLabel(state, 'Test Scores');
  drawFormGridTable(state, {
    columns: ['Date', 'Test', 'Composite', 'English', 'Math', 'Reading', 'Science', 'Writing'],
    flex: [1, 0.7, 1, 1, 1, 1, 1, 1],
    rows: (actScores.length ? actScores : [null]).map((row) =>
      row
        ? [
            row.testDate || '',
            'ACT',
            scoreCell(row.compositeScore),
            scoreCell(row.englishScore),
            scoreCell(row.mathScore),
            scoreCell(row.readingScore),
            scoreCell(row.scienceScore),
            scoreCell(row.writingScore),
          ]
        : ['', 'ACT', '', '', '', '', '', '']
    ),
  });
  drawFormGridTable(state, {
    columns: ['Date', 'Test', 'Total Score', 'Reading/Writing', 'Math'],
    flex: [1, 0.7, 1, 1, 1],
    rows: (satScores.length ? satScores : [null]).map((row) =>
      row
        ? [
            row.testDate || '',
            'SAT',
            scoreCell(row.totalScore),
            scoreCell(row.readingWritingScore),
            scoreCell(row.mathScore),
          ]
        : ['', 'SAT', '', '', '']
    ),
  });
  drawFormSectionLabel(state, 'Signatures');
  drawFormParagraph(state, ["Home Educator's Name / Signature:"], { size: 9 });
  drawFormSignatureLines(state, ['Print', 'Sign', 'Date']);
  drawFormFooter(state, household?.name, generatedAt);
  return pdf.save();
}
export {
  addFormPage,
  buildAcademicReportCardPdf,
  buildAcademicTranscriptPdf,
  courseGradePoints,
  drawCompactCourseTable,
  drawFormFooter,
  drawFormGridTable,
  drawFormInfoRow,
  drawFormMasthead,
  drawFormParagraph,
  drawFormScaleLine,
  drawFormSectionLabel,
  drawFormSignatureLines,
  drawFormTwoColumnBlock,
  drawSideBySideCourseTables,
  embedMarkLogo,
  finalCourseGrade,
  fitFormPage,
  newFormState,
  nextGradeLabel,
};
