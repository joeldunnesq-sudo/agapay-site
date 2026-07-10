// src/lib/giving-statement-pdf.js
//
// Builds the annual IRS-compliant giving statement PDF for one donor at one
// parish for one calendar (fiscal) year. Uses pdf-lib -- pure JS, Worker-
// compatible, no Browser Rendering binding needed (see
// src/learn/print-documents.js for the precedent in this repo).
//
// Deliberately uses only pdf-lib's StandardFonts rather than fetching
// webfonts at render time (contrast with the Learn print engine): this is a
// compliance document that may be bulk-generated for hundreds of donors in
// a single background job, so it needs to be fast and have no external
// network dependency that could fail mid-batch.

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const LETTER = [612, 792];
const MARGIN = 54;
const NAVY = rgb(0.02, 0.08, 0.15);
const INK = rgb(0.09, 0.10, 0.13);
const MUTED = rgb(0.40, 0.42, 0.46);
const GOLD = rgb(0.61, 0.46, 0.20);
const LINE = rgb(0.82, 0.82, 0.82);

function text(value) {
  return String(value ?? "").replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "-").trim();
}

function formatUsd(cents) {
  return (Number(cents || 0) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function wrapText(value, font, fontSize, maxWidth) {
  const words = text(value).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, fontSize) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

/**
 * gifts: array of { date, amountCents, label } for every completed gift the
 * donor made to this parish within the fiscal year, oldest first.
 */
export async function buildGivingStatementPdf({ parish = {}, donor = {}, fiscalYear, gifts = [], totalCents = 0 }) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${parish.legalName || parish.parishName || "Parish"} - ${fiscalYear} Giving Statement`);
  pdf.setProducer("AGAPAY");

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  let page = pdf.addPage(LETTER);
  const [pageW, pageH] = LETTER;
  const contentW = pageW - MARGIN * 2;
  let y = pageH - MARGIN;

  function newPageIfNeeded(needed) {
    if (y - needed < MARGIN + 60) {
      page = pdf.addPage(LETTER);
      y = pageH - MARGIN;
    }
  }

  function draw(str, { x = MARGIN, size = 10, font = regular, color = INK, gap = 0 } = {}) {
    page.drawText(text(str), { x, y, size, font, color });
    y -= size + gap;
  }

  // ── Header ──────────────────────────────────────────────────────────────
  draw(parish.legalName || parish.parishName || "Parish", { size: 16, font: bold, color: NAVY, gap: 4 });
  const addressLine = [parish.addressLine1, parish.addressLine2, [parish.city, parish.state, parish.postalCode].filter(Boolean).join(" ")]
    .filter(Boolean).join(", ");
  if (addressLine) draw(addressLine, { size: 10, color: MUTED, gap: 2 });
  if (parish.ein) draw(`Federal EIN: ${parish.ein}`, { size: 10, color: MUTED, gap: 2 });
  y -= 8;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: pageW - MARGIN, y }, thickness: 1, color: LINE });
  y -= 22;

  draw(`Annual Giving Statement — ${fiscalYear}`, { size: 14, font: bold, color: NAVY, gap: 6 });
  draw(`For the calendar year January 1 – December 31, ${fiscalYear}`, { size: 10, color: MUTED, gap: 16 });

  // ── Donor block ─────────────────────────────────────────────────────────
  draw(donor.donorName || donor.name || "Valued Donor", { size: 12, font: bold, gap: 3 });
  draw(donor.email || "", { size: 10, color: MUTED, gap: 3 });
  const donorAddress = [donor.addressLine1, donor.addressLine2, [donor.city, donor.state, donor.postalCode].filter(Boolean).join(" ")]
    .filter(Boolean).join(", ");
  if (donorAddress) draw(donorAddress, { size: 10, color: MUTED, gap: 3 });
  y -= 14;

  // ── Itemized table ──────────────────────────────────────────────────────
  const colDate = MARGIN;
  const colLabel = MARGIN + 90;
  const colAmount = pageW - MARGIN - 90;

  function tableHeader() {
    page.drawText("Date", { x: colDate, y, size: 9, font: bold, color: MUTED });
    page.drawText("Fund / Designation", { x: colLabel, y, size: 9, font: bold, color: MUTED });
    page.drawText("Amount", { x: colAmount, y, size: 9, font: bold, color: MUTED });
    y -= 6;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: pageW - MARGIN, y }, thickness: 0.75, color: LINE });
    y -= 14;
  }
  tableHeader();

  const sortedGifts = [...gifts].sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
  for (const gift of sortedGifts) {
    const willBreak = y - 30 < MARGIN + 60;
    newPageIfNeeded(30);
    if (willBreak) tableHeader();
    const labelLines = wrapText(gift.label || "Gift", regular, 10, colAmount - colLabel - 14);
    const rowHeight = Math.max(14, labelLines.length * 13);
    page.drawText(formatDate(gift.date), { x: colDate, y, size: 10, font: regular, color: INK });
    labelLines.forEach((line, i) => {
      page.drawText(line, { x: colLabel, y: y - i * 13, size: 10, font: regular, color: INK });
    });
    page.drawText(formatUsd(gift.amountCents), { x: colAmount, y, size: 10, font: regular, color: INK });
    y -= rowHeight + 6;
  }

  y -= 4;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: pageW - MARGIN, y }, thickness: 1, color: LINE });
  y -= 20;
  page.drawText("Total contributions", { x: colLabel, y, size: 12, font: bold, color: NAVY });
  page.drawText(formatUsd(totalCents), { x: colAmount, y, size: 12, font: bold, color: NAVY });
  y -= 34;

  // ── IRS compliance language ─────────────────────────────────────────────
  newPageIfNeeded(90);
  const disclosure = "No goods or services were provided in exchange for these contributions, "
    + "except intangible religious benefits. Please retain this statement for your tax records "
    + "and consult your tax advisor regarding the deductibility of these contributions.";
  for (const line of wrapText(disclosure, italic, 9, contentW)) {
    draw(line, { size: 9, font: italic, color: MUTED, gap: 3 });
  }
  y -= 8;
  draw(`Generated ${formatDate(new Date().toISOString())} via AGAPAY.`, { size: 8, color: MUTED, gap: 2 });
  if (parish.website) draw(text(parish.website), { size: 8, color: GOLD });

  return pdf.save();
}
