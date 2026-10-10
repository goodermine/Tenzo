/* HOLDOUT - store-page art for itch.io, shot from the real game.
 *
 *   npm run build && NODE_PATH=$(npm root -g) node tools/make-store-art.cjs
 *
 * Boots the game in a headless browser (the same way tools/verify.cjs does),
 * stages a scene through the window.__game hooks and screenshots it:
 *
 *   itch/cover.png                630x500 at 2x - itch's cover size
 *   itch/screens/1-swarm.jpg      portrait 1080x1920 (JPEG, to stay small)
 *   itch/screens/2-evolution.jpg  ...the gold evolution card
 *   itch/screens/3-lance.jpg      ...the evolved Storm Lance in a swarm
 *   itch/screens/4-boss.jpg       ...THE HIVE in THE VOID
 *   itch/screens/5-ember.jpg      ...the EMBER arena
 *   itch/screens/6-landscape.jpg  landscape 1920x1080, for desktop visitors
 */
const { spawn } = require('node:child_process');
const { mkdirSync } = require('node:fs');
const { join, resolve } = require('node:path');

const GAME = process.env.HOLDOUT_DIR || resolve(__dirname, '..');
const OUT = join(resolve(__dirname, '..'), 'itch');
const PORT = 8100 + (process.pid % 300);
const { chromium } = require('playwright');
const wait = ms => new Promise(r => setTimeout(r, ms));

/* A returning player: guide and tips already seen, every ship open. */
const SAVE = JSON.stringify({
  version: 1, credits: 1840, character: 'vanguard', difficulty: 'normal',
  unlocked: { characters: ['vanguard', 'bastion', 'specter'], weapons: [] },
  totals: { runs: 23, kills: 31000, seconds: 12000, wins: 2 },
  seen: { guide: true, move: true, gems: true, pick: true }
});

const PORTRAIT = { viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

/* Fill the arena around the ship with a mixed swarm. */
function swarm(n, kinds, rMin, rMax) {
  const s = window.__game.sim, p = s.p, idx = window.__enemyIndex;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, d = rMin + Math.random() * (rMax - rMin);
    s.spawnEnemy(idx[kinds[i % kinds.length]], p.x + Math.cos(a) * d, p.y + Math.sin(a) * d);
  }
}

