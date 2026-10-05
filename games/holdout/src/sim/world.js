/* HOLDOUT - the simulation.
   Everything that decides what happens lives here and in src/content/, with
   no rendering, DOM or timing of its own: the browser calls step() each
   frame, and tools/bot.mjs calls the very same step() in Node to play whole
   runs headless. The renderer only reads these arrays.

   Enemies, shots and gems are structures of typed arrays with free lists,
   sized once. A run allocates nothing per frame, which is what keeps a phone
   from hitching on garbage collection with five hundred enemies on screen. */
import { makeRng } from './rng.js';
import { Grid } from './grid.js';
import { Events, EV } from './events.js';
import { Director } from './director.js';
import { ENEMIES } from '../content/enemies.js';
import { WEAPONS, WEAPON_INDEX } from '../content/weapons.js';
import { PASSIVES, PASSIVE_INDEX } from '../content/passives.js';

export const MAX_E = 1024;
export const MAX_S = 768;
export const MAX_G = 1200;
export const SLOTS = 6;            /* weapons carried at once */
export const PASSIVE_SLOTS = 6;
const SHOT_HITS = 4;               /* enemies a piercing shot remembers */

/** XP needed to go from `level` to the next. */
export function xpFor(level) {
  const l = level - 1;
  return Math.round(4 + l * 5 + Math.pow(l, 1.35));
}

/* Allocation for the SoA pools: a free-list stack plus a high-water mark,
   so iteration only walks as far as has ever been used. */
class Pool {
  constructor(cap) {
    this.cap = cap;
    this.free = new Int32Array(cap);
    this.top = 0;
    this.high = 0;
    this.alive = new Uint8Array(cap);
    this.count = 0;
  }
  alloc() {
    let i = -1;
    if (this.top > 0) i = this.free[--this.top];
    else if (this.high < this.cap) i = this.high++;
    if (i >= 0) {
      this.alive[i] = 1;
      this.count++;
    }
    return i;
  }
  release(i) {
    if (!this.alive[i]) return;
    this.alive[i] = 0;
    this.free[this.top++] = i;
    this.count--;
  }
}

export class Sim {
  constructor({ seed = 1 } = {}) {
    this.seed = seed;
    this.rng = makeRng(seed);
    this.events = new Events(4096);
    this.time = 0;
    this.userPaused = false;
    this.over = false;
    /* Test hook: the verifier fills the screen with enemies for a
       screenshot and needs the ship to survive the photo. */
    this.invulnerable = false;
    /* Half the screen diagonal in world units, set by the view; spawns
       happen just outside it. The bot uses this default. */
    this.viewRadius = 700;
    this.move = { x: 0, y: 0 };

    this.p = {
      x: 0, y: 0, vx: 0, vy: 0, r: 14, face: -Math.PI / 2,
      hp: 100, maxHp: 100, baseSpeed: 150, hurt: 0,
      level: 1, xp: 0, xpNext: xpFor(1), kills: 0, damageTaken: 0
    };

    /* enemies */
    this.ePool = new Pool(MAX_E);
    this.eAlive = this.ePool.alive;
    this.eType = new Uint8Array(MAX_E);
    this.ex = new Float32Array(MAX_E);
    this.ey = new Float32Array(MAX_E);
    this.eHp = new Float32Array(MAX_E);
    this.eMaxHp = new Float32Array(MAX_E);
    this.eR = new Float32Array(MAX_E);
    this.eSpeed = new Float32Array(MAX_E);
    this.eDmg = new Float32Array(MAX_E);
    this.eMass = new Float32Array(MAX_E);
    this.eXp = new Float32Array(MAX_E);
    this.eFlash = new Float32Array(MAX_E);
    this.eKx = new Float32Array(MAX_E);
    this.eKy = new Float32Array(MAX_E);
    this.eAtk = new Float32Array(MAX_E);
    this.eMode = new Uint8Array(MAX_E);
    this.eT = new Float32Array(MAX_E);
    this.eDx = new Float32Array(MAX_E);
    this.eDy = new Float32Array(MAX_E);
    this.eHitCd = new Float32Array(MAX_E * SLOTS);

    /* shots */
    this.sPool = new Pool(MAX_S);
    this.sAlive = this.sPool.alive;
    this.sKind = new Uint8Array(MAX_S);
    this.sx = new Float32Array(MAX_S);
    this.sy = new Float32Array(MAX_S);
    this.svx = new Float32Array(MAX_S);
    this.svy = new Float32Array(MAX_S);
    this.sLife = new Float32Array(MAX_S);
    this.sDmg = new Float32Array(MAX_S);
    this.sR = new Float32Array(MAX_S);
    this.sKb = new Float32Array(MAX_S);
    this.sPierce = new Int8Array(MAX_S);
    this.sSlot = new Uint8Array(MAX_S);
    this.sHits = new Int32Array(MAX_S * SHOT_HITS);
    this.sHitN = new Uint8Array(MAX_S);

    /* gems */
    this.gPool = new Pool(MAX_G);
    this.gAlive = this.gPool.alive;
    this.gx = new Float32Array(MAX_G);
    this.gy = new Float32Array(MAX_G);
    this.gValue = new Float32Array(MAX_G);
    this.gPull = new Uint8Array(MAX_G);
    this.gV = new Float32Array(MAX_G);

    this.grid = new Grid(48, 96, MAX_E);
    this.scratch = new Int32Array(MAX_E);
    this.scratch2 = new Int32Array(MAX_E);

    this.weapons = [];
    this.passives = [];
    this.stats = null;
    this.recomputeStats();
    this.director = new Director(this);

    this.choices = null;
    this.pendingLevels = 0;
    /* The browser holds the cards back for a slow-motion beat after a
       level-up; while this is set the level is banked but not offered. */
    this.holdChoices = false;
    this.addWeapon('bolt');
  }

