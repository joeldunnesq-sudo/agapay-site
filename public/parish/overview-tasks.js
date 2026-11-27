'use strict';

/* global currentParish, moduleIncluded, authHeaders, isOverdue, escapeAttr, escapeHtml, sacramentsDashboardTab:writable, switchTab, activeTab, setParishPrayerFilter, setKoinoniaStudioView, switchCommerceProduct, setBookstoreOrderAttention, accountingReconciliationView:writable, openAccountingHomeTask, accountingOverviewBillFilter:writable, accountingPayablesView:writable, directoryQueueFocusRequested:writable, directoryAdminApi, switchDirectoryAdminTab */

// Each summary uses the destination feature's existing access checks.
let parishOverviewTasksRequest = 0;

function syncParishAttentionBanner() {
  const banner = document.getElementById('parishAttentionBanner');
  const directory = document.getElementById('directoryReviewReminder');
  const tasks = document.getElementById('parishOverviewTasks');
  if (!banner) return;
  const directoryCount = directory?.hidden ? 0 : Number(directory?.dataset.pendingCount || 0);
  const total = directoryCount + Number(tasks?.dataset.pendingCount || 0);
  const badge = document.getElementById('parishAttentionCount');
  badge.textContent = total;
  badge.hidden = total === 0;
  badge.setAttribute('aria-label', total === 1 ? '1 task needs attention' : `${total} tasks need attention`);
  document.getElementById('parishAttentionTitle').textContent = total ? 'Needs attention' : 'Parish tasks';
  banner.hidden = Boolean(directory?.hidden && !tasks?.childElementCount);
}

async function refreshParishOverviewTasks() {
  const parishId = currentParish?.parishId;
  const request = ++parishOverviewTasksRequest;
  const cards = document.getElementById('parishOverviewTasks');
  if (!cards) return;
  if (cards.dataset.parishId !== parishId) {
    cards.replaceChildren();
    cards.dataset.pendingCount = 0;
    cards.dataset.parishId = parishId || '';
    syncParishAttentionBanner();
  }
  if (!parishId) return;
  const sources = [
    [
      'sacraments',
      '/sacraments',
      'sacraments',
      ({ awaitingReview, oldestAt }) => [
        [
          'sacraments',
          'Unacknowledged requests',
          awaitingReview,
          isOverdue({ status: 'requested', createdAt: oldestAt }) ? 'Oldest request has waited more than 48 hours' : '',
        ],
      ],
    ],
    [
      'accounting',
      '/accounting/payables/bills',
      'accounting',
      ({ approvals, overdue }) => [
        ['approvals', 'Bills awaiting approval', approvals],
        ['overdue', 'Overdue bills', overdue],
      ],
    ],
    [
      'accounting',
      '/accounting/bank/reconciliations',
      'accounting',
      ({ exceptions }) => [['banking', 'Reconciliation exceptions', exceptions]],
    ],
    [
      'communications',
      '/prayer-requests',
      'prayers',
      ({ awaitingReview }) => [['prayers', 'Prayer requests to moderate', awaitingReview]],
    ],
    [
      'bookstore',
      '/bookstore/sales',
      'bookstore',
      ({ ready, inventory }) => [
        ['ready', 'Orders ready to fulfill', ready],
        ['inventory', 'Inventory exceptions', inventory],
      ],
    ],
  ];
  const groups = {
    sacraments: ['Sacraments & Services', []],
    accounting: ['Accounting', []],
    prayers: ['Koinonia', []],
    bookstore: ['Bookstore', []],
  };
  const results = await Promise.allSettled(
    sources.map(async ([module, path, group, read]) => {
      if (!moduleIncluded(module)) return null;
      const response = await fetch('/api/parish/dashboard/' + encodeURIComponent(parishId) + path + '?summary=1', {
        headers: authHeaders(),
        cache: 'no-store',
      });
      if (!response.ok) return null;
      return [group, read(await response.json())];
    })
  );
  if (request !== parishOverviewTasksRequest || currentParish?.parishId !== parishId) return;
  for (const result of results) {
    if (result.status !== 'fulfilled' || !result.value) continue;
    const [group, tasks] = result.value;
    groups[group][1].push(...tasks.filter(([, , count]) => Number.isSafeInteger(count) && count > 0));
  }
  cards.dataset.pendingCount = Object.values(groups).reduce(
    (total, [, tasks]) => total + tasks.reduce((sum, [, , count]) => sum + count, 0),
    0
  );
  cards.innerHTML = Object.values(groups)
    .map(([title, tasks]) =>
      tasks.length
        ? `<section class="pdx-attention-row pdx-overview-task-card" aria-label="${escapeAttr(title)}">
          <h3>${escapeHtml(title)}</h3>
          <ul>${tasks.map(([action, label, count, detail]) => `<li><button type="button" data-overview-task="${action}" onclick="openParishOverviewTask(this.dataset.overviewTask)"><span class="pdx-directory-reminder-badge">${count}</span><span>${escapeHtml(label)}</span><span aria-hidden="true">→</span></button>${detail ? `<p>${escapeHtml(detail)}</p>` : ''}</li>`).join('')}</ul>
      </section>`
        : ''
    )
    .join('');
  syncParishAttentionBanner();
}

