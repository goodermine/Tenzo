/* TILT LAB - verification in a real browser, on an emulated phone and a
 * desktop.
 *
 *   npm run build && NODE_PATH=$(npm root -g) node tools/verify.cjs [outputDir]
 *
 * Drives the game the way a player would - keys, a touch drag, the touch
 * arrows, the phone's motion sensor - and plays every level's recorded
 * solution through the real game loop, so the levels are proven inside the
 * browser as well as in tools/solve.ts. Screenshots each stage.
 *
 * CommonJS so NODE_PATH can find a globally installed Playwright.
 */
const { spawn } = require('node:child_process');
const { existsSync, mkdirSync } = require('node:fs');
const { join, resolve } = require('node:path');

const GAME = process.env.TILTLAB_DIR || resolve(__dirname, '..');
const OUT = process.argv[2] || join(resolve(__dirname, '..'), '.verify');
const PORT = 8500 + (process.pid % 300);

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

async function boot(page) {
  await page.goto(`http://127.0.0.1:${PORT}/index.html`);
  for (let i = 0; i < 60; i++) {
    if (await page.evaluate(() => window.__ready === true)) return true;
    await wait(500);
  }
  return false;
}

/** Play the current level's recorded solution through the game's input. */
async function playSolution(page, limit = 25000) {
  await page.evaluate(() => {
    const G = window.__game;
    G.input.read = () => G.Lab.inputAt(G.game.lab.level.solution, G.game.lab.time);
  });
  const t0 = Date.now();
  while (Date.now() - t0 < limit) {
    const s = await page.evaluate(() => ({ mode: window.__game.game.mode, state: window.__game.game.lab.state }));
    if (s.mode === 'clear') return true;
    await wait(200);
  }
  return false;
}

