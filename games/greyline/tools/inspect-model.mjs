/* Greyline - inspect a downloaded character model before writing code against it.
 *
 *   node tools/inspect-model.mjs <file.glb|file.gltf|file.zip>
 *
 * Reports the skeleton, the clips, the meshes and the scale, and proposes a
 * mapping from the model's bone names onto the nine logical names the rig
 * overlay addresses. Everything an integration decision depends on is in
 * here, so this runs before any of it is written.
 *
 * It parses the glTF JSON directly rather than going through GLTFLoader:
 * three's loaders expect a browser, and none of what is needed here requires
 * actually building the scene.
 */
import { readFileSync, existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, extname, basename } from 'node:path';
import { tmpdir } from 'node:os';

const arg = process.argv[2];
if (!arg || !existsSync(arg)) {
  console.error('usage: node tools/inspect-model.mjs <file.glb|file.gltf|file.zip>');
  process.exit(2);
}

/* --- get at the glTF JSON ------------------------------------------------ */

function fromGlb(buf) {
  /* GLB: 12-byte header, then chunks. The first chunk is the JSON. */
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB (bad magic)');
  const length = buf.readUInt32LE(8);
  let off = 12;
  while (off < length) {
    const chunkLen = buf.readUInt32LE(off);
    const chunkType = buf.readUInt32LE(off + 4);
    const body = buf.subarray(off + 8, off + 8 + chunkLen);
    if (chunkType === 0x4e4f534a) return JSON.parse(body.toString('utf8'));
    off += 8 + chunkLen + ((4 - (chunkLen % 4)) % 4);
  }
  throw new Error('GLB has no JSON chunk');
}

function load(path) {
  const ext = extname(path).toLowerCase();
  if (ext === '.glb') return { json: fromGlb(readFileSync(path)), root: null };
  if (ext === '.gltf') return { json: JSON.parse(readFileSync(path, 'utf8')), root: path };
  if (ext === '.zip') {
    const dir = mkdtempSync(join(tmpdir(), 'greyline-model-'));
    execFileSync('python3', ['-c',
      'import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])', path, dir]);
    const walk = d => readdirSync(d, { withFileTypes: true }).flatMap(e =>
      e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]);
    const files = walk(dir);
    console.log('zip contains:');
    for (const f of files) console.log('   ', f.slice(dir.length + 1));
    console.log();
    const model = files.find(f => /\.(glb|gltf)$/i.test(f));
    if (!model) throw new Error('no .glb or .gltf inside the zip');
    return load(model);
  }
  throw new Error('unsupported file type: ' + ext);
}

const { json: g } = load(arg);

/* --- skeleton ------------------------------------------------------------ */

const nodes = g.nodes || [];
const skins = g.skins || [];
const jointSet = new Set(skins.flatMap(s => s.joints || []));
const parentOf = new Map();
nodes.forEach((n, i) => (n.children || []).forEach(c => parentOf.set(c, i)));

const name = i => (nodes[i] && nodes[i].name) || `node${i}`;
const t = i => (nodes[i] && nodes[i].translation) || [0, 0, 0];

console.log('=== file ===');
console.log('  ', basename(arg));
console.log('   generator:', (g.asset || {}).generator || '(none)');
console.log('   nodes:', nodes.length, ' skins:', skins.length,
  ' meshes:', (g.meshes || []).length, ' animations:', (g.animations || []).length);
console.log();

console.log('=== skeleton ===');
if (!jointSet.size) console.log('   NO SKIN - this model is not rigged');
const roots = [...jointSet].filter(j => !jointSet.has(parentOf.get(j)));
const len = v => Math.hypot(v[0], v[1], v[2]);
const printBone = (i, depth) => {
  const kids = (nodes[i].children || []).filter(c => jointSet.has(c));
  const d = t(i);
  /* A bone's bind direction is where its child sits, in its own local frame.
     This is what the overlay's swing/spread/twist axes get derived from. */
  let dir = '';
  if (kids.length === 1) {
    const c = t(kids[0]);
    const l = len(c);
    if (l > 1e-6) dir = `  dir=[${c.map(v => (v / l).toFixed(2)).join(', ')}] len=${l.toFixed(3)}`;
  } else if (kids.length > 1) {
    dir = `  (${kids.length} children)`;
  } else {
    dir = '  (tip)';
  }
  console.log('   ' + '  '.repeat(depth) + name(i) +
    `   t=[${d.map(v => v.toFixed(3)).join(', ')}]` + dir);
  for (const c of kids) printBone(c, depth + 1);
};
for (const r of roots) printBone(r, 0);
console.log();

