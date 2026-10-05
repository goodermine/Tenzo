/* HOLDOUT - the ships you can fly. Each starts with its own weapon and
   bends the base stats one way; the later two are unlocked by playing (see
   src/content/meta.js for the conditions). */
export const CHARACTERS = [
  {
    id: 'vanguard',
    name: 'VANGUARD',
    blurb: 'Balanced. Starts with Arc Bolt.',
    weapon: 'bolt',
    sprite: 'player',
    color: '#7ff6ff',
    hp: 100, speed: 1, armor: 0, damage: 1, cooldown: 1
  },
  {
    id: 'bastion',
    name: 'BASTION',
    blurb: 'Heavy hull and armour, slower. Starts with Orbit Blades.',
    weapon: 'orbit',
    sprite: 'bastion',
    color: '#7dffb8',
    hp: 150, speed: 0.88, armor: 0.12, damage: 1, cooldown: 1
  },
  {
    id: 'specter',
    name: 'SPECTER',
    blurb: 'Fragile and fast, weapons recharge sooner. Starts with Chain Lightning.',
    weapon: 'chain',
    sprite: 'specter',
    color: '#d27aff',
    hp: 85, speed: 1.15, armor: 0, damage: 1, cooldown: 0.86
  }
];

export const CHARACTER_INDEX = Object.fromEntries(CHARACTERS.map((c, i) => [c.id, i]));
