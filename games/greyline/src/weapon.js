/* Greyline - the viewmodel and everything the trigger sets off.
   The rifle is built from primitives in code, then driven by springs: sway
   from mouse movement, bob from footfalls, recoil and the ADS transition. */
import * as THREE from 'three';

export class Weapon {
  constructor(camera, scene, world, sfx) {
    this.camera = camera;
    this.scene = scene;
    this.world = world;
    this.sfx = sfx;

    this.magSize = 30;
    this.ammo = this.magSize;
    this.reserve = 210;
    this.rpm = 720;
    this.damage = 26;
    this.reloading = 0;
    this.cooldown = 0;
    this.ads = 0;               /* 0 hip .. 1 aimed */
    this.spread = 0.022;
    this.recoil = 0;

    this.sway = new THREE.Vector2();
    this.swayTarget = new THREE.Vector2();
    this.kick = 0;
    this.kickVel = 0;

    this.group = new THREE.Group();
    this.group.renderOrder = 10;
    this.build();
    camera.add(this.group);

    this.tracers = [];
    this.decals = [];
    this.shells = [];
    this.muzzleLight = new THREE.PointLight(0xffcf8a, 0, 14, 2);
    scene.add(this.muzzleLight);

    const flashGeo = new THREE.PlaneGeometry(0.42, 0.42);
    this.flash = new THREE.Mesh(flashGeo, new THREE.MeshBasicMaterial({
      color: 0xffd9a0, transparent: true, opacity: 0, depthWrite: false, fog: false
    }));
    this.flash.position.set(0, 0, -0.94);
    this.group.add(this.flash);
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
      m.castShadow = false;
      m.receiveShadow = false;
      this.group.add(m);
      return m;
    };

    const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    const cyl = (r, h, s = 12) => new THREE.CylinderGeometry(r, r, h, s);

    /* receiver, handguard, barrel */
    add(box(0.085, 0.11, 0.42), polymer, 0, 0, -0.18);
    add(box(0.075, 0.085, 0.34), dark, 0, 0.005, -0.5);
    add(cyl(0.016, 0.46), dark, 0, 0.012, -0.72, Math.PI / 2);
    add(cyl(0.026, 0.09), dark, 0, 0.012, -0.95, Math.PI / 2);      /* muzzle brake */
    /* magazine, grip, stock */
    add(box(0.05, 0.2, 0.09), polymer, 0, -0.14, -0.12, 0.22);
    add(box(0.05, 0.16, 0.075), grip, 0, -0.115, 0.02, -0.32);
    add(box(0.065, 0.09, 0.26), polymer, 0, -0.01, 0.2);
    add(box(0.05, 0.13, 0.05), polymer, 0, -0.03, 0.31);
    /* optic */
    add(box(0.05, 0.035, 0.16), dark, 0, 0.085, -0.24);
    add(cyl(0.032, 0.13, 14), dark, 0, 0.115, -0.24, Math.PI / 2);
    this.lens = add(new THREE.CircleGeometry(0.028, 16), glassM, 0, 0.115, -0.31);
    /* iron sight posts either side of the optic */
    add(box(0.006, 0.03, 0.006), dark, 0, 0.055, -0.86);
    /* hands */
    add(box(0.075, 0.075, 0.14), hands, 0.005, -0.075, -0.46, 0.2);
    add(box(0.07, 0.09, 0.1), hands, 0.005, -0.085, 0.0, -0.3);

