/* HOLDOUT - draws the simulation.
   Reads src/sim/world.js's arrays every frame and writes them into a few
   ParticleContainers - one batched draw each for pickups, shots, enemies,
   weapon effects and particles, whatever the count - all from one atlas, all
   additive, so a dense swarm glows brighter where it bunches. Nothing here
   decides anything; the view could be swapped out and the game would play
   the same. */
import { Container, ParticleContainer, Particle, TilingSprite, Sprite, Graphics, RenderTexture, BlurFilter } from 'pixi.js';
import { buildGround, COLORS, DIGIT_ADVANCE } from './atlas.js';
import { EV } from '../sim/events.js';
import { ENEMIES } from '../content/enemies.js';
import { SHOT } from '../content/weapons.js';

const hex = s => parseInt(s.slice(1), 16);
const ENEMY_TINT = ENEMIES.map(e => hex(COLORS[e.id]));
const TAU = Math.PI * 2;

/* A pooled ParticleContainer: begin(), add() what is visible, end(). */
class Layer {
  constructor(atlas, cap) {
    this.container = new ParticleContainer({
      texture: atlas.base,
      dynamicProperties: { position: true, rotation: true, vertex: true, color: true, uvs: true },
      roundPixels: false
    });
    this.container.blendMode = 'add';
    this.pool = [];
    for (let i = 0; i < cap; i++) {
      this.pool.push(new Particle({ texture: atlas.tex.dot, anchorX: 0.5, anchorY: 0.5 }));
    }
    this.list = this.container.particleChildren;
    this.n = 0;
  }
  begin() {
    this.n = 0;
  }
  add(tex, x, y, sx, sy, rot = 0, tint = 0xffffff, alpha = 1) {
    if (this.n >= this.pool.length) return;
    const p = this.pool[this.n];
    p.texture = tex;
    p.x = x;
    p.y = y;
    p.scaleX = sx;
    p.scaleY = sy;
    p.rotation = rot;
    p.tint = tint;
    p.alpha = alpha;
    this.list[this.n++] = p;
  }
  end() {
    this.list.length = this.n;
  }
}

/* Short-lived effect particles, owned by the view. */
const FX_CAP = 1800;
const FX = { SPARK: 0, DOT: 1, RING: 2, TELL: 3 };
/* Damage numbers alive at once, and new ones allowed per frame: a nova that
   hits sixty enemies shows a dozen numbers, not sixty. */
const NUM_CAP = 90;
const NUM_PER_FRAME = 10;
/* Lightning arcs on screen at once. */
const ARC_CAP = 96;

