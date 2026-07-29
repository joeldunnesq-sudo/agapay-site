import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const LETTER = [612, 792];
const NAVY = rgb(0.024, 0.082, 0.133);
const NAVY_2 = rgb(0.043, 0.153, 0.224);
const GOLD = rgb(0.78, 0.61, 0.27);
const CREAM = rgb(0.965, 0.945, 0.902);
const PAPER = rgb(0.985, 0.979, 0.958);
const INK = rgb(0.075, 0.09, 0.105);
const MUTED = rgb(0.37, 0.39, 0.40);
const LINE = rgb(0.84, 0.81, 0.74);
const BINDING_MARGIN = 68;
const RIGHT_MARGIN = 38;
const TOP_MARGIN = 48;
const BOTTOM_MARGIN = 44;
const COLUMN_GAP = 16;

function text(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function wrap(value, font, size, width) {
  const words = text(value).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(candidate, size) > width) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function rowValue(row, snake, camel = "") {
  return row?.[snake] ?? row?.[camel || snake] ?? "";
}

function householdSortName(value) {
  const cleaned = text(value).replace(/^the\s+/i, "").replace(/\s+(family|household)$/i, "");
  return cleaned.split(/\s+/).filter(Boolean).at(-1) || cleaned || "Household";
}

function formattedNameday(value) {
  const cleaned = text(value);
  if (!/^\d{2}-\d{2}$/.test(cleaned)) return cleaned;
  const [month, day] = cleaned.split("-").map(Number);
  const date = new Date(Date.UTC(2024, month - 1, day));
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
}

function groupHouseholds(rows = []) {
  const grouped = new Map();
  for (const row of rows) {
    const householdId = rowValue(row, "household_id", "householdId") || rowValue(row, "display_name", "displayName");
    const householdName = rowValue(row, "display_name", "displayName") || "Household";
    if (!grouped.has(householdId)) {
      grouped.set(householdId, {
        id: householdId,
        name: householdName,
        sortName: householdSortName(householdName),
        city: rowValue(row, "city"),
        region: rowValue(row, "region"),
        members: []
      });
    }
    const memberName = rowValue(row, "preferred_name", "preferredName");
    if (!memberName) continue;
    const memberKey = rowValue(row, "person_id", "personId") || memberName;
    const household = grouped.get(householdId);
    let member = household.members.find((item) => item.key === memberKey);
    if (!member) {
      member = {
        key: memberKey,
        name: memberName,
        email: rowValue(row, "email"),
        phone: rowValue(row, "phone"),
        namedays: []
      };
      household.members.push(member);
    }
    const saint = rowValue(row, "saint_name", "saintName");
    const feast = rowValue(row, "feast_month_day", "feastMonthDay");
    if ((saint || feast) && !member.namedays.some((item) => item.saint === saint && item.feast === feast)) {
      member.namedays.push({ saint, feast });
    }
  }
  return [...grouped.values()].sort((a, b) =>
    a.sortName.localeCompare(b.sortName, "en-US") || a.name.localeCompare(b.name, "en-US")
  );
}

function cardHeight(household, fonts, width) {
  const inner = width - 28;
  let height = 22 + wrap(household.name, fonts.bold, 14, inner).length * 17;
  if (household.city || household.region) height += 16;
  for (const member of household.members) {
    height += 18;
    for (const nameday of member.namedays) {
      const line = [formattedNameday(nameday.feast), nameday.saint].filter(Boolean).join(" - ");
      height += Math.max(1, wrap(line, fonts.italic, 8.2, inner - 8).length) * 10;
    }
    if (member.email) height += Math.max(1, wrap(member.email, fonts.regular, 8.3, inner - 16).length) * 10;
    if (member.phone) height += 10;
    height += 4;
  }
  return Math.max(84, height + 12);
}

async function embedLogo(pdf, logo = {}) {
  const bytes = logo?.bytes;
  if (!bytes) return null;
  try {
    const kind = String(logo.contentType || "").toLowerCase();
    if (kind.includes("png")) return await pdf.embedPng(bytes);
    if (kind.includes("jpeg") || kind.includes("jpg")) return await pdf.embedJpg(bytes);
  } catch {
    return null;
  }
  return null;
}

function drawFittedImage(page, image, { x, y, width, height }) {
  if (!image) return;
  const scale = Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  page.drawImage(image, {
    x: x + (width - drawWidth) / 2,
    y: y + (height - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight
  });
}

function drawCard(page, household, fonts, x, top, width, height) {
  const bottom = top - height;
  page.drawRectangle({ x, y: bottom, width, height, color: rgb(1, 1, 1), borderColor: LINE, borderWidth: 0.7 });
  page.drawRectangle({ x, y: top - 5, width, height: 5, color: GOLD });
  const innerX = x + 14;
  const innerWidth = width - 28;
  let y = top - 25;
  for (const line of wrap(household.name, fonts.bold, 14, innerWidth)) {
    page.drawText(line, { x: innerX, y, size: 14, font: fonts.bold, color: NAVY });
    y -= 17;
  }
  const location = [household.city, household.region].filter(Boolean).join(", ");
  if (location) {
    page.drawText(location, { x: innerX, y, size: 8.5, font: fonts.bold, color: GOLD });
    y -= 16;
  } else {
    y -= 4;
  }
  for (const member of household.members) {
    page.drawText(text(member.name), { x: innerX, y, size: 10.2, font: fonts.bold, color: INK });
    y -= 13;
    for (const nameday of member.namedays) {
      const namedayText = [formattedNameday(nameday.feast), nameday.saint].filter(Boolean).join(" - ");
      for (const line of wrap(namedayText, fonts.italic, 8.2, innerWidth - 8)) {
        page.drawText(line, { x: innerX + 8, y, size: 8.2, font: fonts.italic, color: MUTED });
        y -= 10;
      }
    }
    if (member.email) {
      for (const line of wrap(member.email, fonts.regular, 8.3, innerWidth - 16)) {
        page.drawText(line, { x: innerX + 8, y, size: 8.3, font: fonts.regular, color: NAVY_2 });
        y -= 10;
      }
    }
    if (member.phone) {
      page.drawText(text(member.phone), { x: innerX + 8, y, size: 8.3, font: fonts.regular, color: NAVY_2 });
      y -= 10;
    }
    y -= 4;
  }
}

export async function buildParishDirectoryPdf({ parish = {}, directory = {}, logo = {} } = {}) {
  const pdf = await PDFDocument.create();
  const parishName = text(parish.parishName || parish.name || "Parish");
  const location = [text(parish.city), text(parish.state || parish.region)].filter(Boolean).join(", ");
  pdf.setTitle(`${parishName} Directory`);
  pdf.setAuthor(parishName);
  pdf.setSubject("Private parish family directory");
  pdf.setProducer("AGAPAY");
  pdf.setCreator("AGAPAY Parish Directory");

  const fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    serif: await pdf.embedFont(StandardFonts.TimesRoman),
    serifBold: await pdf.embedFont(StandardFonts.TimesRomanBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique)
  };
  const logoImage = await embedLogo(pdf, logo);
  const [pageWidth, pageHeight] = LETTER;

  const cover = pdf.addPage(LETTER);
  cover.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: NAVY });
  cover.drawRectangle({ x: 0, y: 0, width: 18, height: pageHeight, color: GOLD });
  cover.drawCircle({ x: pageWidth - 32, y: pageHeight - 32, size: 112, color: NAVY_2, opacity: 0.35 });
  cover.drawCircle({ x: 52, y: 52, size: 92, color: NAVY_2, opacity: 0.28 });
  if (logoImage) drawFittedImage(cover, logoImage, { x: 196, y: 525, width: 220, height: 150 });
  const coverTitleSize = parishName.length > 38 ? 27 : 34;
  const coverTitleLines = wrap(parishName, fonts.serifBold, coverTitleSize, pageWidth - BINDING_MARGIN - RIGHT_MARGIN);
  let coverTitleY = 438;
  for (const line of coverTitleLines) {
    cover.drawText(line, { x: BINDING_MARGIN, y: coverTitleY, size: coverTitleSize, font: fonts.serifBold, color: CREAM });
    coverTitleY -= coverTitleSize + 5;
  }
  const directoryLabelY = coverTitleY - 1;
  cover.drawText("PARISH FAMILY DIRECTORY", { x: BINDING_MARGIN, y: directoryLabelY, size: 11, font: fonts.bold, color: GOLD });
  if (location) cover.drawText(location, { x: BINDING_MARGIN, y: directoryLabelY - 26, size: 12, font: fonts.regular, color: CREAM });
  const coverRuleY = directoryLabelY - (location ? 56 : 30);
  cover.drawLine({ start: { x: BINDING_MARGIN, y: coverRuleY }, end: { x: pageWidth - RIGHT_MARGIN, y: coverRuleY }, thickness: 0.8, color: GOLD });
  const privacy = text(directory.privacyReminder || "Private parish directory. Do not distribute outside the parish.");
  let privacyY = 115;
  for (const line of wrap(privacy, fonts.regular, 9, pageWidth - BINDING_MARGIN - RIGHT_MARGIN)) {
    cover.drawText(line, { x: BINDING_MARGIN, y: privacyY, size: 9, font: fonts.regular, color: CREAM, opacity: 0.78 });
    privacyY -= 12;
  }
  cover.drawText(`Prepared ${new Date(directory.generatedAt || Date.now()).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, {
    x: BINDING_MARGIN,
    y: 70,
    size: 8.5,
    font: fonts.bold,
    color: GOLD
  });

  const households = groupHouseholds(directory.households || []);
  const contentWidth = pageWidth - BINDING_MARGIN - RIGHT_MARGIN;
  const columnWidth = (contentWidth - COLUMN_GAP) / 2;
  let page;
  let y;

  function addDirectoryPage() {
    page = pdf.addPage(LETTER);
    page.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: PAPER });
    page.drawRectangle({ x: 0, y: 0, width: 12, height: pageHeight, color: GOLD });
    page.drawText(`${parishName} Directory`, { x: BINDING_MARGIN, y: pageHeight - 32, size: 10, font: fonts.bold, color: NAVY });
    page.drawText("PRIVATE PARISH DIRECTORY", { x: pageWidth - RIGHT_MARGIN - 128, y: pageHeight - 31, size: 7.5, font: fonts.bold, color: GOLD });
    page.drawLine({ start: { x: BINDING_MARGIN, y: pageHeight - 40 }, end: { x: pageWidth - RIGHT_MARGIN, y: pageHeight - 40 }, thickness: 0.6, color: LINE });
    y = pageHeight - TOP_MARGIN - 18;
  }

  if (!households.length) {
    addDirectoryPage();
    page.drawText("No published households", { x: BINDING_MARGIN, y, size: 20, font: fonts.serifBold, color: NAVY });
    page.drawText("There are no approved directory entries available to print yet.", { x: BINDING_MARGIN, y: y - 30, size: 10, font: fonts.regular, color: MUTED });
  } else {
    let index = 0;
    let currentLetter = "";
    while (index < households.length) {
      if (!page) addDirectoryPage();
      const left = households[index];
      const letter = text(left.sortName).charAt(0).toUpperCase() || "#";
      const candidate = households[index + 1] || null;
      const right = candidate && text(candidate.sortName).charAt(0).toUpperCase() === letter ? candidate : null;
      if (letter !== currentLetter) {
        if (y < BOTTOM_MARGIN + 120) addDirectoryPage();
        currentLetter = letter;
        page.drawText(currentLetter, { x: BINDING_MARGIN, y, size: 19, font: fonts.serifBold, color: GOLD });
        page.drawLine({ start: { x: BINDING_MARGIN + 24, y: y + 5 }, end: { x: pageWidth - RIGHT_MARGIN, y: y + 5 }, thickness: 0.5, color: LINE });
        y -= 28;
      }
      const leftHeight = cardHeight(left, fonts, columnWidth);
      const rightHeight = right ? cardHeight(right, fonts, columnWidth) : 0;
      const rowHeight = Math.max(leftHeight, rightHeight);
      if (y - rowHeight < BOTTOM_MARGIN) {
        addDirectoryPage();
        page.drawText(currentLetter, { x: BINDING_MARGIN, y, size: 19, font: fonts.serifBold, color: GOLD });
        page.drawText("continued", { x: BINDING_MARGIN + 26, y: y + 2, size: 7.5, font: fonts.italic, color: MUTED });
        y -= 28;
      }
      drawCard(page, left, fonts, BINDING_MARGIN, y, columnWidth, leftHeight);
      if (right) drawCard(page, right, fonts, BINDING_MARGIN + columnWidth + COLUMN_GAP, y, columnWidth, rightHeight);
      y -= rowHeight + 14;
      index += right ? 2 : 1;
    }
  }

  const pages = pdf.getPages();
  for (let index = 1; index < pages.length; index++) {
    const numbered = pages[index];
    const label = `${index}  |  ${parishName}`;
    numbered.drawText(label, { x: BINDING_MARGIN, y: 22, size: 7.5, font: fonts.regular, color: MUTED });
    numbered.drawText("Generated by AGAPAY", { x: pageWidth - RIGHT_MARGIN - 76, y: 22, size: 7.5, font: fonts.regular, color: MUTED });
  }

  return pdf.save();
}

export { groupHouseholds };
