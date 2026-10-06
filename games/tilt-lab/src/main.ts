/* TILT LAB - boot, screens and the frame loop. */
import { Lab, S } from './core/physics.ts';
import type { LabEvent } from './core/physics.ts';
import { Input } from './core/input.ts';
import { Renderer, drawBall } from './render/renderer.ts';
import { Particles } from './effects/particles.ts';
import { CONFETTI, LOOKS } from './render/palette.ts';
import { AudioManager } from './audio/audioManager.ts';
import { KINDS } from './entities/types.ts';
import type { Pt } from './entities/types.ts';
import { LEVELS, WORLDS, DEMO, levelIndex, place, firstOf } from './levels/levelLoader.ts';
import { load, store } from './save.ts';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const TOUCH = matchMedia('(pointer: coarse)').matches;

type Mode = 'title' | 'play' | 'paused' | 'levels' | 'clear' | 'intro';

const save = load();
const canvas = $<HTMLCanvasElement>('#stage');
const renderer = new Renderer(canvas);
const input = new Input(canvas);
const audio = new AudioManager();
const particles = new Particles();

const game = {
  mode: 'title' as Mode,
  index: levelIndex(save.last),
  lab: new Lab(DEMO),
  demo: true,
  shake: 0,
  clearAt: 0,
  levelsFrom: 'title' as Mode,
  /* the world shown in level select */
  page: 0,
  t: 0
};

/* ---------------------------------------------------------------- layout */

/* The chamber fills the space the screens leave free. On the title, the
   menu sits beside the demo lab in landscape and below it in portrait. */
function layout() {
  const W = innerWidth, H = innerHeight, portrait = H > W;
  document.body.classList.toggle('portrait', portrait);
  if (game.mode === 'title') {
    const panel = $('#title .panel').getBoundingClientRect();
    if (portrait) renderer.resize(W, H, 16 + safe('t'), panel.height + 24 + safe('b'));
    else renderer.resize(W, H, 16 + safe('t'), 16 + safe('b'), 0, Math.min(W * 0.5, panel.width + 40));
  } else {
    renderer.resize(W, H, 70 + safe('t'), (TOUCH && portrait ? 130 : 64) + safe('b'));
  }
}
function safe(side: 't' | 'b'): number {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--safe-' + side);
  return parseFloat(v) || 0;
}

/* ---------------------------------------------------------------- levels */

function startLevel(i: number, intro = true) {
  game.index = Math.max(0, Math.min(LEVELS.length - 1, i));
  const def = LEVELS[game.index], { w, n } = place(game.index);
  game.lab = new Lab(def);
  game.demo = false;
  renderer.setLook(LOOKS[w % LOOKS.length]);
  renderer.setLab(game.lab);
  particles.list.length = 0;
  save.last = def.id;
  store(save);
  $('#hud .num').textContent = `${w + 1}-${n + 1}`;
  $('#hud .name').textContent = def.name;
  /* entering a world for the first time: meet its new idea */
  if (intro && n === 0 && !save.worlds.includes(w)) {
    showWorldIntro(w);
    return;
  }
  if (intro) {
    const el = $('#intro');
    el.querySelector('.n')!.textContent = `LEVEL ${w + 1}-${n + 1}`;
    el.querySelector('.t')!.textContent = def.name;
    el.querySelector('.h')!.textContent = def.hint || '';
    el.classList.remove('go');
    void el.offsetWidth;
    el.classList.add('go');
  }
  setMode('play');
}

/** Instant restart: a fresh lab, a white blink. */
function reset() {
  if (game.mode !== 'play' && game.mode !== 'clear') return;
  audio.ui();
  startLevel(game.index, false);
  const f = $('#flash');
  f.classList.remove('go');
  void f.offsetWidth;
  f.classList.add('go');
}

