/* TILT LAB - level checker, headless.
 *
 *   node --experimental-strip-types tools/solve.ts            check every level
 *   node --experimental-strip-types tools/solve.ts --world 2  check one world
 *   node --experimental-strip-types tools/solve.ts --quick    skip the difficulty bar
 *   node --experimental-strip-types tools/solve.ts easy [w]   how easy each lab is
 *   node --experimental-strip-types tools/solve.ts search 3   look for solutions to level 3
 *
 * For each level the checker proves:
 *   - its recorded solution wins;
 *   - doing nothing does not;
 *   - the solution still wins when every input change is nudged by up to
 *     80 ms either way (at least 8 of 9 random nudges). A level that only
 *     yields to frame-perfect timing is luck, not cleverness, and fails;
 *   - its traps - the obvious wrong moves - do not win;
 *   - unless it is a world's first lab, mindless play cannot beat it: none
 *     of 20 naive strategies (hold a direction, switch once, rock back and
 *     forth) wins, and at most 4% of random tilt sequences do.
 */
import { Lab } from '../src/core/physics.ts';
import { LEVELS, place } from '../src/levels/levelLoader.ts';
import type { LevelDef, Solution } from '../src/entities/types.ts';

function run(level: LevelDef, sol: Solution, limit = 20): { won: boolean; t: number; lost: boolean } {
  const lab = new Lab(level);
  while (lab.time < limit && lab.state === 'play') {
    lab.input = Lab.inputAt(sol, lab.time);
    lab.step();
    lab.events.length = 0;
  }
  return { won: lab.state === 'won', lost: lab.state === 'lost', t: lab.time };
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function jitter(sol: Solution, seed: number, ms = 0.08): Solution {
  const r = rng(seed);
  return sol.map(([t, v], i) => [i === 0 ? t : Math.max(0, t + (r() * 2 - 1) * ms), v] as [number, number])
    .sort((a, b) => a[0] - b[0]);
}

const RANDOM_TRIES = 100;
const quick = process.argv.includes('--quick');
const only = process.argv.includes('--level') ? process.argv[process.argv.indexOf('--level') + 1] : '';

function check(world?: number) {
  let bad = 0;
  LEVELS.forEach((level, i) => {
    const { w, n } = place(i);
    if (world && w + 1 !== world) return;
    if (only && only !== `${w + 1}-${n + 1}`) return;
    const s = run(level, level.solution);
    const idle = run(level, [[0, 0]], 8);
    let ok = 0;
    for (let k = 1; k <= 9; k++) if (run(level, jitter(level.solution, k * 7919)).won) ok++;
    const traps = (level.traps || []).filter(t => run(level, t, 16).won).length;
    /* every lab but a world's first must defeat mindless play */
    let hard = true, easyNote = '';
    if (n > 0 && !quick) {
      const nv = naive().filter(t => run(level, t, 16).won).length;
      const r = rng(4242);
      let rw = 0;
      for (let k = 0; k < RANDOM_TRIES; k++) if (run(level, randomSol(r), 16).won) rw++;
      hard = nv === 0 && rw <= RANDOM_TRIES * 0.04;
      easyNote = ` | naive ${nv ? nv + ' WIN' : 'all fail'} | random ${(100 * rw / RANDOM_TRIES).toFixed(0)}%`;
    }
    const pass = s.won && !idle.won && ok >= 8 && traps === 0 && hard;
    if (!pass) bad++;
    console.log(`${pass ? 'ok  ' : 'FAIL'}  ${w + 1}-${n + 1} ${level.name.padEnd(14)} solution ${s.won ? 'wins at ' + s.t.toFixed(1) + 's' : s.lost ? 'LOSES' : 'does not win'}` +
      ` | idle ${idle.won ? 'WINS' : 'no win'} | timing-nudged ${ok}/9` +
      (level.traps ? ` | traps ${traps ? traps + ' WIN' : 'all fail'}` : '') + easyNote);
  });
  if (bad) {
    console.error(`\n${bad} level(s) failed`);
    process.exit(1);
  }
  console.log('\nall levels pass');
}

/* Random search over piecewise-constant tilt sequences. */
function search(i: number, tries = 3000) {
  const level = LEVELS[i - 1];
  const r = rng(12345);
  const values = [-1, -0.6, -0.3, 0, 0.3, 0.6, 1];
  let best: Solution | null = null, bestT = 1e9, wins = 0;
  for (let n = 0; n < tries; n++) {
    const sol: Solution = [];
    let t = 0;
    const steps = 2 + Math.floor(r() * 6);
    for (let k = 0; k < steps; k++) {
      sol.push([+t.toFixed(2), values[Math.floor(r() * values.length)]]);
      t += 0.4 + r() * 2.2;
    }
    sol.push([+t.toFixed(2), 0]);
    const res = run(level, sol);
    if (res.won) {
      wins++;
      if (res.t < bestT) { bestT = res.t; best = sol; }
    }
  }
  console.log(`${level.name}: ${wins}/${tries} random sequences win (${(100 * wins / tries).toFixed(1)}%)`);
  if (best) console.log('fastest:', JSON.stringify(best), 'wins at', bestT.toFixed(2) + 's');
}

/* Mindless play: what a player who has not thought about the lab would
   try. A lab that falls to these is a reflex test, not a puzzle. */
export function naive(): Solution[] {
  const out: Solution[] = [];
  for (const v of [-1, -0.5, 0.5, 1]) out.push([[0, v]]);
  for (const a of [-1, 1]) for (const t of [1.5, 2.5, 3.5, 5]) out.push([[0, a], [t, -a]]);
  for (const a of [-1, 1]) for (const p of [0.75, 1.5, 2.5, 4]) {
    const sol: Solution = [];
    for (let t = 0, k = 0; t < 20; t += p, k++) sol.push([+t.toFixed(2), k % 2 ? -a : a]);
    out.push(sol);
  }
  return out;
}

function randomSol(r: () => number): Solution {
  const values = [-1, -0.5, 0, 0.5, 1];
  const sol: Solution = [];
  for (let t = 0; t < 16; t += 0.4 + r() * 2.2) sol.push([+t.toFixed(2), values[Math.floor(r() * values.length)]]);
  return sol;
}

/* How easy is each lab? Naive strategies that win, and the share of
   random tilt sequences that win. */
function easiness(world?: number) {
  LEVELS.forEach((level, i) => {
    const { w, n } = place(i);
    if (world && w + 1 !== world) return;
    const nv = naive().filter(s => run(level, s, 16).won).length;
    const r = rng(4242);
    let rw = 0;
    const N = 150;
    for (let k = 0; k < N; k++) if (run(level, randomSol(r), 16).won) rw++;
    console.log(`${w + 1}-${n + 1} ${level.name.padEnd(14)} naive ${String(nv).padStart(2)}/${naive().length}   random ${(100 * rw / N).toFixed(0).padStart(3)}%`);
  });
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'search') search(+arg, +(process.argv[4] || 3000));
else if (cmd === 'easy') easiness(arg ? +arg : undefined);
else check(cmd === '--world' ? +arg : undefined);
