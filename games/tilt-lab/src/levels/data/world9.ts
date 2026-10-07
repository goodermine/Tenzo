/* TILT LAB - World 9: CRUMBLE. Cracked floors hold while a ball is on
 * them; once one has been used and is left empty, it falls away. Every
 * route can be crossed once - by everyone who needs it, together.
 *   1 CRUMBLE      yellow crosses; the fallen bridge drops blue home
 *
 * Conventions as World 1. */
import type { LevelDef } from '../../entities/types.ts';

export const CRUMBLE: LevelDef = {
  id: 'w9-crumble',
  name: 'CRUMBLE',
  hint: 'Yellow crosses first. Once it is off, the bridge falls - and leaves a hole',
  balls: [{ colour: 'yellow', x: 300, y: 338 }, { colour: 'blue', x: 100, y: 338 }],
  targets: [{ colour: 'yellow', x: 890, y: 415 }, { colour: 'blue', x: 500, y: 895 }],
  rails: [
    { pts: [[40, 400], [360, 400]] },
    { pts: [[380, 400], [620, 400]], crumble: true },
    { pts: [[640, 400], [756, 400]] },
    { pts: [[40, 880], [366, 880]] },
    { pts: [[634, 880], [960, 880]] }
  ],
  solution: [[0, 1], [4.6, -1], [7.5, 0]],
  traps: [[[0, 1], [1.2, 0]], [[0, -1]]]
};

export const WORLD9: LevelDef[] = [CRUMBLE];
