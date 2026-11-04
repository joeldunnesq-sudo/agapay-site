// Generated from src/browser/parish/accounting-journey.ts by npm run build:browser. Do not edit.
function accountingJourneyEntry() {
  return '<section class="acct-card acct-journey-entry"><div><span class="acct-kicker">Your first successful month</span><h2>Set up with confidence</h2><p>Review your categories and funds, bring over opening records, then complete your first bank reconciliation. Progress is saved for your parish.</p></div><button class="acct-primary" onclick="setAccountingView(&quot;journey&quot;)">Continue guided setup</button></section>';
}
async function accountingJourneyRequest(path = '', body) {
  const response = await fetch(accountingApi('/onboarding' + path), {
    method: body ? 'POST' : 'GET',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || 'Setup progress could not be loaded. Retry without changing your records.');
  return data.journey;
}
function accountingJourneyAction(view) {
  if (view === 'migration') {
    openAccountingMigration();
    return;
  }
  if (['settings', 'funds', 'assets', 'banking', 'setup', 'integrations', 'reports'].includes(view))
    setAccountingView(view);
}
async function openAccountingJourney() {
  accountingView = 'journey';
  const pane = document.getElementById('accountingPane');
  if (!pane) return;
  const tenant = currentParish?.parishId;
  const surface = document.createElement('section');
  surface.className = 'acct-journey';
  surface.dataset.parishId = tenant || '';
  pane.replaceChildren(surface);
  surface.innerHTML = '<p role="status">Checking your parish’s setup evidence…</p>';
  try {
    const journey = await accountingJourneyRequest();
    if (!surface.isConnected || tenant !== currentParish?.parishId) return;
    const choiceLabels = {
      reviewed: 'I reviewed the current records',
      importing: 'We are importing earlier books',
      new_books: 'New books — no earlier balances to bring over',
      existing_books: 'Existing or imported books — opening balances are complete',
      none: 'No older assets to register',
      deferred: 'Deferred — still needs attention',
    };
    surface.innerHTML = `<button class="acct-link" onclick="setAccountingView('overview')">← Accounting workspace</button><header class="acct-report-library-head"><div><span class="acct-kicker">A clear path to your first month-end</span><h2>Your parish setup journey</h2><p>${journey.completed} of ${journey.total} milestones complete. ${journey.firstReconciliationComplete ? 'Your first reconciliation milestone is complete. Continue the month-end checks before presenting reports.' : journey.readyForFirstReconciliation ? 'Your setup reviews are complete. You are ready to work through the first statement.' : 'Complete the next review below. Nothing here posts or changes financial amounts.'}</p><progress max="${journey.total}" value="${journey.completed}" aria-label="Setup milestones complete"></progress></div></header><p class="acct-journey-help">Have these ready: your fiscal-year dates, reviewed prior balance sheet, fund list, recent bank statement and older asset schedule. Use fictional records only in a designated demo parish.</p>${journey.warnings.length ? `<p role="alert">Ledger checks need attention: ${journey.warnings.map((w) => escapeHtml(w.replaceAll('_', ' '))).join(', ')}. Open setup checks to resolve these before relying on reports.</p>` : ''}<div class="acct-journey-tasks">${journey.tasks.map((task, index) => `<article class="acct-card acct-journey-task ${task.id === journey.nextTaskId ? 'acct-journey-next' : ''}"><span class="acct-kicker">${index + 1} · ${task.status === 'complete' ? 'Complete' : task.id === journey.nextTaskId ? 'Next step' : 'Needs attention'}</span><h3>${escapeHtml(task.title)}</h3><p>${escapeHtml(task.description)}</p><button class="acct-refresh" data-view="${escapeAttr(task.view)}" onclick="accountingJourneyAction(this.dataset.view)">${escapeHtml(task.action)}</button>${task.review ? `<p class="acct-journey-review">Last decision: ${escapeHtml(choiceLabels[task.review.choice] || task.review.choice)} · ${escapeHtml(/* @__PURE__ */ new Date(task.review.reviewed_at.replace(' ', 'T') + 'Z').toLocaleString())}. ${task.status !== 'complete' ? 'Review again if records changed or work is deferred.' : ''}</p>` : ''}${journey.choices[task.id] ? `<details ${task.id === journey.nextTaskId ? 'open' : ''}><summary>${task.status === 'complete' ? 'Review saved decision' : 'Record review or decision'}</summary><form class="acct-phase-form" data-task="${escapeAttr(task.id)}" data-version="${task.review?.version || 0}" data-evidence="${escapeAttr(task.evidenceHash || '')}" onsubmit="saveAccountingJourneyReview(event)"><label>Review decision<select name="choice">${journey.choices[task.id].map((choice) => `<option value="${escapeAttr(choice)}" ${choice === task.review?.choice ? 'selected' : ''}>${escapeHtml(choiceLabels[choice] || choice)}</option>`).join('')}</select></label><label>What did you check, or why does this choice apply?<textarea name="note" required maxlength="1200" placeholder="Record enough detail for the next treasurer.">${escapeHtml(task.review?.note || '')}</textarea></label><button class="acct-primary">Save review</button><span role="status"></span></form></details>` : ''}</article>`).join('')}</div><section class="acct-card"><h3>Need help or handing this to another volunteer?</h3><p>Use a named staff profile, keep supporting documents with their entries, and record review reasons here. Never include passwords, bank credentials or donor details in a support request.</p><button class="acct-primary" onclick="openParishSupportTicket()">Submit a support ticket</button><p>Or email <a href="mailto:support@agapay.app">support@agapay.app</a>. Monday–Friday, 8 a.m.–6 p.m. Central Time. We respond within 16 business hours.</p><button class="acct-refresh" onclick="setAccountingView('settings')">Staff access and settings</button><button class="acct-refresh" onclick="setAccountingView('close')">Month-end checklist</button></section>`;
  } catch (error) {
    if (surface.isConnected && tenant === currentParish?.parishId)
      surface.innerHTML = `<p role="alert">${escapeHtml(error.message)}</p><button class="acct-refresh" onclick="openAccountingJourney()">Retry setup check</button>`;
  }
}
async function saveAccountingJourneyReview(event) {
  event.preventDefault();
  const form = event.currentTarget,
    tenant = currentParish?.parishId,
    button = form.querySelector('button'),
    status = form.querySelector('[role=status]');
  if (form.closest('.acct-journey')?.dataset.parishId !== tenant) {
    status.textContent = 'Parish changed. Reopen guided setup before saving.';
    return;
  }
  button.disabled = true;
  status.textContent = 'Saving your review…';
  try {
    await accountingJourneyRequest('/reviews/' + encodeURIComponent(form.dataset.task), {
      ...Object.fromEntries(new FormData(form)),
      expectedVersion: Number(form.dataset.version),
      evidenceHash: form.dataset.evidence,
    });
    if (form.isConnected && tenant === currentParish?.parishId) await openAccountingJourney();
  } catch (error) {
    status.textContent = error.message;
    button.disabled = false;
  }
}
