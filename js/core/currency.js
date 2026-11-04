// Amounts are never converted. The currency is only the symbol shown next to them.
// It comes from the file when the file says (OFX/QFX), otherwise from the browser's region.

export const CURRENCIES = [
  ['USD', 'US dollar'], ['EUR', 'Euro'], ['GBP', 'British pound'], ['CAD', 'Canadian dollar'],
  ['AUD', 'Australian dollar'], ['NZD', 'New Zealand dollar'], ['CHF', 'Swiss franc'], ['SEK', 'Swedish krona'],
  ['NOK', 'Norwegian krone'], ['DKK', 'Danish krone'], ['PLN', 'Polish zloty'], ['CZK', 'Czech koruna'],
  ['JPY', 'Japanese yen'], ['INR', 'Indian rupee'], ['BRL', 'Brazilian real'], ['MXN', 'Mexican peso'],
  ['ZAR', 'South African rand'], ['SGD', 'Singapore dollar'], ['HKD', 'Hong Kong dollar'],
];

const REGION = {
  US: 'USD', CA: 'CAD', GB: 'GBP', AU: 'AUD', NZ: 'NZD', CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK',
  PL: 'PLN', CZ: 'CZK', JP: 'JPY', IN: 'INR', BR: 'BRL', MX: 'MXN', ZA: 'ZAR', SG: 'SGD', HK: 'HKD',
  DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', BE: 'EUR', AT: 'EUR', IE: 'EUR', PT: 'EUR',
  FI: 'EUR', GR: 'EUR', LU: 'EUR', SK: 'EUR', SI: 'EUR', EE: 'EUR', LV: 'EUR', LT: 'EUR', HR: 'EUR',
};

const SUPPORTED = new Set(CURRENCIES.map(([code]) => code));
export const isSupportedCurrency = (code) => SUPPORTED.has(code);

/** Best guess for display, from a locale tag such as "en-GB" or "de-AT". Falls back to USD. */
export function currencyForLocale(locale) {
  const region = /[-_]([A-Za-z]{2})\b/.exec(String(locale ?? ''))?.[1]?.toUpperCase();
  return (region && REGION[region]) || 'USD';
}
