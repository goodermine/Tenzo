/* TILT LAB - the lab: one level's physics, stepped at a fixed rate.
 *
 * The level's geometry never moves. Tilting rotates gravity in the
 * chamber's frame instead, and the renderer turns the chamber on screen by
 * the same angle - so gravity always looks straight down. Nothing static
 * sweeps through a ball, and the same inputs always give the same result,
 * which is what lets tools/solve.ts prove every level can be beaten.
 *
 * No DOM here: this runs in Node as well as the browser. */
import { World, Vec2, Circle, Chain, Box } from 'planck';
import type { Body, Fixture } from 'planck';
import type { LevelDef, Colour, Pt, GateDef, SwitchDef, TargetDef } from '../entities/types.ts';
import { KINDS, BALL_R } from '../entities/types.ts';
import {
  CHAMBER, chamberLoop, railOutline, cupOutline, cupRest, strokeOutline, segDist, RAIL_R
} from '../entities/geometry.ts';

/** chamber units per metre */
export const S = 50;
export const STEP = 1 / 120;
export const MAX_TILT = 24 * Math.PI / 180;
/* game gravity, in m/s^2: brisk, so a full tilt crosses the lab in ~2 s */
export const GRAVITY = 26;

const TILT_W = 13;            /* tilt spring: how quickly it follows input */
const TILT_MAX_SPEED = 2.3;   /* rad/s */
const SETTLE_SPEED = 55;      /* units/s: slow enough to count as home */
const SETTLE_TIME = 0.3;
const GATE_SPEED = 1.8;       /* fraction of the slide per second */

export type LabEvent =
  | { t: 'impact'; x: number; y: number; power: number; colour: Colour }
  | { t: 'press' | 'release'; id: string; x: number; y: number }
  | { t: 'gate'; open: boolean; x: number; y: number }
  | { t: 'home' | 'away'; colour: Colour; x: number; y: number }
  | { t: 'lost'; colour: Colour; x: number; y: number }
  | { t: 'won' };

export interface Ball {
  colour: Colour;
  body: Body;
  weight: number;
  home: Target | null;
  /* for the renderer and audio */
  x: number; y: number; vx: number; vy: number; angle: number; speed: number; touching: number;
  lastHit: number;
  lost: boolean;
}

export interface Target { def: TargetDef; rest: Pt; ball: Ball | null; settle: number; outline: Pt[] }

export interface Switch {
  def: SwitchDef; body: Body; active: boolean; latched: boolean;
  load: number;   /* weight on it this step */
  press: number;  /* 0..1, eased, for drawing */
  outline: Pt[];
}

export interface Gate {
  def: GateDef; body: Body; open: number; /* 0 closed .. 1 open */
  wantOpen: boolean; r: number; outline: Pt[];
}

type Tag = { kind: 'ball'; ball: Ball } | { kind: 'switch'; sw: Switch } | { kind: 'solid' };

const v = (p: Pt) => Vec2(p[0] / S, p[1] / S);

export class Lab {
  readonly level: LevelDef;
  readonly world: World;
  readonly balls: Ball[] = [];
  readonly targets: Target[] = [];
  readonly switches: Switch[] = [];
  readonly gates: Gate[] = [];
  readonly rails: Pt[][] = [];
  readonly events: LabEvent[] = [];

  /** tilt input, -1 (full left) .. 1 (full right); set before step() */
  input = 0;
  angle = 0;
  angVel = 0;
  time = 0;
  state: 'play' | 'won' | 'lost' = 'play';
  /** seconds since the level was won or lost */
  since = 0;
  private acc = 0;

