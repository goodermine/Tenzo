/* TILT LAB - World 7: FILTERS. Colour grates: a grate lets the colours it
 * is striped with fall (or roll) straight through, and stops the rest.
 * The same tilt now sends each colour its own way.
 *   1 FILTER       yellow drops through the grate; red rolls over it
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

export const WORLD7: LevelDef[] = [FILTER];
