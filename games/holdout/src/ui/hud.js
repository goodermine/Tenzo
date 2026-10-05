/* HOLDOUT - the in-run HUD. DOM over the canvas: crisp text at any pixel
   density for free, and nothing here changes more than a few times a second
   - writes are skipped when the value has not changed. */
export class Hud {
  constructor(root) {
    this.root = root;
    this.xpFill = root.querySelector('.xp-fill');
    this.level = root.querySelector('.level');
    this.timer = root.querySelector('.timer');
    this.kills = root.querySelector('.kills');
    this.last = {};
  }

  set(key, el, value, write) {
    if (this.last[key] === value) return;
    this.last[key] = value;
    write(el, value);
  }

  update(sim) {
    const p = sim.p;
    const frac = Math.min(1, p.xp / p.xpNext);
    this.set('xp', this.xpFill, Math.round(frac * 400) / 400, (el, v) => { el.style.transform = `scaleX(${v})`; });
    this.set('lv', this.level, p.level, (el, v) => { el.textContent = 'LV ' + v; });
    const t = Math.floor(sim.time);
    this.set('t', this.timer, t, (el, v) => {
      el.textContent = `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
    });
    this.set('k', this.kills, p.kills, (el, v) => { el.textContent = v; });
  }

  show(on) {
    this.root.classList.toggle('on', on);
  }
}
