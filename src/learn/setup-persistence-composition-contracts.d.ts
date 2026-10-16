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
  subjects: (NormalizedSetup['subjects'][number] & {
    completedThroughNumber?: number | string;
    progressionType?: string;
  })[];
  formationMaterials: (NormalizedSetup['formationMaterials'][number] & { formLabel?: string; cadence?: string })[];
  formation: Omit<NormalizedSetup['formation'], 'enrichmentBlocks' | 'recitationTracks' | 'hymnStudies' | 'feasts'> & {
    recitationTracks: (NormalizedSetup['formation']['recitationTracks'][number] & {
      source?: string;
      status?: string;
    })[];
    hymnStudies: (NormalizedSetup['formation']['hymnStudies'][number] & { source?: string })[];
    feasts: (NormalizedSetup['formation']['feasts'][number] & { date?: string })[];
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
