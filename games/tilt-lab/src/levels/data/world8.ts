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

export const ONEATATIME: LevelDef = {
  id: 'w8-oneatatime',
  par: 18,
  name: 'ONE AT A TIME',
  hint: 'The bridge comes in while exactly ONE plate is pressed - not both',
  balls: [{ colour: 'orange', x: 283, y: 168 }, { colour: 'blue', x: 151, y: 168 }],
  targets: [{ colour: 'orange', x: 890, y: 895 }, { colour: 'blue', x: 500, y: 895 }],
  rails: [
    { pts: [[40, 230], [420, 230]] },
    { pts: [[580, 230], [960, 230]] },
    { pts: [[40, 400], [520, 400]] },
    { pts: [[40, 570], [520, 570]] },
    { pts: [[40, 740], [620, 740]] },
    { pts: [[780, 740], [960, 740]] },
    { pts: [[40, 880], [366, 880]] },
    { pts: [[634, 880], [756, 880]] }
  ],
  switches: [
    { id: 'w0', a: [70, 378], b: [130, 378] },
    { id: 'w1', a: [70, 548], b: [130, 548] }
  ],
  gates: [
    { a: [642, 740], b: [758, 740], slide: [0, -150], by: ['w0', 'w1'], logic: 'xor', invert: true, platform: true }
  ],
  solution: [[0, 1], [1.75, 0.5], [3.97, 0], [6.77, -0.5], [9.25, -1], [10.71, 0.5], [12.91, 1], [13.61, 0.5], [14.9, 0]],
  traps: [[[0, 1]], [[0, -1]]]
};

export const BOTHPLATES: LevelDef = {
  id: 'w8-bothplates',
  par: 16.5,
  name: 'BOTH PLATES',
  hint: 'The trapdoor needs ALL its plates. Park orange high, then send red',
  balls: [{ colour: 'orange', x: 354, y: 168 }, { colour: 'red', x: 143, y: 168 }],
  targets: [{ colour: 'orange', x: 500, y: 895 }, { colour: 'red', x: 110, y: 895 }],
  rails: [
    { pts: [[40, 230], [600, 230]] },
    { pts: [[480, 400], [960, 400]] },
    { pts: [[320, 570], [960, 570]] },
    { pts: [[40, 740], [140, 740]] },
    { pts: [[320, 740], [420, 740]] },
    { pts: [[580, 740], [960, 740]] },
    { pts: [[244, 880], [366, 880]] },
    { pts: [[634, 880], [960, 880]] }
  ],
  switches: [
    { id: 'w0', a: [870, 548], b: [930, 548] },
    { id: 'w1', a: [870, 378], b: [930, 378] }
  ],
  gates: [
    { a: [160, 740], b: [300, 740], slide: [0, 140], by: ['w0', 'w1'], logic: 'all' }
  ],
  solution: [[0, 0], [0.73, 1], [3.06, -1], [3.7, -1], [6.68, -0.5], [7.19, 1], [9.99, 0], [10.99, -1]],
  traps: [[[0, 1]], [[0, -1]]]
};

export const WORLD8: LevelDef[] = [ANCHOR, HALFTILT, ALLORNOTHING, ONEATATIME, BOTHPLATES];
