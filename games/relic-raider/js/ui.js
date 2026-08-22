/* Relic Raider - menus, HUD and the on-screen touch controls.
   Everything is drawn on the same canvas as the game. */
window.RR = window.RR || {};
(function () {
  'use strict';

  var Art = RR.Art;
  var Audio = RR.Audio;
  var Input = RR.Input;
  var G = RR.Game;
  var Levels = RR.Levels;

  var U = {
    buttons: [],
    pad: null,
    scale: 1,
    sel: 0,
    titleBackdrop: null,
    t: 0
  };

  function rect(x, y, w, h) {
    return { x: x, y: y, w: w, h: h };
  }
  function inside(r, p) {
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  }
  function tapped(r) {
    for (var i = 0; i < Input.taps.length; i++) {
      if (inside(r, Input.taps[i])) return true;
    }
    return false;
  }
  function hovered(r) {
    var hit = false;
    Input.eachPointer(function (p) {
      if (inside(r, p)) hit = true;
    });
    return hit;
  }

  /* ------------------------------------------------------------ menu list */

  function menu(ctx, items, cx, top, bw, bh, gap) {
    var used = [];
    for (var i = 0; i < items.length; i++) {
      var r = rect(cx - bw / 2, top + i * (bh + gap), bw, bh);
      var hot = hovered(r) || U.sel === i;
      Art.plaque(ctx, r.x, r.y, r.w, r.h, { hot: hot, radius: 10 });
      Art.chiselText(ctx, items[i].label, r.x + r.w / 2, r.y + r.h / 2 + 1,
        Math.round(bh * 0.44), { letterSpacing: '2px', maxWidth: bw - 34 });
      used.push(r);
    }
    /* keyboard / pointer activation */
    if (Input.pressed('ArrowDown') || Input.pressed('KeyS')) {
      U.sel = (U.sel + 1) % items.length;
      Audio.play('ui');
    }
    if (Input.pressed('ArrowUp') || Input.pressed('KeyW')) {
      U.sel = (U.sel + items.length - 1) % items.length;
      Audio.play('ui');
    }
    var fire = -1;
    if (Input.pressed('Enter') || Input.pressed('Space')) fire = U.sel;
    for (i = 0; i < used.length; i++) {
      if (tapped(used[i])) fire = i;
    }
    if (fire >= 0 && items[fire]) {
      Audio.resume();
      Audio.play('ui');
      U.sel = 0;
      items[fire].run();
    }
  }

  /* -------------------------------------------------------- corner icons */

  function iconButton(ctx, r, kind, active) {
    ctx.save();
    ctx.globalAlpha = 0.86;
    Art.plaque(ctx, r.x, r.y, r.w, r.h, { hot: hovered(r), radius: 9 });
    ctx.globalAlpha = 1;
    var cx = r.x + r.w / 2;
    var cy = r.y + r.h / 2;
    var s = r.w * 0.3;
    ctx.strokeStyle = '#2a1a08';
    ctx.fillStyle = '#2a1a08';
    ctx.lineWidth = Math.max(2, r.w * 0.07);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (kind === 'sound') {
      ctx.beginPath();
      ctx.moveTo(cx - s, cy - s * 0.4);
      ctx.lineTo(cx - s * 0.4, cy - s * 0.4);
      ctx.lineTo(cx + s * 0.1, cy - s);
      ctx.lineTo(cx + s * 0.1, cy + s);
      ctx.lineTo(cx - s * 0.4, cy + s * 0.4);
      ctx.lineTo(cx - s, cy + s * 0.4);
      ctx.closePath();
      ctx.fill();
      if (active) {
        ctx.beginPath();
        ctx.arc(cx + s * 0.2, cy, s * 0.6, -0.85, 0.85);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx + s * 0.2, cy, s * 1.0, -0.8, 0.8);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(cx + s * 0.45, cy - s * 0.5);
        ctx.lineTo(cx + s * 1.15, cy + s * 0.5);
        ctx.moveTo(cx + s * 1.15, cy - s * 0.5);
        ctx.lineTo(cx + s * 0.45, cy + s * 0.5);
        ctx.stroke();
      }
    } else if (kind === 'fullscreen') {
      var q = s * 0.92;
      var arm = q * 0.8;
      ctx.beginPath();
      ctx.moveTo(cx - q, cy - q + arm); ctx.lineTo(cx - q, cy - q); ctx.lineTo(cx - q + arm, cy - q);
      ctx.moveTo(cx + q - arm, cy - q); ctx.lineTo(cx + q, cy - q); ctx.lineTo(cx + q, cy - q + arm);
      ctx.moveTo(cx - q, cy + q - arm); ctx.lineTo(cx - q, cy + q); ctx.lineTo(cx - q + arm, cy + q);
      ctx.moveTo(cx + q - arm, cy + q); ctx.lineTo(cx + q, cy + q); ctx.lineTo(cx + q, cy + q - arm);
      ctx.stroke();
    } else if (kind === 'pause') {
      ctx.fillRect(cx - s * 0.62, cy - s * 0.85, s * 0.44, s * 1.7);
      ctx.fillRect(cx + s * 0.18, cy - s * 0.85, s * 0.44, s * 1.7);
    }
    ctx.restore();
  }

  function cornerIcons(ctx, view, withPause) {
    var s = Math.round(Math.max(36, U.scale * 36));
    var pad = Math.round(U.scale * 10);
    var x = view.w - pad - s;
    var y = pad;
    var fsRect = rect(x, y, s, s);
    x -= s + pad * 0.6;
    var sndRect = rect(x, y, s, s);
    iconButton(ctx, fsRect, 'fullscreen');
    iconButton(ctx, sndRect, 'sound', !Audio.muted);
    if (tapped(fsRect)) toggleFullscreen();
    if (tapped(sndRect)) {
      Audio.resume();
      Audio.toggleMute();
      Audio.play('ui');
    }
    if (withPause) {
      x -= s + pad * 0.6;
      var pRect = rect(x, y, s, s);
      iconButton(ctx, pRect, 'pause');
      if (tapped(pRect)) {
        G.state = 'paused';
        U.sel = 0;
      }
    }
  }

  function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        var el = document.documentElement;
        (el.requestFullscreen || el.webkitRequestFullscreen || function () {}).call(el);
      } else {
        (document.exitFullscreen || document.webkitExitFullscreen || function () {}).call(document);
      }
    } catch (e) { /* not permitted */ }
  }

  /* --------------------------------------------------------- title screen */

  /* One layout for the whole title screen, so the logo, the idol, the facade
     and the menu are positioned relative to each other at any aspect ratio. */
  function titleLayout(view) {
    var portrait = view.h > view.w;
    var lw = Math.min(view.w * (portrait ? 0.88 : 0.4), portrait ? 620 : 480);
    var lh = lw * 0.46;
    var logoCy = Math.max(view.h * 0.1, lh * 0.56) + view.h * 0.02;
    var menuTop = view.h * (portrait ? 0.63 : 0.6);
    /* The idol fills the room between the plaque and the menu, and is allowed
       to sit a little behind the top button the way the steps run under it. */
    var gapTop = logoCy + lh / 2;
    var span = menuTop + 60 - gapTop;
    var idolS = Math.max(0.3, Math.min(span / 300, view.w * 0.95 / 560));
    return {
      portrait: portrait, lw: lw, lh: lh, logoCy: logoCy, menuTop: menuTop,
      idolS: idolS, idolCy: gapTop + span * 0.5 + 40 * idolS
    };
  }

  /* Stepped temple facade the great idol is carved into. */
  function facade(ctx, view, L) {
    var cx = view.w / 2;
    var top = Math.max(view.h * 0.12, L.idolCy - 215 * L.idolS);
    var bot = view.h * 0.9;
    var tiers = 6;
    var maxW = Math.max(view.w * 1.05, 620 * L.idolS * 1.6);
    var minW = maxW * 0.34;
    for (var i = 0; i < tiers; i++) {
      var t = i / (tiers - 1);
      var y = bot - (bot - top) * (i / tiers);
      var hgt = (bot - top) / tiers + 3;
      var wdt = maxW - (maxW - minW) * t;
      var g = ctx.createLinearGradient(0, y - hgt, 0, y);
      g.addColorStop(0, 'rgba(74,70,50,0.96)');
      g.addColorStop(1, 'rgba(46,44,31,0.96)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - wdt / 2, y - hgt, wdt, hgt);
      ctx.fillStyle = 'rgba(20,18,11,0.5)';
      ctx.fillRect(cx - wdt / 2, y - 5, wdt, 5);
    }
    /* central stair and doorway */
    var sw = maxW * 0.22;
    ctx.fillStyle = 'rgba(58,55,39,0.96)';
    ctx.fillRect(cx - sw / 2, top + (bot - top) * 0.58, sw, bot - top);
    ctx.fillStyle = 'rgba(26,24,15,0.55)';
    for (var k = 0; k < 10; k++) {
      ctx.fillRect(cx - sw / 2, top + (bot - top) * 0.6 + k * (bot - top) * 0.045, sw, 3);
    }
    ctx.fillStyle = 'rgba(10,8,5,0.94)';
    ctx.beginPath();
    ctx.moveTo(cx - sw * 0.28, bot);
    ctx.lineTo(cx - sw * 0.28, top + (bot - top) * 0.78);
    ctx.lineTo(cx, top + (bot - top) * 0.71);
    ctx.lineTo(cx + sw * 0.28, top + (bot - top) * 0.78);
    ctx.lineTo(cx + sw * 0.28, bot);
    ctx.closePath();
    ctx.fill();
  }

  function idol(ctx, cx, cy, s, t) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);

    /* feathered headdress */
    for (var i = -7; i <= 7; i++) {
      ctx.save();
      ctx.rotate((i / 7) * Math.PI * 0.6);
      var g0 = ctx.createLinearGradient(0, -196, 0, -96);
      g0.addColorStop(0, '#7a6a34');
      g0.addColorStop(1, '#57492150');
      ctx.fillStyle = i % 2 ? '#6d5d2c' : '#83713a';
      ctx.beginPath();
      ctx.moveTo(-11, -96);
      ctx.lineTo(0, -200);
      ctx.lineTo(11, -96);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    var band = ctx.createLinearGradient(0, -128, 0, -76);
    band.addColorStop(0, '#a08b46');
    band.addColorStop(1, '#6d5c2b');
    ctx.fillStyle = band;
    ctx.beginPath();
    ctx.ellipse(0, -98, 122, 46, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c9a94f';
    for (i = -4; i <= 4; i++) {
      ctx.beginPath();
      ctx.arc(i * 24, -104, 7, 0, Math.PI * 2);
      ctx.fill();
    }

    /* ear discs, behind the face */
    ctx.fillStyle = '#6f5d2b';
    [-100, 100].forEach(function (ex) {
      ctx.beginPath();
      ctx.arc(ex, 22, 30, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = '#a58c44';
    [-100, 100].forEach(function (ex) {
      ctx.beginPath();
      ctx.arc(ex, 22, 17, 0, Math.PI * 2);
      ctx.fill();
    });

    /* face */
    var g = ctx.createLinearGradient(-70, -110, 70, 120);
    g.addColorStop(0, '#a68c48');
    g.addColorStop(0.45, '#7d6a33');
    g.addColorStop(1, '#463a1c');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-86, -66);
    ctx.quadraticCurveTo(-100, 34, -50, 100);
    ctx.quadraticCurveTo(0, 140, 50, 100);
    ctx.quadraticCurveTo(100, 34, 86, -66);
    ctx.quadraticCurveTo(0, -104, -86, -66);
    ctx.fill();

    /* brow ridge + nose */
    ctx.fillStyle = 'rgba(40,32,14,0.75)';
    ctx.fillRect(-76, -40, 60, 11);
    ctx.fillRect(16, -40, 60, 11);
    ctx.fillStyle = 'rgba(150,128,68,0.85)';
    ctx.beginPath();
    ctx.moveTo(-12, -26);
    ctx.lineTo(12, -26);
    ctx.lineTo(20, 30);
    ctx.lineTo(-20, 30);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(40,32,14,0.6)';
    ctx.beginPath();
    ctx.ellipse(-10, 28, 6, 4, 0, 0, Math.PI * 2);
    ctx.ellipse(10, 28, 6, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    /* eyes with a slow ember glow */
    var pulse = 0.55 + Math.sin(t * 1.6) * 0.2;
    [-44, 44].forEach(function (ex) {
      var eg = ctx.createRadialGradient(ex, -12, 0, ex, -12, 40);
      eg.addColorStop(0, 'rgba(255,190,90,' + pulse.toFixed(2) + ')');
      eg.addColorStop(1, 'rgba(255,170,60,0)');
      ctx.fillStyle = eg;
      ctx.fillRect(ex - 42, -54, 84, 84);
      ctx.fillStyle = '#f3e3ab';
      ctx.beginPath();
      ctx.ellipse(ex, -12, 21, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2a2110';
      ctx.beginPath();
      ctx.arc(ex + 2, -12, 7, 0, Math.PI * 2);
      ctx.fill();
    });

    /* mouth */
    ctx.fillStyle = 'rgba(35,28,12,0.85)';
    ctx.beginPath();
    ctx.moveTo(-34, 56);
    ctx.lineTo(34, 56);
    ctx.lineTo(26, 78);
    ctx.lineTo(-26, 78);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#c6b077';
    for (i = -2; i <= 2; i++) ctx.fillRect(i * 12 - 4, 58, 8, 8);
    ctx.restore();
  }

  function logo(ctx, cx, cy, w, t) {
    var h = w * 0.46;
    var r = h * 0.19;
    Art.plaque(ctx, cx - w / 2, cy - h / 2, w, h, { radius: 14 });

    /* idol medallions sit on the ends; the lettering gets what is left */
    var textW = w - (r * 2 + h * 0.09) * 2;
    var f = Math.min(h * 0.4, Art.fitFont(ctx, 'RAIDER', h * 0.4, textW, { letterSpacing: '5px' }));
    Art.chiselText(ctx, 'RELIC', cx, cy - h * 0.21, f, { letterSpacing: '5px', maxWidth: textW });
    Art.chiselText(ctx, 'RAIDER', cx, cy + h * 0.23, f, { letterSpacing: '5px', maxWidth: textW });

    [cx - w / 2 + r * 1.55, cx + w / 2 - r * 1.55].forEach(function (mx) {
      ctx.save();
      ctx.translate(mx, cy);
      var g = ctx.createLinearGradient(0, -r, 0, r);
      g.addColorStop(0, '#ffe9a9');
      g.addColorStop(0.5, '#c8a041');
      g.addColorStop(1, '#7a5a17');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(60,36,8,0.7)';
      ctx.lineWidth = 2;
      ctx.stroke();
      /* tiny idol face */
      ctx.fillStyle = '#8a6520';
      ctx.beginPath();
      ctx.ellipse(0, r * 0.06, r * 0.56, r * 0.66, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffe6a4';
      ctx.fillRect(-r * 0.4, -r * 0.24, r * 0.28, r * 0.16);
      ctx.fillRect(r * 0.12, -r * 0.24, r * 0.28, r * 0.16);
      ctx.fillRect(-r * 0.26, r * 0.26, r * 0.52, r * 0.12);
      ctx.fillStyle = '#c8a041';
      for (var i = -3; i <= 3; i++) {
        ctx.save();
        ctx.rotate((i / 7) * Math.PI * 0.9);
        ctx.fillRect(-r * 0.07, -r * 1.02, r * 0.14, r * 0.3);
        ctx.restore();
      }
      ctx.restore();
    });
  }

  function titleScene(ctx, view) {
    if (!U.titleBackdrop || U.titleDetail !== G.detail) {
      U.titleBackdrop = Art.backdropLayers(Levels.themes.jungle, G.detail);
      U.titleDetail = G.detail;
    }
    var theme = Levels.themes.jungle;
    Art.drawSky(ctx, view, theme);
    var drift = U.t * 6;
    var L = titleLayout(view);
    var s = Math.max(view.w / 768, view.h / 700);
    Art.drawLayer(ctx, U.titleBackdrop.far, view, drift, 0.12, view.h * 0.96, 0.9, s);
    facade(ctx, view, L);
    Art.drawLayer(ctx, U.titleBackdrop.mid, view, drift, 0.3, view.h * 1.1, 0.92, s);
    idol(ctx, view.w / 2, L.idolCy, L.idolS, U.t);
    /* temple steps in the foreground, with torches burning either side */
    var stepTop = view.h * 0.82;
    var sh = view.h * 0.06;
    ctx.fillStyle = 'rgba(28,26,16,0.92)';
    for (var i = 0; i < 4; i++) {
      var inset = view.w * (0.16 - i * 0.05);
      ctx.fillRect(inset, stepTop + i * sh, view.w - inset * 2, sh + 2);
      ctx.fillStyle = i % 2 ? 'rgba(34,32,20,0.94)' : 'rgba(24,22,13,0.94)';
    }
    var bs = Math.max(1.4, Math.min(view.w, view.h) / 420);
    [[view.w * 0.13, 1], [view.w * 0.87, 4]].forEach(function (b) {
      ctx.save();
      ctx.translate(b[0], stepTop + sh * 0.95);
      ctx.scale(bs, bs);
      Art.drawBrazier(ctx, 0, 0, U.t, b[1]);
      ctx.restore();
    });
    Art.drawLayer(ctx, U.titleBackdrop.near, view, drift, 0.55, view.h * 1.06, 0.95, s);
    Art.drawLayer(ctx, U.titleBackdrop.canopy, view, drift * 0.8, 0.4,
      U.titleBackdrop.canopy.worldH * s * 0.92, 0.9, s);
    var vg = ctx.createRadialGradient(view.w / 2, view.h * 0.45, Math.min(view.w, view.h) * 0.2,
      view.w / 2, view.h * 0.5, Math.max(view.w, view.h) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(10,6,2,0.72)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, view.w, view.h);
  }

  function drawTitle(ctx, view) {
    titleScene(ctx, view);
    var L = titleLayout(view);
    logo(ctx, view.w / 2, L.logoCy, L.lw, U.t);

    var bw = Math.min(view.w * 0.6, 320);
    var bh = Math.max(42, Math.min(74, view.h * (L.portrait ? 0.085 : 0.078)));
    var top = L.menuTop;
    menu(ctx, [
      { label: 'Play', run: function () { newGame(); } },
      { label: 'How to play', run: function () { G.state = 'howto'; } },
      { label: 'Quit', run: function () { G.state = 'quit'; } }
    ], view.w / 2, top, bw, bh, bh * 0.24);

    var footY = view.h - U.scale * 26;
    ctx.textAlign = 'center';
    ctx.font = Math.round(U.scale * 13) + 'px Georgia, serif';
    ctx.fillStyle = 'rgba(240,222,180,0.75)';
    if (G.best > 0) {
      ctx.fillText('Best expedition: ' + G.best.toLocaleString(), view.w / 2, footY - U.scale * 18);
    }
    ctx.fillText('Raid the temple — take the relic — get out alive', view.w / 2, footY);
    cornerIcons(ctx, view, false);
  }

  function drawHowTo(ctx, view) {
    titleScene(ctx, view);
    panel(ctx, view, 'How to Play');
    var x = view.w / 2;
    var y = view.h * 0.3;
    var line = U.scale * 22;
    ctx.textAlign = 'center';
    ctx.font = Math.round(U.scale * 15) + 'px Georgia, serif';
    ctx.fillStyle = '#efe0b8';
    [
      'Move  ← →  or  A D          Jump  Space / W / ↑',
      'Climb vines with ↑ ↓          Pause  Esc',
      'On a phone: thumb pad on the left, jump on the right.',
      '',
      'Collect gold on the way in. Lift the golden relic',
      'from its pedestal and the temple starts to fall —',
      'sprint back to the door before the ruins reach you.',
      '',
      'Light the checkpoint torches. They remember you.'
    ].forEach(function (s, i) {
      ctx.fillText(s, x, y + i * line);
    });
    var bw = Math.min(view.w * 0.5, 260);
    var bh = Math.max(46, Math.min(64, view.h * 0.08));
    menu(ctx, [{ label: 'Back', run: function () { G.state = 'title'; } }],
      view.w / 2, view.h - bh - U.scale * 26, bw, bh, 10);
    cornerIcons(ctx, view, false);
  }

  function drawQuit(ctx, view) {
    titleScene(ctx, view);
    panel(ctx, view, 'Safe travels, raider');
    ctx.textAlign = 'center';
    ctx.font = Math.round(U.scale * 15) + 'px Georgia, serif';
    ctx.fillStyle = '#efe0b8';
    ctx.fillText('The jungle keeps what it is owed.', view.w / 2, view.h * 0.36);
    ctx.fillText('Close the tab whenever you are ready.', view.w / 2, view.h * 0.36 + U.scale * 24);
    var bw = Math.min(view.w * 0.5, 280);
    var bh = Math.max(46, Math.min(64, view.h * 0.08));
    menu(ctx, [{ label: 'Back to camp', run: function () { G.state = 'title'; } }],
      view.w / 2, view.h * 0.55, bw, bh, 10);
  }

  function panel(ctx, view, title) {
    var w = Math.min(view.w * 0.9, 560);
    var h = Math.min(view.h * 0.78, 560);
    var x = (view.w - w) / 2;
    var y = (view.h - h) / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(12,8,4,0.82)';
    ctx.beginPath();
    Art.roundRect(ctx, x, y, w, h, 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(196,152,66,0.7)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
    Art.chiselText(ctx, title, view.w / 2, y + U.scale * 34, Math.round(U.scale * 26), { letterSpacing: '2px' });
    return { x: x, y: y, w: w, h: h };
  }

  function newGame() {
    G.totalScore = 0;
    G.startLevel(0);
  }

  /* ---------------------------------------------------------------- HUD */

  function drawHud(ctx, view, w) {
    var s = U.scale;
    var pad = Math.round(10 * s);
    var i;
    for (i = 0; i < G.MAX_HEARTS; i++) {
      Art.heart(ctx, pad + 14 * s + i * 26 * s, pad + 14 * s, 22 * s, i < w.hearts);
    }
    ctx.textAlign = 'left';
    ctx.font = 'bold ' + Math.round(15 * s) + 'px Georgia, serif';
    ctx.fillStyle = 'rgba(20,12,4,0.8)';
    ctx.fillText('Gold ' + G.score, pad + 2, pad + 38 * s + 1);
    ctx.fillStyle = '#f3dc9a';
    ctx.fillText('Gold ' + G.score, pad, pad + 38 * s);

    ctx.font = Math.round(12 * s) + 'px Georgia, serif';
    ctx.fillStyle = 'rgba(240,224,180,0.8)';
    ctx.fillText(w.def.subtitle + ' — ' + w.def.name, pad, pad + 56 * s);
    ctx.fillText('Time ' + w.elapsed.toFixed(1) + 's', pad, pad + 72 * s);

    /* relic carried */
    if (w.relicTaken) {
      ctx.save();
      ctx.translate(pad + 12 * s, pad + 92 * s);
      ctx.scale(0.7 * s, 0.7 * s);
      Art.drawRelic(ctx, { x: -14, y: -16, w: 28, h: 32, seed: 0 }, U.t);
      ctx.restore();
    }

    /* collapse warning */
    if (w.collapse.active) {
      var bw = Math.min(view.w * 0.72, 420);
      var bx = (view.w - bw) / 2;
      var by = pad + 4 * s;
      var pulse = 0.55 + Math.sin(U.t * 8) * 0.2;
      ctx.fillStyle = 'rgba(120,20,10,' + pulse.toFixed(2) + ')';
      ctx.beginPath();
      Art.roundRect(ctx, bx, by, bw, 30 * s, 8);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,180,90,0.8)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.font = 'bold ' + Math.round(13 * s) + 'px Georgia, serif';
      ctx.fillStyle = '#ffe6bb';
      ctx.fillText('THE TEMPLE IS COLLAPSING — RUN!', view.w / 2, by + 20 * s);

      /* how far the wall is behind you, and the door ahead */
      var door = w.door ? w.door.x : 0;
      var span = Math.max(1, w.collapse.x - door);
      var prog = Math.max(0, Math.min(1, (w.player.x - door) / span));
      var mx = bx + 10;
      var mw = bw - 20;
      var my = by + 34 * s;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath();
      Art.roundRect(ctx, mx, my, mw, 8 * s, 4);
      ctx.fill();
      ctx.fillStyle = '#d8483f';
      ctx.beginPath();
      Art.roundRect(ctx, mx + mw * (1 - prog), my, mw * prog, 8 * s, 4);
      ctx.fill();
      ctx.fillStyle = '#ffd873';
      ctx.beginPath();
      ctx.arc(mx + 4, my + 4 * s, 5 * s, 0, Math.PI * 2);
      ctx.fill();
    }

    if (G.banner) {
      var a = Math.min(1, G.banner.t);
      ctx.globalAlpha = a;
      var by2 = view.h * 0.34;
      Art.chiselText(ctx, G.banner.text, view.w / 2, by2, Math.round(30 * s),
        G.banner.alarm ? { fill: '#ff9a5c' } : {});
      if (G.banner.sub) {
        ctx.textAlign = 'center';
        ctx.font = Math.round(14 * s) + 'px Georgia, serif';
        ctx.fillStyle = 'rgba(245,228,190,0.9)';
        ctx.fillText(G.banner.sub, view.w / 2, by2 + 28 * s);
      }
      ctx.globalAlpha = 1;
    }

    cornerIcons(ctx, view, true);
    if (Input.hasTouch) drawPad(ctx, view);
  }

  /* -------------------------------------------------------- touch controls */

  function layoutPad(view) {
    var s = U.scale;
    var r = Math.max(34, Math.min(52, view.w * 0.085)) * (s > 1.4 ? 1.1 : 1);
    var cx = r * 2.1;
    var cy = view.h - r * 2.1;
    var b = r * 0.92;
    U.pad = {
      r: r,
      b: b,
      left: rect(cx - r - b / 2, cy - b / 2, b, b),
      right: rect(cx + r - b / 2, cy - b / 2, b, b),
      up: rect(cx - b / 2, cy - r - b / 2, b, b),
      down: rect(cx - b / 2, cy + r - b / 2, b, b),
      jump: rect(view.w - r * 2.6, view.h - r * 2.6, r * 1.9, r * 1.9)
    };
    return U.pad;
  }

  function padGlyph(ctx, r, kind, active) {
    ctx.save();
    ctx.globalAlpha = active ? 0.9 : 0.58;
    ctx.fillStyle = active ? 'rgba(226,184,92,0.9)' : 'rgba(30,22,10,0.55)';
    ctx.beginPath();
    Art.roundRect(ctx, r.x, r.y, r.w, r.h, r.w * 0.28);
    ctx.fill();
    ctx.strokeStyle = 'rgba(240,214,150,0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = active ? '#2c1c08' : 'rgba(245,224,176,0.9)';
    var cx = r.x + r.w / 2;
    var cy = r.y + r.h / 2;
    var a = r.w * 0.22;
    ctx.beginPath();
    if (kind === 'left') {
      ctx.moveTo(cx + a, cy - a); ctx.lineTo(cx - a, cy); ctx.lineTo(cx + a, cy + a);
    } else if (kind === 'right') {
      ctx.moveTo(cx - a, cy - a); ctx.lineTo(cx + a, cy); ctx.lineTo(cx - a, cy + a);
    } else if (kind === 'up') {
      ctx.moveTo(cx - a, cy + a); ctx.lineTo(cx, cy - a); ctx.lineTo(cx + a, cy + a);
    } else if (kind === 'down') {
      ctx.moveTo(cx - a, cy - a); ctx.lineTo(cx, cy + a); ctx.lineTo(cx + a, cy - a);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawPad(ctx, view) {
    var pad = layoutPad(view);
    padGlyph(ctx, pad.left, 'left', Input.virtual.left);
    padGlyph(ctx, pad.right, 'right', Input.virtual.right);
    padGlyph(ctx, pad.up, 'up', Input.virtual.up);
    padGlyph(ctx, pad.down, 'down', Input.virtual.down);

    var j = pad.jump;
    ctx.save();
    ctx.globalAlpha = Input.virtual.jump ? 0.9 : 0.5;
    var g = ctx.createLinearGradient(j.x, j.y, j.x, j.y + j.h);
    g.addColorStop(0, '#e8c473');
    g.addColorStop(1, '#8b6218');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(j.x + j.w / 2, j.y + j.h / 2, j.w / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,236,180,0.85)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
    ctx.textAlign = 'center';
    ctx.font = 'bold ' + Math.round(j.w * 0.26) + 'px Georgia, serif';
    ctx.fillStyle = '#2c1c08';
    ctx.fillText('JUMP', j.x + j.w / 2, j.y + j.h / 2 + j.w * 0.09);
  }

  /* Called once per frame before input edges are computed. */
  U.pollTouch = function (view) {
    var v = Input.virtual;
    v.left = v.right = v.up = v.down = v.jump = false;
    if (!Input.hasTouch || G.state !== 'play') return;
    var pad = U.pad || layoutPad(view);
    Input.eachPointer(function (p) {
      if (inside(pad.left, p)) v.left = true;
      else if (inside(pad.right, p)) v.right = true;
      else if (inside(pad.up, p)) v.up = true;
      else if (inside(pad.down, p)) v.down = true;
      if (inside(pad.jump, p)) v.jump = true;
    });
  };

  /* ------------------------------------------------------------- overlays */

  function statLine(ctx, label, value, x, y, w, s) {
    ctx.textAlign = 'left';
    ctx.font = Math.round(15 * s) + 'px Georgia, serif';
    ctx.fillStyle = 'rgba(238,222,182,0.9)';
    ctx.fillText(label, x, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffd873';
    ctx.fillText(value, x + w, y);
  }

  function drawLevelDone(ctx, view) {
    var r = panel(ctx, view, 'Relic Secured');
    var s = U.scale;
    var res = G.result;
    var x = r.x + 34 * s;
    var w = r.w - 68 * s;
    var y = r.y + 78 * s;
    var step = 26 * s;
    ctx.textAlign = 'center';
    ctx.font = Math.round(15 * s) + 'px Georgia, serif';
    ctx.fillStyle = '#e9d6ab';
    ctx.fillText(res.level, view.w / 2, y);
    y += step * 1.4;
    statLine(ctx, 'Gold recovered', res.base.toLocaleString(), x, y, w, s); y += step;
    statLine(ctx, 'Treasure found', res.coins + ' / ' + res.coinsTotal, x, y, w, s); y += step;
    statLine(ctx, 'Escape time', res.elapsed.toFixed(1) + 's', x, y, w, s); y += step;
    statLine(ctx, 'Time bonus', '+' + res.timeBonus.toLocaleString(), x, y, w, s); y += step;
    statLine(ctx, 'Hearts left (x' + res.hearts + ')', '+' + res.heartBonus.toLocaleString(), x, y, w, s); y += step * 1.3;
    ctx.strokeStyle = 'rgba(200,160,80,0.5)';
    ctx.beginPath();
    ctx.moveTo(x, y - step * 0.6);
    ctx.lineTo(x + w, y - step * 0.6);
    ctx.stroke();
    statLine(ctx, 'Expedition total', G.totalScore.toLocaleString(), x, y, w, s);

    var bw = Math.min(view.w * 0.55, 280);
    var bh = Math.max(46, Math.min(62, view.h * 0.08));
    menu(ctx, [{
      label: 'Next chapter',
      run: function () { G.startLevel(G.levelIndex + 1); }
    }], view.w / 2, r.y + r.h - bh - 24 * s, bw, bh, 10);
  }

  function drawVictory(ctx, view) {
    titleScene(ctx, view);
    var r = panel(ctx, view, 'You Made It Out');
    var s = U.scale;
    ctx.textAlign = 'center';
    ctx.font = Math.round(15 * s) + 'px Georgia, serif';
    ctx.fillStyle = '#e9d6ab';
    var y = r.y + 80 * s;
    ['Three temples raided. Three relics carried home.',
     'The jungle closes over the steps behind you.'].forEach(function (t, i) {
      ctx.fillText(t, view.w / 2, y + i * 24 * s);
    });
    Art.chiselText(ctx, G.totalScore.toLocaleString(), view.w / 2, y + 96 * s, Math.round(46 * s));
    ctx.font = Math.round(13 * s) + 'px Georgia, serif';
    ctx.fillStyle = 'rgba(238,222,182,0.85)';
    ctx.fillText('final score', view.w / 2, y + 126 * s);
    ctx.fillText('best ' + G.best.toLocaleString(), view.w / 2, y + 150 * s);

    var bw = Math.min(view.w * 0.55, 280);
    var bh = Math.max(46, Math.min(62, view.h * 0.08));
    menu(ctx, [
      { label: 'Raid again', run: newGame },
      { label: 'Title screen', run: function () { G.state = 'title'; } }
    ], view.w / 2, r.y + r.h - bh * 2 - 34 * s, bw, bh, 10);
  }

  function drawGameOver(ctx, view) {
    var r = panel(ctx, view, 'The Ruins Claimed You');
    var s = U.scale;
    ctx.textAlign = 'center';
    ctx.font = Math.round(15 * s) + 'px Georgia, serif';
    ctx.fillStyle = '#e9d6ab';
    ctx.fillText('Expedition score ' + G.totalScore.toLocaleString(), view.w / 2, r.y + 90 * s);
    ctx.fillText('Best ' + G.best.toLocaleString(), view.w / 2, r.y + 114 * s);
    var bw = Math.min(view.w * 0.55, 280);
    var bh = Math.max(46, Math.min(62, view.h * 0.08));
    menu(ctx, [
      { label: 'Try again', run: function () { G.restartLevel(); } },
      { label: 'Title screen', run: function () { G.state = 'title'; } }
    ], view.w / 2, r.y + r.h - bh * 2 - 34 * s, bw, bh, 10);
  }

  function drawPaused(ctx, view) {
    ctx.fillStyle = 'rgba(6,4,2,0.55)';
    ctx.fillRect(0, 0, view.w, view.h);
    var r = panel(ctx, view, 'Paused');
    var bw = Math.min(view.w * 0.55, 280);
    var bh = Math.max(46, Math.min(62, view.h * 0.08));
    menu(ctx, [
      { label: 'Resume', run: function () { G.state = 'play'; } },
      { label: 'Restart chapter', run: function () { G.restartLevel(); } },
      { label: 'Abandon raid', run: function () { G.state = 'title'; RR.Audio.setMusic(false); } }
    ], view.w / 2, r.y + r.h / 2 - bh * 1.6, bw, bh, bh * 0.25);
    cornerIcons(ctx, view, false);
  }

  /* ---------------------------------------------------------------- main */

  U.render = function (ctx, view, dt) {
    U.t += dt;
    U.scale = Math.max(0.85, Math.min(2.0, Math.min(view.w, view.h) / 420));
    U.buttons.length = 0;

    if (G.state === 'title') drawTitle(ctx, view);
    else if (G.state === 'howto') drawHowTo(ctx, view);
    else if (G.state === 'quit') drawQuit(ctx, view);
    else if (G.state === 'play' || G.state === 'paused' ||
             G.state === 'levelDone' || G.state === 'gameover' || G.state === 'victory') {
      if (G.world) G.renderWorld(ctx, G.world);
      if (G.state === 'play') drawHud(ctx, view, G.world);
      else if (G.state === 'paused') drawPaused(ctx, view);
      else if (G.state === 'levelDone') drawLevelDone(ctx, view);
      else if (G.state === 'gameover') drawGameOver(ctx, view);
      else if (G.state === 'victory') drawVictory(ctx, view);
    }

    if (G.flash > 0) {
      ctx.fillStyle = 'rgba(190,40,20,' + (G.flash * 0.6).toFixed(3) + ')';
      ctx.fillRect(0, 0, view.w, view.h);
    }

    /* global keys */
    if (Input.pressed('Escape')) {
      if (G.state === 'play') {
        G.state = 'paused';
        U.sel = 0;
      } else if (G.state === 'paused') {
        G.state = 'play';
      } else if (G.state === 'howto' || G.state === 'quit') {
        G.state = 'title';
      }
    }
    if (Input.pressed('KeyM')) {
      Audio.resume();
      Audio.toggleMute();
    }
    if (Input.pressed('KeyF')) toggleFullscreen();
    if (Input.pressed('KeyR') && G.state === 'play') G.restartLevel();
  };

  RR.UI = U;
})();
