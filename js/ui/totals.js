// What the totals say once the person's own decisions are applied. Marking a
// finding "ignore" removes it from the numbers (a false alarm should not inflate
// the yearly figure), and marking a double charge "it is fine" removes it from
// the count. Pure functions, tested in Node.

const status = (decisions, id) => decisions[id]?.status || '';

export function effectiveTotals(analysis, decisions = {}) {
  const t = {
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
    ignoredCount: 0,
  };
  for (const s of analysis.series) {
    if (status(decisions, s.id) === 'ignore') {
      t.ignoredCount++;
      continue;
    }
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
  for (const d of analysis.doubles) {
    const st = status(decisions, d.id);
    if (d.refunded || st === 'ignore' || st === 'keep') continue;
    t.doubleCount++;
    t.doubleExtraCents += d.extraCents;
  }
  return t;
}

/** Overlap groups that still have two or more services after ignored ones are removed. */
export function effectiveOverlaps(analysis, decisions = {}) {
  const byId = new Map(analysis.series.map((s) => [s.id, s]));
  const out = [];
  for (const o of analysis.overlaps) {
    const members = o.members.filter((id) => status(decisions, id) !== 'ignore');
    const keys = new Set(members.map((id) => byId.get(id)?.merchantKey));
    if (keys.size < 2) continue;
    out.push({ ...o, members, annualCents: members.reduce((a, id) => a + (byId.get(id)?.annualCents || 0), 0) });
  }
  return out;
}
