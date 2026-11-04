// Small builders shared by the engine tests.
import { addDays, addMonths } from '../../js/core/dates.js';

let counter = 0;
export const tx = (date, cents, desc) => ({ id: `t${counter++}`, date, cents, desc });

/** n monthly charges starting at `start`. `cents` may be a number or a function of the index. */
export function monthly(start, n, cents, desc, { offset = 0 } = {}) {
  return Array.from({ length: n }, (_, i) =>
    tx(addMonths(start, i + offset), typeof cents === 'function' ? cents(i) : cents, desc));
}

export function every(start, days, n, cents, desc) {
  return Array.from({ length: n }, (_, i) => tx(addDays(start, i * days), cents, desc));
}

/** Deterministic pseudo-random numbers for shuffling and noise. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, seed = 7) {
  const r = rng(seed);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
