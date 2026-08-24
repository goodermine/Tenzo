/* Greyline - heads-up display. Plain DOM over the canvas, plus a small
   canvas for the minimap. */
export class Hud {
  constructor(root) {
    this.root = root;
    root.innerHTML = `
      <div class="hud">
        <div class="minimap"><canvas width="220" height="220"></canvas><span class="mm-label">SECTOR 07</span></div>
        <div class="compass"><div class="strip"></div><div class="needle"></div></div>
        <div class="killfeed"></div>
        <div class="toast"></div>
        <div class="crosshair">
          <i class="c-dot"></i><i class="c-t"></i><i class="c-b"></i><i class="c-l"></i><i class="c-r"></i>
          <i class="hitmark"></i>
        </div>
        <div class="vitals">
          <div class="hp"><div class="hp-fill"></div></div>
          <div class="hp-num">100</div>
        </div>
        <div class="ammo"><span class="mag">30</span><span class="res">/ 210</span><span class="wep">MK-4 CARBINE</span></div>
        <div class="score"><span class="kills">0</span> ELIMINATED<br><span class="wave">WAVE 1</span></div>
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
      kills: q('.kills'),
      wave: q('.wave'),
      toast: q('.toast'),
      feed: q('.killfeed'),
      hit: q('.hitmark'),
      cross: q('.crosshair'),
      low: q('.lowammo')
    };
    this.toastTimer = 0;
    this.hitTimer = 0;
  }

  toast(text) {
    this.el.toast.textContent = text;
    this.el.toast.style.opacity = '1';
    this.toastTimer = 1.9;
  }

  feed(text) {
    const line = document.createElement('div');
    line.textContent = text;
    this.el.feed.prepend(line);
    while (this.el.feed.children.length > 4) this.el.feed.lastChild.remove();
    setTimeout(() => line.classList.add('fade'), 2600);
    setTimeout(() => line.remove(), 3400);
  }

  hitMarker(head) {
    this.el.hit.style.opacity = '1';
    this.el.hit.classList.toggle('head', !!head);
    this.hitTimer = 0.16;
  }

  update(dt, state) {
    const { player, weapon, enemies, kills, wave } = state;
    const hp = Math.round(player.health);
    this.el.hpFill.style.width = hp + '%';
    this.el.hpFill.style.background = hp > 55 ? '#cfd6d8' : hp > 25 ? '#d8b25a' : '#c8493c';
    this.el.hpNum.textContent = hp;
    this.el.mag.textContent = weapon.ammo;
    this.el.res.textContent = '/ ' + weapon.reserve;
    this.el.kills.textContent = kills;
    this.el.wave.textContent = 'WAVE ' + wave;
    this.el.low.style.opacity = (weapon.ammo === 0 && weapon.reloading <= 0) ? '1' : '0';

    const spread = 6 + weapon.recoil * 26 + (player.sprinting ? 16 : 0) + (1 - weapon.ads) * 6;
    this.el.cross.style.setProperty('--gap', spread.toFixed(1) + 'px');
    this.el.cross.style.opacity = weapon.ads > 0.75 ? '0.25' : '1';

    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.el.toast.style.opacity = '0';
    }
    if (this.hitTimer > 0) {
      this.hitTimer -= dt;
      if (this.hitTimer <= 0) this.el.hit.style.opacity = '0';
    }

    /* compass strip scrolls with yaw */
    const deg = ((-player.yaw * 180 / Math.PI) % 360 + 360) % 360;
    this.el.strip.style.transform = `translateX(${-deg * 4}px)`;

    this.drawMinimap(player, enemies);
  }

  drawMinimap(player, enemies) {
    const g = this.el.mm;
    const w = 220;
    const scale = 1.5;
    g.clearRect(0, 0, w, w);
    g.save();
    g.translate(w / 2, w / 2);
    g.rotate(player.yaw + Math.PI);

    g.fillStyle = 'rgba(18,20,22,0.55)';
    g.fillRect(-w, -w, w * 2, w * 2);

    /* the street, as a simple corridor */
    g.fillStyle = 'rgba(150,158,160,0.30)';
    g.fillRect(-9 * scale - player.pos.x * scale, -200, 18 * scale, 400);

    g.strokeStyle = 'rgba(190,198,200,0.35)';
    g.lineWidth = 1;
    for (let i = -8; i <= 8; i++) {
      const z = (i * 20 - (player.pos.z % 20)) * scale;
      g.beginPath();
      g.moveTo(-w, z);
      g.lineTo(w, z);
      g.stroke();
    }

    for (const e of enemies) {
      if (!e.alive) continue;
      const dx = (e.pos.x - player.pos.x) * scale;
      const dz = (e.pos.z - player.pos.z) * scale;
      if (Math.hypot(dx, dz) > w / 2 - 8) continue;
      g.fillStyle = '#d4483c';
      g.beginPath();
      g.arc(dx, dz, 4, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();

    /* player arrow, always centred and pointing up */
    g.fillStyle = '#e8eef0';
    g.beginPath();
    g.moveTo(w / 2, w / 2 - 7);
    g.lineTo(w / 2 - 5, w / 2 + 6);
    g.lineTo(w / 2 + 5, w / 2 + 6);
    g.closePath();
    g.fill();
  }
}
