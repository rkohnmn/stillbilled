import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../../js/core/detect.js';
import { addDays } from '../../js/core/dates.js';
import { every, monthly, rng, shuffle, tx } from './helpers.js';

const find = (r, re) => r.series.find((s) => re.test(s.merchantKey));
const findAny = (r, re) => [...r.series, ...r.stopped].find((s) => re.test(s.merchantKey));

test('empty input gives an empty, well-formed result', () => {
  const r = analyze([]);
  assert.equal(r.series.length, 0);
  assert.equal(r.range, null);
  assert.equal(r.totals.activeCount, 0);
  assert.deepEqual(r.doubles, []);
  assert.equal(analyze([{ id: 'x', date: '2026-01-01', cents: 0, desc: 'ZERO' }]).counts.transactions, 0);
});

test('a monthly subscription: cadence, yearly cost, next charge date', () => {
  const r = analyze(monthly('2026-01-12', 10, 1199, 'SPOTIFY USA'));
  assert.equal(r.series.length, 1);
  const s = r.series[0];
  assert.equal(s.cadence.id, 'monthly');
  assert.equal(s.cents, 1199);
  assert.equal(s.annualCents, 14388);
  assert.equal(s.monthlyCents, 1199);
  assert.equal(s.charges.length, 10);
  assert.equal(s.firstDate, '2026-01-12');
  assert.equal(s.lastDate, '2026-10-12');
  assert.equal(s.nextDate, '2026-11-12');
  assert.equal(s.confidence, 'high');
  assert.equal(s.active, true);
  assert.equal(s.kind, 'subscription');
  assert.equal(s.latestChange, null);
  assert.equal(r.totals.annualCents, 14388);
});

test('a charge on the 31st stays one monthly series across short months', () => {
  const r = analyze(monthly('2026-01-31', 10, 2999, 'ACME ATHLETIC CLUB'));
  assert.equal(r.series.length, 1);
  assert.equal(r.series[0].charges.length, 10);
  assert.equal(r.series[0].cadence.id, 'monthly');
});

test('charges that land a few days late (weekends, holidays) still chain', () => {
  const dates = ['2026-01-05', '2026-02-07', '2026-03-05', '2026-04-08', '2026-05-05', '2026-06-06'];
  const r = analyze(dates.map((d) => tx(d, 999, 'SOME APP')));
  assert.equal(r.series.length, 1);
  assert.equal(r.series[0].charges.length, 6);
});

test('one missed cycle is tolerated and lowers regularity', () => {
  const t = monthly('2026-01-05', 8, 1500, 'GREEN VALLEY STORAGE').filter((_, i) => i !== 4);
  const r = analyze(t);
  assert.equal(r.series.length, 1);
  assert.equal(r.series[0].charges.length, 7);
  assert.ok(r.series[0].regularity < 1);
});

test('weekly, every two weeks, quarterly and yearly rhythms', () => {
  const t = [
    ...every('2026-01-03', 7, 12, 4000, 'DOG WALKER LLC'),
    ...every('2026-01-04', 14, 8, 12000, 'HOUSE CLEANERS INC'),
    ...monthly('2026-01-15', 4, 8900, 'GLOBEX INSURANCE', { offset: 0 }).map((x, i) => ({ ...x, date: addDays('2025-10-15', i * 91) })),
    tx('2025-10-20', 9900, 'ADOBE *CREATIVE CLOUD'),
    tx('2026-10-20', 9900, 'ADOBE *CREATIVE CLOUD'),
  ];
  const r = analyze(t, { asOf: '2026-10-25' });
  const ids = (re) => findAny(r, re)?.cadence.id;
  assert.equal(ids(/DOG WALKER/), 'weekly');
  assert.equal(ids(/HOUSE CLEANERS/), 'biweekly');
  assert.equal(ids(/GLOBEX/), 'quarterly');
  assert.equal(ids(/ADOBE/), 'annual');
  assert.equal(findAny(r, /ADOBE/).annualCents, 9900);
  assert.equal(findAny(r, /DOG WALKER/).annualCents, Math.round(4000 * (365.25 / 7)));
});

