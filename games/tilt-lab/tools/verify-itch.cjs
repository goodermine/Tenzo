/* TILT LAB - the itch.io build, played the way itch shows it.
 *
 *   npm run package:itch && NODE_PATH=$(npm root -g) node tools/verify-itch.cjs [outputDir]
 *
 * itch.io embeds the game in an iframe from another origin. This loads the
 * unzipped release/tilt-lab-itch in such an iframe twice: on an emulated
 * phone (touch) and on a desktop in a 960x640 embed (keyboard). The game
 * itself is covered by tools/verify.cjs; run that against the itch build
 * too, with TILTLAB_DIR=release/tilt-lab-itch.
 */
const { spawn } = require('node:child_process');
const { existsSync, mkdirSync } = require('node:fs');
const { join, resolve } = require('node:path');

const GAME = resolve(__dirname, '..', 'release', 'tilt-lab-itch');
const OUT = process.argv[2] || join(resolve(__dirname, '..'), '.verify', 'itch');
const PORT = 8200 + (process.pid % 300);
const { chromium } = require('playwright');

const failures = [];
function check(name, ok, detail) {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failures.push(name);
}
const wait = ms => new Promise(r => setTimeout(r, ms));
const host = (w, h) => `<!doctype html><html><body style="margin:0;background:#222;display:grid;place-items:center;height:100vh">
<iframe id="game" src="http://127.0.0.1:${PORT}/index.html" allow="autoplay; fullscreen; accelerometer; gyroscope"
  style="border:0;width:${w};height:${h}"></iframe></body></html>`;

async function open(browser, opts, w, h, errors) {
  const context = await browser.newContext(opts);
  const page = await context.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  await page.setContent(host(w, h));
  const frame = await (await page.$('#game')).contentFrame();
  let ready = false;
  for (let i = 0; i < 60 && !ready; i++) {
    ready = await frame.evaluate(() => window.__ready === true).catch(() => false);
    if (!ready) await wait(500);
  }
  await wait(1000);
  return { context, page, frame, ready };
}

(async () => {
  if (!existsSync(join(GAME, 'index.html'))) {
    console.error('release/tilt-lab-itch missing - run `npm run package:itch` first.');
    process.exit(2);
  }
  mkdirSync(OUT, { recursive: true });
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: GAME, stdio: 'ignore' });
  await wait(1500);
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const errors = [];
  try {
    const phone = await open(browser, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
      '100vw', '100vh', errors);
    const f = phone.frame;
    check('phone: boots inside a cross-origin iframe', phone.ready);
    await f.tap('#title .play');
    await wait(500);
    const cdp = await phone.context.newCDPSession(phone.page);
    const pad = await f.$('#pads .tilt-r');
    const box = await pad.boundingBox();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 }] });
    await wait(600);
    const a = await f.evaluate(() => window.__game.game.lab.angle);
    await phone.page.screenshot({ path: join(OUT, 'itch-phone.png') });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    check('phone: the arrow buttons tilt the lab in the iframe', a > 0.3, `${(a * 180 / Math.PI).toFixed(1)}°`);
    const saved = await f.evaluate(() => { try { return JSON.parse(localStorage.getItem('tiltlab.save')).last === 'w1-roll'; } catch (e) { return false; } });
    check('phone: progress saves inside the iframe', saved);
    await phone.context.close();

    const desk = await open(browser, { viewport: { width: 1280, height: 900 } }, '960px', '640px', errors);
    const d = desk.frame;
    check('desktop: boots in a 960x640 embed', desk.ready);
    await d.click('#title .play');
    await wait(500);
    await desk.page.keyboard.down('d');
    await wait(600);
    const k = await d.evaluate(() => window.__game.game.lab.angle);
    await desk.page.screenshot({ path: join(OUT, 'itch-desktop.png') });
    await desk.page.keyboard.up('d');
    check('desktop: D tilts the lab', k > 0.3, `${(k * 180 / Math.PI).toFixed(1)}°`);
    await wait(500);
    await desk.page.keyboard.press('r');
    await wait(100);
    const t = await d.evaluate(() => window.__game.game.lab.time);
    check('desktop: R restarts', t < 0.3, `lab time ${t.toFixed(2)}s`);
    await desk.page.keyboard.press('Escape');
    await wait(300);
    const m = await d.evaluate(() => window.__game.game.mode);
    check('desktop: Esc pauses', m === 'paused', m);
    await desk.context.close();
    check('no runtime errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (e) {
    check('run completed', false, e.message);
  } finally {
    await browser.close();
    server.kill();
  }
  console.log(`screenshots in ${OUT}`);
  if (failures.length) {
    console.error(`\n${failures.length} check(s) failed: ${failures.join(', ')}`);
    process.exit(1);
  }
  console.log('\nall checks passed');
})();
