// A small RFC 4180 CSV reader: quoted fields, escaped quotes, embedded newlines,
// CRLF/LF/CR line endings, BOM, and delimiter sniffing for comma, semicolon,
// tab and pipe. Written by hand so the app needs no dependency to read a file.

/** Parse delimited text into an array of rows (arrays of strings). Never throws on malformed quoting. */
export function parseCSV(text, delimiter = ',') {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const n = text.length;

  for (let i = 0; i < n; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"' && field === '') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Excel writes "sep=;" as a first line to declare its delimiter. */
export function readSepHint(text) {
  const m = /^﻿?sep=(.)\r?\n/i.exec(text);
  return m ? m[1] : null;
}

/** Pick the delimiter that yields the most consistent multi-column table in the first lines. */
export function sniffDelimiter(text) {
  const hint = readSepHint(text);
  if (hint) return hint;
  const sample = text.slice(0, 20000);
  let best = ',';
  let bestScore = -1;
  for (const d of [',', ';', '\t', '|']) {
    const rows = parseCSV(sample, d)
      .filter((r) => r.some((c) => c.trim() !== ''))
      .slice(0, 25);
    if (rows.length === 0) continue;
    const counts = new Map();
    for (const r of rows) counts.set(r.length, (counts.get(r.length) || 0) + 1);
    let modeLen = 1;
    let modeCount = 0;
    for (const [len, count] of counts) {
      if (count > modeCount || (count === modeCount && len > modeLen)) {
        modeLen = len;
        modeCount = count;
      }
    }
    // A wrong delimiter often leaves stray quote marks inside fields (a quoted ";" file read as ","),
    // so fields containing a quote count against it.
    let stray = 0;
    for (const r of rows) for (const c of r) if (c.includes('"')) stray++;
    const penalty = stray > 0 ? 0.5 : 0;
    const score = modeLen > 1 ? Math.max(0, modeCount / rows.length - penalty) * Math.log2(modeLen + 1) : 0;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

/** Read CSV text with a sniffed delimiter. Drops a leading "sep=" line and fully empty rows. */
export function readTable(text, delimiter) {
  const d = delimiter ?? sniffDelimiter(text);
  const body = readSepHint(text) ? text.replace(/^﻿?sep=.\r?\n/i, '') : text;
  const rows = parseCSV(body, d).filter((r) => r.some((c) => c.trim() !== ''));
  return { rows, delimiter: d };
}
