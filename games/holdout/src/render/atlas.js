/* HOLDOUT - every sprite in the game, drawn in code at load.
   Neon vector shapes: a coloured glow, a faint fill and a white-hot core
   line, baked once with Canvas2D's shadow blur so the glow costs nothing per
   frame. Game sprites share one 2048x1024 atlas, which is what lets enemies,
   shots, gems and particles each draw as a single ParticleContainer batch.
   Card and loadout icons are only ever shown in the DOM, so they go on a
   separate canvas that is never uploaded to the GPU.

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
  splitter: '#ff5ec4',
  shooter: '#ff9a3b',
  warden: '#e8d24a',
  bomber: '#ff2f2f',
  blinker: '#ff6bd6',
  elite: '#ffd84f',
  hive: '#ff3b6b',
  monolith: '#ff4a2a',
  bolt: '#9ff8ff',
  laser: '#ff5cf0',
  blade: '#7dffb8',
  glaive: '#ffe066',
  missile: '#ffb08a',
  mine: '#ff7a59',
  disc: '#7ad8ff',
  drone: '#b8fff1',
  pellet: '#fff1a8',
  ebullet: '#ff4a6a',
  nova: '#9ad8ff',
  gem1: '#5dff9a',
  gem5: '#4fc3ff',
  gem25: '#ffd84f',
  heal: '#5dff9a',
  vacuum: '#7ab8ff',
  cache: '#ffd84f',
  shield: '#e8d24a'
};

/* Silhouette mode: when set, neon() fills each shape solid and strokes its
   outline wide in the given dark colour instead of glowing. Every enemy is
   drawn once more this way, as the dark body the renderer lays under its
   additive outline - so a crowd reads as separate shapes instead of adding
   up to white. */
let silhouette = null;

