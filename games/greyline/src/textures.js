/* Greyline - procedural PBR texture generation.
   The game ships no image files. Every surface is generated here at load
   time as an albedo / normal / roughness set, derived from a shared height
   field so the lighting response matches what you see in the colour map. */
import * as THREE from 'three';
import { ImprovedNoise } from 'three/examples/jsm/math/ImprovedNoise.js';

const perlin = new ImprovedNoise();

/* Fractal noise in [0,1]. `z` acts as the seed plane. */
function fbm(x, y, z, octaves = 5, lacunarity = 2.03, gain = 0.5) {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * perlin.noise(x * freq, y * freq, z);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm * 0.5 + 0.5;
}

/* Ridged noise makes cracks and mortar lines read as incised, not painted. */
function ridge(x, y, z, octaves = 4) {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(perlin.noise(x * freq, y * freq, z));
    sum += amp * n * n;
    norm += amp;
    amp *= 0.5;
    freq *= 2.07;
  }
  return sum / norm;
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function mix(a, b, t) {
  return a + (b - a) * t;
}
function smoothstep(e0, e1, x) {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

function canvasFrom(data, size) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  c.getContext('2d').putImageData(new ImageData(data, size, size), 0, 0);
  return c;
}

/* Sobel the height field into a tangent-space normal map. */
function normalMapFrom(height, size, strength) {
  const out = new Uint8ClampedArray(size * size * 4);
  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx =
        at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1) -
        at(x + 1, y - 1) - 2 * at(x + 1, y) - at(x + 1, y + 1);
      const dy =
        at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1) -
        at(x - 1, y + 1) - 2 * at(x, y + 1) - at(x + 1, y + 1);
      let nx = dx * strength;
      let ny = dy * strength;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz);
      const i = (y * size + x) * 4;
      out[i] = (nx / len * 0.5 + 0.5) * 255;
      out[i + 1] = (ny / len * 0.5 + 0.5) * 255;
      out[i + 2] = (nz / len * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
    }
  }
  return out;
}

function grayscale(values, size) {
  const out = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const v = clamp01(values[i]) * 255;
    out[i * 4] = v;
    out[i * 4 + 1] = v;
    out[i * 4 + 2] = v;
    out[i * 4 + 3] = 255;
  }
  return out;
}

function texture(canvas, repeat, srgb) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* --------------------------------------------------------------- surfaces */

