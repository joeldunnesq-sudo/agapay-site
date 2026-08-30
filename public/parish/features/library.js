'use strict';

// Parish Library bridge between the dashboard shell and the standalone library admin.
// Loaded before app.js to preserve the existing global dashboard action names.

function loadParishLibraryAdmin(force = false) {
  const included = isParishPlusActive();
  syncTierRequirementNavigation('library', 'Give +', included);
  syncModuleStatusNavigation('library', included, Boolean(currentParish?.libraryEnabled));
  if (!included) {
    const root = document.getElementById('parishLibraryAdmin');
    if (root)
      root.innerHTML =
        '<div class="communications-paywall"><strong>Parish Library is included with Give +.</strong><p>Upgrade to publish documents and trusted links for parishioners in My AGAPAY.</p><button class="btn btn-gold" type="button" onclick="switchTab(\'settings\')">Review Give +</button></div>';
    return;
  }
  if (!currentParish?.parishId) return;
  window.ParishLibraryAdmin?.load({
    force,
    parishId: currentParish.parishId,
    headers: authHeaders,
    notify: setStatus,
    onSettingsChanged(enabled) {
      currentParish.libraryEnabled = Boolean(enabled);
      syncModuleStatusNavigation('library', true, currentParish.libraryEnabled);
    },
  });
}

async function refreshParishLibraryNavigationStatus() {
  const included = isParishPlusActive();
  syncTierRequirementNavigation('library', 'Give +', included);
  if (!included || !currentParish?.parishId) {
    syncModuleStatusNavigation('library', false, false);
    return;
  }
  try {
    const response = await fetch(
      '/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/library/settings',
      {
        headers: authHeaders(),
        cache: 'no-store',
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Unable to load Parish Library visibility.');
    currentParish.libraryEnabled = Boolean(payload.settings?.enabled);
    syncModuleStatusNavigation('library', true, currentParish.libraryEnabled);
  } catch {
    syncModuleStatusNavigation(
      'library',
      typeof currentParish.libraryEnabled === 'boolean',
      Boolean(currentParish.libraryEnabled)
    );
  }
}

window.ParishFeatureRegistry.register('library', {
  load: loadParishLibraryAdmin,
  refreshNavigationStatus: refreshParishLibraryNavigationStatus,
});
