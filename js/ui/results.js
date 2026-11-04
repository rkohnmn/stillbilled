// The results page: summary, findings, the ledger lists, and the files panel.
// Built from ctx = { state, fmt, actions, decisionOf, todayISO }.

import { diffDays } from '../core/dates.js';
import { h, icon } from './dom.js';
import { filesSection } from './files.js';
import { plural } from './format.js';
import { doubleRow, seriesRow } from './rows.js';
import { effectiveOverlaps, effectiveTotals } from './totals.js';

function sectionHead(id, title, note) {
  return h('div', { class: 'section-head' }, h('h2', { id: `${id}-title` }, title), note ? h('p', { class: 'section-note' }, note) : null);
}

function ledger(rows) {
  return h('ul', { class: 'ledger' }, ...rows);
}

/** The "marked to cancel" block. Rebuilt whenever a decision changes. */
export function planBlock(ctx) {
  const { fmt, actions, state } = ctx;
  const { analysis } = state.derived;
  const cancel = analysis.series.filter((s) => ctx.decisionOf(s.id) === 'cancel');
  const dispute = analysis.doubles.filter((d) => ctx.decisionOf(d.id) === 'cancel' && !d.refunded);
  const total = cancel.reduce((a, s) => a + s.annualCents, 0);
  const el = h('div', { class: 'plan', id: 'plan' });
  if (!cancel.length && !dispute.length) {
    el.append(h('p', {}, 'Mark what you plan to cancel and Stillbilled adds up what you would save.'));
    return el;
  }
  const parts = [];
  if (cancel.length) parts.push(`${plural(cancel.length, 'charge')} marked to cancel, about ${fmt.whole(total)} a year`);
  if (dispute.length) parts.push(`${plural(dispute.length, 'charge')} to dispute`);
  el.append(
    h('p', {}, h('strong', {}, parts.join('. ')), '.'),
    h('button', { class: 'btn btn-small', type: 'button', onclick: () => actions.openList() }, 'Review your list'),
  );
  return el;
}

/** The figure, the plan and the findings list. Rebuilt in place when a decision changes. */
export function summary(ctx) {
  const { fmt, state } = ctx;
  const { analysis } = state.derived;
  const t = effectiveTotals(analysis, state.decisions);
  const overlaps = effectiveOverlaps(analysis, state.decisions);
  const wrap = h('section', { class: 'summary', id: 'summary', 'aria-labelledby': 'summary-title' });
  const left = h('div', {});
  left.append(h('h2', { id: 'summary-title', class: 'sr-only' }, 'Summary'));

  if (t.activeCount === 0 && t.ignoredCount === 0) {
    left.append(
      h('p', { class: 'summary-figure' }, 'Nothing recurring found'),
      h('p', { class: 'summary-sub' }, `Stillbilled needs the same charge to show up at least twice on a regular rhythm. Your files hold ${plural(fmt.number(analysis.counts.transactions), 'transaction')} over ${plural(fmt.number(analysis.range?.days ?? 0), 'day')}. Adding older statements usually helps.`),
    );
  } else {
    const detail = [];
    if (t.billAnnualCents > 0 && t.subscriptionAnnualCents > 0) detail.push(`${fmt.whole(t.subscriptionAnnualCents)} in subscriptions and ${fmt.whole(t.billAnnualCents)} in bills`);
    const ignored = t.ignoredCount ? ` ${plural(t.ignoredCount, 'charge')} you marked ignore ${t.ignoredCount === 1 ? 'is' : 'are'} left out.` : '';
    left.append(
      h('p', { class: 'summary-figure' }, fmt.whole(t.annualCents), h('span', { class: 'summary-unit' }, 'a year')),
      h('p', { class: 'summary-sub' },
        `That is about ${fmt.whole(t.monthlyCents)} a month across ${plural(t.activeCount, 'recurring charge')} that ${t.activeCount === 1 ? 'is' : 'are'} still going${detail.length ? `: ${detail[0]}` : ''}. Based on activity from ${fmt.date(analysis.range.from)} to ${fmt.date(analysis.range.to)}.${ignored}`),
    );
  }
  left.append(planBlock(ctx));

  const stoppedN = analysis.stopped.length;
  const overlapTotal = overlaps.reduce((a, o) => a + o.annualCents, 0);
  const items = [
    { id: 'increases', n: t.increaseCount, ico: 'up', tone: '', text: (n) => plural(n, 'price increase'), value: `+${fmt.whole(t.increaseExtraPerYearCents)} a year`, none: 'No price increases found' },
    { id: 'doubles', n: t.doubleCount, ico: 'alert', tone: '', text: (n) => plural(n, 'possible double charge'), value: fmt.money(t.doubleExtraCents), none: 'No double charges found' },
    { id: 'overlaps', n: overlaps.length, ico: 'layers', tone: 'is-warn', text: (n) => `${plural(n, 'group')} of overlapping services`, value: `${fmt.whole(overlapTotal)} a year`, none: 'No overlapping services found' },
    { id: 'stopped', n: stoppedN, ico: 'tick', tone: 'is-calm', text: (n) => `${plural(n, 'charge')} that stopped`, value: 'no longer charging', none: 'No stopped charges' },
  ];
  const list = h('ul', { class: 'findings' });
  for (const it of items) {
    if (it.n === 0) {
      list.append(h('li', {}, h('div', { class: 'none' }, icon('dash', { size: 18 }), h('span', {}, it.none))));
      continue;
    }
    const a = h('a', { href: `#${it.id}` }, icon(it.ico, { size: 20 }), h('strong', {}, it.text(it.n)), h('span', { class: 'finding-value' }, it.value));
    if (it.id === 'stopped') a.addEventListener('click', () => { const d = document.getElementById('stopped'); if (d) d.open = true; });
    list.append(h('li', { class: it.tone }, a));
  }
  wrap.append(left, list);
  return wrap;
}

