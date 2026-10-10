/* Greyline - weapon asset build step (run by hand, not part of `npm run build`).
 *
 *   node tools/pack-weapons.mjs <keam.zip|dir> <r2detta.zip|dir> [outfile]
 *
 * Pulls the five weapons the game uses out of two downloaded Sketchfab packs
 * (about thirty weapons, grenades and rockets between them) and writes one
 * small .glb. Both are CC-BY-4.0; see CREDITS.md.
 *
 * Each weapon comes out in the same frame, so src/weapon.js can treat them
 * alike: metres at its real length, barrel along -Z, +Y up, centred on its
 * bounding box, as a node named after the game's weapon id. Transforms are
 * baked into the vertices, so every node is an identity.
 *
 * Two things the packs needed that are not obvious from looking at them:
 *
 *  - Keam's materials use KHR_materials_pbrSpecularGlossiness, which three.js
 *    dropped support for. Loaded as-is, every Keam weapon renders untextured
 *    grey. Its textures turn out to be palettes, though - 1024px images
 *    holding two to six flat colour blocks - so each triangle's colour is
 *    read out and baked into a vertex colour, and the textures go. That keeps
 *    the look exactly, and saves ~40MB of GPU memory on what is flat colour.
 *  - The packs disagree about forward: Keam's point -Z, r2detta's +Z. And
 *    r2detta's L115 carries a stray two-triangle fragment of another weapon
 *    four units away, which would have dragged its bounding box - and so
 *    its scale and centre - off by metres.
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, weld, quantize, mergeDocuments, transformMesh } from '@gltf-transform/functions';
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, existsSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const GAME = join(HERE, '..');

/* Keam poses both magazines dropped clear of the gun, for the thumbnail.
   Each is put back in its magwell: moved (metres, in the packed frame) and
   tilted (degrees about X, around the top of the magazine). */
const SEAT = {
  smg: { Loader_Kriss: { tilt: 29, move: [0, 0.035, 0.06] } },
  rifle: { Caricatore: { move: [0, 0.042, 0] } }
};

/* Which parts make which weapon. Keam's nodes are named generically (Body,
   Body.004, Caricatore...), so these were identified by rendering each node
   on its own. `length` is the real weapon's overall length in metres. */
const WEAPONS = [
  { id: 'pistol_s', pack: 'r2detta', nodes: ['Usp45_Silenced'], turn: true, length: 0.40,
    what: 'USP .45 with suppressor' },
  { id: 'smg', pack: 'keam', nodes: ['Body_Kriss', 'Loader_Kriss', 'Part1_Kriss', 'Lever'], length: 0.87,
    what: 'Kriss Vector', islands: ['Loader_Kriss'], seat: SEAT.smg },
  { id: 'rifle', pack: 'keam', nodes: ['Body', 'Caricatore', 'Parte_M4', 'Body.001'], length: 0.84,
    what: 'M4 carbine', islands: ['Caricatore'], seat: SEAT.rifle },
  { id: 'shotgun', pack: 'keam', nodes: ['Body.004', 'Reloader'], length: 1.0,
    what: 'Ithaca 37 pump' },
  { id: 'sniper', pack: 'r2detta', nodes: ['L115_Awp'], drop: ['AA12__0'], turn: true, length: 1.2,
    what: 'L115 / AWM' }
];

const [keamIn, r2In] = process.argv.slice(2, 4);
const output = process.argv[4] || join(GAME, 'assets', 'weapons', 'weapons.glb');
if (!keamIn || !r2In || !existsSync(keamIn) || !existsSync(r2In)) {
  console.error('usage: node tools/pack-weapons.mjs <keam.zip|dir> <r2detta.zip|dir> [outfile]');
  process.exit(2);
}

function findGltf(path) {
  let dir = path;
  if (extname(path).toLowerCase() === '.zip') {
    dir = mkdtempSync(join(tmpdir(), 'greyline-weapons-'));
    execFileSync('python3', ['-c',
      'import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])', path, dir]);
  } else if (/\.(gltf|glb)$/i.test(path)) {
    return path;
  }
  const walk = d => readdirSync(d, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]);
  const gltf = walk(dir).find(f => /\.(gltf|glb)$/i.test(f));
  if (!gltf) throw new Error('no .gltf or .glb in ' + path);
  return gltf;
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

