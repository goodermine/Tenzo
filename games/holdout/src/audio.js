/* HOLDOUT - every sound, synthesized; no audio files.
   Two things matter more here than in a quieter game:
   - Volume. A busy second is hundreds of hits and kills; played naively that
     is a wall of noise and clipping. Each sound has a minimum gap and a cap
     on simultaneous voices, and everything runs through a compressor.
   - The pickup chime climbs in pitch while gems keep coming in, and resets
     after a pause - the small reward that makes vacuuming a field of XP feel
     good.
   The music is a step sequencer whose layers - kick, bass, hats, clap, arp -
   fade in as the fight gets denser, so the soundtrack builds with the run. */
import { EV } from './sim/events.js';

const BPM = 112;
const STEP = 60 / BPM / 4; /* sixteenth notes */
/* A minor - F - C - G, one chord per bar, as MIDI note numbers. */
const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
const midi = n => 440 * Math.pow(2, (n - 69) / 12);

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.last = {};
    this.voices = {};
    this.pickupStreak = 0;
    this.pickupAt = 0;
    this.intensity = 0;
    this.musicOn = false;
    this.step = 0;
    this.nextStep = 0;
  }

  /** Must be called from a user gesture: browsers keep audio locked until one. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
      } catch (e) {
        return;
      }
      const c = this.ctx;
      this.comp = c.createDynamicsCompressor();
      this.comp.threshold.value = -14;
      this.comp.ratio.value = 6;
      this.master = c.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      this.master.connect(this.comp).connect(c.destination);
      this.sfxBus = c.createGain();
      this.sfxBus.gain.value = 0.7;
      this.sfxBus.connect(this.master);
      this.musicBus = c.createGain();
      this.musicBus.gain.value = 0.42;
      this.musicBus.connect(this.master);
      this.layers = {};
      for (const name of ['kick', 'bass', 'hat', 'clap', 'arp']) {
        const g = c.createGain();
        g.gain.value = 0;
        g.connect(this.musicBus);
        this.layers[name] = g;
      }
      /* one second of white noise, reused by every noisy sound */
      const len = c.sampleRate;
      this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.scheduler = setInterval(() => this.schedule(), 25);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  /* Rate limit: at most one `name` per `gap` seconds, `max` voices at once. */
  allow(name, gap, max = 4) {
    if (!this.ctx || this.muted) return false;
    const now = this.ctx.currentTime;
    if (now - (this.last[name] || 0) < gap) return false;
    const v = this.voices[name] || 0;
    if (v >= max) return false;
    this.last[name] = now;
    return true;
  }

  track(name, dur) {
    this.voices[name] = (this.voices[name] || 0) + 1;
    setTimeout(() => { this.voices[name]--; }, dur * 1000 + 30);
  }

  tone({ freq, to, dur, type = 'sine', vol = 0.2, delay = 0, bus, attack = 0.005 }) {
    const c = this.ctx, t0 = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(bus || this.sfxBus);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  noise({ dur, vol = 0.2, delay = 0, filter = 'bandpass', freq = 1000, to, q = 1, bus, at }) {
    const c = this.ctx, t0 = at != null ? at : c.currentTime + delay;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf;
    f.type = filter;
    f.frequency.setValueAtTime(freq, t0);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    f.Q.value = q;
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f).connect(g).connect(bus || this.sfxBus);
    s.start(t0, Math.random() * 0.5);
    s.stop(t0 + dur + 0.02);
  }

  /* ------------------------------------------------------------ sfx */

  shot() {
    if (!this.allow('shot', 0.05, 3)) return;
    this.track('shot', 0.08);
    this.tone({ freq: 1400 + Math.random() * 200, to: 500, dur: 0.07, type: 'triangle', vol: 0.05 });
  }

  hit() {
    if (!this.allow('hit', 0.03, 4)) return;
    this.track('hit', 0.05);
    this.noise({ dur: 0.045, vol: 0.09, filter: 'highpass', freq: 2600 });
  }

  kill(size) {
    if (!this.allow('kill', 0.035, 5)) return;
    const big = size > 20;
    this.track('kill', big ? 0.35 : 0.14);
    const f = 520 - size * 9 + Math.random() * 60;
    this.tone({ freq: f, to: f * 0.35, dur: big ? 0.3 : 0.12, type: 'square', vol: big ? 0.12 : 0.06 });
    this.noise({ dur: big ? 0.3 : 0.1, vol: big ? 0.2 : 0.08, freq: big ? 500 : 1400, to: 200, q: 0.8 });
  }

  pickup() {
    if (!this.allow('pickup', 0.028, 4)) return;
    this.track('pickup', 0.12);
    const now = this.ctx.currentTime;
    this.pickupStreak = now - this.pickupAt < 0.45 ? Math.min(this.pickupStreak + 1, 24) : 0;
    this.pickupAt = now;
    /* up a pentatonic scale with the streak */
    const scale = [0, 2, 4, 7, 9];
    const n = 79 + scale[this.pickupStreak % 5] + 12 * Math.floor(this.pickupStreak / 5) * 0.5;
    this.tone({ freq: midi(Math.min(n, 100)), dur: 0.11, type: 'sine', vol: 0.07 });
  }

  levelUp() {
    if (!this.allow('level', 0.2, 2)) return;
    [72, 76, 79, 84].forEach((n, i) => {
      this.tone({ freq: midi(n), dur: 0.35, type: 'triangle', vol: 0.12, delay: i * 0.06 });
      this.tone({ freq: midi(n + 12), dur: 0.25, type: 'sine', vol: 0.05, delay: i * 0.06 });
    });
  }

  hurt() {
    if (!this.allow('hurt', 0.12, 2)) return;
    this.track('hurt', 0.25);
    this.tone({ freq: 160, to: 55, dur: 0.22, type: 'sawtooth', vol: 0.18 });
    this.noise({ dur: 0.18, vol: 0.15, filter: 'lowpass', freq: 900 });
  }

  nova() {
    if (!this.allow('nova', 0.2, 2)) return;
    this.noise({ dur: 0.45, vol: 0.18, freq: 300, to: 2400, q: 1.5 });
    this.tone({ freq: 90, to: 40, dur: 0.3, type: 'sine', vol: 0.25 });
  }

  surge() {
    if (!this.allow('surge', 1, 1)) return;
    this.tone({ freq: 220, to: 440, dur: 0.9, type: 'sawtooth', vol: 0.06, attack: 0.3 });
    this.tone({ freq: 223, to: 446, dur: 0.9, type: 'sawtooth', vol: 0.06, attack: 0.3 });
  }

  death() {
    this.tone({ freq: 300, to: 30, dur: 1.4, type: 'sawtooth', vol: 0.22 });
    this.noise({ dur: 1.2, vol: 0.3, filter: 'lowpass', freq: 2000, to: 100 });
  }

  ui() {
    if (!this.allow('ui', 0.05, 2)) return;
    this.tone({ freq: 880, dur: 0.06, type: 'triangle', vol: 0.08 });
  }

  pick() {
    if (!this.ctx) return;
    this.tone({ freq: midi(84), dur: 0.18, type: 'triangle', vol: 0.12 });
    this.tone({ freq: midi(91), dur: 0.22, type: 'sine', vol: 0.06, delay: 0.05 });
  }

  consume(events) {
    if (!this.ctx || this.muted) return;
    for (let i = 0; i < events.count; i++) {
      switch (events.type[i]) {
        case EV.SHOT: this.shot(); break;
        case EV.HIT: this.hit(); break;
        case EV.KILL: this.kill(events.b[i]); break;
        case EV.PICKUP: this.pickup(); break;
        case EV.LEVELUP: this.levelUp(); break;
        case EV.HURT: this.hurt(); break;
        case EV.NOVA: this.nova(); break;
        case EV.SURGE: this.surge(); break;
        case EV.PLAYER_DEATH: this.death(); break;
      }
    }
  }

  /* ------------------------------------------------------------ music */

  startMusic() {
    if (!this.ctx) return;
    this.musicOn = true;
    this.step = 0;
    this.nextStep = this.ctx.currentTime + 0.1;
  }

  stopMusic() {
    this.musicOn = false;
    if (!this.ctx) return;
    for (const g of Object.values(this.layers)) g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
  }

  /** 0..1: how hard the fight is. Layers come in at rising thresholds. */
  setIntensity(x) {
    this.intensity = x;
    if (!this.ctx || !this.musicOn) return;
    const t = this.ctx.currentTime;
    const on = (th, v) => (x >= th ? v : 0);
    this.layers.kick.gain.setTargetAtTime(0.9, t, 0.5);
    this.layers.bass.gain.setTargetAtTime(on(0.12, 0.7), t, 0.8);
    this.layers.hat.gain.setTargetAtTime(on(0.3, 0.5), t, 0.8);
    this.layers.clap.gain.setTargetAtTime(on(0.5, 0.6), t, 0.8);
    this.layers.arp.gain.setTargetAtTime(on(0.72, 0.45), t, 1.2);
  }

  /* Look-ahead scheduling: notes are queued 120ms ahead on the audio clock,
     so a janky frame never makes the beat stumble. */
  schedule() {
    if (!this.ctx || !this.musicOn) return;
    const ahead = this.ctx.currentTime + 0.12;
    while (this.nextStep < ahead) {
      this.playStep(this.step, this.nextStep);
      this.nextStep += STEP;
      this.step = (this.step + 1) % 64;
    }
  }

  playStep(s, t) {
    const L = this.layers, bar = Math.floor(s / 16), k = s % 16;
    const chord = CHORDS[bar % 4], x = this.intensity;
    if (k % 4 === 0) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.22);
      g.gain.setValueAtTime(0.6, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      o.connect(g).connect(L.kick);
      o.start(t);
      o.stop(t + 0.3);
    }
    /* Layers below the current intensity are silent anyway, so their notes
       are not built at all. Each test sits a little under the layer's
       threshold in setIntensity() so a layer's first bar is not lost. */
    if (k % 2 === 0 && x >= 0.1) {
      /* off-beat pumping bass: root on the 8ths, octave on the offs */
      const n = chord[0] - 24 + (k % 4 === 2 ? 12 : 0);
      const o = this.ctx.createOscillator(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.value = midi(n);
      f.type = 'lowpass';
      f.frequency.setValueAtTime(900, t);
      f.frequency.exponentialRampToValueAtTime(180, t + STEP * 1.8);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.3, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + STEP * 1.9);
      o.connect(f).connect(g).connect(L.bass);
      o.start(t);
      o.stop(t + STEP * 2);
    }
    if (k % 4 === 2 && x >= 0.28) this.noise({ at: t, dur: 0.05, vol: 0.25, filter: 'highpass', freq: 7000, bus: L.hat });
    if ((k === 4 || k === 12) && x >= 0.48) this.noise({ at: t, dur: 0.16, vol: 0.4, freq: 1500, q: 0.7, bus: L.clap });
    if (x >= 0.7) {
      const n = chord[[0, 1, 2, 1][k % 4]] + 12 + (k >= 8 ? 12 : 0);
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = midi(n);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.14, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + STEP * 0.9);
      o.connect(g).connect(L.arp);
      o.start(t);
      o.stop(t + STEP);
    }
  }
}
