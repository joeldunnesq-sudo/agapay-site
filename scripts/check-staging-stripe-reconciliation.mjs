const token = process.env.AGAPAY_MONITOR_CANARY_TOKEN;
if (!token) throw new Error('Staging operations canary token is missing');

const result = await fetch(
  'https://agapay-site-staging.joeldunnesq.workers.dev/api/operations/canary?check=stripe-reconciliation',
  {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(60_000),
  }
);
if (!result.ok) throw new Error(`Staging Stripe reconciliation returned HTTP ${result.status}`);
const summary = await result.json();
if (!summary.ok || !Number.isSafeInteger(summary.accounts) || summary.accounts < 1) {
  throw new Error('The deployed staging reconciliation did not scan a connected sandbox account');
}
console.log(JSON.stringify({ accounts: summary.accounts, checked: summary.checked, discovered: summary.discovered }));
