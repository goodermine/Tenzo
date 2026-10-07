/* TILT LAB - World 10: ORDER. Three balls, three cups, and one way down:
 * a ball takes the first cup it reaches, so who goes first decides
 * everything.
 *   1 FIRST COME   tilt left, then right: watch who leads
 *   2 QUEUE        send them down in the right order
 *   3 SHUFFLE      blue starts in the middle and must end at the far end
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

export const WORLD10: LevelDef[] = [FIRSTCOME, QUEUE, SHUFFLE];
