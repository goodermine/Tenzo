/* Greyline - guards built on the downloaded character model.

   Implements the same surface as the generated rig in rig.js, so
   src/enemies.js does not care which one it is holding: `group`, `bones`,
   `play`, `current`, `setAlert`, `update`, `overlay`, `attachProp`,
   `naturalSpeed`, `hitFrame`, `dispose`.

   The model is "Soldier Final Animations Fbx" by Zow, CC-BY-4.0. See
   CREDITS.md. Nearly everything below is here because of something the file
   turned out to contain, and each was found by measuring it rather than by
   looking at it:

   - Scale. The rig is in centimetres inside a Sketchfab root scaled 0.0019
     and rotated -90 degrees. An assumed constant would have made guards four
     millimetres tall, so the height is fitted from the skeleton instead.
   - Facing. It faces +Z where the game faces -Z, in a bladed rifle stance
     with the feet pointing different ways. It is turned by the direction of
     the rifle between its hands - so a guard points its weapon at you.
   - Clips. Every clip carries the rifle. The "100%" ones hold it raised;
     "Walk 50%" and "Run 50%" hold it at low ready, which is a patrol. But
     "Idle 50%" is a crouch whose neck bobs twenty centimetres, so a guard
     standing still always uses "Idle 100%". The timing and loop seams are
     repaired in tools/pack-character.mjs.
   - No death clip, so death freezes the pose and enemies.js topples it.
   - One flat grey material and no texture. The body is split into uniform,
     vest, boots and gloves by which bone each triangle follows, which is
     what makes a mannequin into a soldier without a single texture.
   - A forward-leaning stance with the head 0.3m ahead of centre - so the
     hit volumes are measured here too, or headshots at a visible head
     would miss.  */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { assetUrl, manager } from './assets.js';
import { computeBoneAxes, applyOverlay } from './rig-pose.js';

/* Height of the top of the neck above the soles, for a guard of about 1.8m.
   Measured to the neck rather than the crown because the rig has no head
   joint, and a joint can be measured before anything is skinned. */
const NECK_TOP_HEIGHT = 1.56;

/* Logical name -> a pattern matching the model's bone. Matched rather than
   compared because the exporter appends an index to every joint name.

   `Arm_ElbowSHJnt` is a childless helper beside the real chain; the forearm
   carrying the wrist is `Arm_Elbow_CurveSHJnt`. There is no head joint, only
   a neck chain whose top is what the head geometry follows. */
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
  thighR: /r_Leg_HipSHJnt/,
  wristL: /l_Arm_WristSHJnt/,
  wristR: /r_Arm_WristSHJnt/,
  ankleL: /l_Leg_AnkleSHJnt/,
  ankleR: /r_Leg_AnkleSHJnt/
};
const FEET = /_Leg_(Toe|Ball|Ankle)SHJnt/;

/* Rifle raised for anything tense, at low ready for a patrol. There is no
   idleLow - see the note on clips above. */
const CLIPS = {
  idle: 'Idle 100%',
  walk: 'Walk 100%',
  walkLow: 'Walk 50%',
  run: 'Run 100%',
  runLow: 'Run 50%'
};

const BODY_MESH = /Base_BodyM/;
const HEAD_MESH = /Base_HeadM/;

/* Body regions, by the bone a vertex mostly follows. Draw groups on the
   shared geometry, so this costs one pass at load and nothing per guard. */
const REGIONS = [
  { name: 'uniform', test: null },
  { name: 'vest', test: /Spine_0[1-4]SHJnt|Spine_TopSHJnt|ClavicleSHJnt/ },
  { name: 'gear', test: /_Leg_(Ankle|Ball|Toe)SHJnt|_Arm_WristSHJnt|Fingers/ },
  { name: 'skin', test: /neck_/ }
];

let cached = null;
let loadFailed = false;

function findBone(root, pattern) {
  let hit = null;
  root.traverse(o => {
    if (!hit && o.isBone && pattern.test(o.name)) hit = o;
  });
  return hit;
}

function findMesh(root, pattern) {
  let hit = null;
  root.traverse(o => {
    if (!hit && o.isSkinnedMesh && pattern.test(o.name)) hit = o;
  });
  return hit;
}

const _v = new THREE.Vector3();
const wpos = o => o.getWorldPosition(new THREE.Vector3());

/* Posed bounding box of a skinned mesh, in world space. */
function posedBox(mesh) {
  mesh.computeBoundingBox();
  return mesh.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
}

/* Split the body into draw groups by dominant bone. Skinned geometry is
   shared between every clone, so this runs once. */