test('a price increase is reported with the yearly cost of the difference', () => {
  const t = [...monthly('2026-01-05', 6, 1549, 'NETFLIX.COM'), ...monthly('2026-01-05', 4, 1799, 'NETFLIX.COM', { offset: 6 })];
  const r = analyze(t);
  assert.equal(r.series.length, 1, 'one subscription, not two');
  const s = r.series[0];
  assert.equal(s.cents, 1799);
  assert.equal(s.latestChange.fromCents, 1549);
  assert.equal(s.latestChange.toCents, 1799);
  assert.equal(s.latestChange.deltaCents, 250);
  assert.equal(s.latestChange.date, '2026-07-05');
  assert.equal(s.latestChange.pct, 16.1);
  assert.equal(s.increaseExtraPerYearCents, 3000);
  assert.equal(s.paidExtraCents, 1000);
  assert.equal(r.totals.increaseCount, 1);
  assert.equal(r.totals.increaseExtraPerYearCents, 3000);
  assert.equal(s.changes.length, 1);
});

test('a first charge at a new price is enough to flag the increase', () => {
  const t = [...monthly('2026-01-05', 9, 1549, 'NETFLIX.COM'), tx('2026-10-05', 1799, 'NETFLIX.COM')];
  const r = analyze(t);
  assert.equal(r.series.length, 1);
  assert.equal(r.series[0].latestChange.toCents, 1799);
  assert.equal(r.series[0].charges.length, 10);
});

test('the same works for a merchant that is not a known brand', () => {
  const t = [...monthly('2026-01-09', 6, 3500, 'RIVERSIDE DANCE STUDIO'), tx('2026-07-09', 3900, 'RIVERSIDE DANCE STUDIO')];
  const r = analyze(t);
  assert.equal(r.series.length, 1);
  assert.equal(r.series[0].latestChange?.deltaCents, 400);
});

test('a price decrease is a change but not an increase', () => {
  const t = [...monthly('2026-01-05', 4, 1999, 'STREAMBOX'), ...monthly('2026-01-05', 4, 1499, 'STREAMBOX', { offset: 4 })];
  const r = analyze(t);
  const s = find(r, /STREAMBOX/);
  assert.equal(s.latestChange.deltaCents, -500);
  assert.equal(s.increaseExtraPerYearCents, 0);
  assert.equal(r.totals.increaseCount, 0);
});

test('tiny amount wobble (rounding, tax) is not a price change', () => {
  const t = monthly('2026-01-05', 8, (i) => 1000 + (i % 2), 'LOCAL PAPER');
  const r = analyze(t);
  assert.equal(r.series.length, 1);
  assert.equal(r.series[0].latestChange, null);
});

test('two prices from different services at one merchant are not merged into a fake price change', () => {
  const t = [...monthly('2026-01-01', 10, 299, 'APPLE.COM/BILL'), ...monthly('2026-01-14', 10, 999, 'APPLE.COM/BILL')];
  const r = analyze(t);
  const apple = r.series.filter((s) => s.merchantKey === 'APPLE BILL');
  assert.equal(apple.length, 2);
  assert.deepEqual(apple.map((s) => s.cents).sort((a, b) => a - b), [299, 999]);
  assert.ok(apple.every((s) => s.latestChange === null));
  assert.equal(new Set(apple.map((s) => s.id)).size, 2, 'ids must stay unique');
});

test('a subscription that stopped appears under stopped, not in the yearly total', () => {
  const t = [...monthly('2026-01-05', 5, 799, 'PEACOCK'), ...monthly('2026-01-12', 10, 1199, 'SPOTIFY USA')];
  const r = analyze(t);
  assert.equal(r.series.length, 1);
  assert.equal(r.stopped.length, 1);
  assert.equal(r.stopped[0].merchantKey, 'PEACOCK');
  assert.equal(r.totals.annualCents, 14388);
});

test('a short statement does not mistake a recently-billed subscription for a stopped one', () => {
  const r = analyze(monthly('2026-08-20', 3, 1199, 'SPOTIFY USA'), { asOf: '2026-10-24' });
  assert.equal(r.series.length, 1);
  assert.equal(r.series[0].active, true);
});

test('shopping, coffee and gas habits are not recurring charges', () => {
  const rand = rng(3);
  const t = [];
  for (let i = 0; i < 80; i++) t.push(tx(addDays('2026-01-01', Math.floor(rand() * 290)), 2000 + Math.floor(rand() * 9000), 'TRADER JOES #123'));
  for (let i = 0; i < 90; i++) t.push(tx(addDays('2026-01-01', i * 3), 450, 'BLUE BOTTLE COFFEE'));
  for (let i = 0; i < 20; i++) t.push(tx(addDays('2026-01-04', i * 7), 4000 + Math.floor(rand() * 1500), 'SHELL OIL'));
  const r = analyze(t);
  assert.deepEqual(r.series.map((s) => s.merchantKey), []);
});

