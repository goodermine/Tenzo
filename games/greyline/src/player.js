/* Greyline - first-person controller.
   Capsule against the world AABBs, with the movement feel doing most of the
   work: acceleration, head bob, landing dip, lean into strafes, ADS. */
import * as THREE from 'three';

const EYE_STAND = 1.68;
const EYE_CROUCH = 1.05;
const RADIUS = 0.34;

export class Player {
  constructor(world, camera) {
    this.world = world;
    this.camera = camera;
    this.pos = world.playerStart.clone();
    this.vel = new THREE.Vector3();
    this.yaw = 0;            /* facing the archway at the far end */
    this.pitch = 0;
    this.onGround = false;
    this.crouch = false;
    this.sprinting = false;
    this.eye = EYE_STAND;
    this.eyeOffset = EYE_STAND * 0.5 - 0.12;
    this.halfHeight = EYE_STAND * 0.5 + 0.12;
    this.health = 100;
    this.maxHealth = 100;
    this.hurtTimer = 0;
    this.regenDelay = 0;
    this.bob = 0;
    this.bobAmount = 0;
    this.landDip = 0;
    this.lean = 0;
    this.recoilKick = new THREE.Vector2();
    this.alive = true;
    this.stepDistance = 0;
    this.onStep = null;
  }

  look(dx, dy) {
    this.yaw -= dx;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
  }

  damage(amount) {
    if (!this.alive) return;
    this.health -= amount;
    this.hurtTimer = 0.55;
    this.regenDelay = 4.5;
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
    }
  }

  update(dt, input) {
    const wasGround = this.onGround;

    /* wish direction in world space */
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const wish = new THREE.Vector3();
    if (input.forward) wish.add(forward);
    if (input.back) wish.sub(forward);
    if (input.right) wish.add(right);
    if (input.left) wish.sub(right);
    const moving = wish.lengthSq() > 0.0001;
    if (moving) wish.normalize();

    this.crouch = !!input.crouch;
    this.sprinting = !!input.sprint && input.forward && !this.crouch && !input.ads;

    let speed = this.crouch ? 2.1 : this.sprinting ? 6.4 : 4.3;
    if (input.ads) speed *= 0.55;

    /* ground control is snappy, air control deliberately weak */
    const accel = this.onGround ? 46 : 9;
    const target = wish.multiplyScalar(speed);
    this.vel.x += (target.x - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (target.z - this.vel.z) * Math.min(1, accel * dt);
    if (this.onGround && !moving) {
      const friction = Math.max(0, 1 - 12 * dt);
      this.vel.x *= friction;
      this.vel.z *= friction;
    }

    this.vel.y -= 19.5 * dt;
    if (input.jump && this.onGround) {
      this.vel.y = 6.3;
      this.onGround = false;
    }

    const half = (this.crouch ? EYE_CROUCH : EYE_STAND) * 0.5 + 0.12;
    this.halfHeight = half;
    this.pos.addScaledVector(this.vel, dt);
    const grounded = this.world.resolve(this.pos, RADIUS, half);
    if (grounded && this.vel.y < 0) this.vel.y = 0;
    this.onGround = grounded;

    /* fell out of the level */
    if (this.pos.y < -8) {
      this.pos.copy(this.world.playerStart);
      this.vel.set(0, 0, 0);
    }

    /* --- feel ---------------------------------------------------------- */
    const targetEye = this.crouch ? EYE_CROUCH : EYE_STAND;
    this.eye += (targetEye - this.eye) * Math.min(1, 12 * dt);

    const planarSpeed = Math.hypot(this.vel.x, this.vel.z);
    this.stepDistance += planarSpeed * dt;
    const stride = this.sprinting ? 1.55 : 1.9;
    if (this.onGround && this.stepDistance > stride) {
      this.stepDistance = 0;
      if (this.onStep) this.onStep(this.sprinting ? 1 : 0.6);
    }

    const bobTarget = this.onGround ? Math.min(1, planarSpeed / 4.3) : 0;
    this.bobAmount += (bobTarget - this.bobAmount) * Math.min(1, 8 * dt);
    this.bob += planarSpeed * dt * (this.sprinting ? 7.4 : 8.6);

    if (!wasGround && this.onGround && this.vel.y <= 0) this.landDip = 1;
    this.landDip *= Math.max(0, 1 - 7 * dt);

    const strafe = this.vel.x * Math.cos(this.yaw) - this.vel.z * Math.sin(this.yaw);
    this.lean += (THREE.MathUtils.clamp(-strafe * 0.11, -0.45, 0.45) - this.lean) * Math.min(1, 7 * dt);

    this.recoilKick.multiplyScalar(Math.max(0, 1 - 9 * dt));

    if (this.hurtTimer > 0) this.hurtTimer -= dt;
    if (this.regenDelay > 0) {
      this.regenDelay -= dt;
    } else if (this.health < this.maxHealth && this.alive) {
      this.health = Math.min(this.maxHealth, this.health + 14 * dt);
    }

    /* --- camera -------------------------------------------------------- */
    const bobX = Math.sin(this.bob) * 0.035 * this.bobAmount;
    const bobY = Math.abs(Math.cos(this.bob)) * 0.045 * this.bobAmount;
    /* `pos` is the capsule centre, so the eye rides above its feet */
    this.eyeOffset = this.eye - half;
    this.camera.position.set(
      this.pos.x + bobX * Math.cos(this.yaw),
      this.pos.y + this.eyeOffset + bobY - this.landDip * 0.16,
      this.pos.z - bobX * Math.sin(this.yaw)
    );
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(this.yaw + this.recoilKick.y);
    this.camera.rotateX(this.pitch + this.recoilKick.x);
    this.camera.rotateZ(this.lean * 0.35 + Math.sin(this.bob * 0.5) * 0.006 * this.bobAmount);
  }
}
