/* Greyline - mission flow, input and the frame loop. */
import * as THREE from 'three';
import { Engine } from './engine.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Weapon } from './weapon.js';
import { Enemy, spawnGuards } from './enemies.js';
import { Hud } from './hud.js';
import { Sfx } from './audio.js';
import { Mission, DIFFICULTIES } from './mission.js';
import { Loadout, WEAPONS } from './weapons.js';
import { LightPool } from './facility.js';

const canvas = document.getElementById('view');
const overlay = document.getElementById('overlay');
const hudRoot = document.getElementById('hud');
const loading = document.getElementById('loading');
const bar = document.getElementById('bar');
const loadMsg = document.getElementById('loadmsg');
const briefing = document.getElementById('briefing');

const engine = new Engine(canvas);
const world = new World(7);
const sfx = new Sfx();

let player, weapon, hud, lights, mission, loadout;
let enemies = [];
let running = false;
let lastTime = 0;
let difficulty = 'agent';

const input = {
  forward: false, back: false, left: false, right: false,
  jump: false, crouch: false, sprint: false, ads: false, fire: false, use: false
};

/* ------------------------------------------------------------------ boot */

async function boot() {
  await world.buildMaterials((p, msg) => {
    bar.style.width = Math.round(p * 80) + '%';
    loadMsg.textContent = msg;
  });
  loadMsg.textContent = 'building the compound';
  await frame();
  world.build();
  engine.scene.add(world.group);
  bar.style.width = '100%';

  player = new Player(world, engine.camera);
  player.onStep = power => {
    sfx.step(power);
    if (mission && !player.crouch) mission.noise(player.pos, player.sprinting ? 12 : 6);
  };
  loadout = new Loadout('pistol_s');
  weapon = new Weapon(engine.camera, engine.scene, world, sfx, loadout);
  engine.scene.add(engine.camera);
  hud = new Hud(hudRoot);
  lights = new LightPool(engine.scene, 6);

  const touchDevice = matchMedia('(hover: none)').matches || 'ontouchstart' in window;
  setQuality(touchDevice ? 'medium' : 'high');
  resize();

  newMission(difficulty);
  loading.classList.add('done');
  showMenu('GREYLINE', DIFFICULTIES[difficulty].blurb, 'DEPLOY');
  window.__ready = true;
  requestAnimationFrame(loop);
}
const frame = () => new Promise(r => requestAnimationFrame(() => r()));

function newMission(diffId) {
  difficulty = diffId;
  enemies.forEach(e => e.dispose());
  enemies = [];
  mission = new Mission({ world, scene: engine.scene, sfx, difficulty: diffId });
  mission.weaponName = id => (WEAPONS[id] ? WEAPONS[id].name : 'WEAPON');
  mission.onPickupWeapon = id => {
    const slot = loadout.add(id);
    hud.feed('PICKED UP ' + WEAPONS[id].name);
    if (slot) weapon.switchTo(loadout.slots.indexOf(slot));
  };
  player.health = player.maxHealth;
  player.alive = true;
  player.pos.copy(world.playerStart);
  player.vel.set(0, 0, 0);
  player.yaw = 0;
  player.pitch = 0;
  loadout = new Loadout('pistol_s');
  weapon.loadout = loadout;
  weapon.configure();
  enemies = spawnGuards(world, engine.scene, mission, mission.diff.guards, player.pos);
}

/* ----------------------------------------------------------------- input */

const KEYS = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  Space: 'jump',
  ShiftLeft: 'sprint', ShiftRight: 'sprint',
  ControlLeft: 'crouch', KeyC: 'crouch',
  KeyF: 'use'
};