function setMode(m: Mode) {
  const prev = game.mode;
  game.mode = m;
  $('#title').classList.toggle('on', m === 'title');
  $('#levels').classList.toggle('on', m === 'levels');
  $('#paused').classList.toggle('on', m === 'paused');
  $('#clear').classList.toggle('on', m === 'clear');
  $('#worldintro').classList.toggle('on', m === 'intro');
  $('#hud').classList.toggle('on', m === 'play' || m === 'paused' || m === 'clear');
  $('#pads').classList.toggle('on', m === 'play');
  input.enabled = m === 'play';
  if (m !== 'play') input.clear();
  if (m === 'title' || prev === 'title') layout();
  if (m === 'title') {
    game.demo = true;
    game.lab = new Lab(DEMO);
    renderer.setLook(LOOKS[0]);
    renderer.setLab(game.lab);
  }
  if (m === 'levels') renderLevels();
  if (m === 'paused') syncToggles();
}

/* --------------------------------------------------------------- screens */

/** The first-time card for a world: its name, its balls, its idea. */
function showWorldIntro(w: number) {
  const W = WORLDS[w], el = $('#worldintro');
  el.querySelector('.wnum')!.textContent = `WORLD ${w + 1}`;
  el.querySelector('.wtitle')!.textContent = W.intro.title;
  el.querySelector('.wtext')!.textContent = W.intro.text;
  const c = el.querySelector('canvas') as HTMLCanvasElement, ctx = c.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, c.width, c.height);
  const n = W.intro.balls.length, gap = 120;
  W.intro.balls.forEach((colour, k) => {
    ctx.setTransform(1.15, 0, 0, 1.15, c.width / 2 + (k - (n - 1) / 2) * gap, c.height / 2);
    drawBall(ctx, { colour, x: 0, y: 0, angle: 0.4 + k }, [-0.5, -0.86]);
  });
  setMode('intro');
}

function renderLevels() {
  const grid = $('#levels .grid'), w = game.page, W = WORLDS[w];
  grid.replaceChildren();
  $('#levels .world-name').textContent = `WORLD ${w + 1} · ${W.name}`;
  ($('#levels .wprev') as HTMLButtonElement).disabled = w === 0;
  ($('#levels .wnext') as HTMLButtonElement).disabled = w === WORLDS.length - 1;
  const dots = $('#levels .world-dots');
  dots.replaceChildren(...WORLDS.map((_, k) => { const i = document.createElement('i'); if (k === w) i.className = 'on'; return i; }));
  const base = firstOf(w);
  const worldOpen = base === 0 || save.done.includes(LEVELS[base - 1].id) || W.levels.some(l => save.done.includes(l.id));
  $('#levels .world-lock').textContent = worldOpen ? '' : `Clear World ${w} to open ${W.name}`;
  const tints = [
    ['#ffe45c', '#ffb31f', '#d98200'], ['#ff7aa8', '#ff2d55', '#b8002e'], ['#7ae0ff', '#1fb6ff', '#0062d6'],
    ['#a8ff7a', '#5dea2a', '#1f9d1a'], ['#d6a8ff', '#a347ff', '#5d14c9'], ['#ffc27a', '#ff8a1f', '#d14d00']
  ];
  W.levels.forEach((l, n) => {
    const i = base + n;
    const open = i === 0 || save.done.includes(LEVELS[i - 1].id) || save.done.includes(l.id);
    const b = document.createElement('button');
    const [a, bb, d] = tints[(n + w) % tints.length];
    b.className = 'tile' + (open ? '' : ' locked') + (save.done.includes(l.id) ? ' done' : '');
    b.style.setProperty('--a', a);
    b.style.setProperty('--b', bb);
    b.style.setProperty('--d', d);
    b.innerHTML = `${w + 1}-${n + 1}<small></small>`;
    b.querySelector('small')!.textContent = l.name;
    if (open) b.addEventListener('click', () => { audio.unlock(); audio.ui(); startLevel(i); });
    grid.append(b);
  });
}

function syncToggles() {
  for (const b of document.querySelectorAll<HTMLButtonElement>('.toggle')) {
    const k = b.dataset.setting as 'sound' | 'music' | 'motion';
    b.classList.toggle('on', k === 'motion' ? input.motion : !!save[k]);
  }
  $('.motion-toggle').hidden = !(TOUCH && input.motionAvailable);
  $('#hud .motion').classList.toggle('avail', TOUCH && input.motionAvailable);
  $('#hud .motion').classList.toggle('on', input.motion);
}

