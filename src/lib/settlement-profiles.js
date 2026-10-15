// Generated from src/lib/settlement-profiles.ts by npm run build:server. Do not edit.
import { d1, d1First, d1All, d1Run } from './core.js';
const SETTLEMENT_PROFILE_TYPES = [
  'general_giving',
  'liturgical',
  'bookstore',
  'festival',
  'school',
  'cemetery',
  'camp',
  'hall_rental',
  'fundraisers',
];
const KNOWN_MODULE_KEYS = ['giving', 'bookstore', 'events'];
function newProfileId() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return 'sp_' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
function defaultGivingId(parishId) {
  return `sp_giving_${parishId}`;
}
function defaultCommerceId(parishId) {
  return `sp_commerce_${parishId}`;
}
function settlementProfileToJson(row) {
  if (!row) return null;
  return {
    id: row.id,
    parishId: row.parish_id,
    name: row.name,
    profileType: row.profile_type,
    stripeAccountId: row.stripe_account_id || null,
    stripeExternalAccountId: row.stripe_external_account_id || null,
    payoutDestinationLabel: row.payout_destination_label || null,
    accountingCategory: row.accounting_category || null,
    isDefaultGiving: Number(row.is_default_giving) === 1,
    isDefaultCommerce: Number(row.is_default_commerce) === 1,
    isActive: Number(row.is_active) === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
async function ensureDefaultGivingProfile(env, parishId) {
  if (!d1(env) || !parishId) return null;
  const existing = await d1First(
    env,
    `SELECT * FROM settlement_profiles WHERE parish_id = ? AND is_default_giving = 1 AND is_active = 1`,
    parishId
  );
  if (existing) return existing;
  const id = defaultGivingId(parishId);
  const now = /* @__PURE__ */ new Date().toISOString();
  await d1Run(
    env,
    `INSERT OR IGNORE INTO settlement_profiles
       (id, parish_id, name, profile_type, is_default_giving, is_default_commerce, is_active, created_at, updated_at)
     VALUES (?, ?, 'Primary Giving', 'general_giving', 1, 0, 1, ?, ?)`,
    id,
    parishId,
    now,
    now
  );
  await d1Run(
    env,
    `INSERT OR IGNORE INTO settlement_profile_modules (parish_id, module_key, settlement_profile_id, updated_at)
     VALUES (?, 'giving', ?, ?)`,
    parishId,
    id,
    now
  );
  return d1First(env, `SELECT * FROM settlement_profiles WHERE id = ?`, id);
}
async function ensureDefaultCommerceProfile(env, parishId) {
  if (!d1(env) || !parishId) return null;
  const existing = await d1First(
    env,
    `SELECT * FROM settlement_profiles WHERE parish_id = ? AND is_default_commerce = 1 AND is_active = 1`,
    parishId
  );
  if (existing) return existing;
  const id = defaultCommerceId(parishId);
  const now = /* @__PURE__ */ new Date().toISOString();
  await d1Run(
    env,
    `INSERT OR IGNORE INTO settlement_profiles
       (id, parish_id, name, profile_type, is_default_giving, is_default_commerce, is_active, created_at, updated_at)
     VALUES (?, ?, 'Bookstore Payments', 'bookstore', 0, 1, 1, ?, ?)`,
    id,
    parishId,
    now,
    now
  );
  await d1Run(
    env,
    `INSERT OR IGNORE INTO settlement_profile_modules (parish_id, module_key, settlement_profile_id, updated_at)
     VALUES (?, 'bookstore', ?, ?)`,
    parishId,
    id,
    now
  );
  return d1First(env, `SELECT * FROM settlement_profiles WHERE id = ?`, id);
}
async function resolveSettlementProfileId(env, parishId, moduleKey) {
  if (!d1(env) || !parishId) return null;
  const isGivingModule = moduleKey === 'giving';
  const assigned = await d1First(
    env,
    `SELECT sp.* FROM settlement_profile_modules m
     JOIN settlement_profiles sp ON sp.id = m.settlement_profile_id AND sp.parish_id = m.parish_id
     WHERE m.parish_id = ? AND m.module_key = ? AND sp.is_active = 1`,
    parishId,
    moduleKey
  );
  if (assigned) return assigned.id;
  if (isGivingModule) {
    const profile = await ensureDefaultGivingProfile(env, parishId);
    return profile?.id || null;
  }
  const commerceProfile = await ensureDefaultCommerceProfile(env, parishId);
  if (commerceProfile?.id) return commerceProfile.id;
  console.warn(
    `[settlement-profiles] no commerce profile for parish ${parishId} on module ${moduleKey}; falling back to giving profile`
  );
  const givingProfile = await ensureDefaultGivingProfile(env, parishId);
  return givingProfile?.id || null;
}
async function listSettlementProfiles(env, parishId) {
  if (!d1(env) || !parishId) return [];
  const profiles = await d1All(
    env,
    `SELECT * FROM settlement_profiles WHERE parish_id = ? ORDER BY is_default_giving DESC, is_default_commerce DESC, name ASC`,
    parishId
  );
  const modules = await d1All(
    env,
    `SELECT module_key, settlement_profile_id FROM settlement_profile_modules WHERE parish_id = ?`,
    parishId
  );
  const modulesByProfile = {};
  for (const m of modules) {
    (modulesByProfile[m.settlement_profile_id] ||= []).push(m.module_key);
  }
  return profiles.map((row) => ({
    ...settlementProfileToJson(row),
    modules: modulesByProfile[row.id] || [],
  }));
}
async function createSettlementProfile(env, parishId, { name, profileType }) {
  const cleanName = String(name || '')
    .trim()
    .slice(0, 80);
  if (!cleanName) return { error: 'Revenue stream name is required.' };
  const type = SETTLEMENT_PROFILE_TYPES.includes(profileType) ? profileType : 'general_giving';
  const id = newProfileId();
  const now = /* @__PURE__ */ new Date().toISOString();
  await d1Run(
    env,
    `INSERT INTO settlement_profiles
       (id, parish_id, name, profile_type, is_default_giving, is_default_commerce, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, 0, 1, ?, ?)`,
    id,
    parishId,
    cleanName,
    type,
    now,
    now
  );
  return { profile: await d1First(env, `SELECT * FROM settlement_profiles WHERE id = ?`, id) };
}
async function renameSettlementProfile(env, parishId, profileId, name) {
  const cleanName = String(name || '')
    .trim()
    .slice(0, 80);
  if (!cleanName) return { error: 'Revenue stream name is required.' };
  const existing = await d1First(
    env,
    `SELECT * FROM settlement_profiles WHERE id = ? AND parish_id = ?`,
    profileId,
    parishId
  );
  if (!existing) return { error: 'Revenue stream not found.' };
  await d1Run(
    env,
    `UPDATE settlement_profiles SET name = ?, updated_at = ? WHERE id = ?`,
    cleanName,
    /* @__PURE__ */ new Date().toISOString(),
    profileId
  );
  return {
    profile: await d1First(env, `SELECT * FROM settlement_profiles WHERE id = ?`, profileId),
  };
}
async function setProfileActive(env, parishId, profileId, isActive) {
  const existing = await d1First(
    env,
    `SELECT * FROM settlement_profiles WHERE id = ? AND parish_id = ?`,
    profileId,
    parishId
  );
  if (!existing) return { error: 'Revenue stream not found.' };
  if (!isActive) {
    if (Number(existing.is_default_giving) === 1) {
      const otherActiveGiving = await d1First(
        env,
        `SELECT id FROM settlement_profiles WHERE parish_id = ? AND is_default_giving = 1 AND is_active = 1 AND id <> ?`,
        parishId,
        profileId
      );
      if (!otherActiveGiving) {
        return {
          error:
            "This is the parish's only active giving revenue stream and can't be deactivated. Set a different revenue stream as the default giving revenue stream first.",
        };
      }
    }
    if (Number(existing.is_default_commerce) === 1) {
      const otherActiveCommerce = await d1First(
        env,
        `SELECT id FROM settlement_profiles WHERE parish_id = ? AND is_default_commerce = 1 AND is_active = 1 AND id <> ?`,
        parishId,
        profileId
      );
      if (!otherActiveCommerce) {
        return {
          error:
            "This is the parish's only active commerce revenue stream and can't be deactivated. Set a different revenue stream as the default commerce revenue stream first.",
        };
      }
    }
  }
  await d1Run(
    env,
    `UPDATE settlement_profiles SET is_active = ?, updated_at = ? WHERE id = ?`,
    isActive ? 1 : 0,
    /* @__PURE__ */ new Date().toISOString(),
    profileId
  );
  return {
    profile: await d1First(env, `SELECT * FROM settlement_profiles WHERE id = ?`, profileId),
  };
}
async function setDefaultFlag(env, parishId, profileId, column) {
  const target = await d1First(
    env,
    `SELECT * FROM settlement_profiles WHERE id = ? AND parish_id = ?`,
    profileId,
    parishId
  );
  if (!target) return { error: 'Revenue stream not found.' };
  if (Number(target.is_active) !== 1)
    return { error: "An inactive revenue stream can't be made the default. Reactivate it first." };
  const now = /* @__PURE__ */ new Date().toISOString();
  await d1Run(
    env,
    `UPDATE settlement_profiles SET ${column} = 0, updated_at = ? WHERE parish_id = ? AND ${column} = 1`,
    now,
    parishId
  );
  await d1Run(env, `UPDATE settlement_profiles SET ${column} = 1, updated_at = ? WHERE id = ?`, now, profileId);
  return {
    profile: await d1First(env, `SELECT * FROM settlement_profiles WHERE id = ?`, profileId),
  };
}
async function setDefaultGivingProfile(env, parishId, profileId) {
  return setDefaultFlag(env, parishId, profileId, 'is_default_giving');
}
async function setDefaultCommerceProfile(env, parishId, profileId) {
  return setDefaultFlag(env, parishId, profileId, 'is_default_commerce');
}
async function assignModuleProfile(env, parishId, moduleKey, profileId) {
  const key = String(moduleKey || '')
    .trim()
    .slice(0, 40);
  if (!key) return { error: 'Module key is required.' };
  const target = await d1First(
    env,
    `SELECT * FROM settlement_profiles WHERE id = ? AND parish_id = ?`,
    profileId,
    parishId
  );
  if (!target) return { error: 'Revenue stream not found.' };
  if (Number(target.is_active) !== 1)
    return { error: "An inactive revenue stream can't be assigned to a module. Reactivate it first." };
  const now = /* @__PURE__ */ new Date().toISOString();
  await d1Run(
    env,
    `INSERT INTO settlement_profile_modules (parish_id, module_key, settlement_profile_id, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(parish_id, module_key) DO UPDATE SET settlement_profile_id = excluded.settlement_profile_id, updated_at = excluded.updated_at`,
    parishId,
    key,
    profileId,
    now
  );
  return { assigned: { moduleKey: key, settlementProfileId: profileId } };
}
export {
  KNOWN_MODULE_KEYS,
  SETTLEMENT_PROFILE_TYPES,
  assignModuleProfile,
  createSettlementProfile,
  ensureDefaultCommerceProfile,
  ensureDefaultGivingProfile,
  listSettlementProfiles,
  renameSettlementProfile,
  resolveSettlementProfileId,
  setDefaultCommerceProfile,
  setDefaultGivingProfile,
  setProfileActive,
  settlementProfileToJson,
};
