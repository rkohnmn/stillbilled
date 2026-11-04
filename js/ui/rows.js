// Ledger rows: one recurring charge, one possible double charge. Each row has a
// margin where the person's decision is ticked or crossed, a button that opens the
// evidence (a price chart and every charge behind the finding), and a decision control.

import { priceChart } from './chart.js';
import { h, icon } from './dom.js';

let counter = 0;
const uid = (prefix) => `${prefix}-${++counter}`;

export const DECISION_LABELS = {
  recurring: { cancel: 'Cancel', keep: 'Keep', ignore: 'Ignore' },
  double: { cancel: 'Dispute', keep: 'It is fine', ignore: 'Ignore' },
};
const GLYPH = { cancel: 'cross', keep: 'tick', ignore: 'dash' };
const CONFIDENCE_TEXT = {
  high: 'High. This looks like a real subscription.',
  medium: 'Medium. It repeats, but there is not much history yet.',
  low: 'Low. It may be a coincidence, so check the charges.',
};

/** Fill the margin with the tick, cross or dash for a decision. Pass animate to draw it in. */
export function setMark(row, status, animate = false) {
  const mark = row.querySelector('.row-mark');
  mark.replaceChildren();
  row.dataset.decision = status || '';
  if (animate) row.dataset.animate = '1';
  else delete row.dataset.animate;
  if (status) mark.append(icon(GLYPH[status], { size: 22 }));
}

function decideGroup(ctx, id, kind, name) {
  const labels = DECISION_LABELS[kind];
  const group = h('div', { class: 'decide', role: 'group', 'aria-label': `Decision for ${name}` });
  for (const status of ['cancel', 'keep', 'ignore']) {
    const pressed = ctx.decisionOf(id) === status;
    group.append(
      h('button', {
        type: 'button',
        'data-status': status,
        'aria-pressed': pressed ? 'true' : 'false',
        onclick: () => ctx.actions.decide(id, status),
      }, icon(GLYPH[status], { size: 14 }), labels[status]),
    );
  }
  return group;
}

function chargesTable(name, headers, rows, changedRows = new Set()) {
  const table = h('table', { class: 'charges' },
    h('caption', { class: 'sr-only' }, `Charges for ${name}`),
    h('thead', {}, h('tr', {}, ...headers.map(([label, num]) => h('th', { scope: 'col', class: num ? 'num' : null }, label)))),
    h('tbody', {}, ...rows.map((cells, i) =>
      h('tr', { class: changedRows.has(i) ? 'is-change' : null }, ...cells.map((c, k) => h('td', { class: headers[k][1] ? 'num' : null }, c))))),
  );
  return h('div', { class: 'table-scroll', tabindex: '0', role: 'region', 'aria-label': `Charges for ${name}. Scrollable.` }, table);
}

function facts(pairs) {
  return h('dl', { class: 'facts' }, ...pairs.filter(Boolean).flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));
}

function seriesDetail(ctx, item) {
  const { fmt } = ctx;
  const newestFirst = [...item.charges].reverse();
  const changeByDate = new Map(item.changes.map((c) => [c.date, c]));
  const changed = new Set();
  const rows = newestFirst.map((c, i) => {
    const ch = changeByDate.get(c.date);
    if (ch) changed.add(i);
    return [fmt.date(c.date), fmt.money(c.cents), ch ? `${fmt.signed(ch.deltaCents)} (${ch.pct > 0 ? '+' : ''}${ch.pct}%)` : ''];
  });
  const skipped = item.regularity > 0 ? Math.round((item.charges.length - 1) * (1 / item.regularity - 1)) : 0;
  const up = item.latestChange && item.latestChange.deltaCents > 0;
  return h('div', { class: 'detail' },
    h('div', {},
      h('h3', {}, 'Price over time'),
      priceChart(item, fmt),
      facts([
        ['Statement text', item.lastDesc],
        ['Seen', `${item.charges.length} charges, ${fmt.date(item.firstDate)} to ${fmt.date(item.lastDate)}${skipped ? `, ${skipped} missed ${skipped === 1 ? 'cycle' : 'cycles'}` : ''}`],
        item.active ? ['Next one expected', `around ${fmt.date(item.nextDate)}`] : ['Last charge', fmt.date(item.lastDate)],
        ['Paid in your files', fmt.money(item.paidCents)],
        up ? ['Extra paid since the increase', fmt.money(item.paidExtraCents)] : null,
        up ? ['Costs more each year', fmt.money(item.increaseExtraPerYearCents)] : null,
        ['How sure', CONFIDENCE_TEXT[item.confidence]],
      ])),
    h('div', {},
      h('h3', {}, 'Every charge found, newest first'),
      chargesTable(item.name, [['Date'], ['Amount', true], ['Change', true]], rows, changed)),
  );
}

