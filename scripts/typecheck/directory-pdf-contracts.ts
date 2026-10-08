import { buildParishDirectoryPdf, groupHouseholds } from '../../src/lib/directory-pdf.js';
import type { DirectoryRow } from '../../src/lib/directory-pdf.js';
const rows: readonly DirectoryRow[] = [{ household_id: 'a', preferredName: 'Alice', email: null }];
const name: string | undefined = groupHouseholds(rows)[0]?.name;
void name;
const result: Promise<Uint8Array> = buildParishDirectoryPdf({
  directory: { households: rows },
  logo: { bytes: new Uint8Array(), contentType: 'image/png' },
});
void result;
// @ts-expect-error rows must contain database text values
void groupHouseholds([{ household_id: 42 }]);
// @ts-expect-error households must be a row collection
void buildParishDirectoryPdf({ directory: { households: 'invalid' } });
// @ts-expect-error logo data must be supported bytes or encoded text
void buildParishDirectoryPdf({ logo: { bytes: 42 } });
// @ts-expect-error parish names must be text
void buildParishDirectoryPdf({ parish: { parishName: {} } });
