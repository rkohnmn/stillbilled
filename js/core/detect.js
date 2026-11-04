// The audit engine. Pure functions: transactions in, findings out. No DOM, no
// network, no clock (the "as of" date is passed in or taken from the data), so
// every result is reproducible and testable.
//
// Convention: positive cents = money out of the account. Refunds and credits are
// negative and are only used to recognise that a double charge was already refunded.
//
// What it finds
//   recurring   Charges that repeat on a billing rhythm (weekly ... yearly).
//   changes     A recurring charge whose amount moved, with what it costs per year.
//   doubles     The same merchant and amount charged twice within three days.
//   overlaps    Several active subscriptions from the same category (3 video services).
//
// How it finds recurring charges (and why it is written this way)
//   1. Group by cleaned merchant name.
//   2. Inside a merchant, group charges of the same amount (within a small tolerance).
//   3. Walk each amount group in date order and chain charges whose spacing fits a
//      billing rhythm. Calendar months are real months, not 30 days, so the 31st-to-28th
//      jump never breaks a monthly chain. One missed cycle is tolerated.
//   4. If a chain is followed by charges at a different amount on the same rhythm,
//      the two are joined and the difference is reported as a price change.
//   5. Score the result. Short, irregular or low-evidence patterns are dropped or
//      labelled low confidence instead of being presented as fact. Evidence is the
//      longest run of charges at one price, not the length of the chain, so a few
//      coincidentally similar grocery totals cannot pose as a subscription.

import { CADENCES, periodDays } from './cadences.js';
import { inferCategory, isBillLike, isTransferLike, CATEGORIES } from './categories.js';
import { addDays, addMonths, diffDays, maxISO, minISO, toDay } from './dates.js';
import { normalizeMerchant } from './merchants.js';
import { sameAmount } from './money.js';

const PRICE_BAND = [0.6, 1.8]; // a price change outside this range is a different charge, not the same one repriced
const MIN_DOUBLE_CENTS = 1000; // smaller repeats (two coffees, two bus fares) are normal
const DOUBLE_WINDOW_DAYS = 3;
const HABIT_PAIRS = 2; // if the same pair repeats this often, it is a habit or a second subscription, not a mistake
const HABITUAL_MERCHANT_DAYS = 8; // a merchant seen on this many different days is somewhere people shop, not subscribe
const REFUND_WINDOW_DAYS = 21;
const MIN_COVERAGE = 0.5; // at an unknown merchant, the chain must hold at least this share of the same-priced charges there
const MIN_SHARE = 0.35; // at a merchant not known for subscriptions, the series must be a real share of that merchant's charges in its span
const MIN_OVERALL = 0.5; // ...and, unless the pattern is long, a real share of everything ever charged there
const STRONG_CORE = 5; // this many same-priced charges on a monthly or slower rhythm cannot be a coincidence
const STRONG_CORE_FREQUENT = 8; // weekly rhythms line up by chance far more easily, so they need more

const priceChangeFloor = (cents) => Math.max(20, Math.round(Math.abs(cents) * 0.02));

export function nextDate(iso, cad) {
  return cad.unit === 'days' ? addDays(iso, cad.every) : addMonths(iso, cad.every);
}

/** How far (in days) `next` is from the date `k` cycles after `prev`. */
function deviation(prev, next, cad, k) {
  const expected = cad.unit === 'days' ? addDays(prev, cad.every * k) : addMonths(prev, cad.every * k);
  return Math.abs(diffDays(expected, next));
}

// Cheap integer prefilter: a gap of k cycles can only be this many days. Months are 28 to 31 days long,
// so these bounds are slightly wider than the truth; the exact calendar check runs only for gaps inside them.
const BOUNDS = new Map(
  CADENCES.map((cad) => [
    cad,
    [1, 2].map((k) =>
      cad.unit === 'days'
        ? [cad.every * k - cad.tol, cad.every * k + cad.tol]
        : [28 * cad.every * k - cad.tol, 31 * cad.every * k + cad.tol]),
  ]),
);
const ONE_CYCLE = [1];
const ONE_OR_TWO = [1, 2];

