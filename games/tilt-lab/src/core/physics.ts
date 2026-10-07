/* TILT LAB - the lab: one level's physics, stepped at a fixed rate.
 *
 * The level's geometry never moves. Tilting rotates gravity in the
 * chamber's frame instead, and the renderer turns the chamber on screen by
 * the same angle - so gravity always looks straight down. Nothing static
 * sweeps through a ball, and the same inputs always give the same result,
 * which is what lets tools/solve.ts prove every level can be beaten.
 *
 * No DOM here: this runs in Node as well as the browser. */
import { World, Vec2, Circle, Chain, Box, RevoluteJoint } from 'planck';
import type { Body, Fixture, Contact } from 'planck';
import type {
  LevelDef, Colour, Pt, GateDef, SwitchDef, TargetDef, SeesawDef, FanDef, SpringDef, MagnetDef, Logic
} from '../entities/types.ts';
import { KINDS, BALL_R } from '../entities/types.ts';
import {
  CHAMBER, chamberLoop, railOutline, railPath, cupOutline, cupRest, strokeOutline, segDist, nearestOnPath, gatePath, RAIL_R
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
const MAGNET_REACH = 46;      /* how far from a magnetic rail's surface it grabs */
const MAGNET_PULL = 1.7;      /* ...and how hard, in g: enough to hang upside down */
const SPRING_COOLDOWN = 0.25;
const CRUMBLE_DELAY = 0.35;  /* s from a crumbling floor going empty to giving way */

export type LabEvent =
  | { t: 'impact'; x: number; y: number; power: number; colour: Colour }
  | { t: 'press' | 'release'; id: string; x: number; y: number }
  | { t: 'gate'; open: boolean; x: number; y: number }
  | { t: 'home' | 'away'; colour: Colour; x: number; y: number }
  | { t: 'lost'; colour: Colour; x: number; y: number }
  | { t: 'spring'; x: number; y: number }
  | { t: 'crumble'; rail: number; x: number; y: number }
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
  sprung: number;   /* time of its last spring launch */
}

export interface Target { def: TargetDef; rest: Pt; ball: Ball | null; settle: number; outline: Pt[] }

export interface Switch {
  def: SwitchDef; body: Body; active: boolean; latched: boolean;
  wasLoaded: boolean; timer: number;
  load: number;   /* weight on it this step */
  press: number;  /* 0..1, eased, for drawing */
  outline: Pt[];
}

export interface Gate {
  def: GateDef; body: Body; open: number; /* 0 closed .. 1 open */
  wantOpen: boolean; r: number; outline: Pt[];
}

export interface Seesaw { def: SeesawDef; body: Body; angle: number; x: number; y: number }
export interface Fan { def: FanDef; on: boolean }
export interface Spring { def: SpringDef; outline: Pt[]; normal: Pt; squash: number; used: boolean }
export interface Magnet { def: MagnetDef; on: boolean }
export interface OneWay { dir: Pt; path: Pt[] }
/** A crumbling floor: `used` once a ball has been on it; `emptyAt` when it
    was last left empty after that; `gone` when it gave way (-1: not yet). */
export interface Crumble { rail: number; body: Body; used: boolean; emptyAt: number; gone: number }

/** Whether something switched by `by` is on, given the switches now on. */
export function driven(by: string[] | undefined, logic: Logic | undefined, active: Set<string>): boolean {
  if (!by) return true;
  const n = by.filter(id => active.has(id)).length;
  return logic === 'all' ? n === by.length : logic === 'xor' ? n === 1 : n > 0;
}

type Tag =
  | { kind: 'ball'; ball: Ball }
  | { kind: 'switch'; sw: Switch }
  | { kind: 'spring'; sp: Spring }
  | { kind: 'oneway'; ow: OneWay }
  | { kind: 'grate'; only: Colour[] }
  | { kind: 'cup' }
  | { kind: 'solid' };

const v = (p: Pt) => Vec2(p[0] / S, p[1] / S);

