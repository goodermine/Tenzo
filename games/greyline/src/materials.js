/* Greyline - scanned PBR materials, with the procedural generator as fallback.
   Textures come from ambientCG (CC0), packed by tools/fetch-materials.mjs into
   an albedo / normal / ORM triple and encoded to KTX2 so they stay compressed
   in GPU memory. */
import * as THREE from 'three';
import { assetUrl, ktx2Loader, textureLoader, loadJSON } from './assets.js';
import { makeSurface } from './textures.js';

function configure(tex, { srgb = false } = {}) {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* Load one texture, resolving to null rather than rejecting so a single
   missing map cannot take down the whole material. */
function loadTexture(loader, path, opts) {
  return new Promise(resolve => {
    loader.load(
      assetUrl(path),
      tex => resolve(configure(tex, opts)),
      undefined,
      () => resolve(null)
    );
  });
}

export class MaterialLibrary {
  constructor(renderer) {
    this.renderer = renderer;
    this.manifest = null;
    this.cache = new Map();
    this.usedFallback = [];
  }

  async init() {
    try {
      this.manifest = await loadJSON('materials.json');
    } catch (e) {
      console.warn('[greyline] no material manifest, using procedural surfaces');
      this.manifest = {};
    }
    return this;
  }

  /**
   * @param name  surface key ('concrete', 'asphalt', ...)
   * @param fallbackKind  procedural generator to use if the asset is missing
   */
  async get(name, fallbackKind = name, fallbackOpts = {}) {
    if (this.cache.has(name)) return this.cache.get(name);
    const entry = this.manifest && this.manifest[name];
    let material = null;

    if (entry) {
      /* The manifest decides the encoding: .ktx2 stays compressed on the
         GPU, .webp is the fallback for hosts that will not serve .ktx2. */
      const isKTX2 = String(entry.files.albedo).endsWith('.ktx2');
      const loader = isKTX2 ? ktx2Loader(this.renderer) : textureLoader();
      const [albedo, normal, orm] = await Promise.all([
        loadTexture(loader, entry.files.albedo, { srgb: true }),
        entry.files.normal ? loadTexture(loader, entry.files.normal) : null,
        entry.files.orm ? loadTexture(loader, entry.files.orm) : null
      ]);
      if (albedo) {
        material = new THREE.MeshStandardMaterial({
          map: albedo,
          normalMap: normal || undefined,
          roughness: 1,
          metalness: 1,
          envMapIntensity: 1
        });
        /* One ORM texture serves three slots: three samples .r for AO,
           .g for roughness and .b for metalness, which is exactly how the
           channels were packed. Pinning aoMap to channel 0 avoids needing a
           second UV set - the world already carries world-scaled UVs. */
        if (orm) {
          material.aoMap = orm;
          material.aoMap.channel = 0;
          material.roughnessMap = orm;
          material.metalnessMap = orm;
        } else {
          material.roughness = 0.9;
          material.metalness = 0;
        }
      }
    }

    if (!material) {
      this.usedFallback.push(name);
      material = makeSurface(fallbackKind, { size: 1024, seed: name.length * 7.5, ...fallbackOpts });
    }
    this.cache.set(name, material);
    return material;
  }

  /** True when every requested surface came from a real scanned asset. */
  get allScanned() {
    return this.usedFallback.length === 0;
  }
}
