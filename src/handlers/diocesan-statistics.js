import { stewardshipToolAccess } from '../lib/entitlements.js';
import { saveStatisticalTotals, validateStatisticalTotals } from '../reports/diocesan-statistical-totals.js';
import {
  aggregateDiocesanStatistics,
  buildDiocesanStatisticsPdf,
  normalizeDiocesanStatisticsYear,
} from '../reports/diocesan-statistics.js';
import {
  findRegistrationByParishId,
  getBearerToken,
  json,
  unauthorized,
  verifyParishDashboardBearer,
} from './parish.js';

function parishReportProfile(registration = {}) {
  return {
    parishName: registration.parishName || registration.name || 'Parish',
    addressLine1: registration.addressLine1 || '',
    addressLine2: registration.addressLine2 || '',
    city: registration.city || '',
    state: registration.state || '',
    postalCode: registration.postalCode || '',
  };
}

async function requireReportContext(request, env, parishId) {
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return { response: json({ error: 'Parish dashboard record not found' }, { status: 404 }) };
  if (!(await verifyParishDashboardBearer(found.registration, getBearerToken(request)))) {
    return { response: unauthorized() };
  }
  if (!stewardshipToolAccess(found.registration)) {
    return {
      response: json({ error: 'The diocesan annual report is available with Stewardship Health.' }, { status: 403 }),
    };
  }
  return { registration: found.registration };
}

export async function handleDiocesanStatisticsReport(request, env, parishId) {
  if (!['GET', 'POST', 'PUT'].includes(request.method)) {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  const context = await requireReportContext(request, env, parishId);
  if (context.response) return context.response;

  const url = new URL(request.url);
  const requestedYear = url.searchParams.get('year');
  const parsedYear = Number(requestedYear);
  if (
    (requestedYear !== null || request.method === 'PUT') &&
    (!requestedYear || !Number.isInteger(parsedYear) || parsedYear < 2000 || parsedYear > 2100)
  ) {
    return json({ error: 'Choose a reporting year between 2000 and 2100.' }, { status: 400 });
  }
  const year = normalizeDiocesanStatisticsYear(requestedYear);
  if (request.method === 'PUT') {
    let totals;
    try {
      const body = await request.json();
      totals = validateStatisticalTotals(body?.totals);
    } catch (error) {
      return json({ error: error.message || 'Provide valid annual totals.' }, { status: 400 });
    }
    await saveStatisticalTotals(env, parishId, year, totals);
  }
  const report = await aggregateDiocesanStatistics(env, { parishId, year });

  if (request.method !== 'POST') return json({ report });

  const pdfBytes = await buildDiocesanStatisticsPdf({
    parish: parishReportProfile(context.registration),
    report,
  });
  return new Response(pdfBytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="diocesan-statistical-report-${year}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
