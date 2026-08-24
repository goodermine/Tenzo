/* Greyline - procedural level.
   A ruined street block: parametric facades with real window reveals,
   balconies, rooftop clutter and street cover. Everything is generated from
   a seeded RNG, merged per material into a handful of draw calls, and
   mirrored into a list of AABBs used for both player collision and bullets. */
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeSurface } from './textures.js';

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BOX = new THREE.BoxGeometry(1, 1, 1);

export class World {
  constructor(seed = 7) {
    this.rand = mulberry32(seed);
    this.group = new THREE.Group();
    this.boxes = [];          /* THREE.Box3 - collision and bullet targets */
    this.buckets = new Map(); /* material name -> geometry[] */
    this.materials = {};
    this.lights = [];
    this.spawns = [];
    this.playerStart = new THREE.Vector3(0, 1.0, 46);
  }

  rng(min, max) {
    return min + this.rand() * (max - min);
  }
  pick(arr) {
    return arr[Math.floor(this.rand() * arr.length) % arr.length];
  }

  /* --- geometry helpers ------------------------------------------------ */

  /** Axis-aligned box by centre + size, in a material bucket. */
  box(mat, cx, cy, cz, sx, sy, sz, { solid = true, uvScale = null } = {}) {
    const g = BOX.clone();
    g.scale(sx, sy, sz);
    if (uvScale) this._scaleUv(g, sx, sy, sz, uvScale);
    g.translate(cx, cy, cz);
    this._bucket(mat).push(g);
    if (solid) {
      this.boxes.push(new THREE.Box3(
        new THREE.Vector3(cx - sx / 2, cy - sy / 2, cz - sz / 2),
        new THREE.Vector3(cx + sx / 2, cy + sy / 2, cz + sz / 2)
      ));
    }
    return g;
  }

  /* Box UVs are per-face 0..1, so world-scale them or every surface shows the
     same texture stretched to whatever size the box happens to be. */
  _scaleUv(g, sx, sy, sz, k) {
    const uv = g.attributes.uv;
    const spans = [
      [sz, sy], [sz, sy],   /* +x, -x */
      [sx, sz], [sx, sz],   /* +y, -y */
      [sx, sy], [sx, sy]    /* +z, -z */
    ];
    for (let f = 0; f < 6; f++) {
      const [u, v] = spans[f];
      for (let i = f * 4; i < f * 4 + 4; i++) {
        uv.setXY(i, uv.getX(i) * u * k, uv.getY(i) * v * k);
      }
    }
    uv.needsUpdate = true;
  }

  _bucket(mat) {
    if (!this.buckets.has(mat)) this.buckets.set(mat, []);
    return this.buckets.get(mat);
  }

  /* --- materials ------------------------------------------------------- */

