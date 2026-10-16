function directoryHouseholdLastName(name: unknown) {
  const normalized = String(name || '')
    .trim()
    .replace(/^the\s+/i, '')
    .replace(/\s+(family|household)$/i, '');
  const parts = normalized.split(/\s+/).filter(Boolean);
  return parts.at(-1) || normalized || 'Household';
}

function directoryHouseholdSortKey(name: unknown) {
  return `${directoryHouseholdLastName(name).toLocaleLowerCase('en-US')}\u0000${String(name || '').toLocaleLowerCase('en-US')}`;
}

function directoryHouseholdInitials(name: unknown) {
  return `${directoryHouseholdLastName(name).charAt(0)}H`.toUpperCase();
}

function directoryEmptyState(title: string, subtitle: string) {
  return `<div class="pdx-dir-empty"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(subtitle)}</span></div>`;
}

function directoryPriorityBadgeClass(priority: string | undefined) {
  const value = String(priority || '').toLowerCase();
  if (value === 'urgent') return 'urgent';
  if (value === 'high') return 'high';
  return '';
}

function directoryPhotoPlaceholderElement(label: string) {
  const span = document.createElement('span');
  span.className = 'pdx-dir-thumb pdx-dir-thumb-placeholder';
  span.textContent = label || 'No photo';
  return span;
}

function directoryAccessStatusRow(label: string, value: unknown, description: string, tone: string = 'neutral') {
  return `<div class="pdx-dir-status-row is-${escapeAttr(tone)}"><div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(description)}</span></div><em>${escapeHtml(value)}</em></div>`;
}

function directoryHouseholdSummaryCard(label: string, value: unknown, description: string, tone: string = 'neutral') {
  return `<div class="pdx-dir-household-summary-card is-${escapeAttr(tone)}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(description)}</small></div>`;
}

function directoryReviewValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not set';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length ? value.map(directoryReviewValue).join(', ') : 'None';
  if (typeof value === 'object') {
    return (
      Object.entries(value)
        .filter(([, item]) => item !== undefined && item !== null && item !== '')
        .map(([key, item]) => {
          const label = key
            .replace(/([A-Z])/g, ' $1')
            .replace(/_/g, ' ')
            .replace(/^./, (c) => c.toUpperCase());
          return label + ': ' + directoryReviewValue(item);
        })
        .join('\n') || 'Not set'
    );
  }
  return String(value);
}

function directoryReviewObjectRows(obj: unknown) {
  if (!obj || typeof obj !== 'object' || !Object.keys(obj).length)
    return '<div class="pdx-dir-empty"><strong>No proposed fields</strong><span>This item may only need status approval.</span></div>';
  return (
    Object.entries(obj)
      .filter(([key]) => !['publicationPreferences', 'source'].includes(key))
      .map(([key, value]) => {
        const label = key
          .replace(/([A-Z])/g, ' $1')
          .replace(/_/g, ' ')
          .replace(/^./, (c) => c.toUpperCase());
        return `<div class="pdx-dir-review-field"><span>${escapeHtml(label)}</span><strong>${escapeHtml(directoryReviewValue(value))}</strong></div>`;
      })
      .join('') ||
    '<div class="pdx-dir-empty"><strong>No separate field changes</strong><span>Review the sharing choices for publication approval.</span></div>'
  );
}

function directoryReviewPrefs(preferences: Record<string, DirectoryUiPreference> | undefined) {
  if (!preferences || typeof preferences !== 'object') return '';
  const labels: Record<string, string> = {
    adultPreferredName: 'Name',
    adultEmail: 'Email',
    adultPhone: 'Phone',
    householdAddress: 'Address',
    personPhoto: 'Photo',
  };
  const anyPublished = Object.values(preferences).some(
    (pref) => pref?.visibility === 'directory_members' && pref?.publicationEligible
  );
  return `<div class="pdx-dir-review-prefs">
      <div class="pdx-dir-review-prefs-head">
        <strong>${anyPublished ? 'Approval will publish selected fields' : 'Parishioner sharing choices'}</strong>
        <span>${anyPublished ? 'Directory-visible after approval' : 'Nothing public unless the member requested it'}</span>
      </div>
      <div class="pdx-dir-pref-chip-list">
      ${Object.entries(preferences)
        .map(([key, pref]) => {
          const visibility = pref?.visibility || 'private';
          const eligible = pref?.publicationEligible;
          const chipClass =
            visibility === 'directory_members' && eligible ? 'publish' : visibility === 'private' ? 'private' : '';
          return `<span class="pdx-dir-pref-chip ${chipClass}"><b>${escapeHtml(labels[key] || key)}</b><small>${escapeHtml(visibility.replace(/_/g, ' '))}${eligible ? ' · requested' : ''}</small></span>`;
        })
        .join('')}
      </div>
      ${anyPublished ? '<em>Approving this item publishes only the fields marked for directory members.</em>' : ''}
    </div>`;
}

function directoryReviewMeta(item: DirectoryUiRow) {
  const parts = [
    item.reviewType ? statusLabel(item.reviewType) : '',
    item.requesterLabel ? 'Submitted by ' + item.requesterLabel : '',
    item.priority ? statusLabel(item.priority) + ' priority' : '',
  ].filter(Boolean);
  return parts.join(' · ');
}

function directoryHealthTile(label: string, value: unknown, copy: string, tone: string) {
  return `<div class="pdx-dir-health-tile is-${tone}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(copy)}</small></div>`;
}

function directoryReviewTypeLabel(type: string = '') {
  const labels: Record<string, string> = {
    publication_person: 'Member directory submission',
    publication_household: 'Household directory submission',
    membership_add_adult: 'Add adult to household',
    membership_remove: 'Remove household member',
    household_relationship_change: 'Household relationship change',
    child_publication_review: 'Child sharing request',
    publication_media: 'Photo sharing request',
    person_canonical_correction: 'Member record correction',
  };
  return labels[type] || String(type || 'Directory submission').replace(/_/g, ' ');
}

function directoryMetric(label: string, value: unknown, iconPath: string) {
  return `<div class="pdx-kpi-card">
      <div class="pdx-kpi-label">${escapeHtml(label)}</div>
      <div class="pdx-kpi-value">${escapeHtml(value ?? 0)}</div>
      <div class="pdx-kpi-icon"><svg viewBox="0 0 24 24">${iconPath || ''}</svg></div>
    </div>`;
}
