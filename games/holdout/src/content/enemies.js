/* HOLDOUT - enemy types. Pure data; behaviour keys are read by src/sim/world.js.
   Speeds are world units per second (the player moves at 150), radii are
   collision radii, `mass` scales how far knockback throws them. */
export const ENEMIES = [
  { id: 'chaser', hp: 10, speed: 64, r: 13, dmg: 6, xp: 1, mass: 1 },
  { id: 'swarmer', hp: 4, speed: 98, r: 8, dmg: 3, xp: 1, mass: 0.5 },
  {
    id: 'dasher', hp: 26, speed: 58, r: 14, dmg: 10, xp: 2, mass: 1.3,
    /* Closes to range, stops and telegraphs, then lunges in a straight line
       - a threat you can read and sidestep, which is the point of it. */
    dash: { range: 270, windup: 0.6, speed: 360, time: 0.42, rest: 1.5 }
  },
  { id: 'tank', hp: 150, speed: 36, r: 28, dmg: 16, xp: 6, mass: 4.5 }
];

export const ENEMY_INDEX = Object.fromEntries(ENEMIES.map((e, i) => [e.id, i]));
