// Sacrament preparation template workspace.
// Loaded before sacraments.js and intentionally uses its shared dashboard state/helpers at interaction time.

function preparationItemEditorRow(item = {}, index = 0) {
  const type = item.itemType || 'confirmation';
  return `<div class="sac-prep-editor-item" data-prep-item data-item-id="${escapeAttr(item.id || '')}">
      <span class="sac-prep-drag-order">${index + 1}</span>
      <div class="sac-prep-editor-fields">
        <input class="form-control" data-prep-title value="${escapeAttr(item.title || '')}" placeholder="Preparation step" aria-label="Step ${index + 1} title" />
        <textarea class="form-control" data-prep-description rows="2" placeholder="Tell the family what to do and what happens next" aria-label="Step ${index + 1} instructions">${escapeHtml(item.description || '')}</textarea>
        <div class="sac-prep-editor-options">
          <select class="form-control" data-prep-type aria-label="Step ${index + 1} response type">
            ${[
              ['information', 'Read or review'],
              ['confirmation', 'Family confirms completion'],
              ['document', 'Family uploads a document'],
              ['clergy_review', 'Clergy completes the step'],
            ]
              .map(([value, label]) => `<option value="${value}" ${type === value ? 'selected' : ''}>${label}</option>`)
              .join('')}
          </select>
          <label><input type="checkbox" data-prep-required ${item.required !== false ? 'checked' : ''} /> Required</label>
          <button class="sac-admin-text-btn" type="button" onclick="removePreparationTemplateItem(this)">Remove</button>
        </div>
      </div>
    </div>`;
}

