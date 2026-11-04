import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseCSV, readTable, sniffDelimiter } from '../../js/parsers/csv.js';
import { detectDateOrder, parseDate } from '../../js/parsers/dateparse.js';
import { ParseError, parseFile } from '../../js/parsers/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(here, '..', 'fixtures', name), 'utf8');
const byDesc = (txs, re) => txs.filter((t) => re.test(t.desc));

// ---------- CSV reader ----------

test('csv: quotes, escaped quotes, embedded commas and newlines', () => {
  const rows = parseCSV('a,"b,c","say ""hi""","line1\nline2",e\r\n1,2,3,4,5\r\n');
  assert.deepEqual(rows[0], ['a', 'b,c', 'say "hi"', 'line1\nline2', 'e']);
  assert.deepEqual(rows[1], ['1', '2', '3', '4', '5']);
  assert.equal(rows.length, 2);
});

test('csv: BOM, trailing empty field, old Mac line endings, no final newline', () => {
  assert.deepEqual(parseCSV('﻿a,b,\r1,2,'), [['a', 'b', ''], ['1', '2', '']]);
});

test('csv: unterminated quote does not throw or hang', () => {
  const rows = parseCSV('a,"unterminated\nb,c');
  assert.equal(rows.length, 1);
  assert.equal(rows[0][0], 'a');
});

test('csv: delimiter sniffing', () => {
  assert.equal(sniffDelimiter('a;b;c\n1;2;3\n4;5;6'), ';');
  assert.equal(sniffDelimiter('a\tb\tc\n1\t2\t3'), '\t');
  assert.equal(sniffDelimiter('a|b|c\n1|2|3'), '|');
  assert.equal(sniffDelimiter('a,b,c\n1,2,3'), ',');
  assert.equal(sniffDelimiter('sep=;\na,b,c\n1,2,3'), ';');
  assert.equal(sniffDelimiter('"1,5";"2,5";"3,5"\n"1,5";"2,5";"3,5"'), ';');
});

test('csv: readTable drops sep hint and blank rows', () => {
  const { rows, delimiter } = readTable('sep=;\na;b\n\n1;2\n');
  assert.equal(delimiter, ';');
  assert.deepEqual(rows, [['a', 'b'], ['1', '2']]);
});

// ---------- Dates ----------

test('dates: common bank formats', () => {
  assert.equal(parseDate('2026-01-05'), '2026-01-05');
  assert.equal(parseDate('2026/1/5'), '2026-01-05');
  assert.equal(parseDate('01/05/2026'), '2026-01-05');
  assert.equal(parseDate('01/05/2026', 'DMY'), '2026-05-01');
  assert.equal(parseDate('13/01/2026', 'DMY'), '2026-01-13');
  assert.equal(parseDate('13.01.2026', 'DMY'), '2026-01-13');
  assert.equal(parseDate('1/5/26'), '2026-01-05');
  assert.equal(parseDate('5 Jan 2026'), '2026-01-05');
  assert.equal(parseDate('05-Jan-26'), '2026-01-05');
  assert.equal(parseDate('Jan 5, 2026'), '2026-01-05');
  assert.equal(parseDate('January 5th, 2026'), '2026-01-05');
  assert.equal(parseDate('20260105'), '2026-01-05');
  assert.equal(parseDate('20260105120000[-5:EST]'), '2026-01-05');
  assert.equal(parseDate('2026-01-05T13:45:00Z'), '2026-01-05');
  assert.equal(parseDate('01/05/2026 1:45 PM'), '2026-01-05');
  assert.equal(parseDate("1/5'26"), '2026-01-05');
});

test('dates: invalid input returns null instead of rolling over', () => {
  assert.equal(parseDate('02/30/2026'), null);
  assert.equal(parseDate('13/13/2026'), null);
  assert.equal(parseDate('13/01/2026', 'MDY'), null);
  assert.equal(parseDate('2026-02-29'), null);
  assert.equal(parseDate('Date'), null);
  assert.equal(parseDate(''), null);
  assert.equal(parseDate(null), null);
  assert.equal(parseDate('1850-01-01'), null);
});

