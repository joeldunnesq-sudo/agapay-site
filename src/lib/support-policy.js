// Generated from src/lib/support-policy.ts by npm run build:server. Do not edit.
const SUPPORT_POLICY = Object.freeze({
  version: '2026-11-03',
  email: 'support@agapay.app',
  timeZone: 'America/Chicago',
  startHour: 8,
  endHour: 18,
  responseBusinessHours: 16,
  hoursLabel: 'Monday–Friday, 8 a.m.–6 p.m. Central Time',
  responseLabel: 'We respond within 16 business hours. Resolution time depends on the issue.',
});
const central = new Intl.DateTimeFormat('en-US', {
  timeZone: SUPPORT_POLICY.timeZone,
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
function supportResponseDueAt(createdAt) {
  let cursor = Date.parse(createdAt);
  if (!Number.isFinite(cursor)) throw new Error('A valid ticket creation time is required.');
  let remaining = SUPPORT_POLICY.responseBusinessHours * 36e5;
  for (let steps = 0; remaining > 0 && steps < 2e4; steps++) {
    const parts = Object.fromEntries(central.formatToParts(cursor).map((p) => [p.type, p.value]));
    const business =
      !['Sat', 'Sun'].includes(parts.weekday) &&
      Number(parts.hour) >= SUPPORT_POLICY.startHour &&
      Number(parts.hour) < SUPPORT_POLICY.endHour;
    const advance = 6e4 - (cursor % 6e4);
    const elapsed = business ? Math.min(remaining, advance) : advance;
    cursor += elapsed;
    if (business) remaining -= elapsed;
  }
  if (remaining > 0) throw new Error('Support response target could not be calculated.');
  return new Date(cursor).toISOString();
}
export { SUPPORT_POLICY, supportResponseDueAt };
