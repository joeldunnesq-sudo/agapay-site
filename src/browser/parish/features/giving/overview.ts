'use strict';

// These contracts describe the existing JSON boundary, without runtime validation.
interface ParishGivingSummaryView {
  readonly dataSource?: unknown;
  readonly year?: unknown;
  readonly lastGiftAt?: string | number | Date | null;
  readonly ytdCents?: unknown;
  readonly grossGiftCents?: unknown;
  readonly giverCount?: unknown;
  readonly averageGiftCents?: unknown;
  readonly giftCount?: unknown;
  readonly feeCoveragePercent?: unknown;
  readonly monthly?: readonly { readonly amountCents?: unknown }[] | null;
}
interface ParishGivingSummaryResponse {
  readonly detail?: string;
  readonly error?: string;
  readonly summary?: ParishGivingSummaryView | null;
}
declare function loadStripeVolume(): void;
declare function shortDate(value: string | number | Date | null | undefined): string;

// Giving overview; read shared identity and catalog state only when actions run.

// ── GIVING SUMMARY (YTD chart) ────────────────────────────
async function loadGivingSummary(btn?: HTMLButtonElement | null): Promise<void> {
  const pane = document.getElementById('givingSummaryPane');
  if (!currentParish || !pane) return;
  loadGivingOverviewInsights();
  const status = document.getElementById('givingSummaryStatus');
  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }
  pane.innerHTML = '<div class="insights-empty-dark">Loading giving summary...</div>';
  try {
    const res = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/giving-summary', {
      headers: authHeaders(),
    });
    const data = (await res.json().catch(() => ({}))) as ParishGivingSummaryResponse;
    if (!res.ok) throw new Error(data.detail || data.error || 'Unable to load giving summary');
    renderGivingSummary(data.summary);
    if (status) status.hidden = true;
    loadStripeVolume();
  } catch (err) {
    pane.innerHTML = `<div class="insights-empty-dark">${escapeHtml((err as Error).message)}</div>`;
    if (status) status.hidden = false;
  } finally {
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }
}

