'use strict';

interface ParishGivingOption {
  id?: string | null;
  code?: string | null;
  name?: string | null;
  description?: string;
  enabled?: boolean | null;
  active?: boolean;
  accountNumber?: string;
  restrictionType?: string;
  campaignName?: string | null;
  feastId?: string;
  title?: string;
  goalCents?: number;
  targetCents?: number;
  goalAmountCents?: number;
  starterBuiltin?: boolean;
  fundType?: string;
  patronal?: boolean;
  feastDate?: string;
  destinationFundId?: string;
}
interface ParishFeastIdentity {
  patronalFeast?: string;
  patronalFeastName?: string;
  patronalFeastDate?: string;
}
interface ParishFeastChoice {
  id: string;
  name: string;
  displayDate?: string;
  sourceDate?: string;
  date?: string;
  patronal?: boolean;
  feastDate?: string;
  calendar?: string;
}
declare let editableFunds: ParishGivingOption[];
declare let editableFeastCampaigns: ParishGivingOption[];
// Giving feasts; read shared identity and catalog state only when actions run.
const fallbackFeastPresets: ParishFeastChoice[] = [
  { id: 'pascha', name: 'Pascha', displayDate: 'Varies', sourceDate: 'Moveable feast from Orthodox Pascha' },
  { id: 'ascension', name: 'Ascension', displayDate: 'Varies', sourceDate: 'Moveable feast - 39 days after Pascha' },
  { id: 'pentecost', name: 'Pentecost', displayDate: 'Varies', sourceDate: 'Moveable feast - 49 days after Pascha' },
  { id: 'nativity-theotokos', name: 'Nativity of the Theotokos', displayDate: 'Sep 21', sourceDate: 'Julian Sep 8' },
  { id: 'exaltation-cross', name: 'Exaltation of the Cross', displayDate: 'Sep 27', sourceDate: 'Julian Sep 14' },
  { id: 'entrance-theotokos', name: 'Entrance of the Theotokos', displayDate: 'Dec 4', sourceDate: 'Julian Nov 21' },
  { id: 'nativity-christ', name: 'Nativity of Christ', displayDate: 'Jan 7', sourceDate: 'Julian Dec 25' },
  { id: 'theophany', name: 'Theophany', displayDate: 'Jan 19', sourceDate: 'Julian Jan 6' },
  { id: 'meeting-lord', name: 'Meeting of the Lord', displayDate: 'Feb 15', sourceDate: 'Julian Feb 2' },
  { id: 'annunciation', name: 'Annunciation', displayDate: 'Apr 7', sourceDate: 'Julian Mar 25' },
  { id: 'transfiguration', name: 'Transfiguration', displayDate: 'Aug 19', sourceDate: 'Julian Aug 6' },
  { id: 'dormition', name: 'Dormition of the Theotokos', displayDate: 'Aug 28', sourceDate: 'Julian Aug 15' },
];

// ── FEAST CAMPAIGN HELPERS ────────────────────────────────
function calendarLabel(v: string) {
  return window.AGAPAYLiturgicalCalendar?.calendarLabel(v) || (v === 'gregorian' ? 'Revised-Julian' : 'Julian');
}

function feastPresetsForCalendar(cal: string): ParishFeastChoice[] {
  const api = window.AGAPAYLiturgicalCalendar;
  if (!api) return fallbackFeastPresets;
  return api
    .liturgicalFeastsForYear(new Date().getFullYear(), cal)
    .filter((feast) => ['great', 'major'].includes(feast.rank))
    .map((feast) => ({ id: feast.id, name: feast.name, displayDate: feast.displayDate, sourceDate: feast.sourceDate }));
}

function feastDateLabel(feast: ParishFeastChoice) {
  return feast.displayDate || feast.date || '';
}

