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

/* Detach the rifle nodes, then let prune() collect what they were holding. */
let dropped = 0;
for (const node of root.listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  if (DROP.test(node.getName()) || DROP.test(mesh.getName())) {
    node.setMesh(null);
    dropped++;
  }
}
for (const mesh of root.listMeshes()) {
  if (DROP.test(mesh.getName())) mesh.dispose();
}

/* resample() drops keyframes that repeat what interpolation would already
   produce. The rig is a baked Maya export, so almost half the animation data
   is redundant - and animation is 1.8MB of a 1.9MB asset here, the meshes
   being only 278KB. */
await doc.transform(resample(), dedup(), prune());

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
console.log('  meshes     %d -> %d', before.meshes, after.meshes);
console.log('  triangles  %d -> %d', Math.round(before.tris), Math.round(after.tris));
console.log('  textures   %d -> %d', before.textures, after.textures);
console.log('  animations %d (kept: %s)', after.animations,
  root.listAnimations().map(a => a.getName()).join(', '));
console.log('  source     %s', mb(statSync(srcPath).size));
console.log('  written    %s  %s', output, mb(statSync(output).size));
console.log('\n  20 guards = %d triangles', Math.round(after.tris) * 20);