function doubleDetail(ctx, d) {
  const { fmt } = ctx;
  const rows = d.charges.map((c) => [fmt.date(c.date), fmt.money(c.cents), c.desc]);
  return h('div', { class: 'detail' },
    h('div', {},
      h('h3', {}, 'What to do'),
      h('p', {}, d.refunded
        ? `A refund of ${fmt.money(d.refunded.cents)} from this merchant appeared on ${fmt.date(d.refunded.date)}, so this was probably already put right. It is not counted in the totals.`
        : 'Look at these charges in your bank\'s transaction list. Two identical purchases can be real. If one was a mistake, ask the merchant for a refund, and if they do not answer, dispute it with your bank.'),
      facts([
        ['Extra if it was a mistake', fmt.money(d.extraCents)],
        ['Time between charges', d.gapDays === 0 ? 'Same day' : `${d.gapDays} ${d.gapDays === 1 ? 'day' : 'days'}`],
      ])),
    h('div', {},
      h('h3', {}, 'The charges'),
      chargesTable(d.name, [['Date'], ['Amount', true], ['Statement text']], rows)),
  );
}

function expandable(ctx, key, build) {
  const bodyId = uid('detail');
  const body = h('div', { class: 'row-body', id: bodyId, hidden: true });
  const open = ctx.state.ui.expanded.has(key);
  let built = false;
  const set = (button, on) => {
    button.setAttribute('aria-expanded', on ? 'true' : 'false');
    body.hidden = !on;
    if (on && !built) {
      body.append(build());
      built = true;
    }
    if (on) ctx.state.ui.expanded.add(key);
    else ctx.state.ui.expanded.delete(key);
  };
  return { body, bodyId, open, set };
}

/** A recurring charge. variant: 'recurring' (with a decision) or 'stopped' (without). */
export function seriesRow(ctx, item, { section, maxAnnual, variant = 'recurring' }) {
  const { fmt } = ctx;
  const key = `${section}:${item.id}`;
  const ex = expandable(ctx, key, () => seriesDetail(ctx, item));
  const latest = item.latestChange;
  const meta = [item.cadence.label, item.categoryLabel, `last charged ${fmt.date(item.lastDate)}`].filter(Boolean).join(', ');

  const flags = [];
  if (latest && latest.deltaCents > 0) flags.push(h('span', { class: 'row-flag flag-up' }, icon('up', { size: 14 }), `up from ${fmt.money(latest.fromCents)}`));
  else if (latest && latest.deltaCents < 0) flags.push(h('span', { class: 'row-flag flag-neutral' }, icon('down', { size: 14 }), `down from ${fmt.money(latest.fromCents)}`));
  if (item.confidence === 'low') flags.push(h('span', { class: 'row-flag flag-neutral' }, 'not sure'));
  if (variant === 'stopped') flags.push(h('span', { class: 'row-flag flag-stopped' }, `no charge since ${fmt.dateShort(item.lastDate)}`));

  const bar = h('span', { class: 'bar', 'aria-hidden': 'true' }, h('span', { class: 'bar-fill' }));
  bar.style.setProperty('--w', String(Math.max(0.02, Math.min(1, item.annualCents / (maxAnnual || 1)))));

  const button = h('button', { type: 'button', class: 'row-main', 'aria-expanded': 'false', 'aria-controls': ex.bodyId },
    h('span', { class: 'row-text' }, h('span', { class: 'row-name' }, item.name), h('span', { class: 'row-meta' }, meta)),
    icon('chevron', { size: 20 }));
  button.lastChild.classList.add('row-chevron');
  button.addEventListener('click', () => ex.set(button, button.getAttribute('aria-expanded') !== 'true'));

  const row = h('li', { class: 'row', dataset: { id: item.id, kind: variant } },
    h('div', { class: 'row-mark', 'aria-hidden': 'true' }),
    button,
    h('div', { class: 'row-figures' }, h('span', { class: 'row-amount num' }, fmt.money(item.cents)), ...flags),
    h('div', { class: 'row-year' }, h('span', { class: 'row-year-value num' }, variant === 'stopped' ? `was ${fmt.whole(item.annualCents)} a year` : `${fmt.whole(item.annualCents)} a year`), variant === 'stopped' ? null : bar),
    variant === 'stopped' ? null : h('div', { class: 'row-decide' }, decideGroup(ctx, item.id, 'recurring', item.name)),
    ex.body,
  );
  setMark(row, variant === 'stopped' ? '' : ctx.decisionOf(item.id) || '');
  if (ex.open) ex.set(button, true);
  return row;
}

