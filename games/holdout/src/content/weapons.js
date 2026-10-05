/* HOLDOUT - weapons.
   Each weapon is a table of five levels (each level lists only what changes;
   levels() folds them into complete stat blocks) plus init() to set up its
   state and update() to run each tick. The renderer reads that state to draw
   the weapons that are not plain projectiles (blades, beams, wells, drones).
   Stats are scaled by the passives through sim.stats: damage, cooldown,
   area, amount.

   An evolution is a weapon at level 5 plus a particular passive: it then
   turns into a stronger single-level form (EVOLUTIONS, at the bottom). */
import { EV } from '../sim/events.js';

function levels(base, ...steps) {
  const out = [base];
  for (const s of steps) out.push({ ...out[out.length - 1], ...s });
  return out;
}

const TAU = Math.PI * 2;

/* Shot behaviours, interpreted by sim.updateShots(). */
export const BEH = { STRAIGHT: 0, GLAIVE: 1, MISSILE: 2, MINE: 3, RICOCHET: 4, FLAME: 5 };
/* Shot looks, interpreted by the renderer. */
export const SHOT = { BOLT: 0, GLAIVE: 1, MISSILE: 2, MINE: 3, DISC: 4, FLAME: 5, PELLET: 6, LANCE: 7 };
/* Pierce at or above this never runs out; such shots gate their hits by
   time instead (see sim.updateShots). */
export const PIERCE_ALL = 100;

function aimAt(sim, maxR = 700) {
  const p = sim.p;
  const t = sim.nearestEnemy(p.x, p.y, maxR);
  return t >= 0 ? Math.atan2(sim.ey[t] - p.y, sim.ex[t] - p.x) : p.face;
}

/* --------------------------------------------------------------- bolt */

const bolt = {
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
        const base = aimAt(sim);
        /* the evolved lance fires its whole volley at once, in a fan */
        const n = s.fan ? w.burst : 1;
        for (let k = 0; k < n; k++) {
          const a = base + (s.fan ? (k - (n - 1) / 2) * s.fan : (sim.rng.next() - 0.5) * 0.12);
          sim.spawnShot(s.fan ? SHOT.LANCE : SHOT.BOLT, BEH.STRAIGHT, p.x, p.y,
            Math.cos(a) * s.speed, Math.sin(a) * s.speed, s.life, s.dmg * st.damage,
            s.r * st.area, s.pierce, w.slot, 140);
        }
        w.burst -= n;
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
};

/* --------------------------------------------------------------- orbit */

const orbit = {
  id: 'orbit',
  name: 'Orbit Blades',
  icon: 'orbit',
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
    w.bx = new Float32Array(12);
    w.by = new Float32Array(12);
    w.br = 15;
  },
  update(sim, w, dt) {
    const s = w.stats, st = sim.stats, p = sim.p;
    const n = Math.min(12, s.n + st.amount);
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
      const c = sim.grid.query(x, y, br + 80, out);
      for (let q = 0; q < c; q++) {
        const e = out[q];
        const dx = sim.ex[e] - x, dy = sim.ey[e] - y, rr = br + sim.eR[e];
        if (dx * dx + dy * dy > rr * rr) continue;
        /* thrown outward, away from the player, not along the blade */
        const ox = sim.ex[e] - p.x, oy = sim.ey[e] - p.y, ol = Math.hypot(ox, oy) || 1;
        sim.hitEnemy(e, s.dmg * st.damage, (ox / ol) * 160, (oy / ol) * 160, w.slot, s.every);
      }
    }
  }
};

/* --------------------------------------------------------------- nova */

