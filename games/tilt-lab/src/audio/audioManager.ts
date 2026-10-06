/* TILT LAB - every sound is synthesised; there are no audio files.
 * Light and satisfying: soft rolling, gentle knocks, clicks, bell chimes,
 * and a quiet, bright music loop (C major, I-vi-IV-V). */
import type { Colour } from '../entities/types.ts';

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
const BPM = 100;
const SIXTEENTH = 60 / BPM / 4;
/* C - Am - F - G, as MIDI chord tones */
const CHORDS = [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]];
/* a fixed melodic rhythm: which sixteenths play, and which chord tone */
const MELODY: [number, number][] = [[0, 2], [3, 1], [6, 2], [8, 0], [10, 1], [14, 2]];
const PITCH: Record<Colour, number> = { yellow: 76, red: 64, blue: 79, green: 74, purple: 71, orange: 62 };

export class AudioManager {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private rollGain!: GainNode;
  private rollFilter!: BiquadFilterNode;
  private noise!: AudioBuffer;
  muted = false;
  musicOn = false;
  private step = 0;
  private next = 0;

  /** Browsers keep audio locked until a tap or key press. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC() as AudioContext; } catch (_) { return; }
    const c = this.ctx;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : 0.85;
    this.master.connect(comp).connect(c.destination);
    this.sfx = c.createGain();
    this.sfx.gain.value = 0.8;
    this.sfx.connect(this.master);
    this.music = c.createGain();
    this.music.gain.value = 0.28;
    this.music.connect(this.master);

    this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    /* the rolling hum: filtered noise, louder and brighter with speed */
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    this.rollFilter = c.createBiquadFilter();
    this.rollFilter.type = 'bandpass';
    this.rollFilter.frequency.value = 300;
    this.rollFilter.Q.value = 1.2;
    this.rollGain = c.createGain();
    this.rollGain.gain.value = 0;
    src.connect(this.rollFilter).connect(this.rollGain).connect(this.sfx);
    src.start();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.ctx.currentTime, 0.03);
  }

  /** Rolling: `amount` 0..1 (speed of balls on surfaces), `heavy` 0..1. */
  roll(amount: number, heavy: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.rollGain.gain.setTargetAtTime(Math.min(0.5, amount * 0.55), t, 0.05);
    this.rollFilter.frequency.setTargetAtTime(160 + amount * 520 - heavy * 90, t, 0.05);
  }

  private tone(freq: number, dur: number, gain: number, type: OscillatorType = 'sine', at = 0, bend = 1, dest?: AudioNode) {
    const c = this.ctx!, t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (bend !== 1) o.frequency.exponentialRampToValueAtTime(freq * bend, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest || this.sfx);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private bell(note: number, gain: number, at = 0, dest?: AudioNode) {
    const f = midi(note);
    this.tone(f, 1.1, gain, 'sine', at, 1, dest);
    this.tone(f * 2.76, 0.45, gain * 0.35, 'sine', at, 1, dest);
    this.tone(f * 5.4, 0.18, gain * 0.12, 'sine', at, 1, dest);
  }

  private hiss(dur: number, gain: number, f0: number, f1: number, at = 0) {
    const c = this.ctx!, t = c.currentTime + at;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.sfx);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }

  impact(power: number, colour: Colour) {
    if (!this.ctx) return;
    const v = Math.min(1, (power - 1.2) / 10);
    if (v <= 0) return;
    const f = midi(PITCH[colour] - 12) * (0.9 + Math.random() * 0.2);
    this.tone(f, 0.12, 0.12 + v * 0.35, 'triangle', 0, 0.6);
    this.hiss(0.05, 0.05 + v * 0.12, 2400, 1200);
  }

  press() {
    if (!this.ctx) return;
    this.tone(1800, 0.03, 0.18, 'square');
    this.tone(midi(72), 0.16, 0.18, 'sine', 0.02, 1.5);
  }

  release() {
    if (!this.ctx) return;
    this.tone(1400, 0.03, 0.12, 'square');
    this.tone(midi(74), 0.16, 0.12, 'sine', 0.02, 0.66);
  }

  gate(open: boolean) {
    if (!this.ctx) return;
    this.hiss(0.4, 0.14, open ? 400 : 1400, open ? 1600 : 380);
  }

  home(colour: Colour) {
    if (!this.ctx) return;
    this.bell(PITCH[colour] + 5, 0.22);
    this.bell(PITCH[colour] + 12, 0.14, 0.09);
  }

  away() {
    if (!this.ctx) return;
    this.tone(midi(67), 0.2, 0.1, 'sine', 0, 0.75);
  }

  won() {
    if (!this.ctx) return;
    [72, 76, 79, 84, 88].forEach((n, i) => this.bell(n, 0.2, i * 0.075));
    this.hiss(0.9, 0.08, 6000, 9000, 0.3);
  }

  lost() {
    if (!this.ctx) return;
    this.tone(520, 0.35, 0.25, 'triangle', 0, 0.3);
    this.hiss(0.2, 0.1, 3000, 600);
  }

  ui() {
    if (!this.ctx) return;
    this.tone(midi(79), 0.08, 0.12, 'sine', 0, 1.2);
  }

  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.next = this.ctx.currentTime + 0.1;
    this.step = 0;
  }

  stopMusic() {
    this.musicOn = false;
  }

  /** Call every frame: schedules the next few music steps. */
  update() {
    if (!this.ctx || !this.musicOn) return;
    const c = this.ctx;
    while (this.next < c.currentTime + 0.15) {
      const at = this.next - c.currentTime;
      const s = this.step % 16, bar = Math.floor(this.step / 16) % 4, ch = CHORDS[bar];
      /* bass on the beat */
      if (s === 0 || s === 8) this.tone(midi(ch[0] - 24), 0.45, 0.32, 'sine', at, 1, this.music);
      if (s === 12) this.tone(midi(ch[2] - 24), 0.25, 0.22, 'sine', at, 1, this.music);
      /* a plucked melody from the chord */
      for (const [when, idx] of MELODY) {
        if (s === when) {
          const n = ch[idx] + 12 + ((bar === 3 && when === 14) ? 2 : 0);
          this.tone(midi(n), 0.32, 0.16, 'sine', at, 1, this.music);
          this.tone(midi(n) * 4, 0.06, 0.04, 'sine', at, 1, this.music);
        }
      }
      /* soft shaker on the off-beats */
      if (s % 4 === 2) {
        const t = c.currentTime + at;
        const src = c.createBufferSource();
        src.buffer = this.noise;
        const f = c.createBiquadFilter();
        f.type = 'highpass';
        f.frequency.value = 7000;
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.06, t + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
        src.connect(f).connect(g).connect(this.music);
        src.start(t, Math.random());
        src.stop(t + 0.08);
      }
      this.next += SIXTEENTH;
      this.step++;
    }
  }
}
