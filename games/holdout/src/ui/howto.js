/* HOLDOUT - the How to Play guide: four pages you swipe through (or step
   with NEXT), each with a picture drawn from the game's own sprites so
   what it shows is what you will see. The pages are a native scroll-snap
   strip, so swiping feels like any other phone carousel. */
import { iconCanvas } from '../render/atlas.js';

/* A mouse and keyboard rather than a touch screen: say so on page one. */
export const KEYS = typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches;

const PAGES = [
  {
    title: 'FLY',
    scene: 'fly',
    lines: [
      KEYS ? ['Steer with WASD or the arrow keys', ', or drag with the mouse. Esc pauses.']
        : ['Drag anywhere', ' on the screen to steer. Let go to stop.'],
      ['Your guns fire by themselves', ', ahead of you and behind you. There is no fire button.'],
      ['Keep moving.', ' Fly towards gaps and steer around the swarm.']
    ]
  },
  {
    title: 'GROW',
    scene: 'grow',
    lines: [
      ['Destroyed enemies drop gems.', ' Fly near them to collect them and fill the XP bar at the top.'],
      ['Every level, pick one of three cards:', ' a new weapon, a weapon upgrade, or a passive boost.'],
      ['A weapon at level 5 plus its partner passive', ' evolves. Look for the gold card.']
    ]
  },
  {
    title: 'SURVIVE',
    scene: 'survive',
    lines: [
      ['Last 15:00.', ' The arena changes at 5:00 and 9:30. THE HIVE arrives at 10:00; beat THE MONOLITH at 15:00 to win.'],
      ['Flashing enemies are about to strike.', ' Dodge red bullets.'],
      ['Pickups:', ' green cross repairs you, blue magnet pulls in every gem, gold box gives a free upgrade.']
    ]
  },
  {
    title: 'PROGRESS',
    scene: 'progress',
    lines: [
      ['Every run earns credits', ' to spend on permanent UPGRADES from the title screen.'],
      ['Play well to unlock', ' two more ships and five more weapons.'],
      ['Too hard?', ' Choose EASY on the title screen for a gentler swarm.']
    ]
  }
];

/* -- pictures --------------------------------------------------------- */

const W = 320, H = 150;

function sprite(ctx, atlas, name, x, y, size, rot = 0, alpha = 1) {
  const cell = atlas.cells[name];
  if (!cell) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.drawImage(atlas.canvas, cell.x, cell.y, cell.w, cell.h, -size / 2, -size / 2, size, size);
  ctx.restore();
}

/* An enemy as the game draws it: dark body under the neon outline. */
function enemy(ctx, atlas, name, x, y, size, rot = 0) {
  ctx.globalCompositeOperation = 'source-over';
  sprite(ctx, atlas, name + '_fill', x, y, size, rot);
  ctx.globalCompositeOperation = 'lighter';
  sprite(ctx, atlas, name, x, y, size, rot);
}

function label(ctx, text, x, y, color) {
  ctx.globalCompositeOperation = 'source-over';
  ctx.font = '700 11px Oxanium, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.globalCompositeOperation = 'lighter';
}

