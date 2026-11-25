// Generated from src/browser/admin/giving-impact.ts by npm run build:browser. Do not edit.
function formatGivingImpactCurrency(cents) {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}
function givingImpactLeaders(impact) {
  return impact.parishes.filter((parish) => parish.cents > 0).slice(0, 5);
}
function givingImpactDownloadButton(chart, label, disabled = false) {
  return `<button class="secondary btn-sm" type="button" data-giving-download="${chart}" aria-label="Download ${label} as PNG"${disabled ? ' disabled' : ''}>Download PNG</button>`;
}
function renderGivingImpactCharts(impact, escapeHtml, escapeAttr) {
  const monthlyMax = Math.max(1, ...impact.monthly.map((month) => month.cents));
  const leaders = givingImpactLeaders(impact);
  const monthFormat = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });
  return `
    <div class="giving-impact-charts">
      <section class="giving-impact-chart" aria-labelledby="givingImpactTrend">
        <div class="giving-impact-chart-header">
          <h4 id="givingImpactTrend">Monthly giving</h4>
          ${givingImpactDownloadButton('monthly', 'monthly giving')}
        </div>
        <p>Last 12 calendar months · USD · UTC</p>
        <div class="giving-impact-months">
          ${impact.monthly
            .map(({ month, cents, giftCount }) => {
              const label = monthFormat.format(/* @__PURE__ */ new Date(month + '-01T00:00:00Z'));
              const details = `${label} ${month.slice(0, 4)} · ${formatGivingImpactCurrency(cents)} · ${Number(giftCount).toLocaleString()} gifts`;
              return `
              <div class="giving-impact-month" tabindex="0" role="img" aria-label="${escapeAttr(details)}">
                <span class="giving-impact-month-value" aria-hidden="true">${escapeHtml(details)}</span>
                <div class="giving-impact-column" aria-hidden="true">
                  <span style="--giving-height:${(100 * cents) / monthlyMax}%"></span>
                </div>
                <span aria-hidden="true">${label}</span>
              </div>`;
            })
            .join('')}
        </div>
      </section>
      <section class="giving-impact-chart" aria-labelledby="givingImpactLeaders">
        <div class="giving-impact-chart-header">
          <h4 id="givingImpactLeaders">Giving by church</h4>
          ${givingImpactDownloadButton('churches', 'giving by church', !leaders.length)}
        </div>
        <p>Top five churches by all-time giving</p>
        <ol class="giving-impact-ranks">
          ${leaders
            .map(
              (parish) => `
            <li>
              <div><span>${escapeHtml(parish.name)}</span><strong>${formatGivingImpactCurrency(parish.cents)}</strong></div>
              <div class="giving-impact-track" aria-hidden="true">
                <span style="--giving-width:${(100 * parish.cents) / leaders[0].cents}%"></span>
              </div>
            </li>`
            )
            .join('')}
        </ol>
        ${leaders.length ? '' : '<p>No gifts to rank yet.</p>'}
      </section>
    </div>
    <div class="growth-note" data-giving-download-status role="status"></div>`;
}
function drawGivingImpactPng(context, impact, chart, asOf) {
  const text = (value, x, y, font, color = '#10283e', maxWidth = 1456) => {
    context.font = font;
    context.fillStyle = color;
    context.fillText(value, x, y, maxWidth);
  };
  const monthFormat = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  const formatMonth = (month) => monthFormat.format(/* @__PURE__ */ new Date(month + '-01T00:00:00Z'));
  const monthly = chart === 'monthly';
  const period = monthly
    ? `${formatMonth(impact.monthly[0].month)} – ${formatMonth(impact.monthly[impact.monthly.length - 1].month)} (UTC)`
    : 'Top five churches by all-time giving';
  context.fillStyle = '#fffdf8';
  context.fillRect(0, 0, 1600, 1e3);
  context.fillStyle = '#10283e';
  context.fillRect(0, 0, 1600, 240);
  context.fillStyle = '#c69a50';
  context.fillRect(72, 42, 54, 5);
  text('AGAPAY GIVING IMPACT', 72, 82, 'bold 23px sans-serif', '#e5ba71');
  text(monthly ? 'Monthly giving' : 'Giving by church', 72, 155, 'bold 64px Georgia', '#fffdf8');
  text(`${period} · USD`, 72, 202, '27px sans-serif', '#e7e0d4');
  if (monthly) {
    const peak = Math.max(1, ...impact.monthly.map((month) => month.cents));
    const baseline = 790;
    context.strokeStyle = '#e5ddcd';
    context.lineWidth = 2;
    for (let row = 0; row <= 4; row++) {
      const y = baseline - row * 110;
      context.beginPath();
      context.moveTo(72, y);
      context.lineTo(1528, y);
      context.stroke();
    }
    context.textAlign = 'center';
    const columnWidth = 1456 / impact.monthly.length;
    impact.monthly.forEach(({ month, cents }, index) => {
      const x = 72 + (index + 0.5) * columnWidth;
      const height = (440 * cents) / peak;
      context.fillStyle = '#275c76';
      context.fillRect(x - 32, baseline - height, 64, height);
      text(
        formatGivingImpactCurrency(cents),
        x,
        baseline - height - 16,
        'bold 22px sans-serif',
        '#10283e',
        columnWidth - 8
      );
      text(formatMonth(month), x, baseline + 42, '21px sans-serif', '#10283e', columnWidth - 8);
    });
    context.textAlign = 'left';
  } else {
    const leaders = givingImpactLeaders(impact);
    leaders.forEach(({ name, cents }, index) => {
      const y = 339 + index * 115;
      text(name, 72, y, 'bold 34px Georgia', '#10283e', 1030);
      context.textAlign = 'right';
      text(formatGivingImpactCurrency(cents), 1528, y, 'bold 29px sans-serif', '#10283e', 350);
      context.textAlign = 'left';
      context.fillStyle = '#e9e1d3';
      context.fillRect(72, y + 19, 1456, 17);
      context.fillStyle = '#ad7b35';
      context.fillRect(72, y + 19, (1456 * cents) / leaders[0].cents, 17);
    });
  }
  text(
    'Source: Gifts recorded through AGAPAY, after refunds and before processing fees.',
    72,
    927,
    '22px sans-serif',
    '#5a5751'
  );
  text(`Figures as of ${asOf} UTC`, 72, 962, '21px sans-serif', '#5a5751');
}
function bindGivingImpactDownloads(pane, impact, generatedAt) {
  if (!impact) return;
  const status = pane.querySelector('[data-giving-download-status]');
  const date = (generatedAt || /* @__PURE__ */ new Date().toISOString()).slice(0, 10);
  for (const button of pane.querySelectorAll('[data-giving-download]')) {
    button.addEventListener('click', async () => {
      const chart = button.dataset.givingDownload === 'monthly' ? 'monthly' : 'churches';
      button.disabled = true;
      if (status) status.textContent = '';
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 1600;
        canvas.height = 1e3;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas unavailable');
        drawGivingImpactPng(context, impact, chart, date);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error('PNG creation failed');
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `agapay-giving-${chart}-${date}.png`;
        document.body.append(link);
        try {
          link.click();
        } finally {
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1e3);
        }
        if (status) status.textContent = 'PNG download started.';
      } catch {
        if (status) status.textContent = 'Could not create the PNG. Please try again.';
      } finally {
        button.disabled = false;
      }
    });
  }
}
function renderGivingImpact(impact, escapeHtml, escapeAttr) {
  if (!impact) {
    return '<div class="growth-note">AGAPAY giving totals are unavailable.</div>';
  }
  return `
    <div class="giving-summary-grid">
      <div class="giving-summary-stat"><strong>${formatGivingImpactCurrency(impact.cents)}</strong><span>Total given (USD)</span></div>
      <div class="giving-summary-stat"><strong>${Number(impact.giftCount).toLocaleString()}</strong><span>Gifts</span></div>
      <div class="giving-summary-stat"><strong>${Number(impact.giverCount).toLocaleString()}</strong><span>Unique givers platform-wide</span></div>
    </div>
    <p class="growth-note">All-time USD gifts recorded through AGAPAY, after refunds and before processing fees. Unique givers are estimated using distinct email addresses across churches, including guest donors with an email.</p>
    ${renderGivingImpactCharts(impact, escapeHtml, escapeAttr)}
    <details class="giving-impact-details">
    <summary>See all churches (${impact.parishes.length.toLocaleString()})</summary>
    <div class="tex-table-wrap" tabindex="0" role="region" aria-label="Giving by church">
      <table class="tex-table">
        <thead><tr><th scope="col">Church</th><th scope="col">Total given (USD)</th><th scope="col">Gifts</th><th scope="col">Unique givers</th></tr></thead>
        <tbody>${
          impact.parishes
            .map(
              (parish) => `
          <tr>
            <th scope="row">${escapeHtml(parish.name)}</th>
            <td>${formatGivingImpactCurrency(parish.cents)}</td>
            <td>${Number(parish.giftCount).toLocaleString()}</td>
            <td>${Number(parish.giverCount).toLocaleString()}</td>
          </tr>
        `
            )
            .join('') || '<tr><td colspan="4">No churches to report.</td></tr>'
        }</tbody>
      </table>
    </div>
    </details>`;
}
