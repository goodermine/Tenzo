/* HOLDOUT - what happened this frame, for the renderer, audio and haptics.
   A fixed ring of typed arrays rather than an array of objects: a busy
   second can produce a thousand hits, and allocating an object for each is
   exactly the garbage that makes a phone stutter. */
export const EV = {
  HIT: 1,          // x, y, a = damage, b = enemy index
  KILL: 2,         // x, y, a = enemy type, b = enemy radius
  HURT: 3,         // x, y, a = damage
  PICKUP: 4,       // x, y, a = xp value
  LEVELUP: 5,      // a = new level
  NOVA: 6,         // x, y, a = radius
  SHOT: 7,         // x, y, a = weapon slot
  PLAYER_DEATH: 8, // x, y
  SURGE: 9,        // x, y, a = count
  BEAM: 10,        // x, y -> a, b (a lightning arc)
  LASER: 11,       // x, y, a = weapon slot (a sweep starts)
  TELL: 12,        // x, y, a = seconds, b = radius (where a blinker will land)
  BLINK: 13,       // x, y -> a, b (a blinker jumped)
  EXPLODE: 14,     // x, y, a = radius
  ITEM: 15,        // x, y, a = item kind picked up
  BOSS: 16,        // x, y, a = enemy type (a boss arrived)
  EVOLVE: 17,      // a = weapon slot
  BULLET: 18,      // x, y (an enemy fired)
  ZONE: 19,        // a = zone index (the arena changed)
  SPAWN: 20        // x, y, a = enemy index, b = type (appeared on screen)
};

export class Events {
  constructor(capacity) {
    this.capacity = capacity;
    this.type = new Uint8Array(capacity);
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.a = new Float32Array(capacity);
    this.b = new Float32Array(capacity);
    this.count = 0;
  }

  push(type, x, y, a = 0, b = 0) {
    const i = this.count;
    if (i >= this.capacity) return;
    this.type[i] = type;
    this.x[i] = x;
    this.y[i] = y;
    this.a[i] = a;
    this.b[i] = b;
    this.count = i + 1;
  }

  clear() {
    this.count = 0;
  }
}