/** A possible double charge. */
export function doubleRow(ctx, d) {
  const { fmt } = ctx;
  const key = `doubles:${d.id}`;
  const ex = expandable(ctx, key, () => doubleDetail(ctx, d));
  const when = d.gapDays === 0
    ? `Charged ${d.count === 2 ? 'twice' : `${d.count} times`} on ${fmt.date(d.charges[0].date)}`
    : `Charged on ${[...d.charges.slice(0, -1).map((c) => fmt.dateShort(c.date)), fmt.date(d.charges[d.charges.length - 1].date)].join(' and ')}`;
  const flags = [];
  if (d.refunded) flags.push(h('span', { class: 'row-flag flag-neutral' }, `refunded ${fmt.dateShort(d.refunded.date)}`));
  else flags.push(h('span', { class: 'row-flag flag-double' }, icon('alert', { size: 14 }), d.confidence === 'likely' ? 'likely double charge' : 'possible double charge'));

  const button = h('button', { type: 'button', class: 'row-main', 'aria-expanded': 'false', 'aria-controls': ex.bodyId },
    h('span', { class: 'row-text' }, h('span', { class: 'row-name' }, d.name), h('span', { class: 'row-meta' }, when)),
    icon('chevron', { size: 20 }));
  button.lastChild.classList.add('row-chevron');
  button.addEventListener('click', () => ex.set(button, button.getAttribute('aria-expanded') !== 'true'));

  const row = h('li', { class: 'row', dataset: { id: d.id, kind: 'double' } },
    h('div', { class: 'row-mark', 'aria-hidden': 'true' }),
    button,
    h('div', { class: 'row-figures' }, h('span', { class: 'row-amount num' }, fmt.money(d.cents)), ...flags),
    h('div', { class: 'row-year' }, h('span', { class: 'row-year-value num' }, d.refunded ? 'refunded' : `${fmt.money(d.extraCents)} extra`)),
    h('div', { class: 'row-decide' }, decideGroup(ctx, d.id, 'double', d.name)),
    ex.body,
  );
  setMark(row, ctx.decisionOf(d.id) || '');
  if (ex.open) ex.set(button, true);
  return row;
}

/** Re-sync the pressed state and the margin mark of every row after a decision changes. */
export function syncDecisions(root, ctx, changedId = null) {
  for (const row of root.querySelectorAll('.row[data-id]')) {
    const id = row.dataset.id;
    const status = ctx.decisionOf(id) || '';
    if ((row.dataset.decision || '') !== status) setMark(row, status, id === changedId);
    for (const b of row.querySelectorAll('.decide button')) b.setAttribute('aria-pressed', b.dataset.status === status ? 'true' : 'false');
  }
}
