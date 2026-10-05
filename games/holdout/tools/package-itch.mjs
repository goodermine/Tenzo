/* HOLDOUT - the itch.io release.
 *
 *   npm run package:itch        -> release/holdout-itch.zip
 *
 * itch.io plays an HTML5 game from a zip with index.html at its root, in an
 * iframe on the game's page. This builds the game and zips the files it
 * needs. The page is marked as the itch build, which leaves out the offline
 * worker: itch serves every upload from a fresh address, so a cache-first
 * worker there could only ever serve a stale copy.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'release');
const STAGE = join(OUT, 'holdout-itch');
const ZIP = join(OUT, 'holdout-itch.zip');

execFileSync('npm', ['run', '--silent', 'build'], { cwd: ROOT, stdio: 'inherit' });

rmSync(STAGE, { recursive: true, force: true });
rmSync(ZIP, { force: true });
mkdirSync(join(STAGE, 'dist'), { recursive: true });
for (const f of ['style.css', 'dist/holdout.js', 'fonts', 'icons']) {
  cpSync(join(ROOT, f), join(STAGE, f), { recursive: true });
}

let html = readFileSync(join(ROOT, 'index.html'), 'utf8');
/* no install prompt or worker on itch; the page says which build it is */
html = html.replace(/<link rel="manifest"[^>]*>\n/, '');
html = html.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<meta name="holdout-build" content="itch">');
if (!html.includes('holdout-build')) throw new Error('could not mark the itch build');
writeFileSync(join(STAGE, 'index.html'), html);

execFileSync('zip', ['-qr9X', ZIP, '.'], { cwd: STAGE });
const list = execFileSync('unzip', ['-Z1', ZIP], { encoding: 'utf8' }).trim().split('\n');
const kb = Math.round(readFileSync(ZIP).length / 1024);
console.log(`${ZIP}\n${list.length} files, ${kb} KB`);
