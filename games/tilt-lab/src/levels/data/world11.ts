/* TILT LAB - World 11: MACHINES. Rooms that feed rooms: plates start
 * fans and lifts, and the balls have to set the machines going in the
 * right order.
 *   1 LIFT OFF     red home on its plate starts the fan that lifts blue
 *   2 PLATE LIFT   one ball holds the plate, the other rides the lift
 *   3 BLOWBACK     a fan keeps blue from dropping straight down
 *   4 UPDRAUGHT    hold the plate below to run the fan above
 *   5 HEADWIND     a high plate starts the fan over yellow's cup
 *   6 FEEDBACK     the fan's own plate sits in its updraft
 *
 * Conventions as World 1. Labs 2-6 came out of the design search and pass
 * the tier-2 bar; in each, the solution fails without its machine. */
import type { LevelDef } from '../../entities/types.ts';

export const LIFTOFF: LevelDef = {
  id: 'w11-liftoff',
  par: 8.5,
  name: 'LIFT OFF',
  hint: 'Red home on its plate starts the fan. Blue rides it up and over the wall',
  balls: [{ colour: 'red', x: 680, y: 818 }, { colour: 'blue', x: 200, y: 818 }],
  targets: [{ colour: 'red', x: 890, y: 895 }, { colour: 'blue', x: 890, y: 415 }],
  rails: [
    { pts: [[40, 880], [756, 880]] },
    { pts: [[580, 440], [580, 862]] },
    { pts: [[620, 400], [756, 400]] }
  ],
  switches: [{ id: 'p', a: [860, 958], b: [920, 958] }],
  fans: [{ x: 420, y: 280, w: 160, h: 580, dir: [0, -1], strength: 16, by: ['p'] }],
  solution: [[0, 1], [8, 0]],
  traps: [[[0, -1]]]
};

export const PLATELIFT: LevelDef = {
  id: 'w11-platelift',
  par: 16.5,
  name: 'PLATE LIFT',
  hint: 'The lift rises a floor while the plate is held. Who holds it, and who rides?',
  balls: [{ colour: 'blue', x: 220, y: 168 }, { colour: 'yellow', x: 346, y: 168 }],
  targets: [{ colour: 'blue', x: 110, y: 895 }, { colour: 'yellow', x: 500, y: 895 }],
  rails: [
    { pts: [[40, 230], [440, 230]] },
    { pts: [[40, 400], [520, 400]] },
    { pts: [[40, 570], [440, 570]] },
    { pts: [[40, 740], [620, 740]], only: ['blue'] },
    { pts: [[780, 740], [960, 740]] },
    { pts: [[244, 880], [366, 880]] }
  ],
  switches: [
    { id: 'm', a: [70, 548], b: [130, 548] }
  ],
  gates: [
    { a: [644, 862], b: [756, 862], slide: [0, -122], by: ['m'], speed: 0.6 }
  ],
  solution: [[0, 1], [1.31, -1], [2.76, 0], [5.29, 1], [8.27, -1], [9.9, 0], [10.34, -1]],
  traps: [[[0, 1]], [[0, -1]]]
};

export const BLOWBACK: LevelDef = {
  id: 'w11-blowback',
  par: 17.5,
  name: 'BLOWBACK',
  hint: 'The fan keeps light blue from dropping straight down. Find the way round it',
  balls: [{ colour: 'blue', x: 358, y: 168 }, { colour: 'yellow', x: 191, y: 168 }],
  targets: [{ colour: 'blue', x: 500, y: 895 }, { colour: 'yellow', x: 110, y: 895 }],
  rails: [
    { pts: [[40, 230], [520, 230]] },
    { pts: [[400, 400], [960, 400]] },
    { pts: [[40, 570], [440, 570]], only: ['blue'] },
    { pts: [[480, 740], [960, 740]], only: ['blue'] },
    { pts: [[244, 880], [366, 880]] },
    { pts: [[634, 880], [960, 880]] }
  ],
  fans: [
    { x: 50, y: 540, w: 420, h: 330, dir: [0, -1], strength: 28 }
  ],
  solution: [[0, 1], [1.92, -1], [3.84, 0], [4.54, -1], [7.43, 1], [9.64, -1], [10.11, -1], [10.95, -1], [13.87, -1]],
  traps: [[[0, 1]], [[0, -1]]]
};