export class Lab {
  readonly level: LevelDef;
  readonly world: World;
  readonly balls: Ball[] = [];
  readonly targets: Target[] = [];
  readonly switches: Switch[] = [];
  readonly gates: Gate[] = [];
  readonly rails: Pt[][] = [];
  readonly seesaws: Seesaw[] = [];
  readonly fans: Fan[] = [];
  readonly springs: Spring[] = [];
  readonly magnets: Magnet[] = [];
  readonly crumbles: Crumble[] = [];
  readonly events: LabEvent[] = [];
  /** centre lines of magnetic rails, for the pull */
  private magRails: { path: Pt[]; r: number }[] = [];
  /** ball/one-way contacts that began on the pass-through side */
  private passing = new Set<Contact>();

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
    level.rails.forEach((r, i) => {
      const o = railOutline(r);
      this.rails.push(o);
      const tag: Tag = r.oneWay ? { kind: 'oneway', ow: { dir: r.oneWay, path: railPath(r) } }
        : r.only ? { kind: 'grate', only: r.only } : solid;
      /* a crumbling floor is its own body, so it can give way */
      let body = ground;
      if (r.crumble) {
        body = this.world.createBody();
        this.crumbles.push({ rail: i, body, used: false, emptyAt: -1, gone: -1 });
      }
      body.createFixture(Chain(o.map(v), true), r.bouncy
        ? { friction: 0.35, restitution: 0.92, userData: tag }
        : { friction: 0.7, restitution: 0.12, userData: tag });
      if (r.magnetic) this.magRails.push({ path: railPath(r), r: r.r ?? RAIL_R });
    });

    /* cups are padded: they catch even a bouncing green ball */
    const cup: Tag = { kind: 'cup' };
    for (const t of level.targets) {
      const outline = cupOutline(t);
      ground.createFixture(Chain(outline.map(v), true), { friction: 0.8, restitution: 0.05, userData: cup });
      this.targets.push({ def: t, rest: cupRest(t), ball: null, settle: 0, outline });
    }

    for (const d of level.switches || []) {
      const body = this.world.createBody();
      const outline = strokeOutline([d.a, d.b], 11);
      const sw: Switch = { def: d, body, active: false, latched: false, wasLoaded: false, timer: d.toggle ? 1 : 0, load: 0, press: 0, outline };
      body.createFixture(Chain(outline.map(v), true), { friction: 0.8, restitution: 0.05, userData: { kind: 'switch', sw } as Tag });
      this.switches.push(sw);
    }

    for (const d of level.gates || []) {
      const r = d.r ?? RAIL_R;
      const body = this.world.createKinematicBody({ position: Vec2(0, 0) });
      /* the bar (or tray) as a closed outline, like a rail */
      const outline = strokeOutline(gatePath(d), r);
      body.createFixture(Chain(outline.map(v), true), { friction: 0.9, userData: solid });
      /* an inverted gate starts open; a platform starts at its phase */
      const open0 = d.period ? 0.5 - 0.5 * Math.cos(Math.PI * 2 * (d.phase || 0)) : d.invert ? 1 : 0;
      body.setPosition(Vec2(d.slide[0] * open0 / S, d.slide[1] * open0 / S));
      this.gates.push({ def: d, body, open: open0, wantOpen: !!d.invert, r, outline });
    }

    for (const d of level.seesaws || []) {
      const body = this.world.createDynamicBody({ position: v(d.pivot), angularDamping: 1.2, angle: (d.angle || 0) * Math.PI / 180 });
      body.createFixture(Box(d.half / S, 14 / S, Vec2((d.offset || 0) / S, 0), 0),
        { density: d.density ?? 0.4, friction: 0.8, restitution: 0.05, userData: solid });
      for (const px of d.posts || []) {
        body.createFixture(Box(9 / S, 24 / S, Vec2(px / S, -34 / S), 0), { density: 0.1, friction: 0.6, userData: solid });
      }
      const lim = d.limit ?? 22, [lo, hi] = d.range ?? [-lim, lim];
      /* limits are measured from level (a plank may start tipped) */
      this.world.createJoint(RevoluteJoint({
        enableLimit: true, lowerAngle: lo * Math.PI / 180, upperAngle: hi * Math.PI / 180, referenceAngle: 0
      } as any, ground, body, v(d.pivot)));
      this.seesaws.push({ def: d, body, angle: body.getAngle(), x: d.pivot[0], y: d.pivot[1] });
    }

