// Session files let a person save their work and reopen it later without
// downloading statements again. A session file contains the normalised
// transactions, so it is as sensitive as the original export: the UI says so.
// Because a session file is user-supplied input, every field is validated.

import { isValidISO } from '../core/dates.js';
import { ParseError } from './formats.js';

export const SESSION_APP = 'stillbilled';
export const SESSION_SCHEMA = 1;
const MAX_TX = 500_000;
const DECISION_STATUSES = new Set(['cancel', 'ignore', 'keep']);

export function serializeSession({ sources, decisions, createdAt = new Date().toISOString() }) {
  return JSON.stringify({
    app: SESSION_APP,
    schema: SESSION_SCHEMA,
    createdAt,
    sources: sources.map((s) => ({
      name: s.name,
      format: s.format,
      transactions: s.transactions.map((t) => ({ date: t.date, cents: t.cents, desc: t.desc })),
    })),
    decisions,
  });
}

export function looksLikeSession(text) {
  return /^\s*\{/.test(text) && /"app"\s*:\s*"stillbilled"/.test(text.slice(0, 500));
}

/** Validate and normalise a session file. Throws ParseError with a plain-language message. */
export function parseSession(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ParseError('This looks like a session file but it is damaged and could not be read.', 'session');
  }
  if (!data || data.app !== SESSION_APP) throw new ParseError('This is not a Stillbilled session file.', 'session');
  if (data.schema !== SESSION_SCHEMA) {
    throw new ParseError(`This session file uses format version ${String(data.schema)}, which this version cannot open.`, 'session');
  }
  if (!Array.isArray(data.sources)) throw new ParseError('The session file has no sources in it.', 'session');

  let total = 0;
  const sources = data.sources.map((s, si) => {
    if (!s || !Array.isArray(s.transactions)) throw new ParseError('The session file is missing transactions.', 'session');
    const name = typeof s.name === 'string' ? s.name.slice(0, 120) : `Session file ${si + 1}`;
    const transactions = s.transactions.map((t, i) => {
      total++;
      if (total > MAX_TX) throw new ParseError('The session file is too large to open.', 'session');
      if (!t || !isValidISO(t.date) || !Number.isSafeInteger(t.cents) || t.cents === 0 || typeof t.desc !== 'string') {
        throw new ParseError(`Transaction ${i + 1} in "${name}" is not valid, so the session file was not opened.`, 'session');
      }
      return { id: `s${si}:${i}`, date: t.date, cents: t.cents, desc: t.desc.slice(0, 200), source: `s${si}` };
    });
    return { name, format: typeof s.format === 'string' ? s.format.slice(0, 20) : 'session', transactions };
  });

  const decisions = {};
  if (data.decisions && typeof data.decisions === 'object') {
    for (const [key, v] of Object.entries(data.decisions)) {
      if (key !== '__proto__' && key.length <= 120 && v && DECISION_STATUSES.has(v.status)) {
        decisions[key] = { status: v.status };
      }
    }
  }
  return { sources, decisions };
}
