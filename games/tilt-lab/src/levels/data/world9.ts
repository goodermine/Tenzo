/* TILT LAB - World 9: CRUMBLE. Cracked floors hold while a ball is on
 * them; once one has been used and is left empty, it falls away. Every
 * route can be crossed once - by everyone who needs it, together.
 *   1 CRUMBLE      yellow crosses; the fallen bridge drops blue home
 *   2 THREE CRACKS the holes the floors leave are the way down
 *   3 FALLAWAY     a floor you leave is gone: who needs it after you?
 *   4 LAST ONE ACROSS  whoever crosses last takes the floor with them
 *   5 NO WAY BACK  each cracked floor is a one-time ticket
 *   6 DEMOLITION   bring the floors down in the right order
 *
 * Labs 2-6 came out of the design search and pass the tier-2 bar - and
 * each one's solution fails if its cracked floors are made solid.
 *
 * Conventions as World 1. */
import type { LevelDef } from '../../entities/types.ts';

export const CRUMBLE: LevelDef = {
  id: 'w9-crumble',
  par: 10.5,
  name: 'CRUMBLE',
  hint: 'Yellow crosses first. Once it is off, the bridge falls - and leaves a hole',
  balls: [{ colour: 'yellow', x: 300, y: 338 }, { colour: 'blue', x: 100, y: 338 }],
  targets: [{ colour: 'yellow', x: 890, y: 415 }, { colour: 'blue', x: 500, y: 895 }],
  rails: [
    { pts: [[40, 400], [360, 400]] },
    { pts: [[380, 400], [620, 400]], crumble: true },
    { pts: [[640, 400], [756, 400]] },
    { pts: [[40, 880], [366, 880]] },
    { pts: [[634, 880], [960, 880]] }
  ],
  solution: [[0, 1], [4.6, -1], [7.5, 0]],
  traps: [[[0, 1], [1.2, 0]], [[0, -1]]]
};

export const THREECRACKS: LevelDef = {
  id: 'w9-threecracks',
  par: 15.5,
  name: 'THREE CRACKS',
  hint: 'Each cracked floor carries one crossing. The holes they leave are the way down',
  balls: [{ colour: 'yellow', x: 344, y: 168 }, { colour: 'blue', x: 147, y: 168 }],
  targets: [{ colour: 'yellow', x: 110, y: 895 }, { colour: 'blue', x: 500, y: 895 }],
  rails: [
    { pts: [[40, 230], [420, 230]] },
    { pts: [[580, 230], [960, 230]] },
    { pts: [[40, 400], [620, 400]], crumble: true },
    { pts: [[780, 400], [960, 400]] },
    { pts: [[320, 570], [960, 570]], crumble: true },
    { pts: [[40, 740], [220, 740]], crumble: true },
    { pts: [[380, 740], [960, 740]], only: ['yellow'] },
    { pts: [[244, 880], [366, 880]] },
    { pts: [[634, 880], [960, 880]] }
  ],
  solution: [[0, 1], [2.43, -1], [4.6, 1], [6.06, 0], [7.38, 1], [8.97, -1], [11.82, 0]],
  traps: [[[0, 1]], [[0, -1]]]
};

export const FALLAWAY: LevelDef = {
  id: 'w9-fallaway',
  par: 19,
  name: 'FALLAWAY',
  hint: 'A floor you leave is gone. Who needs it after you?',
  balls: [{ colour: 'yellow', x: 292, y: 168 }, { colour: 'red', x: 471, y: 168 }],
  targets: [{ colour: 'yellow', x: 500, y: 895 }, { colour: 'red', x: 110, y: 895 }],
  rails: [
    { pts: [[40, 230], [600, 230]] },
    { pts: [[40, 400], [220, 400]], crumble: true },
    { pts: [[380, 400], [960, 400]], crumble: true },
    { pts: [[40, 570], [600, 570]] },
    { pts: [[40, 740], [220, 740]], only: ['red'] },
    { pts: [[380, 740], [960, 740]] },
    { pts: [[244, 880], [366, 880]] }
  ],
  solution: [[0, 1], [2.98, -1], [5.67, 1], [7.66, 0], [9.41, 1], [10.96, -1], [13.53, 1], [14.07, 0]],
  traps: [[[0, 1]], [[0, -1]]]
};

