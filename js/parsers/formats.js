// Turns a parsed table (array of rows) from a bank export into transactions.
//
// Banks disagree about almost everything: where the header is, what the columns
// are called, whether money out is negative, positive, or in its own column.
// The strategy is: find the header by looking for date + amount + description
// words; if there is no recognisable header, infer columns from the data; then
// work out the sign convention from the file itself. Every decision is returned
// in `info` so the UI can show it and let the person override it.

import { detectDecimalSeparator, parseAmount } from '../core/money.js';
import { detectDateOrder, parseDate } from './dateparse.js';

export class ParseError extends Error {
  constructor(message, code = 'parse') {
    super(message);
    this.name = 'ParseError';
    this.code = code;
  }
}

const clean = (s) => String(s ?? '').replace(/^﻿/, '').replace(/[ \s]+/g, ' ').trim();
const norm = (s) => clean(s).toLowerCase().replace(/["“”]/g, '');

// Synonym lists are in priority order: the first one present in the header wins.
const SYNONYMS = {
  date: ['transaction date', 'trans date', 'trans. date', 'date', 'posting date', 'posted date', 'post date', 'booking date', 'value date', 'transaction_date', 'datum', 'fecha'],
  description: ['description', 'transaction description', 'merchant', 'merchant name', 'payee', 'name', 'narrative', 'transaction details', 'original description', 'beschreibung', 'descripcion', 'details'],
  amount: ['amount', 'transaction amount', 'amt', 'value', 'betrag', 'importe'],
  debit: ['debit', 'debits', 'debit amount', 'withdrawal', 'withdrawals', 'money out', 'paid out', 'amount debit'],
  credit: ['credit', 'credits', 'credit amount', 'deposit', 'deposits', 'money in', 'paid in', 'amount credit'],
  type: ['type', 'transaction type', 'trans type'],
  balance: ['balance', 'running bal.', 'running balance'],
  category: ['category'],
  memo: ['memo', 'notes', 'reference', 'extended details'],
  status: ['status'],
};

/** Map header cells to field indexes (-1 when absent). */
export function mapColumns(headers) {
  const h = headers.map(norm);
  const used = new Set();
  const find = (names) => {
    for (const n of names) {
      const i = h.findIndex((x, idx) => x === n && !used.has(idx));
      if (i !== -1) {
        used.add(i);
        return i;
      }
    }
    return -1;
  };
  const mapping = {};
  mapping.date = find(SYNONYMS.date);
  mapping.description = find(SYNONYMS.description);
  mapping.amount = find(SYNONYMS.amount);
  mapping.debit = find(SYNONYMS.debit);
  mapping.credit = find(SYNONYMS.credit);
  mapping.type = find(SYNONYMS.type);
  mapping.balance = find(SYNONYMS.balance);
  mapping.category = find(SYNONYMS.category);
  mapping.memo = find(SYNONYMS.memo);
  mapping.status = find(SYNONYMS.status);
  return mapping;
}

const hasMoney = (m) => m.amount >= 0 || m.debit >= 0 || m.credit >= 0;
const hasText = (m) => m.description >= 0 || m.memo >= 0;

/** Recognise well-known export layouts. Used only to pick a sign convention and to tell the person what we saw. */
export function detectPreset(headers) {
  const h = headers.map(norm);
  const has = (...names) => names.every((n) => h.includes(n));
  if (has('transaction date', 'post date', 'description', 'category', 'type', 'amount')) {
    return { id: 'chase-card', label: 'Chase card', spend: 'negative' };
  }
  if (has('details', 'posting date', 'description', 'amount', 'type', 'balance')) {
    return { id: 'chase-checking', label: 'Chase checking', spend: 'negative' };
  }
  if (has('transaction date', 'posted date', 'card no.', 'description', 'debit', 'credit')) {
    return { id: 'capital-one', label: 'Capital One', spend: 'split' };
  }
  if (h.includes('extended details') || h.includes('card member') || h.includes('appears on your statement as')) {
    return { id: 'amex', label: 'American Express', spend: 'positive' };
  }
  if (has('date', 'description', 'amount', 'running bal.')) {
    return { id: 'bofa', label: 'Bank of America', spend: 'negative' };
  }
  return null;
}

/** Look for the header row within the first lines (some banks put an account summary above it). */
export function findHeaderRow(rows, scanLimit = 60) {
  const limit = Math.min(rows.length, scanLimit);
  for (let i = 0; i < limit; i++) {
    if (rows[i].length < 3) continue;
    const mapping = mapColumns(rows[i]);
    if (mapping.date >= 0 && hasMoney(mapping) && hasText(mapping)) return { index: i, mapping };
  }
  // Date + amount without a description column: still usable if there is a memo-like column we can fall back to.
  for (let i = 0; i < limit; i++) {
    if (rows[i].length < 2) continue;
    const mapping = mapColumns(rows[i]);
    if (mapping.date >= 0 && hasMoney(mapping)) return { index: i, mapping };
  }
  return null;
}

/** No header: work out which column is the date, the amount and the description from the data itself. */
export function inferMapping(rows) {
  const sample = rows.slice(0, 200);
  const width = Math.max(...sample.map((r) => r.length));
  const stats = [];
  for (let c = 0; c < width; c++) {
    let dates = 0;
    let nums = 0;
    let nonEmpty = 0;
    let len = 0;
    for (const r of sample) {
      const v = clean(r[c]);
      if (!v) continue;
      nonEmpty++;
      len += v.length;
      if (parseDate(v, 'MDY') || parseDate(v, 'DMY')) dates++;
      else if (parseAmount(v, '.') !== null || parseAmount(v, ',') !== null) nums++;
    }
    stats.push({ c, dates, nums, nonEmpty, avgLen: nonEmpty ? len / nonEmpty : 0 });
  }
  const need = Math.max(2, Math.floor(sample.length * 0.7));
  const dateCol = stats.filter((s) => s.dates >= need).sort((a, b) => b.dates - a.dates)[0];
  if (!dateCol) return null;
  const amountCol = stats.filter((s) => s.c !== dateCol.c && s.nums >= need).sort((a, b) => a.c - b.c)[0];
  if (!amountCol) return null;
  const textCol = stats
    .filter((s) => s.c !== dateCol.c && s.c !== amountCol.c && s.nonEmpty >= need && s.nums < need)
    .sort((a, b) => b.avgLen - a.avgLen)[0];
  if (!textCol) return null;
  return {
    date: dateCol.c, description: textCol.c, amount: amountCol.c,
    debit: -1, credit: -1, type: -1, balance: -1, category: -1, memo: -1, status: -1,
  };
}

/** "Beginning balance" and "Ending balance" lines carry a date but no amount. They are expected, not errors. */
const isBalanceRow = (desc, amountCells) => amountCells.every((c) => c === '') && /\bbalance\b/i.test(desc);

/**
 * Convert table rows into transactions.
 * Amounts in the result are integer cents where positive means money OUT of the account.
 *
 * options: sourceId, dateOrder ('auto'|'MDY'|'DMY'), spendSign ('auto'|'negative'|'positive'),
 *          decimal ('auto'|'.'|','), manual ({headerIndex, mapping}), fallbackOrder
 */
export function tableToTransactions(rows, options = {}) {
  const { sourceId = 'src', fallbackOrder = 'MDY' } = options;
  const warnings = [];
  if (!rows.length) throw new ParseError('The file is empty.', 'empty');

  // 1. Locate the table.
  let headerIndex;
  let mapping;
  let inferred = false;
  if (options.manual) {
    headerIndex = options.manual.headerIndex;
    mapping = { date: -1, description: -1, amount: -1, debit: -1, credit: -1, type: -1, balance: -1, category: -1, memo: -1, status: -1, ...options.manual.mapping };
  } else {
    const found = findHeaderRow(rows);
    if (found) {
      headerIndex = found.index;
      mapping = found.mapping;
    } else {
      const guess = inferMapping(rows);
      if (!guess) {
        throw new ParseError(
          "Couldn't find a date and an amount in this file. Open the column settings to point Stillbilled at them, or export the file again as CSV from your bank's transaction list.",
          'no-columns',
        );
      }
      headerIndex = -1;
      mapping = guess;
      inferred = true;
      warnings.push('This file has no header row, so columns were guessed from the data. Check the preview before trusting the results.');
    }
  }
  if (mapping.date < 0 || !hasMoney(mapping)) {
    throw new ParseError('A date column and an amount (or debit and credit) column are needed.', 'no-columns');
  }
  const headers = headerIndex >= 0 ? rows[headerIndex].map(clean) : [];
  const preset = headers.length ? detectPreset(headers) : null;
  const data = rows.slice(headerIndex + 1);
  const cell = (r, idx) => (idx >= 0 && idx < r.length ? clean(r[idx]) : '');

  // 2. Sample columns to settle date order and decimal separator.
  const dateSamples = [];
  const amountSamples = [];
  for (const r of data.slice(0, 500)) {
    dateSamples.push(cell(r, mapping.date));
    for (const idx of [mapping.amount, mapping.debit, mapping.credit]) if (idx >= 0) amountSamples.push(cell(r, idx));
  }
  const order = options.dateOrder === 'MDY' || options.dateOrder === 'DMY'
    ? { order: options.dateOrder, ambiguous: false, conflict: false, forced: true }
    : detectDateOrder(dateSamples, fallbackOrder);
  const decimal = options.decimal === '.' || options.decimal === ',' ? options.decimal : detectDecimalSeparator(amountSamples);

  // 3. First pass: parse every row.
  const skipped = { badDate: 0, noAmount: 0, pending: 0, blank: 0 };
  const parsed = [];
  let firstBadDate = null;
  const splitMode = mapping.amount < 0 && (mapping.debit >= 0 || mapping.credit >= 0);
  data.forEach((r, i) => {
    if (r.every((c) => clean(c) === '')) {
      skipped.blank++;
      return;
    }
    if (mapping.status >= 0 && /pending/i.test(cell(r, mapping.status))) {
      skipped.pending++;
      return;
    }
    const date = parseDate(cell(r, mapping.date), order.order);
    if (!date) {
      skipped.badDate++;
      if (!firstBadDate) firstBadDate = cell(r, mapping.date) || '(blank)';
      return;
    }
    let desc = cell(r, mapping.description);
    if (!desc && mapping.memo >= 0) desc = cell(r, mapping.memo);
    if (!desc && mapping.type >= 0) desc = cell(r, mapping.type);
    if (!desc) desc = '(no description)';
    if (desc.length > 200) desc = desc.slice(0, 200);

    if (splitMode) {
      const debit = mapping.debit >= 0 ? parseAmount(cell(r, mapping.debit), decimal) : null;
      const credit = mapping.credit >= 0 ? parseAmount(cell(r, mapping.credit), decimal) : null;
      if ((debit === null || debit === 0) && (credit === null || credit === 0)) {
        if (isBalanceRow(desc, [cell(r, mapping.debit), cell(r, mapping.credit)])) skipped.blank++;
        else skipped.noAmount++;
        return;
      }
      // Debit column holds money out (sometimes written negative); credit column holds money in.
      const cents = debit ? Math.abs(debit) : -Math.abs(credit);
      parsed.push({ i, date, desc, cents });
    } else {
      const amt = parseAmount(cell(r, mapping.amount), decimal);
      if (amt === null) {
        if (isBalanceRow(desc, [cell(r, mapping.amount)])) skipped.blank++;
        else skipped.noAmount++;
        return;
      }
      parsed.push({ i, date, desc, raw: amt });
    }
  });

  // 4. Sign convention for single-amount files.
  let spendSign = 'split';
  let signAuto = false;
  if (!splitMode) {
    if (options.spendSign === 'negative' || options.spendSign === 'positive') {
      spendSign = options.spendSign;
    } else if (preset && (preset.spend === 'negative' || preset.spend === 'positive')) {
      spendSign = preset.spend;
      signAuto = true;
    } else {
      let neg = 0;
      let pos = 0;
      for (const p of parsed) {
        if (p.raw < 0) neg++;
        else if (p.raw > 0) pos++;
      }
      // Most rows in a statement are spending, so the more common sign is "money out".
      spendSign = neg > pos ? 'negative' : 'positive';
      signAuto = true;
    }
    for (const p of parsed) p.cents = spendSign === 'negative' ? -p.raw : p.raw;
  }

  const transactions = parsed
    .filter((p) => p.cents !== 0)
    .map((p) => ({ id: `${sourceId}:${p.i}`, date: p.date, cents: p.cents, desc: p.desc, source: sourceId }));

  if (transactions.length === 0) {
    throw new ParseError(
      skipped.badDate > 0
        ? `No rows had a readable date (first unreadable value: "${firstBadDate}"). Try the date order setting, or export the file again.`
        : 'No transactions were found in this file.',
      'no-rows',
    );
  }
  if (skipped.badDate > 0) {
    warnings.push(`${skipped.badDate} row${skipped.badDate === 1 ? '' : 's'} skipped because the date could not be read (first: "${firstBadDate}").`);
  }
  if (skipped.noAmount > 0) warnings.push(`${skipped.noAmount} row${skipped.noAmount === 1 ? '' : 's'} skipped because the amount could not be read.`);
  if (skipped.pending > 0) warnings.push(`${skipped.pending} pending row${skipped.pending === 1 ? '' : 's'} left out. Pending charges often change when they post.`);
  if (order.ambiguous && !order.forced) {
    warnings.push(`Dates like 03/04/2026 can be read two ways. They were read as ${order.order === 'MDY' ? 'month first' : 'day first'}. Change this in Data and settings if that is wrong.`);
  }
  if (order.conflict) warnings.push('Some dates look month-first and others day-first. Check the date order setting.');

  const dates = transactions.map((t) => t.date).sort();
  return {
    transactions,
    warnings,
    info: {
      headerIndex, headers, mapping, preset, inferred,
      dateOrder: order.order, dateOrderAmbiguous: order.ambiguous && !order.forced, dateOrderForced: !!order.forced,
      decimal, spendSign, signAuto,
      rowsTotal: data.length, rowsRead: transactions.length, skipped,
      dateRange: { start: dates[0], end: dates[dates.length - 1] },
    },
  };
}
