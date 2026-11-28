interface AdminPaymentException {
  id: string;
  type: string;
  status: 'failed' | 'stalled';
  receivedAt: string;
  parishId?: string;
  parishName?: string;
  canRetry?: boolean;
  reason?: string;
  nextStep?: string;
}

async function loadPaymentExceptions(button: HTMLButtonElement, notice = '') {
  const list = document.getElementById('paymentExceptionList');
  const status = document.getElementById('paymentExceptionStatus');
  if (!list || !status) return;
  button.disabled = true;
  status.textContent = 'Loading payment exceptions…';
  try {
    const response = await fetch('/api/admin/accounting/payment-exceptions', { headers: authHeaders() });
    if (!response.ok) throw new Error('Failed to load payment exceptions');
    const { events, hasMore } = (await response.json()) as { events: AdminPaymentException[]; hasMore: boolean };
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
      const parish = document.createElement('span');
      parish.className = 'payment-exception-guidance';
      parish.textContent = event.parishName || event.parishId || 'Parish unassigned';
      item.append(parish);
      if (event.reason) {
        const guidance = document.createElement('p');
        guidance.className = 'payment-exception-guidance';
        guidance.textContent = [event.reason, event.nextStep].filter(Boolean).join(' ');
        item.append(guidance);
      }
      if (event.canRetry) {
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.textContent = 'Retry delivery';
        retry.addEventListener('click', async () => {
          if (!window.confirm(`Retry Stripe event ${event.id}? AGAPAY will record this attempt in the audit log.`))
            return;
          retry.disabled = true;
          status.textContent = 'Retrying the original Stripe delivery…';
          try {
            const response = await fetch(
              `/api/admin/accounting/payment-exceptions/${encodeURIComponent(event.id)}/retry`,
              {
                method: 'POST',
                headers: authHeaders(),
              }
            );
            const result = (await response.json()) as { outcome?: string; error?: string };
            if (response.ok && result.outcome === 'processed') {
              await loadPaymentExceptions(
                button,
                `Stripe event ${event.id} was processed. The retry is in the audit log.`
              );
              return;
            }
            status.textContent = result.error || 'The retry could not finish. Refresh the queue before trying again.';
          } catch {
            status.textContent = 'The retry result is unavailable. Refresh the queue before trying again.';
          }
        });
        item.append(retry);
      }
      list.append(item);
    }
    status.textContent =
      notice ||
      (hasMore
        ? 'Showing the 50 most recent exceptions. Use the event ID in Stripe Workbench to review a delivery.'
        : events.length
          ? 'Use the event ID in Stripe Workbench to review a delivery.'
          : 'No failed or stalled Stripe deliveries.');
  } catch {
    status.textContent = 'Could not refresh payment exceptions. Try again.';
  } finally {
    button.disabled = false;
  }
}

const paymentExceptionRefresh = document.querySelector<HTMLButtonElement>('#paymentExceptionRefresh');
paymentExceptionRefresh?.addEventListener('click', () => void loadPaymentExceptions(paymentExceptionRefresh));
