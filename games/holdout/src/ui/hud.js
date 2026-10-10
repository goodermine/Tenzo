/* HOLDOUT - the in-run HUD. DOM over the canvas: crisp text at any pixel
   density for free, and nothing here changes more than a few times a second
   - writes are skipped when the value has not changed. */
import { iconCanvas, iconFor } from '../render/atlas.js';
import { ZONES } from '../render/background.js';

export class Hud {
  constructor(root, atlas) {
    this.root = root;
    this.atlas = atlas;
    this.xpFill = root.querySelector('.xp-fill');
    this.level = root.querySelector('.level');
    this.timer = root.querySelector('.timer');
    this.kills = root.querySelector('.kills');
    this.badge = root.querySelector('.badge');
    this.strip = root.querySelector('.weapons');
    this.slots = [];
    this.last = {};
    this.tick = 0;
  }

  set(key, el, value, write) {
    if (this.last[key] === value) return;
    this.last[key] = value;
    write(el, value);
  }

  /* Your build at a glance: an icon per weapon, with a cooldown sweep for
     the ones that fire on a timer. Rebuilt only when the build changes. */
  buildStrip(sim) {
    this.strip.replaceChildren();
    this.slots = sim.weapons.map(w => {
      const slot = document.createElement('div');
      slot.className = 'wslot' + (w.def.evolved ? ' evo' : '');
      slot.append(iconCanvas(this.atlas.icons, iconFor(w.def), 64));
      const lv = document.createElement('span');
      lv.textContent = w.def.evolved ? '★' : w.level;
      slot.append(lv);
      this.strip.append(slot);
      return slot;
    });
  }

  update(sim, dt) {
    const p = sim.p;
    const frac = Math.min(1, p.xp / p.xpNext);
    this.set('xp', this.xpFill, Math.round(frac * 400) / 400, (el, v) => { el.style.transform = `scaleX(${v})`; });
    this.set('lv', this.level, p.level, (el, v) => {
      el.textContent = 'LV ' + v;
      /* a pop on each level */
      el.classList.remove('pop');
      void el.offsetWidth;
      el.classList.add('pop');
    });
    const t = Math.floor(sim.time);
    this.set('t', this.timer, t, (el, v) => {
      el.textContent = `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
    });
    this.set('k', this.kills, p.kills, (el, v) => { el.textContent = v; });
    const label = ZONES[sim.zone].name + (sim.diff.id === 'easy' ? '  ·  EASY' : '');
    this.set('z', this.badge, label, (el, v) => { el.textContent = v; });

    const sig = sim.weapons.map(w => w.def.id + w.level).join();
    if (sig !== this.last.sig) {
      this.last.sig = sig;
      this.buildStrip(sim);
    }
    /* cooldowns at ten frames a second is plenty */
    this.tick += dt;
    if (this.tick < 0.1) return;
    this.tick = 0;
    sim.weapons.forEach((w, k) => {
      const slot = this.slots[k];
      if (!slot) return;
      const cd = w.stats.cd ? w.stats.cd * sim.stats.cooldown : 0;
      const f = cd && w.t > 0 ? Math.min(1, w.t / cd) : 0;
      slot.style.setProperty('--cd', f.toFixed(2));
    });
  }

  show(on) {
    this.root.classList.toggle('on', on);
  }
}