function toolbar(ctx) {
  const { actions } = ctx;
  const btn = (label, ico, fn, cls = 'btn btn-secondary btn-small') => h('button', { class: cls, type: 'button', onclick: fn }, icon(ico, { size: 16 }), label);
  return h('div', { class: 'toolbar', role: 'toolbar', 'aria-label': 'Actions' },
    btn('Add files', 'plus', () => actions.chooseFiles()),
    btn('Save session', 'save', () => actions.saveSession()),
    btn('Download findings', 'download', () => actions.downloadFindings()),
    btn('Print', 'print', () => actions.print()),
    h('span', { class: 'spacer' }),
    btn('Start over', 'trash', () => actions.startOver(), 'btn btn-quiet btn-small'),
  );
}

function noticeNodes(ctx) {
  const { state, fmt, actions } = ctx;
  const { analysis } = state.derived;
  const nodes = [];
  if (state.files.some((f) => f.sample)) {
    nodes.push(h('p', { class: 'note' }, h('span', {}, 'You are looking at made-up sample data. Nothing here is about you.'), h('button', { class: 'btn btn-secondary btn-small', type: 'button', onclick: () => actions.startOver(true) }, 'Use my own files')));
  }
  if (analysis.range) {
    const age = diffDays(analysis.range.to, ctx.todayISO());
    if (age > 60 && !state.files.some((f) => f.sample)) {
      nodes.push(h('p', { class: 'note' }, h('span', {}, `Your newest transaction is from ${fmt.date(analysis.range.to)}. The lists show what was going on then, so some of these may have changed since.`)));
    }
  }
  for (const n of analysis.notes) nodes.push(h('p', { class: 'note' }, h('span', {}, n.text)));
  const failed = state.files.filter((f) => f.error);
  for (const f of failed) {
    nodes.push(h('p', { class: 'message', role: 'alert' }, h('span', {}, h('strong', {}, `${f.name}: `), f.error.message)));
  }
  return nodes;
}

function increasesSection(ctx) {
  const { analysis } = ctx.state.derived;
  const items = analysis.series.filter((s) => s.increaseExtraPerYearCents > 0).sort((a, b) => b.increaseExtraPerYearCents - a.increaseExtraPerYearCents);
  if (!items.length) return null;
  const max = Math.max(...items.map((s) => s.annualCents));
  return h('section', { id: 'increases', 'aria-labelledby': 'increases-title' },
    sectionHead('increases', 'Price increases', 'These kept charging on the same rhythm but cost more than before. Open one to see the old and new price and every charge.'),
    ledger(items.map((s) => seriesRow(ctx, s, { section: 'increases', maxAnnual: max }))),
  );
}

function doublesSection(ctx) {
  const { analysis } = ctx.state.derived;
  if (!analysis.doubles.length) return null;
  return h('section', { id: 'doubles', 'aria-labelledby': 'doubles-title' },
    sectionHead('doubles', 'Possible double charges', 'The same merchant and exactly the same amount, within three days. Two identical purchases can be genuine, so look before you act.'),
    ledger(analysis.doubles.map((d) => doubleRow(ctx, d))),
  );
}

const SORTS = {
  cost: (a, b) => b.annualCents - a.annualCents || a.name.localeCompare(b.name),
  name: (a, b) => a.name.localeCompare(b.name),
  next: (a, b) => (a.nextDate < b.nextDate ? -1 : a.nextDate > b.nextDate ? 1 : a.name.localeCompare(b.name)),
};

