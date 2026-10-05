/* HOLDOUT - a headless player, for balance and soak testing.
 *
 *   node tools/bot.mjs [runs=5] [seed=1] [minutes=15]
 *
 * Plays complete runs against the real simulation (src/sim/world.js - the
 * same code the browser runs) at a fixed 60Hz, with no rendering. The bot
 * kites: it steers away from nearby enemies weighted by closeness, circles
 * rather than backing straight off, and drifts towards XP. Level-up choices
 * are random but seeded, so a run is reproducible.
 *
 * It is not a good player - which is the point. If it survives too long, the
 * game is too easy; if it dies in the first minutes, the opening is unfair.
 */
import { Sim } from '../src/sim/world.js';
import { makeRng } from '../src/sim/rng.js';
import { EVOLUTIONS } from '../src/content/weapons.js';
import { UPGRADES } from '../src/content/meta.js';

const runs = +(process.argv[2] || 5);
const seed0 = +(process.argv[3] || 1);
const minutes = +(process.argv[4] || 15);
/* --random picks cards blindly; the default plays a sensible build.
   --maxed gives every shop upgrade; --ship=bastion picks a ship. */
const flags = process.argv.slice(5);
const RANDOM = flags.includes('--random');
const MAXED = flags.includes('--maxed');
const SHIP = (flags.find(f => f.startsWith('--ship=')) || '--ship=vanguard').slice(7);

/* A sensible player's card choice: evolutions first, then levelling the
   weapons it has towards them, the passives those evolutions need, a few
   more weapons early on, and damage and cooldown over the rest. */
function pickCard(sim, rng) {
  if (RANDOM) return rng.int(sim.choices.length);
  const owned = new Set(sim.weapons.map(w => w.def.id));
  const needs = new Set(EVOLUTIONS.filter(e => owned.has(e.from)).map(e => e.with));
  const score = c => {
    if (c.kind === 'evolve') return 100;
    if (c.kind === 'weapon' && c.level > 1) return 20 + c.level;
    if (c.kind === 'weapon') return sim.weapons.length < 4 ? 18 : 4;
    if (c.kind === 'passive' && needs.has(c.id)) return 16;
    if (c.kind === 'passive') return { might: 12, haste: 12, area: 9, vigor: 8, armor: 8, amount: 14, regen: 6 }[c.id] || 4;
    return 1;
  };
  let best = 0;
  sim.choices.forEach((c, i) => { if (score(c) + rng.next() > score(sim.choices[best])) best = i; });
  return best;
}
const DT = 1 / 60;

function steer(sim) {
  const p = sim.p;
  let ax = 0, ay = 0;
  for (let i = 0; i < sim.eHigh; i++) {
    if (!sim.eAlive[i]) continue;
    const dx = p.x - sim.ex[i], dy = p.y - sim.ey[i], d2 = dx * dx + dy * dy;
    if (d2 > 260 * 260) continue;
    const d = Math.sqrt(d2) || 1, w = 1 / Math.max(d2, 400);
    ax += (dx / d) * w;
    ay += (dy / d) * w;
  }
  /* bullets count as threats too, weighted more: they hurt */
  for (let i = 0; i < sim.bPool.high; i++) {
    if (!sim.bAlive[i]) continue;
    const dx = p.x - sim.bx[i], dy = p.y - sim.by[i], d2 = dx * dx + dy * dy;
    if (d2 > 160 * 160) continue;
    const d = Math.sqrt(d2) || 1, w = 2.5 / Math.max(d2, 400);
    ax += (dx / d) * w;
    ay += (dy / d) * w;
  }
  let mx = 0, my = 0;
  const al = Math.hypot(ax, ay);
  if (al > 0) {
    /* away, plus a sideways component so it circles instead of retreating
       into a wall of enemies */
    mx = ax / al - (ay / al) * 0.6;
    my = ay / al + (ax / al) * 0.6;
  }
  /* pull towards the nearest gem when nothing is close */
  let best = -1, bd = 300 * 300;
  for (let i = 0; i < sim.gPool.high; i++) {
    if (!sim.gAlive[i]) continue;
    const dx = sim.gx[i] - p.x, dy = sim.gy[i] - p.y, d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = i; }
  }
  if (best >= 0) {
    const dx = sim.gx[best] - p.x, dy = sim.gy[best] - p.y, d = Math.hypot(dx, dy) || 1;
    const k = al > 0.0005 ? 0.35 : 1;
    mx += (dx / d) * k;
    my += (dy / d) * k;
  }
  const l = Math.hypot(mx, my);
  sim.move.x = l > 0 ? mx / l : 0;
  sim.move.y = l > 0 ? my / l : 0;
}

const results = [];
for (let r = 0; r < runs; r++) {
  const seed = seed0 + r;
  const upgrades = MAXED ? Object.fromEntries(UPGRADES.map(u => [u.id, u.max])) : {};
  const sim = new Sim({ seed, character: SHIP, upgrades });
  const pick = makeRng(seed * 7919);
  let peak = 0, worstStep = 0, totalMs = 0, steps = 0;
  const limit = minutes * 60;
  while (!sim.over && sim.time < limit) {
    if (sim.choices) {
      sim.choose(pickCard(sim, pick));
      continue;
    }
    if (steps % 3 === 0) steer(sim);
    const t0 = performance.now();
    sim.step(DT);
    const ms = performance.now() - t0;
    totalMs += ms;
    worstStep = Math.max(worstStep, ms);
    steps++;
    sim.events.clear();
    peak = Math.max(peak, sim.eCount);
  }
  const res = {
    seed,
    survived: `${Math.floor(sim.time / 60)}:${String(Math.floor(sim.time % 60)).padStart(2, '0')}`,
    seconds: Math.round(sim.time),
    level: sim.p.level,
    kills: sim.p.kills,
    peakEnemies: peak,
    won: sim.won,
    bosses: sim.bossesKilled.map((b, k) => `${b}@${sim.bossTimes[k]}`).join(' ') || '-',
    bossHp: sim.boss >= 0 ? Math.round(sim.eHp[sim.boss] / sim.eMaxHp[sim.boss] * 100) + '%' : '-',
    evolved: sim.weapons.filter(w => w.def.evolved).map(w => w.def.id).join(' ') || '-',
    build: sim.weapons.map(w => `${w.def.id}${w.level}`).concat(sim.passives.map(p => `${p.def.id}${p.level}`)).join(' '),
    avgStepMs: +(totalMs / steps).toFixed(3),
    worstStepMs: +worstStep.toFixed(2)
  };
  results.push(res);
  console.log(JSON.stringify(res));
}
console.log(`\nwins ${results.filter(r => r.won).length}/${runs}`);
const secs = results.map(r => r.seconds).sort((a, b) => a - b);
console.log(`\nmedian survival ${Math.floor(secs[secs.length >> 1] / 60)}m${secs[secs.length >> 1] % 60}s over ${runs} runs`);
