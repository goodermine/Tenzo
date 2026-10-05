/* HOLDOUT - the wave director: what spawns, how often, and how tough.
   A table of phases keyed by run time, so pacing is tuned by editing numbers
   (tools/bot.mjs plays seeded runs and reports how far builds get). New
   enemy types arrive one at a time, so each gets a moment to be learned.

   Set pieces on top of the phases:
   - surges: a ring of enemies closing from every side at once
   - elites: a tough one that drops a cache (an extra upgrade)
   - bosses: THE HIVE at 10:00; THE MONOLITH at 15:00, which ends the run -
     regular spawns stop and it is just you and it. */
import { ENEMY_INDEX } from '../content/enemies.js';
import { EV } from './events.js';

/* rate: spawns per second; max: alive cap; mix: [type, weight] */
const PHASES = [
  { t: 0, rate: 1.5, max: 30, mix: [['chaser', 1]] },
  { t: 25, rate: 2.4, max: 55, mix: [['chaser', 3], ['swarmer', 2]] },
  { t: 60, rate: 3.4, max: 85, mix: [['chaser', 3], ['swarmer', 3], ['dasher', 1]] },
  { t: 100, rate: 4.2, max: 105, mix: [['chaser', 3], ['swarmer', 3], ['dasher', 1], ['splitter', 1]] },
  { t: 140, rate: 5.2, max: 130, mix: [['chaser', 3], ['swarmer', 3], ['dasher', 1.2], ['splitter', 1], ['shooter', 0.7], ['tank', 0.3]] },
  { t: 200, rate: 6.8, max: 175, mix: [['chaser', 3], ['swarmer', 4], ['dasher', 1.5], ['splitter', 1.2], ['shooter', 0.9], ['tank', 0.4], ['bomber', 1]] },
  { t: 270, rate: 8.5, max: 220, mix: [['chaser', 3], ['swarmer', 4], ['dasher', 1.5], ['splitter', 1.3], ['shooter', 1], ['tank', 0.5], ['bomber', 1.2], ['warden', 0.8]] },
  { t: 360, rate: 11, max: 290, mix: [['chaser', 3], ['swarmer', 5], ['dasher', 2], ['splitter', 1.5], ['shooter', 1.1], ['tank', 0.6], ['bomber', 1.4], ['warden', 1], ['blinker', 1]] },
  { t: 480, rate: 14, max: 360, mix: [['chaser', 3], ['swarmer', 6], ['dasher', 2.2], ['splitter', 1.6], ['shooter', 1.2], ['tank', 0.8], ['bomber', 1.6], ['warden', 1.3], ['blinker', 1.3]] },
  /* the Hive's fight: the field thins so the boss is the focus */
  { t: 600, rate: 8, max: 220, mix: [['chaser', 3], ['swarmer', 4], ['dasher', 2], ['bomber', 1.5], ['shooter', 1]] },
  { t: 690, rate: 17, max: 440, mix: [['chaser', 3], ['swarmer', 7], ['dasher', 2.5], ['splitter', 2], ['shooter', 1.3], ['tank', 1], ['bomber', 2], ['warden', 1.6], ['blinker', 1.6]] },
  { t: 800, rate: 22, max: 520, mix: [['chaser', 3], ['swarmer', 8], ['dasher', 3], ['splitter', 2.2], ['shooter', 1.5], ['tank', 1.2], ['bomber', 2.2], ['warden', 2], ['blinker', 2]] },
  { t: 900, rate: 0, max: 0, mix: [['chaser', 1]] }
];

/* At these times a ring of `n` enemies spawns around the player at once. */
const SURGES = [
  { t: 45, kind: 'swarmer', n: 24 },
  { t: 100, kind: 'chaser', n: 30 },
  { t: 160, kind: 'swarmer', n: 40 },
  { t: 230, kind: 'dasher', n: 16 },
  { t: 300, kind: 'swarmer', n: 56 },
  { t: 370, kind: 'bomber', n: 24 },
  { t: 450, kind: 'tank', n: 12 },
  { t: 520, kind: 'swarmer', n: 80 },
  { t: 660, kind: 'splitter', n: 30 },
  { t: 740, kind: 'blinker', n: 24 },
  { t: 790, kind: 'swarmer', n: 110 },
  { t: 860, kind: 'warden', n: 30 }
];

const ELITES = [150, 300, 420, 540, 700, 780, 850];
const BOSSES = [
  { t: 600, kind: 'hive' },
  { t: 900, kind: 'monolith' }
];

const compile = mix => {
  const total = mix.reduce((k, m) => k + m[1], 0);
  return mix.map(([id, w]) => [ENEMY_INDEX[id], w / total]);
};
const COMPILED = PHASES.map(p => ({ ...p, mix: compile(p.mix) }));

export class Director {
  constructor(sim) {
    this.sim = sim;
    this.acc = 0;
    this.nextSurge = 0;
    this.nextElite = 0;
    this.nextBoss = 0;
  }

  /** Enemy health multiplier at a given run time: gentle early, steep late. */
  static hpScale(t) {
    const m = t / 60;
    return 1 + 0.22 * m + 0.022 * m * m;
  }

  phase(t) {
    let p = COMPILED[0];
    for (const c of COMPILED) if (c.t <= t) p = c;
    return p;
  }

  ring(type, n, R) {
    const sim = this.sim;
    for (let k = 0; k < n; k++) {
      const a = (Math.PI * 2 * k) / n;
      sim.spawnEnemy(type, sim.p.x + Math.cos(a) * R, sim.p.y + Math.sin(a) * R);
    }
  }

  edge() {
    const sim = this.sim, a = sim.rng.next() * Math.PI * 2;
    const d = sim.viewRadius + 40 + sim.rng.next() * 80;
    return [sim.p.x + Math.cos(a) * d, sim.p.y + Math.sin(a) * d];
  }

  update(dt) {
    const sim = this.sim, t = sim.time;
    const ph = this.phase(t);
    this.acc = Math.min(this.acc + ph.rate * dt, 6);
    while (this.acc >= 1) {
      this.acc -= 1;
      if (sim.eCount >= ph.max) break;
      const [x, y] = this.edge();
      sim.spawnEnemy(this.pick(ph.mix), x, y);
    }
    while (this.nextSurge < SURGES.length && SURGES[this.nextSurge].t <= t) {
      const s = SURGES[this.nextSurge++];
      this.ring(ENEMY_INDEX[s.kind], s.n, sim.viewRadius * 0.92);
      sim.events.push(EV.SURGE, sim.p.x, sim.p.y, s.n);
    }
    while (this.nextElite < ELITES.length && ELITES[this.nextElite] <= t) {
      this.nextElite++;
      const [x, y] = this.edge();
      sim.spawnEnemy(ENEMY_INDEX.elite, x, y);
    }
    while (this.nextBoss < BOSSES.length && BOSSES[this.nextBoss].t <= t) {
      const b = BOSSES[this.nextBoss++];
      const [x, y] = this.edge();
      sim.spawnEnemy(ENEMY_INDEX[b.kind], x, y);
    }
  }

  pick(mix) {
    let r = this.sim.rng.next();
    for (const [type, w] of mix) {
      if ((r -= w) <= 0) return type;
    }
    return mix[mix.length - 1][0];
  }
}
