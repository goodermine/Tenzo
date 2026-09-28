/* Greyline - the guard rig.

   The guards used to be a bag of boxes rotated about their own centres, which
   is why their legs swung from the knee: a box has no pivot but its middle.
   This builds a proper bone hierarchy and skins one merged mesh to it, so a
   thigh turns at the hip and the shin follows it.

   Skinning is rigid - every vertex of a part belongs entirely to one bone.
   Real weight painting needs an authoring tool and buys smooth joints; at
   this scale, with capsules whose ends overlap at every joint, it would not
   be visible. What it does buy is that the whole rig is generated, so there
   is no character asset to license.

   Locomotion is played as clips through an AnimationMixer, and aiming, the
   head turn and hit reactions are applied on top afterwards. Games layer
   animation that way round because a guard has to look at the player while
   walking, and that is one pose driven by two things. */
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { computeBoneAxes, applyOverlay } from './rig-pose.js';

/* Bind pose, in metres from the ground. Positions are relative to the parent
   bone, which is what makes the hierarchy do the work. */
const SKELETON = [
  ['hips', null, [0, 0.92, 0]],
  ['spine', 'hips', [0, 0.16, 0]],
  ['chest', 'spine', [0, 0.20, 0]],
  ['neck', 'chest', [0, 0.20, 0]],
  ['head', 'neck', [0, 0.10, 0]],
  ['shoulderL', 'chest', [-0.19, 0.13, 0]],
  ['shoulderR', 'chest', [0.19, 0.13, 0]],
  ['armL', 'shoulderL', [0, -0.05, 0]],
  ['armR', 'shoulderR', [0, -0.05, 0]],
  ['forearmL', 'armL', [0, -0.26, 0]],
  ['forearmR', 'armR', [0, -0.26, 0]],
  ['thighL', 'hips', [-0.11, -0.04, 0]],
  ['thighR', 'hips', [0.11, -0.04, 0]],
  ['shinL', 'thighL', [0, -0.42, 0]],
  ['shinR', 'thighR', [0, -0.42, 0]]
];

/* Which part hangs off which bone, and where it sits in the bind pose.
   kind: capsule [radius, length] or box [x, y, z]. */
const PARTS = [
  ['hips', 'capsule', [0.15, 0.10], [0, 0.96, 0], 0],
  ['spine', 'capsule', [0.16, 0.14], [0, 1.16, 0], 0],
  ['chest', 'box', [0.42, 0.30, 0.25], [0, 1.37, 0], 1],
  ['chest', 'box', [0.46, 0.26, 0.31], [0, 1.36, 0], 2],   /* vest over it */
  ['neck', 'capsule', [0.055, 0.06], [0, 1.52, 0], 3],
  ['head', 'box', [0.20, 0.23, 0.22], [0, 1.68, 0], 3],
  ['head', 'box', [0.25, 0.12, 0.27], [0, 1.80, -0.01], 4],  /* helmet */
  ['armL', 'capsule', [0.058, 0.20], [-0.19, 0.87, 0], 0],
  ['armR', 'capsule', [0.058, 0.20], [0.19, 0.87, 0], 0],
  ['forearmL', 'capsule', [0.052, 0.20], [-0.19, 0.61, 0], 0],
  ['forearmR', 'capsule', [0.052, 0.20], [0.19, 0.61, 0], 0],
  ['thighL', 'capsule', [0.082, 0.28], [-0.11, 0.66, 0], 0],
  ['thighR', 'capsule', [0.082, 0.28], [0.11, 0.66, 0], 0],
  ['shinL', 'capsule', [0.068, 0.30], [-0.11, 0.24, 0], 0],
  ['shinR', 'capsule', [0.068, 0.30], [0.11, 0.24, 0], 0],
  ['forearmR', 'box', [0.06, 0.08, 0.5], [0.19, 0.52, -0.22], 4]  /* rifle */
];

/* Arm and leg parts are authored hanging straight down from the bone, but the
   bind positions above are absolute, so each part is placed where the bone
   actually is. These offsets convert. */
const BONE_WORLD = (() => {
  const out = new Map();
  for (const [name, parent, pos] of SKELETON) {
    const base = parent ? out.get(parent) : [0, 0, 0];
    out.set(name, [base[0] + pos[0], base[1] + pos[1], base[2] + pos[2]]);
  }
  return out;
})();

let sharedGeometry = null;

