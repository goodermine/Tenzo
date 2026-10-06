# TILT LAB

A bright 2D physics puzzle game for the browser. You never touch the balls:
you tilt the whole lab, gravity follows, and every ball rolls, drops and
bounces its own way. Get each coloured ball into its matching cup.

Open `index.html` over http (for example `python3 -m http.server`) and play.

## Controls

| | |
| --- | --- |
| Keyboard | **A / D** or **← →** tilt · **R** restart · **Esc** pause |
| Mouse / touch | drag left or right anywhere |
| Touch | hold the big arrow buttons |
| Phone tilt | the phone button in the HUD: tilt the phone itself (calibrates to how you hold it) |

## This build: the prototype and the World 1 MVP

Six labs, one idea each, then **WORLD CLEAR**:

| # | Lab | The idea |
| --- | --- | --- |
| 1 | ROLL | tilting moves the ball |
| 2 | SWITCHBACK | reversing: right, left, right |
| 3 | SWING | momentum: rock it to climb what tilt alone cannot |
| 4 | HEAVY | red is heavy: same tilt, different result |
| 5 | BUTTON | sequencing: press the button first, then go |
| 6 | COUNTERWEIGHT | only red can hold the plate down for yellow |

The prototype chamber plays itself behind the title screen.

## How it works

- **Tilt rotates gravity, not the level.** The geometry never moves inside
  the physics world; tilting turns the gravity vector and the renderer turns
  the chamber by the same angle, so gravity always looks straight down.
  Nothing static sweeps through a ball, and the same inputs always give the
  same result.
- **Physics:** [planck.js](https://github.com/piqnt/planck.js) (Box2D), at a
  fixed 120 Hz: real rolling, stable resting contacts, continuous collision.
  Rails are closed outlines generated from their centre lines, shared by the
  physics and the renderer, so what you see is exactly what the balls hit.
- **Colour is physics.** Each ball type has its own mass, gravity scale,
  rolling resistance and bounce, tuned for play rather than realism
  (`src/entities/types.ts`). Yellow is standard; red is heavy, pulled
  harder and hard to stop. The other colours are defined, waiting for their
  worlds.
- **Levels are data** (`src/levels/data/`): rails, cups, switches, gates and
  pits in a 1000 x 1000 chamber, plus a recorded solution and the obvious
  wrong moves ("traps").
- **Rendering:** Canvas 2D at device pixel ratio, vector every frame; the
  light is fixed to the screen, so highlights and shadows stay put as the lab
  turns. All sound is synthesised with WebAudio.

## Layout

| path | what |
| --- | --- |
| `src/core/` | the lab simulation (no DOM, runs in Node), input |
| `src/entities/` | level types, ball kinds, shared geometry |
| `src/levels/` | the campaign and its level data |
| `src/render/`, `src/effects/` | drawing, palette, particles |
| `src/audio/`, `src/main.ts`, `src/save.ts` | sound; screens and the frame loop; saves |
| `tools/` | level checker, probe, browser verifiers, itch packager, icons |

## Build and test

```bash
npm install
npm run build && npm run typecheck
npm run solve                                   # every level: solution wins, idle and traps don't, timing-robust
npm run probe -- 3 '[[0,1],[2,-1]]'             # trace a level with any input
NODE_PATH=$(npm root -g) node tools/verify.cjs  # phone + desktop in a real browser
npm run package:itch                            # -> release/tilt-lab-itch.zip
NODE_PATH=$(npm root -g) node tools/verify-itch.cjs
```

`npm run solve` is the bar a new level must clear: its recorded solution
wins, doing nothing doesn't, the solution still wins with every input nudged
by up to 80 ms (so it rewards understanding, not frame-perfect luck), and
its traps don't.