/* Each scene: [file, context options, staging steps in the page]. */
const SCENES = [
  ['cover.png', { viewport: { width: 630, height: 500 }, deviceScaleFactor: 2 }, async page => {
    await page.evaluate(() => {
      const s = window.__game.sim;
      s.invulnerable = true; s.p.xpNext = 1e9; s.holdChoices = true;
      for (const w of ['orbit', 'orbit', 'orbit', 'nova', 'nova', 'bolt', 'bolt', 'bolt', 'missiles', 'missiles']) s.addWeapon(w);
    });
    await page.evaluate(() => { window.__game.view.showNumbers = false; });
    await page.evaluate(`(${swarm})(240, ['chaser','swarmer','dasher','tank','splitter','shooter'], 170, 520)`);
    await wait(2600);
    await page.addStyleTag({ content: `#hud, #tip, #banner { display: none !important; }
      .cover .logo::after { display: none; }
      .cover { position: fixed; left: 0; right: 0; top: 26px; text-align: center; pointer-events: none; }
      .cover .logo { font-size: 92px; }
      .cover .tag { margin-top: 4px; font: 800 17px Oxanium, sans-serif; letter-spacing: 0.42em; color: #e8f6ff;
        text-shadow: 0 0 12px rgba(127,246,255,0.8); }
      .cover::before { content: ""; position: fixed; inset: 0; z-index: -1;
        background: linear-gradient(180deg, rgba(3,5,10,0.92) 0%, rgba(3,5,10,0.8) 26%, transparent 46%, transparent 78%, rgba(3,5,10,0.55)); }` });
    await page.evaluate(() => {
      const c = document.createElement('div');
      c.className = 'cover';
      c.innerHTML = '<div class="logo" style="animation:none">HOLD<span>OUT</span></div><div class="tag">SURVIVE THE SWARM</div>';
      document.body.append(c);
    });
    await wait(400);
  }],
  ['screens/1-swarm.jpg', PORTRAIT, async page => {
    await page.evaluate(() => {
      const s = window.__game.sim;
      s.invulnerable = true; s.p.xpNext = 1e9; s.holdChoices = true;
      s.time = 250; s.p.level = 17; s.p.kills = 1462;
      for (const w of ['orbit', 'orbit', 'bolt', 'bolt', 'bolt', 'missiles', 'missiles', 'chain']) s.addWeapon(w);
    });
    await page.evaluate(`(${swarm})(240, ['chaser','swarmer','dasher','splitter','shooter','warden','tank'], 150, 520)`);
    await wait(2800);
  }],
  ['screens/2-evolution.jpg', PORTRAIT, async page => {
    await page.evaluate(() => {
      const s = window.__game.sim;
      s.invulnerable = true; s.time = 412; s.p.kills = 2210;
      for (let k = 0; k < 4; k++) s.addWeapon('bolt');
      s.addWeapon('orbit'); s.addWeapon('orbit');
      s.addPassive('haste');
      s.p.level = 21;
    });
    await page.evaluate(`(${swarm})(140, ['chaser','swarmer','tank'], 160, 420)`);
    await wait(1200);
    await page.evaluate(() => { window.__game.sim.pendingLevels = 1; });
    await wait(2200);
  }],
  ['screens/3-lance.jpg', PORTRAIT, async page => {
    await page.evaluate(() => {
      const s = window.__game.sim;
      s.invulnerable = true; s.p.xpNext = 1e9; s.holdChoices = true;
      s.time = 431; s.p.level = 22; s.p.kills = 2388;
      for (let k = 0; k < 4; k++) s.addWeapon('bolt');
      s.addPassive('haste');
      s.addWeapon('orbit'); s.addWeapon('orbit');
      s.choices = null;
    });
    /* evolve through the real card */
    await page.evaluate(() => { const s = window.__game.sim; s.holdChoices = false; s.pendingLevels = 1; });
    await wait(1800);
    await page.evaluate(() => { const c = document.querySelector('#levelup .card.evo'); if (c) c.click(); });
    await wait(300);
    await page.evaluate(() => { const s = window.__game.sim; s.holdChoices = true; s.p.xpNext = 1e9; });
    await page.evaluate(`(${swarm})(300, ['chaser','swarmer','dasher','splitter'], 150, 460)`);
    await wait(2200);
  }],
  ['screens/4-boss.jpg', PORTRAIT, async page => {
    await page.evaluate(() => {
      const s = window.__game.sim;
      s.invulnerable = true; s.p.xpNext = 1e9; s.holdChoices = true;
      for (const w of ['orbit', 'orbit', 'bolt', 'bolt', 'bolt', 'missiles', 'missiles', 'laser', 'laser']) s.addWeapon(w);
      s.p.level = 29; s.p.kills = 4410;
      s.time = 569.9;
    });
    await wait(5500);
    await page.evaluate(() => {
      const s = window.__game.sim;
      s.spawnEnemy(window.__enemyIndex.hive, s.p.x + 40, s.p.y - 250);
    });
    await page.evaluate(`(${swarm})(160, ['swarmer','chaser','blinker','shooter'], 180, 460)`);
    await wait(3200);
  }],
  ['screens/5-ember.jpg', PORTRAIT, async page => {
    await page.evaluate(() => {
      const s = window.__game.sim;
      s.invulnerable = true; s.p.xpNext = 1e9; s.holdChoices = true;
      for (const w of ['orbit', 'orbit', 'bolt', 'bolt', 'bolt', 'scatter', 'scatter', 'glaive']) s.addWeapon(w);
      s.p.level = 19; s.p.kills = 1980;
      s.time = 299.9;
    });
    await wait(1500);
    await page.evaluate(`(${swarm})(220, ['chaser','bomber','tank','splitter','dasher','shooter'], 160, 500)`);
    await wait(2600);
  }],
  ['screens/6-landscape.jpg', { viewport: { width: 960, height: 540 }, deviceScaleFactor: 2 }, async page => {
    await page.evaluate(() => {
      const s = window.__game.sim;
      s.invulnerable = true; s.p.xpNext = 1e9; s.holdChoices = true;
      s.time = 340; s.p.level = 24; s.p.kills = 2954;
      for (const w of ['orbit', 'orbit', 'orbit', 'chain', 'chain', 'bolt', 'bolt', 'glaive', 'glaive', 'drones']) s.addWeapon(w);
    });
    await page.evaluate(`(${swarm})(480, ['chaser','swarmer','dasher','tank','splitter','shooter','bomber'], 160, 640)`);
    await wait(2800);
  }]
];

(async () => {
  mkdirSync(join(OUT, 'screens'), { recursive: true });
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'],
    { cwd: GAME, stdio: 'ignore' });
  await wait(1500);
  const browser = await chromium.launch({
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader']
  });
  try {
    for (const [file, opts, stage] of SCENES) {
      const context = await browser.newContext(opts);
      await context.addInitScript(save => {
        if (!localStorage.getItem('holdout.save')) localStorage.setItem('holdout.save', save);
      }, SAVE);
      const page = await context.newPage();
      page.setDefaultTimeout(60000);
      page.on('pageerror', e => console.error(`${file}: ${e.message}`));
      await page.goto(`http://127.0.0.1:${PORT}/index.html`);
      for (let i = 0; i < 60; i++) {
        if (await page.evaluate(() => window.__ready === true)) break;
        await wait(1000);
      }
      await wait(1200);
      await page.click('#title .start');
      await wait(1600);
      await stage(page);
      await page.screenshot(file.endsWith('.jpg')
        ? { path: join(OUT, file), type: 'jpeg', quality: 90 }
        : { path: join(OUT, file) });
      console.log('wrote itch/' + file);
      await context.close();
    }
  } finally {
    await browser.close();
    server.kill();
  }
})();