const nova = {
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
    w.healed = 0;
  },
  update(sim, w, dt) {
    const s = w.stats, st = sim.stats, p = sim.p;
    w.t -= dt;
    if (w.t <= 0) {
      w.t = s.cd * st.cooldown;
      w.ring = 10;
      w.ringMax = s.radius * st.area;
      w.ringOn = true;
      w.healed = 0;
      sim.events.push(EV.NOVA, p.x, p.y, w.ringMax);
    }
    if (!w.ringOn) return;
    /* The front expands over a third of a second and hits each enemy once
       as it passes - the hit gate outlasts the ring. */
    w.ring = Math.min(w.ringMax, w.ring + (w.ringMax / 0.32) * dt);
    const out = sim.scratch;
    const c = sim.grid.query(p.x, p.y, w.ring + 30, out);
    const r2 = w.ring * w.ring;
    for (let q = 0; q < c; q++) {
      const e = out[q];
      const dx = sim.ex[e] - p.x, dy = sim.ey[e] - p.y, d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      const d = Math.sqrt(d2) || 1;
      if (sim.hitEnemy(e, s.dmg * st.damage, (dx / d) * s.kb, (dy / d) * s.kb, w.slot, 1.0) && s.heal && w.healed < 12) {
        w.healed += s.heal;
        p.hp = Math.min(p.maxHp, p.hp + s.heal);
      }
    }
    if (w.ring >= w.ringMax) w.ringOn = false;
  }
};

/* --------------------------------------------------------------- chain */

const chain = {
  id: 'chain',
  name: 'Chain Lightning',
  icon: 'chain',
  blurb: 'Strikes an enemy and arcs on to the ones beside it.',
  levels: levels(
    { dmg: 14, cd: 1.4, chains: 3, range: 360, jump: 150, strikes: 1 },
    { chains: 4 },
    { dmg: 20 },
    { strikes: 2 },
    { chains: 6, dmg: 28 }
  ),
  notes: ['', '+1 arc', '+45% damage', 'strikes twice', '+2 arcs, +40% damage'],
  init(w) {
    w.t = 0.8;
    w.hit = new Int32Array(24);
  },
  update(sim, w, dt) {
    const s = w.stats, st = sim.stats, p = sim.p;
    w.t -= dt;
    if (w.t > 0) return;
    const first = sim.nearestEnemy(p.x, p.y, s.range * st.area);
    if (first < 0) {
      w.t = 0.2;
      return;
    }
    w.t = s.cd * st.cooldown;
    for (let k = 0; k < s.strikes; k++) {
      let cur = k === 0 ? first : sim.randomEnemyNear(p.x, p.y, s.range * st.area);
      if (cur < 0) break;
      let fx = p.x, fy = p.y, n = 0;
      for (let c = 0; c <= s.chains + st.amount && cur >= 0; c++) {
        const x = sim.ex[cur], y = sim.ey[cur];
        sim.events.push(EV.BEAM, fx, fy, x, y);
        w.hit[n++] = cur;
        sim.hitEnemy(cur, s.dmg * st.damage, 0, 0);
        fx = x;
        fy = y;
        cur = sim.nearestEnemyExcept(x, y, s.jump * st.area, w.hit, n);
      }
    }
  }
};

/* --------------------------------------------------------------- glaive */

const glaive = {
  id: 'glaive',
  name: 'Glaive',
  icon: 'glaive',
  blurb: 'A spinning blade that flies out and comes back.',
  levels: levels(
    { dmg: 14, cd: 1.6, count: 1, speed: 430, out: 0.55, r: 14 },
    { count: 2 },
    { dmg: 20 },
    { cd: 1.2, r: 17 },
    { count: 3, dmg: 28 }
  ),
  notes: ['', '+1 glaive', '+45% damage', 'throws faster, bigger', '+1 glaive, +40% damage'],
  init(w) {
    w.t = 0.5;
  },
  update(sim, w, dt) {
    const s = w.stats, st = sim.stats, p = sim.p;
    w.t -= dt;
    if (w.t > 0) return;
    w.t = s.cd * st.cooldown;
    const n = s.count + st.amount, base = aimAt(sim, 600);
    for (let k = 0; k < n; k++) {
      const a = base + (k - (n - 1) / 2) * 0.5;
      sim.spawnShot(SHOT.GLAIVE, BEH.GLAIVE, p.x, p.y, Math.cos(a) * s.speed, Math.sin(a) * s.speed,
        4, s.dmg * st.damage, s.r * st.area, PIERCE_ALL, w.slot, 120, s.out);
    }
  }
};

/* --------------------------------------------------------------- missiles */

