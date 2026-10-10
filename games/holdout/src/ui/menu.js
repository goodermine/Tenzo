/* HOLDOUT - the title screen's ship select and the upgrade shop. */
import { CHARACTERS } from '../content/characters.js';
import { UPGRADES, upgradeCost, CHARACTER_UNLOCKS, WEAPON_UNLOCKS } from '../content/meta.js';
import { WEAPONS, WEAPON_INDEX } from '../content/weapons.js';

function shipCanvas(atlas, sprite) {
  const c = document.createElement('canvas');
  c.width = c.height = 112;
  const cell = atlas.cells[sprite];
  const ctx = c.getContext('2d');
  ctx.translate(56, 56);
  ctx.rotate(-Math.PI / 2);
  ctx.drawImage(atlas.canvas, cell.x, cell.y, cell.w, cell.h, -56, -56, 112, 112);
  return c;
}

export function renderShips(el, save, atlas, onSelect) {
  el.replaceChildren();
  for (const ch of CHARACTERS) {
    const open = save.unlocked.characters.includes(ch.id);
    const b = document.createElement('button');
    b.className = 'ship' + (open ? '' : ' locked') + (save.character === ch.id ? ' sel' : '');
    b.style.setProperty('--c', ch.color);
    const lock = CHARACTER_UNLOCKS.find(u => u.id === ch.id);
    b.append(shipCanvas(atlas, ch.sprite));
    const n = document.createElement('div');
    n.className = 'n';
    n.textContent = ch.name;
    const d = document.createElement('div');
    d.className = 'd';
    d.textContent = open ? ch.blurb : lock.text + ' to unlock';
    b.append(n, d);
    if (open) b.addEventListener('click', () => onSelect(ch.id));
    el.append(b);
  }
}

export function renderShop(root, save, onBuy) {
  root.querySelector('.credits-big').textContent = save.credits;
  const ups = root.querySelector('.ups');
  ups.replaceChildren();
  for (const u of UPGRADES) {
    const level = save.upgrades[u.id] || 0;
    const row = document.createElement('div');
    row.className = 'up';
    const info = document.createElement('div');
    info.innerHTML = '<div class="n"></div><div class="d"></div><div class="pips"></div>';
    info.querySelector('.n').textContent = u.name;
    info.querySelector('.d').textContent = u.note;
    const pips = info.querySelector('.pips');
    for (let k = 0; k < u.max; k++) {
      const i = document.createElement('i');
      if (k < level) i.className = 'on';
      pips.append(i);
    }
    const buy = document.createElement('button');
    if (level >= u.max) {
      buy.textContent = 'MAX';
      buy.disabled = true;
    } else {
      const cost = upgradeCost(u, level);
      buy.textContent = '◆ ' + cost;
      buy.disabled = save.credits < cost;
      buy.addEventListener('click', () => onBuy(u, cost));
    }
    row.append(info, buy);
    ups.append(row);
  }
  const locks = root.querySelector('.locks');
  const pending = WEAPON_UNLOCKS.filter(u => !save.unlocked.weapons.includes(u.id));
  locks.replaceChildren();
  if (pending.length) {
    const h = document.createElement('b');
    h.textContent = 'LOCKED WEAPONS';
    locks.append(h);
    for (const u of pending) {
      const d = document.createElement('div');
      d.textContent = `${WEAPONS[WEAPON_INDEX[u.id]].name} — ${u.text}`;
      locks.append(d);
    }
  }
}
