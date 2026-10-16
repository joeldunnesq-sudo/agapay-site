import type { LearnViewSections } from './view-model-contracts.js';
import type {
  LearnViewEntity,
  LearnViewPayload,
  LearnGroupedRows,
  LearnWeeklyGroup,
} from './dashboard-view-models-composition-contracts.js';

export const ACCENTS = ['#14294a', '#6e2f2a', '#4a5a31', '#b5942f', '#34507a'];
export const RESOURCE_TYPE_STYLES: Record<string, { color: string; icon: string }> = {
  website: { color: '#14294a', icon: '↗' },
  reference: { color: '#34507a', icon: '⌕' },
  reading: { color: '#6e2f2a', icon: '☰' },
  book: { color: '#4a5a31', icon: '▤' },
  printable: { color: '#b5942f', icon: '▦' },
  audio: { color: '#6e2f2a', icon: '♪' },
  video: { color: '#14294a', icon: '▷' },
  'mixed media': { color: '#4a5a31', icon: '✥' },
  default: { color: '#b5942f', icon: '✥' },
};
export function resourceTypeStyle(value: unknown = '') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  return RESOURCE_TYPE_STYLES[normalized] || RESOURCE_TYPE_STYLES.default;
}
export function safeArray<T = LearnViewEntity>(value: T[] | null | undefined): T[];
export function safeArray<T = LearnViewEntity>(value: unknown): T[];
export function safeArray<T = LearnViewEntity>(value: unknown): T[] {
  return (Array.isArray(value) ? value : []) as T[];
}
export function saintKey(value: unknown = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/\([^)]*\b[1-2]?[0-9]{2,3}\b[^)]*\)/g, '')
    .replace(
      /\b(st|saint|ven|venerable|holy|apostle|evangelist|martyr|great|our holy|righteous|blessed|elder|prophet|hieromartyr|new martyr)\.?\b/g,
      ''
    )
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
export function saintScore(a: string = '', b: string = '') {
  const aTokens = saintKey(a)
    .split(/\s+/)
    .filter((token) => token.length > 2);
  const bTokens = saintKey(b)
    .split(/\s+/)
    .filter((token) => token.length > 2);
  if (!aTokens.length || !bTokens.length) return 0;
  const bSet = new Set(bTokens);
  let score = 0;
  aTokens.forEach((token) => {
    if (bSet.has(token)) score += 3;
    else if ([...bSet].some((other) => other.includes(token) || token.includes(other))) score += 1;
  });
  return score / Math.max(aTokens.length, bTokens.length);
}
export function saintPrecedence(value: unknown = '') {
  const text = String(value || '').toLowerCase();
  if (
    /\b(lord|theotokos|mother of god|cross|resurrection|nativity|theophany|pascha|pentecost|transfiguration|ascension|annunciation|dormition)\b/.test(
      text
    )
  )
    return 100;
  if (/\b(apostle|evangelist|forerunner|baptist)\b/.test(text)) return 90;
  if (/\b(prophet|hierarch|bishop|equal[- ]to[- ]the[- ]apostles)\b/.test(text)) return 80;
  if (/\b(great martyr|new martyr|hieromartyr|martyr|confessor)\b/.test(text)) return 70;
  if (/\b(righteous|ancestor|forefather|foremother)\b/.test(text)) return 60;
  if (/\b(venerable|abbot|abbess|monk|nun|elder|wonderworker)\b/.test(text)) return 50;
  return 40;
}
export function orderSaintNames(names: string[] = []) {
  return [...names].sort((a, b) => saintPrecedence(b) - saintPrecedence(a));
}
export function saintLikeTitle(value: unknown = '') {
  const text = String(value || '').trim();
  if (!text || /today in the church|daily orthodox rhythm|set calendar/i.test(text)) return '';
  if (saintPrecedence(text) > 40) return text;
  return /\b(st\.?|saint|holy|apostle|venerable|martyr|righteous|prophet|hierarch|elder)\b/i.test(text) ? text : '';
}
export function orderSaintStories(stories: LearnViewEntity[] = [], names: string[] = []) {
  const remaining = [...stories];
  const ordered: LearnViewEntity[] = [];
  orderSaintNames(names).forEach((name) => {
    let bestIndex = -1;
    let bestScore = 0;
    remaining.forEach((story, index) => {
      const score = Math.max(saintScore(name, story.name), saintScore(name, story.title));
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });
    if (bestIndex >= 0 && bestScore >= 0.45) {
      ordered.push(remaining[bestIndex]);
      remaining.splice(bestIndex, 1);
    }
  });
  return [...ordered, ...remaining];
}
export function annoMundiLabel(civilDate: string = '') {
  const match = String(civilDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || !month || !day) return '';
  return `Anno Mundi ${year + (month >= 9 ? 5509 : 5508)}`;
}
export function text(value: unknown, fallback: string = '') {
  return String(value || fallback);
}
export function learnDashboardHref(section: string = 'dashboard') {
  const isOdyssey = typeof document !== 'undefined' && document.body?.dataset?.learnContext === 'odyssey';
  const regular: Record<string, string> = {
    dashboard: '/myagapay/learn',
    planner: '/myagapay/learn/planner',
    formation: '/myagapay/learn/formation',
    books: '/myagapay/learn/books',
    grades: '/myagapay/learn/grades',
    community: '/myagapay/learn/community',
    'co-op': '/myagapay/learn/co-op',
    'print-center': '/myagapay/learn/print',
    onboarding: '/myagapay/learn/setup',
  };
  const odyssey: Record<string, string> = {
    dashboard: '/learn/odyssey/dashboard',
    planner: '/learn/odyssey/dashboard/planner',
    formation: '/learn/odyssey/dashboard/formation',
    books: '/learn/odyssey/dashboard/books',
    grades: '/learn/odyssey/dashboard/grades',
    community: '/learn/odyssey/dashboard/community',
    'co-op': '/learn/odyssey/dashboard/co-op',
    'print-center': '/learn/odyssey/dashboard/print',
    onboarding: '/learn/odyssey/dashboard/setup',
  };
  return (isOdyssey ? odyssey : regular)[section] || (isOdyssey ? odyssey.dashboard : regular.dashboard);
}
export function weeklyFrequencyValue(value: unknown, fallback: string = '1x') {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  if (['daily', 'weekly', '4x', '3x', '2x', '1x', 'as-needed'].includes(raw)) return raw;
  if (raw.includes('daily') || raw.includes('every')) return 'daily';
  if (raw.includes('4')) return '4x';
  if (raw.includes('3')) return '3x';
  if (raw.includes('2')) return '2x';
  if (raw.includes('as')) return 'as-needed';
  if (raw.includes('week')) return '1x';
  return fallback;
}
export function percent(value: unknown) {
  const number = Number(value || 0);
  return Math.max(0, Math.min(100, Number.isFinite(number) ? number : 0));
}
export function childName(child: LearnViewEntity = {}, index: number = 0) {
  return text(child.firstName || child.name, `Child ${index + 1}`);
}
export function childInitial(child: LearnViewEntity = {}, index: number = 0) {
  return text(child.avatarMonogram || childName(child, index).charAt(0), '?').toUpperCase();
}
export function childFormByAge(age: unknown) {
  const years = Number(age);
  if (!Number.isFinite(years)) return '';
  if (years <= 5) return 'Little Ones';
  if (years <= 8) return 'Form I';
  if (years <= 11) return 'Form II';
  if (years <= 14) return 'Form III';
  return 'Form IV';
}
export function formLabelForChild(child: LearnViewEntity = {}) {
  return text(child.formLabel || child.gradeLabel || child.form || childByAgeLabel(child.ageYears), 'Household Form');
}
export function childByAgeLabel(age: unknown) {
  return childFormByAge(age) || 'Household Form';
}
export function groupRowsByForm(rows: LearnViewEntity[] = [], dayIndex: number | null = null) {
  const groups = new Map<string, LearnGroupedRows>();
  safeArray(rows).forEach((row, index) => {
    const formLabel = formLabelForChild(row.child);
    if (!groups.has(formLabel)) {
      groups.set(formLabel, {
        formLabel,
        childNames: [],
        initials: [],
        color: ACCENTS[groups.size % ACCENTS.length],
        items: [],
        totalMinutes: 0,
      });
    }
    const group = groups.get(formLabel)!;
    const name = childName(row.child, index);
    if (!group.childNames.includes(name)) group.childNames.push(name);
    const initial = childInitial(row.child, index);
    if (!group.initials.includes(initial)) group.initials.push(initial);
    const minutes =
      dayIndex === null
        ? safeArray<number>(row.minutes).reduce((sum, value) => sum + Number(value || 0), 0)
        : Number(safeArray(row.minutes)[dayIndex] || 0);
    const status = dayIndex === null ? '' : text(safeArray<string>(row.statuses)[dayIndex], '');
    if (dayIndex === null || minutes > 0 || status === 'rest') {
      group.totalMinutes += minutes;
      group.items.push({
        id: text(row.id, ''),
        title: text(row.title, 'Lesson'),
        sub: text(row.detail || row.subtitle, ''),
        childName: name,
        minutes,
        status,
        graceModeApplied: Boolean(row.graceModeApplied),
      });
    }
  });
  return Array.from(groups.values()).filter((group) => group.items.length);
}
export function donorAccountFromStorage() {
  try {
    const donor = JSON.parse(localStorage.getItem('agapayDonorProfile') || '{}');
    const email = localStorage.getItem('agapayDonorEmail') || donor.email || '';
    const name = text(donor.donorName || email.split('@')[0], 'Faithful Member');
    const words = name.trim().split(/\s+/).filter(Boolean);
    const initials = words.length
      ? words
          .slice(0, 2)
          .map((word) => word.charAt(0))
          .join('')
          .toUpperCase()
      : 'FM';
    return {
      name,
      initials: initials || 'FM',
    };
  } catch {
    return {
      name: 'Faithful Member',
      initials: 'FM',
    };
  }
}
export function dateParts(isoDate: string) {
  const date = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return { weekday: '', short: text(isoDate), dayNumber: '' };
  return {
    weekday: new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date).toUpperCase(),
    weekdayLong: new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(date),
    short: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date),
    dayNumber: new Intl.DateTimeFormat('en-US', { day: 'numeric' }).format(date),
    isSunday: date.getDay() === 0,
  };
}
export function shellFromPayload(page: keyof LearnViewSections, payload: LearnViewPayload) {
  const section = payload?.[page] || payload?.dashboard || payload?.planner || {};
  const household = section.household || {};
  const children = safeArray(section.children);
  const name = text(household.name, 'Your Household');
  const method = text(household.primaryMethod, 'Homeschool');
  const account = donorAccountFromStorage();
  const gcalSync = section.googleCalendarSync || payload?.dashboard?.googleCalendarSync || null;
  return {
    familyName: name,
    familyInitial:
      name
        .replace(/^The\s+/i, '')
        .trim()
        .charAt(0)
        .toUpperCase() || 'F',
    familyMeta: `${children.length || household.childrenCount || 0} ${children.length === 1 ? 'Child' : 'Children'} • ${method}`,
    accountName: account.name,
    accountInitials: account.initials,
    timeLabel: text(
      household.topbarTimeLabel,
      new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date())
    ),
    gcalConfigured: gcalSync ? Boolean(gcalSync.configured !== false) : false,
    gcalConnected: Boolean(gcalSync?.connected),
    nav: [
      {
        id: 'dashboard',
        href: learnDashboardHref('dashboard'),
        label: 'Dashboard',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/></svg>',
      },
      {
        id: 'planner',
        href: learnDashboardHref('planner'),
        label: 'Planner',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="4" width="15" height="17" rx="2"/><path d="M9 3.5h6a1 1 0 0 1 1 1V6H8V4.5a1 1 0 0 1 1-1z"/><path d="M8.5 12h7M8.5 16h5"/></svg>',
      },
      {
        id: 'formation',
        href: learnDashboardHref('formation'),
        label: 'Formation',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21v-8.5"/><path d="M12 12.5c0-4-3-6.2-7-6.2 0 4 3 6.7 7 6.2z"/><path d="M12 12.5c0-4.6 3-7.7 8-7.7 0 4.6-3 8.2-8 7.7z"/></svg>',
      },
      {
        id: 'books',
        href: learnDashboardHref('books'),
        label: 'Books',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6.2c-2-1.4-4.6-2.2-7.2-2.2v13.8c2.6 0 5.2.8 7.2 2.2 2-1.4 4.6-2.2 7.2-2.2V4c-2.6 0-5.2.8-7.2 2.2z"/><path d="M12 6.2v13.8"/></svg>',
      },
      {
        id: 'grades',
        href: learnDashboardHref('grades'),
        label: 'Grades & Attendance',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5 2.5 8.3 12 13l9.5-4.7L12 3.5z"/><path d="M6.3 10.6v5.1c0 1.7 2.8 3.3 5.7 3.3s5.7-1.6 5.7-3.3v-5.1"/><path d="M21.5 8.3v6.2"/></svg>',
      },
      {
        id: 'community',
        href: learnDashboardHref('community'),
        label: 'Community',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8.7" cy="8.2" r="3.1"/><circle cx="16.3" cy="9.3" r="2.5"/><path d="M2.5 20.2c0-3.7 2.8-6.2 6.2-6.2s6.2 2.5 6.2 6.2"/><path d="M14.9 14.5c2.7.2 4.6 2.4 4.6 5.4"/></svg>',
      },
      {
        id: 'co-op',
        href: learnDashboardHref('co-op'),
        label: 'Co-op',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2.3"/><circle cx="5" cy="17.5" r="2.3"/><circle cx="19" cy="17.5" r="2.3"/><path d="M12 7.3 6.4 15.6M12 7.3l5.6 8.3M7.3 17.5h9.4"/></svg>',
        comingSoon: true,
      },
      {
        id: 'print-center',
        href: learnDashboardHref('print-center'),
        label: 'Print',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 9V3.5h11V9"/><rect x="3.5" y="9" width="17" height="8" rx="1.6"/><path d="M6.5 13.5h11v7h-11z"/></svg>',
      },
      {
        id: 'onboarding',
        href: learnDashboardHref('onboarding'),
        label: 'Set Up',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 3.2v2.6M12 18.2v2.6M4.6 4.6l1.85 1.85M17.55 17.55l1.85 1.85M3.2 12h2.6M18.2 12h2.6M4.6 19.4l1.85-1.85M17.55 6.45l1.85-1.85"/></svg>',
      },
    ],
  };
}
export function page(id: string, title: string, subtitle: string = '', ornament: boolean = true) {
  return { id, title, subtitle, ornament };
}
export function simpleList<T>(items: unknown, mapper: (item: LearnViewEntity, index: number) => T) {
  return safeArray(items).map(mapper).filter(Boolean);
}
export function weeklyAssignmentItemsFromRows(rawHouseholdRows: LearnViewEntity[], rawChildRows: LearnViewEntity[]) {
  // ── Household rows: already one-per-block, no grouping needed ──────────────
  const householdItems = safeArray(rawHouseholdRows)
    .filter(
      (row) =>
        safeArray<string>(row.statuses).some((s) => s !== 'empty') || safeArray(row.minutes).some((m) => Number(m) > 0)
    )
    .map((row, index) => ({
      id: text(row.id, `household-${index}`),
      kind: text(row.kind, 'household'),
      title: text(row.title, 'Household block'),
      sub: text(row.detail || row.subtitle, ''),
      color: text(row.color, ACCENTS[index % ACCENTS.length]),
      minutes: Number(safeArray(row.minutes).find((minutes) => Number(minutes) > 0) || row.minutesPlanned || 20),
      statuses: safeArray<string>(row.statuses),
      weeklyFrequency: text(row.weeklyFrequency || row.cadenceLabel, ''),
      gracePriority: text(row.gracePriority, 'keep'),
      graceNote: text(row.graceNote, ''),
      formLabels: ['__family'],
    }));

  // ── Child rows: group to avoid duplicates based on planning mode ───────────
  // Two levels of grouping:
  //   Level 1 — planning mode (determines card count per subject):
  //     family   → planningMode !== "forms" (or no formLabels/childIds) → one card
  //     form     → formLabels set, no childIds                          → one card per form label
  //     specific → childIds set                                         → one card, all children listed
  //   Level 2 — resources: multiple resources on the same subject collapse into
  //     one card; resource titles accumulate and are joined in the sub line.
  //     minutes/statuses are merged via per-day OR so the card is active whenever
  //     any of its resources is active.
  const grouped = new Map<string, LearnWeeklyGroup>(); // groupKey → merged card
  safeArray(rawChildRows).forEach((row, index) => {
    const planningMode = text(row.planningMode, 'forms');
    const formLabels = safeArray<string>(row.formLabels);
    const childIds = safeArray<string>(row.childIds);
    const sourceId = text(row.sourceId || row.id, `child-src-${index}`);
    const childName = text(row.child?.firstName || row.child?.name, '');
    // Prefer the explicit formLabels from the row (set by the resource assignment),
    // fall back to the child's profile label, then age-derived label.
    const childFormLabel = text(
      safeArray<string>(row.formLabels).filter((l) => l && l !== '__family')[0] ||
        (row.child ? formLabelForChild(row.child) : ''),
      ''
    );
    const resourceTitle = text(row.resourceTitle || row.detail || row.subtitle, '');
    const color = text(row.color || row.child?.color, ACCENTS[(index + rawHouseholdRows.length) % ACCENTS.length]);
    const rowMinutes = safeArray<number>(row.minutes);
    const statuses = safeArray<string>(row.statuses);
    const weeklyFreq = text(row.weeklyFrequency || row.cadenceLabel, '');
    const gracePriority = text(row.gracePriority, 'keep');
    const graceNote = text(row.graceNote, '');

    const isFamily = planningMode !== 'forms' || (!formLabels.length && !childIds.length);
    const isSpecific = childIds.length > 0;

    // Skip rows where the subject is not active this week
    const isActiveThisWeek = statuses.some((s) => s !== 'empty') || rowMinutes.some((m) => Number(m) > 0);
    if (!isActiveThisWeek) return;

    // Group key: no resourceIndex — all resources for the same subject+scope collapse
    let groupKey;
    let kind;
    if (isFamily) {
      groupKey = `family:${sourceId}`;
      kind = 'family';
    } else if (isSpecific) {
      groupKey = `specific:${sourceId}`;
      kind = 'specific';
    } else {
      const formKey = childFormLabel || formLabels[0] || 'form';
      groupKey = `form:${sourceId}:${formKey}`;
      kind = 'form';
    }

    if (grouped.has(groupKey)) {
      const existing = grouped.get(groupKey)!;
      // Accumulate child names
      if (childName && !existing._childNames.includes(childName)) {
        existing._childNames.push(childName);
      }
      // Accumulate resource titles
      if (resourceTitle && !existing._resourceTitles.includes(resourceTitle)) {
        existing._resourceTitles.push(resourceTitle);
      }
      // Merge minutes and statuses per-day via OR
      existing._minutesArr = existing._minutesArr.map((m, i) => Math.max(m, Number(rowMinutes[i] || 0)));
      existing._statusesArr = existing._statusesArr.map((s, i) => (s !== 'empty' ? s : statuses[i] || 'empty'));
    } else {
      grouped.set(groupKey, {
        id: groupKey,
        kind,
        title: text(row.title, 'Lesson'),
        _childNames: childName ? [childName] : [],
        _formLabel: isFamily ? '' : !isSpecific ? childFormLabel || formLabels[0] || '' : '',
        _formLabels: isFamily
          ? ['__family']
          : [...new Set([...(formLabels.length ? formLabels : []), childFormLabel].filter(Boolean))],
        _resourceTitles: resourceTitle ? [resourceTitle] : [],
        _minutesArr: rowMinutes.map((m) => Number(m || 0)),
        _statusesArr: [...statuses],
        color,
        weeklyFrequency: weeklyFreq,
        gracePriority,
        graceNote,
      });
    }
  });

  const childItems = Array.from(grouped.values()).map((item) => {
    const { _childNames, _formLabel, _formLabels, _resourceTitles, _minutesArr, _statusesArr, ...rest } = item;
    const resourceLine = _resourceTitles.join(', ');
    const prefixParts = [...(_childNames.length ? [_childNames.join(', ')] : _formLabel ? [_formLabel] : [])];
    const sub = [...prefixParts, resourceLine].filter(Boolean).join(' · ');
    const minutes = Math.max(..._minutesArr.filter(Boolean), 0) || (_minutesArr.find((m) => m > 0) ?? 20);
    // If a form-mode item has no resolvable form labels, fall back to the
    // derived _formLabel (used as the groupKey) so tabs still appear for it.
    const resolvedFormLabels = _formLabels.length
      ? _formLabels
      : (rest.kind === 'form' || rest.kind === 'specific') && _formLabel
        ? [_formLabel]
        : _formLabels;
    return { ...rest, sub, minutes, statuses: _statusesArr, formLabels: resolvedFormLabels };
  });

  // Household items already unique by id; child items unique by groupKey
  return [...householdItems, ...childItems].filter((item) => item.id && item.title);
}
export function plannerDaysFromWeek(week: LearnViewEntity) {
  return safeArray(week.liturgicalDays).map((day, index) => {
    const parts = dateParts(day.civilDate || safeArray<string>(week.dates)[index]);
    const familyDay = safeArray(week.familyDays)[index] || {};
    return {
      weekday: text(day.weekdayLabel || parts.weekday, ''),
      weekdayLong: text(day.weekdayLong || parts.weekdayLong, ''),
      date: text(day.civilDate || safeArray<string>(week.dates)[index], ''),
      shortDate: parts.short,
      dayNumber: parts.dayNumber,
      isSunday: Boolean(parts.isSunday),
      isFastDay: Boolean(day.isFastDay),
      feast: text(day.feastTitle, ''),
      feastRank: text(day.feastRank, ''),
      fasting: text(day.fastingRule, ''),
      fastingType: text(day.fastingType || familyDay.fastingType, ''),
      tone: text(day.tone || day.troparionTone, ''),
      epistle: text(day.epistleRef, ''),
      gospel: text(day.gospelRef, ''),
      nameDays: safeArray(familyDay.nameDays),
      events: safeArray(familyDay.events),
      meal: familyDay.meal || null,
      fastingPreference: text(familyDay.fastingPreference, 'guidance'),
    };
  });
}