export const LASTONE: LevelDef = {
  id: 'w9-lastone',
  par: 18.5,
  name: 'LAST ONE ACROSS',
  hint: 'Whoever crosses last takes the floor with them. Choose the order',
  balls: [{ colour: 'red', x: 189, y: 168 }, { colour: 'blue', x: 371, y: 168 }],
  targets: [{ colour: 'red', x: 890, y: 895 }, { colour: 'blue', x: 500, y: 895 }],
  rails: [
    { pts: [[40, 230], [520, 230]] },
    { pts: [[40, 400], [220, 400]], crumble: true },
    { pts: [[380, 400], [960, 400]] },
    { pts: [[40, 570], [600, 570]], only: ['blue'] },
    { pts: [[400, 740], [960, 740]], only: ['blue'] },
    { pts: [[40, 880], [366, 880]] },
    { pts: [[634, 880], [756, 880]] }
  ],
  solution: [[0, 1], [2.39, -1], [3.6, 0], [4.63, -1], [6.88, 1], [8.04, 0], [9.2, -1], [11.73, 1], [14.36, 0]],
  traps: [[[0, 1]], [[0, -1]]]
};

export const NOWAYBACK: LevelDef = {
  id: 'w9-nowayback',
  par: 18.5,
  name: 'NO WAY BACK',
  hint: 'Every cracked floor is a one-time ticket. Spend them in the right order',
  balls: [{ colour: 'yellow', x: 183, y: 168 }, { colour: 'red', x: 379, y: 168 }],
  targets: [{ colour: 'yellow', x: 890, y: 895 }, { colour: 'red', x: 500, y: 895 }],
  rails: [
    { pts: [[40, 230], [620, 230]] },
    { pts: [[780, 230], [960, 230]] },
    { pts: [[320, 400], [960, 400]], crumble: true },
    { pts: [[40, 570], [680, 570]], only: ['red'] },
    { pts: [[400, 740], [960, 740]] },
    { pts: [[40, 880], [366, 880]] },
    { pts: [[634, 880], [756, 880]] }
  ],
  solution: [[0, 1], [1.3, -1], [2.67, 1], [5.32, 0], [7.74, -1], [10.06, 0], [11.82, 1], [14.61, 0]],
  traps: [[[0, 1]], [[0, -1]]]
};

export const DEMOLITION: LevelDef = {
  id: 'w9-demolition',
  par: 19,
  name: 'DEMOLITION',
  hint: 'Bring the floors down in the right order and the way home opens up',
  balls: [{ colour: 'red', x: 417, y: 168 }, { colour: 'blue', x: 283, y: 168 }],
  targets: [{ colour: 'red', x: 890, y: 895 }, { colour: 'blue', x: 110, y: 895 }],
  rails: [
    { pts: [[40, 230], [680, 230]] },
    { pts: [[40, 400], [420, 400]], crumble: true },
    { pts: [[580, 400], [960, 400]] },
    { pts: [[400, 570], [960, 570]] },
    { pts: [[40, 740], [620, 740]], only: ['blue'] },
    { pts: [[780, 740], [960, 740]] },
    { pts: [[244, 880], [756, 880]] }
  ],
  solution: [[0, 1], [3.43, -1], [5.7, 1], [8.22, -1], [10.89, 1], [13.37, -1], [14.5, 1], [15.4, 0], [16.31, 0], [18.82, 0]],
  traps: [[[0, 1]], [[0, -1]]]
};

export const WORLD9: LevelDef[] = [CRUMBLE, THREECRACKS, FALLAWAY, LASTONE, NOWAYBACK, DEMOLITION];
