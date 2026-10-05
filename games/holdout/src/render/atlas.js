/* HOLDOUT - every sprite in the game, drawn in code at load.
   Neon vector shapes on one 1024px canvas: a coloured glow, a faint fill and
   a white-hot core line, baked once with Canvas2D's shadow blur so the glow
   costs nothing per frame. Sharing one texture is also what lets enemies,
   shots, gems and particles each draw as a single ParticleContainer batch.

   Each enemy has a white twin used for the hit flash: tint can only darken a
   texture, never brighten it, so "flash white" has to be its own image. */
import { CanvasSource, Texture, Rectangle } from 'pixi.js';

/* Shapes are drawn to this radius inside a 128px cell; a sprite of world
   radius r is scaled by r / R. */
export const R = 40;
const CELL = 128;

export const COLORS = {
  player: '#7ff6ff',
  chaser: '#ff3b6b',
  swarmer: '#ffb13b',
  dasher: '#b46bff',
  tank: '#ff6a2b',
  bolt: '#9ff8ff',
  blade: '#7dffb8',
  nova: '#9ad8ff',
  gem1: '#5dff9a',
  gem5: '#4fc3ff',
  gem25: '#ffd84f'
};

function neon(ctx, color, width, path, fillAlpha = 0.16, blur = 20) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.lineWidth = width + 2;
  path();
  ctx.stroke();
  ctx.shadowBlur = blur * 0.45;
  path();
  ctx.stroke();
  ctx.shadowBlur = 0;
  if (fillAlpha > 0) {
    ctx.globalAlpha = fillAlpha;
    ctx.fillStyle = color;
    path();
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = Math.max(1.5, width * 0.42);
  path();
  ctx.stroke();
  ctx.restore();
}