async function toggleMotion() {
  if (input.motion) {
    input.disableMotion();
    save.motion = false;
  } else {
    save.motion = await input.enableMotion();
    if (!save.motion) hint('Phone tilt is not available here', 2500);
    else hint('Phone tilt on: hold the phone level, then tilt', 2600);
  }
  store(save);
  syncToggles();
}

let hintTimer = 0;
function hint(text: string, ms = 0) {
  const h = $('#hint');
  h.textContent = text;
  h.classList.add('on');
  clearTimeout(hintTimer);
  if (ms) hintTimer = window.setTimeout(() => h.classList.remove('on'), ms);
}

/* ---------------------------------------------------------------- events */

function react(ev: LabEvent) {
  const lab = game.lab, live = !game.demo;
  switch (ev.t) {
    case 'impact':
      if (live) audio.impact(ev.power, ev.colour);
      if (ev.power > 9) {
        game.shake = Math.max(game.shake, Math.min(1, (ev.power - 9) / 14));
        particles.burst(ev.x, ev.y, [KINDS[ev.colour].light, '#ffffff'], 6, 160, ['dot']);
      }
      break;
    case 'press':
      if (live) audio.press();
      particles.ring(ev.x, ev.y, '#ff3d9a', 14, 0.45);
      break;
    case 'release':
      if (live) audio.release();
      break;
    case 'gate':
      if (live) audio.gate(ev.open);
      break;
    case 'home':
      if (live) audio.home(ev.colour);
      particles.ring(ev.x, ev.y, KINDS[ev.colour].fill, 26, 0.6);
      particles.burst(ev.x, ev.y, [KINDS[ev.colour].fill, KINDS[ev.colour].light, '#ffffff'], 16, 420, ['star', 'dot']);
      break;
    case 'away':
      if (live) audio.away();
      break;
    case 'won':
      if (!live) break;
      audio.won();
      for (const t of lab.targets) {
        particles.ring(t.rest[0], t.rest[1], KINDS[t.def.colour].fill, 30, 0.8);
        particles.ring(t.rest[0], t.rest[1], '#ffffff', 10, 0.6);
        particles.burst(t.rest[0], t.rest[1], CONFETTI, 70, 1150);
      }
      game.shake = 0.4;
      if (!save.done.includes(lab.level.id)) save.done.push(lab.level.id);
      store(save);
      game.clearAt = game.t + 0.85;
      break;
    case 'lost':
      if (live) audio.lost();
      particles.burst(ev.x, ev.y, [KINDS[ev.colour].fill, KINDS[ev.colour].dark, KINDS[ev.colour].light], 22, 420, ['shard', 'dot']);
      particles.ring(ev.x, ev.y, KINDS[ev.colour].fill, 20, 0.5);
      game.shake = 0.6;
      break;
  }
}

