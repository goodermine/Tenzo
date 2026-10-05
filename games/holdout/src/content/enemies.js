/* HOLDOUT - enemy types.
   Stats are data; behaviour is an optional ai() that sets the velocity the
   enemy wants this tick (sim.avx, sim.avy - it starts as a straight chase)
   and an optional onDeath(). Speeds are world units per second (the player
   moves at 150), `r` is the collision radius, `mass` scales knockback.

   ai(sim, i, dt, nx, ny, d): (nx, ny) is the unit vector to the player and
   d the distance. eMode/eT are free per-enemy state; bosses also use
   eDx/eDy as two extra timers, since they never dash. */
import { EV } from '../sim/events.js';

const TAU = Math.PI * 2;

/* Closes to range, stops and telegraphs, then lunges in a straight line - a
   threat you can read and sidestep, which is the point of it. */
function dashAi(sim, i, dt, nx, ny, d) {
  const D = this.dash;
  sim.eT[i] -= dt;
  const mode = sim.eMode[i];
  if (mode === 0 && d < D.range && sim.eT[i] <= 0) {
    sim.eMode[i] = 1;
    sim.eT[i] = D.windup;
    sim.eDx[i] = nx;
    sim.eDy[i] = ny;
  } else if (mode === 1) {
    sim.avx = sim.avy = 0;
    if (sim.eT[i] <= 0) {
      sim.eMode[i] = 2;
      sim.eT[i] = D.time;
    }
  } else if (mode === 2) {
    sim.avx = sim.eDx[i] * D.speed;
    sim.avy = sim.eDy[i] * D.speed;
    if (sim.eT[i] <= 0) {
      sim.eMode[i] = 0;
      sim.eT[i] = D.rest;
    }
  }
}

/* Holds at range, circles, and fires slow shots you can weave through. */
function shooterAi(sim, i, dt, nx, ny, d) {
  const R = this.ranged, sp = sim.eSpeed[i];
  if (d < R.keep - 40) {
    sim.avx = -nx * sp;
    sim.avy = -ny * sp;
  } else if (d < R.keep + 40) {
    const side = i % 2 ? 1 : -1;
    sim.avx = -ny * sp * 0.6 * side;
    sim.avy = nx * sp * 0.6 * side;
  }
  sim.eT[i] -= dt;
  if (sim.eT[i] <= 0 && d < 560) {
    sim.eT[i] = R.cd * (0.85 + sim.rng.next() * 0.3);
    sim.spawnBullet(sim.ex[i], sim.ey[i], nx * R.speed, ny * R.speed, R.dmg, 7);
  }
}

/* Runs in, stops, flashes, and goes off. Killing it early sets it off too -
   harmlessly to you, and through the crowd around it. */
function bomberAi(sim, i, dt, nx, ny, d) {
  const B = this.bomb;
  if (sim.eMode[i] === 0) {
    if (d < B.range) {
      sim.eMode[i] = 1;
      sim.eT[i] = B.fuse;
    }
    return;
  }
  sim.avx = sim.avy = 0;
  sim.eT[i] -= dt;
  if (sim.eT[i] <= 0) {
    const x = sim.ex[i], y = sim.ey[i];
    sim.removeEnemy(i);
    sim.explode(x, y, B.radius, B.dmg * 2, 300, B.dmg);
  }
}

function bomberDeath(sim, i) {
  sim.explode(sim.ex[i], sim.ey[i], this.bomb.radius, this.bomb.dmg * 2, 300, 0);
}

