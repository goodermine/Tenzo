# HOLDOUT

A swarm-survival roguelite for phones. Drag anywhere to steer; your weapons
fire on their own. Survive fifteen minutes against waves that build to
hundreds of enemies, two bosses at 10:00 and 15:00, and pick an upgrade from
three cards every level.

Open `index.html` over http (for example `python3 -m http.server`) and play.
On a phone, "Add to Home Screen" installs it full-screen and it then works
offline.

## What's in it

- **13 weapons**, five levels each, and **6 evolutions**: a maxed weapon plus
  the right passive becomes a stronger form, always offered once available.
- **10 passives**, **10 enemy types** (dashers that telegraph, gunners that
  hold range, shielded wardens, bombers whose blasts chain, blinkers that
  show where they will land, elites that drop a supply cache) and **2 bosses**.
- **A How to Play guide**: four swipeable pages, illustrated with the game's
  own sprites, opened on first launch and from the title and pause screens,
  plus one-time tips during your first run (move, gems, picking a card).
- **Guns that cover your path**: the starting Arc Bolt fires ahead of the ship
  and behind it on every volley, and the other aimed weapons prefer targets
  ahead of you, so flying forward clears the way.
- **EASY and NORMAL**: Easy is the same run with a gentler swarm (weaker,
  fewer enemies and softer bosses) for 60% of the credits.
- **Three arenas** as the run goes on — THE GRID, EMBER at 5:00, THE VOID at
  9:30 — with parallax nebula and star-dust, ripples and scorch marks.
- **3 ships**, credits from every run, a **shop of permanent upgrades**
  (including rerolls), and weapons and ships unlocked by playing well.
- Readable in a crowd: enemies have dark bodies under their neon outlines,
  the ship sits in a halo ring that carries its health, enemy bullets and
  tells draw above everything, and off-screen bosses, elites and caches get
  edge markers.
- Feel: hit-pause, trauma-based screen shake, merged damage numbers, bloom,
  shattering kills, staged boss deaths, a slow-motion beat on level-up, vibration where the phone supports it, and
  synthesized sound with music that builds as the fight gets denser.
- Quality steps down by itself on slow devices: bloom, then particles, then
  render resolution.

## Layout

| path | what |
| --- | --- |
| `src/sim/` | the simulation: no DOM or rendering, so it also runs in Node |
| `src/content/` | weapons, enemies, passives, ships, upgrades, unlocks — data tables |
| `src/render/` | the atlas (all art drawn in code) and the view |
| `src/ui/`, `src/main.js` | HUD, cards, menus, the How to Play guide; boot and the frame loop |
| `src/audio.js`, `src/haptics.js`, `src/save.js` | sound, vibration, saves |
| `tools/bot.mjs` | plays seeded runs headless, for balance |
| `tools/verify.cjs` | drives the game on an emulated phone |
| `tools/make-icons.mjs` | home-screen icons |

## Build and test

```bash
npm install
npm run build
node tools/bot.mjs 10 100 17            # sensible picks; --random, --maxed, --easy, --ship=specter
NODE_PATH=$(npm root -g) node tools/verify.cjs /tmp/holdout-shots
```

The bot is what the balance is tuned against. A fresh Vanguard has a median
survival around 9 minutes and occasionally wins; with every shop upgrade,
about 6 runs in 10 beat the final boss.

The verifier runs in a software renderer and says nothing about frame rate.
Turn on **FPS** in the pause menu to check it on a real phone.