  constructor(level: LevelDef) {
    this.level = level;
    this.world = new World({ gravity: Vec2(0, GRAVITY), allowSleep: false });
    const ground = this.world.createBody();
    const solid: Tag = { kind: 'solid' };

    /* the chamber's walls */
    ground.createFixture(Chain(chamberLoop().map(v), true), { friction: 0.6, restitution: 0.15, userData: solid });

    /* rails: each a closed outline, so balls roll smoothly over every joint */
    for (const r of level.rails) {
      const o = railOutline(r);
      this.rails.push(o);
      ground.createFixture(Chain(o.map(v), true), { friction: 0.7, restitution: 0.12, userData: solid });
    }

    for (const t of level.targets) {
      const outline = cupOutline(t);
      ground.createFixture(Chain(outline.map(v), true), { friction: 0.8, restitution: 0.05, userData: solid });
      this.targets.push({ def: t, rest: cupRest(t), ball: null, settle: 0, outline });
    }

    for (const d of level.switches || []) {
      const body = this.world.createBody();
      const outline = strokeOutline([d.a, d.b], 11);
      const sw: Switch = { def: d, body, active: false, latched: false, load: 0, press: 0, outline };
      body.createFixture(Chain(outline.map(v), true), { friction: 0.8, restitution: 0.05, userData: { kind: 'switch', sw } as Tag });
      this.switches.push(sw);
    }

    for (const d of level.gates || []) {
      const r = d.r ?? RAIL_R;
      const body = this.world.createKinematicBody({ position: Vec2(0, 0) });
      /* a capsule from a to b: a box and two round ends */
      const a = v(d.a), b = v(d.b);
      const mid = Vec2((a.x + b.x) / 2, (a.y + b.y) / 2);
      const L = Math.hypot(b.x - a.x, b.y - a.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
      body.createFixture(Box(L / 2, r / S, mid, ang), { friction: 0.6, userData: solid });
      body.createFixture(Circle(a, r / S), { friction: 0.6, userData: solid });
      body.createFixture(Circle(b, r / S), { friction: 0.6, userData: solid });
      this.gates.push({ def: d, body, open: 0, wantOpen: false, r, outline: strokeOutline([d.a, d.b], r) });
    }

    for (const d of level.balls) {
      const k = KINDS[d.colour];
      const body = this.world.createDynamicBody({
        position: v([d.x, d.y]), bullet: true, gravityScale: k.gravityScale,
        linearDamping: k.linearDamping, angularDamping: k.angularDamping
      });
      const ball: Ball = {
        colour: d.colour, body, weight: k.density, home: null,
        x: d.x, y: d.y, vx: 0, vy: 0, angle: 0, speed: 0, touching: 0, lastHit: -1, lost: false
      };
      body.createFixture(Circle(BALL_R / S), {
        density: k.density, friction: k.friction, restitution: k.restitution, userData: { kind: 'ball', ball } as Tag
      });
      this.balls.push(ball);
    }

    this.sync();
  }

  /** Gravity in the chamber's frame for the current tilt. */
  gravity(): Pt {
    return [Math.sin(this.angle) * GRAVITY, Math.cos(this.angle) * GRAVITY];
  }

  /** Advance by real time dt in fixed steps. Returns the steps taken. */
  advance(dt: number): number {
    this.acc = Math.min(this.acc + dt, 0.25);
    let n = 0;
    while (this.acc >= STEP) {
      this.step();
      this.acc -= STEP;
      n++;
    }
    return n;
  }

  step() {
    const dt = STEP;
    this.time += dt;
    if (this.state !== 'play') this.since += dt;

    /* the tilt follows the input on a stiff, critically damped spring */
    const target = Math.max(-1, Math.min(1, this.input)) * MAX_TILT;
    if (this.state === 'play') {
      const accel = TILT_W * TILT_W * (target - this.angle) - 2 * TILT_W * this.angVel;
      this.angVel = Math.max(-TILT_MAX_SPEED, Math.min(TILT_MAX_SPEED, this.angVel + accel * dt));
      this.angle += this.angVel * dt;
    }
    const g = this.gravity();
    this.world.setGravity(Vec2(g[0], g[1]));

    this.updateGates(dt);
    /* rolling resistance: a ball on a surface loses speed at a steady rate,
       so it comes to rest on the flat instead of creeping for ever */
    for (const b of this.balls) {
      if (b.lost || !b.touching || b.body.isStatic()) continue;
      const lv = b.body.getLinearVelocity(), sp = Math.hypot(lv.x, lv.y);
      if (sp < 1e-4) continue;
      const dv = Math.min(sp, KINDS[b.colour].rolling * dt);
      const m = b.body.getMass();
      b.body.applyLinearImpulse(Vec2(-lv.x / sp * dv * m, -lv.y / sp * dv * m), b.body.getWorldCenter(), true);
      b.body.setAngularVelocity(b.body.getAngularVelocity() * (1 - dv / sp));
    }
    this.world.step(dt, 10, 6);
    this.sync(true);
    this.updateSwitches(dt);
    if (this.state === 'play') {
      this.updateTargets(dt);
      this.checkLost();
    }
  }

  private sync(impacts = false) {
    const g = this.gravity();
    for (const b of this.balls) {
      if (b.lost) continue;
      const p = b.body.getPosition(), lv = b.body.getLinearVelocity();
      /* an impact is a jump in velocity that gravity and drag do not explain */
      if (impacts) {
        const k = KINDS[b.colour];
        const ex = b.vx + g[0] * k.gravityScale * STEP, ey = b.vy + g[1] * k.gravityScale * STEP;
        const power = Math.hypot(lv.x - ex, lv.y - ey);
        if (power > 1.6 && this.time - b.lastHit > 0.08) {
          b.lastHit = this.time;
          this.events.push({ t: 'impact', x: p.x * S, y: p.y * S, power, colour: b.colour });
        }
      }
      b.vx = lv.x;
      b.vy = lv.y;
      b.x = p.x * S;
      b.y = p.y * S;
      b.angle = b.body.getAngle();
      b.speed = Math.hypot(lv.x, lv.y) * S;
      let touching = 0;
      for (let ce = b.body.getContactList(); ce; ce = ce.next!) if (ce.contact.isTouching()) touching++;
      b.touching = touching;
    }
  }

  private updateSwitches(dt: number) {
    for (const s of this.switches) s.load = 0;
    for (const b of this.balls) {
      for (let ce = b.body.getContactList(); ce; ce = ce.next!) {
        if (!ce.contact.isTouching()) continue;
        const fa: Fixture = ce.contact.getFixtureA(), fb: Fixture = ce.contact.getFixtureB();
        const tag = ((fa.getBody() === b.body ? fb : fa).getUserData()) as Tag;
        if (tag?.kind === 'switch') tag.sw.load = Math.max(tag.sw.load, b.weight);
      }
    }
    for (const s of this.switches) {
      const heavy = s.load >= (s.def.minMass ?? 0.5);
      const was = s.active;
      if (s.def.latch) {
        if (heavy) s.latched = true;
        s.active = s.latched;
      } else {
        s.active = heavy;
      }
      const m = s.def.a, n = s.def.b, cx = (m[0] + n[0]) / 2, cy = (m[1] + n[1]) / 2;
      if (s.active && !was) this.events.push({ t: 'press', id: s.def.id, x: cx, y: cy });
      if (!s.active && was) this.events.push({ t: 'release', id: s.def.id, x: cx, y: cy });
      s.press += ((s.load > 0 || s.active ? 1 : 0) - s.press) * Math.min(1, dt * 18);
    }
  }

  private updateGates(dt: number) {
    const active = new Set(this.switches.filter(s => s.active).map(s => s.def.id));
    for (const g of this.gates) {
      const want = g.def.by.some(id => active.has(id));
      if (want !== g.wantOpen) {
        g.wantOpen = want;
        const m = g.def.a, n = g.def.b;
        this.events.push({ t: 'gate', open: want, x: (m[0] + n[0]) / 2, y: (m[1] + n[1]) / 2 });
      }
      const goal = want ? 1 : 0;
      let next = g.open + Math.sign(goal - g.open) * GATE_SPEED * dt;
      if ((goal - g.open) * (goal - next) <= 0) next = goal;
      /* a closing gate waits rather than crush a ball in its way */
      if (next < g.open) {
        const o: Pt = [g.def.slide[0] * next, g.def.slide[1] * next];
        const a: Pt = [g.def.a[0] + o[0], g.def.a[1] + o[1]], b: Pt = [g.def.b[0] + o[0], g.def.b[1] + o[1]];
        if (this.balls.some(ball => !ball.lost && segDist([ball.x, ball.y], a, b) < BALL_R + g.r + 1)) next = g.open;
      }
      const vel = (next - g.open) / dt;
      g.body.setLinearVelocity(Vec2(g.def.slide[0] * vel / S, g.def.slide[1] * vel / S));
      g.open = next;
      /* kinematic bodies move by velocity during the step; keep them exact */
      if (vel === 0) g.body.setPosition(Vec2(g.def.slide[0] * g.open / S, g.def.slide[1] * g.open / S));
    }
  }

  private updateTargets(dt: number) {
    for (const t of this.targets) {
      let best: Ball | null = null;
      for (const b of this.balls) {
        if (b.lost || b.colour !== t.def.colour) continue;
        if (Math.hypot(b.x - t.rest[0], b.y - t.rest[1]) < BALL_R * 0.6) best = b;
      }
      const still = best && best.speed < SETTLE_SPEED;
      if (still) t.settle += dt; else t.settle = 0;
      const home = t.settle >= SETTLE_TIME ? best : null;
      if (home && !t.ball) {
        t.ball = home;
        home.home = t;
        this.events.push({ t: 'home', colour: home.colour, x: t.rest[0], y: t.rest[1] });
      } else if (!home && t.ball && !best) {
        const b = t.ball;
        b.home = null;
        t.ball = null;
        this.events.push({ t: 'away', colour: b.colour, x: t.rest[0], y: t.rest[1] });
      }
    }
    if (this.targets.length && this.targets.every(t => t.ball)) {
      this.state = 'won';
      this.since = 0;
      /* lock every ball into its cup */
      for (const t of this.targets) {
        const b = t.ball!;
        b.body.setLinearVelocity(Vec2(0, 0));
        b.body.setAngularVelocity(0);
        b.body.setStatic();
        b.body.setPosition(v(t.rest));
      }
      this.sync();
      this.events.push({ t: 'won' });
    }
  }

  private checkLost() {
    for (const b of this.balls) {
      if (b.lost) continue;
      const out = b.x < -BALL_R || b.x > CHAMBER + BALL_R || b.y < -BALL_R || b.y > CHAMBER + BALL_R;
      const pit = (this.level.hazards || []).some(h =>
        b.x > h.x - BALL_R * 0.7 && b.x < h.x + h.w + BALL_R * 0.7 && b.y > h.y - BALL_R * 0.7 && b.y < h.y + h.h + BALL_R);
      if (out || pit) {
        b.lost = true;
        this.world.destroyBody(b.body);
        this.events.push({ t: 'lost', colour: b.colour, x: b.x, y: b.y });
        this.state = 'lost';
        this.since = 0;
      }
    }
  }

  /** The level's solution, as an input for any moment. */
  static inputAt(sol: [number, number][], t: number): number {
    let val = 0;
    for (const [at, x] of sol) if (t >= at) val = x;
    return val;
  }
}