function poly(ctx, n, r, rot = 0, sx = 1, sy = 1) {
  ctx.beginPath();
  for (let k = 0; k <= n; k++) {
    const a = rot + (Math.PI * 2 * k) / n;
    const x = Math.cos(a) * r * sx, y = Math.sin(a) * r * sy;
    if (k === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/* Shapes point along +X; the renderer rotates them to face their heading. */
const SHAPES = {
  player: (ctx, c) => neon(ctx, c, 5, () => {
    ctx.beginPath();
    ctx.moveTo(R, 0);
    ctx.lineTo(-R * 0.75, R * 0.72);
    ctx.lineTo(-R * 0.4, 0);
    ctx.lineTo(-R * 0.75, -R * 0.72);
    ctx.closePath();
  }, 0.22),
  chaser: (ctx, c) => neon(ctx, c, 5, () => poly(ctx, 3, R * 0.95)),
  swarmer: (ctx, c) => neon(ctx, c, 7, () => poly(ctx, 4, R * 0.8, Math.PI / 4), 0.3, 24),
  dasher: (ctx, c) => neon(ctx, c, 5, () => poly(ctx, 4, R, 0, 1, 0.55)),
  tank: (ctx, c) => {
    neon(ctx, c, 5, () => poly(ctx, 6, R * 0.95, Math.PI / 6));
    neon(ctx, c, 3, () => poly(ctx, 6, R * 0.5, Math.PI / 6), 0.1, 10);
  },
  bolt: (ctx, c) => neon(ctx, c, 6, () => {
    ctx.beginPath();
    ctx.moveTo(-R * 0.9, 0);
    ctx.lineTo(R * 0.9, 0);
  }, 0, 22),
  blade: (ctx, c) => neon(ctx, c, 4, () => {
    ctx.beginPath();
    ctx.moveTo(R, 0);
    ctx.quadraticCurveTo(0, R * 0.35, -R, 0);
    ctx.quadraticCurveTo(0, -R * 0.7, R, 0);
    ctx.closePath();
  }, 0.3),
  gem: (ctx, c) => neon(ctx, c, 4, () => poly(ctx, 4, R * 0.62, 0, 0.75, 1), 0.45, 16),
  spark: ctx => {
    const g = ctx.createLinearGradient(-R, 0, R, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,1)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, R, R * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
  },
  dot: ctx => {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 1.4);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-R * 1.5, -R * 1.5, R * 3, R * 3);
  },
  pixel: ctx => {
    ctx.fillStyle = '#fff';
    ctx.fillRect(-R, -R * 0.25, R * 2, R * 0.5);
  },
  /* Icons for the level-up cards. */
  i_bolt: (ctx, c) => {
    for (const [y, l] of [[-14, 0.8], [0, 1], [14, 0.8]]) {
      neon(ctx, c, 5, () => {
        ctx.beginPath();
        ctx.moveTo(-R * l, y);
        ctx.lineTo(R * l, y);
      }, 0, 14);
    }
  },
  i_blade: (ctx, c) => {
    for (let k = 0; k < 3; k++) {
      ctx.save();
      ctx.rotate((Math.PI * 2 * k) / 3);
      ctx.translate(R * 0.5, 0);
      ctx.scale(0.45, 0.45);
      ctx.rotate(Math.PI / 2);
      SHAPES.blade(ctx, c);
      ctx.restore();
    }
  },
  i_nova: (ctx, c) => {
    neon(ctx, c, 4, () => { ctx.beginPath(); ctx.arc(0, 0, R * 0.9, 0, Math.PI * 2); }, 0, 14);
    neon(ctx, c, 3, () => { ctx.beginPath(); ctx.arc(0, 0, R * 0.5, 0, Math.PI * 2); }, 0.2, 10);
  },
  p_might: (ctx, c) => neon(ctx, c, 5, () => {
    ctx.beginPath();
    ctx.moveTo(R * 0.15, -R);
    ctx.lineTo(-R * 0.45, R * 0.1);
    ctx.lineTo(R * 0.05, R * 0.1);
    ctx.lineTo(-R * 0.15, R);
    ctx.lineTo(R * 0.45, -R * 0.1);
    ctx.lineTo(-R * 0.05, -R * 0.1);
    ctx.closePath();
  }, 0.25),
  p_haste: (ctx, c) => neon(ctx, c, 5, () => {
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.85, 0, Math.PI * 2);
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -R * 0.6);
    ctx.moveTo(0, 0);
    ctx.lineTo(R * 0.45, R * 0.2);
  }, 0),
  p_swift: (ctx, c) => {
    for (const x of [-R * 0.45, R * 0.15]) {
      neon(ctx, c, 5, () => {
        ctx.beginPath();
        ctx.moveTo(x - R * 0.3, -R * 0.7);
        ctx.lineTo(x + R * 0.35, 0);
        ctx.lineTo(x - R * 0.3, R * 0.7);
      }, 0, 14);
    }
  },
  p_magnet: (ctx, c) => neon(ctx, c, 6, () => {
    ctx.beginPath();
    ctx.arc(0, -R * 0.05, R * 0.6, Math.PI, 0);
    ctx.moveTo(-R * 0.6, -R * 0.05);
    ctx.lineTo(-R * 0.6, R * 0.75);
    ctx.moveTo(R * 0.6, -R * 0.05);
    ctx.lineTo(R * 0.6, R * 0.75);
  }, 0),
  p_vigor: (ctx, c) => neon(ctx, c, 5, () => {
    const a = R * 0.3, b = R * 0.85;
    ctx.beginPath();
    ctx.moveTo(-a, -b); ctx.lineTo(a, -b); ctx.lineTo(a, -a); ctx.lineTo(b, -a); ctx.lineTo(b, a);
    ctx.lineTo(a, a); ctx.lineTo(a, b); ctx.lineTo(-a, b); ctx.lineTo(-a, a); ctx.lineTo(-b, a);
    ctx.lineTo(-b, -a); ctx.lineTo(-a, -a);
    ctx.closePath();
  }, 0.25),
  p_area: (ctx, c) => {
    for (const r of [0.3, 0.6, 0.9]) {
      neon(ctx, c, 3.5, () => { ctx.beginPath(); ctx.arc(0, 0, R * r, 0, Math.PI * 2); }, 0, 10);
    }
  }
};

/* Digits for damage numbers: white with a dark outline, so they read over
   the glow. Drawn as atlas cells so a number is a few batched particles,
   not a text object. */
for (let d = 0; d < 10; d++) {
  SHAPES['d' + d] = ctx => {
    ctx.font = '900 92px ui-rounded, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 16;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(String(d), 0, 6);
    ctx.fillStyle = '#fff';
    ctx.fillText(String(d), 0, 6);
  };
}
/* Horizontal advance of a digit, in atlas pixels. */
export const DIGIT_ADVANCE = 56;