async function openParishOverviewTask(action) {
  if (action === 'sacraments') {
    sacramentsDashboardTab = 'requests';
    await switchTab('sacraments');
    if (activeTab !== 'sacraments') return;
    document.querySelector('[data-sac-tab="requests"]')?.focus();
  } else if (action === 'prayers') {
    switchTab('communications');
    setParishPrayerFilter('review', document.querySelector('[data-prayer-admin-filter="review"]'));
    setKoinoniaStudioView('prayers');
    document.querySelector('[data-prayer-admin-filter="review"]')?.focus();
  } else if (action === 'ready' || action === 'inventory') {
    switchTab('bookstore');
    switchCommerceProduct('bookstore', false);
    await setBookstoreOrderAttention(action);
    if (activeTab === 'bookstore') document.getElementById('bookstoreSalesPanel')?.focus();
  } else if (['approvals', 'overdue', 'banking'].includes(action)) {
    await switchTab('accounting');
    if (activeTab !== 'accounting') return;
    if (action === 'banking') {
      accountingReconciliationView = 'bank';
      await openAccountingHomeTask('banking');
    } else {
      accountingOverviewBillFilter = action;
      accountingPayablesView = 'bills';
      await openAccountingHomeTask('payables');
    }
  }
}

function refreshParishAttention() {
  if (!document.getElementById('parishAttentionBanner')) {
    document.getElementById('pdxHero')?.insertAdjacentHTML(
      'beforebegin',
      `<details class="pdx-directory-reminder pdx-attention-banner" id="parishAttentionBanner" aria-labelledby="parishAttentionTitle" hidden>
          <summary class="pdx-attention-heading">
            <div class="pdx-directory-reminder-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg></div>
            <span id="parishAttentionTitle">Needs attention</span>
            <span class="pdx-directory-reminder-badge" id="parishAttentionCount" hidden></span>
            <svg class="pdx-attention-chevron" viewBox="0 0 20 20" aria-hidden="true"><path d="m5 8 5 5 5-5"/></svg>
          </summary>
          <div class="pdx-attention-list">
            <section class="pdx-attention-row" id="directoryReviewReminder" aria-labelledby="directoryReviewReminderTitle" hidden>
              <h3 id="directoryReviewReminderTitle">Directory</h3>
              <ul><li><button type="button" onclick="openDirectoryReviewQueue()">
                <span class="pdx-directory-reminder-badge" id="directoryReviewReminderBadge" aria-hidden="true" hidden></span>
                <span id="directoryReviewReminderCount" aria-live="polite"></span><span aria-hidden="true">→</span>
              </button></li></ul>
            </section>
            <div id="parishOverviewTasks" aria-live="polite"></div>
          </div>
        </details>`
    );
  }
  void refreshDirectoryReviewReminder();
  void refreshParishOverviewTasks();
}

let directoryReminderRequest = 0;

async function refreshDirectoryReviewReminder() {
  const reminder = document.getElementById('directoryReviewReminder');
  const parishId = currentParish?.parishId;
  const request = ++directoryReminderRequest;
  if (!reminder) return;
  if (reminder.dataset.parishId !== parishId) {
    reminder.hidden = true;
    reminder.dataset.parishId = parishId || '';
    syncParishAttentionBanner();
  }
  if (!parishId || !moduleIncluded('directory')) {
    reminder.hidden = true;
    syncParishAttentionBanner();
    return;
  }
  try {
    const response = await fetch(directoryAdminApi('/queue?summary=1'), { headers: authHeaders() });
    const summary = response.ok ? await response.json() : null;
    if (request !== directoryReminderRequest || currentParish?.parishId !== parishId) return;
    const count = summary?.awaitingReview;
    reminder.hidden = !Number.isSafeInteger(count) || count < 0;
    if (!reminder.hidden) {
      reminder.dataset.pendingCount = String(count);
      const badge = document.getElementById('directoryReviewReminderBadge');
      badge.textContent = String(count);
      badge.hidden = count === 0;
      document.getElementById('directoryReviewReminderCount').textContent =
        count === 0
          ? 'No directory submissions awaiting review'
          : count === 1
            ? '1 directory submission needs review'
            : `${count} directory submissions need review`;
    }
  } catch {
    if (request === directoryReminderRequest) reminder.hidden = true;
  } finally {
    if (request === directoryReminderRequest) syncParishAttentionBanner();
  }
}

function openDirectoryReviewQueue() {
  const pane = document.getElementById('directoryAdminPane');
  if (pane) delete pane.dataset.loaded;
  directoryQueueFocusRequested = true;
  switchDirectoryAdminTab('tools');
  switchTab('directory');
}
