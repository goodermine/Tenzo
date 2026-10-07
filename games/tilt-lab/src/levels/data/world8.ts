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

export const HALFTILT: LevelDef = {
  id: 'w8-halftilt',
  par: 18.5,
  name: 'HALF TILT',
  hint: 'Half a tilt rolls yellow but leaves orange where it is. Either plate opens the trapdoor',
  balls: [{ colour: 'orange', x: 612, y: 168 }, { colour: 'yellow', x: 809, y: 168 }],
  targets: [{ colour: 'orange', x: 110, y: 895 }, { colour: 'yellow', x: 500, y: 895 }],
  rails: [
    { pts: [[480, 230], [960, 230]] },
    { pts: [[40, 400], [150, 400]] },
    { pts: [[330, 400], [440, 400]] },
    { pts: [[40, 570], [520, 570]] },
    { pts: [[480, 740], [960, 740]] },
    { pts: [[244, 880], [366, 880]] },
    { pts: [[634, 880], [960, 880]] }
  ],
  switches: [
    { id: 'w0', a: [870, 718], b: [930, 718] },
    { id: 'w1', a: [70, 548], b: [130, 548] }
  ],
  gates: [
    { a: [170, 400], b: [310, 400], slide: [0, 140], by: ['w0', 'w1'] }
  ],
  solution: [[0, -1], [2.42, 0], [4.82, 1], [7.28, -0.5], [9.72, -1], [12.19, 1], [15.57, 0], [17.46, 0]],
  traps: [[[0, 1]], [[0, -1]]]
};

export const ALLORNOTHING: LevelDef = {
  id: 'w8-allornothing',
  par: 17.5,
  name: 'ALL OR NOTHING',
  hint: 'The trapdoor needs both plates at once. Orange holds one wherever it stops',
  balls: [{ colour: 'orange', x: 252, y: 168 }, { colour: 'blue', x: 141, y: 168 }],
  targets: [{ colour: 'orange', x: 890, y: 895 }, { colour: 'blue', x: 110, y: 895 }],
  rails: [
    { pts: [[40, 230], [420, 230]] },
    { pts: [[580, 230], [960, 230]] },
    { pts: [[40, 400], [150, 400]] },
    { pts: [[330, 400], [440, 400]] },
    { pts: [[40, 570], [600, 570]] },
    { pts: [[40, 740], [620, 740]] },
    { pts: [[780, 740], [960, 740]] },
    { pts: [[244, 880], [756, 880]] }
  ],
  switches: [
    { id: 'w0', a: [70, 378], b: [130, 378] },
    { id: 'w1', a: [70, 548], b: [130, 548] }
  ],
  gates: [
    { a: [170, 400], b: [310, 400], slide: [0, 140], by: ['w0', 'w1'], logic: 'all' }
  ],
  solution: [[0, 0], [2.28, 1], [4.97, -0.5], [7.7, 1], [9.2, 0.5], [10.26, -1], [12.01, -0.5], [14.76, 0.5], [16.94, 0]],
  traps: [[[0, 1]], [[0, -1]]]
};

export const WORLD8: LevelDef[] = [ANCHOR, HALFTILT, ALLORNOTHING];
