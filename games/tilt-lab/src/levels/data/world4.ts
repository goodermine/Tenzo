/* TILT LAB - World 4: BOUNCE. Green bounces, springs throw, lime rails
 * rebound anything.
 *
 *   1 BOING       green bounces over a pit that would swallow yellow
 *   2 SPRING      a spring pad throws you up onto a shelf
 *   3 RICOCHET    a lime plate kicks a falling yellow across a pit
 *   4 HIGH BUTTON only a spring throw reaches the button; red waits
 *   5 SORTER      one spring: light blue flies over the shelf, red under
 *   6 RELAY       spring to spring, steering in the air
 *
 * Conventions as World 1. Cups are padded: whatever lands in one stays.
 * A spring sets a ball's speed off its face to a fixed value whatever it
 * lands with, so throws are repeatable; how high it goes then depends on
 * the ball's own gravity (red least, blue most). */
import type { LevelDef } from '../../entities/types.ts';

export const BOING: LevelDef = {
  id: 'w4-boing',
  name: 'BOING',
  hint: 'Green bounces. Let it fly',
  balls: [{ colour: 'green', x: 100, y: 438 }],
  targets: [{ colour: 'green', x: 800, y: 895 }],
  rails: [
    { pts: [[40, 500], [250, 500]] },
    { pts: [[40, 880], [550, 880]] },
    { pts: [[934, 880], [960, 880]] }
  ],
  hazards: [{ x: 570, y: 900, w: 94, h: 100 }],
  solution: [[0, 1], [1.1, 0]],
  traps: [[[0, 1]]]
};

export const SPRING: LevelDef = {
  id: 'w4-spring',
  name: 'SPRING',
  hint: 'Roll onto the spring and it throws you up',
  balls: [{ colour: 'yellow', x: 130, y: 818 }],
  targets: [{ colour: 'yellow', x: 890, y: 495 }],
  rails: [
    { pts: [[40, 880], [370, 880]] },
    { pts: [[490, 880], [600, 880], [600, 480], [756, 480]] }
  ],
  springs: [{ a: [380, 868], b: [480, 868], power: 1150 }],
  solution: [[0, 1], [6, 0]]
};

export const RICOCHET: LevelDef = {
  id: 'w4-ricochet',
  name: 'RICOCHET',
  hint: 'Lime rails bounce anything. Even yellow',
  balls: [{ colour: 'yellow', x: 100, y: 338 }],
  targets: [{ colour: 'yellow', x: 890, y: 895 }],
  rails: [
    { pts: [[40, 400], [190, 400]] },
    { pts: [[350, 250], [350, 540]] },
    { pts: [[190, 610], [380, 800]], bouncy: true },
    { pts: [[40, 880], [440, 880]] },
    { pts: [[660, 880], [756, 880]] }
  ],
  hazards: [{ x: 460, y: 900, w: 180, h: 100 }],
  solution: [[0, 1], [5, 0]],
  traps: [[[0, 0.3]]]
};

export const HIGHBUTTON: LevelDef = {
  id: 'w4-highbutton',
  name: 'HIGH BUTTON',
  hint: 'The button is out of reach. Unless something throws you',
  balls: [{ colour: 'yellow', x: 270, y: 818 }, { colour: 'red', x: 580, y: 818 }],
  targets: [{ colour: 'yellow', x: 110, y: 895 }, { colour: 'red', x: 890, y: 895 }],
  rails: [
    { pts: [[244, 880], [330, 880]] },
    { pts: [[450, 880], [756, 880]] },
    { pts: [[540, 300], [720, 300]] }
  ],
  springs: [{ a: [340, 868], b: [440, 868], power: 1100 }],
  switches: [{ id: 'b', a: [550, 322], b: [710, 322], latch: true }],
  gates: [{ a: [680, 690], b: [680, 862], r: 14, slide: [0, -200], by: ['b'] }],
  solution: [[0, 1], [5, -1], [10, 0]],
  traps: [[[0, -1]]]
};

export const SORTER: LevelDef = {
  id: 'w4-sorter',
  name: 'SORTER',
  hint: 'One spring. Light and heavy fly differently',
  balls: [{ colour: 'red', x: 250, y: 818 }, { colour: 'blue', x: 130, y: 818 }],
  targets: [{ colour: 'blue', x: 890, y: 395 }, { colour: 'red', x: 890, y: 895 }],
  rails: [
    { pts: [[40, 880], [390, 880]] },
    { pts: [[510, 880], [756, 880]] },
    { pts: [[610, 380], [756, 380]] }
  ],
  springs: [{ a: [400, 868], b: [500, 868], power: 1100 }],
  solution: [[0, 1], [8, 0]]
};

export const RELAY: LevelDef = {
  id: 'w4-relay',
  name: 'RELAY',
  hint: 'Spring to spring. Steer while you fly',
  balls: [{ colour: 'yellow', x: 130, y: 818 }],
  targets: [{ colour: 'yellow', x: 110, y: 315 }],
  rails: [
    { pts: [[40, 880], [390, 880]] },
    { pts: [[510, 880], [960, 880]] },
    { pts: [[620, 880], [620, 560], [800, 560]] },
    { pts: [[244, 300], [500, 300]] }
  ],
  springs: [{ a: [400, 868], b: [500, 868], power: 1050 }, { a: [810, 548], b: [920, 500], power: 1150 }],
  solution: [[0, 1], [2.5, -1], [7, 0]],
  traps: [[[0, 1]], [[0, 1], [3, 0]]]
};

export const WORLD4: LevelDef[] = [BOING, SPRING, RICOCHET, HIGHBUTTON, SORTER, RELAY];
