import type {
  PDFFont,
  PDFPage,
  RGB,
  DesignedAssignment,
  PrintCard,
  PrintDay,
  PrintSection,
  PrintDocument,
  PdfState,
  DesignedForm,
  LandscapeRow,
} from './print-documents-composition-contracts.js';

import { rgb } from 'pdf-lib';

import './gpa.js';
import {
  DAYS,
  LETTER,
  LANDSCAPE,
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
  BURGUNDY,
  FAST_BG,
  FEAST_BG,
} from './print-documents-shared.js';
import { fetchBytes, text } from './print-documents-shared.js';

// Match Boolean filtering while exposing its non-null result to TypeScript.
function truthyPrintLayout<T>(value: T | null | undefined | false): value is NonNullable<T> {
  return Boolean(value);
}

export function wrapText(value: unknown, font: PDFFont, fontSize: number, maxWidth: number) {
  const words = text(value).split(/\s+/).filter(truthyPrintLayout);
  const lines = [];
  let line = '';
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
  return lines.length ? lines : [''];
}
export function drawTextLines(
  page: PDFPage,
  lines: string[],
  x: number,
  y: number,
  { font, size, color, leading = size + 4 }: { font: PDFFont; size: number; color: RGB; leading?: number }
) {
  lines.forEach((line, i) => page.drawText(line, { x, y: y - i * leading, size, font, color }));
  return y - lines.length * leading;
}
export function fitPage(state: PdfState, neededHeight: number) {
  if (state.y - neededHeight > MARGIN + 28) return;
  addPage(state);
}
export function drawOrthCross(page: PDFPage, cx: number, cy: number, size: number, color: RGB) {
  const arm = size * 0.42;
  const thick = size * 0.11;
  const slab = size * 0.22; // cross-arm length at top & bottom
  // Vertical bar
  page.drawRectangle({ x: cx - thick / 2, y: cy - arm, width: thick, height: arm * 2, color });
  // Main horizontal bar
  page.drawRectangle({ x: cx - arm, y: cy - thick / 2, width: arm * 2, height: thick, color });
  // Titulus (top short bar)
  const titY = cy + arm * 0.52;
  page.drawRectangle({ x: cx - slab / 2, y: titY, width: slab, height: thick * 0.75, color });
  // Suppedaneum (bottom slanted bar — approximated as tilted rectangle via two triangles)
  const supY = cy - arm * 0.5;
  const supW = slab * 1.1;
  const supH = thick * 0.75;
  page.drawRectangle({ x: cx - supW / 2, y: supY - supH / 2, width: supW, height: supH, color });
}
export function addPage(state: PdfState, sectionLabel?: string | undefined) {
  const page = state.pdf.addPage(LETTER);
  // Full warm-paper background
  page.drawRectangle({ x: 0, y: 0, width: LETTER[0], height: LETTER[1], color: PAPER });
  // Navy header band
  page.drawRectangle({ x: 0, y: LETTER[1] - 72, width: LETTER[0], height: 72, color: NAVY });
  // Wordmark
  page.drawText('AGAPAY LEARN', { x: MARGIN, y: LETTER[1] - 30, size: 11, font: state.fonts.sansBold, color: GOLD });
  // Section label on continuation pages
  const secLabel = sectionLabel || state.currentSectionHeading || 'Print Shop';
  page.drawText(text(secLabel), { x: MARGIN, y: LETTER[1] - 50, size: 8, font: state.fonts.sans, color: CREAM });
  // Small gold rule only — logo lives on cover page
  page.drawLine({
    start: { x: LETTER[0] - MARGIN - 28, y: LETTER[1] - 20 },
    end: { x: LETTER[0] - MARGIN - 28, y: LETTER[1] - 60 },
    thickness: 0.5,
    color: GOLD_SOFT,
  });
  // Gold rule under header
  page.drawLine({
    start: { x: MARGIN, y: LETTER[1] - 80 },
    end: { x: LETTER[0] - MARGIN, y: LETTER[1] - 80 },
    thickness: 1,
    color: GOLD,
  });
  state.page = page;
  state.pages.push(page);
  state.y = LETTER[1] - 110;
}
export async function drawCoverPage(state: PdfState, document: PrintDocument) {
  const page = state.pdf.addPage(LETTER);
  const W = LETTER[0],
    H = LETTER[1];

  // Full navy background
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: NAVY });

  // Cream decorative border (inner frame)
  const bm = 36;
  page.drawRectangle({
    x: bm,
    y: bm,
    width: W - bm * 2,
    height: H - bm * 2,
    borderColor: GOLD_SOFT,
    borderWidth: 1.2,
    color: NAVY,
  });

  // mark.png logo — embedded PNG, centered near top
  try {
    const markBytes = await fetchBytes('https://agapay.app/mark.png');
    const markImg = await state.pdf.embedPng(markBytes);
    const markSize = 80;
    const markDims = markImg.scale(markSize / markImg.width);
    page.drawImage(markImg, {
      x: (W - markDims.width) / 2,
      y: H - 80 - markDims.height,
      width: markDims.width,
      height: markDims.height,
    });
  } catch {
    // If the logo can't be fetched, fall back to a simple gold cross drawn with lines
    const cx = W / 2,
      cy = H - 150,
      arm = 28,
      thick = 8;
    page.drawRectangle({ x: cx - thick / 2, y: cy - arm, width: thick, height: arm * 2, color: GOLD });
    page.drawRectangle({ x: cx - arm, y: cy - thick / 2, width: arm * 2, height: thick, color: GOLD });
  }

  // Product badge
  page.drawText('AGAPAY LEARN', { x: W / 2 - 52, y: H - 232, size: 10, font: state.fonts.sansBold, color: GOLD });
  page.drawText('Print Shop', { x: W / 2 - 22, y: H - 248, size: 9, font: state.fonts.sans, color: CREAM });

  // Gold separator
  const sepW = 200;
  page.drawLine({
    start: { x: W / 2 - sepW / 2, y: H - 268 },
    end: { x: W / 2 + sepW / 2, y: H - 268 },
    thickness: 0.8,
    color: GOLD,
  });

  // Document title — Cormorant Garamond, large
  const titleFontSize = 36;
  const titleWords = wrapText(document.title, state.fonts.serifBold, titleFontSize, W - 160).slice(0, 3);
  const titleBlockH = titleWords.length * 40;
  const titleY = H / 2 + titleBlockH / 2 + 30;
  titleWords.forEach((line, i) => {
    const lw = state.fonts.serifBold.widthOfTextAtSize(line, titleFontSize);
    page.drawText(line, {
      x: (W - lw) / 2,
      y: titleY - i * 42,
      size: titleFontSize,
      font: state.fonts.serifBold,
      color: CREAM,
    });
  });

  // Subtitle
  const subFontSize = 11;
  const subLines = wrapText(document.subtitle, state.fonts.sans, subFontSize, W - 160).slice(0, 2);
  subLines.forEach((line, i) => {
    const lw = state.fonts.sans.widthOfTextAtSize(line, subFontSize);
    page.drawText(line, {
      x: (W - lw) / 2,
      y: titleY - titleBlockH - 32 - i * 15,
      size: subFontSize,
      font: state.fonts.sans,
      color: GOLD_SOFT,
    });
  });

  // Bottom household name block
  page.drawLine({
    start: { x: W / 2 - sepW / 2, y: 130 },
    end: { x: W / 2 + sepW / 2, y: 130 },
    thickness: 0.6,
    color: GOLD,
  });
  const hhLine = text(document.household || 'Household');
  const hhW = state.fonts.sansBold.widthOfTextAtSize(hhLine, 10);
  page.drawText(hhLine, { x: (W - hhW) / 2, y: 112, size: 10, font: state.fonts.sansBold, color: CREAM });
  const dateLine = `Generated ${document.generatedAt?.slice(0, 10) || ''}`;
  const dateW = state.fonts.sans.widthOfTextAtSize(dateLine, 8);
  page.drawText(dateLine, { x: (W - dateW) / 2, y: 96, size: 8, font: state.fonts.sans, color: MUTED });

  state.pages.push(page);
}
export function drawHeading(state: PdfState, heading: string | undefined) {
  fitPage(state, 44);
  state.currentSectionHeading = heading;
  const y = state.y;
  state.page.drawText(text(heading).toUpperCase(), { x: MARGIN, y, size: 9, font: state.fonts.sansBold, color: GOLD });
  state.y -= 14;
  state.page.drawLine({
    start: { x: MARGIN, y: state.y },
    end: { x: LETTER[0] - MARGIN, y: state.y },
    thickness: 0.6,
    color: LINE,
  });
  state.y -= 14;
}
export function drawCards(state: PdfState, section: PrintSection & { type: 'cards'; items: PrintCard[] }) {
  drawHeading(state, section.heading);
  const cardW = (LETTER[0] - MARGIN * 2 - 14) / 2;
  section.items.forEach((item, i) => {
    const x = MARGIN + (i % 2) * (cardW + 14);
    if (i % 2 === 0) fitPage(state, 78);
    const y = state.y;
    state.page.drawRectangle({
      x,
      y: y - 60,
      width: cardW,
      height: 60,
      borderColor: LINE,
      borderWidth: 0.6,
      color: CREAM,
    });
    // gold top accent strip
    state.page.drawRectangle({ x, y: y - 5, width: cardW, height: 5, color: GOLD_SOFT });
    state.page.drawText(text(item.label), { x: x + 10, y: y - 20, size: 8, font: state.fonts.sansBold, color: GOLD });
    state.page.drawText(text(item.value || ''), {
      x: x + 10,
      y: y - 36,
      size: 14,
      font: state.fonts.serifBold,
      color: NAVY,
    });
    drawTextLines(
      state.page,
      wrapText(item.detail || '', state.fonts.sans, 7.5, cardW - 20).slice(0, 2),
      x + 10,
      y - 48,
      { font: state.fonts.sans, size: 7.5, color: MUTED, leading: 9 }
    );
    if (i % 2 === 1 || i === section.items.length - 1) state.y -= 76;
  });
  state.y -= 8;
}
export function drawList(state: PdfState, section: PrintSection & { type: 'list'; items: PrintCard[] }) {
  drawHeading(state, section.heading);
  section.items.forEach((item) => {
    const combined = [item.label, item.detail].filter(truthyPrintLayout).join(' · ');
    const lines = wrapText(combined, state.fonts.sans, 9, LETTER[0] - MARGIN * 2 - 22);
    fitPage(state, lines.length * 12 + 12);
    // Gold bullet bullet
    state.page.drawText('•', { x: MARGIN + 2, y: state.y, size: 6, font: state.fonts.sansBold, color: GOLD });
    state.y =
      drawTextLines(state.page, lines, MARGIN + 16, state.y, {
        font: state.fonts.sans,
        size: 9,
        color: INK,
        leading: 12,
      }) - 4;
  });
  state.y -= 8;
}
export function drawNotesLines(state: PdfState, section: Extract<PrintSection, { type: 'notes' }>) {
  drawHeading(state, section.heading || 'Mom Notes');
  const lineCount = Math.max(1, Number(section.lineCount) || 5);
  const lineGap = 22;
  fitPage(state, lineCount * lineGap + 6);
  for (let i = 0; i < lineCount; i += 1) {
    const y = state.y - i * lineGap;
    state.page.drawLine({ start: { x: MARGIN, y }, end: { x: LETTER[0] - MARGIN, y }, thickness: 0.6, color: LINE });
  }
  state.y -= lineCount * lineGap + 10;
}
export function resolveColWidths(columns: string[], flex: number[] | null | undefined) {
  const available = LETTER[0] - MARGIN * 2;
  if (flex && flex.length === columns.length) {
    const total = flex.reduce((a, b) => a + b, 0);
    return flex.map((f) => (f / total) * available);
  }
  // Legacy fallback
  if (columns.length === 3) return [130, 300, 80];
  if (columns.length === 4) return [70, 90, 170, 180];
  if (columns.length === 6) return columns.map((_, i) => (i === 0 ? 150 : 72));
  return columns.map(() => available / columns.length);
}
export function drawTable(state: PdfState, section: Extract<PrintSection, { type: 'table' }>) {
  drawHeading(state, section.heading);
  const widths = resolveColWidths(section.columns, section.flex);

  const drawHeader = () => {
    fitPage(state, 32);
    let x = MARGIN;
    state.page.drawRectangle({
      x: MARGIN,
      y: state.y - 20,
      width: LETTER[0] - MARGIN * 2,
      height: 24,
      color: NAVY_SOFT,
    });
    section.columns.forEach((col, i) => {
      state.page.drawText(text(col), { x: x + 5, y: state.y - 12, size: 7, font: state.fonts.sansBold, color: CREAM });
      x += widths[i];
    });
    state.y -= 28;
  };

  drawHeader();
  section.rows.forEach((row, rowIdx) => {
    const wrapped = row.map((cell, i) => wrapText(cell, state.fonts.sans, 8, widths[i] - 10).slice(0, 4));
    const rowHeight = Math.max(22, Math.max(...wrapped.map((ls) => ls.length)) * 10 + 8);
    if (state.y - rowHeight < MARGIN + 32) {
      addPage(state, section.heading);
      drawHeader();
    }
    const rowBg = rowIdx % 2 === 0 ? rgb(1, 1, 0.98) : PAPER;
    let x = MARGIN;
    state.page.drawRectangle({
      x: MARGIN,
      y: state.y - rowHeight + 4,
      width: LETTER[0] - MARGIN * 2,
      height: rowHeight,
      borderColor: LINE,
      borderWidth: 0.35,
      color: rowBg,
    });
    wrapped.forEach((lines, i) => {
      drawTextLines(state.page, lines, x + 5, state.y - 7, {
        font: state.fonts.sans,
        size: 8,
        color: INK,
        leading: 10,
      });
      x += widths[i];
    });
    state.y -= rowHeight;
  });
  state.y -= 12;
}
export function drawCheckboxes(state: PdfState, section: Extract<PrintSection, { type: 'checkboxes' }>) {
  drawHeading(state, section.heading);
  const days = section.days || [];
  const subjects = section.subjects || [];
  const colW = 52;
  const labelW = LETTER[0] - MARGIN * 2 - days.length * colW;
  const rowH = 22;

  // Header row
  fitPage(state, rowH + 4);
  state.page.drawRectangle({
    x: MARGIN,
    y: state.y - rowH,
    width: LETTER[0] - MARGIN * 2,
    height: rowH,
    color: NAVY_SOFT,
  });
  days.forEach((day, i) => {
    state.page.drawText(day, {
      x: MARGIN + labelW + i * colW + (colW - state.fonts.sansBold.widthOfTextAtSize(day, 8)) / 2,
      y: state.y - 12,
      size: 8,
      font: state.fonts.sansBold,
      color: CREAM,
    });
  });
  state.y -= rowH + 2;

  subjects.forEach((subject, si) => {
    fitPage(state, rowH + 2);
    const rowBg = si % 2 === 0 ? rgb(1, 1, 0.98) : PAPER;
    state.page.drawRectangle({
      x: MARGIN,
      y: state.y - rowH + 2,
      width: LETTER[0] - MARGIN * 2,
      height: rowH,
      borderColor: LINE,
      borderWidth: 0.3,
      color: rowBg,
    });
    state.page.drawText(subject, { x: MARGIN + 6, y: state.y - 11, size: 8.5, font: state.fonts.sans, color: INK });
    days.forEach((_, i) => {
      const cx = MARGIN + labelW + i * colW + (colW - 11) / 2;
      const cy = state.y - rowH + 5;
      // Actual drawn checkbox rectangle
      state.page.drawRectangle({
        x: cx,
        y: cy,
        width: 11,
        height: 11,
        borderColor: GOLD,
        borderWidth: 0.9,
        color: CREAM,
      });
    });
    state.y -= rowH;
  });
  state.y -= 10;
}
export function drawLiturgicalStrip(state: PdfState, section: PrintSection & { type: 'liturgical'; days: PrintDay[] }) {
  drawHeading(state, section.heading);
  const days = (section.days || []).slice(0, 7);
  const tileW = Math.floor((LETTER[0] - MARGIN * 2) / 7);
  const tileH = 72;

  fitPage(state, tileH + 16);

  days.forEach((day, i) => {
    const x = MARGIN + i * tileW;
    const y = state.y;
    const isFast = day.isFastDay || day.fastingRule;
    const isFeast = !isFast && (day.title || day.feastTitle);
    const bgCol = isFast ? FAST_BG : isFeast ? FEAST_BG : CREAM;
    const accent = isFast ? BURGUNDY : GOLD;

    // Tile background
    state.page.drawRectangle({
      x,
      y: y - tileH,
      width: tileW - 2,
      height: tileH,
      borderColor: LINE,
      borderWidth: 0.5,
      color: bgCol,
    });
    // Accent top band
    state.page.drawRectangle({ x, y: y - 5, width: tileW - 2, height: 5, color: accent });

    // Weekday label
    const wday = text(day.weekday || '').slice(0, 3);
    state.page.drawText(wday, { x: x + 4, y: y - 18, size: 7, font: state.fonts.sansBold, color: accent });
    // Day number
    const dayNum = text(day.date || day.dayNumber || '');
    state.page.drawText(dayNum, { x: x + 4, y: y - 30, size: 14, font: state.fonts.serifBold, color: NAVY });
    // Feast/fast label — wrap tightly
    const label = text(day.title || day.feastTitle || (isFast ? day.fastingType || 'Fast' : ''));
    const labelLines = wrapText(label, state.fonts.sans, 6.5, tileW - 10).slice(0, 3);
    labelLines.forEach((line, li) => {
      state.page.drawText(line, {
        x: x + 4,
        y: y - 45 - li * 9,
        size: 6.5,
        font: state.fonts.sans,
        color: isFast ? BURGUNDY : INK,
      });
    });
  });
  state.y -= tileH + 14;
}
export function drawCalendarGrid(state: PdfState, section: PrintSection & { type: 'calendar-grid'; days: PrintDay[] }) {
  drawHeading(state, section.heading);
  const days = section.days || [];
  const tileW = Math.floor((LETTER[0] - MARGIN * 2) / 7);
  const tileH = 66;

  // Day-of-week header
  fitPage(state, 20);
  DAYS.forEach((d, i) => {
    const x = MARGIN + i * tileW;
    state.page.drawRectangle({ x, y: state.y - 18, width: tileW - 1, height: 20, color: NAVY_SOFT });
    state.page.drawText(d, {
      x: x + (tileW - 1 - state.fonts.sansBold.widthOfTextAtSize(d, 8)) / 2,
      y: state.y - 12,
      size: 8,
      font: state.fonts.sansBold,
      color: CREAM,
    });
  });
  state.y -= 24;

  // Weeks (7 days per row)
  for (let wi = 0; wi < days.length; wi += 7) {
    const week = days.slice(wi, wi + 7);
    fitPage(state, tileH + 2);
    week.forEach((day, di) => {
      if (!day) return;
      const x = MARGIN + di * tileW;
      const y = state.y;
      const inMonth = day.inMonth !== false;
      const isFast = inMonth && day.isFastDay;
      const isFeast = inMonth && !isFast && (day.feastTitle || day.feastMarker);
      const bgCol = !inMonth ? rgb(0.94, 0.93, 0.9) : isFast ? FAST_BG : isFeast ? FEAST_BG : CREAM;
      const numCol = !inMonth ? MUTED : isFast ? BURGUNDY : NAVY;

      state.page.drawRectangle({
        x,
        y: y - tileH,
        width: tileW - 1,
        height: tileH,
        borderColor: LINE,
        borderWidth: 0.35,
        color: bgCol,
      });
      // Day number
      state.page.drawText(text(day.dayNumber || ''), {
        x: x + 4,
        y: y - 14,
        size: 13,
        font: state.fonts.serifBold,
        color: numCol,
      });
      // Old-style date (e.g. "12/25") — small, top right
      if (day.oldStyleDateLabel && inMonth) {
        const osText = text(day.oldStyleDateLabel);
        const osW = state.fonts.sans.widthOfTextAtSize(osText, 6);
        state.page.drawText(osText, {
          x: x + tileW - osW - 5,
          y: y - 14,
          size: 6,
          font: state.fonts.sans,
          color: MUTED,
        });
      }
      // Feast title
      if (isFeast || isFast) {
        const label = text(day.feastTitle || day.fastingType || day.fastingRule || 'Fast');
        const lLines = wrapText(label, state.fonts.sans, 6, tileW - 10).slice(0, 2);
        lLines.forEach((line, li) => {
          state.page.drawText(line, {
            x: x + 4,
            y: y - 28 - li * 8,
            size: 6,
            font: state.fonts.sans,
            color: isFast ? BURGUNDY : GOLD,
          });
        });
      }
      // Plan preview
      const planItems = [...(day.householdPlan || []), ...(day.formPlan || [])].slice(0, 2).map((p) => p.title);
      planItems.forEach((item, pi) => {
        const planLine = wrapText(item, state.fonts.sans, 6, tileW - 10)[0] || '';
        state.page.drawText(planLine, { x: x + 4, y: y - 44 - pi * 9, size: 6, font: state.fonts.sans, color: MUTED });
      });
    });
    state.y -= tileH + 1;
  }
  state.y -= 10;
}
export function drawDesignedWeek(state: PdfState, section: Extract<PrintSection, { type: 'designed-week' }>) {
  drawHeading(state, section.heading);
  const days = (section.days || []).slice(0, 7);
  days.forEach((day) => {
    const assignments = day.assignments || [];
    const assignmentHeights = assignments.map((item) => {
      const note = item.note || item.sub || '';
      const noteLines = note ? wrapText(note, state.fonts.sans, 7.5, LETTER[0] - MARGIN * 2 - 44).slice(0, 3) : [];
      return 34 + noteLines.length * 9;
    });
    const dayHeight = Math.max(
      78,
      42 + (assignments.length ? assignmentHeights.reduce((sum, value) => sum + value + 7, 0) : 30)
    );
    fitPage(state, dayHeight + 14);
    const x = MARGIN;
    const y = state.y;
    const width = LETTER[0] - MARGIN * 2;
    const accent = day.isSunday ? BURGUNDY : GOLD;
    state.page.drawRectangle({
      x,
      y: y - dayHeight,
      width,
      height: dayHeight,
      borderColor: LINE,
      borderWidth: 0.6,
      color: CREAM,
    });
    state.page.drawRectangle({ x, y: y - 7, width, height: 7, color: accent });
    state.page.drawText(text(day.weekday || 'Day'), {
      x: x + 14,
      y: y - 25,
      size: 15,
      font: state.fonts.serifBold,
      color: NAVY,
    });
    state.page.drawText(text([day.shortDate || day.date, day.feast].filter(truthyPrintLayout).join(' · ')), {
      x: x + 150,
      y: y - 22,
      size: 8,
      font: state.fonts.sans,
      color: MUTED,
    });
    let innerY = y - 45;
    if (!assignments.length) {
      state.page.drawText(
        day.isSunday ? 'Church, rest, and family rhythm.' : 'Open space for lessons, reading, or recovery.',
        {
          x: x + 14,
          y: innerY,
          size: 9,
          font: state.fonts.sans,
          color: MUTED,
        }
      );
    }
    assignments.forEach((item, index) => {
      const note = item.note || item.sub || '';
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
        color: index % 2 === 0 ? PAPER : rgb(1, 0.98, 0.92),
      });
      state.page.drawRectangle({
        x: x + 14,
        y: blockY - blockHeight + 8,
        width: 4,
        height: blockHeight,
        color: accent,
      });
      state.page.drawText(text(item.title), {
        x: x + 25,
        y: blockY - 6,
        size: 9,
        font: state.fonts.sansBold,
        color: INK,
      });
      if (item.sub && item.sub !== note) {
        state.page.drawText(text(item.sub).slice(0, 82), {
          x: x + 25,
          y: blockY - 17,
          size: 7,
          font: state.fonts.sans,
          color: MUTED,
        });
      }
      noteLines.forEach((line, li) => {
        state.page.drawText(line, {
          x: x + 25,
          y: blockY - 18 - li * 9,
          size: 7.5,
          font: state.fonts.sans,
          color: MUTED,
        });
      });
      innerY -= blockHeight + 7;
    });
    state.y -= dayHeight + 13;
  });
  state.y -= 4;
}
export function renderDesignedWeekFormsLandscape(document: PrintDocument, state: PdfState) {
  const forms: DesignedForm[] =
    Array.isArray(document.designedForms) && document.designedForms.length
      ? document.designedForms
      : [{ label: 'Household', days: [] }];
  const W = LANDSCAPE[0];
  const H = LANDSCAPE[1];
  const pageMargin = 30;
  const tableTop = H - 130;
  const tableBottom = 72;
  const tableW = W - pageMargin * 2;
  const subjectW = 142;
  const dayW = (tableW - subjectW) / 7;
  const headerH = 32;
  const minRowH = 32;
  const maxRowsPerPage = 12;
  const rowKey = (item: DesignedAssignment) => [item.id || '', item.title || '', item.sub || ''].join('::');
  const rowsForForm = (form: DesignedForm) => {
    const rows = new Map<string, LandscapeRow>();
    (form.days || []).slice(0, 7).forEach((day, dayIndex) => {
      (day.assignments || []).forEach((item) => {
        const key = rowKey(item);
        if (!rows.has(key)) {
          rows.set(key, {
            title: item.title || 'Subject',
            sub: item.sub || '',
            cells: Array.from({ length: 7 }, () => []),
          });
        }
        const note = item.note || item.sub || 'Assigned';
        rows.get(key)!.cells[dayIndex].push(note);
      });
    });
    return Array.from(rows.values()).sort((a, b) => a.title.localeCompare(b.title));
  };
  const splitRows = (rows: LandscapeRow[]) => {
    if (!rows.length) return [[]];
    const chunks = [];
    for (let i = 0; i < rows.length; i += maxRowsPerPage) chunks.push(rows.slice(i, i + maxRowsPerPage));
    return chunks;
  };
  const formPages = forms.flatMap((form) =>
    splitRows(rowsForForm(form)).map((rows, chunkIndex, chunks) => ({
      ...form,
      rows,
      chunkIndex,
      chunkCount: chunks.length,
    }))
  );

  formPages.forEach((form, pageIndex) => {
    const page = state.pdf.addPage(LANDSCAPE);
    state.pages.push(page);
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: PAPER });
    page.drawRectangle({ x: 0, y: H - 92, width: W, height: 92, color: NAVY });
    page.drawText('AGAPAY LEARN', { x: pageMargin, y: H - 28, size: 9, font: state.fonts.sansBold, color: GOLD });
    page.drawText(text(form.label === 'Family' ? 'Family Learning' : `Lessons — ${form.label}`), {
      x: pageMargin,
      y: H - 55,
      size: 20,
      font: state.fonts.serifBold,
      color: CREAM,
    });
    const subtitle =
      wrapText(document.subtitle || '', state.fonts.sans, 8.5, W - pageMargin * 2 - 190).slice(0, 1)[0] || '';
    if (subtitle)
      page.drawText(subtitle, { x: pageMargin, y: H - 76, size: 8.5, font: state.fonts.sans, color: GOLD_SOFT });
    page.drawText(text(form.label || 'Household'), {
      x: W - pageMargin - 170,
      y: H - 38,
      size: 22,
      font: state.fonts.serifBold,
      color: GOLD_SOFT,
    });
    if (form.chunkCount > 1) {
      page.drawText(`Sheet ${form.chunkIndex + 1} of ${form.chunkCount}`, {
        x: W - pageMargin - 170,
        y: H - 58,
        size: 8,
        font: state.fonts.sansBold,
        color: CREAM,
      });
    }

    page.drawRectangle({ x: pageMargin, y: tableTop - headerH, width: subjectW, height: headerH, color: NAVY_SOFT });
    page.drawText('Subject / Resource', {
      x: pageMargin + 9,
      y: tableTop - 20,
      size: 8.5,
      font: state.fonts.sansBold,
      color: CREAM,
    });
    const days = (form.days || []).slice(0, 7);
    DAYS.forEach((fallbackDay, index) => {
      const day = days[index] || {};
      const x = pageMargin + subjectW + index * dayW;
      const color = day.isSunday ? BURGUNDY : GOLD;
      page.drawRectangle({ x, y: tableTop - headerH, width: dayW, height: headerH, color });
      page.drawText(text(day.weekday || fallbackDay), {
        x: x + 7,
        y: tableTop - 14,
        size: 8,
        font: state.fonts.sansBold,
        color: PAPER,
      });
      page.drawText(text(day.shortDate || day.date || ''), {
        x: x + 7,
        y: tableTop - 27,
        size: 6.2,
        font: state.fonts.sans,
        color: PAPER,
      });
    });

    const rows = form.rows || [];
    const availableH = tableTop - headerH - tableBottom;
    const rowH = rows.length ? Math.max(minRowH, Math.min(46, availableH / rows.length)) : availableH;
    if (!rows.length) {
      page.drawRectangle({
        x: pageMargin,
        y: tableBottom,
        width: tableW,
        height: availableH,
        borderColor: LINE,
        borderWidth: 0.6,
        color: CREAM,
      });
      page.drawText('No lessons have been placed for this form yet.', {
        x: pageMargin + 14,
        y: tableTop - headerH - 28,
        size: 10,
        font: state.fonts.sansBold,
        color: MUTED,
      });
    }
    rows.forEach((row, rowIndex) => {
      const y = tableTop - headerH - (rowIndex + 1) * rowH;
      const fill = rowIndex % 2 === 0 ? PAPER : rgb(1, 0.98, 0.92);
      page.drawRectangle({
        x: pageMargin,
        y,
        width: subjectW,
        height: rowH,
        borderColor: LINE,
        borderWidth: 0.45,
        color: fill,
      });
      wrapText(row.title, state.fonts.sansBold, 7.6, subjectW - 18)
        .slice(0, 2)
        .forEach((line, li) => {
          page.drawText(line, {
            x: pageMargin + 9,
            y: y + rowH - 12 - li * 8,
            size: 7.6,
            font: state.fonts.sansBold,
            color: INK,
          });
        });
      if (row.sub) {
        const subLine = wrapText(row.sub, state.fonts.sans, 6.3, subjectW - 18).slice(0, 1)[0] || '';
        if (subLine)
          page.drawText(subLine, { x: pageMargin + 9, y: y + 7, size: 6.3, font: state.fonts.sans, color: MUTED });
      }
      row.cells.forEach((entries, dayIndex) => {
        const x = pageMargin + subjectW + dayIndex * dayW;
        page.drawRectangle({ x, y, width: dayW, height: rowH, borderColor: LINE, borderWidth: 0.45, color: fill });
        if (!entries.length) return;
        page.drawRectangle({
          x: x + 6,
          y: y + rowH - 14,
          width: 7,
          height: 7,
          borderColor: MUTED,
          borderWidth: 0.55,
          color: PAPER,
        });
        const lines = wrapText(entries.join('; '), state.fonts.sans, 6.5, dayW - 21).slice(
          0,
          Math.max(2, Math.floor((rowH - 11) / 7))
        );
        lines.forEach((line, li) => {
          page.drawText(line, { x: x + 17, y: y + rowH - 11 - li * 7, size: 6.5, font: state.fonts.sans, color: INK });
        });
      });
    });

    const notesY = 43;
    page.drawText('Mom Notes:', { x: pageMargin, y: notesY + 11, size: 8, font: state.fonts.sansBold, color: INK });
    for (let i = 0; i < 3; i += 1) {
      page.drawLine({
        start: { x: pageMargin + 42, y: notesY + 13 - i * 12 },
        end: { x: W - pageMargin, y: notesY + 13 - i * 12 },
        thickness: 0.35,
        color: LINE,
      });
    }
    const unassigned = form.unassigned || [];
    if (unassigned.length) {
      const line =
        wrapText(
          `Available but not placed: ${unassigned.map((item) => item.title).join(', ')}`,
          state.fonts.sans,
          6.8,
          W - pageMargin * 2
        ).slice(0, 1)[0] || '';
      page.drawText(line, { x: pageMargin, y: 18, size: 6.8, font: state.fonts.sans, color: MUTED });
    }
    page.drawText(`Page ${pageIndex + 1} of ${formPages.length}`, {
      x: W - pageMargin - 58,
      y: 18,
      size: 6.8,
      font: state.fonts.sans,
      color: MUTED,
    });
  });
  return state.pdf.save();
}
export function drawSection(state: PdfState, section: PrintSection) {
  if (!section) return;
  if (section.type === 'cards') return drawCards(state, section);
  if (section.type === 'table') return drawTable(state, section);
  if (section.type === 'checkboxes') return drawCheckboxes(state, section);
  if (section.type === 'liturgical') return drawLiturgicalStrip(state, section);
  if (section.type === 'calendar-grid') return drawCalendarGrid(state, section);
  if (section.type === 'designed-week') return drawDesignedWeek(state, section);
  if (section.type === 'notes') return drawNotesLines(state, section);
  return drawList(state, section);
}
