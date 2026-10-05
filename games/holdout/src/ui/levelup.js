/* HOLDOUT - the level-up choice.
   Three cards. They ignore taps for a moment after appearing: the player's
   thumb is usually still down on the stick when a level-up lands, and
   lifting it must not pick whatever card happens to be under it. */
import { WEAPONS, WEAPON_INDEX } from '../content/weapons.js';
import { PASSIVES, PASSIVE_INDEX } from '../content/passives.js';
import { iconCanvas, iconFor } from '../render/atlas.js';

const ARM_DELAY = 450;

export function describe(choice) {
  if (choice.kind === 'weapon' || choice.kind === 'evolve') {
    const def = WEAPONS[WEAPON_INDEX[choice.id]];
    if (choice.kind === 'evolve') {
      const from = WEAPONS[WEAPON_INDEX[choice.from]];
      return { icon: iconFor(def), name: def.name, tag: `EVOLUTION · ${from.name}`, text: def.blurb, cls: 'evo' };
    }
    return {
      icon: iconFor(def),
      name: def.name,
      tag: choice.level === 1 ? 'NEW WEAPON' : `LV ${choice.level}`,
      text: choice.level === 1 ? def.blurb : def.notes[choice.level - 1],
      cls: choice.level === 1 ? 'new' : ''
    };
  }
  if (choice.kind === 'passive') {
    const def = PASSIVES[PASSIVE_INDEX[choice.id]];
    return {
      icon: def.icon,
      name: def.name,
      tag: choice.level === 1 ? 'NEW' : `LV ${choice.level}`,
      text: def.note,
      cls: choice.level === 1 ? 'new' : ''
    };
  }
  return { icon: 'p_vigor', name: 'Repair', tag: '', text: 'Restore 30 health', cls: '' };
}

export class LevelUp {
  constructor(root, atlas, onPick) {
    this.root = root;
    this.atlas = atlas;
    this.onPick = onPick;
    this.list = root.querySelector('.cards');
    this.shown = null;
    this.armed = false;
  }

  show(choices, level, title = 'LEVEL UP') {
    if (this.shown === choices) return;
    this.shown = choices;
    this.root.querySelector('.title').textContent = title;
    this.root.querySelector('.lv').textContent = `LEVEL ${level}`;
    this.list.replaceChildren();
    choices.forEach((ch, i) => {
      const d = describe(ch);
      const card = document.createElement('button');
      card.className = 'card ' + d.cls;
      card.style.setProperty('--i', i);
      card.append(iconCanvas(this.atlas.icons, d.icon));
      const body = document.createElement('div');
      body.className = 'body';
      body.innerHTML = '<div class="tag"></div><div class="name"></div><div class="text"></div>';
      body.querySelector('.tag').textContent = d.tag;
      body.querySelector('.name').textContent = d.name;
      body.querySelector('.text').textContent = d.text;
      card.append(body);
      card.addEventListener('click', () => {
        if (!this.armed) return;
        this.armed = false;
        this.onPick(i);
      });
      this.list.append(card);
    });
    this.armed = false;
    this.root.classList.add('on');
    this.root.classList.remove('armed');
    clearTimeout(this.armTimer);
    this.armTimer = setTimeout(() => {
      this.armed = true;
      this.root.classList.add('armed');
    }, ARM_DELAY);
  }

  hide() {
    this.shown = null;
    this.armed = false;
    this.root.classList.remove('on', 'armed');
  }
}
