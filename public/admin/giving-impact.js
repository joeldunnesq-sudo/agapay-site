// Generated from src/browser/admin/giving-impact.ts by npm run build:browser. Do not edit.
function formatGivingImpactCurrency(cents) {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}
function renderGivingImpactCharts(impact, escapeHtml, escapeAttr) {
  const monthlyMax = Math.max(1, ...impact.monthly.map((month) => month.cents));
  const leaders = impact.parishes.filter((parish) => parish.cents > 0).slice(0, 5);
  const monthFormat = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });
  return `
    <div class="giving-impact-charts">
      <section class="giving-impact-chart" aria-labelledby="givingImpactTrend">
        <h4 id="givingImpactTrend">Monthly giving</h4>
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
        <h4 id="givingImpactLeaders">Giving by church</h4>
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
    </div>`;
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