  async buildMaterials(onProgress) {
    const defs = [
      ['concrete', { kind: 'concrete', seed: 1.5, repeat: [1, 1] }],
      ['plaster', { kind: 'plaster', seed: 4.5, repeat: [1, 1] }],
      ['brick', { kind: 'brick', seed: 9.5, repeat: [1, 1] }],
      ['asphalt', { kind: 'asphalt', seed: 13.5, repeat: [1, 1] }],
      ['metal', { kind: 'metal', seed: 21.5, repeat: [1, 1] }],
      ['sandbag', { kind: 'sandbag', seed: 27.5, repeat: [1, 1] }]
    ];
    for (let i = 0; i < defs.length; i++) {
      const [name, opts] = defs[i];
      this.materials[name] = makeSurface(opts.kind, { size: 1024, seed: opts.seed, repeat: opts.repeat });
      if (onProgress) onProgress((i + 1) / (defs.length + 1), 'surfacing ' + name);
      await new Promise(r => setTimeout(r, 0));
    }
    /* untextured helpers */
    this.materials.dark = new THREE.MeshStandardMaterial({ color: 0x2b3034, roughness: 0.95, metalness: 0 });
    /* Glass is what stops a window reading as a hole: it has to catch the
       sky. Kept slightly transparent so the room behind still shows. */
    this.materials.glass = new THREE.MeshStandardMaterial({
      color: 0x5a656c, roughness: 0.13, metalness: 0.1, envMapIntensity: 1.9,
      transparent: true, opacity: 0.72
    });
    this.materials.wood = new THREE.MeshStandardMaterial({ color: 0x6b563c, roughness: 0.88 });
    this.materials.rubber = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.95 });
    this.materials.paint = new THREE.MeshStandardMaterial({ color: 0x8d9299, roughness: 0.55, metalness: 0.35 });
    this.materials.rust = new THREE.MeshStandardMaterial({ color: 0x6a4a33, roughness: 0.92, metalness: 0.2 });
  }

  /* --- the street ------------------------------------------------------ */

  build() {
    const LEN = 150;
    const HALF = 9;
    this.bounds = new THREE.Box3(
      new THREE.Vector3(-40, -2, -LEN / 2 - 12),
      new THREE.Vector3(40, 40, LEN / 2 + 12)
    );

    this.roadway(LEN, HALF);
    let z = -LEN / 2 + 6;
    const gaps = [-28, 14];
    while (z < LEN / 2 - 10) {
      const depth = this.rng(9, 15);
      const alley = gaps.some(g => Math.abs(z - g) < 7);
      if (alley) {
        this.alley(-HALF - 6, z, depth);
        this.alley(HALF + 6, z, depth);
      } else {
        this.building(-1, z, depth);
        this.building(1, z, depth);
      }
      z += depth + 0.35;
    }

    this.archway(-LEN / 2 + 4);
    this.streetCover(LEN, HALF);
    this.wires(LEN, HALF);
    this.finish();
    return this;
  }

  roadway(LEN, HALF) {
    /* asphalt, crowned slightly by stacking two shallow slabs */
    this.box('asphalt', 0, -0.06, 0, HALF * 2, 0.12, LEN, { uvScale: 0.12 });
    this.box('asphalt', 0, -0.02, 0, HALF * 2 - 3, 0.06, LEN, { solid: false, uvScale: 0.12 });
    for (const side of [-1, 1]) {
      const x = side * (HALF + 1.4);
      this.box('concrete', x, 0.08, 0, 2.8, 0.28, LEN, { uvScale: 0.22 });   /* pavement */
      this.box('concrete', side * HALF, 0.1, 0, 0.35, 0.32, LEN, { uvScale: 0.5 }); /* kerb */
    }
    /* potholes and patched trenches break up the flat road */
    for (let i = 0; i < 26; i++) {
      const cx = this.rng(-HALF + 1, HALF - 1);
      const cz = this.rng(-LEN / 2, LEN / 2);
      const w = this.rng(0.6, 2.6);
      this.box('concrete', cx, 0.005, cz, w, 0.02, w * this.rng(0.5, 1.6), { solid: false, uvScale: 0.4 });
    }
  }

  building(side, z, depth) {
    const HALF = 9;
    const facadeX = side * (HALF + 2.8);
    const bodyDepth = this.rng(10, 16);
    const height = this.rng(9, 21);
    const bodyX = facadeX + side * bodyDepth / 2;
    const skin = this.pick(['plaster', 'brick', 'concrete', 'plaster']);

    /* mass */
    this.box(skin, bodyX, height / 2, z, bodyDepth, height, depth, { uvScale: 0.3 });

    /* plinth */
    this.box('concrete', facadeX + side * 0.15, 0.55, z, 0.6, 1.1, depth + 0.1, { uvScale: 0.5 });

    const floorH = 3.15;
    const floors = Math.max(2, Math.floor((height - 1.2) / floorH));
    const inward = -side;   /* direction from the facade into the building */

    /* shopfront on the ground floor */
    const shopW = depth - 1.6;
    this.box('metal', facadeX + side * 0.02, 1.55, z, 0.12, 2.5, shopW, { solid: false, uvScale: 0.6 });
    this.box('dark', facadeX + inward * 0.5, 1.55, z, 0.35, 2.3, shopW - 0.5, { solid: false });
    if (this.rand() > 0.4) {
      this.box('glass', facadeX + inward * 0.12, 1.6, z, 0.05, 2.1, shopW - 0.7, { solid: false });
    } else {
      /* rolled-down shutter */
      this.box('metal', facadeX + inward * 0.1, 1.6, z, 0.06, 2.2, shopW - 0.6, { solid: false, uvScale: 2.4 });
    }
    if (this.rand() > 0.45) {
      /* awning */
      const aw = this.rng(1.0, 1.6);
      this.box('metal', facadeX + side * aw / 2, 3.35, z, aw, 0.08, shopW * 0.8, { solid: false, uvScale: 0.5 });
      this.box('metal', facadeX + side * aw, 2.9, z - shopW * 0.38, 0.07, 0.9, 0.07, { solid: false });
      this.box('metal', facadeX + side * aw, 2.9, z + shopW * 0.38, 0.07, 0.9, 0.07, { solid: false });
    }

    /* upper floors: piers, reveals, sills, lintels */
    const bayW = 2.35;
    const bays = Math.max(1, Math.floor((depth - 1.0) / bayW));
    const usable = bays * bayW;
    for (let f = 1; f < floors; f++) {
      const y0 = f * floorH;
      /* floor band */
      this.box(skin, facadeX + side * 0.09, y0 + 0.16, z, 0.2, 0.32, depth, { solid: false, uvScale: 0.6 });
      const balcony = this.rand() > 0.72;
      for (let b = 0; b < bays; b++) {
        const bz = z - usable / 2 + bayW * (b + 0.5);
        const winW = 1.25;
        const winH = 1.5;
        const cy = y0 + 1.05 + winH / 2;
        /* reveal: a dark recess set into the wall reads as an opening */
        this.box('dark', facadeX + inward * 0.34, cy, bz, 0.66, winH, winW, { solid: false });
        /* frame */
        const fr = 0.1;
        this.box('concrete', facadeX + side * 0.04, cy + winH / 2 + fr / 2, bz, 0.14, fr, winW + fr * 2, { solid: false, uvScale: 1 });
        this.box('concrete', facadeX + side * 0.04, cy - winH / 2 - fr / 2, bz, 0.18, fr * 1.6, winW + fr * 2, { solid: false, uvScale: 1 });
        this.box('concrete', facadeX + side * 0.04, cy, bz - winW / 2 - fr / 2, 0.14, winH, fr, { solid: false, uvScale: 1 });
        this.box('concrete', facadeX + side * 0.04, cy, bz + winW / 2 + fr / 2, 0.14, winH, fr, { solid: false, uvScale: 1 });
        /* glass survives in some openings, others are blown out or boarded */
        /* inner reveal: a lit lip around the opening, so the recess reads
           as depth rather than a black rectangle */
        this.box(skin, facadeX + inward * 0.2, cy + winH / 2 - 0.04, bz, 0.34, 0.08, winW, { solid: false, uvScale: 1.2 });
        this.box(skin, facadeX + inward * 0.2, cy, bz - winW / 2 + 0.04, 0.34, winH, 0.08, { solid: false, uvScale: 1.2 });
        this.box(skin, facadeX + inward * 0.2, cy, bz + winW / 2 - 0.04, 0.34, winH, 0.08, { solid: false, uvScale: 1.2 });

        const state = this.rand();
        if (state > 0.38) {
          this.box('glass', facadeX + inward * 0.08, cy, bz, 0.04, winH - 0.08, winW - 0.08, { solid: false });
        } else if (state > 0.42) {
          for (let p = 0; p < 3; p++) {
            const py = cy - winH / 2 + winH * (p + 0.5) / 3;
            this.box('wood', facadeX + inward * 0.06, py + this.rng(-0.08, 0.08), bz,
              0.05, 0.24, winW * this.rng(0.8, 1.05), { solid: false });
          }
        }
        if (balcony && b % 2 === 0) {
          const bx = facadeX + side * 0.55;
          this.box('concrete', bx, y0 + 0.95, bz, 1.1, 0.12, winW + 0.9, { uvScale: 0.6 });
          this.box('metal', bx + side * 0.5, y0 + 1.45, bz, 0.06, 0.9, winW + 0.9, { solid: false, uvScale: 1.4 });
          this.box('metal', bx, y0 + 1.45, bz - (winW + 0.9) / 2, 0.9, 0.9, 0.06, { solid: false, uvScale: 1.4 });
          this.box('metal', bx, y0 + 1.45, bz + (winW + 0.9) / 2, 0.9, 0.9, 0.06, { solid: false, uvScale: 1.4 });
        }
      }
    }

    /* cornice and parapet */
    this.box('concrete', facadeX + side * 0.22, height - 0.35, z, 0.75, 0.4, depth + 0.3, { solid: false, uvScale: 0.5 });
    this.box(skin, facadeX + side * 0.1, height + 0.5, z, 0.4, 1.0, depth, { uvScale: 0.5 });

    /* rooftop clutter reads on the skyline */
    const props = Math.floor(this.rng(1, 4));
    for (let i = 0; i < props; i++) {
      const px = bodyX + this.rng(-bodyDepth / 3, bodyDepth / 3);
      const pz = z + this.rng(-depth / 3, depth / 3);
      if (this.rand() > 0.5) {
        this.box('metal', px, height + 0.6, pz, this.rng(1.0, 1.8), 1.0, this.rng(1.0, 1.8), { uvScale: 0.8 });
      } else {
        this.box('metal', px, height + 1.4, pz, 0.12, 2.6, 0.12, { solid: false });
        this.box('metal', px, height + 2.6, pz, 1.0, 0.08, 0.9, { solid: false });
      }
    }

    /* drainpipe */
    const dz = z + (this.rand() > 0.5 ? depth / 2 - 0.3 : -depth / 2 + 0.3);
    this.box('metal', facadeX + side * 0.18, height / 2, dz, 0.2, height, 0.2, { solid: false, uvScale: 1.2 });
  }

  alley(x, z, depth) {
    /* a recessed side street: low wall, bins, a fire escape */
    const side = Math.sign(x);
    this.box('brick', x + side * 5, 6, z, 8, 12, 1.0, { uvScale: 0.3 });
    this.box('brick', x + side * 5, 6, z + depth, 8, 12, 1.0, { uvScale: 0.3 });
    this.box('concrete', x + side * 9, 5, z + depth / 2, 1.0, 10, depth, { uvScale: 0.3 });
    for (let i = 0; i < 3; i++) {
      this.box('metal', x + side * this.rng(2, 7), 0.55, z + this.rng(1, depth - 1),
        1.1, 1.1, 0.9, { uvScale: 0.9 });
    }
    /* fire escape landings */
    for (let f = 1; f < 4; f++) {
      this.box('metal', x + side * 5, f * 3.0, z + 1.2, 1.6, 0.08, 2.2, { uvScale: 1.2 });
      this.box('metal', x + side * 5.7, f * 3.0 + 0.5, z + 1.2, 0.06, 1.0, 2.2, { solid: false, uvScale: 1.4 });
    }
    this.spawns.push(new THREE.Vector3(x + side * 4, 0.1, z + depth / 2));
  }

  archway(z) {
    /* the street ends under a raised walkway, like the reference frame */
    const HALF = 9;
    this.box('concrete', -HALF - 1.5, 5.5, z, 3.5, 11, 4, { uvScale: 0.35 });
    this.box('concrete', HALF + 1.5, 5.5, z, 3.5, 11, 4, { uvScale: 0.35 });
    this.box('concrete', 0, 9.4, z, HALF * 2 + 4, 2.8, 4.4, { uvScale: 0.35 });
    this.box('concrete', 0, 11.1, z, HALF * 2 + 5, 0.6, 5.2, { solid: false, uvScale: 0.4 });
    for (let i = -4; i <= 4; i++) {
      this.box('metal', i * 2.0, 11.9, z - 2.2, 0.08, 1.0, 0.08, { solid: false });
    }
    this.box('metal', 0, 12.4, z - 2.2, HALF * 2 + 4, 0.08, 0.08, { solid: false });
    /* rubble spilling out from under the arch */
    for (let i = 0; i < 40; i++) {
      const s = this.rng(0.2, 0.9);
      this.box('concrete', this.rng(-HALF, HALF), s / 2, z + this.rng(2, 12), s, s, s,
        { solid: s > 0.5, uvScale: 1.4 });
    }
  }

  streetCover(LEN, HALF) {
    /* sandbag positions, jersey barriers, wrecks and debris give the fight
       somewhere to happen */
    for (let i = 0; i < 9; i++) {
      const z = -LEN / 2 + 12 + i * (LEN - 24) / 8 + this.rng(-3, 3);
      const x = this.rng(-HALF + 2, HALF - 2);
      const kind = this.rand();
      if (kind > 0.66) {
        this.sandbags(x, z, this.rand() > 0.5);
      } else if (kind > 0.33) {
        this.barrier(x, z, this.rng(0, Math.PI));
      } else {
        this.wreck(x, z);
      }
      this.spawns.push(new THREE.Vector3(x + this.rng(-3, 3), 0.1, z + this.rng(-4, 4)));
    }
    for (let i = 0; i < 70; i++) {
      const s = this.rng(0.15, 0.8);
      this.box('concrete', this.rng(-HALF - 2, HALF + 2), s / 2, this.rng(-LEN / 2, LEN / 2),
        s, s * this.rng(0.4, 1), s * this.rng(0.6, 1.4), { solid: s > 0.55, uvScale: 1.6 });
    }
    /* street lamps */
    for (let i = 0; i < 6; i++) {
      const side = i % 2 ? 1 : -1;
      const z = -LEN / 2 + 18 + i * 22;
      const x = side * (HALF + 0.6);
      this.box('metal', x, 2.8, z, 0.16, 5.6, 0.16, { uvScale: 1.5 });
      this.box('metal', x - side * 0.7, 5.5, z, 1.6, 0.14, 0.14, { solid: false });
      this.box('paint', x - side * 1.4, 5.35, z, 0.5, 0.2, 0.3, { solid: false });
    }
  }

  sandbags(x, z, along) {
    const rows = 3;
    const cols = 5;
    const bw = 0.62, bh = 0.28, bd = 0.4;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols - r; c++) {
        const off = (r * bw) / 2 + c * bw - ((cols - r) * bw) / 2;
        const px = along ? x + off : x + this.rng(-0.03, 0.03);
        const pz = along ? z + this.rng(-0.03, 0.03) : z + off;
        this.box('sandbag', px, bh / 2 + r * bh * 0.92, pz,
          along ? bw : bd, bh, along ? bd : bw, { uvScale: 1.2 });
      }
    }
  }

  barrier(x, z, rot) {
    /* jersey barrier: a stack of slabs approximates the taper */
    const w = 0.75, h = 0.95, d = 2.4;
    this.box('concrete', x, 0.14, z, w, 0.28, d, { uvScale: 0.9 });
    this.box('concrete', x, 0.55, z, w * 0.62, 0.55, d, { uvScale: 0.9 });
    this.box('concrete', x, h - 0.06, z, w * 0.5, 0.2, d, { uvScale: 0.9 });
  }

  wreck(x, z) {
    /* burnt-out car, boxed out - it only has to read at gameplay distance */
    const l = 4.3, w = 1.85;
    this.box('rust', x, 0.62, z, w, 0.55, l, { uvScale: 0.7 });
    this.box('rust', x, 1.05, z + this.rng(-0.2, 0.2), w * 0.92, 0.55, l * 0.45, { uvScale: 0.7 });
    this.box('dark', x, 1.28, z, w * 0.8, 0.12, l * 0.4, { solid: false });
    for (const dx of [-1, 1]) {
      for (const dz of [-1, 1]) {
        this.box('rubber', x + dx * w * 0.46, 0.32, z + dz * l * 0.33, 0.24, 0.62, 0.62, { solid: false });
      }
    }
    this.box('dark', x, 0.02, z, w * 1.6, 0.02, l * 1.5, { solid: false });
  }

  wires(LEN, HALF) {
    /* catenary cables strung across the street - they sell the depth */
    const mat = new THREE.LineBasicMaterial({ color: 0x1c1c1e });
    const geos = [];
    for (let i = 0; i < 9; i++) {
      const z = -LEN / 2 + 14 + i * (LEN - 26) / 8;
      const y = this.rng(6.5, 9.5);
      const sag = this.rng(0.8, 1.8);
      const pts = [];
      for (let t = 0; t <= 12; t++) {
        const u = t / 12;
        pts.push(new THREE.Vector3(
          -HALF - 1 + u * (HALF * 2 + 2),
          y - Math.sin(u * Math.PI) * sag,
          z + Math.sin(u * Math.PI * 2) * 0.15
        ));
      }
      geos.push(new THREE.BufferGeometry().setFromPoints(pts));
    }
    geos.forEach(g => this.group.add(new THREE.Line(g, mat)));
  }

  /* --- merge ----------------------------------------------------------- */

  finish() {
    for (const [name, geos] of this.buckets) {
      if (!geos.length) continue;
      const merged = BufferGeometryUtils.mergeGeometries(geos, false);
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, this.materials[name]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = 'world:' + name;
      this.group.add(mesh);
      geos.forEach(g => g.dispose());
    }
    this.buckets.clear();
    this._boxData = new Float32Array(this.boxes.length * 6);
    this.boxes.forEach((b, i) => {
      this._boxData.set([b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z], i * 6);
    });
  }

  /* --- queries --------------------------------------------------------- */

  /** Slab test against every world box. Returns {t, normal} or null. */
  raycast(origin, dir, maxDist) {
    const d = this._boxData;
    let bestT = maxDist;
    let hitAxis = -1;
    let hitSign = 1;
    const ox = origin.x, oy = origin.y, oz = origin.z;
    const ix = 1 / dir.x, iy = 1 / dir.y, iz = 1 / dir.z;
    for (let i = 0; i < d.length; i += 6) {
      let t1 = (d[i] - ox) * ix, t2 = (d[i + 3] - ox) * ix;
      let axis = 0, sign = t1 > t2 ? 1 : -1;
      let tmin = Math.min(t1, t2), tmax = Math.max(t1, t2);
      t1 = (d[i + 1] - oy) * iy; t2 = (d[i + 4] - oy) * iy;
      if (Math.min(t1, t2) > tmin) { tmin = Math.min(t1, t2); axis = 1; sign = t1 > t2 ? 1 : -1; }
      tmax = Math.min(tmax, Math.max(t1, t2));
      t1 = (d[i + 2] - oz) * iz; t2 = (d[i + 5] - oz) * iz;
      if (Math.min(t1, t2) > tmin) { tmin = Math.min(t1, t2); axis = 2; sign = t1 > t2 ? 1 : -1; }
      tmax = Math.min(tmax, Math.max(t1, t2));
      if (tmax >= Math.max(tmin, 0) && tmin > 0 && tmin < bestT) {
        bestT = tmin;
        hitAxis = axis;
        hitSign = sign;
      }
    }
    if (hitAxis < 0) return null;
    const normal = new THREE.Vector3();
    normal.setComponent(hitAxis, hitSign);
    return { t: bestT, normal, point: origin.clone().addScaledVector(dir, bestT) };
  }

  /** Push an axis-aligned capsule out of the world. Mutates `pos`. */
  resolve(pos, radius, halfHeight) {
    const d = this._boxData;
    let grounded = false;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < d.length; i += 6) {
        const minX = d[i] - radius, maxX = d[i + 3] + radius;
        const minY = d[i + 1] - halfHeight, maxY = d[i + 4] + halfHeight;
        const minZ = d[i + 2] - radius, maxZ = d[i + 5] + radius;
        if (pos.x <= minX || pos.x >= maxX || pos.y <= minY || pos.y >= maxY ||
            pos.z <= minZ || pos.z >= maxZ) continue;
        /* eject along the axis of least penetration */
        const px = Math.min(pos.x - minX, maxX - pos.x);
        const py = Math.min(pos.y - minY, maxY - pos.y);
        const pz = Math.min(pos.z - minZ, maxZ - pos.z);
        if (py <= px && py <= pz) {
          if (pos.y - minY < maxY - pos.y) {
            pos.y = minY;
          } else {
            pos.y = maxY;
            grounded = true;
          }
        } else if (px <= pz) {
          pos.x = pos.x - minX < maxX - pos.x ? minX : maxX;
        } else {
          pos.z = pos.z - minZ < maxZ - pos.z ? minZ : maxZ;
        }
      }
    }
    return grounded;
  }
}
