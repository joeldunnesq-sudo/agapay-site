import { synchronizeServerTypeScript } from './lib/server-typescript.mjs';

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) {
  throw new Error('Usage: node scripts/build-server-typescript.mjs [--check]');
}
const check = args.includes('--check');
await synchronizeServerTypeScript({ check });
console.log(
  `PASS - server TypeScript output ${check ? 'matches its source' : 'generated at existing JavaScript paths'}`
);
