/* TILT LAB - World 3: WEIGHT. Blue is light, red is heavy, and the lab
 * starts to care.
 *   1 FLOAT       blue rides a fan's updraft over a wall
 *   2 UPDRAFT     one tilt: the air lifts blue, red rolls under
 *   3 TIPPING     a heavy plank only red can tip
 *   4 FAN SWITCH  red holds the plate that runs the fan
 *   5 SEESAW LIFT red's weight raises blue to the top shelf
 *   6 BALLAST     one red is not heavy enough to lift blue: two are
 *
 * Conventions as World 1. Fans push with the same force on every ball, so
 * the acceleration is strength / density: blue (0.5) feels double, red (3)
 * a third. Gravity pulls blue at 15.6, yellow 26, red 35 m/s^2. */
import type { LevelDef } from '../../entities/types.ts';

export const FLOAT: LevelDef = {
  id: 'w3-float',
  name: 'FLOAT',
  hint: 'Blue is light as air. The fan lifts it',
  balls: [{ colour: 'blue', x: 150, y: 698 }],
  targets: [{ colour: 'blue', x: 890, y: 575 }],
  rails: [
    { pts: [[40, 760], [700, 760]] },
    { pts: [[700, 790], [700, 560], [756, 560]] }
  ],
  fans: [{ x: 500, y: 240, w: 182, h: 520, dir: [0, -1], strength: 18 }],
  solution: [[0, 1], [6, 0]]
};

export const UPDRAFT: LevelDef = {
  id: 'w3-updraft',
  name: 'UPDRAFT',
  hint: 'One tilt. The air sorts them out',
  balls: [{ colour: 'blue', x: 150, y: 698 }, { colour: 'red', x: 260, y: 698 }],
  targets: [{ colour: 'blue', x: 890, y: 435 }, { colour: 'red', x: 890, y: 775 }],
  rails: [
    { pts: [[40, 760], [756, 760]] },
    { pts: [[640, 420], [756, 420]] }
  ],
  fans: [{ x: 440, y: 240, w: 182, h: 520, dir: [0, -1], strength: 18 }],
  solution: [[0, 1], [6, 0]]
};

export const TIPPING: LevelDef = {
  id: 'w3-tipping',
  name: 'TIPPING',
  hint: 'A heavy plank. Only something heavier can tip it',
  balls: [{ colour: 'red', x: 150, y: 538 }],
  targets: [{ colour: 'red', x: 890, y: 655 }],
  rails: [
    { pts: [[40, 600], [300, 600]] },
    { pts: [[690, 640], [756, 640]] }
  ],
  seesaws: [{ pivot: [500, 600], half: 190, offset: -40, density: 1.5, limit: 16, angle: -16 }],
  solution: [[0, 1], [6, 0]]
};

export const FANSWITCH: LevelDef = {
  id: 'w3-fanswitch',
  name: 'FAN SWITCH',
  hint: 'The fan only runs while the plate is held down',
  balls: [{ colour: 'red', x: 270, y: 698 }, { colour: 'blue', x: 645, y: 698 }],
  targets: [{ colour: 'red', x: 110, y: 775 }, { colour: 'blue', x: 890, y: 435 }],
  rails: [
    { pts: [[244, 760], [300, 760], [420, 790], [470, 790], [486, 760], [496, 705], [530, 700], [570, 740], [600, 760], [712, 760]] },
    { pts: [[712, 790], [712, 420], [756, 420]] }
  ],
  switches: [{ id: 'p', a: [418, 768], b: [474, 768], minMass: 3 }],
  fans: [{ x: 576, y: 200, w: 136, h: 560, dir: [0, -1], strength: 18, by: ['p'] }],
  solution: [[0, 1], [5, -1], [9, 0]],
  traps: [[[0, -1], [3, 1], [8, 0]]]
};

export const LIFT: LevelDef = {
  id: 'w3-lift',
  name: 'SEESAW LIFT',
  hint: 'Use red as the weight that lifts blue',
  balls: [{ colour: 'red', x: 90, y: 438 }, { colour: 'blue', x: 650, y: 690 }],
  targets: [{ colour: 'red', x: 110, y: 895 }, { colour: 'blue', x: 880, y: 539 }],
  rails: [
    { pts: [[40, 500], [150, 500]] },
    { pts: [[322, 380], [322, 500]] },
    { pts: [[244, 880], [730, 880]] },
    { pts: [[746, 860], [746, 524]] }
  ],
  seesaws: [{ pivot: [404, 640], half: 250, offset: 60, density: 1.0, range: [-22, 20], angle: 20, posts: [-100, 214] }],
  solution: [[0, 1], [5, -1], [9, 0]]
};

export const BALLAST: LevelDef = {
  id: 'w3-ballast',
  name: 'BALLAST',
  hint: 'One red is not enough',
  balls: [{ colour: 'red', x: 90, y: 378 }, { colour: 'red', x: 90, y: 198 }, { colour: 'blue', x: 670, y: 700 }],
  targets: [{ colour: 'red', x: 230, y: 895 }, { colour: 'red', x: 498, y: 895 }, { colour: 'blue', x: 880, y: 539 }],
  rails: [
    { pts: [[40, 440], [140, 440]] },
    { pts: [[40, 260], [140, 260]] },
    { pts: [[300, 160], [300, 480]] },
    { pts: [[40, 880], [96, 880]] },
    { pts: [[632, 880], [730, 880]] },
    { pts: [[746, 860], [746, 524]] }
  ],
  seesaws: [{ pivot: [330, 640], half: 300, offset: 80, density: 1.5, range: [-22, 20], angle: 20, posts: [-40, 290] }],
  solution: [[0, 1], [6, -1], [8, 0.5], [12, 0]],
  traps: [[[0, 1], [6, 0]]]
};

export const WORLD3: LevelDef[] = [FLOAT, UPDRAFT, TIPPING, FANSWITCH, LIFT, BALLAST];
