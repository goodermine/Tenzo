/* Relic Raider - bootstrap and frame loop. */
(function () {
  'use strict';

  var RR = window.RR;
  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d', { alpha: false });
  var G = RR.Game;
  var UI = RR.UI;
  var Input = RR.Input;
  var view = G.view;
  var dpr = 1;
  /* Render scale ceiling. Lowered a step at a time if the device cannot keep
     a smooth frame rate at full resolution; never raised, so it settles. */
  var dprCap = 3;
  var perf = { frames: 0, time: 0, steps: 0 };

  /* Safe-area insets (iPhone notch / home indicator). Read through a probe
     element because env() is only available to CSS. */
  var probe = null;
  function readInsets() {
    if (!probe) {
      probe = document.createElement('div');
      probe.setAttribute('aria-hidden', 'true');
      probe.style.cssText =
        'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
        'padding-top:env(safe-area-inset-top);padding-right:env(safe-area-inset-right);' +
        'padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left);';
      document.body.appendChild(probe);
    }
    var cs = window.getComputedStyle(probe);
    return {
      top: parseFloat(cs.paddingTop) || 0,
      right: parseFloat(cs.paddingRight) || 0,
      bottom: parseFloat(cs.paddingBottom) || 0,
      left: parseFloat(cs.paddingLeft) || 0
    };
  }

  function resize() {
    dpr = Math.max(1, Math.min(Math.round(window.devicePixelRatio || 1), dprCap));
    RR.Art.setPixelRatio(dpr);
    var w = window.innerWidth || document.documentElement.clientWidth;
    var h = window.innerHeight || document.documentElement.clientHeight;
    view.w = w;
    view.h = h;
    view.inset = readInsets();
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    /* Pick a zoom that always shows a useful slice of the temple, then fit a
       world "band" inside the canvas. On tall phone screens the band is
       shorter than the canvas: sky and foliage bleed past it so the seam is
       invisible, and the spare room at the bottom hosts the thumb controls. */
    var portrait = h > w;
    var minTilesX = portrait ? 11 : 19;
    var minTilesY = 11;
    var s = portrait
      ? w / (minTilesX * 32)
      : Math.min(w / (minTilesX * 32), h / (minTilesY * 32));
    view.scale = Math.max(1.05, Math.min(4, s));

    /* Bake artwork at (at least) one bitmap pixel per device pixel. Quantised
       to whole steps so dragging a window edge does not re-bake every frame. */
    var detail = Math.max(1, Math.min(6, Math.ceil(view.scale * dpr)));
    if (detail !== G.detail) {
      G.detail = detail;
      G.rebuildArt();
      RR.UI.titleBackdrop = null;
    }

    var worldPx = RR.Levels.WORLD_ROWS * 32 * view.scale;
    var bandH = Math.min(h, worldPx);
    view.vp = {
      x: 0,
      y: Math.round((h - bandH) * (portrait ? 0.42 : 0.5)),
      w: w,
      h: Math.round(bandH)
    };
  }

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', function () {
    setTimeout(resize, 120);
  });
  document.addEventListener('fullscreenchange', function () {
    setTimeout(resize, 120);
  });

  function firstGesture() {
    RR.Audio.resume();
  }
  window.addEventListener('pointerdown', firstGesture, { once: true });
  window.addEventListener('keydown', firstGesture, { once: true });

  Input.attach(canvas);
  G.load();
  resize();

  var last = 0;
  function frame(now) {
    window.requestAnimationFrame(frame);
    if (!last) last = now;
    var raw = (now - last) / 1000;
    var dt = Math.min(0.033, raw);
    last = now;

    /* Frames longer than 100ms are level loads or tab stalls, not the steady
       state, so they are left out of the measurement. */
    if (raw < 0.1) {
      perf.frames++;
      perf.time += raw;
    }
    if (perf.frames >= 45) {
      if (perf.frames / perf.time < 40 && perf.steps < 3 && dpr > 1) {
        /* step down from the ratio actually in use, not the ceiling, so a
           device already below the cap still drops on the first window */
        perf.steps++;
        dprCap = Math.max(1, Math.ceil(dpr) - 1);
        resize();
      }
      perf.frames = 0;
      perf.time = 0;
    }

    UI.pollTouch(view);
    Input.beginFrame();

    G.update(dt);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#0d0b07';
    ctx.fillRect(0, 0, view.w, view.h);
    UI.render(ctx, view, dt);

    Input.endFrame();
  }
  window.requestAnimationFrame(frame);
})();
