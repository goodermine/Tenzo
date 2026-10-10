/* TILT LAB - World 10: ORDER. Three balls, three cups, and one way down:
 * a ball takes the first cup it reaches, so who goes first decides
 * everything.
 *   1 FIRST COME   tilt left, then right: watch who leads
 *   2 QUEUE        send them down in the right order
 *   3 SHUFFLE      blue starts in the middle and must end at the far end
 *   4 LAST IN LINE red is in front but belongs at the far end
 *   5 CUT IN       blue needs the first cup before the others arrive
 *   6 GRIDLOCK     everyone wants the same way down
 *
 * Conventions as World 1. Labs here came out of the design search and
 * pass the tier-2 bar. */
import type { LevelDef } from '../../entities/types.ts';

export const FIRSTCOME: LevelDef = {
  id: 'w10-firstcome',
  par: 13.5,
  name: 'FIRST COME',
  hint: 'Each ball takes the first empty cup it reaches. Watch who leads',
  balls: [{ colour: 'blue', x: 400, y: 338 }, { colour: 'red', x: 540, y: 338 }, { colour: 'yellow', x: 680, y: 338 }],
  targets: [{ colour: 'yellow', x: 300, y: 895 }, { colour: 'blue', x: 600, y: 895 }, { colour: 'red', x: 890, y: 895 }],
  rails: [
    { pts: [[320, 400], [960, 400]] },
    { pts: [[40, 880], [166, 880]] },
    { pts: [[434, 880], [466, 880]] },
    { pts: [[734, 880], [756, 880]] }
  ],
  solution: [[0, -1], [6, 1], [10, 0]],
  traps: [[[0, 1]]]
};

export const QUEUE: LevelDef = {
  id: 'w10-queue',
  par: 18,
  name: 'QUEUE',
  hint: 'A ball drops into the first cup it reaches. Send them down in the right order',
  balls: [{ colour: 'yellow', x: 783, y: 168 }, { colour: 'red', x: 564, y: 168 }, { colour: 'blue', x: 640, y: 338 }],
  targets: [{ colour: 'yellow', x: 110, y: 895 }, { colour: 'red', x: 500, y: 895 }, { colour: 'blue', x: 890, y: 895 }],
  rails: [
    { pts: [[480, 230], [960, 230]] },
    { pts: [[320, 400], [960, 400]] },
    { pts: [[320, 570], [960, 570]], only: ['red'] },
    { pts: [[320, 740], [960, 740]], only: ['red'] },
    { pts: [[244, 880], [366, 880]] },
    { pts: [[634, 880], [756, 880]] }
  ],
  solution: [[0, -1], [0.79, 1], [3.6, -1], [5.78, -1], [8.05, 0], [9.85, 1], [14.97, 1], [15.98, 0]],
  traps: [[[0, 1]], [[0, -1]]]
};

export const SHUFFLE: LevelDef = {
  id: 'w10-shuffle',
  par: 18,
  name: 'SHUFFLE',
  hint: 'Blue starts in the middle and must end at the far end. Who lets it past?',
  balls: [{ colour: 'yellow', x: 620, y: 168 }, { colour: 'red', x: 426, y: 168 }, { colour: 'blue', x: 280, y: 338 }],
  targets: [{ colour: 'yellow', x: 890, y: 895 }, { colour: 'red', x: 500, y: 895 }, { colour: 'blue', x: 110, y: 895 }],
  rails: [
    { pts: [[40, 230], [680, 230]] },
    { pts: [[40, 400], [520, 400]], only: ['red'] },
    { pts: [[40, 570], [620, 570]], only: ['blue'] },
    { pts: [[780, 570], [960, 570]] },
    { pts: [[40, 740], [420, 740]] },
    { pts: [[580, 740], [960, 740]], only: ['blue'] },
    { pts: [[244, 880], [366, 880]] },
    { pts: [[634, 880], [756, 880]] }
  ],
  solution: [[0, 1], [1.06, -1], [3.51, 0], [3.97, 1], [4.43, -1], [6.07, 1], [10.69, -1]],
  traps: [[[0, 1]], [[0, -1]]]
};

