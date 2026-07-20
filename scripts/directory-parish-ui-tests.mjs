import fs from 'node:fs';

const dashboard = fs.readFileSync(new URL('../public/parish/dashboard.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../public/parish/app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../public/parish/redesign.css', import.meta.url), 'utf8');

const checks = [
  ['the legacy Directory Operations hero is removed', !dashboard.includes('Directory Operations')],
  ['the live Directory API remains wired', app.includes("directoryAdminApi('/households?limit=100')") && app.includes("directoryAdminApi('/print/directory')")],
  ['the directory is the default parish view', app.includes("let directoryAdminTab = 'directory'")],
  ['canonical Church Directory heading is present', app.includes('<h1>Church Directory</h1>')],
  ['export and working print actions remain wired', app.includes("downloadDirectoryAdminExport('/exports/published-adults.csv')") && app.includes("previewDirectoryAdminPrint('/print/directory')")],
  ['households lead with photos and members', app.includes('pdx-dir-table-photo') && app.includes('pdx-dir-table-members')],
  ['review queue and maintenance remain available', app.includes('Review Queue') && app.includes('Maintenance &amp; Skills')],
  ['AGAPAY navy and gold style the canonical header', css.includes('background: linear-gradient(145deg, #061522') && css.includes('color: #e8c879')],
  ['AGAPAY serif and sans typography are used', css.includes('var(--serif)') && css.includes('var(--sans)')]
];

const failures = checks.filter(([, passed]) => !passed);
if (failures.length) {
  for (const [label] of failures) console.error(`FAIL - ${label}`);
  process.exit(1);
}

console.log('PASS - Canonical parish Directory UI, AGAPAY visual system, and existing backend wiring');
