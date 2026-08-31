'use strict';

/* global escapeHtml, escapeAttr, restrictionLabel, allGifts, editableFunds, isGeneralDashboardFund,
  isCandleDashboardFund, hasGivingPlusAccess, editableCampaigns, editableFeastCampaigns, moneyFull,
  setStatus, slugifyLocal, renderFeastCampaignSetup */
/* exported fillGivingPreset, addGivingOption, editGivingOption, updateGivingOption, removeGivingOption */

// Giving options; read shared identity and catalog state only when actions run.
let editingGivingOption = null;

// ── PRESETS ──────────────────────────────────────────────
const fundPresets = {
  general: {
    id: 'general',
    name: 'General Operating Fund',
    description: 'Utilities, supplies, ministries, and day-to-day parish needs.',
  },
  building: {
    id: 'building',
    name: 'New Building Fund',
    description: 'Support for property purchase, construction, renovation, or long-term building needs.',
  },
  clergy: {
    id: 'clergy',
    name: 'Clergy Support Fund',
    description: 'Direct support for the priest, clergy family, and clergy-related parish needs.',
  },
  benevolence: {
    id: 'benevolence-fund',
    name: 'Benevolence Fund',
    description: 'Restricted assistance for the poor, needy families, and neighbors facing hardship.',
    restrictionType: 'donor_restricted_temporary',
  },
  education: {
    id: 'education',
    name: 'Education & Youth Fund',
    description: 'Catechism, youth programs, parish school materials, retreats, and formation.',
  },
  icons: {
    id: 'icons',
    name: 'Icons & Beautification Fund',
    description: 'Icons, liturgical furnishings, vestments, candles, and beautification of the church.',
  },
  missions: {
    id: 'missions',
    name: 'Mission & Outreach Fund',
    description: 'Evangelism, local outreach, charitable work, and mission-related parish efforts.',
  },
};

const campaignPresets = {
  disaster: {
    id: 'disaster-relief',
    name: 'Disaster Relief',
    description: 'Emergency alms for parish families or neighbors affected by fire, flood, storm, or other disaster.',
  },
  medical: {
    id: 'medical-support',
    name: 'Medical or Sickness Support',
    description: 'Alms for someone facing medical bills, recovery costs, or serious illness.',
  },
  priestCar: {
    id: 'priest-car-fund',
    name: "Priest's Car Fund",
    description: 'Support toward a reliable vehicle or vehicle repairs for clergy transportation needs.',
  },
  funeral: {
    id: 'funeral-support',
    name: 'Funeral & Burial Support',
    description: 'Alms to help a family with funeral, burial, or memorial-related expenses.',
  },
  family: {
    id: 'family-hardship',
    name: 'Family Hardship Support',
    description: 'Temporary alms for rent, utilities, food, travel, or urgent family needs.',
  },
  monastery: {
    id: 'monastery-support',
    name: 'Monastery Support',
    description: 'Alms for monastery needs, hospitality, supplies, repairs, or monastic support.',
  },
  sisterhood: {
    id: 'sisterhood-support',
    name: 'Sisterhood Support',
    description: 'Alms to strengthen the parish sisterhood in its charitable work, hospitality, and service.',
  },
  brotherhood: {
    id: 'brotherhood-support',
    name: 'Brotherhood Support',
    description: 'Alms to support the parish brotherhood in fellowship, service, and practical parish needs.',
  },
};

