import fs from 'node:fs';
import { readParishDashboardSource } from './lib/parish-dashboard-source.mjs';

const dashboard = fs.readFileSync(new URL('../public/parish/dashboard.html', import.meta.url), 'utf8');
const coreApp = fs.readFileSync(new URL('../public/parish/app.js', import.meta.url), 'utf8');
const directoryFeature = fs.readFileSync(new URL('../public/parish/features/directory.js', import.meta.url), 'utf8');
const sacramentsFeature = fs.readFileSync(new URL('../public/parish/features/sacraments.js', import.meta.url), 'utf8');
const app = `${readParishDashboardSource()}\n${directoryFeature}\n${sacramentsFeature}`;
const css = fs.readFileSync(new URL('../public/parish/redesign.css', import.meta.url), 'utf8');
const stewardshipCss = fs.readFileSync(new URL('../public/styles/stewardship.css', import.meta.url), 'utf8');
const adminService = fs.readFileSync(new URL('../src/directory/admin.js', import.meta.url), 'utf8');
const memberService = fs.readFileSync(new URL('../src/directory/member-directory.js', import.meta.url), 'utf8');
const adminHandler = fs.readFileSync(new URL('../src/handlers/directory-admin.js', import.meta.url), 'utf8');
const koinoniaAccess = fs.readFileSync(new URL('../src/handlers/koinonia-access.js', import.meta.url), 'utf8');
const openReviewStart = app.indexOf('async function openDirectoryReview');
const openReviewEnd = app.indexOf('async function decideDirectoryReview', openReviewStart);
const openReviewSource = app.slice(openReviewStart, openReviewEnd);
const openHouseholdStart = app.indexOf('async function openDirectoryHousehold');
const openHouseholdEnd = app.indexOf('function directoryReviewValue', openHouseholdStart);
const openHouseholdSource = app.slice(openHouseholdStart, openHouseholdEnd);

