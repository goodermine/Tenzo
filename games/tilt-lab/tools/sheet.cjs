/* TILT LAB - a contact sheet of every level in a world, at rest, as the
 * player first sees it. For checking readability and spacing at a glance.
 *
 *   npm run build && NODE_PATH=$(npm root -g) node tools/sheet.cjs <world> [out.png]
 */
const { spawn } = require('node:child_process');
const { resolve, join } = require('node:path');
const { chromium } = require('playwright');
const sharp = require(resolve(__dirname, '..', 'node_modules', 'sharp'));
const wait = ms => new Promise(r => setTimeout(r, ms));
const world = +(process.argv[2] || 1);
const out = process.argv[3] || join(resolve(__dirname, '..'), '.verify', `world-${world}.png`);
const PORT = 8300 + (process.pid % 300);

(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: resolve(__dirname, '..'), stdio: 'ignore' });
  await wait(1200);
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const p = await (await b.newContext({ viewport: { width: 560, height: 600 } })).newPage();
  p.on('pageerror', e => console.error(e.message));
  await p.goto(`http://127.0.0.1:${PORT}/index.html`);
  for (let i = 0; i < 40; i++) { if (await p.evaluate(() => window.__ready)) break; await wait(300); }
  const ids = await p.evaluate(w => {
    const G = window.__game;
    let k = 0;
    for (let i = 0; i < w - 1; i++) k += G.WORLDS[i].levels.length;
    return G.WORLDS[w - 1].levels.map((_, n) => k + n);
  }, world);
  const tiles = [];
  for (const i of ids) {
    await p.evaluate(i => window.__game.startLevel(i, false), i);
    await wait(500);
    tiles.push(await p.screenshot());
  }
  await b.close();
  srv.kill();
  const W = 560, H = 600, cols = 3, rows = Math.ceil(tiles.length / cols);
  await sharp({ create: { width: cols * W + (cols - 1) * 6, height: rows * H + (rows - 1) * 6, channels: 3, background: '#333' } })
    .composite(tiles.map((t, k) => ({ input: t, left: (k % cols) * (W + 6), top: Math.floor(k / cols) * (H + 6) })))
    .png().toFile(out);
  console.log(out);
})();
