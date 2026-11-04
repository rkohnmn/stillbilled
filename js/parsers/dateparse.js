// Date-string parsing for bank exports. Returns ISO "YYYY-MM-DD" or null.
// Numeric dates like 03/04/2026 are ambiguous between US (month first) and
// day-first locales, so callers choose an order, usually from detectDateOrder().

import { daysInMonth, makeISO } from '../core/dates.js';

const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

function twoDigitYear(y) {
  // Statements are about recent history: 00-69 => 2000s, 70-99 => 1900s.
  return y < 70 ? 2000 + y : 1900 + y;
}

function build(y, m, d) {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return makeISO(y, m, d);
}

/** Parse a date string. `order` is "MDY" or "DMY" and only matters for numeric dates with a 1-2 digit first part. */
export function parseDate(input, order = 'MDY') {
  if (input == null) return null;
  let s = String(input).trim();
  if (!s) return null;

  // OFX / compact: 20260105, 20260105120000, 20260105120000.000[-5:EST]
  let m = /^(\d{4})(\d{2})(\d{2})(?:\d{2,6})?(?:\.\d+)?(?:\[[^\]]*\])?$/.exec(s);
  if (m) return build(+m[1], +m[2], +m[3]);

  // Drop a trailing time: "2026-01-05 13:45", "01/05/2026 1:45 PM", "2026-01-05T13:45:00Z"
  s = s.replace(/[T\s]+\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?\s*(?:[AP]M)?\s*(?:Z|[+-]\d{2}:?\d{2})?$/i, '').trim();

  // ISO-like, year first: 2026-01-05, 2026/1/5, 2026.01.05
  m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) return build(+m[1], +m[2], +m[3]);

  // Numeric with separators: 01/05/2026, 5.1.26, 05-01-2026
  m = /^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    const y = m[3].length === 2 ? twoDigitYear(+m[3]) : +m[3];
    return order === 'DMY' ? build(y, b, a) : build(y, a, b);
  }

  // QIF apostrophe style: 1/5'26
  m = /^(\d{1,2})\/(\d{1,2})'(\d{2}|\d{4})$/.exec(s);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    const y = m[3].length === 2 ? twoDigitYear(+m[3]) : +m[3];
    return order === 'DMY' ? build(y, b, a) : build(y, a, b);
  }

  // 5 Jan 2026, 05-Jan-26, 5 January 2026
  m = /^(\d{1,2})[-/. ]([A-Za-z]{3,9})\.?,?[-/. ](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const mon = MONTHS[m[2].toLowerCase()];
    const y = m[3].length === 2 ? twoDigitYear(+m[3]) : +m[3];
    return mon ? build(y, mon, +m[1]) : null;
  }

  // Jan 5, 2026 / January 5 2026 / Jan 5 26
  m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{2}|\d{4})$/.exec(s);
  if (m) {
    const mon = MONTHS[m[1].toLowerCase()];
    const y = m[3].length === 2 ? twoDigitYear(+m[3]) : +m[3];
    return mon ? build(y, mon, +m[2]) : null;
  }

  return null;
}

/**
 * Decide whether numeric dates in a column are month-first or day-first.
 * If no value has a part above 12, the order is genuinely ambiguous and we
 * report that so the UI can say so instead of guessing silently.
 */
export function detectDateOrder(samples, fallback = 'MDY') {
  let firstOver12 = 0;
  let secondOver12 = 0;
  let numeric = 0;
  for (const raw of samples) {
    if (raw == null) continue;
    const s = String(raw).trim().replace(/[T\s]+\d{1,2}:\d{2}.*$/, '');
    const m = /^(\d{1,2})[-/. ](\d{1,2})(?:[-/. ]|')(\d{2}|\d{4})$/.exec(s);
    if (!m) continue;
    numeric++;
    if (+m[1] > 12) firstOver12++;
    if (+m[2] > 12) secondOver12++;
  }
  if (numeric === 0) return { order: fallback, ambiguous: false, conflict: false };
  if (firstOver12 > 0 && secondOver12 === 0) return { order: 'DMY', ambiguous: false, conflict: false };
  if (secondOver12 > 0 && firstOver12 === 0) return { order: 'MDY', ambiguous: false, conflict: false };
  if (firstOver12 > 0 && secondOver12 > 0) return { order: fallback, ambiguous: false, conflict: true };
  return { order: fallback, ambiguous: true, conflict: false };
}
