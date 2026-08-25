/* Greyline - facility guards.
   A guard walks a patrol until something breaks it: seeing you, or hearing a
   shot. Then they react, close, and - if the alarm is still live - radio it
   in, which is what makes a silenced weapon and the alarm room worth caring
   about. Shots resolve against head, torso and limbs separately. */
import * as THREE from 'three';
import { GUARD_WEAPONS, WEAPONS } from './weapons.js';

const HEAD_Y = 1.62;
const HEAD_R = 0.18;
const TORSO_TOP = 1.5;
const TORSO_BOTTOM = 0.95;
const LEG_BOTTOM = 0.2;
const BODY_R = 0.32;

const ZONE_MULT = { head: 2.7, torso: 1.0, limb: 0.55 };

let sharedGeo = null;
function geos() {
  if (!sharedGeo) {
    sharedGeo = {
      torso: new THREE.BoxGeometry(0.46, 0.62, 0.26),
      vest: new THREE.BoxGeometry(0.5, 0.44, 0.32),
      head: new THREE.BoxGeometry(0.21, 0.24, 0.23),
      helmet: new THREE.BoxGeometry(0.26, 0.13, 0.28),
      beret: new THREE.BoxGeometry(0.27, 0.08, 0.29),
      arm: new THREE.BoxGeometry(0.12, 0.5, 0.13),
      leg: new THREE.BoxGeometry(0.16, 0.74, 0.18),
      gun: new THREE.BoxGeometry(0.07, 0.09, 0.55),
      radio: new THREE.BoxGeometry(0.09, 0.16, 0.06)
    };
  }
  return sharedGeo;
}

export class Enemy {
  constructor(world, position, scene, opts = {}) {
    this.world = world;
    this.facility = world.facility;
    this.scene = scene;
    this.pos = position.clone();
    this.pos.y = 0;
    this.vel = new THREE.Vector3();

    this.maxHealth = opts.health || 100;
    this.health = this.maxHealth;
    this.damage = opts.damage || 9;
    this.accuracy = opts.accuracy == null ? 0.05 : opts.accuracy;
    this.reaction = opts.reaction == null ? 0.5 : opts.reaction;
    this.commander = !!opts.commander;
    if (this.commander) {
      this.maxHealth = this.health = this.maxHealth * 2.2;
    }
    this.weaponId = opts.weapon || GUARD_WEAPONS[Math.floor(Math.random() * GUARD_WEAPONS.length)];

    this.alive = true;
    this.state = 'patrol';
    this.yaw = Math.random() * Math.PI * 2;
    this.walkCycle = Math.random() * 10;
    this.fireTimer = 0.6;
    this.burst = 0;
    this.reactTimer = 0;
    this.callTimer = 0;
    this.searchTimer = 0;
    this.strafe = Math.random() > 0.5 ? 1 : -1;
    this.strafeTimer = 0;
    this.path = null;
    this.repathTimer = Math.random() * 0.5;
    this.target = null;
    this.lastKnown = null;
    this.heardUntil = 0;
    this.stagger = null;
    this.deathTimer = 0;
    this.patrolAnchor = position.clone();
    this.build();
  }

  build() {
    const g = geos();
    const clothColor = this.commander ? 0x2f3a44 : 0x555a4a;
    const cloth = new THREE.MeshStandardMaterial({ color: clothColor, roughness: 0.92 });
    const vest = new THREE.MeshStandardMaterial({
      color: this.commander ? 0x23282e : 0x3b3f38, roughness: 0.8
    });
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
    this.hat = add(this.commander ? g.beret : g.helmet, gear, 0, HEAD_Y + 0.15, -0.01);
    if (this.commander) this.hat.material = new THREE.MeshStandardMaterial({ color: 0x6d2b2b, roughness: 0.9 });
    this.armL = add(g.arm, cloth, -0.3, 1.12, -0.02);
    this.armR = add(g.arm, cloth, 0.3, 1.12, -0.02);
    this.legL = add(g.leg, cloth, -0.13, 0.42, 0);
    this.legR = add(g.leg, cloth, 0.13, 0.42, 0);
    this.gun = add(g.gun, gear, 0.22, 1.16, -0.3);
    this.radio = add(g.radio, gear, -0.3, 1.3, 0.1);
    this.radio.visible = false;
    this.scene.add(this.group);
  }