test('dates: order detection', () => {
  assert.deepEqual(detectDateOrder(['13/01/2026', '05/02/2026']), { order: 'DMY', ambiguous: false, conflict: false });
  assert.deepEqual(detectDateOrder(['01/13/2026', '02/05/2026']), { order: 'MDY', ambiguous: false, conflict: false });
  assert.deepEqual(detectDateOrder(['01/02/2026', '03/04/2026']), { order: 'MDY', ambiguous: true, conflict: false });
  assert.equal(detectDateOrder(['01/02/2026'], 'DMY').order, 'DMY');
  assert.equal(detectDateOrder(['13/01/2026', '01/13/2026']).conflict, true);
  assert.equal(detectDateOrder(['2026-01-05']).ambiguous, false);
});

// ---------- Bank layouts ----------

test('chase card: money out is negative in the file, positive in the result', () => {
  const r = parseFile('Chase1234.csv', fixture('chase-card.csv'));
  assert.equal(r.format, 'csv');
  assert.equal(r.info.preset.id, 'chase-card');
  assert.equal(r.info.spendSign, 'negative');
  assert.equal(r.transactions.length, 9);
  assert.equal(byDesc(r.transactions, /NETFLIX/)[0].cents, 1549);
  assert.equal(byDesc(r.transactions, /NETFLIX/)[0].date, '2026-01-05');
  assert.equal(byDesc(r.transactions, /PAYMENT/)[0].cents, -30000, 'a payment is money in');
  assert.equal(byDesc(r.transactions, /BEST BUY/)[0].cents, -4500, 'a return is money in');
  assert.equal(byDesc(r.transactions, /BLUE BOTTLE/)[0].desc, 'SQ *BLUE BOTTLE COFFEE, OAKLAND');
  assert.deepEqual(r.info.dateRange, { start: '2026-01-05', end: '2026-02-20' });
  assert.deepEqual(r.warnings.filter((w) => !/read two ways|month first/.test(w)), []);
});

test('capital one: separate debit and credit columns, thousands separators', () => {
  const r = parseFile('transactions.csv', fixture('capital-one.csv'));
  assert.equal(r.info.preset.id, 'capital-one');
  assert.equal(r.info.spendSign, 'split');
  assert.equal(byDesc(r.transactions, /NETFLIX/)[0].cents, 1549);
  assert.equal(byDesc(r.transactions, /MOBILE PYMT/)[0].cents, -30000);
  assert.equal(byDesc(r.transactions, /WHOLE FOODS/)[0].cents, 120433);
});

test('amex: positive means charge', () => {
  const r = parseFile('activity.csv', fixture('amex.csv'));
  assert.equal(r.info.preset.id, 'amex');
  assert.equal(r.info.spendSign, 'positive');
  assert.equal(byDesc(r.transactions, /NETFLIX/)[0].cents, 1549);
  assert.equal(byDesc(r.transactions, /AUTOPAY/)[0].cents, -30000);
});

test('bank of america: finds the header below the account summary and ignores balance rows', () => {
  const r = parseFile('stmt.csv', fixture('bofa-checking.csv'));
  assert.equal(r.info.preset.id, 'bofa');
  assert.equal(r.info.headerIndex, 5, 'blank lines are dropped before the header is located');
  assert.equal(byDesc(r.transactions, /NETFLIX/)[0].cents, 1549);
  assert.equal(byDesc(r.transactions, /PAYROLL/)[0].cents, -320000);
  assert.equal(byDesc(r.transactions, /Zelle/)[0].cents, 107300);
  assert.equal(r.transactions.some((t) => /balance/i.test(t.desc)), false, 'balance rows are not transactions');
  assert.equal(r.transactions.length, 4);
  assert.deepEqual(r.warnings.filter((w) => /amount could not be read/.test(w)), [], 'expected balance rows should not produce a warning');
});

test('european export: semicolons, comma decimals, day-first dates, sep= hint', () => {
  const r = parseFile('konto.csv', fixture('european-semicolon.csv'));
  assert.equal(r.info.delimiter, ';');
  assert.equal(r.info.decimal, ',');
  assert.equal(r.info.dateOrder, 'DMY');
  assert.equal(byDesc(r.transactions, /NETFLIX/)[0].date, '2026-01-13');
  assert.equal(byDesc(r.transactions, /NETFLIX/)[0].cents, 1549);
  assert.equal(byDesc(r.transactions, /GEHALT/)[0].cents, -245000);
  assert.equal(byDesc(r.transactions, /SPOTIFY/)[0].cents, 1099);
});