addEventListener('keydown', e => {
  if (KEYS[e.code]) {
    input[KEYS[e.code]] = true;
    e.preventDefault();
  }
  if (!running) return;
  if (e.code === 'KeyR') weapon.startReload();
  if (e.code === 'KeyQ') weapon.cycle(1);
  if (e.code === 'KeyG' && mission.hasDetonator) mission.detonate(player);
  if (/^Digit[1-5]$/.test(e.code)) weapon.switchTo(Number(e.code.slice(5)) - 1);
  if (e.code === 'Escape') pause();
});
addEventListener('keyup', e => {
  if (KEYS[e.code]) input[KEYS[e.code]] = false;
});
addEventListener('blur', () => Object.keys(input).forEach(k => (input[k] = false)));
addEventListener('wheel', e => {
  if (running) weapon.cycle(e.deltaY > 0 ? 1 : -1);
}, { passive: true });

let dragging = false;
let lockAvailable = true;
canvas.addEventListener('mousedown', e => {
  if (!running) return;
  if (e.button === 0) {
    input.fire = true;
    dragging = true;
  }
  if (e.button === 2) input.ads = true;
});
addEventListener('mouseup', e => {
  if (e.button === 0) {
    input.fire = false;
    dragging = false;
  }
  if (e.button === 2) input.ads = false;
});
canvas.addEventListener('contextmenu', e => e.preventDefault());
addEventListener('mousemove', e => {
  if (!running) return;
  if (document.pointerLockElement !== canvas && !dragging) return;
  const s = 0.0022 * (weapon.ads > 0.5 ? 0.55 : 1);
  player.look(e.movementX * s, e.movementY * s);
  weapon.onLook(e.movementX * s, e.movementY * s);
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== canvas && running && lockAvailable) pause();
});
document.addEventListener('pointerlockerror', () => {
  lockAvailable = false;
  document.body.classList.add('nolock');
});

const touch = { moveId: null, lookId: null, moveOrigin: null, lookPrev: null };
const isButton = t => t.target && t.target.closest && t.target.closest('.tbtn');
canvas.addEventListener('touchstart', e => {
  if (!running) return;
  for (const t of e.changedTouches) {
    if (isButton(t)) continue;
    if (t.clientX < innerWidth * 0.45 && touch.moveId === null) {
      touch.moveId = t.identifier;
      touch.moveOrigin = { x: t.clientX, y: t.clientY };
    } else if (touch.lookId === null) {
      touch.lookId = t.identifier;
      touch.lookPrev = { x: t.clientX, y: t.clientY };
    }
  }
  e.preventDefault();
}, { passive: false });
canvas.addEventListener('touchmove', e => {
  if (!running) return;
  for (const t of e.changedTouches) {
    if (t.identifier === touch.moveId) {
      const dx = t.clientX - touch.moveOrigin.x;
      const dy = t.clientY - touch.moveOrigin.y;
      input.forward = dy < -12;
      input.back = dy > 12;
      input.left = dx < -12;
      input.right = dx > 12;
      input.sprint = dy < -70;
    } else if (t.identifier === touch.lookId) {
      const dx = t.clientX - touch.lookPrev.x;
      const dy = t.clientY - touch.lookPrev.y;
      touch.lookPrev = { x: t.clientX, y: t.clientY };
      player.look(dx * 0.0055, dy * 0.0055);
      weapon.onLook(dx * 0.0055, dy * 0.0055);
    }
  }
  e.preventDefault();
}, { passive: false });
function endTouch(e) {
  for (const t of e.changedTouches) {
    if (t.identifier === touch.moveId) {
      touch.moveId = null;
      input.forward = input.back = input.left = input.right = input.sprint = false;
    }
    if (t.identifier === touch.lookId) touch.lookId = null;
  }
}
canvas.addEventListener('touchend', endTouch);
canvas.addEventListener('touchcancel', endTouch);

