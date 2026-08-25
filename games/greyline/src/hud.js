/* Greyline - heads-up display: vitals, objectives, the interaction prompt
   and the minimap. Plain DOM over the canvas. */
export class Hud {
  constructor(root) {
    root.innerHTML = `
      <div class="hud">
        <div class="minimap"><canvas width="220" height="220"></canvas><span class="mm-label">FACILITY</span></div>
        <div class="objectives"><h4>OBJECTIVES</h4><ul></ul></div>
        <div class="compass"><div class="strip"></div><div class="needle"></div></div>
        <div class="alarmflag">ALARM ACTIVE</div>
        <div class="mtimer"></div>
        <div class="killfeed"></div>
        <div class="toast"></div>
        <div class="crosshair">
          <i class="c-dot"></i><i class="c-t"></i><i class="c-b"></i><i class="c-l"></i><i class="c-r"></i>
          <i class="hitmark"></i>
        </div>
        <div class="prompt"><b></b><span class="ring"><i></i></span></div>
        <div class="vitals">
          <div class="hp"><div class="hp-fill"></div></div>
          <div class="hp-num">100</div>
        </div>
        <div class="ammo"><span class="mag">12</span><span class="res">/ 60</span><span class="wep">PP-9</span></div>
        <div class="slots"></div>
        <div class="lowammo">RELOAD</div>
      </div>`;
    const q = s => root.querySelector(s);
    this.el = {
      mm: q('.minimap canvas').getContext('2d'),
      strip: q('.strip'),
      hpFill: q('.hp-fill'),
      hpNum: q('.hp-num'),
      mag: q('.mag'),
      res: q('.res'),
      wep: q('.wep'),
      slots: q('.slots'),
      obj: q('.objectives ul'),
      alarm: q('.alarmflag'),
      timer: q('.mtimer'),
      toast: q('.toast'),
      feed: q('.killfeed'),
      hit: q('.hitmark'),
      cross: q('.crosshair'),
      low: q('.lowammo'),
      prompt: q('.prompt'),
      promptText: q('.prompt b'),
      ring: q('.prompt .ring i')
    };
    this.toastTimer = 0;
    this.hitTimer = 0;
    this.objSignature = '';
    this.slotSignature = '';
  }

  toast(text) {
    this.el.toast.textContent = text;
    this.el.toast.style.opacity = '1';
    this.toastTimer = 2.2;
  }

  feed(text) {
    const line = document.createElement('div');
    line.textContent = text;
    this.el.feed.prepend(line);
    while (this.el.feed.children.length > 4) this.el.feed.lastChild.remove();
    setTimeout(() => line.classList.add('fade'), 2600);
    setTimeout(() => line.remove(), 3400);
  }

  hitMarker(zone) {
    this.el.hit.style.opacity = '1';
    this.el.hit.classList.toggle('head', zone === 'head');
    this.hitTimer = 0.16;
  }