const SCENES = {
  fly(ctx, a) {
    /* the ship flying right, a stream of bolts ahead and one behind */
    for (const [x, y, r] of [[268, 58, 3.3], [292, 92, 3], [40, 70, 0.2], [18, 96, 0.1], [62, 112, -0.3]])
      enemy(ctx, a, 'chaser', x, y, 40, r);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) sprite(ctx, a, 'bolt', 185 + i * 22, 75 - i * 4.2, 26, -0.19, 1 - i * 0.12);
    for (let i = 0; i < 3; i++) sprite(ctx, a, 'bolt', 128 - i * 22, 78 + i * 3.6, 26, Math.PI - 0.16, 1 - i * 0.15);
    /* engine trail */
    for (let i = 1; i < 7; i++) sprite(ctx, a, 'dot', 160 - i * 9, 75, 14 - i, 0, 0.5 - i * 0.06);
    ctx.globalCompositeOperation = 'source-over';
    sprite(ctx, a, 'player_fill', 160, 75, 54);
    ctx.globalCompositeOperation = 'lighter';
    sprite(ctx, a, 'player', 160, 75, 54);
    label(ctx, 'AHEAD', 250, 24, '#7ff6ff');
    label(ctx, 'BEHIND', 62, 24, '#7ff6ff');
  },
  grow(ctx, a) {
    enemy(ctx, a, 'swarmer', 50, 62, 52, 0.4);
    ctx.globalCompositeOperation = 'lighter';
    for (const [x, y] of [[40, 104], [78, 90], [24, 72]]) sprite(ctx, a, 'spark', x, y, 22, x);
    const gems = [['gem1', 100, 92, 30], ['gem1', 122, 60, 30], ['gem5', 150, 96, 36], ['gem25', 180, 66, 42]];
    for (const [g, x, y, s] of gems) sprite(ctx, a, g, x, y, s);
    for (let i = 0; i < 5; i++) sprite(ctx, a, 'dot', 190 + i * 8, 80 - i * 1.5, 8, 0, 0.5 - i * 0.07);
    ctx.globalCompositeOperation = 'source-over';
    sprite(ctx, a, 'player_fill', 252, 78, 50, Math.PI);
    ctx.globalCompositeOperation = 'lighter';
    sprite(ctx, a, 'player', 252, 78, 50, Math.PI);
    /* the XP bar filling */
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(40, 132, 240, 6);
    ctx.fillStyle = '#5dff9a';
    ctx.shadowColor = '#5dff9a';
    ctx.shadowBlur = 8;
    ctx.fillRect(40, 132, 168, 6);
    ctx.shadowBlur = 0;
    label(ctx, 'XP', 26, 139, '#5dff9a');
  },
  survive(ctx, a) {
    enemy(ctx, a, 'hive', 56, 64, 96, 0.3);
    ctx.globalCompositeOperation = 'lighter';
    for (const [x, y, r] of [[110, 38, -0.4], [122, 66, 0], [112, 94, 0.4]]) sprite(ctx, a, 'ebullet', x, y, 22, r);
    enemy(ctx, a, 'elite', 166, 62, 52, 2.6);
    ctx.globalCompositeOperation = 'lighter';
    sprite(ctx, a, 'elite_w', 166, 62, 52, 2.6, 0.55);
    /* the pickups, in a column down the right with their names */
    const rows = [['heal', 32, 'REPAIR', '#5dff9a'], ['vacuum', 75, 'MAGNET', '#6fb7ff'], ['cache', 118, 'UPGRADE', '#ffd84f']];
    for (const [name, y, text, color] of rows) {
      sprite(ctx, a, name, 232, y, 36);
      label(ctx, text, 284, y + 4, color);
    }
    label(ctx, 'BOSS', 56, 136, '#ff3b6b');
    label(ctx, 'RED BULLETS', 116, 128, '#ff3b6b');
    label(ctx, 'FLASHING', 166, 104, '#ffd84f');
  },
  progress(ctx, a) {
    const ships = [['player', 70, 'VANGUARD', '#7ff6ff'], ['bastion', 160, 'BASTION', '#7dffb8'], ['specter', 250, 'SPECTER', '#d27aff']];
    for (const [s, x, name, color] of ships) {
      ctx.globalCompositeOperation = 'source-over';
      sprite(ctx, a, s + '_fill', x, 64, 62, -Math.PI / 2);
      ctx.globalCompositeOperation = 'lighter';
      sprite(ctx, a, s, x, 64, 62, -Math.PI / 2);
      label(ctx, name, x, 120, color);
    }
  }
};

function picture(atlas, scene) {
  const c = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  c.width = W * dpr;
  c.height = H * dpr;
  c.className = 'pic';
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.globalCompositeOperation = 'lighter';
  SCENES[scene](ctx, atlas);
  return c;
}

/* -- the overlay ------------------------------------------------------ */

export class HowTo {
  constructor(root, atlas, onClose) {
    this.root = root;
    this.onClose = onClose;
    this.track = root.querySelector('.track');
    this.dots = root.querySelector('.dots');
    this.next = root.querySelector('.next');
    this.page = 0;
    PAGES.forEach((p, i) => {
      const page = document.createElement('section');
      page.className = 'page';
      const t = document.createElement('div');
      t.className = 'title';
      t.textContent = p.title;
      const step = document.createElement('div');
      step.className = 'step';
      step.textContent = `${i + 1} / ${PAGES.length}`;
      const ul = document.createElement('ul');
      for (const [bold, rest] of p.lines) {
        const li = document.createElement('li');
        const b = document.createElement('b');
        b.textContent = bold;
        li.append(b, rest);
        ul.append(li);
      }
      page.append(step, t, picture(atlas, p.scene));
      /* the Grow page shows real level-up card icons */
      if (p.scene === 'grow') {
        const row = document.createElement('div');
        row.className = 'cards-mini';
        for (const icon of ['w_orbit', 'p_might', 'w_bolt_evo']) row.append(iconCanvas(atlas.icons, icon, 44));
        page.append(row);
      }
      page.append(ul);
      this.track.append(page);
      const d = document.createElement('i');
      d.addEventListener('click', () => this.go(i));
      this.dots.append(d);
    });
    this.track.addEventListener('scroll', () => {
      const i = Math.round(this.track.scrollLeft / Math.max(1, this.track.clientWidth));
      if (i !== this.page) this.mark(i);
    }, { passive: true });
    this.next.addEventListener('click', () => {
      if (this.page < PAGES.length - 1) this.go(this.page + 1);
      else this.close();
    });
    root.querySelector('.skip').addEventListener('click', () => this.close());
    this.mark(0);
  }

  get open() { return this.root.classList.contains('on'); }

  show() {
    this.root.classList.add('on');
    this.track.scrollLeft = 0;
    this.mark(0);
  }

  close() {
    if (!this.open) return;
    this.root.classList.remove('on');
    this.onClose();
  }

  go(i) {
    this.track.scrollTo({ left: i * this.track.clientWidth, behavior: 'smooth' });
    this.mark(i);
  }

  mark(i) {
    this.page = Math.max(0, Math.min(PAGES.length - 1, i));
    this.dots.querySelectorAll('i').forEach((d, k) => d.classList.toggle('on', k === this.page));
    const last = this.page === PAGES.length - 1;
    this.next.textContent = last ? 'GOT IT' : 'NEXT';
    this.root.querySelector('.skip').style.visibility = last ? 'hidden' : 'visible';
  }
}
