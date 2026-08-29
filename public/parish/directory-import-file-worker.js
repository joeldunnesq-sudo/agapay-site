// Files stay in the browser; only mapped columns are submitted to the API.
importScripts('/vendor/sheetjs/xlsx-0.20.3.min.js');

function checkWorkbookArchive(buffer) {
  const view = new DataView(buffer);
  let end = -1;
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error('Choose an unencrypted .xlsx workbook.');
  const entries = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true), total = 0;
  if (entries > 512) throw new Error('This workbook is too complex. Export the directory worksheet as CSV.');
  for (let i = 0; i < entries; i++) {
    if (offset + 46 > buffer.byteLength || view.getUint32(offset, true) !== 0x02014b50) throw new Error('The workbook archive is invalid.');
    if (view.getUint16(offset + 8, true) & 1) throw new Error('Password-protected workbooks are not supported.');
    total += view.getUint32(offset + 24, true);
    if (total > 10 * 1024 * 1024) throw new Error('Expanded workbook exceeds 10 MB. Export the directory worksheet as CSV.');
    offset += 46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }
}

self.onmessage = ({ data }) => {
  try {
    if (!(data.buffer instanceof ArrayBuffer) || data.buffer.byteLength > 2 * 1024 * 1024) throw new Error('Choose a workbook under 2 MB.');
    checkWorkbookArchive(data.buffer);
    const sheetNames = XLSX.read(data.buffer, { type: 'array', bookSheets: true }).SheetNames;
    if (!sheetNames.length || sheetNames.length > 50) throw new Error('Use a workbook with 1–50 worksheets.');
    const sheetName = sheetNames.includes(data.sheetName) ? data.sheetName : sheetNames[0];
    const workbook = XLSX.read(data.buffer, { type: 'array', sheets: sheetName, sheetRows: 502, cellFormula: true, cellHTML: false });
    const sheet = workbook.Sheets[sheetName];
    const range = XLSX.utils.decode_range(sheet['!fullref'] || sheet['!ref'] || 'A1');
    if (range.e.r > 500 || range.e.c >= 60 || range.s.r || range.s.c) throw new Error('Start the header in cell A1 and use at most 500 contacts and 60 columns. Remove unused formatted rows.');
    for (const [key, cell] of Object.entries(sheet)) if (!key.startsWith('!') && cell.f) throw new Error('Convert formulas to values before importing.');
    const records = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false, blankrows: false });
    self.postMessage({ records, sheetNames, sheetName });
  } catch (error) { self.postMessage({ error: error.message || 'Unable to read the workbook. Save it as CSV UTF-8 and try again.' }); }
};
