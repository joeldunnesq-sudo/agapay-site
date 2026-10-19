import { synchronizeBrowserTypeScript } from './lib/browser-typescript.mjs';

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) {
  throw new Error('Usage: node scripts/build-browser-typescript.mjs [--check]');
}
const check = args.includes('--check');
await synchronizeBrowserTypeScript({ check });
console.log(
  `PASS - browser TypeScript output ${check ? 'matches its source' : 'generated at existing classic-script URLs'}`
);
