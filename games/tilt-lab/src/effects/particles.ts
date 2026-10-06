/* TILT LAB - particles: confetti, sparks, shards and rings. They live in
   the chamber's frame and fall the way its gravity points. */
import type { Pt } from '../entities/types.ts';

export interface Particle {
  kind: 'dot' | 'confetti' | 'star' | 'ring' | 'shard';
  x: number; y: number; vx: number; vy: number;
  r: number; rot: number; spin: number;
  life: number; age: number; color: string; grav: number;
}

export class Particles {
  list: Particle[] = [];

  add(p: Partial<Particle> & { x: number; y: number; color: string }) {
    if (this.list.length > 600) this.list.shift();
    this.list.push({
      kind: 'dot', vx: 0, vy: 0, r: 6, rot: 0, spin: 0, life: 0.8, age: 0, grav: 1, ...p
    });
  }

  /** A burst of `n` pieces flying out from (x, y). */
  burst(x: number, y: number, colors: string[], n: number, speed: number, kinds: Particle['kind'][] = ['confetti', 'dot', 'star']) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.35 + Math.random() * 0.75);
      const kind = kinds[i % kinds.length];
      this.add({
        kind, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - speed * 0.35,
        r: kind === 'dot' ? 6 + Math.random() * 9 : kind === 'star' ? 12 + Math.random() * 12 : 10 + Math.random() * 12,
        rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * 14,
        life: 0.7 + Math.random() * 0.7, color: colors[i % colors.length], grav: kind === 'dot' ? 0.5 : 0.9
      });
    }
  }

  ring(x: number, y: number, color: string, r = 20, life = 0.55) {
    this.add({ kind: 'ring', x, y, r, life, color, grav: 0 });
  }

  update(dt: number, g: Pt) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.age += dt;
      if (p.age >= p.life) { L.splice(i, 1); continue; }
      p.vx += g[0] * p.grav * dt;
      p.vy += g[1] * p.grav * dt;
      const drag = Math.exp(-2.2 * dt);
      p.vx *= drag;
      p.vy *= drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    for (const p of this.list) {
      const f = p.age / p.life, a = f < 0.7 ? 1 : 1 - (f - 0.7) / 0.3;
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = p.color;
      ctx.strokeStyle = p.color;
      if (p.kind === 'ring') {
        ctx.globalAlpha = (1 - f) * 0.9;
        ctx.lineWidth = 22 * (1 - f) + 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r + f * 170, 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      if (p.kind === 'confetti') {
        ctx.fillRect(-p.r, -p.r * 0.45, p.r * 2, p.r * 0.9);
      } else if (p.kind === 'shard') {
        ctx.beginPath();
        ctx.moveTo(0, -p.r);
        ctx.lineTo(p.r * 0.7, p.r * 0.6);
        ctx.lineTo(-p.r * 0.6, p.r * 0.4);
        ctx.closePath();
        ctx.fill();
      } else if (p.kind === 'star') {
        star(ctx, p.r * (1 - f * 0.4));
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.r * (1 - f * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}

export function star(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.38 : r;
    if (i) ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
}