function patronalFeastCampaignChoice(cal: string): ParishFeastChoice | null {
  const saved = editableFeastCampaigns.find((campaign) => campaign?.patronal);
  const id = currentParish?.patronalFeast || saved?.id || '';
  const name = currentParish?.patronalFeastName || saved?.name || '';
  const feastDate = currentParish?.patronalFeastDate || saved?.feastDate || '';
  if (!id || !name) return null;
  const monthDay = patronalMonthDay(feastDate);
  const displayDate =
    monthDay.month && monthDay.day
      ? new Date(2024, monthDay.month - 1, monthDay.day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : 'Date set in parish settings';
  return { id, name, displayDate, feastDate: feastDate.slice(-5), patronal: true, calendar: cal };
}

function feastCampaignChoices(cal: string) {
  const feasts = feastPresetsForCalendar(cal);
  const patronal = patronalFeastCampaignChoice(cal);
  if (!patronal) return feasts;
  const existingIndex = feasts.findIndex((feast) => feast.id === patronal.id);
  if (existingIndex >= 0) {
    feasts[existingIndex] = { ...feasts[existingIndex], patronal: true, feastDate: patronal.feastDate };
    return feasts;
  }
  return [...feasts, patronal];
}

function toggleFeastCampaign(id: string, checked: boolean) {
  const cal =
    (document.getElementById('feastLiturgicalCalendar') as HTMLSelectElement | null)?.value ||
    currentParish?.liturgicalCalendar ||
    'julian';
  const feast = feastCampaignChoices(cal).find((f) => f.id === id);
  if (!feast) return;
  editableFeastCampaigns = editableFeastCampaigns.filter((f) => f.id !== id);
  if (checked)
    editableFeastCampaigns.push({
      id: feast.id,
      name: feast.name,
      enabled: true,
      campaignName: `${feast.name} Alms Campaign`,
      description: `Parish-approved alms connected to ${feast.name}.`,
      destinationFundId: 'benevolence-fund',
      ...(feast.patronal ? { patronal: true, feastDate: feast.feastDate } : {}),
    });
  renderGivingOptionsEditor();
  setStatus(
    checked ? `${feast.name} enabled. Save when ready.` : `${feast.name} disabled. Save when ready.`,
    'success'
  );
}

function feastDestinationFundOptions(selectedId?: string) {
  const selected = selectedId || 'benevolence-fund';
  return editableFunds
    .filter((fund) => fund && fund.enabled !== false)
    .map((fund) => {
      const id = String(fund.id || fund.code || fund.name || '');
      const name = String(fund.name || fund.id || 'Designated fund');
      return `<option value="${escapeHtml(id)}" ${id === selected ? 'selected' : ''}>${escapeHtml(name)}</option>`;
    })
    .join('');
}

function updateFeastCampaignFund(feastId: string, destinationFundId: string) {
  const campaign = editableFeastCampaigns.find((item) => item.id === feastId);
  if (!campaign) return;
  campaign.destinationFundId = destinationFundId || 'benevolence-fund';
  const fund = editableFunds.find((item) =>
    [item?.id, item?.code, item?.name]
      .filter(Boolean)
      .map(String)
      .includes(campaign.destinationFundId as string)
  );
  setStatus(
    `${campaign.name || 'Feast'} gifts will go to ${fund?.name || 'Benevolence Fund'}. Save when ready.`,
    'success'
  );
}

function allFeastPresets() {
  const cal =
    (document.getElementById('settingsLiturgicalCalendar') as HTMLSelectElement | null)?.value ||
    currentParish?.liturgicalCalendar ||
    'julian';
  return feastPresetsForCalendar(cal);
}

function patronalFeastDisplayName(parish: ParishFeastIdentity | null | undefined) {
  if (parish?.patronalFeastName) return parish.patronalFeastName;
  const selected = parish?.patronalFeast || '';
  return allFeastPresets().find((feast) => feast.id === selected)?.name || selected;
}

function patronalMonthDay(value: unknown) {
  const monthDay = String(value || '').slice(-5);
  return /^\d{2}-\d{2}$/.test(monthDay)
    ? { month: Number(monthDay.slice(0, 2)), day: Number(monthDay.slice(3, 5)) }
    : { month: 0, day: 0 };
}

function patronalMonthOptions(selected?: number) {
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const label = new Date(2024, index, 1).toLocaleString('en-US', { month: 'long' });
    return `<option value="${month}" ${month === selected ? 'selected' : ''}>${label}</option>`;
  }).join('');
}

function patronalDayOptions(month: number, selected?: number) {
  const count = month ? new Date(2024, month, 0).getDate() : 31;
  return Array.from({ length: count }, (_, index) => {
    const day = index + 1;
    return `<option value="${day}" ${day === selected ? 'selected' : ''}>${day}</option>`;
  }).join('');
}

function updatePatronalFeastDays(preferredDay?: number) {
  const month = Number((document.getElementById('patronalFeastMonth') as HTMLSelectElement | null)?.value || 0);
  const daySelect = document.getElementById('patronalFeastDay') as HTMLSelectElement | null;
  if (!daySelect) return;
  const selected = Math.min(Number(preferredDay || daySelect.value || 1), new Date(2024, month, 0).getDate());
  daySelect.innerHTML = patronalDayOptions(month, selected);
}

