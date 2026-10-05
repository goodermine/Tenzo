/* HOLDOUT - headless verification on an emulated phone.
 *
 *   NODE_PATH=$(npm root -g) node tools/verify.cjs [outputDir]
 *
 * Boots the game at 390x844 with touch input and drives it the way a player
 * would: taps to start, steers with a real touch drag, levels up and picks a
 * card, pauses, fills the screen with enemies, dies and redeploys. Writes a
 * screenshot at each stage.
 *
 * The only browser here renders in software, so this checks correctness and
 * says nothing about frame rate: that has to be measured on a real phone
 * (the game's FPS overlay exists for that).
 *
 * CommonJS so NODE_PATH can find a globally installed Playwright.
 */
const { spawn } = require('node:child_process');
const { existsSync, mkdirSync, openSync } = require('node:fs');
const { join, resolve } = require('node:path');

const GAME = process.env.HOLDOUT_DIR || resolve(__dirname, '..');
const OUT = process.argv[2] || join(GAME, '.verify');
const PORT = 8700 + (process.pid % 300);

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  console.error('playwright not found: NODE_PATH=$(npm root -g) node tools/verify.cjs');
  process.exit(2);
}

const failures = [];
function check(name, ok, detail) {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failures.push(name);
}

const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  if (!existsSync(join(GAME, 'dist/holdout.js'))) {
    console.error('dist/holdout.js missing - run `npm run build` first.');
    process.exit(2);
  }
  mkdirSync(OUT, { recursive: true });
  const logFd = openSync(join(OUT, 'access.log'), 'w');
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'],
    { cwd: GAME, stdio: ['ignore', logFd, logFd] });
  await wait(1500);

  const browser = await chromium.launch({
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader']
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true
  });
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error' && !m.text().includes('favicon')) errors.push('console: ' + m.text().slice(0, 300));
  });
  const cdp = await context.newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }]
  });
  const shot = name => page.screenshot({ path: join(OUT, name) });
  const sim = fn => page.evaluate(fn);

  try {
    await page.goto(`http://127.0.0.1:${PORT}/index.html`);
    let ready = false;
    for (let i = 0; i < 60 && !ready; i++) {
      ready = await page.evaluate(() => window.__ready === true);
      if (!ready) await wait(1000);
    }
    check('boots', ready);
    if (!ready) throw new Error('boot did not complete');
    await wait(2500);
    await shot('title.png');

    await page.tap('#title .start');
    await wait(800);
    const started = await sim(() => ({
      state: window.__game.state,
      hud: document.getElementById('hud').classList.contains('on')
    }));
    check('tap starts a run', started.state === 'run' && started.hud, JSON.stringify(started));

    /* Steer right with a real touch drag. */
    const x0 = await sim(() => window.__game.sim.p.x);
    await touch('touchStart', 200, 600);
    for (let k = 1; k <= 6; k++) {
      await touch('touchMove', 200 + k * 12, 600);
      await wait(30);
    }
    await wait(1800);
    const mid = await sim(() => ({
      x: window.__game.sim.p.x,
      stick: document.getElementById('stick-base').classList.contains('on')
    }));
    await touch('touchEnd', 0, 0);
    check('touch drag moves the ship', mid.x - x0 > 40, `moved ${Math.round(mid.x - x0)} units`);
    check('thumb-stick appears under the thumb', mid.stick);
    await shot('run.png');

    /* Level up and pick a card. */
    await sim(() => { const p = window.__game.sim.p; p.xp = p.xpNext; });
    await wait(1200);
    const lv = await sim(() => ({
      shown: document.getElementById('levelup').classList.contains('on'),
      cards: document.querySelectorAll('#levelup .card').length,
      paused: !window.__game.sim.running
    }));
    check('level-up offers three cards and pauses', lv.shown && lv.cards === 3 && lv.paused, JSON.stringify(lv));
    await shot('levelup.png');
    const before = await sim(() => JSON.stringify([
      window.__game.sim.weapons.map(w => w.level), window.__game.sim.passives.map(p => p.level)
    ]));
    await page.tap('#levelup .card');
    await wait(600);
    const after = await sim(() => ({
      build: JSON.stringify([window.__game.sim.weapons.map(w => w.level), window.__game.sim.passives.map(p => p.level)]),
      hidden: !document.getElementById('levelup').classList.contains('on'),
      running: window.__game.sim.running
    }));
    check('picking a card applies it and resumes', after.build !== before && after.hidden && after.running,
      `${before} -> ${after.build}`);

    /* Pause and resume. */
    await page.tap('#hud .pause');
    await wait(400);
    const paused = await sim(() => !window.__game.sim.running &&
      document.getElementById('paused').classList.contains('on'));
    await page.tap('#paused .resume');
    await wait(400);
    const resumed = await sim(() => window.__game.sim.running);
    check('pause and resume', paused && resumed);

    /* Fill the screen: the busy-wave shot, and a check the pools hold. */
    const crowd = await sim(() => {
      const s = window.__game.sim, p = s.p;
      s.invulnerable = true;
      p.xpNext = 1e9;   /* no level-up card over the photo */
      for (const w of ['orbit', 'nova']) s.addWeapon(w);
      for (let i = 0; i < 520; i++) {
        const a = Math.random() * Math.PI * 2, d = 120 + Math.random() * 380;
        s.spawnEnemy(i % 4, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d);
      }
      return s.eCount;
    });
    await wait(3000);
    await shot('busy.png');
    const busy = await sim(() => ({ enemies: window.__game.sim.eCount, kills: window.__game.sim.p.kills }));
    check('hundreds of enemies on screen at once', crowd >= 500, `${crowd} spawned, ${busy.enemies} alive after 3s, ${busy.kills} kills`);

    /* Die, see the results, deploy again. */
    await sim(() => { window.__game.sim.invulnerable = false; window.__game.sim.hurtPlayer(9999, 0, 0); });
    await wait(2600);
    const over = await sim(() => ({
      state: window.__game.state,
      shown: document.getElementById('over').classList.contains('on'),
      stats: document.querySelectorAll('#over .stat').length
    }));
    check('death shows the results', over.state === 'over' && over.shown && over.stats === 4, JSON.stringify(over));
    await shot('over.png');
    await page.tap('#over .again');
    await wait(800);
    const again = await sim(() => window.__game.state === 'run' && window.__game.sim.time < 5 && window.__game.sim.p.hp > 0);
    check('deploy again starts a fresh run', again);

    check('no runtime errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (e) {
    check('run completed', false, e.message);
  } finally {
    await browser.close();
    server.kill('SIGKILL');
  }
  console.log('screenshots in ' + OUT);
  if (failures.length) {
    console.error(`\n${failures.length} check(s) failed: ${failures.join(', ')}`);
    process.exit(1);
  }
  console.log('\nall checks passed');
})();
