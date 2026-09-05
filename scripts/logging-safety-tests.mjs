import assert from 'node:assert/strict';
import { sanitize, logEvent } from '../src/lib/logging.js';

const deep = { a: { b: { c: { d: { e: { password: 'FAKE_SECRET' } } } } } };
assert.ok(!JSON.stringify(sanitize(deep)).includes('FAKE_SECRET'));
assert.equal(sanitize({ password: 'secret' }).password, '[redacted]');
const cycle = {}; cycle.self = cycle;
assert.equal(sanitize(cycle).self, '[circular]');
assert.equal(sanitize({ get value() { throw new Error('getter ran'); } }).value, '[accessor]');
assert.doesNotThrow(() => JSON.stringify(sanitize({ bigint: 10n, value: Symbol('x'), list: new Array(10000).fill(deep) })));
const originalLog = console.log;
const originalError = console.error;
const lines = [];
try {
  console.log = console.error = (value) => lines.push(value);
  await logEvent({}, { eventType: 'test', metadata: { cycle, deep, oversized: '😀'.repeat(20000) } });
  await logEvent({}, { get eventType() { throw new Error('hostile field'); } });
  await logEvent({}, { eventType: '😀'.repeat(10000), requestId: '😀'.repeat(10000), metadata: new Array(1000).fill('😀'.repeat(10000)) });
  assert.equal(lines.length, 3);
  for (const line of lines) {
    assert.doesNotThrow(() => JSON.parse(line));
    assert.ok(new TextEncoder().encode(line).length <= 16000);
    assert.ok(!line.includes('FAKE_SECRET'));
  }
  console.error = () => { throw new Error('sink unavailable'); };
  await assert.doesNotReject(logEvent({}, { eventType: 'test', severity: 'error', metadata: cycle }));
} finally { console.log = originalLog; console.error = originalError; }
console.log('PASS - bounded log redaction, cycles, accessors, oversized data and broken sinks');