const tris = mesh => mesh.listPrimitives().reduce((k, p) => {
  const idx = p.getIndices();
  return k + (idx ? idx.getCount() : p.getAttribute('POSITION').getCount()) / 3;
}, 0);

const toLinear = c => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};

/* Replace a palette texture with per-triangle vertex colours. The primitive
   is unwelded first - a vertex shared by two triangles of different colours
   would otherwise blend them - and welded again at the end of the build. */
async function bakePalette(doc, prim, material, report) {
  const sg = material.getExtension('KHR_materials_pbrSpecularGlossiness');
  const tex = sg && sg.getDiffuseTexture();
  const factor = sg ? sg.getDiffuseFactor() : [1, 1, 1, 1];
  const uv = prim.getAttribute('TEXCOORD_0');

  let img = null;
  if (tex && uv) {
    const { data, info } = await sharp(Buffer.from(tex.getImage())).raw().toBuffer({ resolveWithObject: true });
    img = { data, w: info.width, h: info.height, ch: info.channels };
  }

  const idx = prim.getIndices();
  const count = idx ? idx.getCount() : prim.getAttribute('POSITION').getCount();
  const corner = i => (idx ? idx.getScalar(i) : i);

  /* Unweld every attribute. */
  for (const semantic of prim.listSemantics()) {
    const acc = prim.getAttribute(semantic);
    const size = acc.getElementSize();
    const out = new Float32Array(count * size);
    const el = [];
    for (let i = 0; i < count; i++) {
      acc.getElement(corner(i), el);
      for (let k = 0; k < size; k++) out[i * size + k] = el[k];
    }
    prim.setAttribute(semantic, doc.createAccessor()
      .setType(acc.getType()).setArray(out).setBuffer(acc.getBuffer()));
  }
  prim.setIndices(null);

  const colours = new Float32Array(count * 3);
  const uvs = prim.getAttribute('TEXCOORD_0');
  const a = [], b = [], c = [];
  let white = 0;
  for (let t = 0; t < count; t += 3) {
    let rgb = [255, 255, 255];
    if (img) {
      uvs.getElement(t, a); uvs.getElement(t + 1, b); uvs.getElement(t + 2, c);
      const u = (a[0] + b[0] + c[0]) / 3, v = (a[1] + b[1] + c[1]) / 3;
      const x = Math.min(img.w - 1, Math.floor((u - Math.floor(u)) * img.w));
      const y = Math.min(img.h - 1, Math.floor((v - Math.floor(v)) * img.h));
      const o = (y * img.w + x) * img.ch;
      rgb = [img.data[o], img.data[o + 1], img.data[o + 2]];
      /* Pure white is the unused part of every palette here; a triangle
         landing on it means the sampling is wrong, so count them. */
      if (rgb[0] === 255 && rgb[1] === 255 && rgb[2] === 255) white++;
    }
    for (let k = 0; k < 3; k++) {
      const lin = toLinear(rgb[k]) * factor[k];
      colours[t * 3 + k] = colours[(t + 1) * 3 + k] = colours[(t + 2) * 3 + k] = lin;
    }
  }
  prim.setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(colours)
    .setBuffer(prim.getAttribute('POSITION').getBuffer()));
  if (uvs) prim.setAttribute('TEXCOORD_0', null);
  report.push({ tris: count / 3, white });
}

/* Keep only the islands of a mesh that touch its largest one. Keam's
   magazine meshes each carry a single loose cartridge posed in front of the
   muzzle - a separate island far from the magazine itself. Connectivity is
   by position rather than by index, since UV seams split vertices that are
   geometrically one. */
