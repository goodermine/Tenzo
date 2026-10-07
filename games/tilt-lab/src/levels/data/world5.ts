/* TILT LAB - World 5: MAGNETIC. Purple sticks to magnetic rails and is
 * pulled - or pushed - by magnets. Nothing else notices them.
 *
 *   1 CLING     a magnetic ceiling carries purple over a pit, upside down
 *   2 MAGNET    a timed magnet catches purple over a gap: be there in time
 *   3 REPEL     a field purple cannot pass, until yellow works the timer
 *   4 PULL      yellow wakes a magnet that lifts purple up a tube; lean
 *               the right way as it lets go
 *   5 STICKY    one spring throw up to a magnetic ceiling, then turn back
 *   6 HANDOFF   one plate drops purple, the next magnet catches it
 *
 * Conventions as World 1. A magnet pulls purple at full strength over the
 * inner half of its reach, fading to nothing at the edge, and grabs it once
 * it touches the core; a magnetic rail holds purple at 1.7 g, enough to
 * hang from a ceiling and roll along it, and lets go past either end. */
import type { LevelDef } from '../../entities/types.ts';

export const CLING: LevelDef = {
  id: 'w5-cling',
  par: 5,
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
  par: 8.5,
  name: 'MAGNET',
  hint: 'The plate runs the magnet for a moment. Be over the gap when it catches',
  balls: [{ colour: 'purple', x: 700, y: 698 }],
  targets: [{ colour: 'purple', x: 110, y: 775 }],
  rails: [
    { pts: [[244, 760], [480, 760]] },
    { pts: [[660, 760], [820, 760]] }
  ],
  switches: [{ id: 'h', a: [740, 750], b: [800, 750], hold: 2 }],
  magnets: [{ x: 510, y: 600, r: 170, strength: 80, by: ['h'] }],
  hazards: [{ x: 500, y: 900, w: 160, h: 100 }, { x: 840, y: 900, w: 120, h: 100 }],
  solution: [[0, 1], [0.75, -1], [10, 0]],
  traps: [[[0, -1]], [[0, 1]]]
};

export const REPEL: LevelDef = {
  id: 'w5-repel',
  par: 10.5,
  name: 'REPEL',
  hint: 'The field turns purple back. Yellow can switch it off, for a moment',
  balls: [{ colour: 'yellow', x: 420, y: 318 }, { colour: 'purple', x: 180, y: 698 }],
  targets: [{ colour: 'yellow', x: 890, y: 395 }, { colour: 'purple', x: 890, y: 775 }],
  rails: [
    { pts: [[40, 380], [756, 380]] },
    { pts: [[130, 760], [756, 760]] },
    { pts: [[250, 640], [250, 738]], r: 14, oneWay: [1, 0] }
  ],
  switches: [{ id: 'h', a: [26, 270], b: [26, 350], hold: 2 }],
  magnets: [{ x: 620, y: 760, r: 200, strength: 60, repel: true, by: ['h'], invert: true }],
  hazards: [{ x: 40, y: 900, w: 80, h: 100 }],
  solution: [[0, 1], [0.9, -1], [4, 1], [12, 0]],
  traps: [[[0, 1]], [[0, -1], [3, 1]]]
};

export const PULL: LevelDef = {
  id: 'w5-pull',
  par: 6.5,
  name: 'PULL',
  hint: 'Yellow wakes the magnet. Lean the right way when it lets go',
  balls: [{ colour: 'purple', x: 600, y: 818 }, { colour: 'yellow', x: 400, y: 818 }],
  targets: [{ colour: 'purple', x: 890, y: 485 }, { colour: 'yellow', x: 110, y: 895 }],
  rails: [
    { pts: [[528, 260], [528, 880], [672, 880], [672, 470], [756, 470]] },
    { pts: [[244, 880], [420, 880]] }
  ],
  switches: [{ id: 'h', a: [300, 870], b: [360, 870], hold: 1.2 }],
  magnets: [{ x: 710, y: 320, r: 600, strength: 100, by: ['h'] }],
  hazards: [{ x: 440, y: 900, w: 80, h: 100 }],
  solution: [[0, -1], [1.9, 1], [10, 0]],
  traps: [[[0, 1]], [[0, -1]]]
};

export const STICKY: LevelDef = {
  id: 'w5-sticky',
  par: 5.5,
  name: 'STICKY',
  hint: 'One throw up to the magnetic ceiling. Then hang on and turn back',
  balls: [{ colour: 'purple', x: 200, y: 818 }],
  targets: [{ colour: 'purple', x: 110, y: 455 }],
  rails: [
    { pts: [[150, 880], [390, 880]] },
    { pts: [[200, 300], [580, 300]], magnetic: true }
  ],
  springs: [{ a: [400, 868], b: [500, 868], power: 1250, once: true }],
  hazards: [{ x: 40, y: 900, w: 100, h: 100 }, { x: 520, y: 900, w: 440, h: 100 }],
  solution: [[0, 1], [1.4, -1], [10, 0]],
  traps: [[[0, 1]], [[0, -1]]]
};

export const HANDOFF: LevelDef = {
  id: 'w5-handoff',
  par: 13,
  name: 'HANDOFF',
  hint: 'One plate lets go, the next one catches. Then turn yellow home',
  balls: [{ colour: 'purple', x: 360, y: 374 }, { colour: 'yellow', x: 330, y: 698 }],
  targets: [{ colour: 'purple', x: 560, y: 480 }, { colour: 'yellow', x: 110, y: 775 }],
  rails: [
    { pts: [[244, 760], [640, 760]] },
    { pts: [[360, 465], [426, 465]] },
    { pts: [[694, 465], [720, 465]] }
  ],
  switches: [{ id: 'a', a: [400, 750], b: [450, 750], latch: true }, { id: 'h', a: [480, 750], b: [530, 750], hold: 2 }],
  magnets: [
    { x: 360, y: 300, r: 300, strength: 60, by: ['a'], invert: true },
    { x: 560, y: 300, r: 300, strength: 60, by: ['h'] }
  ],
  hazards: [{ x: 660, y: 900, w: 300, h: 100 }],
  solution: [[0, 1], [1.2, -1], [10, 0]],
  traps: [[[0, 1]], [[0, -1]]]
};

export const WORLD5: LevelDef[] = [CLING, MAGNET, REPEL, PULL, STICKY, HANDOFF];
