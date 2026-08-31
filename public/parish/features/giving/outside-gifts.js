'use strict';
/* exported outsidePledgeFields, outsideSourceFields, submitOutsideVoid */
/* global currentParish, authHeaders, escapeHtml, escapeAttr, moneyFull, loadGivingHistory */
/* exported loadOutsideGiving, openOutsideGift, searchOutsideGivers, submitOutsideGift, closeOutsideGift, outsideGiftAction, submitOutsideAccounting */

let outsideGivingState = {
  parishId: '',
  rows: [],
  editing: null,
  requestKey: '',
  year: String(new Date().getFullYear()),
};
const outsideApi = (suffix = '') =>
  '/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/outside-gifts' + suffix;
const outsideText = (id, text) => {
  const element = document.getElementById(id);
  if (element) element.textContent = text;
};
async function outsideRequest(suffix = '', body) {
  const response = await fetch(outsideApi(suffix), {
    method: body ? 'POST' : 'GET',
    headers: { ...authHeaders(), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || 'Unable to load outside giving.');
    error.code = data.code;
    throw error;
  }
  return data;
}
function outsideDate(value) {
  return new Date(value + 'T12:00:00').toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
function resetOutsideParish() {
  if (outsideGivingState.parishId === currentParish?.parishId) return;
  document.getElementById('outsideGiftDialog')?.close();
  document.getElementById('outsideAccountingDialog')?.close();
  document.getElementById('outsideVoidDialog')?.close();
  outsideGivingState = {
    parishId: currentParish?.parishId || '',
    rows: [],
    editing: null,
    requestKey: '',
    year: String(new Date().getFullYear()),
  };
}
async function loadOutsideGiving() {
  if (!currentParish) return;
  resetOutsideParish();
  const mount = document.getElementById('outsideGivingMount');
  if (mount && !document.getElementById('outsideGivingPane'))
    mount.innerHTML =
      '        <section class="og-panel" id="outsideGivingPane" aria-labelledby="outsideGivingTitle">\n          <div class="og-header"><div><span class="og-eyebrow">Every gift belongs · every plan</span><h2 id="outsideGivingTitle">Giving beyond the app</h2><p class="og-note">Cash, checks, and other platforms—connected to your givers and Funds &amp; Alms.</p></div><button type="button" class="sw-report-generate-btn" onclick="openOutsideGift()">＋ Record outside gift</button></div>\n          <div class="og-toolbar"><label for="outsideGivingYear">Year<input id="outsideGivingYear" type="number" min="1900" max="2199" onchange="loadOutsideGiving()" /></label><button type="button" class="sw-action-btn" onclick="loadOutsideGiving()">Refresh outside gifts</button><strong id="outsideGivingTotal" class="og-total">—</strong></div>\n          <p id="outsideGivingStatus" class="og-status" role="status">Open Givers to load recorded outside contributions.</p><div id="outsideGivingRows"></div>\n        </section>';
  const pane = document.getElementById('outsideGivingPane');
  if (!pane) return;
  const year = document.getElementById('outsideGivingYear')?.value || outsideGivingState.year;
  const parishId = currentParish.parishId;
  outsideGivingState.year = year;
  document.getElementById('outsideGivingYear').value = year;
  outsideText('outsideGivingStatus', 'Loading outside contributions…');
  try {
    const data = await outsideRequest('?year=' + encodeURIComponent(year));
    if (currentParish?.parishId !== parishId || outsideGivingState.year !== year) return;
    outsideGivingState.rows = data.gifts;
    const active = data.gifts.filter((g) => g.recordState === 'active');
    outsideText('outsideGivingTotal', moneyFull(active.reduce((sum, g) => sum + g.amountCents, 0)));
    outsideText(
      'outsideGivingStatus',
      active.length +
        ' contribution' +
        (active.length === 1 ? '' : 's') +
        ' recorded for ' +
        year +
        ' · outside gifts, not Stripe deposits'
    );
    document.getElementById('outsideGivingRows').innerHTML = data.gifts.length
      ? data.gifts
          .map(
            (g) => `<details class="og-record ${g.recordState === 'void' ? 'og-void' : ''}">
      <summary><span><strong>${escapeHtml(g.donorName)}</strong><small>${escapeHtml(outsideDate(g.receivedDate))} · ${escapeHtml(g.sourceLabel)} · ${g.givingKind === 'pledge' ? 'Pledge ' + g.pledgeYear : 'Other giving'} · ${escapeHtml(g.fund)}</small></span><span><strong>${moneyFull(g.amountCents)}</strong><small>${g.recordState === 'void' ? 'Voided' : g.accounting.linked ? 'Accounting linked' : 'Giving record only'}</small></span></summary>
      <div class="og-record-body"><p>${escapeHtml([g.reference, g.notes].filter(Boolean).join(' · ') || 'No additional notes.')}</p>
      <p class="og-note">${g.accounting.linked ? 'Linked to Accounting entry ' + escapeHtml(g.accounting.entryId) + '. This did not create another deposit.' : 'No Accounting entry has been created by this gift. Record its bank deposit once in Accounting, then link it here if applicable.'}</p>
      ${g.voidReason ? '<p>Void reason: ' + escapeHtml(g.voidReason) + '</p>' : ''}<div class="og-actions">
      ${g.recordState === 'active' ? `<button type="button" class="sw-action-btn" onclick="openOutsideGift('${escapeAttr(g.id)}')" ${g.accounting.linked ? 'disabled' : ''}>Correct gift</button><button type="button" class="sw-action-btn" onclick="outsideGiftAction('${escapeAttr(g.id)}','void')" ${g.accounting.linked ? 'disabled' : ''}>Void gift</button><button type="button" class="sw-action-btn" onclick="outsideGiftAction('${escapeAttr(g.id)}','accounting')">${g.accounting.linked ? 'Review Accounting link' : 'Link Accounting deposit'}</button>` : ''}
      <button type="button" class="sw-action-btn" onclick="outsideGiftAction('${escapeAttr(g.id)}','audit')">View audit trail</button></div><div id="og-audit-${escapeAttr(g.id)}" class="og-audit" aria-live="polite"></div></div></details>`
          )
          .join('')
      : '<div class="og-empty">Cash, checks, and gifts from other platforms belong here.<br>Record a gift to connect it to a giver and a parish fund.</div>';
  } catch (error) {
    if (currentParish?.parishId === parishId)
      outsideText('outsideGivingStatus', error.message + ' Use Refresh to retry.');
  }
}

function outsideDialogs() {
  if (document.getElementById('outsideGiftDialog')) return;
  const root = document.createElement('div');
  root.innerHTML = `<dialog id="outsideGiftDialog" class="og-dialog" aria-labelledby="outsideGiftTitle"><form id="outsideGiftForm" onsubmit="submitOutsideGift(event)">
    <div class="og-dialog-head"><div><span class="og-eyebrow">Giving beyond the app</span><h2 id="outsideGiftTitle">Record outside gift</h2></div><button type="button" class="og-close" onclick="closeOutsideGift()" aria-label="Close outside gift form">×</button></div>
    <p class="og-note">Record a contribution already received. This does not charge the giver or create a bank deposit.</p>
    <div class="og-giver-search"><label for="outsideGiverSearch">Find an existing giver<input id="outsideGiverSearch" type="search" placeholder="Name or email" maxlength="100" /></label><button class="sw-action-btn" type="button" onclick="searchOutsideGivers()">Find giver</button></div>
    <label for="outsideGiver">Attach to giver<select id="outsideGiver" name="giverReferenceId"><option value="">Anonymous / unassigned</option></select></label><p class="og-note" id="outsideGiverStatus" role="status"></p>
    <div class="og-grid"><label for="outsideDate">Date received<input id="outsideDate" name="entryDate" type="date" required /></label><label for="outsideAmount">Gift amount<input id="outsideAmount" name="amount" type="text" inputmode="decimal" placeholder="0.00" required /></label>
    <label for="outsideGivingKind">Giving purpose<select id="outsideGivingKind" name="givingKind" required onchange="outsidePledgeFields()"><option value="">Choose giving purpose</option><option value="other">Other giving</option><option value="pledge">Pledge payment</option></select></label><label for="outsidePledgeYear" id="outsidePledgeYearLabel" hidden>Pledge year<input id="outsidePledgeYear" name="pledgeYear" type="number" min="1900" max="2199" /></label>
    <label for="outsideFund">Fund<select id="outsideFund" name="fundId" required></select></label><label for="outsideSource">Source<select id="outsideSource" name="source" onchange="outsideSourceFields()"><option value="cash">Cash</option><option value="check">Check</option><option value="tithely">Tithe.ly</option><option value="paypal">PayPal</option><option value="other_giving_platform">Another giving platform</option></select></label>
    <label for="outsidePlatform" id="outsidePlatformLabel" hidden>Platform name<input id="outsidePlatform" name="sourceLabel" maxlength="60" /></label><label for="outsideReference">Check / deposit reference (optional)<input id="outsideReference" name="reference" maxlength="120" /></label></div>
    <label for="outsideNotes">Notes (optional)<textarea id="outsideNotes" name="notes" maxlength="500" rows="2"></textarea></label>
    <p class="og-note">Use the full contribution amount. External processing fees and bank net amounts are not inferred. Funds come from Funds &amp; Alms. Only gifts explicitly marked as pledge payments count toward the selected giver\u0027s existing pledge for that year. Other giving never reduces a pledge balance.</p>
    <label class="og-check" id="outsideDuplicateConfirm"><input type="checkbox" name="confirmedNotDuplicate" />I confirm this gift is not already recorded here, in AGAPAY online giving, or within an outside-giving collection total.</label>
    <label id="outsideCorrectionReason" hidden>Reason for correction<textarea name="reason" maxlength="500" rows="2"></textarea></label>
    <label id="outsideDuplicateReason" hidden>Why is this a separate gift?<textarea name="duplicateReason" maxlength="500" rows="2" placeholder="Explain the matching date, giver, amount, and reference"></textarea></label>
    <p id="outsideGiftStatus" class="og-status" role="status" aria-live="polite"></p><div class="og-dialog-footer"><button type="button" class="sw-action-btn" onclick="closeOutsideGift()">Cancel</button><button type="submit" class="sw-report-generate-btn" id="outsideGiftSave">Record gift</button></div>
  </form></dialog>
  <dialog id="outsideAccountingDialog" class="og-dialog" aria-labelledby="outsideAccountingTitle"><form id="outsideAccountingForm" onsubmit="submitOutsideAccounting(event)"><div class="og-dialog-head"><div><span class="og-eyebrow">One gift · one income entry</span><h2 id="outsideAccountingTitle">Link Accounting deposit</h2></div><button type="button" class="og-close" onclick="document.getElementById('outsideAccountingDialog').close()" aria-label="Close Accounting link">×</button></div>
    <p class="og-note" id="outsideAccountingContext"></p><p class="og-note">Choose a posted manual contribution for this fund. Several gifts can share a deposit, up to its recorded contribution amount. Nothing is posted again.</p>
    <label id="outsideAccountingChoice">Posted contribution<select id="outsideAccountingLine" name="lineId"></select></label>
    <label class="og-check" id="outsideAccountingConfirmation"><input type="checkbox" name="confirmedDeposit" />This posted contribution includes this gift, and the same gift is not linked elsewhere.</label>
    <label id="outsideUnlinkReason" hidden>Reason for unlinking<textarea name="reason" maxlength="500" rows="2"></textarea></label>
    <label class="og-check" id="outsideUnlinkConfirm" hidden><input type="checkbox" name="confirmedLedgerUnchanged" />I understand unlinking or voiding the giving record does not reverse the Accounting entry. Any ledger correction must be made in Accounting.</label>
    <p class="og-status" id="outsideAccountingStatus" role="status"></p><div class="og-dialog-footer"><button class="sw-action-btn" type="button" onclick="document.getElementById('outsideAccountingDialog').close();switchTab('accounting')">Open Accounting</button><button class="sw-report-generate-btn" id="outsideAccountingSave" type="submit">Link contribution</button></div>
  </form></dialog>
  <dialog id="outsideVoidDialog" class="og-dialog" aria-labelledby="outsideVoidTitle"><form onsubmit="submitOutsideVoid(event)"><span class="og-eyebrow">Keep the history, correct the record</span><h2 id="outsideVoidTitle">Void outside gift</h2><p id="outsideVoidContext" class="og-note"></p><p class="og-note">This removes the gift from giving totals and pledge progress. The original record and audit history remain. No money is moved.</p><label>Reason for voiding<textarea name="reason" minlength="8" maxlength="500" required rows="3"></textarea></label><p id="outsideVoidStatus" class="og-status" role="status"></p><div class="og-dialog-footer"><button type="button" class="sw-action-btn" onclick="document.getElementById('outsideVoidDialog').close()">Cancel</button><button id="outsideVoidSave" type="submit" class="sw-report-generate-btn">Void gift</button></div></form></dialog>`;
  document.body.appendChild(root);
}

async function searchOutsideGivers(selected) {
  const parishId = currentParish?.parishId;
  const select = document.getElementById('outsideGiver');
  const value = typeof selected === 'string' ? selected : select.value;
  outsideText('outsideGiverStatus', 'Searching parish giver records…');
  try {
    const data = await outsideRequest(
      '/givers?q=' + encodeURIComponent(document.getElementById('outsideGiverSearch').value)
    );
    if (currentParish?.parishId !== parishId) return;
    select.innerHTML =
      '<option value="">Anonymous / unassigned</option>' +
      data.givers
        .map(
          (g) =>
            `<option value="${escapeAttr(g.referenceId)}">${escapeHtml(g.name)}${g.email ? ' · ' + escapeHtml(g.email) : ''}</option>`
        )
        .join('');
    const current = outsideGivingState.editing;
    if (value && !data.givers.some((g) => g.referenceId === value) && current?.giverReferenceId === value)
      select.add(new Option(current.donorName + (current.donorEmail ? ' · ' + current.donorEmail : ''), value));
    select.value = value;
    if (!select.value) select.value = '';
    outsideText(
      'outsideGiverStatus',
      data.hasMore
        ? 'Showing 100 givers. Refine the search for more.'
        : 'Select a giver, or leave this contribution unassigned.'
    );
  } catch (error) {
    outsideText('outsideGiverStatus', error.message);
  }
}

async function openOutsideGift(id = '') {
  resetOutsideParish();
  outsideDialogs();
  const gift = outsideGivingState.rows.find((g) => g.id === id) || null;
  if (id && !gift) return;
  outsideGivingState.editing = gift;
  outsideGivingState.requestKey = crypto.randomUUID();
  const form = document.getElementById('outsideGiftForm');
  form.reset();
  document.getElementById('outsideDuplicateReason').hidden = true;
  document.getElementById('outsideDuplicateConfirm').hidden = Boolean(gift);
  document.getElementById('outsideCorrectionReason').hidden = !gift;
  form.elements.reason.required = Boolean(gift);
  form.elements.confirmedNotDuplicate.required = !gift;
  const today = new Date();
  let localDay;
  try {
    localDay = new Intl.DateTimeFormat('en-CA', {
      timeZone: currentParish.timezone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(today);
  } catch {
    localDay = today.toISOString().slice(0, 10);
  }
  form.elements.entryDate.value = gift?.receivedDate || localDay;
  form.elements.entryDate.max = localDay;
  form.elements.givingKind.value = gift?.givingKind || '';
  form.elements.pledgeYear.value = gift?.pledgeYear || (gift?.receivedDate || localDay).slice(0, 4);
  outsidePledgeFields();
  outsideSourceFields();
  form.elements.fundId.innerHTML =
    '<option value="">Choose a fund</option>' +
    (currentParish.funds || [])
      .filter((f) => f.enabled !== false && f.active !== false)
      .map((f) => `<option value="${escapeAttr(f.id || f.code)}">${escapeHtml(f.name)}</option>`)
      .join('');
  if (gift) {
    form.elements.amount.value = (gift.amountCents / 100).toFixed(2);
    form.elements.fundId.value = gift.fundId;
    form.elements.source.value =
      gift.contributionSource === 'cash_and_checks'
        ? gift.sourceLabel === 'Check'
          ? 'check'
          : 'cash'
        : gift.contributionSource;
    form.elements.sourceLabel.value = gift.contributionSource === 'other_giving_platform' ? gift.sourceLabel : '';
    outsideSourceFields();
    form.elements.reference.value = gift.reference;
    form.elements.notes.value = gift.notes;
  }
  outsideText('outsideGiftTitle', gift ? 'Correct outside gift' : 'Record outside gift');
  outsideText('outsideGiftSave', gift ? 'Save correction' : 'Record gift');
  outsideText('outsideGiftStatus', '');
  document.getElementById('outsideGiftDialog').showModal();
  await searchOutsideGivers(gift?.giverReferenceId || '');
}
function outsidePledgeFields() {
  const form = document.getElementById('outsideGiftForm');
  const pledge = form.elements.givingKind.value === 'pledge';
  document.getElementById('outsidePledgeYearLabel').hidden = !pledge;
  form.elements.pledgeYear.required = pledge;
  form.elements.giverReferenceId.required = pledge;
}
function outsideSourceFields() {
  const form = document.getElementById('outsideGiftForm');
  const other = form.elements.source.value === 'other_giving_platform';
  document.getElementById('outsidePlatformLabel').hidden = !other;
  form.elements.sourceLabel.required = other;
}
function closeOutsideGift() {
  if (!document.getElementById('outsideGiftSave')?.disabled) document.getElementById('outsideGiftDialog')?.close();
}
async function submitOutsideGift(event) {
  event.preventDefault();
  const form = event.currentTarget,
    button = document.getElementById('outsideGiftSave'),
    data = Object.fromEntries(new FormData(form));
  const amount = String(data.amount || '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
    outsideText('outsideGiftStatus', 'Enter a positive amount with no more than two decimal places.');
    return;
  }
  const [dollars, cents = ''] = amount.split('.');
  const amountCents = Number(dollars) * 100 + Number(cents.padEnd(2, '0'));
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    outsideText('outsideGiftStatus', 'Enter a valid positive amount.');
    return;
  }
  const gift = outsideGivingState.editing,
    parishId = currentParish.parishId;
  const payload = {
    ...data,
    amountCents,
    requestKey: outsideGivingState.requestKey,
    confirmedNotDuplicate: form.elements.confirmedNotDuplicate.checked,
    ...(gift ? { revision: gift.revision } : {}),
  };
  button.disabled = true;
  outsideText('outsideGiftStatus', 'Saving contribution…');
  try {
    await outsideRequest(gift ? '/' + encodeURIComponent(gift.id) + '/correct' : '', payload);
    if (currentParish?.parishId !== parishId) return;
    document.getElementById('outsideGiftDialog').close();
    outsideGivingState.year = payload.entryDate.slice(0, 4);
    document.getElementById('outsideGivingYear').value = outsideGivingState.year;
    await Promise.all([loadOutsideGiving(), loadGivingHistory()]);
  } catch (error) {
    outsideText('outsideGiftStatus', error.message);
    if (error.code === 'outside_gift_duplicate') document.getElementById('outsideDuplicateReason').hidden = false;
  } finally {
    button.disabled = false;
  }
}

async function outsideGiftAction(id, action) {
  const gift = outsideGivingState.rows.find((g) => g.id === id);
  if (!gift) return;
  try {
    if (action === 'audit') {
      const data = await outsideRequest('/' + encodeURIComponent(id));
      document.getElementById('og-audit-' + id).innerHTML = data.audit
        .map(
          (a) =>
            `<p><strong>Revision ${a.revision} · ${escapeHtml(a.action.replaceAll('_', ' '))}</strong><br>${escapeHtml(a.created_at)} · ${escapeHtml(a.actor_id)}${a.reason ? '<br>' + escapeHtml(a.reason) : ''}</p>`
        )
        .join('');
    } else if (action === 'void') {
      outsideDialogs();
      outsideGivingState.voidGift = gift;
      const dialog = document.getElementById('outsideVoidDialog');
      dialog.querySelector('form').reset();
      outsideText('outsideVoidContext', gift.donorName + ' · ' + moneyFull(gift.amountCents) + ' · ' + gift.fund);
      outsideText('outsideVoidStatus', '');
      dialog.showModal();
    } else {
      outsideDialogs();
      outsideGivingState.accountingGift = gift;
      const form = document.getElementById('outsideAccountingForm');
      form.reset();
      const linked = gift.accounting.linked;
      document.getElementById('outsideAccountingChoice').hidden = linked;
      document.getElementById('outsideAccountingConfirmation').hidden = linked;
      document.getElementById('outsideUnlinkReason').hidden = !linked;
      document.getElementById('outsideUnlinkConfirm').hidden = !linked;
      form.elements.confirmedDeposit.required = !linked;
      form.elements.reason.required = linked;
      form.elements.confirmedLedgerUnchanged.required = linked;
      outsideText('outsideAccountingTitle', linked ? 'Review Accounting link' : 'Link Accounting deposit');
      outsideText(
        'outsideAccountingContext',
        gift.donorName +
          ' · ' +
          moneyFull(gift.amountCents) +
          ' · ' +
          gift.fund +
          (linked ? ' · ' + gift.accounting.entryId : '')
      );
      outsideText('outsideAccountingSave', linked ? 'Unlink contribution' : 'Link contribution');
      document.getElementById('outsideAccountingSave').disabled = true;
      document.getElementById('outsideAccountingDialog').showModal();
      outsideText('outsideAccountingStatus', 'Checking Accounting access…');
      const data = await outsideRequest('/' + encodeURIComponent(id) + '/accounting');
      document.getElementById('outsideAccountingLine').innerHTML =
        '<option value="">Choose a posted contribution</option>' +
        data.lines
          .filter((l) => l.availableCents >= gift.amountCents)
          .map(
            (l) =>
              `<option value="${escapeAttr(l.line_id)}">${escapeHtml(l.entry_date)} · ${escapeHtml(l.description || l.account_name)} · ${moneyFull(l.availableCents)} unassigned</option>`
          )
          .join('');
      outsideText(
        'outsideAccountingStatus',
        linked
          ? data.linkValid === false
            ? 'This linked entry is no longer a valid posted contribution in the current books. Review it in Accounting and unlink with a reason if needed.'
            : 'Unlinking preserves the audit trail and does not change Accounting.'
          : data.note
      );
      document.getElementById('outsideAccountingSave').disabled = false;
    }
  } catch (error) {
    outsideText(action === 'accounting' ? 'outsideAccountingStatus' : 'outsideGivingStatus', error.message);
  }
}
async function submitOutsideAccounting(event) {
  event.preventDefault();
  const form = event.currentTarget,
    gift = outsideGivingState.accountingGift,
    button = document.getElementById('outsideAccountingSave');
  button.disabled = true;
  try {
    await outsideRequest('/' + encodeURIComponent(gift.id) + (gift.accounting.linked ? '/unlink' : '/accounting'), {
      ...Object.fromEntries(new FormData(form)),
      revision: gift.revision,
      confirmedDeposit: form.elements.confirmedDeposit.checked,
      confirmedLedgerUnchanged: form.elements.confirmedLedgerUnchanged.checked,
    });
    document.getElementById('outsideAccountingDialog').close();
    await Promise.all([loadOutsideGiving(), loadGivingHistory()]);
  } catch (error) {
    outsideText('outsideAccountingStatus', error.message);
  } finally {
    button.disabled = false;
  }
}
async function submitOutsideVoid(event) {
  event.preventDefault();
  const gift = outsideGivingState.voidGift;
  const button = document.getElementById('outsideVoidSave');
  button.disabled = true;
  try {
    await outsideRequest('/' + encodeURIComponent(gift.id) + '/void', {
      revision: gift.revision,
      reason: event.currentTarget.elements.reason.value,
    });
    document.getElementById('outsideVoidDialog').close();
    await Promise.all([loadOutsideGiving(), loadGivingHistory()]);
  } catch (error) {
    outsideText('outsideVoidStatus', error.message);
  } finally {
    button.disabled = false;
  }
}
