import type { DirectorySelfContext } from './contracts.js';
export interface DirectoryMemberContext {
  settings?: Awaited<ReturnType<typeof import('./settings.js').getDirectorySettings>>;
  personId?: string;
  viewerClass?: string;
  capabilities?: string[];
  parishIds?: string[];
  parishId: string;
  user: { id: string };
  [field: string]: unknown;
}
export interface DirectoryMemberOptions extends Record<string, unknown> {
  context: DirectoryMemberContext;
}
export interface DirectoryMediaOptions extends Record<string, unknown> {
  context: DirectorySelfContext;
}
