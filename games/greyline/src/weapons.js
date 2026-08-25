/* Greyline - weapon table and the player's loadout.
   Weapons are data: the viewmodel and the firing code read these numbers,
   so adding one is a table entry rather than a new class. `noise` is the
   radius in metres that a shot alerts guards within - it is what makes the
   silenced pistol a stealth tool rather than a weak rifle. */
export const WEAPONS = {
  pistol_s: {
    id: 'pistol_s', name: 'PP-9 SILENCED', short: 'PP-9',
    damage: 25, rpm: 300, mag: 12, reserve: 60, spread: 0.010,
    noise: 7, auto: false, reload: 1.25, recoil: 0.010, zoom: 1.15, silenced: true
  },
  smg: {
    id: 'smg', name: 'KL-7 SMG', short: 'KL-7',
    damage: 17, rpm: 900, mag: 32, reserve: 160, spread: 0.032,
    noise: 38, auto: true, reload: 1.5, recoil: 0.009, zoom: 1.2
  },
  rifle: {
    id: 'rifle', name: 'MK-4 CARBINE', short: 'MK-4',
    damage: 27, rpm: 700, mag: 30, reserve: 180, spread: 0.021,
    noise: 45, auto: true, reload: 1.55, recoil: 0.013, zoom: 1.35
  },
  shotgun: {
    id: 'shotgun', name: 'M20 BREACHER', short: 'M20',
    damage: 15, pellets: 9, rpm: 75, mag: 6, reserve: 30, spread: 0.075,
    noise: 52, auto: false, reload: 2.2, recoil: 0.036, zoom: 1.1
  },
  sniper: {
    id: 'sniper', name: 'DR-8 MARKSMAN', short: 'DR-8',
    damage: 115, rpm: 48, mag: 5, reserve: 20, spread: 0.001,
    noise: 60, auto: false, reload: 2.4, recoil: 0.05, zoom: 3.2
  }
};

/* What guards carry, and therefore what drops when they go down. */
export const GUARD_WEAPONS = ['smg', 'smg', 'rifle', 'shotgun'];

export class Loadout {
  constructor(startId = 'pistol_s') {
    this.slots = [];
    this.index = 0;
    this.add(startId);
  }
  add(id, reserveBonus = 0) {
    const def = WEAPONS[id];
    if (!def) return null;
    const existing = this.slots.find(s => s.id === id);
    if (existing) {
      existing.reserve = Math.min(def.reserve * 2, existing.reserve + (reserveBonus || def.mag * 2));
      return existing;
    }
    const slot = { id, def, ammo: def.mag, reserve: def.reserve };
    this.slots.push(slot);
    return slot;
  }
  current() {
    return this.slots[this.index];
  }
  select(i) {
    if (i >= 0 && i < this.slots.length) {
      this.index = i;
      return true;
    }
    return false;
  }
  cycle(dir) {
    if (!this.slots.length) return;
    this.index = (this.index + dir + this.slots.length) % this.slots.length;
  }
  giveAmmo(amount) {
    for (const s of this.slots) {
      s.reserve = Math.min(s.def.reserve * 2, s.reserve + Math.round(s.def.mag * amount));
    }
  }
}