(async () => {
  if (!existsSync(join(GAME, 'dist/tilt-lab.js'))) {
    console.error('dist/tilt-lab.js missing - run `npm run build` first.');
    process.exit(2);
  }
  mkdirSync(OUT, { recursive: true });
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'],
    { cwd: GAME, stdio: 'ignore' });
  await wait(1500);
  /* a plain software canvas: fast and close to a phone's GPU canvas */
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const errors = [];
  const foreign = new Set();
  const watch = page => {
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
    page.on('request', r => {
      const u = new URL(r.url());
      if (/^https?:$/.test(u.protocol) && u.host !== `127.0.0.1:${PORT}`) foreign.add(u.host);
    });
  };
  const G = (page, fn, arg) => page.evaluate(fn, arg);

  try {
    /* ================================================== desktop */
    const desk = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const d = await desk.newPage();
    watch(d);
    check('boots', await boot(d));
    await wait(1200);
    await d.screenshot({ path: join(OUT, 'title-desktop.png') });
    const title = await G(d, () => ({
      on: document.getElementById('title').classList.contains('on'),
      demo: window.__game.game.demo
    }));
    check('the title shows over a demo lab', title.on && title.demo, JSON.stringify(title));

    await d.click('#title .play');
    await wait(500);
    const intro = await G(d, () => ({ mode: window.__game.game.mode,
      title: document.querySelector('#worldintro .wtitle').textContent }));
    await d.screenshot({ path: join(OUT, 'world-intro.png') });
    await d.click('#worldintro .go');
    await wait(500);
    const started = await G(d, () => ({ mode: window.__game.game.mode, id: window.__game.game.lab.level.id,
      hud: document.getElementById('hud').classList.contains('on'), seen: window.__game.save.worlds }));
    check('PLAY meets World 1 with its intro card, then starts level 1-1',
      intro.mode === 'intro' && intro.title === 'TILT' && started.mode === 'play' && started.id === 'w1-roll' && started.hud &&
      started.seen.includes(0), JSON.stringify([intro, started]));

    await d.keyboard.down('d');
    await wait(700);
    const keyed = await G(d, () => window.__game.game.lab.angle);
    await d.screenshot({ path: join(OUT, 'tilt-key.png') });
    await d.keyboard.up('d');
    await wait(800);
    const settled = await G(d, () => window.__game.game.lab.angle);
    check('holding D tilts the lab right, and letting go levels it', keyed > 0.35 && Math.abs(settled) < 0.03,
      `${(keyed * 180 / Math.PI).toFixed(1)}° then ${(settled * 180 / Math.PI).toFixed(1)}°`);

    await d.keyboard.down('ArrowLeft');
    await wait(500);
    const left = await G(d, () => window.__game.game.lab.angle);
    await d.keyboard.up('ArrowLeft');
    check('the left arrow tilts left', left < -0.3, `${(left * 180 / Math.PI).toFixed(1)}°`);

    /* R restarts at once */
    await wait(600);
    const before = await G(d, () => window.__game.game.lab.time);
    const tR = Date.now();
    await d.keyboard.press('r');
    const after = await G(d, () => ({ t: window.__game.game.lab.time, x: window.__game.game.lab.balls[0].x }));
    const ms = Date.now() - tR;
    check('R restarts the level instantly', before > 1 && after.t < 0.15 && Math.abs(after.x - 150) < 2 && ms < 300,
      `lab time ${before.toFixed(1)}s -> ${after.t.toFixed(2)}s in ${ms} ms`);

    /* Esc pauses */
    await d.keyboard.press('Escape');
    await wait(300);
    const paused = await G(d, () => window.__game.game.mode);
    await d.screenshot({ path: join(OUT, 'pause.png') });
    await d.keyboard.press('Escape');
    await wait(300);
    const resumed = await G(d, () => window.__game.game.mode);
    check('Esc pauses and resumes', paused === 'paused' && resumed === 'play', `${paused} -> ${resumed}`);

    /* Every level's recorded solution, played through the real game loop */
    const results = [];
    const nLevels = await G(d, () => window.__game.LEVELS.length);
    for (let i = 0; i < nLevels; i++) {
      await G(d, i => window.__game.startLevel(i, false), i);
      await wait(100);
      const won = await playSolution(d);
      const name = await G(d, () => window.__game.game.lab.level.name);
      results.push(`${i + 1} ${name}: ${won ? 'cleared' : 'NOT CLEARED'}`);
      await d.screenshot({ path: join(OUT, `level-${i + 1}-clear.png`) });
      if (!won) break;
    }
    /* the last lab cleared: the card celebrates the whole lab */
    await wait(1600);
    const finalCard = await G(d, () => ({ mode: window.__game.game.mode, title: document.querySelector('#clear h2').textContent }));
    check('clearing the last lab shows LAB COMPLETE', finalCard.title.includes('LAB COMPLETE'), JSON.stringify(finalCard));
    check('every level is cleared by its solution in the browser', results.length === nLevels && results.every(r => r.includes('cleared') && !r.includes('NOT')),
      results.join(', '));

    /* the clear card's NEXT */
    await G(d, () => { window.__game.input.read = () => 0; window.__game.startLevel(0, false); });
    await playSolution(d);
    await G(d, () => { window.__game.input.read = () => 0; });
    await wait(500);
    await d.screenshot({ path: join(OUT, 'clear-card.png') });
    const card = await G(d, () => ({ time: document.querySelector('#clear .time').textContent, star: document.querySelector('#clear .time').classList.contains('star'),
      best: JSON.parse(localStorage.getItem('tiltlab.save')).best[window.__game.LEVELS[0].id], par: window.__game.LEVELS[0].par }));
    check('beating par shows the time, par and a star, and saves the best time',
      card.star && /^\d+\.\d s · par \d+\.\d s ★$/.test(card.time) && card.best <= card.par, JSON.stringify(card));
    await d.click('#clear .next');
    await wait(400);
    const nxt = await G(d, () => ({ mode: window.__game.game.mode, i: window.__game.game.index }));
    check('NEXT on the clear card loads the next level', nxt.mode === 'play' && nxt.i === 1, JSON.stringify(nxt));

    /* A ball lost in a pit restarts the level by itself */
    const lost = await G(d, async () => {
      const W = window.__game;
      W.LEVELS.push({ id: 'test-pit', name: 'PIT TEST', balls: [{ colour: 'yellow', x: 500, y: 300 }],
        targets: [{ colour: 'yellow', x: 890, y: 914 }], rails: [], hazards: [{ x: 300, y: 860, w: 400, h: 140 }], solution: [[0, 0]] });
      W.startLevel(W.LEVELS.length - 1, false);
      const first = W.game.lab;
      let sawLost = false;
      for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 50));
        if (W.game.lab === first && first.state === 'lost') sawLost = true;
        if (W.game.lab !== first) break;
      }
      const restarted = W.game.lab !== first && W.game.lab.balls.every(b => !b.lost);
      W.LEVELS.pop();
      return { sawLost, restarted };
    });
    check('a ball lost in a pit restarts the level by itself', lost.sawLost && lost.restarted, JSON.stringify(lost));

    /* progress survives a reload */
    await d.reload();
    await boot(d);
    await wait(800);
    const titleStars = await G(d, () => [document.querySelector('#title .stars').textContent, window.__game.LEVELS.length]);
    check('the title counts stars out of every lab', titleStars[0] === `★ ${titleStars[1]} / ${titleStars[1]}`, titleStars[0]);
    await d.click('#title .levels-open');
    await wait(400);
    const tiles = await G(d, () => [...document.querySelectorAll('#levels .tile')].map(t => t.className));
    await d.screenshot({ path: join(OUT, 'levels.png') });
    check('progress survives a reload: cleared levels ticked, all open',
      tiles.length === 6 && tiles.every(c => c.includes('done')) && !tiles.some(c => c.includes('locked')), tiles.join(' | '));
    const wname = await G(d, () => document.querySelector('#levels .world-name').textContent);
    check('stars survive a reload: on the tiles and the world name', tiles.every(c => c.includes('star')) && wname.includes('★ 6/6'), wname);
    /* paging between worlds */
    const pages = await G(d, async () => {
      const name = () => document.querySelector('#levels .world-name').textContent;
      const out = [name()];
      const first = document.querySelector('#levels .wprev').disabled ? '.wnext' : '.wprev';
      const back = first === '.wnext' ? '.wprev' : '.wnext';
      document.querySelector('#levels ' + first).click();
      await new Promise(r => setTimeout(r, 200));
      out.push(name());
      document.querySelector('#levels ' + back).click();
      await new Promise(r => setTimeout(r, 200));
      out.push(name());
      return { out, worlds: window.__game.WORLDS.length };
    });
    check('level select pages between worlds', pages.out[0] !== pages.out[1] && pages.out[2] === pages.out[0], JSON.stringify(pages));
    await desk.close();

    /* ================================================== phone */
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const p = await phone.newPage();
    watch(p);
    await boot(p);
    await wait(1200);
    await p.screenshot({ path: join(OUT, 'title-phone.png') });
    await p.tap('#title .play');
    await wait(600);
    if (await G(p, () => window.__game.game.mode === 'intro')) { await p.tap('#worldintro .go'); await wait(400); }
    const cdp = await phone.newCDPSession(p);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', {
      type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }]
    });
    await touch('touchStart', 150, 450);
    for (let k = 1; k <= 8; k++) {
      await touch('touchMove', 150 + k * 18, 450);
      await wait(30);
    }
    await wait(500);
    const dragged = await G(p, () => window.__game.game.lab.angle);
    await p.screenshot({ path: join(OUT, 'tilt-drag-phone.png') });
    await touch('touchEnd', 0, 0);
    await wait(800);
    const released = await G(p, () => window.__game.game.lab.angle);
    check('a touch drag tilts the lab, and letting go levels it', dragged > 0.3 && Math.abs(released) < 0.03,
      `${(dragged * 180 / Math.PI).toFixed(1)}° then ${(released * 180 / Math.PI).toFixed(1)}°`);

    const pad = await p.$('#pads .tilt-l');
    const box = await pad.boundingBox();
    await touch('touchStart', box.x + box.width / 2, box.y + box.height / 2);
    await wait(600);
    const padAngle = await G(p, () => window.__game.game.lab.angle);
    await touch('touchEnd', 0, 0);
    check('holding the left arrow button tilts left', padAngle < -0.3, `${(padAngle * 180 / Math.PI).toFixed(1)}°`);

    /* Phone tilt: the motion sensor, with the phone held at a slant */
    const motion = await G(p, async () => {
      const W = window.__game;
      const send = (beta, gamma) => window.dispatchEvent(Object.assign(new Event('deviceorientation'), { alpha: 0, beta, gamma }));
      const ok = await W.input.enableMotion();
      send(40, 0);                 /* how the player holds it: becomes level */
      await new Promise(r => setTimeout(r, 300));
      const level = W.game.lab.angle;
      for (let i = 0; i < 15; i++) { send(40, 20); await new Promise(r => setTimeout(r, 40)); }
      const tilted = W.game.lab.angle;
      const steering = W.input.motionSteering;
      W.input.disableMotion();
      return { ok, level, tilted, steering };
    });
    check('tilting the phone tilts the lab (and the chamber stays put on screen)',
      motion.ok && Math.abs(motion.level) < 0.05 && motion.tilted > 0.15 && motion.steering, JSON.stringify(motion));

    check('no runtime errors', errors.length === 0, errors.slice(0, 3).join(' | '));
    check('no third-party requests', foreign.size === 0, [...foreign].join(', ') || 'none');
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