function recurringSection(ctx) {
  const { state, actions } = ctx;
  const { analysis } = state.derived;
  if (!analysis.series.length) return null;
  const ui = state.ui;
  const maxAnnual = Math.max(...analysis.series.map((s) => s.annualCents));
  const hasBills = analysis.series.some((s) => s.kind === 'bill');
  const list = h('div', {});
  const count = h('p', { class: 'section-note', role: 'status' });

  const paint = () => {
    const q = ui.search.trim().toLowerCase();
    const shown = analysis.series
      .filter((s) => (s.kind === 'bill' ? ui.showBills : ui.showSubs))
      .filter((s) => !q || s.name.toLowerCase().includes(q) || s.lastDesc.toLowerCase().includes(q) || (s.categoryLabel || '').toLowerCase().includes(q))
      .sort(SORTS[ui.sort]);
    list.replaceChildren(shown.length
      ? ledger(shown.map((s) => seriesRow(ctx, s, { section: 'recurring', maxAnnual })))
      : h('p', { class: 'empty' }, 'Nothing matches. Clear the search or turn a filter back on.'));
    count.textContent = shown.length === analysis.series.length ? '' : `Showing ${shown.length} of ${analysis.series.length}.`;
    actions.syncDecisionMarks(list);
  };

  const search = h('input', { type: 'search', id: 'search', placeholder: 'Search by name', 'aria-label': 'Search recurring charges', value: ui.search });
  search.addEventListener('input', () => { ui.search = search.value; paint(); });
  const sort = h('select', { id: 'sort', 'aria-label': 'Sort recurring charges' },
    h('option', { value: 'cost' }, 'Most expensive per year first'),
    h('option', { value: 'name' }, 'Name, A to Z'),
    h('option', { value: 'next' }, 'Next charge soonest'));
  sort.value = ui.sort;
  sort.addEventListener('change', () => { ui.sort = sort.value; paint(); });
  const check = (label, key) => {
    const input = h('input', { type: 'checkbox', checked: ui[key] });
    input.checked = ui[key];
    input.addEventListener('change', () => { ui[key] = input.checked; paint(); });
    return h('label', {}, input, label);
  };

  const controls = h('div', { class: 'list-controls' }, search, sort, check('Subscriptions', 'showSubs'), hasBills ? check('Bills', 'showBills') : null);
  const section = h('section', { id: 'recurring', 'aria-labelledby': 'recurring-title' },
    sectionHead('recurring', 'Everything that repeats', 'Charges that came back on a regular rhythm and are still going. Mark the ones you plan to cancel. Bills such as rent, insurance and phone are listed too, with their names as they appear on your statement.'),
    controls, count, list);
  paint();
  return section;
}

function overlapsSection(ctx) {
  const { analysis } = ctx.state.derived;
  const { fmt } = ctx;
  if (!analysis.overlaps.length) return null;
  const byId = new Map(analysis.series.map((s) => [s.id, s]));
  return h('section', { id: 'overlaps', 'aria-labelledby': 'overlaps-title' },
    sectionHead('overlaps', 'Overlapping services', 'You pay for more than one service in the same category. That is sometimes on purpose. Worth a look if you rarely use them all.'),
    h('ul', { class: 'overlap-list' }, ...analysis.overlaps.map((o) => {
      const names = o.members.map((id) => byId.get(id)).filter(Boolean);
      return h('li', {},
        h('div', { class: 'row-mark', 'aria-hidden': 'true' }, icon('layers', { size: 22 })),
        h('div', { class: 'overlap-body' },
          h('p', {}, h('strong', {}, o.label), ` ${fmt.whole(o.annualCents)} a year`),
          h('p', { class: 'row-meta' }, names.map((s) => `${s.name} (${fmt.money(s.cents)} ${s.cadence.label.toLowerCase()})`).join(', '))));
    })),
  );
}

function stoppedSection(ctx) {
  const { analysis } = ctx.state.derived;
  if (!analysis.stopped.length) return null;
  const max = Math.max(...analysis.stopped.map((s) => s.annualCents));
  return h('details', { id: 'stopped', class: 'stopped' },
    h('summary', {}, `Stopped (${analysis.stopped.length}) `, h('span', { class: 'section-note' }, 'These repeated for a while and then stopped. If you meant to cancel them, it worked.')),
    ledger(analysis.stopped.map((s) => seriesRow(ctx, s, { section: 'stopped', maxAnnual: max, variant: 'stopped' }))),
  );
}

export function renderResults(ctx) {
  const parts = [
    h('h1', { id: 'results-title', class: 'sr-only', tabindex: '-1' }, 'Your results'),
    ...noticeNodes(ctx),
    summary(ctx),
    toolbar(ctx),
    increasesSection(ctx),
    doublesSection(ctx),
    recurringSection(ctx),
    overlapsSection(ctx),
    stoppedSection(ctx),
    filesSection(ctx),
  ];
  return parts.filter(Boolean);
}

/** A sentence for screen readers once the analysis is ready. */
export function announcement(ctx) {
  const { analysis } = ctx.state.derived;
  const { fmt } = ctx;
  const t = effectiveTotals(analysis, ctx.state.decisions);
  if (!analysis.series.length && !analysis.doubles.length) return 'Analysis finished. No recurring charges were found.';
  return [
    `Analysis finished. ${plural(t.activeCount, 'recurring charge')}, about ${fmt.whole(t.annualCents)} a year.`,
    `${plural(t.increaseCount, 'price increase')}.`,
    `${plural(t.doubleCount, 'possible double charge')}.`,
  ].join(' ');
}
