/* TILT LAB - drawing. Everything is vector, drawn fresh each frame at the
 * screen's pixel density, so edges stay crisp at every tilt angle.
 *
 * The light is fixed to the screen, not the chamber: highlights stay on
 * the top-left and shadows fall straight down however the lab is tilted.
 * That is what makes the chamber read as a real object turning in front of
 * you rather than a picture being rotated. */
import type { Lab, Ball } from '../core/physics.ts';
import { MAX_TILT } from '../core/physics.ts';
import type { Pt } from '../entities/types.ts';
import { KINDS, BALL_R } from '../entities/types.ts';
import { CHAMBER, CHAMBER_CORNER, railPath, cupPath, CUP_WALL } from '../entities/geometry.ts';
import { LOOKS, GATE, BUTTON, PIT } from './palette.ts';
import type { WorldLook } from './palette.ts';
import type { Particles } from '../effects/particles.ts';

const FRAME = 44;            /* rim width, chamber units */
const TAU = Math.PI * 2;

function pathOf(pts: Pt[], close = true): Path2D {
  const p = new Path2D();
  pts.forEach((q, i) => (i ? p.lineTo(q[0], q[1]) : p.moveTo(q[0], q[1])));
  if (close) p.closePath();
  return p;
}

function roundRect(p: Path2D | CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  p.moveTo(x + r, y);
  p.arcTo(x + w, y, x + w, y + h, r);
  p.arcTo(x + w, y + h, x, y + h, r);
  p.arcTo(x, y + h, x, y, r);
  p.arcTo(x, y, x + w, y, r);
  p.closePath();
}

interface RailArt {
  outline: Path2D; center: Path2D; top: number; bottom: number; r: number;
  kind: 'plain' | 'bouncy' | 'magnetic' | 'oneway'; path: Pt[]; dir?: Pt;
}

/* special rails wear their behaviour: jelly lime bounces, purple grabs
   purple balls, teal lets balls through one way */
