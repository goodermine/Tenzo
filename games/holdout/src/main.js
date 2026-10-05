/* HOLDOUT - boot, the run lifecycle and the frame loop. */
import { Application } from 'pixi.js';
import { Sim } from './sim/world.js';
import { EV } from './sim/events.js';
import { buildAtlas, iconCanvas, iconFor } from './render/atlas.js';
import { ENEMIES } from './content/enemies.js';
import { ZONES } from './render/background.js';
import { View } from './render/view.js';
import { Input } from './input.js';
import { Hud } from './ui/hud.js';
import { LevelUp, describe } from './ui/levelup.js';
import { Audio } from './audio.js';
import { Haptics } from './haptics.js';
import { load, store } from './save.js';
import { renderShips, renderShop } from './ui/menu.js';
import { settleRun, lockedWeapons } from './content/meta.js';
import { CHARACTERS, CHARACTER_INDEX } from './content/characters.js';
import { WEAPONS, WEAPON_INDEX } from './content/weapons.js';

const $ = sel => document.querySelector(sel);
/* The simulation never steps further than this at once; a slow frame is
   split into several steps rather than letting enemies tunnel. */
const MAX_STEP = 1 / 60;

const game = {
  state: 'title',     /* title | run | over */
  sim: null,
  overAt: 0,
  freeze: 0,          /* hit-pause, real seconds left */
  slow: 0,            /* slow-motion beat, real seconds left */
  slowRate: 0.2,      /* ...and how slow */
  save: load(),
  /* quality tier: 0 everything, 1 no bloom, 2 half the particles,
     3 render at 1x pixel density */
  tier: 0,
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

  /* The atlas bakes the damage-number digits, so give the display face a
     moment to arrive first; offline it falls back to the system font. */
  await Promise.race([
    document.fonts ? document.fonts.load('800 92px Oxanium') : Promise.resolve(),
    new Promise(r => setTimeout(r, 1500))
  ]).catch(() => {});
  const atlas = buildAtlas();
  const view = new View(app, atlas);
  const input = new Input($('#touch'), $('#stick-base'), $('#stick-knob'));
  const hud = new Hud($('#hud'), atlas);
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
  $('#over .menu').addEventListener('click', toTitle);
  for (const b of document.querySelectorAll('#title .seg')) {
    b.addEventListener('click', () => {
      game.save.difficulty = b.dataset.diff;
      store(game.save);
      renderTitle();
    });
  }
  $('#title .shop-open').addEventListener('click', () => {
    renderShop($('#shop'), game.save, buy);
    $('#shop').classList.add('on');
  });
  $('#shop .shop-close').addEventListener('click', () => {
    $('#shop').classList.remove('on');
    renderTitle();
  });
  $('#levelup .reroll').addEventListener('click', () => {
    if (game.sim.reroll()) {
      game.audio.pick();
      game.haptics.buzz(10, true);
    }
  });
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
  renderTitle();

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
  if (game.view) game.view.showNumbers = st.numbers !== false;
  for (const b of document.querySelectorAll('.toggle')) b.classList.toggle('on', !!st[b.dataset.setting]);
  if (game.view) game.view.setBloom(st.bloom !== 'off' && game.tier < 1);
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 'S'}`;

function renderTitle() {
  const save = game.save;
  renderShips($('#title .ships'), save, game.atlas, id => {
    save.character = id;
    store(save);
    renderTitle();
  });
  $('#title .credits').textContent = save.credits;
  for (const b of document.querySelectorAll('#title .seg')) {
    const on = b.dataset.diff === save.difficulty;
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', on);
  }
  const b = save.difficulty === 'easy' ? save.best.easySeconds || 0 : save.best.seconds;
  $('#title .best').textContent = save.totals.runs
    ? `BEST ${save.difficulty === 'easy' ? '(EASY) ' : ''}${Math.floor(b / 60)}:${String(b % 60).padStart(2, '0')}  ·  ${plural(save.totals.runs, 'RUN')}  ·  ${plural(save.totals.wins, 'WIN')}`
    : '';
}

function buy(u, cost) {
  const save = game.save;
  if (save.credits < cost) return;
  save.credits -= cost;
  save.upgrades[u.id] = (save.upgrades[u.id] || 0) + 1;
  store(save);
  game.audio.pick();
  game.haptics.buzz(15, true);
  renderShop($('#shop'), save, buy);
}

function toTitle() {
  $('#over').classList.remove('on');
  $('#title').classList.add('on');
  game.state = 'title';
  game.sim = new Sim({ seed: 12345 });
  game.view.reset(game.sim);
  renderTitle();
}

function start() {
  const { view, hud, input, levelUp } = game;
  game.audio.unlock();
  game.audio.startMusic();
  game.freeze = game.slow = 0;
  const save = game.save;
  if (!save.unlocked.characters.includes(save.character)) save.character = 'vanguard';
  game.sim = new Sim({
    seed: (Date.now() ^ (Math.random() * 1e9)) >>> 0,
    character: save.character,
    upgrades: save.upgrades,
    locked: lockedWeapons(save),
    difficulty: save.difficulty
  });
  $('#hud .badge').textContent = game.sim.diff.id === 'easy' ? 'EASY' : '';
  game.sim.viewRadius = view.viewRadius;
  view.reset(game.sim);
  view.playIntro();
  document.documentElement.style.setProperty('--vig', ZONES[0].vignette);
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
    item.append(iconCanvas(game.atlas.icons, icon, 56), label);
    el.append(item);
  };
  for (const w of sim.weapons) add(iconFor(w.def), w.def.evolved ? 'EVO' : `LV ${w.level}`);
  for (const p of sim.passives) add(p.def.icon, `LV ${p.level}`);
}

function showResults(sim, settled) {
  const t = Math.floor(sim.time);
  const earned = $('#over .earned');
  earned.textContent = `+${settled.credits} CREDITS${sim.diff.id === 'easy' ? ' · EASY' : ''}`;
  if (settled.newBest) {
    const nb = document.createElement('span');
    nb.className = 'nb';
    nb.textContent = 'NEW BEST TIME';
    earned.append(nb);
  }
  const un = $('#over .unlocks');
  un.replaceChildren();
  for (const u of settled.unlocked) {
    const d = document.createElement('div');
    d.textContent = u.kind === 'weapon'
      ? `UNLOCKED WEAPON · ${WEAPONS[WEAPON_INDEX[u.id]].name}`
      : `UNLOCKED SHIP · ${CHARACTERS[CHARACTER_INDEX[u.id]].name}`;
    un.append(d);
  }
  const stats = [
    [`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, 'SURVIVED'],
    [sim.p.kills, 'KILLS'],
    [sim.p.level, 'LEVEL'],
    [Math.round(sim.p.damageTaken), 'DAMAGE TAKEN']
  ];
  $('#over').classList.toggle('won', sim.won);
  $('#over .title').textContent = sim.won ? 'HOLDOUT COMPLETE' : 'SIGNAL LOST';
  const el = $('#over .stats');
  el.replaceChildren();
  const counters = [];
  for (const [v, label] of stats) {
    const d = document.createElement('div');
    d.className = 'stat';
    d.innerHTML = '<b></b><span></span>';
    d.querySelector('b').textContent = v;
    d.querySelector('span').textContent = label;
    if (typeof v === 'number') counters.push([d.querySelector('b'), v]);
    el.append(d);
  }
  /* the numbers count up as the panel arrives */
  const t0 = performance.now();
  const tickUp = now => {
    const f = Math.min(1, (now - t0) / 900), e = 1 - Math.pow(1 - f, 3);
    for (const [b, v] of counters) b.textContent = Math.round(v * e);
    if (f < 1) requestAnimationFrame(tickUp);
  };
  requestAnimationFrame(tickUp);
  renderLoadout($('#over .loadout'), sim);
  $('#over').classList.add('on');
}

