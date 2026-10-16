type LearnShellQueriedViewModels = typeof import('./dashboard-view-models.js');
type LearnShellQueriedSanitizer = typeof import('./sanitized-render.js');
declare module '*dashboard-view-models.js?v=20260703d' {
  export const toBooksViewModel: LearnShellQueriedViewModels['toBooksViewModel'];
  export const toCoOpViewModel: LearnShellQueriedViewModels['toCoOpViewModel'];
  export const toCommunityViewModel: LearnShellQueriedViewModels['toCommunityViewModel'];
  export const toDashboardViewModel: LearnShellQueriedViewModels['toDashboardViewModel'];
  export const toFormationViewModel: LearnShellQueriedViewModels['toFormationViewModel'];
  export const toGradesViewModel: LearnShellQueriedViewModels['toGradesViewModel'];
  export const toPlannerViewModel: LearnShellQueriedViewModels['toPlannerViewModel'];
  export const toPrintCenterViewModel: LearnShellQueriedViewModels['toPrintCenterViewModel'];
  export const toSetupViewModel: LearnShellQueriedViewModels['toSetupViewModel'];
}
declare module '*sanitized-render.js?v=20260904security1' {
  export const renderSanitizedMarkup: LearnShellQueriedSanitizer['renderSanitizedMarkup'];
}
