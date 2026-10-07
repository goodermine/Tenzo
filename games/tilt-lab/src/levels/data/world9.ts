/* TILT LAB - World 9: CRUMBLE. Cracked floors hold while a ball is on
 * them; once one has been used and is left empty, it falls away. Every
 * route can be crossed once - by everyone who needs it, together.
 *   1 CRUMBLE      yellow crosses; the fallen bridge drops blue home
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

export const WORLD9: LevelDef[] = [CRUMBLE, THREECRACKS, FALLAWAY];
