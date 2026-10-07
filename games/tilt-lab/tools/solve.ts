/* TILT LAB - level checker, headless.
 *
 *   npm run solve                         check every level
 *   npm run solve -- --world 7            check one world (--level 7-2: one lab)
 *   npm run solve -- --quick              skip the difficulty bars
 *   npm run solve -- --tier2              hold every lab to the tier-2 bar
 *   npm run solve -- --write-par          print a suggested par for each level
 *   npm run solve -- easy [w]             how easy each lab is
 *   npm run solve -- hunt 7-2 [n] [first] look for robust solutions, fewest moves first
 *   npm run solve -- window 7-2 '<plan with T>' from to step
 *                                         sweep one switch time, e.g.
 *                                         '[[0,1],[T,-1],[9,0]]' 1 3 0.1
 *
 * For each level the checker proves:
 *   - its recorded solution wins, and beats the level's par time;
 *   - doing nothing does not win;
 *   - the solution still wins when every input change is nudged by up to
 *     80 ms either way (at least 8 of 9 random nudges). A level that only
 *     yields to frame-perfect timing is luck, not cleverness, and fails;
 *   - its traps - the obvious wrong moves - do not win;
 *   - no two balls start on top of each other.
 *
 * Every lab but a world's first must also beat mindless play (tier 1):
 * holding a direction or rocking at a steady beat never wins; switching
 * direction once wins for at most 3 of the switch times tried 0.25 s apart;
 * and at most 8% of 100 random tilt sequences win.
 *
 * From World 7 on, labs must also need a real plan (tier 2): no plan of
 * three moves or fewer wins (every one is tried, moves held for multiples
 * of 0.25 s); at most 0.5% of 3000 random plans of 2-8 moves win; at most
 * 2% of random tilting wins; and the recorded solution takes 5+ moves.
 *
 * The simulations run across one worker thread per core.
 */
import { Worker } from 'node:worker_threads';
import { cpus } from 'node:os';
import { LEVELS, place } from '../src/levels/levelLoader.ts';
import type { Solution } from '../src/entities/types.ts';
import { run, rng, jitter, moves, naive, switchOnce, randomSol, shortPlans, structuredPlans } from './plans.ts';

const TIER2_FROM = 6;           /* world index (0-based) where tier 2 starts */
const RANDOM_TRIES = 100;
const RANDOM_MAX = 0.08;
const SWITCH_SLACK = 3;
const T2_RANDOM_TRIES = 200;
const T2_RANDOM_MAX = 0.02;
const T2_PLANS = 3000;
const T2_PLAN_MAX = 0.005;
const T2_MIN_MOVES = 5;

const args = process.argv.slice(2);
const flag = (f: string) => args.includes(f);
const opt = (f: string) => (args.includes(f) ? args[args.indexOf(f) + 1] : '');
const quick = flag('--quick');
const forceT2 = flag('--tier2');

/* ---- a pool of simulation workers ---- */
const N = Math.max(1, Math.min(8, cpus().length));
let workers: Worker[] = [];
let jobId = 0;
const pending = new Map<number, (out: { won: boolean; t: number }[]) => void>();
function pool() {
  if (workers.length) return workers;
  workers = Array.from({ length: N }, () => {
    const w = new Worker(new URL('./solve-worker.ts', import.meta.url));
    w.on('message', (m: { id: number; out: { won: boolean; t: number }[] }) => { pending.get(m.id)!(m.out); pending.delete(m.id); });
    w.on('error', e => { console.error(e); process.exit(2); });
    return w;
  });
  return workers;
}
/** Run plans against level i across the pool; results in plan order. */
async function runMany(level: number, plans: Solution[], limit = 16): Promise<{ won: boolean; t: number }[]> {
  if (plans.length < 8) return plans.map(p => run(LEVELS[level], p, limit));
  const ws = pool();
  const size = Math.ceil(plans.length / ws.length);
  const parts = await Promise.all(ws.map((w, k) => new Promise<{ won: boolean; t: number }[]>(res => {
    const id = ++jobId;
    pending.set(id, res);
    w.postMessage({ id, level, plans: plans.slice(k * size, (k + 1) * size), limit });
  })));
  return parts.flat();
}
const wins = (rs: { won: boolean }[]) => rs.filter(r => r.won).length;
function done() { workers.forEach(w => w.terminate()); }