const missiles = {
  id: 'missiles',
  name: 'Seeker Missiles',
  icon: 'missiles',
  blurb: 'Homing missiles that burst on impact.',
  levels: levels(
    { dmg: 18, cd: 1.8, count: 2, speed: 300, turn: 5, splash: 55 },
    { count: 3 },
    { dmg: 26 },
    { splash: 70 },
    { count: 5, dmg: 34 }
  ),
  notes: ['', '+1 missile', '+45% damage', '+27% blast radius', '+2 missiles, +30% damage'],
  init(w) {
    w.t = 0.9;
  },
  update(sim, w, dt) {
    const s = w.stats, st = sim.stats, p = sim.p;
    w.t -= dt;
    if (w.t > 0) return;
    if (sim.nearestEnemy(p.x, p.y, 650) < 0) {
      w.t = 0.2;
      return;
    }
    w.t = s.cd * st.cooldown;
    const n = s.count + st.amount;
    for (let k = 0; k < n; k++) {
      /* launched in a spread behind the ship, then they find their own way */
      const a = p.face + Math.PI + (k - (n - 1) / 2) * 0.55 + (sim.rng.next() - 0.5) * 0.3;
      const i = sim.spawnShot(SHOT.MISSILE, BEH.MISSILE, p.x, p.y, Math.cos(a) * s.speed * 0.6,
        Math.sin(a) * s.speed * 0.6, 3.2, s.dmg * st.damage, 8, 0, w.slot, 0, s.splash * st.area);
      if (i >= 0) {
        sim.sTurn[i] = s.turn;
        sim.sSpeed[i] = s.speed;
      }
    }
  }
};

/* --------------------------------------------------------------- laser */

const laser = {
  id: 'laser',
  name: 'Laser Sweep',
  icon: 'laser',
  blurb: 'A beam that sweeps an arc in front of you.',
  levels: levels(
    { dmg: 22, cd: 2.4, len: 300, width: 10, arc: 1.7, time: 0.42, both: false },
    { len: 360 },
    { dmg: 32 },
    { cd: 1.8 },
    { dmg: 45, len: 420, both: true }
  ),
  notes: ['', '+20% length', '+45% damage', 'sweeps more often', '+40% damage, longer, fires both ways'],
  init(w) {
    w.t = 1.0;
    w.on = 0;
    w.a = 0;
    w.a0 = 0;
    w.len = 0;
  },
  update(sim, w, dt) {
    const s = w.stats, st = sim.stats, p = sim.p;
    w.t -= dt;
    if (w.on <= 0 && w.t <= 0) {
      if (sim.nearestEnemy(p.x, p.y, s.len * st.area) < 0) {
        w.t = 0.2;
        return;
      }
      w.t = s.cd * st.cooldown;
      w.on = s.time;
      w.a0 = aimAt(sim) - s.arc / 2;
      sim.events.push(EV.LASER, p.x, p.y, w.slot);
    }
    if (w.on <= 0) return;
    w.on -= dt;
    w.a = w.a0 + s.arc * (1 - Math.max(0, w.on) / s.time);
    w.len = s.len * st.area;
    w.width = s.width * st.area;
    const beams = s.both ? 2 : 1;
    for (let b = 0; b < beams; b++) {
      const a = w.a + b * Math.PI;
      sim.hitAlongBeam(p.x, p.y, Math.cos(a), Math.sin(a), w.len, w.width, s.dmg * st.damage, w.slot, s.time);
    }
  }
};

/* --------------------------------------------------------------- mines */

const mines = {
  id: 'mines',
  name: 'Proximity Mines',
  icon: 'mines',
  blurb: 'Drops mines that blow when something steps close.',
  levels: levels(
    { dmg: 40, cd: 1.4, count: 1, splash: 70 },
    { count: 2 },
    { dmg: 60 },
    { splash: 90 },
    { count: 3, dmg: 85 }
  ),
  notes: ['', '+1 mine', '+50% damage', '+28% blast radius', '+1 mine, +40% damage'],
  init(w) {
    w.t = 0.7;
  },
  update(sim, w, dt) {
    const s = w.stats, st = sim.stats, p = sim.p;
    w.t -= dt;
    if (w.t > 0) return;
    w.t = s.cd * st.cooldown;
    const n = s.count + st.amount;
    for (let k = 0; k < n; k++) {
      const a = sim.rng.next() * TAU, d = k === 0 ? 0 : 30 + sim.rng.next() * 40;
      sim.spawnShot(SHOT.MINE, BEH.MINE, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 0, 0,
        12, s.dmg * st.damage, 40, 0, w.slot, 0, s.splash * st.area);
    }
  }
};

