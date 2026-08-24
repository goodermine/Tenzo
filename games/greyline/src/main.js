/* Greyline - game loop, input and flow. */
import * as THREE from 'three';
import { Engine } from './engine.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Weapon } from './weapon.js';
import { spawnWave } from './enemies.js';
import { Hud } from './hud.js';
import { Sfx } from './audio.js';

const canvas = document.getElementById('view');
const overlay = document.getElementById('overlay');
const hudRoot = document.getElementById('hud');
const loading = document.getElementById('loading');
const bar = document.getElementById('bar');
const loadMsg = document.getElementById('loadmsg');

const engine = new Engine(canvas);
const world = new World(7);
const sfx = new Sfx();

let player, weapon, hud, enemies = [];
let kills = 0;
let wave = 1;
let running = false;
let started = false;
let lastTime = 0;
let respawnTimer = 0;

const input = {
  forward: false, back: false, left: false, right: false,
  jump: false, crouch: false, sprint: false, ads: false, fire: false
};

/* ------------------------------------------------------------------ boot */

async function boot() {
  await world.buildMaterials((p, msg) => {
    bar.style.width = Math.round(p * 88) + '%';
    loadMsg.textContent = msg;
  });
  loadMsg.textContent = 'building sector';
  await frame();
  world.build();
  engine.scene.add(world.group);
  bar.style.width = '100%';

  player = new Player(world, engine.camera);
  player.onStep = power => sfx.step(power);
  weapon = new Weapon(engine.camera, engine.scene, world, sfx);
  engine.scene.add(engine.camera);
  hud = new Hud(hudRoot);
  enemies = spawnWave(world, engine.scene, 6, player.pos);

  /* Touch devices start a notch down: a phone GPU will not hold 60 with
     screen-space AO at full pixel ratio. */
  const touchDevice = matchMedia('(hover: none)').matches || 'ontouchstart' in window;
  setQuality(touchDevice ? 'medium' : 'high');

  resize();
  loading.classList.add('done');
  overlay.classList.add('show');
  window.__ready = true;
  requestAnimationFrame(loop);
}
const frame = () => new Promise(r => requestAnimationFrame(() => r()));

/* ----------------------------------------------------------------- input */

const KEYS = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  Space: 'jump',
  ShiftLeft: 'sprint', ShiftRight: 'sprint',
  ControlLeft: 'crouch', KeyC: 'crouch'
};

addEventListener('keydown', e => {
  if (KEYS[e.code]) {
    input[KEYS[e.code]] = true;
    e.preventDefault();
  }
  if (e.code === 'KeyR') weapon && weapon.startReload();
  if (e.code === 'Escape') pause();
  if (e.code === 'KeyM') sfx.setMuted(!sfx.muted);
});
addEventListener('keyup', e => {
  if (KEYS[e.code]) input[KEYS[e.code]] = false;
});
addEventListener('blur', () => {
  Object.keys(input).forEach(k => (input[k] = false));
});

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
  const locked = document.pointerLockElement === canvas;
  if (!locked && !dragging) return;
  const s = 0.0022 * (weapon && weapon.ads > 0.5 ? 0.55 : 1);
  player.look(e.movementX * s, e.movementY * s);
  weapon.onLook(e.movementX * s, e.movementY * s);
});

document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== canvas && running && lockAvailable) pause();
});
document.addEventListener('pointerlockerror', () => {
  /* embedded without allow="pointer-lock": drag to look instead, and put the
     on-screen buttons up so aim and reload are still reachable */
  lockAvailable = false;
  document.body.classList.add('nolock');
});

/* touch: left stick moves, right side looks, buttons fire and aim */
const touch = { moveId: null, lookId: null, moveOrigin: null, lookPrev: null };
function isButton(t) {
  return t.target && t.target.closest && t.target.closest('.tbtn');
}
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
      const dead = 12;
      input.forward = dy < -dead;
      input.back = dy > dead;
      input.left = dx < -dead;
      input.right = dx > dead;
      input.sprint = dy < -70;
    } else if (t.identifier === touch.lookId) {
      const dx = t.clientX - touch.lookPrev.x;
      const dy = t.clientY - touch.lookPrev.y;
      touch.lookPrev = { x: t.clientX, y: t.clientY };
      const s = 0.0055;
      player.look(dx * s, dy * s);
      weapon.onLook(dx * s, dy * s);
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
    else if (act === 'crouch') { if (v) input.crouch = !input.crouch; }
    else if (act === 'reload') { if (v) weapon.startReload(); }
    btn.classList.toggle('on', v);
  };
  btn.addEventListener('touchstart', e => { e.preventDefault(); set(true); }, { passive: false });
  btn.addEventListener('touchend', e => { e.preventDefault(); set(false); }, { passive: false });
  btn.addEventListener('mousedown', () => set(true));
  btn.addEventListener('mouseup', () => set(false));
});

