/* HOLDOUT - the arena behind the fight.
   Three parallax layers instead of one flat grid: soft nebula clouds far
   away, drifting star-dust nearer, and the grid floor itself, each a tiling
   texture generated at load and scrolled at its own fraction of the camera's
   movement. The arena changes as the run goes on - THE GRID, EMBER at 5:00,
   THE VOID at 9:30, just ahead of the first boss - by cross-fading the tints,
   so how long you have lasted is visible.

   The floor also keeps a short memory: ripples from novas, level-ups and
   boss arrivals, and scorch marks where big things died, fading over
   twenty seconds. Those two live in world space, under everything else. */
import { Container, ParticleContainer, Particle, TilingSprite, Texture } from 'pixi.js';

export const ZONES = [
  { name: 'THE GRID', base: 0x05070d, nebula: 0x1d4a84, stars: 0xa8dcff, grid: 0x4f86d0, vignette: '0,0,0' },
  { name: 'EMBER', base: 0x0a0508, nebula: 0x7a2246, stars: 0xffb894, grid: 0xc85a88, vignette: '40,0,12' },
  { name: 'THE VOID', base: 0x07040e, nebula: 0x45238a, stars: 0xd2b0ff, grid: 0x8a58d8, vignette: '18,0,40' }
];

const SCORCH_CAP = 64;
const RIPPLE_CAP = 16;

function tile(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  return Texture.from(c);
}

/* Soft clouds that wrap: each blob is drawn nine times, offset by the tile
   size, so the texture tiles without a seam. White, tinted per arena. */
function nebulaTexture() {
  return tile(512, (ctx, S) => {
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 26; k++) {
      const x = rnd() * S, y = rnd() * S, r = 60 + rnd() * 170, a = 0.05 + rnd() * 0.12;
      for (let ox = -S; ox <= S; ox += S) {
        for (let oy = -S; oy <= S; oy += S) {
          const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
          g.addColorStop(0, `rgba(255,255,255,${a})`);
          g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = g;
          ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
        }
      }
    }
  });
}

