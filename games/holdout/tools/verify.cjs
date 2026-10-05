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
    hasTouch: true,
    /* this sandbox reaches the web through a proxy whose certificate the
       test browser does not know; without this the web fonts never load */
    ignoreHTTPSErrors: true
  });
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => {
    /* the web fonts are optional - the game falls back to system fonts -
       so a failure to fetch them is not the game's error */
    const url = (m.location() && m.location().url) || '';
    if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return;
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

    /* A first launch opens the How to Play guide. Swipe to page two, step
       through the rest with NEXT, and close it with GOT IT. */
    const guide = await sim(() => ({
      on: document.getElementById('howto').classList.contains('on'),
      pages: document.querySelectorAll('#howto .page').length,
      pics: document.querySelectorAll('#howto .page canvas.pic').length
    }));
    check('first launch opens the How to Play guide', guide.on && guide.pages === 4 && guide.pics === 4,
      JSON.stringify(guide));
    await shot('howto-1.png');
    await touch('touchStart', 300, 420);
    for (let k = 1; k <= 10; k++) {
      await touch('touchMove', 300 - k * 25, 420);
      await wait(16);
    }
    await touch('touchEnd', 0, 0);
    await wait(900);
    const swiped = await sim(() => window.__game.howto.page);
    check('swiping turns the guide page', swiped === 1, `page ${swiped + 1}`);
    await shot('howto-2.png');
    for (let k = 3; k <= 4; k++) {
      await page.tap('#howto .next');
      await wait(900);
      await shot(`howto-${k}.png`);
    }
    const lastPage = await sim(() => ({ page: window.__game.howto.page,
      label: document.querySelector('#howto .next').textContent }));
    await page.tap('#howto .next');
    await wait(500);
    const closed = await sim(() => ({
      off: !document.getElementById('howto').classList.contains('on'),
      seen: JSON.parse(localStorage.getItem('holdout.save') || '{}').seen
    }));
    check('GOT IT on the last page closes the guide and remembers it',
      lastPage.page === 3 && lastPage.label === 'GOT IT' && closed.off && closed.seen && closed.seen.guide,
      JSON.stringify([lastPage, closed]));
    await shot('title.png');

    await page.tap('#title .start');
    await wait(800);
    const started = await sim(() => ({
      state: window.__game.state,
      hud: document.getElementById('hud').classList.contains('on')
    }));
    check('tap starts a run', started.state === 'run' && started.hud, JSON.stringify(started));
    await wait(400);
    const moveTip = await sim(() => ({ cls: document.getElementById('tip').className,
      text: document.querySelector('#tip .text').textContent }));
    check('the first run shows the move tip', /\bmove\b/.test(moveTip.cls) && /on/.test(moveTip.cls) &&
      moveTip.text === 'DRAG ANYWHERE TO MOVE', JSON.stringify(moveTip));
    await shot('tip-move.png');

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
    const tipGone = await sim(() => ({ cls: document.getElementById('tip').className,
      seen: window.__game.save.seen.move }));
    check('the move tip clears once you move', !/\bmove\b/.test(tipGone.cls) && tipGone.seen, JSON.stringify(tipGone));
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
    const pickTip = await sim(() => getComputedStyle(document.querySelector('#levelup .pick-tip')).display);
    check('the first level-up says PICK ONE', pickTip === 'block', pickTip);
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

    /* The guide opens from the pause menu, and the run stays paused. */
    await page.tap('#hud .pause');
    await wait(400);
    await page.tap('#paused .howto-open');
    await wait(500);
    const fromPause = await sim(() => ({ guide: document.getElementById('howto').classList.contains('on'),
      running: window.__game.sim.running }));
    await page.tap('#howto .skip');
    await wait(400);
    const backToPause = await sim(() => ({ guide: document.getElementById('howto').classList.contains('on'),
      paused: document.getElementById('paused').classList.contains('on'), running: window.__game.sim.running }));
    check('HOW TO PLAY opens from the pause menu and keeps the run paused',
      fromPause.guide && !fromPause.running && !backToPause.guide && backToPause.paused && !backToPause.running,
      JSON.stringify([fromPause, backToPause]));
    await page.tap('#paused .resume');
    await wait(400);

    /* Arc Bolt fires ahead of the ship as well as behind it. Run the
       simulation directly with the ship facing right, recording the
       direction of every bolt fired. */
    const fire = await sim(() => {
      const s = window.__game.sim, p = s.p, w = s.weapons.find(x => x.def.id === 'bolt');
      const trial = offsets => {
        for (let i = 0; i < s.ePool.high; i++) if (s.eAlive[i]) s.removeEnemy(i);
        for (const dx of offsets) s.spawnEnemy(0, p.x + dx, p.y);
        /* no new arrivals mid-trial: only the enemies placed here count */
        const spawnEnemy = s.spawnEnemy;
        s.spawnEnemy = () => -1;
        const vx = [], spawn = s.spawnShot;
        s.spawnShot = function (kind, beh, x, y, svx, ...rest) {
          if (rest[5] === w.slot) vx.push(svx);
          return spawn.call(this, kind, beh, x, y, svx, ...rest);
        };
        const saved = { inv: s.invulnerable, next: p.xpNext };
        s.invulnerable = true;
        p.xpNext = 1e9;
        w.t = 0;
        w.burst = 0;
        for (let k = 0; k < 40; k++) {
          s.move.x = s.move.y = 0;
          p.face = 0;
          s.step(1 / 60);
        }
        s.spawnShot = spawn;
        s.spawnEnemy = spawnEnemy;
        s.invulnerable = saved.inv;
        p.xpNext = saved.next;
        return { ahead: vx.filter(v => v > 0).length, behind: vx.filter(v => v < 0).length };
      };
      return { aheadOnly: trial([260]), behindOnly: trial([-260]), both: trial([260, -260]) };
    });
    check('Arc Bolt fires ahead when enemies are only in front', fire.aheadOnly.ahead > 0 && fire.aheadOnly.behind === 0,
      JSON.stringify(fire.aheadOnly));
    check('Arc Bolt fires both ways at enemies ahead and behind',
      fire.both.ahead > 0 && fire.both.behind > 0 && fire.behindOnly.ahead > 0 && fire.behindOnly.behind > 0,
      JSON.stringify([fire.both, fire.behindOnly]));
    /* ...and in pictures: a pack ahead and a pack behind, ship facing right */
    await sim(() => {
      const s = window.__game.sim, p = s.p;
      for (let i = 0; i < s.ePool.high; i++) if (s.eAlive[i]) s.removeEnemy(i);
      s.invulnerable = true;
      p.face = 0;
      for (let k = 0; k < 6; k++) {
        s.spawnEnemy(0, p.x + 230 + (k % 3) * 40, p.y - 50 + (k >> 1) * 30);
        s.spawnEnemy(0, p.x - 200 - (k % 3) * 40, p.y - 50 + (k >> 1) * 30);
      }
    });
    await wait(1100);
    await shot('fire-both.png');
    await sim(() => { window.__game.sim.invulnerable = false; });

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

    /* Evolution: Arc Bolt at level 5 plus Overclock must offer the evolved
       card, and picking it must swap the weapon. */
    await sim(() => {
      const s = window.__game.sim;
      s.invulnerable = true;
      for (let k = 0; k < 4; k++) s.addWeapon('bolt');
      s.addPassive('haste');
      s.pendingLevels = 1;
    });
    await wait(1500);
    const evo = await sim(() => ({
      card: !!document.querySelector('#levelup .card.evo'),
      text: (document.querySelector('#levelup .card.evo .name') || {}).textContent
    }));
    check('a maxed weapon and its passive offer an evolution', evo.card, evo.text || 'no evolution card');
    if (evo.card) {
      await page.tap('#levelup .card.evo');
      await wait(600);
    }
    const evolved = await sim(() => window.__game.sim.weapons[0].def.id);
    check('picking it evolves the weapon', evolved === 'lance', evolved);

    /* Every weapon type at once against every enemy type. */
    const arsenal = await sim(() => {
      const s = window.__game.sim, p = s.p;
      p.xpNext = 1e9;
      /* an elite's cache would put a card over the photo */
      s.holdChoices = true;
      for (const w of ['chain', 'missiles', 'laser', 'gravity', 'flame']) {
        for (let k = 0; k < 3; k++) s.addWeapon(w);
      }
      const types = ['chaser', 'swarmer', 'dasher', 'tank', 'splitter', 'shooter', 'warden', 'bomber', 'blinker', 'elite'];
      const idx = window.__enemyIndex;
      for (let i = 0; i < 260; i++) {
        const a = Math.random() * Math.PI * 2, d = 140 + Math.random() * 320;
        s.spawnEnemy(idx[types[i % types.length]], p.x + Math.cos(a) * d, p.y + Math.sin(a) * d);
      }
      return s.weapons.map(w => w.def.id).join(',');
    });
    await wait(3500);
    await shot('arsenal.png');
    const fired = await sim(() => ({ shots: window.__game.sim.sPool.count, kills: window.__game.sim.p.kills }));
    check('six weapons firing at ten enemy types', arsenal.split(',').length === 6, `${arsenal}; ${fired.shots} shots live`);

    /* A boss: arrives, gets a health bar. */
    await sim(() => {
      const s = window.__game.sim;
      s.spawnEnemy(window.__enemyIndex.hive, s.p.x + 220, s.p.y - 120);
    });
    await wait(3000);
    const boss = await sim(() => ({
      bar: document.getElementById('bossbar').classList.contains('on'),
      name: document.querySelector('#bossbar .name').textContent
    }));
    check('a boss shows its health bar', boss.bar && boss.name === 'THE HIVE', JSON.stringify(boss));
    await shot('boss.png');

    /* Beating the final boss ends the run as a win. */
    await sim(() => {
      const s = window.__game.sim;
      const m = s.spawnEnemy(window.__enemyIndex.monolith, s.p.x + 300, s.p.y);
      s.hitEnemy(m, 1e9, 0, 0);
    });
    await wait(2600);
    const won = await sim(() => ({
      won: window.__game.sim.won,
      title: document.querySelector('#over .title').textContent
    }));
    check('killing the Monolith wins the run', won.won && won.title === 'HOLDOUT COMPLETE', JSON.stringify(won));
    await shot('won.png');

    /* Progression: the run paid out and was saved; evolving unlocked the
       Specter. */
    const paid = await sim(() => ({
      earned: document.querySelector('#over .earned').textContent,
      unlocks: [...document.querySelectorAll('#over .unlocks div')].map(d => d.textContent),
      credits: JSON.parse(localStorage.getItem('holdout.save') || '{}').credits || 0
    }));
    check('a finished run pays credits and saves them', /^\+\d+ CREDITS/.test(paid.earned) && paid.credits > 0,
      `${paid.earned}, saved ${paid.credits}`);
    check('evolving a weapon unlocks the Specter', paid.unlocks.some(u => u.includes('SPECTER')), paid.unlocks.join(' | '));

    await page.tap('#over .menu');
    await wait(800);
    const title = await sim(() => [...document.querySelectorAll('#title .ship')].map(b => ({
      name: b.querySelector('.n').textContent, locked: b.classList.contains('locked')
    })));
    check('title offers three ships, unlocked ones selectable',
      title.length === 3 && !title[2].locked && title[1].locked, JSON.stringify(title));

    /* Buy an upgrade, then reload: it must still be there. */
    await sim(() => { window.__game.save.credits = 5000; });
    await page.tap('#title .shop-open');
    await wait(500);
    await page.tap('#shop .up button');
    await wait(300);
    await shot('shop.png');
    await page.tap('#shop .shop-close');
    await wait(300);
    await page.tap('#title .ship:nth-child(3)');
    await wait(300);
    await page.tap('#title .seg[data-diff="easy"]');
    await wait(300);
    await page.reload();
    for (let i = 0; i < 60; i++) {
      if (await page.evaluate(() => window.__ready === true)) break;
      await wait(1000);
    }
    await wait(1500);
    const kept = await sim(() => {
      const s = window.__game.save;
      return { hull: s.upgrades.hull || 0, credits: s.credits, ship: s.character, diff: s.difficulty,
        segOn: (document.querySelector('#title .seg.on') || {}).textContent };
    });
    check('upgrades, credits, ship and difficulty survive a reload',
      kept.hull === 1 && kept.credits < 5000 && kept.credits > 0 && kept.ship === 'specter' &&
      kept.diff === 'easy' && kept.segOn === 'EASY', JSON.stringify(kept));
    await shot('title-progress.png');

    /* Once seen, the guide stays closed - and the title button reopens it. */
    const guideAfterReload = await sim(() => document.getElementById('howto').classList.contains('on'));
    await page.tap('#title .howto-open');
    await wait(500);
    const reopened = await sim(() => document.getElementById('howto').classList.contains('on'));
    await page.tap('#howto .skip');
    await wait(400);
    check('the guide stays closed after a reload and opens from the title',
      !guideAfterReload && reopened, JSON.stringify({ guideAfterReload, reopened }));

    /* The chosen ship is what deploys, with the upgrade applied. */
    await page.tap('#title .start');
    await wait(1000);
    const ship = await sim(() => {
      const s = window.__game.sim;
      /* a chaser spawned now should have easy's reduced health */
      const e = s.spawnEnemy(0, s.p.x + 600, s.p.y);
      const hp = s.eMaxHp[e];
      s.removeEnemy(e);
      return { id: s.char.id, weapon: s.weapons[0].def.id, maxHp: s.p.maxHp, base: s.char.hp,
        diff: s.diff.id, chaserHp: +hp.toFixed(2), badge: document.querySelector('#hud .badge').textContent };
    });
    check('EASY deploys with weaker enemies and a badge',
      ship.diff === 'easy' && ship.chaserHp < 10 && ship.badge.includes('EASY'), JSON.stringify(ship));
    check('the Specter deploys with its own weapon and the hull upgrade',
      ship.id === 'specter' && ship.weapon === 'chain' && ship.maxHp === ship.base + 10, JSON.stringify(ship));

    /* Rerolls: bought rerolls show on the cards and replace them. */
    await sim(() => { const s = window.__game.sim; s.rerolls = 1; s.p.xp = s.p.xpNext; });
    await wait(1500);
    const before2 = await sim(() => window.__game.sim.choices && window.__game.sim.choices.map(c => c.id).join());
    const rr = await sim(() => document.querySelector('#levelup .reroll').classList.contains('on'));
    if (rr) await page.tap('#levelup .reroll');
    await wait(500);
    const after2 = await sim(() => ({ left: window.__game.sim.rerolls, shown: document.querySelectorAll('#levelup .card').length }));
    check('a reroll replaces the cards', rr && after2.left === 0 && after2.shown === 3, `${before2} (rerolls left ${after2.left})`);

    /* The arena changes at 5:00 and 10:00. */
    await sim(() => {
      const g = window.__game, s = g.sim;
      /* clear any card left from the reroll step, so the arena is in shot */
      s.choices = null;
      s.pendingLevels = 0;
      s.pendingCache = 0;
      g.levelUp.hide();
      g.input.setEnabled(true);
      s.invulnerable = true;
      s.p.xpNext = 1e9;
      s.holdChoices = true;
      s.time = 299.9;
    });
    await wait(6000);
    const ember = await sim(() => ({ zone: window.__game.sim.zone, bg: window.__game.view.background.zone,
      banner: document.getElementById('banner').textContent }));
    await shot('arena-ember.png');
    await sim(() => { window.__game.sim.time = 569.9; });
    await wait(6000);
    const voidZ = await sim(() => ({ zone: window.__game.sim.zone, bg: window.__game.view.background.zone,
      banner: (window.__banners || []).includes('THE VOID') ? 'THE VOID' : '' }));
    await shot('arena-void.png');
    check('the arena changes at 5:00 and 9:30', ember.bg === 1 && ember.banner === 'EMBER' &&
      voidZ.bg === 2 && voidZ.banner === 'THE VOID', JSON.stringify([ember, voidZ]));

    /* An elite off screen gets an arrow at the edge. */
    const marked = await sim(async () => {
      const s = window.__game.sim;
      s.spawnEnemy(window.__enemyIndex.elite, s.p.x + 1100, s.p.y);
      await new Promise(r => setTimeout(r, 1500));
      return window.__game.view.markers.n;
    });
    check('an off-screen elite gets an edge marker', marked > 0, `${marked} marker(s)`);

    /* The NUMBERS toggle silences damage numbers. */
    const quiet = await sim(async () => {
      const g = window.__game;
      g.save.settings.numbers = false;
      g.view.showNumbers = false;
      g.view.nN = 0;
      const s = g.sim;
      for (let i = 0; i < 20; i++) {
        const e = s.spawnEnemy(0, s.p.x + 60, s.p.y);
        s.hitEnemy(e, 3, 0, 0);
      }
      await new Promise(r => setTimeout(r, 800));
      const n = g.view.nN;
      g.view.showNumbers = true;
      g.save.settings.numbers = true;
      return n;
    });
    check('the NUMBERS toggle hides damage numbers', quiet === 0, `${quiet} on screen`);

    /* Installable: the manifest loads and the offline worker registers. */
    const pwa = await sim(async () => {
      const m = await fetch('manifest.json').then(r => r.json()).catch(() => null);
      for (let i = 0; i < 20 && !window.__sw; i++) await new Promise(r => setTimeout(r, 250));
      const reg = await navigator.serviceWorker.getRegistration();
      return { manifest: !!(m && m.icons && m.icons.length >= 3), sw: window.__sw || 'none', reg: !!reg };
    });
    check('installable: manifest and offline worker', pwa.manifest && pwa.sw === 'registered' && pwa.reg, JSON.stringify(pwa));

    /* Landscape: the level-up cards must fit a phone on its side. */
    await page.setViewportSize({ width: 844, height: 390 });
    await wait(1500);
    await sim(() => { const s = window.__game.sim; s.invulnerable = true; s.p.xp = s.p.xpNext; });
    await wait(1800);
    const land = await sim(() => {
      const cards = [...document.querySelectorAll('#levelup .card')];
      const panel = document.querySelector('#levelup .panel');
      const last = cards[cards.length - 1];
      return {
        cards: cards.length,
        fits: !!last && (last.getBoundingClientRect().bottom <= innerHeight || panel.scrollHeight > panel.clientHeight)
      };
    });
    await shot('landscape.png');
    check('level-up cards fit a landscape phone', land.cards === 3 && land.fits, JSON.stringify(land));

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