function partGeometry(kind, dims) {
  if (kind === 'capsule') return new THREE.CapsuleGeometry(dims[0], dims[1], 4, 8);
  return new THREE.BoxGeometry(dims[0], dims[1], dims[2]);
}

/* One merged geometry for the whole body, with a material group per material
   slot so the body, vest, skin and gear can differ without extra draw calls
   beyond the groups themselves. */
function buildGeometry() {
  if (sharedGeometry) return sharedGeometry;

  const boneIndex = new Map(SKELETON.map(([n], i) => [n, i]));
  const perSlot = new Map();

  for (const [bone, kind, dims, at, slot] of PARTS) {
    const g = partGeometry(kind, dims);
    g.translate(at[0], at[1], at[2]);

    const count = g.attributes.position.count;
    const idx = new Uint16Array(count * 4);
    const wt = new Float32Array(count * 4);
    const bi = boneIndex.get(bone);
    for (let i = 0; i < count; i++) {
      idx[i * 4] = bi;
      wt[i * 4] = 1;
    }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wt, 4));

    if (!perSlot.has(slot)) perSlot.set(slot, []);
    perSlot.get(slot).push(g);
  }

  /* Merge each slot separately, then concatenate so the draw groups line up
     with the material array. */
  const slots = [...perSlot.keys()].sort((a, b) => a - b);
  const merged = [];
  const groups = [];
  let start = 0;
  for (const slot of slots) {
    const m = BufferGeometryUtils.mergeGeometries(perSlot.get(slot), false);
    const count = m.index ? m.index.count : m.attributes.position.count;
    groups.push({ start, count, slot });
    start += count;
    merged.push(m);
  }
  const geo = BufferGeometryUtils.mergeGeometries(merged, false);
  geo.clearGroups();
  for (const g of groups) geo.addGroup(g.start, g.count, g.slot);
  geo.computeBoundingSphere();

  sharedGeometry = geo;
  return geo;
}

function buildSkeleton() {
  const bones = [];
  const byName = new Map();
  for (const [name, parent, pos] of SKELETON) {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(pos[0], pos[1], pos[2]);
    byName.set(name, b);
    if (parent) byName.get(parent).add(b);
    bones.push(b);
  }
  return { bones, root: bones[0], byName };
}

/* Sample a pose function into quaternion tracks. Writing clips out by hand
   means typing quaternions; describing the motion as euler angles over a
   normalised cycle and sampling it keeps the animation readable and
   adjustable. */
function clipFromPose(name, duration, frames, pose, loop = true) {
  const times = [];
  const channels = new Map();
  const e = new THREE.Euler();
  const q = new THREE.Quaternion();

  for (let f = 0; f <= frames; f++) {
    const t = f / frames;
    times.push(t * duration);
    const angles = pose(t);
    for (const [bone, rot] of Object.entries(angles)) {
      if (!channels.has(bone)) channels.set(bone, []);
      e.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
      q.setFromEuler(e);
      channels.get(bone).push(q.x, q.y, q.z, q.w);
    }
  }

  const tracks = [];
  for (const [bone, values] of channels) {
    tracks.push(new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, values));
  }
  const clip = new THREE.AnimationClip(name, duration, tracks);
  clip.userData = { loop };
  return clip;
}

const TAU = Math.PI * 2;

/* Sign convention, because getting it wrong is silent and looks like broken
   geometry rather than a bad pose: every limb bone hangs along -Y in the bind
   pose and the guard faces -Z, so a POSITIVE rotation about X swings a limb
   FORWARD. Elbows therefore bend positive (the hand comes up in front) and
   knees bend negative (the heel kicks back). About Z, positive moves a bone's
   tip towards +X, which tucks the left arm in and flares the right one out. */

/* Locomotion. `s` scales the stride so walk and run share one description. */
function stridePose(s) {
  return t => {
    const a = t * TAU;
    const swing = Math.sin(a);
    const opp = Math.sin(a + Math.PI);
    return {
      thighL: [swing * 0.62 * s, 0, 0],
      thighR: [opp * 0.62 * s, 0, 0],
      /* Knees only bend one way, and only on the backswing. */
      shinL: [-Math.max(0, -swing) * 0.85 * s, 0, 0],
      shinR: [-Math.max(0, -opp) * 0.85 * s, 0, 0],
      armL: [opp * 0.42 * s, 0, 0.08],
      armR: [swing * 0.42 * s, 0, -0.08],
      forearmL: [0.35 + Math.max(0, opp) * 0.3 * s, 0, 0],
      forearmR: [0.35 + Math.max(0, swing) * 0.3 * s, 0, 0],
      /* Counter-rotate the chest against the hips, and bob once per step. */
      hips: [0, swing * 0.06 * s, 0],
      chest: [s * 0.08, -swing * 0.10 * s, 0],
      spine: [0, 0, Math.sin(a * 2) * 0.02 * s]
    };
  };
}