/* --------------------------------------------------------------- flame */

const flame = {
  id: 'flame',
  name: 'Flamethrower',
  icon: 'flame',
  blurb: 'A short, wide cone of fire at the nearest enemy.',
  levels: levels(
    { dmg: 5, rate: 0.05, spread: 0.32, speed: 300, life: 0.42, every: 0.25 },
    { dmg: 7 },
    { spread: 0.45, life: 0.5 },
    { dmg: 10 },
    { dmg: 14, life: 0.6 }
  ),
  notes: ['', '+40% damage', 'wider, longer reach', '+40% damage', '+40% damage, longer reach'],
  init(w) {
    w.t = 0;
  },
  update(sim, w, dt) {
    const s = w.stats, st = sim.stats, p = sim.p;
    const target = sim.nearestEnemy(p.x, p.y, s.speed * s.life * 1.1 * st.area);
    if (target < 0) return;
    const base = Math.atan2(sim.ey[target] - p.y, sim.ex[target] - p.x);
    w.t -= dt;
    while (w.t <= 0) {
      w.t += s.rate * st.cooldown;
      const a = base + (sim.rng.next() - 0.5) * 2 * s.spread;
      const v = s.speed * (0.8 + sim.rng.next() * 0.4);
      sim.spawnShot(SHOT.FLAME, BEH.FLAME, p.x, p.y, Math.cos(a) * v + p.vx, Math.sin(a) * v + p.vy,
        s.life * st.area, s.dmg * st.damage, 10 * st.area, PIERCE_ALL, w.slot, 40, s.every);
    }
  }
};

/* --------------------------------------------------------------- ricochet */

const ricochet = {
  id: 'ricochet',
  name: 'Ricochet Disc',
  icon: 'ricochet',
  blurb: 'A disc that bounces from enemy to enemy.',
  levels: levels(
    { dmg: 15, cd: 1.2, bounces: 3, speed: 480, count: 1 },
    { bounces: 4 },
    { dmg: 22 },
    { count: 2 },
    { bounces: 7, dmg: 30 }
  ),
  notes: ['', '+1 bounce', '+45% damage', '+1 disc', '+3 bounces, +35% damage'],
  init(w) {
    w.t = 0.6;
  },
  update(sim, w, dt) {
    const s = w.stats, st = sim.stats, p = sim.p;
    w.t -= dt;
    if (w.t > 0) return;
    if (sim.nearestEnemy(p.x, p.y, 600) < 0) {
      w.t = 0.2;
      return;
    }
    w.t = s.cd * st.cooldown;
    const n = s.count + st.amount, base = aimAt(sim);
    for (let k = 0; k < n; k++) {
      const a = base + (k - (n - 1) / 2) * 0.4;
      sim.spawnShot(SHOT.DISC, BEH.RICOCHET, p.x, p.y, Math.cos(a) * s.speed, Math.sin(a) * s.speed,
        2.2, s.dmg * st.damage, 9 * st.area, s.bounces, w.slot, 90);
    }
  }
};

/* --------------------------------------------------------------- gravity */

