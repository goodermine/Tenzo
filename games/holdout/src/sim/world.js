/* HOLDOUT - the simulation.
   Everything that decides what happens lives here and in src/content/, with
   no rendering, DOM or timing of its own: the browser calls step() each
   frame, and tools/bot.mjs calls the very same step() in Node to play whole
   runs headless. The renderer only reads these arrays.

   Enemies, shots, enemy bullets, gems and items are structures of typed
   arrays with free lists, sized once. A run allocates nothing per frame,
   which is what keeps a phone from hitching on garbage collection with five
   hundred enemies on screen. */
import { makeRng } from './rng.js';
import { Grid } from './grid.js';
import { Events, EV } from './events.js';
import { Director } from './director.js';
import { ENEMIES } from '../content/enemies.js';
import { WEAPONS, WEAPON_INDEX, EVOLUTIONS, BEH, PIERCE_ALL } from '../content/weapons.js';
import { PASSIVES, PASSIVE_INDEX } from '../content/passives.js';
import { CHARACTERS, CHARACTER_INDEX } from '../content/characters.js';
import { applyUpgrades } from '../content/meta.js';
import { difficulty } from '../content/difficulty.js';

export const MAX_E = 1024;
export const MAX_S = 1024;
export const MAX_B = 400;
export const MAX_G = 1200;
export const MAX_I = 24;
export const SLOTS = 6;            /* weapons carried at once */
export const PASSIVE_SLOTS = 6;
const SHOT_HITS = 4;               /* enemies a piercing shot remembers */
export const ITEM = { HEAL: 0, VACUUM: 1, CACHE: 2 };

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
    this.retire(i);
    this.recycle(i);
  }
  /* Two halves of release(), for when something must happen in between:
     the slot is dead (nothing can hit it again) but not yet reusable. */
  retire(i) {
    this.alive[i] = 0;
    this.count--;
  }
  recycle(i) {
    this.free[this.top++] = i;
  }
}

export class Sim {
  /**
   * @param seed      the run's random seed
   * @param character ship id (src/content/characters.js)
   * @param upgrades  permanent upgrade levels bought in the shop
   * @param locked    weapon ids not yet unlocked, never offered
   * @param difficulty 'easy' or 'normal' (src/content/difficulty.js)
   */
  constructor({ seed = 1, character = 'vanguard', upgrades = {}, locked = [], difficulty: diff = 'normal' } = {}) {
    this.diff = difficulty(diff);
    this.seed = seed;
    this.rng = makeRng(seed);
    this.char = CHARACTERS[CHARACTER_INDEX[character] ?? 0];
    this.upgrades = upgrades;
    this.locked = new Set(locked);
    this.rerolls = upgrades.reroll || 0;
    this.bossesKilled = [];
    this.bossTimes = [];
    this.evolvedCount = 0;
    this.events = new Events(4096);
    this.time = 0;
    this.userPaused = false;
    this.over = false;
    this.won = false;
    /* Test hook: the verifier fills the screen with enemies for a
       screenshot and needs the ship to survive the photo. */
    this.invulnerable = false;
    /* Half the screen diagonal in world units, set by the view; spawns
       happen just outside it. The bot uses this default. */
    this.viewRadius = 700;
    this.move = { x: 0, y: 0 };
    /* enemy AI writes the velocity it wants here */
    this.avx = 0;
    this.avy = 0;
    this.boss = -1;

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
    this.eShield = new Float32Array(MAX_E);
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

    /* player shots */
    this.sPool = new Pool(MAX_S);
    this.sAlive = this.sPool.alive;
    this.sKind = new Uint8Array(MAX_S);
    this.sBeh = new Uint8Array(MAX_S);
    this.sx = new Float32Array(MAX_S);
    this.sy = new Float32Array(MAX_S);
    this.svx = new Float32Array(MAX_S);
    this.svy = new Float32Array(MAX_S);
    this.sLife = new Float32Array(MAX_S);
    this.sAge = new Float32Array(MAX_S);
    this.sDmg = new Float32Array(MAX_S);
    this.sR = new Float32Array(MAX_S);
    this.sKb = new Float32Array(MAX_S);
    this.sAux = new Float32Array(MAX_S);
    this.sTurn = new Float32Array(MAX_S);
    this.sSpeed = new Float32Array(MAX_S);
    this.sTarget = new Int32Array(MAX_S);
    this.sPierce = new Int16Array(MAX_S);
    this.sSlot = new Uint8Array(MAX_S);
    this.sHits = new Int32Array(MAX_S * SHOT_HITS);
    this.sHitN = new Uint8Array(MAX_S);

    /* enemy bullets */
    this.bPool = new Pool(MAX_B);
    this.bAlive = this.bPool.alive;
    this.bx = new Float32Array(MAX_B);
    this.by = new Float32Array(MAX_B);
    this.bvx = new Float32Array(MAX_B);
    this.bvy = new Float32Array(MAX_B);
    this.bLife = new Float32Array(MAX_B);
    this.bDmg = new Float32Array(MAX_B);
    this.bR = new Float32Array(MAX_B);

    /* gems */
    this.gPool = new Pool(MAX_G);
    this.gAlive = this.gPool.alive;
    this.gx = new Float32Array(MAX_G);
    this.gy = new Float32Array(MAX_G);
    this.gValue = new Float32Array(MAX_G);
    this.gPull = new Uint8Array(MAX_G);
    this.gV = new Float32Array(MAX_G);

    /* items: heal, vacuum, cache */
    this.iPool = new Pool(MAX_I);
    this.iAlive = this.iPool.alive;
    this.iKind = new Uint8Array(MAX_I);
    this.ix = new Float32Array(MAX_I);
    this.iy = new Float32Array(MAX_I);

    this.grid = new Grid(48, 96, MAX_E);
    this.scratch = new Int32Array(MAX_E);
    this.scratch2 = new Int32Array(MAX_E);
    this.scratch3 = new Int32Array(MAX_E);
    /* Explosions can chain (a bomber's blast kills a bomber), so each level
       of nesting gets its own candidate buffer. */
    this.blastBufs = [0, 1, 2, 3].map(() => new Int32Array(MAX_E));
    this.blastDepth = 0;

    this.weapons = [];
    this.passives = [];
    this.stats = null;
    this.recomputeStats();
    this.director = new Director(this);

    this.choices = null;
    this.pendingLevels = 0;
    /* how many of the pending choices came from caches, not levels, and
       whether the choice on screen is one of them */
    this.pendingCache = 0;
    this.choiceFromCache = false;
    /* The browser holds the cards back for a slow-motion beat after a
       level-up; while this is set the level is banked but not offered. */
    this.holdChoices = false;
    this.p.hp = this.p.maxHp;
    this.addWeapon(this.char.weapon);
  }

