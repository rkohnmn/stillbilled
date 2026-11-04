// A made-up Chase-style card export, generated the same way every time, so people can try
// Stillbilled without uploading anything. Every merchant amount here is invented for the demo.
// It deliberately contains each kind of finding: price rises, a first charge at a new price,
// a stopped subscription, a yearly charge, overlapping video services, a bill, a double charge
// and a double charge that was refunded.

import { addDays, addMonths } from './dates.js';

export const SAMPLE_NAME = 'sample-card-statement.csv';
export const SAMPLE_END = '2026-10-24';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rows are { date, desc, category, type, cents } with cents negative for money out, like the real file. */
/** `recurring: false` leaves out every planted finding and keeps only everyday spending (used to test for false alarms). */
export function sampleRows({ seed = 2026, recurring = true } = {}) {
  const rand = mulberry32(seed);
  const rows = [];
  const add = (date, desc, category, type, cents) => {
    if (date <= SAMPLE_END) rows.push({ date, desc, category, type, cents });
  };
  const monthlyOn = (start, count, fn) => {
    for (let i = 0; i < count; i++) fn(addMonths(start, i), i);
  };
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const between = (lo, hi) => Math.round(lo + rand() * (hi - lo));

  // Recurring charges
  if (recurring) {
    monthlyOn('2025-08-05', 15, (d, i) => add(d, 'NETFLIX.COM', 'Entertainment', 'Sale', i < 7 ? -1549 : -1799));
    monthlyOn('2025-08-12', 15, (d, i) => add(d, 'SPOTIFY USA', 'Entertainment', 'Sale', i < 5 ? -1099 : -1199));
    monthlyOn('2025-08-18', 15, (d) => add(d, 'HULU 877-8244858 CA', 'Entertainment', 'Sale', -1799));
    monthlyOn('2025-08-21', 15, (d, i) => add(d, 'DISNEY PLUS', 'Entertainment', 'Sale', i < 14 ? -1399 : -1599));
    monthlyOn('2025-08-02', 6, (d) => add(d, 'PEACOCK PREMIUM', 'Entertainment', 'Sale', -799));
    monthlyOn('2025-08-28', 15, (d) => add(d, 'PLANET FITNESS CLUB 0412', 'Health & Wellness', 'Sale', -2499));
    monthlyOn('2025-08-01', 15, (d) => add(d, 'APPLE.COM/BILL', 'Shopping', 'Sale', -299));
    monthlyOn('2025-08-03', 15, (d) => add(d, 'VERIZON WIRELESS PAYMENTS', 'Bills & Utilities', 'Sale', -8500));
    add('2025-08-14', 'ADOBE *CREATIVE CLOUD', 'Professional Services', 'Sale', -23988);
    add('2026-08-14', 'ADOBE *CREATIVE CLOUD', 'Professional Services', 'Sale', -23988);

    // Mistakes
    add('2026-09-14', 'SQ *BISTRO NORTH SEATTLE WA', 'Food & Drink', 'Sale', -6240);
    add('2026-09-14', 'SQ *BISTRO NORTH SEATTLE WA', 'Food & Drink', 'Sale', -6240);
    add('2026-10-03', 'THE HOME DEPOT #4410', 'Home', 'Sale', -12817);
    add('2026-10-04', 'THE HOME DEPOT #4410', 'Home', 'Sale', -12817);
    add('2026-10-09', 'THE HOME DEPOT #4410', 'Home', 'Return', 12817);
  }

  // Everyday spending: this is the noise a good detector must not flag
  for (let d = '2025-08-02'; d <= SAMPLE_END; d = addDays(d, 7)) {
    add(addDays(d, Math.floor(rand() * 3)), "TRADER JOE'S #123", 'Groceries', 'Sale', -between(3200, 9800));
    if (rand() < 0.5) add(addDays(d, 3 + Math.floor(rand() * 3)), 'WHOLE FOODS MKT #10234', 'Groceries', 'Sale', -between(1800, 7600));
  }
  for (let d = '2025-08-04'; d <= SAMPLE_END; d = addDays(d, 14)) {
    add(addDays(d, Math.floor(rand() * 4)), 'SHELL OIL 57444 SEATTLE WA', 'Gas', 'Sale', -between(3400, 5200));
  }
  for (let d = '2025-08-01'; d <= SAMPLE_END; d = addDays(d, 2)) {
    if (rand() < 0.65) add(d, pick(['SQ *BLUE BOTTLE COFFEE', 'SQ *BLUE BOTTLE COFFEE', 'STARBUCKS STORE 1234']), 'Food & Drink', 'Sale', -pick([450, 475, 550, 650]));
  }
  for (let d = '2025-08-03'; d <= SAMPLE_END; d = addDays(d, 5)) {
    if (rand() < 0.7) add(addDays(d, Math.floor(rand() * 4)), pick(['AMAZON.COM*2K4XY9', 'AMZN MKTP US*1A2B3C', 'AMAZON.COM*7QP0LL']), 'Shopping', 'Sale', -between(900, 12900));
  }
  for (let d = '2025-08-09'; d <= SAMPLE_END; d = addDays(d, 11)) {
    add(addDays(d, Math.floor(rand() * 5)), pick(['UBER   *TRIP', 'LYFT   *RIDE']), 'Travel', 'Sale', -between(900, 3200));
    add(addDays(d, 2), pick(['CVS/PHARMACY #07210', 'WALGREENS #4421']), 'Health & Wellness', 'Sale', -between(500, 4200));
  }
  for (let d = '2025-08-08'; d <= SAMPLE_END; d = addDays(d, 9)) {
    add(addDays(d, Math.floor(rand() * 4)), pick(['TST* LOCAL DINER', 'SQ *TACO STAND', 'DOORDASH*THAI PALACE', 'PIZZERIA UNO 0031']), 'Food & Drink', 'Sale', -between(1800, 6400));
  }

  // Card payments (money in)
  monthlyOn('2025-08-25', 15, (d) => add(d, 'AUTOMATIC PAYMENT - THANK YOU', '', 'Payment', between(120000, 190000)));

  return rows;
}

const mdy = (iso) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
const money = (cents) => (cents / 100).toFixed(2);
const q = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** The sample as CSV text in the layout Chase uses for card exports, newest first. */
export function sampleCSV() {
  const rows = sampleRows().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const lines = ['Transaction Date,Post Date,Description,Category,Type,Amount,Memo'];
  for (const r of rows) {
    lines.push([mdy(r.date), mdy(addDays(r.date, 1)), q(r.desc), q(r.category), r.type, money(r.cents), ''].join(','));
  }
  return lines.join('\n') + '\n';
}
