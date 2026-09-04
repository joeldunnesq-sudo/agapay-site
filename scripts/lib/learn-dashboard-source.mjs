import { moduleGraphPaths, readModuleGraphSource } from './browser-composed-source.mjs';

export const learnDashboardEntry = 'public/learn/dashboard-shell.js';
export const learnDashboardViewModelsEntry = 'public/learn/dashboard-view-models.js';

export function learnDashboardModulePaths() {
  return moduleGraphPaths(learnDashboardEntry);
}

export function readLearnDashboardSource() {
  return readModuleGraphSource(learnDashboardEntry);
}

export function readLearnDashboardViewModelSource() {
  return readModuleGraphSource(learnDashboardViewModelsEntry);
}