    /* Scale the whole viewmodel down, then park the optic dead centre for
       the aimed pose: local optic height 0.115 * scale. */
    const s = 0.40;
    this.group.scale.setScalar(s);
    this.hipPos = new THREE.Vector3(0.17, -0.15, -0.42);
    this.adsPos = new THREE.Vector3(0, -0.115 * s, -0.33);
    this.group.position.copy(this.hipPos);
  }

  onLook(dx, dy) {
    this.swayTarget.x = THREE.MathUtils.clamp(this.swayTarget.x - dx * 3.2, -0.09, 0.09);
    this.swayTarget.y = THREE.MathUtils.clamp(this.swayTarget.y - dy * 3.2, -0.07, 0.07);
  }

  startReload() {
    if (this.reloading > 0 || this.ammo === this.magSize || this.reserve <= 0) return;
    this.reloading = 1.55;
    this.sfx.reload();
  }

  canFire() {
    return this.cooldown <= 0 && this.reloading <= 0 && this.ammo > 0;
  }

  fire(player, enemies, onHit) {
    if (this.reloading > 0) return false;
    if (this.ammo <= 0) {
      if (this.cooldown <= 0) {
        this.sfx.dryFire();
        this.cooldown = 0.25;
      }
      return false;
    }
    if (this.cooldown > 0) return false;

    this.cooldown = 60 / this.rpm;
    this.ammo--;
    this.sfx.shot();

    /* recoil: camera kick plus viewmodel punch, tighter when aimed */
    const adsFactor = 1 - this.ads * 0.55;
    player.recoilKick.x += (0.012 + Math.random() * 0.008) * adsFactor;
    player.recoilKick.y += (Math.random() - 0.5) * 0.009 * adsFactor;
    this.kickVel += 9 * adsFactor;
    this.recoil = Math.min(1, this.recoil + 0.16);

    const origin = new THREE.Vector3();
    this.camera.getWorldPosition(origin);
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);

    const spread = (this.spread * adsFactor) * (player.sprinting ? 2.4 : 1) *
                   (player.onGround ? 1 : 1.9) * (0.35 + this.recoil);
    dir.x += (Math.random() - 0.5) * spread;
    dir.y += (Math.random() - 0.5) * spread;
    dir.z += (Math.random() - 0.5) * spread;
    dir.normalize();

    const worldHit = this.world.raycast(origin, dir, 300);
    let best = worldHit ? worldHit.t : 300;
    let victim = null;
    for (const e of enemies) {
      if (!e.alive) continue;
      const t = e.rayHit(origin, dir, best);
      if (t && t.t < best) {
        best = t.t;
        victim = { enemy: e, head: t.head, point: origin.clone().addScaledVector(dir, t.t) };
      }
    }

    const end = origin.clone().addScaledVector(dir, best);
    this.spawnTracer(origin, end);
    this.muzzleLight.position.copy(origin).addScaledVector(dir, 0.6);
    this.muzzleLight.intensity = 26;
    this.flash.material.opacity = 0.95;
    this.flash.rotation.z = Math.random() * Math.PI;
    this.flash.scale.setScalar(0.8 + Math.random() * 0.5);
    this.ejectShell(origin, dir);

    if (victim) {
      victim.enemy.hit(victim.head ? this.damage * 2.6 : this.damage, dir);
      this.sfx.flesh();
      onHit(victim.head, victim.enemy, victim.point);
    } else if (worldHit) {
      this.sfx.impact();
      this.spawnImpact(end, worldHit.normal);
    }
    return true;
  }

  spawnTracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: 0xffd9a2, transparent: true, opacity: 0.85, fog: false
    }));
    this.scene.add(line);
    this.tracers.push({ line, life: 0.06 });
  }

  spawnImpact(point, normal) {
    const puff = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xb9b2a4, transparent: true, opacity: 0.55, fog: false })
    );
    puff.position.copy(point).addScaledVector(normal, 0.04);
    this.scene.add(puff);
    this.decals.push({ mesh: puff, life: 0.4, normal });
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
      vel: right.multiplyScalar(2.2 + Math.random()).add(new THREE.Vector3(0, 2.4, 0)),
      spin: new THREE.Vector3(Math.random() * 14, Math.random() * 9, Math.random() * 12),
      life: 2.2
    });
  }

  update(dt, player, input) {
    if (this.cooldown > 0) this.cooldown -= dt;
    this.recoil = Math.max(0, this.recoil - dt * 1.4);

    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        const need = this.magSize - this.ammo;
        const take = Math.min(need, this.reserve);
        this.ammo += take;
        this.reserve -= take;
      }
    }

    const wantAds = input.ads && this.reloading <= 0 && !player.sprinting;
    this.ads += ((wantAds ? 1 : 0) - this.ads) * Math.min(1, 14 * dt);

    /* springs */
    this.sway.lerp(this.swayTarget, Math.min(1, 10 * dt));
    this.swayTarget.multiplyScalar(Math.max(0, 1 - 6 * dt));
    this.kickVel -= this.kick * 190 * dt;
    this.kickVel *= Math.max(0, 1 - 11 * dt);
    this.kick += this.kickVel * dt;

    const base = new THREE.Vector3().lerpVectors(this.hipPos, this.adsPos, this.ads);
    const bobX = Math.sin(player.bob) * 0.016 * player.bobAmount * (1 - this.ads * 0.85);
    const bobY = Math.abs(Math.cos(player.bob)) * 0.012 * player.bobAmount * (1 - this.ads * 0.85);
    const sprintTilt = player.sprinting ? 1 : 0;
    this.sprintMix = (this.sprintMix || 0) + ((sprintTilt) - (this.sprintMix || 0)) * Math.min(1, 8 * dt);

    this.group.position.set(
      base.x + this.sway.x + bobX + this.sprintMix * 0.07,
      base.y + this.sway.y + bobY - player.landDip * 0.05 - this.sprintMix * 0.05,
      base.z + this.kick * 0.05
    );
    this.group.rotation.set(
      -this.sway.y * 2.2 + this.kick * 0.09 + this.sprintMix * 0.22,
      this.sway.x * 2.0 + this.sprintMix * 0.5,
      this.sway.x * 1.1 + this.sprintMix * 0.18 +
        (this.reloading > 0 ? Math.sin(this.reloading * 6) * 0.25 : 0)
    );
    if (this.reloading > 0) this.group.position.y -= 0.12 * Math.sin((1.55 - this.reloading) * 2.0);

    /* muzzle flash + light decay */
    this.muzzleLight.intensity *= Math.max(0, 1 - 22 * dt);
    this.flash.material.opacity *= Math.max(0, 1 - 26 * dt);

    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.06) * 0.85;
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
      d.mesh.scale.setScalar(1 + (0.4 - d.life) * 3);
      d.mesh.material.opacity = Math.max(0, d.life / 0.4) * 0.55;
      if (d.life <= 0) {
        this.scene.remove(d.mesh);
        d.mesh.geometry.dispose();
        d.mesh.material.dispose();
        this.decals.splice(i, 1);
      }
    }
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.life -= dt;
      s.vel.y -= 16 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mesh.rotation.x += s.spin.x * dt;
      s.mesh.rotation.z += s.spin.z * dt;
      if (s.mesh.position.y < 0.02) {
        s.mesh.position.y = 0.02;
        s.vel.set(0, 0, 0);
        s.spin.set(0, 0, 0);
      }
      if (s.life <= 0) {
        this.scene.remove(s.mesh);
        s.mesh.geometry.dispose();
        s.mesh.material.dispose();
        this.shells.splice(i, 1);
      }
    }
  }
}