/* name -> [shape, colour] in cell order */
const LAYOUT = [
  ['player', 'player', COLORS.player],
  ['player_w', 'player', '#ffffff'],
  ['chaser', 'chaser', COLORS.chaser],
  ['chaser_w', 'chaser', '#ffffff'],
  ['swarmer', 'swarmer', COLORS.swarmer],
  ['swarmer_w', 'swarmer', '#ffffff'],
  ['dasher', 'dasher', COLORS.dasher],
  ['dasher_w', 'dasher', '#ffffff'],
  ['tank', 'tank', COLORS.tank],
  ['tank_w', 'tank', '#ffffff'],
  ['bolt', 'bolt', COLORS.bolt],
  ['blade', 'blade', COLORS.blade],
  ['gem1', 'gem', COLORS.gem1],
  ['gem5', 'gem', COLORS.gem5],
  ['gem25', 'gem', COLORS.gem25],
  ['spark', 'spark', '#fff'],
  ['dot', 'dot', '#fff'],
  ['pixel', 'pixel', '#fff'],
  ['i_bolt', 'i_bolt', COLORS.bolt],
  ['i_blade', 'i_blade', COLORS.blade],
  ['i_nova', 'i_nova', COLORS.nova],
  ['p_might', 'p_might', '#ff7a8a'],
  ['p_haste', 'p_haste', '#ffd27a'],
  ['p_swift', 'p_swift', '#7affd8'],
  ['p_magnet', 'p_magnet', '#7ab8ff'],
  ['p_vigor', 'p_vigor', '#8aff7a'],
  ['p_area', 'p_area', '#d27aff'],
  ...Array.from({ length: 10 }, (_, d) => ['d' + d, 'd' + d, '#fff'])
];

export function buildAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  const cells = {};
  const perRow = 1024 / CELL;
  LAYOUT.forEach(([name, shape, color], i) => {
    const cx = (i % perRow) * CELL, cy = Math.floor(i / perRow) * CELL;
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx + 1, cy + 1, CELL - 2, CELL - 2);
    ctx.clip();
    ctx.translate(cx + CELL / 2, cy + CELL / 2);
    SHAPES[shape](ctx, color);
    ctx.restore();
    cells[name] = { x: cx, y: cy, w: CELL, h: CELL };
  });

  /* The nova ring takes a 256px block of its own at the bottom right. */
  const ring = { x: 1024 - 256, y: 1024 - 256, w: 256, h: 256 };
  ctx.save();
  ctx.translate(ring.x + 128, ring.y + 128);
  neon(ctx, COLORS.nova, 6, () => { ctx.beginPath(); ctx.arc(0, 0, 108, 0, Math.PI * 2); }, 0, 18);
  ctx.restore();
  cells.ring = ring;

  const source = new CanvasSource({ resource: canvas, autoGenerateMipmaps: true, scaleMode: 'linear' });
  const base = new Texture({ source });
  const tex = {};
  for (const [name, c] of Object.entries(cells)) {
    tex[name] = new Texture({ source, frame: new Rectangle(c.x, c.y, c.w, c.h) });
  }
  return { canvas, cells, tex, base, R, ringRadius: 108 };
}

/** The dark floor: a faint grid with a little grain, tiled under the world. */
export function buildGround() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#070a12';
  ctx.fillRect(0, 0, S, S);
  /* grain */
  const img = ctx.getImageData(0, 0, S, S);
  let seed = 7;
  for (let i = 0; i < img.data.length; i += 4) {
    seed = (seed * 16807) % 2147483647;
    const n = (seed / 2147483647 - 0.5) * 7;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n * 1.3;
  }
  ctx.putImageData(img, 0, 0);
  ctx.strokeStyle = 'rgba(70,120,190,0.10)';
  ctx.lineWidth = 1;
  for (let k = 0; k <= S; k += 64) {
    ctx.beginPath(); ctx.moveTo(k + 0.5, 0); ctx.lineTo(k + 0.5, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, k + 0.5); ctx.lineTo(S, k + 0.5); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(90,150,230,0.18)';
  ctx.beginPath(); ctx.moveTo(0.5, 0); ctx.lineTo(0.5, S); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, 0.5); ctx.lineTo(S, 0.5); ctx.stroke();
  ctx.fillStyle = 'rgba(120,180,255,0.35)';
  for (let x = 0; x < S; x += 64) for (let y = 0; y < S; y += 64) ctx.fillRect(x - 1, y - 1, 3, 3);
  return Texture.from(c);
}