  get eHigh() { return this.ePool.high; }
  get eCount() { return this.ePool.count; }

  /* ------------------------------------------------------------ build */

  recomputeStats() {
    const s = {
      damage: 1, cooldown: 1, area: 1, speed: 1, magnet: 1,
      amount: 0, armor: 0, regen: 0, maxHp: 100, growth: 1
    };
    for (const pa of this.passives) pa.def.apply(s, pa.level);
    const p = this.p;
    if (this.stats && s.maxHp > p.maxHp) p.hp += s.maxHp - p.maxHp;
    p.maxHp = s.maxHp;
    p.hp = Math.min(p.hp, p.maxHp);
    this.stats = s;
  }

  addWeapon(id) {
    const def = WEAPONS[WEAPON_INDEX[id]];
    const owned = this.weapons.find(w => w.def === def);
    if (owned) {
      owned.level = Math.min(def.levels.length, owned.level + 1);
      owned.stats = def.levels[owned.level - 1];
      return owned;
    }
    const w = { def, level: 1, slot: this.weapons.length, stats: def.levels[0] };
    def.init(w);
    this.weapons.push(w);
    return w;
  }

  addPassive(id) {
    const def = PASSIVES[PASSIVE_INDEX[id]];
    const owned = this.passives.find(pa => pa.def === def);
    if (owned) owned.level = Math.min(def.max, owned.level + 1);
    else this.passives.push({ def, level: 1 });
    this.recomputeStats();
  }

  /* ------------------------------------------------------------ level-ups */

  rollChoices() {
    const cands = [];
    for (const w of this.weapons) {
      if (w.level < w.def.levels.length) cands.push({ kind: 'weapon', id: w.def.id, level: w.level + 1, weight: 1 });
    }
    if (this.weapons.length < SLOTS) {
      for (const def of WEAPONS) {
        if (!this.weapons.some(w => w.def === def)) cands.push({ kind: 'weapon', id: def.id, level: 1, weight: 0.9 });
      }
    }
    for (const pa of this.passives) {
      if (pa.level < pa.def.max) cands.push({ kind: 'passive', id: pa.def.id, level: pa.level + 1, weight: 0.8 });
    }
    if (this.passives.length < PASSIVE_SLOTS) {
      for (const def of PASSIVES) {
        if (!this.passives.some(pa => pa.def === def)) cands.push({ kind: 'passive', id: def.id, level: 1, weight: 0.7 });
      }
    }
    const out = [];
    while (out.length < 3 && cands.length) {
      const total = cands.reduce((k, c) => k + c.weight, 0);
      let r = this.rng.next() * total, i = 0;
      for (; i < cands.length - 1; i++) if ((r -= cands[i].weight) <= 0) break;
      out.push(cands.splice(i, 1)[0]);
    }
    if (!out.length) out.push({ kind: 'heal', level: 0 });
    return out;
  }

