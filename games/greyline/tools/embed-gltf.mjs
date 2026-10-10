/* Greyline - repack a .glb as one self-contained glTF JSON file.
 *
 *   node tools/embed-gltf.mjs <in.glb> <out.json>
 *
 * For the hosted build only. The artifact host serves a fixed list of file
 * extensions and .glb is not on it, but .json is - and a glTF with its
 * buffers embedded as base64 data URIs is a single JSON file. GLTFLoader
 * checks the content for the binary magic and otherwise parses it as JSON,
 * so the name it is served under does not matter. assets/models.web.json
 * points the game at these; the repo build keeps loading the .glb files.
 *
 * Base64 costs a third more bytes, which is the price of being servable.
 */
import { NodeIO, Format } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { writeFileSync, statSync } from 'node:fs';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: node tools/embed-gltf.mjs <in.glb> <out.json>');
  process.exit(2);
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
const { json, resources } = await io.writeJSON(doc, { format: Format.GLTF });

for (const buffer of json.buffers || []) {
  const data = resources[buffer.uri];
  if (!data) throw new Error('no data for buffer ' + buffer.uri);
  buffer.uri = 'data:application/octet-stream;base64,' + Buffer.from(data).toString('base64');
}
for (const image of json.images || []) {
  if (image.uri && resources[image.uri]) {
    const type = image.mimeType || (image.uri.endsWith('.png') ? 'image/png' : 'image/jpeg');
    image.uri = `data:${type};base64,` + Buffer.from(resources[image.uri]).toString('base64');
  }
}

writeFileSync(output, JSON.stringify(json));
const kb = p => (statSync(p).size / 1024).toFixed(0) + ' KB';
console.log(`  ${input} (${kb(input)}) -> ${output} (${kb(output)})`);
