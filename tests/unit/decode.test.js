import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeBytes } from '../../js/parsers/decode.js';
import { currencyForLocale } from '../../js/core/currency.js';

const bytes = (...n) => Uint8Array.from(n);
const utf16le = (s, bom = true) => {
  const out = [];
  if (bom) out.push(0xff, 0xfe);
  for (const ch of s) out.push(ch.charCodeAt(0) & 255, ch.charCodeAt(0) >> 8);
  return Uint8Array.from(out);
};

test('decode: plain UTF-8, with and without a BOM', () => {
  assert.deepEqual(decodeBytes(new TextEncoder().encode('Café,5.00')), { text: 'Café,5.00', encoding: 'utf-8' });
  const withBom = Uint8Array.from([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('Date,Amount')]);
  assert.equal(decodeBytes(withBom).text, 'Date,Amount');
});

test('decode: Windows-1252 bytes that are not valid UTF-8', () => {
  const r = decodeBytes(bytes(0x43, 0x61, 0x66, 0xe9, 0x20, 0x80, 0x35)); // "Café €5"
  assert.equal(r.encoding, 'windows-1252');
  assert.equal(r.text, 'Café €5');
});

test('decode: every defined Windows-1252 byte from 0x80 to 0x9F gives the same letter on every runtime', () => {
  // Expected values from the Windows-1252 code page table, written as code points so this test does not depend on the runtime's decoder.
  const expected = {
    0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6,
    0x89: 0x2030, 0x8a: 0x0160, 0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201c,
    0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a,
    0x9c: 0x0153, 0x9e: 0x017e, 0x9f: 0x0178,
  };
  for (const [byte, codePoint] of Object.entries(expected)) {
    const r = decodeBytes(bytes(0x41, Number(byte), 0xe9)); // an invalid UTF-8 sequence forces the Windows-1252 path
    assert.equal(r.encoding, 'windows-1252');
    assert.equal(r.text.codePointAt(1), codePoint, `byte 0x${Number(byte).toString(16)}`);
  }
  // The five undefined bytes stay as control characters, as the standard says.
  for (const byte of [0x81, 0x8d, 0x8f, 0x90, 0x9d]) assert.equal(decodeBytes(bytes(0x41, byte, 0xe9)).text.codePointAt(1), byte);
});

test('decode: UTF-16 with a BOM and without', () => {
  assert.deepEqual(decodeBytes(utf16le('Date,Amount\n1,2')), { text: 'Date,Amount\n1,2', encoding: 'utf-16le' });
  assert.deepEqual(decodeBytes(utf16le('Date,Amount\n1,2', false)), { text: 'Date,Amount\n1,2', encoding: 'utf-16le' });
  const be = Uint8Array.from([0xfe, 0xff, 0x00, 0x41, 0x00, 0x42]);
  assert.deepEqual(decodeBytes(be), { text: 'AB', encoding: 'utf-16be' });
});

test('decode: accepts an ArrayBuffer and empty input', () => {
  assert.equal(decodeBytes(new TextEncoder().encode('x').buffer).text, 'x');
  assert.equal(decodeBytes(new Uint8Array(0)).text, '');
});

test('currency: guessed from the locale region, USD otherwise', () => {
  assert.equal(currencyForLocale('en-US'), 'USD');
  assert.equal(currencyForLocale('en-GB'), 'GBP');
  assert.equal(currencyForLocale('de-DE'), 'EUR');
  assert.equal(currencyForLocale('fr_CA'), 'CAD');
  assert.equal(currencyForLocale('en'), 'USD');
  assert.equal(currencyForLocale(undefined), 'USD');
  assert.equal(currencyForLocale('xx-ZZ'), 'USD');
});
