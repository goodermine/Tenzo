/* TILT LAB - home-screen icons, drawn as SVG and rasterised with sharp:
   a tilted white chamber with a blue rail, a yellow ball and its cup. */
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const svg = (pad = 0) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0" stop-color="#fff35c"/><stop offset="0.5" stop-color="#ffc93c"/><stop offset="1" stop-color="#ff8f3c"/>
    </linearGradient>
    <radialGradient id="ball" cx="0.36" cy="0.3" r="0.75">
      <stop offset="0" stop-color="#fff27a"/><stop offset="0.55" stop-color="#ffd21f"/><stop offset="1" stop-color="#f08c00"/>
    </radialGradient>
    <linearGradient id="rail" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#7cc4ff"/><stop offset="0.45" stop-color="#4a6cff"/><stop offset="1" stop-color="#3a2fd6"/>
    </linearGradient>
    <linearGradient id="cup" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff27a"/><stop offset="0.5" stop-color="#ffc21f"/><stop offset="1" stop-color="#e07a00"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <g transform="translate(256 262) scale(${(1 - pad).toFixed(3)}) rotate(10) translate(-256 -256)">
    <rect x="70" y="70" width="372" height="372" rx="70" fill="#7a2fb0" opacity="0.18" transform="translate(0 16)"/>
    <rect x="70" y="70" width="372" height="372" rx="70" fill="#ffffff"/>
    <rect x="96" y="96" width="320" height="320" rx="50" fill="#f6f0ff"/>
    <path d="M128 250 L356 300" stroke="url(#rail)" stroke-width="30" stroke-linecap="round"/>
    <path d="M140 244 L344 290" stroke="#fff" stroke-opacity="0.55" stroke-width="9" stroke-linecap="round"/>
    <path d="M236 330 Q236 392 300 392 Q364 392 364 330" fill="none" stroke="url(#cup)" stroke-width="20" stroke-linecap="round"/>
    <circle cx="300" cy="352" r="30" fill="#ffd21f" opacity="0.35"/>
    <circle cx="200" cy="210" r="46" fill="url(#ball)"/>
    <ellipse cx="184" cy="192" rx="16" ry="10" fill="#fff" opacity="0.8" transform="rotate(-35 184 192)"/>
  </g>
</svg>`;

mkdirSync('icons', { recursive: true });
const out = [['icon-192.png', 192, 0], ['icon-512.png', 512, 0], ['icon-maskable-512.png', 512, 0.16], ['apple-touch-icon.png', 180, 0]];
for (const [name, size, pad] of out) {
  await sharp(Buffer.from(svg(pad))).resize(size, size).png().toFile('icons/' + name);
  console.log('icons/' + name);
}
