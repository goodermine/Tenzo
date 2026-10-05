/* HOLDOUT - movement input.
   A floating thumb-stick: put a thumb down anywhere outside the HUD and the
   stick appears under it, so there is no fixed spot to find without looking.
   Only the first touch steers; a second finger is ignored rather than
   yanking the stick. WASD and arrows work too, for desktop. */
const RADIUS = 56;     /* css px of travel for full speed */
const DEAD = 0.12;

export class Input {
  constructor(surface, base, knob) {
    this.surface = surface;
    this.base = base;
    this.knob = knob;
    this.enabled = false;
    this.pointer = -1;
    this.ox = 0;
    this.oy = 0;
    this.sx = 0;
    this.sy = 0;
    this.keys = new Set();

    surface.addEventListener('pointerdown', e => this.down(e));
    addEventListener('pointermove', e => this.moveTo(e));
    addEventListener('pointerup', e => this.up(e));
    addEventListener('pointercancel', e => this.up(e));
    addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
        this.keys.add(k);
        e.preventDefault();
      }
    });
    addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => {
      this.keys.clear();
      this.release();
    });
  }

  down(e) {
    if (!this.enabled || this.pointer !== -1) return;
    this.pointer = e.pointerId;
    this.ox = e.clientX;
    this.oy = e.clientY;
    this.sx = this.sy = 0;
    this.base.style.transform = `translate(${this.ox}px, ${this.oy}px)`;
    this.knob.style.transform = `translate(${this.ox}px, ${this.oy}px)`;
    this.base.classList.add('on');
    this.knob.classList.add('on');
  }

  moveTo(e) {
    if (e.pointerId !== this.pointer) return;
    let dx = e.clientX - this.ox, dy = e.clientY - this.oy;
    const d = Math.hypot(dx, dy);
    /* Past the rim, drag the base along behind the thumb instead of
       pinning it: a thumb that wanders keeps full control. */
    if (d > RADIUS) {
      const pull = d - RADIUS;
      this.ox += (dx / d) * pull;
      this.oy += (dy / d) * pull;
      dx = e.clientX - this.ox;
      dy = e.clientY - this.oy;
      this.base.style.transform = `translate(${this.ox}px, ${this.oy}px)`;
    }
    this.sx = dx / RADIUS;
    this.sy = dy / RADIUS;
    this.knob.style.transform = `translate(${this.ox + dx}px, ${this.oy + dy}px)`;
  }

  up(e) {
    if (e.pointerId === this.pointer) this.release();
  }

  release() {
    this.pointer = -1;
    this.sx = this.sy = 0;
    this.base.classList.remove('on');
    this.knob.classList.remove('on');
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) this.release();
  }

  /** Movement vector, length 0..1, after the dead zone. */
  read(out) {
    let x = this.sx, y = this.sy;
    const k = this.keys;
    if (k.has('a') || k.has('arrowleft')) x -= 1;
    if (k.has('d') || k.has('arrowright')) x += 1;
    if (k.has('w') || k.has('arrowup')) y -= 1;
    if (k.has('s') || k.has('arrowdown')) y += 1;
    let l = Math.hypot(x, y);
    if (l < DEAD) {
      out.x = out.y = 0;
      return out;
    }
    if (l > 1) {
      x /= l;
      y /= l;
      l = 1;
    }
    /* re-map so the dead zone edge is zero speed, not a jump to 12% */
    const m = (l - DEAD) / (1 - DEAD) / l;
    out.x = x * m;
    out.y = y * m;
    return out;
  }
}
