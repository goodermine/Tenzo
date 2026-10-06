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
 */
export interface RailDef { pts: Pt[]; r?: number; smooth?: boolean }

/**
 * A switch set into a surface: a pad from `a` to `b` (its top face).
 * A plate is pressed only while weighed down; a button latches.
 * `minMass` 3 means only a heavy (red) ball is enough.
 */
export interface SwitchDef { id: string; a: Pt; b: Pt; latch?: boolean; minMass?: number }

/**
 * A gate: a bar from `a` to `b` when closed. It slides by `slide` (a
 * vector) to open. It opens while any of `by` (switch ids) is active.
 */
export interface GateDef { a: Pt; b: Pt; r?: number; slide: Pt; by: string[] }

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
