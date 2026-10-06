/* TILT LAB - trace a level headless: where every ball is, every 0.25 s.
 *   node --experimental-strip-types tools/probe.ts <level 1-6> ['[[0,1],[2,-1]]']
 */
import { Lab } from '../src/core/physics.ts';
import { LEVELS } from '../src/levels/levelLoader.ts';
const level = LEVELS[+(process.argv[2] || 1) - 1];
const sol = process.argv[3] ? JSON.parse(process.argv[3]) : level.solution;
const lab = new Lab(level);
let next = 0;
while (lab.time < +(process.argv[4] || 12) && lab.state === 'play') {
  lab.input = Lab.inputAt(sol, lab.time);
  lab.step();
  for (const e of lab.events.splice(0)) if (e.t !== 'impact') console.log('   ', e.t, JSON.stringify(e).slice(0, 90));
  if (lab.time >= next) {
    next += 0.25;
    console.log(lab.time.toFixed(2), 'in', String(lab.input).padStart(4), lab.balls.map(b => `${b.colour[0]} ${b.x.toFixed(0)},${b.y.toFixed(0)} v${b.speed.toFixed(0)}`).join('  '));
  }
}
console.log('state', lab.state, lab.time.toFixed(2));
