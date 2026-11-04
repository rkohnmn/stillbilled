// Combine transactions from several files.
//
// People export in overlapping windows (last 90 days, then last 180 days...),
// so the same charge appears in more than one file. But two genuinely separate
// identical charges on the same day also exist, and must both survive.
//
// Rule: for each identical (date, amount, text) key, keep the largest number
// of copies seen in any ONE file. Overlap across files collapses; repeats
// within a file are kept.

const norm = (s) => s.toUpperCase().replace(/\s+/g, ' ').trim();

/** @param {{id:string, transactions:Array}[]} sources in the order they were added */
export function mergeSources(sources) {
  const byKey = new Map(); // key -> Map(sourceIndex -> txns[])
  sources.forEach((src, si) => {
    for (const t of src.transactions) {
      const key = `${t.date}|${t.cents}|${norm(t.desc)}`;
      let per = byKey.get(key);
      if (!per) byKey.set(key, (per = new Map()));
      let list = per.get(si);
      if (!list) per.set(si, (list = []));
      list.push(t);
    }
  });
  const out = [];
  for (const per of byKey.values()) {
    let best = null;
    for (const list of per.values()) if (!best || list.length > best.length) best = list;
    out.push(...best);
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.cents - b.cents));
  return out;
}

/** How many rows were dropped because another file already had them. */
export function countOverlap(sources, merged) {
  const total = sources.reduce((n, s) => n + s.transactions.length, 0);
  return total - merged.length;
}
