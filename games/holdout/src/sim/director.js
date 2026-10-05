/* HOLDOUT - the wave director: what spawns, how often, and how tough.
   A table of phases keyed by run time, so pacing is tuned by editing numbers
   (tools/bot.mjs plays seeded runs and reports how long a build survives).
   Surges are the set pieces: a ring of enemies closing from every side at
   once, which is when the screen is at its busiest. */
import { ENEMY_INDEX } from '../content/enemies.js';
import { EV } from './events.js';

/* rate: spawns per second; max: alive cap; mix: [type, weight] */
const PHASES = [
  { t: 0, rate: 1.5, max: 30, mix: [['chaser', 1]] },
  { t: 25, rate: 2.4, max: 55, mix: [['chaser', 3], ['swarmer', 2]] },
  { t: 60, rate: 3.4, max: 85, mix: [['chaser', 3], ['swarmer', 3], ['dasher', 1]] },
  { t: 110, rate: 4.8, max: 125, mix: [['chaser', 3], ['swarmer', 3], ['dasher', 1.5], ['tank', 0.35]] },
  { t: 180, rate: 6.8, max: 180, mix: [['chaser', 3], ['swarmer', 4], ['dasher', 2], ['tank', 0.5]] },
  { t: 270, rate: 9.5, max: 250, mix: [['chaser', 3], ['swarmer', 5], ['dasher', 2], ['tank', 0.7]] },
  { t: 390, rate: 12.5, max: 330, mix: [['chaser', 3], ['swarmer', 5], ['dasher', 2.5], ['tank', 0.9]] },
  { t: 540, rate: 16, max: 420, mix: [['chaser', 3], ['swarmer', 6], ['dasher', 3], ['tank', 1.1]] },
  { t: 720, rate: 21, max: 520, mix: [['chaser', 3], ['swarmer', 7], ['dasher', 3], ['tank', 1.4]] }
];

/* At these times a ring of `n` enemies spawns around the player at once. */
const SURGES = [
  { t: 45, kind: 'swarmer', n: 24 },
  { t: 100, kind: 'chaser', n: 30 },
  { t: 160, kind: 'swarmer', n: 40 },
  { t: 230, kind: 'dasher', n: 16 },
  { t: 300, kind: 'swarmer', n: 56 },
  { t: 370, kind: 'chaser', n: 60 },
  { t: 450, kind: 'tank', n: 12 },
  { t: 520, kind: 'swarmer', n: 80 },
  { t: 600, kind: 'dasher', n: 32 },
  { t: 680, kind: 'chaser', n: 90 },
  { t: 760, kind: 'swarmer', n: 110 },
  { t: 840, kind: 'tank', n: 24 }
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

  update(dt) {
    const sim = this.sim, t = sim.time;
    const ph = this.phase(t);
    this.acc = Math.min(this.acc + ph.rate * dt, 6);
    while (this.acc >= 1) {
      this.acc -= 1;
      if (sim.eCount >= ph.max) break;
      const a = sim.rng.next() * Math.PI * 2;
      const d = sim.viewRadius + 40 + sim.rng.next() * 80;
      sim.spawnEnemy(this.pick(ph.mix), sim.p.x + Math.cos(a) * d, sim.p.y + Math.sin(a) * d);
    }
    while (this.nextSurge < SURGES.length && SURGES[this.nextSurge].t <= t) {
      const s = SURGES[this.nextSurge++];
      const type = ENEMY_INDEX[s.kind];
      const R = sim.viewRadius * 0.92;
      for (let k = 0; k < s.n; k++) {
        const a = (Math.PI * 2 * k) / s.n;
        sim.spawnEnemy(type, sim.p.x + Math.cos(a) * R, sim.p.y + Math.sin(a) * R);
      }
      sim.events.push(EV.SURGE, sim.p.x, sim.p.y, s.n);
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
