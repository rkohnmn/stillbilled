// Calendar-date arithmetic on ISO "YYYY-MM-DD" strings.
//
// Deliberately avoids the Date object for arithmetic: a bank statement date has
// no time zone, and converting through Date can shift a charge by a day around
// DST changes or when the user's zone differs from the bank's. Everything here
// is pure integer maths on the proleptic Gregorian calendar.

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const daysInMonth = (y, m) => (m === 2 && isLeap(y) ? 29 : MONTH_DAYS[m - 1]);

/** Split "YYYY-MM-DD" into numbers, or null when it is not a real calendar date. */
export function isoParts(iso) {
  if (typeof iso !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const y = +m[1];
  const mo = +m[2];
  const d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  return { y, m: mo, d };
}

export const isValidISO = (iso) => isoParts(iso) !== null;

export function makeISO(y, m, d) {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// toDay is called many thousands of times on a few thousand distinct dates, so results are memoised.
const dayCache = new Map();
const DAY_CACHE_MAX = 60000;

/** Days since 1970-01-01 (Howard Hinnant's days_from_civil). */
export function toDay(iso) {
  const hit = dayCache.get(iso);
  if (hit !== undefined) return hit;
  const z = computeDay(iso);
  if (dayCache.size >= DAY_CACHE_MAX) dayCache.clear();
  dayCache.set(iso, z);
  return z;
}

function computeDay(iso) {
  const p = isoParts(iso);
  if (!p) throw new RangeError(`Invalid date: ${iso}`);
  let { y } = p;
  const { m, d } = p;
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Inverse of toDay. */
export function fromDay(z) {
  z += 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  let y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  y += m <= 2 ? 1 : 0;
  return makeISO(y, m, d);
}

/** Whole days from a to b (positive when b is later). */
export const diffDays = (a, b) => toDay(b) - toDay(a);
export const addDays = (iso, n) => fromDay(toDay(iso) + n);

/** Add calendar months, clamping to the last day of a shorter month (Jan 31 + 1 month = Feb 28). */
export function addMonths(iso, n) {
  const { y, m, d } = isoParts(iso);
  const t = y * 12 + (m - 1) + n;
  const ny = Math.floor(t / 12);
  const nm = (((t % 12) + 12) % 12) + 1;
  return makeISO(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

export const minISO = (a, b) => (a <= b ? a : b);
export const maxISO = (a, b) => (a >= b ? a : b);

/** Local calendar date of `now` as ISO. Only place the user's clock is read. */
export function todayISO(now = new Date()) {
  return makeISO(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** Locale-formatted date. Formats in UTC so the calendar day never shifts. */
export function formatDate(iso, locale, options = { year: 'numeric', month: 'short', day: 'numeric' }) {
  const p = isoParts(iso);
  if (!p) return String(iso ?? '');
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(new Date(Date.UTC(p.y, p.m - 1, p.d)));
}

/** "Jan", "Feb"... for axis labels. */
export function monthShort(m, locale) {
  return new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, m - 1, 1)));
}
