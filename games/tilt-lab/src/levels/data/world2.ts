/* TILT LAB - World 2: GATES. Switches that remember, forget and flip.
 *   1 TOGGLE      a switch that flips each time you cross it
 *   2 TIMER       a door that stays open only for a moment: race it
 *   3 ONE WAY     a barrier you can pass one way and never back
 *   4 PAIR        two of a colour: the first fills the gap for the second
 *   5 SWITCHYARD  one toggle, two gates, opposite ways: order matters
 *   6 LOCKSTEP    everything at once
 *
 * Conventions as World 1: a floor at y holds a ball's centre at y - 62; a
 * cup set into a floor at y sits at (x, y + 34); a pad on a floor at y
 * runs along y - 22. */
import type { LevelDef } from '../../entities/types.ts';

export const TOGGLE: LevelDef = {
  id: 'w2-toggle',
  name: 'TOGGLE',
  hint: 'Roll over the switch to flip it. Cross it again and it flips back',
  balls: [{ colour: 'yellow', x: 130, y: 498 }],
  targets: [{ colour: 'yellow', x: 890, y: 575 }],
  rails: [{ pts: [[40, 560], [756, 560]] }],
  switches: [{ id: 't', a: [360, 538], b: [440, 538], toggle: true }],
  gates: [{ a: [660, 330], b: [660, 528], r: 14, slide: [0, -232], by: ['t'] }],
  solution: [[0, 1], [4, 0]]
};

export const TIMER: LevelDef = {
  id: 'w2-timer',
  name: 'TIMER',
  hint: 'The door shuts soon after you leave the switch. Be quick',
  balls: [{ colour: 'yellow', x: 520, y: 498 }],
  targets: [{ colour: 'yellow', x: 890, y: 575 }],
  rails: [{ pts: [[40, 560], [756, 560]] }],
  switches: [{ id: 'h', a: [26, 440], b: [26, 530], hold: 3.2 }],
  gates: [{ a: [720, 330], b: [720, 528], r: 14, slide: [0, -232], by: ['h'] }],
  solution: [[0, -1], [2.2, 1], [6, 0]],
  traps: [[[0, -1], [2.2, 0.45], [7, 1]], [[0, 1]]]
};

export const ONEWAY: LevelDef = {
  id: 'w2-oneway',
  name: 'ONE WAY',
  hint: 'Arrows let a ball through one way only',
  balls: [{ colour: 'yellow', x: 200, y: 388 }],
  targets: [{ colour: 'yellow', x: 110, y: 895 }],
  rails: [
    { pts: [[40, 450], [740, 450]] },
    { pts: [[420, 250], [420, 430]], r: 14, oneWay: [1, 0] },
    { pts: [[244, 880], [970, 880]] }
  ],
  switches: [{ id: 'b', a: [600, 428], b: [680, 428], latch: true }],
  gates: [{ a: [330, 660], b: [330, 858], r: 14, slide: [0, -190], by: ['b'] }],
  solution: [[0, 1], [3.5, -1], [7, 0]]
};

export const PAIR: LevelDef = {
  id: 'w2-pair',
  name: 'PAIR',
  hint: 'Two yellows, two cups. One goes each way',
  balls: [{ colour: 'yellow', x: 455, y: 526 }, { colour: 'yellow', x: 545, y: 526 }],
  targets: [{ colour: 'yellow', x: 230, y: 575 }, { colour: 'yellow', x: 770, y: 575 }],
  rails: [
    { pts: [[40, 560], [96, 560]] },
    { pts: [[364, 560], [370, 560], [450, 573], [500, 576], [550, 573], [630, 560], [636, 560]], smooth: true },
    { pts: [[904, 560], [960, 560]] }
  ],
  solution: [[0, 1], [3.5, -1], [7.5, 0]],
  traps: [[[0, 1]], [[0, -1]]]
};

export const SWITCHYARD: LevelDef = {
  id: 'w2-switchyard',
  name: 'SWITCHYARD',
  hint: 'One switch, two gates: when one opens, the other shuts',
  balls: [{ colour: 'red', x: 300, y: 318 }, { colour: 'yellow', x: 300, y: 698 }],
  targets: [{ colour: 'red', x: 890, y: 395 }, { colour: 'yellow', x: 890, y: 775 }],
  rails: [
    { pts: [[40, 380], [756, 380]] },
    { pts: [[40, 760], [756, 760]] }
  ],
  switches: [{ id: 't', a: [26, 270], b: [26, 350], toggle: true }],
  gates: [
    { a: [690, 190], b: [690, 348], r: 14, slide: [0, -180], by: ['t'] },
    { a: [690, 600], b: [690, 728], r: 14, slide: [0, -120], by: ['t'], invert: true }
  ],
  solution: [[0, 1], [3, -1], [5.5, 1], [9, 0]],
  traps: [[[0, -1], [3, 1], [7, 0]]]
};

export const LOCKSTEP: LevelDef = {
  id: 'w2-lockstep',
  name: 'LOCKSTEP',
  hint: 'Yellow works the timer. Red has to be ready',
  balls: [{ colour: 'yellow', x: 420, y: 318 }, { colour: 'red', x: 150, y: 698 }],
  targets: [{ colour: 'yellow', x: 890, y: 395 }, { colour: 'red', x: 890, y: 775 }],
  rails: [
    { pts: [[40, 380], [756, 380]] },
    { pts: [[40, 760], [756, 760]] },
    { pts: [[250, 640], [250, 738]], r: 14, oneWay: [1, 0] }
  ],
  switches: [{ id: 'h', a: [26, 270], b: [26, 350], hold: 1.45 }],
  gates: [{ a: [700, 560], b: [700, 728], r: 14, slide: [0, -130], by: ['h'] }],
  solution: [[0, 1], [0.9, -1], [4, 1], [7, 0]],
  traps: [[[0, -1], [3, 1], [8, 0]], [[0, 1]]]
};

export const WORLD2: LevelDef[] = [TOGGLE, TIMER, ONEWAY, PAIR, SWITCHYARD, LOCKSTEP];
