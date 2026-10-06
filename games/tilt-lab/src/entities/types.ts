/* TILT LAB - level data and the ball types.
 *
 * Levels are plain data in chamber units: the chamber is a 1000x1000
 * square, x right, y down. Nothing in the game code knows about any
 * particular level. */

export type Colour = 'yellow' | 'red' | 'blue' | 'green' | 'purple' | 'orange';
export type Pt = [number, number];

export interface BallDef { colour: Colour; x: number; y: number }

/** A cup that holds one ball. The opening faces up (chamber frame). */
export interface TargetDef { colour: Colour; x: number; y: number }

/**
 * A solid rail: a thick line through `pts`, `r` units either side, with
 * round ends. `smooth` rounds the polyline into a curve through its points.
 *  - `bouncy`: springy jelly - everything rebounds off it.
 *  - `magnetic`: purple balls near it are pulled onto it, even upside down.
 *  - `oneWay`: balls may pass through it travelling this way, and not back.
 */
export interface RailDef { pts: Pt[]; r?: number; smooth?: boolean; bouncy?: boolean; magnetic?: boolean; oneWay?: Pt }

/**
 * A switch set into a surface: a pad from `a` to `b` (its top face).
 *  - a plate (the default) is on only while weighed down;
 *  - `latch`: a button - stays on once pressed;
 *  - `toggle`: each press flips it on or off;
 *  - `hold`: stays on this many seconds after the weight leaves (a timer).
 * `minMass` 3 means only a heavy (red) ball is enough.
 */
export interface SwitchDef {
  id: string; a: Pt; b: Pt; latch?: boolean; toggle?: boolean; hold?: number; minMass?: number;
}

/**
 * A bar from `a` to `b` that slides by `slide` (a vector).
 *  - A gate opens while any of `by` (switch ids) is on; `invert` closes it
 *    instead.
 *  - With `period` it shuttles back and forth on its own: a moving
 *    platform.
 *  - `platform` draws it as a solid rail rather than a striped gate;
 *    `tray` gives it raised ends, so a ball rides along instead of
 *    rolling off.
 */
export interface GateDef {
  a: Pt; b: Pt; r?: number; slide: Pt; by?: string[]; invert?: boolean;
  period?: number; phase?: number; speed?: number; platform?: boolean; tray?: boolean;
}

/** A plank on a pivot: tips under weight, within `limit` degrees.
    `offset` slides the plank along so one side is longer - and heavier -
    and rests down until enough weight lands on the short side; `density`
    sets how heavy the plank is (0.4 light, 1.5 needs a red to tip it). */
export interface SeesawDef {
  pivot: Pt; half: number; limit?: number; angle?: number; offset?: number; density?: number;
  /** an uneven swing, [lowest, highest] in degrees (overrides limit): a
      plank that stops short of level throws what it carries sideways */
  range?: [number, number];
  /** short posts standing on the plank, at these distances from the pivot,
      making seats that hold a ball as the plank tips */
  posts?: number[];
}

/** A fan: pushes every ball inside the box along `dir`. Light balls fly,
    heavy ones barely notice. `by` switches it (on while any is on). */
export interface FanDef { x: number; y: number; w: number; h: number; dir: Pt; strength: number; by?: string[] }

/** A spring pad from `a` to `b`: launches a ball that lands on it at
    `power` units/s, square off its face. */
/** A spring pad: launches a ball off its face at a fixed speed. A `once`
 *  spring throws one ball and then lies flat for good. */
export interface SpringDef { a: Pt; b: Pt; power: number; once?: boolean }

/** A magnet: pulls (or with `repel`, pushes) purple balls within `r`,
    with an acceleration of `strength` m/s^2 at its edge rising to twice
    that close in (gravity is 26). Its core is solid. `by` switches it on;
    `invert` switches it off instead. */
export interface MagnetDef { x: number; y: number; r: number; strength: number; repel?: boolean; by?: string[]; invert?: boolean }

/** A pit: any ball touching this rectangle is lost. */
export interface HazardDef { x: number; y: number; w: number; h: number }

/** A recorded solution: from time t (seconds), hold tilt input v (-1..1). */
export type Solution = [number, number][];

export interface LevelDef {
  id: string;
  name: string;
  hint?: string;
  balls: BallDef[];
  targets: TargetDef[];
  rails: RailDef[];
  switches?: SwitchDef[];
  gates?: GateDef[];
  hazards?: HazardDef[];
  seesaws?: SeesawDef[];
  fans?: FanDef[];
  springs?: SpringDef[];
  magnets?: MagnetDef[];
  /** proves the level can be solved; checked by tools/solve.ts */
  solution: Solution;
  /** the obvious wrong moves, which must not win - the puzzle's point */
  traps?: Solution[];
}

/* Colour is the physics language: each ball type plays differently.
   Tuned for play, not realism - in real physics a heavy ball and a light
   one roll down a slope at the same rate. */
export interface BallKind {
  colour: Colour;
  density: number;        /* mass per area: decides pushes and plates */
  gravityScale: number;   /* heavy balls are pulled harder */
  friction: number;
  restitution: number;
  linearDamping: number;
  angularDamping: number;
  rolling: number;        /* rolling resistance, m/s^2: how quickly it stops on the flat */
  fill: string;           /* body colour */
  light: string;          /* highlight side */
  dark: string;           /* shadow side and rim */
}

export const BALL_R = 44;

export const KINDS: Record<Colour, BallKind> = {
  yellow: { colour: 'yellow', density: 1, gravityScale: 1, friction: 0.7, restitution: 0.22,
    linearDamping: 0.08, angularDamping: 0.2, rolling: 2.4, fill: '#ffd21f', light: '#fff27a', dark: '#f08c00' },
  red: { colour: 'red', density: 3, gravityScale: 1.35, friction: 0.7, restitution: 0.08,
    linearDamping: 0.01, angularDamping: 0.2, rolling: 0.7, fill: '#ff2d55', light: '#ff8aa0', dark: '#b8002e' },
  /* the rest arrive with their worlds */
  blue: { colour: 'blue', density: 0.5, gravityScale: 0.6, friction: 0.5, restitution: 0.25,
    linearDamping: 0.6, angularDamping: 0.2, rolling: 1.6, fill: '#1fb6ff', light: '#8ae4ff', dark: '#0062d6' },
  green: { colour: 'green', density: 1, gravityScale: 1, friction: 0.5, restitution: 0.85,
    linearDamping: 0.05, angularDamping: 0.2, rolling: 1.2, fill: '#5dea2a', light: '#c4ff8a', dark: '#1f9d1a' },
  purple: { colour: 'purple', density: 1.2, gravityScale: 1, friction: 0.8, restitution: 0.1,
    linearDamping: 0.1, angularDamping: 0.2, rolling: 2.6, fill: '#a347ff', light: '#d6a8ff', dark: '#5d14c9' },
  orange: { colour: 'orange', density: 5, gravityScale: 1.2, friction: 1.2, restitution: 0.02,
    linearDamping: 0.2, angularDamping: 0.2, rolling: 5, fill: '#ff8a1f', light: '#ffc27a', dark: '#d14d00' }
};
