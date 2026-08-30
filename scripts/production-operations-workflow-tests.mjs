import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const backup = read('.github/workflows/production-d1-backup.yml');
const recovery = read('.github/workflows/production-d1-recovery-drill.yml');
const monitor = read('.github/workflows/production-monitor.yml');

assert.match(backup, /d1-recovery\.mjs capture/);
assert.match(backup, /r2 object get[\s\S]+d1-recovery\.mjs verify-files/);
assert.match(backup, /platform-d1\/latest\.json/);
assert.doesNotMatch(backup, /upload-artifact/);

assert.match(recovery, /schedule:[\s\S]+cron:/);
assert.match(recovery, /d1 create "\$drill_database"/);
assert.match(recovery, /d1 execute "\$DRILL_DATABASE" --remote --file/);
assert.match(recovery, /d1-recovery\.mjs validate-database/);
assert.match(recovery, /--started-at-epoch-ms "\$DRILL_STARTED_AT_EPOCH_MS"/);
assert.match(
  recovery,
  /if: always\(\) && env\.DRILL_DATABASE != ''[\s\S]+d1 delete "\$DRILL_DATABASE" --skip-confirmation/
);
assert.doesNotMatch(recovery, /d1 execute agapay-production[^\n]+--file/);
assert.doesNotMatch(
  recovery,
  /path:\s*[^\n]*restore\.sql/,
  'The SQL payload must never be included in recovery evidence.'
);

assert.match(monitor, /cron: '7,22,37,52 \* \* \* \*'/);
assert.match(monitor, /AGAPAY_MONITOR_CANARY_TOKEN: \$\{\{ secrets\.AGAPAY_MONITOR_CANARY_TOKEN \}\}/);
assert.match(monitor, /d1-recovery\.mjs inspect-manifest[^\n]+--max-age-hours 30/);
assert.match(monitor, /production-monitor-alert\.mjs/);
assert.doesNotMatch(monitor, /allow-unconfigured/);

console.log(
  'PASS - backup read-back, isolated recovery cleanup, mandatory canary, freshness, and alert workflow controls'
);
