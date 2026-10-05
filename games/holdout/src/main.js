/* HOLDOUT - boot, the run lifecycle and the frame loop. */
import { Application } from 'pixi.js';
import { Sim } from './sim/world.js';
import { EV } from './sim/events.js';
import { buildAtlas } from './render/atlas.js';
import { View } from './render/view.js';
import { Input } from './input.js';
import { Hud } from './ui/hud.js';
import { LevelUp, describe } from './ui/levelup.js';
import { Audio } from './audio.js';
import { Haptics } from './haptics.js';
import { load, store } from './save.js';

const $ = sel => document.querySelector(sel);
/* The simulation never steps further than this at once; a slow frame is
   split into several steps rather than letting enemies tunnel. */
const MAX_STEP = 1 / 60;

const game = {
  state: 'title',     /* title | run | over */
  sim: null,
  overAt: 0,
  freeze: 0,          /* hit-pause, real seconds left */
  slow: 0,            /* level-up slow-motion beat, real seconds left */
  save: load(),
  audio: new Audio(),
  haptics: new Haptics()
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
    game.audio.pick();
    game.haptics.buzz(12, true);
    game.sim.choose(i);
    if (!game.sim.choices) {
      levelUp.hide();
      input.setEnabled(true);
    }
  });
  Object.assign(game, { app, atlas, view, input, hud, levelUp });

  addEventListener('resize', () => view.resize());
  applySettings();
  for (const b of document.querySelectorAll('.toggle')) {
    b.addEventListener('click', () => {
      const k = b.dataset.setting;
      game.save.settings[k] = !game.save.settings[k];
      store(game.save);
      applySettings();
      game.audio.ui();
    });
  }
  /* any tap on a button gets a click */
  document.addEventListener('pointerdown', e => {
    if (e.target.closest('button') && !e.target.closest('.card')) game.audio.ui();
  });

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

  /* Bloom starts on and is dropped by watchPerf() if the frame rate cannot
     take it. */
  view.setBloom(game.save.settings.bloom !== 'off');
  app.ticker.add(t => frame(Math.min(t.deltaMS / 1000, 0.1)));
  $('#boot').classList.add('done');
  window.__ready = true;
}

function applySettings() {
  const st = game.save.settings;
  game.audio.setMuted(!st.sound);
  game.haptics.enabled = st.haptics;
  $('#fps').classList.toggle('on', !!st.fps);
  for (const b of document.querySelectorAll('.toggle')) b.classList.toggle('on', !!st[b.dataset.setting]);
  if (game.view) game.view.setBloom(st.bloom !== 'off' && !game.bloomDowngraded);
}

function start() {
  const { view, hud, input, levelUp } = game;
  game.audio.unlock();
  game.audio.startMusic();
  game.freeze = game.slow = 0;
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
  if (on) game.audio.stopMusic();
  else game.audio.startMusic();
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

/* Turn this frame's events into the things that are felt rather than seen:
   hit-pause, shake, vibration, the hurt flash and the surge banner. */
function react(sim) {
  const ev = sim.events, view = game.view, live = game.state === 'run';
  let small = 0;
  for (let i = 0; i < ev.count; i++) {
    const t = ev.type[i];
    if (t === EV.KILL) {
      if (ev.b[i] >= 20) {
        view.addTrauma(0.22);
        if (live) {
          game.freeze = Math.max(game.freeze, 0.045);
          game.haptics.buzz(18);
        }
      } else small++;
    } else if (t === EV.NOVA) {
      view.addTrauma(0.14);
    } else if (!live) {
      continue;
    } else if (t === EV.HURT) {
      view.addTrauma(0.38);
      game.freeze = Math.max(game.freeze, 0.06);
      game.haptics.buzz(35, true);
      const v = $('#vignette');
      v.classList.remove('hurt');
      void v.offsetWidth;
      v.classList.add('hurt');
    } else if (t === EV.LEVELUP) {
      view.addTrauma(0.2);
      game.haptics.buzz([18, 40, 18], true);
      /* a slow-motion beat before the cards come up */
      game.slow = 0.5;
      sim.holdChoices = true;
    } else if (t === EV.SURGE) {
      view.addTrauma(0.3);
      game.haptics.buzz([30, 60, 30], true);
      const b = $('#banner');
      b.textContent = 'INCOMING';
      b.classList.remove('on');
      void b.offsetWidth;
      b.classList.add('on');
    } else if (t === EV.PLAYER_DEATH) {
      view.addTrauma(1);
      game.freeze = 0.3;
      game.haptics.buzz([90, 50, 180], true);
    }
  }
  if (small) view.addTrauma(Math.min(0.06, small * 0.012));
}

/* Frame-time watch: if the device cannot hold the frame rate, bloom is the
   first thing to go. */
const perf = { acc: 0, frames: 0, slowFor: 0, shown: 0, fps: 60 };
function watchPerf(rawDt) {
  perf.acc += rawDt;
  perf.frames++;
  if (perf.acc < 0.5) return;
  perf.fps = perf.frames / perf.acc;
  perf.acc = 0;
  perf.frames = 0;
  if (game.state === 'run' && perf.fps < 45) perf.slowFor += 0.5;
  else perf.slowFor = Math.max(0, perf.slowFor - 0.5);
  if (perf.slowFor >= 3 && game.view.bloomOn && game.save.settings.bloom === 'auto') {
    game.bloomDowngraded = true;
    game.view.setBloom(false);
  }
  if (game.save.settings.fps) {
    const s = game.sim;
    $('#fps').textContent = `${perf.fps.toFixed(0)} fps\n${s.eCount} enemies  ${s.sPool.count} shots  ${s.gPool.count} gems\nbloom ${game.view.bloomOn ? 'on' : 'off'}`;
  }
}

const move = { x: 0, y: 0 };

function frame(rawDt) {
  const { sim, view, input, hud, levelUp } = game;
  sim.viewRadius = view.viewRadius;
  watchPerf(rawDt);

  /* Hit-pause stops the simulation outright; the level-up beat runs it at
     a fifth of the speed. Both are counted in real time. */
  let dt = rawDt;
  if (game.freeze > 0) {
    game.freeze -= rawDt;
    dt = 0;
  } else if (game.slow > 0) {
    game.slow -= rawDt;
    dt = rawDt * 0.2;
    if (game.slow <= 0) sim.holdChoices = false;
  }

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

  if (dt > 0) {
    const steps = Math.max(1, Math.ceil(dt / MAX_STEP));
    for (let i = 0; i < steps; i++) sim.step(dt / steps);
  }

  react(sim);
  view.consume(sim.events);
  if (game.state === 'run') game.audio.consume(sim.events);
  sim.events.clear();
  view.sync(sim, dt, rawDt);
  if (game.state === 'run') game.audio.setIntensity(Math.min(1, sim.eCount / 220 + sim.time / 900));

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
      game.audio.stopMusic();
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
