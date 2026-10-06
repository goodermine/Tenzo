/* TILT LAB - World 1: TILT. Six labs, one idea each:
 *   1 ROLL          tilting moves the ball
 *   2 SWITCHBACK    reversing: right, left, right
 *   3 SWING         momentum: rock it to climb what tilt alone cannot
 *   4 HEAVY         the red ball: same tilt, different result
 *   5 BUTTON        sequencing: press first, then go
 *   6 COUNTERWEIGHT red holds the gate for yellow
 *
 * The chamber is 1000 x 1000. A floor at y keeps a ball's centre at
 * y - 62; a cup set into a floor at y sits at (x, y + 34). */
import type { LevelDef } from '../../entities/types.ts';

export const ROLL: LevelDef = {
  id: 'w1-roll',
  name: 'ROLL',
  hint: 'Tilt right to roll the ball home',
  balls: [{ colour: 'yellow', x: 150, y: 318 }],
  targets: [{ colour: 'yellow', x: 890, y: 914 }],
  rails: [
    { pts: [[40, 380], [560, 380]] },
    { pts: [[30, 880], [799, 880]] }
  ],
  solution: [[0, 1], [3.5, 0]]
};

export const SWITCHBACK: LevelDef = {
  id: 'w1-switchback',
  name: 'SWITCHBACK',
  hint: 'Right, then left, then right again',
  balls: [{ colour: 'yellow', x: 130, y: 168 }],
  targets: [{ colour: 'yellow', x: 890, y: 914 }],
  rails: [
    { pts: [[40, 230], [520, 230]] },
    { pts: [[300, 450], [960, 450]] },
    { pts: [[40, 680], [700, 680]] },
    { pts: [[30, 880], [799, 880]] }
  ],
  solution: [[0, 1], [2.8, -1], [5.4, 1], [8.2, 0]],
  traps: [[[0, 1]]]
};

export const SWING: LevelDef = {
  id: 'w1-swing',
  name: 'SWING',
  hint: 'Too steep to climb? Rock it back and forth',
  balls: [{ colour: 'yellow', x: 480, y: 620 }],
  targets: [{ colour: 'yellow', x: 890, y: 574 }],
  rails: [
    { pts: [[30, 300], [110, 520], [260, 640], [400, 690], [500, 698], [600, 688], [690, 650], [745, 590], [780, 545], [799, 540]], smooth: true }
  ],
  solution: [[0, 1], [1.9, -1], [4.2, 1], [8, 0]],
  traps: [[[0, 1]], [[0, 1], [3, 0], [4, 1]]]
};

export const HEAVY: LevelDef = {
  id: 'w1-heavy',
  name: 'HEAVY',
  hint: 'Red is heavy: it rolls faster and further',
  balls: [{ colour: 'yellow', x: 130, y: 498 }, { colour: 'red', x: 250, y: 498 }],
  targets: [{ colour: 'yellow', x: 560, y: 594 }, { colour: 'red', x: 890, y: 594 }],
  rails: [
    { pts: [[40, 560], [469, 560]] },
    { pts: [[651, 560], [799, 560]] }
  ],
  solution: [[0, 1], [3, 0]]
};

export const BUTTON: LevelDef = {
  id: 'w1-button',
  name: 'BUTTON',
  hint: 'Press the pink button to open the gate',
  balls: [{ colour: 'yellow', x: 400, y: 498 }],
  targets: [{ colour: 'yellow', x: 890, y: 594 }],
  rails: [
    { pts: [[40, 560], [799, 560]] }
  ],
  switches: [{ id: 'b', a: [26, 440], b: [26, 530], latch: true }],
  gates: [{ a: [690, 330], b: [690, 528], r: 14, slide: [0, -232], by: ['b'] }],
  solution: [[0, -1], [3, 1], [7, 0]],
  traps: [[[0, 1]]]
};

export const COUNTERWEIGHT: LevelDef = {
  id: 'w1-counterweight',
  name: 'COUNTERWEIGHT',
  hint: 'Only red is heavy enough to hold the plate down',
  balls: [{ colour: 'red', x: 270, y: 498 }, { colour: 'yellow', x: 700, y: 498 }],
  targets: [{ colour: 'red', x: 130, y: 594 }, { colour: 'yellow', x: 890, y: 594 }],
  rails: [
    { pts: [[221, 560], [300, 560], [490, 614], [540, 614], [556, 560], [568, 505], [600, 498], [640, 535], [690, 560], [799, 560]] }
  ],
  switches: [{ id: 'p', a: [484, 592], b: [540, 592], minMass: 3 }],
  gates: [{ a: [770, 330], b: [770, 528], r: 14, slide: [0, -232], by: ['p'] }],
  solution: [[0, 1], [4.5, -1], [9, 0]],
  traps: [[[0, -1], [3, 1], [8, -1]]]
};

export const WORLD1: LevelDef[] = [ROLL, SWITCHBACK, SWING, HEAVY, BUTTON, COUNTERWEIGHT];
