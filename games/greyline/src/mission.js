/* Greyline - mission layer.
   Objectives that grow with the difficulty you pick, guards that can call an
   alarm, doors that need a key card, gadgets, and an end-of-mission debrief.
   The shooting is in weapon.js; this is the structure around it. */
import * as THREE from 'three';

export const DIFFICULTIES = {
  agent: {
    id: 'agent', label: 'AGENT',
    blurb: 'Two objectives. Guards are slow to react.',
    objectives: ['alarm', 'data', 'escape'],
    guards: 11, health: 70, damage: 6, accuracy: 0.075, reaction: 0.85, timeLimit: 0
  },
  secret: {
    id: 'secret', label: 'SECRET AGENT',
    blurb: 'Destroy the server bank as well. Guards hit harder.',
    objectives: ['alarm', 'data', 'servers', 'escape'],
    guards: 15, health: 100, damage: 9, accuracy: 0.05, reaction: 0.5, timeLimit: 0
  },
  '00': {
    id: '00', label: '00 AGENT',
    blurb: 'Everything, plus the commander’s intel. Eight minutes.',
    objectives: ['alarm', 'data', 'servers', 'intel', 'escape'],
    guards: 19, health: 130, damage: 13, accuracy: 0.032, reaction: 0.28, timeLimit: 480
  }
};

const OBJECTIVE_TEXT = {
  alarm: 'Disable the alarm system',
  data: 'Download the research data',
  servers: 'Destroy the server bank',
  intel: 'Recover the intel from the commander',
  escape: 'Reach the extraction point'
};

export class Mission {
  constructor({ world, scene, sfx, difficulty }) {
    this.world = world;
    this.facility = world.facility;
    this.scene = scene;
    this.sfx = sfx;
    this.diff = DIFFICULTIES[difficulty] || DIFFICULTIES.agent;

    this.objectives = this.diff.objectives.map((id, i) => ({
      id,
      letter: String.fromCharCode(65 + i),
      text: OBJECTIVE_TEXT[id],
      done: false
    }));

    this.state = 'active';
    this.time = 0;
    this.timeLimit = this.diff.timeLimit;
    this.alarmActive = false;
    this.alarmDisabled = false;
    this.alarmTimer = 0;
    this.reinforceTimer = 0;
    this.hasKeycard = false;
    this.hasDetonator = false;
    this.minesPlanted = 0;
    this.prompt = null;
    this.holdProgress = 0;
    this.holdTarget = null;
    this.banner = null;
    this.bannerTimer = 0;
    this.noiseEvents = [];
    this.stats = { shots: 0, hits: 0, headshots: 0, kills: 0, alarms: 0, damageTaken: 0 };

    this.interactables = [];
    this.buildInteractables();
  }

  wants(id) {
    return this.objectives.some(o => o.id === id);
  }
  objective(id) {
    return this.objectives.find(o => o.id === id);
  }

  buildInteractables() {
    const f = this.facility;
    for (const a of f.alarms) {
      this.interactables.push({
        kind: 'alarm', pos: a.pos.clone().setY(1.5), hold: 2.4, data: a,
        label: () => 'DISABLE ALARM SYSTEM',
        available: () => !this.alarmDisabled,
        finish: () => this.disableAlarm()
      });
    }
    for (const c of f.consoles) {
      this.interactables.push({
        kind: 'data', pos: c.pos.clone().setY(1.2), hold: 4.5, data: c,
        label: () => 'DOWNLOAD RESEARCH DATA',
        available: () => this.wants('data') && !this.objective('data').done,
        finish: () => {
          c.done = true;
          c.screen.material.emissive.setHex(0x2f8fd4);
          this.completeObjective('data');
        }
      });
    }
    for (const s of f.servers) {
      this.interactables.push({
        kind: 'server', pos: s.pos.clone().setY(1.2), hold: 1.4, data: s,
        label: () => 'PLANT REMOTE MINE',
        available: () => this.wants('servers') && !s.mined,
        finish: () => this.plantMine(s)
      });
    }
    for (const k of f.keycards) {
      this.interactables.push({
        kind: 'keycard', pos: k.pos.clone(), hold: 0, data: k,
        label: () => 'TAKE SECURITY KEY CARD',
        available: () => !k.taken,
        finish: () => {
          k.taken = true;
          this.hasKeycard = true;
          this.say('KEY CARD ACQUIRED');
          this.sfx.hitmarker();
        }
      });
    }
    if (f.extraction) {
      this.interactables.push({
        kind: 'escape', pos: f.extraction.clone().setY(1.0), hold: 1.6, radius: 3.2,
        label: () => (this.remainingBefore('escape') ? 'OBJECTIVES INCOMPLETE' : 'EXTRACT'),
        available: () => true,
        blocked: () => this.remainingBefore('escape') > 0,
        finish: () => this.completeObjective('escape')
      });
      const pad = new THREE.Mesh(
        new THREE.CircleGeometry(2.4, 24),
        new THREE.MeshStandardMaterial({
          color: 0x14301f, emissive: 0x36d47a, emissiveIntensity: 0.7, roughness: 0.6
        })
      );
      pad.rotation.x = -Math.PI / 2;
      pad.position.copy(f.extraction).setY(0.04);
      this.scene.add(pad);
      this.extractPad = pad;
    }
  }

