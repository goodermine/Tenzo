/* TILT LAB - a solver worker: runs batches of plans against one level,
   a campaign level (by index), one exported from a file, or a level
   passed whole. */
import { parentPort } from 'node:worker_threads';
import { LEVELS } from '../src/levels/levelLoader.ts';
import { run } from './plans.ts';
import type { LevelDef, Solution } from '../src/entities/types.ts';

const files = new Map<string, Record<string, LevelDef>>();
parentPort!.on('message', async (job: { id: number; level: number | { file: string; name: string } | LevelDef; plans: Solution[]; limit: number }) => {
  let def: LevelDef;
  if (typeof job.level === 'number') def = LEVELS[job.level];
  else if ('balls' in job.level) def = job.level;
  else {
    if (!files.has(job.level.file)) files.set(job.level.file, await import(job.level.file));
    def = files.get(job.level.file)![job.level.name];
  }
  const out: { won: boolean; t: number }[] = [];
  for (const p of job.plans) { const r = run(def, p, job.limit); out.push({ won: r.won, t: r.t }); }
  parentPort!.postMessage({ id: job.id, out });
});
