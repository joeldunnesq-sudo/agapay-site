// Generated from src/learn/print-document-builders.ts by npm run build:server. Do not edit.
import 'pdf-lib';
import './gpa.js';
import { FORM_ORDER } from './print-documents-shared.js';
import {
  text,
  sumMinutes,
  childFormLabel,
  groupChildRowsByForm,
  childForTemplate,
  tableSection,
  listSection,
  cardsSection,
  liturgicalSection,
  calendarGridSection,
  baseDocument,
} from './print-documents-shared.js';
function buildHouseholdWeekly(printCenter, template, generatedAt) {
  const doc = baseDocument(printCenter, template, generatedAt);
  const week = printCenter.week || {};
  const formRows = groupChildRowsByForm(week.childRows || []);
  doc.sections = [
    tableSection(
      'Family-Based Learning',
      ['Rhythm', 'Notes', 'Minutes'],
      (week.householdRows || []).map((row) => [row.title, row.detail, `${sumMinutes(row.minutes)}m`]),
      { flex: [2, 4, 1] }
    ),
    tableSection(
      'Form Plans',
      ['Form', 'Children', 'Assignments'],
      formRows.map((row) => [row.label, Array.from(row.children).join(', '), row.details.slice(0, 5).join('; ')]),
      { flex: [1.5, 1.5, 4] }
    ),
    liturgicalSection('Liturgical Notes', (week.liturgicalDays || []).slice(0, 7)),
  ].filter(Boolean);
  return doc;
}
function cleanDesignedAssignment(item = {}) {
  return {
    title: text(item.title || 'Subject'),
    sub: text(item.sub || ''),
    note: text(item.note || ''),
    color: text(item.color || ''),
    kind: text(item.kind || ''),
    formLabels: Array.isArray(item.formLabels) ? item.formLabels.map(text).filter(Boolean) : [],
  };
}
function sortFormLabels(labels = []) {
  return [...new Set(labels.map(text).filter((label) => label && label !== '__family'))].sort((a, b) => {
    const ai = FORM_ORDER.indexOf(a);
    const bi = FORM_ORDER.indexOf(b);
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    return a.localeCompare(b);
  });
}
function designedWeekForms(designedWeek, days, unassigned) {
  const explicitForms = sortFormLabels(Array.isArray(designedWeek.forms) ? designedWeek.forms : []);
  if (explicitForms.length) return explicitForms;
  const labels = [];
  days.forEach((day) => (day.assignments || []).forEach((item) => labels.push(...(item.formLabels || []))));
  unassigned.forEach((item) => labels.push(...(item.formLabels || [])));
  return sortFormLabels(labels).length ? sortFormLabels(labels) : ['Household'];
}
function designedAssignmentForForm(item, formLabel) {
  const labels = item.formLabels || [];
  if (!labels.length) return true;
  if (formLabel === 'Household') return true;
  return labels.includes('__family') || labels.includes(formLabel);
}
function buildDesignedWeek(printCenter, designedWeek = {}, generatedAt) {
  const doc = baseDocument(printCenter, { id: 'print_mom_weekly', title: 'Designed Weekly Lesson Plan' }, generatedAt);
  const days = Array.isArray(designedWeek.days) ? designedWeek.days : [];
  const normalizedDays = days.slice(0, 7).map((day) => ({
    date: text(day.date || ''),
    weekday: text(day.weekday || ''),
    shortDate: text(day.shortDate || ''),
    feast: text(day.feast || ''),
    isSunday: Boolean(day.isSunday),
    assignments: Array.isArray(day.assignments)
      ? day.assignments.map(cleanDesignedAssignment).filter((item) => item.title)
      : [],
  }));
  const unassigned = Array.isArray(designedWeek.unassigned)
    ? designedWeek.unassigned.map(cleanDesignedAssignment).filter((item) => item.title)
    : [];
  const forms = designedWeekForms(designedWeek, normalizedDays, unassigned);
  doc.layout = 'designed-week-forms-landscape';
  doc.designedForms = forms.map((label) => ({
    label,
    days: normalizedDays.map((day) => ({
      ...day,
      assignments: (day.assignments || []).filter((item) => designedAssignmentForForm(item, label)),
    })),
    unassigned: unassigned.filter((item) => designedAssignmentForForm(item, label)),
  }));
  doc.title = 'Designed Weekly Lesson Plan by Form';
  doc.subtitle = text(
    `${printCenter.household?.name || 'Household'} · ${designedWeek.label || printCenter.week?.label || 'Current Week'}${designedWeek.termLabel || printCenter.term?.label ? ' · ' + (designedWeek.termLabel || printCenter.term?.label) : ''}`
  );
  doc.footerRole = 'Designed Week';
  doc.sections = [
    cardsSection('Week Summary', [
      {
        label: 'Week',
        value: designedWeek.label || printCenter.week?.label || 'Current Week',
        detail: 'Personally arranged from the weekly planner.',
      },
      {
        label: 'Scheduled',
        value: String(normalizedDays.reduce((count, day) => count + day.assignments.length, 0)),
        detail: 'Subject cards placed into days.',
      },
      { label: 'Unplaced', value: String(unassigned.length), detail: 'Still waiting in the available-subject tray.' },
    ]),
    { type: 'designed-week', heading: "Mom's Designed Week", days: normalizedDays },
    unassigned.length
      ? listSection(
          'Available Subjects Not Placed',
          unassigned.map((item) => ({ label: item.title, detail: item.note || item.sub }))
        )
      : null,
    liturgicalSection('Liturgical Notes', (printCenter.week?.liturgicalDays || []).slice(0, 7)),
  ].filter(Boolean);
  return doc;
}
function buildTermPlan(printCenter, template, generatedAt) {
  const doc = baseDocument(printCenter, template, generatedAt);
  const setup = printCenter.termSetup || {};
  const activeTerm = (setup.termOptions || []).find((t) => t.id === setup.activeTermId) || {};
  doc.sections = [
    cardsSection('Current Term', [
      {
        label: 'Term',
        value: activeTerm.label || printCenter.term?.label || 'Current Term',
        detail: printCenter.term?.week || '',
      },
      {
        label: 'Calendar',
        value: printCenter.calendarToggle?.label || 'Orthodox Calendar',
        detail: printCenter.calendarToggle?.description || '',
      },
      { label: 'Grace Mode', value: 'Available', detail: 'Use lighter weeks without losing the term rhythm.' },
    ]),
    tableSection(
      'Children and Forms',
      ['Child', 'Form', 'Age'],
      (printCenter.children || []).map((c) => [
        c.firstName || c.name,
        childFormLabel(c),
        c.ageYears ? `${c.ageYears}` : '',
      ]),
      { flex: [2, 2, 1] }
    ),
    tableSection(
      'Term Options',
      ['Term', 'Status', 'Notes'],
      (setup.termOptions || []).map((t) => [
        t.label,
        t.id === setup.activeTermId ? 'Current' : 'Planned',
        t.startDate && t.endDate ? `${t.startDate} to ${t.endDate}` : 'Set in Setup',
      ]),
      { flex: [2, 1, 3] }
    ),
  ].filter(Boolean);
  return doc;
}
function buildMonthCalendar(printCenter, template, generatedAt) {
  const doc = baseDocument(printCenter, template, generatedAt);
  const month = printCenter.month || {};
  const days = month.days || [];
  doc.title = text(month.printableTitle || month.label || template.month || doc.title);
  doc.subtitle = text(
    `${printCenter.household?.name || 'Household'} · ${month.label || 'Month Calendar'} · ${printCenter.calendarToggle?.label || ''}`
  );
  doc.sections = [
    cardsSection('Month Summary', [
      { label: 'Month', value: month.label || '', detail: 'Household rhythm, feast markers, and fast-day notes.' },
      {
        label: 'Fast Days',
        value: String(month.fastDays || 0),
        detail: 'Shown in the calendar cells and detailed below.',
      },
      {
        label: 'Feast Markers',
        value: String(month.feastDays || 0),
        detail: 'Liturgical rhythm from the selected Orthodox calendar.',
      },
      {
        label: 'Calendar',
        value: printCenter.calendarToggle?.label || 'Orthodox Calendar',
        detail: printCenter.calendarToggle?.description || '',
      },
    ]),
    calendarGridSection(
      'Month Calendar',
      days.filter((d) => d?.inMonth !== void 0)
    ),
    listSection(
      'Fast-Day Details',
      days
        .filter((d) => d?.inMonth && d?.isFastDay)
        .map((d) => ({
          label: `${d.civilDate} · ${d.fastingType || d.fastingRule || 'Fast'}`,
          detail: [d.feastTitle, d.oldStyleDateLabel].filter(Boolean).join(' · '),
        }))
    ),
  ].filter(Boolean);
  return doc;
}
function buildChildWeekly(printCenter, template, generatedAt) {
  const doc = baseDocument(printCenter, template, generatedAt);
  const child = childForTemplate(printCenter, template);
  const rows = (printCenter.week?.childRows || []).filter((row) => !child?.id || row.childId === child.id);
  doc.title = text(`${child?.firstName || 'Child'}'s Weekly Sheet`);
  doc.footerRole = doc.title;
  doc.sections = [
    cardsSection('Student', [
      { label: 'Name', value: child?.firstName || 'Student', detail: childFormLabel(child || {}) },
      { label: 'Week', value: printCenter.week?.label || 'Current Week', detail: printCenter.term?.label || '' },
    ]),
    tableSection(
      'Assignments',
      ['Subject', 'Assignment', 'Minutes'],
      rows.map((row) => [row.title, row.detail, `${sumMinutes(row.minutes)}m`]),
      { flex: [2, 4, 1] }
    ),
    {
      type: 'checkboxes',
      heading: 'Daily Checklist',
      subjects: rows.map((row) => text(row.title)).filter(Boolean),
      days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    },
    listSection('Parent Notes', ['Narration:', 'Copywork:', 'Prayer and habit notes:']),
  ].filter(Boolean);
  return doc;
}
function buildChildTerm(printCenter, template, generatedAt) {
  const doc = buildChildWeekly(printCenter, template, generatedAt);
  doc.title = text(`${childForTemplate(printCenter, template)?.firstName || 'Child'}'s Term Plan`);
  doc.footerRole = doc.title;
  const termSections = buildTermPlan(printCenter, template, generatedAt).sections || [];
  doc.sections = [...termSections, ...(doc.sections || []).slice(1, 3)];
  return doc;
}
export {
  buildChildTerm,
  buildChildWeekly,
  buildDesignedWeek,
  buildHouseholdWeekly,
  buildMonthCalendar,
  buildTermPlan,
  cleanDesignedAssignment,
  designedAssignmentForForm,
  designedWeekForms,
  sortFormLabels,
};
