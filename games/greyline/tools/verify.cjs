/* Greyline - headless verification.
 *
 *   node tools/verify.cjs [outputDir]
 *
 * Needs Playwright with Chromium. It is not a dependency of the game, so
 * install it globally and point NODE_PATH at it:
 *
 *   NODE_PATH=$(npm root -g) node tools/verify.cjs /tmp/greyline-shots
 *
 * The only browser available in CI here is Chromium on SwiftShader, a
 * software rasteriser, so this checks that the scene is correct - assets
 * loaded, lighting wired, passes running, mission reachable - and never how
 * fast it is. Frame rate has to be measured on real hardware.
 *
 * CommonJS on purpose: NODE_PATH only applies to CommonJS resolution, so an
 * .mjs version cannot find a globally installed Playwright.
 */
const { spawn } = require('node:child_process');
const { existsSync, mkdirSync, openSync } = require('node:fs');
const { join, resolve } = require('node:path');

const GAME = resolve(__dirname, '..');
const OUT = process.argv[2] || join(GAME, '.verify');
/* A fixed port silently hands the test to a stale server left over from an
   earlier run, which then serves whatever that run was testing. */
const PORT = 8300 + (process.pid % 400);

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  console.error('playwright not found. See the header of this file.');
  process.exit(2);
}

const failures = [];
function check(name, ok, detail) {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failures.push(name);
}

