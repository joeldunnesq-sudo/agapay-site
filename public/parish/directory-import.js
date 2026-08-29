(function () {
  let dialog, config, format, file, table, preview, mappedRows, batch, busy = false, pause = false, requestKey;
  const el = (id) => dialog.querySelector('#dirImport' + id);
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const say = (message) => { el('Status').textContent = message; };
  async function api(path, data) {
    const response = await fetch(config.api('/imports' + path), {
      method: data === undefined ? 'GET' : 'POST', headers: { ...config.headers(), ...(data === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }), cache: 'no-store'
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) throw new Error(payload.message || payload.error || 'Import request failed. Reopen the saved import before retrying.');
    return payload;
  }
  function resetPreview() {
    preview = null; mappedRows = null; batch = null; requestKey = crypto.randomUUID();
    el('Review').hidden = true; el('Results').hidden = true; el('Confirm').checked = false;
  }
  function setBusy(value) {
    busy = value;
    dialog.querySelectorAll('button, input, select').forEach((control) => { control.disabled = value; });
    el('Pause').disabled = !value; el('Pause').hidden = !value;
    if (!value && preview) el('Email').disabled = !preview.emailConfigured;
  }
  function buildDialog() {
    dialog = document.createElement('dialog'); dialog.className = 'directory-import-dialog';
    dialog.setAttribute('aria-labelledby', 'dirImportTitle');
    dialog.innerHTML = `<header><div><span class="directory-import-eyebrow">Parish Directory</span><h2 id="dirImportTitle">Import your directory</h2></div><button id="dirImportClose" type="button" aria-label="Close directory import">Close</button></header>
      <p>Bring your existing contacts into AGAPAY, then invite adults to create or connect their own accounts. Records stay private until the normal sharing and approval steps are complete.</p>
      <section><h3>1. Choose your file</h3><p>CSV UTF-8 or Excel (.xlsx), up to 2 MB and 500 people. Use one person per row. Give members of the same family the same household name. Set children’s relationship to <strong>child</strong>; they will never receive invitations. Unspecified relationships become <strong>other</strong>.</p>
      <div class="directory-import-actions"><label>Directory file<input id="dirImportFile" type="file" accept=".csv,.xlsx,.tsv" /></label><button id="dirImportTemplate" type="button">Download CSV template</button></div>
      <label id="dirImportSheetLabel" hidden>Worksheet<select id="dirImportSheet"></select></label>
      <p class="directory-import-note">The file is read on your device. Only mapped columns are submitted for review. Save old .xls files as .xlsx or CSV first. Do not include giving history, passwords, or pastoral notes.</p></section>
      <section id="dirImportMapping" hidden><h3>2. Match your columns</h3><p>Choose Full name or First name and Last name. Unmapped columns are ignored. Addresses need both a street and city. Country defaults to US; map a two-letter country code for other countries.</p><div id="dirImportColumns" class="directory-import-columns"></div><button id="dirImportPreview" type="button" class="btn btn-gold">Review import</button></section>
      <section id="dirImportReview" hidden><h3>3. Review and confirm</h3><p id="dirImportSummary"></p><div class="directory-import-table"><table><thead><tr><th>Row</th><th>Person / household</th><th>Email</th><th>Result</th></tr></thead><tbody id="dirImportRows"></tbody></table></div>
      <label class="directory-import-check"><input id="dirImportEmail" type="checkbox" /><span>Send signup invitations to eligible adults after importing. Each recipient can sign up or sign in and link their own record. Importing does not create accounts or grant household administrator permissions.</span></label>
      <p id="dirImportEmailNote" class="directory-import-note"></p>
      <label class="directory-import-check"><input id="dirImportConfirm" type="checkbox" /><span>I reviewed the columns, marked children as child, and am authorized to import these contacts. If I choose invitations, I confirm the recipients are adults who should receive a parish account invitation.</span></label>
      <button id="dirImportStart" type="button" class="btn btn-gold">Import reviewed contacts</button></section>
      <p id="dirImportStatus" role="status" aria-live="polite"></p><button id="dirImportPause" type="button" hidden>Pause after this group</button>
      <section id="dirImportResults" hidden><h3>Import progress</h3><p id="dirImportProgress"></p><div class="directory-import-actions"><button id="dirImportResume" type="button">Continue import</button><button id="dirImportRetry" type="button">Retry failed invitations</button><button id="dirImportReport" type="button">Download results CSV</button></div><div class="directory-import-table"><table><thead><tr><th>Row</th><th>Person</th><th>Import</th><th>Invitation / next step</th></tr></thead><tbody id="dirImportResultRows"></tbody></table></div></section>
      <section><h3>Recent imports</h3><p class="directory-import-note">Return to a saved import at any time. Uncertain deliveries need staff review and are never automatically resent.</p><div id="dirImportHistory"></div></section>`;
    document.body.appendChild(dialog);
    dialog.addEventListener('cancel', (event) => { if (busy) event.preventDefault(); });
    el('Close').onclick = () => dialog.close();
    el('File').onchange = () => readFile(el('File').files[0]);
    el('Sheet').onchange = () => readFile(file, el('Sheet').value);
    el('Preview').onclick = review; el('Start').onclick = start;
    el('Resume').onclick = () => process(false);
    el('Retry').onclick = () => { if (confirm('Retry only invitations the email provider did not accept? Sent and uncertain invitations will not be resent.')) process(true); };
    el('Pause').onclick = () => { pause = true; el('Pause').disabled = true; say('Pausing after the current group.'); };
    el('Report').onclick = () => { if (batch) download('agapay-import-results.csv', [['Row','Name','Email','Import status','Invitation status','Note'], ...batch.rows.map((r) => [r.rowNumber, r.name, r.email, r.status, r.emailStatus, r.message])]); };
    el('Template').onclick = () => download('agapay-directory-template.csv', [['Full name','Household','Email','Phone','Address','City','State','ZIP','Relationship'],['Alex Example','Example Household','alex@example.org','3125550100','123 Example St','Chicago','IL','60601','head'],['Child Example','Example Household','','','','','','','child']]);
  }
  async function readWorkbook(source, sheetName) {
    const buffer = await source.arrayBuffer();
    return new Promise((resolve, reject) => {
      const worker = new Worker('/parish/directory-import-file-worker.js');
      const finish = (error, result) => { clearTimeout(timer); worker.terminate(); error ? reject(new Error(error)) : resolve(result); };
      const timer = setTimeout(() => finish('Workbook parsing timed out. Export the worksheet as CSV.'), 15000);
      worker.onmessage = ({ data }) => finish(data.error, data);
      worker.onerror = () => finish('Unable to read the workbook. Export it as CSV and try again.');
      worker.postMessage({ buffer, sheetName }, [buffer]);
    });
  }
  async function readFile(source, sheetName) {
    if (!source) return;
    resetPreview(); el('Mapping').hidden = true; setBusy(true); say('Reading the file on this device…');
    try {
      if (source.size > format.IMPORT_MAX_FILE_BYTES) throw new Error('Choose a file under 2 MB.');
      file = source;
      if (/\.xlsx$/i.test(source.name)) {
        const result = await readWorkbook(source, sheetName);
        table = format.directoryImportTable(result.records);
        el('Sheet').innerHTML = result.sheetNames.map((name) => `<option ${name === result.sheetName ? 'selected' : ''} value="${escape(name)}">${escape(name)}</option>`).join('');
        el('SheetLabel').hidden = result.sheetNames.length < 2;
      } else if (/\.(csv|tsv)$/i.test(source.name)) {
        table = format.parseDirectoryCsv(new TextDecoder('utf-8', { fatal: true }).decode(await source.arrayBuffer())); el('SheetLabel').hidden = true;
      } else throw new Error('Choose a CSV, TSV, or .xlsx file.');
      const mapping = format.suggestImportMapping(table.headers);
      el('Columns').innerHTML = format.IMPORT_FIELDS.map(([key, label]) => `<label>${escape(label)}<select data-field="${key}"><option value="-1">Do not import</option>${table.headers.map((header, index) => `<option value="${index}" ${mapping[key] === index ? 'selected' : ''}>${escape(header)}</option>`).join('')}</select></label>`).join('');
      el('Columns').querySelectorAll('select').forEach((select) => { select.onchange = resetPreview; });
      el('Mapping').hidden = false; say(`${table.rows.length} rows read. Check the column matches, then review.`);
    } catch (error) { table = null; say(error.message); }
    finally { setBusy(false); }
  }
  async function review() {
    resetPreview(); setBusy(true); say('Checking rows and existing directory records…');
    try {
      const mapping = Object.fromEntries([...el('Columns').querySelectorAll('select')].map((select) => [select.dataset.field, Number(select.value)]));
      if (mapping.name < 0 && (mapping.firstName < 0 || mapping.lastName < 0)) throw new Error('Map Full name, or both First name and Last name.');
      mappedRows = format.mapImportRows(table, mapping);
      preview = (await api('/preview', { rows: mappedRows })).preview;
      const s = preview.summary;
      el('Summary').textContent = `${s.ready} ready · ${s.skipped} possible duplicates skipped · ${s.invalid} invalid. Only ready contacts will be imported. Existing records will not be overwritten.`;
      el('Rows').innerHTML = preview.rows.map((r) => `<tr><td>${r.rowNumber}</td><td><strong>${escape(r.data.name)}</strong><br>${escape(r.data.household)}</td><td>${escape(r.data.email || 'No email')}</td><td>${escape(r.message || (r.eligibleForInvitation ? 'Ready · invitation available' : 'Ready · no invitation'))}</td></tr>`).join('');
      el('Email').checked = false;
      el('EmailNote').textContent = preview.emailConfigured ? `${s.invitations} adults have an eligible email. Missing emails and children are imported without invitations. Recipients do not see other email addresses.` : 'Email delivery is not configured. Import without invitations or contact support.';
      el('Review').hidden = false; say('Preview ready. No records or emails have been created.');
    } catch (error) { say(error.message); } finally { setBusy(false); }
  }
  async function start() {
    if (!preview || !el('Confirm').checked) { say('Review the preview and confirm your authorization first.'); return; }
    const sendInvitations = el('Email').checked;
    if (sendInvitations && !confirm(`Import ${preview.summary.ready} contacts and send up to ${preview.summary.invitations} signup invitations?`)) return;
    setBusy(true); say('Saving the confirmed import…');
    try {
      batch = (await api('', { rows: mappedRows, previewHash: preview.hash, filename: file.name, sendInvitations, confirmed: true, requestKey })).batch;
      el('Review').hidden = true; renderBatch();
    } catch (error) { say(error.message); setBusy(false); return; }
    await process(false);
  }
  function renderBatch() {
    const s = batch.summary; el('Results').hidden = false;
    el('Progress').textContent = `${batch.filename}: ${s.imported} imported · ${s.ready} remaining · ${s.skipped} skipped · ${s.invalid} invalid · ${s.sent} invitations accepted by the email provider · ${s.failed} failed · ${s.uncertain} uncertain.`;
    el('Resume').hidden = !batch.hasPending; el('Retry').hidden = !s.failed;
    el('ResultRows').innerHTML = batch.rows.map((r) => `<tr><td>${r.rowNumber}</td><td>${escape(r.name)}</td><td>${escape(r.status)}</td><td>${escape(r.emailStatus.replace(/_/g, ' '))}${r.message ? '<br>' + escape(r.message) : ''}</td></tr>`).join('');
  }
  async function process(retryFailed) {
    if (!batch) return;
    setBusy(true); pause = false; say('Processing groups of five. You can pause after the current group.');
    try {
      do {
        batch = (await api('/' + encodeURIComponent(batch.id) + '/process', { retryFailed })).batch;
        retryFailed = false; renderBatch();
      } while (!pause && batch.hasPending);
      say(batch.hasPending ? 'Paused. Continue here or return from Recent imports.' : 'Processing finished. Review skipped rows and invitation failures below.');
      await history(); await config.onChange?.();
    } catch (error) { say(error.message + ' Reopen this import from Recent imports to resume safely.'); }
    finally { setBusy(false); }
  }
  async function history() {
    const items = (await api('')).imports;
    el('History').innerHTML = items.length ? items.map((item) => `<button type="button" data-import-id="${escape(item.id)}">${escape(item.filename)} · ${escape(new Date(item.createdAt).toLocaleDateString())}${item.pending ? ' · unfinished' : ''}</button>`).join('') : '<p>No imports yet.</p>';
    el('History').querySelectorAll('button').forEach((button) => { button.onclick = async () => {
      resetPreview(); setBusy(true);
      try { batch = (await api('/' + encodeURIComponent(button.dataset.importId))).batch; renderBatch(); say('Saved import loaded. Review the results or continue.'); }
      catch (error) { say(error.message); } finally { setBusy(false); }
    }; });
  }
  function download(filename, records) {
    const cell = (value) => { let text = String(value ?? ''); if (/^[\s]*[=+@-]/.test(text)) text = "'" + text; return '"' + text.replace(/"/g, '""') + '"'; };
    const blob = new Blob(['\uFEFF' + records.map((row) => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  window.DirectoryImport = { async open(options) {
    config = options;
    if (!dialog) buildDialog();
    dialog.showModal(); setBusy(true); say('Loading import tools…');
    try { format = await import('/parish/directory-import-format.js'); await history(); say('Choose a file or open a recent import.'); }
    catch (error) { say(error.message); } finally { setBusy(false); }
  } };
})();