test('headerless file: columns are inferred and the person is told', () => {
  const csv = '01/05/2026,NETFLIX.COM,-15.49\n01/12/2026,SPOTIFY USA,-11.99\n01/20/2026,PAYMENT THANK YOU,300.00\n';
  const r = parseFile('x.csv', csv);
  assert.equal(r.info.inferred, true);
  assert.equal(r.transactions.length, 3);
  assert.equal(r.transactions[0].cents, 1549);
  assert.equal(r.transactions[2].cents, -30000);
  assert.ok(r.warnings.some((w) => /no header row/.test(w)));
});

test('ambiguous dates are read month-first and the warning says so', () => {
  const csv = 'Date,Description,Amount\n01/02/2026,A SHOP,-5.00\n03/04/2026,A SHOP,-5.00\n';
  const r = parseFile('x.csv', csv);
  assert.equal(r.info.dateOrderAmbiguous, true);
  assert.equal(r.transactions[0].date, '2026-01-02');
  assert.ok(r.warnings.some((w) => /two ways/.test(w)));
});

test('date order and sign overrides are honoured', () => {
  const csv = 'Date,Description,Amount\n01/02/2026,A SHOP,5.00\n03/04/2026,A SHOP,5.00\n';
  const r = parseFile('x.csv', csv, { dateOrder: 'DMY', spendSign: 'negative' });
  assert.equal(r.transactions[0].date, '2026-02-01');
  assert.equal(r.transactions[0].cents, -500);
  assert.equal(r.info.dateOrderAmbiguous, false);
  assert.equal(r.warnings.some((w) => /two ways/.test(w)), false);
});

test('sign is inferred from the data when no preset matches: most rows are spending', () => {
  const neg = 'Date,Description,Amount\n2026-01-01,A,-5.00\n2026-01-02,B,-6.00\n2026-01-03,C,100.00\n';
  assert.equal(parseFile('x.csv', neg).transactions[0].cents, 500);
  const pos = 'Date,Description,Amount\n2026-01-01,A,5.00\n2026-01-02,B,6.00\n2026-01-03,C,-100.00\n';
  assert.equal(parseFile('x.csv', pos).transactions[0].cents, 500);
});

test('pending rows are left out and reported', () => {
  const csv = 'Date,Description,Amount,Status\n2026-01-01,A,-5.00,Posted\n2026-01-02,B,-6.00,Pending\n';
  const r = parseFile('x.csv', csv);
  assert.equal(r.transactions.length, 1);
  assert.ok(r.warnings.some((w) => /pending/.test(w)));
});

test('accounting-style amounts in a single column', () => {
  const csv = 'Date,Description,Amount\n2026-01-01,A,(5.00)\n2026-01-02,B,(6.00)\n2026-01-03,C,100.00\n';
  const r = parseFile('x.csv', csv);
  assert.equal(r.transactions[0].cents, 500);
  assert.equal(r.transactions[2].cents, -10000);
});

test('rows that cannot be read are skipped with a warning, the rest still load', () => {
  const csv = 'Date,Description,Amount\n2026-01-01,A,-5.00\nnot a date,B,-6.00\n2026-01-03,C,abc\n2026-01-04,D,-7.00\n';
  const r = parseFile('x.csv', csv);
  assert.equal(r.transactions.length, 2);
  assert.ok(r.warnings.some((w) => /date could not be read/.test(w)));
  assert.ok(r.warnings.some((w) => /amount could not be read/.test(w)));
});

test('a UTF-8 BOM and CRLF line endings do not break header detection', () => {
  const csv = '﻿Date,Description,Amount\r\n2026-01-01,A,-5.00\r\n2026-01-02,B,-6.00\r\n';
  assert.equal(parseFile('x.csv', csv).transactions.length, 2);
});

test('manual column mapping overrides detection', () => {
  const csv = 'Booked,Who,Out,Note\n2026-01-01,A,5.00,x\n2026-01-02,B,6.00,y\n';
  const guessed = parseFile('x.csv', csv);
  assert.equal(guessed.info.inferred, true);
  const r = parseFile('x.csv', csv, {
    manual: { headerIndex: 0, mapping: { date: 0, description: 3, amount: 2 } },
    spendSign: 'positive',
  });
  assert.equal(r.transactions.length, 2);
  assert.equal(r.transactions[1].cents, 600);
  assert.equal(r.transactions[1].desc, 'y');
  assert.equal(r.info.inferred, false);
});