function idlePose() {
  return t => {
    const a = t * TAU;
    const breathe = Math.sin(a);
    return {
      chest: [0.02 + breathe * 0.015, 0, 0],
      spine: [0, 0, breathe * 0.008],
      armL: [0.04, 0, 0.10],
      armR: [0.04, 0, -0.10],
      forearmL: [0.30, 0, 0],
      forearmR: [0.30, 0, 0],
      head: [breathe * 0.02, 0, 0],
      thighL: [0, 0, 0], thighR: [0, 0, 0],
      shinL: [0, 0, 0], shinR: [0, 0, 0],
      hips: [0, 0, 0]
    };
  };
}

/* Death plays once and holds: the guard folds at the hips and goes down. */
function deathPose() {
  return t => {
    const k = Math.min(1, t * 1.25);
    const e = k * k * (3 - 2 * k);
    return {
      hips: [e * 0.15, 0, e * 0.25],
      spine: [e * 0.55, 0, e * 0.2],
      chest: [e * 0.35, 0, 0],
      head: [e * 0.4, 0, e * 0.3],
      armL: [e * 0.5, 0, e * 0.7],
      armR: [e * 0.4, 0, -e * 0.8],
      forearmL: [e * 0.55, 0, 0],
      forearmR: [e * 0.45, 0, 0],
      thighL: [-e * 0.9, 0, 0],
      thighR: [-e * 0.7, 0, 0],
      shinL: [-e * 1.2, 0, 0],
      shinR: [-e * 1.0, 0, 0]
    };
  };
}

export function guardClips() {
  return {
    idle: clipFromPose('idle', 3.4, 12, idlePose()),
    walk: clipFromPose('walk', 1.05, 16, stridePose(1)),
    run: clipFromPose('run', 0.68, 16, stridePose(1.45)),
    death: clipFromPose('death', 0.9, 10, deathPose(), false)
  };
}

let sharedClips = null;

/**
 * A rigged guard. Geometry and clips are shared across every guard; the
 * skeleton and the mixer are per guard, because each one is posed differently.
 */
export class GuardRig {
  constructor(materials) {
    const geo = buildGeometry();
    const { bones, root, byName } = buildSkeleton();
    if (!sharedClips) sharedClips = guardClips();

    this.group = new THREE.Group();
    this.mesh = new THREE.SkinnedMesh(geo, materials);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.add(root);
    this.group.add(this.mesh);

    /* Skeleton takes each bone's inverse bind matrix from its world matrix at
       construction, so the bones must be parented and their matrices current
       before it is built - not after. */
    this.mesh.updateMatrixWorld(true);
    this.mesh.bind(new THREE.Skeleton(bones));

    this.bones = byName;
    /* Taken from the bind pose, so this has to follow bind(). For this rig
       they come out as the world axes; the point of measuring them is that a
       downloaded skeleton's will not. */
    this.axes = computeBoneAxes(byName);
    this.mixer = new THREE.AnimationMixer(this.mesh);
    this.actions = {};
    for (const [name, clip] of Object.entries(sharedClips)) {
      const action = this.mixer.clipAction(clip);
      if (clip.userData && clip.userData.loop === false) {
        action.setLoop(THREE.LoopOnce);
        action.clampWhenFinished = true;
      }
      this.actions[name] = action;
    }
    this.current = null;
    this.play('idle', 0);

  }

  play(name, fade = 0.22) {
    const next = this.actions[name];
    if (!next || this.current === next) return;
    next.reset().setEffectiveWeight(1).play();
    if (this.current) this.current.crossFadeTo(next, fade, false);
    this.current = next;
  }

  /** Layered on top of the mixer's pose; see src/rig-pose.js. */
  overlay(params) {
    applyOverlay(this.bones, this.axes, params);
  }

  update(dt) {
    this.mixer.update(dt);
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mesh);
    if (this.mesh.skeleton) this.mesh.skeleton.dispose();
  }
}

/* Geometry and clips outlive individual guards, so they are only released
   when the level goes away. */
export function disposeGuardShared() {
  if (sharedGeometry) sharedGeometry.dispose();
  sharedGeometry = null;
  sharedClips = null;
}
