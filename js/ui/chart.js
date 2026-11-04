// Price history for one recurring charge: a step line, one marker per charge,
// and a red marker with a labelled callout wherever the price went up.
//
// Rules this follows (they come from the dataviz guidance used for the design):
//   one series, so no legend; the title and the table beside it name it;
//   the y axis shows its actual range, not zero, and says so by labelling both ends;
//   colour never carries meaning alone: increases get a larger marker and a text callout;
//   hover shows the exact date and amount, and the same numbers are in the table next to it.

import { toDay } from '../core/dates.js';
import { h, s } from './dom.js';

const M = { l: 58, r: 18, t: 26, b: 30 };

export function priceChart(item, fmt) {
  // On a phone the chart is drawn smaller in its own units, so its text is not shrunk to illegibility.
  const narrow = typeof matchMedia === 'function' && matchMedia('(max-width: 39.99rem)').matches;
  const W = narrow ? 340 : 560;
  const H = narrow ? 190 : 176;
  const pts = item.charges.map((c, i) => ({
    date: c.date,
    cents: c.cents,
    day: toDay(c.date),
    delta: i === 0 ? 0 : c.cents - item.charges[i - 1].cents,
    change: item.changes.find((ch) => ch.date === c.date) || null,
  }));
  const d0 = pts[0].day;
  const d1 = pts[pts.length - 1].day;
  const span = Math.max(1, d1 - d0);
  let lo = Math.min(...pts.map((p) => p.cents));
  let hi = Math.max(...pts.map((p) => p.cents));
  if (lo === hi) {
    lo = Math.round(lo * 0.85);
    hi = Math.round(hi * 1.15);
  } else {
    const pad = Math.round((hi - lo) * 0.25);
    lo -= pad;
    hi += pad;
  }
  const flat = new Set(pts.map((p) => p.cents)).size === 1;
  const x = (day) => M.l + ((day - d0) / span) * (W - M.l - M.r);
  const y = (cents) => M.t + (1 - (cents - lo) / (hi - lo)) * (H - M.t - M.b);

  let d = `M ${x(pts[0].day).toFixed(1)} ${y(pts[0].cents).toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` H ${x(pts[i].day).toFixed(1)} V ${y(pts[i].cents).toFixed(1)}`;
  }

  const levels = flat ? [pts[0].cents] : [...new Set(pts.map((p) => p.cents))].sort((a, b) => a - b);
  // Label at most the lowest and highest price so the axis stays readable.
  const labelled = levels.length > 2 ? [levels[0], levels[levels.length - 1]] : levels;

  const summary = flat
    ? `${item.name}: ${fmt.money(pts[0].cents)} every time, ${pts.length} charges from ${fmt.date(pts[0].date)} to ${fmt.date(pts[pts.length - 1].date)}.`
    : `${item.name}: price history. ${item.changes.map((c) => `${fmt.money(c.fromCents)} to ${fmt.money(c.toCents)} on ${fmt.date(c.date)}`).join('; ')}.`;

  const tip = h('div', { class: 'chart-tip', hidden: true, 'aria-hidden': 'true' });
  const wrap = h('div', { class: 'chart-wrap' });

  const svg = s(
    'svg',
    { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': summary, preserveAspectRatio: 'xMidYMid meet' },
    ...labelled.map((v) =>
      s('g', {},
        s('line', { class: 'grid', x1: M.l, x2: W - M.r, y1: y(v).toFixed(1), y2: y(v).toFixed(1) }),
        s('text', { x: M.l - 8, y: (y(v) + 4).toFixed(1), 'text-anchor': 'end' }, fmt.money(v)))),
    s('text', { x: M.l, y: H - 8, 'text-anchor': 'start' }, fmt.monthYear(pts[0].date)),
    s('text', { x: W - M.r, y: H - 8, 'text-anchor': 'end' }, fmt.monthYear(pts[pts.length - 1].date)),
    s('path', { class: 'line', d }),
    ...pts.map((p) => {
      const up = p.change && p.change.deltaCents > 0;
      const cx = x(p.day);
      const cy = y(p.cents);
      return s('g', {},
        s('circle', { class: up ? 'pt pt-up' : 'pt', cx: cx.toFixed(1), cy: cy.toFixed(1), r: up ? 5 : 4 }),
        up
          ? s('text', { class: 'callout', x: Math.min(Math.max(cx, M.l + 24), W - M.r - 24).toFixed(1), y: (cy - 12).toFixed(1), 'text-anchor': 'middle' }, `${fmt.signed(p.change.deltaCents)}`)
          : null,
        s('circle', {
          class: 'hit', cx: cx.toFixed(1), cy: cy.toFixed(1), r: 12,
          dataset: { tip: `${fmt.date(p.date)}: ${fmt.money(p.cents)}${p.delta ? ` (${fmt.signed(p.delta)})` : ''}`, x: cx.toFixed(1), y: cy.toFixed(1) },
        }));
    }),
  );

  const show = (target) => {
    const t = target.dataset?.tip;
    if (!t) return;
    tip.textContent = t;
    tip.hidden = false;
    const box = svg.getBoundingClientRect();
    const k = box.width / W;
    tip.style.setProperty('left', `${Number(target.dataset.x) * k}px`);
    tip.style.setProperty('top', `${Number(target.dataset.y) * k - 10}px`);
  };
  svg.addEventListener('pointerover', (e) => show(e.target));
  svg.addEventListener('pointerout', () => { tip.hidden = true; });
  wrap.append(svg, tip);
  return wrap;
}
