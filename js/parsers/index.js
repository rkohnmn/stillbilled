// Entry point for reading a file the person gave us. Sniffs the format from
// the content (not just the extension), then delegates.

import { readTable, sniffDelimiter } from './csv.js';
import { ParseError, tableToTransactions } from './formats.js';
import { parseOFX } from './ofx.js';
import { parseQIF } from './qif.js';
import { looksLikeSession, parseSession } from './session.js';

export { ParseError } from './formats.js';
export { serializeSession } from './session.js';

export const MAX_FILE_BYTES = 30 * 1024 * 1024;

function sniffFormat(name, text) {
  const head = text.slice(0, 4000);
  if (/^\s*OFXHEADER|<OFX[\s>]/i.test(head)) return 'ofx';
  if (/^\s*!(Type|Account|Option)/im.test(head.slice(0, 400))) return 'qif';
  if (looksLikeSession(head)) return 'session';
  if (/^\s*%PDF-/.test(head)) return 'pdf';
  if (/\.(ofx|qfx)$/i.test(name)) return 'ofx';
  if (/\.qif$/i.test(name)) return 'qif';
  return 'csv';
}

/**
 * Read one file's text.
 * options: sourceId, dateOrder, spendSign, decimal, manual (see tableToTransactions)
 * Returns { format, transactions, info, warnings } or, for session files, { format: 'session', session }.
 */
export function parseFile(name, text, options = {}) {
  if (typeof text !== 'string' || text.trim() === '') throw new ParseError('The file is empty.', 'empty');
  const format = sniffFormat(name, text);
  if (format === 'pdf') {
    throw new ParseError('PDF statements cannot be read yet. Download the CSV, OFX or QFX version of your transactions from your bank instead.', 'pdf');
  }
  if (format === 'session') return { format, session: parseSession(text) };
  if (format === 'ofx') return { format, ...parseOFX(text, options) };
  if (format === 'qif') return { format, ...parseQIF(text, options) };

  // Binary-looking input (for example an .xlsx renamed or dropped by mistake)
  if (/\u0000/.test(text.slice(0, 2000)) || text.startsWith('PK')) {
    throw new ParseError("This doesn't look like a text export. Save the spreadsheet as CSV and try again.", 'binary');
  }
  const delimiter = sniffDelimiter(text);
  const { rows } = readTable(text, delimiter);
  const result = tableToTransactions(rows, options);
  result.info.delimiter = delimiter;
  result.info.rows = rows; // kept so the column settings dialog can show a preview without re-reading
  return { format, ...result };
}
