import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyzeFiles, currencyFrom, decisionsOf, ingestText, reingest, sessionPayload, sourcesOf } from '../../js/ui/pipeline.js';
import { serializeSession } from '../../js/parsers/index.js';
import { SAMPLE_NAME, sampleCSV } from '../../js/core/sample.js';

const fx = (name) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

test('ingestText: a readable file becomes a record with transactions and no error', () => {
  const f = ingestText({ id: 'f1', name: SAMPLE_NAME, text: sampleCSV() });
  assert.equal(f.error, null);
  assert.equal(f.format, 'csv');
  assert.ok(f.transactions.length > 500);
  assert.equal(f.info.preset.id, 'chase-card');
});

test('ingestText: an unreadable file becomes a record with a plain-language error, not an exception', () => {
  const f = ingestText({ id: 'f2', name: 'x.pdf', text: '%PDF-1.7 binary' });
  assert.equal(f.error.code, 'pdf');
  assert.match(f.error.message, /PDF/);
  assert.deepEqual(f.transactions, []);
});

test('ingestText: a CSV that cannot be mapped keeps its rows so the column dialog can open', () => {
  const f = ingestText({ id: 'f3', name: 'odd.csv', text: 'foo,bar,baz\nhello,world,there\nfoo,bar,baz\n' });
  assert.equal(f.error.code, 'no-columns');
  assert.ok(Array.isArray(f.rows) && f.rows.length >= 2);
});

test('reingest: changing the date order re-reads the same text', () => {
  const text = 'Date,Description,Amount\n03/04/2026,NETFLIX,-15.49\n05/04/2026,NETFLIX,-15.49\n';
  const a = ingestText({ id: 'f1', name: 'a.csv', text });
  assert.equal(a.transactions[0].date, '2026-03-04');
  const b = reingest(a, { dateOrder: 'DMY' }, 'en-US');
  assert.equal(b.transactions[0].date, '2026-04-03');
  assert.equal(b.options.dateOrder, 'DMY');
});

test('analyzeFiles: two overlapping exports are merged without double counting', () => {
  const a = ingestText({ id: 'f1', name: 'a.csv', text: sampleCSV() });
  const b = ingestText({ id: 'f2', name: 'b.csv', text: sampleCSV() });
  const one = analyzeFiles([a]);
  const two = analyzeFiles([a, b]);
  assert.equal(two.merged.length, one.merged.length);
  assert.equal(two.overlapRows, a.transactions.length);
  assert.equal(two.analysis.totals.annualCents, one.analysis.totals.annualCents);
});

test('analyzeFiles: a failed file is ignored, the rest still analyse', () => {
  const ok = ingestText({ id: 'f1', name: 'a.csv', text: sampleCSV() });
  const bad = ingestText({ id: 'f2', name: 'b.pdf', text: '%PDF-1.4' });
  const r = analyzeFiles([ok, bad]);
  assert.ok(r.analysis.series.length > 0);
});

test('a saved session reopens to the same findings and decisions', () => {
  const f = ingestText({ id: 'f1', name: 'a.csv', text: sampleCSV() });
  const before = analyzeFiles([f]);
  const decisions = { 'NETFLIX|monthly': { status: 'cancel' } };
  const json = serializeSession({ ...sessionPayload([f], decisions), createdAt: '2026-10-26T00:00:00.000Z' });
  const reopened = ingestText({ id: 'f9', name: 'session.json', text: json });
  assert.equal(reopened.format, 'session');
  assert.deepEqual(decisionsOf([reopened]), decisions);
  const after = analyzeFiles([reopened]);
  assert.equal(after.analysis.totals.annualCents, before.analysis.totals.annualCents);
  assert.deepEqual(after.analysis.series.map((s) => s.id), before.analysis.series.map((s) => s.id));
});

test('a session and the original statements together do not double count', () => {
  const f = ingestText({ id: 'f1', name: 'a.csv', text: sampleCSV() });
  const json = serializeSession(sessionPayload([f], {}));
  const s = ingestText({ id: 'f2', name: 's.json', text: json });
  assert.equal(analyzeFiles([f, s]).merged.length, analyzeFiles([f]).merged.length);
});

test('sourcesOf: transaction ids stay unique when two sessions are opened together', () => {
  const f = ingestText({ id: 'f1', name: 'a.csv', text: sampleCSV() });
  const json = serializeSession(sessionPayload([f], {}));
  const a = ingestText({ id: 'f2', name: 's1.json', text: json });
  const b = ingestText({ id: 'f3', name: 's2.json', text: json });
  const ids = sourcesOf([a, b]).flatMap((s) => s.transactions.map((t) => t.id));
  assert.equal(new Set(ids).size, ids.length);
});

test('currencyFrom: an OFX file that names its currency wins over the fallback', () => {
  const eur = ingestText({ id: 'f1', name: 'x.ofx', text: fx('bank-xml.ofx') });
  const csv = ingestText({ id: 'f2', name: 'a.csv', text: sampleCSV() });
  assert.equal(currencyFrom([eur], 'USD'), 'EUR');
  assert.equal(currencyFrom([csv, eur], 'GBP'), 'EUR');
  assert.equal(currencyFrom([csv], 'GBP'), 'GBP');
});

test('every fixture is readable through the same path the page uses', () => {
  for (const name of ['amex.csv', 'bank.ofx', 'bank-xml.ofx', 'bofa-checking.csv', 'capital-one.csv', 'chase-card.csv', 'european-semicolon.csv', 'quicken.qif']) {
    const f = ingestText({ id: 'f', name, text: fx(name) });
    assert.equal(f.error, null, `${name}: ${f.error?.message}`);
    assert.ok(f.transactions.length > 0, name);
  }
});
