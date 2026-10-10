/* TILT LAB - tilt plans for the solver: running them, and generating the
 * families of play the difficulty bars test against.
 *
 * A plan (a Solution) is a list of [time, input]: from that time on, hold
 * that tilt. A "move" is one entry whose input differs from the one before.
 */
import { Lab, STEP } from '../src/core/physics.ts';
import type { LevelDef, Solution } from '../src/entities/types.ts';

export function run(level: LevelDef, sol: Solution, limit = 20): { won: boolean; t: number; lost: boolean; home: number; gap: number } {
  const lab = new Lab(level);
  /* Once the last input is given and the lab has come to rest - every ball
     still, every gate where it is going, no timer running, no floor about
     to crumble, nothing shuttling - nothing more can happen: stop early.
     The result is the same; the solver just gets there sooner. */
  const last = sol.length ? sol[sol.length - 1][0] : 0, shuttles = (level.gates || []).some(g => g.period);
  let calm = 0;
  while (lab.time < limit && lab.state === 'play') {
    lab.input = Lab.inputAt(sol, lab.time);
    lab.step();
    lab.events.length = 0;
    if (shuttles || lab.time < last + 0.3) continue;
    const still = Math.abs(lab.angVel) < 1e-3 && lab.balls.every(b => b.lost || b.speed < 4)
      && lab.gates.every(g => g.open === (g.wantOpen ? 1 : 0))
      && lab.switches.every(s => !s.def.hold || s.load > 0 || s.timer === 0)
      && lab.crumbles.every(c => c.gone >= 0 || c.emptyAt < 0)
      && lab.seesaws.every(s => Math.abs(s.body.getAngularVelocity()) < 0.01);
    calm = still ? calm + STEP : 0;
    if (calm > 0.6) break;
  }
  /* how far the balls not yet home ended from their cups: a design search
     climbs on this */
  let gap = 0;
  for (const t of lab.targets) {
    if (t.ball) continue;
    let d = 1000;
    for (const b of lab.balls) if (!b.lost && !b.home && b.colour === t.def.colour) d = Math.min(d, Math.hypot(b.x - t.rest[0], b.y - t.rest[1]));
    gap += d;
  }
  return { won: lab.state === 'won', lost: lab.state === 'lost', t: lab.time, home: lab.targets.filter(t => t.ball).length, gap };
}

export function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Every input change nudged by up to `ms` either way. */
export function jitter(sol: Solution, seed: number, ms = 0.08): Solution {
  const r = rng(seed);
  return sol.map(([t, v], i) => [i === 0 ? t : Math.max(0, t + (r() * 2 - 1) * ms), v] as [number, number])
    .sort((a, b) => a[0] - b[0]);
}

/** The number of moves in a plan: changes of input, the first included,
    not counting a final return to level. */
export function moves(sol: Solution): number {
  let n = 0, prev = 0;
  sol.forEach(([, v], i) => {
    if (v === prev) return;
    if (i === sol.length - 1 && v === 0) return;
    n++;
    prev = v;
  });
  return n;
}

/* Mindless play: what a player who has not thought about the lab would
   try. Holding a direction or rocking at a steady beat must never win. */
export function naive(): Solution[] {
  const out: Solution[] = [];
  for (const v of [-1, -0.5, 0.5, 1]) out.push([[0, v]]);
  for (const a of [-1, 1]) for (const p of [0.75, 1.5, 2.5, 4]) {
    const sol: Solution = [];
    for (let t = 0, k = 0; t < 20; t += p, k++) sol.push([+t.toFixed(2), k % 2 ? -a : a]);
    out.push(sol);
  }
  return out;
}

/** Switching direction once, at times 0.25 s apart. */
export function switchOnce(): Solution[] {
  const out: Solution[] = [];
  for (const a of [-1, 1]) for (let t = 0.5; t <= 6; t += 0.25) out.push([[0, a], [t, -a]]);
  return out;
}

export function randomSol(r: () => number): Solution {
  const values = [-1, -0.5, 0, 0.5, 1];
  const sol: Solution = [];
  for (let t = 0; t < 16; t += 0.4 + r() * 2.2) sol.push([+t.toFixed(2), values[Math.floor(r() * values.length)]]);
  return sol;
}

/** Every plan of at most `max` moves - left, level or right - with each
    move but the last held for a multiple of `step` seconds up to `upTo`.
    The last move is held for good. */
export function shortPlans(max = 3, step = 0.25, upTo = 4): Solution[] {
  const out: Solution[] = [];
  const durs: number[] = [];
  for (let d = step; d <= upTo + 1e-9; d += step) durs.push(+d.toFixed(2));
  const grow = (sol: Solution, t: number, prev: number, left: number) => {
    for (const v of [-1, 0, 1]) {
      if (v === prev) continue;
      const next: Solution = [...sol, [t, v]];
      out.push(next);
      if (left > 1) for (const d of durs) grow(next, +(t + d).toFixed(2), v, left - 1);
    }
  };
  /* a plan may open with "level": a wait before the first real move */
  grow([], 0, 9, max);
  return out.filter(s => moves(s) > 0);
}

/** Random plans of 2 to 8 moves with held durations of 0.4 to 3 s: the
    shapes real solutions take. */
export function structuredPlans(n: number, seed = 11): Solution[] {
  const r = rng(seed), out: Solution[] = [];
  for (let k = 0; k < n; k++) {
    const sol: Solution = [];
    const len = 2 + Math.floor(r() * 7);
    let t = 0, prev = 9;
    for (let i = 0; i < len; i++) {
      let v: number;
      do { v = [-1, 0, 1][Math.floor(r() * 3)]; } while (v === prev);
      sol.push([+t.toFixed(2), v]);
      prev = v;
      t += 0.4 + r() * 2.6;
    }
    sol.push([+t.toFixed(2), 0]);
    out.push(sol);
  }
  return out;
}
