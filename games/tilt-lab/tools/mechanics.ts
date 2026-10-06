/* TILT LAB - every mechanic, tested alone in a tiny lab, headless.
 *
 *   node --experimental-strip-types tools/mechanics.ts
 */
import { Lab } from '../src/core/physics.ts';
import type { LevelDef } from '../src/entities/types.ts';

const failures: string[] = [];
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failures.push(name);
}

/** A lab with a floor at 880 and whatever else the test needs. */
function lab(extra: Partial<LevelDef>): Lab {
  return new Lab({
    id: 't', name: 'T', solution: [[0, 0]], targets: [], balls: [],
    rails: [{ pts: [[30, 880], [970, 880]] }], ...extra
  } as LevelDef);
}
function run(l: Lab, seconds: number, input = 0, each?: () => void) {
  const end = l.time + seconds;
  while (l.time < end) { l.input = input; l.step(); l.events.length = 0; each?.(); }
}

/* fan: the same push lifts light blue far higher than heavy red */
{
  const l = lab({
    balls: [{ colour: 'blue', x: 300, y: 818 }, { colour: 'red', x: 700, y: 818 }],
    fans: [{ x: 200, y: 300, w: 600, h: 580, dir: [0, -1], strength: 30 }]
  });
  let topBlue = 1e9, topRed = 1e9;
  run(l, 2, 0, () => { topBlue = Math.min(topBlue, l.balls[0].y); topRed = Math.min(topRed, l.balls[1].y); });
  check('a fan lifts blue, and barely moves red', topBlue < 600 && topRed > 790, `blue rose to ${topBlue.toFixed(0)}, red to ${topRed.toFixed(0)}`);
}

/* spring: a ball dropped on a pad is launched back up, higher than it fell */
{
  const l = lab({ balls: [{ colour: 'yellow', x: 500, y: 700 }], springs: [{ a: [440, 850], b: [560, 850], power: 1300 }] });
  let top = 1e9, launched = 0;
  run(l, 2, 0, () => { if (l.time > 0.2) top = Math.min(top, l.balls[0].y); });
  const l2 = lab({ balls: [{ colour: 'yellow', x: 500, y: 700 }], springs: [{ a: [440, 850], b: [560, 850], power: 1300 }] });
  l2.events.length = 0;
  for (let i = 0; i < 240; i++) { l2.step(); launched += l2.events.filter(e => e.t === 'spring').length; l2.events.length = 0; }
  check('a spring launches a ball higher than it fell from', top < 600 && launched > 0, `rose to ${top.toFixed(0)}, ${launched} launch(es)`);
}

/* one-shot spring: fires once, then the ball just lands on it */
{
  const l = lab({ balls: [{ colour: 'yellow', x: 500, y: 700 }], springs: [{ a: [440, 850], b: [560, 850], power: 1300, once: true }] });
  let launches = 0;
  for (let i = 0; i < 600; i++) { l.step(); launches += l.events.filter(e => e.t === 'spring').length; l.events.length = 0; }
  check('a one-shot spring launches once, then lies flat', launches === 1 && l.springs[0].used && l.balls[0].speed < 30,
    `${launches} launch(es), ball speed ${l.balls[0].speed.toFixed(0)}`);
}

/* toggle: each press flips it */
{
  const l = lab({
    balls: [{ colour: 'yellow', x: 300, y: 818 }],
    switches: [{ id: 's', a: [480, 856], b: [560, 856], toggle: true }]
  });
  const states: boolean[] = [];
  run(l, 2.2, 1); states.push(l.switches[0].active);
  run(l, 3, -1); states.push(l.switches[0].active);
  check('a toggle flips on each press (over it and back = on, off)', states[0] === true && states[1] === false, JSON.stringify(states));
}

/* timer: on while pressed, and for `hold` seconds after */
{
  const l = lab({
    balls: [{ colour: 'yellow', x: 520, y: 700 }],
    switches: [{ id: 's', a: [480, 856], b: [560, 856], hold: 1.5 }]
  });
  run(l, 0.8, 0);
  const pressed = l.switches[0].active;
  run(l, 1.2, 1);
  const after = l.switches[0].active;
  run(l, 2.0, 1);
  const later = l.switches[0].active;
  check('a timed switch stays on after release, then turns off', pressed && after && !later, JSON.stringify([pressed, after, later]));
}

