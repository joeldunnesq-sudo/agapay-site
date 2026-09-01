import { getBearerToken, json, unauthorized } from '../lib/core.js';
import {
  AttendanceValidationError,
  getParishAttendanceTrend,
  saveParishWeeklyHeadcount,
  setAttendanceDelegate,
} from '../stewardship/attendance.js';
import { findRegistrationByParishId, verifyParishDashboardBearer } from './parish.js';

const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store',
  Vary: 'Authorization',
};

function response(payload, init = {}) {
  return json(payload, { ...init, headers: { ...PRIVATE_HEADERS, ...(init.headers || {}) } });
}

async function attendanceAccess(request, env, parishId) {
  const found = parishId ? await findRegistrationByParishId(env, parishId) : null;
  if (!found || !(await verifyParishDashboardBearer(found.registration, getBearerToken(request)))) return null;
  const setting = await env.AGAPAY_DB.prepare(
    `
    SELECT has_stewardship_suite FROM parish_stewardship_settings WHERE parish_id = ?
  `
  )
    .bind(parishId)
    .first();
  if (!setting?.has_stewardship_suite)
    return { denied: response({ error: 'Stewardship is not active for this parish.' }, { status: 403 }) };
  return { found };
}

function attendanceError(error) {
  if (error instanceof AttendanceValidationError) {
    return response({ error: error.message }, { status: error.status });
  }
  throw error;
}

export async function handleStewardshipAttendance(request, env, parishId) {
  const access = await attendanceAccess(request, env, parishId);
  if (!access) return unauthorized();
  if (access.denied) return access.denied;
  try {
    if (request.method === 'GET') {
      const url = new URL(request.url);
      return response(await getParishAttendanceTrend(env, { parishId, weeks: url.searchParams.get('weeks') }));
    }
    if (request.method === 'PATCH') {
      const body = await request.json().catch(() => ({}));
      const saved = await saveParishWeeklyHeadcount(env, {
        parishId,
        weekOf: body.weekOf,
        headcount: body.headcount,
        actorType: 'parish_staff',
        actorId: access.found.key,
      });
      return response(saved);
    }
    return response({ error: 'Method not allowed' }, { status: 405 });
  } catch (error) {
    return attendanceError(error);
  }
}

export async function handleStewardshipAttendanceDelegation(request, env, parishId) {
  const access = await attendanceAccess(request, env, parishId);
  if (!access) return unauthorized();
  if (access.denied) return access.denied;
  if (request.method !== 'PATCH') return response({ error: 'Method not allowed' }, { status: 405 });
  try {
    const body = await request.json().catch(() => ({}));
    const delegate = await setAttendanceDelegate(env, { parishId, ministryId: body.ministryId });
    return response({ ok: true, delegate });
  } catch (error) {
    return attendanceError(error);
  }
}
