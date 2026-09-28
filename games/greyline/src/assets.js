/* Greyline - asset resolution and loading.
   Asset URLs resolve against the bundle's own location so the game works
   from any path, including the inlined single-file build. */
import * as THREE from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

/* The bundle is ESM, so import.meta.url is the bundle's own URL. It is also
   what three's KTX2Loader relies on internally - bundling to IIFE left that
   undefined and threw before any game code ran. In a single-file inline build
   import.meta.url is the document, so 'assets/' still resolves correctly. */
const BASE = new URL('assets/', new URL('./', import.meta.url).href.replace(/\/dist\/$/, '/')).href;

export function assetUrl(path) {
  return new URL(path, BASE).href;
}

export const manager = new THREE.LoadingManager();

/* Asset failures must not be fatal: every consumer has a procedural
   fallback, so a 404 degrades the look instead of killing the level. */
export const assetErrors = [];
manager.onError = url => {
  assetErrors.push(url);
  console.warn('[greyline] asset failed, using fallback:', url);
};

let ktx2 = null;
export function ktx2Loader(renderer) {
  if (!ktx2) {
    ktx2 = new KTX2Loader(manager)
      .setTranscoderPath(assetUrl('basis/'))
      .detectSupport(renderer);
  }
  return ktx2;
}

/* The WebP path, for hosts that will not serve .ktx2. It costs roughly four
   times the GPU memory, because the driver decompresses it and keeps it
   uncompressed, which is the whole reason the KTX2 path exists. */
let plain = null;
export function textureLoader() {
  if (!plain) plain = new THREE.TextureLoader(manager);
  return plain;
}

/** Report real transfer progress to a callback, for the loading bar. */
export function onProgress(fn) {
  manager.onProgress = (url, loaded, total) => fn(total ? loaded / total : 0, url);
}

export async function loadJSON(path) {
  const res = await fetch(assetUrl(path));
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

export function disposeLoaders() {
  if (ktx2) {
    ktx2.dispose();
    ktx2 = null;
  }
}
