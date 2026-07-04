const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const MOVEABLE_FEASTS = [
  { id: "triodion-start", name: "Triodion Begins", offset: -70, rank: "season" },
  { id: "meatfare-sunday", name: "Sunday of the Last Judgment / Meatfare", offset: -56, rank: "season" },
  { id: "cheesefare-sunday", name: "Forgiveness Sunday / Cheesefare", offset: -49, rank: "season" },
  { id: "clean-monday", name: "Clean Monday / Great Lent Begins", offset: -48, rank: "fast" },
  { id: "sunday-of-orthodoxy", name: "Sunday of Orthodoxy", offset: -42, rank: "season" },
  { id: "great-lent-ends", name: "Great Lent Ends", offset: -9, rank: "fast" },
  { id: "lazarus-saturday", name: "Lazarus Saturday", offset: -8, rank: "great" },
  { id: "palm-sunday", name: "Entry of the Lord into Jerusalem / Palm Sunday", offset: -7, rank: "great" },
  { id: "holy-monday", name: "Holy Monday", offset: -6, rank: "holy-week" },
  { id: "holy-tuesday", name: "Holy Tuesday", offset: -5, rank: "holy-week" },
  { id: "holy-wednesday", name: "Holy Wednesday", offset: -4, rank: "holy-week" },
  { id: "holy-thursday", name: "Holy Thursday", offset: -3, rank: "holy-week" },
  { id: "holy-friday", name: "Holy Friday", offset: -2, rank: "holy-week" },
  { id: "holy-saturday", name: "Holy Saturday", offset: -1, rank: "holy-week" },
  { id: "pascha", name: "Pascha", offset: 0, rank: "great" },
  { id: "bright-monday", name: "Bright Monday", offset: 1, rank: "bright-week" },
  { id: "bright-friday", name: "Bright Friday", offset: 5, rank: "bright-week" },
  { id: "mid-pentecost", name: "Mid-Pentecost", offset: 24, rank: "season" },
  { id: "ascension", name: "Ascension of the Lord", offset: 39, rank: "great" },
  { id: "pentecost", name: "Pentecost / Holy Trinity", offset: 49, rank: "great" },
  { id: "all-saints", name: "All Saints", offset: 56, rank: "season" },
  { id: "apostles-fast-start", name: "Apostles' Fast Begins", offset: 57, rank: "fast" }
];

export const FIXED_FEASTS = [
  { id: "circumcision", name: "Circumcision of the Lord / St. Basil", month: 1, day: 1, rank: "great" },
  { id: "theophany", name: "Theophany", month: 1, day: 6, rank: "great" },
  { id: "meeting-lord", name: "Meeting of the Lord", month: 2, day: 2, rank: "great" },
  { id: "annunciation", name: "Annunciation", month: 3, day: 25, rank: "great" },
  { id: "apostles-fast-ends", name: "Apostles' Fast Ends", month: 6, day: 28, rank: "fast" },
  { id: "apostles-peter-paul", name: "Holy Apostles Peter and Paul", month: 6, day: 29, rank: "major" },
  { id: "dormition-fast-begins", name: "Dormition Fast Begins", month: 8, day: 1, rank: "fast" },
  { id: "transfiguration", name: "Transfiguration", month: 8, day: 6, rank: "great" },
  { id: "dormition-fast-ends", name: "Dormition Fast Ends", month: 8, day: 14, rank: "fast" },
  { id: "dormition", name: "Dormition of the Theotokos", month: 8, day: 15, rank: "great" },
  { id: "nativity-theotokos", name: "Nativity of the Theotokos", month: 9, day: 8, rank: "great" },
  { id: "exaltation-cross", name: "Exaltation of the Cross", month: 9, day: 14, rank: "great" },
  { id: "protection-theotokos", name: "Protection of the Theotokos", month: 10, day: 1, rank: "major" },
  { id: "nativity-fast-begins", name: "Nativity Fast Begins", month: 11, day: 15, rank: "fast" },
  { id: "entrance-theotokos", name: "Entrance of the Theotokos", month: 11, day: 21, rank: "great" },
  { id: "nativity-fast-ends", name: "Nativity Fast Ends", month: 12, day: 24, rank: "fast" },
  { id: "nativity-christ", name: "Nativity of Christ", month: 12, day: 25, rank: "great" }
];