/* inverted gate: open until pressed */
{
  const l = lab({
    balls: [{ colour: 'yellow', x: 520, y: 700 }],
    switches: [{ id: 's', a: [480, 856], b: [560, 856] }],
    gates: [{ a: [800, 600], b: [800, 850], slide: [0, -300], by: ['s'], invert: true }]
  });
  const start = l.gates[0].open;
  run(l, 1.5, 0);
  check('an inverted gate starts open and closes when pressed', start === 1 && l.gates[0].open === 0, `${start} -> ${l.gates[0].open}`);
}

/* one-way: through to the right, not back */
{
  const l = lab({
    balls: [{ colour: 'yellow', x: 300, y: 818 }],
    rails: [{ pts: [[30, 880], [970, 880]] }, { pts: [[500, 700], [500, 860]], oneWay: [1, 0] }]
  });
  run(l, 2.5, 1);
  const through = l.balls[0].x > 520;
  run(l, 3, -1);
  const stopped = l.balls[0].x > 520;
  check('a one-way barrier lets a ball through one way, not back', through && stopped, `x ${l.balls[0].x.toFixed(0)}`);
}

/* magnet: pulls purple, ignores yellow */
{
  const l = lab({
    balls: [{ colour: 'purple', x: 300, y: 818 }, { colour: 'yellow', x: 700, y: 818 }],
    magnets: [{ x: 300, y: 560, r: 420, strength: 60 }, { x: 700, y: 560, r: 420, strength: 60 }]
  });
  run(l, 1.5, 0);
  check('a magnet pulls purple up against its core and ignores yellow', Math.hypot(l.balls[0].x - 300, l.balls[0].y - 560) < 80 && l.balls[1].y > 800,
    `purple y ${l.balls[0].y.toFixed(0)}, yellow y ${l.balls[1].y.toFixed(0)}`);
}

/* magnetic rail: purple hangs from a ceiling and rolls along it */
{
  const l = lab({
    balls: [{ colour: 'purple', x: 300, y: 462 }],
    rails: [{ pts: [[30, 880], [970, 880]] }, { pts: [[100, 400], [900, 400]], magnetic: true }]
  });
  run(l, 1, 0);
  const hang = l.balls[0].y;
  run(l, 1.5, 1);
  check('a magnetic rail holds purple upside down, and it rolls along', hang < 480 && l.balls[0].y < 480 && l.balls[0].x > 400,
    `hangs at y ${hang.toFixed(0)}, now ${l.balls[0].x.toFixed(0)},${l.balls[0].y.toFixed(0)}`);
}

/* moving platform: shuttles and carries a ball */
{
  const l = lab({
    balls: [{ colour: 'yellow', x: 300, y: 500 }],
    gates: [{ a: [200, 580], b: [400, 580], slide: [400, 0], period: 4, platform: true, tray: true }]
  });
  run(l, 2, 0);
  check('a moving platform carries a ball across', l.balls[0].x > 600 && l.balls[0].y < 560, `ball at ${l.balls[0].x.toFixed(0)},${l.balls[0].y.toFixed(0)}`);
}

/* see-saw: red drops on one end, the other end rises */
{
  const l = lab({
    balls: [{ colour: 'red', x: 330, y: 400 }],
    seesaws: [{ pivot: [500, 760], half: 220, limit: 20 }]
  });
  run(l, 1.5, 0);
  check('a see-saw tips down under red', l.seesaws[0].angle < -0.2, `${(l.seesaws[0].angle * 180 / Math.PI).toFixed(1)}°`);
}

/* bouncy rail: a dropped green ball comes back up high */
{
  const l = lab({ balls: [{ colour: 'green', x: 500, y: 300 }], rails: [{ pts: [[30, 880], [970, 880]], bouncy: true }] });
  let low = 0, top = 1e9, hit = false;
  run(l, 2.5, 0, () => { const y = l.balls[0].y; if (y > low) low = y; if (low > 800) hit = true; if (hit && y < top) top = y; });
  check('green on a bouncy rail rebounds most of the way', top < 420, `fell from 300, rebounded to ${top.toFixed(0)}`);
}

if (failures.length) { console.error(`\n${failures.length} failed`); process.exit(1); }
console.log('\nall mechanics work');
