// Display formatting. Amounts are integer cents; the currency is only a label.

import { formatMoney } from '../core/money.js';
import { formatDate } from '../core/dates.js';

export function localeDateOrder(locale) {
  try {
    const parts = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date(2001, 10, 25));
    const order = parts.filter((p) => p.type === 'month' || p.type === 'day').map((p) => p.type);
    return order[0] === 'month' ? 'MDY' : 'DMY';
  } catch {
    return 'MDY';
  }
}

export function makeFormatters({ locale = 'en-US', currency = 'USD' } = {}) {
  const opts = { locale, currency };
  return {
    locale,
    currency,
    /** $17.99 */
    money: (cents) => formatMoney(cents, { ...opts, showCents: true }),
    /** $18 (whole units, for yearly figures where cents are noise) */
    whole: (cents) => formatMoney(cents, { ...opts, showCents: false }),
    /** +$2.00 or -$2.00 */
    signed: (cents) => `${cents > 0 ? '+' : cents < 0 ? '−' : ''}${formatMoney(Math.abs(cents), { ...opts, showCents: true })}`,
    signedWhole: (cents) => `${cents > 0 ? '+' : cents < 0 ? '−' : ''}${formatMoney(Math.abs(cents), { ...opts, showCents: false })}`,
    date: (iso) => formatDate(iso, locale),
    dateShort: (iso) => formatDate(iso, locale, { month: 'short', day: 'numeric' }),
    monthYear: (iso) => formatDate(iso, locale, { month: 'short', year: 'numeric' }),
    number: (n) => new Intl.NumberFormat(locale).format(n),
  };
}

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