/** Does the gap prev -> next fit a billing rhythm? With a known rhythm, one skipped cycle is allowed. */
function matchGap(prev, next, known) {
  const gap = toDay(next) - toDay(prev);
  let best = null;
  const ks = known ? ONE_OR_TWO : ONE_CYCLE;
  for (const cad of known ? [known] : CADENCES) {
    const bounds = BOUNDS.get(cad);
    for (const k of ks) {
      const [lo, hi] = bounds[k - 1];
      if (gap < lo || gap > hi) continue;
      const dev = deviation(prev, next, cad, k);
      if (dev <= cad.tol) {
        const score = dev + (k - 1) * 100;
        if (!best || score < best.score) best = { cad, k, dev, score };
      }
    }
  }
  return best;
}

const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.cents - b.cents);

/** Chain same-amount charges into runs that follow a billing rhythm. Parallel runs (two lines, two seats) become separate chains. */
function buildChains(txs) {
  const chains = [];
  for (const tx of [...txs].sort(byDate)) {
    let best = null;
    for (const ch of chains) {
      const last = ch.charges[ch.charges.length - 1];
      if (tx.date <= last.date) continue;
      const m = matchGap(last.date, tx.date, ch.cadence);
      if (!m) continue;
      const rank = m.score - ch.charges.length * 0.01; // prefer a tighter fit, then the longer chain
      if (!best || rank < best.rank) best = { ch, m, rank };
    }
    if (best) {
      best.ch.charges.push(tx);
      best.ch.cadence ||= best.m.cad;
      best.ch.skipped += best.m.k - 1;
    } else {
      chains.push({ charges: [tx], cadence: null, skipped: 0 });
    }
  }
  return chains;
}

/** Join a chain to an earlier one when it continues the same rhythm at a new price. */
function joinPriceChanges(chains, known) {
  const hosts = [];
  const rhythmic = []; // hosts that already follow a rhythm: the only ones a later chain can join
  for (const ch of [...chains].sort((a, b) => (a.charges[0].date < b.charges[0].date ? -1 : a.charges[0].date > b.charges[0].date ? 1 : 0))) {
    const first = ch.charges[0];
    let best = null;
    for (const h of rhythmic) {
      const last = h.charges[h.charges.length - 1];
      if (first.date <= last.date) continue;
      if (h.closed) continue; // a one-off charge at a new price is only believable as the latest charge
      if (h.charges.length < (known ? 2 : 3)) continue;
      const ratio = first.cents / last.cents;
      if (ratio < PRICE_BAND[0] || ratio > PRICE_BAND[1]) continue;
      const m = matchGap(last.date, first.date, h.cadence);
      if (!m) continue;
      const rank = m.score + Math.abs(1 - ratio);
      if (!best || rank < best.rank) best = { h, m, rank };
    }
    if (best) {
      best.h.charges.push(...ch.charges);
      best.h.skipped += ch.skipped + (best.m.k - 1);
      best.h.cadence ||= ch.cadence;
      if (ch.charges.length === 1) best.h.closed = true;
    } else {
      const host = { ...ch, charges: [...ch.charges] };
      hosts.push(host);
      if (host.cadence) rhythmic.push(host);
    }
  }
  return hosts;
}

/** Cluster a merchant's charges by amount: same price (within tolerance) share a cluster. */
function amountClusters(txs) {
  const clusters = [];
  for (const tx of [...txs].sort(byDate)) {
    const c = clusters.find((cl) => sameAmount(cl.rep, tx.cents));
    if (c) c.txs.push(tx);
    else clusters.push({ rep: tx.cents, txs: [tx] });
  }
  return clusters;
}

function walkPriceChanges(charges) {
  const changes = [];
  let level = charges[0].cents;
  for (const c of charges) {
    if (Math.abs(c.cents - level) >= priceChangeFloor(level)) {
      changes.push({
        date: c.date,
        fromCents: level,
        toCents: c.cents,
        deltaCents: c.cents - level,
        pct: Math.round(((c.cents - level) / level) * 1000) / 10,
      });
      level = c.cents;
    }
  }
  return changes;
}

