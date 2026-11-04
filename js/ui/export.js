// Everything that leaves the page as text: the cancel list, a findings spreadsheet,
// and filenames. Pure functions, so they are tested without a browser.

/** Integer cents to a plain decimal string, without floating point: 1799 -> "17.99". */
export function centsToDecimal(cents) {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const s = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  return neg ? `-${s}` : s;
}

/**
 * Spreadsheet programs run cells that start with = + - or @ as formulas. Merchant names come from a bank
 * file, so a hostile or odd one must not become a formula in the file we hand back.
 */
export function csvCell(value) {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const toCSV = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

export const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'item';

export const sessionFilename = (iso) => `stillbilled-session-${iso}.json`;
export const findingsFilename = (iso) => `stillbilled-findings-${iso}.csv`;
export const cancelFilename = (iso) => `stillbilled-cancel-list-${iso}.csv`;

/** Rows for the findings spreadsheet. `decisions` maps item id to { status }. */
export function findingsRows(analysis, decisions = {}) {
  const head = [
    'Type', 'Name', 'Status', 'Rhythm', 'Latest amount', 'Per year', 'First charge', 'Last charge', 'Next expected',
    'Charges seen', 'Price change', 'Your decision', 'Statement text',
  ];
  const rows = [head];
  const decision = (id) => decisions[id]?.status || '';
  const all = [
    ...analysis.series.map((s) => ({ s, status: 'Active' })),
    ...analysis.stopped.map((s) => ({ s, status: 'No recent charge' })),
  ];
  for (const { s, status } of all) {
    const c = s.latestChange;
    rows.push([
      s.kind === 'bill' ? 'Bill' : 'Subscription',
      s.name,
      status,
      s.cadence.label,
      centsToDecimal(s.cents),
      centsToDecimal(s.annualCents),
      s.firstDate,
      s.lastDate,
      status === 'Active' ? s.nextDate : '',
      s.charges.length,
      c ? `${centsToDecimal(c.fromCents)} to ${centsToDecimal(c.toCents)} on ${c.date}` : '',
      decision(s.id),
      s.lastDesc,
    ]);
  }
  for (const d of analysis.doubles) {
    rows.push([
      'Possible double charge',
      d.name,
      d.refunded ? 'Refunded' : 'Check',
      '',
      centsToDecimal(d.cents),
      '',
      d.charges[0].date,
      d.charges[d.charges.length - 1].date,
      '',
      d.count,
      '',
      decision(d.id),
      d.charges[0].desc,
    ]);
  }
  return rows;
}

/** The plain-text cancel list people paste into a note or an email to themselves. */
export function cancelListText(items, fmt) {
  const total = items.reduce((a, s) => a + s.annualCents, 0);
  const lines = [`Subscriptions to cancel (${items.length})`, ''];
  for (const s of items) {
    lines.push(`${s.name}: ${fmt.money(s.cents)} ${s.cadence.label.toLowerCase()}, about ${fmt.whole(s.annualCents)} a year. Last charged ${fmt.date(s.lastDate)}.`);
  }
  lines.push('', `Together: about ${fmt.whole(total)} a year.`);
  return lines.join('\n');
}

export function cancelRows(items) {
  const rows = [['Name', 'Rhythm', 'Amount', 'Per year', 'Last charge', 'Statement text']];
  for (const s of items) rows.push([s.name, s.cadence.label, centsToDecimal(s.cents), centsToDecimal(s.annualCents), s.lastDate, s.lastDesc]);
  return rows;
}

/** Possible double charges the person marked to dispute. */
export function disputeListText(items, fmt) {
  const lines = [`Charges to check or dispute (${items.length})`, ''];
  for (const d of items) {
    const dates = d.charges.map((c) => fmt.date(c.date)).join(' and ');
    lines.push(`${d.name}: ${fmt.money(d.cents)} charged ${d.count === 2 ? 'twice' : `${d.count} times`} (${dates}). Extra: ${fmt.money(d.extraCents)}.`);
  }
  return lines.join('\n');
}
