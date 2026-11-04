// Money is handled as integer minor units ("cents") everywhere in the engine.
// Floating point never touches an amount that gets summed, compared or exported.

const NBSP_LIKE = /[    ]/g;

/**
 * Guess the decimal separator used in a column of amount strings.
 * Returns "." or ",". Looks at how the last separator is used: "12,50" and
 * "1.234,56" mean comma-decimal; "12.50" and "1,234.56" mean dot-decimal.
 */
export function detectDecimalSeparator(samples) {
  let comma = 0;
  let dot = 0;
  for (const raw of samples) {
    if (raw == null) continue;
    const s = String(raw).replace(NBSP_LIKE, ' ').replace(/[^\d.,]/g, '');
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma === -1 && lastDot === -1) continue;
    if (lastComma > lastDot) {
      // "12,50" and "1.234,56" => comma decimal. "1,234" is ambiguous, count it as nothing.
      const tail = s.length - lastComma - 1;
      if (tail === 1 || tail === 2 || lastDot !== -1) comma++;
    } else if (lastDot > lastComma) {
      const tail = s.length - lastDot - 1;
      if (tail === 1 || tail === 2 || lastComma !== -1) dot++;
    }
  }
  return comma > dot ? ',' : '.';
}

/**
 * Parse a bank-style amount string into signed integer cents, or null.
 * Handles: $1,234.56  (12.00)  12.00-  -12.00  −12.00  12.00 CR  12.00 DR  EUR 12,50  1 234,56
 * CR / DR are read from the account's point of view: DR is money out (negative), CR is money in.
 */
export function parseAmount(input, decimal = '.') {
  if (input == null) return null;
  let s = String(input).replace(NBSP_LIKE, ' ').trim();
  if (s === '') return null;

  let negative = false;

  // Accounting parentheses: (12.00)
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }

  // CR / DR suffix or prefix
  const crdr = /(^|\s)(CR|DR)\.?$|^(CR|DR)\.?(\s|$)/i.exec(s);
  if (crdr) {
    const tag = (crdr[2] || crdr[3]).toUpperCase();
    if (tag === 'DR') negative = true;
    s = s.replace(/(^|\s)(CR|DR)\.?$|^(CR|DR)\.?(\s|$)/i, ' ').trim();
  }

  // Unicode minus and trailing minus
  s = s.replace(/[−–—]/g, '-');
  if (/-\s*$/.test(s)) {
    negative = true;
    s = s.replace(/-\s*$/, '');
  }
  if (/^\s*\+/.test(s)) s = s.replace(/^\s*\+/, '');
  if (/^\s*-/.test(s)) {
    negative = true; // an explicit leading minus always means money out of the account
    s = s.replace(/^\s*-/, '');
  }

  // Strip currency symbols/codes and anything that is not a digit or separator.
  s = s.replace(/[A-Za-z$€£¥₹₩₽¢]/g, '').replace(/[\s']/g, '');
  // After removing letters a second minus (e.g. "$-12.00") may remain.
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  }
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;

  const dec = decimal === ',' ? ',' : '.';
  const thou = dec === ',' ? '.' : ',';
  if (s.split(dec).length > 2) return null; // a decimal separator can appear only once ("12.34.56" is not an amount)
  const lastDec = s.lastIndexOf(dec);
  let intPart = s;
  let fracPart = '';
  if (lastDec !== -1) {
    const tail = s.slice(lastDec + 1);
    // Treat as decimal only if the tail is 1-2 digits (or 0 digits like "12."), otherwise it is a thousands group.
    if (tail.length <= 2 || (tail.length > 3 && !s.slice(0, lastDec).includes(thou))) {
      intPart = s.slice(0, lastDec);
      fracPart = tail;
    }
  }
  intPart = intPart.split(thou).join('').split(dec).join('');
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(fracPart)) return null;
  if (fracPart.length > 2) fracPart = fracPart.slice(0, 2); // never expected; avoid silent 3-digit scaling
  const cents = Number(intPart || '0') * 100 + Number((fracPart + '00').slice(0, 2));
  if (!Number.isSafeInteger(cents)) return null;
  const signed = negative ? -cents : cents;
  return signed === 0 ? 0 : signed; // avoid -0
}

const formatterCache = new Map();

/** Format integer cents with Intl. `currency` is a display choice only; no conversion happens. */
export function formatMoney(cents, { currency = 'USD', locale, showCents = true } = {}) {
  const key = `${locale ?? ''}|${currency}|${showCents}`;
  let f = formatterCache.get(key);
  if (!f) {
    let opts = { style: 'currency', currency };
    if (!showCents) opts = { ...opts, minimumFractionDigits: 0, maximumFractionDigits: 0 };
    try {
      f = new Intl.NumberFormat(locale, opts);
    } catch {
      f = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', ...(!showCents && { minimumFractionDigits: 0, maximumFractionDigits: 0 }) });
    }
    formatterCache.set(key, f);
  }
  return f.format(cents / 100);
}

/** Same-amount tolerance: ten cents or one percent, whichever is larger. Absorbs tax rounding and FX wobble. */
export const amountTolerance = (cents) => Math.max(10, Math.round(Math.abs(cents) * 0.01));
export const sameAmount = (a, b) => Math.abs(a - b) <= amountTolerance(Math.min(Math.abs(a), Math.abs(b)));