function banner(text, gold = false) {
  (window.__banners = window.__banners || []).push(text);
  const b = $('#banner');
  b.textContent = text;
  b.classList.toggle('gold', gold);
  b.classList.remove('on');
  void b.offsetWidth;
  b.classList.add('on');
}

/* The boss bar shows while a boss is alive. */
function updateBossBar(sim) {
  const on = game.state === 'run' && sim.boss >= 0 && sim.eAlive[sim.boss];
  const bar = $('#bossbar');
  bar.classList.toggle('on', !!on);
  if (!on) return;
  const def = ENEMIES[sim.eType[sim.boss]];
  if (bar.dataset.name !== def.name) {
    bar.dataset.name = def.name;
    bar.querySelector('.name').textContent = def.name;
  }
  const f = Math.max(0, sim.eHp[sim.boss] / sim.eMaxHp[sim.boss]);
  bar.querySelector('.fill').style.transform = `scaleX(${f.toFixed(3)})`;
}

/* Turn this frame's events into the things that are felt rather than seen:
   hit-pause, shake, vibration, the hurt flash and the surge banner. */
function react(sim) {
  const ev = sim.events, view = game.view, live = game.state === 'run';
  let small = 0;
  for (let i = 0; i < ev.count; i++) {
    const t = ev.type[i];
    if (t === EV.KILL) {
      if (ev.b[i] >= 40 && live) {
        /* a boss going down plays out in slow motion */
        view.addTrauma(0.8);
        game.slow = 1.4;
        game.slowRate = 0.3;
        game.haptics.buzz([60, 40, 60, 40, 200], true);
      } else if (ev.b[i] >= 20) {
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
      game.slow = Math.max(game.slow, 0.5);
      game.slowRate = Math.min(game.slowRate, 0.2);
      sim.holdChoices = true;
    } else if (t === EV.SURGE) {
      view.addTrauma(0.3);
      game.haptics.buzz([30, 60, 30], true);
      banner('INCOMING');
    } else if (t === EV.BOSS) {
      view.addTrauma(0.6);
      game.haptics.buzz([60, 80, 60, 80, 120], true);
      banner(ENEMIES[ev.a[i]].name);
    } else if (t === EV.EVOLVE) {
      view.addTrauma(0.4);
      game.haptics.buzz([20, 30, 20, 30, 60], true);
      banner('EVOLVED', true);
    } else if (t === EV.ZONE) {
      const z = ev.a[i];
      game.view.background.setZone(z);
      document.documentElement.style.setProperty('--vig', ZONES[z].vignette);
      view.addTrauma(0.25);
      game.haptics.buzz([20, 40, 20], true);
      banner(ZONES[z].name);
    } else if (t === EV.EXPLODE) {
      view.addTrauma(Math.min(0.15, ev.a[i] / 800));
    } else if (t === EV.ITEM) {
      game.haptics.buzz(25, true);
      if (ev.a[i] === 1) view.addTrauma(0.25);
    } else if (t === EV.PLAYER_DEATH) {
      view.addTrauma(1);
      game.freeze = 0.3;
      game.haptics.buzz([90, 50, 180], true);
    }
  }
  if (small) view.addTrauma(Math.min(0.06, small * 0.012));
}

/* Frame-time watch. If the device cannot hold the frame rate during a run,
   quality steps down one tier at a time: bloom first, then half the
   particles, then the render resolution. It never steps back up - going up
   and down would be a visible flicker, and a phone that struggled once
   will struggle again when the screen fills. */
const perf = { acc: 0, frames: 0, slowFor: 0, shown: 0, fps: 60 };
function setTier(t) {
  game.tier = t;
  const { view, app } = game;
  view.setBloom(t < 1 && game.save.settings.bloom !== 'off');
  view.fxScale = t >= 2 ? 0.5 : 1;
  view.background.setDetail(t < 2);
  if (t >= 3 && app.renderer.resolution > 1) {
    app.renderer.resolution = 1;
    app.resize();
    view.resize();
  }
}
function watchPerf(rawDt) {
  perf.acc += rawDt;
  perf.frames++;
  if (perf.acc < 0.5) return;
  perf.fps = perf.frames / perf.acc;
  perf.acc = 0;
  perf.frames = 0;
  if (game.state === 'run' && perf.fps < 45) perf.slowFor += 0.5;
  else perf.slowFor = Math.max(0, perf.slowFor - 0.5);
  if (perf.slowFor >= 3 && game.tier < 3 && game.save.settings.bloom === 'auto') {
    perf.slowFor = 0;
    setTier(game.tier + 1);
  }
  if (game.save.settings.fps) {
    const s = game.sim;
    $('#fps').textContent = `${perf.fps.toFixed(0)} fps\n${s.eCount} enemies  ${s.sPool.count} shots  ${s.gPool.count} gems\nquality tier ${game.tier}  bloom ${game.view.bloomOn ? 'on' : 'off'}`;
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
    dt = rawDt * game.slowRate;
    if (game.slow <= 0) {
      sim.holdChoices = false;
      game.slowRate = 0.2;
    }
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
  view.consume(sim.events, sim);
  if (game.state === 'run') game.audio.consume(sim.events);
  sim.events.clear();
  view.sync(sim, dt, rawDt);
  if (game.state === 'run') game.audio.setIntensity(Math.min(1, sim.eCount / 220 + sim.time / 900));

  updateBossBar(sim);
  if (game.state !== 'run') return;
  hud.update(sim, rawDt);

  if (sim.choices && !sim.over) {
    input.setEnabled(false);
    levelUp.show(sim.choices, sim.p.level, sim.choiceFromCache ? 'SUPPLY CACHE' : 'LEVEL UP');
    const rr = $('#levelup .reroll');
    rr.classList.toggle('on', sim.rerolls > 0);
    if (sim.rerolls > 0) rr.textContent = `REROLL · ${sim.rerolls} LEFT`;
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
      const settled = settleRun(game.save, sim.summary());
      store(game.save);
      showResults(sim, settled);
    }
  }
}

/* For tools/verify.cjs. */
window.__game = game;
window.__describe = describe;
window.__enemyIndex = Object.fromEntries(ENEMIES.map((e, i) => [e.id, i]));

/* Offline support, where the page is served over http(s) and the browser
   allows it. Some hosts sandbox pages so a worker cannot register; the game
   runs the same either way, so a failure here is not worth reporting. */
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(() => { window.__sw = 'registered'; },
      () => { window.__sw = 'unavailable'; });
  });
}

boot().catch(e => {
  console.error(e);
  $('#boot').textContent = 'COULD NOT START: ' + e.message;
});
