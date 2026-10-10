/* TILT LAB - input. Everything becomes one number: the tilt, -1 (full
 * left) to 1 (full right). Let go and it returns to 0.
 *
 *  - Keyboard: A / D or the arrow keys.
 *  - Buttons: on touch screens, two big arrows to hold.
 *  - Drag: press anywhere and slide left or right. Past full tilt the
 *    anchor follows your finger, so reversing responds at once.
 *  - Motion: tilt the phone itself. The angle is how far the screen's
 *    left-right axis leans from level - what would make a real marble roll
 *    across the screen - measured from how you held the phone when you
 *    switched it on. */
import { MAX_TILT } from './physics.ts';

type Handler = () => void;

export class Input {
  private keys = new Set<string>();
  private pointer = -1;
  private x0 = 0;
  private drag = 0;
  private pad = 0;
  private motionRaw = 0;
  private motionZero: number | null = null;
  private motionSmooth = 0;
  motion = false;
  motionAvailable = typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
  /** set by the game: whether input should do anything right now */
  enabled = true;
  onReset: Handler = () => {};
  onPause: Handler = () => {};
  /** the first time the player moves anything */
  onFirstTilt: Handler = () => {};
  private moved = false;

  constructor(surface: HTMLElement) {
    addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      if (['a', 'd', 'arrowleft', 'arrowright'].includes(k)) {
        this.keys.add(k);
        e.preventDefault();
      } else if (k === 'r' && !e.repeat) {
        this.onReset();
      } else if ((k === 'escape' || k === 'p') && !e.repeat) {
        this.onPause();
      }
    });
    addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => { this.keys.clear(); this.release(); });

    surface.addEventListener('pointerdown', e => {
      if (this.pointer !== -1) return;
      this.pointer = e.pointerId;
      this.x0 = e.clientX;
      this.drag = 0;
      try { surface.setPointerCapture(e.pointerId); } catch (_) { /* not supported */ }
    });
    surface.addEventListener('pointermove', e => {
      if (e.pointerId !== this.pointer) return;
      const range = this.range();
      let d = (e.clientX - this.x0) / range;
      /* past full tilt, drag the anchor along */
      if (d > 1) { this.x0 = e.clientX - range; d = 1; }
      if (d < -1) { this.x0 = e.clientX + range; d = -1; }
      this.drag = d;
    });
    const up = (e: PointerEvent) => { if (e.pointerId === this.pointer) this.release(); };
    surface.addEventListener('pointerup', up);
    surface.addEventListener('pointercancel', up);

    addEventListener('deviceorientation', e => this.orient(e));
  }

  /** An on-screen arrow: tilts `dir` while held. */
  bindPad(el: HTMLElement, dir: number) {
    let id = -1;
    el.addEventListener('pointerdown', e => {
      id = e.pointerId;
      this.pad = dir;
      el.classList.add('down');
      try { el.setPointerCapture(e.pointerId); } catch (_) { /* not supported */ }
      e.preventDefault();
    });
    const up = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = -1;
      if (this.pad === dir) this.pad = 0;
      el.classList.remove('down');
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('contextmenu', e => e.preventDefault());
  }

  private range() {
    return Math.max(70, Math.min(150, innerWidth * 0.2));
  }

  private release() {
    this.pointer = -1;
    this.drag = 0;
  }

  /** Forget anything held: used between screens. */
  clear() {
    this.keys.clear();
    this.release();
    this.pad = 0;
    for (const el of document.querySelectorAll('#pads .down')) el.classList.remove('down');
  }

  private orient(e: DeviceOrientationEvent) {
    if (e.beta == null || e.gamma == null) return;
    const b = e.beta * Math.PI / 180, g = e.gamma * Math.PI / 180;
    /* the world's "up" in the device's frame */
    const ux = -Math.sin(g) * Math.cos(b), uy = Math.sin(b);
    const a = ((screen.orientation && screen.orientation.angle) || (window as any).orientation || 0) * Math.PI / 180;
    /* its component along the screen's x axis: + means the right side is up */
    const comp = ux * Math.cos(a) - uy * Math.sin(a);
    this.motionRaw = -Math.asin(Math.max(-1, Math.min(1, comp)));
    if (this.motion && this.motionZero === null) this.motionZero = this.motionRaw;
  }

  /** Turn motion control on. On iOS this must run inside a tap. */
  async enableMotion(): Promise<boolean> {
    const DOE = (window as any).DeviceOrientationEvent;
    try {
      if (DOE && typeof DOE.requestPermission === 'function') {
        const r = await DOE.requestPermission();
        if (r !== 'granted') return false;
      }
    } catch (_) {
      return false;
    }
    this.motion = true;
    this.motionZero = null;
    this.motionSmooth = 0;
    return true;
  }

  disableMotion() {
    this.motion = false;
    this.motionZero = null;
  }

  /** Re-level: the current hold becomes "flat". */
  recalibrate() {
    this.motionZero = null;
  }

  /** The tilt input for this frame, -1..1. */
  read(dt: number): number {
    if (!this.enabled) return 0;
    let k = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) k -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) k += 1;
    let v = k || this.pad || this.drag;
    if (this.motion && this.motionZero !== null) {
      const target = (this.motionRaw - this.motionZero) / MAX_TILT;
      this.motionSmooth += (target - this.motionSmooth) * Math.min(1, dt * 14);
      /* a small dead zone, so holding still means level */
      const m = Math.abs(this.motionSmooth) < 0.06 ? 0 : this.motionSmooth;
      if (!k && !this.pad && this.pointer === -1) v = m;
    }
    v = Math.max(-1, Math.min(1, v));
    if (v !== 0 && !this.moved) {
      this.moved = true;
      this.onFirstTilt();
    }
    return v;
  }

  /** Whether the motion sensor is steering right now (for drawing). */
  get motionSteering(): boolean {
    return this.motion && this.motionZero !== null && !this.keys.size && !this.pad && this.pointer === -1;
  }
}