function keepMainIslands(doc, mesh) {
  let dropped = 0;
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION');
    const idx = prim.getIndices();
    const n = idx ? idx.getCount() : pos.getCount();
    const corner = i => (idx ? idx.getScalar(i) : i);
    const key = new Map(), parent = [];
    const find = a => { while (parent[a] !== a) a = parent[a] = parent[parent[a]]; return a; };
    const v = [];
    const id = i => {
      pos.getElement(i, v);
      const k = v.map(x => Math.round(x * 1e4)).join(',');
      if (!key.has(k)) { key.set(k, parent.length); parent.push(parent.length); }
      return key.get(k);
    };
    for (let t = 0; t < n; t += 3) {
      const a = id(corner(t)), b = id(corner(t + 1)), c = id(corner(t + 2));
      parent[find(b)] = find(a);
      parent[find(c)] = find(a);
    }
    const islands = new Map();
    for (let t = 0; t < n; t += 3) {
      const r = find(id(corner(t)));
      if (!islands.has(r)) islands.set(r, { tris: [], min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
      const isl = islands.get(r);
      isl.tris.push(t);
      for (let k = 0; k < 3; k++) {
        pos.getElement(corner(t + k), v);
        for (let a = 0; a < 3; a++) { isl.min[a] = Math.min(isl.min[a], v[a]); isl.max[a] = Math.max(isl.max[a], v[a]); }
      }
    }
    const main = [...islands.values()].sort((a, b) => b.tris.length - a.tris.length)[0];
    const pad = main.max.map((x, a) => (x - main.min[a]) * 0.05);
    const touches = isl => isl.min.every((x, a) => x <= main.max[a] + pad[a]) &&
      isl.max.every((x, a) => x >= main.min[a] - pad[a]);
    const out = [];
    for (const isl of islands.values()) {
      if (isl === main || touches(isl)) for (const t of isl.tris) out.push(corner(t), corner(t + 1), corner(t + 2));
      else dropped += isl.tris.length;
    }
    prim.setIndices(doc.createAccessor().setType('SCALAR')
      .setArray(new Uint32Array(out)).setBuffer(pos.getBuffer()));
  }
  return dropped;
}

/* World-space bounds of the triangles a node actually draws - unlike the
   accessor's min/max, which also counts vertices no triangle uses any more. */
function drawnBounds(node, min, max) {
  const W = node.getWorldMatrix();
  const v = [];
  for (const prim of node.getMesh().listPrimitives()) {
    const pos = prim.getAttribute('POSITION'), idx = prim.getIndices();
    const n = idx ? idx.getCount() : pos.getCount();
    for (let i = 0; i < n; i++) {
      pos.getElement(idx ? idx.getScalar(i) : i, v);
      for (let r = 0; r < 3; r++) {
        const w = W[r] * v[0] + W[4 + r] * v[1] + W[8 + r] * v[2] + W[12 + r];
        min[r] = Math.min(min[r], w);
        max[r] = Math.max(max[r], w);
      }
    }
  }
}

/* 4x4 column-major helpers - enough for a translate, a half-turn and a scale. */
function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  }
  return o;
}
const translate = (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
const scale = s => [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1];
const halfTurnY = [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1];
const rotX = deg => {
  const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
};

async function processPack(pack, path) {
  const doc = await io.read(path);
  const root = doc.getRoot();
  const scene = root.getDefaultScene() || root.listScenes()[0];
  const specs = WEAPONS.filter(w => w.pack === pack);
  const byName = new Map(root.listNodes().map(n => [n.getName(), n]));
  const keep = [];
  const stats = [];

  const shared = pack === 'keam'
    ? doc.createMaterial('keam_palette').setBaseColorFactor([1, 1, 1, 1])
      .setMetallicFactor(0.35).setRoughnessFactor(0.55)
    : null;

  for (const w of specs) {
    const parts = [];
    for (const name of w.nodes) {
      const n = byName.get(name);
      if (!n) throw new Error(`${pack}: no node "${name}" for ${w.id}`);
      n.traverse(c => {
        if (c.getMesh() && !(w.drop || []).includes(c.getName())) parts.push(c);
      });
    }

    let loose = 0;
    for (const p of parts) if ((w.islands || []).includes(p.getName().replace(/_0$/, ''))) {
      loose += keepMainIslands(doc, p.getMesh());
    }

    /* Bounds of just what is drawn, in the pack's world space. */
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const p of parts) drawnBounds(p, min, max);
    const size = max.map((v, k) => v - min[k]);
    const centre = max.map((v, k) => (v + min[k]) / 2);
    const s = w.length / size[2];
    let N = mul(scale(s), translate(-centre[0], -centre[1], -centre[2]));
    if (w.turn) N = mul(halfTurnY, N);

    const node = doc.createNode(w.id);
    node.setExtras({ what: w.what, pack, length: w.length });
    scene.addChild(node);
    let t = 0;
    const palette = [];
    for (const p of parts) {
      const mesh = p.getMesh();
      transformMesh(mesh, mul(N, p.getWorldMatrix()));
      const seat = (w.seat || {})[p.getName().replace(/_0$/, '')];
      if (seat) {
        /* Tilt about the magazine's top centre, then move it. */
        const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
        const probe = doc.createNode().setMesh(mesh);
        drawnBounds(probe, lo, hi);
        probe.dispose();
        const top = [(lo[0] + hi[0]) / 2, hi[1], (lo[2] + hi[2]) / 2];
        const m = seat.move || [0, 0, 0];
        transformMesh(mesh, mul(translate(top[0] + m[0], top[1] + m[1], top[2] + m[2]),
          mul(rotX(seat.tilt || 0), translate(-top[0], -top[1], -top[2]))));
      }
      if (process.env.PARTS) {
        const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
        const probe = doc.createNode().setMesh(mesh);
        drawnBounds(probe, lo, hi);
        probe.dispose();
        console.log(`    ${w.id} ${p.getName().padEnd(16)} y ${lo[1].toFixed(3)}..${hi[1].toFixed(3)}  z ${lo[2].toFixed(3)}..${hi[2].toFixed(3)}`);
      }
      if (shared) {
        for (const prim of mesh.listPrimitives()) {
          await bakePalette(doc, prim, prim.getMaterial(), palette);
          prim.setMaterial(shared);
        }
      }
      t += tris(mesh);
      node.addChild(doc.createNode(p.getName()).setMesh(mesh));
    }
    keep.push(node);
    stats.push({
      id: w.id, what: w.what, parts: parts.length, tris: t, loose,
      size: size.map(v => (v * s).toFixed(3)).join(' x '),
      palette: palette.length ? palette.reduce((k, r) => k + r.white, 0) + ' of ' +
        palette.reduce((k, r) => k + r.tris, 0) + ' triangles on unused palette' : 'flat materials'
    });
  }

  /* Everything else in the pack goes. */
  for (const n of scene.listChildren()) if (!keep.includes(n)) scene.removeChild(n);
  for (const n of root.listNodes()) {
    if (!keep.includes(n) && !keep.some(k => k.listChildren().includes(n))) n.dispose();
  }
  for (const ext of root.listExtensionsUsed()) {
    if (ext.extensionName === 'KHR_materials_pbrSpecularGlossiness') ext.dispose();
  }
  await doc.transform(prune());
  return { doc, stats };
}

