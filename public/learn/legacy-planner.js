// Compatibility entry for the retired standalone prototype. Never import its
// unscoped local data into a signed-in household automatically.
(() => {
  'use strict';
  const storage = {};
  try {
    for (const key of ['agapay.planner.v2', 'agapay.planner.seed.v1']) {
      const value = localStorage.getItem(key);
      if (value !== null) storage[key] = value;
    }
  } catch {
    document.getElementById('legacyPlannerStorageNotice').hidden = false;
    return;
  }
  if (!Object.keys(storage).length) return;
  // Preserve the exact stored strings, including data that is no longer valid
  // JSON, so recovery never discards an old saved value.
  const backup = JSON.stringify({ format: 'agapay-legacy-planner-backup', version: 1, storage }, null, 2);
  const url = URL.createObjectURL(new Blob([backup], { type: 'application/json' }));
  document.getElementById('legacyPlannerDownload').href = url;
  document.getElementById('legacyPlannerBackup').hidden = false;
  window.addEventListener('pagehide', () => URL.revokeObjectURL(url), { once: true });
})();
