const calendarFeasts: ParishCalendarFeast[] | undefined = window.AGAPAYLiturgicalCalendar?.liturgicalFeastsForYear(
  2026,
  'julian'
);
void calendarFeasts;
// @ts-expect-error Civil year must be numeric.
window.AGAPAYLiturgicalCalendar?.orthodoxPascha('2026');
// @ts-expect-error Next feast starts from a Date object.
window.AGAPAYLiturgicalCalendar?.nextLiturgicalFeast('julian', '2026-01-01');

window.AGAPAYLiturgicalCalendar?.calendarLabel();
window.AGAPAYLiturgicalCalendar?.liturgicalFeastsForYear(2026);
window.AGAPAYLiturgicalCalendar?.nextLiturgicalFeast();