/* Blinks in close: flashes a marker where it will land, then is there. */
function blinkAi(sim, i, dt, nx, ny, d) {
  const B = this.blink;
  sim.eT[i] -= dt;
  if (sim.eMode[i] === 0) {
    sim.avx *= 0.6;
    sim.avy *= 0.6;
    if (sim.eT[i] <= 0 && d < 600) {
      const p = sim.p, a = Math.atan2(p.vy, p.vx) + (sim.rng.next() - 0.5) * 1.2;
      const lead = Math.hypot(p.vx, p.vy) > 20 ? 1 : 0;
      sim.eDx[i] = p.x + Math.cos(a) * B.dist * lead + (sim.rng.next() - 0.5) * B.dist;
      sim.eDy[i] = p.y + Math.sin(a) * B.dist * lead + (sim.rng.next() - 0.5) * B.dist;
      sim.eMode[i] = 1;
      sim.eT[i] = B.windup;
      sim.events.push(EV.TELL, sim.eDx[i], sim.eDy[i], B.windup, sim.eR[i]);
    }
  } else {
    sim.avx = sim.avy = 0;
    if (sim.eT[i] <= 0) {
      sim.events.push(EV.BLINK, sim.ex[i], sim.ey[i], sim.eDx[i], sim.eDy[i]);
      sim.ex[i] = sim.eDx[i];
      sim.ey[i] = sim.eDy[i];
      sim.eMode[i] = 0;
      sim.eT[i] = B.cd;
    }
  }
}

function splitDeath(sim, i) {
  const S = this.split, type = ENEMY_INDEX[S.type];
  for (let k = 0; k < S.n; k++) {
    const a = (TAU * k) / S.n + sim.rng.next();
    const j = sim.spawnEnemy(type, sim.ex[i] + Math.cos(a) * 14, sim.ey[i] + Math.sin(a) * 14);
    if (j >= 0) {
      sim.eKx[j] = Math.cos(a) * 160;
      sim.eKy[j] = Math.sin(a) * 160;
    }
  }
}

function eliteDeath(sim, i) {
  sim.dropItem(2, sim.ex[i], sim.ey[i]);
}

/* Boss one: a slow brood-mother that calls rings of swarmers and fires
   radial bursts with a gap you can slip through. */
function hiveAi(sim, i, dt) {
  sim.eDx[i] -= dt;
  sim.eDy[i] -= dt;
  const x = sim.ex[i], y = sim.ey[i];
  if (sim.eDx[i] <= 0) {
    sim.eDx[i] = 7;
    const sw = ENEMY_INDEX.swarmer;
    for (let k = 0; k < 12; k++) {
      const a = (TAU * k) / 12;
      sim.spawnEnemy(sw, x + Math.cos(a) * 90, y + Math.sin(a) * 90);
    }
    sim.events.push(EV.SURGE, x, y, 12);
  }
  if (sim.eDy[i] <= 0) {
    sim.eDy[i] = 3.2;
    const gap = sim.rng.next() * TAU, n = 18;
    for (let k = 0; k < n; k++) {
      const a = (TAU * k) / n;
      const off = Math.abs(((a - gap + Math.PI * 3) % TAU) - Math.PI);
      if (off < 0.45) continue;
      sim.spawnBullet(x, y, Math.cos(a) * 150, Math.sin(a) * 150, 12, 9);
    }
  }
}

function hiveDeath(sim, i) {
  for (let k = 0; k < 3; k++) sim.dropItem(2, sim.ex[i] + (k - 1) * 40, sim.ey[i]);
  sim.dropItem(1, sim.ex[i], sim.ey[i] + 40);
}

/* The final boss: a spiral of fire, then a pause; below half health it
   also charges. */
