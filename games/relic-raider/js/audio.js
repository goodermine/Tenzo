/* Relic Raider - synthesized audio. No asset files: every sound is generated
   with the WebAudio API so the game stays fully self-contained/offline. */
window.RR = window.RR || {};
(function () {
  'use strict';

  var A = {
    ctx: null,
    master: null,
    musicGain: null,
    muted: false,
    volume: 0.55,
    _step: 0,
    _stepTimer: 0,
    _musicOn: false,
    _intensity: 0
  };

  A.init = function () {
    if (A.ctx) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      A.ctx = new AC();
      A.master = A.ctx.createGain();
      A.master.gain.value = A.muted ? 0 : A.volume;
      A.master.connect(A.ctx.destination);
      A.musicGain = A.ctx.createGain();
      A.musicGain.gain.value = 0.32;
      A.musicGain.connect(A.master);
    } catch (e) {
      A.ctx = null;
    }
  };

  A.resume = function () {
    A.init();
    if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume();
  };

  A.setMuted = function (m) {
    A.muted = !!m;
    if (A.master) A.master.gain.value = A.muted ? 0 : A.volume;
  };

  A.toggleMute = function () {
    A.setMuted(!A.muted);
    return A.muted;
  };

  function tone(opt) {
    if (!A.ctx || A.muted) return;
    var t0 = A.ctx.currentTime + (opt.delay || 0);
    var osc = A.ctx.createOscillator();
    var gain = A.ctx.createGain();
    osc.type = opt.type || 'square';
    osc.frequency.setValueAtTime(opt.freq, t0);
    if (opt.to && opt.to !== opt.freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, opt.to), t0 + opt.dur);
    }
    var peak = opt.vol == null ? 0.25 : opt.vol;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.02, opt.dur * 0.3));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + opt.dur);
    osc.connect(gain);
    gain.connect(opt.bus || A.master);
    osc.start(t0);
    osc.stop(t0 + opt.dur + 0.02);
  }

  function noise(opt) {
    if (!A.ctx || A.muted) return;
    var t0 = A.ctx.currentTime + (opt.delay || 0);
    var dur = opt.dur || 0.2;
    var len = Math.max(1, Math.floor(A.ctx.sampleRate * dur));
    var buf = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    var src = A.ctx.createBufferSource();
    src.buffer = buf;
    var filter = A.ctx.createBiquadFilter();
    filter.type = opt.filter || 'lowpass';
    filter.frequency.setValueAtTime(opt.freq || 900, t0);
    if (opt.to) filter.frequency.exponentialRampToValueAtTime(Math.max(60, opt.to), t0 + dur);
    var gain = A.ctx.createGain();
    gain.gain.setValueAtTime(opt.vol == null ? 0.3 : opt.vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(opt.bus || A.master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  var SFX = {
    jump: function () {
      tone({ type: 'square', freq: 300, to: 620, dur: 0.16, vol: 0.16 });
    },
    land: function () {
      noise({ freq: 700, to: 160, dur: 0.12, vol: 0.16 });
    },
    coin: function () {
      tone({ type: 'triangle', freq: 880, dur: 0.09, vol: 0.2 });
      tone({ type: 'triangle', freq: 1320, dur: 0.13, vol: 0.16, delay: 0.06 });
    },
    gem: function () {
      tone({ type: 'triangle', freq: 660, dur: 0.1, vol: 0.2 });
      tone({ type: 'triangle', freq: 990, dur: 0.1, vol: 0.18, delay: 0.07 });
      tone({ type: 'triangle', freq: 1480, dur: 0.22, vol: 0.16, delay: 0.14 });
    },
    hurt: function () {
      tone({ type: 'sawtooth', freq: 320, to: 90, dur: 0.28, vol: 0.2 });
      noise({ freq: 500, to: 120, dur: 0.2, vol: 0.16 });
    },
    dart: function () {
      noise({ filter: 'highpass', freq: 1800, dur: 0.1, vol: 0.12 });
    },
    crumble: function () {
      noise({ freq: 420, to: 90, dur: 0.35, vol: 0.2 });
    },
    checkpoint: function () {
      tone({ type: 'sine', freq: 523, dur: 0.18, vol: 0.18 });
      tone({ type: 'sine', freq: 784, dur: 0.26, vol: 0.16, delay: 0.12 });
    },
    relic: function () {
      [523, 659, 784, 1047].forEach(function (f, i) {
        tone({ type: 'triangle', freq: f, dur: 0.4, vol: 0.18, delay: i * 0.1 });
      });
      noise({ freq: 300, to: 60, dur: 1.2, vol: 0.22, delay: 0.35 });
    },
    door: function () {
      noise({ freq: 260, to: 70, dur: 0.5, vol: 0.2 });
      tone({ type: 'sine', freq: 196, to: 130, dur: 0.5, vol: 0.14 });
    },
    win: function () {
      [523, 659, 784, 1047, 1319].forEach(function (f, i) {
        tone({ type: 'triangle', freq: f, dur: 0.5, vol: 0.18, delay: i * 0.12 });
      });
    },
    lose: function () {
      [392, 330, 262, 196].forEach(function (f, i) {
        tone({ type: 'sawtooth', freq: f, dur: 0.5, vol: 0.16, delay: i * 0.16 });
      });
    },
    ui: function () {
      tone({ type: 'square', freq: 420, to: 560, dur: 0.08, vol: 0.14 });
    },
    rumble: function () {
      noise({ freq: 220, to: 50, dur: 0.9, vol: 0.18 });
    },
    rock: function () {
      noise({ freq: 340, to: 80, dur: 0.25, vol: 0.16 });
    }
  };

  A.play = function (name) {
    A.init();
    var fn = SFX[name];
    if (fn) fn();
  };

  /* --- ambience: slow pentatonic flute over a temple drum ---------------- */
  var SCALE = [196, 233, 262, 294, 349, 392, 466, 523];
  A.setMusic = function (on) {
    A._musicOn = !!on;
    A._stepTimer = 0;
    A._step = 0;
  };

  A.update = function (dt, intensity) {
    A._intensity = intensity || 0;
    if (!A._musicOn || !A.ctx || A.muted) return;
    var period = 0.62 - 0.22 * A._intensity;
    A._stepTimer += dt;
    while (A._stepTimer >= period) {
      A._stepTimer -= period;
      var s = A._step++;
      if (s % 4 === 0) {
        tone({ type: 'sine', freq: 74, to: 48, dur: 0.34, vol: 0.3, bus: A.musicGain });
      }
      if (s % 4 === 2 && A._intensity > 0.2) {
        noise({ freq: 1200, dur: 0.08, vol: 0.12, filter: 'highpass', bus: A.musicGain });
      }
      if (s % 8 === 1 || s % 8 === 6) {
        var f = SCALE[(Math.random() * SCALE.length) | 0];
        tone({ type: 'sine', freq: f, dur: 0.7, vol: 0.1, bus: A.musicGain });
      }
      if (A._intensity > 0.5 && s % 2 === 1) {
        tone({ type: 'sine', freq: 58, to: 40, dur: 0.24, vol: 0.22, bus: A.musicGain });
      }
    }
  };

  RR.Audio = A;
})();
