const baseUrl = String(process.env.AGAPAY_BASE_URL || 'https://agapay.app').replace(/\/+$/, '');
const token = String(process.env.AGAPAY_MONITOR_CANARY_TOKEN || '').trim();
if (!token) throw new Error('AGAPAY_MONITOR_CANARY_TOKEN is required.');
const runId = String(process.env.GITHUB_RUN_ID || 'manual');
const summary = String(
  process.env.AGAPAY_MONITOR_FAILURE_SUMMARY || 'One or more production monitoring checks failed.'
);
const response = await fetch(`${baseUrl}/api/operations/monitor-alert`, {
  method: 'POST',
  headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify({ runId, summary }),
  signal: AbortSignal.timeout(12_000),
});
if (!response.ok)
  throw new Error(
    `Independent alert delivery returned HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`
  );
console.log('PASS - independent production-monitor alert accepted for email delivery');