/* Each generator fills albedo (RGB), height and roughness for one tile. */
const SURFACES = {
  concrete(size, seed) {
    const albedo = new Uint8ClampedArray(size * size * 4);
    const height = new Float32Array(size * size);
    const rough = new Float32Array(size * size);
    const s = 1 / size;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x * s * 6;
        const v = y * s * 6;
        const grit = fbm(u * 14, v * 14, seed, 4);
        const blotch = fbm(u * 1.6, v * 1.6, seed + 3.3, 4);
        const stain = smoothstep(0.52, 0.86, fbm(u * 0.8, v * 2.4, seed + 8.1, 5));
        const crack = smoothstep(0.86, 0.995, ridge(u * 2.2, v * 2.2, seed + 17.7, 4));
        const pit = smoothstep(0.83, 1.0, fbm(u * 26, v * 26, seed + 2.2, 2));

        let l = 0.60 + (blotch - 0.5) * 0.16 + (grit - 0.5) * 0.10;
        l -= stain * 0.17;          /* water staining runs down walls */
        l -= crack * 0.35;
        l -= pit * 0.12;

        const i = (y * size + x) * 4;
        albedo[i] = clamp01(l * 1.02) * 255;
        albedo[i + 1] = clamp01(l * 0.995) * 255;
        albedo[i + 2] = clamp01(l * 0.955) * 255;
        albedo[i + 3] = 255;

        height[y * size + x] = grit * 0.35 + blotch * 0.25 - crack * 0.9 - pit * 0.5;
        rough[y * size + x] = clamp01(0.74 + (grit - 0.5) * 0.22 + stain * 0.12 - crack * 0.1);
      }
    }
    return { albedo, height, rough, normalStrength: 1.5 };
  },

  plaster(size, seed) {
    const albedo = new Uint8ClampedArray(size * size * 4);
    const height = new Float32Array(size * size);
    const rough = new Float32Array(size * size);
    const s = 1 / size;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x * s * 6;
        const v = y * s * 6;
        /* brick showing through where the render has fallen away */
        const bw = 0.5;
        const bh = 0.16;
        const row = Math.floor(v / bh);
        const off = (row % 2) * bw * 0.5;
        const bx = ((u + off) % bw) / bw;
        const by = (v % bh) / bh;
        const mortar = smoothstep(0.0, 0.06, bx) * smoothstep(1.0, 0.94, bx) *
                       smoothstep(0.0, 0.14, by) * smoothstep(1.0, 0.86, by);
        const brickId = Math.floor((u + off) / bw) * 31 + row * 17;
        const brickTone = (Math.sin(brickId * 12.9898) * 43758.5453 % 1 + 1) % 1;

        const peel = smoothstep(0.58, 0.72, fbm(u * 2.3, v * 2.3, seed + 5.5, 5)) * 0.85;
        const grit = fbm(u * 20, v * 20, seed, 3);
        const stain = smoothstep(0.5, 0.9, fbm(u * 0.7, v * 3.0, seed + 11.2, 4));

        const brickL = mix(0.20, 0.34, brickTone) * mix(0.75, 1.0, mortar);
        const plasterL = 0.70 + (grit - 0.5) * 0.08 - stain * 0.18;
        const l = mix(plasterL, brickL, peel);

        const i = (y * size + x) * 4;
        albedo[i] = clamp01(l * mix(1.0, 1.14, peel)) * 255;
        albedo[i + 1] = clamp01(l * mix(0.99, 0.95, peel)) * 255;
        albedo[i + 2] = clamp01(l * mix(0.94, 0.88, peel)) * 255;
        albedo[i + 3] = 255;

        height[y * size + x] = mix(grit * 0.3 + 0.6, mortar * 0.9, peel) - peel * 0.5;
        rough[y * size + x] = clamp01(mix(0.66, 0.9, peel) + stain * 0.08);
      }
    }
    return { albedo, height, rough, normalStrength: 2.2 };
  },

  asphalt(size, seed) {
    const albedo = new Uint8ClampedArray(size * size * 4);
    const height = new Float32Array(size * size);
    const rough = new Float32Array(size * size);
    const s = 1 / size;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x * s * 6;
        const v = y * s * 6;
        const aggregate = fbm(u * 30, v * 30, seed, 3);
        const coarse = fbm(u * 8, v * 8, seed + 4.4, 4);
        const crack = smoothstep(0.88, 1.0, ridge(u * 3.1, v * 3.1, seed + 21.3, 5));
        const patch = smoothstep(0.58, 0.66, fbm(u * 1.2, v * 1.2, seed + 9.9, 3));
        const wear = smoothstep(0.4, 0.8, fbm(u * 0.6, v * 0.6, seed + 30.1, 3));

        let l = 0.20 + (aggregate - 0.5) * 0.20 + (coarse - 0.5) * 0.07;
        l = mix(l, l * 1.35, patch);      /* newer tarmac patches sit lighter */
        l = mix(l, l * 1.2, wear * 0.5);  /* polished by traffic */
        l -= crack * 0.12;

        const i = (y * size + x) * 4;
        albedo[i] = clamp01(l * 1.01) * 255;
        albedo[i + 1] = clamp01(l) * 255;
        albedo[i + 2] = clamp01(l * 1.02) * 255;
        albedo[i + 3] = 255;

        height[y * size + x] = aggregate * 0.5 + coarse * 0.3 - crack * 1.0;
        rough[y * size + x] = clamp01(0.86 - wear * 0.25 + (aggregate - 0.5) * 0.15);
      }
    }
    return { albedo, height, rough, normalStrength: 1.1 };
  },

  brick(size, seed) {
    const albedo = new Uint8ClampedArray(size * size * 4);
    const height = new Float32Array(size * size);
    const rough = new Float32Array(size * size);
    const s = 1 / size;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x * s * 4;
        const v = y * s * 4;
        const bw = 0.5;
        const bh = 0.155;
        const row = Math.floor(v / bh);
        const off = (row % 2) * bw * 0.5;
        const bx = ((u + off) % bw) / bw;
        const by = (v % bh) / bh;
        const edge = smoothstep(0.0, 0.05, bx) * smoothstep(1.0, 0.95, bx) *
                     smoothstep(0.0, 0.13, by) * smoothstep(1.0, 0.87, by);
        const id = Math.floor((u + off) / bw) * 71 + row * 131;
        const tone = ((Math.sin(id * 12.9898) * 43758.5453) % 1 + 1) % 1;
        const grit = fbm(u * 22, v * 22, seed, 3);
        const soot = smoothstep(0.45, 0.85, fbm(u * 0.9, v * 2.2, seed + 14.0, 4));
        const chip = smoothstep(0.72, 0.95, fbm(u * 12, v * 12, seed + 6.6, 3)) * edge;

        const base = mix(0.26, 0.44, tone) + (grit - 0.5) * 0.09;
        const l = mix(0.55 + (grit - 0.5) * 0.1, base, edge) * (1 - soot * 0.35) + chip * 0.06;

        const i = (y * size + x) * 4;
        albedo[i] = clamp01(l * mix(1.0, 1.28, edge)) * 255;
        albedo[i + 1] = clamp01(l * mix(0.99, 0.90, edge)) * 255;
        albedo[i + 2] = clamp01(l * mix(0.96, 0.82, edge)) * 255;
        albedo[i + 3] = 255;

        height[y * size + x] = edge * 0.9 + grit * 0.2 - chip * 0.4;
        rough[y * size + x] = clamp01(mix(0.92, 0.78, edge) + soot * 0.06);
      }
    }
    return { albedo, height, rough, normalStrength: 2.6 };
  },

  metal(size, seed) {
    const albedo = new Uint8ClampedArray(size * size * 4);
    const height = new Float32Array(size * size);
    const rough = new Float32Array(size * size);
    const s = 1 / size;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x * s * 4;
        const v = y * s * 4;
        const brushed = fbm(u * 60, v * 3, seed, 3);
        const rust = smoothstep(0.55, 0.78, fbm(u * 2.4, v * 2.4, seed + 7.7, 5));
        const streak = smoothstep(0.5, 0.9, fbm(u * 1.2, v * 6.0, seed + 19.1, 4)) * rust;
        const dent = fbm(u * 5, v * 5, seed + 2.5, 3);

        const paint = 0.34 + (brushed - 0.5) * 0.06 + (dent - 0.5) * 0.08;
        const l = mix(paint, 0.26, rust);

        const i = (y * size + x) * 4;
        albedo[i] = clamp01(l * mix(1.0, 1.7, rust + streak * 0.5)) * 255;
        albedo[i + 1] = clamp01(l * mix(1.02, 1.05, rust)) * 255;
        albedo[i + 2] = clamp01(l * mix(1.05, 0.72, rust)) * 255;
        albedo[i + 3] = 255;

        height[y * size + x] = dent * 0.6 + brushed * 0.15 - rust * 0.25;
        rough[y * size + x] = clamp01(mix(0.42, 0.88, rust) + (brushed - 0.5) * 0.1);
      }
    }
    return { albedo, height, rough, normalStrength: 1.4, metalness: 0.65 };
  },

  sandbag(size, seed) {
    const albedo = new Uint8ClampedArray(size * size * 4);
    const height = new Float32Array(size * size);
    const rough = new Float32Array(size * size);
    const s = 1 / size;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x * s * 6;
        const v = y * s * 6;
        const weave = (Math.sin(u * 240) * 0.5 + 0.5) * 0.5 + (Math.sin(v * 240) * 0.5 + 0.5) * 0.5;
        const cloth = fbm(u * 9, v * 9, seed, 4);
        const dirt = smoothstep(0.4, 0.85, fbm(u * 1.8, v * 1.8, seed + 12.3, 4));
        const l = 0.42 + (cloth - 0.5) * 0.16 + (weave - 0.5) * 0.05 - dirt * 0.12;

        const i = (y * size + x) * 4;
        albedo[i] = clamp01(l * 1.1) * 255;
        albedo[i + 1] = clamp01(l * 1.0) * 255;
        albedo[i + 2] = clamp01(l * 0.78) * 255;
        albedo[i + 3] = 255;

        height[y * size + x] = weave * 0.4 + cloth * 0.6;
        rough[y * size + x] = clamp01(0.93 + (cloth - 0.5) * 0.06);
      }
    }
    return { albedo, height, rough, normalStrength: 1.8 };
  }
};

/* --------------------------------------------------------------- material */

export function makeSurface(kind, { size = 1024, seed = 0, repeat = [1, 1], color = 0xffffff } = {}) {
  const gen = SURFACES[kind];
  if (!gen) throw new Error('unknown surface: ' + kind);
  const { albedo, height, rough, normalStrength, metalness = 0 } = gen(size, seed);

  const map = texture(canvasFrom(albedo, size), repeat, true);
  const normalMap = texture(canvasFrom(normalMapFrom(height, size, normalStrength), size), repeat, false);
  const roughnessMap = texture(canvasFrom(grayscale(rough, size), size), repeat, false);

  const material = new THREE.MeshStandardMaterial({
    color,
    map,
    normalMap,
    roughnessMap,
    metalness,
    roughness: 1,
    envMapIntensity: 1
  });
  material.normalScale.set(1, 1);
  return material;
}

export const SURFACE_KINDS = Object.keys(SURFACES);
