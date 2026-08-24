/* Greyline - hostiles.
   A soldier is a handful of boxes with a walk cycle, driven by a small state
   machine: hold position until they can see you, then close, strafe and fire
   in bursts from cover. Hits are resolved analytically against a capsule and
   a head sphere, so there is a real headshot to find. */
import * as THREE from 'three';

const HEAD_Y = 1.62;
const BODY_TOP = 1.5;
const BODY_BOTTOM = 0.35;
const BODY_R = 0.32;
const HEAD_R = 0.17;

let sharedGeo = null;
function geos() {
  if (!sharedGeo) {
    sharedGeo = {
      torso: new THREE.BoxGeometry(0.46, 0.62, 0.26),
      vest: new THREE.BoxGeometry(0.5, 0.42, 0.32),
      head: new THREE.BoxGeometry(0.21, 0.24, 0.23),
      helmet: new THREE.BoxGeometry(0.25, 0.12, 0.27),
      arm: new THREE.BoxGeometry(0.12, 0.5, 0.13),
      leg: new THREE.BoxGeometry(0.16, 0.72, 0.18),
      gun: new THREE.BoxGeometry(0.07, 0.09, 0.55)
    };
  }
  return sharedGeo;
}

export class Enemy {
  constructor(world, position, scene) {
    this.world = world;
    this.scene = scene;
    this.pos = position.clone();
    this.pos.y = 0;
    this.vel = new THREE.Vector3();
    this.health = 100;
    this.alive = true;
    this.state = 'idle';
    this.fireTimer = 0;
    this.burst = 0;
    this.reactTimer = 0;
    this.strafe = Math.random() > 0.5 ? 1 : -1;
    this.strafeTimer = 0;
    this.walkCycle = Math.random() * 10;
    this.yaw = Math.random() * Math.PI * 2;
    this.deathTimer = 0;
    this.build();
  }