document.querySelectorAll('.tbtn').forEach(btn => {
  const act = btn.dataset.act;
  const set = v => {
    if (act === 'fire') input.fire = v;
    else if (act === 'ads') input.ads = v;
    else if (act === 'jump') input.jump = v;
    else if (act === 'use') input.use = v;
    else if (act === 'crouch') { if (v) input.crouch = !input.crouch; }
    else if (act === 'reload') { if (v) weapon.startReload(); }
    else if (act === 'swap') { if (v) weapon.cycle(1); }
    else if (act === 'detonate') { if (v && mission.hasDetonator) mission.detonate(player); }
    btn.classList.toggle('on', v);
  };
  btn.addEventListener('touchstart', e => { e.preventDefault(); set(true); }, { passive: false });
  btn.addEventListener('touchend', e => { e.preventDefault(); set(false); }, { passive: false });
  btn.addEventListener('mousedown', () => set(true));
  btn.addEventListener('mouseup', () => set(false));
});

/* ------------------------------------------------------------------ flow */

function showMenu(title, sub, action) {
  overlay.querySelector('.title').textContent = title;
  overlay.querySelector('.sub').textContent = sub;
  overlay.querySelector('.play').textContent = action;
  overlay.classList.add('show');
  document.body.classList.remove('playing');
}

function showBriefing() {
  briefing.querySelector('.bdiff').textContent = mission.diff.label;
  briefing.querySelector('ul').innerHTML = mission.objectives
    .map(o => `<li><b>${o.letter}</b>${o.text}</li>`).join('');
  briefing.classList.add('show');
  setTimeout(() => {
    briefing.classList.remove('show');
    start();
  }, 3200);
}

function start() {
  sfx.resume();
  running = true;
  overlay.classList.remove('show');
  document.body.classList.add('playing');
  if (!('ontouchstart' in window) && lockAvailable && canvas.requestPointerLock) {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => { lockAvailable = false; document.body.classList.add('nolock'); });
  }
  lastTime = performance.now();
}

function pause() {
  if (!running) return;
  running = false;
  showMenu('PAUSED', mission.diff.label + ' — ' +
    mission.objectives.filter(o => o.done).length + '/' + mission.objectives.length + ' objectives', 'RESUME');
  if (document.pointerLockElement) document.exitPointerLock();
}

function debrief() {
  running = false;
  const d = mission.debrief();
  const done = d.state === 'complete';
  overlay.querySelector('.title').textContent = done ? 'MISSION COMPLETE' : 'MISSION FAILED';
  overlay.querySelector('.sub').textContent = done ? d.difficulty : (d.reason || 'AGENT DOWN');
  overlay.querySelector('.play').textContent = 'REDEPLOY';
  const table = overlay.querySelector('.debrief');
  const mm = Math.floor(d.time / 60);
  const ss = Math.floor(d.time % 60);
  table.innerHTML = `
    <div><span>OBJECTIVES</span><b>${d.objectives}</b></div>
    <div><span>TIME</span><b>${mm}:${String(ss).padStart(2, '0')}</b></div>
    <div><span>ACCURACY</span><b>${d.accuracy.toFixed(1)}%</b></div>
    <div><span>ELIMINATED</span><b>${d.kills}</b></div>
    <div><span>HEADSHOTS</span><b>${d.headshots}</b></div>
    <div><span>ALARMS RAISED</span><b>${d.alarms}</b></div>
    <div class="tot"><span>SCORE</span><b>${d.score}</b></div>`;
  table.classList.add('show');
  overlay.classList.add('show');
  document.body.classList.remove('playing');
  if (document.pointerLockElement) document.exitPointerLock();
}

document.getElementById('play').addEventListener('click', () => {
  if (!player) return;
  overlay.querySelector('.debrief').classList.remove('show');
  if (mission.state !== 'active' || !player.alive) {
    newMission(difficulty);
    showBriefing();
  } else if (document.body.classList.contains('playing') === false && mission.time === 0) {
    showBriefing();
  } else {
    start();
  }
});
document.querySelectorAll('[data-diff]').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('[data-diff]').forEach(x => x.classList.remove('sel'));
    b.classList.add('sel');
    newMission(b.dataset.diff);
    overlay.querySelector('.sub').textContent = mission.diff.blurb;
  });
});

function setQuality(q) {
  engine.setQuality(q);
  document.querySelectorAll('[data-quality]').forEach(x => x.classList.toggle('sel', x.dataset.quality === q));
  resize();
}
document.querySelectorAll('[data-quality]').forEach(b => {
  b.addEventListener('click', () => {
    perf.locked = true;
    setQuality(b.dataset.quality);
  });
});