function paintRegions(mesh) {
  const g = mesh.geometry;
  if (!g.index || g.userData.painted) return;
  const bones = mesh.skeleton.bones;
  const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const regionOf = v => {
    let best = 0, bw = -1;
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(v, k);
      if (w > bw) { bw = w; best = si.getComponent(v, k); }
    }
    const name = bones[best] ? bones[best].name : '';
    for (let r = 1; r < REGIONS.length; r++) if (REGIONS[r].test.test(name)) return r;
    return 0;
  };
  const idx = g.index.array;
  const buckets = REGIONS.map(() => []);
  for (let t = 0; t < idx.length; t += 3) {
    const a = regionOf(idx[t]), b = regionOf(idx[t + 1]), c = regionOf(idx[t + 2]);
    /* Majority vote per triangle, so a seam does not zig-zag between
       regions one vertex at a time. */
    const r = (a === b || a === c) ? a : (b === c ? b : a);
    buckets[r].push(idx[t], idx[t + 1], idx[t + 2]);
  }
  const out = new idx.constructor(idx.length);
  let o = 0;
  g.clearGroups();
  buckets.forEach((b, i) => {
    if (!b.length) return;
    out.set(b, o);
    g.addGroup(o, b.length, i);
    o += b.length;
  });
  g.setIndex(new THREE.BufferAttribute(out, 1));
  g.userData.painted = buckets.map(b => b.length / 3);
}

/* Everything that has to be measured in a pose, done once on a throwaway
   clone so the shared scene stays at rest. */
function analyse(scene, animations) {
  const probe = cloneSkeleton(scene);
  const holder = new THREE.Group();
  holder.add(probe);

  const idle = animations.find(c => c.name === CLIPS.idle);
  const mixer = new THREE.AnimationMixer(probe);
  if (idle) mixer.clipAction(idle).play();
  mixer.update(0);
  holder.updateMatrixWorld(true);

  const neck = findBone(probe, BONES.head);
  const wL = findBone(probe, BONES.wristL), wR = findBone(probe, BONES.wristR);
  let lowest = Infinity;
  probe.traverse(o => {
    if (o.isBone && FEET.test(o.name)) lowest = Math.min(lowest, o.getWorldPosition(_v).y);
  });
  if (!neck || !wL || !wR || !Number.isFinite(lowest)) {
    throw new Error('character rig: neck, wrists or feet not found');
  }

  const height = wpos(neck).y - lowest;
  if (!(height > 0)) throw new Error('character rig: measured a non-positive height');
  const scale = NECK_TOP_HEIGHT / height;

  /* Turn the rifle - right hand to left hand - onto the game's forward.
     Three's Y rotation carries a unit (sin a, cos a) to (sin(a+t), cos(a+t)),
     so -Z needs a + t = pi. */
  const rifle = wpos(wL).sub(wpos(wR));
  const yaw = Math.PI - Math.atan2(rifle.x, rifle.z);

  /* Re-measure with the fit applied, in the guard's own frame. */
  probe.scale.setScalar(scale);
  probe.rotation.y = yaw;
  probe.position.y = -lowest * scale;
  holder.updateMatrixWorld(true);

  const hips = wpos(findBone(probe, BONES.hips));
  const chest = wpos(findBone(probe, BONES.chest));

  /* Foot-slide-free playback speed per clip: a full cycle is two steps, and
     the widest the ankles part is one step length. */
  const naturalSpeed = {};
  const aL = findBone(probe, BONES.ankleL), aR = findBone(probe, BONES.ankleR);
  for (const [key, name] of Object.entries(CLIPS)) {
    if (!/walk|run/i.test(key)) continue;
    const clip = animations.find(c => c.name === name);
    if (!clip) continue;
    mixer.stopAllAction();
    mixer.clipAction(clip).reset().play();
    let widest = 0;
    for (let i = 0; i < 24; i++) {
      mixer.setTime(clip.duration * i / 24);
      holder.updateMatrixWorld(true);
      const d = wpos(aL).sub(wpos(aR));
      widest = Math.max(widest, Math.hypot(d.x, d.z));
    }
    naturalSpeed[key] = (2 * widest) / clip.duration;
  }

  mixer.stopAllAction();
  mixer.uncacheRoot(probe);

  return {
    scale,
    yaw,
    groundOffset: -lowest * scale,
    measuredHeight: height,
    naturalSpeed,
    /* Torso centre in the guard's frame (-Z forward), for the analytic hit
       test. The head is found per shot instead; see headCenter(). */
    hit: { torsoX: (hips.x + chest.x) / 2, torsoZ: (hips.z + chest.z) / 2 }
  };
}

/** True once the model is in memory and GltfGuardRig can be constructed. */
export function guardModelReady() {
  return !!cached;
}

export function guardModelFailed() {
  return loadFailed;
}

