import type {
  DirectoryReviewSqlRow,
  DirectoryReviewDefinition,
  DirectoryReviewActor,
  DirectoryReviewContext,
  DirectoryReviewUser,
} from './admin-operation-contracts.js';

import type { DirectoryStatement } from './contracts.js';
export type RawDirectoryOperation<F> = F extends (env: infer E, options: infer O) => infer R
  ? (env: E, options: { [K in keyof O]: K extends 'context' | 'correlationId' ? O[K] : unknown }) => R
  : never;
export type {
  DirectoryReviewSqlRow,
  DirectoryReviewDefinition,
  DirectoryReviewActor,
  DirectoryReviewContext,
  DirectoryReviewUser,
  DirectoryStatement,
};