function neon(ctx, color, width, path, fillAlpha = 0.16, blur = 20) {
  if (silhouette) {
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.fillStyle = ctx.strokeStyle = silhouette;
    ctx.lineWidth = width + 7;
    path();
    ctx.stroke();
    if (fillAlpha > 0 || blur > 0) {
      path();
      ctx.fill();
    }
    ctx.restore();
    return;
  }
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

function star(ctx, n, r1, r2, rot = 0) {
  ctx.beginPath();
  for (let k = 0; k <= n * 2; k++) {
    const a = rot + (Math.PI * k) / n, r = k % 2 ? r2 : r1;
    if (k === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
}

const circle = (ctx, r, x = 0, y = 0) => {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
};

const line = (ctx, x0, y0, x1, y1) => {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
};

/* Game sprites. Shapes point along +X; the renderer rotates them. */
const SPRITES = {
  player: (ctx, c) => neon(ctx, c, 5, () => {
    ctx.beginPath();
    ctx.moveTo(R, 0);
    ctx.lineTo(-R * 0.75, R * 0.72);
    ctx.lineTo(-R * 0.4, 0);
    ctx.lineTo(-R * 0.75, -R * 0.72);
    ctx.closePath();
  }, 0.22),
  bastion: (ctx, c) => neon(ctx, c, 5, () => {
    ctx.beginPath();
    ctx.moveTo(R * 0.85, 0);
    ctx.lineTo(R * 0.2, R * 0.75);
    ctx.lineTo(-R * 0.7, R * 0.6);
    ctx.lineTo(-R * 0.45, 0);
    ctx.lineTo(-R * 0.7, -R * 0.6);
    ctx.lineTo(R * 0.2, -R * 0.75);
    ctx.closePath();
  }, 0.24),
  specter: (ctx, c) => neon(ctx, c, 4, () => {
    ctx.beginPath();
    ctx.moveTo(R, 0);
    ctx.lineTo(-R * 0.8, R * 0.45);
    ctx.lineTo(-R * 0.3, 0);
    ctx.lineTo(-R * 0.8, -R * 0.45);
    ctx.closePath();
  }, 0.2),
  chaser: (ctx, c) => neon(ctx, c, 5, () => poly(ctx, 3, R * 0.95)),
  swarmer: (ctx, c) => neon(ctx, c, 7, () => poly(ctx, 4, R * 0.8, Math.PI / 4), 0.3, 24),
  dasher: (ctx, c) => neon(ctx, c, 5, () => poly(ctx, 4, R, 0, 1, 0.55)),
  tank: (ctx, c) => {
    neon(ctx, c, 5, () => poly(ctx, 6, R * 0.95, Math.PI / 6));
    neon(ctx, c, 3, () => poly(ctx, 6, R * 0.5, Math.PI / 6), 0.1, 10);
  },
  splitter: (ctx, c) => {
    for (let k = 0; k < 3; k++) {
      const a = (Math.PI * 2 * k) / 3;
      neon(ctx, c, 4, () => circle(ctx, R * 0.42, Math.cos(a) * R * 0.45, Math.sin(a) * R * 0.45), 0.2, 14);
    }
  },
  shooter: (ctx, c) => {
    neon(ctx, c, 5, () => poly(ctx, 4, R * 0.75, Math.PI / 4));
    neon(ctx, c, 5, () => line(ctx, R * 0.3, 0, R, 0), 0, 12);
  },
  warden: (ctx, c) => neon(ctx, c, 5, () => poly(ctx, 5, R * 0.9, -Math.PI / 2), 0.2),
  bomber: (ctx, c) => {
    neon(ctx, c, 4, () => star(ctx, 8, R * 0.95, R * 0.6), 0.2, 16);
    neon(ctx, c, 3, () => circle(ctx, R * 0.28), 0.6, 10);
  },
  blinker: (ctx, c) => {
    neon(ctx, c, 4, () => poly(ctx, 3, R * 0.85, 0), 0.15, 14);
    neon(ctx, c, 4, () => poly(ctx, 3, R * 0.85, Math.PI), 0.15, 14);
  },
  elite: (ctx, c) => {
    neon(ctx, c, 6, () => poly(ctx, 3, R * 0.98), 0.2, 26);
    neon(ctx, c, 3, () => poly(ctx, 3, R * 0.55), 0.3, 10);
  },
  hive: (ctx, c) => {
    neon(ctx, c, 5, () => poly(ctx, 8, R, Math.PI / 8), 0.12, 26);
    neon(ctx, c, 2.5, () => poly(ctx, 6, R * 0.2), 0.2, 6);
    for (let k = 0; k < 6; k++) {
      const a = (Math.PI * 2 * k) / 6;
      ctx.save();
      ctx.translate(Math.cos(a) * R * 0.52, Math.sin(a) * R * 0.52);
      neon(ctx, c, 2.5, () => poly(ctx, 6, R * 0.2), 0.25, 6);
      ctx.restore();
    }
  },
  monolith: (ctx, c) => {
    neon(ctx, c, 6, () => poly(ctx, 4, R, 0, 1, 1), 0.12, 28);
    neon(ctx, c, 4, () => poly(ctx, 4, R * 0.62, Math.PI / 4), 0.15, 14);
    neon(ctx, c, 3, () => circle(ctx, R * 0.22), 0.6, 10);
  },
  bolt: (ctx, c) => neon(ctx, c, 6, () => line(ctx, -R * 0.9, 0, R * 0.9, 0), 0, 22),
  laser: (ctx, c) => neon(ctx, c, 8, () => line(ctx, -R * 0.95, 0, R * 0.95, 0), 0, 24),
  blade: (ctx, c) => neon(ctx, c, 4, () => {
    ctx.beginPath();
    ctx.moveTo(R, 0);
    ctx.quadraticCurveTo(0, R * 0.35, -R, 0);
    ctx.quadraticCurveTo(0, -R * 0.7, R, 0);
    ctx.closePath();
  }, 0.3),
  glaive: (ctx, c) => neon(ctx, c, 4, () => star(ctx, 4, R * 0.95, R * 0.3, 0), 0.3, 18),
  missile: (ctx, c) => neon(ctx, c, 4, () => {
    ctx.beginPath();
    ctx.moveTo(R * 0.9, 0);
    ctx.lineTo(-R * 0.6, R * 0.38);
    ctx.lineTo(-R * 0.35, 0);
    ctx.lineTo(-R * 0.6, -R * 0.38);
    ctx.closePath();
  }, 0.4, 16),
  mine: (ctx, c) => {
    neon(ctx, c, 4, () => poly(ctx, 6, R * 0.7, Math.PI / 6), 0.2, 14);
    neon(ctx, c, 3, () => circle(ctx, R * 0.22), 0.8, 10);
  },
  disc: (ctx, c) => {
    neon(ctx, c, 5, () => circle(ctx, R * 0.7), 0.15, 18);
    neon(ctx, c, 3, () => circle(ctx, R * 0.3), 0, 8);
  },
  drone: (ctx, c) => neon(ctx, c, 4, () => poly(ctx, 4, R * 0.7, 0, 1, 0.6), 0.35, 16),
  pellet: (ctx, c) => neon(ctx, c, 7, () => line(ctx, -R * 0.4, 0, R * 0.4, 0), 0, 16),
  ebullet: (ctx, c) => {
    neon(ctx, c, 6, () => circle(ctx, R * 0.55), 0.5, 24);
    neon(ctx, '#ffffff', 2, () => circle(ctx, R * 0.2), 0.9, 4);
  },
  gem: (ctx, c) => neon(ctx, c, 4, () => poly(ctx, 4, R * 0.62, 0, 0.75, 1), 0.45, 16),
  heal: (ctx, c) => neon(ctx, c, 5, () => {
    const a = R * 0.22, b = R * 0.7;
    ctx.beginPath();
    ctx.moveTo(-a, -b); ctx.lineTo(a, -b); ctx.lineTo(a, -a); ctx.lineTo(b, -a); ctx.lineTo(b, a);
    ctx.lineTo(a, a); ctx.lineTo(a, b); ctx.lineTo(-a, b); ctx.lineTo(-a, a); ctx.lineTo(-b, a);
    ctx.lineTo(-b, -a); ctx.lineTo(-a, -a);
    ctx.closePath();
  }, 0.35),
  vacuum: (ctx, c) => {
    neon(ctx, c, 5, () => circle(ctx, R * 0.85), 0.1, 20);
    neon(ctx, c, 6, () => {
      ctx.beginPath();
      ctx.arc(0, -R * 0.05, R * 0.42, Math.PI, 0);
      ctx.moveTo(-R * 0.42, -R * 0.05);
      ctx.lineTo(-R * 0.42, R * 0.45);
      ctx.moveTo(R * 0.42, -R * 0.05);
      ctx.lineTo(R * 0.42, R * 0.45);
    }, 0, 10);
  },
  cache: (ctx, c) => {
    neon(ctx, c, 5, () => poly(ctx, 4, R * 0.85, Math.PI / 4), 0.25, 24);
    neon(ctx, c, 4, () => line(ctx, -R * 0.6, 0, R * 0.6, 0), 0, 8);
    neon(ctx, c, 4, () => line(ctx, 0, -R * 0.6, 0, R * 0.6), 0, 8);
  },
  shield: (ctx, c) => neon(ctx, c, 3, () => circle(ctx, R * 0.98), 0, 12),
  /* a scorch mark left on the floor by big kills and blasts */
  scorch: ctx => {
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 9; k++) {
      const a = rnd() * Math.PI * 2, d = rnd() * R * 0.45, r = R * (0.45 + rnd() * 0.5);
      const g = ctx.createRadialGradient(Math.cos(a) * d, Math.sin(a) * d, 0, Math.cos(a) * d, Math.sin(a) * d, r);
      g.addColorStop(0, 'rgba(0,0,0,0.5)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-R * 1.5, -R * 1.5, R * 3, R * 3);
    }
  },
  /* the dark disc the ship sits on, soft-edged, so it stays visible in a
     crowd (drawn with normal blending) */
  disc_dark: ctx => {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 1.5);
    g.addColorStop(0, 'rgba(3,5,10,0.92)');
    g.addColorStop(0.6, 'rgba(3,5,10,0.8)');
    g.addColorStop(1, 'rgba(3,5,10,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-R * 1.6, -R * 1.6, R * 3.2, R * 3.2);
  },
  /* edge-of-screen marker pointing at something off screen */
  arrow: (ctx, c) => neon(ctx, c, 5, () => {
    ctx.beginPath();
    ctx.moveTo(R * 0.8, 0);
    ctx.lineTo(-R * 0.5, R * 0.6);
    ctx.lineTo(-R * 0.2, 0);
    ctx.lineTo(-R * 0.5, -R * 0.6);
    ctx.closePath();
  }, 0.5, 16),
  /* enemy bullet: dark core, hot rim - reads as a hole you must not touch
     against any amount of glow behind it */
  ebullet2: (ctx, c) => {
    neon(ctx, c, 7, () => circle(ctx, R * 0.6), 0, 26);
    ctx.fillStyle = '#12020a';
    circle(ctx, R * 0.42);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    circle(ctx, R * 0.5);
    ctx.stroke();
  },
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
  }
};

/* Digits for damage numbers: white with a dark outline, so they read over
   the glow. Drawn as atlas cells so a number is a few batched particles,
   not a text object. */
for (let d = 0; d < 10; d++) {
  SPRITES['d' + d] = ctx => {
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

export const ENEMY_SPRITES = ['chaser', 'swarmer', 'dasher', 'tank', 'splitter', 'shooter', 'warden',
  'bomber', 'blinker', 'elite', 'hive', 'monolith'];

/* [name, shape, colour] in cell order */
const LAYOUT = [
  ['player', 'player', COLORS.player],
  ['player_w', 'player', '#ffffff'],
  ['bastion', 'bastion', '#7dffb8'],
  ['bastion_w', 'bastion', '#ffffff'],
  ['specter', 'specter', '#d27aff'],
  ['specter_w', 'specter', '#ffffff'],
  ...ENEMY_SPRITES.flatMap(e => [[e, e, COLORS[e]], [e + '_w', e, '#ffffff'], [e + '_fill', e, 'fill']]),
  ['player_fill', 'player', 'fill'],
  ['bastion_fill', 'bastion', 'fill'],
  ['specter_fill', 'specter', 'fill'],
  ['disc_dark', 'disc_dark', '#000'],
  ['scorch', 'scorch', '#000'],
  ['arrow', 'arrow', '#ffffff'],
  ['ebullet2', 'ebullet2', COLORS.ebullet],
  ...['bolt', 'laser', 'blade', 'glaive', 'missile', 'mine', 'disc', 'drone', 'pellet', 'ebullet',
    'heal', 'vacuum', 'cache', 'shield'].map(n => [n, n, COLORS[n]]),
  ['gem1', 'gem', COLORS.gem1],
  ['gem5', 'gem', COLORS.gem5],
  ['gem25', 'gem', COLORS.gem25],
  ['spark', 'spark', '#fff'],
  ['dot', 'dot', '#fff'],
  ...Array.from({ length: 10 }, (_, d) => ['d' + d, 'd' + d, '#fff'])
];

function paint(ctx, shapes, layout, cell, perRow, reserved = new Set()) {
  const cells = {};
  let slot = 0;
  layout.forEach(([name, shape, color]) => {
    while (reserved.has(slot)) slot++;
    const i = slot++;
    const cx = (i % perRow) * cell, cy = Math.floor(i / perRow) * cell;
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx + 1, cy + 1, cell - 2, cell - 2);
    ctx.clip();
    ctx.translate(cx + cell / 2, cy + cell / 2);
    ctx.scale(cell / CELL, cell / CELL);
    /* 'fill' asks for the shape's dark silhouette */
    silhouette = color === 'fill' ? '#0b0e18' : null;
    shapes[shape](ctx, silhouette ? '#000' : color);
    silhouette = null;
    ctx.restore();
    cells[name] = { x: cx, y: cy, w: cell, h: cell };
  });
  return cells;
}

export function buildAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  /* 16 x 8 cells, less the four the ring block below takes */
  if (LAYOUT.length > 124) throw new Error('atlas full: ' + LAYOUT.length + ' cells');
  const cells = paint(ctx, SPRITES, LAYOUT, CELL, 16, new Set([110, 111, 126, 127]));

  /* The ring (nova, explosions, wells, telegraphs) takes a 256px block of
     its own at the bottom right. */
  const ring = { x: 2048 - 256, y: 1024 - 256, w: 256, h: 256 };
  ctx.save();
  ctx.translate(ring.x + 128, ring.y + 128);
  neon(ctx, '#ffffff', 6, () => circle(ctx, 108), 0, 18);
  ctx.restore();
  cells.ring = ring;

  const source = new CanvasSource({ resource: canvas, autoGenerateMipmaps: true, scaleMode: 'linear' });
  const base = new Texture({ source });
  const tex = {};
  for (const [name, c] of Object.entries(cells)) {
    tex[name] = new Texture({ source, frame: new Rectangle(c.x, c.y, c.w, c.h) });
  }
  return { canvas, cells, tex, base, R, ringRadius: 108, icons: buildIcons() };
}

/* ---------------------------------------------------------------- icons */

const GOLD = '#ffd84f';

const ICONS = {
  bolt: (ctx, c) => {
    for (const [y, l] of [[-14, 0.8], [0, 1], [14, 0.8]]) neon(ctx, c, 5, () => line(ctx, -R * l, y, R * l, y), 0, 14);
  },
  orbit: (ctx, c) => {
    for (let k = 0; k < 3; k++) {
      ctx.save();
      ctx.rotate((Math.PI * 2 * k) / 3);
      ctx.translate(R * 0.5, 0);
      ctx.scale(0.45, 0.45);
      ctx.rotate(Math.PI / 2);
      SPRITES.blade(ctx, c);
      ctx.restore();
    }
  },
  nova: (ctx, c) => {
    neon(ctx, c, 4, () => circle(ctx, R * 0.9), 0, 14);
    neon(ctx, c, 3, () => circle(ctx, R * 0.5), 0.2, 10);
  },
  chain: (ctx, c) => neon(ctx, c, 5, () => {
    ctx.beginPath();
    ctx.moveTo(-R * 0.8, -R * 0.8);
    ctx.lineTo(-R * 0.1, -R * 0.1);
    ctx.lineTo(-R * 0.45, R * 0.05);
    ctx.lineTo(R * 0.25, R * 0.75);
    ctx.lineTo(R * 0.05, R * 0.15);
    ctx.lineTo(R * 0.45, 0);
    ctx.lineTo(R * 0.8, -R * 0.6);
  }, 0, 14),
  glaive: (ctx, c) => SPRITES.glaive(ctx, c),
  missiles: (ctx, c) => {
    for (const [x, y] of [[-R * 0.3, -R * 0.35], [R * 0.2, R * 0.3]]) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-Math.PI / 4);
      ctx.scale(0.6, 0.6);
      SPRITES.missile(ctx, c);
      ctx.restore();
    }
  },
  laser: (ctx, c) => {
    neon(ctx, c, 6, () => line(ctx, -R * 0.8, R * 0.5, R * 0.9, -R * 0.4), 0, 18);
    neon(ctx, c, 3, () => circle(ctx, R * 0.25, -R * 0.8, R * 0.5), 0.5, 8);
  },
  mines: (ctx, c) => SPRITES.mine(ctx, c),
  flame: (ctx, c) => neon(ctx, c, 5, () => {
    ctx.beginPath();
    ctx.moveTo(0, R * 0.9);
    ctx.bezierCurveTo(-R * 0.9, R * 0.3, -R * 0.2, -R * 0.4, 0, -R * 0.95);
    ctx.bezierCurveTo(R * 0.25, -R * 0.4, R * 0.9, R * 0.3, 0, R * 0.9);
    ctx.closePath();
  }, 0.25),
  ricochet: (ctx, c) => {
    SPRITES.disc(ctx, c);
    neon(ctx, c, 3, () => {
      ctx.beginPath();
      ctx.moveTo(-R, R * 0.9);
      ctx.lineTo(-R * 0.4, -R * 0.6);
      ctx.lineTo(R * 0.2, R * 0.6);
      ctx.lineTo(R, -R * 0.9);
    }, 0, 8);
  },
  gravity: (ctx, c) => {
    for (const r of [0.9, 0.6, 0.3]) {
      neon(ctx, c, 3.5, () => {
        ctx.beginPath();
        ctx.arc(0, 0, R * r, r * 3, r * 3 + Math.PI * 1.4);
      }, 0, 10);
    }
  },
  drones: (ctx, c) => {
    for (const [x, y] of [[-R * 0.45, -R * 0.3], [R * 0.45, -R * 0.3], [0, R * 0.45]]) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(0.5, 0.5);
      SPRITES.drone(ctx, c);
      ctx.restore();
    }
  },
  scatter: (ctx, c) => {
    for (const a of [-0.5, -0.25, 0, 0.25, 0.5]) {
      neon(ctx, c, 4, () => line(ctx, -R * 0.7, 0, Math.cos(a) * R * 0.9, Math.sin(a) * R * 0.9), 0, 8);
    }
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
    circle(ctx, R * 0.85);
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
  p_vigor: (ctx, c) => SPRITES.heal(ctx, c),
  p_area: (ctx, c) => {
    for (const r of [0.3, 0.6, 0.9]) neon(ctx, c, 3.5, () => circle(ctx, R * r), 0, 10);
  },
  p_armor: (ctx, c) => neon(ctx, c, 5, () => {
    ctx.beginPath();
    ctx.moveTo(0, -R * 0.9);
    ctx.lineTo(R * 0.75, -R * 0.55);
    ctx.lineTo(R * 0.6, R * 0.35);
    ctx.lineTo(0, R * 0.9);
    ctx.lineTo(-R * 0.6, R * 0.35);
    ctx.lineTo(-R * 0.75, -R * 0.55);
    ctx.closePath();
  }, 0.2),
  p_regen: (ctx, c) => {
    for (const [x, y] of [[-R * 0.4, -R * 0.35], [R * 0.4, -R * 0.35], [0, R * 0.4]]) {
      ctx.save();
      ctx.translate(x, y);
      neon(ctx, c, 3, () => poly(ctx, 6, R * 0.3, Math.PI / 6), 0.3, 8);
      ctx.restore();
    }
  },
  p_amount: (ctx, c) => {
    for (const y of [-R * 0.45, 0, R * 0.45]) neon(ctx, c, 5, () => line(ctx, -R * 0.7, y, R * 0.7, y), 0, 12);
    neon(ctx, c, 4, () => line(ctx, R * 0.2, -R * 0.75, R * 0.2, R * 0.75), 0, 8);
  },
  p_growth: (ctx, c) => {
    SPRITES.gem(ctx, c);
    neon(ctx, c, 4, () => {
      ctx.beginPath();
      ctx.moveTo(R * 0.55, -R * 0.2);
      ctx.lineTo(R * 0.85, -R * 0.6);
      ctx.lineTo(R * 1.0, -R * 0.2);
    }, 0, 8);
  }
};