test('transfers and card payments are never audited', () => {
  const t = [
    ...monthly('2026-01-01', 8, 50000, 'ONLINE TRANSFER TO SAVINGS'),
    ...monthly('2026-01-02', 8, 20000, 'CREDIT CARD PAYMENT'),
    ...monthly('2026-01-03', 8, -30000, 'AUTOMATIC PAYMENT - THANK YOU'),
  ];
  const r = analyze(t);
  assert.equal(r.series.length, 0);
  assert.equal(r.counts.spending, 0);
});

test('only two charges: shown, with low confidence, for an unknown merchant', () => {
  const r = analyze([tx('2026-01-05', 4999, 'LAKESIDE YOGA'), tx('2026-02-05', 4999, 'LAKESIDE YOGA')]);
  assert.equal(r.series.length, 1);
  assert.equal(r.series[0].confidence, 'low');
});

test('two charges at a known subscription brand are medium confidence', () => {
  const r = analyze([tx('2026-01-05', 1549, 'NETFLIX.COM'), tx('2026-02-05', 1549, 'NETFLIX.COM')]);
  assert.equal(r.series.length, 1);
  assert.notEqual(r.series[0].confidence, 'low');
});

test('one charge is never a subscription', () => {
  assert.equal(analyze([tx('2026-01-05', 1549, 'NETFLIX.COM')]).series.length, 0);
});

test('bill-like merchants are labelled bills and counted separately', () => {
  const t = [...monthly('2026-01-03', 10, 8500, 'VERIZON WIRELESS'), ...monthly('2026-01-09', 10, 999, 'SPOTIFY USA')];
  const r = analyze(t);
  assert.equal(find(r, /VERIZON/).kind, 'bill');
  assert.equal(find(r, /SPOTIFY/).kind, 'subscription');
  assert.equal(r.totals.billAnnualCents, 8500 * 12);
  assert.equal(r.totals.subscriptionAnnualCents, 999 * 12);
});

// ---------- double charges ----------

test('same merchant, same amount, same day: a likely double charge', () => {
  const r = analyze([tx('2026-09-14', 6240, 'SQ *BISTRO NORTH'), tx('2026-09-14', 6240, 'SQ *BISTRO NORTH')]);
  assert.equal(r.doubles.length, 1);
  assert.equal(r.doubles[0].confidence, 'likely');
  assert.equal(r.doubles[0].extraCents, 6240);
  assert.equal(r.totals.doubleExtraCents, 6240);
});

test('within three days is possible, four days is not flagged', () => {
  const near = analyze([tx('2026-09-14', 6240, 'BISTRO NORTH'), tx('2026-09-17', 6240, 'BISTRO NORTH')]);
  assert.equal(near.doubles.length, 1);
  assert.equal(near.doubles[0].confidence, 'possible');
  const far = analyze([tx('2026-09-14', 6240, 'BISTRO NORTH'), tx('2026-09-18', 6240, 'BISTRO NORTH')]);
  assert.equal(far.doubles.length, 0);
});

test('small repeats (two coffees) are not double charges', () => {
  assert.equal(analyze([tx('2026-09-14', 450, 'COFFEE CART'), tx('2026-09-14', 450, 'COFFEE CART')]).doubles.length, 0);
});

test('different amounts are not double charges', () => {
  assert.equal(analyze([tx('2026-09-14', 6240, 'BISTRO NORTH'), tx('2026-09-14', 6241, 'BISTRO NORTH')]).doubles.length, 0);
});

test('a merchant that repeats the same pair often is a habit, not a mistake', () => {
  const t = [];
  for (let i = 0; i < 5; i++) {
    t.push(tx(addDays('2026-01-01', i * 40), 1250, 'LUNCH TRUCK'));
    t.push(tx(addDays('2026-01-01', i * 40), 1250, 'LUNCH TRUCK'));
  }
  assert.equal(analyze(t).doubles.length, 0);
});

test('a double charge that was refunded is marked and left out of the total', () => {
  const t = [tx('2026-10-03', 12817, 'HOME DEPOT #4410'), tx('2026-10-04', 12817, 'HOME DEPOT #4410'), tx('2026-10-09', -12817, 'HOME DEPOT RETURN #4410')];
  const r = analyze(t);
  assert.equal(r.doubles.length, 1);
  assert.ok(r.doubles[0].refunded);
  assert.equal(r.doubles[0].refunded.cents, 12817);
  assert.equal(r.totals.doubleCount, 0);
  assert.equal(r.totals.doubleExtraCents, 0);
});

// ---------- overlaps ----------