  /** What the run achieved, for credits and unlocks. */
  summary() {
    return {
      seconds: Math.floor(this.time),
      kills: this.p.kills,
      level: this.p.level,
      won: this.won,
      difficulty: this.diff.id,
      bosses: this.bossesKilled.slice(),
      evolved: this.evolvedCount,
      character: this.char.id
    };
  }

  /** Which arena the run is in: 0 to 5:00, 1 to 9:30, 2 after - the void
      falls half a minute before The Hive arrives in it. */
  get zone() {
    return this.time < 300 ? 0 : this.time < 570 ? 1 : 2;
  }

  get eHigh() { return this.ePool.high; }
  get eCount() { return this.ePool.count; }
  eDef(i) { return ENEMIES[this.eType[i]]; }

  /* ------------------------------------------------------------ build */

  recomputeStats() {
    const c = this.char;
    const s = {
      damage: c.damage, cooldown: c.cooldown, area: 1, speed: c.speed, magnet: 1,
      amount: 0, armor: c.armor, regen: 0, maxHp: c.hp, growth: 1
    };
    applyUpgrades(s, this.upgrades);
    for (const pa of this.passives) pa.def.apply(s, pa.level);
    s.armor = Math.min(0.6, s.armor);
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

  /** Swap a maxed weapon for its evolved form, keeping its slot. */
  evolve(fromId, toId) {
    const w = this.weapons.find(x => x.def.id === fromId);
    if (!w) return;
    const def = WEAPONS[WEAPON_INDEX[toId]];
    w.def = def;
    w.level = 1;
    w.stats = def.levels[0];
    def.init(w);
    this.evolvedCount++;
    this.events.push(EV.EVOLVE, this.p.x, this.p.y, w.slot);
  }

  /* ------------------------------------------------------------ level-ups */

  availableEvolutions() {
    const out = [];
    for (const e of EVOLUTIONS) {
      const w = this.weapons.find(x => x.def.id === e.from);
      if (!w || w.level < w.def.levels.length) continue;
      if (!this.passives.some(pa => pa.def.id === e.with)) continue;
      out.push({ kind: 'evolve', id: e.to, from: e.from, level: 1 });
    }
    return out;
  }

  rollChoices() {
    const out = [];
    /* An available evolution is always offered: it is the payoff for
       building towards it, and should never be left to a dice roll. */
    const evo = this.availableEvolutions();
    if (evo.length) out.push(evo[this.rng.int(evo.length)]);

    const cands = [];
    for (const w of this.weapons) {
      if (w.level < w.def.levels.length) cands.push({ kind: 'weapon', id: w.def.id, level: w.level + 1, weight: 1 });
    }
    if (this.weapons.length < SLOTS) {
      for (const def of WEAPONS) {
        if (def.evolved || this.locked.has(def.id) || this.weapons.some(w => w.def === def)) continue;
        /* nor the base of a weapon already evolved */
        if (EVOLUTIONS.some(e => e.from === def.id && this.weapons.some(w => w.def.id === e.to))) continue;
        cands.push({ kind: 'weapon', id: def.id, level: 1, weight: 0.85 });
      }
    }
    for (const pa of this.passives) {
      if (pa.level < pa.def.max) cands.push({ kind: 'passive', id: pa.def.id, level: pa.level + 1, weight: 0.8 });
    }
    if (this.passives.length < PASSIVE_SLOTS) {
      for (const def of PASSIVES) {
        if (this.passives.some(pa => pa.def === def)) continue;
        cands.push({ kind: 'passive', id: def.id, level: 1, weight: def.id === 'amount' ? 0.3 : 0.65 });
      }
    }
    while (out.length < 3 && cands.length) {
      const total = cands.reduce((k, c) => k + c.weight, 0);
      let r = this.rng.next() * total, i = 0;
      for (; i < cands.length - 1; i++) if ((r -= cands[i].weight) <= 0) break;
      out.push(cands.splice(i, 1)[0]);
    }
    if (!out.length) out.push({ kind: 'heal', level: 0 });
    return out;
  }

  /** Spend a reroll on a fresh set of cards. */
  reroll() {
    if (!this.choices || this.rerolls <= 0) return false;
    this.rerolls--;
    this.choices = this.rollChoices();
    return true;
  }

  choose(index) {
    const c = this.choices && this.choices[index];
    if (!c) return false;
    if (c.kind === 'weapon') this.addWeapon(c.id);
    else if (c.kind === 'evolve') this.evolve(c.from, c.id);
    else if (c.kind === 'passive') {
      this.addPassive(c.id);
      if (c.id === 'vigor') this.p.hp = Math.min(this.p.maxHp, this.p.hp + 20);
    } else if (c.kind === 'heal') this.p.hp = Math.min(this.p.maxHp, this.p.hp + 30);
    this.pendingLevels--;
    if (this.choiceFromCache) this.pendingCache--;
    this.choices = this.pendingLevels > 0 ? this.offer() : null;
    return true;
  }

  /* ------------------------------------------------------------ spawning */

  spawnEnemy(type, x, y) {
    const i = this.ePool.alloc();
    if (i < 0) return -1;
    const def = ENEMIES[type];
    const D = this.diff;
    const hp = def.fixedHp ? def.hp * D.bossHp : def.hp * Director.hpScale(this.time) * D.enemyHp;
    this.eType[i] = type;
    this.ex[i] = x;
    this.ey[i] = y;
    this.eHp[i] = hp;
    this.eMaxHp[i] = hp;
    this.eShield[i] = def.shield ? hp * def.shield : 0;
    this.eR[i] = def.r;
    this.eSpeed[i] = def.speed * (def.boss ? 1 : 0.92 + this.rng.next() * 0.16);
    this.eDmg[i] = def.dmg * D.enemyDmg;
    this.eMass[i] = def.mass;
    this.eXp[i] = def.xp;
    this.eFlash[i] = 0;
    this.eKx[i] = 0;
    this.eKy[i] = 0;
    this.eAtk[i] = 0;
    this.eMode[i] = 0;
    this.eT[i] = def.boss ? 3.5 : this.rng.next() * (def.blink ? def.blink.cd : 1);
    this.eDx[i] = def.boss ? 3 : 0;
    this.eDy[i] = def.boss ? 2 : 0;
    this.eHitCd.fill(0, i * SLOTS, i * SLOTS + SLOTS);
    if (def.boss) {
      this.boss = i;
      this.events.push(EV.BOSS, x, y, type);
    }
    /* only worth announcing where it can be seen: most spawns are off
       screen, and there can be hundreds a minute */
    const dx = x - this.p.x, dy = y - this.p.y, vr = this.viewRadius * 0.9;
    if (dx * dx + dy * dy < vr * vr) this.events.push(EV.SPAWN, x, y, i, type);
    return i;
  }

  spawnShot(kind, beh, x, y, vx, vy, life, dmg, r, pierce, slot, kb, aux = 0) {
    const i = this.sPool.alloc();
    if (i < 0) return -1;
    this.sKind[i] = kind;
    this.sBeh[i] = beh;
    this.sx[i] = x;
    this.sy[i] = y;
    this.svx[i] = vx;
    this.svy[i] = vy;
    this.sLife[i] = life;
    this.sAge[i] = 0;
    this.sDmg[i] = dmg;
    this.sR[i] = r;
    this.sPierce[i] = pierce;
    this.sSlot[i] = slot;
    this.sKb[i] = kb;
    this.sAux[i] = aux;
    this.sTarget[i] = -1;
    this.sHitN[i] = 0;
    if (beh !== BEH.FLAME) this.events.push(EV.SHOT, x, y, slot);
    return i;
  }

  spawnBullet(x, y, vx, vy, dmg, r) {
    const i = this.bPool.alloc();
    if (i < 0) return -1;
    const D = this.diff;
    vx *= D.bulletSpeed;
    vy *= D.bulletSpeed;
    dmg *= D.enemyDmg;
    this.bx[i] = x;
    this.by[i] = y;
    this.bvx[i] = vx;
    this.bvy[i] = vy;
    this.bLife[i] = 5;
    this.bDmg[i] = dmg;
    this.bR[i] = r;
    this.events.push(EV.BULLET, x, y);
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

  dropItem(kind, x, y) {
    const i = this.iPool.alloc();
    if (i < 0) return -1;
    this.iKind[i] = kind;
    this.ix[i] = x;
    this.iy[i] = y;
    return i;
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

  /** Nearest within maxR that is not among the first n entries of `skip`. */
  nearestEnemyExcept(x, y, maxR, skip, n) {
    const out = this.scratch3, c = this.grid.query(x, y, maxR, out);
    let best = -1, bd = maxR * maxR;
    for (let q = 0; q < c; q++) {
      const e = out[q];
      if (!this.eAlive[e]) continue;
      let seen = false;
      for (let k = 0; k < n; k++) if (skip[k] === e) { seen = true; break; }
      if (seen) continue;
      const dx = this.ex[e] - x, dy = this.ey[e] - y, d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  randomEnemyNear(x, y, r) {
    const out = this.scratch3, c = this.grid.query(x, y, r, out);
    const r2 = r * r;
    let pick = -1, seen = 0;
    for (let q = 0; q < c; q++) {
      const e = out[q];
      if (!this.eAlive[e]) continue;
      const dx = this.ex[e] - x, dy = this.ey[e] - y;
      if (dx * dx + dy * dy > r2) continue;
      /* reservoir sampling: uniform over the candidates in one pass */
      if (this.rng.int(++seen) === 0) pick = e;
    }
    return pick;
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
    let m = this.eMass[i];
    if (this.eShield[i] > 0) {
      /* the shield takes it first, and mostly ignores being shoved */
      this.eShield[i] = Math.max(0, this.eShield[i] - dmg);
      m *= 5;
    }
    this.eHp[i] -= dmg;
    this.eFlash[i] = 0.08;
    this.eKx[i] += kx / m;
    this.eKy[i] += ky / m;
    this.events.push(EV.HIT, this.ex[i], this.ey[i], dmg, i);
    if (this.eHp[i] <= 0) this.killEnemy(i);
    return true;
  }

  /** Hit every enemy within a radius once; optionally the player too. */
  explode(x, y, r, dmg, kb, playerDmg = 0) {
    this.events.push(EV.EXPLODE, x, y, r);
    if (this.blastDepth >= this.blastBufs.length) return;
    const out = this.blastBufs[this.blastDepth++];
    const c = this.grid.query(x, y, r + 30, out);
    for (let q = 0; q < c; q++) {
      const e = out[q];
      if (!this.eAlive[e]) continue;
      const dx = this.ex[e] - x, dy = this.ey[e] - y, d = Math.hypot(dx, dy);
      if (d > r + this.eR[e]) continue;
      const n = d || 1;
      this.hitEnemy(e, dmg, (dx / n) * kb, (dy / n) * kb);
    }
    this.blastDepth--;
    if (playerDmg > 0) {
      const p = this.p, d = Math.hypot(p.x - x, p.y - y);
      if (d < r + p.r) this.hurtPlayer(playerDmg, x, y);
    }
  }

  /** Damage along a beam from (x, y) in unit direction (ux, uy). */
  hitAlongBeam(x, y, ux, uy, len, width, dmg, slot, every) {
    const out = this.scratch3;
    const step = 60;
    for (let t = step / 2; t < len + step / 2; t += step) {
      const px = x + ux * t, py = y + uy * t;
      const c = this.grid.query(px, py, step / 2 + width + 30, out);
      for (let q = 0; q < c; q++) {
        const e = out[q];
        if (!this.eAlive[e]) continue;
        const ex = this.ex[e] - x, ey = this.ey[e] - y;
        const along = ex * ux + ey * uy;
        if (along < 0 || along > len) continue;
        const perp = Math.abs(ex * uy - ey * ux);
        if (perp > width + this.eR[e]) continue;
        this.hitEnemy(e, dmg, ux * 120, uy * 120, slot, every);
      }
    }
  }

  killEnemy(i) {
    const def = ENEMIES[this.eType[i]];
    const x = this.ex[i], y = this.ey[i];
    this.events.push(EV.KILL, x, y, this.eType[i], this.eR[i]);
    if (this.eXp[i] > 0) this.spawnGem(x, y, this.eXp[i]);
    /* rare drops: repair, and the gem vacuum (only one on the field) */
    const roll = this.rng.next();
    if (roll < 0.005) this.dropItem(ITEM.HEAL, x, y);
    else if (roll < 0.0075 && !this.itemOut(ITEM.VACUUM)) this.dropItem(ITEM.VACUUM, x, y);
    this.p.kills++;
    if (def.boss) {
      this.bossesKilled.push(def.id);
      this.bossTimes.push(Math.round(this.time));
    }
    if (this.boss === i) this.boss = -1;
    /* Dead before onDeath runs, so a blast it sets off cannot hit it
       again; but its slot is not reusable until after, so enemies spawned
       by onDeath (a splitter's young) cannot overwrite what it reads. */
    this.ePool.retire(i);
    if (def.onDeath) def.onDeath(this, i);
    this.ePool.recycle(i);
    if (this.won) this.over = true;
  }

  /** Remove without a kill: no XP, no drops (a bomber that went off). */
  removeEnemy(i) {
    this.ePool.release(i);
    if (this.boss === i) this.boss = -1;
  }

  itemOut(kind) {
    for (let i = 0; i < this.iPool.high; i++) if (this.iAlive[i] && this.iKind[i] === kind) return true;
    return false;
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
    this.updateBullets(dt);
    this.updateGems(dt);
    this.updateItems();
    this.director.update(dt);
    this.checkLevel();
    const z = this.zone;
    if (z !== this.lastZone) {
      if (this.lastZone !== undefined) this.events.push(EV.ZONE, this.p.x, this.p.y, z);
      this.lastZone = z;
    }
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

  /* Behaviour before the collision test: steering, returning, arming.
     Returns false when the shot is finished. */
  moveShot(i, dt) {
    const beh = this.sBeh[i], p = this.p;
    this.sAge[i] += dt;
    if (beh === BEH.GLAIVE) {
      /* flies out, slows, and comes home - it can hit on the way back */
      if (this.sAge[i] > this.sAux[i]) {
        const dx = p.x - this.sx[i], dy = p.y - this.sy[i], d = Math.hypot(dx, dy) || 1;
        if (d < 22) return false;
        const sp = Math.min(700, Math.hypot(this.svx[i], this.svy[i]) + 900 * dt);
        const f = Math.min(1, dt * 7);
        this.svx[i] += ((dx / d) * sp - this.svx[i]) * f;
        this.svy[i] += ((dy / d) * sp - this.svy[i]) * f;
      } else {
        const f = Math.exp(-2.2 * dt);
        this.svx[i] *= f;
        this.svy[i] *= f;
      }
    } else if (beh === BEH.MISSILE) {
      /* re-target four times a second */
      let t = this.sTarget[i];
      const tick = ((this.sAge[i] * 4) | 0) !== (((this.sAge[i] - dt) * 4) | 0);
      if (t < 0 || !this.eAlive[t] || tick) t = this.sTarget[i] = this.nearestEnemy(this.sx[i], this.sy[i], 600);
      const sp = this.sSpeed[i];
      if (t >= 0) {
        const want = Math.atan2(this.ey[t] - this.sy[i], this.ex[t] - this.sx[i]);
        const cur = Math.atan2(this.svy[i], this.svx[i]);
        let da = want - cur;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        const a = cur + Math.max(-1, Math.min(1, da)) * this.sTurn[i] * dt;
        const v = Math.min(sp, Math.hypot(this.svx[i], this.svy[i]) + sp * 2 * dt);
        this.svx[i] = Math.cos(a) * v;
        this.svy[i] = Math.sin(a) * v;
      }
    } else if (beh === BEH.MINE) {
      /* armed after a beat; then any enemy close enough sets it off */
      if (this.sAge[i] > 0.4 && this.nearestEnemy(this.sx[i], this.sy[i], 46) >= 0) {
        this.explode(this.sx[i], this.sy[i], this.sAux[i], this.sDmg[i], 260);
        return false;
      }
      return true;
    } else if (beh === BEH.FLAME) {
      const f = Math.exp(-2.5 * dt);
      this.svx[i] *= f;
      this.svy[i] *= f;
      this.sR[i] += 26 * dt;
    }
    this.sx[i] += this.svx[i] * dt;
    this.sy[i] += this.svy[i] * dt;
    return true;
  }

  updateShots(dt) {
    const n = this.sPool.high, out = this.scratch;
    for (let i = 0; i < n; i++) {
      if (!this.sAlive[i]) continue;
      this.sLife[i] -= dt;
      if (this.sLife[i] <= 0) {
        /* a missile that runs out of fuel still goes off */
        if (this.sBeh[i] === BEH.MISSILE) this.explode(this.sx[i], this.sy[i], this.sAux[i], this.sDmg[i], 200);
        this.sPool.release(i);
        continue;
      }
      if (!this.moveShot(i, dt)) {
        this.sPool.release(i);
        continue;
      }
      const beh = this.sBeh[i];
      if (beh === BEH.MINE) continue;
      const x = this.sx[i], y = this.sy[i], r = this.sR[i];
      const c = this.grid.query(x, y, r + 30, out);
      for (let q = 0; q < c; q++) {
        const e = out[q];
        if (!this.eAlive[e]) continue;
        const dx = this.ex[e] - x, dy = this.ey[e] - y, rr = r + this.eR[e];
        if (dx * dx + dy * dy > rr * rr) continue;

        if (beh === BEH.MISSILE) {
          this.sPool.release(i);
          this.explode(x, y, this.sAux[i], this.sDmg[i], 200);
          break;
        }
        const vl = Math.hypot(this.svx[i], this.svy[i]) || 1, kb = this.sKb[i];
        const kx = (this.svx[i] / vl) * kb, ky = (this.svy[i] / vl) * kb;
        if (this.sPierce[i] >= PIERCE_ALL) {
          /* everlasting shots (glaive, flame) gate by time per enemy */
          this.hitEnemy(e, this.sDmg[i], kx, ky, this.sSlot[i], beh === BEH.FLAME ? this.sAux[i] : 0.35);
          continue;
        }
        let seen = false;
        const base = i * SHOT_HITS, hn = this.sHitN[i];
        for (let h = 0; h < hn; h++) if (this.sHits[base + h] === e) seen = true;
        if (seen) continue;
        if (hn < SHOT_HITS) this.sHits[base + this.sHitN[i]++] = e;
        else this.sHits[base + ((this.sAge[i] * 1000) | 0) % SHOT_HITS] = e;
        this.hitEnemy(e, this.sDmg[i], kx, ky);
        if (--this.sPierce[i] < 0) {
          this.sPool.release(i);
          break;
        }
        if (beh === BEH.RICOCHET) {
          /* bounce on to the nearest enemy it has not just hit */
          const next = this.nearestEnemyExcept(x, y, 320, this.sHits.subarray(base, base + SHOT_HITS), this.sHitN[i]);
          if (next >= 0) {
            const a = Math.atan2(this.ey[next] - y, this.ex[next] - x);
            this.svx[i] = Math.cos(a) * vl;
            this.svy[i] = Math.sin(a) * vl;
            this.sLife[i] = Math.max(this.sLife[i], 0.8);
          }
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
      const def = ENEMIES[this.eType[i]];
      let x = this.ex[i], y = this.ey[i];
      let dx = p.x - x, dy = p.y - y;
      let d = Math.hypot(dx, dy) || 1e-3;

      /* Left far behind: bring it back in ahead of the player, so leaving
         a crowd behind does not leave the screen empty. Bosses follow. */
      if (d > far) {
        const heading = Math.hypot(p.vx, p.vy) > 10 ? Math.atan2(p.vy, p.vx) : this.rng.next() * 6.283;
        const a = heading + (this.rng.next() - 0.5) * 1.6;
        x = this.ex[i] = p.x + Math.cos(a) * (this.viewRadius + 50);
        y = this.ey[i] = p.y + Math.sin(a) * (this.viewRadius + 50);
        dx = p.x - x;
        dy = p.y - y;
        d = Math.hypot(dx, dy) || 1e-3;
      }

      const nx = dx / d, ny = dy / d;
      this.avx = nx * this.eSpeed[i];
      this.avy = ny * this.eSpeed[i];
      if (def.ai) {
        def.ai(this, i, dt, nx, ny, d);
        if (!this.eAlive[i]) continue;
        x = this.ex[i];
        y = this.ey[i];
      }

      x += (this.avx + this.eKx[i]) * dt;
      y += (this.avy + this.eKy[i]) * dt;
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
      if (this.eDmg[i] > 0 && this.eAtk[i] <= 0 && cx * cx + cy * cy < cr * cr) {
        this.eAtk[i] = 0.6;
        this.hurtPlayer(this.eDmg[i], x, y);
      }
    }
  }

  updateBullets(dt) {
    const p = this.p, n = this.bPool.high;
    for (let i = 0; i < n; i++) {
      if (!this.bAlive[i]) continue;
      this.bLife[i] -= dt;
      if (this.bLife[i] <= 0) {
        this.bPool.release(i);
        continue;
      }
      const x = (this.bx[i] += this.bvx[i] * dt);
      const y = (this.by[i] += this.bvy[i] * dt);
      /* a forgiving hitbox: grazing a bullet should feel like a dodge */
      const dx = p.x - x, dy = p.y - y, rr = p.r * 0.6 + this.bR[i] * 0.8;
      if (dx * dx + dy * dy < rr * rr) {
        this.hurtPlayer(this.bDmg[i], x, y);
        this.bPool.release(i);
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
        p.xp += this.gValue[i] * this.stats.growth * this.diff.xp;
        this.events.push(EV.PICKUP, this.gx[i], this.gy[i], this.gValue[i]);
        this.gPool.release(i);
        continue;
      }
      /* Accelerate in: a gem caught by the field visibly snaps to you. */
      this.gV[i] = Math.min(this.gV[i] + 1500 * dt, this.gPull[i] === 2 ? 1500 : 1000);
      const step = Math.min(d, this.gV[i] * dt);
      this.gx[i] += (dx / d) * step;
      this.gy[i] += (dy / d) * step;
    }
  }

  updateItems() {
    const p = this.p, n = this.iPool.high;
    for (let i = 0; i < n; i++) {
      if (!this.iAlive[i]) continue;
      const dx = p.x - this.ix[i], dy = p.y - this.iy[i], rr = p.r + 20;
      if (dx * dx + dy * dy > rr * rr) continue;
      const kind = this.iKind[i];
      this.events.push(EV.ITEM, this.ix[i], this.iy[i], kind);
      this.iPool.release(i);
      if (kind === ITEM.HEAL) p.hp = Math.min(p.maxHp, p.hp + 30);
      else if (kind === ITEM.VACUUM) {
        /* every gem on the field comes flying in */
        for (let g = 0; g < this.gPool.high; g++) if (this.gAlive[g]) this.gPull[g] = 2;
      } else if (kind === ITEM.CACHE) {
        this.pendingLevels++;
        this.pendingCache++;
      }
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
    if (this.pendingLevels > 0 && !this.choices && !this.holdChoices) this.choices = this.offer();
  }

  offer() {
    this.choiceFromCache = this.pendingCache > 0;
    return this.rollChoices();
  }
}
