/* HOLDOUT - weapons.
   Each weapon is a table of five levels (each level lists only what changes;
   `levels()` folds them into complete stat blocks) plus three functions:
   init() sets up its state, update() runs every tick, and the renderer reads
   that state to draw it. Stats are multiplied by the player's passives
   through sim.stats - damage, cooldown, area, amount. */

import { EV } from '../sim/events.js';

function levels(base, ...steps) {
  const out = [base];
  for (const s of steps) out.push({ ...out[out.length - 1], ...s });
  return out;
}

const TAU = Math.PI * 2;

export const WEAPONS = [
  {
    id: 'bolt',
    name: 'Arc Bolt',
    icon: 'bolt',
    blurb: 'Fires at the nearest enemy.',
    levels: levels(
      { dmg: 12, cd: 0.85, count: 1, pierce: 0, speed: 560, life: 1.1, r: 7 },
      { count: 2 },
      { dmg: 17, pierce: 1 },
      { count: 3, cd: 0.72 },
      { dmg: 24, pierce: 2, count: 4 }
    ),
    notes: ['', '+1 bolt', '+40% damage, pierces 1', '+1 bolt, fires faster', '+40% damage, +1 bolt, pierces 2'],
    init(w) {
      w.t = 0.4;
      w.burst = 0;
      w.bt = 0;
    },
    update(sim, w, dt) {
      const s = w.stats, st = sim.stats, p = sim.p;
      if (w.burst > 0) {
        w.bt -= dt;
        if (w.bt <= 0) {
          const target = sim.nearestEnemy(p.x, p.y, 700);
          let a = p.face;
          if (target >= 0) a = Math.atan2(sim.ey[target] - p.y, sim.ex[target] - p.x);
          a += (sim.rng.next() - 0.5) * 0.12;
          const v = s.speed;
          sim.spawnShot(0, p.x, p.y, Math.cos(a) * v, Math.sin(a) * v, s.life,
            s.dmg * st.damage, s.r * st.area, s.pierce, w.slot, 140);
          w.burst--;
          w.bt = 0.075;
        }
      }
      w.t -= dt;
      if (w.t <= 0) {
        if (sim.nearestEnemy(p.x, p.y, 700) < 0) {
          w.t = 0.15;
          return;
        }
        w.burst = s.count + st.amount;
        w.bt = 0;
        w.t = s.cd * st.cooldown;
      }
    }
  },
  {
    id: 'orbit',
    name: 'Orbit Blades',
    icon: 'blade',
    blurb: 'Blades circle you, cutting what they touch.',
    levels: levels(
      { dmg: 9, n: 2, radius: 72, spin: 3.0, every: 0.45, r: 15 },
      { n: 3 },
      { dmg: 13, radius: 82 },
      { n: 4, spin: 3.6 },
      { n: 5, dmg: 18, radius: 92 }
    ),
    notes: ['', '+1 blade', '+45% damage, wider orbit', '+1 blade, spins faster', '+1 blade, +40% damage, wider'],
    init(w) {
      w.angle = 0;
      w.n = 0;
      w.bx = new Float32Array(10);
      w.by = new Float32Array(10);
      w.br = 15;
    },
    update(sim, w, dt) {
      const s = w.stats, st = sim.stats, p = sim.p;
      const n = Math.min(10, s.n + st.amount);
      const R = s.radius * st.area, br = s.r * st.area;
      w.angle = (w.angle + s.spin * dt) % TAU;
      w.n = n;
      w.br = br;
      const out = sim.scratch;
      for (let k = 0; k < n; k++) {
        const a = w.angle + (TAU * k) / n;
        const x = p.x + Math.cos(a) * R, y = p.y + Math.sin(a) * R;
        w.bx[k] = x;
        w.by[k] = y;
        const c = sim.grid.query(x, y, br + 30, out);
        for (let q = 0; q < c; q++) {
          const e = out[q];
          const dx = sim.ex[e] - x, dy = sim.ey[e] - y, rr = br + sim.eR[e];
          if (dx * dx + dy * dy > rr * rr) continue;
          /* Throw them outward, away from the player, not along the blade. */
          const ox = sim.ex[e] - p.x, oy = sim.ey[e] - p.y, ol = Math.hypot(ox, oy) || 1;
          sim.hitEnemy(e, s.dmg * st.damage, (ox / ol) * 160, (oy / ol) * 160, w.slot, s.every);
        }
      }
    }
  },
  {
    id: 'nova',
    name: 'Nova Pulse',
    icon: 'nova',
    blurb: 'A shockwave that hurls back everything near you.',
    levels: levels(
      { dmg: 16, cd: 3.2, radius: 150, kb: 340 },
      { radius: 175 },
      { dmg: 25 },
      { cd: 2.6 },
      { dmg: 36, radius: 210 }
    ),
    notes: ['', '+17% radius', '+55% damage', 'pulses faster', '+45% damage, +20% radius'],
    init(w) {
      w.t = 1.2;
      w.ring = 0;
      w.ringMax = 0;
      w.ringOn = false;
    },
    update(sim, w, dt) {
      const s = w.stats, st = sim.stats, p = sim.p;
      w.t -= dt;
      if (w.t <= 0) {
        w.t = s.cd * st.cooldown;
        w.ring = 10;
        w.ringMax = s.radius * st.area;
        w.ringOn = true;
        sim.events.push(EV.NOVA, p.x, p.y, w.ringMax);
      }
      if (!w.ringOn) return;
      /* The front expands over a third of a second and hits each enemy once
         as it passes - the hit cooldown is longer than the ring lives. */
      w.ring = Math.min(w.ringMax, w.ring + (w.ringMax / 0.32) * dt);
      const out = sim.scratch;
      const c = sim.grid.query(p.x, p.y, w.ring + 30, out);
      const r2 = w.ring * w.ring;
      for (let q = 0; q < c; q++) {
        const e = out[q];
        const dx = sim.ex[e] - p.x, dy = sim.ey[e] - p.y, d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const d = Math.sqrt(d2) || 1;
        sim.hitEnemy(e, s.dmg * st.damage, (dx / d) * s.kb, (dy / d) * s.kb, w.slot, 1.0);
      }
      if (w.ring >= w.ringMax) w.ringOn = false;
    }
  }
];

export const WEAPON_INDEX = Object.fromEntries(WEAPONS.map((w, i) => [w.id, i]));