function preparationTemplateEditor(template) {
  const type = template.sacramentType;
  const typeLabel = sacramentTypeLabel({ sacramentType: type });
  const items = template.items || [];
  const guides = template.guides || [];
  const requiredCount = items.filter((item) => item.required !== false).length;
  const setupLabel = items.length ? 'Ready for new requests' : 'Add preparation steps';
  return `<details class="sac-admin-panel sac-prep-template" data-prep-template="${escapeAttr(type)}">
      <summary class="sac-admin-panel-head sac-prep-template-summary">
        <span class="sac-prep-template-icon" aria-hidden="true">${type === 'wedding' ? '◎' : '✦'}</span>
        <div class="sac-prep-template-summary-copy"><span>${escapeHtml(setupLabel)}</span><h2>${escapeHtml(typeLabel)}</h2><small>${items.length} ${items.length === 1 ? 'step' : 'steps'} · ${requiredCount} required · ${guides.length} ${guides.length === 1 ? 'guide' : 'guides'}</small></div>
        <div class="sac-prep-template-summary-meta"><b>v${Number(template.version || 1)}</b><i aria-hidden="true"></i></div>
      </summary>
      <div class="sac-prep-template-body">
        <div class="sac-prep-template-purpose">
          <div><span>What this does</span><strong>Creates a private preparation checklist for each new ${escapeHtml(typeLabel.toLowerCase())} request</strong></div>
          <p>Families see the message, steps, and guides in My AGAPAY. They can confirm tasks and upload requested documents while clergy review progress from the request card.</p>
        </div>
        <p class="sac-prep-scope-notice"><strong>For future requests:</strong> ${escapeHtml(template.requirementsNotice || '')} Saving changes here will not rewrite a checklist already assigned to a family.</p>

        <section class="sac-prep-builder-section" aria-labelledby="prep-message-${escapeAttr(type)}">
          <div class="sac-prep-builder-heading"><span>1</span><div><h3 id="prep-message-${escapeAttr(type)}">Set the family-facing message</h3><p>Introduce the preparation journey and explain the pastoral guidance families should see first.</p></div></div>
          <div class="sac-prep-template-fields">
            <label class="sac-admin-wide-field"><span>Checklist title</span><input class="form-control" data-prep-template-title value="${escapeAttr(template.title || '')}" placeholder="${escapeAttr(typeLabel)} preparation" /></label>
            <label class="sac-admin-wide-field"><span>Welcome message</span><textarea class="form-control" data-prep-template-introduction rows="3" placeholder="Explain how your parish will accompany the family through preparation.">${escapeHtml(template.introduction || '')}</textarea><small>Shown near the top of the family's checklist.</small></label>
            <label class="sac-admin-wide-field"><span>Pastoral guidance</span><textarea class="form-control" data-prep-template-canonical rows="3" placeholder="Describe parish-specific requirements that clergy will confirm.">${escapeHtml(template.canonicalNote || '')}</textarea><small>Shown to the family as pastoral guidance. State your parish's practice under clergy direction; avoid implying one universal jurisdictional rule.</small></label>
          </div>
        </section>

        <section class="sac-prep-builder-section" aria-labelledby="prep-steps-${escapeAttr(type)}">
          <div class="sac-prep-builder-heading"><span>2</span><div><h3 id="prep-steps-${escapeAttr(type)}">Build the checklist</h3><p>Steps appear to the family in this order. Choose who completes each one.</p></div></div>
          <div class="sac-prep-step-key" aria-label="Preparation step types">
            <span><b>Read</b> Family checks it off</span><span><b>Confirm</b> Family confirms completion</span><span><b>Upload</b> Family sends a file</span><span><b>Clergy</b> Parish staff completes it</span>
          </div>
          <div class="sac-prep-editor-list" data-prep-item-list>${items.map(preparationItemEditorRow).join('')}</div>
          <button class="sac-admin-outline-btn sac-prep-add-step" type="button" onclick="addPreparationTemplateItem('${escapeAttr(type)}')">+ Add preparation step</button>
        </section>

        <section class="sac-prep-builder-section" aria-labelledby="prep-guides-${escapeAttr(type)}">
          <div class="sac-prep-builder-heading"><span>3</span><div><h3 id="prep-guides-${escapeAttr(type)}">Share guides and forms</h3><p>Attach optional parish PDFs or images that every family using this template can download.</p></div></div>
          <div class="sac-prep-guides">
            ${guides.length ? `<div class="sac-prep-guide-list">${guides.map((guide) => `<div class="sac-prep-guide-row"><a href="${sacramentsApi('/preparation/documents/' + encodeURIComponent(guide.id) + '?download=1')}" target="_blank" rel="noopener">${escapeHtml(guide.displayName)}</a><span>${Math.max(1, Math.round(Number(guide.fileSize || 0) / 1024))} KB</span><button type="button" class="sac-admin-text-btn" onclick="deletePreparationGuide('${guide.id}')">Remove</button></div>`).join('')}</div>` : '<div class="sac-prep-empty-guides"><strong>No shared guides yet</strong><span>The checklist works without them; add a parish handout or form when useful.</span></div>'}
            ${sacramentsState.preparationDocumentsConfigured ? `<form class="sac-prep-upload-form" onsubmit="uploadPreparationGuide(event, '${escapeAttr(type)}')"><input class="form-control" name="displayName" placeholder="Guide title" aria-label="Guide title" required /><input class="form-control" name="document" type="file" accept=".pdf,.jpg,.jpeg,.png" aria-label="Guide file" required /><button class="sac-admin-outline-btn" type="submit">Upload guide</button></form>` : '<div class="notice">Private sacrament document storage must be configured before uploading guides.</div>'}
          </div>
        </section>

        <div class="sac-prep-save-bar"><div><strong>Ready to use this version?</strong><span>New requests receive a private copy when you save.</span></div><button class="btn btn-gold" type="button" onclick="savePreparationTemplate('${escapeAttr(type)}', this)">Save ${escapeHtml(typeLabel)} template</button></div>
      </div>
    </details>`;
}