/* ------------------------------------------------------------ the loop */

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.t += dt;
  const lab = game.lab;

  if (game.demo) {
    /* the title screen's lab tilts itself, slowly */
    lab.input = Math.sin(game.t * 0.55) * 0.85;
    if (lab.state !== 'play' || lab.time > 16) {
      game.lab = new Lab(DEMO);
      renderer.setLab(game.lab);
    }
  } else if (game.mode === 'play') {
    lab.input = input.read(dt);
  } else {
    lab.input = 0;
  }

  if (game.mode !== 'paused' && game.mode !== 'levels') game.lab.advance(dt);
  for (const ev of game.lab.events.splice(0)) react(ev);

  /* a lost ball restarts the level by itself, after a beat */
  if (!game.demo && game.lab.state === 'lost' && game.lab.since > 0.65 && game.mode === 'play') reset();
  if (!game.demo && game.lab.state === 'won' && game.mode === 'play' && game.t >= game.clearAt) showClear();

  /* rolling sound */
  let roll = 0, heavy = 0;
  if (!game.demo) {
    for (const b of game.lab.balls) {
      if (b.lost || !b.touching) continue;
      const a = Math.min(1, b.speed / 650);
      roll += a;
      if (b.colour === 'red') heavy = Math.max(heavy, a);
    }
  }
  audio.roll(game.mode === 'play' ? Math.min(1, roll) : 0, heavy);
  audio.update();

  const g = game.lab.gravity();
  particles.update(dt, [g[0] * S * 0.45, g[1] * S * 0.45]);
  game.shake = Math.max(0, game.shake - dt * 2.5);
  const sh: Pt = game.shake > 0
    ? [(Math.random() - 0.5) * 14 * game.shake * game.shake, (Math.random() - 0.5) * 14 * game.shake * game.shake] : [0, 0];
  const rot = !game.demo && input.motionSteering ? 0 : game.lab.angle;
  renderer.draw(rot, game.t, particles, sh);
  if (game.mode === 'play' || game.mode === 'paused') drawGauge();
  requestAnimationFrame(frame);
}

