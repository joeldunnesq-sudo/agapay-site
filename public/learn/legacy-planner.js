// Generated from src/browser/learn/legacy-planner.ts by npm run build:browser. Do not edit.
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
  const backup = JSON.stringify({ format: 'agapay-legacy-planner-backup', version: 1, storage }, null, 2);
  const url = URL.createObjectURL(new Blob([backup], { type: 'application/json' }));
  document.getElementById('legacyPlannerDownload').href = url;
  document.getElementById('legacyPlannerBackup').hidden = false;
  window.addEventListener('pagehide', () => URL.revokeObjectURL(url), { once: true });
})();