  choose(index) {
    const c = this.choices && this.choices[index];
    if (!c) return false;
    if (c.kind === 'weapon') this.addWeapon(c.id);
    else if (c.kind === 'passive') {
      this.addPassive(c.id);
      if (c.id === 'vigor') this.p.hp = Math.min(this.p.maxHp, this.p.hp + 20);
    } else if (c.kind === 'heal') this.p.hp = Math.min(this.p.maxHp, this.p.hp + 30);
    this.pendingLevels--;
    this.choices = this.pendingLevels > 0 ? this.rollChoices() : null;
    return true;
  }

  /* ------------------------------------------------------------ spawning */

  spawnEnemy(type, x, y) {
    const i = this.ePool.alloc();
    if (i < 0) return -1;
    const def = ENEMIES[type];
    const hp = def.hp * Director.hpScale(this.time);
    this.eType[i] = type;
    this.ex[i] = x;
    this.ey[i] = y;
    this.eHp[i] = hp;
    this.eMaxHp[i] = hp;
    this.eR[i] = def.r;
    this.eSpeed[i] = def.speed * (0.92 + this.rng.next() * 0.16);
    this.eDmg[i] = def.dmg;
    this.eMass[i] = def.mass;
    this.eXp[i] = def.xp;
    this.eFlash[i] = 0;
    this.eKx[i] = 0;
    this.eKy[i] = 0;
    this.eAtk[i] = 0;
    this.eMode[i] = 0;
    this.eT[i] = this.rng.next();
    this.eHitCd.fill(0, i * SLOTS, i * SLOTS + SLOTS);
    return i;
  }

  spawnShot(kind, x, y, vx, vy, life, dmg, r, pierce, slot, kb) {
    const i = this.sPool.alloc();
    if (i < 0) return -1;
    this.sKind[i] = kind;
    this.sx[i] = x;
    this.sy[i] = y;
    this.svx[i] = vx;
    this.svy[i] = vy;
    this.sLife[i] = life;
    this.sDmg[i] = dmg;
    this.sR[i] = r;
    this.sPierce[i] = pierce;
    this.sSlot[i] = slot;
    this.sKb[i] = kb;
    this.sHitN[i] = 0;
    this.events.push(EV.SHOT, x, y, slot);
    return i;
  }

  spawnGem(x, y, value) {
    let i = this.gPool.alloc();
    if (i < 0) {
      /* Out of gems: fold the value into one that already exists, so the
         XP is never lost - only its pickup moves. */
      i = this.rng.int(this.gPool.high);
      if (this.gAlive[i]) this.gValue[i] += value;
      return;
    }
    this.gx[i] = x + (this.rng.next() - 0.5) * 6;
    this.gy[i] = y + (this.rng.next() - 0.5) * 6;
    this.gValue[i] = value;
    this.gPull[i] = 0;
    this.gV[i] = 0;
  }

  /* ------------------------------------------------------------ queries */