test('several subscriptions in a category where people double up are grouped', () => {
  const t = [
    ...monthly('2026-01-05', 10, 1799, 'NETFLIX.COM'),
    ...monthly('2026-01-18', 10, 1899, 'HULU'),
    ...monthly('2026-01-21', 10, 1399, 'DISNEY PLUS'),
    ...monthly('2026-01-12', 10, 1199, 'SPOTIFY USA'),
  ];
  const r = analyze(t);
  assert.equal(r.overlaps.length, 1);
  assert.equal(r.overlaps[0].category, 'video');
  assert.equal(r.overlaps[0].members.length, 3);
  assert.equal(r.overlaps[0].annualCents, (1799 + 1899 + 1399) * 12);
});

test('unknown merchants are never grouped by guesswork', () => {
  const t = [...monthly('2026-01-05', 10, 1799, 'STREAMLY'), ...monthly('2026-01-18', 10, 1899, 'FLIXMATE')];
  assert.equal(analyze(t).overlaps.length, 0);
});

// ---------- properties ----------

test('the result does not depend on the order of the input', () => {
  const t = [
    ...monthly('2026-01-05', 6, 1549, 'NETFLIX.COM'), ...monthly('2026-01-05', 4, 1799, 'NETFLIX.COM', { offset: 6 }),
    ...monthly('2026-01-12', 10, 1199, 'SPOTIFY USA'), ...every('2026-01-03', 7, 12, 4000, 'DOG WALKER LLC'),
    tx('2026-09-14', 6240, 'BISTRO NORTH'), tx('2026-09-14', 6240, 'BISTRO NORTH'),
  ];
  const a = analyze(t, { asOf: '2026-10-24' });
  const b = analyze(shuffle(t, 11), { asOf: '2026-10-24' });
  const strip = (r) => JSON.parse(JSON.stringify(r, (k, v) => (k === 'id' && /^t\d+$/.test(v) ? undefined : v)));
  assert.deepEqual(strip(b).series.map((s) => [s.id, s.cents, s.charges.length]), strip(a).series.map((s) => [s.id, s.cents, s.charges.length]));
  assert.equal(b.totals.annualCents, a.totals.annualCents);
  assert.equal(b.doubles.length, a.doubles.length);
});

test('every charge belongs to at most one detected subscription', () => {
  const t = [...monthly('2026-01-01', 10, 299, 'APPLE.COM/BILL'), ...monthly('2026-01-14', 10, 999, 'APPLE.COM/BILL'), ...monthly('2026-01-05', 10, 1549, 'NETFLIX.COM')];
  const r = analyze(t);
  const seen = new Set();
  for (const s of [...r.series, ...r.stopped]) for (const c of s.charges) {
    assert.equal(seen.has(c.id), false, `charge ${c.id} appears twice`);
    seen.add(c.id);
  }
});

const letters = (n) => {
  let s = '';
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
};

test('copes with a large history quickly', () => {
  const rand = rng(5);
  const t = [];
  for (let i = 0; i < 40000; i++) t.push(tx(addDays('2020-01-01', Math.floor(rand() * 2500)), 100 + Math.floor(rand() * 20000), `SHOP ${letters(Math.floor(rand() * 400))} CITY`));
  t.push(...monthly('2021-01-05', 60, 1549, 'NETFLIX.COM'));
  const started = Date.now();
  const r = analyze(t);
  assert.ok(Date.now() - started < 3000, `took ${Date.now() - started}ms`);
  assert.ok(findAny(r, /NETFLIX/));
});

test('a merchant someone visits constantly does not produce coincidental "subscriptions"', () => {
  const rand = rng(6);
  const t = [];
  for (let i = 0; i < 6000; i++) t.push(tx(addDays('2020-01-01', Math.floor(rand() * 2500)), 100 + Math.floor(rand() * 20000), 'AMAZON.COM*AB12'));
  assert.equal(analyze(t).series.length, 0);
});

test('a bundled bill (Apple) still finds its subscriptions among one-off purchases', () => {
  const rand = rng(9);
  const t = [...monthly('2026-01-03', 10, 299, 'APPLE.COM/BILL')];
  for (let i = 0; i < 12; i++) t.push(tx(addDays('2026-01-01', Math.floor(rand() * 290)), 400 + Math.floor(rand() * 9000), 'APPLE.COM/BILL'));
  const r = analyze(t);
  assert.ok(r.series.some((s) => s.merchantKey === 'APPLE BILL' && s.cents === 299 && s.charges.length >= 10));
});

test('notes: a short range is explained', () => {
  const r = analyze(monthly('2026-09-01', 2, 1000, 'GYM'));
  assert.ok(r.notes.some((n) => n.id === 'short-range'));
  assert.equal(analyze(monthly('2026-01-01', 10, 1000, 'GYM')).notes.length, 0);
});
