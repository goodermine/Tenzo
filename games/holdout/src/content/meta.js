/* HOLDOUT - what carries over between runs: credits, permanent upgrades and
   unlocks. Pure functions over the save data, so they are testable and the
   bot can apply the same upgrades the shop sells. */

/* Permanent upgrades. cost(level) is the price of buying `level` + 1. */
export const UPGRADES = [
  { id: 'hull', name: 'Hull', note: '+10 max health', max: 5, base: 60 },
  { id: 'power', name: 'Power Core', note: '+5% damage', max: 5, base: 80 },
  { id: 'thrust', name: 'Thrusters', note: '+4% move speed', max: 3, base: 70 },
  { id: 'magnet', name: 'Tractor', note: '+15% pickup range', max: 3, base: 50 },
  { id: 'repair', name: 'Repair Drones', note: '+0.15 health a second', max: 3, base: 90 },
  { id: 'insight', name: 'Insight', note: '+6% experience', max: 3, base: 100 },
  { id: 'reroll', name: 'Reroll', note: '+1 reroll of level-up cards per run', max: 3, base: 150 }
];

export function upgradeCost(u, level) {
  return Math.round(u.base * Math.pow(level + 1, 1.6));
}

/** Fold purchased upgrade levels into the run's base stats. */
export function applyUpgrades(s, levels = {}) {
  const l = id => levels[id] || 0;
  s.maxHp += 10 * l('hull');
  s.damage *= 1 + 0.05 * l('power');
  s.speed *= 1 + 0.04 * l('thrust');
  s.magnet *= 1 + 0.15 * l('magnet');
  s.regen += 0.15 * l('repair');
  s.growth *= 1 + 0.06 * l('insight');
}

/* Weapons that start locked, and what opens them. `test` gets the result of
   the run just played and the lifetime totals (after this run is added). */
export const WEAPON_UNLOCKS = [
  { id: 'laser', text: 'Survive 6 minutes', test: (r) => r.seconds >= 360 },
  { id: 'gravity', text: 'Destroy 3,000 enemies in total', test: (r, t) => t.kills >= 3000 },
  { id: 'flame', text: 'Reach level 25', test: (r) => r.level >= 25 },
  { id: 'drones', text: 'Defeat The Hive', test: (r) => r.bosses.includes('hive') },
  { id: 'mines', text: 'Destroy 400 enemies in one run', test: (r) => r.kills >= 400 }
];

export const CHARACTER_UNLOCKS = [
  { id: 'bastion', text: 'Survive 5 minutes', test: (r) => r.seconds >= 300 },
  { id: 'specter', text: 'Evolve a weapon', test: (r) => r.evolved > 0 }
];

/** Credits for a run: time and kills, and a lot for the bosses. */
export function creditsFor(r) {
  return Math.round(r.seconds / 5 + r.kills * 0.05 + r.level +
    (r.bosses.includes('hive') ? 60 : 0) + (r.won ? 250 : 0));
}

/**
 * Settle a finished run against the save: credits, totals, bests and any
 * unlocks it earned. Mutates and returns `save`, plus what changed.
 */
export function settleRun(save, r) {
  const credits = creditsFor(r);
  save.credits += credits;
  const t = save.totals;
  t.runs++;
  t.kills += r.kills;
  t.seconds += r.seconds;
  if (r.won) t.wins++;
  const newBest = r.seconds > save.best.seconds;
  if (newBest) save.best.seconds = r.seconds;
  save.best.kills = Math.max(save.best.kills, r.kills);
  save.best.level = Math.max(save.best.level, r.level);

  const unlocked = [];
  for (const u of WEAPON_UNLOCKS) {
    if (!save.unlocked.weapons.includes(u.id) && u.test(r, t)) {
      save.unlocked.weapons.push(u.id);
      unlocked.push({ kind: 'weapon', id: u.id });
    }
  }
  for (const u of CHARACTER_UNLOCKS) {
    if (!save.unlocked.characters.includes(u.id) && u.test(r, t)) {
      save.unlocked.characters.push(u.id);
      unlocked.push({ kind: 'character', id: u.id });
    }
  }
  return { credits, newBest, unlocked };
}

/** Weapons the run may offer: everything not still locked. */
export function lockedWeapons(save) {
  return WEAPON_UNLOCKS.filter(u => !save.unlocked.weapons.includes(u.id)).map(u => u.id);
}
