// Generated from src/lib/paid-offering-status.ts by npm run build:server. Do not edit.
function paidOfferingStatus(offering = {}) {
  if (offering.recordType === 'subscription_setup') return false;
  const status = String(offering.status || '').toLowerCase();
  const paymentStatus = String(offering.paymentStatus || '').toLowerCase();
  return (
    status === 'paid' ||
    status === 'complete' ||
    status === 'completed' ||
    paymentStatus === 'paid' ||
    paymentStatus === 'succeeded'
  );
}
export { paidOfferingStatus };