/** What was measured at load, for verification and for enemies.js. */
export function guardModelInfo() {
  return cached ? { ...cached.fit, clips: cached.animations.map(a => a.name) } : null;
}

/**
 * Load the character once, before any guard is built. The rig constructor is
 * synchronous because enemies are spawned synchronously, so the await has to
 * happen during the loading screen.
 *
 * Resolves false rather than rejecting: a missing or unreadable model drops
 * the game back to the generated rig instead of failing to start.
 */
export function loadGuardModel() {
  if (cached) return Promise.resolve(true);
  return new Promise(resolve => {
    new GLTFLoader(manager).load(
      assetUrl('characters/guard.glb'),
      gltf => {
        try {
          const body = findMesh(gltf.scene, BODY_MESH);
          if (body) paintRegions(body);
          const fit = analyse(gltf.scene, gltf.animations);
          cached = { scene: gltf.scene, animations: gltf.animations, fit };
          resolve(true);
        } catch (e) {
          loadFailed = true;
          console.warn('[greyline] character model unusable, using the generated rig:', e.message);
          resolve(false);
        }
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

/* Guard kit that is not in the model: helmet and a rifle. Kept to a few
   dozen triangles each - twenty guards carry them. */
function helmetMesh(material, radius) {
  const g = new THREE.SphereGeometry(radius, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.56);
  const m = new THREE.Mesh(g, material);
  m.castShadow = true;
  return m;
}

function rifleMesh(material) {
  const rifle = new THREE.Group();
  const part = (geo, x, y, z) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    rifle.add(m);
  };
  /* Built along +Z with the grip at the origin, since that is where the
     right hand is. lookAt() aims +Z. */
  part(new THREE.BoxGeometry(0.06, 0.1, 0.42), 0, 0.02, 0.1);          // receiver
  part(new THREE.BoxGeometry(0.05, 0.08, 0.24), 0, 0.01, -0.22);       // stock
  part(new THREE.BoxGeometry(0.035, 0.15, 0.06), 0, -0.08, 0.14);      // magazine
  const barrel = new THREE.CylinderGeometry(0.013, 0.013, 0.34, 8);
  barrel.rotateX(Math.PI / 2);
  part(barrel, 0, 0.035, 0.47);
  return rifle;
}

export class GltfGuardRig {
  /** @param materials [cloth, shirt, vest, skin, gear] - same order as rig.js */
  constructor(materials) {
    if (!cached) throw new Error('loadGuardModel() must resolve before building a guard');
    const fit = cached.fit;
    const [cloth, , vest, skin, gear] = materials;

    /* One load shared across every guard: SkeletonUtils.clone gives each its
       own skeleton and nodes while the geometry stays shared. */
    const model = cloneSkeleton(cached.scene);
    model.scale.setScalar(fit.scale);
    model.rotation.y = fit.yaw;
    model.position.y = fit.groundOffset;

    this.group = new THREE.Group();
    this.model = model;
    this.group.add(model);
    this.source = 'gltf';
    this.clipSpeed = { walk: 1.4, run: 3.2, ...fit.naturalSpeed };
    this.hitFrame = fit.hit;

    this.skinned = [];
    model.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      if (HEAD_MESH.test(o.name)) o.material = skin;
      else if (BODY_MESH.test(o.name)) o.material = [cloth, vest, gear, skin];
      if (o.isSkinnedMesh) this.skinned.push(o);
    });

    this.bones = new Map();
    this.unresolvedBones = [];
    for (const [logical, pattern] of Object.entries(BONES)) {
      const hit = findBone(model, pattern);
      if (hit) this.bones.set(logical, hit);
      else this.unresolvedBones.push(logical);
    }

    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    this.missingClips = [];
    for (const [key, name] of Object.entries(CLIPS)) {
      const clip = cached.animations.find(c => c.name === name);
      if (clip) this.actions[key] = this.mixer.clipAction(clip);
      else this.missingClips.push(name);
    }

    /* Pose it before measuring or attaching anything: the kit is placed in
       the idle pose, standing upright with the rifle between the hands. A
       bowed head would tip a helmet placed "above" it onto the back of the
       skull once the guard straightened up. */
    this.alert = false;
    this.current = null;
    this.dying = 0;
    this.phase = Math.random();
    this.play('idle', 0);
    this.mixer.update(0);
    this.group.updateMatrixWorld(true);

    /* The overlay's axes are taken in this pose too - it is the pose the
       guard spends its time in, where the rest pose is a mid-aim snapshot. */
    this.axes = computeBoneAxes(this.bones);

    this.buildKit(gear);
    this.fixBounds();
  }

  /* Skinned bounds would otherwise come from the bind pose, which an
     animated limb can leave - culled while still on screen. Turning culling
     off instead costs every guard in the level being drawn four times a
     frame (the view plus three shadow maps) wherever it is, which more than
     doubled the scene's triangles. So each mesh gets one fixed sphere that
     holds the guard in any pose, in the mesh's own space so it follows the
     guard around. */
  fixBounds() {
    this.group.updateMatrixWorld(true);
    const inv = new THREE.Matrix4();
    for (const m of this.skinned) {
      inv.copy(m.matrixWorld).invert();
      const sphere = new THREE.Sphere(new THREE.Vector3(0, 0.95, 0), 1.25).applyMatrix4(inv);
      m.boundingSphere = sphere;
    }
  }

  buildKit(gear) {
    const neck = this.bones.get('head');
    const head = this.skinned.find(m => HEAD_MESH.test(m.name));
    if (neck && head) {
      const box = posedBox(head);
      const c = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const r = Math.max(size.x, size.z) * 0.56;
      const helmet = helmetMesh(gear, r);
      /* The box centre includes the face and jaw; the cranium sits a little
         further back (+Z is behind the guard in its own frame). */
      helmet.position.set(c.x, box.max.y - r * 0.72, c.z + r * 0.12);
      helmet.scale.y = 0.85;
      this.group.add(helmet);
      helmet.updateMatrixWorld(true);
      neck.attach(helmet);
      /* The head's centre in the neck's frame - the head mesh follows that
         one joint alone - so the hit test can find the head in any clip. */
      this.headLocal = neck.worldToLocal(c.clone());
      /* The helmet's radius: a shot that clips the helmet is a headshot. */
      this.headRadius = r;
    }

    const wR = this.bones.get('wristR'), wL = this.bones.get('wristL');
    if (wR && wL) {
      const grip = wpos(wR), support = wpos(wL);
      const rifle = rifleMesh(gear);
      rifle.position.copy(grip);
      this.group.add(rifle);
      rifle.lookAt(support);
      rifle.updateMatrixWorld(true);
      wR.attach(rifle);
      this.rifle = rifle;
    }
  }

  play(name, fade = 0.22) {
    /* The model has no death clip; see update(). */
    if (name === 'death') {
      this.dying = 1;
      return;
    }
    /* Low ready while relaxed, raised once alert. */
    const low = this.actions[name + 'Low'];
    const key = !this.alert && low ? name + 'Low' : name;
    const next = this.actions[key];
    if (!next || this.current === next) return;
    next.reset().setEffectiveWeight(1).play();
    if (!this.current) next.time = this.phase * next.getClip().duration;
    else this.current.crossFadeTo(next, fade, false);
    this.current = next;
    this.currentKey = key;
  }

  /**
   * World-space centre of the head as it is currently posed, or null. The
   * run clip carries the head twenty centimetres below the idle, so a fixed
   * sphere would miss a shot at the visible head.
   */
  headCenter(out) {
    const neck = this.bones.get('head');
    if (!neck || !this.headLocal) return null;
    return neck.localToWorld(out.copy(this.headLocal));
  }

  /** Ground speed at 1x for the clips currently in use - raised or low. */
  get naturalSpeed() {
    const s = this.clipSpeed, low = !this.alert;
    return {
      walk: (low && s.walkLow) || s.walk,
      run: (low && s.runLow) || s.run
    };
  }

  /** Called from the AI state. Raises the rifle; lowers it again when calm. */
  setAlert(alert) {
    this.alert = !!alert;
  }

  /**
   * Hang a prop off a bone. `object.position` is an offset from the bone, in
   * metres, in the guard's upright frame (-Z forward) - the same meaning it
   * has on the generated rig. attach() keeps the world transform, so the
   * model's scale and the bone's bind rotation are absorbed automatically,
   * and the prop still follows the bone as it animates.
   */
  attachProp(boneName, object) {
    const bone = this.bones.get(boneName);
    if (!bone) return false;
    this.group.updateMatrixWorld(true);
    const offset = object.position.clone();
    object.position.copy(wpos(bone)).add(offset);
    this.group.add(object);
    object.updateMatrixWorld(true);
    bone.attach(object);
    return true;
  }

  /**
   * Layered on top of the mixer's pose; see src/rig-pose.js.
   *
   * No aim component here: every clip of this model already carries the
   * rifle, raised when alert, so adding the generated rig's "bring the rifle
   * up" rotation would lift arms that are already up.
   */
  overlay(params) {
    applyOverlay(this.bones, this.axes, { ...params, aim: 0 });
  }

  update(dt) {
    /* Freeze the pose once dead: every clip is upright, and enemies.js
       topples the whole group. Locomotion carrying on under a falling body
       is what reads as a bug. */
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
