import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMerchant } from '../../js/core/merchants.js';

const key = (d) => normalizeMerchant(d).key;

test('known subscription brands are recognised through noisy descriptors', () => {
  const cases = [
    ['NETFLIX.COM 866-579-7172 CA', 'NETFLIX', 'video'],
    ['PAYPAL *SPOTIFY', 'SPOTIFY', 'music'],
    ['SPOTIFY USA 877-7781161 NY', 'SPOTIFY', 'music'],
    ['CHECKCARD 0108 PLANET FITNESS 04/05 CLUB #123', 'PLANET FITNESS', 'fitness'],
    ['GOOGLE *YOUTUBEPREMIUM', 'YOUTUBE PREMIUM', 'video'],
    ['GOOGLE *GOOGLE ONE', 'GOOGLE ONE', 'cloud'],
    ['DISNEY PLUS', 'DISNEY PLUS', 'video'],
    ['DISNEY+', 'DISNEY PLUS', 'video'],
    ['AMAZON PRIME*XY12AB', 'AMAZON PRIME', 'membership'],
    ['AMAZON PRIME VIDEO', 'PRIME VIDEO', 'video'],
    ['HBO MAX', 'MAX', 'video'],
    ['ADOBE *CREATIVE CLOUD', 'ADOBE', 'software'],
    ['MSFT *MICROSOFT 365 PERSONAL', 'MICROSOFT 365', 'software'],
    ['NYTIMES.COM', 'NEW YORK TIMES', 'news'],
  ];
  for (const [desc, k, cat] of cases) {
    const m = normalizeMerchant(desc);
    assert.equal(m.key, k, desc);
    assert.equal(m.category, cat, desc);
    assert.equal(m.known, true, desc);
  }
});

test('bundles with several services behind one descriptor have no category', () => {
  const a = normalizeMerchant('APPLE.COM/BILL');
  assert.equal(a.key, 'APPLE BILL');
  assert.equal(a.category, null);
  assert.equal(normalizeMerchant('AMAZON.COM*2K4XY9').key, 'AMAZON');
  assert.equal(normalizeMerchant('AMZN MKTP US*1A2B3C').key, 'AMAZON');
});

test('brand patterns do not fire on look-alike words', () => {
  assert.equal(normalizeMerchant('MAXIMUM FITNESS CLUB').known, false);
  assert.equal(normalizeMerchant('HULUS KEBAB HOUSE').known, false);
  assert.equal(normalizeMerchant('CALMING CANDLES SHOP').known, false);
  assert.equal(normalizeMerchant('NOTIONS AND THREAD').known, false);
});

test('generic cleaner strips processor prefixes, reference numbers, phones, states', () => {
  assert.equal(key('SQ *BLUE BOTTLE COFFEE, OAKLAND'), 'BLUE BOTTLE');
  assert.equal(key("TRADER JOE'S #123"), "TRADER JOE'S");
  assert.equal(key('WHOLE FOODS MKT #10234, AUSTIN TX'), 'WHOLE FOODS');
  assert.equal(key('POS DEBIT - SHELL OIL 57444 DALLAS TX'), 'SHELL OIL');
  assert.equal(key('PURCHASE AUTHORIZED ON 01/05 CORNER BAKERY CAFE 3321 NEW YORK NY'), 'CORNER BAKERY');
  assert.equal(key('TST* LOCAL DINER'), 'LOCAL DINER');
  assert.equal(key('ACH DEBIT COMCAST CABLE COMM WEB ID: 1234567890'), 'COMCAST CABLE');
});

test('the same merchant gets the same key when store numbers and dates change', () => {
  assert.equal(key('ACME GYM 0412 DENVER CO'), key('ACME GYM 0511 DENVER CO'));
  assert.equal(key('CITY WATER 01/05'), key('CITY WATER 02/05'));
  assert.equal(key('RECURRING PAYMENT ACME GYM'), key('ACME GYM'));
});

test('readable names', () => {
  assert.equal(normalizeMerchant("TRADER JOE'S #123").name, "Trader Joe's");
  assert.equal(normalizeMerchant('NETFLIX.COM').name, 'Netflix');
  assert.equal(normalizeMerchant('DISNEY PLUS').name, 'Disney+');
});

test('odd input never throws and always yields a key', () => {
  for (const d of ['', '   ', '12345', '***', '#', '----', 'X', '日本語の店', 'a'.repeat(5000), '(no description)', null, undefined, 42]) {
    const m = normalizeMerchant(d);
    assert.equal(typeof m.key, 'string');
    assert.ok(m.key.length > 0, `empty key for ${JSON.stringify(d)}`);
    assert.equal(typeof m.name, 'string');
  }
});

test('descriptors are never executed or interpreted', () => {
  const m = normalizeMerchant('<img src=x onerror=alert(1)> SHOP');
  assert.ok(!/[<>=]/.test(m.key));
});