function starTexture() {
  return tile(512, (ctx, S) => {
    let seed = 17;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 140; k++) {
      const x = rnd() * S, y = rnd() * S, b = rnd();
      ctx.fillStyle = `rgba(255,255,255,${0.15 + b * 0.6})`;
      const r = b > 0.93 ? 1.6 : b > 0.7 ? 1.1 : 0.7;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/* The floor grid in white on transparent, so the arena can tint it. */
function gridTexture() {
  return tile(256, (ctx, S) => {
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1;
    for (let k = 0; k < S; k += 64) {
      ctx.beginPath(); ctx.moveTo(k + 0.5, 0); ctx.lineTo(k + 0.5, S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, k + 0.5); ctx.lineTo(S, k + 0.5); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.32)';
    ctx.beginPath(); ctx.moveTo(0.5, 0); ctx.lineTo(0.5, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 0.5); ctx.lineTo(S, 0.5); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (let x = 0; x < S; x += 64) for (let y = 0; y < S; y += 64) ctx.fillRect(x - 1, y - 1, 3, 3);
  });
}

const lerpColor = (a, b, t) => {
  const r = ((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * t;
  const g = ((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * t;
  const bl = (a & 255) + ((b & 255) - (a & 255)) * t;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
};

export class Background {
  constructor(app, atlas) {
    this.app = app;
    this.atlas = atlas;
    this.nebula = new TilingSprite({ texture: nebulaTexture(), width: 10, height: 10 });
    this.stars = new TilingSprite({ texture: starTexture(), width: 10, height: 10 });
    this.grid = new TilingSprite({ texture: gridTexture(), width: 10, height: 10 });
    this.nebula.blendMode = 'add';
    this.stars.blendMode = 'add';
    this.grid.blendMode = 'add';
    this.root = new Container();
    this.root.addChild(this.nebula, this.stars, this.grid);

    /* world-space floor effects, added under everything by the view */
    const pc = blend => {
      const c = new ParticleContainer({
        texture: atlas.base,
        dynamicProperties: { position: true, rotation: true, vertex: true, color: true, uvs: true }
      });
      c.blendMode = blend;
      return c;
    };
    this.floor = new Container();
    this.scorchLayer = pc('normal');
    this.rippleLayer = pc('add');
    this.floor.addChild(this.scorchLayer, this.rippleLayer);
    this.scorches = [];
    for (let i = 0; i < SCORCH_CAP; i++) {
      this.scorches.push({ p: new Particle({ texture: atlas.tex.scorch, anchorX: 0.5, anchorY: 0.5 }), life: 0 });
    }
    this.scorchNext = 0;
    this.ripples = [];
    for (let i = 0; i < RIPPLE_CAP; i++) {
      this.ripples.push({ p: new Particle({ texture: atlas.tex.ring, anchorX: 0.5, anchorY: 0.5 }), life: 0, max: 1, r: 1 });
    }
    this.rippleNext = 0;

    this.zone = 0;
    this.from = 0;
    this.fade = 1;
    this.detail = true;
    this.colors = { ...ZONES[0] };
    this.apply(1);
  }

  /** Cross-fade to an arena over a few seconds. */
  setZone(z, instant = false) {
    if (z === this.zone && this.fade >= 1) return;
    this.from = instant ? z : this.zone;
    this.zone = z;
    this.fade = instant ? 1 : 0;
    this.apply(this.fade);
  }

  apply(t) {
    const a = ZONES[this.from], b = ZONES[this.zone];
    this.colors.base = lerpColor(a.base, b.base, t);
    this.nebula.tint = lerpColor(a.nebula, b.nebula, t);
    this.stars.tint = lerpColor(a.stars, b.stars, t);
    this.grid.tint = lerpColor(a.grid, b.grid, t);
    this.app.renderer.background.color = this.colors.base;
  }

  /** Lower quality: drop the far layers and the floor memory. */
  setDetail(on) {
    this.detail = on;
    this.nebula.visible = this.stars.visible = on;
    this.scorchLayer.visible = on;
  }

  scorch(x, y, size) {
    if (!this.detail) return;
    const s = this.scorches[this.scorchNext];
    this.scorchNext = (this.scorchNext + 1) % SCORCH_CAP;
    s.life = 20;
    s.p.x = x;
    s.p.y = y;
    s.p.rotation = Math.random() * Math.PI * 2;
    s.p.scaleX = s.p.scaleY = size / this.atlas.R;
  }

  ripple(x, y, radius, tint = 0xffffff, life = 0.9) {
    const r = this.ripples[this.rippleNext];
    this.rippleNext = (this.rippleNext + 1) % RIPPLE_CAP;
    r.life = r.max = life;
    r.r = radius;
    r.p.x = x;
    r.p.y = y;
    r.p.tint = tint;
  }

  clear() {
    for (const s of this.scorches) s.life = 0;
    for (const r of this.ripples) r.life = 0;
  }

  update(dt, cam, z, W, H) {
    if (this.fade < 1) {
      this.fade = Math.min(1, this.fade + dt / 4);
      this.apply(this.fade);
    }
    const layer = (ts, f, scale) => {
      ts.width = W;
      ts.height = H;
      ts.tileScale.set(z * scale);
      ts.tilePosition.set(W / 2 - cam.x * z * f, H / 2 - cam.y * z * f);
    };
    layer(this.nebula, 0.3, 1.6);
    layer(this.stars, 0.6, 1);
    layer(this.grid, 1, 1);
    this.nebula.alpha = 0.9;
    this.grid.alpha = 0.7;

    const sc = this.scorchLayer.particleChildren;
    sc.length = 0;
    for (const s of this.scorches) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.p.alpha = Math.min(1, s.life / 6) * 0.85;
      sc.push(s.p);
    }
    const rp = this.rippleLayer.particleChildren;
    rp.length = 0;
    const rr = this.atlas.ringRadius;
    for (const r of this.ripples) {
      if (r.life <= 0) continue;
      r.life -= dt;
      const f = 1 - r.life / r.max;
      const s = (r.r * (0.15 + 0.85 * Math.sqrt(f))) / rr;
      r.p.scaleX = r.p.scaleY = s;
      r.p.alpha = 0.35 * (1 - f);
      rp.push(r.p);
    }
  }
}