const checks = [
  ['the legacy Directory Operations hero is removed', !dashboard.includes('Directory Operations')],
  ['Directory is owned by a dedicated feature module loaded before the dashboard core', dashboard.indexOf('/parish/features/directory.js?v=') < dashboard.indexOf('/parish/app.js?v=') && directoryFeature.includes("ParishFeatureRegistry.register('directory'") && !coreApp.includes('function loadDirectoryAdminTab')],
  ['the live Directory API remains wired', app.includes("directoryAdminApi('/households?limit=100')") && app.includes("directoryAdminApi('/print/directory')")],
  ['Directory has a parish-facing on/off switch', app.includes('function toggleDirectoryFeature(input)') && app.includes("directoryAdminApi('/settings')") && app.includes('ordinaryMemberAccessEnabled: enabled')],
  ['Directory and Bookstore share the same visible feature switch', app.includes('pdx-dir-feature-switch agapay-feature-switch') && app.includes('class="sac-admin-switch agapay-feature-switch"') && app.includes('aria-label="Show parish directory in My AGAPAY"') && app.includes('aria-label="Show Bookstore in My AGAPAY"') && stewardshipCss.includes('.agapay-feature-switch input:checked + span') && stewardshipCss.includes('.agapay-feature-switch input:focus-visible + span')],
  ['Directory and Bookstore share the same AGAPAY hero treatment', app.includes('pdx-dir-canonical-head sw-suite-hero') && dashboard.includes('sw-suite-hero bookstore-hero') && app.includes('agapay-feature-actions') && dashboard.includes('agapay-feature-actions')],
  ['Directory is gated to the Give + tier module', app.includes("syncDashboardPaywall(document.getElementById('tab-directory'), 'directory', 'Give +', !moduleIncluded('directory'))") && app.includes("const directoryActive = moduleIncluded('directory')")],
  ['Give retains a visible Directory upgrade path', app.includes("getElementById('nav-directory')?.removeAttribute('hidden')") && app.includes("syncTierRequirementNavigation('directory', 'Give +', directoryActive)")],
  ['the directory is the default parish view', app.includes("let directoryAdminTab = 'directory'")],
  ['canonical Parish Directory heading is present', app.includes('<h1 class="sw-suite-heading">Parish Directory</h1>')],
  ['directory views appear directly beneath the page header with plain-language labels', app.indexOf('pdx-dir-view-switcher') < app.indexOf('data-dir-panel="directory"') && app.includes('Families &amp; Members') && app.includes('Directory Management')],
  ['CSV and designed PDF directory downloads remain wired', app.includes("downloadDirectoryAdminExport('/exports/published-adults.csv')") && app.includes("downloadDirectoryAdminExport('/exports/directory.pdf')") && app.includes('Download PDF')],
  ['households lead with prototype initials and members', app.includes('pdx-dir-table-avatar') && app.includes('pdx-dir-table-members')],
  ['family rows expose a focused account-management action without making the whole row ambiguous', !app.includes(`data-skills="\${escapeAttr(householdSkills.join(' '))}" onclick="openDirectoryHousehold`) && app.includes('class="pdx-dir-table-manage"') && app.includes('id="directoryRecordDetail"')],
  ['household initials use surname plus H', app.includes('function directoryHouseholdInitials(name)') && app.includes("${directoryHouseholdLastName(name).charAt(0)}H")],
  ['households are ordered by normalized family surname', app.includes('function directoryHouseholdSortKey(name)') && app.includes('const sortedHouseholds = [...households].sort')],
  ['duplicate parish-admin masthead is absent', !app.includes('My AGAPAY — Parish Admin') && !css.includes('.pdx-dir-admin-nav')],
  ['staff always sees complete contacts while eyes report donor-side sharing', app.includes('Authorized parish staff always see the complete contact record') && app.includes('The eye reports the family’s sharing choice') && app.includes('staffContact.email?.visibility') && app.includes('private from parishioners')],
  ['street address is explicitly staff-only while city and state may be shared', app.includes('A street address is never shown to parishioners') && app.includes('city/state visible in My AGAPAY; street private') && app.includes('Full street addresses are never published')],
  ['prototype nameday and skills filters are present', app.includes('All namedays') && app.includes('All skills') && app.includes('filterCanonicalDirectoryRows')],
  ['directory management queue contains only completed member submissions', app.includes("fetch(directoryAdminApi('/queue')") && app.includes('Submission Review Queue') && app.includes("queue.map((item) => ({ ...item, queueKind: 'submission' }))") && !app.includes("queueKind: 'followup'") && app.includes('directoryReviewQueueRows(managementQueue)')],
  ['health headline count matches the actionable rows rendered below it', app.includes('directoryHealthOverview(dashboard.metrics || {}, maintenance, managementQueue.length)') && app.includes('const required = Number(actionCount || 0)')],
  ['guest donors and unfinished profiles are explicitly excluded from parish follow-up', app.includes('Guest donors and unfinished profiles do not create parish follow-up') && !app.includes('Account links needed') && !app.includes('Adult account link needed')],
  ['review queue exposes confirm, decline, and request-information actions', app.includes('Confirm submission') && app.includes('Ask for information') && app.includes('Decline') && app.includes('requesterNote: note')],
  ['review form identifies its note as a parishioner-visible message', app.includes('<span>Message to parishioner</span>')],
  ['opening a review uses the post-begin version for decisions', openReviewSource.indexOf("'/begin'") < openReviewSource.indexOf('const item = review.item') && openReviewSource.includes('review = beginPayload.review')],
  ['directory health is visual and action-oriented', app.includes('pdx-dir-health-ring') && app.includes('Directory health') && app.includes('Awaiting review') && css.includes('conic-gradient')],
  ['skills and exports are secondary disclosure tools rather than competing lists', app.includes('<details class="pdx-dir-utilities">') && app.includes('Skills and exports')],
  ['each adult can link a separate My AGAPAY identity inside one shared household', app.includes('People &amp; access') && app.includes('Each adult uses a separate My AGAPAY sign-in') && app.includes('sendDirectoryHouseholdInvitation')],
  ['children remain safely managed without separate accounts', app.includes('managed by household adults') && app.includes('Children stay under household management')],
  ['household account states distinguish linked, invited, and unlinked adults', app.includes('Account connected') && app.includes('Invitation pending') && app.includes('Send invitation')],
  ['household management avoids duplicate admin and member sections', app.includes('At a glance') && app.includes('Family directory information') && !openHouseholdSource.includes('<h4>Household admins</h4>') && !openHouseholdSource.includes('<h4>Members</h4>')],
  ['status cards explain access and visibility in parish language', app.includes('Access &amp; visibility') && app.includes('Parish connection') && app.includes('Parishioner directory') && app.includes('Household confirmation')],
  ['staff can remove an adult from the parish without deleting identity or giving history', app.includes('Remove from parish') && app.includes('giving history will not be deleted') && adminHandler.includes('remove-from-parish') && adminService.includes('directory.person.removed_from_parish')],
  ['Koinonia requires a live parish affiliation after removal', koinoniaAccess.includes('JOIN directory_parish_affiliations affiliation') && koinoniaAccess.includes("affiliation.status != 'former_member'")],
  ['linked accounts are only allowed into Koinonia when household confirmation is current', app.includes("const ready = verificationStatus === 'current'") && app.includes('Koinonia blocked · household confirmation required')],
  ['member and family cards receive only consented member-visible skill previews', memberService.includes("listing.status = 'active' AND listing.visibility = 'directory_members'") && memberService.includes('listing.consent_withdrawn_at IS NULL') && memberService.includes('skillsPreview')],
  ['member-name and email searches resolve the containing household', adminService.includes('search_person.preferred_name LIKE ?2') && adminService.includes('search_contact.value LIKE ?2')],
  ['one linked spouse no longer blocks another adult invitation', !adminHandler.includes('household_already_managed') && adminHandler.includes('link_and_grant_household_admin')],
  ['the uploaded four-column parish table is preserved', app.includes('Members &amp; Namedays') && app.includes('Contact &amp; Parishioner Visibility') && app.includes('Skills to Serve')],
  ['the Directory bypasses the stale empty dashboard wrapper', app.includes("classList.toggle('directory-tab-active'") && css.includes('.content.directory-tab-active > .detail-wrap { display: none; }') && css.includes('.app.directory-tab-active > .sidebar { display: none; }')],
  ['AGAPAY navy and gold style the actions', css.includes('background:#061522') && css.includes('var(--gold)')],
  ['AGAPAY serif and sans typography are used', css.includes('var(--serif)') && css.includes('var(--sans)')],
  ['the directory fills the available feature-page width while keeping its flat table', css.includes('.pdx-dir-print-sheet { box-sizing:border-box; width:100%; max-width:none;') && css.includes('box-shadow:none')],
  ['initials medallions retain true centering', css.includes('.pdx-dir-table-avatar { display:grid; place-items:center;') && css.includes('.pdx-dir-table-household > div > span')],
  ['Parish Directory hero uses the signature AGAPAY navy', css.includes('.pdx-dir-canonical-head {') && css.includes('background:#061522') && css.includes('color: var(--cream)')]
];

const failures = checks.filter(([, passed]) => !passed);
if (failures.length) {
  for (const [label] of failures) console.error(`FAIL - ${label}`);
  process.exit(1);
}

console.log('PASS - Canonical parish Directory UI, AGAPAY visual system, and existing backend wiring');