/* --- proposed bone mapping ---------------------------------------------- */

/* Propose a mapping onto the nine logical names src/rig.js's overlay()
   addresses. Purely name-based matching is not enough: it works on Mixamo
   rigs and falls over on anything else (Khronos's CesiumMan calls its upper
   arm "Skeleton_arm_joint_L__4_"). So names identify the part and the side,
   and the hierarchy decides which of two joints on the same limb is which -
   the upper arm is the forearm's parent, whatever either is called. */
const depthOf = i => {
  let d = 0, c = i;
  while (jointSet.has(parentOf.get(c))) { c = parentOf.get(c); d++; }
  return d;
};

function tokens(n) {
  return String(n).toLowerCase()
    .replace(/^mixamorig:?/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim().split(/\s+/);
}

function sideOf(n) {
  const tk = tokens(n);
  /* A bare l/r token, or a left/right word, anywhere in the name. */
  if (tk.some(t => t === 'l' || t === 'left' || t === 'lft')) return 'L';
  if (tk.some(t => t === 'r' || t === 'right' || t === 'rgt')) return 'R';
  if (/left/i.test(n)) return 'L';
  if (/right/i.test(n)) return 'R';
  return null;
}

function partOf(n) {
  /* Normalise separators to spaces first. Underscore is a word character, so
     /\bleg\b/ never matches "leg_joint_L_1" - which is exactly how a rig
     silently fails to map. */
  const s = ' ' + String(n).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
  if (/fore ?arm|lowerarm|lower_arm/.test(s)) return 'forearm';
  if (/\barm\b|arm/.test(s) && !/forearm/.test(s)) return 'arm';
  if (/upleg|thigh|upper ?leg/.test(s)) return 'thigh';
  if (/\bleg\b|shin|calf|knee/.test(s)) return 'leg';
  if (/head/.test(s)) return 'head';
  if (/neck/.test(s)) return 'neck';
  if (/chest/.test(s)) return 'chest';
  if (/spine|torso|abdomen|back/.test(s)) return 'spine';
  if (/hips?|pelvis|root/.test(s)) return 'hips';
  return null;
}

const catalogue = [...jointSet].map(i => ({
  i, n: name(i), part: partOf(name(i)), side: sideOf(name(i)), depth: depthOf(i)
}));

const pick = (part, side) => catalogue
  .filter(b => b.part === part && (side ? b.side === side : true))
  .sort((a, b) => a.depth - b.depth);

const map = {};

/* Arms: shallowest on each side is the upper arm, next is the forearm. A rig
   that names both "arm" gets split by depth; one that names them properly
   uses the names. */
for (const side of ['L', 'R']) {
  const arms = pick('arm', side);
  const fores = pick('forearm', side);
  map['arm' + side] = arms[0] ? arms[0].n : null;
  map['forearm' + side] = fores[0] ? fores[0].n : (arms[1] ? arms[1].n : null);

  const thighs = pick('thigh', side);
  const legs = pick('leg', side);
  map['thigh' + side] = thighs[0] ? thighs[0].n : (legs[0] ? legs[0].n : null);
}

/* Spine chain: shallowest spine-ish joint is the hips when nothing is named
   hips, the deepest is the chest when nothing is named chest. */
const hips = pick('hips', null);
const spines = pick('spine', null);
const chests = pick('chest', null);
map.hips = hips[0] ? hips[0].n : (spines[0] ? spines[0].n : null);
map.chest = chests[0] ? chests[0].n
  : (spines.length > 1 ? spines[spines.length - 1].n : null);
map.spine = spines.length ? (map.hips === spines[0].n && spines[1] ? spines[1].n : spines[0].n) : null;
if (map.spine === map.chest && spines.length > 2) map.spine = spines[1].n;
/* Some rigs have no head joint at all, only a neck chain - the deepest neck
   joint is then what the head hangs off, and is what a head turn should
   rotate. */
const heads = pick('head', null);
const necks = pick('neck', null);
map.head = heads[0] ? heads[0].n
  : (necks.length ? necks[necks.length - 1].n : null);

console.log('=== proposed bone mapping ===');
console.log('   (a suggestion from names plus hierarchy - check it against the');
console.log('    skeleton above before trusting it)');
for (const logical of ['hips', 'spine', 'chest', 'head', 'armL', 'armR',
                       'forearmL', 'forearmR', 'thighL', 'thighR']) {
  console.log('  ', logical.padEnd(9), map[logical] || '*** NO MATCH - map by hand ***');
}
console.log();

/* --- animations ---------------------------------------------------------- */

console.log('=== animations ===');
const accessors = g.accessors || [];
for (const [i, a] of (g.animations || []).entries()) {
  let dur = 0;
  for (const s of a.samplers || []) {
    const acc = accessors[s.input];
    if (acc && acc.max && acc.max.length) dur = Math.max(dur, acc.max[0]);
  }
  const targets = new Set((a.channels || []).map(c => c.target && c.target.node));
  console.log(`   [${i}] ${(a.name || '(unnamed)').padEnd(28)} ${dur.toFixed(2)}s  ` +
    `${(a.channels || []).length} channels over ${targets.size} nodes`);
}
if (!(g.animations || []).length) console.log('   none');
console.log();

/* --- meshes and materials ------------------------------------------------ */

console.log('=== meshes ===');
let tris = 0;
for (const m of g.meshes || []) {
  for (const p of m.primitives || []) {
    const idx = accessors[p.indices];
    const pos = accessors[p.attributes && p.attributes.POSITION];
    const n = idx ? idx.count / 3 : (pos ? pos.count / 3 : 0);
    tris += n;
    const skinned = p.attributes && p.attributes.JOINTS_0 !== undefined;
    console.log(`   ${(m.name || 'mesh').padEnd(26)} ${Math.round(n).toString().padStart(7)} tris` +
      `  verts=${pos ? pos.count : '?'}  ${skinned ? 'skinned' : 'STATIC'}`);
  }
}
console.log('   total:', Math.round(tris), 'triangles');
/* The budget that matters: the level already draws ~257k. */
console.log('   20 guards would add:', Math.round(tris * 20), 'triangles');
console.log();

console.log('=== materials / textures ===');
for (const m of g.materials || []) console.log('   material:', m.name || '(unnamed)');
for (const im of g.images || []) {
  console.log('   image:', im.name || im.uri || `(buffer view, ${im.mimeType || '?'})`);
}
console.log();

/* --- scale --------------------------------------------------------------- */

console.log('=== scale ===');
const posAcc = (g.meshes || []).flatMap(m => (m.primitives || [])
  .map(p => accessors[p.attributes && p.attributes.POSITION]).filter(Boolean));
if (posAcc.length) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const a of posAcc) {
    if (!a.min || !a.max) continue;
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], a.min[k]);
      hi[k] = Math.max(hi[k], a.max[k]);
    }
  }
  const size = hi.map((v, k) => v - lo[k]);
  console.log('   bounds:', size.map(v => v.toFixed(3)).join(' x '));
  const tall = Math.max(...size);
  console.log('   tallest axis:', tall.toFixed(3),
    tall > 10 ? '-> looks like centimetres, needs scaling by ~0.01'
      : tall < 0.1 ? '-> very small, check units'
        : '-> looks like metres');
  console.log('   a guard should stand about 1.8 high');
} else {
  console.log('   (no POSITION bounds in the file)');
}
