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

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = window.innerWidth || document.documentElement.clientWidth;
    var h = window.innerHeight || document.documentElement.clientHeight;
    view.w = w;
    view.h = h;
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
    var dt = Math.min(0.033, (now - last) / 1000);
    last = now;

    UI.pollTouch(view);
    Input.beginFrame();

    G.update(dt);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0d0b07';
    ctx.fillRect(0, 0, view.w, view.h);
    UI.render(ctx, view, dt);

    Input.endFrame();
  }
  window.requestAnimationFrame(frame);
})();
