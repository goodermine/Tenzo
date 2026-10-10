/* HOLDOUT - seeded random numbers.
   Every random decision in the simulation goes through this, so a run is
   reproducible from its seed - which is what lets tools/bot.mjs replay the
   same fifteen minutes while the numbers are being tuned. (mulberry32) */
export function makeRng(seed) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (a, b) => a + (b - a) * next(),
    int: n => Math.floor(next() * n),
    pick: arr => arr[Math.floor(next() * arr.length)]
  };
}
