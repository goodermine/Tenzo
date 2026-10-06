/* TILT LAB - the prototype chamber: one ball, one cup, a few smooth
   platforms. The first thing to feel right. */
import type { LevelDef } from '../../entities/types.ts';

export const PROTO: LevelDef = {
  id: 'proto',
  name: 'PROTOTYPE',
  hint: 'Roll the yellow ball into its cup',
  balls: [{ colour: 'yellow', x: 150, y: 196 }],
  targets: [{ colour: 'yellow', x: 300, y: 924 }],
  rails: [
    { pts: [[70, 260], [420, 260]] },
    { pts: [[540, 420], [700, 490], [850, 440]], smooth: true },
    { pts: [[860, 660], [700, 700], [460, 730]], smooth: true },
    { pts: [[30, 890], [210, 890]] },
    { pts: [[390, 890], [970, 890]] }
  ],
  solution: [[0, 1], [1.6, 0.5], [3.2, 1], [4.6, -1], [7.5, 0]]
};