/** The most charges that share one price. A real subscription has a long run at one price; coincidence does not. */
function coreSize(charges) {
  let best = 0;
  for (const a of charges) {
    let n = 0;
    for (const b of charges) if (sameAmount(a.cents, b.cents)) n++;
    if (n > best) best = n;
  }
  return best;
}

function confidenceOf({ n, known, regularity, exact }) {
  let score = 0;
  if (n >= 3) score += 2;
  if (n >= 5) score += 1;
  if (known) score += 2;
  if (regularity >= 0.9) score += 1;
  if (exact) score += 1;
  return score >= 4 ? 'high' : score >= 3 ? 'medium' : 'low';
}

/**
 * @param {{id:string,date:string,cents:number,desc:string}[]} transactions merged, any order
 * @param {{asOf?:string}} [options]
 */
export function analyze(transactions, options = {}) {
  const all = transactions.filter((t) => t && Number.isSafeInteger(t.cents) && t.cents !== 0);
  const empty = {
    asOf: null,
    range: null,
    series: [],
    stopped: [],
    doubles: [],
    overlaps: [],
    totals: emptyTotals(),
    notes: [],
    counts: { transactions: all.length, spending: 0, merchants: 0 },
  };
  if (all.length === 0) return empty;

  let from = all[0].date;
  let to = all[0].date;
  for (const t of all) {
    from = minISO(from, t.date);
    to = maxISO(to, t.date);
  }
  const asOf = options.asOf && options.asOf > to ? options.asOf : to;
  const range = { from, to, days: diffDays(from, to) + 1 };

  // Group spending by merchant. Transfers and card payments are not charges to audit.
  const groups = new Map();
  const credits = [];
  let spending = 0;
  for (const t of all) {
    if (t.cents < 0) {
      credits.push(t);
      continue;
    }
    if (isTransferLike(t.desc)) continue;
    spending++;
    const m = normalizeMerchant(t.desc);
    let g = groups.get(m.key);
    if (!g) groups.set(m.key, (g = { ...m, txs: [] }));
    g.txs.push(t);
  }

  const series = [];
  for (const g of groups.values()) {
    const distinctDays = new Set(g.txs.map((t) => t.date)).size;
    const chains = [];
    const clusterOf = new Map();
    for (const cl of amountClusters(g.txs)) {
      for (const t of cl.txs) clusterOf.set(t, cl);
      if (cl.txs.length < 2) {
        chains.push({ charges: [...cl.txs], cadence: null, skipped: 0 });
        continue;
      }
      chains.push(...buildChains(cl.txs));
    }
    for (const s of joinPriceChanges(chains, g.known)) {
      const n = s.charges.length;
      const cad = s.cadence;
      if (!cad || n < cad.minCharges) continue;
      s.charges.sort(byDate);
      const exact = s.charges.every((c) => c.cents === s.charges[0].cents);
      const regularity = (n - 1) / (n - 1 + s.skipped);
      const core = coreSize(s.charges);
      const confidence = confidenceOf({ n: core, known: g.known, regularity, exact });
      if (confidence === 'low' && !g.known && distinctDays > HABITUAL_MERCHANT_DAYS) continue;
      if (!g.known) {
        // Coffee at the same café for the same price will line up a few times by chance. A real subscription
        // accounts for nearly all of the same-priced charges at its merchant.
        const seenClusters = new Set();
        let pooled = 0;
        for (const c of s.charges) {
          const cl = clusterOf.get(c);
          if (cl && !seenClusters.has(cl)) {
            seenClusters.add(cl);
            pooled += cl.txs.length;
          }
        }
        if (n / pooled < MIN_COVERAGE) continue;
        // A shop people visit all the time will contain same-priced purchases a month apart by coincidence.
        const from = s.charges[0].date;
        const to = s.charges[n - 1].date;
        let nearby = 0;
        for (const t of g.txs) if (t.date >= from && t.date <= to) nearby++;
        if (n / nearby < MIN_SHARE) continue;
        // Three similar grocery totals in a row, then a few more that happen to fit, is what shopping looks like.
        // Unless the run at one price is long, the series must account for most of what was ever charged there.
        const frequent = cad.unit === 'days';
        const strong = core >= (frequent ? STRONG_CORE_FREQUENT : STRONG_CORE) || (exact && !frequent && core >= 4);
        if (!strong && pooled / g.txs.length < MIN_OVERALL) continue;
      }
      series.push({ g, s, confidence, regularity });
    }
  }

  // Build the public shape
  const seen = new Map();
  const active = [];
  const stopped = [];
  for (const { g, s, confidence, regularity } of series) {
    const cad = s.cadence;
    const charges = s.charges.map((c) => ({ id: c.id, date: c.date, cents: c.cents, desc: c.desc }));
    const last = charges[charges.length - 1];
    const first = charges[0];
    const changes = walkPriceChanges(charges);
    const latestChange = changes.length ? changes[changes.length - 1] : null;
    const annualCents = Math.round(last.cents * cad.perYear);
    const due = nextDate(last.date, cad);
    const grace = Math.min(30, Math.round(cad.tol + 5 + periodDays(cad) * 0.05));
    const isActive = diffDays(due, asOf) <= grace;
    const category = g.category || inferCategory(g.key, last.desc);
    const textForKind = `${g.key} ${last.desc}`;

    let id = `${g.key}|${cad.id}`;
    const n = (seen.get(id) || 0) + 1;
    seen.set(id, n);
    if (n > 1) id += `#${n}`;

    let paidExtraCents = 0;
    if (latestChange && latestChange.deltaCents > 0) {
      for (const c of charges) if (c.date >= latestChange.date) paidExtraCents += c.cents - latestChange.fromCents;
    }

    const item = {
      id,
      merchantKey: g.key,
      name: g.name,
      known: g.known,
      category,
      categoryLabel: category && CATEGORIES[category] ? CATEGORIES[category].label : null,
      categoryKnown: Boolean(g.category),
      kind: isBillLike(textForKind) ? 'bill' : 'subscription',
      cadence: { id: cad.id, label: cad.label, perYear: cad.perYear },
      confidence,
      regularity: Math.round(regularity * 100) / 100,
      active: isActive,
      charges,
      firstDate: first.date,
      lastDate: last.date,
      nextDate: due,
      cents: last.cents,
      annualCents,
      monthlyCents: Math.round(annualCents / 12),
      paidCents: charges.reduce((a, c) => a + c.cents, 0),
      changes,
      latestChange,
      increaseExtraPerYearCents:
        latestChange && latestChange.deltaCents > 0 ? Math.round(latestChange.deltaCents * cad.perYear) : 0,
      paidExtraCents,
      lastDesc: last.desc,
    };
    (isActive ? active : stopped).push(item);
  }

  // Stable order: biggest yearly cost first
  const order = (a, b) => b.annualCents - a.annualCents || (a.name < b.name ? -1 : 1);
  active.sort(order);
  stopped.sort((a, b) => (a.lastDate < b.lastDate ? 1 : -1));

  const doubles = findDoubles(groups, credits);
  const overlaps = findOverlaps(active);
  const notes = [];
  if (range.days < 75) {
    notes.push({
      id: 'short-range',
      text: `Your files cover ${range.days} day${range.days === 1 ? '' : 's'}. Monthly charges need at least two cycles to show up, and yearly ones need more than a year. Add older statements for a fuller picture.`,
    });
  }

  return {
    asOf,
    range,
    series: active,
    stopped,
    doubles,
    overlaps,
    totals: totalsOf(active, doubles),
    notes,
    counts: { transactions: all.length, spending, merchants: groups.size },
  };
}

