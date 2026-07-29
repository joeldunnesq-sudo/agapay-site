export const STEWARDSHIP_FUND_DEFAULTS = Object.freeze([
  {
    id: "stewardship",
    name: "General Stewardship",
    restrictionType: "unrestricted",
    description: "General stewardship and parish operating support.",
    isDefault: true,
    sortOrder: 0
  },
  {
    id: "candle",
    name: "Candles / Vigil Lights",
    restrictionType: "donor_restricted_temporary",
    description: "Offerings designated for candles and vigil lights.",
    sortOrder: 1
  },
  {
    id: "building",
    name: "Building Fund",
    restrictionType: "donor_restricted_temporary",
    description: "Gifts designated for parish building needs.",
    sortOrder: 2
  },
  {
    id: "benevolence-fund",
    reportCode: "alms",
    name: "Benevolence Fund",
    restrictionType: "donor_restricted_temporary",
    description: "Alms designated exclusively for the poor and needy.",
    sortOrder: 3
  },
  {
    id: "campaign",
    name: "Campaign / Appeal",
    restrictionType: "donor_restricted_temporary",
    description: "Gifts designated for a parish campaign or appeal.",
    sortOrder: 4
  },
  {
    id: "iconography",
    name: "Iconography Fund",
    restrictionType: "donor_restricted_temporary",
    description: "Gifts designated for parish iconography.",
    sortOrder: 5
  },
  {
    id: "memorial",
    name: "Memorial / Panakhida",
    restrictionType: "donor_restricted_temporary",
    description: "Offerings designated for memorials and panakhidas.",
    sortOrder: 6
  }
]);

const normalized = (value) => String(value || "").trim().toLowerCase();
const legacyAlmsFund = (fund) => normalized(fund?.id) === "alms"
  || normalized(fund?.name) === "poor box / alms";

export function mergeStewardshipFundsIntoRegistration(registration = {}) {
  const original = Array.isArray(registration.funds) ? registration.funds : [];
  // "alms" remains a payment/reporting category, but Benevolence Fund is the
  // single parish/accounting fund for money restricted to the poor and needy.
  const current = original.filter((fund) => !legacyAlmsFund(fund));
  const removed = original.filter(legacyAlmsFund);
  const identities = new Set();
  current.forEach((fund) => {
    [fund?.id, fund?.code, fund?.name].map(normalized).filter(Boolean).forEach((key) => identities.add(key));
  });

  const added = [];
  for (const fund of STEWARDSHIP_FUND_DEFAULTS) {
    const keys = [fund.id, fund.name].map(normalized);
    if (keys.some((key) => identities.has(key))) continue;
    const { reportCode, ...next } = fund;
    added.push(next);
    keys.forEach((key) => identities.add(key));
  }

  return {
    registration: added.length || removed.length
      ? { ...registration, funds: [...current, ...added] }
      : registration,
    added,
    removed,
    changed: Boolean(added.length || removed.length)
  };
}
