import { readServerModuleSourceSync } from './server-typescript.mjs';
export function readCoreSource() {
  return readServerModuleSourceSync('src/lib/core.js');
}