  /* --- damage ---------------------------------------------------------- */

  rayHit(origin, dir, maxT) {
    const c = this.pos;
    const hx = origin.x - c.x, hy = origin.y - (c.y + HEAD_Y), hz = origin.z - c.z;
    const b = hx * dir.x + hy * dir.y + hz * dir.z;
    const cc = hx * hx + hy * hy + hz * hz - HEAD_R * HEAD_R;
    const disc = b * b - cc;
    if (disc > 0) {
      const t = -b - Math.sqrt(disc);
      if (t > 0 && t < maxT) return { t, zone: 'head' };
    }
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
          if (y >= TORSO_BOTTOM && y <= TORSO_TOP) return { t, zone: 'torso' };
          if (y >= LEG_BOTTOM && y < TORSO_BOTTOM) return { t, zone: 'limb' };
        }
      }
    }
    return null;
  }

  hit(damage, zone, dir, ctx) {
    if (!this.alive) return;
    this.health -= damage * (ZONE_MULT[zone] || 1);
    this.stagger = { zone, t: 0.34 };
    /* being shot at is information, even if they never saw you */
    if (this.state === 'patrol' || this.state === 'suspicious') {
      this.state = 'engage';
      this.reactTimer = this.reaction * 0.4;
      this.lastKnown = ctx && ctx.player ? ctx.player.pos.clone() : null;
    }
    if (this.health <= 0) this.die(ctx, dir);
  }

  die(ctx, dir) {
    this.alive = false;
    this.deathTimer = 0;
    this.deathDir = dir ? dir.clone() : new THREE.Vector3(0, 0, 1);
    this.radio.visible = false;
    if (ctx && ctx.mission) {
      if (this.commander) ctx.mission.dropIntel(this.pos);
      else if (Math.random() < 0.45) ctx.mission.dropWeapon(this.pos, this.weaponId);
    }
  }

  /* --- senses ---------------------------------------------------------- */

  eyePos() {
    return new THREE.Vector3(this.pos.x, this.pos.y + 1.45, this.pos.z);
  }

  canSee(player) {
    if (!player.alive) return false;
    const from = this.eyePos();
    const to = new THREE.Vector3(player.pos.x, player.pos.y + player.eyeOffset, player.pos.z);
    const dir = to.clone().sub(from);
    const dist = dir.length();
    if (dist > 68) return false;
    dir.divideScalar(dist);
    /* a cone in front, widened once they are already fighting */
    const facing = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const cone = this.state === 'engage' || this.state === 'search' ? -0.2 : 0.35;
    if (facing.dot(dir) < cone) return false;
    const hit = this.world.raycast(from, dir, dist - 0.2);
    return !hit;
  }

  hear(mission) {
    for (const n of mission.noiseEvents) {
      if (n.handled && n.handled.has(this)) continue;
      if (this.pos.distanceTo(n.pos) > n.radius) continue;
      (n.handled = n.handled || new Set()).add(this);
      if (this.state === 'patrol') {
        this.state = 'suspicious';
        this.searchTimer = 9;
      }
      this.lastKnown = n.pos.clone();
      this.path = null;
      this.repathTimer = 0;
    }
  }

  /* --- movement -------------------------------------------------------- */

  moveAlongPath(dt, speed) {
    if (!this.path || !this.path.length) return false;
    const next = this.path[0];
    const to = new THREE.Vector3(next.x - this.pos.x, 0, next.z - this.pos.z);
    const d = to.length();
    if (d < 0.7) {
      this.path.shift();
      return this.path.length > 0;
    }
    to.divideScalar(d);
    this.vel.lerp(to.multiplyScalar(speed), Math.min(1, 7 * dt));
    this.yaw = Math.atan2(to.x, to.z);
    return true;
  }

  repath(dt, goal) {
    this.repathTimer -= dt;
    if (this.repathTimer > 0 && this.path && this.path.length) return;
    this.repathTimer = 0.7 + Math.random() * 0.4;
    if (this.facility && this.facility.inside(this.pos) && this.facility.inside(goal)) {
      this.path = this.facility.path(this.pos, goal);
    } else {
      this.path = [goal.clone()];
    }
  }

  pickPatrolGoal() {
    const posts = this.facility ? this.facility.guardPosts : [];
    if (posts.length && Math.random() < 0.75) {
      return posts[Math.floor(Math.random() * posts.length)].clone();
    }
    const jitter = new THREE.Vector3((Math.random() - 0.5) * 14, 0, (Math.random() - 0.5) * 14);
    return this.patrolAnchor.clone().add(jitter);
  }

  /* --- frame ----------------------------------------------------------- */

  update(dt, ctx) {
    const { player, mission, sfx } = ctx;

    if (!this.alive) {
      this.deathTimer += dt;
      const t = Math.min(1, this.deathTimer / 0.7);
      const fall = t * t * (3 - 2 * t);
      this.group.rotation.x = fall * (Math.PI / 2) * 0.95;
      this.group.position.y = this.pos.y - fall * 0.44;
      if (this.deathTimer > 20) this.group.visible = false;
      return;
    }

    this.hear(mission);
    const sees = this.canSee(player);
    if (sees) this.lastKnown = player.pos.clone();

    if (this.stagger) {
      this.stagger.t -= dt;
      if (this.stagger.t <= 0) this.stagger = null;
    }

    let speed = 2.6;
    switch (this.state) {
      case 'patrol': {
        speed = 1.7;
        if (sees) {
          this.state = 'alert';
          this.reactTimer = this.reaction;
          this.path = null;
          break;
        }
        if (!this.path || !this.path.length) {
          this.target = this.pickPatrolGoal();
          this.repathTimer = 0;
        }
        if (this.target) this.repath(dt, this.target);
        if (!this.moveAlongPath(dt, speed)) this.vel.multiplyScalar(0.85);
        break;
      }
      case 'suspicious': {
        speed = 2.4;
        this.searchTimer -= dt;
        if (sees) {
          this.state = 'alert';
          this.reactTimer = this.reaction * 0.6;
          break;
        }
        if (this.lastKnown) this.repath(dt, this.lastKnown);
        if (!this.moveAlongPath(dt, speed) || this.searchTimer <= 0) {
          this.state = 'patrol';
          this.path = null;
        }
        break;
      }
      case 'alert': {
        this.vel.multiplyScalar(0.8);
        this.reactTimer -= dt;
        if (this.lastKnown) {
          const to = this.lastKnown.clone().sub(this.pos);
          this.yaw = Math.atan2(to.x, to.z);
        }
        if (this.reactTimer <= 0) this.state = 'engage';
        break;
      }
      case 'engage': {
        speed = 3.0;
        /* radio it in unless the panel is already down */
        if (!mission.alarmDisabled && !mission.alarmActive) {
          this.callTimer += dt;
          this.radio.visible = this.callTimer > 0.4;
          if (this.callTimer > 2.4) {
            mission.raiseAlarm();
            this.radio.visible = false;
          }
        } else {
          this.radio.visible = false;
        }

        if (sees) {
          const to = new THREE.Vector3(player.pos.x - this.pos.x, 0, player.pos.z - this.pos.z);
          const dist = to.length();
          this.yaw = Math.atan2(to.x, to.z);
          this.path = null;

          this.strafeTimer -= dt;
          if (this.strafeTimer <= 0) {
            this.strafeTimer = 0.9 + Math.random() * 1.3;
            this.strafe = Math.random() > 0.5 ? 1 : -1;
          }
          const fwd = to.normalize();
          const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
          const want = THREE.MathUtils.clamp((dist - 11) / 7, -1, 1);
          const move = fwd.multiplyScalar(want * 2.6).addScaledVector(right, this.strafe * 1.5);
          this.vel.lerp(move, Math.min(1, 6 * dt));

          this.fireTimer -= dt;
          if (this.fireTimer <= 0) {
            if (this.burst > 0) {
              this.burst--;
              this.fireTimer = 0.13;
              this.shoot(player, mission, sfx, dist);
            } else {
              this.burst = 2 + Math.floor(Math.random() * 4);
              this.fireTimer = 0.8 + Math.random() * 1.0;
            }
          }
        } else if (this.lastKnown) {
          this.repath(dt, this.lastKnown);
          if (!this.moveAlongPath(dt, speed)) {
            this.state = 'search';
            this.searchTimer = 8;
          }
        } else {
          this.state = 'search';
          this.searchTimer = 8;
        }
        break;
      }
      case 'search': {
        speed = 2.5;
        this.searchTimer -= dt;
        if (sees) {
          this.state = 'engage';
          break;
        }
        if (!this.path || !this.path.length) {
          this.target = this.pickPatrolGoal();
          this.repathTimer = 0;
        }
        if (this.target) this.repath(dt, this.target);
        this.moveAlongPath(dt, speed);
        if (this.searchTimer <= 0) {
          this.state = 'patrol';
          this.callTimer = 0;
        }
        break;
      }
      default:
        break;
    }

    /* integrate and push out of the world */
    this.pos.addScaledVector(this.vel, dt);
    const probe = new THREE.Vector3(this.pos.x, 0.95, this.pos.z);
    this.world.resolve(probe, 0.36, 0.9);
    this.pos.x = probe.x;
    this.pos.z = probe.z;

    this.animate(dt);
    this.group.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.group.rotation.y = this.yaw;
  }

  animate(dt) {
    const speed = Math.hypot(this.vel.x, this.vel.z);
    this.walkCycle += speed * dt * 2.6;
    const swing = Math.sin(this.walkCycle) * Math.min(1, speed / 2.5);
    this.legL.rotation.x = swing * 0.8;
    this.legR.rotation.x = -swing * 0.8;
    this.armL.rotation.x = -swing * 0.45;
    this.torso.rotation.z = Math.sin(this.walkCycle * 2) * 0.02 * Math.min(1, speed / 2);
    this.torso.rotation.x = 0;
    this.head.rotation.z = 0;

    /* hit reactions read differently per zone */
    if (this.stagger) {
      const k = this.stagger.t / 0.34;
      if (this.stagger.zone === 'head') {
        this.head.rotation.z = k * 0.5;
        this.torso.rotation.x = -k * 0.2;
      } else if (this.stagger.zone === 'torso') {
        this.torso.rotation.x = -k * 0.35;
        this.armL.rotation.x = -k * 0.6;
      } else {
        this.legL.rotation.x = swing * 0.8 - k * 0.5;
        this.torso.rotation.z = k * 0.25;
      }
    }
  }

  shoot(player, mission, sfx, dist) {
    const from = this.eyePos();
    const eye = new THREE.Vector3(player.pos.x, player.pos.y + player.eyeOffset, player.pos.z);
    const dir = eye.clone().sub(from).normalize();
    const spread = THREE.MathUtils.clamp(this.accuracy + dist * 0.0012, 0.02, 0.12);
    dir.x += (Math.random() - 0.5) * spread;
    dir.y += (Math.random() - 0.5) * spread;
    dir.z += (Math.random() - 0.5) * spread;
    dir.normalize();
    sfx.distantShot();
    mission.noise(this.pos, 30);

    const wall = this.world.raycast(from, dir, dist + 2);
    if (wall && wall.t < dist - 0.6) return;
    const rel = eye.clone().sub(from);
    const along = rel.dot(dir);
    const perp = rel.clone().addScaledVector(dir, -along).length();
    if (perp < 0.45 && along > 0) {
      player.damage(this.damage + Math.random() * 4);
      mission.stats.damageTaken += this.damage;
      sfx.hurt();
    }
  }

  dispose() {
    this.scene.remove(this.group);
  }
}

export function spawnGuards(world, scene, mission, count, avoid) {
  const f = world.facility;
  const cells = f.spawnCells(avoid, 18);
  const list = [];
  const d = mission.diff;
  for (let i = 0; i < count; i++) {
    const p = cells.length ? cells[Math.floor(Math.random() * cells.length)] : avoid.clone();
    list.push(new Enemy(world, p, scene, {
      health: d.health, damage: d.damage, accuracy: d.accuracy, reaction: d.reaction
    }));
  }
  /* the commander only exists when an objective needs him */
  if (mission.wants('intel')) {
    const far = cells.sort((a, b) => b.distanceTo(avoid) - a.distanceTo(avoid))[0] || avoid;
    list.push(new Enemy(world, far, scene, {
      health: d.health, damage: d.damage, accuracy: d.accuracy * 0.7,
      reaction: d.reaction * 0.7, commander: true, weapon: 'rifle'
    }));
  }
  return list;
}