test('manual mapping without a date column is refused', () => {
  const csv = 'Booked,Who,Out\n2026-01-01,A,5.00\n';
  assert.throws(
    () => parseFile('x.csv', csv, { manual: { headerIndex: 0, mapping: { description: 1, amount: 2 } } }),
    (e) => e instanceof ParseError && e.code === 'no-columns',
  );
});

// ---------- OFX, QFX, QIF ----------

test('ofx (SGML): reads dates with time zones, entities, and flips the sign', () => {
  const r = parseFile('Checking.qfx', fixture('bank.ofx'));
  assert.equal(r.format, 'ofx');
  assert.equal(r.info.currency, 'USD');
  assert.equal(r.transactions.length, 3);
  assert.equal(byDesc(r.transactions, /NETFLIX/)[0].cents, 1549);
  assert.equal(byDesc(r.transactions, /NETFLIX/)[0].date, '2026-01-05');
  assert.equal(byDesc(r.transactions, /PAYROLL/)[0].cents, -320000);
  assert.equal(byDesc(r.transactions, /PAYROLL/)[0].desc, 'ACME PAYROLL & CO');
});

test('ofx (XML 2.x) with comma decimals', () => {
  const r = parseFile('x.ofx', fixture('bank-xml.ofx'));
  assert.equal(r.info.currency, 'EUR');
  assert.equal(r.transactions.length, 2);
  assert.equal(r.transactions[0].cents, 1549);
});

test('ofx content is recognised even with the wrong file extension', () => {
  assert.equal(parseFile('export.txt', fixture('bank.ofx')).format, 'ofx');
});

test('ofx with no transactions is a clear error', () => {
  assert.throws(() => parseFile('x.ofx', '<OFX><BANKMSGSRSV1></BANKMSGSRSV1></OFX>'), /no transactions/i);
});

test('qif: apostrophe years, sign flip, payee and memo', () => {
  const r = parseFile('Quicken.qif', fixture('quicken.qif'));
  assert.equal(r.format, 'qif');
  assert.equal(r.transactions.length, 3);
  assert.equal(r.transactions[0].date, '2026-01-05');
  assert.equal(r.transactions[0].cents, 1549);
  assert.equal(r.transactions[0].desc, 'NETFLIX.COM');
  assert.equal(r.transactions[2].cents, -30000);
});

// ---------- Things that are not statements ----------

test('rejects empty, PDF, spreadsheet and unrelated files with a useful message', () => {
  assert.throws(() => parseFile('x.csv', ''), (e) => e instanceof ParseError && e.code === 'empty');
  assert.throws(() => parseFile('x.csv', '   \n  '), (e) => e instanceof ParseError && e.code === 'empty');
  assert.throws(() => parseFile('x.pdf', '%PDF-1.7\n...'), (e) => e instanceof ParseError && e.code === 'pdf');
  assert.throws(() => parseFile('x.xlsx', 'PK\u0003\u0004\u0000\u0000binary'), (e) => e instanceof ParseError && e.code === 'binary');
  assert.throws(() => parseFile('notes.csv', 'hello world\nthis is not a statement'), (e) => e instanceof ParseError && e.code === 'no-columns');
});

test('a file where no date can be read says which value failed', () => {
  assert.throws(
    () => parseFile('x.csv', 'Date,Description,Amount\nsometime,A,-5.00\n'),
    (e) => e instanceof ParseError && e.code === 'no-rows' && /sometime/.test(e.message),
  );
});

test('formulas and HTML in descriptions are carried as plain text, never interpreted', () => {
  const csv = 'Date,Description,Amount\n2026-01-01,"=HYPERLINK(""http://x"")<img src=x onerror=alert(1)>",-5.00\n';
  const r = parseFile('x.csv', csv);
  assert.equal(r.transactions[0].desc, '=HYPERLINK("http://x")<img src=x onerror=alert(1)>');
});

test('very long descriptions are truncated', () => {
  const r = parseFile('x.csv', `Date,Description,Amount\n2026-01-01,${'A'.repeat(500)},-5.00\n`);
  assert.equal(r.transactions[0].desc.length, 200);
});