function pad(value) {
  return String(value).padStart(2, "0");
}

export function gregorianToJdn(year, month, day) {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
}

export function julianToJdn(year, month, day) {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - 32083;
}

export function jdnToGregorian(jdn) {
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  const day = e - Math.floor((153 * m + 2) / 5) + 1;
  const month = m + 3 - 12 * Math.floor(m / 10);
  const year = 100 * b + d - 4800 + Math.floor(m / 10);
  return { year, month, day };
}

export function isoFromGregorianDate(date) {
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`;
}

export function displayDate(date) {
  return `${MONTH_NAMES[date.month - 1]} ${date.day}, ${date.year}`;
}

export function addDaysToIso(iso, days) {
  const [year, month, day] = iso.split("-").map(Number);
  return isoFromGregorianDate(jdnToGregorian(gregorianToJdn(year, month, day) + days));
}

export function orthodoxPascha(year) {
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);
  const day = ((d + e + 114) % 31) + 1;
  const civil = jdnToGregorian(julianToJdn(year, month, day));
  return {
    id: "pascha",
    name: "Pascha",
    type: "moveable",
    julianDate: { year, month, day },
    date: isoFromGregorianDate(civil),
    displayDate: displayDate(civil)
  };
}

function calendarKey(calendar) {
  return String(calendar || "julian").toLowerCase().includes("gregorian") ? "gregorian" : "julian";
}

export function fixedFeastDateForCivilYear(feast, year, calendar = "julian") {
  const key = calendarKey(calendar);
  if (key === "gregorian") {
    const civil = { year, month: feast.month, day: feast.day };
    return { ...civil, sourceYear: year };
  }

  for (const sourceYear of [year - 1, year, year + 1]) {
    const civil = jdnToGregorian(julianToJdn(sourceYear, feast.month, feast.day));
    if (civil.year === year) return { ...civil, sourceYear };
  }

  const fallback = jdnToGregorian(julianToJdn(year, feast.month, feast.day));
  return { ...fallback, sourceYear: year };
}

export function fixedFeastsForYear(year, calendar = "julian") {
  const key = calendarKey(calendar);
  return FIXED_FEASTS.map((feast) => {
    const civil = fixedFeastDateForCivilYear(feast, year, key);
    return {
      ...feast,
      type: "fixed",
      calendar: key,
      date: isoFromGregorianDate(civil),
      displayDate: displayDate(civil),
      sourceDate: key === "julian" ? `Julian ${MONTH_NAMES[feast.month - 1]} ${feast.day}, ${civil.sourceYear}` : `Revised-Julian ${MONTH_NAMES[feast.month - 1]} ${feast.day}, ${year}`
    };
  }).sort((a, b) => a.date.localeCompare(b.date));
}

export function moveableFeastsForYear(year) {
  const pascha = orthodoxPascha(year);
  return MOVEABLE_FEASTS.map((feast) => {
    const date = addDaysToIso(pascha.date, feast.offset);
    const [civilYear, civilMonth, civilDay] = date.split("-").map(Number);
    return {
      ...feast,
      type: "moveable",
      calendar: "julian-paschalion",
      date,
      displayDate: displayDate({ year: civilYear, month: civilMonth, day: civilDay }),
      paschaYear: year
    };
  }).sort((a, b) => a.date.localeCompare(b.date));
}

export function liturgicalFeastsForYear(year, calendar = "julian") {
  const key = calendarKey(calendar);
  return [...moveableFeastsForYear(year), ...fixedFeastsForYear(year, key)]
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}

export function nextLiturgicalFeast(calendar = "julian", fromDate = new Date()) {
  const key = calendarKey(calendar);
  const year = fromDate.getFullYear();
  const todayIso = `${fromDate.getFullYear()}-${pad(fromDate.getMonth() + 1)}-${pad(fromDate.getDate())}`;
  return [year, year + 1]
    .flatMap((feastYear) => liturgicalFeastsForYear(feastYear, key))
    .filter((feast) => feast.date >= todayIso)
    .sort((a, b) => a.date.localeCompare(b.date))[0] || null;
}

export function calendarLabel(calendar = "julian") {
  return calendarKey(calendar) === "gregorian" ? "Revised-Julian" : "Julian";
}