const RAIL_KINDS = {
  bouncy: { grad: ['#e4ff8a', '#8ff03a', '#36b81f'], edge: 'rgba(30, 120, 20, 0.6)' },
  magnetic: { grad: ['#e8c4ff', '#a347ff', '#5d14c9'], edge: 'rgba(70, 10, 150, 0.6)' },
  oneway: { grad: ['#b4fff2', '#1fd8bb', '#0a948c'], edge: 'rgba(0, 110, 100, 0.6)' }
};

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  look: WorldLook = LOOKS[0];
  W = 1; H = 1; dpr = 1;
  /* chamber centre on screen, and screen pixels per chamber unit */
  cx = 0; cy = 0; scale = 1;
  private bg: HTMLCanvasElement | null = null;
  private rails: RailArt[] = [];
  private cups: { outline: Path2D; center: Path2D }[] = [];
  private gates: Path2D[] = [];
  private pads: { path: Path2D; center: Path2D }[] = [];
  private lab: Lab | null = null;
  private interior = new Path2D();
  private frame = new Path2D();
  private grid = new Path2D();
  private stripes: CanvasPattern | null = null;
  private stripesTeal: CanvasPattern | null = null;
  private springPaths: Path2D[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    roundRect(this.interior, 0, 0, CHAMBER, CHAMBER, CHAMBER_CORNER);
    roundRect(this.frame, -FRAME, -FRAME, CHAMBER + FRAME * 2, CHAMBER + FRAME * 2, CHAMBER_CORNER + FRAME);
    for (let k = 50; k < CHAMBER; k += 50) {
      this.grid.moveTo(k, 0); this.grid.lineTo(k, CHAMBER);
      this.grid.moveTo(0, k); this.grid.lineTo(CHAMBER, k);
    }
    /* candy stripes for gates */
    const s = document.createElement('canvas');
    s.width = s.height = 32;
    const c = s.getContext('2d')!;
    c.fillStyle = GATE.b;
    c.fillRect(0, 0, 32, 32);
    c.fillStyle = GATE.a;
    for (let k = -32; k < 64; k += 16) {
      c.beginPath();
      c.moveTo(k, 0); c.lineTo(k + 8, 0); c.lineTo(k + 8 - 32, 32); c.lineTo(k - 32, 32);
      c.closePath();
      c.fill();
    }
    this.stripes = this.ctx.createPattern(s, 'repeat');
    /* inverted gates (open until pressed) get teal stripes */
    const s2 = document.createElement('canvas');
    s2.width = s2.height = 32;
    const c2 = s2.getContext('2d')!;
    c2.drawImage(s, 0, 0);
    c2.globalCompositeOperation = 'source-atop';
    c2.fillStyle = '#1fd8bb';
    c2.globalAlpha = 1;
    c2.fillRect(0, 0, 32, 32);
    c2.globalCompositeOperation = 'destination-over';
    c2.fillStyle = '#ffffff';
    c2.fillRect(0, 0, 32, 32);
    this.stripesTeal = this.ctx.createPattern(s2, 'repeat');
  }

  /** Switch to a world's colours. */
  setLook(look: WorldLook) {
    if (this.look === look) return;
    this.look = look;
    this.bg = null;
  }

  /** Fit the chamber - at full tilt - inside the area between the HUD bars. */
  resize(w: number, h: number, top: number, bottom: number, left = 0, right = 0) {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = w;
    this.H = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    const span = (CHAMBER + FRAME * 2) * (Math.cos(MAX_TILT) + Math.sin(MAX_TILT)) * 0.94;
    const aw = w - 16 - left - right, ah = h - top - bottom;
    this.scale = Math.max(0.1, Math.min(aw / span, ah / span));
    this.cx = left + 8 + aw / 2;
    this.cy = top + ah / 2;
    this.bg = null;
  }

  setLab(lab: Lab) {
    this.lab = lab;
    this.rails = lab.level.rails.map((r, i) => {
      const ys = lab.rails[i].map(p => p[1]);
      return {
        outline: pathOf(lab.rails[i]), center: pathOf(railPath(r), false),
        top: Math.min(...ys), bottom: Math.max(...ys), r: r.r ?? 18,
        kind: r.bouncy ? 'bouncy' : r.magnetic ? 'magnetic' : r.oneWay ? 'oneway' : 'plain',
        path: railPath(r), dir: r.oneWay
      } as RailArt;
    });
    this.cups = lab.targets.map(t => ({ outline: pathOf(t.outline), center: pathOf(cupPath(t.def), false) }));
    this.gates = lab.gates.map(g => pathOf(g.outline));
    this.springPaths = lab.springs.map(sp => pathOf(sp.outline));
    this.pads = lab.switches.map(s => {
      const c = new Path2D();
      c.moveTo(s.def.a[0], s.def.a[1]);
      c.lineTo(s.def.b[0], s.def.b[1]);
      return { path: pathOf(s.outline), center: c };
    });
  }

  /* ------------------------------------------------------------ backdrop */

  private backdrop(): HTMLCanvasElement {
    if (this.bg) return this.bg;
    const b = document.createElement('canvas');
    b.width = this.canvas.width;
    b.height = this.canvas.height;
    const c = b.getContext('2d')!;
    const W = b.width, H = b.height, L = this.look;
    const g = c.createLinearGradient(0, 0, W * 0.3, H);
    g.addColorStop(0, L.sky[0]);
    g.addColorStop(0.5, L.sky[1]);
    g.addColorStop(1, L.sky[2]);
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    /* soft pools of colour */
    const spots: [number, number, number][] = [[0.12, 0.18, 0.55], [0.92, 0.3, 0.5], [0.25, 0.95, 0.6], [0.85, 0.92, 0.45]];
    spots.forEach(([x, y, r], i) => {
      const rr = Math.max(W, H) * r;
      const rg = c.createRadialGradient(W * x, H * y, 0, W * x, H * y, rr);
      rg.addColorStop(0, L.blobs[i % L.blobs.length]);
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = rg;
      c.fillRect(0, 0, W, H);
    });
    /* a fine dot grid, like lab paper */
    c.fillStyle = 'rgba(255, 255, 255, 0.35)';
    const step = 22 * this.dpr;
    for (let y = step / 2; y < H; y += step) {
      for (let x = (Math.floor(y / step) % 2) * step / 2; x < W; x += step) {
        c.beginPath();
        c.arc(x, y, 1.3 * this.dpr, 0, TAU);
        c.fill();
      }
    }
    this.bg = b;
    return b;
  }

  /* --------------------------------------------------------------- frame */

  /**
   * Draw one frame. `rot` is the chamber's on-screen rotation (the tilt,
   * or 0 when the phone itself is being tilted); `t` is real time.
   */
  draw(rot: number, t: number, particles: Particles, shake: Pt = [0, 0]) {
    const ctx = this.ctx, lab = this.lab!, L = this.look;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.backdrop(), 0, 0);

    const s = this.scale * this.dpr;
    ctx.setTransform(s, 0, 0, s, (this.cx + shake[0]) * this.dpr, (this.cy + shake[1]) * this.dpr);
    ctx.rotate(rot);
    ctx.translate(-CHAMBER / 2, -CHAMBER / 2);

    /* screen-down and the light direction, expressed in the chamber frame */
    const down: Pt = [Math.sin(rot), Math.cos(rot)];
    const light: Pt = rotateV([-0.5, -0.86], -rot);

    /* -- the chamber: glow, rim, floor, grid */
    ctx.save();
    ctx.translate(down[0] * 16, down[1] * 16);
    ctx.fillStyle = L.shadow;
    ctx.fill(this.frame);
    ctx.restore();
    for (const [w, a] of [[46, 0.18], [26, 0.28], [10, 0.45]] as const) {
      ctx.lineWidth = w;
      ctx.strokeStyle = L.glow.replace(/[\d.]+\)$/, a + ')');
      ctx.stroke(this.frame);
    }
    const fg = ctx.createLinearGradient(0, -FRAME, CHAMBER * 0.2, CHAMBER + FRAME);
    fg.addColorStop(0, L.frame[0]);
    fg.addColorStop(1, L.frame[1]);
    ctx.fillStyle = fg;
    ctx.fill(this.frame);
    const ig = ctx.createLinearGradient(0, 0, 0, CHAMBER);
    ig.addColorStop(0, L.interior[0]);
    ig.addColorStop(1, L.interior[1]);
    ctx.fillStyle = ig;
    ctx.fill(this.interior);
    ctx.save();
    ctx.clip(this.interior);
    ctx.lineWidth = 2;
    ctx.strokeStyle = L.grid;
    ctx.stroke(this.grid);
    /* inner shadow along the rim, so the floor sits below it */
    ctx.lineWidth = 26;
    ctx.strokeStyle = 'rgba(120, 70, 200, 0.07)';
    ctx.stroke(this.interior);
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(120, 70, 200, 0.08)';
    ctx.stroke(this.interior);

    this.drawPits(ctx, t);

    /* -- shadows of everything solid */
    ctx.save();
    ctx.translate(down[0] * 9, down[1] * 9);
    ctx.fillStyle = L.shadow;
    for (const r of this.rails) ctx.fill(r.outline);
    for (const c of this.cups) ctx.fill(c.outline);
    for (const p of this.pads) ctx.fill(p.path);
    lab.gates.forEach((g, i) => {
      ctx.save();
      ctx.translate(g.def.slide[0] * g.open, g.def.slide[1] * g.open);
      ctx.fill(this.gates[i]);
      ctx.restore();
    });
    for (const p of this.springPaths) ctx.fill(p);
    for (const sw of lab.seesaws) {
      ctx.save();
      ctx.translate(sw.x, sw.y);
      ctx.rotate(sw.angle);
      ctx.beginPath();
      roundRect(ctx, (sw.def.offset || 0) - sw.def.half, -14, sw.def.half * 2, 28, 14);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();

    this.drawFans(ctx, t);
    this.drawMagnetFields(ctx, t);
    this.drawLinks(ctx, t);
    this.drawCupGlow(ctx, t);
    this.drawRails(ctx, t);
    this.drawCups(ctx);
    this.drawPads(ctx, t);
    this.drawSprings(ctx);
    this.drawSeesaws(ctx);
    this.drawGates(ctx, t);
    this.drawMagnets(ctx, t);

    /* -- balls, shadows first */
    for (const b of lab.balls) {
      if (b.lost) continue;
      const sx = b.x + down[0] * 10, sy = b.y + down[1] * 10;
      const sg = ctx.createRadialGradient(sx, sy, BALL_R * 0.2, sx, sy, BALL_R * 1.15);
      sg.addColorStop(0, 'rgba(90, 30, 150, 0.28)');
      sg.addColorStop(1, 'rgba(90, 30, 150, 0)');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(sx, sy, BALL_R * 1.15, 0, TAU);
      ctx.fill();
    }
    for (const b of lab.balls) if (!b.lost) drawBall(ctx, b, light, lab.state === 'won' ? t : -1);

    particles.draw(ctx);
    ctx.restore();

    /* glass: a soft sheen across the top of the chamber */
    ctx.save();
    ctx.clip(this.interior);
    const gl = ctx.createLinearGradient(
      CHAMBER / 2 + light[0] * CHAMBER * 0.6, CHAMBER / 2 + light[1] * CHAMBER * 0.6, CHAMBER / 2, CHAMBER / 2);
    gl.addColorStop(0, 'rgba(255,255,255,0.32)');
    gl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl;
    ctx.fill(this.interior);
    ctx.restore();
    /* the rim's top edge catches the light */
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.stroke(this.frame);
  }

  private drawPits(ctx: CanvasRenderingContext2D, t: number) {
    for (const h of this.lab!.level.hazards || []) {
      const g = ctx.createLinearGradient(0, h.y, 0, h.y + h.h);
      g.addColorStop(0, PIT.mid);
      g.addColorStop(1, PIT.deep);
      ctx.fillStyle = g;
      ctx.beginPath();
      roundRect(ctx, h.x, h.y, h.w, h.h + 40, 16);
      ctx.fill();
      /* a glowing zig-zag along the lip */
      ctx.lineWidth = 6;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = PIT.top;
      ctx.shadowColor = PIT.top;
      ctx.shadowBlur = 0;
      ctx.beginPath();
      const n = Math.max(2, Math.round(h.w / 26));
      for (let k = 0; k <= n; k++) {
        const x = h.x + (h.w * k) / n, y = h.y + 6 + (k % 2 ? 10 : 0) + Math.sin(t * 6 + k) * 2;
        if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
      ctx.lineJoin = 'miter';
    }
  }

  /** Dashed lines from each switch to the gates it drives. */
  private drawLinks(ctx: CanvasRenderingContext2D, t: number) {
    const lab = this.lab!;
    ctx.save();
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.setLineDash([2, 14]);
    const driven: { by?: string[]; x: number; y: number }[] = [
      ...lab.gates.map(g => ({ by: g.def.by, x: (g.def.a[0] + g.def.b[0]) / 2, y: (g.def.a[1] + g.def.b[1]) / 2 })),
      ...lab.fans.map(f => ({ by: f.def.by, x: f.def.x + f.def.w / 2, y: f.def.y + f.def.h / 2 })),
      ...lab.magnets.map(m => ({ by: m.def.by, x: m.def.x, y: m.def.y }))
    ];
    for (const g of driven) {
      const gx = g.x, gy = g.y;
      for (const s of lab.switches) {
        if (!g.by || !g.by.includes(s.def.id)) continue;
        const sx = (s.def.a[0] + s.def.b[0]) / 2, sy = (s.def.a[1] + s.def.b[1]) / 2;
        ctx.lineDashOffset = s.active ? -t * 40 : 0;
        ctx.strokeStyle = s.active ? 'rgba(255, 61, 154, 0.85)' : 'rgba(255, 61, 154, 0.3)';
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(gx, gy);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private drawRails(ctx: CanvasRenderingContext2D, t: number) {
    const L = this.look;
    for (const r of this.rails) {
      const k = r.kind === 'plain' ? { grad: L.rail, edge: L.railEdge } : RAIL_KINDS[r.kind];
      const g = ctx.createLinearGradient(0, r.top - r.r, 0, r.bottom + r.r);
      g.addColorStop(0, k.grad[0]);
      g.addColorStop(0.45, k.grad[1]);
      g.addColorStop(1, k.grad[2]);
      ctx.fillStyle = g;
      ctx.fill(r.outline);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = k.edge;
      ctx.stroke(r.outline);
      if (r.kind === 'magnetic') {
        /* a field shimmer along a magnetic rail */
        ctx.save();
        ctx.lineCap = 'round';
        ctx.setLineDash([4, 22]);
        ctx.lineDashOffset = -t * 30;
        ctx.lineWidth = r.r * 2 + 34;
        ctx.strokeStyle = 'rgba(163, 71, 255, 0.16)';
        ctx.stroke(r.center);
        ctx.restore();
      }
      if (r.kind === 'oneway' && r.dir) this.chevrons(ctx, r, t);
      /* the glossy streak along the top of the tube */
      ctx.save();
      ctx.clip(r.outline);
      ctx.translate(0, -r.r * 0.42);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = r.r * 0.55;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.stroke(r.center);
      ctx.restore();
    }
  }

  private drawCupGlow(ctx: CanvasRenderingContext2D, t: number) {
    for (const tg of this.lab!.targets) {
      const k = KINDS[tg.def.colour];
      const home = !!tg.ball, won = this.lab!.state === 'won';
      const pulse = 0.5 + 0.5 * Math.sin(t * 3.2);
      const R = BALL_R * (home ? 2.1 : 1.6 + pulse * 0.25);
      const g = ctx.createRadialGradient(tg.rest[0], tg.rest[1], 0, tg.rest[0], tg.rest[1], R);
      g.addColorStop(0, hexA(k.fill, home ? (won ? 0.85 : 0.6) : 0.32));
      g.addColorStop(1, hexA(k.fill, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(tg.rest[0], tg.rest[1], R, 0, TAU);
      ctx.fill();
      if (!home) {
        /* a dashed ghost of the ball that belongs here */
        ctx.save();
        ctx.setLineDash([7, 8]);
        ctx.lineDashOffset = -t * 12;
        ctx.lineWidth = 3;
        ctx.strokeStyle = hexA(k.dark, 0.45);
        ctx.beginPath();
        ctx.arc(tg.rest[0], tg.rest[1], BALL_R - 2, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  private drawCups(ctx: CanvasRenderingContext2D) {
    this.lab!.targets.forEach((tg, i) => {
      const k = KINDS[tg.def.colour], c = this.cups[i];
      const g = ctx.createLinearGradient(0, tg.def.y - 30, 0, tg.def.y + 50);
      g.addColorStop(0, k.light);
      g.addColorStop(0.5, k.fill);
      g.addColorStop(1, k.dark);
      ctx.fillStyle = g;
      ctx.fill(c.outline);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = hexA(k.dark, 0.8);
      ctx.stroke(c.outline);
      ctx.save();
      ctx.clip(c.outline);
      ctx.translate(0, -CUP_WALL * 0.4);
      ctx.lineCap = 'round';
      ctx.lineWidth = CUP_WALL * 0.6;
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.stroke(c.center);
      ctx.restore();
    });
  }

  private drawPads(ctx: CanvasRenderingContext2D, t: number) {
    this.lab!.switches.forEach((sw, i) => {
      const p = this.pads[i], heavy = (sw.def.minMass ?? 0) >= 2;
      /* a heavy plate wears the colour of the ball that can press it */
      const col = heavy ? { fill: KINDS.red.fill, light: KINDS.red.light, dark: KINDS.red.dark } : BUTTON;
      const a = sw.def.a, b = sw.def.b, dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      const nx = -dy / l, ny = dx / l, mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      /* waiting to be pressed: a soft pulse draws the eye */
      if (!sw.active) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 4);
        ctx.lineWidth = 18 + pulse * 14;
        ctx.strokeStyle = hexA(col.fill, 0.12 + pulse * 0.12);
        ctx.stroke(p.path);
      }
      /* pressed pads sink a little into their surface */
      const sink = sw.press * 5;
      ctx.save();
      ctx.translate(nx * sink, ny * sink);
      const g = ctx.createLinearGradient(mx - nx * 12, my - ny * 12, mx + nx * 12, my + ny * 12);
      g.addColorStop(0, col.light);
      g.addColorStop(0.5, col.fill);
      g.addColorStop(1, col.dark);
      ctx.fillStyle = g;
      ctx.fill(p.path);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = hexA(col.dark, 0.8);
      ctx.stroke(p.path);
      /* its mark: dots for a heavy plate, a ring for a toggle, a draining
         arc for a timer, a dot for a button or plain plate */
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      if (heavy) {
        for (const k of [-1, 0, 1]) ctx.arc(mx + dx / l * k * 11, my + dy / l * k * 11, 3.4, 0, TAU);
        ctx.fill();
      } else if (sw.def.toggle) {
        ctx.arc(mx, my, 5.5, 0, TAU);
        ctx.stroke();
        if (sw.active) { ctx.beginPath(); ctx.arc(mx, my, 2.5, 0, TAU); ctx.fill(); }
      } else if (sw.def.hold) {
        const f = sw.active ? Math.min(1, (sw.load ? sw.def.hold : sw.timer) / sw.def.hold) : 0;
        ctx.arc(mx, my, 6, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0.06, f));
        ctx.stroke();
      } else {
        ctx.arc(mx, my, 4.5, 0, TAU);
        ctx.fill();
      }
      if (sw.active) {
        ctx.lineWidth = 14;
        ctx.strokeStyle = hexA(col.fill, 0.3);
        ctx.stroke(p.path);
      }
      ctx.restore();
    });
  }

  private drawGates(ctx: CanvasRenderingContext2D, t: number) {
    const L = this.look;
    this.lab!.gates.forEach((g, i) => {
      /* a bridge that a switch brings in: a dashed ghost marks where it
         will be, so the player can see what the switch is for */
      if (g.def.invert && !g.def.period && g.open > 0.02) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, g.open * 1.5) * 0.75;
        ctx.setLineDash([10, 9]);
        ctx.lineDashOffset = -t * 18;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0, 150, 140, 0.9)';
        ctx.fillStyle = 'rgba(40, 220, 200, 0.12)';
        ctx.fill(this.gates[i]);
        ctx.stroke(this.gates[i]);
        ctx.restore();
      }
      ctx.save();
      ctx.translate(g.def.slide[0] * g.open, g.def.slide[1] * g.open);
      if (g.def.platform || g.def.period) {
        /* a moving platform: a chunky rail with bright end caps */
        const ys = [g.def.a[1], g.def.b[1]];
        const gr = ctx.createLinearGradient(0, Math.min(...ys) - g.r, 0, Math.max(...ys) + g.r);
        gr.addColorStop(0, '#ffe27a');
        gr.addColorStop(0.5, '#ffb21f');
        gr.addColorStop(1, '#e06a00');
        ctx.fillStyle = gr;
        ctx.fill(this.gates[i]);
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(160, 70, 0, 0.6)';
        ctx.stroke(this.gates[i]);
        ctx.fillStyle = '#ffffff';
        for (const e of [g.def.a, g.def.b]) {
          ctx.beginPath();
          ctx.arc(e[0], e[1], g.r * 0.4, 0, TAU);
          ctx.fill();
        }
      } else {
        ctx.fillStyle = g.def.invert ? this.stripesTeal! : this.stripes!;
        ctx.fill(this.gates[i]);
        ctx.lineWidth = 3;
        ctx.strokeStyle = g.def.invert ? 'rgba(0, 120, 110, 0.6)' : GATE.edge;
        ctx.stroke(this.gates[i]);
      }
      ctx.restore();
    });
    void L;
  }

  /** Arrows along a one-way rail, pointing the way balls may pass. */
  private chevrons(ctx: CanvasRenderingContext2D, r: RailArt, t: number) {
    const d = r.dir!, path = r.path;
    const a = path[0], b = path[path.length - 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.floor(len / 70));
    ctx.save();
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const bob = Math.sin(t * 5) * 4;
    for (let k = 0; k < n; k++) {
      const f = (k + 0.5) / n;
      const x = a[0] + (b[0] - a[0]) * f + d[0] * bob, y = a[1] + (b[1] - a[1]) * f + d[1] * bob;
      const px = -d[1], py = d[0];
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.beginPath();
      ctx.moveTo(x - d[0] * 7 + px * 9, y - d[1] * 7 + py * 9);
      ctx.lineTo(x + d[0] * 7, y + d[1] * 7);
      ctx.lineTo(x - d[0] * 7 - px * 9, y - d[1] * 7 - py * 9);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawFans(ctx: CanvasRenderingContext2D, t: number) {
    for (const f of this.lab!.fans) {
      const d = f.def;
      ctx.save();
      ctx.beginPath();
      roundRect(ctx, d.x, d.y, d.w, d.h, 26);
      ctx.fillStyle = f.on ? 'rgba(100, 220, 255, 0.16)' : 'rgba(160, 140, 255, 0.07)';
      ctx.fill();
      ctx.setLineDash([10, 12]);
      ctx.lineWidth = 3;
      ctx.strokeStyle = f.on ? 'rgba(31, 182, 255, 0.45)' : 'rgba(140, 120, 230, 0.3)';
      ctx.stroke();
      ctx.setLineDash([]);
      if (f.on) {
        /* streams of air flowing along the fan's direction */
        ctx.clip();
        ctx.lineCap = 'round';
        ctx.lineWidth = 5;
        const along = Math.abs(d.dir[0]) > Math.abs(d.dir[1]) ? d.w : d.h;
        const across = along === d.w ? d.h : d.w;
        const lanes = Math.max(2, Math.round(across / 60));
        for (let k = 0; k < lanes; k++) {
          for (let j = 0; j < 3; j++) {
            const u = ((t * 0.9 + j / 3 + k * 0.37) % 1) * (along + 80) - 40;
            const w = ((k + 0.5) / lanes) * across;
            const x0 = d.dir[0] ? (d.dir[0] > 0 ? d.x + u : d.x + d.w - u) : d.x + w;
            const y0 = d.dir[1] ? (d.dir[1] > 0 ? d.y + u : d.y + d.h - u) : d.y + w;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x0 - d.dir[0] * 34, y0 - d.dir[1] * 34);
            ctx.stroke();
          }
        }
      }
      ctx.restore();
      /* the fan unit at its source edge, blades spinning */
      const cx = d.dir[0] > 0 ? d.x : d.dir[0] < 0 ? d.x + d.w : d.x + d.w / 2;
      const cy = d.dir[1] > 0 ? d.y : d.dir[1] < 0 ? d.y + d.h : d.y + d.h / 2;
      ctx.save();
      ctx.translate(cx, cy);
      const hg = ctx.createRadialGradient(-6, -6, 2, 0, 0, 30);
      hg.addColorStop(0, '#ffffff');
      hg.addColorStop(1, '#8fdcff');
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(0, 0, 28, 0, TAU);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0, 98, 214, 0.55)';
      ctx.stroke();
      ctx.rotate(f.on ? t * 14 : 0);
      ctx.fillStyle = '#1fb6ff';
      for (let k = 0; k < 4; k++) {
        ctx.rotate(Math.PI / 2);
        ctx.beginPath();
        ctx.ellipse(0, -11, 6, 12, 0.5, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private drawSprings(ctx: CanvasRenderingContext2D) {
    this.lab!.springs.forEach((sp, i) => {
      const a = sp.def.a, b = sp.def.b, n = sp.normal;
      const sq = sp.squash * 8;
      /* a zig-zag coil under the pad */
      ctx.save();
      ctx.lineWidth = 5;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#a347ff';
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, ux = (b[0] - a[0]) / 2, uy = (b[1] - a[1]) / 2;
      ctx.beginPath();
      for (let k = 0; k <= 6; k++) {
        const depth = 14 + (k / 6) * (26 - sq), side = k % 2 ? 0.6 : -0.6;
        const x = mx - n[0] * depth + ux * side, y = my - n[1] * depth + uy * side;
        if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
      ctx.translate(-n[0] * sq, -n[1] * sq);
      const g = ctx.createLinearGradient(mx + n[0] * 14, my + n[1] * 14, mx - n[0] * 14, my - n[1] * 14);
      g.addColorStop(0, '#fff27a');
      g.addColorStop(1, '#ffb21f');
      ctx.fillStyle = g;
      ctx.fill(this.springPaths[i]);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(200, 110, 0, 0.7)';
      ctx.stroke(this.springPaths[i]);
      ctx.restore();
    });
  }

  private drawSeesaws(ctx: CanvasRenderingContext2D) {
    for (const sw of this.lab!.seesaws) {
      const [px, py] = sw.def.pivot;
      /* the stand */
      ctx.fillStyle = '#c9b8ff';
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + 30, py + 60);
      ctx.lineTo(px - 30, py + 60);
      ctx.closePath();
      ctx.fill();
      ctx.save();
      ctx.translate(sw.x, sw.y);
      ctx.rotate(sw.angle);
      const g = ctx.createLinearGradient(0, -14, 0, 14);
      g.addColorStop(0, '#ff9ccc');
      g.addColorStop(0.5, '#ff3d9a');
      g.addColorStop(1, '#c4006a');
      ctx.fillStyle = g;
      const o = sw.def.offset || 0;
      ctx.beginPath();
      roundRect(ctx, o - sw.def.half, -14, sw.def.half * 2, 28, 14);
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgba(140, 0, 70, 0.6)';
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(o - sw.def.half + 12, -9, sw.def.half * 2 - 24, 5);
      /* a heavy plank shows its weight as bands */
      if ((sw.def.density ?? 0.4) > 1) {
        ctx.fillStyle = 'rgba(140, 0, 70, 0.35)';
        for (let k = -2; k <= 2; k++) ctx.fillRect(o + k * sw.def.half * 0.35 - 3, -12, 6, 24);
      }
      for (const px of sw.def.posts || []) {
        ctx.fillStyle = g;
        ctx.beginPath();
        roundRect(ctx, px - 9, -58, 18, 50, 9);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(140, 0, 70, 0.6)';
        ctx.stroke();
      }
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawMagnetFields(ctx: CanvasRenderingContext2D, t: number) {
    for (const m of this.lab!.magnets) {
      const d = m.def;
      const g = ctx.createRadialGradient(d.x, d.y, 30, d.x, d.y, d.r);
      const col = d.repel ? '255, 61, 154' : '163, 71, 255';
      g.addColorStop(0, `rgba(${col}, ${m.on ? 0.22 : 0.06})`);
      g.addColorStop(1, `rgba(${col}, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, TAU);
      ctx.fill();
      if (!m.on) continue;
      /* rings drift inward for a pull, outward for a push */
      ctx.lineWidth = 3;
      for (let k = 0; k < 3; k++) {
        let f = (t * 0.6 + k / 3) % 1;
        if (!d.repel) f = 1 - f;
        ctx.strokeStyle = `rgba(${col}, ${0.45 * (1 - Math.abs(f - 0.5) * 2) + 0.05})`;
        ctx.beginPath();
        ctx.arc(d.x, d.y, 34 + f * (d.r - 34), 0, TAU);
        ctx.stroke();
      }
    }
  }

  private drawMagnets(ctx: CanvasRenderingContext2D, t: number) {
    for (const m of this.lab!.magnets) {
      const d = m.def;
      ctx.save();
      ctx.translate(d.x, d.y);
      const g = ctx.createRadialGradient(-8, -10, 3, 0, 0, 30);
      g.addColorStop(0, m.on ? '#ffffff' : '#f2eaff');
      g.addColorStop(0.5, m.on ? (d.repel ? '#ff7cc0' : '#c58aff') : '#ddd0ff');
      g.addColorStop(1, m.on ? (d.repel ? '#e2007a' : '#6a1fd6') : '#b8a6f0');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 30, 0, TAU);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(70, 10, 150, 0.5)';
      ctx.stroke();
      /* N/S marks: a plus for pull, a minus for push */
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-11, 0);
      ctx.lineTo(11, 0);
      if (!d.repel) { ctx.moveTo(0, -11); ctx.lineTo(0, 11); }
      ctx.stroke();
      if (m.on) {
        ctx.lineWidth = 4;
        ctx.strokeStyle = `rgba(255,255,255,${0.4 + 0.3 * Math.sin(t * 6)})`;
        ctx.beginPath();
        ctx.arc(0, 0, 36, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}

/* ------------------------------------------------------------------ balls */

function rotateV(v: Pt, a: number): Pt {
  const c = Math.cos(a), s = Math.sin(a);
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c];
}

export function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** A glossy acrylic ball: lit from `light` (a unit vector, chamber frame). */
export function drawBall(ctx: CanvasRenderingContext2D, b: Ball | { colour: Ball['colour']; x: number; y: number; angle: number },
  light: Pt, glowT = -1) {
  const k = KINDS[b.colour], r = BALL_R, x = b.x, y = b.y;
  if (glowT >= 0) {
    const gg = ctx.createRadialGradient(x, y, r * 0.8, x, y, r * 1.9);
    gg.addColorStop(0, hexA(k.light, 0.7));
    gg.addColorStop(1, hexA(k.light, 0));
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.9, 0, TAU);
    ctx.fill();
  }
  const g = ctx.createRadialGradient(x + light[0] * r * 0.45, y + light[1] * r * 0.45, r * 0.08, x, y, r);
  g.addColorStop(0, k.light);
  g.addColorStop(0.55, k.fill);
  g.addColorStop(1, k.dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  /* a printed band that turns with the ball, so you can see it roll */
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r - 1, 0, TAU);
  ctx.clip();
  ctx.translate(x, y);
  ctx.rotate(b.angle);
  ctx.fillStyle = 'rgba(255,255,255,0.26)';
  ctx.fillRect(-r, -r * 0.16, r * 2, r * 0.32);
  ctx.beginPath();
  ctx.arc(r * 0.62, -r * 0.42, r * 0.11, 0, TAU);
  ctx.fill();
  if (b.colour === 'red') {
    /* heavy: a dense core */
    ctx.strokeStyle = hexA(k.dark, 0.45);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.5, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
  /* rim and gloss */
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = hexA(k.dark, 0.55);
  ctx.beginPath();
  ctx.arc(x, y, r - 1.2, 0, TAU);
  ctx.stroke();
  ctx.save();
  ctx.translate(x + light[0] * r * 0.42, y + light[1] * r * 0.42);
  ctx.rotate(Math.atan2(light[1], light[0]) + Math.PI / 2);
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.34, r * 0.19, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath();
  ctx.arc(x + light[0] * r * 0.55, y + light[1] * r * 0.55, r * 0.07, 0, TAU);
  ctx.fill();
}
