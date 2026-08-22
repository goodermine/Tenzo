/* Relic Raider - keyboard, mouse, touch. Pointer state is exposed raw so the
   game can hit-test canvas-drawn buttons and the on-screen thumb controls. */
window.RR = window.RR || {};
(function () {
  'use strict';

  var I = {
    keys: Object.create(null),
    edges: Object.create(null),
    pointers: Object.create(null),
    taps: [],
    hasTouch: false,
    virtual: { left: false, right: false, up: false, down: false, jump: false },
    _jumpWas: false,
    _jumpEdge: false
  };

  var HANDLED = {
    ArrowLeft: 1, ArrowRight: 1, ArrowUp: 1, ArrowDown: 1, Space: 1,
    KeyA: 1, KeyD: 1, KeyW: 1, KeyS: 1, Enter: 1, Escape: 1
  };

  I.attach = function (canvas) {
    window.addEventListener('keydown', function (e) {
      if (e.repeat) {
        if (HANDLED[e.code]) e.preventDefault();
        return;
      }
      I.keys[e.code] = true;
      I.edges[e.code] = true;
      if (HANDLED[e.code]) e.preventDefault();
    });
    window.addEventListener('keyup', function (e) {
      I.keys[e.code] = false;
    });
    window.addEventListener('blur', function () {
      I.keys = Object.create(null);
      I.pointers = Object.create(null);
    });

    function pos(e) {
      var r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    function down(e) {
      I.hasTouch = I.hasTouch || e.pointerType === 'touch';
      var p = pos(e);
      I.pointers[e.pointerId] = p;
      I.taps.push(p);
      if (canvas.setPointerCapture) {
        try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      }
      e.preventDefault();
    }
    function move(e) {
      if (I.pointers[e.pointerId]) I.pointers[e.pointerId] = pos(e);
    }
    function up(e) {
      delete I.pointers[e.pointerId];
    }
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('pointerleave', up);
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    window.addEventListener('touchstart', function () { I.hasTouch = true; }, { passive: true });
  };

  I.pressed = function (code) {
    return !!I.edges[code];
  };
  I.held = function (code) {
    return !!I.keys[code];
  };
  I.anyPressed = function (codes) {
    for (var i = 0; i < codes.length; i++) if (I.edges[codes[i]]) return true;
    return false;
  };

  I.left = function () {
    return I.virtual.left || I.keys.ArrowLeft || I.keys.KeyA;
  };
  I.right = function () {
    return I.virtual.right || I.keys.ArrowRight || I.keys.KeyD;
  };
  I.up = function () {
    return I.virtual.up || I.keys.ArrowUp || I.keys.KeyW;
  };
  I.down = function () {
    return I.virtual.down || I.keys.ArrowDown || I.keys.KeyS;
  };
  I.jumpHeld = function () {
    return I.virtual.jump || I.keys.Space || I.keys.ArrowUp || I.keys.KeyW;
  };
  I.jumpPressed = function () {
    return I._jumpEdge;
  };

  /* Called at the top of each frame, before the game reads input. */
  I.beginFrame = function () {
    var held = I.jumpHeld();
    I._jumpEdge = held && !I._jumpWas;
    I._jumpWas = held;
  };

  /* Called after the game has consumed everything for this frame. */
  I.endFrame = function () {
    I.edges = Object.create(null);
    I.taps.length = 0;
  };

  I.eachPointer = function (fn) {
    for (var id in I.pointers) fn(I.pointers[id]);
  };

  RR.Input = I;
})();
