/* Greyline - the pose overlay, shared by every guard rig.

   Locomotion comes from clips. Aiming, head tracking, recoil and hit
   reactions are layered on top afterwards, because a guard has to track the
   player while it walks and that is one pose driven by two things.

   The overlay is expressed against axes MEASURED from each rig's bind pose
   rather than against world X/Y/Z. That is the difference between an overlay
   that works on one skeleton and one that works on any skeleton: the
   generated rig in rig.js hangs its limb bones along -Y, but a downloaded
   character is usually in a T-pose with the arm bones running along +/-X, and
   a downloaded Z-up rig can point them anywhere at all. Rotating such a rig
   about world X would twist the arms instead of raising them - which reads as
   broken geometry rather than as a bad pose, and is the single easiest way to
   lose a day on this.

   For the generated rig the measured axes come out as exactly X, Y and Z, so
   this is behaviour-preserving there. */
import * as THREE from 'three';

/* Bones whose motion is a limb swinging, rather than the body bending. */
const LIMBS = new Set(['armL', 'armR', 'forearmL', 'forearmR', 'thighL', 'thighR']);

const WORLD_FORWARD = new THREE.Vector3(0, 0, -1);
const WORLD_RIGHT = new THREE.Vector3(1, 0, 0);
const WORLD_UP = new THREE.Vector3(0, 1, 0);

const _q = new THREE.Quaternion();
const _wq = new THREE.Quaternion();

function firstBoneChild(bone) {
  for (const c of bone.children) if (c.isBone) return c;
  return null;
}

/**
 * Build the axis table for a bound skeleton. Call once, after the bones are
 * parented and their world matrices are current - the axes are taken from the
 * bind pose.
 *
 * Each entry holds the three axes that the overlay's (x, y, z) triples turn
 * about:
 *
 *   limb bones   x = swing (tip towards the character's front)
 *                y = twist (about the limb's own length)
 *                z = spread (tip towards the character's right)
 *
 *   torso/head   x = pitch, y = yaw, z = roll, about the character's own axes
 *
 * @param bones Map of logical name -> Bone
 */
export function computeBoneAxes(bones) {
  const axes = new Map();

  for (const [logical, bone] of bones) {
    bone.getWorldQuaternion(_wq);
    const inv = _wq.clone().invert();
    /* The character's own axes, expressed in this bone's bind frame. */
    const fwd = WORLD_FORWARD.clone().applyQuaternion(inv);
    const right = WORLD_RIGHT.clone().applyQuaternion(inv);
    const up = WORLD_UP.clone().applyQuaternion(inv);

    let a = null, b = null, c = null;

    if (LIMBS.has(logical)) {
      const child = firstBoneChild(bone);
      const dir = child ? child.position.clone() : null;
      if (dir && dir.lengthSq() > 1e-10) {
        dir.normalize();
        /* Rotating about (dir x fwd) moves the tip along fwd; about
           (dir x right) it moves along right. Both degenerate when the limb
           already points that way, so each falls back to a body axis. */
        const swing = dir.clone().cross(fwd);
        const spread = dir.clone().cross(right);
        a = swing.lengthSq() > 1e-6 ? swing.normalize() : right.clone();
        b = dir.clone().negate();
        c = spread.lengthSq() > 1e-6 ? spread.normalize() : up.clone().negate();
      }
    }

    if (!a) {
      a = right;
      b = up;
      c = fwd.clone().negate();
    }
    axes.set(logical, { a, b, c });
  }

  return axes;
}

/**
 * Apply the overlay on top of whatever the mixer just wrote.
 *
 * @param bones  Map of logical name -> Bone
 * @param axes   from computeBoneAxes
 * @param aim        0..1, how much the guard is levelling its weapon
 * @param lookYaw    head turn, radians, relative to the body
 * @param lookPitch  head tilt, radians
 * @param recoil     0..1, decaying kick after a shot
 * @param stagger    {zone, k} hit reaction, k decaying 1..0
 */
export function applyOverlay(bones, axes,
  { aim = 0, lookYaw = 0, lookPitch = 0, recoil = 0, stagger = null } = {}) {

  /* Composed in x, y, z order, which is what Euler('XYZ') does - so on a rig
     whose measured axes are the world axes this is exactly the old maths. */
  const add = (name, x, y, z) => {
    const bone = bones.get(name);
    const ax = axes.get(name);
    if (!bone || !ax) return;
    if (x) bone.quaternion.multiply(_q.setFromAxisAngle(ax.a, x));
    if (y) bone.quaternion.multiply(_q.setFromAxisAngle(ax.b, y));
    if (z) bone.quaternion.multiply(_q.setFromAxisAngle(ax.c, z));
  };

  if (aim > 0) {
    /* Trigger arm close to the body with the elbow flared a little, support
       arm brought further up and across to the handguard. */
    add('armR', 0.5 * aim, 0, 0.12 * aim);
    add('forearmR', 0.75 * aim, 0, -0.1 * aim);
    add('armL', 0.72 * aim, 0, 0.26 * aim);
    add('forearmL', 0.8 * aim, -0.3 * aim, 0);
    add('chest', 0, -0.18 * aim, 0);
  }

  if (recoil > 0) {
    /* The kick drives the weapon back, so the arm goes the other way. */
    add('armR', -0.22 * recoil, 0, 0);
    add('forearmR', -0.16 * recoil, 0, 0);
    add('chest', -0.1 * recoil, 0, 0);
  }

  add('head', lookPitch, lookYaw, 0);

  if (stagger) {
    const k = stagger.k;
    if (stagger.zone === 'head') {
      add('head', -0.35 * k, 0.2 * k, 0.45 * k);
      add('chest', -0.18 * k, 0, 0);
    } else if (stagger.zone === 'torso') {
      add('chest', -0.3 * k, 0, 0.12 * k);
      add('spine', -0.15 * k, 0, 0);
    } else {
      add('hips', 0, 0, 0.2 * k);
      add('thighL', -0.35 * k, 0, 0);
    }
  }
}