(async () => {
  if (!existsSync(join(GAME, 'dist/greyline.js'))) {
    console.error('dist/greyline.js missing - run `npm run build` first.');
    process.exit(2);
  }
  mkdirSync(OUT, { recursive: true });

  const logFd = openSync(join(OUT, 'access.log'), 'w');
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'],
    { cwd: GAME, stdio: ['ignore', logFd, logFd] });
  await new Promise(r => setTimeout(r, 2000));
  const up = await fetch(`http://127.0.0.1:${PORT}/index.html`).catch(() => null);
  if (!up || !up.ok) {
    console.error('could not serve the game on port ' + PORT);
    server.kill('SIGKILL');
    process.exit(2);
  }

  const browser = await chromium.launch({
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader']
  });
  const page = await browser.newPage({ viewport: { width: 1000, height: 560 } });

  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => {
    /* The browser asks for a favicon on its own; the game never requests it. */
    if (m.type() === 'error' && !m.text().includes('favicon')) errors.push('console: ' + m.text().slice(0, 300));
  });

  try {
    await page.goto(`http://127.0.0.1:${PORT}/index.html`);

    let ready = false;
    for (let i = 0; i < 100 && !ready; i++) {
      ready = await page.evaluate(() => window.__ready === true);
      if (!ready) await new Promise(r => setTimeout(r, 5000));
    }
    check('boots', ready);
    if (!ready) throw new Error('boot did not complete');

    const scene = await page.evaluate(() => {
      const w = window.__world, e = window.__engine;
      const scanned = {};
      for (const [name, mat] of Object.entries(w.materials)) {
        if (mat && mat.map && mat.map.isCompressedTexture) {
          scanned[name] = `${mat.map.image.width}px` +
            (mat.aoMap ? '+orm' : '') + (mat.normalMap ? '+n' : '');
        }
      }
      const f = w.facility;
      return {
        scanned,
        fallbacks: w.materialLibrary ? w.materialLibrary.usedFallback : ['no library'],
        envIsHDRI: !!e.envIsHDRI,
        volumetrics: !!e.volumetrics && e.volumetrics.enabled,
        dust: !!e.dust && e.dust.points.visible,
        skylights: f.skylights ? f.skylights.length : 0,
        shadowedSpots: window.__state().enemies ? undefined : undefined,
        textures: e.renderer.info.memory.textures,
        geometries: e.renderer.info.memory.geometries,
        calls: e.renderer.info.render.calls,
        triangles: e.renderer.info.render.triangles,
        objectives: f.alarms.length > 0 && !!f.extraction && !!f.entry
      };
    });

    check('scanned materials load', Object.keys(scene.scanned).length >= 7,
      Object.keys(scene.scanned).join(','));
    check('no procedural fallbacks', scene.fallbacks.length === 0, JSON.stringify(scene.fallbacks));
    check('HDRI environment active', scene.envIsHDRI);
    check('volumetric pass enabled', scene.volumetrics);
    check('dust motes present', scene.dust);
    check('skylights cut into the roof', scene.skylights > 0, scene.skylights + ' openings');
    check('mission markers built', scene.objectives);

    /* Budgets. These catch a texture or geometry blow-up on a machine with no
       GPU to notice it on - the draw-call count is what the per-material merge
       exists to keep down. */
    check('texture count sane', scene.textures < 90, scene.textures + ' textures');

    await page.evaluate(() => window.__start());
    await page.waitForTimeout(8000);
    await page.screenshot({ path: join(OUT, 'street.png') });

    /* Render counters reset every render() call, so reading them after the
       composer reports its last fullscreen pass - one quad - rather than the
       scene. Draw the scene on its own to get the real figures. */
    const drawn = await page.evaluate(() => {
      const e = window.__engine;
      e.renderer.setRenderTarget(null);
      e.renderer.render(e.scene, e.camera);
      const i = e.renderer.info;
      return { calls: i.render.calls, triangles: i.render.triangles };
    });
    /* Thresholds are regression guards set above what the level actually
       costs today (~217 calls, ~234k triangles), not targets. Both figures
       include the three shadow maps - the sun and two interior spotlights -
       each of which redraws every caster. */
    check('draw calls sane', drawn.calls < 300, drawn.calls + ' calls');
    check('triangle count sane', drawn.triangles < 350e3, drawn.triangles + ' triangles');

    /* Down the long corridor: the skylights ahead put sunlight on the floor. */
    await page.evaluate(() => {
      const f = window.__world.facility, p = window.__state().player;
      const c = f.worldPos(14, 7);
      p.pos.set(c.x, 1.0, c.z); p.yaw = Math.PI / 2; p.pitch = 0.10;
    });
    await page.waitForTimeout(8000);
    await page.screenshot({ path: join(OUT, 'corridor.png') });

    /* A* still has to cross the plan now that skylight cells are in it. */
    const nav = await page.evaluate(() => {
      const f = window.__world.facility;
      /* path() takes world positions and does its own grid lookup. */
      const path = f.path(f.entry, f.extraction);
      return { found: !!path, length: path ? path.length : 0 };
    }).catch(e => ({ found: false, error: String(e) }));
    check('navigation crosses the level', nav.found, nav.length ? nav.length + ' nodes' : nav.error || '');

    /* Every preset has to survive being switched into, including the ones
       that turn passes off and resize their targets. */
    for (const q of ['low', 'medium', 'high']) {
      const before = errors.length;
      await page.evaluate(quality => window.__setQuality && window.__setQuality(quality), q);
      await page.waitForTimeout(2500);
      check(`quality preset: ${q}`, errors.length === before,
        errors.slice(before).join(' | '));
    }

    await page.setViewportSize({ width: 700, height: 900 });
    await page.waitForTimeout(2500);
    check('resize', true);

    check('no runtime errors', errors.length === 0, errors.slice(0, 3).join(' | '));

    console.log('\nscene: ' + JSON.stringify(scene.scanned));
    console.log(`textures=${scene.textures} geometries=${scene.geometries} ` +
      `calls=${drawn.calls} triangles=${drawn.triangles}`);
    console.log('screenshots in ' + OUT);
  } finally {
    await browser.close();
    server.kill('SIGKILL');
  }

  if (failures.length) {
    console.error(`\n${failures.length} check(s) failed: ${failures.join(', ')}`);
    process.exit(1);
  }
  console.log('\nall checks passed');
})();
