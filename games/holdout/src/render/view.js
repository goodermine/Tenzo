/* HOLDOUT - draws the simulation.
   Reads src/sim/world.js's arrays every frame and writes them into a few
   ParticleContainers - one batched draw each for gems, shots, enemies and
   effects, whatever the count - all from one atlas, all additive, so a dense
   swarm glows brighter where it bunches. Nothing here decides anything; the
   view could be swapped out and the game would play the same. */
import { Container, ParticleContainer, Particle, TilingSprite, Sprite, Graphics } from 'pixi.js';
import { buildGround, COLORS } from './atlas.js';
import { EV } from '../sim/events.js';
import { ENEMIES } from '../content/enemies.js';

const hex = s => parseInt(s.slice(1), 16);
const ENEMY_TINT = ENEMIES.map(e => hex(COLORS[e.id]));
const ENEMY_TEX = ENEMIES.map(e => e.id);

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

/* Short-lived effect particles: sparks and flashes, owned by the view. */
const FX_CAP = 1600;

export class View {
  constructor(app, atlas) {
    this.app = app;
    this.atlas = atlas;
    this.R = atlas.R;

    this.ground = new TilingSprite({ texture: buildGround(), width: 10, height: 10 });
    this.world = new Container();
    this.gems = new Layer(atlas, 1200);
    this.shots = new Layer(atlas, 800);
    this.enemies = new Layer(atlas, 1100);
    this.weaponsFx = new Layer(atlas, 64);
    this.fx = new Layer(atlas, FX_CAP);

    this.player = new Sprite(atlas.tex.player);
    this.player.anchor.set(0.5);
    this.player.blendMode = 'add';
    this.engine = new Sprite(atlas.tex.dot);
    this.engine.anchor.set(0.5);
    this.engine.blendMode = 'add';
    this.engine.tint = hex(COLORS.player);
    this.hpBar = new Graphics();

    this.world.addChild(
      this.gems.container, this.shots.container, this.enemies.container,
      this.weaponsFx.container, this.engine, this.player, this.fx.container, this.hpBar
    );
    app.stage.addChild(this.ground, this.world);

    this.fxX = new Float32Array(FX_CAP);
    this.fxY = new Float32Array(FX_CAP);
    this.fxVx = new Float32Array(FX_CAP);
    this.fxVy = new Float32Array(FX_CAP);
    this.fxLife = new Float32Array(FX_CAP);
    this.fxMax = new Float32Array(FX_CAP);
    this.fxSize = new Float32Array(FX_CAP);
    this.fxTint = new Uint32Array(FX_CAP);
    this.fxKind = new Uint8Array(FX_CAP); /* 0 spark, 1 dot */
    this.fxN = 0;

    this.cam = { x: 0, y: 0 };
    this.zoom = 1;
    this.viewRadius = 700;
    this.novaFade = 0;
    this.time = 0;
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
  }

