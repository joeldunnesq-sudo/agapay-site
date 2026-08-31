'use strict';

/* global activeTab, currentParish, allGifts, loadGivingHistory, renderGiversPanel,
  renderGivingOptionsEditor, loadSettlementProfilesPanel, loadReconciliation, statusLabel,
  loadGivingSummary, loadRecurringHealth, renderQrCode, loadCommemorations, initReconciliationMonths */

// Giving owns its tab workflows and delayed dashboard refresh work.
// Authentication, settings saves, and shared catalog state remain in core.
function loadGivingTab(tab = activeTab) {
  if ((tab === 'history' || tab === 'givers' || tab === 'options') && currentParish && !allGifts.length)
    loadGivingHistory();
  if (tab === 'givers' && allGifts.length) renderGiversPanel();
  if (tab === 'options' && currentParish) {
    renderGivingOptionsEditor();
    loadSettlementProfilesPanel();
  }
  if (tab === 'reconcile' && currentParish) loadReconciliation();
}

function renderGivingOverviewStatus() {
  const p = currentParish;
  const overviewStatus = document.getElementById('overviewGivingStatus');
  const overviewStatusNote = document.getElementById('overviewGivingStatusNote');
  const overviewStripe = document.getElementById('overviewStripeStatus');
  const overviewFunds = document.getElementById('overviewFundsCount');
  const overviewCampaigns = document.getElementById('overviewCampaignsCount');
  if (overviewStatus) overviewStatus.textContent = statusLabel(p.givingStatus || 'active');
  if (overviewStatusNote) {
    const status = p.givingStatus || 'active';
    overviewStatusNote.textContent =
      status === 'active'
        ? 'Your public giving page is visible and ready to receive offerings.'
        : status === 'paused'
          ? 'Your giving page is paused. Donors can view it, but checkout is temporarily disabled.'
          : 'Your giving page is hidden from public discovery.';
  }
  if (overviewStripe) overviewStripe.textContent = statusLabel(p.stripeAccountStatus || 'not_started');
  if (overviewFunds) overviewFunds.textContent = (p.funds || []).length;
  if (overviewCampaigns) overviewCampaigns.textContent = (p.campaigns || []).length;
}

function refreshGivingDashboard() {
  setTimeout(() => loadGivingSummary(), 250);
  setTimeout(() => loadRecurringHealth(), 500);
  setTimeout(async () => {
    await renderQrCode();
  }, 750);
  setTimeout(() => loadCommemorations(), 1000);
  if (['history', 'givers', 'options'].includes(activeTab)) loadGivingHistory();
  else setTimeout(() => loadGivingHistory(), 1250);
  if (activeTab === 'reconcile') loadReconciliation();
}

window.ParishFeatureRegistry.register('giving', {
  load: loadGivingTab,
  refresh: refreshGivingDashboard,
  init: initReconciliationMonths,
  renderOverview: renderGivingOverviewStatus,
  renderOptions: renderGivingOptionsEditor,
});
