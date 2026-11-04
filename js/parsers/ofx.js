// OFX / QFX reader. Handles both the old SGML-style files (tags without closing
// tags, typical of QFX downloads) and OFX 2 XML. Only the transaction list is read.

import { detectDecimalSeparator, parseAmount } from '../core/money.js';
import { parseDate } from './dateparse.js';
import { ParseError } from './formats.js';

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&#39;': "'" };
const decode = (s) => s.replace(/&(amp|lt|gt|quot|apos|#39);/g, (m) => ENTITIES[m] ?? m);

export function parseOFX(text, { sourceId = 'src' } = {}) {
  const warnings = [];
  const currency = /<CURDEF>\s*([A-Za-z]{3})/i.exec(text)?.[1]?.toUpperCase() ?? null;
  const chunks = text.split(/<STMTTRN>/i).slice(1);
  if (chunks.length === 0) throw new ParseError('This OFX/QFX file has no transactions in it.', 'no-rows');

  const amountSamples = [];
  const raw = [];
  chunks.forEach((chunk, i) => {
    const body = chunk.split(/<\/STMTTRN>/i)[0].split(/<\/(?:BANKTRANLIST|CCSTMTRS|STMTRS|INVBANKTRAN)>/i)[0];
    const fields = {};
    for (const m of body.matchAll(/<([A-Z0-9.]+)>([^<\r\n]*)/gi)) {
      const tag = m[1].toUpperCase();
      if (!(tag in fields)) fields[tag] = decode(m[2].trim());
    }
    if (fields.TRNAMT) amountSamples.push(fields.TRNAMT);
    raw.push({ i, fields });
  });

  const decimal = detectDecimalSeparator(amountSamples);
  let skipped = 0;
  const transactions = [];
  for (const { i, fields } of raw) {
    const date = parseDate(fields.DTPOSTED || fields.DTUSER || '', 'MDY');
    const amt = parseAmount(fields.TRNAMT, decimal);
    if (!date || amt === null || amt === 0) {
      skipped++;
      continue;
    }
    const desc = (fields.NAME || fields.MEMO || fields.PAYEE || '(no description)').replace(/\s+/g, ' ').slice(0, 200);
    // OFX: negative TRNAMT is money out. The engine wants money out positive.
    transactions.push({ id: `${sourceId}:${i}`, date, cents: -amt, desc, source: sourceId });
  }
  if (transactions.length === 0) throw new ParseError('No readable transactions were found in this OFX/QFX file.', 'no-rows');
  if (skipped > 0) warnings.push(`${skipped} transaction${skipped === 1 ? '' : 's'} skipped because the date or amount could not be read.`);

  const dates = transactions.map((t) => t.date).sort();
  return {
    transactions,
    warnings,
    info: {
      currency, decimal, rowsTotal: raw.length, rowsRead: transactions.length, skipped: { badDate: skipped, noAmount: 0, pending: 0, blank: 0 },
      dateRange: { start: dates[0], end: dates[dates.length - 1] }, spendSign: 'negative', signAuto: true,
      dateOrder: 'YMD', dateOrderAmbiguous: false, preset: { id: 'ofx', label: 'OFX/QFX', spend: 'negative' },
    },
  };
}
