// QIF reader (Quicken Interchange Format): plain text, one field per line,
// records separated by "^". Fields used: D date, T/U amount, P payee, M memo.

import { detectDecimalSeparator, parseAmount } from '../core/money.js';
import { detectDateOrder, parseDate } from './dateparse.js';
import { ParseError } from './formats.js';

export function parseQIF(text, { sourceId = 'src', dateOrder = 'auto', fallbackOrder = 'MDY' } = {}) {
  const warnings = [];
  const records = [];
  let cur = {};
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    if (!line) continue;
    const code = line[0];
    const value = line.slice(1).trim();
    if (code === '!') continue; // header lines such as !Type:Bank
    if (code === '^') {
      if (cur.D !== undefined || cur.T !== undefined) records.push(cur);
      cur = {};
    } else if ('DTUPMN'.includes(code)) {
      if (!(code in cur)) cur[code] = value;
    }
  }
  if (cur.D !== undefined || cur.T !== undefined) records.push(cur);
  if (records.length === 0) throw new ParseError('No transactions were found in this QIF file.', 'no-rows');

  const order = dateOrder === 'MDY' || dateOrder === 'DMY'
    ? { order: dateOrder, ambiguous: false, forced: true }
    : { ...detectDateOrder(records.map((r) => (r.D ?? '').replace("'", '/')), fallbackOrder), forced: false };
  const decimal = detectDecimalSeparator(records.map((r) => r.T ?? r.U));

  let skipped = 0;
  const transactions = [];
  records.forEach((r, i) => {
    const date = parseDate((r.D ?? '').replace(/\s+/g, ''), order.order);
    const amt = parseAmount(r.T ?? r.U, decimal);
    if (!date || amt === null || amt === 0) {
      skipped++;
      return;
    }
    const desc = (r.P || r.M || '(no description)').replace(/\s+/g, ' ').slice(0, 200);
    transactions.push({ id: `${sourceId}:${i}`, date, cents: -amt, desc, source: sourceId });
  });
  if (transactions.length === 0) throw new ParseError('No readable transactions were found in this QIF file.', 'no-rows');
  if (skipped > 0) warnings.push(`${skipped} record${skipped === 1 ? '' : 's'} skipped because the date or amount could not be read.`);
  if (order.ambiguous && !order.forced) warnings.push(`Dates were read as ${order.order === 'MDY' ? 'month first' : 'day first'}. Change this in Data and settings if that is wrong.`);

  const dates = transactions.map((t) => t.date).sort();
  return {
    transactions,
    warnings,
    info: {
      decimal, rowsTotal: records.length, rowsRead: transactions.length, skipped: { badDate: skipped, noAmount: 0, pending: 0, blank: 0 },
      dateRange: { start: dates[0], end: dates[dates.length - 1] }, spendSign: 'negative', signAuto: true,
      dateOrder: order.order, dateOrderAmbiguous: order.ambiguous && !order.forced, dateOrderForced: !!order.forced,
      preset: { id: 'qif', label: 'QIF', spend: 'negative' },
    },
  };
}