  remainingBefore(id) {
    return this.objectives.filter(o => o.id !== id && !o.done).length;
  }

  say(text) {
    this.banner = text;
    this.bannerTimer = 2.6;
  }

  completeObjective(id) {
    const o = this.objective(id);
    if (!o || o.done) return;
    o.done = true;
    this.sfx.kill();
    this.say('OBJECTIVE ' + o.letter + ' COMPLETE');
    if (this.objectives.every(x => x.done)) {
      this.state = 'complete';
    }
  }

  /* --- alarm ----------------------------------------------------------- */

  raiseAlarm() {
    if (this.alarmActive || this.alarmDisabled) return;
    this.alarmActive = true;
    this.stats.alarms++;
    this.reinforceTimer = 14;
    this.say('ALARM RAISED');
    this.sfx.hurt();
  }

  disableAlarm() {
    this.alarmDisabled = true;
    this.alarmActive = false;
    for (const a of this.facility.alarms) {
      a.done = true;
      a.light.material.emissive.setHex(0x123018);
    }
    this.completeObjective('alarm');
  }

  /* Guards hear gunfire. A silenced weapon has a radius small enough that
     only the room you are in reacts. */
  noise(pos, radius) {
    this.noiseEvents.push({ pos: pos.clone(), radius, life: 0.2 });
  }

  /* --- gadgets --------------------------------------------------------- */

