/* Relic Raider - all artwork is drawn procedurally onto canvases at boot,
   so the game ships with zero image files. */
window.RR = window.RR || {};
(function () {
  'use strict';

  var TS = 32; /* tile size in world pixels */

  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s |= 0;
      s = (s + 0x6d2b79f5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function make(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  function shade(hex, amt) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.min(255, Math.max(0, ((n >> 16) & 255) + amt));
    var g = Math.min(255, Math.max(0, ((n >> 8) & 255) + amt));
    var b = Math.min(255, Math.max(0, (n & 255) + amt));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  /* ---------------------------------------------------------------- tiles */

  function stoneTile(theme, seed, mossy) {
    var c = make(TS, TS);
    var g = c.getContext('2d');
    var rnd = rng(seed);
    var grad = g.createLinearGradient(0, 0, TS, TS);
    grad.addColorStop(0, shade(theme.stoneHi, 8));
    grad.addColorStop(1, theme.stoneLo);
    g.fillStyle = grad;
    g.fillRect(0, 0, TS, TS);

    /* mortar frame */
    g.strokeStyle = theme.stoneEdge;
    g.lineWidth = 2;
    g.strokeRect(1, 1, TS - 2, TS - 2);
    g.strokeStyle = 'rgba(255,255,255,0.10)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(2.5, TS - 3);
    g.lineTo(2.5, 2.5);
    g.lineTo(TS - 3, 2.5);
    g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.beginPath();
    g.moveTo(TS - 2.5, 3);
    g.lineTo(TS - 2.5, TS - 2.5);
    g.lineTo(3, TS - 2.5);
    g.stroke();

    /* weathering */
    var i;
    for (i = 0; i < 16; i++) {
      var x = rnd() * TS;
      var y = rnd() * TS;
      var s = 1 + rnd() * 2.5;
      g.fillStyle = rnd() > 0.5 ? 'rgba(0,0,0,0.13)' : 'rgba(255,255,255,0.07)';
      g.fillRect(x, y, s, s);
    }
    if (rnd() > 0.6) {
      /* a carved glyph on some blocks */
      var cx = 7 + rnd() * 10;
      var glyph = Math.floor(rnd() * 4);
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.lineWidth = 2;
      g.beginPath();
      if (glyph === 0) {
        g.moveTo(cx, 9); g.lineTo(cx + 9, 9); g.lineTo(cx + 9, 15);
        g.lineTo(cx + 3, 15); g.lineTo(cx + 3, 21); g.lineTo(cx + 12, 21);
      } else if (glyph === 1) {
        g.moveTo(cx, 21); g.lineTo(cx, 11); g.lineTo(cx + 11, 11);
        g.lineTo(cx + 11, 21); g.moveTo(cx + 4, 15); g.lineTo(cx + 7, 15);
      } else if (glyph === 2) {
        g.moveTo(cx + 5, 8); g.lineTo(cx + 11, 15); g.lineTo(cx + 5, 22);
        g.lineTo(cx - 1, 15); g.closePath();
      } else {
        g.moveTo(cx, 10); g.lineTo(cx + 11, 10);
        g.moveTo(cx + 5, 10); g.lineTo(cx + 5, 21);
        g.moveTo(cx, 21); g.lineTo(cx + 11, 21);
      }
      g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.09)';
      g.lineWidth = 1;
      g.stroke();
    }
    if (mossy) {
      g.fillStyle = theme.moss;
      g.globalAlpha = 0.85;
      for (i = 0; i < TS; i += 2) {
        var hgt = 2 + Math.floor(rnd() * 5);
        g.fillRect(i, 0, 2, hgt);
      }
      g.globalAlpha = 0.5;
      for (i = 0; i < 6; i++) {
        g.fillRect(rnd() * TS, 4 + rnd() * 5, 2, 2);
      }
      g.globalAlpha = 1;
    }
    return c;
  }

  function crumbleTile(theme, seed) {
    var c = make(TS, TS);
    var g = c.getContext('2d');
    var rnd = rng(seed);
    var grad = g.createLinearGradient(0, 0, 0, TS);
    grad.addColorStop(0, shade(theme.stoneHi, 22));
    grad.addColorStop(1, shade(theme.stoneLo, -14));
    g.fillStyle = grad;
    g.fillRect(0, 0, TS, TS);
    g.strokeStyle = 'rgba(0,0,0,0.45)';
    g.lineWidth = 1.6;
    for (var i = 0; i < 4; i++) {
      g.beginPath();
      var x = 3 + rnd() * (TS - 6);
      g.moveTo(x, 0);
      for (var y = 4; y < TS; y += 6) {
        x += (rnd() - 0.5) * 9;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    g.fillStyle = 'rgba(0,0,0,0.2)';
    g.fillRect(0, TS - 4, TS, 4);
    g.strokeStyle = theme.stoneEdge;
    g.lineWidth = 2;
    g.strokeRect(1, 1, TS - 2, TS - 2);
    return c;
  }

  function spikeTile(theme) {
    var c = make(TS, TS);
    var g = c.getContext('2d');
    for (var i = 0; i < 4; i++) {
      var x = i * 8;
      var grad = g.createLinearGradient(x, TS, x + 8, 10);
      grad.addColorStop(0, shade(theme.stoneEdge, 10));
      grad.addColorStop(1, '#e8e2cf');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(x, TS);
      g.lineTo(x + 4, 4);
      g.lineTo(x + 8, TS);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.4)';
      g.lineWidth = 1;
      g.stroke();
    }
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, TS - 3, TS, 3);
    return c;
  }

  function vineTile(theme, seed) {
    var c = make(TS, TS);
    var g = c.getContext('2d');
    var rnd = rng(seed);
    g.strokeStyle = shade(theme.moss, -30);
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(TS / 2 - 3, 0);
    g.quadraticCurveTo(TS / 2 + 5, TS / 2, TS / 2 - 2, TS);
    g.stroke();
    g.strokeStyle = theme.moss;
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = theme.moss;
    for (var i = 0; i < 5; i++) {
      var y = 3 + i * 6 + rnd() * 2;
      var dir = i % 2 ? 1 : -1;
      g.beginPath();
      g.ellipse(TS / 2 + dir * 7, y, 6, 3, dir * 0.5, 0, Math.PI * 2);
      g.fill();
    }
    return c;
  }

  function doorTile(theme) {
    var c = make(TS, TS * 2);
    var g = c.getContext('2d');
    g.fillStyle = theme.stoneEdge;
    g.fillRect(0, 0, TS, TS * 2);
    var grad = g.createLinearGradient(0, 0, 0, TS * 2);
    grad.addColorStop(0, '#20170e');
    grad.addColorStop(1, '#0b0805');
    g.fillStyle = grad;
    g.fillRect(4, 6, TS - 8, TS * 2 - 6);
    g.strokeStyle = shade(theme.stoneHi, 20);
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(2, TS * 2);
    g.lineTo(2, 8);
    g.lineTo(TS / 2, 1);
    g.lineTo(TS - 2, 8);
    g.lineTo(TS - 2, TS * 2);
    g.stroke();
    return c;
  }

  function buildTiles(theme) {
    var t = { stone: [], mossy: [], crumble: [] };
    for (var i = 0; i < 4; i++) {
      t.stone.push(stoneTile(theme, 1000 + i * 77, false));
      t.mossy.push(stoneTile(theme, 2000 + i * 91, true));
      t.crumble.push(crumbleTile(theme, 3000 + i * 53));
    }
    t.spike = spikeTile(theme);
    t.vine = vineTile(theme, 4242);
    t.door = doorTile(theme);
    return t;
  }

  /* ----------------------------------------------------------- background */

  function backdropLayers(theme) {
    var W = 768;
    var H = 448;
    var x, i;

    /* far: stepped pyramids fading into the haze */
    var far = make(W, H);
    var g = far.getContext('2d');
    var rnd = rng(7);
    for (x = -60; x < W + 60; x += 130 + rnd() * 70) {
      var h = 150 + rnd() * 170;
      var bw = 170 + rnd() * 110;
      var steps = 6;
      g.fillStyle = theme.far;
      for (var s2 = 0; s2 < steps; s2++) {
        var sw = bw * (1 - s2 / steps) * 0.94;
        var sy = H - h * ((s2 + 1) / steps);
        g.fillRect(x + (bw - sw) / 2, sy, sw, h / steps + 2);
        g.fillStyle = shade(theme.far, 6 + s2 * 3);
      }
    }
    var haze = g.createLinearGradient(0, H - 220, 0, H);
    haze.addColorStop(0, 'rgba(255,255,255,0)');
    haze.addColorStop(1, theme.fog);
    g.fillStyle = haze;
    g.fillRect(0, H - 220, W, 220);

    /* mid: ruined colonnade with jungle growing through it */
    var mid = make(W, H);
    g = mid.getContext('2d');
    rnd = rng(19);
    for (x = 10; x < W; x += 88 + rnd() * 34) {
      var ch = 170 + rnd() * 150;
      var cw = 24 + rnd() * 14;
      var broken = rnd() > 0.55;
      var col = g.createLinearGradient(x, 0, x + cw, 0);
      col.addColorStop(0, shade(theme.stoneLo, -18));
      col.addColorStop(0.45, shade(theme.stoneLo, 12));
      col.addColorStop(1, shade(theme.stoneLo, -30));
      g.fillStyle = col;
      g.fillRect(x, H - ch, cw, ch);
      g.fillRect(x - 6, H - 18, cw + 12, 18);
      if (!broken) {
        g.fillRect(x - 8, H - ch - 12, cw + 16, 14);
        g.fillRect(x - 14, H - ch - 22, cw + 28, 11);
      } else {
        g.fillStyle = shade(theme.stoneLo, -34);
        g.beginPath();
        g.moveTo(x, H - ch + 14);
        g.lineTo(x + cw * 0.6, H - ch - 6);
        g.lineTo(x + cw, H - ch + 10);
        g.lineTo(x + cw, H - ch + 22);
        g.lineTo(x, H - ch + 22);
        g.closePath();
        g.fill();
      }
      /* creeper on the column */
      g.strokeStyle = theme.canopy;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(x + cw * 0.3, H - ch + 20);
      for (var yy = H - ch + 30; yy < H; yy += 26) {
        g.lineTo(x + cw * (rnd() * 0.8), yy);
      }
      g.stroke();
    }
    /* tree trunks + canopy mass */
    for (i = 0; i < 7; i++) {
      var tx = rnd() * W;
      var lean = (rnd() - 0.5) * 60;
      g.strokeStyle = theme.bark || shade(theme.mid, -16);
      g.lineWidth = 16 + rnd() * 14;
      g.beginPath();
      g.moveTo(tx, H);
      g.quadraticCurveTo(tx + lean * 0.4, H - 170, tx + lean, H - 310);
      g.stroke();
      g.fillStyle = theme.canopy;
      for (var bi = 0; bi < 9; bi++) {
        g.beginPath();
        g.ellipse(tx + lean + (rnd() - 0.5) * 120, H - 300 + (rnd() - 0.5) * 90,
          38 + rnd() * 34, 22 + rnd() * 16, (rnd() - 0.5) * 0.8, 0, Math.PI * 2);
        g.fill();
      }
    }
    for (i = 0; i < 260; i++) {
      var lx = rnd() * W;
      var ly = H - rnd() * 150;
      var r = 14 + rnd() * 30;
      g.fillStyle = i % 3 ? theme.canopy : theme.mid;
      g.globalAlpha = 0.92;
      g.beginPath();
      g.ellipse(lx, ly, r, r * 0.6, rnd() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    g.fillStyle = theme.fog;
    g.fillRect(0, 0, W, H);
    var midHaze = g.createLinearGradient(0, H - 260, 0, H);
    midHaze.addColorStop(0, 'rgba(255,255,255,0)');
    midHaze.addColorStop(1, theme.fog);
    g.fillStyle = midHaze;
    g.fillRect(0, H - 260, W, 260);

    /* near: undergrowth, anchored to the bottom of the view */
    var NH = 200;
    var near = make(W, NH);
    g = near.getContext('2d');
    rnd = rng(31);
    g.fillStyle = theme.near;
    for (i = 0; i < 150; i++) {
      var nx = rnd() * W;
      var ny = NH - rnd() * 80;
      var nr = 18 + rnd() * 38;
      g.beginPath();
      g.ellipse(nx, ny, nr, nr * 0.5, (rnd() - 0.5) * 1.2, 0, Math.PI * 2);
      g.fill();
    }
    for (i = 0; i < 20; i++) {
      var bx = rnd() * W;
      var by = NH - 30 - rnd() * 40;
      var ang = -Math.PI / 2 + (rnd() - 0.5) * 1.7;
      var len = 50 + rnd() * 60;
      g.save();
      g.translate(bx, by);
      g.rotate(ang);
      g.strokeStyle = theme.near;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(len, 0);
      g.stroke();
      g.fillStyle = theme.near;
      for (var k = 0; k < 8; k++) {
        var fx = (k / 8) * len;
        var fl = 15 * (1 - k / 11);
        g.beginPath();
        g.ellipse(fx, -fl * 0.7, fl, 4, -0.5, 0, Math.PI * 2);
        g.ellipse(fx, fl * 0.7, fl, 4, 0.5, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    }

    /* canopy: leaf ceiling with vines, anchored to the top of the view */
    var CH2 = 230;
    var canopy = make(W, CH2);
    g = canopy.getContext('2d');
    rnd = rng(53);
    for (i = 0; i < 16; i++) {
      var vx = rnd() * W;
      var vl = 50 + rnd() * 150;
      var sway = (rnd() - 0.5) * 34;
      g.strokeStyle = shade(theme.canopy, -20);
      g.lineWidth = 2 + rnd() * 2;
      g.beginPath();
      g.moveTo(vx, 20);
      g.quadraticCurveTo(vx + sway, 20 + vl * 0.55, vx + sway * 0.5, 20 + vl);
      g.stroke();
      g.fillStyle = shade(theme.canopy, -10);
      for (k = 1; k < 8; k++) {
        var tt = k / 8;
        var lxx = vx + sway * (2 * tt * (1 - tt)) + sway * 0.5 * tt * tt;
        var lyy = 20 + vl * tt;
        g.beginPath();
        g.ellipse(lxx + (k % 2 ? 4 : -4), lyy, 5, 2.4, k % 2 ? 0.5 : -0.5, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.fillStyle = shade(theme.canopy, -18);
    for (i = 0; i < 70; i++) {
      g.beginPath();
      g.ellipse(rnd() * W, rnd() * 34 - 10, 26 + rnd() * 30, 15 + rnd() * 12, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = shade(theme.canopy, -34);
    g.fillRect(0, 0, W, 14);

    return { far: far, mid: mid, near: near, canopy: canopy, w: W, h: H };
  }

  function drawSky(ctx, view, theme) {
    var g = ctx.createLinearGradient(0, 0, 0, view.h);
    g.addColorStop(0, theme.skyTop);
    g.addColorStop(0.55, theme.skyMid);
    g.addColorStop(1, theme.skyLow);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.w, view.h);
    var sx = view.w * 0.62;
    var sy = view.h * 0.22;
    var rad = Math.max(view.w, view.h) * 0.45;
    var sun = ctx.createRadialGradient(sx, sy, 0, sx, sy, rad);
    sun.addColorStop(0, theme.sun);
    sun.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, view.w, view.h);
  }

  /* Draw a parallax layer, repeated horizontally. camX is in world units and
     baseY is the screen y the layer's bottom edge should sit on. */
  function drawLayer(ctx, layer, view, camX, factor, baseY, alpha, scale) {
    scale = scale || 1;
    var w = Math.ceil(layer.width * scale);
    var h = Math.ceil(layer.height * scale);
    var y = Math.round(baseY - h);
    var offset = -((camX * factor * scale) % w);
    if (offset > 0) offset -= w;
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    for (var x = offset; x < view.w; x += w) {
      ctx.drawImage(layer, Math.round(x), y, w, h);
    }
    ctx.globalAlpha = 1;
  }

  /* -------------------------------------------------------------- sprites */

  function drawPlayer(ctx, p, t) {
    var w = p.w;
    var h = p.h;
    var x = p.x;
    var y = p.y;
    ctx.save();
    ctx.translate(Math.round(x + w / 2), Math.round(y + h));
    if (p.face < 0) ctx.scale(-1, 1);

    var run = p.onGround && Math.abs(p.vx) > 12;
    var swing = run ? Math.sin(t * 15) : 0;
    var bob = run ? Math.abs(Math.sin(t * 15)) * 1.6 : 0;
    if (!p.onGround) swing = 0.6;

    /* shadow */
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(0, 1, w * 0.5, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.translate(0, -bob);

    /* legs */
    ctx.strokeStyle = '#5a3f27';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-2, -10);
    ctx.lineTo(-2 + swing * 5, -1);
    ctx.moveTo(3, -10);
    ctx.lineTo(3 - swing * 5, -1);
    ctx.stroke();

    /* pack */
    ctx.fillStyle = '#6b4a2a';
    ctx.fillRect(-9, -22, 6, 10);

    /* body */
    var body = ctx.createLinearGradient(0, -24, 0, -8);
    body.addColorStop(0, '#d8c290');
    body.addColorStop(1, '#a98f5f');
    ctx.fillStyle = body;
    ctx.fillRect(-6, -23, 12, 14);
    ctx.fillStyle = '#7a5a34';
    ctx.fillRect(-6, -13, 12, 3);

    /* arm */
    ctx.strokeStyle = '#c8ad78';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(2, -21);
    ctx.lineTo(5 + swing * 4, -13);
    ctx.stroke();

    /* head */
    ctx.fillStyle = '#e6c39a';
    ctx.beginPath();
    ctx.arc(1, -27, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#241a10';
    ctx.fillRect(3, -28, 2, 2);

    /* hat */
    ctx.fillStyle = '#7b5228';
    ctx.beginPath();
    ctx.ellipse(1, -30, 10, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8d5f2e';
    ctx.beginPath();
    ctx.ellipse(1, -33, 6, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4d331a';
    ctx.fillRect(-5, -31.5, 12, 2);
    ctx.restore();
  }

  function drawGuardian(ctx, e, theme, t) {
    var cx = e.x + e.w / 2;
    var cy = e.y + e.h;
    ctx.save();
    ctx.translate(Math.round(cx), Math.round(cy));
    if (e.vx < 0) ctx.scale(-1, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 0, e.w * 0.5, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    var step = Math.sin(t * 6) * 3;
    var g = ctx.createLinearGradient(0, -e.h, 0, 0);
    g.addColorStop(0, shade(theme.stoneHi, 14));
    g.addColorStop(1, theme.stoneLo);
    ctx.fillStyle = g;
    ctx.fillRect(-9, -12, 6, 12);
    ctx.fillRect(3, -12, 6, 12);
    ctx.fillRect(-11, -30, 22, 20);
    ctx.fillRect(-13, -40, 26, 11);
    /* headdress + glowing eyes */
    ctx.fillStyle = theme.glyph;
    ctx.fillRect(-15, -44, 30, 5);
    ctx.fillRect(-7, -36, 4, 4);
    ctx.fillRect(3, -36, 4, 4);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(-11 + step, -28, 22, 3);
    ctx.restore();
  }

  function drawBat(ctx, e, t) {
    var cx = e.x + e.w / 2;
    var cy = e.y + e.h / 2;
    var flap = Math.sin(t * 16 + e.seed) * 7;
    ctx.save();
    ctx.translate(Math.round(cx), Math.round(cy));
    ctx.fillStyle = '#2b2029';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-12, -8 - flap, -20, 2 - flap * 0.4);
    ctx.quadraticCurveTo(-11, 0, 0, 6);
    ctx.quadraticCurveTo(11, 0, 20, 2 - flap * 0.4);
    ctx.quadraticCurveTo(12, -8 - flap, 0, 0);
    ctx.fill();
    ctx.fillStyle = '#3a2c37';
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffcf6b';
    ctx.fillRect(-3, -2, 2, 2);
    ctx.fillRect(1, -2, 2, 2);
    ctx.restore();
  }

  function drawCoin(ctx, e, t) {
    var cx = e.x + e.w / 2;
    var cy = e.y + e.h / 2 + Math.sin(t * 3 + e.seed) * 2;
    var sw = Math.abs(Math.cos(t * 3 + e.seed));
    ctx.save();
    ctx.translate(cx, cy);
    var g = ctx.createLinearGradient(-8, -8, 8, 8);
    g.addColorStop(0, '#ffe9a8');
    g.addColorStop(0.5, '#e5b23c');
    g.addColorStop(1, '#9a6c14');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, Math.max(1.5, 8 * sw), 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(90,60,10,0.8)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (sw > 0.45) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(-2 * sw, -4, 2 * sw, 8);
    }
    ctx.restore();
  }

  function drawGem(ctx, e, t) {
    var cx = e.x + e.w / 2;
    var cy = e.y + e.h / 2 + Math.sin(t * 2.4 + e.seed) * 3;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.sin(t + e.seed) * 0.2);
    var glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 22);
    glow.addColorStop(0, 'rgba(120,235,255,0.35)');
    glow.addColorStop(1, 'rgba(120,235,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-22, -22, 44, 44);
    var g = ctx.createLinearGradient(0, -11, 0, 11);
    g.addColorStop(0, '#bff4ff');
    g.addColorStop(0.5, '#48c6e0');
    g.addColorStop(1, '#1d6c8c');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(8, -3);
    ctx.lineTo(0, 11);
    ctx.lineTo(-8, -3);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  function drawRelic(ctx, e, t) {
    var cx = e.x + e.w / 2;
    var cy = e.y + e.h / 2 + Math.sin(t * 2) * 3;
    ctx.save();
    ctx.translate(cx, cy);
    var pulse = 0.75 + Math.sin(t * 3) * 0.25;
    var glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 60 * pulse);
    glow.addColorStop(0, 'rgba(255,214,120,0.55)');
    glow.addColorStop(0.5, 'rgba(255,180,60,0.18)');
    glow.addColorStop(1, 'rgba(255,180,60,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-64, -64, 128, 128);

    var g = ctx.createLinearGradient(0, -16, 0, 16);
    g.addColorStop(0, '#fff0bd');
    g.addColorStop(0.45, '#e8b444');
    g.addColorStop(1, '#8c5f14');
    ctx.fillStyle = g;
    /* headdress */
    ctx.beginPath();
    ctx.moveTo(-13, -4);
    for (var i = 0; i <= 8; i++) {
      var a = Math.PI + (i / 8) * Math.PI;
      ctx.lineTo(Math.cos(a) * -14, Math.sin(a) * -16 - 2);
    }
    ctx.closePath();
    ctx.fill();
    /* face */
    ctx.beginPath();
    ctx.ellipse(0, 1, 9, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5d3b09';
    ctx.fillRect(-5, -3, 3, 2);
    ctx.fillRect(2, -3, 3, 2);
    ctx.fillRect(-4, 5, 8, 2);
    ctx.restore();
  }

  function drawTorch(ctx, x, y, t, lit, seed) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#4a3520';
    ctx.fillRect(-4, -6, 8, 22);
    ctx.fillStyle = '#6d5033';
    ctx.fillRect(-7, -8, 14, 5);
    if (lit) {
      var f = Math.sin(t * 9 + seed) * 0.25 + 1;
      var glow = ctx.createRadialGradient(0, -14, 0, 0, -14, 46 * f);
      glow.addColorStop(0, 'rgba(255,190,90,0.42)');
      glow.addColorStop(1, 'rgba(255,150,40,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(-50, -60, 100, 100);
      var g = ctx.createLinearGradient(0, -26 * f, 0, -6);
      g.addColorStop(0, 'rgba(255,240,180,0.95)');
      g.addColorStop(0.5, '#ff9d29');
      g.addColorStop(1, 'rgba(190,60,10,0.2)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, -26 * f);
      ctx.quadraticCurveTo(9, -12, 6, -6);
      ctx.quadraticCurveTo(0, -2, -6, -6);
      ctx.quadraticCurveTo(-9, -12, 0, -26 * f);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawDart(ctx, d) {
    ctx.save();
    ctx.translate(d.x, d.y);
    if (d.vx < 0) ctx.scale(-1, 1);
    ctx.fillStyle = '#3a2a19';
    ctx.fillRect(-10, -1.5, 18, 3);
    ctx.fillStyle = '#cfc7ad';
    ctx.beginPath();
    ctx.moveTo(8, -4);
    ctx.lineTo(14, 0);
    ctx.lineTo(8, 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#8d6c3f';
    ctx.fillRect(-11, -4, 4, 8);
    ctx.restore();
  }

  function drawRock(ctx, r, theme) {
    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.rotate(r.rot);
    ctx.fillStyle = shade(theme.stoneLo, -18);
    ctx.beginPath();
    ctx.moveTo(-r.r, 0);
    ctx.lineTo(-r.r * 0.4, -r.r);
    ctx.lineTo(r.r * 0.7, -r.r * 0.6);
    ctx.lineTo(r.r, r.r * 0.3);
    ctx.lineTo(0, r.r);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  function drawBrazier(ctx, x, y, t, seed) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#3b2c1c';
    ctx.beginPath();
    ctx.moveTo(-9, 16);
    ctx.lineTo(-6, 2);
    ctx.lineTo(6, 2);
    ctx.lineTo(9, 16);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#5a442b';
    ctx.fillRect(-11, -2, 22, 5);
    var f = Math.sin(t * 8 + seed) * 0.2 + 1;
    var glow = ctx.createRadialGradient(0, -8, 0, 0, -8, 60 * f);
    glow.addColorStop(0, 'rgba(255,180,80,0.35)');
    glow.addColorStop(1, 'rgba(255,150,40,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-60, -60, 120, 100);
    var g = ctx.createLinearGradient(0, -22 * f, 0, 0);
    g.addColorStop(0, 'rgba(255,240,190,0.9)');
    g.addColorStop(0.6, '#ff9b2a');
    g.addColorStop(1, 'rgba(180,60,10,0.15)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -22 * f);
    ctx.quadraticCurveTo(10, -8, 7, 0);
    ctx.quadraticCurveTo(0, 4, -7, 0);
    ctx.quadraticCurveTo(-10, -8, 0, -22 * f);
    ctx.fill();
    ctx.restore();
  }

  /* ------------------------------------------------------------------- UI */

  function goldGradient(ctx, y, h) {
    var g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#fff3c4');
    g.addColorStop(0.35, '#e9c05f');
    g.addColorStop(0.55, '#b07f24');
    g.addColorStop(0.75, '#f0cf7a');
    g.addColorStop(1, '#8a5f18');
    return g;
  }

  function fontSpec(size, opts) {
    return (opts.weight || 'bold') + ' ' + size + 'px ' +
      (opts.font || 'Georgia, "Times New Roman", serif');
  }

  /* Largest font size at which `text` still fits inside maxWidth. */
  function fitFont(ctx, text, size, maxWidth, opts) {
    opts = opts || {};
    ctx.save();
    if (opts.letterSpacing && ctx.letterSpacing !== undefined) ctx.letterSpacing = opts.letterSpacing;
    var s = size;
    for (var i = 0; i < 24; i++) {
      ctx.font = fontSpec(s, opts);
      if (ctx.measureText(text).width <= maxWidth) break;
      s *= 0.92;
    }
    ctx.restore();
    return s;
  }

  /* Chiselled gold lettering, drawn centred on x. */
  function chiselText(ctx, text, x, y, size, opts) {
    opts = opts || {};
    if (opts.maxWidth) size = fitFont(ctx, text, size, opts.maxWidth, opts);
    ctx.save();
    ctx.font = fontSpec(size, opts);
    ctx.textAlign = opts.align || 'center';
    ctx.textBaseline = 'middle';
    if (opts.letterSpacing && ctx.letterSpacing !== undefined) {
      ctx.letterSpacing = opts.letterSpacing;
    }
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(20,12,4,0.85)';
    ctx.lineWidth = Math.max(3, size * 0.14);
    ctx.strokeText(text, x, y);
    ctx.fillStyle = 'rgba(255,240,190,0.25)';
    ctx.fillText(text, x, y + size * 0.05);
    ctx.fillStyle = opts.fill || goldGradient(ctx, y - size * 0.6, size * 1.2);
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  /* Carved stone-and-gold plate used for the logo and the menu buttons. */
  function plaque(ctx, x, y, w, h, opts) {
    opts = opts || {};
    var r = opts.radius == null ? 8 : opts.radius;
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, x, y, w, h, r);
    ctx.fillStyle = 'rgba(12,8,4,0.55)';
    ctx.fill();

    ctx.beginPath();
    roundRect(ctx, x + 3, y + 3, w - 6, h - 6, r - 2);
    var g = ctx.createLinearGradient(0, y, 0, y + h);
    if (opts.hot) {
      g.addColorStop(0, '#f6d98d');
      g.addColorStop(0.5, '#c08c2c');
      g.addColorStop(1, '#7c5312');
    } else {
      g.addColorStop(0, '#d9b463');
      g.addColorStop(0.5, '#9c6f20');
      g.addColorStop(1, '#5f420f');
    }
    ctx.fillStyle = g;
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,236,180,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    roundRect(ctx, x + 6, y + 6, w - 12, h - 12, Math.max(2, r - 4));
    ctx.stroke();
    ctx.strokeStyle = 'rgba(40,24,6,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    roundRect(ctx, x + 9, y + 9, w - 18, h - 18, Math.max(1, r - 6));
    ctx.stroke();

    /* corner studs */
    var pad = 12;
    ctx.fillStyle = 'rgba(255,230,170,0.75)';
    [[x + pad, y + pad], [x + w - pad, y + pad], [x + pad, y + h - pad], [x + w - pad, y + h - pad]]
      .forEach(function (p) {
        ctx.beginPath();
        ctx.arc(p[0], p[1], 2.6, 0, Math.PI * 2);
        ctx.fill();
      });
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function heart(ctx, x, y, s, filled) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s / 16, s / 16);
    ctx.beginPath();
    ctx.moveTo(0, 5);
    ctx.bezierCurveTo(-10, -4, -6, -12, 0, -6);
    ctx.bezierCurveTo(6, -12, 10, -4, 0, 5);
    ctx.closePath();
    ctx.fillStyle = filled ? '#d8483f' : 'rgba(0,0,0,0.35)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = filled ? '#ffd9b0' : 'rgba(255,220,180,0.35)';
    ctx.stroke();
    ctx.restore();
  }

  RR.Art = {
    TS: TS,
    make: make,
    rng: rng,
    shade: shade,
    buildTiles: buildTiles,
    backdropLayers: backdropLayers,
    drawSky: drawSky,
    drawLayer: drawLayer,
    drawPlayer: drawPlayer,
    drawGuardian: drawGuardian,
    drawBat: drawBat,
    drawCoin: drawCoin,
    drawGem: drawGem,
    drawRelic: drawRelic,
    drawTorch: drawTorch,
    drawDart: drawDart,
    drawRock: drawRock,
    drawBrazier: drawBrazier,
    chiselText: chiselText,
    fitFont: fitFont,
    plaque: plaque,
    roundRect: roundRect,
    heart: heart,
    goldGradient: goldGradient
  };
})();
