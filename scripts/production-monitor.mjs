#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { runProductionMonitor } from './lib/production-monitor.mjs';

const baseUrl = process.argv[2] || process.env.AGAPAY_BASE_URL || 'https://agapay.app';
const token = String(process.env.AGAPAY_MONITOR_CANARY_TOKEN || '').trim();
if (!token) throw new Error('AGAPAY_MONITOR_CANARY_TOKEN is required; the authenticated check may not be skipped.');
const output = process.env.AGAPAY_MONITOR_OUTPUT || 'artifacts/production-monitor/outside-in.json';
const evidence = await runProductionMonitor({ baseUrl, token });
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
for (const check of evidence.checks) {
  console.log(
    `${check.ok ? 'PASS' : 'FAIL'} - ${check.name}: HTTP ${check.status}, ${check.latencyMs}ms${check.failures.length ? ` (${check.failures.join(', ')})` : ''}`
  );
}
if (!evidence.ok) {
  console.error(`Production monitor failed with ${(evidence.sampleErrorRate * 100).toFixed(1)}% sample error rate.`);
  process.exit(1);
}
console.log('PASS - outside-in health, dashboard, giving, bindings, scheduler freshness, and authenticated canary');