/** The tilt indicator: a little level that tips with the lab. */
function drawGauge() {
  const ctx = renderer.ctx, d = renderer.dpr, lab = game.lab;
  const x = innerWidth / 2, y = innerHeight - safe('b') - (TOUCH ? 52 : 30);
  ctx.setTransform(d, 0, 0, d, x * d, y * d);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.roundRect(-64, -18, 128, 36, 18);
  ctx.fill();
  ctx.rotate(lab.angle);
  const k = lab.angle / (24 * Math.PI / 180);
  ctx.strokeStyle = Math.abs(k) > 0.05 ? '#ff3d9a' : '#a347ff';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-44, 4);
  ctx.lineTo(44, 4);
  ctx.stroke();
  ctx.fillStyle = '#ffd21f';
  ctx.beginPath();
  ctx.arc(k * 30, -4, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function showClear() {
  $('#hint').classList.remove('on');
  const { w, n } = place(game.index);
  const final = game.index >= LEVELS.length - 1, worldEnd = n === WORLDS[w].levels.length - 1;
  $('#clear .lname').textContent = final ? 'EVERY LAB CLEARED'
    : worldEnd ? `WORLD ${w + 1} · ${WORLDS[w].name} COMPLETE` : `LEVEL ${w + 1}-${n + 1} · ${game.lab.level.name}`;
  $('#clear h2').textContent = final ? 'LAB COMPLETE!' : worldEnd ? 'WORLD CLEAR!' : 'LAB CLEAR!';
  $('#clear .next').textContent = final ? 'LEVELS' : worldEnd ? 'NEXT WORLD' : 'NEXT';
  setMode('clear');
}

function next() {
  audio.ui();
  if (game.index >= LEVELS.length - 1) { game.levelsFrom = 'title'; game.page = place(game.index).w; setMode('levels'); }
  else startLevel(game.index + 1);
}

function pause(on: boolean) {
  if (on && game.mode === 'play') { audio.ui(); setMode('paused'); }
  else if (!on && game.mode === 'paused') { audio.ui(); setMode('play'); }
}

/* ---------------------------------------------------------------- boot */

async function boot() {
  await Promise.race([
    document.fonts ? document.fonts.load('700 30px Fredoka') : Promise.resolve(),
    new Promise(r => setTimeout(r, 1200))
  ]).catch(() => {});
  layout();
  renderer.setLab(game.lab);
  addEventListener('resize', layout);
  addEventListener('orientationchange', () => setTimeout(layout, 200));

  document.body.classList.toggle('touch', TOUCH);
  input.bindPad($('#pads .tilt-l'), -1);
  input.bindPad($('#pads .tilt-r'), 1);
  $('#title .keys').textContent = TOUCH ? 'Hold the arrows or drag to tilt' : 'A / D or ← → to tilt · R restarts';
  const first = () => { audio.unlock(); audio.setMuted(!save.sound); if (save.music) audio.startMusic(); };
  $('#title .play').addEventListener('click', () => {
    first();
    /* continue from the first lab not yet cleared */
    const open = LEVELS.findIndex(l => !save.done.includes(l.id));
    startLevel(open < 0 ? levelIndex(save.last) : open);
    if (game.index === 0 && !save.done.length) hint(TOUCH ? 'Hold an arrow, or drag, to tilt the lab' : 'Hold A / D or ← → to tilt the lab');
  });
  for (const b of document.querySelectorAll('.levels-open')) {
    b.addEventListener('click', () => {
      first();
      audio.ui();
      game.levelsFrom = game.mode;
      game.page = game.mode === 'title' ? place(levelIndex(save.last)).w : place(game.index).w;
      setMode('levels');
    });
  }
  const page = (d: number) => {
    const p = Math.max(0, Math.min(WORLDS.length - 1, game.page + d));
    if (p === game.page) return;
    game.page = p;
    audio.ui();
    renderLevels();
  };
  $('#levels .wprev').addEventListener('click', () => page(-1));
  $('#levels .wnext').addEventListener('click', () => page(1));
  /* swipe between worlds */
  let sx = -1;
  $('#levels .grid').addEventListener('pointerdown', e => { sx = e.clientX; });
  $('#levels .grid').addEventListener('pointerup', e => {
    if (sx >= 0 && Math.abs(e.clientX - sx) > 50) page(e.clientX < sx ? 1 : -1);
    sx = -1;
  });
  $('#worldintro .go').addEventListener('click', () => {
    audio.ui();
    const w = place(game.index).w;
    if (!save.worlds.includes(w)) save.worlds.push(w);
    store(save);
    startLevel(game.index);
  });
  $('#levels .back').addEventListener('click', () => { audio.ui(); setMode(game.levelsFrom === 'paused' ? 'paused' : 'title'); });
  $('#hud .reset').addEventListener('click', reset);
  $('#hud .pause').addEventListener('click', () => pause(true));
  $('#hud .motion').addEventListener('click', () => { audio.unlock(); toggleMotion(); });
  $('#paused .resume').addEventListener('click', () => pause(false));
  $('#paused .restart').addEventListener('click', () => { setMode('play'); reset(); });
  $('#clear .next').addEventListener('click', next);
  $('#clear .replay').addEventListener('click', () => { setMode('play'); reset(); });
  for (const b of document.querySelectorAll<HTMLButtonElement>('.toggle')) {
    b.addEventListener('click', () => {
      const k = b.dataset.setting as 'sound' | 'music' | 'motion';
      if (k === 'motion') { toggleMotion(); return; }
      save[k] = !save[k];
      store(save);
      audio.setMuted(!save.sound);
      if (k === 'music') save.music ? audio.startMusic() : audio.stopMusic();
      audio.ui();
      syncToggles();
    });
  }
  input.onReset = () => { if (game.mode === 'play' || game.mode === 'clear') { if (game.mode === 'clear') setMode('play'); reset(); } };
  input.onPause = () => {
    if (game.mode === 'play') pause(true);
    else if (game.mode === 'paused') pause(false);
  };
  input.onFirstTilt = () => $('#hint').classList.remove('on');
  addEventListener('keydown', e => {
    if (game.mode === 'clear' && (e.key === 'Enter' || e.key === ' ')) next();
    if (game.mode === 'intro' && (e.key === 'Enter' || e.key === ' ')) $<HTMLButtonElement>('#worldintro .go').click();
    if (game.mode === 'title' && (e.key === 'Enter' || e.key === ' ')) $('#title .play').click();
  });
  canvas.addEventListener('pointerdown', () => audio.unlock());
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(true); });
  syncToggles();

  $('#boot').classList.add('done');
  (window as any).__ready = true;
  requestAnimationFrame(t => { last = t; frame(t); });
}

/* for tools/verify.cjs */
(window as any).__game = { game, input, renderer, save, startLevel, LEVELS, WORLDS, Lab, place };

boot().catch(e => {
  console.error(e);
  $('#boot').textContent = 'COULD NOT START';
});
