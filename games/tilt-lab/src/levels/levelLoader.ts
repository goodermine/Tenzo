/* TILT LAB - the campaign: six worlds of six labs, each world teaching one
   new idea. Levels are data (src/levels/data/); this file only orders
   them. */
import type { LevelDef, Colour } from '../entities/types.ts';
import { PROTO } from './data/proto.ts';
import { WORLD1 } from './data/world1.ts';
import { WORLD2 } from './data/world2.ts';
import { WORLD3 } from './data/world3.ts';
import { WORLD4 } from './data/world4.ts';
import { WORLD5 } from './data/world5.ts';
import { WORLD6 } from './data/world6.ts';

export interface World {
  name: string;
  /** shown the first time you enter the world */
  intro: { title: string; text: string; balls: Colour[] };
  levels: LevelDef[];
}

export const WORLDS: World[] = [
  {
    name: 'TILT',
    intro: { title: 'TILT', text: 'Tilt the lab and every ball rolls. Get each one into the cup of its colour.', balls: ['yellow', 'red'] },
    levels: WORLD1
  },
  {
    name: 'GATES',
    intro: { title: 'GATES', text: 'Switches that flip, doors on a timer, barriers that only let you through one way.', balls: ['yellow', 'yellow'] },
    levels: WORLD2
  },
  {
    name: 'WEIGHT',
    intro: { title: 'WEIGHT', text: 'Meet BLUE: light as air. Fans lift it high, while heavy red barely notices.', balls: ['blue', 'red'] },
    levels: WORLD3
  },
  {
    name: 'BOUNCE',
    intro: { title: 'BOUNCE', text: 'Meet GREEN: it bounces. Springs throw any ball, and lime rails make everything spring back.', balls: ['green', 'yellow'] },
    levels: WORLD4
  },
  {
    name: 'MAGNETIC',
    intro: { title: 'MAGNETIC', text: 'Meet PURPLE: it clings to magnetic rails, even upside down, and magnets pull it through the air.', balls: ['purple', 'yellow'] },
    levels: WORLD5
  },
  {
    name: 'MASTER LAB',
    intro: { title: 'MASTER LAB', text: 'Platforms that ferry, lifts that answer to switches, and everything you have learned so far.', balls: ['red', 'yellow', 'purple'] },
    levels: WORLD6
  }
];

export const LEVELS: LevelDef[] = WORLDS.flatMap(w => w.levels);

/** World and level-within-world (both from 0) of a campaign index. */
export function place(i: number): { w: number; n: number } {
  let k = i;
  for (let w = 0; w < WORLDS.length; w++) {
    if (k < WORLDS[w].levels.length) return { w, n: k };
    k -= WORLDS[w].levels.length;
  }
  return { w: WORLDS.length - 1, n: 0 };
}

/** Campaign index of a world's first level. */
export function firstOf(w: number): number {
  let k = 0;
  for (let i = 0; i < w; i++) k += WORLDS[i].levels.length;
  return k;
}

export function levelIndex(id: string | null): number {
  const i = LEVELS.findIndex(l => l.id === id);
  return i < 0 ? 0 : i;
}

/** The lab that plays itself behind the title screen. */
export const DEMO: LevelDef = PROTO;