const ICON_LAYOUT = [
  ...['bolt', 'orbit', 'nova', 'chain', 'glaive', 'missiles', 'laser', 'mines', 'flame', 'ricochet',
    'gravity', 'drones', 'scatter'].flatMap(n => [
    ['w_' + n, n, COLORS[{ bolt: 'bolt', orbit: 'blade', nova: 'nova', chain: 'disc', glaive: 'glaive',
      missiles: 'missile', laser: 'laser', mines: 'mine', flame: 'mine', ricochet: 'disc', gravity: 'dasher',
      drones: 'drone', scatter: 'pellet' }[n]]],
    ['w_' + n + '_evo', n, GOLD]
  ]),
  ['p_might', 'p_might', '#ff7a8a'],
  ['p_haste', 'p_haste', '#ffd27a'],
  ['p_swift', 'p_swift', '#7affd8'],
  ['p_magnet', 'p_magnet', '#7ab8ff'],
  ['p_vigor', 'p_vigor', '#8aff7a'],
  ['p_area', 'p_area', '#d27aff'],
  ['p_armor', 'p_armor', '#b8c4d8'],
  ['p_regen', 'p_regen', '#5dffcf'],
  ['p_amount', 'p_amount', '#ffb84f'],
  ['p_growth', 'p_growth', '#5dff9a']
];

function buildIcons() {
  const cell = 96, perRow = 8;
  const rows = Math.ceil(ICON_LAYOUT.length / perRow);
  const canvas = document.createElement('canvas');
  canvas.width = cell * perRow;
  canvas.height = cell * rows;
  const cells = paint(canvas.getContext('2d'), ICONS, ICON_LAYOUT, cell, perRow);
  return { canvas, cells };
}

/** Draw an icon into a new small canvas, for the DOM. */
export function iconCanvas(icons, name, size = 96) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const cell = icons.cells[name] || icons.cells.w_bolt;
  c.getContext('2d').drawImage(icons.canvas, cell.x, cell.y, cell.w, cell.h, 0, 0, size, size);
  return c;
}

/** The icon name for a weapon def or a passive def. */
export function iconFor(def) {
  if (def.icon && def.icon.startsWith('p_')) return def.icon;
  return 'w_' + def.icon + (def.evolved ? '_evo' : '');
}