/* ------------------------------------------------------------------ flow */

function start() {
  sfx.resume();
  started = true;
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
  overlay.classList.add('show');
  document.body.classList.remove('playing');
  overlay.querySelector('.title').textContent = 'PAUSED';
  overlay.querySelector('.sub').textContent = 'Sector 07 — hostiles active';
  overlay.querySelector('.play').textContent = 'RESUME';
  if (document.pointerLockElement) document.exitPointerLock();
}
document.getElementById('play').addEventListener('click', () => {
  if (!player) return;
  if (!player.alive) respawn();
  start();
});
function setQuality(q) {
  engine.setQuality(q);
  document.querySelectorAll('[data-quality]').forEach(x => x.classList.toggle('sel', x.dataset.quality === q));
  resize();
}
document.querySelectorAll('[data-quality]').forEach(b => {
  b.addEventListener('click', () => {
    perf.locked = true;          /* an explicit choice stops the auto-tuner */
    setQuality(b.dataset.quality);
  });
});

/* Watch the frame rate and drop a quality step if the device cannot keep up.
   It only ever steps down, so it settles instead of oscillating. */
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

function respawn() {
  player.health = player.maxHealth;
  player.alive = true;
  player.pos.copy(world.playerStart);
  player.vel.set(0, 0, 0);
  weapon.ammo = weapon.magSize;
  weapon.reserve = 210;
  enemies.forEach(e => e.dispose());
  enemies = spawnWave(world, engine.scene, 5 + wave, player.pos);
}

function onKill(enemy, head) {
  kills++;
  sfx.kill();
  hud.toast(head ? 'HEADSHOT — ENEMY ELIMINATED' : 'ENEMY ELIMINATED');
  hud.feed('YOU ▸ ' + (head ? 'HEADSHOT' : 'HOSTILE'));
  if (enemies.every(e => !e.alive)) {
    wave++;
    setTimeout(() => {
      if (!player) return;
      hud.toast('WAVE ' + wave + ' INBOUND');
      enemies = enemies.concat(spawnWave(world, engine.scene, 4 + wave, player.pos));
    }, 2200);
  }
}

/* ------------------------------------------------------------------ loop */

function resize() {
  engine.resize(innerWidth, innerHeight);
  const portrait = innerHeight > innerWidth;
  const touchDevice = matchMedia('(hover: none)').matches || 'ontouchstart' in window;
  document.body.classList.toggle('rotate-hint', portrait && touchDevice);
}
addEventListener('resize', resize);

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - lastTime) / 1000) || 0;
  lastTime = now;

  if (running && player) {
    sampleFrame(dt);
    player.update(dt, input);
    input.jump = false;
    weapon.update(dt, player, input);

    if (input.fire && player.alive) {
      weapon.fire(player, enemies, (head, enemy, point) => {
        hud.hitMarker(head);
        sfx.hitmarker();
        if (!enemy.alive) onKill(enemy, head);
      });
    }
    if (weapon.ammo === 0 && weapon.reloading <= 0 && weapon.reserve > 0) weapon.startReload();

    for (const e of enemies) e.update(dt, player, sfx, () => {});

    if (!player.alive) {
      respawnTimer -= dt;
      if (respawnTimer <= 0) {
        running = false;
        overlay.classList.add('show');
        document.body.classList.remove('playing');
        overlay.querySelector('.title').textContent = 'YOU WERE KILLED';
        overlay.querySelector('.sub').textContent = kills + ' hostiles eliminated · wave ' + wave;
        overlay.querySelector('.play').textContent = 'REDEPLOY';
        if (document.pointerLockElement) document.exitPointerLock();
      }
    } else {
      respawnTimer = 2.2;
    }

    engine.followShadow(player.pos);
    /* three's fov is vertical, so a tall phone screen would otherwise render
       a fisheye. Aim for a horizontal field of view and clamp the vertical. */
    const targetH = THREE.MathUtils.lerp(103, 74, weapon.ads) + (player.sprinting ? 4 : 0);
    const aspect = Math.max(0.35, engine.camera.aspect);
    const vFov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(targetH) / 2) / aspect);
    engine.camera.fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(vFov), 55, 82);
    engine.camera.updateProjectionMatrix();
    engine.grade.uniforms.uHurt.value = Math.max(0, player.hurtTimer / 0.55);
    hud.update(dt, { player, weapon, enemies, kills, wave });
  }

  engine.render(dt, now / 1000);
}

window.__engine = engine;
window.__world = world;
window.__THREE = THREE;
window.__state = () => ({ player, weapon, enemies, kills, wave, running });
window.__start = start;
boot();
