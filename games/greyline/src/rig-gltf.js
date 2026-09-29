/* Greyline - guards built on the downloaded character model.

   Implements the same surface as the generated rig in rig.js, so
   src/enemies.js does not care which one it is holding: `group`, `bones`,
   `play`, `current`, `update`, `overlay`, `dispose`.

   The model is "Soldier Final Animations Fbx" by Zow, CC-BY-4.0. See
   CREDITS.md. What it actually ships, which drove most of what follows:

   - A Maya rig whose limb bones run along +/-X, not down -Y. Posing it with
     world-axis rotations would twist the arms instead of raising them, which
     is why the overlay measures its axes from the bind pose (rig-pose.js).
   - Centimetres. The root is scaled at runtime rather than baked, so the
     animation's translation tracks scale with it.
   - Six clips: idle, walk and run, each at two intensities. No death clip,
     so death is still driven by hand.
   - One flat grey material shared by body and head, with no texture. The
     game supplies its own, which is also how the head gets skin and the
     body gets a uniform.  */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { assetUrl, manager } from './assets.js';
import { computeBoneAxes, applyOverlay } from './rig-pose.js';

/* The rig is authored in centimetres and a guard should stand about 1.8m. */
const MODEL_SCALE = 0.01;

/* Logical name -> a pattern matching the model's bone. Matched rather than
   compared because the exporter appends an index to every joint name.

   Two of these are not what a name search alone would pick:
   `Arm_ElbowSHJnt` is a childless helper joint sitting beside the real
   chain, and the forearm that actually carries the wrist is
   `Arm_Elbow_CurveSHJnt`; and there is no head joint at all, only a neck
   chain, whose top is what the head geometry follows. */
const BONES = {
  hips: /ROOTSHJnt/,
  spine: /Spine_01SHJnt/,
  chest: /Spine_TopSHJnt/,
  head: /neck_TopSHJnt/,
  armL: /l_Arm_ShoulderSHJnt/,
  armR: /r_Arm_ShoulderSHJnt/,
  forearmL: /l_Arm_Elbow_CurveSHJnt/,
  forearmR: /r_Arm_Elbow_CurveSHJnt/,
  thighL: /l_Leg_HipSHJnt/,
  thighR: /r_Leg_HipSHJnt/
};

/* The model's clip names. The "50%" variants are the same motion played
   less emphatically; patrolling guards use them so a compound of guards is
   not all moving in lockstep. */
const CLIPS = {
  idle: 'Idle 100%',
  idleCalm: 'Idle 50%',
  walk: 'Walk 100%',
  walkCalm: 'Walk 50%',
  run: 'Run 100%',
  runCalm: 'Run 50%'
};

/* Which mesh is skin and which is uniform. The model gives both the same
   flat grey, so without this the guard is a mannequin. */
const BODY_MESH = /Base_BodyM/;
const HEAD_MESH = /Base_HeadM/;

let cached = null;
let loadFailed = false;

/** True once the model is in memory and GltfGuardRig can be constructed. */
export function guardModelReady() {
  return !!cached;
}

export function guardModelFailed() {
  return loadFailed;
}

/**
 * Load the character once, before any guard is built. The rig constructor is
 * synchronous because enemies are spawned synchronously, so the await has to
 * happen during the loading screen.
 *
 * Resolves false rather than rejecting: a missing model drops the game back
 * to the generated rig instead of failing to start.
 */
export function loadGuardModel() {
  if (cached) return Promise.resolve(true);
  return new Promise(resolve => {
    new GLTFLoader(manager).load(
      assetUrl('characters/guard.glb'),
      gltf => {
        cached = { scene: gltf.scene, animations: gltf.animations };
        resolve(true);
      },
      undefined,
      () => {
        loadFailed = true;
        console.warn('[greyline] character model missing, using the generated rig');
        resolve(false);
      }
    );
  });
}

export class GltfGuardRig {
  /** @param materials [cloth, shirt, vest, skin, gear] - same order as rig.js */
  constructor(materials) {
    if (!cached) throw new Error('loadGuardModel() must resolve before building a guard');

    /* One load shared across every guard: SkeletonUtils.clone gives each its
       own skeleton and nodes while the geometry stays shared. */
    const model = cloneSkeleton(cached.scene);

    this.group = new THREE.Group();
    this.model = model;
    model.scale.setScalar(MODEL_SCALE);
    this.group.add(model);

    const [cloth, , vest, skin] = materials;
    this.skinned = [];
    model.traverse(o => {
      if (!o.isMesh && !o.isSkinnedMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
      if (HEAD_MESH.test(o.name)) o.material = skin;
      else if (BODY_MESH.test(o.name)) o.material = cloth;
      else o.material = vest;
      if (o.isSkinnedMesh) this.skinned.push(o);
    });

    /* Resolve the logical bone names against this clone's own bones. */
    this.bones = new Map();
    const unresolved = [];
    for (const [logical, pattern] of Object.entries(BONES)) {
      let hit = null;
      model.traverse(o => {
        if (!hit && o.isBone && pattern.test(o.name)) hit = o;
      });
      if (hit) this.bones.set(logical, hit);
      else unresolved.push(logical);
    }
    this.unresolvedBones = unresolved;

    model.updateMatrixWorld(true);
    this.axes = computeBoneAxes(this.bones);

    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    this.missingClips = [];
    for (const [key, name] of Object.entries(CLIPS)) {
      const clip = cached.animations.find(c => c.name === name);
      if (!clip) {
        this.missingClips.push(name);
        continue;
      }
      this.actions[key] = this.mixer.clipAction(clip);
    }

    this.current = null;
    this.dying = 0;
    this.play('idle', 0);
  }

  play(name, fade = 0.22) {
    /* The model has no death clip; death is driven in overlay() instead. */
    if (name === 'death') {
      this.dying = 1;
      return;
    }
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
    /* Freeze the pose once dead: the clips are all upright locomotion, and
       enemies.js topples the whole group. Letting idle keep playing under a
       falling body is what reads as a bug. */
    if (this.dying) {
      this.mixer.update(0);
      return;
    }
    this.mixer.update(dt);
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model);
    for (const m of this.skinned) if (m.skeleton) m.skeleton.dispose();
    if (this.group.parent) this.group.parent.remove(this.group);
  }
}
