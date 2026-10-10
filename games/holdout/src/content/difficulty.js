/* HOLDOUT - difficulty settings. One table of multipliers, applied where
   enemies spawn and shoot (src/sim/world.js), where the director paces the
   waves (src/sim/director.js) and when a run pays out (src/content/meta.js).
   Easy is the same fifteen minutes with a gentler swarm: it can still be
   lost, and it still unlocks things, but pays fewer credits. */
export const DIFFICULTIES = {
  easy: {
    id: 'easy', name: 'EASY',
    enemyHp: 0.7, enemyDmg: 0.6, spawnRate: 0.78, maxAlive: 0.8,
    bossHp: 0.7, bulletSpeed: 0.85, xp: 1.1, credits: 0.6
  },
  normal: {
    id: 'normal', name: 'NORMAL',
    enemyHp: 1, enemyDmg: 1, spawnRate: 1, maxAlive: 1,
    bossHp: 1, bulletSpeed: 1, xp: 1, credits: 1
  }
};

export function difficulty(id) {
  return DIFFICULTIES[id] || DIFFICULTIES.normal;
}
