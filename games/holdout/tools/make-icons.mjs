/* HOLDOUT - home-screen icons, drawn as SVG and rasterised with sharp.
 *
 *   node tools/make-icons.mjs
 *
 * The ship on a dark field with a neon glow. The maskable variant keeps the
 * ship inside the central safe zone, since Android crops maskable icons to
 * whatever shape the launcher uses.
 */
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');
mkdirSync(OUT, { recursive: true });

function svg(size, shipScale) {
  const c = size / 2, r = size * 0.32 * shipScale;
  const p = (x, y) => `${c + x * r},${c + y * r}`;
  const ship = `M ${p(0, -1)} L ${p(0.72, 0.75)} L ${p(0, 0.4)} L ${p(-0.72, 0.75)} Z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="45%" r="70%">
      <stop offset="0" stop-color="#12203a"/>
      <stop offset="1" stop-color="#05070d"/>
    </radialGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="${size * 0.03}" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#bg)"/>
  <circle cx="${c}" cy="${c}" r="${r * 1.45}" fill="none" stroke="#ff3b6b" stroke-opacity="0.55"
    stroke-width="${size * 0.012}" filter="url(#glow)"/>
  <path d="${ship}" fill="#7ff6ff" fill-opacity="0.22" stroke="#7ff6ff" stroke-width="${size * 0.035}"
    stroke-linejoin="round" filter="url(#glow)"/>
  <path d="${ship}" fill="none" stroke="#ffffff" stroke-width="${size * 0.014}" stroke-linejoin="round"/>
</svg>`;
}

const jobs = [
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  ['icon-maskable-512.png', 512, 0.72],
  ['apple-touch-icon.png', 180, 0.95]
];
for (const [name, size, scale] of jobs) {
  await sharp(Buffer.from(svg(size, scale))).png().toFile(join(OUT, name));
  console.log('  ' + name);
}
