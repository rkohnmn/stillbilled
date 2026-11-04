import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../../js/core/detect.js';
import { effectiveOverlaps, effectiveTotals } from '../../js/ui/totals.js';
import { SAMPLE_NAME, sampleCSV } from '../../js/core/sample.js';
import { ingestText, analyzeFiles } from '../../js/ui/pipeline.js';

const { analysis } = analyzeFiles([ingestText({ id: 'f1', name: SAMPLE_NAME, text: sampleCSV() })]);

test('with no decisions the totals match the engine', () => {
  const t = effectiveTotals(analysis, {});
  assert.equal(t.annualCents, analysis.totals.annualCents);
  assert.equal(t.activeCount, analysis.totals.activeCount);
  assert.equal(t.increaseExtraPerYearCents, analysis.totals.increaseExtraPerYearCents);
  assert.equal(t.doubleCount, analysis.totals.doubleCount);
  assert.equal(t.ignoredCount, 0);
});

test('ignoring a charge removes it from the yearly total and from the price-increase count', () => {
  const netflix = analysis.series.find((s) => /NETFLIX/.test(s.merchantKey));
  const t = effectiveTotals(analysis, { [netflix.id]: { status: 'ignore' } });
  assert.equal(t.annualCents, analysis.totals.annualCents - netflix.annualCents);
  assert.equal(t.increaseCount, analysis.totals.increaseCount - 1);
  assert.equal(t.increaseExtraPerYearCents, analysis.totals.increaseExtraPerYearCents - netflix.increaseExtraPerYearCents);
  assert.equal(t.ignoredCount, 1);
});

test('marking a charge keep or cancel does not change what is currently paid', () => {
  const hulu = analysis.series.find((s) => /HULU/.test(s.merchantKey));
  for (const st of ['keep', 'cancel']) {
    assert.equal(effectiveTotals(analysis, { [hulu.id]: { status: st } }).annualCents, analysis.totals.annualCents);
  }
});

test('a double charge marked fine, or ignored, leaves the count', () => {
  const bistro = analysis.doubles.find((d) => /BISTRO/.test(d.merchantKey));
  assert.equal(effectiveTotals(analysis, {}).doubleCount, 1);
  assert.equal(effectiveTotals(analysis, { [bistro.id]: { status: 'keep' } }).doubleCount, 0);
  assert.equal(effectiveTotals(analysis, { [bistro.id]: { status: 'ignore' } }).doubleExtraCents, 0);
  assert.equal(effectiveTotals(analysis, { [bistro.id]: { status: 'cancel' } }).doubleExtraCents, bistro.extraCents);
});

test('an overlap group disappears when only one service is left, and its total shrinks before that', () => {
  const video = analysis.series.filter((s) => analysis.overlaps[0].members.includes(s.id));
  assert.equal(video.length, 3);
  const one = effectiveOverlaps(analysis, { [video[0].id]: { status: 'ignore' } });
  assert.equal(one[0].members.length, 2);
  assert.equal(one[0].annualCents, analysis.overlaps[0].annualCents - video[0].annualCents);
  const none = effectiveOverlaps(analysis, { [video[0].id]: { status: 'ignore' }, [video[1].id]: { status: 'ignore' } });
  assert.equal(none.length, 0);
});

test('totals of an empty analysis are zeros', () => {
  const t = effectiveTotals(analyze([]), {});
  assert.equal(t.annualCents, 0);
  assert.equal(t.doubleCount, 0);
});
