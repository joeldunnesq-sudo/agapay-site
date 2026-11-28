// Generated from src/browser/admin/controllers/payment-exceptions.ts by npm run build:browser. Do not edit.
async function loadPaymentExceptions(button) {
  const list = document.getElementById('paymentExceptionList');
  const status = document.getElementById('paymentExceptionStatus');
  if (!list || !status) return;
  button.disabled = true;
  status.textContent = 'Loading payment exceptions…';
  try {
    const response = await fetch('/api/admin/accounting/payment-exceptions', { headers: authHeaders() });
    if (!response.ok) throw new Error('Failed to load payment exceptions');
    const { events, hasMore } = await response.json();
    list.replaceChildren();
    for (const event of events) {
      const item = document.createElement('li');
      const type = document.createElement('strong');
      type.textContent = event.type || 'Stripe event';
      const id = document.createElement('code');
      id.textContent = event.id;
      const state = document.createElement('span');
      state.textContent = event.status === 'failed' ? 'Failed' : 'Stalled';
      const received = document.createElement('time');
      received.dateTime = event.receivedAt;
      received.textContent = new Date(event.receivedAt).toLocaleString();
      item.append(type, state, id, received);
      if (event.reason) {
        const guidance = document.createElement('p');
        guidance.className = 'payment-exception-guidance';
        guidance.textContent = [event.reason, event.nextStep].filter(Boolean).join(' ');
        item.append(guidance);
      }
      list.append(item);
    }
    status.textContent = hasMore
      ? 'Showing the 50 most recent exceptions. Use the event ID in Stripe Workbench to review a delivery.'
      : events.length
        ? 'Use the event ID in Stripe Workbench to review a delivery.'
        : 'No failed or stalled Stripe deliveries.';
  } catch {
    status.textContent = 'Could not refresh payment exceptions. Try again.';
  } finally {
    button.disabled = false;
  }
}
const paymentExceptionRefresh = document.querySelector('#paymentExceptionRefresh');
paymentExceptionRefresh?.addEventListener('click', () => void loadPaymentExceptions(paymentExceptionRefresh));
