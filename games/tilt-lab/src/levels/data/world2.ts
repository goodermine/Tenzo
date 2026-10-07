/* TILT LAB - World 2: GATES. Switches that remember, forget and flip -
 * and bridges over pits that come and go with them.
 *   1 TOGGLE      a switch that flips each time you cross it
 *   2 TIMER       a timed bridge: press, then make the whole run in time
 *   3 ONE WAY     past the arrows there is no way back: press first
 *   4 PAIR        two yellows, one toggle: only one may cross it
 *   5 SWITCHYARD  one toggle, two bridges, opposite ways: red goes first
 *   6 LOCKSTEP    red waits at the gap while yellow works the timer
 *
 * Conventions as World 1: a floor at y holds a ball's centre at y - 62; a
 * cup set into a floor at y sits at (x, y + 34); a pad on a floor at y
 * runs along y - 22. */
import type { LevelDef } from '../../entities/types.ts';

export const TOGGLE: LevelDef = {
  id: 'w2-toggle',
  par: 5.5,
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
  par: 11,
  name: 'TIMER',
  hint: 'The pad brings the bridge for a few seconds. Plan the whole run first',
  balls: [{ colour: 'yellow', x: 400, y: 338 }],
  targets: [{ colour: 'yellow', x: 110, y: 895 }],
  rails: [
    { pts: [[40, 400], [860, 400]] },
    { pts: [[440, 880], [960, 880]] }
  ],
  switches: [{ id: 'h', a: [26, 300], b: [26, 380], hold: 5.4 }],
  gates: [{ a: [262, 880], b: [420, 880], r: 18, slide: [0, 200], by: ['h'], invert: true }],
  hazards: [{ x: 262, y: 920, w: 160, h: 80 }],
  solution: [[0, -1], [2.2, 1], [5, -1], [10, 0]],
  traps: [[[0, 1], [3, -1]], [[0, -1], [4, 1], [8, -1]]]
};

export const ONEWAY: LevelDef = {
  id: 'w2-oneway',
  par: 13,
  name: 'ONE WAY',
  hint: 'Arrows let you through one way only. There is no coming back',
  balls: [{ colour: 'yellow', x: 780, y: 388 }],
  targets: [{ colour: 'yellow', x: 690, y: 895 }],
  rails: [
    { pts: [[200, 450], [800, 450]] },
    { pts: [[480, 330], [480, 432]], r: 14, oneWay: [-1, 0] },
    { pts: [[150, 880], [556, 880]] },
    { pts: [[824, 880], [820, 880], [820, 640]] }
  ],
  switches: [{ id: 'b', a: [290, 428], b: [370, 428], latch: true }],
  gates: [{ a: [540, 690], b: [540, 858], r: 14, slide: [0, -190], by: ['b'] }],
  hazards: [{ x: 40, y: 900, w: 100, h: 100 }, { x: 842, y: 900, w: 118, h: 100 }],
  solution: [[0, -1], [2.8, 1], [9, 0]],
  traps: [[[0, 1]], [[0, -1]]]
};

export const PAIR: LevelDef = {
  id: 'w2-pair',
  par: 10,
  name: 'PAIR',
  hint: 'Each crossing flips the bridge. Two crossings undo one',
  balls: [{ colour: 'yellow', x: 650, y: 338 }, { colour: 'yellow', x: 740, y: 338 }],
  targets: [{ colour: 'yellow', x: 260, y: 715 }, { colour: 'yellow', x: 890, y: 715 }],
  rails: [
    { pts: [[600, 400], [960, 400]] },
    { pts: [[394, 700], [640, 700]] },
    { pts: [[110, 700], [126, 700]] }
  ],
  switches: [{ id: 't', a: [430, 678], b: [500, 678], toggle: true }],
  gates: [{ a: [662, 700], b: [754, 700], r: 18, slide: [0, 400], by: ['t'], invert: true }],
  hazards: [{ x: 40, y: 900, w: 70, h: 100 }, { x: 660, y: 900, w: 96, h: 100 }],
  solution: [[0, -1], [1.9, 1], [4.5, -1], [5.2, 1], [7.6, -1], [10.4, 0]],
  traps: [[[0, -1]], [[0, -1], [3, 1]]]
};

export const SWITCHYARD: LevelDef = {
  id: 'w2-switchyard',
  par: 11,
  name: 'SWITCHYARD',
  hint: 'One switch, two bridges: when one comes, the other goes',
  balls: [{ colour: 'yellow', x: 130, y: 318 }, { colour: 'red', x: 300, y: 698 }],
  targets: [{ colour: 'yellow', x: 890, y: 395 }, { colour: 'red', x: 890, y: 775 }],
  rails: [
    { pts: [[40, 380], [560, 380]] },
    { pts: [[40, 760], [440, 760]] }
  ],
  switches: [{ id: 't', a: [26, 270], b: [26, 350], toggle: true }],
  gates: [
    { a: [582, 380], b: [754, 380], r: 18, slide: [0, -480], by: ['t'], invert: true },
    { a: [462, 760], b: [754, 760], r: 18, slide: [0, 320], by: ['t'] }
  ],
  hazards: [{ x: 460, y: 900, w: 296, h: 100 }],
  solution: [[0, 1], [1.2, -1], [4.5, 1], [9, 0]],
  traps: [[[0, 1]], [[0, -1], [3, 1]]]
};

export const LOCKSTEP: LevelDef = {
  id: 'w2-lockstep',
  par: 10,
  name: 'LOCKSTEP',
  hint: 'Yellow works the timer. Red has to be ready at the gap',
  balls: [{ colour: 'yellow', x: 420, y: 318 }, { colour: 'red', x: 150, y: 698 }],
  targets: [{ colour: 'yellow', x: 890, y: 395 }, { colour: 'red', x: 890, y: 775 }],
  rails: [
    { pts: [[40, 380], [756, 380]] },
    { pts: [[120, 760], [538, 760]] },
    { pts: [[250, 640], [250, 738]], r: 14, oneWay: [1, 0] }
  ],
  switches: [{ id: 'h', a: [26, 270], b: [26, 350], hold: 1.6 }],
  gates: [{ a: [560, 760], b: [754, 760], r: 18, slide: [0, 260], by: ['h'], invert: true }],
  hazards: [{ x: 560, y: 900, w: 196, h: 100 }, { x: 40, y: 900, w: 70, h: 100 }],
  solution: [[0, 1], [0.9, -1], [4, 1], [7, 0]],
  traps: [[[0, -1], [3, 1], [8, 0]], [[0, 1]]]
};

export const WORLD2: LevelDef[] = [TOGGLE, TIMER, ONEWAY, PAIR, SWITCHYARD, LOCKSTEP];