export class View {
  constructor(app, atlas) {
    this.app = app;
    this.atlas = atlas;
    this.R = atlas.R;

    this.ground = new TilingSprite({ texture: buildGround(), width: 10, height: 10 });
    this.world = new Container();
    this.pickups = new Layer(atlas, 1300);
    this.shots = new Layer(atlas, 1500);
    this.enemies = new Layer(atlas, 1300);
    this.weaponsFx = new Layer(atlas, 600);
    this.fx = new Layer(atlas, FX_CAP);
    this.nums = new Layer(atlas, NUM_CAP * 4);
    this.nums.container.blendMode = 'normal';

    this.player = new Sprite(atlas.tex.player);
    this.player.anchor.set(0.5);
    this.player.blendMode = 'add';
    this.engine = new Sprite(atlas.tex.dot);
    this.engine.anchor.set(0.5);
    this.engine.blendMode = 'add';
    this.engine.tint = hex(COLORS.player);
    this.hpBar = new Graphics();

    this.world.addChild(
      this.pickups.container, this.weaponsFx.container, this.enemies.container, this.shots.container,
      this.engine, this.player, this.fx.container, this.hpBar
    );
    /* Numbers sit outside the bloom so they stay crisp. */
    this.numLayer = new Container();
    this.numLayer.addChild(this.nums.container);
    app.stage.addChild(this.ground, this.world);

    /* Bloom without a post-processing chain: the world is drawn a second
       time into a quarter-resolution texture, blurred there (cheap at that
       size) and added back over the scene. Off on slow devices. */
    this.bloomOn = false;
    this.bloomRt = null;
    this.bloom = new Sprite();
    this.bloom.blendMode = 'add';
    this.bloom.alpha = 0.6;
    const blur = new BlurFilter({ strength: 3, quality: 2 });
    blur.resolution = 0.25;
    this.bloom.filters = [blur];
    this.bloom.visible = false;
    app.stage.addChild(this.bloom, this.numLayer);

    this.fxX = new Float32Array(FX_CAP);
    this.fxY = new Float32Array(FX_CAP);
    this.fxVx = new Float32Array(FX_CAP);
    this.fxVy = new Float32Array(FX_CAP);
    this.fxLife = new Float32Array(FX_CAP);
    this.fxMax = new Float32Array(FX_CAP);
    this.fxSize = new Float32Array(FX_CAP);
    this.fxTint = new Uint32Array(FX_CAP);
    this.fxKind = new Uint8Array(FX_CAP);
    this.fxN = 0;

    this.nX = new Float32Array(NUM_CAP);
    this.nY = new Float32Array(NUM_CAP);
    this.nVal = new Int32Array(NUM_CAP);
    this.nLife = new Float32Array(NUM_CAP);
    this.nTint = new Uint32Array(NUM_CAP);
    this.nN = 0;

    this.aX0 = new Float32Array(ARC_CAP);
    this.aY0 = new Float32Array(ARC_CAP);
    this.aX1 = new Float32Array(ARC_CAP);
    this.aY1 = new Float32Array(ARC_CAP);
    this.aLife = new Float32Array(ARC_CAP);
    this.aN = 0;

    this.trauma = 0;
    this.shakeT = 0;
    this.cam = { x: 0, y: 0 };
    this.zoom = 1;
    this.viewRadius = 700;
    this.novaFade = 0;
    this.time = 0;
    this.realDt = 0;
    /* particle budget; lowered on devices that cannot hold the frame rate */
    this.fxScale = 1;
    this.resize();
  }

  resize() {
    const W = this.app.screen.width, H = this.app.screen.height;
    /* Scale by screen area rather than either side, so portrait and
       landscape show the same amount of arena. */
    this.zoom = Math.sqrt(W * H) / 900;
    this.viewRadius = Math.hypot(W, H) / 2 / this.zoom;
    this.ground.width = W;
    this.ground.height = H;
    if (this.bloomRt) this.bloomRt.resize(W, H);
  }

  setBloom(on) {
    this.bloomOn = on;
    this.bloom.visible = on;
    if (on && !this.bloomRt) {
      this.bloomRt = RenderTexture.create({
        width: this.app.screen.width, height: this.app.screen.height, resolution: 0.25
      });
      this.bloom.texture = this.bloomRt;
    }
  }

  /** Screen shake, as trauma: offsets go with its square, so small knocks
      barely register and big ones land hard. */
  addTrauma(x) {
    this.trauma = Math.min(1, this.trauma + x);
  }

  reset(sim) {
    this.cam.x = sim.p.x;
    this.cam.y = sim.p.y;
    this.fxN = 0;
    this.nN = 0;
    this.aN = 0;
    this.trauma = 0;
    this.novaFade = 0;
    this.player.visible = true;
    this.engine.visible = true;
  }

  /* ------------------------------------------------------------ effects */

  emit(kind, x, y, vx, vy, life, size, tint) {
    let i = this.fxN;
    if (i >= FX_CAP) {
      /* full: overwrite a random old one rather than drop the new one */
      i = (Math.random() * FX_CAP) | 0;
    } else this.fxN++;
    this.fxX[i] = x;
    this.fxY[i] = y;
    this.fxVx[i] = vx;
    this.fxVy[i] = vy;
    this.fxLife[i] = life;
    this.fxMax[i] = life;
    this.fxSize[i] = size;
    this.fxTint[i] = tint;
    this.fxKind[i] = kind;
  }

