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

/* Overridable so a staging copy - the WebP build the artifact host gets, for
   instance - can be checked with the same suite. */
const GAME = process.env.GREYLINE_DIR || resolve(__dirname, '..');
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

/* Teleporting the camera spikes the grade's motion smear, which at the few
   frames a second a software rasteriser manages does not decay before the
   screenshot is taken. Zero it so the shots are legible; it costs nothing on
   real hardware, where it settles in a fraction of a second. */
const SETTLE = `(() => {
  const e = window.__engine;
  e.camera.getWorldDirection(e._prevDir);
  e._velocity.set(0, 0);
  e.grade.uniforms.uVelocity.value.set(0, 0);
})()`;

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
  /* A single frame on a software rasteriser can take longer than Playwright's
     30s default, and a screenshot waits for one. The corridor - volumetrics
     plus two shadow-casting spotlights - is the shot that trips it. */
  page.setDefaultTimeout(180000);

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
        /* Either encoding counts as a scanned material; which one is worth
           reporting, because the WebP path costs about four times the GPU
           memory. */
        const t = mat && mat.map;
        if (!t || !t.image || !t.image.width) continue;
        if (t.isCompressedTexture || t.userData.scanned || w.materialLibrary.usedFallback.indexOf(name) < 0) {
          scanned[name] = `${t.image.width}px ${t.isCompressedTexture ? 'ktx2' : 'webp'}` +
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
    await page.waitForTimeout(2500);

    /* The HUD is DOM over the canvas, so it can go missing without producing
       a single console error - the screenshots just quietly come back
       without it. */
    const hud = await page.evaluate(() => {
      const el = document.querySelector('.ammo');
      if (!el) return { built: false };
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      /* Existing in the DOM is not the same as being on screen: it can be
         display:none, transparent, or laid out past the edge of the view. */
      return {
        built: true,
        display: cs.display, opacity: cs.opacity, visibility: cs.visibility,
        rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        onScreen: r.width > 0 && r.height > 0 && r.x < innerWidth && r.y < innerHeight && r.right > 0 && r.bottom > 0,
        bodyClass: document.body.className,
        loadingDone: document.getElementById('loading').classList.contains('done'),
        overlayShown: document.getElementById('overlay').classList.contains('show')
      };
    });
    check('HUD is on screen', hud.built && hud.onScreen && hud.opacity !== '0' &&
      hud.display !== 'none' && hud.visibility !== 'hidden', JSON.stringify(hud));

    /* Record the spawn before anything moves the camera: the guard shots are
       staged relative to it, and by the time they run the player has been
       teleported indoors. */
    const spawn = await page.evaluate(() => {
      const p = window.__state().player;
      return { x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw };
    });

    await page.waitForTimeout(8000);
    await page.evaluate(SETTLE);
    await page.waitForTimeout(1200);
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
    await page.evaluate(SETTLE);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: join(OUT, 'corridor.png') });

    /* Guard photography, staged on the street rather than indoors. The
       corridors are one or two cells wide, so a camera placed a few metres
       off to the side ends up behind a wall looking at it - which is what
       the first attempt at these shots produced. The street is open, wide
       and lit by the sun. */
    const posed = await page.evaluate(sp => {
      const st = window.__state();
      const g = st.enemies && st.enemies.find(e => e.alive);
      if (!g) return false;
      /* Five metres down the street from the spawn, turned to face back. */
      const fx = -Math.sin(sp.yaw), fz = -Math.cos(sp.yaw);
      g.pos.set(sp.x + fx * 5, sp.y, sp.z + fz * 5);
      g.yaw = sp.yaw;   /* the AI's yaw: +Z forward, so this faces back */
      g.vel.set(0, 0, 0);
      /* Pinned: it would otherwise patrol out of shot between screenshots,
         and into whatever light it found on the way. The stub has to carry
         the transform itself - update() is what normally copies pos and yaw
         onto the mesh, so without this the body stays where it last was
         while its position moves. */
      g.update = () => {
        g.animate(0.016, null);
        g.place();
      };
      window.__testGuard = g;
      return true;
    }, spawn);
    check('a guard exists to look at', posed);

    /* Which body the guards got. The generated rig is a working fallback, so
       a model that failed to load would otherwise pass every other check. */
    const rig = await page.evaluate(() => {
      const g = window.__testGuard;
      if (!g) return null;
      const r = g.rig;
      return {
        source: r.source || 'generated',
        missingClips: r.missingClips || [],
        unresolvedBones: r.unresolvedBones || [],
        hitFrame: r.hitFrame || null,
        speed: r.clipSpeed || null
      };
    });
    if (rig) {
      check('guards use the character model', rig.source === 'gltf', rig.source);
      check('character clips all present', rig.missingClips.length === 0, rig.missingClips.join(', '));
      check('character bones all resolved', rig.unresolvedBones.length === 0, rig.unresolvedBones.join(', '));
      console.log('  rig: ' + JSON.stringify(rig));
    }

    /* theta is a world-space bearing from the guard, 0 being back towards the
       spawn, so every shot stays out in the street. */
    const viewGuard = async (name, { dist, theta, height, pitch, before }) => {
      await page.evaluate(([d, th, h, pi, b]) => {
        const g = window.__testGuard, p = window.__state().player;
        if (b) new Function('g', b)(g);
        p.pos.set(g.pos.x + Math.sin(th) * d, g.pos.y + h, g.pos.z + Math.cos(th) * d);
        p.yaw = th;
        p.pitch = pi;
      }, [dist, theta, height, pitch, before || null]);
      await page.waitForTimeout(6000);
      await page.evaluate(SETTLE);
      await page.waitForTimeout(1200);
      await page.screenshot({ path: join(OUT, name) });
    };

    if (posed) {
      const back = spawn.yaw;   /* bearing from guard back towards the spawn */
      await viewGuard('guard.png', { dist: 3.0, theta: back, height: 0.25, pitch: -0.03 });
      await viewGuard('guard-aim.png', {
        dist: 4.0, theta: back + 0.7, height: 0.45, pitch: -0.09,
        before: 'g.aim = 1; g.state = "engage";'
      });
    }

    /* Fire into a wall so the decal ring and the particle bursts are on
       screen, then photograph it. */
    const fired = await page.evaluate(() => {
      const st = window.__state();
      const w = st.weapon;
      if (!w || !w.decalPool) return false;
      const p = st.player;
      const dir = new window.__THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
      const origin = new window.__THREE.Vector3(p.pos.x, p.pos.y + 1.5, p.pos.z);
      /* Drive the pools directly: routing through the fire path would need
         ammo, cooldowns and a live mission. */
      for (let i = 0; i < 12; i++) {
        const hit = origin.clone().addScaledVector(dir, 2.2 + i * 0.05);
        hit.x += (Math.random() - 0.5) * 0.9;
        hit.y += (Math.random() - 0.5) * 0.7;
        w.spawnImpact(hit, dir.clone().negate());
      }
      return true;
    });
    check('impact effects spawn', fired);
    if (fired) {
      await page.waitForTimeout(2500);
      await page.evaluate(SETTLE);
      await page.waitForTimeout(600);
      await page.screenshot({ path: join(OUT, 'impacts.png') });

      /* Again with the particles hidden: a burst can cover the marks it made,
         and a decal that never drew looks the same as one that did. */
      await page.evaluate(() => {
        const w = window.__state().weapon;
        w.particles.normal.points.visible = false;
        w.particles.additive.points.visible = false;
      });
      await page.waitForTimeout(2000);
      await page.evaluate(SETTLE);
      await page.waitForTimeout(600);
      await page.screenshot({ path: join(OUT, 'decals.png') });
    }

    /* The same guard with the mixer stopped and every bone back at its bind
       rotation. A limb that looks detached here is a geometry fault; one that
       only looks wrong posed is a pose fault. */
    if (posed) {
      await page.evaluate(() => {
        const g = window.__testGuard;
        g.rig.mixer.stopAllAction();
        g.animate = () => {};
        /* The generated rig binds at identity; a downloaded one binds at
           whatever its skeleton was skinned in. */
        if (g.rig.skinned) for (const m of g.rig.skinned) m.skeleton.pose();
        else for (const b of g.rig.bones.values()) b.quaternion.identity();
      });
      await viewGuard('guard-bind.png', { dist: 3.2, theta: spawn.yaw - 0.5, height: 0.35, pitch: -0.06 });
    }

    /* The player's weapons: every model loaded, and aiming puts each one's
       sight line on the screen centre. That last is tedious by eye and
       trivial to assert - the sight line is projected through the camera.
       ADS is pinned at 1 rather than blended in, because a software
       rasteriser manages a few frames a second and the blend is per frame. */
    const vm = await page.evaluate(() => {
      const st = window.__state(), w = st.weapon;
      if (!w.models) return { models: false };
      for (const id of ['pistol_s', 'smg', 'rifle', 'shotgun', 'sniper']) st.loadout.add(id);
      const orig = w.update.bind(w);
      /* Sway, kick, bob and the landing dip are pinned out too: the guard
         shots leave the player dropping from where they were staged, and
         what is being checked is where the sights sit, not the motion. */
      w.update = (dt, p, input) => {
        if (!window.__forceAds) return orig(dt, p, input);
        w.ads = 1;
        w.sway.set(0, 0); w.swayTarget.set(0, 0);
        w.kick = w.kickVel = 0;
        return orig(dt, { ...p, bobAmount: 0, landDip: 0, sprinting: false }, { ...input, ads: true });
      };
      return { models: true, slots: st.loadout.slots.map(s => s.id) };
    });
    check('weapon models loaded', vm.models);
    if (vm.models) {
      /* Back out to the street, clear of the walls. */
      await page.evaluate(sp => {
        const p = window.__state().player;
        p.pos.set(sp.x, sp.y, sp.z); p.yaw = sp.yaw; p.pitch = 0.02;
      }, spawn);
      const worst = {};
      for (let i = 0; i < vm.slots.length; i++) {
        await page.evaluate(i => {
          const w = window.__state().weapon;
          w.switching = 0; w.switchTo(i); w.switching = 0;
          window.__forceAds = true;
        }, i);
        await page.waitForTimeout(2500);
        const off = await page.evaluate(() => {
          const w = window.__state().weapon, e = window.__engine, T = window.__THREE;
          const m = w.models[w.def.id], b = m.box, len = b.max.z - b.min.z;
          const W = innerWidth / 2, H = innerHeight / 2;
          let px = 0;
          for (const z of [b.min.z + 0.1 * len, b.max.z - 0.35 * len]) {
            const q = m.holder.localToWorld(new T.Vector3(0, m.fit.sight, z)).project(e.camera);
            px = Math.max(px, Math.hypot(q.x * W, q.y * H));
          }
          return px;
        });
        worst[vm.slots[i]] = +off.toFixed(1);
        if (vm.slots[i] === 'rifle') {
          await page.evaluate(SETTLE);
          await page.waitForTimeout(600);
          await page.screenshot({ path: join(OUT, 'ads.png') });
        }
      }
      await page.evaluate(() => { window.__forceAds = false; });
      check('ADS puts every sight line on the crosshair',
        Object.values(worst).every(px => px < 4), JSON.stringify(worst) + ' px');
    }

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
