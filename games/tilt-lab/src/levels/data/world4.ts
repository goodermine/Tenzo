/* TILT LAB - World 4: BOUNCE. Green bounces, springs throw, lime rails
 * rebound anything.
 *
 *   1 BOING       green bounces over a pit that would swallow yellow
 *   2 HIGH BUTTON a spring throw hits the button that bridges red home
 *   3 RICOCHET    a lime trampoline in a well: drop straight, lean late
 *   4 SORTER      one spring thrown both ways; red is creeping to a pit
 *   5 ONE SHOT    a spring that fires once: creep on, steer in the air
 *   6 RELAY       two one-shot springs, steering in the air
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

export const HIGHBUTTON: LevelDef = {
  id: 'w4-highbutton',
  name: 'HIGH BUTTON',
  hint: 'A spring throws you up to the button. Then red can cross, if you are quick',
  balls: [{ colour: 'yellow', x: 270, y: 818 }, { colour: 'red', x: 900, y: 168 }],
  targets: [{ colour: 'yellow', x: 110, y: 895 }, { colour: 'red', x: 110, y: 195 }],
  rails: [
    { pts: [[244, 880], [390, 880]] },
    { pts: [[510, 880], [620, 880]] },
    { pts: [[600, 300], [780, 300]] },
    { pts: [[244, 180], [480, 230]] },
    { pts: [[720, 230], [960, 230]] }
  ],
  springs: [{ a: [400, 868], b: [500, 868], power: 1100 }],
  switches: [{ id: 'b', a: [610, 322], b: [770, 322], latch: true }],
  gates: [{ a: [502, 230], b: [698, 230], r: 18, slide: [0, -300], by: ['b'], invert: true }],
  hazards: [{ x: 640, y: 900, w: 320, h: 100 }],
  solution: [[0, 1], [1.6, -1], [12, 0]],
  traps: [[[0, -1]], [[0, 1]]]
};

export const RICOCHET: LevelDef = {
  id: 'w4-ricochet',
  name: 'RICOCHET',
  hint: 'The lime floor bounces anything. Drop straight, then lean at the top',
  balls: [{ colour: 'yellow', x: 130, y: 338 }],
  targets: [{ colour: 'yellow', x: 890, y: 555 }],
  rails: [
    { pts: [[40, 400], [340, 400], [340, 860]] },
    { pts: [[340, 860], [660, 860]], bouncy: true },
    { pts: [[660, 860], [660, 540], [756, 540]] }
  ],
  solution: [[0, 1], [1, 0], [3.4, 1], [4.7, 0]],
  traps: [[[0, 1]]]
};

export const SORTER: LevelDef = {
  id: 'w4-sorter',
  name: 'SORTER',
  hint: 'One spring, thrown both ways. Blue goes first, and red will not wait long',
  balls: [{ colour: 'blue', x: 215, y: 818 }, { colour: 'red', x: 560, y: 818 }],
  targets: [{ colour: 'blue', x: 890, y: 415 }, { colour: 'red', x: 110, y: 615 }],
  rails: [
    { pts: [[160, 880], [390, 880]] },
    { pts: [[510, 880], [560, 880], [760, 807]] },
    { pts: [[700, 400], [756, 400]] },
    { pts: [[244, 600], [300, 600]] }
  ],
  springs: [{ a: [400, 868], b: [500, 868], power: 1150 }],
  hazards: [{ x: 40, y: 900, w: 110, h: 100 }, { x: 780, y: 900, w: 180, h: 100 }],
  solution: [[0, 1], [3.25, -1], [10, 0]],
  traps: [[[0, 1]], [[0, -1]]]
};

export const ONESHOT: LevelDef = {
  id: 'w4-oneshot',
  name: 'ONE SHOT',
  hint: 'Coral springs fire once. Creep on, then lean the right way',
  balls: [{ colour: 'yellow', x: 260, y: 818 }],
  targets: [{ colour: 'yellow', x: 110, y: 495 }],
  rails: [
    { pts: [[180, 880], [390, 880]] },
    { pts: [[520, 880], [520, 300]] },
    { pts: [[244, 480], [300, 480]] }
  ],
  springs: [{ a: [400, 868], b: [500, 868], power: 1150, once: true }],
  hazards: [{ x: 40, y: 900, w: 130, h: 100 }],
  solution: [[0, 1], [1, -1], [8, 0]],
  traps: [[[0, 1]], [[0, 1], [2, -1]]]
};

export const RELAY: LevelDef = {
  id: 'w4-relay',
  name: 'RELAY',
  hint: 'Two springs, one shot each. Steer while you fly',
  balls: [{ colour: 'yellow', x: 90, y: 798 }],
  targets: [{ colour: 'yellow', x: 110, y: 315 }],
  rails: [
    { pts: [[40, 860], [290, 860]] },
    { pts: [[520, 880], [520, 560], [700, 560]] },
    { pts: [[244, 300], [300, 300]] }
  ],
  springs: [{ a: [300, 862], b: [390, 875], power: 1250, once: true }, { a: [710, 548], b: [820, 500], power: 1150, once: true }],
  hazards: [{ x: 840, y: 900, w: 120, h: 100 }, { x: 300, y: 920, w: 200, h: 80 }],
  solution: [[0, 1], [2.7, -1], [8, 0]],
  traps: [[[0, 1]], [[0, 1], [2, -1]]]
};

export const WORLD4: LevelDef[] = [BOING, HIGHBUTTON, RICOCHET, SORTER, ONESHOT, RELAY];