  build() {
    const g = geos();
    const cloth = new THREE.MeshStandardMaterial({ color: 0x555a4a, roughness: 0.92 });
    const vest = new THREE.MeshStandardMaterial({ color: 0x3b3f38, roughness: 0.8 });
    const skin = new THREE.MeshStandardMaterial({ color: 0x9a7654, roughness: 0.85 });
    const gear = new THREE.MeshStandardMaterial({ color: 0x2a2d28, roughness: 0.7, metalness: 0.3 });

    this.group = new THREE.Group();
    const add = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      this.group.add(m);
      return m;
    };
    this.torso = add(g.torso, cloth, 0, 1.16, 0);
    add(g.vest, vest, 0, 1.2, 0);
    this.head = add(g.head, skin, 0, HEAD_Y, 0);
    add(g.helmet, gear, 0, HEAD_Y + 0.15, -0.01);
    this.armL = add(g.arm, cloth, -0.3, 1.12, -0.02);
    this.armR = add(g.arm, cloth, 0.3, 1.12, -0.02);
    this.legL = add(g.leg, cloth, -0.13, 0.42, 0);
    this.legR = add(g.leg, cloth, 0.13, 0.42, 0);
    this.gun = add(g.gun, gear, 0.22, 1.16, -0.3);
    this.scene.add(this.group);
  }

  /** Ray against the body capsule and the head sphere. */
  rayHit(origin, dir, maxT) {
    const c = this.pos;
    /* head first, it scores better */
    const hx = origin.x - c.x, hy = origin.y - (c.y + HEAD_Y), hz = origin.z - c.z;
    const b = hx * dir.x + hy * dir.y + hz * dir.z;
    const cc = hx * hx + hy * hy + hz * hz - HEAD_R * HEAD_R;
    const disc = b * b - cc;
    if (disc > 0) {
      const t = -b - Math.sqrt(disc);
      if (t > 0 && t < maxT) return { t, head: true };
    }
    /* body: vertical cylinder, clipped to the torso span */
    const dx = origin.x - c.x, dz = origin.z - c.z;
    const a2 = dir.x * dir.x + dir.z * dir.z;
    if (a2 > 1e-6) {
      const b2 = dx * dir.x + dz * dir.z;
      const c2 = dx * dx + dz * dz - BODY_R * BODY_R;
      const d2 = b2 * b2 - a2 * c2;
      if (d2 > 0) {
        const t = (-b2 - Math.sqrt(d2)) / a2;
        if (t > 0 && t < maxT) {
          const y = origin.y + dir.y * t - c.y;
          if (y > BODY_BOTTOM && y < BODY_TOP) return { t, head: false };
        }
      }
    }
    return null;
  }

  hit(damage, dir) {
    if (!this.alive) return;
    this.health -= damage;
    this.state = 'engage';
    this.reactTimer = Math.min(this.reactTimer, 0.15);
    if (this.health <= 0) {
      this.alive = false;
      this.deathTimer = 0;
      this.deathDir = dir.clone();
    }
  }

  canSee(target) {
    const from = new THREE.Vector3(this.pos.x, this.pos.y + 1.45, this.pos.z);
    const to = target.clone();
    const dir = to.clone().sub(from);
    const dist = dir.length();
    if (dist > 95) return false;
    dir.divideScalar(dist);
    const hit = this.world.raycast(from, dir, dist);
    return !hit;
  }

  update(dt, player, sfx, onShoot) {
    if (!this.alive) {
      /* topple over, then sink and stop */
      this.deathTimer += dt;
      const t = Math.min(1, this.deathTimer / 0.65);
      const fall = t * t * (3 - 2 * t);
      this.group.rotation.x = fall * (Math.PI / 2) * 0.95;
      this.group.position.y = this.pos.y - fall * 0.42;
      if (this.deathTimer > 8) this.group.visible = false;
      return;
    }

    const eye = new THREE.Vector3(player.pos.x, player.pos.y + player.eyeOffset, player.pos.z);
    const toPlayer = new THREE.Vector3(player.pos.x - this.pos.x, 0, player.pos.z - this.pos.z);
    const dist = toPlayer.length();
    const sees = player.alive && this.canSee(eye);

    if (this.state === 'idle') {
      if (sees && dist < 70) {
        this.state = 'alert';
        this.reactTimer = 0.35 + Math.random() * 0.45;
      }
    } else if (this.state === 'alert') {
      this.reactTimer -= dt;
      if (this.reactTimer <= 0) this.state = 'engage';
    }

    let move = new THREE.Vector3();
    if (this.state === 'engage') {
      this.yaw = Math.atan2(toPlayer.x, toPlayer.z);
      const forward = toPlayer.clone().normalize();
      const right = new THREE.Vector3(forward.z, 0, -forward.x);
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) {
        this.strafeTimer = 0.8 + Math.random() * 1.4;
        this.strafe = Math.random() > 0.5 ? 1 : -1;
      }
      /* hold a fighting distance, sidestep while shooting */
      const want = 14;
      const closing = THREE.MathUtils.clamp((dist - want) / 8, -1, 1);
      move.addScaledVector(forward, closing * 2.9);
      move.addScaledVector(right, this.strafe * (sees ? 1.6 : 0.4));

      if (sees) {
        this.fireTimer -= dt;
        if (this.fireTimer <= 0) {
          if (this.burst > 0) {
            this.burst--;
            this.fireTimer = 0.12;
            this._shoot(player, sfx, onShoot, dist);
          } else {
            this.burst = 2 + Math.floor(Math.random() * 4);
            this.fireTimer = 0.9 + Math.random() * 1.1;
          }
        }
      }
    } else if (sees) {
      this.yaw = Math.atan2(toPlayer.x, toPlayer.z);
    }

    this.vel.lerp(move, Math.min(1, 6 * dt));
    this.pos.addScaledVector(this.vel, dt);
    this.pos.y += 0;
    /* keep them on the street and out of walls */
    const probe = new THREE.Vector3(this.pos.x, 0.9, this.pos.z);
    this.world.resolve(probe, 0.36, 0.85);
    this.pos.x = probe.x;
    this.pos.z = probe.z;

    /* animation */
    const speed = Math.hypot(this.vel.x, this.vel.z);
    this.walkCycle += speed * dt * 2.6;
    const swing = Math.sin(this.walkCycle) * Math.min(1, speed / 2.5);
    this.legL.rotation.x = swing * 0.75;
    this.legR.rotation.x = -swing * 0.75;
    this.armL.rotation.x = -swing * 0.4;
    this.torso.rotation.z = Math.sin(this.walkCycle * 2) * 0.02 * Math.min(1, speed / 2);

    this.group.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.group.rotation.y = this.yaw;
  }

  _shoot(player, sfx, onShoot, dist) {
    const from = new THREE.Vector3(this.pos.x, this.pos.y + 1.45, this.pos.z);
    const eye = new THREE.Vector3(player.pos.x, player.pos.y + player.eyeOffset, player.pos.z);
    const dir = eye.clone().sub(from).normalize();
    /* accuracy falls off with range and improves the longer they engage */
    const spread = THREE.MathUtils.clamp(0.02 + dist * 0.0016, 0.02, 0.1);
    dir.x += (Math.random() - 0.5) * spread;
    dir.y += (Math.random() - 0.5) * spread;
    dir.z += (Math.random() - 0.5) * spread;
    dir.normalize();
    sfx.distantShot();
    onShoot(from, dir);

    const wall = this.world.raycast(from, dir, dist + 2);
    if (wall && wall.t < dist - 0.5) return;
    /* did the shot pass close enough to count as a hit on the player capsule */
    const rel = eye.clone().sub(from);
    const along = rel.dot(dir);
    const perp = rel.clone().addScaledVector(dir, -along).length();
    if (perp < 0.42 && along > 0) {
      player.damage(7 + Math.random() * 6);
      sfx.hurt();
    }
  }

  dispose() {
    this.scene.remove(this.group);
  }
}

export function spawnWave(world, scene, count, avoid) {
  const list = [];
  const pool = world.spawns.filter(p => p.distanceTo(avoid) > 26);
  for (let i = 0; i < count; i++) {
    const p = pool.length ? pool[(i * 7 + 3) % pool.length] : new THREE.Vector3(0, 0, -40);
    const jitter = new THREE.Vector3((Math.random() - 0.5) * 4, 0, (Math.random() - 0.5) * 6);
    list.push(new Enemy(world, p.clone().add(jitter), scene));
  }
  return list;
}
