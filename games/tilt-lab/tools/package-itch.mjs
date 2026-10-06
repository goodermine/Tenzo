/* TILT LAB - the itch.io release.
 *
 *   npm run package:itch        -> release/tilt-lab-itch.zip
 *
 * itch.io plays an HTML5 game from a zip with index.html at its root, shown
 * in an iframe on the game's page. This builds the game and zips the files
 * it needs, and nothing else.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'release');
const STAGE = join(OUT, 'tilt-lab-itch');
const ZIP = join(OUT, 'tilt-lab-itch.zip');

execFileSync('npm', ['run', '--silent', 'build'], { cwd: ROOT, stdio: 'inherit' });

rmSync(STAGE, { recursive: true, force: true });
rmSync(ZIP, { force: true });
mkdirSync(join(STAGE, 'dist'), { recursive: true });
for (const f of ['style.css', 'dist/tilt-lab.js', 'fonts', 'icons']) {
  cpSync(join(ROOT, f), join(STAGE, f), { recursive: true });
}
/* no install manifest inside itch's player */
const html = readFileSync(join(ROOT, 'index.html'), 'utf8').replace(/<link rel="manifest"[^>]*>\n/, '');
writeFileSync(join(STAGE, 'index.html'), html);

execFileSync('zip', ['-qr9X', ZIP, '.'], { cwd: STAGE });
const list = execFileSync('unzip', ['-Z1', ZIP], { encoding: 'utf8' }).trim().split('\n');
const kb = Math.round(readFileSync(ZIP).length / 1024);
console.log(`${ZIP}\n${list.length} files, ${kb} KB`);
