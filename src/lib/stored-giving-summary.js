// Generated from src/lib/stored-giving-summary.ts by npm run build:server. Do not edit.
import { monthLabel } from './format.js';
import { numericCents } from './numeric-cents.js';
function summarizeStoredParishGifts(gifts = []) {
  const now = /* @__PURE__ */ new Date();
  const currentYear = now.getUTCFullYear();
  const giftYears = gifts
    .map((gift) => new Date(gift.createdAt || gift.date || 0).getUTCFullYear())
    .filter((yearValue) => Number.isFinite(yearValue));
  const year = giftYears.includes(currentYear) ? currentYear : giftYears.length ? Math.max(...giftYears) : currentYear;
  const monthly = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    label: monthLabel(index),
    amountCents: 0,
    giftCount: 0,
  }));
  const givers = /* @__PURE__ */ new Set();
  let ytdCents = 0;
  let grossGiftCents = 0;
  let donorCoveredFeeCents = 0;
  let feesAbsorbedCents = 0;
  let coverFeesCount = 0;
  let giftCount = 0;
  let lastGiftAt = '';
  for (const gift of gifts) {
    const created = new Date(gift.createdAt || gift.date || 0);
    if (created.getUTCFullYear() !== year) continue;
    const netCents = numericCents(gift.parishNetCents ?? gift.amountCents);
    const grossCents = numericCents(gift.giftAmountCents ?? gift.amountCents);
    if (!netCents && !grossCents) continue;
    const monthIndex = created.getUTCMonth();
    monthly[monthIndex].amountCents += netCents;
    monthly[monthIndex].giftCount += 1;
    ytdCents += netCents;
    grossGiftCents += grossCents;
    feesAbsorbedCents += numericCents(gift.totalFeeCents);
    if (gift.coverFees) {
      coverFeesCount += 1;
      donorCoveredFeeCents += numericCents(gift.donorCoveredFeeCents);
    }
    giftCount += 1;
    const giverKey = gift.donorEmail || gift.donorName || gift.id;
    if (giverKey) givers.add(String(giverKey).toLowerCase());
    const iso = created.toISOString();
    if (!lastGiftAt || iso > lastGiftAt) lastGiftAt = iso;
  }
  return {
    year,
    currency: 'usd',
    ytdCents,
    grossGiftCents,
    donorCoveredFeeCents,
    feesAbsorbedCents,
    feeCoveragePercent: giftCount ? Math.round((coverFeesCount / giftCount) * 100) : 0,
    giftCount,
    giverCount: givers.size,
    averageGiftCents: giftCount ? Math.round(ytdCents / giftCount) : 0,
    lastGiftAt,
    monthly,
  };
}
export { summarizeStoredParishGifts };
