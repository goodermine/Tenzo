/* HOLDOUT - passive items. Each level applies its effect again on top of
   the base stats in sim.recomputeStats(). */
export const PASSIVES = [
  { id: 'might', name: 'Overcharge', icon: 'p_might', max: 5, note: '+12% damage',
    apply: (s, l) => { s.damage *= 1 + 0.12 * l; } },
  { id: 'haste', name: 'Overclock', icon: 'p_haste', max: 5, note: '-8% weapon cooldown',
    apply: (s, l) => { s.cooldown *= 1 - 0.08 * l; } },
  { id: 'swift', name: 'Thrusters', icon: 'p_swift', max: 5, note: '+10% move speed',
    apply: (s, l) => { s.speed *= 1 + 0.1 * l; } },
  { id: 'magnet', name: 'Tractor Field', icon: 'p_magnet', max: 5, note: '+40% pickup range',
    apply: (s, l) => { s.magnet *= 1 + 0.4 * l; } },
  { id: 'vigor', name: 'Plating', icon: 'p_vigor', max: 5, note: '+20 max health, heals 20',
    apply: (s, l) => { s.maxHp += 20 * l; } },
  { id: 'area', name: 'Amplifier', icon: 'p_area', max: 5, note: '+10% weapon area',
    apply: (s, l) => { s.area *= 1 + 0.1 * l; } },
  { id: 'armor', name: 'Hardened Hull', icon: 'p_armor', max: 5, note: '-6% damage taken',
    apply: (s, l) => { s.armor += 0.06 * l; } },
  { id: 'regen', name: 'Nanobots', icon: 'p_regen', max: 5, note: 'repair 0.4 health a second',
    apply: (s, l) => { s.regen += 0.4 * l; } },
  /* Rare and strong: every weapon that fires several of something fires
     one more. Only two levels. */
  { id: 'amount', name: 'Multiplexer', icon: 'p_amount', max: 2, note: '+1 projectile on every weapon',
    apply: (s, l) => { s.amount += l; } },
  { id: 'growth', name: 'Data Siphon', icon: 'p_growth', max: 5, note: '+12% experience',
    apply: (s, l) => { s.growth *= 1 + 0.12 * l; } }
];

export const PASSIVE_INDEX = Object.fromEntries(PASSIVES.map((p, i) => [p.id, i]));
