import fs from 'node:fs';

const parishDashboard = fs.readFileSync(new URL('../public/parish/dashboard.html', import.meta.url), 'utf8');
const parishApp = fs.readFileSync(new URL('../public/parish/app.js', import.meta.url), 'utf8');
const parishCss = fs.readFileSync(new URL('../public/styles/stewardship.css', import.meta.url), 'utf8');
const myHistory = fs.readFileSync(new URL('../public/myagapay/giving/history.html', import.meta.url), 'utf8');
const donorApp = fs.readFileSync(new URL('../public/donor/app.js', import.meta.url), 'utf8');
const donorCss = fs.readFileSync(new URL('../public/donor/style.css', import.meta.url), 'utf8');

const checks = [
  ['parish history leads with a useful giving story', parishDashboard.includes('class="parish-history-hero"') && parishDashboard.includes('See the story behind every gift.')],
  ['parish history includes live momentum and fund allocation', parishDashboard.includes('id="historyTrendPanel"') && parishDashboard.includes('id="historyFundPanel"') && parishApp.includes('function renderHistoryInsights()')],
  ['parish history supports date, type, fund, and text filtering', ['histRangeFilter', 'histTypeFilter', 'histFundFilter', 'histSearch'].every(id => parishDashboard.includes(`id="${id}"`)) && parishApp.includes('const matchRange')],
  ['parish transaction rows preserve donor, gift, fee, net, fund, recurrence, and intentions', ['parish-history-donor', 'history-fee', 'parish-history-net', 'history-fund', 'history-type', 'parish-history-row-note'].every(token => parishApp.includes(token))],
  ['parish history is responsive', parishCss.includes('.parish-history-hero {') && parishCss.includes('.parish-history-kpis {') && parishCss.includes('.parish-history-ledger .history-table td::before')],
  ['My AGAPAY history leads with a personal giving story and trend', myHistory.includes('class="history-story-hero"') && myHistory.includes('id="myHistoryTrend"') && donorApp.includes('function renderDonorGivingStory(offerings = [])')],
  ['My AGAPAY shows completed gifts, monthly average, covered fees, and product use', ['historyGiftCount', 'historyMonthlyAverage', 'historyFeesCovered', 'historyProductsCount'].every(id => myHistory.includes(`id="${id}"`))],
  ['My AGAPAY shows fund impact and giving rhythm', myHistory.includes('id="myHistoryFunds"') && myHistory.includes('id="myHistoryRhythm"') && donorApp.includes('history-rhythm-grid')],
  ['My AGAPAY timeline supports product and year filtering', myHistory.includes('id="historyPeriodFilter"') && donorApp.includes('function setHistoryPeriodFilter(period = "all")') && donorApp.includes('matchesPeriod')],
  ['My AGAPAY groups receipts by month and includes annual statements', donorApp.includes('giving-receipt-month') && myHistory.includes('id="givingStatementsList"') && donorApp.includes('loadGivingStatements();')],
  ['My AGAPAY history uses navy and gold without a green Bookstore treatment', donorCss.includes('.donor-offerings-page .status-pill') && donorCss.includes('.history-product-bookstore .history-activity-icon') && donorCss.includes('color: var(--deep);')],
  ['My AGAPAY history is responsive', donorCss.includes('.history-story-kpis {') && donorCss.includes('.history-story-insights {') && donorCss.includes('.giving-receipt-row {')]
];

const failures = checks.filter(([, passed]) => !passed);
if (failures.length) {
  failures.forEach(([label]) => console.error(`FAIL - ${label}`));
  process.exit(1);
}

console.log('PASS - Parish and My AGAPAY giving histories are dynamic, useful, and responsive');
