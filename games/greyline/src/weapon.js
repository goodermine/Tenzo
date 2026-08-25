/* Greyline - the viewmodel and the trigger.
   One model rig serves the whole weapon table: parts are re-proportioned per
   weapon rather than modelled five times. Firing reads the stats from the
   loadout slot, so a silenced pistol and a breacher differ in data only. */
import * as THREE from 'three';
import { WEAPONS } from './weapons.js';

export class Weapon {
  constructor(camera, scene, world, sfx, loadout) {
    this.camera = camera;
    this.scene = scene;
    this.world = world;
    this.sfx = sfx;
    this.loadout = loadout;

    this.reloading = 0;
    this.cooldown = 0;
    this.ads = 0;
    this.recoil = 0;
    this.switching = 0;

    this.sway = new THREE.Vector2();
    this.swayTarget = new THREE.Vector2();
    this.kick = 0;
    this.kickVel = 0;
    this.sprintMix = 0;

    this.group = new THREE.Group();
    this.group.renderOrder = 10;
    this.build();
    camera.add(this.group);

    this.tracers = [];
    this.decals = [];
    this.shells = [];
    this.muzzleLight = new THREE.PointLight(0xffcf8a, 0, 14, 2);
    scene.add(this.muzzleLight);

    this.flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.42, 0.42),
      new THREE.MeshBasicMaterial({
        color: 0xffd9a0, transparent: true, opacity: 0, depthWrite: false, fog: false
      })
    );
    this.flash.position.set(0, 0, -0.94);
    this.group.add(this.flash);
    this.configure();
  }

  get slot() {
    return this.loadout.current();
  }
  get def() {
    const s = this.slot;
    return s ? s.def : WEAPONS.rifle;
  }
  get ammo() {
    return this.slot ? this.slot.ammo : 0;
  }
  get reserve() {
    return this.slot ? this.slot.reserve : 0;
  }

  build() {
    const dark = new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.55, metalness: 0.75 });
    const polymer = new THREE.MeshStandardMaterial({ color: 0x2f3236, roughness: 0.82, metalness: 0.05 });
    const grip = new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.95, metalness: 0 });
    const hands = new THREE.MeshStandardMaterial({ color: 0x8a6a4c, roughness: 0.85 });
    const glassM = new THREE.MeshStandardMaterial({
      color: 0x3a5a4a, roughness: 0.1, metalness: 0.4, envMapIntensity: 2, transparent: true, opacity: 0.6
    });
    const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      this.group.add(m);
      return m;
    };
    const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    const cyl = (r, h, s = 12) => new THREE.CylinderGeometry(r, r, h, s);

    this.parts = {};
    this.parts.receiver = add(box(0.085, 0.11, 0.42), polymer, 0, 0, -0.18);
    this.parts.handguard = add(box(0.075, 0.085, 0.34), dark, 0, 0.005, -0.5);
    this.parts.barrel = add(cyl(0.016, 0.46), dark, 0, 0.012, -0.72, Math.PI / 2);
    this.parts.muzzle = add(cyl(0.026, 0.09), dark, 0, 0.012, -0.95, Math.PI / 2);
    this.parts.mag = add(box(0.05, 0.2, 0.09), polymer, 0, -0.14, -0.12, 0.22);
    this.parts.grip = add(box(0.05, 0.16, 0.075), grip, 0, -0.115, 0.02, -0.32);
    this.parts.stock = add(box(0.065, 0.09, 0.26), polymer, 0, -0.01, 0.2);
    this.parts.butt = add(box(0.05, 0.13, 0.05), polymer, 0, -0.03, 0.31);
    this.parts.opticBase = add(box(0.05, 0.035, 0.16), dark, 0, 0.085, -0.24);
    this.parts.opticTube = add(cyl(0.032, 0.13, 14), dark, 0, 0.115, -0.24, Math.PI / 2);
    this.parts.lens = add(new THREE.CircleGeometry(0.028, 16), glassM, 0, 0.115, -0.31);
    this.parts.ironSight = add(box(0.006, 0.03, 0.006), dark, 0, 0.055, -0.86);
    this.parts.handFront = add(box(0.075, 0.075, 0.14), hands, 0.005, -0.075, -0.46, 0.2);
    this.parts.handRear = add(box(0.07, 0.09, 0.1), hands, 0.005, -0.085, 0.0, -0.3);

    const s = 0.40;
    this.group.scale.setScalar(s);
    this.baseScale = s;
    this.hipPos = new THREE.Vector3(0.17, -0.15, -0.42);
    this.adsPos = new THREE.Vector3(0, -0.115 * s, -0.33);
    this.group.position.copy(this.hipPos);
  }

  /* Re-proportion the rig for whatever is in hand. */
  configure() {
    const id = this.def.id;
    const p = this.parts;
    const set = (part, visible, scale, pos) => {
      part.visible = visible;
      if (scale) part.scale.set(scale.x || 1, scale.y || 1, scale.z || 1);
      if (pos) part.position.set(pos.x, pos.y, pos.z);
    };
    /* defaults = carbine */
    Object.values(p).forEach(m => {
      m.visible = true;
      m.scale.set(1, 1, 1);
    });
    p.barrel.position.set(0, 0.012, -0.72);
    p.muzzle.position.set(0, 0.012, -0.95);
    p.stock.position.set(0, -0.01, 0.2);
    p.butt.position.set(0, -0.03, 0.31);

    if (id === 'pistol_s') {
      set(p.receiver, true, { z: 0.6 }, { x: 0, y: 0, z: -0.06 });
      set(p.handguard, false);
      set(p.barrel, true, { x: 1.3, y: 0.75, z: 1.3 }, { x: 0, y: 0.012, z: -0.34 });
      set(p.muzzle, true, { x: 1.9, y: 2.6, z: 1.9 }, { x: 0, y: 0.012, z: -0.6 });
      set(p.mag, true, { y: 0.8 }, { x: 0, y: -0.13, z: 0.02 });
      set(p.grip, true, null, { x: 0, y: -0.115, z: 0.05 });
      set(p.stock, false);
      set(p.butt, false);
      set(p.opticBase, false);
      set(p.opticTube, false);
      set(p.lens, false);
      set(p.ironSight, true, null, { x: 0, y: 0.05, z: -0.5 });
      set(p.handFront, false);
      set(p.handRear, true, null, { x: 0.005, y: -0.085, z: 0.06 });
      this.adsHeight = 0.05;
    } else if (id === 'smg') {
      set(p.barrel, true, { z: 0.6 }, { x: 0, y: 0.012, z: -0.6 });
      set(p.muzzle, true, null, { x: 0, y: 0.012, z: -0.78 });
      set(p.handguard, true, { z: 0.75 });
      set(p.opticBase, false);
      set(p.opticTube, false);
      set(p.lens, false);
      set(p.ironSight, true, null, { x: 0, y: 0.055, z: -0.72 });
      this.adsHeight = 0.055;
    } else if (id === 'shotgun') {
      set(p.barrel, true, { x: 1.7, y: 0.95, z: 1.7 }, { x: 0, y: 0.012, z: -0.7 });
      set(p.muzzle, true, { x: 1.4, y: 0.6, z: 1.4 }, { x: 0, y: 0.012, z: -0.92 });
      set(p.mag, false);
      set(p.opticBase, false);
      set(p.opticTube, false);
      set(p.lens, false);
      set(p.ironSight, true, null, { x: 0, y: 0.055, z: -0.86 });
      this.adsHeight = 0.055;
    } else if (id === 'sniper') {
      set(p.barrel, true, { z: 1.5 }, { x: 0, y: 0.012, z: -0.95 });
      set(p.muzzle, true, null, { x: 0, y: 0.012, z: -1.32 });
      set(p.opticTube, true, { x: 1.5, y: 1.35, z: 1.5 }, { x: 0, y: 0.135, z: -0.26 });
      set(p.lens, true, { x: 1.5, y: 1.5 }, { x: 0, y: 0.135, z: -0.36 });
      set(p.ironSight, false);
      this.adsHeight = 0.135;
    } else {
      this.adsHeight = 0.115;
    }
    this.adsPos.set(0, -this.adsHeight * this.baseScale, -0.33);
    this.flash.position.set(0, 0.012, id === 'pistol_s' ? -0.66 : id === 'sniper' ? -1.4 : -0.98);
  }

  switchTo(index) {
    if (index === this.loadout.index || this.switching > 0) return false;
    if (!this.loadout.select(index)) return false;
    this.switching = 0.45;
    this.reloading = 0;
    this.configure();
    this.sfx.reload();
    return true;
  }
  cycle(dir) {
    const next = (this.loadout.index + dir + this.loadout.slots.length) % this.loadout.slots.length;
    return this.switchTo(next);
  }

  onLook(dx, dy) {
    this.swayTarget.x = THREE.MathUtils.clamp(this.swayTarget.x - dx * 3.2, -0.09, 0.09);
    this.swayTarget.y = THREE.MathUtils.clamp(this.swayTarget.y - dy * 3.2, -0.07, 0.07);
  }

  startReload() {
    const s = this.slot;
    if (!s || this.reloading > 0 || this.switching > 0) return;
    if (s.ammo >= s.def.mag || s.reserve <= 0) return;
    this.reloading = s.def.reload;
    this.sfx.reload();
  }

  fire(player, enemies, ctx) {
    const s = this.slot;
    if (!s || this.reloading > 0 || this.switching > 0) return false;
    const def = s.def;
    if (s.ammo <= 0) {
      if (this.cooldown <= 0) {
        this.sfx.dryFire();
        this.cooldown = 0.3;
      }
      return false;
    }
    if (this.cooldown > 0) return false;

    this.cooldown = 60 / def.rpm;
    s.ammo--;
    if (def.silenced) this.sfx.impact();
    else this.sfx.shot();
    ctx.mission.noise(player.pos, def.noise);
    ctx.mission.stats.shots++;

    const adsFactor = 1 - this.ads * 0.55;
    player.recoilKick.x += (def.recoil + Math.random() * def.recoil * 0.6) * adsFactor;
    player.recoilKick.y += (Math.random() - 0.5) * def.recoil * 0.7 * adsFactor;
    this.kickVel += (6 + def.recoil * 260) * adsFactor;
    this.recoil = Math.min(1, this.recoil + 0.14 + def.recoil);

    const origin = new THREE.Vector3();
    this.camera.getWorldPosition(origin);
    const aim = new THREE.Vector3();
    this.camera.getWorldDirection(aim);

    const pellets = def.pellets || 1;
    let anyHit = false;
    for (let i = 0; i < pellets; i++) {
      const dir = aim.clone();
      const spread = (def.spread * adsFactor) * (player.sprinting ? 2.4 : 1) *
                     (player.onGround ? 1 : 1.8) * (0.4 + this.recoil * 0.8);
      dir.x += (Math.random() - 0.5) * spread;
      dir.y += (Math.random() - 0.5) * spread;
      dir.z += (Math.random() - 0.5) * spread;
      dir.normalize();

      const worldHit = this.world.raycast(origin, dir, 320);
      let best = worldHit ? worldHit.t : 320;
      let victim = null;
      for (const e of enemies) {
        if (!e.alive) continue;
        const t = e.rayHit(origin, dir, best);
        if (t && t.t < best) {
          best = t.t;
          victim = { enemy: e, zone: t.zone };
        }
      }
      const end = origin.clone().addScaledVector(dir, best);
      if (i === 0 || pellets <= 3) this.spawnTracer(origin, end);

      if (victim) {
        anyHit = true;
        const wasAlive = victim.enemy.alive;
        victim.enemy.hit(def.damage, victim.zone, dir, ctx);
        this.sfx.flesh();
        ctx.onHit(victim.zone, victim.enemy, end, wasAlive && !victim.enemy.alive);
      } else if (worldHit) {
        if (i === 0) this.sfx.impact();
        this.spawnImpact(end, worldHit.normal);
      }
    }
    if (anyHit) ctx.mission.stats.hits++;

    this.muzzleLight.position.copy(origin).addScaledVector(aim, 0.6);
    this.muzzleLight.intensity = def.silenced ? 6 : 26;
    this.flash.material.opacity = def.silenced ? 0.35 : 0.95;
    this.flash.rotation.z = Math.random() * Math.PI;
    this.flash.scale.setScalar((def.silenced ? 0.5 : 0.8) + Math.random() * 0.5);
    this.ejectShell(origin, aim);
    return true;
  }

  spawnTracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: 0xffd9a2, transparent: true, opacity: 0.8, fog: false
    }));
    this.scene.add(line);
    this.tracers.push({ line, life: 0.05 });
  }

  spawnImpact(point, normal) {
    const puff = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xb9b2a4, transparent: true, opacity: 0.5, fog: false })
    );
    puff.position.copy(point).addScaledVector(normal, 0.04);
    this.scene.add(puff);
    this.decals.push({ mesh: puff, life: 0.35 });
  }

  ejectShell(origin, dir) {
    const shell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 0.03, 6),
      new THREE.MeshStandardMaterial({ color: 0xc8a24a, roughness: 0.35, metalness: 0.9 })
    );
    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    shell.position.copy(origin).addScaledVector(right, 0.12).addScaledVector(dir, 0.15);
    shell.position.y -= 0.12;
    this.scene.add(shell);
    this.shells.push({
      mesh: shell,
      vel: right.multiplyScalar(2 + Math.random()).add(new THREE.Vector3(0, 2.3, 0)),
      spin: new THREE.Vector3(Math.random() * 14, Math.random() * 9, Math.random() * 12),
      life: 2
    });
  }

  update(dt, player, input) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.switching > 0) this.switching -= dt;
    this.recoil = Math.max(0, this.recoil - dt * 1.5);

    const s = this.slot;
    if (this.reloading > 0 && s) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        const need = s.def.mag - s.ammo;
        const take = Math.min(need, s.reserve);
        s.ammo += take;
        s.reserve -= take;
      }
    }

    const wantAds = input.ads && this.reloading <= 0 && this.switching <= 0 && !player.sprinting;
    this.ads += ((wantAds ? 1 : 0) - this.ads) * Math.min(1, 14 * dt);

    this.sway.lerp(this.swayTarget, Math.min(1, 10 * dt));
    this.swayTarget.multiplyScalar(Math.max(0, 1 - 6 * dt));
    this.kickVel -= this.kick * 190 * dt;
    this.kickVel *= Math.max(0, 1 - 11 * dt);
    this.kick += this.kickVel * dt;

    const base = new THREE.Vector3().lerpVectors(this.hipPos, this.adsPos, this.ads);
    const bobX = Math.sin(player.bob) * 0.016 * player.bobAmount * (1 - this.ads * 0.85);
    const bobY = Math.abs(Math.cos(player.bob)) * 0.012 * player.bobAmount * (1 - this.ads * 0.85);
    this.sprintMix += ((player.sprinting ? 1 : 0) - this.sprintMix) * Math.min(1, 8 * dt);
    const swap = this.switching > 0 ? Math.sin((0.45 - this.switching) / 0.45 * Math.PI) : 0;

    this.group.position.set(
      base.x + this.sway.x + bobX + this.sprintMix * 0.07,
      base.y + this.sway.y + bobY - player.landDip * 0.05 - this.sprintMix * 0.05 - swap * 0.22,
      base.z + this.kick * 0.05
    );
    this.group.rotation.set(
      -this.sway.y * 2.2 + this.kick * 0.09 + this.sprintMix * 0.22 + swap * 0.5,
      this.sway.x * 2.0 + this.sprintMix * 0.5,
      this.sway.x * 1.1 + this.sprintMix * 0.18 +
        (this.reloading > 0 ? Math.sin(this.reloading * 6) * 0.25 : 0)
    );
    if (this.reloading > 0 && s) {
      this.group.position.y -= 0.12 * Math.sin((s.def.reload - this.reloading) / s.def.reload * Math.PI);
    }

    this.muzzleLight.intensity *= Math.max(0, 1 - 22 * dt);
    this.flash.material.opacity *= Math.max(0, 1 - 26 * dt);

    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.05) * 0.8;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        t.line.material.dispose();
        this.tracers.splice(i, 1);
      }
    }
    for (let i = this.decals.length - 1; i >= 0; i--) {
      const d = this.decals[i];
      d.life -= dt;
      d.mesh.scale.setScalar(1 + (0.35 - d.life) * 3);
      d.mesh.material.opacity = Math.max(0, d.life / 0.35) * 0.5;
      if (d.life <= 0) {
        this.scene.remove(d.mesh);
        d.mesh.geometry.dispose();
        d.mesh.material.dispose();
        this.decals.splice(i, 1);
      }
    }
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const sh = this.shells[i];
      sh.life -= dt;
      sh.vel.y -= 16 * dt;
      sh.mesh.position.addScaledVector(sh.vel, dt);
      sh.mesh.rotation.x += sh.spin.x * dt;
      sh.mesh.rotation.z += sh.spin.z * dt;
      if (sh.mesh.position.y < 0.02) {
        sh.mesh.position.y = 0.02;
        sh.vel.set(0, 0, 0);
        sh.spin.set(0, 0, 0);
      }
      if (sh.life <= 0) {
        this.scene.remove(sh.mesh);
        sh.mesh.geometry.dispose();
        sh.mesh.material.dispose();
        this.shells.splice(i, 1);
      }
    }
  }
}