    for (const d of level.fans || []) this.fans.push({ def: d, on: !d.by });
    for (const d of level.magnets || []) {
      this.magnets.push({ def: d, on: !d.by !== !!d.invert });
      /* the magnet's core is solid: a pulled ball comes to rest against it */
      ground.createFixture(Circle(v([d.x, d.y]), 30 / S), { friction: 0.9, restitution: 0, userData: solid });
    }

    for (const d of level.springs || []) {
      const outline = strokeOutline([d.a, d.b], 12);
      const dx = d.b[0] - d.a[0], dy = d.b[1] - d.a[1], l = Math.hypot(dx, dy) || 1;
      const sp: Spring = { def: d, outline, normal: [dy / l, -dx / l], squash: 0, used: false };
      ground.createFixture(Chain(outline.map(v), true), { friction: 0.6, restitution: 0, userData: { kind: 'spring', sp } as Tag });
      this.springs.push(sp);
    }

    /* one-way rails: a contact that starts on the pass-through side is
       switched off until the ball has gone through */
    this.world.on('begin-contact', (c: Contact) => {
      const hit = this.oneWayHit(c);
      if (!hit) return;
      const { ball, ow } = hit;
      const { q } = nearestOnPath([ball.x, ball.y], ow.path);
      if ((ball.x - q[0]) * ow.dir[0] + (ball.y - q[1]) * ow.dir[1] < 0) this.passing.add(c);
    });
    this.world.on('end-contact', (c: Contact) => { this.passing.delete(c); });
    this.world.on('pre-solve', (c: Contact) => {
      if (this.passing.has(c)) c.setEnabled(false);
      /* a colour grate lets its own colours straight through */
      const ta = c.getFixtureA().getUserData() as Tag, tb = c.getFixtureB().getUserData() as Tag;
      if (ta?.kind === 'grate' && tb?.kind === 'ball' && ta.only.includes(tb.ball.colour)) c.setEnabled(false);
      if (tb?.kind === 'grate' && ta?.kind === 'ball' && tb.only.includes(ta.ball.colour)) c.setEnabled(false);
      if ((c.getFixtureA().getUserData() as Tag)?.kind === 'cup' || (c.getFixtureB().getUserData() as Tag)?.kind === 'cup') c.setRestitution(0);
    });

    for (const d of level.balls) {
      const k = KINDS[d.colour];
      const body = this.world.createDynamicBody({
        position: v([d.x, d.y]), bullet: true, gravityScale: k.gravityScale,
        linearDamping: k.linearDamping, angularDamping: k.angularDamping
      });
      const ball: Ball = {
        colour: d.colour, body, weight: k.density, home: null,
        x: d.x, y: d.y, vx: 0, vy: 0, angle: 0, speed: 0, touching: 0, lastHit: -1, lost: false, sprung: -1
      };
      body.createFixture(Circle(BALL_R / S), {
        density: k.density, friction: k.friction, restitution: k.restitution, userData: { kind: 'ball', ball } as Tag
      });
      this.balls.push(ball);
    }

