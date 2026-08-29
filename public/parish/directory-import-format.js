// Shared by the browser import tool and the server. No account identifiers,
// permissions, publication settings, or giving data are accepted from a file.
export const IMPORT_MAX_ROWS = 500;
export const IMPORT_MAX_FILE_BYTES = 2 * 1024 * 1024;
export const IMPORT_FIELDS = Object.freeze([
  ['name', 'Full name', ['full name', 'name', 'preferred name', 'display name']],
  ['firstName', 'First name', ['first name', 'first', 'given name']],
  ['lastName', 'Last name', ['last name', 'last', 'surname']],
  ['household', 'Household name', ['household', 'household name', 'family name', 'family']],
  ['email', 'Email', ['email', 'email address', 'e mail']],
  ['phone', 'Phone', ['phone', 'phone number', 'mobile', 'home phone']],
  ['address', 'Street address', ['address', 'street', 'street address', 'address 1', 'address line 1']],
  ['city', 'City', ['city', 'town']],
  ['state', 'State / region', ['state', 'region', 'province']],
  ['postalCode', 'Postal code', ['zip', 'zip code', 'postal code', 'postcode']],
  ['country', 'Country code', ['country', 'country code']],
  ['relationship', 'Relationship', ['relationship', 'household role', 'family role']]
]);

const clean = (value) => String(value ?? '').trim();
export const importNameKey = (value) => clean(value).normalize('NFKC').toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
const headerKey = (value) => importNameKey(value).replace(/[_-]/g, ' ').replace(/\s+/g, ' ');

export function suggestImportMapping(headers) {
  return Object.fromEntries(IMPORT_FIELDS.map(([key, , aliases]) => [key, headers.findIndex((header) => aliases.includes(headerKey(header)))]));
}

export function mapImportRows(table, mapping) {
  return table.rows.map((cells) => Object.fromEntries(IMPORT_FIELDS.map(([key]) => [key, mapping[key] >= 0 ? clean(cells[mapping[key]]) : ''])));
}

// Strict CSV parsing: preserve quoted commas/newlines, reject malformed quotes
// and ragged rows, and never guess a second column from a cell's content.
export function parseDirectoryCsv(text) {
  text = String(text).replace(/^\uFEFF/, '');
  const firstLine = text.split(/\r?\n/, 1)[0];
  const delimiter = firstLine.includes('\t') && !firstLine.includes(',') ? '\t' : ',';
  const records = [];
  let row = [], cell = '', quoted = false, closed = false;
  const endCell = () => { row.push(cell); cell = ''; closed = false; if (row.length > 60) throw new Error('Use no more than 60 columns.'); };
  const endRow = () => {
    endCell();
    if (row.some((value) => value.trim())) records.push(row);
    row = [];
    if (records.length > IMPORT_MAX_ROWS + 1) throw new Error(`Use no more than ${IMPORT_MAX_ROWS} contacts per file.`);
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else cell += char;
    } else if (char === delimiter) endCell();
    else if (char === '\r' || char === '\n') { endRow(); if (char === '\r' && text[i + 1] === '\n') i++; }
    else if (char === '"' && !cell && !closed) quoted = true;
    else if (closed || char === '"') throw new Error('Malformed CSV quotes. Save the file as CSV UTF-8 and try again.');
    else cell += char;
    if (cell.length > 4000) throw new Error('A spreadsheet cell exceeds 4,000 characters.');
  }
  if (quoted) throw new Error('The CSV has an unfinished quoted cell.');
  if (cell || row.length || closed) endRow();
  return directoryImportTable(records);
}

export function directoryImportTable(records) {
  if (records.length < 2 || records.length > IMPORT_MAX_ROWS + 1) throw new Error(`Include a header row and 1–${IMPORT_MAX_ROWS} contacts.`);
  const headers = records[0].map(clean);
  if (!headers.length || headers.length > 60 || headers.some((header) => !header || header.length > 120)) throw new Error('Each column needs a short header. Remove empty columns.');
  if (new Set(headers.map(headerKey)).size !== headers.length) throw new Error('Column headers must be unique.');
  const rows = records.slice(1);
  if (rows.some((row) => row.length !== headers.length)) throw new Error('Every row must have the same number of columns as the header.');
  return { headers, rows };
}

export function normalizeImportRows(rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > IMPORT_MAX_ROWS) throw new Error(`Provide 1–${IMPORT_MAX_ROWS} contacts.`);
  return rows.map((input, index) => {
    const errors = [];
    if (!input || typeof input !== 'object' || Array.isArray(input)) input = {};
    const values = {};
    for (const [key] of IMPORT_FIELDS) {
      const value = input[key] ?? '';
      if (typeof value !== 'string' || value.length > (key === 'email' ? 254 : 240)) errors.push(`Invalid or overlong ${key}.`);
      values[key] = typeof value === 'string' ? value.trim() : '';
      if (/[\u0000-\u001f\u007f]/.test(values[key])) errors.push(`${key} contains a line break or control character.`);
    }
    const name = values.name || [values.firstName, values.lastName].filter(Boolean).join(' ');
    if (!name || name.length > 240) errors.push('A full name or first and last name is required.');
    const email = values.email.toLowerCase();
    if (email && (!/^[^\s@<>(),;:"\\]+@[^\s@<>(),;:"\\]+\.[^\s@<>(),;:"\\]+$/.test(email) || email.length > 254)) errors.push('Enter one valid email address.');
    if (values.phone && (values.phone.length > 40 || !/^[+\d\s().-]+$/.test(values.phone) || values.phone.replace(/\D/g, '').length < 7 || values.phone.replace(/\D/g, '').length > 15)) errors.push('Enter a valid phone number.');
    if (values.address && !values.city) errors.push('A street address needs a city.');
    if (!values.address && (values.city || values.state || values.postalCode)) errors.push('Include a street address with the location, or leave all address fields unmapped.');
    const country = values.country.toUpperCase() || 'US';
    if (!/^[A-Z]{2}$/.test(country)) errors.push('Use a two-letter country code, such as US or CA.');
    const relationship = values.relationship.toLowerCase() || 'other';
    if (!['head', 'spouse', 'child', 'grandparent', 'other'].includes(relationship)) errors.push('Relationship must be head, spouse, child, grandparent, or other.');
    const data = { name, household: values.household || `${name} Household`, email, phone: values.phone, address: values.address, city: values.city, state: values.state, postalCode: values.postalCode, country, relationship };
    if (data.household.length > 240) errors.push('Household name is too long.');
    return { rowNumber: index + 2, data, errors, eligibleForInvitation: !!email && relationship !== 'child' };
  });
}
