export const STEWARDSHIP_FUND_DEFAULTS = Object.freeze([
  {
    id: "general",
    reportCode: "general",
    name: "General Operating Fund",
    restrictionType: "unrestricted",
    description: "Stewardship and other unrestricted support for day-to-day parish operations.",
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
    id: "iconography",
    name: "Iconography Fund",
    restrictionType: "donor_restricted_temporary",
    description: "Gifts designated for parish iconography.",
    sortOrder: 4
  },
  {
    id: "memorial",
    name: "Memorial / Panakhida",
    restrictionType: "donor_restricted_temporary",
    description: "Offerings designated for memorials and panakhidas.",
    sortOrder: 5
  }
]);

const normalized = (value) => String(value || "").trim().toLowerCase();
const legacyAlmsFund = (fund) => normalized(fund?.id) === "alms"
  || normalized(fund?.name) === "poor box / alms";
const legacyGeneralStewardshipFund = (fund) => normalized(fund?.id) === "stewardship"
  || normalized(fund?.code) === "stewardship"
  || normalized(fund?.name) === "general stewardship";
const legacyGenericCampaignFund = (fund) => normalized(fund?.id) === "campaign"
  || normalized(fund?.code) === "campaign"
  || normalized(fund?.name) === "campaign / appeal";
const generalOperatingFund = (fund) => normalized(fund?.id) === "general"
  || normalized(fund?.code) === "general"
  || normalized(fund?.name) === "general operating fund";

export function mergeStewardshipFundsIntoRegistration(registration = {}) {
  const original = Array.isArray(registration.funds) ? registration.funds : [];
  // "alms" remains a payment/reporting category, but Benevolence Fund is the
  // single parish/accounting fund for money restricted to the poor and needy.
  const existingGeneral = original.find(generalOperatingFund);
  const legacyGeneral = original.find(legacyGeneralStewardshipFund);
  const removed = original.filter((fund) =>
    legacyAlmsFund(fund) || legacyGenericCampaignFund(fund) || legacyGeneralStewardshipFund(fund)
  );
  const current = original
    .filter((fund) =>
      !legacyAlmsFund(fund) && !legacyGenericCampaignFund(fund) && !legacyGeneralStewardshipFund(fund)
    )
    .map((fund) => generalOperatingFund(fund) ? {
      ...fund,
      id: "general",
      code: "general",
      name: "General Operating Fund",
      accountingFundId: "fund_general",
      accountNumber: "GENERAL",
      restrictionType: "unrestricted",
      isDefault: true,
      sortOrder: 0
    } : fund);
  if (!existingGeneral && legacyGeneral) {
    current.unshift({
      ...legacyGeneral,
      id: "general",
      code: "general",
      name: "General Operating Fund",
      description: "Stewardship and other unrestricted support for day-to-day parish operations.",
      accountingFundId: "fund_general",
      accountNumber: "GENERAL",
      restrictionType: "unrestricted",
      isDefault: true,
      sortOrder: 0
    });
  }
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
  const originalFeastCampaigns = Array.isArray(registration.feastCampaigns) ? registration.feastCampaigns : [];
  const patronalFeastId = String(registration.patronalFeast || "").trim();
  const patronalFeastName = String(registration.patronalFeastName || "").trim();
  const patronalFeastDate = String(registration.patronalFeastDate || "").slice(-5);
  const feastCampaigns = originalFeastCampaigns.map((campaign) => {
    const patronal = Boolean(campaign?.patronal || (patronalFeastId && campaign?.id === patronalFeastId));
    return {
      ...campaign,
      destinationFundId: campaign?.destinationFundId || "benevolence-fund",
      ...(patronal ? {
        patronal: true,
        ...(patronalFeastDate ? { feastDate: patronalFeastDate } : {})
      } : {})
    };
  });
  if (patronalFeastId && patronalFeastName && !feastCampaigns.some((campaign) => campaign?.id === patronalFeastId)) {
    feastCampaigns.push({
      id: patronalFeastId,
      name: patronalFeastName,
      campaignName: `${patronalFeastName} Patronal Feast Campaign`,
      description: `Parish-approved alms connected to ${patronalFeastName}.`,
      enabled: true,
      patronal: true,
      ...(patronalFeastDate ? { feastDate: patronalFeastDate } : {}),
      destinationFundId: "benevolence-fund"
    });
  }
  const fundsChanged = Boolean(added.length || removed.length || JSON.stringify(current) !== JSON.stringify(original));
  const feastCampaignsChanged = JSON.stringify(feastCampaigns) !== JSON.stringify(originalFeastCampaigns);

  return {
    registration: fundsChanged || feastCampaignsChanged
      ? {
        ...registration,
        funds: added.length ? [...current, ...added] : current,
        ...(feastCampaigns.length ? { feastCampaigns } : {})
      }
      : registration,
    added,
    removed,
    changed: Boolean(fundsChanged || feastCampaignsChanged)
  };
}