function emptyTotals() {
  return {
    activeCount: 0,
    annualCents: 0,
    monthlyCents: 0,
    subscriptionAnnualCents: 0,
    billAnnualCents: 0,
    increaseCount: 0,
    increaseExtraPerYearCents: 0,
    paidExtraCents: 0,
    doubleCount: 0,
    doubleExtraCents: 0,
  };
}

function totalsOf(active, doubles) {
  const t = emptyTotals();
  for (const s of active) {
    t.activeCount++;
    t.annualCents += s.annualCents;
    if (s.kind === 'bill') t.billAnnualCents += s.annualCents;
    else t.subscriptionAnnualCents += s.annualCents;
    if (s.increaseExtraPerYearCents > 0) {
      t.increaseCount++;
      t.increaseExtraPerYearCents += s.increaseExtraPerYearCents;
      t.paidExtraCents += s.paidExtraCents;
    }
  }
  t.monthlyCents = Math.round(t.annualCents / 12);
  for (const d of doubles) {
    if (d.refunded) continue;
    t.doubleCount++;
    t.doubleExtraCents += d.extraCents;
  }
  return t;
}

/** Same merchant, same amount, within a few days, and not a repeating pattern. */
function findDoubles(groups, credits) {
  const out = [];
  const creditsByMerchant = new Map();
  for (const c of credits) {
    const key = normalizeMerchant(c.desc).key;
    if (!creditsByMerchant.has(key)) creditsByMerchant.set(key, []);
    creditsByMerchant.get(key).push(c);
  }
  for (const g of groups.values()) {
    const byAmount = new Map();
    for (const t of g.txs) {
      if (t.cents < MIN_DOUBLE_CENTS) continue;
      if (!byAmount.has(t.cents)) byAmount.set(t.cents, []);
      byAmount.get(t.cents).push(t);
    }
    for (const [cents, txs] of byAmount) {
      if (txs.length < 2) continue;
      txs.sort(byDate);
      // runs of charges where each is within the window of the one before
      const runs = [];
      let run = [txs[0]];
      for (let i = 1; i < txs.length; i++) {
        if (diffDays(txs[i - 1].date, txs[i].date) <= DOUBLE_WINDOW_DAYS) run.push(txs[i]);
        else {
          if (run.length > 1) runs.push(run);
          run = [txs[i]];
        }
      }
      if (run.length > 1) runs.push(run);
      if (runs.length === 0 || runs.length >= HABIT_PAIRS) continue; // repeats often: a habit or a second subscription
      for (const r of runs) {
        const lastTx = r[r.length - 1];
        const gap = diffDays(r[0].date, lastTx.date);
        const refund = (creditsByMerchant.get(g.key) || []).find((c) => {
          const d = diffDays(lastTx.date, c.date);
          return d >= 0 && d <= REFUND_WINDOW_DAYS && sameAmount(-c.cents, cents);
        });
        out.push({
          id: `${g.key}|${r[0].date}|${cents}`,
          merchantKey: g.key,
          name: g.name,
          cents,
          count: r.length,
          extraCents: cents * (r.length - 1),
          gapDays: gap,
          confidence: gap === 0 && cents >= 1500 ? 'likely' : 'possible',
          charges: r.map((c) => ({ id: c.id, date: c.date, cents: c.cents, desc: c.desc })),
          refunded: refund ? { date: refund.date, cents: -refund.cents } : null,
        });
      }
    }
  }
  out.sort((a, b) => {
    const da = a.charges[0].date;
    const db = b.charges[0].date;
    return da === db ? b.extraCents - a.extraCents : da < db ? 1 : -1;
  });
  return out;
}

/** Two or more active subscriptions in a category where people tend to double up. */
function findOverlaps(active) {
  const byCat = new Map();
  for (const s of active) {
    if (!s.categoryKnown || s.kind !== 'subscription') continue;
    if (!CATEGORIES[s.category]?.overlap) continue;
    if (!byCat.has(s.category)) byCat.set(s.category, []);
    byCat.get(s.category).push(s);
  }
  const out = [];
  for (const [category, members] of byCat) {
    const keys = new Set(members.map((m) => m.merchantKey));
    if (keys.size < 2) continue;
    out.push({
      category,
      label: CATEGORIES[category].label,
      members: members.map((m) => m.id),
      annualCents: members.reduce((a, m) => a + m.annualCents, 0),
    });
  }
  return out.sort((a, b) => b.annualCents - a.annualCents);
}