  plantMine(server) {
    server.mined = true;
    this.minesPlanted++;
    const mine = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.16, 0.12),
      new THREE.MeshStandardMaterial({
        color: 0x2b2f33, emissive: 0xff3322, emissiveIntensity: 1.1, roughness: 0.6
      })
    );
    mine.position.copy(server.pos).setY(1.5);
    mine.position.z += 0.5;
    this.scene.add(mine);
    server.mine = mine;
    this.sfx.reload();
    if (this.facility.servers.every(s => s.mined)) {
      this.hasDetonator = true;
      this.say('ALL CHARGES SET — PRESS G TO DETONATE');
    } else {
      this.say('CHARGE ' + this.minesPlanted + '/' + this.facility.servers.length + ' SET');
    }
  }

  detonate(player) {
    if (!this.hasDetonator) return false;
    let close = false;
    for (const s of this.facility.servers) {
      if (!s.mined || s.destroyed) continue;
      s.destroyed = true;
      s.leds.material.emissive.setHex(0x120704);
      s.leds.material.emissiveIntensity = 0.15;
      if (s.mine) {
        s.mine.material.emissive.setHex(0x110b08);
        s.mine.material.emissiveIntensity = 0.1;
      }
      const flash = new THREE.PointLight(0xffb46a, 60, 16, 2);
      flash.position.copy(s.pos).setY(1.4);
      this.scene.add(flash);
      this.blasts = this.blasts || [];
      this.blasts.push({ light: flash, life: 0.5 });
      if (player.pos.distanceTo(s.pos) < 6.5) close = true;
    }
    this.hasDetonator = false;
    this.sfx.shot();
    this.sfx.distantShot();
    if (close) {
      player.damage(38);
      this.say('TOO CLOSE');
    }
    this.completeObjective('servers');
    return true;
  }

  /* Guards drop what they were carrying, which is how you get off the
     silenced pistol and onto something that can fight back. */
  dropWeapon(pos, weaponId) {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.12, 0.14),
      new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.6, metalness: 0.5 })
    );
    box.position.copy(pos).setY(0.12);
    box.rotation.y = Math.random() * Math.PI;
    this.scene.add(box);
    const item = {
      kind: 'weapon', pos: box.position.clone().setY(0.8), hold: 0, radius: 2.2, mesh: box,
      weaponId,
      label: () => 'PICK UP ' + (this.weaponName ? this.weaponName(weaponId) : 'WEAPON'),
      available: () => !item.taken,
      finish: () => {
        item.taken = true;
        box.visible = false;
        if (this.onPickupWeapon) this.onPickupWeapon(weaponId);
      }
    };
    this.interactables.push(item);
  }

  dropIntel(pos) {
    const briefcase = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.36, 0.16),
      new THREE.MeshStandardMaterial({
        color: 0x3a2a1c, emissive: 0xd8a23c, emissiveIntensity: 0.5, roughness: 0.6, metalness: 0.3
      })
    );
    briefcase.position.copy(pos).setY(0.22);
    this.scene.add(briefcase);
    const item = {
      kind: 'intel', pos: briefcase.position.clone().setY(0.9), hold: 0.9, mesh: briefcase,
      label: () => 'RECOVER INTEL',
      available: () => !item.taken,
      finish: () => {
        item.taken = true;
        briefcase.visible = false;
        this.completeObjective('intel');
      }
    };
    this.interactables.push(item);
    this.say('COMMANDER DOWN — INTEL DROPPED');
  }

  /* --- doors ----------------------------------------------------------- */

  updateDoors(dt, player, enemies) {
    const f = this.facility;
    for (const d of f.doors) {
      let near = player.pos.distanceTo(d.pos) < 2.9;
      if (!near) {
        for (const e of enemies) {
          if (e.alive && e.pos.distanceTo(d.pos) < 2.6) {
            near = true;
            break;
          }
        }
      }
      if (d.locked && near && this.hasKeycard) {
        d.locked = false;
        d.mesh.material.color.setHex(0x53585c);
        this.sfx.hitmarker();
        this.say('DOOR UNLOCKED');
      }
      const want = near && !d.locked ? 1 : 0;
      const speed = d.shutter ? 1.1 : 2.6;
      const before = d.open;
      d.open += (want - d.open) * Math.min(1, speed * dt);
      if (Math.abs(d.open - before) > 0.0005) f.updateDoorBox(d);
    }
  }

  /* --- interaction ----------------------------------------------------- */

  findTarget(player, camera) {
    const eye = new THREE.Vector3(player.pos.x, player.pos.y + player.eyeOffset, player.pos.z);
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    let best = null;
    let bestScore = Infinity;
    for (const it of this.interactables) {
      if (it.available && !it.available()) continue;
      const reach = it.radius || 2.6;
      const to = it.pos.clone().sub(eye);
      const dist = to.length();
      if (dist > reach) continue;
      const facing = to.normalize().dot(dir);
      if (facing < 0.35 && !it.radius) continue;
      if (dist < bestScore) {
        bestScore = dist;
        best = it;
      }
    }
    return best;
  }

  interact(dt, player, camera, held) {
    const target = this.findTarget(player, camera);
    this.prompt = null;
    if (!target) {
      this.holdProgress = 0;
      this.holdTarget = null;
      return;
    }
    const blocked = target.blocked ? target.blocked() : false;
    this.prompt = {
      label: target.label(),
      hold: target.hold,
      blocked,
      progress: this.holdTarget === target ? this.holdProgress / Math.max(0.001, target.hold) : 0
    };
    if (blocked || !held) {
      if (this.holdTarget === target && !held) this.holdProgress = 0;
      return;
    }
    if (this.holdTarget !== target) {
      this.holdTarget = target;
      this.holdProgress = 0;
    }
    this.holdProgress += dt;
    if (this.holdProgress >= target.hold) {
      this.holdProgress = 0;
      this.holdTarget = null;
      target.finish();
    }
  }

  /* --- frame ----------------------------------------------------------- */

  update(dt, player, enemies, camera) {
    if (this.state !== 'active') return;
    this.time += dt;
    if (this.timeLimit && this.time > this.timeLimit) {
      this.state = 'failed';
      this.failReason = 'OUT OF TIME';
      return;
    }
    if (!player.alive) {
      this.state = 'failed';
      this.failReason = 'AGENT DOWN';
      return;
    }

    this.updateDoors(dt, player, enemies);

    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.banner = null;
    }

    /* alarm lights pulse and reinforcements trickle in from the entry */
    if (this.alarmActive) {
      this.alarmTimer += dt;
      const pulse = 0.5 + Math.sin(this.alarmTimer * 7) * 0.5;
      for (const a of this.facility.alarms) {
        a.light.material.emissiveIntensity = 0.4 + pulse * 3.2;
      }
      this.reinforceTimer -= dt;
      if (this.reinforceTimer <= 0) {
        this.reinforceTimer = 22;
        this.wantReinforcements = 3;
      }
    }

    for (let i = this.noiseEvents.length - 1; i >= 0; i--) {
      this.noiseEvents[i].life -= dt;
      if (this.noiseEvents[i].life <= 0) this.noiseEvents.splice(i, 1);
    }

    if (this.blasts) {
      for (let i = this.blasts.length - 1; i >= 0; i--) {
        const b = this.blasts[i];
        b.life -= dt;
        b.light.intensity = Math.max(0, b.life / 0.5) * 60;
        if (b.life <= 0) {
          this.scene.remove(b.light);
          this.blasts.splice(i, 1);
        }
      }
    }

    if (this.extractPad) {
      const ready = this.remainingBefore('escape') === 0;
      this.extractPad.material.emissiveIntensity = ready
        ? 0.7 + Math.sin(this.time * 4) * 0.5
        : 0.12;
      this.extractPad.material.emissive.setHex(ready ? 0x36d47a : 0x555f5a);
    }
  }

  debrief() {
    const acc = this.stats.shots ? (this.stats.hits / this.stats.shots) * 100 : 0;
    const done = this.objectives.filter(o => o.done).length;
    /* time bonus only counts on a clean run, so stealth is worth playing for */
    const score =
      done * 1000 +
      this.stats.kills * 25 +
      this.stats.headshots * 40 +
      Math.round(acc) * 8 -
      this.stats.alarms * 400 -
      Math.round(this.stats.damageTaken);
    return {
      difficulty: this.diff.label,
      objectives: done + ' / ' + this.objectives.length,
      time: this.time,
      accuracy: acc,
      kills: this.stats.kills,
      headshots: this.stats.headshots,
      alarms: this.stats.alarms,
      score: Math.max(0, score),
      state: this.state,
      reason: this.failReason || ''
    };
  }
}
