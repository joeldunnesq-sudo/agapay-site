import type { LearnScoreIdentity, LearnScoreSetup, LearnScoreChild } from './test-score-contracts.js';
export function loadSetupForIdentity(env: Partial<Env>, identity: LearnScoreIdentity): Promise<LearnScoreSetup | null>;
export function loadChildren(
  env: Partial<Env>,
  householdId: string,
  setup: LearnScoreSetup | null
): Promise<LearnScoreChild[]>;
