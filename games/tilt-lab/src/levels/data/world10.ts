/* TILT LAB - World 10: ORDER. Three balls, three cups, and one way down:
 * a ball takes the first cup it reaches, so who goes first decides
 * everything.
 *
 * Conventions as World 1. Labs here came out of the design search and
 * pass the tier-2 bar. */
import type { LevelDef } from '../../entities/types.ts';

export const QUEUE: LevelDef = {
  id: 'w10-queue',
  name: 'QUEUE',
  hint: 'A ball drops into the first cup it reaches. Send them down in the right order',
  balls: [{ colour: 'yellow', x: 783, y: 168 }, { colour: 'red', x: 564, y: 168 }, { colour: 'blue', x: 640, y: 338 }],
  targets: [{ colour: 'yellow', x: 110, y: 895 }, { colour: 'red', x: 500, y: 895 }, { colour: 'blue', x: 890, y: 895 }],
  rails: [
    { pts: [[480, 230], [960, 230]] },
    { pts: [[320, 400], [960, 400]] },
    { pts: [[320, 570], [960, 570]], only: ['red'] },
    { pts: [[320, 740], [960, 740]], only: ['red'] },
    { pts: [[244, 880], [366, 880]] },
    { pts: [[634, 880], [756, 880]] }
  ],
  solution: [[0, -1], [0.79, 1], [3.6, -1], [5.78, -1], [8.05, 0], [9.85, 1], [14.97, 1], [15.98, 0]],
  traps: [[[0, 1]], [[0, -1]]]
};

export const WORLD10: LevelDef[] = [QUEUE];
