// Generated from src/lib/fund-allocation.ts by npm run build:server. Do not edit.
function createFundAllocationResolver(registration = {}) {
  const byId = /* @__PURE__ */ new Map(),
    byName = /* @__PURE__ */ new Map();
  const add = (map, key, fund) => {
    if (key) map.set(key, map.has(key) && map.get(key) !== fund ? null : fund);
  };
  for (const fund of Array.isArray(registration.funds) ? registration.funds : []) {
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
  return (offering = {}) => {
    const id = String(offering.fundId || '').trim();
    const name = String(offering.fund || '').trim();
    const historical = historicalFundAllocation(offering);
    const map = id ? byId : name ? byName : byId;
    const key = id || (name ? name.toLowerCase() : historical?.fundId);
    if (key && map.has(key)) {
      const fund = map.get(key);
      if (!fund) return null;
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
    return historical ? { ...historical, catalogSource: 'historical_gift' } : null;
  };
}
function fundAllocation(offering = {}, registration = {}) {
  return createFundAllocationResolver(registration)(offering);
}
function historicalFundAllocation(offering = {}) {
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
export { createFundAllocationResolver, fundAllocation };