export const LASTINLINE: LevelDef = {
  id: 'w10-lastinline',
  par: 18.5,
  name: 'LAST IN LINE',
  hint: 'Red is in front but belongs at the far end. Let the others go first',
  balls: [{ colour: 'yellow', x: 729, y: 168 }, { colour: 'red', x: 875, y: 168 }, { colour: 'blue', x: 680, y: 338 }],
  targets: [{ colour: 'yellow', x: 890, y: 895 }, { colour: 'red', x: 110, y: 895 }, { colour: 'blue', x: 500, y: 895 }],
  rails: [
    { pts: [[400, 230], [960, 230]] },
    { pts: [[400, 400], [960, 400]] },
    { pts: [[40, 570], [680, 570]] },
    { pts: [[560, 740], [960, 740]], only: ['red'] },
    { pts: [[244, 880], [366, 880]] },
    { pts: [[634, 880], [756, 880]] }
  ],
  solution: [[0, -1], [2.88, 1], [5.13, 0], [5.99, 1], [6.94, -1], [9.89, 0], [10.67, 1], [12.74, 1], [14.16, 0]],
  traps: [[[0, 1]], [[0, -1]]]
};

export const CUTIN: LevelDef = {
  id: 'w10-cutin',
  par: 16.5,
  name: 'CUT IN',
  hint: 'Blue starts below the others but needs the first cup. Get it there before they arrive',
  balls: [{ colour: 'yellow', x: 137, y: 168 }, { colour: 'red', x: 327, y: 168 }, { colour: 'blue', x: 360, y: 338 }],
  targets: [{ colour: 'yellow', x: 500, y: 895 }, { colour: 'red', x: 890, y: 895 }, { colour: 'blue', x: 110, y: 895 }],
  rails: [
    { pts: [[40, 230], [620, 230]] },
    { pts: [[780, 230], [960, 230]] },
    { pts: [[40, 400], [680, 400]] },
    { pts: [[40, 570], [440, 570]] },
    { pts: [[40, 740], [620, 740]], only: ['red'] },
    { pts: [[780, 740], [960, 740]], only: ['red'] },
    { pts: [[244, 880], [366, 880]] },
    { pts: [[634, 880], [756, 880]] }
  ],
  solution: [[0, 1], [1.44, 0], [2.3, 1], [4.63, -1], [5.56, 1], [5.99, -1], [8.04, -1]],
  traps: [[[0, 1]], [[0, -1]]]
};

export const GRIDLOCK: LevelDef = {
  id: 'w10-gridlock',
  par: 14.5,
  name: 'GRIDLOCK',
  hint: 'Everyone wants the same way down. Untangle them one at a time',
  balls: [{ colour: 'yellow', x: 464, y: 168 }, { colour: 'red', x: 143, y: 168 }, { colour: 'blue', x: 360, y: 338 }],
  targets: [{ colour: 'yellow', x: 890, y: 895 }, { colour: 'red', x: 500, y: 895 }, { colour: 'blue', x: 110, y: 895 }],
  rails: [
    { pts: [[40, 230], [620, 230]] },
    { pts: [[780, 230], [960, 230]] },
    { pts: [[40, 400], [680, 400]] },
    { pts: [[40, 570], [440, 570]] },
    { pts: [[480, 740], [960, 740]], only: ['red'] },
    { pts: [[244, 880], [366, 880]] },
    { pts: [[634, 880], [756, 880]] }
  ],
  solution: [[0, 1], [2.44, 0], [3.13, -1], [4.09, 0], [4.52, -1], [7.41, 0], [8.05, 1], [8.7, 1], [9.23, 1], [11.3, 0]],
  traps: [[[0, 1]], [[0, -1]]]
};

export const WORLD10: LevelDef[] = [FIRSTCOME, QUEUE, SHUFFLE, LASTINLINE, CUTIN, GRIDLOCK];
