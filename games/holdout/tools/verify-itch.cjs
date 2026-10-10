/* HOLDOUT - the itch.io build, played the way itch shows it.
 *
 *   npm run package:itch && NODE_PATH=$(npm root -g) node tools/verify-itch.cjs [outputDir]
 *
 * itch.io embeds the game in an iframe from another origin. This loads the
 * unzipped release/holdout-itch in such an iframe twice: on an emulated
 * phone (touch), and on a desktop with no touch screen (keyboard and
 * mouse). tools/verify.cjs covers the game itself; run it against the itch
 * build too, with HOLDOUT_DIR=release/holdout-itch.
 */
const { spawn } = require('node:child_process');
const { existsSync, mkdirSync } = require('node:fs');
const { join, resolve } = require('node:path');

const GAME = resolve(__dirname, '..', 'release', 'holdout-itch');
const OUT = process.argv[2] || join(resolve(__dirname, '..'), '.verify', 'itch');
const PORT = 8400 + (process.pid % 300);

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  console.error('playwright not found: NODE_PATH=$(npm root -g) node tools/verify-itch.cjs');
  process.exit(2);
}

const failures = [];
function check(name, ok, detail) {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failures.push(name);
}
const wait = ms => new Promise(r => setTimeout(r, ms));

/* The host page: a different origin (about:blank) framing the game. */
const host = (w, h) => `<!doctype html><html><body style="margin:0;background:#222;display:grid;place-items:center;height:100vh">
<iframe id="game" src="http://127.0.0.1:${PORT}/index.html" allow="autoplay; fullscreen"
  style="border:0;width:${w};height:${h}"></iframe></body></html>`;

async function open(browser, ctxOpts, w, h, errors) {
  const context = await browser.newContext(ctxOpts);
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  await page.setContent(host(w, h));
  const frame = await (await page.$('#game')).contentFrame();
  let ready = false;
  for (let i = 0; i < 60 && !ready; i++) {
    ready = await frame.evaluate(() => window.__ready === true).catch(() => false);
    if (!ready) await wait(1000);
  }
  await wait(1500);
  return { context, page, frame, ready };
}

(async () => {
  if (!existsSync(join(GAME, 'index.html'))) {
    console.error('release/holdout-itch missing - run `npm run package:itch` first.');
    process.exit(2);
  }
  mkdirSync(OUT, { recursive: true });
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'],
    { cwd: GAME, stdio: 'ignore' });
  await wait(1500);
  const browser = await chromium.launch({
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader']
  });
  const errors = [];

  try {
    /* ---- phone: itch's "click to launch in fullscreen" fills the screen */
    const phone = await open(browser, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1,
      isMobile: true, hasTouch: true }, '100vw', '100vh', errors);
    const f = phone.frame;
    check('phone: boots inside a cross-origin iframe', phone.ready);
    const guide = await f.evaluate(() => ({
      on: document.getElementById('howto').classList.contains('on'),
      line: document.querySelector('#howto .page li').textContent
    }));
    check('phone: the guide opens and talks about dragging', guide.on && /^Drag anywhere/.test(guide.line), guide.line);
    await f.tap('#howto .skip');
    await wait(400);
    await f.tap('#title .start');
    await wait(800);
    const cdp = await phone.context.newCDPSession(phone.page);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', {
      type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }]
    });
    const x0 = await f.evaluate(() => window.__game.sim.p.x);
    await touch('touchStart', 200, 600);
    for (let k = 1; k <= 6; k++) {
      await touch('touchMove', 200 + k * 12, 600);
      await wait(30);
    }
    await wait(1500);
    await touch('touchEnd', 0, 0);
    const x1 = await f.evaluate(() => window.__game.sim.p.x);
    check('phone: touch steering works in the iframe', x1 - x0 > 40, `moved ${Math.round(x1 - x0)}`);
    const saved = await f.evaluate(() => {
      try { return !!JSON.parse(localStorage.getItem('holdout.save')).seen.guide; } catch (e) { return false; }
    });
    check('phone: progress saves inside the iframe', saved);
    await phone.page.screenshot({ path: join(OUT, 'itch-phone.png') });
    await phone.context.close();

    /* ---- desktop: itch's default embed, played with the keyboard */
    const desk = await open(browser, { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 },
      '480px', '854px', errors);
    const d = desk.frame;
    check('desktop: boots in the 480x854 embed', desk.ready);
    const line = await d.evaluate(() => document.querySelector('#howto .page li').textContent);
    check('desktop: the guide gives keyboard controls', /WASD/.test(line), line);
    await desk.page.screenshot({ path: join(OUT, 'itch-desktop-guide.png') });
    await d.click('#howto .skip');
    await wait(400);
    await d.click('#title .start');
    await wait(800);
    const tip = await d.evaluate(() => document.querySelector('#tip .text').textContent);
    check('desktop: the move tip names the keys', tip === 'WASD OR ARROWS TO MOVE', tip);
    const y0 = await d.evaluate(() => window.__game.sim.p.y);
    await desk.page.keyboard.down('s');
    await wait(1200);
    await desk.page.keyboard.up('s');
    const y1 = await d.evaluate(() => window.__game.sim.p.y);
    check('desktop: S steers the ship', y1 - y0 > 40, `moved ${Math.round(y1 - y0)}`);
    await desk.page.keyboard.press('Escape');
    await wait(400);
    const paused = await d.evaluate(() => document.getElementById('paused').classList.contains('on'));
    await desk.page.keyboard.press('Escape');
    await wait(400);
    const resumed = await d.evaluate(() => window.__game.sim.running);
    check('desktop: Esc pauses and resumes', paused && resumed, JSON.stringify({ paused, resumed }));
    await d.evaluate(() => { const s = window.__game.sim; s.invulnerable = true; s.p.xp = s.p.xpNext; });
    await wait(2000);
    const before = await d.evaluate(() => window.__game.sim.passives.length + window.__game.sim.weapons.reduce((n, w) => n + w.level, 0));
    await desk.page.keyboard.press('2');
    await wait(600);
    const after = await d.evaluate(() => ({
      n: window.__game.sim.passives.length + window.__game.sim.weapons.reduce((n, w) => n + w.level, 0),
      open: document.getElementById('levelup').classList.contains('on')
    }));
    check('desktop: number keys pick a level-up card', after.n > before && !after.open, JSON.stringify({ before, after }));
    await desk.page.screenshot({ path: join(OUT, 'itch-desktop.png') });
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
