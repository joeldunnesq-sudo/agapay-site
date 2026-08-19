import fs from 'node:fs';

const dashboard = fs.readFileSync(new URL('../public/parish/dashboard.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../public/parish/app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../public/styles/stewardship.css', import.meta.url), 'utf8');
const parishCss = fs.readFileSync(new URL('../public/parish/style.css', import.meta.url), 'utf8');
const groupsApp = fs.readFileSync(new URL('../public/myagapay/groups.js', import.meta.url), 'utf8');
const eventsHandler = fs.readFileSync(new URL('../src/handlers/parish-events.js', import.meta.url), 'utf8');
const parishHandler = fs.readFileSync(new URL('../src/handlers/parish.js', import.meta.url), 'utf8');

const productKeys = ['overview', 'bookstore', 'events', 'meals', 'retreats', 'camp', 'tuition'];
const checks = [
  ['desktop navigation presents Bookstore as Commerce', dashboard.includes(`onclick="switchTab('commerce')" id="nav-bookstore"`) && dashboard.includes('<span class="nav-label">Commerce</span>')],
  ['mobile navigation presents Bookstore as Commerce', dashboard.includes(`data-nav-tab="bookstore" onclick="switchTab('commerce')"`) && dashboard.includes('<span>Commerce</span>')],
  ['Commerce remains backward compatible with the Bookstore route', app.includes(`if (tab === 'commerce') tab = 'bookstore';`) && app.includes(`bookstore:'Commerce'`)],
  ['Commerce overview is the active default product tab', dashboard.includes('class="commerce-product-tab is-active"') && dashboard.includes('data-commerce-product="overview" onclick="switchCommerceProduct(\'overview\')"')],
  ['Bookstore is a separate selectable Commerce product', dashboard.includes('data-commerce-product="bookstore" onclick="switchCommerceProduct(\'bookstore\')"') && dashboard.includes('id="commerceBookstorePanel"')],
  ['Commerce route selects the Parish overview or Stewardship Bookstore from entitlements', app.includes(`switchCommerceProduct(moduleIncluded('commerceSuite') ? 'overview' : 'bookstore', false);`) && app.includes('function switchCommerceProduct(product, focus = true)')],
  ['full Commerce navigation is Parish-only while Stewardship keeps Bookstore', app.includes(`const fullSuite = moduleIncluded('commerceSuite');`) && app.includes(`tab.hidden = fullSuiteOnly && !fullSuite`) && app.includes(`new Set(['bookstore'])`)],
  ['Commerce removes the unused dashboard spacer when active', app.includes(`classList.toggle('commerce-tab-active', tab === 'bookstore')`) && css.includes('.content.commerce-tab-active > .detail-wrap { display: none; }') && css.includes('.content.commerce-tab-active > #tab-bookstore.active {')],
  ['Commerce overview uses live aggregate metrics and recent activity', dashboard.includes('id="commerceOverviewBody"') && app.includes('function renderCommerceOverview()') && app.includes('Net revenue') && app.includes('Recent activity')],
  ['Commerce overview supports shared reporting ranges', ['30d', '90d', 'ytd', 'all'].every((range) => dashboard.includes(`data-commerce-range="${range}"`)) && app.includes('function setCommerceOverviewRange(range)')],
  ['future Commerce products have reserved horizontal tabs', productKeys.every((key) => dashboard.includes(`data-commerce-product="${key}"`))],
  ['unfinished Commerce products are not presented as live', ['retreats', 'camp', 'tuition'].every((key) => dashboard.includes(`disabled data-commerce-product="${key}"`)) && dashboard.includes('Coming soon')],
  ['Events is a live parish-admin workspace with its own creation flow', dashboard.includes('data-commerce-product="events" onclick="switchCommerceProduct(\'events\')"') && dashboard.includes('id="commerceEventsPanel"') && dashboard.includes("loadEventsOversightPanel('event', true)") && app.includes("submitParishCommerceOffering(event,'${kind}')")],
  ['Meals is a separate live parish-admin workspace over the shared Events commerce API', dashboard.includes('data-commerce-product="meals" onclick="switchCommerceProduct(\'meals\')"') && dashboard.includes('id="commerceMealsPanel"') && dashboard.includes("loadEventsOversightPanel('meal', true)") && app.includes(`new Set(['overview', 'bookstore', 'events', 'meals'])`) && app.includes("eventsApi('?offeringKind=' + encodeURIComponent(kind))")],
  ['Events and Meals heroes have independent saved My AGAPAY switches', dashboard.includes('id="eventsFeatureToggle"') && dashboard.includes('id="mealsFeatureToggle"') && app.includes("function toggleCommerceOfferingFeature(input, offeringKind = 'event')") && app.includes("body: JSON.stringify({ [key]: enabled })")],
  ['Events and Meals switches persist and enforce independent donor checkout gates', parishHandler.includes('eventsEnabled: Boolean(body.eventsEnabled ?? current.eventsEnabled ?? true)') && parishHandler.includes('mealsEnabled: Boolean(body.mealsEnabled ?? current.mealsEnabled ?? true)') && eventsHandler.includes('Your parish has Events checkout turned off.') && eventsHandler.includes('Your parish has Meals checkout turned off.')],
  ['Koinonia ministry groups can create either Event or Meal listings in one shared workspace', groupsApp.includes('name="offeringKind" required') && groupsApp.includes('<option value="event">Event</option>') && groupsApp.includes('<option value="meal">Meal</option>') && groupsApp.includes("offeringKind: d.get('offeringKind')") && eventsHandler.includes('eventOfferingKindFromBody(body)')],
  ['Parish and ministry authors control publication timing and calendar visibility', app.includes('name="eventStartTime" type="time"') && app.includes('name="showOnCalendar" type="checkbox" checked') && app.includes('toggleEventsCalendarVisibility') && groupsApp.includes('name="eventStartTime" type="time"') && groupsApp.includes('name="showOnCalendar" type="checkbox" checked') && groupsApp.includes('toggleMinistryCommerceCalendar')],
  ['Retreats are reserved for future registrations and Merchandise stays within Bookstore', dashboard.includes('data-commerce-product="retreats"') && dashboard.includes('<span>Retreats</span>') && !dashboard.includes('data-commerce-product="merch"')],
  ['Candles remain outside the Commerce product navigation', !dashboard.includes('data-commerce-product="candles"')],
  ['Commerce product tabs are horizontally scrollable on narrow screens', css.includes('.commerce-product-tabs {') && css.includes('overflow-x: auto') && css.includes('scroll-snap-type: x proximity')],
  ['Commerce overview is responsive and uses dashboard cards', css.includes('.commerce-overview-kpis {') && css.includes('.commerce-overview-grid {') && css.includes('@media (max-width: 430px)')],
  ['Bookstore keeps the shared AGAPAY feature hero and switch', dashboard.includes('sw-suite-hero bookstore-hero') && app.includes('Show Bookstore in My AGAPAY')],
  ['Bookstore current items surface saved photos beside item details', app.includes('class="bookstore-current-image"') && app.includes('src="${escapeAttr(p.imageUrl)}"') && app.includes('class="bookstore-current-copy"') && parishCss.includes('.bookstore-current-image {') && parishCss.includes('object-fit: cover')]
];

const failures = checks.filter(([, passed]) => !passed);
if (failures.length) {
  for (const [label] of failures) console.error(`FAIL - ${label}`);
  process.exit(1);
}

console.log('PASS - Commerce navigation, separate Events/Meals parish workspaces, Koinonia setup, and Bookstore workspace');