function syncPatronalFeastOptionsFromSettings() {
  const nameInput = document.getElementById('patronalFeastName') as HTMLInputElement | null;
  const monthInput = document.getElementById('patronalFeastMonth') as HTMLSelectElement | null;
  const dayInput = document.getElementById('patronalFeastDay') as HTMLSelectElement | null;
  if (!nameInput || !monthInput || !dayInput) return;
  const match = allFeastPresets().find((feast) => feast.name === nameInput.value);
  if (match) {
    const parts = patronalMonthDay(match.date);
    if (parts.month) monthInput.value = String(parts.month);
    updatePatronalFeastDays(parts.day);
  }
}

function upsertPatronalFeastCampaign(patronalFeastId: string, calendar: string, customName = '', customDate = '') {
  if (!patronalFeastId) return;
  const feast = feastPresetsForCalendar(calendar).find((item) => item.id === patronalFeastId) ||
    feastPresetsForCalendar(calendar === 'julian' ? 'gregorian' : 'julian').find(
      (item) => item.id === patronalFeastId
    ) ||
    fallbackFeastPresets.find((item) => item.id === patronalFeastId) || {
      id: patronalFeastId,
      name: customName || 'Patronal Feast',
      date: customDate,
    };
  const existing = editableFeastCampaigns.find((item) => item.id === patronalFeastId);
  if (existing) {
    existing.name = customName || feast.name;
    if (existing.enabled == null) existing.enabled = true;
    if (customDate) existing.feastDate = customDate.slice(-5);
    if (!existing.campaignName) existing.campaignName = `${feast.name} Patronal Feast Campaign`;
    if (!existing.description) existing.description = `Parish-approved alms connected to ${feast.name}.`;
    if (!existing.destinationFundId) existing.destinationFundId = 'benevolence-fund';
    existing.patronal = true;
    return;
  }
  editableFeastCampaigns.push({
    id: feast.id,
    name: customName || feast.name,
    enabled: true,
    patronal: true,
    ...(customDate ? { feastDate: customDate.slice(-5) } : {}),
    campaignName: `${feast.name} Patronal Feast Campaign`,
    description: `Parish-approved alms connected to ${feast.name}.`,
    destinationFundId: 'benevolence-fund',
  });
}

function renderFeastCampaignSetup() {
  const cal =
    (document.getElementById('feastLiturgicalCalendar') as HTMLSelectElement | null)?.value ||
    currentParish?.liturgicalCalendar ||
    'julian';
  const feasts = feastCampaignChoices(cal);
  return `<div class="option-group"><div class="option-group-head"><div><h3 class="option-group-title">Major feast alms campaigns</h3><p class="section-note" style="margin:.25rem 0 0;">Each feast defaults to Benevolence Fund. Choose General Operating or another designated fund when appropriate.</p></div><span class="option-group-count">${editableFeastCampaigns.filter((f) => f.enabled !== false).length} enabled</span></div><div class="option-builder"><div class="option-builder-title">Calendar timing</div><div class="builder-grid"><select id="feastLiturgicalCalendar" onchange="renderGivingOptionsEditor()"><option value="julian" ${cal === 'julian' ? 'selected' : ''}>Julian</option><option value="gregorian" ${cal === 'gregorian' ? 'selected' : ''}>Revised-Julian</option></select><p class="section-note" style="margin:0;">AGAPAY computes fixed feasts from this calendar and keeps Pascha-based feasts on the shared Orthodox paschalion. The parish feast day comes from Parish Settings.</p></div></div><div class="option-list"><div class="feast-grid">${feasts
    .map((feast) => {
      const campaign = editableFeastCampaigns.find((item) => item.id === feast.id);
      const enabled = campaign && campaign.enabled !== false;
      const destinationFundId = campaign?.destinationFundId || 'benevolence-fund';
      return `<div class="feast-card ${enabled ? 'enabled' : ''}"><div><div class="feast-name">${escapeHtml(feast.name)}${feast.patronal ? '<span class="feast-patronal-badge">Parish feast day</span>' : ''}</div><div class="feast-meta">${escapeHtml(calendarLabel(cal))} · ${escapeHtml(feastDateLabel(feast))}</div></div><label class="mini-toggle" aria-label="Toggle ${escapeHtml(feast.name)}"><input type="checkbox" ${enabled ? 'checked' : ''} onchange="toggleFeastCampaign('${escapeHtml(feast.id)}',this.checked)"/><span></span></label>${enabled ? `<label class="feast-fund-select"><span>Gift destination</span><select onchange="updateFeastCampaignFund('${escapeHtml(feast.id)}',this.value)">${feastDestinationFundOptions(destinationFundId)}</select></label>` : ''}</div>`;
    })
    .join('')}</div></div></div>`;
}
