/* TILT LAB - World 7: FILTERS. Colour grates: a grate lets the colours it
 * is striped with fall (or roll) straight through, and stops the rest.
 * The same tilt now sends each colour its own way.
 *   1 FILTER       yellow drops through the grate; red rolls over it
 *   2 CROSSING     yellow and red swap sides; only red sinks through red
 *   3 LONG WAY     blue sinks through blue; red goes the long way round
 *   4 LADDER       eight moves down a ladder of grates
 *   5 TWO GRATES   red and blue grates: who goes first?
 *   6 SIEVE        keep red on top while yellow sifts down
 *
 * Labs 2-6 came out of a design search over towers of floors and grates
 * and were kept only where they pass the tier-2 bar.
 *
 * Conventions as World 1. From here on, every lab but a world's first must
 * pass the tier-2 bar in tools/solve.ts: it takes a real plan. */
import type { LevelDef } from '../../entities/types.ts';

export const FILTER: LevelDef = {
  id: 'w7-filter',
  par: 8.5,
  name: 'FILTER',
  hint: 'Yellow falls through a yellow grate. Red rolls right over it',
  balls: [{ colour: 'red', x: 150, y: 338 }, { colour: 'yellow', x: 280, y: 338 }],
  targets: [{ colour: 'red', x: 890, y: 415 }, { colour: 'yellow', x: 110, y: 895 }],
  rails: [
    { pts: [[40, 400], [380, 400]] },
    { pts: [[400, 400], [756, 400]], only: ['yellow'] },
    { pts: [[244, 880], [960, 880]] }
  ],
  solution: [[0, 1], [3, -1], [6, 0]],
  traps: [[[0, -1]], [[0, 1]]]
};

export const CROSSING: LevelDef = {
  id: 'w7-crossing',
  par: 17,
  name: 'CROSSING',
  hint: 'Yellow and red must swap sides. Only red sinks through red',
  balls: [{ colour: 'yellow', x: 194, y: 168 }, { colour: 'red', x: 317, y: 168 }],
  targets: [{ colour: 'yellow', x: 110, y: 895 }, { colour: 'red', x: 890, y: 895 }],
  rails: [
    { pts: [[40, 230], [420, 230]] },
    { pts: [[580, 230], [960, 230]] },
    { pts: [[40, 400], [220, 400]], only: ['yellow'] },
    { pts: [[380, 400], [960, 400]] },
    { pts: [[40, 570], [680, 570]], only: ['red'] },
    { pts: [[480, 740], [960, 740]], only: ['red'] },
    { pts: [[244, 880], [756, 880]] }
  ],
  solution: [[0, 1], [2.07, -1], [5.06, 1], [5.71, 0], [7.58, 1], [10.08, -1], [12.79, 0]],
  traps: [[[0, 1]], [[0, -1]]]
};

export const LONGWAY: LevelDef = {
  id: 'w7-longway',
  par: 16.5,
  name: 'LONG WAY',
  hint: 'Blue sinks through blue. Red has to go the long way round',
  balls: [{ colour: 'red', x: 396, y: 168 }, { colour: 'blue', x: 160, y: 168 }],
  targets: [{ colour: 'red', x: 110, y: 895 }, { colour: 'blue', x: 500, y: 895 }],
  rails: [
    { pts: [[40, 230], [680, 230]] },
    { pts: [[40, 400], [220, 400]], only: ['blue'] },
    { pts: [[380, 400], [960, 400]], only: ['blue'] },
    { pts: [[40, 570], [620, 570]], only: ['red'] },
    { pts: [[780, 570], [960, 570]] },
    { pts: [[40, 740], [440, 740]], only: ['blue'] },
    { pts: [[244, 880], [366, 880]] },
    { pts: [[634, 880], [960, 880]] }
  ],
  solution: [[0, 1], [2.34, 0], [2.98, 1], [5.16, -1], [7.75, 1], [10.31, -1], [12.58, 0]],
  traps: [[[0, 1]], [[0, -1]]]
};

export const LADDER: LevelDef = {
  id: 'w7-ladder',
  par: 15.5,
  name: 'LADDER',
  hint: 'Count the rungs: which ball drops through which?',
  balls: [{ colour: 'yellow', x: 108, y: 168 }, { colour: 'red', x: 412, y: 168 }],
  targets: [{ colour: 'yellow', x: 110, y: 895 }, { colour: 'red', x: 500, y: 895 }],
  rails: [
    { pts: [[40, 230], [520, 230]] },
    { pts: [[40, 400], [420, 400]] },
    { pts: [[580, 400], [960, 400]], only: ['yellow'] },
    { pts: [[40, 570], [440, 570]] },
    { pts: [[40, 740], [680, 740]], only: ['yellow'] },
    { pts: [[244, 880], [366, 880]] },
    { pts: [[634, 880], [960, 880]] }
  ],
  solution: [[0, 1], [0.75, -1], [1.29, 0], [2.48, -1], [4.47, 0], [6, 1], [8.9, -1], [10.93, 1], [12.45, 0]],
  traps: [[[0, 1]], [[0, -1]]]
};

export const TWOGRATES: LevelDef = {
  id: 'w7-twogrates',
  par: 15,
  name: 'TWO GRATES',
  hint: 'Red falls through red, blue through blue. Who goes first?',
  balls: [{ colour: 'red', x: 338, y: 168 }, { colour: 'blue', x: 136, y: 168 }],
  targets: [{ colour: 'red', x: 110, y: 895 }, { colour: 'blue', x: 500, y: 895 }],
  rails: [
    { pts: [[40, 230], [600, 230]] },
    { pts: [[40, 400], [440, 400]], only: ['red'] },
    { pts: [[40, 570], [420, 570]] },
    { pts: [[580, 570], [960, 570]] },
    { pts: [[40, 740], [420, 740]], only: ['blue'] },
    { pts: [[580, 740], [960, 740]] },
    { pts: [[244, 880], [366, 880]] },
    { pts: [[634, 880], [960, 880]] }
  ],
  solution: [[0, 1], [2.02, 0], [4.38, 1], [7.04, -1], [9.27, 1], [9.99, -1], [12.88, 1], [15.67, 0]],
  traps: [[[0, 1]], [[0, -1]]]
};

export const SIEVE: LevelDef = {
  id: 'w7-sieve',
  par: 16,
  name: 'SIEVE',
  hint: 'Yellow slips through every yellow grate. Keep red on top until it is time',
  balls: [{ colour: 'yellow', x: 219, y: 168 }, { colour: 'red', x: 353, y: 168 }],
  targets: [{ colour: 'yellow', x: 500, y: 895 }, { colour: 'red', x: 110, y: 895 }],
  rails: [
    { pts: [[40, 230], [440, 230]] },
    { pts: [[40, 400], [680, 400]], only: ['yellow'] },
    { pts: [[40, 570], [420, 570]], only: ['yellow'] },
    { pts: [[580, 570], [960, 570]] },
    { pts: [[40, 740], [680, 740]] },
    { pts: [[244, 880], [366, 880]] },
    { pts: [[634, 880], [960, 880]] }
  ],
  solution: [[0, 1], [1.61, -1], [4.33, 1], [6.73, 0], [9.09, -1], [11.99, 0], [13.47, -1], [15.91, 0], [18.35, 0]],
  traps: [[[0, 1]], [[0, -1]]]
};

export const WORLD7: LevelDef[] = [FILTER, CROSSING, LONGWAY, LADDER, TWOGRATES, SIEVE];