// ── GIVING OPTIONS HELPERS ────────────────────────────────
function optionCards(items, kind, emptyText) {
  if (!items || !items.length) return `<div class="option-empty">${emptyText}</div>`;
  return items
    .map((item, i) => {
      const isEditing = editingGivingOption?.kind === kind && editingGivingOption?.index === i;
      const restrictionType =
        item.restrictionType || (kind === 'campaign' ? 'donor_restricted_temporary' : 'unrestricted');
      return `
      <div class="option-item">
        <div class="option-item-head">
          <div class="option-name">${escapeHtml(item.name || item.id || 'Untitled')}</div>
          <div class="option-item-actions">
            <button class="btn btn-ghost btn-sm" type="button" onclick="editGivingOption('${kind}',${i})">${isEditing ? 'Close' : 'Edit'}</button>
            <button class="icon-button" type="button" aria-label="Remove ${escapeAttr(item.name || kind)}" onclick="removeGivingOption('${kind}',${i})">x</button>
          </div>
        </div>
        <div class="option-desc">${escapeHtml(item.description || '')}</div>
        <small>${escapeHtml(item.accountNumber || 'Number assigned when saved')} · ${escapeHtml(restrictionLabel(restrictionType))}</small>
        ${
          isEditing
            ? `
          <form class="option-edit-form" onsubmit="updateGivingOption(event,'${kind}',${i})">
            <label>Name<input name="name" maxlength="120" required value="${escapeAttr(item.name || '')}" /></label>
            <label>Account number<input name="accountNumber" maxlength="24" value="${escapeAttr(item.accountNumber || '')}" placeholder="e.g. BENEVOLENCE" /></label>
            <label>Restriction
              <select name="restrictionType">
                <option value="unrestricted" ${restrictionType === 'unrestricted' ? 'selected' : ''}>Unrestricted</option>
                <option value="board_designated" ${restrictionType === 'board_designated' ? 'selected' : ''}>Board designated</option>
                <option value="donor_restricted_temporary" ${restrictionType === 'donor_restricted_temporary' ? 'selected' : ''}>Donor restricted · temporary</option>
                <option value="donor_restricted_permanent" ${restrictionType === 'donor_restricted_permanent' ? 'selected' : ''}>Donor restricted · permanent</option>
              </select>
            </label>
            <label class="full">Description<textarea name="description" maxlength="500">${escapeHtml(item.description || '')}</textarea></label>
            <div class="option-edit-actions">
              <button class="btn btn-primary btn-sm" type="submit">Apply changes</button>
              <button class="btn btn-ghost btn-sm" type="button" onclick="editGivingOption('${kind}',${i})">Cancel</button>
              <small>The fund ID stays unchanged so prior gifts remain linked correctly.</small>
            </div>
          </form>`
            : ''
        }
      </div>`;
    })
    .join('');
}

function presetOptions(presets) {
  return Object.entries(presets)
    .map(([k, v]) => `<option value="${k}">${escapeHtml(v.name)}</option>`)
    .join('');
}

function fillGivingPreset(kind) {
  const presets = kind === 'fund' ? fundPresets : campaignPresets;
  const prefix = kind === 'fund' ? 'fund' : 'campaign';
  const preset = presets[document.getElementById(`${prefix}Preset`)?.value];
  if (!preset) return;
  document.getElementById(`${prefix}Name`).value = preset.name;
  document.getElementById(`${prefix}Description`).value = preset.description;
  const restriction = document.getElementById(`${prefix}Restriction`);
  if (restriction && preset.restrictionType) restriction.value = preset.restrictionType;
}

