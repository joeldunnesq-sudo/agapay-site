import { PDFDocument, rgb } from '../vendor/pdf-lib/pdf-lib-1.17.1.esm.min.js';
import fontkit from '../vendor/pdf-lib/fontkit-1.1.1.es.min.js';

const navy = rgb(0.06, 0.14, 0.21),
  muted = rgb(0.36, 0.41, 0.46);
const rule = rgb(0.78, 0.81, 0.83),
  wash = rgb(0.94, 0.96, 0.97);
const clean = (value) =>
  String(value ?? '')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/[\x00-\x08\x0b-\x1f]/g, '');
const money = (value) => {
  const amount = Number(value || 0);
  if (!amount) return '-';
  const text = (Math.abs(amount) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return amount < 0 ? `(${text})` : text;
};

async function fontBytes(name) {
  const response = await fetch(`/vendor/accounting-fonts/NotoSans-${name}.ttf`);
  if (!response.ok) throw new Error('The report font could not load. Please try the PDF download again.');
  return response.arrayBuffer();
}

export async function createAccountingReportPdf(report, fonts = null) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const [regularBytes, boldBytes] = fonts || (await Promise.all([fontBytes('Regular'), fontBytes('Bold')]));
  const regular = await pdf.embedFont(regularBytes, { subset: true });
  const bold = await pdf.embedFont(boldBytes, { subset: true });
  pdf.setTitle(`${report.parish} - ${report.title}`);
  pdf.setAuthor(report.parish);
  pdf.setCreator('AGAPAY Accounting');
  pdf.setSubject(report.period);
  const landscape = report.columns.length > 4;
  const width = landscape ? 792 : 612,
    height = landscape ? 612 : 792;
  const margin = 40,
    usable = width - margin * 2,
    bottom = 55,
    size = 9;
  const numeric = report.columns.filter((col) => col.money).length;
  const widths = report.columns.map(
    (col, index) => col.width || (col.money ? (landscape ? 91 : 99) : index === 0 ? 0 : 86)
  );
  const fixed = widths.reduce((a, b) => a + b, 0);
  widths[0] = usable - fixed;
  if (widths[0] < 100 && numeric) {
    const extra = (100 - widths[0]) / numeric;
    report.columns.forEach((col, i) => {
      if (col.money) widths[i] -= extra;
    });
    widths[0] = 100;
  }
  const offsets = widths.map((_, i) => margin + widths.slice(0, i).reduce((a, b) => a + b, 0));
  let page,
    y,
    activeSection = '';
  function wrap(value, font, fontSize, maxWidth) {
    const lines = [];
    for (const paragraph of clean(value).split('\n')) {
      let line = '';
      for (const word of paragraph.split(/\s+/)) {
        if (!word) continue;
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
          line = candidate;
          continue;
        }
        if (line) lines.push(line);
        line = '';
        for (const char of word) {
          if (line && font.widthOfTextAtSize(line + char, fontSize) > maxWidth) {
            lines.push(line);
            line = '';
          }
          line += char;
        }
      }
      lines.push(line);
    }
    return lines.length ? lines : [''];
  }
  function text(value, x, top, font = regular, fontSize = size, color = navy) {
    page.drawText(clean(value), { x, y: top - fontSize, font, size: fontSize, color });
  }
  function line(at, thickness = 0.5, color = rule) {
    page.drawLine({ start: { x: margin, y: at }, end: { x: width - margin, y: at }, thickness, color });
  }
  function tableHeader() {
    const labels = report.columns.map((col, i) => wrap(col.label, bold, 8, widths[i] - 14));
    const h = Math.max(...labels.map((entry) => entry.length)) * 11 + 14;
    page.drawRectangle({ x: margin, y: y - h, width: usable, height: h, color: wash });
    labels.forEach((labels, i) =>
      labels.forEach((label, n) =>
        text(
          label,
          report.columns[i].money ? offsets[i] + widths[i] - 7 - bold.widthOfTextAtSize(label, 8) : offsets[i] + 7,
          y - 7 - n * 11,
          bold,
          8
        )
      )
    );
    y -= h;
    line(y);
  }
  function newPage(withTable = true, continuation = '') {
    page = pdf.addPage([width, height]);
    y = height - margin;
    page.drawRectangle({ x: margin, y: y - 3, width: 30, height: 3, color: navy });
    y -= 15;
    for (const label of wrap(report.parish, bold, 11, usable)) {
      text(label, margin, y, bold, 11);
      y -= 15;
    }
    for (const label of wrap(report.title, bold, 19, usable)) {
      text(label, margin, y, bold, 19);
      y -= 24;
    }
    if (report.subtitle)
      for (const label of wrap(report.subtitle, regular, 9, usable)) {
        text(label, margin, y, regular, 9, muted);
        y -= 13;
      }
    for (const label of wrap(report.period, regular, 10, usable)) {
      text(label, margin, y, regular, 10);
      y -= 14;
    }
    text(`${report.basis}  |  ${report.currency}  |  Negative amounts in parentheses`, margin, y, regular, 8, muted);
    y -= 25;
    if (withTable) tableHeader();
    if (withTable && continuation) {
      const labels = wrap(`${continuation} (continued)`, bold, 9, usable - 14);
      const h = labels.length * 13 + 14;
      page.drawRectangle({ x: margin, y: y - h, width: usable, height: h, color: wash });
      labels.forEach((label, i) => text(label, margin + 7, y - 7 - i * 13, bold));
      y -= h;
    }
  }
  newPage();
  for (let index = 0; index < report.rows.length; index++) {
    const item = report.rows[index],
      heading = item.kind === 'section';
    const font = item.kind === 'detail' ? regular : bold;
    const values = heading
      ? [wrap(item.cells[0], bold, size, usable - 14)]
      : report.columns.map((col, i) =>
          col.money ? [money(item.cells[i])] : wrap(item.cells[i], font, size, widths[i] - 14)
        );
    let count = Math.max(...values.map((value) => value.length)),
      offset = 0;
    const reserve = heading ? 60 : 0;
    if (y - Math.min(count * 13 + 14 + reserve, 160) < bottom) newPage(true, heading ? '' : activeSection);
    if (heading) activeSection = item.cells[0];
    while (count > 0) {
      const fit = Math.max(1, Math.floor((y - bottom - 14) / 13));
      const take = Math.min(count, fit),
        h = take * 13 + 14;
      if (heading) page.drawRectangle({ x: margin, y: y - h, width: usable, height: h, color: wash });
      if (['subtotal', 'grand'].includes(item.kind)) line(y, item.kind === 'grand' ? 1 : 0.6, navy);
      values.forEach((labels, i) =>
        labels.slice(offset, offset + take).forEach((label, n) => {
          const numeric = !heading && report.columns[i].money;
          const fontSize = numeric
            ? Math.min(size, (size * (widths[i] - 14)) / Math.max(1, font.widthOfTextAtSize(label, size)))
            : size;
          const x = numeric ? offsets[i] + widths[i] - 7 - font.widthOfTextAtSize(label, fontSize) : offsets[i] + 7;
          text(label, x, y - 7 - n * 13, font, fontSize);
        })
      );
      y -= h;
      if (item.kind === 'grand') {
        line(y + 1, 0.8, navy);
        line(y - 2, 0.4, navy);
        y -= 5;
      }
      count -= take;
      offset += take;
      if (count) newPage(true, activeSection);
    }
  }
  if (report.notes.length) {
    y -= 20;
    if (y < bottom + 45) newPage(false);
    text('REPORT NOTES', margin, y, bold, 8, muted);
    y -= 16;
    for (const note of report.notes) {
      for (const label of wrap(note, regular, 8, usable)) {
        if (y < bottom + 12) newPage(false);
        text(label, margin, y, regular, 8, muted);
        y -= 12;
      }
      y -= 7;
    }
  }
  const pages = pdf.getPages();
  pages.forEach((item, i) => {
    page = item;
    line(38);
    text('AGAPAY Accounting', margin, 29, regular, 8, muted);
    const label = `Page ${i + 1} of ${pages.length}`;
    text(label, width - margin - regular.widthOfTextAtSize(label, 8), 29, regular, 8, muted);
  });
  return pdf.save();
}
