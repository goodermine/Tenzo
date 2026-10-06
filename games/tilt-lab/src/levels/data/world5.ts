/* TILT LAB - World 5: MAGNETIC. Purple sticks to magnetic rails and is
 * pulled - or pushed - by magnets. Nothing else notices them.
 *
 * Conventions as World 1. A magnet pulls purple at full strength over the
 * inner half of its reach, fading to nothing at the edge; a magnetic rail
 * holds purple at 1.7 g, enough to hang from a ceiling and roll along it. */
import type { LevelDef } from '../../entities/types.ts';

export const CLING: LevelDef = {
  id: 'w5-cling',
  name: 'CLING',
  hint: 'Purple sticks to magnetic rails. Even upside down',
  balls: [{ colour: 'purple', x: 150, y: 698 }],
  targets: [{ colour: 'purple', x: 890, y: 775 }],
  rails: [
    { pts: [[40, 760], [400, 760]] },
    { pts: [[640, 760], [756, 760]] },
    { pts: [[300, 610], [700, 610]], magnetic: true }
  ],
  hazards: [{ x: 420, y: 780, w: 200, h: 220 }],
  solution: [[0, 1], [8, 0]]
};

export const MAGNET: LevelDef = {
  id: 'w5-magnet',
  name: 'MAGNET',
  hint: 'The plate runs the magnet for a moment. Trust it',
  balls: [{ colour: 'purple', x: 130, y: 638 }],
  targets: [{ colour: 'purple', x: 890, y: 715 }],
  rails: [
    { pts: [[40, 700], [380, 700]] },
    { pts: [[640, 700], [756, 700]] }
  ],
  hazards: [{ x: 400, y: 900, w: 220, h: 100 }],
  switches: [{ id: 'h', a: [290, 678], b: [370, 678], hold: 2 }],
  magnets: [{ x: 720, y: 560, r: 520, strength: 50, by: ['h'] }],
  solution: [[0, 1], [8, 0]]
};

export const WORLD5: LevelDef[] = [CLING, MAGNET];
