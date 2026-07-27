import fs from 'node:fs';

const dashboard = fs.readFileSync(new URL('../public/parish/dashboard.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../public/parish/app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../public/parish/redesign.css', import.meta.url), 'utf8');

if (app.includes("fetch(directoryAdminApi('/queue')")) {
  throw new Error('Parish Directory must not fetch a review queue');
}

const checks = [
  ['the legacy Directory Operations hero is removed', !dashboard.includes('Directory Operations')],
  ['the live Directory API remains wired', app.includes("directoryAdminApi('/households?limit=100')") && app.includes("directoryAdminApi('/print/directory')")],
  ['Directory is gated to the Parish tier module', app.includes("tab === 'directory' && currentParish && !moduleIncluded('directory')") && app.includes("const directoryActive = moduleIncluded('directory')")],
  ['lower tiers hide Directory in desktop and mobile navigation', app.includes("getElementById('nav-directory')?.toggleAttribute('hidden', !directoryActive)") && app.includes(".mobile-tab-link[data-nav-tab=\"directory\"]")],
  ['the directory is the default parish view', app.includes("let directoryAdminTab = 'directory'")],
  ['canonical Church Directory heading is present', app.includes('<h1>Church Directory</h1>')],
  ['export and working print actions remain wired', app.includes("downloadDirectoryAdminExport('/exports/published-adults.csv')") && app.includes("previewDirectoryAdminPrint('/print/directory')")],
  ['households lead with prototype initials and members', app.includes('pdx-dir-table-avatar') && app.includes('pdx-dir-table-members')],
  ['household initials use surname plus H', app.includes('function directoryHouseholdInitials(name)') && app.includes("${directoryHouseholdLastName(name).charAt(0)}H")],
  ['households are ordered by normalized family surname', app.includes('function directoryHouseholdSortKey(name)') && app.includes('const sortedHouseholds = [...households].sort')],
  ['duplicate parish-admin masthead is absent', !app.includes('My AGAPAY — Parish Admin') && !css.includes('.pdx-dir-admin-nav')],
  ['prototype contact display control is present', app.includes('Hidden until tap') && app.includes('Always visible') && app.includes('toggleDirectoryContactField')],
  ['prototype nameday and skills filters are present', app.includes('All namedays') && app.includes('All skills') && app.includes('filterCanonicalDirectoryRows')],
  ['parish directory keeps maintenance without a review queue', !app.includes('data-dir-tab="queue"') && app.includes('Maintenance &amp; Skills')],
  ['the uploaded four-column parish table is preserved', app.includes('Members &amp; Namedays') && app.includes('Contact &amp; Parishioner Visibility') && app.includes('Skills to Serve')],
  ['the Directory bypasses the stale empty dashboard wrapper', app.includes("classList.toggle('directory-tab-active'") && css.includes('.content.directory-tab-active > .detail-wrap { display: none; }') && css.includes('.app.directory-tab-active > .sidebar { display: none; }')],
  ['AGAPAY navy and gold style the actions', css.includes('background:#061522') && css.includes('var(--gold)')],
  ['AGAPAY serif and sans typography are used', css.includes('var(--serif)') && css.includes('var(--sans)')],
  ['prototype print sheet width and flat table are preserved', css.includes('width:min(1180px,100%)') && css.includes('box-shadow:none')],
  ['initials medallions retain true centering', css.includes('.pdx-dir-table-avatar { display:grid; place-items:center;') && css.includes('.pdx-dir-table-household > div > span')],
  ['Church Directory hero uses the signature AGAPAY navy', css.includes('.pdx-dir-canonical-head {') && css.includes('background:#061522') && css.includes('color: var(--cream)')]
];

const failures = checks.filter(([, passed]) => !passed);
if (failures.length) {
  for (const [label] of failures) console.error(`FAIL - ${label}`);
  process.exit(1);
}

console.log('PASS - Canonical parish Directory UI, AGAPAY visual system, and existing backend wiring');
