import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { stewardshipGivingSummary } from '../lib/stewardship-summary.js';

const LETTER = [612, 792];
const MARGIN = 48;
const NAVY = rgb(0.03, 0.1, 0.18);
const BLUE = rgb(0.14, 0.31, 0.44);
const GOLD = rgb(0.68, 0.49, 0.2);
const PALE_GOLD = rgb(0.97, 0.94, 0.84);
const INK = rgb(0.1, 0.12, 0.15);
const MUTED = rgb(0.4, 0.43, 0.47);
const LINE = rgb(0.84, 0.85, 0.86);
const WHITE = rgb(1, 1, 1);

function plainText(value) {
  return String(value ?? '')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '-')
    .trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundedAverage(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 10) / 10 : null;
}

function formatUsd(cents) {
  return (number(cents) / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

function validYear(value, fallback = new Date().getFullYear()) {
  const year = Number.parseInt(value, 10);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return fallback;
  return year;
}

async function manualIncomeTotalCents(env, parishId, startDate, endDate) {
  const row = await env.AGAPAY_DB.prepare(
    `SELECT COALESCE(SUM(amount_cents), 0) AS total_cents
       FROM manual_income_entries
      WHERE parish_id = ? AND contribution_eligible = 1
        AND entry_date >= ? AND entry_date <= ?`
  )
    .bind(parishId, startDate, endDate)
    .first()
    .catch(() => null);
  return number(row?.total_cents);
}

export function normalizeDiocesanStatisticsYear(value, fallback) {
  return validYear(value, fallback);
}

export async function aggregateDiocesanStatistics(
  env,
  { parishId, year, givingSummaryLoader = stewardshipGivingSummary }
) {
  const reportingYear = validYear(year);
  const yearStart = `${reportingYear}-01-01`;
  const nextYearStart = `${reportingYear + 1}-01-01`;
  const yearEnd = `${reportingYear}-12-31`;

  const [attendanceRow, sacramentResult, membershipRow, membershipStatusResult, giving] = await Promise.all([
    env.AGAPAY_DB.prepare(
      `SELECT COUNT(*) AS weeks_reported,
              AVG(headcount) AS average_headcount,
              MIN(week_of) AS first_week,
              MAX(week_of) AS last_week
         FROM parish_weekly_headcounts
        WHERE parish_id = ? AND week_of >= ? AND week_of < ?`
    )
      .bind(parishId, yearStart, nextYearStart)
      .first(),
    env.AGAPAY_DB.prepare(
      `SELECT sacrament_type, COUNT(*) AS total
         FROM sacrament_requests
        WHERE parish_id = ? AND status = 'completed'
          AND sacrament_type IN ('baptism', 'chrismation', 'wedding', 'funeral')
          AND COALESCE(NULLIF(confirmed_date, ''), substr(updated_at, 1, 10), substr(created_at, 1, 10)) >= ?
          AND COALESCE(NULLIF(confirmed_date, ''), substr(updated_at, 1, 10), substr(created_at, 1, 10)) < ?
        GROUP BY sacrament_type`
    )
      .bind(parishId, yearStart, nextYearStart)
      .all(),
    env.AGAPAY_DB.prepare(
      `SELECT COUNT(DISTINCT p.id) AS people,
              COUNT(DISTINCT h.id) AS households
         FROM directory_parish_affiliations a
         JOIN directory_people p ON p.id = a.person_id AND p.active = 1
         LEFT JOIN directory_household_members hm ON hm.person_id = p.id AND hm.active = 1
         LEFT JOIN directory_households h ON h.id = hm.household_id
          AND h.parish_id = a.parish_id AND h.active = 1
        WHERE a.parish_id = ? AND a.active = 1 AND a.status != 'former_member'`
    )
      .bind(parishId)
      .first(),
    env.AGAPAY_DB.prepare(
      `SELECT a.status, COUNT(DISTINCT a.person_id) AS total
         FROM directory_parish_affiliations a
         JOIN directory_people p ON p.id = a.person_id AND p.active = 1
        WHERE a.parish_id = ? AND a.active = 1 AND a.status != 'former_member'
        GROUP BY a.status`
    )
      .bind(parishId)
      .all(),
    givingSummaryLoader(env, parishId, reportingYear, manualIncomeTotalCents),
  ]);

  const weeksReported = number(attendanceRow?.weeks_reported);
  const sacramentCounts = { baptism: 0, chrismation: 0, wedding: 0, funeral: 0 };
  for (const row of sacramentResult?.results || []) {
    if (Object.hasOwn(sacramentCounts, row.sacrament_type)) {
      sacramentCounts[row.sacrament_type] = number(row.total);
    }
  }
  const affiliationStatuses = {};
  for (const row of membershipStatusResult?.results || []) {
    affiliationStatuses[row.status] = number(row.total);
  }

  return {
    schemaVersion: 1,
    year: reportingYear,
    period: { start: yearStart, end: yearEnd },
    attendance: {
      status: weeksReported > 0 ? 'reported' : 'not_reported',
      message: weeksReported > 0 ? null : 'No attendance reported',
      averageWeeklyAttendance: weeksReported > 0 ? roundedAverage(attendanceRow.average_headcount) : null,
      weeksReported,
      firstWeek: attendanceRow?.first_week || null,
      lastWeek: attendanceRow?.last_week || null,
    },
    sacraments: {
      ...sacramentCounts,
      total: Object.values(sacramentCounts).reduce((sum, count) => sum + count, 0),
    },
    membership: {
      people: number(membershipRow?.people),
      households: number(membershipRow?.households),
      statuses: affiliationStatuses,
      asOf: new Date().toISOString(),
    },
    giving: {
      totalActualCents: number(giving?.total_actual_cents),
      totalPledgedCents: number(giving?.total_pledged_cents),
      pledgeActualCents: number(giving?.pledge_actual_cents),
      activeDonors: number(giving?.active_donors),
      pledgingHouseholds: number(giving?.pledging_donors),
      fulfillmentRatePct: typeof giving?.fulfillment_rate_pct === 'number' ? giving.fulfillment_rate_pct : null,
      manualIncomeCents: number(giving?.manual_income_cents),
    },
  };
}

export async function buildDiocesanStatisticsPdf({ parish = {}, report }) {
  const pdf = await PDFDocument.create();
  const parishName = parish.parishName || parish.name || 'Parish';
  pdf.setTitle(`${parishName} - ${report.year} Diocesan Annual Statistical Report`);
  pdf.setProducer('AGAPAY');

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const page = pdf.addPage(LETTER);
  const [pageWidth, pageHeight] = LETTER;
  const contentWidth = pageWidth - MARGIN * 2;
  let y = pageHeight - MARGIN;

  const draw = (value, { x = MARGIN, size = 10, font = regular, color = INK } = {}) => {
    page.drawText(plainText(value), { x, y, size, font, color });
  };
  const sectionRule = () => {
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: pageWidth - MARGIN, y },
      thickness: 0.8,
      color: LINE,
    });
    y -= 18;
  };
  const sectionTitle = (title, subtitle) => {
    draw(title, { size: 12, font: bold, color: NAVY });
    if (subtitle) page.drawText(plainText(subtitle), { x: MARGIN + 190, y, size: 8.5, font: regular, color: MUTED });
    y -= 9;
    sectionRule();
  };
  const metricBox = (x, width, label, value, detail) => {
    page.drawRectangle({
      x,
      y: y - 58,
      width,
      height: 58,
      color: rgb(0.96, 0.97, 0.97),
      borderColor: LINE,
      borderWidth: 0.7,
    });
    page.drawText(plainText(label).toUpperCase(), { x: x + 10, y: y - 16, size: 7.5, font: bold, color: MUTED });
    page.drawText(plainText(value), { x: x + 10, y: y - 36, size: 15, font: bold, color: NAVY });
    page.drawText(plainText(detail), { x: x + 10, y: y - 50, size: 7.5, font: regular, color: MUTED });
  };
  const row = (label, value, x = MARGIN, valueX = MARGIN + 210) => {
    page.drawText(plainText(label), { x, y, size: 9.5, font: regular, color: INK });
    page.drawText(plainText(value), { x: valueX, y, size: 9.5, font: bold, color: NAVY });
    y -= 17;
  };

  page.drawRectangle({ x: 0, y: pageHeight - 118, width: pageWidth, height: 118, color: NAVY });
  page.drawText('AGAPAY', { x: MARGIN, y: pageHeight - 35, size: 9, font: bold, color: GOLD });
  page.drawText(plainText(parishName), { x: MARGIN, y: pageHeight - 59, size: 18, font: bold, color: WHITE });
  page.drawText(`${report.year} Diocesan Annual Statistical Report`, {
    x: MARGIN,
    y: pageHeight - 82,
    size: 13,
    font: regular,
    color: WHITE,
  });
  page.drawText('Calendar year: January 1 - December 31', {
    x: MARGIN,
    y: pageHeight - 101,
    size: 8.5,
    font: regular,
    color: rgb(0.78, 0.83, 0.87),
  });
  y = pageHeight - 148;

  const boxGap = 8;
  const boxWidth = (contentWidth - boxGap * 3) / 4;
  metricBox(MARGIN, boxWidth, 'Active people', report.membership.people, `${report.membership.households} households`);
  metricBox(
    MARGIN + boxWidth + boxGap,
    boxWidth,
    'Avg attendance',
    report.attendance.averageWeeklyAttendance ?? 'Not reported',
    `${report.attendance.weeksReported} weeks`
  );
  metricBox(MARGIN + (boxWidth + boxGap) * 2, boxWidth, 'Sacraments', report.sacraments.total, 'completed');
  metricBox(
    MARGIN + (boxWidth + boxGap) * 3,
    boxWidth,
    'Giving',
    formatUsd(report.giving.totalActualCents),
    `${report.giving.activeDonors} donors`
  );
  y -= 82;

  sectionTitle('Directory Membership', 'Current active Directory affiliations as of report generation');
  const leftStart = y;
  row('Active people', report.membership.people, MARGIN, MARGIN + 135);
  row('Active households', report.membership.households, MARGIN, MARGIN + 135);
  y = leftStart;
  row('Members', report.membership.statuses.member || 0, MARGIN + 275, MARGIN + 435);
  row('Catechumens', report.membership.statuses.catechumen || 0, MARGIN + 275, MARGIN + 435);
  row(
    'Clergy and monastics',
    number(report.membership.statuses.clergy) + number(report.membership.statuses.monastic),
    MARGIN + 275,
    MARGIN + 435
  );
  y = Math.min(y, leftStart - 54) - 4;

  sectionTitle('Sacramental Life', `Completed in ${report.year}; funeral is reported as a count only`);
  const sacramentY = y;
  row('Baptisms', report.sacraments.baptism, MARGIN, MARGIN + 105);
  row('Chrismations', report.sacraments.chrismation, MARGIN, MARGIN + 105);
  y = sacramentY;
  row('Weddings', report.sacraments.wedding, MARGIN + 275, MARGIN + 380);
  row('Funerals', report.sacraments.funeral, MARGIN + 275, MARGIN + 380);
  y = sacramentY - 48;

  sectionTitle('Sunday Attendance', 'Parish-owned weekly headcounts');
  if (report.attendance.status === 'not_reported') {
    page.drawRectangle({
      x: MARGIN,
      y: y - 42,
      width: contentWidth,
      height: 42,
      color: PALE_GOLD,
      borderColor: GOLD,
      borderWidth: 0.8,
    });
    page.drawText('No attendance reported', { x: MARGIN + 13, y: y - 18, size: 11, font: bold, color: NAVY });
    page.drawText(`No parish weekly headcounts were recorded for ${report.year}.`, {
      x: MARGIN + 13,
      y: y - 33,
      size: 8.5,
      font: regular,
      color: MUTED,
    });
    y -= 58;
  } else {
    const average = Number.isInteger(report.attendance.averageWeeklyAttendance)
      ? String(report.attendance.averageWeeklyAttendance)
      : report.attendance.averageWeeklyAttendance.toFixed(1);
    const attendanceY = y;
    row('Average weekly attendance', average, MARGIN, MARGIN + 170);
    row('Weeks reported', report.attendance.weeksReported, MARGIN, MARGIN + 170);
    y = attendanceY;
    row('First reported Sunday', report.attendance.firstWeek || '-', MARGIN + 275, MARGIN + 410);
    row('Last reported Sunday', report.attendance.lastWeek || '-', MARGIN + 275, MARGIN + 410);
    y = attendanceY - 48;
  }

  sectionTitle('Stewardship Summary', `Recorded giving for ${report.year}`);
  const givingY = y;
  row('Total giving', formatUsd(report.giving.totalActualCents), MARGIN, MARGIN + 125);
  row('Annual pledges', formatUsd(report.giving.totalPledgedCents), MARGIN, MARGIN + 125);
  row('Pledge giving received', formatUsd(report.giving.pledgeActualCents), MARGIN, MARGIN + 125);
  y = givingY;
  row('Active donors', report.giving.activeDonors, MARGIN + 275, MARGIN + 410);
  row('Pledging households', report.giving.pledgingHouseholds, MARGIN + 275, MARGIN + 410);
  row(
    'Pledge fulfillment',
    report.giving.fulfillmentRatePct === null ? 'Not available' : `${report.giving.fulfillmentRatePct}%`,
    MARGIN + 275,
    MARGIN + 410
  );

  const footerY = 38;
  page.drawLine({
    start: { x: MARGIN, y: footerY + 18 },
    end: { x: pageWidth - MARGIN, y: footerY + 18 },
    thickness: 0.7,
    color: LINE,
  });
  page.drawText(`Generated ${new Date().toLocaleDateString('en-US')} via AGAPAY`, {
    x: MARGIN,
    y: footerY,
    size: 7.5,
    font: italic,
    color: MUTED,
  });
  page.drawText(`Page 1 of 1`, { x: pageWidth - MARGIN - 45, y: footerY, size: 7.5, font: regular, color: MUTED });

  return pdf.save();
}