const gravity = {
  id: 'gravity',
  name: 'Gravity Well',
  icon: 'gravity',
  blurb: 'Opens a vortex that drags enemies in and grinds them.',
  levels: levels(
    { dmg: 6, cd: 5, radius: 90, pull: 120, life: 3, every: 0.35 },
    { radius: 110 },
    { dmg: 10 },
    { cd: 4 },
    { radius: 140, pull: 170, dmg: 14 }
  ),
  notes: ['', '+22% radius', '+65% damage', 'opens more often', 'bigger, stronger pull, +40% damage'],
  init(w) {
    w.t = 1.5;
    w.wx = new Float32Array(4);
    w.wy = new Float32Array(4);
    w.wt = new Float32Array(4);
    w.wr = new Float32Array(4);
  },
  update(sim, w, dt) {
    const s = w.stats, st = sim.stats, p = sim.p;
    w.t -= dt;
    if (w.t <= 0) {
      const e = sim.randomEnemyNear(p.x, p.y, 320);
      if (e < 0) w.t = 0.3;
      else {
        w.t = s.cd * st.cooldown;
        let k = 0;
        for (let j = 1; j < 4; j++) if (w.wt[j] < w.wt[k]) k = j;
        w.wx[k] = sim.ex[e];
        w.wy[k] = sim.ey[e];
        w.wt[k] = s.life;
        w.wr[k] = s.radius * st.area;
      }
    }
    const out = sim.scratch;
    for (let k = 0; k < 4; k++) {
      if (w.wt[k] <= 0) continue;
      w.wt[k] -= dt;
      const cx = w.wx[k], cy = w.wy[k], R = w.wr[k];
      const c = sim.grid.query(cx, cy, R, out);
      for (let q = 0; q < c; q++) {
        const e = out[q];
        if (sim.eDef(e).boss) continue;
        const dx = cx - sim.ex[e], dy = cy - sim.ey[e], d = Math.hypot(dx, dy) || 1;
        if (d > R) continue;
        /* pulled harder towards the middle, so they bunch at the core */
        const pull = s.pull * (0.4 + 0.6 * (1 - d / R)) * dt;
        const step = Math.min(d, pull / Math.sqrt(sim.eMass[e]));
        sim.ex[e] += (dx / d) * step;
        sim.ey[e] += (dy / d) * step;
        sim.hitEnemy(e, s.dmg * st.damage, 0, 0, w.slot, s.every);
      }
    }
  }
};

/* --------------------------------------------------------------- drones */

const drones = {
  id: 'drones',
  name: 'Sentry Drones',
  icon: 'drones',
  blurb: 'Drones that follow you and shoot on their own.',
  levels: levels(
    { dmg: 8, n: 1, cd: 0.7, speed: 500 },
    { n: 2 },
    { dmg: 12 },
    { cd: 0.5 },
    { n: 3, dmg: 16 }
  ),
  notes: ['', '+1 drone', '+50% damage', 'fire faster', '+1 drone, +35% damage'],
  init(w) {
    w.n = 0;
    w.dx = new Float32Array(6);
    w.dy = new Float32Array(6);
    w.dt = new Float32Array(6);
    w.angle = 0;
  },
  update(sim, w, dt) {
    const s = w.stats, st = sim.stats, p = sim.p;
    const n = Math.min(6, s.n + st.amount);
    w.n = n;
    w.angle += dt * 1.3;
    for (let k = 0; k < n; k++) {
      const a = w.angle + (TAU * k) / n;
      /* trail the ship loosely instead of sitting on a rigid ring */
      const tx = p.x + Math.cos(a) * 46, ty = p.y + Math.sin(a) * 46;
      const f = Math.min(1, dt * 6);
      w.dx[k] += (tx - w.dx[k]) * f;
      w.dy[k] += (ty - w.dy[k]) * f;
      w.dt[k] -= dt;
      if (w.dt[k] > 0) continue;
      const e = sim.nearestEnemy(w.dx[k], w.dy[k], 520);
      if (e < 0) {
        w.dt[k] = 0.2;
        continue;
      }
      w.dt[k] = s.cd * st.cooldown * (0.9 + sim.rng.next() * 0.2);
      const ang = Math.atan2(sim.ey[e] - w.dy[k], sim.ex[e] - w.dx[k]);
      sim.spawnShot(SHOT.PELLET, BEH.STRAIGHT, w.dx[k], w.dy[k], Math.cos(ang) * s.speed,
        Math.sin(ang) * s.speed, 1.0, s.dmg * st.damage, 5, 0, w.slot, 60);
    }
  }
};

