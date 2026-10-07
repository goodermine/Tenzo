/* TILT LAB - solver worker: runs a batch of plans against one level. */
import { parentPort } from 'node:worker_threads';
import { LEVELS } from '../src/levels/levelLoader.ts';
import { run } from './plans.ts';
import type { Solution } from '../src/entities/types.ts';

parentPort!.on('message', (job: { id: number; level: number; plans: Solution[]; limit: number; stopOnWin?: boolean }) => {
  const out: { won: boolean; t: number }[] = [];
  for (const p of job.plans) {
    const r = run(LEVELS[job.level], p, job.limit);
    out.push({ won: r.won, t: r.t });
    if (r.won && job.stopOnWin) break;
  }
  parentPort!.postMessage({ id: job.id, out });
});
