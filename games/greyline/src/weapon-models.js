/* Greyline - the player's weapon models.

   Five weapons from two CC-BY-4.0 packs (Keam, r2detta; see CREDITS.md),
   prepared by tools/pack-weapons.mjs into one file where each is a node
   named after its weapon id, in metres, barrel along -Z, +Y up, centred on
   its bounding box. src/weapon.js places them in the viewmodel; this only
   loads them.

   Loaded during the loading screen, because the Weapon is built
   synchronously. A failure resolves false and the game keeps the box-built
   viewmodel it always had. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl, manager } from './assets.js';

const IDS = ['pistol_s', 'smg', 'rifle', 'shotgun', 'sniper'];

let models = null;

export function weaponModelsReady() {
  return !!models;
}

/** The model for a weapon id, with userData.box its bounds, or null. */
export function weaponModel(id) {
  return models ? models.get(id) || null : null;
}

export function loadWeaponModels() {
  if (models) return Promise.resolve(true);
  return new Promise(resolve => {
    new GLTFLoader(manager).load(
      assetUrl('weapons/weapons.glb'),
      gltf => {
        gltf.scene.updateMatrixWorld(true);
        const found = new Map();
        for (const id of IDS) {
          const node = gltf.scene.getObjectByName(id);
          if (!node) continue;
          node.removeFromParent();
          node.updateMatrixWorld(true);
          node.traverse(o => {
            if (!o.isMesh) return;
            /* r2detta's scope lenses are a near-perfect mirror - metallic,
               roughness 0.05 - so from behind they reflect whatever is dark
               and block the centre of the screen exactly when aiming. Glass
               you can see through instead. */
            if (o.material && /glass/i.test(o.material.name)) {
              o.material = new THREE.MeshStandardMaterial({
                name: 'scope glass', color: 0x9fc4d8, metalness: 0, roughness: 0.05,
                transparent: true, opacity: 0.18, depthWrite: false
              });
            }
            /* Held at the camera: as a caster it would shadow the whole
               view, and the box viewmodel never cast either. */
            o.castShadow = false;
            o.receiveShadow = false;
          });
          node.userData.box = new THREE.Box3().setFromObject(node);
          found.set(id, node);
        }
        if (found.size !== IDS.length) {
          console.warn('[greyline] weapon models incomplete, keeping the built viewmodel:',
            IDS.filter(id => !found.has(id)).join(', '));
          resolve(false);
          return;
        }
        models = found;
        resolve(true);
      },
      undefined,
      () => {
        console.warn('[greyline] weapon models missing, keeping the built viewmodel');
        resolve(false);
      }
    );
  });
}
