/* TILT LAB - World 8: ANCHOR. Orange is so heavy it barely rolls: half a
 * tilt will not move it, and wherever it stops, it holds a plate down.
 * Gates now read their plates with logic: ALL needs every plate pressed at
 * once, ONE exactly one.
 *   1 ANCHOR       orange home on its plate brings the bridge for yellow
 *
 * Conventions as World 1. A plate inside a cup is pressed by the ball at
 * home there. */
import type { LevelDef } from '../../entities/types.ts';

export const ANCHOR: LevelDef = {
  id: 'w8-anchor',
  par: 11,
  name: 'ANCHOR',
  hint: 'Orange is slow. Let it reach home first: its plate brings the bridge',
  balls: [{ colour: 'orange', x: 300, y: 818 }, { colour: 'yellow', x: 800, y: 338 }],
  targets: [{ colour: 'orange', x: 890, y: 895 }, { colour: 'yellow', x: 110, y: 415 }],
  rails: [
    { pts: [[40, 880], [756, 880]] },
    { pts: [[560, 400], [960, 400]] },
    { pts: [[244, 400], [300, 400]] }
  ],
  switches: [{ id: 'p', a: [860, 958], b: [920, 958] }],
  gates: [{ a: [322, 400], b: [538, 400], slide: [0, -180], by: ['p'], invert: true, platform: true }],
  solution: [[0, 1], [4.5, -1], [8, 0]],
  traps: [[[0, -1]]]
};

export const WORLD8: LevelDef[] = [ANCHOR];
