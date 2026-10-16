// Declaration-only composition preserves the original classic-script globals and startup order.

function sacramentTypeLabel(type: string, otherLabel: string | undefined) {
  if (type === 'other' && otherLabel) return otherLabel;
  return SACRAMENT_TYPE_LABELS[type] || type;
}

function sacramentLocationHint(sacramentType: string | undefined) {
  return sacramentType === 'house_blessing' || sacramentType === 'home_visit';
}

function sacramentIcon(name: string) {
  const icons: Record<string, string> = {
    cross: '<path d="M12 3v18"/><path d="M7 8h10"/><path d="M9 13h6"/>',
    home: '<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/><path d="M10 20v-6h4v6"/>',
    oil: '<path d="M12 3c2 3 4 5.7 4 9a4 4 0 0 1-8 0c0-3.3 2-6 4-9z"/><path d="M9 20h6"/>',
    chat: '<path d="M5 5h14v10H8l-3 3z"/><path d="M9 9h6"/><path d="M9 12h4"/>',
    water: '<path d="M12 3c3 4 5 7 5 10a5 5 0 0 1-10 0c0-3 2-6 5-10z"/>',
    rings: '<circle cx="9" cy="14" r="4"/><circle cx="15" cy="14" r="4"/><path d="M12 7l2-3 2 3"/>',
    prayer: '<path d="M12 2v20"/><path d="M5 7h14"/><path d="M7 12h10"/><path d="M9 22h6"/>',
    candle: '<path d="M12 3c0 0-4 3-4 8s4 5 4 5 4 0 4-5-4-8-4-8z"/><path d="M12 16v5"/><path d="M9 21h6"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.cross}</svg>`;
}

function sacramentSummary(row: SacRequest | null) {
  if (!row) return '';
  if (row.confirmedDate || row.confirmedTime)
    return [row.confirmedDate, row.confirmedTime].filter(Boolean).join(' at ');
  if (row.requestedDate || row.requestedTimeWindow)
    return [row.requestedDate, row.requestedTimeWindow].filter(Boolean).join(' · ');
  return row.createdAt ? `Submitted ${shortDate(row.createdAt)}` : 'Submitted';
}

function sacramentPreparationStatusLabel(status: string) {
  return (
    (
      {
        pending: 'To do',
        completed: 'Complete',
        submitted: 'Submitted',
        approved: 'Approved',
        needs_attention: 'Needs attention',
        waived: 'Waived',
      } as Record<string, string>
    )[status] || String(status || 'To do').replaceAll('_', ' ')
  );
}

function sacramentRequestRow(row: SacRequest) {
  const typeLabel = sacramentTypeLabel(row.sacramentType, row.otherTypeLabel);
  const statusLabel = SACRAMENT_STATUS_LABELS[row.status] || row.status;
  const tone = SACRAMENT_STATUS_TONE[row.status] || 'pending';
  const canCancel = ['requested', 'acknowledged', 'scheduled'].includes(row.status);

  const scheduledLine =
    row.status === 'scheduled' && (row.confirmedDate || row.confirmedTime)
      ? `<div class="sac-row-meta"><strong>Scheduled:</strong> ${escapeHtml([row.confirmedDate, row.confirmedTime].filter(Boolean).join(' at '))}${row.clergyAssigned ? ` · ${escapeHtml(row.clergyAssigned)}` : ''}</div>`
      : '';
  const declinedLine =
    row.status === 'declined' && row.declineReason
      ? `<div class="sac-row-meta">${escapeHtml(row.declineReason)}</div>`
      : '';
  const requestedLine =
    row.requestedDate || row.requestedTimeWindow
      ? `<div class="sac-row-meta">Preferred: ${escapeHtml([row.requestedDate, row.requestedTimeWindow].filter(Boolean).join(' · '))}</div>`
      : '';

  return `<div class="sac-row">
    <div class="sac-row-top">
      <span class="sac-row-type">${escapeHtml(typeLabel)}</span>
      <span class="status-pill ${tone}">${escapeHtml(statusLabel)}</span>
    </div>
    ${requestedLine}
    ${scheduledLine}
    ${declinedLine}
    ${canCancel ? `<button type="button" class="btn btn-ghost btn-sm" onclick="cancelSacramentRequest('${row.id}', this)">Cancel request</button>` : ''}
  </div>`;
}