  reset(sim) {
    this.cam.x = sim.p.x;
    this.cam.y = sim.p.y;
    this.fxN = 0;
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
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.35 + Math.random() * 0.75);
      this.emit(0, x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.6 + Math.random() * 0.6), size, tint);
    }
  }

  consume(events) {
    let hits = 0;
    for (let i = 0; i < events.count; i++) {
      const t = events.type[i], x = events.x[i], y = events.y[i];
      if (t === EV.HIT) {
        if (hits++ < 40) this.burst(x, y, 2, 220, 0.18, 0xffffff, 0.18);
      } else if (t === EV.KILL) {
        const type = events.a[i], r = events.b[i], tint = ENEMY_TINT[type];
        this.burst(x, y, 6 + Math.round(r * 0.35), 260 + r * 6, 0.22 + r * 0.006, tint, 0.5);
        this.emit(1, x, y, 0, 0, 0.22, r / this.R * 1.4, tint);
      } else if (t === EV.PICKUP) {
        this.emit(1, x, y, 0, 0, 0.16, 0.18, hex(COLORS.gem1));
      } else if (t === EV.HURT) {
        this.burst(this.lastPx, this.lastPy, 8, 260, 0.25, 0xff4060, 0.35);
      } else if (t === EV.LEVELUP) {
        this.burst(x, y, 40, 520, 0.3, hex(COLORS.player), 0.7);
      } else if (t === EV.PLAYER_DEATH) {
        this.burst(x, y, 90, 600, 0.35, hex(COLORS.player), 1.2);
        this.burst(x, y, 40, 300, 0.3, 0xffffff, 0.9);
        this.player.visible = false;
        this.engine.visible = false;
      }
    }
  }

  /* ------------------------------------------------------------ frame */

  sync(sim, dt) {
    this.time += dt;
    const p = sim.p, tex = this.atlas.tex, R = this.R;
    this.lastPx = p.x;
    this.lastPy = p.y;

    /* Camera: follow with a slight lead in the direction of travel. */
    const k = Math.min(1, dt * 9);
    this.cam.x += (p.x + p.vx * 0.18 - this.cam.x) * k;
    this.cam.y += (p.y + p.vy * 0.18 - this.cam.y) * k;
    const W = this.app.screen.width, H = this.app.screen.height, z = this.zoom;
    const ox = W / 2 - this.cam.x * z, oy = H / 2 - this.cam.y * z;
    this.world.scale.set(z);
    this.world.position.set(ox, oy);
    this.ground.tileScale.set(z);
    this.ground.tilePosition.set(ox, oy);

    /* gems */
    const gems = this.gems;
    gems.begin();
    for (let i = 0; i < sim.gPool.high; i++) {
      if (!sim.gAlive[i]) continue;
      const v = sim.gValue[i];
      const t = v >= 25 ? tex.gem25 : v >= 5 ? tex.gem5 : tex.gem1;
      const s = (v >= 25 ? 0.36 : v >= 5 ? 0.28 : 0.22) * (1 + 0.08 * Math.sin(this.time * 6 + i));
      gems.add(t, sim.gx[i], sim.gy[i], s, s);
    }
    gems.end();

    /* shots */
    const shots = this.shots;
    shots.begin();
    for (let i = 0; i < sim.sPool.high; i++) {
      if (!sim.sAlive[i]) continue;
      const a = Math.atan2(sim.svy[i], sim.svx[i]);
      shots.add(tex.bolt, sim.sx[i], sim.sy[i], 0.36, (sim.sR[i] / 7) * 0.45, a);
    }
    shots.end();

    /* enemies */
    const en = this.enemies;
    en.begin();
    for (let i = 0; i < sim.eHigh; i++) {
      if (!sim.eAlive[i]) continue;
      const type = sim.eType[i], x = sim.ex[i], y = sim.ey[i];
      let s = sim.eR[i] / R, rot;
      const name = ENEMY_TEX[type];
      if (name === 'swarmer') rot = this.time * 5 + i;
      else if (name === 'tank') rot = this.time * 0.6 + i;
      else if (name === 'dasher' && sim.eMode[i] !== 0) {
        rot = Math.atan2(sim.eDy[i], sim.eDx[i]);
        if (sim.eMode[i] === 1) s *= 1 + 0.18 * Math.sin(this.time * 40);
      } else rot = Math.atan2(p.y - y, p.x - x);
      /* a windup flashes too: it is the tell for the dash */
      const white = sim.eFlash[i] > 0 || (sim.eMode[i] === 1 && Math.sin(this.time * 40) > 0);
      en.add(tex[white ? name + '_w' : name], x, y, s, s, rot);
    }
    en.end();

    /* weapons drawn from their state */
    const wf = this.weaponsFx;
    wf.begin();
    for (const w of sim.weapons) {
      if (w.def.id === 'orbit') {
        const s = (w.br / R) * 1.15;
        for (let b = 0; b < w.n; b++) wf.add(tex.blade, w.bx[b], w.by[b], s, s, w.angle + (Math.PI * 2 * b) / w.n + Math.PI / 2);
      } else if (w.def.id === 'nova') {
        if (w.ringOn) this.novaFade = 1;
        else this.novaFade = Math.max(0, this.novaFade - dt * 5);
        if (this.novaFade > 0 && w.ringMax > 0) {
          const s = w.ring / this.atlas.ringRadius;
          wf.add(tex.ring, p.x, p.y, s, s, 0, 0xffffff, this.novaFade * (1 - (w.ring / w.ringMax) * 0.5));
        }
      }
    }
    wf.end();

    /* player */
    const hurt = p.hurt > 0 && Math.sin(this.time * 50) > 0;
    this.player.texture = hurt ? tex.player_w : tex.player;
    this.player.position.set(p.x, p.y);
    this.player.rotation = p.face;
    this.player.scale.set((p.r / R) * 1.25);
    const sp = Math.hypot(p.vx, p.vy) / 150;
    this.engine.position.set(p.x - Math.cos(p.face) * 12, p.y - Math.sin(p.face) * 12);
    this.engine.scale.set(0.22 + 0.18 * sp + 0.03 * Math.sin(this.time * 30));
    this.engine.alpha = 0.5 + 0.4 * sp;
    if (sp > 0.3 && Math.random() < 0.6) {
      this.emit(1, this.engine.x, this.engine.y, -p.vx * 0.3 + (Math.random() - 0.5) * 30,
        -p.vy * 0.3 + (Math.random() - 0.5) * 30, 0.3, 0.12, hex(COLORS.player));
    }

    /* health bar under the ship, only once hurt */
    const g = this.hpBar.clear();
    if (!sim.over && p.hp < p.maxHp) {
      const w = 36, h = 4, x = p.x - w / 2, y = p.y + 24, f = p.hp / p.maxHp;
      g.rect(x, y, w, h).fill({ color: 0x1a0a10, alpha: 0.8 });
      g.rect(x, y, w * f, h).fill(f > 0.35 ? 0x5dff9a : 0xff3b6b);
    }

    this.updateFx(dt);
  }

  updateFx(dt) {
    const tex = this.atlas.tex, fx = this.fx;
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
      const f = this.fxLife[i] / this.fxMax[i], s = this.fxSize[i];
      if (this.fxKind[i] === 0) {
        const sp = Math.hypot(this.fxVx[i], this.fxVy[i]);
        fx.add(tex.spark, this.fxX[i], this.fxY[i], s * (0.4 + sp / 400), s * 1.4,
          Math.atan2(this.fxVy[i], this.fxVx[i]), this.fxTint[i], f);
      } else {
        fx.add(tex.dot, this.fxX[i], this.fxY[i], s * (1.4 - f * 0.4), s * (1.4 - f * 0.4), 0, this.fxTint[i], f);
      }
    }
    this.fxN = n;
    fx.end();
  }
}