    this.sync();
  }

  private oneWayHit(c: Contact): { ball: Ball; ow: OneWay } | null {
    const a = c.getFixtureA().getUserData() as Tag, b = c.getFixtureB().getUserData() as Tag;
    if (a?.kind === 'ball' && b?.kind === 'oneway') return { ball: a.ball, ow: b.ow };
    if (b?.kind === 'ball' && a?.kind === 'oneway') return { ball: b.ball, ow: a.ow };
    return null;
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
    this.applyFields();
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
    this.updateSprings(dt);
    this.updateCrumbles();
    this.sync(true);
    for (const s of this.seesaws) {
      const p = s.body.getPosition();
      s.angle = s.body.getAngle();
      s.x = p.x * S;
      s.y = p.y * S;
    }
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

  /** Fans, magnets and magnetic rails: forces in the chamber's frame. */
  private applyFields() {
    const active = new Set(this.switches.filter(s => s.active).map(s => s.def.id));
    for (const f of this.fans) f.on = driven(f.def.by, f.def.logic, active);
    for (const m of this.magnets) m.on = driven(m.def.by, m.def.logic, active) !== !!m.def.invert;
    for (const b of this.balls) {
      if (b.lost || b.body.isStatic()) continue;
      const area = Math.PI * (BALL_R / S) * (BALL_R / S);
      const m = b.body.getMass(), c = b.body.getWorldCenter();
      let fx = 0, fy = 0;
      /* a fan pushes every ball with the same force, so the lighter the
         ball, the further it goes */
      for (const f of this.fans) {
        const d = f.def;
        if (!f.on || b.x < d.x || b.x > d.x + d.w || b.y < d.y || b.y > d.y + d.h) continue;
        fx += d.dir[0] * d.strength * area;
        fy += d.dir[1] * d.strength * area;
      }
      if (b.colour === 'purple') {
        for (const mg of this.magnets) {
          if (!mg.on) continue;
          const dx = mg.def.x - b.x, dy = mg.def.y - b.y, dist = Math.hypot(dx, dy);
          if (dist > mg.def.r || dist < 1) continue;
          /* an attracting magnet grabs: a ball against its core stops
             swinging round it, so it hangs still and drops cleanly */
          if (!mg.def.repel && dist < 30 + BALL_R + 4) {
            const lv = b.body.getLinearVelocity();
            b.body.setLinearVelocity(Vec2(lv.x * 0.8, lv.y * 0.8));
            b.body.setAngularVelocity(b.body.getAngularVelocity() * 0.8);
          }
          /* full strength over the inner half of its reach, fading to
             nothing at the edge - so a repelled ball floats at the height
             where the push matches its weight */
          const k = mg.def.strength * Math.min(1, 2 * (1 - dist / mg.def.r)) * (mg.def.repel ? -1 : 1);
          fx += dx / dist * k * m;
          fy += dy / dist * k * m;
        }
        for (const r of this.magRails) {
          const { q, d } = nearestOnPath([b.x, b.y], r.path);
          /* past either end of the rail there is no pull, so a ball rolls
             cleanly off the end instead of wrapping round it */
          const end0 = r.path[0], end1 = r.path[r.path.length - 1];
          if ((q[0] === end0[0] && q[1] === end0[1]) || (q[0] === end1[0] && q[1] === end1[1])) continue;
          const gap = d - r.r - BALL_R;
          if (gap > MAGNET_REACH || d < 1) continue;
          const k = MAGNET_PULL * GRAVITY * (gap < 0 ? 1 : 1 - 0.5 * gap / MAGNET_REACH);
          fx += (q[0] - b.x) / d * k * m;
          fy += (q[1] - b.y) / d * k * m;
        }
      }
      if (fx || fy) b.body.applyForce(Vec2(fx, fy), c, true);
    }
  }

  /** A ball touching a spring pad is launched straight off its face. */
  private updateSprings(dt: number) {
    for (const sp of this.springs) sp.squash = Math.max(0, sp.squash - dt * 4);
    for (const b of this.balls) {
      if (b.lost || this.time - b.sprung < SPRING_COOLDOWN) continue;
      for (let ce = b.body.getContactList(); ce; ce = ce.next!) {
        if (!ce.contact.isTouching()) continue;
        const fa = ce.contact.getFixtureA(), fb = ce.contact.getFixtureB();
        const tag = ((fa.getBody() === b.body ? fb : fa).getUserData()) as Tag;
        if (tag?.kind !== 'spring') continue;
        const sp = tag.sp, n = sp.normal, lv = b.body.getLinearVelocity();
        if (sp.def.once && sp.used) continue;
        sp.used = true;
        /* keep the slide along the pad; replace the bounce with the launch */
        const along = lv.x * -n[1] + lv.y * n[0];
        const p = sp.def.power / S;
        b.body.setLinearVelocity(Vec2(n[0] * p - n[1] * along, n[1] * p + n[0] * along));
        b.sprung = this.time;
        sp.squash = 1;
        this.events.push({ t: 'spring', x: b.x, y: b.y });
        break;
      }
    }
  }

  /** A crumbling floor gives way a moment after it is first left empty. */
  private updateCrumbles() {
    for (const cr of this.crumbles) {
      if (cr.gone >= 0) continue;
      let loaded = false;
      for (let ce = cr.body.getContactList(); ce && !loaded; ce = ce.next!) {
        if (ce.contact.isTouching() && (ce.other!.getFixtureList()?.getUserData() as Tag)?.kind === 'ball') loaded = true;
      }
      /* a ball landing back on it (a bounce) starts the count again */
      if (loaded) { cr.used = true; cr.emptyAt = -1; }
      else if (cr.used && cr.emptyAt < 0) cr.emptyAt = this.time;
      if (cr.emptyAt >= 0 && this.time - cr.emptyAt >= CRUMBLE_DELAY) {
        cr.gone = this.time;
        this.world.destroyBody(cr.body);
        const pts = this.level.rails[cr.rail].pts, m = pts[Math.floor(pts.length / 2)], a = pts[0];
        this.events.push({ t: 'crumble', rail: cr.rail, x: (a[0] + m[0]) / 2, y: (a[1] + m[1]) / 2 });
      }
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
      } else if (s.def.toggle) {
        /* a new press only counts after the pad has been clear a moment,
           so a ball bumping across it is one press, not several */
        if (heavy && !s.wasLoaded && s.timer > 0.3) s.latched = !s.latched;
        s.timer = heavy ? 0 : s.timer + dt;
        s.active = s.latched;
      } else if (s.def.hold) {
        if (heavy) s.timer = s.def.hold;
        else s.timer = Math.max(0, s.timer - dt);
        s.active = heavy || s.timer > 0;
      } else {
        s.active = heavy;
      }
      s.wasLoaded = heavy;
      const m = s.def.a, n = s.def.b, cx = (m[0] + n[0]) / 2, cy = (m[1] + n[1]) / 2;
      if (s.active && !was) this.events.push({ t: 'press', id: s.def.id, x: cx, y: cy });
      if (!s.active && was) this.events.push({ t: 'release', id: s.def.id, x: cx, y: cy });
      s.press += ((s.load > 0 || s.active ? 1 : 0) - s.press) * Math.min(1, dt * 18);
    }
  }

  private updateGates(dt: number) {
    const active = new Set(this.switches.filter(s => s.active).map(s => s.def.id));
    for (const g of this.gates) {
      if (g.def.period) {
        /* a moving platform: shuttles on its own, smoothly */
        const next = 0.5 - 0.5 * Math.cos(Math.PI * 2 * ((this.time + dt) / g.def.period + (g.def.phase || 0)));
        const vel = (next - g.open) / dt;
        g.body.setLinearVelocity(Vec2(g.def.slide[0] * vel / S, g.def.slide[1] * vel / S));
        g.open = next;
        continue;
      }
      const want = (!!g.def.by && driven(g.def.by, g.def.logic, active)) !== !!g.def.invert;
      if (want !== g.wantOpen) {
        g.wantOpen = want;
        const m = g.def.a, n = g.def.b;
        this.events.push({ t: 'gate', open: want, x: (m[0] + n[0]) / 2, y: (m[1] + n[1]) / 2 });
      }
      const goal = want ? 1 : 0;
      let next = g.open + Math.sign(goal - g.open) * (g.def.speed ?? GATE_SPEED) * dt;
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
