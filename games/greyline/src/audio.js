/* Greyline - synthesized weapon and impact audio. No sample files. */
export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
  }
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.noiseBuffer = this._noise(1.2);
  }
  resume() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }
  _noise(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  _burst({ dur = 0.2, freq = 900, q = 1, type = 'lowpass', gain = 0.4, sweep = null, delay = 0 }) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 0.7 + Math.random() * 0.6;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, sweep), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.05);
  }
  _tone({ freq = 200, to = null, dur = 0.1, gain = 0.2, type = 'sine', delay = 0 }) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  shot() {
    this._burst({ dur: 0.13, freq: 2600, sweep: 260, gain: 0.5 });
    this._tone({ freq: 150, to: 48, dur: 0.16, gain: 0.4, type: 'square' });
    /* street reverb: two slap-backs off the facades */
    this._burst({ dur: 0.34, freq: 1200, sweep: 200, gain: 0.12, delay: 0.09 });
    this._burst({ dur: 0.55, freq: 700, sweep: 140, gain: 0.07, delay: 0.2 });
  }
  distantShot() {
    this._burst({ dur: 0.22, freq: 900, sweep: 150, gain: 0.16 });
    this._burst({ dur: 0.5, freq: 500, sweep: 120, gain: 0.06, delay: 0.13 });
  }
  impact() {
    this._burst({ dur: 0.09, freq: 3800, sweep: 900, gain: 0.22, type: 'bandpass', q: 1.2 });
  }
  flesh() {
    this._burst({ dur: 0.12, freq: 700, sweep: 120, gain: 0.3 });
  }
  hitmarker() {
    this._tone({ freq: 1750, dur: 0.05, gain: 0.16, type: 'square' });
  }
  kill() {
    this._tone({ freq: 880, dur: 0.07, gain: 0.16, type: 'square' });
    this._tone({ freq: 1320, dur: 0.1, gain: 0.14, type: 'square', delay: 0.06 });
  }
  reload() {
    this._burst({ dur: 0.08, freq: 1800, gain: 0.2, type: 'bandpass', q: 2 });
    this._burst({ dur: 0.1, freq: 900, gain: 0.22, type: 'bandpass', q: 2, delay: 0.42 });
    this._tone({ freq: 320, to: 160, dur: 0.08, gain: 0.2, type: 'square', delay: 0.75 });
  }
  step(power) {
    this._burst({ dur: 0.07, freq: 420 + Math.random() * 180, gain: 0.09 * power, sweep: 120 });
  }
  hurt() {
    this._tone({ freq: 220, to: 90, dur: 0.3, gain: 0.3, type: 'sawtooth' });
  }
  dryFire() {
    this._burst({ dur: 0.04, freq: 2600, gain: 0.14, type: 'bandpass', q: 3 });
  }
}
