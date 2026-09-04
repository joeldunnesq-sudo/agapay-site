import { readParishDashboardSource } from './lib/parish-dashboard-source.mjs';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readStewardshipHandlerSource } from './lib/stewardship-handler-source.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const app = readParishDashboardSource();
const css = read('public/parish/style.css');
const handler = readStewardshipHandlerSource();
const dashboard = read('public/parish/dashboard.html');

const db = new DatabaseSync(':memory:');
db.exec(read('migrations/0005_stewardship_annual_meetings.sql'));
db.exec(read('migrations/0048_annual_meeting_packet_line_counts.sql'));
const columns = db.prepare('PRAGMA table_info(stewardship_annual_meetings)').all();
const signatureColumn = columns.find((column) => column.name === 'signature_line_count');
const noteColumn = columns.find((column) => column.name === 'note_line_count');
assert.equal(signatureColumn?.dflt_value, '24');
assert.equal(noteColumn?.dflt_value, '12');

for (const label of [
  'Agenda item',
  'Time allotted',
  'Report type',
  'Report title',
  'Report content',
  'Leader / presenter',
  'Fund name',
  'Beginning balance',
  'Received',
  'Disbursed',
  'Ending balance',
  "Nominee's full name",
  'Position',
  'Candidate biography',
  'Nominated by',
  'Resolution title',
  'Full resolution text',
]) {
  assert.ok(app.includes(`<span>${label}`), `missing persistent editor label: ${label}`);
}

assert.ok(app.includes('name="signatureLineCount"') && app.includes('name="noteLineCount"'));
assert.ok(app.includes("reportType: 'brotherhood'") && app.includes("title: 'Brotherhood Report'"));
assert.ok(app.includes("reportType: 'sisterhood'") && app.includes("title: 'Sisterhood Report'"));
assert.ok(app.includes('stewardshipMeetingReports(meeting.reports)'));
assert.match(handler, /["']brotherhood["']\s*,\s*["']sisterhood["']/);
assert.ok(app.includes("signatureLineCount: fd.get('signatureLineCount')"));
assert.ok(app.includes("noteLineCount: fd.get('noteLineCount')"));
assert.ok(handler.includes('signature_line_count = ?, note_line_count = ?'));
assert.match(handler, /Array\.from\(\{\s*length:\s*signatureLineCount\s*\}/);
assert.match(handler, /Array\.from\(\{\s*length:\s*noteLineCount\s*\}/);

assert.ok(css.includes('#stewardshipResolutionRows .stewardship-repeat-row'));
assert.ok(css.includes('grid-template-columns: minmax(190px, 0.32fr) minmax(0, 1fr) auto'));
assert.ok(css.includes('.stewardship-resolution-text textarea'));
assert.ok(css.includes('min-height: 13rem'));
assert.ok(app.includes('data-field="resolvedText" rows="8"'));
assert.ok(dashboard.includes('/parish/style.css?v=20260901memorial1'));
assert.ok(/\/parish\/app\.js\?v=\d{8}[a-z0-9]+/.test(dashboard));

console.log('PASS - Annual meeting packet editor labels, printable line controls, and expanded resolution workspace');
