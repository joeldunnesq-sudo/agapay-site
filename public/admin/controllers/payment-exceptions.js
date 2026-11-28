// Generated from src/browser/admin/controllers/payment-exceptions.ts by npm run build:browser. Do not edit.
const paymentExceptionFilters = document.querySelector('#paymentExceptionFilters');
const paymentExceptionPrevious = document.querySelector('#paymentExceptionPrevious');
const paymentExceptionNext = document.querySelector('#paymentExceptionNext');
let paymentExceptionPage = 0;
let paymentExceptionCursors = [''];
let paymentExceptionNextCursor = '';
let paymentExceptionQuery = new URLSearchParams({ sort: 'oldest' });
function paymentExceptionAssignment(event, status) {
  const panel = document.createElement('details');
  panel.className = 'payment-exception-guidance';
  const summary = document.createElement('summary');
  summary.textContent = event.owner ? `Assigned to ${event.owner}` : 'Assign follow-up';
  const form = document.createElement('form');
  form.className = 'payment-exception-assignment';
  const ownerLabel = document.createElement('label');
  ownerLabel.textContent = 'Owner';
  const owner = document.createElement('input');
  owner.maxLength = 80;
  owner.value = event.owner || '';
  ownerLabel.append(owner);
  const actionLabel = document.createElement('label');
  actionLabel.textContent = 'Next action';
  const nextAction = document.createElement('textarea');
  nextAction.rows = 2;
  nextAction.maxLength = 240;
  nextAction.value = event.nextAction || '';
  actionLabel.append(nextAction);
  const save = document.createElement('button');
  save.type = 'submit';
  save.textContent = 'Save follow-up';
  form.append(ownerLabel, actionLabel, save);
  panel.append(summary, form);
  form.addEventListener('submit', async (submitEvent) => {
    submitEvent.preventDefault();
    save.disabled = true;
    try {
      const headers = new Headers(authHeaders());
      headers.set('Content-Type', 'application/json');
      const response = await fetch(
        `/api/admin/accounting/payment-exceptions/${encodeURIComponent(event.id)}/assignment`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            owner: owner.value,
            nextAction: nextAction.value,
            version: event.assignmentVersion || 0,
          }),
        }
      );
      const result = await response.json();
      if (!response.ok || typeof result.version !== 'number')
        throw new Error(result.error || 'Could not save follow-up.');
      event.assignmentVersion = result.version;
      summary.textContent = owner.value.trim() ? `Assigned to ${owner.value.trim()}` : 'Assign follow-up';
      status.textContent = 'Follow-up saved.';
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'Could not save follow-up.';
    } finally {
      save.disabled = false;
    }
  });
  return panel;
}
async function loadPaymentExceptions(button, notice = '') {
  const list = document.getElementById('paymentExceptionList');
  const status = document.getElementById('paymentExceptionStatus');
  if (!list || !status || button.disabled) return;
  button.disabled = true;
  if (paymentExceptionPrevious) paymentExceptionPrevious.disabled = true;
  if (paymentExceptionNext) paymentExceptionNext.disabled = true;
  status.textContent = 'Loading payment exceptions…';
  try {
    const query = new URLSearchParams(paymentExceptionQuery);
    const cursor = paymentExceptionCursors[paymentExceptionPage];
    if (cursor) query.set('cursor', cursor);
    const response = await fetch(`/api/admin/accounting/payment-exceptions?${query}`, { headers: authHeaders() });
    if (!response.ok) throw new Error('Failed to load payment exceptions');
    const { events, nextCursor } = await response.json();
    paymentExceptionNextCursor = nextCursor || '';
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
      const ageHours = Math.max(0, Math.floor((Date.now() - Date.parse(event.receivedAt)) / 36e5));
      if (ageHours >= 1)
        received.textContent += ageHours >= 24 ? ` · ${Math.floor(ageHours / 24)}d ago` : ` · ${ageHours}h ago`;
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
      if (event.canAssign) item.append(paymentExceptionAssignment(event, status));
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
            const response2 = await fetch(
              `/api/admin/accounting/payment-exceptions/${encodeURIComponent(event.id)}/retry`,
              {
                method: 'POST',
                headers: authHeaders(),
              }
            );
            const result = await response2.json();
            if (response2.ok && result.outcome === 'processed') {
              await loadPaymentExceptions(
                button,
                `Stripe event ${event.id} was processed. The retry is in the audit log.`
              );
              return;
            }
            status.textContent = result.error || 'The retry could not finish. Refresh the queue before trying again.';
          } catch {
            status.textContent = 'The retry result is unavailable. Refresh the queue before trying again.';
          } finally {
            retry.disabled = false;
          }
        });
        item.append(retry);
      }
      list.append(item);
    }
    status.textContent =
      notice ||
      (events.length
        ? `Page ${paymentExceptionPage + 1} · ${events.length} exceptions.`
        : 'No matching payment exceptions.');
  } catch {
    paymentExceptionNextCursor = '';
    status.textContent = 'Could not refresh payment exceptions. Try again.';
  } finally {
    button.disabled = false;
    if (paymentExceptionPrevious) paymentExceptionPrevious.disabled = paymentExceptionPage === 0;
    if (paymentExceptionNext) paymentExceptionNext.disabled = !paymentExceptionNextCursor;
  }
}
const paymentExceptionRefresh = document.querySelector('#paymentExceptionRefresh');
paymentExceptionRefresh?.addEventListener('click', () => void loadPaymentExceptions(paymentExceptionRefresh));
paymentExceptionFilters?.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!paymentExceptionRefresh || paymentExceptionRefresh.disabled) return;
  paymentExceptionQuery = new URLSearchParams();
  new FormData(paymentExceptionFilters).forEach((value, key) => paymentExceptionQuery.set(key, String(value)));
  paymentExceptionPage = 0;
  paymentExceptionCursors = [''];
  void loadPaymentExceptions(paymentExceptionRefresh);
});
paymentExceptionPrevious?.addEventListener('click', () => {
  if (!paymentExceptionRefresh || paymentExceptionPage === 0) return;
  paymentExceptionPage -= 1;
  void loadPaymentExceptions(paymentExceptionRefresh);
});
paymentExceptionNext?.addEventListener('click', () => {
  if (!paymentExceptionRefresh || !paymentExceptionNextCursor) return;
  paymentExceptionPage += 1;
  paymentExceptionCursors[paymentExceptionPage] = paymentExceptionNextCursor;
  void loadPaymentExceptions(paymentExceptionRefresh);
});
