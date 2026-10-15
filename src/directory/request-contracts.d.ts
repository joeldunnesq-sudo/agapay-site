import type { DirectorySelfContext } from './contracts.js';
export interface DirectoryMemberContext {
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