const r2 = await processPack('r2detta', findGltf(r2In));
const keam = await processPack('keam', findGltf(keamIn));

/* One file: bring Keam's scene into r2detta's and fold its nodes across. */
mergeDocuments(r2.doc, keam.doc);
const scenes = r2.doc.getRoot().listScenes();
for (const extra of scenes.slice(1)) {
  for (const n of extra.listChildren()) scenes[0].addChild(n);
  extra.dispose();
}
r2.doc.getRoot().setDefaultScene(scenes[0]);
const buffers = r2.doc.getRoot().listBuffers();
for (const acc of r2.doc.getRoot().listAccessors()) acc.setBuffer(buffers[0]);
for (const b of buffers.slice(1)) b.dispose();

/* weld() re-merges what the palette bake unwelded wherever the colours
   agree; quantize() stores positions, normals and colours as integers
   (KHR_mesh_quantization, which three.js reads natively). */
await r2.doc.transform(weld(), dedup(), prune(), quantize());

mkdirSync(dirname(resolve(output)), { recursive: true });
await io.write(output, r2.doc);

for (const s of [...r2.stats, ...keam.stats]) {
  console.log(`  ${s.id.padEnd(9)} ${s.what.padEnd(24)} ${String(s.tris).padStart(6)} tris  ` +
    `${s.parts} part(s)  ${s.size} m  - ${s.palette}` +
    (s.loose ? `; ${s.loose} loose triangles dropped` : ''));
}
console.log('  textures  %d', r2.doc.getRoot().listTextures().length);
console.log('  written   %s  %s KB', output, (statSync(output).size / 1024).toFixed(0));
