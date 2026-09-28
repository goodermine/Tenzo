/* Greyline - asset build step (run by hand, not part of `npm run build`).
   Pulls CC0 scanned PBR sets from ambientCG, packs AO/roughness/metalness into
   one ORM texture, and encodes everything to KTX2 so it stays compressed in
   GPU memory. Raw downloads stay in the scratchpad; only the processed output
   lands in assets/. */
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const GAME = join(HERE, '..');
const OUT = join(GAME, 'assets', 'materials');
const CACHE = process.env.ASSET_CACHE || '/tmp/greyline-assets';

/* surface name -> ambientCG asset id. Names match the keys used by
   world.js / facility.js so the loader can swap them in directly. */
const MATERIALS = {
  concrete: 'Concrete034',
  asphalt: 'Asphalt033',
  brick: 'Bricks075A',
  plaster: 'PaintedPlaster017',
  metal: 'Metal032',
  sandbag: 'Fabric030',
  floor: 'Concrete036'
};

const RES = Number(process.env.RES || 2048);
/* Normal maps are a derivative signal: half the resolution costs far less
   perceptually than it does on albedo, and UASTC at 2K was 84% of a
   material's entire weight. */
const NORMAL_RES = Number(process.env.NORMAL_RES || RES / 2);
/* AO and roughness are low-frequency; full resolution buys nothing here. */
const ORM_RES = Number(process.env.ORM_RES || RES / 2);
const MAPS = {
  albedo: ['_Color'],
  normal: ['_NormalGL', '_Normal'],
  ao: ['_AmbientOcclusion', '_AO'],
  rough: ['_Roughness'],
  metal: ['_Metalness', '_Metallic']
};

function sh(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 28 });
}

async function download(id) {
  const zipDir = join(CACHE, id);
  if (existsSync(zipDir) && readdirSync(zipDir).length) return zipDir;
  mkdirSync(zipDir, { recursive: true });
  const url = `https://ambientcg.com/get?file=${id}_2K-PNG.zip`;
  const zipPath = join(CACHE, `${id}.zip`);
  console.log(`  downloading ${id}`);
  sh('curl', ['-sSL', '--max-time', '300', '-o', zipPath, url]);
  const mb = (statSync(zipPath).size / 1048576).toFixed(1);
  console.log(`  unzipping ${id} (${mb} MB)`);
  sh('python3', ['-c',
    `import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])`,
    zipPath, zipDir]);
  return zipDir;
}

function findMap(dir, suffixes) {
  const files = readdirSync(dir);
  for (const s of suffixes) {
    const hit = files.find(f => f.includes(s) && /\.(png|jpg)$/i.test(f));
    if (hit) return join(dir, hit);
  }
  return null;
}

async function grey(path, size) {
  if (!path) return null;
  return sharp(path).resize(size, size, { fit: 'fill' }).greyscale().raw().toBuffer();
}

/* AO -> R, roughness -> G, metalness -> B. One fetch and one sampler instead
   of three, and it halves the texture count per material. */
async function packORM(dir, size) {
  const px = size * size;
  const ao = (await grey(findMap(dir, MAPS.ao), size)) || Buffer.alloc(px, 255);
  const rough = (await grey(findMap(dir, MAPS.rough), size)) || Buffer.alloc(px, 200);
  const metal = (await grey(findMap(dir, MAPS.metal), size)) || Buffer.alloc(px, 0);
  const rgb = Buffer.alloc(px * 3);
  for (let i = 0; i < px; i++) {
    rgb[i * 3] = ao[i];
    rgb[i * 3 + 1] = rough[i];
    rgb[i * 3 + 2] = metal[i];
  }
  return sharp(rgb, { raw: { width: size, height: size, channels: 3 } });
}

/* The encoder takes encoded image bytes, and in Node it needs a decoder
   callback to turn them back into RGBA.

   Every option below is set explicitly, because the encoder's defaults are
   tuned for colour and silently ignore unknown keys. In particular
   `isSetKTX2SRGBTransferFunc` defaults to TRUE, which writes an sRGB transfer
   function into the DFD of whatever you hand it - so a normal map or a packed
   ORM comes back tagged sRGB and three applies an inverse-sRGB curve to data
   that was never colour. That turns a neutral normal (128,128,255) into
   (55,55,239) and crushes AO and roughness. */
