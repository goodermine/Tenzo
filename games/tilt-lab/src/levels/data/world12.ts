/* TILT LAB - World 12: GRAND LAB. Everything at once: grates, crumbling
 * floors, pits, plates and machines, mixed. The hardest labs in the
 * building.
 *   1 GRAND TOUR      one last warm-up: grates sort yellow from blue
 *   2 SINKING FEELING blue drops through blue, red stays up top
 *   3 COLLAPSE        three cracked floors, two balls
 *   4 PITFALL         cracked floors above, a pit below
 *   5 CROSSROADS      grates sort them, cracked floors close behind
 *   6 GRAND FINALE    four balls, one way down: every cup in the right order
 *
 * Conventions as World 1. Labs 1-5 came out of the design search; the
 * finale is built by hand around cups that must fill in order. 2-6 pass
 * the tier-2 bar. */
import type { LevelDef } from '../../entities/types.ts';

export const GRANDTOUR: LevelDef = {
  id: 'w12-grandtour',
  par: 12.5,
  name: 'GRAND TOUR',
  hint: 'Yellow sinks through yellow grates; blue rolls over them. One last warm-up',
  balls: [{ colour: 'yellow', x: 213, y: 168 }, { colour: 'blue', x: 330, y: 168 }],
  targets: [{ colour: 'yellow', x: 890, y: 895 }, { colour: 'blue', x: 500, y: 895 }],
  rails: [
    { pts: [[40, 230], [440, 230]] },
    { pts: [[560, 400], [960, 400]], only: ['yellow'] },
    { pts: [[40, 570], [420, 570]], only: ['yellow'] },
    { pts: [[580, 570], [960, 570]], only: ['yellow'] },
    { pts: [[40, 740], [520, 740]], only: ['yellow'] },
    { pts: [[40, 880], [366, 880]] },
    { pts: [[634, 880], [756, 880]] }
  ],
  solution: [[0, 1], [1.12, 0], [3.25, -1], [5.34, 1], [7.53, 0], [8.92, -1], [9.93, 1], [11.57, 0]],
  traps: [[[0, 1]], [[0, -1]]]
};

export const SINKING: LevelDef = {
  id: 'w12-sinking',
  par: 15.5,
  name: 'SINKING FEELING',
  hint: 'Blue drops through blue; red stays up top. Who needs to be where, and when?',
  balls: [{ colour: 'red', x: 138, y: 168 }, { colour: 'blue', x: 356, y: 168 }],
  targets: [{ colour: 'red', x: 890, y: 895 }, { colour: 'blue', x: 500, y: 895 }],
  rails: [
    { pts: [[40, 230], [440, 230]] },
    { pts: [[40, 400], [440, 400]], only: ['blue'] },
    { pts: [[40, 570], [220, 570]] },
    { pts: [[380, 570], [960, 570]] },
    { pts: [[40, 740], [440, 740]] },
    { pts: [[40, 880], [366, 880]] },
    { pts: [[634, 880], [756, 880]] }
  ],
  solution: [[0, 1], [2.95, -1], [6.12, 1], [7.25, 0], [9.08, 1], [10.38, 0], [12.27, 0]],
  traps: [[[0, 1]], [[0, -1]]]
};

export const COLLAPSE: LevelDef = {
  id: 'w12-collapse',
  par: 18.5,
  name: 'COLLAPSE',
  hint: 'Three cracked floors and two balls. Every crossing counts',
  balls: [{ colour: 'red', x: 542, y: 168 }, { colour: 'blue', x: 841, y: 168 }],
  targets: [{ colour: 'red', x: 110, y: 895 }, { colour: 'blue', x: 500, y: 895 }],
  rails: [
    { pts: [[320, 230], [960, 230]] },
    { pts: [[40, 400], [620, 400]] },
    { pts: [[780, 400], [960, 400]] },
    { pts: [[40, 570], [620, 570]], crumble: true },
    { pts: [[780, 570], [960, 570]] },
    { pts: [[480, 740], [960, 740]], crumble: true },
    { pts: [[244, 880], [366, 880]] },
    { pts: [[634, 880], [960, 880]] }
  ],
  solution: [[0, -1], [2.9, 1], [3.95, 0], [6.26, -1], [7.91, 0], [8.82, 1], [11.75, 1], [12.75, 1], [13.75, -1], [15.23, 0]],
  traps: [[[0, 1]], [[0, -1]]]
};


