/* Greyline - character asset build step (run by hand, not part of `npm run build`).
 *
 *   node tools/pack-character.mjs <soldier.zip|scene.gltf> [outfile]
 *
 * Takes the downloaded Sketchfab glTF and writes the trimmed .glb the game
 * loads. Two things get dropped:
 *
 *  - The assault rifle that ships inside the character. It is 10,142 of the
 *    model's 16,454 triangles and it owns both of its textures, so removing
 *    it takes the asset from 5.3MB to a fraction of that. The guards carry
 *    their own weapon; this one is not rigged to the skeleton anyway.
 *  - Everything left unreferenced afterwards - materials, textures,
 *    accessors - which is what makes the saving real rather than cosmetic.
 *
 * Scale is deliberately NOT baked in. The rig is authored in centimetres,
 * and the animation tracks carry translations in those units too; scaling
 * the root at runtime scales both together, where baking it into the meshes
 * alone would leave the animation moving bones a hundred times too far.
 */
import { NodeIO } from '@gltf-transform/core';
import { prune, dedup, resample } from '@gltf-transform/functions';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, existsSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const GAME = join(HERE, '..');

/* Meshes belonging to the bundled rifle. Matched on name because that is
   what the exporter preserved; everything of the character itself is called
   Base_Something. */
const DROP = /AssaultRifle|Assault_Rifle/i;

const input = process.argv[2];
const output = process.argv[3] || join(GAME, 'assets', 'characters', 'guard.glb');

if (!input || !existsSync(input)) {
  console.error('usage: node tools/pack-character.mjs <soldier.zip|scene.gltf> [outfile]');
  process.exit(2);
}

function unzip(path) {
  const dir = mkdtempSync(join(tmpdir(), 'greyline-char-'));
  execFileSync('python3', ['-c',
    'import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])', path, dir]);
  const walk = d => readdirSync(d, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]);
  const gltf = walk(dir).find(f => /\.(gltf|glb)$/i.test(f));
  if (!gltf) throw new Error('no .gltf or .glb inside the zip');
  return gltf;
}

const srcPath = extname(input).toLowerCase() === '.zip' ? unzip(input) : input;

const io = new NodeIO();
const doc = await io.read(srcPath);
const root = doc.getRoot();

const before = {
  meshes: root.listMeshes().length,
  tris: root.listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => {
    const idx = p.getIndices();
    return k + (idx ? idx.getCount() : p.getAttribute('POSITION').getCount()) / 3;
  }, 0), 0),
  textures: root.listTextures().length,
  animations: root.listAnimations().length
};

/* Remove the rifle's nodes outright. Only unsetting their meshes leaves the
   empty groups behind - prune() keeps a node that still has a parent - and
   those were showing up in the packed file as clutter with nothing in it.
   Anything they parented becomes unreachable from the scene, which prune()
   does collect. */
let dropped = 0;
for (const node of root.listNodes()) {
  const mesh = node.getMesh();
  if (DROP.test(node.getName()) || (mesh && DROP.test(mesh.getName()))) {
    node.dispose();
    dropped++;
  }
}
for (const mesh of root.listMeshes()) {
  if (DROP.test(mesh.getName())) mesh.dispose();
}

/* Name each mesh node after its mesh. The exporter called them Object_337
   and Object_339, and three.js names the loaded object after the node, so
   the body and head could not be told apart at runtime. */
for (const node of root.listNodes()) {
  const mesh = node.getMesh();
  if (mesh) node.setName(mesh.getName().replace(/_layeredShader.*$/, ''));
}

/* resample() drops keyframes that repeat what interpolation would already
   produce. The rig is a baked Maya export, so almost half the animation data
   is redundant - and animation is 1.8MB of a 1.9MB asset here, the meshes
   being only 278KB. */
await doc.transform(resample(), prune());

/* Re-base every clip to start at zero.

   The six clips are slices of one continuous Maya timeline, and each kept
   its absolute timestamps: "Walk 100%" is labelled 5.58s long but its keys
   run from 4.21s to 5.58s. A player takes the duration from zero, so the
   first 4.21s just holds the opening key - a guard would stand frozen for
   four seconds, stride for one and a half, and freeze again. Nothing
   errors; it only looks broken, which is why it is fixed here in the asset
   rather than patched over at runtime.

   Input accessors are collected into a Set before shifting, because dedup()
   lets samplers within a clip share one - shifting per sampler would shift
   a shared one twice. */
