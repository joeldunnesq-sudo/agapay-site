import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
export function operationalReadiness(config, runsByWorkflow, now = new Date()) {
  const checks = config.evidence.map((item) => {
    const run = runsByWorkflow[item.workflow]?.[0];
    const age = run ? (now.getTime() - Date.parse(run.updated_at)) / 3600000 : Infinity;
    const passed = Boolean(
      run && run.status === 'completed' && run.conclusion === 'success' && age >= 0 && age <= item.maxAgeHours
    );
    return {
      name: item.name,
      workflow: item.workflow,
      passed,
      reason: !run
        ? 'missing_evidence'
        : run.status !== 'completed'
          ? 'running'
          : run.conclusion !== 'success'
            ? 'latest_run_failed'
            : age > item.maxAgeHours
              ? 'stale_evidence'
              : age < 0
                ? 'invalid_clock'
                : 'verified',
      url: run?.html_url || null,
      checkedAt: run?.updated_at || null,
    };
  });
  const ownership = {
    primary: config.support.primaryOwner || null,
    backup: config.support.backupOwner || null,
    backupAssigned: Boolean(config.support.backupOwner),
  };
  return {
    generatedAt: now.toISOString(),
    technicalReady: checks.every((c) => c.passed),
    operationalReady: checks.every((c) => c.passed) && Boolean(ownership.primary) && Boolean(config.support.email),
    support: config.support,
    ownership,
    checks,
    remaining: ownership.backupAssigned
      ? []
      : ['Assign someone to cover support when the primary owner is unavailable.'],
    scope: 'Read-only workflow evidence; no credentials, customer records or backup payloads are included.',
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = JSON.parse(await readFile('config/operational-readiness.json', 'utf8')),
    runs = {};
  for (const item of config.evidence) {
    const data = JSON.parse(
      execFileSync(
        'gh',
        ['api', `repos/joeldunnesq-sudo/agapay-site/actions/workflows/${item.workflow}/runs?branch=main&per_page=5`],
        { encoding: 'utf8', maxBuffer: 3000000 }
      )
    );
    runs[item.workflow] = data.workflow_runs.map((run) => ({
      status: run.status,
      conclusion: run.conclusion,
      updated_at: run.updated_at,
      html_url: run.html_url,
    }));
  }
  const report = operationalReadiness(config, runs);
  await mkdir('artifacts/operations', { recursive: true });
  await writeFile('artifacts/operations/readiness.json', JSON.stringify(report, null, 2) + '\n');
  for (const check of report.checks)
    console.log(`${check.passed ? 'PASS' : 'ATTENTION'} ${check.name}: ${check.reason}`);
  for (const remaining of report.remaining) console.log('COVERAGE RECOMMENDATION ' + remaining);
  if (!report.technicalReady) process.exitCode = 1;
}