  update(dt, state) {
    const { player, weapon, enemies, mission, loadout } = state;

    const hp = Math.round(player.health);
    this.el.hpFill.style.width = hp + '%';
    this.el.hpFill.style.background = hp > 55 ? '#cfd6d8' : hp > 25 ? '#d8b25a' : '#c8493c';
    this.el.hpNum.textContent = hp;

    this.el.mag.textContent = weapon.ammo;
    this.el.res.textContent = '/ ' + weapon.reserve;
    this.el.wep.textContent = weapon.def.name;
    this.el.low.style.opacity = (weapon.ammo === 0 && weapon.reloading <= 0) ? '1' : '0';

    const sig = loadout.slots.map(s => s.id).join(',') + '|' + loadout.index;
    if (sig !== this.slotSignature) {
      this.slotSignature = sig;
      this.el.slots.innerHTML = loadout.slots
        .map((s, i) => `<span class="${i === loadout.index ? 'on' : ''}">${i + 1} ${s.def.short}</span>`)
        .join('');
    }

    /* objectives only re-render when something actually changes */
    const osig = mission.objectives.map(o => o.id + (o.done ? '1' : '0')).join();
    if (osig !== this.objSignature) {
      this.objSignature = osig;
      this.el.obj.innerHTML = mission.objectives
        .map(o => `<li class="${o.done ? 'done' : ''}"><b>${o.letter}</b>${o.text}</li>`)
        .join('');
    }

    this.el.alarm.style.opacity = mission.alarmActive ? '1' : '0';
    if (mission.timeLimit) {
      const left = Math.max(0, mission.timeLimit - mission.time);
      const m = Math.floor(left / 60);
      const s = Math.floor(left % 60);
      this.el.timer.textContent = m + ':' + String(s).padStart(2, '0');
      this.el.timer.classList.toggle('urgent', left < 60);
    } else {
      this.el.timer.textContent = '';
    }

    const p = mission.prompt;
    if (p) {
      this.el.prompt.style.opacity = '1';
      this.el.promptText.textContent = p.hold
        ? (p.blocked ? p.label : 'HOLD F — ' + p.label)
        : (p.blocked ? p.label : 'F — ' + p.label);
      this.el.prompt.classList.toggle('blocked', !!p.blocked);
      this.el.ring.style.width = Math.round((p.progress || 0) * 100) + '%';
    } else {
      this.el.prompt.style.opacity = '0';
      this.el.ring.style.width = '0%';
    }

    const spread = 6 + weapon.recoil * 26 + (player.sprinting ? 16 : 0) + (1 - weapon.ads) * 6;
    this.el.cross.style.setProperty('--gap', spread.toFixed(1) + 'px');
    this.el.cross.style.opacity = weapon.ads > 0.75 ? '0.2' : '1';

    if (mission.banner) this.toast(mission.banner);
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.el.toast.style.opacity = '0';
    }
    if (this.hitTimer > 0) {
      this.hitTimer -= dt;
      if (this.hitTimer <= 0) this.el.hit.style.opacity = '0';
    }

    const deg = ((-player.yaw * 180 / Math.PI) % 360 + 360) % 360;
    this.el.strip.style.transform = `translateX(${-deg * 4}px)`;
    this.drawMinimap(player, enemies, mission);
  }

  /* Top-down slice of the floorplan around the player, plus contacts. */
  drawMinimap(player, enemies, mission) {
    const g = this.el.mm;
    const w = 220;
    const scale = 3.2;
    const f = mission.facility;
    g.clearRect(0, 0, w, w);
    g.save();
    g.translate(w / 2, w / 2);
    g.rotate(player.yaw + Math.PI);
    g.fillStyle = 'rgba(18,20,22,0.5)';
    g.fillRect(-w, -w, w * 2, w * 2);

    if (f) {
      const cell = 2.6 * scale;
      const c = f.cellOf(player.pos);
      const span = 11;
      for (let dy = -span; dy <= span; dy++) {
        for (let dx = -span; dx <= span; dx++) {
          const x = c.x + dx;
          const y = c.y + dy;
          if (x < 0 || y < 0 || x >= f.w || y >= f.h) continue;
          if (!f.walkable(x, y)) continue;
          const p = f.worldPos(x, y);
          g.fillStyle = 'rgba(150,162,166,0.34)';
          g.fillRect((p.x - player.pos.x) * scale - cell / 2,
            (p.z - player.pos.z) * scale - cell / 2, cell - 1, cell - 1);
        }
      }
      for (const d of f.doors) {
        const dx = (d.pos.x - player.pos.x) * scale;
        const dz = (d.pos.z - player.pos.z) * scale;
        if (Math.hypot(dx, dz) > w / 2) continue;
        g.fillStyle = d.locked ? '#c8a24a' : 'rgba(210,220,224,0.7)';
        g.fillRect(dx - 3, dz - 3, 6, 6);
      }
    }

    for (const e of enemies) {
      if (!e.alive) continue;
      const dx = (e.pos.x - player.pos.x) * scale;
      const dz = (e.pos.z - player.pos.z) * scale;
      if (Math.hypot(dx, dz) > w / 2 - 8) continue;
      g.fillStyle = e.state === 'engage' || e.state === 'alert' ? '#d4483c' : '#c98a3c';
      g.beginPath();
      g.arc(dx, dz, 4, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();

    g.fillStyle = '#e8eef0';
    g.beginPath();
    g.moveTo(w / 2, w / 2 - 7);
    g.lineTo(w / 2 - 5, w / 2 + 6);
    g.lineTo(w / 2 + 5, w / 2 + 6);
    g.closePath();
    g.fill();
  }
}
