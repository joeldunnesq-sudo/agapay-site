import { getBearerToken, json, rateLimit } from "../lib/core.js";
import { expandRoleTemplate } from "../lib/authorization.js";
import { createAccountingStaffProfile, listAccountingStaffProfiles, requireAccountingStaffProfile, revokeAccountingStaffSession, updateAccountingStaffPin, verifyAccountingStaffPin } from "../lib/accounting-staff.js";
import { findRegistrationByParishId, verifyParishDashboardBearer } from "./parish.js";
import { recordAuditEvent } from "../lib/audit-log.js";

const reply = (body, status = 200) => json(body, { status, headers: { "Cache-Control":"private, no-store", "X-Robots-Tag":"noindex, nofollow", Vary:"Authorization" } });
async function parishGate(request, env, parishId) {
  const found = await findRegistrationByParishId(env, parishId);
  return Boolean(found && await verifyParishDashboardBearer(found.registration, getBearerToken(request)));
}

export async function handleAccountingAccess(request, env, parishId) {
  const base = `/api/parish/dashboard/${encodeURIComponent(parishId)}/accounting-access`;
  const url = new URL(request.url); if (!url.pathname.startsWith(base)) return null;
  const path = url.pathname.slice(base.length);
  const limited = await rateLimit(request, env, "accounting-staff-access", { limit: 40, windowSeconds: 300 }); if (limited) return limited;
  if (!(await parishGate(request, env, parishId))) return reply({ error:"Unauthorized" }, 401);
  if (request.method === "GET" && path === "/profiles") return reply({ profiles: await listAccountingStaffProfiles(env, parishId) });
  const body = await request.json().catch(() => ({}));
  if (request.method === "POST" && path === "/bootstrap") {
    if ((await listAccountingStaffProfiles(env, parishId)).length) return reply({ error:"Accounting access is already activated." }, 409);
    const roleTemplate = ["rector","treasurer","bookkeeper"].includes(body.roleTemplate) ? body.roleTemplate : "treasurer";
    const profile = await createAccountingStaffProfile(env, { parishId, displayName:body.displayName, roleTemplate, capabilities:expandRoleTemplate(roleTemplate), pin:body.pin, actorType:"legacy_parish_bootstrap" });
    if (profile) await recordAuditEvent(env,request,{action:"accounting.staff_profile.bootstrapped",actorType:"parish",targetType:"accounting_staff_profile",targetId:profile.id,organizationId:parishId,after:{displayName:profile.displayName,roleTemplate:profile.roleTemplate}});
    return profile ? reply({ ok:true, profile }, 201) : reply({ error:"Name and a six-digit PIN are required." }, 400);
  }
  if (request.method === "POST" && path === "/verify") {
    const result = await verifyAccountingStaffPin(env, { parishId, profileId:body.profileId, pin:body.pin });
    if (result) await recordAuditEvent(env,request,{action:"accounting.staff_session.started",actorUserId:result.profile.id,actorType:"accounting_staff_profile",actorRole:result.profile.roleTemplate,targetType:"parish",targetId:parishId,organizationId:parishId});
    return result ? reply({ ok:true, ...result }) : reply({ error:"The profile or PIN is incorrect. Five failed attempts lock the profile for 15 minutes." }, 401);
  }
  if (request.method === "POST" && path === "/profiles") {
    const actor = await requireAccountingStaffProfile(request, env, parishId, "accounting.configure");
    if (!actor) return reply({ error:"Accounting administrator access is required." }, 403);
    const roleTemplate = ["rector","treasurer","bookkeeper","council_member"].includes(body.roleTemplate) ? body.roleTemplate : "bookkeeper";
    const profile = await createAccountingStaffProfile(env, { parishId, displayName:body.displayName, roleTemplate, capabilities:expandRoleTemplate(roleTemplate), pin:body.pin, actorType:"accounting_staff_profile", actorId:actor.user.id });
    if (profile) await recordAuditEvent(env,request,{action:"accounting.staff_profile.created",actorUserId:actor.user.id,actorType:"accounting_staff_profile",actorRole:actor.membership.roleTemplate,targetType:"accounting_staff_profile",targetId:profile.id,organizationId:parishId,after:{displayName:profile.displayName,roleTemplate:profile.roleTemplate}});
    return profile ? reply({ ok:true, profile }, 201) : reply({ error:"Name and a six-digit PIN are required." }, 400);
  }
  if (request.method === "POST" && path === "/pin") {
    const actor = await requireAccountingStaffProfile(request, env, parishId, "accounting.view");
    if (!actor) return reply({ error:"Accounting staff access is required." }, 403);
    const changed = await updateAccountingStaffPin(env,{parishId,profileId:actor.user.id,pin:body.pin});
    if (changed) await recordAuditEvent(env,request,{action:"accounting.staff_pin.changed",actorUserId:actor.user.id,actorType:"accounting_staff_profile",actorRole:actor.membership.roleTemplate,targetType:"accounting_staff_profile",targetId:actor.user.id,organizationId:parishId});
    return changed ? reply({ok:true}) : reply({error:"A six-digit PIN is required."},400);
  }
  if (request.method === "POST" && path === "/logout") { await revokeAccountingStaffSession(env, { parishId, profileId:body.profileId }); await recordAuditEvent(env,request,{action:"accounting.staff_session.revoked",actorUserId:body.profileId,actorType:"accounting_staff_profile",targetType:"parish",targetId:parishId,organizationId:parishId}); return reply({ ok:true }); }
  return reply({ error:"Not found" }, 404);
}
