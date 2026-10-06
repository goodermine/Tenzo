/* TILT LAB - World 6: MASTER LAB. Platforms that move, lifts that answer
 * to switches, and everything from the worlds before.
 *   1 SHUTTLE      a platform ferries you over a pit: board, ride, step off
 *   2 LIFT         red in its cup sends the lift up; yellow must be aboard
 *   3 CALL         a plate calls the lift down; wait for it, then ride up
 *   4 UP AND OVER  the lift carries purple up to a magnetic ceiling
 *   5 LAUNCH LIFT  a fast lift throws yellow; steer it onto the high ledge
 *   6 FINALE       lift, shuttle and red's counterweight, in one run
 *
 * Conventions as World 1. A platform with a `period` shuttles on its own;
 * one with `by` moves while its switch is on (`invert`: while it is off).
 * A ball riding a lift leaves it at the lift's speed when it stops. */
import type { LevelDef } from '../../entities/types.ts';

export const SHUTTLE: LevelDef = {
  id: 'w6-shuttle',
  name: 'SHUTTLE',
  hint: 'Board when it docks. Keep level while it carries you',
  balls: [{ colour: 'yellow', x: 150, y: 538 }],
  targets: [{ colour: 'yellow', x: 890, y: 615 }],
  rails: [
    { pts: [[40, 600], [300, 600]] },
    { pts: [[720, 600], [756, 600]] }
  ],
  gates: [{ a: [322, 600], b: [462, 600], r: 18, slide: [236, 0], period: 6, phase: 0.5, platform: true }],
  hazards: [{ x: 40, y: 900, w: 920, h: 100 }],
  solution: [[0, 1], [1.2, 0], [3, 1], [5.8, -1], [6.3, 0]]
};

export const LIFT: LevelDef = {
  id: 'w6-lift',
  name: 'LIFT',
  hint: 'Red in its cup sends the lift up. Make sure yellow is on it',
  balls: [{ colour: 'red', x: 90, y: 818 }, { colour: 'yellow', x: 490, y: 818 }],
  targets: [{ colour: 'red', x: 300, y: 895 }, { colour: 'yellow', x: 890, y: 455 }],
  rails: [
    { pts: [[40, 880], [166, 880]] },
    { pts: [[434, 880], [540, 880]] },
    { pts: [[742, 440], [756, 440]] }
  ],
  switches: [{ id: 'p', a: [270, 958], b: [330, 958], minMass: 3 }],
  gates: [{ a: [562, 880], b: [680, 880], r: 18, slide: [0, -440], by: ['p'], platform: true, speed: 0.7 }],
  hazards: [{ x: 560, y: 920, w: 400, h: 80 }],
  solution: [[0, 1], [0.6, 0], [3.4, 1], [4.6, 0]],
  traps: [[[0, 1]], [[0, 0.5]]]
};

export const CALL: LevelDef = {
  id: 'w6-call',
  name: 'CALL',
  hint: 'The plate calls the lift down. Wait for it, then ride up',
  balls: [{ colour: 'yellow', x: 150, y: 818 }],
  targets: [{ colour: 'yellow', x: 890, y: 455 }],
  rails: [
    { pts: [[40, 880], [520, 880]] },
    { pts: [[712, 900], [712, 466], [756, 466], [756, 440]] }
  ],
  switches: [{ id: 'h', a: [360, 870], b: [420, 870], hold: 1.5 }],
  gates: [{ a: [542, 880], b: [690, 880], r: 18, slide: [0, -440], by: ['h'], invert: true, platform: true, speed: 0.5 }],
  hazards: [{ x: 540, y: 920, w: 420, h: 80 }],
  solution: [[0, 1], [1.3, -1], [2.8, 1], [4.6, 0], [6, 1], [8.7, -1], [9.6, 0]],
  traps: [[[0, 1]], [[0, 1], [3, 0]]]
};

export const UPANDOVER: LevelDef = {
  id: 'w6-upandover',
  name: 'UP AND OVER',
  hint: 'Red sends the lift up. At the top, purple has a ceiling to hang from',
  balls: [{ colour: 'red', x: 910, y: 818 }, { colour: 'purple', x: 510, y: 818 }],
  targets: [{ colour: 'red', x: 700, y: 895 }, { colour: 'purple', x: 890, y: 400 }],
  rails: [
    { pts: [[834, 880], [960, 880]] },
    { pts: [[460, 880], [566, 880]] },
    { pts: [[240, 250], [800, 250]], magnetic: true }
  ],
  switches: [{ id: 'p', a: [670, 958], b: [730, 958], minMass: 3 }],
  gates: [{ a: [320, 880], b: [438, 880], r: 18, slide: [0, -480], by: ['p'], platform: true, speed: 0.6 }],
  hazards: [{ x: 40, y: 920, w: 400, h: 80 }],
  solution: [[0, -1], [0.6, 0], [3.5, 1], [9, 0]],
  traps: [[[0, -1]], [[0, -1], [3.5, -1]]]
};

export const LAUNCHLIFT: LevelDef = {
  id: 'w6-launchlift',
  name: 'LAUNCH LIFT',
  hint: 'This lift is fast. It will throw you: be steering when it does',
  balls: [{ colour: 'red', x: 90, y: 818 }, { colour: 'yellow', x: 490, y: 818 }],
  targets: [{ colour: 'red', x: 300, y: 895 }, { colour: 'yellow', x: 110, y: 315 }],
  rails: [
    { pts: [[40, 880], [166, 880]] },
    { pts: [[434, 880], [540, 880]] },
    { pts: [[244, 300], [460, 300]] }
  ],
  switches: [{ id: 'p', a: [270, 958], b: [330, 958], minMass: 3 }],
  gates: [{ a: [562, 880], b: [680, 880], r: 18, slide: [0, -400], by: ['p'], platform: true, speed: 2.2 }],
  hazards: [{ x: 560, y: 920, w: 400, h: 80 }],
  solution: [[0, 1], [0.6, 0], [1.9, -1], [4.2, 0]],
  traps: [[[0, 1]], [[0, 1], [0.6, 0]]]
};

export const FINALE: LevelDef = {
  id: 'w6-finale',
  name: 'FINALE',
  hint: 'Up, across, home. Everything you have learned, in one run',
  balls: [{ colour: 'red', x: 90, y: 818 }, { colour: 'yellow', x: 490, y: 818 }],
  targets: [{ colour: 'red', x: 300, y: 895 }, { colour: 'yellow', x: 110, y: 255 }],
  rails: [
    { pts: [[40, 880], [166, 880]] },
    { pts: [[434, 880], [540, 880]] },
    { pts: [[244, 240], [330, 240]] }
  ],
  switches: [{ id: 'p', a: [270, 958], b: [330, 958], minMass: 3 }],
  gates: [
    { a: [562, 880], b: [680, 880], r: 18, slide: [0, -640], by: ['p'], platform: true, speed: 0.6 },
    { a: [350, 240], b: [450, 240], r: 18, slide: [100, 0], period: 6, platform: true }
  ],
  hazards: [{ x: 560, y: 920, w: 400, h: 80 }],
  solution: [[0, 1], [0.6, 0], [3.3, -1], [5.4, 0], [9, 0]],
  traps: [[[0, 1]], [[0, -1]]]
};

export const WORLD6: LevelDef[] = [SHUTTLE, LIFT, CALL, UPANDOVER, LAUNCHLIFT, FINALE];
