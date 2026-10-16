import type { LearnScoreIdentity } from './test-score-contracts.js';
export function learnSetupIdentity(request: Request, env: Partial<Env>): Promise<LearnScoreIdentity | null>;

export function loadLearnSetupSnapshotForIdentity(
  env: Partial<Env>,
  identity: LearnScoreIdentity
): Promise<import('./grade-records.js').LearnGradeSetup | null>;
export function getLearnSeedForIdentity(
  env: Partial<Env>,
  identity: LearnScoreIdentity
): Promise<
  import('./grade-records.js').LearnGradeSetup & { setupSnapshot?: import('./grade-records.js').LearnGradeSetup }
>;

import type { LearnRepositorySeed } from './repository.js';
type SaveFailure = { ok: false; status?: number; error?: string };
type SaveSuccess = {
  ok: true;
  setupSnapshot: NonNullable<LearnRepositorySeed['setupSnapshot']>;
  onboarding: LearnRepositorySeed;
  scope?: string;
  periodKey?: string;
  itemId?: string;
  completed?: boolean;
  action?: string;
  movedToWeekday?: number;
  fallbackToReserve?: boolean;
  title?: string;
};
export function saveLearnSetup(
  env: Partial<Env>,
  request: Request,
  payload: Record<string, unknown>
): Promise<SaveFailure | SaveSuccess>;
export const saveLearnFamilyPlanning: typeof saveLearnSetup;
export const saveLearnGraceMode: typeof saveLearnSetup;
export const saveLearnPlannerBlock: typeof saveLearnSetup;
export const saveLearnMoveUnfinishedWork: typeof saveLearnSetup;
export const saveLearnCompletion: typeof saveLearnSetup;
