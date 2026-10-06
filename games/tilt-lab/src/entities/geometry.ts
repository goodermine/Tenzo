/* TILT LAB - shapes shared by the physics and the renderer, so what you
   see is exactly what the balls collide with. */
import type { Pt, RailDef, TargetDef } from './types.ts';
import { BALL_R } from './types.ts';

export const RAIL_R = 18;
export const CHAMBER = 1000;
export const CHAMBER_CORNER = 70;

const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const len = (a: Pt) => Math.hypot(a[0], a[1]);
const norm = (a: Pt): Pt => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
/* the left-hand normal of a direction, in a y-down frame */
const left = (d: Pt): Pt => [d[1], -d[0]];

/** Catmull-Rom through the points, sampled every ~`step` units. */
export function smoothPath(pts: Pt[], step = 10): Pt[] {
  if (pts.length < 3) return pts.slice();
  const out: Pt[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const n = Math.max(2, Math.ceil(len(sub(p2, p1)) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
      ]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function arc(c: Pt, r: number, a0: number, a1: number, out: Pt[], step = 0.35) {
  /* from angle a0 to a1, the short way round in the given sign */
  const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / step));
  for (let k = 0; k <= n; k++) {
    const a = a0 + (a1 - a0) * (k / n);
    out.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]);
  }
}

/** One side of the stroke: offsets to the left of the path, with round
    outer joins and mitred inner joins. */
function side(path: Pt[], r: number, out: Pt[]) {
  const n = path.length;
  for (let i = 0; i < n; i++) {
    const p = path[i];
    const dIn = i > 0 ? norm(sub(p, path[i - 1])) : null;
    const dOut = i < n - 1 ? norm(sub(path[i + 1], p)) : null;
    if (!dIn || !dOut) {
      const nn = left((dIn || dOut)!);
      out.push([p[0] + nn[0] * r, p[1] + nn[1] * r]);
      continue;
    }
    const n1 = left(dIn), n2 = left(dOut);
    const cross = dIn[0] * dOut[1] - dIn[1] * dOut[0];
    const dot = n1[0] * n2[0] + n1[1] * n2[1];
    if (Math.abs(cross) < 1e-4) {
      out.push([p[0] + n1[0] * r, p[1] + n1[1] * r]);
    } else if (cross > 0) {
      /* the left side is the outside of this bend: round the corner */
      const a0 = Math.atan2(n1[1], n1[0]);
      let a1 = Math.atan2(n2[1], n2[0]);
      while (a1 < a0) a1 += Math.PI * 2;
      while (a1 > a0 + Math.PI * 2) a1 -= Math.PI * 2;
      arc(p, r, a0, a1, out);
    } else {
      /* inside of the bend: the two offsets meet at the mitre point */
      const k = r / Math.max(0.2, 1 + dot);
      out.push([p[0] + (n1[0] + n2[0]) * k, p[1] + (n1[1] + n2[1]) * k]);
    }
  }
}

/** Closed outline of a thick line with round ends: the rail's solid edge. */
export function strokeOutline(path: Pt[], r: number): Pt[] {
  const out: Pt[] = [];
  side(path, r, out);
  /* end cap: half circle from the left normal round to the right */
  const e = path[path.length - 1], de = norm(sub(e, path[path.length - 2]));
  const ne = left(de);
  const ae = Math.atan2(ne[1], ne[0]);
  arc(e, r, ae, ae + Math.PI, out);
  const back = path.slice().reverse();
  side(back, r, out);
  const s = path[0], ds = norm(sub(path[1], s));
  const ns = left([-ds[0], -ds[1]]);
  const as = Math.atan2(ns[1], ns[0]);
  arc(s, r, as, as + Math.PI, out);
  return dedupe(out);
}

export function dedupe(pts: Pt[], min = 1.2): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > min) out.push(p);
  }
  while (out.length > 2 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= min) out.pop();
  return out;
}

export function railPath(rail: RailDef): Pt[] {
  return rail.smooth ? smoothPath(rail.pts) : rail.pts.slice();
}

export function railOutline(rail: RailDef): Pt[] {
  return strokeOutline(railPath(rail), rail.r ?? RAIL_R);
}

/* A target is a cup: a curved pocket with flared lips, open at the top.
   (x, y) is the middle of its mouth, level with its lips' inner tops. */
