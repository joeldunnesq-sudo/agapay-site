const baseUrl = process.env.AGAPAY_BASE_URL;
const token = process.env.AGAPAY_MONITOR_CANARY_TOKEN;
const attempts = process.argv.includes('--wait-for-configuration') ? 36 : 1;
if (!baseUrl || !token)
  throw new Error('A target URL and the environment’s operations canary credential are required.');

const url = new URL('/api/operations/canary?check=stripe-connect', baseUrl);
if (url.protocol !== 'https:') throw new Error('The Stripe Connect check requires HTTPS.');
let summary = 'The Stripe Connect check did not respond.';
for (let attempt = 0; attempt < attempts; attempt += 1) {
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'error',
      signal: AbortSignal.timeout(8_000),
    });
    const result = await response.json();
    if (
      response.ok &&
      result.ok === true &&
      result.expectedDestination === true &&
      result.missingEvents?.length === 0
    ) {
      console.log('Stripe Connect destination and required event subscriptions verified.');
      process.exit(0);
    }
    if (response.status === 401 || result.error?.endsWith('_not_configured')) {
      throw new Error('The target’s Stripe Connect verification credentials or destination are missing.');
    }
    const missing = Array.isArray(result.missingEvents)
      ? result.missingEvents.filter((event) => typeof event === 'string' && /^[a-z_.]+$/.test(event))
      : [];
    summary = `Stripe Connect check returned HTTP ${response.status}. Required events missing: ${missing.join(', ') || 'none reported'}.`;
  } catch (error) {
    if (error.message.startsWith('The target’s')) throw error;
  }
  if (attempt === 0 && attempts > 1) console.log(summary);
  if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, 10_000));
}
throw new Error(summary);
