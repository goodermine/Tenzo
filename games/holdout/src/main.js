/* HOLDOUT - boot, the run lifecycle and the frame loop. */
import { Application } from 'pixi.js';
import { Sim } from './sim/world.js';
import { EV } from './sim/events.js';
import { buildAtlas } from './render/atlas.js';
import { View } from './render/view.js';
import { Input } from './input.js';
import { Hud } from './ui/hud.js';
import { LevelUp, describe } from './ui/levelup.js';

const $ = sel => document.querySelector(sel);
/* The simulation never steps further than this at once; a slow frame is
   split into several steps rather than letting enemies tunnel. */
const MAX_STEP = 1 / 60;

const game = {
  state: 'title',     /* title | run | over */
  sim: null,
  overAt: 0
};

async function boot() {
  const app = new Application();
  await app.init({
    resizeTo: window,
    background: '#05070d',
    antialias: false,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
    preference: 'webgl',
    powerPreference: 'high-performance'
  });
  $('#stage').appendChild(app.canvas);

  const atlas = buildAtlas();
  const view = new View(app, atlas);
  const input = new Input($('#touch'), $('#stick-base'), $('#stick-knob'));
  const hud = new Hud($('#hud'));
  const levelUp = new LevelUp($('#levelup'), atlas, i => {
    game.sim.choose(i);
    if (!game.sim.choices) {
      levelUp.hide();
      input.setEnabled(true);
    }
  });
  Object.assign(game, { app, atlas, view, input, hud, levelUp });

  addEventListener('resize', () => view.resize());

  $('#title .start').addEventListener('click', start);
  $('#over .again').addEventListener('click', start);
  $('#hud .pause').addEventListener('click', () => setPaused(true));
  $('#paused .resume').addEventListener('click', () => setPaused(false));
  $('#paused .quit').addEventListener('click', () => {
    setPaused(false);
    game.sim.over = true;
  });
  /* Backgrounded - a call, the home button - pauses the run. */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.state === 'run' && game.sim.running) setPaused(true);
  });

  /* Behind the title screen, a quiet demo field of drifting enemies. */
  game.sim = new Sim({ seed: 12345 });
  view.reset(game.sim);

  app.ticker.add(t => frame(Math.min(t.deltaMS / 1000, 0.1)));
  $('#boot').classList.add('done');
  window.__ready = true;
}

function start() {
  const { view, hud, input, levelUp } = game;
  game.sim = new Sim({ seed: (Date.now() ^ (Math.random() * 1e9)) >>> 0 });
  game.sim.viewRadius = view.viewRadius;
  view.reset(game.sim);
  levelUp.hide();
  $('#title').classList.remove('on');
  $('#over').classList.remove('on');
  $('#paused').classList.remove('on');
  hud.show(true);
  input.setEnabled(true);
  game.state = 'run';
}

function setPaused(on) {
  const sim = game.sim;
  if (game.state !== 'run' || sim.over) return;
  sim.userPaused = on;
  $('#paused').classList.toggle('on', on);
  if (on) renderLoadout($('#paused .loadout'), sim);
  game.input.setEnabled(!on && !sim.choices);
}

function renderLoadout(el, sim) {
  el.replaceChildren();
  const add = (icon, label) => {
    const item = document.createElement('div');
    item.className = 'item';
    const c = document.createElement('canvas');
    c.width = c.height = 56;
    const cell = game.atlas.cells[icon];
    c.getContext('2d').drawImage(game.atlas.canvas, cell.x, cell.y, cell.w, cell.h, 0, 0, 56, 56);
    item.append(c, label);
    el.append(item);
  };
  for (const w of sim.weapons) add('i_' + w.def.icon, `LV ${w.level}`);
  for (const p of sim.passives) add(p.def.icon, `LV ${p.level}`);
}

function showResults(sim) {
  const t = Math.floor(sim.time);
  const stats = [
    [`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, 'SURVIVED'],
    [sim.p.kills, 'KILLS'],
    [sim.p.level, 'LEVEL'],
    [Math.round(sim.p.damageTaken), 'DAMAGE TAKEN']
  ];
  const el = $('#over .stats');
  el.replaceChildren();
  for (const [v, label] of stats) {
    const d = document.createElement('div');
    d.className = 'stat';
    d.innerHTML = '<b></b><span></span>';
    d.querySelector('b').textContent = v;
    d.querySelector('span').textContent = label;
    el.append(d);
  }
  renderLoadout($('#over .loadout'), sim);
  $('#over').classList.add('on');
}

const move = { x: 0, y: 0 };

function frame(dt) {
  const { sim, view, input, hud, levelUp } = game;
  sim.viewRadius = view.viewRadius;

  if (game.state === 'run') {
    input.read(move);
    sim.move.x = move.x;
    sim.move.y = move.y;
  } else if (game.state === 'title') {
    sim.move.x = Math.cos(sim.time * 0.3) * 0.5;
    sim.move.y = Math.sin(sim.time * 0.21) * 0.5;
    /* the demo ship cannot die or level, it is scenery */
    sim.p.hp = sim.p.maxHp;
    if (sim.choices) sim.choose(0);
  }

  const steps = Math.max(1, Math.ceil(dt / MAX_STEP));
  for (let i = 0; i < steps; i++) sim.step(dt / steps);

  /* hurt flash on the vignette, from this frame's events */
  for (let i = 0; i < sim.events.count; i++) {
    if (sim.events.type[i] === EV.HURT) {
      const v = $('#vignette');
      v.classList.remove('hurt');
      void v.offsetWidth;
      v.classList.add('hurt');
      break;
    }
  }
  view.consume(sim.events);
  sim.events.clear();
  view.sync(sim, dt);

  if (game.state !== 'run') return;
  hud.update(sim);

  if (sim.choices && !sim.over) {
    input.setEnabled(false);
    levelUp.show(sim.choices, sim.p.level);
  }
  if (sim.over) {
    levelUp.hide();
    input.setEnabled(false);
    if (!game.overAt) game.overAt = performance.now();
    /* a beat to watch the ship go before the results come up */
    if (performance.now() - game.overAt > 1300) {
      game.state = 'over';
      game.overAt = 0;
      hud.show(false);
      showResults(sim);
    }
  }
}

/* For tools/verify.cjs. */
window.__game = game;
window.__describe = describe;

boot().catch(e => {
  console.error(e);
  $('#boot').textContent = 'COULD NOT START: ' + e.message;
});