export const PITFALL: LevelDef = {
  id: 'w12-pitfall',
  par: 16,
  name: 'PITFALL',
  hint: 'Cracked floors above, a pit below. Leave each floor at the right moment',
  balls: [{ colour: 'yellow', x: 130, y: 168 }, { colour: 'red', x: 332, y: 168 }],
  targets: [{ colour: 'yellow', x: 110, y: 895 }, { colour: 'red', x: 500, y: 895 }],
  rails: [
    { pts: [[40, 230], [420, 230]] },
    { pts: [[580, 230], [960, 230]] },
    { pts: [[320, 400], [960, 400]], crumble: true },
    { pts: [[40, 570], [420, 570]] },
    { pts: [[580, 570], [960, 570]] },
    { pts: [[40, 740], [600, 740]], crumble: true },
    { pts: [[244, 880], [366, 880]] }
  ],
  hazards: [{ x: 654, y: 900, w: 286, h: 100 }],
  solution: [[0, 1], [1.02, 0], [2.76, -1], [5.14, 0], [7.67, 1], [10.21, 0], [11.11, -1], [12.36, 0], [12.95, 0]],
  traps: [[[0, 1]], [[0, -1]]]
};

export const CROSSROADS: LevelDef = {
  id: 'w12-crossroads',
  par: 13,
  name: 'CROSSROADS',
  hint: 'Grates sort them, cracked floors close behind them. Choose each route once',
  balls: [{ colour: 'yellow', x: 245, y: 168 }, { colour: 'red', x: 125, y: 168 }],
  targets: [{ colour: 'yellow', x: 110, y: 895 }, { colour: 'red', x: 500, y: 895 }],
  rails: [
    { pts: [[40, 230], [420, 230]] },
    { pts: [[580, 230], [960, 230]] },
    { pts: [[320, 400], [960, 400]], only: ['red'] },
    { pts: [[40, 570], [520, 570]], only: ['red'] },
    { pts: [[40, 740], [600, 740]], crumble: true },
    { pts: [[244, 880], [366, 880]] },
    { pts: [[634, 880], [960, 880]] }
  ],
  solution: [[0, 1], [2.8, -1], [4.85, 1], [7.23, -1], [9.95, 1], [11.11, -1], [11.87, 0], [13.19, -1], [14.55, 0]],
  traps: [[[0, 1]], [[0, -1]]]
};

export const GRANDFINALE: LevelDef = {
  id: 'w12-finale4',
  par: 31,
  name: 'GRAND FINALE',
  hint: 'Four balls, one way down. An empty cup catches anyone; a full one is a bridge. Who goes first?',
  balls: [{ colour: 'yellow', x: 100, y: 318 }, { colour: 'red', x: 210, y: 318 }, { colour: 'orange', x: 590, y: 138 }, { colour: 'blue', x: 860, y: 138 }],
  targets: [{ colour: 'orange', x: 500, y: 575 }, { colour: 'yellow', x: 320, y: 895 }, { colour: 'blue', x: 625, y: 895 }, { colour: 'red', x: 890, y: 895 }],
  rails: [
    { pts: [[530, 200], [960, 200]] },
    { pts: [[40, 380], [340, 380]] },
    { pts: [[250, 560], [366, 560]] },
    { pts: [[634, 560], [960, 560]] },
    { pts: [[40, 880], [186, 880]] },
    { pts: [[454, 880], [491, 880]] }
  ],
  solution: [[0, -1], [1.6, 1], [6, -1], [9.6, 1], [12.6, -1], [20, 1]],
  traps: [[[0, 1]], [[0, -1]]]
};

export const WORLD12: LevelDef[] = [GRANDTOUR, SINKING, COLLAPSE, PITFALL, CROSSROADS, GRANDFINALE];
