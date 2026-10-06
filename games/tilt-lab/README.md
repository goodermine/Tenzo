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

## The campaign: 36 labs in 6 worlds

Each world brings one new idea and builds it up over six labs: introduce,
demonstrate, twist, combine, surprise, master. The first time you enter a
world, a card introduces it; level select pages between worlds, and each
world has its own colours.

| World | New idea | Labs |
| --- | --- | --- |
| 1 TILT | tilting, momentum, red is heavy, buttons | ROLL, SWITCHBACK, SWING, HEAVY, BUTTON, COUNTERWEIGHT |
| 2 GATES | toggles, timers, one-way barriers, bridges | TOGGLE, TIMER, ONE WAY, PAIR, SWITCHYARD, LOCKSTEP |
| 3 WEIGHT | blue is light: fans and see-saws | FLOAT, UPDRAFT, TIPPING, FAN SWITCH, SEESAW LIFT, BALLAST |
| 4 BOUNCE | green bounces: springs, one-shot springs, lime rails | BOING, HIGH BUTTON, RICOCHET, SORTER, ONE SHOT, RELAY |
| 5 MAGNETIC | purple: magnets, repel fields, magnetic rails | CLING, MAGNET, REPEL, PULL, STICKY, HANDOFF |
| 6 MASTER LAB | moving platforms and lifts, everything combined | SHUTTLE, LIFT, CALL, UP AND OVER, LAUNCH LIFT, FINALE |

The labs are meant to be hard: every one after a world's first is checked
against mindless play (see *Build and test*). A wrong move usually costs the
run - a pit, a ball stuck in the wrong cup, a one-shot spring spent - and
**R** restarts instantly.

### The pieces

| Piece | Behaviour |
| --- | --- |
| Cups | padded: whatever lands in one stays; a ball in another colour's cup is stuck |
| Buttons / plates | latch, toggle (flips per crossing), timer (`hold` seconds), weight-only (`minMass`) |
| Gates and bridges | slide away or in when switched; a bridge a switch will bring is drawn as a ghost |
| One-way barriers | pass one way only (teal chevrons) |
| Pits | lose the ball, restart |
| Fans | the same push on every ball, so blue flies and red barely notices |
| See-saws | dynamic planks with seats, weight and limits |
| Springs | throw a ball off their face at a fixed speed; coral springs fire once |
| Lime rails | bounce anything |
| Magnets | pull or push purple; grab it at the core; switchable |
| Magnetic rails | purple hangs from them and rolls along, upside down |
| Platforms | shuttle on their own, or lift while switched; a ball keeps the lift's speed when it stops |

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
  harder and hard to stop; blue is light; green bounces; purple is
  magnetic.
- **Levels are data** (`src/levels/data/world1.ts` ... `world6.ts`): rails,
  cups, switches, gates, platforms, see-saws, fans, springs, magnets and pits
  in a 1000 x 1000 chamber, plus a recorded solution and the obvious wrong
  moves ("traps").
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
npm run solve                                   # all 36 labs against the bar below
npm run solve -- --world 4                      # one world; --level 4-2 for one lab
npm run solve -- easy                           # how easy each lab is
npm run probe -- 4-2 '[[0,1],[2,-1]]'           # trace a lab with any input
node --experimental-strip-types tools/mechanics.ts   # every mechanic in a tiny lab
NODE_PATH=$(npm root -g) node tools/sheet.cjs 4      # contact sheet of a world
NODE_PATH=$(npm root -g) node tools/verify.cjs  # phone + desktop in a real browser
npm run package:itch                            # -> release/tilt-lab-itch.zip
NODE_PATH=$(npm root -g) node tools/verify-itch.cjs
```

`npm run solve` is the bar every lab must clear:

- its recorded solution wins, and still wins with every input nudged by up
  to 80 ms (so it rewards understanding, not frame-perfect luck);
- doing nothing doesn't win, and its traps - the obvious wrong moves - don't;
- unless it is a world's first lab, mindless play can't beat it: holding a
  direction or rocking at a steady beat never wins, switching direction
  once wins for at most 3 of 46 switch times 0.25 s apart, and at most 8% of
  100 random tilt sequences win.

`tools/verify.cjs` plays every lab's solution through the real game loop in
a browser, checks the controls, saving, level select, the world intro cards
and the LAB COMPLETE card, and fails on any runtime error or third-party
request.