/* --------------------------------------------------------------- scatter */

const scatter = {
  id: 'scatter',
  name: 'Scatter Gun',
  icon: 'scatter',
  blurb: 'A close-range blast of pellets that knocks enemies back.',
  levels: levels(
    { dmg: 9, cd: 1.3, count: 5, spread: 0.5, speed: 540, life: 0.42, kb: 260 },
    { count: 6 },
    { dmg: 13 },
    { cd: 1.0, count: 7 },
    { count: 9, dmg: 18 }
  ),
  notes: ['', '+1 pellet', '+45% damage', 'fires faster, +1 pellet', '+2 pellets, +40% damage'],
  init(w) {
    w.t = 0.6;
  },
  update(sim, w, dt) {
    const s = w.stats, st = sim.stats, p = sim.p;
    w.t -= dt;
    if (w.t > 0) return;
    if (sim.nearestEnemy(p.x, p.y, s.speed * s.life) < 0) {
      w.t = 0.15;
      return;
    }
    w.t = s.cd * st.cooldown;
    const n = s.count + st.amount * 2, base = aimAt(sim);
    for (let k = 0; k < n; k++) {
      const a = base + (k / (n - 1) - 0.5) * s.spread * 2 + (sim.rng.next() - 0.5) * 0.08;
      const v = s.speed * (0.85 + sim.rng.next() * 0.3);
      sim.spawnShot(SHOT.PELLET, BEH.STRAIGHT, p.x, p.y, Math.cos(a) * v, Math.sin(a) * v,
        s.life * st.area, s.dmg * st.damage, 6, 0, w.slot, s.kb);
    }
  }
};

/* --------------------------------------------------------------- evolutions */

function evolved(base, id, name, blurb, stats) {
  return { ...base, id, name, blurb, icon: base.icon, levels: [stats], notes: [''], evolved: true };
}

const lance = evolved(bolt, 'lance', 'Storm Lance', 'Volleys of heavy bolts in a wide fan that pierce everything.',
  { dmg: 40, cd: 0.55, count: 5, pierce: 5, speed: 760, life: 1.2, r: 10, fan: 0.16 });
const halo = evolved(orbit, 'halo', 'Halo Saw', 'A wide ring of saws that shreds anything inside it.',
  { dmg: 30, n: 8, radius: 118, spin: 4.4, every: 0.3, r: 21 });
const supernova = evolved(nova, 'supernova', 'Supernova', 'A vast shockwave that also repairs your hull.',
  { dmg: 70, cd: 2.0, radius: 320, kb: 600, heal: 0.6 });
const thunder = evolved(chain, 'thunder', 'Thunderhead', 'A storm of lightning arcing through whole crowds.',
  { dmg: 34, cd: 0.8, chains: 10, range: 460, jump: 200, strikes: 3 });
const barrage = evolved(missiles, 'barrage', 'Swarm Barrage', 'A cloud of seeker missiles with heavy blasts.',
  { dmg: 40, cd: 1.2, count: 10, speed: 360, turn: 7, splash: 90 });
const horizon = evolved(gravity, 'horizon', 'Event Horizon', 'Huge, lasting vortices that crush what they hold.',
  { dmg: 25, cd: 3.2, radius: 200, pull: 260, life: 4, every: 0.25 });

export const WEAPONS = [
  bolt, orbit, nova, chain, glaive, missiles, laser, mines, flame, ricochet, gravity, drones, scatter,
  lance, halo, supernova, thunder, barrage, horizon
];

export const WEAPON_INDEX = Object.fromEntries(WEAPONS.map((w, i) => [w.id, i]));

/* weapon at level 5 + this passive -> evolved form */
export const EVOLUTIONS = [
  { from: 'bolt', with: 'haste', to: 'lance' },
  { from: 'orbit', with: 'area', to: 'halo' },
  { from: 'nova', with: 'vigor', to: 'supernova' },
  { from: 'chain', with: 'might', to: 'thunder' },
  { from: 'missiles', with: 'amount', to: 'barrage' },
  { from: 'gravity', with: 'magnet', to: 'horizon' }
];
