/* TILT LAB - World 3: WEIGHT. Blue is light, red is heavy, and the lab
 * starts to care.
 *   1 FLOAT       blue rides a fan's updraft over a wall
 *   2 UPDRAFT     red rolls under the fan, blue rides it up: turn at the top
 *   3 TIPPING     a steep plank: only a run-up gets red over it
 *   4 FAN SWITCH  red in its cup runs the fan; blue has to wait for it
 *   5 SEESAW LIFT send red across the top to drop onto the see-saw
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
  hint: 'Red rolls under the fan. Blue rides it up: turn back at the top',
  balls: [{ colour: 'red', x: 200, y: 818 }, { colour: 'blue', x: 290, y: 818 }],
  targets: [{ colour: 'blue', x: 110, y: 655 }, { colour: 'red', x: 890, y: 895 }],
  rails: [
    { pts: [[130, 880], [756, 880]] },
    { pts: [[244, 640], [390, 640], [390, 730]] },
    { pts: [[570, 730], [570, 640], [760, 640]] }
  ],
  fans: [{ x: 408, y: 600, w: 144, h: 280, dir: [0, -1], strength: 18 }],
  hazards: [{ x: 780, y: 660, w: 180, h: 60 }, { x: 40, y: 900, w: 80, h: 100 }],
  solution: [[0, 1], [2.65, -1], [9, 0]],
  traps: [[[0, 1]], [[0, -1]]]
};

export const TIPPING: LevelDef = {
  id: 'w3-tipping',
  name: 'TIPPING',
  hint: 'Too steep to roll up. Back away for a run-up, but not too far',
  balls: [{ colour: 'red', x: 370, y: 538 }],
  targets: [{ colour: 'red', x: 890, y: 655 }],
  rails: [
    { pts: [[130, 600], [400, 600]] },
    { pts: [[700, 640], [756, 640]] }
  ],
  seesaws: [{ pivot: [560, 600], half: 170, offset: -50, density: 1.5, limit: 30, angle: -30 }],
  hazards: [{ x: 40, y: 900, w: 80, h: 100 }, { x: 420, y: 900, w: 280, h: 100 }],
  solution: [[0, -1], [0.5, 1], [8, 0]],
  traps: [[[0, 1]], [[0, -1], [2, 1]]]
};

export const FANSWITCH: LevelDef = {
  id: 'w3-fanswitch',
  name: 'FAN SWITCH',
  hint: 'Red in its cup runs the fan. Blue must wait for it',
  balls: [{ colour: 'red', x: 470, y: 698 }, { colour: 'blue', x: 370, y: 698 }],
  targets: [{ colour: 'blue', x: 450, y: 495 }, { colour: 'red', x: 600, y: 775 }],
  rails: [
    { pts: [[230, 760], [466, 760]] },
    { pts: [[734, 760], [800, 760]] },
    { pts: [[210, 620], [210, 480], [316, 480]] },
    { pts: [[584, 480], [620, 480]] }
  ],
  switches: [{ id: 'p', a: [570, 840], b: [630, 840], minMass: 3 }],
  fans: [{ x: 40, y: 340, w: 160, h: 600, dir: [0, -1], strength: 20, by: ['p'] }],
  hazards: [{ x: 40, y: 900, w: 160, h: 100 }, { x: 820, y: 900, w: 140, h: 100 }],
  solution: [[0, 1], [0.8, -1], [3.3, 1], [5.4, 0]],
  traps: [[[0, -1]], [[0, 1]], [[0, 1], [2, -1]]]
};

export const LIFT: LevelDef = {
  id: 'w3-lift',
  name: 'SEESAW LIFT',
  hint: 'Send red over to be the weight. Blue is waiting for its ride',
  balls: [{ colour: 'red', x: 820, y: 238 }, { colour: 'blue', x: 650, y: 690 }],
  targets: [{ colour: 'red', x: 110, y: 895 }, { colour: 'blue', x: 880, y: 539 }],
  rails: [
    { pts: [[300, 300], [960, 300]] },
    { pts: [[150, 180], [150, 560]] },
    { pts: [[244, 880], [730, 880]] },
    { pts: [[746, 860], [746, 524]] }
  ],
  seesaws: [{ pivot: [404, 640], half: 250, offset: 60, density: 1.0, range: [-22, 20], angle: 20, posts: [-100, 214] }],
  solution: [[0, -1], [1.6, 1], [4.2, 0]],
  traps: [[[0, -1]], [[0, 1]]]
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
