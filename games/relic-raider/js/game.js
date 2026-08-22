/* Relic Raider - world simulation, entities and screens. */
window.RR = window.RR || {};
(function () {
  'use strict';

  var Art = RR.Art;
  var Audio = RR.Audio;
  var Input = RR.Input;
  var Levels = RR.Levels;
  var TS = 32;

  /* --------------------------------------------------------- tuning knobs */
  var GRAVITY = 1500;
  var MAX_FALL = 920;
  var RUN_SPEED = 212;
  var GROUND_ACCEL = 1700;
  var AIR_ACCEL = 950;
  var FRICTION = 1900;
  var JUMP_V = 560;
  var COYOTE = 0.1;
  var JUMP_BUFFER = 0.12;
  var CLIMB_SPEED = 115;
  var MAX_HEARTS = 3;
  var CRUMBLE_DELAY = 0.4;
  var INVULN = 1.25;

  var SCORE = { coin: 25, gem: 100, relic: 750, heart: 150, time: 10 };

  var G = {
    state: 'title',
    /* device pixels per world pixel that baked artwork is rendered at */
    detail: 2,
    world: null,
    levelIndex: 0,
    score: 0,
    totalScore: 0,
    best: 0,
    time: 0,
    view: {
      w: 800, h: 600, scale: 2,
      vp: { x: 0, y: 0, w: 800, h: 600 },
      inset: { top: 0, right: 0, bottom: 0, left: 0 }
    },
    ui: {},
    banner: null,
    flash: 0,
    result: null
  };

  /* -------------------------------------------------------------- storage */
  function load() {
    try {
      var raw = window.localStorage.getItem('relicraider.save');
      if (raw) {
        var d = JSON.parse(raw);
        G.best = d.best || 0;
        G.cleared = d.cleared || 0;
      }
    } catch (e) { /* private mode, no save */ }
  }
  function save() {
    try {
      window.localStorage.setItem(
        'relicraider.save',
        JSON.stringify({ best: G.best, cleared: G.cleared || 0 })
      );
    } catch (e) { /* ignore */ }
  }

  /* ------------------------------------------------------------ the world */

  function key(tx, ty) {
    return ty * 4096 + tx;
  }

  function buildWorld(index) {
    var def = Levels.build(index);
    var grid = def.rows.map(function (r) {
      return r.split('');
    });
    var w = {
      def: def,
      grid: grid,
      w: def.w,
      h: def.h,
      theme: def.theme,
      tiles: Art.buildTiles(def.theme, G.detail),
      backdrop: Art.backdropLayers(def.theme, G.detail),
      entities: [],
      darts: [],
      rocks: [],
      particles: [],
      crumbles: Object.create(null),
      traps: [],
      torches: [],
      time: 0,
      elapsed: 0,
      relicTaken: false,
      doorOpen: false,
      shake: 0,
      collapse: { active: false, x: 0, speed: 0, warn: 0 },
      rockTimer: 0,
      cam: { x: 0, y: 0 },
      spawn: { x: TS * 2, y: TS * 2 },
      door: null,
      checkpoint: null,
      hearts: MAX_HEARTS,
      coinsTotal: 0,
      coinsGot: 0,
      deathTimer: 0
    };

    var seed = 1;
    for (var ty = 0; ty < w.h; ty++) {
      for (var tx = 0; tx < w.w; tx++) {
        var ch = grid[ty][tx];
        var px = tx * TS;
        var py = ty * TS;
        seed += 17;
        switch (ch) {
          case 'P':
            w.spawn = { x: px + 6, y: py + 2 };
            grid[ty][tx] = ' ';
            break;
          case 'D':
            w.door = { x: px, y: py, tx: tx, ty: ty, w: TS, h: TS };
            grid[ty][tx] = ' ';
            break;
          case 'o':
            w.entities.push(pickup('coin', px + 8, py + 8, 16, 16, seed));
            w.coinsTotal++;
            grid[ty][tx] = ' ';
            break;
          case '*':
            w.entities.push(pickup('gem', px + 6, py + 5, 20, 22, seed));
            grid[ty][tx] = ' ';
            break;
          case 'R':
            w.entities.push(pickup('relic', px + 4, py + 2, 24, 28, seed));
            grid[ty][tx] = ' ';
            break;
          case 'G':
            w.entities.push({
              type: 'guardian', x: px + 3, y: py + 6, w: 26, h: 26,
              vx: 42, vy: 0, seed: seed, alive: true
            });
            grid[ty][tx] = ' ';
            break;
          case 'F':
            w.entities.push({
              type: 'bat', x: px + 4, y: py + 8, w: 24, h: 16,
              vx: 62, vy: 0, baseY: py + 8, seed: seed % 6, alive: true
            });
            grid[ty][tx] = ' ';
            break;
          case 'm':
            w.entities.push({
              type: 'mover', x: px, y: py + 10, w: TS * 2, h: 14,
              vx: 62, vy: 0, dx: 0, dy: 0, axis: 'x', seed: seed
            });
            grid[ty][tx] = ' ';
            break;
          case 'n':
            w.entities.push({
              type: 'mover', x: px, y: py, w: TS * 2, h: 14,
              vx: 0, vy: 52, dx: 0, dy: 0, axis: 'y', seed: seed
            });
            grid[ty][tx] = ' ';
            break;
          case 'C':
            w.torches.push({ x: px + TS / 2, y: py + TS - 4, lit: false, checkpoint: true, seed: seed % 7, tx: tx, ty: ty });
            grid[ty][tx] = ' ';
            break;
          case 'b':
            w.torches.push({ x: px + TS / 2, y: py + TS - 6, lit: true, checkpoint: false, seed: seed % 7, tx: tx, ty: ty });
            grid[ty][tx] = ' ';
            break;
          case '~':
            w.crumbles[key(tx, ty)] = { tx: tx, ty: ty, state: 'idle', t: 0, oy: 0, vy: 0 };
            break;
          case '<':
          case '>':
            w.traps.push({ tx: tx, ty: ty, x: px, y: py, dir: ch === '<' ? -1 : 1, t: 1 + Math.random() });
            break;
          default:
            break;
        }
      }
    }

    w.checkpoint = { x: w.spawn.x, y: w.spawn.y };
    w.player = makePlayer(w.spawn.x, w.spawn.y);
    w.collapse.speed = def.collapseSpeed;
    return w;
  }

  function pickup(type, x, y, w, h, seed) {
    return { type: type, x: x, y: y, w: w, h: h, seed: seed % 10, alive: true };
  }

  function makePlayer(x, y) {
    return {
      x: x, y: y, w: 20, h: 30,
      vx: 0, vy: 0, face: 1,
      onGround: false, coyote: 0, buffer: 0, jumping: false,
      climbing: false, invuln: 0, platform: null, dead: false
    };
  }

  /* ------------------------------------------------------------- collision */

  function tileChar(w, tx, ty) {
    if (tx < 0 || ty < 0 || tx >= w.w || ty >= w.h) return tx < 0 || tx >= w.w ? '#' : ' ';
    return w.grid[ty][tx];
  }

  function isSolid(w, tx, ty) {
    var ch = tileChar(w, tx, ty);
    if (ch === '#' || ch === '<' || ch === '>') return true;
    if (ch === '~') {
      var c = w.crumbles[key(tx, ty)];
      return !c || c.state === 'idle' || c.state === 'shaking';
    }
    return false;
  }

  function overlapTiles(w, a, fn) {
    var tx0 = Math.floor(a.x / TS);
    var tx1 = Math.floor((a.x + a.w - 0.001) / TS);
    var ty0 = Math.floor(a.y / TS);
    var ty1 = Math.floor((a.y + a.h - 0.001) / TS);
    for (var ty = ty0; ty <= ty1; ty++) {
      for (var tx = tx0; tx <= tx1; tx++) fn(tx, ty);
    }
  }

  function resolveX(w, a) {
    var hit = false;
    overlapTiles(w, a, function (tx, ty) {
      if (!isSolid(w, tx, ty)) return;
      if (a.vx > 0) {
        a.x = tx * TS - a.w;
        hit = true;
      } else if (a.vx < 0) {
        a.x = (tx + 1) * TS;
        hit = true;
      }
    });
    if (hit) a.vx = 0;
    return hit;
  }

  function resolveY(w, a) {
    var landed = false;
    var bumped = false;
    overlapTiles(w, a, function (tx, ty) {
      if (!isSolid(w, tx, ty)) return;
      if (a.vy > 0) {
        a.y = ty * TS - a.h;
        landed = true;
      } else if (a.vy < 0) {
        a.y = (ty + 1) * TS;
        bumped = true;
      }
    });
    if (landed || bumped) a.vy = 0;
    return landed;
  }

  function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  /* ------------------------------------------------------------- particles */

  function burst(w, x, y, n, color, opts) {
    opts = opts || {};
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = (opts.speed || 90) * (0.35 + Math.random() * 0.9);
      w.particles.push({
        x: x, y: y,
        vx: Math.cos(a) * sp + (opts.vx || 0),
        vy: Math.sin(a) * sp - (opts.lift || 40),
        life: opts.life || 0.6,
        max: opts.life || 0.6,
        size: opts.size || 3,
        color: color,
        grav: opts.grav == null ? 420 : opts.grav
      });
    }
  }

  /* ----------------------------------------------------------------- flow */

  function startLevel(index) {
    G.levelIndex = index;
    G.world = buildWorld(index);
    G.score = 0;
    G.state = 'play';
    G.banner = { text: G.world.def.name, sub: G.world.def.subtitle, t: 3.2 };
    Audio.setMusic(true);
  }

  function restartLevel() {
    startLevel(G.levelIndex);
  }

  function respawn(w) {
    var p = w.player;
    p.x = w.checkpoint.x;
    p.y = w.checkpoint.y;
    p.vx = 0;
    p.vy = 0;
    p.invuln = 1.4;
    p.climbing = false;
    p.dead = false;
    if (w.collapse.active) {
      w.collapse.x = Math.max(w.collapse.x, p.x + TS * 15);
    }
  }

  function hurt(w, dir, fatal) {
    var p = w.player;
    if (p.invuln > 0 && !fatal) return;
    w.hearts--;
    p.invuln = INVULN;
    w.shake = Math.max(w.shake, 9);
    G.flash = 0.25;
    Audio.play('hurt');
    burst(w, p.x + p.w / 2, p.y + p.h / 2, 12, '#d8483f', { speed: 130 });
    if (w.hearts <= 0) {
      w.hearts = 0;
      p.dead = true;
      w.deathTimer = 1.1;
      Audio.play('lose');
      Audio.setMusic(false);
    } else if (fatal) {
      respawn(w);
    } else {
      p.vy = -270;
      p.vx = dir * 200;
    }
  }

  function takeRelic(w) {
    w.relicTaken = true;
    w.doorOpen = true;
    w.collapse.active = true;
    w.collapse.x = w.player.x + TS * 10;
    w.collapse.speed = w.def.collapseSpeed;
    w.shake = 22;
    G.score += SCORE.relic;
    Audio.play('relic');
    Audio.play('rumble');
    G.banner = { text: 'THE TEMPLE AWAKENS', sub: 'Run back to the door!', t: 3.4, alarm: true };
  }

  function finishLevel(w) {
    Audio.play('win');
    Audio.setMusic(false);
    var timeBonus = Math.max(0, Math.round((w.def.parTime - w.elapsed) * SCORE.time));
    var heartBonus = w.hearts * SCORE.heart;
    G.result = {
      level: w.def.name,
      base: G.score,
      timeBonus: timeBonus,
      heartBonus: heartBonus,
      hearts: w.hearts,
      elapsed: w.elapsed,
      coins: w.coinsGot,
      coinsTotal: w.coinsTotal,
      total: G.score + timeBonus + heartBonus
    };
    G.totalScore += G.result.total;
    G.cleared = Math.max(G.cleared || 0, G.levelIndex + 1);
    if (G.totalScore > G.best) G.best = G.totalScore;
    save();
    G.state = G.levelIndex + 1 >= Levels.count ? 'victory' : 'levelDone';
  }

  /* --------------------------------------------------------------- update */

  function updatePlayer(w, dt) {
    var p = w.player;
    var left = Input.left();
    var right = Input.right();
    var accel = p.onGround ? GROUND_ACCEL : AIR_ACCEL;

    if (p.invuln > 0) p.invuln -= dt;

    /* vines */
    var onVine = false;
    overlapTiles(w, p, function (tx, ty) {
      if (tileChar(w, tx, ty) === 'v') onVine = true;
    });
    if (!onVine) p.climbing = false;
    if (onVine && (Input.up() || Input.down())) p.climbing = true;

    if (p.climbing) {
      p.vy = (Input.up() ? -CLIMB_SPEED : 0) + (Input.down() ? CLIMB_SPEED : 0);
      p.vx = (right ? 1 : 0) * 70 - (left ? 1 : 0) * 70;
      if (Input.jumpPressed()) {
        p.climbing = false;
        p.vy = -JUMP_V * 0.85;
        p.jumping = true;
        Audio.play('jump');
      }
    } else {
      if (left && !right) {
        p.vx -= accel * dt;
        p.face = -1;
      } else if (right && !left) {
        p.vx += accel * dt;
        p.face = 1;
      } else if (p.onGround) {
        var f = FRICTION * dt;
        p.vx = Math.abs(p.vx) <= f ? 0 : p.vx - Math.sign(p.vx) * f;
      }
      p.vx = Math.max(-RUN_SPEED, Math.min(RUN_SPEED, p.vx));
      p.vy = Math.min(MAX_FALL, p.vy + GRAVITY * dt);
    }

    /* jump with coyote time + input buffering */
    if (Input.jumpPressed()) p.buffer = JUMP_BUFFER;
    p.buffer -= dt;
    p.coyote -= dt;
    if (p.buffer > 0 && p.coyote > 0 && !p.climbing) {
      p.vy = -JUMP_V;
      p.buffer = 0;
      p.coyote = 0;
      p.onGround = false;
      p.jumping = true;
      Audio.play('jump');
      burst(w, p.x + p.w / 2, p.y + p.h, 5, 'rgba(220,205,170,0.8)', { speed: 55, lift: -10, life: 0.35, size: 2 });
    }
    if (p.jumping && !Input.jumpHeld() && p.vy < -160) {
      p.vy = -160; /* variable jump height */
      p.jumping = false;
    }
    if (p.vy >= 0) p.jumping = false;

    /* carry along a moving platform */
    if (p.platform) {
      p.x += p.platform.dx;
      p.y += p.platform.dy;
    }
    p.platform = null;

    var wasGround = p.onGround;
    p.x += p.vx * dt;
    resolveX(w, p);
    p.y += p.vy * dt;
    var landed = resolveY(w, p);
    p.onGround = landed;

    /* one-way ride on moving platforms */
    for (var i = 0; i < w.entities.length; i++) {
      var e = w.entities[i];
      if (e.type !== 'mover') continue;
      if (p.vy >= 0 && aabb(p, e) && p.y + p.h - e.y < 16 + Math.abs(p.vy) * dt) {
        p.y = e.y - p.h;
        p.vy = 0;
        p.onGround = true;
        p.platform = e;
      }
    }

    if (p.onGround) {
      p.coyote = COYOTE;
      if (!wasGround) {
        Audio.play('land');
        burst(w, p.x + p.w / 2, p.y + p.h, 6, 'rgba(210,196,160,0.7)', { speed: 60, lift: -5, life: 0.3, size: 2, grav: 200 });
      }
    }

    /* stand on a crumbling tile */
    if (p.onGround) {
      var tyb = Math.floor((p.y + p.h + 1) / TS);
      for (var tx = Math.floor(p.x / TS); tx <= Math.floor((p.x + p.w - 1) / TS); tx++) {
        var c = w.crumbles[key(tx, tyb)];
        if (c && c.state === 'idle') {
          c.state = 'shaking';
          c.t = CRUMBLE_DELAY;
          Audio.play('crumble');
        }
      }
    }

    /* spikes */
    var spiked = false;
    overlapTiles(w, { x: p.x + 2, y: p.y + p.h - 10, w: p.w - 4, h: 10 }, function (tx, ty) {
      if (tileChar(w, tx, ty) === '^') spiked = true;
    });
    if (spiked) hurt(w, -p.face, false);

    /* fell out of the world */
    if (p.y > w.h * TS + 80) hurt(w, 0, true);

    /* crushed by the collapse */
    if (w.collapse.active && p.x + p.w > w.collapse.x) hurt(w, -1, true);

    /* pickups + door */
    for (i = 0; i < w.entities.length; i++) {
      var it = w.entities[i];
      if (!it.alive) continue;
      if (it.type === 'coin' || it.type === 'gem' || it.type === 'relic') {
        if (!aabb(p, it)) continue;
        it.alive = false;
        if (it.type === 'coin') {
          G.score += SCORE.coin;
          w.coinsGot++;
          Audio.play('coin');
          burst(w, it.x + 8, it.y + 8, 6, '#f2c94c', { speed: 70, life: 0.4, size: 2 });
        } else if (it.type === 'gem') {
          G.score += SCORE.gem;
          Audio.play('gem');
          burst(w, it.x + 10, it.y + 11, 10, '#8fe6ff', { speed: 110, life: 0.5, size: 3 });
        } else {
          burst(w, it.x + 12, it.y + 14, 26, '#ffd873', { speed: 180, life: 0.9, size: 4 });
          takeRelic(w);
        }
      }
    }

    if (w.door && w.doorOpen) {
      var d = { x: w.door.x, y: w.door.y - TS, w: TS, h: TS * 2 };
      if (aabb(p, d)) {
        Audio.play('door');
        finishLevel(w);
      }
    }

    for (i = 0; i < w.torches.length; i++) {
      var t = w.torches[i];
      if (t.checkpoint && !t.lit &&
          Math.abs(p.x + p.w / 2 - t.x) < 26 && Math.abs(p.y + p.h - t.y) < 44) {
        t.lit = true;
        w.checkpoint = { x: t.x - 10, y: t.y - 34 };
        Audio.play('checkpoint');
        G.banner = { text: 'Checkpoint', sub: 'The torch remembers you', t: 1.8 };
        burst(w, t.x, t.y - 20, 14, '#ffc06a', { speed: 90, lift: 70, life: 0.7, size: 3, grav: -40 });
      }
    }
  }

  function updateEntities(w, dt) {
    var p = w.player;
    for (var i = 0; i < w.entities.length; i++) {
      var e = w.entities[i];
      if (e.type === 'guardian') {
        e.x += e.vx * dt;
        var aheadX = e.vx > 0 ? e.x + e.w + 2 : e.x - 2;
        var footTy = Math.floor((e.y + e.h + 4) / TS);
        var aheadTx = Math.floor(aheadX / TS);
        if (!isSolid(w, aheadTx, footTy) || isSolid(w, aheadTx, Math.floor((e.y + e.h - 8) / TS))) {
          e.vx = -e.vx;
          e.x += e.vx * dt * 2;
        }
        if (!p.dead && aabb(p, e)) hurt(w, p.x < e.x ? -1 : 1, false);
      } else if (e.type === 'bat') {
        e.x += e.vx * dt;
        e.y = e.baseY + Math.sin(w.time * 2.2 + e.seed) * 26;
        var tx = Math.floor((e.vx > 0 ? e.x + e.w + 2 : e.x - 2) / TS);
        if (isSolid(w, tx, Math.floor((e.y + e.h / 2) / TS))) e.vx = -e.vx;
        if (!p.dead && aabb(p, e)) hurt(w, p.x < e.x ? -1 : 1, false);
      } else if (e.type === 'mover') {
        var px = e.x, py = e.y;
        if (e.axis === 'x') {
          e.x += e.vx * dt;
          var lead = Math.floor((e.vx > 0 ? e.x + e.w + 1 : e.x - 1) / TS);
          if (isSolid(w, lead, Math.floor((e.y + e.h / 2) / TS))) {
            e.vx = -e.vx;
            e.x = px;
          }
        } else {
          e.y += e.vy * dt;
          var leadY = Math.floor((e.vy > 0 ? e.y + e.h + 1 : e.y - 1) / TS);
          if (isSolid(w, Math.floor((e.x + e.w / 2) / TS), leadY)) {
            e.vy = -e.vy;
            e.y = py;
          }
        }
        e.dx = e.x - px;
        e.dy = e.y - py;
      }
    }

    /* dart traps */
    for (i = 0; i < w.traps.length; i++) {
      var tr = w.traps[i];
      if (Math.abs(tr.x - p.x) > TS * 22) continue;
      tr.t -= dt;
      if (tr.t <= 0) {
        tr.t = 2.1;
        w.darts.push({ x: tr.x + TS / 2 + tr.dir * 16, y: tr.y + TS / 2, vx: tr.dir * 205 });
        Audio.play('dart');
      }
    }
    for (i = w.darts.length - 1; i >= 0; i--) {
      var d = w.darts[i];
      d.x += d.vx * dt;
      var box = { x: d.x - 8, y: d.y - 4, w: 16, h: 8 };
      if (isSolid(w, Math.floor(d.x / TS), Math.floor(d.y / TS)) ||
          d.x < 0 || d.x > w.w * TS) {
        burst(w, d.x, d.y, 4, 'rgba(200,190,160,0.8)', { speed: 60, life: 0.3, size: 2 });
        w.darts.splice(i, 1);
        continue;
      }
      if (!p.dead && aabb(p, box)) {
        hurt(w, Math.sign(d.vx), false);
        w.darts.splice(i, 1);
      }
    }

    /* crumbling floors */
    for (var k in w.crumbles) {
      var c = w.crumbles[k];
      if (c.state === 'shaking') {
        c.t -= dt;
        if (c.t <= 0) {
          c.state = 'falling';
          c.vy = 30;
          burst(w, c.tx * TS + TS / 2, c.ty * TS + TS, 8, 'rgba(150,135,105,0.9)', { speed: 70, life: 0.6, size: 3 });
        }
      } else if (c.state === 'falling') {
        c.vy += GRAVITY * dt * 0.6;
        c.oy += c.vy * dt;
        if (c.oy > TS * 8) c.state = 'gone';
      }
    }

    /* falling debris once the temple starts coming down */
    if (w.collapse.active) {
      w.rockTimer -= dt;
      if (w.rockTimer <= 0) {
        w.rockTimer = 0.55 + Math.random() * 0.6;
        var rx = p.x + (Math.random() * 2 - 0.7) * 260;
        w.rocks.push({ x: rx, y: w.cam.y - 40, vy: 190, r: 7 + Math.random() * 7, rot: 0, spin: (Math.random() - 0.5) * 6 });
      }
    }
    for (i = w.rocks.length - 1; i >= 0; i--) {
      var r = w.rocks[i];
      r.vy += GRAVITY * 0.35 * dt;
      r.y += r.vy * dt;
      r.rot += r.spin * dt;
      var rb = { x: r.x - r.r, y: r.y - r.r, w: r.r * 2, h: r.r * 2 };
      if (isSolid(w, Math.floor(r.x / TS), Math.floor((r.y + r.r) / TS)) || r.y > w.h * TS) {
        burst(w, r.x, r.y, 6, 'rgba(140,125,100,0.9)', { speed: 80, life: 0.4, size: 3 });
        if (Math.abs(r.x - p.x) < 200) Audio.play('rock');
        w.rocks.splice(i, 1);
        continue;
      }
      if (!p.dead && aabb(p, rb)) {
        hurt(w, Math.sign(p.x - r.x) || 1, false);
        w.rocks.splice(i, 1);
      }
    }

    /* particles */
    for (i = w.particles.length - 1; i >= 0; i--) {
      var pa = w.particles[i];
      pa.life -= dt;
      if (pa.life <= 0) {
        w.particles.splice(i, 1);
        continue;
      }
      pa.vy += pa.grav * dt;
      pa.x += pa.vx * dt;
      pa.y += pa.vy * dt;
    }
  }

  function updateCamera(w, dt) {
    var p = w.player;
    var vp = G.view.vp;
    var visW = vp.w / G.view.scale;
    var visH = vp.h / G.view.scale;
    var tx = p.x + p.w / 2 - visW / 2 + p.face * 26;
    var ty = p.y + p.h / 2 - visH * 0.55;
    var maxX = Math.max(0, w.w * TS - visW);
    var maxY = Math.max(0, w.h * TS - visH);
    tx = Math.max(0, Math.min(maxX, tx));
    ty = Math.max(0, Math.min(maxY, ty));
    var k = 1 - Math.pow(0.0015, dt);
    w.cam.x += (tx - w.cam.x) * k;
    w.cam.y += (ty - w.cam.y) * k;
  }

  G.update = function (dt) {
    G.time += dt;
    if (G.flash > 0) G.flash -= dt;

    if (G.state === 'play') {
      var w = G.world;
      w.time += dt;
      if (!w.player.dead) w.elapsed += dt;
      if (G.banner) {
        G.banner.t -= dt;
        if (G.banner.t <= 0) G.banner = null;
      }
      if (w.player.dead) {
        w.deathTimer -= dt;
        w.player.vy = Math.min(MAX_FALL, w.player.vy + GRAVITY * dt);
        w.player.y += w.player.vy * dt;
        if (w.deathTimer <= 0) {
          G.state = 'gameover';
          if (G.totalScore > G.best) {
            G.best = G.totalScore;
            save();
          }
        }
      } else {
        updatePlayer(w, dt);
      }
      updateEntities(w, dt);
      if (w.collapse.active) {
        w.collapse.speed += w.def.collapseRamp * dt;
        w.collapse.x -= w.collapse.speed * dt;
        w.shake = Math.max(w.shake, 2.2);
        if (Math.random() < dt * 0.7) Audio.play('rumble');
      }
      w.shake *= Math.pow(0.12, dt);
      updateCamera(w, dt);
      Audio.update(dt, w.collapse.active ? 1 : 0.25);
    } else {
      Audio.update(dt, 0);
    }
  };

  /* --------------------------------------------------------------- render */

  function worldRender(ctx, w) {
    var view = G.view;
    var vp = view.vp;
    var scale = view.scale;
    var shake = w.shake;
    var camX = w.cam.x + (Math.random() - 0.5) * shake;
    var camY = w.cam.y + (Math.random() - 0.5) * shake;
    var visW = vp.w / scale;
    var visH = vp.h / scale;
    var maxCamY = Math.max(0, w.h * TS - visH);
    var floorY = vp.y + vp.h;

    Art.drawSky(ctx, view, w.theme);
    Art.drawLayer(ctx, w.backdrop.far, view, camX, 0.12,
      floorY + (maxCamY - camY) * 0.12 * scale, 0.85, scale);
    Art.drawLayer(ctx, w.backdrop.mid, view, camX, 0.32,
      floorY + 18 * scale + (maxCamY - camY) * 0.32 * scale, 0.95, scale);

    ctx.save();
    ctx.beginPath();
    ctx.rect(vp.x, vp.y, vp.w, vp.h);
    ctx.clip();
    ctx.translate(vp.x, vp.y);
    ctx.scale(scale, scale);
    ctx.translate(-camX, -camY);
    var tx0 = Math.max(0, Math.floor(camX / TS) - 1);
    var tx1 = Math.min(w.w - 1, Math.floor((camX + visW) / TS) + 1);
    var ty0 = Math.max(0, Math.floor(camY / TS) - 1);
    var ty1 = Math.min(w.h - 1, Math.floor((camY + visH) / TS) + 1);
    var tiles = w.tiles;

    for (var ty = ty0; ty <= ty1; ty++) {
      for (var tx = tx0; tx <= tx1; tx++) {
        var ch = w.grid[ty][tx];
        if (ch === ' ') continue;
        var px = tx * TS;
        var py = ty * TS;
        var vi = ((((tx * 73856093) ^ (ty * 19349663)) >>> 0) % tiles.stone.length);
        if (ch === '#' || ch === '<' || ch === '>') {
          var above = ty > 0 ? w.grid[ty - 1][tx] : ' ';
          var img = (above === ' ' || above === 'v' || above === '^') ? tiles.mossy[vi] : tiles.stone[vi];
          ctx.drawImage(Art.prescale(img, TS * scale, TS * scale), px, py, TS, TS);
          if (ch === '<' || ch === '>') {
            ctx.fillStyle = 'rgba(10,6,2,0.9)';
            ctx.fillRect(ch === '<' ? px + 1 : px + TS - 8, py + TS / 2 - 5, 7, 10);
            ctx.strokeStyle = 'rgba(0,0,0,0.5)';
            ctx.strokeRect(ch === '<' ? px + 1 : px + TS - 8, py + TS / 2 - 5, 7, 10);
          }
        } else if (ch === '~') {
          var c = w.crumbles[key(tx, ty)];
          if (c && c.state === 'gone') continue;
          var jitter = c && c.state === 'shaking' ? (Math.random() - 0.5) * 2.4 : 0;
          ctx.globalAlpha = c && c.state === 'falling' ? Math.max(0, 1 - c.oy / (TS * 6)) : 1;
          ctx.drawImage(Art.prescale(tiles.crumble[vi], TS * scale, TS * scale),
            px + jitter, py + (c ? c.oy : 0), TS, TS);
          ctx.globalAlpha = 1;
        } else if (ch === '^') {
          ctx.drawImage(Art.prescale(tiles.spike, TS * scale, TS * scale), px, py, TS, TS);
        } else if (ch === 'v') {
          ctx.drawImage(Art.prescale(tiles.vine, TS * scale, TS * scale), px, py, TS, TS);
        }
      }
    }

    /* door */
    if (w.door) {
      var dx = w.door.x;
      var dy = w.door.y - TS;
      ctx.drawImage(Art.prescale(tiles.door, TS * scale, TS * 2 * scale), dx, dy, TS, TS * 2);
      if (w.doorOpen) {
        var glow = ctx.createRadialGradient(dx + TS / 2, dy + TS, 0, dx + TS / 2, dy + TS, 90);
        var a = 0.35 + Math.sin(w.time * 4) * 0.12;
        glow.addColorStop(0, 'rgba(255,214,120,' + a.toFixed(3) + ')');
        glow.addColorStop(1, 'rgba(255,190,80,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(dx - 90, dy - 60, 180, 180);
        Art.chiselText(ctx, 'ESCAPE', dx + TS / 2, dy - 16, 13);
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(dx + 4, dy + 6, TS - 8, TS * 2 - 6);
      }
    }

    var i;
    for (i = 0; i < w.torches.length; i++) {
      var t = w.torches[i];
      if (t.checkpoint) {
        Art.drawTorch(ctx, t.x, t.y, w.time, t.lit, t.seed);
      } else {
        Art.drawBrazier(ctx, t.x, t.y - 12, w.time, t.seed);
      }
    }

    for (i = 0; i < w.entities.length; i++) {
      var e = w.entities[i];
      if (e.alive === false) continue;
      if (e.type === 'coin') Art.drawCoin(ctx, e, w.time);
      else if (e.type === 'gem') Art.drawGem(ctx, e, w.time);
      else if (e.type === 'relic') Art.drawRelic(ctx, e, w.time);
      else if (e.type === 'guardian') Art.drawGuardian(ctx, e, w.theme, w.time);
      else if (e.type === 'bat') Art.drawBat(ctx, e, w.time);
      else if (e.type === 'mover') {
        var g = ctx.createLinearGradient(0, e.y, 0, e.y + e.h);
        g.addColorStop(0, Art.shade(w.theme.stoneHi, 20));
        g.addColorStop(1, w.theme.stoneEdge);
        ctx.fillStyle = g;
        ctx.fillRect(e.x, e.y, e.w, e.h);
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 2;
        ctx.strokeRect(e.x, e.y, e.w, e.h);
        ctx.fillStyle = w.theme.glyph;
        ctx.fillRect(e.x + 6, e.y + 4, e.w - 12, 2);
      }
    }

    for (i = 0; i < w.darts.length; i++) Art.drawDart(ctx, w.darts[i]);
    for (i = 0; i < w.rocks.length; i++) Art.drawRock(ctx, w.rocks[i], w.theme);

    var p = w.player;
    if (!(p.invuln > 0 && Math.floor(w.time * 20) % 2 === 0)) {
      ctx.save();
      if (p.dead) {
        ctx.globalAlpha = 0.7;
        ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
        ctx.rotate(Math.PI);
        ctx.translate(-(p.x + p.w / 2), -(p.y + p.h / 2));
      }
      Art.drawPlayer(ctx, p, w.time);
      ctx.restore();
    }

    for (i = 0; i < w.particles.length; i++) {
      var pa = w.particles[i];
      ctx.globalAlpha = Math.max(0, pa.life / pa.max);
      ctx.fillStyle = pa.color;
      ctx.fillRect(pa.x, pa.y, pa.size, pa.size);
    }
    ctx.globalAlpha = 1;

    /* the wall of collapsing stone */
    if (w.collapse.active) {
      var cx = w.collapse.x;
      var grad = ctx.createLinearGradient(cx - 90, 0, cx + 40, 0);
      grad.addColorStop(0, 'rgba(20,10,4,0)');
      grad.addColorStop(0.55, 'rgba(28,14,6,0.75)');
      grad.addColorStop(1, 'rgba(10,5,2,0.98)');
      ctx.fillStyle = grad;
      ctx.fillRect(cx - 90, camY - 40, visW + 200, visH + 120);
      ctx.fillStyle = 'rgba(120,88,50,0.5)';
      for (i = 0; i < 26; i++) {
        var rx = cx + Math.sin(w.time * 2.2 + i * 1.7) * 26 + (i % 5) * 8;
        var ry = camY + ((i * 97 + w.time * 40) % (visH + 80));
        ctx.beginPath();
        ctx.arc(rx, ry, 8 + (i % 4) * 6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(255,170,80,0.35)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx, camY - 40);
      ctx.lineTo(cx, camY + visH + 60);
      ctx.stroke();
    }

    ctx.restore();

    Art.drawLayer(ctx, w.backdrop.canopy, view, camX, 0.6,
      vp.y + w.backdrop.canopy.worldH * scale - (camY - maxCamY) * 0.18 * scale, 0.85, scale);
    Art.drawLayer(ctx, w.backdrop.near, view, camX, 0.7,
      floorY + (w.backdrop.near.worldH - 72) * scale + (maxCamY - camY) * scale, 0.92, scale);

    Art.drawVignette(ctx, view, w.theme);
  }

  /* Re-bake the artwork when the zoom or pixel ratio changes enough that the
     current bitmaps would be visibly upscaled. */
  G.rebuildArt = function () {
    if (!G.world) return;
    G.world.tiles = Art.buildTiles(G.world.theme, G.detail);
    G.world.backdrop = Art.backdropLayers(G.world.theme, G.detail);
  };

  G.renderWorld = worldRender;
  G.startLevel = startLevel;
  G.restartLevel = restartLevel;
  G.load = load;
  G.save = save;
  G.buildWorld = buildWorld;
  G.SCORE = SCORE;
  G.MAX_HEARTS = MAX_HEARTS;

  RR.Game = G;
})();