  burst(x, y, n, speed, size, tint, life = 0.45) {
    n = Math.ceil(n * this.fxScale);
    for (let k = 0; k < n; k++) {
      const a = Math.random() * TAU, s = speed * (0.35 + Math.random() * 0.75);
      this.emit(FX.SPARK, x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.6 + Math.random() * 0.6), size, tint);
    }
  }

  number(x, y, value, tint) {
    let i = this.nN;
    if (i >= NUM_CAP) i = (Math.random() * NUM_CAP) | 0;
    else this.nN++;
    this.nX[i] = x + (Math.random() - 0.5) * 10;
    this.nY[i] = y - 8;
    this.nVal[i] = Math.max(1, Math.round(value));
    this.nLife[i] = 0.62;
    this.nTint[i] = tint;
  }

  arc(x0, y0, x1, y1) {
    let i = this.aN;
    if (i >= ARC_CAP) i = (Math.random() * ARC_CAP) | 0;
    else this.aN++;
    this.aX0[i] = x0;
    this.aY0[i] = y0;
    this.aX1[i] = x1;
    this.aY1[i] = y1;
    this.aLife[i] = 0.14;
  }

  consume(events) {
    let hits = 0;
    for (let i = 0; i < events.count; i++) {
      const t = events.type[i], x = events.x[i], y = events.y[i];
      switch (t) {
        case EV.HIT: {
          if (hits < 40) this.burst(x, y, 2, 220, 0.18, 0xffffff, 0.18);
          if (hits < NUM_PER_FRAME) {
            const d = events.a[i];
            this.number(x, y, d, d >= 60 ? 0xffd84f : d >= 25 ? 0xfff2b0 : 0xffffff);
          }
          hits++;
          break;
        }
        case EV.KILL: {
          const type = events.a[i], r = events.b[i], tint = ENEMY_TINT[type];
          const big = r >= 40;
          this.burst(x, y, big ? 90 : 6 + Math.round(r * 0.35), big ? 700 : 260 + r * 6,
            big ? 0.5 : 0.22 + r * 0.006, tint, big ? 1.2 : 0.5);
          this.emit(FX.DOT, x, y, 0, 0, big ? 0.6 : 0.22, (r / this.R) * (big ? 3 : 1.4), tint);
          if (big) this.emit(FX.RING, x, y, 0, 0, 0.8, r * 5, tint);
          break;
        }
        case EV.PICKUP:
          this.emit(FX.DOT, x, y, 0, 0, 0.16, 0.18, hex(COLORS.gem1));
          break;
        case EV.HURT:
          this.burst(this.lastPx, this.lastPy, 8, 260, 0.25, 0xff4060, 0.35);
          break;
        case EV.LEVELUP:
          this.burst(x, y, 40, 520, 0.3, hex(COLORS.player), 0.7);
          this.emit(FX.RING, x, y, 0, 0, 0.5, 160, hex(COLORS.player));
          break;
        case EV.EVOLVE:
          this.burst(x, y, 120, 700, 0.4, 0xffd84f, 1.1);
          this.emit(FX.RING, x, y, 0, 0, 0.9, 380, 0xffd84f);
          break;
        case EV.BEAM:
          this.arc(x, y, events.a[i], events.b[i]);
          break;
        case EV.EXPLODE: {
          const r = events.a[i];
          this.emit(FX.RING, x, y, 0, 0, 0.32, r, 0xffb08a);
          this.emit(FX.DOT, x, y, 0, 0, 0.2, (r / this.R) * 0.9, 0xff8a5a);
          this.burst(x, y, 10, 300 + r * 3, 0.3, 0xffb060, 0.4);
          break;
        }
        case EV.TELL:
          this.emit(FX.TELL, x, y, 0, 0, events.a[i], events.b[i] * 2.2, hex(COLORS.blinker));
          break;
        case EV.BLINK:
          this.burst(x, y, 12, 260, 0.25, hex(COLORS.blinker), 0.35);
          this.burst(events.a[i], events.b[i], 12, 260, 0.25, hex(COLORS.blinker), 0.35);
          break;
        case EV.ITEM: {
          const tint = [hex(COLORS.heal), hex(COLORS.vacuum), hex(COLORS.cache)][events.a[i]];
          this.burst(x, y, 30, 420, 0.3, tint, 0.7);
          this.emit(FX.RING, x, y, 0, 0, 0.5, events.a[i] === 1 ? 600 : 120, tint);
          break;
        }
        case EV.BULLET:
          this.emit(FX.DOT, x, y, 0, 0, 0.12, 0.25, hex(COLORS.ebullet));
          break;
        case EV.PLAYER_DEATH:
          this.burst(x, y, 90, 600, 0.35, hex(COLORS.player), 1.2);
          this.burst(x, y, 40, 300, 0.3, 0xffffff, 0.9);
          this.emit(FX.RING, x, y, 0, 0, 1.0, 300, hex(COLORS.player));
          this.player.visible = false;
          this.engine.visible = false;
          break;
      }
    }
  }

  /* ------------------------------------------------------------ frame */

  sync(sim, dt, realDt = dt) {
    this.realDt = realDt;
    this.time += dt;
    const p = sim.p, tex = this.atlas.tex, R = this.R, T = this.time;
    this.lastPx = p.x;
    this.lastPy = p.y;

    /* Camera: follow with a slight lead in the direction of travel. */
    const k = Math.min(1, realDt * 9);
    this.cam.x += (p.x + p.vx * 0.18 - this.cam.x) * k;
    this.cam.y += (p.y + p.vy * 0.18 - this.cam.y) * k;
    const W = this.app.screen.width, H = this.app.screen.height, z = this.zoom;
    /* Shake runs on its own clock, so it keeps going through a hit-pause -
       which is exactly when it should be felt. */
    this.trauma = Math.max(0, this.trauma - realDt * 1.5);
    this.shakeT += realDt;
    const sh = this.trauma * this.trauma * 16, st = this.shakeT;
    const sx = sh * (Math.sin(st * 61) * 0.6 + Math.sin(st * 37 + 1.3) * 0.4);
    const sy = sh * (Math.sin(st * 53 + 0.7) * 0.6 + Math.sin(st * 29 + 2.1) * 0.4);
    const ox = W / 2 - this.cam.x * z + sx, oy = H / 2 - this.cam.y * z + sy;
    this.world.scale.set(z);
    this.world.position.set(ox, oy);
    this.ground.tileScale.set(z);
    this.ground.tilePosition.set(ox, oy);

    this.drawPickups(sim, tex, T);
    this.drawShots(sim, tex, T);
    this.drawEnemies(sim, tex, R, T, p);
    this.drawWeapons(sim, tex, R, T, p, dt);
    this.drawPlayer(sim, tex, R, T, p);
    this.updateFx(dt);
    this.updateNumbers(dt, ox, oy, z);

    if (this.bloomOn) {
      this.app.renderer.render({ container: this.world, target: this.bloomRt, clear: true });
    }
  }

  drawPickups(sim, tex, T) {
    const L = this.pickups;
    L.begin();
    for (let i = 0; i < sim.gPool.high; i++) {
      if (!sim.gAlive[i]) continue;
      const v = sim.gValue[i];
      const t = v >= 25 ? tex.gem25 : v >= 5 ? tex.gem5 : tex.gem1;
      const s = (v >= 25 ? 0.36 : v >= 5 ? 0.28 : 0.22) * (1 + 0.08 * Math.sin(T * 6 + i));
      L.add(t, sim.gx[i], sim.gy[i], s, s);
    }
    const itemTex = [tex.heal, tex.vacuum, tex.cache];
    const itemTint = [hex(COLORS.heal), hex(COLORS.vacuum), hex(COLORS.cache)];
    for (let i = 0; i < sim.iPool.high; i++) {
      if (!sim.iAlive[i]) continue;
      const kind = sim.iKind[i], x = sim.ix[i], y = sim.iy[i] + Math.sin(T * 3 + i) * 3;
      const pulse = 1 + 0.1 * Math.sin(T * 5);
      L.add(tex.dot, x, y, 0.9 * pulse, 0.9 * pulse, 0, itemTint[kind], 0.35);
      L.add(tex.ring, x, y, 0.2 * pulse, 0.2 * pulse, 0, itemTint[kind], 0.7);
      L.add(itemTex[kind], x, y, 0.5, 0.5, kind === 2 ? T * 1.5 : 0);
    }
    L.end();
  }

  drawShots(sim, tex, T) {
    const L = this.shots;
    L.begin();
    for (let i = 0; i < sim.sPool.high; i++) {
      if (!sim.sAlive[i]) continue;
      const x = sim.sx[i], y = sim.sy[i], a = Math.atan2(sim.svy[i], sim.svx[i]);
      switch (sim.sKind[i]) {
        case SHOT.BOLT:
          L.add(tex.bolt, x, y, 0.36, (sim.sR[i] / 7) * 0.45, a);
          break;
        case SHOT.LANCE:
          L.add(tex.bolt, x, y, 0.62, 0.7, a, 0xfff0b0);
          break;
        case SHOT.GLAIVE: {
          const s = (sim.sR[i] / this.R) * 1.3;
          L.add(tex.glaive, x, y, s, s, sim.sAge[i] * 16);
          break;
        }
        case SHOT.MISSILE:
          L.add(tex.missile, x, y, 0.32, 0.32, a);
          if (Math.random() < 0.7) {
            this.emit(FX.DOT, x - Math.cos(a) * 9, y - Math.sin(a) * 9, (Math.random() - 0.5) * 20,
              (Math.random() - 0.5) * 20, 0.28, 0.14, 0xffa060);
          }
          break;
        case SHOT.MINE: {
          const armed = sim.sAge[i] > 0.4;
          const blink = armed && Math.sin(T * 10 + i) > 0.3;
          L.add(tex.mine, x, y, 0.42, 0.42, 0, blink ? 0xffffff : 0xffc0b0, armed ? 1 : 0.5);
          break;
        }
        case SHOT.DISC:
          L.add(tex.disc, x, y, 0.32, 0.32, sim.sAge[i] * 12);
          break;
        case SHOT.FLAME: {
          const age = sim.sAge[i], f = age / (age + sim.sLife[i]);
          const s = (sim.sR[i] / this.R) * 1.8;
          /* white-yellow at the nozzle, through orange, to a dim red */
          const tint = f < 0.25 ? 0xfff2a0 : f < 0.6 ? 0xffa040 : 0xff4a2a;
          L.add(tex.dot, x, y, s, s, 0, tint, 0.85 * (1 - f * f));
          break;
        }
        case SHOT.PELLET:
          L.add(tex.pellet, x, y, 0.32, 0.32, a);
          break;
      }
    }
    for (let i = 0; i < sim.bPool.high; i++) {
      if (!sim.bAlive[i]) continue;
      const s = (sim.bR[i] / 22) * (1 + 0.15 * Math.sin(T * 20 + i));
      L.add(tex.ebullet, sim.bx[i], sim.by[i], s, s);
    }
    L.end();
  }

  drawEnemies(sim, tex, R, T, p) {
    const L = this.enemies;
    L.begin();
    for (let i = 0; i < sim.eHigh; i++) {
      if (!sim.eAlive[i]) continue;
      const def = ENEMIES[sim.eType[i]], id = def.id, x = sim.ex[i], y = sim.ey[i];
      let s = sim.eR[i] / R, rot = Math.atan2(p.y - y, p.x - x);
      let white = sim.eFlash[i] > 0;
      const mode = sim.eMode[i];
      if (id === 'swarmer') rot = T * 5 + i;
      else if (id === 'tank' || id === 'warden' || id === 'hive') rot = T * 0.6 + i;
      else if (id === 'bomber') {
        rot = T * 2 + i;
        if (mode === 1) {
          s *= 1 + 0.25 * Math.sin(T * 50);
          white = white || Math.sin(T * 50) > 0;
        }
      } else if (id === 'dasher' && mode !== 0) {
        rot = Math.atan2(sim.eDy[i], sim.eDx[i]);
        if (mode === 1) {
          s *= 1 + 0.18 * Math.sin(T * 40);
          white = white || Math.sin(T * 40) > 0;
        }
      } else if (id === 'blinker' && mode === 1) {
        white = white || Math.sin(T * 45) > 0;
      } else if (id === 'monolith') {
        rot = T * 0.35;
        if (mode === 2) white = white || Math.sin(T * 40) > 0;
      }
      const tint = ENEMY_TINT[sim.eType[i]];
      if (def.boss || def.elite) {
        const g = s * (def.boss ? 3.2 : 2.6) * (1 + 0.06 * Math.sin(T * 3));
        L.add(tex.dot, x, y, g, g, 0, tint, def.boss ? 0.35 : 0.3);
      }
      L.add(tex[white ? id + '_w' : id], x, y, s, s, rot);
      if (sim.eShield[i] > 0) {
        const f = sim.eShield[i] / (sim.eMaxHp[i] * def.shield);
        const ss = s * 1.45;
        L.add(tex.shield, x, y, ss, ss, -T, 0xffffff, 0.35 + 0.65 * f);
      }
    }
    L.end();
  }

  drawWeapons(sim, tex, R, T, p, dt) {
    const L = this.weaponsFx;
    L.begin();
    let novaOn = false;
    for (const w of sim.weapons) {
      const id = w.def.id;
      if (id === 'orbit' || id === 'halo') {
        const s = (w.br / R) * 1.15;
        const tint = id === 'halo' ? 0xfff0a0 : 0xffffff;
        for (let b = 0; b < w.n; b++) {
          L.add(tex.blade, w.bx[b], w.by[b], s, s, w.angle + (TAU * b) / w.n + Math.PI / 2, tint);
        }
      } else if (id === 'nova' || id === 'supernova') {
        if (w.ringOn) novaOn = true;
        if ((w.ringOn || this.novaFade > 0) && w.ringMax > 0) {
          const s = w.ring / this.atlas.ringRadius;
          const tint = id === 'supernova' ? 0xffe08a : hex(COLORS.nova);
          const a = (w.ringOn ? 1 : this.novaFade) * (1 - (w.ring / w.ringMax) * 0.5);
          L.add(tex.ring, p.x, p.y, s, s, 0, tint, a);
        }
      } else if (id === 'laser' && w.on > 0) {
        const beams = w.stats.both ? 2 : 1;
        const fade = Math.min(1, w.on * 8);
        for (let b = 0; b < beams; b++) {
          const a = w.a + b * Math.PI, half = w.len / 2;
          L.add(tex.laser, p.x + Math.cos(a) * half, p.y + Math.sin(a) * half, w.len / 76, w.width / 9, a, 0xffffff, fade);
        }
        L.add(tex.dot, p.x, p.y, 0.45, 0.45, 0, hex(COLORS.laser), fade);
      } else if (id === 'gravity' || id === 'horizon') {
        const tint = id === 'horizon' ? 0xffd84f : hex(COLORS.dasher);
        for (let k = 0; k < 4; k++) {
          if (w.wt[k] <= 0) continue;
          const s = w.wr[k] / this.atlas.ringRadius, a = Math.min(1, w.wt[k] * 2);
          L.add(tex.dot, w.wx[k], w.wy[k], s * 2.2, s * 2.2, 0, tint, 0.25 * a);
          L.add(tex.ring, w.wx[k], w.wy[k], s, s, T * 3, tint, 0.8 * a);
          L.add(tex.ring, w.wx[k], w.wy[k], s * 0.55, s * 0.55, -T * 5, tint, 0.6 * a);
          /* debris spiralling in */
          if (dt > 0 && Math.random() < 0.8) {
            const ang = Math.random() * TAU, d = w.wr[k];
            this.emit(FX.DOT, w.wx[k] + Math.cos(ang) * d, w.wy[k] + Math.sin(ang) * d,
              -Math.cos(ang) * d * 1.6 - Math.sin(ang) * d, -Math.sin(ang) * d * 1.6 + Math.cos(ang) * d,
              0.45, 0.14, tint);
          }
        }
      } else if (id === 'drones') {
        for (let k = 0; k < w.n; k++) {
          L.add(tex.dot, w.dx[k], w.dy[k], 0.35, 0.35, 0, hex(COLORS.drone), 0.4);
          L.add(tex.drone, w.dx[k], w.dy[k], 0.3, 0.3, T * 2 + k);
        }
      }
    }
    this.novaFade = novaOn ? 1 : Math.max(0, this.novaFade - dt * 5);

    /* lightning: each arc as three jittered segments, re-jittered every
       frame so it crackles */
    let n = this.aN;
    for (let i = 0; i < n; i++) {
      this.aLife[i] -= this.realDt;
      if (this.aLife[i] <= 0) {
        n--;
        this.aX0[i] = this.aX0[n]; this.aY0[i] = this.aY0[n];
        this.aX1[i] = this.aX1[n]; this.aY1[i] = this.aY1[n];
        this.aLife[i] = this.aLife[n];
        i--;
        continue;
      }
      const alpha = Math.min(1, this.aLife[i] / 0.08);
      let px = this.aX0[i], py = this.aY0[i];
      const dx = this.aX1[i] - px, dy = this.aY1[i] - py, len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      for (let sgm = 1; sgm <= 3; sgm++) {
        const f = sgm / 3, j = sgm < 3 ? (Math.random() - 0.5) * len * 0.3 : 0;
        const qx = this.aX0[i] + dx * f + nx * j, qy = this.aY0[i] + dy * f + ny * j;
        const sl = Math.hypot(qx - px, qy - py);
        L.add(tex.bolt, (px + qx) / 2, (py + qy) / 2, sl / 72, 0.5, Math.atan2(qy - py, qx - px), 0xd8f8ff, alpha);
        px = qx;
        py = qy;
      }
    }
    this.aN = n;
    L.end();
  }

  drawPlayer(sim, tex, R, T, p) {
    const hurt = p.hurt > 0 && Math.sin(T * 50) > 0;
    const ship = sim.char.sprite;
    this.player.texture = hurt ? tex[ship + '_w'] : tex[ship];
    this.engine.tint = hex(sim.char.color);
    this.player.position.set(p.x, p.y);
    this.player.rotation = p.face;
    this.player.scale.set((p.r / R) * 1.25);
    const sp = Math.hypot(p.vx, p.vy) / 150;
    this.engine.position.set(p.x - Math.cos(p.face) * 12, p.y - Math.sin(p.face) * 12);
    this.engine.scale.set(0.22 + 0.18 * sp + 0.03 * Math.sin(T * 30));
    this.engine.alpha = 0.5 + 0.4 * sp;
    if (sp > 0.3 && Math.random() < 0.6) {
      this.emit(FX.DOT, this.engine.x, this.engine.y, -p.vx * 0.3 + (Math.random() - 0.5) * 30,
        -p.vy * 0.3 + (Math.random() - 0.5) * 30, 0.3, 0.12, hex(sim.char.color));
    }

    /* health bar under the ship, only once hurt */
    const g = this.hpBar.clear();
    if (!sim.over && p.hp < p.maxHp) {
      const w = 36, h = 4, x = p.x - w / 2, y = p.y + 24, f = p.hp / p.maxHp;
      g.rect(x, y, w, h).fill({ color: 0x1a0a10, alpha: 0.8 });
      g.rect(x, y, w * f, h).fill(f > 0.35 ? 0x5dff9a : 0xff3b6b);
    }
  }

  updateFx(dt) {
    const tex = this.atlas.tex, fx = this.fx, rr = this.atlas.ringRadius;
    fx.begin();
    let n = this.fxN;
    const drag = Math.exp(-4 * dt);
    for (let i = 0; i < n; i++) {
      this.fxLife[i] -= dt;
      if (this.fxLife[i] <= 0) {
        /* swap-remove */
        n--;
        this.fxX[i] = this.fxX[n]; this.fxY[i] = this.fxY[n];
        this.fxVx[i] = this.fxVx[n]; this.fxVy[i] = this.fxVy[n];
        this.fxLife[i] = this.fxLife[n]; this.fxMax[i] = this.fxMax[n];
        this.fxSize[i] = this.fxSize[n]; this.fxTint[i] = this.fxTint[n]; this.fxKind[i] = this.fxKind[n];
        i--;
        continue;
      }
      this.fxX[i] += this.fxVx[i] * dt;
      this.fxY[i] += this.fxVy[i] * dt;
      this.fxVx[i] *= drag;
      this.fxVy[i] *= drag;
      const f = this.fxLife[i] / this.fxMax[i], s = this.fxSize[i], kind = this.fxKind[i];
      if (kind === FX.SPARK) {
        const sp = Math.hypot(this.fxVx[i], this.fxVy[i]);
        fx.add(tex.spark, this.fxX[i], this.fxY[i], s * (0.4 + sp / 400), s * 1.4,
          Math.atan2(this.fxVy[i], this.fxVx[i]), this.fxTint[i], f);
      } else if (kind === FX.DOT) {
        fx.add(tex.dot, this.fxX[i], this.fxY[i], s * (1.4 - f * 0.4), s * (1.4 - f * 0.4), 0, this.fxTint[i], f);
      } else if (kind === FX.RING) {
        /* expands fast, then fades */
        const e = 1 - f, sc = (s / rr) * (0.25 + 0.75 * (1 - (1 - e) * (1 - e)));
        fx.add(tex.ring, this.fxX[i], this.fxY[i], sc, sc, 0, this.fxTint[i], f);
      } else {
        /* a telegraph closing in on where something will land */
        const sc = (s / rr) * (0.5 + f);
        fx.add(tex.ring, this.fxX[i], this.fxY[i], sc, sc, 0, this.fxTint[i], 0.9 - f * 0.4);
      }
    }
    this.fxN = n;
    fx.end();
  }

  updateNumbers(dt, ox, oy, z) {
    const tex = this.atlas.tex, L = this.nums;
    L.begin();
    let n = this.nN;
    /* numbers are placed in screen space so they stay a readable size
       whatever the zoom */
    const size = 0.17;
    for (let i = 0; i < n; i++) {
      this.nLife[i] -= dt;
      if (this.nLife[i] <= 0) {
        n--;
        this.nX[i] = this.nX[n]; this.nY[i] = this.nY[n]; this.nVal[i] = this.nVal[n];
        this.nLife[i] = this.nLife[n]; this.nTint[i] = this.nTint[n];
        i--;
        continue;
      }
      const life = this.nLife[i], age = 0.62 - life;
      this.nY[i] -= 46 * dt * (life / 0.62);
      const pop = age < 0.08 ? 1 + (0.08 - age) * 7 : 1;
      const s = size * pop * (this.nTint[i] === 0xffd84f ? 1.35 : 1);
      const alpha = Math.min(1, life / 0.22);
      const str = String(this.nVal[i]);
      const adv = DIGIT_ADVANCE * s;
      let x = ox + this.nX[i] * z - (adv * (str.length - 1)) / 2;
      const y = oy + this.nY[i] * z;
      for (let c = 0; c < str.length; c++, x += adv) {
        L.add(tex['d' + str[c]], x, y, s, s, 0, this.nTint[i], alpha);
      }
    }
    this.nN = n;
    L.end();
  }
}