  /** Nearest live enemy within maxR of a point, or -1. */
  nearestEnemy(x, y, maxR) {
    let best = -1, bd = maxR * maxR;
    const n = this.ePool.high, alive = this.eAlive, ex = this.ex, ey = this.ey;
    for (let i = 0; i < n; i++) {
      if (!alive[i]) continue;
      const dx = ex[i] - x, dy = ey[i] - y, d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  /**
   * Damage an enemy. `slot`/`every` gate repeat hits from area weapons: the
   * same weapon cannot hit the same enemy again until `every` seconds pass.
   * Returns false when gated.
   */
  hitEnemy(i, dmg, kx, ky, slot = -1, every = 0) {
    if (!this.eAlive[i]) return false;
    if (slot >= 0) {
      const k = i * SLOTS + slot;
      if (this.eHitCd[k] > 0) return false;
      this.eHitCd[k] = every;
    }
    this.eHp[i] -= dmg;
    this.eFlash[i] = 0.08;
    const m = this.eMass[i];
    this.eKx[i] += kx / m;
    this.eKy[i] += ky / m;
    this.events.push(EV.HIT, this.ex[i], this.ey[i], dmg, this.eType[i]);
    if (this.eHp[i] <= 0) this.killEnemy(i);
    return true;
  }

  killEnemy(i) {
    this.events.push(EV.KILL, this.ex[i], this.ey[i], this.eType[i], this.eR[i]);
    this.spawnGem(this.ex[i], this.ey[i], this.eXp[i]);
    this.p.kills++;
    this.ePool.release(i);
  }

  hurtPlayer(dmg, x, y) {
    const p = this.p;
    if (this.over || (this.invulnerable && dmg < 1000)) return;
    const d = dmg * (1 - this.stats.armor);
    p.hp -= d;
    p.damageTaken += d;
    p.hurt = 0.25;
    this.events.push(EV.HURT, x, y, d);
    if (p.hp <= 0) {
      p.hp = 0;
      this.over = true;
      this.events.push(EV.PLAYER_DEATH, p.x, p.y);
    }
  }

  /* ------------------------------------------------------------ step */

  get running() {
    return !this.over && !this.userPaused && !this.choices;
  }

  step(dt) {
    if (!this.running) return;
    this.time += dt;
    this.updatePlayer(dt);
    this.grid.build(this.p.x, this.p.y, this.ePool.high, this.eAlive, this.ex, this.ey);
    for (const w of this.weapons) w.def.update(this, w, dt);
    this.updateShots(dt);
    this.updateEnemies(dt);
    this.updateGems(dt);
    this.director.update(dt);
    this.checkLevel();
  }

  updatePlayer(dt) {
    const p = this.p, st = this.stats;
    let mx = this.move.x, my = this.move.y;
    const ml = Math.hypot(mx, my);
    if (ml > 1) {
      mx /= ml;
      my /= ml;
    }
    const sp = p.baseSpeed * st.speed;
    /* A short ease rather than instant velocity: responsive, but the ship
       has weight when it turns. */
    const k = Math.min(1, dt * 14);
    p.vx += (mx * sp - p.vx) * k;
    p.vy += (my * sp - p.vy) * k;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (ml > 0.1) p.face = Math.atan2(my, mx);
    if (st.regen > 0) p.hp = Math.min(p.maxHp, p.hp + st.regen * dt);
    if (p.hurt > 0) p.hurt -= dt;
  }

  updateShots(dt) {
    const n = this.sPool.high, out = this.scratch;
    for (let i = 0; i < n; i++) {
      if (!this.sAlive[i]) continue;
      this.sLife[i] -= dt;
      if (this.sLife[i] <= 0) {
        this.sPool.release(i);
        continue;
      }
      const x = (this.sx[i] += this.svx[i] * dt);
      const y = (this.sy[i] += this.svy[i] * dt);
      const r = this.sR[i];
      const c = this.grid.query(x, y, r + 30, out);
      for (let q = 0; q < c; q++) {
        const e = out[q];
        if (!this.eAlive[e]) continue;
        const dx = this.ex[e] - x, dy = this.ey[e] - y, rr = r + this.eR[e];
        if (dx * dx + dy * dy > rr * rr) continue;
        let seen = false;
        const base = i * SHOT_HITS, hn = this.sHitN[i];
        for (let h = 0; h < hn; h++) if (this.sHits[base + h] === e) seen = true;
        if (seen) continue;
        if (hn < SHOT_HITS) this.sHits[base + this.sHitN[i]++] = e;
        const vl = Math.hypot(this.svx[i], this.svy[i]) || 1, kb = this.sKb[i];
        this.hitEnemy(e, this.sDmg[i], (this.svx[i] / vl) * kb, (this.svy[i] / vl) * kb);
        if (--this.sPierce[i] < 0) {
          this.sPool.release(i);
          break;
        }
      }
    }
  }

  updateEnemies(dt) {
    const p = this.p, n = this.ePool.high, out = this.scratch2;
    const decay = Math.exp(-7 * dt);
    const far = this.viewRadius * 1.7;
    for (let i = 0; i < n; i++) {
      if (!this.eAlive[i]) continue;
      let x = this.ex[i], y = this.ey[i];
      let dx = p.x - x, dy = p.y - y;
      let d = Math.hypot(dx, dy) || 1e-3;

      /* Left far behind: bring it back in ahead of the player, so leaving
         a crowd behind does not leave the screen empty. */
      if (d > far) {
        const heading = Math.hypot(p.vx, p.vy) > 10 ? Math.atan2(p.vy, p.vx) : this.rng.next() * 6.283;
        const a = heading + (this.rng.next() - 0.5) * 1.6;
        x = this.ex[i] = p.x + Math.cos(a) * (this.viewRadius + 50);
        y = this.ey[i] = p.y + Math.sin(a) * (this.viewRadius + 50);
        dx = p.x - x;
        dy = p.y - y;
        d = Math.hypot(dx, dy) || 1e-3;
      }

      const def = ENEMIES[this.eType[i]];
      let vx = (dx / d) * this.eSpeed[i], vy = (dy / d) * this.eSpeed[i];

      if (def.dash) {
        const D = def.dash;
        this.eT[i] -= dt;
        const mode = this.eMode[i];
        if (mode === 0 && d < D.range && this.eT[i] <= 0) {
          this.eMode[i] = 1;
          this.eT[i] = D.windup;
          this.eDx[i] = dx / d;
          this.eDy[i] = dy / d;
        } else if (mode === 1) {
          vx = vy = 0;
          if (this.eT[i] <= 0) {
            this.eMode[i] = 2;
            this.eT[i] = D.time;
          }
        } else if (mode === 2) {
          vx = this.eDx[i] * D.speed;
          vy = this.eDy[i] * D.speed;
          if (this.eT[i] <= 0) {
            this.eMode[i] = 0;
            this.eT[i] = D.rest;
          }
        }
      }

      x += (vx + this.eKx[i]) * dt;
      y += (vy + this.eKy[i]) * dt;
      this.eKx[i] *= decay;
      this.eKy[i] *= decay;

      /* Separation: push overlapping neighbours apart, weighted by mass,
         so a swarm spreads into a crowd instead of stacking on one point.
         Capped at a dozen neighbours to bound the cost in a dense knot. */
      const r = this.eR[i];
      const c = this.grid.query(x, y, r + 28, out);
      let checked = 0;
      for (let q = 0; q < c && checked < 12; q++) {
        const j = out[q];
        if (j === i || !this.eAlive[j]) continue;
        checked++;
        const ox = this.ex[j] - x, oy = this.ey[j] - y, rr = r + this.eR[j];
        const d2 = ox * ox + oy * oy;
        if (d2 >= rr * rr || d2 < 1e-6) continue;
        const dd = Math.sqrt(d2), push = (rr - dd) * 0.5;
        const mi = this.eMass[i], mj = this.eMass[j], share = mj / (mi + mj);
        x -= (ox / dd) * push * share;
        y -= (oy / dd) * push * share;
        this.ex[j] += (ox / dd) * push * (1 - share);
        this.ey[j] += (oy / dd) * push * (1 - share);
      }
      this.ex[i] = x;
      this.ey[i] = y;

      if (this.eFlash[i] > 0) this.eFlash[i] -= dt;
      const hc = i * SLOTS;
      for (let s = 0; s < SLOTS; s++) if (this.eHitCd[hc + s] > 0) this.eHitCd[hc + s] -= dt;

      this.eAtk[i] -= dt;
      const cx = p.x - x, cy = p.y - y, cr = r + p.r;
      if (this.eAtk[i] <= 0 && cx * cx + cy * cy < cr * cr) {
        this.eAtk[i] = 0.6;
        this.hurtPlayer(this.eDmg[i], x, y);
      }
    }
  }

  updateGems(dt) {
    const p = this.p, n = this.gPool.high;
    const R = 72 * this.stats.magnet, R2 = R * R;
    const grab = p.r + 8;
    for (let i = 0; i < n; i++) {
      if (!this.gAlive[i]) continue;
      const dx = p.x - this.gx[i], dy = p.y - this.gy[i], d2 = dx * dx + dy * dy;
      if (!this.gPull[i] && d2 < R2) this.gPull[i] = 1;
      if (!this.gPull[i]) continue;
      const d = Math.sqrt(d2) || 1e-3;
      if (d < grab) {
        p.xp += this.gValue[i] * this.stats.growth;
        this.events.push(EV.PICKUP, this.gx[i], this.gy[i], this.gValue[i]);
        this.gPool.release(i);
        continue;
      }
      /* Accelerate in: a gem caught by the field visibly snaps to you. */
      this.gV[i] = Math.min(this.gV[i] + 1500 * dt, 1000);
      const step = Math.min(d, this.gV[i] * dt);
      this.gx[i] += (dx / d) * step;
      this.gy[i] += (dy / d) * step;
    }
  }

  checkLevel() {
    const p = this.p;
    while (p.xp >= p.xpNext) {
      p.xp -= p.xpNext;
      p.level++;
      p.xpNext = xpFor(p.level);
      this.pendingLevels++;
      this.events.push(EV.LEVELUP, p.x, p.y, p.level);
    }
    if (this.pendingLevels > 0 && !this.choices && !this.holdChoices) this.choices = this.rollChoices();
  }
}
