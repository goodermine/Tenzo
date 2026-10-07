/* TILT LAB - World 1: TILT. Six labs, one idea each:
 *   1 ROLL          tilting moves the ball
 *   2 SWITCHBACK    reversing: right, left, right - and the wrong way is a pit
 *   3 SWING         momentum: rock it to climb, but unevenly, or it flies off
 *   4 HEAVY         the red ball: a run-up, and an order (a red ball that
 *                   drops into another colour's cup is stuck there)
 *   5 BUTTON        sequencing: the button raises a bridge; reach it first
 *   6 COUNTERWEIGHT red sitting in its cup holds the bridge for yellow
 *
 * Every lab after the first must beat mindless play (tools/solve.ts).
 *
 * The chamber is 1000 x 1000. A floor at y keeps a ball's centre at
 * y - 62; a cup set into a floor at y sits at (x, y + 15), its lips reaching x +/- 134. */
import type { LevelDef } from '../../entities/types.ts';

export const ROLL: LevelDef = {
  id: 'w1-roll',
  par: 4.5,
  name: 'ROLL',
  hint: 'Tilt right to roll the ball home',
  balls: [{ colour: 'yellow', x: 150, y: 318 }],
  targets: [{ colour: 'yellow', x: 890, y: 895 }],
  rails: [
    { pts: [[40, 380], [560, 380]] },
    { pts: [[30, 880], [756, 880]] }
  ],
  solution: [[0, 1], [3.5, 0]]
};

export const SWITCHBACK: LevelDef = {
  id: 'w1-switchback',
  par: 10.5,
  name: 'SWITCHBACK',
  hint: 'Right, left, right. Turn back the moment you drop',
  balls: [{ colour: 'yellow', x: 260, y: 168 }],
  targets: [{ colour: 'yellow', x: 890, y: 895 }],
  rails: [
    { pts: [[180, 230], [560, 230]] },
    { pts: [[500, 450], [960, 450]] },
    { pts: [[220, 680], [700, 680]] },
    { pts: [[260, 880], [756, 880]] }
  ],
  hazards: [{ x: 40, y: 900, w: 200, h: 100 }],
  solution: [[0, 1], [2.8, -1], [4.9, 1], [10, 0]],
  traps: [[[0, 1]], [[0, -1]], [[0, 1], [2.8, -1], [8, 1]]]
};

export const SWING: LevelDef = {
  id: 'w1-swing',
  par: 9.5,
  name: 'SWING',
  hint: 'Rock it to climb. Too hard to the left and it is gone',
  balls: [{ colour: 'yellow', x: 480, y: 620 }],
  targets: [{ colour: 'yellow', x: 890, y: 555 }],
  rails: [
    { pts: [[170, 600], [260, 640], [400, 690], [500, 698], [600, 688], [690, 650], [725, 595], [756, 545]], smooth: true }
  ],
  hazards: [{ x: 40, y: 900, w: 360, h: 100 }],
  solution: [[0, 1], [2.5, -1], [4.2, 1], [6.8, 0]],
  traps: [[[0, 1]], [[0, 1], [1.9, -1], [4.2, 1], [8, 0]]]
};

export const HEAVY: LevelDef = {
  id: 'w1-heavy',
  par: 7.5,
  name: 'HEAVY',
  hint: 'Red needs a run-up. Yellow fills its cup first, or red falls in',
  balls: [{ colour: 'red', x: 560, y: 498 }, { colour: 'yellow', x: 470, y: 498 }],
  targets: [{ colour: 'yellow', x: 330, y: 575 }, { colour: 'red', x: 890, y: 575 }],
  rails: [
    { pts: [[160, 560], [196, 560]] },
    { pts: [[464, 560], [600, 560], [640, 496], [670, 496], [710, 560], [756, 560]] }
  ],
  hazards: [{ x: 40, y: 900, w: 120, h: 100 }],
  solution: [[0, -1], [1.8, 1], [6, 0]],
  traps: [[[0, 1]], [[0, -1]], [[0, -1], [3, 1]]]
};

export const BUTTON: LevelDef = {
  id: 'w1-button',
  par: 11.5,
  name: 'BUTTON',
  hint: 'The button raises the bridge. Find a way to reach it first',
  balls: [{ colour: 'yellow', x: 450, y: 168 }],
  targets: [{ colour: 'yellow', x: 890, y: 895 }],
  rails: [
    { pts: [[180, 230], [600, 230]] },
    { pts: [[300, 500], [960, 500]] },
    { pts: [[170, 880], [480, 880]] },
    { pts: [[720, 880], [756, 880]] }
  ],
  switches: [{ id: 'b', a: [974, 390], b: [974, 470], latch: true }],
  gates: [{ a: [500, 880], b: [700, 880], r: 18, slide: [0, 200], by: ['b'], invert: true }],
  hazards: [{ x: 500, y: 920, w: 200, h: 80 }, { x: 40, y: 900, w: 112, h: 100 }],
  solution: [[0, 1], [2.7, -1], [5, 1], [8.5, 0]],
  traps: [[[0, -1], [2, 1]], [[0, 1], [2.7, -1]]]
};

export const COUNTERWEIGHT: LevelDef = {
  id: 'w1-counterweight',
  par: 6.5,
  name: 'COUNTERWEIGHT',
  hint: 'Red in its cup holds the bridge. Just a tap the other way',
  balls: [{ colour: 'red', x: 610, y: 498 }, { colour: 'yellow', x: 290, y: 498 }],
  targets: [{ colour: 'red', x: 470, y: 575 }, { colour: 'yellow', x: 890, y: 575 }],
  rails: [
    { pts: [[180, 560], [336, 560]] },
    { pts: [[604, 560], [640, 560]] }
  ],
  switches: [{ id: 'p', a: [440, 640], b: [500, 640], minMass: 3 }],
  gates: [{ a: [662, 560], b: [754, 560], r: 18, slide: [0, 460], by: ['p'], invert: true }],
  hazards: [{ x: 660, y: 900, w: 96, h: 100 }, { x: 40, y: 900, w: 150, h: 100 }],
  solution: [[0, -1], [0.6, 1], [9, 0]],
  traps: [[[0, 1]], [[0, -1]], [[0, -1], [2, 1]]]
};

export const WORLD1: LevelDef[] = [ROLL, SWITCHBACK, SWING, HEAVY, BUTTON, COUNTERWEIGHT];