function parseDollarsToCents(value) {
  const amount = Number(String(value || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : 0;
}

function optionKeys(item = {}) {
  return [item.id, item.feastId, item.name, item.campaignName, item.title]
    .filter(Boolean)
    .map((v) => String(v).trim().toLowerCase());
}

function giftMatchesOption(gift, item, kind) {
  const keys = new Set(optionKeys(item));
  const giftKeys =
    kind === 'fund'
      ? optionKeys({ id: gift.fundId, name: gift.fund })
      : optionKeys({ id: gift.campaignId, name: gift.campaign, campaignName: gift.description });
  return giftKeys.some((key) => keys.has(key));
}

function optionProgress(item, kind) {
  const gifts = allGifts.filter((gift) => giftMatchesOption(gift, item, kind));
  const raisedCents = gifts.reduce((sum, gift) => sum + Number(gift.amountCents || 0), 0);
  const goalCents = kind === 'campaign' ? Number(item.goalCents || item.targetCents || item.goalAmountCents || 0) : 0;
  return { raisedCents, goalCents, giftCount: gifts.length };
}

function progressMarkup(raisedCents, goalCents) {
  if (!goalCents) return '<span class="progress-muted">No goal set</span>';
  const pct = Math.min(100, Math.round((raisedCents / goalCents) * 100));
  return `<div class="option-progress"><span style="width:${pct}%"></span></div><small>${pct}%</small>`;
}

function renderOptionsProgressSummary() {
  const summaryFunds = editableFunds.map((item, index) => ({ item, index }));
  if (!summaryFunds.some((row) => isCandleDashboardFund(row.item))) {
    summaryFunds.push({
      item: {
        id: 'candle',
        name: 'Candles / Vigil Lights',
        description: 'Built-in candle offerings and prayer intentions.',
        restrictionType: 'unrestricted',
        starterBuiltin: true,
      },
      index: null,
    });
  }
  const rows = [
    ...summaryFunds
      .map(({ item, index }) => ({
        kind: 'fund',
        label: isGeneralDashboardFund(item)
          ? 'General fund'
          : isCandleDashboardFund(item)
            ? 'Candle fund'
            : 'Designated fund',
        item,
        index,
      }))
      .filter((row) => row.item?.enabled !== false && row.item?.active !== false),
    ...(hasGivingPlusAccess() ? editableCampaigns.map((item) => ({ kind: 'campaign', label: 'Campaign', item })) : []),
    ...(hasGivingPlusAccess()
      ? editableFeastCampaigns
          .filter((item) => item.enabled !== false)
          .map((item) => ({ kind: 'campaign', label: 'Feast campaign', item }))
      : []),
  ];
  return `<div class="options-summary-card"><div class="options-summary-head"><span>Active giving options</span><small>Based on paid gifts in AGAPAY</small></div><div class="options-progress-table">${
    rows.length
      ? rows
          .map((row) => {
            const progress = optionProgress(row.item, row.kind);
            const isEditableFund =
              row.kind === 'fund' && Number.isInteger(row.index) && !isCandleDashboardFund(row.item);
            const isEditing =
              isEditableFund && editingGivingOption?.kind === 'fund' && editingGivingOption?.index === row.index;
            const restrictionType =
              row.item.restrictionType || (row.kind === 'campaign' ? 'donor_restricted_temporary' : 'unrestricted');
            return `<div class="options-progress-row">
        <span>${escapeHtml(row.label)}</span>
          <div class="option-summary-identity">
            <div class="option-summary-title">
              <strong>${escapeHtml(row.item.name || row.item.campaignName || row.item.id || 'Giving option')}</strong>
            </div>
          ${row.item.description ? `<small class="option-summary-description">${escapeHtml(row.item.description)}</small>` : ''}
          <small>${escapeHtml(row.item.accountNumber || 'Number assigned when saved')} · ${escapeHtml(restrictionLabel(restrictionType))}</small>
        </div>
        <span>${moneyFull(progress.raisedCents)} raised</span>
        <span>${row.kind === 'campaign' && progress.goalCents ? `Goal ${moneyFull(progress.goalCents)}` : ''}</span>
        <div>${progressMarkup(progress.raisedCents, progress.goalCents)}</div>
        <div class="options-summary-action">${isEditableFund ? `<button class="btn btn-ghost btn-sm" type="button" onclick="editGivingOption('fund',${row.index})">${isEditing ? 'Close' : 'Edit'}</button>` : ''}</div>
        ${
          isEditing
            ? `
          <form class="option-edit-form options-summary-edit" onsubmit="updateGivingOption(event,'fund',${row.index})">
            <label>Name<input name="name" maxlength="120" required value="${escapeAttr(row.item.name || '')}" /></label>
            <label>Account number<input name="accountNumber" maxlength="24" value="${escapeAttr(row.item.accountNumber || '')}" placeholder="e.g. BENEVOLENCE" /></label>
            <label>Restriction
              <select name="restrictionType">
                <option value="unrestricted" ${restrictionType === 'unrestricted' ? 'selected' : ''}>Unrestricted</option>
                <option value="board_designated" ${restrictionType === 'board_designated' ? 'selected' : ''}>Board designated</option>
                <option value="donor_restricted_temporary" ${restrictionType === 'donor_restricted_temporary' ? 'selected' : ''}>Donor restricted · temporary</option>
                <option value="donor_restricted_permanent" ${restrictionType === 'donor_restricted_permanent' ? 'selected' : ''}>Donor restricted · permanent</option>
              </select>
            </label>
            <label class="full">Description<textarea name="description" maxlength="500">${escapeHtml(row.item.description || '')}</textarea></label>
            <div class="option-edit-actions">
              <button class="btn btn-primary btn-sm" type="submit">Apply changes</button>
              <button class="btn btn-ghost btn-sm" type="button" onclick="editGivingOption('fund',${row.index})">Cancel</button>
              <small>The fund ID stays unchanged so prior gifts remain linked correctly.</small>
            </div>
          </form>`
            : ''
        }
      </div>`;
          })
          .join('')
      : '<div class="option-empty options-summary-empty">No giving options configured yet.</div>'
  }</div>
      <div class="option-builder options-summary-builder">
        <div class="option-builder-title">Add a designated fund</div>
        <p class="section-note">Every plan includes unlimited designated funds. When Accounting is active, saved funds also synchronize with your books.</p>
        <div class="builder-grid"><select id="fundPreset" onchange="fillGivingPreset('fund')"><option value="custom" selected>Custom fund — name it yourself</option><optgroup label="Start from a preset">${presetOptions(fundPresets)}</optgroup></select><input id="fundAccountNumber" maxlength="24" placeholder="Fund account number (optional), e.g. 2100" /><input id="fundName" maxlength="120" placeholder="Custom fund name, e.g. Mission Development Fund" /><select id="fundRestriction"><option value="unrestricted">Unrestricted</option><option value="board_designated">Board designated</option><option value="donor_restricted_temporary">Donor restricted · temporary</option><option value="donor_restricted_permanent">Donor restricted · permanent</option></select><textarea id="fundDescription" maxlength="500" placeholder="Describe what this parish-created fund supports."></textarea><button class="btn btn-gold" onclick="addGivingOption('fund')">Add designated fund</button></div>
      </div>
    </div>`;
}

function addGivingOption(kind) {
  if (kind === 'campaign' && !hasGivingPlusAccess()) {
    setStatus('Campaigns require Give +.', 'error');
    return;
  }
  const prefix = kind === 'fund' ? 'fund' : 'campaign';
  const nameEl = document.getElementById(`${prefix}Name`);
  const descEl = document.getElementById(`${prefix}Description`);
  const name = nameEl?.value.trim();
  if (!name) {
    setStatus(`Enter a ${kind} name.`, 'error');
    return;
  }
  const id = slugifyLocal(name);
  const target = kind === 'fund' ? editableFunds : editableCampaigns;
  if (
    target.some(
      (item) =>
        item.id === id ||
        String(item.name || '')
          .trim()
          .toLowerCase() === name.toLowerCase()
    )
  ) {
    setStatus(`A ${kind} with that name already exists.`, 'error');
    return;
  }
  const item = {
    id,
    name,
    description:
      descEl?.value.trim() ||
      (kind === 'fund' ? 'Designated support for this parish.' : 'Parish-approved alms for this need.'),
    accountNumber: document.getElementById(`${prefix}AccountNumber`)?.value.trim() || '',
    restrictionType:
      document.getElementById(`${prefix}Restriction`)?.value ||
      (kind === 'campaign' ? 'donor_restricted_temporary' : 'unrestricted'),
    ...(kind === 'fund'
      ? { fundType: document.getElementById('fundPreset')?.value === 'custom' ? 'custom' : 'preset' }
      : {}),
  };
  if (kind === 'campaign') {
    const goalCents = parseDollarsToCents(document.getElementById('campaignGoal')?.value);
    if (goalCents > 0) item.goalCents = goalCents;
  }
  target.push(item);
  nameEl.value = '';
  descEl.value = '';
  const goalEl = document.getElementById(`${prefix}Goal`);
  if (goalEl) goalEl.value = '';
  renderGivingOptionsEditor();
  setStatus(`${kind === 'fund' ? 'Fund' : 'Campaign'} added. Save when ready.`, 'success');
}

function editGivingOption(kind, i) {
  editingGivingOption =
    editingGivingOption?.kind === kind && editingGivingOption?.index === i ? null : { kind, index: i };
  renderGivingOptionsEditor();
}

function updateGivingOption(event, kind, i) {
  event.preventDefault();
  const target = kind === 'fund' ? editableFunds : editableCampaigns;
  const current = target[i];
  if (!current) return;
  const form = event.currentTarget;
  const name = String(form.elements.name?.value || '').trim();
  if (!name) {
    setStatus(`Enter a ${kind} name.`, 'error');
    return;
  }
  if (
    target.some(
      (item, index) =>
        index !== i &&
        String(item.name || '')
          .trim()
          .toLowerCase() === name.toLowerCase()
    )
  ) {
    setStatus(`Another ${kind} already uses that name.`, 'error');
    return;
  }
  const validRestrictions = new Set([
    'unrestricted',
    'board_designated',
    'donor_restricted_temporary',
    'donor_restricted_permanent',
  ]);
  const requestedRestriction = String(form.elements.restrictionType?.value || '');
  const accountNumber = String(form.elements.accountNumber?.value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 24);
  target[i] = {
    ...current,
    name,
    description: String(form.elements.description?.value || '').trim(),
    accountNumber: accountNumber || current.accountNumber || '',
    restrictionType: validRestrictions.has(requestedRestriction)
      ? requestedRestriction
      : current.restrictionType || 'unrestricted',
  };
  editingGivingOption = null;
  renderGivingOptionsEditor();
  setStatus(`${kind === 'fund' ? 'Fund' : 'Campaign'} updated. Save giving options to publish the change.`, 'success');
}

function removeGivingOption(kind, i) {
  if (kind === 'fund') editableFunds.splice(i, 1);
  else editableCampaigns.splice(i, 1);
  editingGivingOption = null;
  renderGivingOptionsEditor();
  setStatus('Option removed. Save when ready.', 'success');
}

// ── GIVING OPTIONS EDITOR ─────────────────────────────────
function renderGivingOptionsEditor() {
  const pane = document.getElementById('editorPane');
  if (!pane) return;
  pane.innerHTML = `
      ${renderOptionsProgressSummary()}
      <div class="giving-options-intro">${hasGivingPlusAccess() ? 'These are the choices donors see after selecting <strong>Designated Fund</strong> or <strong>Alms Campaign</strong>. Add presets or write your own.' : 'Give includes <strong>General Operating</strong>, <strong>unlimited designated funds</strong>, and <strong>Candles</strong>.'}</div>
      ${hasGivingPlusAccess() ? `<div class="option-group"><div class="option-group-head"><h3 class="option-group-title">Alms campaigns</h3><span class="option-group-count">${editableCampaigns.length} shown</span></div><div class="option-list">${optionCards(editableCampaigns, 'campaign', 'No alms campaigns configured yet.')}</div><div class="option-builder"><div class="option-builder-title">Add an alms campaign</div><div class="builder-grid"><select id="campaignPreset" onchange="fillGivingPreset('campaign')"><option value="">Choose a preset...</option>${presetOptions(campaignPresets)}</select><input id="campaignAccountNumber" maxlength="24" placeholder="Account number, e.g. 2200" /><input id="campaignName" placeholder="Campaign name, e.g. Support for the Petrov Family" /><select id="campaignRestriction"><option value="donor_restricted_temporary">Donor restricted · temporary</option><option value="donor_restricted_permanent">Donor restricted · permanent</option><option value="board_designated">Board designated</option><option value="unrestricted">Unrestricted</option></select><textarea id="campaignDescription" placeholder="Describe the need in plain language."></textarea><input id="campaignGoal" type="number" min="0" step="1" placeholder="Goal amount, e.g. 45000" /><button class="btn btn-ghost" onclick="addGivingOption('campaign')">Add campaign</button></div></div></div>${renderFeastCampaignSetup()}` : '<aside class="starter-tier-upgrade-card"><div><span class="starter-tier-paywall-badge">Give +</span><strong>Ready for campaigns and parish life?</strong><p>Give includes unlimited funds, candles, commemorations, giver records, and CSV export. Give + adds campaigns, festal alms, branding, statements, enhanced reporting, and connected parish life.</p></div><button class="btn btn-gold" type="button" onclick="switchTab(\'settings\')">Compare plans</button></aside>'}
      <div class="btn-row"><button class="btn btn-gold" onclick="saveDashboard(this)">Save giving options</button><button class="btn btn-ghost" onclick="loadDashboard()">Discard changes</button></div>`;
}
