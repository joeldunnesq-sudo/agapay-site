// Generates the reviewed operator-installable SQL. Does not connect to any database.
import { writeFileSync } from 'node:fs';
import { barrierStatements } from '../src/portability/closure.js';
const path = new URL('../docs/data-portability/install-write-barriers.sql', import.meta.url);
writeFileSync(path, '-- Install only after migration 0109 and schema/retention review.\n-- These triggers enforce closure tombstones even when the web feature is disabled.\n' + barrierStatements().join('\n') + '\n');
console.log('Generated parish closure barriers; no database was modified.');