// ── PDX helpers: count-up + sparkline ────────────────────
function pdxAnimateCount(
  el: HTMLElement | null,
  target: unknown,
  opts: { readonly money?: boolean; readonly duration?: number } = {}
): void {
  if (!el) return;
  const t = Number(target) || 0;
  const isMoney = !!opts.money;
  const duration = opts.duration || 1200;
  const start = performance.now();
  const from = 0;
  function tick(now: number) {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    const value = from + (t - from) * eased;
    el!.textContent = isMoney ? money(Math.round(value)) : Math.round(value).toLocaleString();
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function pdxDrawSparkline(svg: Element | null, data: readonly number[] | null | undefined): void {
  if (!svg) return;
  if (!Array.isArray(data) || data.length < 2) {
    svg.innerHTML =
      '<text x="50%" y="50%" text-anchor="middle" fill="rgba(246,241,232,0.4)" font-size="12" font-family="DM Sans, sans-serif">No monthly data yet</text>';
    return;
  }
  const w = 600,
    h = 130,
    pad = 8;
  const max = Math.max(...data),
    min = Math.min(...data);
  const range = max - min || 1;
  const step = (w - pad * 2) / (data.length - 1);
  const points = data.map((v, i): [number, number] => {
    const x = pad + i * step;
    const y = h - pad - ((v - min) / range) * (h - pad * 2 - 20);
    return [x, y];
  });
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const areaPath = linePath + ` L${points[points.length - 1]![0]},${h} L${points[0]![0]},${h} Z`;
  svg.innerHTML = `
      <defs>
        <linearGradient id="pdxSparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#E8C879" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="#E8C879" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${areaPath}" fill="url(#pdxSparkFill)" opacity="0"/>
      <path d="${linePath}" fill="none" stroke="#E8C879" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      ${points.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="${i === points.length - 1 ? 4 : 2.5}" fill="${i === points.length - 1 ? '#F6F1E8' : '#E8C879'}" opacity="0"/>`).join('')}
    `;
  const linePathEl = svg.querySelector<SVGPathElement>('path[stroke]');
  const areaPathEl = svg.querySelector<SVGPathElement>('path[fill^="url"]');
  if (linePathEl && linePathEl.getTotalLength) {
    const len = linePathEl.getTotalLength();
    linePathEl.style.strokeDasharray = len as unknown as string;
    linePathEl.style.strokeDashoffset = len as unknown as string;
    linePathEl.style.transition = 'stroke-dashoffset 1.4s cubic-bezier(0.4, 0, 0.2, 1)';
    requestAnimationFrame(() =>
      setTimeout(() => {
        linePathEl.style.strokeDashoffset = 0 as unknown as string;
        if (areaPathEl) {
          areaPathEl.style.transition = 'opacity 0.8s ease 0.6s';
          areaPathEl.style.opacity = 1 as unknown as string;
        }
        svg.querySelectorAll<SVGCircleElement>('circle').forEach((c, i) => {
          c.style.transition = `opacity 0.4s ease ${0.8 + i * 0.05}s`;
          c.style.opacity = 1 as unknown as string;
        });
      }, 300)
    );
  }
}

function renderGivingSummary(summary: ParishGivingSummaryView | null | undefined): void {
  const heroTotal = document.getElementById('pdxHeroTotal');
  const heroRange = document.getElementById('pdxHeroRange');
  const heroSub = document.getElementById('pdxHeroSub');
  const heroTitle = document.getElementById('pdxHeroTitle');
  const heroSpark = document.getElementById('pdxHeroSpark');
  const kpiDonors = document.getElementById('pdxKpiDonors');
  const kpiAvgGift = document.getElementById('pdxKpiAvgGift');
  const kpiRecurring = document.getElementById('pdxKpiRecurring');
  const kpiGiftCount = document.getElementById('pdxKpiGiftCount');
  const kpiDonorsMeta = document.getElementById('pdxKpiDonorsMeta');
  const kpiAvgGiftMeta = document.getElementById('pdxKpiAvgGiftMeta');
  const kpiGiftCountMeta = document.getElementById('pdxKpiGiftCountMeta');

  if (!summary || summary.dataSource === 'not_connected') {
    if (heroTotal) heroTotal.textContent = '—';
    if (heroSub) heroSub.innerHTML = '<span style="opacity:0.7;">Connect Stripe to show year-to-date giving.</span>';
    if (heroRange) heroRange.textContent = 'Stripe not connected';
    return;
  }
  const year = summary.year || new Date().getFullYear();
  if (heroTitle) heroTitle.textContent = `${year} year to date`;
  if (heroRange) heroRange.textContent = `Jan 1 – ${shortDate(summary.lastGiftAt) || 'today'} · net of fees`;

  // Hero total with count-up
  if (heroTotal) pdxAnimateCount(heroTotal, summary.ytdCents || 0, { money: true });

  // Sub line: gross + last gift date
  if (heroSub) {
    const gross = money(summary.grossGiftCents || summary.ytdCents || 0);
    const lastGift = summary.lastGiftAt
      ? `Last gift ${escapeHtml(shortDate(summary.lastGiftAt))}`
      : 'No gifts recorded yet';
    heroSub.innerHTML = `<span style="opacity:0.75;">Gross ${gross} · ${lastGift}</span>`;
  }

  // KPI band
  if (kpiDonors) pdxAnimateCount(kpiDonors, summary.giverCount || 0);
  if (kpiAvgGift) pdxAnimateCount(kpiAvgGift, summary.averageGiftCents || 0, { money: true });
  if (kpiGiftCount) pdxAnimateCount(kpiGiftCount, summary.giftCount || 0);
  // Recurring givers filled by renderRecurringHealth; leave a placeholder here
  if (kpiRecurring && kpiRecurring.textContent === '—') kpiRecurring.textContent = '—';

  if (kpiDonorsMeta) kpiDonorsMeta.innerHTML = `<span style="opacity:0.75;">Distinct givers this year</span>`;
  if (kpiAvgGiftMeta) {
    const coverage = Math.max(0, Math.min(100, Number(summary.feeCoveragePercent || 0)));
    kpiAvgGiftMeta.innerHTML =
      coverage > 0
        ? `<span class="pdx-delta up">${coverage}%</span>covering fees`
        : `<span style="opacity:0.75;">Net after fees</span>`;
  }
  if (kpiGiftCountMeta) kpiGiftCountMeta.innerHTML = `<span style="opacity:0.75;">All completed gifts</span>`;

  // Sparkline
  if (heroSpark)
    pdxDrawSparkline(
      heroSpark,
      (summary.monthly || []).map((m) => Number(m.amountCents || 0))
    );
}
