// The glue between files and findings, with no DOM in it so it can be tested in Node.
//
//   bytes -> text -> parseFile -> file record -> merge all files -> analyze
//
// A "file record" is everything the interface needs to show one file: what it
// was, what was read from it, what was skipped, and the options that produced it.

import { analyze } from '../core/detect.js';
import { isSupportedCurrency } from '../core/currency.js';
import { mergeSources, countOverlap } from '../core/merge.js';
import { readTable, sniffDelimiter } from '../parsers/csv.js';
import { ParseError, parseFile } from '../parsers/index.js';
import { localeDateOrder } from './format.js';

/**
 * Read one file's text into a record. Never throws for bad input: a file that cannot be read becomes a
 * record with `error`, so one bad file does not stop the others.
 */
export function ingestText({ id, name, text, size = text.length, encoding = 'utf-8', options = {}, locale = 'en-US' }) {
  const base = { id, name, size, encoding, text, options, transactions: [], warnings: [], info: null, session: null, error: null, rows: null, format: 'csv' };
  try {
    const res = parseFile(name, text, { sourceId: id, fallbackOrder: localeDateOrder(locale), ...options });
    if (res.format === 'session') return { ...base, format: 'session', session: res.session, text: null };
    return { ...base, format: res.format, transactions: res.transactions, info: res.info, warnings: res.warnings, rows: res.info?.rows || null };
  } catch (e) {
    if (!(e instanceof ParseError)) throw e;
    const record = { ...base, error: { message: e.message, code: e.code } };
    // Let the column settings dialog open on a file that could not be mapped automatically.
    if (e.code === 'no-columns' || e.code === 'no-rows') {
      try {
        record.rows = readTable(text, sniffDelimiter(text)).rows;
      } catch {
        record.rows = null;
      }
    }
    return record;
  }
}

/** A file read again with different settings (date order, sign, columns). */
export function reingest(record, options, locale) {
  return ingestText({ id: record.id, name: record.name, text: record.text, size: record.size, encoding: record.encoding, options: { ...record.options, ...options }, locale });
}

export function sourcesOf(files) {
  const out = [];
  for (const f of files) {
    if (f.error) continue;
    if (f.session) {
      f.session.sources.forEach((src, k) => {
        const sid = `${f.id}.${k}`;
        out.push({ id: sid, name: src.name, transactions: src.transactions.map((t, i) => ({ ...t, id: `${sid}:${i}`, source: sid })) });
      });
    } else out.push({ id: f.id, name: f.name, transactions: f.transactions });
  }
  return out;
}

/** Decisions stored in session files, merged oldest first so a later file wins. */
export function decisionsOf(files) {
  const out = {};
  for (const f of files) if (f.session) Object.assign(out, f.session.decisions);
  return out;
}

export function analyzeFiles(files, options = {}) {
  const sources = sourcesOf(files);
  const merged = mergeSources(sources);
  const analysis = analyze(merged, options);
  return { sources, merged, analysis, overlapRows: countOverlap(sources, merged) };
}

/** The currency a file declares (OFX does), else the fallback. Amounts are never converted. */
export function currencyFrom(files, fallback = 'USD') {
  for (const f of files) {
    const c = f.info?.currency;
    if (c && isSupportedCurrency(c)) return c;
  }
  return fallback;
}

/** What to put in a session file: the records that were read, not the raw text. */
export function sessionPayload(files, decisions) {
  return {
    sources: sourcesOf(files).map((s) => ({ name: s.name, format: 'session', transactions: s.transactions })),
    decisions,
  };
}
