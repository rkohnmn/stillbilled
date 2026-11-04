import test from 'node:test';
import assert from 'node:assert/strict';
import { countOverlap, mergeSources } from '../../js/core/merge.js';
import { ParseError, serializeSession } from '../../js/parsers/index.js';
import { parseSession } from '../../js/parsers/session.js';

const t = (date, cents, desc, id = `${date}${cents}${desc}`) => ({ id, date, cents, desc, source: 'x' });

test('merge: overlapping exports collapse to one copy of each charge', () => {
  const a = { id: 'a', transactions: [t('2026-01-05', 1549, 'NETFLIX'), t('2026-02-05', 1549, 'NETFLIX'), t('2026-03-05', 1549, 'NETFLIX')] };
  const b = { id: 'b', transactions: [t('2026-02-05', 1549, 'NETFLIX'), t('2026-03-05', 1549, 'NETFLIX'), t('2026-04-05', 1549, 'NETFLIX')] };
  const merged = mergeSources([a, b]);
  assert.equal(merged.length, 4);
  assert.deepEqual(merged.map((x) => x.date), ['2026-01-05', '2026-02-05', '2026-03-05', '2026-04-05']);
  assert.equal(countOverlap([a, b], merged), 2);
});

test('merge: identical charges on the same day inside one file both survive', () => {
  const a = { id: 'a', transactions: [t('2026-01-05', 4250, 'BISTRO', 'a1'), t('2026-01-05', 4250, 'BISTRO', 'a2')] };
  assert.equal(mergeSources([a]).length, 2);
});

test('merge: a repeat in one file is kept even when another file shows it once', () => {
  const a = { id: 'a', transactions: [t('2026-01-05', 4250, 'BISTRO', 'a1'), t('2026-01-05', 4250, 'BISTRO', 'a2')] };
  const b = { id: 'b', transactions: [t('2026-01-05', 4250, 'BISTRO', 'b1')] };
  assert.equal(mergeSources([a, b]).length, 2);
  assert.equal(mergeSources([b, a]).length, 2);
});

test('merge: description case and spacing do not defeat overlap detection', () => {
  const a = { id: 'a', transactions: [t('2026-01-05', 1549, 'Netflix  .com')] };
  const b = { id: 'b', transactions: [t('2026-01-05', 1549, 'NETFLIX .COM')] };
  assert.equal(mergeSources([a, b]).length, 1);
});

test('merge: different amount or date is a different charge', () => {
  const a = { id: 'a', transactions: [t('2026-01-05', 1549, 'X')] };
  const b = { id: 'b', transactions: [t('2026-01-05', 1550, 'X'), t('2026-01-06', 1549, 'X')] };
  assert.equal(mergeSources([a, b]).length, 3);
});

test('merge: empty input', () => {
  assert.deepEqual(mergeSources([]), []);
  assert.deepEqual(mergeSources([{ id: 'a', transactions: [] }]), []);
});

// ---------- session files ----------

const sources = [{ name: 'chase.csv', format: 'csv', transactions: [t('2026-01-05', 1549, 'NETFLIX.COM'), t('2026-01-10', -30000, 'PAYMENT')] }];

test('session: round trip keeps transactions and decisions', () => {
  const text = serializeSession({ sources, decisions: { 'NETFLIX|monthly': { status: 'cancel' } }, createdAt: '2026-10-26T00:00:00.000Z' });
  const back = parseSession(text);
  assert.equal(back.sources.length, 1);
  assert.equal(back.sources[0].name, 'chase.csv');
  assert.equal(back.sources[0].transactions.length, 2);
  assert.deepEqual(
    back.sources[0].transactions.map(({ date, cents, desc }) => ({ date, cents, desc })),
    [{ date: '2026-01-05', cents: 1549, desc: 'NETFLIX.COM' }, { date: '2026-01-10', cents: -30000, desc: 'PAYMENT' }],
  );
  assert.deepEqual(back.decisions, { 'NETFLIX|monthly': { status: 'cancel' } });
});

test('session: the saved file carries no ids or extra fields', () => {
  const data = JSON.parse(serializeSession({ sources, decisions: {} }));
  assert.deepEqual(Object.keys(data.sources[0].transactions[0]).sort(), ['cents', 'date', 'desc']);
  assert.equal(data.app, 'stillbilled');
  assert.equal(data.schema, 1);
});

test('session: damaged, foreign and future files are refused with plain messages', () => {
  assert.throws(() => parseSession('{"app":"stillbilled",'), (e) => e instanceof ParseError && /damaged/.test(e.message));
  assert.throws(() => parseSession('{"app":"other","schema":1,"sources":[]}'), /not a Stillbilled/);
  assert.throws(() => parseSession('null'), /not a Stillbilled/);
  assert.throws(() => parseSession('{"app":"stillbilled","schema":2,"sources":[]}'), /version 2/);
  assert.throws(() => parseSession('{"app":"stillbilled","schema":1}'), /no sources/);
  assert.throws(() => parseSession('{"app":"stillbilled","schema":1,"sources":[{}]}'), /missing transactions/);
});

test('session: every transaction field is validated', () => {
  const bad = (tx) => JSON.stringify({ app: 'stillbilled', schema: 1, sources: [{ name: 'x', transactions: [tx] }] });
  assert.throws(() => parseSession(bad({ date: '2026-02-30', cents: 100, desc: 'x' })), ParseError);
  assert.throws(() => parseSession(bad({ date: '2026-01-01', cents: 1.5, desc: 'x' })), ParseError);
  assert.throws(() => parseSession(bad({ date: '2026-01-01', cents: '100', desc: 'x' })), ParseError);
  assert.throws(() => parseSession(bad({ date: '2026-01-01', cents: 0, desc: 'x' })), ParseError);
  assert.throws(() => parseSession(bad({ date: '2026-01-01', cents: 100, desc: 5 })), ParseError);
  assert.throws(() => parseSession(bad(null)), ParseError);
  assert.throws(() => parseSession(bad({ date: '2026-01-01', cents: 1e300, desc: 'x' })), ParseError);
});

test('session: decisions are whitelisted and cannot poison the object', () => {
  const text = `{"app":"stillbilled","schema":1,"sources":[],"decisions":{
    "A|monthly":{"status":"cancel"},
    "B|monthly":{"status":"hack"},
    "C|monthly":"cancel",
    "__proto__":{"status":"cancel"},
    "constructor":{"status":"keep"}}}`;
  const { decisions } = parseSession(text);
  assert.deepEqual(Object.keys(decisions).sort(), ['A|monthly', 'constructor']);
  assert.equal(Object.getPrototypeOf(decisions), Object.prototype);
  assert.equal({}.status, undefined);
});

test('session: long names and descriptions are clipped', () => {
  const text = JSON.stringify({ app: 'stillbilled', schema: 1, sources: [{ name: 'n'.repeat(500), transactions: [{ date: '2026-01-01', cents: 5, desc: 'd'.repeat(900) }] }] });
  const { sources: s } = parseSession(text);
  assert.equal(s[0].name.length, 120);
  assert.equal(s[0].transactions[0].desc.length, 200);
});