/* ---- par: the solution's time + 15%, rounded up to half a second ---- */
export function suggestPar(t: number) { return Math.ceil(t * 1.15 * 2) / 2; }

async function check(world?: number, only?: string) {
  let bad = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    const level = LEVELS[i];
    const { w, n } = place(i);
    if (world && w + 1 !== world) continue;
    if (only && only !== `${w + 1}-${n + 1}`) continue;
    const s = run(level, level.solution);
    const idle = run(level, [[0, 0]], 8);
    const nudged = wins(await runMany(i, Array.from({ length: 9 }, (_, k) => jitter(level.solution, (k + 1) * 7919)), 20));
    const traps = wins(await runMany(i, level.traps || [], 16));
    const parOk = level.par !== undefined && s.won && s.t <= level.par;
    let hard = true, note = '';
    if (n > 0 && !quick) {
      const nv = wins(await runMany(i, naive()));
      const sw = wins(await runMany(i, switchOnce()));
      const tier2 = forceT2 || w >= TIER2_FROM;
      const r = rng(4242), tries = tier2 ? T2_RANDOM_TRIES : RANDOM_TRIES;
      const rw = wins(await runMany(i, Array.from({ length: tries }, () => randomSol(r))));
      hard = nv === 0 && sw <= SWITCH_SLACK && rw <= tries * (tier2 ? T2_RANDOM_MAX : RANDOM_MAX);
      note = ` | naive ${nv ? nv + ' WIN' : 'all fail'} | one-switch ${sw}/${switchOnce().length} | random ${(100 * rw / tries).toFixed(1)}%`;
      if (tier2) {
        const sp = wins(await runMany(i, shortPlans()));
        const pl = wins(await runMany(i, structuredPlans(T2_PLANS)));
        const mv = moves(level.solution);
        hard = hard && sp === 0 && pl <= T2_PLANS * T2_PLAN_MAX && mv >= T2_MIN_MOVES;
        note += ` | 3-move plans ${sp ? sp + ' WIN' : 'all fail'} | plans ${(100 * pl / T2_PLANS).toFixed(2)}% | ${mv} moves`;
      }
    }
    const overlap = level.balls.some((a, j) => level.balls.some((b, k) => k > j && Math.hypot(a.x - b.x, a.y - b.y) < 88));
    if (overlap) note += ' | BALLS OVERLAP AT START';
    if (!parOk) note += level.par === undefined ? ` | NO PAR (suggest ${suggestPar(s.t)})` : ` | PAR ${level.par}s NOT BEATEN`;
    const pass = s.won && !idle.won && nudged >= 8 && traps === 0 && hard && !overlap && parOk;
    if (!pass) bad++;
    console.log(`${pass ? 'ok  ' : 'FAIL'}  ${w + 1}-${n + 1} ${level.name.padEnd(14)} solution ${s.won ? 'wins at ' + s.t.toFixed(1) + 's' : s.lost ? 'LOSES' : 'does not win'}` +
      (level.par !== undefined ? ` (par ${level.par})` : '') +
      ` | idle ${idle.won ? 'WINS' : 'no win'} | nudged ${nudged}/9` +
      (level.traps ? ` | traps ${traps ? traps + ' WIN' : 'all fail'}` : '') + note);
  }
  done();
  if (bad) {
    console.error(`\n${bad} level(s) failed`);
    process.exit(1);
  }
  console.log('\nall levels pass');
}

