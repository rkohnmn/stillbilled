import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../../js/core/detect.js';
import { SAMPLE_END, SAMPLE_NAME, sampleCSV, sampleRows } from '../../js/core/sample.js';
import { mergeSources } from '../../js/core/merge.js';
import { parseFile } from '../../js/parsers/index.js';

const parsed = parseFile(SAMPLE_NAME, sampleCSV());
const result = analyze(mergeSources([{ id: 'a', transactions: parsed.transactions }]));
const find = (re) => [...result.series, ...result.stopped].find((s) => re.test(s.merchantKey));

test('sample: is deterministic', () => {
  assert.equal(sampleCSV(), sampleCSV());
});

test('sample: goes through the real parser as a Chase card export', () => {
  assert.equal(parsed.info.preset.id, 'chase-card');
  assert.equal(parsed.info.dateOrder, 'MDY');
  assert.ok(parsed.transactions.length > 500, `only ${parsed.transactions.length} rows`);
  assert.equal(parsed.info.dateRange.end <= SAMPLE_END, true);
  assert.equal(parsed.info.dateRange.start, '2025-08-01');
});

test('sample: finds the planted price rises, including a first charge at the new price', () => {
  const netflix = find(/NETFLIX/);
  assert.equal(netflix.latestChange.fromCents, 1549);
  assert.equal(netflix.latestChange.toCents, 1799);
  const spotify = find(/SPOTIFY/);
  assert.equal(spotify.latestChange.deltaCents, 100);
  const disney = find(/DISNEY/);
  assert.equal(disney.latestChange.deltaCents, 200);
  assert.equal(disney.charges.filter((c) => c.cents === 1599).length, 1);
  assert.equal(result.totals.increaseCount, 3);
  assert.equal(result.totals.increaseExtraPerYearCents, 3000 + 1200 + 2400);
});

test('sample: finds recurring charges of every kind and nothing from everyday spending', () => {
  const active = result.series.map((s) => s.merchantKey).sort();
  assert.deepEqual(active, ['ADOBE', 'APPLE BILL', 'DISNEY PLUS', 'HULU', 'NETFLIX', 'PLANET FITNESS', 'SPOTIFY', 'VERIZON WIRELESS'].sort());
  assert.equal(find(/ADOBE/).cadence.id, 'annual');
  assert.equal(find(/VERIZON/).kind, 'bill');
  assert.deepEqual(result.stopped.map((s) => s.merchantKey), ['PEACOCK']);
});

test('sample: finds both double charges and sees that one was refunded', () => {
  assert.equal(result.doubles.length, 2);
  const bistro = result.doubles.find((d) => /BISTRO/.test(d.merchantKey));
  const depot = result.doubles.find((d) => /HOME DEPOT/.test(d.merchantKey));
  assert.equal(bistro.cents, 6240);
  assert.equal(bistro.refunded, null);
  assert.ok(depot.refunded);
  assert.equal(result.totals.doubleCount, 1);
  assert.equal(result.totals.doubleExtraCents, 6240);
});

test('sample: flags the video services as overlapping', () => {
  assert.equal(result.overlaps.length, 1);
  assert.equal(result.overlaps[0].category, 'video');
  assert.equal(result.overlaps[0].members.length, 3);
});

test('everyday spending alone never produces a recurring charge, across 60 different histories', () => {
  const offenders = [];
  for (let seed = 1; seed <= 60; seed++) {
    const rows = sampleRows({ seed, recurring: false });
    const txs = rows.map((r, i) => ({ id: `s${seed}:${i}`, date: r.date, cents: -r.cents, desc: r.desc }));
    const r = analyze(txs);
    for (const s of [...r.series, ...r.stopped]) offenders.push(`seed ${seed}: ${s.id} x${s.charges.length}`);
  }
  assert.deepEqual(offenders, []);
});