function renderSacramentsPreparationTemplates() {
  const templates = sacramentsState.preparationTemplates || [];
  if (!templates.length)
    return '<div class="sac-admin-panel sac-admin-empty"><span>Preparation</span><h2>Templates unavailable</h2><p>Apply the Sacrament Preparation database migration, then refresh this page.</p></div>';
  const totalSteps = templates.reduce((sum, template) => sum + (template.items || []).length, 0);
  return `<div class="sac-prep-workspace">
      <section class="sac-prep-overview" aria-labelledby="sacPrepOverviewTitle">
        <div class="sac-prep-overview-copy"><span>Preparation workspace</span><h2 id="sacPrepOverviewTitle">Give every family a clear path to the sacrament</h2><p>Build each preparation journey once. AGAPAY gives new families their own checklist and keeps clergy and families working from the same progress.</p></div>
        <div class="sac-prep-overview-stat"><strong>${templates.length}</strong><span>templates</span><small>${totalSteps} checklist steps configured</small></div>
        <div class="sac-prep-flow" aria-label="How sacrament preparation works">
          <div><b>1</b><span><strong>Build the template</strong><small>Write the welcome, steps, and parish guidance.</small></span></div>
          <div><b>2</b><span><strong>A family requests the sacrament</strong><small>AGAPAY privately copies the current template to that request.</small></span></div>
          <div><b>3</b><span><strong>Track preparation together</strong><small>Families complete tasks; clergy review progress and documents.</small></span></div>
        </div>
      </section>
      <div class="sac-prep-template-heading"><div><span>Your templates</span><h3>Choose a sacrament to edit</h3></div><p>All sections begin collapsed to keep this workspace easy to scan.</p></div>
      <div class="sac-prep-template-grid">${templates.map(preparationTemplateEditor).join('')}</div>
    </div>`;
}

function addPreparationTemplateItem(type) {
  const list = document.querySelector(`[data-prep-template="${type}"] [data-prep-item-list]`);
  if (!list) return;
  list.insertAdjacentHTML('beforeend', preparationItemEditorRow({}, list.querySelectorAll('[data-prep-item]').length));
}

function removePreparationTemplateItem(button) {
  const row = button.closest('[data-prep-item]');
  const list = row?.parentElement;
  row?.remove();
  list?.querySelectorAll('.sac-prep-drag-order').forEach((node, index) => {
    node.textContent = String(index + 1);
  });
}

async function savePreparationTemplate(type, button) {
  const root = document.querySelector(`[data-prep-template="${type}"]`);
  if (!root) return;
  const items = [...root.querySelectorAll('[data-prep-item]')].map((row) => ({
    id: row.dataset.itemId || '',
    title: row.querySelector('[data-prep-title]')?.value || '',
    description: row.querySelector('[data-prep-description]')?.value || '',
    itemType: row.querySelector('[data-prep-type]')?.value || 'confirmation',
    required: Boolean(row.querySelector('[data-prep-required]')?.checked),
  }));
  const body = {
    title: root.querySelector('[data-prep-template-title]')?.value || '',
    introduction: root.querySelector('[data-prep-template-introduction]')?.value || '',
    canonicalNote: root.querySelector('[data-prep-template-canonical]')?.value || '',
    items,
  };
  try {
    if (button) button.disabled = true;
    const res = await fetch(sacramentsApi('/preparation/templates/' + encodeURIComponent(type)), {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Unable to save the template.');
    const index = sacramentsState.preparationTemplates.findIndex((item) => item.sacramentType === type);
    if (index >= 0) sacramentsState.preparationTemplates[index] = data.template;
    setStatus(`${sacramentTypeLabel({ sacramentType: type })} preparation template saved.`, 'success');
    renderSacramentsPanel();
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

async function uploadPreparationGuide(event, type) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  try {
    if (button) button.disabled = true;
    const res = await fetch(sacramentsApi('/preparation/templates/' + encodeURIComponent(type) + '/documents'), {
      method: 'POST',
      headers: authHeaders(),
      body: new FormData(form),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Unable to upload the guide.');
    sacramentsState.preparationTemplates = data.templates || sacramentsState.preparationTemplates;
    setStatus('Preparation guide uploaded.', 'success');
    renderSacramentsPanel();
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

async function deletePreparationGuide(documentId) {
  if (!confirm('Remove this preparation guide?')) return;
  try {
    const res = await fetch(sacramentsApi('/preparation/documents/' + encodeURIComponent(documentId)), {
      method: 'DELETE',
      headers: authHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Unable to remove the guide.');
    await loadSacramentsPanel(true);
    setStatus('Preparation guide removed.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}