const rebased = [];
for (const anim of root.listAnimations()) {
  const inputs = new Set(anim.listSamplers().map(s => s.getInput()).filter(Boolean));
  let t0 = Infinity, t1 = -Infinity;
  for (const acc of inputs) {
    const a = acc.getArray();
    t0 = Math.min(t0, a[0]);
    t1 = Math.max(t1, a[a.length - 1]);
  }
  if (!Number.isFinite(t0)) continue;
  for (const acc of inputs) {
    const a = acc.getArray().slice();
    for (let i = 0; i < a.length; i++) a[i] -= t0;
    acc.setArray(a);
  }
  rebased.push(`${anim.getName()} ${t0.toFixed(2)}-${t1.toFixed(2)}s -> 0-${(t1 - t0).toFixed(2)}s`);
}

/* Close each clip's loop seam.

   Cut from one continuous timeline, the clips were never authored as loops:
   the last frame of "Run 100%" was meant to hand on to "Run 50%", not back to
   its own start. Played on repeat, the hip jumps 18 degrees every cycle and
   the low-ready walk's wrist 34. Over the final stretch of each clip, every
   track is eased back towards its first key, so the loop closes exactly.
   A track whose ends already agree is left unchanged by construction - the
   blend is between two equal values - so this only touches what pops. */
const SEAM = 0.2;   /* fraction of the clip given over to closing the loop */
const closed = [];
const qa = [0, 0, 0, 0], qb = [0, 0, 0, 0];
function slerp(out, a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const s = d < 0 ? -1 : 1;
  d *= s;
  let k0 = 1 - t, k1 = t * s;
  if (d < 0.9995) {
    const th = Math.acos(d), sn = Math.sin(th);
    k0 = Math.sin((1 - t) * th) / sn;
    k1 = (Math.sin(t * th) / sn) * s;
  }
  for (let i = 0; i < 4; i++) out[i] = a[i] * k0 + b[i] * k1;
  const len = Math.hypot(out[0], out[1], out[2], out[3]) || 1;
  for (let i = 0; i < 4; i++) out[i] /= len;
}
for (const anim of root.listAnimations()) {
  let worst = 0;
  const done = new Set();
  for (const s of anim.listSamplers()) {
    const out = s.getOutput(), inp = s.getInput();
    if (!out || !inp || done.has(out)) continue;
    done.add(out);
    const times = inp.getArray(), vals = out.getArray().slice();
    const n = out.getElementSize(), count = times.length;
    if (count < 3) continue;
    const T = times[count - 1], start = T * (1 - SEAM);
    const first = vals.slice(0, n);
    for (let i = 1; i < count; i++) {
      if (times[i] < start) continue;
      const x = (times[i] - start) / (T * SEAM);
      const w = x * x * (3 - 2 * x);       /* smoothstep: no kink where it begins */
      if (n === 4) {
        for (let k = 0; k < 4; k++) { qa[k] = vals[i * 4 + k]; qb[k] = first[k]; }
        if (i === count - 1) {
          const d = Math.abs(qa[0] * qb[0] + qa[1] * qb[1] + qa[2] * qb[2] + qa[3] * qb[3]);
          worst = Math.max(worst, 2 * Math.acos(Math.min(1, d)) * 180 / Math.PI);
        }
        slerp(qa, qa, qb, w);
        for (let k = 0; k < 4; k++) vals[i * 4 + k] = qa[k];
      } else {
        for (let k = 0; k < n; k++) vals[i * n + k] += (first[k] - vals[i * n + k]) * w;
      }
    }
    out.setArray(vals);
  }
  closed.push(`${anim.getName()}: worst seam ${worst.toFixed(1)} deg -> 0`);
}

/* Deduplicate only now. Run earlier, it lets samplers share accessors, and
   the two passes above edit accessors in place - a shared one would be
   shifted or blended twice. */
await doc.transform(dedup(), prune());

const after = {
  meshes: root.listMeshes().length,
  tris: root.listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => {
    const idx = p.getIndices();
    return k + (idx ? idx.getCount() : p.getAttribute('POSITION').getCount()) / 3;
  }, 0), 0),
  textures: root.listTextures().length,
  animations: root.listAnimations().length
};

mkdirSync(dirname(resolve(output)), { recursive: true });
await io.write(output, doc);

const mb = n => (n / 1048576).toFixed(2) + ' MB';
console.log('dropped %d rifle node(s)', dropped);
console.log('  re-based clips:');
for (const r of rebased) console.log('    ' + r);
console.log('  closed loop seams:');
for (const c of closed) console.log('    ' + c);
console.log('  meshes     %d -> %d', before.meshes, after.meshes);
console.log('  triangles  %d -> %d', Math.round(before.tris), Math.round(after.tris));
console.log('  textures   %d -> %d', before.textures, after.textures);
console.log('  animations %d (kept: %s)', after.animations,
  root.listAnimations().map(a => a.getName()).join(', '));
console.log('  source     %s', mb(statSync(srcPath).size));
console.log('  written    %s  %s', output, mb(statSync(output).size));
console.log('\n  20 guards = %d triangles', Math.round(after.tris) * 20);
