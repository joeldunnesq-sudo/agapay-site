import type { LearnScoreIdentity } from './test-score-contracts.js';

import type {
  SetupInputNode,
  SetupBookInput,
  LearnRuntimeSeed,
  LearnRuntimeChild,
  LearnRuntimeBook,
  SetupTruthyFilter,
} from './setup-operation-contracts.js';
export type NormalizedSetup = ReturnType<typeof normalizeSetupPayload>;

export type LearnSetupSnapshot = Omit<NormalizedSetup, 'subjects' | 'formationMaterials' | 'formation'> & {
  blockEdits?: Record<string, unknown>;
  subjects: (NormalizedSetup['subjects'][number] & { progressionType?: string })[];
  formationMaterials: (NormalizedSetup['formationMaterials'][number] & { formLabel?: string })[];
  formation: Omit<NormalizedSetup['formation'], 'enrichmentBlocks'> & {
    enrichmentBlocks: (NormalizedSetup['formation']['enrichmentBlocks'][number] & {
      type?: string;
      minutes?: number;
    })[];
  };
};
export type {
  LearnScoreIdentity,
  SetupInputNode,
  SetupBookInput,
  LearnRuntimeSeed,
  LearnRuntimeChild,
  LearnRuntimeBook,
  SetupTruthyFilter,
};
import type { normalizeSetupPayload } from './setup-normalization.js';