export const UPDRAUGHT: LevelDef = {
  id: 'w11-updraught',
  par: 15,
  name: 'UPDRAUGHT',
  hint: 'The plate below starts the fan above. Someone has to hold it while someone flies',
  balls: [{ colour: 'yellow', x: 200, y: 168 }, { colour: 'red', x: 361, y: 168 }],
  targets: [{ colour: 'yellow', x: 500, y: 895 }, { colour: 'red', x: 890, y: 895 }],
  rails: [
    { pts: [[40, 230], [440, 230]] },
    { pts: [[320, 400], [960, 400]], only: ['red'] },
    { pts: [[400, 570], [960, 570]] },
    { pts: [[40, 740], [680, 740]] },
    { pts: [[40, 880], [366, 880]] },
    { pts: [[634, 880], [756, 880]] }
  ],
  switches: [
    { id: 'm', a: [70, 718], b: [130, 718] }
  ],
  fans: [
    { x: 50, y: 200, w: 260, h: 330, dir: [0, -1], strength: 28, by: ['m'] }
  ],
  solution: [[0, 1], [2.43, -1], [4.6, 1], [6.06, 0], [7.12, 1], [8.97, -1], [11.82, 0]],
  traps: [[[0, 1]], [[0, -1]]]
};

export const HEADWIND: LevelDef = {
  id: 'w11-headwind',
  par: 19.5,
  name: 'HEADWIND',
  hint: 'The high plate starts the fan over yellow cup. Use it, then get off it',
  balls: [{ colour: 'yellow', x: 205, y: 168 }, { colour: 'red', x: 353, y: 168 }],
  targets: [{ colour: 'yellow', x: 110, y: 895 }, { colour: 'red', x: 500, y: 895 }],
  rails: [
    { pts: [[40, 230], [440, 230]] },
    { pts: [[320, 400], [960, 400]] },
    { pts: [[40, 570], [420, 570]], only: ['yellow'] },
    { pts: [[580, 570], [960, 570]] },
    { pts: [[320, 740], [960, 740]] },
    { pts: [[244, 880], [366, 880]] },
    { pts: [[634, 880], [960, 880]] }
  ],
  switches: [
    { id: 'm', a: [870, 378], b: [930, 378] }
  ],
  fans: [
    { x: 50, y: 540, w: 260, h: 330, dir: [0, -1], strength: 34, by: ['m'] }
  ],
  solution: [[0, 1], [1.58, -1], [4.65, 0], [7.38, 1], [8.83, -1], [10.21, 1], [12.29, 1], [14.05, -1], [15.26, 0]],
  traps: [[[0, 1]], [[0, -1]]]
};

export const FEEDBACK: LevelDef = {
  id: 'w11-feedback',
  par: 19,
  name: 'FEEDBACK',
  hint: 'The plate that runs the fan sits in its own updraft. Who can hold it down?',
  balls: [{ colour: 'blue', x: 142, y: 168 }, { colour: 'red', x: 485, y: 168 }],
  targets: [{ colour: 'blue', x: 500, y: 895 }, { colour: 'red', x: 890, y: 895 }],
  rails: [
    { pts: [[40, 230], [600, 230]] },
    { pts: [[560, 400], [960, 400]] },
    { pts: [[560, 570], [960, 570]] },
    { pts: [[40, 740], [440, 740]] },
    { pts: [[634, 880], [756, 880]] }
  ],
  switches: [
    { id: 'm', a: [870, 548], b: [930, 548] }
  ],
  fans: [
    { x: 450, y: 540, w: 500, h: 330, dir: [0, -1], strength: 22, by: ['m'] }
  ],
  solution: [[0, 1], [2.45, 0], [3.39, 1], [4.49, 0], [7.41, -1], [10, 1], [12.32, 0]],
  traps: [[[0, 1]], [[0, -1]]]
};

export const WORLD11: LevelDef[] = [LIFTOFF, PLATELIFT, BLOWBACK, UPDRAUGHT, HEADWIND, FEEDBACK];
