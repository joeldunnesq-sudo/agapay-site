import type { DirectorySelfContext } from './contracts.js';
export function resolveDirectorySelfServiceContext(
  env: Partial<Env>,
  options: { request: Request }
): Promise<DirectorySelfContext>;
