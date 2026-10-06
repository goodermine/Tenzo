/* TILT LAB - the campaign: levels in order, grouped into worlds. */
import type { LevelDef } from '../entities/types.ts';
import { PROTO } from './data/proto.ts';
import { WORLD1 } from './data/world1.ts';

export interface World { name: string; levels: LevelDef[] }

export const WORLDS: World[] = [
  { name: 'WORLD 1 · TILT', levels: WORLD1 }
];

export const LEVELS: LevelDef[] = WORLDS.flatMap(w => w.levels);

/** The lab that plays itself behind the title screen. */
export const DEMO: LevelDef = PROTO;

export function levelIndex(id: string | null): number {
  const i = LEVELS.findIndex(l => l.id === id);
  return i < 0 ? 0 : i;
}