const perf = { frames: 0, time: 0, locked: false };
const QUALITY_ORDER = ['high', 'medium', 'low'];
function sampleFrame(dt) {
  if (perf.locked || dt <= 0 || dt > 0.12) return;
  perf.frames++;
  perf.time += dt;
  if (perf.frames < 90) return;
  const fps = perf.frames / perf.time;
  perf.frames = 0;
  perf.time = 0;
  const i = QUALITY_ORDER.indexOf(engine.quality);
  if (fps < 40 && i < QUALITY_ORDER.length - 1) setQuality(QUALITY_ORDER[i + 1]);
}

function resize() {
  engine.resize(innerWidth, innerHeight);
  const portrait = innerHeight > innerWidth;
  const touchDevice = matchMedia('(hover: none)').matches || 'ontouchstart' in window;
  document.body.classList.toggle('rotate-hint', portrait && touchDevice);
}
addEventListener('resize', resize);

/* ------------------------------------------------------------------ loop */

function spawnReinforcements() {
  if (!mission.wantReinforcements) return;
  const n = mission.wantReinforcements;
  mission.wantReinforcements = 0;
  const alive = enemies.filter(e => e.alive).length;
  if (alive > mission.diff.guards + 6) return;
  const entry = world.facility.entry || player.pos;
  const d = mission.diff;
  for (let i = 0; i < n; i++) {
    const p = entry.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 0, i * 1.6));
    const e = new Enemy(world, p, engine.scene, {
      health: d.health, damage: d.damage, accuracy: d.accuracy, reaction: d.reaction
    });
    e.state = 'search';
    e.lastKnown = player.pos.clone();
    e.searchTimer = 30;
    enemies.push(e);
  }
  hud.feed('REINFORCEMENTS INBOUND');
}

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - lastTime) / 1000) || 0;
  lastTime = now;

  if (running && player) {
    sampleFrame(dt);
    player.update(dt, input);
    input.jump = false;
    weapon.update(dt, player, input);

    const ctx = {
      player, mission, sfx,
      onHit: (zone, enemy, point, killed) => {
        hud.hitMarker(zone);
        sfx.hitmarker();
        if (zone === 'head') mission.stats.headshots++;
        if (killed) {
          mission.stats.kills++;
          hud.feed(zone === 'head' ? 'HEADSHOT' : 'HOSTILE DOWN');
        }
      }
    };

    if (input.fire && player.alive) weapon.fire(player, enemies, ctx);
    if (weapon.ammo === 0 && weapon.reloading <= 0 && weapon.reserve > 0) weapon.startReload();

    mission.interact(dt, player, engine.camera, input.use);
    for (const e of enemies) e.update(dt, ctx);
    mission.update(dt, player, enemies, engine.camera);
    spawnReinforcements();

    if (world.facility) lights.update(world.facility.lightSpots, player.pos);
    engine.followShadow(player.pos);

    const zoom = weapon.def.zoom || 1;
    const targetH = (weapon.ads > 0.5 ? 103 / zoom : 103) + (player.sprinting ? 4 : 0);
    const aspect = Math.max(0.35, engine.camera.aspect);
    const vFov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(
      THREE.MathUtils.lerp(103, targetH, weapon.ads)) / 2) / aspect);
    engine.camera.fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(vFov), 20, 82);
    engine.camera.updateProjectionMatrix();
    engine.grade.uniforms.uHurt.value = Math.max(0, player.hurtTimer / 0.55);

    hud.update(dt, { player, weapon, enemies, mission, loadout });

    if (mission.state !== 'active') debrief();
  }

  engine.render(dt, now / 1000);
}

window.__engine = engine;
window.__world = world;
window.__THREE = THREE;
window.__state = () => ({ player, weapon, enemies, mission, loadout, running });
window.__start = () => { if (mission) start(); };
boot();
