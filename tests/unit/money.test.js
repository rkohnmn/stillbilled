import test from 'node:test';
import assert from 'node:assert/strict';
import { amountTolerance, detectDecimalSeparator, formatMoney, parseAmount, sameAmount } from '../../js/core/money.js';

test('parses plain and signed amounts to integer cents', () => {
  assert.equal(parseAmount('12.34'), 1234);
  assert.equal(parseAmount('-12.34'), -1234);
  assert.equal(parseAmount('+12.34'), 1234);
  assert.equal(parseAmount('0.07'), 7);
  assert.equal(parseAmount('.5'), 50);
  assert.equal(parseAmount('12'), 1200);
  assert.equal(parseAmount('12.'), 1200);
  assert.equal(parseAmount('0'), 0);
  assert.equal(Object.is(parseAmount('-0.00'), -0), false);
});

test('never goes through floating point', () => {
  // 0.1 + 0.2 style traps and large values stay exact
  assert.equal(parseAmount('19.99'), 1999);
  assert.equal(parseAmount('1.15'), 115);
  assert.equal(parseAmount('4.35'), 435);
  assert.equal(parseAmount('1234567.89'), 123456789);
});

test('handles currency symbols, thousands separators and spacing', () => {
  assert.equal(parseAmount('$1,234.56'), 123456);
  assert.equal(parseAmount('-$1,234.56'), -123456);
  assert.equal(parseAmount('$-1,234.56'), -123456);
  assert.equal(parseAmount('USD 12.50'), 1250);
  assert.equal(parseAmount('£3.20'), 320);
  assert.equal(parseAmount(' 12.50 '), 1250);
  assert.equal(parseAmount('1 234.56'), 123456);
});

test('accounting styles: parentheses, trailing minus, Unicode minus, CR and DR', () => {
  assert.equal(parseAmount('(45.00)'), -4500);
  assert.equal(parseAmount('45.00-'), -4500);
  assert.equal(parseAmount('−45.00'), -4500);
  assert.equal(parseAmount('45.00 DR'), -4500);
  assert.equal(parseAmount('45.00 CR'), 4500);
  assert.equal(parseAmount('DR 45.00'), -4500);
});

test('comma-decimal amounts', () => {
  assert.equal(parseAmount('12,50', ','), 1250);
  assert.equal(parseAmount('1.234,56', ','), 123456);
  assert.equal(parseAmount('-1.234,56', ','), -123456);
  assert.equal(parseAmount('EUR 12,50', ','), 1250);
  assert.equal(parseAmount('1 234,56', ','), 123456);
});

test('rejects things that are not amounts', () => {
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('   '), null);
  assert.equal(parseAmount(null), null);
  assert.equal(parseAmount(undefined), null);
  assert.equal(parseAmount('abc'), null);
  assert.equal(parseAmount('--'), null);
  assert.equal(parseAmount('12.34.56x'), null);
  assert.equal(parseAmount('N/A'), null);
});

test('guards against absurd values', () => {
  assert.equal(parseAmount('9'.repeat(30)), null);
});

test('detects the decimal separator from the data', () => {
  assert.equal(detectDecimalSeparator(['12.50', '3.00', '1,234.56']), '.');
  assert.equal(detectDecimalSeparator(['12,50', '3,00', '1.234,56']), ',');
  assert.equal(detectDecimalSeparator(['12', '15', '100']), '.');
  assert.equal(detectDecimalSeparator([]), '.');
  assert.equal(detectDecimalSeparator([null, undefined, '']), '.');
});

test('amount tolerance is ten cents or one percent', () => {
  assert.equal(amountTolerance(500), 10);
  assert.equal(amountTolerance(10000), 100);
  assert.equal(amountTolerance(-10000), 100);
  assert.equal(sameAmount(1549, 1549), true);
  assert.equal(sameAmount(1549, 1555), true);
  assert.equal(sameAmount(1549, 1799), false);
  assert.equal(sameAmount(10000, 10099), true);
  assert.equal(sameAmount(10000, 10150), false);
});

test('formatMoney formats cents without rounding errors', () => {
  assert.equal(formatMoney(1549, { locale: 'en-US' }), '$15.49');
  assert.equal(formatMoney(-1549, { locale: 'en-US' }), '-$15.49');
  assert.equal(formatMoney(100000, { locale: 'en-US', showCents: false }), '$1,000');
  assert.equal(formatMoney(5, { locale: 'en-US' }), '$0.05');
  assert.match(formatMoney(1549, { locale: 'de-DE', currency: 'EUR' }), /15,49/);
});

test('formatMoney falls back instead of throwing on a bad currency code', () => {
  assert.equal(formatMoney(1549, { locale: 'en-US', currency: 'not-a-code' }), '$15.49');
});