/* Cup walls are as thick as rails, so where a floor meets a cup's lip the
   two tops are exactly level: no step for a ball to catch on. */
export const CUP_WALL = RAIL_R;
export const CUP_R = BALL_R + 2 + CUP_WALL;   /* radius of the cup's centre line */
/* The lips are a wide, gentle funnel - out 70, up 15 (about 12 degrees):
   wide enough to catch a ball arriving at a fair speed, gentle enough that
   a ball resting on top of a filled cup can still roll away. The tips are
   flush with a floor at y - 15, x +/- (CUP_R + CUP_FLARE) = x +/- 134. */
export const CUP_FLARE = 70;
export const CUP_LIP = 15;
/* straight sides above the round bottom: deep enough that a ball at home
   sits just below the floor, so other balls roll straight over it */
export const CUP_DEPTH = 16;
export function cupPath(t: TargetDef): Pt[] {
  const c: Pt = [t.x, t.y + CUP_DEPTH];
  /* beside a wall, the wall side is a steep backstop straight into the
     cup instead of a lip: an overshooting ball drops in, and nothing can
     come to rest between the cup and the wall */
  const leftWall = t.x - CUP_R - CUP_FLARE < 60, rightWall = t.x + CUP_R + CUP_FLARE > CHAMBER - 60;
  const pts: Pt[] = leftWall
    ? [[-24, t.y - 90], [t.x - CUP_R, t.y]]
    : [[t.x - CUP_R - CUP_FLARE, t.y - CUP_LIP], [t.x - CUP_R, t.y]];
  arc(c, CUP_R, Math.PI, 0, pts, 0.18);
  if (rightWall) pts.push([t.x + CUP_R, t.y], [CHAMBER + 24, t.y - 90]);
  else pts.push([t.x + CUP_R, t.y], [t.x + CUP_R + CUP_FLARE, t.y - CUP_LIP]);
  return pts;
}
export function cupOutline(t: TargetDef): Pt[] {
  return strokeOutline(cupPath(t), CUP_WALL);
}
/** Where a ball sits when it is home. */
export function cupRest(t: TargetDef): Pt {
  return [t.x, t.y + CUP_DEPTH + CUP_R - CUP_WALL - BALL_R];
}

/** The chamber's inner wall, a rounded square, as a closed loop. */
export function chamberLoop(): Pt[] {
  const s = CHAMBER, c = CHAMBER_CORNER, out: Pt[] = [];
  arc([c, c], c, Math.PI, Math.PI * 1.5, out, 0.2);
  arc([s - c, c], c, Math.PI * 1.5, Math.PI * 2, out, 0.2);
  arc([s - c, s - c], c, 0, Math.PI * 0.5, out, 0.2);
  arc([c, s - c], c, Math.PI * 0.5, Math.PI, out, 0.2);
  return dedupe(out);
}

/** Distance from point p to segment ab. */
export function segDist(p: Pt, a: Pt, b: Pt): number {
  const abx = b[0] - a[0], aby = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / (abx * abx + aby * aby || 1)));
  return Math.hypot(p[0] - (a[0] + abx * t), p[1] - (a[1] + aby * t));
}

/** A gate's or platform's shape: a bar, or a tray with raised ends. */
export function gatePath(g: { a: Pt; b: Pt; tray?: boolean }): Pt[] {
  if (!g.tray) return [g.a, g.b];
  const dx = g.b[0] - g.a[0], dy = g.b[1] - g.a[1], l = Math.hypot(dx, dy) || 1;
  const ux = dy / l * 46, uy = -dx / l * 46;   /* "up" off the bar */
  return [[g.a[0] + ux, g.a[1] + uy], g.a, g.b, [g.b[0] + ux, g.b[1] + uy]];
}

/** The nearest point to p on a polyline, and its distance. */
export function nearestOnPath(p: Pt, path: Pt[]): { q: Pt; d: number } {
  let best: Pt = path[0], bd = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const abx = b[0] - a[0], aby = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / (abx * abx + aby * aby || 1)));
    const q: Pt = [a[0] + abx * t, a[1] + aby * t];
    const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (d < bd) { bd = d; best = q; }
  }
  return { q: best, d: bd };
}