function monolithAi(sim, i, dt, nx, ny, d) {
  const x = sim.ex[i], y = sim.ey[i];
  const enraged = sim.eHp[i] < sim.eMaxHp[i] * 0.5;
  sim.eT[i] -= dt;
  sim.eDx[i] -= dt;
  if (sim.eMode[i] === 0) {
    /* spiral phase */
    if (sim.eDx[i] <= 0) {
      sim.eDx[i] = enraged ? 0.09 : 0.12;
      sim.eDy[i] += 0.37;
      const arms = enraged ? 4 : 3;
      for (let k = 0; k < arms; k++) {
        const a = sim.eDy[i] + (TAU * k) / arms;
        sim.spawnBullet(x, y, Math.cos(a) * 165, Math.sin(a) * 165, 14, 9);
      }
    }
    if (sim.eT[i] <= 0) {
      sim.eMode[i] = enraged ? 2 : 1;
      sim.eT[i] = enraged ? 0.8 : 2.2;
    }
  } else if (sim.eMode[i] === 1) {
    if (sim.eT[i] <= 0) {
      sim.eMode[i] = 0;
      sim.eT[i] = 3.5;
    }
  } else if (sim.eMode[i] === 2) {
    /* charge windup */
    sim.avx = sim.avy = 0;
    if (sim.eT[i] <= 0) {
      sim.eMode[i] = 3;
      sim.eT[i] = 0.7;
      sim.eKx[i] += nx * 520;
      sim.eKy[i] += ny * 520;
    }
  } else if (sim.eMode[i] === 3 && sim.eT[i] <= 0) {
    sim.eMode[i] = 0;
    sim.eT[i] = 3;
  }
}

function monolithDeath(sim) {
  sim.won = true;
}

export const ENEMIES = [
  { id: 'chaser', name: 'Chaser', hp: 10, speed: 64, r: 13, dmg: 6, xp: 1, mass: 1 },
  { id: 'swarmer', name: 'Swarmer', hp: 4, speed: 98, r: 8, dmg: 3, xp: 1, mass: 0.5 },
  {
    id: 'dasher', name: 'Dasher', hp: 26, speed: 58, r: 14, dmg: 10, xp: 2, mass: 1.3,
    dash: { range: 270, windup: 0.6, speed: 360, time: 0.42, rest: 1.5 }, ai: dashAi
  },
  { id: 'tank', name: 'Bulwark', hp: 150, speed: 36, r: 28, dmg: 16, xp: 6, mass: 4.5 },
  {
    id: 'splitter', name: 'Splitter', hp: 34, speed: 52, r: 17, dmg: 8, xp: 2, mass: 1.6,
    split: { type: 'swarmer', n: 3 }, onDeath: splitDeath
  },
  {
    id: 'shooter', name: 'Gunner', hp: 22, speed: 62, r: 14, dmg: 6, xp: 3, mass: 1.2,
    ranged: { keep: 240, cd: 2.6, speed: 170, dmg: 9 }, ai: shooterAi
  },
  /* Shielded: the first 70% of its health is a shield that also shrugs off
     most knockback, so it walks through a crowd being pushed back. */
  { id: 'warden', name: 'Warden', hp: 60, speed: 46, r: 18, dmg: 12, xp: 4, mass: 2.5, shield: 0.7 },
  {
    id: 'bomber', name: 'Bomber', hp: 16, speed: 84, r: 13, dmg: 0, xp: 2, mass: 0.9,
    bomb: { range: 62, fuse: 0.65, radius: 88, dmg: 22 }, ai: bomberAi, onDeath: bomberDeath
  },
  {
    id: 'blinker', name: 'Blinker', hp: 20, speed: 50, r: 13, dmg: 8, xp: 3, mass: 1,
    blink: { cd: 3.2, windup: 0.55, dist: 110 }, ai: blinkAi
  },
  {
    id: 'elite', name: 'Elite', hp: 420, speed: 60, r: 24, dmg: 20, xp: 20, mass: 7,
    elite: true, onDeath: eliteDeath
  },
  {
    id: 'hive', name: 'THE HIVE', hp: 22000, speed: 40, r: 64, dmg: 30, xp: 60, mass: 80,
    boss: true, fixedHp: true, ai: hiveAi, onDeath: hiveDeath
  },
  {
    id: 'monolith', name: 'THE MONOLITH', hp: 70000, speed: 48, r: 80, dmg: 40, xp: 0, mass: 120,
    boss: true, fixedHp: true, ai: monolithAi, onDeath: monolithDeath
  }
];

export const ENEMY_INDEX = Object.fromEntries(ENEMIES.map((e, i) => [e.id, i]));
