import fs from 'node:fs';

const dashboard = fs.readFileSync(new URL('../public/parish/dashboard.html', import.meta.url), 'utf8');
const coreApp = fs.readFileSync(new URL('../public/parish/app.js', import.meta.url), 'utf8');
const sacramentsFeature = fs.readFileSync(new URL('../public/parish/features/sacraments.js', import.meta.url), 'utf8');
const app = `${coreApp}\n${sacramentsFeature}`;
const css = fs.readFileSync(new URL('../public/styles/stewardship.css', import.meta.url), 'utf8');
const donorApp = fs.readFileSync(new URL('../public/donor/app.js', import.meta.url), 'utf8');
const donorHandler = fs.readFileSync(new URL('../src/handlers/donor.js', import.meta.url), 'utf8');
const parishHandler = fs.readFileSync(new URL('../src/handlers/parish-sacraments.js', import.meta.url), 'utf8');
const availability = fs.readFileSync(new URL('../src/lib/sacrament-availability.js', import.meta.url), 'utf8');
const liveDashboard = dashboard.slice(
  dashboard.indexOf('id="sacramentsLiveContent"'),
  dashboard.indexOf('<!-- ── DIRECTORY ADMIN TAB')
);

const checks = [
  ['Sacraments is owned by a registered feature module loaded before the dashboard core', dashboard.indexOf('/parish/feature-registry.js?v=20260831giving1') < dashboard.indexOf('/parish/features/sacraments.js?v=20260831giving1') && dashboard.indexOf('/parish/features/sacraments.js?v=20260831giving1') < dashboard.indexOf('/parish/app.js?') && sacramentsFeature.includes("ParishFeatureRegistry.register('sacraments'") && !coreApp.includes('let sacramentsState')],
  ['Sacraments removes the unused dashboard spacer when active', app.includes(`classList.toggle('sacraments-tab-active', tab === 'sacraments')`) && css.includes('.content.sacraments-tab-active > .detail-wrap { display: none; }') && css.includes('.content.sacraments-tab-active > #tab-sacraments.active {')],
  ['live Sacraments uses the shared AGAPAY feature hero', dashboard.includes('sac-admin-head sw-suite-hero') && dashboard.includes('sac-admin-status sw-suite-hero-status agapay-feature-actions')],
  ['Sacraments hero omits the redundant refresh control', !liveDashboard.includes('sw-suite-refresh-btn') && !liveDashboard.includes('Refresh Sacraments &amp; Services')],
  ['Sacraments uses the shared on/off feature switch', app.includes('class="sac-admin-switch agapay-feature-switch"') && app.includes('aria-label="Show Sacraments and Services in My AGAPAY"') && app.includes("${enabled ? 'On' : 'Off'}")],
  ['priest context is separated cleanly from hero actions', dashboard.includes('class="sac-admin-context-bar"') && dashboard.includes('id="sacramentsPriestPicker"') && dashboard.includes('class="sac-admin-context-status"')],
  ['Sacrament Rules replaces the duplicate Weekly Availability tab', !liveDashboard.includes('>Weekly Availability<') && liveDashboard.indexOf('Blackout Dates') < liveDashboard.indexOf('Sacrament Rules') && liveDashboard.indexOf('Sacrament Rules') < liveDashboard.indexOf('>Requests<') && liveDashboard.indexOf('>Requests<') < liveDashboard.indexOf('>Calendar<')],
  ['priest calendars distinguish blackout and scheduled dates', app.includes("row.status === 'scheduled'") && app.includes("has-blackout") && app.includes("has-scheduled") && css.includes('.sac-admin-cal-cell.has-blackout') && css.includes('.sac-admin-cal-cell.has-scheduled')],
  ['blackouts accept inclusive date ranges', app.includes('sacAvailNewBlackoutStartDate') && app.includes('sacAvailNewBlackoutEndDate') && app.includes('formatSacramentDateRange')],
  ['online offerings are editable per priest', app.includes('renderSacramentsOfferingsEditor') && app.includes('toggleSacramentsOffering') && app.includes('addCustomSacramentsOffering')],
  ['booking days open an inline window editor', app.includes('selectSacramentRuleDay') && app.includes('renderSacramentRuleDayEditor') && app.includes('aria-expanded=') && !app.includes('<span>Edit rules</span>')],
  ['online offerings match the standard dashboard card treatment', app.includes('sac-admin-offerings-panel') && app.includes('sac-admin-add-offering-box') && !app.includes('sac-admin-offerings-glow') && !app.includes('sac-admin-offerings-count')],
  ['custom offerings can be request based or schedulable', app.includes('sacAvailCustomOfferingMode') && app.includes('updateCustomSacramentsOfferingMode') && app.includes("service.mode === 'schedule'")],
  ['custom scheduled offerings reach My AGAPAY booking', donorApp.includes('schedulingType: service.id') && donorApp.includes('otherTypeLabel: card.otherTypeLabel') && donorHandler.includes('isCustomScheduledOffering') && donorHandler.includes('customOffering?.label')],
  ['availability accepts configured custom service keys', availability.includes('isSchedulableOfferingKey') && parishHandler.includes('configuredCustomOffering')],
  ['Sacraments workspace matches the full dashboard width', css.includes('.sac-admin-shell {') && css.includes('width: min(1180px, 100%)') && css.includes('background: transparent')],
  ['all Parish-tier pages share the core dashboard width', ['sacraments','directory','communications','accounting','text'].every((tab) => dashboard.includes(`class="tab-panel parish-tier-panel" id="tab-${tab}"`)) && css.includes('#tab-sacraments.parish-tier-panel.active') && css.includes('#tab-accounting .acct-workspace') && css.includes('max-width: none')],
  ['Sacraments tabs use the shared navy and gold treatment', css.includes('.sac-admin-tab.active {') && css.includes('background: var(--deep)') && css.includes('color: var(--cream)')],
  ['Sacraments cards and forms use dashboard surfaces', css.includes('.sac-admin-panel {') && css.includes('border-radius: 12px') && css.includes('.sac-admin-wide-field textarea:focus')],
  ['Sacraments remains usable on mobile without horizontal scrolling', css.includes('.sac-admin-context-bar { align-items: flex-start; flex-direction: column; }') && css.includes('.sac-admin-tabs { margin-right: 0; overflow-x: visible; }') && css.includes('flex-wrap: wrap')],
  ['the unavailable-state hero also uses the shared visual system', dashboard.includes('text-give-header sw-suite-hero sac-paywall-hero')]
];

const failures = checks.filter(([, passed]) => !passed);
if (failures.length) {
  for (const [label] of failures) console.error(`FAIL - ${label}`);
  process.exit(1);
}

console.log('PASS - Sacraments & Services matches the parish dashboard visual system');