function levelArg(a: string): number {
  const [w, l] = a.split('-').map(Number);
  if (!l) return w - 1;
  let k = 0;
  for (let i = 0; i < LEVELS.length; i++) { const p = place(i); if (p.w === w - 1 && p.n === l - 1) k = i; }
  return k;
}

/* Look for robust solutions: random plans of 2-8 moves that win and still
   win when nudged; shortest (fewest moves) first. */
async function hunt(i: number, tries = 3000, first?: number) {
  let plans = structuredPlans(tries, 7);
  if (first !== undefined) plans = plans.map(p => { const q = p.map(x => [...x] as [number, number]); q[0][1] = first; return q; });
  const rs = await runMany(i, plans, 20);
  const found: { sol: Solution; t: number; ok: number }[] = [];
  for (let k = 0; k < plans.length; k++) {
    if (!rs[k].won) continue;
    const nr = await runMany(i, Array.from({ length: 9 }, (_, j) => jitter(plans[k], (j + 1) * 7919)), 20);
    found.push({ sol: plans[k], t: rs[k].t, ok: wins(nr) });
  }
  found.sort((a, b) => moves(a.sol) - moves(b.sol) || b.ok - a.ok || a.t - b.t);
  for (const f of found.filter(f => f.ok >= 8).slice(0, 8)) console.log(`  ${moves(f.sol)} moves  ${f.ok}/9  ${f.t.toFixed(1)}s  ${JSON.stringify(f.sol)}`);
  console.log(`${LEVELS[i].name}: ${found.length} of ${tries} win, ${found.filter(f => f.ok >= 8).length} robust`);
  done();
}

/* Sweep one time in a plan template: 'T' marks it. */
async function window(i: number, tpl: string, from: number, to: number, step: number) {
  const ts: number[] = [];
  for (let t = from; t <= to + 1e-9; t += step) ts.push(+t.toFixed(3));
  const rs = await runMany(i, ts.map(t => JSON.parse(tpl.replace(/T/g, String(t)))), 20);
  console.log(ts.map((t, k) => `${t}:${rs[k].won ? 'W' : '.'}`).join(' '));
  done();
}

async function easiness(world?: number) {
  for (let i = 0; i < LEVELS.length; i++) {
    const { w, n } = place(i);
    if (world && w + 1 !== world) continue;
    const nv = wins(await runMany(i, [...naive(), ...switchOnce()]));
    const r = rng(4242);
    const rw = wins(await runMany(i, Array.from({ length: 150 }, () => randomSol(r))));
    const pl = wins(await runMany(i, structuredPlans(1000)));
    console.log(`${w + 1}-${n + 1} ${LEVELS[i].name.padEnd(14)} naive ${String(nv).padStart(2)}/${naive().length + switchOnce().length}   random ${(100 * rw / 150).toFixed(0).padStart(3)}%   plans ${(100 * pl / 1000).toFixed(1).padStart(5)}%   solution ${moves(LEVELS[i].solution)} moves`);
  }
  done();
}

function writePar() {
  for (let i = 0; i < LEVELS.length; i++) {
    const { w, n } = place(i);
    const s = run(LEVELS[i], LEVELS[i].solution);
    console.log(`${w + 1}-${n + 1} ${LEVELS[i].id.padEnd(20)} solution ${s.won ? s.t.toFixed(2) : 'FAILS'}  par ${suggestPar(s.t)}`);
  }
}

const [cmd, a1, a2, a3, a4] = args;
if (cmd === 'hunt') await hunt(levelArg(a1), +(a2 || 3000), a3 !== undefined ? +a3 : undefined);
else if (cmd === 'window') await window(levelArg(a1), a2, +a3, +a4, +(args[5] || 0.1));
else if (cmd === 'easy') await easiness(a1 ? +a1 : undefined);
else if (flag('--write-par')) writePar();
else await check(opt('--world') ? +opt('--world') : undefined, opt('--level') || undefined);