async function toKTX2(pipeline, outPath, opts) {
  const png = await pipeline.clone().png({ compressionLevel: 3 }).toBuffer();
  const { encodeToKTX2 } = await import('ktx2-encoder');
  const ktx2 = await encodeToKTX2(new Uint8Array(png), {
    ...opts,
    needSupercompression: true,
    generateMipmap: true,
    isKTX2File: true,
    imageDecoder: async buffer => {
      const { data, info } = await sharp(Buffer.from(buffer))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      return { width: info.width, height: info.height, data: new Uint8Array(data) };
    }
  });
  writeFileSync(outPath, Buffer.from(ktx2));
  return statSync(outPath).size;
}

/* Colour is the only slot that is actually colour: ETC1S suits it and it wants
   the sRGB transfer function. Normals and ORM are data - they get UASTC (ETC1S
   subsamples chroma, which mangles three uncorrelated channels packed into
   RGB) and a linear transfer function. */
const ENCODE = {
  albedo: { isUASTC: false, isPerceptual: true, isSetKTX2SRGBTransferFunc: true, qualityLevel: 200 },
  normal: { isUASTC: true, isPerceptual: false, isSetKTX2SRGBTransferFunc: false, isNormalMap: true },
  orm:    { isUASTC: true, isPerceptual: false, isSetKTX2SRGBTransferFunc: false }
};

async function build() {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(CACHE, { recursive: true });
  const manifest = {};
  let total = 0;

  const only = process.argv[2];
  const entries = Object.entries(MATERIALS).filter(([n]) => !only || n === only);

  for (const [name, id] of entries) {
    console.log(`[${name}] ${id}`);
    const dir = await download(id);
    const outDir = join(OUT, name);
    mkdirSync(outDir, { recursive: true });

    const albedoSrc = findMap(dir, MAPS.albedo);
    const normalSrc = findMap(dir, MAPS.normal);
    if (!albedoSrc) throw new Error(`${id}: no colour map found`);

    const jobs = [
      ['albedo', sharp(albedoSrc).resize(RES, RES, { fit: 'fill' }), ENCODE.albedo],
      ['orm', await packORM(dir, ORM_RES), ENCODE.orm]
    ];
    if (normalSrc) {
      jobs.push(['normal',
        sharp(normalSrc).resize(NORMAL_RES, NORMAL_RES, { fit: 'fill' }),
        ENCODE.normal]);
    }

    const files = {};
    const web = {};
    for (const [slot, pipeline, opts] of jobs) {
      const out = join(outDir, `${slot}.ktx2`);
      const bytes = await toKTX2(pipeline, out, opts);
      files[slot] = `materials/${name}/${slot}.ktx2`;
      total += bytes;

      /* A WebP alongside each KTX2, for hosts that will not serve .ktx2 -
         the published artifact among them. It costs about four times the GPU
         memory because the driver expands it, which is exactly what KTX2
         exists to avoid, so it is the fallback and not the default. */
      const webOut = join(outDir, `${slot}.webp`);
      await pipeline.clone()
        .webp({ quality: opts.isPerceptual ? 88 : 94, effort: 4 })
        .toFile(webOut);
      web[slot] = `materials/${name}/${slot}.webp`;
      const webBytes = statSync(webOut).size;
      console.log(`    ${slot.padEnd(7)} ${(bytes / 1048576).toFixed(2)} MB ktx2` +
        `  ${(webBytes / 1048576).toFixed(2)} MB webp`);
    }
    manifest[name] = {
      source: id, credit: 'ambientCG (CC0)',
      res: RES, normalRes: NORMAL_RES, ormRes: ORM_RES, files, web
    };
  }

  const manifestPath = join(GAME, 'assets', 'materials.json');
  const existing = existsSync(manifestPath)
    ? JSON.parse(sh('cat', [manifestPath])) : {};
  const merged = { ...existing, ...manifest };
  writeFileSync(manifestPath, JSON.stringify(merged, null, 2));

  /* The same manifest with the WebP paths in the `files` slot, so the loader
     needs no flag: whichever manifest is served decides the encoding. */
  const webManifest = {};
  for (const [name, entry] of Object.entries(merged)) {
    if (!entry.web) continue;
    webManifest[name] = { ...entry, files: entry.web };
  }
  writeFileSync(join(GAME, 'assets', 'materials.web.json'),
    JSON.stringify(webManifest, null, 2));
  console.log(`\ntotal committed: ${(total / 1048576).toFixed(1)} MB`);
}

build().catch(e => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
