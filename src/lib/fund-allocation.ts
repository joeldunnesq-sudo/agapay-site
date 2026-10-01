export interface FundCatalogEntry {
  readonly id?: unknown;
  readonly code?: unknown;
  readonly name?: unknown;
  readonly enabled?: unknown;
  readonly active?: unknown;
}
export interface FundCatalog {
  readonly funds?: readonly (FundCatalogEntry | null | undefined)[] | null;
}
export interface FundDesignation {
  readonly giftType?: unknown;
  readonly fundId?: unknown;
  readonly fund?: unknown;
}
export interface HistoricalFundAllocation {
  key: string;
  fundId: string;
  label: string;
  category: 'Retired fund' | 'General Giving' | 'Designated Fund' | 'Historical designation';
}
export interface ResolvedFundAllocation extends HistoricalFundAllocation {
  catalogSource: 'funds_and_alms' | 'historical_gift';
}

// Funds & Alms owns current fund identities and labels. Index once per report,
// including disabled funds: retiring a giving option must not orphan old receipts.
export function createFundAllocationResolver(
  registration: FundCatalog = {}
): (offering?: FundDesignation) => ResolvedFundAllocation | null {
  const byId = new Map<string, FundCatalogEntry | null>(),
    byName = new Map<string, FundCatalogEntry | null>();
  const add = (map: Map<string, FundCatalogEntry | null>, key: string, fund: FundCatalogEntry) => {
    if (key) map.set(key, map.has(key) && map.get(key) !== fund ? null : fund);
  };
  // Array.isArray narrows readonly arrays to any[]; retain the declared element contract.
  for (const fund of (Array.isArray(registration.funds) ? registration.funds : []) as NonNullable<
    FundCatalog['funds']
  >) {
    if (!fund || !(fund.id || fund.code)) continue;
    for (const key of new Set([fund.id, fund.code].filter(Boolean).map(String))) add(byId, key.trim(), fund);
    add(
      byName,
      String(fund.name || '')
        .trim()
        .toLowerCase(),
      fund
    );
  }
  return (offering: FundDesignation = {}): ResolvedFundAllocation | null => {
    const id = String(offering.fundId || '').trim();
    const name = String(offering.fund || '').trim();
    const historical = historicalFundAllocation(offering);
    // An explicit historical ID always wins over a newly reused fund name.
    const map = id ? byId : name ? byName : byId;
    const key = id || (name ? name.toLowerCase() : historical?.fundId);
    if (key && map.has(key)) {
      const fund = map.get(key);
      if (!fund) return null; // Ambiguous catalog identities require review.
      const fundId = String(fund.id || fund.code);
      return {
        key: fundId === 'general' ? 'general' : 'fund:' + fundId,
        fundId,
        label: String(fund.name || fundId),
        category:
          fund.enabled === false || fund.active === false
            ? 'Retired fund'
            : fundId === 'general'
              ? 'General Giving'
              : 'Designated Fund',
        catalogSource: 'funds_and_alms',
      };
    }
    // Removed funds stay identifiable from immutable gift metadata. Do not
    // reinterpret a prior alms campaign using today's (possibly changed) destination.
    return historical ? { ...historical, catalogSource: 'historical_gift' } : null;
  };
}

export function fundAllocation(
  offering: FundDesignation = {},
  registration: FundCatalog = {}
): ResolvedFundAllocation | null {
  return createFundAllocationResolver(registration)(offering);
}

// Never turn an unidentified designation or campaign into General.
function historicalFundAllocation(offering: FundDesignation = {}): HistoricalFundAllocation | null {
  const type = String(offering.giftType || '').toLowerCase();
  const id = String(offering.fundId || '').trim();
  const name = String(offering.fund || '').trim();
  const generalName = /^(general(?: operating)?(?: fund)?|general stewardship|stewardship)$/i;
  if (id)
    return {
      key: id === 'general' ? 'general' : 'fund:' + id,
      fundId: id,
      category: id === 'general' ? 'General Giving' : 'Designated Fund',
      label: name || (id === 'general' ? 'General Operating Fund' : id),
    };
  if (name)
    return {
      key: generalName.test(name) ? 'general' : 'legacy-fund:' + name.toLowerCase(),
      fundId: '',
      category: generalName.test(name) ? 'General Giving' : 'Historical designation',
      label: name,
    };
  if (['general', 'stewardship', 'tithe', 'tithes'].includes(type))
    return { key: 'general', fundId: 'general', category: 'General Giving', label: 'General Operating Fund' };
  return null;
}
